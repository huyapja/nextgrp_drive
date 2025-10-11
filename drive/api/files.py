import os, re, json, mimetypes
import unicodedata
from frappe.utils import get_files_path
import frappe
from frappe import _
from pypika import Order, functions as fn
from .permissions import get_teams, user_has_permission
from pathlib import Path
from werkzeug.wrappers import Response
from werkzeug.utils import secure_filename, send_file
from io import BytesIO
import mimemapper
import jwt
import boto3
import requests
import shutil

from drive.utils.files import (
    get_home_folder,
    get_file_type,
    get_new_title,
    update_file_size,
    if_folder_exists,
    FileManager,
)
from datetime import date, timedelta
import magic
from datetime import datetime
from drive.api.notifications import notify_mentions, notify_team_file_upload
from drive.api.storage import storage_bar_data
from pathlib import Path
from io import BytesIO
from werkzeug.wrappers import Response
from werkzeug.wsgi import wrap_file
from drive.locks.distributed_lock import DistributedLock


@frappe.whitelist()
def upload_file(team, personal=None, fullpath=None, parent=None, last_modified=None, embed=0):
    """
    Accept chunked file contents via a multipart upload, store the file on
    disk, and insert a corresponding DriveEntity doc.

    :param fullpath: Full path of the uploaded file
    :param parent: Document-name of the parent folder. Defaults to the user directory
    :raises PermissionError: If the user does not have write access to the specified parent folder
    :raises FileExistsError: If a file with the same name already exists in the specified parent folder
    :raises ValueError: If the size of the stored file does not match the specified filesize
    :return: DriveEntity doc once the entire file has been uploaded
    """
    home_folder = get_home_folder(team)
    parent = parent or home_folder["name"]
    is_private = personal or frappe.get_value("Drive File", parent, "is_private")
    embed = int(embed)

    if fullpath:
        dirname = os.path.dirname(fullpath).split("/")
        for i in dirname:
            parent = if_folder_exists(team, i, parent, is_private)

    if not frappe.has_permission(
        doctype="Drive File", doc=parent, ptype="write", user=frappe.session.user
    ):
        frappe.throw("Ask the folder owner for upload access.", frappe.PermissionError)

    storage_data = storage_bar_data(team)
    storage_data_limit = storage_data["limit"] * 1024 * 1024 * 1024
    if (storage_data_limit - storage_data["total_size"]) < int(frappe.form_dict.total_file_size):
        frappe.throw("You're out of storage!", ValueError)

    file = frappe.request.files["file"]
    upload_session = frappe.form_dict.uuid
    title = get_new_title(frappe.form_dict.filename if embed else file.filename, parent)
    current_chunk = int(frappe.form_dict.chunk_index)
    total_chunks = int(frappe.form_dict.total_chunk_count)

    temp_path = get_upload_path(home_folder["name"], f"{upload_session}_{secure_filename(title)}")
    # with temp_path.open("ab") as f:
    #     f.seek(int(frappe.form_dict.chunk_byte_offset))
    #     f.write(file.stream.read())
    #     if (
    #         not f.tell() >= int(frappe.form_dict.total_file_size)
    #         or current_chunk != total_chunks - 1
    #     ):
    #         return

    # Thay thế đoạn code hiện tại
    if not temp_path.exists():
        # Tạo file rỗng với size dự kiến
        with temp_path.open("wb") as f:
            f.seek(int(frappe.form_dict.total_file_size) - 1)
            f.write(b"\0")

    with temp_path.open("r+b") as f:
        f.seek(int(frappe.form_dict.chunk_byte_offset))
        chunk_data = file.stream.read()
        f.write(chunk_data)

        if current_chunk != total_chunks - 1:
            return

    # Validate that file size is matching
    file_size = temp_path.stat().st_size
    # Trong hàm upload_file, trước dòng validation:
    print(f"Expected size: {frappe.form_dict.total_file_size}")
    print(f"Actual size on disk: {file_size}")
    print(f"Temp path: {temp_path}")
    if file_size != int(frappe.form_dict.total_file_size):
        temp_path.unlink()
        frappe.throw("Size on disk does not match specified filesize.", ValueError)

    mime_type = mimemapper.get_mime_type(str(temp_path), native_first=False)
    if mime_type is None:
        mime_type = magic.from_buffer(open(temp_path, "rb").read(2048), mime=True)

    # Create DB record
    drive_file = create_drive_file(
        team,
        is_private,
        title,
        parent,
        file_size,
        mime_type,
        last_modified,
        lambda n: Path(home_folder["name"])
        / f"{'embeds' if embed else ''}"
        / f"{n}{temp_path.suffix}",
    )

    # Upload and update parent folder size
    manager = FileManager()
    manager.upload_file(str(temp_path), drive_file.path, drive_file if not embed else None)
    update_file_size(parent, file_size)

    return drive_file


@frappe.whitelist(allow_guest=True)
def upload_chunked_file(personal=0, parent=None, last_modified=None):
    """
    Accept chunked file contents via a multipart upload, store the file on
    disk, and insert a corresponding DriveEntity doc.

    :param fullpath: Full path of the uploaded file
    :param parent: Document-name of the parent folder. Defaults to the user directory
    :raises PermissionError: If the user does not have write access to the specified parent folder
    :raises FileExistsError: If a file with the same name already exists in the specified parent folder
    :raises ValueError: If the size of the stored file does not match the specified filesize
    :return: DriveEntity doc once the entire file has been uploaded
    """
    drive_entity = frappe.get_value(
        "Drive File",
        parent,
        ["document", "title", "mime_type", "file_size", "owner", "team"],
        as_dict=1,
    )
    home_directory = get_home_folder(drive_entity.team)
    embed_directory = Path(
        frappe.get_site_path("private/files"),
        home_directory.name,
        "embeds",
    )
    if not frappe.has_permission(
        doctype="Drive File", doc=parent, ptype="write", user=frappe.session.user
    ):
        frappe.throw("Ask the folder owner for upload access.", frappe.PermissionError)

    file = frappe.request.files["file"]

    name = frappe.form_dict.uuid
    title, file_ext = os.path.splitext(frappe.form_dict.file_name)
    mime_type = frappe.form_dict.mime_type
    current_chunk = int(frappe.form_dict.chunk_index)
    total_chunks = int(frappe.form_dict.total_chunk_count)
    file_size = int(frappe.form_dict.total_file_size)
    save_path = Path(embed_directory) / f"{secure_filename(name+file_ext)}"
    if current_chunk == 0 and save_path.exists():
        frappe.throw(f"File '{title}' already exists", FileExistsError)

    if not mime_type:
        mime_type = magic.from_buffer(open(save_path, "rb").read(2048), mime=True)

    with save_path.open("ab") as f:
        f.seek(int(frappe.form_dict.chunk_byte_offset))
        f.write(file.stream.read())

    if current_chunk + 1 == total_chunks:
        file_size = save_path.stat().st_size

    if file_size != int(frappe.form_dict.total_file_size):
        save_path.unlink()
        frappe.throw("Size on disk does not match specified filesize", ValueError)
    drive_file = create_drive_file(
        drive_entity.team,
        personal,
        title,
        parent,
        file_size,
        mime_type,
        last_modified,
        lambda n: Path(home_directory["name"]) / "embeds" / f"{n}{save_path.suffix}",
    )
    os.rename(save_path, Path(frappe.get_site_path("private/files")) / drive_file.path)

    # Send team notifications for new chunked file (only for public files)
    if not personal:
        try:
            notify_team_file_upload(drive_file)
        except Exception as e:
            print(f"Error sending team notifications for chunked file: {e}")

    return drive_file.name + save_path.suffix


