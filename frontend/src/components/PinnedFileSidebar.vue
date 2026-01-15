<template>
  <div
    class="w-[280px] min-w-[280px] bg-white border-r border-gray-200 h-screen flex flex-col"
  >
    <!-- Header with Back Button -->
    <div class="p-4 border-b border-gray-200">
      <button
        @click="handleBack"
        class="flex items-center gap-2 text-gray-700 hover:text-[#0149C1] transition-colors group mb-4"
      >
        <ChevronLeft class="h-5 w-5" />
        <span class="text-sm font-medium">Quay lại</span>
      </button>
      <h2 class="text-lg font-bold text-gray-900">Tài liệu đã ghim</h2>
    </div>

    <!-- Pinned Files List -->
    <div class="flex-1 overflow-y-auto p-2">
      <div v-if="pinnedFiles.length === 0" class="text-center py-8 px-4">
        <Pin class="h-12 w-12 mx-auto text-gray-300 mb-2" />
        <p class="text-sm text-gray-500">Chưa có tài liệu được ghim</p>
        <p class="text-xs text-gray-400 mt-1">
          Ghim tài liệu để truy cập nhanh
        </p>
      </div>

      <div v-else class="space-y-1">
        <div
          v-for="file in pinnedFiles"
          :key="file.name"
          class="group relative flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          :class="{
            'bg-blue-50 hover:bg-blue-50': isCurrentFile(file),
          }"
          @click="selectFile(file)"
        >
          <!-- File Icon -->
          <div class="flex-shrink-0">
            <component
              :is="getFileIcon(file)"
              class="h-5 w-5"
              :class="
                isCurrentFile(file) ? 'text-[#0149C1]' : 'text-gray-600'
              "
            />
          </div>

          <!-- File Info -->
          <div class="flex-1 min-w-0">
            <p
              class="text-sm font-medium truncate"
              :class="
                isCurrentFile(file) ? 'text-[#0149C1]' : 'text-gray-900'
              "
            >
              {{ file.title }}
            </p>
            <p class="text-xs text-gray-500 truncate">
              {{ formatDate(file.modified) }}
            </p>
          </div>

          <!-- Unpin Button -->
          <button
            @click.stop="handleUnpin(file)"
            class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 transition-all"
            title="Bỏ ghim"
          >
            <X class="h-4 w-4 text-gray-600" />
          </button>

          <!-- Active Indicator -->
          <div
            v-if="isCurrentFile(file)"
            class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#0149C1] rounded-r"
          ></div>
        </div>
      </div>
    </div>

    <!-- Footer Tips -->
    <div class="p-3 border-t border-gray-100 bg-gray-50">
      <div class="flex items-start gap-2 text-xs text-gray-600">
        <Info class="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>Click chuột phải vào file và chọn "Ghim tài liệu" để thêm vào danh sách</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { usePinnedFiles } from '@/composables/usePinnedFiles'
import { ChevronLeft, Info, Pin, X } from 'lucide-vue-next'
import LucideFile from '~icons/lucide/file'
import LucideFileText from '~icons/lucide/file-text'
import LucideFolder from '~icons/lucide/folder'
import LucideImage from '~icons/lucide/image'
import LucideMusic from '~icons/lucide/music'
import LucideVideo from '~icons/lucide/video'

const {
  pinnedFiles,
  currentPinnedFile,
  unpinFile,
  openPinnedFile,
  closePinnedFile,
} = usePinnedFiles()

const emit = defineEmits(['back'])

const handleBack = () => {
  closePinnedFile()
  emit('back')
}

const handleUnpin = (file) => {
  unpinFile(file.name)
}

const selectFile = (file) => {
  openPinnedFile(file)
}

const isCurrentFile = (file) => {
  return currentPinnedFile.value?.name === file.name
}

const getFileIcon = (file) => {
  if (file.is_group) return LucideFolder
  
  const mimeType = file.mime_type || ''
  if (mimeType.startsWith('image/')) return LucideImage
  if (mimeType.startsWith('video/')) return LucideVideo
  if (mimeType.startsWith('audio/')) return LucideMusic
  if (mimeType.includes('text') || mimeType.includes('document')) return LucideFileText
  
  return LucideFile
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Vừa xong'
  if (diffMins < 60) return `${diffMins} phút trước`
  if (diffHours < 24) return `${diffHours} giờ trước`
  if (diffDays < 7) return `${diffDays} ngày trước`
  
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
</script>

<style scoped>
/* Custom scrollbar */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>

