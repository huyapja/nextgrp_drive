<template>
  <div
    ref="containerRef"
    class="h-[65%] flex items-center justify-center rounded-t-[calc(theme(borderRadius.lg)-1px)] overflow-hidden"
  >
    <template v-if="is_image || !getThumbnail?.data">
      <img
        v-show="!imgLoaded"
        loading="lazy"
        :class="'h-10 w-auto'"
        :src="backupLink"
        :draggable="false"
      />
      <img
        v-show="imgLoaded"
        :class="
          src === backupLink
            ? 'h-10 w-auto'
            : 'h-full min-w-full object-cover rounded-t-[calc(theme(borderRadius.lg)-1px)]'
        "
        :src="src"
        :draggable="false"
        @error="src = backupLink"
        @load="imgLoaded = true"
      />
    </template>
    <div
      v-else
      class="overflow-hidden text-ellipsis whitespace-nowrap h-full w-[calc(100%-1rem)] object-cover rounded-t-[calc(theme(borderRadius.lg)-1px)] py-2"
    >
      <div
        class="prose prose-sm pointer-events-none scale-[.39] ml-0 origin-top-left"
        v-html="getThumbnail.data"
      />
    </div>
  </div>
  <div
    class="p-2 h-[35%] border-t border-gray-100 flex flex-col justify-evenly"
  >
    <div class="w-full text-base font-medium text-ink-gray-8 flex items-center gap-2">
      <span class="truncate flex-1 min-w-0">{{ file.title }}</span>
      <PinFilled 
        v-if="file.is_pinned"
        class="pinned-icon"
        :size="14"
        title="Tài liệu đã ghim"
      />
    </div>
    <div class="mt-[5px] text-xs text-ink-gray-5">
      <div class="flex items-center justify-start gap-1">
        <img
          v-if="
            file.file_type !== 'Unknown' &&
            !file.is_group &&
            ((imgLoaded && src !== backupLink) || !is_image)
          "
          loading="lazy"
          class="h-4 w-auto"
          :src="getIconUrl(file.file_type) || '/drive'"
          :draggable="false"
        />
        <p class="truncate">
          {{ file.is_group ? childrenSentence + "∙" : "" }}
          {{ file.file_type !== "Unknown" ? __(file.file_type) + "∙" : "" }}
          {{ file.relativeModified }}
        </p>
      </div>
      <!-- <p class="mt-1">
        {{ file.file_size_pretty }}
      </p> -->
    </div>
  </div>
</template>
<script setup>
import PinFilled from "@/assets/Icons/PinFilled.vue"
import { getIconUrl, getThumbnailUrl } from "@/utils/getIconUrl"
import { thumbnailQueue } from "@/utils/thumbnailQueue"
import { createResource } from "frappe-ui"
import { computed, onMounted, onUnmounted, ref } from "vue"

const props = defineProps({ file: Object })

const [thumbnailLink, backupLink, is_image] = getThumbnailUrl(
  props.file.name,
  props.file.file_type,
  props.file.is_group
)
const src = ref(backupLink)
const imgLoaded = ref(false)
const containerRef = ref(null)
let cancelLoad = null
let observer = null

let getThumbnail
if (!is_image && thumbnailLink) {
  getThumbnail = createResource({
    url: thumbnailLink,
    cache: ["thumbnail", props.file.name],
    auto: false,
  })
}

onMounted(() => {
  if (props.file.is_group || !thumbnailLink) return

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (is_image) {
            cancelLoad = thumbnailQueue.add(props.file.name, (url) => {
              if (url) src.value = url
            })
          } else if (getThumbnail) {
            getThumbnail.fetch()
          }
          observer?.disconnect()
        }
      })
    },
    { rootMargin: "100px" }
  )

  if (containerRef.value) {
    observer.observe(containerRef.value)
  }
})

onUnmounted(() => {
  observer?.disconnect()
  cancelLoad?.()
})

const childrenSentence = computed(() => {
  if (!props.file.children) return __("Empty")
  return props.file.children + " " + (props.file.children === 1 ? __("item") : __("items"))
})
</script>

<style scoped>
.pinned-icon {
  color: #f59e0b;
  flex-shrink: 0 !important;
  flex-grow: 0 !important;
  animation: fadeIn 0.2s ease-in;
  width: 16px !important;
  height: 16px !important;
  min-width: 16px !important;
  min-height: 16px !important;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
