<template>
  <div :class="[
    'absolute top-0 right-0 h-full w-[320px] bg-[#f5f6f7] z-[80] border-l border-b',
    'transition-all duration-300',
    visible ? 'translate-x-0' : 'translate-x-full',
    closing ? 'animate-slide-out' : ''
  ]">
    <!-- Header -->
    <div class="flex py-4 px-3 items-center">
      <p class="font-medium">Nhận xét ({{ totalComments }})</p>
      <i class="pi pi-times ml-auto cursor-pointer hover:text-[#3b82f6] transition-all duration-200 ease-out"
        @click="handleClose" />
    </div>

    <div v-if="props?.node && mergedComments.length === 0"></div>

    <div v-else-if="mergedComments.length === 0" class="text-gray-400 text-sm p-3">
      Chưa có bình luận nào.
    </div>

    <!-- Danh sách comment -->
    <div class="p-3 overflow-y-auto overflow-x-hidden h-[calc(100%-100px)] comment-scroll-container">
      <div v-if="mindmap_comment_list.loading" class="text-gray-500 text-sm">
        Đang tải bình luận...
      </div>

      <div v-else>
        <div v-for="group in parsedGroups" :ref="el => setGroupRef(group.node.id, el)" :key="group.node.id"
          @click="group.node.id !== activeNodeId && handleClickGroup(group.node.id, $event)" class="
            comment-panel
            group/comment-panel
            cursor-pointer
            relative
            mb-5 p-3 rounded bg-white border shadow-sm
            text-xs text-gray-500
          " :class="group.node.id === activeNodeId ? 'active' : ''"
          style="content-visibility: auto; contain-intrinsic-size: 180px;" data-comment-panel
          :data-node-comment="isEditing ? 'edit-' + group.node.id : group.node.id">

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
              <i v-tooltip.top="hasNextGroup(group.node.id)
                ? { value: 'Tiếp (↓)', pt: { text: { class: ['text-[12px]'] } } }
                : null" class="pi pi-angle-down !text-[13px]" :class="hasNextGroup(group.node.id)
                  ? 'cursor-pointer hover:text-blue-500'
                  : 'cursor-not-allowed opacity-40'"
                @click.stop="hasNextGroup(group.node.id) && selectNextGroup(group.node.id)" />

              <i v-tooltip.top="hasPrevGroup(group.node.id)
                ? { value: 'Trước (↑)', pt: { text: { class: ['text-[12px]'] } } }
                : null" class="pi pi-angle-up !text-[13px] mr-2" :class="hasPrevGroup(group.node.id)
                  ? 'cursor-pointer hover:text-blue-500'
                  : 'cursor-not-allowed opacity-40'"
                @click.stop="hasPrevGroup(group.node.id) && selectPrevGroup(group.node.id)" />

              <div class="panel-separate border-l w-[1px] h-[16px]" />

              <i v-tooltip.top="{ value: 'Sao chép liên kết', pt: { text: { class: ['text-[12px]'] } } }"
                class="pi pi-link !text-[12px] mr-2 cursor-pointer" />
              <i class="pi pi-check-circle !text-[12px] cursor-pointer" />
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
              <i class="pi pi-thumbs-up !text-[12px] text-gray-500 hover:text-blue-500 cursor-pointer"></i>

              <!-- Reply -->
              <i v-tooltip.top="{ value: 'Trả lời', pt: { text: { class: ['text-[12px]'] } } }"
                class="pi pi-comment !text-[12px] text-gray-500 hover:text-blue-500 cursor-pointer"></i>

              <!-- More -->
              <div data-comment-more v-if="currentUser?.id === c.user?.email" class="relative">
                <!-- Icon 3 chấm -->
                <i class="pi pi-ellipsis-h !text-[12px] text-gray-500 hover:text-blue-500 cursor-pointer"
                  @click.stop="openCommentMenu(c, $event)"></i>

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

                <div v-if="c.parsedImages.length" class="flex flex-wrap gap-2 mt-2">
                  <Image data-image-comment v-for="src in c.parsedImages" :key="src" :src="src" preview
                    imageClass="rounded-md max-w-[140px]" />
                </div>
              </div>

            </div>
          </div>


          <!-- Empty state -->
          <div v-if="group.comments?.length === 0 && group.node.id === activeNodeId"
            class="flex items-start gap-2 my-5">
            <CustomAvatar :image="currentUser?.imageURL" :label="currentUser?.fullName?.slice(0, 1)" shape="circle"
              size="small" />

            <div>
              <div class="font-medium text-gray-700">
                {{ currentUser?.fullName }}
              </div>
            </div>
          </div>

          <!-- Input -->
          <div class="mt-3 relative transition-opacity duration-150" :class="group.node.id === activeNodeId && !isEditing
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none h-0 overflow-hidden'">

            <div class="mention-portal-add absolute bottom-0 left-0 w-full h-full pointer-events-none"
              :data-node="group.node.id"></div>


            <div class="flex gap-2 w-full border rounded">
              <div class="flex-1">
                <CommentEditor :ref="el => {
                  if (!commentEditorRef.value) {
                    commentEditorRef.value = {}
                  }
                  if (group.node.id === activeNodeId) {
                    commentEditorRef.value[group.node.id] = el
                  }
                }" v-model="inputValue" :previewImages="previewImages" @submit="handleSubmit" :members="members"
                  @navigate="handleNavigate" :nodeId="group.node.id" />
              </div>

              <i upload-image-to-comment
                class="pi pi-image text-gray-500 hover:text-blue-500 cursor-pointer text-base self-end mb-1 mr-2"
                @click="handleUploadCommentImage" />

            </div>

            <div class="flex items-center justify-end mt-3">

              <div v-if="inputValue.trim()" class="flex justify-end gap-2">
                <button comment-add-form-cancel class="px-3 py-2 text-xs rounded bg-gray-200"
                  @click="handleCancel(group.comments?.length === 0)">
                  Huỷ
                </button>
                <button comment-add-form-submit class="px-3 py-2 text-xs rounded bg-[#3B82F6] text-white"
                  @click="handleSubmit">
                  Đăng
                </button>
              </div>
            </div>
          </div>


          <!-- INPUT EDIT COMMENT -->
          <div v-if="isEditing && activeEditingComment?.node_id === group.node.id"
            class="mt-3 transition-opacity duration-150" comment-edit-form @click.stop>
            <div class="mention-portal-add absolute bottom-0 left-0 w-full h-full pointer-events-none"
              :data-node="'edit-' + group.node.id"></div>
            <div class="flex gap-2 w-full border rounded bg-white">
              <div class="flex-1">
                <CommentEditor :ref="el => {
                  if (!commentEditorRef.value) {
                    commentEditorRef.value = {}
                  }
                  if (editingCommentId === activeEditingComment?.name) {
                    commentEditorRef.value['edit-' + editingCommentId] = el
                  }
                }" v-model="editingValue" :previewImages="previewImages" @submit="handleSubmit" :members="members"
                  @navigate="handleNavigate" :nodeId="'edit-' + group.node.id" />
              </div>

              <!-- ICON UPLOAD (TÙY CHỌN) -->
              <i upload-image-to-comment
                class="pi pi-image text-gray-500 hover:text-blue-500 cursor-pointer text-base self-end mb-1 mr-2"
                @click="handleUploadCommentImage" />
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
      <div class="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
        @click="handleEditComment(startEdit)">
        <span>Chỉnh sửa</span>
      </div>

      <div class="px-3 py-2 hover:bg-red-50 text-red-600 cursor-pointer flex items-center gap-2"
        @click="handleDeleteComment(deleteComment)">
        <span>Xoá</span>
      </div>
    </div>
  </Teleport>

