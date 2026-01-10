<template>
  <h1 class="font-semibold mb-4 text-ink-gray-9 text-base sm:text-lg">
    {{ __("Lưu trữ") }}
  </h1>

  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full mb-2 gap-2">
    <span class="text-sm sm:text-base font-medium text-ink-gray-8">
      {{ showFileStorage ? "Bạn đã" : "Nhóm của bạn đã" }} sử dụng
      {{ formatGB(usedSpace) }} / {{ formatGB(spaceLimit) }} ({{
        formatPercent((usedSpace / spaceLimit) * 100)
      }})
    </span>

    <div
      class="bg-surface-gray-2 rounded-[10px] space-x-0.5 h-7 flex items-center px-0.5 py-1 self-start sm:self-auto flex-shrink-0"
    >
      <TabButtons
        v-model="showFileStorage"
        :buttons="[
          {
            label: __('Của bạn'),
            value: true,
          },
          {
            label: __('Nhóm'),
            value: false,
          },
        ]"
      />
    </div>
  </div>

  <div
    v-if="usedSpace > 0"
    class="w-full flex justify-start items-start bg-surface-menu-bar border rounded overflow-clip h-7 pl-0 mb-4"
  >
    <Tooltip
      v-for="[file_kind, i] in storageBreakdown.data?.total"
      :key="file_kind"
    >
      <template #body>
        <div
          class="text-center rounded bg-surface-gray-7 px-2 py-1 text-xs text-ink-white shadow-xl"
        >
          {{ i.kind }} <br />{{ i.h_size }} ({{ i.percentageFormat }})
        </div>
      </template>
      <div
        class="h-7"
        :style="{
          backgroundColor: i.color,
          width: i.percentageFormat,
          paddingRight: `${1 + i.percentageRaw}px`,
        }"
      />
    </Tooltip>
  </div>

  <div
    v-else
    class="w-full flex flex-col items-center justify-center my-10"
  >
    <LucideCloud class="h-7 stroke-1 text-ink-gray-5" />
    <span class="text-ink-gray-8 text-sm mt-2">Chưa sử dụng dung lượng</span>
  </div>

  <div
    class="mt-1 text-ink-gray-8 font-medium text-sm sm:text-base py-2"
    :class="storageBreakdown.data?.entities?.length ? 'border-b' : ''"
  >
    Tệp lớn:
  </div>

  <div
    class="flex flex-col items-start justify-start w-full rounded full px-1 sm:px-1.5 overflow-y-auto max-h-[40vh] sm:max-h-[50vh]"
  >
    <div
      v-for="(i, index) in storageBreakdown.data?.entities"
      :key="i.name"
      class="w-full min-h-[40px] flex items-center justify-start py-2 sm:py-3 gap-x-2"
      :class="index > 0 ? 'border-t' : ''"
      @mouseenter="hoveredRow = i.name"
      @mouseleave="hoveredRow = null"
      @click="isMobile && openEntity($route.params.team, i) && $emit('close')"
    >
      <img :src="getIconUrl(i.file_type)" class="w-5 h-5 flex-shrink-0" />
      <span class="text-ink-gray-8 text-xs sm:text-sm truncate flex-1 min-w-0">{{ i.title }}</span>

      <div class="text-ink-gray-8 text-xs sm:text-sm ml-auto flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <Button
          v-if="hoveredRow === i.name || isMobile"
          variant="ghost"
          class="self-center !p-1"
          @click.stop="openEntity($route.params.team, i), $emit('close')"
        >
          <LucideArrowRight class="size-4 text-ink-gray-5" />
        </Button>
        <span class="whitespace-nowrap">{{ formatSize(i.file_size) }}</span>
      </div>
    </div>

    <div
      v-if="!storageBreakdown.data?.entities?.length"
      class="py-4 text-center w-full text-xs sm:text-sm text-italic"
    >
      {{ __("Không tìm thấy tệp nào.") }}
    </div>
  </div>
</template>

<script setup>
import { MIME_LIST_MAP, openEntity } from "@/utils/files"
import { COLOR_MAP, formatPercent, formatSize } from "@/utils/format"
import { getIconUrl } from "@/utils/getIconUrl"
import { Button, createResource, TabButtons, Tooltip } from "frappe-ui"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import LucideArrowRight from "~icons/lucide/arrow-right"
import LucideCloud from "~icons/lucide/cloud"

const hoveredRow = ref(null)
const isMobile = computed(() => window.innerWidth < 640)
const showFileStorage = ref(true)
const usedSpace = ref(0)
const spaceLimit = ref(0)
const route = useRoute()

function formatGB(bytes) {
  return (bytes / 1024 ** 3).toFixed(2) + " GB"
}

const storageBreakdown = createResource({
  url: "drive.api.storage.storage_breakdown",
  makeParams: (p) => p,
  onSuccess(data) {
    let res = {}
    usedSpace.value = 0

    spaceLimit.value = data.limit * 1024 * 1024

    data.total.forEach((item) => {
      let kind =
        Object.entries(MIME_LIST_MAP).find(([type, list]) =>
          list.includes(item.mime_type) ? type : false
        )?.[0] || "Unknown"

      res[kind] = res[kind] || { file_size: 0 }
      res[kind].file_size += item.file_size
      usedSpace.value += item.file_size
    })

    Object.keys(res).forEach((kind) => {
      res[kind].color = COLOR_MAP[kind]
      res[kind].kind = kind
      res[kind].percentageRaw = (100 * res[kind].file_size) / spaceLimit.value
      res[kind].percentageFormat = formatPercent(res[kind].percentageRaw)
      res[kind].h_size = formatSize(res[kind].file_size)
    })

    data.total = Object.entries(res).sort(
      (a, b) => b[1].file_size - a[1].file_size
    )
  },
  auto: false,
})

watch(
  showFileStorage,
  (val) =>
    storageBreakdown.fetch({
      team: route.params.team || localStorage.getItem("recentTeam"),
      owned_only: val,
    }),
  { immediate: true }
)

defineEmits(["close"])
</script>
