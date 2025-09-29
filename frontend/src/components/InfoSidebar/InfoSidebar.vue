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
              <div class="text-[14px] font-[400] text-[#171717] mb-1">
                Chủ sở hữu
              </div>
              <div class="flex items-center space-x-[6px]">
                <CustomAvatar
                  :image="entity.user_image"
                  :label="getInitials(entity.full_name)"
                  size="normal"
                  shape="circle"
                  class="bg-blue-500 text-white !w-5 !h-5"
                />
                <span class="text-[14px] font-[500] text-[#171717]">{{
                  entity.full_name || entity.owner
                }}</span>
              </div>
            </div>
            {{ usersPermission.data }}
            <!-- Shared With Section -->
            <div
              v-if="
                entity.owner === $store.state.user.id &&
                usersPermission?.length > 0
              "
            >
              <div class="text-[14px] font-[400] text-[#171717] mb-1">
                Người có quyền truy cập
              </div>
              <div class="flex flex-wrap items-center gap-[6px]">
                <div
                  class="flex items-center"
                  v-for="(user, index) in usersPermission?.slice(0, 2)"
                >
                  <div class="flex items-center space-x-[6px]">
                    <CustomAvatar
                      :key="user?.user_name"
                      :label="getInitials(user.full_name || user.user)"
                      :image="user.user_image"
                      size="normal"
                      shape="circle"
                      class="bg-blue-500 text-white -ml-1 border-2 border-white !w-5 !h-5"
                    />
                    <span class="text-[14px] font-[500] text-[#171717]">{{
                      user.full_name || user.user
                    }}</span>
                  </div>
                  <span
                    v-if="index === 0 && usersPermission?.length > 2"
                    class="text-sm text-gray-600"
                    >,</span
                  >
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
                  <p class="text-[14px] font-[400] text-[#171717] mb-1">
                    Kích thước
                  </p>
                  <p class="text-[14px] font-[500] text-[#171717] mb-1">
                    {{ entity.file_size_pretty }}
                  </p>
                </div>
                <div class="">
                  <p class="text-[14px] font-[400] text-[#171717] mb-1">
                    Lần sửa đổi gần nhất
                  </p>
                  <p class="text-[14px] font-[500] text-[#171717] mb-1">
                    {{ formatDateVi(entity.modified) }} do
                    {{
                      entity.owner === $store.state.user.id
                        ? "tôi"
                        : entity.owner
                    }}
                    thực hiện
                  </p>
                </div>
                <div class="">
                  <p class="text-[14px] font-[400] text-[#171717] mb-1">
                    Ngày tạo
                  </p>
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
          <div
            class="px-5 overflow-y-auto"
            :style="{ height: scrollableHeight }"
          >
            <div class="flex justify-between items-center">
              <span class="font-[700] text-[#404040] text-[16px]">
                {{ __("Comments") }}
              </span>
              <Button
                icon="pi pi-times"
                severity="secondary"
                text
                rounded
                size="small"
                @click="closeDrawer"
                :class="
                  isSmallScreen ? 'text-gray-600 hover:text-gray-800' : ''
                "
              />
            </div>

            <!-- Check commenting permissions -->
            <div class="pt-5">
              <div
                v-for="topic in topics.data.topics"
                :key="topic.name"
                class="p-4 border border-gray-200 rounded-lg mb-6 shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
              >
                <div
                  v-for="comment in topic.comments"
                  :key="comment.id"
                  class="flex flex-col mb-5"
                >
                  <div class="flex items-start justify-start">
                    <!-- {{ comment }} -->
                    <!-- :image="comment.user_image" -->
                    <CustomAvatar
                      :label="getInitials(comment.comment_by)"
                      :image="comment.user_image"
                      class="!min-w-8 !h-8"
                    />
                    <div class="ml-3 w-full">
                      <div
                        class="flex flex-row mb-1 items-center justify-between text-base gap-x-1 text-ink-gray-5"
                      >
                        <span
                          class="font-medium text-ink-gray-8 truncate max-w-[170px]"
                          >{{ comment.comment_by }}</span
                        >

                        <div class="relative ml-2">
                          <button
                            @click="comment.showActions = !comment.showActions"
                            class="p-1 hover:bg-gray-100 rounded-full transition-colors"
                          >
                            <LucideMoreHorizontal
                              class="w-4 h-4 text-gray-500"
                            />
                          </button>

                          <!-- Dropdown menu -->
                          <div
                            v-if="comment.showActions"
                            class="absolute right-0 mt-1 w-30 bg-white rounded-md shadow-lg border border-gray-200 z-50 overflow-hidden"
                            v-on-click-outside="
                              () => (comment.showActions = false)
                            "
                          >
                            <div>
                              <!-- Edit action -->
                              <button
                                v-if="
                                  comment.comment_email === $store.state.user.id
                                "
                                @click="handleEditComment(comment, topic.name)"
                                class="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                              >
                                <LucideEdit2 class="w-4 h-4 mr-2" />
                                {{ __("Sửa") }}
                              </button>

                              <!-- Delete action -->
                              <button
                                v-if="
                                  comment.comment_email ===
                                    $store.state.user.id ||
                                  entity.owner === $store.state.user.id
                                "
                                @click="
                                  confirmDelete(comment.name, entity.name)
                                "
                                class="w-full px-4 py-2 text-sm text-red-600 hover:bg-gray-100 flex items-center"
                              >
                                <LucideTrash2 class="w-4 h-4 mr-2" />
                                {{ __("Xóa") }}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div
                        class="comment-bubble bg-[#F5F5F5] p-2 rounded-[8px]"
                      >
                        <div
                          class="mb-1 text-base text-ink-gray-7 break-word leading-relaxed comment-content !text-[#404040]"
                          v-html="renderCommentContent(comment.content)"
                        ></div>
                        <div class="text-[#737373] text-[12px] font-[400]">
                          {{ formatDate24(comment.creation) }}
                        </div>
                      </div>
                      <!-- Reactions -->
                      <div class="flex items-center gap-2 mt-2">
                        <Tooltip
                          v-for="r in comment.reactions || []"
                          :key="r.emoji"
                          :text="reactionTooltip(comment, r.emoji)"
                        >
                          <button
                            v-if="r.count > 0"
                            class="reaction-button inline-flex items-center gap-[0.5px] px-1 py-1 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105"
                            :class="
                              r.reacted
                                ? 'bg-blue-50 border border-blue-200 text-blue-700 shadow-sm'
                                : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'
                            "
                            @click="toggleReaction(comment, r.emoji)"
                          >
                            <span class="text-base leading-none">{{
                              r.emoji
                            }}</span>
                            <span class="text-xs font-semibold">{{
                              r.count
                            }}</span>
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
                                style="z-index: 9999"
                                @click.stop
                              >
                                <button
                                  v-for="e in defaultEmojis"
                                  :key="e"
                                  class="flex items-center justify-center w-8 h-8 text-lg hover:bg-gray-100 rounded-md transition-colors duration-150"
                                  @click="
                                    toggleReaction(comment, e),
                                    openEmojiFor = null
                                  "
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

                <!-- Comment input cho từng topic -->
                <div class="py-2">
                  <!-- Edit mode indicator -->
                  <div
                    v-if="isEditMode(topic.name)"
                    class="mb-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between"
                  >
                    <div class="flex items-center gap-2">
                      <LucideEdit2 class="w-4 h-4 text-blue-600" />
                      <span class="text-sm text-blue-700 font-medium">{{
                        __("Đang chỉnh sửa bình luận")
                      }}</span>
                    </div>
                    <button
                      @click="cancelEdit(topic.name)"
                      class="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {{ __("Hủy") }}
                    </button>
                  </div>

                  <div
                    class="flex flex-row items-center justify-start pl-1 pr-2 bg-white sticky z-[10] top-[100%] left-0 right-0 border border-[#E5E5E5] rounded-[8px]"
                  >
                    <div class="flex-1 min-w-0">
                      <RichCommentEditor
                        :ref="setTopicEditorRef(topic.name)"
                        v-model="topicComments[topic.name]"
                        :entity-name="entity.name"
                        :placeholder="
                          isEditMode(topic.name)
                            ? __('Chỉnh sửa bình luận...')
                            : __('Nhập bình luận...')
                        "
                        @mentioned-users="
                          (val) => (topicMentionedUsers[topic.name] = val)
                        "
                        @input="updateCommentInputHeight"
                        @resize="updateCommentInputHeight"
                      />
                    </div>
                    <div class="flex-shrink-0 self-start mt-[1px]">
                      <Button
                        class="hover:bg-transparent !p-2 !bg-transparent !border-none cursor-pointer ml-[-8px]"
                        variant="ghost"
                        :disabled="isTopicCommentEmpty(topic.name)"
                        @click="() => postComment(topic.name)"
                        :title="getButtonText(topic.name)"
                      >
                        <SendIcon
                          v-if="!isEditMode(topic.name)"
                          class="w-5 h-5"
                        />
                        <LucideCheck
                          v-else
                          class="w-5 h-5 text-blue-600"
                        />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Input tạo topic mới (ở ngoài) -->
          <div
            ref="commentInputRef"
            class="py-2 px-5"
          >
            <div
              class="flex flex-row items-center justify-start pl-1 pr-2 bg-white sticky z-[10] top-[100%] left-0 right-0 border border-[#E5E5E5] rounded-[8px]"
            >
              <div class="flex-1 min-w-0">
                <RichCommentEditor
                  ref="topicEditor"
                  v-model="newTopicComment"
                  :entity-name="entity.name"
                  :placeholder="__('Tạo chủ đề mới...')"
                  @mentioned-users="(val) => (newTopicMentionedUsers = val)"
                  @input="updateCommentInputHeight"
                  @resize="updateCommentInputHeight"
                />
              </div>
              <div class="flex-shrink-0 self-start mt-[1px]">
                <Button
                  class="hover:bg-transparent !p-2 !bg-transparent !border-none cursor-pointer ml-[-8px]"
                  variant="ghost"
                  :disabled="isNewTopicCommentEmpty"
                  @click="postTopic"
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
          <div
            class="flex justify-between items-center p-4 border-b border-gray-100"
          >
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
    :comment-content="currentCommentContent"
    @grant-access="handleGrantAccess"
    @post-without-permission="handlePostWithoutPermission"
    @cancel="showPermissionDialog = false"
  />

  <!-- Delete Confirmation Dialog -->
  <Dialog
    v-model:visible="showDeleteDialog"
    modal
    :header="__('Xác nhận xóa')"
    :style="{ width: '400px' }"
    :draggable="false"
  >
    <div class="flex flex-col gap-4">
      <div class="flex items-start gap-3">
        <div
          class="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"
        >
          <LucideAlertTriangle class="w-5 h-5 text-red-600" />
        </div>
        <div class="flex-1">
          <p class="text-gray-700">
            {{ __("Bạn có chắc chắn muốn xóa bình luận này?") }}
          </p>
          <p class="text-sm text-gray-500 mt-2">
            {{ __("Hành động này không thể hoàn tác.") }}
          </p>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button
          :label="__('Hủy')"
          severity="secondary"
          text
          @click="showDeleteDialog = false"
          :disabled="deleteComment.loading"
          class="!px-2.5 !text-[14px] leading-[14px] h-[32px] !py-0"
        />
        <Button
          :label="__('Xóa')"
          severity="danger"
          @click="executeDelete"
          :loading="deleteComment.loading"
          class="!border-red-600 !px-2.5 !text-[14px] leading-[14px] h-[32px] !py-0"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import SendIcon from "@/assets/Icons/SendIcon.vue"
