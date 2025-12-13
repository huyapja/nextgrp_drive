// composables/useMindmapCommentInput.js
import { ref, watch } from "vue"
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

export function useMindmapCommentInput({
  activeNodeId,
  entityName,
  emit,
  previewImages,
  commentEditorRef,
}) {
  const inputValue = ref("")
  const commentCache = ref(
    JSON.parse(localStorage.getItem("mindmap_comment_cache") || "{}")
  )

  function saveCache() {
    localStorage.setItem(
      "mindmap_comment_cache",
      JSON.stringify(commentCache.value)
    )
  }

  // FIX BUG: watch phải watch đúng ref
  watch(inputValue, (val) => {
    if (activeNodeId.value) {
      commentCache.value[activeNodeId.value] = val
      saveCache()
    }
    // emit("update:input", val)
  })

  async function handleSubmit() {
    if (!activeNodeId.value) return

    const finalHTML = inputValue.value

    if (isEmptyHTML(finalHTML) && !previewImages.value.length) {
      return
    }
    const payload = {
      text: finalHTML,
      created_at: new Date().toISOString(),
    }

    const res = await call("drive.api.mindmap_comment.add_comment", {
      mindmap_id: entityName,
      node_id: activeNodeId.value,
      comment: JSON.stringify(payload),
    })

    // RESET SAU KHI GỬI
    inputValue.value = ""
    commentCache.value[activeNodeId.value] = ""
    commentEditorRef.value[activeNodeId]?.clearValues()
    saveCache()

    emit("submit", res.comment)
  }

  function handleCancel() {
    if (activeNodeId.value) {
      commentCache.value[activeNodeId.value] = ""
    }

    inputValue.value = ""
    previewImages.value = []

    saveCache()

    activeNodeId.value = null

    emit("update:node", null)
    emit("cancel")
  }

  function loadDraft(nodeId) {
    inputValue.value = commentCache.value[nodeId] || ""
  }

  return {
    inputValue,
    handleSubmit,
    handleCancel,
    loadDraft,
  }
}
