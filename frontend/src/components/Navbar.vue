<template>
  <nav
    ondragstart="return false;"
    ondrop="return false;"
    class="bg-surface-white border-b w-full px-3 py-2 min-h-[48px] flex items-center flex-wrap gap-2 justify-between"
  >
    <div class="flex flex-row align-center flex-wrap gap-2 first-div">
      <!-- Sidebar Toggle Button -->
       <div :class="store.state.showSidebarButton ? 'border-r border-gray-200 pr-2' : ''">
         <button
           v-if="store.state.showSidebarButton"
           @click="openSidebar"
           class="flex items-center justify-center p-1.5 rounded hover:bg-gray-100 transition-colors"
           title="Mở sidebar"
         >
           <ChevronRight class="h-4 w-4 text-gray-700" />
         </button>
       </div>
      
      <div class="flex items-center gap-1">
        <Breadcrumbs
          :items="store.state.breadcrumbs"
          class="select-none !truncate breadcrumbs-custom text-sm"
        >
          <template #prefix="{ item, index }">
            <LoadingIndicator
              v-if="item.loading"
              width="16"
              scale="70"
            />
            <div
              v-if="index == 0"
              class="mr-1"
            >
              <component
                :is="COMPONENT_MAP[item.name]"
                class="size-3.5 text-ink-gray-6"
              />
            </div>
          </template>
        </Breadcrumbs>
        <!-- Favorite icon cạnh tên file trong breadcrumb -->
        <button
          v-if="['File', 'Document', 'MindMap'].includes(route.name) && rootEntity"
          @click.stop="toggleFavorite"
          class="flex items-center justify-center p-0.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
          :title="rootEntity?.is_favourite ? 'Bỏ yêu thích' : 'Yêu thích'"
        >
          <LucideStar
            :class="[
              'w-3.5 h-3.5',
              rootEntity?.is_favourite 
                ? 'stroke-amber-500 fill-amber-500' 
                : 'stroke-gray-400 fill-none hover:fill-amber-100'
            ]"
          />
        </button>
      </div>
      
      <!-- Static Star Icon - Hiển thị ở các trang khác (không phải File/Document/MindMap) -->
      <LucideStar
        v-if="!['File', 'Document', 'MindMap'].includes(route.name) && rootEntity?.is_favourite"
        width="14"
        height="14"
        class="my-auto stroke-amber-500 fill-amber-500"
      />
    </div>

    <div class="flex gap-2 justify-between">
      <button
        class="flex items-center gap-1 hover:bg-gray-200 p-1 rounded"
        v-if="showTeamMembers && getTeamMembers?.data"
        @click="$emit('show-team-members')"
      >
        <img
          src="@/assets/images/icons/memberIcon.svg"
          alt="Team Members"
        />
        <p class="text-[14px] font-medium text-[#404040] line-clamp-1">
          {{ getTeamMembers?.data?.length }} thành viên
        </p>
      </button>

      <div
        v-if="
          ['Folder', 'Home', 'Team'].includes($route.name) &&
          isLoggedIn &&
          props.rootResource?.data?.write
        "
        class="flex gap-2"
      >
        <Dropdown
          :options="uploadOptions"
          placement="left"
        >
          <Button
            variant="subtle"
            class="rounded-[6px] px-2.5 h-[32px] text-sm !bg-[#0149C1] !text-white !font-normal whitespace-nowrap"
          >
            <template #prefix>
              <UploadDrive class="size-4" />
            </template>
            Tải lên
          </Button>
        </Dropdown>
        <Dropdown
          :options="createOptions"
          placement="left"
        >
          <Button
            variant="subtle"
            class="rounded-[6px] px-2.5 h-[32px] text-sm !bg-[#0149C1] !text-white !font-normal"
          >
            <template #prefix>
              <NewDrive class="size-4" />
            </template>
            Thêm mới
          </Button>
        </Dropdown>
      </div>

      <Button
        v-if="button"
        class="line-clamp-1 truncate w-full"
        :disabled="!(Array.isArray(button.entities.data) ? button.entities.data?.length : button.entities.data?.total)"
        variant="subtle"
        :theme="button.theme || 'gray'"
        @click="emitter.emit('showCTADelete')"
      >
        <template #prefix>
          <component
            :is="button.icon"
            class="size-4"
          />
        </template>
        {{ button.label }}
      </Button>

      <div
        v-if="connectedUsers.length > 1 && isLoggedIn"
        class="hidden sm:flex bg-surface-gray-3 rounded justify-center items-center px-1"
      >
        <UsersBar />
      </div>
    </div>
    <div
      class="flex flex-row items-center gap-1 bg-surface-white"
      v-if="route.name === 'File'"
    >
      <Button 
        class="!p-2 !min-w-0" 
        :variant="'ghost'" 
        @click="downloadCurrentFile" 
        title="Tải xuống"
      >
        <LucideDownload class="w-5 h-5 text-gray-700" />
      </Button>
      
      <Button 
        class="!p-2 !min-w-0" 
        :variant="'ghost'" 
        @click="enterFullScreen"
        title="Toàn màn hình"
      >
        <LucideScan class="w-5 h-5 text-gray-700" />
      </Button>
      
      <Button
        class="!p-2 !min-w-0"
        :variant="'ghost'"
        @click="switchTab(0)"
        title="Thông tin"
      >
        <InfoIcon
          :class="[
            'w-5 h-5',
            tab === 0 && store.state.showInfo
              ? 'text-[#0149C1]'
              : 'text-gray-700'
          ]"
        />
      </Button>
      
      <Button
        v-if="rootEntity?.comment"
        class="!p-2 !min-w-0"
        :variant="'ghost'"
        @click="switchTab(1)"
        title="Bình luận"
      >
        <LucideMessageCircle
          :class="[
            'w-5 h-5',
            tab === 1 && store.state.showInfo
              ? 'text-[#0149C1]'
              : 'text-gray-700'
          ]"
        />
      </Button>
      
      <Button
        class="!p-2 !min-w-0"
        :variant="'ghost'"
        @click="showFileContextMenu"
        title="Thêm"
      >
        <LucideMoreVertical class="w-5 h-5 text-gray-700" />
      </Button>
    </div>
    
    <!-- Context Menu for File -->
    <GroupedContextMenu
      v-if="route.name === 'File'"
      ref="fileContextMenuRef"
      :action-items="fileActionItems"
      :close="() => {}"
    />

    <Dialogs
      v-if="$route.name === 'File' || $route.name === 'Document'"
      v-model="dialog"
      :root-resource="rootResource"
      :get-entities="getEntities"
    />

    <!-- Dialog tạo MindMap -->
    <Dialog
      v-model:visible="showMindMapDialog"
      modal
      :header="'Tạo sơ đồ mới'"
      :style="{ width: '500px' }"
      :draggable="false"
    >
      <div>
        <div class="flex flex-col gap-2">
          <label for="mindmap-title" class="text-sm font-semibold text-gray-700">
            Tên sơ đồ<span class="text-red-500">*</span>
          </label>
          <InputText
            id="mindmap-title"
            v-model="mindMapForm.title"
            placeholder="Nhập tên sơ đồ"
            class="w-full"
          />
        </div>
        
        <div class="flex flex-col gap-2 mt-4">
          <label for="mindmap-description" class="text-sm font-semibold text-gray-700">
            Mô tả
          </label>
          <Textarea
            id="mindmap-description"
            v-model="mindMapForm.description"
            placeholder="Nhập mô tả (tùy chọn)"
            rows="4"
            class="w-full"
          />
        </div>
      </div>
      
      <template #footer>
        <div class="flex justify-end gap-2">
          <PrimeButton
            label="Hủy"
            severity="secondary"
            @click="showMindMapDialog = false"
          />
          <PrimeButton
            label="Tạo"
            :disabled="!mindMapForm.title.trim()"
            @click="handleCreateMindMap"
          />
        </div>
      </template>
    </Dialog>
  </nav>
