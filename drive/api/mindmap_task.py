import frappe
from frappe import _


def _first_existing_field(meta, candidates):
    """Return the first field that exists on the DocType."""
    for field in candidates:
        if field == "owner" or meta.has_field(field):
            return field
    return None


def _is_project_admin(user, project=None):
    """Check if user can see all tasks of a project."""
    privileged_roles = {
        "System Manager",
    }
    roles = set(frappe.get_roles(user))
    if roles.intersection(privileged_roles):
        # DEBUG: Log privileged role
        print(
            f"[DEBUG _is_project_admin] user={user} has privileged role, returning True",
            "get_my_tasks_debug",
        )
        return True

    if not project:
        # DEBUG: Log no project
        print(
            f"[DEBUG _is_project_admin] user={user}, no project filter, returning False",
            "get_my_tasks_debug",
        )
        return False

    try:
        if not frappe.db.exists("Project", project):
            return False

        # Lấy Officer từ user
        officer = frappe.db.get_value("Officer", {"user": user}, "name")
        if not officer:
            return False

        # Kiểm tra user là project_owner hoặc project_manager
        project_meta = frappe.get_meta("Project")
        project_fields = []
        for f in ["project_manager", "project_owner"]:
            if project_meta.has_field(f):
                project_fields.append(f)

        if project_fields:
            proj = frappe.db.get_value("Project", project, project_fields, as_dict=True)
            if proj and officer in proj.values():
                # DEBUG: Log project owner/manager
                print(
                    f"[DEBUG _is_project_admin] user={user} is project owner/manager of {project}, returning True",
                    "get_my_tasks_debug",
                )
                return True

        # Kiểm tra user có trong Project User với position là "Chủ Dự Án" hoặc "Quản Trị Dự Án"
        position = frappe.db.get_value(
            "Project User", {"parent": project, "user": officer}, "position"
        )
        # DEBUG: Log position
        print(
            f"[DEBUG _is_project_admin] user={user}, project={project}, position={position}",
            "get_my_tasks_debug",
        )
        if position and position in ["Chủ Dự Án", "Quản Trị Dự Án"]:
            print(
                f"[DEBUG _is_project_admin] user={user} is Chủ Dự Án/Quản Trị Dự Án of {project}, returning True",
                "get_my_tasks_debug",
            )
            return True

        print(
            f"[DEBUG _is_project_admin] user={user} is NOT admin of {project}, returning False",
            "get_my_tasks_debug",
        )
        return False
    except Exception as e:
        print(f"[DEBUG _is_project_admin] Exception: {str(e)}", "get_my_tasks_debug")
        return False


