/**
 * Drag Handler Module
 * Handles all drag & drop logic for mindmap nodes
 */

import * as d3 from 'd3'
import { estimateNodeSize } from './nodeSize.js'
import { cleanupDragBranchEffects, getDescendantIds, getParentNodeId, getSiblingNodes, isDescendant } from './utils.js'

/**
 * Handle mousedown event to setup drag delay
 */
export function handleMouseDown(renderer, event, d) {
  // ⚠️ CRITICAL: Cho phép drag với left mouse button (buttons === 1) hoặc right mouse button (buttons === 2)
  // Ngăn drag khi giữ con lăn chuột hoặc các button khác
  // Kiểm tra buttons property (bitmask) - cho phép khi buttons === 1 (left button) hoặc buttons === 2 (right button)
  const isLeftButton = event.buttons !== undefined 
    ? event.buttons === 1
    : (event.button !== undefined && event.button === 0)
  const isRightButton = event.buttons !== undefined 
    ? event.buttons === 2
    : (event.button !== undefined && event.button === 2)
  
  if (!isLeftButton && !isRightButton) {
    // Không cho phép drag với middle mouse button hoặc wheel
    return
  }
  
  // Lưu flag để biết đang drag với right button
  if (isRightButton) {
    renderer.isRightButtonDrag = true
    // KHÔNG preventDefault ở đây - sẽ preventDefault trong contextmenu handler nếu đã drag
    // Chỉ lưu vị trí để kiểm tra xem có di chuyển không
    renderer._rightButtonDownPos = { x: event.clientX, y: event.clientY }
    renderer.shouldPreventContextMenu = false // Reset trước, sẽ set lại khi di chuyển đủ
  } else {
    renderer.isRightButtonDrag = false
  }
  
  // Bắt đầu delay drag - chỉ cho phép drag sau 200ms
  const isRoot = d.data?.isRoot || d.id === 'root'
  const isEditing = renderer.editingNode === d.id
  
  // Kiểm tra xem click có phải vào editor hoặc button không
  const target = event.target
  let isInEditor = false
  if (target) {
    const checkElement = (el, classes) => {
      if (!el) return false
      if (el.classList) {
        return classes.some(cls => el.classList.contains(cls))
      }
      if (el.className) {
        const className = typeof el.className === 'string' 
          ? el.className 
          : el.className.baseVal || ''
        return classes.some(cls => className.includes(cls))
      }
      return false
    }
    
    const editorClasses = [
      'mindmap-node-editor',
      'mindmap-editor-content',
      'mindmap-editor-prose',
      'ProseMirror',
      'ProseMirror-focused'
    ]
    
    const buttonClasses = [
      'add-child-btn',
      'add-child-text',
      'collapse-btn-arrow',
      'collapse-btn-number',
      'collapse-text-number',
      'collapse-arrow'
    ]
    
    let current = target
    let depth = 0
    while (current && depth < 10) {
      if (checkElement(current, editorClasses)) {
        isInEditor = true
        break
      }
      if (checkElement(current, buttonClasses)) {
        // Block drag nếu click vào button
        event.preventDefault()
        event.stopPropagation()
        return
      }
      current = current.parentNode
      depth++
    }
  }
  
  // Nếu là root, đang edit, hoặc click vào editor thì không cho phép drag
  // Và cần preventDefault/stopPropagation để cho phép text selection
  if (isRoot || isEditing || isInEditor) {
    // Không preventDefault để cho phép text selection hoạt động bình thường
    // Chỉ stopPropagation để ngăn event lan đến drag handler
    event.stopPropagation()
    return
  }
  
  // Lưu vị trí ban đầu của mouse
  const startX = event.clientX
  const startY = event.clientY
  const nodeId = d.id
  
  
  // Reset flags và lưu vị trí bắt đầu
  renderer.isDragStarting = true
  renderer.mouseUpOccurred = false
  renderer.hasMovedEnough = false
  renderer.dragStartPosition = { x: startX, y: startY }
  renderer.dragStartTime = Date.now() // Lưu timestamp khi mousedown
  
  // Clear timeout cũ nếu có
  if (renderer.dragStartTimeout) {
    clearTimeout(renderer.dragStartTimeout)
  }
  
  // Handler để cancel delay nếu thả chuột
  const cancelDrag = () => {
    renderer.mouseUpOccurred = true // Đánh dấu mouseup đã xảy ra
    if (renderer.dragStartTimeout) {
      clearTimeout(renderer.dragStartTimeout)
      renderer.dragStartTimeout = null
    }
    renderer.isDragStarting = false
    // Nếu chưa di chuyển đủ, reset flag
    if (!renderer.hasMovedEnough) {
      renderer.hasMovedEnough = false
    }
    document.removeEventListener('mousemove', checkMouseMove)
    document.removeEventListener('mouseup', cancelDrag)
  }
  
  // Kiểm tra xem có di chuyển chuột nhiều không (nếu di chuyển > 10px thì cho phép drag ngay)
  const checkMouseMove = (e) => {
    const deltaX = Math.abs(e.clientX - startX)
    const deltaY = Math.abs(e.clientY - startY)
    if (deltaX > 10 || deltaY > 10) {
      // Di chuyển nhiều -> cho phép drag ngay (không cancel, chỉ cho phép)
      renderer.hasMovedEnough = true // Đánh dấu đã di chuyển đủ để phân biệt với click
      if (renderer.dragStartTimeout) {
        clearTimeout(renderer.dragStartTimeout)
        renderer.dragStartTimeout = null
      }
      renderer.isDragStarting = false // Cho phép drag ngay
      document.removeEventListener('mousemove', checkMouseMove)
      // KHÔNG remove mouseup listener vì cần để cleanup sau khi drag xong
    }
  }
  
  // Thêm listeners để cancel delay nếu thả chuột hoặc cho phép drag nếu di chuyển nhiều
  document.addEventListener('mousemove', checkMouseMove)
  document.addEventListener('mouseup', cancelDrag)
  
  // Sau 200ms, cho phép drag
  renderer.dragStartTimeout = setTimeout(() => {
    renderer.isDragStarting = false // Cho phép drag sau delay
    document.removeEventListener('mousemove', checkMouseMove)
    document.removeEventListener('mouseup', cancelDrag)
  }, 200)
}

/**
 * Create drag filter function
 */
export function createDragFilter(renderer) {
  return function(event, d) {
    // Chỉ kiểm tra điều kiện cơ bản trong filter (button, không block delay)
    // Logic delay sẽ được xử lý trong on('start')
    
    // Kiểm tra quyền write
    const hasWritePermission = renderer.options?.permissions?.write === 1
    if (!hasWritePermission) {
      return false
    }
    
    // Kiểm tra nếu đang edit hoặc là root node thì không cho phép drag
    const isRoot = d.data?.isRoot || d.id === 'root'
    const isEditing = renderer.editingNode === d.id
    if (isRoot || isEditing) {
      return false
    }
    
    // Kiểm tra xem click có phải vào editor không
    if (event.sourceEvent && event.sourceEvent.target) {
      const target = event.sourceEvent.target
      const checkElement = (el, classes) => {
        if (!el) return false
        if (el.classList) {
          return classes.some(cls => el.classList.contains(cls))
        }
        if (el.className) {
          const className = typeof el.className === 'string' 
            ? el.className 
            : el.className.baseVal || ''
          return classes.some(cls => className.includes(cls))
        }
        return false
      }
      
      const editorClasses = [
        'mindmap-node-editor',
        'mindmap-editor-content',
        'mindmap-editor-prose',
        'ProseMirror',
        'ProseMirror-focused'
      ]
      
      let current = target
      let depth = 0
      while (current && depth < 10) {
        if (checkElement(current, editorClasses)) {
          return false
        }
        current = current.parentNode
        depth++
      }
    }
    
    // Chỉ cho phép drag với left mouse button
    // Ngăn drag khi giữ con lăn chuột hoặc các button khác
    
    // Nếu không có sourceEvent, có thể là touch event, cho phép mặc định
    if (!event.sourceEvent) {
      return true
    }
    
    // ⚠️ CRITICAL: Kiểm tra buttons property (bitmask) để xác định button nào đang được nhấn
    // buttons: 0 = không có, 1 = left, 2 = right, 4 = middle
    // Cho phép khi buttons === 1 (left button) hoặc buttons === 2 (right button)
    if (event.sourceEvent.buttons !== undefined) {
      return event.sourceEvent.buttons === 1 || event.sourceEvent.buttons === 2
    }
    
    // Fallback: Kiểm tra button property nếu buttons không có
    // button: 0 = left, 1 = middle, 2 = right
    if (event.sourceEvent.button !== undefined) {
      return event.sourceEvent.button === 0 || event.sourceEvent.button === 2
    }
    
    // Nếu không có cả buttons và button, không cho phép (có thể là wheel event)
    return false
  }
}

