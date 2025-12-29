import { Plugin } from "prosemirror-state"

export const syncListItemChildrenPlugin = new Plugin({
  appendTransaction(transactions, oldState, newState) {
    if (!transactions.some(tr => tr.docChanged)) return null

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
})
