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
          :default-zoom="0.7"
          :min-zoom="0.2"
          :max-zoom="4"
          @node-click="onNodeClick"
          @node-double-click="onNodeDoubleClick"
          @node-drag-stop="scheduleSave"
          fit-view-on-init
        >
          <Background pattern-color="#aaa" :gap="16" />
          <Controls />
          <MiniMap />
          
          <!-- Custom node template với hover controls và handles -->
          <template #node-custom="{ data, id }">
            <div class="mindmap-node-wrapper">
              <!-- Connection handles -->
              <Handle type="target" position="left" id="left" class="node-handle" />
              <Handle type="source" position="right" id="right" class="node-handle" />
              <Handle type="source" position="bottom" id="bottom" class="node-handle" />
              <Handle type="source" position="top" id="top" class="node-handle" />
              
              <div 
                class="mindmap-node"
                :class="{ 'selected': selectedNode?.id === id }"
                @mouseenter="hoveredNode = id"
                @mouseleave="hoveredNode = null"
              >
                <div class="node-content">
                  <input
                    v-if="editingNode === id"
                    v-model="data.label"
                    @blur="finishEditing"
                    @keyup.enter="finishEditing"
                    class="node-input"
                    ref="nodeInput"
                    autofocus
                  />
                  <span v-else>{{ data.label }}</span>
                </div>
                
                <!-- Hover controls - hiển thị luôn dấu cộng -->
                <!-- <div class="node-hover-controls"> -->
                  <!-- Button bên phải - thêm child node -->
                  <button 
                    @click.stop="addChildToNode(id)"
                    class="control-btn-right"
                    title="Thêm node con"
                  >
                    +
                  </button>
                  
                  <!-- Button bên dưới - thêm sibling node -->
                  <button 
                    @click.stop="addSiblingToNode(id)"
                    class="control-btn-bottom"
                    title="Thêm node cùng cấp"
                    v-if="id !== 'root'"
                  >
                    +
                  </button>
                <!-- </div> -->
              </div>
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
import { Handle, VueFlow, useVueFlow } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import { createResource } from "frappe-ui"
import { computed, defineProps, inject, nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import { useStore } from "vuex"

const store = useStore()
const emitter = inject("emitter")
const { fitView } = useVueFlow()

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
const nodeInput = ref(null)
let saveTimeout = null
const SAVE_DELAY = 2000

// Elements ref
const elements = ref([])

// Node counter
let nodeCounter = 0

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
    
    // Initialize mindmap
    initializeMindmap(data)
    
    // Set breadcrumbs
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
    // Có data rồi, load lại
    elements.value = [
      ...data.mindmap_data.nodes,
      ...data.mindmap_data.edges
    ]
    
    // Update counter
    const maxId = Math.max(...data.mindmap_data.nodes.map(n => {
      const match = n.id.match(/node-(\d+)/)
      return match ? parseInt(match[1]) : 0
    }))
    nodeCounter = maxId + 1
    
    console.log("✅ Loaded existing layout")
  } else {
    // Chưa có data, tạo root node (chiều ngang)
    const rootNode = {
      id: 'root',
      type: 'custom',
      data: { 
        label: data.title,
        isRoot: true
      },
      position: { x: 50, y: 300 },
      style: {
        padding: '12px 24px',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: '#3b82f6',
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: '600',
        minWidth: '160px',
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
      }
    }
    
    elements.value = [rootNode]
    nodeCounter = 1
    
    console.log("✅ Created root node")
    
    // Auto-save root node
    setTimeout(() => scheduleSave(), 500)
  }
  
  // Fit view
  setTimeout(() => fitView(), 100)
}

// Node click handler
const onNodeClick = (event) => {
  selectedNode.value = event.node
  console.log("Selected node:", event.node.id)
}

// Double click to edit
const onNodeDoubleClick = (event) => {
  editingNode.value = event.node.id
  nextTick(() => {
    if (nodeInput.value) {
      nodeInput.value.focus()
    }
  })
}

// Finish editing
const finishEditing = () => {
  editingNode.value = null
  scheduleSave()
}

// Count children of a node
const countChildren = (nodeId) => {
  return elements.value.filter(el => el.source === nodeId).length
}

// Add child to specific node (bên phải - horizontal)
const addChildToNode = (parentId) => {
  const parent = elements.value.find(el => el.id === parentId)
  if (!parent) return
  
  const newNodeId = `node-${nodeCounter++}`
  
  // Count existing children to calculate Y offset
  const childrenCount = countChildren(parentId)
  const verticalSpacing = 100
  
  // Calculate Y position to stack vertically
  let baseY = parent.position.y
  if (childrenCount > 0) {
    // Find the last child's Y position
    const children = elements.value.filter(el => el.source === parentId)
    const childNodes = children.map(edge => 
      elements.value.find(node => node.id === edge.target)
    ).filter(Boolean)
    
    if (childNodes.length > 0) {
      const lastChild = childNodes[childNodes.length - 1]
      baseY = lastChild.position.y + verticalSpacing
    }
  }
  
  // Calculate position (bên phải parent, stack theo chiều dọc)
  const newNode = {
    id: newNodeId,
    type: 'custom',
    data: { 
      label: 'Nhánh mới',
      parentId: parentId
    },
    position: { 
      x: parent.position.x + 280, // Bên phải parent
      y: baseY // Stack theo chiều dọc
    },
    style: {
      padding: '10px 16px',
      borderRadius: '8px',
      border: '2px solid #cbd5e1',
      backgroundColor: '#ffffff',
      fontSize: '13px',
      fontWeight: '500',
      minWidth: '120px',
      textAlign: 'left',
      boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
    }
  }
  
  // Create edge with sourceHandle and targetHandle
  const newEdge = {
    id: `edge-${parentId}-${newNodeId}`,
    source: parentId,
    target: newNodeId,
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'bezier',
    animated: true,
    style: { stroke: '#3b82f6', strokeWidth: 2 }
  }
  
  elements.value = [...elements.value, newNode, newEdge]
  selectedNode.value = newNode
  
  // Auto edit
  setTimeout(() => {
    editingNode.value = newNodeId
  }, 100)
  
  scheduleSave()
  
  console.log("✅ Added child node:", newNodeId)
}

