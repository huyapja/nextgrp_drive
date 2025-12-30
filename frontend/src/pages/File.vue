<template>
  <div class="flex w-full">
    <div class="w-full">
      <Navbar
        v-if="!file?.error"
        :root-resource="file"
        :get-entities="file"
      />
      <ErrorPage
        v-if="file.error"
        :error="file.error"
      />
      <div
        id="renderContainer"
        :draggable="false"
        class=" overflow-y-auto flex justify-center item-center"
      >
        <LoadingIndicator
          v-if="file.loading"
          class="w-10 h-full text-neutral-100"
        />
        <FileRender
          v-else-if="file.data"
          :preview-entity="file.data"
        />
      </div>
      <!-- <div
        class="hidden sm:flex absolute bottom-4 left-1/2 transform -translate-x-1/2 w-fit items-center justify-center p-1 gap-1 h-10 rounded-lg shadow-xl bg-surface-white"
      > -->
        <!-- <Button
          :disabled="!prevEntity?.name"
          :variant="'ghost'"
          icon="arrow-left"
          @click="scrollEntity(true)"
        /> -->
        <!-- <Button
          :variant="'ghost'"
          @click="enterFullScreen"
        >
          <LucideScan class="w-4" />
        </Button> -->
        <!-- <Button
          :disabled="!nextEntity?.name"
          :variant="'ghost'"
          icon="arrow-right"
          @click="scrollEntity()"
        /> -->
      <!-- </div> -->
    </div>

    <InfoSidebar />
  </div>
  <!-- Permission Modal -->
    <div v-if="showPermissionModal" class="permission-modal-overlay">
      <div class="permission-modal">
        <div class="modal-header">
          <h3>⚠️ Quyền truy cập đã thay đổi</h3>
        </div>
        <div class="modal-body">
          <p>{{ permissionModalMessage }}</p>
          <p>Trang sẽ tải lại trong <strong>{{ permissionModalCountdown }}</strong> giây...</p>
        </div>
      </div>
    </div>
</template>

<script setup>
import ErrorPage from "@/components/ErrorPage.vue"
import FileRender from "@/components/FileRender.vue"
import { prettyData, setBreadCrumbs } from "@/utils/files"
import { onKeyStroke } from "@vueuse/core"
import { createResource, LoadingIndicator } from "frappe-ui"
import {
  computed,
  defineProps,
  inject,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  ref,
} from "vue"
import { useRoute, useRouter } from "vue-router"
import { useStore } from "vuex"
import InfoSidebar from "../components/InfoSidebar/InfoSidebar.vue"

const router = useRouter()
const route = useRoute()
const store = useStore()
const emitter = inject("emitter")
const realtime = inject("realtime")
const socket = inject("socket")
const props = defineProps({
  entityName: String,
  team: String,
})

const showPermissionModal = ref(false)
const permissionModalTimer = ref(null)
const permissionModalCountdown = ref(5)
const permissionModalMessage = ref("")
const saveTimeoutRef = ref(null)
const cachedPermissionVersion = ref(null)  // ✅ Lưu version quyền hiện tại

// Store socket listener function reference for proper cleanup
let permissionRevokedListener = null
let connectListener = null

const currentEntity = ref(props.entityName)

const filteredEntities = computed(() =>
  store.state.currentFolder.entities.filter(
    (item) => !item.is_group && !item.document && !item.is_link
  )
)

const index = computed(() => {
  return filteredEntities.value.findIndex(
    (item) => item.name === props.entityName
  )
})
const prevEntity = computed(() => filteredEntities.value[index.value - 1])
const nextEntity = computed(() => filteredEntities.value[index.value + 1])

function fetchFile(currentEntity) {
  file.fetch({ entity_name: currentEntity }).then(() => {
    router.replace({
      name: "File",
      params: { entityName: currentEntity },
      query: route.query // Giữ lại query parameters
    })
  })
}

onKeyStroke("ArrowLeft", (e) => {
  if (e.metaKey) return
  e.preventDefault()
  scrollEntity(true)
})
onKeyStroke("ArrowRight", (e) => {
  if (e.metaKey) return
  e.preventDefault()
  scrollEntity()
})

