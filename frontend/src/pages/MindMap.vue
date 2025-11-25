<!-- frontend/src/pages/MindMap.vue -->
<template>
  <div class="flex flex-col w-full">
    <Navbar
      v-if="!mindmap.error"
      :root-resource="mindmap"
    />
    <ErrorPage
      v-if="mindmap.error"
      :error="mindmap.error"
    />
    <LoadingIndicator
      v-else-if="!mindmap.data && mindmap.loading"
      :error="mindmap.error"
      class="w-10 h-full text-neutral-100 mx-auto"
    />
    <div v-if="mindmap.data" class="w-full relative">
      <!-- Status indicator -->
      <div class="absolute top-2 right-2 z-10 text-sm">
        <span v-if="isSaving" class="text-orange-500 flex items-center gap-1">
          <span class="animate-spin">⏳</span> Đang lưu...
        </span>
        <span v-else-if="lastSaved" class="text-green-500">
          Đã lưu lúc {{ lastSaved }}
        </span>
      </div>
      
      <div style="height: calc(100vh - 84px); width: 100%">
        <VueFlow 
          v-model="elements" 
          :default-zoom="1.5"
          :min-zoom="0.2"
          :max-zoom="4"
          @nodeContextMenu="onNodeContextMenu"
          @edgeContextMenu="onEdgeContextMenu"
        >
          <Background pattern-color="#aaa" :gap="16" />
          <Controls />
          <MiniMap />
        </VueFlow>
      </div>
    </div>
  </div>
</template>

<script setup>
import { setBreadCrumbs } from "@/utils/files"
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { VueFlow } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import { createResource } from "frappe-ui"
import { defineProps, inject, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useStore } from "vuex"

const store = useStore()
const route = useRoute()
const emitter = inject("emitter")

const props = defineProps({
  entityName: String,
  team: String,
})

// State cho auto-save
const isSaving = ref(false)
const lastSaved = ref(null)
let saveTimeout = null
const SAVE_DELAY = 3000 // 3 seconds

// Elements ref
const elements = ref([])

// Hàm format time
const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('vi-VN')
}

// API: Lấy mindmap data lần đầu
const mindmap = createResource({
  url: "drive.api.mindmap.get_mindmap_data",
  method: "GET",
  auto: true,
  params: {
    entity_name: props.entityName,
  },
  onSuccess(data) {
    console.log("✅ Mindmap data loaded:", data)
    
    window.document.title = data.title
    store.commit("setActiveEntity", data)
    
    // Parse mindmap_data nếu là JSON string
    if (data.mindmap_data) {
      try {
        const parsedData = typeof data.mindmap_data === 'string' 
          ? JSON.parse(data.mindmap_data) 
          : data.mindmap_data
        
        // Nếu có dữ liệu, load nó
        if (Array.isArray(parsedData) && parsedData.length > 0) {
          elements.value = parsedData
        }
        
        store.commit("setMindmapData", parsedData)
      } catch (e) {
        console.error("Error parsing mindmap data:", e)
      }
    }
    
    // Lưu tree structure vào store
    if (data.tree) {
      store.commit("setMindmapTree", data.tree)
    }
    
    // Set breadcrumbs
    setBreadCrumbs([
      { label: data.title, name: data.name }
    ], data.is_private, () => {
      emitter.emit("rename")
    })
  },
  onError(error) {
    console.error("Error loading mindmap:", error)
  }
})

// Resource để lưu mindmap data
const saveMindmapResource = createResource({
  url: "drive.api.mindmap.save_mindmap_data",
  method: "POST",
  onSuccess(response) {
    isSaving.value = false
    lastSaved.value = formatTime(new Date())
    console.log("✅ Mindmap saved:", response)
  },
  onError(error) {
    isSaving.value = false
    console.error("❌ Error saving mindmap:", error)
  }
})

// Watch elements để detect thay đổi
watch(elements, (newElements) => {
  // Chỉ auto-save nếu mindmap.data đã load
  if (!mindmap.data) return
  
  // Clear timeout trước đó
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  
  // Set timeout mới cho save
  saveTimeout = setTimeout(() => {
    isSaving.value = true
    saveMindmapResource.call({
      entity_name: props.entityName,
      mindmap_data: JSON.stringify(newElements)
    })
  }, SAVE_DELAY)
}, { deep: true })

// Handlers cho context menu (optional)
const onNodeContextMenu = (e) => {
  console.log("Node context menu:", e)
}

const onEdgeContextMenu = (e) => {
  console.log("Edge context menu:", e)
}

// Cleanup khi unmount
onBeforeUnmount(() => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    // Save last changes trước khi unmount
    if (mindmap.data && elements.value.length > 0) {
      saveMindmapResource.call({
        entity_name: props.entityName,
        mindmap_data: JSON.stringify(elements.value)
      })
    }
  }
})

onMounted(() => {
  // Lưu shared file info cho guest users
  if (!store.getters.isLoggedIn) {
    const sharedFileInfo = {
      team: props.team,
      entityName: props.entityName,
      entityType: "mindmap"
    }
    sessionStorage.setItem("sharedFileInfo", JSON.stringify(sharedFileInfo))
  }
})
</script>

<style scoped>
</style>