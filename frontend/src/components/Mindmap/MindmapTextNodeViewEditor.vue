<template>
  <div class="w-full h-full overflow-auto bg-white">
    <div class="mx-auto px-3 py-6 max-w-[1100px]">
      <EditorContent v-if="editor" :editor="editor" class="prose prose-sm focus:outline-none max-w-[800px]" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch, computed, provide, inject } from "vue"
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
import { TextSelection } from "@tiptap/pm/state"
import { useRoute } from "vue-router"
import { createResource } from "frappe-ui"
import { getNodeIdFromSelection } from "./utils/getNodeIdFromSelection"
import { useNodeEditingTracker } from "./components/MindmapTextNodeViewEditor/useNodeEditingTracker"
// import { createListItemDragPlugin } from "./components/plugins/listItemDragPlugin"
import { ImageWithWrapper } from "./components/extensions/ImageWithWrapper"


const REMOTE_USER_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#eab308",
  "#ec4899",
  "#0ea5e9",
  "#84cc16",
]

function getRemoteUserColor(userId) {
  if (remoteUserColorMap.has(userId)) {
    return remoteUserColorMap.get(userId)
  }

  const color =
    REMOTE_USER_COLORS[
    colorCursor % REMOTE_USER_COLORS.length
    ]

  remoteUserColorMap.set(userId, color)
  colorCursor++

  return color
}

/* ================================
 * Props / Emits
 * ================================ */
const props = defineProps({
  initialContent: {
    type: String,
    default: "",
  },
  permissions: {
    type: Object,
    required: true,
  },
})

let isComposing = false
let isEditorFocused = false
let isCreatingDraftNode = false
let isEditorEmitting = false
let lastCaretNodeId = null

const remoteUserColorMap = new Map()
let colorCursor = 0

const socket = inject("socket")
const emitter = inject("emitter")

const emit = defineEmits([
  "rename-title",
  "update-nodes",
  "open-comment",
  "add-child-node",
  "done-node",
  "copy-node",
  "task-link-node",
  "delete-node",
  "unlink-task-node",
  "insert-images"
])

const canEdit = computed(() => {
  return hasMmNode(props.initialContent)
})
const canEditContent = computed(() => {
  return props.permissions?.write === 1
})

const remoteEditingNodes = new Map()

/* ================================
 * Helpers
 * ================================ */

let lastEmittedTitle = null
const lastNodeLabels = new Map()


function syncFromEditor(editor) {
  isEditorEmitting = true

  const html = editor.getHTML()
  const edits = extractNodeEditsFromHTML(html)

  const changedEdits = []

  edits.forEach(({ nodeId, label }) => {
    const prev = lastNodeLabels.get(nodeId)

    if (prev !== label) {
      lastNodeLabels.set(nodeId, label)
      changedEdits.push({ nodeId, label })
    }
  })

  if (changedEdits.length) {
    emit("update-nodes", changedEdits)
  }

  // ===== title sync giữ nguyên =====
  const container = document.createElement("div")
  container.innerHTML = html

  const h1 = container.querySelector('h1[data-node-id="root"]')
  if (h1) {
    const title = h1.textContent?.trim() ?? ""
    if (title && title !== lastEmittedTitle) {
      lastEmittedTitle = title
      emit("rename-title", title)
    }
  }

  queueMicrotask(() => {
    isEditorEmitting = false
  })
}


const route = useRoute()
const entityName = computed(() => route.params.entityName)
const broadcastEditingResource = createResource({ url: "drive.api.mindmap.broadcast_node_editing", method: "POST" })
let caretMouseupTimer = null

const editingTracker = useNodeEditingTracker({
  entityName,
  broadcastEditingResource,
  delay: 120,
})



let syncTimer = null

function syncFromEditorDebounced(editor) {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncFromEditor(editor)
  }, 350)
}

function isEmptyBlockquote(node) {
  if (!node || node.type.name !== "blockquote") return false
  if (node.childCount !== 1) return false

  const p = node.child(0)
  if (p.type.name !== "paragraph") return false

  return p.textContent.trim().length === 0
}

/* ================================
 * Editor
 * ================================ */
const editor = ref(null)
provide('editorPermissions', computed(() => props.permissions))


const activeActionNodeId = ref(null)
provide("activeActionNodeId", activeActionNodeId)

const getCookie = name => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};

// lấy id của người dùng ví dụ như hoviethung.work@gmail.com
const userIdFromCookie = computed(() =>
  decodeURIComponent(getCookie('user_id') || '')
);


