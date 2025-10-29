<template>
  <Dialog
    v-model:visible="isVisible"
    modal
    :header="'Lịch sử truy cập'"
    :style="{ width: '90vw', maxWidth: '1000px' }"
    :dismissableMask="true"
    @hide="handleClose"
    :contentStyle="{ padding: '0', height: 'calc(772px - 80px)', display: 'flex', flexDirection: 'column' }"
  >
    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center items-center flex-1">
      <ProgressSpinner style="width: 50px; height: 50px" strokeWidth="4" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex justify-center items-center flex-1">
      <InlineMessage severity="error" class="w-full justify-center">
        {{ error }}
      </InlineMessage>
    </div>

    <!-- Data Table -->
    <div v-else-if="logs.length > 0" class="flex flex-col h-full">
      <div class="flex-1 overflow-auto">
        <DataTable
          :value="logs"
          :paginator="false"
          stripedRows
          :rowHover="true"
          responsiveLayout="scroll"
          showGridlines
          class="p-datatable-bordered"
          sortMode="single"
          :sortField="sortField"
          :sortOrder="sortOrder"
          @sort="onSort"
        >
          <Column field="index" header="STT" style="width: 60px; text-align: center">
            <template #body="slotProps">
              {{ (pagination.current_page - 1) * pagination.per_page + slotProps.index + 1 }}
            </template>
          </Column>

          <Column 
            field="officer_name" 
            header="Tên cán bộ" 
            :sortable="true"
            style="min-width: 200px"
          >
            <template #body="slotProps">
              <div class="flex items-center gap-3 truncate min-w-0 max-w-[200px]">
                <CustomAvatar
                  :image="slotProps.data.image"
                  :label="slotProps.data?.officer_name?.slice(0, 1)"
                  shape="circle"
                  size="small"
                  class="!min-w-[32px]"
                />
                <span class="font-medium truncate">{{ slotProps.data.officer_name }}</span>
              </div>
            </template>
          </Column>

          <Column 
            field="department_name" 
            header="Phòng ban" 
            :sortable="true"
            style="min-width: 150px"
          >
            <template #body="slotProps">
              {{ slotProps.data.department_name || '-' }}
            </template>
          </Column>

          <Column 
            field="action_type" 
            header="Hành động" 
            :sortable="true"
            style="width: 140px"
          >
            <template #body="slotProps">
              {{ slotProps.data.action_type }}
            </template>
          </Column>

          <Column 
            field="creation" 
            header="Thời gian" 
            :sortable="true"
            style="min-width: 90px"
          >
            <template #body="slotProps">
              {{ formatDate(slotProps.data.creation) }}
            </template>
          </Column>
        </DataTable>
      </div>

      <!-- Custom Pagination -->
    </div>
    <!-- Empty State -->
    <div v-else class="flex justify-center items-center flex-1">
      <div class="text-center">
        <i class="pi pi-inbox text-6xl text-gray-300 mb-4"></i>
        <p class="text-gray-500 text-lg">Không có dữ liệu</p>
      </div>
    </div>
    <div class="flex items-center justify-end border-t h-[60px] px-6 bg-white flex-shrink-0 rounded-b-md">
      <Paginator
        :first="(pagination.current_page - 1) * pagination.per_page"
        :rows="pagination.per_page"
        :totalRecords="pagination.total_count"
        @page="onPageChange"
        template="PrevPageLink CurrentPageReport NextPageLink"
        currentPageReportTemplate="Trang {currentPage} / {totalPages}"
      />
    </div>

  </Dialog>
</template>

<script setup>
import { call } from "frappe-ui"
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InlineMessage from 'primevue/inlinemessage'
import Paginator from 'primevue/paginator'
import ProgressSpinner from 'primevue/progressspinner'
import { computed, ref, watch } from "vue"
import { useStore } from "vuex"
import CustomAvatar from "./CustomAvatar.vue"

const props = defineProps({
  modelValue: {
    type: [Boolean, String],
    default: false,
  },
})

