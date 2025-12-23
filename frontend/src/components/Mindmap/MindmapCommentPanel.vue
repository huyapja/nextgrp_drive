<template>
  <Teleport to="body">

    <div :class="[
      'comment-panel-list absolute right-0 w-[320px] bg-[#f5f6f7] z-[80] border-l',
      'transition-all duration-300',
      visible ? 'translate-x-0' : 'translate-x-full',
      closing ? 'animate-slide-out' : ''
    ]" style="top: 70px; bottom: 0;">
      <!-- Header -->
      <div class="flex py-4 px-3 items-center">
        <p class="font-medium">Nhận xét ({{ totalComments }})</p>
        <Popover @hide="clearCommentIdFromUrl" :dismissable="!galleryVisible" ref="op" class="w-[360px] history-mindmap-popover">
          <MindmapCommentHistory :visible="isHistoryOpen" :mindmapId="entityName" :scrollTarget="historyScrollTarget"
            :nodeMap="nodeMap" />
        </Popover>
        <div class="ml-auto">
          <i ref="historyIconRef" @click="toggleHistory"
            v-tooltip.top="{ value: 'Lịch sử bình luận', pt: { text: { class: ['text-[12px]'] } } }"
            class="pi pi-history cursor-pointer hover:text-[#3b82f6] transition-all duration-200 ease-out" />
          <i v-tooltip.top="{ value: 'Đóng', pt: { text: { class: ['text-[12px]'] } } }"
            class="pi pi-times cursor-pointer hover:text-[#3b82f6] transition-all duration-200 ease-out ml-5"
            @click="handleClose" />
        </div>
      </div>

      <div v-if="parsedGroups.length === 0" class="text-gray-400 text-sm p-3">
        Chưa có bình luận nào.
      </div>

      <!-- Danh sách comment -->
      <div class="p-3 overflow-y-auto overflow-x-hidden h-[calc(100%-100px)] comment-scroll-container">
        <div v-if="mindmap_comment_list.loading" class="text-gray-500 text-sm">
          Đang tải bình luận...
        </div>

        <div v-else>
          <div v-for="group in parsedGroups" :ref="el => setGroupRef(groupKeyOf(group), el)" :key="groupKeyOf(group)"
            @click="handleClickGroup(group, $event)" class="
            comment-panel
            group/comment-panel
            cursor-pointer
            relative
            mb-5 p-3 rounded bg-white border shadow-sm
            text-xs text-gray-500
          " :class="groupKeyOf(group) === activeGroupKey ? 'active' : ''"
            style="content-visibility: auto; contain-intrinsic-size: 180px;" data-comment-panel
            :data-node-comment="isEditing ? 'edit-' + groupKeyOf(group) : groupKeyOf(group)">

            <!-- Header node -->
            <div :class="[
              'relative flex items-center mb-2',
              stripLabel(group.node.data.label) !== '' && 'comment-panel-header'
            ]">

              <div class="comment-panel-quote relative truncate max-w-[120px] !text-[12px] text-[#646a73] pl-2"
                :title="stripLabel(group.node.data.label)" v-html="stripLabel(group.node.data.label)" />

              <div v-if="group.comments?.length === 0" class="h-[26px] opacity-0 visibility-hidden"></div>

              <div v-if="group.comments?.length > 0" class="
                ml-auto border rounded-[12px] px-[5px] py-[4px]
                flex items-center gap-2
                opacity-0
                group-hover/comment-panel:opacity-100
                transition-opacity duration-150
              ">
                <i v-tooltip.top="hasNextGroup(groupKeyOf(group))
                  ? { value: 'Tiếp (↓)', pt: { text: { class: ['text-[12px]'] } } }
                  : null" class="pi pi-angle-down !text-[13px]" :class="hasNextGroup(groupKeyOf(group))
                    ? 'cursor-pointer hover:text-blue-500'
                    : 'cursor-not-allowed opacity-40'"
                  @click.stop="hasNextGroup(groupKeyOf(group)) && selectNextGroup(groupKeyOf(group))" />

                <i v-tooltip.top="hasPrevGroup(groupKeyOf(group))
                  ? { value: 'Trước (↑)', pt: { text: { class: ['text-[12px]'] } } }
                  : null" class="pi pi-angle-up !text-[13px] mr-2" :class="hasPrevGroup(groupKeyOf(group))
                    ? 'cursor-pointer hover:text-blue-500'
                    : 'cursor-not-allowed opacity-40'"
                  @click.stop="hasPrevGroup(groupKeyOf(group)) && selectPrevGroup(groupKeyOf(group))" />

                <div class="panel-separate border-l w-[1px] h-[16px]" />

                <i v-tooltip.top="{ value: 'Sao chép liên kết', pt: { text: { class: ['text-[12px]'] } } }"
                  class="pi pi-link !text-[12px] mr-2 cursor-pointer" />
                <i data-resolved-trigger
                  v-tooltip.top="{ value: 'Giải quyết và ẩn', pt: { text: { class: ['text-[12px]'] } } }"
                  @click.stop="handleResolveGroup(group)" class="pi pi-check-circle !text-[12px] cursor-pointer" />
              </div>
            </div>

            <div v-for="c in group.comments" :key="c.name" :data-comment-id="c.name"
              :ref="el => setCommentRef(c.name, el)"
              class="group/comment-item relative flex items-start py-2 px-3 gap-2 mb-3">
              <!-- Action nổi bên phải (reaction + comment + more) -->
              <div @click.stop :class="[
                'absolute top-1 right-0 flex items-center gap-2 bg-white px-2 py-1 transition-all duration-150',
                openMenuCommentId === c.name
                  ? 'opacity-100'
                  : 'opacity-0 group-hover/comment-item:opacity-100'
              ]">


                <!-- Reaction -->
                <MindmapCommentQuickReaction :comment-id="c.name" :is-pending="isPending"
                  :has-user-reacted="hasUserReacted" @react="emoji => toggleReaction(c.name, emoji)" />

                <!-- Reply -->
                <i v-tooltip.top="{ value: 'Trả lời', pt: { text: { class: ['text-[12px]'] } } }"
                  class="pi pi-comment !text-[12px] text-gray-500 hover:text-blue-500 cursor-pointer"
                  @click="handleReply(c)" />

                <!-- More -->
                <div data-comment-more v-if="currentUser?.id === c.user?.email" class="relative">
                  <!-- Icon 3 chấm -->
                  <i class="pi pi-ellipsis-h !text-[12px] text-gray-500 hover:text-blue-500 cursor-pointer"
                    @click.stop="openCommentMenu(c, $event)"></i>
                </div>

                <div v-if="currentUser?.id !== c.user?.email" class="relative">
                </div>

              </div>

              <!-- Avatar -->
              <CustomAvatar :image="c.user?.user_image" :label="c.user?.full_name?.slice(0, 1)" shape="circle"
                size="small" />

              <!-- Nội dung -->
              <div class="w-full">
                <div class="flex items-center gap-2">
                  <div class="font-medium text-gray-700">
                    {{ c.user?.full_name }}
                  </div>

                  <span :title="displayTime(c)" :class="[
                    'text-[10px] text-gray-400 inline-block transition-all duration-150',
                    isEdited(c)
                      ? 'truncate max-w-[90px]'
                      : ''
                  ]">
                    {{ displayTime(c) }}
                  </span>

                </div>

                <div class="text-black comment-content mt-2">
                  <div v-html="c.parsedText"></div>

                  <div v-if="c.parsedImages.length" class="flex flex-wrap gap-1 mt-2">
                    <Image v-for="(src, index) in c.parsedImages" :key="src" :src="src" data-image-comment
                      imageClass="!w-[62px] h-[62px] object-cover cursor-zoom-in"
                      @click="openGallery(c.parsedImages, index)" />

                  </div>
                </div>

                <!-- Reaction bar -->
                <div v-if="getReactions(c.name)?.length" class="mt-2 flex items-center gap-1 flex-wrap">
                  <button v-for="r in getReactions(c.name)" :key="r.emoji" v-tooltip.top="{
                    value: reactionTooltip(r, r.emoji),
                    pt: { text: { class: 'text-[11px] leading-tight' } }
                  }" class="px-2 py-[2px] rounded-full border text-[11px]
         flex items-center gap-1 transition
         hover:bg-gray-100
         disabled:opacity-50
         disabled:cursor-not-allowed" :class="hasUserReacted(c.name, r.emoji)
          ? 'border-[#3b82f6] bg-[#eff6ff] text-[#3b82f6]'
          : 'border-gray-300 text-gray-600'" :disabled="isPending(c.name, r.emoji)"
                    @click.stop="toggleReaction(c.name, r.emoji)">
                    <span>{{ r.emoji }}</span>
                    <span>{{ r.count }}</span>
                  </button>



                </div>



              </div>
            </div>


            <!-- Empty state -->
            <div v-if="group.comments?.length === 0 && groupKeyOf(group) === activeGroupKey"
              class="flex items-start gap-2 my-5">
              <CustomAvatar :image="currentUser?.imageURL" :label="currentUser?.fullName?.slice(0, 1)" shape="circle"
                size="small" />

              <div>
                <div class="font-medium text-gray-700">
                  {{ currentUser?.fullName }}
                </div>
              </div>
            </div>

            <p v-if="groupKeyOf(group) !== activeGroupKey" class="pl-[50px] !text-[12px] opacity-0
                group-hover/comment-panel:opacity-100
                transition-opacity duration-150" data-reply-trigger @mousedown.stop
              @click.stop="handleReplyTrigger(group)">Trả lời...</p>

            <!-- Input -->
            <div class="mt-3 relative transition-opacity duration-150" :class="groupKeyOf(group) === activeGroupKey && !isEditing
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none h-0 overflow-hidden'">

              <div class="mention-portal-add absolute bottom-0 left-0 w-full h-full pointer-events-none"
                :data-node="groupKeyOf(group)"></div>


              <div class="flex gap-2 w-full border rounded">
                <div class="flex-1">
                  <CommentEditor :ref="el => {
                    if (!commentEditorRef.value) {
                      commentEditorRef.value = {}
                    }
                    if (groupKeyOf(group) === activeGroupKey) {
                      commentEditorRef.value[groupKeyOf(group)] = el
                    }
                  }" v-model="inputValue" :previewImages="previewImages" @submit="handleSubmitSafe" :members="members"
                    @navigate="handleNavigate" :nodeId="groupKeyOf(group)" :currentUser="currentUser?.id"
                    @open-gallery="openGalleryFromEditor" @paste-images="handlePasteImages"
                    :placeholder="group.comments?.length === 0 ? 'Thêm nhận xét' : 'Nhập bình luận'" />
                </div>

                <i class="pi pi-image text-gray-500 hover:text-blue-500 cursor-pointer text-base self-end mb-1 mr-2"
                  @click.stop="handleUploadCommentImage" />

              </div>

              <div class="flex items-center justify-end mt-3">

                <div v-if="inputValue.trim()" class="flex justify-end gap-2">
                  <button comment-add-form-cancel class="px-3 py-2 text-xs rounded bg-gray-200"
                    @click="handleCancel(group.comments?.length === 0)">
                    Huỷ
                  </button>
                  <button comment-add-form-submit class="px-3 py-2 text-xs rounded bg-[#3B82F6] text-white"
                    @click="handleSubmitSafe">
                    Đăng
                  </button>
                </div>
              </div>
            </div>


            <!-- INPUT EDIT COMMENT -->
            <div v-if="
              isEditing &&
              activeEditingComment &&
              groupKeyOf(group) ===
              `${activeEditingComment.node_id}__${activeEditingComment.session_index}`
            " class="mt-3 transition-opacity duration-150" comment-edit-form @click.stop>
              <div class="mention-portal-add absolute bottom-0 left-0 w-full h-full pointer-events-none"
                :data-node="'edit-' + groupKeyOf(group)"></div>
              <div class="flex gap-2 w-full border rounded bg-white">
                <div class="flex-1">
                  <CommentEditor :ref="el => {
                    if (!commentEditorRef.value) {
                      commentEditorRef.value = {}
                    }
                    if (editingCommentId === activeEditingComment?.name) {
                      commentEditorRef.value['edit-' + editingCommentId] = el
                    }
                  }" v-model="editingValue" :previewImages="previewImages" @submit="submitEdit(activeEditingComment)"
                    :members="members" @navigate="handleNavigate" :nodeId="'edit-' + groupKeyOf(group)"
                    @open-gallery="openGalleryFromEditor" @paste-images="handlePasteImages" />
                </div>

                <!-- ICON UPLOAD (TÙY CHỌN) -->
                <i class="pi pi-image text-gray-500 hover:text-blue-500 cursor-pointer text-base self-end mb-1 mr-2"
                  @click.stop="handleUploadCommentImage" />
              </div>

              <div class="flex justify-end gap-2 mt-3">
                <button comment-edit-cancel class="px-3 py-2 text-xs rounded bg-gray-200" @click.stop="cancelEdit">
                  Huỷ
                </button>

                <button comment-edit-submit class="px-3 py-2 text-xs rounded bg-[#3B82F6] text-white"
                  @click.stop="submitEdit(activeEditingComment)">
                  Lưu
                </button>
              </div>
            </div>


          </div>
        </div>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="activeComment" :style="dropdownStyle" data-comment-dropdown
        class="w-[160px] bg-white border rounded-lg shadow-lg py-1 text-xs text-gray-700">
        <div class="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2" @click="handleEditAndFocus">
          <span>Chỉnh sửa</span>
        </div>

        <div class="px-3 py-2 hover:bg-red-50 text-red-600 cursor-pointer flex items-center gap-2"
          @click="handleDeleteComment(deleteComment)">
          <span>Xoá</span>
        </div>
      </div>
    </Teleport>

    <Dialog :showHeader="false" dismissableMask v-model:visible="galleryVisible" modal class="hide-dialog-header"
      contentClass="!p-0">
      <Galleria :value="galleryItems" v-model:activeIndex="galleryIndex" :responsiveOptions="[
        { breakpoint: '1400px', numVisible: 5 },
        { breakpoint: '1024px', numVisible: 4 },
        { breakpoint: '768px', numVisible: 3 },
        { breakpoint: '560px', numVisible: 2 }
      ]" :showThumbnails="false" :showIndicators="false" :fullScreen="false"
        containerStyle="width: 100%; height: 100%;" class="w-full h-full">
        <!-- Ảnh full -->
        <template #item="{ item }">
          <div class="flex items-center justify-center w-full h-full overflow-hidden">
            <!-- ROTATE LAYER -->
            <div class="flex items-center justify-center transition-transform duration-200" :style="{
              transform: `rotate(${rotateDeg}deg)`
            }">
              <!-- SCALE LAYER -->
              <div class="transition-transform duration-150" :style="{
                transform: `scale(${imageScale})`,
                transformOrigin: `${originX}% ${originY}%`
              }" @wheel="handleImageWheel">
                <img :src="item.itemImageSrc" draggable="false"
                  class="max-w-full max-h-[70vh] object-contain select-none pointer-events-none" />
              </div>
            </div>
          </div>
        </template>



      </Galleria>
      <div v-if="galleryVisible" class="
  absolute top-4 right-6 z-20
  flex items-center gap-2
  px-3 py-1
  text-xs font-medium
  rounded-full
  bg-black/60 text-white
  select-none
