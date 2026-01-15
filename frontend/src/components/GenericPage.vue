<template>
  <Navbar
    v-if="!verify?.error && !getEntities.error"
    :actions="
      verify?.data &&
      actionItems
        .filter((k) => k.isEnabled?.(verify.data))
        .slice(1)
        .toSpliced(4, 1)
        .map((k) => ({ ...k, onClick: () => k.action([verify.data]) }))
    "
    :trigger-root="
      () => ((selections = new Set()), store.commit('setActiveEntity', null))
    "
    :root-resource="verify"
    @show-team-members="emit('show-team-members')"
  />

  <ErrorPage
    v-if="verify?.error || getEntities.error"
    :error="verify?.error || getEntities.error"
  />

  <div
    v-else
    ref="container"
    class="flex flex-col flex-1 bg-surface-white min-h-0"
    :style="{ paddingBottom: isMobile ? bottomBarHeight : '0' }"
    >
    <!-- Content Area with Team Members -->
    <div class="flex flex-1 min-h-0">
      <!-- Main Content -->
      <div class="flex-1 flex flex-col min-h-0">
        <DriveToolBar
          v-model="rows"
          :action-items="actionItems"
          :selections="selectedEntitities"
          :get-entities="getEntities"
          @filter-change="onFilterChange"
          @search-change="onSearchChange"
        />
        <div
          v-if="!props.getEntities.fetched"
          class="m-auto"
          style="transform: translate(0, -88.5px)"
        >
          <LoadingIndicator class="size-10 text-ink-gray-9" />
        </div>
        <NoFilesSection
          v-else-if="!rows || (Array.isArray(rows) && rows.length === 0)"
          :icon="icon"
          :primary-message="__(primaryMessage)"
          :secondary-message="__(secondaryMessage)"
        />
        <ListView
          v-else-if="$store.state.view === 'list'"
          v-model="selections"
          :folder-contents="rows && grouper(rows)"
          :action-items="actionItems"
          :user-data="userData"
          :get-entities="getEntities"
          :total-records="totalRecords"
          :loading="getEntities.loading"
          class="flex-1 min-h-0"
          @dropped="onDrop"
          @page-change="onPageChange"
        />
        <GridView
          v-else
          v-model="selections"
          :folder-contents="rows"
          :action-items="actionItems"
          :user-data="userData"
          @dropped="onDrop"
        />
      </div>
    </div>
    <InfoPopup :entities="infoEntities" />
  </div>

  <Dialogs
    v-model="dialog"
    :selected-rows="
      selectedEntitities.length
        ? selectedEntitities
        : activeEntity
        ? [activeEntity]
        : []
    "
    :root-resource="verify"
    :get-entities="getEntities"
  />
  <FileUploader
    v-if="$store.state.user.id"
    @success="getEntities.fetch()"
  />
</template>

<script setup>
import Dialogs from "@/components/Dialogs.vue"
import ErrorPage from "@/components/ErrorPage.vue"
import FileUploader from "@/components/FileUploader.vue"
import GridView from "@/components/GridView.vue"
import InfoPopup from "@/components/InfoPopup.vue"
import ListView from "@/components/ListView.vue"
import Navbar from "@/components/Navbar.vue"
import NoFilesSection from "@/components/NoFilesSection.vue"
import { clearRecent, toggleFav } from "@/resources/files"
import { allUsers } from "@/resources/permissions"
import { entitiesDownload } from "@/utils/download"
import { getLink } from "@/utils/getLink"

import { allFolders, move } from "@/resources/files"
import { settings } from "@/resources/permissions"
import { openEntity } from "@/utils/files"
import { toast } from "@/utils/toasts"
import { LoadingIndicator } from "frappe-ui"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useStore } from "vuex"

import CloudIconBlack from "@/assets/Icons/CloudIconBlack.vue"
import EyeIcon from "@/assets/Icons/EyeIcon.vue"
import FavoriteIcon from "@/assets/Icons/FavoriteIcon.vue"
import InfoIconBlack from "@/assets/Icons/InfoIconBlack.vue"
import LinkIcon from "@/assets/Icons/LinkIcon.vue"
import MoveIcon from "@/assets/Icons/MoveIcon.vue"
import RenameIcon from "@/assets/Icons/RenameIcon.vue"
import ShareIconBlack from "@/assets/Icons/ShareIconBlack.vue"
import ShortcutIcon from "@/assets/Icons/ShortcutIcon.vue"
import TrashIcon from "@/assets/Icons/TrashIcon.vue"
import { usePinnedFiles } from "@/composables/usePinnedFiles"
import { LucideHistory } from "lucide-vue-next"
import LucideClock from "~icons/lucide/clock"
import LucideExternalLink from "~icons/lucide/external-link"
import LucideInfo from "~icons/lucide/info"
import LucidePin from "~icons/lucide/pin"
import LucidePinOff from "~icons/lucide/pin-off"
import LucideRotateCcw from "~icons/lucide/rotate-ccw"
import LucideStar from "~icons/lucide/star"
import CopyIcon from "../assets/Icons/CopyIcon.vue"
import MoveOwnerIcon from "../assets/Icons/MoveOwnerIcon.vue"
import { getTeams } from "../resources/files"
import { createShortcut } from "../utils/files"

