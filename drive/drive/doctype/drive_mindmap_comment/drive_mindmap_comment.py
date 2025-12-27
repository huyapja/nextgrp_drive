# Copyright (c) 2024, Your Company and contributors
# For license information, please see license.txt

from frappe.model.document import Document
import frappe
from bs4 import BeautifulSoup
from bleach.sanitizer import Cleaner
import json
from frappe.utils import now


ALLOWED_TAGS = ["p", "br", "b", "i", "strong", "em", "img", "a", "span"]
ALLOWED_ATTRS = {
    "img": ["src", "alt"],
    "a": ["href", "target"],
    "span": ["id", "label", "data-mention", "data-kind"],
}

cleaner = Cleaner(tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)


def ensure_session_member(mindmap_id, node_id, session_index, user):
    if not user:
        return

    exists = frappe.db.exists(
        "Drive Mindmap Comment Session Member",
        {
            "mindmap_id": mindmap_id,
            "node_id": node_id,
            "session_index": session_index,
            "user": user,
        }
    )

    if not exists:
        frappe.get_doc({
            "doctype": "Drive Mindmap Comment Session Member",
            "mindmap_id": mindmap_id,
            "node_id": node_id,
            "session_index": session_index,
            "user": user,
        }).insert(ignore_permissions=True)



