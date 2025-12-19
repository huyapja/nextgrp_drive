// composables/useMindmapCommentInput.js
import { ref, watch } from "vue"
import { call } from "frappe-ui"

function isEmptyHTML(html) {
  if (!html) return true

  const div = document.createElement("div")
  div.innerHTML = html

  const text = div.textContent?.replace(/\u00A0/g, "").trim()
  const hasImage = div.querySelector("img")

  return !text && !hasImage
}

function parseGroupKey(groupKey) {
  if (!groupKey) return {}
  const [nodeId, sessionIndex] = groupKey.split("__")
  return { nodeId, sessionIndex: Number(sessionIndex) }
}

export function useMindmapCommentInput({
  activeGroupKey,
  activeNode,
  entityName,
  emit,
  previewImages,
  commentEditorRef,
}) {
  const inputValue = ref("")

  // cache theo groupKey
  const commentCache = ref(
    JSON.parse(localStorage.getItem("mindmap_comment_cache") || "{}")
  )

  function saveCache() {
    localStorage.setItem(
      "mindmap_comment_cache",
      JSON.stringify(commentCache.value)
    )
  }

  // =========================
  // SAVE DRAFT THEO GROUP
  // =========================
  watch(inputValue, (val) => {
    if (!activeGroupKey.value) return

    if (isEmptyHTML(val)) {
      delete commentCache.value[activeGroupKey.value]
    } else {
      commentCache.value[activeGroupKey.value] = val
    }

    saveCache()
  })

  // =========================
  // SUBMIT
  // =========================
  async function handleSubmit() {
    if (!activeGroupKey.value) return

    const finalHTML = inputValue.value
    if (isEmptyHTML(finalHTML) && !previewImages.value.length) return

    const { nodeId, sessionIndex } = parseGroupKey(activeGroupKey.value)
    if (!nodeId || !sessionIndex) return

    const node_key = activeNode?.value?.node_key || null

    const payload = {
      text: finalHTML,
      created_at: new Date().toISOString(),
    }

    const res = await call("drive.api.mindmap_comment.add_comment", {
      mindmap_id: entityName,
      node_id: nodeId,
      session_index: sessionIndex,
      comment: JSON.stringify(payload),
      node_key: node_key !== null ? node_key : crypto.randomUUID()
    })

    // reset
    inputValue.value = ""
    previewImages.value = []
    commentEditorRef.value?.[activeGroupKey.value]?.clearValues?.()

    emit("submit", res.comment)
  }

  // =========================
  // CANCEL
  // =========================
  function handleCancel() {
    if (activeGroupKey.value) {
      commentCache.value[activeGroupKey.value] = ""
    }

    inputValue.value = ""
    previewImages.value = []
    saveCache()

    emit("cancel")
  }

  // =========================
  // LOAD DRAFT
  // =========================
  function loadDraft(groupKey) {
    inputValue.value = commentCache.value[groupKey] || ""
  }

  return {
    inputValue,
    handleSubmit,
    handleCancel,
    loadDraft,
  }
}
