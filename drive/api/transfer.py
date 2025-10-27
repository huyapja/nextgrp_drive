import os
import frappe
import magic
from pathlib import Path

import mimemapper

# Import các hàm từ Drive module
from drive.api.files import create_drive_file
from drive.api.storage import storage_bar_data
from drive.api.activity import create_new_entity_activity_log
from drive.utils.files import (
    get_home_folder,
    get_new_title,
    update_file_size,
    FileManager,
)


@frappe.whitelist()
def transfer_raven_file_to_drive(message_name, parent=None):
    """
    Chuyển file từ Raven Message sang Drive File (với S3)
    """

    # Lấy Drive settings
    drive_settings = frappe.db.get_value(
        "Drive Settings",
        filters={"user": frappe.session.user},
        fieldname=["default_team"],
        as_dict=1,
    )
    team = drive_settings.default_team if drive_settings else None

    if not team:
        frappe.throw("Bạn chưa tham gia vào tài liệu", ValueError)

    # Lấy thông tin message từ Raven
    message = frappe.get_doc("Raven Message", message_name)

    # TÌM FILE THÔNG QUA FILE DOCTYPE (quan trọng!)
    file_doc, source_file_path = find_file_from_url(message.file, message.name)

    if not source_file_path:
        frappe.throw(
            f"Không tìm thấy file!\n\n",
            FileNotFoundError,
        )

    # Double check file tồn tại
    if not os.path.exists(source_file_path):
        frappe.throw(
            f"File document tồn tại nhưng file vật lý không tìm thấy!\n",
            FileNotFoundError,
        )

    # Lấy home folder
    home_folder = get_home_folder(team)
    parent = parent or home_folder["name"]
    is_private = 1

    # Kiểm tra quyền ghi vào folder
    if not frappe.has_permission(
        doctype="Drive File", doc=parent, ptype="write", user=frappe.session.user
    ):
        frappe.throw("Bạn không có quyền upload vào folder này", frappe.PermissionError)

    # Kiểm tra storage limit
    file_size = os.path.getsize(source_file_path)
    storage_data = storage_bar_data(team)
    storage_data_limit = storage_data["limit"] * 1024 * 1024 * 1024

    if (storage_data_limit - storage_data["total_size"]) < file_size:
        frappe.throw("Bạn đã hết dung lượng lưu trữ!", ValueError)

    # Lấy tên file từ File doctype (ưu tiên file_name)
    if file_doc and file_doc.file_name:
        original_filename = file_doc.file_name
    else:
        original_filename = message.content or os.path.basename(message.file)

    title = get_new_title(original_filename, parent)

    # Lấy mime type
    mime_type = get_mime_type(source_file_path)

    # Lấy extension từ file gốc
    file_extension = Path(source_file_path).suffix

    # Tạo DB record cho Drive File
    drive_file = create_drive_file(
        team,
        is_private,
        title,
        parent,
        file_size,
        mime_type,
        int(message.modified.timestamp() * 1000),
        lambda n: Path(home_folder["name"]) / f"{n}{file_extension}",
    )

    # Upload file sang Drive storage (S3) và giữ lại bản gốc
    manager = FileManager()
    temp_path = None
    try:
        # Tạo một bản sao tạm thời của file
        temp_dir = Path(frappe.get_site_path("private", "files", "temp"))
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_path = temp_dir / os.path.basename(source_file_path)

        # Copy file gốc vào temp
        import shutil

        shutil.copy2(source_file_path, temp_path)

        # Upload bản sao tạm thời lên Drive storage
        manager.upload_file(str(temp_path), drive_file.path, drive_file)

    except Exception as e:
        # Rollback: xóa drive_file nếu upload thất bại
        frappe.delete_doc("Drive File", drive_file.name, force=True)
        raise e

    finally:
        # Dọn dẹp: xóa file tạm nếu còn tồn tại
        try:
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)
                print(f"Cleaned up temp file: {temp_path}")
        except Exception as e:
            print(f"Warning: Could not delete temp file {temp_path}: {str(e)}")
            # Không throw exception ở đây vì upload đã thành công

    # Upload parent folder size
    update_file_size(parent, file_size)

    # Tạo activity log
    create_new_entity_activity_log(entity=drive_file.name, action_type="create")

    # Gửi thông báo qua realtime để frontend cập nhật
    frappe.publish_realtime(
        "file_created",
        {
            "file": {
                "name": drive_file.name,
                "title": drive_file.title,
                "parent_entity": drive_file.parent_entity,
                "is_group": drive_file.is_group,
                "file_size": drive_file.file_size,
                "mime_type": drive_file.mime_type,
                "path": drive_file.path,
                "is_active": drive_file.is_active,
                "team": drive_file.team,
            }
        },
        user=frappe.session.user,
    )

    frappe.msgprint(f"Đã chuyển file '{title}' vào Drive thành công!")

    return drive_file


