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
          const bulletList = schema.nodes.bulletList
          const orderedList = schema.nodes.orderedList

          if (!listItemType) return null

          let tr = newState.tr
          let changed = false

          newState.doc.descendants((node, pos) => {
            if (node.type !== listItemType) return

            let hasChildren = false

            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i)
              if (child.type === bulletList || child.type === orderedList) {
                hasChildren = true
                break
              }
            }

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
