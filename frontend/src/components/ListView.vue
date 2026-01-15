<template>
  <div class="file-manager-container">
    <!-- Debug info (remove later) -->
    <div v-if="false" style="padding: 10px; background: yellow; font-size: 12px;">
      Debug: totalRecords={{ props.totalRecords }}, computedTotalRecords={{ computedTotalRecords }}, 
      pageSize={{ pageSize }}, first={{ first }}, formattedRows.length={{ formattedRows.length }}
    </div>
    <!-- Data Table -->
    <div class="table-container">
      <DataTable
        ref="dataTableRef"
        :key="`table-${tableKey}`"
        v-model:selection="selectedRows"
        :value="sortedRowsWithKeys"
        :loading="loading || !folderContents"
        paginator
        :rows="pageSize"
        v-model:first="first"
        :totalRecords="computedTotalRecords"
        :lazy="true"
        template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
        :scrollable="true"
        scrollHeight="flex"
        showGridlines
        class="file-table"
        dataKey="uniqueKey"
        :sortField="localSortField"
        :sortOrder="localSortOrder"
        sortMode="single"
        @row-contextmenu="onRowContextMenu"
        @row-click="onRowClick"
        @row-dblclick="onRowDoubleClick"
        :rowClass="rowClass"
        @page="onPageChange"
        @sort="onSort"
      >
        <!-- Selection Column -->
        <Column
          selectionMode="multiple"
          headerStyle="width: 4rem; text-align: center;"
          bodyStyle="width: 4rem; text-align: center;"
        ></Column>

        <!-- Name Column -->
        <Column
          field="title"
          :header="__('Tên')"
          sortable
        >
          <template #body="slotProps">
            <div
              class="name-cell"
              :class="{ 
                'disabled-row': isRowDisabled(slotProps.data),
                'trash-row': isTrashPage
              }"
              @mouseenter="onCellMouseEnter($event, slotProps.data)"
              @mousemove="onCellMouseMove"
              @mouseleave="onCellMouseLeave"
            >
              <div class="file-container">
                <img
                  :src="
                    getThumbnailUrl(
                      slotProps.data.name,
                      slotProps.data.file_type
                    )[0] ||
                    getThumbnailUrl(
                      slotProps.data.name,
                      slotProps.data.file_type
                    )[1]
                  "
                  class="file-icon"
                  :alt="slotProps.data.title"
                  @error="onThumbnailError($event, slotProps.data)"
                />
                <span
                  v-if="!!slotProps.data.is_shortcut"
                  class="shortcut-badge"
                  >
                  <ShortCutIconFile />
                </span>
                </div>
                 <div class="file-name-wrapper">
                   <span class="file-name-text">{{ slotProps.data.title }}</span>
                   <PinFilled 
                     v-if="slotProps.data.is_pinned"
                     class="pinned-icon"
                     :size="14"
                     title="Tài liệu đã ghim"
                   />
                 </div>
            </div>
          </template>
        </Column>

        <!-- Owner Column -->
        <Column
          v-if="windowWidth >= 1024"
          field="owner"
          :header="__('Chủ sở hữu')"
          sortable
        >
          <template #body="slotProps">
            <div
              class="owner-cell"
              :class="{ 
                'disabled-row': isRowDisabled(slotProps.data),
                'trash-row': isTrashPage
              }"
              @mouseenter="onCellMouseEnter($event, slotProps.data)"
              @mousemove="onCellMouseMove"
              @mouseleave="onCellMouseLeave"
            >
              <CustomAvatar
                :image="slotProps.data.owner_user_image || userData[slotProps.data.owner]?.user_image"
                :label="getOwnerLabel(slotProps.data).slice(0, 1)"
                shape="circle"
                size="small"
              />
              <span class="owner-name">{{
                getOwnerLabel(slotProps.data)
              }}</span>
            </div>
          </template>
        </Column>
        <!-- Team Column -->
        <Column
          v-if="
            ['Recents', 'Favourites', 'Trash', 'Shared'].includes($route.name) && windowWidth >= 769
          "
          field="team_name"
          :header="__('Nhóm')"
          sortable
        >
          <template #body="slotProps">
            <div
              class="owner-cell"
              :class="{ 
                'disabled-row': isRowDisabled(slotProps.data),
                'trash-row': isTrashPage
              }"
              @mouseenter="onCellMouseEnter($event, slotProps.data)"
              @mousemove="onCellMouseMove"
              @mouseleave="onCellMouseLeave"
            >
              <span class="owner-name">{{ slotProps.data.is_private === 1 ? '-' : slotProps.data.team_name }}</span>
            </div>
          </template>
        </Column>
        <!-- Days Remaining Column -->
        <Column
          v-if="$route.name === 'Trash' && windowWidth >= 769"
          field="days_remaining"
          :header="__('Ngày còn lại')"
          sortable
        >
          <template #body="slotProps">
            <span
              :class="{ 
                'disabled-row': isRowDisabled(slotProps.data),
                'trash-row': isTrashPage
              }"
              @mouseenter="onCellMouseEnter($event, slotProps.data)"
              @mousemove="onCellMouseMove"
              @mouseleave="onCellMouseLeave"
              >{{ slotProps.data.days_remaining }}</span
            >
          </template>
        </Column>
        <!-- Shared Column -->
        <Column
          v-if="windowWidth >= 1024"
          field="share_count"
          :header="__('Chia sẻ')"
          sortable
        >
          <template #body="slotProps">
            <div
              class="shared-cell"
              :class="{ 
                'disabled-row': isRowDisabled(slotProps.data),
                'trash-row': isTrashPage
              }"
              @mouseenter="onCellMouseEnter($event, slotProps.data)"
              @mousemove="onCellMouseMove"
              @mouseleave="onCellMouseLeave"
            >
              <i
                :class="getShareIcon(slotProps.data.share_count)"
                class="share-icon"
              ></i>
              <span>{{ getShareText(slotProps.data.share_count) }}</span>
            </div>
          </template>
        </Column>

        <!-- Last Modified Column -->
        <Column
          v-if="windowWidth >= 1024"
          field="accessed"
          :header="__('Truy cập lần cuối')"
          sortable
        >
          <template #body="slotProps">
            <span
              :class="{ 
                'disabled-row': isRowDisabled(slotProps.data),
                'trash-row': isTrashPage
              }"
              @mouseenter="onCellMouseEnter($event, slotProps.data)"
              @mousemove="onCellMouseMove"
              @mouseleave="onCellMouseLeave"
              >{{ useTimeAgoVi(slotProps.data.accessed) }}</span
            >
          </template>
        </Column>

        <!-- Size Column -->
        <Column
          v-if="windowWidth >= 1024"
          field="file_size_pretty"
          :header="__('Kích thước')"
          sortable
        >
          <template #body="slotProps">
            <span
              :class="{ 
                'disabled-row': isRowDisabled(slotProps.data),
                'trash-row': isTrashPage
              }"
              @mouseenter="onCellMouseEnter($event, slotProps.data)"
              @mousemove="onCellMouseMove"
              @mouseleave="onCellMouseLeave"
              >{{ getSizeText(slotProps.data) }}</span
            >
          </template>
        </Column>

        <!-- Options Column -->
        <Column bodyStyle="width: 1.5rem; text-align: center;">
          <template #body="slotProps">
            <div>
              <Button
                v-if="isRowDisabled(slotProps.data)"
                icon="pi pi-trash"
                text
                severity="danger"
                class="options-btn"
                @click="onDeleteDisabledRow($event, slotProps.data)"
                title="Xóa"
              />
              <Button
                v-else
                icon="pi pi-ellipsis-v"
                text
                severity="secondary"
                class="options-btn"
                :disabled="selectedRows.length > 1"
                :title="selectedRows.length > 1 ? 'Sử dụng thanh công cụ phía trên khi chọn nhiều file' : ''"
                @click="onRowOptions($event, slotProps.data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Grouped Context Menu -->
    <GroupedContextMenu
      ref="groupedContextMenu"
      :actionItems="selectedRow ? dropdownActionItems(selectedRow) : []"
      :close="onContextMenuClose"
      :onDownloadMindmap="handleDownloadMindmap"
    />

    <!-- Custom Tooltip -->
    <div
      v-if="hoveredDisabledRow"
      class="custom-tooltip"
      :style="tooltipStyle"
    >
      Liên kết không khả dụng: không thể truy cập đến tệp gốc.
    </div>
  </div>
