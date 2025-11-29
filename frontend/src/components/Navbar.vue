<template>
  <nav
    ondragstart="return false;"
    ondrop="return false;"
    class="bg-surface-white border-b w-full px-5 py-2.5 flex items-center flex-wrap gap-2 justify-between min-h-[56px] sm:min-h-[70px]"
  >
    <div class="flex flex-row flex-wrap gap-2">
      <Breadcrumbs
        :items="store.state.breadcrumbs"
        class="select-none !truncate breadcrumbs-custom"
      >
        <template #prefix="{ item, index }">
          <LoadingIndicator
            v-if="item.loading"
            width="20"
            scale="70"
          />
          <div
            v-if="index == 0"
            class="mr-1.5"
          >
            <component
              :is="COMPONENT_MAP[item.name]"
              class="size-4 text-ink-gray-6 !truncate"
            />
          </div>
        </template>
      </Breadcrumbs>
      <LucideStar
        v-if="rootEntity?.is_favourite"
        width="16"
        height="16"
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
        <p class="text-[14px] font-medium text-[#404040] whitespace-nowrap">
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
            class="rounded-[6px] px-3 h-[40px] !bg-[#0149C1] !text-white !font-[400px] whitespace-nowrap"
          >
            <template #prefix>
              <UploadDrive class="size-5" />
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
            class="rounded-[6px] px-3 h-[40px] !bg-[#0149C1] !text-white !font-[400px]"
          >
            <template #prefix>
              <NewDrive class="size-5" />
            </template>
            Thêm mới
          </Button>
        </Dropdown>
      </div>

      <Button
        v-if="button"
        class="line-clamp-1 truncate w-full"
        :disabled="!button.entities.data?.length"
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
      class="flex flex-row items-center h-full gap-[12px] pt-3 px-2 z-0 bg-surface-white"
      v-if="route.name === 'File'"
    >
      <Button :variant="'ghost'" @click="enterFullScreen">
        <LucideScan class="w-4 h-4" />
      </Button>
      
      <Button
        class="text-ink-gray-5 !px-0"
        :class="[
          tab === 0
            ? 'text-black bg-transparent'
            : ' hover:bg-surface-menu-bar',
        ]"
        variant="minimal"
        @click="switchTab(0)"
      >
        <InfoIcon
          :class="
            tab === 0 && store.state.showInfo
              ? 'size-6 text-[#0149C1]'
              : 'size-6 text-black'
          "
        />
      </Button>
    </div>

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
import emitter from "@/emitter"
import {
  createDocument,
  createMindMap,
  getFavourites,
  getRecents,
  getTrash,
} from "@/resources/files"
import { entitiesDownload } from "@/utils/download"
import {
  Breadcrumbs,
  Button,
  Dropdown,
  LoadingIndicator
} from "frappe-ui"
import PrimeButton from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useStore } from "vuex"
import LucideBuilding2 from "~icons/lucide/building-2"
import LucideClock from "~icons/lucide/clock"
import LucideFilePlus2 from "~icons/lucide/file-plus-2"
import LucideFileUp from "~icons/lucide/file-up"
import LucideFolderPlus from "~icons/lucide/folder-plus"
import LucideFolderUp from "~icons/lucide/folder-up"
import LucideHome from "~icons/lucide/home"
import LucideLink from "~icons/lucide/link"
import LucideScan from "~icons/lucide/scan"
import LucideStar from "~icons/lucide/star"
import LucideTrash from "~icons/lucide/trash"
import LucideUsers from "~icons/lucide/users"
import MoveOwnerIcon from "../assets/Icons/MoveOwnerIcon.vue"
import ShortcutIcon from "../assets/Icons/ShortcutIcon.vue"
import { getTeamMembers } from "../resources/team"
import Dialogs from "./Dialogs.vue"
import UsersBar from "./UsersBar.vue"

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

// MindMap Dialog
const showMindMapDialog = ref(false)
const mindMapForm = ref({
  title: '',
  description: ''
})

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

const dialogContextMenu = ref("")

const tab = computed({
  get() {
    return store.state.infoSidebarTab
  },
})

// Reactive data
const dialog = ref("")
const selectedEntity = ref(null)
const moreEvent = ref(false)

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
        handler: () => {
          moreEvent.value = false
          store.commit("setActiveEntity", row)
          a.action([row])
        },
      }))
  }

  return [
    {
      label: "Chia sẻ",
      icon: ShareIconBlack,
      handler: () => {
        moreEvent.value = false
        dialogContextMenu.value = "s"
      },
      isEnabled: (e) => e.share,
      important: true,
    },
    {
      label: "Tải xuống",
      icon: CloudIconBlack,
      handler: () => {
        moreEvent.value = false
        entitiesDownload(route.params.team, [row])
      },
    },
    {
      label: "Sao chép liên kết",
      icon: LinkIcon,
      handler: () => {
        moreEvent.value = false
        const currentUrl = window.location.origin + window.location.pathname
        navigator.clipboard.writeText(currentUrl)
      },
    },
    {
      label: "Chuyển quyền sở hữu",
      icon: MoveOwnerIcon,
      handler: () => {
        moreEvent.value = false
        dialogContextMenu.value = "move_owner"
      },
      isEnabled: (row) => currentUserEmail.value === row?.owner,
    },
    {
      label: "Tạo lối tắt",
      icon: ShortcutIcon,
      action: ([entity]) => createShortcut(entity),
      important: true,
      isEnabled: () =>
        !store.state.activeEntity?.is_shortcut || route.name !== "Home",
    },
    {
      label: "Bỏ lối tắt",
      icon: ShortcutIcon,
      action: ([entity]) => removeShortcut(entity),
      important: true,
      isEnabled: () => store.state.activeEntity?.is_shortcut && route.name === "Home",
    },
    { divider: true },
    {
      label: "Di chuyển",
      icon: MoveIcon,
      handler: () => {
        moreEvent.value = false
        dialogContextMenu.value = "m"
      },
      isEnabled: (row) => row?.write,
    },
    {
      label: "Đổi tên",
      icon: RenameIcon,
      handler: () => {
        moreEvent.value = false
        dialogContextMenu.value = "rn"
      },
      isEnabled: (row) => row?.write,
    },
    {
      label: "Hiển thị thông tin",
      icon: InfoIconBlack,
      handler: () => {
        moreEvent.value = false
        store.commit("setShowInfo", true)
        store.commit("setInfoSidebarTab", 0)
      },
    },
    { divider: true },
    {
      label: "Xóa",
      icon: TrashIcon,
      danger: true,
      handler: () => {
        moreEvent.value = false
        dialogContextMenu.value = "remove"
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

function enterFullScreen() {
  const container = document.querySelector('.onlyoffice-container')
  
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
</script>

<style scoped>
.breadcrumbs-custom ::v-deep > div {
  flex-wrap: wrap !important;
}
</style>