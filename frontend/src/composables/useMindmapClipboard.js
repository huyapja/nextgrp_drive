import { ref, computed } from 'vue'

export function useMindmapClipboard() {
  const clipboard = ref(null)
  const hasClipboard = computed(() => clipboard.value !== null)

  const setClipboard = (data) => {
    clipboard.value = data
  }

  const clearClipboard = () => {
    clipboard.value = null
  }

  return {
    clipboard,
    hasClipboard,
    setClipboard,
    clearClipboard,
  }
}

