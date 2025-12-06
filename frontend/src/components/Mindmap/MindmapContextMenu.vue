<template>
    <div v-if="visible" ref="menuRef" class="mindmap-context-menu"
        :style="{
            top: position.y + 'px',
            left: position.x + 'px'
        }">
        <!-- Add Child -->
        <div class="menu-item menu-item-primary" @click="emitAction('add-child')">
            <svg class="menu-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14M5 12h14"/>
            </svg>
            <span>Thêm nhánh con</span>
        </div>

        <!-- Add Sibling -->
        <div v-if="node?.id !== 'root'" class="menu-item menu-item-primary"
            @click="emitAction('add-sibling')">
            <svg class="menu-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Thêm nhánh cùng cấp</span>
        </div>

        <!-- Separator -->
        <div v-if="node?.id !== 'root'" class="menu-separator"></div>

        <!-- Copy -->
        <div v-if="node?.id !== 'root'" class="menu-item menu-item-default" @click="emitAction('copy')">
            <svg class="menu-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span>Sao chép</span>
        </div>

        <!-- Cut -->
        <div v-if="node?.id !== 'root'" class="menu-item menu-item-default" @click="emitAction('cut')">
            <svg class="menu-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="6" cy="6" r="3"/>
                <circle cx="6" cy="18" r="3"/>
                <line x1="8.12" y1="8.12" x2="19.26" y2="19.26"/>
                <line x1="19.26" y1="8.12" x2="8.12" y2="19.26"/>
            </svg>
            <span>Cắt</span>
        </div>

        <!-- Paste -->
        <div v-if="hasClipboard" class="menu-item menu-item-default" @click="emitAction('paste')">
            <svg class="menu-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
            </svg>
            <span>Dán</span>
        </div>

        <!-- Separator -->
        <div v-if="node?.id !== 'root'" class="menu-separator"></div>

        <!-- Copy Link -->
        <div v-if="node?.id !== 'root'" class="menu-item menu-item-default" @click="emitAction('copy-link')">
            <svg class="menu-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span>Sao chép liên kết</span>
        </div>

        <!-- Separator -->
        <div v-if="node?.id !== 'root'" class="menu-separator"></div>

        <!-- Add Comment -->
        <div v-if="node?.id !== 'root'" class="menu-item menu-item-default" @click="emitAction('add-comment')">
            <svg class="menu-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>Thêm nhận xét</span>
        </div>

        <!-- Separator -->
        <div v-if="node?.id !== 'root'" class="menu-separator"></div>

        <!-- Delete -->
        <div v-if="node?.id !== 'root'" class="menu-item menu-item-danger"
            @click="emitAction('delete')">
            <svg class="menu-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>Xóa nhánh</span>
        </div>
    </div>
</template>

<script setup>
import { onUnmounted, ref, watch } from "vue";

const props = defineProps({
    visible: Boolean,
    node: Object,
    position: Object,
    hasClipboard: Boolean
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
.mindmap-context-menu {
    position: absolute;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    min-width: 200px;
    padding: 6px;
    z-index: 99;
    animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(-4px) scale(0.98);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    transition: all 0.15s ease;
    user-select: none;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

.menu-item:hover {
    background-color: #f9fafb;
    transform: translateX(2px);
}

.menu-item:active {
    transform: translateX(2px) scale(0.98);
}

.menu-item-primary {
    color: #1f2937;
}

.menu-item-primary:hover {
    background-color: #eff6ff;
    color: #2563eb;
}

.menu-item-primary:hover .menu-icon {
    color: #2563eb;
}

.menu-item-default {
    color: #374151;
}

.menu-item-default:hover {
    background-color: #f9fafb;
    color: #111827;
}

.menu-item-danger {
    color: #dc2626;
}

.menu-item-danger:hover {
    background-color: #fef2f2;
    color: #b91c1c;
}

.menu-icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    stroke-width: 2;
    opacity: 0.9;
}

.menu-item-primary .menu-icon {
    color: #3b82f6;
}

.menu-item-default .menu-icon {
    color: #6b7280;
}

.menu-item-danger .menu-icon {
    color: #ef4444;
}

.menu-item span {
    flex: 1;
    line-height: 1.5;
    letter-spacing: 0.01em;
}

.menu-separator {
    height: 1px;
    background-color: #e5e7eb;
    margin: 4px 0;
}
</style>
