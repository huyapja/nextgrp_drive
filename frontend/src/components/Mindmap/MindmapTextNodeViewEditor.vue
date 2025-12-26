<template>
  <div class="w-full h-full overflow-auto bg-white">
    <div class="mx-auto px-3 py-6 max-w-[1100px]">
      <EditorContent v-if="editor" :editor="editor" class="prose prose-sm focus:outline-none max-w-[800px]" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from "vue"
import { Editor, EditorContent, VueNodeViewRenderer } from "@tiptap/vue-3"
import StarterKit from "@tiptap/starter-kit"
import Heading from "@tiptap/extension-heading"
import Paragraph from "@tiptap/extension-paragraph"
import HeadingNodeView from "./components/HeadingNodeTextView.vue"
import { InlineStyle } from "./components/extensions/InlineStyle"
import Underline from "@tiptap/extension-underline"
import ParagraphNodeTextView from "./components/ParagraphNodeTextView.vue"
import ListItemNodeTextView from "./components/ListItemNodeTextView.vue"
import ListItem from "@tiptap/extension-list-item"
import { InlineRoot } from "./components/extensions/InlineRoot"
import { TaskLink } from "./components/extensions/TaskLink"
import Image from "@tiptap/extension-image"
import { ImageZoomClickExtension } from "./components/extensions/ImageZoomClickExtension"
import { TextSelection } from "@tiptap/pm/state"


function hasMmNode(html) {
  if (!html) return false
  const div = document.createElement("div")
  div.innerHTML = html
  return !!div.querySelector(".mm-node, [data-node-id]")
}


/* ================================
 * Props / Emits
 * ================================ */
const props = defineProps({
  initialContent: {
    type: String,
    default: "",
  },
  editable: {
    type: Boolean,
    default: true,
  },
})

let isComposing = false
let isEditorEmitting = false
let isEditorFocused = false

const emit = defineEmits([
  "rename-title",
  "update-nodes",
  "open-comment",
  "add-child-node",
])

const canEdit = hasMmNode(props.initialContent)


/* ================================
 * Extensions giữ data-node-id
 * ================================ */
const HeadingWithNodeId = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      nodeId: {
        default: null,
        parseHTML: el => el.getAttribute("data-node-id"),
        renderHTML: attrs =>
          attrs.nodeId ? { "data-node-id": attrs.nodeId } : {},
      },
    }
  },

  addNodeView() {
    return VueNodeViewRenderer(HeadingNodeView)
  },
})


const ParagraphWithNodeId = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      nodeId: {
        default: null,
        parseHTML: el => el.getAttribute("data-node-id"),
        renderHTML: attrs =>
          attrs.nodeId
            ? { "data-node-id": attrs.nodeId }
            : {},
      },
    }
  },

  addNodeView() {
    return VueNodeViewRenderer(ParagraphNodeTextView)
  },
})


const ListItemWithNodeId = ListItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),

      nodeId: {
        default: null,
        parseHTML: el => el.getAttribute("data-node-id"),
        renderHTML: attrs =>
          attrs.nodeId ? { "data-node-id": attrs.nodeId } : {},
      },

      hasCount: {
        default: false,
        parseHTML: el => el.getAttribute("data-has-count") === "true",
        renderHTML: attrs =>
          attrs.hasCount ? { "data-has-count": "true" } : {},
      },
    }
  },

  addNodeView() {
    return VueNodeViewRenderer(ListItemNodeTextView)
  },
})



/* ================================
 * Helpers
 * ================================ */

function syncFromEditor(editor) {
  isEditorEmitting = true

  const html = editor.getHTML()

  const edits = extractNodeEditsFromHTML(html)
  if (edits.length) {
    emit("update-nodes", edits)
  }

  const container = document.createElement("div")
  container.innerHTML = html
  const h1 = container.querySelector('h1[data-node-id="root"]')
  if (h1) {
    const title = h1.textContent?.trim()
    if (title) emit("rename-title", title)
  }
  queueMicrotask(() => {
    isEditorEmitting = false
  })
}


