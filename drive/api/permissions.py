import frappe
from frappe.utils import getdate

from drive.utils.users import mark_as_viewed
from drive.utils.files import get_valid_breadcrumbs, generate_upward_path, get_file_type


ENTITY_FIELDS = [
    "name",
    "title",
    "is_group",
    "is_link",
    "path",
    "modified",
    "creation",
    "file_size",
    "mime_type",
    "color",
    "document",
    "owner",
    "parent_entity",
    "is_private",
]


@frappe.whitelist(allow_guest=True)
def get_user_access(entity, user=frappe.session.user):
    """
    Return the user specific access permissions for an entity if it exists or general access permissions

    :param entity_name: Document-name of the entity whose permissions are to be fetched
    :return: Dict of general access permissions (read, write)
    :rtype: frappe._dict or None
    """
    if isinstance(entity, str):
        entity = frappe.get_doc("Drive File", entity)

    if user == entity.owner:
        return {"read": 1, "comment": 1, "share": 1, "write": 1, "type": "admin"}
    teams = get_teams(user)

    # Quyền mặc định
    access = {"read": 0, "comment": 0, "share": 0, "write": 0, "type": "guest"}

    # Quyền theo team
    if entity.team in teams and entity.is_private == 0:
        access_level = get_access(entity.team)
        access.update(
            {
                "read": 1,
                "comment": 1,
                "share": 1,
                "write": 1 if ((entity.is_group and access_level) or access_level == 2) else 0,
                "type": {2: "team-admin", 1: "team", 0: "guest"}[access_level],
            }
        )

    # Quyền theo chia sẻ trực tiếp
    path = generate_upward_path(entity.name, user)
    user_access = {k: v for k, v in path[-1].items() if k in access.keys()}
    if user != "Guest":
        public_path = generate_upward_path(entity.name, "Guest")
        public_access = {k: v for k, v in public_path[-1].items() if k in access.keys()}
    else:
        public_access = {}

    valid_accesses = [user_access, public_access]

    # Thêm quyền từ $TEAM nếu user trong team
    if entity.team in teams:
        team_path = generate_upward_path(entity.name, "$TEAM")
        team_access = {k: v for k, v in team_path[-1].items() if k in access.keys()}
        valid_accesses.append(team_access)

    # Merge lại quyền
    for access_type in valid_accesses:
        for key, v in access_type.items():
            if v:
                access[key] = 1

    return access


@frappe.whitelist()
def is_admin(team):
    drive_team = {k.user: k for k in frappe.get_doc("Drive Team", team).users}
    return drive_team[frappe.session.user].access_level == 2


def get_access(team):
    drive_team = {k.user: k for k in frappe.get_doc("Drive Team", team).users}
    return drive_team[frappe.session.user].access_level


@frappe.whitelist()
def get_teams(user=None, details=None):
    """
    Returns all the teams that the current user is part of.
    """
    if not user:
        user = frappe.session.user
    teams = frappe.get_all(
        "Drive Team Member",
        pluck="parent",
        filters=[
            ["parenttype", "=", "Drive Team"],
            ["user", "=", user],
        ],
    )
    if details:
        return {team: frappe.get_doc("Drive Team", team) for team in teams}

    return teams


@frappe.whitelist(allow_guest=True)
def get_entity_with_permissions(entity_name):
    """
    Return file data with permissions

    :param entity_name: Name of file document.
    :raises IsADirectoryError: If this DriveEntity doc is not a file
    :return: DriveEntity with permissions
    :rtype: frappe._dict
    """
    entity = frappe.db.get_value(
        "Drive File", {"name": entity_name}, ENTITY_FIELDS + ["team"], as_dict=1
    )
    print("Fetched entity:", entity)
    if not entity:
        frappe.throw(
            "Tài liệu bạn truy cập đã bị xoá và không còn khả dụng.", {"error": frappe.NotFound}
        )

    user_access = get_user_access(entity, frappe.session.user)
    if user_access.get("read") == 0:
        frappe.throw(
            "Bạn không có quyền truy cập tài liệu này.", {"error": frappe.PermissionError}
        )

    owner_info = (
        frappe.db.get_value("User", entity.owner, ["user_image", "full_name"], as_dict=True) or {}
    )
    breadcrumbs = {"breadcrumbs": get_valid_breadcrumbs(entity, user_access)}
    favourite = frappe.db.get_value(
        "Drive Favourite",
        {
            "entity": entity_name,
            "user": frappe.session.user,
        },
        ["entity as is_favourite"],
    )
    # mark_as_viewed(entity)
    file_type = get_file_type(entity)
    return_obj = (
        entity
        | user_access
        | owner_info
        | breadcrumbs
        | {"is_favourite": favourite, "file_type": file_type}
    )
    entity_doc_content = (
        frappe.db.get_value(
            "Drive Document",
            entity.document,
            ["content", "raw_content", "settings", "version"],
            as_dict=1,
        )
        or {}
    )
    return return_obj | entity_doc_content


