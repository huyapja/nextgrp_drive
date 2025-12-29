// helpers.js

export function hasMmNode(html) {
  if (!html) return false
  const div = document.createElement("div")
  div.innerHTML = html
  return !!div.querySelector(".mm-node, [data-node-id]")
}

function extractParagraphAndBlock(el) {
  let inlineHTML = ""
  let blockHTML = ""

  /* =========================
   * 1. INLINE PARAGRAPH
   * ========================= */
  const p =
    el.querySelector(":scope > p") ||
    el.querySelector(":scope > div > p")

  if (p) {
    p.querySelectorAll("ul, li").forEach(e => e.remove())
    p.querySelectorAll("[data-node-id]").forEach(e => {
      e.removeAttribute("data-node-id")
      e.removeAttribute("data-has-count")
    })

    const content = p.innerHTML.trim()
    if (content && content !== "<br>") {
      inlineHTML = `<p>${content}</p>`
    }
  }

  /* =========================
   * 2. TASK LINK
   * ========================= */
  const taskLink =
    el.querySelector(":scope > a[data-task-link]") ||
    el.querySelector(":scope > div > a[data-task-link]")

  if (taskLink) {
    const href = taskLink.getAttribute("href")
    const contentHTML = taskLink.innerHTML.trim()

    blockHTML += `
<p>
  ${contentHTML.includes("<a")
        ? contentHTML
        : `<a href="${href}">${contentHTML}</a>`}
</p>
    `.trim()
  }

  /* =========================
   * 3. IMAGE → image-wrapper
   * ========================= */
  const images = el.querySelectorAll(":scope img")

  images.forEach(img => {
    const src = img.getAttribute("src")
    if (!src) return

    const dataSrc = img.getAttribute("data-image-src") || src
    const alt = img.getAttribute("alt") || ""

    blockHTML += `
<div class="image-wrapper" data-image-src="${dataSrc}">
  <img src="${src}" alt="${alt}" />
</div>
    `.trim()
  })

  /* =========================
   * 4. BLOCKQUOTE
   * ========================= */
  const blockquote =
    el.querySelector(":scope > blockquote") ||
    el.querySelector(":scope > div > blockquote")

  if (blockquote) {
    blockquote.querySelectorAll("[data-node-id]").forEach(e => {
      e.removeAttribute("data-node-id")
      e.removeAttribute("data-has-count")
    })

    blockHTML += blockquote.outerHTML
  }

  return (inlineHTML + blockHTML).trim()
}

// function này trích edits từ HTML của editor rồi gửi lên với payload nodes
export function extractNodeEditsFromHTML(html) {
  const container = document.createElement("div")
  container.innerHTML = html

  const edits = []

  container.querySelectorAll("[data-node-id]").forEach(el => {
    const nodeId = el.getAttribute("data-node-id")
    if (!nodeId) return

    let labelHTML = ""

    // heading
    if (/^H[1-6]$/.test(el.tagName)) {
      const content = el.innerHTML.trim()
      if (!content || content === "<br>") return

      labelHTML = `<p>${content}</p>`
    }

    // list item / paragraph
    else {
      labelHTML = extractParagraphAndBlock(el)
      if (!labelHTML) return
    }

    edits.push({
      nodeId,
      label: labelHTML,
    })
  })

  return edits
}
