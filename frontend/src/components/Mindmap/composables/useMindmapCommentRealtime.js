import { onMounted, onUnmounted } from "vue"

export function useMindmapCommentRealtime({
  socket,
  entityName,
  comments,
  activeGroupKey,
  pendingCommentIds, // Optional: Set to track comments being submitted
}) {
  function handleRealtimeNewComment(payload) {
    if (!payload) return
    if (payload.mindmap_id !== entityName) return

    const newComment = payload.comment
    if (!newComment || !newComment.node_id) return

    const commentId = newComment.name
    if (!commentId) return

    // Check if comment is pending (being added from API response)
    if (pendingCommentIds && pendingCommentIds.value && pendingCommentIds.value.has(commentId)) {
      // Comment is being added from API response, skip to prevent duplicate
      return
    }

    // Check if comment already exists (this handles the case where comment
    // was already added from API response when user created it)
    const existed = comments.value.find((c) => c.name === commentId)
    if (existed) {
      // Comment already exists, skip to prevent duplicate
      return
    }

    // Comment doesn't exist and is not pending, add it (this is a comment from another user)
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

    const idx = comments.value.findIndex((c) => c.name === updated.name)
    if (idx === -1) return

    comments.value[idx] = {
      ...comments.value[idx],
      ...updated,
    }
  }

  function handleRealtimeNodeResolved(payload) {
    if (!payload) return
    if (payload.mindmap_id !== entityName) return

    const { node_id, session_index } = payload
    if (!node_id || session_index == null) return

    comments.value = comments.value.filter(
      (c) => !(c.node_id === node_id && c.session_index === session_index)
    )
    if (activeGroupKey.value?.startsWith(`${node_id}__`)) {
      activeGroupKey.value = null
    }
  }

  function handleRealtimeNodeUnresolved(payload) {
    if (!payload) return
    if (payload.mindmap_id !== entityName) return

    const {
      node_id,
      session_index,
      comments: snapshot,
      node_position,
    } = payload

    if (!node_id || session_index == null) return
    if (!Array.isArray(snapshot) || snapshot.length === 0) return

    // 1. restore comments từ snapshot
    snapshot.forEach((snap) => {
      const existed = comments.value.find((c) => c.name === snap.id)
      if (existed) return

      comments.value.push({
        name: snap.id,
        owner: snap.owner,
        creation: snap.created_at,
        modified: snap.modified_at || snap.created_at,
        node_id,
        session_index,
        comment: JSON.stringify({
          safe_html: snap.content,
        }),
      })
    })

    // 2. set active group
    const groupKey = `${node_id}__${session_index}`
    activeGroupKey.value = groupKey

    // 3. emit position cho các layer khác (optional nhưng rất nên)
    window.dispatchEvent(
      new CustomEvent("mindmap:node_unresolved", {
        detail: {
          node_id,
          session_index,
          node_position,
        },
      })
    )
  }

  onMounted(() => {
    if (socket?.on) {
      socket.on("drive_mindmap:new_comment", handleRealtimeNewComment)
      socket.on(
        "drive_mindmap:multiple_comments_deleted",
        handleRealtimeDeleteComments
      )
      socket.on("drive_mindmap:comment_deleted", handleRealtimeDeleteOne)
      socket.on("drive_mindmap:comment_updated", handleRealtimeUpdateComment)
      socket.on("drive_mindmap:node_resolved", handleRealtimeNodeResolved)
      socket.on("drive_mindmap:node_unresolved", handleRealtimeNodeUnresolved)
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
      socket.off("drive_mindmap:comment_updated", handleRealtimeUpdateComment)
      socket.off("drive_mindmap:node_resolved", handleRealtimeNodeResolved)
      socket.off("drive_mindmap:node_unresolved", handleRealtimeNodeUnresolved)
    }
  })
}
