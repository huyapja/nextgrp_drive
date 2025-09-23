<template>
  <Dialog
    v-model="open"
    :options="{ size: '2xl' }"
  >
    <template #body-main>
      <div
        v-focus
        class="py-5 px-4 sm:px-6"
      >
        <div class="flex w-full justify-between gap-x-15 mb-4">
          <div class="font-semibold text-2xl flex text-nowrap overflow-hidden">
            <template v-if="props.entities.length > 1">
              {{ __('Moving') }} {{ props.entities.length }} {{ __('items') }}
            </template>
            <template v-else>
              <span class="flex items-center">
                {{ __('Moving') }} "
                <span class="truncate max-w-[80%]">{{props.entities[0].shortcut_title || props.entities[0].title }}</span>"
              </span>
            </template>
          </div>
          <Button
            class="ml-auto"
            variant="ghost"
            @click="$emit('update:modelValue', false)"
          >
            <template #icon>
              <LucideX class="size-4" />
            </template>
          </Button>
        </div>
        <Autocomplete
          v-if="allFolders.data"
          v-model="folderSearch"
          class="mb-2"
          :placeholder="'Tìm kiếm thư mục...'"
          :empty-message="'Không có thư mục nào.'"
          :no-results-text="'Không tìm thấy kết quả'"
          :search-placeholder="'Tìm kiếm'"
          :options="
            allFolders.data.filter((k) =>
              currentFolder === ''
                ? k.label !== 'Home'
                : k.value !== currentFolder
            )
          "
          @update:model-value="translateAutocompleteText"
          @focus="translateAutocompleteText"
        >
          <template #suffix-icon>&#8203;</template>
        </Autocomplete>
        <Tabs
          v-model="tabIndex"
          as="div"
          :tabs="tabs"
        >
          <template #tab-panel>
            <div class="py-1 h-40 overflow-auto">
              <Tree
                v-for="k in currentTree.children"
                :key="k.value"
                node-key="value"
                :node="k"
              >
                <template
                  #node="{ node, hasChildren, isCollapsed, toggleCollapsed }"
                >
                  <div
                    class="flex items-center cursor-pointer select-none gap-1 h-7"
                    @click="openEntity(node)"
                  >
                    <div
                      ref="iconRef"
                      @click="toggleCollapsed($event)"
                    >
                      <LucideChevronDown
                        v-if="hasChildren && !isCollapsed"
                        class="size-3.5"
                      />
                      <LucideChevronRight
                        v-else-if="hasChildren"
                        class="size-3.5"
                      />
                      <div
                        v-else
                        class="ps-3.5"
                      />
                    </div>
                    <div
                      class="flex-grow rounded-sm text-base truncate h-full flex items-center pl-1"
                      :class="[
                        currentFolder === node.value
                          ? 'bg-surface-gray-3'
                          : 'hover:bg-surface-gray-2',
                        $store.state.currentFolder.name === node.value
                          ? 'cursor-not-allowed hover:bg-surface-white'
                          : 'group',
                      ]"
                    >
                      <LucideFolderClosed
                        v-if="isCollapsed"
                        class="mr-1 size-4"
                      />
                      <LucideFolder
                        v-else
                        class="mr-1 size-4"
                      />
                      <div
                        v-if="node.value === null"
                        class="overflow-visible"
                      >
                        <Input
                          v-model="node.label"
                          v-focus
                          type="text"
                          input-class=" !h-6"
                          @click.stop
                          @keydown.enter="openEntity(node)"
                        />
                      </div>
                      <span v-else
                        >{{ node.label }}
                        <em
                          v-if="$store.state.currentFolder.name === node.value"
                          >({{ __('current') }})</em
                        ></span
                      >
                      <Button
                        class="shrink hidden group-hover:block ml-auto"
                        :class="{
                          '!bg-surface-gray-3': currentFolder === node.value,
                        }"
                        @click.stop="
                          (e) => {
                            let obj = {
                              parent: node.value,
                              value: null,
                              label: __('New folder'),
                            }
                            node.children.push(obj)
                            if (isCollapsed) toggleCollapsed(e)
                          }
                        "
                      >
                        <LucideFolderPlus class="size-4" />
                      </Button>
                    </div>
                  </div>
                </template>
              </Tree>
              <p
                v-if="!currentTree.children.length"
                class="text-base text-center pt-5"
              >
                {{ __('No folders yet.') }}
              </p>
            </div>
          </template>
        </Tabs>
        <div class="flex items-center justify-between pt-4">
          <div class="flex flex-col">
            <div class="flex items-center my-auto justify-start">
              <p class="text-sm pr-0.5">{{ __('Moving to:') }}</p>
              <Dropdown
                v-if="dropDownBreadcrumbs.length"
                class="h-7"
                :options="dropDownBreadcrumbs"
              >
                <Button variant="ghost">
                  <LucideEllipsis class="size-3.5" />
                </Button>
              </Dropdown>
              <span
                v-if="dropDownBreadcrumbs.length"
                class="text-ink-gray-5 mx-0.5"
              >
                {{ "/" }}
              </span>
              <div
                v-for="(crumb, index) in slicedBreadcrumbs"
                :key="index"
              >
                <span
                  v-if="breadcrumbs.length > 1 && index > 0"
                  class="text-ink-gray-5 mx-0.5"
                >
                  {{ "/" }}
                </span>
                <button
                  class="text-base cursor-pointer"
                  :class="
                    index === slicedBreadcrumbs.length - 1
                      ? 'text-ink-gray-9 text-base font-medium p-1'
                      : 'text-ink-gray-5 text-base rounded-[6px] hover:bg-surface-gray-2 p-1'
                  "
                  @click="closeEntity(crumb.name)"
                >
                  {{ crumb.title }}
                </button>
              </div>
            </div>
          </div>
          <Button
            variant="solid"
            class="ml-auto !bg-[#0149C1] text-white hover:!opacity-90"
            size="sm"
            :disabled="
              currentFolder === '' && breadcrumbs[0].title == $route.name
            "
            :loading="move.loading"
            @click="
              $emit('success'),
                move.submit({
                  entities: entities,
                  new_parent: currentFolder,
                  is_private: breadcrumbs[breadcrumbs.length - 1].is_private,
                })
            "
          >
            <template #prefix>
              <LucideMoveUpRight class="size-4" />
            </template>
            {{ __('Move') }}
          </Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, h, nextTick, onMounted, reactive, ref, watch } from "vue"

