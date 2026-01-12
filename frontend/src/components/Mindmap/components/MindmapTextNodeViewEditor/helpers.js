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
   * 0. RESOLVE HIGHLIGHT
   * ========================= */
  let highlight = el.getAttribute("data-highlight") || null

  /* =========================
   * 1. INLINE PARAGRAPH
   * ========================= */
  const p =
    el.querySelector(":scope > p") || el.querySelector(":scope > div > p")

  if (p) {
    // 🔹 lấy highlight từ inline span (text mode)
    if (!highlight) {
      const spanBg = p.querySelector("span[style*='background-color']")
      if (spanBg) {
        const style = spanBg.getAttribute("style") || ""
        const m = style.match(/background-color\s*:\s*([^;]+)/)
        if (m) highlight = m[1].trim()
      }
    }

    // =========================
    // CLEANUP (GIỮ LOGIC CŨ)
    // =========================
    p.querySelectorAll("ul, li").forEach((e) => e.remove())
    p.querySelectorAll("[data-node-id]").forEach((e) => {
      e.removeAttribute("data-node-id")
      e.removeAttribute("data-has-count")
    })

    p.querySelectorAll("span[style*='background-color']").forEach((span) => {
      span.replaceWith(...span.childNodes)
    })

    // bỏ luôn inline-root
    p.querySelectorAll("span[data-inline-root]").forEach((span) => {
      span.replaceWith(...span.childNodes)
    })

    const contentHTML = p.innerHTML.trim()
    if (contentHTML && contentHTML !== "<br>") {
      if (highlight) {
        inlineHTML = `
<p>
  <span style="background-color: ${highlight}">
    ${contentHTML}
  </span>
</p>
        `
          .replace(/\s*\n\s*/g, "")
          .trim()
      } else {
        inlineHTML = `<p>${contentHTML}</p>`
      }
    }
  }

  /* =========================
   * 2. TASK LINK (GIỮ NGUYÊN)
   * ========================= */
  const taskLink =
    el.querySelector(":scope > a[data-task-link]") ||
    el.querySelector(":scope > div > a[data-task-link]")

  if (taskLink) {
    const href = taskLink.getAttribute("href")
    const contentHTML = taskLink.innerHTML.trim()

    blockHTML += `
<p>
  ${
    contentHTML.includes("<a")
      ? contentHTML
      : `<a href="${href}">${contentHTML}</a>`
  }
</p>
    `.trim()
  }

/* =========================
 * 3. IMAGE (NORMALIZE IMG → image-wrapper)
 * ========================= */

const images = el.querySelectorAll(
  ':scope img[data-node-id="' + el.getAttribute("data-node-id") + '"]'
)

images.forEach((img) => {
  const src = img.getAttribute("src")
  if (!src) return

  const dataSrc =
    img.getAttribute("data-image-src") ||
    src

  const alt = img.getAttribute("alt") || ""

  blockHTML += `
<div class="image-wrapper" data-image-src="${dataSrc}">
  <img
    src="${src}"
    alt="${alt}"
    onerror="this.style.display='none'; console.error('Image failed to load:', this.src);"
  />
</div>
  `.trim()
})


  /* =========================
   * 4. BLOCKQUOTE (GIỮ NGUYÊN)
   * ========================= */
  const blockquote =
    el.querySelector(":scope > blockquote") ||
    el.querySelector(":scope > div > blockquote")

  if (blockquote) {
    blockquote.querySelectorAll("[data-node-id]").forEach((e) => {
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

  container.querySelectorAll("[data-node-id]").forEach((el) => {
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
