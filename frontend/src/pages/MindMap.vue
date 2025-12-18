<template>
  <div class="flex flex-col w-full">
    <Navbar v-if="!mindmap.error" :root-resource="mindmap" />
    <ErrorPage v-if="mindmap.error" :error="mindmap.error" />
    <LoadingIndicator v-else-if="!mindmap.data && mindmap.loading" class="w-10 h-full text-neutral-100 mx-auto" />

    <div v-if="mindmap.data" class="w-full relative">
      <!-- Loading indicator khi đang render mindmap -->
      <div v-if="isRendering" class="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
        <div class="text-center">
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <div class="text-lg text-gray-600 mt-4">Đang tải sơ đồ tư duy...</div>
        </div>
      </div>

      <!-- Status indicator -->
      <div class="absolute top-2 right-2 z-10 text-sm">
        <span v-if="isSaving" class="text-orange-500 flex items-center gap-1">
          <span class="animate-spin">⏳</span> Đang lưu...
        </span>
        <span v-else-if="lastSaved" class="text-green-500">
          ✓ Đã lưu lúc {{ lastSaved }}
        </span>
      </div>

      <div @click="showPanel = true" class="absolute cursor-pointer top-[60px] right-0 z-10 text-sm
              border border-gray-300 border-r-0
              rounded-tl-[20px] rounded-bl-[20px]
              bg-white pl-3 py-3 flex
              hover:text-[#3b82f6]
              transition-all duration-200 ease-out">
        <span>
          <i class="pi pi-comment !text-[16px]"></i>
        </span>
      </div>



      <!-- Delete confirmation dialog -->
      <div v-if="showDeleteDialog" class="delete-dialog-overlay" @click.self="closeDeleteDialog">
        <div class="delete-dialog">
          <div class="delete-dialog-header">
            <h3>Xác nhận xóa</h3>
          </div>
          <div class="delete-dialog-body">
            <p v-if="deleteDialogType === 'children'">Xóa nhánh này sẽ xóa toàn bộ nhánh con.</p>
            <p v-else-if="deleteDialogType === 'task-link'">Nhánh đang có liên kết tới công việc, xóa nhánh này</p>
          </div>
          <div class="delete-dialog-footer">
            <button @click="closeDeleteDialog" class="btn-cancel">Hủy</button>
            <button @click="confirmDelete" class="btn-delete">Xóa</button>
          </div>
        </div>
      </div>

      <!-- Task link drag warning dialog -->
      <div v-if="showTaskLinkDragDialog" class="delete-dialog-overlay" @click.self="closeTaskLinkDragDialog">
        <div class="delete-dialog">
          <div class="delete-dialog-header">
            <h3>Cảnh báo</h3>
          </div>
          <div class="delete-dialog-body">
            <p>Nhánh đang được liên kết tới công việc, bạn vẫn muốn thay đổi vị trí nhánh?</p>
          </div>
          <div class="delete-dialog-footer">
            <button @click="closeTaskLinkDragDialog" class="btn-cancel">Hủy</button>
            <button @click="confirmTaskLinkDrag" class="btn-delete">Xác nhận</button>
          </div>
        </div>
      </div>

      <MindmapTaskLinkModal
        :visible="showTaskLinkModal"
        :node-title="extractTitleFromLabel(taskLinkNode?.data?.label || '') || taskLinkNode?.data?.label || ''"
        :mode="taskLinkMode"
        :search="taskSearch"
        :tasks="filteredTasks"
        :project-filter="taskProjectFilter"
        :project-options="taskProjectOptions"
        :page="taskPage"
        :total-pages="totalTaskPages"
        :selected-task-id="selectedTaskId"
        :attach-link="attachTaskLink"
        :link-url="taskLinkUrl"
        :node-owner="mindmapEntity?.data?.owner || ''"
        :mindmap-title="mindmap?.data?.title || ''"
        :team="props.team"
        :mindmap-id="props.entityName"
        :node-id="taskLinkNode?.id || ''"
        @update:mode="taskLinkMode = $event"
        @update:search="taskSearchInput = $event"
        @update:selectedTaskId="selectedTaskId = $event"
        @update:attachLink="attachTaskLink = $event"
        @update:linkUrl="taskLinkUrl = $event"
        @update:projectFilter="taskProjectFilter = $event"
        @update:page="setTaskPage($event)"
        @close="closeTaskLinkModal"
        @confirm="confirmTaskLink"
        @createTask="handleCreateTask"
      />


      <div style="height: calc(100vh - 84px); width: 100%" class="d3-mindmap-container">
        <!-- D3.js Mindmap Renderer -->
        <div ref="d3Container" class="d3-mindmap-wrapper"></div>

        <!-- Controls -->
        <div class="d3-controls">
          <button @click="fitView" class="control-btn" title="Fit View">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 2h12v12H2V2z" />
              <path d="M5 5h6v6H5V5z" />
            </svg>
          </button>
          <button @click="zoomIn" class="control-btn" title="Zoom In">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <button @click="zoomOut" class="control-btn" title="Zoom Out">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <MindmapContextMenu @mousedown.stop @click.stop :visible="showContextMenu" :node="contextMenuNode"
          :position="contextMenuPos" :has-clipboard="hasClipboard" :center="contextMenuCentered"
          @action="handleContextMenuAction" @close="showContextMenu = false" />

        <MindmapCommentPanel :visible="showPanel" :node="activeCommentNode" :mindmap="realtimeMindmapNodes"
          @close="showPanel = false" ref="commentPanelRef" @update:input="commentInputValue = $event"
          @cancel="onCancelComment" @update:node="handleSelectCommentNode" :userAddComment="isFromUI">
        </MindmapCommentPanel>

        <!-- Mindmap Toolbar -->
        <MindmapToolbar ref="toolbarRef" :visible="!!selectedNode" :selected-node="selectedNode"
          :editor-instance="currentEditorInstance" :is-editing="editingNode === selectedNode?.id" :renderer="d3Renderer"
          @comments="handleToolbarComments" @done="handleToolbarDone" @insert-image="handleInsertImage"
          @more-options="handleToolbarMoreOptions" @context-action="handleToolbarContextAction" />

        <!-- Image Zoom Modal - Global, chỉ 1 instance -->
        <ImageZoomModal />
      </div>
    </div>
  </div>
</template>

<script setup>
import { rename } from "@/resources/files"
import { D3MindmapRenderer } from '@/utils/d3mindmap'
import { installMindmapContextMenu } from '@/utils/mindmapExtensions'

import { setBreadCrumbs } from "@/utils/files"
import { toast } from "@/utils/toasts"
import { call, createResource } from "frappe-ui"
import { computed, defineProps, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useStore } from "vuex"

import { useRoute } from "vue-router"


import ImageZoomModal from "@/components/ImageZoomModal.vue"
import MindmapCommentPanel from "@/components/Mindmap/MindmapCommentPanel.vue"
import MindmapContextMenu from "@/components/Mindmap/MindmapContextMenu.vue"
import MindmapTaskLinkModal from "@/components/Mindmap/MindmapTaskLinkModal.vue"
import MindmapToolbar from "@/components/Mindmap/MindmapToolbar.vue"


const showContextMenu = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })
const contextMenuNode = ref(null)
const contextMenuCentered = ref(false) // Flag để biết có dùng center transform không


const store = useStore()
const emitter = inject("emitter")
const socket = inject("socket")

const props = defineProps({
  entityName: String,
  team: String,
})

// State
const isSaving = ref(false)
const lastSaved = ref(null)
const selectedNode = ref(null)
const hoveredNode = ref(null)
const editingNode = ref(null)
const showDeleteDialog = ref(false)
const nodeToDelete = ref(null)
const childCount = ref(0)
const deleteDialogType = ref('children') // 'children' | 'task-link'
const isRendering = ref(true) // Loading state khi đang render mindmap
const showTaskLinkDragDialog = ref(false)
const taskLinkDragNodeId = ref(null)
const taskLinkDragResolve = ref(null) // Promise resolve function để trả kết quả từ dialog
let saveTimeout = null
const SAVE_DELAY = 2000
const showPanel = ref(false);
const activeCommentNode = ref(null)
const commentPanelRef = ref(null)
const commentInputValue = ref("")
const isFromUI = ref(false)
// Liên kết công việc
const showTaskLinkModal = ref(false)
const taskLinkNode = ref(null)
const taskLinkMode = ref('existing') // 'existing' | 'from-node'
const taskSearch = ref('')
const taskSearchInput = ref('')
const selectedTaskId = ref(null)
const attachTaskLink = ref(false)
const taskLinkUrl = ref('')
const taskProjectFilter = ref('all')
const taskPage = ref(1)
const TASK_PAGE_SIZE = 10
const taskOptions = ref([])
const taskPagination = ref({ page: 1, total_pages: 1, total: 0 })
const taskLoading = ref(false)
const taskProjectOptionMap = ref({})

// Fetch project options separately
const fetchProjectOptions = async () => {
  try {
    // Lấy owner của node nếu có taskLinkNode
    
    
    const res = await call("drive.api.mindmap_task.get_my_projects")
    
    const projects = res?.data || []
    console.log('fetchProjectOptions - projects:', projects)
    
    // Cập nhật taskProjectOptionMap với tất cả projects, bao gồm end_date
    const nextMap = { ...(taskProjectOptionMap.value || {}) }
    projects.forEach(p => {
      if (p.name) {
        // Lưu object đầy đủ thông tin project bao gồm end_date
        nextMap[p.name] = {
          label: p.project_name || p.name,
          project_name: p.project_name || p.name,
          end_date: p.end_date || null, // Đảm bảo không undefined
          need_approve: p.need_approve || false // Đảm bảo không undefined
        }
        console.log(`[fetchProjectOptions] Project ${p.name}: end_date=${p.end_date}, need_approve=${p.need_approve}`)
      }
    })
    taskProjectOptionMap.value = nextMap
    console.log('fetchProjectOptions - taskProjectOptionMap updated:', taskProjectOptionMap.value)
  } catch (err) {
    console.error("Failed to fetch project options", err)
  }
}

const fetchTaskOptions = async ({ resetPage = false } = {}) => {
  if (resetPage) taskPage.value = 1
  taskLoading.value = true
  try {
    // Lấy owner của node nếu có taskLinkNode
    // Luôn sử dụng owner từ mindmapEntity (entity owner = node owner trong mindmap)
    
    const res = await call("drive.api.mindmap_task.get_my_tasks", {
      project: taskProjectFilter.value !== 'all' ? taskProjectFilter.value : null,
      page: taskPage.value,
      page_size: TASK_PAGE_SIZE,
      search: taskSearch.value?.trim() || undefined
    })
    // Xử lý response: frappe-ui call() có thể trả về res.message hoặc res trực tiếp
    // Kiểm tra cả hai trường hợp để đảm bảo tương thích
    let list = []
    if (res?.message?.data) {
      // Trường hợp: { message: { data: [...] } }
      list = res.message.data
    } else if (res?.data) {
      // Trường hợp: { data: [...] } (frappe-ui đã unwrap)
      list = res.data
    } else if (Array.isArray(res)) {
      // Trường hợp: frappe-ui trả về array trực tiếp
      list = res
    }
    console.log('[DEBUG fetchTaskOptions] res:', res)
    console.log('[DEBUG fetchTaskOptions] list:', list)
    
    taskOptions.value = list.map(t => ({
      id: t.id,
      // lưu cả task_name và title để tương thích UI
      task_name: t.task_name || t.title || t.id,
      title: t.task_name || t.title || t.id,
      assignee: t.assignee || '',
      office_name: t.office_name || '',
      status: t.status_vi || t.status || '',
      project: t.project || null,
      project_name: t.project_name || t.project || null
    }))

    // Cập nhật tập dự án hiển thị (giữ lại để filter không bị thu hẹp)
    // Luôn giữ lại các projects từ các lần fetch trước, chỉ thêm mới hoặc cập nhật
    const nextMap = { ...(taskProjectOptionMap.value || {}) }
    taskOptions.value.forEach(t => {
      if (t.project) {
        // Thêm hoặc cập nhật project vào map
        nextMap[t.project] = t.project_name || t.project
      }
    })
    taskProjectOptionMap.value = nextMap
    
    console.log('taskProjectOptionMap updated:', taskProjectOptionMap.value)

    // Xử lý pagination tương tự như data
    let pag = {}
    if (res?.message?.pagination) {
      pag = res.message.pagination
    } else if (res?.pagination) {
      pag = res.pagination
    }
    taskPagination.value = {
      page: pag.page || taskPage.value,
      total_pages: pag.total_pages || 1,
      total: pag.total || taskOptions.value.length
    }

    if (!taskOptions.value.length) {
      selectedTaskId.value = null
    } else if (!selectedTaskId.value || !taskOptions.value.some(t => t.id === selectedTaskId.value)) {
      selectedTaskId.value = taskOptions.value[0].id
    }
  } catch (err) {
    console.error("Failed to fetch tasks", err)
    taskOptions.value = []
    taskPagination.value = { page: 1, total_pages: 1, total: 0 }
    selectedTaskId.value = null
  } finally {
    taskLoading.value = false
  }
}

const taskProjectOptions = computed(() => {
  // Lấy thông tin đầy đủ của project từ taskProjectOptionMap hoặc từ API response
  return Object.entries(taskProjectOptionMap.value || {}).map(([value, data]) => {
    // Nếu data là object có end_date, giữ nguyên
    if (typeof data === 'object' && data !== null) {
      const option = {
        value,
        label: data.label || data.project_name || value,
        end_date: data.end_date || null, // Đảm bảo không undefined
        need_approve: data.need_approve !== undefined ? data.need_approve : false
      }
      console.log(`[taskProjectOptions] Project ${value}: end_date=${option.end_date}, need_approve=${option.need_approve}`)
      return option
    }
    // Nếu data chỉ là string (label), chỉ trả về value và label
    return {
      value,
      label: data || value,
      end_date: null,
      need_approve: false
    }
  })
})

const filteredTasksRaw = computed(() => {
  // Backend đã thực hiện search rồi, không cần filter lại ở frontend
  // Chỉ trả về taskOptions.value trực tiếp
  return taskOptions.value
})

const totalTaskPages = computed(() => taskPagination.value.total_pages || 1)

const filteredTasks = computed(() => filteredTasksRaw.value)

watch([() => taskProjectFilter.value, () => taskSearch.value], () => {
  taskPage.value = 1
  fetchTaskOptions({ resetPage: true })
})

watch(() => taskPage.value, () => {
  fetchTaskOptions()
})

// Đảm bảo luôn có selection hợp lệ khi lọc danh sách
watch(filteredTasks, (list) => {
  if (!list || list.length === 0) {
    selectedTaskId.value = null
    return
  }
  if (!selectedTaskId.value || !list.some(t => t.id === selectedTaskId.value)) {
    selectedTaskId.value = list[0].id
  }
})

const setTaskPage = (page) => {
  const total = totalTaskPages.value
  if (page < 1) page = 1
  if (page > total) page = total
  if (page !== taskPage.value) {
    taskPage.value = page
  }
}

// Đảm bảo luôn có selection hợp lệ khi lọc danh sách (raw) nếu rỗng thì clear
watch(filteredTasksRaw, (list) => {
  if (!list || list.length === 0) {
    selectedTaskId.value = null
    return
  }
})

// Đảm bảo selection hợp lệ sau khi mở modal
watch([filteredTasks, taskPage], ([list]) => {
  if (!list || list.length === 0) {
    selectedTaskId.value = null
    return
  }
  if (!selectedTaskId.value || !list.some(t => t.id === selectedTaskId.value)) {
    selectedTaskId.value = list[0].id
  }
})

// Debounce search input to avoid rapid API calls
let taskSearchDebounce
watch(taskSearchInput, (val) => {
  if (taskSearchDebounce) clearTimeout(taskSearchDebounce)
  taskSearchDebounce = setTimeout(() => {
    taskSearch.value = val
  }, 350)
})


const route = useRoute()
const isMindmapReady = ref(false)

const toolbarRef = ref(null)

// Computed: Lấy editor instance từ selectedNode
const currentEditorInstance = computed(() => {
  if (!selectedNode.value || !d3Renderer) return null
  return d3Renderer.getEditorInstance(selectedNode.value.id)
})

// Elements ref
const elements = ref([])

// D3 Renderer
const d3Container = ref(null)
let d3Renderer = null

// Node counter
let nodeCounter = 0

// Track node creation order
const nodeCreationOrder = ref(new Map()) // Track when nodes were created
let creationOrderCounter = 0

// Clipboard state
const clipboard = ref(null) // { type: 'node' | 'text', data: node data or text }
const hasClipboard = computed(() => clipboard.value !== null)

// ✅ Watch elements to ensure root node is NEVER deleted
watch(elements, (newElements) => {
  const nodes = newElements.filter(el => el.id && !el.source && !el.target)
  const hasRoot = nodes.some(el => el.id === 'root')

  if (!hasRoot && nodes.length > 0) {
    

    const rootNode = {
      id: 'root',
      data: {
        label: mindmap.data?.title || 'Root',
        isRoot: true
      }
    }

    elements.value = [rootNode, ...newElements]
  }
}, { deep: true })

// Format time
const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// API: Load mindmap
const mindmap = createResource({
  url: "drive.api.mindmap.get_mindmap_data",
  method: "GET",
  auto: true,
  params: {
    entity_name: props.entityName,
  },
  onSuccess(data) {
    

    window.document.title = data.title
    store.commit("setActiveEntity", data)

    initializeMindmap(data)
  },
  onError(error) {
    
  }
})

// Resource thứ hai: lấy thông tin entity (kèm breadcrumbs) giống Document.vue
const mindmapEntity = createResource({
  url: "drive.api.permissions.get_entity_with_permissions",
  method: "GET",
  auto: true,
  params: {
    entity_name: props.entityName,
  },
  onSuccess(data) {
    // Chỉ dùng để thiết lập breadcrumbs, tránh ghi đè logic mindmap khác
    if (data.breadcrumbs && Array.isArray(data.breadcrumbs)) {
      setBreadCrumbs(data.breadcrumbs, data.is_private, () => {
        data.write && emitter.emit("rename")
      })
    }
  },
})

