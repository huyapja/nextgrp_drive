import frappe
from werkzeug.wrappers import Response
from werkzeug.wsgi import wrap_file
from pathlib import Path
from drive.utils.files import FileManager, get_home_folder
from io import BytesIO


@frappe.whitelist(allow_guest=True)
def get_file_content(embed_name, parent_entity_name):
    """
    Stream file content and optionally trigger download

    :param entity_name: Document-name of the file whose content is to be streamed
    :param trigger_download: 1 to trigger the "Save As" dialog. Defaults to 0
    :type trigger_download: int
    :raises ValueError: If the DriveEntity doc does not exist or is not a file
    :raises PermissionError: If the current user does not have permission to read the file
    :raises FileLockedError: If the file has been writer-locked
    """
    # Used for <v0.1 support, also a security flaw
    old_parent_name = frappe.get_list(
        "Drive File",
        {"old_name": parent_entity_name},
        ["name"],
    )
    if old_parent_name:
        parent_entity_name = old_parent_name[0]["name"]

    if not frappe.has_permission(
        doctype="Drive File",
        doc=parent_entity_name,
        ptype="read",
        user=frappe.session.user,
    ):
        raise frappe.PermissionError("You do not have permission to view this file")
    cache_key = "embed-" + embed_name
    embed_data = None
    if frappe.cache().exists(cache_key):
        embed_data = frappe.cache().get_value(cache_key)
        # Reset về đầu file nếu là BytesIO
        if embed_data and hasattr(embed_data, 'seek'):
            embed_data.seek(0)
    if not embed_data:
        # Lấy thông tin embed file trực tiếp
        embed_file = frappe.get_value(
            "Drive File",
            embed_name,
            ["path", "team", "mime_type", "title"],
            as_dict=1,
        )
        
        if not embed_file:
            frappe.throw(f"Embed file {embed_name} not found", frappe.DoesNotExistError)
        
        # Sử dụng path từ database (đã có extension)
        embed_path = embed_file.path
        
        # Nếu không có path trong database, tạo path từ team
        if not embed_path:
            home_folder = get_home_folder(embed_file.team)
            # Lấy extension từ title hoặc mime_type
            title = embed_file.title or ""
            if title and '.' in title:
                ext = '.' + title.split('.')[-1]
            elif embed_file.mime_type:
                mime_to_ext = {
                    'image/jpeg': '.jpg',
                    'image/png': '.png',
                    'image/gif': '.gif',
                    'image/webp': '.webp',
                }
                ext = mime_to_ext.get(embed_file.mime_type, '.webp')
            else:
                ext = '.webp'
            
            # Tạo relative path (không có site_path)
            embed_path = str(
                Path(
                    home_folder["name"],  # Dùng "name" thay vì "path" để có relative path
                    "embeds",
                    f"{embed_name}{ext}"
                )
            )
        
        # FileManager.get_file() nhận relative path và tự động thêm site_folder
        # Path từ database đã là relative path (ví dụ: "vro96tqqd0/embeds/ij5ufnrl8c.webp")
        manager = FileManager()
        try:
            file_buffer = manager.get_file(embed_path)
            # get_file() trả về BytesIO (hoặc S3 object body có method read())
            # Đọc toàn bộ content và tạo BytesIO mới để có thể seek
            if hasattr(file_buffer, 'read'):
                # Đọc toàn bộ content
                file_content = file_buffer.read()
                # Tạo BytesIO mới từ content
                embed_data = BytesIO(file_content)
            else:
                # Nếu không phải file-like object, thử convert
                embed_data = BytesIO(bytes(file_buffer))
            
            # Reset về đầu file để có thể đọc lại
            embed_data.seek(0)
            frappe.cache().set_value(cache_key, embed_data)
        except Exception as e:
            frappe.log_error(f"Error reading embed file {embed_name} at path {embed_path}: {str(e)}")
            frappe.throw(f"Embed file not found at path: {embed_path}", frappe.DoesNotExistError)

    response = Response(
        wrap_file(frappe.request.environ, embed_data),
        direct_passthrough=True,
    )
    response.headers.set("Content-Disposition", "inline", filename=embed_name)
    
    # Set Content-Type header để browser hiển thị ảnh đúng cách
    try:
        embed_file = frappe.get_doc("Drive File", embed_name)
        if embed_file and embed_file.mime_type:
            response.headers.set("Content-Type", embed_file.mime_type)
        elif embed_name.endswith(('.jpg', '.jpeg')):
            response.headers.set("Content-Type", "image/jpeg")
        elif embed_name.endswith('.png'):
            response.headers.set("Content-Type", "image/png")
        elif embed_name.endswith('.gif'):
            response.headers.set("Content-Type", "image/gif")
        elif embed_name.endswith('.webp'):
            response.headers.set("Content-Type", "image/webp")
        else:
            response.headers.set("Content-Type", "application/octet-stream")
    except Exception:
        # Fallback: dựa vào extension
        if embed_name.endswith(('.jpg', '.jpeg')):
            response.headers.set("Content-Type", "image/jpeg")
        elif embed_name.endswith('.png'):
            response.headers.set("Content-Type", "image/png")
        elif embed_name.endswith('.gif'):
            response.headers.set("Content-Type", "image/gif")
        elif embed_name.endswith('.webp'):
            response.headers.set("Content-Type", "image/webp")
        else:
            response.headers.set("Content-Type", "application/octet-stream")
    
    # Thêm CORS headers nếu cần
    response.headers.set("Access-Control-Allow-Origin", "*")
    response.headers.set("Cache-Control", "public, max-age=31536000")
    
    return response