@frappe.whitelist()
def get_thumbnail(entity_name):
    drive_file = frappe.get_value(
        "Drive File",
        entity_name,
        ["is_group", "path", "title", "mime_type", "file_size", "owner", "team", "document"],
        as_dict=1,
    )
    if not drive_file or drive_file.is_group or drive_file.is_link:
        frappe.throw("No thumbnail for this type.", ValueError)
    if not frappe.has_permission(
        doctype="Drive File", doc=drive_file.name, ptype="write", user=frappe.session.user
    ):
        frappe.throw("Cannot upload due to insufficient permissions", frappe.PermissionError)

    with DistributedLock(drive_file.path, exclusive=False):
        thumbnail_data = None
        if frappe.cache().exists(entity_name):
            thumbnail_data = frappe.cache().get_value(entity_name)

        if not thumbnail_data:
            thumbnail_data = None
            try:
                manager = FileManager()
                thumbnail = manager.get_thumbnail(drive_file.team, entity_name)
                thumbnail_data = BytesIO(thumbnail.read())
                frappe.cache().set_value(entity_name, thumbnail_data, expires_in_sec=60 * 60)
            except FileNotFoundError:
                # Handle different file types for thumbnail generation
                if drive_file.mime_type.startswith("text"):
                    try:
                        with manager.get_file(drive_file.path) as f:
                            thumbnail_data = f.read()[:1000].decode("utf-8").replace("\n", "<br/>")
                    except Exception:
                        thumbnail_data = None
                elif drive_file.mime_type == "frappe_doc":
                    try:
                        html = frappe.get_value(
                            "Drive Document", drive_file.document, "raw_content"
                        )
                        thumbnail_data = html[:1000] if html else None
                    except Exception:
                        thumbnail_data = None
                else:
                    # For other file types, return None to use icon instead
                    thumbnail_data = None

                if thumbnail_data:
                    frappe.cache().set_value(entity_name, thumbnail_data, expires_in_sec=60 * 60)

    if isinstance(thumbnail_data, BytesIO):
        response = Response(
            wrap_file(frappe.request.environ, thumbnail_data),
            direct_passthrough=True,
        )
        response.headers.set("Content-Type", "image/jpeg")
        response.headers.set("Content-Disposition", "inline", filename=entity_name)
        return response
    elif thumbnail_data:
        return thumbnail_data
    else:
        # Return 404 when no thumbnail is available
        frappe.throw(
            "No thumbnail available for this file type.", frappe.exceptions.PageDoesNotExistError
        )


@frappe.whitelist()
def create_document_entity(title, personal, team, content, parent=None):
    home_directory = get_home_folder(team)
    parent = parent or home_directory.name

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
    drive_doc = frappe.new_doc("Drive Document")
    drive_doc.title = title
    drive_doc.content = content
    drive_doc.version = 2
    drive_doc.save()

    entity = create_drive_file(
        team,
        personal,
        title,
        parent,
        0,
        "frappe_doc",
        None,
        lambda _: "",
        document=drive_doc.name,
    )

    # Send team notifications for new document (only for public documents)
    if not personal:
        try:
            notify_team_file_upload(entity)
        except Exception as e:
            print(f"Error sending team notifications for document: {e}")

    return entity


def get_upload_path(team_name, file_name):
    uploads_path = Path(frappe.get_site_path("private/files"), team_name, "uploads")
    if not os.path.exists(uploads_path):
        uploads_path = Path(frappe.get_site_path("private/files"), team_name, "uploads")
        uploads_path.mkdir(parents=True, exist_ok=True)
    return uploads_path / file_name


def create_drive_file(
    team, personal, title, parent, file_size, mime_type, last_modified, entity_path, document=None
):
    drive_file = frappe.get_doc(
        {
            "doctype": "Drive File",
            "team": team,
            "is_private": personal,
            "title": title,
            "parent_entity": parent,
            "file_size": file_size,
            "mime_type": mime_type,
            "document": document,
        }
    )
    drive_file.flags.file_created = True
    drive_file.insert()
    drive_file.path = str(entity_path(drive_file.name))
    drive_file.save()
    if last_modified:
        dt_object = datetime.fromtimestamp(int(last_modified) / 1000.0)
        formatted_datetime = dt_object.strftime("%Y-%m-%d %H:%M:%S.%f")
        drive_file.db_set("modified", formatted_datetime, update_modified=False)
    return drive_file


@frappe.whitelist()
def create_folder(team, title, personal=False, parent=None):
    """
    Create a new folder.

    :param title: Folder name
    :param parent: Document-name of the parent folder. Defaults to the user directory
    :raises PermissionError: If the user does not have write access to the specified parent folder
    :raises FileExistsError: If a folder with the same name already exists in the specified parent folder
    :return: DriveEntity doc of the new folder
    """
    home_folder = get_home_folder(team)
    parent = parent or home_folder.name

    if not frappe.has_permission(
        doctype="Drive File", doc=parent, ptype="write", user=frappe.session.user
    ):
        frappe.throw(
            "Cannot create folder due to insufficient permissions",
            frappe.PermissionError,
        )

    # if not personal:
    #     entity_exists = frappe.db.exists(
    #         {
    #             "doctype": "Drive File",
    #             "parent_entity": parent,
    #             "is_group": 1,
    #             "title": title,
    #             "is_active": 1,
    #             "is_private": 0,
    #         }
    #     )
    # else:
    #     entity_exists = frappe.db.exists(
    #         {
    #             "doctype": "Drive File",
    #             "parent_entity": parent,
    #             "title": title,
    #             "is_group": 1,
    #             "is_active": 1,
    #             "owner": frappe.session.user,
    #             "is_private": 1,
    #         }
    #     )
    # # BROKEN: capitlization?
    # if entity_exists:
    #     suggested_name = get_new_title(title, parent, folder=True)
    #     frappe.throw(
    #         f"Folder '{title}' already exists.\n Suggested: {suggested_name}",
    #         FileExistsError,
    #     )

    drive_file = frappe.get_doc(
        {
            "doctype": "Drive File",
            "title": title,
            "team": team,
            "is_group": 1,
            "parent_entity": parent,
            "color": "#525252",
            "is_private": personal,
            "file_type": "Folder",
        }
    )
    drive_file.insert()
    response = drive_file.as_dict()
    response["file_type"] = "Folder"  # Đảm bảo file_type được set

    return response


