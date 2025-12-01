/**
 * D3.js Mindmap Layout Engine
 * Giống Lark/Feishu Mindmap với horizontal layout
 * 
 * Features:
 * - Horizontal tree layout (left to right)
 * - Single child alignment
 * - Parent centering relative to children
 * - Dynamic spacing based on node sizes
 * - No overlaps (collision detection)
 * - Position preservation
 */

import * as d3 from 'd3'

/**
 * Convert VueFlow nodes/edges to D3 hierarchy format
 */
export function buildD3Hierarchy(nodes, edges, rootId = 'root') {
  const nodeMap = new Map()
  const childrenMap = new Map()
  const parentMap = new Map()
  
  // Build node map
  nodes.forEach(node => {
    nodeMap.set(node.id, node)
    childrenMap.set(node.id, [])
  })
  
  // Build parent-child relationships và sắp xếp theo creation order
  edges.forEach(edge => {
    const children = childrenMap.get(edge.source) || []
    children.push(edge.target)
    childrenMap.set(edge.source, children)
    parentMap.set(edge.target, edge.source)
  })
  
  // Sắp xếp children theo creation order (nếu có)
  const sortChildren = (children, creationOrder) => {
    return children.sort((a, b) => {
      const orderA = creationOrder.get(a) ?? Infinity
      const orderB = creationOrder.get(b) ?? Infinity
      return orderA - orderB
    })
  }
  
  // Find root node
  let rootNode = nodes.find(n => n.id === rootId)
  if (!rootNode) {
    // Find node without parent
    rootNode = nodes.find(n => !parentMap.has(n.id))
  }
  if (!rootNode && nodes.length > 0) {
    rootNode = nodes[0]
  }
  
  if (!rootNode) return null
  
  // Build hierarchy recursively
  const buildNode = (nodeId) => {
    const node = nodeMap.get(nodeId)
    if (!node) return null
    
    const children = (childrenMap.get(nodeId) || []).map(childId => buildNode(childId)).filter(Boolean)
    
    return {
      id: node.id,
      data: node.data,
      children: children.length > 0 ? children : null
    }
  }
  
  return buildNode(rootNode.id)
}

/**
 * Get node size from DOM
 */
export function getNodeSizeFromDOM(nodeId) {
  const domNode = document.querySelector(`[data-id="${nodeId}"]`)
  if (domNode) {
    void domNode.offsetHeight // Force reflow
    const rect = domNode.getBoundingClientRect()
    return {
      width: Math.max(rect.width || domNode.offsetWidth || 120, 120),
      height: Math.max(rect.height || domNode.offsetHeight || 50, 50)
    }
  }
  return { width: 120, height: 50 }
}

/**
 * Calculate D3 tree layout with Lark-like features
 */
