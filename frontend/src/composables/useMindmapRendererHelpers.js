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

    const checkAndScroll = () => {
      const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
      if (renderer && renderer.positions && renderer.positions.size > 0) {
        const node = nodes.value.find(n => n.id === nodeId)
        if (node) {
          renderer.scrollToNode(nodeId)
        }
      } else {
        setTimeout(checkAndScroll, 100)
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