function removeRemoteIndicator(userId) {
  document
    .querySelectorAll(
      `.remote-node-indicator[data-user-id="${userId}"]`
    )
    .forEach(el => el.remove())
}


function findNodeLi(nodeId) {
  return document.querySelector(
    `li[data-node-id="${nodeId}"]`
  )
}

function getEditingUserOfNode(nodeId) {
  for (const [, info] of remoteEditingNodes) {
    if (info.nodeId === nodeId) {
      return info
    }
  }
  return null
}

provide("getEditingUserOfNode", getEditingUserOfNode)

function handleRealtimeNodeEditing(payload) {
  const {
    user_id,
    user_name,
    node_id,
    is_editing,
  } = payload

  // bỏ qua chính mình
  if (user_id === userIdFromCookie.value) return

  // xoá indicator cũ của user này
  removeRemoteIndicator(user_id)


  // nếu user stop edit → không render gì nữa
  if (!is_editing || !node_id) {
    remoteEditingNodes.delete(user_id)
    return
  }

  remoteEditingNodes.set(user_id, {
    nodeId: node_id,
    userId: user_id,
    userName: user_name,
  })

  // tìm node <li>
  const li = findNodeLi(node_id)
  if (!li) return

  const color = getRemoteUserColor(user_id)

  // tạo indicator
  const indicator = document.createElement("div")
  indicator.className = "remote-node-indicator"
  indicator.dataset.userId = user_id
  indicator.dataset.userName = user_name

  indicator.style.color = color

  indicator.style.setProperty(
    "--remote-color",
    color
  )

  const mmNode =
    li.querySelector(".mm-node") ||
    li.querySelector("p") ||
    li

  mmNode.prepend(indicator)
}

let isInjectingTaskLink = false

function handleInjectTaskLink(payload) {
  if (!editor.value) return

  isInjectingTaskLink = true

  const { state, view } = editor.value
  const { doc, schema } = state

  let tr = state.tr
  let inserted = false

  doc.descendants((node, pos) => {
    if (inserted) return false

    if (
      node.type.name === "listItem" &&
      node.attrs?.nodeId === payload.nodeId
    ) {
      // tìm paragraph con đầu tiên
      let paragraphPos = null
      let offset = 1

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i)
        if (child.type.name === "paragraph") {
          paragraphPos = pos + offset
          break
        }
        offset += child.nodeSize
      }

      if (paragraphPos == null) return

      const taskLinkNode = schema.nodes.taskLink.create({
        href: payload.linkUrl,
        title: payload.title || "Liên kết công việc",
      })

      // ✅ CHÈN NGAY SAU PARAGRAPH
      const insertPos = paragraphPos + node.child(0).nodeSize
      tr = tr.insert(insertPos, taskLinkNode)

      inserted = true
    }
  })

  if (inserted) {
    tr.setMeta("ui-only", true)
    view.dispatch(tr)
  }

  requestAnimationFrame(() => {
    isInjectingTaskLink = false
  })
}

function scrollToSelection(editor) {
  const { node } = editor.view.domAtPos(editor.state.selection.anchor)
  if (node instanceof Element) {
    node.scrollIntoView({ behavior: "smooth" })
  }
}

function focusNodeById(nodeId) {
  if (!editor.value || !nodeId) return

  const { state, view } = editor.value
  let targetPos = null

  state.doc.descendants((node, pos) => {
    if (targetPos != null) return false
    if (node.type.name === "listItem" && node.attrs?.nodeId === nodeId) {
      targetPos = pos + 2
      return false
    }
  })

  if (targetPos == null) return

  const tr = state.tr.setSelection(
    TextSelection.create(state.doc, targetPos)
  )

  tr.setMeta("ui-only", true)
  view.dispatch(tr)

  requestAnimationFrame(() => {
    // 1️⃣ scroll theo selection (KHÔNG scrollIntoView trong tr nữa)
    scrollToSelection(editor.value)

    // 2️⃣ set clicked state
    markNodeClicked(nodeId)

    // 3️⃣ kích hoạt comment state (để vàng)
    editor.value.options?.onOpenComment?.(nodeId, { focus: false })

    // 4️⃣ focus editor
    view.focus()
  })
}


function clearAllClickedNodes() {
  document
    .querySelectorAll('li[data-is-clicked="true"]')
    .forEach(li => {
      li.removeAttribute('data-is-clicked')
    })
}

function markNodeClicked(nodeId) {
  const li = document.querySelector(
    `li[data-node-id="${nodeId}"]`
  )
  if (!li) return

  clearAllClickedNodes()
  li.setAttribute('data-is-clicked', 'true')
}



