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

def get_notify_users_from_shared(entity, exclude_user=None):
    from drive.api.permissions import get_shared_with_list

    users = get_shared_with_list(entity)

    result = []
    for u in users:
        user = u.get("user")
        if not user:
            continue
        if exclude_user and user == exclude_user:
            continue
        result.append(user)

    return result



@frappe.whitelist()
def get_comments(mindmap_id: str):
    if not mindmap_id:
        frappe.throw(_("Missing mindmap_id"))

    # 1) Lấy toàn bộ session đang mở của mindmap đó
    open_sessions = frappe.get_all(
        "Drive Mindmap Comment Session",
        filters={
            "mindmap_id": mindmap_id,
            "is_closed": 0
        },
        fields=["node_id", "session_index"]
    )

    # Map: node_id → [session_index mở]
    open_map = {}
    for s in open_sessions:
        open_map.setdefault(s.node_id, set()).add(s.session_index)

    # 2) Lấy toàn bộ comment và lọc ở Python
    raw_comments = frappe.get_all(
        "Drive Mindmap Comment",
        filters={"mindmap_id": mindmap_id},
        fields=["name", "comment", "owner", "creation",
                "modified", "node_id", "session_index"],
        order_by="creation asc",
    )

    filtered_comments = []

    for c in raw_comments:
        node_sessions = open_map.get(c.node_id, set())

        # Nếu session_index của comment KHÔNG nằm trong session đang mở → bỏ qua
        if c.session_index not in node_sessions:
            continue

        filtered_comments.append(c)

    return filtered_comments


@frappe.whitelist()
def add_comment(mindmap_id: str, node_id: str, session_index: int | None, comment: str):
    if not mindmap_id or not node_id or not comment:
        frappe.throw("Missing params")

    now = frappe.utils.now_datetime()
    comment_data = json.loads(comment)

    # xác định session hợp lệ
    session = None

    if session_index:
        session = frappe.db.get_value(
            "Drive Mindmap Comment Session",
            {
                "mindmap_id": mindmap_id,
                "node_id": node_id,
                "session_index": session_index,
                "is_closed": 0
            },
            ["name", "session_index", "comment_count"],
            as_dict=True
        )

    # nếu không có session hợp lệ → tìm session open
    if not session:
        session = frappe.db.get_value(
            "Drive Mindmap Comment Session",
            {
                "mindmap_id": mindmap_id,
                "node_id": node_id,
                "is_closed": 0
            },
            ["name", "session_index", "comment_count"],
            as_dict=True
        )

    # nếu vẫn không có → tạo session mới
    if not session:
        last_index = frappe.db.get_value(
            "Drive Mindmap Comment Session",
            {"mindmap_id": mindmap_id, "node_id": node_id},
            "session_index",
            order_by="session_index desc"
        ) or 0

        session_index = last_index + 1

        session_doc = frappe.get_doc({
            "doctype": "Drive Mindmap Comment Session",
            "mindmap_id": mindmap_id,
            "node_id": node_id,
            "session_index": session_index,
            "opened_at": now,
            "comment_count": 0,
            "is_closed": 0,
        })
        session_doc.insert(ignore_permissions=True)
        session = {
            "name": session_doc.name,
            "session_index": session_index,
            "comment_count": 0
        }

    # tạo comment SAU KHI đã có session
    comment_doc = frappe.get_doc({
        "doctype": "Drive Mindmap Comment",
        "mindmap_id": mindmap_id,
        "node_id": node_id,
        "session_index": session["session_index"],
        "comment": comment_data,
        "owner": frappe.session.user,
    })
    comment_doc.insert(ignore_permissions=True)

    # update count
    frappe.db.set_value(
        "Drive Mindmap Comment Session",
        session["name"],
        "comment_count",
        (session["comment_count"] or 0) + 1
    )

    # realtime
    frappe.publish_realtime(
        event="drive_mindmap:new_comment",
        message={
            "node_id": node_id,
            "mindmap_id": mindmap_id,
            "session_index": session["session_index"],
            "comment": comment_doc.as_dict(),
        },
    )

    return {
        "ok": True,
        "session_index": session["session_index"],
        "comment": comment_doc.as_dict()
    }


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

    # node_ids có thể là JSON string từ frontend
    if isinstance(node_ids, str):
        try:
            node_ids = json.loads(node_ids)
        except Exception:
            frappe.throw(_("node_ids must be valid JSON array"))

    if not isinstance(node_ids, list):
        frappe.throw(_("node_ids must be a list"))

    if not node_ids:
        return {"status": "ok", "deleted": 0}

    # 1. Lấy toàn bộ comment cần xoá (kèm session_index)
    comments = frappe.get_all(
        "Drive Mindmap Comment",
        filters={
            "mindmap_id": mindmap_id,
            "node_id": ["in", node_ids],
        },
        fields=["name", "node_id", "session_index"],
    )

    if not comments:
        return {"status": "ok", "deleted": 0}

    # 2. Gom số comment bị xoá theo session
    # key: (node_id, session_index) → count
    session_counter = {}

    for c in comments:
        key = (c.node_id, c.session_index)
        session_counter[key] = session_counter.get(key, 0) + 1

    # 3. Xoá toàn bộ comment
    for c in comments:
        frappe.delete_doc(
            "Drive Mindmap Comment",
            c.name,
            ignore_permissions=True,
            force=True,
        )

    deleted = len(comments)

    # 4. Giảm comment_count cho từng session đang mở
    for (node_id, session_index), count in session_counter.items():
        session_name = frappe.db.get_value(
            "Drive Mindmap Comment Session",
            {
                "mindmap_id": mindmap_id,
                "node_id": node_id,
                "session_index": session_index,
                "is_closed": 0,
            },
            "name",
        )

        if not session_name:
            continue

        frappe.db.sql(
            """
            UPDATE `tabDrive Mindmap Comment Session`
            SET comment_count = GREATEST(comment_count - %s, 0)
            WHERE name = %s
            """,
            (count, session_name),
        )

    # 5. Realtime sync cho client khác
    frappe.publish_realtime(
        event="drive_mindmap:multiple_comments_deleted",
        message={
            "mindmap_id": mindmap_id,
            "node_ids": node_ids,
            "deleted_count": deleted,
        },
    )

    return {
        "status": "ok",
        "deleted": deleted,
        "node_ids": node_ids,
    }


