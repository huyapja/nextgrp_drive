import frappe
import json
from frappe import _
from raven.raven_bot.doctype.raven_bot.raven_bot import RavenBot
import bleach

ALLOWED_TAGS = ["p", "br", "b", "i", "strong", "em", "img", "a", "span"]
ALLOWED_ATTRS = {
    "img": ["src", "alt"],
    "a": ["href", "target", "onclick", "rel"],
    "span": ["id", "label", "data-mention"],
}


@frappe.whitelist()
def get_comments(mindmap_id: str):
    if not mindmap_id:
        frappe.throw(_("Missing mindmap_id"))

    comments = frappe.get_all(
        "Drive Mindmap Comment",
        filters={"mindmap_id": mindmap_id},
        fields=["name", "comment", "owner", "creation", "modified", "node_id"],
        order_by="creation asc",
    )

    return comments


@frappe.whitelist()
def add_comment(mindmap_id: str, node_id: str, comment: str):
    if not mindmap_id or not node_id or not comment:
        frappe.throw(_("Invalid parameters"))

    try:
        comment_data = json.loads(comment)
    except Exception:
        frappe.throw(_("Comment must be valid JSON"))

    doc = frappe.get_doc(
        {
            "doctype": "Drive Mindmap Comment",
            "mindmap_id": mindmap_id,
            "node_id": node_id,
            "comment": comment_data,
            "owner": frappe.session.user,
        }
    )

    doc.insert(ignore_permissions=True)

    # API vẫn lo realtime
    frappe.publish_realtime(
        event="drive_mindmap:new_comment",
        message={
            "mindmap_id": mindmap_id,
            "node_id": node_id,
            "comment": doc.as_dict(),
        },
    )

    return {"status": "ok", "comment": doc.as_dict()}


@frappe.whitelist()
def add_link_comment(
    mindmap_id: str,
    node_id: str,
    node_title: str,
    mindmap_title: str,
    link_url: str = None,
):
    """
    Tạo comment thông báo liên kết công việc tới node.
    Format: "{user_full_name} đã liên kết công việc đến node "{node_title}" thuộc mindmap "{mindmap_title}". <a href="{link_url}">Mở nhánh</a>"
    """
    if not mindmap_id or not node_id:
        frappe.throw(_("Missing mindmap_id or node_id"))

    user = frappe.session.user
    full_name = frappe.db.get_value("User", user, "full_name") or user

    text = f'{full_name} đã liên kết công việc đến node "{node_title}" thuộc mindmap "{mindmap_title}"'
    if link_url:
        text += f'. <a href="{link_url}" target="_blank" rel="noopener">Mở nhánh</a>'

    safe_text = bleach.clean(
        text, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True
    )

    doc = frappe.get_doc(
        {
            "doctype": "Drive Mindmap Comment",
            "mindmap_id": mindmap_id,
            "node_id": node_id,
            "comment": {"text": safe_text},
            "owner": user,
        }
    )

    doc.insert(ignore_permissions=True)

    frappe.publish_realtime(
        event="drive_mindmap:new_comment",
        message={
            "mindmap_id": mindmap_id,
            "node_id": node_id,
            "comment": doc.as_dict(),
        },
    )

    return {"status": "ok", "comment": doc.as_dict()}


@frappe.whitelist()
def add_task_link_comment(
    task_id: str, node_title: str, mindmap_title: str, link_url: str = None
):
    """
    Tạo comment trên Task khi liên kết với mindmap node.
    Ghi vào doctype Comment (reference_doctype = "Task", reference_name = task_id).
    """
    if not task_id:
        frappe.throw(_("Missing task_id"))

    user = frappe.session.user
    full_name = frappe.db.get_value("User", user, "full_name") or user

    text = f'{full_name} đã liên kết công việc đến node "{node_title}" thuộc mindmap "{mindmap_title}"'
    if link_url:
        text += f'. <a href="{link_url}" target="_parent" onclick="event.preventDefault(); window.parent && window.parent.location && window.parent.location.href ? window.parent.location.href=this.href : window.location.href=this.href;" rel="noopener">Mở nhánh</a>'

    safe_text = bleach.clean(
        text, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True
    )

    comment_doc = frappe.get_doc(
        {
            "doctype": "Comment",
            "comment_type": "Comment",
            "reference_doctype": "Task",
            "reference_name": task_id,
            "content": safe_text,
            "owner": user,
        }
    )
    comment_doc.insert(ignore_permissions=True)

    return {"status": "ok", "comment": comment_doc.as_dict()}


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
        filters={"mindmap_id": mindmap_id, "node_id": ["in", node_ids]},
        pluck="name",
    )

    deleted = 0

    for name in comments:
        frappe.delete_doc(
            "Drive Mindmap Comment", name, ignore_permissions=True, force=True
        )
        deleted += 1

    # Realtime sync cho các client khác
    frappe.publish_realtime(
        event="drive_mindmap:multiple_comments_deleted",
        message={
            "mindmap_id": mindmap_id,
            "node_ids": node_ids,
            "deleted_count": deleted,
        },
    )

    return {"status": "ok", "deleted": deleted}


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
        frappe.throw(
            _("You do not have permission to delete this comment"),
            frappe.PermissionError,
        )

    node_id = doc.node_id

    # Xóa cứng
    frappe.delete_doc(
        "Drive Mindmap Comment", comment_id, ignore_permissions=True, force=True
    )

    # Realtime sync cho các client khác
    frappe.publish_realtime(
        event="drive_mindmap:comment_deleted",
        message={
            "mindmap_id": mindmap_id,
            "node_id": node_id,
            "comment_id": comment_id,
        },
    )

    return {"status": "ok", "deleted": 1, "comment_id": comment_id}


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
        frappe.throw(
            _("You do not have permission to edit this comment"), frappe.PermissionError
        )

    # Cập nhật nội dung
    doc.comment = comment_data
    doc.save(ignore_permissions=True)

    # Realtime sync cho client khác
    frappe.publish_realtime(
        event="drive_mindmap:comment_updated",
        message={
            "mindmap_id": mindmap_id,
            "node_id": doc.node_id,
            "comment": doc.as_dict(),
        },
    )

    return {"status": "ok", "comment": doc.as_dict()}


