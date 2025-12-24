<template>
    <MindmapTextNodeViewEditor :initial-content="content" @rename-title="onRenameTitle" @update-nodes="onUpdateNodes" />
</template>

<script setup>
import { watch, ref } from "vue"
import MindmapTextNodeViewEditor from "./MindmapTextNodeViewEditor.vue"
import { buildTextFromMindmap } from "./utils/buildTextFromMindmap"

const props = defineProps({
    nodes: Array,
    edges: Array,
    version: Number,
})

const emit = defineEmits([
    "rename-title",
    "update-nodes",
])

const content = ref("")

function onRenameTitle(newTitle) {
    emit("rename-title", newTitle)
}

function onUpdateNodes(edits) {
    emit("update-nodes", edits)
}

watch(
  () => [props.nodes, props.edges, props.version],
  () => {
    content.value = buildTextFromMindmap(props.nodes, props.edges)
  },
  { immediate: true }
)
</script>
