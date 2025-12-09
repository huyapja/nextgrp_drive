import { ref } from "vue"
import { call } from "frappe-ui"

export function useMindmapCommentEditInput({ entityName, comments }) {
  const editingCommentId = ref(null)
  const editingValue = ref("")

  function startEdit(comment) {
    if (!comment?.name) return
    editingCommentId.value = comment.name
    editingValue.value = comment.parsed?.text || comment.comment?.text || ""
  }

  function cancelEdit() {
    editingCommentId.value = null
    editingValue.value = ""
  }

  async function submitEdit(comment) {
    if (!comment?.name || !editingValue.value.trim()) return

    const payload = {
      ...comment.parsed,
      text: editingValue.value.trim(),
      edited_at: new Date().toISOString()
    }

    try {
      const res = await call("drive.api.mindmap_comment.edit_comment", {
        mindmap_id: entityName,
        comment_id: comment.name,
        comment: JSON.stringify(payload)
      })

      const updated = res.comment

      const idx = comments.value.findIndex(c => c.name === updated.name)
      if (idx !== -1) {
        comments.value[idx] = updated
      }

      cancelEdit()
    } catch (err) {
      console.error("❌ Edit failed:", err)
    }
  }

  return {
    editingCommentId,
    editingValue,
    startEdit,
    submitEdit,
    cancelEdit
  }
}
