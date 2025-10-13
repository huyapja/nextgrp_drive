<template>
  <!-- New item dialogs -->
  <NewFolderDialog
    v-if="dialog === 'f'"
    v-model="dialog"
    :parent="$route.params.entityName"
    @success="(data) => addToList(data, 'Folder')"
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
          if (is_shortcut){
            props.getEntities.data.find((k) => k.shortcut_name === name).shortcut_title = title
            props.getEntities.data.find((k) => k.shortcut_name === name).accessed = new Date().getTime()
          } else {
            props.getEntities.data.find((k) => k.name === name).title = title
            props.getEntities.data.find((k) => k.name === name).accessed = new Date().getTime()
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
    @success="handleRefresh"
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
    @success="removeFromList(selections, false)"
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
    comment: 1,
  }

  data.relativeModified = useTimeAgo(data.modified)

  const newData = [...props.getEntities.data, data]
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

function addFromList() {
  props.getEntities.fetch()
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
    props.getEntities.setData(
      props.getEntities.data.filter(({ name, shortcut_name, is_shortcut }) => {
        if (is_shortcut) {
          return !names.includes(shortcut_name)
        } else {
          return !names.includes(name)
        }
      })
    )
  }
  resetDialog()
}
</script>
