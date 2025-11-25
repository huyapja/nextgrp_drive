import frappe
from frappe import _
from pypika import Order, functions as fn
import json
from datetime import datetime
from drive.api.files import (
    create_drive_file,
    copy_permissions_to_entity,
    create_new_entity_activity_log,
    get_home_folder,
)


@frappe.whitelist()
def get_mindmap_data(entity_name):
    """
    Lấy dữ liệu mindmap từ document và cấu trúc dạng cây
    """
    try:
        doc_drive = frappe.get_doc("Drive File", entity_name)
        print(f"✅ Retrieved Drive File: {doc_drive.name} {doc_drive.mindmap}")
        if not doc_drive or not doc_drive.mindmap:
            frappe.throw(_("Mindmap entity not found"), frappe.DoesNotExistError)

        # Kiểm tra permission
        doc = frappe.get_doc("Drive Mindmap", doc_drive.mindmap)
        if not doc:
            frappe.throw(_("Mindmap not found"), frappe.DoesNotExistError)

        # Kiểm tra quyền đọc
        if not frappe.has_permission("Drive Mindmap", "read", doc):
            frappe.throw(
                _("You do not have permission to access this mindmap"), frappe.PermissionError
            )

        # Parse mindmap_data nếu là JSON string
        mindmap_data = doc.mindmap_data
        if mindmap_data and isinstance(mindmap_data, str):
            try:
                mindmap_data = json.loads(mindmap_data)
            except:
                mindmap_data = None

        # Lấy tree structure nếu là folder
        tree_data = None
        if doc.is_group:
            tree_data = get_mindmap_tree_structure(doc.name)

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
            "tree": tree_data,
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Mindmap Data Error")
        frappe.throw(str(e))


@frappe.whitelist()
def get_mindmap_tree_structure(parent_mindmap=None):
    """
    Lấy cấu trúc cây của mindmap - sử dụng SQL thuần với CTE (Common Table Expression)
    SUPER FAST - chỉ 1 query duy nhất thay vì N queries đệ quy

    :param parent_mindmap: Parent mindmap name (nếu None sẽ lấy tất cả root nodes)
    :return: Danh sách cây với children dạng hierarchical
    """
    try:
        # ✅ METHOD 1: Sử dụng MySQL Recursive CTE - FASTEST
        # Lấy tất cả nodes trong 1 query duy nhất

        if parent_mindmap:
            # Lấy tất cả descendants của parent_mindmap
            query = """
                WITH RECURSIVE mindmap_tree AS (
                    -- Base case: lấy root node
                    SELECT 
                        name,
                        title,
                        is_group,
                        parent_mindmap,
                        color,
                        owner,
                        modified,
                        creation,
                        0 as level,
                        name as path
                    FROM `tabDrive Mindmap`
                    WHERE name = %(parent)s
                    
                    UNION ALL
                    
                    -- Recursive case: lấy tất cả children
                    SELECT 
                        m.name,
                        m.title,
                        m.is_group,
                        m.parent_mindmap,
                        m.color,
                        m.owner,
                        m.modified,
                        m.creation,
                        mt.level + 1,
                        CONCAT(mt.path, '/', m.name) as path
                    FROM `tabDrive Mindmap` m
                    INNER JOIN mindmap_tree mt ON m.parent_mindmap = mt.name
                    WHERE mt.level < 50  -- Giới hạn độ sâu để tránh infinite loop
                )
                SELECT 
                    name,
                    title,
                    is_group,
                    parent_mindmap,
                    color,
                    owner,
                    modified,
                    creation,
                    level,
                    path
                FROM mindmap_tree
                ORDER BY level, title
            """

            results = frappe.db.sql(query, {"parent": parent_mindmap}, as_dict=True)

        else:
            # Lấy tất cả nodes (không có parent cụ thể)
            query = """
                WITH RECURSIVE mindmap_tree AS (
                    -- Base case: tất cả root nodes (không có parent)
                    SELECT 
                        name,
                        title,
                        is_group,
                        parent_mindmap,
                        color,
                        owner,
                        modified,
                        creation,
                        0 as level,
                        name as path
                    FROM `tabDrive Mindmap`
                    WHERE parent_mindmap IS NULL 
                       OR parent_mindmap = ''
                    
                    UNION ALL
                    
                    -- Recursive case: lấy tất cả children
                    SELECT 
                        m.name,
                        m.title,
                        m.is_group,
                        m.parent_mindmap,
                        m.color,
                        m.owner,
                        m.modified,
                        m.creation,
                        mt.level + 1,
                        CONCAT(mt.path, '/', m.name) as path
                    FROM `tabDrive Mindmap` m
                    INNER JOIN mindmap_tree mt ON m.parent_mindmap = mt.name
                    WHERE mt.level < 50
                )
                SELECT 
                    name,
                    title,
                    is_group,
                    parent_mindmap,
                    color,
                    owner,
                    modified,
                    creation,
                    level,
                    path
                FROM mindmap_tree
                ORDER BY level, title
            """

            results = frappe.db.sql(query, as_dict=True)

        # ✅ Build tree from flat list - O(n) complexity
        tree = build_tree_from_flat_list(results)

        return tree

    except Exception as e:
        frappe.log_error(
            f"Error in get_mindmap_tree_structure: {str(e)}", "Get Mindmap Tree Error"
        )

        # ✅ Fallback: Nếu MySQL không support CTE, dùng phương pháp iterative
        return get_mindmap_tree_structure_fallback(parent_mindmap)


