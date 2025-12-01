<template>
  <div class="flex flex-col w-full">
    <Navbar v-if="!mindmap.error" :root-resource="mindmap" />
    <ErrorPage v-if="mindmap.error" :error="mindmap.error" />
    <LoadingIndicator
      v-else-if="!mindmap.data && mindmap.loading"
      class="w-10 h-full text-neutral-100 mx-auto"
    />
    
    <div v-if="mindmap.data" class="w-full relative">
      <!-- Status indicator -->
      <div class="absolute top-2 right-2 z-10 text-sm">
        <span v-if="isSaving" class="text-orange-500 flex items-center gap-1">
          <span class="animate-spin">⏳</span> Đang lưu...
        </span>
        <span v-else-if="lastSaved" class="text-green-500">
          ✓ Đã lưu lúc {{ lastSaved }}
        </span>
      </div>      
      
      <!-- Delete confirmation dialog -->
      <div v-if="showDeleteDialog" class="delete-dialog-overlay" @click.self="showDeleteDialog = false">
        <div class="delete-dialog">
          <div class="delete-dialog-header">
            <h3>Xác nhận xóa</h3>
          </div>
          <div class="delete-dialog-body">
            <p>Xóa nhánh này sẽ xóa toàn bộ nhánh con.</p>
          </div>
          <div class="delete-dialog-footer">
            <button @click="showDeleteDialog = false" class="btn-cancel">Hủy</button>
            <button @click="confirmDelete" class="btn-delete">Xóa</button>
          </div>
        </div>
      </div>
      
      <div style="height: calc(100vh - 84px); width: 100%" class="d3-mindmap-container">
        <!-- D3.js Mindmap Renderer -->
        <div ref="d3Container" class="d3-mindmap-wrapper"></div>
        
        <!-- Controls -->
        <div class="d3-controls">
          <button @click="fitView" class="control-btn" title="Fit View">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 2h12v12H2V2z"/>
              <path d="M5 5h6v6H5V5z"/>
            </svg>
          </button>
          <button @click="zoomIn" class="control-btn" title="Zoom In">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
          <button @click="zoomOut" class="control-btn" title="Zoom Out">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { rename } from "@/resources/files"
import { D3MindmapRenderer } from '@/utils/d3MindmapRenderer'
import { setBreadCrumbs } from "@/utils/files"
import { createResource } from "frappe-ui"
import { computed, defineProps, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useStore } from "vuex"

const store = useStore()
const emitter = inject("emitter")

const props = defineProps({
  entityName: String,
  team: String,
})

// State
const isSaving = ref(false)
const lastSaved = ref(null)
const selectedNode = ref(null)
const hoveredNode = ref(null)
const editingNode = ref(null)
const showDeleteDialog = ref(false)
const nodeToDelete = ref(null)
const childCount = ref(0)
let saveTimeout = null
let layoutTimeout = null
const SAVE_DELAY = 2000

// Elements ref
const elements = ref([])

// D3 Renderer
const d3Container = ref(null)
let d3Renderer = null

// Node counter
let nodeCounter = 0

// Track node creation order and positions
const nodePositions = ref(new Map()) // Store stable positions
const nodeCreationOrder = ref(new Map()) // Track when nodes were created
let creationOrderCounter = 0

// ✅ Watch elements to ensure root node is NEVER deleted
watch(elements, (newElements) => {
  const nodes = newElements.filter(el => el.id && !el.source && !el.target)
  const hasRoot = nodes.some(el => el.id === 'root')
  
  if (!hasRoot && nodes.length > 0) {
    console.log('🚨 ROOT NODE WAS DELETED! RESTORING...')
    
    const rootNode = {
      id: 'root',
      data: { 
        label: mindmap.data?.title || 'Root',
        isRoot: true
      }
    }
    
    elements.value = [rootNode, ...newElements]
  }
}, { deep: true })