// Initialize mindmap with root node
const initializeMindmap = async (data) => {
  if (data.mindmap_data && data.mindmap_data.nodes && data.mindmap_data.nodes.length > 0) {
    // Convert VueFlow format to D3 format
    const loadedNodes = data.mindmap_data.nodes.map(node =>

    ({
      id: node.id,
      data: node.data || { label: node.label || '' },
      position: node.position,
      count: node.count || 0,
      node_key: node.node_key ?? null, // thêm node_key và created_at để về sau còn look up history comment
      created_at: node.created_at ?? null,
    }))

    const loadedEdges = data.mindmap_data.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target
    }))

    elements.value = [...loadedNodes, ...loadedEdges]

    const maxId = Math.max(...loadedNodes.map(n => {
      const match = n.id.match(/node-(\d+)/)
      return match ? parseInt(match[1]) : 0
    }))
    nodeCounter = maxId + 1

    // ⚠️ CRITICAL: Store existing creation order từ node.data.order nếu có
    // Nếu không có order trong node.data, dùng index làm fallback
    loadedNodes.forEach((node, index) => {
      // Ưu tiên sử dụng order từ node.data.order nếu có
      const order = node.data?.order !== undefined ? node.data.order : index
      nodeCreationOrder.value.set(node.id, order)
    })
    // Tìm order lớn nhất để set creationOrderCounter
    const maxOrder = Math.max(...Array.from(nodeCreationOrder.value.values()), loadedNodes.length - 1)
    creationOrderCounter = maxOrder + 1

    
  } else {
    const rootNode = {
      id: 'root',
      data: {
        label: data.title,
        isRoot: true
      }
    }

    elements.value = [rootNode]
    nodeCounter = 1

    // Store root
    nodeCreationOrder.value.set('root', 0)
    creationOrderCounter = 1

    

    setTimeout(() => scheduleSave(), 500)
  }

  // Initialize D3 renderer
  await nextTick()
  initD3Renderer()
}

// Initialize D3 Renderer
const initD3Renderer = () => {
  if (!d3Container.value) return

  // Set loading state khi bắt đầu render
  isRendering.value = true

  d3Renderer = new D3MindmapRenderer(d3Container.value, {
    width: window.innerWidth,
    height: window.innerHeight - 84,
    nodeSpacing: 20,
    layerSpacing: 40,
    padding: 20,
    nodeCreationOrder: nodeCreationOrder
  })

  // Lưu uploadImage function vào renderer để có thể dùng trong node editor
  d3Renderer.uploadImage = async (file) => {
    return await uploadImageToMindmap(file, props.team, props.entityName)
  }

  installMindmapContextMenu(d3Renderer)

  d3Renderer.setCallbacks({
    onNodeClick: (node, event) => {
      // Đóng context menu khi click vào node
      if (showContextMenu.value) {
        showContextMenu.value = false
      }
      
      if (event?.target?.closest?.('.comment-count-badge')) {
        // chặn click select node để click badge count -> mở comment list section
        
        return
      }
      if (node) {
        selectedNode.value = node
        d3Renderer.selectNode(node.id, false) // Cho phép callback
        
      } else {
        // Deselect node - skip callback để tránh vòng lặp vô hạn
        selectedNode.value = null
        d3Renderer.selectNode(null, true) // Skip callback vì đã được gọi từ selectNode
        
      }
    },
    onNodeDoubleClick: () => {
      /* Editing happens inline inside each node */
    },
    onNodeAdd: (parentId) => {
      addChildToNode(parentId)
    },
    onNodeUpdate: (nodeId, updates) => {
      const node = nodes.value.find(n => n.id === nodeId)
      if (node) {
        // Cập nhật label nếu có
        if (updates.label !== undefined) {
          node.data.label = updates.label
        }
        // Cập nhật parentId nếu có (drag-and-drop)
        if (updates.parentId !== undefined) {
          // Tìm và cập nhật edge
          const edgeIndex = edges.value.findIndex(e => e.target === nodeId)
          if (edgeIndex !== -1) {
            edges.value[edgeIndex].source = updates.parentId
          } else {
            // Tạo edge mới nếu chưa có
            edges.value.push({
              id: `edge-${updates.parentId}-${nodeId}`,
              source: updates.parentId,
              target: nodeId
            })
          }
          // Cập nhật layout
          updateD3RendererWithDelay()
        }

        // ⚠️ NEW: Nếu là style update (skipSizeCalculation = true), không tính toán lại kích thước
        if (updates.skipSizeCalculation) {
          // Chỉ lưu nội dung, không update layout
          scheduleSave()
          return
        }

        // Chỉ lưu layout/nội dung node, không đổi tên file ở đây
        scheduleSave()
      }
    },
    onNodeReorder: (nodeId, newOrder) => {
      // ⚠️ NEW: Cập nhật nodeCreationOrder khi reorder sibling
      nodeCreationOrder.value.set(nodeId, newOrder)
      

      // Cập nhật renderer với nodeCreationOrder mới
      if (d3Renderer) {
        d3Renderer.options.nodeCreationOrder = nodeCreationOrder.value
        d3Renderer.render()
      }

      scheduleSave()
    },
    onNodeEditingStart: (nodeId) => {
      editingNode.value = nodeId
    },
    onNodeEditingEnd: (nodeId) => {
      // Chỉ khi KẾT THÚC edit mới đổi tên file nếu là node root
      const finishedNodeId = nodeId || editingNode.value
      if (finishedNodeId) {
        const node = nodes.value.find(n => n.id === finishedNodeId)
        if (node) {
          // node.data.label đã được cập nhật trong renderer on('blur')

          // Nếu là root node, đổi tên file
          if (node.id === 'root' || node.data?.isRoot) {
            const originalLabel = (node.data?.label || '').trim()
            let newTitle = extractTitleFromLabel(originalLabel)

            // Nếu xóa hết text, dùng tên mặc định
            if (!newTitle) {
              newTitle = "Sơ đồ"
              // Cập nhật label với tên mặc định
              node.data.label = newTitle
            }

            // Title giờ là Text, không cần cắt nữa - dùng trực tiếp newTitle để rename
            renameMindmapTitle(newTitle)
          }

          // Lưu layout/nội dung node
          scheduleSave()
        }
      }

      // Clear editingNode trước khi update để watch không bị trigger
      editingNode.value = null

      // Update layout sau khi edit xong để đảm bảo node size chính xác
      // Tăng delay lên 300ms để đảm bảo DOM đã update và node size đã được tính toán lại
      // Đặc biệt quan trọng khi edit node giữa có nhiều node con
      updateD3RendererWithDelay(300)
    },
    onNodeHover: (nodeId, isHovering) => {
      hoveredNode.value = isHovering ? nodeId : null
    },
    onNodeCollapse: (nodeId, isCollapsed) => {
      
      // Re-render sẽ được xử lý trong renderer
      updateD3Renderer()
    },
    onRenderComplete: () => {
      // ⚠️ NEW: Scroll to node from hash sau khi render hoàn tất
      scrollToNodeFromHash()
      // Dừng loading khi render xong
      isRendering.value = false
      isMindmapReady.value = true
      
      // ⚠️ NEW: Apply/remove strikethrough cho tất cả nodes dựa trên completed status
      // Cần apply cho cả completed = true (add) và completed = false (remove)
      nextTick(() => {
        setTimeout(() => {
          nodes.value.forEach(node => {
            if (node.id !== 'root') {
              const editorInstance = d3Renderer?.getEditorInstance?.(node.id)
              if (editorInstance) {
                const isCompleted = node.data?.completed || false
                applyStrikethroughToTitle(editorInstance, isCompleted)
              }
            }
          })
        }, 200) // Delay để đảm bảo editor đã sẵn sàng
      })
    },
    onNodeContextMenu: (node, pos) => {
      contextMenuNode.value = node
      contextMenuPos.value = pos
      contextMenuCentered.value = false // Context menu từ node không dùng center
      showContextMenu.value = true
    },
    onOpenCommentList: handleContextMenuAction,
    onTaskLinkDragConfirm: async (nodeId) => {
      // Hiển thị dialog và trả về kết quả (true nếu user xác nhận, false nếu hủy)
      return await showTaskLinkDragWarning(nodeId)
    },
  })

  updateD3Renderer()
}

// Đổi tên file mindmap khi sửa node root
const renameMindmapTitle = (newTitle) => {
  if (!newTitle || !newTitle.trim()) return

  // Cập nhật ngay trên client
  if (mindmap.data) {
    mindmap.data.title = newTitle
  }
  if (store.state.activeEntity) {
    store.state.activeEntity.title = newTitle
  }
  window.document.title = newTitle

  // Cập nhật breadcrumbs trong store (cache) với tên mới
  const currentBreadcrumbs = store.state.breadcrumbs || []
  if (Array.isArray(currentBreadcrumbs) && currentBreadcrumbs.length > 0) {
    const updated = currentBreadcrumbs.map((crumb, idx) => {
      if (idx === currentBreadcrumbs.length - 1) {
        return {
          ...crumb,
          label: newTitle,
          title: newTitle,
        }
      }
      return crumb
    })
    store.commit("setBreadcrumbs", updated)
  }

  // Gửi request đổi tên entity
  rename.submit({
    entity_name: props.entityName,
    new_title: newTitle.trim(),
  })
}

// Update D3 renderer
const updateD3Renderer = async () => {
  if (!d3Renderer) return

  await nextTick()

  // ✅ FIX: Đảm bảo nodeCreationOrder được update
  d3Renderer.options.nodeCreationOrder = nodeCreationOrder.value

  requestAnimationFrame(() => {
    setTimeout(() => {
      if (d3Renderer) {
        d3Renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
      }
    }, 100)
  })
}

// Update D3 renderer with custom delay (for editing)
const updateD3RendererWithDelay = async (delay = 150) => {
  if (!d3Renderer) return

  await nextTick()

  void document.body.offsetHeight

  // ✅ FIX: Đảm bảo nodeCreationOrder được update
  d3Renderer.options.nodeCreationOrder = nodeCreationOrder.value

  requestAnimationFrame(() => {
    setTimeout(() => {
      void document.body.offsetHeight
      if (d3Renderer) {
        d3Renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
      }
    }, delay)
  })
}

// Helper: Get children of a node
const getChildren = (nodeId) => {
  return edges.value
    .filter(edge => edge.source === nodeId)
    .map(edge => nodes.value.find(n => n.id === edge.target))
    .filter(Boolean)
}

// Helper: Get parent of a node
const getParent = (nodeId) => {
  const edge = edges.value.find(edge => edge.target === nodeId)
  return edge ? nodes.value.find(n => n.id === edge.source) : null
}

// Zoom controls
const fitView = () => {
  if (d3Renderer) {
    d3Renderer.fitView()
  }
}

const zoomIn = () => {
  if (d3Renderer && d3Renderer.svg) {
    d3Renderer.svg.transition()
      .call(d3Renderer.zoom.scaleBy, 1.2)
  }
}

const zoomOut = () => {
  if (d3Renderer && d3Renderer.svg) {
    d3Renderer.svg.transition()
      .call(d3Renderer.zoom.scaleBy, 0.8)
  }
}

// Add child to specific node
const addChildToNode = async (parentId) => {
  const parent = nodes.value.find(n => n.id === parentId)
  if (!parent) return

  const newNodeId = `node-${nodeCounter++}`

  const newNode = {
    id: newNodeId,
    node_key: crypto.randomUUID(), // thêm cái này để làm history comment lookup node
    created_at: Date.now(), 
    data: {
      label: 'Nhánh mới',
      parentId: parentId
    }
  }

  const newEdge = {
    id: `edge-${parentId}-${newNodeId}`,
    source: parentId,
    target: newNodeId
  }

  // ✅ FIX: Store creation order BEFORE adding to elements
  nodeCreationOrder.value.set(newNodeId, creationOrderCounter++)

  // Add node and edge
  elements.value = [
    ...nodes.value,
    newNode,
    ...edges.value,
    newEdge
  ]

  selectedNode.value = newNode

  // Set selectedNode trong d3Renderer TRƯỚC KHI render để node có style selected ngay từ đầu
  if (d3Renderer) {
    d3Renderer.selectedNode = newNodeId
  }

  

  // Wait for DOM to render
  await nextTick()

  // Force reflow
  void document.body.offsetHeight

  // ✅ FIX: Update với delay nhỏ hơn để responsive hơn
  requestAnimationFrame(() => {
    void document.body.offsetHeight

    setTimeout(() => {
      // Update với nodeCreationOrder mới
      updateD3RendererWithDelay(100)

      // Đảm bảo selectedNode vẫn được set sau khi render
      if (d3Renderer) {
        setTimeout(() => {
          d3Renderer.selectNode(newNodeId)

          // ⚠️ NEW: Tự động focus vào editor của node mới để có thể nhập ngay
          setTimeout(() => {
            const nodeGroup = d3Renderer.g.select(`[data-node-id="${newNodeId}"]`)
            if (!nodeGroup.empty()) {
              const fo = nodeGroup.select('.node-text')
              const foNode = fo.node()

              if (foNode) {
                // Enable pointer events cho editor container
                const editorContainer = nodeGroup.select('.node-editor-container')
                if (!editorContainer.empty()) {
                  editorContainer.style('pointer-events', 'auto')
                }

                // Lấy editor instance và focus
                const editorInstance = d3Renderer.getEditorInstance(newNodeId)
                if (editorInstance) {
                  // Focus vào editor và đặt cursor ở cuối
                  editorInstance.commands.focus('end')
                  // Gọi handleEditorFocus để setup đúng cách
                  d3Renderer.handleEditorFocus(newNodeId, foNode, newNode)
                } else {
                  // Nếu editor chưa sẵn sàng, thử lại sau
                  setTimeout(() => {
                    const editorInstance2 = d3Renderer.getEditorInstance(newNodeId)
                    if (editorInstance2) {
                      editorInstance2.commands.focus('end')
                      d3Renderer.handleEditorFocus(newNodeId, foNode, newNode)
                    }
                  }, 100)
                }
              }
            }
          }, 200) // Đợi render xong
        }, 150)
      }
    }, 30)
  })

  scheduleSave()
}

// Helper: Extract plain title from node label (ignore blockquote/description)
const extractTitleFromLabel = (label) => {
  const raw = (label || '').trim()
  if (!raw) return ''
  if (!raw.includes('<')) return raw

  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = raw

  const paragraphs = Array.from(tempDiv.querySelectorAll('p'))
  for (const p of paragraphs) {
    // Lấy <p> đầu tiên không nằm trong blockquote (chỉ là title)
    if (!p.closest('blockquote')) {
      const text = (p.textContent || '').trim()
      if (text) return text
    }
  }

  // Fallback: toàn bộ textContent
  return (tempDiv.textContent || '').trim()
}

// Add sibling node
const addSiblingToNode = async (nodeId) => {
  if (nodeId === 'root') return

  const parentEdge = edges.value.find(e => e.target === nodeId)

  if (!parentEdge) {
    
    return
  }

  const parentId = parentEdge.source

  const newNodeId = `node-${nodeCounter++}`

  const newNode = {
    id: newNodeId,
    data: {
      label: 'Nhánh mới',
      parentId: parentId
    }
  }

  const newEdge = {
    id: `edge-${parentId}-${newNodeId}`,
    source: parentId,
    target: newNodeId
  }

  // ✅ FIX: Store creation order
  nodeCreationOrder.value.set(newNodeId, creationOrderCounter++)

  // Add node and edge
  elements.value = [
    ...nodes.value,
    newNode,
    ...edges.value,
    newEdge
  ]

  selectedNode.value = newNode

  // Set selectedNode trong d3Renderer TRƯỚC KHI render để node có style selected ngay từ đầu
  if (d3Renderer) {
    d3Renderer.selectedNode = newNodeId
  }

  

  // Wait for DOM to render
  await nextTick()

  // Force reflow
  void document.body.offsetHeight

  // ✅ FIX: Update với delay nhỏ hơn để responsive hơn
  requestAnimationFrame(() => {
    void document.body.offsetHeight

    setTimeout(() => {
      // Update với nodeCreationOrder mới
      updateD3RendererWithDelay(100)

      // Đảm bảo selectedNode vẫn được set sau khi render
      if (d3Renderer) {
        setTimeout(() => {
          d3Renderer.selectNode(newNodeId)

          // ⚠️ NEW: Tự động focus vào editor của node mới để có thể nhập ngay
          setTimeout(() => {
            const nodeGroup = d3Renderer.g.select(`[data-node-id="${newNodeId}"]`)
            if (!nodeGroup.empty()) {
              const fo = nodeGroup.select('.node-text')
              const foNode = fo.node()

              if (foNode) {
                // Enable pointer events cho editor container
                const editorContainer = nodeGroup.select('.node-editor-container')
                if (!editorContainer.empty()) {
                  editorContainer.style('pointer-events', 'auto')
                }

                // Lấy editor instance và focus
                const editorInstance = d3Renderer.getEditorInstance(newNodeId)
                if (editorInstance) {
                  // Focus vào editor và đặt cursor ở cuối
                  editorInstance.commands.focus('end')
                  // Gọi handleEditorFocus để setup đúng cách
                  d3Renderer.handleEditorFocus(newNodeId, foNode, newNode)
                } else {
                  // Nếu editor chưa sẵn sàng, thử lại sau
                  setTimeout(() => {
                    const editorInstance2 = d3Renderer.getEditorInstance(newNodeId)
                    if (editorInstance2) {
                      editorInstance2.commands.focus('end')
                      d3Renderer.handleEditorFocus(newNodeId, foNode, newNode)
                    }
                  }, 100)
                }
              }
            }
          }, 200) // Đợi render xong
        }, 150)
      }
    }, 30)
  })

  scheduleSave()
}

// Helper: Count all descendants (children + grandchildren + ...) of a node
const countChildren = (nodeId) => {
  const visited = new Set()
  let count = 0

  const countDescendants = (id) => {
    if (visited.has(id)) return
    visited.add(id)

    const children = edges.value.filter(e => e.source === id)
    count += children.length

    children.forEach(edge => {
      countDescendants(edge.target)
    })
  }

  countDescendants(nodeId)
  return count
}

// Delete node with cascade
const deleteSelectedNode = () => {
  if (!selectedNode.value) return

  if (selectedNode.value.id === 'root') {
    
    return
  }

  const nodeId = selectedNode.value.id
  const node = selectedNode.value

  // Kiểm tra xem node có node con không
  const children = edges.value.filter(e => e.source === nodeId)
  const totalChildren = countChildren(nodeId)

  // Ưu tiên cảnh báo về nhánh con nếu có
  if (children.length > 0) {
    // Có node con: hiển thị popup cảnh báo
    nodeToDelete.value = nodeId
    childCount.value = totalChildren
    deleteDialogType.value = 'children'
    showDeleteDialog.value = true
    return
  }

  // Không có node con: kiểm tra có task link không
  if (node.data?.taskLink?.taskId) {
    // Có task link: hiển thị popup cảnh báo
    nodeToDelete.value = nodeId
    deleteDialogType.value = 'task-link'
    showDeleteDialog.value = true
    return
  }

  // Không có node con và không có task link: xóa trực tiếp
  performDelete(nodeId)
}

