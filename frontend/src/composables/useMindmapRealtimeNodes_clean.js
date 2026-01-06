import { nextTick } from 'vue'

export function useMindmapRealtimeNodes({
  store,
  nodes,
  edges,
  elements,
  selectedNode,
  editingNode,
  nodeEditingUsers,
  nodeCreationOrder,
  isSaving,
  entityName,
  d3Renderer,
  editingStartTime,
  changedNodeIds,
  calculateNodeHeightWithImages
}) {

  const handleRealtimeNodesDeleted = (payload) => {
    console.log('handleRealtimeNodesDeleted - stub')
  }

  const handleRealtimeNodeEditing = (payload) => {
    console.log('handleRealtimeNodeEditing - stub')
  }

  const handleRealtimeNodesBatchUpdate = (payload) => {
    console.log('handleRealtimeNodesBatchUpdate - stub')
  }

  const handleRealtimeNodeUpdate = (payload) => {
    console.log('handleRealtimeNodeUpdate - stub')
  }

  return {
    handleRealtimeNodesDeleted,
    handleRealtimeNodeEditing,
    handleRealtimeNodesBatchUpdate,
    handleRealtimeNodeUpdate
  }
}