export function calculateD3MindmapLayout(nodes, edges, options = {}) {
  const {
    nodeSizes = new Map(),
    layerSpacing = 180, // Khoảng cách ngang giữa layers
    nodeSpacing = 50, // Khoảng cách dọc giữa siblings
    padding = 20, // Padding chung
    viewportHeight = window.innerHeight - 84,
    nodeCreationOrder = new Map() // Thứ tự tạo node để giữ đúng thứ tự
  } = options
  
  // Build hierarchy
  const root = buildD3Hierarchy(nodes, edges)
  if (!root) {
    console.warn('No root node found')
    return new Map()
  }
  
  // Get node size helper
  const getNodeSize = (nodeId) => {
    const size = nodeSizes.get(nodeId)
    if (size) {
      // Reduced padding for tighter spacing
      const extraPaddingX = Math.min(size.width * 0.1, 40)
      const extraPaddingY = Math.min(size.height * 0.1, 20)
      return {
        width: size.width + padding + extraPaddingX,
        height: size.height + padding + extraPaddingY
      }
    }
    return { width: 150 + padding, height: 60 + padding }
  }
  
  // Calculate dynamic layer spacing based on parent width
  // Đảm bảo khoảng cách đủ lớn để tránh overlap khi node cha có text dài
  // Nhưng không quá lớn để giữ layout gọn
  const getLayerSpacing = (parentNodeId) => {
    const parentSize = getNodeSize(parentNodeId)
    // Giảm khoảng cách: chỉ cần đảm bảo node con không overlap với node cha
    // Khoảng cách tối thiểu = chiều rộng node cha + padding nhỏ hơn
    const minSpacing = Math.max(
      layerSpacing,
      parentSize.width + padding * 2 + 30 // Giảm từ padding * 3 + 100 xuống padding * 2 + 30
    )
    return minSpacing
  }
  
  // Position map
  const positionMap = new Map()
  
  // Store previous sibling results để đặt node cùng cấp đúng vị trí
  // QUAN TRỌNG: Clear map này mỗi lần layout để đảm bảo tính toán lại từ đầu
  const siblingResultsMap = new Map() // Map<parentId, Array<{id, bottom}>>
  
  // Custom tree layout function (Lark-like)
  // Trả về bounds của toàn bộ subtree (bao gồm node và tất cả node con)
  const layoutNode = (node, x, y, parentId = null, siblingIndex = 0) => {
    const nodeSize = getNodeSize(node.id)
    let children = node.children || []
    
    // QUAN TRỌNG: Sắp xếp children theo creation order để giữ đúng thứ tự
    // Điều này đảm bảo thứ tự hiển thị không bị thay đổi khi thêm node con
    if (children.length > 0) {
      children = [...children].sort((a, b) => {
        const orderA = nodeCreationOrder.get(a.id) ?? Infinity
        const orderB = nodeCreationOrder.get(b.id) ?? Infinity
        // Nếu không có creation order, giữ nguyên thứ tự ban đầu
        if (orderA === Infinity && orderB === Infinity) {
          return 0
        }
        return orderA - orderB
      })
    }
    
    if (children.length === 0) {
      // Leaf node
      positionMap.set(node.id, { x, y })
      return { 
        y, // Top của node
        height: nodeSize.height, // Chiều cao của node
        bottom: y + nodeSize.height // Bottom của node (để tính cho node tiếp theo)
      }
    }
    
    // Calculate children positions - Lark style: phân bổ xung quanh node cha
    const childResults = []
    const dynamicSpacing = parentId ? getLayerSpacing(parentId) : layerSpacing
    
    // Đảm bảo dynamicSpacing đủ lớn để node con không overlap với node cha
    // Tính toán lại dựa trên chiều rộng thực tế của node cha
    const parentWidth = nodeSize.width
    // Khoảng cách tối thiểu = chiều rộng node cha + padding nhỏ hơn
    const minRequiredSpacing = parentWidth + padding * 2 + 30 // Giảm khoảng cách
    const actualSpacing = Math.max(dynamicSpacing, minRequiredSpacing)
    
    if (children.length === 1) {
      // Single child: đặt ở giữa (cùng center Y với node cha) - thẳng hàng
      const child = children[0]
      const childSize = getNodeSize(child.id)
      // Đảm bảo node con thẳng hàng với center của node cha
      const childY = y + (nodeSize.height / 2) - (childSize.height / 2)
      const childResult = layoutNode(child, x + actualSpacing, childY, node.id, 0)
      childResults.push({
        id: child.id,
        y: childResult.y,
        height: childResult.height,
        bottom: childResult.bottom || (childResult.y + childResult.height)
      })
    } else if (children.length > 1) {
      // Multiple children: sắp xếp theo creation order và đặt thẳng hàng dọc
      // Giữ đúng thứ tự tạo node, không phân bổ top/middle/bottom
      // Node đầu tiên đặt ở giữa (thẳng hàng với node cha), các node tiếp theo xếp dọc xuống
      
      let currentY = y
      
      children.forEach((child, index) => {
        const childSize = getNodeSize(child.id)
        
        if (index === 0) {
          // Node đầu tiên: đặt ở giữa (thẳng hàng với node cha)
          currentY = y + (nodeSize.height / 2) - (childSize.height / 2)
        } else {
          // Các node tiếp theo: xếp dọc xuống dưới với khoảng cách cố định
          // Sử dụng bottom của subtree trước đó để đảm bảo không overlap
          const prevResult = childResults[childResults.length - 1]
          const prevBottom = prevResult.bottom || (prevResult.y + prevResult.height)
          // Đảm bảo khoảng cách tối thiểu giữa các nhánh (tối thiểu 50px)
          const minSpacing = Math.max(nodeSpacing, 50)
          currentY = prevBottom + minSpacing
        }
        
        // Layout child subtree
        const childResult = layoutNode(child, x + actualSpacing, currentY, node.id, index)
        childResults.push({
          id: child.id,
          y: childResult.y,
          height: childResult.height,
          bottom: childResult.bottom || (childResult.y + childResult.height)
        })
      })
    }
    
    // Calculate parent Y position - LUÔN CĂN GIỮA CÁC NODE CON (Lark style)
    // Với layout mới, node con được phân bổ xung quanh node cha
    // Node cha nên được căn giữa dựa trên tất cả node con
    let parentY = y
    
    if (children.length === 1) {
      // Single child: align parent vertically with child center
      const childY = childResults[0].y
      const childHeight = childResults[0].height
      const childCenterY = childY + (childHeight / 2)
      parentY = childCenterY - (nodeSize.height / 2)
    } else if (children.length > 1) {
      // Multiple children: center parent based on all children positions
      // Tính toán dựa trên vị trí thực tế của tất cả node con
      // Tìm top nhất và bottom nhất của tất cả node con
      let minChildY = Infinity
      let maxChildY = -Infinity
      
      childResults.forEach(result => {
        minChildY = Math.min(minChildY, result.y)
        // Sử dụng bottom của subtree (bao gồm tất cả node con) thay vì chỉ height của node
        const resultBottom = result.bottom || (result.y + result.height)
        maxChildY = Math.max(maxChildY, resultBottom)
      })
      
      // Tính center Y của tất cả node con
      const childrenCenterY = (minChildY + maxChildY) / 2
      
      // Căn giữa node cha với center của các node con
      parentY = childrenCenterY - (nodeSize.height / 2)
    }
    
    // Set parent position
    positionMap.set(node.id, { x, y: parentY })
    
    // Return bounds của toàn bộ subtree (bao gồm node cha và tất cả node con)
    // Điều này quan trọng để node cùng cấp tiếp theo biết được bottom của subtree này
    const firstChildY = childResults[0]?.y || parentY
    const lastChild = childResults[childResults.length - 1]
    // Sử dụng bottom của subtree cuối cùng (bao gồm tất cả node con của nó)
    const lastChildBottom = lastChild ? (lastChild.bottom || (lastChild.y + lastChild.height)) : parentY + nodeSize.height
    const topMost = Math.min(firstChildY, parentY) // Top nhất của toàn bộ subtree
    const bottomMost = Math.max(lastChildBottom, parentY + nodeSize.height) // Bottom nhất của toàn bộ subtree
    const totalHeight = bottomMost - topMost
    
    const result = {
      y: topMost, // Top của toàn bộ subtree
      height: totalHeight, // Chiều cao của toàn bộ subtree
      bottom: bottomMost, // Bottom của toàn bộ subtree (quan trọng cho node cùng cấp tiếp theo)
      id: node.id // Lưu id để track
    }
    
    // Lưu kết quả vào siblingResultsMap để node cùng cấp tiếp theo có thể sử dụng
    if (parentId) {
      if (!siblingResultsMap.has(parentId)) {
        siblingResultsMap.set(parentId, [])
      }
      siblingResultsMap.get(parentId).push(result)
    }
    
    return result
  }
  
  // Start layout from root
  const startX = padding
  const startY = padding
  layoutNode(root, startX, startY, null, 0)
  
  // Center vertically in viewport
  let minY = Infinity
  let maxY = -Infinity
  
  positionMap.forEach((pos, nodeId) => {
    const nodeSize = getNodeSize(nodeId)
    minY = Math.min(minY, pos.y)
    maxY = Math.max(maxY, pos.y + nodeSize.height)
  })
  
  const totalHeight = maxY - minY
  const offsetY = Math.max(padding, (viewportHeight - totalHeight) / 2) - minY
  
  // Apply vertical centering
  const finalPositions = new Map()
  positionMap.forEach((pos, nodeId) => {
    finalPositions.set(nodeId, {
      x: pos.x,
      y: pos.y + offsetY
    })
  })
  
  // Layout đã được tính toán với khoảng cách đều nhau trong layoutNode
  // Tuy nhiên, cần điều chỉnh lại để đảm bảo các nhánh không bị overlap
  
  // Điều chỉnh khoảng cách giữa các nhánh con để tránh overlap
  // Hàm này tính toán lại vị trí dựa trên subtree bounds để đảm bảo không overlap
  equalizeSiblingSpacing(finalPositions, nodes, edges, nodeSizes, getNodeSize, nodeSpacing)
  
  // Đảm bảo node cha luôn căn giữa các node con
  recenterParents(finalPositions, nodes, edges, nodeSizes, getNodeSize, false)
  
  // Collision detection and resolution - xử lý các overlap còn lại
  resolveCollisions(finalPositions, nodeSizes, getNodeSize)
  
  // Đảm bảo node cha luôn căn giữa các node con sau khi resolve collisions
  recenterParents(finalPositions, nodes, edges, nodeSizes, getNodeSize, true)
  
  return finalPositions
}

