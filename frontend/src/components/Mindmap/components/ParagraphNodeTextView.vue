  <template>
    <NodeViewWrapper as="p" class="mm-node relative" :class="{ 'is-comment-hover': isHover || isActive }"
      @click="onClickNode">
      <div v-if="isMindmapParagraph" class="collapse-slot">
        <i v-if="liState?.hasChildren" class="collapse-toggle pi"
          :class="liState.collapsed ? 'pi-angle-right' : 'pi-angle-down'" v-tooltip.top="{
            value: liState.collapsed ? 'Mở rộng' : 'Thu gọn',
            pt: { text: { class: ['text-[12px]'] } }
          }" @mousedown.prevent @click.stop="toggleCollapse" />
      </div>

      <i v-if="isMindmapParagraph && canEditContent" class="mindmap-dot ml-1" v-tooltip.top="{
        value: 'Bấm hiển thị thêm hành động',
        pt: { text: { class: ['text-[12px]'] } }
      }" @mousedown.prevent @click.stop="toggleActions" />

      <i v-else-if="isMindmapParagraph" class="mindmap-dot ml-1" @mousedown.prevent />

      <Popover ref="actionsPopover" :dismissable="true" class="node-action-popover"
        :pt="{ root: { class: 'no-popover-arrow-by-hung right-align' } }">
        <div>
          <p class="!text-[14px] mb-2 text-[#646a73]">Kiểu</p>

          <div v-show="!isSelectionInBlockquote" class="color-grid flex gap-2">
            <button v-for="c in highlightColors" :key="c.value" class="color-item"
              :class="{ 'is-active': currentHighlight === c.bg }" :style="{ backgroundColor: c.bg }" @mousedown.prevent
              @click.stop="applyHighlight(c)">
              <span class="color-dot" :style="{ color: c.text }">A</span>
            </button>
          </div>

          <div class="flex gap-2 mt-4">
            <!-- Bold -->
            <button class="toolbar-btn" :class="{ 'is-active': isBoldActive }" @mousedown.prevent
              @click.stop="toggleBold" v-tooltip.top="{
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
              @click.stop="toggleItalic" v-tooltip.top="{
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
              @click.stop="toggleUnderline" v-tooltip.top="{
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
            <!-- <li>Thêm hình ảnh</li> -->
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
            <li @click.stop="
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
        <NodeViewContent :style="highlightBg ? { backgroundColor: highlightBg } : {}" />
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
import { ref, computed, inject, watchEffect, onMounted } from "vue"
import { NodeViewWrapper, NodeViewContent } from "@tiptap/vue-3"
import Popover from 'primevue/popover'
import { useNodeActionPopover } from './MindmapTextNodeViewEditor/useNodeActionPopover'
import { useNodeDone } from "./MindmapTextNodeViewEditor/useNodeDone"
import { useNodeBoldItaliceUnderline } from "./MindmapTextNodeViewEditor/useNodeBoldItaliceUnderline"

import { TextSelection } from "@tiptap/pm/state"
import { useNodeHighlight } from "./MindmapTextNodeViewEditor/useNodeHighlight"

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

const permissions = inject('editorPermissions')