const props = defineProps({
  grouper: { type: Function, default: (d) => d },
  showSort: { type: Boolean, default: true },
  verify: { Object, default: null },
  icon: [Function, Object],
  primaryMessage: String,
  secondaryMessage: { type: String, default: "" },
  getEntities: Object,
})

const emit = defineEmits(["show-team-members"])

const route = useRoute()
const store = useStore()
const { pinFile, unpinFile } = usePinnedFiles()

const dialog = ref("")
const infoEntities = ref([])
const team = route.params.team
const entityName = route.params.entityName
const activeEntity = computed(() => store.state.activeEntity)
const rows = ref(props.getEntities.data)

// Pagination state
const currentPage = ref(1)
const pageSize = ref(20)
const totalRecords = ref(0)

// Filter and search state
const activeFilters = ref([])
const searchQuery = ref("")

// ✅ Responsive bottom padding
const isMobile = ref(false)
const bottomBarHeight = ref('0px')

const updateResponsive = () => {
  // Check if mobile (< 640px - Tailwind's sm breakpoint)
  isMobile.value = window.innerWidth < 640
  
  if (isMobile.value) {
    // Dynamically get BottomBar height
    const bottomBar = document.querySelector('.bottom-bar') // Thêm class này vào BottomBar component
    if (bottomBar) {
      const height = bottomBar.offsetHeight
      // Thêm safe-area-inset-bottom cho iOS notch
      bottomBarHeight.value = `calc(${height}px + env(safe-area-inset-bottom, 0px))`
    } else {
      // Fallback: 64px + safe area
      bottomBarHeight.value = 'calc(64px + env(safe-area-inset-bottom, 0px))'
    }
  } else {
    bottomBarHeight.value = '0px'
  }
}

onMounted(() => {
  updateResponsive()
  window.addEventListener('resize', updateResponsive)
  // Update sau khi DOM render xong
  setTimeout(updateResponsive, 100)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateResponsive)
})

watch(
  () => props.getEntities.data,
  (val) => {
    if (!val) {
      rows.value = null
      totalRecords.value = 0
      return
    }
    
    // Handle paginated response
    if (typeof val === 'object' && 'data' in val && 'total' in val) {
      totalRecords.value = Number(val.total) || 0
      rows.value = val.data
      console.log("GenericPage watch - paginated response:", {
        total: val.total,
        totalRecords: totalRecords.value,
        rowsLength: rows.value.length,
        dataType: typeof val.total
      })
    } else if (Array.isArray(val)) {
      // For backward compatibility with non-paginated response
      rows.value = val
      totalRecords.value = val.length
      console.log("GenericPage watch - array response, totalRecords:", totalRecords.value)
    } else {
      // Fallback
      rows.value = val
      totalRecords.value = 0
      console.log("GenericPage watch - fallback, totalRecords:", totalRecords.value)
    }
  },
  { immediate: true }
)

// Reset to first page when sorting changes
watch(
  () => store.state.sortOrder,
  () => {
    if (currentPage.value > 1) {
      currentPage.value = 1
    }
  },
  { deep: true }
)

// Computed for paginated folder contents
const paginatedFolderContents = computed(() => {
  if (!rows.value) return null
  
  // If already paginated response from API, return as is
  if (typeof rows.value === 'object' && 'data' in rows.value) {
    return rows.value
  }
  
  // Otherwise return the data for grouper
  return rows.value
})

const selections = ref(new Set())
const selectedEntitities = computed(
  () =>
    rows.value?.filter?.(({ name, is_shortcut, shortcut_name }) =>
      selections.value.has(is_shortcut ? shortcut_name : name)
    ) || []
)

// Helper function to build API params
const buildApiParams = () => {
  const params = {
    team,
    order_by:
      store.state.sortOrder.field +
      (store.state.sortOrder.ascending ? " 1" : " 0"),
    page: currentPage.value,
    page_size: pageSize.value,
  }
  
  // Add search parameter if exists
  if (searchQuery.value && searchQuery.value.trim()) {
    params.search = searchQuery.value.trim()
  }
  
  // Add file_kinds filter if exists
  if (activeFilters.value && activeFilters.value.length > 0) {
    params.file_kinds = JSON.stringify(activeFilters.value)
  }
  
  return params
}

