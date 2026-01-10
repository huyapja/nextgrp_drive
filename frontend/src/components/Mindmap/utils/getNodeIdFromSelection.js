import { TextSelection } from "@tiptap/pm/state"

export function getNodeIdFromSelection(editor) {
  const { state } = editor
  const { selection } = state

  if (!(selection instanceof TextSelection)) return null

  const { $from } = selection

  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === "listItem") {
      return node.attrs?.nodeId || null
    }
  }

  return null
}
