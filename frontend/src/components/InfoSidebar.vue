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
          : 'xl:block border-l w-full max-w-[350px] min-w-[350px] shrink-0 transition-all duration-300 ease-in-out'
      ]"
    >
    <div class="h-full">
      <!-- Information Tab -->
      <div
        v-if="tab === 0"
        class="h-full flex flex-col"
      >
        <!-- Header -->
        <div class="flex justify-between items-center p-4 pb-5">
          <span class="font-[700] text-[#404040] text-[16px]">
            Thông tin
          </span>
          <Button
            icon="pi pi-times"
            severity="secondary" 
            text
            rounded
            size="small"
            @click="closeDrawer"
            :class="isSmallScreen ? 'text-gray-600 hover:text-gray-800' : ''"
          />
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 pt-0 space-y-6">
          <!-- Owner Section -->
          <div>
            <div class="text-[14px] font-[400] text-[#171717] mb-1">Chủ sở hữu</div>
            <div class="flex items-center space-x-[6px]">
              <CustomAvatar 
                :image="entity.user_image"
                :label="getInitials(entity.full_name)"  
                size="normal"
                shape="circle"
                class="bg-blue-500 text-white !w-5 !h-5"
              />
              <span class="text-[14px] font-[500] text-[#171717]">{{ entity.full_name || entity.owner }}</span>
            </div>
          </div>
          {{ usersPermission.data }}
          <!-- Shared With Section -->
          <div v-if="entity.owner === $store.state.user.id && usersPermission?.length > 0">
            <div class="text-[14px] font-[400] text-[#171717] mb-1">
              Người có quyền truy cập
            </div>
            <div class="flex flex-wrap items-center gap-[6px]">
              <div class="flex items-center" v-for="(user, index) in usersPermission?.slice(0, 2)">
                <div class="flex items-center space-x-[6px]">
                  <CustomAvatar
                    :key="user?.user_name"
                    :label="getInitials(user.full_name || user.user)"
                    :image="user.user_image"
                    size="normal"
                    shape="circle"
                    class="bg-blue-500 text-white -ml-1 border-2 border-white !w-5 !h-5"
                  />
                  <span class="text-[14px] font-[500] text-[#171717]">{{ user.full_name || user.user }}</span>
                </div>
                <span v-if="index === 0 && usersPermission?.length > 2" class="text-sm text-gray-600">,</span>
              </div>
              <span 
                v-if="usersPermission?.slice(2).length > 0"
                class="text-sm text-gray-600 ml-2"
              >
                và {{ usersPermission.slice(2).length }} người khác
              </span>
            </div>
          </div>

          <!-- Tags Section -->
          <div v-if="userId !== 'Guest'">
            <div class="text-[14px] font-[400] text-[#171717] mb-1">Nhãn</div>
          
            <!-- Tag Input Component -->
            <TagInput
              class="w-full"
              :entity="entity"
            />
          </div>

          <!-- Properties Section -->
          <div>
            <div class="space-y-4">
              <div class="">
                <p class="text-[14px] font-[400] text-[#171717] mb-1">Loại</p>
                <p class="text-[14px] font-[500] text-[#171717] mb-1">
                  {{ getFileTypeVi(entity.file_type) }}
                </p>
              </div>
              <div class="">
                <p class="text-[14px] font-[400] text-[#171717] mb-1">Kích thước</p>
                <p class="text-[14px] font-[500] text-[#171717] mb-1">
                  {{ entity.file_size_pretty }}
                </p>
              </div>
              <div class="">
                <p class="text-[14px] font-[400] text-[#171717] mb-1">Lần sửa đổi gần nhất</p>
                <p class="text-[14px] font-[500] text-[#171717] mb-1">
                  {{ formatDateVi(entity.modified) }} do {{ entity.owner === $store.state.user.id ? 'tôi' : entity.owner }} thực hiện
                </p>
              </div>
              <div class="">
                <p class="text-[14px] font-[400] text-[#171717] mb-1">Ngày tạo</p>
                <p class="text-[14px] font-[500] text-[#171717] mb-1">
                  {{ formatDateVi(entity.creation) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Comments Tab -->
      <div
        v-if="entity.comment && tab === 1"
        class="pt-4 overflow-x-hidden relative"
      >

        <div class="px-5 overflow-y-auto" :style="{ height: scrollableHeight }">
          <div class="flex justify-between items-center">
          <span class="font-[700] text-[#404040] text-[16px]">
            {{ __("Comments") }} {{ comments.data?.length ? `(${comments.data.length})` : '' }}
          </span>
          <Button
            icon="pi pi-times"
            severity="secondary" 
            text
            rounded
            size="small"
            @click="closeDrawer"
            :class="isSmallScreen ? 'text-gray-600 hover:text-gray-800' : ''"
          />
        </div>

          <!-- Check commenting permissions -->
          <div class="pt-5">
            <div
              v-for="comment in comments.data"
              :key="comment.name || comment"
              class="flex flex-col mb-5"
            >
              <div class="flex items-start justify-start">
                <!-- {{ comment }} -->
                <!-- :image="comment.user_image" -->
                <CustomAvatar 
                  :label="comment.comment_by"
                  :image="comment.user_image"
                  class="!min-w-8 !h-8"
                />
                <div class="ml-3">
                  <div
                    class="flex mb-1 items-center justify-start text-base gap-x-1 text-ink-gray-5"
                  >
                    <span class="font-medium text-ink-gray-8">{{
                      comment.comment_by
                    }}</span>
                  </div>
                  <div class="comment-bubble bg-[#F5F5F5] p-2 rounded-[8px]">
                    <div
                      class="mb-1 text-base text-ink-gray-7 break-word leading-relaxed comment-content !text-[#404040]"
                      v-html="renderCommentContent(comment.content)"
                    ></div>
                     <div class="text-[#737373] text-[12px] font-[400]">{{ formatDate24(comment.creation) }}</div>
                  </div>
                  <!-- Reactions -->
                  <div class="flex items-center gap-2 mt-2">
                    <Tooltip
                      v-for="r in (comment.reactions || [])"
                      :key="r.emoji"
                      :text="reactionTooltip(comment, r.emoji)"
                    >
                      <button
                        v-if="r.count > 0"
                        class="reaction-button inline-flex items-center gap-[0.5px] px-1 py-1 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105"
                        :class="r.reacted 
                          ? 'bg-blue-50 border border-blue-200 text-blue-700 shadow-sm' 
                          : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'"
                        @click="toggleReaction(comment, r.emoji)"
                      >
                        <span class="text-base leading-none">{{ r.emoji }}</span>
                        <span class="text-xs font-semibold">{{ r.count }}</span>
                      </button>
                    </Tooltip>
                    
                    <div class="relative emoji-picker-container">
                      <Button
                        size="sm"
                        variant="outlined"
                        class="add-reaction-btn !p-1 !w-6 !h-6 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-all duration-200"
                        @click.stop="toggleEmojiMenu(comment, $event)"
                      >
                        <LucideSmilePlus class="size-4" />
                      </Button>
                      
                      <!-- Emoji Picker Dropdown -->
                      <Teleport to="body">
                        <Transition name="emoji-picker">
                          <div
                            v-if="openEmojiFor === comment.name"
                            ref="emojiPicker"
                            class="emoji-picker-popup_1 fixed bg-white border border-gray-200 rounded-[8px] shadow-xl p-1 flex items-center gap-1 min-w-max"
                            :style="emojiPickerStyle"
                            style="z-index: 9999;"
                            @click.stop
                          >
                            <button
                              v-for="e in defaultEmojis"
                              :key="e"
                              class="flex items-center justify-center w-8 h-8 text-lg hover:bg-gray-100 rounded-md transition-colors duration-150"
                              @click="toggleReaction(comment, e); openEmojiFor = null"
                            >
                              {{ e }}
                            </button>
                          </div>
                        </Transition>
                      </Teleport>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div ref="commentInputRef" class="py-2 px-5">
          <div  class="flex flex-row items-center justify-start pl-1 pr-2 bg-white sticky z-[10] top-[100%] left-0 right-0 border border-[#E5E5E5] rounded-[8px]">
              <div class="flex-1 min-w-0">
                <RichCommentEditor
                  ref="richCommentEditor"
                  v-model="newComment"
                  :entity-name="entity.name"
                  :placeholder="__('Nhập tin nhắn...')"
                  @mentioned-users="(val) => (mentionedUsers = val)"
                  @input="updateCommentInputHeight"
                  @resize="updateCommentInputHeight"
                />
              </div>
              <div class="flex-shrink-0 self-start mt-[1px]">
                <Button
                  class="hover:bg-transparent !p-2 !bg-transparent !border-none cursor-pointer ml-[-8px]"
                  variant="ghost"
                  :disabled="isCommentEmpty"
                  @click="postComment"
                >
                  <SendIcon class="w-5 h-5" />
                </Button>
              </div>
          </div>
        </div>
      </div>

      <!-- Activity Tab -->
      <div
        v-if="entity.write && tab === 2"
        class="h-full flex flex-col"
      >
        <!-- Header -->
        <div class="flex justify-between items-center p-4 border-b border-gray-100">
          <span class="font-semibold text-gray-800 text-base">
            Hoạt động
          </span>
          <Button
            v-if="isSmallScreen"
            icon="pi pi-times"
            severity="secondary" 
            text
            rounded
            size="small"
            @click="closeDrawer"
            class="text-gray-600 hover:text-gray-800"
          />
        </div>
        
        <!-- Activity Content -->
        <div class="flex-1 overflow-y-auto p-4">
          <ActivityTree
            v-if="entity.write"
            :entity="entity"
          />
        </div>
      </div>
    </div>
  </div>
  </Transition>

  <!-- Permission Confirmation Dialog -->
  <PermissionConfirmDialog
    v-model="showPermissionDialog"
    :users-without-permission="usersWithoutPermission"
    :entity-name="entity?.title || entity?.name"
    :comment-content="newComment"
    @grant-access="handleGrantAccess"
    @post-without-permission="submitComment"
    @cancel="showPermissionDialog = false"
  />
</template>

<script setup>
import SendIcon from '@/assets/Icons/SendIcon.vue'
import RichCommentEditor from "@/components/DocEditor/components/RichCommentEditor.vue"
import PermissionConfirmDialog from "@/components/PermissionConfirmDialog.vue"
import TagInput from "@/components/TagInput.vue"
import emitter from "@/emitter"
import { generalAccess, userList } from "@/resources/permissions"
import { formatDate } from "@/utils/format"
import { call, createResource, Tooltip } from "frappe-ui"
import { LucideSmilePlus } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { useStore } from "vuex"
import ActivityTree from "./ActivityTree.vue"
import CustomAvatar from './CustomAvatar.vue'

// PrimeVue Components
import Button from 'primevue/button'

const store = useStore()
const newComment = ref("")
const mentionedUsers = ref([])
const richCommentEditor = ref(null)
const showPermissionDialog = ref(false)
const usersWithoutPermission = ref([])
const defaultEmojis = ["👍", "❤️", "😂", "🎉", "😮"]
const openEmojiFor = ref(null)
const emojiButtonPosition = ref({ top: 0, left: 0 })
const emojiPicker = ref(null)
const commentInputRef = ref(null)
const commentInputHeight = ref(58) // Default height

// Screen size detection
const isSmallScreen = ref(false)

const checkScreenSize = () => {
  isSmallScreen.value = window.innerWidth < 1440
}

// Update comment input height dynamically
const updateCommentInputHeight = () => {
  if (commentInputRef.value) {
    console.log(commentInputRef.value?.offsetHeight, 'height');
    commentInputHeight.value = commentInputRef.value.offsetHeight
  }
}

// Computed height for scrollable area
const scrollableHeight = computed(() => {
  return `calc(100vh - ${commentInputHeight.value + 16}px)` // 60px for header padding
})

// Calculate emoji picker position
const emojiPickerStyle = computed(() => {
  return {
    top: `${emojiButtonPosition.value.top + 8}px`,
    left: `${Math.max(8, emojiButtonPosition.value.left - 160)}px`,
  }
})

// Event listeners for closing emoji picker
let clickOutsideHandler = null
const refreshTrigger = ref(0)

onMounted(() => {
  checkScreenSize()
  window.addEventListener('resize', checkScreenSize)
  window.addEventListener('keydown', handleKeyDown)
  
  // Create click outside handler
  clickOutsideHandler = (event) => {
    // Check if click is outside emoji picker container or the teleported popup
    if (!event.target.closest('.emoji-picker-container') && 
        !event.target.closest('.emoji-picker-popup_1')) {
      openEmojiFor.value = null
    }
  }
  document.addEventListener('click', clickOutsideHandler)
  
  // Setup ResizeObserver for comment input
  if (commentInputRef.value) {
    const resizeObserver = new ResizeObserver(updateCommentInputHeight)
    resizeObserver.observe(commentInputRef.value)
  }

  emitter.on("refreshUserList", () => {
    if (entity.value?.name) {
      refreshTrigger.value++
      userList.fetch({ entity: entity.value.name })
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', checkScreenSize)
  window.removeEventListener('keydown', handleKeyDown)
  if (clickOutsideHandler) {
    document.removeEventListener('click', clickOutsideHandler)
  }
  emitter.off("refreshUserList")
})

const userId = computed(() => store.state.user.id)
const fullName = computed(() => store.state.user.fullName)
const imageURL = computed(() => store.state.user.imageURL)
const entity = computed(() => store.state.activeEntity)

const usersPermission = computed(() => {
  refreshTrigger.value
  if (userList.data?.length > 0) {
    return userList.data.filter(u => u.user !== userId.value)
  }
  return []
})

const tab = computed({
  get() {
    return store.state.infoSidebarTab
  }
})

const isCommentEmpty = computed(() => {
  return !newComment.value || richCommentEditor.value?.isEmpty()
})

// Utility functions
function getInitials(name) {
  if (!name) return "?"
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getFileTypeVi(type) {
  if (!type) return ''
  const map = {
    'pdf': 'Tệp PDF',
    'doc': 'Tài liệu Word',
    'docx': 'Tài liệu Word',
    'xls': 'Bảng tính Excel',
    'xlsx': 'Bảng tính Excel',
    'ppt': 'Bản trình chiếu PowerPoint',
    'pptx': 'Bản trình chiếu PowerPoint',
    'jpg': 'Ảnh JPG',
    'jpeg': 'Ảnh JPG',
    'png': 'Ảnh PNG',
    'gif': 'Ảnh GIF',
    'txt': 'Tệp văn bản',
    'csv': 'Tệp CSV',
    'zip': 'Tệp nén ZIP',
    'rar': 'Tệp nén RAR',
    'mp3': 'Âm thanh MP3',
    'mp4': 'Video MP4',
    'folder': 'Thư mục',
    'image': 'Hình ảnh'
  }
  return map[type?.toLowerCase()] || type
}

function formatDateVi(date) {
  if (!date) return ''
  const d = new Date(date)
  const day = d.toLocaleDateString("vi-VN")
  const time = d.toLocaleTimeString("vi-VN", { 
    hour: "2-digit", 
    minute: "2-digit", 
    hour12: false 
  })
  return `${day} ${time}`
}

function formatDate24(date) {
  const d = new Date(date)
  const day = d.toLocaleDateString("vi-VN")
  const time = d.toLocaleTimeString("vi-VN", { 
    hour: "2-digit", 
    minute: "2-digit", 
    hour12: false 
  })
  return `${time} ${day}`
}

function closeDrawer() {
  store.commit("setShowInfo", false)
}

// Handle ESC key for mobile drawer
const handleKeyDown = (event) => {
  if (event.key === 'Escape' && isSmallScreen.value && store.state.showInfo) {
    closeDrawer()
  }
}

function renderCommentContent(content) {
  if (content.includes('<') && content.includes('>')) {
    return content
  }
  return content
}

// Comment and reaction functions (keep existing logic)
async function postComment() {
  if (isCommentEmpty.value) return
  
  try {
    if (mentionedUsers.value && mentionedUsers.value.length > 0) {
      const userEmails = mentionedUsers.value.map(u => u.id)
      const permissionCheck = await call("drive.api.product.check_users_permissions", {
        entity_name: entity.value?.name,
        user_emails: JSON.stringify(userEmails)
      })
      
      const usersWithoutAccess = []
      permissionCheck.forEach(perm => {
        if (!perm.has_permission) {
          const user = mentionedUsers.value.find(u => u.id === perm.email)
          if (user) {
            usersWithoutAccess.push(user)
          }
        }
      })
      
      if (usersWithoutAccess.length > 0) {
        usersWithoutPermission.value = usersWithoutAccess
        showPermissionDialog.value = true
        return
      }
    }
    
    await submitComment()
  } catch (e) {
    console.log(e)
  }
}

async function submitComment() {
  try {
    await call("drive.utils.users.add_comment", {
      reference_doctype: "Drive File",
      reference_name: entity.value.name,
      content: newComment.value,
      comment_email: userId.value,
      comment_by: fullName.value,
      mentions: JSON.stringify(mentionedUsers.value),
    })
    newComment.value = ""
    mentionedUsers.value = []
    if (richCommentEditor.value) {
      richCommentEditor.value.clear()
    }
    comments.fetch()
  } catch (e) {
    console.log(e)
  }
}

async function handleGrantAccess(usersToGrant) {
  try {
    const userEmails = usersToGrant.map(u => u.id)
    await call("drive.api.product.grant_read_access_to_users", {
      entity_name: entity.value?.name,
      user_emails: JSON.stringify(userEmails)
    })
    
    await submitComment()
  } catch (e) {
    console.error("Error granting access:", e)
  }
}

async function toggleReaction(comment, emoji) {
  try {
    await call("drive.api.comments.react_to_comment", {
      comment_id: comment.name,
      emoji,
    })
    if (!comment.reactions) comment.reactions = []
    const existing = comment.reactions.find((r) => r.emoji === emoji)
    if (existing) {
      if (existing.reacted) {
        existing.count = Math.max(0, (existing.count || 1) - 1)
        existing.reacted = false
      } else {
        existing.count = (existing.count || 0) + 1
        existing.reacted = true
      }
    } else {
      comment.reactions.push({ emoji, count: 1, reacted: true })
    }
  } catch (e) {
    comments.fetch()
  }
}

function toggleEmojiMenu(comment, event) {
  if (openEmojiFor.value === comment.name) {
    openEmojiFor.value = null
  } else {
    // Get button position
    const button = event.currentTarget
    const rect = button.getBoundingClientRect()
    emojiButtonPosition.value = {
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX
    }
    openEmojiFor.value = comment.name
  }
}

let comments = createResource({
  url: "drive.api.files.list_entity_comments",
  onSuccess(data) {
    data.forEach((comment) => {
      comment.creation = formatDate(comment.creation)
    })
  },
  onError(error) {
    if (error.messages) {
      console.log(error.messages)
    }
  },
  auto: false,
})

// Watch for comment editor changes to update height
watch(newComment, () => {
  // Delay the height calculation to allow DOM to update
  setTimeout(updateCommentInputHeight, 50)
})

// Watch for entity changes
watch(entity, (newEntity) => {
  if (newEntity && typeof newEntity !== "number" && typeof newEntity !== "undefined") {
    if ((!newEntity.write && tab.value === 2) || (!newEntity.comment && tab.value === 1)) {
      store.commit("setInfoSidebarTab", 0)
    }
    
    comments.fetch({ entity_name: newEntity.name })
    generalAccess.fetch({ entity: newEntity.name })
    userList.fetch({ entity: newEntity.name })
  }
})

function reactionTooltip(comment, emoji) {
  const map = comment.reaction_users || {}
  const names = map[emoji] || []
  if (!names.length) return ""
  return names.join(", ")
}

function resize(e) {
  e.target.style.height = `${e.target.scrollHeight}px`
}
</script>

<style scoped>
.comment-content {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  line-height: 1.5;
}

/* Comment bubble styling */
.comment-bubble {
  background: linear-gradient(135deg, #f8f9fa 0%, #f1f3f4 100%);
  transition: all 0.2s ease;
  width: fit-content;
}

/* PrimeVue Avatar customization */
:deep(.p-avatar) {
  background-color: #3b82f6 !important;
  color: white !important;
}

/* Custom chip colors */
.bg-purple-100 {
  background-color: #f3e8ff !important;
}
.text-purple-700 {
  color: #7c3aed !important;
}
.bg-green-100 {
  background-color: #dcfce7 !important;
}
.text-green-700 {
  color: #15803d !important;
}

/* Overlay transitions */
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.3s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

/* Emoji picker transitions */
.emoji-picker-enter-active,
.emoji-picker-leave-active {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.emoji-picker-enter-from,
.emoji-picker-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}

.emoji-picker-enter-to,
.emoji-picker-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* Reaction button enhancements */
.reaction-button {
  position: relative;
  overflow: hidden;
  transform-origin: center;
}

.reaction-button:active {
  transform: scale(0.95);
}

.reaction-button::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.1);
  transition: all 0.3s ease;
  transform: translate(-50%, -50%);
  z-index: 0;
}

.reaction-button:hover::before {
  width: 120%;
  height: 120%;
}

.reaction-button > * {
  position: relative;
  z-index: 1;
}

/* Add button hover effect */
.add-reaction-btn {
  position: relative;
  overflow: hidden;
}

.add-reaction-btn::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(156, 163, 175, 0.1);
  transition: all 0.2s ease;
  transform: translate(-50%, -50%);
  z-index: 0;
}

.add-reaction-btn:hover::after {
  width: 120%;
  height: 120%;
}

/* Drawer transitions for mobile - slide from right to left */
@media (max-width: 1439px) {
  .drawer-enter-active,
  .drawer-leave-active {
    transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  }
  
  .drawer-enter-from,
  .drawer-leave-to {
    transform: translateX(100%);
  }
  
  .drawer-enter-to,
  .drawer-leave-from {
    transform: translateX(0);
  }
}

/* Hide scrollbar on webkit browsers */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #e5e7eb;
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #d1d5db;
}

/* Global styles for teleported emoji picker */
:global(.emoji-picker-popup_1) {
  backdrop-filter: blur(8px);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
</style>