</template>

<script setup>
import CloudIconBlack from "@/assets/Icons/CloudIconBlack.vue"
import CopyIcon from "@/assets/Icons/CopyIcon.vue"
import FavoriteIcon from "@/assets/Icons/FavoriteIcon.vue"
import InfoIcon from "@/assets/Icons/InfoIcon.vue"
import InfoIconBlack from "@/assets/Icons/InfoIconBlack.vue"
import LinkIcon from "@/assets/Icons/LinkIcon.vue"
import MindmapIcon from "@/assets/Icons/MindmapIcon.vue"
import MoveIcon from "@/assets/Icons/MoveIcon.vue"
import NewDrive from "@/assets/Icons/NewDrive.vue"
import RenameIcon from "@/assets/Icons/RenameIcon.vue"
import ShareIconBlack from "@/assets/Icons/ShareIconBlack.vue"
import TrashIcon from "@/assets/Icons/TrashIcon.vue"
import UploadDrive from "@/assets/Icons/UploadDrive.vue"
import { usePinnedFiles } from "@/composables/usePinnedFiles"
import emitter from "@/emitter"
import {
  createDocument,
  createMindMap,
  getFavourites,
  getRecents,
  getTrash,
  toggleFav,
} from "@/resources/files"
import { entitiesDownload } from "@/utils/download"
import { createShortcut, removeShortcut } from "@/utils/files"
import { toast } from "@/utils/toasts"
import {
  Breadcrumbs,
  Button, call, Dropdown,
  LoadingIndicator
} from "frappe-ui"
import PrimeButton from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useStore } from "vuex"
import LucideBuilding2 from "~icons/lucide/building-2"
import LucideChevronRight from "~icons/lucide/chevron-right"
import LucideClock from "~icons/lucide/clock"
import LucideDownload from "~icons/lucide/download"
import LucideFileDown from "~icons/lucide/file-down"
import LucideFilePlus2 from "~icons/lucide/file-plus-2"
import LucideFileUp from "~icons/lucide/file-up"
import LucideFolderPlus from "~icons/lucide/folder-plus"
import LucideFolderUp from "~icons/lucide/folder-up"
import LucideHistory from "~icons/lucide/history"
import LucideHome from "~icons/lucide/home"
import LucideLink from "~icons/lucide/link"
import LucideMessageCircle from "~icons/lucide/message-circle"
import LucideMoreVertical from "~icons/lucide/more-vertical"
import LucidePin from "~icons/lucide/pin"
import LucidePinOff from "~icons/lucide/pin-off"
import LucideScan from "~icons/lucide/scan"
import LucideStar from "~icons/lucide/star"
import LucideTrash from "~icons/lucide/trash"
import LucideUsers from "~icons/lucide/users"
import MoveOwnerIcon from "../assets/Icons/MoveOwnerIcon.vue"
import ShortcutIcon from "../assets/Icons/ShortcutIcon.vue"
import { getTeamMembers } from "../resources/team"
import Dialogs from "./Dialogs.vue"
import GroupedContextMenu from "./GroupedContextMenu.vue"
import UsersBar from "./UsersBar.vue"

