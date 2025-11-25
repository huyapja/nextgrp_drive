<template>
  <div class="file-manager-container">
    <!-- Data Table -->
    <div class="table-container">
      <DataTable
        v-model:selection="selectedRows"
        :value="formattedRowsWithKeys"
        :loading="!folderContents"
        :paginator="false"
        :rows="1000"
        :scrollable="true"
        scrollHeight="flex"
        showGridlines
        class="file-table"
        dataKey="uniqueKey"
        @row-contextmenu="onRowContextMenu"
        @row-click="onRowClick"
        @row-dblclick="onRowDoubleClick"
        :rowClass="rowClass"
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
                <span class="file-name">{{
                getDisplayName(slotProps.data)
              }}</span>
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
                :image="userData[slotProps.data.owner]?.user_image"
                :label="userData[slotProps.data.owner]?.full_name.slice(0, 1)"
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
              <span class="owner-name">{{ slotProps.data.team_name }}</span>
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

// Directives
const vTooltip = Tooltip

const store = useStore()
const route = useRoute()
const props = defineProps({
  folderContents: Object,
  actionItems: Array,
  userData: Object,
})
const emit = defineEmits(["dropped"])

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
  if (Array.isArray(props.folderContents)) {
    console.log("Folder contents is an array:", props.folderContents)
    return props.folderContents
  }

  return Object.keys(props.folderContents).flatMap(
    (k) => props.folderContents[k] || []
  )
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
  return row.owner === store.state.user.id
    ? __("Bạn")
    : props.userData[row.owner]?.full_name || row.owner
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
}

.table-container {
  @apply flex-1 overflow-x-auto overflow-y-hidden;
}

.file-table {
  @apply h-fit min-w-[600px];
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
  @apply w-[18px] h-[18px] flex-shrink-0 rounded-[2px];
}

.file-name {
  @apply text-sm font-medium text-gray-900 truncate;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
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
  .file-name {
    max-width: 140px;
    font-size: 13px;
  }
}

@media (max-width: 768px) {
  .file-table {
    @apply min-w-[400px];
  }
  .file-name {
    @apply text-xs;
    max-width: 90px;
    font-size: 12px;
  }
  .owner-name {
    @apply text-xs;
  }
  .name-cell {
    @apply gap-2;
    max-width: 160px;
  }
  .file-icon {
    @apply w-[16px] h-[16px];
  }
}

@media (max-width: 480px) {
  .name-cell {
    max-width: 230px;
  }
  .file-table {
    @apply min-w-[320px];
  }
  .file-name {
    @apply text-[11px];
    max-width: 230px;
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
  display: inline-block;
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