/**
 * Tính toán lại khoảng cách đều nhau giữa các node cùng cấp (siblings)
 * Đảm bảo khoảng cách giữa các nhánh dựa trên nhánh có nhiều node con nhất
 */
function equalizeSiblingSpacing(positionMap, nodes, edges, nodeSizes, getNodeSize, nodeSpacing) {
  // Build parent-child relationships
  const childrenMap = new Map()
  const parentMap = new Map()
  
  nodes.forEach(node => {
    childrenMap.set(node.id, [])
  })
  
  edges.forEach(edge => {
    const children = childrenMap.get(edge.source) || []
    children.push(edge.target)
    childrenMap.set(edge.source, children)
    parentMap.set(edge.target, edge.source)
  })
  
  // Helper: Tính subtree height của một node (bao gồm tất cả node con)
  // Trả về { top, bottom, height } của toàn bộ subtree
  const getSubtreeBounds = (nodeId) => {
    const pos = positionMap.get(nodeId)
    if (!pos) return { top: 0, bottom: 0, height: 0 }
    
    const nodeSize = getNodeSize(nodeId)
    const children = childrenMap.get(nodeId) || []
    
    if (children.length === 0) {
      return {
        top: pos.y,
        bottom: pos.y + nodeSize.height,
        height: nodeSize.height
      }
    }
    
    // Tìm top nhất và bottom nhất của tất cả node trong subtree
    let minY = pos.y
    let maxY = pos.y + nodeSize.height
    
    const findBounds = (id) => {
      const childPos = positionMap.get(id)
      if (!childPos) return
      
      const childSize = getNodeSize(id)
      minY = Math.min(minY, childPos.y)
      maxY = Math.max(maxY, childPos.y + childSize.height)
      
      const grandChildren = childrenMap.get(id) || []
      grandChildren.forEach(gcId => findBounds(gcId))
    }
    
    children.forEach(childId => findBounds(childId))
    
    return {
      top: minY,
      bottom: maxY,
      height: maxY - minY
    }
  }
  
  // Duyệt qua tất cả các node có con
  nodes.forEach(node => {
    const children = childrenMap.get(node.id) || []
    
    if (children.length <= 1) return // Không cần điều chỉnh nếu có 0 hoặc 1 node con
    
    // Sắp xếp children theo Y position
    const sortedChildren = [...children].sort((a, b) => {
      const posA = positionMap.get(a)
      const posB = positionMap.get(b)
      if (!posA || !posB) return 0
      return posA.y - posB.y
    })
    
    // Tính subtree bounds của tất cả children
    const childSubtreeBounds = sortedChildren.map(childId => ({
      id: childId,
      bounds: getSubtreeBounds(childId)
    }))
    
    // Tính toán lại vị trí để đảm bảo khoảng cách đều nhau
    // Khoảng cách giữa các nhánh = nodeSpacing (cố định)
    // Mỗi node có khoảng cách với nhánh có nhiều node con nhất (subtree height lớn nhất)
    sortedChildren.forEach((childId, index) => {
      if (index === 0) {
        // Node đầu tiên: giữ nguyên vị trí
        return
      }
      
      // Node tiếp theo: đặt dựa trên bottom của subtree trước đó + nodeSpacing
      const prevChildId = sortedChildren[index - 1]
      
      // Tính lại bounds của subtree trước đó sau khi có thể đã di chuyển
      const prevBounds = getSubtreeBounds(prevChildId)
      
      if (prevBounds && prevBounds.bottom > 0) {
        // Tính bottom của subtree trước đó
        const prevBottom = prevBounds.bottom
        
        // Tính lại bounds của node hiện tại (có thể đã bị ảnh hưởng bởi các node trước đó)
        const currentBounds = getSubtreeBounds(childId)
        
        // Đảm bảo khoảng cách tối thiểu giữa các nhánh
        // Tăng khoảng cách để edge render đẹp và không bị overlap (tối thiểu 60px)
        const minSpacing = Math.max(nodeSpacing, 60)
        const offsetY = (prevBottom + minSpacing) - currentBounds.top
        
        // Chỉ di chuyển nếu cần thiết (nếu offsetY > 0, nghĩa là node hiện tại đang overlap)
        if (offsetY > 0) {
          // Cập nhật vị trí của node và tất cả node con (toàn bộ subtree)
        const updateNodePosition = (id, offset) => {
          const pos = positionMap.get(id)
          if (pos) {
            positionMap.set(id, {
              x: pos.x,
              y: pos.y + offset
            })
            
              // Cập nhật vị trí của tất cả node con (đệ quy)
            const grandchildren = childrenMap.get(id) || []
            grandchildren.forEach(gcId => updateNodePosition(gcId, offset))
          }
        }
        
        updateNodePosition(childId, offsetY)
        }
      }
    })
  })
}

