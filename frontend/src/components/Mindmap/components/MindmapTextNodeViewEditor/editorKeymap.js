import { TextSelection } from "@tiptap/pm/state"
import { splitListItem } from "@tiptap/pm/schema-list"

export function createEditorKeyDown({ editor, flags }) {
  function insertTempChildNode(editorInstance, newNodeId) {
    const { state, view } = editorInstance
    const { selection, schema } = state
    const { $from } = selection

    let found = null
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type === schema.nodes.listItem) {
        found = { node: $from.node(d), pos: $from.before(d) }
        break
      }
    }
    if (!found) return

    const insertPos = found.pos + found.node.nodeSize
    const text = schema.text("Nhánh mới")

    const p = schema.nodes.paragraph.create({}, text)
    const li = schema.nodes.listItem.create({ nodeId: newNodeId }, p)

    let tr = state.tr.insert(insertPos, li)

    const caretPos = insertPos + 2 + text.nodeSize
    tr = tr.setSelection(TextSelection.create(tr.doc, caretPos))

    view.dispatch(tr)
    view.focus()
  }

  return function handleKeyDown(view, event) {
    // ==============================
    // ADD CHILD NODE
    // ==============================
    if (event.key === "Enter") {
      const { state, dispatch } = view
      const { selection, schema } = state
      if (!selection.empty) return false

      const { $from } = selection

      // tìm listItem
      let liDepth = null
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type === schema.nodes.listItem) {
          liDepth = d
          break
        }
      }
      if (!liDepth) return false

      const liNode = $from.node(liDepth)
      const nodeId = liNode.attrs.nodeId
      if (!nodeId) return false

      const parentSize = $from.parent.content.size
      const offset = $from.parentOffset

      const isAtStart = offset === 0
      const isAtEnd = offset === parentSize
      const isInMiddle = offset > 0 && offset < parentSize

      // ==============================
      // CASE 1: CARET Ở CUỐI → ADD CHILD
      // ==============================
      if (isAtEnd) {
        const newNodeId = crypto.randomUUID()
        flags.isCreatingDraftNode = true

        insertTempChildNode(editor.value, newNodeId)

        editor.value?.options?.onAddChildNode?.({
          anchorNodeId: nodeId,
          newNodeId,
          position: "after_carpet",
        })

        requestAnimationFrame(() => {
          flags.isCreatingDraftNode = false
        })

        event.preventDefault()
        return true
      }

      // ==============================
      // CASE 2: CARET Ở ĐẦU → INSERT LI PHÍA TRÊN
      // ==============================
      if (isAtStart) {
        const newNodeId = crypto.randomUUID()
        flags.isCreatingDraftNode = true

        const liPos = $from.before(liDepth)

        // ✅ FIX ĐÚNG
        const inlineRootMark = schema.marks.inlineRoot.create()
        const text = schema.text("Nhánh mới", [inlineRootMark])
        const p = schema.nodes.paragraph.create({}, text)

        const newLi = schema.nodes.listItem.create(
          { nodeId: newNodeId, hasCount: false },
          p
        )

        let tr = state.tr.insert(liPos, newLi)

        // caret sau chữ "Nhánh mới"
        const caretPos = liPos + 2 + text.nodeSize
        tr = tr.setSelection(TextSelection.create(tr.doc, caretPos))

        dispatch(tr)

        editor.value?.options?.onAddChildNode?.({
          anchorNodeId: nodeId,
          newNodeId,
          position: "before_carpet",
        })

        requestAnimationFrame(() => {
          flags.isCreatingDraftNode = false
        })

        event.preventDefault()
        return true
      }

      // ==============================
      // CASE 3: CARET Ở GIỮA → SPLIT LIST ITEM
      // ==============================
      if (isInMiddle) {
        const newNodeId = crypto.randomUUID()
        flags.isCreatingDraftNode = true

        splitListItem(schema.nodes.listItem)(state, dispatch)

        let tr = view.state.tr
        const $pos = view.state.selection.$from

        const newLiPos = $pos.before(liDepth)
        const newLi = tr.doc.nodeAt(newLiPos)

        if (newLi) {
          tr = tr.setNodeMarkup(newLiPos, undefined, {
            ...newLi.attrs,
            nodeId: newNodeId,
            hasCount: false,
          })
        }

        dispatch(tr)

        editor.value?.options?.onAddChildNode?.({
          anchorNodeId: nodeId,
          newNodeId,
        })

        requestAnimationFrame(() => {
          flags.isCreatingDraftNode = false
        })

        event.preventDefault()
        return true
      }
    }

    // ==============================
    // CTRL / CMD + A → SELECT BLOCK
    // ==============================
    if ((event.ctrlKey || event.metaKey) && event.key === "a") {
      const { state, dispatch } = view
      const { selection } = state

      if (!selection.empty) return false

      const { $from } = selection

      let depth = $from.depth
      while (depth > 0 && !$from.node(depth).isBlock) {
        depth--
      }

      const blockNode = $from.node(depth)
      if (!blockNode) return false

      const start = $from.start(depth)
      const end = start + blockNode.nodeSize

      dispatch(
        state.tr.setSelection(
          state.selection.constructor.create(state.doc, start, end - 1)
        )
      )

      event.preventDefault()
      return true
    }

    return false
  }
}
