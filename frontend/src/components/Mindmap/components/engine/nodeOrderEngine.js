/**
 * Node Order Engine
 * Dùng chung cho:
 * - drag reorder
 * - text mode Enter
 * - insert before / after
 *
 * Không phụ thuộc Vue / d3
 */

/* ===============================
 * Utils
 * =============================== */

export function getOrder(orderStore, id) {
  if (!orderStore) return 0
  if (orderStore instanceof Map) return orderStore.get(id) ?? 0
  return orderStore[id] ?? 0
}

/**
 * Tính order mới dựa trên vị trí drop
 *
 * @param {string[]} sortedSiblingIds - danh sách sibling đã sort
 * @param {Map|Object} orderStore
 * @param {number} dropPosition
 */
export function computeOrderFromPosition(
  sortedSiblingIds,
  orderStore,
  dropPosition
) {
  if (!sortedSiblingIds.length) return 1

  const orders = sortedSiblingIds.map(id => ({
    id,
    order: getOrder(orderStore, id),
  }))

  // insert đầu
  if (dropPosition === 0) {
    return orders[0].order - 1
  }

  // insert cuối
  if (dropPosition >= orders.length) {
    return orders[orders.length - 1].order + 1
  }

  // insert giữa
  const prev = orders[dropPosition - 1].order
  const next = orders[dropPosition].order

  return prev + (next - prev) / 2
}

/**
 * Lấy danh sách sibling ID đã sort theo order
 */
export function getSortedSiblingIds(nodes, parentId, orderStore) {
  return nodes
    .filter(n => n.data.parentId === parentId)
    .sort((a, b) => {
      const oa = getOrder(orderStore, a.id)
      const ob = getOrder(orderStore, b.id)
      return oa - ob
    })
    .map(n => n.id)
}

/* ===============================
 * High level helpers
 * =============================== */

/**
 * Insert node SAU anchor (Enter cuối dòng)
 */
export function computeInsertAfterAnchor({
  nodes,
  anchorNodeId,
  parentId,
  orderStore,
}) {
  const sortedSiblingIds = getSortedSiblingIds(nodes, parentId, orderStore)

  const anchorIndex = sortedSiblingIds.indexOf(anchorNodeId)
  if (anchorIndex === -1) return null

  const dropPosition = anchorIndex + 1

  return computeOrderFromPosition(
    sortedSiblingIds,
    orderStore,
    dropPosition
  )
}

/**
 * Insert node TRƯỚC anchor (Shift + Enter / shortcut khác)
 */
export function computeInsertBeforeAnchor({
  nodes,
  anchorNodeId,
  parentId,
  orderStore,
}) {
  const sortedSiblingIds = getSortedSiblingIds(nodes, parentId, orderStore)

  const anchorIndex = sortedSiblingIds.indexOf(anchorNodeId)
  if (anchorIndex === -1) return null

  const dropPosition = anchorIndex

  return computeOrderFromPosition(
    sortedSiblingIds,
    orderStore,
    dropPosition
  )
}
