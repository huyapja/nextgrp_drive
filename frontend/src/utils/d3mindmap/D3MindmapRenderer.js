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

import * as d3 from "d3"
import { calculateD3MindmapLayout } from "../d3MindmapLayout"
import { renderEdges } from "./edgeRendering.js"
import { selectCommentNode } from "./nodeCommentSelection.js"
import {
  getEditorInstance,
  handleEditorBlur,
  handleEditorFocus,
  handleEditorInput,
  mountNodeEditor,
  unmountNodeEditor,
} from "./nodeEditor.js"
import { renderNodes } from "./nodeRendering.js"
import { selectNode } from "./nodeSelection.js"
import {
  estimateNodeHeight,
  estimateNodeSize,
  estimateNodeWidth,
} from "./nodeSize.js"
import {
  cleanupDragBranchEffects,
  countChildren,
  getDescendantIds,
  getNodeLabel,
  isDescendant,
  isNodeHidden,
} from "./utils.js"
import { fitView, scrollToNode } from "./viewUtils.js"

export class D3MindmapRenderer {
  constructor(container, options = {}) {
    this.container = container
    this.options = {
      width: options.width || window.innerWidth,
      height: options.height || window.innerHeight - 84,
      nodeSpacing: options.nodeSpacing || 50, // Khoảng cách dọc giữa siblings
      layerSpacing: options.layerSpacing || 180, // Khoảng cách ngang giữa layers
      padding: options.padding || 20, // Padding chung
      ...options,
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
    this.hasMovedEnough = false // Flag để track xem đã di chuyển > 5px chưa (để phân biệt click và drag)
    this.dragGhostEdges = null // Thông tin về ghost edges để cập nhật khi drag
    this.dragBranchGhost = null // Rect bao quanh nhánh ở vị trí cũ
    this.dragBranchNodeIds = [] // Danh sách các node ID trong nhánh để restore sau
    this.dragStartNodeInfo = null // Thông tin node khi bắt đầu drag (để tạo ghost sau khi di chuyển đủ)
    this.taskLinkDragConfirmed = new Set() // Set các node ID đã được confirm khi drag (có task link)
    this.taskLinkDragChecked = false // Flag để đảm bảo chỉ kiểm tra task link một lần khi bắt đầu drag
    this.newlyCreatedNodes = new Map() // Map nodeId -> timestamp để track các node mới được tạo
    this.nodesBeingFocused = new Set() // Set các node ID đang trong quá trình focus (để prevent blur)

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
      onRenderComplete: null, // Callback khi render hoàn tất
      onTaskLinkDragConfirm: null, // Callback để hiển thị dialog cảnh báo khi drag node có task link
    }

    this.init()
  }

  init() {
    // Clear container
    d3.select(this.container).selectAll("*").remove()

    // Create SVG
    this.svg = d3
      .select(this.container)
      .append("svg")
      .attr("width", this.options.width)
      .attr("height", this.options.height)
      .style("background", "#f5f5f5")

    // Create main group for zoom/pan
    this.g = this.svg.append("g")

    // Setup zoom
    this.zoom = d3
      .zoom()
      .scaleExtent([0.5, 2])
      .wheelDelta((event) => {
        // Điều chỉnh độ nhạy zoom - giá trị âm để zoom in khi scroll down
        return -event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.001)
      })
      .filter((event) => {
        // Xử lý wheel events - chỉ zoom khi có Ctrl/Meta
        if (event.type === "wheel") {
          // Luôn yêu cầu Ctrl/Meta để zoom
          return !!(event.ctrlKey || event.metaKey)
        }

        // Cho phép middle mouse button và right mouse button để pan
        if (event.type === "mousedown") {
          return event.button === 1 || event.button === 2 // Middle hoặc right mouse button
        }

        // Chặn các events khác (không cho phép left-click drag)
        return false
      })
      .on("zoom", (event) => {
        this.g.attr("transform", event.transform)
      })

    this.svg.call(this.zoom)

