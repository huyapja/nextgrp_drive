<template>
    <!-- Header -->
    <div class="text-[16px] border-b border-gray-200 pb-2 font-medium">
        Lịch sử bình luận
    </div>

    <!-- Content -->
    <div ref="scrollContainer" class="pt-2 text-sm overflow-y-auto max-h-[calc(100vh-160px)]">
        <div v-if="loading" class="text-gray-400">
            Đang tải…
        </div>

        <div v-else-if="error" class="text-red-500">
            {{ error }}
        </div>

        <div v-else-if="histories.length === 0" class="text-gray-400">
            Chưa có lịch sử nào
        </div>

        <div class="text-sm">

            <div v-for="h in histories" :key="h.name" class="py-4 px-3 history-item" :data-node-id="h.node_id"
                :data-session-index="h.session_index">

                <!-- Header -->
                <div class="flex justify-between items-center mb-2 text-xs text-gray-500">
                    <span class="font-medium">
                        {{ isNodeStillExist(h) ? "Đã xử lý bình luận" : "Nhận xét đã bị xóa" }}
                    </span>


                    <div class="flex items-center gap-3 text-blue-600">
                        <button v-if="isNodeStillExist(h)" @click="handleUnresolve(h)" class="hover:underline text-xs">
                            Mở lại
                        </button>
                        <i v-tooltip.top="{ value: 'Xóa bình luận', pt: { text: { class: ['text-[12px]'] } } }"
                            @click="handleDeleteHistory(h)"
                            class="pi pi-trash cursor-pointer text-gray-400 hover:text-red-500" />
                    </div>
                </div>

                <!-- Quote block (tổng hợp comment) -->
                <div class="
                    bg-gray-100
                    px-3 py-2 mb-3
                    text-xs text-gray-700
                    break-words
                    rounded-sm
                ">
                    <span style="
                        display: inline-block;
                        border-left: 2px solid #8f959e;
                        color: #646a73;
                        padding: 0 8px;
                        margin-left: 8px;
                        user-select: none;
                        ">
                        {{ h.node_title || '' }}
                    </span>
                </div>


                <!-- Comment list -->
                <div class="space-y-4">
                    <div v-for="c in h.comments" :key="c.id" :ref="el => setCommentRef(c, el)"
                        class="flex gap-2 history-comment" :data-comment-id="c.id">
                        <!-- Avatar -->
                        <CustomAvatar :image="getUserByOwner(c.owner)?.user_image"
                            :label="getUserByOwner(c.owner)?.full_name?.slice(0, 1) || c.owner?.[0]?.toUpperCase()"
                            shape="circle" size="small" />


                        <!-- Content -->
                        <div class="flex-1">
                            <div class="flex items-center gap-2 text-xs text-gray-500">
                                <span class="font-medium text-gray-700">
                                    {{ getUserByOwner(c.owner)?.full_name }}
                                </span>
                                <span class="!text-[10px]">{{ displayHistoryTime(c) }}</span>

                            </div>

                            <div class="max-w-none !text-[12px] mt-2" v-html="c.content" />

                            <!-- Reactions (history - read only) -->
                            <div v-if="h.reactions && h.reactions[c.id]" class="mt-2 flex flex-wrap gap-1">
                                <span v-for="(data, emoji) in h.reactions[c.id]" :key="emoji" v-tooltip.top="{
                                    value: buildReactionTooltip(data.users),
                                    pt: { text: { class: 'text-[11px] leading-tight' } }
                                }" class="
      inline-flex items-center gap-2
      px-2 py-[2px]
      text-[12px]
      bg-gray-200
      rounded-full
      text-gray-700
      select-none
      cursor-default
    ">
                                    <span class="leading-none">
                                        {{ emoji }}
                                    </span>
                                    <span class="text-[11px]">
                                        {{ data.count }}
                                    </span>
                                </span>
                            </div>


                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div>
</template>

<script setup>
import CustomAvatar from "../CustomAvatar.vue"
import { getTeamMembers } from "../../resources/team"
import { ref, onMounted, computed, onUnmounted, inject, watch, nextTick } from "vue"
import { call } from "frappe-ui"
import {
    getHistoryFromCache,
    setHistoryToCache,
    clearHistoryCache,
} from "./components/cache/mindmapCommentHistoryCache"
import { timeAgo } from "./utils/timeAgo"

const props = defineProps({
    mindmapId: {
        type: String,
        required: true,
    },
    scrollTarget: Object,
    visible: Boolean,
    nodeMap: {
        type: Object,
        default: () => ({}),
    },
})

const loading = ref(false)
const histories = ref([])
const error = ref(null)
const socket = inject("socket")

const commentRefs = ref({})
const scrollContainer = ref(null)


function scrollIntoContainer(container, el) {
    if (!container || !el) return

    const containerRect = container.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()

    const offset =
        elRect.top -
        containerRect.top +
        container.scrollTop -
        container.clientHeight / 2 +
        elRect.height / 2

    container.scrollTo({
        top: offset,
        behavior: "smooth",
    })
}


