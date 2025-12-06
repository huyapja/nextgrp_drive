import frappe
import json
from frappe import _
from frappe.model.document import Document
from frappe.utils import now


@frappe.whitelist()
def get_comments(mindmap_id: str):
    if not mindmap_id:
        frappe.throw(_("Missing mindmap_id"))

    comments = frappe.get_all(
        "Drive Mindmap Comment",
        filters={"mindmap_id": mindmap_id},
        fields=["name", "comment", "owner", "creation"],
        order_by="creation asc"
    )

    return comments

@frappe.whitelist()
def add_comment(mindmap_id: str, node_id: str, comment: str):
    if not mindmap_id or not node_id or not comment:
        frappe.throw(_("Invalid parameters: mindmap_id, node_id, comment are required"))

    try:
        # Parse string JSON → dict
        comment_data = json.loads(comment)
    except Exception:
        frappe.throw(_("Comment must be valid JSON"))

    doc = frappe.get_doc({
        "doctype": "Drive Mindmap Comment",
        "mindmap_id": mindmap_id,
        "node_id": node_id,
        "comment": comment_data,
        "owner": frappe.session.user
    })

    doc.insert(ignore_permissions=True)

    return {
        "status": "ok",
        "comment": doc.as_dict()
    }