import RichCommentEditor from "@/components/DocEditor/components/RichCommentEditor.vue"
import PermissionConfirmDialog from "@/components/PermissionConfirmDialog.vue"
import TagInput from "@/components/TagInput.vue"
import emitter from "@/emitter"
import { generalAccess, userList } from "@/resources/permissions"
import { vOnClickOutside } from "@vueuse/components"
import { call, createResource, Tooltip } from "frappe-ui"
import { LucideSmilePlus } from "lucide-vue-next"
import Dialog from "primevue/dialog"
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue"
import { useStore } from "vuex"

// PrimeVue Components
import Button from "primevue/button"
import { formatDate } from "../../utils/format"
import ActivityTree from "../ActivityTree.vue"
import CustomAvatar from "../CustomAvatar.vue"

const store = useStore()

// Tách riêng state cho từng loại comment
const newTopicComment = ref("") // Comment để tạo topic mới
const newTopicMentionedUsers = ref([]) // Mentioned users cho topic mới
const topicComments = reactive({}) // Comments cho từng topic
const topicMentionedUsers = reactive({}) // Mentioned users cho từng topic

// Refs cho editors
const topicEditor = ref(null)
const topicCommentEditors = ref({})

// Dialog state
const showPermissionDialog = ref(false)
const usersWithoutPermission = ref([])
const currentCommentContent = ref("")
const currentAction = ref(null) // 'topic' hoặc topic.name

