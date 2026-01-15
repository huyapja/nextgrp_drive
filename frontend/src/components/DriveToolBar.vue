<template>
  <div class="drive-toolbar">
    <!-- Selection Info -->
    <div
      v-if="selections?.length"
      class="selection-info"
    >
      {{ selections.length }} {{ __("item")
      }}{{ selections.length === 1 ? "" : __("") }}
      {{ __("selected") }}
    </div>

    <!-- Shared View Tabs -->
    <div
      v-else-if="$route.name === 'Shared'"
      class="shared-tabs"
    >
      <TabButtons
        v-model="shareView"
        :buttons="[
          {
            label: __('By'),
            value: 'by',
            disabled: !hasData,
          },
          {
            label: __('With you'),
            value: 'with',
            disabled: !hasData,
          },
        ]"
      />
    </div>

    <!-- Search Bar -->
    <IconField
      v-else
      class="search-container p-inputtext p-component"
    >
      <InputIcon class="pi pi-search" />
      <InputText
        ref="search-input"
        v-model="search"
        :placeholder="__('Tìm kiếm')"
        class="search-input"
      />
    </IconField>

    <!-- Right Controls -->
    <div class="controls-container">
      <template v-if="selections && !selections.length">
        <!-- Filter Button -->
        <div class="relative filter-wrapper" ref="filter-wrapper">
          <Button
            icon="pi pi-filter"
            text
            severity="secondary"
            class="control-btn"
            :class="{ 'filter-active': activeFilters.length > 0 }"
            v-tooltip="__('Filter')"
            @click.stop="toggleFilterMenu"
          />
        </div>
        
        <!-- Desktop Filter Menu - Teleported to body -->
        <Teleport to="body">
          <div
            v-if="showFilterMenu && !isMobile"
            ref="filter-menu"
            class="filter-menu-teleported"
            :style="filterMenuPosition"
            @click.stop
          >
            <!-- Clear all button -->
            <div
              v-if="activeFilters.length > 0"
              class="filter-option filter-clear-all"
              @click.stop="clearAllFilters"
            >
              <span class="text-red-600 font-medium">{{ __('Bỏ chọn tất cả') }}</span>
              <span class="text-xs text-gray-500">({{ activeFilters.length }})</span>
            </div>
            <div v-if="activeFilters.length > 0" class="border-b border-gray-200 my-1"></div>
            
            <div
              v-for="option in filterOptions"
              :key="option.value"
              class="filter-option"
              @click.stop="toggleFilter(option.value)"
            >
              <div class="flex items-center w-full gap-1">
                <component
                  :is="option.icon"
                  class="filter-option-icon"
                />
                <span>{{ option.label }}</span>
              </div>
              <span class="filter-check">
                <svg
                  v-if="activeFilters.includes(option.value)"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                >
                  <circle
                    cx="9"
                    cy="9"
                    r="9"
                    fill="#0149C1"
                  />
                  <path
                    d="M5 9.5L8 12.5L13 7.5"
                    stroke="white"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span
                  v-else
                  class="filter-unchecked"
                ></span>
              </span>
            </div>
          </div>
        </Teleport>
          
        <!-- Mobile Filter Bottom Sheet -->
          <Dialog
            v-model:visible="showMobileFilterSheet"
            v-if="isMobile"
            :modal="true"
            position="bottom"
            :dismissableMask="true"
            :showHeader="false"
            :style="{ width: '100vw', maxWidth: '100vw', margin: 0 }"
            :breakpoints="{ '960px': '100vw', '640px': '100vw' }"
            :pt="{
              root: { class: 'mobile-filter-bottom-sheet' },
              mask: { class: 'mobile-filter-sheet-mask' }
            }"
          >
            <div class="mobile-filter-container">
              <div class="mobile-filter-handle"></div>
              <div class="mobile-filter-title">{{ __('Lọc theo loại') }}</div>
              <div class="mobile-filter-content">
              <!-- Clear all button -->
              <div
                v-if="activeFilters.length > 0"
                class="mobile-filter-item mobile-filter-clear"
                @click="clearAllFilters"
              >
                <span class="text-red-600 font-medium">{{ __('Bỏ chọn tất cả') }}</span>
                <span class="text-xs text-gray-500">({{ activeFilters.length }})</span>
              </div>
              <div v-if="activeFilters.length > 0" class="border-b border-gray-200 my-2"></div>
              
              <!-- Filter Options -->
              <div
                v-for="option in filterOptions"
                :key="option.value"
                class="mobile-filter-item"
                @click="toggleFilter(option.value)"
              >
                <div class="flex items-center gap-3">
                  <component
                    :is="option.icon"
                    class="mobile-filter-icon"
                  />
                  <span class="mobile-filter-label">{{ option.label }}</span>
                </div>
                <svg
                  v-if="activeFilters.includes(option.value)"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="12"
                    fill="#0149C1"
                  />
                  <path
                    d="M7 12L10.5 15.5L17 9"
                    stroke="white"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span
                  v-else
                  class="mobile-filter-unchecked"
                ></span>
              </div>
            </div>
            </div>
          </Dialog>
        <!-- Hiển thị tổng số filter đã chọn -->
        <!-- <div v-if="activeFilters.length" class="ml-2 text-xs text-gray-600">
          {{ activeFilters.length }} {{ __('filter selected') }}
        </div> -->

        <!-- Sort Control -->
        <!-- <div
          v-if="$route.name !== 'Recents'"
          class="sort-control"
        >
          <Button
            :icon="sortOrder.ascending ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down'"
            text
            severity="secondary"
            :disabled="!hasData"
            class="sort-arrow-btn"
            @click.stop="toggleAscending"
          />
          <span class="sort-label-text">{{ __(sortOrder.label) }}</span>
        </div> -->

        <!-- View Mode Buttons -->
        <div class="view-controls">
          <Button
            icon="pi pi-list"
            text
            severity="secondary"
            :class="{ active: viewState === 'list' }"
            :disabled="!hasData"
            class="view-btn"
            @click="viewState = 'list'"
          />
          <Button
            icon="pi pi-th-large"
            text
            severity="secondary"
            :class="{ active: viewState === 'grid' }"
            :disabled="!hasData"
            class="view-btn"
            @click="viewState = 'grid'"
          />
        </div>

        <!-- More Options -->
        <!-- <Button 
          icon="pi pi-ellipsis-v"
          text
          severity="secondary"
          class="control-btn"
        /> -->
      </template>
      <div
        v-else-if="actionItems"
        class="flex gap-1 sm:gap-3 overflow-auto"
      >
        <template
          v-for="item in actionItems
            .filter((i) => i.important && (selections.length === 1 || i.multi))
            .filter(
              (i) =>
                !i.isEnabled ||
                selections.every((e) => i.isEnabled(e, selections.length !== 1))
            )"
          :key="item.label"
        >
          <Button
            outlined
            :severity="item.danger ? 'danger' : 'secondary'"
            v-tooltip="item.label"
            @click="item.action(selections)"
            class="!h-[40px]"
          >
            <template #icon>
              <component
                :is="item.icon"
                class="!w-5 !h-5"
                :class="item.class"
                v-if="item.icon"
              />
            </template>
          </Button>
        </template>
      </div>
    </div>
  </div>
