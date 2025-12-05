<template>
  <div
    v-if="visible"
    :class="[
      'absolute top-0 right-0 h-full w-[320px] bg-white z-[99] border-l border-b',
      closing ? 'animate-slide-out' : 'animate-slide-in'
    ]"
  >
    <div class="flex py-4 px-3 items-center">
      <p class="font-medium">Nhận xét</p>

      <i
        class="pi pi-times ml-auto cursor-pointer hover:text-[#3b82f6]
               transition-all duration-200 ease-out"
        @click="handleClose"
      />
    </div>

    <!-- Nội dung comment -->
    <div class="p-3 overflow-y-auto h-[calc(100%-60px)]">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  visible: Boolean
});

const emit = defineEmits(["close"]);

const closing = ref(false);

watch(
  () => props.visible,
  (val) => {
    if (val === true) {
      closing.value = false;
    }
  }
);

function handleClose() {
  closing.value = true;

  setTimeout(() => {
    emit("close");
    closing.value = false;
  }, 250);
}
</script>

<style scoped>
@keyframes slideIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

@keyframes slideOut {
  from { transform: translateX(0); }
  to   { transform: translateX(100%); }
}

.animate-slide-in {
  animation: slideIn 0.25s ease-out forwards;
}

.animate-slide-out {
  animation: slideOut 0.25s ease-in forwards;
}
</style>
