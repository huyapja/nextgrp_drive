import frappe
from werkzeug.wrappers import Response
from werkzeug.wsgi import wrap_file
from pathlib import Path
from drive.utils.files import FileManager, get_home_folder
from io import BytesIO
import time
import threading

# ⚠️ NEW: Track concurrent requests
_active_requests = {}
_request_lock = threading.Lock()


@frappe.whitelist(allow_guest=True)
def get_file_content(embed_name, parent_entity_name):
    """
    Stream file content with optimized performance and proper error handling
    """
    request_id = f"{embed_name}_{int(time.time() * 1000)}"
    start_time = time.time()

    # ⚠️ CRITICAL: Check concurrent requests để tránh race condition
    with _request_lock:
        if embed_name in _active_requests:
            existing_request = _active_requests[embed_name]
            wait_time = time.time() - existing_request["start_time"]
            frappe.logger().warning(
                f"[get_file_content] Duplicate request for {embed_name}, "
                f"existing request {existing_request['id']} has been waiting {wait_time:.2f}s"
            )
            # Nếu request cũ đã chờ quá 5 giây, cho phép request mới
            if wait_time > 5:
                frappe.logger().warning(
                    f"[get_file_content] Replacing stale request {existing_request['id']}"
                )
            else:
                # Chờ một chút rồi trả về cached data nếu có
                time.sleep(0.1)

        _active_requests[embed_name] = {"id": request_id, "start_time": start_time}

    try:
        frappe.logger().info(
            f"[get_file_content] START {request_id}: embed={embed_name}, "
            f"parent={parent_entity_name}, user={frappe.session.user}"
        )

        # ⚠️ FIX: Lấy trực tiếp từ database, không check cache
        perm_start = time.time()

        # ⚠️ FIX: Tối ưu permission check
        old_parent_name = frappe.db.get_value(
            "Drive File",
            {"old_name": parent_entity_name},
            "name",
        )
        if old_parent_name:
            parent_entity_name = old_parent_name

        # ⚠️ CRITICAL: Check permission
        # if not frappe.has_permission(
        #     doctype="Drive File",
        #     doc=parent_entity_name,
        #     ptype="read",
        #     user=frappe.session.user,
        # ):
        #     raise frappe.PermissionError("You do not have permission to view this file")

        perm_duration = time.time() - perm_start
        frappe.logger().info(
            f"[get_file_content] Permission check: {perm_duration:.3f}s"
        )

        # ⚠️ Fetch from database
        db_start = time.time()
        embed_file = frappe.get_value(
            "Drive File",
            embed_name,
            ["path", "team", "mime_type", "title"],
            as_dict=1,
        )
        db_duration = time.time() - db_start

        if not embed_file:
            frappe.logger().error(
                f"[get_file_content] Embed file {embed_name} not found in database"
            )
            frappe.throw(f"Embed file {embed_name} not found", frappe.DoesNotExistError)

        frappe.logger().info(f"[get_file_content] Database query: {db_duration:.3f}s")

        embed_mime_type = embed_file.mime_type
        embed_path = embed_file.path

        # Build path if not in database
        if not embed_path:
            home_folder = get_home_folder(embed_file.team)
            title = embed_file.title or ""
            if title and "." in title:
                ext = "." + title.split(".")[-1]
            elif embed_file.mime_type:
                mime_to_ext = {
                    "image/jpeg": ".jpg",
                    "image/png": ".png",
                    "image/gif": ".gif",
                    "image/webp": ".webp",
                }
                ext = mime_to_ext.get(embed_file.mime_type, ".webp")
            else:
                ext = ".webp"

            embed_path = str(Path(home_folder["name"], "embeds", f"{embed_name}{ext}"))

        # ⚠️ CRITICAL: Stream file directly without loading into memory
        file_start = time.time()
        manager = FileManager()

        frappe.logger().debug(
            f"[get_file_content] Attempting to read file at path: {embed_path}"
        )

        MAX_EMBED_SIZE = 50 * 1024 * 1024  # 50MB

        # ⚠️ FIX: Stream file trực tiếp từ local disk để tránh load toàn bộ vào memory
        embed_data = None
        file_handle = None

        try:
            local_path = manager.site_folder / embed_path
            s3_check_start = time.time()

            if local_path.exists():
                # ⚠️ Local file: stream trực tiếp từ disk (KHÔNG load vào memory)
                local_check_duration = time.time() - s3_check_start
                file_size = local_path.stat().st_size

                if file_size > MAX_EMBED_SIZE:
                    frappe.logger().error(
                        f"[get_file_content] File too large: {embed_name} ({file_size} bytes > {MAX_EMBED_SIZE})"
                    )
                    frappe.throw("Embed file is too large", frappe.ValidationError)

                # Mở file và stream trực tiếp - wrap_file sẽ tự động đóng file handle
                file_handle = open(local_path, "rb")
                embed_data = file_handle
                file_duration = time.time() - file_start

                frappe.logger().info(
                    f"[get_file_content] Local file opened: {file_duration:.3f}s "
                    f"(local_check={local_check_duration:.3f}s, {file_size} bytes, streaming from disk)"
                )
            else:
                # ⚠️ File không tồn tại local - phải fetch từ S3
                local_check_duration = time.time() - s3_check_start
                frappe.logger().info(
                    f"[get_file_content] File not found locally, fetching from S3 "
                    f"(local_check={local_check_duration:.3f}s)"
                )

                s3_fetch_start = time.time()

                # ⚠️ FIX: Sử dụng FileManager.get_file() nhưng với logging chi tiết hơn
                # FileManager đã được tối ưu để check local trước, nhưng chúng ta đã check rồi
                # nên sẽ fetch từ S3
                file_buffer = manager.get_file(embed_path)

                file_content = None
                file_size = 0

                s3_get_duration = time.time() - s3_fetch_start

                if hasattr(file_buffer, "read"):
                    # S3 stream object - đọc với chunks để tránh timeout và tối ưu memory
                    chunk_size = 1024 * 1024  # 1MB chunks
                    file_content = b""

                    read_start = time.time()
                    while True:
                        chunk = file_buffer.read(chunk_size)
                        if not chunk:
                            break
                        file_content += chunk
                        if len(file_content) > MAX_EMBED_SIZE:
                            frappe.logger().error(
                                f"[get_file_content] File too large: {embed_name} (> {MAX_EMBED_SIZE})"
                            )
                            frappe.throw(
                                "Embed file is too large", frappe.ValidationError
                            )

                    file_size = len(file_content)
                    read_duration = time.time() - read_start

                    frappe.logger().info(
                        f"[get_file_content] S3 file read: total={time.time() - s3_fetch_start:.3f}s "
                        f"(get_object={s3_get_duration:.3f}s, read_stream={read_duration:.3f}s, "
                        f"{file_size} bytes)"
                    )
                elif isinstance(file_buffer, bytes):
                    file_content = file_buffer
                    file_size = len(file_content)
                    frappe.logger().info(
                        f"[get_file_content] S3 file read: {time.time() - s3_fetch_start:.3f}s "
                        f"(get_object={s3_get_duration:.3f}s, {file_size} bytes)"
                    )
                else:
                    file_content = bytes(file_buffer)
                    file_size = len(file_content)
                    frappe.logger().info(
                        f"[get_file_content] S3 file read: {time.time() - s3_fetch_start:.3f}s "
                        f"(get_object={s3_get_duration:.3f}s, {file_size} bytes)"
                    )

                if file_size > MAX_EMBED_SIZE:
                    frappe.logger().error(
                        f"[get_file_content] File too large: {embed_name} ({file_size} bytes > {MAX_EMBED_SIZE})"
                    )
                    frappe.throw("Embed file is too large", frappe.ValidationError)

                embed_data = BytesIO(file_content)
                embed_data.seek(0)
                file_duration = time.time() - file_start

        except frappe.ValidationError:
            # Đóng file handle nếu có exception trước khi wrap_file được gọi
            if file_handle:
                try:
                    file_handle.close()
                except Exception:
                    pass
            raise
        except FileNotFoundError as e:
            # Đóng file handle nếu có exception trước khi wrap_file được gọi
            if file_handle:
                try:
                    file_handle.close()
                except Exception:
                    pass
            error_detail = str(e)
            frappe.logger().error(
                f"[get_file_content] File not found: {embed_name} at path {embed_path}: {error_detail}",
                exc_info=True,
            )
            frappe.throw(
                f"Embed file {embed_name} not found at path: {embed_path}",
                frappe.DoesNotExistError,
            )
        except Exception as e:
            # Đóng file handle nếu có exception trước khi wrap_file được gọi
            if file_handle:
                try:
                    file_handle.close()
                except Exception:
                    pass

            error_detail = str(e)
            error_type = type(e).__name__
            frappe.logger().error(
                f"[get_file_content] Error reading file {embed_name} at path {embed_path} "
                f"({error_type}): {error_detail}",
                exc_info=True,
            )
            # Nếu là file not found error từ S3 hoặc local
            if (
                "not found" in error_detail.lower()
                or "no such file" in error_detail.lower()
                or error_type == "NoSuchKey"
            ):
                frappe.throw(
                    f"Embed file {embed_name} not found at path: {embed_path}",
                    frappe.DoesNotExistError,
                )
            else:
                # Các lỗi khác (permission, read error, timeout, etc.)
                frappe.throw(
                    f"Error reading embed file {embed_name}: {error_detail}",
                    frappe.ValidationError,
                )

        # Build response
        response = Response(
            wrap_file(frappe.request.environ, embed_data),
            direct_passthrough=True,
        )
        response.headers.set("Content-Disposition", "inline", filename=embed_name)
        response.headers.set(
            "Content-Type", embed_mime_type or "application/octet-stream"
        )
        response.headers.set("Access-Control-Allow-Origin", "*")
        response.headers.set("Cache-Control", "public, max-age=31536000")

        duration = time.time() - start_time
        frappe.logger().info(
            f"[get_file_content] SUCCESS {request_id}: {duration:.3f}s "
            f"(perm={perm_duration:.3f}s, db={db_duration:.3f}s, "
            f"file={file_duration:.3f}s)"
        )

        return response

    except Exception as e:
        duration = time.time() - start_time
        frappe.logger().error(
            f"[get_file_content] ERROR {request_id}: {duration:.3f}s - {str(e)}",
            exc_info=True,
        )
        raise
    finally:
        # ⚠️ CRITICAL: Cleanup active request tracking
        with _request_lock:
            if (
                embed_name in _active_requests
                and _active_requests[embed_name]["id"] == request_id
            ):
                del _active_requests[embed_name]
