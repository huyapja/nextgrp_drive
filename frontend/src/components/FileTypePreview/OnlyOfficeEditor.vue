<template>
  <div class="onlyoffice-container">
    <div v-if="loading" class="text-center mt-10 text-gray-500">
      Đang tải trình soạn thảo...
    </div>
    <div v-else-if="error" class="text-center mt-10 text-red-500">
      {{ error }}
      <Button class="mt-4" variant="solid" @click="downloadFile">
        Tải xuống
      </Button>
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

console.log('OnlyOffice URL:', ONLYOFFICE_URL)


onMounted(() => {
  loadOnlyOfficeScript()
})

onUnmounted(() => {
  // Cleanup editor instance
  if (editorInstance.value && editorInstance.value.destroyEditor) {
    editorInstance.value.destroyEditor()
  }
})

function loadOnlyOfficeScript() {
  console.log('🔍 [1] loadOnlyOfficeScript called')
  console.log('    ONLYOFFICE_URL:', ONLYOFFICE_URL)
  
  // Kiểm tra xem script đã load chưa
  if (window.DocsAPI) {
    console.log('✅ [2] DocsAPI already loaded')
    fetchEditorConfig()
    return
  }

  console.log('⏳ [2] Loading OnlyOffice script...')
  const script = document.createElement('script')
  script.src = `${ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js`
  
  console.log('    Script URL:', script.src)
  
  script.onload = () => {
    console.log('✅ [3] OnlyOffice script loaded successfully')
    console.log('    window.DocsAPI:', window.DocsAPI ? 'exists' : 'NOT FOUND')
    fetchEditorConfig()
  }
  
  script.onerror = () => {
    console.error('❌ [3] Failed to load OnlyOffice script')
    console.error('    URL:', script.src)
    error.value = 'Không thể kết nối đến OnlyOffice Document Server. Vui lòng kiểm tra cấu hình.'
    loading.value = false
  }
  
  script.async = true
  script.defer = true
  document.head.appendChild(script)
}

function fetchEditorConfig() {
  console.log('🔍 [4] fetchEditorConfig called')
  
  if (!props.previewEntity || !props.previewEntity.name) {
    console.error('❌ [4] No previewEntity')
    error.value = 'Không tìm thấy thông tin file'
    loading.value = false
    return
  }

  console.log('    Entity name:', props.previewEntity.name)
  console.log('    Entity title:', props.previewEntity.title)
  
  editorConfigResource.fetch({
    entity_name: props.previewEntity.name
  })
}

const editorConfigResource = createResource({
  url: 'drive.api.onlyoffice.get_editor_config',
  auto: false,
  onSuccess(data) {
    console.log('✅ [5] Editor config received from backend')
    console.log('    Config:', data)
    console.log('    Token:', data.token ? `${data.token.substring(0, 20)}...` : 'EMPTY')
    console.log('    File URL:', data.url)
    console.log('    DocumentType:', data.documentType)
    
    // Check if token is empty
    if (!data.token) {
      console.warn('⚠️  Token is empty! This might cause security errors.')
    }
    
    initEditor(data)
  },
  onError(err) {
    console.error('❌ [5] Error fetching editor config')
    console.error('    Full error:', err) 
    console.error('    Error message:', err.message)
    console.error('    Error response:', err.response)
    error.value = 'Không thể tải trình soạn thảo. Vui lòng thử lại sau.'
    loading.value = false
  }
})

function initEditor(config) {
  try {
    console.log('🔍 [6] initEditor called')
    console.log('    Config keys:', Object.keys(config))
    console.log('    window.DocsAPI:', window.DocsAPI ? 'exists' : 'NOT FOUND')
    
    if (!window.DocsAPI) {
      throw new Error('window.DocsAPI is not defined')
    }
    
    console.log('    Creating DocEditor...')
    
    const editorConfig = {
      documentServerUrl: ONLYOFFICE_URL + '/',
      ...config,
      height: '100%',
      width: '100%',
      events: {
        onReady: () => {
          console.log('✅ [7] OnlyOffice Editor ready')
          loading.value = false
        },
        onError: (event) => {
          console.error('❌ [7] OnlyOffice Error event:', event)
          console.error('    Error code:', event.errorCode)
          console.error('    Error message:', event.errorMessage)
          console.error('    Event data:', event.data)
          error.value = 'Có lỗi xảy ra khi tải trình soạn thảo: ' + (event.data || event.errorMessage || '')
          loading.value = false
        },
        onDocumentStateChange: (event) => {
          console.log('📝 [7] Document changed:', event.data)
        },
        onRequestSaveAs: (event) => {
          console.log('💾 [7] Save as requested:', event)
        },
        onRequestClose: () => {
          console.log('🚪 [7] Close requested')
        }
      }
    }
    
    console.log('    Editor config:', editorConfig)
    
    editorInstance.value = new window.DocsAPI.DocEditor('onlyoffice-editor', editorConfig)
    
    console.log('✅ [6] DocEditor instance created')
  } catch (err) {
    console.error('❌ [6] Error initializing editor:', err)
    console.error('    Error message:', err.message)
    console.error('    Stack:', err.stack)
    error.value = 'Không thể khởi tạo trình soạn thảo: ' + err.message
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
</style>