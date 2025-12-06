# Copyright (c) 2024, Your Company and contributors
# For license information, please see license.txt

from frappe.model.document import Document
import frappe


class DriveMindmapComment(Document):
    def validate(self):
        if not self.mindmap_id:
            frappe.throw("Mindmap ID is required")

        if not self.node_id:
            frappe.throw("Node ID is required")

