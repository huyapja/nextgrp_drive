# drive_shortcut.py

import frappe
from frappe.model.document import Document
from frappe import _
from drive.utils.files import get_home_folder
from drive.api.activity import create_new_activity_log, create_new_entity_activity_log


class DriveShortcut(Document):

    @frappe.whitelist()
    def move_shortcut(self, parent_folder=None, team=None):
        """
        Move shortcut to different folder (like Google Drive)
        Instance method - operates on current shortcut document

        :param parent_folder: Document-name of the target folder
        :param team: Team ID - if provided, will move to root folder of that team
        """

        # Nếu có team parameter, tìm thư mục gốc của team đó
        if team:
            # Lấy thông tin file gốc để xác định team hiện tại của shortcut
            original_file_info = frappe.get_value(
                "Drive File",
                self.file,
                ["team", "is_private"],
                as_dict=True,
            )

            current_shortcut_team = original_file_info.get("team", "")

            # Chỉ tìm thư mục gốc nếu team khác với team hiện tại
            if team != current_shortcut_team:
                # Tìm thư mục gốc của team đích
                team_home_folder = get_home_folder(team)
                if team_home_folder:
                    parent_folder = team_home_folder.name
                else:
                    frappe.throw(f"Cannot find home folder for team {team}")

        # Validate new parent folder exists and user has access
        if parent_folder:
            if not frappe.db.exists("Drive File", parent_folder):
                frappe.throw("Target folder does not exist")

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

            # Nếu có team parameter, sử dụng team đó
            target_team = team if team else original_file_info.get("team", "")

            parent_info = {
                "title": "Home" if original_file_info.get("is_private", True) else "Team",
                "name": None,
                "is_private": original_file_info.get("is_private", True),
                "team": target_team,
            }

        parent_info["is_shortcut"] = True

        # Log thông tin di chuyển để debug
        print(
            f"Moved shortcut from {old_parent} to {parent_folder}, team: {parent_info.get('team')}"
        )

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

        create_new_activity_log(
            entity=self.file, last_interaction=frappe.utils.now(), user=frappe.session.user
        )
        create_new_entity_activity_log(entity=self.file, action_type="edit")
        self.title = new_title
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
