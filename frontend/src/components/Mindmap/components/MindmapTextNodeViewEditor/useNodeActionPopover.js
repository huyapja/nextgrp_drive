// useNodeActionPopover.js
import { ref } from 'vue'

/**
 * GLOBAL SINGLETON
 * → shared cho TẤT CẢ NodeView
 */
const activeNodeId = ref(null)
const activePopoverRef = ref(null)

export function useNodeActionPopover() {
  /**
   * Toggle popover cho 1 node
   *
   * @param {string} nodeId
   * @param {Object} popoverRef - ref của <Popover>
   * @param {MouseEvent} event
   */
  function toggle(nodeId, popoverRef, event) {
    if (!popoverRef) return

    // ================================
    // CASE 1: click lại cùng node → ĐÓNG
    // ================================
    if (activeNodeId.value === nodeId) {
      popoverRef.hide?.()
      activeNodeId.value = null
      activePopoverRef.value = null
      return
    }

    // ================================
    // CASE 2: đang mở popover khác → ĐÓNG TRƯỚC
    // ================================
    if (
      activePopoverRef.value &&
      activePopoverRef.value !== popoverRef
    ) {
      activePopoverRef.value.hide?.()
    }

    // ================================
    // CASE 3: mở popover mới
    // ================================
    activeNodeId.value = nodeId
    activePopoverRef.value = popoverRef

    // PrimeVue Popover
    popoverRef.show?.(event)
  }

  /**
   * Đóng popover hiện tại
   * - gọi khi ESC
   * - gọi khi click outside
   * - gọi khi scroll / blur
   */
  function close() {
    if (!activePopoverRef.value) return

    activePopoverRef.value.hide?.()
    activePopoverRef.value = null
    activeNodeId.value = null
  }

  /**
   * Kiểm tra node này có đang active không
   */
  function isActive(nodeId) {
    return activeNodeId.value === nodeId
  }

  return {
    toggle,
    close,
    isActive,
  }
}
