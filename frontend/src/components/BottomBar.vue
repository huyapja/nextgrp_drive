<template>
  <div class="bottom-bar border-r bg-surface-menu-bar transition-all">
    <div
      ondragstart="return false;"
      ondrop="return false;"
      class="grid grid-cols-7 h-14 items-center border-y border-outline-gray-2 standalone:pb-4 px-1"
    >
      <template v-for="item in sidebarItems" :key="item.label">
        <!-- Storage button (no route) -->
        <button
          v-if="item.isStorage"
          class="flex flex-col items-center justify-center py-3 transition active:scale-95 rounded relative hover:bg-surface-gray-2"
          @click="openStorage"
        >
          <component
            :is="item.icon"
            class="self-center w-5 h-5 text-ink-gray-8"
          />
        </button>
        
        <!-- Regular nav items -->
        <router-link
          v-else
          v-slot="{ href, navigate }"
          :to="item.route"
        >
          <a
            v-if="item.label !== 'Team'"
            class="flex flex-col items-center justify-center py-3 transition active:scale-95 rounded relative"
            :class="[
              item.highlight()
                ? 'bg-surface-white shadow-sm border-[0.5px] border-outline-gray-2'
                : ' hover:bg-surface-gray-2',
            ]"
            :href="href"
            @click="navigate && $emit('toggleMobileSidebar')"
          >
            <component
              :is="item.icon"
              class="self-center w-5 h-5 text-ink-gray-8"
            />
          </a>
        
        <!-- Team button with dropdown -->
        <div
          v-else
          class="relative team-dropdown-container"
          @mouseenter="handleMouseEnter"
          @mouseleave="handleMouseLeave"
        >
          <button
            class="flex flex-col items-center justify-center py-3 transition active:scale-95 rounded w-full"
            :class="[
              item.highlight()
                ? 'bg-surface-white shadow-sm border-[0.5px] border-outline-gray-2'
                : ' hover:bg-surface-gray-2',
            ]"
            @click="toggleTeamTooltip"
            @touchstart.prevent="handleTouchStart"
          >
            <component
              :is="item.icon"
              class="stroke-1.5 self-center w-auto h-5.5 text-ink-gray-8"
            />
          </button>

          <!-- Team Dropdown Tooltip -->
          <Transition name="fade-slide">
            <div
              v-if="showTeamTooltip"
              class="absolute left-full bottom-[100%] !left-[-50%]  ml-2 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] flex flex-col max-h-80"
              @mouseenter="clearTooltipTimeout"
              @mouseleave="handleMouseLeave"
              @touchstart.stop
            >
              <!-- Teams List with scrollable area -->
              <div class="py-1 overflow-y-auto flex-1 min-w-[180px] max-w-[180px]">
                <div
                  v-for="teamItem in teamList"
                  :key="teamItem.name"
                  @click="selectTeam(teamItem)"
                  class="flex items-center justify-between px-3 py-2 hover:bg-[#d4e1f9] cursor-pointer transition-colors duration-150 group"
                  :class="{
                    'bg-[#d4e1f9]': team === teamItem.name,
                  }"
                >
                  <span
                    class="text-sm text-gray-700 flex-1 group-hover:text-gray-900 truncate max-w-[82%]"
                    :class="{
                      'text-blue-600 font-medium': team === teamItem.name,
                    }"
                  >
                    {{ teamItem.title }}
                  </span>
                  <button
                    v-if="canEditTeam(teamItem)"
                    class="p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-gray-100 rounded-full transition-all duration-150"
                    title="Chỉnh sửa tên nhóm"
                    @click="handleEditTeamClick($event, teamItem)"
                  >
                    <Pencil class="h-3 w-3 text-gray-400 hover:text-gray-600" />
                  </button>
                </div>
              </div>

              <!-- Create new team - Fixed at bottom -->
              <div class="border-t border-gray-100 py-1 flex-shrink-0">
                <button
                  @click="createNewTeam"
                  class="flex items-center px-3 py-2 text-sm text-[#0149C1] hover:bg-blue-50 transition-colors duration-150 w-full text-left"
                >
                  <AddCircleDrive class="mr-2" />
                  Tạo nhóm mới
                </button>
              </div>
            </div>
          </Transition>
        </div>
        </router-link>
      </template>
    </div>

    <!-- Create Team Modal -->
    <Dialog
      v-model="showCreateTeamModal"
      :options="{
        title: 'Tạo nhóm mới',
        size: '2xl',
      }"
    >
      <template #body-content>
        <div class="space-y-6">
          <div class="text-center">
            <div
              class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100"
            >
              <LucideBuilding2 class="h-6 w-6 text-blue-600" />
            </div>
            <div class="mt-3">
              <h3 class="text-lg font-medium text-gray-900">Tạo nhóm mới</h3>
              <p class="mt-2 text-sm text-black">
                Tạo một nhóm mới để cộng tác và chia sẻ tài liệu với thành viên khác.
              </p>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Tên nhóm <span class="text-red-500">*</span>
            </label>
            <FormControl
              v-model="newTeamName"
              type="text"
              placeholder="Nhập tên nhóm..."
              :disabled="createTeamLoading"
              class="w-full"
              @keyup.enter="handleCreateTeam"
            />
          </div>
        </div>
      </template>
      <template #actions>
        <ButtonFrappe
          variant="ghost"
          @click="showCreateTeamModal = false"
          :disabled="createTeamLoading"
          class="mr-3"
        >
          Hủy
        </ButtonFrappe>
        <ButtonFrappe
          variant="solid"
          @click="handleCreateTeam"
          :loading="createTeamLoading"
          class="!bg-[#0149C1] text-white hover:!opacity-90"
        >
          Tạo nhóm
        </ButtonFrappe>
      </template>
    </Dialog>

    <!-- Rename Team Dialog -->
    <Dialog
      v-model="showRenameTeamModal"
      :options="{ title: 'Đổi tên nhóm', size: 'md' }"
    >
      <template #body-content>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Tên nhóm mới <span class="text-red-500">*</span>
            </label>
            <FormControl
              v-model="renameTeamName"
              type="text"
              placeholder="Nhập tên nhóm mới..."
              :disabled="renameTeamLoading"
              class="w-full"
              @keyup.enter="handleRenameTeam"
            />
          </div>
        </div>
      </template>
      <template #actions>
        <div class="flex flex-row justify-end">
          <ButtonFrappe
            variant="ghost"
            @click="showRenameTeamModal = false"
            :disabled="renameTeamLoading"
            class="mr-3 border border-gray-300 rounded-md"
          >
            Hủy
          </ButtonFrappe>
          <ButtonFrappe
            variant="solid"
            @click="handleRenameTeam"
            :loading="renameTeamLoading"
            class="!bg-[#0149C1] text-white hover:!opacity-90"
          >
            Đổi tên
          </ButtonFrappe>
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script>
import AddCircleDrive from "@/assets/Icons/AddCircleDrive.vue"
import DocIconDrive from "@/assets/Icons/DocIconDrive.vue"
import RecentDrive from "@/assets/Icons/RecentDrive.vue"
import ShareDrive from "@/assets/Icons/ShareDrive.vue"
import StarDrive from "@/assets/Icons/StarDrive.vue"
import TeamDrive from "@/assets/Icons/TeamDrive.vue"
import TrashDrive from "@/assets/Icons/TrashDrive.vue"
import { getTeams } from "@/resources/files"
import { toast } from "@/utils/toasts"
import { Button as ButtonFrappe, Dialog, FormControl } from "frappe-ui"
import { Pencil } from "lucide-vue-next"
import LucideBuilding2 from "~icons/lucide/building-2"
import LucideCloud from "~icons/lucide/cloud"