@frappe.whitelist()
def get_shared_with_list(entity):
    """
    Return the list of users with whom this file or folder has been shared

    :param entity: Document-name of this file or folder
    :raises PermissionError: If the user does not have edit permissions
    :return: List of users, with permissions and last modified datetime
    :rtype: list[frappe._dict]
    """
    if not frappe.has_permission(
        doctype="Drive File", doc=entity, ptype="share", user=frappe.session.user
    ):
        raise frappe.PermissionError

    # Lấy thông tin file/folder
    entity_doc = frappe.get_doc("Drive File", entity)

    # Danh sách cuối cùng
    all_users = []

    # 1. Thêm owner
    owner_info = frappe.db.get_value(
        "User",
        entity_doc.owner,
        ["user_image", "full_name", "name as user", "email"],
        as_dict=True,
    )
    owner_info.update(
        {"read": 1, "write": 1, "comment": 1, "share": 1, "is_owner": True, "source": "owner"}
    )
    all_users.append(owner_info)

    # 2. Lấy permissions trực tiếp
    direct_permissions = frappe.db.get_all(
        "Drive Permission",
        filters=[["entity", "=", entity], ["user", "!=", ""], ["user", "!=", "$TEAM"]],
        fields=["user", "read", "write", "comment", "share"],
    )

    for perm in direct_permissions:
        user_info = frappe.db.get_value(
            "User", perm.user, ["user_image", "full_name", "email"], as_dict=True
        )
        if user_info:  # Kiểm tra user còn tồn tại
            perm.update(user_info)
            perm["source"] = "direct"
            all_users.append(perm)

    # 3. Lấy team members
    team_permission = frappe.db.get_value(
        "Drive Permission",
        {"entity": entity, "user": "$TEAM"},
        ["read", "write", "comment", "share"],
        as_dict=True,
    )

    # Hiển thị team members nếu:
    # 1. Có team permission, HOẶC
    # 2. File thuộc về team và không private (sử dụng quyền mặc định theo team)
    if entity_doc.team and (team_permission or not entity_doc.is_private):
        # Lấy tất cả user đã có trong danh sách
        existing_users = {user["user"] for user in all_users}

        # Nếu không có team permission, sử dụng quyền mặc định theo logic get_user_access
        if not team_permission:
            # Không có team permission explicit, cần kiểm tra từng member một
            team_permission = {
                "read": 1,  # Quyền read mặc định cho team member
                "comment": 1,
                "share": 0,  # Mặc định không có quyền share
                "write": 0,  # Mặc định không có quyền write
            }

            # Team member chỉ có quyền write/share nếu họ là admin của team
            def get_member_permission(member_user):
                member_access_level = frappe.db.get_value(
                    "Drive Team Member",
                    {"parent": entity_doc.team, "user": member_user},
                    "access_level",
                )
                if member_access_level == 2:  # Admin
                    return {
                        "read": 1,
                        "comment": 1,
                        "share": 1,
                        "write": 1 if entity_doc.is_group else 1,
                    }
                return team_permission.copy()

        if team_permission:
            # Lấy tất cả thành viên của Drive Team
            team_members = frappe.db.sql(
                """
                SELECT DISTINCT u.name as user, u.user_image, u.full_name, u.email
                FROM `tabUser` u
                INNER JOIN `tabDrive Team Member` dtm ON dtm.user = u.name
                WHERE dtm.parent = %s 
                AND dtm.parenttype = 'Drive Team'
                AND u.enabled = 1
                AND u.name NOT IN %s
            """,
                (entity_doc.team, tuple(existing_users) if existing_users else ("",)),
                as_dict=True,
            )

            print(f"Found {len(team_members)} team members:", [m["user"] for m in team_members])

            for member in team_members:
                # Lấy quyền cụ thể cho từng member dựa trên vai trò của họ trong team
                member_permissions = get_member_permission(member.user)
                team_member = {
                    "user": member.user,
                    "user_image": member.user_image,
                    "full_name": member.full_name,
                    "email": member.email,
                    "read": member_permissions.get("read", 0),
                    "write": member_permissions.get("write", 0),
                    "comment": member_permissions.get("comment", 0),
                    "share": member_permissions.get("share", 0),
                    "source": "team",
                    "team_name": entity_doc.team,
                    "has_explicit_permission": bool(
                        frappe.db.get_value(
                            "Drive Permission", {"entity": entity, "user": "$TEAM"}
                        )
                    ),
                }
                all_users.append(team_member)

    # 4. Lọc trùng email - Giữ theo thứ tự ưu tiên: owner > direct > team
    def deduplicate_by_email(users_list):
        """
        Lọc trùng email, ưu tiên theo thứ tự:
        1. owner (is_owner = True)
        2. direct (source = "direct")
        3. team (source = "team")
        """
        seen_emails = {}
        unique_users = []

        # Sắp xếp theo thứ tự ưu tiên trước khi lọc
        priority_order = {"owner": 0, "direct": 1, "team": 2}
        users_list.sort(
            key=lambda x: (priority_order.get(x.get("source"), 3), 0 if x.get("is_owner") else 1)
        )

        for user in users_list:
            email = user.get("email")
            if email and email not in seen_emails:
                seen_emails[email] = True
                unique_users.append(user)
            elif email:
                # Log thông tin user bị duplicate để debug
                print(
                    f"Duplicate email found and skipped: {email} - {user.get('full_name')} ({user.get('source')})"
                )

        return unique_users

    # Áp dụng lọc trùng email
    all_users = deduplicate_by_email(all_users)

    # 5. Sắp xếp kết quả cuối cùng
    all_users.sort(
        key=lambda x: (
            0 if x.get("is_owner") else 1 if x.get("source") == "direct" else 2,
            x.get("full_name", "").lower(),
        )
    )

    return all_users


