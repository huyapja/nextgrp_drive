# drive_shortcut.py

import frappe
from frappe.model.document import Document
from frappe import _


class DriveShortcut(Document):
    # def before_insert(self):
    #     """Set default values and validate before insert"""
    #     self.validate_shortcut_creation()
    #     self.set_file_properties()
    #     self.set_default_title()

    # def before_save(self):
    #     """Update timestamps on save"""
    #     if hasattr(self, "modified_date"):
    #         self.modified_date = frappe.utils.now()

    # def validate_shortcut_creation(self):
    #     """Validate shortcut can be created"""
    #     # Check if original file exists
    #     if not frappe.db.exists("Drive File", self.file):
    #         frappe.throw(_("Original file does not exist"))

    #     # Check read permission on original file
    #     original_file = frappe.get_doc("Drive File", self.file)
    #     if not frappe.has_permission(
    #         "Drive File", doc=original_file, ptype="read", user=self.shortcut_owner
    #     ):
    #         frappe.throw(_("No permission to create shortcut for this file"))

    #     # Check for duplicate shortcut in same location
    #     existing = frappe.db.exists(
    #         {
    #             "doctype": "Drive Shortcut",
    #             "file": self.file,
    #             "shortcut_owner": self.shortcut_owner,
    #             "parent_folder": self.parent_folder or "",
    #             "name": ["!=", self.name] if self.name else "",
    #         }
    #     )

    #     if existing:
    #         frappe.throw(_("Shortcut already exists in this location"))

    # def set_file_properties(self):
    #     """Copy properties from original file for display"""
    #     original_file = frappe.get_doc("Drive File", self.file)

    #     # Copy display properties
    #     if hasattr(self, "file_type"):
    #         self.file_type = original_file.file_type
    #     if hasattr(self, "mime_type"):
    #         self.mime_type = original_file.mime_type
    #     if hasattr(self, "is_group"):
    #         self.is_group = original_file.is_group
    #     if hasattr(self, "file_size"):
    #         self.file_size = original_file.file_size if not original_file.is_group else 0

    # def set_default_title(self):
    #     """Set default title if not provided"""
    #     if not self.title:
    #         original_file = frappe.get_doc("Drive File", self.file)
    #         self.title = original_file.title

    @frappe.whitelist()
    def move_shortcut(self, parent_folder):
        """
        Move shortcut to different folder (like Google Drive)
        Instance method - operates on current shortcut document
        """

        # Validate new parent folder exists and user has access
        if parent_folder:
            if not frappe.db.exists("Drive File", parent_folder):
                frappe.throw("Target folder does not exist")

            # folder = frappe.get_doc("Drive File", parent_folder)
            # if not frappe.has_permission(
            #     "Drive File", doc=folder, ptype="write", user=self.shortcut_owner
            # ):
            #     frappe.throw("No permission to add shortcuts to this folder")

        # Check if shortcut already exists in target location
        # existing = frappe.db.exists(
        #     {
        #         "doctype": "Drive Shortcut",
        #         "file": self.file,
        #         "shortcut_owner": self.shortcut_owner,
        #         "parent_folder": parent_folder or "",
        #         "name": ["!=", self.name],
        #     }
        # )

        # if existing:
        #     frappe.throw("Shortcut already exists in target location")

        # Update parent folder
        old_parent = self.parent_folder
        self.parent_folder = parent_folder

        # Thêm các cách để đảm bảo save được commit
        self.save()
        frappe.db.commit()  # Force commit transaction

        # Lấy thông tin từ thư mục đích, bao gồm team
        if parent_folder:
            parent_info = frappe.get_value(
                "Drive File",
                parent_folder,
                ["title", "name", "is_private", "team"],
                as_dict=True,
            )
        else:
            # Nếu move về root, lấy team từ file gốc hoặc user hiện tại
            original_file_info = frappe.get_value(
                "Drive File",
                self.file,
                ["team", "is_private"],
                as_dict=True,
            )
            parent_info = {
                "title": "Home" if original_file_info.get("is_private", True) else "Team",
                "name": None,
                "is_private": original_file_info.get("is_private", True),
                "team": original_file_info.get("team", ""),
            }
        parent_info["is_shortcut"] = True
        return parent_info

    @frappe.whitelist()
    def rename_shortcut(self, new_title):
        """
        Rename shortcut (independent of original file name)
        Instance method - operates on current shortcut document
        """
        if self.shortcut_owner != frappe.session.user:
            frappe.throw("You can only rename your own shortcuts", frappe.PermissionError)

        if not new_title or not new_title.strip():
            frappe.throw("New title cannot be empty")

        old_title = self.title
        self.title = new_title.strip()
        self.save()

        return {
            "message": f"Shortcut renamed from '{old_title}' to '{new_title}'",
            "success": True,
            "new_title": self.title,
        }

    @frappe.whitelist()
    def toggle_favourite(self):
        """Toggle favourite status"""
        if self.shortcut_owner != frappe.session.user:
            frappe.throw("You can only favourite your own shortcuts", frappe.PermissionError)

        old_status = self.is_favourite
        self.is_favourite = not old_status
        self.save()

        status_text = "added to" if self.is_favourite else "removed from"
        return {
            "message": f"Shortcut {status_text} favourites",
            "success": True,
            "is_favourite": self.is_favourite,
        }

    @frappe.whitelist()
    def get_shortcut_info(self):
        """Get detailed shortcut information including original file"""
        original_file = frappe.get_doc("Drive File", self.file)

        return {
            "shortcut": {
                "name": self.name,
                "title": self.title,
                "shortcut_owner": self.shortcut_owner,
                "parent_folder": self.parent_folder,
                "is_favourite": self.is_favourite,
                "creation": self.creation,
                "modified": self.modified,
            },
            "original_file": {
                "name": original_file.name,
                "title": original_file.title,
                "owner": original_file.owner,
                "modified": original_file.modified,
                "file_size": original_file.file_size,
                "is_group": original_file.is_group,
                "file_type": original_file.file_type,
            },
        }

    def get_original_file(self):
        """Get the original Drive File document"""
        return frappe.get_doc("Drive File", self.file)

    def get_file_path(self):
        """Get full path including shortcut location"""
        path_parts = []

        # Build path from parent folders
        current_folder = self.parent_folder
        while current_folder:
            folder = frappe.get_doc("Drive File", current_folder)
            path_parts.insert(0, folder.title)
            current_folder = getattr(folder, "parent_drive_file", None)

        # Add shortcut name
        path_parts.append(self.title)

        return "/" + "/".join(path_parts) if path_parts else f"/{self.title}"
