import { VueNodeViewRenderer } from "@tiptap/vue-3"
import Heading from "@tiptap/extension-heading"
import Paragraph from "@tiptap/extension-paragraph"
import ListItem from "@tiptap/extension-list-item"

import HeadingNodeView from "../HeadingNodeTextView.vue"
import ParagraphNodeTextView from "../ParagraphNodeTextView.vue"
import ListItemNodeTextView from "../ListItemNodeTextView.vue"

export const HeadingWithNodeId = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      nodeId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-node-id"),
        renderHTML: (attrs) =>
          attrs.nodeId ? { "data-node-id": attrs.nodeId } : {},
      },
    }
  },

  addNodeView() {
    return VueNodeViewRenderer(HeadingNodeView)
  },
})

export const ParagraphWithNodeId = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      nodeId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-node-id"),
        renderHTML: (attrs) =>
          attrs.nodeId ? { "data-node-id": attrs.nodeId } : {},
      },
    }
  },

  addNodeView() {
    return VueNodeViewRenderer(ParagraphNodeTextView)
  },
})

export const ListItemWithNodeId = ListItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),

      nodeId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-node-id"),
        renderHTML: (attrs) =>
          attrs.nodeId ? { "data-node-id": attrs.nodeId } : {},
      },

      hasCount: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-has-count") === "true",
        renderHTML: (attrs) =>
          attrs.hasCount ? { "data-has-count": "true" } : {},
      },
    }
  },

  addNodeView() {
    return VueNodeViewRenderer(ListItemNodeTextView)
  },
})
