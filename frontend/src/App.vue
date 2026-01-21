<template>
  <div class="w-screen h-screen antialiased" dark>
    <!-- <div class="bg-surface-gray-7 text-ink-white text-sm text-center py-2 sm:hidden">
      Ứng dụng hoạt động tốt nhất trên máy tính để bàn.
    </div> -->

    <div v-if="isLoggedIn || $route.meta.allowGuest" class="flex gap-4">
      <Sidebar v-if="isLoggedIn && !['Teams', 'Setup'].includes($route.name)" class="hidden sm:block" />

      <div id="dropzone" class="flex flex-col h-screen flex-grow overflow-hidden bg-surface-white rounded-[8px]">
        <router-view :key="$route.fullPath" v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </div>

      <!-- ✅ FIX: Thêm class bottom-bar và đảm bảo z-index cao -->
      <BottomBar v-if="isLoggedIn"
        class="bottom-bar fixed bottom-0 left-0 right-0 w-full sm:hidden z-50 bg-surface-white border-t border-ink-gray-3" />
    </div>

    <router-view v-else :key="$route.fullPath" v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
  </div>

  <PrimeToast group="comment-history">
    <template #container="{ message, closeCallback }">
      <div class="flex flex-col gap-2 p-3">
        <div class="font-medium">
          {{ message.summary }}
        </div>

        <div class="text-sm text-gray-600">
          {{ message.detail }}
        </div>

        <button class="text-blue-600 text-sm font-medium self-start hover:underline" @click="() => {
          closeCallback()
          handleOpenHistoryFromToast(message.data)
        }">
          Xem bình luận
        </button>
      </div>
    </template>
  </PrimeToast>



  <!-- Rest of the template remains the same -->
  <SearchPopup v-if="isLoggedIn && showSearchPopup" v-model="showSearchPopup" />
  <SettingsDialog v-model="showSettings" :suggested-tab="suggestedTab" />
  <Transition enter-active-class="transition duration-[150ms] ease-[cubic-bezier(.21,1.02,.73,1)]"
    enter-from-class="translate-y-1 opacity-0" enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-[150ms] ease-[cubic-bezier(.21,1.02,.73,1)]"
    leave-from-class="translate-y-0 opacity-100" leave-to-class="translate-y-1 opacity-0">
    <UploadTracker v-if="showUploadTracker" />
  </Transition>
  <PinnedFileView />
  <Toasts />
</template>

<script setup>
import PinnedFileView from "@/components/PinnedFileView.vue"
import SettingsDialog from "@/components/Settings/SettingsDialog.vue"
import Sidebar from "@/components/Sidebar.vue"
import UploadTracker from "@/components/UploadTracker.vue"
import emitter from "@/emitter"
import { Toasts } from "@/utils/toasts.js"
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/minimap/dist/style.css'
import { onKeyDown } from "@vueuse/core"
import { computed, onMounted, onUnmounted, provide, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useStore } from "vuex"
import BottomBar from "./components/BottomBar.vue"
import SearchPopup from "./components/SearchPopup.vue"

const suppressAutoOpenFromQuery = ref(null)
const openHistoryByCommand = ref(null)

provide("suppressAutoOpenFromQuery", suppressAutoOpenFromQuery)
provide("openHistoryByCommand", openHistoryByCommand)

function handleOpenHistoryFromToast(data) {
  if (!openHistoryByCommand?.value) return

  openHistoryByCommand.value({
    node_id: data.node_id,
    session_index: data.session_index,
    comment_id: data.comment_id,
  })
}


const store = useStore()
const router = useRouter()
const route = useRoute()
const showSettings = ref(false)
const suggestedTab = ref(0)

onMounted(() => {
  emitter.on("showSettings", (tab = 0) => {
    suggestedTab.value = tab
    showSettings.value = true
  })
  
  // Listen for messages from parent window (MTP)
  window.addEventListener('message', handleParentMessage)
})

onUnmounted(() => {
  window.removeEventListener('message', handleParentMessage)
})

