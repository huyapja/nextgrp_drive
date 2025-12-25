<template>
    <NodeViewWrapper :as="tag" class="mm-node relative" :class="{
        'is-root': isRoot,
    }" :data-node-id="node.attrs.nodeId">
        <NodeViewContent />
    </NodeViewWrapper>
</template>

<script setup>
import { NodeViewWrapper, NodeViewContent } from "@tiptap/vue-3"

const props = defineProps({
    node: Object,
})

const isRoot = props.node.attrs.nodeId === "root"

const tag = {
    1: "h1",
    2: "h2",
    3: "h3",
}[props.node.attrs.level] || "h2"
</script>
