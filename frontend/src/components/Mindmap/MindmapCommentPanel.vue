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
    <div class="p-3 overflow-y-auto h-[calc(100%-100px)] comment-scroll-container">
      <div v-if="mindmap_comment_list.loading" class="text-gray-500 text-sm">
        Đang tải bình luận...
      </div>

      <div v-else>
        <div v-for="group in mergedGroupsFinal" :ref="el => setGroupRef(group.node.id, el)" :key="group.node.id"
          @click="group.node.id !== activeNodeId && handleClickGroup(group.node.id)" class="
            comment-panel
            group/comment-panel
            cursor-pointer
            relative
            mb-5 p-3 rounded bg-white border shadow-sm
            text-xs text-gray-500
          " :class="group.node.id === activeNodeId ? 'active' : ''"
          style="content-visibility: auto; contain-intrinsic-size: 180px;">

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

          <div v-for="c in group.comments" :key="c.name"
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

                <span class="
          text-[10px] text-gray-400 inline-block
          transition-all duration-150
          group-hover/comment-item:truncate
          group-hover/comment-item:max-w-[50px]
        ">
                  {{ timeAgo(c.creation) }}
                </span>
              </div>

              <div v-html="c.parsed.text" class="text-black mt-2">
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
            <!-- <Textarea v-model="inputValue" class="search-input h-8 w-full add-comments-textarea" rows="1"
              autoResize="false" :placeholder="group.comments?.length ? 'Trả lời' : 'Thêm nhận xét'"
              @keydown.enter.exact.prevent="handleSubmit" @keydown.shift.enter.stop /> -->

            <CommentEditor :ref="el => {
              if (!commentEditorRef.value) {
                commentEditorRef.value = {}
              }
              if (group.node.id === activeNodeId) {
                commentEditorRef.value[group.node.id] = el
              }
            }" :visible="props?.visible" v-model="inputValue" :previewImages="previewImages" @submit="handleSubmit"
              @navigate="handleNavigate" />

            <div class="absolute top-1/2 right-2 -translate-y-1/2">
              <!-- Upload Image -->
              <i class="pi pi-image text-gray-500 hover:text-blue-500 cursor-pointer text-sm z-10"
                @click="handleUploadCommentImage" title="Chèn ảnh" />
            </div>

            <div class="flex items-center justify-between mt-2">

              <div v-if="inputValue.trim()" class="flex justify-end gap-2">
                <button class="px-3 py-1 text-xs rounded bg-gray-200"
                  @click="handleCancel(group.comments?.length === 0)">
                  Huỷ
                </button>
                <button class="px-3 py-1 text-xs rounded bg-[#3B82F6] text-white" @click="handleSubmit">
                  Đăng
                </button>
              </div>
            </div>
          </div>


          <!-- INPUT EDIT COMMENT -->
          <div v-if="isEditing && activeEditingComment?.node_id === group.node.id" class="mt-3 rounded p-2">
            <Textarea v-model="editingValue" class="search-input h-8 w-full" rows="1" autoResize="false"
              placeholder="Chỉnh sửa bình luận..." @keydown.enter.exact.prevent="submitEdit(activeEditingComment)"
              @keydown.shift.enter.stop />

            <div class="flex justify-end gap-2 mt-2">
              <button class="px-3 py-1 text-xs rounded bg-gray-200" @click="cancelEdit">
                Huỷ
              </button>

              <button class="px-3 py-1 text-xs rounded bg-[#3B82F6] text-white"
                @click="submitEdit(activeEditingComment)">
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
import Textarea from "primevue/textarea"
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

const isNavigatingByKeyboard = ref(false)


const currentUser = computed(() => store.state.user)

const {
  activeComment,
  dropdownStyle,
  openCommentMenu,
  handleEditComment,
  handleDeleteComment
} = useMindmapCommentMenu()


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

const mindmap_comment_list = createResource({
  url: "drive.api.mindmap_comment.get_comments",
  method: "GET",
  auto: false,
  params: { mindmap_id: entityName },
  onSuccess(data) {
    comments.value = data || []
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
    // Nếu đang đóng → không làm gì
    if (!isVisible || !entityName) return

    // ĐÃ LOAD RỒI → KHÔNG FETCH LẠI
    if (hasLoadedOnce.value) {
      // vẫn cho scroll lại nếu cần
      await nextTick()
      requestAnimationFrame(() => {
        if (activeNodeId.value) {
          scrollToActiveNode(activeNodeId.value)
        }
      })
      return
    }

    // LẦN ĐẦU TIÊN → FETCH
    await mindmap_comment_list.fetch()
    hasLoadedOnce.value = true

    await nextTick()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (activeNodeId.value) {
          scrollToActiveNode(activeNodeId.value)
        }
      })
    })

  },
  { immediate: true }
)