def find_file_from_url(file_url, message_name=None):
    """
    Tìm File document và đường dẫn vật lý từ file_url.
    Xử lý cả trường hợp file có số thứ tự trong ngoặc.

    Args:
        file_url: URL của file (vd: /private/files/document.docx)
        message_name: Tên của Raven Message (để tìm File attached)

    Returns:
        tuple: (file_doc, physical_path) hoặc (None, physical_path)
    """
    if not file_url:
        return None, None

    print(f"\n=== Finding file from URL: {file_url} ===")

    # Bước 0: Thử tìm file vật lý trước
    filename = os.path.basename(file_url)

    # Tìm file trực tiếp từ thư mục

    # Nếu không tìm thấy trong Drive, tìm trong thư mục gốc
    direct_path = search_file_in_directory(filename)
    if direct_path:
        print(f"Found file directly: {direct_path}")
        return None, direct_path

    # Bước 1: Tìm File document qua file_url và tên file
    file_url_clean = file_url.lstrip("/")
    base_name = os.path.splitext(filename)[0]
    ext = os.path.splitext(filename)[1]

    # Loại bỏ số trong ngoặc nếu có
    import re

    base_name_no_number = re.sub(r"\s*\(\d+\)", "", base_name)

    # Tạo các pattern để tìm kiếm
    file_docs = frappe.get_all(
        "File",
        filters=[["File", "file_name", "like", f"{base_name_no_number}%{ext}"]],
        fields=[
            "name",
            "file_url",
            "file_name",
            "is_private",
            "attached_to_doctype",
            "attached_to_name",
        ],
        order_by="creation desc",
        limit=1,
    )

    if not file_docs:
        # Thử tìm bằng LIKE cho file có số thứ tự trong ngoặc
        base_name = os.path.splitext(file_url_clean)[0]  # Tên file không có extension
        if "(" in base_name:
            base_name = base_name.split("(")[0].strip()  # Lấy phần tên trước dấu (
            ext = os.path.splitext(file_url_clean)[1]  # Lấy extension
            file_docs = frappe.get_all(
                "File",
                filters=[["File", "file_url", "like", f"%{base_name}%{ext}"]],
                fields=[
                    "name",
                    "file_url",
                    "file_name",
                    "is_private",
                    "attached_to_doctype",
                    "attached_to_name",
                ],
                limit=1,
            )

    if not file_docs:
        print("No File document found with exact file_url match")
        # Thử tìm bằng LIKE (trường hợp có dấu /)
        file_url_clean = file_url.lstrip("/")
        file_docs = frappe.get_all(
            "File",
            filters=[["File", "file_url", "like", f"%{file_url_clean}"]],
            fields=["name", "file_url", "file_name", "is_private"],
            limit=1,
        )

    # Bước 2: Nếu không tìm thấy và có message_name, tìm File attached vào message
    if not file_docs and message_name:
        print(f"Trying to find File attached to message: {message_name}")
        file_docs = frappe.get_all(
            "File",
            filters={"attached_to_doctype": "Raven Message", "attached_to_name": message_name},
            fields=[
                "name",
                "file_url",
                "file_name",
                "is_private",
                "attached_to_doctype",
                "attached_to_name",
            ],
            limit=1,
        )
        if file_docs:
            print(f"✓ Found File attached to message: {file_docs[0].name}")

    # Bước 3: Nếu tìm thấy File doc, thử tìm file vật lý
    if file_docs:
        file_doc = frappe.get_doc("File", file_docs[0].name)
        print(f"Found File doc: {file_doc.name}")
        print(f"File name: {file_doc.file_name}")

        # Thử các vị trí có thể có của file
        possible_paths = [
            frappe.get_site_path(file_doc.file_url.lstrip("/")),  # Đường dẫn từ file_url
            os.path.join(
                "./", frappe.local.site, "private/files", file_doc.file_name
            ),  # Thư mục private/files
            os.path.join(
                "./", frappe.local.site, "public/files", file_doc.file_name
            ),  # Thư mục public/files
        ]

        # Thêm các biến thể của tên file (với số thứ tự)
        base_name = os.path.splitext(file_doc.file_name)[0]
        ext = os.path.splitext(file_doc.file_name)[1]
        for i in range(1, 10):  # Thử với các số thứ tự từ 1-9
            possible_paths.append(
                os.path.join("./", frappe.local.site, "private/files", f"{base_name} ({i}){ext}")
            )

        for path in possible_paths:
            print(f"Checking path: {path}")
            if os.path.exists(path):
                print(f"✓ Found file at: {path}")
                return file_doc, path

    print("Still no File document or physical file found")
    # Last try: tìm file trong thư mục bằng tên
    filename = os.path.basename(file_url)
    found_path = search_file_in_directory(filename, is_private=1)
    if found_path:
        print(f"✓ Found file by searching: {found_path}")
        return None, found_path

    # Bước 4: Lấy File document đầy đủ
    file_doc = frappe.get_doc("File", file_docs[0].name)
    print(f"Found File doc: {file_doc.name}")
    print(f"File name: {file_doc.file_name}")
    print(f"File URL: {file_doc.file_url}")

    # Bước 5: Lấy đường dẫn vật lý
    try:
        physical_path = file_doc.get_full_path()
        print(f"Physical path from get_full_path(): {physical_path}")

        if os.path.exists(physical_path):
            return file_doc, physical_path
        else:
            print(f"Path from get_full_path() doesn't exist: {physical_path}")
    except Exception as e:
        print(f"Error getting full path: {e}")

    # Bước 6: Fallback - tìm thủ công
    physical_path = resolve_file_path_manual(file_doc.file_url)
    print(f"Manual resolve path: {physical_path}")

    if physical_path and os.path.exists(physical_path):
        return file_doc, physical_path

    # Bước 7: Last resort - search trong thư mục
    if file_doc.file_name:
        found_path = search_file_in_directory(file_doc.file_name, file_doc.is_private)
        if found_path:
            print(f"Found by searching: {found_path}")
            return file_doc, found_path

    return file_doc, None


