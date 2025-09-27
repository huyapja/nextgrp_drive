import frappe
from frappe.model.document import Document


class TopicComment(Document):
    def validate(self):
        # Validate reference doctype exists
        if not frappe.db.exists("DocType", self.reference_doctype):
            frappe.throw(f"DocType {self.reference_doctype} does not exist")

        # Validate reference document exists
        if not frappe.db.exists(self.reference_doctype, self.reference_name):
            frappe.throw(f"{self.reference_doctype} {self.reference_name} does not exist")

    def after_insert(self):
        # Create activity log
        frappe.get_doc(
            {
                "doctype": "Drive Entity Activity Log",
                "entity": self.reference_name,
                "activity_type": "comment",
                "user": frappe.session.user,
                "content": self.title or "Added a new comment",
            }
        ).insert(ignore_permissions=True)
