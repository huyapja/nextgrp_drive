/**
 * Lấy HTML inline an toàn cho heading
 * - Nếu label là <p>...</p> → lấy innerHTML của <p>
 * - Tránh sinh <p> bên trong <h*>
 */

function extractBackgroundColorFromLabel(labelHtml) {
  if (!labelHtml) return null

  const div = document.createElement("div")
  div.innerHTML = labelHtml

  // ưu tiên span có style background-color
  const span = div.querySelector("span[style*='background-color']")
  if (!span) return null

  const bg = span.style.backgroundColor
  return bg || null
}

function ensureParagraphHTML(html) {
  if (!html) return ""

  // đã có tag → giữ nguyên
  if (html.trim().startsWith("<")) return html

  // text thuần → wrap lại
  return `<p>${html}</p>`
}

function extractInlineHTML(html) {
  if (!html) return ""

  const div = document.createElement("div")
  div.innerHTML = html

  // 1. chỉ lấy <p> đầu tiên
  const p = div.querySelector("p")
  if (!p) return ""

  // 2. xoá TOÀN BỘ cấu trúc không-inline
  p.querySelectorAll("ul, li").forEach((el) => el.remove())

  // 3. xoá các data-node-id lạc
  p.querySelectorAll("[data-node-id]").forEach((el) => {
    el.removeAttribute("data-node-id")
    el.removeAttribute("data-has-count")
  })

  // 4. nếu rỗng hoặc chỉ còn <br> thì bỏ
  const content = p.innerHTML.trim()
  if (!content || content === "<br>") return ""

  return content
}

function extractBlockHTML(html) {
  if (!html) return ""

  const div = document.createElement("div")
  div.innerHTML = html

  const blocks = []

  // 1. paragraph (trừ p đầu tiên)
  const ps = Array.from(div.querySelectorAll("p")).slice(1)
  ps.forEach((p) => {
    if (p.closest("blockquote")) return

    const a = p.querySelector("a")

    if (a) {
      blocks.push(
        `
<a data-task-link="true" tabindex="-1" href="${a.getAttribute("href")}">
  ${a.textContent || "Liên kết công việc"}
</a>
      `.trim()
      )
      return
    }

    const content = p.innerHTML.trim()
    if (content && content !== "<br>") {
      blocks.push(`<p>${content}</p>`)
    }
  })

  // 2. IMAGE (normalize cả wrapper + img trần)
  const wrappers = Array.from(div.querySelectorAll(".image-wrapper"))
  const rawImages = Array.from(div.querySelectorAll("img"))

  if (wrappers.length) {
    wrappers.forEach((wrapper) => {
      const img = wrapper.querySelector("img")
      if (!img) return

      blocks.push(
        `
<div class="image-wrapper" data-image-src="${wrapper.dataset.imageSrc || ""}">
  <img src="${img.getAttribute("src")}" alt="${
          img.getAttribute("alt") || ""
        }" />
</div>
      `.trim()
      )
    })
  } else {
    rawImages.forEach((img) => {
      const src = img.getAttribute("src")
      if (!src) return

      blocks.push(
        `
<div class="image-wrapper" data-image-src="${src}">
  <img src="${src}" alt="${img.getAttribute("alt") || ""}" />
</div>
      `.trim()
      )
    })
  }

  // 3. blockquote
  const blockquote = div.querySelector("blockquote")
  if (blockquote) {
    blocks.push(blockquote.outerHTML)
  }

  return blocks.join("\n")
}

/**
 * Build HTML cho editor từ mindmap
 * - Heading chỉ chứa inline HTML
 * - Không sinh DOM không hợp lệ
 */
export function buildTextFromMindmap(nodes, edges) {
  if (!nodes?.length) return ""

  const nodeMap = new Map()
  nodes.forEach((n) => {
    nodeMap.set(n.id, { ...n, children: [] })
  })

  edges.forEach((e) => {
    const parent = nodeMap.get(e.source)
    const child = nodeMap.get(e.target)
    if (parent && child) parent.children.push(child)
  })

  const root = nodeMap.get("root")
  if (!root) return ""

  const html = []

  // render root
  const rootHTML = extractInlineHTML(root.data?.label || "")
  if (rootHTML) {
    html.push(
      `
<h1 data-node-id="root">
  ${rootHTML}
</h1>
`.trim()
    )
  }

  function renderList(nodes) {
    if (!nodes.length) return ""

    return `
<ul>
  ${nodes
    .sort((a, b) => (a.data?.order ?? 0) - (b.data?.order ?? 0))
    .map((node) => {
      const safeLabel = ensureParagraphHTML(node.data?.label || "")

      const inline = extractInlineHTML(safeLabel)
      const block = extractBlockHTML(safeLabel)

      if (!inline && !block) return ""

      const hasCount = Number(node.count) > 0

      const completed = !!node.data?.completed

      const taskLink = node.data?.taskLink
      const taskId = taskLink?.taskId || ""
      const taskMode = taskLink?.mode || ""
      const taskStatus = taskLink?.status || ""
      const highlightBg = extractBackgroundColorFromLabel(node.data.label)

      

      return `
<li
  data-node-id="${node.id}"
  data-completed="${completed}"
  ${highlightBg ? `data-highlight="${highlightBg}"` : ""}
  ${taskId ? `data-task-id="${taskId}"` : ""}
  ${taskMode ? `data-task-mode="${taskMode}"` : ""}
  ${taskStatus ? `data-task-status="${taskStatus}"` : ""}
  ${hasCount ? 'data-has-count="true"' : ""}
>
  ${
    inline
      ? `
  <p>
    <span data-inline-root="true">
      ${inline}
    </span>
  </p>
  `.trim()
      : ""
  }

  ${block || ""}

  ${renderList(node.children)}
</li>
`.trim()
    })
    .join("\n")}
</ul>
`.trim()
  }

  html.push(renderList(root.children))

  return html.join("\n")
}