@frappe.whitelist()
def delete_comment_by_id(mindmap_id: str, comment_id: str):
    if not mindmap_id or not comment_id:
        frappe.throw(_("Missing mindmap_id or comment_id"))

    current_user = frappe.session.user

    # 1. Lấy comment cần xoá
    doc = frappe.get_doc("Drive Mindmap Comment", comment_id)

    # 2. Check đúng mindmap
    if doc.mindmap_id != mindmap_id:
        frappe.throw(_("Comment does not belong to this mindmap"))

    # 3. Check quyền xoá (chỉ owner)
    if doc.owner != current_user:
        frappe.throw(
            _("You do not have permission to delete this comment"),
            frappe.PermissionError,
        )

    node_id = doc.node_id
    session_index = doc.session_index

    # 4. Lấy session đang mở tương ứng (nếu còn)
    session_name = frappe.db.get_value(
        "Drive Mindmap Comment Session",
        {
            "mindmap_id": mindmap_id,
            "node_id": node_id,
            "session_index": session_index,
            "is_closed": 0,
        },
        "name"
    )

    # 5. Xoá comment (xoá cứng)
    frappe.delete_doc(
        "Drive Mindmap Comment",
        comment_id,
        ignore_permissions=True,
        force=True,
    )

    # 6. Giảm comment_count của session (nếu session còn mở)
    if session_name:
        frappe.db.sql(
            """
            UPDATE `tabDrive Mindmap Comment Session`
            SET comment_count = GREATEST(comment_count - 1, 0)
            WHERE name = %s
            """,
            (session_name,),
        )

    # 7. Realtime sync cho client khác
    frappe.publish_realtime(
        event="drive_mindmap:comment_deleted",
        message={
            "mindmap_id": mindmap_id,
            "node_id": node_id,
            "session_index": session_index,
            "comment_id": comment_id,
        },
    )

    return {
        "status": "ok",
        "deleted": 1,
        "comment_id": comment_id,
        "node_id": node_id,
        "session_index": session_index,
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

    shared_users = set(
        get_notify_users_from_shared(doc.mindmap_id)
    )    

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
        m.get("id")
        for m in mentions
        if m.get("id") in shared_users
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

    notify_users = get_notify_users_from_shared(
        entity=doc.mindmap_id
    )

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

    if not notify_users:
        return

    for user in notify_users:
        # không notify chính mình
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


@frappe.whitelist()
def resolve_node(entity_name: str, node_id: str, session_index: int):
    if not entity_name or not node_id or session_index is None:
        frappe.throw("Missing parameters")

    doc_drive = frappe.get_doc("Drive File", entity_name)
    if not frappe.has_permission("Drive File", "write", doc_drive):
        frappe.throw("No permission to resolve")

    now = frappe.utils.now_datetime()

    # tìm đúng session đang mở theo index
    session = frappe.db.get_value(
        "Drive Mindmap Comment Session",
        {
            "mindmap_id": entity_name,
            "node_id": node_id,
            "session_index": session_index,
            "is_closed": 0,
        },
        ["name"],
        as_dict=True
    )

    if not session:
        return {
            "ok": True,
            "already_closed": True,
            "session_index": session_index
        }

    frappe.db.set_value(
        "Drive Mindmap Comment Session",
        session.name,
        {
            "is_closed": 1,
            "closed_at": now
        }
    )

    frappe.publish_realtime(
        event="drive_mindmap:node_resolved",
        message={
            "mindmap_id": entity_name,
            "node_id": node_id,
            "session_index": session_index,
        },
    )

    return {
        "ok": True,
        "resolved": True,
        "session_index": session_index
    }
