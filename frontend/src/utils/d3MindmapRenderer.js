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

import MindmapNodeEditor from '@/components/MindmapNodeEditor.vue'
import * as d3 from 'd3'
import { TextSelection } from 'prosemirror-state'
import { createApp } from 'vue'
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
    this.hoveredNode = null
    this.editingNode = null
    this.positions = new Map() // Store calculated positions
    this.nodeSizeCache = new Map() // Cache node sizes to avoid recalculating during editing
    this.vueApps = new Map() // Store Vue app instances for each node
    this.collapsedNodes = new Set() // Track collapsed nodes
    this.draggedNode = null // Track node being dragged
    this.dragTargetNode = null // Track node being hovered during drag
    this.dragGhost = null // Ghost/preview element during drag
    this.dragGhostEdgesGroup = null // Group chứa ghost edges
    this.dragOffset = { x: 0, y: 0 } // Offset của ghost so với con trỏ chuột
    this.dragStartTimeout = null // Timeout để delay drag start
    this.isDragStarting = false // Flag để track xem có đang trong quá trình delay drag không
    this.mouseUpOccurred = false // Flag để track xem mouseup đã xảy ra chưa (để phân biệt click và drag)
    this.dragStartPosition = null // Vị trí bắt đầu drag để kiểm tra xem có di chuyển nhiều không
    this.dragStartTime = null // Timestamp khi mousedown để kiểm tra xem có phải click nhanh không
    this.dragGhostEdges = null // Thông tin về ghost edges để cập nhật khi drag
    this.dragBranchGhost = null // Rect bao quanh nhánh ở vị trí cũ
    this.dragBranchNodeIds = [] // Danh sách các node ID trong nhánh để restore sau
    
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
      onNodeEditingEnd: null,
      onNodeHover: null,
      onNodeCollapse: null,
      onRenderComplete: null // Callback khi render hoàn tất
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
      .wheelDelta((event) => {
        // Điều chỉnh độ nhạy zoom - giá trị âm để zoom in khi scroll down
        return -event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.001)
      })
      .filter((event) => {
        // Xử lý wheel events - chỉ zoom khi có Ctrl/Meta
        if (event.type === 'wheel') {
          // Luôn yêu cầu Ctrl/Meta để zoom
          return !!(event.ctrlKey || event.metaKey)
        }
        
        // Cho phép middle mouse button để pan
        if (event.type === 'mousedown') {
          return event.button === 1 // Middle mouse button
        }
        
        // Chặn các events khác (không cho phép left-click drag)
        return false
      })
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform)
      })
    
    this.svg.call(this.zoom)
    
    // Ngăn browser zoom mặc định khi giữ Ctrl + wheel
    // Thêm listener ở capture phase để preventDefault sớm
    const svgNode = this.svg.node()
    if (svgNode) {
      svgNode.addEventListener('wheel', (event) => {
        if (event.ctrlKey || event.metaKey) {
          // Ngăn browser zoom mặc định
          event.preventDefault()
        }
      }, { passive: false, capture: true })
      
      // Xử lý click ra ngoài để deselect node và ẩn icon collapse khi hover
      // Dùng capture phase để bắt event trước khi nó đến node-group
      svgNode.addEventListener('click', (event) => {
        // Kiểm tra xem click có phải vào node, button, hoặc editor không
        const target = event.target
        const isNodeClick = target && (
          target.closest('.node-group') ||
          target.closest('.mindmap-node-editor') ||
          target.closest('.mindmap-editor-content') ||
          target.closest('.mindmap-editor-prose') ||
          target.classList?.contains('node-group') ||
          target.classList?.contains('add-child-btn') ||
          target.classList?.contains('add-child-text') ||
          target.classList?.contains('collapse-btn-number') ||
          target.classList?.contains('collapse-text-number') ||
          target.classList?.contains('collapse-btn-arrow') ||
          target.classList?.contains('collapse-arrow') ||
          target.closest('.add-child-btn') ||
          target.closest('.add-child-text') ||
          target.closest('.collapse-btn-number') ||
          target.closest('.collapse-text-number') ||
          target.closest('.collapse-btn-arrow') ||
          target.closest('.collapse-arrow')
        )
        
        // Nếu click ra ngoài node, deselect node và ẩn tất cả icon collapse
        if (!isNodeClick) {
          event.stopPropagation() // Ngăn event bubble lên
          
          // Deselect node TRƯỚC KHI ẩn buttons
          const hadSelectedNode = !!this.selectedNode
          if (this.selectedNode) {
            this.selectedNode = null // Set ngay để selectNode() biết là deselect
            this.selectNode(null)
          }
          
          this.hoveredNode = null
          
          // Ẩn tất cả buttons ngay lập tức (không có transition) cho TẤT CẢ nodes
          this.g.selectAll('.node-group').each(function() {
            const nodeGroup = d3.select(this)
            nodeGroup.select('.add-child-btn')
              .interrupt()
              .attr('opacity', 0)
              .style('pointer-events', 'none')
            nodeGroup.select('.add-child-text')
              .interrupt()
              .attr('opacity', 0)
              .style('pointer-events', 'none')
            nodeGroup.select('.collapse-btn-arrow')
              .interrupt()
              .attr('opacity', 0)
              .style('pointer-events', 'none')
            nodeGroup.select('.collapse-arrow')
              .interrupt()
              .attr('opacity', 0)
              .style('pointer-events', 'none')
          })
          
          // Gọi callback để update state
          if (this.callbacks.onNodeHover) {
            this.callbacks.onNodeHover(null, false)
          }
        }
      }, true) // Dùng capture phase để bắt event trước
    }
    
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

  // Helper function để lấy label một cách an toàn (luôn trả về string)
  getNodeLabel(node) {
    const label = node?.data?.label
    if (label == null) return ''
    return typeof label === 'string' ? label : String(label)
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

  // Mount Vue component vào container
  mountNodeEditor(nodeId, container, props = {}) {
    // Unmount component cũ nếu có
    this.unmountNodeEditor(nodeId)
    
    // Tạo Vue app instance
    const app = createApp(MindmapNodeEditor, {
      modelValue: props.value || '',
      placeholder: props.placeholder || 'Nhập...',
      color: props.color || '#1f2937',
      minHeight: props.minHeight || '43px',
      width: props.width || '100%',
      height: props.height || 'auto',
      // Pass event handlers as props - component sẽ gọi chúng khi emit events
      onInput: props.onInput || null,
      onFocus: props.onFocus || null,
      onBlur: props.onBlur || null,
      isRoot: props.isRoot || false,
    })
    
    // Mount vào container
    const instance = app.mount(container)
    
    // Lưu app instance và component instance
    this.vueApps.set(nodeId, { app, instance })
    
    return { app, instance }
  }

  // Unmount Vue component
  unmountNodeEditor(nodeId) {
    const entry = this.vueApps.get(nodeId)
    if (entry) {
      entry.app.unmount()
      this.vueApps.delete(nodeId)
    }
  }

  // Get editor instance từ Vue app
  getEditorInstance(nodeId) {
    const entry = this.vueApps.get(nodeId)
    if (entry && entry.instance) {
      // TipTap editor được lưu trong component instance
      return entry.instance.editor || null
    }
    return null
  }

  // Handler cho editor input event
  handleEditorInput(nodeId, value, foElement, nodeData) {
    // Tương tự như textarea on('input') handler - tự động mở rộng khi nhập text
    const nodeGroup = d3.select(foElement.parentNode)
    const rect = nodeGroup.select('.node-rect')
    
    // ⚠️ IMPORTANT: Lấy kích thước BAN ĐẦU (lúc focus) làm kích thước tối thiểu
    const initialSize = this.nodeSizeCache.get(`${nodeId}_initial`)
    const minNodeWidth = initialSize?.width || parseFloat(rect.attr('data-initial-width')) || 130
    const minNodeHeight = initialSize?.height || parseFloat(rect.attr('data-initial-height')) || 43
    
    // Lấy text trước đó để xác định có phải edit lần đầu không (TRƯỚC KHI cập nhật)
    const previousText = this.getNodeLabel(nodeData)
    const isFirstEdit = !previousText || !previousText.trim()
    
    // Cập nhật node data với giá trị mới
    if (!nodeData.data) nodeData.data = {}
    nodeData.data.label = value
    
    // Tính toán kích thước mới (tương tự logic textarea)
    const maxWidth = 400
    const minWidth = 130
    const singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px
    
    // ⚠️ FIX: Check isEmpty đúng cách, bao gồm cả HTML rỗng như <p></p> hoặc <p><br></p>
    let isEmpty = !value || !value.trim()
    if (!isEmpty && value.includes('<')) {
      // Nếu là HTML, parse và check text content
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = value
      const textContent = (tempDiv.textContent || tempDiv.innerText || '').trim()
      isEmpty = !textContent || textContent === ''
    }
    
    const isRootNode = nodeData.data?.isRoot || nodeId === 'root'
    
    console.log('[DEBUG handleEditorInput] Node:', nodeId, 'value:', value, 'isEmpty:', isEmpty)
    
    // Tính toán width mới dựa trên nội dung
    let newWidth = minWidth
    if (!isEmpty) {
      // Tạo temp node để tính toán kích thước
      const tempNode = { ...nodeData, data: { ...nodeData.data, label: value } }
      newWidth = this.estimateNodeWidth(tempNode, maxWidth)
      newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth))
    }
    
    // XỬ LÝ WIDTH: Node không co lại nhỏ hơn kích thước ban đầu
    let currentWidth
    if (isEmpty) {
      // ⚠️ FIX: Khi xóa hết nội dung:
      // - Nếu node có kích thước lớn hơn mặc định (minNodeWidth >= minWidth): giữ lại kích thước đã khóa
      // - Nếu node có kích thước nhỏ hơn mặc định (minNodeWidth < minWidth): dùng kích thước mặc định
      const currentRectWidth = parseFloat(rect.attr('width')) || minWidth
      console.log('[DEBUG handleEditorInput] Xóa hết nội dung - currentRectWidth:', currentRectWidth, 'minNodeWidth:', minNodeWidth, 'minWidth:', minWidth)
      
      // Nếu kích thước đã khóa >= kích thước mặc định: giữ lại kích thước đã khóa
      // Nếu kích thước đã khóa < kích thước mặc định: dùng kích thước mặc định
      currentWidth = Math.max(minNodeWidth, minWidth)
      console.log('[DEBUG handleEditorInput] Xóa hết nội dung, giãn ra kích thước:', currentWidth, '(minNodeWidth:', minNodeWidth, 'minWidth:', minWidth, ')')
      
      if (nodeData.data && isFirstEdit) {
        delete nodeData.data.fixedWidth
        delete nodeData.data.fixedHeight
        nodeData.data.keepSingleLine = true
      }
    } else {
      // Có nội dung: tính toán width dựa trên text
      const text = value || ''
      
      // Extract plain text từ HTML nếu cần
      let plainText = text
      if (text.includes('<')) {
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = text
        plainText = (tempDiv.textContent || tempDiv.innerText || '').trim()
      }
      
      if (!plainText || !plainText.trim()) {
        // Không có text: dùng minWidth hoặc lockedWidth
        currentWidth = Math.max(newWidth, lockedWidth || minWidth)
      } else {
        // Parse HTML để tách riêng title (paragraph) và description (blockquote)
        let titleText = ''
        let descriptionText = ''
        
        if (text.includes('<')) {
          const tempDiv = document.createElement('div')
          tempDiv.innerHTML = text
          
          // Lấy tất cả paragraph không trong blockquote (title)
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
          
          // Lấy tất cả text trong blockquote (description)
          const blockquotes = tempDiv.querySelectorAll('blockquote')
          blockquotes.forEach(blockquote => {
            const blockquoteText = (blockquote.textContent || blockquote.innerText || '').trim()
            if (blockquoteText) {
              descriptionText += (descriptionText ? '\n' : '') + blockquoteText
            }
          })
        } else {
          // Plain text: coi như title
          titleText = plainText
        }
        
        // Đo width của title (font-size 19px)
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
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              `
              lineSpan.textContent = line.trim()
              document.body.appendChild(lineSpan)
              void lineSpan.offsetHeight
              titleWidth = Math.max(titleWidth, lineSpan.offsetWidth)
              document.body.removeChild(lineSpan)
            }
          })
        }
        
        // Đo width của description (font-size 16px)
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
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              `
              lineSpan.textContent = line.trim()
              document.body.appendChild(lineSpan)
              void lineSpan.offsetHeight
              descriptionWidth = Math.max(descriptionWidth, lineSpan.offsetWidth)
              document.body.removeChild(lineSpan)
            }
          })
        }
        
        // Lấy width lớn nhất giữa title và description
        const maxTextWidth = Math.max(titleWidth, descriptionWidth)
        // Padding: 16px mỗi bên = 32px, border: 2px mỗi bên = 4px
        const requiredWidth = maxTextWidth + 32 + 4
        
        // ⚠️ IMPORTANT: Node không bao giờ co lại nhỏ hơn kích thước ban đầu
        if (requiredWidth < maxWidth) {
          // Text chưa đạt maxWidth: mở rộng node đến width cần thiết
          // Nhưng KHÔNG nhỏ hơn kích thước ban đầu
          currentWidth = Math.max(minNodeWidth, Math.min(requiredWidth, maxWidth))
        } else {
          // Text đã đạt hoặc vượt maxWidth: node width = maxWidth, text sẽ wrap
          currentWidth = maxWidth
        }
      }
    }
    
    // Cập nhật width trước để editor có width đúng khi đo height
    rect.attr('width', currentWidth)
    const fo = d3.select(foElement)
    const borderOffset = 4 // 2px border mỗi bên
    const foWidth = Math.max(0, currentWidth - borderOffset)
    fo.attr('x', 2)
    fo.attr('y', 2)
    fo.attr('width', foWidth)
    
    // Đảm bảo editor content có width đúng NGAY LẬP TỨC để tránh text wrap sớm
    const editorInstance = this.getEditorInstance(nodeId)
    if (editorInstance && editorInstance.view && editorInstance.view.dom) {
      const editorDOM = editorInstance.view.dom
      const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
      
      if (editorContent) {
        // Set box-sizing để padding được tính đúng
        editorContent.style.boxSizing = 'border-box'
        // Set width ngay lập tức để tránh text wrap sớm
        editorContent.style.width = `${foWidth}px`
        
        // Xác định có cần wrap không dựa trên currentWidth
        // Nếu currentWidth < maxWidth: text chưa đạt max-width, không wrap
        // Nếu currentWidth >= maxWidth: text đã đạt max-width, cho phép wrap
        const willWrap = currentWidth >= maxWidth
        
        // Set white-space dựa trên việc có wrap hay không
        if (willWrap) {
          editorContent.style.whiteSpace = 'pre-wrap' // Cho phép wrap
        } else {
          editorContent.style.whiteSpace = 'nowrap' // Không wrap - text trên 1 dòng
        }
        
        // Force reflow để đảm bảo width và white-space đã được áp dụng
        void editorContent.offsetWidth
      }
    }
    
    // Tính toán height mới dựa trên width và nội dung - tự động mở rộng để hiển thị đủ nội dung
    let currentHeight
    if (isEmpty) {
      // ⚠️ FIX: Khi xóa hết nội dung:
      // - Nếu node có kích thước lớn hơn mặc định (minNodeHeight >= singleLineHeight): giữ lại kích thước đã khóa
      // - Nếu node có kích thước nhỏ hơn mặc định (minNodeHeight < singleLineHeight): dùng kích thước mặc định
      // Điều này đảm bảo node giữ lại kích thước đã khóa nếu lớn hơn mặc định, hoặc dùng mặc định nếu nhỏ hơn
      currentHeight = Math.max(minNodeHeight, singleLineHeight)
      console.log('[DEBUG handleEditorInput] Xóa hết nội dung, height giãn ra kích thước:', currentHeight, '(minNodeHeight:', minNodeHeight, 'singleLineHeight:', singleLineHeight, ')')
    } else {
      // ⚠️ FIX: Đo chiều cao trực tiếp từ TipTap editor DOM
      const editorInstance = this.getEditorInstance(nodeId)
      let measuredHeight = singleLineHeight
      
      if (editorInstance && editorInstance.view && editorInstance.view.dom) {
        const editorDOM = editorInstance.view.dom
        const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
        
        if (editorContent) {
          // ⚠️ CRITICAL FIX: Set styles TRƯỚC KHI đo
          const foWidth = currentWidth - borderOffset
          editorContent.style.cssText = `
            box-sizing: border-box;
            width: ${foWidth}px;
            height: auto;
            min-height: ${singleLineHeight}px;
            max-height: none;
            overflow: visible;
            padding: 8px 16px;
            white-space: ${currentWidth >= maxWidth ? 'pre-wrap' : 'nowrap'};
          `
          
          // Force reflow NHIỀU LẦN để đảm bảo DOM đã cập nhật
          void editorContent.offsetWidth
          void editorContent.offsetHeight
          void editorContent.scrollHeight
          
          // ⚠️ FIX: Lấy offsetHeight thay vì scrollHeight để tránh thừa khoảng trắng
          // offsetHeight = actual rendered height (không bao gồm overflow)
          // scrollHeight = total content height (có thể lớn hơn cần thiết)
          const contentHeight = Math.max(
            editorContent.offsetHeight || 0, // Dùng offsetHeight thay vì scrollHeight
            singleLineHeight
          )
          
          measuredHeight = contentHeight
        }
      }
      
      // ⚠️ IMPORTANT: Height không nhỏ hơn kích thước ban đầu
      currentHeight = Math.max(measuredHeight, minNodeHeight)
    }
    
    // Cập nhật height của node-rect và foreignObject
    rect.attr('height', currentHeight)
    fo.attr('height', Math.max(0, currentHeight - borderOffset))
    
    // ⚠️ FIX: Cập nhật wrapper và editor container để tránh khoảng trắng thừa
    const wrapper = fo.select('.node-content-wrapper')
    wrapper.style('width', '100%')
    wrapper.style('height', '100%')
    wrapper.style('overflow', 'hidden') // Hidden để không bị tràn
    
    const editorContainer = fo.select('.node-editor-container')
    if (editorContainer.node()) {
      editorContainer.style('width', '100%')
      editorContainer.style('height', '100%')
      editorContainer.style('overflow', 'hidden') // Hidden để không bị tràn
    }
    
    // Cập nhật vị trí nút add-child
    nodeGroup.select('.add-child-btn').attr('cx', currentWidth + 20)
    nodeGroup.select('.add-child-btn').attr('cy', currentHeight / 2)
    nodeGroup.select('.add-child-text').attr('x', currentWidth + 20)
    nodeGroup.select('.add-child-text').attr('y', currentHeight / 2)
    
    // Cập nhật cache với kích thước mới (để các lần tính toán sau dùng)
    this.nodeSizeCache.set(nodeId, { width: currentWidth, height: currentHeight })
    
    // Trigger callback để cập nhật dữ liệu
    if (this.callbacks.onNodeUpdate) {
      this.callbacks.onNodeUpdate(nodeId, { label: value })
    }
  }

  // Handler cho editor focus event
  handleEditorFocus(nodeId, foElement, nodeData) {
    this.selectNode(nodeId)
    
    const nodeGroup = d3.select(foElement.parentNode)
    nodeGroup.raise()
    
    const fo = d3.select(foElement)
    const rect = nodeGroup.select('.node-rect')
    
    const currentText = this.getNodeLabel(nodeData)
    const isFirstEdit = !currentText || !currentText.trim()
    
    // ⚠️ IMPORTANT: Lưu kích thước HIỆN TẠI của node khi focus
    // Đây sẽ là kích thước TỐI THIỂU trong suốt quá trình edit
    const currentWidth = parseFloat(rect.attr('width')) || 130
    const currentHeight = parseFloat(rect.attr('height')) || 43
    
    let lockedWidth, lockedHeight
    
    if (isFirstEdit || !currentText || currentText.trim() === 'Nhánh mới') {
      // Lần đầu hoặc text mặc định: dùng kích thước tối thiểu
      lockedWidth = 130
      lockedHeight = 43
    } else {
      // ⚠️ CHANGED: Luôn giữ kích thước hiện tại làm tối thiểu
      // Node sẽ không co lại nhỏ hơn kích thước này khi xóa nội dung
      lockedWidth = currentWidth
      lockedHeight = currentHeight
    }
    
    // ⚠️ NEW: Lưu kích thước ban đầu vào data attribute để sử dụng trong handleEditorInput
    rect.attr('data-initial-width', lockedWidth)
    rect.attr('data-initial-height', lockedHeight)
    
    // Lưu vào cache với key đặc biệt để phân biệt
    this.nodeSizeCache.set(`${nodeId}_initial`, { width: lockedWidth, height: lockedHeight })
    this.nodeSizeCache.set(nodeId, { width: lockedWidth, height: lockedHeight })
    
    rect.attr('width', lockedWidth)
    rect.attr('height', lockedHeight)
    
    const borderOffset = 4
    fo.attr('x', 2).attr('y', 2)
    fo.attr('width', Math.max(0, lockedWidth - borderOffset))
    fo.attr('height', Math.max(0, lockedHeight - borderOffset))
    
    // ⚠️ FIX: Set wrapper và editor container để tránh khoảng trắng thừa
    const wrapper = fo.select('.node-content-wrapper')
    if (wrapper.node()) {
      wrapper.style('width', '100%')
      wrapper.style('height', '100%')
      wrapper.style('overflow', 'hidden') // Hidden để không bị tràn
    }
    
    const editorContainer = fo.select('.node-editor-container')
    if (editorContainer.node()) {
      editorContainer.style('pointer-events', 'auto')
      editorContainer.style('width', '100%')
      editorContainer.style('height', '100%')
      editorContainer.style('overflow', 'hidden') // Hidden để không bị tràn
    }
    
    // ⚠️ FIX: Đo lại height từ DOM ngay sau khi focus để đảm bảo chính xác
    // Đợi một chút để editor đã render xong
    requestAnimationFrame(() => {
      const editor = this.getEditorInstance(nodeId)
      if (editor && editor.view && editor.view.dom) {
        const editorDOM = editor.view.dom
        const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
        
        if (editorContent) {
          const foWidth = lockedWidth - borderOffset
          editorContent.style.cssText = `
            box-sizing: border-box;
            width: ${foWidth}px;
            height: auto;
            min-height: 43px;
            max-height: none;
            overflow: visible;
            padding: 8px 16px;
            white-space: ${lockedWidth >= 400 ? 'pre-wrap' : 'nowrap'};
          `
          
          // Force reflow
          void editorContent.offsetWidth
          void editorContent.offsetHeight
          
          // Đo height thực tế từ DOM
          const actualHeight = Math.max(
            editorContent.offsetHeight || 0,
            43 // singleLineHeight
          )
          
          // Cập nhật height nếu khác
          if (Math.abs(actualHeight - lockedHeight) > 1) {
            rect.attr('height', actualHeight)
            fo.attr('height', Math.max(0, actualHeight - borderOffset))
            this.nodeSizeCache.set(nodeId, { width: lockedWidth, height: actualHeight })
            
            // Cập nhật vị trí nút add-child
            nodeGroup.select('.add-child-btn').attr('cy', actualHeight / 2)
            nodeGroup.select('.add-child-text').attr('y', actualHeight / 2)
          }
        }
      }
    })
    
    // Add focused class
    const editorInstance = this.getEditorInstance(nodeId)
    if (editorInstance && editorInstance.view && editorInstance.view.dom) {
      const editorDOM = editorInstance.view.dom
      editorDOM.classList.add('ProseMirror-focused')
      
      // ⚠️ NEW: Set editor DOM overflow visible
      const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
      if (editorContent) {
        editorContent.style.overflow = 'visible'
        editorContent.style.height = 'auto'
        editorContent.style.minHeight = '43px'
        editorContent.style.maxHeight = 'none'
      }
    }
    
    // Select all nếu là text mặc định
    const isDefaultText = currentText === 'Nhánh mới' || (isFirstEdit && currentText)
    if (isDefaultText) {
      setTimeout(() => {
        const editorInstance = this.getEditorInstance(nodeId)
        if (editorInstance && editorInstance.view) {
          const { state } = editorInstance.view
          const { doc } = state
          
          if (doc.content.size > 0) {
            const selection = TextSelection.create(doc, 0, doc.content.size)
            const tr = state.tr.setSelection(selection)
            editorInstance.view.dispatch(tr)
          }
        }
      }, 50)
    }
    
    if (this.callbacks.onNodeEditingStart) {
      this.callbacks.onNodeEditingStart(nodeId)
      this.editingNode = nodeId
    }
  }

  // Handler cho editor blur event
  handleEditorBlur(nodeId, foElement, nodeData) {
    // ⚠️ IMPORTANT: Xóa cache kích thước ban đầu khi blur
    this.nodeSizeCache.delete(`${nodeId}_initial`)
    
    // Tương tự textarea on('blur') handler
    const editor = this.getEditorInstance(nodeId)
    // Lưu HTML để giữ formatting (bold, italic, etc.)
    let finalValue = editor ? editor.getHTML() : (nodeData.data?.label || '')
    
    const nodeGroup = d3.select(foElement.parentNode)
    const rect = nodeGroup.select('.node-rect')
    
    // Check isEmpty: extract plain text từ HTML nếu cần
    let isEmpty = !finalValue || !finalValue.trim()
    if (!isEmpty && finalValue.includes('<')) {
      // Nếu là HTML, extract plain text để check empty
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = finalValue
      const plainText = (tempDiv.textContent || tempDiv.innerText || '').trim()
      isEmpty = !plainText || plainText === ''
    }
    const isRootNode = nodeData.data?.isRoot || nodeId === 'root'
    const maxWidth = 400
    const minWidth = 130
    const singleLineHeight = Math.ceil(19 * 1.4) + 16
    
    let finalWidth, finalHeight
    
    if (isEmpty) {
      // ⚠️ FIX: Nếu node root rỗng, tự động điền "Sơ đồ"
      if (isRootNode) {
        const defaultText = 'Sơ đồ'
        const defaultHtml = `<p>${defaultText}</p>`
        // Cập nhật editor với text mặc định
        if (editor) {
          editor.commands.setContent(defaultHtml)
        }
        // Cập nhật finalValue để đảm bảo được lưu đúng
        finalValue = defaultHtml
        // Cập nhật nodeData với text mặc định
        if (!nodeData.data) nodeData.data = {}
        nodeData.data.label = defaultHtml
        
        // Tính toán lại kích thước dựa trên "Sơ đồ"
        const tempNode = { ...nodeData, data: { ...nodeData.data, label: `<p>${defaultText}</p>` } }
        if (tempNode.data) {
          delete tempNode.data.fixedWidth
          delete tempNode.data.fixedHeight
        }
        
        // Tính toán width và height dựa trên "Sơ đồ"
        const absoluteMinWidth = 50
        let measuredWidth = absoluteMinWidth
        let measuredHeight = singleLineHeight
        
        // Đo width của "Sơ đồ"
        const textSpan = document.createElement('span')
        textSpan.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: nowrap;
          font-size: 19px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `
        textSpan.textContent = defaultText
        document.body.appendChild(textSpan)
        void textSpan.offsetHeight
        const textWidth = textSpan.offsetWidth
        document.body.removeChild(textSpan)
        
        // Padding: 16px mỗi bên = 32px, border: 2px mỗi bên = 4px
        const requiredWidth = textWidth + 32 + 4
        measuredWidth = Math.max(absoluteMinWidth, Math.min(requiredWidth, maxWidth))
        
        finalWidth = measuredWidth
        finalHeight = measuredHeight
        
        // ⚠️ CRITICAL: Set white-space ngay sau khi điền "Sơ đồ" để đảm bảo text không xuống dòng
        // Đợi editor cập nhật xong trước khi set white-space
        if (editor && editor.view && editor.view.dom) {
          requestAnimationFrame(() => {
            const editorDOM = editor.view.dom
            const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
            if (editorContent) {
              // Với "Sơ đồ", width sẽ < maxWidth, nên dùng nowrap
              editorContent.style.setProperty('white-space', 'nowrap', 'important')
              editorContent.style.setProperty('overflow', 'hidden', 'important')
              editorContent.style.setProperty('width', `${finalWidth - 4}px`, 'important') // borderOffset = 4
            }
          })
        }
      } else {
        // Node không phải root: dùng kích thước mặc định
        finalWidth = minWidth
        finalHeight = singleLineHeight
      }
    } else {
      const tempNode = { ...nodeData, data: { ...nodeData.data, label: finalValue } }
      if (tempNode.data) {
        delete tempNode.data.fixedWidth
        delete tempNode.data.fixedHeight
      }
      
      // ⚠️ CRITICAL: Đo width và height chính xác từ DOM để fit với nội dung
      const absoluteMinWidth = 50 // Giá trị tối thiểu để không vỡ layout (giảm từ 80px để fit tốt hơn với nội dung ngắn)
      let measuredWidth = absoluteMinWidth
      let measuredHeight = singleLineHeight
      let hasMeasuredFromDOM = false // Flag để đánh dấu đã đo được width từ DOM chưa
      let hasMeasuredHeightFromDOM = false // Flag để đánh dấu đã đo được height từ DOM chưa
      
      console.log('[DEBUG handleEditorBlur] Node:', nodeId, 'finalValue:', finalValue)
      
      if (editor && editor.view && editor.view.dom) {
        const editorDOM = editor.view.dom
        const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
        if (editorContent) {
          // ⚠️ STEP 1: Đo width chính xác từ nội dung thực tế
          // Parse HTML để lấy text và đo width của từng dòng
          let titleText = ''
          let descriptionText = ''
          
          console.log('[DEBUG handleEditorBlur] Bắt đầu parse HTML, finalValue:', finalValue)
          
          if (finalValue.includes('<')) {
            const tempDiv = document.createElement('div')
            tempDiv.innerHTML = finalValue
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
            blockquotes.forEach(bq => {
              const bqText = (bq.textContent || bq.innerText || '').trim()
              if (bqText) {
                descriptionText += (descriptionText ? '\n' : '') + bqText
              }
            })
            // Nếu không có paragraph, lấy text trực tiếp từ div
            if (!titleText && !descriptionText) {
              titleText = (tempDiv.textContent || tempDiv.innerText || '').trim()
            }
          } else {
            titleText = finalValue.trim()
          }
          
          console.log('[DEBUG handleEditorBlur] Sau khi parse - titleText:', titleText, 'descriptionText:', descriptionText)
          
          // Đo width của title (font-size 19px)
          let maxTitleWidth = 0
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
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                `
                lineSpan.textContent = line.trim()
                document.body.appendChild(lineSpan)
                void lineSpan.offsetHeight
                maxTitleWidth = Math.max(maxTitleWidth, lineSpan.offsetWidth)
                document.body.removeChild(lineSpan)
              }
            })
          }
          
          // Đo width của description (font-size 16px)
          let maxDescWidth = 0
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
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                `
                lineSpan.textContent = line.trim()
                document.body.appendChild(lineSpan)
                void lineSpan.offsetHeight
                maxDescWidth = Math.max(maxDescWidth, lineSpan.offsetWidth)
                document.body.removeChild(lineSpan)
              }
            })
          }
          
          // Lấy width lớn nhất giữa title và description
          const maxTextWidth = Math.max(maxTitleWidth, maxDescWidth)
          
          console.log('[DEBUG handleEditorBlur] Đo width - maxTitleWidth:', maxTitleWidth, 'maxDescWidth:', maxDescWidth, 'maxTextWidth:', maxTextWidth)
          
          // Nếu không có text, dùng absoluteMinWidth
          if (maxTextWidth === 0) {
            measuredWidth = absoluteMinWidth
            console.log('[DEBUG handleEditorBlur] Không có text, dùng absoluteMinWidth:', absoluteMinWidth)
          } else {
            // Padding: 16px mỗi bên = 32px, border: 2px mỗi bên = 4px
            const requiredWidth = maxTextWidth + 32 + 4
            // Cho phép node thu nhỏ xuống fit với nội dung
            // Chỉ clamp với absoluteMinWidth nếu requiredWidth quá nhỏ (< 40px)
            // Nếu requiredWidth >= 40px thì dùng trực tiếp để fit chính xác với nội dung
            const minRequiredWidth = 40 // Giá trị tối thiểu hợp lý cho requiredWidth
            if (requiredWidth < minRequiredWidth) {
              measuredWidth = Math.max(requiredWidth, absoluteMinWidth)
            } else {
              measuredWidth = requiredWidth // Dùng trực tiếp để fit chính xác
            }
            console.log('[DEBUG handleEditorBlur] Tính toán width - maxTextWidth:', maxTextWidth, 'requiredWidth:', requiredWidth, 'measuredWidth (trước clamp):', measuredWidth)
          }
          
          // Clamp width giữa absoluteMinWidth và maxWidth
          measuredWidth = Math.min(measuredWidth, maxWidth)
          console.log('[DEBUG handleEditorBlur] measuredWidth (sau clamp):', measuredWidth, 'maxWidth:', maxWidth)
          
          // Đánh dấu đã đo được từ DOM
          hasMeasuredFromDOM = true
          
          // ⚠️ STEP 2: Set width chính xác và đo height
          const borderOffset = 4
          const foWidth = measuredWidth - borderOffset
          
          // Set styles để đo height chính xác
          editorContent.style.boxSizing = 'border-box'
          editorContent.style.setProperty('width', `${foWidth}px`, 'important')
          editorContent.style.height = 'auto'
          editorContent.style.minHeight = '0'
          editorContent.style.maxHeight = 'none'
          editorContent.style.padding = '8px 16px'
          editorContent.style.margin = '0'
          
          // Xác định white-space dựa trên width
          // Nếu width < maxWidth: dùng nowrap để text không xuống dòng
          // Nếu width >= maxWidth: dùng pre-wrap để text có thể wrap
          const whiteSpaceValue = (measuredWidth >= maxWidth) ? 'pre-wrap' : 'nowrap'
          editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
          // ⚠️ CRITICAL: Set white-space cho tất cả các p bên trong để đảm bảo text không xuống dòng
          const paragraphs = editorContent.querySelectorAll('p')
          paragraphs.forEach(p => {
            p.style.setProperty('white-space', whiteSpaceValue, 'important')
          })
          if (measuredWidth >= maxWidth) {
            editorContent.style.setProperty('word-wrap', 'break-word', 'important')
            editorContent.style.setProperty('overflow-wrap', 'break-word', 'important')
            editorContent.style.setProperty('overflow', 'visible', 'important')
          } else {
            editorContent.style.setProperty('overflow', 'hidden', 'important')
          }
          
          // Force reflow để đảm bảo width và white-space đã được set
          void editorContent.offsetWidth
          void editorContent.offsetHeight
          
          // ⚠️ STEP 3: Đo height chính xác từ offsetHeight
          measuredHeight = Math.max(
            editorContent.offsetHeight || 0,
            singleLineHeight
          )
          // Đánh dấu đã đo được height từ DOM
          hasMeasuredHeightFromDOM = true
          console.log('[DEBUG handleEditorBlur] Đo height - editorContent.offsetHeight:', editorContent.offsetHeight, 'measuredHeight:', measuredHeight, 'singleLineHeight:', singleLineHeight)
        }
        
        // Remove focused class
        editorDOM.classList.remove('ProseMirror-focused')
      }
      
      // ⚠️ FIX: Fallback CHỈ KHI không đo được từ DOM (hasMeasuredFromDOM === false)
      if (!hasMeasuredFromDOM && finalValue && finalValue.trim()) {
        console.log('[DEBUG handleEditorBlur] Fallback - KHÔNG đo được từ DOM, dùng estimateNodeWidth')
        const calculatedWidth = this.estimateNodeWidth(tempNode, maxWidth)
        // Cho phép thu nhỏ xuống absoluteMinWidth
        measuredWidth = Math.max(calculatedWidth, absoluteMinWidth)
        measuredWidth = Math.min(measuredWidth, maxWidth)
        console.log('[DEBUG handleEditorBlur] Fallback - calculatedWidth:', calculatedWidth, 'measuredWidth:', measuredWidth)
      } else if (hasMeasuredFromDOM) {
        console.log('[DEBUG handleEditorBlur] Đã đo được từ DOM, KHÔNG dùng fallback. measuredWidth:', measuredWidth)
      }
      // ⚠️ FIX: Fallback height CHỈ KHI không đo được từ DOM (hasMeasuredHeightFromDOM === false)
      if (!hasMeasuredHeightFromDOM && finalValue && finalValue.trim()) {
        console.log('[DEBUG handleEditorBlur] Fallback height - KHÔNG đo được từ DOM, dùng estimateNodeHeight')
        const calculatedHeight = this.estimateNodeHeight(tempNode, measuredWidth)
        measuredHeight = Math.max(calculatedHeight, singleLineHeight)
        console.log('[DEBUG handleEditorBlur] Fallback height - calculatedHeight:', calculatedHeight, 'measuredHeight:', measuredHeight)
      } else if (hasMeasuredHeightFromDOM) {
        console.log('[DEBUG handleEditorBlur] Đã đo được height từ DOM, KHÔNG dùng fallback. measuredHeight:', measuredHeight)
      }
      
      finalWidth = measuredWidth
      finalHeight = measuredHeight
      
      console.log('[DEBUG handleEditorBlur] KẾT QUẢ CUỐI CÙNG - finalWidth:', finalWidth, 'finalHeight:', finalHeight, 'nodeId:', nodeId)
      
      // Update cache TRƯỚC KHI clear editingNode
      this.nodeSizeCache.set(nodeId, { width: finalWidth, height: finalHeight })
    }
    
    // Cập nhật node data
    if (nodeData.data) {
      nodeData.data.label = finalValue
      // Root node không lưu fixedWidth/fixedHeight để luôn tính toán lại dựa trên nội dung mới
      // Điều này đảm bảo root node có thể hiển thị đầy đủ nội dung nhiều dòng
      if (!isRootNode) {
        nodeData.data.fixedWidth = finalWidth
        nodeData.data.fixedHeight = finalHeight
      } else {
        // Root node: xóa fixedWidth/fixedHeight để tính toán lại
        delete nodeData.data.fixedWidth
        delete nodeData.data.fixedHeight
        // Cache sẽ được cập nhật ở dưới
      }
      nodeData.data.keepSingleLine = (finalWidth < maxWidth)
    }
    
    rect.attr('width', finalWidth)
    rect.attr('height', finalHeight)
    
    // Cập nhật vị trí nút add-child
    nodeGroup.select('.add-child-btn').attr('cx', finalWidth + 20)
    nodeGroup.select('.add-child-btn').attr('cy', finalHeight / 2)
    nodeGroup.select('.add-child-text').attr('x', finalWidth + 20)
    nodeGroup.select('.add-child-text').attr('y', finalHeight / 2)
    
    const fo = d3.select(foElement)
    const borderOffset = 4
    fo.attr('width', Math.max(0, finalWidth - borderOffset))
    fo.attr('height', Math.max(0, finalHeight - borderOffset))
    
    // ⚠️ CRITICAL: Set white-space ngay sau khi blur để đảm bảo text wrap đúng
    // Nếu width < maxWidth: dùng nowrap để text không xuống dòng
    // Nếu width >= maxWidth: dùng pre-wrap để text có thể wrap
    if (editor && editor.view && editor.view.dom) {
      const editorDOM = editor.view.dom
      const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
      if (editorContent) {
        const whiteSpaceValue = (finalWidth >= maxWidth) ? 'pre-wrap' : 'nowrap'
        if (finalWidth >= maxWidth) {
          // ⚠️ CRITICAL: Set với !important để không bị CSS override
          editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
          editorContent.style.setProperty('word-wrap', 'break-word', 'important')
          editorContent.style.setProperty('overflow-wrap', 'break-word', 'important')
          editorContent.style.setProperty('overflow', 'visible', 'important')
          editorContent.style.setProperty('max-height', 'none', 'important')
        } else {
          // Width < maxWidth: dùng nowrap để text không xuống dòng
          editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
          editorContent.style.setProperty('overflow', 'hidden', 'important')
        }
        // ⚠️ CRITICAL: Set white-space cho tất cả các p bên trong để đảm bảo text không xuống dòng
        const paragraphs = editorContent.querySelectorAll('p')
        paragraphs.forEach(p => {
          p.style.setProperty('white-space', whiteSpaceValue, 'important')
        })
      }
    }
    
    // ⚠️ FIX: Đợi một chút và đo lại height để đảm bảo chính xác
    const that = this
    if (editor && editor.view && editor.view.dom) {
      const editorDOM = editor.view.dom
      const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
      if (editorContent) {
        setTimeout(() => {
          // ⚠️ CRITICAL: Đảm bảo width và white-space đúng trước khi đo
          const borderOffset = 4
          const foWidth = finalWidth - borderOffset
          editorContent.style.setProperty('width', `${foWidth}px`, 'important')
          
          // Nếu width < maxWidth: dùng nowrap để text không xuống dòng
          // Nếu width >= maxWidth: dùng pre-wrap để text có thể wrap
          const whiteSpaceValue = (finalWidth >= maxWidth) ? 'pre-wrap' : 'nowrap'
          if (finalWidth >= maxWidth) {
            // ⚠️ CRITICAL: Set với !important để không bị CSS override
            editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
            editorContent.style.setProperty('word-wrap', 'break-word', 'important')
            editorContent.style.setProperty('overflow-wrap', 'break-word', 'important')
            editorContent.style.setProperty('overflow', 'visible', 'important')
            editorContent.style.setProperty('max-height', 'none', 'important')
          } else {
            // Width < maxWidth: dùng nowrap để text không xuống dòng
            editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
            editorContent.style.setProperty('overflow', 'hidden', 'important')
          }
          // ⚠️ CRITICAL: Set white-space cho tất cả các p bên trong để đảm bảo text không xuống dòng
          const paragraphs = editorContent.querySelectorAll('p')
          paragraphs.forEach(p => {
            p.style.setProperty('white-space', whiteSpaceValue, 'important')
          })
          
          // Force reflow để đảm bảo DOM đã cập nhật
          void editorContent.offsetWidth
          void editorContent.offsetHeight
          
          // Đo lại height sau khi DOM đã cập nhật hoàn toàn
          const actualHeight = Math.max(
            editorContent.offsetHeight || 0,
            singleLineHeight
          )
          
          // Chỉ cập nhật nếu khác biệt đáng kể (> 1px)
          if (Math.abs(actualHeight - finalHeight) > 1) {
            const updatedHeight = actualHeight
            
            // Cập nhật lại node size
            rect.attr('height', updatedHeight)
            fo.attr('height', Math.max(0, updatedHeight - borderOffset))
            
            // ⚠️ CRITICAL: Với root node, đảm bảo wrapper và container có height đúng
            if (isRootNode) {
              const wrapper = fo.select('.node-content-wrapper')
              if (wrapper.node()) {
                wrapper.style('height', 'auto')
                wrapper.style('min-height', '0')
                wrapper.style('max-height', 'none')
                wrapper.style('overflow', 'visible')
              }
              const editorContainer = fo.select('.node-editor-container')
              if (editorContainer.node()) {
                editorContainer.style('height', 'auto')
                editorContainer.style('min-height', '0')
                editorContainer.style('max-height', 'none')
                editorContainer.style('overflow', 'visible')
              }
            }
            
            // Cập nhật cache
            that.nodeSizeCache.set(nodeId, { width: finalWidth, height: updatedHeight })
            
            // Cập nhật vị trí nút add-child
            nodeGroup.select('.add-child-btn').attr('cy', updatedHeight / 2)
            nodeGroup.select('.add-child-text').attr('y', updatedHeight / 2)
            
            // Cập nhật fixedHeight nếu không phải root node
            if (nodeData.data && !isRootNode) {
              nodeData.data.fixedHeight = updatedHeight
            }
          }
        }, 50)
      }
    }
    
    // Đảm bảo wrapper và editor container có height đúng để hiển thị đầy đủ nội dung
    const wrapper = fo.select('.node-content-wrapper')
    if (wrapper.node()) {
      wrapper.style('width', '100%')
      // ⚠️ CRITICAL: Với root node, dùng auto để hiển thị đầy đủ nội dung
      wrapper.style('height', isRootNode ? 'auto' : '100%')
      wrapper.style('min-height', isRootNode ? '0' : '100%')
      wrapper.style('max-height', isRootNode ? 'none' : '100%')
      // ⚠️ CRITICAL: Với root node, dùng visible để hiển thị đầy đủ nội dung
      wrapper.style('overflow', isRootNode ? 'visible' : 'hidden')
    }
    
    // Disable pointer events
    const editorContainer = fo.select('.node-editor-container')
    if (editorContainer.node()) {
      editorContainer.style('pointer-events', 'none')
        .style('width', '100%')
        // ⚠️ CRITICAL: Với root node, dùng auto để hiển thị đầy đủ nội dung
        .style('height', isRootNode ? 'auto' : '100%')
        .style('min-height', isRootNode ? '0' : '100%')
        .style('max-height', isRootNode ? 'none' : '100%')
        // ⚠️ CRITICAL: Với root node, dùng visible để hiển thị đầy đủ nội dung
        .style('overflow', isRootNode ? 'visible' : 'hidden')
    }
    
    // ⚠️ FIX: Set editor content styles để height vừa khít, không thừa
    if (editor && editor.view && editor.view.dom) {
      const editorDOM = editor.view.dom
      const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
      if (editorContent) {
        const borderOffset = 4
        const foWidth = finalWidth - borderOffset
        
        // Set styles để height vừa khít với nội dung
        // ⚠️ CRITICAL: Với root node, LUÔN dùng pre-wrap để hiển thị đầy đủ nội dung
        const whiteSpaceValue = isRootNode ? 'pre-wrap' : (finalWidth >= maxWidth ? 'pre-wrap' : 'nowrap')
        editorContent.style.cssText = `
          box-sizing: border-box;
          width: ${foWidth}px;
          height: auto;
          min-height: ${singleLineHeight}px;
          max-height: none;
          overflow: visible;
          padding: 8px 16px;
          margin: 0;
          word-wrap: break-word;
          overflow-wrap: break-word;
        `
        // ⚠️ CRITICAL: Set white-space với !important để không bị CSS override
        editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
        
        // Force reflow để đảm bảo height được tính đúng
        void editorContent.offsetWidth
        void editorContent.offsetHeight
        
        // ⚠️ FIX: Đo lại height từ DOM và cập nhật nếu cần
        const actualHeight = Math.max(
          editorContent.offsetHeight || 0,
          singleLineHeight
        )
        
        // Nếu height thực tế khác với finalHeight, cập nhật lại
        if (Math.abs(actualHeight - finalHeight) > 1) {
          finalHeight = actualHeight
          rect.attr('height', finalHeight)
          fo.attr('height', Math.max(0, finalHeight - borderOffset))
          this.nodeSizeCache.set(nodeId, { width: finalWidth, height: finalHeight })
        }
        
        // ⚠️ CRITICAL: Với root node, LUÔN đảm bảo wrapper và container có height đúng
        // (không chỉ khi height thay đổi, mà LUÔN set lại để đảm bảo không bị reset)
        if (isRootNode) {
          const wrapper = fo.select('.node-content-wrapper')
          if (wrapper.node()) {
            wrapper.style('height', 'auto')
            wrapper.style('min-height', '0')
            wrapper.style('max-height', 'none')
            wrapper.style('overflow', 'visible')
          }
          const editorContainer = fo.select('.node-editor-container')
          if (editorContainer.node()) {
            editorContainer.style('height', 'auto')
            editorContainer.style('min-height', '0')
            editorContainer.style('max-height', 'none')
            editorContainer.style('overflow', 'visible')
          }
        }
        
        // Cập nhật vị trí nút add-child
        nodeGroup.select('.add-child-btn').attr('cy', finalHeight / 2)
        nodeGroup.select('.add-child-text').attr('y', finalHeight / 2)
      }
    }
    
    // Update cache TRƯỚC KHI clear editingNode để đảm bảo cache được cập nhật
    this.nodeSizeCache.set(nodeId, { width: finalWidth, height: finalHeight })
    
    // Clear editingNode SAU KHI update cache để tránh nháy
    this.editingNode = null
    
    // Trigger callback
    if (this.callbacks.onNodeEditingEnd) {
      this.callbacks.onNodeEditingEnd(nodeId, finalValue)
    }
    
    // Không gọi render() ngay lập tức để tránh nháy
    // Layout sẽ được cập nhật bởi callback onNodeEditingEnd trong MindMap.vue
    // thông qua updateD3RendererWithDelay
  }
  
  setData(nodes, edges, nodeCreationOrder = null) {
    this.nodes = nodes
    this.edges = edges
    // Update nodeCreationOrder nếu được truyền vào
    if (nodeCreationOrder) {
      this.options.nodeCreationOrder = nodeCreationOrder
    }
    this.render(true) // isInitialRender = true
  }
  
  // In render method, around line 750-800
  async render(isInitialRender = false) {
    if (this.nodes.length === 0) return
    
    void document.body.offsetHeight
    
    // ⚠️ FIX: Tính toán node sizes - XÓA cache root node để tính lại
    const nodeSizes = new Map()
    
    // ⚠️ NEW: Đợi TẤT CẢ Vue editors mount xong trước khi tính sizes
    await new Promise(resolve => requestAnimationFrame(resolve))
    await new Promise(resolve => setTimeout(resolve, 100)) // Đợi thêm 100ms
    
    this.nodes.forEach(node => {
      const isRootNode = node.data?.isRoot || node.id === 'root'
      
      if (this.editingNode === node.id && this.nodeSizeCache.has(node.id)) {
        // Node đang edit: giữ nguyên cache
        const cachedSize = this.nodeSizeCache.get(node.id)
        nodeSizes.set(node.id, cachedSize)
      } else {
        // ⚠️ FIX: Tính toán lại size (bao gồm root node)
        // Với root node, chỉ dùng cache nếu hợp lý (height >= 200px hoặc đã được xác nhận)
        let size
        if (isRootNode) {
          const cachedSize = this.nodeSizeCache.get(node.id)
          // ⚠️ CRITICAL: Với root node, chỉ dùng cache nếu height >= 200px (đã được xác nhận là đúng)
          // Nếu cache < 200px, có thể là temporary height, tính toán lại
          if (cachedSize && cachedSize.height >= 200) {
            size = cachedSize
            console.log('[ROOT NODE] render() - using valid cache:', size)
          } else {
            // Cache không hợp lý hoặc chưa có -> tính toán lại
            size = this.estimateNodeSize(node)
            console.log('[ROOT NODE] render() - estimated size:', size)
            console.log('[ROOT NODE] render() - node label:', this.getNodeLabel(node))
            // ⚠️ CRITICAL: Chỉ lưu cache nếu height hợp lý (>= 200px)
            if (size.height >= 200) {
              this.nodeSizeCache.set(node.id, size)
            }
          }
        } else {
          size = this.estimateNodeSize(node)
          nodeSizes.set(node.id, size)
          this.nodeSizeCache.set(node.id, size)
        }
        
        nodeSizes.set(node.id, size)
      }
    })
    
    // Calculate layout
    const positions = calculateD3MindmapLayout(this.nodes, this.edges, {
      nodeSizes: nodeSizes,
      layerSpacing: this.options.layerSpacing,
      nodeSpacing: this.options.nodeSpacing,
      padding: this.options.padding,
      viewportHeight: this.options.height,
      nodeCreationOrder: this.options.nodeCreationOrder || new Map(),
      collapsedNodes: this.collapsedNodes
    })
    
    this.positions = positions
    
    // ⚠️ FIX: Render nodes trước
    this.renderNodes(positions)
    
    // ⚠️ FIX: Đợi DOM update trước khi render edges
    await new Promise(resolve => requestAnimationFrame(resolve))
    
    // Render edges sau
    this.renderEdges(positions)
    
    // ⚠️ CRITICAL: Sau khi render edges, raise tất cả node-group lên trên edge
    // để đảm bảo các nút collapse button không bị edge đè lên
    this.g.selectAll('.node-group').raise()
    
    // ⚠️ Nếu đây là lần render đầu tiên và không có root node cần setTimeout
    // thì gọi callback ngay (vì không có transition)
    if (isInitialRender) {
      const rootNode = this.nodes.find(n => n.data?.isRoot || n.id === 'root')
      const cachedSize = rootNode ? this.nodeSizeCache.get(rootNode.id) : null
      
      if (!rootNode || (cachedSize && cachedSize.height < 200)) {
        // Không có root node hoặc root node đã có cache hợp lý
        // => Không có setTimeout => gọi callback ngay
        if (this.callbacks.onRenderComplete) {
          requestAnimationFrame(() => {
            this.callbacks.onRenderComplete()
          })
        }
      }
      // Nếu có setTimeout cho root node, callback sẽ được gọi trong setTimeout
    }
  }
  
  // Helper: Check if a node is hidden due to collapsed ancestor
  isNodeHidden(nodeId) {
    // Check if any ancestor is collapsed
    let currentId = nodeId
    while (currentId) {
      // Find parent edge
      const parentEdge = this.edges.find(e => e.target === currentId)
      if (!parentEdge) break
      
      // Check if parent is collapsed
      if (this.collapsedNodes.has(parentEdge.source)) {
        return true
      }
      
      currentId = parentEdge.source
    }
    return false
  }
  
  // Helper: Get all descendant node IDs
  getDescendantIds(nodeId) {
    const descendants = []
    const children = this.edges.filter(e => e.source === nodeId).map(e => e.target)
    
    children.forEach(childId => {
      descendants.push(childId)
      descendants.push(...this.getDescendantIds(childId))
    })
    
    return descendants
  }
  
  // Helper: Check if a node is a descendant of another node
  isDescendant(ancestorId, nodeId) {
    if (ancestorId === nodeId) return false
    const descendants = this.getDescendantIds(ancestorId)
    return descendants.includes(nodeId)
  }
  
  // Helper: Cleanup drag branch effects (restore opacity, remove border, etc.)
  cleanupDragBranchEffects() {
    // Xóa border nét đứt bao quanh nhánh
    if (this.dragBranchGhost) {
      this.dragBranchGhost.remove()
      this.dragBranchGhost = null
    }
    
    // Restore opacity của tất cả các node trong nhánh
    this.dragBranchNodeIds.forEach(nodeId => {
      const branchNodeGroup = this.g.select(`[data-node-id="${nodeId}"]`)
      if (!branchNodeGroup.empty()) {
        branchNodeGroup.style('opacity', 1)
        branchNodeGroup.style('pointer-events', 'auto')
      }
    })
    
    // Restore opacity của tất cả các edge liên quan đến nhánh
    const branchNodeIdsSet = new Set(this.dragBranchNodeIds)
    this.edges.forEach(edge => {
      const isSourceInBranch = branchNodeIdsSet.has(edge.source)
      const isTargetInBranch = branchNodeIdsSet.has(edge.target)
      
      // Restore tất cả edge có source hoặc target trong nhánh
      if (isSourceInBranch || isTargetInBranch) {
        const edgeElement = this.g.select(`.edge[data-edge-id="${edge.id}"]`)
        if (!edgeElement.empty()) {
          edgeElement
            .classed('drag-branch-edge', false) // Xóa class đánh dấu
            .style('opacity', 1) // Restore opacity về 1
        }
      }
    })
    
    // Reset danh sách node trong nhánh
    this.dragBranchNodeIds = []
  }
  
  // Helper: Count all descendants (children + cháu + ... ) của một node
  // Dùng cho nút hiển thị tổng số nhánh con khi một node bị thu gọn.
  countChildren(nodeId) {
    const visited = new Set()
    let count = 0
    const stack = [nodeId]

    while (stack.length > 0) {
      const current = stack.pop()
      const childrenEdges = this.edges.filter(e => e.source === current)

      childrenEdges.forEach(edge => {
        const childId = edge.target
        if (!visited.has(childId)) {
          visited.add(childId)
          count += 1
          stack.push(childId)
        }
      })
    }

    // Không tính chính node, chỉ tính toàn bộ descendants
    return count
  }
  
  renderEdges(positions) {
    // Render all edges, but hide collapsed ones
    const edges = this.g.selectAll('.edge')
      .data(this.edges, d => d.id)
    
    // Remove old edges
    edges.exit().remove()
    
    // Add new edges
    const edgesEnter = edges.enter()
      .append('path')
      .attr('class', 'edge')
      .attr('data-edge-id', d => d.id) // Thêm data-edge-id để có thể select sau
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .style('pointer-events', 'none') // Edges không chặn click vào nodes/nút
    
    // Update all edges
    const edgesUpdate = edgesEnter.merge(edges)
    
    // Đảm bảo data-edge-id luôn được set
    edgesUpdate.attr('data-edge-id', d => d.id)
    
    // Hide edges to collapsed children
    // Không override opacity của edge đang được làm mờ do drag
    const that = this
    edgesUpdate
      .style('opacity', function(d) {
        const element = d3.select(this)
        // Nếu edge đang được làm mờ do drag, giữ nguyên opacity
        if (element.classed('drag-branch-edge')) {
          return parseFloat(element.style('opacity')) || 0.2
        }
        return that.isNodeHidden(d.target) ? 0 : 1
      })
      .style('pointer-events', d => {
        return that.isNodeHidden(d.target) ? 'none' : 'auto'
      })
    
      edgesUpdate.attr('d', d => {
        const sourcePos = positions.get(d.source)
        const targetPos = positions.get(d.target)
        
        if (!sourcePos || !targetPos) return ''
        
        // ⚠️ FIX: Lấy kích thước từ DOM thực tế thay vì chỉ dùng cache
        const sourceNode = this.nodes.find(n => n.id === d.source)
        const targetNode = this.nodes.find(n => n.id === d.target)
        
        // Ưu tiên lấy từ DOM rect thực tế (đã render)
        const sourceRect = this.g.select(`[data-node-id="${d.source}"] .node-rect`)
        const targetRect = this.g.select(`[data-node-id="${d.target}"] .node-rect`)
        
        let sourceSize
        if (!sourceRect.empty()) {
          sourceSize = {
            width: parseFloat(sourceRect.attr('width')) || 130,
            height: parseFloat(sourceRect.attr('height')) || 43
          }
        } else {
          // Fallback: dùng cache hoặc tính toán
          sourceSize = this.nodeSizeCache.get(d.source)
          if (!sourceSize && sourceNode) {
            sourceSize = this.estimateNodeSize(sourceNode)
            this.nodeSizeCache.set(d.source, sourceSize)
          }
          if (!sourceSize) {
            sourceSize = { width: 130, height: 43 }
          }
        }
        
        let targetSize
        if (!targetRect.empty()) {
          targetSize = {
            width: parseFloat(targetRect.attr('width')) || 130,
            height: parseFloat(targetRect.attr('height')) || 43
          }
        } else {
          // Fallback: dùng cache hoặc tính toán
          targetSize = this.nodeSizeCache.get(d.target)
          if (!targetSize && targetNode) {
            targetSize = this.estimateNodeSize(targetNode)
            this.nodeSizeCache.set(d.target, targetSize)
          }
          if (!targetSize) {
            targetSize = { width: 130, height: 43 }
          }
        }
        
        const sourceWidth = sourceSize.width
        const sourceHeight = sourceSize.height
        const targetWidth = targetSize.width
        const targetHeight = targetSize.height
        
        // ⚠️ FIX: Connection points LUÔN ở giữa node theo chiều dọc
        const x1 = sourcePos.x + sourceWidth
        const y1 = sourcePos.y + (sourceHeight / 2) // Giữa node theo chiều dọc
        
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
    // Render all nodes, but hide collapsed ones (don't filter to preserve Vue components)
    // Pre-calculate node sizes to avoid repeated calculations
    // Sử dụng instance variable nodeSizeCache thay vì local variable
    // Ưu tiên sử dụng fixedWidth/fixedHeight nếu có (được set khi blur)
    this.nodes.forEach(node => {
      const isRootNode = node.data?.isRoot || node.id === 'root'
      
      // Nếu node có fixedWidth/fixedHeight, dùng trực tiếp và cập nhật cache
      if (node.data && node.data.fixedWidth && node.data.fixedHeight && !isRootNode) {
        this.nodeSizeCache.set(node.id, {
          width: node.data.fixedWidth,
          height: node.data.fixedHeight,
        })
      } else if (!this.nodeSizeCache.has(node.id) || this.editingNode !== node.id) {
        // Chỉ tính toán lại nếu chưa có trong cache hoặc node đang không được edit
        const size = this.estimateNodeSize(node)
        this.nodeSizeCache.set(node.id, size)
      }
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
      // Fallback: dùng cache hoặc mặc định
      return this.nodeSizeCache.get(node.id) || { width: 130, height: 43 } // Node mặc định 130px (textarea width)
    }
    
    const that = this // Store reference for use in callbacks
    
    const nodes = this.g.selectAll('.node-group')
      .data(this.nodes, d => d.id)
    
    // Remove old nodes (only if they're not in this.nodes anymore)
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
        const count = that.countChildren(d.id)
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
    
    // Update node rect style dựa trên selectedNode
    nodesUpdate.select('.node-rect')
      .attr('fill', d => {
        if (this.selectedNode === d.id) return '#e0e7ff' // Selected: đậm
        return d.data?.isRoot ? '#3b82f6' : '#ffffff' // Default
      })
      .attr('stroke', d => {
        if (this.selectedNode === d.id) return '#3b82f6' // Blue border for selected
        return d.data?.isRoot ? 'none' : '#cbd5e1' // Default
      })
      .attr('stroke-width', 2)
    
    nodesUpdate
      .attr('transform', d => {
        const pos = positions.get(d.id)
        if (!pos) return 'translate(0, 0)'
        return `translate(${pos.x}, ${pos.y})`
      })
      // Hide collapsed nodes instead of removing them
      .style('opacity', d => {
        return this.isNodeHidden(d.id) ? 0 : 1
      })
      .style('pointer-events', d => {
        return this.isNodeHidden(d.id) ? 'none' : 'auto'
      })
    
    // Đảm bảo toàn bộ node-group (bao gồm nút thu gọn) luôn nằm trên edge
    nodesUpdate.raise()
      .on('mousedown', function(event, d) {
        // Bắt đầu delay drag - chỉ cho phép drag sau 200ms
        const isRoot = d.data?.isRoot || d.id === 'root'
        const isEditing = that.editingNode === d.id
        
        // Nếu là root hoặc đang edit thì không cho phép drag
        if (isRoot || isEditing) {
          return
        }
        
        // Kiểm tra xem click có phải vào editor hoặc button không
        const target = event.target
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
            if (checkElement(current, editorClasses) || checkElement(current, buttonClasses)) {
              return // Block drag nếu click vào editor hoặc button
            }
            current = current.parentNode
            depth++
          }
        }
        
        // Lưu vị trí ban đầu của mouse
        const startX = event.clientX
        const startY = event.clientY
        const nodeId = d.id
        
        console.log('[MOUSEDOWN] Starting drag delay for node:', nodeId)
        
        // Reset flags và lưu vị trí bắt đầu
        that.isDragStarting = true
        that.mouseUpOccurred = false
        that.dragStartPosition = { x: startX, y: startY }
        that.dragStartTime = Date.now() // Lưu timestamp khi mousedown
        
        // Clear timeout cũ nếu có
        if (that.dragStartTimeout) {
          clearTimeout(that.dragStartTimeout)
        }
        
        // Handler để cancel delay nếu thả chuột
        const cancelDrag = () => {
          console.log('[MOUSEDOWN] Mouse up, canceling drag delay')
          that.mouseUpOccurred = true // Đánh dấu mouseup đã xảy ra
          if (that.dragStartTimeout) {
            clearTimeout(that.dragStartTimeout)
            that.dragStartTimeout = null
          }
          that.isDragStarting = false
          document.removeEventListener('mousemove', checkMouseMove)
          document.removeEventListener('mouseup', cancelDrag)
        }
        
        // Kiểm tra xem có di chuyển chuột nhiều không (nếu di chuyển > 5px thì cho phép drag ngay)
        const checkMouseMove = (e) => {
          const deltaX = Math.abs(e.clientX - startX)
          const deltaY = Math.abs(e.clientY - startY)
          if (deltaX > 5 || deltaY > 5) {
            // Di chuyển nhiều -> cho phép drag ngay (không cancel, chỉ cho phép)
            console.log('[MOUSEDOWN] Mouse moved > 5px, allowing drag immediately')
            if (that.dragStartTimeout) {
              clearTimeout(that.dragStartTimeout)
              that.dragStartTimeout = null
            }
            that.isDragStarting = false // Cho phép drag ngay
            document.removeEventListener('mousemove', checkMouseMove)
            // KHÔNG remove mouseup listener vì cần để cleanup sau khi drag xong
          }
        }
        
        // Thêm listeners để cancel delay nếu thả chuột hoặc cho phép drag nếu di chuyển nhiều
        document.addEventListener('mousemove', checkMouseMove)
        document.addEventListener('mouseup', cancelDrag)
        
        // Sau 200ms, cho phép drag
        that.dragStartTimeout = setTimeout(() => {
          console.log('[MOUSEDOWN] Delay finished (200ms), allowing drag')
          that.isDragStarting = false // Cho phép drag sau delay
          document.removeEventListener('mousemove', checkMouseMove)
          document.removeEventListener('mouseup', cancelDrag)
        }, 200)
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
        
        // QUAN TRỌNG: Nếu click vào collapse button, KHÔNG BAO GIỜ xử lý ở đây
        // Collapse button sẽ tự xử lý và stop propagation
        if (isEditorClick || isAddChildClick || isCollapseClick) {
          // Click vào editor hoặc các nút -> không xử lý ở đây (để các nút tự xử lý)
          console.log('🚫 Node group click ignored - clicked on button/editor')
          return
        }

        event.stopPropagation()
        
        // Đưa node lên trên ngay lập tức để nút không bị che bởi edge
        const nodeGroup = d3.select(this)
        nodeGroup.raise()
        
        // Click đơn giản để select node
        // Blur editor nếu đang focus
        const editorInstance = that.getEditorInstance(d.id)
        if (editorInstance && editorInstance.isFocused) {
          editorInstance.commands.blur()
        }
        
        // Disable pointer events cho editor container khi không edit
        const editorContainer = nodeGroup.select('.node-editor-container')
        if (editorContainer.node()) {
          editorContainer.style('pointer-events', 'none')
        }
        
        // CHỈ select node, KHÔNG BAO GIỜ gọi onNodeAdd ở đây
        that.selectNode(d.id)
        if (that.callbacks.onNodeClick) {
          that.callbacks.onNodeClick(d)
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
          const editorInstance = that.getEditorInstance(d.id)
          if (editorInstance) {
            // Focus vào editor và đặt cursor ở cuối - tất cả node (bao gồm root) dùng logic giống nhau
            editorInstance.commands.focus('end')
            // Gọi handleEditorFocus để setup đúng cách
            that.handleEditorFocus(d.id, fo.node(), d)
          } else {
            // Nếu editor chưa sẵn sàng, thử lại sau
            setTimeout(() => {
              const editorInstance2 = that.getEditorInstance(d.id)
              if (editorInstance2) {
                editorInstance2.commands.focus('end')
                that.handleEditorFocus(d.id, fo.node(), d)
              }
            }, 50)
          }
        }, 10)
      })
      .call(d3.drag()
        .filter(function(event, d) {
          // Chỉ kiểm tra điều kiện cơ bản trong filter (button, không block delay)
          // Logic delay sẽ được xử lý trong on('start')
          
          // Chỉ cho phép drag với left mouse button
          // Kiểm tra event.sourceEvent tồn tại và có button
          console.log('[DRAG FILTER] Node:', d.id, 'event:', event, 'event.sourceEvent:', event.sourceEvent)
          
          // Nếu không có sourceEvent, có thể là touch event hoặc event khác, cho phép mặc định
          if (!event.sourceEvent) {
            console.log('[DRAG FILTER] No sourceEvent, allowing drag (might be touch event)')
            return true
          }
          
          // Kiểm tra button: 0 = left mouse button
          const allow = event.sourceEvent.button === 0 || event.sourceEvent.button === undefined
          console.log('[DRAG FILTER] Node:', d.id, 'button:', event.sourceEvent.button, 'allow:', allow)
          return allow
        })
        .on('start', function(event, d) {
          console.log('[DRAG START] Node:', d.id, 'event:', event, 'event.sourceEvent:', event.sourceEvent, 'isDragStarting:', that.isDragStarting, 'mouseUpOccurred:', that.mouseUpOccurred)
          
          // Kiểm tra xem có phải là click đơn giản không (mouseup đã xảy ra)
          if (that.mouseUpOccurred) {
            console.log('[DRAG START] Blocked - mouseup already occurred, this is a click, not a drag')
            if (event.sourceEvent) {
              event.sourceEvent.preventDefault()
              event.sourceEvent.stopPropagation()
            }
            // Cleanup drag branch effects nếu đã được tạo
            that.cleanupDragBranchEffects()
            // Disable drag handlers
            d3.select(this).on('drag', null).on('end', null)
            // Reset flags
            that.isDragStarting = false
            that.mouseUpOccurred = false
            that.dragStartPosition = null
            that.dragStartTime = null
            return
          }
          
          // Kiểm tra xem có di chuyển nhiều từ vị trí ban đầu không
          let hasMoved = false
          if (that.dragStartPosition && event.sourceEvent) {
            const currentX = event.sourceEvent.clientX || event.sourceEvent.pageX
            const currentY = event.sourceEvent.clientY || event.sourceEvent.pageY
            const deltaX = Math.abs(currentX - that.dragStartPosition.x)
            const deltaY = Math.abs(currentY - that.dragStartPosition.y)
            
            // Nếu di chuyển > 5px thì coi là đã di chuyển
            hasMoved = deltaX > 5 || deltaY > 5
          }
          
          // Kiểm tra thời gian: nếu từ mousedown đến start < 150ms và không di chuyển nhiều, có thể là click
          if (that.dragStartTime && !hasMoved) {
            const timeSinceMouseDown = Date.now() - that.dragStartTime
            if (timeSinceMouseDown < 150) {
              console.log('[DRAG START] Blocked - too fast (< 150ms) and no movement, this is likely a click')
              if (event.sourceEvent) {
                event.sourceEvent.preventDefault()
                event.sourceEvent.stopPropagation()
              }
              // Cleanup drag branch effects nếu đã được tạo
              that.cleanupDragBranchEffects()
              // Disable drag handlers
              d3.select(this).on('drag', null).on('end', null)
              // Reset flags
              that.isDragStarting = false
              that.mouseUpOccurred = false
              that.dragStartPosition = null
              that.dragStartTime = null
              return
            }
          }
          
          // Nếu đang trong delay, cancel delay và cho phép drag
          if (that.isDragStarting) {
            console.log('[DRAG START] Delay finished, allowing drag')
            if (that.dragStartTimeout) {
              clearTimeout(that.dragStartTimeout)
              that.dragStartTimeout = null
            }
            that.isDragStarting = false
          }
          
          const isRoot = d.data?.isRoot || d.id === 'root'
          const isEditing = that.editingNode === d.id
          
          console.log('[DRAG START] Node:', d.id, 'isRoot:', isRoot, 'isEditing:', isEditing)
          
          // Nếu là root hoặc đang edit thì không cho phép drag
          if (isRoot || isEditing) {
            console.log('[DRAG START] Blocked - isRoot:', isRoot, 'isEditing:', isEditing)
            if (event.sourceEvent) {
              event.sourceEvent.preventDefault()
              event.sourceEvent.stopPropagation()
            }
            // Disable drag handlers
            d3.select(this).on('drag', null).on('end', null)
            // Reset flags
            that.isDragStarting = false
            that.mouseUpOccurred = false
            that.dragStartPosition = null
            return
          }
          
          // Kiểm tra xem click có phải vào editor hoặc button không
          // Lấy target từ sourceEvent nếu có, nếu không thì từ event
          const target = event.sourceEvent?.target || (event.originalEvent?.target) || null
          
          if (target) {
            console.log('[DRAG START] Target:', target)
            // Helper function để kiểm tra element
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
            
            // Kiểm tra editor classes
            const editorClasses = [
              'mindmap-node-editor',
              'mindmap-editor-content',
              'mindmap-editor-prose',
              'ProseMirror',
              'ProseMirror-focused',
              'node-content-wrapper' // Block drag khi click vào content wrapper
            ]
            
            // Kiểm tra button classes
            const buttonClasses = [
              'add-child-btn',
              'add-child-text',
              'collapse-btn-arrow',
              'collapse-btn-number',
              'collapse-text-number',
              'collapse-arrow'
            ]
            
            // Kiểm tra target và các parent của nó, hoặc dùng closest() nếu có
            let shouldBlock = false
            if (target.closest) {
              // Sử dụng closest() để tìm element cha có class cần thiết
              shouldBlock = !!(
                target.closest('.mindmap-node-editor') ||
                target.closest('.mindmap-editor-content') ||
                target.closest('.mindmap-editor-prose') ||
                target.closest('.ProseMirror') ||
                target.closest('.node-content-wrapper') ||
                target.closest('.add-child-btn') ||
                target.closest('.add-child-text') ||
                target.closest('.collapse-btn-arrow') ||
                target.closest('.collapse-btn-number') ||
                target.closest('.collapse-text-number') ||
                target.closest('.collapse-arrow')
              )
            } else {
              // Fallback: kiểm tra từng parent
              let current = target
              let depth = 0
              while (current && depth < 10) {
                const isEditor = checkElement(current, editorClasses)
                const isButton = checkElement(current, buttonClasses)
                if (isEditor || isButton) {
                  shouldBlock = true
                  break
                }
                current = current.parentNode
                depth++
              }
            }
            
            if (shouldBlock) {
              console.log('[DRAG START] Blocked - clicked on editor/button/content-wrapper:', {
                target: target,
                className: target.className
              })
              if (event.sourceEvent) {
                event.sourceEvent.preventDefault()
                event.sourceEvent.stopPropagation()
              }
              // Cleanup drag branch effects nếu đã được tạo
              that.cleanupDragBranchEffects()
              // Disable drag handlers
              d3.select(this).on('drag', null).on('end', null)
              // Reset flags
              that.isDragStarting = false
              that.mouseUpOccurred = false
              that.dragStartPosition = null
              that.dragStartTime = null
              return // Block drag nếu click vào editor, button hoặc content wrapper
            }
            console.log('[DRAG START] Passed editor/button check for node:', d.id)
          }
          
          // Bắt đầu drag
          console.log('[DRAG START] ✅ Starting drag for node:', d.id)
          // KHÔNG stopPropagation ở đây để không chặn click/dblclick events
          // Chỉ stopPropagation khi thực sự đang drag (trong on('drag'))
          that.draggedNode = d.id
          const nodeGroup = d3.select(this)
          const nodeRect = nodeGroup.select('.node-rect')
          const rectWidth = parseFloat(nodeRect.attr('width')) || 130
          const rectHeight = parseFloat(nodeRect.attr('height')) || 43
          
          console.log('[DRAG START] Node size:', { rectWidth, rectHeight })
          
          // Lấy vị trí ban đầu của node để tính offset
          const pos = that.positions.get(d.id)
          const [x, y] = d3.pointer(event, that.g.node())
          
          console.log('[DRAG START] Position:', { pos, x, y })
          
          // Tính offset để ghost không che con trỏ chuột
          // Offset dựa trên vị trí click trong node
          const offsetX = pos ? (x - pos.x - rectWidth / 2) : -rectWidth / 2
          const offsetY = pos ? (y - pos.y - rectHeight / 2) : -rectHeight / 2
          
          console.log('[DRAG START] Offset:', { offsetX, offsetY })
          
          // Lưu offset để sử dụng trong drag
          that.dragOffset = { x: offsetX, y: offsetY }
          
          // Tạo ghost/preview element
          // Định nghĩa ghostX và ghostY ở ngoài try-catch để có thể sử dụng khi tạo ghost edges
          const ghostX = x + offsetX
          const ghostY = y + offsetY
          
          try {
            console.log('[DRAG START] Creating ghost element', { ghostX, ghostY, rectWidth, rectHeight })
            
            // Tạo group cho ghost node
            that.dragGhost = that.g.append('g')
              .attr('class', 'drag-ghost')
              .attr('transform', `translate(${ghostX}, ${ghostY})`)
              .style('opacity', 0.8)
              .style('pointer-events', 'none')
              .style('visibility', 'visible')
              .style('display', 'block')
            
            // Đảm bảo ghost node ở trên cùng
            that.dragGhost.raise()
            
            console.log('[DRAG START] Ghost node created:', {
              element: that.dragGhost.node(),
              transform: that.dragGhost.attr('transform'),
              opacity: that.dragGhost.style('opacity')
            })
          } catch (error) {
            console.error('[DRAG START] Error creating ghost node:', error)
            that.dragGhost = null
          }
          
          // Copy node rect với border dashed (giống Lark)
          that.dragGhost.append('rect')
            .attr('width', rectWidth)
            .attr('height', rectHeight)
            .attr('rx', 8)
            .attr('fill', '#f3f4f6')
            .attr('stroke', '#3b82f6')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '8,4')
          
          // Bỏ số lượng con ở ghost node
          
          // Copy node text (simplified)
          const nodeLabel = d.data?.label || ''
          const textContent = nodeLabel.replace(/<[^>]*>/g, '').trim() || 'Node'
          // Giới hạn độ dài text để không quá dài
          const displayText = textContent.length > 30 ? textContent.substring(0, 30) + '...' : textContent
          that.dragGhost.append('text')
            .attr('x', rectWidth / 2)
            .attr('y', rectHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', '#374151')
            .attr('font-size', '14px')
            .attr('font-weight', '400')
            .text(displayText)
          
          // Tạo group riêng cho ghost edges (ở level riêng, không có transform)
          that.dragGhostEdgesGroup = that.g.append('g')
            .attr('class', 'drag-ghost-edges')
            .style('pointer-events', 'none')
            .style('visibility', 'visible')
            .style('display', 'block')
          
          // Đảm bảo ghost edges ở trên cùng
          that.dragGhostEdgesGroup.raise()
          
          console.log('[DRAG START] Ghost edges group created:', {
            element: that.dragGhostEdgesGroup.node()
          })
          
          // Tạo ghost edges (edge từ parent đến node này và từ node này đến children)
          const parentEdge = that.edges.find(e => e.target === d.id)
          const childrenEdges = that.edges.filter(e => e.source === d.id)
          
          console.log('[DRAG START] Ghost edges info:', { 
            hasParentEdge: !!parentEdge, 
            childrenEdgesCount: childrenEdges.length 
          })
          
          // Helper function để tính toán edge path (giống renderEdges)
          const calculateEdgePath = (sourcePos, targetPos, sourceSize, targetSize) => {
            if (!sourcePos || !targetPos) return ''
            
            const sourceWidth = sourceSize.width
            const sourceHeight = sourceSize.height
            const targetWidth = targetSize.width
            const targetHeight = targetSize.height
            
            const x1 = sourcePos.x + sourceWidth
            const y1 = sourcePos.y + (sourceHeight / 2)
            
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
          }
          
          // KHÔNG tạo ghost edges từ parent và children (màu xanh dương)
          // Chỉ tạo ghost edge xanh lá đến target node khi có target
          
          // Lấy tất cả các node con cháu của node đang được kéo
          const descendantIds = that.getDescendantIds(d.id)
          that.dragBranchNodeIds = [d.id, ...descendantIds] // Bao gồm cả node gốc
          
          // Làm mờ tất cả các node trong nhánh (bao gồm tất cả phần tử con như text, buttons, v.v.)
          that.dragBranchNodeIds.forEach(nodeId => {
            const branchNodeGroup = that.g.select(`[data-node-id="${nodeId}"]`)
            if (!branchNodeGroup.empty()) {
              branchNodeGroup.style('opacity', 0.2) // Làm mờ rõ ràng hơn
              branchNodeGroup.style('pointer-events', 'none')
            }
          })
          
          // Tính bounding box của toàn bộ nhánh
          let minX = Infinity
          let minY = Infinity
          let maxX = -Infinity
          let maxY = -Infinity
          
          that.dragBranchNodeIds.forEach(nodeId => {
            const pos = that.positions.get(nodeId)
            if (pos) {
              const nodeSize = that.nodeSizeCache.get(nodeId) || that.estimateNodeSize(that.nodes.find(n => n.id === nodeId))
              const nodeLeft = pos.x
              const nodeRight = pos.x + nodeSize.width
              const nodeTop = pos.y
              const nodeBottom = pos.y + nodeSize.height
              
              minX = Math.min(minX, nodeLeft)
              minY = Math.min(minY, nodeTop)
              maxX = Math.max(maxX, nodeRight)
              maxY = Math.max(maxY, nodeBottom)
            }
          })
          
          // Làm mờ tất cả các edge liên quan đến nhánh
          // Bao gồm: edge có source hoặc target là một trong các node trong nhánh
          const branchNodeIdsSet = new Set(that.dragBranchNodeIds)
          that.edges.forEach(edge => {
            const isSourceInBranch = branchNodeIdsSet.has(edge.source)
            const isTargetInBranch = branchNodeIdsSet.has(edge.target)
            
            // Làm mờ tất cả edge có source hoặc target trong nhánh
            if (isSourceInBranch || isTargetInBranch) {
              const edgeElement = that.g.select(`.edge[data-edge-id="${edge.id}"]`)
              if (!edgeElement.empty()) {
                edgeElement
                  .classed('drag-branch-edge', true) // Đánh dấu edge đang được làm mờ
                  .style('opacity', 0.2) // Làm mờ edge
              }
            }
          })
          
          // Tạo border nét đứt bao quanh nhánh ở vị trí cũ
          if (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity) {
            const padding = 10 // Padding xung quanh border
            that.dragBranchGhost = that.g.append('rect')
              .attr('class', 'drag-branch-ghost')
              .attr('x', minX - padding)
              .attr('y', minY - padding)
              .attr('width', maxX - minX + padding * 2)
              .attr('height', maxY - minY + padding * 2)
              .attr('rx', 8)
              .attr('fill', 'none')
              .attr('stroke', '#3b82f6')
              .attr('stroke-width', 2)
              .attr('stroke-dasharray', '8,4') // Nét đứt
              .attr('opacity', 0.6)
              .style('pointer-events', 'none')
              .lower() // Đặt ở dưới các node để không che
          }
        })
        .on('drag', function(event, d) {
          // Khi đang drag
          console.log('[DRAG] Dragging node:', d.id)
          // Stop propagation khi đang drag để tránh conflict với các event khác
          if (event.sourceEvent) {
            event.sourceEvent.stopPropagation()
          }
          const [x, y] = d3.pointer(event, that.g.node())
          
          // Vị trí mới của ghost node
          const ghostX = x + that.dragOffset.x
          const ghostY = y + that.dragOffset.y
          const ghostNodePos = { x: ghostX, y: ghostY }
          
          // Cập nhật vị trí ghost node
          if (that.dragGhost) {
            that.dragGhost.attr('transform', `translate(${ghostX}, ${ghostY})`)
            console.log('[DRAG] Updated ghost node position:', { ghostX, ghostY })
          } else {
            console.log('[DRAG] WARNING: dragGhost is null! Creating ghost node now...')
            // Tạo ghost node nếu chưa có (có thể on('start') không được gọi)
            try {
              const nodeGroup = d3.select(this)
              const nodeRect = nodeGroup.select('.node-rect')
              const rectWidth = parseFloat(nodeRect.attr('width')) || 130
              const rectHeight = parseFloat(nodeRect.attr('height')) || 43
              
              that.dragGhost = that.g.append('g')
                .attr('class', 'drag-ghost')
                .attr('transform', `translate(${ghostX}, ${ghostY})`)
                .style('opacity', 0.8)
                .style('pointer-events', 'none')
                .style('visibility', 'visible')
                .style('display', 'block')
              
              that.dragGhost.raise()
              
              // Copy node rect với border dashed
              that.dragGhost.append('rect')
                .attr('width', rectWidth)
                .attr('height', rectHeight)
                .attr('rx', 8)
                .attr('fill', '#f3f4f6')
                .attr('stroke', '#3b82f6')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '8,4')
              
              // Copy node text
              const nodeLabel = d.data?.label || ''
              const textContent = nodeLabel.replace(/<[^>]*>/g, '').trim() || 'Node'
              const displayText = textContent.length > 30 ? textContent.substring(0, 30) + '...' : textContent
              that.dragGhost.append('text')
                .attr('x', rectWidth / 2)
                .attr('y', rectHeight / 2)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .attr('fill', '#374151')
                .attr('font-size', '14px')
                .attr('font-weight', '400')
                .text(displayText)
              
              console.log('[DRAG] Ghost node created in drag handler')
              
              // Tạo ghost edges group nếu chưa có (chỉ để chứa ghost edge xanh lá đến target)
              if (!that.dragGhostEdgesGroup) {
                // Tạo group riêng cho ghost edges
                that.dragGhostEdgesGroup = that.g.append('g')
                  .attr('class', 'drag-ghost-edges')
                  .style('pointer-events', 'none')
                  .style('visibility', 'visible')
                  .style('display', 'block')
                
                that.dragGhostEdgesGroup.raise()
              }
            } catch (error) {
              console.error('[DRAG] Error creating ghost node in drag handler:', error)
            }
          }
          
          // KHÔNG cập nhật ghost edges xanh dương (đã bỏ)
          // Chỉ cập nhật ghost edge xanh lá đến target node nếu có
          if (that.dragGhostEdgesGroup && that.dragTargetNode) {
            const targetGhostEdge = that.dragGhostEdgesGroup.select('.drag-ghost-edge-target')
            if (!targetGhostEdge.empty()) {
              const targetNode = that.nodes.find(n => n.id === that.dragTargetNode)
              if (targetNode) {
                const targetPos = that.positions.get(that.dragTargetNode)
                const targetSize = that.nodeSizeCache.get(that.dragTargetNode) || { width: 130, height: 43 }
                const ghostNodeSize = that.nodeSizeCache.get(d.id) || { width: 130, height: 43 }
                
                if (targetPos) {
                  // Helper function để tính toán edge path từ bên trái ghost node đến bên phải target node
                  // Từ bên trái node di chuyển đến bên phải node cha mới
                  const calculateTargetEdgePath = (sourcePos, targetPos, sourceSize, targetSize) => {
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
                    
                    // Tính toán horizontal offset để tạo đường cong mượt mà
                    // dx luôn dương khi đi từ trái sang phải
                    const baseOffset = Math.max(40, Math.min(Math.abs(dx) * 0.45, 130))
                    const horizontalOffset = Math.min(baseOffset, dx - 16)
                    const cornerRadius = Math.min(
                      18,
                      Math.abs(dy) / 2,
                      Math.max(8, horizontalOffset / 3)
                    )
                    
                    // Nếu khoảng cách quá ngắn, vẽ đường thẳng
                    if (horizontalOffset < cornerRadius * 2 + 4) {
                      return `M ${x1} ${y1} L ${x2} ${y2}`
                    }
                    
                    // Tính điểm giữa cho đường cong
                    // Đi từ bên trái ghost node sang bên phải target node
                    const midX = x1 + horizontalOffset
                    
                    // Tạo đường cong mượt mà: đi ngang từ x1, sau đó cong lên/xuống, rồi đi ngang đến x2
                    const path = [
                      `M ${x1} ${y1}`, // Bắt đầu từ bên trái ghost node
                      `L ${midX - cornerRadius} ${y1}`, // Đi ngang sang phải
                      `Q ${midX} ${y1} ${midX} ${y1 + direction * cornerRadius}`, // Cong lên/xuống
                      `L ${midX} ${y2 - direction * cornerRadius}`, // Đi dọc đến gần y2
                      `Q ${midX} ${y2} ${midX + cornerRadius} ${y2}`, // Cong để đi ngang
                      `L ${x2} ${y2}` // Đi ngang đến edge bên phải target node
                    ]
                    
                    return path.join(' ')
                  }
                  
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
          that.nodes.forEach(node => {
            const pos = that.positions.get(node.id)
            if (pos) {
              const nodeSize = that.nodeSizeCache.get(node.id) || that.estimateNodeSize(node)
              
              const nodeRight = pos.x + nodeSize.width // Edge bên phải của node
              const nodeTop = pos.y
              const nodeBottom = pos.y + nodeSize.height
              
              // Chỉ tính khoảng cách đến edge bên phải của node (không phải toàn bộ node)
              // Pointer có thể ở bên trái hoặc bên phải edge một chút
              const edgeX = nodeRight
              
              // Tính khoảng cách từ pointer đến edge bên phải
              // Khoảng cách ngang: từ pointer đến edge (có thể âm nếu pointer ở bên trái edge)
              const dx = Math.abs(x - edgeX)
              
              // Khoảng cách dọc: từ pointer đến điểm gần nhất trên edge
              let dy
              if (y < nodeTop) {
                // Pointer ở trên edge -> khoảng cách đến điểm trên cùng của edge
                dy = nodeTop - y
              } else if (y > nodeBottom) {
                // Pointer ở dưới edge -> khoảng cách đến điểm dưới cùng của edge
                dy = y - nodeBottom
              } else {
                // Pointer ở trong phạm vi dọc của edge -> khoảng cách dọc = 0
                dy = 0
              }
              
              // Tính khoảng cách tổng từ pointer đến edge bên phải
              const distance = Math.sqrt(dx * dx + dy * dy)
              
              // Chỉ xem xét node nếu khoảng cách <= maxTargetDistance
              // Và pointer phải ở gần edge (không quá xa về phía trái)
              if (distance <= maxTargetDistance && x >= edgeX - maxTargetDistance && distance < minDistance) {
                minDistance = distance
                closestNode = node
              }
            }
          })
          
          if (closestNode) {
            console.log('[DRAG] Found closest node:', closestNode.id, 'distance:', minDistance)
            targetNodeGroup = that.g.select(`[data-node-id="${closestNode.id}"]`)
          } else {
            console.log('[DRAG] No closest node found')
          }
          
          if (targetNodeGroup && targetNodeGroup.node() && targetNodeGroup.datum()) {
            const targetDatum = targetNodeGroup.datum()
            const isRoot = targetDatum.data?.isRoot || targetDatum.id === 'root'
            const isSameNode = targetDatum.id === d.id
            const isDescendant = that.isDescendant(d.id, targetDatum.id)
            
            console.log('[DRAG] Target node check:', {
              targetId: targetDatum.id,
              isRoot,
              isSameNode,
              isDescendant,
              isValid: !isSameNode && !isDescendant
            })
            
            // Chỉ highlight nếu không phải cùng node và không phải descendant
            // Cho phép drop vào root node (giống Lark)
            if (!isSameNode && !isDescendant) {
              // Remove highlight từ node cũ
              if (that.dragTargetNode && that.dragTargetNode !== targetDatum.id) {
                const oldTarget = that.g.select(`[data-node-id="${that.dragTargetNode}"]`)
                oldTarget.select('.node-rect')
                  .attr('stroke', d => {
                    if (d.data?.isRoot) return 'none'
                    if (that.selectedNode === d.id) return '#3b82f6'
                    return '#cbd5e1'
                  })
                  .attr('stroke-width', d => that.selectedNode === d.id ? 2 : 2)
              }
              
              // Highlight node mới với màu xanh dương giống như khi được select
              that.dragTargetNode = targetDatum.id
              targetNodeGroup.select('.node-rect')
                .attr('stroke', '#3b82f6')
                .attr('stroke-width', 2) // Giống như khi được select
                // Không có stroke-dasharray để border active không nét đứt
              
              // Tạo/cập nhật ghost edge từ ghost node đến target node
              if (that.dragGhostEdgesGroup) {
                const targetPos = that.positions.get(targetDatum.id)
                const targetSize = that.nodeSizeCache.get(targetDatum.id) || { width: 130, height: 43 }
                const ghostNodeSize = that.nodeSizeCache.get(d.id) || { width: 130, height: 43 }
                
                if (targetPos) {
                  // Helper function để tính toán edge path từ bên trái ghost node đến bên phải target node
                  // Từ bên trái node di chuyển đến bên phải node cha mới
                  const calculateTargetEdgePath = (sourcePos, targetPos, sourceSize, targetSize) => {
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
                    
                    // Tính toán horizontal offset để tạo đường cong mượt mà
                    // dx luôn dương khi đi từ trái sang phải
                    const baseOffset = Math.max(40, Math.min(Math.abs(dx) * 0.45, 130))
                    const horizontalOffset = Math.min(baseOffset, dx - 16)
                    const cornerRadius = Math.min(
                      18,
                      Math.abs(dy) / 2,
                      Math.max(8, horizontalOffset / 3)
                    )
                    
                    // Nếu khoảng cách quá ngắn, vẽ đường thẳng
                    if (horizontalOffset < cornerRadius * 2 + 4) {
                      return `M ${x1} ${y1} L ${x2} ${y2}`
                    }
                    
                    // Tính điểm giữa cho đường cong
                    // Đi từ bên trái ghost node sang bên phải target node
                    const midX = x1 + horizontalOffset
                    
                    // Tạo đường cong mượt mà: đi ngang từ x1, sau đó cong lên/xuống, rồi đi ngang đến x2
                    const path = [
                      `M ${x1} ${y1}`, // Bắt đầu từ bên trái ghost node
                      `L ${midX - cornerRadius} ${y1}`, // Đi ngang sang phải
                      `Q ${midX} ${y1} ${midX} ${y1 + direction * cornerRadius}`, // Cong lên/xuống
                      `L ${midX} ${y2 - direction * cornerRadius}`, // Đi dọc đến gần y2
                      `Q ${midX} ${y2} ${midX + cornerRadius} ${y2}`, // Cong để đi ngang
                      `L ${x2} ${y2}` // Đi ngang đến edge bên phải target node
                    ]
                    
                    return path.join(' ')
                  }
                  
                  const edgePath = calculateTargetEdgePath(
                    ghostNodePos,
                    targetPos,
                    ghostNodeSize,
                    targetSize
                  )
                  
                  // Kiểm tra xem đã có ghost edge đến target chưa
                  let targetGhostEdge = that.dragGhostEdgesGroup.select('.drag-ghost-edge-target')
                  
                  if (targetGhostEdge.empty()) {
                    // Tạo mới ghost edge đến target với màu xanh dương giống Lark
                    targetGhostEdge = that.dragGhostEdgesGroup.append('path')
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
              }
            } else {
              // Remove highlight nếu không hợp lệ
              if (that.dragTargetNode) {
                const oldTarget = that.g.select(`[data-node-id="${that.dragTargetNode}"]`)
                oldTarget.select('.node-rect')
                  .attr('stroke', d => {
                    if (d.data?.isRoot) return 'none'
                    if (that.selectedNode === d.id) return '#3b82f6'
                    return '#cbd5e1'
                  })
                  .attr('stroke-width', d => that.selectedNode === d.id ? 2 : 2)
                  .attr('stroke-dasharray', null)
                that.dragTargetNode = null
                
                // Xóa ghost edge đến target
                if (that.dragGhostEdgesGroup) {
                  that.dragGhostEdgesGroup.select('.drag-ghost-edge-target').remove()
                }
              }
            }
          } else {
            // Remove highlight nếu không có target
            if (that.dragTargetNode) {
              const oldTarget = that.g.select(`[data-node-id="${that.dragTargetNode}"]`)
              oldTarget.select('.node-rect')
                .attr('stroke', d => d.data?.isRoot ? 'none' : '#cbd5e1')
                .attr('stroke-width', 2)
              that.dragTargetNode = null
              
              // Xóa ghost edge đến target
              if (that.dragGhostEdgesGroup) {
                that.dragGhostEdgesGroup.select('.drag-ghost-edge-target').remove()
              }
            }
          }
        })
        .on('end', function(event, d) {
          // Kết thúc drag
          console.log('[DRAG END] Ending drag for node:', d.id, 'targetNodeId:', that.dragTargetNode)
          const targetNodeId = that.dragTargetNode
          
          // Xóa ghost
          if (that.dragGhost) {
            that.dragGhost.remove()
            that.dragGhost = null
          }
          
          // Xóa ghost edges group
          if (that.dragGhostEdgesGroup) {
            that.dragGhostEdgesGroup.remove()
            that.dragGhostEdgesGroup = null
          }
          
          // Xóa thông tin ghost edges
          that.dragGhostEdges = null
          
          // Cleanup drag branch effects (restore opacity, remove border, etc.)
          that.cleanupDragBranchEffects()
          
          // Restore node gốc
          const nodeGroup = d3.select(this)
          nodeGroup.style('opacity', 1)
          nodeGroup.style('pointer-events', 'auto')
          
          // Restore border của node gốc về trạng thái ban đầu
          const isSelected = that.selectedNode === d.id
          nodeGroup.select('.node-rect')
            .attr('stroke', d => {
              if (d.data?.isRoot) return 'none'
              if (isSelected) return '#3b82f6'
              return '#cbd5e1'
            })
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', null)
          
          // Reset danh sách node trong nhánh
          that.dragBranchNodeIds = []
          
          // Remove highlight từ node đích
          if (that.dragTargetNode) {
            const targetNode = that.g.select(`[data-node-id="${that.dragTargetNode}"]`)
            const targetDatum = targetNode.datum()
            targetNode.select('.node-rect')
              .attr('stroke', d => {
                if (d.data?.isRoot) return 'none'
                if (that.selectedNode === d.id) return '#3b82f6'
                return '#cbd5e1'
              })
              .attr('stroke-width', 2)
              .attr('stroke-dasharray', null)
          }
          
          // Reset drag offset
          that.dragOffset = { x: 0, y: 0 }
          
          // Xử lý drop
          if (targetNodeId && targetNodeId !== d.id) {
            const targetNode = that.nodes.find(n => n.id === targetNodeId)
            const isDescendant = that.isDescendant(d.id, targetNodeId)
            
            // Cho phép drop vào bất kỳ node nào (bao gồm root) trừ khi là descendant
            if (targetNode && !isDescendant) {
              // Cập nhật parent của node
              const oldEdge = that.edges.find(e => e.target === d.id)
              const newSource = targetNodeId
              
              if (oldEdge) {
                // Cập nhật edge hiện có
                oldEdge.source = newSource
                oldEdge.id = `edge-${newSource}-${d.id}`
              } else {
                // Tạo edge mới nếu chưa có
                that.edges.push({
                  id: `edge-${newSource}-${d.id}`,
                  source: newSource,
                  target: d.id
                })
              }
              
              // Re-render mindmap với layout mới
              that.render()
              
              // Gọi callback để cập nhật data
              if (that.callbacks.onNodeUpdate) {
                that.callbacks.onNodeUpdate(d.id, { parentId: newSource })
              }
            }
          }
          
          // Reset drag state
          that.draggedNode = null
          that.dragTargetNode = null
          that.isDragStarting = false
          that.mouseUpOccurred = false
          that.dragStartPosition = null
          that.dragStartTime = null
        })
      )
      .on('mouseenter', function(event, d) {
        // Highlight node khi hover - NHẠT HƠN khi active
        that.hoveredNode = d.id
        const nodeGroup = d3.select(this)
        
        // Highlight node rect - nhạt hơn so với khi selected
        // QUAN TRỌNG: Kiểm tra selectedNode TRƯỚC KHI sử dụng
        const isSelected = that.selectedNode === d.id
        nodeGroup.select('.node-rect')
          .attr('fill', d => {
            if (isSelected) {
              // Selected: giữ màu selected (đậm)
              return '#e0e7ff'
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
        
        // Check if node has children
        const hasChildren = that.edges.some(e => e.source === d.id)
        const isCollapsed = that.collapsedNodes.has(d.id)
        
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
        
        // Call callback
        if (that.callbacks.onNodeHover) {
          that.callbacks.onNodeHover(d.id, true)
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
        that.hoveredNode = null
        const nodeGroup = d3.select(this)
        
        // Restore node rect style
        const isSelected = that.selectedNode === d.id
        nodeGroup.select('.node-rect')
          .attr('fill', d => {
            if (isSelected) return '#e0e7ff' // Selected: đậm
            return d.data?.isRoot ? '#3b82f6' : '#ffffff' // Default
          })
          .attr('stroke', d => {
            if (isSelected) return '#3b82f6'
            return d.data?.isRoot ? 'none' : '#cbd5e1'
          })
          .attr('stroke-width', 2)
        
        // ✅ LOGIC KHI KHÔNG HOVER - 3 NÚT TÁCH BIỆT:
        // 1. Nút số: giữ nếu collapsed
        // 2. Nút thêm mới: giữ nếu selected và chưa collapse
        // 3. Nút collapse mũi tên: luôn ẩn (chỉ hiện khi hover)
        
        const hasChildren = that.edges.some(e => e.source === d.id)
        const isCollapsed = that.collapsedNodes.has(d.id)
        
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
        if (that.callbacks.onNodeHover) {
          that.callbacks.onNodeHover(d.id, false)
        }
      })
    
    // Store renderer reference for click handlers (cần khai báo trước khi sử dụng)
    const renderer = this
    
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
        const count = renderer.countChildren(d.id)
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
        const count = renderer.countChildren(d.id)
        const isCollapsed = renderer.collapsedNodes.has(d.id)
        // Hiển thị nếu đã collapse và có children (kể cả khi đang selected)
        const shouldShow = (count > 0 && isCollapsed)
        if (shouldShow) {
          console.log(`✅ Button visible for node ${d.id}: count=${count}, isCollapsed=${isCollapsed}`)
        }
        return shouldShow ? 1 : 0
      })
      .style('pointer-events', d => {
        const count = renderer.countChildren(d.id)
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
        const count = this.countChildren(d.id)
        return count > 0 ? count.toString() : ''
      })
      .attr('opacity', d => {
        const count = this.countChildren(d.id)
        const isCollapsed = this.collapsedNodes.has(d.id)
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
        const count = renderer.countChildren(d.id)
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
        if (this.editingNode === d.id) {
          const nodeGroup = this.g.select(`[data-node-id="${d.id}"]`)
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
        if (this.hoveredNode === d.id) {
          return d.data?.isRoot ? '#2563eb' : '#f3f4f6'
        }
        // Selected state
        if (this.selectedNode === d.id) return '#e0e7ff'
        // Default state
        return d.data?.isRoot ? '#3b82f6' : '#ffffff'
      })
      .attr('stroke', d => {
        // Hover state takes priority
        if (this.hoveredNode === d.id) {
          return d.data?.isRoot ? 'none' : '#3b82f6'
        }
        // Selected state
        if (this.selectedNode === d.id) return '#3b82f6'
        // Default state
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
        const maxWidth = 400
        
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
          // Nếu không edit, tính toán width dựa trên nội dung (130px - 400px)
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
        const isRootNode = nodeData.data?.isRoot || nodeData.id === 'root'
        let rectWidth = parseFloat(rect.attr('width')) || currentTextareaWidth
        
        // Với root node, LUÔN dùng cache nếu có để tránh tính lại và nháy
        // Với node khác, dùng height từ rect (có thể là fixedHeight) hoặc từ nodeSize
        let rectHeight
        if (isRootNode) {
          // Root node: ưu tiên dùng cache để tránh nháy
          const cachedSize = this.nodeSizeCache.get(nodeData.id)
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
        
        // ⚠️ CRITICAL: Với root node, dùng auto để hiển thị đầy đủ nội dung
        const wrapper = fo.select('.node-content-wrapper')
          .style('width', '100%') // Wrapper chiếm 100% foreignObject
          .style('height', isRootNode ? 'auto' : '100%') // Root node dùng auto, các node khác dùng 100%
          .style('min-height', isRootNode ? '0' : '100%')
          .style('max-height', isRootNode ? 'none' : '100%')
          .style('background', bgColor)
          .style('border-radius', '8px')
          .style('overflow', isRootNode ? 'visible' : 'hidden') // Root node dùng visible, các node khác dùng hidden
          .style('border', 'none') // Không có border để không đè lên border của node-rect
          .style('outline', 'none') // Không có outline
          .style('box-sizing', 'border-box') // Đảm bảo padding/border tính trong width/height
        
        // Mount Vue TipTap editor component
        const editorContainer = wrapper.select('.node-editor-container')
          .style('width', '100%')
          .style('height', isRootNode ? 'auto' : '100%') // Root node dùng auto, các node khác dùng 100%
          .style('min-height', isRootNode ? '0' : '100%')
          .style('max-height', isRootNode ? 'none' : '100%')
          .style('pointer-events', 'none') // Disable pointer events để ngăn click khi chưa edit
          .style('overflow', isRootNode ? 'visible' : 'hidden') // Root node dùng visible, các node khác dùng hidden
          .style('box-sizing', 'border-box') // Đảm bảo padding/border tính trong width/height
        
        // Mount hoặc update Vue component
        const containerNode = editorContainer.node()
        if (containerNode) {
          // Kiểm tra xem component đã được mount chưa
          if (!this.vueApps.has(nodeData.id)) {
            // Mount component mới
            this.mountNodeEditor(nodeData.id, containerNode, {
              value: text,
              placeholder: 'Nhập...',
              color: color,
              minHeight: '43px',
              width: '100%',
              height: 'auto',
              isRoot: isRootNode,
              onInput: (value) => {
                // Handle input event - sẽ được cập nhật sau
                this.handleEditorInput(nodeData.id, value, nodeArray[idx], nodeData)
              },
              onFocus: () => {
                // Handle focus event - sẽ được cập nhật sau
                this.handleEditorFocus(nodeData.id, nodeArray[idx], nodeData)
              },
              onBlur: () => {
                // Handle blur event - sẽ được cập nhật sau
                this.handleEditorBlur(nodeData.id, nodeArray[idx], nodeData)
              },
            })
            
            // Sau khi mount editor lần đầu, đợi một chút rồi đo lại height từ editor DOM cho root node
            if (isRootNode) {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    const editor = that.getEditorInstance(nodeData.id)
                    if (editor && editor.view && editor.view.dom) {
                      const editorDOM = editor.view.dom
                      const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
                      
                      if (editorContent && editorContent.offsetHeight > 0) {
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
                                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
                                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
                          const requiredWidth = maxTextWidth + 32 + 4
                          
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
                        editorContent.style.overflow = 'visible'
                        
                        // Force reflow
                        void editorContent.offsetHeight
                        
                        // Đo height thực tế
                        const contentHeight = Math.max(
                          editorContent.offsetHeight || 0,
                          Math.ceil(19 * 1.4) + 16 // singleLineHeight
                        )
                        
                        console.log('[ROOT NODE] setTimeout - editorContent.offsetHeight:', editorContent.offsetHeight, 'final:', contentHeight)
                        
                        const currentHeight = parseFloat(rect.attr('height')) || 0
                        if (Math.abs(contentHeight - currentHeight) > 1) {
                          rect.attr('height', contentHeight)
                          fo.attr('height', Math.max(0, contentHeight - borderOffset))
                          
                          // ⚠️ CRITICAL: Với root node, LUÔN dùng auto để hiển thị đầy đủ nội dung
                          wrapper.style('height', 'auto')
                          wrapper.style('min-height', '0')
                          wrapper.style('max-height', 'none')
                          wrapper.style('overflow', 'visible')
                          editorContainer.style('height', 'auto')
                          editorContainer.style('min-height', '0')
                          editorContainer.style('max-height', 'none')
                          editorContainer.style('overflow', 'visible')
                        }
                        
                        that.nodeSizeCache.set(nodeData.id, { width: currentWidth, height: contentHeight })
                        
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
                        that.nodes.forEach(n => {
                          if (n.id === nodeData.id) {
                            newNodeSizes.set(n.id, { width: currentWidth, height: contentHeight })
                          } else {
                            const existingSize = that.nodeSizeCache.get(n.id)
                            if (existingSize) {
                              newNodeSizes.set(n.id, existingSize)
                            } else {
                              const size = that.estimateNodeSize(n)
                              newNodeSizes.set(n.id, size)
                              that.nodeSizeCache.set(n.id, size)
                            }
                          }
                        })
                        
                        const newPositions = calculateD3MindmapLayout(that.nodes, that.edges, {
                          nodeSizes: newNodeSizes,
                          layerSpacing: that.options.layerSpacing,
                          nodeSpacing: that.options.nodeSpacing,
                          padding: that.options.padding,
                          viewportHeight: that.options.height,
                          nodeCreationOrder: that.options.nodeCreationOrder || new Map(),
                          collapsedNodes: that.collapsedNodes
                        })
                        
                        that.positions = newPositions
                        
                        // Re-render với positions mới
                        const nodeGroups = that.g.selectAll('.node-group')
                        let completedCount = 0
                        const totalNodes = nodeGroups.size()
                        
                        // Nếu không có nodes, gọi callback ngay
                        if (totalNodes === 0 && that.callbacks.onRenderComplete) {
                          requestAnimationFrame(() => {
                            that.callbacks.onRenderComplete()
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
                            if (completedCount === totalNodes && that.callbacks.onRenderComplete) {
                              // Đợi thêm một chút để đảm bảo mọi thứ đã ổn định
                              setTimeout(() => {
                                that.callbacks.onRenderComplete()
                              }, 50)
                            }
                            const nodeGroup = d3.select(this)
                            const nodeId = nodeGroup.attr('data-node-id')
                            const nodeSize = that.nodeSizeCache.get(nodeId)
                            
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
                        
                        that.renderEdges(newPositions)
                      }
                    }
                  }, 200)
                })
              })
            }
            
          } else {
            // Update existing component props
            const entry = this.vueApps.get(nodeData.id)
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
  
  estimateNodeWidth(node, maxWidth = 400) {
    // Đảm bảo text luôn là string
    const text = this.getNodeLabel(node)
    const minWidth = 130 // Textarea width mặc định
    if (!text || text.trim() === '') return minWidth
    
    // Parse HTML để tách riêng title (paragraph) và description (blockquote)
    let titleText = ''
    let descriptionText = ''
    
    if (text.includes('<')) {
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = text
      
      // Lấy tất cả paragraph không trong blockquote (title)
      const paragraphs = tempDiv.querySelectorAll('p')
      paragraphs.forEach(p => {
        // Kiểm tra xem paragraph có trong blockquote không
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
      
      // Lấy tất cả text trong blockquote (description)
      const blockquotes = tempDiv.querySelectorAll('blockquote')
      blockquotes.forEach(blockquote => {
        const blockquoteText = (blockquote.textContent || blockquote.innerText || '').trim()
        if (blockquoteText) {
          descriptionText += (descriptionText ? '\n' : '') + blockquoteText
        }
      })
    } else {
      // Plain text: coi như title
      titleText = text.trim()
    }
    
    // Đo width của title (font-size 19px)
    let titleWidth = minWidth
    if (titleText) {
      const titleLines = titleText.split('\n')
      titleLines.forEach(line => {
        if (line.trim()) {
          const lineSpan = document.createElement('span')
          lineSpan.style.cssText = `
            position: absolute;
            visibility: hidden;
            font-size: 19px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            white-space: nowrap;
          `
          lineSpan.textContent = line.trim()
          document.body.appendChild(lineSpan)
          void lineSpan.offsetHeight
          titleWidth = Math.max(titleWidth, lineSpan.offsetWidth + 40) // padding + margin
          document.body.removeChild(lineSpan)
        }
      })
    }
    
    // Đo width của description (font-size 16px)
    let descriptionWidth = minWidth
    if (descriptionText) {
      const descLines = descriptionText.split('\n')
      descLines.forEach(line => {
        if (line.trim()) {
          const lineSpan = document.createElement('span')
          lineSpan.style.cssText = `
            position: absolute;
            visibility: hidden;
            font-size: 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            white-space: nowrap;
          `
          lineSpan.textContent = line.trim()
          document.body.appendChild(lineSpan)
          void lineSpan.offsetHeight
          descriptionWidth = Math.max(descriptionWidth, lineSpan.offsetWidth + 40) // padding + margin
          document.body.removeChild(lineSpan)
        }
      })
    }
    
    // Lấy width lớn nhất giữa title và description
    const measuredWidth = Math.max(titleWidth, descriptionWidth)
    
    // Clamp between min (130px) and max (400px)
    return Math.min(Math.max(measuredWidth, 130), 400)
  }
  
  // In estimateNodeHeight method, around line 1520-1580                
  estimateNodeHeight(node, nodeWidth = null) {
    let text = this.getNodeLabel(node)
    const singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px (19px * 1.4 line-height + 16px padding)
    if (!text || text.trim() === '') return singleLineHeight
    
    // Extract plain text từ HTML
    let plainText = text
    if (text.includes('<')) {
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = text
      plainText = (tempDiv.textContent || tempDiv.innerText || '').trim()
    }
    
    if (!plainText) return singleLineHeight
    
    const width = nodeWidth || this.estimateNodeWidth(node)
    
    // ⚠️ DEBUG: Log để kiểm tra
    const isRootNode = node.data?.isRoot || node.id === 'root'
    if (isRootNode) {
      console.log('[ROOT NODE] estimateNodeHeight - width:', width, 'text:', text.substring(0, 100))
    }
    
    // ⚠️ FIX: Tạo temp element với ĐÚNG STYLES và ĐÚNG STRUCTURE
    const tempDiv = document.createElement('div')
    tempDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      width: ${width}px;
      box-sizing: border-box;
      padding: 8px 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      margin: 0;
      height: auto;
      min-height: 0;
    `
    
    // ⚠️ CRITICAL: Dùng innerHTML để giữ structure (paragraph + blockquote)
    if (text.includes('<')) {
      tempDiv.innerHTML = text
      
      // Apply styles cho các elements bên trong
      const paragraphs = tempDiv.querySelectorAll('p')
      paragraphs.forEach(p => {
        p.style.margin = '0'
        p.style.padding = '0'
        p.style.fontSize = '19px'
        p.style.lineHeight = '1.4'
      })
      
      const blockquotes = tempDiv.querySelectorAll('blockquote')
      blockquotes.forEach(bq => {
        bq.style.margin = '4px 0 0 0' // Chỉ margin-top
        bq.style.padding = '0 0 0 6px' // Chỉ padding-left
        bq.style.fontSize = '16px'
        bq.style.lineHeight = '1.6'
        bq.style.whiteSpace = 'pre-wrap'
        bq.style.wordWrap = 'break-word'
        bq.style.overflowWrap = 'break-word'
        
        // Apply styles cho p trong blockquote
        const bqPs = bq.querySelectorAll('p')
        bqPs.forEach(p => {
          p.style.margin = '0'
          p.style.padding = '0'
          p.style.lineHeight = '1.6'
        })
      })
    } else {
      // Plain text: wrap trong paragraph
      const p = document.createElement('p')
      p.style.cssText = `
        margin: 0;
        padding: 0;
        font-size: 19px;
        line-height: 1.4;
        white-space: ${width >= 400 ? 'pre-wrap' : 'nowrap'};
        word-wrap: break-word;
        overflow-wrap: break-word;
      `
      p.textContent = plainText
      tempDiv.appendChild(p)
    }
    
    document.body.appendChild(tempDiv)
    
    // Force reflow
    void tempDiv.offsetWidth
    void tempDiv.offsetHeight
    
    // ⚠️ FIX: Dùng offsetHeight (chính xác, không thừa)
    const actualHeight = Math.max(
      tempDiv.offsetHeight || 0,
      singleLineHeight
    )
    
    document.body.removeChild(tempDiv)
    
    // ⚠️ DEBUG: Log chiều cao tính được
    if (isRootNode) {
      console.log('[ROOT NODE] estimateNodeHeight - tempDiv.offsetHeight:', tempDiv.offsetHeight)
      console.log('[ROOT NODE] estimateNodeHeight - calculated height:', actualHeight)
      console.log('[ROOT NODE] estimateNodeHeight - HTML content:', text)
    }
    
    // ⚠️ NEW: Không thêm buffer ở đây (đã có padding trong CSS)
    return actualHeight
  }
  
  // Get both width and height together to avoid circular dependency
  estimateNodeSize(node) {
    const isRootNode = node.data?.isRoot || node.id === 'root'
    
    // ⚠️ FIX: Root node lúc đầu KHÔNG dùng cache, luôn tính toán lại
    // Chỉ dùng cache khi đã render xong (có trong vueApps) VÀ cache hợp lý
    if (isRootNode) {
      const hasEditor = this.vueApps.has(node.id)
      if (hasEditor && this.nodeSizeCache.has(node.id)) {
        const cachedSize = this.nodeSizeCache.get(node.id)
        // ⚠️ CRITICAL: Chỉ dùng cache nếu height hợp lý (>= 43px)
        // Nếu cache có height < 43px hoặc không hợp lý, tính toán lại
        if (cachedSize && cachedSize.height >= 43) {
          return cachedSize
        }
      }
      // Chưa có editor, chưa có cache, hoặc cache không hợp lý -> tính toán lại
    } else {
      // Node thường: ưu tiên dùng fixedWidth/fixedHeight nếu có
      if (node.data && node.data.fixedWidth && node.data.fixedHeight) {
        return {
          width: node.data.fixedWidth,
          height: node.data.fixedHeight,
        }
      }
    }
    
    // Tính toán width cần thiết để chứa text
    const text = this.getNodeLabel(node)
    
    // Tính toán width
    const width = this.estimateNodeWidth(node)
    
    // Luôn tính toán height dựa trên width thực tế để hỗ trợ text wrap
    // Đặc biệt quan trọng với root node có thể có nhiều dòng
    const height = this.estimateNodeHeight(node, width)
    
    return { width, height }
  }
  
  selectNode(nodeId, skipCallback = false) {
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
    
    // ⚠️ FIX: Chỉ gọi callback nếu không skip (tránh vòng lặp vô hạn)
    // Khi deselect (nodeId === null), chỉ gọi callback nếu không skip
    if (!skipCallback && nodeId === null && this.callbacks.onNodeClick) {
      this.callbacks.onNodeClick(null)
    }
    
    // Nếu deselect, đảm bảo tất cả buttons đều được ẩn ngay lập tức
    if (nodeId === null) {
      this.g.selectAll('.node-group').each(function() {
        const nodeGroup = d3.select(this)
        nodeGroup.select('.add-child-btn')
          .interrupt()
          .attr('opacity', 0)
          .style('pointer-events', 'none')
        nodeGroup.select('.add-child-text')
          .interrupt()
          .attr('opacity', 0)
          .style('pointer-events', 'none')
      })
    }
    
    // ✅ LOGIC HIỂN THỊ NÚT - 3 NÚT TÁCH BIỆT:
    // 1. Nút số: chỉ khi collapsed (ưu tiên cao nhất)
    // 2. Nút thêm mới: chỉ khi selected và chưa collapse
    // 3. Nút collapse mũi tên: luôn ẩn (chỉ hiện khi hover)
    const that = this
    this.g.selectAll('.node-group').each(function(nodeData) {
      const isSelected = that.selectedNode === nodeData.id
      const hasChildren = that.edges.some(e => e.source === nodeData.id)
      const isCollapsed = that.collapsedNodes.has(nodeData.id)
      const nodeGroup = d3.select(this)
      
      // 1. Nút số: chỉ khi collapsed (ưu tiên cao nhất)
      if (hasChildren && isCollapsed) {
        nodeGroup.select('.collapse-btn-number')
          .attr('opacity', 1)
          .style('pointer-events', 'auto')
        nodeGroup.select('.collapse-text-number')
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
          // Ẩn ngay lập tức khi deselect (không có transition để tránh delay)
          nodeGroup.select('.add-child-btn')
            .interrupt() // Dừng transition nếu đang chạy
            .attr('opacity', 0)
            .style('pointer-events', 'none')
          nodeGroup.select('.add-child-text')
            .interrupt() // Dừng transition nếu đang chạy
            .attr('opacity', 0)
            .style('pointer-events', 'none')
        }
      }
      
      // 3. Nút collapse mũi tên: luôn ẩn (chỉ hiện khi hover trong mouseenter) và tắt pointer-events
      nodeGroup.select('.collapse-btn-arrow')
        .attr('opacity', 0)
        .style('pointer-events', 'none')
      nodeGroup.select('.collapse-arrow')
        .attr('opacity', 0)
        .style('pointer-events', 'none')
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
