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
import { inject, onMounted, onBeforeUnmount } from "vue"

const props = defineProps({
  node: Object,
  updateAttributes: Function,
})

const emitter = inject("emitter")

function handleTaskLink(payload) {
  if (payload.nodeId !== props.node.attrs.nodeId) return

  const { taskId, mode, status } = payload  

  props.updateAttributes({
    taskId: taskId || null,
    taskMode: mode || null,
    taskStatus: status || null,
  })
}

onMounted(() => {
  emitter?.on("task-link-node", handleTaskLink)
})

onBeforeUnmount(() => {
  emitter?.off("task-link-node", handleTaskLink)
})
</script>
