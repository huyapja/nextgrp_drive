import Image from "@tiptap/extension-image"
import { VueNodeViewRenderer } from "@tiptap/vue-3"
import ImageWithRemove from "./ImageWithRemove.vue"

export const RemovableImage = Image.extend({
  addNodeView() {
    return VueNodeViewRenderer(ImageWithRemove)
  },
})
