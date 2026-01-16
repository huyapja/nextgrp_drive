<template>
  <NodeViewWrapper :data-node-id="node.attrs.nodeId" as="p" class="mm-node relative"
    :class="{ 'is-comment-hover': isHover || isActive }" @click="onClickNode">
    <div v-if="isMindmapParagraph" class="collapse-slot">
      <i v-if="liState?.hasChildren" class="collapse-toggle pi"
        :class="liState.collapsed ? 'pi-angle-right' : 'pi-angle-down'" v-tooltip.top="{
          value: liState.collapsed ? 'Mở rộng' : 'Thu gọn',
          pt: { text: { class: ['text-[12px]'] } }
        }" @mousedown.prevent @click.stop="toggleCollapse" />
    </div>

    <i v-if="isMindmapParagraph && canEditContent" class="mindmap-dot ml-1" data-drag-handle="true" draggable="false"
      @click.stop="toggleActions" v-tooltip.top="{
        value: 'Bấm hiển thị thêm hành động',
        pt: { text: { class: ['text-[12px]'] } }
      }" />

    <i v-else-if="isMindmapParagraph" class="mindmap-dot ml-1" @mousedown.prevent />

    <Popover ref="actionsPopover" :dismissable="true" class="node-action-popover"
      :pt="{ root: { class: 'no-popover-arrow-by-hung right-align' } }">
      <div>
        <p class="!text-[14px] mb-2 text-[#646a73]">Kiểu</p>

        <div v-show="!isSelectionInBlockquote" class="color-grid flex gap-2">
          <button v-for="c in highlightColors" :key="c.value" class="color-item"
            :class="{ 'is-active': currentHighlight === c.bg }" :style="{ backgroundColor: c.bg }" @mousedown.prevent
            @click.stop="applyHighlight(c); closeActionsPopover();">
            <span class="color-dot" :style="{ color: c.text }">A</span>
          </button>
        </div>

        <div class="flex gap-2 mt-4">
          <!-- Bold -->
          <button class="toolbar-btn" :class="{ 'is-active': isBoldActive }" @mousedown.prevent @click.stop="
            toggleBold();
          closeActionsPopover();
          " v-tooltip.top="{
            value: 'In đậm (Ctrl+B)',
            pt: { text: { class: ['text-[12px]'] } }
          }">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M5 2.709C5 2.317 5.317 2 5.709 2h6.734a5.317 5.317 0 0 1 3.686 9.148 5.671 5.671 0 0 1-2.623 10.7H5.71a.709.709 0 0 1-.71-.707V2.71Zm2 7.798h5.443a3.19 3.19 0 0 0 3.19-3.19c0-1.762-1.428-3.317-3.19-3.317H7v6.507Zm0 2.126v7.09h6.507a3.544 3.544 0 0 0 0-7.09H7Z"
                fill="currentColor"></path>
            </svg>
          </button>

          <!-- Italic -->
          <button class="toolbar-btn" :class="{ 'is-active': isItalicActive }" @mousedown.prevent
            @click.stop="toggleItalic(); closeActionsPopover();" v-tooltip.top="{
              value: 'In nghiêng (Ctrl+I)',
              pt: { text: { class: ['text-[12px]'] } }
            }">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M14.825 5.077 11.19 18.923h4.052a1.038 1.038 0 1 1 0 2.077H4.954a1.038 1.038 0 1 1 0-2.077h4.053l3.636-13.846H8.591A1.038 1.038 0 1 1 8.59 3h10.287a1.038 1.038 0 0 1 0 2.077h-4.053Z"
                fill="currentColor"></path>
            </svg>
          </button>

          <!-- Underline -->
          <button class="toolbar-btn" :class="{ 'is-active': isUnderlineActive }" @mousedown.prevent
            @click.stop="toggleUnderline(); closeActionsPopover();" v-tooltip.top="{
              value: 'Gạch chân (Ctrl+U)',
              pt: { text: { class: ['text-[12px]'] } }
            }">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M7.361 3.052a.99.99 0 0 0-.989-.994.998.998 0 0 0-.999.994v5.765c0 4.205 2.601 7.29 6.627 7.29s6.627-3.085 6.627-7.29V3.052a.996.996 0 0 0-.996-.994.992.992 0 0 0-.992.994v5.765c0 3.003-1.763 5.302-4.639 5.302-2.876 0-4.639-2.299-4.639-5.302V3.052ZM3.054 19.42a.988.988 0 0 0-.994.988 1 1 0 0 0 .994 1h17.892a1 1 0 0 0 .994-1.002.987.987 0 0 0-.994-.986H3.054Z"
                fill="currentColor"></path>
            </svg>
          </button>
        </div>
      </div>
      <div v-if="!isSelectionInBlockquote">
        <p class="!text-[14px] my-2 mt-3 text-[#646a73]">Thông thường</p>
        <ul class="more-actions !text-[14px]">
          <li @click.stop="
            insertDescriptionBlockquote();
          closeActionsPopover();
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M19.602 3.06a1.5 1.5 0 1 1 2.898.777l-.388 1.449-2.898-.776.388-1.45Zm-.774 2.888 2.898.777-3.897 14.543c-.076.285-.24.54-.468.727l-1.48 1.218a.17.17 0 0 1-.268-.073l-.65-1.798a1.394 1.394 0 0 1-.036-.835l3.901-14.559ZM3 3a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2H3Zm-1 9a1 1 0 0 1 1-1h9a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1Zm1 7a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H3Z"
                fill="currentColor"></path>
            </svg>
            Mô tả
          </li>
          <li @click.stop="
            toggleDone($event);
          closeActionsPopover();
          " :class="{ 'is-active': isDone }">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1.16-8.72 4.952-4.952a.996.996 0 0 1 1.409.005 1 1 0 0 1 .007 1.41c-1.888 1.905-3.752 3.842-5.685 5.7a.98.98 0 0 1-1.364-.001c-1.01-.98-1.993-1.992-2.983-2.993a1.003 1.003 0 0 1 .005-1.414.998.998 0 0 1 1.412-.002l2.247 2.247Z"
                fill="currentColor"></path>
            </svg>
            {{ isDone ? 'Kích hoạt' : 'Xong' }}
          </li>
          <li @click.stop="
            insertImages($event)
          closeActionsPopover();
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="m10.141 17.988-4.275-.01a.3.3 0 0 1-.212-.512l4.133-4.133a.4.4 0 0 1 .566 0l1.907 1.907 5.057-5.057a.4.4 0 0 1 .683.283V17.7a.3.3 0 0 1-.3.3h-7.476a.301.301 0 0 1-.083-.012ZM4 22c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2H4Zm0-2h16V4H4v16ZM6 6h3v3H6V6Z"
                fill="currentColor"></path>
            </svg>
            Thêm hình ảnh
          </li>
          <li @click.stop="
            copyLinkNode($event)
          closeActionsPopover();
          ">
            <svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Sao chép liên kết
          </li>
          <li v-if="!hasTaskLink" @click.stop="
            taskLinkNode($event)
          closeActionsPopover();
          ">
            <svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Liên kết công việc từ nhánh
          </li>

          <li v-else @click.stop="
            unlinkTaskNode($event)
          closeActionsPopover();
          ">
            <svg class="menu-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Xóa liên kết công việc
          </li>

          <li class="text-[#dc2626] delete-node" @click.stop="
            deleteNode($event)
          closeActionsPopover();
          ">
            <svg class="menu-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Xóa nhánh
          </li>
        </ul>
      </div>
    </Popover>




    <div class="ml-2">
      <NodeViewContent />
    </div>

    <div v-if="isMindmapParagraph" class="comment-icon" v-tooltip.bottom="{
      value: 'Nhận xét',
      pt: { text: '!text-[12px]' }
    }" @click.stop="onClickComment" @mousedown.prevent.stop>
      <svg @mouseenter="isHover = true" @mouseleave="isHover = false" fill="#2563eb" width="20" height="20"
        viewBox="0 0 32 32">
        <path
          d="M25.785 4.952h-19.57c-1.235 0-2.236 1.002-2.236 2.236v12.488c 0 1.234 1.001 2.236 2.236 2.236h3.729l0.001 5.137 5.704-5.137h10.137c 1.236 0 2.236-1.002 2.236-2.236v-12.488c-0.001-1.234-1.001-2.236-2.237-2.236z" />
      </svg>
    </div>
  </NodeViewWrapper>