">
        {{ galleryCounterText }}

        <div class="flex gap-2 ml-2 border-l border-white/30 pl-2">
          <i class="pi pi-refresh cursor-pointer hover:text-blue-400" title="Xoay trái" @click="rotateLeft" />
          <i class="pi pi-refresh cursor-pointer rotate-180 hover:text-blue-400" title="Xoay phải"
            @click="rotateRight" />
        </div>
      </div>

    </Dialog>

  </Teleport>

</template>


<script setup>

import { ref, watch, computed, nextTick, inject, defineExpose, onMounted, onBeforeUnmount, provide } from "vue"
import { call, createResource } from "frappe-ui"
import { useRoute } from "vue-router"
import { useStore } from "vuex"
import CustomAvatar from "../CustomAvatar.vue"
import { Dialog, Galleria, Tooltip } from "primevue"
import { useMindmapCommentRealtime } from "./composables/useMindmapCommentRealtime"
import { useMindmapCommentNavigation } from "./composables/useMindmapCommentNavigation"
import { useMindmapCommentData } from "./composables/useMindmapCommentData"
import { useMindmapCommentInput } from "./composables/useMindmapCommentInput"
import { useMindmapCommentEditInput } from "./composables/useMindmapCommentEditInput"
import { useScrollToActiveNode } from "./composables/useScrollToActiveNode"
import { useMindmapCommentMenu } from "./composables/useMindmapCommentMenu"
import { useMindmapAPI } from "./composables/useMindmapAPI"
import CommentEditor from "./MindmapCommentEditor.vue"
import { useCommentRefs } from "./composables/useCommentRefs"
import { useMindmapCommentImageUpload } from "./composables/useMindmapCommentImageUpload"
import Image from 'primevue/image';

