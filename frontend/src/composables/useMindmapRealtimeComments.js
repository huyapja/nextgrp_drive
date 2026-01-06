import { nextTick } from 'vue'

/**
 * Mindmap Realtime Comment & Task Handlers
 * Xử lý các sự kiện realtime liên quan đến comments và tasks
 */
export function useMindmapRealtimeComments({
  nodes,
  edges,
  currentView,
  entityName,
  nodeCreationOrder,
  d3Renderer,
  applyStrikethroughToTitle
}) {
  
  /**
   * Handle realtime new comment
   */
  const handleRealtimeNewComment = (newComment) => {
    if (!newComment?.node_id) return
    if (newComment.mindmap_id !== entityName) return

    const node = nodes.value.find(n => n.id === newComment.node_id)
    if (node) {
      node.count = (node.count || 0) + 1
    }
    if (currentView.value === 'text') {
      const li = document.querySelector(
        `li[data-node-id="${newComment.node_id}"]`
      )

      if (li) {
        li.setAttribute("data-has-count", "true")
      }
    }
  }

  /**
   * Handle realtime delete one comment
   */
  const handleRealtimeDeleteOneComment = (payload) => {
    if (!payload?.node_id) return

    const node = nodes.value.find(n => n.id === payload.node_id)
    if (node && node.count > 0) {
      node.count = node.count - 1
    }
    if (node.count === 0) {
      if (currentView.value === 'text') {
        const li = document.querySelector(
          `li[data-node-id="${payload.node_id}"]`
        )

        if (li) {
          li.setAttribute("data-has-count", "false")
        }
      }
    }
  }

  /**
   * Handle realtime resolved comment
   */
  const handleRealtimeResolvedComment = (payload) => {
    if (!payload?.node_id) return

    const node = nodes.value.find(n => n.id === payload.node_id)

    if (currentView.value === 'visual') {
      if (node && node.count > 0) {
        node.count = node.count - payload.count
      }
    }

    if (currentView.value === 'text') {
      if (node && node.count > 0) {
        node.count = node.count - payload.count
      }
      if (node.count === 0) {
        const li = document.querySelector(
          `li[data-node-id="${payload.node_id}"]`
        )

        if (li) {
          li.setAttribute("data-has-count", "false")
        }
      }
    }
  }

  /**
   * Handle realtime unresolved comment
   */
  const handleRealtimeUnresolvedComment = (payload) => {
    if (!payload?.node_id) return
    const node = nodes.value.find(n => n.id === payload.node_id)

    if (node) {
      node.count = node.count + payload.comment_count
    }
    if (currentView.value === 'visual') {
      return
    }

    if (currentView.value === 'text') {
      if (node && node.count > 0) {
        const li = document.querySelector(
          `li[data-node-id="${payload.node_id}"]`
        )
        if (li) {
          li.setAttribute("data-has-count", "true")
        }
      }
    }
  }

  /**
   * Handle realtime task status update
   */
  const handleRealtimeTaskStatusUpdate = (payload) => {
    if (!payload) {
      console.warn('⚠️ handleRealtimeTaskStatusUpdate: payload is empty')
      return
    }

    if (payload.mindmap_id !== entityName) return

    const { node_id, completed, task_status, task_status_vi } = payload

    if (!node_id) return

    const node = nodes.value.find(n => n.id === node_id)
    if (!node) return

    const isTaskCancelled = task_status === "Cancel" || task_status === "Cancelled" || task_status_vi === "Hủy"

    if (isTaskCancelled) {
      if (!node.data) node.data = {}
      if (node.data.taskLink) {
        node.data.taskLink.status = task_status
      }
      return
    }

    if (!node.data) node.data = {}
    const oldCompleted = node.data.completed || false
    node.data.completed = completed || false

    if (node.data.taskLink) {
      node.data.taskLink.status = task_status
    }

    if (oldCompleted !== node.data.completed) {
      nextTick(() => {
        setTimeout(() => {
          const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
          const editorInstance = renderer?.getEditorInstance?.(node_id)
          if (editorInstance) {
            applyStrikethroughToTitle(editorInstance, node.data.completed)
          }
        }, 100)
      })
    }

    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
    if (renderer) {
      renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
      renderer.render()
    }
  }

  return {
    handleRealtimeNewComment,
    handleRealtimeDeleteOneComment,
    handleRealtimeResolvedComment,
    handleRealtimeUnresolvedComment,
    handleRealtimeTaskStatusUpdate
  }
}

