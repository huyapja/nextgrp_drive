import { ref, nextTick } from "vue"

export function useCommentRefs() {
  const commentRefs = ref({})

  function setCommentRef(id, el) {
    if (el) commentRefs.value[id] = el
    else delete commentRefs.value[id]
  }

  function waitImagesLoaded(el) {
    const imgs = el.querySelectorAll("img")
    if (!imgs.length) return Promise.resolve()

    return Promise.all(
      [...imgs].map((img) => {
        if (img.complete) return Promise.resolve()
        return new Promise((resolve) => {
          img.onload = resolve
          img.onerror = resolve
        })
      })
    )
  }

  async function waitStableDOM(el) {
    // ép layout trước
    el.getBoundingClientRect()

    // đợi ảnh load
    await waitImagesLoaded(el)

    // đợi vue render xong
    await nextTick()

    // đợi browser ổn định layout
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    )
  }

  async function scrollToComment(id) {
    const container = document.querySelector(".comment-scroll-container")
    if (!container) return false

    let el = null
    let retries = 30

    while (retries-- > 0) {
      el = commentRefs.value[id]
      if (el) break
      await nextTick()
    }

    if (!el) return false

    await waitImagesLoaded(el)

    await nextTick()
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    )

    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    const offset =
      elRect.top -
      containerRect.top -
      container.clientHeight / 2 +
      elRect.height / 2

    container.scrollBy({
      top: offset,
      behavior: "smooth",
    })

    el.classList.add("highlight-comment")
    setTimeout(() => el.classList.remove("highlight-comment"), 1500)

    return true
  }

  return { commentRefs, setCommentRef, scrollToComment }
}
