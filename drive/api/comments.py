import frappe
import unicodedata
import json
from raven.raven_bot.doctype.raven_bot.raven_bot import RavenBot


@frappe.whitelist()
def react_to_comment(comment_id: str, emoji: str, entity_id: str = None):
    """Toggle a reaction (emoji) on a Comment by the current user.

    Reactions are stored as rows in the standard Comment doctype with:
    - comment_type = "Like"
    - reference_doctype = "Comment"
    - reference_name = parent comment id
    - content = emoji character
    - comment_email = current user

    If a matching reaction already exists for the user, it will be removed
    (toggle off). Otherwise, it is created and a notification is sent to the
    owner of the original comment.
    """

    # Validate parent comment
    parent = frappe.get_value(
        "Comment",
        {
            "name": comment_id,
            "comment_type": "Comment",
            "reference_doctype": "Topic Comment",
        },
        ["name", "reference_name", "comment_email", "content"],
        as_dict=True,
    )
    if not parent:
        frappe.throw("Comment not found", frappe.DoesNotExistError)

    user = frappe.session.user
    # Find existing reaction by the same user and emoji

    normalized_emoji = unicodedata.normalize("NFC", emoji.strip())
    # Fetch all reactions for this comment by this user
    reactions = frappe.get_all(
        "Comment",
        filters={
            "comment_type": "Like",
            "reference_doctype": "Comment",
            "reference_name": comment_id,
            "comment_email": user,
        },
        fields=["name", "content"],
    )
    existing = None
    for reaction in reactions:
        if (
            unicodedata.normalize("NFC", (reaction["content"] or "").strip())
            == normalized_emoji
        ):
            existing = reaction["name"]
            break
    # Get topic and entity info for realtime
    topic_name = parent.reference_name
    topic = frappe.get_value(
        "Topic Comment",
        topic_name,
        ["reference_name"],
        as_dict=True
    )
    entity_name = topic.reference_name if topic else None
    
    reacted = False
    if existing:
        # Toggle off -> delete existing reaction
        frappe.delete_doc("Comment", existing)
        reacted = False
    else:
        # Otherwise, create a new reaction comment
        reaction = frappe.get_doc(
            {
                "doctype": "Comment",
                "comment_type": "Like",
                "reference_doctype": "Comment",
                "reference_name": comment_id,
                "comment_email": user,
                "comment_by": frappe.db.get_value("User", user, "full_name"),
                "content": emoji,
            }
        )
        reaction.insert(ignore_permissions=True)
        reacted = True

    # Notify the owner of the original comment (if different user)
    try:
        if parent.comment_email and parent.comment_email != user and entity_id:
            entity = frappe.get_doc("Drive File", entity_id)
            reactor_full_name = frappe.db.get_value("User", user, "full_name")
            message = f'{reactor_full_name} reacted "{emoji}" to your comment on "{entity.title}"'
            print(
                "Sending reaction notification via RavenBot", parent.comment_email, user
            )
            # create_notification(
            #     from_user=user,
            #     to_user=parent.comment_email,
            #     type="Reaction",
            #     entity=entity,
            #     message=message,
            #     comment_id=parent.name,
            # )

            # Send bot notification
            bot_docs = frappe.conf.get("bot_docs")
            print("Sending reaction notification via RavenBot2")
            if not bot_docs:
                return
            message_data = {
                "key": "reaction_comment_document",
                "title": f'{reactor_full_name} đã thả {emoji} vào bình luận của bạn trong "{entity.title}": "{parent.content}" + {emoji}',
                "full_name_owner": reactor_full_name,
                "to_user": parent.comment_email,
                "message": message,
                "file_name": entity.title,
                "emoji": emoji,
                "comment_content": parent.content or "",
                "comment_id": comment_id,
                "link": f"/drive/t/{entity.team}/file/{entity.name}",
            }

            RavenBot.send_notification_to_user(
                bot_name=bot_docs,
                user_id=parent.comment_email,
                message=json.dumps(message_data, ensure_ascii=False, default=str),
            )
    except Exception:
        # Do not block on notification errors
        pass

    # Publish realtime event for reaction update
    if entity_name:
        # Get user info for realtime
        user_doc = frappe.get_doc("User", user)
        
        # Get current reaction counts and users
        reactions = frappe.get_all(
            "Comment",
            filters={
                "comment_type": "Like",
                "reference_doctype": "Comment",
                "reference_name": comment_id,
            },
            fields=["comment_email", "content"],
        )
        
        # Group reactions by emoji - get ALL reactions, not just the current emoji
        reaction_counts = {}
        reaction_users_map = {}
        for r in reactions:
            emoji_key = r["content"]
            if emoji_key not in reaction_counts:
                reaction_counts[emoji_key] = 0
                reaction_users_map[emoji_key] = []
            reaction_counts[emoji_key] += 1
            # Get user full name
            user_full_name = frappe.db.get_value("User", r["comment_email"], "full_name") or r["comment_email"]
            reaction_users_map[emoji_key].append(user_full_name)
        
        frappe.publish_realtime(
            event="drive_file:comment_reaction_updated",
            message={
                "entity_name": entity_name,
                "topic_name": topic_name,
                "comment_id": comment_id,
                "emoji": emoji,
                "reacted": reacted,
                "user": user,
                "user_full_name": user_doc.full_name,
                "reaction_counts": reaction_counts,  # All reactions, not just current emoji
                "reaction_users": reaction_users_map,  # All reaction users
            },
            doctype="Drive File",
            docname=entity_name,
        )

    return {"status": "added" if reacted else "removed"}
