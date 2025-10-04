import frappe
from pypika import Order


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
