<template>
  <!-- Drawer overlay khi màn hình nhỏ hơn 1500px -->
  <transition name="fade">
    <div 
      v-if="isDrawer && visible" 
      class="fixed inset-0 bg-black/20 z-40"
      @click="handleClose"
    />
  </transition>

  <transition name="slide">
    <div
      v-if="visible"
      class="bg-white border-l border-gray-200 h-[100vh] flex flex-col min-w-[276px] max-w-[276px] py-5 px-4 z-5"
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
            v-if="manager && manager.email == currentUserEmail"
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
      <div class="flex-1 overflow-x-visible mt-[20px] -mx-4 px-4">
        <!-- Manager Section -->
        <div v-if="manager" class="mb-4">
          <h4 class="text-[14px] font-bold text-black mb-2">Trưởng nhóm</h4>
          <div 
            class="flex items-center flex-wrap gap-2 relative group cursor-pointer" 
            :class="isNarrow ? 'flex-column' : 'flex-row'"
            @mouseenter="handleMemberHover($event, manager, 'manager')"
            @mouseleave="handleMouseLeave"
          >
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
            class="flex flex-col flex-wrap items-center relative group cursor-pointer"
            @mouseenter="handleMemberHover($event, member, 'member')"
            @mouseleave="handleMouseLeave"
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

  <!-- Tooltip using Teleport -->
  <teleport to="body">
    <transition name="tooltip-fade">
      <div
        v-if="showTooltip && tooltipMember"
        class="fixed z-[9999]"
        :style="tooltipStyle"
        @mouseenter="handleTooltipMouseEnter"
        @mouseleave="handleMouseLeave"
      >
        <div class="bg-white rounded-lg shadow-lg p-4 min-w-[280px] border" style="background-color: #ffffff; border-color: #0149C1;">
          <div class="flex items-start gap-3 mb-3">
            <img
              v-if="tooltipMember.user_image"
              :src="tooltipMember.user_image"
              :alt="tooltipMember.full_name"
              class="w-12 h-12 rounded-full object-cover flex-shrink-0"
            />
            <div
              v-else
              class="w-12 h-12 rounded-full flex items-center justify-center text-white font-medium text-sm flex-shrink-0"
              style="background-color: #0149C1;"
            >
              {{ getInitials(tooltipMember.full_name) }}
            </div>
            
            <div class="flex-1 min-w-0">
              <h4 class="font-semibold text-gray-900 text-sm mb-1">{{ tooltipMember.full_name }}</h4>
              <p v-if="tooltipMember?.department" class="text-xs text-gray-600 mb-1">
                <span class="text-gray-900">{{ tooltipMember.department }}</span>
              </p>
              <p v-if="tooltipMember?.position" class="text-xs text-gray-600 mb-1">
                <span class="text-gray-900">{{ tooltipMember.position }}</span>
              </p>
            </div>
          </div>
          <a 
            :href="`/mtp/next-connect?to=${encodeURIComponent(tooltipMember.email)}`"
            target='_top'
            class="w-full mt-4 ml-auto bg-white rounded-md py-2 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            style="border: 1px solid #0149C1; color: #0149C1;"
            onmouseover="this.style.backgroundColor='#E6F2FF'"
            onmouseout="this.style.backgroundColor='white'"
          >
            <DepartmentMessage class="w-4 h-4 text-[#0149C1]" />
            Trò chuyện
          </a>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { X } from 'lucide-vue-next';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useStore } from 'vuex';
import LucideCirclePlus from "~icons/lucide/circle-plus";
import DepartmentMessage from '../assets/Icons/DepartmentMessage.vue';
import { getTeamMembers } from "../resources/team";
import AddTeamMemberModal from "./AddTeamMemberModal.vue";

const route = useRoute()
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: undefined
  }
})
const emit = defineEmits(['close', 'update:modelValue'])

const store = useStore()
const currentUserEmail = computed(() => store.state.user.id)

const showAddMemberModal = ref(false)
const headerRef = ref(null)
const isNarrow = ref(false)
const isDrawer = ref(false)
const internalVisible = ref(false)
const showTooltip = ref(false)
const tooltipMember = ref(null)
const tooltipType = ref('')
const tooltipStyle = ref({})
const arrowStyle = ref({})

let resizeObserver = null
let hideTimeout = null