import { useMindmapGallery } from "./composables/useMindmapGallery"
import { useGalleryZoom } from "./composables/useGalleryZoom"
import { useParsedComments } from "./composables/useParsedComments"
import { usePanelClose } from "./composables/usePanelClose"
import { useClickOutsideToResetActiveNode } from "./composables/useClickOutsideToResetActiveNode"
import { useResolvedNode } from "./composables/useResolvedNode"
import { useMindmapCommentReactions } from './composables/useMindmapCommentReactions'


import MindmapCommentHistory from './MindmapCommentHistory.vue'
import Popover from "primevue/popover"
import { useToast } from "primevue/usetoast"


import { timeAgo } from "./utils/timeAgo"
import MindmapCommentQuickReaction from "./MindmapCommentQuickReaction.vue"

// -----------------------------
const props = defineProps({
  visible: Boolean,
  node: Object,
  mindmap: Array,
  userAddComment: Boolean
})
const emit = defineEmits(["close", "cancel", "submit", "update:input", "update:node", "open-history", "highlight:node"])
const socket = inject("socket")


// -----------------------------

const store = useStore()
const route = useRoute()
const entityName = route.params.entityName
const comments = ref([])
const activeGroupKey = ref(null)
const commentEditorRef = ref({})
const groupRefs = ref({})
const previewImages = ref([])
const hasLoadedOnce = ref(false)
const openMenuCommentId = ref(null)
const hashCommentIdInternal = ref(null)
const hasData = ref(false)
const isUploadingImage = ref(false)
const pendingScroll = ref(null)
const hasConsumedRouteNode = ref(false)
const isNavigatingByKeyboard = ref(false)
const isSubmitting = ref(false)
const suppressAutoScroll = ref(false)
const op = ref(null)
const historyIconRef = ref(null)
const historyScrollTarget = ref(null)
const toast = useToast()


