<template>
  <!-- Drawer overlay khi màn hình nhỏ hơn 1500px -->
  <transition name="fade">
    <div 
      v-if="isDrawer && visible" 
      class="fixed inset-0 bg-transparent z-40"
      @click="handleClose"
    />
  </transition>

  <transition name="slide">
    <div
      v-if="!isDrawer || (isDrawer && visible)"
      class="bg-white border-l border-gray-200 h-[100vh] flex flex-col min-w-[276px] max-w-[276px] py-5 px-4 z-50 overflow-y-auto"
      :class="isDrawer ? 'fixed right-0 top-0 min-w-[276px] max-w-[276px] h-full shadow-lg' : ''"
    >
      <!-- Header -->
      <div
        ref="headerRef"
        :class="[
          'flex justify-between flex-wrap gap-4',
          isNarrow ? 'flex-col-reverse items-end' : 'flex-row items-start'
        ]"
      >
        <div :class="isNarrow ? 'w-full' : ''">
          <h3 class="text-[16px] font-bold text-gray-900">Thành viên</h3>
        </div>
        <div class="flex flex-row items-center gap-2">
          <LucideCirclePlus 
            @click="showAddMemberModal = true" 
            stroke="#737373" 
            class="h-5 w-5 cursor-pointer hover:stroke-gray-600 transition-colors" 
          />
          <X 
            @click="handleClose" 
            stroke="#737373" 
            class="h-5 w-5 cursor-pointer hover:stroke-gray-600 transition-colors" 
          />
        </div>
      </div>

      <!-- Members Grid -->
      <div class="flex-1 overflow-y-auto mt-[20px]">
        <!-- Manager Section -->
        <div v-if="manager" class="mb-4">
          <h4 class="text-[14px] font-bold text-black mb-2">Trưởng nhóm</h4>
          <div class="flex items-center flex-wrap gap-2" :class="isNarrow ? 'flex-column' : 'flex-row'">
            <div>
              <img
                v-if="manager.user_image"
                :src="manager.user_image"
                :alt="manager.full_name"
                class="w-8 h-8 rounded-full object-cover"
              />
              <div
                v-else
                class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-medium text-xs truncate"
              >
                {{ getInitials(manager.full_name) }}
              </div>
            </div>
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-900 break-words line-clamp-2">
                {{ manager.full_name }}
              </p>
            </div>
          </div>
        </div>
        
        <p class="text-[14px] font-bold text-black mb-2">Thành viên khác</p>
        <div class="flex flex-wrap gap-2.5 mb-4">
          <div
            v-for="member in regularMembers"
            :key="member.name"
            class="flex flex-col flex-wrap items-center"
            :title="member.full_name"
          >
            <img
              v-if="member.user_image"
              :src="member.user_image"
              :alt="member.full_name"
              class="w-8 h-8 rounded-full object-cover"
            />
            <div
              v-else
              class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium text-xs truncate"
            >
              {{ getInitials(member.full_name) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Add Member Modal -->
      <AddTeamMemberModal
        v-model="showAddMemberModal"
        @success="getTeamMembers.reload()"
      />
    </div>
  </transition>
</template>

<script setup>
import { createResource } from "frappe-ui"
import { X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue"
import { useRoute } from "vue-router"
import LucideCirclePlus from "~icons/lucide/circle-plus"
import AddTeamMemberModal from "./AddTeamMemberModal.vue"

const route = useRoute()
const emit = defineEmits(['close'])

const showAddMemberModal = ref(false)
const headerRef = ref(null)
const isNarrow = ref(false)
const isDrawer = ref(false)
const visible = ref(true)

let resizeObserver = null

function checkHeaderWidth() {
  if (headerRef.value) {
    isNarrow.value = headerRef.value.offsetWidth <= 150
  }
}

function checkScreenWidth() {
  isDrawer.value = window.innerWidth + 250 < 1600
  if (!isDrawer.value) {
    visible.value = true
  }
}

onMounted(() => {
  nextTick(() => {
    checkHeaderWidth()
    checkScreenWidth()
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => checkHeaderWidth())
      if (headerRef.value) resizeObserver.observe(headerRef.value)
    } else {
      window.addEventListener('resize', checkHeaderWidth)
    }
    window.addEventListener('resize', checkScreenWidth)
  })
})

onUnmounted(() => {
  if (resizeObserver && headerRef.value) resizeObserver.unobserve(headerRef.value)
  window.removeEventListener('resize', checkHeaderWidth)
  window.removeEventListener('resize', checkScreenWidth)
})

const getTeamMembers = createResource({
  url: "drive.api.product.get_all_users",
  params: {
    team: route.params.team,
  },
  auto: true,
})

const teamMembers = computed(() => getTeamMembers.data || [])

const regularMembers = computed(() =>
  teamMembers.value.filter((member) => member.access_level !== 2)
)

const manager = computed(() =>
  teamMembers.value.find((member) => member.access_level === 2)
)

const getInitials = (fullName) => {
  if (!fullName) return "U"
  return fullName
    .split(" ")
    .map((name) => name.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

const handleClose = () => {
  console.log("Closing team members list", isDrawer.value)
  if (isDrawer.value) {
    visible.value = false
    emit('close')
  } else {
    emit('close')
  }
}

onMounted(() => {
  if (route.params.team) {
    getTeamMembers.reload()
  }
})
</script>

<style scoped>
/* Transition hiệu ứng Drawer */
.slide-enter-active, .slide-leave-active {
  transition: transform 0.3s ease;
}
.slide-enter-from, .slide-leave-to {
  transform: translateX(100%);
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