// Computed để sync với v-model từ parent
const visible = computed({
  get() {
    console.log('🟡 visible getter called, modelValue:', props.modelValue, 'internalVisible:', internalVisible.value)
    // Nếu có modelValue từ parent, dùng nó
    if (props.modelValue !== undefined) {
      return props.modelValue
    }
    // Nếu không, dùng internal state
    return internalVisible.value
  },
  set(value) {
    console.log('🟢 visible.value setter called with:', value)
    internalVisible.value = value
    emit('update:modelValue', value)
    console.log('🟢 Emitted update:modelValue with:', value)
  }
})

// Watch để ensure internal state sync với prop
watch(() => props.modelValue, (newVal) => {
  console.log('🟣 props.modelValue changed to:', newVal)
  if (newVal !== undefined) {
    internalVisible.value = newVal
  }
})

function checkHeaderWidth() {
  if (headerRef.value) {
    isNarrow.value = headerRef.value.offsetWidth <= 150
  }
}

function checkScreenWidth() {
  const newIsDrawer = window.innerWidth + 250 < 1600
  isDrawer.value = newIsDrawer
  
  // ✅ FIX: Không tự động set visible=true trên desktop
  // Parent sẽ control visible state via v-model
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
  
  if (route.params.team) {
    getTeamMembers.reload()
  }
})

onUnmounted(() => {
  if (resizeObserver && headerRef.value) resizeObserver.unobserve(headerRef.value)
  window.removeEventListener('resize', checkHeaderWidth)
  window.removeEventListener('resize', checkScreenWidth)
  if (hideTimeout) clearTimeout(hideTimeout)
})

// Watch route changes để đóng drawer trên mobile khi chuyển team
watch(() => route.params.team, (newTeam, oldTeam) => {
  if (newTeam && newTeam !== oldTeam) {
    getTeamMembers.reload()
    // Chỉ tự động đóng drawer trên mobile khi chuyển team
    if (isDrawer.value) {
      visible.value = false
    }
  }
})

const teamMembers = computed(() => getTeamMembers.data || [])

const autoOpenedByOneMember = ref(false)

// Tự động mở drawer nếu nhóm chỉ có 1 thành viên
watch(teamMembers, (members) => {
  if (members && members.length === 1) {
    visible.value = true
    autoOpenedByOneMember.value = true
  } else if (members && members.length > 1 && autoOpenedByOneMember.value) {
    visible.value = false
    autoOpenedByOneMember.value = false
  }
}, { immediate: true })

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
  console.log('🔵 handleClose called')
  internalVisible.value = false
  emit('update:modelValue', false)
  emit('close')
  console.log('🔵 All close events emitted')
}

const handleMemberHover = (event, member, type) => {
  const element = event.currentTarget
  if (!element) return

  const rect = element.getBoundingClientRect()
  const tooltipWidth = 280
  const padding = 16
  const viewportWidth = window.innerWidth
  
  let left = rect.left + rect.width / 2 - tooltipWidth / 2
  let transformOrigin = 'center'
  let arrowLeft = '50%'
  let arrowTransform = '-translate-x-1/2'
  
  if (left + tooltipWidth + padding > viewportWidth) {
    left = rect.right - tooltipWidth
    transformOrigin = 'right'
    arrowLeft = `${rect.width / 2 + (rect.right - left - tooltipWidth)}px`
    arrowTransform = ''
  }
  
  if (left < padding) {
    left = rect.left
    transformOrigin = 'left'
    arrowLeft = `${rect.width / 2}px`
    arrowTransform = ''
  }

  tooltipMember.value = member
  tooltipType.value = type
  tooltipStyle.value = {
    left: `${left}px`,
    top: `${rect.bottom + 8}px`,
    transformOrigin: transformOrigin
  }
  arrowStyle.value = {
    left: arrowLeft,
    transform: arrowTransform
  }
  
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  showTooltip.value = true
}

const handleMouseLeave = () => {
  hideTimeout = setTimeout(() => {
    showTooltip.value = false
    tooltipMember.value = null
  }, 200)
}

const handleTooltipMouseEnter = () => {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
}

const handleChat = (email) => {
  console.log("Start chat with:", email)
  showTooltip.value = false
  const encoded = encodeURIComponent(email);
  return `/mtp/next-connect?to=${encoded}`;
}
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

/* Tooltip transition */
.tooltip-fade-enter-active, .tooltip-fade-leave-active {
  transition: opacity 0.2s ease;
}
.tooltip-fade-enter-from, .tooltip-fade-leave-to {
  opacity: 0;
}
</style>