const suppressAutoOpenFromQuery =
  inject("suppressAutoOpenFromQuery", ref(null))


const isHistoryOpen = ref(false)

function toggleHistory(event) {
  isHistoryOpen.value = !isHistoryOpen.value

  if (isHistoryOpen.value) {
    op.value.show(event)
  } else {
    op.value.hide()
  }
}
function groupKeyOf(group) {
  return `${group.node.id}__${group.session_index}`
}

function parseGroupKey(key) {
  const [nodeId, session] = key.split("__")
  return { nodeId, session_index: Number(session) }
}

const currentUser = computed(() => store.state.user)

const { pickAndUploadImages, uploadImageFiles } = useMindmapCommentImageUpload({
  route,
  isPrivate: computed(() => props.mindmap?.is_private)
})

const {
  activeComment,
  dropdownStyle,
  openCommentMenu,
  handleEditComment,
  handleDeleteComment
} = useMindmapCommentMenu()

const { setCommentRef, scrollToComment } = useCommentRefs()

const { deleteComment } = useMindmapAPI({
  entityName
})


function setGroupRef(key, el) {
  if (el) {
    groupRefs.value[key] = el
  } else {
    delete groupRefs.value[key]
  }
}

const mindmap_comment_list = createResource({
  url: "drive.api.mindmap_comment.get_comments",
  method: "GET",
  auto: false,
  params: { mindmap_id: entityName },
  onSuccess(data) {
    comments.value = data || []
    hasData.value = true
  },
  onError(error) {
    // Xử lý lỗi khi DocType chưa tồn tại hoặc lỗi khác
    console.warn('⚠️ Failed to load comments:', error)
    // Không set comments để tránh crash, chỉ log warning
    comments.value = []
  }
})

watch(
  () => props.visible,
  async (isVisible) => {
    if (!isVisible) {
      pendingScroll.value = null
      hashCommentIdInternal.value = null
      return
    }
    if (!hasLoadedOnce.value) {
      await mindmap_comment_list.fetch()
      hasLoadedOnce.value = true
    }
    if (suppressAutoOpenFromQuery?.value === "query") return
    syncQueryNode()
  }
)


