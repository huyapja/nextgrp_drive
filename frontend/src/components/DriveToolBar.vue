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
            disabled: !getEntities.data?.length,
          },
          {
            label: __('With you'),
            value: 'with',
            disabled: !getEntities.data?.length,
          },
        ]"
      />
    </div>

    <!-- Search Bar -->
    <IconField
      v-else
      class="search-container p-inputtext p-component"
      :disabled="!getEntities.data?.length"
      :class="{ '!bg-[#e2e8f0]': !getEntities.data?.length }"
    >
      <InputIcon class="pi pi-search" />
      <InputText
        ref="search-input"
        v-model="search"
        :disabled="!getEntities.data?.length"
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
            :disabled="!getEntities.data?.length"
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
            :disabled="!getEntities.data?.length"
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
            :disabled="!getEntities.data?.length"
            class="view-btn"
            @click="viewState = 'list'"
          />
          <Button
            icon="pi pi-th-large"
            text
            severity="secondary"
            :class="{ active: viewState === 'grid' }"
            :disabled="!getEntities.data?.length"
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
        class="flex gap-3 ml-4 overflow-auto"
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
const store = useStore()

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

watch(activeFilters.value, (val) => {
  if (!val.length) {
    rows.value = props.getEntities.data
    return
  }
  const mime_types = []
  const isFolder = val.find((k) => k === "Folder")
  for (let k of val) {
    if (k === "Unknown") continue
    mime_types.push(...MIME_LIST_MAP[k])
  }
  rows.value = props.getEntities.data.filter(
    ({ mime_type, is_group }) =>
      mime_types.includes(mime_type) || (isFolder && is_group)
  )
})
watch(search, (val) => {
  const search = new RegExp(val, "i")
  rows.value = props.getEntities.data.filter((k) => search.test(k.title))
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
.drive-toolbar {
  @apply flex flex-nowrap items-center justify-between px-4 py-2.5 border-gray-200 bg-white h-[64px] max-h-[64px] gap-4;
}

.selection-info {
  @apply text-base text-gray-800;
}

.shared-tabs {
  @apply bg-gray-100 rounded-lg p-1 flex items-center;
}

.search-container {
  @apply flex-1 max-w-md flex items-center border border-gray-200 rounded-[6px] px-4 py-2 gap-2;
}

.search-input {
  @apply w-full !p-0 border-0 !shadow-none !outline-none !ring-0;
}

.controls-container {
  @apply flex items-center gap-3 relative;
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
  @apply p-2 !border !border-gray-300 !rounded-[8px];
}

.filter-menu {
  @apply absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 min-w-48;
}

.filter-option {
  @apply flex items-center gap-2 px-3 py-2 hover:bg-gray-100 cursor-pointer;
}

.filter-option-icon {
  @apply w-4 h-4;
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
  @apply flex bg-[#FAFAFA] items-center rounded-md overflow-hidden !h-[40px];
}

.view-btn {
  @apply p-2 rounded-md;
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
    @apply flex-col gap-3 p-3;
  }

  .search-container {
    @apply w-full max-w-none;
  }

  .controls-container {
    @apply w-full justify-between;
  }

  .sort-label-text {
    @apply hidden;
  }
}

@media (max-width: 640px) {
  .drive-toolbar {
    @apply p-2;
  }

  .active-filters {
    @apply hidden;
  }
}
</style>
