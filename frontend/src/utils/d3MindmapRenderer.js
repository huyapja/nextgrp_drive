/**
 * D3.js Mindmap Renderer
 * Render mindmap trực tiếp với D3.js (thay thế VueFlow)
 * 
 * Features:
 * - SVG rendering với D3
 * - Interactive nodes
 * - Editable nodes
 * - Zoom & pan
 * - Horizontal layout giống Lark
 */

import * as d3 from 'd3'
import { calculateD3MindmapLayout } from './d3MindmapLayout'

export class D3MindmapRenderer {
  constructor(container, options = {}) {
    this.container = container
    this.options = {
      width: options.width || window.innerWidth,
      height: options.height || window.innerHeight - 84,
      nodeSpacing: options.nodeSpacing || 50, // Khoảng cách dọc giữa siblings
      layerSpacing: options.layerSpacing || 180, // Khoảng cách ngang giữa layers
      padding: options.padding || 20, // Padding chung
      ...options
    }
    
    this.nodes = []
    this.edges = []
    this.selectedNode = null
    this.editingNode = null
    this.positions = new Map() // Store calculated positions
    this.nodeSizeCache = new Map() // Cache node sizes to avoid recalculating during editing
    
    this.zoom = null
    this.svg = null
    this.g = null
    
    this.callbacks = {
      onNodeClick: null,
      onNodeDoubleClick: null,
      onNodeAdd: null,
      onNodeUpdate: null,
      onNodeDelete: null,
      onNodeEditingStart: null,
      onNodeEditingEnd: null
    }
    
    this.init()
  }
  
