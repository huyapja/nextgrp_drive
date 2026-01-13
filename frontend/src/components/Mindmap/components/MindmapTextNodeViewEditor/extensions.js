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
      level: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-level"),
        renderHTML: (attrs) =>
          attrs.level ? { "data-level": attrs.level } : {},
      },
      hasCount: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-has-count") === "true",
        renderHTML: (attrs) =>
          attrs.hasCount ? { "data-has-count": "true" } : {},
      },
      hasChildren: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-has-children") === "true",
        renderHTML: (attrs) =>
          attrs.hasChildren ? { "data-has-children": "true" } : {},
      },
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-collapsed") === "true",
        renderHTML: (attrs) =>
          attrs.collapsed ? { "data-collapsed": "true" } : {},
      },
      highlight: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-highlight"),
        renderHTML: (attrs) =>
          attrs.highlight ? { "data-highlight": attrs.highlight } : {},
      },
      completed: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-completed") === "true",
        renderHTML: (attrs) =>
          attrs.completed ? { "data-completed": "true" } : {},
      },
      taskId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-task-id"),
        renderHTML: (attrs) =>
          attrs.taskId ? { "data-task-id": attrs.taskId } : {},
      },

      taskMode: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-task-mode"),
        renderHTML: (attrs) =>
          attrs.taskMode ? { "data-task-mode": attrs.taskMode } : {},
      },
      taskStatus: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-task-status"),
        renderHTML: (attrs) =>
          attrs.taskStatus ? { "data-task-status": attrs.taskStatus } : {},
      },
    }
  },

  addNodeView() {
    return VueNodeViewRenderer(ListItemNodeTextView)
  },
})
