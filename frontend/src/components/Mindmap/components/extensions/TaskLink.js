import { Node } from "@tiptap/core"

export const TaskLink = Node.create({
  name: "taskLink",

  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      href: {
        default: null,
      },
      text: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "a[data-task-link]",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { href, text } = HTMLAttributes

    return [
      "a",
      {
        "data-task-link": "true",
        href,
        target: "_top",
        rel: "noopener noreferrer",
        class: "task-link",
      },
      text || "Liên kết công việc",
    ]
  },
})
