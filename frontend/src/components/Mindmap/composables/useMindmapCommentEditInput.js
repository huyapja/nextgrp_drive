import { ref } from "vue"
import { call } from "frappe-ui"

function isEmptyHTML(html) {
  if (!html) return true

  // Parse HTML
  const div = document.createElement("div")
  div.innerHTML = html

  // 1. Lấy text thuần
  const text = div.textContent?.replace(/\u00A0/g, "").trim()

  // 2. Kiểm tra có ảnh không
  const hasImage = div.querySelector("img")

  // rỗng nếu: không text + không img
  return !text && !hasImage
}

export function useMindmapCommentEditInput({
  entityName,
  comments,
  onEditDone,
}) {
  const editingCommentId = ref(null)
  const editingValue = ref("")

  function startEdit(comment) {
    if (!comment?.name) return

    editingCommentId.value = comment.name

    // Chuẩn hoá PARSED
    let parsed = {}

    // TH1: backend trả parsed đã đúng format
    if (comment.parsed) {
      parsed = comment.parsed
    }

    // TH2: chỉ có comment.comment là JSON string
    else if (typeof comment.comment === "string") {
      try {
        parsed = JSON.parse(comment.comment)
      } catch (e) {
        parsed = {}
      }
    }

    // TH3: fallback dữ liệu sai format
    else if (typeof comment.comment === "object") {
      parsed = comment.comment
    }

    // cuối cùng: lấy text
    editingValue.value =
      parsed.raw_html || parsed.safe_html || parsed.parsed || parsed.text || ""
  }

  function cancelEdit() {
    editingCommentId.value = null
    editingValue.value = ""
  }

  async function submitEdit(comment) {
    if (!comment?.name || !editingValue.value.trim()) return

    const finalHTML = editingValue.value

    if (isEmptyHTML(finalHTML)) {
      return
    }

    const payload = {
      ...comment.parsed,
      text: editingValue.value.trim(),
      edited_at: new Date().toISOString(),
    }

    try {
      const res = await call("drive.api.mindmap_comment.edit_comment", {
        mindmap_id: entityName,
        comment_id: comment.name,
        comment: JSON.stringify(payload),
      })

      const updated = res.comment

      const idx = comments.value.findIndex((c) => c.name === updated.name)
      if (idx !== -1) {
        comments.value[idx] = updated
      }

      cancelEdit()

      onEditDone?.()
    } catch (err) {
      console.error("Edit failed:", err)
    }
  }

  return {
    editingCommentId,
    editingValue,
    startEdit,
    submitEdit,
    cancelEdit,
  }
}
