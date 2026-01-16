import { TextSelection } from "@tiptap/pm/state"
import { splitListItem } from "@tiptap/pm/schema-list"
import { sinkListItem, liftListItem } from "@tiptap/pm/schema-list"
import { toast } from '@/utils/toasts'


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

export function createEditorKeyDown({ editor, flags, getEditingUserOfNode }) {
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

  let lastBlockedNodeId = null
  let lastToastAt = 0

  return function handleKeyDown(view, event) {
    const { state } = view
    const { selection, schema } = state
    const { $from } = selection

    // ==============================
    // 🔒 REMOTE LOCK – BLOCK SỚM
    // ==============================
    let liDepth = null
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type === schema.nodes.listItem) {
        liDepth = d
        break
      }
    }

    if (liDepth) {
      const liNode = $from.node(liDepth)
      const nodeId = liNode?.attrs?.nodeId

      // reset khi sang node khác
      if (lastBlockedNodeId && lastBlockedNodeId !== nodeId) {
        lastBlockedNodeId = null
      }

      if (nodeId) {
        const editingUser = getEditingUserOfNode?.(nodeId)

        if (editingUser) {
          const now = Date.now()

          // ⚠️ FIX: Sử dụng cơ chế global throttle để tránh spam toast
          if (!window.__lastEditingToast) {
            window.__lastEditingToast = {}
          }
          const lastToast = window.__lastEditingToast[nodeId] || 0
          
          if (lastBlockedNodeId !== nodeId || now - lastToast > 2000) {
            lastBlockedNodeId = nodeId
            lastToastAt = now
            window.__lastEditingToast[nodeId] = now

            toast({
              title: `${editingUser.userName} đang chỉnh sửa node này`,
              text: "Vui lòng đợi họ hoàn thành",
              indicator: "orange",
              timeout: 3,
            })
          }

          const blocked =
            event.key.length === 1 ||
            event.key === "Enter" ||
            event.key === "Backspace" ||
            event.key === "Delete" ||
            event.key === "Tab"

          if (blocked) {
            event.preventDefault()
            event.stopPropagation()
            return true
          }
        }
      }
    }
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

        const hasChildren = !!current.node.attrs.hasChildren
        const isCollapsed = !!current.node.attrs.collapsed

        if (hasChildren && !isCollapsed) {
          // =========================
          // CASE: có con + đang mở → thêm CON
          // =========================
          const parentNode = current.node
          const parentPos = current.pos

          const paragraph = parentNode.child(0)
          const bulletList = parentNode.child(1)

          if (bulletList && bulletList.type === schema.nodes.bulletList) {
            let tr = state.tr

            const inlineRootMark = schema.marks.inlineRoot.create()
            const text = schema.text("Nhánh mới", [inlineRootMark])
            const p = schema.nodes.paragraph.create({}, text)
            const li = schema.nodes.listItem.create(
              { nodeId: newNodeId, hasCount: false },
              p
            )

            // vị trí bắt đầu của bulletList
            const bulletListPos = parentPos + 1 + paragraph.nodeSize

            // insert vào đầu children
            tr = tr.insert(bulletListPos + 1, li)

            const caretPos = bulletListPos + 1 + 2 + text.nodeSize
            tr = tr.setSelection(TextSelection.create(tr.doc, caretPos))

            dispatch(tr)

            editor.value?.options?.onAddChildNode?.({
              anchorNodeId: nodeId,
              newNodeId,
              position: "inside_child",
            })
          }
        } else {
          // =========================
          // CASE: không có con OR đang collapsed → thêm DƯỚI
          // =========================
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
        const { state, dispatch } = view
        const { schema } = state

        const newNodeId = crypto.randomUUID()
        flags.isCreatingDraftNode = true

        // vị trí insert listItem mới
        const liPos = $from.before(liDepth)

        // tạo inlineRoot mark ở trạng thái CLEAN
        // → KHÔNG inherit highlight / background
        const inlineRootMark = schema.marks.inlineRoot.create({ clean: true })

        // ext mặc định cho node mới
        const textNode = schema.text("Nhánh mới", [inlineRootMark])

        // paragraph
        const paragraph = schema.nodes.paragraph.create({}, textNode)

        //listItem mới (KHÔNG có highlight)
        const newListItem = schema.nodes.listItem.create(
          {
            nodeId: newNodeId,
            hasCount: false,
            highlight: null, // đảm bảo semantic highlight = null
          },
          paragraph
        )

        // nsert vào document
        const tr = state.tr.insert(liPos, newListItem)

        dispatch(tr)

        //  báo intent cho mindmap layer
        editor.value?.options?.onAddChildNode?.({
          anchorNodeId: nodeId,
          newNodeId,
          position: "before_carpet",
        })

        // reset flag
        requestAnimationFrame(() => {
          flags.isCreatingDraftNode = false
        })

        event.preventDefault()
        return true
      }

      // ==============================
      // CASE 3: CARET Ở GIỮA → SPLIT (ID CŨ = AFTER)
      // ==============================
      if (isInMiddle) {
        const { state, view } = editor.value
        const { selection, schema } = state
        const { $from } = selection

        // 1️⃣ tìm listItem hiện tại
        let liDepth = null
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type === schema.nodes.listItem) {
            liDepth = d
            break
          }
        }
        if (!liDepth) return false

        const liNode = $from.node(liDepth)

        // 2️⃣ paragraph đầu tiên trong listItem
        const paragraph = liNode.child(0)
        if (!paragraph || !paragraph.isTextblock) return false

        // 3️⃣ lấy text CHÍNH XÁC của node hiện tại
        const fullText = paragraph.textContent || ""
        const cutPos = $from.parentOffset

        const beforeText = fullText.slice(0, cutPos).trim()
        const afterText = fullText.slice(cutPos).trim()

        // không split nếu 1 bên rỗng
        if (!beforeText || !afterText) return false

        // 4️⃣ tạo ID mới cho node BEFORE
        const newNodeId = crypto.randomUUID()
        flags.isCreatingDraftNode = true

        editor.value?.options?.onAddChildNode?.({
          position: "split_before",
          anchorNodeId: nodeId,
          newNodeId,
          label: `<p>${beforeText}</p>`,
        })

        // split
        splitListItem(schema.nodes.listItem)(state, view.dispatch)

        // state sau split
        const nextState = view.state
        const tr = nextState.tr

        let newLiPos = null
        let oldLiPos = null

        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type === schema.nodes.listItem) {
            newLiPos = $from.before(d)
            oldLiPos = $from.before(d) - $from.node(d).nodeSize
            break
          }
        }

        if (newLiPos == null || oldLiPos == null) return true

        const newLi = tr.doc.nodeAt(newLiPos)
        if (newLi) {
          const { hasCount, ...restAttrs } = newLi.attrs

          tr.setNodeMarkup(newLiPos, undefined, {
            ...restAttrs,
            nodeId: newNodeId,
          })
          // resolve lại position SAU KHI setNodeMarkup
          const $liPos = tr.doc.resolve(newLiPos)

          // tìm paragraph thật sự trong listItem
          let para = null
          let paraPos = null

          $liPos.node().forEach((child, offset) => {
            if (child.isTextblock && !para) {
              para = child
              paraPos = $liPos.start() + offset
            }
          })
        }

        view.dispatch(tr)

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
      if (currentNodeId && parentNodeId && currentNodeId !== parentNodeId) {
        editor.value?.options?.onAddChildNode?.({
          nodeId: currentNodeId,
          anchorNodeId: parentNodeId,
          position: "tab_add_child",
        })
      }

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
