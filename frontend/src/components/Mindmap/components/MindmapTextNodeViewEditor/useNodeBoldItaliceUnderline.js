import { computed } from "vue"

/**
 * CHỈ ĐÓNG GÓI – KHÔNG ĐỔI LOGIC
 */
export function useNodeBoldItaliceUnderline({
  editor,
  node,
  getPos,
}) {
  const isBoldActive = computed(() => {
    return editor?.isActive("bold")
  })

  const isItalicActive = computed(() => {
    return editor?.isActive("italic")
  })

  const isUnderlineActive = computed(() => {
    return editor?.isActive("underline")
  })

  function toggleBold() {
    if (!editor) return

    const { selection } = editor.state

    if (!selection.empty) {
      editor.chain().focus().toggleBold().run()
      return
    }

    toggleMarkForWholeNode(
      editor,
      node,
      getPos,
      "bold"
    )
  }

  function toggleItalic() {
    if (!editor) return

    const { selection } = editor.state

    if (!selection.empty) {
      editor.chain().focus().toggleItalic().run()
      return
    }

    toggleMarkForWholeNode(
      editor,
      node,
      getPos,
      "italic"
    )
  }

  function toggleUnderline() {
    if (!editor) return

    const { selection } = editor.state

    if (!selection.empty) {
      editor.chain().focus().toggleUnderline().run()
      return
    }

    toggleMarkForWholeNode(
      editor,
      node,
      getPos,
      "underline"
    )
  }

  return {
    isBoldActive,
    isItalicActive,
    isUnderlineActive,
    toggleBold,
    toggleItalic,
    toggleUnderline,
  }
}

function toggleMarkForWholeNode(editor, node, getPos, markName) {
  const pos = getPos?.()
  if (pos == null) return

  const { state, view } = editor
  const { schema, tr } = state

  const markType = schema.marks[markName]
  if (!markType) return

  const from = pos + 1
  const to = pos + node.nodeSize - 1

  let hasMark = false
  state.doc.nodesBetween(from, to, node => {
    if (markType.isInSet(node.marks)) {
      hasMark = true
    }
  })

  if (hasMark) {
    tr.removeMark(from, to, markType)
  } else {
    tr.addMark(from, to, markType.create())
  }

  view.dispatch(tr)
}