// Thực hiện xóa node
const performDelete = async (nodeId) => {
  

  const nodesToDelete = new Set([nodeId])

  const collectDescendants = (id) => {
    const childEdges = edges.value.filter(e => e.source === id)

    childEdges.forEach(edge => {
      const childId = edge.target
      nodesToDelete.add(childId)
      collectDescendants(childId)
    })
  }

  collectDescendants(nodeId)

  

  // Remove nodes and edges
  const newNodes = nodes.value.filter(n => {
    if (n.id === 'root') return true
    if (nodesToDelete.has(n.id)) {
      nodeCreationOrder.value.delete(n.id)
      return false
    }
    return true
  })

  const newEdges = edges.value.filter(e => {
    if (nodesToDelete.has(e.source) || nodesToDelete.has(e.target)) {
      return false
    }
    return true
  })

  elements.value = [...newNodes, ...newEdges]
  selectedNode.value = null

  

  const res = await call("drive.api.mindmap_comment.delete_comments_by_nodes", {
    mindmap_id: props?.entityName,
    node_ids: Array.from(nodesToDelete)
  })

  


  // Update D3 renderer after deletion
  updateD3Renderer()
  scheduleSave()
}

// Đóng dialog xóa
const closeDeleteDialog = () => {
  showDeleteDialog.value = false
  deleteDialogType.value = 'children' // Reset về mặc định
  nodeToDelete.value = null
}

// Xác nhận xóa từ dialog
const confirmDelete = () => {
  if (nodeToDelete.value) {
    performDelete(nodeToDelete.value)
    nodeToDelete.value = null
  }
  deleteDialogType.value = 'children' // Reset về mặc định
  showDeleteDialog.value = false
}

// ===== Task link drag warning dialog =====
const showTaskLinkDragWarning = (nodeId) => {
  return new Promise((resolve) => {
    taskLinkDragNodeId.value = nodeId
    taskLinkDragResolve.value = resolve
    showTaskLinkDragDialog.value = true
  })
}

const closeTaskLinkDragDialog = () => {
  if (taskLinkDragResolve.value) {
    taskLinkDragResolve.value(false) // User hủy
    taskLinkDragResolve.value = null
  }
  showTaskLinkDragDialog.value = false
  taskLinkDragNodeId.value = null
}

const confirmTaskLinkDrag = () => {
  if (taskLinkDragResolve.value) {
    taskLinkDragResolve.value(true) // User xác nhận
    taskLinkDragResolve.value = null
  }
  showTaskLinkDragDialog.value = false
  taskLinkDragNodeId.value = null
}

// ===== Liên kết công việc cho nhánh =====
const resolveTaskLinkNode = (val) => {
  if (!val) return null
  if (typeof val === 'string') {
    return nodes.value.find((n) => n.id === val) || null
  }
  if (val.id) return val
  return null
}

const getTaskOpenUrl = (taskId, projectId) => {
  if (!taskId || !projectId) return ''
  if (typeof window === 'undefined') return ''
  const origin = window.location.origin
  return `${origin}/mtp/project/${projectId}?task_id=${taskId}`
}

const getDefaultTaskLink = (nodeId) => {
  if (typeof window === 'undefined') return ''
  const origin = window.location.origin
  const team = props.team || 't'
  const mindmapId = props.entityName
  const driveCopyUrl = `${origin}/drive/t/${team}/mindmap/${mindmapId}#node-${nodeId}`
  return `${origin}/mtp/my-drive?drive_copy=${encodeURIComponent(driveCopyUrl)}`
}

const openTaskLinkModal = async (node) => {
  taskLinkNode.value = resolveTaskLinkNode(node)
  taskLinkMode.value = 'existing'
  taskSearch.value = ''
  attachTaskLink.value = false
  taskLinkUrl.value = ''
  taskPage.value = 1
  
  // Fetch project options và tasks song song
  await Promise.all([
    fetchProjectOptions(),
    fetchTaskOptions({ resetPage: true })
  ])
  
  // Mở modal sau khi đã fetch xong để đảm bảo project options đã có
  showTaskLinkModal.value = true
  selectedTaskId.value = filteredTasks.value?.[0]?.id || null
}

const closeTaskLinkModal = () => {
  showTaskLinkModal.value = false
  taskLinkNode.value = null
}

const confirmTaskLink = async () => {
  const linkNode = resolveTaskLinkNode(taskLinkNode.value)
  if (!linkNode) {
    closeTaskLinkModal()
    return
  }
  const targetNode = resolveTaskLinkNode(linkNode)
  if (!targetNode) {
    closeTaskLinkModal()
    return
  }
  if (targetNode.data?.taskLink?.taskId) {
    toast({ title: "Node này đã liên kết công việc", indicator: "orange" })
    closeTaskLinkModal()
    return
  }

  const selectedTask = taskOptions.value.find(t => t.id === selectedTaskId.value) || null
  const plainTitle = extractTitleFromLabel(targetNode.data?.label || '')

  const fallbackLink = getDefaultTaskLink(targetNode.id)
  const projectId = selectedTask?.project || selectedTask?.project_name
  const taskOpenLink = selectedTask?.id && projectId
    ? getTaskOpenUrl(selectedTask.id, projectId)
    : ''

  const taskPayload = {
    mode: taskLinkMode.value,
    nodeId: targetNode.id,
    title: taskLinkMode.value === 'existing'
      ? selectedTask?.title || ''
      : plainTitle || targetNode.data?.label || '',
    taskId: taskLinkMode.value === 'existing' ? selectedTask?.id || null : null,
    assignee: selectedTask?.assignee || null,
    status: selectedTask?.status || null,
    linkUrl: fallbackLink
  }

  targetNode.data = {
    ...targetNode.data,
    taskLink: taskPayload
  }

  try {
    // Tạo comment link (Task)
    if (taskPayload.linkUrl && taskPayload.taskId) {
      const nodeTitle = plainTitle || targetNode.data?.label || ''
      const mindmapTitle = mindmap.data?.title || ''
      await call("drive.api.mindmap_comment.add_task_link_comment", {
        task_id: taskPayload.taskId,
        node_title: nodeTitle,
        mindmap_title: mindmapTitle,
        link_url: taskPayload.linkUrl
      })
    }

    // Thêm badge tick xanh dưới title node (ngay sau paragraph đầu tiên, trước ảnh)
    // Wrap badge trong section riêng để dễ phân biệt và style
    // Chỉ thêm badge khi người dùng đã tick checkbox "Gắn link công việc"
    if (taskPayload.linkUrl && attachTaskLink.value) {
      const badgeHtml = `<section class="node-task-link-section" data-node-section="task-link" style="margin-top:6px;"><div class="node-task-badge" style="display:flex;align-items:center;gap:6px;font-size:12px;color:#16a34a;"><span style="display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center;">📄</span><a href="${taskOpenLink}" target="_top" onclick="event.preventDefault(); window.parent && window.parent.location && window.parent.location.href ? window.parent.location.href=this.href : window.location.href=this.href;" style="color:#0ea5e9;text-decoration:none;">Liên kết công việc</a></div></section>`
      if (typeof targetNode.data?.label === 'string' && !targetNode.data.label.includes('node-task-badge')) {
        // Parse HTML để chèn badge vào đúng vị trí (ngay sau title, trước ảnh)
        try {
          const parser = new DOMParser()
          const doc = parser.parseFromString(targetNode.data.label, 'text/html')
          const body = doc.body
          
          // Xóa tất cả paragraph rỗng (is-empty hoặc chỉ có br/whitespace) và paragraph chứa ⋮
          const allParagraphs = body.querySelectorAll('p')
          allParagraphs.forEach(p => {
            const text = p.textContent?.trim() || ''
            const hasOnlyBr = p.querySelectorAll('br').length === p.childNodes.length && p.childNodes.length > 0
            const isEmpty = p.classList.contains('is-empty') || (text === '' && hasOnlyBr)
            const hasMenuDots = text === '⋮' || text.includes('⋮')
            if (isEmpty || hasMenuDots) {
              p.remove()
            }
          })
          
          // Xóa tất cả button menu (image-menu-button)
          const menuButtons = body.querySelectorAll('.image-menu-button, button[aria-label="Image options"]')
          menuButtons.forEach(btn => btn.remove())
          
          // Tìm paragraph đầu tiên có nội dung (title) và thêm class để phân biệt
          const firstParagraph = body.querySelector('p')
          
          if (firstParagraph) {
            // Thêm class để phân biệt title
            firstParagraph.classList.add('node-title-section')
            firstParagraph.setAttribute('data-node-section', 'title')
            
            // Tạo badge element
            const badgeElement = parser.parseFromString(badgeHtml, 'text/html').body.firstChild
            
            // Tìm ảnh đầu tiên trong toàn bộ body (có thể là img hoặc trong wrapper)
            const firstImage = body.querySelector('img, .image-wrapper-node, .image-wrapper')
            
            if (firstImage) {
              // Có ảnh - kiểm tra xem ảnh/wrapper có nằm trong paragraph đầu tiên không
              const imageWrapper = firstImage.closest('.image-wrapper-node, .image-wrapper')
              const imageContainer = imageWrapper || firstImage
              const imageParent = imageContainer.parentElement
              
              // Thêm class và attribute để phân biệt phần ảnh
              let finalImageContainer = imageContainer
              if (imageContainer.classList.contains('image-wrapper-node') || imageContainer.classList.contains('image-wrapper')) {
                // Đã có wrapper - thêm class vào wrapper
                imageContainer.classList.add('node-image-section')
                imageContainer.setAttribute('data-node-section', 'image')
              } else if (imageContainer.tagName === 'IMG') {
                // Ảnh không có wrapper - wrap trong section
                const imageSection = doc.createElement('section')
                imageSection.classList.add('node-image-section')
                imageSection.setAttribute('data-node-section', 'image')
                imageContainer.parentElement.insertBefore(imageSection, imageContainer)
                imageSection.appendChild(imageContainer)
                finalImageContainer = imageSection
              } else {
                // Element khác - thêm class trực tiếp
                imageContainer.classList.add('node-image-section')
                imageContainer.setAttribute('data-node-section', 'image')
              }
              
              // Cập nhật lại imageParent sau khi có thể đã wrap
              const updatedImageParent = finalImageContainer.parentElement
              
              if (updatedImageParent === firstParagraph) {
                // Ảnh/wrapper nằm trong paragraph đầu tiên - tách ra và chèn badge
                const imageClone = finalImageContainer.cloneNode(true)
                finalImageContainer.remove()
                // Chèn badge sau paragraph đầu tiên
                body.insertBefore(badgeElement, firstParagraph.nextSibling)
                // Chèn ảnh sau badge
                body.insertBefore(imageClone, badgeElement.nextSibling)
              } else {
                // Ảnh ở element khác - chèn badge trước container của ảnh
                finalImageContainer.parentElement.insertBefore(badgeElement, finalImageContainer)
              }
            } else {
              // Không có ảnh - chèn badge ngay sau paragraph đầu tiên
              if (firstParagraph.nextSibling) {
                body.insertBefore(badgeElement, firstParagraph.nextSibling)
              } else {
                body.appendChild(badgeElement)
              }
            }
            
            // Thêm class cho các paragraph còn lại (mô tả) để phân biệt
            const remainingParagraphs = body.querySelectorAll('p:not(.node-title-section)')
            remainingParagraphs.forEach(p => {
              if (!p.classList.contains('node-description-section')) {
                p.classList.add('node-description-section')
                p.setAttribute('data-node-section', 'description')
              }
            })
            
        // Serialize lại HTML và cleanup thêm một lần nữa để đảm bảo xóa hết <p>⋮</p>
        let cleanedHtml = body.innerHTML
        // Xóa tất cả paragraph chỉ chứa ⋮
        cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*⋮\s*<\/p>/gi, '')
        cleanedHtml = cleanedHtml.replace(/<p[^>]*>.*?⋮.*?<\/p>/gi, '')
        // Xóa tất cả ký tự ⋮ còn lại
        cleanedHtml = cleanedHtml.replace(/⋮/g, '')
        
        targetNode.data.label = cleanedHtml
          } else {
            // Không có paragraph - tạo paragraph mới cho title và chèn badge
            const titleParagraph = doc.createElement('p')
            titleParagraph.textContent = plainTitle || 'Nhánh mới'
            body.appendChild(titleParagraph)
            
            const badgeElement = parser.parseFromString(badgeHtml, 'text/html').body.firstChild
            body.appendChild(badgeElement)
            
            targetNode.data.label = body.innerHTML
          }
        } catch (err) {
          // Fallback: chèn vào cuối nếu parse lỗi
          console.error('Error parsing HTML for badge insertion:', err)
          targetNode.data.label = `${targetNode.data.label}${badgeHtml}`
        }
      }
      if (d3Renderer?.nodeSizeCache) {
        d3Renderer.nodeSizeCache.delete(targetNode.id)
      }
    }

    // Đồng bộ nội dung editor ngay lập tức
    const editorInstance = d3Renderer?.getEditorInstance?.(targetNode.id)
    if (editorInstance && typeof editorInstance.commands?.setContent === 'function') {
      editorInstance.commands.setContent(targetNode.data?.label || '', false)
    }

    const idx = nodes.value.findIndex(n => n.id === targetNode.id)
    if (idx !== -1) {
      nodes.value[idx] = { ...targetNode }
      elements.value = [...nodes.value, ...edges.value]
    }

    await updateD3RendererWithDelay(0)
    
    // ⚠️ CRITICAL: Trigger lại tính toán chiều cao node sau khi thêm badge
    // Đợi DOM cập nhật xong rồi mới tính toán lại chiều cao
    await nextTick()
    
    // ⚠️ FIX: Đợi nhiều frame để đảm bảo DOM đã cập nhật hoàn toàn với badge mới
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Đợi thêm một chút để đảm bảo editor đã cập nhật content với badge
        setTimeout(() => {
          // Tìm foreignObject element của node
          const nodeGroup = document.querySelector(`[data-node-id="${targetNode.id}"]`)
          if (nodeGroup && d3Renderer) {
            const foElement = nodeGroup.querySelector('.node-text')
            if (foElement) {
              // ⚠️ CRITICAL: Gọi trực tiếp handleEditorBlur để tính toán lại height
              // handleEditorBlur sẽ đo lại height từ DOM và cập nhật node size
              try {
                d3Renderer.handleEditorBlur(targetNode.id, foElement, targetNode)
              } catch (err) {
                console.error('Error calling handleEditorBlur:', err)
                // Fallback: gọi updateNodeHeight từ Vue component
                const vueAppEntry = d3Renderer?.vueApps?.get(targetNode.id)
                if (vueAppEntry?.instance && typeof vueAppEntry.instance.updateNodeHeight === 'function') {
                  vueAppEntry.instance.updateNodeHeight()
                }
              }
            }
          }
        }, 150) // Tăng delay để đảm bảo DOM đã cập nhật
      })
    })
    scheduleSave()
    toast({ title: "Đã liên kết công việc thành công", indicator: "green" })
    closeTaskLinkModal()
  } catch (err) {
    console.error("Link task failed", err)
    toast({ title: "Liên kết công việc thất bại", indicator: "red" })
    closeTaskLinkModal()
  }
}

