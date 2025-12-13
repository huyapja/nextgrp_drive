<template>
  <div v-if="visible" class="task-link-overlay" @click.self="$emit('close')">
    <div class="task-link-modal">
      <div class="task-link-header">
        <div class="min-w-[0px]">
          <p class="task-link-title">Liên kết công việc cho nhánh</p>
          <p class="task-link-subtitle truncate">{{ nodeTitle }}</p>
        </div>
        <button class="task-link-close" @click="$emit('close')">✕</button>
      </div>

      <div class="task-link-tabs">
        <button
          :class="['task-link-tab', { active: mode === 'existing' }]"
          @click="$emit('update:mode', 'existing')"
        >
          Chọn công việc có sẵn
        </button>
        <button
          :class="['task-link-tab', { active: mode === 'from-node' }]"
          @click="$emit('update:mode', 'from-node')"
        >
          Tạo mới công việc
        </button>
      </div>

      <div class="task-link-main">
        <template v-if="mode === 'existing'">
          <div class="task-link-body task-list-box">
            <div class="task-list-content">
            <div class="task-filter-row">
              <input
                v-model="searchModel"
                class="task-link-search"
                type="text"
                placeholder="Tìm tên công việc..."
              />
              <div class="task-project-select" ref="projectSelectRef">
                <button type="button" class="project-select-trigger" @click="toggleProjectDropdown">
                  <span class="project-select-label">{{ currentProjectLabel }}</span>
                  <span
                    class="project-select-caret"
                    :class="{ open: projectDropdownOpen }"
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 8L10 13L15 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                </button>
                <div v-if="projectDropdownOpen" class="overflow-hidden rounded-md">
                  <div class="project-select-menu overflow-hidden rounded-md">
                    <div
                      class="project-select-item"
                      :class="{ active: projectFilter === 'all' }"
                      @click="selectProject('all')"
                    >
                      Tất cả dự án
                    </div>
                    <div
                      v-for="p in projectOptionsComputed"
                      :key="p.value"
                      class="project-select-item"
                      :class="{ active: projectFilter === p.value }"
                      @click="selectProject(p.value)"
                    >
                      {{ p.label }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
  
              <div class="task-list mt-2">
                <div
                  v-for="task in tasks"
                  :key="task.id"
                  class="task-item"
                  :class="{ selected: selectedTaskId === task.id }"
                  @click="$emit('update:selectedTaskId', task.id)"
                >
                  <label class="task-item-radio">
                    <input type="radio" :value="task.id" :checked="selectedTaskId === task.id" />
                  </label>
                  <div class="task-item-info">
                    <div class="task-item-title">{{ task.task_name }}</div>
                    <div class="task-item-meta">
                      <span class="task-code" v-if="task.project_name || task.project">{{ task.project_name || task.project }}</span>
                      <span class="task-assignee">
                        {{ task.office_name || task.assignee }}
                      </span>
                      <span class="task-status" :class="getStatusClass(task.status)">{{ task.status }}</span>
                    </div>
                  </div>
                </div>
  
                <div v-if="!tasks || tasks.length === 0" class="task-empty">Không tìm thấy công việc phù hợp.</div>
              </div>
            </div>
            <div class="flex flex-row justify-end w-full">
              <div class="task-pagination">
                <button class="task-page-btn" :disabled="page <= 1" @click="$emit('update:page', page - 1)">‹</button>
              <div class="task-page-numbers">
                  <button
                  v-for="(p, idx) in pageButtons"
                  :key="idx"
                  v-if="p !== '…'"
                  class="task-page-btn"
                  :class="{ active: p === page }"
                  @click="$emit('update:page', p)"
                  >
                    {{ p }}
                  </button>
                <span
                  v-else
                  class="task-page-ellipsis"
                >…</span>
                </div>
                <button class="task-page-btn" :disabled="page >= totalPages" @click="$emit('update:page', page + 1)">›</button>
              </div>
            </div>
          </div>
          <div class="task-link-body mt-2 shrink-0">
            <label class="task-link-checkbox">
              <input type="checkbox" :checked="attachLink" @change="$emit('update:attachLink', $event.target.checked)" />
              <span class="text-black text-[14px]">Gắn link công việc (tuỳ chọn)</span>
            </label>
            <p class="text-gray-600 text-[14px]">Liên kết này sẽ được lưu kèm vào nhánh để mở nhanh công việc từ sơ đồ tư duy</p>
          </div>
        </template>

        <template v-else>
          <div class="task-link-body flex-1">
            <div class="task-create-card">
              <p class="task-create-title">Tạo công việc mới từ node</p>
              
            </div>
          </div>
        </template>
      </div>

      <div class="task-link-footer" v-if="mode === 'existing'">
        <button class="task-link-btn cancel" @click="$emit('close')">Hủy</button>
        <button
          class="task-link-btn primary"
          :disabled="!selectedTaskId"
          @click="$emit('confirm')"
        >
          Liên kết
        </button>
      </div>
      <div v-else class="task-link-footer">
        <button class="task-link-btn cancel" @click="$emit('close')">Hủy</button>
        <button
          class="task-link-btn primary"
          :disabled="!selectedTaskId"
          @click="$emit('confirm')"
        >
          Tạo công việc
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  visible: Boolean,
  nodeTitle: {
    type: String,
    default: ''
  },
  mode: {
    type: String,
    default: 'existing'
  },
  search: {
    type: String,
    default: ''
  },
  tasks: {
    type: Array,
    default: () => []
  },
  selectedTaskId: {
    type: String,
    default: null
  },
  attachLink: {
    type: Boolean,
    default: false
  },
  linkUrl: {
    type: String,
    default: ''
  },
  projectFilter: {
    type: String,
    default: 'all'
  },
  projectOptions: {
    type: Array,
    default: () => []
  },
  page: {
    type: Number,
    default: 1
  },
  totalPages: {
    type: Number,
    default: 1
  }
})

