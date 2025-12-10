/**
 * Node Rendering Module
 * Handles all logic for rendering nodes in the mindmap
 */

import * as d3 from 'd3'
import { calculateD3MindmapLayout } from '../d3MindmapLayout'
import { createDragFilter, handleDrag, handleDragEnd, handleDragStart, handleMouseDown } from './dragHandler.js'
import { getEditorInstance, handleEditorBlur, handleEditorFocus, handleEditorInput, mountNodeEditor } from './nodeEditor.js'
import { countChildren } from './utils.js'

export function renderNodes(renderer, positions) {
  // Render all nodes, but hide collapsed ones (don't filter to preserve Vue components)
  // Pre-calculate node sizes to avoid repeated calculations
  // Sử dụng instance variable nodeSizeCache thay vì local variable
  // Ưu tiên sử dụng fixedWidth/fixedHeight nếu có (được set khi blur)
  renderer.nodes.forEach(node => {
    const isRootNode = node.data?.isRoot || node.id === 'root'
    
    // Nếu node có fixedWidth/fixedHeight, dùng trực tiếp và cập nhật cache
    if (node.data && node.data.fixedWidth && node.data.fixedHeight && !isRootNode) {
      renderer.nodeSizeCache.set(node.id, {
        width: node.data.fixedWidth,
        height: node.data.fixedHeight,
      })
    } else if (!renderer.nodeSizeCache.has(node.id) || renderer.editingNode !== node.id) {
      // Chỉ tính toán lại nếu chưa có trong cache hoặc node đang không được edit
      // Luôn tính toán lại khi render lần đầu để đảm bảo có buffer đủ
      const size = renderer.estimateNodeSize(node)
      renderer.nodeSizeCache.set(node.id, size)
    }
    // ⚠️ FIX: Bỏ logic force width >= 130px để cho phép node có width nhỏ hơn minWidth
    // Node paste sẽ có kích thước chính xác như node gốc
  })
  
  const getNodeSize = (node) => {
    // Ưu tiên dùng fixedWidth/fixedHeight nếu có
    const isRootNode = node.data?.isRoot || node.id === 'root'
    if (node.data && node.data.fixedWidth && node.data.fixedHeight && !isRootNode) {
      return {
        width: node.data.fixedWidth,
        height: node.data.fixedHeight,
      }
    }
    // ⚠️ FIX: Nếu không có cache, tính toán lại thay vì dùng mặc định 130px
    // Điều này đảm bảo node mới paste có kích thước chính xác
    const cached = renderer.nodeSizeCache.get(node.id)
    if (cached) {
      return cached
    }
    // Tính toán lại nếu chưa có cache
    const size = renderer.estimateNodeSize(node)
    renderer.nodeSizeCache.set(node.id, size)
    return size
  }
  
  const that = renderer // Store reference for use in callbacks
  
  const nodes = renderer.g.selectAll('.node-group')
    .data(renderer.nodes, d => d.id)
  
  // Remove old nodes (only if they're not in renderer.nodes anymore)
  nodes.exit().remove()
  
  // Đưa node đang edit lên cuối cùng để hiển thị trên các node khác
  if (renderer.editingNode) {
    nodes.filter(d => d.id === renderer.editingNode).raise()
  }
  
  // Add new nodes
  const nodesEnter = nodes.enter()
    .append('g')
    .attr('class', 'node-group')
    .attr('data-node-id', d => d.id)
    .style('cursor', 'pointer')
    .style('pointer-events', 'auto') // Cho phép click vào node
  
  // Add node rectangle
  nodesEnter.append('rect')
    .attr('class', 'node-rect')
    .attr('rx', 8)
    .attr('ry', 8)
    .attr('width', d => getNodeSize(d).width) // Set width ngay khi tạo để đảm bảo kích thước đúng
    .attr('height', d => getNodeSize(d).height) // Set height ngay khi tạo để đảm bảo kích thước đúng
    .attr('stroke', d => d.data?.isRoot ? 'none' : '#cbd5e1')
    .attr('stroke-width', 2)
    .attr('fill', d => d.data?.isRoot ? '#3b82f6' : '#ffffff')
    .attr('filter', 'url(#shadow)')
    .attr('opacity', d => d.data?.completed ? 0.5 : 1) // Làm mờ node khi completed
  
  // Add node text container with textarea for inline editing
  // Thêm offset để không đè lên border 2px của node-rect
  const borderOffset = 4 // 2px border mỗi bên
  const nodeTextEnter = nodesEnter.append('foreignObject')
    .attr('class', 'node-text')
    .attr('x', 2) // Offset để không đè lên border 2px
    .attr('y', 2) // Offset để không đè lên border 2px
    .attr('width', d => Math.max(0, getNodeSize(d).width - borderOffset))
    .attr('height', d => Math.max(0, getNodeSize(d).height - borderOffset))
  
  nodeTextEnter.append('xhtml:div')
    .attr('class', 'node-content-wrapper flex')
    .append('xhtml:div')
    .attr('class', 'node-editor-container')
    .attr('data-node-id', d => d.id)
  
  // Add hover layer mở rộng sang bên phải để giữ hover khi di chuột tới nút
  // Layer này không hiển thị, chỉ dùng để bắt hover cho node (bao gồm phần thò sang bên phải)
  nodesEnter.append('rect')
    .attr('class', 'node-hover-layer')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', d => getNodeSize(d).width + 40) // node + khoảng ra nút
    .attr('height', d => getNodeSize(d).height)
    .attr('fill', 'transparent')
    .style('pointer-events', 'none') // pointer-events sẽ được bật ở phần update
  
  // Add "Add Child" button (appears on hover) - đặt ra ngoài bên phải (cách 20px như ban đầu)
  nodesEnter.append('circle')
    .attr('class', 'add-child-btn')
    .attr('r', 12)
    .attr('cx', d => getNodeSize(d).width + 20) // Ra ngoài bên phải, cách 20px
    .attr('cy', d => getNodeSize(d).height / 2)
    .attr('fill', '#3b82f6')
    .attr('stroke', 'white')
    .attr('stroke-width', 2)
    .attr('opacity', 0)
    .style('cursor', 'pointer')
    .style('pointer-events', 'auto') // Cho phép click
    .append('title')
    .text('Add Child (Tab)')
  
  // Add "+" text to button - đặt ra ngoài bên phải
  nodesEnter.append('text')
    .attr('class', 'add-child-text')
    .attr('x', d => getNodeSize(d).width + 20) // Ra ngoài bên phải, cách 20px
    .attr('y', d => getNodeSize(d).height / 2)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('fill', 'white')
    .attr('font-size', '14px')
    .attr('font-weight', 'bold')
    .attr('opacity', 0)
    .style('pointer-events', 'none') // Text không cần pointer events
    .text('+')
  
  // Add collapse button for collapsed state (shows number) - đặt bên phải
  nodesEnter.append('circle')
    .attr('class', 'collapse-btn-number')
    .attr('r', 12)
    .attr('cx', d => getNodeSize(d).width + 20) // Ra ngoài bên phải, cách 20px
    .attr('cy', d => getNodeSize(d).height / 2)
    .attr('fill', '#ffffff') // Nền trắng
    .attr('stroke', '#3b82f6') // Border xanh dương
    .attr('stroke-width', 2)
    .attr('opacity', 0) // Sẽ được update trong nodesUpdate
    .style('cursor', 'pointer')
    .style('pointer-events', 'auto')
    .style('z-index', '1000') // Đảm bảo nút ở trên cùng
    .append('title')
    .text('Expand')
  
  // Add number text for collapsed state - bên phải
  // Text phải được append SAU circle để hiển thị trên circle
  // Nhưng pointer-events: none để click vào text cũng trigger click của circle
  nodesEnter.append('text')
    .attr('class', 'collapse-text-number')
    .attr('x', d => getNodeSize(d).width + 20)
    .attr('y', d => getNodeSize(d).height / 2)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('fill', '#3b82f6') // Text xanh dương
    .attr('font-size', '11px')
    .attr('font-weight', 'bold')
    .attr('opacity', 0) // Sẽ được update trong nodesUpdate
    .style('pointer-events', 'none') // Text không nhận click, click sẽ pass through đến circle
    .style('user-select', 'none') // Không cho select text
    .text(d => {
      const count = countChildren(d.id, renderer.edges)
      return count > 0 ? count.toString() : ''
    })
  
  // ⚠️ CRITICAL: Tạo cầu nối vô hình giữa node và button để tránh mouseleave khi di chuyển từ node sang button
  nodesEnter.append('rect')
    .attr('class', 'collapse-button-bridge')
    .attr('x', d => getNodeSize(d).width) // Bắt đầu từ right edge của node
    .attr('y', d => 0) // Từ top của node
    .attr('width', 20) // Width = khoảng cách giữa node và button (20px)
    .attr('height', d => getNodeSize(d).height) // Height = height của node
    .attr('fill', 'transparent')
    .attr('opacity', 0)
    .style('pointer-events', 'auto')
    .style('cursor', 'pointer')
    .on('mouseenter', function(event, d) {
      // Khi hover vào cầu nối, giữ nút collapse arrow hiển thị
      event.stopPropagation()
      const nodeGroup = d3.select(this.parentNode)
      const hasChildren = renderer.edges.some(e => e.source === d.id)
      const isCollapsed = renderer.collapsedNodes.has(d.id)
      const isSelected = renderer.selectedNode === d.id
      
      if (hasChildren && !isCollapsed && !isSelected) {
        const nodeSize = getNodeSize(d)
        nodeGroup.select('.collapse-btn-arrow')
          .attr('cx', nodeSize.width + 20)
          .attr('cy', nodeSize.height / 2)
          .attr('fill', 'white')
          .attr('stroke', '#3b82f6')
          .attr('stroke-width', 2)
          .attr('opacity', 1)
          .style('pointer-events', 'auto')
        nodeGroup.select('.collapse-arrow')
          .attr('transform', `translate(${nodeSize.width + 20}, ${nodeSize.height / 2}) scale(0.7) translate(-12, -12)`)
          .attr('opacity', 1)
      }
    })
    .on('mouseleave', function(event, d) {
      // Chỉ ẩn nếu chuột không di chuyển sang button
      const related = event.relatedTarget
      if (related) {
        try {
          const isButton = 
            (related.classList && related.classList.contains('collapse-btn-arrow')) ||
            (related.classList && related.classList.contains('collapse-arrow')) ||
            (related.parentNode && related.parentNode.classList && related.parentNode.classList.contains('collapse-btn-arrow'))
          if (isButton) {
            return // Không ẩn nếu di chuyển sang button
          }
        } catch (e) {
          // Bỏ qua lỗi
        }
      }
      // Ẩn nút collapse arrow
      const nodeGroup = d3.select(this.parentNode)
      nodeGroup.select('.collapse-btn-arrow')
        .transition()
        .duration(100)
        .attr('opacity', 0)
        .style('pointer-events', 'none')
      nodeGroup.select('.collapse-arrow')
        .transition()
        .duration(100)
        .attr('opacity', 0)
    })
  
  // Add collapse button for expanded state (shows arrow) - đặt bên phải, chỉ khi hover
  nodesEnter.append('circle')
    .attr('class', 'collapse-btn-arrow')
    .attr('r', 12)
    .attr('cx', d => getNodeSize(d).width + 20) // Ra ngoài bên phải, cách 20px
    .attr('cy', d => getNodeSize(d).height / 2)
    .attr('fill', 'white') // Nền trắng
    .attr('stroke', '#3b82f6') // Border xanh dương
    .attr('stroke-width', 2)
    .attr('opacity', 0) // Chỉ hiển thị khi hover
    .style('cursor', 'pointer')
    .style('pointer-events', 'auto')
    .each(function() {
      // ⚠️ CRITICAL: Raise nút collapse button lên trên edge ngay sau khi append
      d3.select(this).raise()
    })
    .append('title')
    .text('Collapse')
  
  // Add SVG chevron arrow for expanded state - bên phải, chỉ khi hover
  // Chevron trái xanh dương giống icon lucide-chevron-left
  nodesEnter.append('path')
    .attr('class', 'collapse-arrow')
    .attr('d', 'M 15 18 L 9 12 L 15 6') // Path từ lucide-chevron-left, scale và center
    .attr('fill', 'none')
    .attr('stroke', '#3b82f6') // Mũi tên xanh dương
    .attr('stroke-width', 2.5) // Tăng stroke-width để icon to hơn
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round')
    .attr('transform', d => `translate(${getNodeSize(d).width + 20}, ${getNodeSize(d).height / 2}) scale(0.7) translate(-12, -12)`) // Scale 0.7 để icon to hơn
    .attr('opacity', 0) // Chỉ hiển thị khi hover
    .style('pointer-events', 'none')
    .each(function() {
      // ⚠️ CRITICAL: Raise nút collapse arrow lên trên edge ngay sau khi append
      d3.select(this).raise()
    })
  
  // Update all nodes
  const nodesUpdate = nodesEnter.merge(nodes)

  const wrapper = nodesUpdate
  .select('.node-text')
  .select('.node-content-wrapper')

  const badge = wrapper
    .selectAll('.comment-count-badge')
    .data(d => {
      const c = Number(d?.count || 0)
      return c > 0 ? [c] : []
    })

  badge.enter()
    .append('div')
    .attr('class', 'comment-count-badge')
    .merge(badge)
    .on('click', function (event, count) {
      
      event.stopPropagation()
      event.stopImmediatePropagation()
      event.preventDefault()
      
    const nodeData = d3.select(this.closest('.node-group')).datum()
      
    renderer.callbacks?.onOpenCommentList?.({
      type: 'add-comment',
      node: nodeData
    })
  })
    .text(d => d)

  // nếu count = 0 thì tự remove
  badge.exit().remove()

  
  // Update node rect style dựa trên selectedNode
  nodesUpdate.select('.node-rect')
    .attr('fill', d => {
      if (renderer.selectedNode === d.id) return '#ffffff' // Selected: màu trắng
      return d.data?.isRoot ? '#3b82f6' : '#ffffff' // Default
    })
    .attr('stroke', d => {
      if (renderer.selectedNode === d.id) return '#3b82f6' // Blue border for selected
      return d.data?.isRoot ? 'none' : '#cbd5e1' // Default
    })
    .attr('stroke-width', 2)
    .attr('opacity', d => d.data?.completed ? 0.5 : 1) // Làm mờ rect khi completed
  
  nodesUpdate
    .attr('transform', d => {
      const pos = positions.get(d.id)
      if (!pos) return 'translate(0, 0)'
      return `translate(${pos.x}, ${pos.y})`
    })
    // Hide collapsed nodes instead of removing them
    // Also apply opacity for completed nodes
    .style('opacity', d => {
      if (renderer.isNodeHidden(d.id)) return 0
      // Làm mờ node và tất cả node con khi completed
      return d.data?.completed ? 0.5 : 1
    })
    .style('pointer-events', d => {
      return renderer.isNodeHidden(d.id) ? 'none' : 'auto'
    })
  
  // Đảm bảo toàn bộ node-group (bao gồm nút thu gọn) luôn nằm trên edge
  const nodesWithHandlers = nodesUpdate.raise()
    .on('mousedown', function(event, d) {
      handleMouseDown(that, event, d)
    })
    .on('click', function(event, d) {
      // Kiểm tra xem click có phải từ editor hoặc các nút không
      const target = event.target
      const isEditorClick = target && (
        target.closest('.mindmap-node-editor') || 
        target.closest('.mindmap-editor-content') ||
        target.closest('.mindmap-editor-prose')
      )
      const isAddChildClick = target && (
        target.classList?.contains('add-child-btn') || 
        target.classList?.contains('add-child-text') ||
        target.closest('.add-child-btn') ||
        target.closest('.add-child-text')
      )
      const isCollapseClick = target && (
        target.classList?.contains('collapse-btn-number') ||
        target.classList?.contains('collapse-text-number') ||
        target.classList?.contains('collapse-btn-arrow') ||
        target.classList?.contains('collapse-arrow') ||
        target.closest('.collapse-btn-number') ||
        target.closest('.collapse-text-number') ||
        target.closest('.collapse-btn-arrow') ||
        target.closest('.collapse-arrow')
      )
      // ⚠️ NEW: Kiểm tra xem click có phải từ toolbar không
      const isToolbarClick = target && (
        target.closest('.mindmap-toolbar') ||
        target.closest('.toolbar-btn') ||
        target.closest('.toolbar-top-popup') ||
        target.closest('.toolbar-bottom')
      )
      
      // QUAN TRỌNG: Nếu click vào collapse button hoặc toolbar, KHÔNG BAO GIỜ xử lý ở đây
      // Collapse button và toolbar sẽ tự xử lý và stop propagation
      if (isEditorClick || isAddChildClick || isCollapseClick || isToolbarClick) {
        // Click vào editor, toolbar hoặc các nút -> không xử lý ở đây (để các nút tự xử lý)
        console.log('🚫 Node group click ignored - clicked on button/editor/toolbar')
        return
      }

      event.stopPropagation()
      
      // Cleanup drag branch ghost nếu có (trường hợp click mà không drag)
      renderer.cleanupDragBranchEffects()
      
      // Đưa node lên trên ngay lập tức để nút không bị che bởi edge
      const nodeGroup = d3.select(this)
      nodeGroup.raise()
      
      // Click đơn giản để select node
      // Blur editor nếu đang focus (CHỈ khi không click vào toolbar)
      const editorInstance = renderer.getEditorInstance(d.id)
      if (editorInstance && editorInstance.isFocused) {
        editorInstance.commands.blur()
      }
      
      // Disable pointer events cho editor container khi không edit
      const editorContainer = nodeGroup.select('.node-editor-container')
      if (editorContainer.node()) {
        editorContainer.style('pointer-events', 'none')
      }
      
      // CHỈ select node, KHÔNG BAO GIỜ gọi onNodeAdd ở đây
      renderer.selectNode(d.id)
      if (renderer.callbacks.onNodeClick) {
        // thêm event để chặn sự kiện onNodeClick khi click vào count badge
        renderer.callbacks.onNodeClick(d, event)
      }
    })
    .on('dblclick', function(event, d) {
      // Double click để edit - focus vào TipTap editor
      const target = event.target
      // Kiểm tra xem click có phải từ editor content không
      const isEditorClick = target && (
        target.closest('.mindmap-node-editor') || 
        target.closest('.mindmap-editor-content') ||
        target.closest('.mindmap-editor-prose')
      )
      
      if (isEditorClick) {
        // Double click vào editor -> không xử lý ở đây (editor tự xử lý)
        return
      }
      
      event.stopPropagation()
      
      // Lưu reference đến nodeGroup để dùng trong setTimeout
      const nodeGroup = d3.select(this)
      const nodeGroupEl = this
      
      // Đưa node đang edit lên cuối cùng trong DOM ngay lập tức
      // Sử dụng raise() của D3 để giữ nguyên transform
      if (nodeGroupEl && nodeGroupEl.parentNode) {
        nodeGroup.raise()
      }
      
      // Enable pointer events cho editor container
      const fo = nodeGroup.select('.node-text')
      const editorContainer = nodeGroup.select('.node-editor-container')
      if (editorContainer.node()) {
        editorContainer.style('pointer-events', 'auto')
      }
      
      // Lấy editor instance và focus vào nó
      // Delay để đảm bảo DOM đã được cập nhật
      setTimeout(() => {
        const editorInstance = renderer.getEditorInstance(d.id)
        if (editorInstance) {
          // Focus vào editor và đặt cursor ở cuối title (không phải blockquote)
          const { state } = editorInstance.view
          const { doc } = state
          
          // Tìm paragraph cuối cùng của title (không trong blockquote)
          let lastTitleEndPos = null
          
          // Duyệt qua tất cả nodes để tìm paragraph cuối cùng không trong blockquote
          doc.forEach((node, offset) => {
            if (node.type.name === 'paragraph') {
              // Kiểm tra xem paragraph có trong blockquote không
              const resolvedPos = state.doc.resolve(offset + 1)
              let inBlockquote = false
              
              for (let i = resolvedPos.depth; i > 0; i--) {
                const nodeAtDepth = resolvedPos.node(i)
                if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                  inBlockquote = true
                  break
                }
              }
              
              if (!inBlockquote) {
                // Đây là title paragraph, lưu vị trí cuối của nó
                // offset + 1 là vị trí bắt đầu của node, offset + node.nodeSize là vị trí cuối
                lastTitleEndPos = offset + node.nodeSize - 1
              }
            }
          })
          
          if (lastTitleEndPos !== null && lastTitleEndPos > 0) {
            // Set selection ở cuối title paragraph
            editorInstance.chain().setTextSelection(lastTitleEndPos).focus().run()
          } else {
            // Fallback: focus vào đầu nếu không tìm thấy title paragraph
            editorInstance.commands.focus('start')
          }
          
          // Gọi handleEditorFocus để setup đúng cách
          renderer.handleEditorFocus(d.id, fo.node(), d)
        } else {
          // Nếu editor chưa sẵn sàng, thử lại sau
          setTimeout(() => {
            const editorInstance2 = renderer.getEditorInstance(d.id)
            if (editorInstance2) {
              const { state } = editorInstance2.view
              const { doc } = state
              
              // Tìm paragraph cuối cùng của title (không trong blockquote)
              let lastTitleEndPos = null
              
              doc.forEach((node, offset) => {
                if (node.type.name === 'paragraph') {
                  const resolvedPos = state.doc.resolve(offset + 1)
                  let inBlockquote = false
                  
                  for (let i = resolvedPos.depth; i > 0; i--) {
                    const nodeAtDepth = resolvedPos.node(i)
                    if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                      inBlockquote = true
                      break
                    }
                  }
                  
                  if (!inBlockquote) {
                    lastTitleEndPos = offset + node.nodeSize - 1
                  }
                }
              })
              
              if (lastTitleEndPos !== null && lastTitleEndPos > 0) {
                editorInstance2.chain().setTextSelection(lastTitleEndPos).focus().run()
              } else {
                editorInstance2.commands.focus('start')
              }
              
              renderer.handleEditorFocus(d.id, fo.node(), d)
            }
          }, 50)
        }
      }, 10)
    })
    .call(d3.drag()
      .filter(createDragFilter(that))
      .on('start', function(event, d) {
        handleDragStart(this, that, event, d)
      })
      .on('drag', function(event, d) {
        handleDrag(this, that, event, d)
      })
      .on('end', function(event, d) {
        handleDragEnd(this, that, event, d)
      })
    )
    .on('mouseenter', function(event, d) {
      // Highlight node khi hover - NHẠT HƠN khi active
      renderer.hoveredNode = d.id
      const nodeGroup = d3.select(this)
      
      // Highlight node rect - nhạt hơn so với khi selected
      // QUAN TRỌNG: Kiểm tra selectedNode TRƯỚC KHI sử dụng
      const isSelected = renderer.selectedNode === d.id
      nodeGroup.select('.node-rect')
        .attr('fill', d => {
          if (isSelected) {
            // Selected: màu trắng
            return '#ffffff'
          } else if (d.data?.isRoot) {
            return '#2563eb' // Darker blue for root
          } else {
            return '#f9fafb' // Very light gray for hover (nhạt hơn #f3f4f6)
          }
        })
        .attr('stroke', d => {
          if (isSelected) {
            return '#3b82f6' // Blue border for selected
          } else if (d.data?.isRoot) {
            return 'none'
          } else {
            return '#93c5fd' // Border xanh nhạt khi hover
          }
        })
        .attr('stroke-width', 2)
        .attr('opacity', d => d.data?.completed ? 0.5 : 1) // Giữ opacity dựa trên completed status
      
      // Check if node has children
      const hasChildren = renderer.edges.some(e => e.source === d.id)
      const isCollapsed = renderer.collapsedNodes.has(d.id)
      
      // ✅ LOGIC HIỂN THỊ NÚT KHI HOVER - 3 NÚT TÁCH BIỆT:
      // 1. Nút số: chỉ khi collapsed (ưu tiên cao nhất)
      // 2. Nút thu gọn: chỉ khi hover, có children, chưa collapse VÀ KHÔNG selected
      // 3. Nút thêm mới: chỉ khi selected và chưa collapse
      
      // 1. Nút số (collapse-btn-number) - ưu tiên cao nhất
      if (hasChildren && isCollapsed) {
        // Trường hợp 1: Collapsed -> chỉ hiện nút số
        nodeGroup.select('.collapse-btn-number')
          .transition()
          .duration(150)
          .attr('opacity', 1)
          .style('pointer-events', 'auto')
        
        nodeGroup.select('.collapse-text-number')
          .transition()
          .duration(150)
          .attr('opacity', 1)
        
        // Ẩn tất cả nút khác và tắt pointer-events để title không hiển thị
        nodeGroup.select('.add-child-btn')
          .attr('opacity', 0)
          .style('pointer-events', 'none')
        nodeGroup.select('.add-child-text')
          .attr('opacity', 0)
          .style('pointer-events', 'none')
        nodeGroup.select('.collapse-btn-arrow')
          .attr('opacity', 0)
          .style('pointer-events', 'none')
        nodeGroup.select('.collapse-arrow')
          .attr('opacity', 0)
          .style('pointer-events', 'none')
      } else {
        // Không collapsed
        nodeGroup.select('.collapse-btn-number').attr('opacity', 0)
        nodeGroup.select('.collapse-text-number').attr('opacity', 0)
        
        if (isSelected && !isCollapsed) {
          // Trường hợp 3: Selected -> chỉ hiện nút thêm mới
          nodeGroup.select('.add-child-btn')
            .transition()
            .duration(150)
            .attr('opacity', 1)
            .style('pointer-events', 'auto')
          
          nodeGroup.select('.add-child-text')
            .transition()
            .duration(150)
            .attr('opacity', 1)
          
          // Ẩn nút thu gọn và tắt pointer-events để title không hiển thị
          nodeGroup.select('.collapse-btn-arrow')
            .attr('opacity', 0)
            .style('pointer-events', 'none')
          nodeGroup.select('.collapse-arrow')
            .attr('opacity', 0)
            .style('pointer-events', 'none')
        } else if (hasChildren && !isCollapsed && !isSelected) {
          // Trường hợp 2: Hover, có children, chưa collapse, KHÔNG selected -> chỉ hiện nút thu gọn
          // ⚠️ CRITICAL: Cập nhật vị trí của nút collapse arrow trước khi hiển thị
          const nodeSize = getNodeSize(d)
          const collapseBtnArrow = nodeGroup.select('.collapse-btn-arrow')
          
          // Set tất cả attributes trước khi transition
          collapseBtnArrow
            .attr('cx', nodeSize.width + 20)
            .attr('cy', nodeSize.height / 2)
            .attr('fill', 'white') // ⚠️ CRITICAL: Đảm bảo background màu trắng
            .attr('stroke', '#3b82f6') // ⚠️ CRITICAL: Đảm bảo border xanh dương
            .attr('stroke-width', 2) // ⚠️ CRITICAL: Đảm bảo stroke width
            .style('fill', 'white') // ⚠️ CRITICAL: Set fill bằng style để đảm bảo không bị override
          
          // Transition chỉ opacity, không transition fill/stroke
          collapseBtnArrow
            .transition()
            .duration(150)
            .attr('opacity', 1)
            .style('pointer-events', 'auto')
            .style('fill', 'white') // ⚠️ CRITICAL: Giữ fill trong transition
          
          nodeGroup.select('.collapse-arrow')
            .attr('transform', `translate(${nodeSize.width + 20}, ${nodeSize.height / 2}) scale(0.7) translate(-12, -12)`)
            .transition()
            .duration(150)
            .attr('opacity', 1)
          
          // Ẩn nút thêm mới và tắt pointer-events để title không hiển thị
          nodeGroup.select('.add-child-btn')
            .interrupt() // Dừng transition nếu đang chạy
            .attr('opacity', 0)
            .style('pointer-events', 'none')
          nodeGroup.select('.add-child-text')
            .interrupt() // Dừng transition nếu đang chạy
            .attr('opacity', 0)
            .style('pointer-events', 'none')
        } else {
          // Không có gì -> ẩn tất cả và tắt pointer-events
          nodeGroup.select('.add-child-btn')
            .interrupt() // Dừng transition nếu đang chạy
            .attr('opacity', 0)
            .style('pointer-events', 'none')
          nodeGroup.select('.add-child-text')
            .interrupt() // Dừng transition nếu đang chạy
            .attr('opacity', 0)
            .style('pointer-events', 'none')
          nodeGroup.select('.collapse-btn-arrow')
            .interrupt() // Dừng transition nếu đang chạy
            .attr('opacity', 0)
            .style('pointer-events', 'none')
          nodeGroup.select('.collapse-arrow')
            .interrupt() // Dừng transition nếu đang chạy
            .attr('opacity', 0)
            .style('pointer-events', 'none')
        }
      }
    })
    .on('mouseleave', function(event, d) {
      // Nếu chuột chỉ di chuyển sang phần tử con (ví dụ nút thu gọn / nút thêm con)
      // thì KHÔNG xem là rời khỏi node. Tránh trường hợp vừa hover node rồi di chuyển
      // sang nút collapse thì nút bị ẩn mất.
      const related = event.relatedTarget
      if (related) {
        try {
          const isSameGroup = related === this || (related.closest && related.closest('.node-group') === this)
          
          // Kiểm tra nhiều cách để xác định button
          let isButton = false
          
          // Cách 1: Kiểm tra classList (nếu có)
          if (related.classList) {
            isButton = 
              related.classList.contains('collapse-btn-arrow') ||
              related.classList.contains('collapse-arrow') ||
              related.classList.contains('add-child-btn') ||
              related.classList.contains('add-child-text') ||
              related.classList.contains('collapse-btn-number') ||
              related.classList.contains('collapse-text-number') ||
              related.classList.contains('node-hover-layer')
          }
          
          // Cách 2: Kiểm tra className (cho SVG elements)
          if (!isButton && related.className) {
            const className = typeof related.className === 'string' 
              ? related.className 
              : related.className.baseVal || ''
            isButton = 
              className.includes('collapse-btn-arrow') ||
              className.includes('collapse-arrow') ||
              className.includes('add-child-btn') ||
              className.includes('add-child-text') ||
              className.includes('collapse-btn-number') ||
              className.includes('collapse-text-number') ||
              className.includes('node-hover-layer')
          }
          
          // Cách 3: Kiểm tra parentNode (nếu related là child của button)
          if (!isButton && related.parentNode) {
            const parent = related.parentNode
            if (parent.classList) {
              isButton = 
                parent.classList.contains('collapse-btn-arrow') ||
                parent.classList.contains('collapse-arrow') ||
                parent.classList.contains('add-child-btn') ||
                parent.classList.contains('add-child-text') ||
                parent.classList.contains('collapse-btn-number') ||
                parent.classList.contains('collapse-text-number')
            }
            // Kiểm tra className của parent
            if (!isButton && parent.className) {
              const parentClassName = typeof parent.className === 'string' 
                ? parent.className 
                : parent.className.baseVal || ''
              isButton = 
                parentClassName.includes('collapse-btn-arrow') ||
                parentClassName.includes('collapse-arrow') ||
                parentClassName.includes('add-child-btn') ||
                parentClassName.includes('add-child-text') ||
                parentClassName.includes('collapse-btn-number') ||
                parentClassName.includes('collapse-text-number')
            }
          }
          
          if (isSameGroup || isButton) {
            return
          }
        } catch (e) {
          // Bỏ qua lỗi nếu browser không hỗ trợ
          console.warn('Error checking relatedTarget:', e)
        }
      }

      // Remove highlight khi không hover
      renderer.hoveredNode = null
      const nodeGroup = d3.select(this)
      
      // Restore node rect style
      const isSelected = renderer.selectedNode === d.id
      nodeGroup.select('.node-rect')
        .attr('fill', d => {
          if (isSelected) return '#ffffff' // Selected: màu trắng
          return d.data?.isRoot ? '#3b82f6' : '#ffffff' // Default
        })
        .attr('stroke', d => {
          if (isSelected) return '#3b82f6'
          return d.data?.isRoot ? 'none' : '#cbd5e1'
        })
        .attr('stroke-width', 2)
        .attr('opacity', d => d.data?.completed ? 0.5 : 1) // Giữ opacity dựa trên completed status
      
      // ✅ LOGIC KHI KHÔNG HOVER - 3 NÚT TÁCH BIỆT:
      // 1. Nút số: giữ nếu collapsed
      // 2. Nút thêm mới: giữ nếu selected và chưa collapse
      // 3. Nút collapse mũi tên: luôn ẩn (chỉ hiện khi hover)
      
      const hasChildren = renderer.edges.some(e => e.source === d.id)
      const isCollapsed = renderer.collapsedNodes.has(d.id)
      
      // 1. Nút số: chỉ khi collapsed
      if (hasChildren && isCollapsed) {
        nodeGroup.select('.collapse-btn-number')
          .transition()
          .duration(150)
          .attr('opacity', 1)
          .style('pointer-events', 'auto')
        
        nodeGroup.select('.collapse-text-number')
          .transition()
          .duration(150)
          .attr('opacity', 1)
        
        // Ẩn nút thêm mới khi collapsed và tắt pointer-events
        nodeGroup.select('.add-child-btn')
          .attr('opacity', 0)
          .style('pointer-events', 'none')
        nodeGroup.select('.add-child-text')
          .attr('opacity', 0)
          .style('pointer-events', 'none')
      } else {
        nodeGroup.select('.collapse-btn-number')
          .attr('opacity', 0)
          .style('pointer-events', 'none')
        nodeGroup.select('.collapse-text-number')
          .attr('opacity', 0)
          .style('pointer-events', 'none')
        
        // 2. Nút thêm mới: chỉ khi selected và chưa collapse
        if (isSelected && !isCollapsed) {
          nodeGroup.select('.add-child-btn')
            .transition()
            .duration(150)
            .attr('opacity', 1)
            .style('pointer-events', 'auto')
          
          nodeGroup.select('.add-child-text')
            .transition()
            .duration(150)
            .attr('opacity', 1)
        } else {
          nodeGroup.select('.add-child-btn')
            .attr('opacity', 0)
            .style('pointer-events', 'none')
          nodeGroup.select('.add-child-text')
            .attr('opacity', 0)
            .style('pointer-events', 'none')
        }
      }
      
      // 3. Nút collapse mũi tên: chỉ ẩn khi mouseleave khỏi node-group (không chỉ node)
      // (mouseenter của button sẽ tự giữ nó hiển thị nếu chuột vào button)
      // hasChildren, isCollapsed, isSelected đã được khai báo ở trên
      
      // ⚠️ CRITICAL: Ẩn nút collapse arrow khi mouseleave khỏi node-group
      // Logic kiểm tra relatedTarget đã được xử lý ở trên (dòng 2113-2182)
      // Nếu relatedTarget vẫn trong cùng node-group hoặc là button, thì đã return sớm
      // Vì vậy ở đây, chúng ta chỉ cần ẩn nút collapse arrow
      // (vì nếu đến được đây, nghĩa là chuột đã rời khỏi node-group)
      nodeGroup.select('.collapse-btn-arrow')
        .transition()
        .duration(100)
        .attr('opacity', 0)
        .style('pointer-events', 'none')
      nodeGroup.select('.collapse-arrow')
        .transition()
        .duration(100)
        .attr('opacity', 0)
        .style('pointer-events', 'none')
      
      // Call callback
      if (renderer.callbacks.onNodeHover) {
        renderer.callbacks.onNodeHover(d.id, false)
      }
    })
  
  // Store renderer reference for click handlers (cần khai báo trước khi sử dụng)
  
  // Update collapse button bridge position - cầu nối giữa node và button
  nodesUpdate.select('.collapse-button-bridge')
    .attr('x', d => getNodeSize(d).width) // Bắt đầu từ right edge của node
    .attr('y', d => 0) // Từ top của node
    .attr('width', 20) // Width = khoảng cách giữa node và button (20px)
    .attr('height', d => getNodeSize(d).height) // Height = height của node
    .each(function() {
      // ⚠️ CRITICAL: Raise cầu nối lên trên edge để đảm bảo không bị đè
      d3.select(this).raise()
    })
    .style('pointer-events', d => {
      const count = countChildren(d.id, renderer.edges)
      const isCollapsed = renderer.collapsedNodes.has(d.id)
      const isSelected = renderer.selectedNode === d.id
      // Chỉ cho phép pointer-events khi node có children, chưa collapse và không selected
      return (count > 0 && !isCollapsed && !isSelected) ? 'auto' : 'none'
    })
  
  // Update add child button position - ra ngoài bên phải
  nodesUpdate.select('.add-child-btn')
    .attr('cx', d => getNodeSize(d).width + 20) // Ra ngoài bên phải, cách 20px
    .attr('cy', d => getNodeSize(d).height / 2)
    // Chỉ cho click khi nút đang hiển thị (selected + chưa collapse)
    .style('pointer-events', d => {
      const isSelected = renderer.selectedNode === d.id
      const isCollapsed = renderer.collapsedNodes.has(d.id)
      return (isSelected && !isCollapsed) ? 'auto' : 'none'
    })
    .on('click', function(event, d) {
      event.stopPropagation()
      event.preventDefault()
      console.log('🔵 CLICKED on add-child-btn for node:', d.id)
      
      // Đảm bảo không trigger node group click
      if (event.cancelBubble !== undefined) {
        event.cancelBubble = true
      }
      
      if (renderer.callbacks.onNodeAdd) {
        renderer.callbacks.onNodeAdd(d.id)
      }
    })
  
  nodesUpdate.select('.add-child-text')
    .attr('x', d => getNodeSize(d).width + 20) // Ra ngoài bên phải, cách 20px
    .attr('y', d => getNodeSize(d).height / 2)
  
  // Update hover layer mở rộng sang bên phải
  nodesUpdate.select('.node-hover-layer')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', d => getNodeSize(d).width + 40)
    .attr('height', d => getNodeSize(d).height)
    // Không bắt sự kiện click/hover riêng, chỉ dùng để mở rộng vùng hình học của node-group,
    // giúp mouseenter/mouseleave mượt hơn mà không chặn thao tác khác.
    .style('pointer-events', 'none')
  
  // Number button (for collapsed state - shows number) - bên phải
  nodesUpdate.select('.collapse-btn-number')
    .attr('cx', d => getNodeSize(d).width + 20)
    .attr('cy', d => getNodeSize(d).height / 2)
    .attr('opacity', d => {
      const count = countChildren(d.id, renderer.edges)
      const isCollapsed = renderer.collapsedNodes.has(d.id)
      // Hiển thị nếu đã collapse và có children (kể cả khi đang selected)
      const shouldShow = (count > 0 && isCollapsed)
      if (shouldShow) {
        console.log(`✅ Button visible for node ${d.id}: count=${count}, isCollapsed=${isCollapsed}`)
      }
      return shouldShow ? 1 : 0
    })
    .style('pointer-events', d => {
      const count = countChildren(d.id, renderer.edges)
      const isCollapsed = renderer.collapsedNodes.has(d.id)
      // Chỉ cho phép click khi button hiển thị
      const canClick = (count > 0 && isCollapsed)
      return canClick ? 'auto' : 'none'
    })
    .on('click', function(event, d) {
      // QUAN TRỌNG: Stop propagation ngay lập tức để không trigger node group click
      event.stopPropagation()
      event.stopImmediatePropagation()
      event.preventDefault()
      
      console.log('🔵 CLICKED on collapse-btn-number for node:', d.id)
      console.log('Will EXPAND node:', d.id)
      console.log('Current collapsed nodes:', Array.from(renderer.collapsedNodes))
      
      // Đảm bảo không trigger node group click
      if (event.cancelBubble !== undefined) {
        event.cancelBubble = true
      }
      
      // CHỈ expand, KHÔNG BAO GIỜ gọi onNodeAdd
      if (renderer.collapsedNodes.has(d.id)) {
        // Expand node: xóa khỏi collapsedNodes
        renderer.collapsedNodes.delete(d.id)
        
        console.log('✅ Expanding node:', d.id)
        const children = renderer.edges.filter(e => e.source === d.id).map(e => e.target)
        console.log('Children to show:', children)
        console.log('Collapsed nodes after expand:', Array.from(renderer.collapsedNodes))
        
        // CHỈ gọi onNodeCollapse, KHÔNG gọi onNodeAdd
        if (renderer.callbacks.onNodeCollapse) {
          renderer.callbacks.onNodeCollapse(d.id, false)
        }
        
        // Re-render để cập nhật layout và buttons
        renderer.render()
        
        // Sau khi render xong, force update opacity một lần nữa để đảm bảo
        requestAnimationFrame(() => {
          renderer.g.selectAll('.node-group')
            .each(function(nodeData) {
              const isHidden = renderer.isNodeHidden(nodeData.id)
              const nodeEl = d3.select(this)
              const shouldBeVisible = !isHidden
              
              nodeEl
                .style('opacity', shouldBeVisible ? 1 : 0)
                .style('pointer-events', shouldBeVisible ? 'auto' : 'none')
            })
          
          renderer.g.selectAll('.edge')
            .each(function(edgeData) {
              const isHidden = renderer.isNodeHidden(edgeData.target)
              d3.select(this)
                .style('opacity', isHidden ? 0 : 1)
                .style('pointer-events', isHidden ? 'none' : 'auto')
            })
        })
      } else {
        console.log('⚠️ Node not collapsed:', d.id)
      }
      
      // Đảm bảo return false để không trigger bất kỳ event nào khác
      return false
    })
  
  nodesUpdate.select('.collapse-text-number')
    .attr('x', d => getNodeSize(d).width + 20)
    .attr('y', d => getNodeSize(d).height / 2)
    .text(d => {
      const count = countChildren(d.id, renderer.edges)
      return count > 0 ? count.toString() : ''
    })
    .attr('opacity', d => {
      const count = countChildren(d.id, renderer.edges)
      const isCollapsed = renderer.collapsedNodes.has(d.id)
      // Hiển thị nếu đã collapse và có children (kể cả khi đang selected)
      return (count > 0 && isCollapsed) ? 1 : 0
    })
  
  // Arrow button (for expanded state - shows arrow, only on hover) - bên phải
  // Opacity được điều khiển HOÀN TOÀN bởi mouseenter/mouseleave ở node-group,
  // nên ở đây KHÔNG đụng vào opacity nữa, chỉ cập nhật vị trí + pointer-events.
  nodesUpdate.select('.collapse-btn-arrow')
    .attr('cx', d => getNodeSize(d).width + 20)
    .attr('cy', d => getNodeSize(d).height / 2)
    .attr('fill', 'white') // ⚠️ CRITICAL: Đảm bảo background màu trắng
    .attr('stroke', '#3b82f6') // ⚠️ CRITICAL: Đảm bảo border xanh dương
    .attr('stroke-width', 2) // ⚠️ CRITICAL: Đảm bảo stroke width
    .each(function() {
      // ⚠️ CRITICAL: Raise nút collapse button lên trên edge để đảm bảo không bị đè
      d3.select(this).raise()
    })
    .style('pointer-events', d => {
      const count = countChildren(d.id, renderer.edges)
      const isCollapsed = renderer.collapsedNodes.has(d.id)
      const isSelected = renderer.selectedNode === d.id
      // Chỉ cho phép click khi node có children, chưa collapse và không selected
      return (count > 0 && !isCollapsed && !isSelected) ? 'auto' : 'none'
    })
    .on('mouseenter', function(event, d) {
      // Giữ collapse arrow hiển thị khi chuột vào button
      event.stopPropagation()
      const nodeGroup = d3.select(this.parentNode)
      nodeGroup.select('.collapse-btn-arrow')
        .attr('fill', 'white') // ⚠️ CRITICAL: Đảm bảo background màu trắng
        .attr('stroke', '#3b82f6') // ⚠️ CRITICAL: Đảm bảo border xanh dương
        .attr('stroke-width', 2) // ⚠️ CRITICAL: Đảm bảo stroke width
        .attr('opacity', 1)
        .style('pointer-events', 'auto')
      nodeGroup.select('.collapse-arrow')
        .attr('opacity', 1)
    })
    .on('mouseleave', function(event, d) {
      // Chỉ ẩn nếu chuột không di chuyển sang phần tử liên quan
      const related = event.relatedTarget
      if (related) {
        try {
          const isSameGroup = related === this || (related.closest && related.closest('.node-group') === this.parentNode)
          const isButton = 
            (related.classList && related.classList.contains('collapse-btn-arrow')) ||
            (related.classList && related.classList.contains('collapse-arrow')) ||
            (related.parentNode && related.parentNode.classList && related.parentNode.classList.contains('collapse-btn-arrow'))
          
          if (isSameGroup || isButton) {
            return
          }
        } catch (e) {
          // Bỏ qua lỗi
        }
      }
      
      // Ẩn collapse arrow khi rời khỏi button
      const nodeGroup = d3.select(this.parentNode)
      const hasChildren = renderer.edges.some(e => e.source === d.id)
      const isCollapsed = renderer.collapsedNodes.has(d.id)
      const isSelected = renderer.selectedNode === d.id
      
      // Chỉ ẩn nếu không còn điều kiện hiển thị
      if (!hasChildren || isCollapsed || isSelected) {
        nodeGroup.select('.collapse-btn-arrow')
          .attr('opacity', 0)
          .style('pointer-events', 'none')
        nodeGroup.select('.collapse-arrow')
          .attr('opacity', 0)
      }
    })
    .on('click', function(event, d) {
      // QUAN TRỌNG: Stop propagation ngay lập tức để không trigger node group click
      event.stopPropagation()
      event.stopImmediatePropagation()
      event.preventDefault()
      
      console.log('🔵 CLICKED on collapse-btn-arrow for node:', d.id)
      console.log('Will COLLAPSE node:', d.id)
      console.log('Current collapsed nodes:', Array.from(renderer.collapsedNodes))
      
      // Đảm bảo không trigger node group click
      if (event.cancelBubble !== undefined) {
        event.cancelBubble = true
      }
      
      // CHỈ collapse, KHÔNG BAO GIỜ gọi onNodeAdd
      if (!renderer.collapsedNodes.has(d.id)) {
        renderer.collapsedNodes.add(d.id)
        console.log('✅ Collapsed node:', d.id)
        console.log('Collapsed nodes after:', Array.from(renderer.collapsedNodes))

        // Ẩn ngay nút thu gọn sau khi click
        const nodeGroup = d3.select(this.parentNode)
        nodeGroup.select('.collapse-btn-arrow').attr('opacity', 0)
        nodeGroup.select('.collapse-arrow').attr('opacity', 0)
        
        // CHỈ gọi onNodeCollapse, KHÔNG gọi onNodeAdd
        if (renderer.callbacks.onNodeCollapse) {
          renderer.callbacks.onNodeCollapse(d.id, true)
        }
        
        // Re-render để ẩn children
        renderer.render()
      } else {
        console.log('⚠️ Node already collapsed:', d.id)
      }
      
      // Đảm bảo return false để không trigger bất kỳ event nào khác
      return false
    })
  
  nodesUpdate.select('.collapse-arrow')
    .attr('transform', d => `translate(${getNodeSize(d).width + 20}, ${getNodeSize(d).height / 2}) scale(0.7) translate(-12, -12)`) // Scale 0.7 để icon to hơn
    .each(function() {
      // Đảm bảo icon nổi trên edge bằng cách raise lên trên cùng
      d3.select(this).raise()
    })
  
  // Update rectangle size and style
  // Node rect width = textarea width (130px - 400px)
  nodesUpdate.select('.node-rect')
    .attr('width', d => {
      // Nếu đang edit, lấy width từ textarea
      if (renderer.editingNode === d.id) {
        const nodeGroup = renderer.g.select(`[data-node-id="${d.id}"]`)
        const textarea = nodeGroup.select('.node-textarea').node()
        if (textarea) {
          const locked = parseFloat(textarea.getAttribute('data-locked-width'))
          if (locked) return locked
        }
      }
      // Tính toán width dựa trên nội dung (130px - 400px)
      // Sử dụng estimateNodeSize để đảm bảo width và height được tính đúng
      const nodeSize = getNodeSize(d)
      return nodeSize.width
    })
    .attr('height', d => getNodeSize(d).height)
    .attr('fill', d => {
      // Hover state takes priority
      if (renderer.hoveredNode === d.id) {
        return d.data?.isRoot ? '#2563eb' : '#f3f4f6'
      }
      // Selected state
      if (renderer.selectedNode === d.id) return '#ffffff' // Selected: màu trắng
      // Default state
      return d.data?.isRoot ? '#3b82f6' : '#ffffff'
    })
    .attr('stroke', d => {
      // Hover state takes priority
      if (renderer.hoveredNode === d.id) {
        return d.data?.isRoot ? 'none' : '#3b82f6'
      }
      // Selected state
      if (renderer.selectedNode === d.id) return '#3b82f6'
      // Default state
      return d.data?.isRoot ? 'none' : '#cbd5e1'
    })
    .attr('stroke-width', 2) // Border luôn là 2px
    .attr('opacity', d => d.data?.completed ? 0.5 : 1) // Làm mờ rect khi completed
  
  // Update textarea content and behaviors
  nodesUpdate.select('.node-text')
    .each((nodeData, idx, nodeArray) => {
      const fo = d3.select(nodeArray[idx])
      const text = nodeData.data?.label || ''
      const color = nodeData.data?.isRoot ? '#ffffff' : '#000000'
      const bgColor = nodeData.data?.isRoot ? '#3b82f6' : '#ffffff'
      
      const nodeSize = getNodeSize(nodeData)
      const minWidth = 130
      const maxWidth = 400
      
      // Nếu node đang được edit, lấy textarea width từ data attribute
      let currentTextareaWidth = minWidth
      if (renderer.editingNode === nodeData.id) {
        const textareaElement = fo.select('.node-textarea').node()
        if (textareaElement) {
          const locked = parseFloat(textareaElement.getAttribute('data-locked-width'))
          if (locked) {
            currentTextareaWidth = locked
          }
        }
      } else {
        // Nếu không edit, tính toán width dựa trên nội dung
        // ⚠️ FIX: Cho phép width nhỏ hơn minWidth (130px) cho text ngắn
        // Ưu tiên dùng kích thước từ cache hoặc getNodeSize để đảm bảo nhất quán
        if (text) {
          // Dùng kích thước từ getNodeSize (đã được tính với buffer đủ) thay vì tính lại
          const nodeSizeFromCache = getNodeSize(nodeData)
          if (nodeSizeFromCache) {
            // ⚠️ FIX: Cho phép width nhỏ hơn minWidth để node có kích thước chính xác như node gốc
            // Dùng trực tiếp width từ cache, không force tối thiểu
            currentTextareaWidth = Math.min(nodeSizeFromCache.width, maxWidth)
          } else {
            // Fallback: tính toán lại nếu cache không có hoặc không hợp lý
            const estimatedWidth = renderer.estimateNodeWidth(nodeData, maxWidth)
            // ⚠️ FIX: Cho phép width nhỏ hơn minWidth để node có kích thước chính xác
            currentTextareaWidth = Math.min(estimatedWidth, maxWidth)
          }
        } else {
          currentTextareaWidth = minWidth
        }
      }
      
      // Update width và height của foreignObject
      // Lấy kích thước từ node-rect thực tế và trừ border để fit
      const nodeGroup = d3.select(nodeArray[idx].parentNode)
      const rect = nodeGroup.select('.node-rect')
      const isRootNode = nodeData.data?.isRoot || nodeData.id === 'root'
      let rectWidth = parseFloat(rect.attr('width')) || currentTextareaWidth
      
      // Với root node, LUÔN dùng cache nếu có để tránh tính lại và nháy
      // Với node khác, dùng height từ rect (có thể là fixedHeight) hoặc từ nodeSize
      let rectHeight
      if (isRootNode) {
        // Root node: ưu tiên dùng cache để tránh nháy
        const cachedSize = renderer.nodeSizeCache.get(nodeData.id)
        if (cachedSize && cachedSize.height >= 43) {
          // ⚠️ FIX: Dùng cache nếu có và height hợp lý (>= 43px, có thể là single line hoặc multi-line)
          rectHeight = cachedSize.height
          // Đảm bảo width cũng được cập nhật từ cache
          if (rectWidth !== cachedSize.width) {
            rect.attr('width', cachedSize.width)
            rectWidth = cachedSize.width
          }
          console.log('[ROOT NODE] renderNodes - using cache:', cachedSize)
        } else {
          // ⚠️ FIX: Khi chưa có cache hoặc cache không hợp lý (< 43px), dùng height tạm thời
          // và đo lại trong setTimeout
          const singleLineHeight = Math.ceil(19 * 1.4) + 16
          rectHeight = singleLineHeight
          console.log('[ROOT NODE] renderNodes - using temporary height:', rectHeight)
          // ⚠️ CRITICAL: KHÔNG lưu temporary height vào cache để tránh override cache hợp lý
          // Cache sẽ được cập nhật trong setTimeout sau khi đo đúng height
        }
        rect.attr('height', rectHeight)
        // Cập nhật vị trí nút add-child
        nodeGroup.select('.add-child-btn').attr('cy', rectHeight / 2)
        nodeGroup.select('.add-child-text').attr('y', rectHeight / 2)
      } else {
        // Node thường: dùng height từ rect (có thể là fixedHeight) hoặc từ nodeSize
        rectHeight = parseFloat(rect.attr('height')) || nodeSize.height
      }
      
      const borderOffset = 4 // 2px border mỗi bên (top/bottom và left/right)
      fo.attr('x', 2)
      fo.attr('y', 2)
      fo.attr('width', Math.max(0, rectWidth - borderOffset))
      fo.attr('height', Math.max(0, rectHeight - borderOffset))
      
      // ⚠️ CRITICAL: Tất cả các node đều dùng auto để hiển thị đầy đủ nội dung (bao gồm ảnh)
      // Nhưng dùng overflow: hidden để tránh nội dung tràn ra ngoài và đè lên node khác
      const wrapper = fo.select('.node-content-wrapper')
        .style('width', '100%') // Wrapper chiếm 100% foreignObject
        .style('height', 'auto') // Tất cả node dùng auto để hiển thị đủ nội dung
        .style('min-height', '0')
        .style('max-height', 'none')
        .style('background', bgColor)
        .style('border-radius', '8px')
        .style('overflow', 'hidden') // ⚠️ FIX: Dùng hidden để tránh nội dung tràn ra ngoài và đè lên node khác
        .style('border', 'none') // Không có border để không đè lên border của node-rect
        .style('outline', 'none') // Không có outline
        .style('box-sizing', 'border-box') // Đảm bảo padding/border tính trong width/height
      
      // Mount Vue TipTap editor component
      const editorContainer = wrapper.select('.node-editor-container')
        .style('width', '100%')
        .style('height', 'auto') // Tất cả node dùng auto để hiển thị đủ nội dung
        .style('min-height', '0')
        .style('max-height', 'none')
        .style('pointer-events', 'none') // Disable pointer events để ngăn click khi chưa edit
        .style('overflow', 'hidden') // ⚠️ FIX: Dùng hidden để tránh nội dung tràn ra ngoài và đè lên node khác
        .style('box-sizing', 'border-box') // Đảm bảo padding/border tính trong width/height
      
      // Mount hoặc update Vue component
      const containerNode = editorContainer.node()
      if (containerNode) {
        // Kiểm tra xem component đã được mount chưa
        if (!renderer.vueApps.has(nodeData.id)) {
          // Mount component mới
          mountNodeEditor(renderer, nodeData.id, containerNode, {
            value: text,
            placeholder: 'Nhập...',
            color: color,
            minHeight: '43px',
            width: '100%',
            height: 'auto',
            isRoot: isRootNode,
            uploadImage: renderer.uploadImage || null, // Pass uploadImage function
            onInput: (value) => {
              // Handle input event - sẽ được cập nhật sau
              handleEditorInput(renderer, nodeData.id, value, nodeArray[idx], nodeData)
            },
            onFocus: () => {
              // Handle focus event - sẽ được cập nhật sau
              handleEditorFocus(renderer, nodeData.id, nodeArray[idx], nodeData)
            },
            onBlur: () => {
              // Handle blur event - sẽ được cập nhật sau
              handleEditorBlur(renderer, nodeData.id, nodeArray[idx], nodeData)
            },
          })
          
          // Sau khi mount editor lần đầu, set white-space ngay lập tức để tránh text xuống dòng
          // Áp dụng cho tất cả các node, không chỉ root node
          requestAnimationFrame(() => {
            const editor = getEditorInstance(renderer, nodeData.id)
            if (editor && editor.view && editor.view.dom) {
              const editorDOM = editor.view.dom
              const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
              if (editorContent) {
                const currentRectWidth = parseFloat(rect.attr('width')) || rectWidth
                const maxWidth = 400
                // Set white-space ngay lập tức dựa trên width hiện tại
                if (currentRectWidth >= maxWidth) {
                  editorContent.style.whiteSpace = 'pre-wrap'
                } else {
                  editorContent.style.whiteSpace = 'nowrap'
                }
              }
            }
          })
          
          // Sau đó đợi một chút rồi đo lại height từ editor DOM
          // Áp dụng cho cả root node và node thường để đảm bảo kích thước chính xác
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(() => {
                const editor = getEditorInstance(renderer, nodeData.id)
                if (editor && editor.view && editor.view.dom) {
                  const editorDOM = editor.view.dom
                  const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
                  
                  if (editorContent && editorContent.offsetHeight > 0) {
                    // ⚠️ CRITICAL: Đo lại height cho TẤT CẢ các node (không chỉ root node)
                    // Đảm bảo chiều cao node = chiều cao editor ngay cả khi chưa mở editor
                    const borderOffset = 4
                    const minWidth = 130
                    const maxWidth = 400
                    let currentWidth = parseFloat(rect.attr('width')) || rectWidth
                    
                    // Set width và white-space trước khi đo height
                    const foWidth = currentWidth - borderOffset
                    editorContent.style.width = `${foWidth}px`
                    editorContent.style.height = 'auto'
                    editorContent.style.minHeight = '0'
                    editorContent.style.maxHeight = 'none'
                    editorContent.style.overflow = 'hidden' // ⚠️ FIX: Dùng hidden để tránh nội dung tràn ra ngoài (scrollHeight vẫn đo được chính xác)
                    editorContent.style.boxSizing = 'border-box'
                    editorContent.style.padding = '8px 16px'
                    
                    const willWrap = currentWidth >= maxWidth
                    if (willWrap) {
                      editorContent.style.whiteSpace = 'pre-wrap'
                    } else {
                      editorContent.style.whiteSpace = 'nowrap'
                    }
                    
                    // Force reflow để đảm bảo styles đã được áp dụng
                    void editorContent.offsetWidth
                    void editorContent.offsetHeight
                    void editorContent.scrollHeight
                    
                    // Đo height thực tế - dùng scrollHeight để lấy chiều cao đầy đủ
                    const contentHeight = Math.max(
                      editorContent.scrollHeight || editorContent.offsetHeight || 0,
                      Math.ceil(19 * 1.4) + 16 // singleLineHeight
                    )
                    
                    const currentHeight = parseFloat(rect.attr('height')) || 0
                    if (Math.abs(contentHeight - currentHeight) > 1) {
                      rect.attr('height', contentHeight)
                      fo.attr('height', Math.max(0, contentHeight - borderOffset))
                      
                      // Cập nhật wrapper và container
                      wrapper.style('height', 'auto')
                      wrapper.style('min-height', '0')
                      wrapper.style('max-height', 'none')
                      wrapper.style('overflow', 'hidden') // ⚠️ FIX: Dùng hidden để tránh nội dung tràn ra ngoài
                      editorContainer.style('height', 'auto')
                      editorContainer.style('min-height', '0')
                      editorContainer.style('max-height', 'none')
                      editorContainer.style('overflow', 'hidden') // ⚠️ FIX: Dùng hidden để tránh nội dung tràn ra ngoài
                      
                      // Cập nhật cache
                      renderer.nodeSizeCache.set(nodeData.id, { width: currentWidth, height: contentHeight })
                      
                      // Cập nhật vị trí các buttons
                      nodeGroup.select('.add-child-btn').attr('cy', contentHeight / 2)
                      nodeGroup.select('.add-child-text').attr('y', contentHeight / 2)
                      nodeGroup.select('.collapse-btn-number').attr('cy', contentHeight / 2)
                      nodeGroup.select('.collapse-text-number').attr('y', contentHeight / 2)
                      nodeGroup.select('.collapse-btn-arrow').attr('cy', contentHeight / 2)
                      nodeGroup.select('.collapse-text-arrow').attr('y', contentHeight / 2)
                      nodeGroup.select('.collapse-btn-arrow').attr('transform', `translate(${currentWidth + 20}, ${contentHeight / 2}) scale(0.7) translate(-12, -12)`)
                    }
                    
                    // Chỉ đo lại width cho root node
                    if (isRootNode) {
                      const borderOffset = 4
                      const minWidth = 130
                      const maxWidth = 400
                      let currentWidth = parseFloat(rect.attr('width')) || rectWidth
                      
                      const editorHTML = editor.getHTML() || ''
                      
                      if (editorHTML) {
                        let titleText = ''
                        let descriptionText = ''
                        
                        const tempDiv = document.createElement('div')
                        tempDiv.innerHTML = editorHTML
                        
                        const paragraphs = tempDiv.querySelectorAll('p')
                        paragraphs.forEach(p => {
                          let inBlockquote = false
                          let parent = p.parentElement
                          while (parent && parent !== tempDiv) {
                            if (parent.tagName === 'BLOCKQUOTE') {
                              inBlockquote = true
                              break
                            }
                            parent = parent.parentElement
                          }
                          
                          if (!inBlockquote) {
                            const paraText = (p.textContent || p.innerText || '').trim()
                            if (paraText) {
                              titleText += (titleText ? '\n' : '') + paraText
                            }
                          }
                        })
                        
                        const blockquotes = tempDiv.querySelectorAll('blockquote')
                        blockquotes.forEach(blockquote => {
                          const blockquoteText = (blockquote.textContent || blockquote.innerText || '').trim()
                          if (blockquoteText) {
                            descriptionText += (descriptionText ? '\n' : '') + blockquoteText
                          }
                        })
                        
                        let titleWidth = 0
                        if (titleText) {
                          const titleLines = titleText.split('\n')
                          titleLines.forEach(line => {
                            if (line.trim()) {
                              const lineSpan = document.createElement('span')
                              lineSpan.style.cssText = `
                                position: absolute;
                                visibility: hidden;
                                white-space: nowrap;
                                font-size: 19px;
                                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                              `
                              lineSpan.textContent = line.trim()
                              document.body.appendChild(lineSpan)
                              void lineSpan.offsetHeight
                              titleWidth = Math.max(titleWidth, lineSpan.offsetWidth)
                              document.body.removeChild(lineSpan)
                            }
                          })
                        }
                        
                        let descriptionWidth = 0
                        if (descriptionText) {
                          const descLines = descriptionText.split('\n')
                          descLines.forEach(line => {
                            if (line.trim()) {
                              const lineSpan = document.createElement('span')
                              lineSpan.style.cssText = `
                                position: absolute;
                                visibility: hidden;
                                white-space: nowrap;
                                font-size: 16px;
                                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                              `
                              lineSpan.textContent = line.trim()
                              document.body.appendChild(lineSpan)
                              void lineSpan.offsetHeight
                              descriptionWidth = Math.max(descriptionWidth, lineSpan.offsetWidth)
                              document.body.removeChild(lineSpan)
                            }
                          })
                        }
                        
                        const maxTextWidth = Math.max(titleWidth, descriptionWidth)
                        // Tăng buffer để đảm bảo đủ không gian, giống như trong estimateNodeWidth
                        const requiredWidth = maxTextWidth + 56 // padding + margin + buffer để tránh text xuống dòng
                        
                        if (requiredWidth < maxWidth) {
                          currentWidth = Math.max(minWidth, Math.min(requiredWidth, maxWidth))
                        } else {
                          currentWidth = maxWidth
                        }
                        
                        if (Math.abs(currentWidth - parseFloat(rect.attr('width'))) > 1) {
                          rect.attr('width', currentWidth)
                          const foWidth = currentWidth - borderOffset
                          fo.attr('width', Math.max(0, foWidth))
                        }
                      }
                      
                      const foWidth = currentWidth - borderOffset
                      editorContent.style.width = `${foWidth}px`
                      const willWrap = currentWidth >= maxWidth
                      if (willWrap) {
                        editorContent.style.whiteSpace = 'pre-wrap'
                      } else {
                        editorContent.style.whiteSpace = 'nowrap'
                      }
                      
                      void editorContent.offsetWidth
                      void editorContent.offsetHeight
                      
                      // ⚠️ FIX: Set styles trước khi đo để đảm bảo chính xác
                      editorContent.style.height = 'auto'
                      editorContent.style.minHeight = '0'
                      editorContent.style.maxHeight = 'none'
                      editorContent.style.overflow = 'hidden' // ⚠️ FIX: Dùng hidden để tránh nội dung tràn ra ngoài (scrollHeight vẫn đo được chính xác)
                      
                      // Force reflow
                      void editorContent.offsetHeight
                      
                      // Đo height thực tế - dùng scrollHeight để lấy chiều cao đầy đủ
                      const contentHeight = Math.max(
                        editorContent.scrollHeight || editorContent.offsetHeight || 0,
                        Math.ceil(19 * 1.4) + 16 // singleLineHeight
                      )
                      
                      console.log('[ROOT NODE] setTimeout - editorContent.offsetHeight:', editorContent.offsetHeight, 'final:', contentHeight)
                      
                      const currentHeight = parseFloat(rect.attr('height')) || 0
                      if (Math.abs(contentHeight - currentHeight) > 1) {
                        rect.attr('height', contentHeight)
                        fo.attr('height', Math.max(0, contentHeight - borderOffset))
                        
                        // ⚠️ CRITICAL: Với root node, LUÔN dùng auto để hiển thị đầy đủ nội dung
                        // Nhưng dùng overflow: hidden để tránh nội dung tràn ra ngoài
                        wrapper.style('height', 'auto')
                        wrapper.style('min-height', '0')
                        wrapper.style('max-height', 'none')
                        wrapper.style('overflow', 'hidden') // ⚠️ FIX: Dùng hidden để tránh nội dung tràn ra ngoài
                        editorContainer.style('height', 'auto')
                        editorContainer.style('min-height', '0')
                        editorContainer.style('max-height', 'none')
                        editorContainer.style('overflow', 'hidden') // ⚠️ FIX: Dùng hidden để tránh nội dung tràn ra ngoài
                      }
                      
                      renderer.nodeSizeCache.set(nodeData.id, { width: currentWidth, height: contentHeight })
                      
                      // ⚠️ PATCH 1: Cập nhật vị trí TẤT CẢ buttons ngay lập tức
                      nodeGroup.select('.add-child-btn')
                        .attr('cx', currentWidth + 20)
                        .attr('cy', contentHeight / 2)
                      
                      nodeGroup.select('.add-child-text')
                        .attr('x', currentWidth + 20)
                        .attr('y', contentHeight / 2)
                      
                      nodeGroup.select('.collapse-btn-number')
                        .attr('cx', currentWidth + 20)
                        .attr('cy', contentHeight / 2)
                      
                      nodeGroup.select('.collapse-text-number')
                        .attr('x', currentWidth + 20)
                        .attr('y', contentHeight / 2)
                      
                      nodeGroup.select('.collapse-btn-arrow')
                        .attr('cx', currentWidth + 20)
                        .attr('cy', contentHeight / 2)
                      
                      nodeGroup.select('.collapse-arrow')
                        .attr('transform', `translate(${currentWidth + 20}, ${contentHeight / 2}) scale(0.7) translate(-12, -12)`)
                      
                      nodeGroup.select('.node-hover-layer')
                        .attr('width', currentWidth + 40)
                        .attr('height', contentHeight)
                      
                      // Re-calculate layout
                      const newNodeSizes = new Map()
                      renderer.nodes.forEach(n => {
                        if (n.id === nodeData.id) {
                          newNodeSizes.set(n.id, { width: currentWidth, height: contentHeight })
                        } else {
                          const existingSize = renderer.nodeSizeCache.get(n.id)
                          if (existingSize) {
                            newNodeSizes.set(n.id, existingSize)
                          } else {
                            const size = renderer.estimateNodeSize(n)
                            newNodeSizes.set(n.id, size)
                            renderer.nodeSizeCache.set(n.id, size)
                          }
                        }
                      })
                      
                      const newPositions = calculateD3MindmapLayout(renderer.nodes, renderer.edges, {
                        nodeSizes: newNodeSizes,
                        layerSpacing: renderer.options.layerSpacing,
                        nodeSpacing: renderer.options.nodeSpacing,
                        padding: renderer.options.padding,
                        viewportHeight: renderer.options.height,
                        nodeCreationOrder: renderer.options.nodeCreationOrder || new Map(),
                        collapsedNodes: renderer.collapsedNodes
                      })
                      
                      renderer.positions = newPositions
                      
                      // Re-render với positions mới
                      const nodeGroups = renderer.g.selectAll('.node-group')
                      let completedCount = 0
                      const totalNodes = nodeGroups.size()
                      
                      // Nếu không có nodes, gọi callback ngay
                      if (totalNodes === 0 && renderer.callbacks.onRenderComplete) {
                        requestAnimationFrame(() => {
                          renderer.callbacks.onRenderComplete()
                        })
                        return
                      }
                      
                      nodeGroups
                        .transition()
                        .duration(300)
                        .attr('transform', d => {
                          const pos = newPositions.get(d.id)
                          if (!pos) return 'translate(0, 0)'
                          return `translate(${pos.x}, ${pos.y})`
                        })
                        // ⚠️ PATCH 2: Cập nhật lại buttons sau transition
                        .on('end', function() {
                          completedCount++
                          
                          // Gọi callback khi TẤT CẢ nodes đã transition xong
                          if (completedCount === totalNodes && renderer.callbacks.onRenderComplete) {
                            // Đợi thêm một chút để đảm bảo mọi thứ đã ổn định
                            setTimeout(() => {
                              renderer.callbacks.onRenderComplete()
                            }, 50)
                          }
                          const nodeGroup = d3.select(this)
                          const nodeId = nodeGroup.attr('data-node-id')
                          const nodeSize = renderer.nodeSizeCache.get(nodeId)
                          
                          if (nodeSize) {
                            nodeGroup.select('.add-child-btn')
                              .attr('cx', nodeSize.width + 20)
                              .attr('cy', nodeSize.height / 2)
                            
                            nodeGroup.select('.add-child-text')
                              .attr('x', nodeSize.width + 20)
                              .attr('y', nodeSize.height / 2)
                            
                            nodeGroup.select('.collapse-btn-number')
                              .attr('cx', nodeSize.width + 20)
                              .attr('cy', nodeSize.height / 2)
                            
                            nodeGroup.select('.collapse-text-number')
                              .attr('x', nodeSize.width + 20)
                              .attr('y', nodeSize.height / 2)
                            
                            nodeGroup.select('.collapse-btn-arrow')
                              .attr('cx', nodeSize.width + 20)
                              .attr('cy', nodeSize.height / 2)
                            
                            nodeGroup.select('.collapse-arrow')
                              .attr('transform', `translate(${nodeSize.width + 20}, ${nodeSize.height / 2}) scale(0.7) translate(-12, -12)`)
                            
                            nodeGroup.select('.node-hover-layer')
                              .attr('width', nodeSize.width + 40)
                              .attr('height', nodeSize.height)
                          }
                        })
                      
                      renderer.renderEdges(newPositions)
                    }
                  }
                }
              }, 200)
            })
          })
        } else {
          // Update existing component props
          const entry = renderer.vueApps.get(nodeData.id)
          if (entry && entry.instance) {
            // Update modelValue nếu khác
            if (entry.instance.modelValue !== text) {
              entry.instance.modelValue = text
            }
            // Update isRoot prop
            if (entry.instance.isRoot !== isRootNode) {
              entry.instance.isRoot = isRootNode
              // Cập nhật lại editor attributes để apply màu chữ
              if (entry.instance.editor) {
                const editorEl = entry.instance.editor.view.dom
                if (editorEl) {
                  if (isRootNode) {
                    editorEl.classList.add('is-root')
                    editorEl.style.color = '#ffffff'
                  } else {
                    editorEl.classList.remove('is-root')
                    editorEl.style.color = ''
                  }
                }
              }
            }
          }
          
        }
      }
      
      // Note: Focus, blur, và input events được xử lý bởi Vue component handlers
      // Không cần xử lý ở đây nữa
    })
  
  // Add shadow filter
  const defs = renderer.svg.select('defs')
  if (defs.select('#shadow').empty()) {
    const filter = defs.append('filter')
      .attr('id', 'shadow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%')
    
    filter.append('feGaussianBlur')
      .attr('in', 'SourceAlpha')
      .attr('stdDeviation', 2)
    
    filter.append('feOffset')
      .attr('dx', 0)
      .attr('dy', 2)
      .attr('result', 'offsetblur')
    
    const feComponentTransfer = filter.append('feComponentTransfer')
      .attr('in', 'offsetblur')
      .attr('result', 'shadow')
    
    feComponentTransfer.append('feFuncA')
      .attr('type', 'linear')
      .attr('slope', 0.2)
    
    filter.append('feComposite')
      .attr('in', 'shadow')
      .attr('in2', 'SourceAlpha')
      .attr('operator', 'in')
      .attr('result', 'shadow')
    
    filter.append('feMerge')
      .append('feMergeNode')
      .attr('in', 'shadow')
    
    filter.select('feMerge')
      .append('feMergeNode')
      .attr('in', 'SourceGraphic')
  }
}

