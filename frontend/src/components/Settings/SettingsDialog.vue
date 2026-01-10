<template>
  <Dialog
    v-model="open"
    :options="{ title: 'Settings', size: '5xl' }"
  >
    <template #body>
      <div
        class="flex flex-col sm:flex-row"
        :style="{ height: isMobile ? '70vh' : '80vh' }"
      >
        <!-- Sidebar Desktop / Tabs Mobile -->
        <div
          class="flex shrink-0 flex-col bg-surface-menu-bar border-r sm:w-52 sm:py-3 sm:p-4"
        >
          <!-- Title - Desktop only -->
          <h1 class="hidden sm:block text-xl font-semibold leading-6 text-ink-gray-9 pr-2">
            {{ __("Settings") }}
          </h1>
          
          <!-- Tabs Mobile - Horizontal scroll -->
          <div class="sm:hidden flex overflow-x-auto px-3 py-2 gap-2 border-b no-scrollbar">
            <button
              v-for="tab in tabs"
              :key="tab.label"
              class="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 transition-all"
              :class="[
                activeTab?.label == tab.label
                  ? 'bg-surface-gray-4 text-ink-gray-9 font-medium'
                  : 'text-ink-gray-7 hover:bg-surface-gray-2',
              ]"
              @click="activeTab = tab"
            >
              <component
                :is="tab.icon"
                class="size-4 stroke-[1.5]"
              />
              <span class="text-sm">
                {{ __(tab.label) }}
              </span>
            </button>
          </div>
          
          <!-- Tabs Desktop - Vertical -->
          <div class="hidden sm:block mt-3 space-y-1">
            <button
              v-for="tab in tabs"
              :key="tab.label"
              class="flex h-7 w-full items-center gap-2 rounded-sm px-2 py-1"
              :class="[
                activeTab?.label == tab.label
                  ? 'bg-surface-gray-4'
                  : 'hover:bg-surface-gray-2',
              ]"
              @click="activeTab = tab"
            >
              <component
                :is="tab.icon"
                class="size-4 text-ink-gray-7 stroke-[1.5]"
              />
              <span class="text-base text-ink-gray-8">
                {{ __(tab.label) }}
              </span>
            </button>
          </div>
        </div>
        
        <!-- Content Area -->
        <div class="flex flex-1 flex-col px-4 py-4 sm:px-8 sm:py-6 overflow-y-auto">
          <component
            :is="activeTab.component"
            v-if="activeTab"
          />
        </div>
        
        <!-- Close Button -->
        <Button
          class="absolute top-3 right-3 sm:m-3"
          variant="ghost"
          @click="$emit('update:modelValue', false)"
        >
          <template #icon>
            <LucideX class="size-4" />
          </template>
        </Button>
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { Button, Dialog } from "frappe-ui"
import { computed, defineProps, markRaw, onMounted, onUnmounted, ref, watch } from "vue"
// Profile removed from Settings
import LucideCloudCog from "~icons/lucide/cloud-cog"
import LucideTag from "~icons/lucide/tag"
import LucideX from "~icons/lucide/x"
import StorageSettings from "./StorageSettings.vue"
// import LucideUser from "~icons/lucide/user"
import TagSettings from "./TagSettings.vue"

let tabs = [
  // {
  //   enabled: true,
  //   label: __("Profile"),
  //   icon: LucideUser,
  //   component: markRaw(ProfileSettings),
  // },
  // {
  //   enabled: true,
  //   label: __("Users"),
  //   icon: LucideUserPlus,
  //   component: markRaw(UserListSettings),
  // },
  {
    label: __("Storage"),
    icon: LucideCloudCog,
    component: markRaw(StorageSettings),
  },
  {
    label: __("Tags"),
    icon: LucideTag,
    component: markRaw(TagSettings),
  },
]

const emit = defineEmits(["update:modelValue"])
const props = defineProps({
  modelValue: Boolean,
  suggestedTab: Number,
})

// Responsive detection
const isMobile = ref(false)
const checkMobile = () => {
  isMobile.value = window.innerWidth < 640 // Tailwind sm breakpoint
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

// Mặc định luôn mở tab Storage (index 0)
let activeTab = ref(tabs[0])

const open = computed({
  get() {
    return props.modelValue
  },
  set(newValue) {
    emit("update:modelValue", newValue)
    // Reset về tab Storage khi đóng dialog
    if (!newValue) {
      activeTab.value = tabs[0]
    }
  },
})

watch(() => props.modelValue, (isOpen) => {
  if (isOpen && props.suggestedTab !== undefined && tabs[props.suggestedTab]) {
    activeTab.value = tabs[props.suggestedTab]
  }
})
</script>
<style scoped>
/* Hide scrollbar for mobile tabs */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