</template>
<script setup>
import { TabButtons } from "frappe-ui"
import Button from "primevue/button"
import InputText from "primevue/inputtext"
import Dropdown from "primevue/dropdown"
import Dialog from "primevue/dialog"
import Tooltip from "primevue/tooltip"
import { ref, computed, watch, useTemplateRef, onMounted, onUnmounted } from "vue"
import { ICON_TYPES, MIME_LIST_MAP, sortEntities } from "@/utils/files"
import { useStore } from "vuex"
import { onKeyDown } from "@vueuse/core"
import { onClickOutside } from "@vueuse/core"
import { useRoute } from "vue-router"

const rows = defineModel(Array)
const props = defineProps({
  selections: Array,
  actionItems: Array,
  getEntities: Object,
})
const emit = defineEmits(['filter-change', 'search-change'])
const store = useStore()

// Computed to check if there's data (handle both paginated and non-paginated responses)
const hasData = computed(() => {
  if (!props.getEntities?.data) return false
  
  // Handle paginated response {data: [...], total: 23}
  if (typeof props.getEntities.data === 'object' && 'data' in props.getEntities.data) {
    return Array.isArray(props.getEntities.data.data) && props.getEntities.data.data.length > 0
  }
  
  // Handle array response (backward compatibility)
  return Array.isArray(props.getEntities.data) && props.getEntities.data.length > 0
})