function setCommentRef(c, el) {
    if (!el) return
    commentRefs.value[c.id] = el
}

function normalizeEmoji(emoji) {
    return emoji
}

const memberMap = computed(() => {
    const map = {}
        ; (getTeamMembers.data || []).forEach(m => {
            map[m.email] = m
        })
    return map
})

function getUserByOwner(email) {
    return memberMap.value[email] || null
}

async function fetchHistory() {
    // lấy từ cache trước
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

        // lưu cache
        setHistoryToCache(props.mindmapId, items)
    } catch (e) {
        console.error(e)
        error.value = "Không tải được lịch sử bình luận"
    } finally {
        loading.value = false
    }
}

function displayHistoryTime(c) {
    if (!c) return ""

    const created = new Date(c.created_at)
    const modified = c.modified_at
        ? new Date(c.modified_at)
        : created

    if (modified > created) {
        return `${timeAgo(modified)} (đã chỉnh sửa)`
    }

    return timeAgo(created)
}

async function handleUnresolve(h) {
    if (!h?.name) return

    try {
        // gọi API unresolve
        await call("drive.api.mindmap_comment.unresolve_node", {
            history_name: h.name,
        })

        // clear cache để lần mở sau gọi lại API
        clearHistoryCache(props.mindmapId)

        // update UI local ngay (không cần đợi reload)
        histories.value = histories.value.filter(
            item => item.name !== h.name
        )

    } catch (e) {
        console.error("Unresolve failed:", e)
    }
}

async function handleDeleteHistory(h) {
    await call("drive.api.mindmap_comment.delete_history", {
        history_id: h.name,
    })

    clearHistoryCache(props.mindmapId)
}

function handleRealtimeHistoryDeleted(payload) {
    if (!payload) return
    if (payload.mindmap_id !== props.mindmapId) return

    histories.value = histories.value.filter(
        (h) => h.name !== payload.history_id
    )
}

function handleRealtimeNodeUnresolved(payload) {
    if (!payload) return
    if (payload.mindmap_id !== props.mindmapId) return

    clearHistoryCache(props.mindmapId)

    histories.value = histories.value.filter(
        h =>
            !(
                h.node_id === payload.node_id &&
                h.session_index === payload.session_index
            )
    )
}


const nodeKeyMap = computed(() => {
    const map = {}

    Object.values(props.nodeMap || {}).forEach(node => {
        if (node?.node_key) {
            map[node.node_key] = node
        }
    })

    return map
})

function isNodeStillExist(h) {
    return !!nodeKeyMap.value[h.node_key]
}

watch(
    () => [
        props.visible,
        props.scrollTarget,
        histories.value.length,
        loading.value
    ],
    async ([visible, target, len, loading]) => {
        if (!visible) return
        if (!target) return
        if (loading) return
        if (len === 0) return

        // 🟢 ĐỢI POPUP RENDER XONG
        await nextTick()
        await nextTick()
        await new Promise(r => setTimeout(r, 120))

        const container = scrollContainer.value
        if (!container) return

        const historyEl = container.querySelector(
            `[data-node-id="${target.node_id}"][data-session-index="${target.session_index}"]`
        )

        if (!historyEl) return

        // ✅ SCROLL ĐÚNG CONTAINER
        scrollIntoContainer(container, historyEl)

        // highlight comment nếu có
        if (target.comment_id) {
            const commentEl = commentRefs.value[target.comment_id]
            if (!commentEl) return

            commentEl.classList.add("highlight-history")
            setTimeout(() => {
                commentEl.classList.remove("highlight-history")
            }, 2000)
        }
    },
    { immediate: true }
)


onMounted(() => {
    fetchHistory()
    socket?.on(
        "drive_mindmap:history_deleted",
        handleRealtimeHistoryDeleted
    )
    socket?.on(
        "drive_mindmap:node_unresolved",
        handleRealtimeNodeUnresolved
    )
})

onUnmounted(() => {
    socket?.off(
        "drive_mindmap:history_deleted",
        handleRealtimeHistoryDeleted
    )
    socket?.off(
        "drive_mindmap:node_unresolved",
        handleRealtimeNodeUnresolved
    )
})

const getCookie = (name) => {
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)

    if (parts.length === 2) {
        return parts.pop().split(";").shift()
    }

    return null
}

const userIdFromCookie = computed(() =>
    decodeURIComponent(getCookie("user_id") || "")
)


function buildReactionTooltip(users = []) {
    if (!users.length) return ""

    const names = users.map(u => {
        if (u.email === userIdFromCookie.value) {
            return "Bạn"
        }
        return u.full_name || u.email
    })

    if (names.length === 1) {
        return `${names[0]} đã thả cảm xúc`
    }

    if (names.length === 2) {
        return `${names[0]} và ${names[1]} đã thả cảm xúc`
    }

    return `${names.slice(0, 2).join(", ")} và ${names.length - 2} người khác đã thả cảm xúc`
}

</script>

<style scoped>
.highlight-history {
    background-color: #fff7c2;
    border-radius: 6px;
    transition: background-color 0.2s ease;
}
</style>