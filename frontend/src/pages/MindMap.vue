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
      
      <div style="height: calc(100vh - 84px); width: 100%">
        <VueFlow 
          v-model="elements"
          :default-zoom="1"
          :min-zoom="0.5"
          :max-zoom="2"
          @node-click="onNodeClick"
          @node-double-click="onNodeDoubleClick"
          :nodes-draggable="false"
          :nodes-deletable="false"
          :edges-deletable="false"
          :pan-on-scroll="true"
          :zoom-on-scroll="true"
          :fit-view-on-init="false"
          :apply-default="true"
        >
          <Background pattern-color="#aaa" :gap="16" />
          <Controls />
          <MiniMap />
          
          <!-- Custom node template -->
          <template #node-custom="{ data, id }">
            <div :class="{ 'editing-node': editingNode === id }">
              <MindmapNode 
                :id="id"
                :data="data"
                :is-selected="selectedNode?.id === id"
                :is-editing="editingNode === id"
                @hover="hoveredNode = id"
                @unhover="hoveredNode = null"
                @add-child="addChildToNode"
                @finish-editing="finishEditing"
              />
            </div>
          </template>
        </VueFlow>
      </div>
    </div>
  </div>
</template>

<script setup>
import { setBreadCrumbs } from "@/utils/files"
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { VueFlow } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import * as ELKModule from 'elkjs'
import { createResource } from "frappe-ui"
import { computed, defineProps, inject, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useStore } from "vuex"
import MindmapNode from "../components/MindmapNode.vue"

const ELK = ELKModule.default || ELKModule

const store = useStore()
const emitter = inject("emitter")
const elk = new ELK()

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
let saveTimeout = null
let layoutTimeout = null
const SAVE_DELAY = 2000

// Elements ref
const elements = ref([])

// Node counter
let nodeCounter = 0