const ChevronRight = LucideChevronRight

// Component mapping
const COMPONENT_MAP = {
  Home: LucideHome,
  Team: LucideBuilding2,
  Favourites: LucideStar,
  Shared: LucideUsers,
  Trash: LucideTrash,
  Recents: LucideClock,
}

// Props
const props = defineProps({
  actions: {
    type: Array,
    default: () => [],
  },
  triggerRoot: Function,
  rootResource: Object,
  getEntities: Function,
})

// Composables
const store = useStore()
const route = useRoute()
const router = useRouter()
const { isPinned, togglePin, pinnedFiles, loadPinnedFiles } = usePinnedFiles()

// MindMap Dialog
const showMindMapDialog = ref(false)
const mindMapForm = ref({
  title: '',
  description: ''
})

// Import MindMap file input
const importMindMapInput = ref(null)

// Context menu ref for file
const fileContextMenuRef = ref(null)

// Load pinned files khi component mount
onMounted(async () => {
  // Load pinned files để đảm bảo menu hiển thị đúng
  if (store.getters.isLoggedIn && !store.state.pinnedFilesLoaded) {
    await loadPinnedFiles()
    // Force menu recompute sau khi load
    menuRefreshKey.value++
  }
})

// Watch pinnedFiles để force menu refresh khi thay đổi
watch(() => store.state.pinnedFiles, () => {
  menuRefreshKey.value++
}, { deep: true })

