<template>
  <div class="pt-4 overflow-x-hidden relative">
    <div
      class="px-5 overflow-y-auto"
      :style="{ height: scrollableHeight }"
      ref="scrollContainer"
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
          @click="$emit('close')"
          :class="isSmallScreen ? 'text-gray-600 hover:text-gray-800' : ''"
        />
      </div>

      <!-- Comments List -->
      <div class="pt-5">
        <div
          v-for="topic in topics.data?.topics || []"
          :key="topic.name"
          class="border border-gray-200 rounded-lg mb-6 shadow-[0_2px_4px_rgba(0,0,0,0.1)] transition-all hover:shadow-md flex flex-col p-2"
          :class="{ 'cursor-pointer !pb-1': !showReplyInput[topic.name] }"
          @mouseenter="hoveredTopic = topic.name"
          @mouseleave="hoveredTopic = null"
          @click="toggleReplyInput(topic.name)"
          v-on-click-outside="
            (event) => {
              if (
                !event.target.closest('.emoji-picker-container') &&
                !event.target.closest('.emoji-picker-popup_1')
              ) {
                console.log('Clicked outside topic:', event.target)
                closeTopicInput(topic.name)
              }
            }
          "
        >
          <div
            v-for="(comment, index) in topic.comments"
            :key="comment.id"
            :ref="setCommentRef(comment.name)"
            class="flex flex-col transition-all duration-300 px-1 !pb-[2px] pt-[10px]"
            :class="{
              'highlighted-comment': highlightedCommentId === comment.name
            }"
          >
            <div class="flex items-start justify-start">
              <CustomAvatar
                :label="getInitials(comment.comment_by)"
                :image="comment.user_image"
                class="!min-w-8 !h-8"
              />
              <div class="ml-2 w-full">
                <div
                  class="flex flex-row mb-1 items-center justify-between text-base gap-x-1 text-ink-gray-5"
                >
                  <span
                    class="font-medium text-ink-gray-8 truncate max-w-[140px]"
                  >
                    {{ comment.comment_by }}
                  </span>
                  <div class="flex flex-row items-center gap-2">
                    <!-- Reactions -->
                    <div class="flex flex-wrap items-center gap-2">
                      <div class="relative emoji-picker-container">
                        <Button
                          size="sm"
                          variant="outlined"
                          class="add-reaction-btn !p-1 !w-6 !h-6 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-all duration-200"
                          @click.stop="toggleEmojiMenu(comment, $event)"
                        >
                          <LucideSmilePlus class="size-4" />
                        </Button>

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
                                    (openEmojiFor = null)
                                "
                              >
                                {{ e }}
                              </button>
                            </div>
                          </Transition>
                        </Teleport>
                      </div>
                    </div>
                    <button
                      v-if="comment.comment_email !== userId"
                      @click.stop="handleReply(comment, topic.name)"
                      class="text-sm text-gray-700 hover:text-blue-600 flex items-center justify-end transition-colors duration-200"
                    >
                      <LucideMessageSquare class="w-4 h-4" />
                    </button>
                    <div
                      class="relative"
                      v-if="
                        comment.comment_email === userId ||
                        entity.owner === userId
                      "
                    >
                      <!-- Dropdown menu -->
                      <div
                        class="relative"
                        v-if="
                          comment.comment_email === userId ||
                          entity.owner === userId
                        "
                        v-on-click-outside="() => (openDropdownFor = null)"
                      >
                        <button
                          @click.stop="
                            toggleCommentActions(comment, topic, $event)
                          "
                          class="p-1 m-[-4px] hover:bg-gray-100 rounded-full transition-colors"
                        >
                          <LucideMoreHorizontal class="w-4 h-4 text-gray-500" />
                        </button>

                        <!-- Dropdown menu -->
                        <div
                          v-if="openDropdownFor === comment.name"
                          class="absolute right-0 mt-1 w-30 bg-white rounded-md shadow-lg border border-gray-200 z-50 overflow-hidden"
                        >
                          <div>
                            <button
                              v-if="comment.comment_email === userId"
                              @click.stop="
                                handleEditComment(comment, topic.name)
                              "
                              class="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                            >
                              <LucideEdit2 class="w-4 h-4 mr-2" />
                              {{ __("Sửa") }}
                            </button>

                            <button
                              v-if="
                                comment.comment_email === userId ||
                                entity.owner === userId
                              "
                              @click.stop="
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
                  </div>
                </div>
                <div class="comment-bubble bg-[#F5F5F5] p-2 rounded-[8px] ml-[-8px]">
                  <div
                    class="mb-1 text-base text-ink-gray-7 break-word leading-relaxed comment-content !text-[#404040]"
                    v-html="renderCommentContent(comment.content)"
                  ></div>
                  <div class="text-[#737373] text-[12px] font-[400] flex items-center gap-2">
                    {{ formatDate24(comment.creation) }}
                    <span 
                      v-if="comment.is_edited" 
                      class="text-[#999] italic"
                    >
                      (Đã chỉnh sửa)
                    </span>
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-2 mt-2">
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
                      @click.stop="toggleReaction(comment, r.emoji)"
                    >
                      <span class="text-base leading-none">{{ r.emoji }}</span>
                      <span class="text-xs font-semibold">{{ r.count }}</span>
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>

          <!-- Comment input for each topic -->
          <div class="min-h-[12px]">
            <!-- Hover hint -->
            <div
              v-if="!showReplyInput[topic.name] && hoveredTopic === topic.name"
              class="text-start text-[13px] pl-1 leading-[12px] text-blue-600 hover:text-blue-700 font-medium transition-colors cursor-pointer"
              @click.stop="toggleReplyInput(topic.name)"
            >
              {{ __("Trả lời...") }}
            </div>

            <!-- Reply/Edit section -->
            <div v-if="showReplyInput[topic.name]">
              <!-- Reply indicator -->
              <div
                v-if="replyingTo[topic.name]"
                class="mb-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between"
              >
                <div class="flex items-center gap-2">
                  <LucideMessageCircle class="w-4 h-4 text-blue-600" />
                  <span class="text-sm text-blue-700">
                    {{ __("Đang trả lời") }}
                    <span class="font-medium truncate">{{
                      replyingTo[topic.name].comment_by
                    }}</span>
                  </span>
                </div>
                <button
                  @click.stop="cancelReply(topic.name)"
                  class="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {{ __("Hủy") }}
                </button>
              </div>

              <!-- Edit indicator -->
              <div
                v-if="isEditMode(topic.name)"
                class="mb-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between"
              >
                <div class="flex items-center gap-2">
                  <LucideEdit2 class="w-4 h-4 text-blue-600" />
                  <span class="text-sm text-blue-700 font-medium">
                    {{ __("Đang chỉnh sửa bình luận") }}
                  </span>
                </div>
                <button
                  @click.stop="cancelEdit(topic.name)"
                  class="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {{ __("Hủy") }}
                </button>
              </div>

              <div
                class="flex flex-row items-center justify-start pl-1 pr-2 bg-white sticky z-[10] top-[100%] left-0 right-0 mt-1 border border-[#E5E5E5] rounded-[8px]"
                @click.stop
              >
                <div class="flex-1 min-w-0">
                  <RichCommentEditor
                    :ref="setTopicEditorRef(topic.name)"
                    v-model="topicComments[topic.name]"
                    :entity-name="entity.name"
                    :placeholder="
                      isEditMode(topic.name)
                        ? __('Chỉnh sửa bình luận...')
                        : __('Trả lời...')
                    "
                    @mentioned-users="
                      (val) => (topicMentionedUsers[topic.name] = val)
                    "
                    @input="updateCommentInputHeight"
                    @resize="updateCommentInputHeight"
                    @onEnter="() => postComment(topic.name)"
                  />
                </div>
                <div class="flex-shrink-0 self-start mt-[1px]">
                  <Button
                    class="hover:bg-transparent !p-2 !bg-transparent !border-none cursor-pointer ml-[-8px]"
                    variant="ghost"
                    :disabled="isTopicCommentEmpty(topic.name)"
                    @click.stop="() => postComment(topic.name)"
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
    </div>

    <!-- New topic input -->
    <div
      ref="commentInputRef"
      class="py-2 px-5"
    >
      <div
        class="flex flex-row items-center justify-start pl-1 pr-2 bg-white sticky !z-[1] top-[100%] left-0 right-0 border border-[#E5E5E5] rounded-[8px]"
      >
        <div class="flex-1 min-w-0">
          <RichCommentEditor
            ref="topicEditor"
            v-model="newTopicComment"
            :entity-name="entity.name"
            :placeholder="__('Nhập bình luận...')"
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
import { vOnClickOutside } from "@vueuse/components"
import { call, createResource, Tooltip } from "frappe-ui"
import {
  LucideAlertTriangle,
  LucideCheck,
  LucideEdit2,
  LucideMessageCircle,
  LucideMessageSquare,
  LucideMoreHorizontal,
  LucideSmilePlus,
  LucideTrash2,
} from "lucide-vue-next"
import Button from "primevue/button"
import Dialog from "primevue/dialog"
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "vue"
import { useRoute, useRouter } from "vue-router"
import { useStore } from "vuex"
import { handleResourceError } from "../../utils/errorHandler"
import { formatDate } from "../../utils/format"
import { toast } from "../../utils/toasts"
import CustomAvatar from "../CustomAvatar.vue"