@frappe.whitelist()
def create_link(team, title, link, personal=False, parent=None):
    home_folder = get_home_folder(team)
    parent = parent or home_folder.name

    if not frappe.has_permission(
        doctype="Drive File", doc=parent, ptype="write", user=frappe.session.user
    ):
        frappe.throw(
            "Cannot create folder due to insufficient permissions",
            frappe.PermissionError,
        )
    if not personal:
        entity_exists = frappe.db.exists(
            {
                "doctype": "Drive File",
                "parent_entity": parent,
                "title": title,
                "is_active": 1,
                "is_link": 1,
            }
        )
    else:
        entity_exists = frappe.db.exists(
            {
                "doctype": "Drive File",
                "parent_entity": parent,
                "title": title,
                "is_link": 1,
                "is_active": 1,
                "owner": frappe.session.user,
                "is_private": 1,
            }
        )
    if entity_exists:
        suggested_name = get_new_title(title, parent, folder=True)
        frappe.throw(
            f"File '{title}' already exists.\n Suggested: {suggested_name}",
            FileExistsError,
        )

    drive_file = frappe.get_doc(
        {
            "doctype": "Drive File",
            "title": title,
            "team": team,
            "path": link,
            "is_link": 1,
            "mime_type": "link/unknown",
            "parent_entity": parent,
            "is_private": personal,
        }
    )
    drive_file.insert()

    # Send team notifications for new link (only for public links)
    if not personal:
        try:
            notify_team_file_upload(drive_file)
        except Exception as e:
            print(f"Error sending team notifications for link: {e}")

    return drive_file


@frappe.whitelist()
def save_doc(entity_name, doc_name, raw_content, content, file_size, mentions, settings=None):
    write_perms = user_has_permission(
        frappe.get_doc("Drive File", entity_name), "write", frappe.session.user
    )
    comment_perms = user_has_permission(
        frappe.get_doc("Drive File", entity_name), "comment", frappe.session.user
    )
    # BROKEN - comment access is write access
    if not write_perms and not comment_perms:
        raise frappe.PermissionError("You do not have permission to view this file")
    if settings:
        frappe.db.set_value("Drive Document", doc_name, "settings", json.dumps(settings))
    file_size = len(content.encode("utf-8")) + len(raw_content.encode("utf-8"))
    update_modifed = comment_perms and not write_perms
    frappe.db.set_value("Drive Document", doc_name, "content", content)
    frappe.db.set_value("Drive Document", doc_name, "raw_content", raw_content)
    frappe.db.set_value("Drive Document", doc_name, "mentions", json.dumps(mentions))
    if (
        frappe.db.get_value("Drive File", entity_name, "file_size") != int(file_size)
        and write_perms
    ):
        frappe.db.set_value("Drive File", entity_name, "file_size", file_size)
    if json.dumps(mentions):
        frappe.enqueue(
            notify_mentions,
            queue="long",
            job_id=f"fdoc_{doc_name}",
            deduplicate=True,
            timeout=None,
            now=False,
            at_front=False,
            entity_name=entity_name,
            document_name=doc_name,
        )
    return


@frappe.whitelist()
def create_doc_version(entity_name, doc_name, snapshot_data, snapshot_message):
    if not frappe.has_permission(
        doctype="Drive File",
        doc=entity_name,
        ptype="write",
        user=frappe.session.user,
    ):
        raise frappe.permissionerror("you do not have permission to view this file")
    new_version = frappe.new_doc("Drive Document Version")
    new_version.snapshot_data = snapshot_data
    new_version.parent_entity = entity_name
    new_version.snapshot_message = snapshot_message
    new_version.parent_document = doc_name
    new_version.snapshot_size = len(snapshot_data.encode("utf-8"))
    new_version.save()
    return


@frappe.whitelist()
def get_doc_version_list(entity_name):
    if not frappe.has_permission(
        doctype="Drive File",
        doc=entity_name,
        ptype="write",
        user=frappe.session.user,
    ):
        raise frappe.PermissionError("You do not have permission to view this file")
    return frappe.get_list(
        "Drive Document Version",
        filters={"parent_entity": entity_name},
        order_by="creation desc",
        fields=["*"],
    )


@frappe.whitelist()
def create_auth_token(entity_name):
    if not frappe.has_permission(
        doctype="Drive File",
        doc=entity_name,
        ptype="read",
        user=frappe.session.user,
    ):
        raise frappe.PermissionError("You do not have permission to view this file")
    settings = frappe.get_single("Drive Site Settings")
    key = settings.get_password("jwt_key", raise_exception=False)
    return jwt.encode(
        {"name": entity_name, "expiry": (datetime.now() + timedelta(minutes=1)).timestamp()},
        key=key,
    )


@frappe.whitelist(allow_guest=True)
def get_file_content(entity_name, trigger_download=0, jwt_token=None):
    """
    Stream file content and optionally trigger download

    :param entity_name: Document-name of the file whose content is to be streamed
    :param trigger_download: 1 to trigger the "Save As" dialog. Defaults to 0
    :type trigger_download: int
    :raises ValueError: If the DriveEntity doc does not exist or is not a file
    :raises PermissionError: If the current user does not have permission to read the file
    :raises FileLockedError: If the file has been writer-locked

    JWT tokens are a vulnerability - if used, they bypass all permissions and give the file.
    Only the file name and secret token is needed to get access to all files.

    A more secure way would be a DB-stored auth token that can only be created by someone with read access.
    """
    if jwt_token:
        settings = frappe.get_single("Drive Site Settings")
        auth = jwt.decode(jwt_token, key=settings.get_password("jwt_key"), algorithms=["HS256"])
        if datetime.now().timestamp() > auth["expiry"] or auth["name"] != entity_name:
            raise frappe.PermissionError("You do not have permission to view this file")

    elif not frappe.has_permission(
        doctype="Drive File",
        doc=entity_name,
        ptype="read",
        user=frappe.session.user,
    ):
        raise frappe.PermissionError("You do not have permission to view this file")

    trigger_download = int(trigger_download)
    drive_file = frappe.get_value(
        "Drive File",
        {"name": entity_name},
        [
            "is_group",
            "is_link",
            "path",
            "title",
            "mime_type",
            "file_size",
            "is_active",
            "owner",
            "document",
        ],
        as_dict=1,
    )
    if not drive_file or drive_file.is_group or drive_file.is_link:
        frappe.throw("Not found", frappe.NotFound)

    if drive_file.document:
        html = frappe.get_value("Drive Document", drive_file.document, "raw_content")
        return html
    else:
        manager = FileManager()
        return send_file(
            manager.get_file(drive_file.path),
            mimetype=drive_file.mime_type,
            as_attachment=trigger_download,
            conditional=True,
            max_age=3600,
            download_name=drive_file.title,
            environ=frappe.request.environ,
        )


