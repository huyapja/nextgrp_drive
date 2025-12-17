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
    "span": ["id", "label", "data-mention"]
}

cleaner = Cleaner(tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)


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
                "label": tag.text.replace("@", "").strip()
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
                "label": tag.text.replace("@", "").strip()
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
        """Send only ONE type of notification:
        - If comment contains mentions → send mention notification ONLY.
        - Else → send normal comment notification.
        """
        comment = self.comment

        if isinstance(comment, str):
            try:
                comment = json.loads(comment)
            except Exception:
                return

        if not isinstance(comment, dict):
            return

        mentions = comment.get("mentions") or []

        # Nếu có mention → chỉ notify mention, KHÔNG notify comment thường
        if mentions:
            frappe.enqueue(
                "drive.api.mindmap_comment.notify_mentions",
                queue="short",
                comment_name=self.name,
                enqueue_after_commit=True 
            )
            return

        frappe.enqueue(
            "drive.api.mindmap_comment.notify_comment",
            queue="short",
            comment_name=self.name,
            enqueue_after_commit=True 
        )


    def on_update(self):
        if self.is_new():
            return

        old_comment = getattr(self, "_old_comment", None)
        if not old_comment:
            return

        if isinstance(old_comment, str):
            try:
                old_comment = json.loads(old_comment)
            except Exception:
                old_comment = {}

        new_comment = self.comment
        if isinstance(new_comment, str):
            try:
                new_comment = json.loads(new_comment)
            except Exception:
                return

        old_mentions = {
            m.get("id")
            for m in old_comment.get("mentions", [])
            if isinstance(m, dict)
        }

        new_mentions = {
            m.get("id")
            for m in new_comment.get("mentions", [])
            if isinstance(m, dict)
        }

        newly_mentioned = new_mentions - old_mentions
        newly_mentioned.discard(self.owner)

        if not newly_mentioned:
            return

        frappe.enqueue(
            "drive.api.mindmap_comment.notify_mentions",
            queue="short",
            comment_name=self.name,
            enqueue_after_commit=True 
        )