const emit = defineEmits(["update:modelValue", "success"])
const store = useStore()

const isVisible = computed({
  get: () => props.modelValue === "activity_download_and_view",
  set: (value) => {
    if (!value) {
      handleClose()
    }
  }
})

const handleClose = () => {
  emit("update:modelValue", false)
}

const logs = ref([])
const pagination = ref({
  current_page: 1,
  total_pages: 0,
  total_count: 0,
  per_page: 20,
  has_next: false,
  has_previous: false,
})
const loading = ref(false)
const error = ref(null)

// Sort state
const sortField = ref('creation')
const sortOrder = ref(-1) // -1 for descending, 1 for ascending

const fetchLogs = async () => {
  const activeEntity = store.state.activeEntity
  if (!activeEntity) {
    error.value = "Không tìm thấy entity"
    return
  }

  loading.value = true
  error.value = null

  try {
    // Build order_by string based on sort state
    const orderDirection = sortOrder.value === -1 ? 'desc' : 'asc'
    const orderBy = `${sortField.value} ${orderDirection}`

    const response = await call("drive.api.activity.list_activity_download_view_logs", {
      entity_name: activeEntity.name,
      order_by: orderBy,
      limit: 10,
      page: pagination.value.current_page,
    })

    logs.value = response.data
    console.log("Fetched logs:", logs.value)
    pagination.value = response.pagination
  } catch (e) {
    error.value = e.message || "Có lỗi xảy ra khi tải dữ liệu"
    console.error("Error fetching logs:", e)
  } finally {
    loading.value = false
  }
}

const onSort = (event) => {
  sortField.value = event.sortField
  sortOrder.value = event.sortOrder
  pagination.value.current_page = 1 // Reset to first page when sorting
  fetchLogs()
}

const onPageChange = (event) => {
  pagination.value.current_page = event.page + 1
  fetchLogs()
}

const formatDate = (timestamp) => {
  if (!timestamp) return "-"
  const date = new Date(timestamp)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  
  return `${day}/${month}/${year} - ${hours}:${minutes}`
}

watch(
  isVisible,
  (newVal) => {
    if (newVal) {
      pagination.value.current_page = 1
      // Reset sort to default when opening dialog
      sortField.value = 'creation'
      sortOrder.value = -1
      fetchLogs()
    }
  },
  { immediate: true }
)
</script>

<style scoped>
:deep(.p-dialog-header) {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

:deep(.p-dialog-content) {
  padding: 0;
  overflow: hidden;
}

:deep(.p-datatable-wrapper) {
  overflow-x: auto;
  max-height: 100%;
}

:deep(.p-datatable) {
  font-size: 0.875rem;
}

:deep(.p-datatable-thead > tr > th) {
  background-color: #fff !important;
  color: #6b7280;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.02em;
  padding: 0.75rem 1rem;
  border: 1px solid #e5e7eb;
}

:deep(.p-datatable-thead > tr > th.p-sortable-column) {
  cursor: pointer;
  user-select: none;
}

:deep(.p-datatable-thead > tr > th.p-sortable-column:hover) {
  background-color: #f9fafb !important;
}

:deep(.p-datatable-thead > tr > th .p-sortable-column-icon) {
  margin-left: 0.5rem;
  color: #9ca3af;
}

:deep(.p-datatable-thead > tr > th.p-highlight .p-sortable-column-icon) {
  color: #3b82f6;
}

:deep(.p-datatable-tbody > tr > td) {
  background-color: #fff !important;
  padding: 0.75rem 1rem;
  font-weight: 500;
  font-size: 13px;
  color: #171717 !important;
  border: 1px solid #e5e7eb;
}

:deep(.p-datatable-tbody > tr) {
  border-bottom: 1px solid #e5e7eb;
}

:deep(.p-paginator) {
  background: transparent;
  border: none;
  padding: 0;
}

:deep(.p-paginator .p-paginator-pages .p-paginator-page) {
  min-width: 2.5rem;
  height: 2.5rem;
}
</style>