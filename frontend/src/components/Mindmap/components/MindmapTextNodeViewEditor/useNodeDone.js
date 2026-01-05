import { computed } from "vue"

export function useNodeDone({
  editor,
  node,
  getPos,
  onDoneNode,
  resolveNodeIdFromDOM,
}) {
  const isDone = computed(() => {
    return isStrikeActiveForWholeNode(
      editor,
      node,
      getPos
    )
  })

  function toggleDone(event) {
    const done = isStrikeActiveForWholeNode(
      editor,
      node,
      getPos
    )

    if (done) {
      removeStrikeForWholeNode(editor, node, getPos)
    } else {
      applyStrikeForWholeNode(editor, node, getPos)
    }

    if (!event || !resolveNodeIdFromDOM) return

    const nodeId = resolveNodeIdFromDOM(event.currentTarget)
    if (!nodeId) return

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