    // ⚠️ CRITICAL: Xử lý wheel event để scroll nội dung mindmap
    // Khi không có Ctrl/Meta: scroll/pan nội dung mindmap
    // Khi có Ctrl/Meta: zoom như bình thường
    const svgNode = this.svg.node()
    if (svgNode) {
      svgNode.addEventListener(
        "wheel",
        (event) => {
          // Nếu có Ctrl/Meta: zoom (đã được xử lý bởi d3.zoom)
          if (event.ctrlKey || event.metaKey) {
            // Ngăn browser zoom mặc định
            event.preventDefault()
          } else {
            // ⚠️ CRITICAL: Khi không có Ctrl/Meta, scroll/pan nội dung mindmap
            event.preventDefault()

            // Lấy transform hiện tại
            const currentTransform = d3.zoomTransform(this.g.node())

            // Tính toán delta scroll
            const deltaX = event.deltaX || 0
            const deltaY = event.deltaY || 0

            // Tạo transform mới với translation mới
            const newTransform = currentTransform.translate(
              -deltaX / currentTransform.k, // Chia cho scale để đảm bảo scroll distance không đổi khi zoom
              -deltaY / currentTransform.k
            )

            // Áp dụng transform mới
            this.g.attr("transform", newTransform)

            // Cập nhật zoom transform để giữ state đồng bộ
            this.svg.call(this.zoom.transform, newTransform)
          }
        },
        { passive: false, capture: true }
      )

      // Xử lý click ra ngoài để deselect node và ẩn icon collapse khi hover
      // Dùng capture phase để bắt event trước khi nó đến node-group
      svgNode.addEventListener(
        "click",
        (event) => {
          // Kiểm tra xem click có phải vào node, button, hoặc editor không
          const target = event.target
          const isNodeClick =
            target &&
            (target.closest(".node-group") ||
              target.closest(".mindmap-node-editor") ||
              target.closest(".mindmap-editor-content") ||
              target.closest(".mindmap-editor-prose") ||
              target.classList?.contains("node-group") ||
              target.classList?.contains("add-child-btn") ||
              target.classList?.contains("add-child-text") ||
              target.classList?.contains("collapse-btn-number") ||
              target.classList?.contains("collapse-text-number") ||
              target.classList?.contains("collapse-btn-arrow") ||
              target.classList?.contains("collapse-arrow") ||
              target.closest(".add-child-btn") ||
              target.closest(".add-child-text") ||
              target.closest(".collapse-btn-number") ||
              target.closest(".collapse-text-number") ||
              target.closest(".collapse-btn-arrow") ||
              target.closest(".collapse-arrow"))

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
            this.g.selectAll(".node-group").each(function () {
              const nodeGroup = d3.select(this)
              nodeGroup
                .select(".add-child-btn")
                .interrupt()
                .attr("opacity", 0)
                .style("pointer-events", "none")
              nodeGroup
                .select(".add-child-text")
                .interrupt()
                .attr("opacity", 0)
                .style("pointer-events", "none")
              nodeGroup
                .select(".collapse-btn-arrow")
                .interrupt()
                .attr("opacity", 0)
                .style("pointer-events", "none")
              nodeGroup
                .select(".collapse-arrow")
                .interrupt()
                .attr("opacity", 0)
                .style("pointer-events", "none")
            })

            // Gọi callback để update state
            if (this.callbacks.onNodeHover) {
              this.callbacks.onNodeHover(null, false)
            }
          }
        },
        true
      ) // Dùng capture phase để bắt event trước

      // ⚠️ CRITICAL: Ngăn context menu khi đang drag với right mouse button
      // Thêm listener ở cả SVG level và document level để chắc chắn bắt được
      const contextMenuHandler = (event) => {
        // Kiểm tra xem event có phải từ mindmap container không
        const target = event.target
        const isInMindmap = target && (
          target.closest('.d3-mindmap-container') ||
          target.closest('.d3-mindmap-wrapper') ||
          svgNode.contains(target)
        )
        
        // Chỉ ngăn context menu nếu event từ mindmap
        if (isInMindmap) {
          // Kiểm tra xem có đã di chuyển đủ không
          let hasMoved = this.hasMovedEnough
          
          // Nếu chưa có flag hasMovedEnough, kiểm tra vị trí thực tế
          if (!hasMoved && this._rightButtonDownPos) {
            const deltaX = Math.abs(event.clientX - this._rightButtonDownPos.x)
            const deltaY = Math.abs(event.clientY - this._rightButtonDownPos.y)
            hasMoved = deltaX > 10 || deltaY > 10
          }
          
          // Nếu đang drag với right button và đã di chuyển đủ, ngăn context menu
          // Sử dụng flag shouldPreventContextMenu để đảm bảo ngăn context menu sau khi drag end
          if (this.shouldPreventContextMenu || (this.isRightButtonDrag && hasMoved)) {
            event.preventDefault()
            event.stopPropagation()
            // Reset flag sau khi đã ngăn context menu
            this.isRightButtonDrag = false
            this._rightButtonDownPos = null
            return false
          } else if (this.isRightButtonDrag && !hasMoved) {
            // Chỉ click, không drag - cho phép context menu, reset flag
            this.isRightButtonDrag = false
            this._rightButtonDownPos = null
          }
        }
      }
      
