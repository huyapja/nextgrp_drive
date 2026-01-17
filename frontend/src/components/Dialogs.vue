<template>
  <!-- New item dialogs -->
  <NewFolderDialog
    v-if="dialog === 'f'"
    v-model="dialog"
    :parent="$route.params.entityName"
    @success="handleRefresh"
  />
  <NewLinkDialog
    v-if="dialog === 'l'"
    v-model="dialog"
    :parent="$route.params.entityName"
    @success="(data) => addToList(data, 'Link')"
  />
  <!-- Mutation dialog -->
  <RenameDialog
    v-if="dialog === 'rn'"
    v-model="dialog"
    :entity="selections[0]"
    @success="
      ({ name, title, is_shortcut = false }) => {
        if (selections[0] !== rootResource?.data && props.getEntities){
          // Handle paginated response {data: [...], total: 23}
          const currentData = props.getEntities.data
          let dataArray = []
          
          if (currentData && typeof currentData === 'object' && 'data' in currentData) {
            dataArray = currentData.data
            // Update in paginated structure
            if (is_shortcut){
              const item = dataArray.find((k) => k.shortcut_name === name)
              if (item) {
                item.shortcut_title = title
                item.accessed = new Date().getTime()
                props.getEntities.setData({ ...currentData, data: dataArray })
              }
            } else {
              const item = dataArray.find((k) => k.name === name)
              if (item) {
                item.title = title
                item.accessed = new Date().getTime()
                props.getEntities.setData({ ...currentData, data: dataArray })
              }
            }
          } else if (Array.isArray(currentData)) {
            // Non-paginated response
            dataArray = currentData
            if (is_shortcut){
              const item = dataArray.find((k) => k.shortcut_name === name)
              if (item) {
                item.shortcut_title = title
                item.accessed = new Date().getTime()
              }
            } else {
              const item = dataArray.find((k) => k.name === name)
              if (item) {
                item.title = title
                item.accessed = new Date().getTime()
              }
            }
            props.getEntities.setData(dataArray)
          }
        }
        resetDialog()
        // Handle breadcrumbs
        let l = store.state.breadcrumbs[store.state.breadcrumbs.length - 1]
        if (l.label === selections[0].title) {
          l.label = title
          setTitle(title)
        }
      }
    "
  />
  <ShareDialog
    v-if="dialog === 's'"
    v-model="dialog"
    :entity="selections[0]"
    @success="handleShareSuccess"
  />

  <MoveOwnerDialog
    v-if="dialog === 'move_owner'"
    v-model="dialog"
    :entity="selections[0]"
    @success="handleRefresh"
  />

  <!-- Deletion dialogs -->
  <GeneralDialog
    v-if="dialog === 'remove'"
    v-model="dialog"
    :entities="selections"
    :for="'remove'"
    @success="(successEntities) => removeFromList(successEntities, false)"
  />
  <GeneralDialog
    v-if="dialog === 'restore'"
    v-model="dialog"
    :entities="selections"
    :for="'restore'"
    @success="removeFromList(selections)"
  />

  <MoveDialog
    v-if="dialog === 'move'"
    v-model="dialog"
    :entities="selections"
    @success="removeFromList(selections)"
  />
  <CopyDialog
    v-if="dialog === 'copy'"
    v-model="dialog"
    :entities="selections"
    @success="addFromList()"
  />

  <DeleteDialog
    v-if="dialog === 'd'"
    v-model="dialog"
    :entities="selections"
    @success="removeFromList(selections)"
  />
  <CTADeleteDialog
    v-if="dialog === 'cta'"
    v-model="dialog"
    @success="resetDialog"
  />

  <ActivityDownloadAndViewDialog
    v-if="dialog === 'activity_download_and_view'"
    v-model="dialog"
  />

</template>
<script setup>
import NewFolderDialog from "@/components/NewFolderDialog.vue"
import NewLinkDialog from "@/components/NewLinkDialog.vue"
import RenameDialog from "@/components/RenameDialog.vue"
import ShareDialog from "@/components/ShareDialog/ShareDialog.vue"
import GeneralDialog from "@/components/GeneralDialog.vue"
import DeleteDialog from "@/components/DeleteDialog.vue"
import CTADeleteDialog from "@/components/CTADeleteDialog.vue"
import MoveDialog from "@/components/MoveDialog.vue"
import emitter from "@/emitter"
import { useStore } from "vuex"
import { computed } from "vue"
import { useRoute } from "vue-router"
import { sortEntities } from "@/utils/files"
import { useTimeAgo } from "@vueuse/core"
import { openEntity } from "../utils/files"
import MoveOwnerDialog from "@/components/MoveOwnerDialog.vue"
import CopyDialog from "@/components/CopyDialog.vue"
import { data } from "autoprefixer"
import ActivityDownloadAndViewDialog from "./ActivityDownloadAndViewDialog.vue"

const dialog = defineModel(String)
const store = useStore()
const route = useRoute()

