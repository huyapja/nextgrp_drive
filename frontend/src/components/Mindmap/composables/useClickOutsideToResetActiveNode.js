import { onMounted, onUnmounted } from "vue"

export function useClickOutsideToResetActiveNode({
  activeGroupKey,
  inputValue,
  previewImages,
}) {
  function handleClickOutside(e) {
    if (!activeGroupKey.value) return

    // click trong panel
    if (e.target.closest("[data-comment-panel]")) return

    // click vào từng comment item
    if (e.target.closest("[data-comment-id]")) return

    // click vào editor
    if (e.target.closest(".ProseMirror")) return

    // click vào mention dropdown
    if (e.target.closest("[data-mention-item]")) return

    // click vào menu dropdown
    if (e.target.closest("[data-comment-dropdown]")) return
    if (e.target.closest("[data-comment-more]")) return

    // click vào các nút prev/next group
    if (e.target.closest(".pi-angle-up")) return
    if (e.target.closest(".pi-angle-down")) return

    // click vào icon resolve / copy link
    if (e.target.closest(".pi-link")) return
    if (e.target.closest(".pi-check-circle")) return

    // đang gõ text hoặc đang có ảnh upload
    if (inputValue.value.trim()) return
    if (previewImages.value.length) return

    // reset
    activeGroupKey.value = null
  }

  onMounted(() => {
    document.addEventListener("mousedown", handleClickOutside)
  })

  onUnmounted(() => {
    document.removeEventListener("mousedown", handleClickOutside)
  })
}
