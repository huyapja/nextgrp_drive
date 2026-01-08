<template>
  <img
    ref="imgRef"
    :src="currentSrc"
    :class="props.class"
    :alt="props.alt"
    :draggable="props.draggable"
    @error="onError"
    @load="onLoad"
  />
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue"
import { thumbnailQueue } from "@/utils/thumbnailQueue"

const props = defineProps({
  entityName: String,
  thumbnailUrl: String,
  fallbackUrl: String,
  class: String,
  alt: String,
  draggable: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(["load", "error"])

const imgRef = ref(null)
const currentSrc = ref(props.fallbackUrl)
const loaded = ref(false)
let cancelLoad = null
let observer = null

const loadThumbnail = () => {
  if (!props.thumbnailUrl || !props.entityName) return

  cancelLoad = thumbnailQueue.add(props.entityName, (url) => {
    if (url) {
      currentSrc.value = url
    }
  })
}

onMounted(() => {
  if (!props.thumbnailUrl) return

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadThumbnail()
          observer?.disconnect()
        }
      })
    },
    { rootMargin: "100px" }
  )

  if (imgRef.value) {
    observer.observe(imgRef.value)
  }
})

onUnmounted(() => {
  observer?.disconnect()
  cancelLoad?.()
})

watch(
  () => props.entityName,
  () => {
    cancelLoad?.()
    currentSrc.value = props.fallbackUrl
    loaded.value = false
    if (observer && imgRef.value) {
      observer.disconnect()
      observer.observe(imgRef.value)
    }
  }
)

const onError = (e) => {
  currentSrc.value = props.fallbackUrl
  emit("error", e)
}

const onLoad = () => {
  loaded.value = true
  emit("load")
}
</script>

