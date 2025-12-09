import { onMounted, onUnmounted, ref } from "vue"

export function useMindmapCommentMenu() {
  const activeComment = ref(null)
  const anchorEl = ref(null)
  const dropdownStyle = ref({})

  function openCommentMenu(comment, event) {
    if (!comment?.name || !event?.currentTarget) return

    if (activeComment.value?.name === comment.name) {
      closeCommentMenu()
      return
    }

    activeComment.value = comment
    anchorEl.value = event.currentTarget

    const rect = anchorEl.value.getBoundingClientRect()

    dropdownStyle.value = {
      position: "fixed",
      top: `${rect.bottom + 6}px`,
      left: `${rect.left - 140 + rect.width}px`,
      zIndex: 99999,
    }
  }

  function closeCommentMenu() {
    activeComment.value = null
    anchorEl.value = null
  }

  function handleEditComment(onEdit) {
    if (!activeComment.value) return
    onEdit?.(activeComment.value)
    closeCommentMenu()
  }

  function handleDeleteComment(onDelete) {
    if (!activeComment.value) return
    onDelete?.(activeComment.value)
    closeCommentMenu()
  }

  function handleGlobalClick(e) {
    if (!anchorEl.value) return
    if (anchorEl.value.contains(e.target)) return
    if (e.target.closest("[data-comment-dropdown]")) return
    closeCommentMenu()
  }

  onMounted(() => {
    document.addEventListener("mousedown", handleGlobalClick, true)
  })

  onUnmounted(() => {
    document.removeEventListener("mousedown", handleGlobalClick, true)
  })

  return {
    activeComment,
    dropdownStyle,
    openCommentMenu,
    handleEditComment,
    handleDeleteComment,
  }
}
