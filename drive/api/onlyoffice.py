import frappe
import jwt
from datetime import datetime
import requests
from frappe.utils.background_jobs import enqueue
import hashlib
import json


@frappe.whitelist()
def get_onlyoffice_url():
    """
    Lấy URL OnlyOffice từ cấu hình
    """
    onlyoffice_url = frappe.conf.get("onlyoffice_url")
    if not onlyoffice_url:
        return "https://onlyoffice.nextgrp.vn/"
    return onlyoffice_url.rstrip("/")


@frappe.whitelist()
def get_editor_config(entity_name):
    """
    Build OnlyOffice editor config with optimized settings for smooth collaboration
    """
    try:
        print(f"=== Getting editor config for: {entity_name} ===")

        entity = frappe.get_doc("Drive File", entity_name)

        if not frappe.has_permission("Drive File", doc=entity_name, ptype="read"):
            frappe.throw("You do not have permission to access this file")

        # Get file URL
        file_url = None

        if is_s3_storage():
            try:
                from drive.api.files import get_file_signed_url

                result = get_file_signed_url(entity_name)
                file_url = result.get("signed_url")
                print(f"Using S3 signed URL: {file_url[:50]}...")
            except Exception as err:
                frappe.logger().warning(f"S3 URL failed, using API URL: {err}")

        if not file_url:
            site_url = get_accessible_site_url()
            file_url = (
                f"{site_url}/api/method/drive.api.files.get_file_content?entity_name={entity_name}"
            )

        print(f"📎 Final file URL: {file_url}")

        file_ext = entity.title.split(".")[-1].lower() if entity.title else "txt"
        document_type = get_document_type(file_ext)

        # Callback URL for saving
        callback_url = f"{get_accessible_site_url()}/api/method/drive.api.onlyoffice.save_document"
        # callback_url = (
        #     "https://8d1c129261f4.ngrok-free.app/api/method/drive.api.onlyoffice.save_document"
        # )

        # Build config với các tối ưu cho collaborative editing
        config = {
            "documentType": document_type,
            "document": {
                "title": entity.title or entity.name,
                "url": file_url,
                "fileType": file_ext,
                "key": generate_document_key(entity),  # Key thông minh hơn
                "permissions": {
                    "edit": has_edit_permission(entity_name),
                    "download": True,
                    "print": True,
                    "review": True,
                    "comment": True,
                    "fillForms": True,
                    "modifyFilter": True,
                    "modifyContentControl": True,
                },
            },
            "editorConfig": {
                "mode": "edit",
                "lang": "vi",
                "callbackUrl": callback_url,  # QUAN TRỌNG: Callback để lưu
                "user": {
                    "id": frappe.session.user,
                    "name": frappe.db.get_value("User", frappe.session.user, "full_name")
                    or frappe.session.user,
                },
                "customization": {
                    "autosave": True,  # Tự động lưu
                    "autosaveTimeout": 30000,  # Lưu mỗi 30s (thay vì 5 phút mặc định)
                    "forcesave": True,  # Bật force save
                    "compactToolbar": False,
                    "feedback": False,
                    "about": False,
                    "chat": True,  # Bật chat cho collaboration
                    "comments": True,  # Bật comments
                    "plugins": True,
                },
                "coEditing": {
                    "mode": "fast",  # "fast" mode cho real-time collaboration
                    "change": True,  # Hiển thị changes của users khác
                },
            },
        }

        # Generate JWT token
        secret = frappe.conf.get("onlyoffice_jwt_secret")
        if secret:
            try:
                token = jwt.encode(config, secret, algorithm="HS256")
                config["token"] = token if isinstance(token, str) else token.decode()
                print(f"🔐 Generated JWT token")
            except Exception as e:
                print(f"❌ Error generating JWT token: {e}")
                frappe.throw(f"Lỗi tạo JWT token: {str(e)}")
        else:
            frappe.logger().warning("⚠️  OnlyOffice JWT secret NOT configured!")

        print(f"✅ Config generated successfully for {entity_name}")

        return config

    except Exception as e:
        print(f"❌ Error in get_editor_config: {str(e)}", exc_info=True)
        frappe.throw(f"Lỗi khi tải config: {str(e)}")