def _build_involvement_sql_where(user, project=None, task_meta=None):
    """Build SQL WHERE clause to find tasks where the user is involved."""
    # DEBUG: Log thông tin user và project
    print(
        f"[DEBUG _build_involvement_sql_where] user={user}, project={project}",
        "get_my_tasks_debug",
    )

    # Lấy Officer từ user trước để so sánh với các field lưu Officer
    officer = frappe.db.get_value("Officer", {"user": user}, "name")

    # DEBUG: Log officer
    print(
        f"[DEBUG _build_involvement_sql_where] officer={officer}", "get_my_tasks_debug"
    )

    if not officer:
        # Nếu không có officer, chỉ kiểm tra owner
        print(
            f"[DEBUG _build_involvement_sql_where] No officer found, returning owner condition",
            "get_my_tasks_debug",
        )
        return f"`tabTask`.`owner` = {frappe.db.escape(user)}"

    # Kiểm tra user có phải là "Thành Viên" của project không
    # Nếu có project filter, kiểm tra trong project đó
    # Nếu không có project filter, kiểm tra xem user có phải là "Thành Viên" của bất kỳ project nào không
    is_member_only = False
    if officer:
        if project:
            # Kiểm tra trong project cụ thể
            position = frappe.db.get_value(
                "Project User", {"parent": project, "user": officer}, "position"
            )
            # DEBUG: Log position
            print(
                f"[DEBUG _build_involvement_sql_where] project={project}, position={position}",
                "get_my_tasks_debug",
            )
            if position == "Thành Viên":
                is_member_only = True
        else:
            # Kiểm tra xem user có phải là "Thành Viên" của bất kỳ project nào không
            # Nếu có, chỉ xem tasks của họ (không xem tasks chỉ vì owner hoặc ToDo)
            member_projects = frappe.db.get_all(
                "Project User",
                filters={"user": officer, "position": "Thành Viên"},
                pluck="parent",
                distinct=True,
            )
            # DEBUG: Log member_projects
            print(
                f"[DEBUG _build_involvement_sql_where] No project filter, member_projects={member_projects}",
                "get_my_tasks_debug",
            )
            if member_projects:
                # Nếu user là "Thành Viên" của ít nhất một project, chỉ xem tasks của họ
                is_member_only = True

    # DEBUG: Log is_member_only
    print(
        f"[DEBUG _build_involvement_sql_where] is_member_only={is_member_only}",
        "get_my_tasks_debug",
    )

    # Build SQL conditions
    conditions = []

    # Field groups để kiểm tra - sử dụng các field thực tế trong doctype Task
    # Chỉ kiểm tra các field thực sự tồn tại trong doctype
    field_conditions = []

    # Kiểm tra assign_to (người thực hiện)
    if task_meta and task_meta.has_field("assign_to"):
        field_conditions.append(f"`tabTask`.`assign_to` = {frappe.db.escape(officer)}")

    # Kiểm tra assigned_by (người phê duyệt)
    if task_meta and task_meta.has_field("assigned_by"):
        field_conditions.append(
            f"`tabTask`.`assigned_by` = {frappe.db.escape(officer)}"
        )

    # Kiểm tra new_approver (người phê duyệt mới)
    if task_meta and task_meta.has_field("new_approver"):
        field_conditions.append(
            f"`tabTask`.`new_approver` = {frappe.db.escape(officer)}"
        )

    if field_conditions:
        conditions.append("(" + " OR ".join(field_conditions) + ")")

    # Include document owner (trừ khi là Thành Viên)
    if not is_member_only:
        conditions.append(f"`tabTask`.`owner` = {frappe.db.escape(user)}")

    # Include Task Collaboration (collaborator)
    # Nếu có project filter, chỉ lấy tasks trong project đó
    collab_filters = {
        "officer": officer,
        "parenttype": "Task",
        "parentfield": "collaborator",
    }

    # Nếu có project filter, chỉ lấy tasks trong project đó
    if project and task_meta and task_meta.has_field("project"):
        # Lấy danh sách task IDs trong project trước
        project_task_ids = frappe.db.get_all(
            "Task",
            filters={"project": project},
            pluck="name",
        )
        if project_task_ids:
            collab_filters["parent"] = ["in", project_task_ids]
            collab_task_ids = frappe.db.get_all(
                "Task Collaboration",
                filters=collab_filters,
                pluck="parent",
                distinct=True,
            )
            if collab_task_ids:
                ids_str = ",".join([frappe.db.escape(tid) for tid in collab_task_ids])
                conditions.append(f"`tabTask`.`name` IN ({ids_str})")
    else:
        # Nếu không có project filter, lấy tất cả tasks mà user là collaborator
        collab_task_ids = frappe.db.get_all(
            "Task Collaboration",
            filters=collab_filters,
            pluck="parent",
            distinct=True,
        )
        if collab_task_ids:
            ids_str = ",".join([frappe.db.escape(tid) for tid in collab_task_ids])
            conditions.append(f"`tabTask`.`name` IN ({ids_str})")

    # Include ToDo assignments (trừ khi là Thành Viên)
    if not is_member_only:
        todo_task_ids = frappe.db.get_all(
            "ToDo",
            filters={
                "reference_type": "Task",
                "allocated_to": user,
                "status": ["!=", "Cancelled"],
            },
            pluck="reference_name",
            distinct=True,
        )
        if todo_task_ids:
            ids_str = ",".join([frappe.db.escape(tid) for tid in todo_task_ids])
            conditions.append(f"`tabTask`.`name` IN ({ids_str})")

    # DEBUG: Log conditions
    print(
        f"[DEBUG _build_involvement_sql_where] conditions={conditions}",
        "get_my_tasks_debug",
    )

    if conditions:
        result = "(" + " OR ".join(conditions) + ")"
        print(
            f"[DEBUG _build_involvement_sql_where] Returning: {result}",
            "get_my_tasks_debug",
        )
        return result
    print(
        f"[DEBUG _build_involvement_sql_where] No conditions, returning 1=0",
        "get_my_tasks_debug",
    )
    return "1=0"  # Không có điều kiện nào, không trả về task nào


