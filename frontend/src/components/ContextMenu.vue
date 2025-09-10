<template>
  <div
    v-if="actionItems?.length > 0"
    ref="contextMenu"
    class="w-[167px] py-2 absolute mt-1 min-w-48 rounded-lg bg-white shadow-sm border border-[#E5E5E5] focus:outline-none"
    :style="{
      left: `${calculateX}px`,
      top: `${calculateY}px`,
      'z-index': 1000,
    }"
  >
    <div
      v-for="(item, index) in actionItems"
      :key="index"
      @click="
        () => {
          item.handler()
          close()
        }
      "
    >
      
      <button
        v-if="item.label"
        class="group flex w-full items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
        :class="item.danger ? 'hover:bg-red-50' : 'hover:bg-gray-50'"
      >
        <div 
          class="flex items-center justify-center w-6 h-6 mr-2 rounded-md flex-shrink-0"
        >
          <component
            :is="item.icon"
            class="w-5 h-5"
          />
        </div>
        <span
          class="whitespace-nowrap font-medium text-[14px]"
          :class="item.danger ? 'text-red-600' : 'text-[#171717]'"
        >
          {{ item.label }}
        </span>
        <span 
          v-if="item.badge" 
          class="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"
        >
          {{ item.badge }}
        </span>
      </button>
    </div>
  </div>
</template>

<script setup>
import disableScroll from "@/utils/disable-scroll"
import { onBeforeUnmount, onMounted, onUpdated, ref } from "vue"

const props = defineProps({
  actionItems: Array,
  event: Object,
  close: Function,
})

const contextMenu = ref(null)
const parentWidth = ref(null)
const parentHeight = ref(null)
const childWidth = ref(null)
const childHeight = ref(null)

// Hàm để lấy class background cho icon dựa trên type


// Hàm để lấy class màu cho icon dựa trên type


onMounted(() => {
  console.log("context menu mounted", props.event)
  parentWidth.value = window.document.body?.clientWidth
  parentHeight.value = window.document.body?.clientHeight
  childWidth.value = contextMenu.value?.clientWidth
  childHeight.value = contextMenu.value?.clientHeight
  calculateY()
  calculateX()
  disableScroll.on()
})

onUpdated(() => {
  calculateY()
  calculateX()
})

onBeforeUnmount(() => {
  disableScroll.off()
})

function calculateY() {
  if (props.event?.y >= parentHeight.value - childHeight.value) {
    return (contextMenu.value.style.top =
      props.event?.y - childHeight.value + "px")
  } else {
    return (contextMenu.value.style.top = props.event?.y + "px")
  }
}

function calculateX() {
  if (props.event?.x >= parentWidth.value - childWidth.value) {
    return (contextMenu.value.style.left =
      props.event?.x - childWidth.value + "px")
  } else {
    return (contextMenu.value.style.left = props.event?.x + "px")
  }
}
</script>