<template>
  <nav
    ondragstart="return false;"
    ondrop="return false;"
    class="bg-surface-white border-b w-full px-5 py-2.5 flex items-center flex-wrap gap-2 justify-between min-h-[72px]"
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
            Mới
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
      class="flex flex-row items-center h-full gap-[17px] pt-3 px-2 z-0 bg-surface-white"
      v-if="route.name === 'File' "
    >
      <Button
        v-if="entity"
        class="text-ink-gray-5 !px-0"
        :class="[
          tab === 1
            ? 'bg-transparent text-[#0149C1]'
            : 'hover:bg-surface-menu-bar',
        ]"
        variant="minimal"
        @click="switchTab(1)"
      >
        <MessageIcon
          :class="
            tab === 1 && store.state.showInfo
              ? 'size-6 text-[#0149C1]'
              : 'size-6 text-black'
          "
        />
      </Button>

      <!-- <Button
        v-if="entity"
        class="text-ink-gray-5 !px-0"
        :class="[
          tab === 2
            ? 'text-black bg-transparent'
            : ' hover:bg-surface-menu-bar',
        ]"
        variant="minimal"
        @click="switchTab(2)"
      >
        <CloudIcon
          :class="
            tab === 2 && store.state.showInfo
              ? 'size-6 text-[#0149C1]'
              : 'size-6 text-black'
          "
        />
      </Button> -->

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

      <!-- Context Menu Button -->
      <!-- <Button
        class="text-ink-gray-5 !px-0 hover:bg-surface-menu-bar"
        variant="minimal"
        @click="onMoreClick"
      >
        <MoreIcon class="size-6 text-black" />
      </Button> -->
    </div>

    <!-- Context Menu -->
    <!-- <ContextMenu
      v-if="moreEvent && selectedEntity"
      :key="selectedEntity?.name || 'context-menu'"
      v-on-outside-click="() => (moreEvent = false)"
      :close="() => (moreEvent = false)"
      :action-items="dropdownActionItems(selectedEntity)"
      :event="moreEvent"
    /> -->

    <Dialogs
      v-if="$route.name === 'File' || $route.name === 'Document'"
      v-model="dialog"
      :root-resource="rootResource"
      :get-entities="getEntities"
    />

    <!-- Fixed Dialogs for Context Menu -->
    <!-- <Dialogs
      v-model="dialogContextMenu"
      :selected-rows="entity ? [entity] : []"
      :root-resource="props.rootResource"
      :get-entities="getEntities"
    /> -->
  </nav>
</template>

<script setup>
import CloudIconBlack from "@/assets/Icons/CloudIconBlack.vue"
import InfoIcon from "@/assets/Icons/InfoIcon.vue"
import InfoIconBlack from "@/assets/Icons/InfoIconBlack.vue"
import LinkIcon from "@/assets/Icons/LinkIcon.vue"
import MessageIcon from "@/assets/Icons/MessageIcon.vue"
import MoveIcon from "@/assets/Icons/MoveIcon.vue"
import NewDrive from "@/assets/Icons/NewDrive.vue"
import RenameIcon from "@/assets/Icons/RenameIcon.vue"
import ShareIconBlack from "@/assets/Icons/ShareIconBlack.vue"
import TrashIcon from "@/assets/Icons/TrashIcon.vue"
import UploadDrive from "@/assets/Icons/UploadDrive.vue"
import emitter from "@/emitter"
import {
  createDocument,
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
  getEntities: Function, // Add this prop
})

console.log("Navbar getEntities prop:", props.getEntities)

// Composables
const store = useStore()
const route = useRoute()
const router = useRouter()

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

// Context menu items - FIXED
const dropdownActionItems = (row) => {
  if (!row) return []

  // Nếu có actions được truyền từ props, sử dụng chúng
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

  // Default actions cho file - FIXED handlers
  return [
    {
      label: "Chia sẻ",
      icon: ShareIconBlack,
      handler: () => {
        moreEvent.value = false
        dialogContextMenu.value = "s" // Fixed from "s" to "share"
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
        // Get current file URL
        const currentUrl = window.location.origin + window.location.pathname
        navigator.clipboard.writeText(currentUrl)
        // Optional: Show toast notification
        console.log("Link copied to clipboard")
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
      isEnabled: () =>{
        console.log(store.state.activeEntity, "store.state.activeEntity()")
        return store.state.activeEntity?.is_shortcut && route.name === "Home"},
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
        store.commit("setInfoSidebarTab", 0) // Set to info tab
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
    label: "Liên kết mới",
    icon: LucideLink,
    onClick: () => emitter.emit("newLink"),
  },
]
</script>

<style scoped>
.breadcrumbs-custom ::v-deep > div {
  flex-wrap: wrap !important;
}
</style>
