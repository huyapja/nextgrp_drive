export function useScrollToActiveNode(groupRefs) {
  async function scrollToActiveNode(id) {
    let tries = 0

    while (!groupRefs.value[id] && tries < 20) {
      await new Promise((r) => requestAnimationFrame(r))
      tries++
    }

    const el = groupRefs.value[id]
    const container = document.querySelector(".comment-scroll-container")

    if (!el || !container) return

    const rect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    const target = rect.top - containerRect.top + container.scrollTop

    container.scrollTo({ top: target, behavior: "auto" })
  }

  return { scrollToActiveNode }
}
