import { ref, watch } from 'vue'

export function useMindmapPermissions() {
  const permissions = ref({
    read: 0,
    write: 0,
    comment: 0,
    share: 0
  })
  
  const showPermissionModal = ref(false)
  const permissionModalTimer = ref(null)
  const permissionModalCountdown = ref(5)
  const permissionModalMessage = ref('')
  const cachedPermissionVersion = ref(null)

  const initializePermissionVersion = async (entityName) => {
    try {
      const response = await fetch(
        `/api/method/drive.api.mindmap.get_mindmap_permission_status?entity_name=${entityName}`,
        {
          headers: {
            "X-Frappe-CSRF-Token": window.csrf_token || "",
          },
        }
      )
      
      const result = await response.json()
      const data = result.message
      
      if (data.current_version) {
        cachedPermissionVersion.value = data.current_version
        console.log(`✅ Initialized mindmap permission version: ${cachedPermissionVersion.value}`)
      }
    } catch (err) {
      console.error("❌ Failed to initialize mindmap permission version:", err)
    }
  }

  const handlePermissionChanged = (data) => {
    console.log("🚫 Permission changed handler called", data)
    
    if (data.deleted) {
      permissionModalMessage.value = "Tệp này đã bị xóa. Bạn không còn có quyền truy cập."
    } else if (data.unshared) {
      permissionModalMessage.value = "Tệp này đã được gỡ chia sẻ với bạn. Bạn không còn có quyền truy cập."
    } else if (data.reason && data.reason.includes("Quyền sở hữu đã được chuyển")) {
      permissionModalMessage.value = "Quyền sở hữu của tệp này đã được chuyển. Vui lòng tải lại trang để cập nhật quyền truy cập."
    } else if (data.can_edit !== permissions.value.write) {
      if (data.can_edit) {
        permissionModalMessage.value = "Quyền truy cập của bạn đã được nâng cấp. Vui lòng tải lại trang để sử dụng các tính năng chỉnh sửa."
      } else {
        permissionModalMessage.value = "Quyền truy cập của bạn đã thay đổi."
      }
    } else {
      permissionModalMessage.value = "Quyền truy cập của bạn đã thay đổi."
    }
    
    showPermissionModal.value = true
    permissionModalCountdown.value = 5
    
    if (permissionModalTimer.value) {
      clearInterval(permissionModalTimer.value)
    }
    
    permissionModalTimer.value = setInterval(() => {
      permissionModalCountdown.value--
      if (permissionModalCountdown.value <= 0) {
        reloadPageNow()
      }
    }, 1000)
  }

  const reloadPageNow = () => {
    if (permissionModalTimer.value) {
      clearInterval(permissionModalTimer.value)
      permissionModalTimer.value = null
    }
    window.location.reload()
  }

  const handleSocketPermissionRevoked = (message, entityName) => {
    console.log("📡 Socket permission_revoked event received for mindmap:", message)
    console.log("   Current entityName:", entityName)
    console.log("   Message entity_name:", message?.entity_name)
    
    if (!message || !message.entity_name) {
      console.log("⚠️ Invalid message format:", message)
      return
    }
    
    if (message.entity_name !== entityName) {
      console.log(`⚠️ Event for different file: ${message.entity_name} (current: ${entityName})`)
      return
    }
    
    console.log("✅ Event matches current file, processing...")
    
    if (message.new_version) {
      cachedPermissionVersion.value = message.new_version
    }
    
    const isUnshared = message.action === "unshared" || message.unshared === true
    const isDeleted = message.action === "deleted" || message.deleted === true
    const canEdit = message.new_permission === "edit" || message.can_edit === true
    
    console.log("   Action:", message.action)
    console.log("   isUnshared:", isUnshared)
    console.log("   isDeleted:", isDeleted)
    console.log("   canEdit:", canEdit)
    
    handlePermissionChanged({
      reason: message.reason || "Your permission was changed",
      entity_name: message.entity_name,
      can_edit: canEdit,
      unshared: isUnshared,
      deleted: isDeleted,
    })
  }

  const setupPermissionWatcher = (d3Renderer) => {
    watch(permissions, (newPermissions) => {
      if (d3Renderer.value) {
        d3Renderer.value.options.permissions = newPermissions
        d3Renderer.value.render(false)
      }
    }, { deep: true })
  }

  const cleanup = () => {
    if (permissionModalTimer.value) {
      clearInterval(permissionModalTimer.value)
      permissionModalTimer.value = null
    }
  }

  return {
    permissions,
    showPermissionModal,
    permissionModalTimer,
    permissionModalCountdown,
    permissionModalMessage,
    cachedPermissionVersion,
    initializePermissionVersion,
    handlePermissionChanged,
    handleSocketPermissionRevoked,
    setupPermissionWatcher,
    reloadPageNow,
    cleanup
  }
}