@frappe.whitelist(allow_guest=True)
def save_document():
    """
    OnlyOffice callback handler - CRITICAL: Must return {"error": 0} or {"error": 1}
    """
    try:
        # Log raw request for debugging
        data = frappe.request.json or {}
        status = data.get("status")
        key = data.get("key")
        url = data.get("url")

        # Status meanings:
        # 0 - NotFound (document not found)
        # 1 - Editing (document being edited)
        # 2 - MustSave (document ready for saving)
        # 3 - Corrupted (document saving error)
        # 4 - Closed (document closed with no changes)
        # 6 - MustForceSave (force save initiated)
        # 7 - CorruptedForceSave (error during force save)

        # Status 1: Editing - just acknowledge
        if status == 1:
            return {"error": 0}

        # Status 4: Closed without changes
        if status == 4:
            return {"error": 0}

        # Status 2 or 6: Save required
        if status in [2, 6]:
            if not url:
                return {"error": 1}

            entity_name = extract_entity_from_key(key)

            if not entity_name:
                return {"error": 1}

            try:
                # Get document owner to set proper permissions
                doc = frappe.get_doc("Drive File", entity_name)

                # CRITICAL: Switch to document owner context
                frappe.set_user(doc.owner)
                # Verify write permission
                if not frappe.has_permission("Drive File", doc=entity_name, ptype="write"):
                    return {"error": 1}

                # Status 2: Save synchronously (document closed)
                if status == 2:
                    success = save_document_sync(entity_name, url, key)
                    if success:
                        return {"error": 0}
                    else:
                        return {"error": 1}
                # Status 6: Force save - can be async
                else:
                    enqueue(
                        save_document_async,
                        queue="default",
                        timeout=300,
                        entity_name=entity_name,
                        download_url=url,
                        key=key,
                        is_force_save=True,
                    )
                    return {"error": 0}

            except Exception as e:
                return {"error": 1}

        # Status 3 or 7: Error
        if status in [3, 7]:
            return {"error": 1}

        return {"error": 0}

    except Exception as e:
        return {"error": 1}


@frappe.whitelist()
def force_save_document(entity_name):
    """
    API để frontend chủ động trigger force save
    OnlyOffice sẽ gọi callback với status = 6
    """
    try:
        print(f"🔄 Force save requested for: {entity_name}")

        # Check permission
        # if not frappe.has_permission("Drive File", doc=entity_name, ptype="write"):
        #     frappe.throw("You do not have permission to save this file")

        # Verify file exists
        if not frappe.db.exists("Drive File", entity_name):
            frappe.throw("File not found")

        # Return success - OnlyOffice sẽ tự động trigger callback
        return {
            "success": True,
            "message": "Force save triggered",
            "timestamp": datetime.now().isoformat(),
        }

    except Exception as e:
        print(f"❌ Error in force_save_document: {str(e)}")
        frappe.throw(str(e))


@frappe.whitelist()
def get_document_status(entity_name):
    """
    API để frontend kiểm tra trạng thái document
    Trả về thông tin về file và active sessions
    """
    try:
        # Check permission
        if not frappe.has_permission("Drive File", doc=entity_name, ptype="read"):
            frappe.throw("You do not have permission to access this file")

        # Get file info
        file_info = frappe.get_value(
            "Drive File",
            entity_name,
            ["name", "title", "file_size", "modified", "owner"],
            as_dict=1,
        )

        if not file_info:
            frappe.throw("File not found")

        # Get active editing sessions (nếu có tracking)
        # TODO: Implement session tracking nếu cần

        return {
            "success": True,
            "file": {
                "name": file_info.name,
                "title": file_info.title,
                "size": file_info.file_size,
                "modified": file_info.modified.isoformat() if file_info.modified else None,
                "owner": file_info.owner,
            },
            "status": "available",
            "timestamp": datetime.now().isoformat(),
        }

    except Exception as e:
        print(f"❌ Error in get_document_status: {str(e)}")
        frappe.throw(str(e))