  init() {
    // Clear container
    d3.select(this.container).selectAll('*').remove()
    
    // Create SVG
    this.svg = d3.select(this.container)
      .append('svg')
      .attr('width', this.options.width)
      .attr('height', this.options.height)
      .style('background', '#f5f5f5')
    
    // Create main group for zoom/pan
    this.g = this.svg.append('g')
    
    // Setup zoom
    this.zoom = d3.zoom()
      .scaleExtent([0.5, 2])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform)
      })
    
    this.svg.call(this.zoom)
    
    // Add background grid
    this.addGrid()
  }
  
  addGrid() {
    const dotSize = 20
    const dotRadius = 1
    
    const pattern = this.svg.append('defs')
      .append('pattern')
      .attr('id', 'grid')
      .attr('width', dotSize)
      .attr('height', dotSize)
      .attr('patternUnits', 'userSpaceOnUse') // Dùng userSpaceOnUse để pattern không scale theo zoom, tạo cảm giác vô cực
    
    // Tạo chấm bi tại góc trên bên trái của pattern
    pattern.append('circle')
      .attr('cx', dotRadius)
      .attr('cy', dotRadius)
      .attr('r', dotRadius)
      .attr('fill', '#ddd')
    
    // Tạo background rect với kích thước lớn hơn viewport để đảm bảo hiển thị vô cực khi pan/zoom
    // Dùng kích thước rất lớn để có thể pan/zoom nhiều
    const largeSize = 100000
    this.g.append('rect')
      .attr('x', -largeSize / 2)
      .attr('y', -largeSize / 2)
      .attr('width', largeSize)
      .attr('height', largeSize)
      .attr('fill', 'url(#grid)')
      .lower() // Đặt background ở dưới cùng
  }
  
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  adjustTextareaHeight(textarea, minHeight = null) {
    if (!textarea) return 0
    
    // Chiều cao 1 dòng = font-size * line-height + padding
    const singleLineHeight = minHeight || (Math.ceil(19 * 1.4) + 16) // ~43px
    
    // Set height về minHeight trước để đo chính xác
    textarea.style.height = `${singleLineHeight}px`
    
    // Force reflow
    void textarea.offsetHeight
    
    // Lấy scrollHeight thực tế (sau khi đã set minHeight)
    const scrollHeight = textarea.scrollHeight
    
    // Đảm bảo chiều cao tối thiểu là 1 dòng
    const targetHeight = Math.max(scrollHeight, singleLineHeight)
    
    // Áp dụng chiều cao
    textarea.style.height = `${targetHeight}px`
    textarea.style.minHeight = `${singleLineHeight}px`
    
    return targetHeight
  }
  
  setData(nodes, edges, nodeCreationOrder = null) {
    this.nodes = nodes
    this.edges = edges
    // Update nodeCreationOrder nếu được truyền vào
    if (nodeCreationOrder) {
      this.options.nodeCreationOrder = nodeCreationOrder
    }
    this.render()
  }
  
  async render() {
    if (this.nodes.length === 0) return
    
    // Force reflow để đảm bảo DOM đã update (quan trọng khi edit node)
    void document.body.offsetHeight
    
    // Calculate node sizes from text content (accurate measurement)
    // Đảm bảo tính toán lại kích thước chính xác sau khi text thay đổi
    // NHƯNG: Nếu node đang được edit, giữ nguyên size từ cache để tránh nháy
    const nodeSizes = new Map()
    this.nodes.forEach(node => {
      // Nếu node đang được edit, dùng size từ cache (giữ width cố định)
      if (this.editingNode === node.id && this.nodeSizeCache.has(node.id)) {
        const cachedSize = this.nodeSizeCache.get(node.id)
        nodeSizes.set(node.id, cachedSize)
      } else {
        // Tính toán lại kích thước với text mới
        // Ưu tiên sử dụng fixedWidth/fixedHeight nếu có (đã được set khi blur)
        const size = this.estimateNodeSize(node)
        nodeSizes.set(node.id, size)
        // Cập nhật cache để đảm bảo đồng bộ
        this.nodeSizeCache.set(node.id, size)
      }
    })
    
    // Calculate layout với khoảng cách đều nhau
    const maxNodeWidth = Math.max(...Array.from(nodeSizes.values()).map(s => s.width), 200)
    // Sử dụng layerSpacing cố định, chỉ điều chỉnh nhỏ nếu cần
    const dynamicLayerSpacing = Math.max(this.options.layerSpacing, maxNodeWidth * 0.3 + this.options.layerSpacing)
    
    // Lấy nodeCreationOrder từ Vue component (nếu có)
    // Tạm thời tạo empty Map, sẽ được truyền từ component sau
    const nodeCreationOrder = this.options.nodeCreationOrder || new Map()
    
    const positions = calculateD3MindmapLayout(this.nodes, this.edges, {
      nodeSizes: nodeSizes,
      layerSpacing: dynamicLayerSpacing,
      nodeSpacing: this.options.nodeSpacing,
      padding: this.options.padding,
      viewportHeight: this.options.height,
      nodeCreationOrder: nodeCreationOrder
    })
    
    // Store positions
    this.positions = positions
    
    // Render edges
    this.renderEdges(positions)
    
    // Render nodes
    this.renderNodes(positions)
  }
  
  renderEdges(positions) {
    const edges = this.g.selectAll('.edge')
      .data(this.edges, d => d.id)
    
    // Remove old edges
    edges.exit().remove()
    
    // Add new edges
    const edgesEnter = edges.enter()
      .append('path')
      .attr('class', 'edge')
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .style('pointer-events', 'none') // Edges không chặn click vào nodes/nút
    
    // Update all edges
    const edgesUpdate = edgesEnter.merge(edges)
    
    edgesUpdate.attr('d', d => {
      const sourcePos = positions.get(d.source)
      const targetPos = positions.get(d.target)
      
      if (!sourcePos || !targetPos) return ''
      
      // Get node sizes for proper connection points - luôn tính toán lại để đảm bảo chính xác
      const sourceNode = this.nodes.find(n => n.id === d.source)
      const targetNode = this.nodes.find(n => n.id === d.target)
      const sourceSize = this.estimateNodeSize(sourceNode)
      const targetSize = this.estimateNodeSize(targetNode)
      const sourceWidth = sourceSize.width
      const sourceHeight = sourceSize.height
      const targetWidth = targetSize.width
      const targetHeight = targetSize.height
      
      // Calculate connection points at center of nodes - LUÔN ở giữa node
      // Source: right center of source node (giữa theo chiều dọc)
      const x1 = sourcePos.x + sourceWidth
      const y1 = sourcePos.y + (sourceHeight / 2)
      
      // Target: left center of target node (giữa theo chiều dọc)
      const x2 = targetPos.x
      const y2 = targetPos.y + (targetHeight / 2)
      
      const dx = x2 - x1
      const dy = y2 - y1
      const direction = dy >= 0 ? 1 : -1
      const baseOffset = Math.max(40, Math.min(Math.abs(dx) * 0.45, 130))
      const horizontalOffset = Math.min(baseOffset, dx - 16)
      const cornerRadius = Math.min(
        18,
        Math.abs(dy) / 2,
        Math.max(8, horizontalOffset / 3)
      )
      
      // When nodes are very close horizontally, keep a straight line
      if (horizontalOffset < cornerRadius * 2 + 4) {
        return `M ${x1} ${y1} L ${x2} ${y2}`
      }
      
      const midX = x1 + horizontalOffset
      const path = [
        `M ${x1} ${y1}`,
        `L ${midX - cornerRadius} ${y1}`,
        `Q ${midX} ${y1} ${midX} ${y1 + direction * cornerRadius}`,
        `L ${midX} ${y2 - direction * cornerRadius}`,
        `Q ${midX} ${y2} ${midX + cornerRadius} ${y2}`,
        `L ${x2} ${y2}`
      ]
      
      return path.join(' ')
    })
    
  }
  
  renderNodes(positions) {
    // Pre-calculate node sizes to avoid repeated calculations
    // Sử dụng instance variable nodeSizeCache thay vì local variable
    this.nodes.forEach(node => {
      // Chỉ tính toán lại nếu chưa có trong cache hoặc node đang không được edit
      if (!this.nodeSizeCache.has(node.id) || this.editingNode !== node.id) {
        const size = this.estimateNodeSize(node)
        this.nodeSizeCache.set(node.id, size)
      }
    })
    
    const getNodeSize = (node) => {
      return this.nodeSizeCache.get(node.id) || { width: 130, height: 43 } // Node mặc định 130px (textarea width)
    }
    
    const nodes = this.g.selectAll('.node-group')
      .data(this.nodes, d => d.id)
    
    // Remove old nodes
    nodes.exit().remove()
    
    // Đưa node đang edit lên cuối cùng để hiển thị trên các node khác
    if (this.editingNode) {
      nodes.filter(d => d.id === this.editingNode).raise()
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
      .attr('stroke', d => d.data?.isRoot ? 'none' : '#cbd5e1')
      .attr('stroke-width', 2)
      .attr('fill', d => d.data?.isRoot ? '#3b82f6' : '#ffffff')
      .attr('filter', 'url(#shadow)')
    
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
      .attr('class', 'node-content-wrapper')
      .append('xhtml:textarea')
      .attr('class', 'node-textarea')
    
    // Add "Add Child" button (appears on hover) - đặt ra ngoài bên phải
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
    
    // Update all nodes
    const nodesUpdate = nodesEnter.merge(nodes)
    const that = this
    
    nodesUpdate
      .attr('transform', d => {
        const pos = positions.get(d.id)
        if (!pos) return 'translate(0, 0)'
        return `translate(${pos.x}, ${pos.y})`
      })
      .on('click', function(event, d) {
        // Kiểm tra xem click có phải từ textarea hoặc nút add-child không
        const target = event.target
        const isTextareaClick = target && (target.tagName === 'TEXTAREA' || target.classList?.contains('node-textarea'))
        const isAddChildClick = target && (target.classList?.contains('add-child-btn') || target.classList?.contains('add-child-text'))
        
        if (isTextareaClick || isAddChildClick) {
          // Click vào textarea hoặc nút -> không xử lý ở đây
          return
        }
        
        event.stopPropagation()
        
        // Đưa node lên trên ngay lập tức để nút không bị che bởi edge
        const nodeGroup = d3.select(this)
        nodeGroup.raise()
        
        // Click đơn giản để select node
        const textarea = nodeGroup.select('.node-textarea').node()
        if (textarea) {
          // Blur textarea nếu đang focus
          if (document.activeElement === textarea) {
            textarea.blur()
          }
          // Đảm bảo pointer events bị disable và tabindex = -1
          textarea.style.pointerEvents = 'none'
          textarea.setAttribute('tabindex', '-1')
        }
        
        that.selectNode(d.id)
        if (that.callbacks.onNodeClick) {
          that.callbacks.onNodeClick(d)
        }
      })
      .on('dblclick', function(event, d) {
        // Double click để edit - focus vào textarea nhưng không select text
        const target = event.target
        const isTextareaClick = target && (target.tagName === 'TEXTAREA' || target.classList?.contains('node-textarea'))
        
        if (isTextareaClick) {
          // Double click vào textarea -> không xử lý ở đây
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
        
        const textarea = nodeGroup.select('.node-textarea').node()
        if (textarea) {
          // Enable pointer events và set tabindex để có thể focus
          textarea.style.pointerEvents = 'auto'
          textarea.setAttribute('tabindex', '0')
          // Delay nhỏ để đảm bảo click event đã hoàn tất
          setTimeout(() => {
            textarea.focus()
            // Chỉ focus, không select text (đặt cursor ở cuối)
            const length = textarea.value.length
            textarea.setSelectionRange(length, length)
            if (that.callbacks.onNodeEditingStart) {
              that.callbacks.onNodeEditingStart(d.id)
            }
          }, 10)
        }
      })
    
    // Update add child button position - ra ngoài bên phải
    nodesUpdate.select('.add-child-btn')
      .attr('cx', d => getNodeSize(d).width + 20) // Ra ngoài bên phải, cách 20px
      .attr('cy', d => getNodeSize(d).height / 2)
      .on('click', (event, d) => {
        event.stopPropagation()
        if (this.callbacks.onNodeAdd) {
          this.callbacks.onNodeAdd(d.id)
        }
      })
    
    nodesUpdate.select('.add-child-text')
      .attr('x', d => getNodeSize(d).width + 20) // Ra ngoài bên phải, cách 20px
      .attr('y', d => getNodeSize(d).height / 2)
    
    // Update rectangle size and style
    // Node rect width = textarea width (130px - 300px)
    nodesUpdate.select('.node-rect')
      .attr('width', d => {
        // Nếu đang edit, lấy width từ textarea
        if (this.editingNode === d.id) {
          const nodeGroup = this.g.select(`[data-node-id="${d.id}"]`)
          const textarea = nodeGroup.select('.node-textarea').node()
          if (textarea) {
            const locked = parseFloat(textarea.getAttribute('data-locked-width'))
            if (locked) return locked
          }
        }
        // Tính toán width dựa trên nội dung (130px - 300px)
        const text = d.data?.label || ''
        if (text) {
          const estimatedWidth = this.estimateNodeWidth(d, 300)
          return Math.max(130, Math.min(estimatedWidth, 300))
        }
        // Mặc định 130px
        return 130
      })
      .attr('height', d => getNodeSize(d).height)
      .attr('fill', d => {
        if (this.selectedNode === d.id) return '#e0e7ff'
        return d.data?.isRoot ? '#3b82f6' : '#ffffff'
      })
      .attr('stroke', d => {
        if (this.selectedNode === d.id) return '#3b82f6'
        return d.data?.isRoot ? 'none' : '#cbd5e1'
      })
      .attr('stroke-width', 2) // Border luôn là 2px
    
    // Update textarea content and behaviors
    nodesUpdate.select('.node-text')
      .each((nodeData, idx, nodeArray) => {
        const fo = d3.select(nodeArray[idx])
        const text = nodeData.data?.label || ''
        const color = nodeData.data?.isRoot ? '#ffffff' : '#000000'
        const bgColor = nodeData.data?.isRoot ? '#3b82f6' : '#ffffff'
        
        const nodeSize = getNodeSize(nodeData)
        const minWidth = 130
        const maxWidth = 300
        
        // Nếu node đang được edit, lấy textarea width từ data attribute
        let currentTextareaWidth = minWidth
        if (this.editingNode === nodeData.id) {
          const textareaElement = fo.select('.node-textarea').node()
          if (textareaElement) {
            const locked = parseFloat(textareaElement.getAttribute('data-locked-width'))
            if (locked) {
              currentTextareaWidth = locked
            }
          }
        } else {
          // Nếu không edit, tính toán width dựa trên nội dung (130px - 300px)
          if (text) {
            const estimatedWidth = this.estimateNodeWidth(nodeData, maxWidth)
            currentTextareaWidth = Math.max(minWidth, Math.min(estimatedWidth, maxWidth))
          } else {
            currentTextareaWidth = minWidth
          }
        }
        
        // Update width và height của foreignObject
        // Lấy kích thước từ node-rect thực tế và trừ border để fit
        const nodeGroup = d3.select(nodeArray[idx].parentNode)
        const rect = nodeGroup.select('.node-rect')
        const rectWidth = parseFloat(rect.attr('width')) || currentTextareaWidth
        const rectHeight = parseFloat(rect.attr('height')) || nodeSize.height
        
        const borderOffset = 4 // 2px border mỗi bên (top/bottom và left/right)
        fo.attr('x', 2)
        fo.attr('y', 2)
        fo.attr('width', Math.max(0, rectWidth - borderOffset))
        fo.attr('height', Math.max(0, rectHeight - borderOffset))
        
        const wrapper = fo.select('.node-content-wrapper')
          .style('width', '100%') // Wrapper chiếm 100% foreignObject
          .style('height', '100%') // Wrapper chiếm 100% foreignObject
          .style('background', bgColor)
          .style('border-radius', '8px')
          .style('overflow', 'hidden') // Ẩn phần tràn ra ngoài
          .style('border', 'none') // Không có border để không đè lên border của node-rect
          .style('outline', 'none') // Không có outline
          .style('box-sizing', 'border-box') // Đảm bảo padding/border tính trong width/height
        
        const textarea = wrapper.select('.node-textarea')
          .attr('data-node-id', nodeData.id)
          .attr('placeholder', 'Nhập...')
          .attr('tabindex', '-1') // Ngăn textarea tự động focus khi tab hoặc click
          .style('width', '100%') // Textarea chiếm 100% wrapper
          .style('box-sizing', 'border-box') // Padding tính trong width
          .style('min-height', '43px') // Chiều cao 1 dòng
          .style('height', '43px') // Bắt đầu với chiều cao 1 dòng
          .style('padding', '8px 16px') // Padding như Lark
          .style('font-size', '19px')
          .style('color', color)
          .style('background', 'transparent')
          .style('border', 'none')
          .style('border-width', '0')
          .style('border-style', 'none')
          .style('resize', 'none')
          .style('outline', 'none')
          .style('box-shadow', 'none')
          .style('overflow', 'hidden')
          .style('box-sizing', 'border-box')
          .style('line-height', '1.4') // Line height tự nhiên cho đọc dễ
          .style('font-family', "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif")
          .style('caret-color', color)
          // Nếu node được đánh dấu giữ 1 dòng (ví dụ root chưa đạt maxWidth),
          // thì dùng 'nowrap' để đảm bảo không wrap lại sau khi render lại
          .style('white-space', nodeData.data?.keepSingleLine ? 'nowrap' : 'pre-wrap')
          .style('word-break', 'break-word') // Break word khi cần
          .style('overflow-wrap', 'break-word') // Wrap text khi quá dài
          .style('word-spacing', 'normal')
          .style('letter-spacing', 'normal')
          .style('overflow-x', 'hidden')
          .style('transition', 'none')
          .style('pointer-events', 'none') // Disable pointer events để ngăn click vào textarea khi chưa edit
          .property('value', text)
          .each(function() {
            // Sau khi set value, kiểm tra lại và đảm bảo height đúng
            const ta = this
            const singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px cho 1 dòng
            const textValue = (ta.value || '').trim()
            if (textValue.length === 0) {
              // Nếu rỗng, set chiều cao 1 dòng
              ta.style.height = `${singleLineHeight}px`
            } else {
              // Nếu có text, reset height và tính toán lại
              ta.style.height = '0px'
              ta.style.height = `${Math.max(ta.scrollHeight, singleLineHeight)}px`
            }
          })
          .on('focus', (event) => {
            event.stopPropagation()
            this.selectNode(nodeData.id)
            
            // Đưa node đang edit lên cuối cùng trong DOM để hiển thị trên các node khác
            // Sử dụng raise() của D3 để giữ nguyên transform
            const nodeGroup = d3.select(nodeArray[idx].parentNode)
            nodeGroup.raise()
            
            // Khi focus, khóa width hiện tại để tránh text nhảy dòng
            const fo = d3.select(nodeArray[idx])
            const rect = nodeGroup.select('.node-rect')
            
            // Lấy kích thước từ cache (đã được tính toán chính xác) hoặc từ rect
            const cachedSize = this.nodeSizeCache.get(nodeData.id)
            const currentRectWidth = cachedSize?.width || parseFloat(rect.attr('width')) || 130
            const currentRectHeight = cachedSize?.height || parseFloat(rect.attr('height')) || 43
            
            // Tính toán lại kích thước dựa trên nội dung hiện tại để đảm bảo chính xác
            const currentText = nodeData.data?.label || ''
            
            // PHÂN BIỆT 2 TRƯỜNG HỢP:
            // Trường hợp 1: Edit lần đầu (node trống hoặc không có nội dung)
            // Trường hợp 2: Sửa node đã có nội dung
            const isFirstEdit = !currentText.trim()
            
            let lockedWidth, lockedHeight
            
            if (isFirstEdit) {
              // TRƯỜNG HỢP 1: Edit lần đầu - cho phép co giãn tự do
              // Dùng kích thước mặc định, không lock
              lockedWidth = currentRectWidth
              lockedHeight = currentRectHeight
            } else {
              // TRƯỜNG HỢP 2: Sửa node đã có - GIỮ NGUYÊN kích thước hiện tại
              // KHÔNG tính lại để tránh node tự động tăng kích thước khi focus
              // Chỉ dùng kích thước hiện tại từ rect/cache
              lockedWidth = currentRectWidth
              lockedHeight = currentRectHeight
            }
            
            // Lưu vào cache với kích thước chính xác
            this.nodeSizeCache.set(nodeData.id, { width: lockedWidth, height: lockedHeight })
            
            // Cập nhật rect với kích thước chính xác
            rect.attr('width', lockedWidth)
            rect.attr('height', lockedHeight)
            
            // Lưu vào data attributes
            fo.attr('data-locked-width', lockedWidth)
            fo.attr('data-locked-height', lockedHeight)
            fo.attr('data-is-first-edit', isFirstEdit ? 'true' : 'false')
            event.target.setAttribute('data-locked-width', lockedWidth)
            event.target.setAttribute('data-locked-height', lockedHeight)
            event.target.setAttribute('data-is-first-edit', isFirstEdit ? 'true' : 'false')
            
            // Cập nhật foreignObject với kích thước đã lock
            const borderOffset = 4 // 2px border mỗi bên
            fo.attr('x', 2).attr('y', 2) // Offset để không đè lên border 2px
            fo.attr('width', Math.max(0, lockedWidth - borderOffset)) // Trừ border để không tràn
            fo.attr('height', Math.max(0, lockedHeight - borderOffset)) // Trừ border để không tràn
            
            // Áp dụng width và height đã lock cho textarea
            event.target.style.width = `${lockedWidth}px`
            event.target.style.height = `${lockedHeight}px`
            
            // Lưu text ban đầu khi focus để so sánh trong on('input')
            event.target.setAttribute('data-initial-text', currentText)
            
            // Wrapper chiếm 100% foreignObject
            const wrapper = fo.select('.node-content-wrapper')
            wrapper.style('width', '100%')
            wrapper.style('height', '100%')
            
            // Set editingNode TRƯỚC khi có thể có input event
            // Đảm bảo editingNode được set đồng bộ để watch không trigger
            if (this.callbacks.onNodeEditingStart) {
              this.callbacks.onNodeEditingStart(nodeData.id)
              // Đảm bảo editingNode được set trong renderer để render() không tính lại layout
              this.editingNode = nodeData.id
            }
          })
          .on('blur', (event) => {
            // Reset tabindex và disable pointer events khi blur để ngăn tự động focus
            if (event.target) {
              event.target.setAttribute('tabindex', '-1')
              event.target.style.pointerEvents = 'none'
              
              // Khi blur, tính toán lại kích thước dựa trên nội dung mới
              const finalValue = event.target.value || ''
              const nodeGroup = d3.select(nodeArray[idx].parentNode)
              const rect = nodeGroup.select('.node-rect')
              
              // XỬ LÝ CHUNG CHO CẢ TRƯỜNG HỢP CÓ VÀ KHÔNG CÓ NỘI DUNG
              const isEmpty = !finalValue || !finalValue.trim()
              const isRootNode = nodeData.data?.isRoot || nodeData.id === 'root'
              const maxWidth = 300
              const minWidth = 130
              const singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px
              
              let finalWidth, finalHeight
              
              if (isEmpty) {
                // Nội dung rỗng: reset về kích thước mặc định
                finalWidth = minWidth
                finalHeight = singleLineHeight
              } else {
                // Tính toán lại kích thước dựa trên nội dung mới (không dùng giá trị cũ)
                // Tạo temp node với nội dung mới để tính toán chính xác
                const tempNode = { ...nodeData, data: { ...nodeData.data, label: finalValue } }
                
                // Xóa fixedWidth/fixedHeight cũ để buộc tính toán lại
                if (tempNode.data) {
                  delete tempNode.data.fixedWidth
                  delete tempNode.data.fixedHeight
                }
                
                const calculatedWidth = this.estimateNodeWidth(tempNode)
                finalWidth = Math.max(calculatedWidth, minWidth)
                
                if (finalWidth < maxWidth) {
                  // Node chưa đạt maxWidth: giữ 1 dòng
                  finalHeight = singleLineHeight
                } else {
                  // Node đã đạt maxWidth: tính chiều cao dựa trên nội dung
                  const calculatedHeight = this.estimateNodeHeight(tempNode, finalWidth)
                  finalHeight = Math.max(calculatedHeight, singleLineHeight)
                }
              }
              
              // Cập nhật node-rect, foreignObject, textarea với kích thước cuối cùng
              // (Áp dụng cho cả trường hợp có và không có nội dung)
                
              rect.attr('width', finalWidth)
              rect.attr('height', finalHeight)
              
              // Cập nhật foreignObject khớp với rect
              const fo = d3.select(nodeArray[idx])
              const borderOffset = 4
              fo.attr('width', Math.max(0, finalWidth - borderOffset))
              fo.attr('height', Math.max(0, finalHeight - borderOffset))
              
              // Đọc lại keepSingleLine từ nodeData để biết có cần giữ 1 dòng không
              // Logic: nếu node chưa đạt maxWidth (300px) thì giữ 1 dòng
              const shouldKeepSingleLine = (finalWidth < maxWidth)
              
              // Giữ textarea tràn đúng như lúc edit (chiều cao/width giữ nguyên, white-space giữ nguyên)
              event.target.style.width = `${finalWidth}px`
              event.target.style.height = `${finalHeight}px`
              event.target.style.whiteSpace = shouldKeepSingleLine ? 'nowrap' : 'pre-wrap'
              
              // Cập nhật cache
              this.nodeSizeCache.set(nodeData.id, { width: finalWidth, height: finalHeight })
              
              // LƯU kích thước cố định và keepSingleLine vào data của node để các lần render sau hiển thị y hệt
              if (!nodeData.data) nodeData.data = {}
              
              // Đối với root node, KHÔNG lưu fixedWidth/fixedHeight để buộc tính toán lại mỗi lần render
              // Điều này đảm bảo root node luôn có kích thước đúng với nội dung mới
              // và layout được tính toán lại với kích thước mới khi xóa nội dung
              if (isRootNode) {
                // Xóa fixedWidth/fixedHeight để buộc tính toán lại dựa trên nội dung mới
                delete nodeData.data.fixedWidth
                delete nodeData.data.fixedHeight
                nodeData.data.keepSingleLine = shouldKeepSingleLine
              } else {
                // Đối với node khác, lưu fixedWidth/fixedHeight để giữ kích thước cố định
                if (isEmpty) {
                  // Nếu nội dung rỗng: xóa fixedWidth/fixedHeight để lần render sau tính toán lại từ đầu
                  delete nodeData.data.fixedWidth
                  delete nodeData.data.fixedHeight
                  nodeData.data.keepSingleLine = true
                } else {
                  // Nếu có nội dung: lưu kích thước cố định
                  nodeData.data.fixedWidth = finalWidth
                  nodeData.data.fixedHeight = finalHeight
                  nodeData.data.keepSingleLine = shouldKeepSingleLine
                }
              }
              
              // Cập nhật vị trí nút add-child
              nodeGroup.select('.add-child-btn').attr('cx', finalWidth + 20)
              nodeGroup.select('.add-child-btn').attr('cy', finalHeight / 2)
              nodeGroup.select('.add-child-text').attr('x', finalWidth + 20)
              nodeGroup.select('.add-child-text').attr('y', finalHeight / 2)
              
              // QUAN TRỌNG: Cập nhật node.data.label với giá trị cuối cùng TRƯỚC khi gọi callback
              // Điều này đảm bảo khi render lại, nó sẽ tính toán đúng kích thước
              if (!nodeData.data) nodeData.data = {}
              nodeData.data.label = finalValue
              
              // GIỮ locked width/height cho lần render sau, KHÔNG reset width/height textarea
              // để kích thước sau edit vẫn y hệt kích thước lúc đang edit
            }
            // Clear editingNode trong renderer
            this.editingNode = null
            
            if (this.callbacks.onNodeEditingEnd) {
              // Truyền nodeId vào callback để component biết node nào vừa kết thúc edit
              // Sau khi callback này được gọi, component sẽ trigger updateD3Renderer để tính toán lại layout
              this.callbacks.onNodeEditingEnd(nodeData.id)
            }
          })
          .on('mousedown', (event) => {
            // Ngăn click event bubble lên node group
            event.stopPropagation()
            // Enable pointer events và set tabindex để có thể focus khi click trực tiếp vào textarea
            if (event.target) {
              event.target.style.pointerEvents = 'auto'
              event.target.setAttribute('tabindex', '0')
            }
          })
          .on('click', (event) => {
            // Khi click vào textarea, select node và focus textarea
            event.stopPropagation()
            this.selectNode(nodeData.id)
            // Focus textarea khi click trực tiếp vào nó
            if (event.target && event.target.tagName === 'TEXTAREA') {
              event.target.style.pointerEvents = 'auto'
              event.target.setAttribute('tabindex', '0')
              event.target.focus()
              if (this.callbacks.onNodeEditingStart) {
                this.callbacks.onNodeEditingStart(nodeData.id)
              }
            }
          })
          .on('keydown', (event) => {
            event.stopPropagation()
          })
          .on('input', (event) => {
            event.stopPropagation()
            const newValue = event.target.value
            if (!nodeData.data) nodeData.data = {}
            nodeData.data.label = newValue
            
            const nodeGroup = d3.select(nodeArray[idx].parentNode)
            const fo = d3.select(nodeArray[idx])
            const wrapper = fo.select('.node-content-wrapper')
            const rect = nodeGroup.select('.node-rect')
            
            // Lấy width và height đã lock từ data attribute hoặc từ rect hiện tại
            const lockedWidth = parseFloat(event.target.getAttribute('data-locked-width')) || parseFloat(rect.attr('width')) || 130
            const lockedHeight = parseFloat(event.target.getAttribute('data-locked-height')) || parseFloat(rect.attr('height')) || 43
            
            // Kiểm tra xem có phải edit lần đầu không
            let isFirstEdit = event.target.getAttribute('data-is-first-edit') === 'true'
            
            // Đối với node root, luôn xử lý như TRƯỜNG HỢP 2 (không coi là edit lần đầu)
            // để đảm bảo root luôn giữ 1 dòng cho đến khi đạt maxWidth
            const isRootNode = nodeData.data?.isRoot || nodeData.id === 'root'
            if (isRootNode) {
              isFirstEdit = false
            }
            
            // Tính toán width mới dựa trên nội dung hiện tại (không wrap)
            const tempNode = { ...nodeData, data: { ...nodeData.data, label: newValue } }
            const newWidth = this.estimateNodeWidth(tempNode)
            const minWidth = 130 // Kích thước tối thiểu
            const singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px
            
            // XỬ LÝ ĐẶC BIỆT: Nếu nội dung rỗng
            const isEmpty = !newValue || !newValue.trim()
            
            // XỬ LÝ 2 TRƯỜNG HỢP:
            let currentWidth
            if (isEmpty && isFirstEdit) {
              // Nội dung rỗng VÀ edit lần đầu: reset về kích thước mặc định
              currentWidth = minWidth
              // Xóa fixedWidth/fixedHeight để lần render sau không bị ảnh hưởng
              if (nodeData.data) {
                delete nodeData.data.fixedWidth
                delete nodeData.data.fixedHeight
                nodeData.data.keepSingleLine = true
              }
            } else if (isEmpty && !isFirstEdit) {
              // Nội dung rỗng NHƯNG đã có nội dung trước đó: GIỮ kích thước khi đang edit
              // Chỉ reset về kích thước mặc định khi blur, không reset khi đang edit
              currentWidth = lockedWidth
            } else if (isFirstEdit) {
              // TRƯỜNG HỢP 1: Edit lần đầu - cho phép co giãn tự do
              // Không có ràng buộc tối thiểu, dùng kích thước mới
              currentWidth = newWidth
            } else if (isRootNode) {
              // TRƯỜNG HỢP ĐẶC BIỆT: Root node - GIỮ kích thước tối thiểu khi đang edit
              // Khi đang edit, root node chỉ được mở rộng nếu text dài hơn, nhưng KHÔNG co lại
              // Chỉ khi blur thì mới tính toán lại và cho phép co lại
              // Điều này đảm bảo root node không bị thu lại ngay khi xóa text, chỉ thu lại khi blur
              currentWidth = Math.max(newWidth, lockedWidth)
            } else {
              // TRƯỜNG HỢP 2: Sửa node đã có - GIỮ kích thước tối thiểu khi đang edit
              // Khi đang edit, node chỉ được mở rộng nếu text dài hơn, nhưng KHÔNG co lại
              // Chỉ khi blur thì mới tính toán lại và cho phép co lại
              // Điều này đảm bảo node không bị thu lại ngay khi xóa text, chỉ thu lại khi blur
              currentWidth = Math.max(newWidth, lockedWidth)
            }
            
            const maxWidth = 300
            const borderOffset = 4 // 2px border mỗi bên
            
            // QUAN TRỌNG: Để text không bị wrap sớm khi đang nhập ở dòng 1
            // - Nếu chưa đạt maxWidth: textarea width phải ít nhất bằng newWidth để text không wrap
            //   VÀ phải set white-space = 'nowrap' ngay từ đầu
            // - Nếu đã đạt maxWidth: textarea width = maxWidth và cho phép wrap
            
            // Set white-space TRƯỚC KHI set width để đảm bảo text không wrap
            if (currentWidth < maxWidth && !isEmpty) {
              // Chưa đạt maxWidth và có nội dung: KHÔNG cho wrap
              event.target.style.whiteSpace = 'nowrap'
            } else if (!isEmpty) {
              // Đã đạt maxWidth và có nội dung: cho phép wrap
              event.target.style.whiteSpace = 'pre-wrap'
            }
            
            let textareaWidthForInput
            if (currentWidth < maxWidth && !isEmpty) {
              // Chưa đạt maxWidth: textarea width PHẢI ít nhất bằng newWidth để text KHÔNG wrap
              // Không bị giới hạn bởi currentWidth, vì textarea cần đủ rộng để chứa text trên 1 dòng
              // Chỉ giới hạn bởi maxWidth
              textareaWidthForInput = Math.min(newWidth, maxWidth)
            } else if (!isEmpty) {
              // Đã đạt maxWidth: textarea width = maxWidth (đã wrap, giữ maxWidth)
              textareaWidthForInput = maxWidth
            } else {
              // Nội dung rỗng: dùng currentWidth
              textareaWidthForInput = currentWidth
            }
            
            // Set width cho textarea TRƯỚC khi tính height (dùng textareaWidthForInput để text không wrap)
            event.target.style.width = `${textareaWidthForInput}px`
            
            // Force reflow để đảm bảo textarea đã render với width mới
            void event.target.offsetHeight
            
            // ForeignObject và rect phải dùng currentWidth (kích thước thực tế của node)
            // KHÔNG dùng textareaWidthForInput để đảm bảo kích thước node không lớn hơn thực tế
            fo.attr('width', Math.max(0, currentWidth - borderOffset))
            
            // QUAN TRỌNG: Tính toán height mới
            // - Khi chưa đạt maxWidth: height luôn = singleLineHeight (vì white-space = nowrap)
            // - Khi đã đạt maxWidth: tính height dựa trên currentWidth (cho phép wrap)
            let newHeight
            if (currentWidth < maxWidth && !isEmpty) {
              // Chưa đạt maxWidth: height luôn là 1 dòng (vì white-space = nowrap)
              newHeight = singleLineHeight
            } else {
              // Đã đạt maxWidth hoặc rỗng: tính height dựa trên currentWidth
              newHeight = this.estimateNodeHeight(tempNode, currentWidth)
            }
            
            // XỬ LÝ HEIGHT THEO 2 TRƯỜNG HỢP (và ưu tiên giữ 1 dòng cho root):
            let currentHeight
            if (isEmpty && isFirstEdit) {
              // Nội dung rỗng VÀ edit lần đầu: reset về chiều cao mặc định (1 dòng)
              currentHeight = singleLineHeight
            } else if (isEmpty && !isFirstEdit) {
              // Nội dung rỗng NHƯNG đã có nội dung trước đó: GIỮ chiều cao khi đang edit
              // Chỉ reset về chiều cao mặc định khi blur, không reset khi đang edit
              currentHeight = lockedHeight
            } else if (isFirstEdit) {
              // TRƯỜNG HỢP 1: Edit lần đầu - cho phép co giãn tự do
              currentHeight = newHeight
            } else if (isRootNode) {
              // TRƯỜNG HỢP ĐẶC BIỆT: Root node - GIỮ chiều cao tối thiểu khi đang edit
              // Khi đang edit, root node chỉ được mở rộng nếu text dài hơn, nhưng KHÔNG co lại
              // Chỉ khi blur thì mới tính toán lại và cho phép co lại
              if (currentWidth < maxWidth) {
                // Root node chưa đạt maxWidth: giữ 1 dòng, nhưng KHÔNG nhỏ hơn lockedHeight
                currentHeight = Math.max(singleLineHeight, Math.max(newHeight, lockedHeight))
              } else {
                // Root node đã đạt maxWidth: GIỮ chiều cao tối thiểu = lockedHeight
                currentHeight = Math.max(newHeight, lockedHeight)
              }
            } else if (currentWidth < maxWidth) {
              // TRƯỜNG HỢP 2: Sửa node đã có + CHƯA đạt maxWidth
              // GIỮ chiều cao tối thiểu khi đang edit (không co lại)
              // Chỉ cho phép mở rộng nếu text dài hơn, nhưng không co lại cho đến khi blur
              currentHeight = Math.max(newHeight, lockedHeight)
            } else {
              // TRƯỜNG HỢP 2: Sửa node đã có + ĐÃ đạt maxWidth
              // GIỮ chiều cao tối thiểu khi đang edit (không co lại)
              // Chỉ cho phép mở rộng nếu text dài hơn, nhưng không co lại cho đến khi blur
              currentHeight = Math.max(newHeight, lockedHeight)
            }
            
            // Nếu đã nhập nội dung, đánh dấu không còn là edit lần đầu nữa
            if (isFirstEdit && newValue.trim()) {
              event.target.setAttribute('data-is-first-edit', 'false')
              fo.attr('data-is-first-edit', 'false')
            }
            
            // Tính toán height mới dựa trên nội dung với width hiện tại
            let finalHeight
            
            if (isEmpty && isFirstEdit) {
              // Nội dung rỗng VÀ edit lần đầu: giữ 1 dòng với kích thước mặc định
              event.target.style.whiteSpace = 'nowrap'
              if (!nodeData.data) nodeData.data = {}
              nodeData.data.keepSingleLine = true
              finalHeight = singleLineHeight
              event.target.style.height = `${finalHeight}px`
            } else if (isEmpty && !isFirstEdit) {
              // Nội dung rỗng NHƯNG đã có nội dung trước đó: GIỮ kích thước khi đang edit
              // Chỉ reset về kích thước mặc định khi blur, không reset khi đang edit
              event.target.style.whiteSpace = 'nowrap'
              if (!nodeData.data) nodeData.data = {}
              nodeData.data.keepSingleLine = true
              finalHeight = lockedHeight
              event.target.style.height = `${finalHeight}px`
            } else if (isRootNode && currentWidth < maxWidth) {
              // Root node chưa đạt maxWidth: giữ 1 dòng, GIỮ chiều cao tối thiểu khi đang edit
              event.target.style.whiteSpace = 'nowrap'
              if (!nodeData.data) nodeData.data = {}
              nodeData.data.keepSingleLine = true
              // GIỮ chiều cao tối thiểu = lockedHeight (không co lại khi đang edit)
              // Chỉ cho phép mở rộng nếu text dài hơn, nhưng không co lại cho đến khi blur
              finalHeight = Math.max(singleLineHeight, Math.max(currentHeight, lockedHeight))
              event.target.style.height = `${finalHeight}px`
            } else if (!isFirstEdit && currentWidth < maxWidth) {
              // TRƯỜNG HỢP 2 + node CHƯA đạt maxWidth (không phải root):
              // Giữ node đúng 1 dòng: không cho wrap, GIỮ chiều cao tối thiểu khi đang edit
              event.target.style.whiteSpace = 'nowrap'
              // Đánh dấu node giữ 1 dòng để khi render lại dùng 'nowrap'
              if (!nodeData.data) nodeData.data = {}
              nodeData.data.keepSingleLine = true
              // GIỮ chiều cao tối thiểu = lockedHeight (không co lại khi đang edit)
              // Chỉ cho phép mở rộng nếu text dài hơn, nhưng không co lại cho đến khi blur
              finalHeight = Math.max(singleLineHeight, Math.max(currentHeight, lockedHeight))
              event.target.style.height = `${finalHeight}px`
            } else if (isFirstEdit && currentWidth < maxWidth) {
              // TRƯỜNG HỢP 1: Edit lần đầu + CHƯA đạt maxWidth
              // Giữ 1 dòng: không cho wrap khi đang nhập ở dòng 1
              event.target.style.whiteSpace = 'nowrap'
              if (!nodeData.data) nodeData.data = {}
              nodeData.data.keepSingleLine = true
              finalHeight = Math.max(singleLineHeight, currentHeight)
              event.target.style.height = `${finalHeight}px`
            } else {
              // Đã đạt maxWidth: cho phép xuống dòng và tăng chiều cao
              event.target.style.whiteSpace = 'pre-wrap'
              if (!nodeData.data) nodeData.data = {}
              nodeData.data.keepSingleLine = false
              const adjustedHeight = this.adjustTextareaHeight(event.target, singleLineHeight)
              // Đảm bảo height không nhỏ hơn currentHeight đã tính
              finalHeight = Math.max(adjustedHeight, currentHeight)
            }
            
            // Cập nhật node-rect với width thực tế (currentWidth) và height thực tế (finalHeight)
            // Textarea và foreignObject vẫn giữ width = textareaWidthForInput để text không wrap sớm
            rect.attr('width', currentWidth)
            rect.attr('height', finalHeight)
            
            // Cập nhật data-locked-width và data-locked-height với kích thước THỰC TẾ của rect
            // để đảm bảo khi blur, có thể đọc lại đúng kích thước lúc đang edit
            event.target.setAttribute('data-locked-width', currentWidth)
            fo.attr('data-locked-width', currentWidth)
            event.target.setAttribute('data-locked-height', finalHeight)
            fo.attr('data-locked-height', finalHeight)
            
            // ForeignObject width đã được set ở trên = currentWidth - borderOffset (kích thước thực tế)
            // Cập nhật height
            fo.attr('height', Math.max(0, finalHeight - borderOffset))
            
            wrapper.style('height', '100%')
            wrapper.style('width', '100%')
            nodeGroup.select('.add-child-btn').attr('cx', currentWidth + 20) // Ra ngoài bên phải, cách 20px
            nodeGroup.select('.add-child-btn').attr('cy', finalHeight / 2)
            nodeGroup.select('.add-child-text').attr('x', currentWidth + 20) // Ra ngoài bên phải, cách 20px
            nodeGroup.select('.add-child-text').attr('y', finalHeight / 2)
            
            // Update cache với kích thước mới
            this.nodeSizeCache.set(nodeData.id, { width: currentWidth, height: finalHeight })
            
            if (this.callbacks.onNodeUpdate) {
              this.callbacks.onNodeUpdate(nodeData.id, newValue)
            }
          })
        
        const textareaNode = textarea.node()
        if (textareaNode) {
          // Chiều cao mặc định
          const singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px cho 1 dòng
          
          // Kiểm tra xem textarea có rỗng không
          const text = (textareaNode.value || '').trim()
          const isEmpty = text.length === 0
          
          // Tính toán chiều cao phù hợp
          let newHeight = this.adjustTextareaHeight(textareaNode, singleLineHeight)
          
          const currentSize = this.nodeSizeCache.get(nodeData.id) || { width: 130, height: singleLineHeight }
          
          // Update node-rect trước
          const nodeGroup = d3.select(nodeArray[idx].parentNode)
          const rect = nodeGroup.select('.node-rect')
          const rectWidth = parseFloat(rect.attr('width')) || currentSize.width
          rect.attr('height', newHeight)
          rect.attr('width', rectWidth)
          
          // Lấy kích thước thực tế từ rect sau khi update
          const actualRectWidth = parseFloat(rect.attr('width')) || rectWidth
          const actualRectHeight = parseFloat(rect.attr('height')) || newHeight
          
          // Update foreignObject với kích thước từ rect
          const borderOffset = 4 // 2px border mỗi bên
          fo.attr('x', 2).attr('y', 2) // Offset để không đè lên border 2px
          fo.attr('width', Math.max(0, actualRectWidth - borderOffset)) // Trừ border để không tràn
          fo.attr('height', Math.max(0, actualRectHeight - borderOffset)) // Trừ border để không tràn
          
          wrapper.style('height', '100%')
          wrapper.style('width', '100%')
          
          // Update cached size so subsequent measurements use latest height
          this.nodeSizeCache.set(nodeData.id, { ...currentSize, height: newHeight, width: actualRectWidth })
          nodeGroup.select('.add-child-btn').attr('cx', actualRectWidth + 20) // Ra ngoài bên phải, cách 20px
          nodeGroup.select('.add-child-btn').attr('cy', newHeight / 2)
          nodeGroup.select('.add-child-text').attr('x', actualRectWidth + 20) // Ra ngoài bên phải, cách 20px
          nodeGroup.select('.add-child-text').attr('y', newHeight / 2)
        }
      })
    
    // Add shadow filter
    const defs = this.svg.select('defs')
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
      
      feComponentTransfer.append('feFuncA')
        .attr('type', 'linear')
        .attr('slope', 0.3)
      
      filter.append('feMerge')
        .append('feMergeNode')
        .attr('in', 'SourceGraphic')
    }
  }
  
  estimateNodeWidth(node, maxWidth = 300) {
    const text = node.data?.label || ''
    const minWidth = 130 // Textarea width mặc định
    if (!text) return minWidth
    
    // Create a temporary element to measure text width accurately
    const tempDiv = document.createElement('div')
    tempDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 19px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 8px 16px;
      width: ${maxWidth}px;
      box-sizing: border-box;
    `
    tempDiv.textContent = text
    document.body.appendChild(tempDiv)
    
    // Force reflow để đảm bảo text đã được render
    void tempDiv.offsetHeight
    
    const lines = text.split('\n')
    let measuredWidth = 130
    
    // Measure each line to find the longest
    lines.forEach(line => {
      if (line.trim()) {
        const lineSpan = document.createElement('span')
        lineSpan.style.cssText = `
          position: absolute;
          visibility: hidden;
          font-size: 19px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          white-space: nowrap;
        `
        lineSpan.textContent = line
        document.body.appendChild(lineSpan)
        // Force reflow
        void lineSpan.offsetHeight
        measuredWidth = Math.max(measuredWidth, lineSpan.offsetWidth + 28)
        // Đảm bảo tối thiểu 130px
        measuredWidth = Math.max(measuredWidth, 130)
        document.body.removeChild(lineSpan)
      }
    })
    
    document.body.removeChild(tempDiv)
    
    // Clamp between min (130px) and max (300px)
    return Math.min(Math.max(measuredWidth, 130), 300)
  }
  
  estimateNodeHeight(node, nodeWidth = null) {
    const text = node.data?.label || ''
    // Chiều cao 1 dòng = font-size * line-height + padding
    // 19px * 1.4 + 16px (padding top/bottom) = ~43px
    const singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px cho 1 dòng
    if (!text) return singleLineHeight
    
    // Use provided width or estimate
    const width = nodeWidth || this.estimateNodeWidth(node)
    
    // Create a temporary element to measure text height accurately
    const tempDiv = document.createElement('div')
    tempDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 19px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.4;
      padding: 8px 16px;
      width: ${width}px;
      box-sizing: border-box;
    `
    tempDiv.textContent = text
    document.body.appendChild(tempDiv)
    
    // Force reflow để đảm bảo text đã được render và wrap đúng
    void tempDiv.offsetHeight
    
    // Lấy chiều cao thực tế
    const actualHeight = tempDiv.offsetHeight
    document.body.removeChild(tempDiv)
    
    // Trả về chiều cao thực tế, đảm bảo ít nhất bằng chiều cao 1 dòng
    return Math.max(actualHeight, singleLineHeight)
  }
  
  // Get both width and height together to avoid circular dependency
  estimateNodeSize(node) {
    // Nếu node có fixedWidth/fixedHeight (được set khi blur), ưu tiên dùng để
    // đảm bảo kích thước sau render giống hệt lúc đang edit
    // LƯU Ý: Root node không lưu fixedWidth/fixedHeight nên sẽ luôn tính toán lại dựa trên nội dung mới
    if (node.data && node.data.fixedWidth && node.data.fixedHeight) {
      return {
        width: node.data.fixedWidth,
        height: node.data.fixedHeight,
      }
    }
    
    const width = this.estimateNodeWidth(node)
    const height = this.estimateNodeHeight(node, width)
    return { width, height }
  }
  
  selectNode(nodeId) {
    this.selectedNode = nodeId
    
    // Update node styles
    this.g.selectAll('.node-group')
      .select('.node-rect')
      .attr('fill', d => {
        if (this.selectedNode === d.id) return '#e0e7ff'
        return d.data?.isRoot ? '#3b82f6' : '#ffffff'
      })
      .attr('stroke', d => {
        if (this.selectedNode === d.id) return '#3b82f6'
        return d.data?.isRoot ? 'none' : '#cbd5e1'
      })
      .attr('stroke-width', 2) // Border luôn là 2px
    
    // Hiển thị nút "thêm node con" cho node được select, ẩn các node khác
    const that = this
    this.g.selectAll('.node-group').each(function(nodeData) {
      const isSelected = that.selectedNode === nodeData.id
      d3.select(this).select('.add-child-btn').attr('opacity', isSelected ? 1 : 0)
      d3.select(this).select('.add-child-text').attr('opacity', isSelected ? 1 : 0)
    })
  }
  
  setEditingNode(nodeId) {
    this.editingNode = nodeId
    // TODO: Implement inline editing
  }
  
  fitView() {
    if (!this.positions || this.positions.size === 0) {
      return
    }
    
    // Tính bounds từ positions của các node (không bao gồm background rect)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    
    this.nodes.forEach(node => {
      const pos = this.positions.get(node.id)
      if (pos) {
        // Tính node size
        const size = this.estimateNodeSize(node)
        
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
    
    const fullWidth = this.options.width
    const fullHeight = this.options.height
    
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
    
    this.svg.transition()
      .duration(750)
      .call(
        this.zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(finalScale)
      )
  }
  
  destroy() {
    if (this.svg) {
      this.svg.remove()
    }
  }
}