</template>

<script setup>
import { ref, computed, inject, watchEffect, watch, nextTick } from "vue"
import { NodeViewWrapper, NodeViewContent } from "@tiptap/vue-3"
import Popover from 'primevue/popover'
import { useNodeDone } from "./MindmapTextNodeViewEditor/useNodeDone"
import { useNodeBoldItaliceUnderline } from "./MindmapTextNodeViewEditor/useNodeBoldItaliceUnderline"

import { TextSelection } from "@tiptap/pm/state"
import { useNodeHighlight } from "./MindmapTextNodeViewEditor/useNodeHighlight"
import { toast } from '@/utils/toasts'


const props = defineProps({
  editor: Object,
  node: Object,
  getPos: Function,
})

const isHover = ref(false)
const isActive = ref(false)
const suppressPanelAutoFocus = inject(
  "suppressPanelAutoFocus",
  null
)
const actionsPopover = ref(null)
const currentActionNode = ref(null)

const permissions = inject('editorPermissions')

const getEditingUserOfNode = inject("getEditingUserOfNode")

const activeActionNodeId = inject("activeActionNodeId")

watch(activeActionNodeId, (newId) => {
  const selfId = resolveNodeIdFromDOM(null)

  // Nếu popover này KHÔNG phải node đang active → đóng
  if (newId !== selfId) {
    actionsPopover.value?.hide()
  }
})

