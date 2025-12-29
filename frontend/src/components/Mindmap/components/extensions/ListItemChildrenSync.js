// extensions/ListItemChildrenSync.js
import { Extension } from "@tiptap/core"
import { Plugin } from "prosemirror-state"

export const ListItemChildrenSync = Extension.create({
  name: "listItemChildrenSync",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, oldState, newState) {
          const { schema } = newState
          const listItemType = schema.nodes.listItem
          if (!listItemType) return null

          let tr = newState.tr
          let changed = false

          newState.doc.descendants((node, pos) => {
            if (node.type !== listItemType) return

            const hasChildren = node.childCount > 1
            if (node.attrs.hasChildren === hasChildren) return

            tr = tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              hasChildren,
            })
            changed = true
          })

          return changed ? tr : null
        },
      }),
    ]
  },
})
