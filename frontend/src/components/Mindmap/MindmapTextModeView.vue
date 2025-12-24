<template>
    <MindmapTextNodeViewEditor :initial-content="content" @rename-title="onRenameTitle" @update-nodes="onUpdateNodes"
        @open-comment="onOpenComment" />
</template>

<script setup>
import { watch, ref, provide, toRef } from "vue"
import MindmapTextNodeViewEditor from "./MindmapTextNodeViewEditor.vue"
import { buildTextFromMindmap } from "./utils/buildTextFromMindmap"

const props = defineProps({
    nodes: Array,
    edges: Array,
    version: Number,
    activeCommentNode: Object,
})

const emit = defineEmits([
    "rename-title",
    "update-nodes",
    "open-comment",
])

const content = ref("")

function onRenameTitle(newTitle) {
    emit("rename-title", newTitle)
}

function onUpdateNodes(edits) {
    emit("update-nodes", edits)
}

function onOpenComment(nodeId) {
    emit("open-comment", nodeId)
}

provide("activeCommentNode", toRef(props, "activeCommentNode"))

watch(
    () => [props.nodes, props.edges, props.version],
    () => {
        content.value = buildTextFromMindmap(props.nodes, props.edges)
    },
    { immediate: true }
)
</script>
