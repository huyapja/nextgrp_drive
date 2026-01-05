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


/**
 * Convert VueFlow nodes/edges to D3 hierarchy format
 */
export function buildD3Hierarchy(nodes, edges, rootId = 'root') {
  const nodeMap = new Map()
  const childrenMap = new Map()
  const parentMap = new Map()
  
  nodes.forEach(node => {
    nodeMap.set(node.id, node)
    childrenMap.set(node.id, [])
  })
  
  edges.forEach(edge => {
    const children = childrenMap.get(edge.source) || []
    children.push(edge.target)
    childrenMap.set(edge.source, children)
    parentMap.set(edge.target, edge.source)
  })
  
  let rootNode = nodes.find(n => n.id === rootId)
  if (!rootNode) {
    rootNode = nodes.find(n => !parentMap.has(n.id))
  }
  if (!rootNode && nodes.length > 0) {
    rootNode = nodes[0]
  }
  
  if (!rootNode) return null
  
  const visited = new Set()
  
  const buildNode = (nodeId, depth = 0) => {
    if (visited.has(nodeId)) {
      console.warn(`Circular reference detected at node ${nodeId}`)
      return null
    }
    
    if (depth > 100) {
      console.warn(`Maximum depth exceeded at node ${nodeId}`)
      return null
    }
    
    const node = nodeMap.get(nodeId)
    if (!node) return null
    
    visited.add(nodeId)
    
    const children = (childrenMap.get(nodeId) || [])
      .map(childId => buildNode(childId, depth + 1))
      .filter(Boolean)
    
    visited.delete(nodeId)
    
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
    void domNode.offsetHeight
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
    layerSpacing = 200,
    nodeSpacing = 80, 
    padding = 40,
    viewportHeight = window.innerHeight - 84,
    nodeCreationOrder = new Map(),
    collapsedNodes = new Set()
  } = options
  
  const root = buildD3Hierarchy(nodes, edges)
  if (!root) {
    console.warn('No root node found')
    return new Map()
  }
  
  const getNodeSize = (nodeId) => {
    const size = nodeSizes.get(nodeId)
    if (size) return { width: size.width, height: size.height }
    return { width: 150, height: 60 }
  }
  
  const positionMap = new Map()
  const collapsedSet = new Set(collapsedNodes || [])
  
  /**
   * PHASE 1: Calculate subtree bounds (bottom-up)
   * Returns: { width, height } of entire subtree
   */
  const calculateSubtreeBounds = (node) => {
    const nodeSize = getNodeSize(node.id)
    
    let children = node.children || []

    // Nếu node đang bị thu gọn, KHÔNG tính subtree children để layout
    // → khoảng trống phía dưới sẽ thu lại như mong muốn
    if (collapsedSet.has(node.id)) {
      children = []
    }
    
    // Sort children by creation order
    if (children.length > 0) {
      children = [...children].sort((a, b) => {
        const orderA = nodeCreationOrder.get(a.id) ?? Infinity
        const orderB = nodeCreationOrder.get(b.id) ?? Infinity
        if (orderA === Infinity && orderB === Infinity) return 0
        return orderA - orderB
      })
      node.children = children // Update sorted order
    }
    
    if (children.length === 0) {
      // Leaf node
      return {
        width: nodeSize.width,
        height: nodeSize.height
      }
    }
    
    // Calculate children bounds recursively
    const childBounds = children.map(child => calculateSubtreeBounds(child))
    
    // Total height = sum of all children heights + spacing between them
    const totalChildrenHeight = childBounds.reduce((sum, bounds, i) => {
      return sum + bounds.height + (i < childBounds.length - 1 ? nodeSpacing : 0)
    }, 0)
    
    // Subtree width = node width + layer spacing + max child subtree width
    const maxChildWidth = Math.max(...childBounds.map(b => b.width))
    const subtreeWidth = nodeSize.width + layerSpacing + maxChildWidth
    
    // Subtree height = max of (node height, total children height)
    const subtreeHeight = Math.max(nodeSize.height, totalChildrenHeight)
    
    return {
      width: subtreeWidth,
      height: subtreeHeight,
      childBounds: childBounds,
      totalChildrenHeight: totalChildrenHeight
    }
  }
  
  /**
   * PHASE 2: Position nodes (top-down)
   * x, y = top-left corner of this subtree's bounding box
   */
  const positionNodes = (node, x, y, bounds) => {
    const nodeSize = getNodeSize(node.id)
    let children = node.children || []

    // Nếu node đang bị thu gọn, không position children (giữ nguyên vị trí cũ, nhưng sẽ bị isNodeHidden ẩn đi)
    if (collapsedSet.has(node.id)) {
      children = []
    }
    
    if (children.length === 0) {
      // Leaf node - position at (x, y)
      positionMap.set(node.id, { x, y })
      return
    }
    
    // Calculate where to position this node
    // Node should be vertically centered relative to its children
    const totalChildrenHeight = bounds.totalChildrenHeight
    const childBounds = bounds.childBounds
    
    let nodeY
    if (totalChildrenHeight < nodeSize.height) {
      // Children are smaller than node - position node at top
      nodeY = y
    } else {
      // Children are taller - center node vertically
      nodeY = y + (totalChildrenHeight - nodeSize.height) / 2
    }
    
    // Position this node
    positionMap.set(node.id, { x, y: nodeY })
    
    // Position children
    const childX = x + nodeSize.width + layerSpacing
    let currentChildY = y
    
    // If node is taller than children, offset children to center them
    if (nodeSize.height > totalChildrenHeight) {
      currentChildY = y + (nodeSize.height - totalChildrenHeight) / 2
    }
    
    children.forEach((child, i) => {
      const childBound = childBounds[i]
      
      // Calculate child bounds recursively
      const childSubtreeBounds = calculateSubtreeBounds(child)
      
      // Position child at currentChildY
      positionNodes(child, childX, currentChildY, childSubtreeBounds)
      
      // Move to next child position
      currentChildY += childBound.height + nodeSpacing
    })
  }
  
  // Calculate bounds for entire tree
  const rootBounds = calculateSubtreeBounds(root)
  
  // Position all nodes starting from root
  positionNodes(root, padding, padding, rootBounds)
  
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

