<template>
  <Dialog
    v-model="openDialog"
    :options="{ size: 'lg' }"
  >
    <template #body-main>
      <div class="space-y-4 p-4">
        <div class="">
          <div class="text-lg font-medium text-gray-900">
            Chia sẻ "{{ entity?.title || entity?.name }}"
          </div>
          <div
            @click="closeDialog"
            class="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
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
              class="flex-1 relative"
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
                      :label="(user.full_name || user.email).slice(0, 1).toUpperCase()"
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
                    <button
                      class="text-blue-600 hover:text-blue-800 ml-1"
                      @click="showAllSharedUsers = !showAllSharedUsers"
                      :title="showAllSharedUsers ? 'Thu gọn' : 'Xem tất cả'"
                    >
                      <svg
                        class="w-3 h-3 transition-transform"
                        :class="{ 'rotate-180': showAllSharedUsers }"
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
                  </div>

                  <!-- Input field -->
                  <input
                    v-model="query"
                    type="text"
                    placeholder="Nhập email hoặc tên..."
                    class="flex-1 min-w-[120px] outline-none border-none bg-transparent text-sm outline-none focus:ring-0 !p-0"
                    @focus="handleInputFocus"
                    @input="handleInputChange"
                    @blur="handleInputBlur"
                  />
                </div>
              </div>

              <!-- Show all selected users when expanded -->
              <div
                v-if="showAllSharedUsers && sharedUsers.length > 3"
                class="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto p-2"
              >
                <div class="text-xs font-medium text-gray-500 mb-2 px-1">
                  Tất cả người được chọn ({{ sharedUsers.length }})
                </div>
                <div class="flex flex-wrap gap-1">
                  <div
                    v-for="(user, idx) in sharedUsers"
                    :key="user.name"
                    class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-md text-sm"
                  >
                    <CustomAvatar
                      :image="user.user_image"
                      :label="(user.full_name || user.email).slice(0, 1).toUpperCase()"
                      size="small"
                      shape="circle"
                      class="!w-4 !h-4 bg-blue-500 text-white"
                    />
                    <span class="text-xs">{{ user.full_name || user.email }}</span>
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
                </div>
              </div>

              <!-- Dropdown suggestions -->
              <div
                v-if="
                  isDropdownOpen && (filteredUsers.length > 0 || showAllUsers) && !showAllSharedUsers
                "
                class="absolute z-[10000] mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto !p-0"
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
                  @click="selectUser(person)"
                >
                  <CustomAvatar
                    :image="person.user_image"
                    :label="(person.full_name || person.email).slice(0, 1).toUpperCase()"
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
            <div class="relative w-40" ref="permissionDropdownContainer">
              <button
                @click="togglePermissionDropdown"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm min-h-[40px] bg-white text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <span class="text-gray-900">{{
                  shareAccess === "reader" ? "Người xem" : "Người chỉnh sửa"
                }}</span>
                <svg
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
                v-if="isPermissionDropdownOpen"
                class="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden"
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

              <div class="flex items-center gap-2">
                <!-- Access Level Display/Selector -->
                <div
                  v-if="user.user === entity.owner"
                  class="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full"
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
                    @click="toggleUserAccessDropdown(user)"
                    class="flex items-center gap-2 px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 min-w-[120px]"
                  >
                    <span>{{
                      getAccessLevel(user) === "reader"
                        ? "Có thể xem"
                        : "Có thể chỉnh sửa"
                    }}</span>
                    <svg
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

                  <!-- User Access Dropdown -->
                  <div
                    v-if="activeUserDropdown === user.user"
                    class="absolute right-0 z-50 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden"
                  >
                    <div
                      @click="updateUserAccess(user, 'reader')"
                      class="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer"
                      :class="{
                        'bg-blue-50 border-l-2 border-l-blue-500':
                          getAccessLevel(user) === 'reader',
                      }"
                    >
                      <div>
                        <div class="text-sm font-medium text-gray-900">
                          Có thể xem
                        </div>
                      </div>
                    </div>
                    <div
                      v-if="entity.write"
                      @click="updateUserAccess(user, 'editor')"
                      class="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer"
                      :class="{
                        'bg-blue-50 border-l-2 border-l-blue-500':
                          getAccessLevel(user) === 'editor',
                      }"
                    >
                      <div>
                        <div class="text-sm font-medium text-gray-900">
                          Có thể chỉnh sửa
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex justify-between items-center w-full gap-2">
          <!-- Copy Link Button -->
          <Button
            variant="outline"
            @click="getLink(entity)"
            class="h-[40px] max-w-[50%] w-full !bg-[#D4E1F9] text-[#2563EB] !hover:bg-[#D4E1F9] !border-[#0149C1]"
          >
            Sao chép liên kết
          </Button>
    
          <!-- Share Button -->
          <Button
            :variant="sharedUsers.length > 0 ? 'solid' : 'outline'"
            @click="sharedUsers.length > 0 ? addShares() : closeDialog()"
            class="h-[40px] max-w-[50%] w-full !bg-[#0149C1] !text-white !hover:bg-[#01337A] !border-[#01337A]"
          >
            {{ updateAccess.loading ? "Đang chia sẻ..." : sharedUsers.length > 0 ? "Chia sẻ" : "Đóng" }}
          </Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { useStore } from "vuex"

// Frappe UI Components
import { Button, Dialog } from "frappe-ui"

// Custom components
import CustomAvatar from "../CustomAvatar.vue"

