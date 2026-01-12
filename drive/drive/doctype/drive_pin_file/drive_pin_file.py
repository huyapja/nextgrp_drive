# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DrivePinFile(Document):
	def validate(self):
		# Ensure user can only pin each file once
		existing = frappe.db.exists(
			"Drive Pin File",
			{
				"user": self.user,
				"drive_file": self.drive_file,
				"name": ["!=", self.name]
			}
		)
		if existing:
			frappe.throw(frappe._("File is already pinned"))
	
	def before_insert(self):
		# Auto-set order to max + 1
		if not self.order:
			max_order = frappe.db.sql("""
				SELECT MAX(`order`) as max_order
				FROM `tabDrive Pin File`
				WHERE user = %s
			""", self.user, as_dict=True)
			
			self.order = (max_order[0].max_order or 0) + 1 if max_order else 1