@frappe.whitelist()
def close_document(entity_name):
    """
    API được gọi khi user đóng document
    Đảm bảo tất cả thay đổi đã được lưu
    """
    try:
        print(f"📪 Close document requested: {entity_name}")

        # Check permission
        if not frappe.has_permission("Drive File", doc=entity_name, ptype="read"):
            frappe.throw("You do not have permission to access this file")

        # Get current file state
        file_info = frappe.get_value(
            "Drive File", entity_name, ["name", "title", "modified"], as_dict=1
        )

        if not file_info:
            frappe.throw("File not found")

        # Log activity
        print(f"✅ Document closed: {entity_name}")

        return {
            "success": True,
            "message": "Document closed successfully",
            "last_modified": file_info.modified.isoformat() if file_info.modified else None,
        }

    except Exception as e:
        print(f"❌ Error in close_document: {str(e)}")
        frappe.throw(str(e))


def generate_document_key(entity):
    """
    Tạo document key thông minh:
    - Dùng modified timestamp để track versions
    - Thêm hash để tránh conflict
    """
    import time

    timestamp = int(entity.modified.timestamp())
    hash_part = hashlib.md5(f"{entity.name}{timestamp}".encode()).hexdigest()[:8]
    return f"{entity.name}_{timestamp}_{hash_part}"


def has_edit_permission(entity_name):
    """Kiểm tra quyền edit"""
    return frappe.has_permission("Drive File", doc=entity_name, ptype="write")


def extract_entity_from_key(key):
    """
    Extract entity name from OnlyOffice key
    Format: entityname_timestamp_hash
    """
    if not key:
        return None

    parts = key.split("_")
    if len(parts) >= 1:
        return parts[0]

    return None


def save_document_sync(entity_name, download_url, key):
    """
    Save document synchronously (for status 2 - document closed)
    Based on OnlyOffice example code
    """
    print(f"💾 save_document_sync START: {entity_name}")

    try:
        # Download file from OnlyOffice
        print(f"📥 Downloading from: {download_url}")
        response = requests.get(download_url, timeout=30)
        response.raise_for_status()

        file_content = response.content
        print(f"✅ Downloaded {len(file_content)} bytes")

        # Get Drive File info
        drive_file = frappe.get_value(
            "Drive File",
            {"name": entity_name},
            ["path", "title", "mime_type"],
            as_dict=1,
        )

        if not drive_file:
            print(f"❌ Drive File not found: {entity_name}")
            frappe.throw("Drive File not found")

        print(f"📄 File: {drive_file['title']}")

        # Save to storage
        if is_s3_storage():
            print("💿 Saving to S3...")
            save_to_s3(entity_name, drive_file["path"], file_content)
        else:
            print("💿 Saving to local storage...")
            save_to_local(entity_name, drive_file["path"], file_content)

        # Update metadata
        frappe.db.set_value(
            "Drive File",
            entity_name,
            {
                "modified": datetime.now(),
                "file_size": len(file_content),
            },
            update_modified=True,
        )
        frappe.db.commit()

        print(f"✅ Document saved successfully: {entity_name}")

    except requests.RequestException as e:
        print(f"❌ Download error: {str(e)}", exc_info=True)
        frappe.db.rollback()
        raise
    except Exception as e:
        print(f"❌ Save error: {str(e)}", exc_info=True)
        frappe.db.rollback()
        raise


def save_document_async(entity_name, download_url, key, is_force_save=False):
    """
    Async wrapper for background processing (status 6)
    """
    print(f"🔄 Async save START: {entity_name} (force={is_force_save})")

    try:
        save_document_sync(entity_name, download_url, key)
        print(f"✅ Async save completed: {entity_name}")
    except Exception as e:
        print(f"❌ Async save failed: {str(e)}", exc_info=True)