const deleteTaskLink = async (node) => {
  const targetNode = resolveTaskLinkNode(node)
  if (!targetNode) {
    return
  }
  
  if (!targetNode.data?.taskLink?.taskId) {
    toast({ title: "Node này chưa có liên kết công việc", indicator: "orange" })
    return
  }

  try {
    // Xóa task link section khỏi node label HTML
    if (typeof targetNode.data?.label === 'string') {
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(targetNode.data.label, 'text/html')
        const body = doc.body
        
        // Xóa tất cả task link sections
        const taskLinkSections = body.querySelectorAll('.node-task-link-section, [data-node-section="task-link"]')
        taskLinkSections.forEach(section => section.remove())
        
        // Xóa các paragraph chứa link "Liên kết công việc", link có task_id trong href, hoặc chỉ chứa ⋮
        const paragraphs = body.querySelectorAll('p')
        paragraphs.forEach(p => {
          const text = p.textContent?.trim() || ''
          const hasTaskLinkText = text.includes('Liên kết công việc')
          const hasTaskLinkAnchor = p.querySelector('a[href*="task_id"]') || 
            p.querySelector('a[href*="/mtp/project/"]')
          const hasMenuDots = text === '⋮' || text.includes('⋮')
          
          // Xóa nếu paragraph chứa text "Liên kết công việc", có link với task_id, hoặc chỉ chứa ⋮
          if (hasTaskLinkText || hasTaskLinkAnchor || hasMenuDots) {
            p.remove()
          }
        })
        
        // Xóa các link trực tiếp (không nằm trong paragraph) có task_id
        const taskLinks = body.querySelectorAll('a[href*="task_id"], a[href*="/mtp/project/"]')
        taskLinks.forEach(link => {
          const linkText = link.textContent?.trim() || ''
          if (linkText.includes('Liên kết công việc') || link.getAttribute('href')?.includes('task_id')) {
            // Xóa parent element nếu là paragraph, hoặc xóa link nếu không có parent quan trọng
            const parent = link.parentElement
            if (parent && parent.tagName === 'P') {
              parent.remove()
            } else {
              link.remove()
            }
          }
        })
        
        // Cleanup: Xóa các paragraph rỗng hoặc chỉ chứa whitespace sau khi xóa task link
        const remainingParagraphs = body.querySelectorAll('p')
        remainingParagraphs.forEach(p => {
          const text = p.textContent?.trim() || ''
          const hasOnlyBr = p.querySelectorAll('br').length === p.childNodes.length && p.childNodes.length > 0
          const isEmpty = p.classList.contains('is-empty') || (text === '' && hasOnlyBr)
          const hasMenuDots = text === '⋮' || text.includes('⋮')
          if (isEmpty || hasMenuDots) {
            p.remove()
          }
        })
        
        // Serialize lại HTML và cleanup thêm một lần nữa để đảm bảo xóa hết <p>⋮</p>
        let cleanedHtml = body.innerHTML
        // Xóa tất cả paragraph chỉ chứa ⋮
        cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*⋮\s*<\/p>/gi, '')
        cleanedHtml = cleanedHtml.replace(/<p[^>]*>.*?⋮.*?<\/p>/gi, '')
        // Xóa tất cả ký tự ⋮ còn lại (không nằm trong button)
        cleanedHtml = cleanedHtml.replace(/(?<!<button[^>]*>.*?)⋮(?![^<]*<\/button>)/g, '')
        
        targetNode.data.label = cleanedHtml
      } catch (err) {
        console.error('Error parsing HTML for task link removal:', err)
        // Fallback: xóa bằng regex - xóa cả section và paragraph chứa task link
        let cleanedLabel = targetNode.data.label
          // Xóa section wrapper
          .replace(/<section[^>]*class="node-task-link-section"[^>]*>.*?<\/section>/gi, '')
          .replace(/<section[^>]*data-node-section="task-link"[^>]*>.*?<\/section>/gi, '')
          // Xóa paragraph chứa "Liên kết công việc", có task_id trong href, hoặc chỉ chứa ⋮
          .replace(/<p[^>]*>.*?Liên kết công việc.*?<\/p>/gi, '')
          .replace(/<p[^>]*>.*?<a[^>]*href="[^"]*task_id[^"]*"[^>]*>.*?<\/a>.*?<\/p>/gi, '')
          .replace(/<p[^>]*>.*?<a[^>]*href="[^"]*\/mtp\/project\/[^"]*"[^>]*>.*?Liên kết công việc.*?<\/a>.*?<\/p>/gi, '')
          .replace(/<p[^>]*>⋮<\/p>/gi, '')
          .replace(/<p[^>]*>.*?⋮.*?<\/p>/gi, '')
          // Xóa các paragraph rỗng hoặc chỉ chứa whitespace
          .replace(/<p[^>]*class="is-empty"[^>]*>.*?<\/p>/gi, '')
          .replace(/<p[^>]*>\s*<\/p>/gi, '')
          .replace(/<p[^>]*>\s*<br[^>]*>\s*<\/p>/gi, '')
        
        targetNode.data.label = cleanedLabel
      }
    }

    // Xóa taskLink khỏi node.data
    const { taskLink, ...restData } = targetNode.data
    targetNode.data = restData

    // ⚠️ CRITICAL: Xóa fixedWidth và fixedHeight để buộc đo lại từ DOM
    // Vì sau khi xóa task link, kích thước node có thể thay đổi
    if (targetNode.data) {
      delete targetNode.data.fixedWidth
      delete targetNode.data.fixedHeight
    }

    // Xóa cache size để buộc đo lại từ DOM
    if (d3Renderer?.nodeSizeCache) {
      d3Renderer.nodeSizeCache.delete(targetNode.id)
    }

    // Đồng bộ nội dung editor ngay lập tức
    const editorInstance = d3Renderer?.getEditorInstance?.(targetNode.id)
    if (editorInstance) {
      // Clean HTML trước khi set vào editor để xóa <p>⋮</p>
      let contentToSet = targetNode.data?.label || ''
      if (contentToSet) {
        // Xóa tất cả paragraph chỉ chứa ⋮
        contentToSet = contentToSet.replace(/<p[^>]*>\s*⋮\s*<\/p>/gi, '')
        contentToSet = contentToSet.replace(/<p[^>]*>.*?⋮.*?<\/p>/gi, '')
        // Xóa tất cả ký tự ⋮ còn lại
        contentToSet = contentToSet.replace(/⋮/g, '')
      }
      
      if (typeof editorInstance.commands?.setContent === 'function') {
        editorInstance.commands.setContent(contentToSet, false)
      }
      
      // Gọi cleanup function để xóa ⋮ từ DOM và ProseMirror document
      if (typeof editorInstance.cleanupRemoveMenuText === 'function') {
        setTimeout(() => {
          editorInstance.cleanupRemoveMenuText()
        }, 100)
      }
    }

    // Cập nhật nodes array
    const idx = nodes.value.findIndex(n => n.id === targetNode.id)
    if (idx !== -1) {
      nodes.value[idx] = { ...targetNode }
      elements.value = [...nodes.value, ...edges.value]
    }

    // ⚠️ FIX: Gọi handleEditorBlur TRƯỚC updateD3Renderer để đảm bảo kích thước được set đúng
    // Sau đó mới updateD3Renderer để render lại với kích thước đúng
    await nextTick()
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const nodeGroup = document.querySelector(`[data-node-id="${targetNode.id}"]`)
          if (nodeGroup && d3Renderer) {
            const foElement = nodeGroup.querySelector('.node-text')
            if (foElement) {
              try {
                // ⚠️ CRITICAL: Gọi handleEditorBlur để đo lại và set đúng kích thước
                d3Renderer.handleEditorBlur(targetNode.id, foElement, targetNode)
                
                // ⚠️ FIX: Sau khi handleEditorBlur đã set đúng kích thước, mới updateD3Renderer
                // Điều này đảm bảo renderNodes sẽ dùng kích thước từ rect (đã được set đúng)
                setTimeout(() => {
                  updateD3RendererWithDelay(0)
                }, 100)
              } catch (err) {
                console.error('Error calling handleEditorBlur:', err)
                const vueAppEntry = d3Renderer?.vueApps?.get(targetNode.id)
                if (vueAppEntry?.instance && typeof vueAppEntry.instance.updateNodeHeight === 'function') {
                  vueAppEntry.instance.updateNodeHeight()
                }
                // Fallback: vẫn updateD3Renderer nếu có lỗi
                updateD3RendererWithDelay(0)
              }
            } else {
              // Nếu không tìm thấy foElement, vẫn updateD3Renderer
              updateD3RendererWithDelay(0)
            }
          } else {
            // Nếu không tìm thấy nodeGroup, vẫn updateD3Renderer
            updateD3RendererWithDelay(0)
          }
        }, 150)
      })
    })
    
    scheduleSave()
    toast({ title: "Đã xóa liên kết công việc thành công", indicator: "green" })
  } catch (err) {
    console.error("Delete task link failed", err)
    toast({ title: "Xóa liên kết công việc thất bại", indicator: "red" })
  }
}

// Handle create task from node
const handleCreateTask = async (formData) => {
  try {
    // Format date for backend
    const formatDateForBackend = (isoString) => {
      if (!isoString) return null
      const date = new Date(isoString)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    // Prepare payload
    const payload = {
      project: formData.project?.value,
      task_name: formData.task_name,
      assign_to: formData.name_assign_to?.value,
      assigned_by: formData.assigned_by?.value || null,
      priority: formData.priority?.value || null,
      duration: formData.duration ? formatDateForBackend(formData.duration) : null,
      section: formData.section_title?.value === '_empty' ? null : (formData.section_title?.value || null),
      description: formData.description || '',
      collaborator: (formData.collaborator || []).map((collab) => ({ 
        officer: collab.id || collab.value 
      })),
      parent_task: formData.parent_task?.value || null
    }

    console.log('Creating task with payload:', payload)

    // Call API to create task
    const response = await call('nextgrp.api.task.task.create_task', {
      payload: payload
    })

    console.log('Task created - full response:', response)

    // Check response format - API returns { message: { result: {...} } }
    // frappe-ui call may unwrap the response, so check multiple formats
    // In Raven, they use: response.message.result.name
    const taskResult = response?.message?.result || response?.result || response
    console.log('Task result extracted:', taskResult)
    
    if (taskResult && taskResult.name) {
      const taskId = taskResult.name
      const projectId = formData.project?.value
      console.log('Task ID:', taskId, 'Project ID:', projectId)

      // Upload files if any
      if (formData.files && formData.files.length > 0) {
        for (const file of formData.files) {
          try {
            const formDataUpload = new FormData()
            formDataUpload.append('file', file)
            formDataUpload.append('doctype', 'Task')
            formDataUpload.append('docname', taskId)
            formDataUpload.append('fieldname', 'description')
            formDataUpload.append('folder', 'Home')
            formDataUpload.append('is_private', '1')

            await fetch('/api/method/upload_file', {
              method: 'POST',
              body: formDataUpload,
              headers: {
                'X-Frappe-CSRF-Token': window.csrf_token || document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
              }
            })
          } catch (fileError) {
            console.error('Failed to upload file:', fileError)
            // Continue even if file upload fails
          }
        }
      }

      // Link task to node
      const linkNode = resolveTaskLinkNode(taskLinkNode.value)
      if (linkNode) {
        const plainTitle = extractTitleFromLabel(linkNode.data?.label || '')
        const fallbackLink = getDefaultTaskLink(linkNode.id)
        const taskOpenLink = getTaskOpenUrl(taskId, projectId)

        linkNode.data = {
          ...linkNode.data,
          taskLink: {
            mode: 'existing',
            nodeId: linkNode.id,
            title: formData.task_name,
            taskId: taskId,
            assignee: formData.name_assign_to?.label || null,
            status: null,
            linkUrl: fallbackLink
          }
        }

        // Thêm badge "Liên kết công việc" vào node label (tương tự confirmTaskLink)
        // Tự động thêm badge khi tạo mới công việc từ node
        if (taskOpenLink && typeof linkNode.data?.label === 'string' && !linkNode.data.label.includes('node-task-badge')) {
          const badgeHtml = `<section class="node-task-link-section" data-node-section="task-link" style="margin-top:6px;"><div class="node-task-badge" style="display:flex;align-items:center;gap:6px;font-size:12px;color:#16a34a;"><span style="display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center;">📄</span><a href="${taskOpenLink}" target="_top" onclick="event.preventDefault(); window.parent && window.parent.location && window.parent.location.href ? window.parent.location.href=this.href : window.location.href=this.href;" style="color:#0ea5e9;text-decoration:none;">Liên kết công việc</a></div></section>`
          try {
            const parser = new DOMParser()
            const doc = parser.parseFromString(linkNode.data.label, 'text/html')
            const body = doc.body
            
            // Xóa tất cả paragraph rỗng (is-empty hoặc chỉ có br/whitespace) và paragraph chứa ⋮
            const allParagraphs = body.querySelectorAll('p')
            allParagraphs.forEach(p => {
              const text = p.textContent?.trim() || ''
              const hasOnlyBr = p.querySelectorAll('br').length === p.childNodes.length && p.childNodes.length > 0
              const isEmpty = p.classList.contains('is-empty') || (text === '' && hasOnlyBr)
              const hasMenuDots = text === '⋮' || text.includes('⋮')
              if (isEmpty || hasMenuDots) {
                p.remove()
              }
            })
            
            // Xóa tất cả button menu (image-menu-button)
            const menuButtons = body.querySelectorAll('.image-menu-button, button[aria-label="Image options"]')
            menuButtons.forEach(btn => btn.remove())
            
            // Tìm paragraph đầu tiên có nội dung (title) và thêm class để phân biệt
            const firstParagraph = body.querySelector('p')
            
            if (firstParagraph) {
              // Thêm class để phân biệt title
              firstParagraph.classList.add('node-title-section')
              firstParagraph.setAttribute('data-node-section', 'title')
              
              // Tạo badge element
              const badgeElement = parser.parseFromString(badgeHtml, 'text/html').body.firstChild
              
              // Tìm ảnh đầu tiên trong toàn bộ body (có thể là img hoặc trong wrapper)
              const firstImage = body.querySelector('img, .image-wrapper-node, .image-wrapper')
              
              if (firstImage) {
                // Có ảnh - kiểm tra xem ảnh/wrapper có nằm trong paragraph đầu tiên không
                const imageWrapper = firstImage.closest('.image-wrapper-node, .image-wrapper')
                const imageContainer = imageWrapper || firstImage
                const imageParent = imageContainer.parentElement
                
                // Thêm class và attribute để phân biệt phần ảnh
                let finalImageContainer = imageContainer
                if (imageContainer.classList.contains('image-wrapper-node') || imageContainer.classList.contains('image-wrapper')) {
                  // Đã có wrapper - thêm class vào wrapper
                  imageContainer.classList.add('node-image-section')
                  imageContainer.setAttribute('data-node-section', 'image')
                } else if (imageContainer.tagName === 'IMG') {
                  // Ảnh không có wrapper - wrap trong section
                  const imageSection = doc.createElement('section')
                  imageSection.classList.add('node-image-section')
                  imageSection.setAttribute('data-node-section', 'image')
                  imageContainer.parentElement.insertBefore(imageSection, imageContainer)
                  imageSection.appendChild(imageContainer)
                  finalImageContainer = imageSection
                } else {
                  // Element khác - thêm class trực tiếp
                  imageContainer.classList.add('node-image-section')
                  imageContainer.setAttribute('data-node-section', 'image')
                }
                
                // Cập nhật lại imageParent sau khi có thể đã wrap
                const updatedImageParent = finalImageContainer.parentElement
                
                if (updatedImageParent === firstParagraph) {
                  // Ảnh/wrapper nằm trong paragraph đầu tiên - tách ra và chèn badge
                  const imageClone = finalImageContainer.cloneNode(true)
                  finalImageContainer.remove()
                  // Chèn badge sau paragraph đầu tiên
                  body.insertBefore(badgeElement, firstParagraph.nextSibling)
                  // Chèn ảnh sau badge
                  body.insertBefore(imageClone, badgeElement.nextSibling)
                } else {
                  // Ảnh ở element khác - chèn badge trước container của ảnh
                  finalImageContainer.parentElement.insertBefore(badgeElement, finalImageContainer)
                }
              } else {
                // Không có ảnh - chèn badge ngay sau paragraph đầu tiên
                if (firstParagraph.nextSibling) {
                  body.insertBefore(badgeElement, firstParagraph.nextSibling)
                } else {
                  body.appendChild(badgeElement)
                }
              }
              
              // Thêm class cho các paragraph còn lại (mô tả) để phân biệt
              const remainingParagraphs = body.querySelectorAll('p:not(.node-title-section)')
              remainingParagraphs.forEach(p => {
                if (!p.classList.contains('node-description-section')) {
                  p.classList.add('node-description-section')
                  p.setAttribute('data-node-section', 'description')
                }
              })
              
              // Serialize lại HTML
              linkNode.data.label = body.innerHTML
            } else {
              // Không có paragraph - tạo paragraph mới cho title và chèn badge
              const titleParagraph = doc.createElement('p')
              titleParagraph.textContent = plainTitle || 'Nhánh mới'
              body.appendChild(titleParagraph)
              
              const badgeElement = parser.parseFromString(badgeHtml, 'text/html').body.firstChild
              body.appendChild(badgeElement)
              
              linkNode.data.label = body.innerHTML
            }
          } catch (err) {
            // Fallback: chèn vào cuối nếu parse lỗi
            console.error('Error parsing HTML for badge insertion:', err)
            linkNode.data.label = `${linkNode.data.label}${badgeHtml}`
          }
          
          // Clear node size cache
          if (d3Renderer?.nodeSizeCache) {
            d3Renderer.nodeSizeCache.delete(linkNode.id)
          }
          
          // Đồng bộ nội dung editor ngay lập tức
          const editorInstance = d3Renderer?.getEditorInstance?.(linkNode.id)
          if (editorInstance && typeof editorInstance.commands?.setContent === 'function') {
            editorInstance.commands.setContent(linkNode.data?.label || '', false)
          }
          
          // Cập nhật nodes array
          const idx = nodes.value.findIndex(n => n.id === linkNode.id)
          if (idx !== -1) {
            nodes.value[idx] = { ...linkNode }
            elements.value = [...nodes.value, ...edges.value]
          }
          
          await updateD3RendererWithDelay(0)
        }

        // Update mindmap - get vueAppEntry from d3Renderer
        await nextTick()
        
        // ⚠️ FIX: Đợi nhiều frame để đảm bảo DOM đã cập nhật hoàn toàn với badge mới
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Đợi thêm một chút để đảm bảo editor đã cập nhật content với badge
            setTimeout(() => {
              // Tìm foreignObject element của node
              const nodeGroup = document.querySelector(`[data-node-id="${linkNode.id}"]`)
              if (nodeGroup && d3Renderer) {
                const foElement = nodeGroup.querySelector('.node-text')
                if (foElement) {
                  // ⚠️ CRITICAL: Gọi trực tiếp handleEditorBlur để tính toán lại height
                  // handleEditorBlur sẽ đo lại height từ DOM và cập nhật node size
                  try {
                    d3Renderer.handleEditorBlur(linkNode.id, foElement, linkNode)
                  } catch (err) {
                    console.error('Error calling handleEditorBlur:', err)
                    // Fallback: gọi updateNodeHeight từ Vue component
                    const vueAppEntry = d3Renderer?.vueApps?.get(linkNode.id)
                    if (vueAppEntry?.instance && typeof vueAppEntry.instance.updateNodeHeight === 'function') {
                      vueAppEntry.instance.updateNodeHeight()
                    }
                  }
                }
              }
            }, 150) // Tăng delay để đảm bảo DOM đã cập nhật
          })
        })
        // Add comment link to task (giống như confirmTaskLink)
        if (fallbackLink && taskId) {
          const nodeTitle = plainTitle || linkNode.data?.label || ''
          const mindmapTitle = mindmap.data?.title || ''
          try {
            await call("drive.api.mindmap_comment.add_task_link_comment", {
              task_id: taskId,
              node_title: nodeTitle,
              mindmap_title: mindmapTitle,
              link_url: fallbackLink
            })
          } catch (err) {
            console.error('Error adding task link comment:', err)
            // Continue even if comment creation fails
          }
        }

        scheduleSave()
      }

      // Show success message with link
      const origin = window.location.origin
      const taskUrl = `${origin}/mtp/project/${projectId}?task_id=${taskId}`
      
      toast({ 
        title: `Công việc "${formData.task_name}" đã được tạo thành công`, 
        indicator: "green",
        action: {
          label: "Mở công việc",
          onClick: () => {
            window.open(taskUrl, '_blank')
          }
        }
      })

      closeTaskLinkModal()
    } else {
      // Log for debugging
      console.error('Task creation failed - invalid response:', response)
      console.error('Response keys:', Object.keys(response || {}))
      console.error('Response.message:', response?.message)
      console.error('Response.message.result:', response?.message?.result)
      const errorMsg = response?.message || response?.errorMessage || 'Không thể tạo công việc'
      throw new Error(errorMsg)
    }
  } catch (error) {
    // Extract error message from various possible formats
    let errorMessage = 'Có lỗi xảy ra khi tạo công việc'
    
    // Xử lý lỗi CharacterLengthExceededError và dịch sang tiếng Việt
    const errorStr = typeof error === 'string' ? error : (error?.message || JSON.stringify(error))
    if (errorStr.includes('CharacterLengthExceededError') || errorStr.includes('character length')) {
      errorMessage = 'Tên công việc không được vượt quá 500 ký tự.'
    } else if (error?.message?.result) {
      errorMessage = error.message.result
    } else if (error?.message) {
      errorMessage = typeof error.message === 'string' ? error.message : JSON.stringify(error.message)
    } else if (typeof error === 'string') {
      errorMessage = error
    }
    
    toast(errorMessage)
  }
}

// ⚠️ NEW: Theo dõi các phím chữ vừa được nhấn để tránh xóa nhầm
let recentAlphaKeys = []
const ALPHA_KEY_TIMEOUT = 500 // 500ms

const trackAlphaKey = (key) => {
  const isAlphaKey = /^[a-zA-Z]$/.test(key)
  if (isAlphaKey) {
    recentAlphaKeys.push({ key, time: Date.now() })
    // Xóa các key cũ hơn 500ms
    setTimeout(() => {
      recentAlphaKeys = recentAlphaKeys.filter(k => Date.now() - k.time < ALPHA_KEY_TIMEOUT)
    }, ALPHA_KEY_TIMEOUT)
  }
}

const hasRecentAlphaKeys = () => {
  const now = Date.now()
  recentAlphaKeys = recentAlphaKeys.filter(k => now - k.time < ALPHA_KEY_TIMEOUT)
  return recentAlphaKeys.length > 0
}