/**
 * Đảm bảo node cha luôn căn giữa các node con (sau khi resolve collisions)
 * @param {boolean} preservePosition - Nếu true, chỉ điều chỉnh nhẹ, không di chuyển quá nhiều
 */
function recenterParents(positionMap, nodes, edges, nodeSizes, getNodeSize, preservePosition = false) {
  // Build parent-child relationships
  const childrenMap = new Map()
  const parentMap = new Map()
  
  nodes.forEach(node => {
    childrenMap.set(node.id, [])
  })
  
  edges.forEach(edge => {
    const children = childrenMap.get(edge.source) || []
    children.push(edge.target)
    childrenMap.set(edge.source, children)
    parentMap.set(edge.target, edge.source)
  })
  
  // Duyệt qua tất cả các node có con
  nodes.forEach(node => {
    const children = childrenMap.get(node.id) || []
    
    if (children.length === 0) return // Không có con, bỏ qua
    
    // Lấy vị trí của tất cả node con
    const childPositions = children
      .map(childId => {
        const pos = positionMap.get(childId)
        if (!pos) return null
        const size = getNodeSize(childId)
        return {
          id: childId,
          top: pos.y,
          bottom: pos.y + size.height,
          center: pos.y + size.height / 2
        }
      })
      .filter(Boolean)
    
    if (childPositions.length === 0) return
    
    // Tính toán center của tất cả node con
    const firstChild = childPositions[0]
    const lastChild = childPositions[childPositions.length - 1]
    
    // Center Y của tất cả node con (từ top của node đầu tiên đến bottom của node cuối cùng)
    const childrenCenterY = (firstChild.top + lastChild.bottom) / 2
    
    // Căn giữa node cha
    const parentPos = positionMap.get(node.id)
    if (parentPos) {
      const parentSize = getNodeSize(node.id)
      const newParentY = childrenCenterY - (parentSize.height / 2)
      
      const offsetY = newParentY - parentPos.y
      
      // Nếu preservePosition = true, KHÔNG di chuyển node cha để giữ nguyên vị trí
      // Điều này đảm bảo node không bị thay đổi vị trí khi thêm node con
      // Áp dụng cho TẤT CẢ các node để giữ nguyên vị trí tương đối
      if (preservePosition) {
        // KHÔNG di chuyển node cha, giữ nguyên vị trí hiện tại hoàn toàn
        // Điều này đảm bảo node B luôn ở vị trí thứ 2, không bị thay đổi khi thêm node con
        return
      } else {
        // Bình thường: căn giữa hoàn toàn
        // Chỉ cập nhật nếu thay đổi đáng kể (tránh floating point issues)
        if (Math.abs(parentPos.y - newParentY) > 0.1) {
          // Kiểm tra xem việc di chuyển node cha có gây overlap không
          const minPadding = 15
          let canMove = true
          
          // Kiểm tra overlap với các node khác ở cùng layer (cùng x)
          positionMap.forEach((otherPos, otherId) => {
            if (otherId === node.id) return
            
            // Chỉ kiểm tra các node ở cùng layer (cùng x hoặc gần)
            if (Math.abs(otherPos.x - parentPos.x) < 50) {
              const otherSize = getNodeSize(otherId)
              const newParentTop = newParentY
              const newParentBottom = newParentY + parentSize.height
              const otherTop = otherPos.y
              const otherBottom = otherPos.y + otherSize.height
              
              // Kiểm tra overlap theo chiều Y
              const overlapY = !(newParentBottom + minPadding <= otherTop || otherBottom + minPadding <= newParentTop)
              
              if (overlapY) {
                canMove = false
              }
            }
          })
          
          if (canMove) {
            positionMap.set(node.id, {
              x: parentPos.x,
              y: newParentY
            })
          }
        }
      }
    }
  })
  
  // Sau khi recenter, kiểm tra lại collisions và resolve nếu cần
  resolveCollisions(positionMap, nodeSizes, getNodeSize)
}

