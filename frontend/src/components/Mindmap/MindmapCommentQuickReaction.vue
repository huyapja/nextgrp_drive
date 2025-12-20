<template>
  <div
    class="relative inline-flex items-center"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <!-- Trigger icon -->
    <i
      class="pi pi-thumbs-up !text-[12px] text-gray-500 hover:text-blue-500 cursor-pointer"
    />

    <!-- Quick reaction popup -->
    <transition name="fade-scale">
      <div
        v-if="open"
        class="
          absolute
          z-50
          -top-[30px]
          left-1/2
          -translate-x-1/2
          flex items-center gap-1
          px-2 py-1
          rounded-full
          bg-white
          border
          shadow
          select-none
        "
      >
        <span
          v-for="emoji in QUICK_REACTION_EMOJIS"
          :key="emoji"
          class="
            text-[16px]
            cursor-pointer
            leading-none
            transition-transform
            hover:scale-125
          "
          @click.stop="onReact(emoji)"
        >
          {{ emoji }}
        </span>
      </div>
    </transition>
  </div>
</template>


<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { COMMENT_CONSTANTS } from './constants/commentConstants.js'

const { QUICK_REACTION_EMOJIS } = COMMENT_CONSTANTS

const props = defineProps({
  commentId: String
})

const open = ref(false)
let closeTimer = null

function onEnter() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  open.value = true
}

function onLeave() {
  closeTimer = window.setTimeout(() => {
    open.value = false
  }, 120) // delay nhỏ để chuột di chuyển vào emoji
}

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer)
})

function onReact(emoji) {
  open.value = false

  // TODO: gọi API toggle reaction
  // toggleReaction(props.commentId, emoji)
}
</script>


<style scoped>
.fade-scale-enter-active,
.fade-scale-leave-active {
    transition: all 0.15s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
    opacity: 0;
    transform: scale(0.9);
}
</style>