// Format time
const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('vi-VN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

// API: Load mindmap
const mindmap = createResource({
  url: "drive.api.mindmap.get_mindmap_data",
  method: "GET",
  auto: true,
  params: {
    entity_name: props.entityName,
  },
  onSuccess(data) {
    console.log("✅ Mindmap loaded:", data)
    
    window.document.title = data.title
    store.commit("setActiveEntity", data)
    
    initializeMindmap(data)
  },
  onError(error) {
    console.error("Error loading mindmap:", error)
  }
})

// Resource thứ hai: lấy thông tin entity (kèm breadcrumbs) giống Document.vue
const mindmapEntity = createResource({
  url: "drive.api.permissions.get_entity_with_permissions",
  method: "GET",
  auto: true,
  params: {
    entity_name: props.entityName,
  },
  onSuccess(data) {
    // Chỉ dùng để thiết lập breadcrumbs, tránh ghi đè logic mindmap khác
    if (data.breadcrumbs && Array.isArray(data.breadcrumbs)) {
      setBreadCrumbs(data.breadcrumbs, data.is_private, () => {
        data.write && emitter.emit("rename")
      })
    }
  },
})

// Initialize mindmap with root node
const initializeMindmap = async (data) => {
  if (data.mindmap_data && data.mindmap_data.nodes && data.mindmap_data.nodes.length > 0) {
    // Convert VueFlow format to D3 format
    const loadedNodes = data.mindmap_data.nodes.map(node => ({
      id: node.id,
      data: node.data || { label: node.label || '' }
    }))
    
    const loadedEdges = data.mindmap_data.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target
    }))
    
    elements.value = [...loadedNodes, ...loadedEdges]
    
    const maxId = Math.max(...loadedNodes.map(n => {
      const match = n.id.match(/node-(\d+)/)
      return match ? parseInt(match[1]) : 0
    }))
    nodeCounter = maxId + 1
    
    // Store existing positions and creation order
    loadedNodes.forEach((node, index) => {
      if (node.position) {
        nodePositions.value.set(node.id, { ...node.position })
      }
      nodeCreationOrder.value.set(node.id, index)
    })
    creationOrderCounter = loadedNodes.length
    
    console.log("✅ Loaded existing layout")
  } else {
    const rootNode = {
      id: 'root',
      data: { 
        label: data.title,
        isRoot: true
      }
    }
    
    elements.value = [rootNode]
    nodeCounter = 1
    
    // Store root
    nodeCreationOrder.value.set('root', 0)
    creationOrderCounter = 1
    
    console.log("✅ Created root node")
    
    setTimeout(() => scheduleSave(), 500)
  }
  
  // Initialize D3 renderer
  await nextTick()
  initD3Renderer()
}

