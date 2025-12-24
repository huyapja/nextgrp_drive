
/**
 * Lấy HTML inline an toàn cho heading
 * - Nếu label là <p>...</p> → lấy innerHTML của <p>
 * - Tránh sinh <p> bên trong <h*>
 */
function extractInlineHTML(html) {
  if (!html) return ""

  const div = document.createElement("div")
  div.innerHTML = html

  // nếu là <p>...</p> → đổi sang <span>
  const p = div.querySelector("p")
  if (p) {
    const span = document.createElement("span")
    span.innerHTML = p.innerHTML
    return span.outerHTML
  }

  return div.innerHTML.trim()
}

/**
 * Build HTML cho editor từ mindmap
 * - Heading chỉ chứa inline HTML
 * - Không sinh DOM không hợp lệ
 */
export function buildTextFromMindmap(nodes, edges) {
  if (!nodes?.length) return ""

  // map nodeId → node + children
  const nodeMap = new Map()
  nodes.forEach((n) => {
    nodeMap.set(n.id, { ...n, children: [] })
  })

  // build tree từ edges
  edges.forEach((e) => {
    const parent = nodeMap.get(e.source)
    const child = nodeMap.get(e.target)
    if (parent && child) {
      parent.children.push(child)
    }
  })

  const root = nodeMap.get("root")
  if (!root) return ""

  const html = []

  /**
   * Render 1 heading / paragraph
   */
  function renderNode(node, tag) {
    const inlineHTML = extractInlineHTML(node.data?.label || "")
    if (!inlineHTML) return

    html.push(`
<${tag}
  data-node-id="${node.id}"
  data-has-count="${node.id !== "root"}"
>
  ${inlineHTML}
</${tag}>
`.trim())
  }

  /**
   * DFS render tree
   */
  function walk(node, level) {
    if (node.id === "root") {
      // root: h1, không strip span
      const inlineHTML = extractInlineHTML(node.data?.label || "")
      if (inlineHTML) {
        html.push(`
<h1 data-node-id="root" class="mb-0">
  ${inlineHTML}
</h1>
`.trim())
      }
    } else if (level === 1) {
      renderNode(node, "h2")
    } else if (level === 2) {
      renderNode(node, "h3")
    } else {
      // level sâu hơn → paragraph
      renderNode(node, "p")
    }

    node.children
      .sort((a, b) => (a.data?.order ?? 0) - (b.data?.order ?? 0))
      .forEach((child) => walk(child, level + 1))
  }

  walk(root, 0)

  return html.join("\n")
}