@frappe.whitelist()
def get_my_tasks(project=None, page=1, page_size=10, search=None):
    """
    Lấy danh sách công việc tôi liên quan.

    - Tôi là người thực hiện / phê duyệt / phối hợp, hoặc chủ dự án/quản trị dự án thì thấy tất cả.
    - Lọc theo dự án (project) nếu truyền vào.
    - Order by ngày tạo (mới nhất trước).
    - Phân trang, mỗi trang 10 item.
    """
    try:
        task_meta = frappe.get_meta("Task")
    except Exception:
        frappe.throw(_("Task DocType is not available"))

    user = frappe.session.user
    try:
        page = max(1, int(page or 1))
    except Exception:
        page = 1

    page_size = 10
    offset = (page - 1) * page_size

    # Xác định các field cần select - sử dụng các field thực tế trong doctype Task
    title_field = "task_name"  # Field chính để lưu tên task
    assignee_field = "assign_to"  # Field chính để lưu người thực hiện
    status_field = "status"  # Field để lưu trạng thái
    project_name_field = "project_name"  # Field để lưu tên dự án
    has_project_field = task_meta.has_field("project")

    # Build WHERE conditions
    where_conditions = []

    # Project filter
    if project and has_project_field:
        where_conditions.append(f"`tabTask`.`project` = {frappe.db.escape(project)}")

    # Permission: if not project admin, restrict to tasks where user is involved
    # Đặc biệt: nếu user là "Thành Viên" của project, luôn áp dụng logic hạn chế
    is_admin = _is_project_admin(user, project)

    # Kiểm tra xem user có phải là "Thành Viên" của project không
    # Nếu là "Thành Viên", luôn áp dụng logic hạn chế, ngay cả khi có role admin
    is_member_restricted = False
    officer = frappe.db.get_value("Officer", {"user": user}, "name")
    if officer:
        if project:
            position = frappe.db.get_value(
                "Project User", {"parent": project, "user": officer}, "position"
            )
            if position == "Thành Viên":
                is_member_restricted = True
        else:
            # Kiểm tra xem user có phải là "Thành Viên" của bất kỳ project nào không
            member_projects = frappe.db.get_all(
                "Project User",
                filters={"user": officer, "position": "Thành Viên"},
                pluck="parent",
                distinct=True,
            )
            if member_projects:
                is_member_restricted = True

    # DEBUG: Log is_admin and is_member_restricted
    print(
        f"[DEBUG get_my_tasks] user={user}, project={project}, is_admin={is_admin}, is_member_restricted={is_member_restricted}",
        "get_my_tasks_debug",
    )

    # Nếu không phải admin HOẶC là "Thành Viên", áp dụng logic hạn chế
    if not is_admin or is_member_restricted:
        involvement_where = _build_involvement_sql_where(user, project, task_meta)
        # DEBUG: Log involvement_where
        print(
            f"[DEBUG get_my_tasks] involvement_where={involvement_where}",
            "get_my_tasks_debug",
        )
        if involvement_where and involvement_where != "1=0":
            where_conditions.append(involvement_where)
        else:
            # Nếu không có điều kiện nào, không trả về task nào
            where_conditions.append("1=0")

    # Status filter - loại trừ các trạng thái không cần hiển thị
    if status_field:
        where_conditions.append(
            f"`tabTask`.`{status_field}` NOT IN ('To Do', 'Paused')"
        )

    # Search filter
    if search:
        keyword = f"%{search.strip()}%"
        search_conditions = []
        if title_field:
            search_conditions.append(
                f"`tabTask`.`{title_field}` LIKE {frappe.db.escape(keyword)}"
            )
        if search_conditions:
            where_conditions.append("(" + " OR ".join(search_conditions) + ")")

    where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"

    # DEBUG: Log where_clause
    print(f"[DEBUG get_my_tasks] where_clause={where_clause}", "get_my_tasks_debug")

    # Build SELECT fields - sử dụng các field thực tế trong doctype Task
    select_fields = [
        "`tabTask`.`name` AS `id`",
        "`tabTask`.`creation`",
        f"`tabTask`.`{title_field}` AS `task_name`",
        f"`tabTask`.`{assignee_field}` AS `assignee`",
    ]

    if status_field:
        select_fields.append(f"`tabTask`.`{status_field}` AS `status`")

    if has_project_field:
        select_fields.append("`tabTask`.`project` AS `project`")

    if project_name_field:
        select_fields.append(f"`tabTask`.`{project_name_field}` AS `project_name`")

    # Join với Officer để lấy office_name từ assign_to
    join_clause = f"""
        LEFT JOIN `tabOfficer` ON `tabTask`.`{assignee_field}` = `tabOfficer`.`name`
    """
    select_fields.append("`tabOfficer`.`officer_name` AS `office_name`")

    # Count query
    count_sql = f"""
        SELECT COUNT(*) 
        FROM `tabTask`
        {join_clause}
        WHERE {where_clause}
    """
    total = frappe.db.sql(count_sql, as_dict=False)[0][0] or 0
    total_pages = max(1, (total + page_size - 1) // page_size)

    # Data query
    select_clause = ", ".join(select_fields)
    data_sql = f"""
        SELECT {select_clause}
        FROM `tabTask`
        {join_clause}
        WHERE {where_clause}
        ORDER BY `tabTask`.`creation` DESC
        LIMIT {page_size} OFFSET {offset}
    """

    # DEBUG: Log SQL query
    print(f"[DEBUG get_my_tasks] SQL Query:\n{data_sql}", "get_my_tasks_debug")

    tasks = frappe.db.sql(data_sql, as_dict=True)

    # DEBUG: Log results
    print(f"[DEBUG get_my_tasks] Found {len(tasks)} tasks", "get_my_tasks_debug")
    if tasks:
        print(f"[DEBUG get_my_tasks] First task: {tasks[0]}", "get_my_tasks_debug")

    # Map trạng thái sang tiếng Việt
    status_map = {
        "In Progress": "Thực hiện",
        "Pending": "Đang chờ",
        "Pending Approval": "Chờ phê duyệt",
        "Completed": "Hoàn thành",
        "Closed": "Đóng",
        "Cancelled": "Hủy",
        "Paused": "Tạm dừng",
        "To Do": "Được tạo",
    }
    for t in tasks:
        if t.get("status"):
            t["status_vi"] = status_map.get(t["status"], t["status"])

    return {
        "data": tasks,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        },
        "project": project,
    }


