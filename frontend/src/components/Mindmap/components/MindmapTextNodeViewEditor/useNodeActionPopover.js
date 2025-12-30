// useNodeActionPopover.js
import { ref } from 'vue'

const activePopover = ref(null)

export function useNodeActionPopover() {
  function toggle(id, popoverRef, event) {
    // nếu đang mở popover khác → đóng
    if (
      activePopover.value &&
      activePopover.value.id !== id &&
      activePopover.value.popover
    ) {
      activePopover.value.popover.hide()
    }

    // toggle popover hiện tại
    popoverRef.toggle(event)

    activePopover.value = {
      id,
      popover: popoverRef
    }
  }

  function close(id) {
    if (!activePopover.value) return
    if (!id || activePopover.value.id === id) {
      activePopover.value.popover.hide()
      activePopover.value = null
    }
  }

  return {
    toggle,
    close
  }
}
