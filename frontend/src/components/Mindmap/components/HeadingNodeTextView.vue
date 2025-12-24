<template>
    <NodeViewWrapper :as="tag" class="mm-node relative" :class="{
        'has-count': node.attrs.hasCount,
        'is-root': isRoot,
    }" :data-node-id="node.attrs.nodeId">
        <NodeViewContent />

        <svg class="comment-icon" v-if="!isRoot" fill="#2563eb" width="20" height="20" viewBox="0 0 32 32" version="1.1"
            xmlns="http://www.w3.org/2000/svg">
            <path
                d="M25.785 4.952h-19.57c-1.235 0-2.236 1.002-2.236 2.236v12.488c0 1.234 1.001 2.236 2.236 2.236h3.729l0.001 5.137 5.704-5.137h10.137c1.236 0 2.236-1.002 2.236-2.236v-12.488c-0.001-1.234-1.001-2.236-2.237-2.236zM10 13.969c-0.553 0-1-0.448-1-1 0-0.553 0.447-1 1-1 0.552 0 1 0.447 1 1 0 0.552-0.448 1-1 1zM14 13.927c-0.553 0-1-0.448-1-1 0-0.553 0.447-1 1-1 0.552 0 1 0.447 1 1 0 0.552-0.448 1-1 1zM18.020 13.948c-0.552 0-1-0.447-1-1 0-0.552 0.448-1 1-1 0.553 0 1 0.448 1 1s-0.448 1-1 1zM22 13.969c-0.553 0-1-0.448-1-1 0-0.553 0.447-1 1-1 0.552 0 1 0.447 1 1 0 0.552-0.448 1-1 1z">
            </path>
        </svg>
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