import { allFolders, move } from "@/resources/files"
import {
  Autocomplete,
  Button,
  createResource,
  Dialog,
  Dropdown,
  Input,
  Tabs,
  Tree,
} from "frappe-ui"

import { useRoute } from "vue-router"
import { useStore } from "vuex"
import LucideBuilding2 from "~icons/lucide/building-2"
import LucideChevronDown from "~icons/lucide/chevron-down"
import LucideFolder from "~icons/lucide/folder"
import LucideHome from "~icons/lucide/home"
import LucideMoveUpRight from "~icons/lucide/move-up-right"

const route = useRoute()
const currentFolder = ref("")
const emit = defineEmits(["update:modelValue", "success"])
const props = defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  entities: {
    type: Object,
    required: false,
    default: null,
  },
})

// Dynamic tree structures that will be updated from API responses
const homeRoot = reactive({
  name: "",
  label: __("Home"),
  children: [],
  isCollapsed: true,
})

const teamRoot = reactive({
  name: "",
  label: __("Team"),
  children: [],
  isCollapsed: true,
})

const store = useStore()
const in_home = store.state.breadcrumbs[0].name == "Home"
const tabIndex = ref(in_home ? 0 : 1)

// Computed property to get current tree based on tab
const currentTree = computed(() => {
  return tabIndex.value === 0 ? homeRoot : teamRoot
})

const open = computed({
  get() {
    return props.modelValue === "m"
  },
  set(newValue) {
    emit("update:modelValue", newValue || "")
  },
})

const slicedBreadcrumbs = computed(() => {
  if (breadcrumbs.value.length > 3) {
    return breadcrumbs.value.slice(-3)
  }
  return breadcrumbs.value
})

const dropDownBreadcrumbs = computed(() => {
  let allExceptLastTwo = breadcrumbs.value.slice(0, -3)
  return allExceptLastTwo.map((item) => {
    return {
      ...item,
      icon: null,
      label: item.title,
      onClick: () => closeEntity(item.name),
    }
  })
})

const tabs = computed(() => {
  const allTabs = [
    {
      label: __("Home"),
      icon: h(LucideHome, { class: "size-4" }),
    },
    {
      label: __("Team"),
      icon: h(LucideBuilding2, { class: "size-4" }),
    },
  ]
  
  // Nếu đang ở trang Home, chỉ hiển thị tab Home
  if (route.name === 'Home') {
    return allTabs.slice(0, 1) // Chỉ lấy tab đầu tiên (Home)
  }
  
  return allTabs
})

