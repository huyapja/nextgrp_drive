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

      <i v-if="isMindmapParagraph" class="mindmap-dot ml-1" v-tooltip.top="{
        value: 'Bấm hiển thị thêm hành động',
        pt: { text: { class: ['text-[12px]'] } }
      }" @mousedown.prevent @click.stop="toggleActions" />

      <Popover ref="actionsPopover" :dismissable="true" class="node-action-popover" @mousedown.prevent @click.stop
        :pt="{ root: { class: 'no-popover-arrow-by-hung right-align' } }">
        <p class="!text-[12px] mb-2">Kiểu</p>

        <div class="color-grid flex gap-2">
          <button v-for="c in highlightColors" :key="c.value" class="color-item"
            :class="{ 'is-active': currentHighlight === c.bg }" :style="{ backgroundColor: c.bg }" @mousedown.prevent
            @click.stop="applyHighlight(c)">
            <span class="color-dot" :style="{ color: c.text }">A</span>
          </button>
        </div>

        <div class="flex gap-2 mt-4">
          <!-- Bold -->
          <button class="toolbar-btn" :class="{ 'is-active': isBoldActive }" @mousedown.prevent @click.stop="toggleBold"
            v-tooltip.top="{
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
          <button class="toolbar-btn" :class="{ 'is-active': isItalicActive }" @mousedown.prevent @click.stop="toggleItalic" v-tooltip.top="{
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
          <button class="toolbar-btn" :class="{ 'is-active': isUnderlineActive }" @mousedown.prevent @click.stop="toggleUnderline" v-tooltip.top="{
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
import { TextSelection } from "@tiptap/pm/state"



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

const isBoldActive = computed(() => {
  return props.editor?.isActive("bold")
})

const isItalicActive = computed(() => {
  return props.editor?.isActive("italic")
})

const isUnderlineActive = computed(() => {
  return props.editor?.isActive("underline")
})

function toggleMarkForWholeNode(editor, node, getPos, markName) {
  const pos = getPos?.()
  if (pos == null) return

  const { state, view } = editor
  const { schema, tr } = state

  const markType = schema.marks[markName]
  if (!markType) return

  const from = pos + 1
  const to = pos + node.nodeSize - 1

  let hasMark = false
  state.doc.nodesBetween(from, to, node => {
    if (markType.isInSet(node.marks)) {
      hasMark = true
    }
  })

  if (hasMark) {
    tr.removeMark(from, to, markType)
  } else {
    tr.addMark(from, to, markType.create())
  }

  view.dispatch(tr)
}


function toggleBold() {
  const editor = props.editor
  if (!editor) return

  const { selection } = editor.state

  if (!selection.empty) {
    editor.chain().focus().toggleBold().run()
    return
  }

  toggleMarkForWholeNode(
    editor,
    props.node,
    props.getPos,
    "bold"
  )
}


function toggleItalic() {
  const editor = props.editor
  if (!editor) return

  const { selection } = editor.state

  if (!selection.empty) {
    editor.chain().focus().toggleItalic().run()
    return
  }
  
  toggleMarkForWholeNode(
    editor,
    props.node,
    props.getPos,
    "italic"
  )
}

function toggleUnderline() {
  const editor = props.editor
  if (!editor) return

  const { selection } = editor.state

  if (!selection.empty) {
    editor.chain().focus().toggleUnderline().run()
    return
  }
  
  toggleMarkForWholeNode(
    editor,
    props.node,
    props.getPos,
    "underline"
  )
}


function normalizeColor(color) {
  if (!color) return null

  // rgb(...) → hex
  if (color.startsWith("rgb")) {
    const nums = color.match(/\d+/g)
    if (!nums || nums.length < 3) return null
    return (
      "#" +
      nums
        .slice(0, 3)
        .map(n => Number(n).toString(16).padStart(2, "0"))
        .join("")
    ).toLowerCase()
  }

  // hex → lower
  if (color.startsWith("#")) {
    return color.toLowerCase()
  }

  return color.toLowerCase()
}

function getHighlightFromDOM(editor, pos) {
  const dom = editor?.view?.nodeDOM?.(pos)
  if (!dom || typeof dom.querySelector !== 'function') return null

  const inlineSpan = dom.querySelector(
    "span[data-inline-root] > span"
  )
  if (!inlineSpan) return null

  const bg = window.getComputedStyle(inlineSpan).backgroundColor
  const normalized = normalizeColor(bg)

  return normalized
}

