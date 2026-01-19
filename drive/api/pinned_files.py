"""
API endpoints for managing pinned files using Drive Pin File doctype
"""

import frappe
from frappe import _


@frappe.whitelist()
def get_pinned_files():
    """
    Get list of pinned files for current user (only active files)
    Returns list of pinned file objects with their details
    Only includes files that are active and not trashed
    """
    user = frappe.session.user

    try:
        # Query pinned files with JOIN to get only active, non-trashed files
        # Also LEFT JOIN with Drive Recent File to get group information
        pinned_files_data = frappe.db.sql(
            """
            SELECT 
                df.name,
                df.title,
                df.mime_type as file_type,
                df.is_group,
                df.is_link,
                df.modified,
                df.owner,
                df.team,
                dpf.pinned_at,
                dpf.order,
                drf.group_id,
                drf.group_name,
                drf.group_color
            FROM 
                `tabDrive Pin File` dpf
            INNER JOIN 
                `tabDrive File` df ON dpf.drive_file = df.name
            LEFT JOIN 
                `tabDrive Recent File` drf ON drf.entity = df.name AND drf.user = %(user)s
            WHERE 
                dpf.user = %(user)s
                AND df.is_active = 1
            ORDER BY 
                dpf.`order` ASC
            """,
            {"user": user},
            as_dict=True,
        )

        # Format the results
        pinned_files = []
        for file_data in pinned_files_data:
            file_info = {
                "name": file_data.name,
                "title": file_data.title,
                "file_type": file_data.file_type or "Unknown",
                "is_group": file_data.is_group,
                "is_link": file_data.is_link,
                "modified": file_data.modified,
                "owner": file_data.owner,
                "team": file_data.team,
                "pinned_at": file_data.pinned_at,
                "order": file_data.order,
                "group_id": file_data.group_id,
                "group_name": file_data.group_name,
                "group_color": file_data.group_color,
            }
            pinned_files.append(file_info)

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
    Also removes it from Drive Recent File if it exists there

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

        # Also remove from Drive Recent File if it exists
        recent_file_doc = frappe.db.exists(
            {
                "doctype": "Drive Recent File",
                "entity": entity_name,
                "user": user,
            }
        )
        
        if recent_file_doc:
            try:
                frappe.delete_doc("Drive Recent File", recent_file_doc, ignore_permissions=True)
                frappe.logger().info(f"Removed {entity_name} from Drive Recent File after unpinning")
            except Exception as e:
                # Log error but don't fail the unpin operation
                frappe.logger().warning(f"Error removing from Drive Recent File: {str(e)}")

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
