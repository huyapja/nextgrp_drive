import frappe
import jwt


ONLYOFFICE_CALLBACK_PATH = "/api/method/drive.api.onlyoffice.save_document"


def onlyoffice_auth():
    """Allow OnlyOffice callbacks that send Authorization: Bearer <jwt> headers.

    Frappe interprets every Authorization header as an API/OAuth credential and
    throws 401 before our endpoint can run. This hook intercepts those requests,
    verifies the OnlyOffice JWT (if configured), authenticates the call as Guest,
    and clears the Authorization header so the upstream auth pipeline does not
    reject it.
    """
    request = getattr(frappe.local, "request", None)
    if not request:
        return

    # Only allow POST callbacks to our endpoint
    if request.method != "POST":
        return

    if request.path != ONLYOFFICE_CALLBACK_PATH:
        return

    secret = frappe.conf.get("onlyoffice_jwt_secret")

    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]

    # Fallback to JSON/body token (OnlyOffice also sends token in payload)
    if not token:
        token = frappe.local.form_dict.get("token")

    if secret and token:
        try:
            jwt.decode(token, secret, algorithms=["HS256"])
        except jwt.InvalidTokenError as err:
            frappe.logger().error(f"OnlyOffice auth token invalid: {err}")
            return
    else:
        frappe.logger().warning(
            "OnlyOffice callback without token or secret; allowing as Guest"
        )

    # Prevent downstream auth from treating Authorization header as OAuth token
    if "HTTP_AUTHORIZATION" in request.headers.environ:
        request.headers.environ["HTTP_AUTHORIZATION"] = ""

    frappe.set_user("Guest")
    return True