// ⚠️ NEW: Debounce cho phím Delete/Backspace để tránh xóa nhiều lần khi giữ phím
let lastDeleteTime = 0
const DELETE_DEBOUNCE = 300 // 300ms - chỉ cho phép xóa 1 lần mỗi 300ms

const canDeleteNode = () => {
  const now = Date.now()
  if (now - lastDeleteTime < DELETE_DEBOUNCE) {
    return false // Quá gần lần xóa trước - bỏ qua
  }
  // ⚠️ FIX: KHÔNG set lastDeleteTime ở đây
  // Sẽ set SAU KHI thực sự xóa node để tránh block lần sau nếu lần này bị chặn
  return true
}

const markNodeDeleted = () => {
  lastDeleteTime = Date.now()
}

// ⚠️ NEW: Theo dõi trạng thái composition (IME/Unikey)
let isComposing = false

const handleCompositionStart = () => {
  isComposing = true
  console.log('[DEBUG] Composition started (Unikey bắt đầu)')
}

const handleCompositionEnd = () => {
  isComposing = false
  console.log('[DEBUG] Composition ended (Unikey kết thúc)')
  // Clear alpha keys khi kết thúc composition
  recentAlphaKeys = []
}

// Keyboard shortcuts handler
const handleKeyDown = (event) => {
  const target = event.target
  const tagName = target?.tagName?.toLowerCase()
  const isInEditor = target?.closest('.mindmap-node-editor') ||
    target?.closest('.mindmap-editor-content') ||
    target?.closest('.mindmap-editor-prose') ||
    target?.classList?.contains('ProseMirror') ||
    target?.closest('[contenteditable="true"]') ||
    target?.closest('.comment-editor-root')

  // Nếu đang trong editor, cho phép editor xử lý keyboard shortcuts (Ctrl+B, Ctrl+I, etc.)
  if (isInEditor || editingNode.value) {
    // ⚠️ CRITICAL: Theo dõi các phím chữ được nhấn trong editor
    trackAlphaKey(event.key)
    
    // Cho phép editor xử lý các phím tắt của riêng nó (Ctrl+B, Ctrl+I, etc.)
    // Không chặn các phím này
    if (event.ctrlKey || event.metaKey) {
      // Cho phép editor xử lý Ctrl/Cmd + key combinations
      return
    }
    // Chặn các phím tắt khác khi đang trong editor
    return
  } else {
    // ⚠️ CRITICAL: Khi blur khỏi editor, clear recentAlphaKeys sau 100ms
    // Điều này đảm bảo sau khi blur, có thể bấm Delete/Backspace bình thường
    if (recentAlphaKeys.length > 0) {
      setTimeout(() => {
        console.log('[DEBUG] Clear recentAlphaKeys sau khi blur khỏi editor')
        recentAlphaKeys = []
      }, 100)
    }
  }

  // Nếu đang trong input/textarea khác, không xử lý
  if (tagName === 'textarea' || tagName === 'input' || target?.isContentEditable) {
    return
  }

  if (!selectedNode.value) return

  const key = event.key
  
  // ⚠️ CHỈ theo dõi phím chữ KHI ĐANG TRONG EDITOR
  // Ngoài editor thì không cần track (vì có thể là phím tắt hợp lệ)
  // trackAlphaKey(key) - BỎ QUA
  
  // ⚠️ CRITICAL: BẢO VỆ TUYỆT ĐỐI - Chặn TẤT CẢ các phím KHÔNG PHẢI Delete/Backspace
  // Ngay cả khi event.key = 'Backspace', nếu event.code không phải 'Delete' hoặc 'Backspace'
  // thì KHÔNG được phép xóa node
  const isRealDeleteKey = event.code === 'Delete' || event.code === 'Backspace'
  const isDeleteKeyPressed = key === 'Delete' || key === 'Backspace'
  
  // ⚠️ CRITICAL: Kiểm tra event.code rỗng - dấu hiệu của Unikey/IME
  // Khi Unikey hoạt động, nó tạo ra events với code: ''
  const isUnikeyEvent = event.code === '' || event.code === null || event.code === undefined
  
  // ⚠️ CRITICAL: Nếu phát hiện Unikey event (code rỗng), set isComposing
  if (isUnikeyEvent) {
    isComposing = true
    console.log('[DEBUG] Phát hiện Unikey event (code rỗng), set isComposing = true')
    // Clear sau 1 giây
    setTimeout(() => {
      if (isComposing) {
        console.log('[DEBUG] Auto clear isComposing sau 1s')
        isComposing = false
      }
    }, 1000)
  }
  
  // ⚠️ DEBUG: Log phím được nhấn
  console.log('[DEBUG handleKeyDown]', {
    key: event.key,
    code: event.code,
    isRealDeleteKey,
    isDeleteKeyPressed,
    isUnikeyEvent,
    isComposing,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    target: target?.tagName,
    isInEditor,
    editingNode: editingNode.value
  })
  
  // ⚠️ CRITICAL: Nếu event.key là Delete/Backspace NHƯNG event.code KHÔNG PHẢI
  // → Đây là phím giả mạo (phím A/S bị map thành Backspace) → BỎ QUA
  if (isDeleteKeyPressed && !isRealDeleteKey) {
    console.log('[DEBUG] ⛔ CHẶN phím giả mạo! key:', key, 'code:', event.code)
    return
  }
  
  // ⚠️ CRITICAL: Nếu vừa có Unikey event (code rỗng) trong 1s → Chắc chắn đang gõ tiếng Việt
  if (isComposing) {
    console.log('[DEBUG] ⛔ CHẶN tất cả phím vì Unikey đang hoạt động')
    // CHẶN tất cả keyboard shortcuts khi Unikey hoạt động
    return
  }

  

  if (key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()

    // Nếu node đang bị thu gọn, khi nhấn Tab để tạo node con
    // thì đồng thời phải EXPAND nhánh để hiển thị lại tất cả node con (bao gồm node mới).
    if (d3Renderer && d3Renderer.collapsedNodes && d3Renderer.collapsedNodes.has(selectedNode.value.id)) {
      const parentId = selectedNode.value.id
      d3Renderer.collapsedNodes.delete(parentId)
      
      

      if (d3Renderer.callbacks && d3Renderer.callbacks.onNodeCollapse) {
        d3Renderer.callbacks.onNodeCollapse(parentId, false)
      }

      // Render lại ngay để layout không còn thu gọn subtree
      d3Renderer.render()
    }

    addChildToNode(selectedNode.value.id)
  }
  else if (key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    // Ctrl+Enter (hoặc Cmd+Enter trên Mac) để toggle done
    event.preventDefault()
    event.stopPropagation()

    if (!isInEditor && selectedNode.value && selectedNode.value.id !== 'root') {
      handleToolbarDone(selectedNode.value)
    }
  }
  else if (key === 'Enter' && event.shiftKey) {
    // Shift+Enter để focus vào mô tả (blockquote)
    event.preventDefault()
    event.stopPropagation()

    if (selectedNode.value && selectedNode.value.id !== 'root') {
      // Nếu đang trong editor, cho phép editor xử lý Shift+Enter
      if (isInEditor || editingNode.value) {
        return
      }

      // Nếu không đang trong editor, focus vào editor và blockquote
      const editorInstance = d3Renderer?.getEditorInstance?.(selectedNode.value.id)
      if (editorInstance) {
        // Focus vào editor trước
        editorInstance.commands.focus()

        // Đợi editor focus xong, sau đó focus vào blockquote
        setTimeout(() => {
          const { state } = editorInstance.view
          const { doc } = state

          // Tìm blockquote đầu tiên
          let blockquoteOffset = null
          doc.forEach((node, offset) => {
            if (node.type.name === 'blockquote' && blockquoteOffset === null) {
              blockquoteOffset = offset
            }
          })

          if (blockquoteOffset !== null) {
            // Đã có blockquote: focus vào cuối blockquote
            try {
              // Tìm blockquote node
              const blockquoteNode = state.doc.nodeAt(blockquoteOffset)
              if (blockquoteNode) {
                // Tìm vị trí cuối cùng của text trong blockquote
                // Tính phạm vi của blockquote trong document
                const blockquoteStart = blockquoteOffset + 1
                const blockquoteEnd = blockquoteOffset + blockquoteNode.nodeSize - 1

                // Duyệt qua toàn bộ document để tìm text nodes trong blockquote
                let lastTextPos = null

                doc.descendants((node, pos) => {
                  // Kiểm tra xem node có nằm trong blockquote không
                  // pos là vị trí bắt đầu của node, pos + node.nodeSize là vị trí cuối
                  if (pos >= blockquoteStart && pos < blockquoteEnd && node.isText) {
                    // Tính vị trí sau text node (cuối text content)
                    // Đối với text node, sử dụng text.length để đảm bảo chính xác
                    const textEndPos = pos + node.text.length
                    // Đảm bảo vị trí không vượt quá blockquote
                    if (textEndPos <= blockquoteEnd + 1) {
                      lastTextPos = textEndPos
                    }
                  }
                })

                if (lastTextPos !== null) {
                  // Có text: focus vào cuối text
                  // Sử dụng resolve để đảm bảo vị trí hợp lệ
                  try {
                    const resolvedPos = state.doc.resolve(lastTextPos)
                    editorInstance.chain()
                      .setTextSelection(resolvedPos.pos)
                      .focus()
                      .run()
                  } catch (e) {
                    // Fallback: sử dụng vị trí trực tiếp
                    editorInstance.chain()
                      .setTextSelection(lastTextPos)
                      .focus()
                      .run()
                  }
                } else {
                  // Không có text: tìm paragraph cuối cùng trong blockquote và focus vào trong đó
                  let lastParagraphPos = null
                  blockquoteNode.forEach((child, childOffset) => {
                    if (child.type.name === 'paragraph') {
                      // Vị trí bắt đầu của paragraph trong document
                      const paragraphStart = blockquoteOffset + 1 + childOffset + 1
                      lastParagraphPos = paragraphStart
                    }
                  })

                  if (lastParagraphPos !== null) {
                    // Focus vào đầu paragraph cuối cùng
                    editorInstance.chain()
                      .setTextSelection(lastParagraphPos)
                      .focus()
                      .run()
                  } else {
                    // Fallback: focus vào cuối blockquote
                    const blockquoteEndPos = blockquoteOffset + blockquoteNode.nodeSize - 1
                    try {
                      const resolvedPos = state.doc.resolve(blockquoteEndPos - 1)
                      editorInstance.chain()
                        .setTextSelection(resolvedPos.pos)
                        .focus()
                        .run()
                    } catch (e) {
                      editorInstance.chain()
                        .setTextSelection(blockquoteEndPos - 1)
                        .focus()
                        .run()
                    }
                  }
                }
              } else {
                // Fallback: focus vào cuối document
                editorInstance.commands.focus('end')
              }
            } catch (e) {
              
              // Fallback: focus vào cuối document
              editorInstance.commands.focus('end')
            }
          } else {
            // Chưa có blockquote: tạo blockquote mới
            // Tìm vị trí chèn: sau tất cả paragraphs và images
            let insertPosition = null

            // Tìm node cuối cùng không phải blockquote (paragraph hoặc image)
            doc.forEach((node, offset) => {
              if (node.type.name !== 'blockquote') {
                // Tính vị trí sau node này (offset + nodeSize)
                const nodeEnd = offset + node.nodeSize
                if (insertPosition === null || nodeEnd > insertPosition) {
                  insertPosition = nodeEnd
                }
              }
            })

            // Nếu không tìm thấy, dùng cuối document
            if (insertPosition === null) {
              insertPosition = doc.content.size
            }

            

            // Chèn blockquote tại vị trí đã tính
            editorInstance.chain()
              .setTextSelection(insertPosition)
              .focus()
              .insertContent('<blockquote><p></p></blockquote>')
              .run()

            setTimeout(() => {
              if (editorInstance) {
                const { state } = editorInstance.view
                const { doc: newDoc } = state

                // Tìm blockquote vừa tạo
                let newBlockquoteOffset = null
                newDoc.forEach((node, offset) => {
                  if (node.type.name === 'blockquote' && newBlockquoteOffset === null) {
                    newBlockquoteOffset = offset
                  }
                })

                if (newBlockquoteOffset !== null) {
                  const newBlockquoteNode = state.doc.nodeAt(newBlockquoteOffset)
                  if (newBlockquoteNode) {
                    // Focus vào đầu paragraph trong blockquote
                    const paragraphStartPos = newBlockquoteOffset + 1 + 1 // blockquote + paragraph opening
                    editorInstance.chain()
                      .setTextSelection(paragraphStartPos)
                      .focus()
                      .run()
                  } else {
                    editorInstance.commands.focus('end')
                  }
                } else {
                  editorInstance.commands.focus('end')
                }
              }
            }, 50)
          }
        }, 50)
      }
    }
  }
  else if (key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    // ⚠️ FIX: Bỏ chức năng nhấn Enter tạo node con cho node root
    if (selectedNode.value.id !== 'root') {
      addSiblingToNode(selectedNode.value.id)
    }
    // Không làm gì nếu node là root
  }
  // ⚠️ CRITICAL: CHỈ kiểm tra event.code, BỎ QUA event.key hoàn toàn
  // Vì event.key có thể bị map sai (ví dụ: phím A/S → Backspace)
  else if (event.code === 'Delete' || event.code === 'Backspace') {
    console.log('[DEBUG Delete/Backspace by CODE] Phím được nhấn:', {
      key,
      code: event.code,
      isInEditor,
      editingNode: editingNode.value,
      isComposing,
      hasRecentAlphaKeys: hasRecentAlphaKeys(),
      recentAlphaKeys: recentAlphaKeys.map(k => k.key),
      canDelete: canDeleteNode(),
      modifiers: {
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        meta: event.metaKey
      }
    })
    
    // ⚠️ CRITICAL: KHÔNG xóa khi đang composition (Unikey/IME đang hoạt động)
    if (isComposing) {
      console.log('[DEBUG] ⛔ Bỏ qua Delete/Backspace vì đang composition (Unikey)')
      return
    }
    
    // ⚠️ CRITICAL: Debounce - chỉ cho phép xóa 1 lần mỗi 300ms
    // Tránh xóa nhiều lần khi giữ phím
    if (!canDeleteNode()) {
      console.log('[DEBUG] ⛔ Bỏ qua Delete/Backspace vì quá gần lần xóa trước (debounce)')
      return
    }
    
    // ⚠️ CRITICAL: KHÔNG xóa khi vừa có phím chữ được nhấn (trong 500ms)
    // Tránh trường hợp A+S → thả S → trigger Backspace nhầm
    if (hasRecentAlphaKeys()) {
      console.log('[DEBUG] ⛔ Bỏ qua Delete/Backspace vì vừa có phím chữ:', recentAlphaKeys.map(k => k.key).join('+'))
      return
    }
    
    // ⚠️ CRITICAL: KHÔNG xóa khi đang trong editor hoặc đang edit node
    if (isInEditor || editingNode.value) {
      console.log('[DEBUG] Bỏ qua Delete/Backspace vì đang trong editor')
      return
    }
    
    // ⚠️ CRITICAL: Chỉ xóa node khi KHÔNG có BẤT KỲ modifier key nào
    // Tránh xóa nhầm khi bấm tổ hợp phím như Shift+Delete, etc.
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      console.log('[DEBUG] Bỏ qua Delete/Backspace vì có modifier key:', {
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        meta: event.metaKey
      })
      return
    }
    
    console.log('[DEBUG] ✅ AN TOÀN - Xóa node với key:', key, 'code:', event.code)
    event.preventDefault()
    event.stopPropagation()

    if (selectedNode.value.id === 'root') {
      
      return false
    }

    deleteSelectedNode()
    
    // ⚠️ CRITICAL: Chỉ mark deleted SAU KHI thực sự xóa
    markNodeDeleted()
  }
  else if ((key === 'v' || key === 'V') && (event.ctrlKey || event.metaKey)) {
    // ⚠️ NEW: Ctrl+V để paste
    event.preventDefault()
    event.stopPropagation()

    if (isInEditor) {
      // Nếu đang trong editor, cho phép paste text bình thường (TipTap sẽ xử lý)
      return
    }

    if (selectedNode.value) {
      if (hasClipboard.value) {
        // Paste từ clipboard của mindmap
        pasteToNode(selectedNode.value.id)
      } else {
        // ⚠️ NEW: Paste từ clipboard hệ thống (nội dung từ bên ngoài)
        pasteFromSystemClipboard(selectedNode.value.id)
      }
    }
  }
  else if ((key === 'c' || key === 'C') && (event.ctrlKey || event.metaKey)) {
    // ⚠️ NEW: Ctrl+C để copy node (nếu không đang trong editor)
    // ⚠️ CHANGED: Cho phép copy root node để có thể copy toàn bộ mindmap
    if (!isInEditor && selectedNode.value) {
      event.preventDefault()
      event.stopPropagation()
      copyNode(selectedNode.value.id)
    }
  }
  else if ((key === 'x' || key === 'X') && (event.ctrlKey || event.metaKey)) {
    // ⚠️ NEW: Ctrl+X để cut node (nếu không đang trong editor)
    if (!isInEditor && selectedNode.value && selectedNode.value.id !== 'root') {
      event.preventDefault()
      event.stopPropagation()
      cutNode(selectedNode.value.id)
    }
  }
  else if ((key === 'b' || key === 'B') && (event.ctrlKey || event.metaKey)) {
    // Ctrl+B để toggle bold (giống như toolbar-top)
    if (!isInEditor && toolbarRef.value && selectedNode.value && selectedNode.value.id !== 'root') {
      event.preventDefault()
      event.stopPropagation()
      toolbarRef.value.toggleBold()
    }
  }
  else if ((key === 'i' || key === 'I') && (event.ctrlKey || event.metaKey)) {
    // Ctrl+I để toggle italic (giống như toolbar-top)
    if (!isInEditor && toolbarRef.value && selectedNode.value && selectedNode.value.id !== 'root') {
      event.preventDefault()
      event.stopPropagation()
      toolbarRef.value.toggleItalic()
    }
  }
  else if ((key === 'u' || key === 'U') && (event.ctrlKey || event.metaKey)) {
    // Ctrl+U để toggle underline (giống như toolbar-top)
    if (!isInEditor && toolbarRef.value && selectedNode.value && selectedNode.value.id !== 'root') {
      event.preventDefault()
      event.stopPropagation()
      toolbarRef.value.toggleUnderline()
    }
  }
}

// Computed
const nodes = computed(() => elements.value.filter(el => el.id && !el.source && !el.target))
const edges = computed(() => elements.value.filter(el => el.source && el.target))

// Watch nodes/edges changes to update D3 renderer
// KHÔNG update khi đang edit để tránh node nháy và text nhảy dòng
watch([nodes, edges], () => {
  if (d3Renderer && !editingNode.value) {
    updateD3Renderer()
  }
}, { deep: true })

