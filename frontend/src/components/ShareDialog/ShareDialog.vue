<template>
  <Dialog
    v-model="openDialog"
    :options="{ size: 'lg' }"
  >
    <template #body-main>
      <div class="space-y-4 p-4 min-h-[400px] pb-[80px]">
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

              <!-- Dropdown suggestions with checkboxes -->
              <div
                v-if="
                  isDropdownOpen &&
                  (filteredUsers.length > 0 || showAllUsers) &&
                  !showAllSharedUsers
                "
                class="absolute z-[10000] mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto !p-0"
                @click.stop
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
                  @click.stop="toggleUserSelection(person)"
                >
                  <!-- Simple Checkbox -->
                  <input
                    type="checkbox"
                    :checked="isUserSelected(person)"
                    @change="toggleUserSelection(person)"
                    @click.stop
                    class="w-4 h-4 mr-3 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />

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
              class="relative w-40"
              ref="permissionDropdownContainer"
            >
              <button
                @click.stop="
                  () => {
                    isPermissionDropdownOpen = !isPermissionDropdownOpen
                    if (isPermissionDropdownOpen) {
                      activeUserDropdown.value = null
                    }
                  }
                "
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
                ref="permissionDropdownContainer"
                v-click-outside="() => (isPermissionDropdownOpen = false)"
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
                    @click.stop="toggleUserAccessDropdown(user, $event)"
                    data-dropdown="user-access"
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

                  <!-- Teleport dropdown ra ngoài body -->
                  <Teleport to="body">
                    <div
                      v-if="activeUserDropdown === user.user"
                      class="fixed inset-0 bg-black bg-opacity-0 z-[99999]"
                      @click="activeUserDropdown = null"
                    ></div>
                    <div
                      v-if="
                        activeUserDropdown === user.user && dropdownPosition
                      "
                      :style="{
                        position: 'fixed',
                        top: dropdownPosition.top + 'px',
                        left: dropdownPosition.left + 'px',
                        zIndex: 100000,
                      }"
                      @click.stop
                      v-click-outside="() => (activeUserDropdown = null)"
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
                        v-if="activeUserDropdown === user.user"
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
                        v-if="activeUserDropdown === user.user && user.source !== 'team'"
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
          <div class="flex justify-between items-center w-full gap-2">
            <!-- Copy Link Button -->
            <Button
              variant="outline"
              @click="getLink(entity)"
              class="h-[40px] max-w-[50%] w-full !bg-[#D4E1F9] text-[#2563EB] !hover:bg-[#D4E1F9] !border-[#0149C1] !text-[#0149C1]"
            >
              Sao chép liên kết
            </Button>

            <!-- Share Button -->
            <Button
              :variant="sharedUsers.length > 0 ? 'solid' : 'outline'"
              @click="sharedUsers.length > 0 ? addShares() : closeDialog()"
              class="h-[40px] max-w-[50%] w-full !bg-[#0149C1] !text-white !hover:bg-[#01337A] !border-[#01337A]"
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

// Only one click-outside handler for all dropdowns
const handleClickOutside = (event) => {
  // Kiểm tra xem click có phải vào các nút toggle hay không
  const permissionToggle =
    permissionDropdownContainer.value?.querySelector("button")
  const userDropdownToggle = event.target.closest(
    'button[data-dropdown="user-access"]'
  )

  // Kiểm tra xem click có phải vào nội dung của dropdown hay không
  const permissionContent = document.querySelector(
    ".permission-dropdown-content"
  )
  const userDropdownContent = document.querySelector(".user-dropdown")

  const isInsideDropdown = [
    permissionToggle,
    userDropdownToggle,
    permissionContent,
    userDropdownContent,
  ].some((el) => el?.contains(event.target))

  if (!isInsideDropdown) {
    isPermissionDropdownOpen.value = false
    activeUserDropdown.value = null
  }
}

