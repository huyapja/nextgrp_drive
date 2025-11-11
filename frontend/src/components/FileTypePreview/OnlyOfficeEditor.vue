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
import { createResource } from 'frappe-ui'
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

// Lấy OnlyOffice server URL từ backend
const ONLYOFFICE_URL = 'http://localhost:8089' // Hoặc lấy từ config

// Resource để lấy editor config
const editorConfig = createResource({
  url: 'drive.api.onlyoffice.get_editor_config',
  auto: false,
  onSuccess(data) {
    console.log('Editor config loaded:', data)
    initEditor(data)
  },
  onError(err) {
    error.value = 'Không thể tải trình soạn thảo. Vui lòng thử lại sau.'
    loading.value = false
    console.error('Editor config error:', err)
  }
})

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
  // Kiểm tra xem script đã load chưa
  if (window.DocsAPI) {
    fetchEditorConfig()
    return
  }

  const script = document.createElement('script')
  // Dùng URL cố định đến OnlyOffice server
  script.src = `${ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js`
  
  console.log('Loading OnlyOffice script from:', script.src)
  
  script.onload = () => {
    console.log('OnlyOffice script loaded successfully')
    fetchEditorConfig()
  }
  
  script.onerror = () => {
    console.error('Failed to load OnlyOffice script from:', script.src)
    error.value = 'Không thể kết nối đến OnlyOffice Document Server. Vui lòng kiểm tra cấu hình.'
    loading.value = false
  }
  
  document.head.appendChild(script)
}

function fetchEditorConfig() {
  if (!props.previewEntity || !props.previewEntity.name) {
    error.value = 'Không tìm thấy thông tin file'
    loading.value = false
    return
  }

  console.log('Fetching config for entity:', props.previewEntity.name)
  editorConfig.fetch({
    entity_name: props.previewEntity.name
  })
}

function initEditor(config) {
  try {
    console.log('Initializing editor with config:', config)
    
    editorInstance.value = new window.DocsAPI.DocEditor('onlyoffice-editor', {
      documentServerUrl: ONLYOFFICE_URL + '/',
      ...config,
      height: '100%',
      width: '100%',
      events: {
        onReady: () => {
          loading.value = false
          console.log('OnlyOffice Editor ready')
        },
        onError: (event) => {
          console.error('OnlyOffice Error:', event)
          error.value = 'Có lỗi xảy ra khi tải trình soạn thảo: ' + (event.data || '')
          loading.value = false
        },
        onDocumentStateChange: (event) => {
          console.log('Document changed:', event.data)
        },
        onRequestSaveAs: (event) => {
          console.log('Save as requested:', event)
        }
      }
    })
  } catch (err) {
    console.error('Error initializing editor:', err)
    error.value = 'Không thể khởi tạo trình soạn thảo: ' + err.message
    loading.value = false
  }
}

function downloadFile() {
  window.location.href = `/api/method/drive.api.files.get_file_content?entity_name=${props.previewEntity.name}&trigger_download=1`
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