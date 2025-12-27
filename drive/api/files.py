import os, re, json, mimetypes
import unicodedata
from frappe.utils import get_files_path
import frappe
from frappe import _
from pypika import Order, functions as fn
from .permissions import get_teams, get_user_access, user_has_permission
from pathlib import Path
from werkzeug.wrappers import Response
from werkzeug.utils import secure_filename, send_file
from io import BytesIO
import mimemapper
import jwt
import boto3
import requests
import shutil
from drive.api.activity import create_new_entity_activity_log
import time
from boto3.s3.transfer import TransferConfig
from pathlib import Path
from io import BytesIO

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


# Hàm helper để copy permissions
def copy_permissions_to_entity(entity_name, permissions_list):
    """Copy permissions to a specific entity"""
    for perm in permissions_list:
        # Kiểm tra xem permission đã tồn tại chưa
        existing = frappe.db.exists(
            "Drive Permission", {"entity": entity_name, "user": perm["user"]}
        )

        if not existing:
            permission = frappe.get_doc(
                {
                    "doctype": "Drive Permission",
                    "entity": entity_name,
                    "user": perm["user"],
                    "read": perm["read"],
                    "write": perm["write"],
                    "comment": perm["comment"],
                    "share": perm["share"],
                    "valid_until": perm["valid_until"],
                }
            )
            permission.insert()


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
    origin_parent = parent
    home_folder = get_home_folder(team)
    parent = parent or home_folder["name"]
    is_private = personal or frappe.get_value("Drive File", parent, "is_private")
    embed = int(embed)

    # Lưu danh sách các folder được tạo để copy permissions sau
    created_folders = []

    if fullpath:
        dirname = os.path.dirname(fullpath).split("/")
        for i in dirname:
            new_parent = if_folder_exists(team, i, parent, is_private)
            # Lưu lại folder vừa tạo (nếu nó khác parent hiện tại)
            if new_parent != parent:
                created_folders.append(new_parent)
            parent = new_parent

    # if not frappe.has_permission(
    #     doctype="Drive File", doc=parent, ptype="write", user=frappe.session.user
    # ):
    #     frappe.throw("Ask the folder owner for upload access.", frappe.PermissionError)

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

    # Lấy permissions từ origin_parent
    origin_parent_permission = frappe.get_all(
        "Drive Permission",
        filters={"entity": origin_parent},
        fields=["user", "read", "write", "comment", "share", "valid_until"],
    )

    # Copy permissions cho tất cả folders trung gian được tạo
    for folder_name in created_folders:
        copy_permissions_to_entity(folder_name, origin_parent_permission)

    # Copy permissions cho file cuối cùng
    copy_permissions_to_entity(drive_file.name, origin_parent_permission)

    create_new_entity_activity_log(entity=drive_file.name, action_type="create")

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
    origin_parent = parent
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
        mind_map=None,
    )
    if origin_parent:
        get_permissions = frappe.get_all(
            "Drive Permission",
            {"entity": origin_parent},
            ["user", "read", "share", "write", "comment", "valid_until"],
        )
        copy_permissions_to_entity(entity.name, get_permissions)

    create_new_entity_activity_log(entity=entity.name, action_type="create")
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
    team,
    personal,
    title,
    parent,
    file_size,
    mime_type,
    last_modified,
    entity_path,
    document=None,
    mind_map=None,
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
            "document": document if document else "",
            "mindmap": mind_map if mind_map else "",
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
    origin_parent = parent
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

    if origin_parent:
        get_permissions = frappe.get_all(
            "Drive Permission",
            {"entity": origin_parent},
            ["user", "read", "share", "write", "comment", "valid_until"],
        )
        print(f"Copying permissions from {get_permissions}")
        copy_permissions_to_entity(drive_file.name, get_permissions)
    response = drive_file.as_dict()
    response["file_type"] = "Folder"  # Đảm bảo file_type được set


    frappe.publish_realtime(
        event="upload_file_realtime",
        message={
            "status": "success",
            "name": "hello ?????"
        },
        user=frappe.session.user,
        after_commit=True,
    )

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

    create_new_entity_activity_log(entity_name, "edit")
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
        file_path = manager.get_file(drive_file.path)

        # ✅ FIX: Add X-Accel-Redirect for nginx to serve file directly
        # This sends response headers immediately, triggering "Save As" dialog
        # while nginx serves the file from disk efficiently
        if trigger_download:
            response = send_file(
                file_path,
                mimetype=drive_file.mime_type or "application/octet-stream",
                as_attachment=True,
                download_name=drive_file.title,
                environ=frappe.request.environ,
            )

            # Add header to tell nginx to serve file efficiently
            response.headers["X-Accel-Buffering"] = "no"
            response.headers["X-Content-Type-Options"] = "nosniff"

            print(f"✅ Download triggered: {drive_file.title}")
            return response
        else:
            return send_file(
                file_path,
                mimetype=drive_file.mime_type,
                as_attachment=False,
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
    Delete entities with BULK SQL - MUCH FASTER
    """
    current_user = frappe.session.user

    # Parse input
    if clear_all:
        entity_names = get_all_trash_items(current_user)
    elif isinstance(entity_names, str):
        entity_names = json.loads(entity_names)
    elif not isinstance(entity_names, list) or not entity_names:
        frappe.throw(_("Expected non-empty list"), ValueError)

    normalized = normalize_entities(entity_names)

    return delete_entities_sync(normalized, current_user)


def delete_entities_sync(entity_names, current_user):
    """Synchronous deletion with BULK operations"""
    success_files = []
    failed_files = []

    # Separate shortcuts and files
    shortcuts = [e for e in entity_names if e.get("is_shortcut")]
    files = [e for e in entity_names if not e.get("is_shortcut")]

    # Process shortcuts
    if shortcuts:
        s, f = delete_shortcuts_bulk(shortcuts, current_user)
        success_files.extend(s)
        failed_files.extend(f)

    # Process files with BULK delete
    if files:
        s, f = delete_files_bulk(files, current_user)
        success_files.extend(s)
        failed_files.extend(f)

    frappe.db.commit()

    return format_delete_response(success_files, failed_files)


def delete_files_bulk(files, user):
    """Delete files using BULK SQL - SUPER FAST"""
    success = []
    failed = []

    file_names = [f["entity"] for f in files]
    if not file_names:
        return success, failed

    # STEP 1: Get and validate files
    DriveFile = frappe.qb.DocType("Drive File")

    files_data = (
        frappe.qb.from_(DriveFile)
        .select(
            DriveFile.name,
            DriveFile.title,
            DriveFile.is_group,
            DriveFile.is_active,
            DriveFile.modified_by,
        )
        .where(DriveFile.name.isin(file_names))
        .run(as_dict=True)
    )

    # Validate permissions
    valid_files = {}
    for file in files_data:
        if file["is_active"] != 0:
            failed.append(f"{file['title']} (không trong thùng rác)")
            continue
        if file["modified_by"] != user:
            failed.append(f"{file['title']} (không có quyền)")
            continue
        valid_files[file["name"]] = file

    # Mark non-existent
    for name in file_names:
        if name not in {f["name"] for f in files_data}:
            failed.append(f"{name} (không tồn tại)")

    if not valid_files:
        return success, failed

    # STEP 2: Collect ALL files to delete (including descendants)
    all_files_to_delete = set()
    folders = [name for name, meta in valid_files.items() if meta["is_group"]]
    regular_files = [name for name, meta in valid_files.items() if not meta["is_group"]]

    # Add regular files
    all_files_to_delete.update(regular_files)

    # For each folder, get ALL descendants at once
    for folder_name in folders:
        descendants = get_all_descendants_recursive(folder_name)
        all_files_to_delete.add(folder_name)  # Add folder itself
        all_files_to_delete.update(descendants)

    if not all_files_to_delete:
        return success, failed

    # STEP 3: BULK DELETE with single SQL query
    try:
        deleted_count = bulk_delete_files(list(all_files_to_delete))
        success.extend(list(all_files_to_delete))

        frappe.msgprint(f"Đã xóa {deleted_count} files/folders")

    except Exception as e:
        error_msg = str(e)[:100]
        frappe.log_error(f"Bulk delete failed: {error_msg}", "Bulk Delete")
        failed.extend(list(all_files_to_delete))

    return success, failed


def get_all_descendants_recursive(parent_name, max_depth=50):
    """
    Get ALL descendants in one recursive query - VERY FAST
    Uses MySQL recursive CTE (Common Table Expression)
    """
    try:
        # Use recursive query to get all descendants at once
        result = frappe.db.sql(
            """
            WITH RECURSIVE descendants AS (
                -- Base case: direct children
                SELECT name, parent_entity, is_group
                FROM `tabDrive File`
                WHERE parent_entity = %(parent)s
                
                UNION ALL
                
                -- Recursive case: children of children
                SELECT f.name, f.parent_entity, f.is_group
                FROM `tabDrive File` f
                INNER JOIN descendants d ON f.parent_entity = d.name
                WHERE d.is_group = 1
            )
            SELECT name FROM descendants
        """,
            {"parent": parent_name},
            as_list=True,
        )

        return [row[0] for row in result]

    except Exception as e:
        # Fallback to iterative approach if recursive CTE not supported
        return get_all_descendants_iterative(parent_name, max_depth)


def get_all_descendants_iterative(parent_name, max_depth=50):
    """Fallback: Get descendants iteratively"""
    all_descendants = []
    current_level = [parent_name]
    level = 0

    while current_level and level < max_depth:
        # Get all children in one query
        children = frappe.db.sql(
            """
            SELECT name, is_group
            FROM `tabDrive File`
            WHERE parent_entity IN %(parents)s
        """,
            {"parents": current_level},
            as_dict=True,
        )

        if not children:
            break

        child_names = [c["name"] for c in children]
        all_descendants.extend(child_names)

        # Next level: only folders
        current_level = [c["name"] for c in children if c["is_group"]]
        level += 1

    return all_descendants


def bulk_delete_files(file_names, batch_size=500):
    """
    BULK DELETE files using raw SQL - SUPER FAST
    Deletes in batches to avoid too large queries
    """
    if not file_names:
        return 0

    total_deleted = 0

    # Delete in batches
    for i in range(0, len(file_names), batch_size):
        batch = file_names[i : i + batch_size]

        try:
            # Delete from Drive File table
            frappe.db.sql(
                """
                DELETE FROM `tabDrive File`
                WHERE name IN %(names)s
            """,
                {"names": batch},
            )

            # Delete from Drive Entity table (if exists)
            frappe.db.sql(
                """
                DELETE FROM `tabDrive Entity`
                WHERE name IN %(names)s
            """,
                {"names": batch},
                ignore_ddl=True,
            )

            # Delete related permissions
            frappe.db.sql(
                """
                DELETE FROM `tabDrive DocShare`
                WHERE share_name IN %(names)s
            """,
                {"names": batch},
                ignore_ddl=True,
            )

            total_deleted += len(batch)

            # Commit after each batch
            frappe.db.commit()

        except Exception as e:
            frappe.log_error(f"Bulk delete batch failed: {str(e)[:100]}", "Bulk Delete Batch")
            # Continue with next batch even if this one fails

    return total_deleted


def delete_shortcuts_bulk(shortcuts, user):
    """Delete shortcuts using BULK UPDATE"""
    success = []
    failed = []

    shortcut_names = [s["entity"] for s in shortcuts]
    if not shortcut_names:
        return success, failed

    # Validate shortcuts
    DriveShortcut = frappe.qb.DocType("Drive Shortcut")

    valid_shortcuts = (
        frappe.qb.from_(DriveShortcut)
        .select(DriveShortcut.name, DriveShortcut.title)
        .where(
            (DriveShortcut.name.isin(shortcut_names))
            & (DriveShortcut.shortcut_owner == user)
            & (DriveShortcut.is_active == 0)
        )
        .run(as_dict=True)
    )

    valid_names = {s["name"] for s in valid_shortcuts}
    shortcut_titles = {s["name"]: s["title"] for s in valid_shortcuts}

    for name in shortcut_names:
        if name not in valid_names:
            display = shortcut_titles.get(name, name)
            failed.append(f"{display} (không có quyền)")

    if valid_names:
        try:
            # BULK soft delete
            frappe.db.sql(
                """
                UPDATE `tabDrive Shortcut`
                SET is_active = -1
                WHERE name IN %(names)s
            """,
                {"names": list(valid_names)},
            )

            success.extend(list(valid_names))

        except Exception as e:
            frappe.log_error(f"Bulk delete shortcuts: {str(e)[:50]}", "Delete Shortcuts")
            failed.extend(list(valid_names))

    return success, failed


# ===== HELPER FUNCTIONS =====


def get_all_trash_items(user):
    """Get all files and shortcuts in trash"""
    files = frappe.db.get_all(
        "Drive File", filters={"is_active": 0, "modified_by": user}, pluck="name"
    )

    shortcuts = frappe.db.get_all(
        "Drive Shortcut", filters={"is_active": 0, "shortcut_owner": user}, pluck="name"
    )

    result = [{"entity": f, "is_shortcut": False} for f in files]
    result.extend([{"entity": s, "is_shortcut": True} for s in shortcuts])

    return result


def normalize_entities(entity_names):
    """Convert mixed input to standard format"""
    normalized = []
    for entity in entity_names:
        if isinstance(entity, dict):
            normalized.append(
                {
                    "entity": entity.get("entity") or entity.get("name"),
                    "is_shortcut": entity.get("is_shortcut", False),
                }
            )
        else:
            normalized.append({"entity": entity, "is_shortcut": False})
    return normalized


def format_delete_response(success_files, failed_files):
    """Format user-friendly response"""
    result = {
        "success": len(success_files) > 0,
        "success_count": len(success_files),
        "failed_count": len(failed_files),
        "success_files": success_files,
        "failed_files": failed_files,
    }

    if failed_files:
        if success_files:
            failed_display = ", ".join(failed_files[:3])
            if len(failed_files) > 3:
                failed_display += f" và {len(failed_files) - 3} mục khác"

            result["message"] = (
                f"Đã xóa {len(success_files)} mục. "
                f"{len(failed_files)} mục thất bại: {failed_display}"
            )
        else:
            result["success"] = False
            failed_display = ", ".join(failed_files[:2])
            if len(failed_files) > 2:
                failed_display += f" và {len(failed_files) - 2} mục khác"

            result["message"] = f"Không thể xóa: {failed_display}"
    else:
        result["message"] = f"Đã xóa vĩnh viễn {len(success_files)} mục thành công"

    return result


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
        # Check if this is a shortcut entity - use .get() to avoid KeyError
        is_shortcut = entity.get("is_shortcut", False) or bool(entity.get("shortcut_name"))

        if is_shortcut:
            shortcut_name = entity.get("shortcut_name")
            if not shortcut_name:
                frappe.throw("Shortcut entity missing shortcut_name", ValueError)

            # For shortcut files, check existing favourite by entity_shortcut
            existing_doc = frappe.db.exists(
                {
                    "doctype": "Drive Favourite",
                    "entity_shortcut": shortcut_name,
                    "user": frappe.session.user,
                }
            )

            # Set default favourite status if not provided
            if "is_favourite" not in entity:
                entity["is_favourite"] = not existing_doc

            # Ensure is_favourite is boolean
            if not isinstance(entity["is_favourite"], bool):
                entity["is_favourite"] = (
                    json.loads(entity["is_favourite"])
                    if isinstance(entity["is_favourite"], str)
                    else bool(entity["is_favourite"])
                )

            # Handle favourite/unfavourite logic for shortcuts
            if not entity["is_favourite"] and existing_doc:
                # Remove from favourites
                frappe.delete_doc("Drive Favourite", existing_doc)
            elif entity["is_favourite"] and not existing_doc:
                # Add to favourites
                frappe.get_doc(
                    {
                        "doctype": "Drive Favourite",
                        "entity_shortcut": shortcut_name,
                        "user": frappe.session.user,
                    }
                ).insert()

        else:
            # For regular files, use entity field as before
            entity_name = entity.get("name")
            if not entity_name:
                frappe.throw("Entity missing name field", ValueError)

            existing_doc = frappe.db.exists(
                {
                    "doctype": "Drive Favourite",
                    "entity": entity_name,
                    "user": frappe.session.user,
                }
            )

            # Set default favourite status if not provided
            if "is_favourite" not in entity:
                entity["is_favourite"] = not existing_doc

            # Ensure is_favourite is boolean
            if not isinstance(entity["is_favourite"], bool):
                entity["is_favourite"] = (
                    json.loads(entity["is_favourite"])
                    if isinstance(entity["is_favourite"], str)
                    else bool(entity["is_favourite"])
                )

            # Handle favourite/unfavourite logic for regular files
            if not entity["is_favourite"] and existing_doc:
                # Remove from favourites
                frappe.delete_doc("Drive Favourite", existing_doc)
            elif entity["is_favourite"] and not existing_doc:
                # Add to favourites
                frappe.get_doc(
                    {
                        "doctype": "Drive Favourite",
                        "entity": entity_name,
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

    success_files = []  # Danh sách file xử lý thành công
    failed_files = []  # Danh sách file không có quyền
    is_restore_operation = False  # Flag để track operation type

    # ✅ Hàm đệ quy để lấy tất cả children
    def get_all_children(entity_name):
        """
        Lấy tất cả children (files và folders) của một entity
        Returns: list of entity names
        """
        children = frappe.db.get_all(
            "Drive File", filters={"parent_entity": entity_name}, pluck="name"
        )

        all_descendants = list(children)  # Copy list

        # Đệ quy lấy children của children
        for child in children:
            all_descendants.extend(get_all_children(child))

        return all_descendants

    # ✅ Hàm toggle is_active cho một entity và tất cả children của nó
    def toggle_entity_and_children(doc, flag):
        """
        Toggle is_active cho entity và tất cả children
        :param doc: Drive File document
        :param flag: 0 (move to trash) hoặc 1 (restore)
        """
        nonlocal is_restore_operation
        is_restore_operation = flag == 1

        # Xử lý entity hiện tại
        if flag == 0:  # Move to trash
            # Thêm vào global trash
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
                        "path": doc.path,
                        "trashed_on": frappe.utils.now(),
                    }
                ).insert()
        else:  # Restore
            # Check storage limit
            storage_data_limit = storage_data["limit"] * 1024 * 1024
            if (storage_data_limit - storage_data["total_size"]) < doc.file_size:
                frappe.throw("You're out of storage!", ValueError)

            # Xóa khỏi global trash
            existing_trash = frappe.db.exists(
                {"doctype": "Drive Trash", "entity": doc.name, "user": frappe.session.user}
            )
            if existing_trash:
                frappe.delete_doc("Drive Trash", existing_trash)

        # Update is_active
        doc.is_active = flag

        # Update parent folder size
        if doc.parent_entity:
            folder_size = frappe.db.get_value("Drive File", doc.parent_entity, "file_size")
            if folder_size is not None:
                frappe.db.set_value(
                    "Drive File",
                    doc.parent_entity,
                    "file_size",
                    folder_size + doc.file_size * (1 if flag else -1),
                )

        # ✅ FIX: Dùng ignore_permissions khi restore vì user có thể không có write permission
        # nhưng vẫn có quyền restore file của mình
        if flag == 1:  # Restore operation
            doc.save(ignore_permissions=True)
        else:
            doc.save()

        # ✅ Nếu là folder, xử lý tất cả children
        if doc.is_group:
            all_children = get_all_children(doc.name)

            for child_name in all_children:
                try:
                    child_doc = frappe.get_doc("Drive File", child_name)

                    # Toggle is_active cho child
                    if flag == 0:  # Move to trash
                        # Thêm child vào trash
                        existing_trash = frappe.db.exists(
                            {
                                "doctype": "Drive Trash",
                                "entity": child_doc.name,
                                "user": frappe.session.user,
                            }
                        )
                        if not existing_trash:
                            frappe.get_doc(
                                {
                                    "doctype": "Drive Trash",
                                    "entity": child_doc.name,
                                    "user": frappe.session.user,
                                    "team": child_doc.team,
                                    "path": child_doc.path,
                                    "trashed_on": frappe.utils.now(),
                                }
                            ).insert()
                    else:  # Restore
                        # Xóa child khỏi trash
                        existing_trash = frappe.db.exists(
                            {
                                "doctype": "Drive Trash",
                                "entity": child_doc.name,
                                "user": frappe.session.user,
                            }
                        )
                        if existing_trash:
                            frappe.delete_doc("Drive Trash", existing_trash)

                    child_doc.is_active = flag

                    # ✅ FIX: Dùng ignore_permissions cho children khi restore
                    # ✅ FIX: Không update modified để giữ timestamp cũ (quan trọng cho trash logic)
                    if flag == 1:
                        child_doc.save(ignore_permissions=True)
                    else:
                        # Khi xóa children (cascade), KHÔNG update modified
                        # Để giữ timestamp cũ hơn parent → logic trash phân biệt được
                        frappe.db.set_value(
                            "Drive File",
                            child_doc.name,
                            "is_active",
                            flag,
                            update_modified=False,  # ← Quan trọng!
                        )

                except Exception as e:
                    frappe.log_error(f"Error processing child {child_name}: {str(e)}")
                    continue

    # Process files
    if entity_names:
        if isinstance(entity_names, str):
            entity_names = json.loads(entity_names)
        if not isinstance(entity_names, list):
            frappe.throw(f"Expected list but got {type(entity_names)}", ValueError)

        for entity in entity_names:
            try:
                doc = frappe.get_doc("Drive File", entity)

                # Xác định flag dựa trên trạng thái hiện tại
                flag = 0 if doc.is_active else 1

                # ✅ FIX: Check permission phù hợp với operation
                # - Delete (flag=0): cần write permission
                # - Restore (flag=1): chỉ cần là owner hoặc modified_by
                has_permission = False

                if flag == 0:  # Delete operation
                    has_permission = user_has_permission(doc, "write", frappe.session.user)
                else:  # Restore operation
                    # User có thể restore nếu họ là người xóa (modified_by) hoặc owner
                    has_permission = (
                        doc.modified_by == frappe.session.user
                        or doc.owner == frappe.session.user
                        or user_has_permission(doc, "write", frappe.session.user)
                    )

                if has_permission:
                    # Toggle entity và tất cả children
                    toggle_entity_and_children(doc, flag)
                    success_files.append(doc.name)
                else:
                    failed_files.append(doc.title.strip()[:30])

            except Exception as e:
                frappe.log_error(f"Error processing entity {entity}: {str(e)}")
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
                            "path": f"Shortcut: {shortcut_doc.name}",
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
                failed_files.append(
                    shortcut.shortcut_name if isinstance(shortcut, dict) else shortcut
                )
                continue
            except Exception as e:
                frappe.log_error(f"Error processing shortcut {shortcut}: {str(e)}")
                failed_files.append(
                    shortcut.shortcut_name if isinstance(shortcut, dict) else shortcut
                )
                continue

    frappe.db.commit()

    # ✅ FIX: Trả về message phù hợp với operation
    result = {
        "success": len(success_files) > 0,
        "message": "",
        "success_files": success_files,
        "failed_files": failed_files,
    }

    # Determine operation name for messages
    operation_name = "khôi phục" if is_restore_operation else "xóa"
    operation_name_past = "khôi phục" if is_restore_operation else "xóa"

    if len(failed_files) > 0:
        # Nếu có file thất bại
        if len(success_files) > 0:
            # Có cả file thành công và thất bại
            result["message"] = (
                f"Đã {operation_name_past} {len(success_files)} file thành công. "
                f"{len(failed_files)} file không có quyền {operation_name}: {', '.join(failed_files)}"
            )
        else:
            # Tất cả đều thất bại
            result["message"] = (
                f"Không có quyền {operation_name} các file: {', '.join(failed_files)}"
            )
    else:
        # Tất cả thành công
        result["message"] = f"Đã {operation_name_past} {len(success_files)} file thành công"

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
    from botocore.client import Config

    # Lấy settings từ Drive S3 Settings
    settings = frappe.get_doc("Drive S3 Settings")

    s3 = boto3.client(
        "s3",
        aws_access_key_id=settings.aws_key,
        aws_secret_access_key=settings.get_password("aws_secret"),
        endpoint_url=settings.endpoint_url,  # THÊM
        config=Config(
            signature_version=settings.signature_version or "s3",  # THÊM
            s3={"addressing_style": "path"},  # THÊM
        ),
    )
    bucket_name = settings.bucket  # SỬA từ frappe.conf.s3_bucket

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


import base64
import unicodedata


def sanitize_s3_metadata(text):
    """
    Sanitize text for S3 metadata - chỉ giữ ký tự ASCII

    :param text: Text cần sanitize
    :return: ASCII-safe text
    """
    if not text:
        return ""

    try:
        # Method 1: Encode to base64 (giữ nguyên toàn bộ thông tin)
        encoded = base64.b64encode(text.encode("utf-8")).decode("ascii")
        return encoded
    except:
        # Method 2: Fallback - remove non-ASCII characters
        return "".join(char for char in text if ord(char) < 128)


def decode_s3_metadata(encoded_text):
    """
    Decode S3 metadata từ base64

    :param encoded_text: Base64 encoded text
    :return: Original text
    """
    if not encoded_text:
        return ""

    try:
        decoded = base64.b64decode(encoded_text).decode("utf-8")
        return decoded
    except:
        # Nếu không phải base64, trả về nguyên bản
        return encoded_text


@frappe.whitelist()
def copy_file_or_folder(entity_name, is_private, new_parent=None, team=None):
    """
    Copy file or folder - FIXED S3 metadata Unicode error
    """
    try:
        # Validate
        if not frappe.db.exists("Drive File", entity_name):
            frappe.throw(_("File hoặc thư mục không tồn tại"))

        source_doc = frappe.get_doc("Drive File", entity_name)

        if source_doc.is_active == 0:
            frappe.throw(_("File hoặc thư mục đã bị xóa"))

        # Determine destination
        if not new_parent or not new_parent.strip():
            if team:
                team_home_folder = get_home_folder(team)
                if team_home_folder:
                    new_parent = team_home_folder.name
                else:
                    frappe.throw(f"Cannot find home folder for team {team}")
            else:
                new_parent = get_home_folder(source_doc.team).name

        if not frappe.db.exists("Drive File", new_parent):
            frappe.throw(_("Thư mục đích không tồn tại"))

        is_group = frappe.db.get_value("Drive File", new_parent, "is_group")
        if not is_group:
            frappe.throw(_("Đích phải là một thư mục"))

        new_parent_team = frappe.db.get_value("Drive File", new_parent, "team")
        will_change_team = source_doc.team != new_parent_team

        # ===== ALWAYS BACKGROUND FOR FILES > 500KB =====
        total_items = count_items_recursive(entity_name)

        # Run background job for: folders OR files > 500KB
        if total_items > 1 or (not source_doc.is_group and source_doc.file_size > 500 * 1024):
            frappe.enqueue(
                "drive.api.files.copy_file_or_folder_background",
                queue="long",
                timeout=7200,
                entity_name=entity_name,
                new_parent=new_parent,
                new_parent_team=new_parent_team,
                is_private=is_private,
                will_change_team=will_change_team,
                user=frappe.session.user,
            )

            return {
                "status": "queued",
                "message": _("Đang sao chép. Bạn sẽ nhận được thông báo khi hoàn tất."),
                "total_items": total_items,
            }

        # Sync copy for small files only
        def copy_recursive(source_name, dest_parent, dest_team):
            source = frappe.get_doc("Drive File", source_name)
            copied = frappe.copy_doc(source)
            copied.parent_entity = dest_parent
            copied.team = dest_team
            copied.is_private = is_private
            copied.title = (
                copied.title.strip() + " (Bản sao)"
                if "(Bản sao)" not in copied.title
                else copied.title
            )

            if will_change_team:
                copied.permissions = []

            # ===== FILE COPY =====
            if not source.is_group and not source.is_link:
                source_path = getattr(source, "path", None)

                if source_path:
                    # Insert BEFORE copy to get ID
                    copied.insert(ignore_permissions=True)

                    print(f"📁 Copy: {source.title}")
                    print(f"  Source: {source_path}")
                    print(f"  Size: {source.file_size} bytes")
                    print(f"  MIME: {source.mime_type}")

                    home_folder = get_home_folder(dest_team)
                    file_ext = Path(source_path).suffix
                    new_path_relative = f"{home_folder['name']}/{copied.name}{file_ext}"

                    print(f"  Destination: {new_path_relative}")

                    manager = FileManager()

                    try:
                        if not manager.s3_enabled:
                            frappe.throw("S3 is not enabled")

                        # ✅ FIX: Sanitize metadata để tránh lỗi Unicode
                        safe_metadata = {
                            "original-name": sanitize_s3_metadata(source.title),
                            "file-size": str(source.file_size),
                        }

                        # ✅ METHOD 1: S3 Native Copy (FASTEST)
                        try:
                            print(f"🚀 S3 native copy...")

                            manager.conn.copy_object(
                                CopySource={"Bucket": manager.bucket, "Key": source_path},
                                Bucket=manager.bucket,
                                Key=new_path_relative,
                                ContentType=source.mime_type,
                                MetadataDirective="REPLACE",
                                Metadata=safe_metadata,  # ← FIXED
                            )

                            print(f"✅ S3 copy success!")

                        except Exception as copy_err:
                            # ✅ METHOD 2: Fallback download + upload
                            print(f"⚠ S3 copy failed: {str(copy_err)}")
                            print(f"🔄 Fallback: download + upload...")

                            # Download
                            file_obj = manager.get_file(source_path)
                            file_content = file_obj.read()

                            print(f"✓ Downloaded {len(file_content)} bytes")

                            # Upload
                            file_buffer = BytesIO(file_content)

                            manager.conn.put_object(
                                Bucket=manager.bucket,
                                Key=new_path_relative,
                                Body=file_buffer,
                                ContentType=source.mime_type,
                                ContentLength=source.file_size,
                                Metadata=safe_metadata,  # ← FIXED
                            )

                            print(f"✅ Upload success!")

                        # ✅ Update metadata AFTER successful copy
                        copied.file_size = source.file_size
                        copied.mime_type = source.mime_type
                        copied.path = new_path_relative

                        copied.flags.ignore_permissions = True
                        copied.save(ignore_permissions=True)
                        frappe.db.commit()  # ✅ CRITICAL: Force commit

                        print(f"✅ Saved: {copied.name}")

                        # Verify in DB
                        db_verify = frappe.db.get_value(
                            "Drive File",
                            copied.name,
                            ["path", "file_size", "mime_type"],
                            as_dict=True,
                        )
                        print(f"✓ DB verify: {db_verify}")

                        # Copy thumbnail async (non-blocking)
                        if manager.can_create_thumbnail(source):
                            frappe.enqueue(
                                "drive.api.files.copy_thumbnail_background",
                                queue="short",
                                timeout=300,
                                source_team=source.team,
                                source_name=source_name,
                                dest_team=dest_team,
                                dest_name=copied.name,
                            )

                        return copied

                    except Exception as e:
                        error_msg = f"Copy failed: {str(e)}"
                        print(f"❌ {error_msg}")
                        frappe.log_error(error_msg, "copy_file_error")

                        # Mark as failed
                        copied.path = ""
                        copied.file_size = 0
                        copied.save(ignore_permissions=True)

                        frappe.throw(error_msg)

                else:
                    # No path
                    copied.insert(ignore_permissions=True)
                    return copied
            else:
                # Folder or link
                copied.insert(ignore_permissions=True)

            # Copy children
            if source.is_group:
                children = frappe.get_all(
                    "Drive File",
                    filters={"parent_entity": source_name, "is_active": 1},
                    fields=["name"],
                )

                for child in children:
                    copy_recursive(child.name, copied.name, dest_team)

            return copied

        # Execute copy
        result_doc = copy_recursive(entity_name, new_parent, new_parent_team)

        return {
            "status": "success",
            "name": result_doc.name,
            "title": result_doc.title,
            "parent": new_parent,
            "path": result_doc.path,
            "file_size": result_doc.file_size,
        }

    except Exception as e:
        frappe.log_error(f"Copy error: {str(e)}", "copy_file_or_folder")
        frappe.throw(_("Lỗi khi sao chép: {0}").format(str(e)))


def copy_file_or_folder_background(
    entity_name, new_parent, new_parent_team, is_private, will_change_team, user
):
    """Background job for large files/folders"""
    frappe.set_user(user)

    try:

        def copy_recursive_bg(source_name, dest_parent, dest_team):
            source = frappe.get_doc("Drive File", source_name)
            copied = frappe.copy_doc(source)
            copied.parent_entity = dest_parent
            copied.team = dest_team
            copied.is_private = is_private
            copied.title = (
                copied.title.strip() + " (Bản sao)"
                if "(Bản sao)" not in copied.title
                else copied.title
            )

            if will_change_team:
                copied.permissions = []

            if not source.is_group and not source.is_link:
                source_path = getattr(source, "path", None)

                if source_path:
                    copied.insert(ignore_permissions=True)

                    home_folder = get_home_folder(dest_team)
                    file_ext = Path(source_path).suffix
                    new_path_relative = f"{home_folder['name']}/{copied.name}{file_ext}"

                    manager = FileManager()

                    try:
                        if not manager.s3_enabled:
                            frappe.throw("S3 is not enabled")

                        # ✅ FIX: Sanitize metadata
                        safe_metadata = {
                            "original-name": sanitize_s3_metadata(source.title),
                            "file-size": str(source.file_size),
                        }

                        # Try S3 copy first
                        try:
                            manager.conn.copy_object(
                                CopySource={"Bucket": manager.bucket, "Key": source_path},
                                Bucket=manager.bucket,
                                Key=new_path_relative,
                                ContentType=source.mime_type,
                                MetadataDirective="REPLACE",
                                Metadata=safe_metadata,  # ← FIXED
                            )
                        except Exception:
                            # Fallback
                            file_obj = manager.get_file(source_path)
                            file_content = file_obj.read()
                            file_buffer = BytesIO(file_content)

                            manager.conn.put_object(
                                Bucket=manager.bucket,
                                Key=new_path_relative,
                                Body=file_buffer,
                                ContentType=source.mime_type,
                                ContentLength=source.file_size,
                                Metadata=safe_metadata,  # ← FIXED
                            )

                        # Save metadata
                        copied.file_size = source.file_size
                        copied.mime_type = source.mime_type
                        copied.path = new_path_relative
                        copied.save(ignore_permissions=True)
                        frappe.db.commit()

                        # Thumbnail
                        if manager.can_create_thumbnail(source):
                            frappe.enqueue(
                                "drive.api.files.copy_thumbnail_background",
                                queue="short",
                                timeout=300,
                                source_team=source.team,
                                source_name=source_name,
                                dest_team=dest_team,
                                dest_name=copied.name,
                            )

                    except Exception as e:
                        frappe.log_error(f"BG copy failed: {str(e)}", "copy_bg_error")
                        copied.path = ""
                        copied.file_size = 0
                        copied.save(ignore_permissions=True)

                    return copied
                else:
                    copied.insert(ignore_permissions=True)
                    return copied
            else:
                copied.insert(ignore_permissions=True)

            if source.is_group:
                children = frappe.get_all(
                    "Drive File",
                    filters={"parent_entity": source_name, "is_active": 1},
                    fields=["name"],
                )

                for child in children:
                    copy_recursive_bg(child.name, copied.name, dest_team)

            return copied

        result_doc = copy_recursive_bg(entity_name, new_parent, new_parent_team)

        # Notify user
        frappe.publish_realtime(
            event="copy_completed",
            message={
                "status": "success",
                "name": result_doc.name,
                "title": result_doc.title,
                "path": result_doc.path,
            },
            user=user,
        )

    except Exception as e:
        frappe.log_error(f"Background copy error: {str(e)}", "copy_background")
        frappe.publish_realtime(
            event="copy_failed", message={"status": "error", "error": str(e)}, user=user
        )


def count_items_recursive(entity_name):
    """Count total items to copy"""
    source = frappe.get_doc("Drive File", entity_name)

    if not source.is_group:
        return 1

    count = 1
    children = frappe.get_all(
        "Drive File",
        filters={"parent_entity": entity_name, "is_active": 1},
        fields=["name", "is_group"],
    )

    for child in children:
        if child.is_group:
            count += count_items_recursive(child.name)
        else:
            count += 1

    return count


@frappe.whitelist()
def get_folder_children(entity_name):
    """
    Lấy tất cả children của một folder (dùng cho download)
    Đơn giản hơn API files() - chỉ check permission trên parent folder
    """

    # Kiểm tra folder tồn tại
    if not frappe.db.exists("Drive File", entity_name):
        frappe.throw(f"Folder {entity_name} không tồn tại")

    parent_doc = frappe.get_doc("Drive File", entity_name)

    # Kiểm tra quyền read trên parent folder
    user = frappe.session.user if frappe.session.user != "Guest" else ""
    user_access = get_user_access(parent_doc, user)

    if not user_access.get("read"):
        frappe.throw("Bạn không có quyền truy cập folder này")

    # Lấy tất cả children (bao gồm cả private files nếu user có quyền đọc parent)
    children = frappe.db.get_all(
        "Drive File",
        filters={"parent_entity": entity_name, "is_active": 1},
        fields=[
            "name",
            "title",
            "is_group",
            "file_size",
            "mime_type",
            "document",
            "modified",
            "owner",
            "is_private",
        ],
        order_by="is_group desc, title asc",
    )

    return children


import zipfile


@frappe.whitelist()
def download_folder_as_zip(entity_name):
    """
    ✅ OPTIMIZED: Download folder as ZIP on backend (much faster than client-side)

    Args:
        entity_name: Name of the folder to download

    Returns:
        Streamed ZIP file response
    """
    # Validate entity exists and is a folder
    if not frappe.db.exists("Drive File", entity_name):
        frappe.throw(f"Folder {entity_name} không tồn tại")

    parent_doc = frappe.get_doc("Drive File", entity_name)

    if not parent_doc.is_group:
        frappe.throw("Entity này không phải là folder")

    # Check read permission
    user = frappe.session.user if frappe.session.user != "Guest" else ""
    user_access = get_user_access(parent_doc, user)

    if not user_access.get("read"):
        frappe.throw("Bạn không có quyền truy cập folder này", frappe.PermissionError)

    # Create ZIP in-memory
    zip_buffer = BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Recursively add all files/folders
        def add_to_zip(folder_entity_name, arcname_prefix=""):
            children = frappe.db.get_all(
                "Drive File",
                filters={"parent_entity": folder_entity_name, "is_active": 1},
                fields=["name", "title", "is_group", "file_size", "mime_type"],
            )

            for child in children:
                arcname = f"{arcname_prefix}{child['title']}"

                if child["is_group"]:
                    # Recursively add folder contents
                    add_to_zip(child["name"], f"{arcname}/")
                else:
                    # Add file to ZIP
                    try:
                        file_path = get_file_path(child["name"])
                        if file_path and os.path.exists(file_path):
                            zf.write(file_path, arcname=arcname)
                    except Exception as e:
                        print(f"⚠️ Error adding {child['title']} to ZIP: {e}")
                        # Skip file if error
                        continue

        # Start recursive add from root folder
        add_to_zip(entity_name)

    # Prepare response
    zip_buffer.seek(0)
    zip_filename = secure_filename(parent_doc.title or "download") + ".zip"

    response = Response(
        wrap_file(frappe.request.environ, zip_buffer),
        mimetype="application/zip",
        direct_passthrough=True,
    )

    response.headers["Content-Disposition"] = f'attachment; filename="{zip_filename}"'
    response.headers["Content-Length"] = len(zip_buffer.getvalue())
    response.headers["X-Accel-Buffering"] = "no"
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

    # Log activity
    try:
        create_new_entity_activity_log(
            entity=entity_name,
            action_type="download",
        )
    except:
        pass

    return response


def get_file_path(entity_name):
    """Get file path for an entity"""
    try:
        file_entity = frappe.get_doc("Drive File", entity_name)
        file_path = file_entity.file_path

        if file_entity.store_in_s3:
            # For S3 files, would need different handling
            return None

        return file_path
    except:
        return None