def resolve_file_path_manual(file_url):
    """
    Xử lý đường dẫn file thủ công
    """
    if not file_url:
        return None

    # Loại bỏ leading slash
    if file_url.startswith("/"):
        file_url = file_url[1:]

    # Xác định đường dẫn dựa trên private/public
    if file_url.startswith("private/"):
        return frappe.get_site_path(file_url)
    elif file_url.startswith("files/"):
        return frappe.get_site_path("public", file_url)
    else:
        # Thử cả hai
        private_path = frappe.get_site_path("private", file_url)
        if os.path.exists(private_path):
            return private_path

        public_path = frappe.get_site_path("public", file_url)
        if os.path.exists(public_path):
            return public_path

    return None


def search_file_in_directory(filename, is_private=1):
    """
    Tìm file trong thư mục private/files hoặc public/files
    Hỗ trợ tìm file có số thứ tự trong ngoặc
    """
    import re

    # Chuẩn bị các đường dẫn có thể có
    site_dir = os.path.join(".", frappe.local.site)
    alt_site_dir = "./grp.com"  # Thử cả thư mục grp.com

    search_dirs = [
        os.path.join(site_dir, "private/files"),
        os.path.join(site_dir, "public/files"),
        os.path.join(alt_site_dir, "private/files"),
        os.path.join(alt_site_dir, "public/files"),
    ]

    # Chuẩn bị các pattern tên file cần tìm
    base_name = os.path.splitext(filename)[0]
    file_ext = os.path.splitext(filename)[1]

    # Pattern 1: Tên chính xác
    patterns = [filename]

    # Pattern 2: Tên không có số trong ngoặc + có thể có số trong ngoặc
    base_without_number = re.sub(r"\s*\(\d+\)", "", base_name)
    patterns.append(f"{base_without_number}{file_ext}")

    # Pattern 3: Thêm các biến thể với số trong ngoặc
    for i in range(1, 10):
        patterns.append(f"{base_without_number} ({i}){file_ext}")

    print(f"Searching in directories: {search_dirs}")
    print(f"Looking for patterns: {patterns}")

    # Tìm kiếm trong tất cả các thư mục và pattern
    for search_dir in search_dirs:
        if not os.path.exists(search_dir):
            print(f"Directory not found: {search_dir}")
            continue

        print(f"\nSearching in: {search_dir}")
        for pattern in patterns:
            # Tìm chính xác
            exact_path = os.path.join(search_dir, pattern)
            if os.path.exists(exact_path):
                print(f"✓ Found exact match: {exact_path}")
                return exact_path

            # Tìm tương đối (dùng glob)
            import glob

            glob_pattern = os.path.join(search_dir, f"{base_without_number}*{file_ext}")
            matches = glob.glob(glob_pattern)
            if matches:
                print(f"✓ Found similar match: {matches[0]}")
                return matches[0]

    # Không tìm thấy
    print(f"File '{filename}' not found in {search_dir}")
    return None


