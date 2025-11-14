# File: drive/api/onlyoffice.py

import frappe
import jwt
from datetime import datetime


@frappe.whitelist()
def get_editor_config(entity_name):
    """
    Build OnlyOffice editor config with the correct structure and URLs that the
    Document Server can download, including S3 presigned links when needed.
    """
    try:
        frappe.logger().info(f"Getting editor config for: {entity_name}")

        entity = frappe.get_doc("Drive File", entity_name)

        if not frappe.has_permission("Drive File", doc=entity_name, ptype="read"):
            frappe.throw("You do not have permission to access this file")

        # Prefer direct S3 download for Document Server so it can fetch the file itself.
        file_url = frappe.utils.get_url(
            f"/api/method/drive.api.files.get_file_content?entity_name={entity_name}"
        )
        if is_s3_storage():
            try:
                file_url = get_s3_presigned_url(entity_name, entity.path)
            except Exception as err:
                frappe.logger().warning(
                    f"Could not generate S3 URL for {entity_name}, fallback to API URL: {err}"
                )

        file_ext = entity.title.split(".")[-1].lower() if entity.title else "txt"
        document_type = get_document_type(file_ext)

        document_config = {
            "title": entity.title or entity.name,
            "url": file_url,
            "fileType": file_ext,
            "key": entity.name,
            "permissions": {
                "edit": True,
                "download": True,
                "print": True,
                "review": False,
            },
        }

        editor_config = {
            "mode": "edit",
            "callbackUrl": frappe.utils.get_url(
                "/api/method/drive.api.onlyoffice.save_document"
            ),
            "user": {
                "id": frappe.session.user,
                "name": frappe.db.get_value("User", frappe.session.user, "full_name")
                or frappe.session.user,
            },
            "customization": {
                "autosave": True,
                "forcesave": False,
                "compactToolbar": False,
            },
        }

        config = {
            "documentType": document_type,
            "type": "desktop",
            "document": document_config,
            "editorConfig": editor_config,
        }

        token = generate_onlyoffice_token(config)
        if token:
            config["token"] = token

        frappe.logger().info(f"OnlyOffice config generated for {entity_name}")
        return config

    except Exception as e:
        frappe.logger().error(f"Error in get_editor_config: {str(e)}", exc_info=True)
        frappe.throw(f"Lỗi khi tải config: {str(e)}")


def generate_onlyoffice_token(config_data):
    """Generate OnlyOffice JWT token by signing the final config payload."""
    try:
        secret = frappe.conf.get("onlyoffice_jwt_secret")
        if not secret:
            frappe.logger().warning("OnlyOffice JWT secret is not configured")
            return ""

        token = jwt.encode(config_data, secret, algorithm="HS256")
        frappe.logger().info("Generated OnlyOffice token")

        return token if isinstance(token, str) else token.decode()
    except Exception as e:
        frappe.logger().error(f"Error generating token: {str(e)}")
        return ""


def is_s3_storage():
    """
    Kiểm tra xem có sử dụng S3 storage không
    """
    try:
        settings = frappe.get_single("Drive Settings")
        return bool(settings.get("aws_s3_bucket") and settings.get("aws_access_key_id"))
    except:
        return False


def get_s3_presigned_url(entity_name, s3_key, expires_in=3600):
    """
    Lấy presigned URL từ S3
    """
    try:
        import boto3
        from botocore.client import Config

        settings = frappe.get_single("Drive Settings")

        # Validate S3 settings
        if not all(
            [settings.aws_access_key_id, settings.aws_secret_access_key, settings.aws_s3_bucket]
        ):
            frappe.throw("S3 settings không đầy đủ")

        s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.get("aws_region", "us-east-1"),
            config=Config(signature_version="s3v4"),
        )

        # Generate presigned URL
        url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.aws_s3_bucket, "Key": s3_key},
            ExpiresIn=expires_in,
        )

        frappe.logger().info(f"Generated S3 presigned URL for {entity_name}")
        return url

    except Exception as e:
        frappe.logger().error(f"Error generating S3 presigned URL: {str(e)}")
        raise