</template>

<script setup>
import DataTable from "primevue/datatable"
import Column from "primevue/column"
import Button from "primevue/button"
import Avatar from "primevue/avatar"
import Tooltip from "primevue/tooltip"
import { getThumbnailUrl } from "@/utils/getIconUrl"
import ThumbnailImage from "@/components/ThumbnailImage.vue"
import { useStore } from "vuex"
import { useRoute, useRouter } from "vue-router"
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from "vue"
import GroupedContextMenu from "@/components/GroupedContextMenu.vue"
import { openEntity } from "@/utils/files"
import { formatDate } from "@/utils/format"
import { onKeyDown } from "@vueuse/core"
import emitter from "@/emitter"
import { useTimeAgoVi } from "@/utils/useTimeAgoVi"
import CustomAvatar from "./CustomAvatar.vue"
import ShortCutIconFile from "@/assets/Icons/ShortCutIconFile.vue"
import { createShortcutResource, removeShortcutResource } from "../utils/files"
import { call } from "frappe-ui"
import { toast } from "@/utils/toasts"
import PinFilled from "@/assets/Icons/PinFilled.vue"
import { usePinnedFiles } from "@/composables/usePinnedFiles"

// Directives
const vTooltip = Tooltip

const store = useStore()
const route = useRoute()
const props = defineProps({
  folderContents: Object,
  actionItems: Array,
  userData: Object,
  getEntities: Object,
  totalRecords: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(["dropped", "page-change"])

const selections = defineModel(new Set())
const selectedRow = ref(null)
const selectedRows = ref([])
const rowEvent = ref(null)
const windowWidth = ref(window.innerWidth)
const groupedContextMenu = ref(null)
const hoveredDisabledRow = ref(null)
const tooltipStyle = ref({})
const tooltipOffset = 10
const highlightedRow = ref(null)
const isContextMenuOpen = ref(false)
const dataTableRef = ref(null)

// Pagination state
const pageSize = ref(20)
const first = ref(0)
const currentPage = ref(1)

// Table key để force re-render khi cần (nhưng không dùng khi sort để giữ pagination)
const tableKey = ref(0)

// Sort state - local frontend sorting (persisted in localStorage)
const getLocalSort = () => {
  try {
    const saved = localStorage.getItem('listViewSort')
    if (saved) {
      const parsed = JSON.parse(saved)
      return { field: parsed.field || null, order: parsed.order || null }
    }
  } catch (e) {
    console.error('Error loading sort state:', e)
  }
  return { field: null, order: null }
}

const setLocalSort = (field, order) => {
  try {
    localStorage.setItem('listViewSort', JSON.stringify({ field, order }))
  } catch (e) {
    console.error('Error saving sort state:', e)
  }
}

const localSortField = ref(getLocalSort().field)
const localSortOrder = ref(getLocalSort().order)

// Computed: Check if current page is Trash
const isTrashPage = computed(() => route.name === 'Trash')

// Handle window resize
const handleResize = () => {
  windowWidth.value = window.innerWidth
}

// Check if row should be disabled
const isRowDisabled = (row) => {
  return row.is_shortcut && row.is_active !== 1
}

// Row class function for styling
const rowClass = (data) => {
  if (isRowDisabled(data)) return "disabled-row-bg"
  if (isTrashPage.value) return "trash-row-bg"
  if (highlightedRow.value === data.uniqueKey) {
    return "highlighted-row"
  }
  return ""
}

// Handle delete for disabled rows
const onDeleteDisabledRow = (event, row) => {
  highlightedRow.value = row.uniqueKey
  
  if(route.name !== 'Trash'){
    store.commit("setActiveEntity", row)
    emitter.emit("remove")
    event.stopPropagation()
    return
  }
  
  store.commit("setActiveEntity", row)
  emitter.emit("d")
  event.stopPropagation()
}

function onThumbnailError(event, row) {
  event.target.src = getThumbnailUrl(row.name, row.file_type)[1]
}

const formattedRows = computed(() => {
  if (!props.folderContents) return []
  
  // Handle paginated response (when API returns {data: [...], total: 123})
  if (props.folderContents && typeof props.folderContents === 'object' && 'data' in props.folderContents) {
    return props.folderContents.data || []
  }
  
  if (Array.isArray(props.folderContents)) {
    console.log("Folder contents is an array:", props.folderContents)
    return props.folderContents
  }

  return Object.keys(props.folderContents).flatMap(
    (k) => props.folderContents[k] || []
  )
})

// Sort rows based on local sort state
const sortedRows = computed(() => {
  if (!localSortField.value || !localSortOrder.value) {
    return formattedRows.value
  }
  
  const rows = [...formattedRows.value]
  const field = localSortField.value
  const order = localSortOrder.value // 1 = ascending, -1 = descending
  
  rows.sort((a, b) => {
    let aVal = a[field]
    let bVal = b[field]
    
    // Handle special fields
    if (field === 'title') {
      aVal = a.is_shortcut ? a.shortcut_title : a.title
      bVal = b.is_shortcut ? b.shortcut_title : b.title
    } else if (field === 'file_size_pretty') {
      aVal = a.file_size || 0
      bVal = b.file_size || 0
    } else if (field === 'team_name') {
      aVal = a.team_name || ''
      bVal = b.team_name || ''
    } else if (field === 'accessed') {
      // Convert to timestamp for comparison
      aVal = a.accessed ? new Date(a.accessed).getTime() : 0
      bVal = b.accessed ? new Date(b.accessed).getTime() : 0
    } else if (field === 'modified') {
      aVal = a.modified ? new Date(a.modified).getTime() : 0
      bVal = b.modified ? new Date(b.modified).getTime() : 0
    }
    
    // Handle null/undefined values
    if (aVal == null) aVal = ''
    if (bVal == null) bVal = ''
    
    // Compare values
    let comparison = 0
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      // Case-insensitive string comparison
      comparison = aVal.toLowerCase().localeCompare(bVal.toLowerCase(), 'vi')
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal
    } else {
      // Fallback: convert to string
      comparison = String(aVal).localeCompare(String(bVal), 'vi')
    }
    
    return order === 1 ? comparison : -comparison
  })
  
  return rows
})

// Computed totalRecords - ALWAYS use props.totalRecords when available, never fallback to formattedRows.length
// because formattedRows.length is just the current page data, not the total
const computedTotalRecords = computed(() => {
  // Use props.totalRecords if provided (from API), otherwise 0
  const total = Number(props.totalRecords) || 0
  
  console.log("ListView computedTotalRecords:", {
    propsTotalRecords: props.totalRecords,
    computedTotal: total,
    pageSize: pageSize.value,
    currentRowsLength: formattedRows.value.length,
    shouldHaveNext: total > pageSize.value
  })
  
  return total
})

// Data display methods
const getDisplayName = (row) => {
  if (row.is_shortcut) {
    if (
      row.shortcut_title?.lastIndexOf(".") === -1 ||
      row.is_group ||
      row.document
    ) {
      return row.shortcut_title
    }
    return (
      row.shortcut_title?.slice(0, row.shortcut_title.lastIndexOf(".")) +
      row.shortcut_title?.slice(row.shortcut_title.lastIndexOf("."))
    )
  } else {
    if (row.title?.lastIndexOf(".") === -1 || row.is_group || row.document) {
      return row.title
    }
    return (
      row.title?.slice(0, row.title.lastIndexOf(".")) +
      row.title?.slice(row.title.lastIndexOf("."))
    )
  }
}

const getOwnerLabel = (row) => {
  if (row.owner === store.state.user.id) {
    return __("Bạn")
  }
  return row.owner_full_name || props.userData[row.owner]?.full_name || row.owner
}

const getShareIcon = (shareCount) => {
  if (shareCount === -2) return "pi pi-globe"
  else if (shareCount === -1) return "pi pi-building"
  else if (shareCount > 0) return "pi pi-users"
  return ""
}

const getShareText = (shareCount) => {
  if (shareCount === -2) return __("Công khai")
  else if (shareCount === -1) return __("Nhóm")
  else if (shareCount > 0) {
    return shareCount + " " + (shareCount === 1 ? __("người") : __("người"))
  }
  return __("-")
}

const getSizeText = (row) => {
  if (row.is_group) {
    return row.children
      ? row.children + " " + (row.children === 1 ? __("mục") : __("mục"))
      : __("Trống")
  }
  return row.file_size_pretty
}

// Event handlers
const onCellMouseEnter = (event, row) => {
  if (isRowDisabled(row)) {
    hoveredDisabledRow.value = row
    updateTooltipPosition(event)
  }
}

const onCellMouseMove = (event) => {
  if (hoveredDisabledRow.value) {
    updateTooltipPosition(event)
  }
}

const onCellMouseLeave = () => {
  hoveredDisabledRow.value = null
}

const updateTooltipPosition = (mouseEvent) => {
  const x = mouseEvent.clientX
  const y = mouseEvent.clientY

  tooltipStyle.value = {
    left: `${x + tooltipOffset}px`,
    top: `${y + tooltipOffset}px`,
  }
}

const handleMouseMove = (event) => {
  if (hoveredDisabledRow.value) {
    updateTooltipPosition(event)
  }
}

// Handle context menu close
const onContextMenuClose = () => {
  isContextMenuOpen.value = false
}

// Kiểm tra xem có dialog nào đang mở không
const hasActiveDialog = () => {
  const dialogSelectors = [
    '.p-dialog-mask',
    '.p-dialog',
    '[role="dialog"]',
    '.modal',
    '.v-dialog',
    '.el-dialog',
    '.frappe-dialog',
  ]
  
  return dialogSelectors.some(selector => {
    const element = document.querySelector(selector)
    return element && element.style.display !== 'none'
  })
}

// Handle click outside
const handleClickOutside = (event) => {
  nextTick(() => {
    if (isContextMenuOpen.value) return
    if (hasActiveDialog()) return
    
    const tableElement = document.querySelector('.file-table')
    const menuElement = groupedContextMenu.value?.$el
    const isClickInMenu = menuElement && menuElement.contains(event.target)
    const isClickOnDialog = event.target.closest('.p-dialog, [role="dialog"], .modal, .frappe-dialog')
    const isClickOnButton = event.target.closest('button, .p-button')
    
    if (highlightedRow.value && !isClickInMenu && !isClickOnDialog && !isClickOnButton) {
      if (tableElement && !tableElement.contains(event.target)) {
        highlightedRow.value = null
      }
    }
  })
}

// Watch for data changes and reapply sort if needed
watch(
  () => formattedRows.value,
  () => {
    // If sort is active, it will be automatically applied via sortedRows computed
    // This watch ensures sort state is maintained when new data arrives
    if (localSortField.value && localSortOrder.value) {
      console.log("Data changed, maintaining sort:", {
        field: localSortField.value,
        order: localSortOrder.value
      })
    }
  },
  { deep: false }
)

// Watch first to prevent reset when sort changes
let isSorting = false
let savedFirstOnSort = 0
watch(
  () => first.value,
  (newFirst, oldFirst) => {
    // Nếu đang sort và first bị reset về 0, restore lại ngay lập tức
    if (isSorting && newFirst === 0 && oldFirst > 0 && savedFirstOnSort > 0) {
      // Restore ngay lập tức, không đợi nextTick
      // Sử dụng requestAnimationFrame để đảm bảo chạy trước render
      requestAnimationFrame(() => {
        first.value = savedFirstOnSort
        console.log("⚠️ Prevented first reset during sort, restored to:", savedFirstOnSort)
        
        // Đảm bảo currentPage cũng được sync
        const expectedPage = Math.floor(savedFirstOnSort / pageSize.value) + 1
        if (currentPage.value !== expectedPage) {
          currentPage.value = expectedPage
          console.log("⚠️ Synced currentPage to:", expectedPage)
        }
      })
    }
  },
  { flush: 'sync' } // Sync mode để chạy ngay lập tức
)

onMounted(() => {
  window.addEventListener("resize", handleResize)
  window.addEventListener("mousemove", handleMouseMove)
  document.addEventListener("click", handleClickOutside, true)
  
  emitter.on("dialog-opened", () => {
    isContextMenuOpen.value = true
  })
  
  emitter.on("dialog-closed", () => {
    isContextMenuOpen.value = false
  })
  
  // Restore sort state from localStorage
  const savedSort = getLocalSort()
  if (savedSort.field && savedSort.order) {
    localSortField.value = savedSort.field
    localSortOrder.value = savedSort.order
    console.log("Restored sort state:", savedSort)
  }
})

onUnmounted(() => {
  window.removeEventListener("resize", handleResize)
  window.removeEventListener("mousemove", handleMouseMove)
  document.removeEventListener("click", handleClickOutside, true)
  
  emitter.off("dialog-opened")
  emitter.off("dialog-closed")
})

const onRowContextMenu = (event, row) => {
  if (selectedRows.value.length > 0) return
  if (isRowDisabled(row)) return
  // Disable context menu on Trash page
  if (isTrashPage.value) return
  if (event.ctrlKey) openEntity(route.params.team, row, true)

  selectedRow.value = row
  rowEvent.value = event
  highlightedRow.value = row.uniqueKey
  isContextMenuOpen.value = true
  
  store.commit("setContextMenuPosition", { 
    x: event.clientX + 10, 
    y: event.clientY 
  })

  if (groupedContextMenu.value) {
    groupedContextMenu.value.show(event)
  }

  event.stopPropagation()
  event.preventDefault()
}

const onRowClick = (event) => {
  const row = event?.data
  if (isRowDisabled(row)) return
  // Disable click on Trash page
  if (isTrashPage.value) return
  
  highlightedRow.value = row.uniqueKey
  selectedRow.value = row
  store.commit("setActiveEntity", row)
}

const onRowDoubleClick = (event) => {
  const row = event?.data
  if (isRowDisabled(row)) return
  // Disable double click on Trash page
  if (isTrashPage.value) return

  if (row && typeof row === "object" && row.name !== undefined) {
    const team = row.team || (route.params && route.params.team) || null
    openEntity(team, row, false, false)
  }
}

const onRowOptions = (event, row) => {
  if (isRowDisabled(row)) return
  
  selectedRow.value = row
  store.commit("setActiveEntity", row)
  highlightedRow.value = row.uniqueKey
  isContextMenuOpen.value = true

  rowEvent.value = event
  
  const rect = event.target.getBoundingClientRect()
  store.commit("setContextMenuPosition", { 
    x: rect.right + 10, 
    y: rect.top 
  })

  if (groupedContextMenu.value) {
    groupedContextMenu.value.show(event)
  }

  event.stopPropagation()
}

const getRowUniqueId = (row) => {
  return row.is_shortcut ? row.shortcut_name : row.name
}

const formattedRowsWithKeys = computed(() => {
  return formattedRows.value.map((row) => ({
    ...row,
    uniqueKey: getRowUniqueId(row),
  }))
})

// Sorted rows with keys for display
const sortedRowsWithKeys = computed(() => {
  return sortedRows.value.map((row) => ({
    ...row,
    uniqueKey: getRowUniqueId(row),
  }))
})

watch(selectedRows, (newSelections) => {
  const selectionSet = new Set(newSelections.map((row) => getRowUniqueId(row)))
  console.log(
    "Selection set:",
    selectionSet,
    "Selected rows:",
    selectedRows.value
  )

  selections.value = selectionSet
  if (newSelections.length === 0) {
    selectedRow.value = null
    store.commit("setActiveEntity", null)
  }
})

watch(selectedRow, (k) => {
  store.commit("setActiveEntity", k)
})

// Function để export mindmap sang định dạng nmm
const handleDownloadMindmap = async (entity) => {
  if (!entity || !entity.mindmap) {
    toast({ title: "Không tìm thấy mindmap", indicator: "red" })
    return
  }

  try {
    // Lấy dữ liệu mindmap từ API
    const mindmapData = await call("drive.api.mindmap.get_mindmap_data", {
      entity_name: entity.name
    })

    if (!mindmapData || !mindmapData.mindmap_data) {
      toast({ title: "Không thể lấy dữ liệu mindmap", indicator: "red" })
      return
    }

    const { nodes = [], edges = [], layout = "horizontal" } = mindmapData.mindmap_data

    // Tạo nextgrpData format
    const nextgrpData = {
      version: "1.0",
      format: "nextgrp",
      exported_at: new Date().toISOString(),
      mindmap: {
        title: mindmapData.title || entity.title || "Mindmap",
        nodes: nodes,
        edges: edges,
        layout: layout
      }
    }

    // Convert to JSON and download
    const jsonStr = JSON.stringify(nextgrpData, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    
    // Tạo tên file từ title, chỉ loại bỏ các ký tự không hợp lệ cho tên file
    // Giữ nguyên tên file gốc, case, và các ký tự hợp lệ
    const originalTitle = mindmapData.title || entity.title || "Mindmap"
    // Loại bỏ các ký tự không hợp lệ: / \ : * ? " < > |
    const sanitizedTitle = originalTitle.replace(/[\/\\:*?"<>|]/g, '_')
    link.download = `${sanitizedTitle}.nmm`
    link.href = blobUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
  } catch (error) {
    console.error("Export mindmap error:", error)
    toast({ title: "Lỗi khi tải xuống mindmap", indicator: "red" })
  }
}

const dropdownActionItems = (row) => {
  if (!row) return []

  const actionItems = props.actionItems
    .filter((a) => !a.isEnabled || a.isEnabled(row))
    .map((a) => {
      let isLoading = false
      if (a.label === "Tạo lối tắt") {
        isLoading = createShortcutResource?.loading || false
      }
      if (a.label === "Bỏ lối tắt") {
        isLoading = removeShortcutResource?.loading || false
      }

      return {
        ...a,
        originalAction: a.action,
        action: (entities) => {
          if (!["Tạo lối tắt", "Bỏ lối tắt"].includes(a.label)) {
            rowEvent.value = false
          }
          store.commit("setActiveEntity", row)
          if (typeof a.action === "function") {
            a.action(entities || [row])
          }
        },
        loading: isLoading,
      }
    })
  return actionItems
}

watch(
  () => createShortcutResource.loading,
  (newLoading, oldLoading) => {
    if (oldLoading === true && newLoading === false) {
      rowEvent.value = false
      isContextMenuOpen.value = false
    }
  }
)

watch(
  () => removeShortcutResource.loading,
  (newLoading, oldLoading) => {
    if (oldLoading === true && newLoading === false) {
      rowEvent.value = false
      isContextMenuOpen.value = false
    }
  }
)

// Keyboard shortcuts
onKeyDown("a", (e) => {
  if (
    e.target.classList.contains("ProseMirror") ||
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA"
  )
    return
  if (e.metaKey) {
    selectedRows.value = [...formattedRows.value]
    e.preventDefault()
  }
})

onKeyDown("Backspace", (e) => {
  if (
    e.target.classList.contains("ProseMirror") ||
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA"
  )
    return
  if (e.metaKey) emitter.emit("remove")
})

onKeyDown("m", (e) => {
  if (
    e.target.classList.contains("ProseMirror") ||
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA"
  )
    return
  if (e.ctrlKey) emitter.emit("move")
})

onKeyDown("Escape", (e) => {
  if (
    e.target.classList.contains("ProseMirror") ||
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA"
  )
    return
  selectedRows.value = []
  highlightedRow.value = null
  e.preventDefault()
})

// Handle page change
const onPageChange = (event) => {
  console.log("Page change event:", event)
  
  // Nếu đang sort và event này là do sort trigger (first = 0), ignore nó
  if (isSorting && event.first === 0 && savedFirstOnSort > 0) {
    console.log("⚠️ Ignoring page change during sort, restoring saved state")
    // Restore lại state đã lưu
    first.value = savedFirstOnSort
    currentPage.value = Math.floor(savedFirstOnSort / pageSize.value) + 1
    return
  }
  
  // PrimeVue uses 0-based index, API uses 1-based
  currentPage.value = event.page + 1
  pageSize.value = event.rows
  first.value = event.first
  
  console.log("Emitting page-change:", {
    page: currentPage.value,
    pageSize: pageSize.value,
  })
  
  emit("page-change", {
    page: currentPage.value,
    pageSize: pageSize.value,
  })
  
  // Scroll to top when page changes
  nextTick(() => {
    const tableContainer = document.querySelector('.table-container')
    if (tableContainer) {
      tableContainer.scrollTop = 0
    }
  })
}

// Handle sort change - frontend sorting only
const onSort = (event) => {
  console.log("Sort event:", event)
  
  // Lưu trang hiện tại trước khi sort để giữ nguyên sau khi sort
  // CRITICAL: Tính first từ currentPage vì first.value có thể đã bị reset về 0
  const savedPage = currentPage.value
  // Tính first từ page: first = (page - 1) * pageSize
  const calculatedFirst = (savedPage - 1) * pageSize.value
  // Ưu tiên dùng first.value nếu nó hợp lệ (> 0), nếu không thì tính từ page
  const savedFirst = first.value > 0 ? first.value : calculatedFirst
  
  console.log("Before sort - saved state:", {
    page: savedPage,
    first: savedFirst,
    calculatedFirst: calculatedFirst,
    currentFirst: first.value
  })
  
  // Set flag để watch biết đang sort
  isSorting = true
  savedFirstOnSort = savedFirst
  
  // PrimeVue sort event: {sortField, sortOrder}
  // sortOrder: 1 = ascending, -1 = descending, 0 = no sort
  if (event.sortField) {
    localSortField.value = event.sortField
    localSortOrder.value = event.sortOrder || 1
    
    // Save to localStorage to persist across page changes
    setLocalSort(event.sortField, event.sortOrder || 1)
    
    console.log("Local sort updated:", {
      field: localSortField.value,
      order: localSortOrder.value,
      savedPage: savedPage,
      savedFirst: savedFirst
    })
  } else {
    // Clear sort
    localSortField.value = null
    localSortOrder.value = null
    setLocalSort(null, null)
  }
  
  // CRITICAL: Prevent DataTable from resetting pagination
  // Restore ngay lập tức trước khi DataTable có cơ hội reset
  if (savedPage > 1) {
    // Use requestAnimationFrame để đảm bảo chạy trước khi DataTable render
    requestAnimationFrame(() => {
      first.value = savedFirst
      currentPage.value = savedPage
      console.log("RAF restore:", {
        first: first.value,
        page: currentPage.value,
        savedFirst: savedFirst
      })
    })
  }
  
  // Restore lại trang sau khi sort (DataTable có thể tự động reset về trang 1)
  nextTick(() => {
    if (savedPage > 1) {
      // Force update lại để đảm bảo DataTable nhận được giá trị đúng
      first.value = savedFirst
      currentPage.value = savedPage
      
      console.log("NextTick restore:", {
        first: first.value,
        page: currentPage.value
      })
      
      // Force update pagination bằng cách update DOM trực tiếp
      nextTick(() => {
        // Tìm pagination buttons và active page
        const paginator = document.querySelector('.p-paginator')
        if (paginator) {
          // Remove active class từ tất cả pages
          const pageLinks = paginator.querySelectorAll('.p-paginator-page')
          pageLinks.forEach(link => {
            link.classList.remove('p-highlight')
          })
          
          // Add active class cho page đúng
          const targetPageLink = Array.from(pageLinks).find(link => {
            const pageNum = parseInt(link.textContent.trim())
            return pageNum === savedPage
          })
          
          if (targetPageLink) {
            targetPageLink.classList.add('p-highlight')
            console.log("✅ Manually activated page", savedPage, "in pagination")
          } else {
            // Nếu không tìm thấy, thử tìm bằng cách khác
            const pageInput = paginator.querySelector('input[type="number"]')
            if (pageInput) {
              pageInput.value = savedPage
              pageInput.dispatchEvent(new Event('change', { bubbles: true }))
            }
          }
        }
        
        // Đảm bảo first value vẫn đúng
        first.value = savedFirst
        currentPage.value = savedPage
        console.log("Force update pagination:", {
          first: first.value,
          page: currentPage.value
        })
      })
    }
    
    // Reset flag sau khi sort xong
    setTimeout(() => {
      isSorting = false
      savedFirstOnSort = 0
    }, 300)
  })
  
  // Triple check sau một delay ngắn để đảm bảo
  setTimeout(() => {
    if (savedPage > 1) {
      // Tính lại first từ savedPage để đảm bảo đúng
      const expectedFirst = (savedPage - 1) * pageSize.value
      if (first.value !== expectedFirst) {
        first.value = expectedFirst
        currentPage.value = savedPage
        
        // Force update DataTable pagination nếu có ref
        if (dataTableRef.value) {
          // Access internal paginator và force update
          const paginator = dataTableRef.value.$el?.querySelector('.p-paginator')
          if (paginator) {
            // Trigger update bằng cách dispatch event hoặc force re-render
            const firstInput = paginator.querySelector('input[type="number"]')
            if (firstInput) {
              firstInput.value = savedPage
              firstInput.dispatchEvent(new Event('input', { bubbles: true }))
            }
          }
        }
        
        console.log("Final restore after delay:", {
          first: first.value,
          page: currentPage.value
        })
      }
    }
  }, 100)
}
</script>

<style scoped>
/* Highlighted Row - priority cao nhất */
:deep(.highlighted-row) {
  background-color: #dbeafe !important;
}

:deep(.highlighted-row > td) {
  background-color: #dbeafe !important;
}

:deep(.p-datatable-header-cell:first-child > div) {
  @apply justify-center;
}

.file-manager-container {
  @apply flex flex-col h-full bg-white;
  min-height: 0;
}

.table-container {
  @apply flex-1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.file-table {
  @apply min-w-[600px];
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Đảm bảo DataTable sử dụng flex layout đúng cách */
:deep(.p-datatable) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Table wrapper có thể scroll */
:deep(.p-datatable-wrapper) {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

/* Paginator cố định ở dưới */
:deep(.p-paginator) {
  flex-shrink: 0;
  border-top: 1px solid #e5e7eb;
}

.disabled-row {
  @apply opacity-50 text-gray-400;
}

:deep(.disabled-row-bg) {
  @apply bg-gray-50 cursor-not-allowed;
}

:deep(.disabled-row-bg:hover) {
  @apply bg-gray-50 !important;
}

.disabled-badge {
  @apply text-xs text-red-500 ml-2 font-normal;
}

.name-cell {
  @apply flex items-center gap-3 min-w-0 w-full;
}

.file-icon {
  @apply w-[24px] h-[24px] flex-shrink-0 rounded-[2px];
  object-fit: contain;
}

.file-name-wrapper {
  @apply text-sm font-medium text-gray-900;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  max-width: 400px;
  min-width: 0;
}

.file-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1 1 auto;
  min-width: 0;
}

.owner-cell {
  @apply flex items-center gap-2;
}

.owner-name {
  @apply text-sm text-gray-700;
}

.shared-cell {
  @apply flex items-center gap-2;
}

.share-icon {
  @apply w-4 h-4 text-gray-500;
}

.options-btn {
  @apply p-1 rounded hover:bg-gray-100 w-6 sm:w-8;
}

:deep(.p-checkbox-input) {
  @apply min-w-[20px] max-w-[20px] min-h-[20px] max-h-[20px] rounded-[4px];
}

:deep(.p-datatable) {
  @apply border-0;
}

:deep(.p-datatable-header) {
  @apply bg-white border-b border-gray-200 p-0;
}

:deep(.p-datatable-thead > tr > th) {
  @apply bg-white border-b border-gray-200 text-gray-600 font-medium text-sm py-3 px-4;
}

:deep(.p-datatable-tbody > tr) {
  @apply border-b border-gray-100 hover:bg-gray-50 transition-colors !h-12 cursor-pointer;
}

:deep(.p-datatable-tbody > tr > td) {
  @apply py-2 px-4 text-sm;
}

:deep(.p-datatable-tbody > tr.p-highlight) {
  @apply bg-blue-50;
}

:deep(.p-checkbox) {
  @apply !w-[20px] !h-[20px];
}

:deep(.p-checkbox .p-checkbox-box) {
  @apply border-gray-300 min-w-[20px] max-w-[20px] min-h-[20px] max-h-[20px] rounded-[4px];
}

:deep(.p-checkbox .p-checkbox-box.p-highlight) {
  @apply bg-blue-600 border-blue-600;
}

  /* Responsive adjustments - chỉ điều chỉnh kích thước, KHÔNG ẩn cột */
  @media (max-width: 1024px) {
    .name-cell {
      max-width: 220px;
    }
    .file-name-wrapper {
      max-width: 140px;
    }
    .file-name-text {
      font-size: 13px;
    }
}

@media (max-width: 768px) {
  .file-table {
    @apply min-w-[400px];
  }
    .file-name-wrapper {
      max-width: 90px;
    }
    .file-name-text {
      @apply text-xs;
      font-size: 12px;
    }
  .owner-name {
    @apply text-xs;
  }
  .name-cell {
    @apply gap-2;
    max-width: 160px;
  }
  .file-container {
    width: 24px;
    height: 24px;
  }
  .file-icon {
    @apply w-[24px] h-[24px];
    object-fit: contain;
  }
}

@media (max-width: 480px) {
  .name-cell {
    max-width: 230px;
  }
  .file-table {
    @apply min-w-[320px];
  }
    .file-name-wrapper {
      max-width: 230px;
    }
    .file-name-text {
      @apply text-[11px];
      font-size: 11px;
    }
  .owner-name {
    @apply text-[11px];
  }
  .options-btn {
    @apply p-0;
  }
}

:deep(.p-datatable-loading-overlay) {
  @apply bg-white bg-opacity-75;
}

:deep(.p-datatable-emptymessage) {
  @apply text-center py-8 text-gray-500;
}

.file-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.file-container img{
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
}

.shortcut-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  color: #007bff;
  background-color: white;
  border-radius: 8px;
  padding: 1px;
}

.shortcut-badge i {
  font-size: 8px;
}

.pinned-icon {
  color: #f59e0b;
  flex-shrink: 0 !important;
  flex-grow: 0 !important;
  animation: fadeIn 0.2s ease-in;
  width: 16px !important;
  height: 16px !important;
  min-width: 16px !important;
  min-height: 16px !important;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.custom-tooltip {
  position: fixed;
  background-color: white;
  color: black;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  z-index: 9999;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid #e5e7eb;
  max-width: 300px;
  word-wrap: break-word;
}

.row-hover-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  pointer-events: all;
}

:deep(.p-datatable-tbody > tr > td:first-child) {
  position: relative;
}
</style>