import { Mark } from "@tiptap/core"

export const InlineRoot = Mark.create({
  name: "inlineRoot",

  parseHTML() {
    return [{ tag: 'span[data-inline-root="true"]' }]
  },

  renderHTML() {
    return ["span", { "data-inline-root": "true" }, 0]
  },
})
