<template>
  <div 
    class="onlyoffice-container"
    :style="containerStyle"
  >
    <!-- Status Bar - Hiển thị cả khi fullscreen -->

    <!-- Loading State -->
    <div v-if="loading" class="loading-container">
      <div class="loading-content">
        <div class="spinner"></div>
        <p class="loading-text">Đang tải trình soạn thảo...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-container">
      <div class="error-content">
        <div class="error-icon-wrapper">
          <AlertCircleIcon class="error-icon" />
        </div>
        <h3 class="error-title">Có lỗi xảy ra</h3>
        <p class="error-message">{{ error }}</p>
        <Button class="download-button" @click="downloadFile">
          Tải xuống file
        </Button>
      </div>
    </div>

    <!-- Editor Container -->
    <div 
      class="editor-wrapper"
      :class="{ 'fullscreen-mode': isFullscreen }"
    >
      <div
        id="onlyoffice-editor"
        :style="editorStyle"
      />
    </div>
  </div>
</template>

<script setup>
import { Button, createResource } from "frappe-ui"
import { computed, onMounted, onUnmounted, ref } from "vue"

// Import icons
const ClockIcon = {
  template:
    '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
}
const CheckCircleIcon = {
  template:
    '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
}
const AlertCircleIcon = {
  template:
    '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
}
const UsersIcon = {
  template:
    '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>',
}
const SaveIcon = {
  template:
    '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>',
}

const props = defineProps({
  previewEntity: {
    type: Object,
    required: true,
  },
})

// Reactive state
const loading = ref(true)
const error = ref("")
const editorInstance = ref(null)
const saveStatus = ref("saved") // 'saving', 'saved', 'unsaved'
const activeUsers = ref(1)
const lastSaved = ref(null)
const saveTimeoutRef = ref(null)
const isSavingManually = ref(false)
const isFullscreen = ref(false) // Track fullscreen state

const ONLYOFFICE_URL = "https://onlyoffice.nextgrp.vn/"

let socketListener = null

// Computed styles
const containerStyle = computed(() => ({
  height: isFullscreen.value ? '100vh' : 'calc(100vh - 70px)'
}))

const editorStyle = computed(() => ({
  paddingTop: !loading.value && !error.value && !isFullscreen.value ? '52px' : '0px',
  height: '100%',
  width: '100%'
}))

// Lifecycle hooks
onMounted(() => {
  loadOnlyOfficeScript()
  // Listen for fullscreen changes
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
  document.addEventListener('mozfullscreenchange', handleFullscreenChange)
  document.addEventListener('msfullscreenchange', handleFullscreenChange)
})

onUnmounted(() => {
  cleanupSocketListener()
  if (editorInstance.value && editorInstance.value.destroyEditor) {
    try {
      editorInstance.value.destroyEditor()
      console.log("✅ Editor destroyed")
    } catch (e) {
      console.error("Error destroying editor:", e)
    }
  }
  if (saveTimeoutRef.value) {
    clearTimeout(saveTimeoutRef.value)
  }
  
  // Remove fullscreen listeners
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
  document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
  document.removeEventListener('msfullscreenchange', handleFullscreenChange)
})



// Fullscreen handlers
function handleFullscreenChange() {
  isFullscreen.value = !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  )
  
  console.log('🖥️ Fullscreen mode:', isFullscreen.value)
}



// OnlyOffice initialization
function loadOnlyOfficeScript() {
  console.log("🔍 [1] Loading OnlyOffice script...")

  if (window.DocsAPI) {
    console.log("✅ [2] DocsAPI already loaded")
    fetchEditorConfig()
    return
  }

  const script = document.createElement("script")
  script.src = `${ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js`

  console.log("    📡 Script URL:", script.src)

  script.onload = () => {
    console.log("✅ [2] OnlyOffice script loaded")
    fetchEditorConfig()
  }

  script.onerror = (e) => {
    console.error("❌ [2] Failed to load OnlyOffice script:", e)
    error.value = `Không thể kết nối đến OnlyOffice Document Server tại ${ONLYOFFICE_URL}.`
    loading.value = false
  }

  document.head.appendChild(script)
}

