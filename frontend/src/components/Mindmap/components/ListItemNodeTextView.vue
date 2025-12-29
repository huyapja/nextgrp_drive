<template>
  <NodeViewWrapper as="li" :data-node-id="node.attrs.nodeId" :data-has-count="node.attrs.hasCount"
    :data-has-children="node.attrs.hasChildren">
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