def stream_file_content(drive_file, range_header):
    """
    Stream file content and optionally trigger download

    :param entity_name: Document-name of the file whose content is to be streamed
    :param drive_file: Drive File record object
    """
    path = Path(frappe.get_site_path("private/files")) / drive_file.path
    size = os.path.getsize(path)
    byte1, byte2 = 0, None

    m = re.search("(\d+)-(\d*)", range_header)
    g = m.groups()

    if g[0]:
        byte1 = int(g[0])
    if g[1]:
        byte2 = int(g[1])

    length = size - byte1

    max_length = 20 * 1024 * 1024  # 20 MB in bytes
    if length > max_length:
        length = max_length

    if byte2 is not None:
        length = byte2 - byte1

    data = None
    with open(path, "rb") as f:
        f.seek(byte1)
        data = f.read(length)

    res = Response(data, 206, mimetype=mimetypes.guess_type(path)[0], direct_passthrough=True)
    res.headers.add("Content-Range", "bytes {0}-{1}/{2}".format(byte1, byte1 + length - 1, size))
    return res


@frappe.whitelist(allow_guest=True)
def list_entity_comments(entity_name):
    Comment = frappe.qb.DocType("Comment")
    User = frappe.qb.DocType("User")
    selectedFields = [
        Comment.name,
        Comment.comment_by,
        Comment.comment_email,
        Comment.creation,
        Comment.content,
        User.user_image,
    ]

    query = (
        frappe.qb.from_(Comment)
        .inner_join(User)
        .on(Comment.comment_email == User.name)
        .select(*selectedFields)
        .where(
            (Comment.comment_type == "Comment")
            & (Comment.reference_doctype == "Drive File")
            & (Comment.reference_name == entity_name)
        )
        .orderby(Comment.creation, order=Order.asc)
    )
    comments = query.run(as_dict=True)

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
                normalized_emoji = unicodedata.normalize("NFC", (row.content or "").strip())
                counts.setdefault(row.reference_name, {}).setdefault(normalized_emoji, 0)
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
                normalized_emoji = unicodedata.normalize("NFC", (row.content or "").strip())
                user_map.setdefault(row.reference_name, set()).add(normalized_emoji)

            # get reactor full names for tooltip per emoji
            reactors_rows = (
                frappe.qb.from_(Reaction)
                .left_join(User)
                .on(Reaction.comment_email == User.name)
                .select(Reaction.reference_name, Reaction.content, User.full_name)
                .where(
                    (Reaction.comment_type == "Like")
                    & (Reaction.reference_doctype == "Comment")
                    & (Reaction.reference_name.isin(comment_ids))
                )
            ).run(as_dict=True)
            reactors_map = {}
            for row in reactors_rows:
                normalized_emoji = unicodedata.normalize("NFC", (row.content or "").strip())
                reactors_map.setdefault(row.reference_name, {}).setdefault(
                    normalized_emoji, []
                ).append(row.full_name or "")

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

    return comments


def delete_background_job(entity, ignore_permissions):
    frappe.delete_doc("Drive File", entity, ignore_permissions=ignore_permissions)


@frappe.whitelist()
def delete_entities(entity_names=None, clear_all=None):
    """
    Permanently delete DriveEntities (files and shortcuts)

    :param entity_names: List of document-names or objects with entity and is_shortcut properties
    :type entity_names: list[str] or list[dict]
    :raises ValueError: If decoded entity_names is not a list
    """
    if clear_all:
        # Xóa vĩnh viễn tất cả files trong trash của user
        file_names = frappe.db.get_list(
            "Drive File", {"is_active": 0, "owner": frappe.session.user}, pluck="name"
        )
        for file_name in file_names:
            frappe.get_doc("Drive File", file_name).permanent_delete()

        # Soft delete tất cả shortcuts trong trash của user (set is_active = -1)
        shortcut_names = frappe.db.get_list(
            "Drive Shortcut", {"is_active": 0, "shortcut_owner": frappe.session.user}, pluck="name"
        )
        for shortcut_name in shortcut_names:
            frappe.db.set_value(
                "Drive Shortcut", shortcut_name, "is_active", -1, update_modified=False
            )

    elif isinstance(entity_names, str):
        entity_names = json.loads(entity_names)
    elif not isinstance(entity_names, list) or not entity_names:
        frappe.throw(f"Expected non-empty list but got {type(entity_names)}", ValueError)

    if entity_names:
        for entity in entity_names:
            # Xử lý entity có thể là string hoặc dict
            if isinstance(entity, dict):
                entity_name = entity.get("entity")
                is_shortcut = entity.get("is_shortcut", False)
            else:
                # Backward compatibility - assume it's a file name
                entity_name = entity
                is_shortcut = False

            if is_shortcut:
                # Soft delete shortcut (set is_active = -1)
                try:
                    # Kiểm tra shortcut có tồn tại và đang trong trash không
                    shortcut = frappe.db.get_value(
                        "Drive Shortcut",
                        {
                            "name": entity_name,
                            "shortcut_owner": frappe.session.user,
                            "is_active": 0,  # Chỉ xử lý shortcut đã ở trong trash
                        },
                        ["name"],
                        as_dict=True,
                    )

                    if not shortcut:
                        frappe.throw(
                            f"Shortcut {entity_name} not found in trash or you don't have permission to delete it"
                        )

                    # Soft delete: set is_active = -1 với ignore_permissions
                    frappe.db.set_value(
                        "Drive Shortcut", entity_name, "is_active", -1, update_modified=False
                    )

                except frappe.DoesNotExistError:
                    frappe.throw(f"Shortcut {entity_name} not found")
                except Exception as e:
                    frappe.throw(f"Failed to delete shortcut {entity_name}: {str(e)}")
            else:
                # Xóa vĩnh viễn file (logic cũ)
                try:
                    file_doc = frappe.get_doc("Drive File", entity_name)
                    # Kiểm tra file có trong trash không
                    if file_doc.is_active == 1:
                        frappe.throw(f"File {entity_name} is not in trash")
                    file_doc.permanent_delete()
                except Exception as e:
                    frappe.throw(f"Failed to delete file {entity_name}: {str(e)}")

    frappe.db.commit()

    return {"success": True, "message": "Entities permanently deleted successfully"}


