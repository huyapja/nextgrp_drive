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
            "Drive Entity Log",
            entity_log,
            "last_interaction",
            now(),
            update_modified=False,
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
# @rate_limit(key="reference_name", limit=10, seconds=60 * 60)
def add_comment(
    reference_name: str,
    content: str,
    comment_email: str,
    comment_by: str,
    mentions=None,
    reply_to=None,
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
            "reference_doctype": "Topic Comment",
            "reference_name": reference_name,
            "comment_email": comment_email,
            "comment_by": comment_by,
            "content": content,
            "published": 1,
        }
    )

    comment.insert(ignore_permissions=True)
    
    # Get user_image for comment
    user_image = frappe.db.get_value("User", comment_email, "user_image")

    # Parse JSON strings if needed
    if isinstance(reply_to, str):
        reply_to = json.loads(reply_to)

    if isinstance(mentions, str):
        mentions = json.loads(mentions)

    # Handle mentions in comments
    topic = frappe.db.get_value(
        "Topic Comment", reference_name, ["reference_name", "name"], as_dict=True
    )
    drive_file = frappe.db.get_value(
        "Drive File", topic.reference_name, ["name", "owner"], as_dict=True
    )

    if not topic or not drive_file:
        return comment

    # Notify mentions - SỬA LỖI: Extract IDs từ mentions
    if mentions and len(mentions) > 0:
        # Extract email/id từ mentions list
        mention_ids = set([m.get("id") for m in mentions if m.get("id")])

        # Remove owner from mentions
        if drive_file.owner in mention_ids:
            mention_ids.remove(drive_file.owner)

        if mention_ids:  # Chỉ notify nếu còn người được mention
            try:
                from drive.api.notifications import notify_comment_mentions

                # frappe.enqueue(
                #     notify_comment_mentions,
                #     queue="long",
                #     job_id=f"fcomment_{comment.name}",
                #     deduplicate=True,
                #     timeout=None,
                #     now=False,
                #     at_front=False,
                #     entity_name=drive_file.name,
                #     comment_doc=comment,
                #     mentions=mentions,
                # )
                notify_comment_mentions(
                    entity_name=drive_file.name, comment_doc=comment, mentions=mentions
                )
            except ImportError:
                frappe.log_error("notify_comment_mentions not available")

    # Notify reply
    reply_email = reply_to.get("comment_email") if reply_to else None
    if reply_email:
        try:
            from drive.api.notifications import notify_reply_comment

            # frappe.enqueue(
            #     notify_reply_comment,
            #     queue="long",
            #     job_id=f"fcomment_{comment.name}",
            #     deduplicate=True,
            #     timeout=None,
            #     now=False,
            #     at_front=False,
            #     entity_name=drive_file.name,
            #     comment_doc=comment,
            #     reply_email=reply_email,
            # )
            notify_reply_comment(
                entity_name=drive_file.name,
                comment_doc=comment,
                reply_email=reply_email,
            )
        except ImportError:
            frappe.log_error("notify_reply_comment not available")

    # Notify owner and other members
    try:
        from drive.api.notifications import (
            notify_comment_to_owner_file,
            notify_comment_to_all_members,
        )

        comments = frappe.get_all(
            "Comment",
            filters={
                "reference_name": topic.name,
                "reference_doctype": "Topic Comment",
            },
            fields=["owner"],
        )

        # Notify owner
        if drive_file.owner != comment.comment_email:
            # frappe.enqueue(
            #     notify_comment_to_owner_file,
            #     queue="long",
            #     job_id=f"fcomment_{comment.name}_owner",
            #     deduplicate=True,
            #     timeout=None,
            #     now=False,
            #     at_front=False,
            #     entity_name=drive_file.name,
            #     comment_doc=comment,
            #     owner_email=drive_file.owner,
            # )
            notify_comment_to_owner_file(
                entity_name=drive_file.name,
                comment_doc=comment,
                owner_email=drive_file.owner,
            )

        # Notify other members
        if comments and len(comments) > 0:
            # Get unique member emails (exclude owner)
            member_emails = list(
                set(
                    [
                        c.get("owner")
                        for c in comments
                        if c.get("owner") != drive_file.owner
                    ]
                )
            )

            # Remove mentioned users
            for member_mention in mentions or []:
                member_id = member_mention.get("id")
                if member_id and member_id in member_emails:
                    member_emails.remove(member_id)

            # Remove replied user
            if reply_email and reply_email in member_emails:
                member_emails.remove(reply_email)

            print("notify_comment_to_owner_file_1", member_emails, mentions, reply_to)

            if member_emails:
                frappe.enqueue(
                    notify_comment_to_all_members,
                    queue="long",
                    job_id=f"fcomment_{comment.name}_members",
                    deduplicate=True,
                    timeout=None,
                    now=False,
                    at_front=False,
                    entity_name=drive_file.name,
                    comment_doc=comment,
                    team_members=member_emails,
                )
                # notify_comment_to_all_members(
                #     entity_name=drive_file.name,
                #     comment_doc=comment,
                #     team_members=member_emails,
                # )

    except ImportError:
        frappe.log_error("notify_comment_to_owner_file not available")

    # Publish realtime event for new comment
    frappe.publish_realtime(
        event="drive_file:new_comment",
        message={
            "entity_name": drive_file.name,
            "topic_name": reference_name,
            "comment": {
                "name": comment.name,
                "comment_by": comment.comment_by,
                "comment_email": comment.comment_email,
                "content": comment.content,
                "creation": comment.creation.isoformat() if hasattr(comment.creation, "isoformat") else str(comment.creation),
                "user_image": user_image,
            },
        },
        doctype="Drive File",
        docname=drive_file.name,
    )

    return comment


