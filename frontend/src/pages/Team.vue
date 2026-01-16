<template>
  <div class="flex flex-row h-screen">
    <div class="w-full flex-1 h-full">
      <GenericPage
        :get-entities="getHome"
        :icon="LucideBuilding2"
        primary-message="Không có tài liệu trong nhóm"
        secondary-message="Thả tệp vào đây để thêm."
        :verify="verifyData"
        @show-team-members="showTeamMembersList = true"
      />
    </div>
    <TeamMembersList
      v-if="showTeamMembersList || !isDrawerMode"
      v-model="showTeamMembersList"
      class="!h-[100vh]"
      @close="showTeamMembersList = false"
    />
  </div>
</template>

<script setup>
import GenericPage from "@/components/GenericPage.vue"
import TeamMembersList from "@/components/TeamMembersList.vue"
import { getHome, getTeams } from "@/resources/files"
import { allUsers } from "@/resources/permissions"
import { createResource } from "frappe-ui"
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useStore } from "vuex"
import LucideBuilding2 from "~icons/lucide/building-2"

const store = useStore()
const route = useRoute()

store.commit("setCurrentFolder", { name: "" })

const getTeamMembers = createResource({
  url: "drive.api.product.get_all_users",
  params: {
    team: route.params.team,
  },
  auto: true,
})

const showTeamMembersList = ref(false)
const isDrawerMode = ref(false)

function checkScreenWidth() {
  const wasDrawerMode = isDrawerMode.value
  isDrawerMode.value = window.innerWidth + 250 < 1600
  
  // Nếu chuyển từ desktop sang mobile, đóng drawer
  if (!wasDrawerMode && isDrawerMode.value) {
    showTeamMembersList.value = false
  }
  // Nếu chuyển từ mobile sang desktop, mở sidebar
  else if (wasDrawerMode && !isDrawerMode.value) {
    showTeamMembersList.value = true
  }
}

// Watch route change để đóng drawer trên mobile khi chuyển team
watch(
  () => route.params.team,
  (newTeam, oldTeam) => {
    if (newTeam && newTeam !== oldTeam && isDrawerMode.value) {
      showTeamMembersList.value = false
    }
  }
)

onMounted(() => {
  checkScreenWidth()
  window.addEventListener("resize", checkScreenWidth)
})

onBeforeUnmount(() => {
  window.removeEventListener("resize", checkScreenWidth)
})

const write = computed(
  () =>
    allUsers.data &&
    allUsers.data.find((k) => k.name === store.state.user.id)?.access_level > 0
)

const verifyData = reactive({
  data: {
    write: false,
  },
})

watch(write, (newVal) => {
  verifyData.data.write = newVal
}, { immediate: true })

// Set breadcrumbs when teams data is available
const setBreadcrumbs = () => {
  if (getTeams.data && route.params.team) {
    const currentTeam = getTeams.data[route.params.team]
    if (currentTeam) {
      store.commit("setBreadcrumbs", [
        {
          label: currentTeam.title,
          name: "Team",
        },
      ])
    }
  }
}

setBreadcrumbs()
watch(() => getTeams.data, setBreadcrumbs, { immediate: true })
</script>