onMounted(() => {
  document.addEventListener("mousedown", handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener("mousedown", handleClickOutside)
})

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

  const currentUserId = store.state.user.id
  const sharedUserIds = sharedUsers.value.map((u) => u.name)
  const existingUserIds = (getUsersWithAccess.data || []).map((u) => u.user)

  // Filter out current user, shared users, and users with existing access
  const availableUsers = allUsers.filter((k) => {
    return (
      k.name !== currentUserId &&
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

// Methods
const handleInputFocus = () => {
  isDropdownOpen.value = true
  showAllUsers.value = true
  showAllSharedUsers.value = false
}

const handleInputBlur = (event) => {
  // Don't close if clicking inside dropdown
  if (
    dropdownContainer.value &&
    dropdownContainer.value.contains(event.relatedTarget)
  ) {
    return
  }
  // Delay to allow click events to fire
  setTimeout(() => {
    isDropdownOpen.value = false
    showAllUsers.value = false
  }, 200)
}

const handleInputChange = () => {
  isDropdownOpen.value = true
  showAllSharedUsers.value = false
}

// Check if user is selected and add to shared users directly
const isUserSelected = (person) => {
  return sharedUsers.value.some((user) => user.name === person.name)
}

// Toggle user selection and add/remove from shared users immediately
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
  // Đóng cả user dropdown nếu đang mở
  activeUserDropdown.value = null
}

const dropdownPosition = ref(null)

// Cập nhật hàm toggleUserAccessDropdown
const toggleUserAccessDropdown = async (user, event) => {
  event.stopPropagation()
  const isClosing = activeUserDropdown.value === user.user

  // Đóng permission dropdown nếu đang mở
  isPermissionDropdownOpen.value = false

  // Toggle user dropdown
  activeUserDropdown.value = isClosing ? null : user.user
  showAllSharedUsers.value = false

  if (!isClosing) {
    // Đợi DOM update
    await nextTick()

    // Tính toán vị trí của button
    const buttonElement = event.currentTarget
    const rect = buttonElement.getBoundingClientRect()

    // Đặt dropdown ngay dưới button, căn phải
    dropdownPosition.value = {
      top: rect.bottom + window.scrollY + 4, // 4px gap
      left: rect.right + window.scrollX - 150, // 192px = w-48 (12rem)
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
    activeUserDropdown.value = null
    let access = {}
    if (newAccessLevel === "editor") {
      access = { read: 1, comment: 1, share: 1, write: 1 }
    } else if (newAccessLevel === "reader") {
      access = { read: 1, comment: 1, share: 1, write: 0 }
    } else {  access = { method: 'unshare' } } 

    await updateAccess.submit({
      entity_name: props.entity.name,
      user: user.user,
      ...access,
    })

    // Nếu là unshare, xóa user khỏi danh sách ngay lập tức
    if (newAccessLevel === 'unshare') {
      const index = getUsersWithAccess.data.findIndex(u => u.user === user.user)
      if (index > -1) {
        getUsersWithAccess.data.splice(index, 1)
      }
    } else {
      // Update local data cho các trường hợp khác
      Object.assign(user, access)
    }

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

const closeAllDropdowns = () => {
  isPermissionDropdownOpen.value = false
  activeUserDropdown.value = null
}

const closeDialog = () => {
  emit("update:modelValue", "")
  // Reset overflow khi đóng dialog
  document.body.style.overflow = ""
}

// Function to check if an element is inside a dropdown
const isInsideDropdown = (element) => {
  const dropdownElements = [
    permissionDropdownContainer.value?.querySelector("button"),
    document.querySelector('button[data-dropdown="user-access"]'),
    document.querySelector(".permission-dropdown-content"),
    document.querySelector(".user-dropdown"),
  ]

  return dropdownElements.some((el) => el?.contains(element))
  if (!clickedInside) {
    isPermissionDropdownOpen.value = false
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

// Watch activeUserDropdown to handle body scroll
watch(activeUserDropdown, (newValue) => {
  if (newValue) {
    document.body.style.overflow = "hidden"
  } else {
    document.body.style.overflow = ""
  }
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

// Clear selected users when dropdown closes
watch(isDropdownOpen, (isOpen) => {
  if (!isOpen && query.value === "") {
    // Only clear query if dropdown is closing and no search query
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