function fetchEditorConfig() {
  console.log("🔍 [3] Fetching editor config...") 

  if (!props.previewEntity || !props.previewEntity.name) {
    console.error("❌ No previewEntity")
    error.value = "Không tìm thấy thông tin file"
    loading.value = false
    return
  }

  editorConfigResource.fetch({
    entity_name: props.previewEntity.name,
  })
}

const editorConfigResource = createResource({
  url: "drive.api.onlyoffice.get_editor_config",
  auto: false,
  onSuccess(data) {
    console.log("✅ [4] Config received from backend")
    console.log("    📦 Full config:", data)

    if (!data.token) {
      console.warn("⚠️ Token is empty! JWT might be disabled.")
    } else {
      console.log("🔐 Token:", data.token.substring(0, 30) + "...")
    }

    if (data.document && data.document.url) {
      console.log("📎 Document URL:", data.document.url)
    } else {
      console.error("❌ No document URL in config!")
    }

    initEditor(data)
  },
  onError(err) {
    console.error("❌ [4] Error fetching config:", err)
    error.value = "Không thể tải cấu hình trình soạn thảo. Vui lòng thử lại."
    loading.value = false
  },
})

function initEditor(config) {
  try {
    console.log("🔍 [5] Initializing editor...")

    if (!window.DocsAPI) {
      throw new Error("window.DocsAPI is not defined")
    }

    const editorConfig = {
      ...config,
      height: "100%",
      width: "100%",
      events: {
        onAppReady: () => {
          console.log("✅ [6] Editor ready!")
          loading.value = false
          
        },

        onDocumentReady: () => {
          console.log("📄 Document ready")
          
        },

        onDocumentStateChange: (event) => {
          console.log("📝 Document state changed:", event.data)
          if (event.data) {
            if (saveTimeoutRef.value) {
              clearTimeout(saveTimeoutRef.value)
            }
          }
        },

        onMetaChange: (event) => {
          console.log("📊 Meta changed:", event)
          if (event.data && event.data.users) {
            activeUsers.value = event.data.users.length
          }
        },

        onRequestSave: () => {
          console.log("💾 Save requested by user")
          

          saveTimeoutRef.value = setTimeout(() => {
            
            lastSaved.value = new Date()
          }, 3000)
        },

        onWarning: (event) => {
          console.warn("⚠️ Warning:", event)
        },

        onError: (event) => {
          console.error("❌ [6] OnlyOffice Error:", event)

          let errorMsg = "Có lỗi xảy ra khi tải trình soạn thảo"

          if (event.data) {
            const errorCode = event.data.errorCode
            const errorDesc = event.data.errorDescription

            console.error("    Error code:", errorCode)
            console.error("    Error description:", errorDesc)

            switch (errorCode) {
              case -20:
                errorMsg =
                  "Lỗi xác thực JWT token. Vui lòng kiểm tra cấu hình secret key."
                break
              case -3:
                errorMsg =
                  "Không thể tải file. Document Server không thể truy cập URL của file."
                break
              case -4:
                errorMsg = "Lỗi tải file từ storage."
                break
              case -8:
                errorMsg =
                  "Lỗi callback URL. OnlyOffice không thể gọi lại server để lưu file."
                break
              default:
                errorMsg = errorDesc || errorMsg
            }
          }

          error.value = errorMsg
          loading.value = false
        },

        onRequestRefreshFile: () => {
          console.log("🔄 Outdated version detected")
          error.value = "Phiên bản document đã cũ. Vui lòng tải lại trang."
        },

        onRequestClose: () => {
          console.log("🚪 Close requested")
          handleCloseDocument()
        },

        onRequestSaveAs: (event) => {
          console.log("💾 Save as requested:", event)
        },

        onDownloadAs: (event) => {
          console.log("📥 Download as requested:", event)
        },

        onInfo: (event) => {
          console.log("ℹ️ Info:", event)
        },
      },
    }

    console.log("    📋 Final editor config:", editorConfig)

    editorInstance.value = new DocsAPI.DocEditor(
      "onlyoffice-editor",
      editorConfig
    )

    console.log("✅ [5] DocEditor created successfully")
  } catch (err) {
    console.error("❌ [5] Error initializing editor:", err)
    error.value = `Không thể khởi tạo trình soạn thảo: ${err.message}`
    loading.value = false
  }
}


