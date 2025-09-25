<template>
  <Dialog
    v-model:visible="open"
    :modal="true"
    :dismissableMask="!showCreateFolderDialog"
    :closable="true"
    :closeOnEscape="!showCreateFolderDialog"
    :blockScroll="true"
    :appendTo="'body'"
    :baseZIndex="1000"
    class="copy-dialog"
    :showHeader="false"
  >
    <!-- <template #body-main> -->
    <div class="!h-[630px] !w-[560px] flex flex-col">
      <!-- Header -->
      <div
        class="flex items-center justify-between p-6 px-4 pb-0 flex-shrink-0"
      >
        <h2 class="text-xl font-semibold text-gray-900 truncate">
          <template v-if="props.entities.length > 1">
            {{ __("Di chuyển") }} {{ props.entities.length }} {{ __("mục") }}
          </template>
          <template v-else>
            {{ __("Di chuyển") }} "{{
              props.entities[0]?.shortcut_title || props.entities[0]?.title
            }}"
          </template>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          @click="$emit('update:modelValue', false)"
        >
          <template #icon>
            <LucideX class="w-5 h-5" />
          </template>
        </Button>
      </div>

      <!-- Current Location -->
      <div class="p-4 pb-0 flex-shrink-0">
        <div class="flex items-center pb-4 border-b border-gray-200">
          <span class="text-sm font-medium text-gray-700 mr-2">{{
            __("Vị trí hiện tại:")
          }}</span>
          <div
            class="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-md truncate"
          >
            <TeamDrive
              class="w-4 h-4 text-gray-900 mr-2"
              v-if="currentLocationName === 'Nhóm'"
            />
            <TeamIcon
              class="w-4 h-4 text-gray-900 mr-2"
              v-else
            />
            <span class="text-sm text-gray-900 truncate">{{
              currentLocationName
            }}</span>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="p-4 px-0 flex-shrink-0">
        <div class="flex space-x-1">
          <button
            v-for="(tab, index) in tabs"
            :key="index"
            @click="tabIndex = index"
            class="tab-button px-4 py-2 text-sm font-medium border-b-2 transition-colors"
            :class="
              index === tabIndex
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
            "
          >
            {{ tabs[index]?.label }}
          </button>
        </div>
      </div>

      <!-- Main Content Area - This will expand to fill available space -->
      <div class="flex flex-col flex-1 min-h-0">
        <!-- Navigation Header -->
        <div
          v-if="breadcrumbs.length > 1"
          class="p-4 pt-0 flex-shrink-0"
        >
          <div class="flex items-center">
            <button
              @click="goBack"
              class="flex items-center text-gray-600 hover:text-gray-900 mr-2"
            >
              <LucideChevronLeft class="w-5 h-5" />
            </button>
            <h3 class="text-lg font-semibold text-gray-900 truncate">
              {{ getCurrentLocationTitle() }}
            </h3>
          </div>
        </div>

        <!-- Scrollable Folder List Area -->
        <div class="px-4 pb-4 flex-1 min-h-0 flex flex-col">
          <div class="flex-1 overflow-y-auto rounded-md">
            <!-- Teams List for Team Tab -->
            <div
              v-if="
                tabs[tabIndex]?.value === 'team' &&
                teams.data &&
                teams.data.length > 0 &&
                breadcrumbs.length === 1
              "
              class=""
            >
              <div
                v-for="team in teams.data"
                :key="team.name"
                class="folder-item flex items-center p-2 hover:bg-[#D4E1F9] rounded cursor-pointer group"
                :class="{ 'bg-[#D4E1F9]': currentFolder === team.name }"
                @click="navigateToTeam(team)"
              >
                <TeamDrive class="w-5 h-5 text-gray-900 mr-2" />
                <span
                  class="flex-1 font-[500] text-[14px] text-gray-900 truncate"
                  >{{ team.title }}</span
                >
                <button
                  class="hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100"
                  @click.stop="navigateToTeam(team)"
                  title="Mở nhóm"
                >
                  <LucideChevronRight class="w-5 h-5 text-[#525252]" />
                </button>
              </div>
            </div>

            <!-- Folders List -->
            <div v-else-if="currentTree.children.length > 0">
              <div
                v-for="folder in currentTree.children"
                :key="folder.value"
                class="folder-item flex items-center p-2 hover:bg-[#D4E1F9] rounded cursor-pointer group"
                :class="{ 'bg-[#D4E1F9]': currentFolder === folder.value }"
                @click.stop.prevent="selectFolder(folder)"
              >
                <TeamIcon class="w-5 h-5 text-gray-500 mr-2" />
                <span
                  class="flex-1 font-[500] text-[14px] text-gray-900 truncate"
                  >{{ folder.label }}</span
                >
                <button
                  class="hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100"
                  @click.stop.prevent="navigateToFolder(folder)"
                  title="Mở thư mục"
                >
                  <LucideChevronRight class="w-5 h-5 text-[#525252]" />
                </button>
              </div>
            </div>

            <!-- Empty State -->
            <div
              v-else
              class="flex items-center justify-center h-full"
            >
              <p class="text-sm text-gray-500">Chưa có dữ liệu</p>
            </div>
          </div>

          <!-- Create Folder Button -->
          <div
            v-if="tabs[tabIndex]?.value === 'personal' || (tabs[tabIndex]?.value === 'team' && breadcrumbs.length > 1)"
            class="mt-2 flex justify-start flex-shrink-0"
          >
            <Button
              variant="outline"
              size="sm"
              class="flex items-center gap-2 hover:border-[#0149C1]"
              @click.stop="showCreateFolderDialog = true"
            >
              <FolderPlusIcon class="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Fixed Bottom Section - Breadcrumbs and Action Button -->
      <div class="px-4 py-3 border-t border-gray-200 flex-shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <div class="flex items-center flex-wrap max-w-full gap-1">
              <button
                v-for="(crumb, index) in breadcrumbs"
                :key="index"
                class="breadcrumb-item flex items-center text-sm max-w-[220px]"
                @click="navigateToBreadcrumb(crumb, index)"
              >
                <span
                  :title="crumb.title"
                  class="transition-colors text-[11.5px] inline-block truncate max-w-[200px] align-bottom"
                  :class="
                    index === breadcrumbs.length - 1
                      ? 'text-gray-900 font-medium'
                      : 'text-gray-600'
                  "
                >
                  {{ crumb.title }}
                </span>
                <LucideChevronRight
                  v-if="index < breadcrumbs.length - 1"
                  class="w-4 h-4 text-gray-900"
                />
              </button>
            </div>
          </div>
          <Button
            variant="solid"
            class="action-button !bg-[#0149C1] text-white min-w-[130px]"
            :disabled="!canPerformAction"
            :loading="copyLoading"
            @click="performCopy"
          >
            <template #prefix>
              <LucideCopy class="w-4 h-4" />
            </template>
            {{ __("Di chuyển") }}
          </Button>
        </div>
      </div>
    </div>
    <!-- </template> -->
  </Dialog>

  <!-- Create Folder Dialog (teleport ra body để tách khỏi Dialog cha) -->
  <div class="create-folder-teleport">
    <Dialog
      v-model:visible="showCreateFolderDialog"
      header="Tạo thư mục mới"
      :modal="true"
      :dismissableMask="true"
      :closable="true"
      :closeOnEscape="true"
      :blockScroll="true"
      :appendTo="'body'"
      :baseZIndex="2000"
      class="create-folder-dialog"
      @show="onChildDialogShow"
      :showHeader="false"
    >
      <div class="pt-5 w-[300px]">
        <h3 class="text-lg font-semibold mb-4">{{ __("Tạo thư mục mới") }}</h3>
        <form class="mb-4">
          <input
            ref="newFolderInput"
            v-model="newFolderName"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            :placeholder="__('Nhập tên thư mục')"
            @keydown.enter="createNewFolder"
          />
        </form>
        <div class="flex justify-end gap-2">
          <Button
            variant="outline"
            @click.stop="showCreateFolderDialog = false"
          >
            {{ __("Hủy") }}
          </Button>
          <Button
            variant="solid"
            class="!bg-[#0149C1] text-white"
            :disabled="!newFolderName.trim()"
            @click.stop="createNewFolder"
          >
            {{ __("Tạo") }}
          </Button>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<script setup>