</template>


<script setup>

import { ref, watch, computed, nextTick, inject, defineExpose } from "vue"
import { createResource } from "frappe-ui"
import { useRoute } from "vue-router"
import { useStore } from "vuex"
import CustomAvatar from "../CustomAvatar.vue"
import { Tooltip } from "primevue"
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



import { timeAgo } from "./utils/timeAgo"

// -----------------------------
const props = defineProps({
  visible: Boolean,
  node: Object,
  mindmap: Array
})
const emit = defineEmits(["close", "cancel", "submit", "update:input", "update:node"])
const socket = inject("socket")


// -----------------------------

const store = useStore()
const route = useRoute()
const entityName = route.params.entityName
const comments = ref([])
const activeNodeId = ref(null)
const commentEditorRef = ref({})
const groupRefs = ref({})
const previewImages = ref([])
const hasLoadedOnce = ref(false)
const openMenuCommentId = ref(null)
const hashCommentIdInternal = ref(null)
const hasData = ref(false)


const isNavigatingByKeyboard = ref(false)


const currentUser = computed(() => store.state.user)

const { pickAndUploadImages } = useMindmapCommentImageUpload({
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


function setGroupRef(nodeId, el) {
  if (el) {
    groupRefs.value[nodeId] = el
  } else {
    delete groupRefs.value[nodeId]
  }
}

function parseCommentHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const images = [...doc.querySelectorAll("img")].map(img => img.src);

  // Xóa ảnh khỏi phần nội dung text
  doc.querySelectorAll("img").forEach(img => img.remove());

  return {
    text: doc.body.innerHTML.trim(),
    images,
  };
}

const parsedGroups = computed(() => {
  return groups.value.map(group => ({
    ...group,
    comments: group.comments.map(c => {
      const { text, images } = parseCommentHTML(c.parsed.safe_html || c.parsed.text)
      return {
        ...c,
        parsedText: text,
        parsedImages: images,
      }
    })
  }))
})


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

function syncHashCommentId() {
  const hash = window.location.hash || ""
  const params = new URLSearchParams(hash.replace("#", ""))
  hashCommentIdInternal.value = params.get("comment_id")
}

watch(
  () => props.visible,
  async isVisible => {
    if (!isVisible) return

    syncHashCommentId()


    if (!hasLoadedOnce.value) {
      await mindmap_comment_list.fetch()
      hasLoadedOnce.value = true
    }
    await new Promise(res => setTimeout(res, 350))
    await nextTick()

    if (hashCommentIdInternal.value && hasData) {
      scrollToComment(hashCommentIdInternal.value)
      return
    }
  },
  { immediate: true }
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

// -----------------------------
const closing = ref(false)

function clearCommentIdFromUrl() {
  const url = new URL(window.location.href)

  url.searchParams.delete("node")

  url.hash = ""

  window.history.replaceState({}, "", url.toString())
}


function handleClose() {
  closing.value = true
  commentEditorRef.value?.blur?.()

  clearCommentIdFromUrl()
  hashCommentIdInternal.value = null

  setTimeout(() => {
    emit("close")
    closing.value = false
  }, 250)
}


// =============================
// 1. INPUT STATE + API ACTIONS
// =============================
const {
  inputValue,
  handleSubmit,
  handleCancel,
  loadDraft
} = useMindmapCommentInput({
  activeNodeId,
  entityName,
  emit,
  previewImages,
  commentEditorRef
})

const {
  editingCommentId,
  editingValue,
  startEdit,
  submitEdit,
  cancelEdit
} = useMindmapCommentEditInput({
  entityName,
  comments
})


const isEditing = computed(() => !!editingCommentId.value)

const activeEditingComment = computed(() => {
  return comments.value.find(c => c.name === editingCommentId.value)
})

// =============================
// 2. ACTIVE NODE STATE CONTROL
// =============================
function resetActiveNode() {
  if (inputValue.value.trim() || previewImages.value.length) {
    return
  }

  activeNodeId.value = null
}

watch(
  () => props.node?.id,
  async (newId) => {
    if (!newId) {
      resetActiveNode()
      return
    }


    if (activeNodeId.value === newId) {
      return
    }

    activeNodeId.value = newId
    loadDraft(newId)

    scrollToActiveNode(newId)
  },
  { flush: "post" }
)



// =============================
// 3. FOCUS + CLICK INTERACTION
// =============================

function handleClickGroup(nodeId, e) {
  if (!nodeId) return
  if (e.target.closest("[comment-add-form-cancel]")) return
  if (e.target.closest("[comment-add-form-submit]")) return
  if (e.target.closest("[data-mention-item]")) return
  if (e.target.closest("[data-image-comment]")) return

  // Click lại chính node đang active → chỉ focus input
  if (props.node?.id === nodeId) {
    return
  }

  const node = nodeMap.value[nodeId] || { id: nodeId }
  emit("update:node", node)

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
  activeNodeId
})

// =============================
// 6. REALTIME
// =============================
useMindmapCommentRealtime({
  socket,
  entityName,
  comments
})


// =============================
// 7. KEYBOARD / GROUP NAVIGATION
// =============================
const {
  hasNextGroup,
  hasPrevGroup,
  selectNextGroup,
  selectPrevGroup
} = useMindmapCommentNavigation({
  activeNodeId,
  mergedGroupsFinal,
  nodeMap,
  emit
})

// =============================
// 8. UI DIRECTIVES
// =============================
const vTooltip = Tooltip

const groups = computed(() => mergedGroupsFinal.value)


function handleNavigate(direction) {
  isNavigatingByKeyboard.value = true

  const currentId = activeNodeId.value
  commentEditorRef.value?.[currentId]?.blur?.()

  if (direction === "next" && hasNextGroup(activeNodeId.value)) {
    selectNextGroup(activeNodeId.value)
  }

  if (direction === "prev" && hasPrevGroup(activeNodeId.value)) {
    selectPrevGroup(activeNodeId.value)
  }

  // reset flag sau khi DOM ổn định
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      isNavigatingByKeyboard.value = false
    })
  })
}


async function handleUploadCommentImage() {
  const urls = await pickAndUploadImages(entityName)

  urls.forEach(url => previewImages.value.push(url))
}


</script>


<style scoped>
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
</style>