// Fetch khi team thay đổi
watch(() => route.params.team, (team) => {
  if (team) {
    getTeamMembers.fetch()
  }
}, { immediate: true })

//current user
const currentUserEmail = computed(() => store.state.user.id)

// Computed properties
const entity = computed(() => store.state.activeEntity)
const isLoggedIn = computed(() => store.getters.isLoggedIn)
const connectedUsers = computed(() => store.state.connectedUsers)
const rootEntity = computed(() => props.rootResource?.data)
const showTeamMembers = computed(() => route.name === "Team")

// File action items - computed để tự động cập nhật khi pinnedFiles thay đổi
const fileActionItems = computed(() => {
  // Access pinnedFiles và menuRefreshKey để tạo reactive dependency
  const _ = pinnedFiles.value.length + menuRefreshKey.value
  return rootEntity.value ? dropdownActionItems(rootEntity.value) : []
})


const tab = computed({
  get() {
    return store.state.infoSidebarTab
  },
})

// Reactive data
const dialog = ref("")
const selectedEntity = ref(null)
const moreEvent = ref(false)
const menuRefreshKey = ref(0)

// More button handler
const onMoreClick = (event) => {
  selectedEntity.value = entity.value
  moreEvent.value = event
  event.stopPropagation()
  event.preventDefault()
}