// Add sibling node (bên dưới - same level)
const addSiblingToNode = (nodeId) => {
  if (nodeId === 'root') return
  
  // Find parent of current node
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
  
  // Position sibling below current node (cùng X axis)
  const newNode = {
    id: newNodeId,
    type: 'custom',
    data: { 
      label: 'Node mới',
      parentId: parentId
    },
    position: { 
      x: currentNode.position.x,
      y: currentNode.position.y + 80 // Dưới current node
    },
    style: {
      padding: '8px 14px',
      borderRadius: '6px',
      border: '2px solid #94a3b8',
      backgroundColor: '#ffffff',
      fontSize: '13px',
      fontWeight: '500',
      minWidth: '110px',
      textAlign: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }
  }
  
  // Create edge from same parent with proper handles
  const newEdge = {
    id: `edge-${parentId}-${newNodeId}`,
    source: parentId,
    target: newNodeId,
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'bezier',
    animated: true,
    style: { stroke: '#3b82f6', strokeWidth: 2 }
  }
  
  elements.value = [...elements.value, newNode, newEdge]
  selectedNode.value = newNode
  
  // Auto edit
  setTimeout(() => {
    editingNode.value = newNodeId
  }, 100)
  
  scheduleSave()
  
  console.log("✅ Added sibling node:", newNodeId)
}

// Delete selected node
const deleteSelectedNode = () => {
  if (!selectedNode.value || selectedNode.value.id === 'root') return
  
  const nodeId = selectedNode.value.id
  
  // Find all descendants
  const toDelete = new Set([nodeId])
  const findDescendants = (id) => {
    elements.value
      .filter(el => el.source === id)
      .forEach(edge => {
        toDelete.add(edge.target)
        findDescendants(edge.target)
      })
  }
  findDescendants(nodeId)
  
  // Remove nodes and edges
  elements.value = elements.value.filter(el => {
    if (el.id && toDelete.has(el.id)) return false
    if (el.source && toDelete.has(el.source)) return false
    if (el.target && toDelete.has(el.target)) return false
    return true
  })
  
  selectedNode.value = null
  scheduleSave()
  
  console.log("✅ Deleted node:", nodeId)
}

// Reset layout to fresh state
const resetLayout = () => {
  if (confirm('Reset layout về trạng thái ban đầu?')) {
    initializeMindmap(mindmap.data)
  }
}

// Computed: Separate nodes and edges
const nodes = computed(() => elements.value.filter(el => el.id && !el.source))
const edges = computed(() => elements.value.filter(el => el.source))

// Save layout resource
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

// Cleanup
onBeforeUnmount(() => {
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
})

onMounted(() => {
  if (!store.getters.isLoggedIn) {
    sessionStorage.setItem("sharedFileInfo", JSON.stringify({
      team: props.team,
      entityName: props.entityName,
      entityType: "mindmap"
    }))
  }
})
</script>

<style scoped>
.mindmap-node-wrapper {
  position: relative;
}

.node-handle {
  width: 8px;
  height: 8px;
  background: #3b82f6;
  border: 2px solid white;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.2s;
}

.mindmap-node-wrapper:hover .node-handle {
  opacity: 1;
}

.mindmap-node {
  position: relative;
  padding: 10px 16px;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  min-width: 120px;
  cursor: pointer;
  transition: all 0.2s;
}

.mindmap-node:hover {
  border-color: #3b82f6;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
}

.mindmap-node.selected {
  border-color: #3b82f6;
  background: #eff6ff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.node-content {
  text-align: left;
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  word-break: break-word;
  position: relative;
}

.node-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
}

/* MindMeister-style hover controls */
.node-hover-controls {
  position: absolute;
}

.control-btn-right {
  position: absolute;
  top: 50%;
  right: -32px;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #3b82f6;
  color: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
  z-index: 10;
  font-size: 18px;
  line-height: 1;
  font-weight: 400;
}

.control-btn-right:hover {
  background: #2563eb;
  transform: translateY(-50%) scale(1.15);
  box-shadow: 0 3px 10px rgba(59, 130, 246, 0.5);
}

.control-btn-bottom {
  position: absolute;
  left: 50%;
  bottom: -32px;
  transform: translateX(-50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #3b82f6;
  color: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
  z-index: 10;
  font-size: 18px;
  line-height: 1;
  font-weight: 400;
}

.control-btn-bottom:hover {
  background: #2563eb;
  transform: translateX(-50%) scale(1.15);
  box-shadow: 0 3px 10px rgba(59, 130, 246, 0.5);
}

.control-btn-right:active,
.control-btn-bottom:active {
  transform: scale(0.95);
}
</style>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';
@import '@vue-flow/minimap/dist/style.css';

/* Custom node styles */
.vue-flow__node-custom {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
}
</style>