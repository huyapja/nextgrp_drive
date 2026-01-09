<template>
    <MindmapTextNodeViewEditor :permissions="props.permissions" :initial-content="content" @rename-title="onRenameTitle"
        @update-nodes="onUpdateNodes" @open-comment="onOpenComment" @add-child-node="onAddChildFromText"
        @done-node="onDoneNode" @copy-node="onCopyNode" @task-link-node="onTaskLinkNode" @delete-node="onDeleteNode" @unlink-task-node="onUnlinkTaskNode" @insert-images="onInsertImages"/>
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
    permissions: {
        type: Object,
    }
})

const emit = defineEmits([
    "rename-title",
    "update-nodes",
    "open-comment",
    "add-child-node",
    "done-node",
    "copy-node",
    "task-link-node",
    "delete-node",
    "unlink-task-node",
    "insert-images"
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

function onCopyNode(payload) {
    emit('copy-node', payload)
}

function onTaskLinkNode(payload) {
    emit('task-link-node', payload)
}

function onDeleteNode(payload) {
    emit('delete-node', payload)
}

function onUnlinkTaskNode(payload) {
    emit('unlink-task-node', payload)
}

function onInsertImages(payload) {
    emit('insert-images', payload)
}

provide("activeCommentNode", toRef(props, "activeCommentNode"))

const hoverCommentNodeId = ref(null)

provide("hoverCommentNodeId", hoverCommentNodeId)

watch(
    () => [props.nodes, props.edges, props.version],
    () => {
        content.value = buildTextFromMindmap(props.nodes, props.edges)
    },
    { immediate: true }
)
</script>
