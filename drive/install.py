import frappe
from drive.controllers.user import _get_organization_name


def after_install():
    index_check = frappe.db.sql(
        """SHOW INDEX FROM `tabDrive File` WHERE Key_name = 'drive_file_title_fts_idx'"""
    )
    if not index_check:
        frappe.db.sql(
            """ALTER TABLE `tabDrive File` ADD FULLTEXT INDEX drive_file_title_fts_idx (title)"""
        )
    
    # ✅ Performance indexes được định nghĩa trong file JSON của DocType
    # Chạy: bench migrate để tạo indexes từ JSON
    frappe.logger().info("💡 Chạy 'bench migrate' để tạo performance indexes từ JSON")


def create_core_team():
    try:
        # Kiểm tra ứng dụng nextgrp
        if "nextgrp" not in frappe.get_installed_apps():
            return {"status": "skipped", "message": "NextGRP app not installed"}

        # Lấy organization name
        organization_name = _get_organization_name()

        if not organization_name:
            frappe.log_error(
                message="Không tìm thấy tổ chức nào trong hệ thống",
                title="create_core_team - No Organization",
            )
            return {"status": "error", "message": "Không tìm thấy tổ chức nào"}

        # Kiểm tra xem team đã tồn tại chưa
        existing_team = frappe.db.exists("Drive Team", {"title": organization_name})
        if existing_team:
            team_doc = frappe.get_doc("Drive Team", existing_team)
            frappe.logger().info(f"Drive Team {organization_name} đã tồn tại")
            return {
                "status": "exists",
                "team_name": team_doc.name,
                "message": f"Team {organization_name} đã tồn tại",
            }

        # Lấy tất cả users hợp lệ
        all_users = frappe.get_all(
            "User",
            filters={
                "name": ["not in", ["Administrator", "Guest"]],
                "enabled": 1,
                "user_type": "System User",
            },
            fields=["name", "email"],
            order_by="creation asc",
        )

        if not all_users:
            frappe.log_error(
                message="Không tìm thấy người dùng hợp lệ nào trong hệ thống",
                title="create_core_team - No Valid Users",
            )
            return {"status": "error", "message": "Không tìm thấy người dùng hợp lệ"}

        # Tạo Drive Team mới
        team = frappe.get_doc(
            {
                "doctype": "Drive Team",
                "title": organization_name,
                "team_domain": all_users[0].email.split("@")[-1] if all_users else "",
            }
        )
        team.insert(ignore_permissions=True)

        # Thêm tất cả users vào team
        users_added = 0
        manager_email = None

        for i, user in enumerate(all_users):
            # User đầu tiên làm manager, những user khác làm member
            access_level = 2 if i == 0 else 1  # 2 = Manager, 1 = User
            is_admin = 1 if i == 0 else 0

            team.append(
                "users",
                {
                    "user": user.email,
                    "access_level": access_level,
                    "is_admin": is_admin,
                },
            )

            # Tạo Drive Settings cho user
            _create_drive_settings_for_user(user.email, team.name)

            users_added += 1
            if i == 0:
                manager_email = user.email

        team.save(ignore_permissions=True)

        frappe.logger().info(
            f"Đã tạo Drive Team {team.name} với {users_added} users, manager: {manager_email}"
        )

        return {
            "status": "success",
            "team_name": team.name,
            "manager": manager_email,
            "users_added": users_added,
        }

    except Exception as e:
        frappe.log_error(
            message=frappe.get_traceback(), title="create_core_team - Error"
        )
        return {"status": "error", "message": str(e)}


def _create_drive_settings_for_user(user_email, default_team):
    """
    Tạo Drive Settings cho user với team mặc định.
    """
    try:
        # Kiểm tra xem Drive Settings đã tồn tại chưa
        if frappe.db.exists("Drive Settings", {"user": user_email}):
            frappe.logger().info(f"Drive Settings cho user {user_email} đã tồn tại")
            return

        # Tạo Drive Settings mới
        drive_settings = frappe.get_doc(
            {
                "doctype": "Drive Settings",
                "user": user_email,
                "default_team": default_team,
                "single_click": 1,
                "auto_detect_links": 0,
            }
        )

        drive_settings.insert(ignore_permissions=True)
        frappe.logger().info(f"Đã tạo Drive Settings cho user {user_email}")

    except Exception as e:
        frappe.log_error(
            message=f"Lỗi khi tạo Drive Settings cho user {user_email}: {frappe.get_traceback()}",
            title="Drive Settings Creation Error - Core Team",
        )