function extractParagraphAndBlock(el) {
  let inlineHTML = ""
  let blockHTML = ""

  /* =========================
   * 1. INLINE PARAGRAPH
   * ========================= */
  const p =
    el.querySelector(":scope > p") ||
    el.querySelector(":scope > div > p")

  if (p) {
    p.querySelectorAll("ul, li").forEach(e => e.remove())
    p.querySelectorAll("[data-node-id]").forEach(e => {
      e.removeAttribute("data-node-id")
      e.removeAttribute("data-has-count")
    })

    const content = p.innerHTML.trim()
    if (content && content !== "<br>") {
      inlineHTML = `<p>${content}</p>`
    }
  }

  /* =========================
   * 2. TASK LINK
   * ========================= */
  const taskLink =
    el.querySelector(":scope > a[data-task-link]") ||
    el.querySelector(":scope > div > a[data-task-link]")

  if (taskLink) {
    const href = taskLink.getAttribute("href")
    const contentHTML = taskLink.innerHTML.trim()

    blockHTML += `
<p>
  ${contentHTML.includes("<a")
        ? contentHTML
        : `<a href="${href}">${contentHTML}</a>`}
</p>
    `.trim()
  }

  /* =========================
   * 3. IMAGE → image-wrapper
   * ========================= */
  const images = el.querySelectorAll(":scope img")

  images.forEach(img => {
    const src = img.getAttribute("src")
    if (!src) return

    const dataSrc = img.getAttribute("data-image-src") || src
    const alt = img.getAttribute("alt") || ""

    blockHTML += `
<div class="image-wrapper" data-image-src="${dataSrc}">
  <img src="${src}" alt="${alt}" />
</div>
    `.trim()
  })

  /* =========================
   * 4. BLOCKQUOTE
   * ========================= */
  const blockquote =
    el.querySelector(":scope > blockquote") ||
    el.querySelector(":scope > div > blockquote")

  if (blockquote) {
    blockquote.querySelectorAll("[data-node-id]").forEach(e => {
      e.removeAttribute("data-node-id")
      e.removeAttribute("data-has-count")
    })

    blockHTML += blockquote.outerHTML
  }

  return (inlineHTML + blockHTML).trim()
}


// function này trích edits từ HTML của editor rồi gửi lên với payload nodes
function extractNodeEditsFromHTML(html) {
  const container = document.createElement("div")
  container.innerHTML = html

  const edits = []

  container.querySelectorAll("[data-node-id]").forEach(el => {
    const nodeId = el.getAttribute("data-node-id")
    if (!nodeId) return

    let labelHTML = ""

    // heading
    if (/^H[1-6]$/.test(el.tagName)) {
      const content = el.innerHTML.trim()
      if (!content || content === "<br>") return

      labelHTML = `<p>${content}</p>`
    }

    // list item / paragraph
    else {
      labelHTML = extractParagraphAndBlock(el)
      if (!labelHTML) return
    }

    edits.push({
      nodeId,
      label: labelHTML,
    })
  })

  return edits
}



let syncTimer = null

function syncFromEditorDebounced(editor) {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncFromEditor(editor)
  }, 300)
}

function insertTempChildNode(editor) {
  const { state, view } = editor
  const { selection, schema } = state

  const { $from } = selection
  let found = null

  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type === schema.nodes.listItem) {
      found = {
        node,
        pos: $from.before(d),
      }
      break
    }
  }

  if (!found) return

  const insertPos = found.pos + found.node.nodeSize

  const text = schema.text('Nhánh mới')
  const p = schema.nodes.paragraph.create({}, text)
  const li = schema.nodes.listItem.create({}, p)

  let tr = state.tr.insert(insertPos, li)

  // 3️⃣ tính vị trí caret: bên trong paragraph mới
  const caretPos =
    insertPos + 1 /* <li> */ +
    1 /* <p> */ +
    text.nodeSize

  tr = tr.setSelection(
    TextSelection.create(tr.doc, caretPos)
  )

  view.dispatch(tr)
  view.focus()
}



/* ================================
 * Editor
 * ================================ */
const editor = ref(null)