import { allFolders } from "@/resources/files"
import { Button, createResource } from "frappe-ui"
import { Dialog } from "primevue"
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useStore } from "vuex"
import LucideChevronLeft from "~icons/lucide/chevron-left"
import LucideChevronRight from "~icons/lucide/chevron-right"
import LucideCopy from "~icons/lucide/copy"
import LucideX from "~icons/lucide/x"
import FolderPlusIcon from "../assets/Icons/FolderPlusIcon.vue"
import TeamDrive from "../assets/Icons/TeamDrive.vue"
import TeamIcon from "../assets/Icons/TeamIcon.vue"
import { getHome, getPersonal, move } from "../resources/files"
import { toast } from "../utils/toasts"

const route = useRoute()
const store = useStore()
const currentFolder = ref("")
const showCreateFolderDialog = ref(false)
const newFolderName = ref("")

const emit = defineEmits(["update:modelValue", "success"])
const props = defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  entities: {
    type: Array,
    required: false,
    default: () => [],
  },
})

const copyLoading = ref(false)
const currentTeam = ref(null)

// Tree structures
const homeRoot = reactive({
  name: "",
  label: "Tài liệu của tôi",
  children: [],
  isCollapsed: true,
})

const teamRoot = reactive({
  name: "",
  label: __("Team"),
  children: [],
  isCollapsed: true,
})