const sortOrder = ref(store.state.sortOrder)
const activeFilters = ref([])
const activeTags = computed(() => store.state.activeTags)
const showFilterMenu = ref(false)
const showMobileFilterSheet = ref(false)
const filterMenuRef = useTemplateRef("filter-menu")
const filterWrapperRef = useTemplateRef("filter-wrapper")

// Calculate filter menu position when teleported
const filterMenuPosition = computed(() => {
  if (!filterWrapperRef.value) return {}
  
  const rect = filterWrapperRef.value.getBoundingClientRect()
  return {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    right: `${window.innerWidth - rect.right}px`,
    zIndex: 10000,
  }
})

// Mobile detection
const isMobile = ref(false)
const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

const search = ref("")
const viewState = ref(store.state.view)
watch(viewState, (val) => store.commit("toggleView", val))
const shareView = ref(store.state.shareView)
const searchInput = useTemplateRef("search-input")
// Do this as the resource data is updated by a lagging `fetch`
watch(
  [sortOrder, () => props.getEntities.loading],
  ([val, loading]) => {
    if (!rows.value || loading) return
    // sortEntities(rows.value, val)
    // props.getEntities.setData(rows.value)
    store.commit("setCurrentFolder", {
      name:
        props.getEntities.params?.entity_name ||
        rows.value[0]?.parent_entity ||
        "",
      team: props.getEntities.params?.team || rows.value[0]?.team,
      entities: rows.value.filter?.((k) => k.title && k.title[0] !== "."),
    })
    store.commit("setSortOrder", val)
  },
  { immediate: true }
)

// Helper to get actual data array from getEntities.data (handle paginated response)
const getDataArray = () => {
  const data = props.getEntities.data
  if (!data) return []
  // Handle paginated response {data: [...], total: 23}
  if (typeof data === 'object' && 'data' in data && Array.isArray(data.data)) {
    return data.data
  }
  // Handle array response (backward compatibility)
  return Array.isArray(data) ? data : []
}

// Watch for filter changes - emit event to parent to trigger API call
watch(activeFilters, (val) => {
  emit('filter-change', val)
}, { deep: true })

// Watch for search changes - emit event to parent to trigger API call
// Use debounce to avoid too many API calls while typing
let searchTimeout = null
watch(search, (val) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = setTimeout(() => {
    emit('search-change', val)
  }, 500) // Debounce 500ms
})

const route = useRoute()

onKeyDown("Escape", () => {
  searchInput.value.el.blur()
  search.value = ""
  showFilterMenu.value = false
  showMobileFilterSheet.value = false
})

// Close filter menu when clicking outside
onClickOutside(filterWrapperRef, (event) => {
  // Don't close if clicking on the teleported menu
  if (filterMenuRef.value && filterMenuRef.value.contains(event.target)) {
    return
  }
  showFilterMenu.value = false
})

function toggleFilterMenu() {
  if (isMobile.value) {
    showMobileFilterSheet.value = !showMobileFilterSheet.value
  } else {
    showFilterMenu.value = !showFilterMenu.value
  }
}

function clearAllFilters() {
  activeFilters.value = []
}

const filterOptions = computed(() => {
  return Object.keys(ICON_TYPES).map((k) => ({
    label: __(k),
    value: k,
    icon: ICON_TYPES[k],
  }))
})
function toggleFilter(val) {
  const idx = activeFilters.value.indexOf(val)
  if (idx === -1) {
    activeFilters.value.push(val)
  } else {
    activeFilters.value.splice(idx, 1)
  }
}

const orderByItems = computed(() => {
  return columnHeaders.map((header) => ({
    ...header,
    onClick: () =>
      (sortOrder.value = {
        field: header.field,
        label: header.label,
        ascending: sortOrder.value?.ascending,
      }),
  }))
})
const toggleAscending = () => {
  sortOrder.value = {
    ...sortOrder.value,
    ascending: !sortOrder.value.ascending,
  }
}

