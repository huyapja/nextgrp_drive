export function useScrollToActiveNode(groupRefs) {
  async function scrollToActiveNode(id) {
    let tries = 0

    while (!groupRefs.value[id] && tries < 60) {
      await new Promise(r => requestAnimationFrame(r))
      tries++
    }

    const el = groupRefs.value[id]
    const container = document.querySelector(".comment-scroll-container")
    if (!el || !container) return

    // đảm bảo layout thật
    await new Promise(r => requestAnimationFrame(r))
    await new Promise(r => requestAnimationFrame(r))

    // xử lý content-visibility
    const oldVisibility = el.style.contentVisibility
    el.style.contentVisibility = "visible"
    el.offsetHeight

    const rect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    const target =
      rect.top - containerRect.top + container.scrollTop

    const maxScroll =
      container.scrollHeight - container.clientHeight

    container.scrollTop = Math.max(
      0,
      Math.min(target, maxScroll)
    )

    // restore
    if (oldVisibility) {
      el.style.contentVisibility = oldVisibility
    }
  }

  return { scrollToActiveNode }
}
