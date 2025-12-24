<template>
  <div class="w-full h-full overflow-auto bg-white">
    <div class="mx-auto px-10 py-6 max-w-[900px]">
      <EditorContent v-if="editor" :editor="editor" class="prose prose-sm focus:outline-none" />
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
])

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

      hasCount: {
        default: false,
        parseHTML: el => el.getAttribute("data-has-count") === "true",
        renderHTML: attrs =>
          attrs.hasCount ? { "data-has-count": "true" } : {},
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
      nodeId: {
        default: null,
        parseHTML: el => el.getAttribute("data-node-id"),
        renderHTML: attrs =>
          attrs.nodeId ? { "data-node-id": attrs.nodeId } : {},
      },

      class: {
        default: null,
        parseHTML: el => el.getAttribute("class"),
        renderHTML: attrs =>
          attrs.class ? { class: attrs.class } : {},
      },
    }
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


function extractNodeEditsFromHTML(html) {
  const div = document.createElement("div")
  div.innerHTML = html

  const edits = []

  div.querySelectorAll("[data-node-id]").forEach(el => {
    const nodeId = el.getAttribute("data-node-id")
    if (!nodeId) return

    const innerHTML = el.innerHTML?.trim()
    if (!innerHTML) return

    edits.push({
      nodeId,
      label: `<p>${innerHTML}</p>`,
    })
  })

  return edits
}


/* ================================
 * Editor
 * ================================ */
const editor = ref(null)

onMounted(() => {
  editor.value = new Editor({
    content: props.initialContent,
    editable: props.editable,
    autofocus: "start",

    extensions: [
      StarterKit.configure({ heading: false, paragraph: false }),
      InlineStyle,
      HeadingWithNodeId,
      ParagraphWithNodeId,
      Underline,
    ],

    editorProps: {
      attributes: {
        class: "min-h-[60vh]",
      },

      handleDOMEvents: {
        focus: () => {
          isEditorFocused = true
        },

        blur: () => {
          isEditorFocused = false
          if (editor.value) {
            syncFromEditor(editor.value)
          }
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
      // syncFromEditor(editor)
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

    if (isEditorEmitting) return
    if (isComposing) return
    if (isEditorFocused) return

    const current = editor.value.getHTML()
    if (current !== val) {
      editor.value.commands.setContent(val || "", false)
    }
  }
)

</script>

<style scoped>
.prose :deep(p) {
  margin: 0.5em 0;
}

.prose :deep(.has-count span) {
  border-bottom: 2px solid #fcdf7e;
}

.prose :deep(.has-count p) {
  border-bottom: 2px solid #fcdf7e;
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
</style>
