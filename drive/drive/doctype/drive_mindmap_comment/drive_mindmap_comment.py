# Copyright (c) 2024, Your Company and contributors
# For license information, please see license.txt

from frappe.model.document import Document
import frappe
from bs4 import BeautifulSoup
from bleach.sanitizer import Cleaner
import json

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
        comment = self.comment

        if isinstance(comment, str):
            try:
                comment = json.loads(comment)
            except Exception:
                return

        if not isinstance(comment, dict):
            return

        if not comment.get("mentions"):
            return

        frappe.enqueue(
            "drive.api.mindmap_comment.notify_mentions",
            queue="short",
            comment_name=self.name
        )

