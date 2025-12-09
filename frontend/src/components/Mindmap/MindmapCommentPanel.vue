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

    <!-- Danh sách comment -->
    <div class="p-3 overflow-y-auto h-[calc(100%-100px)] comment-scroll-container">
      <div v-if="mindmap_comment_list.loading" class="text-gray-500 text-sm">Đang tải bình luận...</div>

      <div v-else-if="mergedComments.length === 0" class="text-gray-400 text-sm">
        Chưa có bình luận nào.
      </div>

      <div v-else>
        <div v-for="group in mergedGroupsFinal" :ref="el => setGroupRef(group.node.id, el)" :key="group.node.id"
          @click="handleClickGroup(group.node.id)" :class="[
            'comment-panel cursor-pointer relative mb-5 p-3 rounded bg-white border shadow-sm text-xs text-gray-500 group',
            group.node.id === activeNodeId ? 'active' : ''
          ]">

          <!-- Header node -->
          <div class="comment-panel-header flex items-center mb-2">
            <div class="comment-panel-quote relative truncate max-w-[120px] !text-[12px] text-[#646a73] pl-2"
              :title="stripLabel(group.node.data.label)" v-html="stripLabel(group.node.data.label)">
            </div>

            <div v-if="group.comments?.length > 0"
              class="ml-auto border rounded-[12px] px-[5px] py-[4px] flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <i class="pi pi-angle-down !text-[13px]" :class="hasNextGroup(group.node.id)
                ? 'cursor-pointer hover:text-blue-500'
                : 'cursor-not-allowed opacity-40'"
                @click.stop="hasNextGroup(group.node.id) && selectNextGroup(group.node.id)"></i>
              <i class="pi pi-angle-up !text-[13px] mr-2" :class="hasPrevGroup(group.node.id)
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
            <Textarea v-model="inputValue" class="search-input h-8 w-full" rows="1" autoResize="false"
              :placeholder="group.comments?.length ? 'Trả lời' : 'Thêm nhận xét'"
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
import { call, createResource } from "frappe-ui"
import Textarea from "primevue/textarea"
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useStore } from "vuex"
import { getTeamMembers } from "../../resources/team"
import CustomAvatar from "../CustomAvatar.vue"


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
  }
}

function scrollToActiveNode(nodeId) {
  if (!nodeId) return

  nextTick(() => {
    const el = groupRefs.value[nodeId]
    const container = document.querySelector(".comment-scroll-container")

    if (!el || !container) return

    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    const target =
      elRect.top - containerRect.top + container.scrollTop

    container.scrollTo({
      top: target,
      // behavior: "smooth"
    })
  })
}



