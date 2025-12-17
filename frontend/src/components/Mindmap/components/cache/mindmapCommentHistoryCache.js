// cache sống toàn app lifecycle
const historyCache = new Map()

export function getHistoryFromCache(mindmapId) {
  return historyCache.get(mindmapId)
}

export function setHistoryToCache(mindmapId, items) {
  historyCache.set(mindmapId, items)
}

export function clearHistoryCache(mindmapId) {
  historyCache.delete(mindmapId)
}
