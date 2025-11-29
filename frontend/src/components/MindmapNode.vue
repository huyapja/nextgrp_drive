<template>
  <div class="mindmap-node-wrapper">
    <div 
      class="mindmap-node"
      :class="{ 
        'selected': isSelected,
        'is-root': data.isRoot 
      }"
      @mouseenter="$emit('hover', id)"
      @mouseleave="$emit('unhover')"
    >
      <!-- Connection handles INSIDE the node div -->
      <Handle 
        type="target" 
        position="left" 
        id="left" 
        class="node-handle node-handle-left"
      />
      <Handle 
        type="source" 
        position="right" 
        id="right" 
        class="node-handle node-handle-right"
      />
      <Handle 
        type="source" 
        position="bottom" 
        id="bottom" 
        class="node-handle node-handle-bottom"
      />
      <Handle 
        type="source" 
        position="top" 
        id="top" 
        class="node-handle node-handle-top"
      />
      
      <div class="node-content">
        <textarea
          v-model="data.label"
          @blur="$emit('finish-editing')"
          @keydown.enter.exact.prevent="$emit('finish-editing')"
          @input="autoResize"
          @dblclick="startEdit"
          class="node-input"
          :class="{ 'node-input-editing': isEditing }"
          ref="nodeInput"
          placeholder="Nhập"
          :readonly="!isEditing"
          rows="1"
        />
        <span ref="measureSpan" class="measure-span">{{ data.label || 'Nhập' }}</span>
      </div>
      
      <!-- Hover controls -->
      <button 
        @click.stop="$emit('add-child', id)"
        class="control-btn-right"
        title="Thêm nhánh con (Tab)"
      >
        +
      </button>
    </div>
  </div>
</template>

<script setup>
import { Handle } from '@vue-flow/core'
import { defineEmits, defineProps, nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps({
  id: {
    type: String,
    required: true
  },
  data: {
    type: Object,
    required: true
  },
  isSelected: {
    type: Boolean,
    default: false
  },
  isEditing: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['hover', 'unhover', 'add-child', 'finish-editing', 'edit-start'])

const nodeInput = ref(null)
const measureSpan = ref(null)

// ✅ Auto-resize textarea dựa trên span đo chiều rộng
const autoResize = () => {
  if (!nodeInput.value || !measureSpan.value) return
  
  const text = props.data.label || 'Nhập'
  const MAX_CONTENT_WIDTH = 384 // 400 - 8*2 (padding của node)
  
  // Set width trước để textarea wrap text đúng
  nodeInput.value.style.width = MAX_CONTENT_WIDTH + 'px'
  nodeInput.value.style.height = 'auto'
  
  // Đo chiều cao sau khi wrap
  const scrollHeight = nodeInput.value.scrollHeight
  nodeInput.value.style.height = scrollHeight + 'px'
  
  // Bây giờ đo chiều rộng thực tế cần thiết
  const lines = text.split('\n')
  let maxWidth = 14
  
  lines.forEach(line => {
    if (!line) {
      maxWidth = Math.max(maxWidth, 14)
      return
    }
    measureSpan.value.textContent = line
    const lineWidth = measureSpan.value.offsetWidth
    maxWidth = Math.max(maxWidth, lineWidth)
  })
  
  // Apply width với constraints
  const finalWidth = Math.max(14, Math.min(MAX_CONTENT_WIDTH, maxWidth + 4))
  nodeInput.value.style.width = finalWidth + 'px'
  
  // Re-measure height với width mới
  nodeInput.value.style.height = 'auto'
  const finalHeight = nodeInput.value.scrollHeight
  nodeInput.value.style.height = finalHeight + 'px'
  
  console.log('Auto resize:', { maxWidth, finalWidth, finalHeight, lines: lines.length })
}

// ✅ Start edit mode
const startEdit = () => {
  emit('edit-start')
}

// Focus input when editing starts
watch(() => props.isEditing, async (newVal) => {
  if (newVal) {
    await nextTick()
    if (nodeInput.value) {
      nodeInput.value.focus()
      nodeInput.value.select()
      autoResize()
    }
  }
})

// Watch label changes
watch(() => props.data.label, () => {
  nextTick(() => autoResize())
})

onMounted(() => {
  autoResize()
})
</script>

<style scoped>
.mindmap-node-wrapper {
  position: relative;
  z-index: 10;
}

.mindmap-node {
  position: relative;
  padding: 8px 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  min-width: 100px;
  max-width: 400px;
  width: fit-content;
  min-height: 19px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 10;
  display: inline-flex;
  align-items: center;
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

.mindmap-node.is-root {
  padding: 8px 12px;
  background: #3b82f6;
  color: #ffffff;
  font-weight: 600;
  min-width: 100px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.25);
  border: none;
}

.node-content {
  position: relative;
  width: fit-content;
  max-width: 384px;
  box-sizing: border-box;
  line-height: 1.2;
}

/* ✅ Span ẩn dùng để đo chiều rộng text */
.measure-span {
  position: absolute;
  visibility: hidden;
  white-space: pre;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  line-height: 1.2;
  padding: 0;
  margin: 0;
  pointer-events: none;
  left: -9999px;
  top: -9999px;
}

.is-root .node-content {
  text-align: center;
  color: #ffffff;
}

/* ✅ Textarea với chiều rộng được set bởi JS */
.node-input {
  background: transparent;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
  color: inherit;
  border: none !important;
  outline: none !important;
  resize: none;
  line-height: 1.2;
  font-family: inherit;
  word-wrap: break-word;
  word-break: break-word;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  padding: 0 !important;
  margin: 0 !important;
  height: auto;
  overflow: hidden;
  box-sizing: border-box !important;
  display: block;
  min-width: 14px;
  max-width: 384px;
  width: 384px;
}

.node-input::placeholder {
  color: #94a3b8;
  opacity: 0.7;
}

.node-input:focus {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
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
  opacity: 0;
}

.mindmap-node-wrapper:hover .control-btn-right {
  opacity: 1;
}

.control-btn-right:hover {
  background: #2563eb;
  transform: translateY(-50%) scale(1.15);
  box-shadow: 0 3px 10px rgba(59, 130, 246, 0.5);
}

.control-btn-right:active {
  transform: translateY(-50%) scale(0.95);
}

kbd {
  font-family: ui-monospace, monospace;
  font-size: 11px;
}
</style>

<style>
/* Global styles for handles - NOT scoped to avoid CSS isolation issues */
.node-handle {
  width: 8px;
  height: 8px;
  background: #3b82f6;
  border: 2px solid white;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 15;
  position: absolute !important;
}

.mindmap-node-wrapper:hover .node-handle {
  opacity: 1;
}

/* ✅ CRITICAL FIX: Position handles at EXACT vertical center */
/* Use top/bottom instead of left/right with transform for precise alignment */

.node-handle-left {
  left: 0 !important;
  top: 50% !important;
  transform: translate(-50%, -50%) !important;
  margin: 0 !important;
}

.node-handle-right {
  right: 0 !important;
  top: 50% !important;
  transform: translate(50%, -50%) !important;
  margin: 0 !important;
}

.node-handle-top {
  left: 50% !important;
  top: 0 !important;
  transform: translate(-50%, -50%) !important;
  margin: 0 !important;
}

.node-handle-bottom {
  left: 50% !important;
  bottom: 0 !important;
  transform: translate(-50%, 50%) !important;
  margin: 0 !important;
}
</style>