// Context menu items
const dropdownActionItems = (row) => {
  if (!row) return []

  if (props.actions && props.actions.length > 0) {
    return props.actions
      .filter((a) => !a.isEnabled || a.isEnabled(row))
      .map((a) => ({
        ...a,
        action: (entities) => {
          moreEvent.value = false
          store.commit("setActiveEntity", entities[0])
          a.action(entities)
        },
      }))
  }

  return [
    {
      label: "Chia sẻ",
      icon: ShareIconBlack,
      action: ([entity]) => {
        moreEvent.value = false
        dialog.value = "s"
      },
      isEnabled: (e) => e.share,
      important: true,
    },
    {
      label: "Tải xuống",
      icon: CloudIconBlack,
      action: ([entity]) => {
        moreEvent.value = false
        entitiesDownload(route.params.team, [entity])
      },
    },
    {
      label: "Sao chép liên kết",
      icon: LinkIcon,
      action: ([entity]) => {
        moreEvent.value = false
        const currentUrl = window.location.origin + window.location.pathname
        navigator.clipboard.writeText(currentUrl)
        toast({
          title: "Đã sao chép liên kết",
          indicator: "green"
        })
      },
    },
    {
      label: "Chuyển quyền sở hữu",
      icon: MoveOwnerIcon,
      action: ([entity]) => {
        moreEvent.value = false
        dialog.value = "move_owner"
      },
      isEnabled: (row) => currentUserEmail.value === row?.owner,
    },
    {
      label: "Tạo lối tắt",
      icon: ShortcutIcon,
      action: ([entity]) => {
        moreEvent.value = false
        createShortcut(entity)
      },
      important: true,
      isEnabled: () =>
        !store.state.activeEntity?.is_shortcut || route.name !== "Home",
    },
    {
      label: "Bỏ lối tắt",
      icon: ShortcutIcon,
      action: ([entity]) => {
        moreEvent.value = false
        removeShortcut(entity)
      },
      important: true,
      isEnabled: () => store.state.activeEntity?.is_shortcut && route.name === "Home",
    },
    {
      label: "Ghim tài liệu",
      icon: LucidePin,
      action: async ([entity]) => {
        moreEvent.value = false
        const result = await togglePin(entity)
        if (result?.success) {
          // Force recompute menu items
          menuRefreshKey.value++
          toast({
            title: "Đã ghim tài liệu",
            indicator: "green"
          })
        }
      },
      important: true,
      isEnabled: (e) => !isPinned(e?.name) && !e?.is_group,
    },
    {
      label: "Bỏ ghim tài liệu",
      icon: LucidePinOff,
      action: async ([entity]) => {
        moreEvent.value = false
        const result = await togglePin(entity)
        if (result?.success) {
          // Force recompute menu items
          menuRefreshKey.value++
          toast({
            title: "Đã bỏ ghim tài liệu",
            indicator: "green"
          })
        }
      },
      important: true,
      isEnabled: (e) => isPinned(e?.name),
    },
    {
      label: "Tạo bản sao",
      icon: CopyIcon,
      action: ([entity]) => {
        moreEvent.value = false
        dialog.value = "copy"
      },
      important: true,
      isEnabled: (e) => !e?.is_shortcut,
    },
    {
      label: "Di chuyển",
      icon: MoveIcon,
      action: ([entity]) => {
        moreEvent.value = false
        dialog.value = "move"
      },
      isEnabled: (row) => row?.write,
    },
    {
      label: "Đổi tên",
      icon: RenameIcon,
      action: ([entity]) => {
        moreEvent.value = false
        dialog.value = "rn"
      },
      isEnabled: (row) => row?.write,
    },
    {
      label: "Hiển thị thông tin",
      icon: InfoIconBlack,
      action: ([entity]) => {
        moreEvent.value = false
        if (store.state.showInfo == false) {
          store.commit("setShowInfo", true)
          store.commit("setInfoSidebarTab", 0)
        }
      },
      isEnabled: () => store.state.activeEntity && !store.state.showInfo,
    },
    {
      label: "Lịch sử truy cập",
      icon: LucideHistory,
      action: ([entity]) => {
        moreEvent.value = false
        dialog.value = "activity_download_and_view"
      },
      isEnabled: (e) => currentUserEmail.value === e?.owner,
    },
    {
      label: "Ẩn thông tin",
      icon: InfoIcon,
      action: ([entity]) => {
        moreEvent.value = false
        dialog.value = "info"
      },
      isEnabled: () => store.state.activeEntity && store.state.showInfo,
    },
    {
      label: "Yêu thích",
      icon: FavoriteIcon,
      action: ([entity]) => {
        moreEvent.value = false
        entity.is_favourite = true
        toggleFav.submit({ entities: [entity] })
      },
      isEnabled: (e) => !e.is_favourite && e.is_active,
      important: true,
    },
    {
      label: "Bỏ yêu thích",
      icon: LucideStar,
      class: "stroke-amber-500 fill-amber-500",
      action: ([entity]) => {
        moreEvent.value = false
        entity.is_favourite = false
        toggleFav.submit({ entities: [entity] })
      },
      isEnabled: (e) => e.is_favourite && e.is_active,
      important: true,
    },
    {
      label: "Xóa",
      icon: TrashIcon,
      danger: true,
      action: ([entity]) => {
        moreEvent.value = false
        dialog.value = "remove"
      },
      isEnabled: (row) => row?.write,
    },
  ].filter((item) => !item.isEnabled || item.isEnabled(row))
}

// Tab switching
function switchTab(val) {
  if (store.state.showInfo == false) {
    store.commit("setShowInfo", !store.state.showInfo)
    store.commit("setInfoSidebarTab", val)
  } else if (tab.value == val) {
    store.commit("setShowInfo", !store.state.showInfo)
  } else {
    store.commit("setInfoSidebarTab", val)
  }
}

// Toggle favorite
function toggleFavorite() {
  if (!rootEntity.value) return
  
  // For MindMap, use route params entityName instead of rootEntity.name
  // because rootEntity might contain mindmap node data instead of Drive File entity
  let entityToFavorite = { ...rootEntity.value }
  
  if (route.name === 'MindMap' && route.params.entityName) {
    // Use route params entityName for MindMap to ensure we use Drive File entity name
    entityToFavorite.name = route.params.entityName
  }
  
  // Ensure we have a valid entity name
  if (!entityToFavorite.name) {
    console.error('Cannot toggle favorite: missing entity name', rootEntity.value)
    return
  }
  
  // Toggle state
  entityToFavorite.is_favourite = !entityToFavorite.is_favourite
  
  // Submit sẽ tự động hiển thị toast thông qua onSuccess callback
  toggleFav.submit({ entities: [entityToFavorite] })
}

