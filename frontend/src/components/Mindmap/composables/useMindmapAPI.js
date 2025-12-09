import { call } from "frappe-ui"

export function useMindmapAPI({ entityName }) {
  async function deleteComment(comment) {
    if (!comment?.name) return

    try {
      await call("drive.api.mindmap_comment.delete_comment_by_id", {
        mindmap_id: entityName,
        comment_id: comment.name,
      })
    } catch (err) {
      console.error("Delete failed:", err)
    }
  }
  return {
    deleteComment
  }
}
