<template>
  <div class="flex-1 h-screen overflow-hidden bg-gray-50">
    <template v-if="currentPinnedFile">
      <!-- File Header -->
      <div class="bg-white border-b border-gray-200 px-6 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <component
              :is="getFileIcon(currentPinnedFile)"
              class="h-6 w-6 text-[#0149C1]"
            />
            <div>
              <h1 class="text-xl font-bold text-gray-900">
                {{ currentPinnedFile.title }}
              </h1>
              <p class="text-sm text-gray-500">
                {{ formatFileInfo(currentPinnedFile) }}
              </p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2">
            <button
              @click="handleDownload"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Download class="h-4 w-4" />
              Tải xuống
            </button>
            <button
              @click="handlePin"
              class="px-4 py-2 text-sm font-medium text-white bg-[#0149C1] rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <PinOff class="h-4 w-4" />
              Bỏ ghim
            </button>
          </div>
        </div>
      </div>

      <!-- File Content Area -->
      <div class="h-[calc(100vh-80px)] overflow-y-auto p-6">
        <div class="max-w-7xl mx-auto">
          <LoadingIndicator
            v-if="fileResource.loading"
            class="w-10 h-full text-neutral-100"
          />
          <ErrorPage
            v-else-if="fileResource.error"
            :error="fileResource.error"
          />
          <FileRender
            v-else-if="fileResource.data"
            :preview-entity="fileResource.data"
          />
        </div>
      </div>
    </template>

    <!-- Empty State -->
    <div v-else class="h-full flex items-center justify-center">
      <div class="text-center px-4">
        <FileText class="h-20 w-20 mx-auto text-gray-300 mb-4" />
        <h3 class="text-lg font-semibold text-gray-900 mb-2">
          Chưa chọn văn bản
        </h3>
        <p class="text-sm text-gray-500 max-w-md">
          Chọn một văn bản từ danh sách bên trái để xem nội dung
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { usePinnedFiles } from '@/composables/usePinnedFiles'
import { createResource, LoadingIndicator } from 'frappe-ui'
import FileRender from '@/components/FileRender.vue'
import ErrorPage from '@/components/ErrorPage.vue'
import { Download, PinOff, FileText } from 'lucide-vue-next'
import LucideFile from '~icons/lucide/file'
import LucideFileText from '~icons/lucide/file-text'
import LucideImage from '~icons/lucide/image'
import LucideVideo from '~icons/lucide/video'
import LucideMusic from '~icons/lucide/music'
import LucideFolder from '~icons/lucide/folder'

const { currentPinnedFile, unpinFile } = usePinnedFiles()

// Resource to fetch file details
const fileResource = createResource({
  url: 'drive.api.files.get_entity',
  params: {
    entity_name: computed(() => currentPinnedFile.value?.name),
  },
  auto: false,
})

// Watch for file changes and fetch data
watch(
  currentPinnedFile,
  (newFile) => {
    if (newFile) {
      fileResource.fetch()
    }
  },
  { immediate: true }
)

const getFileIcon = (file) => {
  if (file.is_group) return LucideFolder
  
  const mimeType = file.mime_type || ''
  if (mimeType.startsWith('image/')) return LucideImage
  if (mimeType.startsWith('video/')) return LucideVideo
  if (mimeType.startsWith('audio/')) return LucideMusic
  if (mimeType.includes('text') || mimeType.includes('document')) return LucideFileText
  
  return LucideFile
}

const formatFileInfo = (file) => {
  if (!file) return ''
  
  const parts = []
  
  // Add file type
  if (file.mime_type) {
    const typeParts = file.mime_type.split('/')
    if (typeParts[1]) {
      parts.push(typeParts[1].toUpperCase())
    }
  }
  
  // Add modified date
  if (file.modified) {
    const date = new Date(file.modified)
    parts.push(`Cập nhật ${date.toLocaleDateString('vi-VN')}`)
  }
  
  // Add owner
  if (file.owner) {
    parts.push(`bởi ${file.owner}`)
  }
  
  return parts.join(' • ')
}

const handleDownload = () => {
  if (currentPinnedFile.value) {
    window.location.href = `/api/method/drive.api.files.get_file_content?entity_name=${currentPinnedFile.value.name}&trigger_download=1`
  }
}

const handlePin = () => {
  if (currentPinnedFile.value) {
    unpinFile(currentPinnedFile.value.name)
  }
}
</script>

<style scoped>
/* Custom scrollbar */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #f3f4f6;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>

