import { onMounted, onUnmounted } from "vue"

export function useClickOutsideToResetActiveNode({
  activeNodeId,
  inputValue,
  previewImages,
}) {
  function handleClickOutside(e) {
    if (!activeNodeId.value) return

    // ❌ click trong panel
    if (e.target.closest("[data-comment-panel]")) return

    // ❌ click editor
    if (e.target.closest(".ProseMirror")) return

    // ❌ mention dropdown
    if (e.target.closest("[data-mention-item]")) return

    // ❌ menu / dropdown
    if (e.target.closest("[data-comment-dropdown]")) return
    if (e.target.closest("[data-comment-more]")) return

    // ❌ đang có nội dung
    if (inputValue.value.trim()) return
    if (previewImages.value.length) return

    // ✅ reset
    activeNodeId.value = null
  }

  onMounted(() => {
    document.addEventListener("mousedown", handleClickOutside)
  })

  onUnmounted(() => {
    document.removeEventListener("mousedown", handleClickOutside)
  })
}
