/**
 * Mindmap Renderer Helper Functions
 * Các utilities nhỏ hỗ trợ D3 renderer
 */
export function useMindmapRendererHelpers({
  d3Renderer,
  nodes,
  edges,
  elements
}) {
  
  /**
   * Scroll to node from URL hash
   */
  const scrollToNodeFromHash = () => {
    const hash = window.location.hash
    if (!hash || !hash.startsWith('#node-')) return

    const nodeId = hash.replace('#node-', '')
    if (!nodeId) return

    console.log(`[scrollToNodeFromHash] Attempting to scroll to node: ${nodeId}`)

    let retryCount = 0
    const maxRetries = 20 // Tối đa 2 giây (20 * 100ms)

    const checkAndScroll = () => {
      const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
      
      // Debug: log trạng thái renderer
      if (retryCount === 0) {
        console.log(`[scrollToNodeFromHash] Initial check - Renderer exists: ${!!renderer}, Has positions: ${!!renderer?.positions}, Positions size: ${renderer?.positions?.size || 0}, Nodes count: ${nodes.value?.length || 0}`)
      }
      
      if (renderer && renderer.positions && renderer.positions.size > 0) {
        const node = nodes.value.find(n => n.id === nodeId)
        if (node) {
          console.log(`[scrollToNodeFromHash] ✅ Scrolling to node ${nodeId}`)
          renderer.scrollToNode(nodeId)
        } else {
          console.warn(`[scrollToNodeFromHash] ⚠️ Node ${nodeId} not found in nodes array (${nodes.value.length} nodes total)`)
        }
      } else {
        retryCount++
        if (retryCount < maxRetries) {
          // Chỉ log mỗi 5 lần để giảm spam
          if (retryCount % 5 === 0) {
            console.log(`[scrollToNodeFromHash] Renderer not ready yet, retrying (${retryCount}/${maxRetries})...`)
          }
          setTimeout(checkAndScroll, 100)
        } else {
          console.warn(`[scrollToNodeFromHash] ❌ Gave up after ${maxRetries} retries. Renderer: ${!!renderer}, Positions: ${!!renderer?.positions}, Size: ${renderer?.positions?.size || 0}`)
        }
      }
    }

    checkAndScroll()
  }

  /**
   * Sync elements position với D3 renderer
   */
  const syncElementsWithRendererPosition = () => {
    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
    if (!renderer?.positions?.size) return

    const newNodes = nodes.value.map(n => {
      const pos = renderer.positions.get(n.id)
      if (!pos) return n
      return {
        ...n,
        position: { x: pos.x, y: pos.y }
      }
    })

    elements.value = [
      ...newNodes,
      ...edges.value
    ]
  }

  return {
    scrollToNodeFromHash,
    syncElementsWithRendererPosition
  }
}