const currentHighlight = computed(() => {
  const pos = props.getPos?.()
  if (pos == null) return null

  const state = props.editor.state
  const $pos = state.doc.resolve(pos)

  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.type.name === "listItem") {
      return normalizeColor(node.attrs.highlight)
    }
  }

  return null
})



const highlightColors = [
  { value: 'pink', label: 'Hồng', bg: '#fce7f3', text: '#ec4899' },
  { value: 'yellow', label: 'Vàng', bg: '#fef3c7', text: '#f59e0b' },
  { value: 'purple', label: 'Tím', bg: '#f3e8ff', text: '#a855f7' },
  { value: 'blue', label: 'Xanh dương', bg: '#dbeafe', text: '#3b82f6' },
  { value: 'teal', label: 'Xanh ngọc', bg: '#ccfbf1', text: '#14b8a6' },
  { value: 'green', label: 'Xanh lá', bg: '#d1fae5', text: '#10b981' },
  { value: 'grey', label: 'Xám', bg: '#d1d5db', text: '#374151' }
]

function applyHighlight(color) {
  const rootEl = props.editor?.view?.nodeDOM?.(props.getPos?.())
  if (!rootEl || typeof rootEl.closest !== 'function') return

  const mmNode = rootEl.closest("p.mm-node")
  if (!mmNode || typeof mmNode.querySelector !== 'function') return

  const li = mmNode.closest("li[data-node-id]")
  if (!li) return

  const inlineRoot = mmNode.querySelector("span[data-inline-root='true']")
  if (!inlineRoot || typeof inlineRoot.querySelector !== 'function') return

  let innerSpan = inlineRoot.querySelector("span")

  const pos = props.getPos?.()
  if (pos == null) return

  const currentBg = normalizeColor(
    getHighlightFromDOM(props.editor, pos)
  )

  const isSame = currentBg === normalizeColor(color.bg)

  props.editor
    .chain()
    .command(({ tr, state }) => {
      const $pos = state.doc.resolve(pos)

      for (let d = $pos.depth; d > 0; d--) {
        const node = $pos.node(d)
        if (node.type.name === "listItem") {
          const nodePos = $pos.before(d)
          const next = isSame ? null : color.bg

          tr.setNodeMarkup(nodePos, undefined, {
            ...node.attrs,
            highlight: next,
          })

          tr.setMeta("ui-only", true)
          return true
        }
      }
      return false
    })
    .run()

  if (isSame) {
    if (innerSpan) {
      innerSpan.style.backgroundColor = ""
      if (!innerSpan.getAttribute("style")) {
        innerSpan.replaceWith(...innerSpan.childNodes)
      }
    }

    li.removeAttribute("data-highlight")
  } else {
    if (!innerSpan) {
      innerSpan = document.createElement("span")
      while (inlineRoot.firstChild) {
        innerSpan.appendChild(inlineRoot.firstChild)
      }
      inlineRoot.appendChild(innerSpan)
    }

    innerSpan.style.backgroundColor = color.bg

    li.setAttribute("data-highlight", color.bg)
  }

  props.editor?.options?.syncFromEditorDebounced?.(props.editor)
}




const highlightBg = computed(() => {
  const pos = props.getPos?.()
  if (pos == null) return null

  const state = props.editor.state
  const $pos = state.doc.resolve(pos)

  let highlight = null

  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.type.name === "listItem") {
      highlight = node.attrs.highlight || null
      break
    }
  }

  // nếu content đã có inline background → KHÔNG render bg ở NodeView
  const dom = props.editor?.view?.nodeDOM?.(pos)
  if (dom && typeof dom.querySelector === 'function') {
    const hasInlineBg = dom.querySelector(
      "span[style*='background-color']"
    )
    if (hasInlineBg) return null
  }

  return highlight
})

const actionsPopover = ref(null)
const { toggle } = useNodeActionPopover()

function toggleActions(event) {
  const nodeId = resolveNodeIdFromDOM(event.currentTarget)
  if (!nodeId) return

  toggle(nodeId, actionsPopover.value, event)
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

onMounted(() => {
  const pos = props.getPos?.()
  if (pos == null) return

  const editor = props.editor
  const domBg = normalizeColor(
    getHighlightFromDOM(editor, pos)
  )
  if (!domBg) return

  const state = editor.state
  const $pos = state.doc.resolve(pos)

  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.type.name === "listItem") {
      if (!node.attrs.highlight) {
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup($pos.before(d), undefined, {
              ...node.attrs,
              highlight: domBg,
            })
            tr.setMeta("ui-only", true)
            return true
          })
          .run()
      }
      break
    }
  }
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
</style>