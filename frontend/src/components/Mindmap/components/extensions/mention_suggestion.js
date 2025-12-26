// extensions/MentionSuggestion.js

function normalizeVN(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
}

export function MentionSuggestion({ getMembers, nodeId }) {
  let activeIndex = 0
  let currentItems = []

  /* ===============================
   * Panel visibility helpers
   * =============================== */
  function expandCommentPanel(nodeId) {
    const panel = document.querySelector(
      `.comment-panel[data-node-comment="${nodeId}"]`
    )
    if (!panel) return

    panel.dataset.__mentionExpanded = "1"
    panel.style.contentVisibility = "visible"
    panel.style.contain = "none"
  }

  function restoreCommentPanel(nodeId) {
    const panel = document.querySelector(
      `.comment-panel[data-node-comment="${nodeId}"]`
    )
    if (!panel) return

    if (panel.dataset.__mentionExpanded === "1") {
      panel.style.contentVisibility = "auto"
      panel.style.containIntrinsicSize = "180px"
      panel.style.contain = ""
      delete panel.dataset.__mentionExpanded
    }
  }

  /* ===============================
   * Keep caret visible in scroll container
   * =============================== */
  function ensureCaretVisible(editor) {
    if (!editor?.view) return
    if (editor.storage.__isInitializing) return

    const view = editor.view
    const { from } = view.state.selection
    const coords = view.coordsAtPos(from)

    const container = view.dom.closest(".comment-scroll-container")
    if (!container) return

    const rect = container.getBoundingClientRect()
    const padding = 40

    if (coords.bottom > rect.bottom - padding) {
      container.scrollTop += coords.bottom - rect.bottom + padding
    } else if (coords.top < rect.top + padding) {
      container.scrollTop -= rect.top - coords.top + padding
    }
  }

  function isCaretInsideRange(editor, range) {
    if (!editor || !range) return false
    const pos = editor.state.selection.from
    return pos >= range.from && pos <= range.to
  }

  return {
    char: "@",
    startOfLine: false,

    items: ({ query }) => {
      const members = getMembers() || []
      if (!query) return members

      const q = normalizeVN(query)

      return members.filter((m) => {
        const name = normalizeVN(m.full_name || "")
        return name.includes(q)
      })
    },

    render: () => {
      let popup = null
      let lastClientRect = null
      let editorInstance = null
      let lastRange = null
      let lastQuery = ""

      function clampIndex() {
        if (!currentItems.length) {
          activeIndex = 0
        } else {
          activeIndex = Math.max(
            0,
            Math.min(activeIndex, currentItems.length - 1)
          )
        }
      }

      function scrollActiveItemIntoView() {
        if (!popup) return
        const activeEl = popup.querySelector('[data-mention-active="1"]')
        if (!activeEl) return

        activeEl.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        })
      }

      function renderPopup() {
        if (!popup || !lastClientRect) return

        const wrapper = document.querySelector(
          `.mention-portal-add[data-node="${nodeId}"]`
        )
        if (!wrapper) return

        const wrapperRect = wrapper.getBoundingClientRect()

        // đo width/height sau khi đã có DOM (fallback nếu chưa)
        const popupWidth = popup.offsetWidth || 180

        const top = lastClientRect.bottom - wrapperRect.top

        let left = lastClientRect.left - wrapperRect.left
        left = Math.max(8, Math.min(left, wrapper.clientWidth - popupWidth - 8))

        popup.style.position = "absolute"
        popup.style.top = `${top}px`
        popup.style.left = `${left}px`

        popup.innerHTML = ""

        // EMPTY STATE
        if (!currentItems.length) {
          const empty = document.createElement("div")
          empty.className = "px-3 py-2 text-sm text-gray-500 italic select-none"
          empty.innerHTML = `
            Không tìm được người dùng
            <span class="font-medium text-gray-700">"${lastQuery}"</span>
          `
          popup.appendChild(empty)
          return
        }

        // ITEMS
        currentItems.forEach((item, index) => {
          const el = document.createElement("div")
          const isActive = index === activeIndex

          el.className =
            "px-3 py-2 cursor-pointer text-sm flex items-center gap-2 " +
            (isActive ? "bg-gray-100" : "hover:bg-gray-100")

          if (isActive) el.dataset.mentionActive = "1"

          el.innerHTML = `
            <img
              src="${item.imageURL || item.user_image || ""}"
              class="w-5 h-5 rounded-full"
            />
            <span>${item.full_name}</span>
          `

          el.onmousedown = (e) => {
            e.preventDefault()
            e.stopPropagation()
            selectItem(item)
          }

          popup.appendChild(el)
        })

        // ✅ CHỈ GỌI 1 LẦN SAU KHI RENDER XONG
        requestAnimationFrame(() => {
          scrollActiveItemIntoView()
        })
      }

      function selectItem(item) {
        if (!item || !editorInstance || !lastRange) return

        editorInstance
          .chain()
          .focus(null, { scrollIntoView: false })
          .deleteRange(lastRange)
          .insertContent({
            type: "mention",
            attrs: {
              id: item.email,
              label: item.full_name,
            },
          })
          .insertContent(" ")
          .run()
      }

      return {
        onStart(props) {
          const editor = props.editor

          // đang mở lại do caret quay về range cũ -> cho phép
          const reopening =
            editor.storage.__mentionOpen &&
            isCaretInsideRange(editor, lastRange)

          // chỉ chặn khi KHÔNG phải reopen
          if (!editor.storage.__mentionUserTriggered && !reopening) {
            return
          }

          // reset trigger sau khi dùng
          editor.storage.__mentionUserTriggered = false

          // =========================
          // ⬇️ PHẦN CŨ GIỮ NGUYÊN
          // =========================
          editorInstance = editor
          lastRange = props.range
          activeIndex = 0
          currentItems = props.items || []
          lastQuery = props.query || ""

          const rect = props.clientRect?.()
          if (rect) lastClientRect = rect

          editor.storage.__mentionOpen = true
          expandCommentPanel(nodeId)

          popup = document.createElement("div")
          popup.className =
            "absolute z-[9999] bg-white rounded shadow-lg border py-1 " +
            "w-[180px] max-h-[200px] overflow-y-auto pointer-events-auto"

          const wrapper = document.querySelector(
            `.mention-portal-add[data-node="${nodeId}"]`
          )
          wrapper?.appendChild(popup)

          clampIndex()
          renderPopup()
        },

        onUpdate(props) {
          currentItems = props.items || []
          lastRange = props.range
          lastQuery = props.query || ""

          const rect = props.clientRect?.()
          if (rect) lastClientRect = rect

          // nếu list thay đổi (query mới) -> reset activeIndex về 0 cho tự nhiên
          if (activeIndex >= currentItems.length) activeIndex = 0

          clampIndex()
          renderPopup()
        },

        onKeyDown(props) {
          const event = props.event

          // không có item: chỉ cho ESC
          if (!currentItems.length) {
            if (event.key === "Escape") {
              event.preventDefault()
              props.exit?.()
              return true
            }
            return false
          }

          if (event.key === "ArrowDown") {
            event.preventDefault()
            activeIndex = (activeIndex + 1) % currentItems.length
            renderPopup()
            ensureCaretVisible(editorInstance)
            return true
          }

          if (event.key === "ArrowUp") {
            event.preventDefault()
            activeIndex =
              (activeIndex - 1 + currentItems.length) % currentItems.length
            renderPopup()
            ensureCaretVisible(editorInstance)
            return true
          }

          if (event.key === "Enter") {
            event.preventDefault()
            selectItem(currentItems[activeIndex])
            props.exit?.()
            return true
          }

          if (event.key === "Escape") {
            event.preventDefault()
            props.exit?.()
            return true
          }

          return false
        },

        onExit() {
          editorInstance?.storage &&
            (editorInstance.storage.__mentionOpen = false)

          restoreCommentPanel(nodeId)

          popup?.remove()
          popup = null
          lastClientRect = null
          editorInstance = null

          // ❗ KHÔNG reset lastRange ở đây
          currentItems = []
          activeIndex = 0
          lastQuery = ""
        },
      }
    },
  }
}