@frappe.whitelist()
def set_favourite(entities=None, clear_all=False):
    if clear_all:
        # Clear all favourites from Drive Favourite table
        frappe.db.delete("Drive Favourite", {"user": frappe.session.user})
        frappe.db.commit()
        return

    if not isinstance(entities, list):
        frappe.throw(f"Expected list but got {type(entities)}", ValueError)

    for entity in entities:
        # Check if this is a shortcut entity
        is_shortcut = entity.get("is_shortcut") or entity.get("shortcut_name")

        if is_shortcut:
            # For shortcut files, check existing favourite by entity_shortcut
            existing_doc = frappe.db.exists(
                {
                    "doctype": "Drive Favourite",
                    "entity_shortcut": entity["shortcut_name"],
                    "user": frappe.session.user,
                }
            )

            # Set default favourite status if not provided
            if "is_favourite" not in entity:
                entity["is_favourite"] = not existing_doc

            # Ensure is_favourite is boolean
            if not isinstance(entity["is_favourite"], bool):
                entity["is_favourite"] = json.loads(entity["is_favourite"])

            # Handle favourite/unfavourite logic for shortcuts
            if not entity["is_favourite"] and existing_doc:
                # Remove from favourites
                frappe.delete_doc("Drive Favourite", existing_doc)
            elif entity["is_favourite"] and not existing_doc:
                # Add to favourites
                frappe.get_doc(
                    {
                        "doctype": "Drive Favourite",
                        # "entity": entity.get("name"),  # Original entity name if available
                        "entity_shortcut": entity["shortcut_name"],
                        "user": frappe.session.user,
                    }
                ).insert()

        else:
            # For regular files, use entity field as before
            existing_doc = frappe.db.exists(
                {
                    "doctype": "Drive Favourite",
                    "entity": entity["name"],
                    "user": frappe.session.user,
                }
            )

            # Set default favourite status if not provided
            if "is_favourite" not in entity:
                entity["is_favourite"] = not existing_doc

            # Ensure is_favourite is boolean
            if not isinstance(entity["is_favourite"], bool):
                entity["is_favourite"] = json.loads(entity["is_favourite"])

            # Handle favourite/unfavourite logic for regular files
            if not entity["is_favourite"] and existing_doc:
                # Remove from favourites
                frappe.delete_doc("Drive Favourite", existing_doc)
            elif entity["is_favourite"] and not existing_doc:
                # Add to favourites
                frappe.get_doc(
                    {
                        "doctype": "Drive Favourite",
                        "entity": entity["name"],
                        "user": frappe.session.user,
                    }
                ).insert()

    frappe.db.commit()


# def toggle_is_active(doc):
#     doc.is_active = 0 if doc.is_active else 1
#     frappe.db.set_value('Drive File', doc.name, 'is_active',doc.is_active)
#     for child in doc.get_children():
#         toggle_is_active(child)


@frappe.whitelist()
def remove_or_restore(team=None, entity_shortcuts=None, entity_names=None):
    """
    To move entities (files and shortcuts) to or restore entities from the trash

    :param entity_names: List of file document-names
    :type entity_names: list[str]
    :param entity_shortcuts: List of shortcut document-names
    :type entity_shortcuts: list[str]
    :param team: Team name
    """
    if team:
        storage_data = storage_bar_data(team)

    success_files = []  # Danh sách file xóa thành công
    failed_files = []  # Danh sách file không có quyền
    # Process files
    if entity_names:
        if isinstance(entity_names, str):
            entity_names = json.loads(entity_names)
        if not isinstance(entity_names, list):
            frappe.throw(f"Expected list but got {type(entity_names)}", ValueError)

        def depth_zero_toggle_is_active(doc):
            if doc.is_active:
                flag = 0
                # Thêm vào global trash khi chuyển vào thùng rác
                existing_trash = frappe.db.exists(
                    {"doctype": "Drive Trash", "entity": doc.name, "user": frappe.session.user}
                )
                if not existing_trash:
                    frappe.get_doc(
                        {
                            "doctype": "Drive Trash",
                            "entity": doc.name,
                            "user": frappe.session.user,
                            "team": doc.team,
                            "original_path": doc.path,
                            "trashed_on": frappe.utils.now(),
                        }
                    ).insert()
            else:
                storage_data_limit = storage_data["limit"] * 1024 * 1024
                if (storage_data_limit - storage_data["total_size"]) < doc.file_size:
                    frappe.throw("You're out of storage!", ValueError)
                flag = 1
                # Xóa khỏi global trash khi khôi phục
                existing_trash = frappe.db.exists(
                    {"doctype": "Drive Trash", "entity": doc.name, "user": frappe.session.user}
                )
                if existing_trash:
                    frappe.delete_doc("Drive Trash", existing_trash)

            doc.is_active = flag
            folder_size = frappe.db.get_value("Drive File", doc.parent_entity, "file_size")
            frappe.db.set_value(
                "Drive File",
                doc.parent_entity,
                "file_size",
                folder_size + doc.file_size * (1 if flag else -1),
            )
            doc.save()

        for entity in entity_names:
            try:
                doc = frappe.get_doc("Drive File", entity)
                if user_has_permission(doc, "write", frappe.session.user):
                    depth_zero_toggle_is_active(doc)
                    success_files.append(doc.name)
                else:
                    failed_files.append(doc.name)
            except Exception as e:
                failed_files.append(entity)
                continue

    # Process shortcuts
    if entity_shortcuts:
        if isinstance(entity_shortcuts, str):
            entity_shortcuts = json.loads(entity_shortcuts)
        if not isinstance(entity_shortcuts, list):
            frappe.throw(f"Expected list but got {type(entity_shortcuts)}", ValueError)

        def toggle_shortcut_is_active(name):
            # Get shortcut document
            shortcut_doc = frappe.get_doc("Drive Shortcut", name)

            # Check permission - user must own the shortcut
            print(
                shortcut_doc.shortcut_owner,
                frappe.session.user,
                "---- shortcut_doc.shortcut_owner, frappe.session.user ----",
            )
            if shortcut_doc.shortcut_owner != frappe.session.user:
                raise frappe.PermissionError("You do not have permission to modify this shortcut")

            if shortcut_doc.is_active:
                # Move to trash
                flag = 0
                # Thêm vào Drive Trash với entity_shortcut
                existing_trash = frappe.db.exists(
                    {
                        "doctype": "Drive Trash",
                        "entity_shortcut": name,
                        "user": frappe.session.user,
                    }
                )
                if not existing_trash:
                    frappe.get_doc(
                        {
                            "doctype": "Drive Trash",
                            "entity_shortcut": name,
                            "user": frappe.session.user,
                            "team": team,
                            "original_path": f"Shortcut: {shortcut_doc.name}",
                            "trashed_on": frappe.utils.now(),
                        }
                    ).insert()
            else:
                # Restore from trash
                flag = 1
                # Check if original file still exists and is active
                original_file = frappe.db.get_value("Drive File", shortcut_doc.file, "is_active")
                if not original_file:
                    frappe.throw(
                        f"Cannot restore shortcut '{shortcut_doc.name}'. The original file no longer exists or is in trash."
                    )

                # Xóa khỏi Drive Trash
                existing_trash = frappe.db.exists(
                    {
                        "doctype": "Drive Trash",
                        "entity_shortcut": name,
                        "user": frappe.session.user,
                    }
                )
                if existing_trash:
                    frappe.delete_doc("Drive Trash", existing_trash)

            # Update shortcut status
            shortcut_doc.is_active = flag
            shortcut_doc.save(ignore_permissions=True)

        for shortcut in entity_shortcuts:
            try:
                toggle_shortcut_is_active(shortcut)
                success_files.append(shortcut)

            except frappe.PermissionError:
                failed_files.append(shortcut)
                continue
            except Exception as e:
                frappe.log_error(f"Error processing shortcut {shortcut}: {str(e)}")
                failed_files.append(shortcut)
                continue
        print(success_files, failed_files, "---- success_files, failed_files ----")
    frappe.db.commit()

    # Trả về kết quả
    result = {
        "success": len(success_files) > 0,
        "message": "",
        "success_files": success_files,
        "failed_files": failed_files,
    }

    if len(failed_files) > 0:
        # Nếu có file thất bại
        if len(success_files) > 0:
            # Có cả file thành công và thất bại
            result["message"] = (
                f"Đã xóa {len(success_files)} file thành công. {len(failed_files)} file không có quyền xóa: {', '.join(failed_files)}"
            )
        else:
            # Tất cả đều thất bại
            result["message"] = f"Không có quyền xóa các file: {', '.join(failed_files)}"
    else:
        # Tất cả thành công
        result["message"] = f"Đã xóa {len(success_files)} file thành công"

    return result


