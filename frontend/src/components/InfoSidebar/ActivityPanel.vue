<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex justify-between items-center p-4 border-b border-gray-100">
      <span class="font-semibold text-gray-800 text-base">Hoạt động</span>
      <Button
        v-if="isSmallScreen"
        icon="pi pi-times"
        severity="secondary"
        text
        rounded
        size="small"
        @click="$emit('close')"
        class="text-gray-600 hover:text-gray-800"
      />
    </div>

    <!-- Activity Content -->
    <div class="flex-1 overflow-y-auto p-4">
      <ActivityTree v-if="entity.write" :entity="entity" />
    </div>
  </div>
</template>

<script setup>
import Button from "primevue/button"
import ActivityTree from "../ActivityTree.vue"

defineProps({
  entity: {
    type: Object,
    required: true,
  },
  isSmallScreen: {
    type: Boolean,
    default: false,
  },
})

defineEmits(["close"])
</script>