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
      onNodeCollapse: null
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
        
        // Logic giống Lark: node chỉ mở rộng đến maxWidth, sau đó text wrap
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
    if (isEmpty && isFirstEdit) {
      currentHeight = singleLineHeight
    } else if (isEmpty && !isFirstEdit) {
      currentHeight = lockedHeight
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
      
      // ⚠️ FIX: Không tăng height vô tội vạ khi đang edit
      currentHeight = Math.max(measuredHeight, singleLineHeight)
      // KHÔNG lấy max với lockedHeight để tránh node to ra khi không cần
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
      
      // ⚠️ FIX: Đo height từ DOM thực tế thay vì tính toán
      let measuredHeight = singleLineHeight
      
      if (editor && editor.view && editor.view.dom) {
        const editorDOM = editor.view.dom
        const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
        
        if (editorContent) {
          const borderOffset = 4
          const foWidth = finalWidth - borderOffset
          
          // ⚠️ CRITICAL FIX: Set styles để đo chính xác
          editorContent.style.cssText = `
            box-sizing: border-box;
            width: ${foWidth}px;
            height: auto;
            min-height: ${singleLineHeight}px;
            max-height: none;
            overflow: visible;
            padding: 8px 16px;
            white-space: ${finalWidth >= maxWidth ? 'pre-wrap' : 'nowrap'};
          `
          
          // Force reflow
          void editorContent.offsetWidth
          void editorContent.offsetHeight
          
          // ⚠️ FIX: Dùng offsetHeight để lấy height chính xác
          const contentHeight = Math.max(
            editorContent.offsetHeight || 0,
            singleLineHeight
          )
          
          measuredHeight = contentHeight
        }
      }
      
      // ⚠️ FIX: Fallback chỉ khi không lấy được từ DOM
      if (measuredHeight === singleLineHeight && finalValue && finalValue.trim()) {
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
        
        // Xác định có cần wrap không dựa trên finalWidth
        const maxWidth = 400
        const willWrap = finalWidth >= maxWidth
        if (willWrap) {
          editorContent.style.whiteSpace = 'pre-wrap' // Cho phép wrap
        } else {
          editorContent.style.whiteSpace = 'nowrap' // Không wrap - text trên 1 dòng
        }
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
  
  // In render method, around line 750-800
  async render() {
    if (this.nodes.length === 0) return
    
    void document.body.offsetHeight
    
    // ⚠️ FIX: Tính toán node sizes - XÓA cache root node để tính lại
    const nodeSizes = new Map()
    this.nodes.forEach(node => {
      const isRootNode = node.data?.isRoot || node.id === 'root'
      
      if (this.editingNode === node.id && this.nodeSizeCache.has(node.id)) {
        // Node đang edit: giữ nguyên cache
        const cachedSize = this.nodeSizeCache.get(node.id)
        nodeSizes.set(node.id, cachedSize)
      } else {
        // ⚠️ FIX: Tính toán lại size (bao gồm root node)
        // KHÔNG ưu tiên cache cho root node khi reload
        const size = this.estimateNodeSize(node)
        nodeSizes.set(node.id, size)
        this.nodeSizeCache.set(node.id, size)
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
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .style('pointer-events', 'none') // Edges không chặn click vào nodes/nút
    
    // Update all edges
    const edgesUpdate = edgesEnter.merge(edges)
    
    // Hide edges to collapsed children
    edgesUpdate
      .style('opacity', d => {
        return this.isNodeHidden(d.target) ? 0 : 1
      })
      .style('pointer-events', d => {
        return this.isNodeHidden(d.target) ? 'none' : 'auto'
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
      .style('z-index', '1000') // Đảm bảo nổi trên edge
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
      .style('z-index', '1000') // Đảm bảo nổi trên edge
    
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
            nodeGroup.select('.collapse-btn-arrow')
              .transition()
              .duration(150)
              .attr('opacity', 1)
              .style('pointer-events', 'auto')
            
            nodeGroup.select('.collapse-arrow')
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
        
        // 3. Nút collapse mũi tên: chỉ ẩn nếu không còn điều kiện hiển thị
        // (mouseenter của button sẽ tự giữ nó hiển thị nếu chuột vào button)
        // hasChildren, isCollapsed, isSelected đã được khai báo ở trên
        
        // Chỉ ẩn nếu không còn điều kiện hiển thị (có children, chưa collapse, không selected)
        if (!hasChildren || isCollapsed || isSelected) {
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
        }
        // Nếu vẫn còn điều kiện hiển thị (hasChildren && !isCollapsed && !isSelected),
        // để mouseenter của button tự xử lý việc giữ nó hiển thị
        
        // Call callback
        if (that.callbacks.onNodeHover) {
          that.callbacks.onNodeHover(d.id, false)
        }
      })
    
    // Store renderer reference for click handlers (cần khai báo trước khi sử dụng)
    const renderer = this
    
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
            
            // Sau khi mount editor lần đầu, đợi một chút rồi đo lại width và height từ editor DOM cho root node
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
                      const borderOffset = 4
                      const minWidth = 130
                      const maxWidth = 400
                      let currentWidth = parseFloat(rect.attr('width')) || rectWidth
                      
                      // Lấy HTML từ editor để parse title và description
                      const editorHTML = editor.getHTML() || ''
                      
                      if (editorHTML) {
                        // Parse HTML để tách riêng title (paragraph) và description (blockquote)
                        let titleText = ''
                        let descriptionText = ''
                        
                        const tempDiv = document.createElement('div')
                        tempDiv.innerHTML = editorHTML
                        
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
                        
                        // Tính toán width đúng dựa trên text thực tế
                        if (requiredWidth < maxWidth) {
                          currentWidth = Math.max(minWidth, Math.min(requiredWidth, maxWidth))
                        } else {
                          currentWidth = maxWidth
                        }
                        
                        // Chỉ cập nhật nếu width khác với width hiện tại
                        if (Math.abs(currentWidth - parseFloat(rect.attr('width'))) > 1) {
                          // Cập nhật rect và foreignObject với width đúng
                          rect.attr('width', currentWidth)
                          const foWidth = currentWidth - borderOffset
                          fo.attr('width', Math.max(0, foWidth))
                          
                          // Cập nhật vị trí nút add-child
                          nodeGroup.select('.add-child-btn').attr('cx', currentWidth + 20)
                          nodeGroup.select('.add-child-text').attr('x', currentWidth + 20)
                        }
                      }
                      
                      // Set width và white-space đúng cho editor content
                      const foWidth = currentWidth - borderOffset
                      editorContent.style.width = `${foWidth}px`
                      const willWrap = currentWidth >= maxWidth
                      if (willWrap) {
                        editorContent.style.whiteSpace = 'pre-wrap'
                      } else {
                        editorContent.style.whiteSpace = 'nowrap'
                      }
                      
                      // Force reflow
                      void editorContent.offsetWidth
                      void editorContent.offsetHeight
                      
                      // Đo chiều cao thực tế từ DOM
                      const contentHeight = Math.max(
                        editorContent.scrollHeight || 0,
                        editorContent.offsetHeight || 0,
                        Math.ceil(19 * 1.4) + 16 // singleLineHeight
                      )
                      
                      // Cập nhật height nếu khác
                      const currentHeight = parseFloat(rect.attr('height')) || 0
                      if (Math.abs(contentHeight - currentHeight) > 1) {
                        rect.attr('height', contentHeight)
                        fo.attr('height', Math.max(0, contentHeight - borderOffset))
                        nodeGroup.select('.add-child-btn').attr('cy', contentHeight / 2)
                        nodeGroup.select('.add-child-text').attr('y', contentHeight / 2)
                      }
                      
                      // Cập nhật cache với width và height chính xác
                      this.nodeSizeCache.set(nodeData.id, { width: currentWidth, height: contentHeight })
                      
                      // Re-render edges để cập nhật vị trí kết nối với size mới
                      if (this.positions && this.positions.size > 0) {
                        this.renderEdges(this.positions)
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
    const singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px
    if (!text || text.trim() === '') return singleLineHeight
    
    // Extract plain text từ HTML
    let plainText = text
    if (text.includes('<')) {
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = text
      plainText = (tempDiv.textContent || tempDiv.innerText || '').trim()
    }
    
    const width = nodeWidth || this.estimateNodeWidth(node)
    
    // ⚠️ FIX: Tạo temp element với ĐÚNG STYLES như TipTap editor
    const tempDiv = document.createElement('div')
    tempDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: ${width >= 400 ? 'pre-wrap' : 'nowrap'};
      word-wrap: break-word;
      overflow-wrap: break-word;
      font-size: 19px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.4;
      padding: 8px 16px;
      width: ${width}px;
      box-sizing: border-box;
      overflow: visible;
    `
    
    // ⚠️ FIX: Dùng innerHTML nếu là HTML để giữ formatting
    if (text.includes('<')) {
      tempDiv.innerHTML = text
    } else {
      tempDiv.textContent = plainText
    }
    
    document.body.appendChild(tempDiv)
    
    // Force reflow
    void tempDiv.offsetWidth
    void tempDiv.offsetHeight
    
    // ⚠️ FIX: Dùng offsetHeight thay vì scrollHeight
    const actualHeight = Math.max(
      tempDiv.offsetHeight || 0, // Dùng offsetHeight
      singleLineHeight
    )
    
    document.body.removeChild(tempDiv)
    
    return actualHeight
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
    
    // Nếu deselect (nodeId === null), gọi callback để cập nhật Vue component
    if (nodeId === null && this.callbacks.onNodeClick) {
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

