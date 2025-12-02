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
    this.editingNode = null
    this.positions = new Map() // Store calculated positions
    this.nodeSizeCache = new Map() // Cache node sizes to avoid recalculating during editing
    this.vueApps = new Map() // Store Vue app instances for each node
    
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
    
    // Lấy kích thước hiện tại từ cache (được lock khi focus)
    const cachedSize = this.nodeSizeCache.get(nodeId)
    const lockedWidth = cachedSize?.width || parseFloat(rect.attr('width')) || 130
    const lockedHeight = cachedSize?.height || parseFloat(rect.attr('height')) || 43
    
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
    
    const isEmpty = !value || !value.trim()
    const isRootNode = nodeData.data?.isRoot || nodeId === 'root'
    
    // Tính toán width mới dựa trên nội dung
    let newWidth = minWidth
    if (!isEmpty) {
      // Tạo temp node để tính toán kích thước
      const tempNode = { ...nodeData, data: { ...nodeData.data, label: value } }
      newWidth = this.estimateNodeWidth(tempNode, maxWidth)
      newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth))
    }
    
    // XỬ LÝ WIDTH: Giống mindmap Lark - node chỉ mở rộng đến maxWidth, sau đó text wrap
    let currentWidth
    if (isEmpty && isFirstEdit) {
      // Nội dung rỗng VÀ edit lần đầu: reset về kích thước mặc định
      currentWidth = minWidth
      if (nodeData.data) {
        delete nodeData.data.fixedWidth
        delete nodeData.data.fixedHeight
        nodeData.data.keepSingleLine = true
      }
    } else if (isEmpty && !isFirstEdit) {
      // Nội dung rỗng NHƯNG đã có nội dung trước đó: giữ width hiện tại (không co lại khi đang edit)
      currentWidth = lockedWidth
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
        // Tính toán width cần thiết để chứa text trên 1 dòng
        const tempSpan = document.createElement('span')
        tempSpan.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: nowrap;
          font-size: 19px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `
        tempSpan.textContent = plainText.trim()
        document.body.appendChild(tempSpan)
        void tempSpan.offsetHeight
        
        const textWidth = tempSpan.offsetWidth
        const requiredWidth = textWidth + 42 // padding (32px) + margin (10px)
        document.body.removeChild(tempSpan)
        
        // Logic giống Lark: node chỉ mở rộng đến maxWidth
        // - Nếu text width < maxWidth: node width = textWidth + padding (nhưng tối thiểu minWidth)
        // - Nếu text width >= maxWidth: node width = maxWidth, text sẽ wrap
        if (requiredWidth < maxWidth) {
          // Text chưa đạt maxWidth: mở rộng node đến width cần thiết
          currentWidth = Math.max(minWidth, Math.min(requiredWidth, maxWidth))
          // Không nhỏ hơn lockedWidth khi đang edit (để tránh co lại)
          if (!isFirstEdit) {
            currentWidth = Math.max(currentWidth, lockedWidth || minWidth)
          }
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
        // Set width ngay lập tức để tránh text wrap sớm
        editorContent.style.width = `${foWidth}px`
        
        // Logic wrap giống mindmap Lark:
        // - Luôn cho phép wrap để hiển thị đủ nội dung
        // - Node sẽ mở rộng width đến maxWidth, sau đó text wrap
        editorContent.style.whiteSpace = 'pre-wrap'
        
        // Force reflow để đảm bảo width đã được áp dụng
        void editorContent.offsetWidth
      }
    }
    
    // Tính toán height mới dựa trên width và nội dung - tự động mở rộng để hiển thị đủ nội dung
    let currentHeight
    if (isEmpty && isFirstEdit) {
      // Nội dung rỗng VÀ edit lần đầu: reset về chiều cao mặc định (1 dòng)
      currentHeight = singleLineHeight
    } else if (isEmpty && !isFirstEdit) {
      // Nội dung rỗng NHƯNG đã có nội dung trước đó: giữ height hiện tại (không co lại khi đang edit)
      currentHeight = lockedHeight
    } else {
      // Có nội dung: đo chiều cao trực tiếp từ TipTap editor DOM để đảm bảo chính xác
      const editorInstance = this.getEditorInstance(nodeId)
      let measuredHeight = singleLineHeight
      
      if (editorInstance && editorInstance.view && editorInstance.view.dom) {
        const editorDOM = editorInstance.view.dom
        // TipTap editor có class 'mindmap-editor-prose' và nội dung được render trong đó
        const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
        
        if (editorContent) {
          // Editor đã có width đúng từ foreignObject, giờ đo height
          // Đảm bảo editor có width đúng để đo height chính xác
          const foWidth = currentWidth - borderOffset
          editorContent.style.width = `${foWidth}px`
          editorContent.style.height = 'auto' // Auto để đo được scrollHeight chính xác
          editorContent.style.minHeight = `${singleLineHeight}px`
          editorContent.style.maxHeight = 'none' // Cho phép mở rộng không giới hạn
          
          // Đảm bảo white-space cho phép wrap
          editorContent.style.whiteSpace = 'pre-wrap'
          
          // Force reflow nhiều lần để đảm bảo DOM đã cập nhật và text đã wrap
          void editorContent.offsetWidth
          void editorContent.offsetHeight
          void editorContent.scrollHeight
          
          // Đo chiều cao thực tế của nội dung (scrollHeight cho biết chiều cao đầy đủ)
          const contentHeight = Math.max(
            editorContent.scrollHeight || 0,
            editorContent.offsetHeight || 0,
            singleLineHeight
          )
          
          measuredHeight = contentHeight
          
          // Đợi một frame để đo lại nếu cần (để xử lý trường hợp text wrap chưa hoàn tất)
          requestAnimationFrame(() => {
            const updatedHeight = Math.max(
              editorContent.scrollHeight || 0,
              editorContent.offsetHeight || 0,
              singleLineHeight,
              lockedHeight
            )
            
            if (updatedHeight > measuredHeight) {
              measuredHeight = updatedHeight
              currentHeight = Math.max(measuredHeight, singleLineHeight, lockedHeight)
              
              // Cập nhật height
              rect.attr('height', currentHeight)
              fo.attr('height', Math.max(0, currentHeight - borderOffset))
              
              // Cập nhật vị trí nút add-child
              nodeGroup.select('.add-child-btn').attr('cy', currentHeight / 2)
              nodeGroup.select('.add-child-text').attr('y', currentHeight / 2)
              
              // Cập nhật cache
              this.nodeSizeCache.set(nodeId, { width: currentWidth, height: currentHeight })
            }
          })
        }
      } else {
        // Fallback: tính toán từ text nếu không lấy được editor DOM
        const tempNode = { ...nodeData, data: { ...nodeData.data, label: value } }
        measuredHeight = this.estimateNodeHeight(tempNode, currentWidth)
      }
      
      // Tất cả các node (bao gồm root) dùng logic giống nhau: chỉ mở rộng (không co lại khi đang edit)
      currentHeight = Math.max(measuredHeight, singleLineHeight, lockedHeight)
    }
    
    // Cập nhật height của node-rect và foreignObject
    rect.attr('height', currentHeight)
    fo.attr('height', Math.max(0, currentHeight - borderOffset))
    
    // Cập nhật wrapper và editor container
    const wrapper = fo.select('.node-content-wrapper')
    wrapper.style('width', '100%')
    wrapper.style('height', '100%')
    
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
    // Tương tự textarea on('focus') handler
    this.selectNode(nodeId)
    
    const nodeGroup = d3.select(foElement.parentNode)
    nodeGroup.raise()
    
    const fo = d3.select(foElement)
    const rect = nodeGroup.select('.node-rect')
    
    const cachedSize = this.nodeSizeCache.get(nodeId)
    const currentRectWidth = cachedSize?.width || parseFloat(rect.attr('width')) || 130
    const currentRectHeight = cachedSize?.height || parseFloat(rect.attr('height')) || 43
    
    const currentText = this.getNodeLabel(nodeData)
    const isFirstEdit = !currentText || !currentText.trim()
    
    const lockedWidth = currentRectWidth
    const lockedHeight = currentRectHeight
    
    this.nodeSizeCache.set(nodeId, { width: lockedWidth, height: lockedHeight })
    
    rect.attr('width', lockedWidth)
    rect.attr('height', lockedHeight)
    
    const borderOffset = 4
    fo.attr('x', 2).attr('y', 2)
    fo.attr('width', Math.max(0, lockedWidth - borderOffset))
    fo.attr('height', Math.max(0, lockedHeight - borderOffset))
    
    // Enable pointer events
    const editorContainer = fo.select('.node-editor-container')
    editorContainer.style('pointer-events', 'auto')
    
    // Nếu là lần đầu chỉnh sửa và text là "Nhánh mới", select all text
    const isDefaultText = currentText === 'Nhánh mới' || (isFirstEdit && currentText)
    if (isDefaultText) {
      // Đợi một chút để editor sẵn sàng, sau đó select all text
      setTimeout(() => {
        const editorInstance = this.getEditorInstance(nodeId)
        if (editorInstance && editorInstance.view) {
          // Select all text trong editor bằng ProseMirror API
          const { state } = editorInstance.view
          const { doc } = state
          
          // Select từ đầu đến cuối document
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
    // Tương tự textarea on('blur') handler
    const editor = this.getEditorInstance(nodeId)
    // Lưu HTML để giữ formatting (bold, italic, etc.)
    const finalValue = editor ? editor.getHTML() : (nodeData.data?.label || '')
    
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
      finalWidth = minWidth
      finalHeight = singleLineHeight
    } else {
      const tempNode = { ...nodeData, data: { ...nodeData.data, label: finalValue } }
      if (tempNode.data) {
        delete tempNode.data.fixedWidth
        delete tempNode.data.fixedHeight
      }
      
      const calculatedWidth = this.estimateNodeWidth(tempNode)
      finalWidth = Math.max(calculatedWidth, minWidth)
      
      // LUÔN tính toán height dựa trên nội dung thực tế để hỗ trợ nhiều dòng
      // Đo trực tiếp từ TipTap editor DOM để đảm bảo chính xác
      let measuredHeight = singleLineHeight
      
      if (editor && editor.view && editor.view.dom) {
        const editorDOM = editor.view.dom
        const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
        
        if (editorContent) {
          // Đảm bảo editor có width đúng để đo height chính xác
          const borderOffset = 4
          const foWidth = finalWidth - borderOffset
          editorContent.style.width = `${foWidth}px`
          editorContent.style.height = 'auto' // Auto để đo được scrollHeight chính xác
          editorContent.style.minHeight = `${singleLineHeight}px`
          editorContent.style.maxHeight = 'none'
          
          // Đảm bảo white-space cho phép wrap để đo height đúng
          editorContent.style.whiteSpace = 'pre-wrap'
          
          // Force reflow để đảm bảo DOM đã cập nhật
          void editorContent.offsetWidth
          void editorContent.offsetHeight
          void editorContent.scrollHeight
          
          // Đo chiều cao thực tế (scrollHeight cho biết chiều cao đầy đủ của nội dung)
          const contentHeight = Math.max(
            editorContent.scrollHeight || 0,
            editorContent.offsetHeight || 0,
            singleLineHeight
          )
          
          measuredHeight = contentHeight
        }
      }
      
      // Fallback: tính toán từ text nếu không lấy được từ editor DOM
      if (measuredHeight === singleLineHeight) {
        const calculatedHeight = this.estimateNodeHeight(tempNode, finalWidth)
        measuredHeight = Math.max(calculatedHeight, singleLineHeight)
      }
      
      finalHeight = measuredHeight
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
    
    // Đảm bảo wrapper và editor container có height đúng để hiển thị đầy đủ nội dung
    const wrapper = fo.select('.node-content-wrapper')
    if (wrapper.node()) {
      wrapper.style('width', '100%')
      wrapper.style('height', '100%')
      wrapper.style('overflow', 'hidden') // Hidden để không bị tràn ra ngoài
    }
    
    // Disable pointer events
    const editorContainer = fo.select('.node-editor-container')
    if (editorContainer.node()) {
      editorContainer.style('pointer-events', 'none')
        .style('width', '100%')
        .style('height', '100%') // 100% để fit vào wrapper
        .style('overflow', 'hidden') // Hidden để không bị tràn
    }
    
    // Đảm bảo editor có height đúng để hiển thị đầy đủ nội dung
    if (editor && editor.view && editor.view.dom) {
      const editorDOM = editor.view.dom
      const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
      if (editorContent) {
        editorContent.style.height = 'auto' // Auto để có thể mở rộng theo nội dung
        editorContent.style.minHeight = '43px'
        editorContent.style.maxHeight = 'none'
        editorContent.style.overflow = 'visible' // Visible để hiển thị đủ nội dung
        editorContent.style.whiteSpace = 'pre-wrap' // Cho phép wrap
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
      const isRootNode = node.data?.isRoot || node.id === 'root'
      
      // Nếu node đang được edit, dùng size từ cache (giữ width cố định)
      if (this.editingNode === node.id && this.nodeSizeCache.has(node.id)) {
        const cachedSize = this.nodeSizeCache.get(node.id)
        nodeSizes.set(node.id, cachedSize)
      } else if (isRootNode) {
        // Với root node, luôn dùng size từ cache nếu có (đã được cập nhật trong handleEditorBlur)
        // Nếu chưa có cache, tính toán một lần và lưu vào cache
        // Tránh tính toán lại để không bị nháy
        if (this.nodeSizeCache.has(node.id)) {
          const cachedSize = this.nodeSizeCache.get(node.id)
          nodeSizes.set(node.id, cachedSize)
        } else {
          // Lần đầu render, tính toán và lưu vào cache
          const size = this.estimateNodeSize(node)
          nodeSizes.set(node.id, size)
          this.nodeSizeCache.set(node.id, size)
        }
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
    
    edges.exit().remove()
    
    const edgesEnter = edges.enter()
      .append('path')
      .attr('class', 'edge')
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .style('pointer-events', 'none')
    
    const edgesUpdate = edgesEnter.merge(edges)
    
    edgesUpdate.attr('d', d => {
      const sourcePos = positions.get(d.source)
      const targetPos = positions.get(d.target)
      
      if (!sourcePos || !targetPos) return ''
      
      const sourceNode = this.nodes.find(n => n.id === d.source)
      const targetNode = this.nodes.find(n => n.id === d.target)
      const sourceSize = this.estimateNodeSize(sourceNode)
      const targetSize = this.estimateNodeSize(targetNode)
      const sourceWidth = sourceSize.width
      const sourceHeight = sourceSize.height
      const targetWidth = targetSize.width
      const targetHeight = targetSize.height
      
      // QUAN TRỌNG: Edge luôn kết nối tại CÙNG MỘT ĐỘ CAO (Y position)
      // để tạo đường thẳng ngang hoàn hảo
      // Source: right edge, center vertically
      const x1 = sourcePos.x + sourceWidth
      const y1 = sourcePos.y + (sourceHeight / 2)
      
      // Target: left edge, center vertically  
      const x2 = targetPos.x
      const y2 = targetPos.y + (targetHeight / 2)
      
      const dx = x2 - x1
      const dy = y2 - y1
      
      // Nếu 2 node gần như thẳng hàng (dy rất nhỏ), vẽ đường thẳng
      if (Math.abs(dy) < 2) {
        return `M ${x1} ${y1} L ${x2} ${y2}`
      }
      
      // Với khoảng cách lớn hơn, dùng đường cong mượt mà
      const direction = dy >= 0 ? 1 : -1
      
      // Điều chỉnh độ cong dựa trên khoảng cách ngang
      // Khoảng cách càng xa, độ cong càng lớn (nhưng có giới hạn)
      const horizontalOffset = Math.min(Math.abs(dx) * 0.5, 100)
      const cornerRadius = Math.min(
        20,
        Math.abs(dy) / 2,
        horizontalOffset / 3
      )
      
      // Nếu khoảng cách ngang quá ngắn, vẽ đường thẳng
      if (horizontalOffset < cornerRadius * 2 + 4) {
        return `M ${x1} ${y1} L ${x2} ${y2}`
      }
      
      const midX = x1 + horizontalOffset
      
      // Vẽ đường cong S-shape mượt mà
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
      .append('xhtml:div')
      .attr('class', 'node-editor-container')
      .attr('data-node-id', d => d.id)
    
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
        // Kiểm tra xem click có phải từ editor hoặc nút add-child không
        const target = event.target
        const isEditorClick = target && (
          target.closest('.mindmap-node-editor') || 
          target.closest('.mindmap-editor-content') ||
          target.closest('.mindmap-editor-prose')
        )
        const isAddChildClick = target && (target.classList?.contains('add-child-btn') || target.classList?.contains('add-child-text'))
        
        if (isEditorClick || isAddChildClick) {
          // Click vào editor hoặc nút -> không xử lý ở đây
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
          if (this.nodeSizeCache.has(nodeData.id)) {
            const cachedSize = this.nodeSizeCache.get(nodeData.id)
            rectHeight = cachedSize.height
            // Đảm bảo width cũng được cập nhật từ cache
            if (rectWidth !== cachedSize.width) {
              rect.attr('width', cachedSize.width)
              rectWidth = cachedSize.width
            }
          } else {
            // Nếu chưa có cache (lần đầu render), dùng từ nodeSize và lưu vào cache
            rectHeight = nodeSize.height
            this.nodeSizeCache.set(nodeData.id, { width: rectWidth, height: rectHeight })
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
        const wrapper = fo.select('.node-content-wrapper')
          .style('width', '100%') // Wrapper chiếm 100% foreignObject
          .style('height', '100%') // Tất cả node (bao gồm root) dùng 100% giống nhau
          .style('background', bgColor)
          .style('border-radius', '8px')
          .style('overflow', 'hidden') // Hidden để không bị tràn ra ngoài
          .style('border', 'none') // Không có border để không đè lên border của node-rect
          .style('outline', 'none') // Không có outline
          .style('box-sizing', 'border-box') // Đảm bảo padding/border tính trong width/height
        
        // Mount Vue TipTap editor component
        const editorContainer = wrapper.select('.node-editor-container')
          .style('width', '100%')
          .style('height', '100%') // 100% để fit vào wrapper
          .style('pointer-events', 'none') // Disable pointer events để ngăn click khi chưa edit
          .style('overflow', 'hidden') // Hidden để không bị tràn ra ngoài
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
            // Để đảm bảo root node hiển thị đủ nội dung ngay từ đầu
            if (isRootNode) {
              // Sử dụng requestAnimationFrame để đảm bảo DOM đã render xong
              requestAnimationFrame(() => {
                setTimeout(() => {
                  const editor = this.getEditorInstance(nodeData.id)
                  if (editor && editor.view && editor.view.dom) {
                    const editorDOM = editor.view.dom
                    const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
                    
                    if (editorContent && editorContent.offsetHeight > 0) {
                      // Đảm bảo editor có width đúng để đo height chính xác
                      const borderOffset = 4
                      const currentWidth = parseFloat(rect.attr('width')) || rectWidth
                      const foWidth = currentWidth - borderOffset
                      editorContent.style.width = `${foWidth}px`
                      
                      // Force reflow
                      void editorContent.offsetWidth
                      void editorContent.offsetHeight
                      
                      // Đo chiều cao thực tế từ DOM
                      const contentHeight = Math.max(
                        editorContent.scrollHeight || 0,
                        editorContent.offsetHeight || 0,
                        Math.ceil(19 * 1.4) + 16 // singleLineHeight
                      )
                      
                      // Nếu height khác với height hiện tại, cập nhật lại
                      const currentHeight = parseFloat(rect.attr('height')) || 0
                      if (Math.abs(contentHeight - currentHeight) > 1) {
                        // Cập nhật rect
                        rect.attr('height', contentHeight)
                        
                        // Cập nhật foreignObject
                        fo.attr('height', Math.max(0, contentHeight - borderOffset))
                        
                        // Cập nhật vị trí nút add-child
                        nodeGroup.select('.add-child-btn').attr('cy', contentHeight / 2)
                        nodeGroup.select('.add-child-text').attr('y', contentHeight / 2)
                        
                        // Cập nhật cache
                        this.nodeSizeCache.set(nodeData.id, { width: currentWidth, height: contentHeight })
                        
                        // Không trigger layout update ngay lập tức để tránh nháy
                        // Layout sẽ được update tự động khi cần thiết
                      }
                    }
                  }
                }, 150) // Đợi 150ms để đảm bảo editor DOM đã render xong hoàn toàn
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
    
    // Extract plain text từ HTML nếu cần (để đo width chính xác)
    let plainText = text
    if (text.includes('<')) {
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = text
      plainText = (tempDiv.textContent || tempDiv.innerText || '').trim()
    }
    
    if (!plainText || plainText.trim() === '') return minWidth
    
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
    tempDiv.textContent = plainText
    document.body.appendChild(tempDiv)
    
    // Force reflow để đảm bảo text đã được render
    void tempDiv.offsetHeight
    
    // Split text thành các dòng
    const lines = plainText.split('\n')
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
        // Padding: 16px mỗi bên = 32px, cộng thêm margin (8px) để đảm bảo không bị wrap
        measuredWidth = Math.max(measuredWidth, lineSpan.offsetWidth + 40)
        // Đảm bảo tối thiểu 130px
        measuredWidth = Math.max(measuredWidth, 130)
        document.body.removeChild(lineSpan)
      }
    })
    
    document.body.removeChild(tempDiv)
    
    // Clamp between min (130px) and max (400px)
    return Math.min(Math.max(measuredWidth, 130), 400)
  }
  
  estimateNodeHeight(node, nodeWidth = null) {
    // Đảm bảo text luôn là string
    let text = this.getNodeLabel(node)
    // Chiều cao 1 dòng = font-size * line-height + padding
    // 19px * 1.4 + 16px (padding top/bottom) = ~43px
    const singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px cho 1 dòng
    if (!text || text.trim() === '') return singleLineHeight
    
    // Extract plain text từ HTML nếu text là HTML (từ TipTap editor)
    // TipTap lưu nội dung dưới dạng HTML, nhưng khi đo height cần plain text
    if (text.includes('<') && text.includes('>')) {
      const tempDiv2 = document.createElement('div')
      tempDiv2.innerHTML = text
      text = (tempDiv2.textContent || tempDiv2.innerText || '').trim()
    }
    
    // Use provided width or estimate
    const width = nodeWidth || this.estimateNodeWidth(node)
    
    // LUÔN tính toán height dựa trên width thực tế để hỗ trợ text wrap
    // Không chỉ dựa trên việc có line breaks hay width đủ lớn
    // Vì text có thể wrap thành nhiều dòng ngay cả khi không có \n
    // Create a temporary element to measure text height accurately
    const tempDiv = document.createElement('div')
    tempDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: break-word;
      font-size: 19px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.4;
      padding: 8px 16px;
      width: ${width}px;
      box-sizing: border-box;
    `
    // Sử dụng plain text (đã extract từ HTML nếu cần)
    tempDiv.textContent = text
    document.body.appendChild(tempDiv)
    
    // Force reflow để đảm bảo text đã được render và wrap đúng
    void tempDiv.offsetWidth
    void tempDiv.offsetHeight
    
    // Lấy chiều cao thực tế
    // scrollHeight cho biết chiều cao đầy đủ của nội dung (bao gồm cả phần bị ẩn do overflow)
    // offsetHeight cho biết chiều cao hiển thị của element
    // Với text dài, cần dùng scrollHeight để lấy chiều cao đầy đủ
    const actualHeight = Math.max(
      tempDiv.scrollHeight || 0,
      tempDiv.offsetHeight || 0
    )
    document.body.removeChild(tempDiv)
    
    // Trả về chiều cao thực tế, đảm bảo ít nhất bằng chiều cao 1 dòng
    return Math.max(actualHeight, singleLineHeight)
  }
  
  // Get both width and height together to avoid circular dependency
  estimateNodeSize(node) {
    // Nếu node có fixedWidth/fixedHeight (được set khi blur), ưu tiên dùng để
    // đảm bảo kích thước sau render giống hệt lúc đang edit
    const isRootNode = node.data?.isRoot || node.id === 'root'
    
    // Với root node, ưu tiên dùng cache nếu có để tránh tính toán lại gây nháy
    if (isRootNode && this.nodeSizeCache.has(node.id)) {
      return this.nodeSizeCache.get(node.id)
    }
    
    // Với node thường, ưu tiên dùng fixedWidth/fixedHeight nếu có
    if (node.data && node.data.fixedWidth && node.data.fixedHeight && !isRootNode) {
      return {
        width: node.data.fixedWidth,
        height: node.data.fixedHeight,
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

