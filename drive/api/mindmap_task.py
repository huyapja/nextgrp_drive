import frappe
from frappe import _


@frappe.whitelist()
def get_my_tasks(project=None, page=1, page_size=10, search=None):
    """
    Lấy danh sách công việc tôi liên quan.

    Flow mới:
    1. Lấy tất cả các projects mà user tham gia từ Project User
    2. Lặp qua từng project và kiểm tra position
    3. Với mỗi project:
       - Nếu position là "Thành Viên": chỉ lấy tasks mà user là assign_to hoặc collaborator (trừ To Do và Cancelled)
       - Nếu position là "Chủ Dự Án" hoặc "Quản Trị Dự Án": lấy tất cả tasks (trừ To Do và Cancelled)
    4. Kết hợp tất cả tasks lại
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

    # Lấy Officer từ user
    officer = frappe.db.get_value("Officer", {"user": user}, "name")
    if not officer:
        return {
            "data": [],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": 0,
                "total_pages": 0,
            },
            "project": project,
        }

    # Bước 1: Lấy tất cả các projects mà user tham gia từ Project User
    project_users = frappe.db.get_all(
        "Project User",
        filters={"user": officer},
        fields=["parent", "position"],
        order_by="parent",
    )

    # DEBUG: Log project_users
    print(
        f"[DEBUG get_my_tasks] user={user}, officer={officer}, project_users={project_users}",
        "get_my_tasks_debug",
    )

    if not project_users:
        # Nếu user không tham gia project nào, không trả về task nào
        return {
            "data": [],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": 0,
                "total_pages": 0,
            },
            "project": project,
        }

    # Bước 2: Lặp qua từng project và build điều kiện SQL
    task_conditions = []

    for pu in project_users:
        project_id = pu.get("parent")
        position = pu.get("position")

        # Nếu có project filter, chỉ xử lý project đó
        if project and project_id != project:
            continue

        # DEBUG: Log project và position
        print(
            f"[DEBUG get_my_tasks] Processing project={project_id}, position={position}",
            "get_my_tasks_debug",
        )

        if position == "Thành Viên":
            # Với "Thành Viên": chỉ lấy tasks mà user là assign_to hoặc collaborator
            member_conditions = []

            # Task mà user là assign_to
            member_conditions.append(
                f"(`tabTask`.`project` = {frappe.db.escape(project_id)} AND `tabTask`.`assign_to` = {frappe.db.escape(officer)})"
            )

            # Task mà user là collaborator
            collab_task_ids = frappe.db.get_all(
                "Task Collaboration",
                filters={
                    "officer": officer,
                    "parenttype": "Task",
                    "parentfield": "collaborator",
                },
                pluck="parent",
                distinct=True,
            )
            if collab_task_ids:
                # Lọc chỉ lấy tasks trong project này
                project_task_ids = frappe.db.get_all(
                    "Task",
                    filters={"project": project_id, "name": ["in", collab_task_ids]},
                    pluck="name",
                )
                if project_task_ids:
                    ids_str = ",".join(
                        [frappe.db.escape(tid) for tid in project_task_ids]
                    )
                    member_conditions.append(
                        f"(`tabTask`.`project` = {frappe.db.escape(project_id)} AND `tabTask`.`name` IN ({ids_str}))"
                    )

            if member_conditions:
                task_conditions.append("(" + " OR ".join(member_conditions) + ")")

        elif position in ["Chủ Dự Án", "Quản Trị Dự Án"]:
            # Với "Chủ Dự Án" và "Quản Trị Dự Án": lấy tất cả tasks trong project
            task_conditions.append(
                f"`tabTask`.`project` = {frappe.db.escape(project_id)}"
            )

    # Bước 3: Build SQL query với tất cả các điều kiện
    if not task_conditions:
        # Nếu không có điều kiện nào, không trả về task nào
        return {
            "data": [],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": 0,
                "total_pages": 0,
            },
            "project": project,
        }

    # Build WHERE clause
    where_conditions = []

    # Kết hợp tất cả các điều kiện từ các projects
    where_conditions.append("(" + " OR ".join(task_conditions) + ")")

    # Status filter - loại trừ To Do và Cancelled
    where_conditions.append("`tabTask`.`status` NOT IN ('To Do', 'Cancelled')")

    # Project filter (nếu có)
    if project:
        where_conditions.append(f"`tabTask`.`project` = {frappe.db.escape(project)}")

    # Search filter
    if search:
        keyword = f"%{search.strip()}%"
        # Tìm kiếm trong task_name và officer_name (người thực hiện)
        # Sử dụng COALESCE để xử lý NULL values từ LEFT JOIN
        search_conditions = [
            f"`tabTask`.`task_name` LIKE {frappe.db.escape(keyword)}",
            f"COALESCE(`tabOfficer`.`officer_name`, '') LIKE {frappe.db.escape(keyword)}",
        ]
        where_conditions.append("(" + " OR ".join(search_conditions) + ")")

        # DEBUG: Log search conditions
        print(
            f"[DEBUG get_my_tasks] search={search}, search_conditions={search_conditions}",
            "get_my_tasks_debug",
        )

    where_clause = " AND ".join(where_conditions)

    # DEBUG: Log where_clause
    print(f"[DEBUG get_my_tasks] where_clause={where_clause}", "get_my_tasks_debug")

    # Build SELECT fields
    select_fields = [
        "`tabTask`.`name` AS `id`",
        "`tabTask`.`creation`",
        "`tabTask`.`task_name` AS `task_name`",
        "`tabTask`.`assign_to` AS `assignee`",
        "`tabTask`.`status` AS `status`",
        "`tabTask`.`project` AS `project`",
        "`tabTask`.`project_name` AS `project_name`",
    ]

    # Join với Officer để lấy office_name từ assign_to
    join_clause = """
        LEFT JOIN `tabOfficer` ON `tabTask`.`assign_to` = `tabOfficer`.`name`
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

    tasks = frappe.db.sql(data_sql, as_dict=True)

    # Map trạng thái sang tiếng Việt
    status_map = {
        "In Progress": "Thực hiện",
        "Pending": "Đang chờ",
        "Pending Approval": "Chờ phê duyệt",
        "Completed": "Hoàn thành",
        "Closed": "Đóng",
        "Cancel": "Hủy",
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

        # SQL query để lấy danh sách projects, bao gồm end_date và need_approve
        sql = f"""
            SELECT DISTINCT
                `tabProject`.`name`,
                `tabProject`.`project_name`,
                `tabProject`.`project_code`,
                `tabProject`.`end_date`,
                `tabProject`.`need_approve`
            FROM `tabProject`
            LEFT JOIN `tabProject User` ON `tabProject`.`name` = `tabProject User`.`parent`
            WHERE 
                `tabProject`.`project_owner` = {frappe.db.escape(officer)}
                OR `tabProject`.`approver` = {frappe.db.escape(officer)}
                OR `tabProject User`.`user` = {frappe.db.escape(officer)}
            ORDER BY `tabProject`.`modified` DESC
        """

        rows = frappe.db.sql(sql, as_dict=True)

        # Format kết quả - trả về đầy đủ thông tin để tránh phải call API thêm
        projects = []
        for row in rows:
            projects.append(
                {
                    "name": row.get("name"),
                    "project_name": row.get("project_name") or row.get("name"),
                    "project_code": row.get("project_code") or "",
                    "end_date": row.get(
                        "end_date"
                    ),  # Thêm end_date để giới hạn thời hạn công việc
                    "need_approve": row.get(
                        "need_approve"
                    ),  # Thêm need_approve để validate form
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