// Watch selectedEntity
watch(selectedEntity, (k) => {
  if (k) {
    store.commit("setActiveEntity", k)
  }
})

// Button logic
const possibleButtons = [
  {
    route: "Recents",
    label: "Xóa tất cả",
    icon: LucideClock,
    entities: getRecents,
  },
  {
    route: "Favourites",
    label: "Xóa tất cả",
    icon: LucideStar,
    entities: getFavourites,
  },
  {
    route: "Trash",
    label: "Xóa tất cả",
    icon: LucideTrash,
    entities: getTrash,
    theme: "red",
  },
]

const button = computed(() =>
  possibleButtons.find((k) => k.route == route.name)
)

// Create new document
const newDocument = async () => {
  let data = await createDocument.submit({
    title: "Tài liệu mới",
    team: route.params.team,
    personal: store.state.breadcrumbs[0].name === "Home" ? 1 : 0,
    content: null,
    parent: store.state.currentFolder.name,
  })
  if (data?.name){
    await router.push({
      name: "Document",
      params: { team: route.params.team, entityName: data.name },
    })
  }
}

// Show dialog khi click vào MindMap
const showMindMapDialogHandler = () => {
  mindMapForm.value = {
    title: '',
    description: ''
  }
  showMindMapDialog.value = true
}

// Create new MindMap với tên và mô tả từ dialog
const handleCreateMindMap = async () => {
  if (!mindMapForm.value.title.trim()) {
    return
  }

  try {
    let data = await createMindMap.submit({
      title: mindMapForm.value.title,
      team: route.params.team,
      personal: store.state.breadcrumbs[0].name === "Home" ? 1 : 0,
      content: mindMapForm.value.description || null,
      parent: store.state.currentFolder.name,
      type: "mindmap",
    })
    
    if (data?.name) {
      showMindMapDialog.value = false
      await router.push({
        name: "MindMap",
        params: { team: route.params.team, entityName: data.name },
      })
    }
  } catch (error) {
    console.error('Error creating MindMap:', error)
  }
}

// Import MindMap handler
const importMindMapHandler = () => {
  // Tạo input file ẩn nếu chưa có
  if (!importMindMapInput.value) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.nmm,.nextgrp,.json'
    input.style.display = 'none'
    input.addEventListener('change', handleImportMindMapFile)
    document.body.appendChild(input)
    importMindMapInput.value = input
  }
  importMindMapInput.value.click()
}

