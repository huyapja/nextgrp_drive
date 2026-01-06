import { computed } from "vue"

function isInProgress(status) {
  if (!status) return false
  return (
    status === "In Progress" ||
    status === "In-Progress" ||
    status === "Doing" ||
    status === "Đang làm"
  )
}

function isCompletedStatus(status) {
  return status === "Completed" || status === "Hoàn thành"
}

export function useNodeDone({
  editor,
  node,
  getPos,
  onDoneNode,
  resolveNodeIdFromDOM,
  currentActionNode,
}) {
  const isDone = computed(() => {
    return isStrikeActiveForWholeNode(editor, node, getPos)
  })

  function toggleDone(event) {
    if (!currentActionNode.value) return

    const done = isStrikeActiveForWholeNode(editor, node, getPos)

    const { completed, taskId, taskStatus, nodeId } = currentActionNode.value

    const hasTask = !!taskId || !!taskStatus

    // =========================
    // RULE A: NODE THƯỜNG
    // =========================
    if (!hasTask) {
      if (done) {
        removeStrikeForWholeNode(editor, node, getPos)
      } else {
        applyStrikeForWholeNode(editor, node, getPos)
      }

      onDoneNode?.(nodeId)
      return
    }

    // =========================
    // RULE B: TASK IN PROGRESS
    // =========================
    if (isInProgress(taskStatus)) {
      // không cho đánh xong
      if (done) {
        removeStrikeForWholeNode(editor, node, getPos)
      }

      onDoneNode?.(nodeId)
      return
    }

    // =========================
    // RULE C: TASK COMPLETED
    // =========================
    if (isCompletedStatus(taskStatus)) {
      // nếu đã strike → KHÔNG cho bỏ
      if (!done) {
        // cũng không cho apply thủ công
        // (strike phải đến từ sync completed)
      }

      onDoneNode?.(nodeId)
      return
    }

    // =========================
    // RULE D: TASK KHÁC (fallback)
    // =========================
    if (done) {
      removeStrikeForWholeNode(editor, node, getPos)
    } else {
      applyStrikeForWholeNode(editor, node, getPos)
    }

    onDoneNode?.(nodeId)
  }

  return {
    isDone,
    toggleDone,
  }
}

function removeStrikeForWholeNode(editor, node, getPos) {
  const pos = getPos?.()
  if (pos == null) return

  const { state, view } = editor
  const { schema, tr } = state
  const strike = schema.marks.strike
  if (!strike) return

  const from = pos + 1
  const to = pos + node.nodeSize - 1

  tr.removeMark(from, to, strike)
  tr.setMeta("ui-only", true)

  view.dispatch(tr)
}

function applyStrikeForWholeNode(editor, node, getPos) {
  const pos = getPos?.()
  if (pos == null) return

  const { state, view } = editor
  const { schema, tr } = state

  const markType = schema.marks.strike
  if (!markType) return

  const from = pos + 1
  const to = pos + node.nodeSize - 1

  tr.addMark(from, to, markType.create())
  tr.setMeta("ui-only", true)

  view.dispatch(tr)
}

function isStrikeActiveForWholeNode(editor, node, getPos) {
  const pos = getPos?.()
  if (pos == null) return false

  const { state } = editor
  const strike = state.schema.marks.strike
  if (!strike) return false

  const from = pos + 1
  const to = pos + node.nodeSize - 1

  let hasText = false
  let allStriked = true

  state.doc.nodesBetween(from, to, (n) => {
    if (!n.isText) return
    hasText = true
    if (!strike.isInSet(n.marks)) {
      allStriked = false
      return false
    }
  })

  return hasText && allStriked
}
