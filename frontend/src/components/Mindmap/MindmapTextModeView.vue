<template>
    <MindmapTextNodeViewEditor :initial-content="content" @rename-title="onRenameTitle" @update-nodes="onUpdateNodes"
        @open-comment="onOpenComment" @add-child-node="onAddChildFromText" @done-node="onDoneNode" />
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
    "add-child-node",
    "done-node",
])

const content = ref("")

function onRenameTitle(newTitle) {
    emit("rename-title", newTitle)
}

function onUpdateNodes(edits) {
    emit("update-nodes", edits)
}

function onOpenComment(payload) {
    if (!payload) return

    const { nodeId, options = {} } = payload
    emit("open-comment", {
        nodeId,
        options,
    })
}

function onAddChildFromText(payload) {
    emit("add-child-node", payload)
}

function onDoneNode(payload) {
    emit('done-node', payload)
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