// Initialize D3 Renderer
const initD3Renderer = () => {
  if (!d3Container.value) return
  
  d3Renderer = new D3MindmapRenderer(d3Container.value, {
    width: window.innerWidth,
    height: window.innerHeight - 84,
    nodeSpacing: 50,
    layerSpacing: 180,
    padding: 20,
    nodeCreationOrder: nodeCreationOrder
  })
  
  d3Renderer.setCallbacks({
    onNodeClick: (node) => {
      selectedNode.value = node
      d3Renderer.selectNode(node.id)
      console.log("Selected node:", node.id)
    },
    onNodeDoubleClick: () => {
      /* Editing happens inline inside each node */
    },
    onNodeAdd: (parentId) => {
      addChildToNode(parentId)
    },
    onNodeUpdate: (nodeId, newLabel) => {
      const node = nodes.value.find(n => n.id === nodeId)
      if (node) {
        // Cập nhật label cho node trong state, nhưng KHÔNG đổi tên file ngay
        node.data.label = newLabel
        // Chỉ lưu layout/nội dung node, không đổi tên file ở đây
        scheduleSave()
      }
    },
    onNodeEditingStart: (nodeId) => {
      editingNode.value = nodeId
    },
    onNodeEditingEnd: (nodeId) => {
      // Chỉ khi KẾT THÚC edit mới đổi tên file nếu là node root
      const finishedNodeId = nodeId || editingNode.value
      if (finishedNodeId) {
        const node = nodes.value.find(n => n.id === finishedNodeId)
        if (node) {
          // node.data.label đã được cập nhật trong renderer on('blur')
          
          // Nếu là root node, đổi tên file
          if (node.id === 'root' || node.data?.isRoot) {
          let originalLabel = (node.data?.label || '').trim()
          let newTitle = originalLabel
          
          // Nếu label là HTML (từ TipTap editor), extract plain text
          if (newTitle.includes('<')) {
            const tempDiv = document.createElement('div')
            tempDiv.innerHTML = newTitle
            newTitle = (tempDiv.textContent || tempDiv.innerText || '').trim()
          }
          
          // Nếu xóa hết text, dùng tên mặc định
          if (!newTitle) {
            newTitle = "Sơ đồ"
            // Cập nhật label với tên mặc định
            node.data.label = newTitle
          }
          
          // Truncate title xuống 140 ký tự CHỈ để rename file (không cập nhật label)
          // Giữ nguyên label đầy đủ để hiển thị trong node
          let titleForRename = newTitle
          if (titleForRename.length > 140) {
            titleForRename = titleForRename.substring(0, 140).trim()
          }
          
          // Chỉ rename file với title đã truncate, nhưng giữ nguyên label đầy đủ
          renameMindmapTitle(titleForRename)
        }
          
          // Lưu layout/nội dung node
          scheduleSave()
      }
      }
      
      // Clear editingNode trước khi update để watch không bị trigger
      editingNode.value = null
      
      // Update layout sau khi edit xong để đảm bảo node size chính xác
      // Tăng delay lên 300ms để đảm bảo DOM đã update và node size đã được tính toán lại
      // Đặc biệt quan trọng khi edit node giữa có nhiều node con
      updateD3RendererWithDelay(300)
    }
  })
  
  updateD3Renderer()
}

// Đổi tên file mindmap khi sửa node root
const renameMindmapTitle = (newTitle) => {
  if (!newTitle || !newTitle.trim()) return
  
  // Cập nhật ngay trên client
  if (mindmap.data) {
    mindmap.data.title = newTitle
  }
  if (store.state.activeEntity) {
    store.state.activeEntity.title = newTitle
  }
  window.document.title = newTitle
  
  // Cập nhật breadcrumbs trong store (cache) với tên mới
  const currentBreadcrumbs = store.state.breadcrumbs || []
  if (Array.isArray(currentBreadcrumbs) && currentBreadcrumbs.length > 0) {
    const updated = currentBreadcrumbs.map((crumb, idx) => {
      if (idx === currentBreadcrumbs.length - 1) {
        return {
          ...crumb,
          label: newTitle,
          title: newTitle,
        }
      }
      return crumb
    })
    store.commit("setBreadcrumbs", updated)
  }
  
  // Gửi request đổi tên entity
  rename.submit({
    entity_name: props.entityName,
    new_title: newTitle.trim(),
  })
}

// Update D3 renderer
const updateD3Renderer = async () => {
  if (!d3Renderer) return
  
  await nextTick()
  
  requestAnimationFrame(() => {
    setTimeout(() => {
      d3Renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
    }, 100)
  })
}

// Update D3 renderer with custom delay (for editing)
const updateD3RendererWithDelay = async (delay = 200) => {
  if (!d3Renderer) return
  
  await nextTick()
  
  void document.body.offsetHeight
  
  requestAnimationFrame(() => {
    setTimeout(() => {
      void document.body.offsetHeight
      d3Renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
    }, delay)
  })
}

// Helper: Get children of a node
const getChildren = (nodeId) => {
  return edges.value
    .filter(edge => edge.source === nodeId)
    .map(edge => nodes.value.find(n => n.id === edge.target))
    .filter(Boolean)
}