const canEditContent = computed(() => {
  return permissions.value?.write === 1
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

function deleteNode(event) {
  const nodeId = resolveNodeIdFromDOM(event.currentTarget)
  if (!nodeId) return
  props.editor?.options?.onDeleteNode?.(nodeId)
}


function insertDescriptionBlockquote() {
  const editor = props.editor
  const getPos = props.getPos
  if (!editor || !getPos) return

  const pos = getPos()
  if (pos == null) return

  const { state, view } = editor
  const { schema } = state

  const blockquote = schema.nodes.blockquote
  const paragraph = schema.nodes.paragraph
  if (!blockquote || !paragraph) return

  const $pos = state.doc.resolve(pos)

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

  // ================================
  // 1️⃣ TÌM BLOCKQUOTE (NẾU CÓ)
  // ================================
  let blockquoteIndex = -1
  let blockquoteNode = null

  liNode.content.forEach((child, i) => {
    if (child.type.name === "blockquote") {
      blockquoteIndex = i
      blockquoteNode = child
    }
  })

  if (blockquoteIndex !== -1 && blockquoteNode) {
    const { doc } = state

    let blockquotePos = null

    // 1️⃣ Tìm position thật của blockquote trong document
    doc.nodesBetween(
      liStartPos,
      liStartPos + liNode.nodeSize,
      (node, pos) => {
        if (node === blockquoteNode) {
          blockquotePos = pos
          return false
        }
      }
    )

    if (blockquotePos == null) return

    // 2️⃣ Lấy paragraph con
    const paragraphNode = blockquoteNode.firstChild
    if (!paragraphNode) return

    // 3️⃣ paragraph bắt đầu ngay sau blockquotePos + 1
    const paragraphPos = blockquotePos + 1

    // 4️⃣ Focus cuối text thật sự
    const focusPos =
      paragraphPos + paragraphNode.nodeSize - 1

    // 🔒 SAFETY CHECK
    if (focusPos < 0 || focusPos > state.doc.content.size) {
      return
    }

    const tr = state.tr.setSelection(
      TextSelection.create(state.doc, focusPos)
    )

    tr.setMeta("ui-only", true)
    view.dispatch(tr)
    view.focus()
    return
  }


  // ================================
  // 3️⃣ CHƯA CÓ → INSERT BLOCKQUOTE
  // ================================
  const insertPos = liStartPos + liNode.nodeSize - 1

  const descNode = blockquote.create(
    {},
    paragraph.create()
  )

  let tr = state.tr.insert(insertPos, descNode)

  const $after = tr.doc.resolve(insertPos + 1)
  tr = tr.setSelection(
    TextSelection.near($after, 1)
  )

  tr.setMeta("ui-only", true)

  view.dispatch(tr)
  view.focus()
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


const actionsPopover = ref(null)
const { toggle } = useNodeActionPopover()

function toggleActions(event) {

  if (!canEditContent.value) {
    return
  }

  const editor = props.editor
  const getPos = props.getPos
  if (!editor || !getPos) return

  const pos = getPos()
  if (pos == null) return

  const { state, view } = editor
  const { selection } = state

  const endPos = pos + props.node.nodeSize - 1

  // ================================
  // ƯU TIÊN SELECTION (BÔI ĐEN)
  // ================================
  if (
    selection instanceof TextSelection &&
    !selection.empty
  ) {
  } else {
    // ================================
    // KHÔNG CÓ SELECTION → ĐƯA CARET VỀ CUỐI NODE
    // ================================
    const tr = state.tr.setSelection(
      TextSelection.create(state.doc, endPos)
    )
    tr.setMeta("ui-only", true)
    view.dispatch(tr)
  }

  // ================================
  // 3️⃣ TOGGLE ACTION POPOVER
  // ================================
  const nodeId = resolveNodeIdFromDOM(event.currentTarget)
  if (!nodeId) return

  toggle(nodeId, actionsPopover.value, event)
}

function closeActionsPopover() {
  actionsPopover.value?.hide?.()
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

/**
 * Click vào TEXT (mm-node)
 * - chỉ xử lý nếu node có comment (data-has-count="true")
 * - hành xử Y HỆT click icon
 */
function onClickNode(e) {
  if (!isMindmapParagraph.value) return

  const li = e.currentTarget.closest("li[data-node-id]")
  if (!li) return

  const hasCount = li.getAttribute("data-has-count") === "true"
  if (!hasCount) return

  suppressPanelAutoFocus && (suppressPanelAutoFocus.value = true)

  // KHÔNG focus editor
  openCommentFromEvent(e, { focus: false })
}

/**
 * Click vào COMMENT ICON
 * - luôn mở comment
 */
function onClickComment(e) {
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
</style>