// -----------------------------
const closing = ref(false)

function handleClose() {
  closing.value = true
  commentEditorRef.value?.blur?.()

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
  previewImages
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

    // scrollToActiveNode(newId)
  },
  { flush: "post" }
)



// =============================
// 3. FOCUS + CLICK INTERACTION
// =============================

function handleClickGroup(nodeId) {
  if (!nodeId) return

  // Click lại chính node đang active → chỉ focus input
  if (props.node?.id === nodeId) {
    // focusInput(nodeId)
    return
  }

  const node = nodeMap.value[nodeId] || { id: nodeId }
  emit("update:node", node)

  // nextTick(() => focusInput(nodeId))
}


// =============================
// 4. SCROLL HANDLER
// =============================
const { scrollToActiveNode } = useScrollToActiveNode(groupRefs)


// =============================
// 5. DATA MERGE & COMPUTED
// =============================
const {
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


async function uploadImageGeneric(file, parentEntityName) {
  const { v4: uuidv4 } = await import("uuid")
  const fileUuid = uuidv4()

  const chunkSize = 5 * 1024 * 1024
  let chunkByteOffset = 0
  let chunkIndex = 0
  const totalChunks = Math.ceil(file.size / chunkSize)

  while (chunkByteOffset < file.size) {
    const currentChunk = file.slice(chunkByteOffset, chunkByteOffset + chunkSize)

    const formData = new FormData()
    formData.append("filename", file.name)
    formData.append("team", route.params.team)
    formData.append("total_file_size", file.size)
    formData.append("mime_type", file.type)
    formData.append("total_chunk_count", totalChunks)
    formData.append("chunk_byte_offset", chunkByteOffset)
    formData.append("chunk_index", chunkIndex)
    formData.append("chunk_size", chunkSize)
    formData.append("file", currentChunk)
    formData.append("parent", parentEntityName)
    formData.append("embed", 1)
    formData.append("personal", props.mindmap?.is_private ? 1 : 0)
    formData.append("uuid", fileUuid)

    const res = await fetch("/api/method/drive.api.files.upload_file", {
      method: "POST",
      body: formData,
      headers: {
        "X-Frappe-CSRF-Token": window.csrf_token,
        Accept: "application/json",
      },
    })

    // ✅ Chunk cuối → trả về URL embed
    if (chunkIndex === totalChunks - 1) {
      const data = await res.json()
      return `${window.location.origin}/api/method/drive.api.embed.get_file_content?embed_name=${data.message.name}&parent_entity_name=${parentEntityName}`
    }

    chunkByteOffset += chunkSize
    chunkIndex++
  }
}

async function handleUploadCommentImage() {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = "image/*"
  input.multiple = true
  input.style.display = "none"
  document.body.appendChild(input)

  input.onchange = async () => {
    const files = Array.from(input.files || [])
    input.remove()
    if (!files.length) return

    try {
      for (const file of files) {
        const imageUrl = await uploadImageGeneric(file, entityName)

        previewImages.value.push(imageUrl)
      }
    } catch (err) {
      console.error("Upload image failed:", err)
    }
  }

  input.click()
}


watch(
  () => [props.visible, activeNodeId.value],
  async ([visible, nodeId]) => {
    if (!visible || !nodeId) return
    if (isNavigatingByKeyboard.value) return

    await nextTick()

    const tryFocus = () => {
      const editor = commentEditorRef.value?.[nodeId]

      if (editor?.focus) {
        editor.focus()
      } else {
        requestAnimationFrame(tryFocus)
      }
    }

    requestAnimationFrame(tryFocus)
  }
)




function focusEditorByNodeId(nodeId) {
  nextTick(() => {
    requestAnimationFrame(() => {
      commentEditorRef.value?.[nodeId]?.focus?.()
    })
  })
}

defineExpose({
  focusEditorByNodeId
})




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
</style>