# Hàm utility riêng biệt để lọc trùng email (có thể tái sử dụng)
def remove_duplicate_emails(users_list, keep_priority=None):
    """
    Lọc trùng email từ danh sách users

    :param users_list: List of user dictionaries
    :param keep_priority: List thứ tự ưu tiên source ['owner', 'direct', 'team']
    :return: List users đã lọc trùng
    """
    if keep_priority is None:
        keep_priority = ["owner", "direct", "team"]

    # Tạo mapping priority
    priority_map = {source: idx for idx, source in enumerate(keep_priority)}

    # Group theo email
    email_groups = {}
    for user in users_list:
        email = user.get("email")
        if email:
            if email not in email_groups:
                email_groups[email] = []
            email_groups[email].append(user)

    # Chọn user tốt nhất cho mỗi email
    unique_users = []
    for email, users in email_groups.items():
        if len(users) == 1:
            unique_users.append(users[0])
        else:
            # Sắp xếp theo ưu tiên và chọn user đầu tiên
            users.sort(
                key=lambda x: (
                    priority_map.get(x.get("source"), 999),
                    0 if x.get("is_owner") else 1,
                )
            )
            unique_users.append(users[0])

            # Log các user bị loại bỏ
            for removed_user in users[1:]:
                print(
                    f"Removed duplicate: {removed_user.get('full_name')} ({removed_user.get('source')}) - Email: {email}"
                )

    return unique_users


def auto_delete_expired_perms():
    current_date = getdate()
    expired_documents = frappe.get_list(
        "Drive Permission",
        filters=[
            ["valid_until", "is", "set"],
            ["valid_until", "<", current_date],
        ],
        fields=["name", "valid_until"],
    )
    if expired_documents:

        def batch_delete_perms(docs):
            for d in docs:
                frappe.delete_doc("Drive Permission", d.name)

        frappe.enqueue(batch_delete_perms, docs=expired_documents)


def user_has_permission(doc, ptype, user):
    if doc.owner == user or user == "Administrator":
        return True
    access = get_user_access(doc, user)
    if ptype in access:
        return access[ptype]
    else:
        return False
