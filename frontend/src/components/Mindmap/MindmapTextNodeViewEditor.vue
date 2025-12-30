<template>
  <div class="w-full h-full overflow-auto bg-white">
    <div class="mx-auto px-3 py-6 max-w-[1100px]">
      <EditorContent v-if="editor" :editor="editor" class="prose prose-sm focus:outline-none max-w-[800px]" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from "vue"
import { Editor, EditorContent } from "@tiptap/vue-3"
import StarterKit from "@tiptap/starter-kit"
import { InlineStyle } from "./components/extensions/InlineStyle"
import Underline from "@tiptap/extension-underline"
import { InlineRoot } from "./components/extensions/InlineRoot"
import { TaskLink } from "./components/extensions/TaskLink"
import Image from "@tiptap/extension-image"
import { ImageZoomClickExtension } from "./components/extensions/ImageZoomClickExtension"
import { extractNodeEditsFromHTML, hasMmNode } from "./components/MindmapTextNodeViewEditor/helpers"
import { HeadingWithNodeId, ListItemWithNodeId, ParagraphWithNodeId } from "./components/MindmapTextNodeViewEditor/extensions"
import { createEditorKeyDown } from "./components/MindmapTextNodeViewEditor/editorKeymap"
import { ListItemChildrenSync } from "./components/extensions/ListItemChildrenSync"


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
let isCreatingDraftNode = false


const emit = defineEmits([
  "rename-title",
  "update-nodes",
  "open-comment",
  "add-child-node",
])

const canEdit = hasMmNode(props.initialContent)

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


let syncTimer = null

function syncFromEditorDebounced(editor) {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncFromEditor(editor)
  }, 500)
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
    syncFromEditor,
    syncFromEditorDebounced,
    onOpenComment(nodeId, options = {}) {
      emit("open-comment", {
        nodeId,
        options,
      })
    },
    onAddChildNode(payload) {
      emit("add-child-node", payload)
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
      ImageZoomClickExtension,
      ListItemChildrenSync,
    ],

    editorProps: {
      attributes: {
        class: "min-h-[60vh]",
      },

      handleKeyDown: createEditorKeyDown({
        editor,
        flags: {
          isCreatingDraftNode,
        },
      }),

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


    onUpdate({ editor, transaction }) {
      if (isComposing) return

      if (transaction?.getMeta("ui-only")) {
        return
      }

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
    if (isCreatingDraftNode) return
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

.prose :deep(ul) {
  list-style-type: none;
}

.prose :deep(.mm-node) {
  display: flex;
  align-items: center;
  gap: 4px;
}

.prose :deep(.collapse-slot) {
  width: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.prose :deep(.collapse-toggle) {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  cursor: pointer;
}

.prose :deep(li[data-collapsed="true"] ul) {
  display: none;
}

/* hover hoặc active */
.prose :deep(.mm-node:hover .collapse-toggle),
.prose :deep(.mm-node.is-comment-hover .collapse-toggle) {
  opacity: 1;
  pointer-events: auto;
}

/* hover vào dòng */
.prose :deep(.mm-node:hover .collapse-toggle) {
  opacity: 1;
}

/* hoặc đang active (mở comment / selected) */
.prose :deep(.mm-node.is-comment-hover .collapse-toggle) {
  opacity: 1;
}

.prose :deep(.ProseMirror-gapcursor.ProseMirror-widget) {
  display: none;
}

.prose :deep(li[data-has-count="true"] > div > div > p span:not(.collapse-slot)) {
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


.prose :deep(.mm-node.is-comment-hover > div span[data-inline-root] > span) {
  background-color: #faedc2;
  border-radius: 3px;
}

.prose :deep(.mm-node.is-comment-hover:not(:has(span[data-inline-root]))) {
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

.prose :deep(.mindmap-dot) {
  width: 6px;
  height: 6px;
  background-color: #383838;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: pointer;
}

.prose :deep(blockquote .mm-node),
.prose :deep(blockquote .mm-node *){
  background: transparent !important;
}
</style>
