import { ref } from "vue"

export function useNodeEditingTracker({
  entityName,
  broadcastEditingResource,
  throttleMs = 80,
}) {
  const lastSent = ref({
    view: null,
    nodeId: null,
    from: null,
    to: null,
  })

  let lastTime = 0

  async function sendCaret({
    view,
    nodeId,
    from,
    to,
  }) {
    const now = Date.now()
    if (now - lastTime < throttleMs) return
    lastTime = now

    const prev = lastSent.value

    // 👉 nếu chuyển node → stop node cũ trước
    if (
      prev.nodeId &&
      prev.nodeId !== nodeId
    ) {
      await broadcastEditingResource.submit({
        entity_name: entityName.value,
        node_id: prev.nodeId,
        is_editing: false,
        view: prev.view,
        from_pos: null,
        to_pos: null,
      })
    }

    // 👉 nếu caret + node không đổi → bỏ
    if (
      prev.view === view &&
      prev.nodeId === nodeId &&
      prev.from === from &&
      prev.to === to
    ) {
      return
    }

    lastSent.value = { view, nodeId, from, to }

    await broadcastEditingResource.submit({
      entity_name: entityName.value,
      node_id: nodeId ?? null,
      is_editing: true,
      view,
      from_pos: from,
      to_pos: to,
    })
  }

  async function forceStop(view = "none") {
    const prev = lastSent.value

    if (prev.nodeId) {
      await broadcastEditingResource.submit({
        entity_name: entityName.value,
        node_id: prev.nodeId,
        is_editing: false,
        view,
        from_pos: null,
        to_pos: null,
      })
    }

    lastSent.value = {
      view: null,
      nodeId: null,
      from: null,
      to: null,
    }
  }

  return {
    sendCaret,
    forceStop,
  }
}