@frappe.whitelist(allow_guest=True)
def call_controller_method(entity_name, method):
    """
    Call a whitelisted Drive File or Drive Shortcut controller method

    :param entity_name: Document-name of the document on which the controller method is to be called
    :param method: The controller method to be called
    :raises ValueError: If the entity does not exist
    :return: The result of the controller method
    """
    # Get parameters from form_dict
    entity_name = frappe.local.form_dict.pop("entity_name")
    method = frappe.local.form_dict.pop("method")
    frappe.local.form_dict.pop("cmd", None)  # Remove cmd parameter

    # Try Drive File first
    if frappe.db.exists("Drive File", entity_name):
        drive_file = frappe.get_doc("Drive File", entity_name)
        drive_file.is_whitelisted(method)
        return drive_file.run_method(method, **frappe.local.form_dict)

    # Try Drive Shortcut if Drive File not found
    elif frappe.db.exists("Drive Shortcut", entity_name):
        drive_shortcut = frappe.get_doc("Drive Shortcut", entity_name)
        drive_shortcut.is_whitelisted(method)
        return drive_shortcut.run_method(method, **frappe.local.form_dict)

    # If neither exists, throw error
    frappe.throw(f"Entity '{entity_name}' does not exist", ValueError)


@frappe.whitelist()
def remove_recents(entity_names=[], clear_all=False):
    """
    Clear recent DriveEntities for specified user

    :param entity_names: List of document-names
    :type entity_names: list[str]
    :raises ValueError: If decoded entity_names is not a list
    """

    if clear_all:
        return frappe.db.delete("Drive Entity Log", {"user": frappe.session.user})

    if not isinstance(entity_names, list):
        frappe.throw(f"Expected list but got {type(entity_names)}", ValueError)

    for entity in entity_names:
        existing_doc = frappe.db.exists(
            {
                "doctype": "Drive Entity Log",
                "entity_name": entity,
                "user": frappe.session.user,
            }
        )
        if existing_doc:
            frappe.delete_doc("Drive Entity Log", existing_doc)


@frappe.whitelist()
def get_children_count(drive_file):
    children_count = frappe.db.count("Drive File", {"parent_entity": drive_file, "is_active": 1})
    return children_count


@frappe.whitelist()
def does_entity_exist(name=None, parent_entity=None):
    result = frappe.db.exists("Drive File", {"parent_entity": parent_entity, "title": name})
    return bool(result)


def auto_delete_from_trash():
    days_before = (date.today() - timedelta(days=30)).isoformat()
    result = frappe.db.get_all(
        "Drive File",
        filters={"is_active": 0, "last_modified": ["<", days_before]},
        fields=["name"],
    )
    delete_entities(result)


def clear_deleted_files():
    days_before = (date.today() - timedelta(days=30)).isoformat()
    result = frappe.db.get_all(
        "Drive File",
        filters={"is_active": -1, "modified": ["<", days_before]},
        fields=["name"],
    )

    result_shortcut = frappe.db.get_all(
        "Drive Shortcut",
        filters={"is_active": -1, "modified": ["<", days_before]},
        fields=["name"],
    )
    for entity in result:
        doc = frappe.get_doc("Drive File", entity, ignore_permissions=True)
        doc.delete()
    for entity in result_shortcut:
        doc = frappe.get_doc("Drive Shortcut", entity, ignore_permissions=True)
        doc.delete()


@frappe.whitelist()
def get_title(entity_name):
    """
    Toggle allow download for entity

    """
    if not frappe.has_permission(
        doctype="Drive File", doc=entity_name, ptype="write", user=frappe.session.user
    ):
        frappe.throw("Not permitted", frappe.PermissionError)
    return frappe.db.get_value("Drive File", entity_name, "title")


@frappe.whitelist()
def move(entities, new_parent=None, is_private=None, team=None):
    """
    Move file or folder to the new parent folder

    :param new_parent: Document-name of the new parent folder. Defaults to the user directory
    :raises NotADirectoryError: If the new_parent is not a folder, or does not exist
    :raises FileExistsError: If a file or folder with the same name already exists in the specified parent folder
    :return: DriveEntity doc once file is moved
    """

    for entity in entities:
        # Sửa: Truy cập như dictionary thay vì object attribute
        if entity.get("is_shortcut"):  # hoặc entity["is_shortcut"] nếu chắc chắn key tồn tại
            doc = frappe.get_doc("Drive Shortcut", {"name": entity.get("shortcut_name")})
            res = doc.move_shortcut(new_parent)
        else:
            doc = frappe.get_doc("Drive File", entity.get("name"))  # hoặc entity["name"]
            res = doc.move(new_parent, is_private, team)
            # if res["title"] == "Drive - " + res["team"]:
            #     res["title"] = "Home" if res["is_private"] else "Team"

    return res


@frappe.whitelist()
def search(query, team):
    """
    Basic search implementation
    """
    text = frappe.db.escape(" ".join(k + "*" for k in query.split()))
    user = frappe.db.escape(frappe.session.user)
    team = frappe.db.escape(team)
    try:
        result = frappe.db.sql(
            f"""
        SELECT  `tabDrive File`.name,
                `tabDrive File`.title,
                `tabDrive File`.is_group,
                `tabDrive File`.is_link,
                `tabDrive File`.mime_type,
                `tabDrive File`.document,
                `tabDrive File`.color,
                `tabUser`.name AS user_name,
                `tabUser`.user_image,
                `tabUser`.full_name
        FROM `tabDrive File`
        LEFT JOIN `tabUser` ON `tabDrive File`.`owner` = `tabUser`.`name`
        WHERE `tabDrive File`.team = {team}
            AND `tabDrive File`.`is_active` = 1
            AND (`tabDrive File`.`owner` = {user} OR `tabDrive File`.is_private = 0)
            AND `tabDrive File`.`parent_entity` <> ''
            AND MATCH(title) AGAINST ({text} IN BOOLEAN MODE)
        GROUP  BY `tabDrive File`.`name`
        """,
            as_dict=1,
        )
        for r in result:
            r["file_type"] = get_file_type(r)
        return result
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Frappe Drive Search Error")
        return {"error": str(e)}