// Helper: Get parent of a node
const getParent = (nodeId) => {
  const edge = edges.value.find(edge => edge.target === nodeId)
  return edge ? nodes.value.find(n => n.id === edge.source) : null
}

// Zoom controls
const fitView = () => {
  if (d3Renderer) {
    d3Renderer.fitView()
  }
}

const zoomIn = () => {
  if (d3Renderer && d3Renderer.svg) {
    d3Renderer.svg.transition()
      .call(d3Renderer.zoom.scaleBy, 1.2)
  }
}

const zoomOut = () => {
  if (d3Renderer && d3Renderer.svg) {
    d3Renderer.svg.transition()
      .call(d3Renderer.zoom.scaleBy, 0.8)
  }
}

// ✅ D3.js Mindmap Layout - Lark-like features (deprecated, using D3 renderer now)
const layoutWithElk = async () => {
  const allNodes = nodes.value
  const allEdges = edges.value

  if (allNodes.length === 0) {
    console.warn("⚠️ No nodes to layout")
    return
  }

  console.log("🔄 Starting D3 layout with", allNodes.length, "nodes")

  try {
    // Get actual node dimensions from DOM
    const nodeIds = allNodes.map(n => n.id)
    const nodeSizes = getAllNodeSizesFromDOM(nodeIds)

    // Calculate layout using D3 algorithm with Lark-like features
    // Use dynamic spacing that adapts to node sizes
    const maxNodeWidth = Math.max(...Array.from(nodeSizes.values()).map(s => s.width), 200)
    const dynamicLayerSpacing = Math.max(300, maxNodeWidth + 100) // At least 300px, or parent width + 100px
    
    const positions = calculateD3MindmapLayout(allNodes, allEdges, {
      nodeSizes: nodeSizes,
      layerSpacing: dynamicLayerSpacing, // Dynamic spacing based on largest node
      nodeSpacing: 100, // Vertical spacing between sibling nodes
      padding: 40, // Padding around nodes
      viewportHeight: window.innerHeight - 84
    })

    // Apply positions to elements
    const newElements = elements.value.map(el => {
      if (el.id && !el.source) {
        const pos = positions.get(el.id)
        if (pos) {
          // Store position
          nodePositions.value.set(el.id, { ...pos })
          if (!nodeCreationOrder.value.has(el.id)) {
            nodeCreationOrder.value.set(el.id, creationOrderCounter++)
          }
          
          return {
            ...el,
            position: pos
          }
        }
      }
      return el
    })

    // Second pass: Fix single child alignment (parent aligns with single child)
    const finalElements = newElements.map(el => {
      if (el.id && !el.source) {
        const children = getChildren(el.id)
        
        // If this node has exactly one child, align parent with child
        if (children.length === 1) {
          const child = children[0]
          const childEl = newElements.find(e => e.id === child.id)
          
          if (childEl && childEl.position) {
            const parentHeight = document.querySelector(`[data-id="${el.id}"]`)?.offsetHeight || 50
            const childHeight = document.querySelector(`[data-id="${child.id}"]`)?.offsetHeight || 50
            
            // Align centers vertically (keep X to maintain horizontal spacing)
            const alignedY = childEl.position.y + childHeight / 2 - parentHeight / 2
            
            const alignedPos = {
              x: el.position.x, // Keep X
              y: alignedY
            }
            
            // Update stored position
            nodePositions.value.set(el.id, { ...alignedPos })
            
            return {
              ...el,
              position: alignedPos
            }
          }
        }
      }
      return el
    })

    elements.value = finalElements

    console.log("✅ D3 layout completed successfully")
  } catch (error) {
    console.error("❌ D3 layout error:", error)
  }
}

// Schedule layout with debounce
const scheduleLayout = () => {
  if (layoutTimeout) {
    clearTimeout(layoutTimeout)
  }
  
  layoutTimeout = setTimeout(() => {
    layoutWithElk()
  }, 150)
}