// Handle filter change - reset to page 1 and fetch
const onFilterChange = async (filters) => {
  console.log("onFilterChange called with:", filters)
  activeFilters.value = filters
  currentPage.value = 1 // Reset to page 1
  
  try {
    const params = buildApiParams()
    console.log("Fetching with filter params:", params)
    await props.getEntities.fetch(params)
    console.log("Filter fetch completed")
  } catch (error) {
    console.error("Error fetching with filter:", error)
  }
}

// Handle search change - reset to page 1 and fetch
const onSearchChange = async (query) => {
  console.log("onSearchChange called with:", query)
  searchQuery.value = query
  currentPage.value = 1 // Reset to page 1
  
  try {
    const params = buildApiParams()
    console.log("Fetching with search params:", params)
    await props.getEntities.fetch(params)
    console.log("Search fetch completed")
  } catch (error) {
    console.error("Error fetching with search:", error)
  }
}

const verifyAccess = computed(() => props.verify?.data || !props.verify)

watch(
  verifyAccess,
  async (data) => {
    if (data) {
      console.log("verifyAccess changed, fetching data with params:", buildApiParams())
      await props.getEntities.fetch(buildApiParams())
      console.log("Initial fetch completed, data:", props.getEntities.data)
    }
  },
  { immediate: true }
)

// Handle page change from ListView
const onPageChange = async (pagination) => {
  console.log("onPageChange called with:", pagination)
  currentPage.value = pagination.page
  pageSize.value = pagination.pageSize
  
  try {
    await props.getEntities.fetch(buildApiParams())
    
    console.log("Fetch completed, data:", props.getEntities.data)
  } catch (error) {
    console.error("Error fetching page:", error)
  }
}

if (team) {
  allUsers.fetch({ team })
  allFolders.fetch({ team, entityName })
}
if (!settings.fetched) settings.fetch()

// Drag and drop
const onDrop = (targetFile, draggedItem) => {
  if (!targetFile.is_group || draggedItem === targetFile.name || !draggedItem)
    return
  move.submit({
    entity_names: [draggedItem],
    new_parent: targetFile.name,
  })
  const removedIndex = props.getEntities.data.findIndex(
    (k) => k.name === draggedItem
  )
  props.getEntities.data.splice(removedIndex, 1)
  props.getEntities.data.find((k) => k.name === targetFile.name).children += 1
  props.getEntities.setData(data)
}

const currentUserEmail = computed(() => store.state.user.id)

const isMember = computed(() => {
  console.log("Re-evaluating isMember", store.state.activeEntity,  currentUserEmail.value)

  return (
    getTeams.data?.[team]?.owner === currentUserEmail.value ||
    store.state.activeEntity?.owner === currentUserEmail.value || (store.state.activeEntity?.is_private !== 1 && store.state.activeEntity?.owner === currentUserEmail.value)
  )
})

