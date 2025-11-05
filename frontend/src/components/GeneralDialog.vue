<template>
  <Dialog
    v-model="open"
    :options="{ title: dialogData.title, size: 'sm' }"
  >
    <template #body-content>
      <div class="flex items-center justify-start">
        <p class="text-base text-ink-gray-5 leading-5">
          {{ dialogData.message }}
        </p>
      </div>

      <div class="flex mt-5">
        <Button
          :variant="dialogData.variant"
          :icon-left="dialogData.buttonIcon"
          :theme="dialogData.theme"
          class="w-full"
          :loading="$resources.method?.loading"
          @click="$resources.method.submit()"
        >
          {{ errorMessage ? __("Try again") : dialogData.buttonMessage }}
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<script>
import emitter from "@/emitter"
import { getTrash } from "@/resources/files.js"
import { sortEntities } from "@/utils/files.js"
import { useTimeAgo } from "@vueuse/core"
import { Dialog, ErrorMessage } from "frappe-ui"
import { del } from "idb-keyval"
import { mutate } from "../resources/files"
import { toast } from "../utils/toasts"

export default {
  name: "GeneralDialog",
  components: {
    Dialog,
    ErrorMessage,
  },
  props: {
    modelValue: {
      type: String,
      required: true,
    },
    entities: {
      type: [Array, String],
      required: true,
    },
    for: {
      type: String,
      default: null,
    },
  },
  emits: ["update:modelValue", "success"],
  data() {
    return {
      errorMessage: "",
    }
  },

  computed: {
    dialogData() {
      const items =
        this.entities.length === 1
          ? __("this item")
          : __("{0} items").format(this.entities.length)
      
      // Separate files and shortcuts
      const files = this.entities.filter(entity => !entity.is_shortcut)
      const shortcuts = this.entities.filter(entity => entity.is_shortcut)
      
      switch (this.for) {
        case "restore":
          return {
            title: __("Restore Items"),
            message: __("Selected items will be restored to their original locations."),
            buttonMessage: __("Restore"),
            onSuccess: () => {
              getTrash.setData((d) =>
                d.filter((k) => !this.entities.map((l) => l.shortcut_name || l.name).includes(k.shortcut_name || k.name))
              )
              getTrash.reload()
            },
            variant: "solid",
            buttonIcon: "refresh-ccw",
            methodName: "drive.api.files.remove_or_restore",
            toastMessage: __("Khôi phục tài liệu thành công"),
            files: files,
            shortcuts: shortcuts,
          }
        case "remove":
          console.log('Dialog for remove:', this.entities)
          return {
            title: __("Move to Trash"),
            message: __("{0} will be moved to Trash. Items in trash are deleted forever after 30 days.").format(
              items.charAt(0).toUpperCase() + items.slice(1)
            ),
            buttonMessage: __("Move to Trash"),
            mutate: (el) => (el.is_active = 0),
            onSuccess: (e) => {
              getTrash.setData(
                sortEntities([
                  ...getTrash.data,
                  ...e.map((k) => {
                    k.modified = Date()
                    k.relativeModified = useTimeAgo(k.modified)
                    return k
                  }),
                ])
              )
            },
            theme: "red",
            variant: "subtle",
            buttonIcon: "trash-2",
            methodName: "drive.api.files.remove_or_restore",
            toastMessage: __("Đã di chuyển {0} vào thùng rác").format(items),
            files: files,
            shortcuts: shortcuts,
          }
        default:
          return {}
      }
    },
    open: {
      get() {
        return this.modelValue === this.for
      },
      set(value) {
        this.$emit("update:modelValue", value || "")
      },
    },
  },
  
  resources: {
    method() {
      return {
        url: this.dialogData.methodName,
        makeParams: () => {
          const files = this.dialogData.files || []
          const shortcuts = this.dialogData.shortcuts || []
          
          const params = {
            team: this.$route.params.team,
          }
          
          // Add file names if any
          if (files.length > 0) {
            params.entity_names = JSON.stringify(
              files.map((entity) => entity.name || entity.entity)
            )
          }
          
          // Add shortcut names if any
          if (shortcuts.length > 0) {
            params.entity_shortcuts = JSON.stringify(
              shortcuts.map((entity) => entity.shortcut_name)
            )
          }
          return params
        },
        onSuccess(data) {
          // Reset error message
          this.errorMessage = ""
          
          // ✅ Kiểm tra nếu backend trả về success: false (toàn bộ thất bại)
          if (data.success === false) {
            // Tạo message chi tiết
            let errorMsg = data.message || __("Có lỗi xảy ra")
            
            // Nếu có danh sách file lỗi, hiển thị chi tiết
            if (data.failed_files && data.failed_files.length > 0) {
              const failedCount = data.failed_files.length
              errorMsg = `${data.message}`
              if (failedCount > 1) {
                errorMsg += `\n(${failedCount} ${__("files")})`
              }
            }
            
            this.errorMessage = errorMsg
            
            toast({
              title: data.message || __("Thao tác thất bại"),
              icon: "x",
              iconClasses: "text-red-600",
              position: "bottom-right",
              timeout: 4,
            })
            return // Dừng lại, không thực hiện các hành động thành công
          }
          
          // ✅ Xử lý một phần thành công, một phần thất bại
          if (data.success && data.failed_files && data.failed_files.length > 0) {
            const successCount = data.success_files?.length || 0
            const failedCount = data.failed_files.length
            
            // Hiển thị warning toast
            toast({
              title: __("Hoàn thành với {0} lỗi").format(failedCount),
              text: `${__("Thành công")}: ${successCount}, ${__("Thất bại")}: ${failedCount}`,
              icon: "alert-triangle",
              iconClasses: "text-orange-600",
              position: "bottom-right",
              timeout: 4,
            })
            
            // Vẫn set error message để hiển thị trong dialog
            if (data.message) {
              this.errorMessage = data.message
            }
          } else if (data.success) {
            // ✅ Tất cả đều thành công
            toast({
              title: this.dialogData.toastMessage,
              position: "bottom-right",
              timeout: 2,
            })
          }
          
          // ✅ Xử lý các file thành công
          if (data.success && data.success_files && data.success_files.length > 0) {
            this.$emit("success", data.success_files)
            emitter.emit("recalculate")
            this.$resources.method.reset()
            
            // Chỉ mutate các entity thành công
            if (this.dialogData.mutate) {
              const successEntities = this.entities.filter(entity => 
                data.success_files.includes(entity.name || entity.entity)
              )
              mutate(successEntities, this.dialogData.mutate)
            }
            
            if (this.dialogData.onSuccess) {
              const successEntities = this.entities.filter(entity => 
                data.success_files.includes(entity.name || entity.entity)
              )
              this.dialogData.onSuccess(successEntities, data)
            }
            
            // Delete from cache only successful files
            data.success_files.forEach((entityName) => {
              del(entityName)
            })
            
            // Nếu tất cả thành công, đóng dialog
            if (!data.failed_files || data.failed_files.length === 0) {
              this.open = false
            }
          }
        },
        onError(error) {
          // Xử lý lỗi HTTP (network error, 500, etc.)
          if (error.messages) {
            this.errorMessage = error.messages.join("\n")
          } else {
            this.errorMessage = error.message
          }
          
          toast({
            title: error.message || __("Đã xảy ra lỗi"),
            icon: "x",
            iconClasses: "text-red-600",
            position: "bottom-right",
            timeout: 4,
          })
        },
      }
    },
  },
}
</script>