@frappe.whitelist()
def get_ancestors_of(entity_name):
    """
    Return all parent nodes till the root node
    """
    # CONCAT_WS('/', t.title, gp.path),
    entity_name = frappe.db.escape(entity_name)
    result = frappe.db.sql(
        f"""
        WITH RECURSIVE generated_path as (
        SELECT
            `tabDrive File`.name,
            `tabDrive File`.parent_entity
        FROM `tabDrive File`
        WHERE `tabDrive File`.name = {entity_name}

        UNION ALL

        SELECT
            t.name,
            t.parent_entity
        FROM generated_path as gp
        JOIN `tabDrive File` as t ON t.name = gp.parent_entity)
        SELECT name FROM generated_path;
    """,
        as_dict=0,
    )
    # Match the output of frappe/nested.py get_ancestors_of
    flattened_list = [item for sublist in result for item in sublist]
    flattened_list.pop(0)
    return flattened_list


@frappe.whitelist()
def get_translate():
    return {
        l["old_name"]: l["name"]
        for l in frappe.get_list("Drive File", fields=["old_name", "name"])
        if l["old_name"]
    }


@frappe.whitelist()
def export_media(entity_name):
    return frappe.get_list(
        "Drive File", filters={"parent_entity": entity_name}, fields=["name", "title"]
    )


def get_s3_signed_url(path, mime_type, expires_in=3600):
    s3 = boto3.client(
        "s3",
        aws_access_key_id=frappe.conf.aws_access_key_id,
        aws_secret_access_key=frappe.conf.aws_secret_access_key,
        region_name=frappe.conf.get("aws_default_region"),
    )
    bucket_name = frappe.conf.s3_bucket

    return s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": bucket_name, "Key": path, "ResponseContentType": mime_type},
        ExpiresIn=expires_in,
    )


@frappe.whitelist()
def get_file_signed_url(docname: str):
    doc = frappe.get_doc("Drive File", docname)
    mime_type = doc.mime_type or ""

    allowed_types = [
        # Word
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.oasis.opendocument.text",
        # Excel
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.oasis.opendocument.spreadsheet",
        "link/googlesheets",
        "application/vnd.apple.numbers",
        "text/csv",
        # PowerPoint
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
        "application/vnd.oasis.opendocument.presentation",
        "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
    ]

    if mime_type not in allowed_types:
        frappe.throw(_("Only .docx, .xlsx, .csv and .pptx files are supported."))

    # Tạo signed URL
    signed_url = get_s3_signed_url(doc.path, mime_type)

    return {
        "signed_url": signed_url,
        "title": doc.title,
    }


# @frappe.whitelist()
# def get_copy_destinations(source_entity_name):
#     """Lấy danh sách các đích đến có thể sao chép dựa trên quyền của user"""
#     user = frappe.session.user
#     destinations = []

#     # Home directory
#     home_folders = get_folders_by_parent(None, user_filter=user)
#     destinations.append(
#         {"name": "Home", "entity_name": None, "type": "home", "folders": home_folders}
#     )

#     # Groups mà user tham gia
#     user_groups = frappe.get_all(
#         "Drive Entity Group Member", filters={"user": user}, fields=["parent"]
#     )

#     for group in user_groups:
#         group_entity = frappe.get_doc("Drive Entity", group.parent)
#         group_folders = get_folders_by_parent(group.parent)

#         destinations.append(
#             {
#                 "name": group_entity.title,
#                 "entity_name": group.parent,
#                 "type": "group",
#                 "folders": group_folders,
#             }
#         )

#     return destinations


def get_folders_by_parent(parent_entity_name, user_filter=None):
    """Lấy danh sách folders theo parent entity"""
    filters = {"is_group": 1, "parent_entity": parent_entity_name}

    if user_filter:
        filters["owner"] = user_filter

    folders = frappe.get_all(
        "Drive Entity", filters=filters, fields=["name", "title"], order_by="title"
    )

    # Thêm subfolders cho mỗi folder
    for folder in folders:
        folder["subfolders"] = get_folders_by_parent(folder["name"])

    return folders


