<template>
  <Navbar
    v-if="!document.error"
    :root-resource="document"
  />
  <ErrorPage
    v-if="document.error"
    :error="document.error"
  />
  <LoadingIndicator
    v-else-if="!document.data && document.loading"
    :error="document.error"
    class="w-10 h-full text-neutral-100 mx-auto"
  />
  <div class="flex w-full overflow-auto">
    <TextEditor
      v-if="contentLoaded"
      v-model:yjs-content="yjsContent"
      v-model:raw-content="rawContent"
      v-model:last-saved="lastSaved"
      v-model:settings="settings"
      :user-list="allUsers.data || []"
      :fixed-menu="true"
      :bubble-menu="true"
      :timeout="timeout"
      :is-writable="isWritable"
      :entity-name="entityName"
      :entity="entity"
      @mentioned-users="(val) => (mentionedUsers = val)"
      @save-document="saveDocument"
    />
  </div>
</template>

<script setup>
import Navbar from "@/components/Navbar.vue"
import { allUsers } from "@/resources/permissions"
import router from "@/router"
import { useRecentFiles } from "@/composables/useRecentFiles"
import { prettyData, setBreadCrumbs } from "@/utils/files"
import { watchDebounced } from "@vueuse/core"
import { createResource, LoadingIndicator } from "frappe-ui"
import { fromUint8Array, toUint8Array } from "js-base64"
import {
  computed,
  defineAsyncComponent,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue"
import { useRoute } from "vue-router"
import { useStore } from "vuex"

const TextEditor = defineAsyncComponent(() =>
  import("@/components/DocEditor/TextEditor.vue")
)

const store = useStore()
const route = useRoute()
const emitter = inject("emitter")

const props = defineProps({
  entityName: String,
  team: String,
})

// Use recent files composable
let addRecentFile = null
try {
  const recentFilesComposable = useRecentFiles()
  addRecentFile = recentFilesComposable.addRecentFile
  console.log('✅ [Document.vue] useRecentFiles loaded successfully')
} catch (error) {
  console.error('❌ [Document.vue] Error loading useRecentFiles:', error)
}

// Reactive data properties
const oldTitle = ref(null)
const title = ref(null)
const yjsContent = ref(null)
const settings = ref(null)
const rawContent = ref(null)
const contentLoaded = ref(false)
const isWritable = ref(false)
const entity = ref(null)
const mentionedUsers = ref([])
const timeout = ref(1000 + Math.floor(Math.random() * 1000))
const saveCount = ref(0)
const lastSaved = ref(0)
const titleVal = computed(() => title.value || oldTitle.value)
const comments = computed(() => store.state.allComments)
const userId = computed(() => store.state.user.id)
let intervalId = ref(null)

setTimeout(() => {
  watchDebounced(
    [rawContent, comments],
    () => {
      saveDocument()
    },
    {
      debounce: timeout.value,
      maxWait: 30000,
      immediate: true,
    }
  )
}, 1500)

const saveDocument = () => {
  if (isWritable.value || entity.value.comment) {
    updateDocument.submit({
      entity_name: props.entityName,
      doc_name: entity.value.document,
      title: titleVal.value,
      content: fromUint8Array(yjsContent.value),
      raw_content: rawContent.value,
      settings: settings.value,
      comments: comments.value,
      mentions: mentionedUsers.value,
      file_size: fromUint8Array(yjsContent.value).length,
    })
  }
}

const onSuccess = (data) => {
  window.document.title = data.title
  if (!data.settings) {
    data.settings =
      '{ "docWidth": false, "docSize": true, "docFont": "font-fd-sans", "docHeader": false, "docHighlightAnnotations": false, "docSpellcheck": false}'
  }
  settings.value = JSON.parse(data.settings)
  store.commit("setActiveEntity", data)

  if (!("docSpellcheck" in settings.value)) {
    settings.value.docSpellcheck = 1
  }
  document.setData(prettyData([entity])[0])
  title.value = data.title
  oldTitle.value = data.title
  yjsContent.value = toUint8Array(data.content)
  rawContent.value = data.raw_content
  isWritable.value = data.owner === userId.value || !!data.write
  store.commit("setHasWriteAccess", isWritable)

  data.owner = data.owner === userId.value ? __("You") : data.owner
  entity.value = data
  lastSaved.value = Date.now()
  contentLoaded.value = true
  setBreadCrumbs(data.breadcrumbs, data.is_private, () => {
    data.write && emitter.emit("rename")
  })
  
  // Track document/file đã được xem vào recent files
  console.log('🔍 [Document.vue] Checking if should track file:', { name: data.name, isGroup: data.is_group })
  
  if (data && !data.is_group) {
    const fileInfo = {
      name: data.name,
      title: data.title,
      mime_type: data.mime_type,
      file_ext: data.file_ext,
      modified: data.modified,
      owner: data.owner,
      is_group: data.is_group,
      team: props.team, // Include team info for correct URL generation
    }
    
    console.log('📝 [Document.vue] File info to track:', fileInfo)
    
    // Add to local recent files
    if (addRecentFile) {
      console.log('🔧 [Document.vue] Calling addRecentFile...')
      addRecentFile(fileInfo)
    } else {
      console.warn('⚠️ [Document.vue] addRecentFile is not available')
    }
    
    // Send message to parent window (MTP) if inside iframe
    if (window.parent && window.parent !== window) {
      try {
        console.log('📤 [Document.vue] Sending file_accessed message to parent:', fileInfo)
        window.parent.postMessage({
          type: 'drive:file_accessed',
          payload: fileInfo
        }, '*')
      } catch (error) {
        console.warn('[Document.vue] Cannot send message to parent window:', error)
      }
    } else {
      console.log('⚠️ [Document.vue] Not in iframe, file tracking only local')
    }
  } else {
    console.log('⏭️ [Document.vue] Skipping file tracking (not a file or is a group)')
  }
}
const document = createResource({
  url: "drive.api.permissions.get_entity_with_permissions",
  method: "GET",
  auto: true,
  params: {
    entity_name: props.entityName,
  },
  onSuccess,
  onError() {
    if (!store.getters.isLoggedIn) router.push({ name: "Login" })
  },
})

const updateDocument = createResource({
  url: "drive.api.files.save_doc",
  auto: false,
  onSuccess() {
    lastSaved.value = Date.now()
    saveCount.value++
  },
  onError(data) {
    console.log(data)
  },
})

onMounted(() => {
  // Lưu thông tin document share nếu user chưa login
  if (!store.getters.isLoggedIn) {
    const sharedFileInfo = {
      team: props.team,
      entityName: props.entityName,
      entityType: "document"
    }
    sessionStorage.setItem("sharedFileInfo", JSON.stringify(sharedFileInfo))
  }
  
  allUsers.fetch({ team: route.params?.team })
  if (saveCount.value > 0) {
    intervalId.value = setInterval(() => {
      emitter.emit("triggerAutoSnapshot")
    }, 120000 + timeout.value)
  }
})

onBeforeUnmount(() => {
  if (saveCount.value) {
    saveDocument()
  }
  if (intervalId.value !== null) {
    clearInterval(intervalId.value)
  }
})
</script>
