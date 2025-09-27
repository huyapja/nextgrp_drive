import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils import now
import requests
import os


def mark_as_viewed(entity):
    if frappe.session.user == "Guest":
        return
    if not frappe.has_permission(
        doctype="Drive Entity Log", ptype="write", user=frappe.session.user
    ):
        return
    if entity.is_group:
        return
    entity_name = entity.name
    entity_log = frappe.db.get_value(
        "Drive Entity Log", {"entity_name": entity_name, "user": frappe.session.user}
    )
    if entity_log:
        frappe.db.set_value(
            "Drive Entity Log", entity_log, "last_interaction", now(), update_modified=False
        )
        return
    doc = frappe.new_doc("Drive Entity Log")
    doc.entity_name = entity_name
    doc.user = frappe.session.user
    doc.last_interaction = now()
    doc.insert()
    return doc


# improved_topic_comment_api.py - Cải thiện API cho Topic Comment

import frappe
from frappe import _
import json
from frappe.rate_limiter import rate_limit


@frappe.whitelist(allow_guest=True)
@rate_limit(key="reference_name", limit=10, seconds=60 * 60)
def add_comment(
    reference_name: str, content: str, comment_email: str, comment_by: str, mentions=None
):
    """Allow logged user with permission to read document to add a comment"""

    # Kiểm tra Topic Comment có tồn tại không
    exists = frappe.db.exists("Topic Comment", reference_name)
    if not exists:
        frappe.throw("Topic does not exist", frappe.DoesNotExistError)

    # Tạo comment mới
    comment = frappe.new_doc("Comment")
    comment.update(
        {
            "comment_type": "Comment",
            "reference_doctype": "Topic Comment",  # Comment thuộc về Topic Comment
            "reference_name": reference_name,  # ID của Topic Comment
            "comment_email": comment_email,
            "comment_by": comment_by,
            "content": content,
            "published": 1,  # Đảm bảo comment được publish
        }
    )

    comment.insert(ignore_permissions=True)

    # Handle mentions in comments
    if mentions:
        try:
            from drive.api.notifications import notify_comment_mentions

            if isinstance(mentions, str):
                mentions = json.loads(mentions)
            if mentions:
                frappe.enqueue(
                    notify_comment_mentions,
                    queue="long",
                    job_id=f"fcomment_{comment.name}",
                    deduplicate=True,
                    timeout=None,
                    now=False,
                    at_front=False,
                    entity_name=reference_name,
                    comment_doc=comment,
                    mentions=mentions,
                )
        except ImportError:
            # Fallback nếu không có drive.api.notifications
            frappe.log_error("notify_comment_mentions not available")

    return comment


@frappe.whitelist()
def create_topic(drive_entity_id: str, content: str, mentions=None):
    """Tạo topic mới cho Drive File"""
    try:
        # Tạo Topic Comment (container)
        topic = frappe.get_doc(
            {
                "doctype": "Topic Comment",
                "title": content[:100],  # Cần thêm field này vào DocType
                "reference_doctype": "Drive File",
                "reference_name": drive_entity_id,
            }
        )

        topic.insert()
        frappe.db.commit()

        # Tạo comment đầu tiên cho topic
        first_comment = add_comment(
            reference_name=topic.name,
            content=content,
            comment_email=frappe.session.user,
            comment_by=frappe.utils.get_fullname(frappe.session.user),
            mentions=mentions,
        )

        return {
            "success": True,
            "topic_id": topic.name,
            "comment_id": first_comment.name,
            "message": _("Topic created successfully"),
        }

    except Exception as e:
        frappe.log_error(f"Error creating topic: {str(e)}")
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def delete_comment(comment_id: str):
    """Xoá comment nếu người dùng là chủ sở hữu hoặc có quyền quản lý"""
    try:
        comment = frappe.get_doc("Comment", comment_id)

        if comment.comment_email != frappe.session.user:
            return {
                "success": False,
                "message": _("You do not have permission to delete this comment"),
            }

        comment.delete()
        frappe.db.commit()

        return {"success": True, "message": _("Comment deleted successfully")}

    except Exception as e:
        frappe.log_error(f"Error deleting comment: {str(e)}")
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def edit_comment(comment_id: str, new_content: str):
    """Chỉnh sửa comment nếu người dùng là chủ sở hữu hoặc có quyền quản lý"""
    try:
        comment = frappe.get_doc("Comment", comment_id)

        if comment.comment_email != frappe.session.user and not frappe.has_permission(
            "Comment", ptype="write", user=frappe.session.user
        ):
            return {
                "success": False,
                "message": _("You do not have permission to edit this comment"),
            }

        comment.content = new_content
        comment.save()
        frappe.db.commit()

        return {"success": True, "message": _("Comment edited successfully")}

    except Exception as e:
        frappe.log_error(f"Error editing comment: {str(e)}")
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_topics_for_file(drive_entity_id: str):
    """Lấy tất cả topics cho một Drive File"""
    try:
        topics = frappe.get_all(
            "Topic Comment",
            filters={"reference_doctype": "Drive File", "reference_name": drive_entity_id},
            fields=[
                "name",
                "title",
                "owner",  # Người tạo topic
                "creation",
                "modified",
            ],
            order_by="modified DESC",
        )
        # Thêm thông tin bổ sung
        for topic in topics:
            # Format datetime cho frontend

            topic["comments"] = frappe.get_all(
                "Comment",
                filters={"reference_doctype": "Topic Comment", "reference_name": topic["name"]},
                fields=["*"],
            )

            if topic.get("modified"):
                topic["modified_ago"] = frappe.utils.pretty_date(topic["modified"])
            if topic.get("creation"):
                topic["created_ago"] = frappe.utils.pretty_date(topic["creation"])

        return {"success": True, "topics": topics, "total_count": len(topics)}

    except Exception as e:
        frappe.log_error(f"Error getting topics: {str(e)}")
        return {"success": False, "message": str(e)}


def generate_otp():
    """Generates a cryptographically secure random OTP"""

    return int.from_bytes(os.urandom(5), byteorder="big") % 900000 + 100000


def get_country_info():
    ip = frappe.local.request_ip

    def _get_country_info():
        fields = [
            "status",
            "message",
            "continent",
            "continentCode",
            "country",
            "countryCode",
            "region",
            "regionName",
            "city",
            "district",
            "zip",
            "lat",
            "lon",
            "timezone",
            "offset",
            "currency",
            "isp",
            "org",
            "as",
            "asname",
            "reverse",
            "mobile",
            "proxy",
            "hosting",
            "query",
        ]

        try:
            res = requests.get(f"https://pro.ip-api.com/json/{ip}?fields={','.join(fields)}")
            data = res.json()
            if data.get("status") != "fail":
                return data
        except Exception:
            pass

        return {}

    return frappe.cache().hget("ip_country_map", ip, generator=_get_country_info)