// Add child to specific node
const addChildToNode = async (parentId) => {
  const parent = nodes.value.find(n => n.id === parentId)
  if (!parent) return
  
  const newNodeId = `node-${nodeCounter++}`
  
  const newNode = {
    id: newNodeId,
    data: { 
      label: 'Nhánh mới',
      parentId: parentId
    }
  }
  
  const newEdge = {
    id: `edge-${parentId}-${newNodeId}`,
    source: parentId,
    target: newNodeId
  }
  
  // Store creation order
  nodeCreationOrder.value.set(newNodeId, creationOrderCounter++)
  
  // Add node and edge
  elements.value = [
    ...nodes.value,
    newNode,
    ...edges.value,
    newEdge
  ]
  
  selectedNode.value = newNode
  
  console.log("✅ Added child node:", newNodeId)
  
  // Wait for DOM to render
  await nextTick()
  
  // Force reflow để đảm bảo DOM đã update
  void document.body.offsetHeight
  
  // Clear layout timeout
  if (layoutTimeout) {
    clearTimeout(layoutTimeout)
    layoutTimeout = null
  }
  
  // Update D3 renderer với delay đủ lớn để đảm bảo layout được tính toán đúng
  requestAnimationFrame(() => {
    void document.body.offsetHeight
    
    setTimeout(() => {
      updateD3RendererWithDelay(250)
      // Select node mới sau khi render xong để hiển thị border xanh
      if (d3Renderer) {
        d3Renderer.selectNode(newNodeId)
      }
    }, 50)
  })
  
  scheduleSave()
}

// Add sibling node
const addSiblingToNode = (nodeId) => {
  if (nodeId === 'root') return
  
  const parentEdge = edges.value.find(e => e.target === nodeId)
  
  if (!parentEdge) {
    console.error("Cannot find parent node")
    return
  }
  
  const parentId = parentEdge.source
  
  const newNodeId = `node-${nodeCounter++}`
  
  const newNode = {
    id: newNodeId,
    data: { 
      label: 'Nhánh mới',
      parentId: parentId
    }
  }
  
  const newEdge = {
    id: `edge-${parentId}-${newNodeId}`,
    source: parentId,
    target: newNodeId
  }
  
  // Store creation order
  nodeCreationOrder.value.set(newNodeId, creationOrderCounter++)
  
  // Add node and edge
  elements.value = [
    ...nodes.value,
    newNode,
    ...edges.value,
    newEdge
  ]
  
  selectedNode.value = newNode
  
  console.log("✅ Added sibling node:", newNodeId)
  
  // Wait for DOM to render
  nextTick().then(() => {
    updateD3RendererWithDelay(250)
  })
  
  scheduleSave()
}

// Helper: Count all descendants (children + grandchildren + ...) of a node
const countChildren = (nodeId) => {
  const visited = new Set()
  let count = 0
  
  const countDescendants = (id) => {
    if (visited.has(id)) return
    visited.add(id)
    
    const children = edges.value.filter(e => e.source === id)
    count += children.length
    
    children.forEach(edge => {
      countDescendants(edge.target)
    })
  }
  
  countDescendants(nodeId)
  return count
}

// Delete node with cascade
const deleteSelectedNode = () => {
  if (!selectedNode.value) return
  
  if (selectedNode.value.id === 'root') {
    console.log('❌ Cannot delete root node')
    return
  }
  
  const nodeId = selectedNode.value.id
  
  // Kiểm tra xem node có node con không
  const children = edges.value.filter(e => e.source === nodeId)
  const totalChildren = countChildren(nodeId)
  
  if (children.length > 0) {
    // Có node con: hiển thị popup cảnh báo
    nodeToDelete.value = nodeId
    childCount.value = totalChildren
    showDeleteDialog.value = true
    return
  }
  
  // Không có node con: xóa trực tiếp
  performDelete(nodeId)
}

