// extensions/mention.js
import { Node, mergeAttributes } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'

export const Mention = Node.create({
  name: 'mention',

  inline: true,
  group: 'inline',
  atom: true,
  selectable: false,

  addOptions() {
    return {
      suggestion: {
        char: '@',
        allowSpaces: false,
        items: () => [],
        render: () => {},
      },
      HTMLAttributes: {
        class: 'mention',
      },
    }
  },

  addAttributes() {
    return {
      id: { default: null },
      label: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-mention]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-mention': node.attrs.id,
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
        attrs =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          })
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
