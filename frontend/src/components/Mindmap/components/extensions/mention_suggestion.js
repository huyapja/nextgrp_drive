// extensions/MentionSuggestion.js
export function MentionSuggestion({ getMembers, nodeId }) {
  return {
    char: "@",
    startOfLine: false,

    items: ({ query }) => {
      const members = getMembers() || []

      if (!query) return members

      return members.filter((m) =>
        m.full_name.toLowerCase().includes(query.toLowerCase())
      )
    },

    render: () => {
      let component
      let popup

      return {
        onStart(props) {
          props.editor.storage.__mentionOpen = true
          // 1. Bật contentVisibility cho đúng panel
          const panel = document.querySelector(
            `.comment-panel[data-node-comment="${nodeId}"]`
          )
          if (panel) {
            panel.style.contentVisibility = "visible"
          }

          // 2. Tạo popup trong đúng portal
          component = document.createElement("div")
          component.className =
            "absolute z-[9999] bg-white rounded shadow-lg border py-1 w-[180px] max-h-[200px] overflow-y-auto pointer-events-auto"

          const wrapper = document.querySelector(
            `.mention-portal-add[data-node="${nodeId}"]`
          )
          popup = wrapper.appendChild(component)

          updatePopup(props)
        },

        onUpdate(props) {
          updatePopup(props)
        },

        onKeyDown(props) {
          const event = props.event

          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            return true
          }

          if (props.event.key === "Escape") {
            popup.remove()
            return true
          }
          return false
        },

        onExit(props) {
          props.editor.storage.__mentionOpen = false
          const panel = document.querySelector(
            `.comment-panel[data-node-comment="${nodeId}"]`
          )
          if (panel) {
            panel.style.contentVisibility = "auto"
          }

          popup?.remove()
        },
      }

      function updatePopup(props) {
        const { items, clientRect } = props
        const rect = clientRect?.()
        if (!rect) return

        const wrapper = document.querySelector(
          `.mention-portal-add[data-node="${nodeId}"]`
        )
        if (!wrapper) return

        const wrapperRect = wrapper.getBoundingClientRect()

        const top = rect.bottom - wrapperRect.top
        const left = rect.left - wrapperRect.left

        popup.style.position = "absolute"
        popup.style.top = `${top}px`
        popup.style.left = `${left}px`
        popup.innerHTML = ""

        items.forEach((item) => {
          const el = document.createElement("div")
          el.className =
            "px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm flex items-center gap-2"

          el.setAttribute("data-mention-item", "true")

          el.innerHTML = `
      <img src="${item.imageURL || ""}" class="w-5 h-5 rounded-full"/>
      <span>${item.full_name}</span>
    `

          // el.onclick = () => {
          //   // Insert đúng tiptap mention node
          //   props.editor
          //     .chain()
          //     .focus()
          //     .deleteRange(props.range)
          //     .insertContent({
          //       type: "mention",
          //       attrs: {
          //         id: item.email,
          //         label: item.full_name,
          //       },
          //     })
          //     .insertContent(" ")
          //     .run()

          //   // Đóng dropdown
          //   props.exit?.()
          // }

          // el.onclick = () => {
          //   // 1. Lưu scroll hiện tại của panel
          //   const container = document.querySelector(
          //     ".comment-scroll-container"
          //   )
          //   const oldScrollTop = container?.scrollTop ?? 0

          //   // 2. Insert mention (KHÔNG để browser tự scroll)
          //   props.editor
          //     .chain()
          //     .deleteRange(props.range)
          //     .insertContent({
          //       type: "mention",
          //       attrs: {
          //         id: item.email,
          //         label: item.full_name,
          //       },
          //     })
          //     .insertContent(" ")
          //     .run()

          //   // 3. Focus lại editor nhưng không scroll
          //   props.editor.view.dom.focus({ preventScroll: true })

          //   // 4. Restore scroll sau khi DOM update
          //   requestAnimationFrame(() => {
          //     if (container) {
          //       container.scrollTop = oldScrollTop
          //     }
          //   })

          //   // 5. Đóng dropdown
          //   props.exit?.()
          // }

          // el.onmousedown = (e) => {
          //   // ✅ QUAN TRỌNG: giữ focus/selection trong editor, ngăn browser scroll
          //   e.preventDefault()
          //   e.stopPropagation()

          //   // lấy đúng container gần nhất (đỡ bug khi có nhiều panel)
          //   const container =
          //     document.querySelector(".comment-scroll-container") ||
          //     wrapper.closest(".comment-scroll-container")

          //   const oldScrollTop = container?.scrollTop ?? 0

          //   // ✅ dùng focus với scrollIntoView:false (Tiptap v2 có)
          //   props.editor
          //     .chain()
          //     .focus(null, { scrollIntoView: false })
          //     .deleteRange(props.range)
          //     .insertContent({
          //       type: "mention",
          //       attrs: { id: item.email, label: item.full_name },
          //     })
          //     .insertContent(" ")
          //     .run()

          //   // ✅ restore scroll 2 nhịp (ProseMirror đôi khi scroll lại sau update selection)
          //   requestAnimationFrame(() => {
          //     if (container) container.scrollTop = oldScrollTop
          //     requestAnimationFrame(() => {
          //       if (container) container.scrollTop = oldScrollTop
          //     })
          //   })

          //   props.exit?.()
          // }

          el.onmousedown = (e) => {
            e.preventDefault()
            e.stopPropagation()

            const container =
              document.querySelector(".comment-scroll-container") ||
              wrapper.closest(".comment-scroll-container")

            const oldScrollTop = container?.scrollTop ?? 0

            // 1️⃣ Đóng popup TRƯỚC (tránh layout shift sau)
            props.exit?.()

            // 2️⃣ Insert mention ở frame kế tiếp
            requestAnimationFrame(() => {
              props.editor
                .chain()
                .focus(null, { scrollIntoView: false })
                .deleteRange(props.range)
                .insertContent({
                  type: "mention",
                  attrs: {
                    id: item.email,
                    label: item.full_name,
                  },
                })
                .insertContent(" ")
                .run()

              // 3️⃣ Restore scroll SAU KHI editor update xong
              requestAnimationFrame(() => {
                if (container) {
                  container.scrollTop = oldScrollTop
                }
              })
            })
          }

          popup.appendChild(el)
        })
      }
    },
  }
}
