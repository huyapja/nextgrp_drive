import frappe
import json
from frappe import _


@frappe.whitelist()
def get_comments(mindmap_id: str):
    if not mindmap_id:
        frappe.throw(_("Missing mindmap_id"))

    comments = frappe.get_all(
        "Drive Mindmap Comment",
        filters={"mindmap_id": mindmap_id},
        fields=["name", "comment", "owner", "creation","modified", "node_id"],
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

    frappe.publish_realtime(
        event="drive_mindmap:new_comment",
        message={
            "mindmap_id": mindmap_id,
            "node_id": node_id,
            "comment": doc.as_dict()
        }
    )


    return {
        "status": "ok",
        "comment": doc.as_dict()
    }

@frappe.whitelist()
def delete_comments_by_nodes(mindmap_id: str, node_ids):
    if not mindmap_id or not node_ids:
        frappe.throw(_("Missing mindmap_id or node_ids"))

    # node_ids có thể truyền từ frontend lên dạng JSON string
    if isinstance(node_ids, str):
        try:
            node_ids = json.loads(node_ids)
        except Exception:
            frappe.throw(_("node_ids must be valid JSON array"))

    if not isinstance(node_ids, list):
        frappe.throw(_("node_ids must be a list"))

    # Lấy danh sách comment cần xóa
    comments = frappe.get_all(
        "Drive Mindmap Comment",
        filters={
            "mindmap_id": mindmap_id,
            "node_id": ["in", node_ids]
        },
        pluck="name"
    )

    deleted = 0

    for name in comments:
        frappe.delete_doc(
            "Drive Mindmap Comment",
            name,
            ignore_permissions=True,
            force=True
        )
        deleted += 1

    # Realtime sync cho các client khác
    frappe.publish_realtime(
        event="drive_mindmap:multiple_comments_deleted",
        message={
            "mindmap_id": mindmap_id,
            "node_ids": node_ids,
            "deleted_count": deleted
        }
    )

    return {
        "status": "ok",
        "deleted": deleted
    }

@frappe.whitelist()
def delete_comment_by_id(mindmap_id: str, comment_id: str):
    if not mindmap_id or not comment_id:
        frappe.throw(_("Missing mindmap_id or comment_id"))

    current_user = frappe.session.user

    # Lấy comment cần xóa
    doc = frappe.get_doc("Drive Mindmap Comment", comment_id)

    # Check đúng mindmap
    if doc.mindmap_id != mindmap_id:
        frappe.throw(_("Comment does not belong to this mindmap"))

    # Check quyền XOÁ: chỉ owner mới được xoá
    # Nếu bạn dùng field khác owner thì đổi lại tại đây
    if doc.owner != current_user:
        frappe.throw(_("You do not have permission to delete this comment"), frappe.PermissionError)

    node_id = doc.node_id

    # Xóa cứng
    frappe.delete_doc(
        "Drive Mindmap Comment",
        comment_id,
        ignore_permissions=True,
        force=True
    )

    # Realtime sync cho các client khác
    frappe.publish_realtime(
        event="drive_mindmap:comment_deleted",
        message={
            "mindmap_id": mindmap_id,
            "node_id": node_id,
            "comment_id": comment_id
        }
    )

    return {
        "status": "ok",
        "deleted": 1,
        "comment_id": comment_id
    }

@frappe.whitelist()
def edit_comment(mindmap_id: str, comment_id: str, comment: str):
    if not mindmap_id or not comment_id or not comment:
        frappe.throw(_("Missing mindmap_id, comment_id or comment"))

    current_user = frappe.session.user

    # Parse JSON comment
    try:
        comment_data = json.loads(comment)
    except Exception:
        frappe.throw(_("Comment must be valid JSON"))

    # Lấy comment cần sửa
    doc = frappe.get_doc("Drive Mindmap Comment", comment_id)

    # Check đúng mindmap
    if doc.mindmap_id != mindmap_id:
        frappe.throw(_("Comment does not belong to this mindmap"))

    # Check quyền SỬA: chỉ owner
    if doc.owner != current_user:
        frappe.throw(_("You do not have permission to edit this comment"), frappe.PermissionError)

    # Cập nhật nội dung
    doc.comment = comment_data
    doc.save(ignore_permissions=True)

    # Realtime sync cho client khác
    frappe.publish_realtime(
        event="drive_mindmap:comment_updated",
        message={
            "mindmap_id": mindmap_id,
            "node_id": doc.node_id,
            "comment": doc.as_dict()
        }
    )

    return {
        "status": "ok",
        "comment": doc.as_dict()
    }