def get_mime_type(file_path):
    """
    Lấy MIME type của file
    """
    # Thử dùng mimemapper trước (nếu có)
    if mimemapper:
        try:
            mime_type = mimemapper.get_mime_type(file_path, native_first=False)
            if mime_type:
                return mime_type
        except:
            pass

    # Dùng python-magic
    try:
        with open(file_path, "rb") as f:
            mime_type = magic.from_buffer(f.read(2048), mime=True)
            return mime_type
    except:
        # Fallback dựa trên extension
        import mimetypes

        mime_type, _ = mimetypes.guess_type(file_path)
        return mime_type or "application/octet-stream"


# ============= DEBUG FUNCTIONS =============


@frappe.whitelist()
def debug_find_file(file_url):
    """
    Debug: Tìm file và trả về thông tin chi tiết
    """
    if isinstance(file_url, dict):
        file_url = file_url.get("file_url")
    file_doc, physical_path = find_file_from_url(file_url)

    result = {
        "file_url": file_url,
        "file_doc_found": bool(file_doc),
        "physical_path": physical_path,
        "file_exists": os.path.exists(physical_path) if physical_path else False,
    }

    if file_doc:
        result.update(
            {
                "file_doc_name": file_doc.name,
                "file_name": file_doc.file_name,
                "is_private": file_doc.is_private,
            }
        )

        if physical_path and os.path.exists(physical_path):
            result.update(
                {
                    "file_size": os.path.getsize(physical_path),
                    "file_size_mb": round(os.path.getsize(physical_path) / (1024 * 1024), 2),
                    "mime_type": get_mime_type(physical_path),
                }
            )

    return result


@frappe.whitelist()
def list_files_in_directory(is_private=1):
    """
    Debug: List tất cả file trong thư mục
    """
    search_dir = frappe.get_site_path("private" if is_private else "public", "files")

    if not os.path.exists(search_dir):
        return {"error": f"Directory not found: {search_dir}"}

    files_list = []
    for item in os.listdir(search_dir):
        item_path = os.path.join(search_dir, item)
        if os.path.isfile(item_path):
            files_list.append(
                {
                    "name": item,
                    "size": os.path.getsize(item_path),
                    "size_mb": round(os.path.getsize(item_path) / (1024 * 1024), 2),
                }
            )

    return {
        "directory": search_dir,
        "total_files": len(files_list),
        "files": sorted(files_list, key=lambda x: x["name"])[:50],  # Giới hạn 50 file
    }