const canEditContent = computed(() => {
  return permissions.value?.write === 1
})

const hasTaskLink = computed(() => {
  return !!currentActionNode.value?.taskId
})

const {
  isBoldActive,
  isItalicActive,
  isUnderlineActive,
  toggleBold,
  toggleItalic,
  toggleUnderline,
} = useNodeBoldItaliceUnderline({
  editor: props.editor,
  node: props.node,
  getPos: props.getPos,
})

const { isDone, toggleDone } = useNodeDone({
  editor: props.editor,
  node: props.node,
  getPos: props.getPos,
  onDoneNode: props.editor?.options?.onDoneNode,
  resolveNodeIdFromDOM,
  currentActionNode,
})

const {
  highlightColors,
  currentHighlight,
  highlightBg,
  applyHighlight,
} = useNodeHighlight({
  editor: props.editor,
  node: props.node,
  getPos: props.getPos,
})

function insertImages(event) {
  const nodeId = resolveNodeIdFromDOM(event.currentTarget)
  if (!nodeId) return
  props.editor?.options?.onInsertImages?.(nodeId)
}

function copyLinkNode(event) {
  const nodeId = resolveNodeIdFromDOM(event.currentTarget)
  if (!nodeId) return
  props.editor?.options?.onCopyLinkNode?.(nodeId)
}

function taskLinkNode(event) {
  const nodeId = resolveNodeIdFromDOM(event.currentTarget)
  if (!nodeId) return
  props.editor?.options?.onTaskLinkNode?.(nodeId)
}

function unlinkTaskNode(event) {
  const nodeId = resolveNodeIdFromDOM(event.currentTarget)
  if (!nodeId) return
  props.editor?.options?.onUnlinkTaskNode?.(nodeId)
}

function deleteNode(event) {
  const nodeId = resolveNodeIdFromDOM(event.currentTarget)
  if (!nodeId) return
  props.editor?.options?.onDeleteNode?.(nodeId)
}

