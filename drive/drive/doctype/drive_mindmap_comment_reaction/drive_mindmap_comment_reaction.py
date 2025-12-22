# Copyright (c) 2024, Your Company and contributors
# For license information, please see license.txt

from frappe.model.document import Document

import frappe

class DriveMindmapCommentReaction(Document):
    pass



def on_doctype_update():
    frappe.db.add_unique(
        "Drive Mindmap Comment Reaction",
        ["comment", "user", "emoji_escaped"],
        constraint_name="unique_comment_reaction"
    )