/**
 * Handle drag start event
 */
export function handleDragStart(nodeElement, renderer, event, d) {
  // ⚠️ CRITICAL: Cho phép drag với left mouse button hoặc right mouse button
  // Ngăn drag khi giữ con lăn chuột hoặc các button khác
  if (event.sourceEvent) {
    // Kiểm tra buttons property (bitmask) - cho phép khi buttons === 1 (left button) hoặc buttons === 2 (right button)
    const isLeftButton = event.sourceEvent.buttons !== undefined 
      ? event.sourceEvent.buttons === 1
      : (event.sourceEvent.button !== undefined && event.sourceEvent.button === 0)
    const isRightButton = event.sourceEvent.buttons !== undefined 
      ? event.sourceEvent.buttons === 2
      : (event.sourceEvent.button !== undefined && event.sourceEvent.button === 2)
    
    if (!isLeftButton && !isRightButton) {
      // Không cho phép drag với middle mouse button hoặc wheel
      if (event.sourceEvent) {
        event.sourceEvent.preventDefault()
        event.sourceEvent.stopPropagation()
      }
      // Disable drag handlers
      d3.select(nodeElement).on('drag', null).on('end', null)
      // Reset flags
      renderer.isDragStarting = false
      renderer.mouseUpOccurred = false
      renderer.dragStartPosition = null
      renderer.dragStartNodeInfo = null
      renderer.isRightButtonDrag = false
      return
    }
    
    // Lưu flag để biết đang drag với right button
    if (isRightButton) {
      renderer.isRightButtonDrag = true
      // Ngăn context menu khi đang drag với right button
      if (event.sourceEvent) {
        event.sourceEvent.preventDefault()
      }
    } else {
      renderer.isRightButtonDrag = false
    }
  }
  
  // Nếu đang trong delay, cancel delay và cho phép drag
  if (renderer.isDragStarting) {
    if (renderer.dragStartTimeout) {
      clearTimeout(renderer.dragStartTimeout)
      renderer.dragStartTimeout = null
    }
    renderer.isDragStarting = false
  }
  
  const isRoot = d.data?.isRoot || d.id === 'root'
  const isEditing = renderer.editingNode === d.id
  
  // Nếu là root hoặc đang edit thì không cho phép drag
  if (isRoot || isEditing) {
    if (event.sourceEvent) {
      event.sourceEvent.preventDefault()
      event.sourceEvent.stopPropagation()
    }
    // Disable drag handlers
    d3.select(nodeElement).on('drag', null).on('end', null)
    // Reset flags
    renderer.isDragStarting = false
    renderer.mouseUpOccurred = false
    renderer.dragStartPosition = null
    renderer.dragStartNodeInfo = null
    return
  }
  
  // QUAN TRỌNG: KHÔNG phân biệt click và drag trong event 'start' vì:
  // - Event này chỉ chạy 1 lần duy nhất khi bắt đầu drag (0-1ms sau mousedown)
  // - Không có đủ thông tin để phân biệt click và drag tại thời điểm này
  // - Phân biệt click và drag sẽ được xử lý trong event 'drag' (được gọi nhiều lần) và 'end'
  
  // QUAN TRỌNG: KHÔNG tạo drag ghost và KHÔNG làm mờ node trong drag start
  // Vì event này chỉ chạy 1 lần (0-1ms sau mousedown), không thể phân biệt click và drag
  // Chỉ tạo drag ghost và làm mờ node khi đã di chuyển đủ trong drag handler
  // Điều này đảm bảo click không bị ảnh hưởng
  // KHÔNG stopPropagation ở đây để không chặn click/dblclick events
  // Chỉ stopPropagation khi thực sự đang drag (trong on('drag'))
  renderer.draggedNode = d.id
  const nodeGroup = d3.select(nodeElement)
  const nodeRect = nodeGroup.select('.node-rect')
  const rectWidth = parseFloat(nodeRect.attr('width')) || 130
  const rectHeight = parseFloat(nodeRect.attr('height')) || 43
  
  // Lấy vị trí ban đầu của node để tính offset (lưu để dùng sau)
  const pos = renderer.positions.get(d.id)
  const [x, y] = d3.pointer(event, renderer.g.node())
  
  // Tính offset để ghost không che con trỏ chuột
  const offsetX = pos ? (x - pos.x - rectWidth / 2) : -rectWidth / 2
  const offsetY = pos ? (y - pos.y - rectHeight / 2) : -rectHeight / 2
  
  // Lưu offset và thông tin node để sử dụng trong drag handler khi đã di chuyển đủ
  renderer.dragOffset = { x: offsetX, y: offsetY }
  renderer.dragStartNodeInfo = {
    id: d.id,
    rectWidth,
    rectHeight,
    label: d.data?.label || ''
  }
  
  // Lấy tất cả các node con cháu để dùng sau khi đã di chuyển đủ
  const descendantIds = getDescendantIds(d.id, renderer.edges)
  renderer.dragBranchNodeIds = [d.id, ...descendantIds] // Bao gồm cả node gốc
  
  // KHÔNG tạo drag ghost và KHÔNG làm mờ node ở đây
  // Sẽ được tạo trong drag handler khi đã di chuyển đủ
  
  // Tính bounding box của toàn bộ nhánh
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  
  renderer.dragBranchNodeIds.forEach(nodeId => {
    const pos = renderer.positions.get(nodeId)
    if (pos) {
      const nodeSize = renderer.nodeSizeCache.get(nodeId) || estimateNodeSize(renderer, renderer.nodes.find(n => n.id === nodeId))
      const nodeLeft = pos.x
      const nodeRight = pos.x + nodeSize.width
      const nodeTop = pos.y
      const nodeBottom = pos.y + nodeSize.height
      
      minX = Math.min(minX, nodeLeft)
      minY = Math.min(minY, nodeTop)
      maxX = Math.max(maxX, nodeRight)
      maxY = Math.max(maxY, nodeBottom)
    } else {
      console.warn('[DRAG START] Position not found for node:', nodeId)
    }
  })
  
  
  // KHÔNG làm mờ edges ở đây - sẽ được làm mờ trong drag handler khi đã di chuyển đủ
  // Điều này đảm bảo edges chỉ bị làm mờ khi thực sự drag, không phải khi click
  
  // KHÔNG tạo dragBranchGhost ở đây - sẽ được tạo trong drag handler khi đã di chuyển đủ
  // Điều này đảm bảo viền nét đứt chỉ xuất hiện khi thực sự drag, không phải khi click
}

/**
 * Calculate target edge path
 */
function calculateTargetEdgePath(sourcePos, targetPos, sourceSize, targetSize) {
  if (!sourcePos || !targetPos) return ''
  
  const sourceWidth = sourceSize.width
  const sourceHeight = sourceSize.height
  const targetWidth = targetSize.width
  const targetHeight = targetSize.height
  
  // Bắt đầu từ bên trái của ghost node (giữa theo chiều dọc)
  const x1 = sourcePos.x
  const y1 = sourcePos.y + (sourceHeight / 2)
  
  // Edge bên phải của target node - luôn nối vào chính giữa
  const x2 = targetPos.x + targetWidth
  const y2 = targetPos.y + (targetHeight / 2) // Chính giữa bên phải của target node
  
  const dx = x2 - x1
  const dy = y2 - y1
  const direction = dy >= 0 ? 1 : -1
  
  // ⚠️ CRITICAL: Đảm bảo ghost edge luôn hiển thị, ngay cả khi nodes cách xa nhau
  // Tăng giới hạn baseOffset và đảm bảo horizontalOffset luôn hợp lệ
  const baseOffset = Math.max(40, Math.min(Math.abs(dx) * 0.6, 300))
  // ⚠️ FIX: Đảm bảo horizontalOffset luôn hợp lệ và đủ lớn
  // Khi dx rất lớn, horizontalOffset sẽ bằng baseOffset (tối đa 300px)
  const horizontalOffset = Math.max(40, Math.min(baseOffset, Math.max(0, dx - 8)))
  
  const cornerRadius = Math.min(
    18,
    Math.abs(dy) / 2,
    Math.max(8, horizontalOffset / 3)
  )
  
  // ⚠️ CRITICAL: Đảm bảo path luôn hợp lệ
  // Tính toán midX và kiểm tra tính hợp lệ
  const minMidX = x1 + cornerRadius + 10
  const maxMidX = x2 - cornerRadius - 10
  
  // Nếu nodes quá gần nhau, dùng đường thẳng
  if (minMidX >= maxMidX || horizontalOffset < cornerRadius * 2 + 4) {
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }
  
  // Tính điểm giữa cho đường cong
  // Đi từ bên trái ghost node sang bên phải target node
  let midX = x1 + horizontalOffset
  
  // ⚠️ CRITICAL: Đảm bảo midX luôn hợp lệ và nằm giữa x1 và x2
  if (midX <= minMidX) {
    midX = minMidX + 10
  } else if (midX >= maxMidX) {
    midX = maxMidX - 10
  }
  
  // Kiểm tra lại một lần nữa để đảm bảo midX hợp lệ
  if (midX <= x1 + cornerRadius || midX >= x2 - cornerRadius) {
    // Nếu không hợp lệ, dùng đường thẳng để đảm bảo edge luôn hiển thị
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }
  
  // ⚠️ CRITICAL: Đảm bảo các điểm trong path luôn hợp lệ
  const startX = midX - cornerRadius
  const endX = midX + cornerRadius
  
  // Kiểm tra xem các điểm có hợp lệ không
  if (startX <= x1 || endX >= x2) {
    // Nếu không hợp lệ, dùng đường thẳng
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }
  
  // Tạo đường cong mượt mà: đi ngang từ x1, sau đó cong lên/xuống, rồi đi ngang đến x2
  const path = [
    `M ${x1} ${y1}`, // Bắt đầu từ bên trái ghost node
    `L ${startX} ${y1}`, // Đi ngang sang phải
    `Q ${midX} ${y1} ${midX} ${y1 + direction * cornerRadius}`, // Cong lên/xuống
    `L ${midX} ${y2 - direction * cornerRadius}`, // Đi dọc đến gần y2
    `Q ${midX} ${y2} ${endX} ${y2}`, // Cong để đi ngang
    `L ${x2} ${y2}` // Đi ngang đến edge bên phải target node
  ]
  
  return path.join(' ')
}