const mindmap_comment_list = createResource({
  url: "drive.api.mindmap_comment.get_comments",
  method: "GET",
  auto: false, // Không tự động gọi, chỉ gọi khi panel visible
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

// Chỉ gọi API khi panel visible
watch(() => props.visible, (isVisible) => {
  if (isVisible && entityName) {
    // Chỉ gọi API khi panel được mở và có entityName
    mindmap_comment_list.fetch()
  }
}, { immediate: true })

const members = computed(() => getTeamMembers.data || [])

const memberMap = computed(() => {
  const map = {}
  for (const m of members.value) {
    map[m.email] = m
  }
  return map
})

const nodeMap = computed(() => {
  const map = {}
  for (const n of props.mindmap || []) {
    map[n.id] = n
  }
  return map
})

// -----------------------------
const parseComment = raw => {
  try {
    return JSON.parse(raw)
  } catch {
    return { text: raw }
  }
}

// -----------------------------
const stripLabel = raw => {
  if (!raw) return ""
  return String(raw).replace(/^<p>/, "").replace(/<\/p>$/, "")
}

// -----------------------------
// MERGE COMMENTS ↔ NODES
const mergedComments = computed(() => {
  if (!comments.value.length) return []
  if (!sortedNodes.value.length) return []

  return comments.value.map(c => {
    return {
      ...c,
      node: nodeMap.value[c.node_id] || null,
      user: memberMap.value[c.owner] || null,
      parsed: parseComment(c.comment)
    }
  })
})

const totalComments = computed(() => mergedComments.value.length)

// -----------------------------
const inputValue = ref("")
const commentCache = ref(JSON.parse(localStorage.getItem("mindmap_comment_cache") || "{}"))

function saveCache() {
  localStorage.setItem("mindmap_comment_cache", JSON.stringify(commentCache.value))
}

watch(inputValue, val => {
  if (props.node?.id) {
    commentCache.value[props.node.id] = val
    saveCache()
  }
  emit("update:input", val)
})

// -----------------------------
async function handleSubmit() {
  if (!props.node?.id || !inputValue.value.trim()) return

  const payload = {
    text: inputValue.value.trim(),
    created_at: new Date().toISOString()
  }

  const res = await call("drive.api.mindmap_comment.add_comment", {
    mindmap_id: entityName,
    node_id: props.node.id,
    comment: JSON.stringify(payload)
  })

  console.log(">>>> send message");
  

  inputValue.value = ""
  commentCache.value[props.node.id] = ""
  saveCache()
  emit("submit", res.comment)
}

function handleCancel() {
  if (props.node?.id) commentCache.value[props.node.id] = ""
  inputValue.value = ""
  saveCache()
  emit("cancel")
}


function timeAgo(dateStr) {
  if (!dateStr) return ""

  const now = new Date()
  const past = new Date(dateStr)
  const diff = (now - past) / 1000

  if (diff < 60) return "vừa xong"
  if (diff < 3600) return Math.floor(diff / 60) + " phút trước"
  if (diff < 86400) return Math.floor(diff / 3600) + " giờ trước"

  const days = Math.floor(diff / 86400)
  if (days === 1) return "Hôm qua"
  if (days < 30) return `${days} ngày trước`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} tháng trước`

  const years = Math.floor(months / 12)
  return `${years} năm trước`
}


// -----------------------------
const closing = ref(false)
function handleClose() {
  closing.value = true
  setTimeout(() => {
    emit("close")
    closing.value = false
  }, 250)
}


function sortMindmapNodes(nodes) {
  if (!Array.isArray(nodes)) return []

  // clone để tránh reactive loop
  const cloned = JSON.parse(JSON.stringify(nodes))

  // map id → node
  const map = {}
  cloned.forEach(n => {
    map[n.id] = { ...n, children: [] }
  })

  // gắn children
  cloned.forEach(n => {
    const parentId = n.data?.parentId
    if (parentId && parentId !== "root" && map[parentId]) {
      map[parentId].children.push(map[n.id])
    }
  })

  // lấy roots
  const roots = Object.values(map).filter(
    n => n.data?.parentId === "root"
  )

  // ✅ SORT CHUẨN: Y TRƯỚC → X SAU
  function sortByPos(a, b) {
    if (a.position.y !== b.position.y) {
      return a.position.y - b.position.y
    }
    return a.position.x - b.position.x
  }

  roots.sort(sortByPos)

  const result = []

  function dfs(node) {
    result.push(node)
    node.children.sort(sortByPos)
    node.children.forEach(child => dfs(child))
  }

  roots.forEach(root => dfs(root))

  return result
}


const sortedNodes = computed(() => {
  return sortMindmapNodes(props.mindmap || [])
})

const mergedGroups = computed(() => {
  if (!sortedNodes.value.length || !comments.value.length) return []

  const groupMap = {}

  for (const c of comments.value) {
    if (!groupMap[c.node_id]) {
      const node = nodeMap.value[c.node_id]
      if (!node) continue

      groupMap[c.node_id] = {
        node,
        comments: []
      }
    }

    groupMap[c.node_id].comments.push({
      ...c,
      user: memberMap.value[c.owner] || null,
      parsed: parseComment(c.comment)
    })
  }

  return sortedNodes.value
    .filter(n => groupMap[n.id])
    .map(n => groupMap[n.id])
})


const mergedGroupsFinal = computed(() => {
  if (!sortedNodes.value.length) return []

  const map = {}

  // đưa group đã có comment vào map
  for (const g of mergedGroups.value) {
    map[g.node.id] = g
  }

  // nếu đang chọn node mà chưa có comment → tạo group rỗng
  if (props.node?.id && !map[props.node.id]) {
    map[props.node.id] = {
      node: nodeMap.value[props.node.id] || props.node,
      comments: []
    }
  }

  // TRẢ VỀ THEO THỨ TỰ CÂY GỐC – KHÔNG BỊ ĐẨY LÊN ĐẦU
  return sortedNodes.value
    .filter(n => map[n.id])
    .map(n => map[n.id])
})

watch(
  () => props.node?.id,
  (newId, oldId) => {
    if (!newId) {
      inputValue.value = ""
      activeNodeId.value = null
      return
    }

    // lưu draft node cũ
    if (oldId) {
      commentCache.value[oldId] = inputValue.value
      saveCache()
    }

    // mirror state local
    activeNodeId.value = newId

    // load draft node mới
    inputValue.value = commentCache.value[newId] || ""

    // DOM đã patch xong vì flush: 'post'
    scrollToActiveNode(newId)
  },
  {
    flush: "post"
  }
)

function handleClickGroup(nodeId) {
  if (!nodeId) return

  if (props.node?.id === nodeId) {
    // Trường hợp đã active rồi → focus ngay
    const el = groupRefs.value[nodeId]?.querySelector("textarea")
    el?.focus?.()
    return
  }

  const node = nodeMap.value[nodeId] || { id: nodeId }

  emit("update:node", node)

  nextTick(() => {
    const el = groupRefs.value[nodeId]?.querySelector("textarea")
    el?.focus?.()
  })
}


function handleRealtimeNewComment(payload) {
  if (!payload) return

  // Chỉ xử lý đúng mindmap hiện tại
  if (payload.mindmap_id !== entityName) return

  const newComment = payload.comment
  if (!newComment || !newComment.node_id) return

  // Tránh push trùng khi chính mình vừa gửi xong
  const existed = comments.value.find(c => c.name === newComment.name)
  if (existed) return

  comments.value.push(newComment)
}

function handleKeyNavigation(e) {
  if (!activeNodeId.value) return

  if (e.key === "ArrowDown") {
    e.preventDefault()
    if (hasNextGroup(activeNodeId.value)) {
      selectNextGroup(activeNodeId.value)
    }
  }

  if (e.key === "ArrowUp") {
    e.preventDefault()
    if (hasPrevGroup(activeNodeId.value)) {
      selectPrevGroup(activeNodeId.value)
    }
  }
}

onMounted(() => {
  if (socket?.on) {
    socket.on("drive_mindmap:new_comment", handleRealtimeNewComment)
  }
  window.addEventListener("keydown", handleKeyNavigation)
})

onUnmounted(() => {
  if (socket?.off) {
    socket.off("drive_mindmap:new_comment", handleRealtimeNewComment)
  }
  window.removeEventListener("keydown", handleKeyNavigation)
})

function selectNextGroup(currentNodeId) {
  if (!currentNodeId) return

  const list = mergedGroupsFinal.value
  if (!list.length) return

  const index = list.findIndex(g => g.node.id === currentNodeId)
  if (index === -1) return

  const next = list[index + 1]
  if (!next) return

  const nextNodeId = next.node.id
  const node = nodeMap.value[nextNodeId] || { id: nextNodeId }

  emit("update:node", node)
}


function hasNextGroup(nodeId) {
  const list = mergedGroupsFinal.value
  const index = list.findIndex(g => g.node.id === nodeId)
  return index !== -1 && index < list.length - 1
}

function hasPrevGroup(nodeId) {
  const list = mergedGroupsFinal.value
  const index = list.findIndex(g => g.node.id === nodeId)
  return index > 0
}

function selectPrevGroup(currentNodeId) {
  if (!currentNodeId) return

  const list = mergedGroupsFinal.value
  if (!list.length) return

  const index = list.findIndex(g => g.node.id === currentNodeId)
  if (index === -1) return

  const prev = list[index - 1]
  if (!prev) return

  const prevNodeId = prev.node.id
  const node = nodeMap.value[prevNodeId] || { id: prevNodeId }

  emit("update:node", node)
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

.search-input::placeholder {
  color: #9ca3af;
  font-size: 12px;
  opacity: 1;
}
</style>