/**
 * Resolve collisions by adjusting positions
 * Cải thiện để xử lý trường hợp nhiều node con của các node cùng cấp
 */
function resolveCollisions(positionMap, nodeSizes, getNodeSize) {
  const positions = Array.from(positionMap.entries())
  let hasCollisions = true
  let iterations = 0
  const maxIterations = 30 // Tăng số lần lặp để xử lý nhiều node con
  const minPadding = 15 // Padding tối thiểu giữa các node
  
  // Sắp xếp positions theo X trước, sau đó theo Y để xử lý hiệu quả hơn
  positions.sort((a, b) => {
    const [id1, pos1] = a
    const [id2, pos2] = b
    if (Math.abs(pos1.x - pos2.x) < 10) {
      // Cùng layer (X gần nhau), sắp xếp theo Y
      return pos1.y - pos2.y
    }
    return pos1.x - pos2.x
  })
  
  while (hasCollisions && iterations < maxIterations) {
    hasCollisions = false
    iterations++
    
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const [nodeId1, pos1] = positions[i]
        const [nodeId2, pos2] = positions[j]
        
        // Chỉ kiểm tra collision nếu 2 node ở cùng layer (X gần nhau)
        // Hoặc nếu chúng có thể overlap
        const xDiff = Math.abs(pos1.x - pos2.x)
        if (xDiff > 500) continue // Bỏ qua nếu quá xa nhau theo X
        
        if (nodesOverlap(nodeId1, pos1, nodeId2, pos2, getNodeSize, minPadding)) {
          hasCollisions = true
          
          const size1 = getNodeSize(nodeId1)
          const size2 = getNodeSize(nodeId2)
          
          // Resolve by moving nodes apart vertically
          // Di chuyển node phía dưới xuống thêm
          if (pos2.y >= pos1.y) {
            const requiredY = pos1.y + size1.height + minPadding
            if (pos2.y < requiredY) {
              positions[j][1] = { x: pos2.x, y: requiredY }
              positionMap.set(nodeId2, positions[j][1])
            }
          } else {
            const requiredY = pos2.y + size2.height + minPadding
            if (pos1.y < requiredY) {
              positions[i][1] = { x: pos1.x, y: requiredY }
              positionMap.set(nodeId1, positions[i][1])
            }
          }
        }
      }
    }
  }
}

