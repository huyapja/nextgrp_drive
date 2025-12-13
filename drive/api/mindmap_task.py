import frappe
from frappe import _
from functools import reduce
from pypika import Order, functions as fn
from frappe.query_builder import DocType


def _first_existing_field(meta, candidates):
    """Return the first field that exists on the DocType."""
    for field in candidates:
        if field == "owner" or meta.has_field(field):
            return field
    return None


def _is_project_admin(user, project=None):
    """Check if user can see all tasks of a project."""
    privileged_roles = {
        "Administrator",
        "System Manager",
        "Projects Manager",
        "Project Manager",
        "Project Admin",
    }
    roles = set(frappe.get_roles(user))
    if roles.intersection(privileged_roles):
        return True

    if not project:
        return False

    try:
        if not frappe.db.exists("Project", project):
            return False

        project_meta = frappe.get_meta("Project")
        project_fields = ["owner"]
        for f in ["project_manager", "project_owner"]:
            if project_meta.has_field(f):
                project_fields.append(f)

        proj = frappe.db.get_value("Project", project, project_fields, as_dict=True)
        return bool(proj and user in proj.values())
    except Exception:
        return False


def _build_involvement_conditions(task_dt, task_meta, user):
    """Build OR conditions to find tasks where the user is involved."""
    field_groups = {
        "assignee": [
            "assignee",
            "task_assignee",
            "assigned_to",
            "assign_to",
            "responsible",
            "responsible_user",
        ],
        "approver": [
            "approver",
            "task_approver",
            "approved_by",
            "reviewer",
        ],
        "coordinator": [
            "coordinator",
            "task_coordinator",
            "collaborator",
            "collaborators",
            "participant",
            "participants",
        ],
    }

    conditions = []
    for fields in field_groups.values():
        for field in fields:
            if task_meta.has_field(field):
                conditions.append(task_dt[field] == user)

    # Always include document owner as a fallback
    conditions.append(task_dt.owner == user)

    # Include ToDo assignments (standard Frappe assignment) via subquery
    ToDo = frappe.qb.DocType("ToDo")
    todo_subquery = (
        frappe.qb.from_(ToDo)
        .select(ToDo.reference_name)
        .where(
            (ToDo.reference_type == "Task")
            & (ToDo.reference_name == task_dt.name)
            & (ToDo.allocated_to == user)
            & (ToDo.status != "Cancelled")
        )
    )
    conditions.append(task_dt.name.isin(todo_subquery))
    return conditions


