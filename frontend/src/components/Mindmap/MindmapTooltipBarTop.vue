<template>
	<div 
		v-if="visible"
		class="mindmap-contextual-toolbar toolbar-top" 
		:style="style"
		@mouseenter="$emit('mouseenter')"
		@mouseleave="$emit('mouseleave')"
	>
		<!-- Format Text Buttons -->
		<div class="toolbar-group">
			<button
				@click.stop="$emit('toggle-bold')"
				:class="['toolbar-btn', { active: isBold }]"
				title="In đậm"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>
				</svg>
			</button>
			<button
				@click.stop="$emit('toggle-italic')"
				:class="['toolbar-btn', { active: isItalic }]"
				title="In nghiêng"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="19" x2="10" y1="4" y2="4"/>
					<line x1="14" x2="5" y1="20" y2="20"/>
					<line x1="15" x2="9" y1="4" y2="20"/>
				</svg>
			</button>
			<button
				@click.stop="$emit('toggle-underline')"
				:class="['toolbar-btn', { active: isUnderline }]"
				title="Gạch chân"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M6 4v6a6 6 0 0 0 12 0V4"/>
					<line x1="4" x2="20" y1="20" y2="20"/>
				</svg>
			</button>
		</div>

		<!-- Separator và Highlight Colors chỉ hiển thị khi không ở trong blockquote -->
		<template v-if="!isInBlockquote">
			<div class="toolbar-separator"></div>
			<!-- Highlight Colors (7 màu) -->
			<div class="toolbar-group highlight-colors-group">
				<button
					v-for="color in highlightColors"
					:key="color.value"
					@click.stop="$emit('set-highlight', color.value)"
					:class="['toolbar-btn highlight-color-btn', { active: currentColor === color.value && isHighlightActive }]"
					:style="{ backgroundColor: color.value }"
					:title="color.label"
				>
					<span class="highlight-color-text">A</span>
				</button>
			</div>
		</template>
	</div>
</template>

<script setup>
import { defineEmits, defineProps } from 'vue';

const props = defineProps({
	visible: {
		type: Boolean,
		default: false
	},
	style: {
		type: Object,
		default: () => ({})
	},
	isBold: {
		type: Boolean,
		default: false
	},
	isItalic: {
		type: Boolean,
		default: false
	},
	isUnderline: {
		type: Boolean,
		default: false
	},
	isHighlightActive: {
		type: Boolean,
		default: false
	},
	currentColor: {
		type: String,
		default: null
	},
	isInBlockquote: {
		type: Boolean,
		default: false
	},
	highlightColors: {
		type: Array,
		default: () => []
	}
})

defineEmits([
	'mouseenter',
	'mouseleave',
	'toggle-bold',
	'toggle-italic',
	'toggle-underline',
	'set-highlight'
])
</script>

<style scoped>
.mindmap-contextual-toolbar {
	position: fixed;
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 8px 12px;
	background: white;
	border: 1px solid #e5e7eb;
	border-radius: 8px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.toolbar-group {
	display: flex;
	align-items: center;
	gap: 4px;
}

.toolbar-separator {
	width: 1px;
	height: 20px;
	background: #e5e7eb;
}

.toolbar-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	padding: 0;
	border: none;
	background: transparent;
	border-radius: 6px;
	color: #1f2937;
	cursor: pointer;
	transition: all 0.2s;
	font-size: 14px;
	font-weight: 600;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.toolbar-btn:hover {
	background: #f3f4f6;
	color: #1f2937;
}

.toolbar-btn.active {
	background: #3b82f6;
	color: white;
}

.toolbar-btn.active:hover {
	background: #2563eb;
	color: white;
}

.highlight-colors-group {
	display: flex;
	gap: 2px;
}

.highlight-color-btn {
	width: 28px;
	height: 28px;
	position: relative;
	border: 1px solid rgba(0, 0, 0, 0.1);
	transition: all 0.2s;
}

.highlight-color-btn:hover {
	border-color: #3b82f6;
	transform: scale(1.1);
}

.highlight-color-btn.active {
	border: 2px solid #3b82f6 !important;
	box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
	transform: scale(1.05);
}

.highlight-color-text {
	color: rgba(0, 0, 0, 0.6);
	font-weight: 700;
	font-size: 14px;
	line-height: 1;
}
</style>