def get_file_type(ext):
    """
    Lấy loại file từ extension
    """
    ext_map = {
        "doc": "word",
        "docx": "word",
        "odt": "word",
        "rtf": "word",
        "xls": "cell",
        "xlsx": "cell",
        "ods": "cell",
        "csv": "cell",
        "ppt": "slide",
        "pptx": "slide",
        "odp": "slide",
        "pdf": "pdf",
    }
    return ext_map.get(ext.lower(), "word")


def get_document_type(ext):
    ext = ext.lower()
    if ext in ["doc", "docx", "odt", "rtf"]:
        return "word"
    if ext in ["xls", "xlsx", "ods", "csv"]:
        return "cell"
    if ext in ["ppt", "pptx", "odp"]:
        return "slide"
    if ext == "pdf":
        return "pdf"
    return "word"


@frappe.whitelist(allow_guest=False)
def save_document():
    """
    Callback từ OnlyOffice khi save document
    OnlyOffice gửi POST request với status = 2 khi document được save
    """
    import requests

    try:
        data = frappe.request.json or {}

        # OnlyOffice status codes:
        # 0 = no document with the key identifier could be found
        # 1 = document is being edited
        # 2 = document is ready for saving
        # 3 = document saving failed
        # 4 = document is closed with no changes
        # 6 = document is being edited, but the changes could not be saved

        if data.get("status") == 2:  # Document saved
            entity_name = data.get("key")
            download_url = data.get("url")

            if not entity_name or not download_url:
                return {"error": 1, "message": "Missing key or url"}

            # Check permission
            if not frappe.has_permission("Drive File", doc=entity_name, ptype="write"):
                frappe.logger().warning(f"Unauthorized save attempt for {entity_name}")
                return {"error": 1, "message": "No permission"}

            try:
                # Download file từ OnlyOffice
                response = requests.get(download_url, timeout=30)

                if response.status_code == 200:
                    # Get the Drive File
                    drive_file = frappe.get_value(
                        "Drive File",
                        {"name": entity_name},
                        ["path", "title", "mime_type"],
                        as_dict=1,
                    )

                    if not drive_file:
                        return {"error": 1, "message": "File not found"}

                    # Save file based on storage type
                    if is_s3_storage():
                        save_to_s3(entity_name, drive_file["path"], response.content)
                    else:
                        save_to_local(entity_name, drive_file["path"], response.content)

                    # Update modified timestamp
                    frappe.db.set_value("Drive File", entity_name, "modified", datetime.now())
                    frappe.db.commit()

                    frappe.logger().info(f"Document saved: {entity_name}")
                    return {"error": 0}
                else:
                    return {"error": 1, "message": f"HTTP {response.status_code}"}

            except requests.RequestException as e:
                frappe.logger().error(f"Error downloading from OnlyOffice: {str(e)}")
                return {"error": 1, "message": "Download failed"}

        return {"error": 0}

    except Exception as e:
        frappe.logger().error(f"Error in save_document: {str(e)}")
        return {"error": 1, "message": str(e)}


def save_to_s3(entity_name, s3_key, file_content):
    """
    Upload file content lên S3
    """
    try:
        import boto3

        settings = frappe.get_single("Drive Settings")

        s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.get("aws_region", "us-east-1"),
        )

        s3_client.put_object(
            Bucket=settings.aws_s3_bucket,
            Key=s3_key,
            Body=file_content,
            ContentType="application/octet-stream",
        )

        frappe.logger().info(f"Uploaded to S3: {s3_key}")

    except Exception as e:
        frappe.logger().error(f"Error uploading to S3: {str(e)}")
        raise


def save_to_local(entity_name, file_path, file_content):
    """
    Save file content to local storage
    """
    try:
        from frappe.core.doctype.file.file import get_file_path
        import os

        # Lấy full path từ file_path
        full_path = get_file_path(file_path)

        # Tạo directory nếu cần
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        # Write file
        with open(full_path, "wb") as f:
            f.write(file_content)

        frappe.logger().info(f"Saved local file: {full_path}")

    except Exception as e:
        frappe.logger().error(f"Error saving local file: {str(e)}")
        raise
