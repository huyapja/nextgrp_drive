import { Node } from "@tiptap/core"

export const TaskLink = Node.create({
  name: "taskLink",

  group: "block",
  atom: true,
  selectable: false,
  draggable: false,
  
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
        tabindex: "-1",
      },
      text || "Liên kết công việc",
    ]
  },
})