// Thực hiện xóa node
const performDelete = (nodeId) => {
  console.log(`🗑️ Starting cascade delete for node: ${nodeId}`)
  
  const nodesToDelete = new Set([nodeId])
  
  const collectDescendants = (id) => {
    const childEdges = edges.value.filter(e => e.source === id)
    
    childEdges.forEach(edge => {
      const childId = edge.target
      nodesToDelete.add(childId)
      collectDescendants(childId)
    })
  }
  
  collectDescendants(nodeId)
  
  console.log(`📋 Total nodes to delete: ${nodesToDelete.size}`, Array.from(nodesToDelete))
  
  // Remove nodes and edges
  const newNodes = nodes.value.filter(n => {
    if (n.id === 'root') return true
    if (nodesToDelete.has(n.id)) {
      nodePositions.value.delete(n.id)
      nodeCreationOrder.value.delete(n.id)
      return false
    }
    return true
  })
  
  const newEdges = edges.value.filter(e => {
    if (nodesToDelete.has(e.source) || nodesToDelete.has(e.target)) {
      return false
    }
    return true
  })
  
  elements.value = [...newNodes, ...newEdges]
  selectedNode.value = null
  
  console.log(`✅ Cascade delete completed: ${nodesToDelete.size} nodes removed`)
  
  scheduleLayout()
  scheduleSave()
}

// Xác nhận xóa từ dialog
const confirmDelete = () => {
  if (nodeToDelete.value) {
    performDelete(nodeToDelete.value)
    nodeToDelete.value = null
  }
  showDeleteDialog.value = false
}

// Keyboard shortcuts handler
const handleKeyDown = (event) => {
  const target = event.target
  const tagName = target?.tagName?.toLowerCase()
  const isInEditor = target?.closest('.mindmap-node-editor') ||
                    target?.closest('.mindmap-editor-content') ||
                    target?.closest('.mindmap-editor-prose') ||
                    target?.classList?.contains('ProseMirror') ||
                    target?.closest('[contenteditable="true"]')
  
  // Nếu đang trong editor, cho phép editor xử lý keyboard shortcuts (Ctrl+B, Ctrl+I, etc.)
  if (isInEditor || editingNode.value) {
    // Cho phép editor xử lý các phím tắt của riêng nó (Ctrl+B, Ctrl+I, etc.)
    // Không chặn các phím này
    if (event.ctrlKey || event.metaKey) {
      // Cho phép editor xử lý Ctrl/Cmd + key combinations
      return
    }
    // Chặn các phím tắt khác khi đang trong editor
    return
  }
  
  // Nếu đang trong input/textarea khác, không xử lý
  if (tagName === 'textarea' || tagName === 'input' || target?.isContentEditable) {
    return
  }
  
  if (!selectedNode.value) return
  
  const key = event.key
  
  console.log('🎹 Key pressed:', key, 'Selected node:', selectedNode.value.id)
  
  if (key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    addChildToNode(selectedNode.value.id)
  }
  else if (key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    if (selectedNode.value.id !== 'root') {
      addSiblingToNode(selectedNode.value.id)
    } else {
      addChildToNode(selectedNode.value.id)
    }
  }
  else if (key === 'Delete' || key === 'Backspace') {
    event.preventDefault()
    event.stopPropagation()
    
    if (selectedNode.value.id === 'root') {
      console.log('❌ BLOCKED: Cannot delete root node')
      return false
    }
    
    deleteSelectedNode()
  }
}

// Computed
const nodes = computed(() => elements.value.filter(el => el.id && !el.source && !el.target))
const edges = computed(() => elements.value.filter(el => el.source && el.target))

// Watch nodes/edges changes to update D3 renderer
// KHÔNG update khi đang edit để tránh node nháy và text nhảy dòng
watch([nodes, edges], () => {
  if (d3Renderer && !editingNode.value) {
    updateD3Renderer()
  }
}, { deep: true })

