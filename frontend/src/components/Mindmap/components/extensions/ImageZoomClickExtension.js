// extensions/ImageZoomClickExtension.js
import { Extension } from "@tiptap/core"
import { Plugin } from "prosemirror-state"

export const ImageZoomClickExtension = Extension.create({
  name: "imageZoomClick",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click(view, event) {
              const target = event.target

              // chỉ xử lý IMG
              if (!(target instanceof HTMLImageElement)) {
                return false
              }

              const editorDOM = view.dom
              if (!editorDOM) return false

              // lấy danh sách ảnh trong editor (theo thứ tự DOM)
              const images = Array.from(
                editorDOM.querySelectorAll("img")
              )
                .map(img => img.getAttribute("src"))
                .filter(Boolean)

              if (!images.length) return false

              const src = target.getAttribute("src")
              const index = images.indexOf(src)

              if (index === -1) return false

              event.preventDefault()
              event.stopPropagation()

              // dispatch event giống editor comment
              window.dispatchEvent(
                new CustomEvent("open-image-modal", {
                  detail: {
                    images,
                    index,
                    imageUrl: src,
                  },
                })
              )

              return true
            },
          },
        },
      }),
    ]
  },
})
