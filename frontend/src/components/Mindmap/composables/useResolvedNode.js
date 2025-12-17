import { call } from "frappe-ui"

export function useResolvedNode({
  activeNode,
  comments,
  entityName,
  activeSessionIndex,
}) {
  async function resolveNode(label) {
    const node = activeNode.value
    const session = activeSessionIndex.value
    const list = comments.value || []

    if (!node || session == null) return

    // console.log(">>>>> label:", label);
    

    const filtered = list.filter(c =>
      String(c.node_id).trim() === String(node.id).trim() &&
      Number(c.session_index) === Number(session)
    )

    if (!filtered.length) return
    await call("drive.api.mindmap_comment.resolve_node", {
      entity_name: entityName,
      node_id: node.id,
      session_index: session,
      // comment_ids: commentIds,
    })
  }

  return { resolveNode }
}
