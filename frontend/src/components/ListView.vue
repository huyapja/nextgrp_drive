<template>
  <div class="file-manager-container">
    <!-- Data Table -->
    <div class="table-container">
      <DataTable
        v-model:selection="selectedRows"
        :value="formattedRows"
        :loading="!folderContents"
        :paginator="false"
        :rows="1000"
        :scrollable="true"
        scrollHeight="flex"
        showGridlines
        class="file-table"
        dataKey="name"
        @row-contextmenu="onRowContextMenu"
        @row-click="onRowClick"
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
            <div class="name-cell">
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
              <span class="file-name">{{
                getDisplayName(slotProps.data)
              }}</span>
            </div>
          </template>
        </Column>

        <!-- Owner Column -->
        <Column
          field="owner"
          :header="__('Chủ sở hữu')"
          sortable
        >
          <template #body="slotProps">
            <div class="owner-cell">
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
          v-if="['Recents', 'Favourites', 'Trash', 'Shared'].includes($route.name)"
          field="team_name"
          :header="__('Nhóm')"
          sortable
        >
          <template #body="slotProps">
            <div class="owner-cell">
              <span class="owner-name">{{ slotProps.data.team_name }}</span>
            </div>
          </template>
        </Column>
        <!-- Days Remaining Column -->
        <Column
          v-if="$route.name === 'Trash'"
          field="days_remaining"
          :header="__('Ngày còn lại')"
          sortable
        >
          <template #body="slotProps">
            <span>{{ slotProps.data.days_remaining }}</span>
          </template>
        </Column>
        <!-- Shared Column -->
        <Column
          field="share_count"
          :header="__('Chia sẻ')"
          sortable
        >
          <template #body="slotProps">
            <div class="shared-cell">
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
          field="modified"
          :header="__('Sửa đổi lần cuối')"
          sortable
        >
          <template #body="slotProps">
            <span>{{ useTimeAgoVi(slotProps.data.modified) }}</span>
          </template>
        </Column>

        <!-- Size Column -->
        <Column
          field="file_size_pretty"
          :header="__('Kích thước')"
          sortable
        >
          <template #body="slotProps">
            <span>{{ getSizeText(slotProps.data) }}</span>
          </template>
        </Column>

        <!-- Options Column -->
        <Column bodyStyle="width: 2rem; text-align: center;">
          <template #body="slotProps">
            <Button
              icon="pi pi-ellipsis-v"
              text
              severity="secondary"
              class="options-btn"
              @click="onRowOptions($event, slotProps.data)"
            />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Context Menu -->
    <ContextMenu
      v-if="rowEvent && selectedRow"
      :key="selectedRow.name"
      v-on-outside-click="() => (rowEvent = false)"
      :close="() => (rowEvent = false)"
      :action-items="dropdownActionItems(selectedRow)"
      :event="rowEvent"
    />
  </div>
</template>

<script setup>
import DataTable from "primevue/datatable"
import Column from "primevue/column"
import Button from "primevue/button"
import Avatar from "primevue/avatar"
import { getThumbnailUrl } from "@/utils/getIconUrl"
import { useStore } from "vuex"
import { useRoute, useRouter } from "vue-router"
import { computed, ref, watch, onMounted, onUnmounted } from "vue"
import ContextMenu from "@/components/ContextMenu.vue"
import { openEntity } from "@/utils/files"
import { formatDate } from "@/utils/format"
import { onKeyDown } from "@vueuse/core"
import emitter from "@/emitter"
import { useTimeAgoVi } from "@/utils/useTimeAgoVi"
import CustomAvatar from "./CustomAvatar.vue"

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

// Handle window resize
const handleResize = () => {
  windowWidth.value = window.innerWidth
}

onMounted(() => {
  window.addEventListener("resize", handleResize)
})

onUnmounted(() => {
  window.removeEventListener("resize", handleResize)
})

function onThumbnailError(event, row) {
  // Fallback về icon mặc định nếu thumbnail lỗi
  event.target.src = getThumbnailUrl(row.name, row.file_type)[1]
}

const formattedRows = computed(() => {
  if (!props.folderContents) return []
  if (Array.isArray(props.folderContents)) {
    console.log("Folder contents is an array:", props.folderContents)
    return props.folderContents
  }

  // Handle grouped data
  return Object.keys(props.folderContents).flatMap(
    (k) => props.folderContents[k] || []
  )
})

