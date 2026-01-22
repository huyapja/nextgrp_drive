import { ref } from 'vue'

export function useMindmapHistory() {
  const historyStack = ref([])
  const historyIndex = ref(-1)
  const MAX_HISTORY_SIZE = 50
  const isRestoringSnapshot = ref(false)


  const saveSnapshot = (force = false) => {
    if (isRestoringSnapshot.value && !force) {
      return
    }

    const currentElements = JSON.parse(JSON.stringify(window.__mindmapElements || []))
    const currentCreationOrder = new Map(window.__mindmapCreationOrder || new Map())

    if (historyStack.value.length > 0 && !force) {
      const lastSnapshot = historyStack.value[historyIndex.value]
      if (lastSnapshot) {
        const currentStr = JSON.stringify(currentElements)
        const lastStr = JSON.stringify(lastSnapshot.elements)
        if (currentStr === lastStr) {
          return
        }
      }
    }

    const snapshot = {
      elements: currentElements,
      creationOrder: new Map(currentCreationOrder),
      timestamp: Date.now()
    }

    if (historyIndex.value < historyStack.value.length - 1) {
      historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
    }

    historyStack.value.push(snapshot)
    historyIndex.value = historyStack.value.length - 1

    if (historyStack.value.length > MAX_HISTORY_SIZE) {
      historyStack.value.shift()
      historyIndex.value = Math.max(0, historyIndex.value - 1)
    }
  }

  const logHistory = () => {
    console.log('[History] Snapshot history:', {
      total: historyStack.value.length,
      current: historyIndex.value
    })

    historyStack.value.forEach((snapshot, idx) => {
      const isCurrent = idx === historyIndex.value
      const nodes = snapshot.elements.filter(el => el.id && !el.source && !el.target)
      console.log(`  ${isCurrent ? '➤' : ' '} [${idx}] ${nodes.length} nodes, order: ${snapshot.creationOrder.size} entries, time: ${new Date(snapshot.timestamp).toLocaleTimeString()}`)
    })
  }

  return {
    historyStack,
    historyIndex,
    MAX_HISTORY_SIZE,
    isRestoringSnapshot,
    saveSnapshot,
    logHistory,
  }
}