/**
 * Handle drag event
 */
export function handleDrag(nodeElement, renderer, event, d) {
  // Khi đang drag
  
  // ⚠️ CRITICAL: Cho phép drag với left mouse button hoặc right mouse button
  // Ngăn drag khi giữ con lăn chuột hoặc các button khác
  if (event.sourceEvent) {
    // Kiểm tra buttons property (bitmask) - cho phép khi buttons === 1 (left button) hoặc buttons === 2 (right button)
    const isLeftButton = event.sourceEvent.buttons !== undefined 
      ? event.sourceEvent.buttons === 1
      : (event.sourceEvent.button !== undefined && event.sourceEvent.button === 0)
    const isRightButton = event.sourceEvent.buttons !== undefined 
      ? event.sourceEvent.buttons === 2
      : (event.sourceEvent.button !== undefined && event.sourceEvent.button === 2)
    
    if (!isLeftButton && !isRightButton) {
      // Không cho phép drag với middle mouse button hoặc wheel
      if (event.sourceEvent) {
        event.sourceEvent.preventDefault()
        event.sourceEvent.stopPropagation()
      }
      // Disable drag handlers
      d3.select(nodeElement).on('drag', null).on('end', null)
      // Cleanup ngay lập tức
      if (renderer.dragGhost) {
        renderer.dragGhost.remove()
        renderer.dragGhost = null
      }
      if (renderer.dragGhostEdgesGroup) {
        renderer.dragGhostEdgesGroup.remove()
        renderer.dragGhostEdgesGroup = null
      }
      cleanupDragBranchEffects(renderer)
      // Reset flags
      renderer.isDragStarting = false
      renderer.mouseUpOccurred = false
      renderer.hasMovedEnough = false
      renderer.dragStartPosition = null
      renderer.dragStartTime = null
      renderer.dragStartNodeInfo = null
      renderer.taskLinkDragChecked = false
      renderer.isRightButtonDrag = false
      return
    }
    
    // Ngăn context menu khi đang drag với right button
    if (isRightButton || renderer.isRightButtonDrag) {
      renderer.isRightButtonDrag = true
      if (event.sourceEvent) {
        event.sourceEvent.preventDefault()
      }
    }
  }
  
  // QUAN TRỌNG: Phân biệt click và drag ở đây (event được gọi nhiều lần khi di chuyển)
  // Cập nhật hasMovedEnough trước khi kiểm tra
  if (renderer.dragStartPosition && event.sourceEvent) {
    const currentX = event.sourceEvent.clientX || event.sourceEvent.pageX
    const currentY = event.sourceEvent.clientY || event.sourceEvent.pageY
    const deltaX = Math.abs(currentX - renderer.dragStartPosition.x)
    const deltaY = Math.abs(currentY - renderer.dragStartPosition.y)
    if (deltaX > 10 || deltaY > 10) {
      renderer.hasMovedEnough = true
      // ⚠️ CRITICAL: Nếu đã di chuyển đủ và đang drag với right button, set flag để ngăn context menu
      if (renderer.isRightButtonDrag) {
        renderer.shouldPreventContextMenu = true
      }
    }
  }
  
  // ⚠️ Kiểm tra node có task link không CHỈ KHI ĐÃ DI CHUYỂN ĐỦ (drag thực sự, không phải click)
  // Chỉ kiểm tra một lần khi phát hiện movement đầu tiên
  if (renderer.hasMovedEnough && !renderer.taskLinkDragChecked && renderer.draggedNode === d.id) {
    const nodeLabel = d.data?.label || ''
    const hasTaskLink = d.data?.taskLink || 
      nodeLabel.includes('node-task-link-section') || 
      nodeLabel.includes('node-task-badge') || 
      nodeLabel.includes('data-node-section="task-link"') ||
      nodeLabel.includes('Liên kết công việc')
    
    // Đánh dấu đã kiểm tra để không kiểm tra lại
    renderer.taskLinkDragChecked = true
    
    // Nếu node có task link và chưa được confirm, hiển thị cảnh báo và cancel drag
    if (hasTaskLink && !renderer.taskLinkDragConfirmed.has(d.id)) {
      // Cancel drag ngay lập tức và đợi user confirm
      if (event.sourceEvent) {
        event.sourceEvent.preventDefault()
        event.sourceEvent.stopPropagation()
      }
      // Disable drag handlers tạm thời
      d3.select(nodeElement).on('drag', null).on('end', null)
      
      // Gọi callback để hiển thị dialog (không await vì d3.drag không hỗ trợ async)
      const confirmPromise = renderer.callbacks?.onTaskLinkDragConfirm 
        ? renderer.callbacks.onTaskLinkDragConfirm(d.id)
        : Promise.resolve(window.confirm('Nhánh đang được liên kết tới công việc, bạn vẫn muốn thay đổi vị trí nhánh?'))
      
      confirmPromise.then((confirmed) => {
        if (confirmed) {
          // Nếu user xác nhận, lưu vào Set để lần sau không hỏi nữa
          renderer.taskLinkDragConfirmed.add(d.id)
        } else {
          // User hủy - đã cancel drag ở trên
        }
        // Reset flag để có thể kiểm tra lại lần sau
        renderer.taskLinkDragChecked = false
      }).catch((error) => {
        console.error('[DRAG] Error showing task link drag dialog:', error)
        // Fallback to window.confirm nếu callback lỗi
        const confirmed = window.confirm('Nhánh đang được liên kết tới công việc, bạn vẫn muốn thay đổi vị trí nhánh?')
        if (confirmed) {
          renderer.taskLinkDragConfirmed.add(d.id)
        }
        renderer.taskLinkDragChecked = false
      })
      
      // Reset flags và cleanup
      renderer.isDragStarting = false
      renderer.mouseUpOccurred = false
      renderer.hasMovedEnough = false
      renderer.dragStartPosition = null
      renderer.dragStartTime = null
      renderer.dragStartNodeInfo = null
      renderer.draggedNode = null
      
      // Cleanup drag effects
      if (renderer.dragGhost) {
        renderer.dragGhost.remove()
        renderer.dragGhost = null
      }
      if (renderer.dragGhostEdgesGroup) {
        renderer.dragGhostEdgesGroup.remove()
        renderer.dragGhostEdgesGroup = null
      }
      cleanupDragBranchEffects(renderer)
      
      return
    }
  }
  
  // QUAN TRỌNG: Kiểm tra click TRƯỚC KHI stopPropagation
  // Nếu chưa di chuyển đủ, có thể là click -> không làm gì cả, để click handler hoạt động
  if (!renderer.hasMovedEnough) {
    // Nếu mouseup đã xảy ra -> chắc chắn là click, cancel drag
    if (renderer.mouseUpOccurred) {
      // Disable drag handlers để không tiếp tục drag
      d3.select(nodeElement).on('drag', null).on('end', null)
      // Cleanup ngay lập tức
      if (renderer.dragGhost) {
        renderer.dragGhost.remove()
        renderer.dragGhost = null
      }
      if (renderer.dragGhostEdgesGroup) {
        renderer.dragGhostEdgesGroup.remove()
        renderer.dragGhostEdgesGroup = null
      }
      cleanupDragBranchEffects(renderer)
      // Reset flags
      renderer.isDragStarting = false
      renderer.mouseUpOccurred = false
      renderer.hasMovedEnough = false
      renderer.dragStartPosition = null
      renderer.dragStartTime = null
      renderer.dragStartNodeInfo = null
      renderer.taskLinkDragChecked = false // Reset flag để có thể kiểm tra lại lần sau
      // KHÔNG stopPropagation để click handler có thể hoạt động
      return
    }
    // Nếu chưa di chuyển đủ và mouseup chưa xảy ra, có thể đang trong quá trình click
    // Không làm gì cả, để click handler có thể hoạt động
    // KHÔNG stopPropagation
    return
  }
  
  // Nếu đã di chuyển đủ, đây là drag thật -> tạo drag ghost và làm mờ node
  if (renderer.hasMovedEnough) {
    // CHỈ stopPropagation khi thực sự đang drag (đã di chuyển đủ)
    if (event.sourceEvent) {
      event.sourceEvent.stopPropagation()
    }
    
    // Tạo drag ghost và làm mờ node nếu chưa có (chỉ tạo 1 lần khi phát hiện movement)
    if (!renderer.dragGhost && renderer.dragStartNodeInfo) {
      const [x, y] = d3.pointer(event, renderer.g.node())
      const ghostX = x + renderer.dragOffset.x
      const ghostY = y + renderer.dragOffset.y
      const { rectWidth, rectHeight, label } = renderer.dragStartNodeInfo
      
      try {
        // Tạo ghost node
        renderer.dragGhost = renderer.g.append('g')
          .attr('class', 'drag-ghost')
          .attr('transform', `translate(${ghostX}, ${ghostY})`)
          .style('opacity', 0.8)
          .style('pointer-events', 'none')
          .style('visibility', 'visible')
          .style('display', 'block')
        
        renderer.dragGhost.raise()
        
        // Copy node rect với border dashed
        renderer.dragGhost.append('rect')
          .attr('width', rectWidth)
          .attr('height', rectHeight)
          .attr('rx', 8)
          .attr('fill', '#f3f4f6')
          .attr('stroke', '#3b82f6')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '8,4')
        
        // Copy node text
        const textContent = label.replace(/<[^>]*>/g, '').trim() || 'Node'
        const displayText = textContent.length > 30 ? textContent.substring(0, 30) + '...' : textContent
        renderer.dragGhost.append('text')
          .attr('x', rectWidth / 2)
          .attr('y', rectHeight / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', '#374151')
          .attr('font-size', '14px')
          .attr('font-weight', '400')
          .text(displayText)
        
        // Tạo ghost edges group
        renderer.dragGhostEdgesGroup = renderer.g.append('g')
          .attr('class', 'drag-ghost-edges')
          .style('pointer-events', 'none')
          .style('visibility', 'visible')
          .style('display', 'block')
        
        renderer.dragGhostEdgesGroup.raise()
        
        // Làm mờ tất cả các node trong nhánh
        renderer.dragBranchNodeIds.forEach(nodeId => {
          const branchNodeGroup = renderer.g.select(`[data-node-id="${nodeId}"]`)
          if (!branchNodeGroup.empty()) {
            branchNodeGroup.style('opacity', 0.2)
            branchNodeGroup.style('pointer-events', 'none')
          }
        })
        
        // Làm mờ tất cả các edge liên quan đến nhánh
        const branchNodeIdsSet = new Set(renderer.dragBranchNodeIds)
        renderer.edges.forEach(edge => {
          const isSourceInBranch = branchNodeIdsSet.has(edge.source)
          const isTargetInBranch = branchNodeIdsSet.has(edge.target)
          if (isSourceInBranch || isTargetInBranch) {
            const edgeElement = renderer.g.select(`.edge[data-edge-id="${edge.id}"]`)
            if (!edgeElement.empty()) {
              edgeElement
                .classed('drag-branch-edge', true)
                .style('opacity', 0.2)
            }
          }
        })
        
        // Tạo border nét đứt bao quanh nhánh
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        renderer.dragBranchNodeIds.forEach(nodeId => {
          const pos = renderer.positions.get(nodeId)
          if (pos) {
            const nodeSize = renderer.nodeSizeCache.get(nodeId) || estimateNodeSize(renderer, renderer.nodes.find(n => n.id === nodeId))
            minX = Math.min(minX, pos.x)
            minY = Math.min(minY, pos.y)
            maxX = Math.max(maxX, pos.x + nodeSize.width)
            maxY = Math.max(maxY, pos.y + nodeSize.height)
          }
        })
        
        if (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity) {
          const padding = 10
          const branchGhostGroup = renderer.g.insert('g', ':first-child')
            .attr('class', 'drag-branch-ghost-group')
            .style('pointer-events', 'none')
          
          renderer.dragBranchGhost = branchGhostGroup.append('rect')
            .attr('class', 'drag-branch-ghost')
            .attr('x', minX - padding)
            .attr('y', minY - padding)
            .attr('width', maxX - minX + padding * 2)
            .attr('height', maxY - minY + padding * 2)
            .attr('rx', 8)
            .attr('fill', 'none')
            .attr('stroke', '#3b82f6')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '8,4')
            .attr('opacity', 0.6)
        }
        
      } catch (error) {
        console.error('[DRAG] Error creating drag ghost:', error)
      }
    }
  }
  
  const [x, y] = d3.pointer(event, renderer.g.node())
  
  // Vị trí mới của ghost node
  const ghostX = x + renderer.dragOffset.x
  const ghostY = y + renderer.dragOffset.y
  const ghostNodePos = { x: ghostX, y: ghostY }
  
  // ⚠️ CRITICAL: Lưu vị trí Y cuối cùng để tính toán drop position khi drop vào target node khác cấp
  renderer.dragFinalY = ghostY
  
  // ⚠️ CRITICAL: Phát hiện sibling nodes để sắp xếp lại thứ tự
  // Sử dụng vị trí Y của ghost node thay vì pointer để tính toán chính xác hơn
  const draggedNodeParentId = getParentNodeId(d.id, renderer.edges)
  if (draggedNodeParentId) {
    const siblings = getSiblingNodes(d.id, renderer.edges)
    let dropPosition = null // null = không drop, hoặc index trong danh sách siblings
    
    // ⚠️ CRITICAL: Sử dụng ghostY (vị trí Y của ghost node) thay vì y (vị trí Y của pointer)
    // Điều này đảm bảo vị trí drop chính xác hơn
    const ghostNodeSize = renderer.nodeSizeCache.get(d.id) || { width: 130, height: 43 }
    const ghostCenterY = ghostY + ghostNodeSize.height / 2
    
    // Tìm vị trí drop dựa trên vị trí Y của ghost node
    // Sắp xếp siblings theo thứ tự Y để tính toán chính xác
    const sortedSiblings = siblings.map(siblingId => {
      const siblingPos = renderer.positions.get(siblingId)
      if (siblingPos) {
        const siblingSize = renderer.nodeSizeCache.get(siblingId) || estimateNodeSize(renderer, renderer.nodes.find(n => n.id === siblingId))
        return {
          id: siblingId,
          y: siblingPos.y,
          centerY: siblingPos.y + siblingSize.height / 2,
          bottomY: siblingPos.y + siblingSize.height
        }
      }
      return null
    }).filter(s => s !== null).sort((a, b) => a.y - b.y)
    
    // ⚠️ CRITICAL: Tìm vị trí drop dựa trên ghostCenterY
    // dropPosition là index trong danh sách siblings đã được sắp xếp theo Y
    if (sortedSiblings.length > 0) {
      // Kiểm tra xem ghost node có ở trên sibling đầu tiên không
      if (ghostCenterY < sortedSiblings[0].y) {
        dropPosition = 0
      }
      // Kiểm tra xem ghost node có ở dưới sibling cuối cùng không
      else if (ghostCenterY > sortedSiblings[sortedSiblings.length - 1].bottomY) {
        dropPosition = sortedSiblings.length
      }
      // Tìm vị trí giữa các siblings
      else {
        for (let i = 0; i < sortedSiblings.length; i++) {
          const sibling = sortedSiblings[i]
          // Nếu ghost center ở trên center của sibling này, drop trước sibling này
          if (ghostCenterY < sibling.centerY) {
            // dropPosition là index trong danh sách đã sắp xếp theo Y
            dropPosition = i
            break
          }
        }
        
        // Nếu không tìm thấy, drop ở cuối
        if (dropPosition === null) {
          dropPosition = sortedSiblings.length
        }
      }
    } else {
      // Không có siblings, drop ở đầu
      dropPosition = 0
    }
    
    // ⚠️ CRITICAL: Lưu thông tin về sortedSiblings để dùng trong handleDragEnd
    // Điều này đảm bảo dropPosition được tính toán dựa trên thứ tự Y, không phải thứ tự edges
    renderer.dragSortedSiblingIds = sortedSiblings.map(s => s.id)
    
    // Lưu thông tin drop position để dùng trong handleDragEnd
    if (dropPosition !== null && siblings.length >= 0) {
      renderer.dragSiblingDropPosition = dropPosition
      renderer.dragSiblingParentId = draggedNodeParentId
    } else {
      renderer.dragSiblingDropPosition = null
      renderer.dragSiblingParentId = null
    }
  } else {
    // Không có parent (root node)
    renderer.dragSiblingDropPosition = null
    renderer.dragSiblingParentId = null
  }
  
  // Cập nhật vị trí ghost node (nếu đã được tạo)
  if (renderer.dragGhost) {
    renderer.dragGhost.attr('transform', `translate(${ghostX}, ${ghostY})`)
  }
  
  // ⚠️ CRITICAL: Tạo/cập nhật ghost edge từ parent đến ghost node khi reorder trong cùng parent
  // Sử dụng draggedNodeParentId đã được khai báo ở trên
  if (renderer.dragGhostEdgesGroup && draggedNodeParentId && !renderer.dragTargetNode) {
    // Chỉ tạo ghost edge khi không có target node mới (đang reorder trong cùng parent)
    const parentPos = renderer.positions.get(draggedNodeParentId)
    const parentNode = renderer.nodes.find(n => n.id === draggedNodeParentId)
    
    if (parentPos && parentNode) {
      const parentSize = renderer.nodeSizeCache.get(draggedNodeParentId) || estimateNodeSize(renderer, parentNode)
      const ghostNodeSize = renderer.nodeSizeCache.get(d.id) || { width: 130, height: 43 }
      
      // Kiểm tra xem đã có ghost edge đến parent chưa
      let parentGhostEdge = renderer.dragGhostEdgesGroup.select('.drag-ghost-edge-parent')
      
      if (parentGhostEdge.empty()) {
        // Tạo mới ghost edge đến parent với màu xanh dương giống như edge bình thường
        parentGhostEdge = renderer.dragGhostEdgesGroup.append('path')
          .attr('class', 'drag-ghost-edge-parent')
          .attr('fill', 'none')
          .attr('stroke', '#3b82f6') // Màu xanh dương
          .attr('stroke-width', 2) // Bằng với edge bình thường
          .attr('stroke-dasharray', '8,4') // Nét đứt
          .attr('stroke-opacity', 0.6) // Màu nhạt hơn
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .raise() // Đảm bảo edge luôn ở trên cùng
      }
      
      // Tính toán path từ parent đến ghost node
      // Parent node ở bên trái, ghost node ở bên phải
      const x1 = parentPos.x + parentSize.width // Bên phải parent node
      const y1 = parentPos.y + (parentSize.height / 2) // Giữa parent node
      const x2 = ghostNodePos.x // Bên trái ghost node
      const y2 = ghostNodePos.y + (ghostNodeSize.height / 2) // Giữa ghost node
      
      const dx = x2 - x1
      const dy = y2 - y1
      const direction = dy >= 0 ? 1 : -1
      
      // Tính toán horizontal offset để tạo đường cong mượt mà
      const baseOffset = Math.max(40, Math.min(Math.abs(dx) * 0.6, 300))
      const horizontalOffset = Math.max(40, Math.min(baseOffset, Math.max(0, dx - 8)))
      
      const cornerRadius = Math.min(
        18,
        Math.abs(dy) / 2,
        Math.max(8, horizontalOffset / 3)
      )
      
      // Tính toán midX và kiểm tra tính hợp lệ
      const minMidX = x1 + cornerRadius + 10
      const maxMidX = x2 - cornerRadius - 10
      
      let edgePath = ''
      if (minMidX >= maxMidX || horizontalOffset < cornerRadius * 2 + 4) {
        // Dùng đường thẳng nếu quá gần
        edgePath = `M ${x1} ${y1} L ${x2} ${y2}`
      } else {
        // Tính điểm giữa cho đường cong
        let midX = x1 + horizontalOffset
        
        // Đảm bảo midX luôn hợp lệ
        if (midX <= minMidX) {
          midX = minMidX + 10
        } else if (midX >= maxMidX) {
          midX = maxMidX - 10
        }
        
        // Kiểm tra lại một lần nữa
        if (midX <= x1 + cornerRadius || midX >= x2 - cornerRadius) {
          edgePath = `M ${x1} ${y1} L ${x2} ${y2}`
        } else {
          const startX = midX - cornerRadius
          const endX = midX + cornerRadius
          
          if (startX <= x1 || endX >= x2) {
            edgePath = `M ${x1} ${y1} L ${x2} ${y2}`
          } else {
            edgePath = [
              `M ${x1} ${y1}`,
              `L ${startX} ${y1}`,
              `Q ${midX} ${y1} ${midX} ${y1 + direction * cornerRadius}`,
              `L ${midX} ${y2 - direction * cornerRadius}`,
              `Q ${midX} ${y2} ${endX} ${y2}`,
              `L ${x2} ${y2}`
            ].join(' ')
          }
        }
      }
      
      // Cập nhật path và đảm bảo edge luôn ở trên cùng
      parentGhostEdge.attr('d', edgePath).raise()
    }
  } else if (renderer.dragGhostEdgesGroup && (!draggedNodeParentId || renderer.dragTargetNode)) {
    // Xóa ghost edge đến parent nếu không có parent hoặc đang drag sang parent mới
    renderer.dragGhostEdgesGroup.select('.drag-ghost-edge-parent').remove()
  }
  
  // KHÔNG cập nhật ghost edges xanh dương (đã bỏ)
  // Chỉ cập nhật ghost edge xanh lá đến target node nếu có
  if (renderer.dragGhostEdgesGroup && renderer.dragTargetNode) {
    const targetGhostEdge = renderer.dragGhostEdgesGroup.select('.drag-ghost-edge-target')
    if (!targetGhostEdge.empty()) {
      const targetNode = renderer.nodes.find(n => n.id === renderer.dragTargetNode)
      if (targetNode) {
        const targetPos = renderer.positions.get(renderer.dragTargetNode)
        const targetSize = renderer.nodeSizeCache.get(renderer.dragTargetNode) || { width: 130, height: 43 }
        const ghostNodeSize = renderer.nodeSizeCache.get(d.id) || { width: 130, height: 43 }
        
        if (targetPos) {
          const edgePath = calculateTargetEdgePath(
            ghostNodePos,
            targetPos,
            ghostNodeSize,
            targetSize
          )
          
          targetGhostEdge.attr('d', edgePath)
        }
      }
    }
  }
  
  // Tìm node đích (node đang hover) bằng cách tìm node gần nhất với edge bên phải của node
  // Giống Lark: ghost edge chỉ xuất hiện khi pointer đến gần edge bên phải của target node
  let targetNodeGroup = null
  let minDistance = Infinity
  let closestNode = null
  
  // Ngưỡng khoảng cách để coi node là target (pixels) - chỉ tính từ edge bên phải
  const maxTargetDistance = 150 // Khoảng cách tối đa từ pointer đến edge bên phải (tăng để dễ detect hơn)
  
  // Tìm node gần nhất với edge bên phải của node
  // ⚠️ FIX: Mở rộng detection để bao phủ toàn bộ nhánh con (đặc biệt vùng dưới node con cuối cùng)
  renderer.nodes.forEach(node => {
    const pos = renderer.positions.get(node.id)
    if (pos) {
      const nodeSize = renderer.nodeSizeCache.get(node.id) || estimateNodeSize(renderer, node)
      
      const nodeRight = pos.x + nodeSize.width // Edge bên phải của node
      const nodeTop = pos.y
      const nodeBottom = pos.y + nodeSize.height
      
      // ⚠️ FIX: Tính toán phạm vi dọc của toàn bộ nhánh con (bao gồm cả các node con cháu)
      const childEdges = renderer.edges.filter(e => e.source === node.id)
      let maxChildY = nodeBottom // Vị trí Y của node con xa nhất về phía dưới
      let minChildY = nodeTop // Vị trí Y của node con xa nhất về phía trên
      
      if (childEdges.length > 0) {
        // Tìm tất cả node con cháu để tính phạm vi dọc
        const descendantIds = getDescendantIds(node.id, renderer.edges)
        descendantIds.forEach(descendantId => {
          const descendantPos = renderer.positions.get(descendantId)
          if (descendantPos) {
            const descendantSize = renderer.nodeSizeCache.get(descendantId) || estimateNodeSize(renderer, renderer.nodes.find(n => n.id === descendantId))
            const descendantBottom = descendantPos.y + descendantSize.height
            
            if (descendantBottom > maxChildY) {
              maxChildY = descendantBottom
            }
            if (descendantPos.y < minChildY) {
              minChildY = descendantPos.y
            }
          }
        })
      }
      
      // Chỉ tính khoảng cách đến edge bên phải của node (không phải toàn bộ node)
      // Pointer có thể ở bên trái hoặc bên phải edge một chút
      const edgeX = nodeRight
      
      // Tính khoảng cách từ pointer đến edge bên phải
      // Khoảng cách ngang: từ pointer đến edge (có thể âm nếu pointer ở bên trái edge)
      const dx = Math.abs(x - edgeX)
      
      // ⚠️ FIX: Tính khoảng cách dọc dựa trên phạm vi của toàn bộ nhánh con
      let dy
      if (y < minChildY) {
        // Pointer ở trên toàn bộ nhánh -> khoảng cách đến điểm trên cùng
        dy = minChildY - y
      } else if (y > maxChildY) {
        // Pointer ở dưới toàn bộ nhánh -> khoảng cách đến điểm dưới cùng
        dy = y - maxChildY
      } else {
        // Pointer ở trong phạm vi dọc của nhánh (từ minChildY đến maxChildY) -> khoảng cách dọc = 0
        dy = 0
      }
      
      // Tính khoảng cách tổng từ pointer đến edge bên phải
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      // ⚠️ FIX: Mở rộng điều kiện detection:
      // 1. Khoảng cách <= maxTargetDistance HOẶC
      // 2. Pointer ở trong phạm vi dọc của nhánh (dy === 0) và gần về mặt ngang (dx <= maxTargetDistance * 2)
      const isInVerticalRange = dy === 0
      const isHorizontallyClose = dx <= maxTargetDistance * 2 // Mở rộng phạm vi ngang khi ở trong vùng dọc
      
      // Chỉ xem xét node nếu:
      // - Khoảng cách tổng <= maxTargetDistance, HOẶC
      // - Pointer ở trong phạm vi dọc của nhánh và gần về mặt ngang
      // - Pointer phải ở gần edge (không quá xa về phía trái)
      if ((distance <= maxTargetDistance || (isInVerticalRange && isHorizontallyClose)) && 
          x >= edgeX - maxTargetDistance * 2 && distance < minDistance) {
        minDistance = distance
        closestNode = node
      }
    }
  })
  
  if (closestNode) {
    targetNodeGroup = renderer.g.select(`[data-node-id="${closestNode.id}"]`)
  } else {
  }
  
  if (targetNodeGroup && targetNodeGroup.node() && targetNodeGroup.datum()) {
    const targetDatum = targetNodeGroup.datum()
    const isRoot = targetDatum.data?.isRoot || targetDatum.id === 'root'
    const isSameNode = targetDatum.id === d.id
    const isDescendantNode = isDescendant(d.id, targetDatum.id, renderer.edges)
    
    // Chỉ highlight nếu không phải cùng node và không phải descendant
    // Cho phép drop vào root node (giống Lark)
    if (!isSameNode && !isDescendantNode) {
      // Remove highlight từ node cũ
      if (renderer.dragTargetNode && renderer.dragTargetNode !== targetDatum.id) {
        const oldTarget = renderer.g.select(`[data-node-id="${renderer.dragTargetNode}"]`)
        oldTarget.select('.node-rect')
          .attr('stroke', d => {
            if (d.data?.isRoot) return 'none'
            if (renderer.selectedNode === d.id) return '#3b82f6'
            return '#cbd5e1'
          })
          .attr('stroke-width', d => renderer.selectedNode === d.id ? 2 : 2)
      }
      
      // ⚠️ FIX: Xác định drop zone dựa trên vị trí các node con (chỉ cho node có children)
      const targetPos = renderer.positions.get(targetDatum.id)
      const targetSize = renderer.nodeSizeCache.get(targetDatum.id) || { width: 130, height: 43 }
      const ghostNodeSize = renderer.nodeSizeCache.get(d.id) || { width: 130, height: 43 }
      const ghostNodeCenterY = ghostNodePos.y + ghostNodeSize.height / 2
      
      // Lấy danh sách node con trực tiếp của target node
      const childEdges = renderer.edges.filter(e => e.source === targetDatum.id)
      const hasChildren = childEdges.length > 0
      
      let dropZone = null // 'child' | 'sibling-above' | 'sibling-below'
      
      if (hasChildren && targetPos) {
        // Tính toán vị trí Y của node con đầu tiên và cuối cùng
        const childNodes = childEdges.map(edge => {
          const childPos = renderer.positions.get(edge.target)
          if (childPos) {
            const childSize = renderer.nodeSizeCache.get(edge.target) || estimateNodeSize(renderer, renderer.nodes.find(n => n.id === edge.target))
            return {
              id: edge.target,
              top: childPos.y,
              bottom: childPos.y + childSize.height,
              centerY: childPos.y + childSize.height / 2
            }
          }
          return null
        }).filter(n => n !== null).sort((a, b) => a.top - b.top) // Sắp xếp theo Y từ trên xuống
        
        if (childNodes.length > 0) {
          const firstChildTop = childNodes[0].top
          const lastChildBottom = childNodes[childNodes.length - 1].bottom
          const targetTop = targetPos.y
          const targetBottom = targetPos.y + targetSize.height
          
          // ⚠️ FIX: Mở rộng vùng drop zones với buffer để dễ drop vào vị trí đầu/cuối
          // Buffer zone để dễ dàng drop vào vị trí đầu/cuối (50% chiều cao của node con đầu/cuối)
          const firstChildHeight = childNodes[0].bottom - childNodes[0].top
          const lastChildHeight = childNodes[childNodes.length - 1].bottom - childNodes[childNodes.length - 1].top
          const bufferAbove = Math.max(30, firstChildHeight * 0.5) // Buffer tối thiểu 30px
          const bufferBelow = Math.max(30, lastChildHeight * 0.5) // Buffer tối thiểu 30px
          
          // Xác định 3 vùng drop zones:
          // 1. Sibling Above Zone: từ đầu node đến đầu node con đầu tiên + buffer
          // 2. Child Zone: từ đầu node con đầu tiên - buffer đến cuối node con cuối cùng + buffer
          // 3. Sibling Below Zone: từ cuối node con cuối cùng - buffer đến cuối node
          
          const siblingAboveZoneEnd = firstChildTop + bufferAbove
          const siblingBelowZoneStart = lastChildBottom - bufferBelow
          
          if (ghostNodeCenterY < siblingAboveZoneEnd) {
            // Vùng trên cùng - trở thành anh em trên của node con đầu tiên
            dropZone = 'sibling-above'
          } else if (ghostNodeCenterY > siblingBelowZoneStart) {
            // Vùng dưới cùng - trở thành anh em dưới của node con cuối cùng
            dropZone = 'sibling-below'
          } else {
            // Vùng giữa - trở thành con của target node
            dropZone = 'child'
          }
          
          
          // Lưu drop zone và thông tin về vị trí drop
          renderer.dragDropZone = dropZone
          if (dropZone === 'sibling-above') {
            renderer.dragDropTargetSiblingId = childNodes[0].id // Node con đầu tiên
          } else if (dropZone === 'sibling-below') {
            renderer.dragDropTargetSiblingId = childNodes[childNodes.length - 1].id // Node con cuối cùng
          } else {
            renderer.dragDropTargetSiblingId = null
          }
        }
      } else {
        // Node không có children - chỉ có child zone (toàn bộ node)
        dropZone = 'child'
        renderer.dragDropZone = dropZone
        renderer.dragDropTargetSiblingId = null
      }
      
      // Highlight node mới với màu xanh dương giống như khi được select
      renderer.dragTargetNode = targetDatum.id
      targetNodeGroup.select('.node-rect')
        .attr('stroke', '#3b82f6')
        .attr('stroke-width', 2) // Giống như khi được select
        // Không có stroke-dasharray để border active không nét đứt
      
      // ⚠️ CRITICAL: Xóa ghost edge đến parent khi có target node mới
      if (renderer.dragGhostEdgesGroup) {
        renderer.dragGhostEdgesGroup.select('.drag-ghost-edge-parent').remove()
      }
      
      // Tạo/cập nhật ghost edge từ ghost node đến target node
      if (renderer.dragGhostEdgesGroup && targetPos) {
        const edgePath = calculateTargetEdgePath(
          ghostNodePos,
          targetPos,
          ghostNodeSize,
          targetSize
        )
        
        // Kiểm tra xem đã có ghost edge đến target chưa
        let targetGhostEdge = renderer.dragGhostEdgesGroup.select('.drag-ghost-edge-target')
        
        if (targetGhostEdge.empty()) {
          // Tạo mới ghost edge đến target với màu xanh dương giống Lark
          targetGhostEdge = renderer.dragGhostEdgesGroup.append('path')
            .attr('class', 'drag-ghost-edge-target')
            .attr('fill', 'none')
            .attr('stroke', '#3b82f6') // Màu xanh dương
            .attr('stroke-width', 2) // Bằng với edge bình thường
            .attr('stroke-dasharray', '8,4') // Nét đứt
            .attr('stroke-opacity', 0.6) // Màu nhạt hơn
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .raise() // Đảm bảo edge đến target luôn ở trên cùng
        }
        
        // Cập nhật path và đảm bảo edge đến target luôn ở trên cùng
        targetGhostEdge.attr('d', edgePath).raise()
      }
    } else {
      // Remove highlight nếu không hợp lệ
      if (renderer.dragTargetNode) {
        const oldTarget = renderer.g.select(`[data-node-id="${renderer.dragTargetNode}"]`)
        oldTarget.select('.node-rect')
          .attr('stroke', d => {
            if (d.data?.isRoot) return 'none'
            if (renderer.selectedNode === d.id) return '#3b82f6'
            return '#cbd5e1'
          })
          .attr('stroke-width', d => renderer.selectedNode === d.id ? 2 : 2)
          .attr('stroke-dasharray', null)
        renderer.dragTargetNode = null
        renderer.dragDropZone = null
        renderer.dragDropTargetSiblingId = null
        
        // Xóa ghost edge đến target
        if (renderer.dragGhostEdgesGroup) {
          renderer.dragGhostEdgesGroup.select('.drag-ghost-edge-target').remove()
        }
      }
      // ⚠️ CRITICAL: Khi không có target node hợp lệ, hiển thị lại ghost edge đến parent nếu có
      // Logic này sẽ được xử lý ở phần đầu của handleDrag khi cập nhật ghost edge đến parent
    }
  } else {
    // Remove highlight nếu không có target
    if (renderer.dragTargetNode) {
      const oldTarget = renderer.g.select(`[data-node-id="${renderer.dragTargetNode}"]`)
      oldTarget.select('.node-rect')
        .attr('stroke', d => d.data?.isRoot ? 'none' : '#cbd5e1')
        .attr('stroke-width', 2)
      renderer.dragTargetNode = null
      renderer.dragDropZone = null
      renderer.dragDropTargetSiblingId = null
      
      // Xóa ghost edge đến target
      if (renderer.dragGhostEdgesGroup) {
        renderer.dragGhostEdgesGroup.select('.drag-ghost-edge-target').remove()
      }
    }
    // ⚠️ CRITICAL: Khi không có target, hiển thị lại ghost edge đến parent nếu có
    // Logic này sẽ được xử lý ở phần đầu của handleDrag khi cập nhật ghost edge đến parent
  }
}

