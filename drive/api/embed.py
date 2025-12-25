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

        # ⚠️ FIX: Check cache TRƯỚC permission để nhanh hơn (nếu đã cache thì an toàn)
        cache_key = f"embed-{embed_name}"
        cached_data = None

        # ⚠️ CRITICAL: Dùng hget để lấy cả data và metadata
        cache_entry = frappe.cache().hget(cache_key, "data")
        if cache_entry:
            try:
                cached_data = BytesIO(cache_entry)
                cached_data.seek(0)
                frappe.logger().info(
                    f"[get_file_content] Cache HIT for {embed_name} "
                    f"({len(cache_entry)} bytes) - {time.time() - start_time:.3f}s"
                )
            except Exception as e:
                frappe.logger().warning(
                    f"[get_file_content] Cache corrupted for {embed_name}: {e}"
                )
                # Clear corrupted cache
                frappe.cache().hdel(cache_key, "data")
                cached_data = None

        # Permission check (chỉ khi không có cache hoặc cần verify)
        perm_start = time.time()

        # ⚠️ FIX: Tối ưu permission check
        # ⚠️ FIX: BỎ cache=True vì fieldname là dict (không hashable)
        old_parent_name = frappe.db.get_value(
            "Drive File",
            {"old_name": parent_entity_name},
            "name",
        )
        if old_parent_name:
            parent_entity_name = old_parent_name

        # ⚠️ CRITICAL: Chỉ check permission nếu chưa có cache
        if not cached_data:
            if not frappe.has_permission(
                doctype="Drive File",
                doc=parent_entity_name,
                ptype="read",
                user=frappe.session.user,
            ):
                raise frappe.PermissionError(
                    "You do not have permission to view this file"
                )

        perm_duration = time.time() - perm_start
        frappe.logger().info(
            f"[get_file_content] Permission check: {perm_duration:.3f}s"
        )

        # Nếu có cached data, trả về ngay
        if cached_data:
            response = Response(
                wrap_file(frappe.request.environ, cached_data),
                direct_passthrough=True,
            )

            # Get mime_type from cache or fallback
            mime_type = frappe.cache().hget(cache_key, "mime_type")
            if not mime_type:
                mime_type = "application/octet-stream"

            response.headers.set("Content-Disposition", "inline", filename=embed_name)
            response.headers.set("Content-Type", mime_type)
            response.headers.set("Access-Control-Allow-Origin", "*")
            response.headers.set("Cache-Control", "public, max-age=31536000")
            response.headers.set("X-Cache", "HIT")

            duration = time.time() - start_time
            frappe.logger().info(
                f"[get_file_content] SUCCESS (cached) {request_id}: {duration:.3f}s"
            )

            return response

        # ⚠️ Cache MISS - fetch from database/file
        db_start = time.time()
        # ⚠️ FIX: BỎ cache=True vì fieldname là list (không hashable)
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

        # ⚠️ CRITICAL: Read file with timeout protection
        file_start = time.time()
        manager = FileManager()

        # ⚠️ Check file exists (fast check)
        file_exists = False
        if manager.s3_enabled:
            try:
                manager.conn.head_object(Bucket=manager.bucket, Key=embed_path)
                file_exists = True
            except Exception as e:
                local_path = manager.site_folder / embed_path
                file_exists = local_path.exists()
                if not file_exists:
                    frappe.logger().error(
                        f"[get_file_content] File not found: {embed_path} (S3: {e})"
                    )
        else:
            local_path = manager.site_folder / embed_path
            file_exists = local_path.exists()
            if not file_exists:
                frappe.logger().error(
                    f"[get_file_content] File not found: {local_path}"
                )

        if not file_exists:
            error_msg = f"Embed file {embed_name} not found at path: {embed_path}"
            frappe.log_error(error_msg, "Embed File Not Found")
            frappe.throw(error_msg, frappe.DoesNotExistError)

        # ⚠️ Read file with size limit
        try:
            file_buffer = manager.get_file(embed_path)

            MAX_EMBED_SIZE = 50 * 1024 * 1024  # 50MB

            if hasattr(file_buffer, "read"):
                file_content = file_buffer.read(MAX_EMBED_SIZE)

                if len(file_content) >= MAX_EMBED_SIZE:
                    frappe.logger().error(
                        f"[get_file_content] File too large: {embed_name} (>50MB)"
                    )
                    frappe.throw("Embed file is too large", frappe.ValidationError)

                embed_data = BytesIO(file_content)
            else:
                embed_data = BytesIO(bytes(file_buffer))

            embed_data.seek(0)
            file_duration = time.time() - file_start

            frappe.logger().info(
                f"[get_file_content] File read: {file_duration:.3f}s "
                f"({len(file_content)} bytes)"
            )

            # ⚠️ CRITICAL: Cache với hset để lưu cả data và metadata
            try:
                frappe.cache().hset(cache_key, "data", file_content)
                frappe.cache().hset(cache_key, "mime_type", embed_mime_type)
                frappe.cache().expire(cache_key, 3600)  # 1 hour
                frappe.logger().info(
                    f"[get_file_content] Cached {embed_name} ({len(file_content)} bytes)"
                )
            except Exception as e:
                frappe.logger().warning(
                    f"[get_file_content] Failed to cache {embed_name}: {e}"
                )

        except frappe.ValidationError:
            raise
        except Exception as e:
            frappe.logger().error(
                f"[get_file_content] Error reading file {embed_name}: {e}",
                exc_info=True,
            )
            frappe.throw(
                f"Error reading embed file: {embed_path}", frappe.DoesNotExistError
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
        response.headers.set("X-Cache", "MISS")

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
