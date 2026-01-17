import { onMounted, onUnmounted, watch, ref } from "vue"

/**
 * Composable để xử lý realtime events cho Drive File comments
 * @param {Object} options
 * @param {Object} options.socket - Socket instance
 * @param {String|Function} options.entityName - Drive File entity name (can be reactive)
 * @param {Object} options.topics - Topics resource object
 * @param {Function} options.formatDate - Function to format dates
 */
export function useCommentsRealtime({ socket, entityName, topics, formatDate, currentUserId = null, currentUserFullName = null }) {
  const currentEntityName = ref(
    typeof entityName === 'function' ? entityName() : entityName
  )
  
  // Watch for entity name changes
  if (typeof entityName === 'function') {
    watch(entityName, (newName) => {
      currentEntityName.value = newName
    })
  }
  
  // Track recently added comments to prevent duplicates from realtime
  // Map: commentId -> timestamp when added
  const recentlyAddedComments = new Map()
  
  // Clean up old entries every 30 seconds
  setInterval(() => {
    const now = Date.now()
    for (const [commentId, timestamp] of recentlyAddedComments.entries()) {
      if (now - timestamp > 30000) {
        recentlyAddedComments.delete(commentId)
      }
    }
  }, 30000)
  /**
   * Handle new comment from realtime
   */
  function handleRealtimeNewComment(payload) {
    if (!payload) return
    if (payload.entity_name !== currentEntityName.value) return

    const { topic_name, comment } = payload
    if (!topic_name || !comment) return

    if (!topics.data || !topics.data.topics) return

    // Find topic
    const topicIndex = topics.data.topics.findIndex((t) => t.name === topic_name)
    if (topicIndex === -1) return

    const topic = topics.data.topics[topicIndex]
    
    // Check if comment was recently added (from API response) - skip realtime to prevent duplicate
    if (comment.name && recentlyAddedComments.has(comment.name)) {
      return
    }
    
    // Check if comment already exists - check by name first, then by content + email + recent creation
    const existingComment = topic.comments?.find((c) => {
      // Check by name if available (most reliable)
      if (comment.name && c.name && c.name === comment.name) return true
      
      // Check by content + email + creation time (within last 10 seconds) to catch duplicates
      // duplicates when name might not match yet (e.g., when topic is just created)
      if (
        c.comment_email === comment.comment_email &&
        c.content === comment.content &&
        c.creation &&
        comment.creation
      ) {
        try {
          const commentTime = new Date(comment.creation).getTime()
          const existingTime = new Date(c.creation).getTime()
          const timeDiff = Math.abs(commentTime - existingTime)
          // If comments are within 10 seconds and have same content/email, consider duplicate
          if (timeDiff < 10000) return true
        } catch (e) {
          // If date parsing fails, fall back to content + email check only
          // This is less reliable but better than nothing
        }
      }
      return false
    })
    
    // If comment already exists, skip to prevent duplicate
    if (existingComment) {
      return
    }
    
    // Additional check: if this is a comment from current user, be extra careful
    // Skip if topic was just created (within last 5 seconds) and comment matches first comment
    if (currentUserId && comment.comment_email === currentUserId) {
      const topicCreationTime = topic.creation ? new Date(topic.creation).getTime() : null
      const commentCreationTime = comment.creation ? new Date(comment.creation).getTime() : null
      
      if (topicCreationTime && commentCreationTime) {
        const timeDiff = Math.abs(commentCreationTime - topicCreationTime)
        // If comment was created within 5 seconds of topic creation, it's likely the first comment
        // Check if topic already has this comment
        if (timeDiff < 5000) {
          const hasMatchingComment = topic.comments?.some((c) => {
            if (c.comment_email === comment.comment_email && c.content === comment.content) {
              return true
            }
            return false
          })
          if (hasMatchingComment) {
            return
          }
        }
      }
    }

    // Format creation date
    const formattedComment = {
      ...comment,
      creation: formatDate(comment.creation),
      reactions: [],
      reaction_users: {},
    }

    // Add comment to topic
    const updatedTopics = [...topics.data.topics]
    updatedTopics[topicIndex] = {
      ...updatedTopics[topicIndex],
      comments: [...(updatedTopics[topicIndex].comments || []), formattedComment],
    }

    topics.setData({
      ...topics.data,
      topics: updatedTopics,
    })
  }

  /**
   * Handle comment updated from realtime
   */
  function handleRealtimeCommentUpdated(payload) {
    if (!payload) return
    if (payload.entity_name !== currentEntityName.value) return

    const { topic_name, comment } = payload
    if (!topic_name || !comment) return

    if (!topics.data || !topics.data.topics) return

    // Find topic
    const topicIndex = topics.data.topics.findIndex((t) => t.name === topic_name)
    if (topicIndex === -1) return

    // Find comment
    const topic = topics.data.topics[topicIndex]
    const commentIndex = topic.comments?.findIndex((c) => c.name === comment.name)
    if (commentIndex === -1) return

    // Update comment
    const updatedTopics = [...topics.data.topics]
    const updatedComments = [...updatedTopics[topicIndex].comments]
    updatedComments[commentIndex] = {
      ...updatedComments[commentIndex],
      content: comment.content,
      is_edited: true,
      modified: comment.modified || new Date().toISOString(),
    }

    updatedTopics[topicIndex] = {
      ...updatedTopics[topicIndex],
      comments: updatedComments,
    }

    topics.setData({
      ...topics.data,
      topics: updatedTopics,
    })
  }

  /**
   * Handle comment deleted from realtime
   */
  function handleRealtimeCommentDeleted(payload) {
    if (!payload) return
    if (payload.entity_name !== currentEntityName.value) return

    const { topic_name, comment_id, topic_deleted } = payload
    if (!topic_name || !comment_id) return

    if (!topics.data || !topics.data.topics) return

    if (topic_deleted) {
      // Remove entire topic
      const updatedTopics = topics.data.topics.filter(
        (t) => t.name !== topic_name
      )
      topics.setData({
        ...topics.data,
        topics: updatedTopics,
      })
    } else {
      // Remove comment from topic
      const topicIndex = topics.data.topics.findIndex((t) => t.name === topic_name)
      if (topicIndex === -1) return

      const updatedTopics = [...topics.data.topics]
      updatedTopics[topicIndex] = {
        ...updatedTopics[topicIndex],
        comments: updatedTopics[topicIndex].comments.filter(
          (c) => c.name !== comment_id
        ),
      }

      topics.setData({
        ...topics.data,
        topics: updatedTopics,
      })
    }
  }

  /**
   * Handle comment reaction updated from realtime
   */
  function handleRealtimeReactionUpdated(payload) {
    if (!payload) return
    if (payload.entity_name !== currentEntityName.value) return

    const { topic_name, comment_id, emoji, reacted, reaction_counts, reaction_users } = payload
    if (!topic_name || !comment_id || !emoji) return

    if (!topics.data || !topics.data.topics) return

    // Find topic
    const topicIndex = topics.data.topics.findIndex((t) => t.name === topic_name)
    if (topicIndex === -1) return

    // Find comment
    const topic = topics.data.topics[topicIndex]
    const commentIndex = topic.comments?.findIndex((c) => c.name === comment_id)
    if (commentIndex === -1) return

    // Update reactions
    const updatedTopics = [...topics.data.topics]
    const updatedComments = [...updatedTopics[topicIndex].comments]
    const updatedComment = { ...updatedComments[commentIndex] }

    // Initialize reactions array if not exists
    if (!updatedComment.reactions) {
      updatedComment.reactions = []
    }
    if (!updatedComment.reaction_users) {
      updatedComment.reaction_users = {}
    }

    // Update reaction_users from payload
    if (reaction_users) {
      updatedComment.reaction_users = { ...updatedComment.reaction_users, ...reaction_users }
    }

    // Update reactions array from reaction_counts
    // reaction_counts contains ALL reactions, so rebuild the entire array
    if (reaction_counts && Object.keys(reaction_counts).length > 0) {
      // Rebuild reactions array from reaction_counts (source of truth)
      updatedComment.reactions = []
      for (const [emojiKey, count] of Object.entries(reaction_counts)) {
        if (count > 0) {
          // Check if current user reacted by checking if their full name is in the list
          const userReacted = currentUserFullName && reaction_users?.[emojiKey]?.includes(
            currentUserFullName
          ) || (payload.user === currentUserId && emojiKey === emoji)
          updatedComment.reactions.push({
            emoji: emojiKey,
            count,
            reacted: userReacted || false,
          })
        }
      }
    } else {
      // Fallback: update existing reaction or add new one
      const existingReactionIndex = updatedComment.reactions.findIndex(
        (r) => r.emoji === emoji
      )

      if (existingReactionIndex !== -1) {
        const existingReaction = updatedComment.reactions[existingReactionIndex]
        if (reacted) {
          existingReaction.count = (existingReaction.count || 0) + 1
          existingReaction.reacted = currentUserId === payload.user
        } else {
          existingReaction.count = Math.max(0, (existingReaction.count || 1) - 1)
          if (currentUserId === payload.user) {
            existingReaction.reacted = false
          }
        }

        // Remove if count is 0
        if (existingReaction.count === 0) {
          updatedComment.reactions.splice(existingReactionIndex, 1)
        }
      } else if (reacted) {
        // Add new reaction
        updatedComment.reactions.push({
          emoji,
          count: 1,
          reacted: currentUserId === payload.user,
        })
      }
    }

    updatedComments[commentIndex] = updatedComment
    updatedTopics[topicIndex] = {
      ...updatedTopics[topicIndex],
      comments: updatedComments,
    }

    topics.setData({
      ...topics.data,
      topics: updatedTopics,
    })
  }

  /**
   * Handle new topic from realtime
   */
  function handleRealtimeNewTopic(payload) {
    if (!payload) return
    if (payload.entity_name !== currentEntityName.value) return

    const { topic } = payload
    if (!topic) return

    if (!topics.data || !topics.data.topics) return

    // Check if topic already exists
    const existingTopic = topics.data.topics.find((t) => t.name === topic.name)
    if (existingTopic) return

    // Format comment dates
    if (topic.comments && Array.isArray(topic.comments)) {
      topic.comments.forEach((comment) => {
        comment.creation = formatDate(comment.creation)
      })
    }

    // Add topic
    topics.setData({
      ...topics.data,
      topics: [...topics.data.topics, topic],
      total_count: (topics.data.total_count || topics.data.topics.length) + 1,
    })
  }

  // Register socket listeners
  onMounted(() => {
    if (socket?.on) {
      socket.on("drive_file:new_comment", handleRealtimeNewComment)
      socket.on("drive_file:comment_updated", handleRealtimeCommentUpdated)
      socket.on("drive_file:comment_deleted", handleRealtimeCommentDeleted)
      socket.on("drive_file:new_topic", handleRealtimeNewTopic)
      socket.on("drive_file:comment_reaction_updated", handleRealtimeReactionUpdated)
    }
  })

  // Cleanup socket listeners
  onUnmounted(() => {
    if (socket?.off) {
      socket.off("drive_file:new_comment", handleRealtimeNewComment)
      socket.off("drive_file:comment_updated", handleRealtimeCommentUpdated)
      socket.off("drive_file:comment_deleted", handleRealtimeCommentDeleted)
      socket.off("drive_file:new_topic", handleRealtimeNewTopic)
      socket.off("drive_file:comment_reaction_updated", handleRealtimeReactionUpdated)
    }
  })

  /**
   * Track a comment as recently added to prevent duplicate from realtime
   * Should be called when adding comment from API response
   */
  function trackComment(commentId) {
    if (commentId) {
      recentlyAddedComments.set(commentId, Date.now())
    }
  }

  return {
    handleRealtimeNewComment,
    handleRealtimeCommentUpdated,
    handleRealtimeCommentDeleted,
    handleRealtimeNewTopic,
    handleRealtimeReactionUpdated,
    trackComment,
  }
}