@frappe.whitelist()
def copy_file_or_folder(entity_name, is_private, new_parent=None, team=None):
    """
    Copy file or folder to a new location

    :param entity_name: Name of the file/folder to copy
    :param new_parent: Document-name of the destination folder
    :param team: Team ID - if provided, will copy to root folder of that team
    """
    try:
        # Lấy thông tin entity gốc
        source_doc = frappe.get_doc("Drive File", entity_name)

        # Xử lý parameter: ưu tiên new_parent, nếu không có mới dùng team
        if not new_parent or not new_parent.strip():
            if team:
                team_home_folder = get_home_folder(team)
                if team_home_folder:
                    new_parent = team_home_folder.name
                else:
                    frappe.throw(f"Cannot find home folder for team {team}")
            else:
                new_parent = get_home_folder(source_doc.team).name
        else:
            if team:
                new_parent_team = frappe.db.get_value("Drive File", new_parent, "team")
                if new_parent_team != team:
                    print(
                        f"Warning: new_parent team ({new_parent_team}) != provided team ({team})"
                    )

        # Kiểm tra new_parent có tồn tại không
        if not frappe.db.exists("Drive File", new_parent):
            frappe.throw(_("Thư mục đích không tồn tại"))

        # Kiểm tra new_parent có phải là folder không
        is_group = frappe.db.get_value("Drive File", new_parent, "is_group")
        if not is_group:
            frappe.throw(_("Đích phải là một thư mục"))

        # Lấy team của thư mục đích
        new_parent_team = frappe.db.get_value("Drive File", new_parent, "team")
        will_change_team = source_doc.team != new_parent_team

        # Hàm đệ quy để copy folder và tất cả nội dung bên trong
        def copy_recursive(source_name, dest_parent, dest_team):
            """Copy file/folder và tất cả con của nó"""
            import shutil
            from pathlib import Path
            import os
            import tempfile

            source = frappe.get_doc("Drive File", source_name)

            # Tạo bản copy
            copied = frappe.copy_doc(source)
            copied.parent_entity = dest_parent
            copied.team = dest_team
            copied.is_private = is_private

            # Tạo tên mới nếu trùng
            copied.title = (
                copied.title.strip() + " (Bản sao)"
                if " (Bản sao)" not in copied.title
                else copied.title
            )

            # Xóa permissions nếu chuyển team
            if will_change_team:
                copied.permissions = []

            # ===== COPY FILE VẬT LÝ =====
            if not source.is_group and not source.is_link:
                source_path = getattr(source, "path", None)

                if source_path:
                    # Insert trước để có ID
                    copied.insert(ignore_permissions=True)

                    # Tạo path mới
                    home_folder = get_home_folder(dest_team)
                    file_ext = Path(source_path).suffix
                    new_path_relative = f"{home_folder['name']}/{copied.name}{file_ext}"

                    manager = FileManager()
                    file_copied = False

                    # Get file from S3
                    try:
                        file_obj = manager.get_file(source_path)
                        file_content = file_obj.read()

                        # Create temporary file
                        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
                            tmp.write(file_content)
                            tmp_path = tmp.name

                        try:
                            # Upload via FileManager
                            manager.upload_file(tmp_path, new_path_relative, copied)

                            copied.path = new_path_relative
                            copied.save(ignore_permissions=True)
                            file_copied = True

                        finally:
                            # Clean up temp file
                            if os.path.exists(tmp_path):
                                os.unlink(tmp_path)

                    except Exception as e:
                        import traceback

                        copied.path = ""
                        copied.save(ignore_permissions=True)

                    # Copy thumbnail only if file was copied successfully
                    if file_copied:
                        try:
                            thumbnail_copied = False
                            thumbnail_content = None

                            # Try to get existing thumbnail
                            try:
                                thumbnail = manager.get_thumbnail(source.team, source_name)
                                thumbnail_content = thumbnail.read()

                                # Create temp file for thumbnail
                                with tempfile.NamedTemporaryFile(
                                    delete=False, suffix=".jpg"
                                ) as tmp_thumb:
                                    tmp_thumb.write(thumbnail_content)
                                    tmp_thumb_path = tmp_thumb.name

                                try:
                                    # Check if save_thumbnail method exists
                                    if hasattr(manager, "save_thumbnail"):
                                        # Try with file path
                                        manager.save_thumbnail(
                                            dest_team, copied.name, tmp_thumb_path
                                        )

                                        thumbnail_copied = True
                                    else:
                                        # Upload directly to S3 thumbnails path
                                        thumb_s3_path = f"thumbnails/{dest_team}/{copied.name}.jpg"

                                        # Use upload_file method
                                        manager.upload_file(tmp_thumb_path, thumb_s3_path, None)
                                        thumbnail_copied = True

                                finally:
                                    # Clean up temp thumbnail
                                    if os.path.exists(tmp_thumb_path):
                                        os.unlink(tmp_thumb_path)

                                # Cache thumbnail
                                if thumbnail_copied:
                                    frappe.cache().set_value(
                                        copied.name,
                                        BytesIO(thumbnail_content),
                                        expires_in_sec=60 * 60,
                                    )
                                    print(f"✓ Thumbnail cached")

                            except FileNotFoundError:
                                print(f"⚠ No existing thumbnail found")
                            except Exception as e:
                                print(f"⚠ Get existing thumbnail failed: {str(e)}")

                            # Generate thumbnail for images if not copied
                            if (
                                not thumbnail_copied
                                and source.mime_type
                                and source.mime_type.startswith("image/")
                            ):
                                try:
                                    from PIL import Image

                                    # Generate from file_content
                                    img = Image.open(BytesIO(file_content))
                                    thumbnail_size = (300, 300)
                                    img.thumbnail(thumbnail_size, Image.Resampling.LANCZOS)

                                    # Save to temp file
                                    with tempfile.NamedTemporaryFile(
                                        delete=False, suffix=".jpg"
                                    ) as tmp_thumb:
                                        img.save(tmp_thumb, format="JPEG", quality=85)
                                        tmp_thumb_path = tmp_thumb.name

                                    try:
                                        if hasattr(manager, "save_thumbnail"):
                                            manager.save_thumbnail(
                                                dest_team, copied.name, tmp_thumb_path
                                            )
                                        else:
                                            thumb_s3_path = (
                                                f"thumbnails/{dest_team}/{copied.name}.jpg"
                                            )
                                            manager.upload_file(
                                                tmp_thumb_path, thumb_s3_path, None
                                            )

                                        # Cache it
                                        with open(tmp_thumb_path, "rb") as f:
                                            thumb_content = f.read()
                                            frappe.cache().set_value(
                                                copied.name,
                                                BytesIO(thumb_content),
                                                expires_in_sec=60 * 60,
                                            )

                                    finally:
                                        if os.path.exists(tmp_thumb_path):
                                            os.unlink(tmp_thumb_path)

                                except ImportError:
                                    print(f"⚠ PIL not available for thumbnail generation")
                                except Exception as gen_error:
                                    print(f"⚠ Thumbnail generation failed: {str(gen_error)}")
                                    import traceback

                                    print(traceback.format_exc())

                        except Exception as thumb_error:
                            print(f"⚠ Thumbnail handling error: {str(thumb_error)}")
                            import traceback

                            print(traceback.format_exc())

                    return copied
                else:
                    print(f"✗ No path for {source.title}")
                    copied.insert(ignore_permissions=True)
                    return copied
            else:
                # Folder hoặc link
                copied.insert(ignore_permissions=True)

            print(f"\nCopied {source.title} -> {copied.name} in {dest_parent}")

            # Nếu là folder, copy tất cả file/folder con
            if source.is_group:
                children = frappe.get_all(
                    "Drive File", filters={"parent_entity": source_name}, fields=["name"]
                )

                for child in children:
                    copy_recursive(child.name, copied.name, dest_team)

            return copied

        # Thực hiện copy
        copy_recursive(entity_name, new_parent, new_parent_team)

        # Cập nhật file_size cho thư mục đích
        update_file_size(new_parent, source_doc.file_size)

        # Trả về thông tin thư mục đích
        result = frappe.get_value(
            "Drive File",
            new_parent,
            ["title", "team", "name", "is_private"],
            as_dict=True,
        )

        result["is_private"] = is_private
        return result

    except Exception as e:
        frappe.log_error(f"Copy error: {str(e)}", "copy_file_or_folder")
        frappe.throw(_("Lỗi khi sao chép: {0}").format(str(e)))


def copy_file(source, destination_parent, new_title):
    """Sao chép file"""
    # Tạo bản sao của Drive Entity
    new_file = frappe.copy_doc(source)
    new_file.title = new_title
    new_file.parent_entity = destination_parent
    new_file.name = None  # Để Frappe tự tạo name mới

    # Sao chép file vật lý nếu có
    if source.path:
        source_file_path = frappe.get_site_path() + source.path
        if os.path.exists(source_file_path):
            # Lấy extension từ file gốc
            file_extension = os.path.splitext(source.path)[1]

            # Tạo tên file mới duy nhất
            import time

            timestamp = str(int(time.time()))
            new_file_name = f"{frappe.scrub(new_title)}_{timestamp}{file_extension}"

            # Đường dẫn file mới
            files_path = get_files_path()
            new_file_path = os.path.join(files_path, new_file_name)

            # Sao chép file
            shutil.copy2(source_file_path, new_file_path)

            # Cập nhật file_url
            new_file.path = f"/files/{new_file_name}"

    new_file.save()
    return new_file.as_dict()


def copy_folder(source, destination_parent, new_title):
    """Sao chép folder và tất cả nội dung bên trong"""
    # Tạo folder mới
    new_folder = frappe.copy_doc(source)
    new_folder.title = new_title
    new_folder.parent_entity = destination_parent
    new_folder.name = None
    new_folder.save()

    # Lấy tất cả items trong folder gốc
    children = frappe.get_all(
        "Drive File", filters={"parent_entity": source.name}, fields=["name"]
    )

    # Sao chép từng item con
    for child in children:
        child_doc = frappe.get_doc("Drive File", child.name)
        child_new_title = child_doc.title

        if child_doc.is_group:
            copy_folder(child_doc, new_folder.name, child_new_title)
        else:
            copy_file(child_doc, new_folder.name, child_new_title)

    return new_folder.as_dict()
