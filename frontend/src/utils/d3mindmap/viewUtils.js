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
  
  let rootNode = null
  renderer.nodes.forEach(node => {
    const pos = renderer.positions.get(node.id)
    if (pos) {
      // Tính node size
      const size = renderer.nodeSizeCache.get(node.id) || renderer.estimateNodeSize(node)
      
      // Tìm root node
      const isRoot = node.data?.isRoot || node.id === 'root'
      if (isRoot && !rootNode) {
        rootNode = node
      }
      
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
  
  const fullWidth = renderer.options.width
  const fullHeight = renderer.options.height
  
  // Tính scale, đảm bảo có padding 40px mỗi bên
  const padding = 40
  const scaleX = (fullWidth - padding * 2) / width
  const scaleY = (fullHeight - padding * 2) / height
  const scale = Math.min(scaleX, scaleY, 2) // Giới hạn scale tối đa là 2x
  
  // Đảm bảo scale không quá nhỏ (tối thiểu 0.1)
  const finalScale = Math.max(scale, 0.1)
  
  // Nếu có root node, ưu tiên center root node
  // Nếu không, center toàn bộ mindmap
  let midX, midY
  if (rootNode) {
    const rootPos = renderer.positions.get(rootNode.id)
    if (rootPos) {
      const rootSize = renderer.nodeSizeCache.get(rootNode.id) || renderer.estimateNodeSize(rootNode)
      midX = rootPos.x + rootSize.width / 2
      midY = rootPos.y + rootSize.height / 2
      
      // Đảm bảo root node không bị đặt quá xa bên trái
      // Nếu root node quá xa bên trái (minX < 0 hoặc rootPos.x < padding), điều chỉnh
      const minRootX = padding + rootSize.width / 2
      if (rootPos.x < padding) {
        // Root node quá xa bên trái, center dựa trên root node nhưng đảm bảo không lệch quá
        midX = Math.max(minRootX, midX)
      }
    } else {
      midX = (minX + maxX) / 2
      midY = (minY + maxY) / 2
    }
  } else {
    midX = (minX + maxX) / 2
    midY = (minY + maxY) / 2
  }
  
  // Đảm bảo translate không làm viewport bị lệch quá nhiều
  // Nếu mindmap quá rộng, ưu tiên hiển thị phần bên trái (root node)
  let translateX = fullWidth / 2 - finalScale * midX
  let translateY = fullHeight / 2 - finalScale * midY
  
  // Nếu mindmap quá rộng (width > fullWidth), đảm bảo root node vẫn hiển thị
  if (width > fullWidth / finalScale) {
    // Mindmap quá rộng, ưu tiên hiển thị root node ở bên trái với padding
    const rootPos = rootNode ? renderer.positions.get(rootNode.id) : null
    if (rootPos) {
      const rootSize = renderer.nodeSizeCache.get(rootNode.id) || renderer.estimateNodeSize(rootNode)
      const rootCenterX = rootPos.x + rootSize.width / 2
      // Đảm bảo root node center ở vị trí padding từ bên trái
      translateX = padding - finalScale * rootPos.x
    }
  }
  
  const translate = [translateX, translateY]
  
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