// ✅ Watch elements to ensure root node is NEVER deleted
watch(elements, (newElements) => {
  const hasRoot = newElements.some(el => el.id === 'root')
  
  if (!hasRoot && elements.value.length > 0) {
    console.log('🚨 ROOT NODE WAS DELETED! RESTORING...')
    
    const viewportHeight = window.innerHeight - 84
    const centerY = viewportHeight / 2
    
    const rootNode = {
      id: 'root',
      type: 'custom',
      data: { 
        label: mindmap.data?.title || 'Root',
        isRoot: true
      },
      position: { 
        x: 50,
        y: centerY
      },
      draggable: false,
      style: {
        padding: '10px 20px',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: '#3b82f6',
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: '600',
        minWidth: '140px',
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
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
    
    setBreadCrumbs([
      { label: data.title, name: data.name }
    ], data.is_private, () => {
      emitter.emit("rename")
    })
  },
  onError(error) {
    console.error("Error loading mindmap:", error)
  }
})

// Initialize mindmap with root node
const initializeMindmap = (data) => {
  if (data.mindmap_data && data.mindmap_data.nodes && data.mindmap_data.nodes.length > 0) {
    elements.value = [
      ...data.mindmap_data.nodes.map(node => ({
        ...node,
        draggable: false
      })),
      ...data.mindmap_data.edges
    ]
    
    const maxId = Math.max(...data.mindmap_data.nodes.map(n => {
      const match = n.id.match(/node-(\d+)/)
      return match ? parseInt(match[1]) : 0
    }))
    nodeCounter = maxId + 1
    
    console.log("✅ Loaded existing layout")
  } else {
    const viewportHeight = window.innerHeight - 84
    const centerY = viewportHeight / 2
    
    const rootNode = {
      id: 'root',
      type: 'custom',
      data: { 
        label: data.title,
        isRoot: true
      },
      position: { 
        x: 50,
        y: centerY
      },
      draggable: false,
      style: {
        padding: '10px 20px',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: '#3b82f6',
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: '600',
        minWidth: '140px',
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
      }
    }
    
    elements.value = [rootNode]
    nodeCounter = 1
    
    console.log("✅ Created root node at left-center position")
    
    setTimeout(() => scheduleSave(), 500)
  }
}

// Node click handler
const onNodeClick = (event) => {
  selectedNode.value = event.node
  console.log("Selected node:", event.node.id)
}

// Double click to edit
const onNodeDoubleClick = (event) => {
  editingNode.value = event.node.id
}

// Finish editing
const finishEditing = () => {
  editingNode.value = null
  scheduleSave()
}

// ✅ IMPROVED Layout function - Lark Mindnotes style
const layoutWithElk = async () => {
  const allNodes = nodes.value
  const allEdges = edges.value

  if (allNodes.length === 0) {
    console.warn("⚠️ No nodes to layout")
    return
  }

  console.log("🔄 Starting layout with", allNodes.length, "nodes and", allEdges.length, "edges")

  // Use manual tree layout instead of ELK for better control
  arrangeTreeLikeMindnotes()
}

// ✅ Lark Mindnotes style layout - Clean and organized
const arrangeTreeLikeMindnotes = () => {
  console.log("🎨 Arranging tree like Lark Mindnotes")
  
  const rootNode = elements.value.find(el => el.id === 'root')
  if (!rootNode) return
  
  // Layout configuration
  const LEVEL_GAP = 200      // Horizontal distance between levels
  const NODE_GAP = 15        // Vertical gap between sibling nodes
  const NODE_HEIGHT = 50     // Estimated node height
  
  // Get children of a node, sorted by their current Y position
  const getChildren = (parentId) => {
    const childEdges = elements.value.filter(el => el.source === parentId && el.target)
    const children = childEdges
      .map(edge => elements.value.find(node => node.id === edge.target))
      .filter(Boolean)
    
    // Sort by current Y position to maintain order
    children.sort((a, b) => a.position.y - b.position.y)
    return children
  }
  
  // Calculate total height needed for a subtree
  const calculateSubtreeHeight = (nodeId) => {
    const children = getChildren(nodeId)
    if (children.length === 0) return NODE_HEIGHT
    
    let totalHeight = 0
    children.forEach(child => {
      totalHeight += calculateSubtreeHeight(child.id)
    })
    
    // Add gaps between children
    totalHeight += (children.length - 1) * NODE_GAP
    
    return Math.max(totalHeight, NODE_HEIGHT)
  }
  
  // Recursively arrange nodes
  const arrangeNode = (nodeId, level, startY) => {
    const node = elements.value.find(el => el.id === nodeId)
    if (!node) return startY
    
    const children = getChildren(nodeId)
    
    // Leaf node - place it directly
    if (children.length === 0) {
      const nodeIndex = elements.value.findIndex(el => el.id === nodeId)
      if (nodeIndex !== -1) {
        elements.value[nodeIndex] = {
          ...elements.value[nodeIndex],
          position: { 
            x: level * LEVEL_GAP, 
            y: startY 
          }
        }
      }
      return startY + NODE_HEIGHT
    }
    
    // Node with children - arrange children first, then center parent
    let currentY = startY
    const childYPositions = []
    
    children.forEach(child => {
      const childY = currentY
      childYPositions.push(childY)
      currentY = arrangeNode(child.id, level + 1, childY)
      currentY += NODE_GAP // Add gap after each child
    })
    
    // Remove last gap
    currentY -= NODE_GAP
    
    // Calculate parent's Y position (center of children)
    const firstChildY = childYPositions[0]
    const lastChildY = childYPositions[childYPositions.length - 1]
    const parentY = (firstChildY + lastChildY) / 2
    
    // Place parent node
    const nodeIndex = elements.value.findIndex(el => el.id === nodeId)
    if (nodeIndex !== -1) {
      elements.value[nodeIndex] = {
        ...elements.value[nodeIndex],
        position: { 
          x: level * LEVEL_GAP, 
          y: parentY 
        }
      }
    }
    
    return currentY
  }
  
  // Calculate viewport center
  const viewportHeight = window.innerHeight - 84
  const totalTreeHeight = calculateSubtreeHeight('root')
  const startY = Math.max(50, (viewportHeight - totalTreeHeight) / 2)
  
  // Start arranging from root
  arrangeNode('root', 0, startY)
  
  // Trigger reactivity
  elements.value = [...elements.value]
  
  console.log("✅ Mindnotes-style layout completed")
}

// Schedule layout with debounce
const scheduleLayout = () => {
  if (layoutTimeout) {
    clearTimeout(layoutTimeout)
  }
  
  layoutTimeout = setTimeout(() => {
    arrangeTreeLikeMindnotes()
  }, 100)
}

// Add child to specific node
const addChildToNode = (parentId) => {
  const parent = elements.value.find(el => el.id === parentId)
  if (!parent) return
  
  const newNodeId = `node-${nodeCounter++}`
  
  // Temporary position - will be recalculated by ELK
  const newNode = {
    id: newNodeId,
    type: 'custom',
    data: { 
      label: 'Nhánh mới',
      parentId: parentId
    },
    position: { 
      x: parent.position.x + 250,
      y: parent.position.y
    },
    draggable: false,
    style: {
      padding: '6px 12px',
      borderRadius: '6px',
      border: '1px solid #cbd5e1',
      backgroundColor: '#ffffff',
      fontSize: '13px',
      fontWeight: '400',
      minWidth: '100px',
      textAlign: 'left',
      boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
    }
  }
  
  const newEdge = {
    id: `edge-${parentId}-${newNodeId}`,
    source: parentId,
    target: newNodeId,
    type: 'smoothstep',
    animated: false,
    style: { 
      stroke: '#3b82f6', 
      strokeWidth: 2 
    }
  }
  
  elements.value = [...elements.value, newNode, newEdge]
  selectedNode.value = newNode
  
  console.log("✅ Added child node:", newNodeId)
  
  // Use ELK layout
  scheduleLayout()
  scheduleSave()
}

// Add sibling node
const addSiblingToNode = (nodeId) => {
  if (nodeId === 'root') return
  
  const parentEdge = elements.value.find(el => el.target === nodeId && el.source)
  
  if (!parentEdge) {
    console.error("Cannot find parent node")
    return
  }
  
  const parentId = parentEdge.source
  const parent = elements.value.find(el => el.id === parentId)
  const currentNode = elements.value.find(el => el.id === nodeId)
  
  if (!parent || !currentNode) return
  
  const newNodeId = `node-${nodeCounter++}`
  
  const newNode = {
    id: newNodeId,
    type: 'custom',
    data: { 
      label: 'Nhánh mới',
      parentId: parentId
    },
    position: { 
      x: currentNode.position.x,
      y: currentNode.position.y + 80
    },
    draggable: false,
    style: {
      padding: '6px 12px',
      borderRadius: '6px',
      border: '1px solid #94a3b8',
      backgroundColor: '#ffffff',
      fontSize: '13px',
      fontWeight: '400',
      minWidth: '100px',
      textAlign: 'left',
      boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
    }
  }
  
  const newEdge = {
    id: `edge-${parentId}-${newNodeId}`,
    source: parentId,
    target: newNodeId,
    type: 'smoothstep',
    animated: false,
    style: { 
      stroke: '#3b82f6', 
      strokeWidth: 2 
    }
  }
  
  elements.value = [...elements.value, newNode, newEdge]
  selectedNode.value = newNode
  
  console.log("✅ Added sibling node:", newNodeId)
  
  scheduleLayout()
  scheduleSave()
}

// Delete node with cascade
const deleteSelectedNode = () => {
  if (!selectedNode.value) return
  
  if (selectedNode.value.id === 'root') {
    console.log('❌ Cannot delete root node')
    return
  }
  
  const nodeId = selectedNode.value.id
  console.log(`🗑️ Starting cascade delete for node: ${nodeId}`)
  
  const snapshot = [...elements.value]
  const nodesToDelete = new Set([nodeId])
  
  const collectDescendants = (id) => {
    const childEdges = snapshot.filter(el => el.source === id && el.target)
    
    childEdges.forEach(edge => {
      const childId = edge.target
      nodesToDelete.add(childId)
      collectDescendants(childId)
    })
  }
  
  collectDescendants(nodeId)
  
  console.log(`📋 Total nodes to delete: ${nodesToDelete.size}`, Array.from(nodesToDelete))
  
  elements.value = snapshot.filter(el => {
    if (el.id === 'root') return true
    
    if (el.id && nodesToDelete.has(el.id)) {
      return false
    }
    
    if (el.source && nodesToDelete.has(el.source)) {
      return false
    }
    if (el.target && nodesToDelete.has(el.target)) {
      return false
    }
    
    return true
  })
  
  selectedNode.value = null
  console.log(`✅ Cascade delete completed: ${nodesToDelete.size} nodes removed`)
  
  scheduleLayout()
  scheduleSave()
}

// Keyboard shortcuts handler
const handleKeyDown = (event) => {
  if (editingNode.value) return
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
const nodes = computed(() => elements.value.filter(el => el.id && !el.source))
const edges = computed(() => elements.value.filter(el => el.source))

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
    
    saveLayoutResource.submit({
      entity_name: props.entityName,
      nodes: JSON.stringify(nodes.value),
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
  
  // Check ELK availability
  console.log('🔍 ELK instance:', elk)
  console.log('🔍 ELK layout function available:', typeof elk.layout === 'function')
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown, true)
  
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
</style>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';
@import '@vue-flow/minimap/dist/style.css';

.vue-flow__node-custom {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  transition: transform 0.2s ease !important;
  z-index: 10 !important;
}

.vue-flow__edge {
  transition: all 0.3s ease !important;
  z-index: 1 !important;
}

.vue-flow__edge-path {
  stroke: #3b82f6 !important;
  stroke-width: 2 !important;
  transition: stroke 0.2s ease !important;
}

.vue-flow__edge.selected .vue-flow__edge-path {
  stroke: #2563eb !important;
  stroke-width: 3 !important;
}

.vue-flow__handle {
  width: 8px !important;
  height: 8px !important;
  background: #3b82f6 !important;
  border: 2px solid white !important;
  opacity: 0 !important;
  transition: opacity 0.2s ease !important;
}

.vue-flow__node:hover .vue-flow__handle {
  opacity: 1 !important;
}

.vue-flow__handle-left {
  left: -4px !important;
  border: transparent !important;
  background-color: transparent !important;
}

.vue-flow__handle-right {
  right: -4px !important;
  border: transparent !important;
  background-color: transparent !important;
}

.vue-flow__handle-top {
  top: -4px !important;
  border: transparent !important;
  background-color: transparent !important;
}

.vue-flow__handle-bottom {
  bottom: -4px !important;
  border: transparent !important;
  background-color: transparent !important;
}
</style>