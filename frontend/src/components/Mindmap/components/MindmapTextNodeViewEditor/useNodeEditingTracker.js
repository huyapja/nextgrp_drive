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
    nodeId
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
      })
    }


    lastSent.value = { nodeId }

    await broadcastEditingResource.submit({
      entity_name: entityName.value,
      node_id: nodeId ?? null,
      is_editing: true,
    })
  }

  async function forceStop(view = "none") {
    const prev = lastSent.value

    if (prev.nodeId) {
      await broadcastEditingResource.submit({
        entity_name: entityName.value,
        node_id: prev.nodeId,
        is_editing: false,
      })
    }

    lastSent.value = {
      nodeId: null,
    }
  }

  return {
    sendCaret,
    forceStop,
  }
}