const onSuccess = (entity) => {
  document.title = entity.title
  setBreadCrumbs(entity.breadcrumbs, entity.is_private, () =>
    emitter.emit("rename")
  )
  
  // Debug: kiểm tra query parameters
  console.log("Query parameters:", route.query)
  console.log("comment_open value:", !!route.query.comment_open)
  
  // Kiểm tra query parameter để quyết định tab nào sẽ mở
  if (!!route.query.comment_open) {
    // Mở tab bình luận (tab 1)
    console.log("Setting tab to Comments (1)")
    store.commit("setInfoSidebarTab", 1)
  } else {
    // Mặc định mở tab thông tin (tab 0)
    console.log("Setting tab to Information (0)")
    store.commit("setInfoSidebarTab", 0)
  }
  
  // Tự động mở drawer thông tin sau khi entity đã được load 
  store.commit("setShowInfo", true)
}
let file = createResource({
  url: "drive.api.permissions.get_entity_with_permissions",
  params: { entity_name: props.entityName },
  transform(entity) {
    store.commit("setActiveEntity", entity)
    return prettyData([entity])[0]
  },
  onSuccess,
  onError() {
    if (!store.getters.isLoggedIn) router.push({ name: "Login" })
  },
})

function scrollEntity(negative = false) {
  currentEntity.value = negative ? prevEntity.value : nextEntity.value
  if (currentEntity.value) fetchFile(currentEntity.value.name)
}

// Close modal without reloading
function closePermissionModal() {
  showPermissionModal.value = false
  if (permissionModalTimer.value) {
    clearInterval(permissionModalTimer.value)
  }
}

// Reload page immediately
function reloadPageNow() {
  if (permissionModalTimer.value) {
    clearInterval(permissionModalTimer.value)
  }
  window.location.reload()
}

// Handle permission revoke or unshare
function handlePermissionRevoked(data) {
  console.log("🚫 Permission revoked handler called")
  console.log("Data:", data)
  
  // Determine message based on type
  if (data.deleted) {
    permissionModalMessage.value = "Tệp này đã bị xóa. Bạn không còn có quyền truy cập."
  } else if (data.moved_to_trash) {
    permissionModalMessage.value = "Tệp này đã được chuyển vào thùng rác. Vui lòng tải lại trang."
  } else if (data.unshared) {
    permissionModalMessage.value = "Tệp này đã được gỡ chia sẻ với bạn. Bạn không còn có quyền truy cập."
  } else if (data.reason && data.reason.includes("Quyền sở hữu đã được chuyển")) {
    // Ownership transfer message
    permissionModalMessage.value = "Quyền sở hữu của tệp này đã được chuyển. Vui lòng tải lại trang để cập nhật quyền truy cập."
  } else if (data.can_edit === false) {
    permissionModalMessage.value = "Quyền truy cập của bạn đã thay đổi."
  } else {
    permissionModalMessage.value = "Quyền truy cập của bạn đã thay đổi."
  }
  
  // Show modal
  showPermissionModal.value = true
  permissionModalCountdown.value = 5
  
  // Start countdown
  permissionModalTimer.value = setInterval(() => {
    permissionModalCountdown.value--
    if (permissionModalCountdown.value <= 0) {
      reloadPageNow()
    }
  }, 1000)
}

// ⭐ Initialize permission version on mount
async function initializePermissionVersion(entityName) {
  try {
    const response = await fetch(
      `/api/method/drive.api.onlyoffice.get_permission_status?entity_name=${entityName}`,
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
      console.log(`✅ Initialized permission version: ${cachedPermissionVersion.value}`)
    }
  } catch (err) {
    console.error("❌ Failed to initialize permission version:", err)
  }
}

// ⭐ Handle permission revoked event from socket
function handleSocketPermissionRevoked(message) {
  console.log("📡 Socket permission_revoked event received:", message)
  console.log("   Current entityName:", props.entityName)
  console.log("   Message entity_name:", message?.entity_name)
  
  // Kiểm tra xem event có phải cho file hiện tại không
  if (!message || !message.entity_name) {
    console.log("⚠️ Invalid message format:", message)
    return
  }
  
  if (message.entity_name !== props.entityName) {
    console.log(`⚠️ Event for different file: ${message.entity_name} (current: ${props.entityName})`)
    return
  }
  
  console.log("✅ Event matches current file, processing...")
  
  // Cập nhật cached version
  if (message.new_version) {
    cachedPermissionVersion.value = message.new_version
  }
  
  // Xác định thông điệp dựa trên action
  const isUnshared = message.action === "unshared" || message.unshared === true
  const isDeleted = message.action === "deleted" || message.deleted === true
  const isMovedToTrash = message.action === "moved_to_trash" || message.moved_to_trash === true
  const canEdit = message.new_permission === "edit" || message.can_edit === true
  
  console.log("   Action:", message.action)
  console.log("   isUnshared:", isUnshared)
  console.log("   isDeleted:", isDeleted)
  console.log("   isMovedToTrash:", isMovedToTrash)
  console.log("   canEdit:", canEdit)
  
  handlePermissionRevoked({
    reason: message.reason || "Your permission was changed",
    entity_name: message.entity_name,
    can_edit: canEdit,
    unshared: isUnshared,
    deleted: isDeleted,
    moved_to_trash: isMovedToTrash,
  })
}

