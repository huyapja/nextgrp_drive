<template>
  <NodeViewWrapper class="image-wrapper">
    <img :src="node.attrs.src" draggable="false" @click.stop="open" />

    <button class="image-remove" @mousedown.prevent @click.stop="remove" title="Xoá ảnh">
      ✕
    </button>
  </NodeViewWrapper>
</template>


<script setup>
import { NodeViewWrapper } from "@tiptap/vue-3"

const props = defineProps({
  node: Object,
  deleteNode: Function,
  editor: Object,
  getPos: Function,
})

function remove() {
  const { editor, getPos } = props
  const { state, view } = editor

  const pos = getPos()
  const $pos = state.doc.resolve(pos)

  const isInRow = $pos.parent.type.name === "imageRow"
  const rowPos = isInRow ? $pos.before() : null
  const rowHadOne = isInRow ? $pos.parent.childCount === 1 : false

  // 1️⃣ xoá đúng image
  props.deleteNode?.()

  // 2️⃣ nếu row chỉ có 1 ảnh → xoá luôn row
  if (isInRow && rowHadOne) {
    const tr = view.state.tr
    const mappedRowPos = tr.mapping.map(rowPos)
    const rowNode = tr.doc.nodeAt(mappedRowPos)

    if (rowNode && rowNode.type.name === "imageRow") {
      tr.delete(mappedRowPos, mappedRowPos + rowNode.nodeSize)
      view.dispatch(tr)
    }
  }

  editor.commands.focus()
}



function open() {
  const root = props.editor.view.dom

  const images = Array.from(
    root.querySelectorAll("img")
  ).map(i => i.src)

  const index = images.indexOf(props.node.attrs.src)

  if (index !== -1) {
    props.editor.emit("open-gallery", {
      images,
      index,
    })
  }
}

</script>

<style scoped>
.image-wrapper {
  position: relative;
  display: inline-block;
}

.image-wrapper img {
  width: 62px;
  height: 62px;
  object-fit: cover;
  border-radius: 6px;
}

.image-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, .65);
  color: white;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.image-wrapper:hover .image-remove {
  opacity: 1;
  pointer-events: auto;
}
</style>
