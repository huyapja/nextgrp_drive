<template>
  <Dialog
    ref="dialog"
    v-model:visible="openDialog"
    modal
    :dismissableMask="!hasOpenDropdown"
    :closable="false"
    :style="{ width: '32rem', overflow: 'hidden' }"
    :breakpoints="{ '768px': '95vw' }"
    :position="isMobile ? 'top' : 'center'"
    class="share-dialog"
    @update:visible="handleDialogVisibility"
  >
   <template #container>

     <div class="space-y-4 p-4 pb-[80px]">
        <div class="">
          <div class="text-lg font-medium text-gray-900 truncate max-w-[92%]">
            Chia sẻ "{{ entity?.title || entity?.name }}"
          </div>
          <div
            @click="closeDialog"
            class="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 cursor-pointer w-8 h-8"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </div>
        </div>
        <!-- Add People Section -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Thêm người
          </label>

          <!-- Combined input with tags and dropdown -->
          <div class="flex gap-2">
            <!-- Search Input with selected users as tags -->
            <div
              class="relative w-[55%]"
              ref="dropdownContainer"
            >
              <div
                :class="[
                  'w-full px-3 border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white',
                  sharedUsers.length === 0 ? 'h-[40px]' : 'min-h-[40px]',
                ]"
              >
                <div class="flex flex-wrap items-center gap-1 min-h-[40px]">
                  <!-- Selected user tags - Show max 3 -->
                  <div
                    v-for="(user, idx) in displayedSharedUsers"
                    :key="user.name"
                    class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-md text-sm"
                  >
                    <CustomAvatar
                      :image="user.user_image"
                      :label="
                        (user.full_name || user.email).slice(0, 1).toUpperCase()
                      "
                      size="small"
                      shape="circle"
                      class="!w-5 !h-5 bg-blue-500 text-white"
                    />
                    <span>{{ user.full_name || user.email }}</span>
                    <button
                      class="text-gray-400 hover:text-gray-600 ml-1"
                      @click="removeSharedUser(idx)"
                    >
                      <svg
                        class="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M6 18L18 6M6 6l12 12"
                        ></path>
                      </svg>
                    </button>
                  </div>

                  <!-- Show additional users count if more than 3 -->
                  <div
                    v-if="additionalUsersCount > 0"
                    class="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 rounded-md text-sm text-blue-800 font-medium"
                  >
                    <span>+{{ additionalUsersCount }} khác</span>
                  </div>

                  <!-- Input field -->
                  <input
                    ref="searchInput"
                    v-model="query"
                    type="text"
                    placeholder="Nhập email hoặc tên..."
                    class="flex-1 min-w-[120px] outline-none border-none bg-transparent text-sm outline-none focus:ring-0 !p-0"
                    @focus="handleInputFocus"
                    @input="handleInputChange"
                  />
                </div>
              </div>

              <!-- Dropdown suggestions -->
              <div
                v-if="
                  isDropdownOpen 
                  &&
                  (filteredUsers.length > 0 || showAllUsers) &&
                  !showAllSharedUsers
                "
                class="absolute z-[10000] mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto !p-0 search-dropdown"
              >
                <div
                  v-if="filteredUsers.length === 0 && showAllUsers"
                  class="p-3 text-sm text-gray-500"
                >
                  Nhập để tìm kiếm người dùng...
                </div>

                <div
                  v-for="person in filteredUsers"
                  :key="person.email"
                  class="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
                  @click="toggleUserSelection(person)"
                >
                  <CustomAvatar
                    :image="person.user_image"
                    :label="
                      (person.full_name || person.email)
                        .slice(0, 1)
                        .toUpperCase()
                    "
                    size="normal"
                    shape="circle"
                    class="mr-3 !w-6 !h-6 bg-blue-500 text-white"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 truncate">
                      {{ person.full_name || person.email }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Custom Permission Dropdown -->
            <div
              class="relative w-[45%]"
              ref="permissionDropdownContainer"
            >
              <button
                @click.stop="togglePermissionDropdown"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm min-h-[40px] bg-white text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                :disabled="entity.owner !== store.state.user.id"
              >
                <span class="text-gray-900">{{
                  shareAccess === "reader" ? "Người xem" : "Người chỉnh sửa"
                }}</span>
                <svg v-if="entity.owner === store.state.user.id"
                  class="w-4 h-4 text-gray-400 transition-transform"
                  :class="{ 'rotate-180': isPermissionDropdownOpen }"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              <!-- Permission Dropdown -->
              <div
                v-if="isPermissionDropdownOpen && entity.owner === store.state.user.id"
                class="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden permission-dropdown-content"
                @click.stop
              >
                <div
                  @click="selectPermission('reader')"
                  class="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer"
                  :class="{
                    'bg-blue-50 border-l-2 border-l-blue-500':
                      shareAccess === 'reader',
                  }"
                >
                  <div class="text-sm font-medium text-gray-900">Người xem</div>
                </div>
                <div
                  @click="selectPermission('editor')"
                  class="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer"
                  :class="{
                    'bg-blue-50 border-l-2 border-l-blue-500':
                      shareAccess === 'editor',
                  }"
                >
                  <div class="text-sm font-medium text-gray-900">
                    Người chỉnh sửa
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Current Members Section -->
        <div v-if="getUsersWithAccess.data?.length > 0">
          <h3 class="text-sm font-medium text-gray-700 mb-3">
            Những người có quyền truy cập
          </h3>

          <div class="space-y-0 max-h-60 overflow-y-auto">
            <div
              v-for="(user, idx) in getUsersWithAccess.data"
              :key="user.name"
              class="flex items-center justify-between p-0 py-2 hover:bg-gray-50 rounded-md"
            >
              <div class="flex items-center">
                <CustomAvatar
                  :image="user.user_image"
                  :label="
                    (user.full_name || user.user || user.email)
                      .slice(0, 1)
                      .toUpperCase()
                  "
                  size="normal"
                  shape="circle"
                  class="mr-3 !w-6 !h-6 bg-blue-500 text-white"
                />

                <div class="text-sm font-medium text-gray-900">
                  {{ user.full_name || user.user || user.email }}
                </div>
              </div>

              <div class="flex items-center gap-2.5">
                <!-- Access Level Display/Selector -->
                <div
                  v-if="user.user === entity.owner"
                  class="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full min-w-[122px]"
                >
                  <svg
                    class="w-4 h-4 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span class="text-sm text-gray-600">Chủ sở hữu</span>
                </div>

                <!-- Custom Access Level Selector -->
                <div
                  v-else
                  class="relative"
                  ref="userAccessDropdownContainer"
                >
                  <button
                    @click.stop="toggleUserAccessDropdown(user, $event)"
                    data-dropdown="user-access"
                    class="flex items-center gap-2 px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 min-w-[120px]"
                    :disabled="store.state.user.id !== entity.owner"
                  >
                    <span>{{
                      getAccessLevel(user) === "reader"
                        ? "Có thể xem"
                        : "Có thể chỉnh sửa"
                    }}</span>
                    <svg
                      v-if="store.state.user.id === entity.owner"
                      class="w-4 h-4 text-gray-400 ml-auto"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  <!-- Teleport dropdown ra ngoài body -->
                  <Teleport to="body">
                    <div
                      v-if="activeUserDropdown === user.user"
                      class="fixed inset-0 bg-black bg-opacity-0 z-[99999]"
                      @click="activeUserDropdown = null"
                    ></div>
                    <div
                      v-if="
                        activeUserDropdown === user.user && dropdownPosition && store.state.user.id === entity.owner
                      "
                      :style="{
                        position: 'fixed',
                        top: dropdownPosition.top + 'px',
                        left: dropdownPosition.left + 'px',
                        zIndex: 100000,
                      }"
                      @click.stop
                      class="w-30 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden dropdown-content user-dropdown"
                    >
                      <div
                        @click="updateUserAccess(user, 'reader')"
                        class="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer"
                        :class="{
                          'bg-blue-50 border-l-2 border-l-blue-500':
                            getAccessLevel(user) === 'reader',
                        }"
                      >
                        <div class="text-sm font-medium text-gray-900">
                          Có thể xem
                        </div>
                      </div>
                      <div
                        @click="updateUserAccess(user, 'editor')"
                        class="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer"
                        :class="{
                          'bg-blue-50 border-l-2 border-l-blue-500':
                            getAccessLevel(user) === 'editor',
                        }"
                      >
                        <div class="text-sm font-medium text-gray-900">
                          Có thể chỉnh sửa
                        </div>
                      </div>

                      <div
                        v-if="user.source !== 'team'"
                        @click="updateUserAccess(user, 'unshare')"
                        class="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer"
                      >
                        <div class="text-sm font-medium text-gray-900">
                          Xóa quyền truy cập
                        </div>
                      </div>
                    </div>
                  </Teleport>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          class="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200"
        >
          <div class="flex gap-2 justify-between items-center w-full">
            <!-- Copy Link Button -->
            <Button
              variant="outline"
              @click="getLink(entity)"
              :class="isMobile ? 'w-full' : 'max-w-[50%] w-full'"
              class="h-[40px] !bg-[#D4E1F9] text-[#2563EB] !hover:bg-[#D4E1F9] !border-[#0149C1] !text-[#0149C1]"
            >
              Sao chép liên kết
            </Button>

            <!-- Share Button -->
            <Button
              :variant="sharedUsers.length > 0 ? 'solid' : 'outline'"
              @click="sharedUsers.length > 0 ? addShares() : closeDialog()"
              :class="isMobile ? 'w-full' : 'max-w-[50%] w-full'"
              class="h-[40px] !bg-[#0149C1] !text-white !hover:bg-[#01337A] !border-[#01337A]"
            >
              {{
                updateAccess.loading
                  ? "Đang chia sẻ..."
                  : sharedUsers.length > 0
                  ? "Chia sẻ"
                  : "Đóng"
              }}
            </Button>
          </div>
        </div>
      </div>
   </template>
  </Dialog>