/**
 * Handle drag end event
 */
export function handleDragEnd(nodeElement, renderer, event, d) {
  // Kết thúc drag
  const targetNodeId = renderer.dragTargetNode
  
  // Kiểm tra: nếu chưa di chuyển đủ, coi như click -> không thực hiện drop
  // Kiểm tra lại movement một lần nữa để chắc chắn
  let actuallyMoved = renderer.hasMovedEnough
  if (!actuallyMoved && renderer.dragStartPosition && event.sourceEvent) {
    const currentX = event.sourceEvent.clientX || event.sourceEvent.pageX
    const currentY = event.sourceEvent.clientY || event.sourceEvent.pageY
    if (currentX !== undefined && currentY !== undefined && 
        renderer.dragStartPosition.x !== undefined && renderer.dragStartPosition.y !== undefined) {
      const deltaX = Math.abs(currentX - renderer.dragStartPosition.x)
      const deltaY = Math.abs(currentY - renderer.dragStartPosition.y)
      actuallyMoved = deltaX > 10 || deltaY > 10
      if (actuallyMoved) {
        renderer.hasMovedEnough = true
      }
    }
  }
  
  // Nếu chưa di chuyển đủ, coi như click -> cleanup và return, không thực hiện drop
  if (!actuallyMoved) {
  }
  
  // Xóa ghost
  if (renderer.dragGhost) {
    renderer.dragGhost.remove()
    renderer.dragGhost = null
  }
  
  // Xóa ghost edges group
  if (renderer.dragGhostEdgesGroup) {
    renderer.dragGhostEdgesGroup.remove()
    renderer.dragGhostEdgesGroup = null
  }
  
  // Xóa thông tin ghost edges
  renderer.dragGhostEdges = null
  
  // Cleanup drag branch effects (restore opacity, remove border, etc.)
  cleanupDragBranchEffects(renderer)
  
  // Restore node gốc
  const nodeGroup = d3.select(nodeElement)
  nodeGroup.style('opacity', 1)
  nodeGroup.style('pointer-events', 'auto')
  
  // Restore border của node gốc về trạng thái ban đầu
  const isSelected = renderer.selectedNode === d.id
  nodeGroup.select('.node-rect')
    .attr('stroke', d => {
      if (d.data?.isRoot) return 'none'
      if (isSelected) return '#3b82f6'
      return '#cbd5e1'
    })
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', null)
  
  // Reset danh sách node trong nhánh
  renderer.dragBranchNodeIds = []
  
  // Remove highlight từ node đích
  if (renderer.dragTargetNode) {
    const targetNode = renderer.g.select(`[data-node-id="${renderer.dragTargetNode}"]`)
    const targetDatum = targetNode.datum()
    targetNode.select('.node-rect')
      .attr('stroke', d => {
        if (d.data?.isRoot) return 'none'
        if (renderer.selectedNode === d.id) return '#3b82f6'
        return '#cbd5e1'
      })
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', null)
  }
  
  // Reset drag offset
  renderer.dragOffset = { x: 0, y: 0 }
  
  // ⚠️ FIX: Xử lý drop dựa trên drop zone (Child, Sibling Above, Sibling Below)
  const draggedNodeParentId = getParentNodeId(d.id, renderer.edges)
  const dropZone = renderer.dragDropZone // 'child' | 'sibling-above' | 'sibling-below' | null
  const targetSiblingId = renderer.dragDropTargetSiblingId // ID của node con đầu tiên/cuối cùng (nếu sibling zone)
  const shouldDropToTarget = actuallyMoved && targetNodeId && targetNodeId !== d.id && targetNodeId !== draggedNodeParentId
  
  // Xử lý drop vào target node với drop zone
  if (shouldDropToTarget && dropZone) {
    const targetNode = renderer.nodes.find(n => n.id === targetNodeId)
    const isDescendantNode = isDescendant(d.id, targetNodeId, renderer.edges)
    
    // Cho phép drop vào bất kỳ node nào (bao gồm root) trừ khi là descendant
    if (targetNode && !isDescendantNode) {
      const nodeCreationOrder = renderer.options?.nodeCreationOrder || new Map()
      
      if (dropZone === 'child') {
        // ⚠️ FIX: Child Zone - Node A trở thành con của Node B
        const oldEdge = renderer.edges.find(e => e.target === d.id)
        const newSource = targetNodeId
        
        if (oldEdge) {
          oldEdge.source = newSource
          oldEdge.id = `edge-${newSource}-${d.id}`
        } else {
          renderer.edges.push({
            id: `edge-${newSource}-${d.id}`,
            source: newSource,
            target: d.id
          })
        }
        
        // Tính toán drop position trong danh sách children của parent mới
        const newSiblings = getSiblingNodes(d.id, renderer.edges)
        
        if (newSiblings.length > 0 && renderer.dragFinalY !== undefined) {
          renderer.render()
          
          const sortedSiblings = newSiblings.map(siblingId => ({
            id: siblingId,
            order: nodeCreationOrder.get(siblingId) ?? Infinity
          })).sort((a, b) => a.order - b.order)
          
          let dropPosition = null
          for (let i = 0; i < sortedSiblings.length; i++) {
            const siblingId = sortedSiblings[i].id
            const siblingPos = renderer.positions.get(siblingId)
            if (siblingPos) {
              const siblingSize = renderer.nodeSizeCache.get(siblingId) || estimateNodeSize(renderer, renderer.nodes.find(n => n.id === siblingId))
              const siblingCenterY = siblingPos.y + siblingSize.height / 2
              
              if (renderer.dragFinalY < siblingCenterY) {
                dropPosition = i
                break
              }
            }
          }
          
          if (dropPosition === null) {
            dropPosition = sortedSiblings.length
          }
          
          let newOrder
          if (dropPosition === 0) {
            newOrder = sortedSiblings[0]?.order - 1 ?? 0
          } else if (dropPosition >= sortedSiblings.length) {
            newOrder = (sortedSiblings[sortedSiblings.length - 1]?.order ?? 0) + 1
          } else {
            const prevOrder = sortedSiblings[dropPosition - 1]?.order ?? 0
            const nextOrder = sortedSiblings[dropPosition]?.order ?? Infinity
            newOrder = prevOrder + (nextOrder - prevOrder) / 2
          }
          
          nodeCreationOrder.set(d.id, newOrder)
          
          if (renderer.callbacks.onNodeReorder) {
            renderer.callbacks.onNodeReorder(d.id, newOrder)
          }
          
          renderer.render()
        } else {
          renderer.render()
        }
        
        // Gọi callback để cập nhật parent
        if (renderer.callbacks.onNodeUpdate) {
          renderer.callbacks.onNodeUpdate(d.id, { parentId: newSource })
        }
        
        return
      } else if (dropZone === 'sibling-above' || dropZone === 'sibling-below') {
        // ⚠️ FIX: Sibling Zone - Node A trở thành anh em của target sibling (cùng parent với target sibling)
        // targetSiblingId là node con đầu tiên (sibling-above) hoặc cuối cùng (sibling-below) của target node
        if (targetSiblingId) {
          const targetSiblingParentId = getParentNodeId(targetSiblingId, renderer.edges)
          
          if (targetSiblingParentId) {
            // Cập nhật parent của node A thành parent của target sibling
            const oldEdge = renderer.edges.find(e => e.target === d.id)
            const newSource = targetSiblingParentId
            
            if (oldEdge) {
              oldEdge.source = newSource
              oldEdge.id = `edge-${newSource}-${d.id}`
            } else {
              renderer.edges.push({
                id: `edge-${newSource}-${d.id}`,
                source: newSource,
                target: d.id
              })
            }
            
            // Tính toán drop position trong danh sách siblings của target sibling
            const targetSiblingSiblings = getSiblingNodes(targetSiblingId, renderer.edges)
            const allSiblings = [...targetSiblingSiblings, targetSiblingId].filter(id => id !== d.id)
            
            if (allSiblings.length > 0) {
              renderer.render()
              
              const sortedSiblings = allSiblings.map(siblingId => ({
                id: siblingId,
                order: nodeCreationOrder.get(siblingId) ?? Infinity
              })).sort((a, b) => a.order - b.order)
              
              // Tìm vị trí của target sibling trong danh sách siblings
              const targetIndex = sortedSiblings.findIndex(s => s.id === targetSiblingId)
              
              let dropPosition
              if (dropZone === 'sibling-above') {
                // Drop trước target sibling (node con đầu tiên)
                dropPosition = targetIndex
              } else {
                // Drop sau target sibling (node con cuối cùng)
                dropPosition = targetIndex + 1
              }
              
              // Tính order mới
              let newOrder
              if (dropPosition === 0) {
                newOrder = sortedSiblings[0]?.order - 1 ?? 0
              } else if (dropPosition >= sortedSiblings.length) {
                newOrder = (sortedSiblings[sortedSiblings.length - 1]?.order ?? 0) + 1
              } else {
                const prevOrder = sortedSiblings[dropPosition - 1]?.order ?? 0
                const nextOrder = sortedSiblings[dropPosition]?.order ?? Infinity
                newOrder = prevOrder + (nextOrder - prevOrder) / 2
              }
              
              nodeCreationOrder.set(d.id, newOrder)
              
              if (renderer.callbacks.onNodeReorder) {
                renderer.callbacks.onNodeReorder(d.id, newOrder)
              }
              
              renderer.render()
            } else {
              renderer.render()
            }
            
            // Gọi callback để cập nhật parent
            if (renderer.callbacks.onNodeUpdate) {
              renderer.callbacks.onNodeUpdate(d.id, { parentId: newSource })
            }
            
            return
          }
        }
      }
    }
  }
  // ⚠️ CRITICAL: Xử lý sắp xếp lại thứ tự sibling nodes
  // Sử dụng dragSortedSiblingIds để đảm bảo thứ tự được tính toán dựa trên vị trí Y thực tế
  else if (actuallyMoved && renderer.dragSiblingDropPosition !== null && renderer.dragSiblingParentId) {
    // ⚠️ CRITICAL: Sử dụng dragSortedSiblingIds nếu có (đã được sắp xếp theo Y trong handleDrag)
    // Nếu không có, fallback về siblings từ edges
    const sortedSiblingIds = renderer.dragSortedSiblingIds || getSiblingNodes(d.id, renderer.edges)
    const dropPosition = renderer.dragSiblingDropPosition
    
    // Lấy nodeCreationOrder từ renderer options
    const nodeCreationOrder = renderer.options?.nodeCreationOrder || new Map()
    
    // ⚠️ CRITICAL: Tính toán lại thứ tự dựa trên sortedSiblingIds (đã được sắp xếp theo Y)
    const currentOrder = nodeCreationOrder.get(d.id) ?? Infinity
    const siblingOrders = sortedSiblingIds.map(siblingId => ({
      id: siblingId,
      order: nodeCreationOrder.get(siblingId) ?? Infinity
    })).sort((a, b) => a.order - b.order)
    
    // ⚠️ CRITICAL: Tính order mới cho node được drag
    // Đảm bảo order được tính toán chính xác dựa trên dropPosition
    let newOrder
    if (dropPosition === 0) {
      // Drop ở đầu: order nhỏ hơn sibling đầu tiên
      const firstOrder = siblingOrders[0]?.order ?? 0
      newOrder = firstOrder - 1
      // Đảm bảo order không quá nhỏ (tránh số âm quá lớn)
      if (newOrder < firstOrder - 1000) {
        newOrder = firstOrder - 1
      }
    } else if (dropPosition >= siblingOrders.length) {
      // Drop ở cuối: order lớn hơn sibling cuối cùng
      const lastOrder = siblingOrders[siblingOrders.length - 1]?.order ?? 0
      newOrder = lastOrder + 1
    } else {
      // Drop giữa: order giữa 2 siblings
      const prevOrder = siblingOrders[dropPosition - 1]?.order ?? 0
      const nextOrder = siblingOrders[dropPosition]?.order ?? Infinity
      
      // ⚠️ CRITICAL: Nếu khoảng cách giữa 2 orders quá nhỏ, cần normalize lại
      if (nextOrder === Infinity) {
        newOrder = prevOrder + 1
      } else if (nextOrder - prevOrder < 1) {
        // Nếu khoảng cách quá nhỏ, đặt order ở giữa và normalize sau
        newOrder = prevOrder + (nextOrder - prevOrder) / 2
      } else {
        newOrder = prevOrder + (nextOrder - prevOrder) / 2
      }
    }
    
    // Cập nhật nodeCreationOrder
    nodeCreationOrder.set(d.id, newOrder)
    
    // Gọi callback để cập nhật nodeCreationOrder
    if (renderer.callbacks.onNodeReorder) {
      renderer.callbacks.onNodeReorder(d.id, newOrder)
    }
    
    // Re-render mindmap với layout mới
    renderer.render()
    
  }
  
  // ⚠️ CRITICAL: Nếu đã drag với right button và đã di chuyển đủ, set flag để ngăn context menu
  // Flag này sẽ được reset sau một khoảng thời gian ngắn để đảm bảo contextmenu event đã được xử lý
  if (renderer.isRightButtonDrag && actuallyMoved) {
    renderer.shouldPreventContextMenu = true
    // Reset flag sau 200ms để đảm bảo contextmenu event đã được xử lý
    setTimeout(() => {
      renderer.shouldPreventContextMenu = false
    }, 200)
  }
  
  // Reset drag state
  renderer.draggedNode = null
  renderer.taskLinkDragChecked = false // Reset flag để có thể kiểm tra lại lần sau
  renderer.dragTargetNode = null
  renderer.dragDropZone = null // Reset drop zone
  renderer.dragDropTargetSiblingId = null // Reset target sibling ID
  renderer.isDragStarting = false
  renderer.mouseUpOccurred = false
  renderer.hasMovedEnough = false
  renderer.dragStartPosition = null
  renderer.dragStartTime = null
  renderer.dragStartNodeInfo = null
  renderer.dragSiblingDropPosition = null
  renderer.dragSiblingParentId = null
  renderer.dragSortedSiblingIds = null // ⚠️ CRITICAL: Reset danh sách siblings đã sắp xếp
  renderer.dragFinalY = undefined // ⚠️ CRITICAL: Reset vị trí Y cuối cùng
  // KHÔNG reset isRightButtonDrag ngay lập tức - sẽ được reset sau khi contextmenu được xử lý
}

/**
 * Setup drag handlers for a node group
 */
export function setupDragHandlers(renderer, nodeGroup) {
  return nodeGroup
    .on('mousedown', function(event, d) {
      handleMouseDown(renderer, event, d)
    })
    .call(d3.drag()
      .filter(createDragFilter(renderer))
      .on('start', function(event, d) {
        handleDragStart.call(this, renderer, event, d)
      })
      .on('drag', function(event, d) {
        handleDrag.call(this, renderer, event, d)
      })
      .on('end', function(event, d) {
        handleDragEnd.call(this, renderer, event, d)
      })
    )
}

