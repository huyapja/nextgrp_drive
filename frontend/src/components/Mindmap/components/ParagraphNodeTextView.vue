<template>
  <NodeViewWrapper as="p" class="mm-node relative" :class="{ 'is-comment-hover': isHover || isActive }"
    @click="onClickNode">
    <span v-if="isMindmapParagraph" class="collapse-slot">
      <span v-if="liState?.hasChildren" class="collapse-toggle" @mousedown.prevent @click.stop="toggleCollapse">
        {{ liState.collapsed ? "▶" : "▼" }}
      </span>
    </span>

    <NodeViewContent />

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
import { ref, computed, inject, watchEffect } from "vue"
import { NodeViewWrapper, NodeViewContent } from "@tiptap/vue-3"

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


function toggleCollapse(e) {
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
</script>