const props = defineProps({
  rootResource: Object,
  selectedRows: Array,
  getEntities: { type: Object, default: null },
})
const resetDialog = () => (dialog.value = "")
const selections = computed(() => {
  return props.selectedRows && props.selectedRows.length
    ? props.selectedRows
    : props.rootResource
    ? [props.rootResource.data]
    : null
})

emitter.on("showCTADelete", () => (dialog.value = "cta"))
emitter.on("showShareDialog", () => (dialog.value = "s"))
emitter.on("newFolder", () => (dialog.value = "f"))
emitter.on("rename", () => (dialog.value = "rn"))
emitter.on("remove", () => (dialog.value = "remove"))
emitter.on("d", () => (dialog.value = "d"))
emitter.on("move", () => (dialog.value = "m"))
emitter.on("newLink", () => (dialog.value = "l"))
emitter.on("move_owner", () => (dialog.value = "move_owner"))
emitter.on("copy", () => (dialog.value = "copy"))
emitter.on("activity_download_and_view", () => (dialog.value = "activity_download_and_view"))

const setTitle = (title) =>
  (document.title = (route.name === "Folder" ? "Folder - " : "") + title)
function addToList(data, file_type) {
  if (!props.getEntities) return
  data = {
    ...data,
    modified: Date(),
    file_type,
    share_count: 0,
    read: 1,
    write: 1,
    share: 1,
    comment: 1
  }

  data.relativeModified = useTimeAgo(data.modified)

  // Handle paginated response {data: [...], total: 23}
  const currentData = props.getEntities.data
  let dataArray = []
  
  if (currentData && typeof currentData === 'object' && 'data' in currentData) {
    // Paginated response - reload from API instead of adding locally
    // because pagination state may have changed
    if (props.getEntities?.fetch) {
      props.getEntities.fetch(props.getEntities.params)
    }
    return
  } else if (Array.isArray(currentData)) {
    dataArray = currentData
  }
  
  const newData = [...dataArray, data]
  sortEntities(newData, store.state.sortOrder)
  props.getEntities.setData(newData)
  // props.getEntities.fetch()
  resetDialog()
}

const handleRefresh = () => {
  console.log('Handle refresh called', props.getEntities)
  if (props.getEntities?.fetch) {
    props.getEntities.fetch(props.getEntities.params)
  }
}

const handleShareSuccess = () => {
  // Đợi một chút để đảm bảo backend đã cập nhật share_count
  setTimeout(async () => {
    if (props.getEntities) {
      // Dùng reload() để clear cache và fetch lại dữ liệu mới nhất
      if (props.getEntities.reload) {
        await props.getEntities.reload()
      } else if (props.getEntities.fetch) {
        // Fallback: nếu không có reload, dùng fetch với params hiện tại
        await props.getEntities.fetch(props.getEntities.params)
      }
      
      // Force update bằng cách tạo object/array mới hoàn toàn
      // Đảm bảo Vue detect được thay đổi
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const currentData = props.getEntities.data
      if (currentData) {
        if (currentData && typeof currentData === 'object' && 'data' in currentData) {
          // Paginated response - tạo object mới hoàn toàn
          props.getEntities.setData({
            ...currentData,
            data: currentData.data.map(item => ({ ...item }))
          })
        } else if (Array.isArray(currentData)) {
          // Non-paginated response - tạo array mới hoàn toàn
          props.getEntities.setData(currentData.map(item => ({ ...item })))
        }
      }
    }
  }, 500)
}

function addFromList() {
  if (props.getEntities?.fetch) {
    props.getEntities.fetch()
  }
  resetDialog()
}

function removeFromList(entities, move = true) {
  // Hack (that breaks for some reason)
  if (!props.getEntities?.data && props.rootResource) {
    if (move) {
      store.state.breadcrumbs.splice(1)
      store.state.breadcrumbs.push({ loading: true })
      setTimeout(() => props.rootResource.fetch(), 1000)
    } else {
      openEntity(null, {
        team: props.rootResource.data.team,
        name: props.rootResource.data.parent_entity,
        is_group: true,
      })
    }
  } else {
    const names = entities.map((o) => o.shortcut_name || o.name)
    
    // Handle paginated response {data: [...], total: 23}
    const currentData = props.getEntities.data
    let dataArray = []
    
    if (currentData && typeof currentData === 'object' && 'data' in currentData) {
      // Paginated response - reload from API instead of filtering locally
      // because pagination state may have changed
      if (props.getEntities?.fetch) {
        props.getEntities.fetch(props.getEntities.params)
      }
    } else if (Array.isArray(currentData)) {
      // Non-paginated response - filter locally
      dataArray = currentData.filter(({ name, shortcut_name, is_shortcut }) => {
        if (is_shortcut) {
          return !names.includes(shortcut_name)
        } else {
          return !names.includes(name)
        }
      })
      props.getEntities.setData(dataArray)
    }
  }
  resetDialog()
}
</script>