function scrollToSelection(editor) {
  const { node } = editor.view.domAtPos(editor.state.selection.anchor)
  if (node instanceof Element) {
    node.scrollIntoView({ behavior: "auto" })
  }
}

// function onDragHandleMouseDown(e) {
//   const dot = e.currentTarget
//   dot.setAttribute("draggable", "true")
// }

// function onDragHandleMouseUp(e) {
//   const dot = e.currentTarget
//   dot.removeAttribute("draggable")
// }


function insertDescriptionBlockquote() {
  const editor = props.editor
  const getPos = props.getPos
  if (!editor || !getPos) return

  const pos = getPos()
  if (pos == null) return

  const { state, view } = editor
  const { schema } = state
  const { blockquote, paragraph, bulletList, orderedList } = schema.nodes

  if (!blockquote || !paragraph) return

  const $pos = state.doc.resolve(pos)

  // 1️⃣ tìm listItem
  let liDepth = null
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === "listItem") {
      liDepth = d
      break
    }
  }
  if (!liDepth) return

  const liNode = $pos.node(liDepth)
  const liStartPos = $pos.before(liDepth)

  // 2️⃣ duyệt content listItem để:
  let offset = 0
  let blockquoteOffset = null
  let insertOffset = 0

  liNode.content.forEach(child => {
    if (
      blockquoteOffset == null &&
      child.type === blockquote
    ) {
      blockquoteOffset = offset
    }

    if (
      insertOffset === offset &&
      (child.type === bulletList || child.type === orderedList)
    ) {
      // dừng trước nested list
      return
    }

    offset += child.nodeSize
    insertOffset = offset
  })

  // 3️⃣ ĐÃ CÓ BLOCKQUOTE → FOCUS
  if (blockquoteOffset != null) {
    const blockquotePos = liStartPos + 1 + blockquoteOffset

    let blockquoteNode = null
    liNode.content.forEach(child => {
      if (child.type === blockquote && !blockquoteNode) {
        blockquoteNode = child
      }
    })

    const para = blockquoteNode?.firstChild
    if (!para) return

    const focusPos =
      blockquotePos + 1 + para.nodeSize - 1

    const tr = state.tr
      .setSelection(TextSelection.create(state.doc, focusPos))
      .scrollIntoView()

    tr.setMeta("ui-only", true)
    view.dispatch(tr)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToSelection(editor)
        view.focus()
      })
    })
    return
  }

  const insertPos = liStartPos + 1 + insertOffset

  let tr = state.tr.insert(
    insertPos,
    blockquote.create({}, paragraph.create())
  )

  tr = tr
    .setSelection(
      TextSelection.near(tr.doc.resolve(insertPos + 2), 1)
    )
    .scrollIntoView()

  tr.setMeta("ui-only", true)
  view.dispatch(tr)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollToSelection(editor)
      view.focus()
    })
  })
}

const isSelectionInBlockquote = computed(() => {
  const editor = props.editor
  if (!editor) return false

  const { selection } = editor.state

  if (selection.empty) return false

  const { $from, $to } = selection

  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "blockquote") {
      return true
    }
  }

  for (let d = $to.depth; d > 0; d--) {
    if ($to.node(d).type.name === "blockquote") {
      return true
    }
  }

  return false
})

