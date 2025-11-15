<template>
  <div class="onlyoffice-container">
    <div v-if="loading" class="text-center mt-10 text-gray-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
        Đang tải trình soạn thảo...
    </div>
    <div v-else-if="error" class="text-center mt-10 text-red-500 px-4">
      <div class="max-w-md mx-auto">
        <svg class="mx-auto h-12 w-12 text-red-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p class="font-medium mb-2">{{ error }}</p>
        <Button class="mt-4" variant="solid" @click="downloadFile">
          Tải xuống file
        </Button>
      </div>
    </div>
    <div id="onlyoffice-editor" class="editor"></div>
  </div>
</template>

<script setup>
import { Button, createResource } from 'frappe-ui'
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  previewEntity: {
    type: Object,
    required: true,
  },
})

const loading = ref(true)
const error = ref('')
const editorInstance = ref(null)

// Lấy OnlyOffice server URL từ backend config hoặc default
const ONLYOFFICE_URL = window.frappe?.settings?.onlyoffice_url || 'http://localhost:8089'

console.log('🔧 OnlyOffice URL:', ONLYOFFICE_URL)
console.log('📄 Preview Entity:', props.previewEntity)

onMounted(() => {
  loadOnlyOfficeScript()
})

onUnmounted(() => {
  // Cleanup editor instance
  if (editorInstance.value && editorInstance.value.destroyEditor) {
    try {
      editorInstance.value.destroyEditor()
      console.log('✅ Editor destroyed')
    } catch (e) {
      console.error('Error destroying editor:', e)
    }
  }
})

function loadOnlyOfficeScript() {
  console.log('🔍 [1] Loading OnlyOffice script...')
  
  // Kiểm tra xem script đã load chưa
  if (window.DocsAPI) {
    console.log('✅ [2] DocsAPI already loaded')
    fetchEditorConfig()
    return
  }

  const script = document.createElement('script')
  script.src = `${ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js`
  
  console.log('    📡 Script URL:', script.src)
  
  script.onload = () => {
    console.log('✅ [2] OnlyOffice script loaded')
    fetchEditorConfig()
  }
  
  script.onerror = (e) => {
    console.error('❌ [2] Failed to load OnlyOffice script:', e)
    error.value = `Không thể kết nối đến OnlyOffice Document Server tại ${ONLYOFFICE_URL}. Vui lòng kiểm tra:\n- Document Server đang chạy\n- URL cấu hình đúng\n- Không có lỗi CORS`
    loading.value = false
  }
  
  document.head.appendChild(script)
}

function fetchEditorConfig() {
  console.log('🔍 [3] Fetching editor config...')
  
  if (!props.previewEntity || !props.previewEntity.name) {
    console.error('❌ No previewEntity')
    error.value = 'Không tìm thấy thông tin file'
    loading.value = false
    return
  }

  console.log('    📝 Entity:', props.previewEntity.name, '-', props.previewEntity.title)
  
  editorConfigResource.fetch({
    entity_name: props.previewEntity.name
  })
}

const editorConfigResource = createResource({
  url: 'drive.api.onlyoffice.get_editor_config',
  auto: false,
  onSuccess(data) {
    console.log('✅ [4] Config received from backend')
    console.log('    📦 Full config:', data)
    
    if (!data.token) {
      console.warn('⚠️ Token is empty! JWT might be disabled.')
    } else {
      console.log('🔐 Token:', data.token.substring(0, 30) + '...')
    }
    
    // Kiểm tra URL của document
    if (data.document && data.document.url) {
      console.log('📎 Document URL:', data.document.url)
    } else {
      console.error('❌ No document URL in config!')
    }
    
    initEditor(data)
  },
  onError(err) {
    console.error('❌ [4] Error fetching config:', err)
    error.value = 'Không thể tải cấu hình trình soạn thảo. Vui lòng thử lại.'
    loading.value = false
  }
})

function initEditor(config) {
  try {
    console.log('🔍 [5] Initializing editor...')
    
    if (!window.DocsAPI) {
      throw new Error('window.DocsAPI is not defined')
    }
    const editorConfig = {
      ...config,
      height: '100%',
      width: '100%',
      events: {
        onAppReady: () => {
          console.log('✅ [6] Editor ready!')
          loading.value = false
        },
        onWarning(event) { 
          console.log(event,`ONLYOFFICE Document Editor reports a warning: code ${event.data.warningCode}, description ${event.data.warningDescription}`);
        },
 
        onError: (event) => {
          console.error('❌ [6] OnlyOffice Error:', event)
          
          let errorMsg = 'Có lỗi xảy ra khi tải trình soạn thảo'
          
          if (event.data) {
            const errorCode = event.data.errorCode
            const errorDesc = event.data.errorDescription
            
            console.error('    Error code:', errorCode)
            console.error('    Error description:', errorDesc)
            
            // Map error codes to Vietnamese messages
            switch (errorCode) {
              case -20:
                errorMsg = 'Lỗi xác thực JWT token. Vui lòng kiểm tra cấu hình secret key.'
                break
              case -3:
                errorMsg = 'Không thể tải file. Document Server không thể truy cập URL của file.'
                break
              case -4:
                errorMsg = 'Lỗi tải file từ storage.'
                break
              case -8:
                errorMsg = 'Lỗi callback URL. OnlyOffice không thể gọi lại server để lưu file.'
                break
              default:
                errorMsg = errorDesc || errorMsg
            }
          }
          
          error.value = errorMsg
          loading.value = false
        },
        onDocumentStateChange: (event) => {
          console.log('📝 Document state changed:', event.data)
        },
        onRequestSaveAs: (event) => {
          console.log('💾 Save as requested:', event)
        },
        onRequestClose: () => {
          console.log('🚪 Close requested')
        },
        onDownloadAs: (event) => {
          console.log('📥 Download as requested:', event)
        }
      }
    }
    
    console.log('    📋 Final editor config:', editorConfig)
    
    // Tạo editor instance
    editorInstance.value = new DocsAPI.DocEditor('onlyoffice-editor', editorConfig)
    
    console.log('✅ [5] DocEditor created successfully')
    
  } catch (err) {
    console.error('❌ [5] Error initializing editor:', err)
    error.value = `Không thể khởi tạo trình soạn thảo: ${err.message}`
    loading.value = false
  }
}

function downloadFile() {
  const entity = props.previewEntity
  console.log('📥 Downloading file:', entity.name)
  window.location.href = `/api/method/drive.api.files.get_file_content?entity_name=${entity.name}&trigger_download=1`
}
</script>

<style scoped>
.onlyoffice-container {
  width: 100%;
  height: calc(100vh - 72px);
  position: relative;
  background: #f5f5f5;
}

.editor {
  width: 100%;
  height: 100%;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>