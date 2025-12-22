<template>
  <NodeViewWrapper class="image-wrapper" contenteditable="false">
    <img
      :src="node.attrs.src"
      draggable="false"
      @click.stop="open"
    />

    <button
      class="image-remove"
      @click.stop="remove"
      title="Xoá ảnh"
    >
      ✕
    </button>
  </NodeViewWrapper>
</template>


<script setup>
import { NodeViewWrapper } from "@tiptap/vue-3"
import { TextSelection } from "prosemirror-state"

const props = defineProps({
  node: Object,
  deleteNode: Function,
  editor: Object,
  getPos: Function,
})

function remove() {
  const { editor, node, getPos } = props
  const { state, view } = editor

  const pos = getPos()
  const $pos = state.doc.resolve(pos)

  const parent = $pos.parent
  const parentPos = $pos.before()

  let tr = state.tr

  // 👉 nếu imageRow chỉ có đúng 1 image
  const shouldRemoveParent =
    parent.type.name === "imageRow" &&
    parent.childCount === 1

  if (shouldRemoveParent) {
    // ❗ xoá imageRow TRƯỚC
    tr.delete(parentPos, parentPos + parent.nodeSize)
  } else {
    // ❗ chỉ xoá image
    tr.delete(pos, pos + node.nodeSize)
  }

  // reset selection về vị trí an toàn
  const safePos = Math.min(
    tr.doc.content.size,
    parentPos
  )

  tr.setSelection(
    TextSelection.near(tr.doc.resolve(safePos))
  )

  view.dispatch(tr)
  view.focus()
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
  background: rgba(0,0,0,.65);
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