const breadcrumbs = ref([
  { name: "", title: in_home ? __("Home") : __("Team"), is_private: in_home ? 1 : 0 },
])
const folderSearch = ref(null)

// Function to build tree structure from flat folder data
function buildTreeStructure(folders, targetRoot) {
  // Clear existing children
  targetRoot.children = []
  
  // Create a map for quick lookup
  const folderMap = {}
  const rootChildren = []
  
  // First pass: create all folder objects
  folders.forEach(folder => {
    folderMap[folder.value || folder.name] = {
      value: folder.value || folder.name,
      name: folder.name || folder.value,
      label: folder.label || folder.title,
      children: [],
      isCollapsed: true,
      is_private: folder.is_private
    }
  })
  
  // Second pass: build tree structure
  folders.forEach(folder => {
    const node = folderMap[folder.value || folder.name]
    const parentKey = folder.parent
    
    if (parentKey && folderMap[parentKey]) {
      folderMap[parentKey].children.push(node)
    } else {
      rootChildren.push(node)
    }
  })
  
  targetRoot.children = rootChildren
}

const folderPermissions = createResource({
  url: "drive.api.permissions.get_entity_with_permissions",
  params: {
    entity_name: currentFolder.value,
  },
  onSuccess: (data) => {
    let first = [{ name: "", title: data.is_private ? __('Home') : __('Team') }]
    breadcrumbs.value = first.concat(data.breadcrumbs.slice(1))
  },
})

const folderContents = createResource({
  url: "drive.api.list.files",
  makeParams: (params) => ({
    team: route.params.team,
    is_active: 1,
    folders: 1,
    ...params,
  }),
  onSuccess: (data) => {
    // Update team tree with new data
    if (data && Array.isArray(data)) {
      const folders = data.filter(item => item.is_group) // Only folders
      buildTreeStructure(folders, teamRoot)
    }
  }
})

const folderMultiContents = createResource({
  url: "drive.api.list.files_multi_team",
  makeParams: (params) => {
    const finalParams = {
      team: route.params.team,
      is_active: 1,
      folders: 1,
      ...params,
    };
    return finalParams;
  },
  onSuccess: (data) => {
    // Update home tree with new data
    if (data && Array.isArray(data)) {
      const folders = data.filter(item => item.is_group) // Only folders
      buildTreeStructure(folders, homeRoot)
    }
  }
})

// Initialize tree structure from allFolders.data on mount
onMounted(() => {
  if (allFolders.data) {
    const homeFolders = allFolders.data.filter(f => f.is_private)
    const teamFolders = allFolders.data.filter(f => !f.is_private)
    
    buildTreeStructure(homeFolders, homeRoot)
    buildTreeStructure(teamFolders, teamRoot)
  }
})

// Watch for changes in allFolders.data
watch(() => allFolders.data, (newData) => {
  if (newData) {
    const homeFolders = newData.filter(f => f.is_private)
    const teamFolders = newData.filter(f => !f.is_private)
    
    buildTreeStructure(homeFolders, homeRoot)
    buildTreeStructure(teamFolders, teamRoot)
  }
}, { deep: true })

// Watch route changes để reset tab khi chuyển trang
watch(() => route.name, (newRouteName) => {
  if (newRouteName === 'Home') {
    tabIndex.value = 0 // Luôn set về tab Home
  }
})

watch(
  tabIndex,
  (newValue) => {
    currentFolder.value = ""
    switch (newValue) {
      case 0:
        breadcrumbs.value = [{ name: "", title: __('Home'), is_private: 1 }]
        folderMultiContents.fetch({
          entity_name: "",
          personal: 1,
        })
        break
      case 1:
        breadcrumbs.value = [{ name: "", title: __('Team'), is_private: 0 }]
        folderContents.fetch({
          entity_name: "",
          personal: 0,
        })
        break
      case 2:
        folderContents.fetch({
          entity_name: "",
          favourites_only: true,
        })
        break
    }
  },
  { immediate: true }
)

