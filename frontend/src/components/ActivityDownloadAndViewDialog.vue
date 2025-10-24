<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showModal"
        class="fixed inset-0 z-[100] overflow-y-auto"
        @click.self="handleClose"
      >
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-black bg-opacity-50"></div>

        <!-- Dialog -->
        <div class="flex min-h-full items-center justify-center p-4">
          <Transition
            enter-active-class="transition ease-out duration-200"
            enter-from-class="opacity-0 scale-95"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition ease-in duration-150"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-95"
          >
            <div
              v-if="showModal"
              class="relative bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col"
              @click.stop
            >
              <!-- Header -->
              <div class="flex items-center justify-between px-6 py-4 border-b">
                <h3 class="text-xl font-semibold text-gray-900">
                  Lịch sử truy cập
                </h3>
                <button
                  @click="handleClose"
                  class="text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
                >
                  <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <!-- Body -->
              <div class="flex-1 overflow-y-auto">
                <!-- Loading State -->
                <div v-if="loading" class="flex justify-center py-12">
                  <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>

                <!-- Error State -->
                <div v-else-if="error" class="text-red-600 text-center py-8 px-6">
                  <svg class="mx-auto h-12 w-12 text-red-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p class="text-base">{{ error }}</p>
                </div>

                <!-- Table -->
                <div v-else-if="logs.length > 0">
                  <table class="min-w-full">
                    <thead class="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                          STT
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tên cán bộ
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Phòng ban
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Hành động
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Thời gian
                        </th>
                      </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                      <tr 
                        v-for="(log, index) in logs" 
                        :key="log.name" 
                        class="hover:bg-gray-50 transition-colors"
                      >
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {{ (pagination.current_page - 1) * pagination.per_page + index + 1 }}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                          <div class="flex items-center">
                            <img
                              v-if="log.image"
                              :src="log.image"
                              class="h-10 w-10 rounded-full object-cover"
                              :alt="log.owner"
                            />
                            <div
                              v-else
                              class="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold"
                            >
                              {{ getInitials(log.owner) }}
                            </div>
                            <span class="ml-3 text-sm font-medium text-gray-900">
                              {{ log.owner }}
                            </span>
                          </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {{ log.position || '-' }}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                          <span
                            v-if="log.activity_type === 'download'"
                            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                          >
                            Tải xuống
                          </span>
                          <span
                            v-else-if="log.activity_type === 'view'"
                            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            Xem
                          </span>
                          <span
                            v-else
                            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"
                          >
                            Sửa
                          </span>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {{ formatDate(log.timestamp) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <!-- Empty State -->
                <div v-else class="text-center py-12 px-6">
                  <svg class="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p class="text-base text-gray-500">Không có dữ liệu</p>
                </div>
              </div>

              <!-- Footer with Pagination -->
              <div v-if="logs.length > 0" class="border-t border-gray-200 bg-gray-50 px-6 py-4">
                <div class="flex items-center justify-between">
                  <div class="text-sm text-gray-700">
                    Hiển thị
                    <span class="font-medium">{{ (pagination.current_page - 1) * pagination.per_page + 1 }}</span>
                    đến
                    <span class="font-medium">{{ Math.min(pagination.current_page * pagination.per_page, pagination.total_count) }}</span>
                    trong tổng số
                    <span class="font-medium">{{ pagination.total_count }}</span>
                    kết quả
                  </div>
                  <div>
                    <nav class="isolate inline-flex -space-x-px rounded-md shadow-sm">
                      <button
                        @click="previousPage"
                        :disabled="!pagination.has_previous"
                        class="relative inline-flex items-center rounded-l-md px-3 py-2 text-sm font-medium text-gray-700 bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-100 focus:z-20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
                      >
                        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                        </svg>
                        <span class="ml-1">Trước</span>
                      </button>
                      <span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 bg-white ring-1 ring-inset ring-gray-300">
                        {{ pagination.current_page }} / {{ pagination.total_pages }}
                      </span>
                      <button
                        @click="nextPage"
                        :disabled="!pagination.has_next"
                        class="relative inline-flex items-center rounded-r-md px-3 py-2 text-sm font-medium text-gray-700 bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-100 focus:z-20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
                      >
                        <span class="mr-1">Sau</span>
                        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { call } from "frappe-ui"
import { computed, ref, watch } from "vue"
import { useStore } from "vuex"

const props = defineProps({
  modelValue: {
    type: [Boolean, String],
    default: false,
  },
})

const emit = defineEmits(["update:modelValue", "success"])
const store = useStore()

const showModal = computed(() => props.modelValue === "activity_download_and_view")

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

const fetchLogs = async () => {
  const activeEntity = store.state.activeEntity
  if (!activeEntity) {
    error.value = "Không tìm thấy entity"
    return
  }

  loading.value = true
  error.value = null

  try {
    const response = await call("drive.api.activity.list_activity_download_view_logs", {
      entity_name: activeEntity.name,
      order_by: "timestamp desc",
      limit: 20,
      page: pagination.value.current_page,
    })

    logs.value = response.data
    pagination.value = response.pagination
  } catch (e) {
    error.value = e.message || "Có lỗi xảy ra khi tải dữ liệu"
    console.error("Error fetching logs:", e)
  } finally {
    loading.value = false
  }
}

const nextPage = () => {
  if (pagination.value.has_next) {
    pagination.value.current_page++
    fetchLogs()
  }
}

const previousPage = () => {
  if (pagination.value.has_previous) {
    pagination.value.current_page--
    fetchLogs()
  }
}

const getInitials = (name) => {
  if (!name) return "?"
  const parts = name.trim().split(" ")
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
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
  showModal,
  (newVal) => {
    if (newVal) {
      pagination.value.current_page = 1
      fetchLogs()
    }
  },
  { immediate: true }
)
</script>