const emit = defineEmits([
  'close',
  'confirm',
  'update:mode',
  'update:search',
  'update:selectedTaskId',
  'update:attachLink',
  'update:linkUrl',
  'update:projectFilter',
  'update:page'
])

const searchModel = computed({
  get: () => props.search,
  set: (val) => emit('update:search', val)
})

const pageButtons = computed(() => {
  const total = Math.max(1, props.totalPages || 1)
  const current = Math.min(Math.max(1, props.page || 1), total)
  const pages = []

  const add = (val) => pages.push(val)

  if (total <= 7) {
    for (let i = 1; i <= total; i++) add(i)
    return pages
  }

  add(1)

  const windowStart = Math.max(2, current - 1)
  const windowEnd = Math.min(total - 1, current + 1)

  if (windowStart > 2) add('…')

  for (let i = windowStart; i <= windowEnd; i++) add(i)

  if (windowEnd < total - 1) add('…')

  add(total)

  return pages
})

const projectDropdownOpen = ref(false)
const projectSelectRef = ref(null)

const projectOptionsComputed = computed(() => {
  return (props.projectOptions || []).map((p) =>
    typeof p === 'string' ? { value: p, label: p } : p
  )
})

const currentProjectLabel = computed(() => {
  const found = projectOptionsComputed.value.find((p) => p.value === props.projectFilter)
  return found?.label || 'Tất cả dự án'
})

const toggleProjectDropdown = () => {
  projectDropdownOpen.value = !projectDropdownOpen.value
}

const selectProject = (val) => {
  projectDropdownOpen.value = false
  emit('update:projectFilter', val)
}

const handleClickOutside = (e) => {
  if (!projectDropdownOpen.value) return
  const el = projectSelectRef.value
  if (el && !el.contains(e.target)) {
    projectDropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})

const getStatusClass = (status) => {
  const statusLower = (status || '').toLowerCase()
  if (statusLower.includes('hoàn thành') || statusLower.includes('completed')) {
    return 'status-green'
  } else if (statusLower.includes('thực hiện') || statusLower.includes('in progress')) {
    return 'status-blue'
  } else if (statusLower.includes('tạm dừng') || statusLower.includes('paused')) {
    return 'status-yellow'
  } else if (statusLower.includes('huỷ') || statusLower.includes('cancel')) {
    return 'status-red'
  } else if (statusLower.includes('chờ phê duyệt') || statusLower.includes('pending approval')) {
    return 'status-purple'
  } else if (statusLower.includes('được tạo') || statusLower.includes('to do')) {
    return 'status-gray'
  }
  return 'status-gray'
}
</script>

<style scoped>
.project-select-label{
  font-weight: 400;
  font-size: 14px;
  color: #111827;
}

.task-link-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.task-link-modal {
  width: 860px; 
  height: 90vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.15);
  padding: 20px;
}

.task-link-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-link-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.task-link-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.task-link-subtitle {
  margin: 4px 0 0 0;
  color: #6b7280;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-link-close {
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  color: #6b7280;
}