const createdNode = ref(null)
const createFolder = createResource({
  url: "drive.api.files.create_folder",
  makeParams(params) {
    return {
      ...params,
      team: route.params.team,
    }
  },
  validate(params) {
    if (!params?.title) return false
  },
  onSuccess(data) {
    createdNode.value.value = data.name
    currentFolder.value = data.name
    allFolders.data.push({
      value: data.name,
      label: data.title,
      name: data.name,
      title: data.title,
      parent: createdNode.value.parent,
      is_private: tabIndex.value === 0
    })
    folderPermissions.fetch({
      entity_name: data.name,
    })
    createdNode.value = null
    
    // Refresh the current tree
    if (tabIndex.value === 0) {
      folderMultiContents.fetch({
        entity_name: "",
        personal: 1,
      })
    } else {
      folderContents.fetch({
        entity_name: "",
        personal: 0,
      })
    }
  },
})

function openEntity(node) {
  if (store.state.currentFolder.name === node.value) return
  if (!node.value) {
    createdNode.value = node
    createFolder.fetch({
      title: node.label,
      personal: tabIndex.value === 0,
      parent: node.parent,
    })
  } else {
    currentFolder.value = node.value
    folderPermissions.fetch({
      entity_name: currentFolder.value,
    })
  }

  folderSearch.value = null
}

const expandNode = (obj, name) => {
  if (obj.value === name) {
    return obj
  }

  for (let k of obj.children) {
    let res = expandNode(k, name)
    if (res) {
      obj.isCollapsed = false
      return res
    }
  }
  return false
}

watch(folderSearch, (val) => {
  if (!val) return
  
  tabIndex.value = val.is_private ? 0 : 1
  expandNode(currentTree.value, val.value)

  currentFolder.value = val.value
  openEntity(val)
})

function closeEntity(name) {
  const index = breadcrumbs.value.findIndex((obj) => obj.name === name)
  if (breadcrumbs.value.length > 1 && index !== breadcrumbs.value.length - 1) {
    breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
    currentFolder.value = breadcrumbs.value[breadcrumbs.value.length - 1].name
    
    // Fetch appropriate data based on current tab
    if (tabIndex.value === 0) {
      folderMultiContents.fetch({
        entity_name: currentFolder.value,
        personal: currentFolder.value === "" ? 1 : -1,
      })
    } else {
      folderContents.fetch({
        entity_name: currentFolder.value,
        personal: currentFolder.value === "" ? 0 : -1,
      })
    }
  }
}

// Function to translate Autocomplete text
function translateAutocompleteText() {
  nextTick(() => {
    // Find all elements that might contain "No results found"
    const elements = document.querySelectorAll('*')
    elements.forEach(el => {
      if (el.textContent === 'No results found') {
        el.textContent = 'Không tìm thấy kết quả'
      }
      if (el.textContent === 'Search') {
        el.textContent = 'Tìm kiếm'
      }
    })
    
    // Handle placeholder specifically
    const inputs = document.querySelectorAll('input[placeholder="Search"]')
    inputs.forEach(input => {
      input.placeholder = 'Tìm kiếm thư mục...'
    })
    
    // Handle autocomplete dropdown
    const dropdowns = document.querySelectorAll('.dropdown-content, .autocomplete-dropdown, [role="listbox"]')
    dropdowns.forEach(dropdown => {
      const walker = document.createTreeWalker(
        dropdown,
        NodeFilter.SHOW_TEXT,
        null,
        false
      )
      
      let node
      while (node = walker.nextNode()) {
        if (node.textContent.trim() === 'No results found') {
          node.textContent = 'Không tìm thấy kết quả'
        }
      }
    })
  })
}

// Watch for dialog open and autocomplete changes
watch(open, (isOpen) => {
  if (isOpen) {
    translateAutocompleteText()
    // Set up observer for dynamic content
    setTimeout(() => {
      const observer = new MutationObserver(() => {
        translateAutocompleteText()
      })
      
      const dialog = document.querySelector('[role="dialog"]')
      if (dialog) {
        observer.observe(dialog, {
          childList: true,
          subtree: true,
          characterData: true
        })
        
        // Cleanup observer when dialog closes
        watch(open, (stillOpen) => {
          if (!stillOpen) {
            observer.disconnect()
          }
        })
      }
    }, 100)
  }
})

// Watch folderSearch changes to trigger translation
watch(folderSearch, () => {
  setTimeout(translateAutocompleteText, 50)
})
</script>

<style scoped>
/* Simplified CSS for better performance */
:deep(.autocomplete input) {
  &::placeholder {
    color: #9ca3af !important;
  }
}

/* Ensure Vietnamese text displays correctly */
:deep(.dropdown-content),
:deep(.autocomplete-dropdown) {
  font-family: system-ui, -apple-system, sans-serif; 
}
</style>