@frappe.whitelist()
def create_topic(drive_entity_id: str, content: str, mentions=None):
    """Tạo topic mới cho Drive File"""
    try:
        # Kiểm tra Drive File có tồn tại không
        if not frappe.db.exists("Drive File", drive_entity_id):
            frappe.throw(_("Drive File {0} not found").format(drive_entity_id))

        # Tạo Topic Comment (container)
        topic = frappe.get_doc(
            {
                "doctype": "Topic Comment",
                "title": content[:100],
                "reference_doctype": "Drive File",
                "reference_name": drive_entity_id,
            }
        )
        topic.insert()

        # Tạo comment đầu tiên cho topic
        first_comment = add_comment(
            reference_name=topic.name,
            content=content,
            comment_email=frappe.session.user,
            comment_by=frappe.utils.get_fullname(frappe.session.user),
            mentions=mentions,
        )

        # Commit
        frappe.db.commit()

        # LẤY LẠI comment với user_image
        Comment = frappe.qb.DocType("Comment")
        User = frappe.qb.DocType("User")

        comment_with_image = (
            frappe.qb.from_(Comment)
            .inner_join(User)
            .on(Comment.comment_email == User.name)
            .select(
                Comment.name.as_("name"),
                Comment.comment_by.as_("comment_by"),
                Comment.comment_email.as_("comment_email"),
                Comment.creation.as_("creation"),
                Comment.content.as_("content"),
                User.user_image.as_("user_image"),
            )
            .where(Comment.name == first_comment.name)
        ).run(as_dict=True)

        # Chuẩn bị response data
        topic_dict = topic.as_dict()
        topic_dict["comments"] = comment_with_image if comment_with_image else []

        # Publish realtime event for new topic
        frappe.publish_realtime(
            event="drive_file:new_topic",
            message={
                "entity_name": drive_entity_id,
                "topic": topic_dict,
            },
            doctype="Drive File",
            docname=drive_entity_id,
        )

        return topic_dict

    except frappe.DoesNotExistError as e:
        frappe.db.rollback()
        frappe.throw(_("Referenced document not found: {0}").format(str(e)))
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Error creating topic: {str(e)}", "Create Topic Error")
        frappe.throw(_("Failed to create topic: {0}").format(str(e)))


