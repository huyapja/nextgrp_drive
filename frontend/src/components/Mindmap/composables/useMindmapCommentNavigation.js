import { onMounted, onUnmounted } from "vue"

function getActiveEditor() {
  const focused = document.querySelector(".ProseMirror-focused")
  if (!focused) return null

  const editors = window.__ALL_EDITORS__ || []
  return editors.find((ed) => ed.view.dom === focused) || null
}

export function useMindmapCommentNavigation({
  activeGroupKey,
  mergedGroupsFinal,
  nodeMap,
  emit,
  galleryVisible,
  groupKeyOf,
  focusEditorOf,
}) {
  function getIndex(key) {
    return mergedGroupsFinal.value.findIndex((g) => groupKeyOf(g) === key)
  }

  function hasNextGroup(key) {
    const index = getIndex(key)
    return index !== -1 && index < mergedGroupsFinal.value.length - 1
  }

  function hasPrevGroup(key) {
    const index = getIndex(key)
    return index > 0
  }

  function selectNextGroup(currentKey) {
    if (!currentKey) return
    if (galleryVisible.value) return

    const index = getIndex(currentKey)
    if (index === -1) return

    const next = mergedGroupsFinal.value[index + 1]
    if (!next) return

    const nextKey = groupKeyOf(next)

    // set active group → đúng session luôn
    activeGroupKey.value = nextKey

    // vẫn emit node để mindmap highlight đúng node (không mất session)
    const nodeId = next.node.id
    const node = nodeMap.value[nodeId] || { id: nodeId }
    emit("update:node", node)
    requestAnimationFrame(() => {
      focusEditorOf(next)
    })
  }

  function selectPrevGroup(currentKey) {
    if (!currentKey) return
    if (galleryVisible.value) return

    const index = getIndex(currentKey)
    if (index === -1) return

    const prev = mergedGroupsFinal.value[index - 1]
    if (!prev) return

    const prevKey = groupKeyOf(prev)

    activeGroupKey.value = prevKey

    const nodeId = prev.node.id
    const node = nodeMap.value[nodeId] || { id: nodeId }
    emit("update:node", node)
    requestAnimationFrame(() => {
      focusEditorOf(prev)
    })
  }

  function handleKeyNavigation(e) {
    const editor = getActiveEditor()

    // đang mở mention → không navigate
    if (editor?.storage?.__mentionOpen) return

    // đang focus editor → không navigate
    if (editor?.isFocused) return

    if (!activeGroupKey.value) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (hasNextGroup(activeGroupKey.value)) {
        selectNextGroup(activeGroupKey.value)
      }
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (hasPrevGroup(activeGroupKey.value)) {
        selectPrevGroup(activeGroupKey.value)
      }
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", handleKeyNavigation)
  })

  onUnmounted(() => {
    window.removeEventListener("keydown", handleKeyNavigation)
  })

  return {
    hasNextGroup,
    hasPrevGroup,
    selectNextGroup,
    selectPrevGroup,
  }
}