// Thêm reactive object để quản lý cây thư mục của team hiện tại
const currentTeamFolders = reactive({
  name: "",
  label: "",
  children: [],
  isCollapsed: false,
})

const in_home = store.state.breadcrumbs[0].name == "Home"
const tabIndex = ref(in_home ? 0 : 1) // 0 = Tài liệu của tôi, 1 = Nhóm

// Sửa lại currentTree computed để xử lý đúng trường hợp team
const currentTree = computed(() => {
  switch (tabIndex.value) {
    case 0:
      // Kiểm tra tab hiện tại là gì
      const currentTab = tabs.value[0]
      if (currentTab?.value === "personal") {
        return homeRoot
      } else if (currentTab?.value === "team") {
        // Nếu đang ở trong một team (breadcrumbs > 1), hiển thị folder của team đó
        if (breadcrumbs.value.length > 1) {
          return currentTeamFolders
        }
        // Nếu ở root team, hiển thị danh sách teams (không cần tree structure)
        return { children: [], name: "", label: "Teams" }
      }
      return homeRoot
    case 1: // Tab thứ 2 (khi có 2 tabs)
      // Nếu đang ở trong một team, hiển thị folder của team đó
      if (breadcrumbs.value.length > 1) {
        return currentTeamFolders
      }
      return teamRoot
    default:
      return homeRoot
  }
})