      svgNode.addEventListener("contextmenu", contextMenuHandler, true)
      
      // Thêm listener ở document level với capture để chắc chắn bắt được context menu trước
      document.addEventListener("contextmenu", contextMenuHandler, true)
      
      // Lưu handler để có thể remove sau
      this._contextMenuHandler = contextMenuHandler
      
      // ⚠️ CRITICAL: Thêm listener mousedown ở document level để track right button drag
      // Không preventDefault ở đây để cho phép context menu nếu chỉ click (không drag)
      const mouseDownHandler = (event) => {
        // Chỉ xử lý nếu là right button và trong mindmap container
        if (event.button === 2) {
          const target = event.target
          const isInMindmap = target && (
            target.closest('.d3-mindmap-container') ||
            target.closest('.d3-mindmap-wrapper') ||
            svgNode.contains(target)
          )
          
          if (isInMindmap) {
            // Set flag ngay khi mousedown với right button
            // Nhưng chưa preventDefault - sẽ preventDefault trong contextmenu nếu đã drag
            this.isRightButtonDrag = true
            this._rightButtonDownTime = Date.now()
            this._rightButtonDownPos = { x: event.clientX, y: event.clientY }
          }
        }
      }
      
      document.addEventListener("mousedown", mouseDownHandler, true)
      this._mouseDownHandler = mouseDownHandler
      
      // Track mouseup để reset flag nếu không drag
      const mouseUpHandler = (event) => {
        if (event.button === 2 && this.isRightButtonDrag) {
          // Nếu không di chuyển đủ, reset flag để cho phép context menu
          if (!this.hasMovedEnough) {
            // Kiểm tra lại xem có di chuyển không
            if (this._rightButtonDownPos) {
              const deltaX = Math.abs(event.clientX - this._rightButtonDownPos.x)
              const deltaY = Math.abs(event.clientY - this._rightButtonDownPos.y)
              if (deltaX <= 10 && deltaY <= 10) {
                // Chỉ click, không drag - cho phép context menu
                this.isRightButtonDrag = false
              }
            }
          }
        }
      }
      
