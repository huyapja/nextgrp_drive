// composables/useMindmapCommentInput.js
import { ref, watch, computed } from "vue"
import { call } from "frappe-ui"

/**
 * =========================
 * UTILS
 * =========================
 */

const STORAGE_KEY = "mindmap_comment_cache"

function loadAllCache() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
  } catch {
    return {}
  }
}

function saveAllCache(cache) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
}

function isEditorEmpty(html) {
  if (!html) return true

  const div = document.createElement("div")
  div.innerHTML = html

  // 1️⃣ có text thực
  const text = div.textContent?.replace(/\u00A0/g, "").trim()

  if (text) return false

  // 2️⃣ có ảnh trong imageRow
  const imageRow = div.querySelector('[data-type="image-row"]')
  if (imageRow && imageRow.querySelector("img")) {
    return false
  }

  return true
}

function parseGroupKey(groupKey) {
  if (!groupKey) return {}
  const [nodeId, sessionIndex] = groupKey.split("__")
  return { nodeId, sessionIndex: Number(sessionIndex) }
}

/**
 * =========================
 * COMPOSABLE
 * =========================
 */

export function useMindmapCommentInput({
  activeGroupKey,
  activeNode,
  entityName, // mindmap_id
  emit,
  previewImages,
  commentEditorRef,
}) {
  const inputValue = ref("")

  /**
   * =========================
   * CACHE STRUCTURE
   *
   * {
   *   [mindmap_id]: {
   *     [groupKey]: html
   *   }
   * }
   * =========================
   */

  const allCache = ref(loadAllCache())

  // cache theo đúng mindmap hiện tại
  const commentCache = computed(() => {
    if (!entityName) return {}
    if (!allCache.value[entityName]) {
      allCache.value[entityName] = {}
    }
    return allCache.value[entityName]
  })

  watch(
    activeGroupKey,
    (key) => {
      if (!key) {
        inputValue.value = ""
        return
      }

      // ⬇️ load draft ĐÚNG group
      inputValue.value = commentCache.value[key] || ""
    },
    { immediate: true }
  )

  /**
   * =========================
   * SAVE DRAFT (AUTO)
   * =========================
   */
  watch(inputValue, (val) => {
    if (!entityName) return
    if (!activeGroupKey.value) return

    if (isEditorEmpty(val)) {
      delete commentCache.value[activeGroupKey.value]
    } else {
      commentCache.value[activeGroupKey.value] = val
    }

    saveAllCache(allCache.value)
  })

  /**
   * =========================
   * SUBMIT COMMENT
   * =========================
   */
  async function handleSubmit() {
    if (!entityName) return
    if (!activeGroupKey.value) return

    const finalHTML = inputValue.value
    if (isEditorEmpty(finalHTML)) return

    const { nodeId, sessionIndex } = parseGroupKey(activeGroupKey.value)
    if (!nodeId || !sessionIndex) return

    const node_key = activeNode?.value?.node_key || crypto.randomUUID()

    const payload = {
      text: finalHTML,
      created_at: new Date().toISOString(),
    }

    const res = await call("drive.api.mindmap_comment.add_comment", {
      mindmap_id: entityName,
      node_id: nodeId,
      session_index: sessionIndex,
      comment: JSON.stringify(payload),
      node_key,
    })

    // ✅ clear draft đúng scope
    delete commentCache.value[activeGroupKey.value]
    saveAllCache(allCache.value)

    // reset UI
    inputValue.value = ""
    previewImages.value = []
    commentEditorRef.value?.[activeGroupKey.value]?.clearValues?.()

    emit("submit", res.comment)
  }

  /**
   * =========================
   * CANCEL
   * =========================
   */
  function handleCancel() {
    if (entityName && activeGroupKey.value) {
      delete commentCache.value[activeGroupKey.value]
      saveAllCache(allCache.value)
    }

    inputValue.value = ""
    previewImages.value = []

    emit("cancel")
  }

  /**
   * =========================
   * LOAD DRAFT
   * =========================
   */
  function loadDraft(groupKey) {
    if (!entityName) return
    inputValue.value = commentCache.value[groupKey] || ""
  }

  return {
    inputValue,
    handleSubmit,
    handleCancel,
    loadDraft,
  }
}