function toggleActions(event) {
  if (!canEditContent.value) return

  const editor = props.editor
  const getPos = props.getPos
  if (!editor || !getPos) return

  const nodeId = resolveNodeIdFromDOM(event.currentTarget)
  if (!nodeId) return

  // ==============================
  // 🔒 REMOTE LOCK → TOAST + BLOCK
  // ==============================
  const editingUser = getEditingUserOfNode?.(nodeId)
  if (editingUser) {
    // ⚠️ FIX: Chỉ hiển thị toast 1 lần mỗi 2 giây để tránh spam
    const now = Date.now()
    if (!window.__lastEditingToast) {
      window.__lastEditingToast = {}
    }
    const lastToast = window.__lastEditingToast[nodeId] || 0
    if (now - lastToast > 2000) {
      window.__lastEditingToast[nodeId] = now
      toast({
        title: `${editingUser.userName} đang chỉnh sửa node này`,
        text: "Vui lòng đợi họ hoàn thành",
        indicator: "orange",
        timeout: 3,
      })
    }
    return
  }

  // ==============================
  // ⬇️ PHẦN CŨ – GIỮ NGUYÊN
  // ==============================
  const pos = getPos()
  if (pos == null) return

  const { state, view } = editor
  const { selection } = state

  try {
    const $pos = state.doc.resolve(pos)
    for (let d = $pos.depth; d > 0; d--) {
      const n = $pos.node(d)
      if (n.type.name === "listItem") {
        currentActionNode.value = {
          nodeId,
          completed: !!n.attrs.completed,
          taskId: n.attrs.taskId,
          taskMode: n.attrs.taskMode,
          taskStatus: n.attrs.taskStatus,
        }
        break
      }
    }
  } catch { }

  const isTextSelection =
    selection instanceof TextSelection &&
    !selection.empty

  if (!isTextSelection) {
    const endPos = pos + props.node.nodeSize - 1

    if (endPos > 0 && endPos <= state.doc.content.size) {
      const tr = state.tr.setSelection(
        TextSelection.create(state.doc, endPos)
      )
      tr.setMeta("ui-only", true)
      view.dispatch(tr)
    }
  }

  const popover = actionsPopover.value
  if (!popover) return

  const selfNodeId = nodeId

  if (activeActionNodeId.value === selfNodeId) {
    activeActionNodeId.value = null
    popover.hide()
    return
  }

  activeActionNodeId.value = selfNodeId
  nextTick(() => {
    popover.show(event)
  })

}



function closeActionsPopover() {
  if (!actionsPopover.value) return
  actionsPopover.value.hide()
  activeActionNodeId.value = null
}


const liState = computed(() => {
  try {
    const pos = props.getPos?.()
    if (pos == null) return null

    const $pos = props.editor.state.doc.resolve(pos)

    for (let d = $pos.depth; d > 0; d--) {
      const node = $pos.node(d)
      if (node.type.name === "listItem") {
        return {
          depth: d,
          hasChildren: !!node.attrs.hasChildren,
          collapsed: !!node.attrs.collapsed,
        }
      }
    }

    return null
  } catch {
    return null
  }
})


function toggleCollapse() {
  const info = liState.value
  if (!info) return

  props.editor
    .chain()
    .command(({ tr, state }) => {
      const pos = props.getPos?.()
      if (pos == null) return false

      const $pos = state.doc.resolve(pos)
      const liNode = $pos.node(info.depth)

      tr.setNodeMarkup($pos.before(info.depth), undefined, {
        ...liNode.attrs,
        collapsed: !liNode.attrs.collapsed,
      })

      // thay đổi UI, KHÔNG sync
      tr.setMeta("ui-only", true)

      return true
    })
    .run()
}


/**
 * Paragraph này có phải là paragraph TRỰC TIẾP của list-item không?
 * Nếu không → KHÔNG render icon (giữ nguyên logic cũ)
 */
const isMindmapParagraph = computed(() => {
  try {
    const pos = props.getPos?.()
    if (pos == null) return false
    const $pos = props.editor.state.doc.resolve(pos)
    return $pos.parent.type.name === "listItem"
  } catch {
    return false
  }
})

/**
 * Flow CỐ ĐỊNH (theo yêu cầu):
 * - luôn lấy nodeId bằng closest li[data-node-id]
 * - ưu tiên nodeViewRoot
 * - fallback: event.currentTarget
 */
function resolveNodeIdFromDOM(fallbackEl) {
  const rootEl = props.editor?.view?.nodeDOM?.(props.getPos?.())
  const baseEl = rootEl || fallbackEl
  if (!baseEl) return null

  const li = baseEl.closest?.("li[data-node-id]")
  return li?.getAttribute("data-node-id") || null
}

