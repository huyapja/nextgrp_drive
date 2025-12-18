# drive/api/mindmap_task_sync.py
"""
Xử lý sync trạng thái task với mindmap nodes
"""

import frappe
from frappe import _
import json


def sync_task_status_to_mindmap_nodes(task_id):
    """
    Tự động cập nhật trạng thái completed cho các mindmap nodes có task_link với task_id này.
    Được gọi khi task thay đổi trạng thái.

    :param task_id: Task ID
    """
    print(f"🔄 sync_task_status_to_mindmap_nodes called for task: {task_id}")
    try:
        # Lấy trạng thái task
        from drive.api.mindmap_task import get_task_status

        print(f"📥 Getting task status for: {task_id}")
        task_status = get_task_status(task_id)
        print(f"📥 Task status result: {task_status}")

        if not task_status or not task_status.get("exists"):
            print(f"⚠️ Task {task_id} does not exist, removing task links")
            # Task đã bị xóa - xóa taskLink khỏi tất cả nodes
            remove_task_link_from_all_nodes(task_id)
            return

        # ⚠️ NEW: Kiểm tra nếu task bị hủy → không sync completed status, node hoạt động như bình thường
        is_task_cancelled = (
            task_status.get("status") == "Cancel"
            or task_status.get("status") == "Cancelled"
            or task_status.get("status_vi") == "Hủy"
        )

        if is_task_cancelled:
            print(
                f"⚠️ Task {task_id} is cancelled, skipping sync (node will work as normal)"
            )
            return

        is_task_completed = (
            task_status.get("is_completed") or task_status.get("status") == "Completed"
        )
        print(f"📊 Task {task_id} completed status: {is_task_completed}")

        # Tìm tất cả Drive Mindmap có nodes với task_link = task_id
        print(f"🔍 Searching for mindmaps with task_id: {task_id}")
        all_mindmaps = frappe.db.get_all(
            "Drive Mindmap",
            fields=["name", "mindmap_data"],
            filters={"mindmap_data": ["like", f"%{task_id}%"]},
        )
        print(f"📋 Found {len(all_mindmaps)} mindmap(s) with task_id {task_id}")

        updated_count = 0
        for mindmap_doc in all_mindmaps:
            if not mindmap_doc.mindmap_data:
                continue

            try:
                mindmap_data = mindmap_doc.mindmap_data
                if isinstance(mindmap_data, str):
                    mindmap_data = json.loads(mindmap_data)

                if not isinstance(mindmap_data, dict) or "nodes" not in mindmap_data:
                    continue

                updated = False
                for node in mindmap_data["nodes"]:
                    task_link = node.get("data", {}).get("taskLink") or node.get(
                        "taskLink"
                    )
                    if task_link and task_link.get("taskId") == task_id:
                        print(
                            f"✅ Found matching node {node.get('id')} with task_id {task_id}"
                        )
                        # Cập nhật trạng thái task trong taskLink
                        if "data" not in node:
                            node["data"] = {}
                        if "taskLink" not in node["data"]:
                            node["data"]["taskLink"] = task_link

                        node["data"]["taskLink"]["status"] = task_status.get("status")

                        # ⚠️ NEW: Sync completed status với task status
                        # Nếu task đã hoàn thành → set completed = true
                        # Nếu task không còn hoàn thành → set completed = false (bỏ tick done)
                        if is_task_completed:
                            node["data"]["completed"] = True
                            print(f"✅ Set node {node.get('id')} completed = True")
                        else:
                            # Task không còn hoàn thành → bỏ tick done
                            node["data"]["completed"] = False
                            print(f"✅ Set node {node.get('id')} completed = False")

                        updated = True
                        print(f"✅ Marked mindmap {mindmap_doc.name} as updated")

                if updated:
                    # Lưu lại mindmap_data đã cập nhật
                    frappe.db.set_value(
                        "Drive Mindmap",
                        mindmap_doc.name,
                        "mindmap_data",
                        json.dumps(mindmap_data, ensure_ascii=False),
                        update_modified=True,
                    )
                    updated_count += 1

                    # ⚠️ NEW: Emit realtime event với after_commit=True
                    # Tìm Drive File entity từ Drive Mindmap
                    drive_file = frappe.db.get_value(
                        "Drive File", {"mindmap": mindmap_doc.name}, "name"
                    )

                    if drive_file:
                        # Tìm tất cả nodes đã được cập nhật để emit event
                        updated_nodes = []
                        for node in mindmap_data["nodes"]:
                            task_link = node.get("data", {}).get(
                                "taskLink"
                            ) or node.get("taskLink")
                            if task_link and task_link.get("taskId") == task_id:
                                updated_nodes.append(
                                    {
                                        "node_id": node.get("id"),
                                        "completed": node.get("data", {}).get(
                                            "completed", False
                                        ),
                                        "task_status": task_status.get("status"),
                                        "task_status_vi": task_status.get("status_vi"),
                                    }
                                )

                        # Emit realtime event cho từng node đã cập nhật
                        for node_info in updated_nodes:
                            message = {
                                "mindmap_id": drive_file,
                                "task_id": task_id,
                                "node_id": node_info["node_id"],
                                "completed": node_info["completed"],
                                "task_status": node_info["task_status"],
                                "task_status_vi": node_info["task_status_vi"],
                            }
                            print(
                                f"📡 Emitting realtime event: drive_mindmap:task_status_updated, message: {message}"
                            )
                            try:
                                # ⚠️ CRITICAL: Sử dụng after_commit=True để emit sau khi transaction commit
                                frappe.publish_realtime(
                                    event="drive_mindmap:task_status_updated",
                                    message=message,
                                    after_commit=True,
                                )
                                print(
                                    f"✅ Realtime event queued (will emit after commit)"
                                )
                            except Exception as e:
                                print(f"❌ Failed to emit realtime event: {str(e)}")
                                import traceback

                                traceback.print_exc()
                                frappe.log_error(
                                    f"Error emitting realtime event: {str(e)}",
                                    "Emit Task Status Realtime Event",
                                )

            except Exception as e:
                frappe.log_error(
                    f"Error syncing task status in mindmap {mindmap_doc.name}: {str(e)}",
                    "Sync Task Status to Mindmap",
                )
                continue

        if updated_count > 0:
            print(f"💾 Committing changes for {updated_count} mindmap(s)")
            frappe.db.commit()
            print(f"✅ Synced task {task_id} status to {updated_count} mindmap(s)")
        else:
            print(f"⚠️ No mindmaps were updated for task {task_id}")

    except Exception as e:
        frappe.log_error(
            f"Error syncing task status to mindmap nodes: {str(e)}",
            "Sync Task Status to Mindmap",
        )


