import { createResource } from 'frappe-ui'

export function useMindmapSave({ 
  isSaving, 
  savingCount, 
  lastSaved, 
  formatTime,
  changedNodeIds,
  SAVE_DELAY 
}) {
  let saveTimeout = null

  const saveNodeResource = createResource({
    url: "drive.api.mindmap.save_mindmap_node",
    method: "POST",
    onSuccess() {
      savingCount.value--
      if (savingCount.value <= 0) {
        savingCount.value = 0
        isSaving.value = false
      }
      lastSaved.value = formatTime(new Date())
    },
    onError() {
      savingCount.value--
      if (savingCount.value <= 0) {
        savingCount.value = 0
        isSaving.value = false
      }
    }
  })

  const deleteNodesResource = createResource({
    url: "drive.api.mindmap.delete_mindmap_nodes",
    method: "POST",
    onSuccess() {
      savingCount.value--
      if (savingCount.value <= 0) {
        savingCount.value = 0
        isSaving.value = false
      }
      lastSaved.value = formatTime(new Date())
    },
    onError() {
      savingCount.value--
      if (savingCount.value <= 0) {
        savingCount.value = 0
        isSaving.value = false
      }
    }
  })

  const saveNodesBatchResource = createResource({
    url: "drive.api.mindmap.save_mindmap_nodes_batch",
    method: "POST",
    onSuccess() {
      savingCount.value--
      if (savingCount.value <= 0) {
        savingCount.value = 0
        isSaving.value = false
      }
      lastSaved.value = formatTime(new Date())
    },
    onError() {
      savingCount.value--
      if (savingCount.value <= 0) {
        savingCount.value = 0
        isSaving.value = false
      }
    }
  })

  const broadcastEditingResource = createResource({
    url: "drive.api.mindmap.broadcast_node_editing",
    method: "POST"
  })

  const saveNode = ({ nodeId, entityName, nodes, edges, d3Renderer, nodeCreationOrder, permissions, mindmapData }) => {
    if (!mindmapData || !permissions.value.write) return

    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) return

    const { count, ...nodeData } = node
    const nodeWithPos = { ...nodeData }

    if (d3Renderer && d3Renderer.positions) {
      const pos = d3Renderer.positions.get(nodeId)
      if (pos) {
        nodeWithPos.position = { ...pos }
      }
    }

    if (nodeCreationOrder.value.has(nodeId)) {
      const order = nodeCreationOrder.value.get(nodeId)
      if (!nodeWithPos.data) {
        nodeWithPos.data = {}
      }
      nodeWithPos.data.order = order
    }

    const edge = edges.value.find(e => e.target === nodeId)

    const params = {
      entity_name: entityName,
      node_id: nodeId,
      node_data: JSON.stringify(nodeWithPos)
    }

    if (edge) {
      params.edge_data = JSON.stringify(edge)
    }

    savingCount.value++
    saveNodeResource.submit(params)

    changedNodeIds.value.delete(nodeId)
  }

  const saveImmediately = ({ entityName, nodes, edges, d3Renderer, nodeCreationOrder, permissions, mindmapData, elements }) => {
    if (!mindmapData || elements.value.length === 0) return

    if (!permissions.value.write) {
      return
    }

    if (changedNodeIds.value.size > 0) {
      isSaving.value = true

      const nodeIdsArray = Array.from(changedNodeIds.value)

      if (nodeIdsArray.length > 3) {
        const nodesToSave = []
        const edgesToSave = []

        nodeIdsArray.forEach(nodeId => {
          const node = nodes.value.find(n => n.id === nodeId)
          if (!node) return

          const { count, ...nodeData } = node
          const nodeWithPos = { ...nodeData }

          if (d3Renderer && d3Renderer.positions) {
            const pos = d3Renderer.positions.get(nodeId)
            if (pos) {
              nodeWithPos.position = { ...pos }
            }
          }

          if (nodeCreationOrder.value.has(nodeId)) {
            const order = nodeCreationOrder.value.get(nodeId)
            if (!nodeWithPos.data) {
              nodeWithPos.data = {}
            }
            nodeWithPos.data.order = order
          }

          nodesToSave.push(nodeWithPos)

          const edge = edges.value.find(e => e.target === nodeId)
          if (edge && !edgesToSave.find(e => e.id === edge.id)) {
            edgesToSave.push(edge)
          }
        })

        if (nodesToSave.length > 0) {
          savingCount.value++
          saveNodesBatchResource.submit({
            entity_name: entityName,
            nodes_data: JSON.stringify(nodesToSave),
            edges_data: edgesToSave.length > 0 ? JSON.stringify(edgesToSave) : null
          })
          
          // ⚠️ CRITICAL FIX: Chỉ xóa nodes đã save, tránh xóa mất nodes mới
          nodeIdsArray.forEach(nodeId => {
            changedNodeIds.value.delete(nodeId)
          })
        } else {
          isSaving.value = false
          nodeIdsArray.forEach(nodeId => {
            changedNodeIds.value.delete(nodeId)
          })
        }
      } else {
        const savedCount = nodeIdsArray.filter(nodeId => {
          const node = nodes.value.find(n => n.id === nodeId)
          if (node) {
            saveNode({ nodeId, entityName, nodes, edges, d3Renderer, nodeCreationOrder, permissions, mindmapData })
            return true
          }
          return false
        }).length

        if (savedCount === 0) {
          isSaving.value = false
          // ⚠️ FIX: Chỉ xóa nodes đã try save
          nodeIdsArray.forEach(nodeId => {
            changedNodeIds.value.delete(nodeId)
          })
        }
      }
    } else {
      console.log('⏭️ Không có node nào thay đổi, bỏ qua save')
    }
  }

  const scheduleSave = (params) => {
    if (!params.mindmapData) return

    if (!params.permissions.value.write) {
      return
    }

    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }

    saveTimeout = setTimeout(() => {
      saveImmediately(params)
    }, SAVE_DELAY)
  }

  return {
    saveNodeResource,
    deleteNodesResource,
    saveNodesBatchResource,
    broadcastEditingResource,
    saveNode,
    saveImmediately,
    scheduleSave,
  }
}