const onFilterSelect = (option) => {
  if (option.value && !activeFilters.value.includes(option.value)) {
    activeFilters.value.push(option.value)
  }
  showFilterMenu.value = false
}

const columnHeaders = [
  {
    label: __("Name"),
    field: "title",
  },
  {
    label: __("Owner"),
    field: "owner",
  },
  {
    label: __("Modified"),
    field: "modified",
  },
  {
    label: __("Size"),
    field: "file_size",
  },
  {
    label: __("Type"),
    field: "mime_type",
  },
]

watch(shareView, (newValue) => {
  store.commit("toggleShareView", newValue)
})
</script>

<style scoped>
/* Thêm vào phần <style scoped> của component */

.drive-toolbar {
  @apply flex items-center justify-between px-4 py-2.5 border-gray-200 bg-white gap-4;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden; /* Ngăn tràn */
}

.selection-info {
  @apply text-base text-gray-800;
}

.shared-tabs {
  @apply bg-gray-100 rounded-lg p-1 flex items-center;
}

.search-container {
  @apply flex items-center border border-gray-200 rounded-[6px];
  flex: 1 1 auto; /* Cho phép co lại */
  min-width: 0 !important; /* CRITICAL: Force shrink */
  width: auto !important; /* Override PrimeVue width */
  height: 40px;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0 12px; /* Giảm từ 16px xuống 12px */
  gap: 8px;
}

/* Force IconField và InputText có thể shrink */
:deep(.search-container) {
  min-width: 0 !important;
  width: auto !important;
}

:deep(.search-container .p-inputtext) {
  min-width: 0 !important;
  width: 100% !important;
}

/* Chỉ giới hạn max-width trên desktop */
@media (min-width: 769px) {
  .search-container {
    max-width: 448px; /* max-w-md */
    padding: 0 16px; /* Desktop có thể dùng padding lớn hơn */
  }
}

.search-input {
  @apply w-full !p-0 border-0 !shadow-none !outline-none !ring-0;
  min-width: 0; /* Cho phép shrink */
  overflow: hidden; /* Tránh text tràn */
  text-overflow: ellipsis; /* Hiển thị ... khi tràn */
}

/* Icon search không chiếm quá nhiều không gian */
:deep(.pi-search) {
  flex-shrink: 0;
  font-size: 1rem;
}

/* InputIcon wrapper cũng phải shrink được */
:deep(.search-container .p-input-icon) {
  flex-shrink: 0;
}

/* Icon nhỏ hơn trên mobile */
@media (max-width: 640px) {
  :deep(.search-container .pi-search) {
    font-size: 0.9rem;
  }
}

@media (max-width: 480px) {
  :deep(.search-container .pi-search) {
    font-size: 0.85rem;
  }
}

@media (max-width: 380px) {
  :deep(.search-container .pi-search) {
    font-size: 0.8rem;
  }
}

.controls-container {
  @apply flex items-center gap-3 relative;
  /* Ngăn không cho shrink trên mobile */
  flex-shrink: 0;
  height: 40px; /* Đảm bảo chiều cao nhất quán */
}

.active-filters {
  @apply flex flex-wrap items-center gap-1;
}

.filter-tag {
  @apply flex items-center border border-gray-300 rounded-md px-2 py-1 bg-white;
}

.filter-text {
  @apply text-sm ml-2;
}

.control-btn {
  @apply !border !border-gray-300 !rounded-[8px];
  height: 40px; /* Chiều cao cố định */
  width: 40px; /* Vuông đều */
  min-width: 40px; /* Đảm bảo không co nhỏ hơn */
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0; /* Không cho shrink */
}

.filter-wrapper {
  position: relative;
  z-index: 10000;
}

.filter-menu {
  @apply absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg min-w-48;
  z-index: 10001;
}

.filter-menu-teleported {
  @apply bg-white border border-gray-300 rounded-md shadow-lg min-w-48;
  max-height: 400px;
  overflow-y: auto;
}

.filter-option {
  @apply flex items-center gap-2 px-3 py-2 hover:bg-gray-100 cursor-pointer;
  justify-content: space-between;
  width: 100%;
}

.filter-option-icon {
  @apply w-4 h-4;
}

