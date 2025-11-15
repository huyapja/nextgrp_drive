import frappe
import jwt
from datetime import datetime
import requests


@frappe.whitelist()
def get_editor_config(entity_name):
    """
    Build OnlyOffice editor config with the correct structure and URLs
    """
    try:
        frappe.logger().info(f"=== Getting editor config for: {entity_name} ===")

        entity = frappe.get_doc("Drive File", entity_name)

        if not frappe.has_permission("Drive File", doc=entity_name, ptype="read"):
            frappe.throw("You do not have permission to access this file")

        # Get file URL - ưu tiên S3 nếu có
        file_url = None

        if is_s3_storage():
            try:
                # Sử dụng signed URL từ S3
                from drive.api.files import get_file_signed_url

                result = get_file_signed_url(entity_name)
                file_url = result.get("signed_url")
                frappe.logger().info(f"Using S3 signed URL: {file_url[:50]}...")
            except Exception as err:
                frappe.logger().warning(f"S3 URL failed, using API URL: {err}")

        # Fallback to API URL
        if not file_url:
            site_url = get_accessible_site_url()
            file_url = (
                f"{site_url}/api/method/drive.api.files.get_file_content?entity_name={entity_name}"
            )

        frappe.logger().info(f"📎 Final file URL: {file_url}")

        file_ext = entity.title.split(".")[-1].lower() if entity.title else "txt"
        document_type = get_document_type(file_ext)

        # Build config structure
        config = {
            "documentType": document_type,
            "document": {
                "title": entity.title or entity.name,
                "url": file_url,
                "fileType": file_ext,
                "key": f"{entity.name}_{int(entity.modified.timestamp())}",
                "permissions": {
                    "edit": True,
                    "download": True,
                    "print": True,
                    "review": False,
                    "comment": False,
                },
            },
            "editorConfig": {
                "mode": "edit",
                "lang": "vi",
                "user": {
                    "id": frappe.session.user,
                    "name": frappe.db.get_value("User", frappe.session.user, "full_name")
                    or frappe.session.user,
                },
                "customization": {
                    "autosave": True,
                    "forcesave": False,
                    "compactToolbar": False,
                    "feedback": False,
                    "about": False,
                },
            },
        }

        # Generate JWT token
        secret = frappe.conf.get("onlyoffice_jwt_secret")
        if secret:
            try:
                token = jwt.encode(config, secret, algorithm="HS256")
                config["token"] = token if isinstance(token, str) else token.decode()
                frappe.logger().info(f"🔐 Generated JWT token: {config['token'][:30]}...")
            except Exception as e:
                frappe.logger().error(f"❌ Error generating JWT token: {e}")
                frappe.throw(f"Lỗi tạo JWT token: {str(e)}")
        else:
            frappe.logger().warning("⚠️  OnlyOffice JWT secret NOT configured!")

        frappe.logger().info(f"✅ Config generated successfully for {entity_name}")
        frappe.logger().info(f"   Document type: {document_type}")
        frappe.logger().info(f"   File type: {file_ext}")

        return config

    except Exception as e:
        frappe.logger().error(f"❌ Error in get_editor_config: {str(e)}", exc_info=True)
        frappe.throw(f"Lỗi khi tải config: {str(e)}")


def get_accessible_site_url():
    """
    Get the site URL that OnlyOffice Document Server can access

    Priority:
    1. frappe.conf.onlyoffice_callback_url (manual override)
    2. frappe.utils.get_url() with localhost replaced by IP
    """

    # Option 1: Manual override in site_config.json
    manual_url = frappe.conf.get("onlyoffice_callback_url")
    if manual_url:
        frappe.logger().info(f"✅ Using manual callback URL: {manual_url}")
        return manual_url.rstrip("/")

    # Option 2: Get from frappe.utils.get_url() and fix localhost
    site_url = frappe.utils.get_url()

    frappe.logger().info(f"🔍 Original site URL: {site_url}")

    # Check if localhost needs to be replaced
    if "localhost" in site_url or "127.0.0.1" in site_url:
        frappe.logger().warning(f"⚠️  Detected localhost in URL: {site_url}")

        import socket

        hostname = socket.gethostname()

        try:
            # Try to get local IP
            local_ip = socket.gethostbyname(hostname)
            site_url = site_url.replace("localhost", local_ip).replace("127.0.0.1", local_ip)
            frappe.logger().info(f"✅ Replaced with local IP: {site_url}")
        except Exception as e:
            frappe.logger().error(f"❌ Cannot resolve hostname to IP: {e}")

            # Try alternative method
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.connect(("8.8.8.8", 80))
                local_ip = s.getsockname()[0]
                s.close()

                site_url = site_url.replace("localhost", local_ip).replace("127.0.0.1", local_ip)
                frappe.logger().info(f"✅ Replaced with detected IP: {site_url}")
            except Exception as e2:
                frappe.logger().error(f"❌ Alternative IP detection failed: {e2}")

    return site_url.rstrip("/")


def get_document_type(ext):
    """Xác định loại document cho OnlyOffice"""
    ext = ext.lower()
    if ext in ["doc", "docx", "odt", "rtf", "txt", "docm", "dot", "dotx", "dotm"]:
        return "word"
    if ext in ["xls", "xlsx", "ods", "csv", "xlsm", "xlt", "xltx", "xltm"]:
        return "cell"
    if ext in ["ppt", "pptx", "odp", "pptm", "pot", "potx", "potm"]:
        return "slide"
    if ext == "pdf":
        return "pdf"
    return "word"


