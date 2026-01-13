// listItemDragPlugin.js
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { TextSelection } from "@tiptap/pm/state"

export const listItemDragKey = new PluginKey("listItemDrag")

function getListItemPosFromDOM(view, li) {
  const { state } = view
  const { schema } = state
  const listItemType = schema.nodes.listItem
  if (!listItemType) return null

  const pos = view.posAtDOM(li, 0)
  const $pos = state.doc.resolve(pos)

  // đi ngược lên cho chắc chắn đúng listItem
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type === listItemType) {
      return $pos.before(d)
    }
  }
  return null
}

export function createListItemDragPlugin() {
  let dragInfo = null

  return new Plugin({
    key: listItemDragKey,

    props: {
      handleDOMEvents: {
        dragstart(view, event) {
          const handle = event.target.closest("[data-drag-handle]")
          if (!handle) return false

          const li = handle.closest("li[data-node-id]")
          if (!li) return false

          const fromPos = getListItemPosFromDOM(view, li)
          if (fromPos == null) return false

          dragInfo = { fromPos }

          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move"
            event.dataTransfer.setData("text/plain", "mindmap-node")
          }

          return true
        },

        dragend() {
          dragInfo = null
          return false
        },
      },

      handleDrop(view, event) {
        if (!dragInfo) return false
        event.preventDefault()

        const { state } = view
        const { schema, doc } = state
        const listItemType = schema.nodes.listItem
        const bulletListType = schema.nodes.bulletList
        if (!listItemType || !bulletListType) {
          dragInfo = null
          return false
        }

        let tr = state.tr

        const dropLi = event.target.closest("li[data-node-id]")
        if (!dropLi) {
          dragInfo = null
          return false
        }

        const toPosRaw = getListItemPosFromDOM(view, dropLi)
        const fromPos = dragInfo.fromPos
        if (toPosRaw == null || fromPos == null) {
          dragInfo = null
          return false
        }

        if (fromPos === toPosRaw) {
          dragInfo = null
          return false
        }

        const fromNode = doc.nodeAt(fromPos)
        const toNode = doc.nodeAt(toPosRaw)

        if (
          !fromNode ||
          !toNode ||
          fromNode.type !== listItemType ||
          toNode.type !== listItemType
        ) {
          dragInfo = null
          return false
        }

        // xác định BEFORE / INSIDE / AFTER
        const rect = dropLi.getBoundingClientRect()
        const ratio = (event.clientY - rect.top) / rect.height

        let dropMode
        if (ratio < 0.25) dropMode = "before"
        else if (ratio > 0.75) dropMode = "after"
        else dropMode = "inside"

        // clone nguyên node (cả attrs, content)
        const movingNode = fromNode.copy(fromNode.content)

        // xoá node cũ hoàn toàn
        tr = tr.delete(fromPos, fromPos + fromNode.nodeSize)

        // doc sau khi delete
        const docAfterDelete = tr.doc

        // toPos sau delete (nếu xóa trước target)
        let toPos = toPosRaw
        if (fromPos < toPosRaw) {
          toPos -= fromNode.nodeSize
        }

        if (dropMode === "inside") {
            return
          // ---------- CHÈN LÀM CON ----------
          const $target = docAfterDelete.resolve(toPos)
          const targetNode = $target.nodeAfter
          if (!targetNode || targetNode.type !== listItemType) {
            dragInfo = null
            return false
          }

          // tìm / tạo bulletList con
          let ulNode = null
          let ulOffset = null

          targetNode.forEach((child, offset) => {
            if (!ulNode && child.type === bulletListType) {
              ulNode = child
              ulOffset = offset
            }
          })

          let ulPos
          if (ulNode && ulOffset != null) {
            // đã có ul
            ulPos = toPos + 1 + ulOffset
          } else {
            // chưa có → tạo ul mới ở cuối listItem
            const newUl = bulletListType.create()
            tr = tr.insert(toPos + targetNode.nodeSize - 1, newUl)
            // doc thay đổi, resolve lại
            const newDoc = tr.doc
            const $t2 = newDoc.resolve(toPos)
            const t2 = $t2.nodeAfter
            ulPos = toPos + t2.nodeSize - 1 - newUl.nodeSize
          }

          // insert làm CON (đuôi danh sách con)
          const ulNodeFinal = tr.doc.nodeAt(ulPos)
          const insertPos = ulPos + ulNodeFinal.nodeSize - 1
          tr = tr.insert(insertPos, movingNode)

          const selectionPos = insertPos + 1
          tr = tr.setSelection(TextSelection.create(tr.doc, selectionPos))
        } else {
          // ---------- CHÈN FLAT TRƯỚC / SAU ----------
          let insertPos = toPos
          if (dropMode === "after") {
            insertPos += toNode.nodeSize
          }

          tr = tr.insert(insertPos, movingNode)

          const selectionPos = insertPos + 1
          tr = tr.setSelection(TextSelection.create(tr.doc, selectionPos))
        }

        tr.setMeta("ui-only", true)
        view.dispatch(tr)

        dragInfo = null
        return true
      },
    },
  })
}
