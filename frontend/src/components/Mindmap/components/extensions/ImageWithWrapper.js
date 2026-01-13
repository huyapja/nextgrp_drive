import Image from "@tiptap/extension-image"

export const ImageWithWrapper = Image.extend({
  addNodeView() {
    return ({ node, getPos }) => {
      const wrapper = document.createElement("div")
      wrapper.className = "image-wrapper"
      wrapper.dataset.imageSrc = node.attrs["data-image-src"] || ""

      const img = document.createElement("img")
      img.src = node.attrs.src
      img.alt = node.attrs.alt || ""
      img.draggable = true
      img.setAttribute("data-node-id", node.attrs.nodeId || "")

      wrapper.appendChild(img)

      return {
        dom: wrapper,
        contentDOM: null,
      }
    }
  },
})