// Handle messages from parent window
function handleParentMessage(event) {
  // Validate origin for security
  const isLocalhost = event.origin.includes('localhost') || event.origin.includes('127.0.0.1')
  if (!isLocalhost && event.origin !== window.location.origin) {
    return
  }
  
  if (event.data && event.data.type === 'mtp:collapse_sidebar') {
    console.log('📥 [Drive App] Received collapse_sidebar message from parent')
    if (event.data.payload && event.data.payload.collapse) {
      // Set flag to prevent auto-expand
      sessionStorage.setItem('sidebar_collapsed_by_mtp', 'true')
      store.commit("setIsSidebarExpanded", false)
      console.log('✅ [Drive App] Sidebar collapsed and flag set')
    }
  } else if (event.data && event.data.type === 'mtp:file_unpinned') {
    console.log('📥 [Drive App] Received file_unpinned message from parent:', event.data.payload)
    if (event.data.payload && event.data.payload.fileName) {
      // Emit event để các component có thể listen và cập nhật
      emitter.emit('file_unpinned', event.data.payload.fileName)
    }
  } else if (event.data && event.data.type === 'mtp:file_pinned') {
    console.log('📥 [Drive App] Received file_pinned message from parent:', event.data.payload)
    if (event.data.payload && event.data.payload.fileName) {
      // Emit event để các component có thể listen và cập nhật
      emitter.emit('file_pinned', event.data.payload.fileName)
    }
  }
}

// Watch route changes và gửi message lên parent window (để clear active file trong sidebar)
watch(
  () => route.fullPath,
  (newPath) => {
    // Chỉ gửi message khi là iframe
    if (window.parent && window.parent !== window) {
      try {
        console.log('📡 [Drive App] Route changed:', {
          name: route.name,
          path: newPath
        });
        
        // Gửi message lên parent
        window.parent.postMessage(
          {
            type: 'drive:url_changed',
            payload: {
              pathname: newPath,
              title: document.title,
              routeName: route.name,
              search: window.location.search,
            }
          },
          '*'
        );
        
        console.log('✅ [Drive App] Sent drive:url_changed to parent');
      } catch (error) {
        console.warn('Cannot send route change to parent:', error);
      }
    }
  },
  { immediate: false }
)

  window.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        e.stopPropagation()
        window.parent.postMessage({ type: 'next_drive:mtp_open_search' }, '*')
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        window.parent.postMessage({ type: 'next_drive:mtp_open_quick_create' }, '*')
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.stopPropagation()
        window.parent.postMessage({ type: 'mtp_open_quick_create_task' }, '*')
      }      
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        e.stopPropagation()
        window.parent.postMessage({ type: 'next_drive:mtp_open_history' }, '*')
      }
    },
    true
  )


const showSearchPopup = ref(false)
const isLoggedIn = computed(() => store.getters.isLoggedIn)
const showUploadTracker = computed(
  () => isLoggedIn.value && store.state.uploads.length > 0
)
emitter.on("showSearchPopup", (data) => {
  showSearchPopup.value = data
})

// Add keyboard shortcuts
const KEY_BINDS = {
  k: () => (showSearchPopup.value = true),
  h: () => router.push({ name: "Home" }),
  i: () => router.push({ name: "Inbox" }),
  t: () => router.push({ name: "Team" }),
  f: () => router.push({ name: "Favourites" }),
  r: () => router.push({ name: "Recents" }),
  s: () => router.push({ name: "Shared" }),
  u: () => emitter.emit("uploadFile"),
  U: () => emitter.emit("uploadFolder"),
  u: () => emitter.emit("uploadFile"),
  N: () => emitter.emit("newFolder"), // Removed to prevent duplicate dialogs
  m: () => store.state.activeEntity && emitter.emit("move"),
  Enter: () => store.state.activeEntity && emitter.emit("rename"),
}
for (let k in KEY_BINDS) {
  onKeyDown(k, (e) => {
    if (e.ctrlKey) {
      KEY_BINDS[k](e)
      e.preventDefault()
    }
  })
}

onKeyDown((e) => {
  if (
    e.target.classList.contains("ProseMirror") ||
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA"
  )
    return
  if (e.key == "?") emitter.emit("toggleShortcuts")
  if (e.metaKey) {
    if (e.key == ",") {
      emitter.emit("showSettings")
      e.preventDefault()
    }
    if (e.shiftKey) {
      if (e.key == "ArrowRight") {
        store.commit("setIsSidebarExpanded", true)
        e.preventDefault()
      } else if (e.key == "ArrowLeft") {
        store.commit("setIsSidebarExpanded", false)
        e.preventDefault()
      }
    }
    // Support Cmd + K also
    if (e.key == "k") {
      showSearchPopup.value = true
      e.preventDefault()
    }
  }
})
</script>