</template>

<script setup>
import { vOnClickOutside } from "@vueuse/components"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { useStore } from "vuex"

// Define click-outside directive
const vClickOutside = vOnClickOutside

// Frappe UI Components
import { Button } from "frappe-ui"
import Dialog from 'primevue/dialog'
// Custom components
import CustomAvatar from "../CustomAvatar.vue"

import emitter from "@/emitter"
import {
  allSiteUsers,
  getUsersWithAccess,
  updateAccess,
} from "@/resources/permissions"
import { getLink } from "@/utils/getLink"
import { toast } from "../../utils/toasts"

const props = defineProps({
  modelValue: String,
  entity: Object,
})

const emit = defineEmits(["update:modelValue", "success"])
const store = useStore()

// Reactive data
const query = ref("")
const sharedUsers = ref([])
const isDropdownOpen = ref(false)
const shareAccess = ref("reader")
const dropdownContainer = ref(null)
const isPermissionDropdownOpen = ref(false)
const permissionDropdownContainer = ref(null)
const activeUserDropdown = ref(null)
const userAccessDropdownContainer = ref(null)
const showAllUsers = ref(false)
const showAllSharedUsers = ref(false)
const dropdownPosition = ref(null)
const searchInput = ref(null)
const isMobile = ref(false)

