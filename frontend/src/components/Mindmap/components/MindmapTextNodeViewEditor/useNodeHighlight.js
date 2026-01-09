import { TextSelection } from "@tiptap/pm/state"
import { computed, onMounted } from "vue"

export function useNodeHighlight({ editor, node, getPos }) {
  
  function normalizeColor(color) {
    if (!color) return null

    // rgb(...) → hex
    if (color.startsWith("rgb")) {
      const nums = color.match(/\d+/g)
      if (!nums || nums.length < 3) return null
      return (
        "#" +
        nums
          .slice(0, 3)
          .map((n) => Number(n).toString(16).padStart(2, "0"))
          .join("")
      ).toLowerCase()
    }

    // hex → lower
    if (color.startsWith("#")) {
      return color.toLowerCase()
    }

    return color.toLowerCase()
  }

  function getHighlightFromDOM(editor, pos) {
    if (!editor || typeof pos !== "number" || pos < 0) return null

    let rawDom = null
    try {
      rawDom = editor.view.nodeDOM(pos)
    } catch {
      return null
    }

    if (!rawDom) return null

    const el =
      rawDom instanceof Element
        ? rawDom
        : rawDom.nodeType === Node.TEXT_NODE
        ? rawDom.parentElement
        : null

    if (!el || typeof el.querySelector !== "function") return null

    const inlineSpan = el.querySelector("span[data-inline-root] > span")
    if (!inlineSpan) return null

    const bg = window.getComputedStyle(inlineSpan).backgroundColor
    return normalizeColor(bg)
  }

  const currentHighlight = computed(() => {
    const pos = getPos?.()
    if (pos == null) return null

    const state = editor.state
    const $pos = state.doc.resolve(pos)

    for (let d = $pos.depth; d > 0; d--) {
      const node = $pos.node(d)
      if (node.type.name === "listItem") {
        return normalizeColor(node.attrs.highlight)
      }
    }
    return null
  })

  const highlightColors = [
    { value: "pink", label: "Hồng", bg: "#fce7f3", text: "#ec4899" },
    { value: "yellow", label: "Vàng", bg: "#fef3c7", text: "#f59e0b" },
    { value: "purple", label: "Tím", bg: "#f3e8ff", text: "#a855f7" },
    { value: "blue", label: "Xanh dương", bg: "#dbeafe", text: "#3b82f6" },
    { value: "teal", label: "Xanh ngọc", bg: "#ccfbf1", text: "#14b8a6" },
    { value: "green", label: "Xanh lá", bg: "#d1fae5", text: "#10b981" },
    { value: "grey", label: "Xám", bg: "#d1d5db", text: "#374151" },
  ]

  function applyHighlight(color) {
    const rootEl = editor?.view?.nodeDOM?.(getPos?.())
    if (!rootEl) return

    const mmNode = rootEl.closest("p.mm-node")
    if (!mmNode) return

    const li = mmNode.closest("li[data-node-id]")
    if (!li) return

    const inlineRoot = mmNode.querySelector("span[data-inline-root='true']")
    if (!inlineRoot) return

    let innerSpan = inlineRoot.querySelector("span")

    const pos = getPos?.()
    if (pos == null) return

    const currentBg = normalizeColor(getHighlightFromDOM(editor, pos))

    const isSame = currentBg === normalizeColor(color.bg)

    editor
      .chain()
      .command(({ tr, state }) => {
        const $pos = state.doc.resolve(pos)

        for (let d = $pos.depth; d > 0; d--) {
          const node = $pos.node(d)
          if (node.type.name === "listItem") {
            const nodePos = $pos.before(d)
            const next = isSame ? null : color.bg

            tr.setNodeMarkup(nodePos, undefined, {
              ...node.attrs,
              highlight: next,
            })

            tr.setMeta("ui-only", true)
            return true
          }
        }
        return false
      })
      .run()

    if (isSame) {
      if (innerSpan) {
        innerSpan.style.backgroundColor = ""
        if (!innerSpan.getAttribute("style")) {
          innerSpan.replaceWith(...innerSpan.childNodes)
        }
      }

      li.removeAttribute("data-highlight")
    } else {
      if (!innerSpan) {
        innerSpan = document.createElement("span")
        while (inlineRoot.firstChild) {
          innerSpan.appendChild(inlineRoot.firstChild)
        }
        inlineRoot.appendChild(innerSpan)
      }

      innerSpan.style.backgroundColor = color.bg
      li.setAttribute("data-highlight", color.bg)
    }

    editor?.options?.syncFromEditorDebounced?.(editor)
  }

  const highlightBg = computed(() => {
    if (!editor) return null
    if (typeof getPos !== "function") return null

    let pos
    try {
      pos = getPos()
    } catch {
      return null
    }

    if (typeof pos !== "number" || pos < 0) return null

    const { state } = editor
    const nodeAtPos = state.doc.nodeAt(pos)
    if (!nodeAtPos) return null

    const $pos = state.doc.resolve(pos)

    let highlight = null
    for (let d = $pos.depth; d > 0; d--) {
      const node = $pos.node(d)
      if (node.type.name === "listItem") {
        highlight = node.attrs.highlight || null
        break
      }
    }

    let rawDom = null
    try {
      rawDom = editor.view.nodeDOM(pos)
    } catch {
      rawDom = null
    }

    const el =
      rawDom instanceof Element
        ? rawDom
        : rawDom?.nodeType === Node.TEXT_NODE
        ? rawDom.parentElement
        : null

    if (el) {
      const hasInlineBg = el.querySelector("span[style*='background-color']")
      if (hasInlineBg) return null
    }

    return highlight
  })

  onMounted(() => {
    const pos = getPos?.()
    if (pos == null) return

    const domBg = normalizeColor(getHighlightFromDOM(editor, pos))
    if (!domBg) return

    const state = editor.state
    const $pos = state.doc.resolve(pos)

    for (let d = $pos.depth; d > 0; d--) {
      const node = $pos.node(d)
      if (node.type.name === "listItem") {
        if (!node.attrs.highlight) {
          editor
            .chain()
            .command(({ tr }) => {
              tr.setNodeMarkup($pos.before(d), undefined, {
                ...node.attrs,
                highlight: domBg,
              })
              tr.setMeta("ui-only", true)
              return true
            })
            .run()
        }
        break
      }
    }
  })

  return {
    highlightColors,
    currentHighlight,
    highlightBg,
    applyHighlight,
  }
}
