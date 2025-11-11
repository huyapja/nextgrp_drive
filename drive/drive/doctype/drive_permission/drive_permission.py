# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from drive.api.activity import create_new_activity_log
import frappe
from frappe.model.document import Document
from drive.api.notifications import notify_share


class DrivePermission(Document):
    pass
