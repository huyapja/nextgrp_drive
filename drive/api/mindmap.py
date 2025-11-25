# drive/api/mindmap.py
# COPY TOÀN BỘ FILE NÀY VÀO apps/drive/drive/api/mindmap.py

import frappe
from frappe import _
import json


@frappe.whitelist()
def get_mindmap_data(entity_name):
    """
    Lấy dữ liệu mindmap từ Drive File entity

    :param entity_name: Drive File entity name (NOT Drive Mindmap name)
    :return: Mindmap data
    """
    try:
        # Get Drive File
        doc_drive = frappe.get_doc("Drive File", entity_name)
        print(f"✅ Drive File: {doc_drive.name}, mindmap: {doc_drive.mindmap}")

        if not doc_drive or not doc_drive.mindmap:
            frappe.throw(_("Mindmap not found in this file"), frappe.DoesNotExistError)

        # Check permission
        if not frappe.has_permission("Drive File", "read", doc_drive):
            frappe.throw(_("No permission to access this mindmap"), frappe.PermissionError)

        # Get Drive Mindmap document
        doc = frappe.get_doc("Drive Mindmap", doc_drive.mindmap)
        if not doc:
            frappe.throw(_("Mindmap document not found"), frappe.DoesNotExistError)

        # Parse mindmap_data
        mindmap_data = doc.mindmap_data
        if mindmap_data and isinstance(mindmap_data, str):
            try:
                mindmap_data = json.loads(mindmap_data)
            except:
                mindmap_data = None

        return {
            "name": doc.name,
            "title": doc.title,
            "is_group": doc.is_group,
            "parent_mindmap": doc.parent_mindmap,
            "mindmap_data": mindmap_data,
            "allow_comments": doc.allow_comments,
            "allow_download": doc.allow_download,
            "color": doc.color,
            "owner": doc.owner,
            "modified_by": doc.modified_by,
            "modified": doc.modified,
            "creation": doc.creation,
            "drive_file_name": doc_drive.name,
            "is_private": doc_drive.is_private,
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Mindmap Data Error")
        frappe.throw(str(e))


@frappe.whitelist()
def save_mindmap_data(entity_name, mindmap_data, **kwargs):
    """
    Lưu dữ liệu mindmap

    :param entity_name: Drive File entity name
    :param mindmap_data: JSON string hoặc dict
    """
    try:
        # Get Drive File
        doc_drive = frappe.get_doc("Drive File", entity_name)

        if not doc_drive or not doc_drive.mindmap:
            frappe.throw(_("Mindmap not found"), frappe.DoesNotExistError)

        # Check permission
        if not frappe.has_permission("Drive File", "write", doc_drive):
            frappe.throw(_("No permission to edit"), frappe.PermissionError)

        # Get Drive Mindmap
        doc = frappe.get_doc("Drive Mindmap", doc_drive.mindmap)

        # Convert dict to JSON string
        if isinstance(mindmap_data, dict):
            mindmap_data = json.dumps(mindmap_data, ensure_ascii=False)

        doc.mindmap_data = mindmap_data
        doc.save(ignore_permissions=True)
        frappe.db.commit()

        return {
            "status": "success",
            "message": _("Mindmap saved successfully"),
            "modified": doc.modified,
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Save Mindmap Data Error")
        frappe.throw(str(e))


@frappe.whitelist()
def save_mindmap_layout(entity_name, nodes, edges, layout="vertical"):
    """
    Lưu custom positions từ VueFlow

    :param entity_name: Drive File entity name
    :param nodes: List of nodes with positions
    :param edges: List of edges
    :param layout: Layout type
    """
    try:
        # Get Drive File
        doc_drive = frappe.get_doc("Drive File", entity_name)

        if not doc_drive or not doc_drive.mindmap:
            frappe.throw(_("Mindmap not found"), frappe.DoesNotExistError)

        # Check permission
        if not frappe.has_permission("Drive File", "write", doc_drive):
            frappe.throw(_("No permission to edit"), frappe.PermissionError)

        # Get Drive Mindmap
        mindmap_doc = frappe.get_doc("Drive Mindmap", doc_drive.mindmap)

        # Parse if string
        if isinstance(nodes, str):
            nodes = json.loads(nodes)
        if isinstance(edges, str):
            edges = json.loads(edges)

        # Save as mindmap_data
        mindmap_data = {"nodes": nodes, "edges": edges, "layout": layout}

        mindmap_doc.mindmap_data = json.dumps(mindmap_data, ensure_ascii=False)
        mindmap_doc.save(ignore_permissions=True)
        frappe.db.commit()

        return {"success": True, "message": _("Layout saved successfully")}

    except Exception as e:
        frappe.log_error(f"Save layout error: {str(e)}", "Save Mindmap Layout")
        frappe.throw(str(e))


@frappe.whitelist()
def get_mindmap_tree_with_positions(parent_mindmap=None, layout="vertical"):
    """
    Lấy tree structure với positions tự động tính toán

    :param parent_mindmap: Parent mindmap name
    :param layout: "vertical" hoặc "horizontal"
    :return: {nodes: [], edges: []} for VueFlow
    """
    try:
        # Get all mindmap nodes
        if parent_mindmap:
            nodes_data = frappe.db.get_all(
                "Drive Mindmap",
                filters={"parent_mindmap": parent_mindmap},
                fields=["name", "title", "is_group", "parent_mindmap", "color", "owner"],
                order_by="title",
            )
        else:
            nodes_data = frappe.db.get_all(
                "Drive Mindmap",
                filters=[["parent_mindmap", "in", ["", None]]],
                fields=["name", "title", "is_group", "parent_mindmap", "color", "owner"],
                order_by="title",
            )

        # Simple layout - vertical
        nodes = []
        edges = []
        x_spacing = 250
        y_spacing = 150

        for idx, node_data in enumerate(nodes_data):
            # Create node
            node = {
                "id": node_data["name"],
                "type": "default",
                "data": {
                    "label": node_data["title"],
                    "is_group": node_data["is_group"],
                    "color": node_data.get("color"),
                },
                "position": {"x": idx * x_spacing, "y": 0},
                "style": {
                    "padding": "10px",
                    "borderRadius": "8px",
                    "border": "2px solid",
                    "backgroundColor": node_data.get("color") or "#ffffff",
                    "borderColor": "#0149C1",
                },
            }
            nodes.append(node)

            # Create edge if has parent
            if node_data.get("parent_mindmap"):
                edge = {
                    "id": f"edge-{node_data['parent_mindmap']}-{node_data['name']}",
                    "source": node_data["parent_mindmap"],
                    "target": node_data["name"],
                    "type": "smoothstep",
                    "animated": False,
                }
                edges.append(edge)

        return {"nodes": nodes, "edges": edges, "layout": layout}

    except Exception as e:
        frappe.log_error(f"Get tree positions error: {str(e)}")
        return {"nodes": [], "edges": [], "layout": layout}


@frappe.whitelist()
def get_mindmap_tree_structure(parent_mindmap=None):
    """
    Lấy tree structure (hierarchical format)
    Kept for backward compatibility
    """
    try:
        if parent_mindmap:
            children = frappe.db.get_all(
                "Drive Mindmap",
                filters={"parent_mindmap": parent_mindmap},
                fields=["name", "title", "is_group", "parent_mindmap", "color", "owner"],
                order_by="title",
            )
        else:
            children = frappe.db.get_all(
                "Drive Mindmap",
                filters=[["parent_mindmap", "in", ["", None]]],
                fields=["name", "title", "is_group", "parent_mindmap", "color", "owner"],
                order_by="title",
            )

        # Build tree recursively
        tree = []
        for child in children:
            node = {
                "name": child["name"],
                "title": child["title"],
                "is_group": child["is_group"],
                "parent": child.get("parent_mindmap"),
                "color": child.get("color"),
                "owner": child["owner"],
                "children": [],
            }

            # Get children recursively
            if child["is_group"]:
                node["children"] = get_mindmap_tree_structure(child["name"])

            tree.append(node)

        return tree

    except Exception as e:
        frappe.log_error(f"Get tree structure error: {str(e)}")
        return []


@frappe.whitelist()
def create_mindmap_entity(title, personal, team, content=None, parent=None):
    """
    Create a new MindMap entity
    Drive Mindmap kế thừa permissions từ Drive File

    :param title: Tên mindmap (sẽ dùng làm root node label)
    :param personal: Private (1) hoặc Team (0)
    :param team: Team name
    :param content: Description (optional)
    :param parent: Parent folder
    :return: Drive File dict
    """
    from drive.api.files import (
        get_home_folder,
        copy_permissions_to_entity,
        create_new_entity_activity_log,
    )

    origin_parent = parent
    home_directory = get_home_folder(team)
    parent = parent or home_directory.name

    # Check permission on parent folder
    if not frappe.has_permission(
        doctype="Drive File",
        doc=parent,
        ptype="write",
        user=frappe.session.user,
    ):
        frappe.throw("Cannot access folder", frappe.PermissionError)

    # Step 1: Create Drive Mindmap document (backend data structure)
    drive_mindmap = frappe.new_doc("Drive Mindmap")
    drive_mindmap.title = title
    drive_mindmap.is_group = 0  # Not a folder
    drive_mindmap.parent_mindmap = None  # Root level

    # Initialize với empty mindmap_data (sẽ được tạo root node ở frontend)
    drive_mindmap.mindmap_data = json.dumps({"nodes": [], "edges": [], "layout": "custom"})

    drive_mindmap.insert()
    frappe.db.commit()

    print(f"✅ Created Drive Mindmap: {drive_mindmap.name}")

    # Step 2: Create Drive File entity (permissions container)
    drive_file = frappe.new_doc("Drive File")
    drive_file.team = team
    drive_file.is_private = int(personal)
    drive_file.title = title
    drive_file.parent_entity = parent
    drive_file.file_size = 0
    drive_file.mime_type = "mindmap"
    drive_file.mindmap = drive_mindmap.name  # ← Link để kế thừa permissions
    drive_file.is_group = 0

    drive_file.insert()
    frappe.db.commit()

    print(f"✅ Created Drive File: {drive_file.name} → mindmap: {drive_file.mindmap}")

    # Step 3: Copy permissions từ parent folder
    # Drive Mindmap sẽ check permissions qua Drive File
    if origin_parent:
        get_permissions = frappe.get_all(
            "Drive Permission",
            {"entity": origin_parent},
            ["user", "read", "share", "write", "comment", "valid_until"],
        )
        copy_permissions_to_entity(drive_file.name, get_permissions)
        print(f"✅ Copied {len(get_permissions)} permissions to Drive File")

    # Step 4: Create activity log
    try:
        create_new_entity_activity_log(entity=drive_file.name, action_type="create")
    except:
        pass

    return drive_file.as_dict()