const open = computed({
  get() {
    return props.modelValue === "move"
  },
  set(newValue) {
    // Guard: không cho đóng dialog cha khi dialog con đang mở
    if (showCreateFolderDialog.value && newValue === false) return
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

const tabs = ref(
  props.entities[0]?.is_shortcut
    ? [{ label: __("Tài liệu của tôi"), value: "personal" }]
    : [
        { label: __("Tài liệu của tôi"), value: "personal" },
        { label: __("Nhóm"), value: "team" },
      ]
)

// Current location name for display
const currentLocationName = computed(() => {
  if (breadcrumbs.value.length > 1) {
    return breadcrumbs.value[breadcrumbs.value.length - 1].title
  }
  
  // Lấy title từ tab hiện tại thay vì từ breadcrumbs
  const currentTab = tabs.value[tabIndex.value]
  if (currentTab) {
    return currentTab.label
  }
  
  // Fallback
  return breadcrumbs.value[0].title
})

// Check if action can be performed
const canPerformAction = computed(() => {
  return currentFolder.value !== "" || breadcrumbs.value[0].title !== route.name
})

// Get current location title for navigation header
function getCurrentLocationTitle() {
  if (breadcrumbs.value.length > 1) {
    return breadcrumbs.value[breadcrumbs.value.length - 1].title
  }
  return currentLocationName.value
}

// Go back to previous level
function goBack() {
  if (breadcrumbs.value.length > 1) {
    const previousIndex = breadcrumbs.value.length - 2
    navigateToBreadcrumb(breadcrumbs.value[previousIndex], previousIndex)
  }
}

const breadcrumbs = ref([
  {
    name: "",
    title: in_home ? __("Tài liệu của tôi") : __("Nhóm"),
    is_private: in_home ? 1 : 0,
  },
])
const folderSearch = ref(null)

// Build tree structure
function buildTreeStructure(folders, targetRoot) {
  targetRoot.children = []

  const folderMap = {}
  const rootChildren = []

  folders.forEach((folder) => {
    folderMap[folder.value || folder.name] = {
      value: folder.value || folder.name,
      name: folder.name || folder.value,
      label: folder.label || folder.title,
      children: [],
      isCollapsed: true,
      is_private: folder.is_private,
    }
  })

  folders.forEach((folder) => {
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

// Resources
const folderPermissions = createResource({
  url: "drive.api.permissions.get_entity_with_permissions",
  params: {
    entity_name: currentFolder.value,
  },
  onSuccess: (data) => {
    let first = [
      {
        name: "",
        title: data.is_private ? __("Tài liệu của tôi") : __("Team"),
      },
    ]
    breadcrumbs.value = first.concat(data.breadcrumbs.slice(1))
  },
})

// Sửa lại folderContents.onSuccess để build đúng tree
const folderContents = createResource({
  url: "drive.api.list.files",
  makeParams: (params) => ({
    // team: route.params.team,
    is_active: 1,
    folders: 1,
    ...params,
  }),
  onSuccess: (data) => {
    console.log("folderContents.onSuccess:", data, "currentTeam:", currentTeam.value)
    if (data && Array.isArray(data)) {
      const folders = data.filter((item) => item.is_group)
      
      // Nếu đang trong một team cụ thể, build vào currentTeamFolders
      if (currentTeam.value && breadcrumbs.value.length > 1) {
        buildTreeStructure(folders, currentTeamFolders)
      } else {
        // Ngược lại build vào teamRoot (cho trường hợp có 2 tabs)
        buildTreeStructure(folders, teamRoot)
      }
    }
  },
})

const folderMultiContents = createResource({
  url: "drive.api.list.files_multi_team",
  makeParams: (params) => {
    const finalParams = {
      team: route.params.team,
      is_active: 1,
      folders: 1,
      ...params,
    }
    return finalParams
  },
  onSuccess: (data) => {
    if (data && Array.isArray(data)) {
      const folders = data.filter((item) => item.is_group)
      if (tabIndex.value === 0) {
        buildTreeStructure(folders, homeRoot)
      } else if (tabIndex.value === 1) {
        // If we're in a team, build tree for team folders
        buildTreeStructure(folders, teamRoot)
      }
    }
  },
})

// Teams resource
const teams = createResource({
  url: "drive.api.permissions.get_teams",
  params: {
    details: 1,
  },
  onSuccess: (data) => {
    // Convert teams object to array
    if (data && typeof data === "object") {
      let teamsArray = Object.values(data)

      // Kiểm tra nếu là trưởng nhóm
      const isLeader = teamsArray.some(
        (team) =>
          team.name === route.params.team &&
          team.owner === store.state.user.id &&
          props.entities[0]?.owner !== store.state.user.id
      )

      // Nếu là trưởng nhóm, chỉ hiện nhóm hiện tại
      if (isLeader) {
        teamsArray = teamsArray.filter(
          (team) => team.name === route.params.team
        )
      }

      teams.data = teamsArray
    }
  },
})

watch(
  () => props.entities,
  (newEntities) => {
    if (newEntities[0]?.is_shortcut) {
      tabs.value = [{ label: __("Tài liệu của tôi"), value: "personal" }]
      tabIndex.value = 0
      return
    }
    
    console.log("Entity belongs to a team where the user is the owner", props.entities[0]);
    
    // Nếu không phải là chủ của file, chỉ hiển thị tab nhóm
    if (props.entities[0]?.owner !== store.state.user.id) {
      tabs.value = [
        { label: __("Nhóm"), value: "team" },
      ]
      tabIndex.value = 0 // Đặt về index 0 vì chỉ có 1 tab
      
      // Quan trọng: Trigger lại watcher để load dữ liệu đúng
      nextTick(() => {
        // Force trigger tab change với giá trị mới
        const currentTab = tabs.value[0]
        if (currentTab?.value === "team") {
          breadcrumbs.value = [{ name: "", title: __("Nhóm"), is_private: 0 }]
          currentTeam.value = null
          teams.fetch()
        }
      })
      return
    }
    
    // Nếu là chủ của file, hiển thị cả 2 tab
    tabs.value = [
      { label: __("Tài liệu của tôi"), value: "personal" },
      { label: __("Nhóm"), value: "team" },
    ]
  },
  { immediate: true }
)

watch(
  tabIndex,
  (newValue) => {
    currentFolder.value = ""
    
    // Lấy tab hiện tại dựa vào index
    const currentTab = tabs.value[newValue]
    
    if (currentTab?.value === "personal") {
      // Tab "Tài liệu của tôi"
      breadcrumbs.value = [
        { name: "", title: __("Tài liệu của tôi"), is_private: 1 },
      ]
      folderMultiContents.fetch({
        entity_name: "",
        personal: 1,
      })
    } else if (currentTab?.value === "team") {
      // Tab "Nhóm"
      console.log("Switching to team tab");
      breadcrumbs.value = [{ name: "", title: __("Nhóm"), is_private: 0 }]
      // Reset currentTeam khi chuyển về tab nhóm
      currentTeam.value = null
      // Reset currentTeamFolders
      currentTeamFolders.children = []
      // Fetch teams when switching to team tab
      teams.fetch()
    }
  },
  { immediate: true }
)

// Initialize on mount
onMounted(() => {
  if (allFolders.data) {
    const homeFolders = allFolders.data.filter((f) => f.is_private)
    const teamFolders = allFolders.data.filter((f) => !f.is_private)

    buildTreeStructure(homeFolders, homeRoot)
    buildTreeStructure(teamFolders, teamRoot)
  }
})

// Watch for allFolders changes
watch(
  () => allFolders.data,
  (newData) => {
    if (newData) {
      const homeFolders = newData.filter((f) => f.is_private)
      const teamFolders = newData.filter((f) => !f.is_private)

      buildTreeStructure(homeFolders, homeRoot)
      buildTreeStructure(teamFolders, teamRoot)
    }
  },
  { deep: true }
)

// Watch route changes
watch(
  () => route.name,
  (newRouteName) => {
    if (newRouteName === "Home") {
      tabIndex.value = 1 // Tài liệu của tôi
    }
  }
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
    // Add to allFolders
    allFolders.data.push({
      value: data.name,
      label: data.title,
      name: data.name,
      title: data.title,
      parent: createdNode.value.parent,
      is_private: tabs.value[tabIndex.value]?.value === "personal",
    })
    folderPermissions.fetch({
      entity_name: data.name,
    })
    createdNode.value = null

    const currentTab = tabs.value[tabIndex.value]
    if (currentTab?.value === "personal") {
      folderMultiContents.fetch({
        entity_name: currentFolder.value,
        personal: 1,
      })
    } else if (currentTab?.value === "team") {
      // Refresh team folders
      folderContents.fetch({
        team: currentTeam.value,
        entity_name: currentFolder.value,
        personal: 0,
      })
    }

    // Refresh current tree
    const currentTab2 = tabs.value[tabIndex.value]
    if (currentTab2?.value === "personal") {
      getPersonal.setData((dataPersonal) => {
        dataPersonal.unshift(data)
        return dataPersonal
      })
      const homeFolders = allFolders.data.filter((f) => f.is_private)
      buildTreeStructure(homeFolders, homeRoot)
    } else if (currentTab2?.value === "team") {
      getHome.setData((dataHome) => {
        dataHome.unshift(data)
        return dataHome
      })
      
      // Build vào đúng tree
      if (currentTeam.value && breadcrumbs.value.length > 1) {
        const teamFolders = allFolders.data.filter((f) => !f.is_private && f.team === currentTeam.value)
        buildTreeStructure(teamFolders, currentTeamFolders)
      } else {
        const teamFolders = allFolders.data.filter((f) => !f.is_private)
        buildTreeStructure(teamFolders, teamRoot)
      }
    }
  },
})

// New methods for the redesigned UI
function selectFolder(folder) {
  if (store.state.currentFolder.name === folder.value) return
  currentFolder.value = folder.value
}

function navigateToFolder(folder) {
  // Navigate into the folder
  currentFolder.value = folder.value
  folderPermissions.fetch({
    entity_name: folder.value,
  })

  // Update breadcrumbs to show we're inside the folder
  const currentBreadcrumb = breadcrumbs.value[breadcrumbs.value.length - 1]
  if (currentBreadcrumb && currentBreadcrumb.name !== folder.value) {
    breadcrumbs.value.push({
      name: folder.value,
      title: folder.label,
      is_private: tabs.value[tabIndex.value]?.value === "personal" ? 1 : 0,
    })
  }

  // Fetch folders inside this folder
  const currentTab = tabs.value[tabIndex.value]
  if (currentTab?.value === "personal") {
    folderMultiContents.fetch({
      entity_name: folder.value,
      personal: 1,
    })
  } else {
    folderContents.fetch({
      team: currentTeam.value,
      entity_name: folder.value,
      folders: 1,
      personal: 0,
    })
  }
}

// Sửa lại navigateToTeam function
function navigateToTeam(team) {
  console.log("Navigating to team:", team)
  // Update breadcrumbs to show we're inside the team
  currentTeam.value = team.name
  breadcrumbs.value = [
    { name: "", title: __("Nhóm"), is_private: 0 },
    { name: team.name, title: team.title, is_private: 0 },
  ]
  
  // Reset currentFolder khi vào team mới
  currentFolder.value = ""
  
  // Reset currentTeamFolders trước khi fetch
  currentTeamFolders.children = []
  currentTeamFolders.name = team.name
  currentTeamFolders.label = team.title
  
  // Fetch all folders for this team
  folderContents.fetch({
    team: team.name,
    personal: 0,
    entity_name: "", // Load từ root của team
  })
}

// Sửa lại navigateToBreadcrumb để xử lý đúng việc quay về
function navigateToBreadcrumb(crumb, index) {
  if (index < breadcrumbs.value.length - 1) {
    // Navigate to the selected breadcrumb
    breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
    currentFolder.value = breadcrumbs.value[breadcrumbs.value.length - 1].name

    if (index === 0 && tabs.value[tabIndex.value]?.value === "team") {
      // Quay về danh sách teams
      currentTeam.value = null
      currentTeamFolders.children = []
    }

    // Fetch folders for the selected breadcrumb
    const currentTab = tabs.value[tabIndex.value]
    if (currentTab?.value === "personal") {
      folderMultiContents.fetch({
        entity_name: currentFolder.value,
        personal: 1,
      })
    } else if (currentTab?.value === "team") {
      // For team tab, check if we're in a team or folder
      if (breadcrumbs.value.length === 1) {
        // We're back at team list
        teams.fetch()
      } else {
        // We're in a team folder
        folderContents.fetch({
          team: currentTeam.value,
          entity_name: currentFolder.value,
          personal: 0,
        })
      }
    }
  }
}

function createNewFolder() {
  if (!newFolderName.value.trim()) return

  const parentValue = currentFolder.value || ""

  // Set the created node for the API call
  createdNode.value = {
    parent: parentValue,
    value: null,
    label: newFolderName.value.trim(),
  }

  const currentTab = tabs.value[tabIndex.value]
  createFolder.fetch({
    title: newFolderName.value.trim(),
    personal: currentTab?.value === "personal",
    parent: parentValue,
  })

  // Reset form
  newFolderName.value = ""
  showCreateFolderDialog.value = false
}

function openEntity(node) {
  if (store.state.currentFolder.name === node?.value) return
  if (!node?.value) {
    createdNode.value = node
    const currentTab = tabs.value[tabIndex.value]
    createFolder.fetch({
      title: node?.label,
      personal: currentTab?.value === "personal",
      parent: node?.parent,
    })
  } else {
    currentFolder.value = node?.value
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

  const currentTab = tabs.value[tabIndex.value]
  if (currentTab?.value === "personal") {
    tabIndex.value = 0
  } else {
    tabIndex.value = 1
  }
  expandNode(currentTree.value, val.value)

  currentFolder.value = val.value
  openEntity(val)
})

function closeEntity(name) {
  const index = breadcrumbs.value.findIndex((obj) => obj.name === name)
  if (breadcrumbs.value.length > 1 && index !== breadcrumbs.value.length - 1) {
    breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
    currentFolder.value = breadcrumbs.value[breadcrumbs.value.length - 1].name

    const currentTab = tabs.value[tabIndex.value]
    if (currentTab?.value === "personal") {
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

function translateAutocompleteText() {
  nextTick(() => {
    const elements = document.querySelectorAll("*")
    elements.forEach((el) => {
      if (el.textContent === "No results found") {
        el.textContent = "Không tìm thấy kết quả"
      }
      if (el.textContent === "Search") {
        el.textContent = "Tìm kiếm"
      }
    })

    const inputs = document.querySelectorAll('input[placeholder="Search"]')
    inputs.forEach((input) => {
      input.placeholder = "Tìm kiếm thư mục..."
    })
  })
}

// Perform move operation
function performCopy() {
  if (!props.entities || props.entities.length === 0) {
    toast(__("Không có mục nào được chọn"))
    return
  }

  if (currentFolder.value === "" && breadcrumbs.value[0].title == route.name || !currentFolder.value) {
    toast(__("Vui lòng chọn một thư mục đích"))
    return
  }

  copyLoading.value = true

  const movePromise = move.submit({
    entities: props.entities,
    new_parent: currentFolder.value,
    is_private: breadcrumbs.value[breadcrumbs.value.length - 1].is_private,
  })

  movePromise
    .then(() => {
      copyLoading.value = false
      emit("success")
      open.value = false
    })
    .catch((error) => {
      copyLoading.value = false
      console.error("Move failed:", error)
    })
}

// Watch dialog open/close
watch(open, (isOpen) => {
  if (isOpen) {
    translateAutocompleteText()
    setTimeout(() => {
      const observer = new MutationObserver(() => {
        translateAutocompleteText()
      })

      const dialog = document.querySelector('[role="dialog"]')
      if (dialog) {
        observer.observe(dialog, {
          childList: true,
          subtree: true,
          characterData: true,
        })

        watch(open, (stillOpen) => {
          if (!stillOpen) {
            observer.disconnect()
          }
        })
      }
    }, 100)
  }
})

watch(folderSearch, () => {
  setTimeout(translateAutocompleteText, 50)
})

const newFolderInput = ref(null)

watch(showCreateFolderDialog, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      newFolderInput.value?.focus()
    })
  }
})

watch(showCreateFolderDialog, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      if (newFolderInput.value) {
        newFolderInput.value.focus()
      } else {
      }
    })
  }
})