def is_s3_storage():
    """Kiểm tra có sử dụng S3 storage không"""
    try:
        settings = frappe.get_single("Drive S3 Settings")
        has_s3 = bool(settings.get("bucket") and settings.get("aws_key"))
        frappe.logger().info(f"S3 storage enabled: {has_s3}")
        return has_s3
    except Exception as e:
        frappe.logger().warning(f"Cannot check S3 settings: {e}")
        return False


@frappe.whitelist(allow_guest=False)
def save_document():
    """
    Callback từ OnlyOffice khi save document
    """
    try:
        data = frappe.request.json or {}
        status = data.get("status")
        key = data.get("key")

        frappe.logger().info(f"=== OnlyOffice callback received ===")
        frappe.logger().info(f"Status: {status}")
        frappe.logger().info(f"Key: {key}")
        frappe.logger().info(f"Full data: {data}")

        # Verify JWT token nếu có secret
        secret = frappe.conf.get("onlyoffice_jwt_secret")
        if secret:
            auth_header = frappe.request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header[7:]
                try:
                    jwt.decode(token, secret, algorithms=["HS256"])
                    frappe.logger().info("✅ JWT token verified")
                except jwt.InvalidTokenError as e:
                    frappe.logger().error(f"❌ Invalid JWT token: {str(e)}")
                    return {"error": 1, "message": "Invalid token"}
            else:
                frappe.logger().warning("⚠️  No Authorization header in callback")

        # Status codes:
        # 1 = editing
        # 2 = ready to save
        # 3 = save error
        # 4 = closed no changes
        # 6 = editing/force save

        if status in [2, 6]:  # Ready to save
            download_url = data.get("url")

            # Extract entity name from key (remove timestamp)
            entity_name = key.split("_")[0] if "_" in key else key

            frappe.logger().info(f"💾 Saving document: {entity_name}")
            frappe.logger().info(f"   Download URL: {download_url}")

            if not entity_name or not download_url:
                frappe.logger().error("❌ Missing key or download URL")
                return {"error": 1, "message": "Missing key or url"}

            # Check permission
            if not frappe.has_permission("Drive File", doc=entity_name, ptype="write"):
                frappe.logger().warning(f"❌ Unauthorized save attempt for {entity_name}")
                return {"error": 1, "message": "No permission"}

            try:
                # Download file from OnlyOffice
                frappe.logger().info(f"📥 Downloading from OnlyOffice...")
                response = requests.get(download_url, timeout=60)

                if response.status_code == 200:
                    frappe.logger().info(f"✅ Downloaded {len(response.content)} bytes")

                    # Get Drive File info
                    drive_file = frappe.get_value(
                        "Drive File",
                        {"name": entity_name},
                        ["path", "title", "mime_type", "file_size"],
                        as_dict=1,
                    )

                    if not drive_file:
                        frappe.logger().error(f"❌ Drive File not found: {entity_name}")
                        return {"error": 1, "message": "File not found"}

                    frappe.logger().info(f"   File path: {drive_file['path']}")

                    # Save to storage
                    file_content = response.content
                    if is_s3_storage():
                        frappe.logger().info("💾 Saving to S3...")
                        save_to_s3(entity_name, drive_file["path"], file_content)
                    else:
                        frappe.logger().info("💾 Saving to local storage...")
                        save_to_local(entity_name, drive_file["path"], file_content)

                    # Update metadata
                    frappe.db.set_value(
                        "Drive File",
                        entity_name,
                        {"modified": datetime.now(), "file_size": len(file_content)},
                    )
                    frappe.db.commit()

                    frappe.logger().info(f"✅ Document saved successfully: {entity_name}")
                    return {"error": 0}
                else:
                    frappe.logger().error(f"❌ Download failed: HTTP {response.status_code}")
                    return {"error": 1, "message": f"HTTP {response.status_code}"}

            except requests.RequestException as e:
                frappe.logger().error(f"❌ Error downloading from OnlyOffice: {str(e)}")
                return {"error": 1, "message": "Download failed"}

        # For other statuses, return success
        frappe.logger().info(f"ℹ️  Status {status} - no action needed")
        return {"error": 0}

    except Exception as e:
        frappe.logger().error(f"❌ Error in save_document: {str(e)}", exc_info=True)
        return {"error": 1, "message": str(e)}


def save_to_s3(entity_name, s3_key, file_content):
    """Upload file content to S3"""
    try:
        import boto3

        settings = frappe.get_single("Drive S3 Settings")

        s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.aws_key,
            aws_secret_access_key=settings.aws_secret,
            region_name=settings.region or "us-east-1",
        )

        s3_client.put_object(
            Bucket=settings.bucket,
            Key=s3_key,
            Body=file_content,
            ContentType="application/octet-stream",
        )

        frappe.logger().info(f"✅ Uploaded to S3: {s3_key}")

    except Exception as e:
        frappe.logger().error(f"❌ Error uploading to S3: {str(e)}")
        raise


def save_to_local(entity_name, file_path, file_content):
    """Save file content to local storage"""
    try:
        import os

        # Get site directory
        sites_path = frappe.get_site_path()

        # Clean path
        if file_path.startswith("/"):
            file_path = file_path[1:]

        full_path = os.path.join(sites_path, file_path)

        frappe.logger().info(f"   Full path: {full_path}")

        # Create directory
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        # Write file
        with open(full_path, "wb") as f:
            f.write(file_content)

        frappe.logger().info(f"✅ Saved to local: {full_path}")

    except Exception as e:
        frappe.logger().error(f"❌ Error saving local file: {str(e)}")
        raise