@frappe.whitelist()
def delete_comment(comment_id: str, entity_id):
    """Xoá comment nếu người dùng là chủ sở hữu hoặc có quyền quản lý.
    Nếu là comment cuối cùng trong topic, xóa luôn cả topic."""
    try:
        # Kiểm tra comment có tồn tại không
        if not frappe.db.exists("Comment", comment_id):
            frappe.throw(_("Comment {0} not found").format(comment_id))

        comment = frappe.get_doc("Comment", comment_id)

        # Kiểm tra quyền: người dùng phải là chủ comment HOẶC chủ file
        is_comment_owner = comment.comment_email == frappe.session.user
        is_file_owner = frappe.session.user == frappe.db.get_value(
            "Drive File", entity_id, "owner"
        )

        if not (is_comment_owner or is_file_owner):
            frappe.throw(_("You do not have permission to delete this comment"))

        # Lấy topic_id từ reference_name của comment
        topic_id = comment.reference_name

        # Kiểm tra xem có phải comment cuối cùng trong topic không
        remaining_comments = frappe.get_all(
            "Comment",
            filters={
                "reference_doctype": "Topic Comment",
                "reference_name": topic_id,
                "name": ["!=", comment_id],  # Không đếm comment hiện tại
            },
            limit=1,
        )

        # Lấy thông tin drive_file trước khi xóa
        topic = frappe.db.get_value(
            "Topic Comment", topic_id, ["reference_name"], as_dict=True
        )
        drive_file_name = None
        if topic:
            drive_file_name = topic.reference_name

        # Xóa comment
        comment.delete()

        # Nếu không còn comment nào khác, xóa luôn topic
        topic_deleted = False
        if not remaining_comments:
            try:
                if frappe.db.exists("Topic Comment", topic_id):
                    topic = frappe.get_doc("Topic Comment", topic_id)
                    topic.delete()
                    topic_deleted = True
            except Exception as te:
                frappe.log_error(f"Error deleting topic: {str(te)}")
                # Vẫn tiếp tục vì comment đã xóa thành công

        frappe.db.commit()
        
        # Publish realtime event for deleted comment
        if drive_file_name:
            frappe.publish_realtime(
                event="drive_file:comment_deleted",
                message={
                    "entity_name": drive_file_name,
                    "topic_name": topic_id,
                    "comment_id": comment_id,
                    "topic_deleted": topic_deleted,
                },
                doctype="Drive File",
                docname=drive_file_name,
            )
        
        return {
            "success": True,
            "message": _("Comment deleted successfully"),
            "topic_deleted": topic_deleted,
        }

    except frappe.DoesNotExistError:
        frappe.db.rollback()
        frappe.throw(_("Comment {0} not found").format(comment_id))
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Error deleting comment: {str(e)}")
        frappe.throw(_("Failed to delete comment: {0}").format(str(e)))