function isEdited(c) {
  if (!c) return false
  return new Date(c.modified) > new Date(c.creation)
}


function displayTime(c) {
  if (!c) return ""

  const created = new Date(c.creation)
  const modified = new Date(c.modified)

  const edited = modified > created

  if (edited) {
    return `${timeAgo(c.modified)} (đã chỉnh sửa)`
  }

  return timeAgo(c.creation)
}

// =============================
// 1. INPUT STATE + API ACTIONS
// =============================

const activeSessionIndex = computed(() => {
  if (!activeGroupKey.value) return null
  const [, session] = activeGroupKey.value.split("__")
  return Number(session)
})

const activeNode = computed(() => {
  if (!activeGroupKey.value) return null
  const { nodeId } = parseGroupKey(activeGroupKey.value)
  return nodeMap.value?.[nodeId] || null
})

const {
  inputValue,
  handleSubmit,
  handleCancel,
} = useMindmapCommentInput({
  activeGroupKey,
  activeNode,
  activeSessionIndex,
  entityName,
  emit,
  previewImages,
  commentEditorRef
})

async function handleSubmitSafe() {
  isSubmitting.value = true
  try {
    await handleSubmit()
  } finally {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isSubmitting.value = false
      })
    })
  }
}


const {
  editingCommentId,
  editingValue,
  startEdit,
  submitEdit,
  cancelEdit
} = useMindmapCommentEditInput({
  entityName,
  comments,
  onEditDone() {
    inputValue.value = ""
    previewImages.value = []
    commentEditorRef.value?.[activeGroupKey.value]?.clearValues?.()
  }
})


const isEditing = computed(() => !!editingCommentId.value)

const activeEditingComment = computed(() => {
  return comments.value.find(c => c.name === editingCommentId.value)
})

// =============================
// 2. ACTIVE NODE STATE CONTROL
// =============================
watch(
  () => props.node?.id,
  (newId) => {
    if (!newId) return
    if (!props.visible) return
    if (isNavigatingByKeyboard.value) return
    if (pendingScroll.value) return
    if (route.query?.node && !hasConsumedRouteNode.value) return

    pendingScroll.value = {
      type: "node",
      nodeId: newId,
      session: null
    }
  }
)

watch(
  () => props.node,
  (node) => {
    if (!node) return
    if (!props.visible) return

    if (!props.userAddComment) return

    const hasGroup = mergedGroupsFinal.value.some(
      g => g.node.id === node.id
    )

    if (!hasGroup) {
      activeGroupKey.value = `${node.id}__1`
    }
  },
  { immediate: true }
)


watch(
  pendingScroll,
  (task) => {
    if (!task) return
  },
  { flush: "post" }
)

// =============================
// 3. FOCUS + CLICK INTERACTION
// =============================
function handleClickGroup(group, e) {
  // 1. đang bôi đen text → không xử lý
  const selection = window.getSelection()
  if (selection && selection.toString().length > 0) {
    return
  }

  // 2. các element cần bỏ qua click
  if (e.target.closest("a")) return
  if (e.target.closest("[comment-add-form-cancel]")) return
  if (e.target.closest("[comment-add-form-submit]")) return
  if (e.target.closest("[data-mention-item]")) return
  if (e.target.closest("[data-image-comment]")) return
  if (e.target.closest("[data-upload-image-to-comment]")) return
  if (e.target.closest("[data-resolved-trigger]")) return
  if (e.target.closest('[data-reply-trigger]')) return

  // 3. validate group
  if (!group || !group.node?.id) return

  const groupKey = groupKeyOf(group)

  if (activeGroupKey.value === groupKey) {
    return
  }
  // 5. set active group
  activeGroupKey.value = groupKey

  nextTick(() => {
    scrollToActiveNode(groupKey)
    focusEditorOf(group)
  })

  emit("update:node", group.node)

}

function handleReplyTrigger(group) {
  const key = groupKeyOf(group)

  // 1. khóa auto scroll
  suppressAutoScroll.value = true

  // 2. active đúng group
  activeGroupKey.value = key

  // 3. focus editor của group đó
  nextTick(() => {
    focusEditorOf(group)
  })

  // 4. emit cho parent biết đây là hành động "reply"
  emit("highlight:node", group.node)
}


// =============================
// 4. SCROLL HANDLER
// =============================
const { scrollToActiveNode } = useScrollToActiveNode(groupRefs)


// =============================
// 5. DATA MERGE & COMPUTED
// =============================
const {
  members,
  stripLabel,
  mergedComments,
  mergedGroupsFinal,
  totalComments,
  nodeMap
} = useMindmapCommentData({
  comments,
  mindmap: computed(() => props.mindmap),
  activeGroupKey
})

// =============================
// 6. REALTIME
// =============================
useMindmapCommentRealtime({
  socket,
  entityName,
  comments,
  activeGroupKey
})


// =============================
// 7. KEYBOARD / GROUP NAVIGATION / GALLERY
// =============================

// gallery
const gallery = useMindmapGallery()
provide("mindmapGallery", gallery)

