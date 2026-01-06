import { nextTick } from 'vue'

/**
 * Mindmap View Controls
 * Quản lý zoom, fit view, và update D3 renderer
 */
export function useMindmapViewControls({ d3Renderer, nodes, edges, nodeCreationOrder }) {
  
  /**
   * Update D3 renderer
   */
  const updateD3Renderer = async () => {
    if (!d3Renderer.value) return

    await nextTick()

    // Đảm bảo nodeCreationOrder được update
    d3Renderer.value.options.nodeCreationOrder = nodeCreationOrder.value

    requestAnimationFrame(() => {
      setTimeout(() => {
        if (d3Renderer.value) {
          d3Renderer.value.setData(nodes.value, edges.value, nodeCreationOrder.value)
        }
      }, 100)
    })
  }

  /**
   * Update D3 renderer với custom delay (for editing)
   */
  const updateD3RendererWithDelay = async (delay = 150) => {
    if (!d3Renderer.value) return

    await nextTick()

    void document.body.offsetHeight

    // Đảm bảo nodeCreationOrder được update
    d3Renderer.value.options.nodeCreationOrder = nodeCreationOrder.value

    requestAnimationFrame(() => {
      setTimeout(() => {
        void document.body.offsetHeight
        if (d3Renderer.value) {
          d3Renderer.value.setData(nodes.value, edges.value, nodeCreationOrder.value)
          // Gọi render(true) để recalculate layout và vẽ lại edges
          d3Renderer.value.render(true)
        }
      }, delay)
    })
  }

  /**
   * Fit view - zoom to fit all nodes
   */
  const fitView = () => {
    if (d3Renderer.value) {
      d3Renderer.value.fitView()
    }
  }

  /**
   * Zoom in
   */
  const zoomIn = () => {
    if (d3Renderer.value && d3Renderer.value.svg) {
      d3Renderer.value.svg.transition()
        .call(d3Renderer.value.zoom.scaleBy, 1.2)
    }
  }

  /**
   * Zoom out
   */
  const zoomOut = () => {
    if (d3Renderer.value && d3Renderer.value.svg) {
      d3Renderer.value.svg.transition()
        .call(d3Renderer.value.zoom.scaleBy, 0.8)
    }
  }

  return {
    updateD3Renderer,
    updateD3RendererWithDelay,
    fitView,
    zoomIn,
    zoomOut
  }
}

