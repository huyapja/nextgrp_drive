import { ref, computed, onMounted, onBeforeUnmount } from "vue"

export function useMindmapGallery() {
  const galleryVisible = ref(false)
  const galleryIndex = ref(0)
  const galleryItems = ref([])

  function openGallery(images, index = 0) {
    galleryItems.value = images.map((src) => ({
      itemImageSrc: src,
      thumbnailImageSrc: src,
    }))
    galleryIndex.value = index
    galleryVisible.value = true
  }

  function closeGallery() {
    galleryVisible.value = false
  }

  function handleGalleryKeydown(e) {
    if (!galleryVisible.value) return

    const allowedKeys = ["ArrowLeft", "ArrowRight", "Escape"]

    if (!allowedKeys.includes(e.key)) {
      e.preventDefault()
      e.stopPropagation()
      return
    }

    if (e.key === "ArrowRight") {
      e.preventDefault()
      galleryIndex.value = (galleryIndex.value + 1) % galleryItems.value.length
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault()
      galleryIndex.value =
        (galleryIndex.value - 1 + galleryItems.value.length) %
        galleryItems.value.length
    }

    if (e.key === "Escape") {
      e.preventDefault()
      closeGallery()
    }
  }

  const galleryCounterText = computed(() => {
    if (!galleryVisible.value || !galleryItems.value.length) return ""
    return `${galleryIndex.value + 1}/${galleryItems.value.length}`
  })

  onMounted(() => {
    window.addEventListener("keydown", handleGalleryKeydown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleGalleryKeydown)
  })

  function openGalleryFromEditor(images, index) {
    galleryItems.value = images.map((src) => ({
      itemImageSrc: src,
      thumbnailImageSrc: src,
    }))
    galleryIndex.value = index
    galleryVisible.value = true
  }

  return {
    galleryVisible,
    galleryIndex,
    galleryItems,
    galleryCounterText,
    openGallery,
    closeGallery,
    openGalleryFromEditor
  }
}