onMounted(() => {
  editor.value = new Editor({
    content: props.initialContent,
    editable: canEdit,
    autofocus: "start",
    onOpenComment(nodeId, options = {}) {
      emit("open-comment", {
        nodeId,
        options,
      })
    },
    onAddChildNode(nodeId) {
      emit("add-child-node", nodeId)
    },
    extensions: [
      StarterKit.configure({
        bulletList: true,
        orderedList: false,
        listItem: false,
      }),
      InlineRoot,
      TaskLink,
      ListItemWithNodeId,
      ParagraphWithNodeId,
      HeadingWithNodeId,
      InlineStyle,
      Underline,
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            "data-image-src": {
              default: null,
              parseHTML: el => el.getAttribute("data-image-src"),
              renderHTML: attrs =>
                attrs["data-image-src"]
                  ? { "data-image-src": attrs["data-image-src"] }
                  : {},
            },
          }
        },
      }),
      ImageZoomClickExtension
    ],

    editorProps: {
      attributes: {
        class: "min-h-[60vh]",
      },

      handleKeyDown(view, event) {
        const { state } = view
        const { selection } = state

        // ==============================
        // ENTER → ADD CHILD NODE
        // ==============================
        if (event.key === 'Enter') {
          if (!selection.empty) return false

          const { $from } = selection
          const isAtEnd = $from.parentOffset === $from.parent.content.size
          if (!isAtEnd) return false

          // tìm nodeId mindmap
          let nodeId = null
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d)
            if (node?.attrs?.nodeId) {
              nodeId = node.attrs.nodeId
              break
            }
          }
          if (!nodeId) return false

          // ✅ 1. chèn ngay trong text editor
          insertTempChildNode(editor.value)

          // ✅ 2. sync sang mindmap
          editor.value?.options?.onAddChildNode?.(nodeId)

          event.preventDefault()
          return true
        }



        if ((event.ctrlKey || event.metaKey) && event.key === "a") {
          const { state, dispatch } = view
          const { selection } = state

          // chỉ xử lý khi đang là caret
          if (!selection.empty) {
            return false // để ProseMirror select-all bình thường
          }

          const { $from } = selection

          // lấy block cha (paragraph / list-item / heading)
          let depth = $from.depth
          while (depth > 0 && !$from.node(depth).isBlock) {
            depth--
          }

          const blockNode = $from.node(depth)
          if (!blockNode) return false

          const start = $from.start(depth)
          const end = start + blockNode.nodeSize

          dispatch(
            state.tr.setSelection(
              state.selection.constructor.create(
                state.doc,
                start,
                end - 1
              )
            )
          )

          event.preventDefault()
          return true
        }

        return false
      },

      handleDOMEvents: {
        focus: () => {
          isEditorFocused = true
        },

        blur: () => {
          isEditorFocused = false
        },

        compositionstart: () => {
          isComposing = true
        },

        compositionend: () => {
          isComposing = false
          requestAnimationFrame(() => {
            if (editor.value) {
              syncFromEditor(editor.value)
            }
          })

          return false
        },
      },
    },


    onUpdate({ editor }) {
      if (isComposing) return
      syncFromEditorDebounced(editor)
    },
  })
})


onBeforeUnmount(() => {
  editor.value?.destroy()
})

watch(
  () => props.initialContent,
  (val) => {
    if (!editor.value) return
    if (isEditorFocused) return
    const canEdit = hasMmNode(val)

    if (editor.value.isEditable !== canEdit) {
      editor.value.setEditable(canEdit)
    }

    if (editor.value.getHTML() !== val) {
      editor.value.commands.setContent(val || "", false)
    }
  }
)


</script>

<style scoped>
.prose :deep(p) {
  margin: 0.5em 0;
}

.prose :deep(.ProseMirror-gapcursor.ProseMirror-widget) {
  display: none;
}

.prose :deep(li[data-has-count="true"] > div > div > p span) {
  border-bottom: 2px solid #fcdf7e;
  transition: all 0.2s ease;
}

.prose :deep(li[data-has-count="true"] > div p:not(:has(span))) {
  position: relative;
  display: inline-block;
}

.prose[data-v-049909dd] li[data-has-count="true"]>div p:not(:has(span)):not(blockquote p)::after {
  content: "";
  display: block;
  width: 100%;
  height: 2px;
  background-color: #fcdf7e;
  margin-top: 2px;
}

.prose :deep(.mm-node) {
  margin-bottom: 0px;
}


.prose :deep(.mm-node.is-comment-hover span) {
  background-color: #faedc2;
  border-radius: 3px;
}

.prose :deep(.mm-node.is-comment-hover:not(:has(span))) {
  background-color: #faedc2;
  border-radius: 3px;
}

.prose :deep(.mm-node) {
  position: relative;
}

.prose :deep(.mm-node.is-comment-hover) {
  caret-color: #000000;
}

.prose :deep(.comment-icon) {
  box-sizing: border-box;
  cursor: pointer;
  height: 24px;
  margin-top: 3px;
  position: absolute;
  right: 0;
  top: 0;
  opacity: 0;
  visibility: hidden;
  transition: all 0.1s ease;
}

.prose :deep(.mm-node:hover .comment-icon) {
  opacity: 1;
  visibility: visible;
}

.prose :deep(blockquote) {
  padding: 0;
  margin: 0px;
  border: none;
  quotes: none;
  color: #a19c9c;
  font-size: 12px;
  line-height: 1.6;
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  min-width: 0;
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  white-space: normal;
}

.prose :deep(blockquote .mm-node) {
  margin-top: 0px;
  margin-bottom: 0px;
}

.prose :deep(.mm-node:has(+ blockquote)) {
  margin-bottom: 4px;
}

.prose :deep(a.task-link) {
  padding: 0px;
  margin: 0;
  color: #1d4ed8;
  font-size: 13px;
}
</style>
