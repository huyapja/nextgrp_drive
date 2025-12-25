import { computed } from "vue"
import { getCommentMembers  } from "../../../resources/team"

function buildGroupKey(nodeId, sessionIndex) {
  return `${nodeId}__${sessionIndex}`
}

export function useMindmapCommentData({ comments, mindmap, activeGroupKey }) {
  /* ---------------- members ---------------- */

  const members = computed(() => getCommentMembers.data || [])

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

    const div = document.createElement("div")
    div.innerHTML = String(raw)

    // ưu tiên p
    const p = div.querySelector("p")
    if (p) return p.textContent?.trim() || ""

    // fallback span
    const span = div.querySelector("span")
    if (span) return span.textContent?.trim() || ""

    // fallback cuối cùng
    return div.textContent?.trim() || ""
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

    const EPS = 1 // cho phép lệch float nhỏ

    const comparePos = (a, b) => {
      const ay = a?.position?.y ?? 0
      const by = b?.position?.y ?? 0
      const dy = ay - by

      // coi như cùng hàng nếu chênh lệch rất nhỏ
      if (Math.abs(dy) < EPS) {
        const ax = a?.position?.x ?? 0
        const bx = b?.position?.x ?? 0
        return ax - bx
      }

      return dy
    }

    // --- build map + children map ---
    const map = {}
    const childrenMap = {}

    for (const n of nodes) {
      map[n.id] = n
      childrenMap[n.id] = []
    }

    for (const n of nodes) {
      const parentId = n.data?.parentId
      if (parentId && childrenMap[parentId]) {
        childrenMap[parentId].push(n.id)
      }
    }

    // --- các nhánh con trực tiếp của root ---
    const rootChildren = nodes
      .filter((n) => n.data?.parentId === "root")
      .slice()
      .sort(comparePos) // sort theo position (y,x)

    const visited = new Set()
    const result = []

    function collectSubtreeIds(rootId) {
      const ids = []
      const stack = [rootId]

      while (stack.length) {
        const id = stack.pop()
        if (!map[id]) continue
        if (ids.includes(id)) continue

        ids.push(id)

        const children = childrenMap[id] || []
        for (const cId of children) {
          stack.push(cId)
        }
      }

      return ids
    }

    // --- duyệt từng nhánh: rootChild -> toàn bộ subtree của nó ---
    for (const rootChild of rootChildren) {
      const ids = collectSubtreeIds(rootChild.id)

      const subtreeNodes = ids
        .map((id) => map[id])
        .filter(Boolean)
        .sort(comparePos) // trong nhánh cũng sort theo (y,x)

      for (const n of subtreeNodes) {
        if (!visited.has(n.id)) {
          visited.add(n.id)
          result.push(n)
        }
      }
    }

    // --- node lẻ, không thuộc nhánh nào (hoặc không có parent hợp lệ) ---
    const leftovers = nodes
      .filter((n) => !visited.has(n.id) && n.id !== "root")
      .slice()
      .sort(comparePos)

    result.push(...leftovers)

    return result
  }

  const sortedNodes = computed(() => sortMindmapNodes(mindmap.value || []))

  /* ---- group comments theo node (1 lần duy nhất) ---- */

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
    return Object.keys(commentsByNodeSession.value).length
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

      // nếu node này đang active mà chưa có session nào -> add group ảo NGAY TẠI ĐÂY
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