def get_accessible_site_url():
    """Get the site URL accessible by OnlyOffice"""

    # Lấy domain từ request hiện tại
    try:
        if frappe.request:
            # Lấy scheme (http/https) và host từ request
            scheme = frappe.request.scheme
            host = frappe.request.host
            manual_url = f"{scheme}://{host}"
            return manual_url.rstrip("/")
    except:
        pass

    # Fallback: lấy từ site_config nếu có
    manual_url = frappe.conf.get("onlyoffice_callback_url")
    if manual_url:
        return manual_url.rstrip("/")

    site_url = frappe.utils.get_url()

    if "localhost" in site_url or "127.0.0.1" in site_url:
        import socket

        hostname = socket.gethostname()
        try:
            local_ip = socket.gethostbyname(hostname)
            site_url = site_url.replace("localhost", local_ip).replace("127.0.0.1", local_ip)
        except:
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.connect(("8.8.8.8", 80))
                local_ip = s.getsockname()[0]
                s.close()
                site_url = site_url.replace("localhost", local_ip).replace("127.0.0.1", local_ip)
            except:
                pass

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
    """Kiểm tra S3 storage"""
    try:
        settings = frappe.get_single("Drive S3 Settings")
        return bool(settings.get("bucket") and settings.get("aws_key"))
    except:
        return False


def save_to_s3(entity_name, s3_key, file_content):
    """
    Upload to S3 with optimizations:
    - Multipart upload for large files
    - Proper content type
    - Server-side encryption
    """
    try:
        import boto3
        from botocore.config import Config

        settings = frappe.get_single("Drive S3 Settings")

        # Configure with retry and timeout
        config = Config(
            retries={"max_attempts": 3, "mode": "standard"},
            signature_version=settings.signature_version or "s3",  # THÊM
            s3={"addressing_style": "path"},
            connect_timeout=5,
            read_timeout=30,
        )

        s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.aws_key,
            aws_secret_access_key=settings.get_password("aws_secret"),
            endpoint_url=settings.endpoint_url,  # THÊM
            config=config,
        )

        file_size = len(file_content)
        print(f"📤 Uploading to S3: {file_size} bytes")

        # Use multipart upload for files > 5MB
        if file_size > 5 * 1024 * 1024:  # 5MB
            print("📦 Using multipart upload for large file")

            # Create multipart upload
            mpu = s3_client.create_multipart_upload(
                Bucket=settings.bucket, Key=s3_key, ServerSideEncryption="AES256"
            )

            upload_id = mpu["UploadId"]
            parts = []
            chunk_size = 5 * 1024 * 1024  # 5MB chunks
            part_number = 1

            for i in range(0, file_size, chunk_size):
                chunk = file_content[i : i + chunk_size]

                part = s3_client.upload_part(
                    Bucket=settings.bucket,
                    Key=s3_key,
                    PartNumber=part_number,
                    UploadId=upload_id,
                    Body=chunk,
                )

                parts.append({"PartNumber": part_number, "ETag": part["ETag"]})

                part_number += 1

            # Complete multipart upload
            s3_client.complete_multipart_upload(
                Bucket=settings.bucket,
                Key=s3_key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts},
            )

            print(f"✅ Multipart upload completed: {len(parts)} parts")
        else:
            # Single put for small files
            s3_client.put_object(
                Bucket=settings.bucket,
                Key=s3_key,
                Body=file_content,
                ContentType="application/octet-stream",
                ServerSideEncryption="AES256",
            )

            print(f"✅ Single upload completed")

        print(f"✅ Uploaded to S3: {s3_key}")

    except Exception as e:
        print(f"❌ S3 upload error: {str(e)}")
        # Log more details for debugging
        print(f"   Bucket: {settings.bucket}")
        print(f"   Key: {s3_key}")
        print(f"   Size: {len(file_content)} bytes")
        raise


def save_to_local(entity_name, file_path, file_content):
    """Save to local storage"""
    try:
        import os

        sites_path = frappe.get_site_path()

        if file_path.startswith("/"):
            file_path = file_path[1:]

        full_path = os.path.join(sites_path, file_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        with open(full_path, "wb") as f:
            f.write(file_content)

        print(f"✅ Saved to local: {full_path}")
    except Exception as e:
        print(f"❌ Local save error: {str(e)}")
        raise
