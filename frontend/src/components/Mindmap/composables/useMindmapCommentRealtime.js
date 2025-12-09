import { onMounted, onUnmounted } from "vue"

export function useMindmapCommentRealtime({
  socket,
  entityName,
  comments
}) {
  function handleRealtimeNewComment(payload) {
    if (!payload) return
    if (payload.mindmap_id !== entityName) return

    const newComment = payload.comment
    if (!newComment || !newComment.node_id) return

    const existed = comments.value.find(c => c.name === newComment.name)
    if (existed) return

    comments.value.push(newComment)
  }

  function handleRealtimeDeleteComments(payload) {
    if (!payload) return
    if (payload.mindmap_id !== entityName) return

    const nodeIds = payload.node_ids
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) return

    comments.value = comments.value.filter(
      c => !nodeIds.includes(c.node_id)
    )
  }

  onMounted(() => {
    if (socket?.on) {
      socket.on("drive_mindmap:new_comment", handleRealtimeNewComment)
      socket.on("drive_mindmap:comments_deleted", handleRealtimeDeleteComments)
    }
  })

  onUnmounted(() => {
    if (socket?.off) {
      socket.off("drive_mindmap:new_comment", handleRealtimeNewComment)
      socket.off("drive_mindmap:comments_deleted", handleRealtimeDeleteComments)
    }
  })
}
