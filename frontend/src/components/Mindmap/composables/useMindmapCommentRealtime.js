import { onMounted, onUnmounted } from "vue"

export function useMindmapCommentRealtime({ socket, entityName, comments }) {
  function handleRealtimeNewComment(payload) {
    if (!payload) return
    if (payload.mindmap_id !== entityName) return

    const newComment = payload.comment
    if (!newComment || !newComment.node_id) return

    const existed = comments.value.find((c) => c.name === newComment.name)
    if (existed) return

    comments.value.push(newComment)
  }

  function handleRealtimeDeleteComments(payload) {
    if (!payload) return
    if (payload.mindmap_id !== entityName) return

    const nodeIds = payload.node_ids
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) return

    comments.value = comments.value.filter((c) => !nodeIds.includes(c.node_id))
  }

  function handleRealtimeDeleteOne(payload) {
    if (!payload) return
    if (payload.mindmap_id !== entityName) return

    const { comment_id } = payload
    if (!comment_id) return

    comments.value = comments.value.filter((c) => c.name !== comment_id)
  }

  function handleRealtimeUpdateComment(payload) {
    if (!payload) return
    if (payload.mindmap_id !== entityName) return

    const updated = payload.comment
    if (!updated?.name) return

    const idx = comments.value.findIndex(c => c.name === updated.name)
    if (idx === -1) return

    
    comments.value[idx] = {
      ...comments.value[idx],
      ...updated
    }
  }


  onMounted(() => {
    if (socket?.on) {
      socket.on("drive_mindmap:new_comment", handleRealtimeNewComment)
      socket.on(
        "drive_mindmap:multiple_comments_deleted",
        handleRealtimeDeleteComments
      )
      socket.on("drive_mindmap:comment_deleted", handleRealtimeDeleteOne)
      socket.on(
      "drive_mindmap:comment_updated",
      handleRealtimeUpdateComment
    )
    }
  })

  onUnmounted(() => {
    if (socket?.off) {
      socket.off("drive_mindmap:new_comment", handleRealtimeNewComment)
      socket.off(
        "drive_mindmap:multiple_comments_deleted",
        handleRealtimeDeleteComments
      )
      socket.off("drive_mindmap:comment_deleted", handleRealtimeDeleteOne)
      socket.off(
      "drive_mindmap:comment_updated",
      handleRealtimeUpdateComment
    )
    }
  })
}