@frappe.whitelist()
def get_my_tasks(project=None, page=1, page_size=10, search=None, node_owner=None):
    """
    Lấy danh sách công việc tôi liên quan.

    - Tôi là người thực hiện / phê duyệt / phối hợp, hoặc chủ dự án/quản trị dự án thì thấy tất cả.
    - Lọc theo dự án (project) nếu truyền vào.
    - Order by ngày tạo (mới nhất trước).
    - Phân trang, mỗi trang 10 item.
    - Nếu có node_owner, sử dụng node_owner thay vì frappe.session.user.
    """
    try:
        task_meta = frappe.get_meta("Task")
    except Exception:
        frappe.throw(_("Task DocType is not available"))

    # Sử dụng node_owner nếu có, nếu không thì dùng frappe.session.user
    user = node_owner if node_owner else frappe.session.user
    try:
        page = max(1, int(page or 1))
    except Exception:
        page = 1

    # Yêu cầu mỗi trang 10 item (override input để đảm bảo cố định)
    page_size = 10
    offset = (page - 1) * page_size

    Task = frappe.qb.DocType("Task")
    filters = []

    # Project filter
    if project and task_meta.has_field("project"):
        filters.append(Task.project == project)

    # Permission: if not project admin, restrict to tasks where user is involved
    if not _is_project_admin(user, project):
        involvement_conditions = _build_involvement_conditions(Task, task_meta, user)
        combined = reduce(lambda a, b: a | b, involvement_conditions)
        filters.append(combined)

    # Search filter
    if search:
        keyword = f"%{search.strip()}%"
        search_fields = [Task.name]
        title_field = _first_existing_field(task_meta, ["subject", "task_name"])
        assignee_field = _first_existing_field(
            task_meta,
            ["assignee", "task_assignee", "assigned_to", "assign_to", "responsible", "owner"],
        )
        status_field = _first_existing_field(task_meta, ["status"])

        if title_field:
            search_fields.append(Task[title_field])
        if assignee_field:
            search_fields.append(Task[assignee_field if assignee_field != "owner" else "owner"])
        if status_field:
            search_fields.append(Task[status_field])

        search_conditions = [field.like(keyword) for field in search_fields]
        search_combined = reduce(lambda a, b: a | b, search_conditions)
        filters.append(search_combined)

    # Select fields with fallbacks
    title_field = _first_existing_field(task_meta, ["subject", "task_name"])
    assignee_field = _first_existing_field(
        task_meta,
        ["assignee", "task_assignee", "assigned_to", "assign_to", "responsible", "owner"],
    )
    status_field = _first_existing_field(task_meta, ["status"])
    project_name_field = _first_existing_field(task_meta, ["project_name"])
    # Loại trừ các trạng thái không cần hiển thị
    excluded_statuses = {"To Do", "Paused"}

    select_fields = [Task.name.as_("id"), Task.creation]
    select_fields.append(Task[title_field].as_("task_name") if title_field else Task.name.as_("task_name"))
    select_fields.append(
        Task[assignee_field].as_("assignee") if assignee_field != "owner" else Task.owner.as_("assignee")
    )
    if status_field:
        select_fields.append(Task[status_field].as_("status"))
        filters.append(Task[status_field].notin(excluded_statuses))
    if task_meta.has_field("project"):
        select_fields.append(Task.project.as_("project"))
    if project_name_field:
        select_fields.append(Task[project_name_field].as_("project_name"))

    joins = []
    if assignee_field:
        Officer = frappe.qb.DocType("Officer")
        joins.append((Officer, Task[assignee_field] == Officer.name))
        select_fields.append(Officer.officer_name.as_("office_name"))

    # Count query
    count_q = frappe.qb.from_(Task).select(fn.Count("*"))
    for f in filters:
        count_q = count_q.where(f)
    total = count_q.run()[0][0] if count_q else 0

    total_pages = max(1, (total + page_size - 1) // page_size)

    # Data query
    data_q = frappe.qb.from_(Task).select(*select_fields)
    for join_dt, join_cond in joins:
        data_q = data_q.left_join(join_dt).on(join_cond)
    for f in filters:
        data_q = data_q.where(f)
    data_q = data_q.orderby(Task.creation, order=Order.desc).limit(page_size).offset(offset)

    tasks = data_q.run(as_dict=True)

    # Map trạng thái sang tiếng Việt (nếu có)
    status_map = {
        "In Progress": "Thực hiện",
        "Pending": "Đang chờ",
        "Pending Approval": "Chờ phê duyệt",
        "Completed": "Hoàn thành",
        "Closed": "Đóng",
        "Cancelled": "Hủy",
        "Paused": "Tạm dừng",
        "To Do": "Được tạo"
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
def get_my_projects(node_owner=None):
    """
    Lấy danh sách dự án mà user có quyền truy cập.
    
    - Nếu có node_owner, sử dụng node_owner thay vì frappe.session.user
    - Trả về danh sách projects mà user là owner/approver/thành viên
    """
    try:
        # Sử dụng node_owner nếu có, nếu không thì dùng frappe.session.user
        user = node_owner if node_owner else frappe.session.user
        
        # Lấy Officer từ user
        officer = frappe.db.get_value("Officer", {"user": user}, "name")
        if not officer:
            return {
                "data": [],
            }
        
        Project = DocType("Project")
        ProjectUser = DocType("Project User")
        
        # Điều kiện: user là project_owner, approver, hoặc thành viên
        cond = (
            (Project.project_owner == officer)
            | (Project.approver == officer)
            | (ProjectUser.user == officer)
        )
        
        # Query để lấy danh sách projects
        qb = (
            frappe.qb.from_(Project)
            .left_join(ProjectUser)
            .on(Project.name == ProjectUser.parent)
            .where(cond)
        )
        
        # Lấy tất cả projects (không limit để có đầy đủ options)
        rows = (
            qb.select(
                Project.name,
                Project.project_name,
                Project.project_code,
            )
            .groupby(Project.name)
            .orderby(Project.modified, order=Order.desc)
        ).run(as_dict=True)
        
        # Format kết quả
        projects = []
        for row in rows:
            projects.append({
                "name": row.get("name"),
                "project_name": row.get("project_name") or row.get("name"),
                "project_code": row.get("project_code") or "",
            })
        
        return {
            "data": projects,
        }
    except Exception as e:
        frappe.log_error(f"Error in get_my_projects: {str(e)}")
        return {
            "data": [],
        }