function focusNewFolderInput(attempts = 6) {
  if (!showCreateFolderDialog.value) return
  const inputEl = newFolderInput.value
  if (inputEl) {
    inputEl.focus()
    inputEl.select?.()
  }
  // Nếu vẫn bị giật focus về nút, thử lại vài lần
  setTimeout(() => {
    if (attempts > 0 && document.activeElement !== inputEl) {
      focusNewFolderInput(attempts - 1)
    }
  }, 50)
}

watch(showCreateFolderDialog, (isOpen) => {
  if (isOpen) {
    // Reset rồi focus với retry
    newFolderName.value = ""
    nextTick(() => {
      // chạy nhiều "nhịp" để thắng mọi auto-focus khác
      requestAnimationFrame(() => focusNewFolderInput())
    })
  }
})
</script>

<style scoped>
.copy-dialog :deep(.dialog) {
  border-radius: 0.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.copy-dialog :deep(.dialog-body) {
  padding: 0;
}

/* Custom scrollbar for folder list */
.h-50::-webkit-scrollbar {
  width: 6px;
}

.h-50::-webkit-scrollbar-track {
  background-color: #f3f4f6;
  border-radius: 0.375rem;
}

.h-50::-webkit-scrollbar-thumb {
  background-color: #d1d5db;
  border-radius: 0.375rem;
}

.h-50::-webkit-scrollbar-thumb:hover {
  background-color: #9ca3af;
}

/* Tab hover effects */
.tab-button {
  transition: all 0.2s ease-in-out;
}

.tab-button:hover {
  background-color: #f9fafb;
}

/* Folder item hover effects */
.folder-item {
  transition: all 0.15s ease-in-out;
}

.folder-item:hover {
  /*transform: scale(1.01);*/
}

/* Breadcrumb hover effects */
.breadcrumb-item {
  transition: all 0.15s ease-in-out;
}

.breadcrumb-item:hover {
  /* transform: scale(1.05); */
}

/* Button animations */
.action-button {
  transition: all 0.2s ease-in-out;
  transform: translateZ(0);
}

.action-button:hover {
  /* transform: scale(1.05); */
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.action-button:active {
  transform: scale(0.95);
}

/* Custom focus styles */
.folder-item:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
}

/* Loading state */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Animation for folder list */
.folder-list-enter-active,
.folder-list-leave-active {
  transition: all 0.3s ease-in-out;
}

.folder-list-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.folder-list-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.copy-dialog.with-child-open :deep(.dialog-overlay),
.copy-dialog.with-child-open :deep(.dialog-backdrop) {
  pointer-events: none;
}
</style>