const props = defineProps({
  entity: {
    type: Object,
    required: true,
  },
  isSmallScreen: {
    type: Boolean,
    default: false,
  },
})

defineEmits(["close"])

const store = useStore()
const route = useRoute()
const router = useRouter()

// State management
const newTopicComment = ref("")
const newTopicMentionedUsers = ref([])
const topicComments = reactive({})
const topicMentionedUsers = reactive({})
const topicEditor = ref(null)
const topicCommentEditors = ref({})
const editingComment = reactive({})
const replyingTo = reactive({})
const showReplyInput = reactive({})
const hoveredTopic = ref(null)
const lastProcessedReply = reactive({})
const scrollContainer = ref(null)
const commentRefs = reactive({})
const highlightedCommentId = ref(null)

// Dialog state
const showPermissionDialog = ref(false)
const usersWithoutPermission = ref([])
const currentCommentContent = ref("")
const currentAction = ref(null)
const showDeleteDialog = ref(false)
const pendingDeleteComment = ref(null)
const pendingDeleteEntity = ref(null)

// Emoji picker state
const defaultEmojis = ["👍", "❤️", "😂", "🎉", "😮"]
const openEmojiFor = ref(null)
const emojiButtonPosition = ref({ top: 0, left: 0 })
const emojiPicker = ref(null)