// Save resource
const saveLayoutResource = createResource({
  url: "drive.api.mindmap.save_mindmap_layout",
  method: "POST",
  onSuccess(response) {
    isSaving.value = false
    lastSaved.value = formatTime(new Date())
    
  },
  onError(error) {
    isSaving.value = false
    
  }
})

// Schedule save
const scheduleSave = () => {
  if (!mindmap.data) return

  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }

  saveTimeout = setTimeout(() => {
    isSaving.value = true

    // Get positions from D3 renderer if available
    // ⚠️ CRITICAL: Lưu cả order từ nodeCreationOrder để giữ thứ tự các node cùng cấp
    const nodesWithPositions = nodes.value.map(({ count, ...node }) => {
      const nodeWithPos = { ...node }
      if (d3Renderer && d3Renderer.positions) {
        const pos = d3Renderer.positions.get(node.id)
        if (pos) {
          nodeWithPos.position = { ...pos }
        }
      }
      // ⚠️ CRITICAL: Lưu order từ nodeCreationOrder vào node data
      if (nodeCreationOrder.value.has(node.id)) {
        const order = nodeCreationOrder.value.get(node.id)
        if (!nodeWithPos.data) {
          nodeWithPos.data = {}
        }
        nodeWithPos.data.order = order
      }
      return nodeWithPos
    })

    saveLayoutResource.submit({
      entity_name: props.entityName,
      nodes: JSON.stringify(nodesWithPositions),
      edges: JSON.stringify(edges.value),
      layout: "horizontal"
    })
  }, SAVE_DELAY)
}

onMounted(() => {
  if (!store.getters.isLoggedIn) {
    sessionStorage.setItem("sharedFileInfo", JSON.stringify({
      team: props.team,
      entityName: props.entityName,
      entityType: "mindmap"
    }))
  }

  window.addEventListener('keydown', handleKeyDown, true)
  
  // ⚠️ NEW: Handle composition events (Unikey/IME)
  window.addEventListener('compositionstart', handleCompositionStart, true)
  window.addEventListener('compositionend', handleCompositionEnd, true)

  // ⚠️ NEW: Handle copy event để lưu text vào clipboard
  window.addEventListener('copy', handleCopy, true)

  // Handle window resize
  window.addEventListener('resize', () => {
    if (d3Renderer) {
      d3Renderer.options.width = window.innerWidth
      d3Renderer.options.height = window.innerHeight - 84
      if (d3Renderer.svg) {
        d3Renderer.svg.attr('width', window.innerWidth)
        d3Renderer.svg.attr('height', window.innerHeight - 84)
      }
      updateD3Renderer()
    }
  })

  

  // ⚠️ NEW: Xử lý hash khi component mount để scroll đến node
  scrollToNodeFromHash()

  // ⚠️ NEW: Lắng nghe sự kiện hashchange để scroll đến node khi hash thay đổi
  window.addEventListener('hashchange', scrollToNodeFromHash)

  // ⚠️ NEW: Đăng ký socket listeners với safety check
  if (socket) {
    console.log('🔌 Registering socket listeners, socket ID:', socket.id, 'connected:', socket.connected)
    socket.on('drive_mindmap:new_comment', handleRealtimeNewComment)
    socket.on('drive_mindmap:comment_deleted', handleRealtimeDeleteOneComment)
    socket.on('drive_mindmap:node_resolved', handleRealtimeResolvedComment)
    socket.on('drive_mindmap:task_status_updated', handleRealtimeTaskStatusUpdate)
    
    // ⚠️ NEW: Listen for socket connect để đảm bảo listeners được đăng ký lại nếu reconnect
    socket.on('connect', () => {
      console.log('✅ Socket reconnected, re-registering listeners')
      socket.on('drive_mindmap:task_status_updated', handleRealtimeTaskStatusUpdate)
    })
    
    console.log('✅ Socket listeners registered for task status updates')
  } else {
    console.warn('⚠️ Socket is not available, realtime updates will not work')
  }
  window.addEventListener("click", handleClickOutside, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown, true)
  window.removeEventListener('compositionstart', handleCompositionStart, true)
  window.removeEventListener('compositionend', handleCompositionEnd, true)
  window.removeEventListener('copy', handleCopy, true)
  window.removeEventListener('hashchange', scrollToNodeFromHash)
  window.removeEventListener('resize', () => { })

  if (d3Renderer) {
    d3Renderer.destroy()
    d3Renderer = null
  }

  if (saveTimeout) {
    clearTimeout(saveTimeout)

    if (mindmap.data && elements.value.length > 0) {
      saveLayoutResource.submit({
        entity_name: props.entityName,
        nodes: JSON.stringify(nodes.value),
        edges: JSON.stringify(edges.value),
        layout: "horizontal"
      })
    }
  }
  // ⚠️ NEW: Cleanup socket listeners với safety check
  if (socket) {
    socket.off('drive_mindmap:new_comment', handleRealtimeNewComment)
    socket.off('drive_mindmap:comment_deleted', handleRealtimeDeleteOneComment)
    socket.off('drive_mindmap:node_resolved', handleRealtimeResolvedComment)
    socket.off('drive_mindmap:task_status_updated', handleRealtimeTaskStatusUpdate)
  }
  window.removeEventListener("click", handleClickOutside, true)
})


// ⚠️ NEW: Handle copy event để lưu text vào clipboard
function handleCopy(event) {
  const target = event.target
  const isInEditor = target?.closest('.mindmap-node-editor') ||
    target?.closest('.mindmap-editor-content') ||
    target?.closest('.mindmap-editor-prose') ||
    target?.classList?.contains('ProseMirror') ||
    target?.closest('[contenteditable="true"]')

  if (isInEditor) {
    // Lấy text đã được select
    const selection = window.getSelection()
    const selectedText = selection?.toString() || ''

    if (selectedText && selectedText.trim() !== '') {
      // Lưu text vào clipboard
      copyText(selectedText)
    }
  }
}

// ⚠️ NEW: Helper function để lấy kích thước node
function getNodeSize(nodeId, node) {
  let actualWidth = null
  let actualHeight = null

  if (d3Renderer) {
    // Ưu tiên dùng fixedWidth/fixedHeight nếu có (đã được set khi blur)
    if (node.data?.fixedWidth && node.data?.fixedHeight) {
      actualWidth = node.data.fixedWidth
      actualHeight = node.data.fixedHeight
    } else {
      // Lấy từ cache nếu có
      const cachedSize = d3Renderer.nodeSizeCache?.get(nodeId)
      if (cachedSize) {
        actualWidth = cachedSize.width
        actualHeight = cachedSize.height
      } else {
        // Lấy từ DOM nếu có
        const nodeGroup = d3Renderer.g?.select(`[data-node-id="${nodeId}"]`)
        if (nodeGroup && !nodeGroup.empty()) {
          const rect = nodeGroup.select('.node-rect')
          const rectWidth = parseFloat(rect.attr('width'))
          const rectHeight = parseFloat(rect.attr('height'))
          if (rectWidth && rectHeight) {
            actualWidth = rectWidth
            actualHeight = rectHeight
          }
        }
      }
    }
  }

  return { width: actualWidth, height: actualHeight }
}

// ⚠️ NEW: Copy node function (bao gồm toàn bộ subtree)
function copyNode(nodeId) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return
  // ⚠️ CHANGED: Cho phép copy root node để có thể copy toàn bộ mindmap

  // Thu thập tất cả node IDs trong subtree (bao gồm node gốc)
  const subtreeNodeIds = new Set([nodeId])
  const collectDescendants = (id) => {
    const childEdges = edges.value.filter(e => e.source === id)
    childEdges.forEach(edge => {
      const childId = edge.target
      subtreeNodeIds.add(childId)
      collectDescendants(childId)
    })
  }
  collectDescendants(nodeId)

  // Thu thập tất cả nodes và edges trong subtree
  const subtreeNodes = nodes.value.filter(n => subtreeNodeIds.has(n.id))
  const subtreeEdges = edges.value.filter(e =>
    subtreeNodeIds.has(e.source) && subtreeNodeIds.has(e.target)
  )

  // Lưu thông tin kích thước cho từng node
  const nodeSizes = {}
  subtreeNodes.forEach(n => {
    const size = getNodeSize(n.id, n)
    nodeSizes[n.id] = size
  })

  clipboard.value = {
    type: 'subtree', // ⚠️ NEW: Đánh dấu là subtree
    operation: 'copy', // ⚠️ NEW: Đánh dấu là copy
    rootNodeId: nodeId, // ⚠️ NEW: Lưu nodeId gốc
    nodes: subtreeNodes.map(n => ({
      id: n.id,
      data: {
        label: n.data?.label || '',
        fixedWidth: n.data?.fixedWidth,
        fixedHeight: n.data?.fixedHeight,
        width: nodeSizes[n.id]?.width,
        height: nodeSizes[n.id]?.height,
        completed: n.data?.completed || false, // ⚠️ CRITICAL: Copy trạng thái completed
      }
    })),
    edges: subtreeEdges.map(e => ({
      source: e.source,
      target: e.target
    }))
  }

  
}

// ⚠️ NEW: Cut node function (bao gồm toàn bộ subtree)
function cutNode(nodeId) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node || nodeId === 'root') return

  // Thu thập tất cả node IDs trong subtree (bao gồm node gốc)
  const subtreeNodeIds = new Set([nodeId])
  const collectDescendants = (id) => {
    const childEdges = edges.value.filter(e => e.source === id)
    childEdges.forEach(edge => {
      const childId = edge.target
      subtreeNodeIds.add(childId)
      collectDescendants(childId)
    })
  }
  collectDescendants(nodeId)

  // Thu thập tất cả nodes và edges trong subtree
  const subtreeNodes = nodes.value.filter(n => subtreeNodeIds.has(n.id))
  const subtreeEdges = edges.value.filter(e =>
    subtreeNodeIds.has(e.source) && subtreeNodeIds.has(e.target)
  )

  // Lưu thông tin kích thước cho từng node
  const nodeSizes = {}
  subtreeNodes.forEach(n => {
    const size = getNodeSize(n.id, n)
    nodeSizes[n.id] = size
  })

  clipboard.value = {
    type: 'subtree', // ⚠️ NEW: Đánh dấu là subtree
    operation: 'cut', // ⚠️ NEW: Đánh dấu là cut
    rootNodeId: nodeId, // ⚠️ NEW: Lưu nodeId gốc (đã bị xóa)
    nodes: subtreeNodes.map(n => ({
      id: n.id,
      data: {
        label: n.data?.label || '',
        fixedWidth: n.data?.fixedWidth,
        fixedHeight: n.data?.fixedHeight,
        width: nodeSizes[n.id]?.width,
        height: nodeSizes[n.id]?.height,
        completed: n.data?.completed || false, // ⚠️ CRITICAL: Copy trạng thái completed
      }
    })),
    edges: subtreeEdges.map(e => ({
      source: e.source,
      target: e.target
    }))
  }

  

  // ⚠️ NEW: Xóa node ngay lập tức sau khi lưu vào clipboard
  performDelete(nodeId)

  
}

// ⚠️ NEW: Copy link to node function
function copyNodeLink(nodeId) {
  if (!nodeId || nodeId === 'root') return

  // Tạo link với hash (#nodeId)
  const currentUrl = window.location.href.split('#')[0] // Lấy URL hiện tại không có hash
  const link = `${currentUrl}#node-${nodeId}`

  // Copy vào clipboard
  navigator.clipboard.writeText(link).then(() => {
    

    // Hiển thị thông báo (optional - có thể thêm toast notification)
    // Có thể dùng một toast library hoặc tạo notification đơn giản
  }).catch(err => {
    

    // Fallback: dùng cách cũ
    const textArea = document.createElement('textarea')
    textArea.value = link
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    try {
      document.execCommand('copy')
      
    } catch (err) {
      
    }
    document.body.removeChild(textArea)
  })
}

// ⚠️ NEW: Scroll to node from hash
function scrollToNodeFromHash() {
  const hash = window.location.hash
  if (!hash || !hash.startsWith('#node-')) return

  const nodeId = hash.replace('#node-', '')
  if (!nodeId) return

  // Đợi renderer sẵn sàng và có positions
  const checkAndScroll = () => {
    if (d3Renderer && d3Renderer.positions && d3Renderer.positions.size > 0) {
      // Kiểm tra node có tồn tại không
      const node = nodes.value.find(n => n.id === nodeId)
      if (node) {
        d3Renderer.scrollToNode(nodeId)
        
      } else {
        
      }
    } else {
      // Retry sau 100ms nếu renderer chưa sẵn sàng
      setTimeout(checkAndScroll, 100)
    }
  }

  checkAndScroll()
}

// ⚠️ NEW: Copy text function (được gọi khi copy text trong editor)
function copyText(text) {
  if (!text || text.trim() === '') return

  clipboard.value = {
    type: 'text',
    data: text
  }

  
}

// ⚠️ NEW: Paste function
function pasteToNode(targetNodeId) {
  if (!hasClipboard.value || !targetNodeId) return

  const targetNode = nodes.value.find(n => n.id === targetNodeId)
  if (!targetNode) return

  // Kiểm tra xem có đang edit node không
  const isEditing = editingNode.value === targetNodeId
  const editorInstance = d3Renderer?.getEditorInstance?.(targetNodeId)

  if (isEditing && editorInstance && clipboard.value.type === 'text') {
    // Trường hợp 3: Paste text vào editor đang chỉnh sửa
    // TipTap sẽ tự xử lý paste text, không cần làm gì thêm
    return
  }

  // ⚠️ NEW: Paste subtree (bao gồm node cha và tất cả node con)
  if (clipboard.value.type === 'subtree' && clipboard.value.nodes && clipboard.value.edges) {
    const rootNodeId = clipboard.value.rootNodeId

    // ⚠️ NEW: Kiểm tra nếu là cut operation (node đã bị xóa khi cut, nên không cần kiểm tra phức tạp)
    // Chỉ kiểm tra cơ bản để tránh lỗi
    if (clipboard.value.operation === 'cut' && targetNodeId === rootNodeId) {
      
      return
    }

    // Tạo mapping từ nodeId cũ sang nodeId mới
    const nodeIdMap = new Map()
    clipboard.value.nodes.forEach((node, index) => {
      const newId = index === 0 ? `node-${nodeCounter++}` : `node-${nodeCounter++}`
      nodeIdMap.set(node.id, newId)
    })

    // Tạo nodes mới với nodeId mới
    const newNodes = clipboard.value.nodes.map(node => {
      const newNodeId = nodeIdMap.get(node.id)

      // Xác định parentId dựa trên edges
      let parentId = null
      if (node.id === rootNodeId) {
        // Root node của subtree sẽ có parent là targetNode
        parentId = targetNodeId
      } else {
        // Tìm parent của node này trong edges cũ
        const parentEdge = clipboard.value.edges.find(e => e.target === node.id)
        if (parentEdge) {
          const newParentId = nodeIdMap.get(parentEdge.source)
          parentId = newParentId
        }
      }

      return {
        id: newNodeId,
        data: {
          label: node.data?.label || '',
          parentId: parentId,
          // ⚠️ CRITICAL: Copy trạng thái completed từ node gốc
          completed: node.data?.completed || false,
          // ⚠️ FIX: Set fixedWidth/fixedHeight nếu có để node paste có kích thước chính xác
          ...(node.data?.fixedWidth && node.data?.fixedHeight ? {
            fixedWidth: node.data.fixedWidth,
            fixedHeight: node.data.fixedHeight
          } : node.data?.width && node.data?.height ? {
            fixedWidth: node.data.width,
            fixedHeight: node.data.height
          } : {})
        }
      }
    })

    // Tạo edges mới với nodeId mới (chỉ tạo lại edges trong subtree, không bao gồm edge từ parent đến root)
    const newEdges = clipboard.value.edges.map(edge => {
      const newSourceId = nodeIdMap.get(edge.source)
      const newTargetId = nodeIdMap.get(edge.target)

      return {
        id: `edge-${newSourceId}-${newTargetId}`,
        source: newSourceId,
        target: newTargetId
      }
    })

    // Tạo edge từ targetNode đến root node mới của subtree
    const newRootNodeId = nodeIdMap.get(rootNodeId)
    const rootEdge = {
      id: `edge-${targetNodeId}-${newRootNodeId}`,
      source: targetNodeId,
      target: newRootNodeId
    }

    // Store creation order cho tất cả nodes mới
    newNodes.forEach(node => {
      nodeCreationOrder.value.set(node.id, creationOrderCounter++)
    })

    // Add nodes and edges
    elements.value = [
      ...nodes.value,
      ...newNodes,
      ...edges.value,
      ...newEdges,
      rootEdge
    ]

    // Select root node của subtree mới
    const newRootNode = newNodes.find(n => n.id === newRootNodeId)
    selectedNode.value = newRootNode

    if (d3Renderer) {
      d3Renderer.selectedNode = newRootNodeId
    }

    

    // ⚠️ NEW: Nếu là cut operation, clear clipboard sau khi paste thành công
    // (Node đã bị xóa ngay khi cut, không cần xóa lại)
    if (clipboard.value.operation === 'cut') {
      // Clear clipboard sau khi cut đã được paste
      clipboard.value = null
      
    }

    // ⚠️ CRITICAL: Áp dụng strikethrough cho các node đã completed sau khi paste
    nextTick(() => {
      void document.body.offsetHeight
      setTimeout(() => {
        newNodes.forEach(newNode => {
          const isCompleted = newNode.data?.completed || false
          if (isCompleted) {
            // Đợi editor được mount xong
            setTimeout(() => {
              const editorInstance = d3Renderer?.getEditorInstance?.(newNode.id)
              if (editorInstance) {
                applyStrikethroughToTitle(editorInstance, true)
              }
            }, 100)
          }
        })
      }, 100)
    })

    // Auto-focus root node's editor
    nextTick(() => {
      void document.body.offsetHeight
      setTimeout(() => {
        const nodeGroup = d3Renderer?.g?.select(`[data-node-id="${newRootNodeId}"]`)
        if (nodeGroup && !nodeGroup.empty()) {
          setTimeout(() => {
            const editorInstance = d3Renderer?.getEditorInstance?.(newRootNodeId)
            if (editorInstance) {
              editorInstance.commands.focus('end')
            }
          }, 200)
        }
      }, 30)
    })

    scheduleSave()
    return
  }

  // Trường hợp cũ: Paste node đơn lẻ hoặc text (backward compatibility)
  const newNodeId = `node-${nodeCounter++}`
  let newNodeLabel = 'Nhánh mới'

  let newNodeFixedWidth = null
  let newNodeFixedHeight = null

  let newNodeCompleted = false
  
  if (clipboard.value.type === 'node') {
    newNodeLabel = clipboard.value.data.label || 'Nhánh mới'
    // ⚠️ CRITICAL: Copy trạng thái completed từ node gốc
    newNodeCompleted = clipboard.value.data.completed || false
    // ⚠️ FIX: Nếu có kích thước thực tế từ node gốc, dùng để paste chính xác
    if (clipboard.value.data.width && clipboard.value.data.height) {
      newNodeFixedWidth = clipboard.value.data.width
      newNodeFixedHeight = clipboard.value.data.height
    }
  } else if (clipboard.value.type === 'text') {
    newNodeLabel = clipboard.value.data || 'Nhánh mới'
  }

  const newNode = {
    id: newNodeId,
    data: {
      label: newNodeLabel,
      parentId: targetNodeId,
      completed: newNodeCompleted, // ⚠️ CRITICAL: Copy trạng thái completed
      // ⚠️ FIX: Set fixedWidth/fixedHeight nếu có để node paste có kích thước chính xác
      ...(newNodeFixedWidth && newNodeFixedHeight ? {
        fixedWidth: newNodeFixedWidth,
        fixedHeight: newNodeFixedHeight
      } : {})
    }
  }

  const newEdge = {
    id: `edge-${targetNodeId}-${newNodeId}`,
    source: targetNodeId,
    target: newNodeId
  }

  // Store creation order
  nodeCreationOrder.value.set(newNodeId, creationOrderCounter++)

  // Add node and edge
  elements.value = [
    ...nodes.value,
    newNode,
    ...edges.value,
    newEdge
  ]

  selectedNode.value = newNode

  if (d3Renderer) {
    d3Renderer.selectedNode = newNodeId
  }

  // ⚠️ CRITICAL: Áp dụng strikethrough cho node đã completed sau khi paste
  if (newNodeCompleted) {
    nextTick(() => {
      void document.body.offsetHeight
      setTimeout(() => {
        const editorInstance = d3Renderer?.getEditorInstance?.(newNodeId)
        if (editorInstance) {
          applyStrikethroughToTitle(editorInstance, true)
        }
      }, 100)
    })
  }

  // Auto-focus new node's editor
  nextTick(() => {
    void document.body.offsetHeight
    setTimeout(() => {
      const nodeGroup = d3Renderer?.g?.select(`[data-node-id="${newNodeId}"]`)
      if (nodeGroup && !nodeGroup.empty()) {
        setTimeout(() => {
          const editorInstance = d3Renderer?.getEditorInstance?.(newNodeId)
          if (editorInstance) {
            editorInstance.commands.focus('end')
          }
        }, 200)
      }
    }, 30)
  })

  scheduleSave()
}

