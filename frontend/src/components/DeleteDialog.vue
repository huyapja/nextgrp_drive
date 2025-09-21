<template>
  <Dialog
    v-model="open"
    :options="{ title: __('Delete Forever?'), size: 'sm' }"
  >
    <template #body-content>
      <p class="text-ink-gray-5">
        {{ entities.length === 1 ? __('This item') : __("{0} items").format(entities.length) }}
        {{ __('will be deleted forever. This is an irreversible process.') }}
      </p>
      <div class="flex mt-5">
        <Button
          variant="solid"
          theme="red"
          icon-left="trash-2"
          class="w-full"
          :loading="deleteEntities.loading"
          @click="deleteEntities.submit()"
        >
          {{ __('Delete — forever.') }}
        </Button>
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { createResource, Dialog } from "frappe-ui"
import { computed } from "vue"

const emit = defineEmits(["update:modelValue", "success"])
const props = defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  entities: {
    type: Object,
    required: false,
    default: null,
  },
})

const open = computed({
  get() {
    return props.modelValue === "d"
  },
  set(newValue) {
    emit("update:modelValue", newValue)
  },
})

const handleClearTrash = (entities)=>{
  if(!entities?.length) return
  return entities.map((entity)=>{
    if (entity.is_shortcut){
      return {
        entity: entity.shortcut_name,
        is_shortcut: true
      }
    }else{
      return {
        entity: entity.name,
        is_shortcut: false
      }
    }
  })
}

const deleteEntities = createResource({
  url: "drive.api.files.delete_entities",
  params: {
    entity_names: JSON.stringify(handleClearTrash(props.entities)),
  },
  onSuccess(data) {
    // props.entities.map((entity) => del(entity.name))
    emit("success", data)
  },
})
</script>