const {
  galleryVisible,
  galleryIndex,
  galleryItems,
  galleryCounterText,
  openGallery,
  openGalleryFromEditor
} = gallery

const {
  hasNextGroup,
  hasPrevGroup,
  selectNextGroup,
  selectPrevGroup
} = useMindmapCommentNavigation({
  activeGroupKey,
  mergedGroupsFinal,
  nodeMap,
  emit,
  galleryVisible,
  groupKeyOf
})

watch(
  activeGroupKey,
  async (key, prevKey) => {
    if (!key) return
    if (key === prevKey) return
    if (pendingScroll.value) return
    if (suppressAutoScroll.value) return

    await nextTick()
    scrollToActiveNode(key)
  },
  { flush: "post" }
)

// =============================
// 8. UI DIRECTIVES
// =============================
const vTooltip = Tooltip

const groups = computed(() => mergedGroupsFinal.value)


function handleNavigate(direction) {
  isNavigatingByKeyboard.value = true

  const currentId = activeGroupKey.value
  commentEditorRef.value?.[currentId]?.blur?.()

  if (direction === "next" && hasNextGroup(activeGroupKey.value)) {
    selectNextGroup(activeGroupKey.value)
  }

  if (direction === "prev" && hasPrevGroup(activeGroupKey.value)) {
    selectPrevGroup(activeGroupKey.value)
  }

  // reset flag sau khi DOM ổn định
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      isNavigatingByKeyboard.value = false
    })
  })
}


async function handleUploadCommentImage() {
  isUploadingImage.value = true
  const container = document.querySelector(".comment-scroll-container")

  let oldScrollTop = 0
  let oldHeight = 0

  if (container) {
    oldScrollTop = container.scrollTop
    oldHeight = container.scrollHeight
  }

  const urls = await pickAndUploadImages(entityName)

  urls.forEach(url => previewImages.value.push(url))

  await nextTick()

  if (container) {
    const newHeight = container.scrollHeight
    container.scrollTop = oldScrollTop + (newHeight - oldHeight)
  }
  requestAnimationFrame(() => {
    isUploadingImage.value = false
  })
}

async function handlePasteImages(files) {
  if (!files?.length) return

  isUploadingImage.value = true

  const container = document.querySelector(".comment-scroll-container")
  const oldScrollTop = container?.scrollTop || 0
  const oldHeight = container?.scrollHeight || 0

  const urls = await uploadImageFiles(files, entityName)

  urls.forEach(url => previewImages.value.push(url))

  await nextTick()

  if (container) {
    const newHeight = container.scrollHeight
    container.scrollTop = oldScrollTop + (newHeight - oldHeight)
  }

  isUploadingImage.value = false
}


// zoom
const {
  imageScale,
  originX,
  originY,
  rotateDeg,
  handleImageWheel,
  rotateLeft,
  rotateRight,
} = useGalleryZoom(galleryIndex)


// parsed comments
const { parsedGroups } = useParsedComments(groups)

// close panel
const { closing, handleClose } = usePanelClose(emit, commentEditorRef)


watch(galleryVisible, (v) => {
  if (!v) {
    imageScale.value = 1
    originX.value = 50
    originY.value = 50
    rotateDeg.value = 0
  }
})

useClickOutsideToResetActiveNode({
  activeGroupKey,
  inputValue,
  previewImages,
})


function insertReplyMention({ id, label }) {
  const nodeId = activeGroupKey.value
  if (!nodeId) return

  const editor = commentEditorRef.value?.value?.[nodeId]
  if (!editor) return

  // Chèn mention vào đầu nội dung (không phá nội dung cũ)
  editor.insertMention({
    id,
    label,
  })
}

function handleReply(c) {
  const replyKey = `${c.node_id}__${c.session_index}`

  // 🔒 khóa auto scroll
  suppressAutoScroll.value = true

  activeGroupKey.value = replyKey

  emit("highlight:node", c)

  nextTick(() => {
    const group = mergedGroupsFinal.value.find(
      g => groupKeyOf(g) === replyKey
    )
    if (!group) return

    focusEditorOf(group)

    insertReplyMention({
      id: c.user.email,
      label: c.user.full_name,
    })

    // 🔓 mở lại auto scroll sau khi ổn định
    requestAnimationFrame(() => {
      suppressAutoScroll.value = false
    })
  })
}




function focusEditorOf(group) {
  const key = groupKeyOf(group)
  nextTick(() => {
    const editor = commentEditorRef.value?.value?.[key]
    editor?.focus?.()
  })
}

async function handleEditAndFocus() {
  handleEditComment(startEdit)

  const c = activeEditingComment.value
  if (!c) return

  const groupKey = `${c.node_id}__${c.session_index}`
  activeGroupKey.value = groupKey

  suppressAutoScroll.value = true

  await nextTick()

  emit("highlight:node", c)

  const key = "edit-" + c.name
  const wrapper = commentEditorRef.value?.value?.[key]

  if (!wrapper) return

  const editor = wrapper.editor
  if (!editor) return

  await nextTick()

  const { doc } = editor.state
  const endPos = doc.content.size

  editor.commands.focus()
  editor.commands.setTextSelection(endPos)
}

const { resolveNode } = useResolvedNode({ activeNode, comments, entityName, activeSessionIndex })