// Handle import mindmap file
const handleImportMindMapFile = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  // Reset input
  if (importMindMapInput.value) {
    importMindMapInput.value.value = ''
  }

  // Validate file extension
  const fileName = file.name.toLowerCase()
  if (!fileName.endsWith('.nmm') && !fileName.endsWith('.nextgrp') && !fileName.endsWith('.json')) {
    toast({ 
      title: "File không hợp lệ. Vui lòng chọn file .nmm, .nextgrp hoặc .json", 
      indicator: "red" 
    })
    return
  }

  try {
    // Read file content
    const fileContent = await file.text()
    let nextgrpData

    try {
      nextgrpData = JSON.parse(fileContent)
    } catch (e) {
      toast({ 
        title: "File không phải định dạng JSON hợp lệ", 
        indicator: "red" 
      })
      return
    }

    // Validate NextGRP format
    if (!nextgrpData.format || nextgrpData.format !== 'nextgrp') {
      toast({ 
        title: "File không phải định dạng NextGRP hợp lệ", 
        indicator: "red" 
      })
      return
    }

    if (!nextgrpData.mindmap || !nextgrpData.mindmap.nodes) {
      toast({ 
        title: "File NextGRP thiếu dữ liệu mindmap", 
        indicator: "red" 
      })
      return
    }

    // Lấy tên mindmap từ file hoặc dùng tên file (bỏ extension)
    const mindmapTitle = nextgrpData.mindmap?.title || file.name.replace(/\.(nmm|nextgrp|json)$/i, '')
    
    // Tạo mindmap mới
    const createData = await createMindMap.submit({
      title: mindmapTitle,
      team: route.params.team,
      personal: store.state.breadcrumbs[0].name === "Home" ? 1 : 0,
      content: null,
      parent: store.state.currentFolder.name,
      type: "mindmap",
    })

    if (!createData?.name) {
      throw new Error("Không thể tạo mindmap mới")
    }

    // Import dữ liệu vào mindmap mới
    const response = await call("drive.api.mindmap.import_mindmap_nextgrp", {
      entity_name: createData.name,
      nextgrp_data: nextgrpData
    })

    if (response && response.message) {
      toast({ 
        title: `Import sơ đồ tư duy thành công`, 
        indicator: "green" 
      })

      // Chuyển đến mindmap mới
      await router.push({
        name: "MindMap",
        params: { team: route.params.team, entityName: createData.name },
      })
    } else {
      throw new Error("Import failed")
    }
  } catch (error) {
    console.error('Import error:', error)
    toast({ 
      title: `Lỗi khi import: ${error.message || 'Unknown error'}`, 
      indicator: "red" 
    })
  }
}

// Dropdown options
const uploadOptions = [
  {
    label: "Tải tệp lên",
    icon: LucideFileUp,
    onClick: () => emitter.emit("uploadFile"),
  },
  {
    label: "Tải lên thư mục",
    icon: LucideFolderUp,
    onClick: () => emitter.emit("uploadFolder"),
  },
  {
    label: "Nạp sơ đồ tư duy",
    icon: LucideFileDown,
    onClick: importMindMapHandler,
  },
]

const createOptions = [
  {
    label: "Tài liệu",
    icon: LucideFilePlus2,
    onClick: newDocument,
  },
  {
    label: "Thư mục",
    icon: LucideFolderPlus,
    onClick: () => emitter.emit("newFolder"),
  },
  {
    label: "Sơ đồ tư duy",
    icon: MindmapIcon,
    onClick: showMindMapDialogHandler,
  },
  {
    label: "Liên kết",
    icon: LucideLink,
    onClick: () => emitter.emit("newLink"),
  },
]

function downloadCurrentFile() {
  if (rootEntity.value?.name) {
    entitiesDownload(route.params.team, [rootEntity.value])
  }
}

function enterFullScreen() {
  const container = document.querySelector('.onlyoffice-container') 
    || document.querySelector('.image-preview-container')
    || document.querySelector('#renderContainer')
  
  if (!container) {
    console.error('Container not found')
    return
  }
  
  try {
    if (container.requestFullscreen) {
      container.requestFullscreen()
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen()
    } else if (container.mozRequestFullScreen) {
      container.mozRequestFullScreen()
    } else if (container.msRequestFullscreen) {
      container.msRequestFullscreen()
    }
    console.log('🖥️ Entering fullscreen...')
  } catch (err) {
    console.error('❌ Error entering fullscreen:', err)
  }
}

// Open sidebar function
const openSidebar = () => {
  store.commit("setIsSidebarExpanded", true)
  store.commit("setShowSidebarButton", false)
  store.commit("setShowPinnedSidebar", true)
}

// Show file context menu
const showFileContextMenu = (event) => {
  if (fileContextMenuRef.value && rootEntity.value) {
    store.commit("setActiveEntity", rootEntity.value)
    fileContextMenuRef.value.show(event)
  }
}
</script>

<style scoped>
.breadcrumbs-custom ::v-deep > div {
  flex-wrap: wrap !important;
}

.breadcrumbs-custom ::v-deep button,
.breadcrumbs-custom ::v-deep a,
.breadcrumbs-custom ::v-deep span {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  font-size: 0.875rem;
}

.breadcrumbs-custom ::v-deep .feather {
  width: 0.875rem;
  height: 0.875rem;
}
</style>