import { computed } from "vue"
import { getTeamMembers } from "../../../resources/team"

export function useMindmapCommentData({
  comments,
  mindmap,
  activeNodeId
}) {

  const members = computed(() => getTeamMembers.data || [])

  const memberMap = computed(() => {
    const map = {}
    for (const m of members.value) {
      map[m.email] = m
    }
    return map
  })
  // -----------------------------
  const parseComment = raw => {
    try {
      return JSON.parse(raw)
    } catch {
      return { text: raw }
    }
  }

  const nodeMap = computed(() => {
  const map = {}
  for (const n of mindmap.value || []) {
      map[n.id] = n
    }
    return map
  })
  // -----------------------------
  const stripLabel = raw => {
    if (!raw) return ""
    return String(raw).replace(/^<p>/, "").replace(/<\/p>$/, "")
  }

  // -----------------------------
  function sortMindmapNodes(nodes) {
    if (!Array.isArray(nodes)) return []

    const cloned = JSON.parse(JSON.stringify(nodes))

    const map = {}
    cloned.forEach(n => {
      map[n.id] = { ...n, children: [] }
    })

    cloned.forEach(n => {
      const parentId = n.data?.parentId
      if (parentId && parentId !== "root" && map[parentId]) {
        map[parentId].children.push(map[n.id])
      }
    })

    const roots = Object.values(map).filter(
      n => n.data?.parentId === "root"
    )

    function sortByPos(a, b) {
      const ay = a?.position?.y ?? 0
      const by = b?.position?.y ?? 0
      if (ay !== by) return ay - by

      const ax = a?.position?.x ?? 0
      const bx = b?.position?.x ?? 0
      return ax - bx
    }

    roots.sort(sortByPos)

    const result = []

    function dfs(node) {
      result.push(node)
      node.children.sort(sortByPos)
      node.children.forEach(child => dfs(child))
    }

    roots.forEach(root => dfs(root))

    return result
  }

  const sortedNodes = computed(() => {
    return sortMindmapNodes(mindmap.value || [])
  })

  // -----------------------------
  const mergedComments = computed(() => {
    if (!comments.value.length) return []
    if (!sortedNodes.value.length) return []

    return comments.value.map(c => ({
      ...c,
      node: nodeMap.value[c.node_id] || null,
      user: memberMap.value[c.owner] || null,
      parsed: parseComment(c.comment)
    }))
  })

  // -----------------------------
  const totalComments = computed(() => {
    const seen = new Set()
    mergedComments.value.forEach(c => {
      if (c.node_id) seen.add(c.node_id)
    })
    return seen.size
  })

  // -----------------------------
  const mergedGroups = computed(() => {
    if (!sortedNodes.value.length || !comments.value.length) return []

    const groupMap = {}

    for (const c of comments.value) {
      if (!groupMap[c.node_id]) {
        const node = nodeMap.value[c.node_id]
        if (!node) continue

        groupMap[c.node_id] = {
          node,
          comments: []
        }
      }

      groupMap[c.node_id].comments.push({
        ...c,
        user: memberMap.value[c.owner] || null,
        parsed: parseComment(c.comment)
      })
    }

    return sortedNodes.value
      .filter(n => groupMap[n.id])
      .map(n => groupMap[n.id])
  })

  // -----------------------------
  const mergedGroupsFinal = computed(() => {
    if (!sortedNodes.value.length) return []

    const map = {}

    for (const g of mergedGroups.value) {
      map[g.node.id] = g
    }

    if (activeNodeId.value && !map[activeNodeId.value]) {
      const node = nodeMap.value[activeNodeId.value]
      if (node) {
        map[activeNodeId.value] = {
          node,
          comments: []
        }
      }
    }

    return sortedNodes.value
      .filter(n => map[n.id])
      .map(n => map[n.id])
  })

  return {
    stripLabel,
    sortedNodes,
    mergedComments,
    mergedGroups,
    mergedGroupsFinal,
    totalComments,
    nodeMap  
  }
}