def remove_task_link_from_all_nodes(task_id):
    """
    Xóa taskLink khỏi tất cả nodes khi task bị xóa.

    :param task_id: Task ID đã bị xóa
    """
    try:
        # Tìm tất cả Drive Mindmap có nodes với task_link = task_id
        all_mindmaps = frappe.db.get_all(
            "Drive Mindmap",
            fields=["name", "mindmap_data"],
            filters={"mindmap_data": ["like", f"%{task_id}%"]},
        )

        updated_count = 0
        for mindmap_doc in all_mindmaps:
            if not mindmap_doc.mindmap_data:
                continue

            try:
                mindmap_data = mindmap_doc.mindmap_data
                if isinstance(mindmap_data, str):
                    mindmap_data = json.loads(mindmap_data)

                if not isinstance(mindmap_data, dict) or "nodes" not in mindmap_data:
                    continue

                updated = False
                for node in mindmap_data["nodes"]:
                    task_link = node.get("data", {}).get("taskLink") or node.get(
                        "taskLink"
                    )
                    if task_link and task_link.get("taskId") == task_id:
                        # Xóa taskLink khỏi node
                        if "data" in node and "taskLink" in node["data"]:
                            del node["data"]["taskLink"]
                        elif "taskLink" in node:
                            del node["taskLink"]

                        updated = True

                if updated:
                    # Lưu lại mindmap_data đã cập nhật
                    frappe.db.set_value(
                        "Drive Mindmap",
                        mindmap_doc.name,
                        "mindmap_data",
                        json.dumps(mindmap_data, ensure_ascii=False),
                        update_modified=True,
                    )
                    updated_count += 1

            except Exception as e:
                frappe.log_error(
                    f"Error removing task link from mindmap {mindmap_doc.name}: {str(e)}",
                    "Remove Task Link from Mindmap",
                )
                continue

        if updated_count > 0:
            frappe.db.commit()
            print(f"✅ Removed task link {task_id} from {updated_count} mindmap(s)")

    except Exception as e:
        frappe.log_error(
            f"Error removing task link from mindmap nodes: {str(e)}",
            "Remove Task Link from Mindmap",
        )


def on_task_update(doc, method):
    """
    Event handler khi Task được cập nhật.
    Tự động sync trạng thái task với mindmap nodes.
    """
    print(f"🔔 on_task_update called for task: {doc.name}")
    try:
        # Chỉ sync khi status thay đổi
        if doc.is_new():
            print(f"⚠️ Task {doc.name} is new, skipping sync")
            return

        # ⚠️ CRITICAL: Lấy status cũ từ doc_before_save thay vì database
        # Vì trong event handler, doc.status đã được cập nhật nhưng chưa commit
        doc_before_save = doc.get_doc_before_save()
        old_status = doc_before_save.get("status") if doc_before_save else None

        # Fallback: Nếu không có doc_before_save, lấy từ database
        if not old_status:
            old_status = frappe.db.get_value("Task", doc.name, "status")

        print(f"📊 Task {doc.name} status: old={old_status}, new={doc.status}")

        # Nếu status không thay đổi, không cần sync
        if old_status == doc.status:
            print(f"⚠️ Task {doc.name} status unchanged ({doc.status}), skipping sync")
            return

        print(
            f"✅ Task {doc.name} status changed from {old_status} to {doc.status}, syncing..."
        )
        # Sync trạng thái task với mindmap nodes
        sync_task_status_to_mindmap_nodes(doc.name)
        print(f"✅ Finished syncing task {doc.name}")

    except Exception as e:
        print(f"❌ Error in on_task_update for task {doc.name}: {str(e)}")
        import traceback

        traceback.print_exc()
        frappe.log_error(
            f"Error in on_task_update: {str(e)}", "Task Update Event Handler"
        )


def on_task_delete(doc, method):
    """
    Event handler khi Task bị xóa.
    Xóa taskLink khỏi tất cả mindmap nodes.
    """
    try:
        remove_task_link_from_all_nodes(doc.name)
    except Exception as e:
        frappe.log_error(
            f"Error in on_task_delete: {str(e)}", "Task Delete Event Handler"
        )
