<template>
  <Transition name="slide-in">
    <div
      v-if="showPinnedSidebar && currentPinnedFile"
      class="fixed inset-0 z-40 bg-white"
      :style="{ left: sidebarWidth }"
    >
      <!-- File Playground -->
      <FilePlayground />
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'
import { useStore } from 'vuex'
import FilePlayground from './FilePlayground.vue'

const store = useStore()

const showPinnedSidebar = computed(() => store.state.showPinnedSidebar)
const currentPinnedFile = computed(() => store.state.currentPinnedFile)

// Calculate sidebar width based on expansion state
const sidebarWidth = computed(() => {
  return store.state.IsSidebarExpanded ? '260px' : '60px'
})
</script>

<style scoped>
/* Slide in animation */
.slide-in-enter-active {
  transition: all 0.3s ease-out;
}

.slide-in-leave-active {
  transition: all 0.25s ease-in;
}

.slide-in-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-in-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>