async function handleResolveGroup(group) {
  if (!group?.node?.id) return

  const key = groupKeyOf(group)

  // đảm bảo activeGroupKey đang trỏ đúng group vừa bấm
  if (activeGroupKey.value !== key) {
    activeGroupKey.value = key
    emit("update:node", group.node)
    await nextTick()
  }

  resolveNode(group.node.data.label)
}

watch(
  [pendingScroll, hasData, mergedGroupsFinal, () => props.visible],
  async ([task, ready, _groups, visible]) => {
    if (!task) return
    if (!ready) return
    if (!visible) return

    await nextTick()

    // COMMENT
    if (task.type === "comment") {
      // 1. tìm comment
      const comment = comments.value.find(c => c.name === task.id)
      if (!comment) return

      // 2. set đúng groupKey của comment
      const key = `${comment.node_id}__${comment.session_index}`

      // set activeGroupKey TRƯỚC
      activeGroupKey.value = key

      // chờ DOM render group đó
      let retry = 20
      while (retry-- > 0 && !groupRefs.value[key]) {
        await nextTick()
      }

      // 3. scroll đến comment
      await new Promise(r => setTimeout(r, 200))
      const ok = scrollToComment(task.id)

      if (ok !== false) {
        pendingScroll.value = null
        hasConsumedRouteNode.value = true
      }

      return
    }


    if (task.type === "group") {
      const key = task.key

      let retry = 20
      while (retry-- > 0 && !groupRefs.value[key]) {
        await nextTick()
      }

      if (groupRefs.value[key]) {
        scrollToActiveNode(key)
        pendingScroll.value = null
      }

      return
    }


    if (task.type === "node") {
      const { nodeId, session } = task

      const groupsOfNode = mergedGroupsFinal.value
        .filter(g => g.node.id === nodeId)

      if (!groupsOfNode.length) {
        pendingScroll.value = null
        return
      }

      let targetGroup = null

      // Ưu tiên session nếu có
      if (session != null) {
        targetGroup = groupsOfNode.find(
          g => Number(g.session_index) === Number(session)
        )
      }

      // fallback: session mới nhất
      if (!targetGroup) {
        targetGroup = groupsOfNode
          .slice()
          .sort((a, b) => b.session_index - a.session_index)[0]
      }

      const key = groupKeyOf(targetGroup)

      // chờ DOM render
      let retry = 20
      while (retry-- > 0 && !groupRefs.value[key]) {
        await nextTick()
      }

      if (groupRefs.value[key]) {
        activeGroupKey.value = key
        scrollToActiveNode(key)
      }

      nextTick(() => {
        focusEditorOf(targetGroup)
      })

      pendingScroll.value = null
    }

    if (task.type === "history") {
      await nextTick()
      await new Promise(r => setTimeout(r, 300))
      const hash = window.location.hash || ""
      const params = new URLSearchParams(hash.replace("#", ""))

      // 1. set visible cho history
      isHistoryOpen.value = true

      // 2. set scroll target
      historyScrollTarget.value = {
        node_id: task.node_id,
        session_index: task.session_index,
        comment_id: params.get("comment_id") || null,
      }

      // 3. mở popover (CHỈ 1 LẦN)
      if (op.value && historyIconRef.value) {
        op.value.show({
          currentTarget: historyIconRef.value
        })
      }
      hasConsumedRouteNode.value = true
      pendingScroll.value = null
      return
    }


  },
  { flush: "post" }
)


function syncQueryNode() {
  if (suppressAutoOpenFromQuery?.value === "query") return
  if (pendingScroll.value) return
  if (hasConsumedRouteNode.value) return

  const nodeId = route.query?.node
  if (!nodeId) return

  const session = route.query?.session
    ? Number(route.query.session)
    : null

  pendingScroll.value = {
    type: "node",
    nodeId,
    session
  }

  hasConsumedRouteNode.value = true
}


watch(
  mergedGroupsFinal,
  (groups) => {
    if (!activeGroupKey.value) return

    const exists = groups.some(
      g => g.groupKey === activeGroupKey.value
    )

    // activeGroupKey trỏ vào group đã bị remove
    if (!exists) {
      // ưu tiên: group cùng node (nếu còn)
      const { nodeId } = parseGroupKey(activeGroupKey.value)

      const fallback =
        groups.find(g => g.node.id === nodeId) ||
        groups[0] || null

      activeGroupKey.value = fallback
        ? fallback.groupKey
        : null
    }
  },
  { flush: "post" }
)

watch(
  () => parsedGroups.value.length,
  (len) => {
    if (len === 0) {
      activeGroupKey.value = null
    }
  }
)

function clearCommentIdFromUrl() {
  const url = new URL(window.location.href)

  // xoá toàn bộ query
  url.search = ""

  // xoá hash
  url.hash = ""

  window.history.replaceState({}, "", url.toString())

  // reset state nội bộ
  hashCommentIdInternal.value = null
  pendingScroll.value = null
  historyScrollTarget.value = null
  isHistoryOpen.value = false
}