def notify_mentions(comment_name):
    doc = frappe.get_doc("Drive Mindmap Comment", comment_name)

    drive_file = frappe.get_value(
        "Drive File",
        doc.mindmap_id,
        ["team"],
        as_dict=True,
    )

    if not drive_file or not drive_file.get("team"):
        return

    team = drive_file["team"]

    link = (
        f"/drive/t/{team}/mindmap/{doc.mindmap_id}"
        f"?node={doc.node_id}"
        f"#comment_id={doc.name}"
    )

    # ---- parse comment safely ----
    comment = doc.comment
    if isinstance(comment, str):
        try:
            comment = json.loads(comment)
        except Exception:
            return

    mentions = comment.get("mentions", [])
    if not mentions:
        return

    mentioned_users = {
        m.get("id") for m in mentions if isinstance(m, dict) and m.get("id")
    }

    # Không notify chính mình
    mentioned_users.discard(doc.owner)

    if not mentioned_users:
        return

    valid_users = frappe.get_all(
        "User",
        filters={
            "name": ["in", list(mentioned_users)],
            "enabled": 1,
        },
        pluck="name",
    )

    if not valid_users:
        return

    bot_docs = frappe.conf.get("bot_docs")
    if not bot_docs:
        return

    actor_full_name = frappe.db.get_value("User", doc.owner, "full_name") or doc.owner

    for user in valid_users:
        message_data = {
            "key": "mention_comment_mindmap",
            "title": f"{actor_full_name} đã đề cập đến bạn trong sơ đồ tư duy",
            "full_name_owner": actor_full_name,
            "to_user": user,
            "comment_content": comment.get("parsed") or "",
            "comment_id": doc.name,
            "mindmap_id": doc.mindmap_id,
            "node_id": doc.node_id,
            "link": link,
        }

        RavenBot.send_notification_to_user(
            bot_name=bot_docs,
            user_id=user,
            message=json.dumps(message_data, ensure_ascii=False, default=str),
        )


def notify_comment(comment_name):
    doc = frappe.get_doc("Drive Mindmap Comment", comment_name)

    drive_file = frappe.get_value(
        "Drive File",
        doc.mindmap_id,
        ["team"],
        as_dict=True,
    )
    if not drive_file or not drive_file.get("team"):
        return

    team = drive_file["team"]

    link = f"/drive/t/{team}/mindmap/{doc.mindmap_id}" f"?node={doc.node_id}"

    comment = doc.comment
    if isinstance(comment, str):
        try:
            comment = json.loads(comment)
        except Exception:
            return

    actor_full_name = frappe.db.get_value("User", doc.owner, "full_name") or doc.owner

    # 1️⃣ Lấy user trong team (tuỳ bạn: Drive Team Member / Workspace member)
    team_members = frappe.get_all(
        "Drive Team Member",
        filters={"parent": team},
        pluck="user",
    )

    if not team_members:
        return

    for user in team_members:
        # ❌ không notify chính mình
        if user == doc.owner:
            continue

        message_data = {
            "key": "comment_mindmap",
            "title": f"{actor_full_name} đã bình luận trong sơ đồ tư duy",
            "full_name_owner": actor_full_name,
            "to_user": user,
            "comment_content": comment.get("parsed") or "",
            "comment_id": doc.name,
            "mindmap_id": doc.mindmap_id,
            "node_id": doc.node_id,
            "link": link,
        }

        RavenBot.send_notification_to_user(
            bot_name=frappe.conf.get("bot_docs"),
            user_id=user,
            message=json.dumps(
                message_data,
                ensure_ascii=False,
                default=str,
            ),
        )
    return {"status": "ok", "comment": doc.as_dict()}
