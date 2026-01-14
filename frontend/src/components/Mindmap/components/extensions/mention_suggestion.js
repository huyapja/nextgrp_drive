function normalize(str = "") {
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
}

function matchName(fullName, query) {
  if (!query) return true

  const nameTokens = normalize(fullName).split(/\s+/)
  const queryTokens = normalize(query).split(/\s+/)

  if (queryTokens.length > nameTokens.length) return false

  for (let i = 0; i < queryTokens.length; i++) {
    if (!nameTokens[i].startsWith(queryTokens[i])) {
      return false
    }
  }

  return true
}

export function MentionSuggestion({ getMembers, nodeId }) {
  let activeIndex = 0
  let currentItems = []

  // =============================
  // Panel expand/restore (NO JUMP)
  // - tránh đụng content-visibility/contain vì sẽ reflow -> jump scroll
  // - dùng overflow-anchor để chặn browser auto "neo" scroll
  // =============================
  function expandCommentPanel(nodeId) {
    const panel = document.querySelector(
      `.comment-panel[data-node-comment="${nodeId}"]`
    )
    if (!panel) return
    if (panel.dataset.__mentionExpanded === "1") return

    panel.dataset.__mentionExpanded = "1"

    // lưu style gốc để restore chuẩn
    panel.dataset.__origContentVisibility = panel.style.contentVisibility || ""
    panel.dataset.__origContain = panel.style.contain || ""
    panel.dataset.__origOverflowAnchor = panel.style.overflowAnchor || ""
    panel.dataset.__origContainIntrinsicSize =
      panel.style.containIntrinsicSize || ""

    // 1) freeze height
    const rect = panel.getBoundingClientRect()
    panel.style.containIntrinsicSize = `${rect.height}px`

    // 2) force render subtree
    panel.style.contentVisibility = "visible"

    // 3) remove containment
    panel.style.contain = "none"

    // 4) disable scroll anchoring
    panel.style.overflowAnchor = "none"
  }

  function restoreCommentPanel(nodeId) {
    const panel = document.querySelector(
      `.comment-panel[data-node-comment="${nodeId}"]`
    )
    if (!panel) return
    if (panel.dataset.__mentionExpanded !== "1") return

    requestAnimationFrame(() => {
      panel.style.contentVisibility =
        panel.dataset.__origContentVisibility || ""
      panel.style.contain = panel.dataset.__origContain || ""
      panel.style.overflowAnchor = panel.dataset.__origOverflowAnchor || ""
      panel.style.containIntrinsicSize =
        panel.dataset.__origContainIntrinsicSize || ""

      delete panel.dataset.__mentionExpanded
      delete panel.dataset.__origContentVisibility
      delete panel.dataset.__origContain
      delete panel.dataset.__origOverflowAnchor
      delete panel.dataset.__origContainIntrinsicSize
    })
  }

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
      const members = getMembers?.() || []
      if (!query) return members

      return members.filter((m) =>
        matchName(m?.full_name || m?.name || "", query)
      )
    },

    render: () => {
      let lastItemsKey = ""
      let popup = null
      let lastClientRect = null
      let editorInstance = null
      let lastRange = null
      let lastQuery = ""
      let scrollContainer = null
      let onScroll = null
      let inputMode = "keyboard"
      let lockMouseUntilMove = false
      const brokenAvatarMap = new Set()

      function buildItemsKey(items) {
        return items.map((m) => m.email || m.id).join("|")
      }

      // exitReason:
      // - "select": Enter chọn mention
      // - "escape": user bấm Escape
      // - "soft": mất match do gõ space/xóa @... => đừng restore panel kiểu gây reflow
      let exitReason = null

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

      function updateActiveItem() {
        if (!popup) return

        popup
          .querySelectorAll("[data-mention-active]")
          .forEach((el) => el.removeAttribute("data-mention-active"))

        const items = popup.children
        const el = items[activeIndex]
        if (!el) return

        el.dataset.mentionActive = "1"
        el.classList.add("bg-gray-100")

        // remove bg của item khác
        for (let i = 0; i < items.length; i++) {
          if (i !== activeIndex) {
            items[i].classList.remove("bg-gray-100")
          }
        }

        scrollActiveItemIntoView()
      }

      function scrollActiveItemIntoView() {
        if (!popup) return
        const activeEl = popup.querySelector('[data-mention-active="1"]')
        if (!activeEl) return

        const offsetTop = activeEl.offsetTop
        const offsetBottom = offsetTop + activeEl.offsetHeight

        if (offsetBottom > popup.scrollTop + popup.clientHeight) {
          popup.scrollTop = offsetBottom - popup.clientHeight
        } else if (offsetTop < popup.scrollTop) {
          popup.scrollTop = offsetTop
        }
      }

      function renderPopup() {
        if (!popup || !lastClientRect) return

        const wrapper = document.querySelector(
          `.mention-portal-add[data-node="${nodeId}"]`
        )
        if (!wrapper) return

        const wrapperRect = wrapper.getBoundingClientRect()
        const popupWidth = popup.offsetWidth || 180

        const top = lastClientRect.bottom - wrapperRect.top
        let left = lastClientRect.left - wrapperRect.left
        left = Math.max(8, Math.min(left, wrapper.clientWidth - popupWidth - 8))

        popup.style.position = "absolute"
        popup.style.top = `${top}px`
        popup.style.left = `${left}px`

        popup.innerHTML = ""

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

        currentItems.forEach((item, index) => {
          const el = document.createElement("div")
          const isActive = index === activeIndex

          el.className =
            "px-3 py-2 cursor-pointer text-sm flex items-center gap-2 " +
            (isActive ? "bg-gray-100" : "")

          if (isActive) el.dataset.mentionActive = "1"

          // el.innerHTML = `
          //   <img
          //     src="${item.imageURL || item.user_image || ""}"
          //     class="w-5 h-5 rounded-full"
          //   />
          //   <span>${item.full_name}</span>
          // `
          const avatar = document.createElement("img")
          avatar.className = "w-5 h-5 rounded-full"
          avatar.loading = "lazy"

          const avatarKey = item.email || item.id
          const avatarSrc = item.imageURL || item.user_image

          if (brokenAvatarMap.has(avatarKey) || !avatarSrc) {
            avatar.src = "/default-avatar.svg" // ✅ icon mặc định
          } else {
            avatar.src = avatarSrc
          }

          avatar.onerror = () => {
            brokenAvatarMap.add(avatarKey)
            avatar.onerror = null
            avatar.src = "/default-avatar.svg"
          }

          const name = document.createElement("span")
          name.textContent = item.full_name

          el.appendChild(avatar)
          el.appendChild(name)

          el.onmouseenter = () => {
            if (lockMouseUntilMove) return
            if (activeIndex === index) return

            inputMode = "mouse"
            activeIndex = index
            updateActiveItem()
          }

          el.onmousedown = (e) => {
            e.preventDefault()
            e.stopPropagation()
            // click chọn => coi như select
            exitReason = "select"
            selectItem(item)
          }

          popup.appendChild(el)
        })

        requestAnimationFrame(scrollActiveItemIntoView)
      }

      function selectItem(item) {
        if (!item || !editorInstance || !lastRange) return

        const container = editorInstance.view?.dom?.closest(
          ".comment-scroll-container"
        )
        const prevScrollTop = container?.scrollTop ?? 0

        // đóng UI trước
        editorInstance.storage.__mentionOpen = false
        scrollContainer?.removeEventListener("scroll", onScroll)
        popup?.remove()
        popup = null

        // ✅ mutate doc trước (không auto scroll)
        editorInstance
          .chain()
          .focus(null, { scrollIntoView: false })
          .deleteRange(lastRange)
          .insertContent({
            type: "mention",
            attrs: { id: item.email, label: item.full_name },
          })
          .insertContent(" ")
          .run()

        // ✅ restore scroll ngay sau mutate
        if (container) container.scrollTop = prevScrollTop

        // ✅ restore panel SAU CÙNG (để không reflow đúng lúc doc thay)
        requestAnimationFrame(() => restoreCommentPanel(nodeId))
      }

      return {
        onStart(props) {
          const editor = props.editor

          const reopening =
            editor.storage.__mentionOpen &&
            isCaretInsideRange(editor, lastRange)

          // case: gõ space đóng, backspace quay lại '@' => mở lại
          const isBackToAt = props.query === "" && props.text?.endsWith("@")

          if (
            !editor.storage.__mentionUserTriggered &&
            !reopening &&
            !isBackToAt
          ) {
            return
          }

          editor.storage.__mentionUserTriggered = false

          editorInstance = editor
          lastRange = props.range
          activeIndex = 0
          currentItems = props.items || []
          lastQuery = props.query || ""

          const rect = props.clientRect?.()
          if (rect) lastClientRect = rect

          editor.storage.__mentionOpen = true
          exitReason = null

          expandCommentPanel(nodeId)

          popup = document.createElement("div")
          popup.className = `
            absolute z-[9999] bg-white rounded shadow-lg border py-1
            w-[180px] max-h-[200px] overflow-y-auto
            overscroll-contain pointer-events-auto
          `

          popup.addEventListener(
            "mousemove",
            () => {
              lockMouseUntilMove = false
            },
            { passive: true }
          )

          popup.addEventListener(
            "wheel",
            (e) => {
              // đừng cho wheel bubble lên scroll cha
              e.stopPropagation()
            },
            { passive: true }
          )

          const wrapper = document.querySelector(
            `.mention-portal-add[data-node="${nodeId}"]`
          )
          wrapper?.appendChild(popup)

          scrollContainer = editor.view.dom.closest(".comment-scroll-container")

          onScroll = () => {
            const rect = props.clientRect?.()
            if (rect) {
              lastClientRect = rect
              renderPopup()
            }
          }

          scrollContainer?.addEventListener("scroll", onScroll, {
            passive: true,
          })

          clampIndex()
          renderPopup()
        },

        onUpdate(props) {
          currentItems = props.items || []
          lastRange = props.range
          lastQuery = props.query || ""

          const newItems = props.items || []
          const newKey = buildItemsKey(newItems)

          lastRange = props.range
          lastQuery = props.query || ""
          const rect = props.clientRect?.()

          if (rect) lastClientRect = rect

          // soft-exit detection: khi mất match '@' (xóa @ hoặc biến @ thành thường)
          // tùy Mention extension, props.text có thể là text quanh cursor
          // nếu không còn '@' cuối nữa thì exitReason = soft để onExit không "giật"
          const stillLooksLikeMention =
            props.text?.includes("@") || props.text?.endsWith("@")
          if (!stillLooksLikeMention) exitReason = "soft"

          if (activeIndex >= currentItems.length) activeIndex = 0
          if (newKey !== lastItemsKey) {
            currentItems = newItems
            lastItemsKey = newKey
            clampIndex()
            renderPopup()
          } else {
            updateActiveItem()
          }
        },

        onKeyDown(props) {
          const event = props.event

          if (!currentItems.length) {
            if (event.key === "Escape") {
              event.preventDefault()
              exitReason = "escape"
              props.exit?.()
              return true
            }
            return false
          }

          if (event.key === "ArrowDown") {
            event.preventDefault()
            inputMode = "keyboard"
            lockMouseUntilMove = true
            activeIndex = (activeIndex + 1) % currentItems.length
            updateActiveItem()
            ensureCaretVisible(editorInstance)
            return true
          }

          if (event.key === "ArrowUp") {
            event.preventDefault()
            inputMode = "keyboard"
            lockMouseUntilMove = true
            activeIndex =
              (activeIndex - 1 + currentItems.length) % currentItems.length
            updateActiveItem()
            ensureCaretVisible(editorInstance)
            return true
          }

          if (event.key === "Enter") {
            event.preventDefault()
            exitReason = "select"
            selectItem(currentItems[activeIndex])

            // rất quan trọng: sau selectItem() mình đã tự đóng popup,
            // gọi exit để plugin cleanup state, nhưng không để nó gây scroll jump
            props.exit?.()
            return true
          }

          if (event.key === "Escape") {
            event.preventDefault()
            exitReason = "escape"
            props.exit?.()
            return true
          }

          return false
        },

        onExit() {
          // 1) trạng thái open
          editorInstance?.storage &&
            (editorInstance.storage.__mentionOpen = false)

          // 2) restore panel:
          // - selectItem đã restore rồi => không làm lại
          // - soft exit (xóa @/space...) cũng không restore kiểu gây layout nhảy
          if (exitReason !== "select" && exitReason !== "soft") {
            restoreCommentPanel(nodeId)
          }

          // 3) cleanup DOM/listeners
          scrollContainer?.removeEventListener("scroll", onScroll)
          scrollContainer = null
          onScroll = null

          popup?.remove()
          popup = null
          lastClientRect = null
          editorInstance = null
          currentItems = []
          activeIndex = 0
          lastQuery = ""
          lastRange = null
          exitReason = null
        },
      }
    },
  }
}