.filter-check {
  margin-left: auto;
}

.filter-unchecked {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 1px solid #ccc;
  border-radius: 50%;
}

.filter-clear-all {
  @apply justify-between;
}

.filter-clear-all:hover {
  @apply bg-red-50;
}

.control-btn.filter-active {
  @apply !border-[#0149C1] !bg-blue-50;
}

.sort-control {
  @apply flex items-center gap-1;
}

.sort-arrow-btn {
  @apply p-2;
}

.sort-label-text {
  @apply text-sm text-gray-600 ml-1;
}

.view-controls {
  @apply flex bg-[#FAFAFA] items-center rounded-md;
  height: 40px; /* Chiều cao cố định */
  flex-shrink: 0; /* Không cho shrink */
}

.view-btn {
  @apply rounded-md;
  height: 40px; /* Chiều cao cố định */
  width: 40px; /* Vuông đều */
  min-width: 40px; /* Đảm bảo không co nhỏ hơn */
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0; /* Không cho shrink */
}

.view-btn.active {
  @apply !bg-[#D4E1F9] text-[#0149C1];
}

/* PrimeVue Component Customization */
:deep(.p-button) {
  @apply border-0;
}

:deep(.p-button.p-button-text) {
  @apply bg-transparent;
}

:deep(.p-button.p-button-text:hover) {
  @apply bg-gray-100;
}

:deep(.p-inputtext) {
  @apply border-gray-300;
}

:deep(.p-inputtext:focus) {
  @apply border-blue-500 shadow-none;
}

/* Responsive Design */
@media (max-width: 768px) {
  .drive-toolbar {
    gap: 8px; /* Giảm gap */
    padding: 8px 12px; /* Giảm padding dọc */
  }

  .search-container {
    /* Search có thể co lại, không tràn */
    flex: 1 1 0 !important;
    min-width: 0 !important; /* Cho phép co nhỏ hơn */
    width: auto !important;
    max-width: 100%;
    height: 40px;
    padding: 0 8px; /* Giảm padding nhiều hơn */
    gap: 6px;
  }

  .controls-container {
    /* Không cho shrink */
    flex: 0 0 auto;
    gap: 6px; /* Giảm gap */
    height: 40px;
  }

  .view-controls {
    height: 40px;
  }

  .view-btn {
    height: 40px;
    width: 40px;
  }

  .control-btn {
    height: 40px;
    width: 40px;
  }

  .sort-label-text {
    @apply hidden;
  }
}

@media (max-width: 640px) {
  .drive-toolbar {
    gap: 6px; /* Gap nhỏ hơn */
    padding: 6px 8px; /* Giảm padding */
  }

  .search-container {
    /* Search co lại được, không tràn */
    flex: 1 1 0 !important;
    min-width: 0 !important; /* Cho phép co nhỏ */
    width: auto !important;
    max-width: 100%;
    height: 40px;
    padding: 0 6px; /* Padding tối thiểu */
    gap: 6px;
  }

  .controls-container {
    /* Compact controls, không shrink */
    flex: 0 0 auto;
    gap: 4px; /* Gap nhỏ hơn */
    height: 40px;
  }

  .view-controls {
    height: 40px;
  }

  .view-btn {
    height: 40px;
    width: 40px;
  }

  .control-btn {
    height: 40px;
    width: 40px;
  }

  .filter-menu {
    /* Điều chỉnh filter menu cho mobile */
    @apply right-0 left-auto;
    min-width: 200px;
    max-width: calc(100vw - 32px);
  }
}

/* Breakpoint cho màn hình nhỏ */
@media (max-width: 480px) {
  .drive-toolbar {
    gap: 4px; /* Gap rất nhỏ */
    padding: 4px 6px; /* Padding tối thiểu */
  }

  .search-container {
    /* Search co lại được, không tràn */
    flex: 1 1 0 !important;
    min-width: 0 !important; /* Cho phép co nhỏ */
    width: auto !important;
    max-width: 100%;
    height: 36px; /* Nhỏ hơn */
    padding: 0 4px; /* Padding tối thiểu */
    gap: 4px;
  }

  .search-input {
    font-size: 14px;
  }

  .controls-container {
    flex: 0 0 auto;
    gap: 3px; /* Gap rất nhỏ */
  }

  .control-btn {
    height: 34px; /* Nhỏ hơn */
    width: 34px;
    min-width: 34px;
  }

  .view-btn {
    height: 34px;
    width: 34px;
    min-width: 34px;
  }

  .view-controls {
    height: 34px;
  }

  :deep(.p-button .p-button-icon) {
    font-size: 0.875rem; /* Icon nhỏ hơn */
  }
}

/* Breakpoint cho màn hình siêu nhỏ - compact tối đa */
@media (max-width: 380px) {
  .drive-toolbar {
    gap: 2px; /* Gap tối thiểu */
    padding: 4px; /* Padding tối thiểu */
  }

  .search-container {
    /* Search co lại tối đa, không tràn */
    flex: 1 1 0 !important;
    min-width: 0 !important; /* Cho phép co rất nhỏ */
    width: auto !important;
    max-width: 100%;
    height: 32px; /* Nhỏ hơn */
    padding: 0 4px; /* Padding tối thiểu */
    gap: 4px;
  }

  .search-input {
    font-size: 13px; /* Font nhỏ hơn */
  }

  .controls-container {
    /* Compact controls */
    flex: 0 0 auto;
    gap: 2px; /* Gap tối thiểu */
  }

  .view-controls {
    height: 32px;
  }

  .view-btn {
    height: 30px; /* Nhỏ hơn */
    width: 30px;
    min-width: 30px;
  }

  .control-btn {
    height: 30px;
    width: 30px;
    min-width: 30px;
  }

  :deep(.p-button .p-button-icon) {
    font-size: 0.75rem; /* Icon nhỏ hơn */
  }
}

/* Mobile Bottom Sheet Styles */
:deep(.mobile-filter-bottom-sheet) {
  width: 100vw !important;
  max-width: 100vw !important;
  margin: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  border-radius: 20px 20px 0 0 !important;
  max-height: 90vh !important;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15) !important;
}

:deep(.mobile-filter-bottom-sheet .p-dialog-content) {
  padding: 0 !important;
  overflow: hidden !important;
  width: 100% !important;
  max-width: 100% !important;
}

/* Override any PrimeVue default constraints */
:deep(.p-dialog.mobile-filter-bottom-sheet) {
  transform: none !important;
}

:deep(.p-dialog-bottom.mobile-filter-bottom-sheet) {
  width: 100vw !important;
  max-width: 100vw !important;
}

:deep(.mobile-filter-sheet-mask) {
  background-color: rgba(0, 0, 0, 0.6) !important;
}

/* Force full width for all dialog wrappers */
:deep(.p-dialog-mask) {
  align-items: flex-end !important;
}

:deep(.p-dialog-mask .mobile-filter-bottom-sheet) {
  margin-bottom: 0 !important;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.mobile-filter-container {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.mobile-filter-handle {
  width: 48px;
  height: 5px;
  background-color: #d1d5db;
  border-radius: 3px;
  margin: 16px auto 12px;
  flex-shrink: 0;
}

.mobile-filter-title {
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
  text-align: center;
  padding: 8px 24px 16px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  background-color: #ffffff;
  position: sticky;
  top: 0;
  z-index: 10;
}

.mobile-filter-content {
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0 24px;
  -webkit-overflow-scrolling: touch;
  width: 100%;
}

.mobile-filter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid #f3f4f6;
  min-height: 64px;
  width: 100%;
}

.mobile-filter-item:active {
  background-color: #f9fafb;
}

.mobile-filter-clear {
  justify-content: space-between;
}

.mobile-filter-clear:active {
  background-color: #fef2f2;
}

.mobile-filter-item .flex {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.mobile-filter-icon {
  width: 26px;
  height: 26px;
  font-size: 26px;
  flex-shrink: 0;
  color: #6b7280;
}

.mobile-filter-label {
  font-size: 17px;
  font-weight: 500;
  color: #1f2937;
  line-height: 1.4;
}

.mobile-filter-unchecked {
  display: inline-block;
  width: 24px;
  height: 24px;
  border: 2px solid #d1d5db;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Animation for bottom sheet */
:deep(.mobile-filter-bottom-sheet) {
  animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