// Check if mobile
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  document.addEventListener("click", handleClickOutside, true)
  
  // Handle iOS keyboard
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    window.addEventListener('focusin', handleIOSFocus)
    window.addEventListener('focusout', handleIOSBlur)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  document.removeEventListener("click", handleClickOutside, true)
  
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    window.removeEventListener('focusin', handleIOSFocus)
    window.removeEventListener('focusout', handleIOSBlur)
  }
})

// Handle iOS keyboard focus
const handleIOSFocus = (event) => {
  if (event.target === searchInput.value) {
    setTimeout(() => {
      event.target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }
}

const handleIOSBlur = () => {
  window.scrollTo(0, 0)
}

// Computed
const openDialog = computed({
  get: () => props.modelValue === "s",
  set: (value) => emit("update:modelValue", value ? "s" : ""),
})

const hasOpenDropdown = computed(() => {
  return isDropdownOpen.value || 
         isPermissionDropdownOpen.value || 
         activeUserDropdown.value !== null
})

// Handle click outside for dropdowns
const handleClickOutside = (event) => {
  // Get all dropdown elements and their containers
  const permissionContent = document.querySelector(".permission-dropdown-content")
  const userDropdownContent = document.querySelector(".user-dropdown") 
  const searchDropdown = document.querySelector('.search-dropdown')
  const dropdownInput = dropdownContainer.value?.querySelector('input')
  
  // Check if click is inside any dropdown, their triggers, or input
  const isClickInsideDropdown = (
    // Permission dropdown
    permissionContent?.contains(event.target) ||
    permissionDropdownContainer.value?.contains(event.target) ||
    // User action dropdown
    userDropdownContent?.contains(event.target) ||
    // Search dropdown and its input
    searchDropdown?.contains(event.target) ||
    dropdownContainer.value?.contains(event.target) ||
    dropdownInput === event.target
  )

  // If click is inside dropdown area, LET THE CLICK THROUGH
  if (isClickInsideDropdown) {
    // DON'T prevent propagation or default for clicks inside dropdown
    // Just return and let Vue handle the @click events normally
    return
  }

  // If click is outside dropdown areas, close them
  if (hasOpenDropdown.value) {
    // Reset all dropdown states
    isDropdownOpen.value = false
    showAllUsers.value = false 
    isPermissionDropdownOpen.value = false
    activeUserDropdown.value = null
    dropdownPosition.value = null
    query.value = '' // Clear search input
    
    // Prevent dialog from closing when we're just closing dropdowns
    event.stopPropagation()
    event.preventDefault()
    return
  }
}

// Cập nhật toggleUserSelection để đảm bảo hoạt động tốt
const toggleUserSelection = (person) => {
  const index = sharedUsers.value.findIndex((user) => user.name === person.name)
  if (index > -1) {
    sharedUsers.value.splice(index, 1)
  } else {
    sharedUsers.value.push({
      ...person,
      accessLevel: shareAccess.value,
    })
  }
  // Keep dropdown open but clear search
  query.value = ""
  // Optional: close dropdown after selection
  // isDropdownOpen.value = false
}

// Dialog close handler - now only handles programmatic close
const handleDialogClose = (value) => {
  // Only handle when value changes to false
  if (value === false && !hasOpenDropdown.value) {
    emit("update:modelValue", "")
    document.body.style.overflow = ""
  }
}

const allUsersData = computed(() => allSiteUsers.data || [])

// Show only first 3 selected users
const displayedSharedUsers = computed(() => {
  return showAllSharedUsers.value
    ? sharedUsers.value
    : sharedUsers.value.slice(0, 3)
})

// Count of additional users beyond the first 3
const additionalUsersCount = computed(() => {
  return Math.max(0, sharedUsers.value.length - 3)
})

const filteredUsers = computed(() => {
  const allUsers = allUsersData.value || []
  if (!allUsers.length) return []

  const sharedUserIds = sharedUsers.value.map((u) => u.name)
  const existingUserIds = (getUsersWithAccess.data || []).map((u) => u.user)

  // Filter out current user, shared users, and users with existing access
  const availableUsers = allUsers.filter((k) => {
    return (
      k.name !== store.state.user.id &&
      !sharedUserIds.includes(k.name) &&
      !existingUserIds.includes(k.name)
    )
  })

  if (!query.value.trim()) {
    return showAllUsers.value ? availableUsers.slice(0, 8) : []
  }

  const regex = new RegExp(query.value.trim(), "i")
  return availableUsers
    .filter((k) => {
      const email = k.email || ""
      const fullName = k.full_name || ""
      return regex.test(email) || regex.test(fullName)
    })
    .slice(0, 8)
})

// Methods for handling search input
const handleInputFocus = () => {
  // Open search dropdown and close others
  isDropdownOpen.value = true
  showAllUsers.value = true
  showAllSharedUsers.value = false
  isPermissionDropdownOpen.value = false
  activeUserDropdown.value = null
}

const handleInputChange = () => {
  // Keep dropdown open while typing
  isDropdownOpen.value = true
  showAllSharedUsers.value = false
}

const removeSharedUser = (index) => {
  if (showAllSharedUsers.value) {
    sharedUsers.value.splice(index, 1)
  } else {
    sharedUsers.value.splice(index, 1)
  }

  if (sharedUsers.value.length <= 3) {
    showAllSharedUsers.value = false
  }
}

const togglePermissionDropdown = () => {
  isPermissionDropdownOpen.value = !isPermissionDropdownOpen.value
  console.log("Toggled permission dropdown:", isPermissionDropdownOpen.value)
  
  if (isPermissionDropdownOpen.value) {
    activeUserDropdown.value = null
    dropdownPosition.value = null
    isDropdownOpen.value = false
    showAllSharedUsers.value = false
  }
}

const selectPermission = (permission) => {
  shareAccess.value = permission
  isPermissionDropdownOpen.value = false
  activeUserDropdown.value = null
}

const toggleUserAccessDropdown = async (user, event) => {
  event.stopPropagation()
  const isClosing = activeUserDropdown.value === user.user

  // Close permission dropdown
  isPermissionDropdownOpen.value = false
  isDropdownOpen.value = false

  // Toggle user dropdown
  activeUserDropdown.value = isClosing ? null : user.user
  showAllSharedUsers.value = false

  if (!isClosing) {
    await nextTick()

    const buttonElement = event.currentTarget
    const rect = buttonElement.getBoundingClientRect()

    dropdownPosition.value = {
      top: rect.bottom + window.scrollY + 4,
      left: rect.right + window.scrollX - 150,
    }
  } else {
    dropdownPosition.value = null
  }
}

const addShares = async () => {
  try {
    for (let user of sharedUsers.value) {
      const access =
        shareAccess.value === "editor"
          ? { read: 1, comment: 1, share: 1, write: 1 }
          : { read: 1, comment: 1, share: 1, write: 0 }

      const payload = {
        entity_name: props.entity.name,
        user: user.name,
        ...access,
      }

      await updateAccess.submit(payload)
    }

    sharedUsers.value = []
    showAllSharedUsers.value = false
    emitter.emit("refreshUserList")
    emit("success")

    setTimeout(() => {
      getUsersWithAccess.fetch({ entity: props.entity.name })
    }, 500)

    toast("Chia sẻ thành công", { type: "success" })
    closeDialog()
  } catch (e) {
    console.error("Error sharing:", e)
  }
}

const updateUserAccess = async (user, newAccessLevel) => {
  try {
    activeUserDropdown.value = null
    dropdownPosition.value = null
    
    let access = {}
    if (newAccessLevel === "editor") {
      access = { read: 1, comment: 1, share: 1, write: 1 }
    } else if (newAccessLevel === "reader") {
      access = { read: 1, comment: 1, share: 1, write: 0 }
    } else {
      access = { method: 'unshare' }
    }

    await updateAccess.submit({
      entity_name: props.entity.name,
      user: user.user,
      ...access,
    })

    if (newAccessLevel === 'unshare') {
      const index = getUsersWithAccess.data.findIndex(u => u.user === user.user)
      if (index > -1) {
        getUsersWithAccess.data.splice(index, 1)
      }
    } else {
      Object.assign(user, access)
    }

    emitter.emit("refreshUserList")
    emit("success")
  } catch (e) {
    console.error("Error updating access:", e)
  }
}

const getAccessLevel = (user) => {
  return user.write ? "editor" : "reader"
}

const closeDialog = () => {
  emit("update:modelValue", "")
  document.body.style.overflow = ""
}

// Lifecycle
onMounted(async () => {
  try {
    await allSiteUsers.fetch()
    await getUsersWithAccess.fetch({ entity: props.entity.name })
  } catch (error) {
    console.error("Error fetching data:", error)
  }
})

// Watch activeUserDropdown to handle body scroll
watch(activeUserDropdown, (newValue) => {
  if (newValue) {
    document.body.style.overflow = "hidden"
  } else {
    document.body.style.overflow = ""
  }
})

// Watch for dialog open/close
// Watch for dialog open/close
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue === "s") {
      getUsersWithAccess.fetch({ entity: props.entity.name })
      // Reset form
      sharedUsers.value = []
      query.value = ""
      isDropdownOpen.value = false
      showAllUsers.value = false
      isPermissionDropdownOpen.value = false
      activeUserDropdown.value = null
      showAllSharedUsers.value = false
      dropdownPosition.value = null
      
      // Focus on search input after dialog opens
      nextTick(() => {
        if (searchInput.value) {
          searchInput.value.focus()
        }
      })
    }
  }
)

