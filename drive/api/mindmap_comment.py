import frappe
import json
from frappe import _
from raven.raven_bot.doctype.raven_bot.raven_bot import RavenBot
import bleach
from frappe.utils import get_datetime, convert_utc_to_system_timezone


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
def add_comment(mindmap_id: str, node_id: str, session_index: int | None, comment: str, node_key: str):

    from drive.api.permissions import get_user_access

    entity = frappe.get_doc("Drive File", mindmap_id)
    access = get_user_access(entity, frappe.session.user)

    if not access.get("read"):
        frappe.throw(
            "Bạn không có quyền bình luận.",
            frappe.PermissionError,
        )

    if not mindmap_id or not node_id or not comment:
        frappe.throw("Missing params")

    if not node_key:
        frappe.throw("Missing node_key")    

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
        "node_key": node_key,       
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
    
    comment_ids = [c.name for c in comments]
    frappe.db.delete(
        "Drive Mindmap Comment Reaction",
        {
            "comment": ["in", comment_ids],
        }
    )


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
    frappe.db.delete(
        "Drive Mindmap Comment Reaction",
        {
            "comment": comment_id,
        }
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

    # parse comment
    comment = doc.comment
    if isinstance(comment, str):
        try:
            comment = json.loads(comment)
        except Exception:
            return

    mentions = comment.get("mentions") or []
    if not mentions:
        return

    mentioned_users = {
        m.get("id")
        for m in mentions
        if m.get("id")
        and m.get("kind") == "mention" 
        and m.get("id") != doc.owner
    }

    if not mentioned_users:
        return

    # chỉ user enabled
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

    team = frappe.db.get_value("Drive File", doc.mindmap_id, "team")
    if not team:
        return

    link = (
        f"/drive/t/{team}/mindmap/{doc.mindmap_id}"
        f"?node={doc.node_id}"
        f"&session={doc.session_index}"
        f"&node_key={doc.node_key}"
        f"#comment_id={doc.name}"
    )

    actor_full_name = (
        frappe.db.get_value("User", doc.owner, "full_name")
        or doc.owner
    )

    bot_docs = frappe.conf.get("bot_docs")
    if not bot_docs:
        return

    for user in valid_users:
        RavenBot.send_notification_to_user(
            bot_name=bot_docs,
            user_id=user,
            link_doctype="Drive Mindmap Comment",
            link_document=doc.name,
            message=json.dumps(
                {
                    "key": "mention_comment_mindmap",
                    "title": f"{actor_full_name} đã đề cập đến bạn trong sơ đồ tư duy",
                    "full_name_owner": actor_full_name,
                    "comment_content": comment.get("parsed") or "",
                    "comment_id": doc.name,
                    "mindmap_id": doc.mindmap_id,
                    "node_id": doc.node_id,
                    "link": link,
                },
                ensure_ascii=False,
                default=str,
            ),
        )


def notify_comment(comment_name):
    doc = frappe.get_doc("Drive Mindmap Comment", comment_name)

    # parse comment
    comment = doc.comment
    if isinstance(comment, str):
        try:
            comment = json.loads(comment)
        except Exception:
            return

    mentions = comment.get("mentions") or []

    # -------------------------------------------------
    # 1. XÁC ĐỊNH REPLY OWNER (NẾU CÓ)
    # -------------------------------------------------
    reply_comment_id = None
    reply_owner = None

    for m in mentions:
        if m.get("kind") == "reply" and m.get("comment_id"):
            reply_comment_id = m.get("comment_id")
            break

    if reply_comment_id:
        reply_owner = frappe.db.get_value(
            "Drive Mindmap Comment",
            reply_comment_id,
            "owner",
        )

    # -------------------------------------------------
    # 2. ACTOR
    # -------------------------------------------------
    actor_full_name = (
        frappe.db.get_value("User", doc.owner, "full_name")
        or doc.owner
    )

    # -------------------------------------------------
    # 3. SESSION MEMBERS
    # -------------------------------------------------
    notify_users = set(
        frappe.get_all(
            "Drive Mindmap Comment Session Member",
            filters={
                "mindmap_id": doc.mindmap_id,
                "node_id": doc.node_id,
                "session_index": doc.session_index,
            },
            pluck="user",
        )
    )

    # loại chính mình
    notify_users.discard(doc.owner)

    # -------------------------------------------------
    # 4. LOẠI MENTION THƯỜNG (KHÔNG ĐỘNG REPLY)
    # -------------------------------------------------
    mentioned_users = {
        m.get("id")
        for m in mentions
        if m.get("kind") == "mention" and m.get("id")
    }

    if reply_owner:
        # giữ reply_owner lại
        notify_users -= (mentioned_users - {reply_owner})
    else:
        notify_users -= mentioned_users

    if not notify_users:
        return

    # -------------------------------------------------
    # 5. BUILD LINK
    # -------------------------------------------------
    team = frappe.db.get_value("Drive File", doc.mindmap_id, "team")
    if not team:
        return

    link = (
        f"/drive/t/{team}/mindmap/{doc.mindmap_id}"
        f"?node={doc.node_id}"
        f"&session={doc.session_index}"
        f"&node_key={doc.node_key}"
        f"#comment_id={doc.name}"
    )

    bot_docs = frappe.conf.get("bot_docs")
    if not bot_docs:
        return

    # -------------------------------------------------
    # 6. SEND NOTIFY – THEO USER
    # -------------------------------------------------
    for user in notify_users:
        is_reply_for_user = bool(reply_owner and user == reply_owner)

        title = (
            f"{actor_full_name} đã trả lời bình luận của bạn trong sơ đồ tư duy"
            if is_reply_for_user
            else f"{actor_full_name} đã bình luận trong sơ đồ tư duy"
        )

        RavenBot.send_notification_to_user(
            bot_name=bot_docs,
            user_id=user,
            link_doctype="Drive Mindmap Comment",
            link_document=doc.name,
            message=json.dumps(
                {
                    "key": "comment_mindmap",
                    "title": title,
                    "full_name_owner": actor_full_name,
                    "comment_content": comment.get("parsed") or "",
                    "comment_id": doc.name,
                    "mindmap_id": doc.mindmap_id,
                    "node_id": doc.node_id,
                    "link": link,
                    "is_reply": is_reply_for_user,
                },
                ensure_ascii=False,
                default=str,
            ),
        )


@frappe.whitelist()
def resolve_node(
    entity_name: str,
    node_id: str,
    session_index: int,
    history: dict | None = None
):
    if not entity_name or not node_id or session_index is None:
        frappe.throw("Missing parameters")

    if not history:
        frappe.throw("Missing history payload")

    doc_drive = frappe.get_doc("Drive File", entity_name)
    if not frappe.has_permission("Drive File", "write", doc_drive):
        frappe.throw("No permission to resolve")

    now = frappe.utils.now_datetime()

    session = frappe.db.get_value(
        "Drive Mindmap Comment Session",
        {
            "mindmap_id": entity_name,
            "node_id": node_id,
            "session_index": session_index,
            "is_closed": 0,
        },
        ["name", "comment_count"],
        as_dict=True
    )

    if not session:
        return {
            "ok": True,
            "already_closed": True,
            "session_index": session_index
        }

    # -------- validate history --------
    required_fields = ["node_key", "node_created_at"]
    for f in required_fields:
        if not history.get(f):
            frappe.throw(f"Missing history.{f}")

    # -------- normalize datetime --------
    dt = get_datetime(history.get("node_created_at"))
    dt = convert_utc_to_system_timezone(dt)
    node_created_at = dt.replace(tzinfo=None, microsecond=0)

    # -------- extract comment_ids --------
    raw_comments = history.get("comments") or []
    comment_ids = [
        c.get("id")
        for c in raw_comments
        if isinstance(c, dict) and c.get("id")
    ]


    # -------- snapshot reactions --------
    reactions = frappe.get_all(
        "Drive Mindmap Comment Reaction",
        filters={
            "comment": ["in", comment_ids],
        },
        fields=["comment", "emoji", "user"],
    )

    # build user map
    user_ids = list({r["user"] for r in reactions})
    users = frappe.get_all(
        "User",
        filters={"name": ["in", user_ids]},
        fields=["name", "full_name", "user_image", "email"],
    )

    user_map = {
        u["name"]: {
            "user": u["name"],
            "full_name": u["full_name"],
            "avatar": u.get("user_image"),
            "email": u.get("email"),
        }
        for u in users
    }

    # build reaction snapshot
    reaction_snapshot = {}

    for r in reactions:
        cid = r["comment"]
        emoji = r["emoji"]
        user_info = user_map.get(r["user"])
        if not user_info:
            continue

        c_bucket = reaction_snapshot.setdefault(cid, {})
        e_bucket = c_bucket.setdefault(
            emoji,
            {"count": 0, "users": []}
        )
        e_bucket["count"] += 1
        e_bucket["users"].append(user_info)



    # -------- create history snapshot --------
    history_doc = frappe.new_doc("Drive Mindmap Comment History")
    history_doc.update({
        "mindmap_id": entity_name,
        "node_id": node_id,
        "node_key": history.get("node_key"),
        "node_created_at": node_created_at,
        "node_title": history.get("node_title"),
        "session_index": session_index,
        "resolved_at": now,
        "resolved_by": frappe.session.user,
        "comment_count": session.comment_count,
        "comment_ids": frappe.as_json(comment_ids),
        "node_position": frappe.as_json(history.get("node_position")),
        "comments_snapshot": frappe.as_json(raw_comments),
        "reactions_snapshot": frappe.as_json(reaction_snapshot),
        "node_deleted": 0,
    })
    history_doc.insert(ignore_permissions=True)

    # -------- close session --------
    frappe.db.set_value(
        "Drive Mindmap Comment Session",
        session.name,
        {
            "is_closed": 1,
            # "closed_at": now
        }
    )

    # -------- realtime --------
    frappe.publish_realtime(
        event="drive_mindmap:node_resolved",
        message={
            "mindmap_id": entity_name,
            "node_id": node_id,
            "node_key": history.get("node_key"),
            "session_index": session_index,
            "count": session.comment_count,
        },
    )

    return {
        "ok": True,
        "resolved": True,
        "session_index": session_index
    }


@frappe.whitelist()
def get_comment_history_list(
    mindmap_id: str,
    node_key: str | None = None
):
    if not mindmap_id:
        frappe.throw("Missing mindmap_id")

    if not frappe.has_permission("Drive File", "read", mindmap_id):
        frappe.throw("No permission")

    filters = {
        "mindmap_id": mindmap_id
    }

    if node_key:
        filters["node_key"] = node_key

    rows = frappe.get_all(
        "Drive Mindmap Comment History",
        filters=filters,
        fields=[
            "name",
            "mindmap_id",
            "node_id",
            "node_key",
            "node_title",
            "node_created_at",
            "session_index",
            "resolved_at",
            "resolved_by",
            "comment_count",
            "node_deleted",
            "node_position",
            "comments_snapshot",
            "reactions_snapshot"
        ],
        order_by="resolved_at desc",
    )

    results = []

    for row in rows:
        try:
            node_position = json.loads(row.node_position or "{}")
        except Exception:
            node_position = {}

        try:
            comments = json.loads(row.comments_snapshot or "[]")
        except Exception:
            comments = []
        
        try:
            reactions = json.loads(row.reactions_snapshot or "{}")
        except Exception:
            reactions = {}        

        results.append({
            "name": row.name,
            "node_key": row.node_key,
            "node_id": row.node_id,
            "node_title": row.node_title or "",
            "node_created_at": row.node_created_at,
            "session_index": row.session_index,
            "resolved_at": row.resolved_at,
            "resolved_by": row.resolved_by,
            "comment_count": row.comment_count,
            "node_deleted": row.node_deleted,
            "node_position": node_position,
            "comments": comments,
            "reactions": reactions,
        })

    return {
        "ok": True,
        "items": results,
    }

@frappe.whitelist()
def unresolve_node(history_name: str):
    if not history_name:
        frappe.throw("Missing history_name")

    history = frappe.get_doc("Drive Mindmap Comment History", history_name)

    # permission
    if not frappe.has_permission("Drive File", "write", history.mindmap_id):
        frappe.throw("No permission to unresolve")

    # tìm lại session
    session = frappe.db.get_value(
        "Drive Mindmap Comment Session",
        {
            "mindmap_id": history.mindmap_id,
            "node_id": history.node_id,
            "session_index": history.session_index,
        },
        ["name", "is_closed"],
        as_dict=True,
    )

    # nếu session đã tồn tại và đang mở → không làm gì
    if session and not session.is_closed:
        return {
            "ok": True,
            "already_open": True,
            "session_index": history.session_index,
        }

    # nếu session tồn tại nhưng đang đóng → mở lại
    if session:
        frappe.db.set_value(
            "Drive Mindmap Comment Session",
            session.name,
            {
                "is_closed": 0,
                # "closed_at": None,
            }
        )
    # xoá history
    history.delete(ignore_permissions=True)

    try:
        reactions = json.loads(history.reactions_snapshot or "{}")
    except Exception:
        reactions = {}

    # realtime cho UI
    frappe.publish_realtime(
        event="drive_mindmap:node_unresolved",
        message={
            "mindmap_id": history.mindmap_id,
            "node_id": history.node_id,
            "node_key": history.node_key,
            "session_index": history.session_index,
            "comment_count": history.comment_count,
            "comments": json.loads(history.comments_snapshot or "[]"),
            "node_position": json.loads(history.node_position or "{}"),
            "reactions": reactions,
        },
    )

    return {
        "ok": True,
        "unresolved": True,
        "session_index": history.session_index,
    }


@frappe.whitelist()
def delete_history(history_id: str):
    if not history_id:
        frappe.throw("Missing history_id")

    history = frappe.get_doc("Drive Mindmap Comment History", history_id)
    if not history:
        frappe.throw("History not found")

    # -----------------------
    # Permission trên mindmap
    # -----------------------
    if not frappe.has_permission("Drive File", "write", history.mindmap_id):
        frappe.throw("No permission to delete history")

    # -----------------------
    # 1. Lấy comment_ids
    # -----------------------
    comment_ids = []

    if getattr(history, "comment_ids", None):
        try:
            comment_ids = json.loads(history.comment_ids)
        except Exception:
            comment_ids = []
    else:
        # fallback từ snapshot (phòng migrate cũ)
        try:
            snapshot = json.loads(history.comments_snapshot or "[]")
            comment_ids = [c.get("id") for c in snapshot if c.get("id")]
        except Exception:
            comment_ids = []

    # -----------------------
    # 2. Xoá reaction
    # -----------------------
    if comment_ids:
        frappe.db.delete(
            "Drive Mindmap Comment Reaction",
            {"comment": ["in", comment_ids]},
        )

    # -----------------------
    # 3. Xoá comment
    # -----------------------
    if comment_ids:
        frappe.db.delete(
            "Drive Mindmap Comment",
            {
                "name": ["in", comment_ids],
                "mindmap_id": history.mindmap_id,
            },
        )

    # -----------------------
    # 4. Xoá session member
    # -----------------------
    frappe.db.delete(
        "Drive Mindmap Comment Session Member",
        {
            "mindmap_id": history.mindmap_id,
            "node_id": history.node_id,
            "session_index": history.session_index,
        },
    )

    # -----------------------
    # 5. Xoá session
    # -----------------------
    frappe.db.delete(
        "Drive Mindmap Comment Session",
        {
            "mindmap_id": history.mindmap_id,
            "node_id": history.node_id,
            "session_index": history.session_index,
        },
    )

    # -----------------------
    # 6. Payload realtime
    # -----------------------
    payload = {
        "mindmap_id": history.mindmap_id,
        "history_id": history.name,
        "node_id": history.node_id,
        "node_key": history.node_key,
        "session_index": history.session_index,
        "deleted_comment_ids": comment_ids,
    }

    # -----------------------
    # 7. Xoá history
    # -----------------------
    history.delete(ignore_permissions=True)

    # -----------------------
    # 8. Realtime
    # -----------------------
    frappe.publish_realtime(
        event="drive_mindmap:history_deleted",
        message=payload,
    )

    return {
        "ok": True,
        "deleted": True,
        "history_id": history_id,
        "deleted_comment_count": len(comment_ids),
    }


@frappe.whitelist()
def check_comment_exist(comment_id: str):
    if not comment_id:
        frappe.throw("Missing comment_id")

    # ----------------------------------------
    # 1. Check comment còn ở panel không
    # ----------------------------------------
    comment = frappe.db.get_value(
        "Drive Mindmap Comment",
        {"name": comment_id},
        ["mindmap_id", "node_id", "session_index"],
        as_dict=True,
    )

    if comment:
        session = frappe.db.get_value(
            "Drive Mindmap Comment Session",
            {
                "mindmap_id": comment.mindmap_id,
                "node_id": comment.node_id,
                "session_index": comment.session_index,
            },
            "is_closed",
        )

        is_closed = bool(session)

        return {
            "ok": True,
            "exists": True,
            "type": "history" if is_closed else "comment",
            "mindmap_id": comment.mindmap_id,
            "node_id": comment.node_id,
            "session_index": comment.session_index,
            "is_closed": is_closed,
        }

    # ----------------------------------------
    # 2. Check trong HISTORY (comment_ids)
    # ----------------------------------------
    history = frappe.db.sql(
        """
        SELECT
            name,
            mindmap_id,
            node_id,
            node_key,
            session_index,
            node_deleted
        FROM `tabDrive Mindmap Comment History`
        WHERE comment_ids LIKE %s
        ORDER BY resolved_at DESC
        LIMIT 1
        """,
        (f'%"{comment_id}"%',),
        as_dict=True,
    )

    if history:
        h = history[0]
        return {
            "ok": True,
            "exists": True,
            "type": "history",
            "mindmap_id": h.mindmap_id,
            "node_id": h.node_id,
            "node_key": h.node_key,
            "session_index": h.session_index,
            "node_deleted": bool(h.node_deleted),
        }

    # ----------------------------------------
    # 3. Không tồn tại ở đâu cả
    # ----------------------------------------
    return {
        "ok": True,
        "exists": False,
        "type": "not_found",
        "comment_id": comment_id,
    }

def escape_emoji(emoji: str) -> str:
    return emoji.encode("unicode-escape").decode("utf-8").replace("\\u", "")


@frappe.whitelist()
def toggle_reaction(comment_id: str, emoji: str):
    user = frappe.session.user
    emoji_escaped = escape_emoji(emoji)
    doc = frappe.get_doc("Drive Mindmap Comment", comment_id)


    try:
        # Insert → nghĩa là react LẦN ĐẦU
        frappe.get_doc({
            "doctype": "Drive Mindmap Comment Reaction",
            "comment": comment_id,
            "user": user,
            "emoji": emoji,
            "emoji_escaped": emoji_escaped,
        }).insert(ignore_permissions=True)

        reacted = True

    except frappe.UniqueValidationError:
        # Nếu trùng → unreact
        frappe.db.delete(
            "Drive Mindmap Comment Reaction",
            {
                "comment": comment_id,
                "user": user,
                "emoji_escaped": emoji_escaped,
            }
        )
        reacted = False

    # -------- realtime update UI --------
    user_doc = frappe.get_doc("User", user)

    frappe.publish_realtime(
        "drive_mindmap:comment_reaction_updated",
        {
            "comment_id": comment_id,
            "emoji": emoji,
            "emoji_escaped": emoji_escaped,
            "user": user_doc.name,
            "full_name": user_doc.full_name,
            "avatar": user_doc.user_image,
            "email": user_doc.email,
            "reacted": reacted,
        },
        after_commit=True
    )

    # -------- NOTIFY ONLY IF reacted=True --------
    if reacted and doc.owner != user:
        frappe.enqueue(
            "drive.api.mindmap_comment.send_reaction_notification",
            comment_id=comment_id,
            emoji=emoji,
            actor=user,
            queue="short"
        )

    return {"reacted": reacted, "emoji": emoji}


@frappe.whitelist()
def get_reaction_list_bulk(comment_ids: list[str]):
    """
    Bulk get ALL reactions for mindmap comments
    Used ONLY for mindmap UI
    """
    if not comment_ids:
        return {}

    # 1. Lấy reactions
    reactions = frappe.get_all(
        "Drive Mindmap Comment Reaction",
        filters={
            "comment": ["in", comment_ids],
        },
        fields=["comment", "emoji", "user"],
    )

    if not reactions:
        return {}

    # 2. Lấy user info (1 query)
    user_ids = list({r["user"] for r in reactions})

    users = frappe.get_all(
        "User",
        filters={"name": ["in", user_ids]},
        fields=["name", "full_name", "user_image", "email"],
    )

    user_map = {
        u["name"]: {
            "user": u["name"],
            "full_name": u["full_name"],
            "avatar": u.get("user_image"),
            "email": u.get("email"),
        }
        for u in users
    }

    # 3. Build result
    result: dict[str, dict] = {}

    for r in reactions:
        comment_id = r["comment"]
        emoji = r["emoji"]
        user_info = user_map.get(r["user"])

        if not user_info:
            continue

        comment_bucket = result.setdefault(comment_id, {})
        emoji_bucket = comment_bucket.setdefault(
            emoji,
            {
                "count": 0,
                "users": []
            }
        )

        emoji_bucket["count"] += 1
        emoji_bucket["users"].append(user_info)

    return result


def send_reaction_notification(comment_id: str, emoji: str, actor: str):
    doc = frappe.get_doc("Drive Mindmap Comment", comment_id)

    # Không notify chính mình
    if doc.owner == actor:
        return

    # Lấy full_name
    actor_full_name = frappe.db.get_value("User", actor, "full_name") or actor

    # Lấy snippet comment
    comment_json = doc.comment
    if isinstance(comment_json, str):
        try:
            comment_json = json.loads(comment_json)
        except:
            comment_json = {}

    text_preview = (comment_json.get("parsed") or "").strip()
    if len(text_preview) > 80:
        text_preview = text_preview[:77] + "..."

    # Lấy team
    team = frappe.db.get_value("Drive File", doc.mindmap_id, "team")
    if not team:
        return

    # Build link
    link = (
        f"/drive/t/{team}/mindmap/{doc.mindmap_id}"
        f"?node={doc.node_id}"
        f"&session={doc.session_index}"
        f"&node_key={doc.node_key}"
        f"#comment_id={doc.name}"
    )

    # Gửi raven bot
    RavenBot.send_notification_to_user(
        bot_name=frappe.conf.get("bot_docs"),
        user_id=doc.owner,
        message=json.dumps({
            "key": "comment_reaction_mindmap",
            "title": f"{actor_full_name} đã gửi {emoji} vào bình luận của bạn",
            "full_name_owner": actor_full_name,
            "emoji": emoji,
            "comment_preview": text_preview,
            "comment_id": doc.name,
            "mindmap_id": doc.mindmap_id,
            "node_id": doc.node_id,
            "link": link,
        }, ensure_ascii=False),
    )