import emitter from "@/emitter"
import {
  allSiteUsers,
  getUsersWithAccess,
  updateAccess,
} from "@/resources/permissions"
import { getLink } from "@/utils/getLink"

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

// Computed
const openDialog = computed({
  get: () => props.modelValue === "s",
  set: (value) => emit("update:modelValue", value ? "s" : ""),
})

const allUsersData = computed(() => allSiteUsers.data || [])

// Show only first 3 selected users
const displayedSharedUsers = computed(() => {
  return showAllSharedUsers.value ? sharedUsers.value : sharedUsers.value.slice(0, 3)
})

// Count of additional users beyond the first 3
const additionalUsersCount = computed(() => {
  return Math.max(0, sharedUsers.value.length - 3)
})

const filteredUsers = computed(() => {
  const allUsers = allUsersData.value || []
  if (!allUsers.length) return []

  const currentUserId = store.state.user.id
  const selectedUserIds = sharedUsers.value.map(u => u.name)
  const existingUserIds = (getUsersWithAccess.data || []).map(u => u.user)

  // Filter out current user, selected users, and users with existing access
  const availableUsers = allUsers.filter((k) => {
    return k.name !== currentUserId && 
           !selectedUserIds.includes(k.name) && 
           !existingUserIds.includes(k.name)
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

// Methods
const handleInputFocus = () => {
  isDropdownOpen.value = true
  showAllUsers.value = true
  showAllSharedUsers.value = false
}

const handleInputBlur = () => {
  // Delay to allow click events to fire
  setTimeout(() => {
    isDropdownOpen.value = false
    showAllUsers.value = false
  }, 150)
}

const handleInputChange = () => {
  isDropdownOpen.value = true
  showAllSharedUsers.value = false
}

const selectUser = (person) => {
  sharedUsers.value.push({
    ...person,
    accessLevel: shareAccess.value,
  })
  query.value = ""
  isDropdownOpen.value = false
  showAllUsers.value = false
  showAllSharedUsers.value = false
}

const removeSharedUser = (index) => {
  // If we're showing all users and removing from the expanded view
  if (showAllSharedUsers.value) {
    sharedUsers.value.splice(index, 1)
  } else {
    // If we're in the normal view, remove from the actual array
    sharedUsers.value.splice(index, 1)
  }
  
  // Close expanded view if no users left or less than 4 users
  if (sharedUsers.value.length <= 3) {
    showAllSharedUsers.value = false
  }
}

const togglePermissionDropdown = () => {
  isPermissionDropdownOpen.value = !isPermissionDropdownOpen.value
  activeUserDropdown.value = null
  showAllSharedUsers.value = false
}

const selectPermission = (permission) => {
  shareAccess.value = permission
  isPermissionDropdownOpen.value = false
}

const toggleUserAccessDropdown = (user) => {
  activeUserDropdown.value =
    activeUserDropdown.value === user.user ? null : user.user
  isPermissionDropdownOpen.value = false
  showAllSharedUsers.value = false
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

    // Refresh the users list
    setTimeout(() => {
      getUsersWithAccess.fetch({ entity: props.entity.name })
    }, 500)
  } catch (e) {
    console.error("Error sharing:", e)
  }
}

const updateUserAccess = async (user, newAccessLevel) => {
  try {
    const access =
      newAccessLevel === "editor"
        ? { read: 1, comment: 1, share: 1, write: 1 }
        : { read: 1, comment: 1, share: 1, write: 0 }

    await updateAccess.submit({
      entity_name: props.entity.name,
      user: user.user,
      ...access,
    })

    // Update local data
    Object.assign(user, access)
    emitter.emit("refreshUserList")
    emit("success")
    activeUserDropdown.value = null
  } catch (e) {
    console.error("Error updating access:", e)
  }
}

const getAccessLevel = (user) => {
  return user.write ? "editor" : "reader"
}

const closeDialog = () => {
  emit("update:modelValue", "")
}

// Handle click outside - Updated to handle all dropdowns
const handleClickOutside = (event) => {
  // Handle search input dropdown
  if (
    dropdownContainer.value &&
    !dropdownContainer.value.contains(event.target)
  ) {
    isDropdownOpen.value = false
    showAllUsers.value = false
    showAllSharedUsers.value = false
  }

  // Handle permission dropdown
  if (
    permissionDropdownContainer.value &&
    !permissionDropdownContainer.value.contains(event.target)
  ) {
    isPermissionDropdownOpen.value = false
  }

  // Handle user access dropdowns
  const userAccessContainers = document.querySelectorAll('[ref="userAccessDropdownContainer"]')
  let clickedOnUserDropdown = false
  
  userAccessContainers.forEach(container => {
    if (container && container.contains(event.target)) {
      clickedOnUserDropdown = true
    }
  })

  if (!clickedOnUserDropdown) {
    activeUserDropdown.value = null
  }
}

// Lifecycle
onMounted(async () => {
  try {
    await allSiteUsers.fetch()
    await getUsersWithAccess.fetch({ entity: props.entity.name })
  } catch (error) {
    console.error("Error fetching data:", error)
  }

  document.addEventListener("click", handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside)
})

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
    }
  }
)

// Clear query when no shared users
watch(sharedUsers, (newUsers) => {
  if (newUsers.length === 0) {
    query.value = ""
    showAllSharedUsers.value = false
    if (!showAllUsers.value) {
      isDropdownOpen.value = false
    }
  }
})
</script>

<style scoped>
/* Scrollbar styling */
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
</style>