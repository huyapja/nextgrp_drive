// composables/useMindmapCommentInput.js
import { ref, watch } from "vue"
import { call } from "frappe-ui"

export function useMindmapCommentInput({ activeNodeId, entityName, emit }) {
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

  // ✅ FIX BUG: watch phải watch đúng ref
  watch(inputValue, val => {
    if (activeNodeId.value) {
      commentCache.value[activeNodeId.value] = val
      saveCache()
    }
    emit("update:input", val)
  })

  async function handleSubmit() {
    if (!activeNodeId.value || !inputValue.value.trim()) return

    const payload = {
      text: inputValue.value.trim(),
      created_at: new Date().toISOString()
    }

    const res = await call("drive.api.mindmap_comment.add_comment", {
      mindmap_id: entityName,
      node_id: activeNodeId.value,
      comment: JSON.stringify(payload)
    })

    inputValue.value = ""
    commentCache.value[activeNodeId.value] = ""
    saveCache()

    emit("submit", res.comment)
  }

  function handleCancel() {
    if (activeNodeId.value) {
      commentCache.value[activeNodeId.value] = ""
    }
    inputValue.value = ""
    saveCache()
    emit("cancel")
  }

  function loadDraft(nodeId) {
    inputValue.value = commentCache.value[nodeId] || ""
  }

  return {
    inputValue,
    handleSubmit,
    handleCancel,
    loadDraft
  }
}