class DriveMindmapComment(Document):
    def validate(self):
        if not self.mindmap_id:
            frappe.throw("Mindmap ID is required")

        if not self.node_id:
            frappe.throw("Node ID is required")
    
    def before_save(self):
        if self.is_new():
            return

        # lưu comment cũ để diff
        old = self.get_doc_before_save()
        self._old_comment = old.comment if old else None

        # parse lại comment mới
        raw_html = self.comment.get("text") if isinstance(self.comment, dict) else ""

        soup = BeautifulSoup(raw_html, "html.parser")
        mentions = []

        for tag in soup.find_all("span", attrs={"data-mention": True}):
            mentions.append({
                "id": tag.get("data-mention"),
                "label": tag.text.replace("@", "").strip(),
                "kind": tag.get("data-kind") or "mention",
            })

        safe_html = cleaner.clean(raw_html)
        parsed_text = BeautifulSoup(safe_html, "html.parser").get_text(" ", strip=True)

        self.comment = {
            "raw_html": raw_html,
            "safe_html": safe_html,
            "parsed": parsed_text,
            "mentions": mentions,
            "created_at": self.comment.get("created_at"),
            "edited_at": now(),
        }


    def before_insert(self):
        """Clean HTML + extract mentions + compute parsed text."""

        raw_html = self.comment.get("text") if isinstance(self.comment, dict) else ""

        # ---- 1) Extract mentions ----
        soup = BeautifulSoup(raw_html, "html.parser")
        mentions = []

        for tag in soup.find_all("span", attrs={"data-mention": True}):
            mentions.append({
                "id": tag.get("data-mention"),
                "label": tag.text.replace("@", "").strip(),
                "kind": tag.get("data-kind") or "mention",
            })

        # ---- 2) Sanitize HTML ----
        safe_html = cleaner.clean(raw_html)

        # ---- 3) Plain text version ----
        parsed_text = BeautifulSoup(safe_html, "html.parser").get_text(" ", strip=True)

        self.comment = {
            "raw_html": raw_html,
            "safe_html": safe_html,
            "parsed": parsed_text,
            "mentions": mentions,
            "created_at": self.comment.get("created_at")
        }

    def after_insert(self):
        """
        - Ensure session member: commenter + mindmap owner
        - Nếu có mention:
            + validate enabled users
            + auto share read/comment nếu chưa có read
            + ensure session member cho mentioned users
        - Notify:
            + notify_comment luôn chạy
            + notify_mentions chạy nếu có mention thật
        """

        # 1) Ensure session members cơ bản
        ensure_session_member(self.mindmap_id, self.node_id, self.session_index, self.owner)

        mindmap_owner = frappe.db.get_value("Drive File", self.mindmap_id, "owner")
        if mindmap_owner:
            ensure_session_member(self.mindmap_id, self.node_id, self.session_index, mindmap_owner)

        # 2) Parse comment safely
        comment = self.comment
        if isinstance(comment, str):
            try:
                comment = json.loads(comment)
            except Exception:
                comment = {}

        mentions = comment.get("mentions") or []

        # 3) Collect real mention users (loại chính mình)
        mentioned_users = {
            m.get("id")
            for m in mentions
            if isinstance(m, dict)
            and m.get("kind") == "mention"
            and m.get("id")
            and m.get("id") != self.owner
        }

        # 4) Nếu có mention → check enabled + auto share + join session
        has_real_mentions = bool(mentioned_users)

        if has_real_mentions:
            # chỉ lấy user enabled
            valid_users = frappe.get_all(
                "User",
                filters={"name": ["in", list(mentioned_users)], "enabled": 1},
                pluck="name",
            )

            if valid_users:
                # auto-share read/comment nếu chưa có read
                from drive.api.permissions import get_user_access

                entity = frappe.get_doc("Drive File", self.mindmap_id)

                for user in valid_users:
                    access = get_user_access(entity, user) or {}

                    if not access.get("read"):
                        frappe.get_doc({
                            "doctype": "Drive Permission",
                            "entity": self.mindmap_id,
                            "user": user,
                            "read": 1,
                            "comment": 1,
                            "write": 0,
                            "share": 1,
                        }).insert(ignore_permissions=True)

                    # sau khi có quyền → join session
                    ensure_session_member(self.mindmap_id, self.node_id, self.session_index, user)

        # 5) Notify comment (luôn)
        frappe.enqueue(
            "drive.api.mindmap_comment.notify_comment",
            queue="short",
            comment_name=self.name,
            enqueue_after_commit=True,
        )

        # 6) Notify mention (chỉ khi có mention thật)
        if has_real_mentions:
            frappe.enqueue(
                "drive.api.mindmap_comment.notify_mentions",
                queue="short",
                comment_name=self.name,
                enqueue_after_commit=True,
            )


    def on_update(self):
        """
        Khi edit comment:
        - Detect mention mới (kind=mention)
        - Với mention mới:
            + validate enabled users
            + auto share read/comment nếu chưa có read
            + ensure session member
        - Notify:
            + notify_comment luôn
            + notify_mentions nếu có mention mới
        """

        if self.is_new():
            return

        old_comment_raw = getattr(self, "_old_comment", None)
        if not old_comment_raw:
            return

        # 1) Parse old & new comment safely
        try:
            old_comment = json.loads(old_comment_raw) if isinstance(old_comment_raw, str) else (old_comment_raw or {})
            new_comment = json.loads(self.comment) if isinstance(self.comment, str) else (self.comment or {})
        except Exception:
            return

        old_mentions = {
            m.get("id")
            for m in (old_comment.get("mentions") or [])
            if isinstance(m, dict) and m.get("kind") == "mention" and m.get("id")
        }

        new_mentions = {
            m.get("id")
            for m in (new_comment.get("mentions") or [])
            if isinstance(m, dict) and m.get("kind") == "mention" and m.get("id")
        }

        newly_mentioned = new_mentions - old_mentions
        newly_mentioned.discard(self.owner)

        # 2) Với mention mới → check enabled + auto share + join session
        if newly_mentioned:
            valid_users = frappe.get_all(
                "User",
                filters={"name": ["in", list(newly_mentioned)], "enabled": 1},
                pluck="name",
            )

            if valid_users:
                from drive.api.permissions import get_user_access
                entity = frappe.get_doc("Drive File", self.mindmap_id)

                for user in valid_users:
                    access = get_user_access(entity, user) or {}

                    if not access.get("read"):
                        frappe.get_doc({
                            "doctype": "Drive Permission",
                            "entity": self.mindmap_id,
                            "user": user,
                            "read": 1,
                            "comment": 1,
                            "write": 0,
                            "share": 1,
                        }).insert(ignore_permissions=True)

                    ensure_session_member(self.mindmap_id, self.node_id, self.session_index, user)

        # 3) Notify comment (luôn)
        frappe.enqueue(
            "drive.api.mindmap_comment.notify_comment",
            queue="short",
            comment_name=self.name,
            enqueue_after_commit=True,
        )

        # 4) Notify mention (chỉ khi có mention mới)
        if newly_mentioned:
            frappe.enqueue(
                "drive.api.mindmap_comment.notify_mentions",
                queue="short",
                comment_name=self.name,
                enqueue_after_commit=True,
            )
