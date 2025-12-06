<template>
  <div v-if="visible" :class="[
    'absolute top-0 right-0 h-full w-[320px] bg-[#f5f6f7] z-[80] border-l border-b',
    closing ? 'animate-slide-out' : 'animate-slide-in'
  ]">
    <div class="flex py-4 px-3 items-center">
      <p class="font-medium">Nhận xét</p>

      <i class="pi pi-times ml-auto cursor-pointer hover:text-[#3b82f6]
               transition-all duration-200 ease-out" @click="handleClose" />
    </div>

    <!-- Hiển thị node hiện tại -->
    <div class="comment-panel-list px-3">
      <div v-if="node"
        class="p-3 comment-panel active relative panel-card text-xs text-gray-500 border rounded-[6px] bg-white">
        <div class="comment-panel-header flex items-center">
          <div :title="safeLabel"
            class="comment-panel-quote relative  truncate max-w-[120px] !text-[12px] text-[#646a73] pl-2"
            v-html="safeLabel"></div>
          <div class="ml-auto border rounded-[12px] px-[5px] py-[4px] flex items-center gap-2">
            <div class="">
              <i class="pi pi-angle-up !text-[13px] cursor-pointer mr-2"></i>
              <i class="pi pi-angle-down !text-[13px] cursor-pointer"></i>
            </div>
            <div class="panel-separate border-l w-[1px] h-[16px]"></div>
            <div class="">
              <i class="pi pi-link !text-[12px] mr-2 cursor-pointer"></i>
              <i class="pi pi-check-circle !text-[12px] cursor-pointer"></i>
            </div>
          </div>
        </div>
        <div class="comment-panel-message my-2">
          <div></div>
        </div>
        <div class="comment-panel-input">
          <!-- <input type="text" placeholder="Thêm nhận xét"> -->
          <InputText ref="search-input" v-model="inputValue" :placeholder="__('Tìm kiếm')" class="search-input" />

          <div v-if="inputValue.trim().length > 0" class="flex justify-end gap-2 mt-2">
            <button class="px-3 py-1 text-xs rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
              @click="handleCancel">
              Huỷ
            </button>

            <button class="px-3 py-1 text-xs rounded bg-[#3B82F6] text-white hover:bg-blue-600 transition"
              @click="handleSubmit">
              Đăng
            </button>
          </div>

        </div>
      </div>
    </div>

    <!-- Nội dung comment -->
    <div class="p-3 overflow-y-auto h-[calc(100%-100px)]">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from "vue"
import InputText from "primevue/inputtext"
import { useRoute } from 'vue-router'
import {call} from 'frappe-ui'


const route = useRoute()
const entityName = route.params.entityName
const team = route.params.team


function loadCache() {
  try {
    const raw = localStorage.getItem("mindmap_comment_cache")
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveCache() {
  localStorage.setItem("mindmap_comment_cache", JSON.stringify(commentCache.value))
}

const inputValue = ref("")
const commentCache = ref(loadCache())

const props = defineProps({
  visible: Boolean,
  node: Object   // nhận node được truyền vào
})

const emit = defineEmits(["close", "cancel", "submit", "update:input"])

function handleCancel() {
  if (props.node?.id) {
    commentCache.value[props.node.id] = ""
    saveCache()
  }
  inputValue.value = ""
  emit("cancel")
}

const safeLabel = computed(() => {
  if (!props.node?.data?.label) return ""

  let html = props.node.data.label

  // loại bỏ wrapper <p></p>
  html = html.replace(/^<p>/, "").replace(/<\/p>$/, "")

  return html
})

const closing = ref(false)

watch(
  () => props.visible,
  (val) => {
    if (val) closing.value = false
  }
)

function handleClose() {
  closing.value = true
  setTimeout(() => {
    emit("close")
    closing.value = false
  }, 250)
}

async function handleSubmit() {
  if (!props.node?.id) return
  if (!inputValue.value.trim()) return

  const nodeId = props.node.id

  // JSON comment structure
  const payload = {
    text: inputValue.value.trim(),
    created_at: new Date().toISOString(),
  }

  try {
    const res = await call("drive.api.mindmap_comment.add_comment", {
        mindmap_id: entityName,
        node_id: nodeId,
        comment: JSON.stringify(payload)
    })

    // Clear draft for this node
    commentCache.value[nodeId] = ""
    saveCache()
    inputValue.value = ""

    emit("submit", res.message.comment)

  } catch (err) {
    console.error("❌ Failed to submit comment:", err)
  }
}
 

watch(inputValue, (val) => {
  if (props.node?.id) {
    commentCache.value[props.node.id] = val
    saveCache()
  }
  emit("update:input", val)
})

watch(
  () => props.node?.id,
  (newId, oldId) => {
    if (!newId) return

    // Lưu text cũ trước khi chuyển sang node mới
    if (oldId) {
      commentCache.value[oldId] = inputValue.value
      saveCache()
    }

    // Load text cho node mới (nếu có)
    inputValue.value = commentCache.value[newId] || ""
  }
)


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
</style>