<template>
  <!-- Trigger -->
  <span ref="triggerRef" class="inline-flex items-center" @mouseenter="onEnter" @mouseleave="onLeave">
    <i :class="[
      hasLiked
        ? 'pi pi-thumbs-up-fill text-[#3B82F6]'
        : 'pi pi-thumbs-up text-gray-500 hover:text-[#3B82F6]',
      '!text-[12px] cursor-pointer transition'
    ]" @click.stop="onQuickLike" />
  </span>

  <!-- QUICK POPUP (vẫn Teleport vì là tooltip) -->
  <Teleport to="body">
    <transition name="fade-scale">
      <div v-if="open" ref="quickRef"
        class="fixed z-[9999] flex items-center gap-1 px-2 py-1 rounded-full bg-white border shadow select-none whitespace-nowrap"
        :style="quickStyle" @mouseenter="onEnter" @mouseleave="onLeave">
        <!-- quick emojis -->
        <span v-for="emoji in QUICK_REACTION_EMOJIS" :key="emoji"
          class="text-[16px] cursor-pointer hover:scale-125 transition" :class="props.isPending(props.commentId, emoji)
            ? 'opacity-40 pointer-events-none'
            : ''" @click.stop="onReact(emoji)">
          {{ emoji }}
        </span>

        <!-- NÚT MỞ POPOVER -->
        <button class="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-blue-500"
          @click.stop="onPickerClick">
          <SmilePlusIcon />
        </button>
      </div>
    </transition>
  </Teleport>

  <!-- FULL EMOJI PICKER (POPOVER) -->
  <Popover ref="pickerRef" class="z-[99999]">
    <div class="p-2 w-[260px] max-h-[300px] overflow-auto">
      <div v-for="group in EMOJI_GROUPS" :key="group.label" class="mb-2">
        <p class="text-xs text-gray-500 mb-1">{{ group.label }}</p>

        <div class="flex flex-wrap gap-1">
          <span v-for="emoji in group.emojis" :key="emoji" class="text-[20px] cursor-pointer hover:scale-125 transition"
            @click.stop="onReactAndClose(emoji)">
            {{ emoji }}
          </span>
        </div>
      </div>
    </div>
  </Popover>
</template>


<script setup>
import { ref, nextTick, onBeforeUnmount } from 'vue'
import { COMMENT_CONSTANTS } from './constants/commentConstants.js'
import SmilePlusIcon from './utils/SmilePlusIcon.vue'
import Popover from 'primevue/popover'
import { computed } from 'vue'

const hasLiked = computed(() =>
  props.hasUserReacted?.(props.commentId, '👍')
)


const { QUICK_REACTION_EMOJIS, EMOJI_GROUPS } = COMMENT_CONSTANTS

const props = defineProps({
  commentId: String,
  isPending: Function,
  hasUserReacted: Function,
})

const emit = defineEmits(['react'])

const triggerRef = ref(null)
const quickRef = ref(null)
const pickerRef = ref(null)

/* ============ ACTIONS ============ */
function onReact(emoji) {
  if (!props.isPending(props.commentId, emoji)) {
    emit('react', emoji)
  }
}

function onReactAndClose(emoji) {
  emit('react', emoji)
  pickerRef.value.hide()
}

function onQuickLike() {
  const emoji = '👍'

  // đang pending thì bỏ qua
  if (props.isPending(props.commentId, emoji)) return

  emit('react', emoji)
}


/* ============ QUICK POPUP (tooltip-like) ============ */
const open = ref(false)
const quickStyle = ref({})
let closeTimer = null

function onEnter() {
  if (closeTimer) clearTimeout(closeTimer)
  if (!open.value) {
    open.value = true
    nextTick(updateQuickPosition)
  }
}

function onLeave() {
  closeTimer = setTimeout(() => {
    open.value = false
  }, 120)
}

function updateQuickPosition() {
  const trigger = triggerRef.value
  const popup = quickRef.value
  if (!trigger || !popup) return

  const rect = trigger.getBoundingClientRect()
  quickStyle.value = {
    left: rect.left + rect.width / 2 - popup.offsetWidth / 2 + 'px',
    top: rect.top - popup.offsetHeight - 8 + 'px'
  }
}

/* ============ POPPER (POPOVER) ============ */
function onPickerClick(event) {
  // popover tự tính vị trí
  pickerRef.value.toggle(event)
}

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer)
})
</script>


<style scoped>
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