async function handleCommentIdFromUrl() {
  const hash = window.location.hash || ""
  if (!hash.startsWith("#comment_id=")) return

  const params = new URLSearchParams(hash.replace("#", ""))
  const commentId = params.get("comment_id")
  if (!commentId) return

  try {
    const res = await call(
      "drive.api.mindmap_comment.check_comment_exist",
      { comment_id: commentId }
    )

    // comment không tồn tại
    if (!res?.ok || !res.exists) {
      suppressAutoOpenFromQuery.value = "query"
      toast.add({
        severity: "warn",
        summary: "Bình luận không tồn tại",
        detail: "Bình luận này không còn tồn tại.",
        life: 3000,
      })
      clearCommentIdFromUrl()
      return
    }

    // comment đã resolve → CHỈ toast
    if (res.type === "history") {
      suppressAutoOpenFromQuery.value = "query"

      toast.add({
        severity: "info",
        summary: "Bình luận đã được xử lý",
        detail: "Bình luận này hiện đang nằm trong lịch sử bình luận.",
        life: 6000,
        group: "comment-history",
        data: {
          node_id: res.node_id,
          session_index: res.session_index,
          comment_id: commentId,
        }
      })

      // clearCommentIdFromUrl()
      return
    }

    // CHỈ comment còn mở mới auto open
    openPanelByCommentResult(res, commentId)

  } catch (e) {
    console.error("check_comment_exist failed:", e)
  }
}


function openPanelByCommentResult(res, commentId) {
  // comment còn đang mở
  if (res.type === "comment") {
    pendingScroll.value = {
      type: "comment",
      id: commentId,
    }
    hashCommentIdInternal.value = commentId
    return
  }

  // comment đã resolve → mở history
  if (res.type === "history") {
    hashCommentIdInternal.value = commentId
    return
  }
}

const openHistoryByCommand = inject("openHistoryByCommand")


onMounted(() => {
  handleCommentIdFromUrl()

  if (!openHistoryByCommand) return

  openHistoryByCommand.value = ({ node_id, session_index, comment_id }) => {
    emit("update:node", nodeMap.value?.[node_id] || null)
    emit("open-history")

    suppressAutoOpenFromQuery.value = null

    hashCommentIdInternal.value = comment_id || null

    hasConsumedRouteNode.value = true

    pendingScroll.value = {
      type: "history",
      node_id,
      session_index,
    }
  }

})

onBeforeUnmount(() => {
  if (openHistoryByCommand) {
    openHistoryByCommand.value = null
  }
})

defineExpose({
  focusEditorForNode(nodeId) {
    const group = mergedGroupsFinal.value.find(
      g => g.node.id === nodeId
    )
    if (!group) return

    const key = groupKeyOf(group)
    activeGroupKey.value = key

    nextTick(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          focusEditorOf(group)
        })
      })
    })
  }
})

const {
  fetchReactions,
  toggleReaction,
  getReactions,
  hasUserReacted,
  reactionTooltip,
  isPending
} = useMindmapCommentReactions({ socket })

watch(
  () => comments.value,
  (list) => {
    if (!list?.length) return
    fetchReactions(list.map(c => c.name))
  },
  { once: true }
)

</script>


<style scoped>
:global(.history-mindmap-popover) {
  --p-popover-arrow-offset: 0.25rem;
}

/* Xóa nền trắng của Dialog */
.hide-dialog-header .p-dialog-content {
  background: transparent !important;
  padding: 0 !important;
}

/* Xóa nền trắng của phần chứa Galleria */
.hide-dialog-header .p-galleria-content,
.hide-dialog-header .p-galleria,
.hide-dialog-header .p-galleria-item-wrapper,
.hide-dialog-header .p-galleria-item-container {
  background: transparent !important;
  box-shadow: none !important;
}

/* Tắt shadow bao quanh ảnh */
.hide-dialog-header .p-galleria-item {
  background: transparent !important;
}

/* Mask tối toàn màn hình (giống Messenger / Slack) */
.p-dialog-mask {
  background: rgba(0, 0, 0, 0.75) !important;
}

.comment-content :deep(p),
.comment-content :deep(div),
.comment-content :deep(span) {
  white-space: normal !important;
  word-break: break-word !important;
}


.comment-panel.active::before {
  border-top: 6px solid #ffc60a;
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
  content: "";
  left: -1px;
  position: absolute;
  right: -1px;
  top: -2px;
}

.comment-panel-header::before {
  content: "";
  background-color: #bbbfc4 !important;
  border-radius: 1px;
  content: "";
  height: 13.8px;
  left: 0;
  position: absolute;
  bottom: 0;
  width: 2px;
  transform: translateY(-50%);
}

.search-input {
  font-size: 12px;
  line-height: 1.4;
}

.search-input::placeholder {
  color: #9ca3af;
  font-size: 12px;
  opacity: 1;
}

.highlight-comment {
  background-color: #fff7c2 !important;
  transition: background-color 0.3s ease;
  border-radius: 6px;
}

.comment-content :deep(span[data-mention]) {
  background-color: #e7f3ff;
  color: #0b63c4;
  padding: 0px 4px;
  border-radius: 4px;
  font-weight: 500;
  white-space: nowrap;
}

/* Link trong nội dung comment */
.comment-content :deep(a) {
  color: #2563eb;
  /* xanh vừa, không gắt */
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  word-break: break-all;
  /* link dài không vỡ layout */
}

/* Active (click) */
.comment-content :deep(a:active) {
  color: #1e40af;
}

/* Đảm bảo click được, không bị overlay ăn */
.comment-content :deep(a) {
  pointer-events: auto;
}
</style>