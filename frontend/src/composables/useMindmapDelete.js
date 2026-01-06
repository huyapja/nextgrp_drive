import { ref } from 'vue'
import { call } from 'frappe-ui'

/**
 * Mindmap Delete Operations
 * Quản lý xóa nodes và dialogs xác nhận
 */
export function useMindmapDelete({
  nodes,
  edges,
  elements,
  selectedNode,
  nodeCreationOrder,
  changedNodeIds,
  permissions,
  d3Renderer,
  entityName,
  countChildren,
  saveSnapshot,
  updateD3Renderer,
  savingCount,
  deleteNodesResource
}) {
  
  const showDeleteDialog = ref(false)
  const deleteDialogType = ref('children')
  const nodeToDelete = ref(null)
  const childCount = ref(0)
  
  const showTaskLinkDragDialog = ref(false)
  const taskLinkDragNodeId = ref(null)
  const taskLinkDragResolve = ref(null)

  /**
   * Xóa node được chọn (with validation)
   */
  const deleteSelectedNode = () => {
    if (!selectedNode.value) return

    // Kiểm tra quyền write
    if (!permissions.value.write) {
      const toast = window.$toast || console.error
      toast.error?.("Bạn không có quyền xóa node") || toast("Bạn không có quyền xóa node")
      return
    }

    if (selectedNode.value.id === 'root') {
      return
    }

    const nodeId = selectedNode.value.id
    const node = selectedNode.value

    // Kiểm tra xem node có node con không
    const children = edges.value.filter(e => e.source === nodeId)
    const totalChildren = countChildren(nodeId)

    // Ưu tiên cảnh báo về nhánh con nếu có
    if (children.length > 0) {
      // Có node con: hiển thị popup cảnh báo
      nodeToDelete.value = nodeId
      childCount.value = totalChildren
      deleteDialogType.value = 'children'
      showDeleteDialog.value = true
      return
    }

    // Không có node con: kiểm tra có task link không
    if (node.data?.taskLink?.taskId) {
      // Có task link: hiển thị popup cảnh báo
      nodeToDelete.value = nodeId
      deleteDialogType.value = 'task-link'
      showDeleteDialog.value = true
      return
    }

    // Không có node con và không có task link: xóa trực tiếp
    performDelete(nodeId)
  }

  /**
   * Thực hiện xóa node (cascade)
   */
  const performDelete = async (nodeId) => {
    // Lưu snapshot trước khi xóa
    saveSnapshot()

    const nodesToDelete = new Set([nodeId])

    const collectDescendants = (id) => {
      const childEdges = edges.value.filter(e => e.source === id)

      childEdges.forEach(edge => {
        const childId = edge.target
        nodesToDelete.add(childId)
        collectDescendants(childId)
      })
    }

    collectDescendants(nodeId)

    // Remove nodes and edges
    const newNodes = nodes.value.filter(n => {
      if (n.id === 'root') return true
      if (nodesToDelete.has(n.id)) {
        nodeCreationOrder.value.delete(n.id)
        return false
      }
      return true
    })

    const newEdges = edges.value.filter(e => {
      if (nodesToDelete.has(e.source) || nodesToDelete.has(e.target)) {
        return false
      }
      return true
    })

    elements.value = [...newNodes, ...newEdges]
    selectedNode.value = null

    await call("drive.api.mindmap_comment.delete_comments_by_nodes", {
      mindmap_id: entityName,
      node_ids: Array.from(nodesToDelete)
    })

    // Update D3 renderer after deletion
    updateD3Renderer()

    savingCount.value++
    deleteNodesResource.submit({
      entity_name: entityName,
      node_ids: JSON.stringify(Array.from(nodesToDelete))
    })
  }

  /**
   * Đóng dialog xóa
   */
  const closeDeleteDialog = () => {
    showDeleteDialog.value = false
    deleteDialogType.value = 'children'
    nodeToDelete.value = null
  }

  /**
   * Xác nhận xóa từ dialog
   */
  const confirmDelete = () => {
    if (nodeToDelete.value) {
      performDelete(nodeToDelete.value)
      nodeToDelete.value = null
    }
    deleteDialogType.value = 'children'
    showDeleteDialog.value = false
  }

  /**
   * Hiển thị task link drag warning dialog
   */
  const showTaskLinkDragWarning = (nodeId) => {
    return new Promise((resolve) => {
      taskLinkDragNodeId.value = nodeId
      taskLinkDragResolve.value = resolve
      showTaskLinkDragDialog.value = true
    })
  }

  /**
   * Đóng task link drag dialog
   */
  const closeTaskLinkDragDialog = () => {
    if (taskLinkDragResolve.value) {
      taskLinkDragResolve.value(false)
      taskLinkDragResolve.value = null
    }
    showTaskLinkDragDialog.value = false
    taskLinkDragNodeId.value = null
  }

  /**
   * Xác nhận task link drag
   */
  const confirmTaskLinkDrag = () => {
    if (taskLinkDragResolve.value) {
      taskLinkDragResolve.value(true)
      taskLinkDragResolve.value = null
    }
    showTaskLinkDragDialog.value = false
    taskLinkDragNodeId.value = null
  }

  return {
    // State
    showDeleteDialog,
    deleteDialogType,
    childCount,
    showTaskLinkDragDialog,
    taskLinkDragNodeId,
    
    // Methods
    deleteSelectedNode,
    performDelete,
    closeDeleteDialog,
    confirmDelete,
    showTaskLinkDragWarning,
    closeTaskLinkDragDialog,
    confirmTaskLinkDrag
  }
}

