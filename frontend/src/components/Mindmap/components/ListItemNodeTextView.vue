<template>
  <NodeViewWrapper as="li" :data-node-id="node.attrs.nodeId" :data-has-count="node.attrs.hasCount"
    :data-has-children="node.attrs.hasChildren" :data-collapsed="node.attrs.collapsed"
    :data-highlight="node.attrs.highlight || null" :data-completed="node.attrs.completed"
    :data-task-id="node.attrs.taskId || null" :data-task-mode="node.attrs.taskMode || null"
    :data-task-status="node.attrs.taskStatus || null" :data-level="node.attrs.level || null">
    <div class="li-inner">
      <!-- đoạn text -->
      <NodeViewContent />
    </div>
  </NodeViewWrapper>
</template>

<script setup>
import { NodeViewWrapper, NodeViewContent } from "@tiptap/vue-3"

defineProps({
  node: Object,
})
</script>
