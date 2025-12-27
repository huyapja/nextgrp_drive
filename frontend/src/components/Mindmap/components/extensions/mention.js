// extensions/mention.js
import { Node, mergeAttributes } from "@tiptap/core"
import Suggestion from "@tiptap/suggestion"

export const Mention = Node.create({
  name: "mention",

  inline: true,
  group: "inline",
  atom: true,
  selectable: false,

  addOptions() {
    return {
      suggestion: {
        char: "@",
        allowSpaces: false,
        items: () => [],
        render: () => {},
      },
      HTMLAttributes: {
        class: "mention",
      },
    }
  },

  addAttributes() {
    return {
      id: { default: null },
      label: { default: null },
      kind: { default: "mention" },
    }
  },

  parseHTML() {
    return [
      {
        tag: "span[data-mention]",
        getAttrs: (el) => ({
          id: el.getAttribute("data-mention"),
          label: el.textContent?.replace(/^@/, ""),
          kind: el.getAttribute("data-kind") || "mention",
        }),
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-mention": node.attrs.id,
        "data-kind": node.attrs.kind,
      }),
      `@${node.attrs.label}`,
    ]
  },

  renderText({ node }) {
    return `@${node.attrs.label}`
  },

  addCommands() {
    return {
      insertMention:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          })
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state, view } = this.editor
        const { selection } = state
        const { $from } = selection

        // node ngay trước cursor
        const nodeBefore = $from.nodeBefore

        // position hiện tại
        const pos = $from.pos

        // CASE 1: cursor đứng sau SPACE mà trước đó là mention
        if (nodeBefore?.isText && nodeBefore.text === " ") {
          const beforeSpace = state.doc.resolve(
            pos - nodeBefore.nodeSize
          ).nodeBefore

          if (beforeSpace?.type.name === this.name) {
            const tr = state.tr.delete(
              pos - nodeBefore.nodeSize - beforeSpace.nodeSize,
              pos
            )
            view.dispatch(tr)
            return true
          }
        }

        // CASE 2: cursor đứng ngay sau mention
        if (nodeBefore?.type.name === this.name) {
          const tr = state.tr.delete(pos - nodeBefore.nodeSize, pos)
          view.dispatch(tr)
          return true
        }

        return false
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
