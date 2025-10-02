<template>
  <!-- Overlay for mobile drawer -->
  <Transition name="overlay">
    <div
      v-if="entity && store.state.showInfo && isSmallScreen"
      class="fixed inset-0 z-40"
      @click="closeDrawer"
    ></div>
  </Transition>

  <!-- Desktop version - Information Panel / Mobile Drawer -->
  <Transition name="drawer">
    <div
      v-if="entity && store.state.showInfo"
      :class="[
        'overflow-y-auto h-[100vh] bg-white',
        isSmallScreen
          ? 'fixed top-0 right-0 w-[350px] z-50 border-l shadow-2xl'
          : 'xl:block border-l w-full max-w-[350px] min-w-[350px] shrink-0 transition-all duration-300 ease-in-out',
      ]"
    >
      <div class="h-full">
        <!-- Info Tab -->
        <InfoPanel
          v-if="tab === 0"
          :entity="entity"
          :users-permission="usersPermission"
          :is-small-screen="isSmallScreen"
          @close="closeDrawer"
        />

        <!-- Comments Tab -->
        <CommentsPanel
          v-if="entity.comment && tab === 1"
          :entity="entity"
          :is-small-screen="isSmallScreen"
          @close="closeDrawer"
        />

        <!-- Activity Tab -->
        <ActivityPanel
          v-if="entity.write && tab === 2"
          :entity="entity"
          :is-small-screen="isSmallScreen"
          @close="closeDrawer"
        />
      </div>
    </div>
  </Transition>
</template>

<script setup>
import emitter from "@/emitter"
import { userList } from "@/resources/permissions"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { useStore } from "vuex"
import ActivityPanel from "./ActivityPanel.vue"
import CommentsPanel from "./CommentsPanel.vue"
import InfoPanel from "./InfoPanel.vue"

const store = useStore()
const isSmallScreen = ref(false)
const refreshTrigger = ref(0)

const entity = computed(() => store.state.activeEntity)
const userId = computed(() => store.state.user.id)

const usersPermission = computed(() => {
  refreshTrigger.value
  if (userList.data?.length > 0) {
    return userList.data.filter((u) => u.user !== userId.value)
  }
  return []
})

const tab = computed(() => store.state.infoSidebarTab)

const checkScreenSize = () => {
  isSmallScreen.value = window.innerWidth < 1440
}

const closeDrawer = () => {
  store.commit("setShowInfo", false)
}

const handleKeyDown = (event) => {
  if (event.key === "Escape" && isSmallScreen.value && store.state.showInfo) {
    closeDrawer()
  }
}

onMounted(() => {
  checkScreenSize()
  window.addEventListener("resize", checkScreenSize)
  window.addEventListener("keydown", handleKeyDown)

  emitter.on("refreshUserList", () => {
    if (entity.value?.name) {
      refreshTrigger.value++
      userList.fetch({ entity: entity.value.name })
    }
  })
})

onUnmounted(() => {
  window.removeEventListener("resize", checkScreenSize)
  window.removeEventListener("keydown", handleKeyDown)
  emitter.off("refreshUserList")
})

watch(entity, (newEntity) => {
  if (
    newEntity &&
    typeof newEntity !== "number" &&
    typeof newEntity !== "undefined"
  ) {
    if (
      (!newEntity.write && tab.value === 2) ||
      (!newEntity.comment && tab.value === 1)
    ) {
      store.commit("setInfoSidebarTab", 0)
    }

    userList.fetch({ entity: newEntity.name })
  }
})
</script>