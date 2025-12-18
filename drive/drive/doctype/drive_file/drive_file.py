from drive.api.notifications import notify_share
import frappe
from frappe.model.document import Document
from pathlib import Path
import shutil
from drive.utils.files import (
    get_home_folder,
    get_new_title,
    get_team_thumbnails_directory,
    update_file_size,
    FileManager,
)
from drive.api.files import get_ancestors_of
from drive.utils.files import generate_upward_path
from drive.api.activity import create_new_activity_log, create_new_entity_activity_log
from drive.api.permissions import user_has_permission
from drive.api.onlyoffice import revoke_editing_access


class DriveFile(Document):
    def after_insert(self):
        full_name = frappe.db.get_value(
            "User", {"name": frappe.session.user}, ["full_name"]
        )
        message = f"{full_name} created {self.title}"
        create_new_activity_log(
            entity=self.name,
            last_interaction=frappe.utils.now(),
            user=frappe.session.user,
        )

    def on_trash(self):
        frappe.db.delete("Drive Favourite", {"entity": self.name})
        frappe.db.delete("Drive Entity Log", {"entity_name": self.name})
        frappe.db.delete("Drive Permission", {"entity": self.name})
        frappe.db.delete("Drive Notification", {"notif_doctype_name": self.name})
        frappe.db.delete("Drive Entity Activity Log", {"entity": self.name})

        if self.is_group or self.document:
            for child in self.get_children():
                has_write_access = frappe.has_permission(
                    doctype="Drive File",
                    doc=self,
                    ptype="write",
                    user=frappe.session.user,
                )
                child.delete(ignore_permissions=has_write_access)

    def after_delete(self):
        """Cleanup after entity is deleted"""
        if self.document:
            frappe.delete_doc("Drive Document", self.document)

        if self.path:
            manager = FileManager()
            manager.delete_file(self.team, self.name, self.path)

    def on_rollback(self):
        if self.flags.file_created:
            shutil.rmtree(self.path) if self.is_group else self.path.unlink()

    def get_children(self):
        """Return a generator that yields child Documents."""
        child_names = frappe.get_list(
            self.doctype, filters={"parent_entity": self.name}, pluck="name"
        )
        for name in child_names:
            yield frappe.get_doc(self.doctype, name)

    def move(self, new_parent=None, is_private=None, team=None):
        def get_user_directory():
            """Get the user's personal home directory"""
            user = frappe.session.user
            home_folder = frappe.db.get_value(
                "Drive File",
                filters={
                    "owner": user,
                    "is_group": 1,
                    "parent_entity": None,
                },
                fieldname="name",
            )
            if home_folder:
                return frappe.get_doc("Drive File", home_folder)
            return None

        print(
            f"Move called with new_parent={new_parent}, is_private={is_private}, team={team}"
        )

        if not (new_parent and new_parent.strip()):
            if team:
                print(f"No new_parent, using team parameter: {team}")
                team_home_folder = get_home_folder(team)
                if team_home_folder:
                    new_parent = team_home_folder.name
                    print(f"Found team home folder: {new_parent} for team: {team}")
                else:
                    frappe.throw(f"Cannot find home folder for team {team}")
            elif is_private == 1:
                print("Moving to personal folder (is_private=1)")
                user_home_folder = get_user_directory()
                if user_home_folder:
                    new_parent = user_home_folder.name
                    print(f"Found user home folder: {new_parent}")
                else:
                    frappe.throw("Cannot find user home folder")
            else:
                new_parent = get_home_folder(self.team).name
                print(f"Using current team home folder: {new_parent}")

        new_parent_team = frappe.db.get_value("Drive File", new_parent, "team")
        current_team = self.team

        print(
            f"Move debug: current_team={current_team}, new_parent_team={new_parent_team}, new_parent={new_parent}"
        )

        # Hàm helper để xóa tất cả permissions
        def delete_all_permissions(entity_name, include_children=False):
            """Xóa tất cả permissions của file và file con (nếu có)"""
            # Xóa permission của file chính
            frappe.db.sql(
                """
                DELETE FROM `tabDrive Permission`
                WHERE entity = %s
                """,
                entity_name,
            )

            # Nếu cần xóa permission của file con
            if include_children:

                def get_all_descendants(parent_name):
                    """Lấy tất cả file con và file cháu đệ quy"""
                    descendants = []
                    direct_children = frappe.db.get_all(
                        "Drive File",
                        filters={"parent_entity": parent_name},
                        fields=["name", "is_group"],
                    )
                    for child in direct_children:
                        descendants.append(child.name)
                        if child.is_group:
                            descendants.extend(get_all_descendants(child.name))
                    return descendants

                child_names = get_all_descendants(entity_name)
                if child_names:
                    frappe.db.sql(
                        """
                        DELETE FROM `tabDrive Permission`
                        WHERE entity IN %(children)s
                        """,
                        {"children": child_names},
                    )

        print(
            f"Clearing permissions: is_private={is_private}, team change={current_team} != {new_parent_team}"
        )
        # if new_parent == self.parent_entity:
        # **LUÔN XÓA PERMISSIONS** khi có thay đổi is_private hoặc team
        should_clear_permissions = (
            self.is_private != is_private  # Có thay đổi private status
            or current_team != new_parent_team  # Hoặc có chuyển team
        )

        if should_clear_permissions:
            print(
                f"Clearing permissions: is_private={is_private}, team change={current_team} != {new_parent_team}"
            )
            delete_all_permissions(self.name, include_children=self.is_group)

            # Cập nhật team cho file con nếu cần
            if self.is_group and current_team != new_parent_team:

                def get_all_descendants(parent_name):
                    descendants = []
                    direct_children = frappe.db.get_all(
                        "Drive File",
                        filters={"parent_entity": parent_name},
                        fields=["name", "is_group"],
                    )
                    for child in direct_children:
                        descendants.append(child.name)
                        if child.is_group:
                            descendants.extend(get_all_descendants(child.name))
                    return descendants

                child_names = get_all_descendants(self.name)
                if child_names:
                    frappe.db.sql(
                        """
                        UPDATE `tabDrive File`
                        SET team = %(team)s
                        WHERE name IN %(children)s
                        """,
                        {"team": new_parent_team, "children": child_names},
                    )

            if current_team != new_parent_team:
                self.team = new_parent_team

            if is_private is not None:
                self.is_private = int(is_private)

            self.save()

        result = frappe.get_value(
            "Drive File",
            self.parent_entity,
            ["title", "team", "name", "is_private"],
            as_dict=True,
        )
        result["is_private"] = self.is_private

        if new_parent == self.name:
            frappe.throw(
                "Cannot move into itself",
                frappe.PermissionError,
            )

        is_group = frappe.db.get_value("Drive File", new_parent, "is_group")
        if not is_group:
            raise NotADirectoryError()

        for child in self.get_children():
            if child.name == self.name or child.name == new_parent:
                frappe.throw(
                    "Cannot move into itself",
                    frappe.PermissionError,
                )
                return frappe.get_value(
                    "Drive File",
                    self.parent_entity,
                    ["title", "team", "name", "is_private"],
                    as_dict=True,
                )

        update_file_size(self.parent_entity, -self.file_size)
        update_file_size(new_parent, +self.file_size)

        will_change_team = current_team != new_parent_team
        print(
            f"Will change team: {will_change_team}, Current: {current_team}, New: {new_parent_team}"
        )

        # **THAY ĐỔI CHÍNH:** Luôn xóa permissions khi di chuyển file
        # delete_all_permissions(self.name, include_children=self.is_group)

        # Cập nhật team nếu cần
        if will_change_team:
            if self.is_group:

                def get_all_descendants(parent_name):
                    descendants = []
                    direct_children = frappe.db.get_all(
                        "Drive File",
                        filters={"parent_entity": parent_name},
                        fields=["name", "is_group"],
                    )
                    for child in direct_children:
                        descendants.append(child.name)
                        if child.is_group:
                            descendants.extend(get_all_descendants(child.name))
                    return descendants

                child_names = get_all_descendants(self.name)
                if child_names:
                    frappe.db.sql(
                        """
                        UPDATE `tabDrive File`
                        SET team = %(team)s
                        WHERE name IN %(children)s
                        """,
                        {"team": new_parent_team, "children": child_names},
                    )

            self.team = new_parent_team

        # Cập nhật thông tin file
        self.parent_entity = new_parent

        if is_private is not None:
            self.is_private = int(is_private)
        else:
            self.is_private = frappe.db.get_value(
                "Drive File", new_parent, "is_private"
            )

        self.save()

        print(f"Final save: team={self.team}, parent={self.parent_entity}")

        result = frappe.get_value(
            "Drive File",
            self.parent_entity,
            ["title", "team", "name", "is_private"],
            as_dict=True,
        )
        result["is_private"] = self.is_private
        return result

    @frappe.whitelist()
    def copy(self, new_parent=None, parent_user_directory=None):
        """
        Copy file or folder along with its contents to the new parent folder

        :param new_parent: Document-name of the new parent folder. Defaults to the user directory
        :raises NotADirectoryError: If the new_parent is not a folder, or does not exist
        :raises FileExistsError: If a file or folder with the same name already exists in the specified parent folder
        """
        title = self.title

        if not parent_user_directory:
            parent_owner = (
                frappe.db.get_value("Drive File", new_parent, "owner")
                if new_parent
                else frappe.session.user
            )
            # BROKEN - parent dir is team
            new_parent = new_parent or parent_user_directory.name
            parent_is_group = frappe.db.get_value("Drive File", new_parent, "is_group")
            if not parent_is_group:
                raise NotADirectoryError()
            if not frappe.has_permission(
                doctype="Drive File",
                doc=new_parent,
                ptype="write",
                user=frappe.session.user,
            ):
                frappe.throw(
                    "Cannot paste to this folder due to insufficient permissions",
                    frappe.PermissionError,
                )
            if self.name == new_parent or self.name in get_ancestors_of(
                "Drive File", new_parent
            ):
                frappe.throw("You cannot copy a folder into itself")

            title = get_new_title(title, new_parent)

        if self.is_group:
            drive_entity = frappe.get_doc(
                {
                    "doctype": "Drive File",
                    "name": name,
                    "title": title,
                    "is_group": 1,
                    "parent_entity": new_parent,
                    "color": self.color,
                }
            )
            drive_entity.insert()

            for child in self.get_children():
                child.copy(name, parent_user_directory)

        elif self.document is not None:
            drive_doc_content = frappe.db.get_list(
                "Drive Document", self.document, "content"
            )

            new_drive_doc = frappe.new_doc("Drive Document")
            new_drive_doc.title = title
            new_drive_doc.content = drive_doc_content
            new_drive_doc.save()

            drive_entity = frappe.get_doc(
                {
                    "doctype": "Drive File",
                    "name": name,
                    "title": title,
                    "mime_type": self.mime_type,
                    "parent_entity": new_parent,
                    "document": new_drive_doc,
                }
            )
            drive_entity.insert()

        else:
            save_path = Path(parent_user_directory.path) / f"{new_parent}_{title}"
            if save_path.exists():
                frappe.throw(f"File '{title}' already exists", FileExistsError)

            shutil.copy(self.path, save_path)

            path = save_path.parent / f"{name}{save_path.suffix}"
            save_path.rename(path)
            drive_entity = frappe.get_doc(
                {
                    "doctype": "Drive File",
                    "name": name,
                    "title": title,
                    "parent_entity": new_parent,
                    "path": path,
                    "file_size": self.file_size,
                    "file_ext": self.file_ext,
                    "mime_type": self.mime_type,
                }
            )
            drive_entity.flags.file_created = True
            drive_entity.insert()

        if new_parent == parent_user_directory.name:
            drive_entity.share(frappe.session.user, write=1, share=1)

        if drive_entity.mime_type:
            if drive_entity.mime_type.startswith(
                "image"
            ) or drive_entity.mime_type.startswith("video"):
                frappe.enqueue(
                    create_thumbnail,
                    queue="default",
                    timeout=None,
                    now=True,
                    # will set to false once reactivity in new UI is solved
                    entity_name=name,
                    path=path,
                    mime_type=drive_entity.mime_type,
                )

    @frappe.whitelist()
    def rename(self, new_title):
        """
        Rename file or folder

        :param new_title: New file or folder name
        :raises FileExistsError: If a file or folder with the same name already exists in the parent folder
        :return: DriveEntity doc once it's renamed
        """

        if new_title == self.title:
            return self

        # entity_exists = frappe.db.exists(
        #     {
        #         "doctype": "Drive File",
        #         "parent_entity": self.parent_entity,
        #         "title": new_title,
        #         "mime_type": self.mime_type,
        #         "is_group": self.is_group,
        #     }
        # )

        # Only exception
        # if entity_exists and new_title != "Untitled Document":
        #     suggested_name = get_new_title(new_title, self.parent_entity, folder=self.is_group)
        #     frappe.throw(
        #         f"{'Folder' if self.is_group else 'File'} '{new_title}' already exists\n Try '{suggested_name}' ",
        #         FileExistsError,
        #     )
        #     return suggested_name
        create_new_activity_log(
            entity=self.name,
            last_interaction=frappe.utils.now(),
            user=frappe.session.user,
        )
        create_new_entity_activity_log(entity=self.name, action_type="edit")

        # Title giờ là Text, không cần cắt nữa - dùng trực tiếp new_title

        # Retry logic để xử lý TimestampMismatchError khi có nhiều request đồng thời
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Reload document để lấy timestamp mới nhất
                self.reload()
                self.title = new_title
                self.save()

                # Nếu là mindmap, cũng update title của Drive Mindmap và node root
                if self.mime_type == "mindmap" and self.mindmap:
                    try:
                        import json

                        mindmap_doc = frappe.get_doc("Drive Mindmap", self.mindmap)
                        old_mindmap_title = mindmap_doc.title
                        mindmap_doc.title = new_title

                        # Cập nhật label của node root trong mindmap_data
                        if mindmap_doc.mindmap_data:
                            try:
                                mindmap_data = mindmap_doc.mindmap_data
                                if isinstance(mindmap_data, str):
                                    mindmap_data = json.loads(mindmap_data)

                                # Tìm và cập nhật node root
                                if (
                                    isinstance(mindmap_data, dict)
                                    and "nodes" in mindmap_data
                                ):
                                    for node in mindmap_data["nodes"]:
                                        if node.get("id") == "root":
                                            # Cập nhật label trong data
                                            if "data" in node and isinstance(
                                                node["data"], dict
                                            ):
                                                node["data"]["label"] = new_title
                                            # Cũng cập nhật label trực tiếp nếu có (backward compatibility)
                                            if "label" in node:
                                                node["label"] = new_title
                                            break

                                    # Lưu lại mindmap_data đã cập nhật
                                    mindmap_doc.mindmap_data = json.dumps(
                                        mindmap_data, ensure_ascii=False
                                    )
                                    print(
                                        f"✅ Updated root node label in mindmap_data: '{new_title}'"
                                    )
                            except Exception as e:
                                # Log error nhưng không throw để không ảnh hưởng đến rename
                                frappe.log_error(
                                    f"Error updating root node label: {str(e)}",
                                    "Rename Mindmap Root Node",
                                )
                                print(
                                    f"⚠️ Warning: Could not update root node label: {str(e)}"
                                )

                        mindmap_doc.save(ignore_permissions=True)
                        frappe.db.commit()
                        print(
                            f"✅ Updated Drive Mindmap title: '{old_mindmap_title}' → '{new_title}' (mindmap: {self.mindmap})"
                        )
                    except Exception as e:
                        # Log error nhưng không throw để không ảnh hưởng đến rename Drive File
                        frappe.log_error(
                            f"Error updating mindmap title: {str(e)}",
                            "Rename Mindmap Title",
                        )
                        print(f"❌ Error updating mindmap title: {str(e)}")

                return self
            except frappe.exceptions.TimestampMismatchError:
                if attempt < max_retries - 1:
                    # Đợi một chút trước khi retry
                    import time

                    time.sleep(0.1 * (attempt + 1))
                    continue
                else:
                    # Sau khi retry hết, dùng frappe.db.set_value như fallback
                    # để tránh vấn đề timestamp khi có nhiều request đồng thời
                    frappe.db.set_value(
                        "Drive File",
                        self.name,
                        "title",
                        new_title,
                        update_modified=True,
                    )
                    frappe.db.commit()
                    # Reload để lấy giá trị mới
                    self.reload()

                    # Nếu là mindmap, cũng update title của Drive Mindmap và node root
                    if self.mime_type == "mindmap" and self.mindmap:
                        try:
                            import json

                            mindmap_doc = frappe.get_doc("Drive Mindmap", self.mindmap)
                            old_mindmap_title = mindmap_doc.title
                            mindmap_doc.title = new_title

                            # Cập nhật label của node root trong mindmap_data
                            if mindmap_doc.mindmap_data:
                                try:
                                    mindmap_data = mindmap_doc.mindmap_data
                                    if isinstance(mindmap_data, str):
                                        mindmap_data = json.loads(mindmap_data)

                                    # Tìm và cập nhật node root
                                    if (
                                        isinstance(mindmap_data, dict)
                                        and "nodes" in mindmap_data
                                    ):
                                        for node in mindmap_data["nodes"]:
                                            if node.get("id") == "root":
                                                # Cập nhật label trong data
                                                if "data" in node and isinstance(
                                                    node["data"], dict
                                                ):
                                                    node["data"]["label"] = new_title
                                                # Cũng cập nhật label trực tiếp nếu có (backward compatibility)
                                                if "label" in node:
                                                    node["label"] = new_title
                                                break

                                        # Lưu lại mindmap_data đã cập nhật
                                        mindmap_doc.mindmap_data = json.dumps(
                                            mindmap_data, ensure_ascii=False
                                        )
                                        print(
                                            f"✅ Updated root node label in mindmap_data (fallback): '{new_title}'"
                                        )
                                except Exception as e:
                                    # Log error nhưng không throw để không ảnh hưởng đến rename
                                    frappe.log_error(
                                        f"Error updating root node label: {str(e)}",
                                        "Rename Mindmap Root Node",
                                    )
                                    print(
                                        f"⚠️ Warning: Could not update root node label (fallback): {str(e)}"
                                    )

                            mindmap_doc.save(ignore_permissions=True)
                            frappe.db.commit()
                            print(
                                f"✅ Updated Drive Mindmap title (fallback): '{old_mindmap_title}' → '{new_title}' (mindmap: {self.mindmap})"
                            )
                        except Exception as e:
                            # Log error nhưng không throw để không ảnh hưởng đến rename Drive File
                            frappe.log_error(
                                f"Error updating mindmap title: {str(e)}",
                                "Rename Mindmap Title",
                            )
                            print(
                                f"❌ Error updating mindmap title (fallback): {str(e)}"
                            )

                    return self

    @frappe.whitelist()
    def change_color(self, new_color):
        """
        Change color of a folder

        :param new_color: New color selected for folder
        :raises InvalidColor: If the color is not a hex value string
        :return: DriveEntity doc once it's updated
        """
        return frappe.db.set_value(
            "Drive File", self.name, "color", new_color, update_modified=False
        )

    @frappe.whitelist()
    def toggle_personal(self, new_value, move_root=True):
        """
        Toggle is private for file
        """
        # BROKEN: don't allow personal unless whole breadcrumb is personal
        self.is_private = new_value
        if not new_value and move_root:
            self.move()
        if self.is_group:
            for child in self.get_children():
                child.toggle_personal(new_value, False)
        self.save()
        return self.name

    def permanent_delete(self):
        write_access = frappe.has_permission(
            doctype="Drive File", doc=self, ptype="write"
        )
        parent_write_access = frappe.has_permission(
            doctype="Drive File",
            doc=frappe.get_value("Drive File", self, "parent_entity"),
            ptype="write",
        )

        if not (write_access or parent_write_access):
            frappe.throw("Not permitted", frappe.PermissionError)

        self.is_active = -1
        if self.is_group:
            for child in self.get_children():
                child.permanent_delete()
        self.save()

    @frappe.whitelist()
    def share(
        self, user=None, read=None, comment=None, share=None, write=None, valid_until=""
    ):
        """
        Share this file or folder with the specified user.
        """
        if frappe.session.user != self.owner:
            if not frappe.has_permission(
                doctype="Drive File",
                doc=self,
                ptype="share",
                user=frappe.session.user,
            ):
                for owner in get_ancestors_of(self.name):
                    if frappe.session.user == frappe.get_value(
                        "Drive File", {"name": owner}, ["owner"]
                    ):
                        continue
                    else:
                        frappe.throw("Not permitted to share", frappe.PermissionError)
                        break

        permission = frappe.db.get_value(
            "Drive Permission",
            {
                "entity": self.name,
                "user": user or "",
            },
        )

        # ✅ Check nếu user đang có quyền write và bị giảm xuống
        old_write_permission = False
        if permission:
            old_permission = frappe.get_doc("Drive Permission", permission)
            old_write_permission = old_permission.write
            permission = old_permission
        else:
            permission = frappe.new_doc("Drive Permission")

        levels = [
            ["read", read],
            ["comment", comment],
            ["share", share],
            ["write", write],
        ]
        permission.update(
            {
                "user": user,
                "entity": self.name,
                "valid_until": valid_until,
            }
            | {l[0]: l[1] for l in levels if l[1] is not None}
        )

        permission.save(ignore_permissions=True)

        # ✅ Nếu đây là folder, tự động chia sẻ tất cả children
        revoke_editing_access(self.name, user)
        if old_write_permission and not write:
            print(f"📉 User {user} write permission changed: True → False")
        if self.is_group:
            self._share_children_bulk(
                user=user,
                read=read,
                comment=comment,
                share=share,
                write=write,
                valid_until=valid_until,
            )
        # ✅ Chỉ revoke nếu user đang có write và bị giảm xuống

        create_new_activity_log(entity=self.name, last_interaction=frappe.utils.now())
        notify_share(self.name, permission.name)

    def _share_children_bulk(
        self, user=None, read=None, comment=None, share=None, write=None, valid_until=""
    ):
        """
        Share all children of this folder using SQL (non-recursive, much faster).
        Uses a single query with path-based filtering to get all descendants.
        """
        # ✅ CÁCH 1: Dùng path để lấy tất cả descendants (Khuyến nghị)
        # Path format: /parent1/parent2/current_folder/
        # Tất cả children sẽ có path bắt đầu bằng path của folder hiện tại

        if not self.path:
            print(f"WARNING: Folder {self.name} has no path, skipping children share")
            return

        # Lấy tất cả children trong một query
        children = frappe.db.sql(
            """
            SELECT name 
            FROM `tabDrive File`
            WHERE path LIKE %s 
            AND name != %s
            AND is_active = 1
            """,
            (f"{self.path}%", self.name),
            as_dict=1,
        )

        if not children:
            return

        child_names = [c.name for c in children]
        print(f"DEBUG - Sharing {len(child_names)} children of {self.name}")

        # ✅ Chuẩn bị dữ liệu để bulk insert/update
        now = frappe.utils.now()
        user_value = user or ""

        # Build permission values
        permission_values = {}
        if read is not None:
            permission_values["read"] = int(read)
        if comment is not None:
            permission_values["comment"] = int(comment)
        if share is not None:
            permission_values["share"] = int(share)
        if write is not None:
            permission_values["write"] = int(write)

        # ✅ Kiểm tra xem children nào đã có permission
        existing_permissions = frappe.db.sql(
            """
            SELECT entity, name
            FROM `tabDrive Permission`
            WHERE entity IN ({})
            AND user = %s
            """.format(
                ",".join(["%s"] * len(child_names))
            ),
            child_names + [user_value],
            as_dict=1,
        )

        existing_entities = {p.entity: p.name for p in existing_permissions}
        entities_to_insert = [
            name for name in child_names if name not in existing_entities
        ]
        entities_to_update = [name for name in child_names if name in existing_entities]

        print(
            f"DEBUG - Insert: {len(entities_to_insert)}, Update: {len(entities_to_update)}"
        )

        # ✅ Bulk UPDATE existing permissions
        if entities_to_update and permission_values:
            update_fields = []
            update_values = []

            for field, value in permission_values.items():
                update_fields.append(f"`{field}` = %s")
                update_values.append(value)

            if valid_until:
                update_fields.append("`valid_until` = %s")
                update_values.append(valid_until)

            update_fields.append("`modified` = %s")
            update_values.append(now)

            # Add WHERE clause values
            update_values.extend(entities_to_update)
            update_values.append(user_value)

            frappe.db.sql(
                """
                UPDATE `tabDrive Permission`
                SET {}
                WHERE entity IN ({})
                AND user = %s
                """.format(
                    ", ".join(update_fields), ",".join(["%s"] * len(entities_to_update))
                ),
                update_values,
            )

        # ✅ Bulk INSERT new permissions
        if entities_to_insert:
            insert_values = []
            for entity in entities_to_insert:
                perm_name = frappe.generate_hash(length=10)

                # Build values tuple
                values = [
                    perm_name,  # name
                    now,  # creation
                    now,  # modified
                    frappe.session.user,  # modified_by
                    frappe.session.user,  # owner
                    0,  # docstatus
                    entity,  # entity
                    user_value,  # user
                    permission_values.get("read", 0),
                    permission_values.get("comment", 0),
                    permission_values.get("share", 0),
                    permission_values.get("write", 0),
                    valid_until or None,
                ]
                insert_values.append(values)

            # Batch insert (500 records at a time to avoid query size limits)
            batch_size = 500
            for i in range(0, len(insert_values), batch_size):
                batch = insert_values[i : i + batch_size]

                placeholders = ",".join(
                    ["(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"]
                    * len(batch)
                )
                flat_values = [item for sublist in batch for item in sublist]

                frappe.db.sql(
                    f"""
                    INSERT INTO `tabDrive Permission`
                    (name, creation, modified, modified_by, owner, docstatus, 
                    entity, user, `read`, `comment`, `share`, `write`, valid_until)
                    VALUES {placeholders}
                    """,
                    flat_values,
                )

        frappe.db.commit()
        print(f"DEBUG - Successfully shared {len(child_names)} children")

    @frappe.whitelist()
    def unshare(self, user=None):
        """Unshare this file or folder with the specified user

        :param user: User or group with whom this is to be shared
        :param user_type:
        """
        absolute_path = generate_upward_path(self.name)
        for i in absolute_path:

            if i["owner"] == user:
                frappe.throw("User owns parent folder", frappe.PermissionError)

        perm_name = frappe.db.get_value(
            "Drive Permission",
            {
                "user": user,
                "entity": self.name,
            },
        )
        if perm_name:
            revoke_editing_access(self.name, user)
            frappe.delete_doc("Drive Permission", perm_name, ignore_permissions=True)

    @frappe.whitelist()
    def move_owner(self, new_owner, old_owner_permissions=0):
        """
        Move ownership of this file or folder to the specified user

        :param new_owner: User to whom ownership is to be transferred
        """

        try:

            permission_old = int(old_owner_permissions) if old_owner_permissions else 0
            old_owner = self.owner  # Lưu owner cũ

            if self.owner == new_owner:
                return
            print(f"Moving ownership of {self.name} from {old_owner} to {new_owner}")
            if not user_has_permission(self, "share", frappe.session.user):
                frappe.throw("Not permitted", frappe.PermissionError)

            # if self.is_group:
            #     for child in self.get_children():
            #         child.move_owner(new_owner)

            # Sử dụng frappe.db.set_value thay vì self.owner = new_owner
            frappe.db.set_value("Drive File", self.name, "owner", new_owner)
            frappe.db.commit()

            if self.document:
                doc = frappe.get_doc("Drive Document", self.document)
                # Sử dụng frappe.db.set_value cho Drive Document
                frappe.db.set_value("Drive Document", doc.name, "owner", new_owner)
                frappe.db.commit()

            # remove all permissions as they are no longer valid
            frappe.db.delete(
                "Drive Permission", {"entity": self.name, "user": new_owner}
            )
            frappe.db.delete(
                "Drive Permission", {"entity": self.name, "user": old_owner}
            )

            create_new_activity_log(
                entity=self.name,
                last_interaction=frappe.utils.now(),
                user=frappe.session.user,
            )

            frappe.get_doc(
                {
                    "doctype": "Drive Permission",
                    "entity": self.name,
                    "user": new_owner,
                    "read": 1,
                    "write": 1,
                    "share": 1,
                    "comment": 1,
                }
            ).insert(ignore_permissions=True)

            frappe.get_doc(
                {
                    "doctype": "Drive Permission",
                    "entity": self.name,
                    "user": frappe.session.user,
                    "read": 1,
                    "write": permission_old,
                    "share": 1,
                    "comment": 1,
                }
            ).insert(ignore_permissions=True)

            print(
                frappe.db.get_value(
                    "Drive File", self.name, ["owner", "is_private", "name"]
                )
            )

            return {
                "status": "success",
                "message": "File ownership moved from {old_owner} to {new_owner}",
                "old_owner": old_owner,
                "new_owner": new_owner,
            }
        except Exception as e:
            frappe.db.rollback()
            frappe.throw(f"Failed to move ownership: {str(e)}")

    # @frappe.whitelist()
    # def create_shortcut(self):
    #     """
    #     Create a shortcut of this file/folder into current user's 'My Documents'
    #     For folders, recursively create shortcuts for all children
    #     """
    #     # Tạo shortcut cho file/folder hiện tại
    #     shortcut = self._create_single_shortcut()
    #     return shortcut

    # def _create_single_shortcut(self):
    #     """
    #     Create a single shortcut (helper method)
    #     """

    #     if not frappe.has_permission(
    #         doctype="Drive File",
    #         doc=self,
    #         ptype="read",
    #         user=frappe.session.user,
    #     ):
    #         frappe.throw("Cannot create shortcut to own file/folder", frappe.PermissionError)

    #     # Thay vì copy tất cả, chỉ copy những field cần thiết
    #     shortcut_data = {
    #         "doctype": "Drive Shortcut",
    #         "file": self.name,
    #         "is_shortcut": 1,
    #         "shortcut_owner": frappe.session.user,
    #     }
    #     print(shortcut_data, "Creating shortcut...")
    #     shortcut = frappe.get_doc(shortcut_data)
    #     shortcut.insert(ignore_permissions=True)

    #     return shortcut

    @frappe.whitelist()
    def remove_shortcut(self):
        """
        Soft delete shortcut by setting is_active = 0
        """
        # Kiểm tra quyền đọc file
        if not frappe.has_permission(
            doctype="Drive File",
            doc=self,
            ptype="read",
            user=frappe.session.user,
        ):
            frappe.throw(
                "You don't have permission to access this file", frappe.PermissionError
            )

        try:
            # Tìm shortcut của user hiện tại cho file này (chỉ lấy shortcut đang active)
            shortcut = frappe.db.get_value(
                "Drive Shortcut",
                {
                    "file": self.name,
                    "shortcut_owner": frappe.session.user,
                    "is_active": 1,
                },
                ["name", "shortcut_owner", "file"],
                as_dict=True,
            )

            if not shortcut:
                frappe.throw(
                    "Active shortcut not found or you don't have permission to remove it"
                )

            # Soft delete shortcut bằng cách set is_active = 0
            frappe.db.set_value("Drive Shortcut", shortcut.name, "is_active", 0)
            frappe.db.commit()

            return {
                "success": True,
                "message": "Shortcut moved to trash successfully",
                "removed_shortcut": shortcut.name,
            }

        except frappe.DoesNotExistError:
            frappe.throw("Shortcut not found")
        except Exception as e:
            frappe.db.rollback()
            frappe.throw(f"Failed to remove shortcut: {str(e)}")

    @frappe.whitelist()
    def create_shortcut(self, parent_folder=None):
        """
        Create a shortcut of this file/folder
        Similar to Google Drive shortcut functionality

        :param parent_folder: Target folder to place shortcut (default: user's root)
        :return: Created shortcut document
        """
        # Kiểm tra quyền đọc file gốc
        if not frappe.has_permission(
            doctype="Drive File",
            doc=self,
            ptype="read",
            user=frappe.session.user,
        ):
            frappe.throw(
                "You don't have permission to create shortcut for this file/folder",
                frappe.PermissionError,
            )

        # Không cho phép tạo shortcut của chính mình
        # if self.owner == frappe.session.user:
        #     frappe.throw("Cannot create shortcut to your own file/folder", frappe.ValidationError)

        # Kiểm tra shortcut đã tồn tại chưa
        existing_shortcut = frappe.db.exists(
            {
                "doctype": "Drive Shortcut",
                "file": self.name,
                "shortcut_owner": frappe.session.user,
                "parent_folder": parent_folder or "",
            }
        )

        if existing_shortcut:
            frappe.throw(
                "Shortcut already exists in this location", frappe.DuplicateEntryError
            )

        # Xác định parent folder
        target_parent = parent_folder or get_home_folder(self.team).name

        # Tạo shortcut
        shortcut = self._create_single_shortcut(target_parent)

        # Nếu là folder, có thể tùy chọn tạo shortcut cho children
        if self.is_group and frappe.form_dict.get("include_children"):
            self._create_shortcuts_for_children(shortcut.name)

        return shortcut

    def _create_single_shortcut(self, parent_folder=None):
        """
        Create a single shortcut (helper method)
        """
        shortcut_data = {
            "doctype": "Drive Shortcut",
            "file": self.name,  # Reference to original file
            "title": self.title,  # Display name (có thể rename sau)
            "is_shortcut": 1,
            "shortcut_owner": frappe.session.user,
            "parent_folder": parent_folder,
            "is_group": self.is_group,  # Copy folder status
            "file_size": self.file_size if not self.is_group else 0,
            "mime_type": self.mime_type,
            "created": frappe.utils.now(),
            "modified": frappe.utils.now(),
            # Inherit some display properties from original
            "color": getattr(self, "color", None),
            "description": f"Shortcut to {self.title}",
        }

        shortcut = frappe.get_doc(shortcut_data)
        shortcut.insert(ignore_permissions=True)

        frappe.msgprint(f"Shortcut '{self.title}' created successfully", alert=True)
        return shortcut

    def _create_shortcuts_for_children(self, shortcut_parent):
        """
        Recursively create shortcuts for folder children (optional feature)
        """
        if not self.is_group:
            return

        children = frappe.get_all(
            "Drive File",
            filters={"parent_entity": self.name},
            fields=["name", "title", "is_group"],
        )

        for child in children:
            child_doc = frappe.get_doc("Drive File", child.name)
            try:
                child_shortcut = child_doc._create_single_shortcut(shortcut_parent)
                if child.is_group:
                    child_doc._create_shortcuts_for_children(child_shortcut.name)
            except Exception as e:
                frappe.log_error(
                    f"Failed to create shortcut for {child.title}: {str(e)}"
                )


def on_doctype_update():
    frappe.db.add_index("Drive File", ["title"])
