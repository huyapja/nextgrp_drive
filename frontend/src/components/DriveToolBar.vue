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
        <div class="relative">
          <Button
            icon="pi pi-filter"
            text
            severity="secondary"
            class="control-btn"
            v-tooltip="__('Filter')"
            @click="showFilterMenu = !showFilterMenu"
          />
          <div
            v-if="showFilterMenu"
            ref="filter-menu"
            class="filter-menu"
          >
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
        </div>
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
import Tooltip from "primevue/tooltip"
import { ref, computed, watch, useTemplateRef } from "vue"
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
const filterMenuRef = useTemplateRef("filter-menu")

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
})

onClickOutside(filterMenuRef, () => {
  showFilterMenu.value = false
})

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
  @apply flex flex-wrap items-center justify-between px-4 py-2.5 border-gray-200 bg-white gap-4 ;
}

.selection-info {
  @apply text-base text-gray-800;
}

.shared-tabs {
  @apply bg-gray-100 rounded-lg p-1 flex items-center;
}

.search-container {
  @apply flex-1 max-w-md flex items-center border border-gray-200 rounded-[6px] px-4 gap-2;
  height: 40px; /* Chiều cao cố định */
}

.search-input {
  @apply w-full !p-0 border-0 !shadow-none !outline-none !ring-0;
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
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.filter-menu {
  @apply absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 min-w-48;
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
}

.view-btn {
  @apply rounded-md;
  height: 40px; /* Chiều cao cố định */
  width: 40px; /* Vuông đều */
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
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
    @apply gap-2 p-3;
  }

  .search-container {
    /* Cho phép search container chiếm tối đa không gian có thể */
    @apply max-w-none;
    flex: 1 1 auto;
    min-width: 120px; /* Đảm bảo có độ rộng tối thiểu */
    height: 40px; /* Giữ chiều cao */
    padding: 0 12px; /* Padding nhỏ hơn */
  }

  .controls-container {
    /* Chỉ chiếm không gian cần thiết */
    flex: 0 0 auto;
    height: 40px; /* Giữ chiều cao */
  }

  .view-controls {
    /* Giữ nguyên, không ẩn */
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
    @apply p-2 gap-1.5;
  }

  .search-container {
    /* Ưu tiên search bar trên mobile */
    flex: 1 1 0%;
    min-width: 0; /* Cho phép shrink nếu cần nhưng vẫn ưu tiên */
    height: 40px; /* Giữ chiều cao */
    padding: 0 8px; /* Padding nhỏ hơn */
  }

  .controls-container {
    /* Compact controls */
    @apply gap-1.5;
    height: 40px; /* Giữ chiều cao */
  }

  .view-controls {
    /* Giữ nguyên view controls */
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

/* Thêm breakpoint cho màn hình rất nhỏ */
@media (max-width: 480px) {
  .drive-toolbar {
    @apply gap-1;
  }

  .search-container {
    height: 40px; /* Giữ chiều cao */
    padding: 0 8px;
  }

  .search-input {
    font-size: 14px;
  }

  .control-btn {
    height: 40px;
    width: 40px;
  }

  .view-btn {
    height: 40px;
    width: 40px;
  }

  .view-controls {
    height: 40px;
  }

  :deep(.p-button .p-button-icon) {
    font-size: 1rem;
  }
}
</style>