def build_tree_from_flat_list(flat_list):
    """
    Build tree structure from flat list - O(n) time complexity
    Rất nhanh vì chỉ duyệt qua list 1 lần

    :param flat_list: List các nodes có cấu trúc phẳng
    :return: Tree structure dạng hierarchical
    """
    if not flat_list:
        return []

    # Create lookup map for O(1) access
    node_map = {}
    root_nodes = []

    # First pass: Create all nodes
    for item in flat_list:
        node = {
            "name": item["name"],
            "title": item["title"],
            "is_group": item["is_group"],
            "parent": item["parent_mindmap"],
            "color": item.get("color"),
            "owner": item["owner"],
            "modified": item["modified"],
            "creation": item["creation"],
            "level": item.get("level", 0),
            "children": [],
        }
        node_map[item["name"]] = node

    # Second pass: Build parent-child relationships
    for item in flat_list:
        node = node_map[item["name"]]
        parent_name = item["parent_mindmap"]

        if parent_name and parent_name in node_map:
            # Add to parent's children
            node_map[parent_name]["children"].append(node)
        else:
            # Root node
            root_nodes.append(node)

    return root_nodes


def get_mindmap_tree_structure_fallback(parent_mindmap=None):
    """
    Fallback method: Lấy tất cả nodes trong 1 query, build tree trong Python
    Vẫn nhanh hơn N queries đệ quy

    :param parent_mindmap: Parent mindmap name
    :return: Tree structure
    """
    try:
        # ✅ STEP 1: Lấy tất cả nodes trong 1 query duy nhất
        if parent_mindmap:
            # Lấy parent và tất cả descendants
            all_descendants = get_all_descendants_single_query(parent_mindmap)

            # Add parent node
            parent_node = frappe.db.get_value(
                "Drive Mindmap",
                parent_mindmap,
                [
                    "name",
                    "title",
                    "is_group",
                    "parent_mindmap",
                    "color",
                    "owner",
                    "modified",
                    "creation",
                ],
                as_dict=True,
            )

            if parent_node:
                all_nodes = [parent_node] + all_descendants
            else:
                all_nodes = all_descendants
        else:
            # Lấy tất cả nodes
            all_nodes = frappe.db.get_all(
                "Drive Mindmap",
                fields=[
                    "name",
                    "title",
                    "is_group",
                    "parent_mindmap",
                    "color",
                    "owner",
                    "modified",
                    "creation",
                ],
                order_by="title asc",
            )

        # ✅ STEP 2: Build tree from flat list - O(n)
        tree = build_tree_from_flat_list_fallback(all_nodes, parent_mindmap)

        return tree

    except Exception as e:
        frappe.log_error(f"Fallback error: {str(e)}", "Mindmap Tree Fallback Error")
        return []


def get_all_descendants_single_query(parent_name):
    """
    Lấy tất cả descendants bằng iterative approach - vẫn nhanh hơn đệ quy
    """
    all_descendants = []
    current_level = [parent_name]
    max_depth = 50
    depth = 0

    while current_level and depth < max_depth:
        # Lấy tất cả children của current level trong 1 query
        if not current_level:
            break

        children = frappe.db.sql(
            """
            SELECT 
                name,
                title,
                is_group,
                parent_mindmap,
                color,
                owner,
                modified,
                creation
            FROM `tabDrive Mindmap`
            WHERE parent_mindmap IN %(parents)s
            ORDER BY title
            """,
            {"parents": current_level},
            as_dict=True,
        )

        if not children:
            break

        all_descendants.extend(children)

        # Next level: chỉ lấy folders
        current_level = [c["name"] for c in children if c["is_group"]]
        depth += 1

    return all_descendants


def build_tree_from_flat_list_fallback(flat_list, root_parent=None):
    """
    Build tree from flat list - fallback version
    """
    if not flat_list:
        return []

    # Create lookup map
    node_map = {}
    root_nodes = []

    # First pass: Create nodes
    for item in flat_list:
        node = {
            "name": item["name"],
            "title": item["title"],
            "is_group": item["is_group"],
            "parent": item.get("parent_mindmap"),
            "color": item.get("color"),
            "owner": item["owner"],
            "modified": item["modified"],
            "creation": item["creation"],
            "children": [],
        }
        node_map[item["name"]] = node

    # Second pass: Build relationships
    for item in flat_list:
        node = node_map[item["name"]]
        parent_name = item.get("parent_mindmap")

        if root_parent:
            # Nếu có root_parent cụ thể
            if item["name"] == root_parent:
                root_nodes.append(node)
            elif parent_name and parent_name in node_map:
                node_map[parent_name]["children"].append(node)
        else:
            # Không có root_parent
            if not parent_name or parent_name not in node_map:
                root_nodes.append(node)
            elif parent_name in node_map:
                node_map[parent_name]["children"].append(node)

    return root_nodes


