<script setup>
import { ref, onMounted } from "vue"
import { call } from "frappe-ui"
import {
    getHistoryFromCache,
    setHistoryToCache,
} from "./components/cache/mindmapCommentHistoryCache"

const props = defineProps({
    mindmapId: {
        type: String,
        required: true,
    },
})

const loading = ref(false)
const histories = ref([])
const error = ref(null)

async function fetchHistory() {
    // ✅ lấy từ cache trước
    const cached = getHistoryFromCache(props.mindmapId)
    if (cached) {
        histories.value = cached
        return
    }

    loading.value = true
    error.value = null

    try {
        const res = await call(
            "drive.api.mindmap_comment.get_comment_history_list",
            {
                mindmap_id: props.mindmapId,
            }
        )

        const items = res?.items || []
        histories.value = items

        // ✅ lưu cache
        setHistoryToCache(props.mindmapId, items)
    } catch (e) {
        console.error(e)
        error.value = "Không tải được lịch sử bình luận"
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    fetchHistory()
})
</script>


<template>
    <!-- Header -->
    <div class="text-[16px] border-b border-gray-200 pb-2 font-medium">
        Lịch sử bình luận
    </div>

    <!-- Content -->
    <div class="pt-3 space-y-3 text-sm overflow-hidden">
        <div v-if="loading" class="text-gray-400">
            Đang tải…
        </div>

        <div v-else-if="error" class="text-red-500">
            {{ error }}
        </div>

        <div v-else-if="histories.length === 0" class="text-gray-400">
            Chưa có lịch sử nào
        </div>

        <div class="space-y-4 text-sm">

            <div v-for="h in histories" :key="h.name" class="border rounded-md p-3 bg-white">
                <!-- Header -->
                <div class="flex justify-between items-center mb-2 text-xs text-gray-500">
                    <span class="font-medium">Đã xử lý bình luận</span>

                    <div class="flex items-center gap-3 text-blue-600">
                        <button class="hover:underline text-xs">
                            Mở lại
                        </button>
                        <i class="pi pi-trash cursor-pointer text-gray-400 hover:text-red-500" />
                    </div>
                </div>

                <!-- Quote block (tổng hợp comment) -->
                <div class="bg-gray-100 border-l-2 border-gray-300 px-3 py-2 mb-3 text-xs text-gray-700">
                    <div v-for="(c, idx) in h.comments" :key="idx" v-html="c.content" class="leading-relaxed" />
                </div>

                <!-- Comment list -->
                <div class="space-y-3">
                    <div v-for="c in h.comments" :key="c.id" class="flex gap-2">
                        <!-- Avatar -->
                        <div
                            class="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-medium">
                            {{ c.owner?.[0]?.toUpperCase() || "U" }}
                        </div>

                        <!-- Content -->
                        <div class="flex-1">
                            <div class="flex items-center gap-2 text-xs text-gray-500">
                                <span class="font-medium text-gray-700">
                                    {{ c.owner }}
                                </span>
                                <!-- <span>{{ timeAgo(c.created_at) }}</span> -->
                            </div>

                            <div class="prose prose-sm max-w-none" v-html="c.content" />
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div>
</template>