      document.addEventListener("mouseup", mouseUpHandler, true)
      this._mouseUpHandler = mouseUpHandler
    }

    // Add background grid
    this.addGrid()
  }

  addGrid() {
    const dotSize = 20
    const dotRadius = 1

    const pattern = this.svg
      .append("defs")
      .append("pattern")
      .attr("id", "grid")
      .attr("width", dotSize)
      .attr("height", dotSize)
      .attr("patternUnits", "userSpaceOnUse") // Dùng userSpaceOnUse để pattern không scale theo zoom, tạo cảm giác vô cực

    // Tạo chấm bi tại góc trên bên trái của pattern
    pattern
      .append("circle")
      .attr("cx", dotRadius)
      .attr("cy", dotRadius)
      .attr("r", dotRadius)
      .attr("fill", "#ddd")

    // Tạo background rect với kích thước lớn hơn viewport để đảm bảo hiển thị vô cực khi pan/zoom
    // Dùng kích thước rất lớn để có thể pan/zoom nhiều
    const largeSize = 100000
    this.g
      .append("rect")
      .attr("x", -largeSize / 2)
      .attr("y", -largeSize / 2)
      .attr("width", largeSize)
      .attr("height", largeSize)
      .attr("fill", "url(#grid)")
      .lower() // Đặt background ở dưới cùng
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  // Helper function để lấy label một cách an toàn (luôn trả về string)
  getNodeLabel(node) {
    return getNodeLabel(node)
  }

  adjustTextareaHeight(textarea, minHeight = null) {
    if (!textarea) return 0

    // Chiều cao 1 dòng = font-size * line-height + padding
    const singleLineHeight = minHeight || Math.ceil(19 * 1.4) + 16 // ~43px

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
    return mountNodeEditor(this, nodeId, container, props)
  }

  // Unmount Vue component
  unmountNodeEditor(nodeId) {
    return unmountNodeEditor(this, nodeId)
  }

  // Get editor instance từ Vue app
  getEditorInstance(nodeId) {
    return getEditorInstance(this, nodeId)
  }

  // Handler cho editor input event
  handleEditorInput(nodeId, value, foElement, nodeData) {
    return handleEditorInput(this, nodeId, value, foElement, nodeData)
  }

  // Handler cho editor focus event
  handleEditorFocus(nodeId, foElement, nodeData) {
    return handleEditorFocus(this, nodeId, foElement, nodeData)
  }

  // Handler cho editor blur event
  handleEditorBlur(nodeId, foElement, nodeData) {
    return handleEditorBlur(this, nodeId, foElement, nodeData)
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
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => setTimeout(resolve, 100)) // Đợi thêm 100ms

    this.nodes.forEach((node) => {
      const isRootNode = node.data?.isRoot || node.id === "root"

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
          } else {
            // Cache không hợp lý hoặc chưa có -> tính toán lại
            size = this.estimateNodeSize(node)
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
      collapsedNodes: this.collapsedNodes,
    })

    this.positions = positions

    // ⚠️ FIX: Render nodes trước
    this.renderNodes(positions)

    // ⚠️ FIX: Đợi DOM update trước khi render edges
    await new Promise((resolve) => requestAnimationFrame(resolve))

    // Render edges sau
    this.renderEdges(positions)

    // ⚠️ CRITICAL: Sau khi render edges, raise tất cả node-group lên trên edge
    // để đảm bảo các nút collapse button không bị edge đè lên
    this.g.selectAll(".node-group").raise()

    // ⚠️ Nếu đây là lần render đầu tiên và không có root node cần setTimeout
    // thì gọi callback ngay (vì không có transition)
    if (isInitialRender) {
      const rootNode = this.nodes.find((n) => n.data?.isRoot || n.id === "root")
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
    return isNodeHidden(nodeId, this.edges, this.collapsedNodes)
  }

  // Helper: Get all descendant node IDs
  getDescendantIds(nodeId) {
    return getDescendantIds(nodeId, this.edges)
  }

  // Helper: Check if a node is a descendant of another node
  isDescendant(ancestorId, nodeId) {
    return isDescendant(ancestorId, nodeId, this.edges)
  }

  // Helper: Cleanup drag branch effects (restore opacity, remove border, etc.)
  cleanupDragBranchEffects() {
    cleanupDragBranchEffects(this)
  }

  // Helper: Count all descendants (children + cháu + ... ) của một node
  // Dùng cho nút hiển thị tổng số nhánh con khi một node bị thu gọn.
  countChildren(nodeId) {
    return countChildren(nodeId, this.edges)
  }

  renderEdges(positions) {
    renderEdges(this, positions)
  }

  renderNodes(positions) {
    renderNodes(this, positions)
  }

  selectNode(nodeId, skipCallback = false) {
    selectNode(this, nodeId, skipCallback)
  }

  selectCommentNode(nodeId, skipCallback = false) {
    selectCommentNode(this, nodeId, skipCallback)
  }

  estimateNodeWidth(node, maxWidth = 400) {
    return estimateNodeWidth(node, maxWidth, getNodeLabel)
  }

  estimateNodeHeight(node, nodeWidth = null) {
    return estimateNodeHeight(node, nodeWidth, getNodeLabel, (n, mw) =>
      estimateNodeWidth(n, mw, getNodeLabel)
    )
  }

  // Get both width and height together to avoid circular dependency
  estimateNodeSize(node) {
    return estimateNodeSize(node, this)
  }

  setEditingNode(nodeId) {
    this.editingNode = nodeId
    // TODO: Implement inline editing
  }

  fitView() {
    fitView(this)
  }

  scrollToNode(nodeId) {
    scrollToNode(this, nodeId)
  }

  destroy() {
    // Remove context menu listener nếu có
    if (this._contextMenuHandler) {
      document.removeEventListener("contextmenu", this._contextMenuHandler, true)
      this._contextMenuHandler = null
    }
    
    // Remove mousedown listener nếu có
    if (this._mouseDownHandler) {
      document.removeEventListener("mousedown", this._mouseDownHandler, true)
      this._mouseDownHandler = null
    }
    
    // Remove mouseup listener nếu có
    if (this._mouseUpHandler) {
      document.removeEventListener("mouseup", this._mouseUpHandler, true)
      this._mouseUpHandler = null
    }
    
    if (this.svg) {
      this.svg.remove()
    }
  }

  updateNodeLabelFromExternal(nodeId, label) {
    const node = this.nodes.find((n) => n.id === nodeId)
    if (!node) return

    // 1. update data
    node.data.label = label

    // 2. clear size cache
    this.nodeSizeCache.delete(nodeId)

    // 3. nếu editor đang mount → setContent trực tiếp
    const editor = this.getEditorInstance(nodeId)
    if (editor) {
      editor.commands.setContent(label, false)
    }

    // 4. re-render layout
    this.render(false)
  }
}