@frappe.whitelist()
def edit_comment(comment_id: str, new_content: str, mentions=None):
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

        topic = frappe.db.get_value(
            "Topic Comment", comment.reference_name, ["reference_name"], as_dict=True
        )
        drive_file = frappe.db.get_value(
            "Drive File", topic.reference_name, ["name", "owner"], as_dict=True
        )
        
        # Get user_image for comment
        user_image = frappe.db.get_value("User", comment.comment_email, "user_image")
        
        # Publish realtime event for edited comment
        if drive_file:
            frappe.publish_realtime(
                event="drive_file:comment_updated",
                message={
                    "entity_name": drive_file.name,
                    "topic_name": comment.reference_name,
                    "comment": {
                        "name": comment.name,
                        "comment_by": comment.comment_by,
                        "comment_email": comment.comment_email,
                        "content": comment.content,
                        "modified": comment.modified.isoformat() if hasattr(comment.modified, "isoformat") else str(comment.modified),
                        "is_edited": True,
                        "user_image": user_image,
                    },
                },
                doctype="Drive File",
                docname=drive_file.name,
            )
        # Handle mentions in edited comment
        if isinstance(mentions, str):
            from drive.api.notifications import notify_comment_mentions

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
                    entity_name=drive_file.name,
                    comment_doc=comment,
                    mentions=mentions,
                )

        return {"success": True, "message": _("Comment edited successfully")}

    except Exception as e:
        frappe.log_error(f"Error editing comment: {str(e)}")
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_topics_for_file(drive_entity_id: str):
    """Lấy tất cả topics cho một Drive File"""
    try:
        import unicodedata
        from pypika import Order

        topics = frappe.get_all(
            "Topic Comment",
            filters={
                "reference_doctype": "Drive File",
                "reference_name": drive_entity_id,
            },
            fields=[
                "name",
                "title",
                "owner",  # Người tạo topic
                "creation",
                "modified",
            ],
            order_by="modified ASC",
        )

        # Thêm thông tin bổ sung
        for topic in topics:
            # Format datetime cho frontend
            if topic.get("modified"):
                topic["modified_ago"] = frappe.utils.pretty_date(topic["modified"])
            if topic.get("creation"):
                topic["created_ago"] = frappe.utils.pretty_date(topic["creation"])

            # Lấy comments cho topic
            Comment = frappe.qb.DocType("Comment")
            User = frappe.qb.DocType("User")

            selectedFields = [
                Comment.name,
                Comment.comment_by,
                Comment.comment_email,
                Comment.creation,
                Comment.modified,
                Comment.content,
                User.user_image.as_("user_image"),
            ]

            query = (
                frappe.qb.from_(Comment)
                .inner_join(User)
                .on(Comment.comment_email == User.name)
                .select(*selectedFields)
                .where(
                    (Comment.comment_type == "Comment")
                    & (Comment.reference_doctype == "Topic Comment")
                    & (Comment.reference_name == topic["name"])
                )
                .orderby(Comment.creation, order=Order.asc)
            )
            comments = query.run(as_dict=True)
            # Is_edited flag
            for c in comments:
                c["is_edited"] = c["modified"] and c["modified"] != c["creation"]
            # Attach reactions summary for each comment
            if comments:
                comment_ids = [c.get("name") for c in comments]
                if comment_ids:
                    Reaction = frappe.qb.DocType("Comment")
                    User = frappe.qb.DocType("User")

                    # Get all reactions without grouping first
                    reaction_rows = (
                        frappe.qb.from_(Reaction)
                        .select(Reaction.reference_name, Reaction.content)
                        .where(
                            (Reaction.comment_type == "Like")
                            & (Reaction.reference_doctype == "Comment")
                            & (Reaction.reference_name.isin(comment_ids))
                        )
                    ).run(as_dict=True)

                    # map: comment_id -> { emoji -> count }
                    counts = {}
                    for row in reaction_rows:
                        normalized_emoji = unicodedata.normalize(
                            "NFC", (row.content or "").strip()
                        )
                        counts.setdefault(row.reference_name, {}).setdefault(
                            normalized_emoji, 0
                        )
                        counts[row.reference_name][normalized_emoji] += 1

                    # also indicate whether current user has reacted with each emoji
                    user = frappe.session.user
                    user_rows = (
                        frappe.qb.from_(Reaction)
                        .select(Reaction.reference_name, Reaction.content)
                        .where(
                            (Reaction.comment_type == "Like")
                            & (Reaction.reference_doctype == "Comment")
                            & (Reaction.reference_name.isin(comment_ids))
                            & (Reaction.comment_email == user)
                        )
                    ).run(as_dict=True)

                    user_map = {}
                    for row in user_rows:
                        normalized_emoji = unicodedata.normalize(
                            "NFC", (row.content or "").strip()
                        )
                        user_map.setdefault(row.reference_name, set()).add(
                            normalized_emoji
                        )

                    # get reactor full names for tooltip per emoji
                    reactors_rows = (
                        frappe.qb.from_(Reaction)
                        .left_join(User)
                        .on(Reaction.comment_email == User.name)
                        .select(
                            Reaction.reference_name, Reaction.content, User.full_name
                        )
                        .where(
                            (Reaction.comment_type == "Like")
                            & (Reaction.reference_doctype == "Comment")
                            & (Reaction.reference_name.isin(comment_ids))
                        )
                    ).run(as_dict=True)

                    reactors_map = {}
                    for row in reactors_rows:
                        normalized_emoji = unicodedata.normalize(
                            "NFC", (row.content or "").strip()
                        )
                        reactors_map.setdefault(row.reference_name, {}).setdefault(
                            normalized_emoji, []
                        ).append(row.full_name or "")

                    # Attach reactions to each comment
                    for c in comments:
                        c["reactions"] = []
                        for emoji, cnt in (counts.get(c["name"], {}) or {}).items():
                            c["reactions"].append(
                                {
                                    "emoji": emoji,
                                    "count": int(cnt),
                                    "reacted": emoji in user_map.get(c["name"], set()),
                                }
                            )
                        # attach reactor names list for tooltip
                        c["reaction_users"] = reactors_map.get(c["name"], {})

            topic["comments"] = comments

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
            res = requests.get(
                f"https://pro.ip-api.com/json/{ip}?fields={','.join(fields)}"
            )
            data = res.json()
            if data.get("status") != "fail":
                return data
        except Exception:
            pass

        return {}

    return frappe.cache().hget("ip_country_map", ip, generator=_get_country_info)
