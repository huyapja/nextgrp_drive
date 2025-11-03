import frappe
import json
from drive.utils.files import get_home_folder, MIME_LIST_MAP, get_file_type
from .permissions import ENTITY_FIELDS, get_user_access, get_teams
from pypika import Order, Criterion, functions as fn, CustomFunction
from datetime import datetime, timedelta


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
    order_by="accessed 1",
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
    order_by="accessed 1",
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

                    # ✅ JOIN với subquery thay vì bảng Recents trực tiếp
                    q = (
                        q.inner_join(recent_subquery)
                        .on(recent_subquery.entity_name == DriveFile.name)
                        .select(recent_subquery.max_interaction.as_("accessed"))
                        .orderby(recent_subquery.max_interaction, order=Order.desc)
                    )
                else:
                    recent_subquery = (
                        frappe.qb.from_(Recents).select(
                            Recents.entity_name,
                            fn.Max(Recents.last_interaction).as_("last_interaction"),
                        )
                        # .where(Recents.user == frappe.session.user)
                        .groupby(Recents.entity_name)
                    ).as_("recent_subq")

                    q = (
                        q.inner_join(recent_subquery)
                        .on(recent_subquery.entity_name == DriveFile.name)
                        .orderby(
                            recent_subquery.last_interaction,
                            order=Order.asc if ascending else Order.desc,
                        )
                        .select(recent_subquery.last_interaction.as_("accessed"))
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

    # Sort results
    if field in ["modified", "creation", "title", "file_size", "accessed"]:
        reverse = not ascending

        if field == "accessed":
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

    # Query chính - lấy tất cả file được chia sẻ, không lọc theo team của user
    query = (
        frappe.qb.from_(DriveFile)
        .right_join(DrivePermission)
        .on(
            (DrivePermission.entity == DriveFile.name)
            & ((DrivePermission.owner if by else DrivePermission.user) == frappe.session.user)
        )
        .left_join(Recents)
        # & (Recents.user == frappe.session.user)
        .on((Recents.entity_name == DriveFile.name))
        .where(
            (DrivePermission.read == 1)
            & (DriveFile.is_active == 1)
            # Bỏ điều kiện lọc theo team của user
        )
        .groupby(
            DriveFile.name,
            DriveFile.team,
            DriveFile.title,
            DriveFile.creation,
            DriveFile.modified,
            DriveFile.owner,
            DriveFile.mime_type,
            DriveFile.file_size,
            DriveFile.parent_entity,
            DriveFile.is_group,
            DrivePermission.user,
            DrivePermission.owner,
            DrivePermission.read,
            DrivePermission.share,
            DrivePermission.comment,
            DrivePermission.write,
        )
        .select(
            *ENTITY_FIELDS,
            Recents.last_interaction.as_("accessed"),
            DriveFile.team,
            DrivePermission.user,
            DrivePermission.owner.as_("sharer"),
            DrivePermission.read,
            DrivePermission.share,
            DrivePermission.comment,
            DrivePermission.write,
            fn.Max(DriveFile.modified).as_("last_modified"),
        )
    )

    # Xử lý order_by
    if order_by:
        order_parts = order_by.split()
        order_field = order_parts[0]
        is_desc = len(order_parts) > 1 and order_parts[1].lower() == "0"

        if "+" in order_field:
            base_field = order_field.split("+")[0]
            order_expr = (
                DriveFile[base_field] + 0
                if order_field != "accessed"
                else Recents.last_interaction
            )
            query = query.orderby(order_expr, order=Order.desc if is_desc else Order.asc)
        else:
            order_expr = (
                DriveFile[order_field] if order_field != "accessed" else Recents.last_interaction
            )
            query = query.orderby(order_expr, order=Order.desc if is_desc else Order.asc)

    if tag_list:
        tag_list = json.loads(tag_list) if not isinstance(tag_list, list) else tag_list
        query = query.left_join(DriveEntityTag).on(DriveEntityTag.parent == DriveFile.name)
        tag_list_criterion = [DriveEntityTag.tag == tags for tags in tag_list]
        query = query.where(Criterion.any(tag_list_criterion))

    if mime_type_list:
        mime_type_list = (
            json.loads(mime_type_list) if not isinstance(mime_type_list, list) else mime_type_list
        )
        query = query.where(
            Criterion.any(DriveFile.mime_type == mime_type for mime_type in mime_type_list)
        )

    # Execute query and get results
    res = query.run(as_dict=True)

    # Additional processing to ensure uniqueness
    unique_files = {}
    for r in res:
        file_key = f"{r['name']}_{r['team']}"
        if file_key not in unique_files or r["modified"] > unique_files[file_key]["modified"]:
            unique_files[file_key] = r

    res = list(unique_files.values())

    # Lấy thông tin TẤT CẢ các team từ các file trong kết quả
    # Không quan tâm user có thuộc team hay không
    file_teams = {r.get("team") for r in res if r.get("team")}
    team_info = {}
    for team in file_teams:
        info = frappe.get_value("Drive Team", team, ["name", "title"], as_dict=1)
        if info:
            team_info[team] = info

    # Get additional information - không cần lọc theo team nữa
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
        .inner_join(DriveFile)
        .on(DrivePermission.entity == DriveFile.name)
        .where((DrivePermission.user == ""))
        .select(DrivePermission.entity)
    )

    team_files_query = (
        frappe.qb.from_(DrivePermission)
        .inner_join(DriveFile)
        .on(DrivePermission.entity == DriveFile.name)
        .where((DrivePermission.user == "$TEAM"))
        .select(DrivePermission.entity)
    )

    public_files = set(k[0] for k in public_files_query.run())
    team_files = set(k[0] for k in team_files_query.run())
    children_count = dict(child_count_query.run())
    share_count = dict(share_query.run())

    # Add additional information to results
    for r in res:
        r["children"] = children_count.get(r["name"], 0)
        r["file_type"] = get_file_type(r)
        if r["name"] in public_files:
            r["share_count"] = -2
        elif r["name"] in team_files:
            r["share_count"] = -1
        else:
            r["share_count"] = share_count.get(r["name"], 0)

        # Add team information - Luôn hiển thị tên team của file
        current_team = r.get("team")
        if current_team and current_team in team_info:
            r["team"] = team_info[current_team]["name"]
            r["team_name"] = team_info[current_team]["title"]
        else:
            # Nếu không tìm thấy thông tin team, vẫn giữ nguyên
            r["team"] = current_team
            r["team_name"] = current_team

    # Return only non-child files
    parents = {r["name"] for r in res}
    return [r for r in res if r["parent_entity"] not in parents]
