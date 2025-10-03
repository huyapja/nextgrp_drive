<template>
  <Teleport to="body">
    <Dialog
      v-if="open"
      v-model:visible="open"
      modal
      :header="__('Create new folder')"
      :style="{ width: '32rem' }"
      :dismissableMask="true"
    >
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <label for="folder-name" class="text-sm text-gray-600">
            {{ __("Folder name:") }}
          </label>
          <IconField iconPosition="left">
            <InputIcon>
              <LucideFolderClosed class="w-4 h-4" />
            </InputIcon>
            <InputText
              id="folder-name"
              ref="folderInput"
              v-model="folderName"
              class="w-full"
              @keyup.enter="submit"
              @keydown="createFolder.error = null"
              autofocus
            />
          </IconField>
        </div>
      </div>

      <template #footer>
        <Button
          :label="__('Create')"
          :disabled="folderName.length === 0 || createFolder.loading"
          :loading="createFolder.loading"
          @click="submit"
          class="w-full !bg-[#0149C1] border-[#0149C1] hover:!bg-[#0149C1] hover:!opacity-90"
          severity="primary"
        />
      </template>
    </Dialog>
  </Teleport>
</template>

<script setup>
import store from "@/store"
import { createResource } from "frappe-ui"
import Button from "primevue/button"
import Dialog from "primevue/dialog"
import IconField from "primevue/iconfield"
import InputIcon from "primevue/inputicon"
import InputText from "primevue/inputtext"
import { computed, nextTick, onMounted, onUnmounted, ref, Teleport, watch } from "vue"
import { useRoute } from "vue-router"
import { allFolders } from "../resources/files"

const route = useRoute()
const props = defineProps({
  modelValue: String,
  parent: String,
})
const emit = defineEmits(["update:modelValue", "success", "mutate"])
const folderName = ref("Thư mục mới")
const folderInput = ref(null)

// Debug
const instanceId = Math.random().toString(36).substr(2, 9)
console.log('=== NewFolderDialog Instance Created ===', instanceId)

onMounted(() => {
  console.log('=== NewFolderDialog MOUNTED ===', instanceId)
  
  // Kiểm tra số lượng dialog
  setTimeout(() => {
    const dialogs = document.querySelectorAll('[role="dialog"]')
    console.log('Total dialogs in DOM:', dialogs.length)
    dialogs.forEach((d, i) => {
      console.log(`Dialog ${i}:`, d.outerHTML.substring(0, 200))
    })
  }, 100)
})

onUnmounted(() => {
  console.log('=== NewFolderDialog UNMOUNTED ===', instanceId)
})

const createFolder = createResource({
  url: "drive.api.files.create_folder",
  makeParams(title) {
    return {
      title,
      team: route.params.team,
      parent: props.parent,
      personal: store.state.breadcrumbs[0].name == "Home" ? 1 : 0,
    }
  },
  validate(params) {
    if (!params?.title) {
      return __("Folder name is required")
    }
  },
  onSuccess(data) {
    folderName.value = "Thư mục mới"
    allFolders.fetch()
    emit("success", data)
    open.value = false // Force close
  },
})

const open = computed({
  get: () => {
    const isOpen = props.modelValue === "f"
    console.log(`Dialog ${instanceId} open computed:`, isOpen, 'modelValue:', props.modelValue)
    return isOpen
  },
  set: (value) => {
    console.log(`Dialog ${instanceId} open set:`, value)
    if (!value) {
      emit("update:modelValue", "")
      folderName.value = "Thư mục mới"
    }
  },
})

// Auto focus
watch(() => open.value, async (newVal) => {
  console.log(`Dialog ${instanceId} watch open:`, newVal)
  if (newVal) {
    await nextTick()
    if (folderInput.value) {
      folderInput.value.$el.focus()
      folderInput.value.$el.select()
    }
  }
}, { immediate: true })

const submit = () => {
  if (createFolder.loading) {
    console.log('Submit blocked - already loading')
    return
  }
  console.log('Submitting folder creation:', folderName.value)
  createFolder.submit(folderName.value.trim())
}
</script>

<style scoped>
:deep(.p-dialog) {
  border-radius: 0.5rem;
  z-index: 10000 !important;
}

:deep(.p-dialog-mask) {
  z-index: 9999 !important;
}

:deep(.p-dialog-header) {
  padding: 1.5rem;
}

:deep(.p-dialog-content) {
  padding: 0 1.5rem 1.5rem;
}

:deep(.p-dialog-footer) {
  padding: 1.5rem;
  padding-top: 0;
}
</style>