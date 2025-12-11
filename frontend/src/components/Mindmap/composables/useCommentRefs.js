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
      [...imgs].map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = resolve
              img.onerror = resolve
            })
      )
    )
  }

async function scrollToComment(id) {
  const el = commentRefs.value[id]
  const container = document.querySelector(".comment-scroll-container")
  if (!el || !container) return

  // ép browser render
  el.getBoundingClientRect()
  container.getBoundingClientRect()

  // chờ ảnh load
  await waitImagesLoaded(el)

      await nextTick()
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

  // scroll chính xác
  el.scrollIntoView({
    behavior: "smooth",
    block: "center"
  })

  // highlight
  el.classList.add("scroll-target")
  setTimeout(() => el.classList.remove("scroll-target"), 2000)
}

  return { commentRefs, setCommentRef, scrollToComment }
}
