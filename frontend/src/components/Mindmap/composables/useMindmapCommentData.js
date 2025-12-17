import { computed } from "vue"
import { getTeamMembers } from "../../../resources/team"

function buildGroupKey(nodeId, sessionIndex) {
  return `${nodeId}__${sessionIndex}`
}

export function useMindmapCommentData({ comments, mindmap, activeGroupKey }) {
  /* ---------------- members ---------------- */

  const members = computed(() => getTeamMembers.data || [])

  const memberMap = computed(() => {
    const map = {}
    for (const m of members.value) {
      map[m.email] = m
    }
    return map
  })

  /* ---------------- helpers ---------------- */

  const parseComment = (raw) => {
    try {
      return JSON.parse(raw)
    } catch {
      return { text: raw }
    }
  }

  const stripLabel = (raw) => {
    if (!raw) return ""
    const match = String(raw).match(/<p[^>]*>(.*?)<\/p>/i)
    return match ? match[1] : ""
  }

  /* ---------------- node map ---------------- */

  const nodeMap = computed(() => {
    const map = {}
    for (const n of mindmap.value || []) {
      map[n.id] = n
    }
    return map
  })

  /* ---------------- sort nodes (giữ nguyên logic) ---------------- */

  function sortMindmapNodes(nodes) {
    if (!Array.isArray(nodes)) return []

    const cloned = JSON.parse(JSON.stringify(nodes))
    const map = {}

    cloned.forEach((n) => {
      map[n.id] = { ...n, children: [] }
    })

    cloned.forEach((n) => {
      const parentId = n.data?.parentId
      if (parentId && parentId !== "root" && map[parentId]) {
        map[parentId].children.push(map[n.id])
      }
    })

    const roots = Object.values(map).filter((n) => n.data?.parentId === "root")

    function sortByPos(a, b) {
      const ay = a?.position?.y ?? 0
      const by = b?.position?.y ?? 0
      if (ay !== by) return ay - by
      return (a?.position?.x ?? 0) - (b?.position?.x ?? 0)
    }

    roots.sort(sortByPos)

    const result = []
    function dfs(node) {
      result.push(node)
      node.children.sort(sortByPos)
      node.children.forEach(dfs)
    }

    roots.forEach(dfs)
    return result
  }

  const sortedNodes = computed(() => sortMindmapNodes(mindmap.value || []))

  /* ---- group comments theo node (1 lần duy nhất) ---- */

  const commentsByNode = computed(() => {
    const map = {}
    for (const c of comments.value) {
      if (!map[c.node_id]) map[c.node_id] = []
      map[c.node_id].push(c)
    }
    return map
  })

  const commentsByNodeSession = computed(() => {
    const map = {}

    for (const c of comments.value) {
      const key = `${c.node_id}__${c.session_index}`
      if (!map[key]) {
        map[key] = {
          node_id: c.node_id,
          session_index: c.session_index,
          comments: [],
        }
      }
      map[key].comments.push(c)
    }

    return map
  })

  /* ---------------- mergedComments ---------------- */

  const mergedComments = computed(() => {
    if (!comments.value.length) return []

    return comments.value.map((c) => ({
      ...c,
      session_index: c.session_index ?? null,
      node: nodeMap.value[c.node_id] || null,
      user: memberMap.value[c.owner] || null,
      parsed: parseComment(c.comment),
    }))
  })

  /* ---------------- totalComments ---------------- */

  const totalComments = computed(() => {
    return Object.keys(commentsByNode.value).length
  })

  /* ---------------- mergedGroups ---------------- */
  /* Duyệt theo sortedNodes + commentsByNode */

  const mergedGroups = computed(() => {
    if (!sortedNodes.value.length) return []

    const result = []

    for (const node of sortedNodes.value) {
      const sessions = Object.values(commentsByNodeSession.value)
        .filter((s) => s.node_id === node.id)
        .sort((a, b) => a.session_index - b.session_index)

      for (const s of sessions) {
        result.push({
          node,
          session_index: s.session_index,
          groupKey: buildGroupKey(node.id, s.session_index),
          comments: s.comments.map((c) => ({
            ...c,
            user: memberMap.value[c.owner] || null,
            parsed: parseComment(c.comment),
          })),
        })
      }
    }

    return result
  })

  /* ---------------- mergedGroupsFinal ---------------- */

  const mergedGroupsFinal = computed(() => {
    const out = []

    // active node + session (nếu chưa có thì default 1)
    let activeNodeId = null
    let activeSession = 1
    if (activeGroupKey?.value) {
      const [n, s] = activeGroupKey.value.split("__")
      activeNodeId = n
      activeSession = Number(s || 1)
    }

    for (const node of sortedNodes.value) {
      const sessions = Object.values(commentsByNodeSession.value)
        .filter((s) => s.node_id === node.id)
        .sort((a, b) => (a.session_index ?? 0) - (b.session_index ?? 0))

      // add real groups
      for (const s of sessions) {
        out.push({
          node,
          session_index: s.session_index,
          groupKey: buildGroupKey(node.id, s.session_index),
          comments: s.comments.map((c) => ({
            ...c,
            user: memberMap.value[c.owner] || null,
            parsed: parseComment(c.comment),
          })),
        })
      }

      // ✅ nếu node này đang active mà chưa có session nào -> add group ảo NGAY TẠI ĐÂY
      if (activeNodeId === node.id && sessions.length === 0) {
        out.push({
          node,
          session_index: activeSession,
          groupKey: buildGroupKey(node.id, activeSession),
          comments: [],
          __virtual: true,
        })
      }
    }

    return out
  })

  return {
    members,
    stripLabel,
    sortedNodes,
    mergedComments,
    mergedGroups,
    mergedGroupsFinal,
    totalComments,
    nodeMap,
  }
}
