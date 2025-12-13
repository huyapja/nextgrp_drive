import { Node } from "@tiptap/core"

export const UploadImage = Node.create({
  name: "uploadImage",

  group: "block",
  atom: true,
  selectable: false,
  isolating: true,

  addAttributes() {
    return {
      id: { default: null },
      previewUrl: { default: null },
      progress: { default: 0 },
      status: { default: "uploading" }, // uploading | done | error
    }
  },

  parseHTML() {
    return [{ tag: "span[data-upload-image]" }]
  },

  renderHTML() {
    return ["span", { "data-upload-image": "" }]
  },

  addNodeView() {
    return ({ node }) => {
      const wrap = document.createElement("div")
      wrap.className =
        "relative w-[62px] h-[62px] rounded overflow-hidden bg-gray-100 inline-block align-middle"

      // 🔒 chặn selection / focus
      wrap.setAttribute("contenteditable", "false")
      wrap.setAttribute("draggable", "false")

      const img = document.createElement("img")
      img.src = node.attrs.previewUrl
      img.className =
        "w-full h-full object-cover opacity-70 pointer-events-none"
      wrap.appendChild(img)

      /* overlay */
      const overlay = document.createElement("div")
      overlay.className =
        "absolute inset-0 flex flex-col justify-between bg-black/40 text-white pointer-events-none"

      const percentText = document.createElement("div")
      percentText.className =
        "flex-1 flex items-center justify-center text-[10px] font-medium"
      overlay.appendChild(percentText)

      const barWrap = document.createElement("div")
      barWrap.className = "w-full h-[3px] bg-white/30"

      const bar = document.createElement("div")
      bar.className = "h-full bg-blue-500 transition-all duration-150"
      barWrap.appendChild(bar)

      overlay.appendChild(barWrap)
      wrap.appendChild(overlay)

      function updateUI(attrs) {
        percentText.textContent = `${attrs.progress}%`
        bar.style.width = `${attrs.progress}%`
        overlay.style.display = attrs.status === "uploading" ? "flex" : "none"
      }

      updateUI(node.attrs)

      return {
        dom: wrap,

        update(updatedNode) {
          if (updatedNode.type.name !== "uploadImage") return false
          updateUI(updatedNode.attrs)
          return true
        },

        // 🚫 chặn selection + paste interaction
        stopEvent(event) {
          if (
            event.type === "mousedown" ||
            event.type === "mouseup" ||
            event.type === "copy" ||
            event.type === "cut"
          ) {
            return true
          }
          return false
        },

        ignoreMutation() {
          return true
        },
      }
    }
  },
})