export default {
  name: "Sidebar",
  components: {
    AddCircleDrive,
    DocIconDrive,
    RecentDrive,
    ShareDrive,
    StarDrive,
    TeamDrive,
    TrashDrive,
    ButtonFrappe,
    Dialog,
    FormControl,
    Pencil,
    LucideBuilding2,
    LucideCloud,
  },
  inject: ["emitter"],
  emits: ["toggleMobileSidebar"],
  data() {
    return {
      sidebarResizing: false,
      showTeamTooltip: false,
      showCreateTeamModal: false,
      showRenameTeamModal: false,
      newTeamName: "",
      renameTeamName: "",
      renameTargetTeam: null,
      tooltipLeaveTimeout: null,
    }
  },
  computed: {
    isExpanded() {
      return this.$store.state.IsSidebarExpanded
    },
    team() {
      return this.$route.params.team || localStorage.getItem("recentTeam")
    },
    teamList() {
      return Object.values(getTeams.data || {})
    },
    createTeamLoading() {
      return this.createTeam?.loading ?? false
    },
    renameTeamLoading() {
      return this.renameTeam?.loading ?? false
    },
    sidebarItems() {
      return [
        {
          label: __("Home"),
          route: "/t/" + this.team,
          icon: DocIconDrive,
          highlight: () => {
            return this.$store.state.breadcrumbs[0]?.name === "Home"
          },
        },
        {
          label: "Team",
          route: "/t/" + this.team + "/team",
          icon: TeamDrive,
          highlight: () => {
            return this.$store.state.breadcrumbs[0]?.name === "Team"
          },
        },
        {
          label: __("Recents"),
          route: "/t/" + this.team + "/recents",
          icon: RecentDrive,
          highlight: () => {
            return this.$store.state.breadcrumbs[0]?.name === "Recents"
          },
        },
        {
          label: __("Favourites"),
          route: "/t/" + this.team + "/favourites",
          icon: StarDrive,
          highlight: () => {
            return this.$store.state.breadcrumbs[0]?.name === "Favourites"
          },
        },
        {
          label: __("Shared"),
          route: "/shared",
          icon: ShareDrive,
          highlight: () => {
            return this.$store.state.breadcrumbs[0]?.name === "Shared"
          },
        },
        {
          label: __("Trash"),
          route: "/t/" + this.team + "/trash",
          icon: TrashDrive,
          highlight: () => {
            return this.$store.state.breadcrumbs[0]?.name === "Trash"
          },
        },
        {
          label: __("Storage"),
          route: null,
          icon: LucideCloud,
          highlight: () => false,
          isStorage: true,
        },
      ]
    },
  },
  mounted() {
    getTeams.fetch()
    // Close tooltip when clicking outside
    document.addEventListener('click', this.handleClickOutside)
    document.addEventListener('touchstart', this.handleClickOutside)
  },
  beforeUnmount() {
    document.removeEventListener('click', this.handleClickOutside)
    document.removeEventListener('touchstart', this.handleClickOutside)
    this.clearTooltipTimeout()
  },
  methods: {
    handleClickOutside(event) {
      // Close tooltip when clicking outside
      const teamButton = event.target.closest('.team-dropdown-container')
      if (!teamButton && this.showTeamTooltip) {
        this.showTeamTooltip = false
        this.clearTooltipTimeout()
      }
    },
    toggleExpanded() {
      return this.$store.commit(
        "setIsSidebarExpanded",
        this.isExpanded ? false : true
      )
    },
    handleMouseEnter() {
      // Only for desktop
      if (window.innerWidth >= 640) {
        this.clearTooltipTimeout()
        this.showTeamTooltip = true
      }
    },
    handleMouseLeave() {
      // Only for desktop
      if (window.innerWidth >= 640) {
        this.tooltipLeaveTimeout = setTimeout(() => {
          this.showTeamTooltip = false
        }, 150)
      }
    },
    handleTouchStart() {
      // For mobile/touch devices
      this.toggleTeamTooltip()
    },
    clearTooltipTimeout() {
      if (this.tooltipLeaveTimeout) {
        clearTimeout(this.tooltipLeaveTimeout)
        this.tooltipLeaveTimeout = null
      }
    },
    toggleTeamTooltip() {
      this.showTeamTooltip = !this.showTeamTooltip
    },
    handleTooltipLeave() {
      // Add small delay before hiding to allow moving mouse to tooltip
      this.tooltipLeaveTimeout = setTimeout(() => {
        this.showTeamTooltip = false
      }, 150)
    },
    selectTeam(team) {
      this.showTeamTooltip = false
      this.clearTooltipTimeout()
      this.$router.push(`/t/${team.name}/team`)
      this.$emit('toggleMobileSidebar')
    },
    openStorage() {
      this.emitter.emit("showSettings", 2)
    },
    handleEditTeamClick(event, teamItem) {
      event.preventDefault()
      event.stopPropagation()
      this.openRenameTeamDialog(teamItem)
    },
    createNewTeam() {
      this.showTeamTooltip = false
      this.clearTooltipTimeout()
      this.showCreateTeamModal = true
    },
    handleCreateTeam() {
      if (!this.newTeamName?.trim()) {
        toast("Vui lòng nhập tên nhóm.")
        return
      }
      this.createTeam.submit()
    },
    openRenameTeamDialog(teamItem) {
      if (!this.canEditTeam(teamItem)) {
        toast("Bạn không có quyền đổi tên nhóm này.")
        return
      }
      this.renameTargetTeam = teamItem
      this.renameTeamName = teamItem.title
      this.showTeamTooltip = false
      this.clearTooltipTimeout()
      this.showRenameTeamModal = true
    },
    handleRenameTeam() {
      if (!this.renameTeamName?.trim()) {
        toast("Vui lòng nhập tên nhóm mới.")
        return
      }
      if (this.renameTeamName.trim() === this.renameTargetTeam?.title) {
        toast("Tên mới không được giống tên hiện tại.")
        return
      }
      this.renameTeam.submit()
    },
    canEditTeam(teamItem) {
      const currentUserId = this.$store.state.user.id
      
      if (teamItem.name === this.settings?.data?.default_team) {
        return false
      }
      
      if (teamItem.users && Array.isArray(teamItem.users)) {
        const userMember = teamItem.users.find(
          (member) => member.user === currentUserId || member.user_id === currentUserId
        )
        if (userMember && userMember.access_level === 2) {
          return true
        }
      }
      
      if (teamItem.user_role === "admin" || teamItem.user_role === "owner") {
        return true
      }
      
      if (teamItem.can_edit === true) {
        return true
      }
      
      return false
    },
    startResize() {
      document.addEventListener("mousemove", this.resize)
      document.addEventListener("mouseup", () => {
        document.body.classList.remove("select-none")
        document.body.classList.remove("cursor-col-resize")
        this.sidebarResizing = false
        document.removeEventListener("mousemove", this.resize)
      })
    },
    resize(e) {
      this.sidebarResizing = true
      document.body.classList.add("select-none")
      document.body.classList.add("cursor-col-resize")
      let sidebarWidth = e.clientX
      let range = [60, 180]
      if (sidebarWidth > range[0] && sidebarWidth < range[1]) {
        sidebarWidth = 60
        this.$store.commit("setIsSidebarExpanded", false)
      }
      if (sidebarWidth > 180) {
        this.$store.commit("setIsSidebarExpanded", true)
      }
    },
  },
  resources: {
    getRootFolderSize() {
      return {
        url: "drive.api.files.get_user_directory_size",
        onError(error) {
          console.log(error)
        },
        auto: false,
      }
    },
    settings() {
      return {
        url: "/api/method/drive.api.product.get_settings",
        method: "GET",
        cache: "settings",
        auto: true,
      }
    },
    createTeam() {
      return {
        url: "drive.api.product.create_personal_team",
        makeParams: () => ({
          team_name: this.newTeamName,
          email: this.$store.state.user.id,
        }),
        onSuccess: (data) => {
          if (data) {
            toast("Nhóm đã được tạo thành công!")
            getTeams.fetch()
            this.showCreateTeamModal = false
            this.newTeamName = ""
            this.$router.push(`/t/${data}/team`)
          }
        },
        onError: (error) => {
          toast("Không thể tạo nhóm. Vui lòng thử lại.")
          console.error("Create team error:", error)
        },
      }
    },
    renameTeam() {
      return {
        url: "drive.drive.doctype.drive_team.drive_team.change_team_name",
        makeParams: () => ({
          team_id: this.renameTargetTeam?.name,
          new_name: this.renameTeamName.trim(),
        }),
        onSuccess: (data) => {
          toast("Đã đổi tên nhóm thành công!")
          getTeams.fetch()
          this.showRenameTeamModal = false
          this.renameTeamName = ""
          this.renameTargetTeam = null
        },
        onError: (error) => {
          console.error("Rename team error:", error)
          const errorMessage =
            error.messages?.[0] || "Không thể đổi tên nhóm. Vui lòng thử lại."
          toast(errorMessage)
        },
      }
    },
  },
}
</script>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(-8px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}
</style>