// Comment input height
const commentInputRef = ref(null)
const commentInputHeight = ref(58)

// Computed
const userId = computed(() => store.state.user.id)
const fullName = computed(() => store.state.user.fullName)
const imageURL = computed(() => store.state.user.imageURL)

const scrollableHeight = computed(() => {
  return `calc(100vh - ${commentInputHeight.value + 16}px)`
})

const emojiPickerStyle = computed(() => {
  return {
    top: `${emojiButtonPosition.value.top + 8}px`,
    left: `${Math.max(8, emojiButtonPosition.value.left - 160)}px`,
  }
})

const isNewTopicCommentEmpty = computed(() => {
  return !newTopicComment.value || topicEditor.value?.isEmpty()
})

// Resources
const topics = createResource({
  url: "/api/method/drive.utils.users.get_topics_for_file",
  params: { drive_entity_id: props.entity?.name },
  onSuccess(data) {
    data.topics?.forEach((topic) => {
      if (!(topic.name in topicComments)) {
        topicComments[topic.name] = ""
        topicMentionedUsers[topic.name] = []
      }
      topic.comments.forEach((comment) => {
        comment.creation = formatDate(comment.creation)
      })
    })
    
    // Scroll to comment if comment_open query exists
    nextTick(() => {
      handleCommentOpenQuery()
    })
  },
  auto: true,
})