// Existing refs
const defaultEmojis = ["👍", "❤️", "😂", "🎉", "😮"]
const openEmojiFor = ref(null)
const emojiButtonPosition = ref({ top: 0, left: 0 })
const emojiPicker = ref(null)
const commentInputRef = ref(null)
const commentInputHeight = ref(58) // Default height

// Delete confirmation state
const showDeleteDialog = ref(false)
const pendingDeleteComment = ref(null)
const pendingDeleteEntity = ref(null)

// Screen size detection
const isSmallScreen = ref(false)

const checkScreenSize = () => {
  isSmallScreen.value = window.innerWidth < 1440
}

// Update comment input height dynamically
const updateCommentInputHeight = () => {
  if (commentInputRef.value) {
    console.log(commentInputRef.value?.offsetHeight, "height")
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
  window.addEventListener("resize", checkScreenSize)
  window.addEventListener("keydown", handleKeyDown)

  // Create click outside handler
  clickOutsideHandler = (event) => {
    // Check if click is outside emoji picker container or the teleported popup
    if (
      !event.target.closest(".emoji-picker-container") &&
      !event.target.closest(".emoji-picker-popup_1")
    ) {
      openEmojiFor.value = null
    }
  }
  document.addEventListener("click", clickOutsideHandler)

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
  window.removeEventListener("resize", checkScreenSize)
  window.removeEventListener("keydown", handleKeyDown)
  if (clickOutsideHandler) {
    document.removeEventListener("click", clickOutsideHandler)
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
    return userList.data.filter((u) => u.user !== userId.value)
  }
  return []
})

