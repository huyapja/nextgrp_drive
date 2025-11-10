import frappe
import jwt
import json
import hashlib
from frappe import _


@frappe.whitelist()
def get_editor_config(entity_name):
    """Generate OnlyOffice editor configuration for a file"""

    # Get file info from Drive
    entity = frappe.get_doc("Drive File", entity_name)

    if not entity.is_group and entity.file_size:
        file_url = get_file_url(entity)

        config = {
            "document": {
                "fileType": get_file_extension(entity.title),
                "key": generate_file_key(entity_name, entity.modified),
                "title": entity.title,
                "url": file_url,
                "permissions": {
                    "edit": has_write_access(entity_name),
                    "download": True,
                    "print": True,
                    "review": True,
                },
            },
            "documentType": get_document_type(entity.title),
            "editorConfig": {
                "mode": "edit" if has_write_access(entity_name) else "view",
                "lang": frappe.local.lang or "en",
                "user": {
                    "id": frappe.session.user,
                    "name": frappe.get_value("User", frappe.session.user, "full_name"),
                },
                "customization": {"autosave": True, "forcesave": True},
                "callbackUrl": get_callback_url(entity_name),
            },
        }

        # Add JWT token if configured
        jwt_secret = frappe.conf.get("onlyoffice_jwt_secret")
        if jwt_secret:
            config["token"] = jwt.encode(config, jwt_secret, algorithm="HS256")

        return config

    frappe.throw(_("Invalid file"))


def get_file_url(entity):
    """Get full URL to the file"""
    site_url = frappe.utils.get_url()
    file_path = f"/api/method/drive.api.files.get_file_content?entity_name={entity.name}"

    if file_path.startswith("http"):
        return file_path

    return f"{site_url}{file_path}"


def get_document_type(filename):
    """Determine document type based on extension"""
    ext = get_file_extension(filename)

    if ext in [
        "doc",
        "docx",
        "odt",
        "txt",
        "rtf",
        "html",
        "htm",
        "mht",
        "pdf",
        "djvu",
        "fb2",
        "epub",
        "xps",
    ]:
        return "word"
    elif ext in ["xls", "xlsx", "ods", "csv"]:
        return "cell"
    elif ext in ["ppt", "pptx", "odp"]:
        return "slide"

    return "word"


def get_file_extension(filename):
    """Get file extension"""
    return filename.split(".")[-1].lower() if "." in filename else ""


def generate_file_key(entity_name, modified):
    """Generate unique key for file versioning"""
    key_string = f"{entity_name}-{modified}"
    return hashlib.md5(key_string.encode()).hexdigest()


def has_write_access(entity_name):
    """Check if user has write permission"""
    return frappe.has_permission("Drive File", "write", entity_name)


def get_callback_url(entity_name):
    """URL for OnlyOffice to send save callbacks"""
    site_url = frappe.utils.get_url()
    return f"{site_url}/api/method/drive.api.onlyoffice.save_callback?entity_name={entity_name}"


@frappe.whitelist(allow_guest=True)
def save_callback(entity_name):
    """Handle document save callback from OnlyOffice"""

    # Verify JWT token
    jwt_secret = frappe.conf.get("onlyoffice_jwt_secret")
    if jwt_secret:
        token = frappe.get_request_header("Authorization")
        if token:
            try:
                token = token.replace("Bearer ", "")
                jwt.decode(token, jwt_secret, algorithms=["HS256"])
            except:
                frappe.throw(_("Invalid token"))

    try:
        data = json.loads(frappe.request.data)
        status = data.get("status")

        # Status 2 means document is ready for saving
        # Status 6 means document is being edited
        if status in [2, 6]:
            download_url = data.get("url")

            if download_url and status == 2:
                # Download the file from OnlyOffice
                import requests

                response = requests.get(download_url)

                if response.status_code == 200:
                    # Save to Drive File
                    entity = frappe.get_doc("Drive File", entity_name)

                    # Update file content
                    file_doc = frappe.get_doc("File", {"file_url": entity.file_url})
                    file_doc.save_file_on_filesystem(
                        response.content, entity.title, is_private=entity.is_private
                    )

                    # Update modified timestamp
                    entity.db_set("modified", frappe.utils.now())

                    frappe.db.commit()

        return {"error": 0}

    except Exception as e:
        frappe.log_error(f"OnlyOffice callback error: {str(e)}", "OnlyOffice Save Callback")
        return {"error": 1, "message": str(e)}


@frappe.whitelist()
def get_supported_formats():
    """Return list of file formats supported by OnlyOffice"""
    return {
        "word": ["doc", "docx", "odt", "txt", "rtf", "html", "htm"],
        "cell": ["xls", "xlsx", "ods", "csv"],
        "slide": ["ppt", "pptx", "odp"],
    }
