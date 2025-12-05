<template>
    <div v-if="visible" ref="menuRef" class="absolute bg-white shadow-lg z-[99] p-4 px-2 space-y-2 min-w-[160px]"
        :style="{
            top: position.y + 'px',
            left: position.x + 'px'
        }">
        <!-- Add Child -->
        <div class="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm" @click="emitAction('add-child')">
            Thêm nhánh con
        </div>

        <!-- Add Sibling -->
        <div v-if="node?.id !== 'root'" class="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
            @click="emitAction('add-sibling')">
            Thêm nhánh cùng cấp
        </div>

        <!-- Delete -->
        <div v-if="node?.id !== 'root'" class="px-3 py-2 hover:bg-red-100 text-red-600 cursor-pointer text-sm"
            @click="emitAction('delete')">
            Xóa nhánh
        </div>
        <div v-if="node?.id !== 'root'" class="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm">Thêm nhận
            xét</div>
    </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from "vue";

const props = defineProps({
    visible: Boolean,
    node: Object,
    position: Object
});

const emit = defineEmits(["action", "close"]);

const menuRef = ref(null);

function emitAction(action) {
    emit("action", {
        type: action,
        node: props.node
    });
    emit("close"); // đóng menu sau khi click
}

/**
 * Click Outside Handler
 */
function handleClickOutside(e) {
    if (!menuRef.value) return;

    // Nếu click không nằm trong menu → đóng menu
    if (!menuRef.value.contains(e.target)) {
        emit("close");
    }
}

/**
 * Theo dõi visible để add/remove event listener
 */
watch(
    () => props.visible,
    (v) => {
        if (v) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }
    }
);

// Cleanup khi component bị unmount (an toàn bộ nhớ)
onUnmounted(() => {
    document.removeEventListener("mousedown", handleClickOutside);
});
</script>

<style scoped>
/* Optional styling */
</style>
