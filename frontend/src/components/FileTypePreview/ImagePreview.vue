<template>
  <div class="image-preview-container">
    <img
      :src="previewURL"
      class="preview-image"
      @click="openFullPreview"
    />

    <!-- Fullscreen preview -->
    <!-- <div
      v-if="showFull"
      class="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center"
      @click.self="closeFullPreview"
    >
      <img
        :src="previewURL"
        class="max-w-full max-h-full object-contain"
        :style="{ imageRendering: 'auto' }"
      />

      <button
      class="absolute top-4 right-4 text-white text-2xl font-bold hover:bg-white hover:bg-opacity-20 rounded-full w-10 h-10 flex items-center justify-center transition-colors"
      @click="goBack"
      >
      ×
    </button>
  </div> -->
  <!-- Close button for fullscreen (top-right) -->
  </div>
</template>

<script setup>
import { useObjectUrl } from "@vueuse/core"
import { ref, watch } from "vue"
import { useRouter } from "vue-router"

const props = defineProps({
  previewEntity: Object,
})

const emit = defineEmits(['back'])

const router = useRouter()
const imgBlob = ref(null)
const previewURL = useObjectUrl(imgBlob)
const showFull = ref(false)

watch(
  () => props.previewEntity,
  () => fetchContent(),
  { immediate: true }
)

async function fetchContent() {
  const res = await fetch(
    `/api/method/drive.api.files.get_file_content?entity_name=${props.previewEntity.name}`,
    { method: "GET" }
  )
  if (res.ok) {
    imgBlob.value = await res.blob()
  }
}

function openFullPreview() {
  showFull.value = true
  document.body.style.overflow = "hidden"
}

function closeFullPreview() {
  showFull.value = false
  document.body.style.overflow = ""
}

function goBack() {
  if (showFull.value) {
    closeFullPreview()
  }
  emit('back')
  router.back()
}
</script>

<style scoped>
.image-preview-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: calc(100vh - 70px);
  overflow: hidden;
  padding: 1rem;
  background: #f5f5f5;
}

.image-preview-container:fullscreen {
  height: 100vh;
  background: #000;
  padding: 2rem;
}

.preview-image {
  max-width: 100%;
  max-height: calc(100vh - 90px);
  width: auto;
  height: auto;
  object-fit: contain;
  background-image: linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(135deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(135deg, white 75%, #ccc 75%);
  background-size: 30px 30px;
  background-position: 0 0, 15px 0, 15px -15px, 0px 15px;
}

.image-preview-container:fullscreen .preview-image {
  max-height: calc(100vh - 4rem);
}
</style>
