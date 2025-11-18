import frappe
import json
from werkzeug.wrappers import Response

__version__ = "0.0.1"


def patch_onlyoffice_response():
    """Patch Frappe to unwrap OnlyOffice responses"""
    import frappe.utils.response

    original_as_json = frappe.utils.response.as_json

    def custom_as_json():
        """Custom JSON handler that unwraps OnlyOffice responses"""
        # Check if this is OnlyOffice callback
        if frappe.request and hasattr(frappe.request, "path"):
            path = str(frappe.request.path or "")

            if "onlyoffice.save_document" in path:
                # Get response
                response_data = frappe.local.response

                # Unwrap message
                if isinstance(response_data, dict) and "message" in response_data:
                    unwrapped = response_data["message"]

                    # Create proper Response object
                    json_str = json.dumps(unwrapped)

                    return Response(
                        json_str,
                        status=200,
                        content_type="application/json",
                        direct_passthrough=False,
                    )

        # Use original for other endpoints
        return original_as_json()

    # Apply patch
    frappe.utils.response.as_json = custom_as_json


# Apply patch on module load
patch_onlyoffice_response()