// Data display methods
const getDisplayName = (row) => {
  if (row.title.lastIndexOf(".") === -1 || row.is_group || row.document) {
    return row.title
  }
  return row.title.slice(0, row.title.lastIndexOf("."))
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
      : __("trống")
  }
  return row.file_size_pretty
}

// Event handlers
const onRowContextMenu = (event, row) => {
  if (selectedRows.value.length > 0) return
  if (event.ctrlKey) openEntity(route.params.team, row, true)
  rowEvent.value = event
  selectedRow.value = row
  event.stopPropagation()
  event.preventDefault()
}

const onRowClick = (event) => {
  const row = event?.data
  console.log("Row clicked:", row)
  if (row && typeof row === "object" && row.name !== undefined) {
    // Truyền đúng tham số team nếu có
    const team = row.team || (route.params && route.params.team) || null
    openEntity(team, row)
  }
}

const onRowOptions = (event, row) => {
  rowEvent.value = event
  selectedRow.value = row
  event.stopPropagation()
}

// Watch for selection changes
watch(selectedRows, (newSelections) => {
  const selectionSet = new Set(newSelections.map((row) => row.name))
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
  return props.actionItems
    .filter((a) => !a.isEnabled || a.isEnabled(row))
    .map((a) => ({
      ...a,
      handler: () => {
        rowEvent.value = false
        store.commit("setActiveEntity", row)
        a.action([row])
      },
    }))
}

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
  e.preventDefault()
})
</script>
<style scoped>
:deep(.p-datatable-header-cell:first-child > div) {
  @apply justify-center;
}

.file-manager-container {
  @apply flex flex-col h-full bg-white;
}

/* Table Container */
.table-container {
  @apply flex-1 overflow-x-auto overflow-y-hidden;
  /* Cho phép cuộn ngang khi bảng quá rộng */
}

.file-table {
  @apply h-full min-w-[600px];
  /* Đảm bảo bảng không bị bóp nhỏ quá */
}

/* Table Cell Styling */
.name-cell {
  @apply flex items-center gap-3 min-w-0 w-full;
  max-width: 320px;
}

.file-icon {
  @apply w-[18px] h-[18px] flex-shrink-0 rounded-[2px];
}

.file-name {
  @apply text-sm font-medium text-gray-900 truncate;
  max-width: 320px;
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
  @apply p-1 rounded hover:bg-gray-100;
}

/* PrimeVue DataTable Customization */
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

@media (max-width: 1280px) {
  :deep(.p-datatable-thead > tr > th:nth-child(3)), /* Owner */
  :deep(.p-datatable-tbody > tr > td:nth-child(3)) {
    @apply hidden;
  }
}

/* Responsive Design */
/* Responsive: Ẩn các cột phụ trên tablet/mobile */
@media (max-width: 1024px) {
  :deep(.p-datatable-thead > tr > th:nth-child(4)), /* Shared */
  :deep(.p-datatable-tbody > tr > td:nth-child(4)),
  :deep(.p-datatable-thead > tr > th:nth-child(6)), /* Size */
  :deep(.p-datatable-tbody > tr > td:nth-child(6)),
  :deep(.p-datatable-thead > tr > th:nth-child(5)), /* Last Modified */
  :deep(.p-datatable-tbody > tr > td:nth-child(5)),
  :deep(.p-datatable-thead > tr > th:nth-child(3)), /* Owner */
  :deep(.p-datatable-tbody > tr > td:nth-child(3)) {
    @apply hidden;
  }
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
  :deep(.p-datatable-thead > tr > th:nth-child(3)), /* Owner */
  :deep(.p-datatable-tbody > tr > td:nth-child(3)) {
    @apply hidden;
  }
}

@media (max-width: 480px) {
  .name-cell {
    max-width: 110px;
  }
  .file-table {
    @apply min-w-[320px];
  }
  .file-name {
    @apply text-[11px];
    max-width: 60px;
    font-size: 11px;
  }
  .owner-name {
    @apply text-[11px];
  }
  .options-btn {
    @apply p-0;
  }
}

/* Loading State */
:deep(.p-datatable-loading-overlay) {
  @apply bg-white bg-opacity-75;
}

/* Empty State */
:deep(.p-datatable-emptymessage) {
  @apply text-center py-8 text-gray-500;
}
</style>