// ⚠️ NEW: Paste từ clipboard hệ thống (nội dung từ bên ngoài)
async function pasteFromSystemClipboard(targetNodeId) {
  if (!targetNodeId) return

  try {
    // Đọc text từ clipboard hệ thống
    const text = await navigator.clipboard.readText()

    if (!text || text.trim() === '') {
      
      return
    }

    // Tạo node mới với nội dung từ clipboard
    const newNodeId = `node-${nodeCounter++}`
    const newNode = {
      id: newNodeId,
      data: {
        label: text.trim(),
        parentId: targetNodeId
      }
    }

    const newEdge = {
      id: `edge-${targetNodeId}-${newNodeId}`,
      source: targetNodeId,
      target: newNodeId
    }

    // Store creation order
    nodeCreationOrder.value.set(newNodeId, creationOrderCounter++)

    // Add node and edge
    elements.value = [
      ...nodes.value,
      newNode,
      ...edges.value,
      newEdge
    ]

    selectedNode.value = newNode

    if (d3Renderer) {
      d3Renderer.selectedNode = newNodeId
    }
    // Auto-focus new node's editor
    nextTick(() => {
      void document.body.offsetHeight
      setTimeout(() => {
        const nodeGroup = d3Renderer?.g?.select(`[data-node-id="${newNodeId}"]`)
        if (nodeGroup && !nodeGroup.empty()) {
          setTimeout(() => {
            const editorInstance = d3Renderer?.getEditorInstance?.(newNodeId)
            if (editorInstance) {
              editorInstance.commands.focus('end')
            }
          }, 200)
        }
      }, 30)
    })

    scheduleSave()
  } catch (error) {
    
    // Fallback: thử đọc từ event clipboard nếu có
    // (không thể làm ở đây vì đây là async function, nhưng có thể thử lại với cách khác)
  }
}

function syncElementsWithRendererPosition() {
  if (!d3Renderer?.positions?.size) return

  const newNodes = nodes.value.map(n => {
    const pos = d3Renderer.positions.get(n.id)
    if (!pos) return n
    return {
      ...n,
      position: { x: pos.x, y: pos.y }
    }
  })

  elements.value = [
    ...newNodes,
    ...edges.value
  ]
}

function handleContextMenuAction({ type, node }) {
  if (!node) return

  switch (type) {
    case "add-child":
      addChildToNode(node.id)
      break

    case "add-sibling":
      addSiblingToNode(node.id)
      break

    case "copy":
      // ⚠️ NEW: Copy node
      copyNode(node.id)
      break

    case "cut":
      // ⚠️ NEW: Cut node
      cutNode(node.id)
      break

    case "paste":
      // ⚠️ NEW: Paste to node
      if (hasClipboard.value) {
        // Paste từ clipboard của mindmap
        pasteToNode(node.id)
      } else {
        // Paste từ clipboard hệ thống (nội dung từ bên ngoài)
        pasteFromSystemClipboard(node.id)
      }
      break

    case "copy-link":
      // ⚠️ NEW: Copy link to node
      copyNodeLink(node.id)
      break

    case "link-task":
      openTaskLinkModal(node)
      break

    case "delete-task-link":
      deleteTaskLink(node)
      break

    // case "toggle-collapse":
    //   d3Renderer.toggleCollapse(node.id)
    //   break

    case "delete":
      selectedNode.value = node
      deleteSelectedNode()
      break

    case 'add-comment': {
      isFromUI.value = true
      syncElementsWithRendererPosition()

      const syncedNode = nodes.value.find(n => n.id === node.id)

      activeCommentNode.value = syncedNode || node

      showPanel.value = true

      nextTick(() => {
        d3Renderer?.selectCommentNode(node.id, false)
        isFromUI.value = false
      })

      break
    }

  }
}

onMounted(() => {
  window.addEventListener("click", handleClickOutside, true)
  // ⚠️ NEW: Thêm event listener cho paste event để xử lý paste từ clipboard hệ thống
  window.addEventListener("paste", handlePasteEvent, true)
})

onBeforeUnmount(() => {
  window.removeEventListener("click", handleClickOutside, true)
  window.removeEventListener("paste", handlePasteEvent, true)
})

function handleClickOutside(e) {
  // Đóng context menu khi click outside (trừ khi click vào context menu)
  if (showContextMenu.value) {
    const contextMenu = e.target.closest('.mindmap-context-menu')
    if (!contextMenu) {
      showContextMenu.value = false
    }
  }

  if (!showPanel.value) return

  const panel = commentPanelRef.value?.$el
  const clickedInsidePanel = panel?.contains(e.target)
  

  if (clickedInsidePanel) return
  if (e.target.closest(".node-group")) return
  if (e.target.closest(".pi-comment")) return
  if (e.target.closest("[data-comment-panel]")) return
  if (e.target.closest("[data-comment-dropdown]")) return
  if (e.target.closest("[data-comment-more]")) return
  if (e.target.closest("[comment-editor-root]")) return
  if (e.target.closest("[data-comment-dots]")) return
  if (e.target.closest("[data-upload-image-to-comment]")) return
  

  if (commentInputValue.value.trim().length > 0) return

  activeCommentNode.value = null
}

// ⚠️ NEW: Handle paste event từ clipboard hệ thống
function handlePasteEvent(event) {
  // Kiểm tra xem có đang trong editor không
  const isInEditor = event.target?.closest('.mindmap-node-editor') ||
    event.target?.closest('.ProseMirror') ||
    event.target?.closest('.mindmap-editor-prose')

  if (isInEditor) {
    // Nếu đang trong editor, cho phép paste text bình thường (TipTap sẽ xử lý)
    return
  }

  // Kiểm tra xem có đang focus vào input/textarea không
  const isInInput = event.target?.tagName === 'INPUT' ||
    event.target?.tagName === 'TEXTAREA' ||
    event.target?.isContentEditable

  if (isInInput) {
    // Nếu đang trong input/textarea, cho phép paste bình thường
    return
  }

  // Chỉ xử lý paste nếu có node được chọn và không có clipboard của mindmap
  if (selectedNode.value && !hasClipboard.value) {
    event.preventDefault()
    event.stopPropagation()

    // Đọc text từ clipboard event
    const clipboardData = event.clipboardData || window.clipboardData
    if (clipboardData) {
      const text = clipboardData.getData('text/plain')
      if (text && text.trim()) {
        // Tạo node mới với nội dung từ clipboard
        const newNodeId = `node-${nodeCounter++}`
        const newNode = {
          id: newNodeId,
          data: {
            label: text.trim(),
            parentId: selectedNode.value.id
          }
        }

        const newEdge = {
          id: `edge-${selectedNode.value.id}-${newNodeId}`,
          source: selectedNode.value.id,
          target: newNodeId
        }

        // Store creation order
        nodeCreationOrder.value.set(newNodeId, creationOrderCounter++)

        // Add node and edge
        elements.value = [
          ...nodes.value,
          newNode,
          ...edges.value,
          newEdge
        ]

        selectedNode.value = newNode

        if (d3Renderer) {
          d3Renderer.selectedNode = newNodeId
        }
        // Auto-focus new node's editor
        nextTick(() => {
          void document.body.offsetHeight
          setTimeout(() => {
            const nodeGroup = d3Renderer?.g?.select(`[data-node-id="${newNodeId}"]`)
            if (nodeGroup && !nodeGroup.empty()) {
              setTimeout(() => {
                const editorInstance = d3Renderer?.getEditorInstance?.(newNodeId)
                if (editorInstance) {
                  editorInstance.commands.focus('end')
                }
              }, 200)
            }
          }, 30)
        })

        scheduleSave()
      }
    }
  }
}

function onCancelComment() {
  activeCommentNode.value = null
}


function handleSelectCommentNode(node) {
  if (!node) return

  if (activeCommentNode.value?.id === node.id) {
    return
  }

  activeCommentNode.value = node

  // nếu muốn sync luôn highlight bên D3:
  selectedNode.value = node
  d3Renderer?.selectCommentNode(node.id, false)
}

// Handle toolbar done (toggle completed status)
async function handleToolbarDone(node) {
  if (!node || !node.id || node.id === 'root') return

  // ⚠️ NEW: Kiểm tra task_link nếu node có liên kết với task
  const taskLink = node.data?.taskLink
  if (taskLink?.taskId) {
    try {
      // Lấy trạng thái task từ API
      const taskStatus = await call("drive.api.mindmap_task.get_task_status", {
        task_id: taskLink.taskId
      })
      
      if (!taskStatus || !taskStatus.exists) {
        // Task đã bị xóa - xóa taskLink và cho phép tick done bình thường
        const { taskLink: removedTaskLink, ...restData } = node.data
        node.data = restData
        
        // Tiếp tục với logic tick done bình thường
        const isCompleted = !node.data?.completed
        if (!node.data) node.data = {}
        node.data.completed = isCompleted
        
        // Apply strikethrough
        const editorInstance = d3Renderer?.getEditorInstance?.(node.id)
        if (editorInstance) {
          applyStrikethroughToTitle(editorInstance, isCompleted)
        }
        
        // Sync và save
        if (d3Renderer) {
          d3Renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
          d3Renderer.render()
        }
        scheduleSave()
        return
      }
      
      // Kiểm tra trạng thái task
      const isTaskCompleted = taskStatus.is_completed || taskStatus.status === "Completed" || taskStatus.status_vi === "Hoàn thành"
      
      if (!isTaskCompleted) {
        // Task chưa hoàn thành - hiển thị thông báo và không cho tick done
        toast({
          title: "Công việc chưa hoàn thành. Nhánh sẽ tự chuyển sang Hoàn thành khi công việc được kéo sang trạng thái Hoàn thành.",
          description: "",
          indicator: "orange",
          duration: 5000
        })
        return
      }
      
      // Task đã hoàn thành
      const currentCompleted = node.data?.completed || false
      const newCompleted = !currentCompleted
      
      // ⚠️ NEW: Nếu node đã completed và task đã hoàn thành → không cho phép bỏ hoàn thành
      if (currentCompleted && isTaskCompleted) {
        toast({
          title: "Không thể bỏ hoàn thành nhánh vì công việc đã hoàn thành",
          description: "Nhánh này đã được tự động hoàn thành khi công việc hoàn thành. Để bỏ hoàn thành, vui lòng thay đổi trạng thái công việc.",
          indicator: "orange",
          duration: 5000
        })
        return
      }
      
      // Task đã hoàn thành và node chưa completed → cho phép check
      if (!node.data) node.data = {}
      node.data.completed = newCompleted
      
      // Apply strikethrough
      const editorInstance = d3Renderer?.getEditorInstance?.(node.id)
      if (editorInstance) {
        applyStrikethroughToTitle(editorInstance, newCompleted)
      }
      
      // Sync và save
      if (d3Renderer) {
        d3Renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
        d3Renderer.render()
      }
      scheduleSave()
      return
      
    } catch (error) {
      console.error("Error checking task status:", error)
      // Nếu có lỗi, cho phép tick done bình thường (fallback)
      toast({
        title: "Không thể kiểm tra trạng thái công việc",
        indicator: "orange"
      })
    }
  }

  // Node không có taskLink - tick done bình thường
  const isCompleted = !node.data?.completed

  // Update node - CHỈ node này được đánh dấu completed
  if (!node.data) node.data = {}
  node.data.completed = isCompleted

  // ⚠️ CHANGED: KHÔNG set completed cho descendants
  // Descendants sẽ được làm mờ dựa trên parent completed trong logic render

  // Apply strikethrough to title ONLY for the main node (not descendants)
  const editorInstance = d3Renderer?.getEditorInstance?.(node.id)
  if (editorInstance) {
    applyStrikethroughToTitle(editorInstance, isCompleted)
  }

  // ⚠️ CRITICAL: Sync data với renderer TRƯỚC KHI render
  // Đảm bảo d3Renderer.nodes có completed status mới nhất
  if (d3Renderer) {
    d3Renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
    d3Renderer.render()
  }

  scheduleSave()
  
}

// Helper: Apply strikethrough to title paragraphs
function applyStrikethroughToTitle(editor, isCompleted) {
  if (!editor) return

  const { state } = editor.view
  const { doc, schema } = state

  // Find all text nodes in title paragraphs (not in blockquote)
  const titleRanges = []

  doc.descendants((node, pos) => {
    if (node.isText) {
      const resolvedPos = state.doc.resolve(pos)
      let inBlockquote = false

      // Check if in blockquote
      for (let i = resolvedPos.depth; i > 0; i--) {
        const nodeAtDepth = resolvedPos.node(i)
        if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
          inBlockquote = true
          break
        }
      }

      if (!inBlockquote) {
        titleRanges.push({ from: pos, to: pos + node.nodeSize })
      }
    }
  })

  if (titleRanges.length > 0) {
    let tr = state.tr
    // StarterKit includes strike mark (strike or s)
    const strikeMark = schema.marks.strike || schema.marks.s

    if (strikeMark) {
      titleRanges.forEach(({ from, to }) => {
        if (isCompleted) {
          // Add strike mark to all text in title
          tr = tr.addMark(from, to, strikeMark.create())
        } else {
          // Remove strike mark from all text in title
          tr = tr.removeMark(from, to, strikeMark.create())
        }
      })

      editor.view.dispatch(tr)
    }
  }
}

// Handle toolbar comments
function handleToolbarComments({ node, show }) {
  if (show) {
    activeCommentNode.value = node
    showPanel.value = true
    d3Renderer?.selectCommentNode(node.id, false)
  } else {
    activeCommentNode.value = null
    showPanel.value = false
  }
}

// Handle toolbar more options (hover)
function handleToolbarMoreOptions({ node }) {
  // Chỉ cần node để hiển thị menu trong toolbar
  // Menu sẽ được render trực tiếp trong toolbar popup
}

// Handle toolbar context action
function handleToolbarContextAction({ type, node }) {
  if (!node) return

  // Xử lý action giống như handleContextMenuAction
  handleContextMenuAction({ type, node })
}

