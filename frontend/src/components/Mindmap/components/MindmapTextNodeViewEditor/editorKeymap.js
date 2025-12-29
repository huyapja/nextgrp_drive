import { TextSelection } from "@tiptap/pm/state"
import { splitListItem } from "@tiptap/pm/schema-list"
import { sinkListItem, liftListItem } from "@tiptap/pm/schema-list"

function getCurrentListItem($from, schema) {
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type === schema.nodes.listItem) {
      return {
        node,
        depth: d,
        pos: $from.before(d),
      }
    }
  }
  return null
}

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

    const inlineRootMark = schema.marks.inlineRoot.create()
    const text = schema.text("Nhánh mới", [inlineRootMark])

    const p = schema.nodes.paragraph.create({}, text)
    const li = schema.nodes.listItem.create(
      { nodeId: newNodeId, hasCount: false },
      p
    )

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
      // CASE 1: CARET Ở CUỐI
      // - nếu có con → chui vào CON (đầu danh sách)
      // - nếu không → hành vi cũ
      // ==============================
      if (isAtEnd) {
        const newNodeId = crypto.randomUUID()
        flags.isCreatingDraftNode = true

        const current = getCurrentListItem($from, schema)
        if (!current) return false

        if (current.node.attrs.hasChildren) {
          const parentNode = current.node
          const parentPos = current.pos

          const paragraph = parentNode.child(0)
          const bulletList = parentNode.child(1)

          let tr = state.tr

          const inlineRootMark = schema.marks.inlineRoot.create()
          const text = schema.text("Nhánh mới", [inlineRootMark])
          const p = schema.nodes.paragraph.create({}, text)
          const li = schema.nodes.listItem.create(
            { nodeId: newNodeId, hasCount: false },
            p
          )

          if (bulletList && bulletList.type === schema.nodes.bulletList) {
            // pos bắt đầu của bulletList
            const bulletListPos = parentPos + 1 + paragraph.nodeSize

            // insert vào đầu list
            tr = tr.insert(bulletListPos + 1, li)

            const caretPos = bulletListPos + 1 + 2 + text.nodeSize

            tr = tr.setSelection(TextSelection.create(tr.doc, caretPos))
          }

          dispatch(tr)

          editor.value?.options?.onAddChildNode?.({
            anchorNodeId: nodeId,
            newNodeId,
            position: "inside_child",
          })
        } else {
          insertTempChildNode(editor.value, newNodeId)

          editor.value?.options?.onAddChildNode?.({
            anchorNodeId: nodeId,
            newNodeId,
            position: "after_carpet",
          })
        }

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

        const inlineRootMark = schema.marks.inlineRoot.create()
        const text = schema.text("Nhánh mới", [inlineRootMark])
        const p = schema.nodes.paragraph.create({}, text)

        const newLi = schema.nodes.listItem.create(
          { nodeId: newNodeId, hasCount: false },
          p
        )

        const tr = state.tr.insert(liPos, newLi)

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

    if (event.key === "Tab") {
      const { state, dispatch } = view
      const { schema, selection } = state
      const { $from } = selection

      // SHIFT + TAB → outdent
      if (event.shiftKey) {
        const lifted = liftListItem(schema.nodes.listItem)(state, dispatch)
        if (lifted) {
          event.preventDefault()
          return true
        }
        return false
      }

      // lấy listItem hiện tại
      const current = getCurrentListItem($from, schema)
      if (!current) return false

      const currentNodeId = current.node.attrs.nodeId
      if (!currentNodeId) return false

      // tìm node bên trên (node-1)
      const parentList = $from.node(current.depth - 1)
      const index = $from.index(current.depth - 1)

      if (index === 0) return false // không có node bên trên

      const prevLi = parentList.child(index - 1)
      const parentNodeId = prevLi?.attrs?.nodeId
      if (!parentNodeId) return false

      // đổi DOM (editor)
      const sunk = sinkListItem(schema.nodes.listItem)(state, dispatch)
      if (!sunk) return false

      // báo cho mindmap: MOVE node hiện tại vào node bên trên
      editor.value?.options?.onAddChildNode?.({
        nodeId: currentNodeId,
        anchorNodeId: parentNodeId,
        position: "tab_add_child",
      })

      event.preventDefault()
      return true
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