/**
 * Check if two nodes overlap
 */
function nodesOverlap(nodeId1, pos1, nodeId2, pos2, getNodeSize, padding) {
  const size1 = getNodeSize(nodeId1)
  const size2 = getNodeSize(nodeId2)
  
  // Kiểm tra overlap theo chiều X (ngang)
  // Đảm bảo có đủ khoảng cách padding giữa 2 node
  const overlapX = !(pos1.x + size1.width + padding <= pos2.x || pos2.x + size2.width + padding <= pos1.x)
  
  // Kiểm tra overlap theo chiều Y (dọc)
  const overlapY = !(pos1.y + size1.height + padding <= pos2.y || pos2.y + size2.height + padding <= pos1.y)
  
  // Chỉ coi là overlap nếu cả X và Y đều overlap
  return overlapX && overlapY
}

/**
 * Check if a child node overlaps with its parent node
 */
function childOverlapsParent(childPos, childSize, parentPos, parentSize, padding) {
  // Kiểm tra xem node con có overlap với node cha không
  // Node cha ở bên trái, node con ở bên phải
  // Overlap nếu node con bắt đầu trước khi node cha kết thúc + padding
  const childStartsBeforeParentEnds = childPos.x < (parentPos.x + parentSize.width + padding)
  
  // Overlap theo chiều Y
  const overlapY = !(parentPos.y + parentSize.height + padding <= childPos.y || 
                     childPos.y + childSize.height + padding <= parentPos.y)
  
  return childStartsBeforeParentEnds && overlapY
}

/**
 * Get all node sizes from DOM
 */
export function getAllNodeSizesFromDOM(nodeIds) {
  const sizes = new Map()
  
  nodeIds.forEach(nodeId => {
    sizes.set(nodeId, getNodeSizeFromDOM(nodeId))
  })
  
  return sizes
}