onMounted(() => {
  editor.value = new Editor({
    content: props.initialContent,
    editable: canEdit.value && canEditContent.value,
    autofocus: "start",
    permissions: {},
    onSelectionUpdate({ editor }) {
      if (!canEdit.value || !canEditContent.value) return
      if (editor.view.composing) return
      if (editor.state.selection.$anchor.parent.type.name === "blockquote") return
    },
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
    onInsertImages(payload) {
      emit("insert-images", payload)
    },
    onDoneNode(payload) {
      emit('done-node', payload)
    },
    onCopyLinkNode(payload) {
      emit('copy-node', payload)
    },
    onTaskLinkNode(payload) {
      emit('task-link-node', payload)
    },
    onUnlinkTaskNode(payload) {
      emit('unlink-task-node', payload)
    },
    onDeleteNode(payload) {
      emit('delete-node', payload)
    },
    onCaretMove(nodeId) {
      editingTracker.sendCaret({ nodeId })
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
            nodeId: {
              default: null,
              parseHTML: (el) => el.getAttribute("data-node-id"),
              renderHTML: (attrs) =>
                attrs.nodeId ? { "data-node-id": attrs.nodeId } : {},
            },
          }
        },
      }),
      ImageWithWrapper,
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
        getEditingUserOfNode,
        getNodeIdFromSelection
      }),

      handleDOMEvents: {
        mouseup: () => {
          clearTimeout(caretMouseupTimer)

          caretMouseupTimer = setTimeout(() => {
            if (!editor.value) return

            const { state } = editor.value
            const { selection } = state
            if (!selection || !selection.empty) return
            if (props.permissions?.write !== 1) return

            const nodeId = getNodeIdFromSelection(editor.value)
            if (!nodeId) return

            // nếu vẫn là node cũ → bỏ qua
            if (nodeId === lastCaretNodeId) return

            lastCaretNodeId = nodeId
            editingTracker.sendCaret({ nodeId })
          }, 500)

          return false
        },
        mousedown: () => {
          return false
        },
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
      if (transaction?.getMeta("ui-only")) return

      const { state, view } = editor
      const { selection } = state

      if (!(selection instanceof TextSelection)) {
        syncFromEditorDebounced(editor)
        return
      }

      const $from = selection.$from

      // tìm blockquote + listItem cha
      let bqDepth = null
      let liDepth = null

      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d)
        if (node.type.name === "blockquote") {
          bqDepth = d
        }
        if (node.type.name === "listItem") {
          liDepth = d
          break
        }
      }

      if (!bqDepth || !liDepth) {
        syncFromEditorDebounced(editor)
        return
      }

      const blockquoteNode = $from.node(bqDepth)
      if (!isEmptyBlockquote(blockquoteNode)) {
        syncFromEditorDebounced(editor)
        return
      }

      const bqStart = $from.before(bqDepth)
      const bqEnd = $from.after(bqDepth)

      const liStart = $from.before(liDepth)
      const liNode = $from.node(liDepth)

      let focusPos = null
      let offset = 1

      for (let i = 0; i < liNode.childCount; i++) {
        const child = liNode.child(i)

        if (child.type.name === "paragraph") {
          focusPos =
            liStart +
            offset +
            child.nodeSize -
            1
          break
        }

        offset += child.nodeSize
      }


      let tr = state.tr.delete(bqStart, bqEnd)

      if (focusPos != null) {
        tr = tr.setSelection(
          TextSelection.create(tr.doc, focusPos)
        )
      }

      tr.setMeta("ui-only", true)
      view.dispatch(tr)

      syncFromEditorDebounced(editor)
    }

  })
  if (emitter) {
    emitter.on("task-link-node", handleInjectTaskLink)
  }

  if (!socket) return
  socket.on(
    "drive_mindmap:node_editing",
    handleRealtimeNodeEditing
  )
})


onBeforeUnmount(() => {
  editor.value?.destroy()
  if (emitter) {
    emitter.off("task-link-node", handleInjectTaskLink)
  }
  if (!socket) return
  socket.off(
    "drive_mindmap:node_editing",
    handleRealtimeNodeEditing
  )
})

watch(
  () => props.initialContent,
  (val) => {
    if (!editor.value) return
    if (isEditorFocused) return
    if (isCreatingDraftNode) return
    if (isInjectingTaskLink) return

    const nextEditable =
      hasMmNode(val) && props.permissions?.write === 1

    if (editor.value.isEditable !== nextEditable) {
      editor.value.setEditable(nextEditable)
    }

    if (editor.value.getHTML() !== val) {
      editor.value.commands.setContent(val || "", false)
    }
  }
)

