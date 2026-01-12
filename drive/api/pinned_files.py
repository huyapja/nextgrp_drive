"""
API endpoints for managing pinned files using Drive Pin File doctype
"""

import frappe
from frappe import _


@frappe.whitelist()
def get_pinned_files():
    """
    Get list of pinned files for current user
    Returns list of pinned file objects with their details
    """
    user = frappe.session.user

    try:
        # Query Drive Pin File records for current user
        pinned_records = frappe.get_all(
            "Drive Pin File",
            filters={"user": user},
            fields=["drive_file", "pinned_at", "order", "name"],
            order_by="`order` asc",
        )

        # Get file details for each pinned file
        pinned_files = []
        invalid_pins = []

        for record in pinned_records:
            file_name = record.drive_file

            # Check if file still exists
            if not frappe.db.exists("Drive File", file_name):
                # Mark for removal
                invalid_pins.append(record.name)
                frappe.logger("pinned_files").info(
                    f"Pinned file {file_name} not found, will remove pin record."
                )
                continue

            # Get file details
            try:
                file_doc = frappe.get_doc("Drive File", file_name)
                file_info = {
                    "name": file_doc.name,
                    "title": file_doc.title,
                    "file_type": getattr(file_doc, "mime_type", "Unknown"),
                    "is_group": file_doc.is_group,
                    "is_link": file_doc.is_link,
                    "modified": file_doc.modified,
                    "owner": file_doc.owner,
                    "pinned_at": record.pinned_at,
                    "order": record.order,
                }
                pinned_files.append(file_info)
            except Exception as e:
                frappe.logger("pinned_files").error(
                    f"Error getting file details for {file_name}: {e}"
                )
                invalid_pins.append(record.name)

        # Clean up invalid pins
        for pin_name in invalid_pins:
            frappe.delete_doc("Drive Pin File", pin_name, ignore_permissions=True)

        if invalid_pins:
            frappe.db.commit()

        return pinned_files

    except Exception as e:
        frappe.logger("pinned_files").error(
            f"Error getting pinned files for user {user}: {e}"
        )
        frappe.log_error(f"Error in get_pinned_files: {str(e)}")
        return []


@frappe.whitelist()
def pin_file(entity_name):
    """
    Pin a file for current user

    Args:
        entity_name: Name of the Drive File to pin
    """
    user = frappe.session.user

    # Log for debugging
    frappe.logger().info(f"Attempting to pin file: {entity_name} for user: {user}")

    # Verify file exists
    if not frappe.db.exists("Drive File", entity_name):
        frappe.logger().error(f"File not found in Drive File: {entity_name}")
        return {
            "success": False,
            "message": _("File not found: {0}").format(entity_name),
        }

    # Check if already pinned
    existing_pin = frappe.db.exists(
        "Drive Pin File", {"user": user, "drive_file": entity_name}
    )

    if existing_pin:
        return {"success": True, "message": _("File is already pinned")}

    # Get file details
    try:
        file_data = frappe.get_doc("Drive File", entity_name)

        # Create pin record
        pin_doc = frappe.get_doc(
            {"doctype": "Drive Pin File", "user": user, "drive_file": entity_name}
        )
        pin_doc.insert(ignore_permissions=True)
        frappe.db.commit()

        frappe.logger().info(f"Successfully pinned file: {entity_name}")

        return {
            "success": True,
            "message": _("File pinned successfully"),
            "file": {
                "name": file_data.name,
                "title": file_data.title,
                "file_type": getattr(file_data, "mime_type", "Unknown"),
                "is_group": file_data.is_group,
                "is_link": file_data.is_link,
            },
        }

    except Exception as e:
        frappe.logger().error(f"Error pinning file: {str(e)}")
        frappe.log_error(f"Error in pin_file: {str(e)}")
        return {
            "success": False,
            "message": _("Error pinning file: {0}").format(str(e)),
        }


@frappe.whitelist()
def unpin_file(entity_name):
    """
    Unpin a file for current user

    Args:
        entity_name: Name of the Drive File to unpin
    """
    user = frappe.session.user

    try:
        # Find pin record
        pin_records = frappe.get_all(
            "Drive Pin File",
            filters={"user": user, "drive_file": entity_name},
            fields=["name"],
        )

        if not pin_records:
            return {"success": True, "message": _("File was not pinned")}

        # Delete pin record(s)
        for pin in pin_records:
            frappe.delete_doc("Drive Pin File", pin.name, ignore_permissions=True)

        frappe.db.commit()

        frappe.logger().info(f"Successfully unpinned file: {entity_name}")

        return {
            "success": True,
            "message": _("File unpinned successfully"),
            "file_name": entity_name,
        }

    except Exception as e:
        frappe.logger().error(f"Error unpinning file: {str(e)}")
        frappe.log_error(f"Error in unpin_file: {str(e)}")
        return {
            "success": False,
            "message": _("Error unpinning file: {0}").format(str(e)),
        }


@frappe.whitelist()
def clear_all_pinned_files():
    """
    Clear all pinned files for current user
    """
    user = frappe.session.user

    try:
        # Get all pin records for user
        pin_records = frappe.get_all(
            "Drive Pin File", filters={"user": user}, fields=["name"]
        )

        # Delete all
        for pin in pin_records:
            frappe.delete_doc("Drive Pin File", pin.name, ignore_permissions=True)

        frappe.db.commit()

        frappe.logger().info(f"Cleared all pinned files for user: {user}")

        return {"success": True, "message": _("All pinned files cleared")}

    except Exception as e:
        frappe.logger().error(f"Error clearing pinned files: {str(e)}")
        frappe.log_error(f"Error in clear_all_pinned_files: {str(e)}")
        return {
            "success": False,
            "message": _("Error clearing pinned files: {0}").format(str(e)),
        }


@frappe.whitelist()
def reorder_pinned_files(file_order):
    """
    Reorder pinned files for current user

    Args:
        file_order: List of drive_file names in desired order
    """
    user = frappe.session.user

    try:
        if isinstance(file_order, str):
            import json

            file_order = json.loads(file_order)

        # Update order for each file
        for index, file_name in enumerate(file_order):
            pin_records = frappe.get_all(
                "Drive Pin File",
                filters={"user": user, "drive_file": file_name},
                fields=["name"],
            )

            for pin in pin_records:
                frappe.db.set_value(
                    "Drive Pin File", pin.name, "order", index, update_modified=False
                )

        frappe.db.commit()

        return {"success": True, "message": _("Pinned files reordered successfully")}

    except Exception as e:
        frappe.logger().error(f"Error reordering pinned files: {str(e)}")
        frappe.log_error(f"Error in reorder_pinned_files: {str(e)}")
        return {
            "success": False,
            "message": _("Error reordering pinned files: {0}").format(str(e)),
        }