// Handle dialog visibility changes
const handleDialogVisibility = (visible) => {
  if (!visible) {
    // If any dropdown is open, prevent dialog close and just close dropdowns
    if (hasOpenDropdown.value) {
      isDropdownOpen.value = false
      showAllUsers.value = false 
      isPermissionDropdownOpen.value = false
      activeUserDropdown.value = null
      dropdownPosition.value = null
      query.value = '' // Clear search input
      
      // Reopen dialog
      nextTick(() => {
        openDialog.value = true
      })
      return
    }
    
    // Otherwise allow dialog to close
    emit("update:modelValue", "")
    document.body.style.overflow = ""
  } else {
    // When dialog opens, focus on search input
    nextTick(() => {
      if (searchInput.value) {
        searchInput.value.focus()
      }
    })
  }
}
</script>

<style scoped>
.share-dialog {
  overflow: hidden;
}

.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #f1f5f9;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* Dropdown positioning */
.absolute.z-50 {
  z-index: 9999;
}

/* Tag styling */
.inline-flex {
  background-color: #f3f4f6;
  transition: all 0.2s ease;
}

.inline-flex:hover {
  background-color: #e5e7eb;
}

/* Input container focus styling */
.focus-within\:ring-2:focus-within {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

/* Dropdown animations */
.rotate-180 {
  transform: rotate(180deg);
}

/* Custom button styling */
button {
  transition: all 0.2s ease;
}

button:focus {
  outline: none;
}

/* Dropdown item hover effects */
.hover\:bg-gray-50:hover {
  background-color: #f9fafb;
  transition: background-color 0.15s ease;
}

/* Selected item styling */
.bg-blue-50 {
  background-color: #eff6ff;
}

.border-l-blue-500 {
  border-left-color: #3b82f6;
}

/* Permission dropdown styling */
.relative button {
  position: relative;
}

.relative .absolute {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

/* Additional users count styling */
.bg-blue-100 {
  background-color: #dbeafe;
}

.text-blue-800 {
  color: #1e40af;
}

.text-blue-600 {
  color: #2563eb;
}

.hover\:text-blue-800:hover {
  color: #1e40af;
}

[role="dialog"] .flex.min-h-screen {
  justify-content: flex-start !important;
  padding-top: 40px !important;
}


/* Mobile nhỏ hơn - giảm thêm nếu cần */
@media (max-width: 480px) {
  input[type="text"] {
    font-size: 12px !important;
  }
  
  input[type="text"]::placeholder {
    font-size: 12px !important;
  }
  
  .inline-flex {
    font-size: 11px !important;
  }
  
  .inline-flex span {
    font-size: 11px !important;
  }
}

[role="dialog"] .flex.min-h-screen {
  justify-content: flex-start !important;
  padding-top: 40px !important;
}

@media (max-width: 768px) {
  [role="dialog"] .flex.min-h-screen {
    padding-top: 0 !important;
  }
  
  [role="dialog"] .my-8 {
    margin: 0 !important;
    height: 100vh !important;
    border-radius: 0 !important;
  }
}

</style>