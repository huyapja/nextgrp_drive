<template>
  <Dialog
    v-model:visible="open"
    :header="__('Rename')"
    :modal="true"
    :closable="true"
    :draggable="false"
    :style="{ maxWidth: '450px', width: '90vw' }"
  >
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-2">
        <InputText
          ref="nameInput"
          v-model="newName"
          v-focus
          class="flex-1"
          placeholder="Nhập tên mới"
          @keyup.enter="submit"
          @focus="selectAllText"
          autofocus
        />
        <Chip
          v-if="entity.file_ext"
          :label="entity.file_ext.toUpperCase().slice(1)"
          class="bg-gray-100 text-gray-700 font-medium"
        />
      </div>
    </div>

    <template #footer>
      <div class="flex gap-2 justify-end">
        <Button
          :label="__('Cancel')"
          severity="secondary"
          text
          @click="open = false"
          class="h-[42px]"
        />
        <Button
          :label="__('Rename')"
          severity="primary"
          @click="submit"
          :disabled="!newName.trim()"
          class="h-[42px]"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { renameShortcut } from "@/resources/files"
import Button from "primevue/button"
import Chip from "primevue/chip"
import Dialog from "primevue/dialog"
import InputText from "primevue/inputtext"
import { computed, nextTick, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useStore } from "vuex"
import { rename } from "../resources/files"

const props = defineProps({ entity: Object, modelValue: String })
const emit = defineEmits(["update:modelValue", "success"])
const store = useStore()
const route = useRoute()

const newName = ref("")
const ext = ref("")
const nameInput = ref(null)
const isInitialized = ref(false)

// Khởi tạo newName mỗi khi dialog mở
const initializeName = () => {
  if (!props.entity) return
  
  if (props.entity.is_group || props.entity.document) {
    newName.value = props.entity.is_shortcut ? props.entity.shortcut_title : props.entity.title
    if (route.meta.documentPage) {
      store.state.activeEntity.title = newName.value
    }
  } else {
    const parts = props.entity.is_shortcut ? props.entity.shortcut_title.split(".") : props.entity.title.split(".")
    if (parts.length > 1) {
      newName.value = parts.slice(0, -1).join(".").trim()
      ext.value = parts[parts.length - 1]
    } else {
      newName.value = parts[0]
      ext.value = ""
    }
  }
  
  isInitialized.value = true
  
  // Select toàn bộ text sau khi khởi tạo
  nextTick(() => {
    selectAllText()
  })
}

// Select toàn bộ text trong input
const selectAllText = () => {
  if (nameInput.value && nameInput.value.$el) {
    const inputElement = nameInput.value.$el.querySelector('input') || nameInput.value.$el
    if (inputElement && inputElement.select) {
      inputElement.select()
    }
  }
}

const open = computed({
  get: () => {
    return props.modelValue === "rn"
  },
  set: (value) => {
    emit("update:modelValue", value || "")
    if (!value) {
      newName.value = ""
      ext.value = ""
      isInitialized.value = false
    }
  },
})

// Watch khi dialog mở để khởi tạo lại newName
watch(() => props.modelValue, (newVal, oldVal) => {
  // Khởi tạo khi dialog mở (chuyển từ đóng sang mở hoặc mở ngay từ đầu)
  if (newVal === "rn" && props.entity && !isInitialized.value) {
    // Sử dụng nextTick để đảm bảo dialog đã render xong
    nextTick(() => {
      initializeName()
    })
  } else if (newVal !== "rn") {
    // Reset flag khi dialog đóng
    isInitialized.value = false
  }
}, { immediate: true })

const submit = () => {
  if (!newName.value.trim()) return
  
  if (!!props.entity.is_shortcut) {
    renameShortcut.submit({
      entity_name: props.entity.shortcut_name,
      new_title: newName.value + (ext.value ? "." + ext.value : ""),
    })
    if (!renameShortcut.data) return
    emit("success", {
      name: props.entity.shortcut_name,
      title: newName.value + (ext.value ? "." + ext.value : ""),
      is_shortcut: props.entity.is_shortcut,
    })
  } 
  else {
    rename.submit({
      entity_name: props.entity.name,
      new_title: newName.value + (ext.value ? "." + ext.value : ""),
    })
    if (!rename.data) return
    emit("success", {
      name: props.entity.name,
      title: newName.value + (ext.value ? "." + ext.value : ""),
      is_shortcut: props.entity.is_shortcut,
    })
  }
  
  open.value = false
}
</script>

<style scoped>
:deep(.p-dialog) {
  border-radius: 0.75rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
}

:deep(.p-dialog-header) {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

:deep(.p-dialog-content) {
  padding: 1.5rem;
}

:deep(.p-dialog-footer) {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e7eb;
}

:deep(.p-inputtext) {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border-radius: 0.5rem;
  border: 1px solid #d1d5db;
  transition: all 0.2s;
}

:deep(.p-inputtext:focus) {
  border-color: #0149c1;
  box-shadow: 0 0 0 3px rgba(1, 73, 193, 0.1);
}

:deep(.p-button) {
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-weight: 500;
  transition: all 0.2s;
}

:deep(.p-button-primary) {
  background: #0149c1;
  border-color: #0149c1;
}

:deep(.p-button-primary:hover:not(:disabled)) {
  background: #013a9d;
  border-color: #013a9d;
}

:deep(.p-chip) {
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}
</style>