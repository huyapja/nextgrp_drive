import frappe
from pypika import Order, functions as fn


def create_new_activity_log(
    entity,
    last_interaction,
    user=None,
):
    doc = frappe.new_doc("Drive Entity Log")
    doc.entity_name = entity
    doc.user = user or frappe.session.user
    doc.last_interaction = last_interaction
    doc.owner = frappe.session.user
    doc.save()
    return


@frappe.whitelist()
def get_entity_activity_log(entity_name):
    """
    Warning: Assumes `Drive File` only
    """
    Activity = frappe.qb.DocType("Drive Entity Log")
    User = frappe.qb.DocType("User")
    selectedFields = [Activity.entity_name, Activity.user, Activity.last_interaction]
    query = (
        frappe.qb.from_(Activity)
        .select(*selectedFields)
        .left_join(User)
        .on(Activity.owner == User.email)
        .where(Activity.entity == entity_name)
        .orderby(Activity.creation, order=Order.desc)
    )

    result = query.run(as_dict=True)
    for i in result:
        if i.action_type.startswith("share") and i.document_field == "User":
            i.share_user_fullname, i.share_user_image = frappe.get_value(
                "User", i.new_value, ["full_name", "user_image"]
            )
    return result


def create_new_entity_activity_log(entity, action_type):
    doc = frappe.new_doc("Drive Entity Activity Log")
    doc.entity = entity
    doc.action_type = action_type
    doc.owner = frappe.session.user
    doc.save()
    return


@frappe.whitelist()
def list_activity_download_view_logs(
    entity_name,
    order_by="timestamp desc",
    limit=100,
    page=1,
):
    ActivityLog = frappe.qb.DocType("Drive Entity Activity Log")

    # Convert to int and ensure minimum values
    limit = int(limit)
    page = max(1, int(page))

    # Calculate offset
    offset = (page - 1) * limit

    # Build base query
    query = (
        frappe.qb.from_(ActivityLog)
        .where(
            (ActivityLog.entity == entity_name)
            & ((ActivityLog.action_type == "download") | (ActivityLog.action_type == "view"))
        )
        .select(
            ActivityLog.name,
            ActivityLog.entity,
            ActivityLog.action_type,
            ActivityLog.owner,
            ActivityLog.creation,
        )
        .orderby(ActivityLog.creation, order=Order.desc if "desc" in order_by else Order.asc)
    )

    # Get total count for pagination info
    count_query = (
        frappe.qb.from_(ActivityLog)
        .where(
            (ActivityLog.entity == entity_name)
            & ((ActivityLog.action_type == "download") | (ActivityLog.action_type == "view"))
        )
        .select(fn.Count(ActivityLog.name))
    )
    total_count = count_query.run()[0][0]

    # Apply pagination
    query = query.limit(limit).offset(offset)

    results = query.run(as_dict=True)

    # Enrich results with officer and department data
    for r in results:
        officer = frappe.db.get_value(
            "Officer", filters={"user": r.get("owner")}, fieldname=["name", "image"], as_dict=1
        )
        if officer:
            department_user = frappe.db.get_value(
                "Department User",
                filters={"user": officer.get("name")},
                fieldname="position",
                as_dict=1,
            )
            r.update(officer)
            if department_user:
                r.update(department_user)

    # Calculate pagination metadata
    total_pages = (total_count + limit - 1) // limit  # Ceiling division
    has_next = page < total_pages
    has_previous = page > 1

    return {
        "data": results,
        "pagination": {
            "current_page": page,
            "total_pages": total_pages,
            "total_count": total_count,
            "per_page": limit,
            "has_next": has_next,
            "has_previous": has_previous,
            "next_page": page + 1 if has_next else None,
            "previous_page": page - 1 if has_previous else None,
        },
    }
