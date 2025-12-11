import { nextTick } from "vue"

export function useScrollToActiveNode(groupRefs) {
  // function scrollToActiveNode(nodeId) {
  //   if (!nodeId) return

  //   nextTick(() => {
  //     const el = groupRefs.value?.[nodeId]
  //     const container = document.querySelector(".comment-scroll-container")

  //     if (!el || !container) return

  //     // Tạm bật visibility để tính layout thật
  //     const oldVisibility = el.style.contentVisibility
  //     el.style.contentVisibility = "visible"
  //     void el.offsetHeight

  //     const elRect = el.getBoundingClientRect()
  //     const containerRect = container.getBoundingClientRect()

  //     const target =
  //       elRect.top - containerRect.top + container.scrollTop

  //     container.scrollTo({ top: target })

  //     // Trả lại content-visibility
  //     requestAnimationFrame(() => {
  //       el.style.contentVisibility = oldVisibility || "auto"
  //     })
  //   })
  // }

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