onMounted(() => {
  // Lưu thông tin file share nếu user chưa login
  if (!store.getters.isLoggedIn) {
    const sharedFileInfo = {
      team: props.team,
      entityName: props.entityName,
      entityType: "file"
    }
    sessionStorage.setItem("sharedFileInfo", JSON.stringify(sharedFileInfo))
  }
  
  fetchFile(props.entityName)
  realtime.doc_subscribe("Drive File", props.entityName)
  realtime.doc_open("Drive File", props.entityName)
  realtime.on("doc_viewers", (data) => {
    store.state.connectedUsers = data.users
    userInfo.submit({ users: JSON.stringify(data.users) })
  })
  
  // ⭐ Initialize permission version
  initializePermissionVersion(props.entityName)
  
  // ⭐ Listen for permission revoked event via socket
  if (socket) {
    console.log("📡 Registering socket listener for permission_revoked (file)")
    console.log("   Current entityName:", props.entityName)
    
    // Register listener with stored reference
    permissionRevokedListener = (message) => {
      console.log("📨 Raw permission_revoked event received:", message)
      handleSocketPermissionRevoked(message)
    }
    socket.on("permission_revoked", permissionRevokedListener)
    
    // Re-register listener on reconnect
    connectListener = () => {
      console.log("🔄 Socket reconnected, re-registering permission_revoked listener (file)")
      if (permissionRevokedListener) {
        socket.on("permission_revoked", permissionRevokedListener)
      }
    }
    socket.on("connect", connectListener)
  } else {
    console.warn("⚠️ Socket is not available, permission changes will not be detected in real-time")
  }
})

onUnmounted(() => {
  // ⭐ Remove socket listener
  if (socket) {
    if (permissionRevokedListener) {
      socket.off("permission_revoked", permissionRevokedListener)
    }
    if (connectListener) {
      socket.off("connect", connectListener)
    }
  }
  
  if (permissionModalTimer.value) {
    clearInterval(permissionModalTimer.value)
  }

  if (saveTimeoutRef.value) {
    clearTimeout(saveTimeoutRef.value)
  }
})

onBeforeUnmount(() => {
  realtime.off("doc_viewers")
  store.state.connectedUsers = []
  realtime.doc_close("Drive File", file.data?.name)
  realtime.doc_unsubscribe("Drive File", file.data?.name)
  
  // Đóng drawer thông tin và reset tab khi rời khỏi trang file
  store.commit("setShowInfo", false)
  store.commit("setInfoSidebarTab", 0)
})

let userInfo = createResource({
  url: "frappe.desk.form.load.get_user_info_for_viewers",
  // compatibility with document awareness
  onSuccess(data) {
    data = Object.values(data)
    data.forEach((item) => {
      if (item.fullname) {
        item.avatar = item.image
        item.name = item.fullname
        delete item.image
        delete item.fullname
      }
    })
    store.state.connectedUsers = data
  },
  auto: false,
})
</script>

<style scoped>
.center-transform {
  transform: translate(-50%, -50%);
}

#renderContainer::backdrop {
  background-color: rgb(0, 0, 0);
  min-width: 100vw;
  min-height: 100vh;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
}

/* Permission Modal */
.permission-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.permission-modal {
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  width: 90%;
  max-width: 32rem;
  animation: slideIn 0.3s ease-out;
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
}

.modal-body {
  padding: 1.5rem;
  color: #374151;
}

.modal-body p {
  margin: 0 0 1rem;
  line-height: 1.5;
}

.modal-body p:last-child {
  margin-bottom: 0;
}

.modal-body strong {
  color: #dc2626;
  font-weight: 600;
}

.modal-footer {
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.btn-secondary,
.btn-primary {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: none;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.875rem;
}

.btn-secondary {
  background: #e5e7eb;
  color: #111827;
}

.btn-secondary:hover {
  background: #d1d5db;
}

.btn-primary {
  background: #2563eb;
  color: white;
}

.btn-primary:hover {
  background: #1d4ed8;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
