import { ref, onBeforeUnmount, computed, onMounted } from "vue"
import { call } from "frappe-ui"

const getCookie = (name) => {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop().split(";").shift()
  return null
}

const userIdFromCookie = computed(() =>
  decodeURIComponent(getCookie("user_id") || "")
)

export function useMindmapCommentReactions({ socket }) {
  const reactions = ref({})

  const pending = ref(new Set())

  function makeKey(commentId, emoji) {
    return `${commentId}::${emoji}`
  }

  /* ===============================
   * BULK LOAD
   * =============================== */
  async function fetchReactions(commentIds = []) {
    if (!commentIds.length) return

    const res = await call("drive.api.mindmap_comment.get_reaction_list_bulk", {
      comment_ids: commentIds,
    })

    const normalized = {}

    for (const [commentId, commentData] of Object.entries(res || {})) {
      normalized[commentId] = {}

      for (const [emoji, data] of Object.entries(commentData)) {
        const usersMap = new Map()

        for (const u of data.users || []) {
          usersMap.set(u.user, u)
        }

        normalized[commentId][emoji] = {
          users: usersMap,
          count: usersMap.size,
        }
      }
    }

    reactions.value = normalized
  }

  /* ===============================
   * APPLY STATE (SOURCE OF TRUTH)
   * =============================== */
  function applyReactionState(payload) {
    const { comment_id, emoji, user, full_name, avatar, email, reacted } =
      payload

    // 1️⃣ Đảm bảo bucket theo comment
    if (!reactions.value[comment_id]) {
      reactions.value[comment_id] = {}
    }

    const commentBucket = reactions.value[comment_id]

    // 2️⃣ Lấy emoji bucket hoặc tạo mới
    let emojiBucket = commentBucket[emoji]

    if (!emojiBucket) {
      emojiBucket = {
        users: new Map(),
        count: 0,
      }
    }

    // 3️⃣ Đảm bảo users luôn là Map (an toàn khi data từ API là Array)
    if (!(emojiBucket.users instanceof Map)) {
      const map = new Map()
      for (const u of emojiBucket.users || []) {
        map.set(u.user, u)
      }
      emojiBucket.users = map
    }

    // 4️⃣ Apply reaction
    if (reacted) {
      emojiBucket.users.set(user, {
        user,
        full_name,
        avatar,
        email,
      })
    } else {
      emojiBucket.users.delete(user)
    }

    // 5️⃣ Update count
    emojiBucket.count = emojiBucket.users.size

    // 6️⃣ Gắn hoặc xoá emoji bucket
    if (emojiBucket.count > 0) {
      commentBucket[emoji] = emojiBucket
    } else {
      delete commentBucket[emoji]
    }
  }

  /* ===============================
   * TOGGLE (API ONLY + LOCK)
   * =============================== */
  async function toggleReaction(commentId, emoji) {
    if (!commentId || !emoji) return

    const key = makeKey(commentId, emoji)

    // 👉 CHỐT CHẶN DOUBLE CLICK / DOUBLE EVENT
    if (pending.value.has(key)) {
      return
    }

    pending.value.add(key)

    try {
      await call("drive.api.mindmap_comment.toggle_reaction", {
        comment_id: commentId,
        emoji,
      })
      // UI sẽ update bằng realtime
    } finally {
      pending.value.delete(key)
    }
  }

  /* ===============================
   * SOCKET (REALTIME ONLY)
   * =============================== */
  function onSocketEvent(payload) {
    applyReactionState(payload)
  }

  onMounted(() => {
    socket.on("drive_mindmap:comment_reaction_updated", onSocketEvent)
  })
  onBeforeUnmount(() => {
    socket.off("drive_mindmap:comment_reaction_updated", onSocketEvent)
  })

  /* ===============================
   * HELPERS FOR UI
   * =============================== */
  function getReactions(commentId) {
    const map = reactions.value?.[commentId]
    if (!map) return []

    return Object.entries(map).map(([emoji, data]) => ({
      emoji,
      count: data.count,
      users: Array.from(data.users?.values?.() || []),
    }))
  }

  function hasUserReacted(commentId, emoji) {
    const currentUser = userIdFromCookie.value
    return (
      reactions.value?.[commentId]?.[emoji]?.users?.has(currentUser) || false
    )
  }

  function isPending(commentId, emoji) {
    return pending.value.has(makeKey(commentId, emoji))
  }

  function reactionTooltip(r, emoji) {
    if (!r?.users?.length) return ""

    const currentUser = userIdFromCookie.value
    const you = []
    const others = []

    for (const u of r.users) {
      if (u.user === currentUser) {
        you.push("Bạn")
      } else {
        others.push(u.full_name || u.user)
      }
    }

    const names = [...you, ...others]
    return `${joinNamesVi(names)} đã thả cảm xúc ${emoji}`
  }

  function joinNamesVi(names) {
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} và ${names[1]}`
    return `${names.slice(0, -1).join(", ")} và ${names[names.length - 1]}`
  }

  return {
    reactions,
    fetchReactions,
    toggleReaction,
    getReactions,
    hasUserReacted,
    isPending,
    reactionTooltip,
  }
}
