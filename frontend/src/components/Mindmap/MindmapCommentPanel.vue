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


    <div v-if="props?.node && mergedComments.length === 0">
    </div>

    <div v-else-if="mergedComments.length === 0" class="text-gray-400 text-sm p-3">
      Chưa có bình luận nào.
    </div>

    <!-- Danh sách comment -->
    <div class="p-3 overflow-y-auto h-[calc(100%-100px)] comment-scroll-container">
      <div v-if="mindmap_comment_list.loading" class="text-gray-500 text-sm">Đang tải bình luận...</div>

      <div v-else>
        <div v-for="group in mergedGroupsFinal" :ref="el => setGroupRef(group.node.id, el)" :key="group.node.id"
          @click="handleClickGroup(group.node.id)"
          class="comment-panel cursor-pointer relative mb-5 p-3 rounded bg-white border shadow-sm text-xs text-gray-500 group"
          :class="group.node.id === activeNodeId ? 'active' : ''" style="
    content-visibility: auto;
    contain-intrinsic-size: 180px;
  ">

          <!-- Header node -->
          <div class="comment-panel-header flex items-center mb-2">
            <div class="comment-panel-quote relative truncate max-w-[120px] !text-[12px] text-[#646a73] pl-2"
              :title="stripLabel(group.node.data.label)" v-html="stripLabel(group.node.data.label)">
            </div>

            <div v-if="group.comments?.length > 0"
              class="ml-auto border rounded-[12px] px-[5px] py-[4px] flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <i v-tooltip.top="hasNextGroup(group.node.id)
                ? {
                  value: 'Tiếp (↓)',
                  pt: {
                    text: { class: ['text-[12px]'] }
                  }
                }
                : null
                " class="pi pi-angle-down !text-[13px]" :class="hasNextGroup(group.node.id)
                  ? 'cursor-pointer hover:text-blue-500'
                  : 'cursor-not-allowed opacity-40'"
                @click.stop="hasNextGroup(group.node.id) && selectNextGroup(group.node.id)"></i>

              <i v-tooltip.top="hasPrevGroup(group.node.id)
                ? {
                  value: 'Trước (↑)',
                  pt: {
                    text: {
                      class: ['text-[12px]']
                    }
                  }
                }
                : null
                " class="pi pi-angle-up !text-[13px] mr-2" :class="hasPrevGroup(group.node.id)
                  ? 'cursor-pointer hover:text-blue-500'
                  : 'cursor-not-allowed opacity-40'"
                @click.stop="hasPrevGroup(group.node.id) && selectPrevGroup(group.node.id)"></i>


              <div class="panel-separate border-l w-[1px] h-[16px]"></div>
              <i class="pi pi-link !text-[12px] mr-2 cursor-pointer"></i>
              <i class="pi pi-check-circle !text-[12px] cursor-pointer"></i>
            </div>
          </div>

          <!-- Danh sách comment (theo node) -->
          <div v-for="c in group.comments" :key="c.name" class="flex items-start py-2 px-3 gap-2 mb-3">
            <CustomAvatar :image="c.user?.user_image" :label="c.user?.full_name?.slice(0, 1)" shape="circle"
              size="small" />

            <div>
              <div class="flex items-center gap-2">
                <div class="font-medium text-gray-700">{{ c.user?.full_name }}</div>
                <span class="text-[10px] text-gray-400">{{ timeAgo(c.creation) }}</span>
              </div>

              <div class="text-black mt-1">{{ c.parsed.text }}</div>
            </div>
          </div>

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

          <!-- Nếu node đang chọn → hiển thị input ngay trong nhóm -->
          <div v-if="group.node.id === activeNodeId" class="mt-3">
            <Textarea v-model="inputValue" class="search-input h-8 w-full add-comments-textarea" rows="1"
              autoResize="false" :placeholder="group.comments?.length ? 'Trả lời' : 'Thêm nhận xét'"
              @keydown.enter.exact.prevent="handleSubmit" @keydown.shift.enter.stop />

            <div v-if="inputValue.trim()" class="flex justify-end gap-2 mt-2">
              <button class="px-3 py-1 text-xs rounded bg-gray-200" @click="handleCancel">Huỷ</button>
              <button class="px-3 py-1 text-xs rounded bg-[#3B82F6] text-white" @click="handleSubmit">Đăng</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<script setup>
import { ref, watch, computed, nextTick, inject } from "vue"
import Textarea from "primevue/textarea"
import { useRoute } from "vue-router"
import {  createResource } from "frappe-ui"
import { useStore } from "vuex"
import CustomAvatar from "../CustomAvatar.vue"
import { Tooltip } from "primevue"
import { useMindmapCommentRealtime } from "./composables/useMindmapCommentRealtime"
import { useMindmapCommentNavigation } from "./composables/useMindmapCommentNavigation"
import { useMindmapCommentData } from "./composables/useMindmapCommentData"
import { useMindmapCommentInput } from "./composables/useMindmapCommentInput"
import { useScrollToActiveNode } from "./composables/useScrollToActiveNode"

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
const groupRefs = ref({})


const currentUser = computed(() => store.state.user)

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
  auto: true,
  params: { mindmap_id: entityName },
  onSuccess(data) {
    comments.value = data
  }
})

// -----------------------------
const closing = ref(false)
function handleClose() {
  closing.value = true
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
  emit
})


// =============================
// 2. ACTIVE NODE STATE CONTROL
// =============================
function resetActiveNode() {
  inputValue.value = ""
  activeNodeId.value = null
}

watch(
  () => props.node?.id,
  (newId) => {
    if (!newId) {
      resetActiveNode()
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
function focusInput(nodeId) {
  const el = groupRefs.value[nodeId]?.querySelector(".add-comments-textarea")
  el?.focus?.()
}

function handleClickGroup(nodeId) {
  if (!nodeId) return

  // Click lại chính node đang active → chỉ focus input
  if (props.node?.id === nodeId) {
    focusInput(nodeId)
    return
  }

  const node = nodeMap.value[nodeId] || { id: nodeId }
  emit("update:node", node)

  nextTick(() => focusInput(nodeId))
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

.comment-panel-quote::before {
  content: "";
  background-color: #bbbfc4 !important;
  border-radius: 1px;
  content: "";
  height: 16px;
  left: 0;
  position: absolute;
  top: 2px;
  width: 2px;
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