const tab = computed({
  get() {
    return store.state.infoSidebarTab
  },
})

// Computed cho việc kiểm tra comment rỗng
const isNewTopicCommentEmpty = computed(() => {
  return !newTopicComment.value || topicEditor.value?.isEmpty()
})

const isTopicCommentEmpty = (topicName) => {
  const content = topicComments[topicName]
  if (!content || content.trim() === "") return true

  const editorRef = topicCommentEditors.value[topicName]
  if (editorRef && typeof editorRef.isEmpty === "function") {
    return editorRef.isEmpty()
  }

  return !content || content.trim() === ""
}

// Helper function để set ref cho editor
const setTopicEditorRef = (topicName) => {
  return (el) => {
    if (el) {
      topicCommentEditors.value[topicName] = el
    }
  }
}

// Utility functions
function getInitials(name) {
  if (!name) return "?"
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function getFileTypeVi(type) {
  if (!type) return ""
  const map = {
    pdf: "Tệp PDF",
    doc: "Tài liệu Word",
    docx: "Tài liệu Word",
    xls: "Bảng tính Excel",
    xlsx: "Bảng tính Excel",
    ppt: "Bản trình chiếu PowerPoint",
    pptx: "Bản trình chiếu PowerPoint",
    jpg: "Ảnh JPG",
    jpeg: "Ảnh JPG",
    png: "Ảnh PNG",
    gif: "Ảnh GIF",
    txt: "Tệp văn bản",
    csv: "Tệp CSV",
    zip: "Tệp nén ZIP",
    rar: "Tệp nén RAR",
    mp3: "Âm thanh MP3",
    mp4: "Video MP4",
    folder: "Thư mục",
    image: "Hình ảnh",
  }
  return map[type?.toLowerCase()] || type
}

function formatDateVi(date) {
  if (!date) return ""
  const d = new Date(date)
  const day = d.toLocaleDateString("vi-VN")
  const time = d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  return `${day} ${time}`
}

function formatDate24(date) {
  const d = new Date(date)
  const day = d.toLocaleDateString("vi-VN")
  const time = d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  return `${time} ${day}`
}

function closeDrawer() {
  store.commit("setShowInfo", false)
}

// Handle ESC key for mobile drawer
const handleKeyDown = (event) => {
  if (event.key === "Escape" && isSmallScreen.value && store.state.showInfo) {
    closeDrawer()
  }
}

function renderCommentContent(content) {
  if (content.includes("<") && content.includes(">")) {
    return content
  }
  return content
}

const editingComment = reactive({}) // { [topicName]: { commentId, originalContent } }
// Check if in edit mode for a topic
const isEditMode = (topicName) => {
  return editingComment[topicName]?.commentId !== undefined
}

// Get button text based on mode
const getButtonText = (topicName) => {
  return isEditMode(topicName) ? __("Cập nhật") : __("Gửi")
}

// Handle edit button click
const handleEditComment = async (comment, topicName) => {
  // Set edit mode
  editingComment[topicName] = {
    commentId: comment.name,
    originalContent: comment.content
  }
  
  // Fill content into editor
  topicComments[topicName] = comment.content
  
  // Focus editor
  await nextTick()
  const editorRef = topicCommentEditors.value[topicName]
  if (editorRef && typeof editorRef.focus === 'function') {
    editorRef.focus()
  }
  
  // Close dropdown
  comment.showActions = false
}

// Cancel edit mode
const cancelEdit = (topicName) => {
  // Clear content
  topicComments[topicName] = ""
  topicMentionedUsers[topicName] = []
  
  // Clear editor
  const editorRef = topicCommentEditors.value[topicName]
  if (editorRef && typeof editorRef.clear === 'function') {
    editorRef.clear()
  }
  
  // Exit edit mode
  delete editingComment[topicName]
}

// Modified postComment to handle both create and update
async function postComment(topicName) {
  const commentContent = topicComments[topicName]
  const mentionedUsers = topicMentionedUsers[topicName] || []
  
  if (!commentContent) return

  try {
    // Check if in edit mode
    if (isEditMode(topicName)) {
      // Update existing comment
      await updateComment.submit({
        comment_id: editingComment[topicName].commentId,
        new_content: commentContent
      })
      
      // Update local data
      if (topics.data && topics.data.topics) {
        const updatedTopics = topics.data.topics.map(topic => {
          if (topic.name === topicName) {
            const updatedComments = topic.comments.map(c => {
              if (c.name === editingComment[topicName].commentId) {
                return { ...c, content: commentContent }
              }
              return c
            })
            return { ...topic, comments: updatedComments }
          }
          return topic
        })
        
        topics.setData({
          ...topics.data,
          topics: updatedTopics
        })
      }
      
      // Clear edit mode
      cancelEdit(topicName)
      return
    }

    // Create new comment (existing logic)
    if (mentionedUsers.length > 0) {
      const userEmails = mentionedUsers.map(u => u.id)
      const permissionCheck = await call("drive.api.product.check_users_permissions", {
        entity_name: entity.value?.name,
        user_emails: JSON.stringify(userEmails)
      })

      const usersWithoutAccess = []
      permissionCheck.forEach(perm => {
        if (!perm.has_permission) {
          const user = mentionedUsers.find(u => u.id === perm.email)
          if (user) {
            usersWithoutAccess.push(user)
          }
        }
      })

      if (usersWithoutAccess.length > 0) {
        usersWithoutPermission.value = usersWithoutAccess
        currentCommentContent.value = commentContent
        currentAction.value = topicName
        showPermissionDialog.value = true
        return
      }
    }

    await submitComment(topicName)
  } catch (e) {
    console.log(e)
  }
}

// Existing submitComment function
async function submitComment(topicName) {
  const commentContent = topicComments[topicName]
  const mentionedUsers = topicMentionedUsers[topicName] || []
  
  try {
    const newComment = await call("drive.utils.users.add_comment", {
      reference_name: topicName,
      content: commentContent,
      comment_email: userId.value,
      comment_by: fullName.value,
      mentions: JSON.stringify(mentionedUsers),
    })
    
    if (topics.data && topics.data.topics) {
      const topicIndex = topics.data.topics.findIndex(t => t.name === topicName)
      if (topicIndex !== -1) {
        const updatedTopics = [...topics.data.topics]
        const topic = { ...updatedTopics[topicIndex] }
        
        const newCommentData = {
          name: newComment.name || Date.now().toString(),
          comment_by: fullName.value,
          comment_email: userId.value,
          content: commentContent,
          creation: formatDate(new Date().toISOString()),
          user_image: imageURL.value,
          reactions: [],
          reaction_users: {}
        }
        
        topic.comments = [...(topic.comments || []), newCommentData]
        updatedTopics[topicIndex] = topic
        
        topics.setData({
          ...topics.data,
          topics: updatedTopics
        })
      }
    }
    
    topicComments[topicName] = ""
    topicMentionedUsers[topicName] = []
    
    const editorRef = topicCommentEditors.value[topicName]
    if (editorRef && typeof editorRef.clear === 'function') {
      editorRef.clear()
    }
  } catch (e) {
    console.log(e)
    topics.fetch()
  }
}

const deleteComment = createResource({
  url: "drive.utils.users.delete_comment",
  onSuccess(result) {
    if (result.success) {
      return result
    }
    throw new Error(result.message)
  },
})

const handleDeleteComment = (commentId, entityId) => {
  confirmDelete(commentId, entityId)
}

// Delete confirmation function
const confirmDelete = (commentId, entityId) => {
  pendingDeleteComment.value = commentId
  pendingDeleteEntity.value = entityId
  showDeleteDialog.value = true
}

// Execute delete after confirmation
const executeDelete = async () => {
  if (!pendingDeleteComment.value || !pendingDeleteEntity.value) return

  try {
    await deleteComment.submit({
      comment_id: pendingDeleteComment.value,
      entity_id: pendingDeleteEntity.value,
    })

    // Cập nhật local data
    if (topics.data && topics.data.topics) {
      let topicIndexToRemove = -1
      const updatedTopics = topics.data.topics.map((topic, topicIndex) => {
        const updatedComments = topic.comments.filter(
          (c) => c.name !== pendingDeleteComment.value
        )

        // Nếu không còn comment nào, đánh dấu topic để xóa
        if (updatedComments.length === 0) {
          topicIndexToRemove = topicIndex
        }

        return { ...topic, comments: updatedComments }
      })

      // Xóa topic nếu không còn comment
      if (topicIndexToRemove !== -1) {
        updatedTopics.splice(topicIndexToRemove, 1)
      }

      topics.setData({
        ...topics.data,
        topics: updatedTopics,
      })
    }

    // Reset state và đóng modal
    showDeleteDialog.value = false
    pendingDeleteComment.value = null
    pendingDeleteEntity.value = null
  } catch (e) {
    console.error("Error deleting comment:", e)
    // Nếu có lỗi thì fetch lại
    topics.fetch()
    showDeleteDialog.value = false
  }
}

const updateComment = createResource({
  url: "drive.utils.users.edit_comment",
  onSuccess(result) {
    if (result.success) {
      return result
    }
    throw new Error(result.message)
  },
})

const handleUpdateComment = async (commentId, newContent) => {
  try {
    await updateComment.submit({
      comment_id: commentId,
      new_content: newContent,
    })

    // Cập nhật local data thay vì fetch lại
    if (topics.data && topics.data.topics) {
      const updatedTopics = topics.data.topics.map((topic) => {
        const updatedComments = topic.comments.map((c) => {
          if (c.name === commentId) {
            return { ...c, content: newContent }
          }
          return c
        })
        return { ...topic, comments: updatedComments }
      })

      topics.setData({
        ...topics.data,
        topics: updatedTopics,
      })
    }
  } catch (e) {
    console.log(e)
    // Nếu có lỗi thì fetch lại
    topics.fetch()
  }
}

async function postTopic() {
  if (isNewTopicCommentEmpty.value) return

  try {
    if (newTopicMentionedUsers.value?.length > 0) {
      const userEmails = newTopicMentionedUsers.value.map((u) => u.id)
      const permissionCheck = await call(
        "drive.api.product.check_users_permissions",
        {
          entity_name: entity.value?.name,
          user_emails: JSON.stringify(userEmails),
        }
      )

      const usersWithoutAccess = []
      permissionCheck.forEach((perm) => {
        if (!perm.has_permission) {
          const user = newTopicMentionedUsers.value.find(
            (u) => u.id === perm.email
          )
          if (user) {
            usersWithoutAccess.push(user)
          }
        }
      })

      if (usersWithoutAccess.length > 0) {
        usersWithoutPermission.value = usersWithoutAccess
        currentCommentContent.value = newTopicComment.value
        currentAction.value = "topic"
        showPermissionDialog.value = true
        return
      }
    }

    await submitTopics()
  } catch (e) {
    console.log(e)
  }
}

async function submitTopics() {
  try {
    const newTopic = await call("drive.utils.users.create_topic", {
      drive_entity_id: entity.value.name,
      content: newTopicComment.value,
      mentions: JSON.stringify(newTopicMentionedUsers.value),
    })

    // Cập nhật data local thay vì fetch lại
    if (topics.data && topics.data.topics) {
      const newTopicData = {
        name: newTopic.name || Date.now().toString(),
        title: newTopic.title || "New Topic",
        owner: userId.value,
        creation: new Date().toISOString(),
        modified: new Date().toISOString(),
        comments: newTopic.comments || [],
      }

      // Khởi tạo state cho topic mới
      topicComments[newTopicData.name] = ""
      topicMentionedUsers[newTopicData.name] = []

      // Thêm topic mới vào đầu danh sách
      topics.setData({
        ...topics.data,
        topics: [...topics.data.topics, newTopicData],
        total_count: topics.data.topics.length + 1,
      })
    }

    // Clear topic input
    newTopicComment.value = ""
    newTopicMentionedUsers.value = []
    if (topicEditor.value) {
      topicEditor.value.clear()
    }
  } catch (e) {
    console.log(e)
    // Nếu có lỗi thì fetch lại để đảm bảo data đúng
    topics.fetch()
  }
}

async function handleGrantAccess(usersToGrant) {
  try {
    const userEmails = usersToGrant.map((u) => u.id)
    await call("drive.api.product.grant_read_access_to_users", {
      entity_name: entity.value?.name,
      user_emails: JSON.stringify(userEmails),
    })

    await handlePostWithoutPermission()
  } catch (e) {
    console.error("Error granting access:", e)
  }
}

async function handlePostWithoutPermission() {
  if (currentAction.value === "topic") {
    await submitTopics()
  } else {
    await submitComment(currentAction.value)
  }
}

// Reaction functions
async function toggleReaction(comment, emoji) {
  try {
    await call("drive.api.comments.react_to_comment", {
      comment_id: comment.name,
      emoji,
    })

    // Cập nhật local data thay vì fetch lại
    if (topics.data && topics.data.topics) {
      const updatedTopics = topics.data.topics.map((topic) => {
        const updatedComments = topic.comments.map((c) => {
          if (c.name === comment.name) {
            const updatedComment = { ...c }
            if (!updatedComment.reactions) updatedComment.reactions = []

            const existing = updatedComment.reactions.find(
              (r) => r.emoji === emoji
            )
            if (existing) {
              if (existing.reacted) {
                existing.count = Math.max(0, (existing.count || 1) - 1)
                existing.reacted = false
              } else {
                existing.count = (existing.count || 0) + 1
                existing.reacted = true
              }
            } else {
              updatedComment.reactions.push({ emoji, count: 1, reacted: true })
            }

            return updatedComment
          }
          return c
        })
        return { ...topic, comments: updatedComments }
      })

      topics.setData({
        ...topics.data,
        topics: updatedTopics,
      })
    }
  } catch (e) {
    console.log(e)
    // Nếu có lỗi thì fetch lại
    topics.fetch()
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
      left: rect.left + window.scrollX,
    }
    openEmojiFor.value = comment.name
  }
}

let topics = createResource({
  url: "/api/method/drive.utils.users.get_topics_for_file",
  params: { drive_entity_id: entity.value?.name },
  onSuccess(data) {
    console.log("Fetched topics:", data)

    data.topics.forEach((topic) => {
      // Initialize comment state cho topic nếu chưa có
      if (!(topic.name in topicComments)) {
        topicComments[topic.name] = ""
        topicMentionedUsers[topic.name] = []
      }

      return topic.comments.forEach((comment) => {
        comment.creation = formatDate(comment.creation)
      })
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
watch(newTopicComment, () => {
  // Delay the height calculation to allow DOM to update
  setTimeout(updateCommentInputHeight, 50)
})

// Watch for entity changes
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

    topics.fetch({ drive_entity_id: newEntity.name })
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
  content: "";
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
  content: "";
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
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
</style>