@frappe.whitelist()
def get_mindmap_children(parent_mindmap):
    """
    Lấy children trực tiếp của một mindmap node - SUPER FAST
    Chỉ 1 query đơn giản

    :param parent_mindmap: Parent mindmap name
    :return: List children
    """
    try:
        children = frappe.db.sql(
            """
            SELECT 
                name,
                title,
                is_group,
                parent_mindmap,
                color,
                owner,
                modified,
                creation
            FROM `tabDrive Mindmap`
            WHERE parent_mindmap = %(parent)s
            ORDER BY is_group DESC, title ASC
            """,
            {"parent": parent_mindmap},
            as_dict=True,
        )

        return children

    except Exception as e:
        frappe.log_error(f"Error getting mindmap children: {str(e)}", "Mindmap Children Error")
        return []


@frappe.whitelist()
def save_mindmap_data(entity_name, mindmap_data, **kwargs):
    """
    Lưu dữ liệu mindmap

    :param entity_name: Mindmap document name
    :param mindmap_data: JSON string hoặc dict chứa nodes và edges
    """
    try:
        doc = frappe.get_doc("Drive Mindmap", entity_name)

        # Kiểm tra quyền write
        if not frappe.has_permission("Drive Mindmap", "write", doc):
            frappe.throw(
                _("You do not have permission to modify this mindmap"), frappe.PermissionError
            )

        # Convert dict to JSON string nếu cần
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
def delete_mindmap_node(entity_name):
    """
    Xóa mindmap node
    """
    try:
        doc = frappe.get_doc("Drive Mindmap", entity_name)

        # Kiểm tra có children không
        children_count = frappe.db.count("Drive Mindmap", {"parent_mindmap": entity_name})

        if children_count > 0:
            frappe.throw(
                _("Cannot delete mindmap with children. Please delete children first."),
                frappe.ValidationError,
            )

        if not frappe.has_permission("Drive Mindmap", "delete", doc):
            frappe.throw(
                _("You do not have permission to delete this mindmap"), frappe.PermissionError
            )

        frappe.delete_doc("Drive Mindmap", entity_name, ignore_permissions=True)
        frappe.db.commit()

        return {
            "status": "success",
            "message": _("Mindmap node deleted successfully"),
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Delete Mindmap Node Error")
        frappe.throw(str(e))


@frappe.whitelist()
def create_mindmap_entity(title, personal, team, content=None, parent=None):
    """
    Create a new MindMap entity

    :param title: MindMap title
    :param personal: Is private (1) or team (0)
    :param team: Team name
    :param content: Optional description/content
    :param parent: Parent folder
    """
    origin_parent = parent
    home_directory = get_home_folder(team)
    parent = parent or home_directory.name

    # Check permission
    if not frappe.has_permission(
        doctype="Drive File",
        doc=parent,
        ptype="write",
        user=frappe.session.user,
    ):
        frappe.throw(
            "Cannot access folder due to insufficient permissions",
            frappe.PermissionError,
        )

    # ✅ FIX 1: Create Drive Mindmap document
    drive_mindmap = frappe.new_doc("Drive Mindmap")
    drive_mindmap.title = title

    # Set content if provided (description from dialog)
    if content:
        drive_mindmap.description = content

    # ✅ FIX 2: Insert and commit immediately
    drive_mindmap.insert()
    frappe.db.commit()  # CRITICAL: Commit để document tồn tại trong DB

    print(f"✅ Created Drive Mindmap: {drive_mindmap.name}")

    # ✅ FIX 3: Create Drive File entity with correct mime_type
    entity = create_drive_file(
        team,
        personal,
        title,
        parent,
        0,
        "mindmap",  # Use specific mime_type for mindmap
        None,
        lambda _: "",
        document=None,  # Now this document exists in DB
        mind_map=drive_mindmap.name,
    )

    print(f"✅ Created Drive File entity: {entity.name}")

    # Copy permissions from parent if exists
    if origin_parent:
        get_permissions = frappe.get_all(
            "Drive Permission",
            {"entity": origin_parent},
            ["user", "read", "share", "write", "comment", "valid_until"],
        )
        copy_permissions_to_entity(entity.name, get_permissions)

    # Create activity log
    create_new_entity_activity_log(entity=entity.name, action_type="create")

    # Send team notifications (only for public mindmaps)
    if not personal:
        try:
            # notify_team_file_upload(entity)
            pass
        except Exception as e:
            print(f"Error sending team notifications for mindmap: {e}")

    return entity