watch(
  () => props.initialContent,
  (val, oldVal) => {
    if (!editor.value) return
    if (val === oldVal) return

    requestAnimationFrame(() => {
      const { state, view } = editor.value
      const tr = state.tr

      // meta riêng → không sync ngược
      tr.setMeta('ui-only', true)

      view.dispatch(tr)
    })
  }
)


watch(
  () => [canEdit.value, canEditContent.value],
  ([canEditVal, canEditContentVal]) => {
    if (!editor.value) return

    const nextEditable = canEditVal && canEditContentVal

    if (editor.value.isEditable !== nextEditable) {
      editor.value.setEditable(nextEditable)
    }
  },
  { immediate: true }
)


watch(
  () => props.permissions,
  (perms) => {
    if (!editor.value || !perms) return

    editor.value.options.permissions = perms

    editor.value.setEditable(perms.write === 1)
  },
  { immediate: true, deep: true }
)

defineExpose({
  forceStopEditing() {
    editingTracker.forceStop("switch-view")
  },
  focusNodeById
})
</script>

<style scoped>
.prose :deep(p) {
  margin: 0;
}

.prose :deep(ul) {
  list-style-type: none;
  /* margin:0 ; */
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


.prose :deep(li[data-has-count="true"] > div > div > p:not( :has(span[data-inline-root] > span:not(:empty)))::after) {
  content: none;
}



.prose :deep(.mm-node) {
  position: relative;
  margin-bottom: 0px;
}


.prose :deep(li[data-is-clicked="true"] .mm-node.is-comment-hover span[data-inline-root] > span) {
  background-color: #faedc2 !important;
  border-radius: 3px;
}

.prose :deep(.mm-node.is-comment-hover span[data-inline-root]) {
  background-color: #faedc2 !important;
  border-radius: 3px;
}

/* .prose :deep(.mm-node.is-comment-hover:not(:has(span[data-inline-root]))) {
  background-color: #faedc2;
  border-radius: 3px;
} */

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

.prose :deep(blockquote) {
  margin-left: 28px;
}


.prose :deep(blockquote .mm-node) {
  margin-top: 0px;
  margin-bottom: 0px;
}

.prose :deep(.mm-node:has(+ blockquote)) {
  margin-bottom: 4px;
}

.prose :deep(a.task-link) {
  padding: 0 0 5px 15px;
  margin: 0;
  margin-left: 25px;
  color: #1d4ed8;
  font-size: 13px;
  position: relative;
}

.prose :deep(.mindmap-dot) {
  width: 7px;
  height: 7px;
  background-color: #383838;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  transform-origin: center;
}

.prose :deep(li[data-has-children="true"][data-collapsed="true"] .mindmap-dot) {
  box-shadow: 0 0 0 5px rgba(56, 56, 56, 0.15);
}

.prose :deep(.mindmap-dot:hover) {
  transform: scale(1.4);
  box-shadow: 0 0 0 3px rgba(56, 56, 56, 0.15);
}

.prose :deep(blockquote .mm-node),
.prose :deep(blockquote .mm-node *) {
  background: transparent !important;
}

.prose :deep(s) {
  opacity: 0.5;
}

.prose :deep(li[data-completed="true"] p),
.prose :deep(li[data-completed="true"] a),
.prose :deep(li[data-completed="true"] blockquote),
.prose :deep(li[data-completed="true"] img) {
  opacity: 0.5;
}

.prose :deep(li[data-has-children="true"] ul),
.prose :deep(li),
.prose :deep(blockquote) {
  position: relative
}

.prose :deep(blockquote) {
  margin-left: 0;
  padding-left: 28px;
}

.prose :deep(ul li ul) {
  margin: 0;
  padding-top: 9px;
}

.prose :deep(li[data-has-children="true"][data-level="0"] ul::before) {
  content: "";
  position: absolute;
  top: 0px;
  left: 25px;
  height: 100%;
  width: 1px;
  background-color: #dee0e3;
}

.prose :deep(li[data-has-children="true"] ul::before) {
  content: "";
  position: absolute;
  top: 10px;
  left: 25px;
  height: 100%;
  width: 1px;
  background-color: #dee0e3;
}

.prose :deep(li[data-level="0"][data-has-children="true"] > ul::before) {
  content: "";
  position: absolute;
  top: 0px;
  left: 25px;
  height: 100%;
  width: 1px;
  background-color: #dee0e3;
}

.prose :deep(li:not([data-level="0"])[data-has-children="true"] ul::before) {
  content: "";
  position: absolute;
  top: 0px;
  left: 25px;
  height: 100%;
  width: 1px;
  background-color: #dee0e3;
}

.prose :deep(li[data-has-children="true"][data-collapsed="false"]::before) {
  content: "";
  position: absolute;
  top: 22px;
  left: 32px;
  height: 60%;
  width: 1px;
  background-color: #dee0e3;
  display: none;
}

.prose :deep(li[data-has-children="true"][data-collapsed="false"] ul li[data-has-children="true"][data-collapsed="false"]::before) {
  content: "";
  position: absolute;
  top: 25px;
  left: 32px;
  height: 60%;
  width: 1px;
  background-color: #dee0e3;
  display: none;
}

.prose :deep(ul li ul li) {
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 5px;
  padding-bottom: 5px;
}

.prose :deep(li[data-has-children="true"][data-collapsed="false"][data-level="0"] > div.li-inner > div > blockquote::before) {
  content: "";
  position: absolute;
  top: -1px;
  bottom: 108px;
  left: 25px;
  width: 1px;
  height: 168%;
  background-color: #dee0e3;
}

.prose :deep(li[data-has-children="true"][data-collapsed="false"][data-level="0"] > div.li-inner > div > a.task-link::before) {
  content: "";
  position: absolute;
  top: 0px;
  left: 0px;
  width: 1px;
  height: 21px;
  background-color: #dee0e3;
}

.prose :deep(li[data-has-children="true"][data-collapsed="false"] ul li[data-has-children="true"][data-collapsed="false"] a.task-link::before) {
  content: "";
  position: absolute;
  top: 0px;
  left: 0px;
  width: 1px;
  height: 21px;
  background-color: #dee0e3;
}

.prose :deep(li[data-has-children="true"][data-collapsed="false"] ul li[data-has-children="true"][data-collapsed="false"] blockquote::before) {
  content: "";
  position: absolute;
  top: -1px;
  bottom: 108px;
  left: 25px;
  width: 1px;
  height: 168%;
  background-color: #dee0e3;
}

.prose :deep(li[data-has-children="true"][data-collapsed="false"] ul li[data-has-children="true"][data-collapsed="true"] blockquote::before) {
  content: "";
  position: absolute;
  top: -1px;
  bottom: 108px;
  left: 25px;
  width: 1px;
  height: 168%;
  background-color: #dee0e3;
  z-index: 10000;
}


.prose :deep(ul > li[data-has-children="false"]:last-child::before),
.prose :deep(ul > li[data-has-children="true"][data-collapsed="true"]:last-child::before) {
  content: none;
}

.prose :deep(ul:has(> li:nth-child(1)):not(:has(> li:nth-child(2))) > li:nth-child(1)::before) {
  content: none;
}

.prose :deep(ul:has(> li:nth-child(2)):not(:has(> li:nth-child(3))) > li:nth-child(2)::before) {
  content: none;
}

.prose :deep(ul li .image-wrapper) {
  position: relative;
  padding: 20px 0;
}

.prose :deep(ul li .image-wrapper::before) {
  content: "";
  position: absolute;
  top: 0;
  left: 25px;
  height: 100%;
  width: 1px;
  background-color: #dee0e3;
}

.prose :deep(ul li blockquote) {
  position: relative;
}

.prose :deep(img) {
  width: 400px;
  margin-left: 40px;
  margin-bottom: 0px;
  margin-top: 0;
  outline: none;
  max-height: 450px;
}

.prose :deep(img + img) {
  padding-top: 20px;
}

.prose :deep(.remote-node-indicator) {
  --remote-color: #3b82f6;
  color: var(--remote-color);
  background-color: var(--remote-color);
}

.prose :deep(.remote-node-indicator::after) {
  background: var(--remote-color);
}

.prose :deep(.remote-node-indicator) {
  width: 2px;
  height: 1.2em;
  border-radius: 1px;
  position: absolute;
  left: -3%;
  transform: translateX(-20%);
}

.prose :deep(.remote-node-indicator::after) {
  content: attr(data-user-name);
  position: absolute;
  top: -18px;
  right: 0;
  color: white;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(4px);
  transition: 0.15s ease;
}

.prose :deep(.remote-node-indicator:hover::after) {
  opacity: 1;
  transform: translateY(0);
}
</style>
