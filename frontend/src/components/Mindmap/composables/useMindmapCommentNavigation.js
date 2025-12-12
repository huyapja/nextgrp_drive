import { onMounted, onUnmounted } from "vue"

function getActiveEditor() {
  const focused = document.querySelector(".ProseMirror-focused")
  if (!focused) return null

  const editors = window.__ALL_EDITORS__ || []
  return editors.find((ed) => ed.view.dom === focused) || null
}

export function useMindmapCommentNavigation({
  activeNodeId,
  mergedGroupsFinal,
  nodeMap,
  emit,
}) {
  function hasNextGroup(nodeId) {
    const list = mergedGroupsFinal.value
    const index = list.findIndex((g) => g.node.id === nodeId)
    return index !== -1 && index < list.length - 1
  }

  function hasPrevGroup(nodeId) {
    const list = mergedGroupsFinal.value
    const index = list.findIndex((g) => g.node.id === nodeId)
    return index > 0
  }

  function selectNextGroup(currentNodeId) {
    if (!currentNodeId) return

    const list = mergedGroupsFinal.value
    if (!list.length) return

    const index = list.findIndex((g) => g.node.id === currentNodeId)
    if (index === -1) return

    const next = list[index + 1]
    if (!next) return

    const nextNodeId = next.node.id
    const node = nodeMap.value[nextNodeId] || { id: nextNodeId }

    emit("update:node", node)
  }

  function selectPrevGroup(currentNodeId) {
    if (!currentNodeId) return

    const list = mergedGroupsFinal.value
    if (!list.length) return

    const index = list.findIndex((g) => g.node.id === currentNodeId)
    if (index === -1) return

    const prev = list[index - 1]
    if (!prev) return

    const prevNodeId = prev.node.id
    const node = nodeMap.value[prevNodeId] || { id: prevNodeId }

    emit("update:node", node)
  }

  function handleKeyNavigation(e) {
    const editor = getActiveEditor()

    if (editor?.storage?.__mentionOpen) {
      return
    }
    
    if(editor?.isFocused){
      return
    }
    
    if (!activeNodeId.value) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (hasNextGroup(activeNodeId.value)) {
        selectNextGroup(activeNodeId.value)
      }
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (hasPrevGroup(activeNodeId.value)) {
        selectPrevGroup(activeNodeId.value)
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
