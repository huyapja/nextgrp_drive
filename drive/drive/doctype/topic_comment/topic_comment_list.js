// Copyright (c) 2025, Hainam Tech and contributors
// For license information, please see license.txt

frappe.listview_settings['Topic Comment'] = {
    add_fields: ["title", "reference_doctype", "reference_name"],
    get_indicator: function(doc) {
        return [__(doc.status), {
            "Open": "red",
            "Closed": "green",
            "Pending": "orange",
        }[doc.status], "status,=," + doc.status];
    }
};