.task-link-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 12px;
  justify-content: flex-start;
  border: 0.5px solid #d1d5db;
  background: #f8fafc;
  width: fit-content;
  border-radius: 10px;
  padding: 6px;
}

.task-link-tab {
  flex: 0 0 auto;
  padding: 8px 12px;
  min-width: 170px;
  background: #f8fafc;
  cursor: pointer;
  font-weight: 400;
  font-size: 14px;
  color: #374151;
  border-radius: 10px;
  overflow: hidden;
  border: none;
}

.task-link-tab.active {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

.task-link-tab:last-child {
  margin-left: -1px;
}

.task-link-body {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px;
}

.task-list-box {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-list-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-filter-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.task-project-select {
  position: relative;
  min-width: 200px;
}

.project-select-trigger {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.project-select-trigger:focus,
.project-select-trigger:focus-visible {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.project-select-caret {
  font-size: 14px;
  color: #6b7280;
  display: inline-flex;
  transition: transform 0.15s ease;
}

.project-select-caret.open {
  transform: rotate(180deg);
}
.project-select-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
  z-index: 2000;
  max-height: 260px;
  overflow: auto;
  padding: 6px 0;
}

.project-select-item {
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 400;
  color: #111827;
  font-size: 15px;
}

.project-select-item:hover {
  background: #f3f4f6;
}

.project-select-item.active {
  background: #e8f0ff;
  color: #1d4ed8;
}

.task-link-search {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  margin-bottom: 12px;
}

.task-filter-row .task-link-search {
  margin-bottom: 0;
  flex: 1;
}

.task-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 0;
}

.task-item {
  display: flex;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
}

.task-item.selected {
  border-color: #3b82f6;
  background: #eff6ff;
}

.task-item-radio {
  display: flex;
  align-items: center;
}

.task-item-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.task-item-title {
  font-weight: 500;
  font-size: 14px;
  color: #111827;
}

.task-item-meta {
  display: flex;
  gap: 8px;
  color: #6b7280;
  font-size: 13px;
  align-items: center;
}

.task-code {
  font-size: 12px;
  font-weight: 600;
  color: #2563eb;
}

.task-assignee {
  font-size: 12px;
  padding-left: 8px;
  border-left: 1px solid #e5e7eb;
}

.task-status {
  padding: 1px 6px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #374151;
  font-size: 10px;
}

.status-green {
  background: #ecfdf3;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.status-blue {
  background: #e0f2fe;
  color: #075985;
  border: 1px solid #bae6fd;
}

.status-yellow {
  background: #fef9c3;
  color: #854d0e;
  border: 1px solid #fde68a;
}

.status-red {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.status-purple {
  background: #f3e8ff;
  color: #6b21a8;
  border: 1px solid #e9d5ff;
}

.status-gray {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #e5e7eb;
}

.task-empty {
  text-align: center;
  color: #9ca3af;
  padding: 16px 0;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
  height: 100%;
}

.task-link-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #374151;
  margin-bottom: 8px;
  margin-top: 4px;
  width: fit-content;
}

.task-link-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
}

.task-pagination {
  display: flex;
  gap: 4px;
  align-items: center;
}

.task-page-numbers {
  display: flex;
  gap: 6px;
}

.task-page-btn {
  font-weight: 400;
  font-size: 14px;
  min-width: 28px;
  min-height: 28px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
}

.task-page-btn.active {
  background: #2563eb;
  color: #fff;
  border-color: #1d4ed8;
}

.task-page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-page-ellipsis {
  padding: 0 4px;
  color: #6b7280;
  user-select: none;
}

.task-create-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
}

.task-create-title {
  margin: 0;
  font-weight: 700;
  color: #111827;
}

.task-create-desc {
  margin: 4px 0 10px 0;
  color: #6b7280;
}

.task-create-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  background: #f3f4f6;
  margin-bottom: 12px;
}

.task-code-placeholder {
  padding: 4px 8px;
  border-radius: 6px;
  background: #e5e7eb;
  color: #374151;
  font-weight: 600;
  font-size: 12px;
}

.task-link-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.task-link-btn {
  min-width: 120px;
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 400;
}

.task-link-btn.cancel {
  background: #e5e7eb;
  color: #374151;
}

.task-link-btn.primary {
  background: #2563eb;
  color: white;
}

.task-link-btn.primary:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}
</style>

