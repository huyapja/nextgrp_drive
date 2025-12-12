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
      [...imgs].map(img => {
        if (img.complete) return Promise.resolve()
        return new Promise(resolve => {
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
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  }

async function scrollToComment(id) {
  const container = document.querySelector(".comment-scroll-container")
  if (!container) return

  // 1️⃣ Đợi ref mount (CHỈ CÓ CÁCH NÀY MỚI CHUẨN)
  let el = commentRefs.value[id]
  let retries = 30                   // 30 × 20ms = 600ms (quá đủ)
  while (!el && retries > 0) {
    await new Promise(r => setTimeout(r, 20))
    el = commentRefs.value[id]
    retries--
  }

  if (!el) {
    console.warn("❌ Comment ref never mounted:", id)
    return
  }

  // 2️⃣ Đợi ảnh load (optional nhưng tốt)
  await waitImagesLoaded(el)

  // 3️⃣ Đợi layout ổn định
  await nextTick()
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

  // 4️⃣ Scroll chính xác
  el.scrollIntoView({ behavior: "smooth", block: "center" })

  // 5️⃣ Highlight
  el.classList.add("highlight-comment")
  setTimeout(() => el.classList.remove("highlight-comment"), 1500)
}


  return { commentRefs, setCommentRef, scrollToComment }
}
