import { ref } from "vue"

export function usePanelClose(emit, commentEditorRef) {
  const closing = ref(false)

  function clearCommentIdFromUrl() {
    const url = new URL(window.location.href)
    url.searchParams.delete("node")
    url.hash = ""
    window.history.replaceState({}, "", url.toString())
  }

  function handleClose() {
    closing.value = true
    commentEditorRef?.value?.blur?.()

    clearCommentIdFromUrl()

    setTimeout(() => {
      emit("close")
      closing.value = false
    }, 250)
  }

  return {
    closing,
    handleClose,
  }
}
