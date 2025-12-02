import frappe
import json
from drive.utils.files import get_home_folder, MIME_LIST_MAP, get_file_type
from .permissions import ENTITY_FIELDS, get_user_access, get_teams
from pypika import Order, Criterion, functions as fn, CustomFunction
from datetime import datetime, timedelta
from frappe.query_builder import Case

DriveUser = frappe.qb.DocType("User")
UserGroupMember = frappe.qb.DocType("User Group Member")
DriveFile = frappe.qb.DocType("Drive File")
DrivePermission = frappe.qb.DocType("Drive Permission")
Team = frappe.qb.DocType("Drive Team")
TeamMember = frappe.qb.DocType("Drive Team Member")
DriveFavourite = frappe.qb.DocType("Drive Favourite")
Recents = frappe.qb.DocType("Drive Entity Log")
DriveEntityTag = frappe.qb.DocType("Drive Entity Tag")
DriveShortcut = frappe.qb.DocType("Drive Shortcut")

Binary = CustomFunction("BINARY", ["expression"])


@frappe.whitelist(allow_guest=True)
def calculate_days_remaining(modified_date):
    """Calculate remaining time before permanent deletion
    Returns:
        str: Remaining time in format:
            - "X days" if more than 24 hours remain
            - "X hours" if less than 24 hours remain
    """
    if not modified_date:
        return "0 giờ"

    # Calculate exact time remaining
    deletion_date = modified_date + timedelta(days=30)
    remaining = deletion_date - datetime.now()
    total_hours = remaining.total_seconds() / 3600

    if total_hours <= 0:
        return "0 giờ"
    elif total_hours < 24:
        return f"{int(total_hours)} giờ"
    else:
        # Calculate full days (rounded down)
        days = int(total_hours // 24)
        return f"{days} ngày"


@frappe.whitelist(allow_guest=True)
def files(
    team,
    entity_name=None,
    order_by="title 1",
    is_active=1,
    limit=20,
    cursor=None,
    favourites_only=0,
    recents_only=0,
    tag_list=[],
    file_kinds=[],
    personal=-1,
    folders=0,
    only_parent=1,
):
    home = get_home_folder(team)["name"]
    field, ascending = order_by.split(" ")
    is_active = int(is_active)
    only_parent = int(only_parent)
    folders = int(folders)
    personal = int(personal)
    ascending = int(ascending)

    if not entity_name:
        # If not specified, get home folder
        entity_name = home
    entity = frappe.get_doc("Drive File", entity_name)

    # Verify that entity exists and is part of the team
    if not entity or entity.team != team:
        frappe.throw(
            f"Not found - entity {entity_name} has team {team} ",
            frappe.exceptions.PageDoesNotExistError,
        )

    # Verify that folder is public or that they have access
    user = frappe.session.user if frappe.session.user != "Guest" else ""
    user_access = get_user_access(entity, user)
    if not user_access["read"]:
        frappe.throw(
            f"Bạn không có quyền truy cập.",
            frappe.exceptions.PageDoesNotExistError,
        )
    query = (
        frappe.qb.from_(DriveFile)
        .where(DriveFile.is_active == is_active)
        .left_join(DrivePermission)
        .on((DrivePermission.entity == DriveFile.name) & (DrivePermission.user == user))
        # Give defaults as a team member
        .select(
            *ENTITY_FIELDS,
            DriveFile.modified,
            DriveFile.is_active,
            fn.Coalesce(DrivePermission.read, user_access["read"]).as_("read"),
            fn.Coalesce(DrivePermission.comment, user_access["comment"]).as_("comment"),
            fn.Coalesce(DrivePermission.share, user_access["share"]).as_("share"),
            fn.Coalesce(DrivePermission.write, user_access["write"]).as_("write"),
        )
        .where(fn.Coalesce(DrivePermission.read, user_access["read"]).as_("read") == 1)
    )
    # Cursor pagination
    if cursor:
        query = query.where(
            (Binary(DriveFile[field]) > cursor if ascending else field < cursor)
        ).limit(limit)

    if only_parent and (not recents_only and not favourites_only):
        query = query.where(DriveFile.parent_entity == entity_name)
    else:
        query = query.where((DriveFile.team == team) & (DriveFile.parent_entity != ""))

    # Get favourites data (only that, if applicable)
    if favourites_only:
        query = query.right_join(DriveFavourite)
    else:
        query = query.left_join(DriveFavourite)
    query = query.on(
        (DriveFavourite.entity == DriveFile.name) & (DriveFavourite.user == frappe.session.user)
    ).select(DriveFavourite.name.as_("is_favourite"))

    # if recents_only:
    #     query = (
    #         query.right_join(Recents)
    #         .on((Recents.entity_name == DriveFile.name) & (Recents.user == frappe.session.user))
    #         .orderby(Recents.last_interaction, order=Order.desc)
    #     )
    # Thay vì LEFT JOIN trực tiếp với Recents, hãy dùng subquery để lấy accessed mới nhất

    # Tìm đoạn này trong code (khoảng dòng 77-99):
    # Thay thế phần query với Recents bằng cách sử dụng subquery
    # Tìm đoạn từ dòng 77-99 và thay thế bằng:

    # Tạo subquery để lấy last_interaction mới nhất cho mỗi entity
    # Subquery để lấy lần truy cập gần nhất của mỗi file
    recent_subquery = (
        frappe.qb.from_(Recents)
        .select(Recents.entity_name, fn.Max(Recents.last_interaction).as_("last_interaction"))
        .groupby(Recents.entity_name)
    ).as_("recent_data")

    if recents_only:
        query = (
            query.right_join(recent_subquery)
            .on(recent_subquery.entity_name == DriveFile.name)
            .orderby(recent_subquery.last_interaction, order=Order.desc)
            .select(recent_subquery.last_interaction.as_("accessed"))
        )
    elif field != "accessed":
        query = (
            query.left_join(recent_subquery)
            .on(recent_subquery.entity_name == DriveFile.name)
            .orderby(DriveFile[field], order=Order.asc if ascending else Order.desc)
            .select(recent_subquery.last_interaction.as_("accessed"))
        )
    else:
        query = query.left_join(recent_subquery).on(recent_subquery.entity_name == DriveFile.name)
        if ascending:
            query = query.orderby(recent_subquery.last_interaction, order=Order.asc)
        else:
            query = query.orderby(recent_subquery.last_interaction, order=Order.desc)
        query = query.select(recent_subquery.last_interaction.as_("accessed"))

    if favourites_only or recents_only:
        query = query.where((DriveFile.is_private == 0) | (DriveFile.owner == frappe.session.user))
    elif not is_active:
        query = query.where((DriveFile.owner == frappe.session.user) & (DriveFile.is_private == 1))

    if personal == 0 or personal == -1:
        query = query.where((DriveFile.is_private == 0))
    elif personal == 1 or personal == -2:
        query = query.where(DriveFile.is_private == 1)
        # Temporary hack: the correct way would be to check permissions on all children
        if entity_name == home:
            query = query.right_join(DriveShortcut)
            query = query.where(
                (DriveFile.owner == frappe.session.user)
                | (
                    (DriveShortcut.is_shortcut == 1)
                    & (DriveShortcut.shortcut_owner == frappe.session.user)
                )
            )

    if tag_list:
        tag_list = json.loads(tag_list)
        query = query.left_join(DriveEntityTag).on(DriveEntityTag.parent == DriveFile.name)
        tag_list_criterion = [DriveEntityTag.tag == tags for tags in tag_list]
        query = query.where(Criterion.any(tag_list_criterion))

    file_kinds = json.loads(file_kinds) if not isinstance(file_kinds, list) else file_kinds
    if file_kinds:
        mime_types = []
        for kind in file_kinds:
            mime_types.extend(MIME_LIST_MAP.get(kind, []))
        criterion = [DriveFile.mime_type == mime_type for mime_type in mime_types]
        if "Folder" in file_kinds:
            criterion.append(DriveFile.is_group == 1)
        query = query.where(Criterion.any(criterion))

    if folders:
        query = query.where(DriveFile.is_group == 1)

    child_count_query = (
        frappe.qb.from_(DriveFile)
        .where((DriveFile.team == team) & (DriveFile.is_active == 1))
        .select(DriveFile.parent_entity, fn.Count("*").as_("child_count"))
        .groupby(DriveFile.parent_entity)
    )
    share_query = (
        frappe.qb.from_(DriveFile)
        .right_join(DrivePermission)
        .on(DrivePermission.entity == DriveFile.name)
        .where((DrivePermission.user != "") & (DrivePermission.user != "$TEAM"))
        .select(DriveFile.name, fn.Count("*").as_("share_count"))
        .groupby(DriveFile.name)
    )
    public_files_query = (
        frappe.qb.from_(DrivePermission)
        .where(DrivePermission.user == "")
        .select(DrivePermission.entity)
    )
    team_files_query = (
        frappe.qb.from_(DrivePermission)
        .where(DrivePermission.user == "$TEAM")
        .select(DrivePermission.entity)
    )
    public_files = set(k[0] for k in public_files_query.run())
    team_files = set(k[0] for k in team_files_query.run())

    children_count = dict(child_count_query.run())
    share_count = dict(share_query.run())
    res = query.run(as_dict=True)
    for r in res:
        r["children"] = children_count.get(r["name"], 0)
        r["file_type"] = get_file_type(r)
        if r["name"] in public_files:
            r["share_count"] = -2
        elif r["name"] in team_files:
            r["share_count"] = -1
        else:
            r["share_count"] = share_count.get(r["name"], 0)
    return res


@frappe.whitelist()
def shared(
    by=0,
    order_by="modified",
    limit=1000,
    tag_list=[],
    mime_type_list=[],
):
    """
    Returns the highest level of shared items shared with/by the current user, group or org

    :param entity_name: Document-name of the folder whose contents are to be listed.
    :raises NotADirectoryError: If this DriveFile doc is not a folder
    :return: List of DriveEntities with permissions
    :rtype: list[frappe._dict]
    """
    by = int(by)
    query = (
        frappe.qb.from_(DriveFile)
        .right_join(DrivePermission)
        .on(
            (DrivePermission.entity == DriveFile.name)
            & ((DrivePermission.owner if by else DrivePermission.user) == frappe.session.user)
        )
        .limit(limit)
        .where((DrivePermission.read == 1) & (DriveFile.is_active == 1))
        .select(
            *ENTITY_FIELDS,
            DriveFile.team,
            DrivePermission.user,
            DrivePermission.owner.as_("sharer"),
            DrivePermission.read,
            DrivePermission.share,
            DrivePermission.comment,
            DrivePermission.write,
        )
    )

    query = query.orderby(
        order_by.split()[0],
        order=Order.desc if order_by.endswith("desc") else Order.asc,
    )

    if tag_list:
        tag_list = json.loads(tag_list)
        query = query.left_join(DriveEntityTag).on(DriveEntityTag.parent == DriveFile.name)
        tag_list_criterion = [DriveEntityTag.tag == tags for tags in tag_list]
        query = query.where(Criterion.any(tag_list_criterion))

    if mime_type_list:
        mime_type_list = json.loads(mime_type_list)
        query = query.where(
            Criterion.any(DriveFile.mime_type == mime_type for mime_type in mime_type_list)
        )

    # Extremely inefficient
    child_count_query = (
        frappe.qb.from_(DriveFile)
        .where((DriveFile.is_active == 1))
        .select(DriveFile.parent_entity, fn.Count("*").as_("child_count"))
        .groupby(DriveFile.parent_entity)
    )
    share_query = (
        frappe.qb.from_(DriveFile)
        .right_join(DrivePermission)
        .on(DrivePermission.entity == DriveFile.name)
        .where((DrivePermission.user != "") & (DrivePermission.user != "$TEAM"))
        .select(DriveFile.name, fn.Count("*").as_("share_count"))
        .groupby(DriveFile.name)
    )
    public_files_query = (
        frappe.qb.from_(DrivePermission)
        .where(DrivePermission.user == "")
        .select(DrivePermission.entity)
    )
    team_files_query = (
        frappe.qb.from_(DrivePermission)
        .where(DrivePermission.user == "$TEAM")
        .select(DrivePermission.entity)
    )
    public_files = set(k[0] for k in public_files_query.run())
    team_files = set(k[0] for k in team_files_query.run())

    children_count = dict(child_count_query.run())
    share_count = dict(share_query.run())
    res = query.run(as_dict=True)
    parents = {r["name"] for r in res}

    for r in res:
        r["children"] = children_count.get(r["name"], 0)
        r["file_type"] = get_file_type(r)
        if r["name"] in public_files:
            r["share_count"] = -2
        elif r["name"] in team_files:
            r["share_count"] = -1
        else:
            r["share_count"] = share_count.get(r["name"], 0)

    return [r for r in res if r["parent_entity"] not in parents]


def apply_favourite_join(query, favourites_only=False, has_shortcut_join=False):
    """
    Áp dụng join với DriveFavourite cho query

    :param query: Query object cần áp dụng favourite join
    :param favourites_only: Chỉ lấy các file được favourite (right join)
    :param has_shortcut_join: Query đã có join với DriveShortcut hay chưa
    :return: Query object đã được áp dụng favourite join
    """
    try:
        # Chọn loại join dựa trên favourites_only
        if favourites_only:
            query = query.right_join(DriveFavourite)
        else:
            query = query.left_join(DriveFavourite)

        # Áp dụng điều kiện join tùy thuộc vào việc có shortcut join hay không
        if has_shortcut_join:
            # Nếu query đã có join với DriveShortcut
            query = query.on(
                (
                    (
                        # Trường hợp không phải shortcut
                        (DriveShortcut.is_shortcut.isnull() | (DriveShortcut.is_shortcut == 0))
                        & (DriveShortcut.name.isnull())
                        & (DriveFavourite.entity == DriveFile.name)
                    )
                    | (
                        # Trường hợp là shortcut
                        (DriveShortcut.is_shortcut == 1)
                        & DriveShortcut.name.isnotnull()
                        & (DriveFavourite.entity_shortcut == DriveShortcut.name)
                    )
                )
                & (DriveFavourite.user == frappe.session.user)
            ).select(DriveFavourite.name.as_("is_favourite"))
        else:
            # Nếu query không có shortcut join
            query = query.on(
                (DriveFavourite.entity == DriveFile.name)
                & (DriveFavourite.user == frappe.session.user)
            ).select(DriveFavourite.name.as_("is_favourite"))

        return query

    except Exception as e:
        print(f"Error in favourite join: {e}")
        # Fallback: chỉ join với entity thường
        if favourites_only:
            query = query.right_join(DriveFavourite)
        else:
            query = query.left_join(DriveFavourite)

        query = query.on(
            (DriveFavourite.entity == DriveFile.name)
            & (DriveFavourite.user == frappe.session.user)
        ).select(DriveFavourite.name.as_("is_favourite"))

        return query


@frappe.whitelist()
def files_multi_team(
    teams=None,
    entity_name=None,
    order_by="title 1",
    is_active=1,
    limit=20,
    cursor=None,
    favourites_only=0,
    recents_only=0,
    tag_list=[],
    file_kinds=[],
    personal=-1,
    folders=0,
    only_parent=1,
):
    """
    Lấy tệp từ nhiều nhóm với logic giống Google Drive
    - personal = 1: Lấy cả file gốc và tất cả shortcuts
    - personal = 0: Chỉ lấy file gốc (không lấy shortcuts)
    - personal = -1: Lấy tất cả (mặc định)

    :param teams: Danh sách tên nhóm phân tách bằng dấu phẩy, hoặc None cho tất cả các nhóm người dùng
    :param entity_name: Tên tài liệu của thư mục mà nội dung của nó sẽ được liệt kê
    :return: Danh sách các DriveEntities với quyền từ nhiều nhóm
    :rtype: list[frappe._dict]
    """

    if not teams:
        # Nếu không có team nào được chỉ định, lấy tất cả các team mà người dùng là thành viên
        user_teams = get_teams()
    else:
        if isinstance(teams, str):
            user_teams = [t.strip() for t in teams.split(",")]
        else:
            user_teams = teams

    # ✅ FIX: Nếu có entity_name, kiểm tra quyền truy cập thay vì filter theo team membership
    if entity_name:
        try:
            entity = frappe.get_doc("Drive File", entity_name)
            user_access = get_user_access(entity, frappe.session.user)

            if not user_access["read"]:
                frappe.throw(
                    "You don't have permission to access this folder", frappe.PermissionError
                )

            # Chỉ query trong team của entity
            user_teams = [entity.team]
            print(f"DEBUG - Entity {entity_name} belongs to team {entity.team}")
            print(f"DEBUG - User has access: {user_access}")
        except frappe.DoesNotExistError:
            return []
    else:
        # Xác minh người dùng có quyền truy cập vào tất cả các nhóm được chỉ định
        accessible_teams = get_teams()
        user_teams = [team for team in user_teams if team in accessible_teams]

    if not user_teams:
        return []

    def safe_int_conversion(value, default=0):
        """Safely convert value to int, handling string boolean values"""
        if isinstance(value, str):
            if value.lower() in ["true", "1"]:
                return 1
            elif value.lower() in ["false", "0"]:
                return 0
            else:
                try:
                    return int(value)
                except ValueError:
                    return default
        try:
            return int(value)
        except (ValueError, TypeError):
            return default

    field, ascending = order_by.split(" ")
    is_active = safe_int_conversion(is_active, 1)
    only_parent = safe_int_conversion(only_parent, 1)
    folders = safe_int_conversion(folders, 0)
    personal = safe_int_conversion(personal, -1)
    ascending = safe_int_conversion(ascending, 1)
    favourites_only = safe_int_conversion(favourites_only, 0)
    recents_only = safe_int_conversion(recents_only, 0)
    user = frappe.session.user if frappe.session.user != "Guest" else ""
    all_results = []

    # Lấy file từ mỗi team
    for team in user_teams:
        try:
            print(f"DEBUG - Processing team: {team}")
            # Get home folder for this team if no entity_name specified
            if not entity_name:
                home = get_home_folder(team)["name"]
                current_entity_name = home
            else:
                current_entity_name = entity_name

            try:
                entity = frappe.get_doc("Drive File", current_entity_name)
                print(f"DEBUG - Entity {current_entity_name} belongs to team: {entity.team}")
                print(f"DEBUG - Currently processing team: {team}")
                # Skip if entity doesn't belong to current team
                if entity.team != team:
                    print(f"DEBUG - Skipping because entity.team ({entity.team}) != team ({team})")
                    continue
                print(f"DEBUG - Entity matches team, continuing...")
            except:
                print(f"DEBUG - Error getting entity: {str(e)}")
                continue

            # Get user access for this entity
            user_access = get_user_access(entity, user)
            print(f"DEBUG - user_access for {current_entity_name}: {user_access}")
            if not user_access["read"]:
                print(f"DEBUG - No read access for {current_entity_name}, skipping")
                continue

            # Tách riêng query cho file gốc và shortcut
            team_results = []

            print(f"DEBUG - Building queries for personal={personal}")

            if personal == 1 or personal == -2 or personal == -3:
                print("DEBUG - Building queries for personal=1 (My Drive)")
                # Query 1: Lấy file gốc thuộc về user
                original_files_query = (
                    frappe.qb.from_(DriveFile)
                    .left_join(DrivePermission)
                    .on(
                        (DrivePermission.entity == DriveFile.name) & (DrivePermission.user == user)
                    )
                    .select(
                        *ENTITY_FIELDS,
                        fn.Coalesce(DrivePermission.read, user_access["read"]).as_("read"),
                        fn.Coalesce(DrivePermission.comment, user_access["comment"]).as_(
                            "comment"
                        ),
                        fn.Coalesce(DrivePermission.share, user_access["share"]).as_("share"),
                        fn.Coalesce(DrivePermission.write, user_access["write"]).as_("write"),
                        DriveFile.team,
                        DriveFile.is_active,
                    )
                    .where(
                        (fn.Coalesce(DrivePermission.read, user_access["read"]).as_("read") == 1)
                        & (DriveFile.is_active == is_active)
                    )
                )

                # Query 2: Lấy shortcuts mà user tạo ra
                shortcut_files_query = (
                    frappe.qb.from_(DriveFile)
                    .inner_join(DriveShortcut)
                    .on((DriveShortcut.file == DriveFile.name) & (DriveShortcut.is_shortcut == 1))
                    .left_join(DrivePermission)
                    .on(
                        (DrivePermission.entity == DriveFile.name) & (DrivePermission.user == user)
                    )
                    .select(
                        *ENTITY_FIELDS,
                        DriveShortcut.is_shortcut,
                        DriveShortcut.shortcut_owner,
                        DriveShortcut.is_favourite,
                        DriveShortcut.name.as_("shortcut_name"),
                        DriveShortcut.title.as_("shortcut_title"),
                        DriveShortcut.parent_folder.as_("parent_entity"),
                        DriveFile.is_active,
                        fn.Coalesce(DrivePermission.read, user_access["read"]).as_("read"),
                        fn.Coalesce(DrivePermission.comment, user_access["comment"]).as_(
                            "comment"
                        ),
                        fn.Coalesce(DrivePermission.share, user_access["share"]).as_("share"),
                        fn.Coalesce(DrivePermission.write, user_access["write"]).as_("write"),
                        DriveFile.team,
                    )
                    .where(
                        (fn.Coalesce(DrivePermission.read, user_access["read"]).as_("read") == 1)
                        & (DriveShortcut.is_active == is_active)
                        & (DriveShortcut.shortcut_owner == user)
                    )
                )

                if personal == 1:
                    original_files_query = original_files_query.where(
                        (DriveFile.is_private == 1) & (DriveFile.owner == frappe.session.user)
                    )
                    print(
                        "DEBUG - Filtering original files for personal=1 (My Drive)",
                        original_files_query.run(as_dict=True),
                    )
                if personal == -3:
                    # Chỉ lấy file gốc công khai và file của user (thùng rác cá nhân)
                    # (DriveFile.is_private == 0)
                    original_files_query = original_files_query.where(
                        (DriveFile.modified_by == frappe.session.user)
                        # | (DriveFile.owner == frappe.session.user)
                    )
                query = original_files_query
                shortcut_query = shortcut_files_query

            elif personal == 0:
                print("DEBUG - Building query for personal=0 (Shared files)")
                # Chỉ lấy file gốc public/shared (không lấy shortcuts)
                query = (
                    frappe.qb.from_(DriveFile)
                    .left_join(DrivePermission)
                    .on(
                        (DrivePermission.entity == DriveFile.name) & (DrivePermission.user == user)
                    )
                    .select(
                        *ENTITY_FIELDS,
                        fn.Coalesce(DrivePermission.read, user_access["read"]).as_("read"),
                        fn.Coalesce(DrivePermission.comment, user_access["comment"]).as_(
                            "comment"
                        ),
                        fn.Coalesce(DrivePermission.share, user_access["share"]).as_("share"),
                        fn.Coalesce(DrivePermission.write, user_access["write"]).as_("write"),
                        DriveFile.team,
                    )
                    .where(
                        (fn.Coalesce(DrivePermission.read, user_access["read"]).as_("read") == 1)
                        & (DriveFile.is_private == 0)
                    )
                )
                shortcut_query = None

            else:
                print("DEBUG - Building query for personal=-1 (All files)")
                # personal = -1: Lấy tất cả (file gốc + shortcuts)
                query = (
                    frappe.qb.from_(DriveFile)
                    .left_join(DriveShortcut)
                    .on(DriveShortcut.file == DriveFile.name)
                    .left_join(DrivePermission)
                    .on(
                        (DrivePermission.entity == DriveFile.name) & (DrivePermission.user == user)
                    )
                    .select(
                        *ENTITY_FIELDS,
                        DriveShortcut.is_shortcut,
                        DriveShortcut.shortcut_owner,
                        DriveShortcut.is_favourite,
                        DriveShortcut.name.as_("shortcut_name"),
                        DriveShortcut.title.as_("shortcut_title"),
                        fn.Coalesce(DriveShortcut.is_shortcut, 0).as_("is_shortcut"),
                        fn.Coalesce(DriveShortcut.shortcut_owner, "").as_("shortcut_owner"),
                        fn.Coalesce(DrivePermission.read, user_access["read"]).as_("read"),
                        fn.Coalesce(DrivePermission.comment, user_access["comment"]).as_(
                            "comment"
                        ),
                        fn.Coalesce(DrivePermission.share, user_access["share"]).as_("share"),
                        fn.Coalesce(DrivePermission.write, user_access["write"]).as_("write"),
                        DriveFile.team,
                    )
                    .where(
                        (fn.Coalesce(DrivePermission.read, user_access["read"]).as_("read") == 1)
                        & (DriveFile.is_active == is_active)
                        & (DriveShortcut.is_active == is_active)
                        & (DriveShortcut.shortcut_owner == user)
                    )
                )
                shortcut_query = None

            # Áp dụng các filter chung cho cả file gốc và shortcut
            def apply_common_filters(q, has_shortcut=False):
                """
                Apply common filters to the query with optimized logic to reduce code duplication
                """

                def has_shortcut_table_in_query(query):
                    """Helper function to check if shortcut table exists in query"""
                    try:
                        query_sql = str(query)
                        return "DriveShortcut" in query_sql or "tabDrive Shortcut" in query_sql
                    except Exception as e:
                        print(f"DEBUG - Error checking query SQL: {e}")
                        return has_shortcut_join

                def apply_parent_filter(query, has_shortcut_table):
                    if personal == -3:
                        # Subquery: Lấy tất cả parent_entity có is_active = 1 (còn tồn tại)
                        active_parents_subquery = (
                            frappe.qb.from_(DriveFile)
                            .select(DriveFile.name)
                            .where((DriveFile.is_active == 1) & (DriveFile.team == team))
                        )

                        # Chỉ hiển thị items mà parent_entity vẫn ĐANG ACTIVE
                        # Tức là item này được xóa trực tiếp, không phải do cha bị xóa
                        return query.where(
                            (DriveFile.parent_entity == "")  # Root items
                            | (
                                DriveFile.parent_entity.isin(active_parents_subquery)
                            )  # Parent còn tồn tại
                        )
                    """Apply parent entity filtering with shortcut handling"""
                    if has_shortcut_table:
                        try:
                            return query.where(DriveShortcut.parent_folder == current_entity_name)
                        except Exception as e:
                            print(f"DEBUG - Failed to add shortcut filter: {e}")
                            return query.where(DriveFile.parent_entity == current_entity_name)
                    else:
                        print(
                            "DEBUG - No DriveShortcut table in query, only filtering by parent_entity",
                            current_entity_name,
                        )
                        return query.where(DriveFile.parent_entity == current_entity_name)

                def apply_folder_filter(query, has_shortcut_table):
                    """Apply folder-specific filtering"""
                    query = query.where(DriveFile.is_group == 1)

                    if has_shortcut_table:
                        try:
                            query = query.where(fn.Coalesce(DriveShortcut.is_shortcut, 0) == 0)
                        except Exception as e:
                            print(f"DEBUG - Failed to add shortcut filter: {e}")
                    else:
                        print(
                            "DEBUG - No DriveShortcut table in query, only filtering by is_group",
                            has_shortcut_table,
                        )
                    return query

                def apply_file_kinds_filter(query, file_kinds):
                    """Apply file kinds filtering"""
                    file_kinds_parsed = (
                        json.loads(file_kinds) if isinstance(file_kinds, str) else file_kinds
                    )

                    if not file_kinds_parsed:
                        return query

                    mime_types = []
                    criterion = []

                    for kind in file_kinds_parsed:
                        mime_types.extend(MIME_LIST_MAP.get(kind, []))

                    if mime_types:
                        criterion.extend(
                            [DriveFile.mime_type == mime_type for mime_type in mime_types]
                        )

                    if "Folder" in file_kinds_parsed:
                        criterion.append(DriveFile.is_group == 1)

                    return query.where(Criterion.any(criterion)) if criterion else query

                def apply_tag_filter(query, tag_list):
                    """Apply tag filtering"""
                    if not tag_list:
                        return query

                    tag_list_parsed = (
                        json.loads(tag_list) if not isinstance(tag_list, list) else tag_list
                    )
                    query = query.left_join(DriveEntityTag).on(
                        DriveEntityTag.parent == DriveFile.name
                    )
                    tag_criteria = [DriveEntityTag.tag == tag for tag in tag_list_parsed]
                    return query.where(Criterion.any(tag_criteria))

                # Main filtering logic
                has_shortcut_table = has_shortcut_table_in_query(q)

                # Apply parent/team filtering
                if only_parent and (not recents_only and not favourites_only):
                    q = apply_parent_filter(q, has_shortcut_table)
                else:
                    q = q.where((DriveFile.team == team) & (DriveFile.parent_entity != ""))

                # Apply favourite join
                q = apply_favourite_join(q, favourites_only, has_shortcut)

                # Apply recents filtering
                if recents_only:
                    recent_subquery = (
                        frappe.qb.from_(Recents)
                        .select(
                            Recents.entity_name,
                            fn.Max(Recents.last_interaction).as_("max_interaction"),
                        )
                        .where(Recents.owner == frappe.session.user)
                        .groupby(Recents.entity_name)
                    ).as_("recent_max")

                    q = (
                        q.inner_join(recent_subquery)
                        .on(recent_subquery.entity_name == DriveFile.name)
                        .select(recent_subquery.max_interaction.as_("accessed"))
                        .orderby(recent_subquery.max_interaction, order=Order.desc)
                    )
                else:
                    # ✅ FIX: Sort theo title từ DriveFile, không phải từ recent_subquery
                    recent_subquery = (
                        frappe.qb.from_(Recents)
                        .select(
                            Recents.entity_name,
                            fn.Max(Recents.last_interaction).as_("last_interaction"),
                        )
                        .groupby(Recents.entity_name)
                    ).as_("recent_subq")

                    q = (
                        q.left_join(recent_subquery)  # Đổi từ inner_join sang left_join
                        .on(recent_subquery.entity_name == DriveFile.name)
                        .select(
                            fn.Coalesce(recent_subquery.last_interaction, DriveFile.modified).as_(
                                "accessed"
                            )
                        )
                    )

                # Apply tag filtering
                q = apply_tag_filter(q, tag_list)

                # Apply active status filter
                if not has_shortcut:
                    print("DEBUG - Applying is_active filter to DriveFile only")
                    q = q.where(DriveFile.is_active == is_active)

                # Apply file kinds filtering
                q = apply_file_kinds_filter(q, file_kinds)

                # Apply folder filtering
                if folders:
                    has_shortcut_table = has_shortcut_table_in_query(
                        q
                    )  # Re-check after previous filters
                    print("DEBUG - has_shortcut_table", has_shortcut_table)
                    q = apply_folder_filter(q, has_shortcut_table)

                return q

            # Apply filters to main query
            has_shortcut_join = personal == -1  # personal = -1 có shortcut join
            query = apply_common_filters(query, has_shortcut_join)

            # Execute main query
            main_results = query.run(as_dict=True)

            # Đánh dấu results từ main query (file gốc)
            for result in main_results:
                result["_source"] = "main"
            team_results.extend(main_results)

            # Execute shortcut query if exists (for personal = 1)
            if shortcut_query is not None:
                # Shortcut query luôn có shortcut join
                shortcut_query = apply_common_filters(shortcut_query, has_shortcut=True)
                shortcut_results = shortcut_query.run(as_dict=True)
                print(f"DEBUG - Shortcut query results count: {len(shortcut_results)}")
                # Đánh dấu results từ shortcut query
                for result in shortcut_results:
                    result["_source"] = "shortcut"
                team_results.extend(shortcut_results)

            print(f"DEBUG - Total team_results for {team}: {len(team_results)}")
            team_info = frappe.get_value("Drive Team", team, ["name", "title"], as_dict=1)

            # Add team info to each result
            for result in team_results:
                result["team"] = team_info.name if team_info else team
                result["team_name"] = team_info.title if team_info else team

                # Đảm bảo thông tin shortcut được xử lý đúng
                result["is_shortcut"] = bool(result.get("is_shortcut", 0))
                if not result["is_shortcut"]:
                    result["shortcut_owner"] = None

                # Add days_remaining for files in trash
                if is_active == 0 and only_parent == 0 and result["modified"]:
                    try:
                        modified_date = result["modified"]
                        if isinstance(modified_date, str):
                            try:
                                modified_datetime = datetime.strptime(
                                    modified_date, "%Y-%m-%d %H:%M:%S.%f"
                                )
                            except ValueError:
                                modified_datetime = datetime.strptime(
                                    modified_date, "%Y-%m-%d %H:%M:%S"
                                )
                        else:
                            modified_datetime = modified_date
                        result["days_remaining"] = calculate_days_remaining(modified_datetime)
                    except Exception as e:
                        frappe.log_error(
                            f"Error calculating days_remaining for {result['name']}: {str(e)}"
                        )
                        result["days_remaining"] = None
            all_results.extend(team_results)

        except Exception as e:
            print(f"DEBUG - Error getting files for team {team}: {str(e)}")
            frappe.log_error(f"Error getting files for team {team}: {str(e)}")
            continue

    print(f"DEBUG - Total all_results: {len(all_results)}")

    # Get child counts and share counts for all teams
    if user_teams:
        team_condition = Criterion.any(DriveFile.team == team for team in user_teams)
        if personal == -3:
            child_condition = DriveFile.is_active == 0
        else:
            child_condition = DriveFile.is_active == 1

        child_count_query = (
            frappe.qb.from_(DriveFile)
            .where(team_condition & child_condition)
            .select(DriveFile.parent_entity, fn.Count("*").as_("child_count"))
            .groupby(DriveFile.parent_entity)
        )
        share_query = (
            frappe.qb.from_(DriveFile)
            .right_join(DrivePermission)
            .on(DrivePermission.entity == DriveFile.name)
            .where(
                (DrivePermission.user != "") & (DrivePermission.user != "$TEAM") & team_condition
            )
            .select(DriveFile.name, fn.Count("*").as_("share_count"))
            .groupby(DriveFile.name)
        )
        public_files_query = (
            frappe.qb.from_(DrivePermission)
            .inner_join(DriveFile)
            .on(DrivePermission.entity == DriveFile.name)
            .where((DrivePermission.user == "") & team_condition)
            .select(DrivePermission.entity)
        )
        team_files_query = (
            frappe.qb.from_(DrivePermission)
            .inner_join(DriveFile)
            .on(DrivePermission.entity == DriveFile.name)
            .where((DrivePermission.user == "$TEAM") & team_condition)
            .select(DrivePermission.entity)
        )

        public_files = set(k[0] for k in public_files_query.run())
        team_files = set(k[0] for k in team_files_query.run())
        children_count = dict(child_count_query.run())
        share_count = dict(share_query.run())
    else:
        public_files = set()
        team_files = set()
        children_count = {}
        share_count = {}

    # Add computed fields
    for r in all_results:
        r["children"] = children_count.get(r["name"], 0)
        r["file_type"] = get_file_type(r)
        if r["name"] in public_files:
            r["share_count"] = -2
        elif r["name"] in team_files:
            r["share_count"] = -1
        else:
            r["share_count"] = share_count.get(r["name"], 0)

    # Sort results
    if field in ["modified", "creation", "title", "file_size", "accessed"]:
        reverse = not ascending

        if field == "title":
            # ✅ Sort theo title case-insensitive
            all_results.sort(key=lambda x: (x.get(field) or "").lower(), reverse=reverse)
        elif field == "accessed":
            print("DEBUG - Sorting by accessed with special None handling", field)
            # Tách riêng các record có và không có accessed
            has_accessed = [r for r in all_results if r.get(field) is not None]
            no_accessed = [r for r in all_results if r.get(field) is None]

            # Sort phần có accessed
            has_accessed.sort(key=lambda x: x.get(field, ""), reverse=reverse)
            print("DEBUG - has_accessed count:", len(has_accessed))
            print("DEBUG - no_accessed count:", len(no_accessed))
            # Gộp lại: phần có accessed trước, phần None sau
            all_results = has_accessed + no_accessed
        else:
            all_results.sort(key=lambda x: x.get(field, ""), reverse=reverse)

    # Apply cursor pagination if specified
    if cursor and all_results:
        if field in all_results[0]:
            filtered_results = []
            for r in all_results:
                if ascending and r.get(field, "") > cursor:
                    filtered_results.append(r)
                elif not ascending and r.get(field, "") < cursor:
                    filtered_results.append(r)
            all_results = filtered_results

    # Apply limit
    # if limit:
    #     all_results = all_results[: int(limit)]
    print(f"DEBUG - Final all_results count: {all_results}")
    return all_results


@frappe.whitelist()
def get_recent_files_multi_team(
    teams=None,  # Giữ param để tương thích API, nhưng không dùng nữa
    order_by="accessed 0",
    is_active=1,
    limit=20,
    cursor=None,
    tag_list=[],
    file_kinds=[],
    folders=0,
):
    """
    Lấy danh sách file gần đây mà user đã access
    Logic: Lấy từ bảng Recents, JOIN với DriveFile, KHÔNG filter theo team

    User có thể được share file từ bất kỳ team nào => Không cần filter theo team
    """

    # Safe int conversion
    def safe_int_conversion(value, default=0):
        if isinstance(value, str):
            if value.lower() in ["true", "1"]:
                return 1
            elif value.lower() in ["false", "0"]:
                return 0
            else:
                try:
                    return int(value)
                except ValueError:
                    return default
        try:
            return int(value)
        except (ValueError, TypeError):
            return default

    field, ascending = order_by.split(" ")
    is_active = safe_int_conversion(is_active, 1)
    folders = safe_int_conversion(folders, 0)
    ascending = safe_int_conversion(ascending, 1)
    user = frappe.session.user if frappe.session.user != "Guest" else ""

    # ✅ BƯỚC 1: Lấy tất cả entities từ Recents của user
    recent_entities = (
        frappe.qb.from_(Recents)
        .select(Recents.entity_name, fn.Max(Recents.last_interaction).as_("last_interaction"))
        .where(Recents.user == user)
        .groupby(Recents.entity_name)
    ).run(as_dict=True)

    if not recent_entities:
        return []

    # Tạo dict để map entity_name -> last_interaction
    recent_dict = {r["entity_name"]: r["last_interaction"] for r in recent_entities}
    recent_entity_names = list(recent_dict.keys())

    print(f"DEBUG - Found {len(recent_entity_names)} recent entities for user {user}")

    # ✅ BƯỚC 2: Query DriveFile - KHÔNG filter theo team
    # Chỉ cần: file trong recent list + user có quyền read + is_active
    query = (
        frappe.qb.from_(DriveFile)
        .left_join(DrivePermission)
        .on((DrivePermission.entity == DriveFile.name) & (DrivePermission.user == user))
        .select(
            *ENTITY_FIELDS,
            DrivePermission.read,
            DrivePermission.comment,
            DrivePermission.share,
            DrivePermission.write,
            DriveFile.team,
            DriveFile.is_active,
        )
        .where(
            (DriveFile.name.isin(recent_entity_names))  # File trong recent list
            & (DriveFile.is_active == is_active)  # Active/Trash
            # & (DrivePermission.read == 1)  # User có quyền read
        )
    )

    # Apply file kinds filter
    if file_kinds:
        file_kinds_parsed = json.loads(file_kinds) if isinstance(file_kinds, str) else file_kinds

        if file_kinds_parsed:
            mime_types = []
            criterion = []

            for kind in file_kinds_parsed:
                mime_types.extend(MIME_LIST_MAP.get(kind, []))

            if mime_types:
                criterion.extend([DriveFile.mime_type == mime_type for mime_type in mime_types])

            if "Folder" in file_kinds_parsed:
                criterion.append(DriveFile.is_group == 1)

            if criterion:
                query = query.where(Criterion.any(criterion))

    # Apply folder filter
    if folders:
        query = query.where(DriveFile.is_group == 1)

    # Apply tag filter
    if tag_list:
        tag_list_parsed = json.loads(tag_list) if not isinstance(tag_list, list) else tag_list
        query = query.left_join(DriveEntityTag).on(DriveEntityTag.parent == DriveFile.name)
        tag_criteria = [DriveEntityTag.tag == tag for tag in tag_list_parsed]
        query = query.where(Criterion.any(tag_criteria))

    # Execute query
    all_results = query.run(as_dict=True)
    print(f"DEBUG - Query returned {len(all_results)} results")

    # ✅ BƯỚC 3: Add accessed time từ recent_dict
    for result in all_results:
        result["accessed"] = recent_dict.get(result["name"])
        result["_source"] = "recent"

    # ✅ BƯỚC 4: Add team info cho mỗi file
    team_names = list(set(r["team"] for r in all_results if r.get("team")))
    team_info_map = {}

    if team_names:
        team_infos = frappe.get_all(
            "Drive Team", filters={"name": ["in", team_names]}, fields=["name", "title"]
        )
        team_info_map = {t["name"]: t for t in team_infos}

    for result in all_results:
        team_name = result.get("team")
        if team_name and team_name in team_info_map:
            result["team_name"] = team_info_map[team_name]["title"]
        else:
            result["team_name"] = team_name

    print(f"DEBUG - Results after adding team info: {len(all_results)}")

    # ✅ BƯỚC 5: Get child counts and share counts
    if all_results:
        result_teams = list(set(r["team"] for r in all_results if r.get("team")))

        if result_teams:
            team_condition = Criterion.any(DriveFile.team == team for team in result_teams)

            child_count_query = (
                frappe.qb.from_(DriveFile)
                .where(team_condition & (DriveFile.is_active == 1))
                .select(DriveFile.parent_entity, fn.Count("*").as_("child_count"))
                .groupby(DriveFile.parent_entity)
            )
            share_query = (
                frappe.qb.from_(DriveFile)
                .right_join(DrivePermission)
                .on(DrivePermission.entity == DriveFile.name)
                .where(
                    (DrivePermission.user != "")
                    & (DrivePermission.user != "$TEAM")
                    & team_condition
                )
                .select(DriveFile.name, fn.Count("*").as_("share_count"))
                .groupby(DriveFile.name)
            )
            public_files_query = (
                frappe.qb.from_(DrivePermission)
                .inner_join(DriveFile)
                .on(DrivePermission.entity == DriveFile.name)
                .where((DrivePermission.user == "") & team_condition)
                .select(DrivePermission.entity)
            )
            team_files_query = (
                frappe.qb.from_(DrivePermission)
                .inner_join(DriveFile)
                .on(DrivePermission.entity == DriveFile.name)
                .where((DrivePermission.user == "$TEAM") & team_condition)
                .select(DrivePermission.entity)
            )

            public_files = set(k[0] for k in public_files_query.run())
            team_files = set(k[0] for k in team_files_query.run())
            children_count = dict(child_count_query.run())
            share_count = dict(share_query.run())
        else:
            public_files = set()
            team_files = set()
            children_count = {}
            share_count = {}
    else:
        public_files = set()
        team_files = set()
        children_count = {}
        share_count = {}

    # Add computed fields
    for r in all_results:
        r["children"] = children_count.get(r["name"], 0)
        r["file_type"] = get_file_type(r)
        if r["name"] in public_files:
            r["share_count"] = -2
        elif r["name"] in team_files:
            r["share_count"] = -1
        else:
            r["share_count"] = share_count.get(r["name"], 0)

    # ✅ BƯỚC 6: Sort by accessed time
    if field == "accessed":
        reverse = not ascending
        all_results.sort(key=lambda x: x.get("accessed") or datetime.min, reverse=reverse)
    elif field in ["modified", "creation", "title", "file_size"]:
        reverse = not ascending
        if field == "title":
            all_results.sort(key=lambda x: (x.get(field) or "").lower(), reverse=reverse)
        else:
            all_results.sort(key=lambda x: x.get(field, ""), reverse=reverse)

    # Apply cursor pagination
    if cursor and all_results:
        if field in all_results[0]:
            filtered_results = []
            for r in all_results:
                if ascending and r.get(field, "") > cursor:
                    filtered_results.append(r)
                elif not ascending and r.get(field, "") < cursor:
                    filtered_results.append(r)
            all_results = filtered_results

    # Apply limit
    if limit:
        all_results = all_results[: int(limit)]

    print(f"DEBUG - Final results: {len(all_results)}")
    return all_results


@frappe.whitelist()
def get_favourites_multi_team(
    teams=None,  # Giữ param để tương thích API, nhưng không dùng nữa
    order_by="title 1",
    is_active=1,
    limit=20,
    cursor=None,
    tag_list=[],
    file_kinds=[],
    folders=0,
):
    """
    Lấy danh sách file/folder yêu thích của user
    Logic: Lấy từ bảng DriveFavourite, JOIN với DriveFile, KHÔNG filter theo team

    User có thể favourite file từ bất kỳ team nào => Không cần filter theo team
    """

    # Safe int conversion
    def safe_int_conversion(value, default=0):
        if isinstance(value, str):
            if value.lower() in ["true", "1"]:
                return 1
            elif value.lower() in ["false", "0"]:
                return 0
            else:
                try:
                    return int(value)
                except ValueError:
                    return default
        try:
            return int(value)
        except (ValueError, TypeError):
            return default

    field, ascending = order_by.split(" ")
    is_active = safe_int_conversion(is_active, 1)
    folders = safe_int_conversion(folders, 0)
    ascending = safe_int_conversion(ascending, 1)
    user = frappe.session.user if frappe.session.user != "Guest" else ""

    # ✅ BƯỚC 1: Lấy tất cả favourites của user
    favourite_entities = (
        frappe.qb.from_(DriveFavourite)
        .select(
            DriveFavourite.entity,
            DriveFavourite.entity_shortcut,
            DriveFavourite.name.as_("favourite_id"),
            DriveFavourite.creation.as_("favourite_date"),
        )
        .where(DriveFavourite.user == user)
    ).run(as_dict=True)

    if not favourite_entities:
        return []

    # Tách entity và entity_shortcut
    entity_names = [f["entity"] for f in favourite_entities if f.get("entity")]
    shortcut_names = [f["entity_shortcut"] for f in favourite_entities if f.get("entity_shortcut")]

    print(
        f"DEBUG - Found {len(entity_names)} favourite entities and {len(shortcut_names)} favourite shortcuts for user {user}"
    )

    all_results = []

    # ✅ BƯỚC 2A: Query DriveFile entities (không phải shortcuts)
    if entity_names:
        query = (
            frappe.qb.from_(DriveFile)
            .left_join(DrivePermission)
            .on((DrivePermission.entity == DriveFile.name) & (DrivePermission.user == user))
            .select(
                *ENTITY_FIELDS,
                DrivePermission.read,
                DrivePermission.comment,
                DrivePermission.share,
                DrivePermission.write,
                DriveFile.team,
                DriveFile.is_active,
            )
            .where(
                (DriveFile.name.isin(entity_names))  # File trong favourite list
                & (DriveFile.is_active == is_active)  # Active/Trash
                # & (DrivePermission.read == 1)  # User có quyền read
            )
        )

        # Apply file kinds filter
        if file_kinds:
            file_kinds_parsed = (
                json.loads(file_kinds) if isinstance(file_kinds, str) else file_kinds
            )

            if file_kinds_parsed:
                mime_types = []
                criterion = []

                for kind in file_kinds_parsed:
                    mime_types.extend(MIME_LIST_MAP.get(kind, []))

                if mime_types:
                    criterion.extend(
                        [DriveFile.mime_type == mime_type for mime_type in mime_types]
                    )

                if "Folder" in file_kinds_parsed:
                    criterion.append(DriveFile.is_group == 1)

                if criterion:
                    query = query.where(Criterion.any(criterion))

        # Apply folder filter
        if folders:
            query = query.where(DriveFile.is_group == 1)

        # Apply tag filter
        if tag_list:
            tag_list_parsed = json.loads(tag_list) if not isinstance(tag_list, list) else tag_list
            query = query.left_join(DriveEntityTag).on(DriveEntityTag.parent == DriveFile.name)
            tag_criteria = [DriveEntityTag.tag == tag for tag in tag_list_parsed]
            query = query.where(Criterion.any(tag_criteria))

        # Execute query
        entity_results = query.run(as_dict=True)
        print(f"DEBUG - Entity query returned {len(entity_results)} results")

        # Mark as entity favourite
        for result in entity_results:
            result["_source"] = "favourite_entity"
            result["is_favourite"] = True
            result["is_shortcut"] = False
            # Find favourite date
            for fav in favourite_entities:
                if fav.get("entity") == result["name"]:
                    result["favourite_date"] = fav.get("favourite_date")
                    break

        all_results.extend(entity_results)

    # ✅ BƯỚC 2B: Query DriveShortcut entities (shortcuts được favourite)
    if shortcut_names:
        shortcut_query = (
            frappe.qb.from_(DriveFile)
            .inner_join(DriveShortcut)
            .on((DriveShortcut.file == DriveFile.name) & (DriveShortcut.is_shortcut == 1))
            .left_join(DrivePermission)
            .on((DrivePermission.entity == DriveFile.name) & (DrivePermission.user == user))
            .select(
                *ENTITY_FIELDS,
                DriveShortcut.is_shortcut,
                DriveShortcut.shortcut_owner,
                DriveShortcut.name.as_("shortcut_name"),
                DriveShortcut.title.as_("shortcut_title"),
                DriveShortcut.parent_folder.as_("parent_entity"),
                DriveFile.is_active,
                DrivePermission.read,
                DrivePermission.comment,
                DrivePermission.share,
                DrivePermission.write,
                DriveFile.team,
            )
            .where(
                (DriveShortcut.name.isin(shortcut_names))  # Shortcut trong favourite list
                & (DriveShortcut.is_active == is_active)  # Active/Trash
                # & (DrivePermission.read == 1)  # User có quyền read
            )
        )

        # Apply file kinds filter for shortcuts
        if file_kinds:
            file_kinds_parsed = (
                json.loads(file_kinds) if isinstance(file_kinds, str) else file_kinds
            )

            if file_kinds_parsed:
                mime_types = []
                criterion = []

                for kind in file_kinds_parsed:
                    mime_types.extend(MIME_LIST_MAP.get(kind, []))

                if mime_types:
                    criterion.extend(
                        [DriveFile.mime_type == mime_type for mime_type in mime_types]
                    )

                if "Folder" in file_kinds_parsed:
                    criterion.append(DriveFile.is_group == 1)

                if criterion:
                    shortcut_query = shortcut_query.where(Criterion.any(criterion))

        # Apply folder filter
        if folders:
            shortcut_query = shortcut_query.where(DriveFile.is_group == 1)

        # Apply tag filter
        if tag_list:
            tag_list_parsed = json.loads(tag_list) if not isinstance(tag_list, list) else tag_list
            shortcut_query = shortcut_query.left_join(DriveEntityTag).on(
                DriveEntityTag.parent == DriveFile.name
            )
            tag_criteria = [DriveEntityTag.tag == tag for tag in tag_list_parsed]
            shortcut_query = shortcut_query.where(Criterion.any(tag_criteria))

        # Execute shortcut query
        shortcut_results = shortcut_query.run(as_dict=True)
        print(f"DEBUG - Shortcut query returned {len(shortcut_results)} results")

        # Mark as shortcut favourite
        for result in shortcut_results:
            result["_source"] = "favourite_shortcut"
            result["is_favourite"] = True
            result["is_shortcut"] = True
            # Find favourite date
            for fav in favourite_entities:
                if fav.get("entity_shortcut") == result.get("shortcut_name"):
                    result["favourite_date"] = fav.get("favourite_date")
                    break

        all_results.extend(shortcut_results)

    print(f"DEBUG - Total results before metadata: {len(all_results)}")

    # ✅ BƯỚC 3: Add team info cho mỗi file
    team_names = list(set(r["team"] for r in all_results if r.get("team")))
    team_info_map = {}

    if team_names:
        team_infos = frappe.get_all(
            "Drive Team", filters={"name": ["in", team_names]}, fields=["name", "title"]
        )
        team_info_map = {t["name"]: t for t in team_infos}

    for result in all_results:
        team_name = result.get("team")
        if team_name and team_name in team_info_map:
            result["team_name"] = team_info_map[team_name]["title"]
        else:
            result["team_name"] = team_name

    # ✅ BƯỚC 4: Get child counts and share counts
    if all_results:
        result_teams = list(set(r["team"] for r in all_results if r.get("team")))

        if result_teams:
            team_condition = Criterion.any(DriveFile.team == team for team in result_teams)

            child_count_query = (
                frappe.qb.from_(DriveFile)
                .where(team_condition & (DriveFile.is_active == 1))
                .select(DriveFile.parent_entity, fn.Count("*").as_("child_count"))
                .groupby(DriveFile.parent_entity)
            )
            share_query = (
                frappe.qb.from_(DriveFile)
                .right_join(DrivePermission)
                .on(DrivePermission.entity == DriveFile.name)
                .where(
                    (DrivePermission.user != "")
                    & (DrivePermission.user != "$TEAM")
                    & team_condition
                )
                .select(DriveFile.name, fn.Count("*").as_("share_count"))
                .groupby(DriveFile.name)
            )
            public_files_query = (
                frappe.qb.from_(DrivePermission)
                .inner_join(DriveFile)
                .on(DrivePermission.entity == DriveFile.name)
                .where((DrivePermission.user == "") & team_condition)
                .select(DrivePermission.entity)
            )
            team_files_query = (
                frappe.qb.from_(DrivePermission)
                .inner_join(DriveFile)
                .on(DrivePermission.entity == DriveFile.name)
                .where((DrivePermission.user == "$TEAM") & team_condition)
                .select(DrivePermission.entity)
            )

            public_files = set(k[0] for k in public_files_query.run())
            team_files = set(k[0] for k in team_files_query.run())
            children_count = dict(child_count_query.run())
            share_count = dict(share_query.run())
        else:
            public_files = set()
            team_files = set()
            children_count = {}
            share_count = {}
    else:
        public_files = set()
        team_files = set()
        children_count = {}
        share_count = {}

    # Add computed fields
    for r in all_results:
        r["children"] = children_count.get(r["name"], 0)
        r["file_type"] = get_file_type(r)
        if r["name"] in public_files:
            r["share_count"] = -2
        elif r["name"] in team_files:
            r["share_count"] = -1
        else:
            r["share_count"] = share_count.get(r["name"], 0)

    # ✅ BƯỚC 5: Sort results
    if field in ["modified", "creation", "title", "file_size", "favourite_date"]:
        reverse = not ascending
        if field == "title":
            all_results.sort(key=lambda x: (x.get(field) or "").lower(), reverse=reverse)
        else:
            all_results.sort(key=lambda x: x.get(field, ""), reverse=reverse)

    # Apply cursor pagination
    if cursor and all_results:
        if field in all_results[0]:
            filtered_results = []
            for r in all_results:
                if ascending and r.get(field, "") > cursor:
                    filtered_results.append(r)
                elif not ascending and r.get(field, "") < cursor:
                    filtered_results.append(r)
            all_results = filtered_results

    # Apply limit
    if limit:
        all_results = all_results[: int(limit)]

    print(f"DEBUG - Final results: {len(all_results)}")
    return all_results


@frappe.whitelist()
def shared_multi_team(
    teams=None,
    by=1,
    order_by="accessed",
    limit=1000,
    tag_list=[],
    mime_type_list=[],
):
    by = int(by)
    limit = int(limit)

    # Parse tag_list và mime_type_list
    if tag_list and isinstance(tag_list, str):
        tag_list = json.loads(tag_list)
    if mime_type_list and isinstance(mime_type_list, str):
        mime_type_list = json.loads(mime_type_list)

    # Xây dựng WHERE conditions
    where_conditions = []
    query_params = {"current_user": frappe.session.user, "limit": limit}

    # Tag filter
    tag_join = ""
    if tag_list:
        tag_join = "INNER JOIN `tabDrive Entity Tag` det ON det.parent = df.name"
        tag_placeholders = ", ".join([f"%(tag_{i})s" for i in range(len(tag_list))])
        where_conditions.append(f"det.tag IN ({tag_placeholders})")
        for i, tag in enumerate(tag_list):
            query_params[f"tag_{i}"] = tag

    # MIME type filter
    if mime_type_list:
        mime_placeholders = ", ".join([f"%(mime_{i})s" for i in range(len(mime_type_list))])
        where_conditions.append(f"df.mime_type IN ({mime_placeholders})")
        for i, mime in enumerate(mime_type_list):
            query_params[f"mime_{i}"] = mime

    where_clause = ""
    if where_conditions:
        where_clause = "AND " + " AND ".join(where_conditions)

    # Xử lý ORDER BY
    order_clause = "ORDER BY accessed DESC"
    if order_by:
        order_parts = order_by.split()
        order_field = order_parts[0]
        is_desc = len(order_parts) > 1 and order_parts[1].lower() == "0"
        direction = "DESC" if is_desc else "ASC"

        if "+" in order_field:
            base_field = order_field.split("+")[0]
            if order_field != "accessed":
                order_clause = f"ORDER BY {base_field} + 0 {direction}"
            else:
                order_clause = f"ORDER BY accessed {direction}"
        else:
            order_clause = f"ORDER BY {order_field} {direction}"

    # ✅ QUERY SIÊU TỐI ƯU với xử lý duplicate cho by=1
    # Khi by=1 (owner), có thể có nhiều bản ghi vì 1 file được share cho nhiều user
    # Dùng MIN để lấy 1 permission record (tương thích với MySQL cũ hơn)

    if by:
        # by=1: Lấy files mà current_user là owner (share cho người khác)
        # Dùng MIN để lấy 1 permission record
        main_query = f"""
        SELECT 
            df.name,
            df.team,
            df.title,
            df.creation,
            df.modified,
            df.owner,
            df.mime_type,
            df.file_size,
            df.parent_entity,
            df.is_group,
            df.is_active,
            df.is_link,
            df.document,
            df.color,
            COALESCE(MAX(del.last_interaction), df.modified) as accessed,
            MIN(dp.user) as user,
            MIN(dp.owner) as sharer,
            MAX(dp.read) as `read`,
            MAX(dp.share) as `share`,
            MAX(dp.comment) as `comment`,
            MAX(dp.write) as `write`
        FROM `tabDrive File` df
        FORCE INDEX (modified)
        INNER JOIN `tabDrive Permission` dp 
            ON dp.entity = df.name 
            AND dp.read = 1
            AND dp.owner = %(current_user)s
        LEFT JOIN `tabDrive Entity Log` del 
            ON del.entity_name = df.name
        {tag_join}
        WHERE df.is_active = 1
          {where_clause}
        GROUP BY df.name, df.team, df.title, df.creation, df.modified, 
                 df.owner, df.mime_type, df.file_size, df.parent_entity, 
                 df.is_group, df.is_active, df.is_link, df.document, 
                 df.color
        {order_clause}
        LIMIT %(limit)s
        """
    else:
        # by=0: Lấy files được share cho current_user
        # Không bị duplicate vì mỗi user chỉ có 1 permission record
        main_query = f"""
        SELECT 
            df.name,
            df.team,
            df.title,
            df.creation,
            df.modified,
            df.owner,
            df.mime_type,
            df.file_size,
            df.parent_entity,
            df.is_group,
            df.is_active,
            df.is_link,
            df.document,
            df.color,
            COALESCE(MAX(del.last_interaction), df.modified) as accessed,
            dp.user,
            dp.owner as sharer,
            dp.read,
            dp.share,
            dp.comment,
            dp.write
        FROM `tabDrive File` df
        FORCE INDEX (modified)
        INNER JOIN `tabDrive Permission` dp 
            ON dp.entity = df.name 
            AND dp.read = 1
            AND dp.user = %(current_user)s
        LEFT JOIN `tabDrive Entity Log` del 
            ON del.entity_name = df.name
        {tag_join}
        WHERE df.is_active = 1
          {where_clause}
        GROUP BY df.name, df.team, df.title, df.creation, df.modified, 
                 df.owner, df.mime_type, df.file_size, df.parent_entity, 
                 df.is_group, df.is_active, df.is_link, df.document, 
                 df.color,
                 dp.user, dp.owner, dp.read, dp.share, dp.comment, dp.write
        {order_clause}
        LIMIT %(limit)s
        """

    # Execute main query
    res = frappe.db.sql(main_query, query_params, as_dict=True)

    if not res:
        return []

    print(f"🔍 Query returned {len(res)} files in main query")

    # ✅ HIERARCHY CHECK SIÊU TỐI ƯU: Chỉ check parent trực tiếp, không recursive
    # Lấy tất cả parent entities cần check
    parent_entities = {r["parent_entity"] for r in res if r.get("parent_entity")}

    if parent_entities:
        # Chỉ check 1 level parent, không recursive (nhanh hơn rất nhiều)
        parent_check_query = """
        SELECT name, is_active
        FROM `tabDrive File`
        WHERE name IN %(parents)s
        """

        parent_status = frappe.db.sql(
            parent_check_query, {"parents": list(parent_entities)}, as_dict=True
        )

        inactive_parents = {p["name"] for p in parent_status if not p.get("is_active")}

        # Lọc bỏ các file có parent inactive
        if inactive_parents:
            print(f"❌ Filtering out files with inactive parents: {len(inactive_parents)}")
            res = [r for r in res if r.get("parent_entity") not in inactive_parents]

    print(f"✅ Total files after hierarchy check: {len(res)}")

    if not res:
        return []

    # ✅ BATCH QUERIES: Lấy tất cả thông tin bổ sung trong 1 lần
    entity_names = tuple(r["name"] for r in res)
    team_ids = tuple({r.get("team") for r in res if r.get("team")})

    # Single mega query để lấy tất cả info cùng lúc
    batch_query = """
    SELECT 
        'child' as info_type,
        parent_entity as entity_name,
        COUNT(*) as count_value
    FROM `tabDrive File`
    WHERE parent_entity IN %(entities)s
      AND is_active = 1
    GROUP BY parent_entity
    
    UNION ALL
    
    SELECT 
        'share' as info_type,
        entity as entity_name,
        COUNT(*) as count_value
    FROM `tabDrive Permission`
    WHERE entity IN %(entities)s
      AND user != ''
      AND user != '$TEAM'
    GROUP BY entity
    
    UNION ALL
    
    SELECT 
        'public' as info_type,
        entity as entity_name,
        1 as count_value
    FROM `tabDrive Permission`
    WHERE entity IN %(entities)s
      AND user = ''
    
    UNION ALL
    
    SELECT 
        'team_shared' as info_type,
        entity as entity_name,
        1 as count_value
    FROM `tabDrive Permission`
    WHERE entity IN %(entities)s
      AND user = '$TEAM'
    """

    batch_results = frappe.db.sql(batch_query, {"entities": entity_names}, as_dict=True)

    # Map results
    child_count = {}
    share_count = {}
    public_files = set()
    team_shared_files = set()

    for row in batch_results:
        entity = row["entity_name"]
        info_type = row["info_type"]

        if info_type == "child":
            child_count[entity] = row["count_value"]
        elif info_type == "share":
            share_count[entity] = row["count_value"]
        elif info_type == "public":
            public_files.add(entity)
        elif info_type == "team_shared":
            team_shared_files.add(entity)

    # Get team info nếu cần
    team_info = {}
    if team_ids:
        team_data = frappe.db.sql(
            """
            SELECT name, title
            FROM `tabDrive Team`
            WHERE name IN %(teams)s
        """,
            {"teams": team_ids},
            as_dict=True,
        )

        team_info = {t["name"]: t for t in team_data}

    # Add additional information to results
    for r in res:
        r["children"] = child_count.get(r["name"], 0)
        r["file_type"] = get_file_type(r)

        if r["name"] in public_files:
            r["share_count"] = -2
        elif r["name"] in team_shared_files:
            r["share_count"] = -1
        else:
            r["share_count"] = share_count.get(r["name"], 0)

        # Add team info
        current_team = r.get("team")
        if current_team and current_team in team_info:
            r["team"] = team_info[current_team]["name"]
            r["team_name"] = team_info[current_team]["title"]
        else:
            r["team"] = current_team
            r["team_name"] = current_team

    # Return only top-level items
    parents = {r["name"] for r in res}
    return [r for r in res if not r.get("parent_entity") or r["parent_entity"] not in parents]


@frappe.whitelist()
def get_personal_files(
    entity_name=None,
    order_by="title 1",
    is_active=1,
    limit=20,
    cursor=None,
    favourites_only=0,
    recents_only=0,
    tag_list=[],
    file_kinds=[],
    folders=0,
    only_parent=1,
):
    """
    Lấy file cá nhân (My Drive) - file gốc và shortcuts thuộc về user
    Logic: Tự động lấy tất cả file/shortcut từ TẤT CẢ các team mà user tham gia

    - Không cần truyền teams parameter
    - API tự động lấy danh sách teams của user
    - Lấy tất cả file có: owner = user, is_private = 1
    """

    def safe_int_conversion(value, default=0):
        if isinstance(value, str):
            if value.lower() in ["true", "1"]:
                return 1
            elif value.lower() in ["false", "0"]:
                return 0
            else:
                try:
                    return int(value)
                except ValueError:
                    return default
        try:
            return int(value)
        except (ValueError, TypeError):
            return default

    # Convert parameters
    field, ascending = order_by.split(" ")
    is_active = safe_int_conversion(is_active, 1)
    only_parent = safe_int_conversion(only_parent, 1)
    folders = safe_int_conversion(folders, 0)
    ascending = safe_int_conversion(ascending, 1)
    favourites_only = safe_int_conversion(favourites_only, 0)
    recents_only = safe_int_conversion(recents_only, 0)
    user = frappe.session.user if frappe.session.user != "Guest" else ""

    # ✅ TỰ ĐỘNG lấy tất cả teams của user
    user_teams = get_teams()
    print(f"DEBUG - Auto-detected user teams: {user_teams}")

    # ✅ Nếu có entity_name, verify quyền truy cập
    if entity_name:
        try:
            entity = frappe.get_doc("Drive File", entity_name)
            user_access = get_user_access(entity, user)

            if not user_access["read"]:
                frappe.throw(
                    "You don't have permission to access this folder", frappe.PermissionError
                )

            # Chỉ query trong team của entity này
            user_teams = [entity.team]
            print(
                f"DEBUG - Entity {entity_name} belongs to team {entity.team}, filtering to this team only"
            )
        except frappe.DoesNotExistError:
            return []

    if not user_teams:
        print("DEBUG - No teams found for user")
        return []

    all_results = []

    # ✅ FIX 3: Loop qua từng team như files_multi_team
    for team in user_teams:
        try:
            print(f"DEBUG - Processing team: {team}")

            # Get home folder for this team if no entity_name specified
            if not entity_name:
                home = get_home_folder(team)["name"]
                current_entity_name = home
            else:
                current_entity_name = entity_name

            # ✅ FIX 4: Verify entity thuộc về team đang xử lý
            try:
                entity = frappe.get_doc("Drive File", current_entity_name)
                if entity.team != team:
                    print(f"DEBUG - Skipping: entity.team ({entity.team}) != team ({team})")
                    continue
            except:
                continue

            # Get user access
            user_access = get_user_access(entity, user)
            if not user_access["read"]:
                print(f"DEBUG - No read access for {current_entity_name}")
                continue

            # ✅ Query 1: File gốc thuộc về user
            original_files_query = (
                frappe.qb.from_(DriveFile)
                .left_join(DrivePermission)
                .on((DrivePermission.entity == DriveFile.name) & (DrivePermission.user == user))
                .select(
                    *ENTITY_FIELDS,
                    DriveFile.team,
                    DriveFile.is_active,
                    DriveFile.owner,
                    fn.Coalesce(DrivePermission.read, 1).as_("read"),
                    fn.Coalesce(DrivePermission.comment, 1).as_("comment"),
                    fn.Coalesce(DrivePermission.share, 1).as_("share"),
                    fn.Coalesce(DrivePermission.write, 1).as_("write"),
                )
                .where(
                    (DriveFile.is_active == is_active)
                    & (DriveFile.owner == user)
                    & (DriveFile.is_private == 1)
                    & (DriveFile.team == team)  # ✅ Thêm filter team
                )
            )

            # ✅ Query 2: Shortcuts thuộc về user
            shortcut_files_query = (
                frappe.qb.from_(DriveFile)
                .inner_join(DriveShortcut)
                .on((DriveShortcut.file == DriveFile.name) & (DriveShortcut.is_shortcut == 1))
                .left_join(DrivePermission)
                .on((DrivePermission.entity == DriveFile.name) & (DrivePermission.user == user))
                .select(
                    *ENTITY_FIELDS,
                    DriveShortcut.is_shortcut,
                    DriveShortcut.shortcut_owner,
                    DriveShortcut.is_favourite,
                    DriveShortcut.name.as_("shortcut_name"),
                    DriveShortcut.title.as_("shortcut_title"),
                    DriveShortcut.parent_folder.as_("parent_entity"),
                    DriveFile.is_active,
                    DriveFile.team,
                    DriveFile.owner,
                    fn.Coalesce(DrivePermission.read, 1).as_("read"),
                    fn.Coalesce(DrivePermission.comment, 1).as_("comment"),
                    fn.Coalesce(DrivePermission.share, 1).as_("share"),
                    fn.Coalesce(DrivePermission.write, 1).as_("write"),
                )
                .where(
                    (DriveShortcut.is_active == is_active)
                    & (DriveShortcut.shortcut_owner == user)
                    & (DriveFile.team == team)  # ✅ Thêm filter team
                )
            )

            # ✅ Apply filters (sử dụng logic từ files_multi_team)
            def apply_filters(query, is_shortcut=False):
                # Filter theo parent folder
                if only_parent and (not recents_only and not favourites_only):
                    if is_shortcut:
                        query = query.where(DriveShortcut.parent_folder == current_entity_name)
                    else:
                        query = query.where(DriveFile.parent_entity == current_entity_name)

                # Filter folders only
                if folders:
                    query = query.where(DriveFile.is_group == 1)
                    if is_shortcut:
                        query = query.where(fn.Coalesce(DriveShortcut.is_shortcut, 0) == 0)

                # Filter file kinds
                if file_kinds:
                    file_kinds_parsed = (
                        json.loads(file_kinds) if isinstance(file_kinds, str) else file_kinds
                    )
                    if file_kinds_parsed:
                        mime_types = []
                        criterion = []
                        for kind in file_kinds_parsed:
                            mime_types.extend(MIME_LIST_MAP.get(kind, []))
                        if mime_types:
                            criterion.extend(
                                [DriveFile.mime_type == mime_type for mime_type in mime_types]
                            )
                        if "Folder" in file_kinds_parsed:
                            criterion.append(DriveFile.is_group == 1)
                        if criterion:
                            query = query.where(Criterion.any(criterion))

                # Filter tags
                if tag_list:
                    tag_list_parsed = (
                        json.loads(tag_list) if not isinstance(tag_list, list) else tag_list
                    )
                    query = query.left_join(DriveEntityTag).on(
                        DriveEntityTag.parent == DriveFile.name
                    )
                    tag_criteria = [DriveEntityTag.tag == tag for tag in tag_list_parsed]
                    query = query.where(Criterion.any(tag_criteria))

                # Join favourites
                if favourites_only:
                    if is_shortcut:
                        query = query.where(DriveShortcut.is_favourite == 1)
                    else:
                        query = query.inner_join(DriveFavourite).on(
                            (DriveFavourite.entity == DriveFile.name)
                            & (DriveFavourite.user == user)
                        )

                # Join recents
                if recents_only:
                    recent_subquery = (
                        frappe.qb.from_(Recents)
                        .select(
                            Recents.entity_name,
                            fn.Max(Recents.last_interaction).as_("max_interaction"),
                        )
                        .where(Recents.owner == user)
                        .groupby(Recents.entity_name)
                    ).as_("recent_max")

                    query = (
                        query.inner_join(recent_subquery)
                        .on(recent_subquery.entity_name == DriveFile.name)
                        .select(recent_subquery.max_interaction.as_("accessed"))
                        .orderby(recent_subquery.max_interaction, order=Order.desc)
                    )
                else:
                    recent_subquery = (
                        frappe.qb.from_(Recents)
                        .select(
                            Recents.entity_name,
                            fn.Max(Recents.last_interaction).as_("last_interaction"),
                        )
                        .groupby(Recents.entity_name)
                    ).as_("recent_subq")

                    query = (
                        query.left_join(recent_subquery)
                        .on(recent_subquery.entity_name == DriveFile.name)
                        .select(
                            fn.Coalesce(recent_subquery.last_interaction, DriveFile.modified).as_(
                                "accessed"
                            )
                        )
                    )

                return query

            # Apply filters
            original_files_query = apply_filters(original_files_query, is_shortcut=False)
            shortcut_files_query = apply_filters(shortcut_files_query, is_shortcut=True)

            # Execute queries
            main_results = original_files_query.run(as_dict=True)
            print(f"DEBUG - Team {team}: Original files count: {len(main_results)}")

            for result in main_results:
                result["_source"] = "main"
                result["is_shortcut"] = False
                result["shortcut_owner"] = None

            shortcut_results = shortcut_files_query.run(as_dict=True)
            print(f"DEBUG - Team {team}: Shortcut files count: {len(shortcut_results)}")

            for result in shortcut_results:
                result["_source"] = "shortcut"
                result["is_shortcut"] = True

            # Combine results for this team
            team_results = main_results + shortcut_results

            # Add team info
            team_info = frappe.get_value("Drive Team", team, ["name", "title"], as_dict=1)
            for result in team_results:
                result["team"] = team_info.name if team_info else team
                result["team_name"] = team_info.title if team_info else team

            all_results.extend(team_results)

        except Exception as e:
            print(f"DEBUG - Error processing team {team}: {str(e)}")
            frappe.log_error(f"Error in get_personal_files for team {team}: {str(e)}")
            continue

    print(f"DEBUG - Total results from all teams: {len(all_results)}")

    if not all_results:
        return []

    # ✅ Get child counts and share counts
    team_names = list(set(r["team"] for r in all_results if r.get("team")))

    if team_names:
        team_condition = Criterion.any(DriveFile.team == team for team in team_names)

        child_count_query = (
            frappe.qb.from_(DriveFile)
            .where(team_condition & (DriveFile.is_active == 1))
            .select(DriveFile.parent_entity, fn.Count("*").as_("child_count"))
            .groupby(DriveFile.parent_entity)
        )
        share_query = (
            frappe.qb.from_(DriveFile)
            .right_join(DrivePermission)
            .on(DrivePermission.entity == DriveFile.name)
            .where(
                (DrivePermission.user != "") & (DrivePermission.user != "$TEAM") & team_condition
            )
            .select(DriveFile.name, fn.Count("*").as_("share_count"))
            .groupby(DriveFile.name)
        )
        public_files_query = (
            frappe.qb.from_(DrivePermission)
            .inner_join(DriveFile)
            .on(DrivePermission.entity == DriveFile.name)
            .where((DrivePermission.user == "") & team_condition)
            .select(DrivePermission.entity)
        )
        team_files_query = (
            frappe.qb.from_(DrivePermission)
            .inner_join(DriveFile)
            .on(DrivePermission.entity == DriveFile.name)
            .where((DrivePermission.user == "$TEAM") & team_condition)
            .select(DrivePermission.entity)
        )

        public_files = set(k[0] for k in public_files_query.run())
        team_files = set(k[0] for k in team_files_query.run())
        children_count = dict(child_count_query.run())
        share_count = dict(share_query.run())
    else:
        public_files = set()
        team_files = set()
        children_count = {}
        share_count = {}

    # Add computed fields
    for r in all_results:
        r["children"] = children_count.get(r["name"], 0)
        r["file_type"] = get_file_type(r)
        if r["name"] in public_files:
            r["share_count"] = -2
        elif r["name"] in team_files:
            r["share_count"] = -1
        else:
            r["share_count"] = share_count.get(r["name"], 0)

    # ✅ Sort results
    if field in ["modified", "creation", "title", "file_size", "accessed"]:
        reverse = not ascending

        if field == "title":
            all_results.sort(key=lambda x: (x.get(field) or "").lower(), reverse=reverse)
        elif field == "accessed":
            has_accessed = [r for r in all_results if r.get(field) is not None]
            no_accessed = [r for r in all_results if r.get(field) is None]
            has_accessed.sort(key=lambda x: x.get(field, ""), reverse=reverse)
            all_results = has_accessed + no_accessed
        else:
            all_results.sort(key=lambda x: x.get(field, ""), reverse=reverse)

    # ✅ Apply cursor pagination
    if cursor and all_results:
        if field in all_results[0]:
            filtered_results = []
            for r in all_results:
                if ascending and r.get(field, "") > cursor:
                    filtered_results.append(r)
                elif not ascending and r.get(field, "") < cursor:
                    filtered_results.append(r)
            all_results = filtered_results

    # Apply limit
    if limit:
        all_results = all_results[: int(limit)]

    print(f"DEBUG - Final results count after limit: {len(all_results)}")
    return all_results


@frappe.whitelist()
def get_trash_files(
    teams=None,
    entity_name=None,
    order_by="modified 0",
    limit=20,
    cursor=None,
    tag_list=[],
    file_kinds=[],
    folders=0,
    only_parent=1,
):
    """
    Lấy file trong thùng rác (is_active=0) của user
    Logic: Lấy tất cả file/shortcut có modified_by = current user và is_active = 0

    :param teams: Giữ để tương thích API
    :param entity_name: Không dùng cho trash (luôn hiển thị flat list)
    :param only_parent: Mặc định = 1 để chỉ hiển thị file xóa trực tiếp
    :return: Danh sách các file trong thùng rác
    :rtype: list[frappe._dict]
    """

    def safe_int_conversion(value, default=0):
        """Safely convert value to int, handling string boolean values"""
        if isinstance(value, str):
            if value.lower() in ["true", "1"]:
                return 1
            elif value.lower() in ["false", "0"]:
                return 0
            else:
                try:
                    return int(value)
                except ValueError:
                    return default
        try:
            return int(value)
        except (ValueError, TypeError):
            return default

    # Convert parameters
    field, ascending = order_by.split(" ")
    only_parent = safe_int_conversion(only_parent, 1)
    folders = safe_int_conversion(folders, 0)
    ascending = safe_int_conversion(ascending, 1)
    user = frappe.session.user if frappe.session.user != "Guest" else ""

    print(f"DEBUG - Getting trash files for user: {user}, only_parent: {only_parent}")

    # ✅ BƯỚC 1: Query file gốc trong thùng rác của user
    original_files_query = (
        frappe.qb.from_(DriveFile)
        .select(
            *ENTITY_FIELDS,
            DriveFile.team,
            DriveFile.is_active,
            DriveFile.modified,
        )
        .where(
            (DriveFile.is_active == 0)  # Trong thùng rác
            & (DriveFile.modified_by == user)  # User đã xóa
        )
    )

    # ✅ BƯỚC 2: Query shortcuts trong thùng rác của user
    shortcut_files_query = (
        frappe.qb.from_(DriveFile)
        .inner_join(DriveShortcut)
        .on((DriveShortcut.file == DriveFile.name) & (DriveShortcut.is_shortcut == 1))
        .select(
            *ENTITY_FIELDS,
            DriveShortcut.is_shortcut,
            DriveShortcut.shortcut_owner,
            DriveShortcut.is_favourite,
            DriveShortcut.name.as_("shortcut_name"),
            DriveShortcut.title.as_("shortcut_title"),
            DriveShortcut.parent_folder.as_("parent_entity"),
            DriveFile.is_active,
            DriveFile.team,
            DriveFile.modified,
        )
        .where(
            (DriveShortcut.is_active == 0)  # Shortcut trong thùng rác
            & (DriveShortcut.shortcut_owner == user)  # Thuộc về user
        )
    )

    # ✅ BƯỚC 3: Filter để chỉ hiển thị items được xóa trực tiếp
    # Logic: Loại bỏ items nếu parent_entity tồn tại VÀ parent đó cũng bị xóa (is_active=0)

    if only_parent:
        # Subquery: Lấy tất cả file đã bị xóa (is_active=0)
        deleted_parents_subquery = (
            frappe.qb.from_(DriveFile).select(DriveFile.name).where(DriveFile.is_active == 0)
        )

        # Filter: Loại bỏ items có parent trong danh sách deleted
        # Chỉ giữ lại items có:
        # - parent_entity rỗng/NULL (root level)
        # - HOẶC parent_entity KHÔNG nằm trong danh sách deleted
        original_files_query = original_files_query.where(
            (DriveFile.parent_entity.isnull() | (DriveFile.parent_entity == ""))  # Root
            | (~DriveFile.parent_entity.isin(deleted_parents_subquery))  # Parent NOT deleted
        )

        # Tương tự cho shortcuts
        shortcut_files_query = shortcut_files_query.where(
            (DriveShortcut.parent_folder.isnull() | (DriveShortcut.parent_folder == ""))
            | (~DriveShortcut.parent_folder.isin(deleted_parents_subquery))
        )

        print(f"DEBUG - Applied only_parent=1: Exclude items with deleted parents")
    else:
        print(f"DEBUG - only_parent=0: Showing ALL deleted items")

    # ✅ Apply file kinds filter
    def apply_file_kinds_filter(query, file_kinds):
        """Apply file kinds filtering"""
        if not file_kinds:
            return query

        file_kinds_parsed = json.loads(file_kinds) if isinstance(file_kinds, str) else file_kinds

        if not file_kinds_parsed:
            return query

        mime_types = []
        criterion = []

        for kind in file_kinds_parsed:
            mime_types.extend(MIME_LIST_MAP.get(kind, []))

        if mime_types:
            criterion.extend([DriveFile.mime_type == mime_type for mime_type in mime_types])

        if "Folder" in file_kinds_parsed:
            criterion.append(DriveFile.is_group == 1)

        return query.where(Criterion.any(criterion)) if criterion else query

    # ✅ Apply folder filter
    if folders:
        original_files_query = original_files_query.where(DriveFile.is_group == 1)
        # Shortcuts không thể là folder nên không cần filter

    # ✅ Apply tag filter
    def apply_tag_filter(query, tag_list):
        """Apply tag filtering"""
        if not tag_list:
            return query

        tag_list_parsed = json.loads(tag_list) if not isinstance(tag_list, list) else tag_list
        query = query.left_join(DriveEntityTag).on(DriveEntityTag.parent == DriveFile.name)
        tag_criteria = [DriveEntityTag.tag == tag for tag in tag_list_parsed]
        return query.where(Criterion.any(tag_criteria))

    original_files_query = apply_file_kinds_filter(original_files_query, file_kinds)
    original_files_query = apply_tag_filter(original_files_query, tag_list)

    shortcut_files_query = apply_file_kinds_filter(shortcut_files_query, file_kinds)
    shortcut_files_query = apply_tag_filter(shortcut_files_query, tag_list)

    # ✅ BƯỚC 4: Execute queries
    main_results = original_files_query.run(as_dict=True)
    print(f"DEBUG - Original files in trash: {len(main_results)}")

    for result in main_results:
        result["_source"] = "main"
        result["is_shortcut"] = False
        result["shortcut_owner"] = None

    shortcut_results = shortcut_files_query.run(as_dict=True)
    print(f"DEBUG - Shortcut files in trash: {len(shortcut_results)}")

    for result in shortcut_results:
        result["_source"] = "shortcut"
        result["is_shortcut"] = True

    # Combine results
    all_results = main_results + shortcut_results
    print(f"DEBUG - Total trash results: {len(all_results)}")

    if not all_results:
        return []

    # ✅ BƯỚC 5: Add team info
    team_names = list(set(r["team"] for r in all_results if r.get("team")))
    team_info_map = {}

    if team_names:
        team_infos = frappe.get_all(
            "Drive Team", filters={"name": ["in", team_names]}, fields=["name", "title"]
        )
        team_info_map = {t["name"]: t for t in team_infos}

    for result in all_results:
        team_name = result.get("team")
        if team_name and team_name in team_info_map:
            result["team_name"] = team_info_map[team_name]["title"]
        else:
            result["team_name"] = team_name

    # ✅ BƯỚC 6: Get child counts and share counts
    result_teams = list(set(r["team"] for r in all_results if r.get("team")))

    if result_teams:
        team_condition = Criterion.any(DriveFile.team == team for team in result_teams)

        # Child count for trash: count deleted children
        child_count_query = (
            frappe.qb.from_(DriveFile)
            .where(team_condition & (DriveFile.is_active == 0))
            .select(DriveFile.parent_entity, fn.Count("*").as_("child_count"))
            .groupby(DriveFile.parent_entity)
        )
        share_query = (
            frappe.qb.from_(DriveFile)
            .right_join(DrivePermission)
            .on(DrivePermission.entity == DriveFile.name)
            .where(
                (DrivePermission.user != "") & (DrivePermission.user != "$TEAM") & team_condition
            )
            .select(DriveFile.name, fn.Count("*").as_("share_count"))
            .groupby(DriveFile.name)
        )
        public_files_query = (
            frappe.qb.from_(DrivePermission)
            .inner_join(DriveFile)
            .on(DrivePermission.entity == DriveFile.name)
            .where((DrivePermission.user == "") & team_condition)
            .select(DrivePermission.entity)
        )
        team_files_query = (
            frappe.qb.from_(DrivePermission)
            .inner_join(DriveFile)
            .on(DrivePermission.entity == DriveFile.name)
            .where((DrivePermission.user == "$TEAM") & team_condition)
            .select(DrivePermission.entity)
        )

        public_files = set(k[0] for k in public_files_query.run())
        team_files = set(k[0] for k in team_files_query.run())
        children_count = dict(child_count_query.run())
        share_count = dict(share_query.run())
    else:
        public_files = set()
        team_files = set()
        children_count = {}
        share_count = {}

    # Add computed fields
    for r in all_results:
        r["children"] = children_count.get(r["name"], 0)
        r["file_type"] = get_file_type(r)
        if r["name"] in public_files:
            r["share_count"] = -2
        elif r["name"] in team_files:
            r["share_count"] = -1
        else:
            r["share_count"] = share_count.get(r["name"], 0)

        # ✅ Calculate days remaining before permanent deletion
        if r.get("modified"):
            try:
                modified_date = r["modified"]
                if isinstance(modified_date, str):
                    try:
                        modified_datetime = datetime.strptime(
                            modified_date, "%Y-%m-%d %H:%M:%S.%f"
                        )
                    except ValueError:
                        modified_datetime = datetime.strptime(modified_date, "%Y-%m-%d %H:%M:%S")
                else:
                    modified_datetime = modified_date

                r["days_remaining"] = calculate_days_remaining(modified_datetime)
            except Exception as e:
                frappe.log_error(f"Error calculating days_remaining for {r['name']}: {str(e)}")
                r["days_remaining"] = None

    # ✅ BƯỚC 7: Sort results
    if field in ["modified", "creation", "title", "file_size"]:
        reverse = not ascending

        if field == "title":
            all_results.sort(key=lambda x: (x.get(field) or "").lower(), reverse=reverse)
        else:
            all_results.sort(key=lambda x: x.get(field, ""), reverse=reverse)

    # ✅ BƯỚC 8: Apply cursor pagination
    if cursor and all_results:
        if field in all_results[0]:
            filtered_results = []
            for r in all_results:
                if ascending and r.get(field, "") > cursor:
                    filtered_results.append(r)
                elif not ascending and r.get(field, "") < cursor:
                    filtered_results.append(r)
            all_results = filtered_results

    # Apply limit
    # if limit:
    #     all_results = all_results[: int(limit)]

    print(f"DEBUG - Final trash results count: {len(all_results)}")
    return all_results


def calculate_days_remaining(modified_datetime):
    """
    Calculate days remaining before permanent deletion (30 days from modification)

    :param modified_datetime: datetime object when file was moved to trash
    :return: Number of days remaining
    """
    from datetime import datetime, timedelta

    now = datetime.now()
    deletion_date = modified_datetime + timedelta(days=30)
    days_remaining = (deletion_date - now).days

    return max(0, days_remaining)  # Don't return negative numbers

@frappe.whitelist()
def drive_list_all_folders():
    user = frappe.session.user
    teams = get_teams()

    # 1. Lấy default_team của user
    default_team = frappe.db.get_value(
        "Drive Settings",
        {"user": user},
        "default_team"
    )

    if not default_team:
        frappe.throw("User has no default team configured in Drive Settings")

    # 2. Lấy root (Drive - <team>)
    home = get_home_folder(default_team)["name"]

    # 3. Lấy tất cả folder personal ngay dưới root
    personal_roots = frappe.get_all(
        "Drive File",
        filters={
            "team": default_team,
            "owner": user,
            "is_active": 1,
            "is_group": 1,
            "is_private": 1,
            "parent_entity": home
        },
        fields=["name", "title"]
    )

    # 4. Build tree con cho từng folder personal
    personal_children = [
        {
            "name": r.name,
            "title": r.title,
            "children": _build_personal_subfolders(r.name, user),
            "parent": default_team
        }
        for r in personal_roots
    ]


    personal_result = {
        "name": default_team,
        "title": "Tài liệu của tôi",
        "is_personal": 1,
        "parent": "",
        "children": personal_children
    }

    teams_result = []
    for team in teams:
        home = get_home_folder(team)["name"]

        team_info = frappe.db.get_value(
            "Drive Team", team, ["name", "title"], as_dict=True
        )

        root_children = _build_team_subfolders(home)

        team_entry = {
            "name": team,
            "team_name": team_info.title,
        }

        # Nếu có folder con thì mới trả root
        if root_children:
            team_entry["children"] = {
                "name": home,
                "title": team_info.title,
                "parent": team,
                "children": root_children
            }

        teams_result.append(team_entry)        

    return {
        "personal": personal_result,
        "teams": teams_result
    }


def _build_personal_subfolders(parent, user):
    rows = frappe.get_all(
        "Drive File",
        filters={
            "parent_entity": parent,
            "is_group": 1,
            "is_active": 1,
            "owner": user,
            "is_private": 1
        },
        fields=["name", "title"]
    )
    return [
        {
            "name": r.name,
            "title": r.title,
            "children": _build_personal_subfolders(r.name, user)
        }
        for r in rows
    ]


def _build_team_subfolders(parent):
    rows = frappe.get_all(
        "Drive File",
        filters={
            "parent_entity": parent,
            "is_group": 1,
            "is_active": 1,
            "is_private": 0
        },
        fields=["name", "title"]
    )
    return [
        {
            "name": r.name,
            "title": r.title,
            "children": _build_team_subfolders(r.name)
        }
        for r in rows
    ]