// Save resource
const saveLayoutResource = createResource({
  url: "drive.api.mindmap.save_mindmap_layout",
  method: "POST",
  onSuccess(response) {
    isSaving.value = false
    lastSaved.value = formatTime(new Date())
    console.log("✅ Layout saved")
  },
  onError(error) {
    isSaving.value = false
    console.error("❌ Save error:", error)
  }
})

// Schedule save
const scheduleSave = () => {
  if (!mindmap.data) return
  
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  
  saveTimeout = setTimeout(() => {
    isSaving.value = true
    
    // Get positions from D3 renderer if available
    const nodesWithPositions = nodes.value.map(node => {
      const nodeWithPos = { ...node }
      if (d3Renderer && d3Renderer.positions) {
        const pos = d3Renderer.positions.get(node.id)
        if (pos) {
          nodeWithPos.position = { ...pos }
        }
      }
      return nodeWithPos
    })
    
    saveLayoutResource.submit({
      entity_name: props.entityName,
      nodes: JSON.stringify(nodesWithPositions),
      edges: JSON.stringify(edges.value),
      layout: "horizontal"
    })
  }, SAVE_DELAY)
}

onMounted(() => {
  if (!store.getters.isLoggedIn) {
    sessionStorage.setItem("sharedFileInfo", JSON.stringify({
      team: props.team,
      entityName: props.entityName,
      entityType: "mindmap"
    }))
  }
  
  window.addEventListener('keydown', handleKeyDown, true)
  
  // Handle window resize
  window.addEventListener('resize', () => {
    if (d3Renderer) {
      d3Renderer.options.width = window.innerWidth
      d3Renderer.options.height = window.innerHeight - 84
      if (d3Renderer.svg) {
        d3Renderer.svg.attr('width', window.innerWidth)
        d3Renderer.svg.attr('height', window.innerHeight - 84)
      }
      updateD3Renderer()
    }
  })
  
  console.log('✅ D3 Mindmap renderer ready')
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown, true)
  window.removeEventListener('resize', () => {})
  
  if (d3Renderer) {
    d3Renderer.destroy()
    d3Renderer = null
  }
  
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    
    if (mindmap.data && elements.value.length > 0) {
      saveLayoutResource.submit({
        entity_name: props.entityName,
        nodes: JSON.stringify(nodes.value),
        edges: JSON.stringify(edges.value),
        layout: "horizontal"
      })
    }
  }
  
  if (layoutTimeout) {
    clearTimeout(layoutTimeout)
  }
})
</script>

<style scoped>
kbd {
  font-family: ui-monospace, monospace;
  font-size: 11px;
}

.d3-mindmap-container {
  position: relative;
}

.d3-mindmap-wrapper {
  width: 100%;
  height: 100%;
}

/* Đảm bảo text selection hoạt động trong editor */
.d3-mindmap-wrapper :deep(foreignObject) {
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.d3-mindmap-wrapper :deep(.node-editor-container) {
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.d3-controls {
  position: absolute;
  bottom: 20px;
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}

.control-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  color: #374151;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.control-btn:hover {
  background: #f9fafb;
  border-color: #d1d5db;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.control-btn:active {
  transform: scale(0.95);
}

/* Delete confirmation dialog */
.delete-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.delete-dialog {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 10px 15px rgba(0, 0, 0, 0.1);
  width: 90%;
  max-width: 400px;
  overflow: hidden;
}

.delete-dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.delete-dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.delete-dialog-body {
  padding: 20px;
  color: #374151;
  line-height: 1.5;
}

.delete-dialog-body p {
  margin: 0 0 12px 0;
}

.delete-dialog-body p:last-child {
  margin-bottom: 0;
}

.delete-dialog-body strong {
  color: #dc2626;
  font-weight: 600;
}

.delete-dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel,
.btn-delete {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-cancel {
  background: #f3f4f6;
  color: #374151;
}

.btn-cancel:hover {
  background: #e5e7eb;
}

.btn-delete {
  background: #dc2626;
  color: white;
}

.btn-delete:hover {
  background: #b91c1c;
}
</style>