const deleteComment = createResource({
  url: "drive.utils.users.delete_comment",
  onSuccess(result) {
    if (result.success) {
      return result
    }
  },
  onError(error) {
    if (!handleResourceError(error)) {
      toast(error.message || "Đã có lỗi xảy ra")
    }
  },
})

const updateComment = createResource({
  url: "drive.utils.users.edit_comment",
  onSuccess(result) {
    if (result.success) {
      if (topics.data && topics.data.topics) {
        const updatedTopics = topics.data.topics.map((topic) => {
          const updatedComments = topic.comments.map((c) => {
            if (c.name === result.comment_id || c.name === result.name) {
              return {
                ...c,
                content: result.content,
                is_edited: true,
                modified: result.modified || new Date().toISOString(),
              }
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

      return result
    }
    throw new Error(result.message)
  },
  onError(error) {
    if (!handleResourceError(error)) {
      toast(error.message || "Đã có lỗi xảy ra")
    }
  },
})

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

function renderCommentContent(content) {
  if (content.includes("<") && content.includes(">")) {
    return content
  }
  return content
}

function updateCommentInputHeight() {
  if (commentInputRef.value) {
    commentInputHeight.value = commentInputRef.value.offsetHeight
  }
}

// Set ref for each comment
function setCommentRef(commentId) {
  return (el) => {
    if (el) {
      commentRefs[commentId] = el
    }
  }
}

// Handle comment_open query parameter
async function handleCommentOpenQuery() {
  const commentId = route.query.comment_open
  
  if (!commentId) return
  
  // Wait for refs to be populated
  await nextTick()
  
  // Small delay to ensure DOM is fully rendered
  setTimeout(() => {
    const commentElement = commentRefs[commentId]
    
    if (commentElement && scrollContainer.value) {
      // Scroll to comment
      commentElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center'
      })
      
      // Highlight comment
      highlightedCommentId.value = commentId
      
      // Remove highlight after 3 seconds
      setTimeout(() => {
        highlightedCommentId.value = null
        // Remove query parameter from URL
        const newQuery = { ...route.query }
        delete newQuery.comment_open

        const newUrl = router.resolve({
          path: route.path,
          query: newQuery
        }).href

        window.history.replaceState(null, '', newUrl)
      }, 5000)
      
    }
  }, 300)
}

// Watch for route changes
watch(() => route.query.comment_open, (newVal) => {
  if (newVal && topics.data) {
    handleCommentOpenQuery()
  }
})

const handleReply = async (comment, topicName) => {
  if (lastProcessedReply[topicName] === comment.name) {
    return
  }

  if (isEditMode(topicName)) {
    topicComments[topicName] = ""
    topicMentionedUsers[topicName] = []

    const editorRef = topicCommentEditors.value[topicName]
    if (editorRef && typeof editorRef.clear === "function") {
      editorRef.clear()
    }

    delete editingComment[topicName]
  }

  if (replyingTo[topicName] && replyingTo[topicName].comment_email !== comment.comment_email) {
    const editorRef = topicCommentEditors.value[topicName]
    if (editorRef && typeof editorRef.unlockMention === "function") {
      editorRef.unlockMention()
    }
    const editorRef2 = topicCommentEditors.value[topicName]
    if (editorRef2 && typeof editorRef2.clear === "function") {
      editorRef2.clear()
    }
    topicComments[topicName] = ""
    topicMentionedUsers[topicName] = []
  }

  replyingTo[topicName] = {
    comment_by: comment.comment_by,
    comment_email: comment.comment_email,
    user_image: comment.user_image,
  }

  lastProcessedReply[topicName] = comment.name

  showReplyInput[topicName] = true
  comment.showActions = false

  await nextTick()

  setTimeout(() => {
    const editorRef = topicCommentEditors.value[topicName]
    if (editorRef) {
      const hasMention = typeof editorRef.hasMention === "function" 
        ? editorRef.hasMention(comment.comment_email)
        : false

      if (!hasMention && typeof editorRef.insertMention === "function") {
        editorRef.insertMention({
          id: comment.comment_email,
          value: comment.comment_by,
          image: comment.user_image,
          author: userId.value,
          type: "user",
        })
      }

      if (typeof editorRef.lockMention === "function") {
        editorRef.lockMention(comment.comment_email)
      }

      if (typeof editorRef.focus === "function") {
        editorRef.focus()
      }
    }
  }, 150)
}

const cancelReply = (topicName) => {
  delete replyingTo[topicName]
  delete lastProcessedReply[topicName]

  const editorRef = topicCommentEditors.value[topicName]
  if (editorRef) {
    if (typeof editorRef.unlockMention === "function") {
      editorRef.unlockMention()
    }
    if (typeof editorRef.clear === "function") {
      editorRef.clear()
    }
  }

  topicComments[topicName] = ""
  topicMentionedUsers[topicName] = []
}

const cancelEdit = (topicName) => {
  topicComments[topicName] = ""
  topicMentionedUsers[topicName] = []
  delete lastProcessedReply[topicName]

  const editorRef = topicCommentEditors.value[topicName]
  if (editorRef && typeof editorRef.clear === "function") {
    editorRef.clear()
  }

  delete editingComment[topicName]
  showReplyInput[topicName] = false
}

async function submitComment(topicName) {
  const commentContent = topicComments[topicName]
  const mentionedUsers = topicMentionedUsers[topicName] || []
  const replyTo = replyingTo[topicName] || null

  try {
    const newComment = await call("drive.utils.users.add_comment", {
      reference_name: topicName,
      content: commentContent,
      comment_email: userId.value,
      comment_by: fullName.value,
      mentions: JSON.stringify(
        mentionedUsers.filter((u) => u.id !== replyTo?.comment_email)
      ),
      reply_to: replyTo ? JSON.stringify(replyTo) : null,
    })

    if (topics.data && topics.data.topics) {
      const topicIndex = topics.data.topics.findIndex(
        (t) => t.name === topicName
      )
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
          reaction_users: {},
        }

        topic.comments = [...(topic.comments || []), newCommentData]
        updatedTopics[topicIndex] = topic

        topics.setData({
          ...topics.data,
          topics: updatedTopics,
        })
      }
    }

    topicComments[topicName] = ""
    topicMentionedUsers[topicName] = []
    delete replyingTo[topicName]
    delete lastProcessedReply[topicName]

    showReplyInput[topicName] = false

    const editorRef = topicCommentEditors.value[topicName]
    if (editorRef) {
      if (typeof editorRef.unlockMention === "function") {
        editorRef.unlockMention()
      }
      if (typeof editorRef.clear === "function") {
        editorRef.clear()
      }
    }
  } catch (e) {
    console.log(e)
    topics.fetch()
  }
}

const toggleReplyInput = async (topicName) => {
  showReplyInput[topicName] = true
  await nextTick()

  setTimeout(() => {
    const editorRef = topicCommentEditors.value[topicName]
    if (editorRef) {
      if (typeof editorRef.focus === "function") {
        editorRef.focus()
      } else if (editorRef.$el && editorRef.$el.querySelector) {
        const input = editorRef.$el.querySelector(
          'input, textarea, [contenteditable="true"]'
        )
        if (input) {
          input.focus()
        }
      }
    }
  }, 100)
}

const closeTopicInput = (topicName) => {
  if (showReplyInput[topicName]) {
    const hasContent = !isTopicCommentEmpty(topicName)
    const isEditing = isEditMode(topicName)
    const isReplying = replyingTo[topicName]

    if (!hasContent && !isEditing && !isReplying) {
      showReplyInput[topicName] = false
    }
  }
}

const isEditMode = (topicName) => {
  return editingComment[topicName]?.commentId !== undefined
}

const getButtonText = (topicName) => {
  return isEditMode(topicName) ? __("Cập nhật") : __("Gửi")
}

const handleEditComment = async (comment, topicName) => {
  console.log("📝 Starting edit for comment:", comment.name)
  console.log("Original content:", comment.content)
  
  if (replyingTo[topicName]) {
    const editorRef = topicCommentEditors.value[topicName]
    if (editorRef && typeof editorRef.unlockMention === "function") {
      editorRef.unlockMention()
    }
    delete replyingTo[topicName]
    delete lastProcessedReply[topicName]
  }

  editingComment[topicName] = {
    commentId: comment.name,
    originalContent: comment.content,
  }

  showReplyInput[topicName] = true

  await nextTick()
  
  await new Promise(resolve => setTimeout(resolve, 100))
  
  const editorRef = topicCommentEditors.value[topicName]
  
  if (!editorRef) {
    console.error("❌ Editor ref not found for topic:", topicName)
    return
  }
  
  console.log("✅ Editor ref found:", editorRef)
  
  const mentions = extractMentionsFromHTML(comment.content)
  console.log("Extracted mentions:", mentions)
  
  if (typeof editorRef.waitForEditor === "function") {
    console.log("⏳ Waiting for editor to initialize...")
    const isReady = await editorRef.waitForEditor(3000)
    
    if (!isReady) {
      console.error("❌ Editor failed to initialize within timeout")
      return
    }
    console.log("✅ Editor is ready!")
  }
  
  let success = false
  if (typeof editorRef.setHTML === "function") {
    console.log("📄 Using setHTML method")
    success = editorRef.setHTML(comment.content)
  } 
  else if (editorRef.editor && typeof editorRef.editor.commands?.setContent === "function") {
    console.log("📄 Using direct editor.commands.setContent")
    editorRef.editor.commands.setContent(comment.content, false)
    success = true
  }
  else {
    console.warn("⚠️ No setHTML method found, using v-model")
    topicComments[topicName] = comment.content
    success = true
  }

  if (success) {
    if (mentions.length > 0) {
      topicMentionedUsers[topicName] = mentions
      console.log("✅ Updated mentioned users:", mentions)
    }

    setTimeout(() => {
      if (typeof editorRef.focus === "function") {
        editorRef.focus()
        console.log("✅ Editor focused")
      }
    }, 100)
  }

  comment.showActions = false
}

const extractMentionsFromHTML = (htmlContent) => {
  const mentions = []
  
  if (!htmlContent) return mentions

  try {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = htmlContent
    const mentionSpans = tempDiv.querySelectorAll('span.mention, span[data-type="mention"]')
    
    mentionSpans.forEach((span) => {
      const mention = {
        id: span.getAttribute('data-id'),
        value: span.getAttribute('data-label') || span.textContent.replace('@', ''),
        type: span.getAttribute('data-type') || 'user',
        author: span.getAttribute('data-author'),
        image: span.getAttribute('data-image'),
      }
      
      if (mention.id && mention.value) {
        mentions.push(mention)
      }
    })
  } catch (e) {
    console.error("Error extracting mentions from HTML:", e)
  }

  return mentions
}

const setTopicEditorRef = (topicName) => {
  return (el) => {
    if (el) {
      topicCommentEditors.value[topicName] = el
    }
  }
}

const isTopicCommentEmpty = (topicName) => {
  const content = topicComments[topicName]
  if (!content || content.trim() === "") return true

  const editorRef = topicCommentEditors.value[topicName]
  if (editorRef && typeof editorRef.isEmpty === "function") {
    return editorRef.isEmpty()
  }

  return !content || content.trim() === ""
}

async function postComment(topicName) {
  const commentContent = topicComments[topicName]
  const mentionedUsers = topicMentionedUsers[topicName] || []

  if (!commentContent) return

  try {
    if (isEditMode(topicName)) {
      await updateComment.submit({
        comment_id: editingComment[topicName].commentId,
        new_content: commentContent,
        mentions: JSON.stringify(mentionedUsers),
      })

      if (topics.data && topics.data.topics) {
        const updatedTopics = topics.data.topics.map((topic) => {
          if (topic.name === topicName) {
            const updatedComments = topic.comments.map((c) => {
              if (c.name === editingComment[topicName].commentId) {
                return {
                  ...c,
                  content: commentContent,
                  is_edited: true,
                  modified: new Date().toISOString(),
                }
              }
              return c
            })
            return { ...topic, comments: updatedComments }
          }
          return topic
        })

        topics.setData({
          ...topics.data,
          topics: updatedTopics,
        })
      }

      cancelEdit(topicName)
      return
    }

    if (mentionedUsers.length > 0) {
      const userEmails = mentionedUsers.map((u) => u.id)
      const permissionCheck = await call(
        "drive.api.product.check_users_permissions",
        {
          entity_name: props.entity?.name,
          user_emails: JSON.stringify(userEmails),
        }
      )

      const usersWithoutAccess = []
      permissionCheck.forEach((perm) => {
        if (!perm.has_permission) {
          const user = mentionedUsers.find((u) => u.id === perm.email)
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

    cancelReply(topicName)
  } catch (e) {
    console.error(e)
  }
}

const openDropdownFor = ref(null)

function toggleCommentActions(comment, topic, event) {
  event.stopPropagation()

  if (openDropdownFor.value === comment.name) {
    openDropdownFor.value = null
  } else {
    openDropdownFor.value = comment.name
  }
}

function closeDropdown(commentName) {
  if (openDropdownFor.value === commentName) {
    openDropdownFor.value = null
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
          entity_name: props.entity?.name,
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
      drive_entity_id: props.entity.name,
      content: newTopicComment.value,
      mentions: JSON.stringify(newTopicMentionedUsers.value),
    })

    if (topics.data && topics.data.topics) {
      const newTopicData = {
        name: newTopic.name || Date.now().toString(),
        title: newTopic.title || "New Topic",
        owner: userId.value,
        creation: new Date().toISOString(),
        modified: new Date().toISOString(),
        comments: newTopic.comments || [],
      }

      topicComments[newTopicData.name] = ""
      topicMentionedUsers[newTopicData.name] = []

      topics.setData({
        ...topics.data,
        topics: [...topics.data.topics, newTopicData],
        total_count: topics.data.topics.length + 1,
      })
    }

    newTopicComment.value = ""
    newTopicMentionedUsers.value = []
    if (topicEditor.value) {
      topicEditor.value.clear()
    }
  } catch (e) {
    console.log(e)
    topics.fetch()
  }
}

const confirmDelete = (commentId, entityId) => {
  pendingDeleteComment.value = commentId
  pendingDeleteEntity.value = entityId
  showDeleteDialog.value = true
}

const executeDelete = async () => {
  if (!pendingDeleteComment.value || !pendingDeleteEntity.value) return

  try {
    await deleteComment.submit({
      comment_id: pendingDeleteComment.value,
      entity_id: pendingDeleteEntity.value,
    })

    if (topics.data && topics.data.topics) {
      let topicIndexToRemove = -1
      const updatedTopics = topics.data.topics.map((topic, topicIndex) => {
        const updatedComments = topic.comments.filter(
          (c) => c.name !== pendingDeleteComment.value
        )

        if (updatedComments.length === 0) {
          topicIndexToRemove = topicIndex
        }

        return { ...topic, comments: updatedComments }
      })

      if (topicIndexToRemove !== -1) {
        updatedTopics.splice(topicIndexToRemove, 1)
      }

      topics.setData({
        ...topics.data,
        topics: updatedTopics,
      })
    }

    showDeleteDialog.value = false
    pendingDeleteComment.value = null
    pendingDeleteEntity.value = null
  } catch (e) {
    console.error("Error deleting comment:", e)
    topics.fetch()
    showDeleteDialog.value = false
  }
}

async function handleGrantAccess(usersToGrant) {
  try {
    const userEmails = usersToGrant.map((u) => u.id)
    await call("drive.api.product.grant_read_access_to_users", {
      entity_name: props.entity?.name,
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

async function toggleReaction(comment, emoji) {
  try {
    await call("drive.api.comments.react_to_comment", {
      entity_id: props.entity.name,
      comment_id: comment.name,
      emoji,
    })

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
    topics.fetch()
  }
}

function toggleEmojiMenu(comment, event) {
  if (openEmojiFor.value === comment.name) {
    openEmojiFor.value = null
  } else {
    const button = event.currentTarget
    const rect = button.getBoundingClientRect()
    emojiButtonPosition.value = {
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX,
    }
    openEmojiFor.value = comment.name
  }
}

function reactionTooltip(comment, emoji) {
  const map = comment.reaction_users || {}
  const names = map[emoji] || []
  if (!names.length) return ""
  return names.join(", ")
}

let clickOutsideHandler = null

onMounted(() => {
  clickOutsideHandler = (event) => {
    if (
      !event.target.closest(".emoji-picker-container") &&
      !event.target.closest(".emoji-picker-popup_1")
    ) {
      openEmojiFor.value = null
    }
  }
  document.addEventListener("click", clickOutsideHandler)

  if (commentInputRef.value) {
    const resizeObserver = new ResizeObserver(updateCommentInputHeight)
    resizeObserver.observe(commentInputRef.value)
  }
})

onUnmounted(() => {
  if (clickOutsideHandler) {
    document.removeEventListener("click", clickOutsideHandler)
  }
})

watch(newTopicComment, () => {
  setTimeout(updateCommentInputHeight, 50)
})

watch(
  () => props.entity,
  (newEntity) => {
    if (newEntity?.name) {
      topics.fetch({ drive_entity_id: newEntity.name })
    }
  }
)
</script>

<style scoped>
.comment-content {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  line-height: 1.5;
}

.comment-bubble {
  background: linear-gradient(135deg, #f8f9fa 0%, #f1f3f4 100%);
  transition: all 0.2s ease;
  width: fit-content;
  max-width: 225px;
}

/* Highlighted comment animation */
.highlighted-comment {
  animation: highlight-pulse 5s ease-in-out;
  background-color: rgba(59, 130, 246, 0.1);
  border-radius: 8px;
}

@keyframes highlight-pulse {
  0% {
    background-color: transparent;
    transform: scale(1);
  }
  10% {
    background-color: rgba(59, 130, 246, 0.1);
    transform: scale(1.02);
  }
  30% {
    background-color: rgba(59, 130, 246, 0.15);
  }
  70% {
    background-color: rgba(59, 130, 246, 0.1);
  }
  100% {
    background-color: transparent;
    transform: scale(1);
  }
}

:deep(.p-avatar) {
  background-color: #3b82f6 !important;
  color: white !important;
}

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

.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.3s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

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

:global(.emoji-picker-popup_1) {
  backdrop-filter: blur(8px);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.icon-button {
  padding: 4px;
  margin: -4px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: #6b7280;
  background-color: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.icon-button:hover {
  color: #374151;
  background-color: #f3f4f6;
  border-color: #e5e7eb;
}

.icon-button:active {
  transform: scale(0.95);
}
</style>