@frappe.whitelist()
def get_my_projects():
    """
    Lấy danh sách dự án mà user có quyền truy cập.

    - Trả về danh sách projects mà user là owner/approver/thành viên
    """
    try:
        user = frappe.session.user

        # Lấy Officer từ user
        officer = frappe.db.get_value("Officer", {"user": user}, "name")
        if not officer:
            return {
                "data": [],
            }

        # SQL query để lấy danh sách projects
        sql = f"""
            SELECT DISTINCT
                `tabProject`.`name`,
                `tabProject`.`project_name`,
                `tabProject`.`project_code`
            FROM `tabProject`
            LEFT JOIN `tabProject User` ON `tabProject`.`name` = `tabProject User`.`parent`
            WHERE 
                `tabProject`.`project_owner` = {frappe.db.escape(officer)}
                OR `tabProject`.`approver` = {frappe.db.escape(officer)}
                OR `tabProject User`.`user` = {frappe.db.escape(officer)}
            ORDER BY `tabProject`.`modified` DESC
        """

        rows = frappe.db.sql(sql, as_dict=True)

        # Format kết quả
        projects = []
        for row in rows:
            projects.append(
                {
                    "name": row.get("name"),
                    "project_name": row.get("project_name") or row.get("name"),
                    "project_code": row.get("project_code") or "",
                }
            )

        return {
            "data": projects,
        }
    except Exception as e:
        print(f"Error in get_my_projects: {str(e)}")
        return {
            "data": [],
        }