// Action Items
const actionItems = computed(() => {
  if (route.name === "Trash") {
    return [
      {
        label: "Khôi phục",
        icon: LucideRotateCcw,
        action: () => (dialog.value = "restore"),
        multi: true,
        important: true
      },
      {
        label: "Xóa vĩnh viễn",
        icon: TrashIcon,
        action: () => (dialog.value = "d"),
        isEnabled: () => route.name === "Trash",
        multi: true,
        danger: true,
      },
    ].filter((a) => !a.isEnabled || a.isEnabled())
  } else {
    return [
      {
        label: "Xem trước",
        icon: EyeIcon,
        action: ([entity]) => openEntity(team, entity),
        isEnabled: (e) => !e.is_link,
      },
      {
        label: "Mở",
        icon: LucideExternalLink,
        action: ([entity]) => openEntity(team, entity),
        isEnabled: (e) => e.is_link,
      },
      { divider: true },
      {
        label: "Chia sẻ",
        icon: ShareIconBlack,
        action: () => (dialog.value = "s"),
        isEnabled: (e) => e.share && !e?.is_shortcut,
        important: true,
      },
      {
        label: "Chuyển quyền sở hữu",
        icon: MoveOwnerIcon,
        action: () => (dialog.value = "move_owner"),
        isEnabled: (e) =>
          currentUserEmail.value === e?.owner && !e?.is_shortcut,
        important: true,
      },
      {
        label: "Tạo lối tắt",
        icon: ShortcutIcon,
        action: ([entity]) => createShortcut(entity),
        important: true,
        isEnabled: (e) => !e?.is_shortcut,
      },
      {
        label: "Tạo bản sao",
        icon: CopyIcon,
        action: () => (dialog.value = "copy"),
        important: true,
        isEnabled: (e) => !e?.is_shortcut,
      },
      {
        label: "Tải xuống",
        icon: CloudIconBlack,
        isEnabled: (e) => !e.is_link,
        action: (entities) => entitiesDownload(team || store.state.activeEntity?.team, entities),
        multi: true,
        important: true,
        isEnabled: (e) => !e?.is_shortcut || route.name !== "Home",
      },
      {
        label: "Sao chép liên kết",
        icon: LinkIcon,
        action: ([entity]) => getLink(entity),
        important: true,
        isEnabled: (e) => !e?.is_shortcut,
      },
      { divider: true },
      {
        label: "Di chuyển",
        icon: MoveIcon,
        action: () => (dialog.value = "move"),
        isEnabled: (e) => e.write && isMember.value && e.is_active,
        important: true,
      },
      {
        label: "Đổi tên",
        icon: RenameIcon,
        action: () => (dialog.value = "rn"),
        isEnabled: () => true,
      },
      {
        label: "Hiển thị thông tin",
        icon: InfoIconBlack,
        action: () => infoEntities.value.push(store.state.activeEntity),
        isEnabled: () => store.state.activeEntity && !store.state.showInfo,
      },
      {
        label: "Lịch sử truy cập",
        icon: LucideHistory,
        action: () => (dialog.value = "activity_download_and_view"),
        isEnabled: (e) => currentUserEmail.value === e?.owner || isMember.value,
      },
      {
        label: "Ẩn thông tin",
        icon: LucideInfo,
        action: () => (dialog.value = "info"),
        isEnabled: () => store.state.activeEntity && store.state.showInfo,
      },
      {
        label: "Yêu thích",
        icon: FavoriteIcon,
        action: (entities) => {
          entities.forEach((e) => (e.is_favourite = true))
          props.getEntities.setData(props.getEntities.data)
          toggleFav.submit({ entities })
        },
        isEnabled: (e) => !e.is_favourite && e.is_active,
        important: true,
        multi: true,
      },
      {
        label: "Bỏ yêu thích",
        icon: LucideStar,
        class: "stroke-amber-500 fill-amber-500",
        action: (entities) => {
          entities.forEach((e) => (e.is_favourite = false))
          props.getEntities.setData(props.getEntities.data)
          toggleFav.submit({ entities })
        },
        isEnabled: (e) => e.is_favourite && e.is_active,
        important: true,
        multi: true,
      },
      {
        label: "Ghim tài liệu",
        icon: LucidePin,
        action: async ([entity]) => {
          const result = await pinFile(entity)
          if (result && result.success) {
            // Reload data để cập nhật is_pinned từ backend
            await props.getEntities.reload()
            toast("Đã ghim tài liệu")
          } else {
            toast("Lỗi: " + (result?.message || "Không thể ghim tài liệu"))
          }
        },
        isEnabled: (e) => !e.is_group && !e.is_pinned && e.is_active,
        important: true,
      },
      {
        label: "Bỏ ghim tài liệu",
        icon: LucidePinOff,
        action: async ([entity]) => {
          const result = await unpinFile(entity.name)
          if (result && result.success) {
            // Reload data để cập nhật is_pinned từ backend
            await props.getEntities.reload()
            toast("Đã bỏ ghim tài liệu")
          } else {
            toast("Lỗi: " + (result?.message || "Không thể bỏ ghim"))
          }
        },
        isEnabled: (e) => !e.is_group && e.is_pinned && e.is_active,
        important: true,
      },
      {
        label: "Xóa khỏi gần đây",
        icon: LucideClock,
        action: (entities) => {
          clearRecent.submit({
            entities,
          })
        },
        isEnabled: () => route.name == "Recents",
        important: true,
        multi: true,
      },
      { divider: true, isEnabled: (e) => e.write },
      {
        label: "Xóa",
        icon: TrashIcon,
        action: () => (dialog.value = "remove"),
        isEnabled: (e) => !!isMember.value || e.write,
        important: true,
        multi: true,
        danger: true,
        color: "text-ink-red-4",
      },
    ]
  }
})

const userData = computed(() =>
  allUsers.data ? Object.fromEntries(allUsers.data.map((k) => [k.name, k])) : {}
)

async function newLink() {
  if (!document.hasFocus()) return
  try {
    const text = await navigator.clipboard.readText()
    if (localStorage.getItem("prevClip") === text) return
    localStorage.setItem("prevClip", text)
    url = new URL(text)
    if (url.host)
      toast({
        title: "Link detected",
        text,
        buttons: [
          {
            label: "Add",
            action: () => {
              dialog.value = "l"
            },
          },
        ],
      })
  } catch (_) {}
}

if (settings.data?.auto_detect_links) {
  newLink()
  window.addEventListener("focus", newLink)
  window.addEventListener("copy", newLink)
}
</script>

<style scoped>
/* Ensure safe-area is respected on iOS */
@supports (padding: env(safe-area-inset-bottom)) {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom);
  }
}
</style>