// Handle insert image
async function handleInsertImage({ node }) {
  

  if (!node) {
    
    return
  }

  // ⚠️ FIX: Đợi editor instance sẵn sàng nếu chưa có (khi tạo node mới)
  if (!currentEditorInstance.value) {
    
    
    // Đảm bảo node được render trước
    if (d3Renderer && node.id) {
      // Force update renderer để đảm bảo node được render
      await nextTick()
      void document.body.offsetHeight
      
      // Trigger render
      requestAnimationFrame(() => {
        if (d3Renderer) {
          d3Renderer.render()
        }
      })
      
      // Đợi một chút để render hoàn tất
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Đợi editor instance được mount (tối đa 3 giây)
    let attempts = 0
    const maxAttempts = 60 // 60 * 50ms = 3 giây
    
    while (attempts < maxAttempts) {
      // Kiểm tra xem editor instance đã sẵn sàng chưa
      const editor = d3Renderer?.getEditorInstance(node.id) || currentEditorInstance.value
      
      if (editor && editor.view) {
        
        break
      }
      
      // Mỗi 10 lần thử, trigger lại render để đảm bảo node được mount
      if (attempts % 10 === 0 && d3Renderer) {
        requestAnimationFrame(() => {
          if (d3Renderer) {
            d3Renderer.render()
          }
        })
      }
      
      await new Promise(resolve => setTimeout(resolve, 50))
      attempts++
    }
    
    // Kiểm tra lại editor instance - đảm bảo computed property đã được cập nhật
    await nextTick() // Đợi Vue cập nhật computed property
    
    const finalEditor = d3Renderer?.getEditorInstance(node.id) || currentEditorInstance.value
    
    if (!finalEditor || !finalEditor.view) {
      return
    }
    
    // Đảm bảo currentEditorInstance computed đã được cập nhật
    if (!currentEditorInstance.value && finalEditor) {
      // Nếu computed chưa cập nhật, đợi thêm một chút
      await new Promise(resolve => setTimeout(resolve, 50))
      await nextTick()
    }
    
    // Đảm bảo editor được focus để sẵn sàng nhận input
    if (finalEditor && finalEditor.view && !finalEditor.view.focused) {
      try {
        finalEditor.commands.focus()
      } catch (e) {
        
      }
    }
  }

  // Tạo input file element
  const input = document.createElement('input')
  input.type = 'file'
  // ⚠️ FIX: Chỉ định rõ các định dạng ảnh được phép, không dùng image/* để tránh chọn "Tất cả tệp tin"
  input.accept = '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg'
  input.style.display = 'none' // Ẩn input element

  // Append vào body để đảm bảo dialog hiển thị đúng
  document.body.appendChild(input)

  

  // Xử lý khi chọn file
  input.onchange = async (e) => {
    const file = e.target.files?.[0]

    // Cleanup: xóa input element sau khi chọn file
    if (input.parentNode) {
      input.parentNode.removeChild(input)
    }

    if (!file) return

    // ⚠️ CRITICAL: Validate file type để đảm bảo chỉ upload ảnh
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml']
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
    const fileName = file.name.toLowerCase()
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'))
    const isValidType = allowedTypes.includes(file.type) || allowedExtensions.includes(fileExtension)
    
    if (!isValidType) {
      toast({ 
        title: "Chỉ được phép tải lên file ảnh (JPG, PNG, GIF, WEBP, BMP, SVG)", 
        indicator: "red" 
      })
      return
    }

    // ⚠️ CRITICAL: Lưu node.id và editor instance trước khi upload
    const nodeId = node.id
    let editorBeforeUpload = currentEditorInstance.value || (d3Renderer?.getEditorInstance(nodeId))
    
    

    try {
      // Upload ảnh lên drive mindmap
      const imageUrl = await uploadImageToMindmap(file, props.team, props.entityName)

      // Đợi một chút để đảm bảo upload hoàn tất
      await nextTick()

      // ⚠️ FIX: Lấy lại editor instance sau khi upload - thử nhiều cách
      let editor = currentEditorInstance.value
      
      // Nếu computed property không có, thử lấy trực tiếp từ d3Renderer
      if (!editor || !editor.view) {
        
        editor = d3Renderer?.getEditorInstance(nodeId)
      }
      
      // Nếu vẫn không có, đợi một chút và thử lại
      if (!editor || !editor.view) {
        
        let attempts = 0
        const maxAttempts = 20 // 20 * 50ms = 1 giây
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 50))
          editor = currentEditorInstance.value || d3Renderer?.getEditorInstance(nodeId)
          if (editor && editor.view) {
            
            break
          }
          attempts++
        }
      }
      
      if (!editor || !editor.view) {
        return
      }
      
      

      // Chèn ảnh vào editor
      if (imageUrl) {
        

        // ⚠️ CRITICAL: Sử dụng editor đã lấy được (có thể từ d3Renderer trực tiếp)
        // Đảm bảo editor vẫn còn hợp lệ
        if (!editor || !editor.view) {
          // Thử lấy lại một lần nữa
          editor = currentEditorInstance.value || d3Renderer?.getEditorInstance(nodeId)
        }
        
        if (!editor || !editor.view) {
          
          return
        }

        // Sử dụng requestAnimationFrame để đảm bảo editor đã sẵn sàng
        requestAnimationFrame(() => {
          // Lấy lại editor một lần nữa trong requestAnimationFrame để đảm bảo
          let currentEditor = currentEditorInstance.value || d3Renderer?.getEditorInstance(nodeId)
          
          // Nếu vẫn không có, sử dụng editor đã lấy được trước đó
          if (!currentEditor || !currentEditor.view) {
            currentEditor = editor
          }
          
          if (!currentEditor || !currentEditor.view) {
            
            return
          }

          try {
            // Tìm vị trí chèn ảnh: giữa title (paragraph) và mô tả (blockquote)
            const { state } = currentEditor.view
            const { doc } = state

            // Tìm blockquote đầu tiên trong document
            let blockquoteOffset = null
            // Tìm paragraph cuối cùng không nằm trong blockquote (title cuối cùng)
            let lastTitleParagraphOffset = null
            let lastTitleParagraphSize = 0
            // ⚠️ FIX: Tìm ảnh cuối cùng sau title (không nằm trong blockquote)
            let lastImageEndPos = null

            // ⚠️ FIX: Sử dụng descendants để duyệt tất cả node (bao gồm cả node con)
            doc.descendants((node, pos) => {
              // Tìm blockquote đầu tiên
              if (node.type.name === 'blockquote' && blockquoteOffset === null) {
                blockquoteOffset = pos
              }
              
              // Tìm paragraph cuối cùng không nằm trong blockquote
              if (node.type.name === 'paragraph') {
                // Kiểm tra xem paragraph có nằm trong blockquote không
                const resolvedPos = state.doc.resolve(pos)
                let inBlockquote = false
                
                for (let i = resolvedPos.depth; i > 0; i--) {
                  const nodeAtDepth = resolvedPos.node(i)
                  if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                    inBlockquote = true
                    break
                  }
                }
                
                // Nếu không nằm trong blockquote, đây là title paragraph
                if (!inBlockquote) {
                  const paragraphEnd = pos + node.nodeSize
                  if (lastTitleParagraphOffset === null || paragraphEnd > (lastTitleParagraphOffset + lastTitleParagraphSize)) {
                    lastTitleParagraphOffset = pos
                    lastTitleParagraphSize = node.nodeSize
                  }
                }
              }
              
              // ⚠️ FIX: Tìm ảnh sau title paragraphs (không phải blockquote)
              if (node.type.name === 'image') {
                const resolvedPos = state.doc.resolve(pos)
                let inBlockquote = false
                
                for (let i = resolvedPos.depth; i > 0; i--) {
                  const nodeAtDepth = resolvedPos.node(i)
                  if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                    inBlockquote = true
                    break
                  }
                }
                
                // Nếu không phải blockquote, đó là ảnh sau title
                if (!inBlockquote) {
                  const imageEnd = pos + node.nodeSize
                  if (lastImageEndPos === null || imageEnd > lastImageEndPos) {
                    lastImageEndPos = imageEnd
                  }
                }
              }
            })

            let insertPosition = null

            if (blockquoteOffset !== null) {
              // Có blockquote: chèn ảnh vào giữa title và blockquote
              // ⚠️ FIX: Ưu tiên chèn sau ảnh cuối cùng nếu có
              if (lastImageEndPos !== null) {
                // Có ảnh đã tồn tại, chèn sau ảnh cuối cùng (trước blockquote)
                insertPosition = lastImageEndPos
              } else if (lastTitleParagraphOffset !== null) {
                // Chèn ảnh sau paragraph cuối cùng của title (trước blockquote)
                insertPosition = lastTitleParagraphOffset + lastTitleParagraphSize
              } else {
                // Không có title paragraph: chèn ảnh vào trước blockquote
                insertPosition = blockquoteOffset
              }
            } else {
              // Không có blockquote: chèn ảnh sau paragraph cuối cùng của title
              // ⚠️ FIX: Ưu tiên chèn sau ảnh cuối cùng nếu có
              if (lastImageEndPos !== null) {
                // Có ảnh đã tồn tại, chèn sau ảnh cuối cùng
                insertPosition = lastImageEndPos
              } else if (lastTitleParagraphOffset !== null) {
                insertPosition = lastTitleParagraphOffset + lastTitleParagraphSize
              } else {
                // Không có title paragraph: chèn ảnh vào cuối document
                insertPosition = doc.content.size
              }
            }

            // Kiểm tra xem editor có command setImage không
            if (currentEditor.commands && typeof currentEditor.commands.setImage === 'function') {
              
              // Set selection tại vị trí chèn
              currentEditor.chain()
                .setTextSelection(insertPosition)
                .focus()
                .setImage({ src: imageUrl, alt: file.name || 'Image' })
                .run()
              
            } else {
              
              // Fallback: dùng insertContent với HTML
              // Escape URL để tránh lỗi khi có ký tự đặc biệt
              const escapedUrl = imageUrl.replace(/&/g, '&amp;')
              currentEditor.chain()
                .setTextSelection(insertPosition)
                .focus()
                .insertContent(`<img src="${escapedUrl}" alt="${file.name || 'Image'}" />`)
                .run()
              
            }

            // ⚠️ CRITICAL: Đợi ảnh mới được render vào DOM, rồi đợi tất cả ảnh load xong
            // Lưu số lượng ảnh ban đầu để phát hiện ảnh mới
            const editorDOM = currentEditor.view.dom
            const initialImageCount = editorDOM.querySelectorAll('img').length
            
            // Đợi cho đến khi ảnh mới xuất hiện trong DOM (tối đa 1 giây)
            let checkAttempts = 0
            const maxCheckAttempts = 20 // 20 * 50ms = 1 giây
            const checkForNewImage = setInterval(() => {
              checkAttempts++
              const currentImages = editorDOM.querySelectorAll('img')
              const currentImageCount = currentImages.length
              
              // Nếu số lượng ảnh tăng lên (có ảnh mới) hoặc đã đợi đủ lâu
              if (currentImageCount > initialImageCount || checkAttempts >= maxCheckAttempts) {
                clearInterval(checkForNewImage)
                
                const images = Array.from(currentImages)
                
                
                // Tạo promises cho tất cả ảnh (bao gồm ảnh mới vừa chèn)
                const imagePromises = images.map((img, index) => {
                  if (img.complete && img.naturalHeight > 0) {
                    return Promise.resolve()
                  }
                  
                  return new Promise((resolve) => {
                    const onLoad = () => resolve()
                    const onError = () => resolve() // Resolve ngay cả khi lỗi để không block
                    
                    img.addEventListener('load', onLoad, { once: true })
                    img.addEventListener('error', onError, { once: true })
                    
                    // Timeout sau 3 giây để không block quá lâu
                    setTimeout(() => {
                      img.removeEventListener('load', onLoad)
                      img.removeEventListener('error', onError)
                      resolve()
                    }, 3000)
                  })
                })
                
                // Đợi tất cả ảnh load xong (hoặc timeout)
                Promise.all(imagePromises).then(() => {
                  
                  
                  // Đợi thêm một chút để đảm bảo DOM đã được cập nhật hoàn toàn
                  setTimeout(() => {
                    
                    try {
                      // ⚠️ CRITICAL: Trigger blur editor để gọi handleEditorBlur
                      // handleEditorBlur sẽ cập nhật chính xác height của node
                      if (d3Renderer && nodeId) {
                        
                        const editor = d3Renderer.getEditorInstance(nodeId)
                        
                        if (editor) {
                          
                          // Blur editor → trigger handleEditorBlur → cập nhật height
                          editor.commands.blur()
                          
                          // Sau đó focus lại để người dùng có thể tiếp tục edit
                          setTimeout(() => {
                            editor.commands.focus('end')
                          }, 100)
                        } else {
                          console.error('[ERROR handleInsertImage] editor is null for node:', nodeId)
                        }
                      } else {
                        console.error('[ERROR handleInsertImage] d3Renderer or nodeId is null')
                      }
                    } catch (err) {
                      console.error('[ERROR handleInsertImage] Exception:', err)
                    }
                  }, 150) // Đợi thêm 150ms sau khi ảnh load xong
                }).catch(err => {
                  
                })
              }
            }, 50) // Kiểm tra mỗi 50ms
          } catch (err) {
            
          }
        })
      }
    } catch (error) {
      
    }
  }

  // Xử lý khi user cancel dialog
  input.oncancel = () => {
    // Cleanup: xóa input element khi cancel
    if (input.parentNode) {
      input.parentNode.removeChild(input)
    }
  }

  // Trigger click để hiển thị file picker dialog
  // Sử dụng setTimeout để đảm bảo input đã được append vào DOM
  setTimeout(() => {
    input.click()
  }, 0)
}

// Upload image to mindmap
async function uploadImageToMindmap(file, team, mindmapEntityName) {
  const { v4: uuidv4 } = await import('uuid')
  const fileUuid = uuidv4()
  const chunkSize = 5 * 1024 * 1024 // 5MB
  let chunkByteOffset = 0
  let chunkIndex = 0
  const totalChunks = Math.ceil(file.size / chunkSize)

  while (chunkByteOffset < file.size) {
    const currentChunk = file.slice(chunkByteOffset, chunkByteOffset + chunkSize)
    const response = await uploadChunk(
      file.name,
      team,
      currentChunk,
      fileUuid,
      file.size,
      file.type,
      chunkIndex,
      chunkSize,
      totalChunks,
      chunkByteOffset,
      mindmapEntityName
    )

    if (chunkIndex === totalChunks - 1) {
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`)
      }
      const data = await response.json()
      // Return embed URL - sử dụng absolute URL
      const imageUrl = `${window.location.origin}/api/method/drive.api.embed.get_file_content?embed_name=${data.message.name}&parent_entity_name=${mindmapEntityName}`
      
      return imageUrl
    }

    chunkByteOffset += chunkSize
    chunkIndex++
  }
}

// Upload chunk helper
async function uploadChunk(
  fileName,
  team,
  currentChunk,
  fileUuid,
  fileSize,
  fileType,
  chunkIndex,
  chunkSize,
  totalChunks,
  chunkByteOffset,
  parentEntityName
) {
  const formData = new FormData()
  formData.append("filename", fileName)
  formData.append("team", team)
  formData.append("total_file_size", fileSize)
  formData.append("mime_type", fileType)
  formData.append("total_chunk_count", totalChunks)
  formData.append("chunk_byte_offset", chunkByteOffset)
  formData.append("chunk_index", chunkIndex)
  formData.append("chunk_size", chunkSize)
  formData.append("file", currentChunk)
  formData.append("parent", parentEntityName)
  formData.append("embed", 1)
  formData.append("personal", mindmap.data?.is_private ? 1 : 0)
  formData.append("uuid", fileUuid)

  const response = await fetch(
    window.location.origin + "/api/method/drive.api.files.upload_file",
    {
      method: "POST",
      body: formData,
      headers: {
        "X-Frappe-CSRF-Token": window.csrf_token,
        Accept: "application/json",
      },
    }
  )
  return response
}

const realtimeMindmapNodes = computed(() => {
  return nodes.value.map(n => ({
    id: n.id,
    data: n.data,
    position: n.position,
    node_key: n.node_key ?? null,
    created_at: n.created_at ?? null,
  }))
})


const nodeFromQuery = computed(() => route.query.node)



function handleRealtimeNewComment(newComment) {
  if (!newComment?.node_id) return

  const node = nodes.value.find(n => n.id === newComment.node_id)
  if (node) {
    node.count = (node.count || 0) + 1
  }
}

function handleRealtimeDeleteOneComment(payload) {
  if (!payload?.node_id) return

  const node = nodes.value.find(n => n.id === payload.node_id)
  if (node && node.count > 0) {
    node.count = node.count - 1
  }
}

function handleRealtimeResolvedComment(payload){
    if (!payload?.node_id) return

  const node = nodes.value.find(n => n.id === payload.node_id)
  if (node && node.count > 0) {
    node.count = node.count - payload.count
  }
}

// ⚠️ NEW: Handle realtime task status update
function handleRealtimeTaskStatusUpdate(payload) {
  console.log('📥 handleRealtimeTaskStatusUpdate received:', payload)
  if (!payload) {
    console.warn('⚠️ handleRealtimeTaskStatusUpdate: payload is empty')
    return
  }
  
  // Chỉ xử lý nếu là mindmap hiện tại
  if (payload.mindmap_id !== props.entityName) return
  
  const { node_id, completed, task_status, task_status_vi } = payload
  
  if (!node_id) return
  
  // Tìm node cần cập nhật
  const node = nodes.value.find(n => n.id === node_id)
  if (!node) return
  
  // Cập nhật completed status
  if (!node.data) node.data = {}
  const oldCompleted = node.data.completed || false
  node.data.completed = completed || false
  
  // Cập nhật task status trong taskLink nếu có
  if (node.data.taskLink) {
    node.data.taskLink.status = task_status
  }
  
  // Apply/remove strikethrough nếu status thay đổi
  if (oldCompleted !== node.data.completed) {
    nextTick(() => {
      setTimeout(() => {
        const editorInstance = d3Renderer?.getEditorInstance?.(node_id)
        if (editorInstance) {
          applyStrikethroughToTitle(editorInstance, node.data.completed)
        }
      }, 100)
    })
  }
  
  // Sync với renderer
  if (d3Renderer) {
    d3Renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
    d3Renderer.render()
  }
}

watch(
  [nodeFromQuery, isMindmapReady],
  ([nodeId, ready]) => {
    if (isFromUI.value) return
    if (!nodeId) return
    if (nodeId === 'root') return
    if (!ready) return

    const targetNode = nodes.value.find(n => n.id === nodeId)
    if (!targetNode) return

    showPanel.value = true
    activeCommentNode.value = targetNode

    d3Renderer?.selectCommentNode(nodeId, false)
  },
  { immediate: true }
)

</script>

<style scoped>
kbd {
  font-family: ui-monospace, monospace;
  font-size: 11px;
}

.d3-mindmap-container {
  position: relative;
}

.d3-mindmap-wrapper {
  width: 100%;
  height: 100%;
}

/* Đảm bảo text selection hoạt động trong editor */
.d3-mindmap-wrapper :deep(foreignObject) {
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.d3-mindmap-wrapper :deep(.node-editor-container) {
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.d3-controls {
  position: absolute;
  bottom: 20px;
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}

.control-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  color: #374151;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.control-btn:hover {
  background: #f9fafb;
  border-color: #d1d5db;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.control-btn:active {
  transform: scale(0.95);
}

/* Delete confirmation dialog */
.delete-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.delete-dialog {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 10px 15px rgba(0, 0, 0, 0.1);
  width: 90%;
  max-width: 400px;
  overflow: hidden;
}

.delete-dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.delete-dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.delete-dialog-body {
  padding: 20px;
  color: #374151;
  line-height: 1.5;
}

.delete-dialog-body p {
  margin: 0 0 12px 0;
}

.delete-dialog-body p:last-child {
  margin-bottom: 0;
}

.delete-dialog-body strong {
  color: #dc2626;
  font-weight: 600;
}

.delete-dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel,
.btn-delete {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-cancel {
  background: #f3f4f6;
  color: #374151;
}

.btn-cancel:hover {
  background: #e5e7eb;
}

.btn-delete {
  background: #dc2626;
  color: white;
}

.btn-delete:hover {
  background: #b91c1c;
}


@keyframes slideIn {
  from {
    transform: translateX(100%);
  }

  to {
    transform: translateX(0);
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(100%);
  }
}

.animate-slide-in {
  animation: slideIn 0.25s ease-out forwards;
}

.animate-slide-out {
  animation: slideOut 0.25s ease-in forwards;
}

:deep(.comment-count-badge) {
  min-width: 22px;
  height: 18px;
  padding: 0 6px;
  margin-top: 5px;
  margin-right: 5px;

  background: #facc15;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 18px;

  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;

  pointer-events: auto;
  z-index: 9999999;
}

:deep(.comment-count-badge::after) {
  content: "";
  position: absolute;
  bottom: -3px;
  left: 50%;
  transform: translateX(-50%);

  width: 0;
  height: 0;

  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 4px solid #facc15;
  /* cùng màu badge */
}
</style>