async function handleCloseDocument() {
  console.log("🚪 Closing document...")

  try {
    const response = await fetch(
      "/api/method/drive.api.onlyoffice.close_document",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Frappe-CSRF-Token": window.csrf_token || "",
        },
        body: JSON.stringify({
          entity_name: props.previewEntity.name,
        }),
      }
    )

    const result = await response.json()

    if (result.message?.success) {
      console.log("✅ Document closed successfully")
      window.close()
    }
  } catch (err) {
    console.error("❌ Error closing document:", err)
    window.close()
  }
}

function downloadFile() {
  const entity = props.previewEntity
  console.log("📥 Downloading file:", entity.name)
  window.location.href = `/api/method/drive.api.files.get_file_content?entity_name=${entity.name}&trigger_download=1`
}
</script>

<style scoped>
.onlyoffice-container {
  width: 100%;
  position: relative;
  background: #f5f5f5;
}

/* Fullscreen styles */
.onlyoffice-container:fullscreen,
.onlyoffice-container:-webkit-full-screen,
.onlyoffice-container:-moz-full-screen,
.onlyoffice-container:-ms-fullscreen {
  height: 100vh !important;
  background: #fff;
}

/* Editor wrapper */
.editor-wrapper {
  height: 100%;
  width: 100%;
  position: relative;
  transition: padding 0.3s ease;
}

.editor-wrapper.fullscreen-mode {
  padding-top: 0 !important;
}

/* Deep selector for iframe */
:deep(#onlyoffice-editor iframe) {
  padding-top: 38px !important;
  transition: padding 0.3s ease;
}

/* Remove padding when fullscreen */
.editor-wrapper.fullscreen-mode :deep(#onlyoffice-editor iframe) {
  padding-top: 0 !important;
}

/* Status Bar */
.status-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  height: 52px;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.file-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.save-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #6b7280;
}

.status-icon {
  width: 1rem;
  height: 1rem;
}

.status-icon.saving {
  color: #3b82f6;
  animation: spin 1s linear infinite;
}

.status-icon.saved {
  color: #10b981;
}

.status-icon.unsaved {
  color: #f59e0b;
}

.active-users {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  background: #eff6ff;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  color: #2563eb;
  font-weight: 500;
}

.active-users .icon {
  width: 1rem;
  height: 1rem;
  color: #2563eb;
}

.save-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #2563eb;
  color: white;
  border-radius: 0.5rem;
  border: none;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.save-button:hover {
  background: #1d4ed8;
}

.save-button .icon {
  width: 1rem;
  height: 1rem;
}

/* Loading State */
.loading-container {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
  z-index: 40;
}

.loading-content {
  text-align: center;
}

.spinner {
  width: 3rem;
  height: 3rem;
  border: 4px solid #2563eb;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

.loading-text {
  color: #6b7280;
  font-weight: 500;
  margin: 0;
}

/* Error State */
.error-container {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
  z-index: 40;
  padding: 1rem;
}

.error-content {
  max-width: 28rem;
  width: 100%;
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
  text-align: center;
}

.error-icon-wrapper {
  width: 4rem;
  height: 4rem;
  background: #fee2e2;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
}

.error-icon {
  width: 2rem;
  height: 2rem;
  color: #dc2626;
}

.error-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 0.5rem;
}

.error-message {
  color: #6b7280;
  margin: 0 0 1.5rem;
  white-space: pre-line;
}

.download-button {
  width: 100%;
  padding: 0.5rem 1rem;
  background: #2563eb;
  color: white;
  border-radius: 0.5rem;
  border: none;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.download-button:hover {
  background: #1d4ed8;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>