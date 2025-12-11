/**
 * View Utilities Module
 * Handles view-related operations like fitView
 */

import * as d3 from 'd3'

export function fitView(renderer) {
  if (!renderer.positions || renderer.positions.size === 0) {
    return
  }
  
  // Tính bounds từ positions của các node (không bao gồm background rect)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  
  renderer.nodes.forEach(node => {
    const pos = renderer.positions.get(node.id)
    if (pos) {
      // Tính node size
      const size = renderer.estimateNodeSize(node)
      
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + size.width)
      maxY = Math.max(maxY, pos.y + size.height)
    }
  })
  
  // Nếu không có node nào, không làm gì
  if (minX === Infinity) {
    return
  }
  
  const width = maxX - minX
  const height = maxY - minY
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  
  const fullWidth = renderer.options.width
  const fullHeight = renderer.options.height
  
  // Tính scale, đảm bảo có padding 40px mỗi bên
  const padding = 40
  const scaleX = (fullWidth - padding) / width
  const scaleY = (fullHeight - padding) / height
  const scale = Math.min(scaleX, scaleY, 2) // Giới hạn scale tối đa là 2x
  
  // Đảm bảo scale không quá nhỏ (tối thiểu 0.1)
  const finalScale = Math.max(scale, 0.1)
  
  const translate = [
    fullWidth / 2 - finalScale * midX,
    fullHeight / 2 - finalScale * midY
  ]
  
  renderer.svg.transition()
    .duration(750)
    .call(
      renderer.zoom.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(finalScale)
    )
}

/**
 * Scroll/zoom to a specific node
 */
export function scrollToNode(renderer, nodeId) {
  if (!renderer.positions || !renderer.positions.has(nodeId)) {
    console.warn('Node position not found:', nodeId)
    return
  }
  
  const pos = renderer.positions.get(nodeId)
  if (!pos) {
    console.warn('Node position is null:', nodeId)
    return
  }
  
  // Lấy node size
  const node = renderer.nodes.find(n => n.id === nodeId)
  if (!node) {
    console.warn('Node not found:', nodeId)
    return
  }
  
  const size = renderer.nodeSizeCache.get(nodeId) || renderer.estimateNodeSize(node)
  
  // Tính center của node
  const nodeCenterX = pos.x + size.width / 2
  const nodeCenterY = pos.y + size.height / 2
  
  const fullWidth = renderer.options.width
  const fullHeight = renderer.options.height
  
  // Scale để node vừa khít với viewport (zoom in một chút)
  const targetScale = 1.5 // Zoom in 1.5x để node rõ ràng hơn
  const padding = 60
  
  // Tính translate để center node vào giữa viewport
  const translate = [
    fullWidth / 2 - targetScale * nodeCenterX,
    fullHeight / 2 - targetScale * nodeCenterY
  ]
  
  // Apply transform với animation
  renderer.svg.transition()
    .duration(750)
    .call(
      renderer.zoom.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(targetScale)
    )
  
  // Select node để highlight
  if (renderer.selectNode) {
    renderer.selectNode(nodeId)
  }
  
}

