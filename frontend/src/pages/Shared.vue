<template>
  <GenericPage
    :get-entities="getShared"
    :icon="LucideUsers"
    :primary-message="__('No Shared Files')"
  />
</template>

<script setup>
import GenericPage from "@/components/GenericPage.vue"

import { getShared } from "@/resources/files"
import { computed, watch } from "vue"
import { useStore } from "vuex"
import LucideUsers from "~icons/lucide/users"

const store = useStore()
const shareView = computed(() => store.state.shareView)


watch(
  shareView,
  (val, oldVal) => {
    // Merge với params hiện tại để giữ page, page_size, order_by, etc.
    const currentParams = getShared.params || {}
    const params = {
      ...currentParams,
      by: val === "with" ? 0 : 1,
    }
    
    // Chỉ reset về trang 1 khi shareView thực sự thay đổi (không phải lần đầu mount)
    if (oldVal !== undefined && val !== oldVal) {
      params.page = 1
    }
    
    getShared.fetch(params)
  },
  { immediate: true }
)

// Không cần reset shareView nữa vì đã lưu vào localStorage
// onUnmounted(()=>{
//   store.commit('toggleShareView', "by")
// })

</script>