/**
 * HÀM DUY NHẤT mở comment
 * → dùng cho cả click text & click icon
 */
function openCommentFromEvent(e, options = {}) {
  if (!isMindmapParagraph.value) return

  const nodeId = resolveNodeIdFromDOM(e.currentTarget)
  if (!nodeId) return

  props.editor?.options?.onOpenComment?.(nodeId, options)
}

function clearAllClickedNodes() {
  const clicked = document.querySelectorAll(
    'li[data-is-clicked="true"]'
  )

  if (!clicked.length) return

  clicked.forEach(li => {
    li.removeAttribute("data-is-clicked")
    li.querySelectorAll(".is-comment-hover").forEach(el => {
      el.classList.remove("is-comment-hover")
    })
  })
}


/**
 * Click vào TEXT (mm-node)
 * - chỉ xử lý nếu node có comment (data-has-count="true")
 * - hành xử Y HỆT click icon
 */
function onClickNode(e) {

  closeActionsPopover()
  if (!isMindmapParagraph.value) return

  const li = e.currentTarget.closest("li[data-node-id]")
  if (!li) return

  const nodeId = li.getAttribute("data-node-id")
  if (!nodeId) return

  const alreadyClicked = li.getAttribute("data-is-clicked") === "true"

  if (!alreadyClicked) {
    clearAllClickedNodes()

    li.setAttribute("data-is-clicked", "true")
  }

  const hasCount = li.getAttribute("data-has-count") === "true"
  if (!hasCount) return

  suppressPanelAutoFocus && (suppressPanelAutoFocus.value = true)
  openCommentFromEvent(e, { focus: false })
}




/**
 * Click vào COMMENT ICON
 * - luôn mở comment
 */
function onClickComment(e) {
  const li = e.currentTarget.closest('li[data-node-id]')
  if (!li) return

  const alreadyClicked = li.getAttribute("data-is-clicked") === "true"

  // ✅ nếu đang clicked rồi -> KHÔNG clear (không toggle off)
  if (!alreadyClicked) {
    clearAllClickedNodes()
    li.setAttribute("data-is-clicked", "true")
  }

  closeActionsPopover()
  suppressPanelAutoFocus && (suppressPanelAutoFocus.value = false)
  openCommentFromEvent(e, { focus: true })
}

/**
 * Sync ACTIVE từ activeCommentNode (nguồn sự thật DUY NHẤT)
 */
const activeCommentNode = inject("activeCommentNode")

watchEffect(() => {
  const activeId = activeCommentNode?.value?.id

  // nếu chưa có active comment → không can thiệp
  if (!activeId) return

  // không phải paragraph hợp lệ
  if (!isMindmapParagraph.value) {
    isActive.value = false
    return
  }

  const selfId = resolveNodeIdFromDOM(null)
  if (!selfId) {
    isActive.value = false
    return
  }

  isActive.value = selfId === activeId
})

watch(
  currentActionNode,
  (val) => {
    if (!val) {
      // popover đóng hoặc reset
      return
    }

    // console.log("[ActionNode]", {
    //   nodeId: val.nodeId,
    //   completed: val.completed,
    //   taskId: val.taskId,
    //   taskMode: val.taskMode,
    //   taskStatus: val.taskStatus,
    // })
  },
  { deep: true }
)

</script>


<style scoped>
.color-item {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.color-item.is-active {
  outline: 1px solid #111827;
}

.more-actions li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
}

ul.more-actions li:hover {
  background: #eff6ff;
  color: #2563EB;
}

ul.more-actions li.delete-node:hover {
  background: #fef2f2;
  color: #dc2626
}

.toolbar-btn.is-active {
  border-radius: 4px;
  transition: background-color .1s ease;
  background-color: rgba(51, 109, 244, 0.1);
}

.toolbar-btn.is-active svg,
.toolbar-btn.is-active svg path {
  fill: #336df4;
}
</style>