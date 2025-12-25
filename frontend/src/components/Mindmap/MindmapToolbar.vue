<template>
	<div v-if="shouldShowToolbar" class="mindmap-toolbar">
		<!-- Thanh công cụ dưới: Các tùy chọn khác (luôn hiển thị) -->
		<div class="toolbar-bottom">
			<!-- Hand icon (icon đầu tiên) - khi hover sẽ hiển thị toolbar-top -->
			<div class="toolbar-item-wrapper" @mouseenter="handleWrapperMouseEnter" @mouseleave="handleMouseLeave" @click.stop>
				<button
					class="toolbar-btn"
					title="Tùy chọn định dạng"
					@click.stop
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M8.437 4.898 5.447 13h6.063L8.437 4.898Zm6.025 15.881L12.269 15h-7.56l-2.131 5.78a1 1 0 1 1-1.873-.703L7.02 2.982c.491-1.31 2.344-1.31 2.835 0l6.48 17.095a1 1 0 1 1-1.872.702ZM15.056 5a1 1 0 1 0 0 2H23a1 1 0 1 0 0-2h-7.944Zm1.055 7a1 1 0 0 1 1-1H23a1 1 0 1 1 0 2h-5.89a1 1 0 0 1-1-1Zm3.056 5a1 1 0 1 0 0 2H23a1 1 0 1 0 0-2h-3.833Z" fill="currentColor"></path>
					</svg>
				</button>
				
				<!-- Toolbar-top hiển thị khi hover -->
				<div v-if="showTopToolbar" class="toolbar-top-popup" @mouseenter="handlePopupMouseEnter" @mouseleave="handlePopupMouseLeave" @click.stop>
				<!-- Bold -->
				<button
					class="toolbar-btn"
					:class="{ active: isBold }"
					@mousedown.prevent="saveSelection"
					@click.stop="toggleBold"
					title="In đậm (Ctrl+B)"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M5 2.709C5 2.317 5.317 2 5.709 2h6.734a5.317 5.317 0 0 1 3.686 9.148 5.671 5.671 0 0 1-2.623 10.7H5.71a.709.709 0 0 1-.71-.707V2.71Zm2 7.798h5.443a3.19 3.19 0 0 0 3.19-3.19c0-1.762-1.428-3.317-3.19-3.317H7v6.507Zm0 2.126v7.09h6.507a3.544 3.544 0 0 0 0-7.09H7Z" fill="currentColor"></path>
					</svg>
				</button>

				<!-- Italic -->
				<button
					class="toolbar-btn"
					:class="{ active: isItalic }"
					@mousedown.prevent="saveSelection"
					@click.stop="toggleItalic"
					title="In nghiêng (Ctrl+I)"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M14.825 5.077 11.19 18.923h4.052a1.038 1.038 0 1 1 0 2.077H4.954a1.038 1.038 0 1 1 0-2.077h4.053l3.636-13.846H8.591A1.038 1.038 0 1 1 8.59 3h10.287a1.038 1.038 0 0 1 0 2.077h-4.053Z" fill="currentColor"></path>
					</svg>
				</button>

				<!-- Underline -->
				<button
					class="toolbar-btn"
					:class="{ active: isUnderline }"
					@mousedown.prevent="saveSelection"
					@click.stop="toggleUnderline"
					title="Gạch chân (Ctrl+U)"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M7.361 3.052a.99.99 0 0 0-.989-.994.998.998 0 0 0-.999.994v5.765c0 4.205 2.601 7.29 6.627 7.29s6.627-3.085 6.627-7.29V3.052a.996.996 0 0 0-.996-.994.992.992 0 0 0-.992.994v5.765c0 3.003-1.763 5.302-4.639 5.302-2.876 0-4.639-2.299-4.639-5.302V3.052ZM3.054 19.42a.988.988 0 0 0-.994.988 1 1 0 0 0 .994 1h17.892a1 1 0 0 0 .994-1.002.987.987 0 0 0-.994-.986H3.054Z" fill="currentColor"></path>
					</svg>
				</button>

					<!-- Separator -->
					
					<!-- Color options (highlight colors) - chỉ hiển thị khi không ở trong blockquote -->
					<template v-if="!isInBlockquote">
						<div class="toolbar-separator"></div>
					<button
						v-for="color in highlightColors"
						:key="color.value"
						class="toolbar-btn color-btn"
						:style="{ backgroundColor: color.bg }"
						:class="{ active: currentHighlightColor === color.value }"
						@mousedown.prevent="saveSelection"
						@click.stop="setHighlightColor(color.value)"
						:title="color.label"
					>
						<span class="color-label" :style="{ color: color.text }">A</span>
					</button>
					</template>
				</div>
			</div>

			<!-- Checkmark (Done) -->
			<button
				class="toolbar-btn toolbar-btn-done"
				:class="{ active: isCompleted }"
				@click.stop="handleDone"
				title="Hoàn thành (Ctrl+Enter)"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1.16-8.72 4.952-4.952a.996.996 0 0 1 1.409.005 1 1 0 0 1 .007 1.41c-1.888 1.905-3.752 3.842-5.685 5.7a.98.98 0 0 1-1.364-.001c-1.01-.98-1.993-1.992-2.983-2.993a1.003 1.003 0 0 1 .005-1.414.998.998 0 0 1 1.412-.002l2.247 2.247Z" fill="currentColor"></path>
				</svg>
			</button>

			<!-- List with pen -->
			<button
				class="toolbar-btn"
				@mousedown.prevent="saveSelection"
				@click.stop="handleListAction"
				title="Mô tả (Shift+Enter)"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M19.602 3.06a1.5 1.5 0 1 1 2.898.777l-.388 1.449-2.898-.776.388-1.45Zm-.774 2.888 2.898.777-3.897 14.543c-.076.285-.24.54-.468.727l-1.48 1.218a.17.17 0 0 1-.268-.073l-.65-1.798a1.394 1.394 0 0 1-.036-.835l3.901-14.559ZM3 3a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2H3Zm-1 9a1 1 0 0 1 1-1h9a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1Zm1 7a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H3Z" fill="currentColor"></path>
				</svg>
			</button>

			<!-- Insert image -->
			<button
				class="toolbar-btn"
				@mousedown.prevent="saveSelection"
				@click.stop.prevent="handleInsertImage"
				title="Chèn hình ảnh"
				:disabled="!props.selectedNode"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="m10.141 17.988-4.275-.01a.3.3 0 0 1-.212-.512l4.133-4.133a.4.4 0 0 1 .566 0l1.907 1.907 5.057-5.057a.4.4 0 0 1 .683.283V17.7a.3.3 0 0 1-.3.3h-7.476a.301.301 0 0 1-.083-.012ZM4 22c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2H4Zm0-2h16V4H4v16ZM6 6h3v3H6V6Z" fill="currentColor"></path>
				</svg>
			</button>

			<!-- More options (ellipsis) -->
			<div class="toolbar-item-wrapper" @mouseenter="handleMoreOptionsWrapperEnter" @mouseleave="handleMoreOptionsWrapperLeave" @click.stop>
				<button
					ref="moreOptionsBtnRef"
					class="toolbar-btn"
					@mousedown.prevent="saveSelection"
					title="Tùy chọn khác"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M5.5 11.75a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0Zm8.225 0a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0Zm8.275 0a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0Z" fill="currentColor"></path>
					</svg>
				</button>
				
				<!-- Context menu popup hiển thị khi hover -->
				<div v-if="showMoreOptionsMenu && props.selectedNode" class="toolbar-top-popup toolbar-context-menu-popup" @mouseenter="handleMoreOptionsPopupEnter" @mouseleave="handleMoreOptionsPopupLeave" @click.stop>
					<!-- Context menu items -->
					<!-- Add Child -->
					<div class="context-menu-item" @click.stop="handleContextAction('add-child')">
						<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 5v14M5 12h14"/>
						</svg>
						<span>Thêm nhánh con</span>
					</div>
					
					<!-- Add Sibling -->
					<div v-if="props.selectedNode?.id !== 'root'" class="context-menu-item" @click.stop="handleContextAction('add-sibling')">
						<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="12" y1="5" x2="12" y2="19"/>
							<line x1="5" y1="12" x2="19" y2="12"/>
						</svg>
						<span>Thêm nhánh cùng cấp</span>
					</div>
					
					<div v-if="props.selectedNode?.id !== 'root'" class="toolbar-separator"></div>
					
					<!-- Copy -->
					<div v-if="props.selectedNode?.id !== 'root'" class="context-menu-item" @click.stop="handleContextAction('copy')">
						<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
						</svg>
						<span>Sao chép</span>
					</div>
					
					<!-- Cut -->
					<div v-if="props.selectedNode?.id !== 'root'" class="context-menu-item" @click.stop="handleContextAction('cut')">
						<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="6" cy="6" r="3"/>
							<circle cx="6" cy="18" r="3"/>
							<line x1="8.12" y1="8.12" x2="19.26" y2="19.26"/>
							<line x1="19.26" y1="8.12" x2="8.12" y2="19.26"/>
						</svg>
						<span>Cắt</span>
					</div>
					
					<!-- Paste - Luôn hiển thị để có thể dán từ clipboard hệ thống -->
					<div class="context-menu-item" @click.stop="handleContextAction('paste')">
						<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
							<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
						</svg>
						<span>Dán</span>
					</div>
					
					<div v-if="props.selectedNode?.id !== 'root'" class="toolbar-separator"></div>
					
					<!-- Copy Link -->
					<div v-if="props.selectedNode?.id !== 'root'" class="context-menu-item" @click.stop="handleContextAction('copy-link')">
						<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
							<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
						</svg>
						<span>Sao chép liên kết</span>
					</div>
					
					<div v-if="props.selectedNode?.id !== 'root'" class="toolbar-separator"></div>

					<!-- Link task -->
					<div v-if="props.selectedNode?.id !== 'root' && !props.selectedNode?.data?.taskLink?.taskId" class="context-menu-item" @click.stop="handleContextAction('link-task')">
						<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
							<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
						</svg>
						<span>Liên kết công việc từ nhánh</span>
					</div>
					
					<!-- Delete task link -->
					<div v-if="props.selectedNode?.id !== 'root' && props.selectedNode?.data?.taskLink?.taskId" class="context-menu-item" @click.stop="handleContextAction('delete-task-link')">
						<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
							<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
						<span>Xóa liên kết công việc</span>
					</div>
					
					<div v-if="props.selectedNode?.id !== 'root'" class="toolbar-separator"></div>
					
					<!-- Add Comment -->
					<div v-if="props.selectedNode?.id !== 'root'" class="context-menu-item" @click.stop="handleContextAction('add-comment')">
						<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
						</svg>
						<span>Thêm nhận xét</span>
					</div>
					
					<div v-if="props.selectedNode?.id !== 'root'" class="toolbar-separator"></div>
					
					<!-- Delete -->
					<div v-if="props.selectedNode?.id !== 'root'" class="context-menu-item context-menu-item-danger" @click.stop="handleContextAction('delete')">
						<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="3 6 5 6 21 6"/>
							<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
						</svg>
						<span>Xóa nhánh</span>
					</div>
				</div>
			</div>

			<!-- Separator -->
			<div class="toolbar-separator"></div>

			<!-- Comments -->
			<button
				class="toolbar-btn"
				@click.stop="handleComments"
				title="Bình luận"
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M3 3h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-3 3v-3H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
					<line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1.5" />
				</svg>
			</button>
		</div>
	</div>
</template>

<script setup>
import { handleEditorStyleUpdate } from '@/utils/d3mindmap/nodeEditor'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
	visible: {
		type: Boolean,
		default: false
	},
	selectedNode: {
		type: Object,
		default: null
	},
	editorInstance: {
		type: Object,
		default: null
	},
	isEditing: {
		type: Boolean,
		default: false
	},
	renderer: {
		type: Object,
		default: null
	}
})

const emit = defineEmits([
	'bold',
	'italic',
	'underline',
	'highlight-color',
	'done',
	'list-action',
	'insert-image',
	'more-options',
	'context-action',
	'comments'
])

// Computed: Kiểm tra xem có nên hiển thị toolbar không (không hiển thị cho root node)
const shouldShowToolbar = computed(() => {
	if (!props.visible || !props.selectedNode) return false
	
	// Không hiển thị toolbar cho root node
	const isRootNode = props.selectedNode.id === 'root' || props.selectedNode.data?.isRoot === true
	return !isRootNode
})

// State
const showTopToolbar = ref(false)
const isBold = ref(false)
const isItalic = ref(false)
const isUnderline = ref(false)
const currentHighlightColor = ref(null)
const showComments = ref(false)
const isInBlockquote = ref(false) // Kiểm tra cursor có đang ở trong blockquote không
const isCompleted = ref(false) // Kiểm tra node có đã completed không
const moreOptionsBtnRef = ref(null) // Ref cho nút "Tùy chọn khác"
const showMoreOptionsMenu = ref(false) // Hiển thị context menu popup
let moreOptionsMenuTimeout = null // Timeout để đóng menu

// ⚠️ NEW: Lưu selection trước khi click vào button
let savedSelection = null

// Highlight colors với background pastel
const highlightColors = [
	{ value: 'pink', label: 'Hồng', bg: '#fce7f3', text: '#ec4899' },
	{ value: 'yellow', label: 'Vàng', bg: '#fef3c7', text: '#f59e0b' },
	{ value: 'purple', label: 'Tím', bg: '#f3e8ff', text: '#a855f7' },
	{ value: 'blue', label: 'Xanh dương', bg: '#dbeafe', text: '#3b82f6' },
	{ value: 'teal', label: 'Xanh ngọc', bg: '#ccfbf1', text: '#14b8a6' },
	{ value: 'green', label: 'Xanh lá', bg: '#d1fae5', text: '#10b981' },
	{ value: 'grey', label: 'Xám', bg: '#d1d5db', text: '#374151' }
]

// Handle mouse leave với delay để tránh đóng sớm
let mouseLeaveTimeout = null

const clearMouseLeaveTimeout = () => {
	if (mouseLeaveTimeout) {
		clearTimeout(mouseLeaveTimeout)
		mouseLeaveTimeout = null
	}
}

const handleMouseLeave = () => {
	clearMouseLeaveTimeout()
	mouseLeaveTimeout = setTimeout(() => {
		showTopToolbar.value = false
	}, 200) // Tăng delay lên 200ms để dễ di chuyển chuột hơn
}

const handlePopupMouseEnter = () => {
	clearMouseLeaveTimeout()
	showTopToolbar.value = true
}

const handlePopupMouseLeave = () => {
	clearMouseLeaveTimeout()
	mouseLeaveTimeout = setTimeout(() => {
		showTopToolbar.value = false
	}, 200)
}

const handleWrapperMouseEnter = () => {
	clearMouseLeaveTimeout()
	showTopToolbar.value = true
}

// ⚠️ NEW: Lưu selection trước khi click vào button và prevent blur
const saveSelection = (event) => {
	if (!props.editorInstance) return
	
	// ⚠️ FIX: Prevent blur khi click vào toolbar button
	// Đặc biệt quan trọng với node mới vì editor có thể bị blur trước khi action được thực hiện
	if (event) {
		event.preventDefault()
		event.stopPropagation()
	}
	
	// ⚠️ FIX: Luôn lưu selection (không cần check isEditing)
	// Với node mới, isEditing có thể là false nhưng vẫn cần lưu selection
	try {
		const { state } = props.editorInstance.view
		const { from, to } = state.selection
		savedSelection = { from, to }
		
	} catch (error) {
		
		savedSelection = null
	}
	
	// ⚠️ FIX: Đảm bảo editor được focus lại ngay sau khi mousedown
	// Sử dụng requestAnimationFrame để đảm bảo focus sau khi blur xảy ra
	// Đặc biệt quan trọng với node mới để trigger onNodeEditingStart
	requestAnimationFrame(() => {
		// ⚠️ FIX: Check editor instance và view trước khi truy cập
		if (props.editorInstance && !props.editorInstance.isDestroyed && props.editorInstance.view) {
			try {
				// Focus lại editor để tiếp tục chỉnh sửa
				// Điều này sẽ trigger onNodeEditingStart nếu chưa được trigger
				props.editorInstance.chain().focus().run()
				
			} catch (error) {
				
			}
		}
	})
}

// Watch editor instance để cập nhật trạng thái
watch(() => props.editorInstance, (editor) => {
	if (editor) {
		updateEditorState(editor)
		// Lắng nghe selection changes
		editor.on('selectionUpdate', () => {
			updateEditorState(editor)
		})
		editor.on('update', () => {
			updateEditorState(editor)
		})
	}
}, { immediate: true })

// ⚠️ NEW: Watch selectedNode để cập nhật editor state khi node được chọn
watch(() => props.selectedNode?.id, (nodeId) => {
	if (nodeId && props.editorInstance) {
		// Cập nhật isCompleted dựa trên selectedNode
		isCompleted.value = props.selectedNode?.data?.completed || false
		
		// Khi node được chọn, cập nhật editor state
		// Sử dụng nextTick để đảm bảo editor đã sẵn sàng
		setTimeout(() => {
			if (props.editorInstance) {
				updateEditorState(props.editorInstance)
				
			}
		}, 50)
	} else {
		// Không có node được chọn
		isCompleted.value = false
	}
}, { immediate: true })

// Watch selectedNode.data.completed để cập nhật isCompleted khi completed status thay đổi
watch(() => props.selectedNode?.data?.completed, (completed) => {
	isCompleted.value = completed || false
}, { immediate: true })

// ⚠️ NEW: Watch isEditing để cập nhật isInBlockquote
watch(() => props.isEditing, (isEditing) => {
	if (!isEditing && props.editorInstance) {
		// Khi không editing, mặc định cursor sẽ ở title, nên isInBlockquote = false
		isInBlockquote.value = false
		// ⚠️ IMPORTANT: Vẫn gọi updateEditorState để cập nhật trạng thái button
		updateEditorState(props.editorInstance)
		
	} else if (isEditing && props.editorInstance) {
		// Khi editing, kiểm tra lại vị trí cursor
		updateEditorState(props.editorInstance)
	}
}, { immediate: true })

// Helper: Kiểm tra xem cursor có đang ở trong blockquote không
const checkIfInBlockquote = (editor) => {
	if (!editor) return false
	
	const { state } = editor.view
	const { selection } = state
	const { $from } = selection
	
	// Kiểm tra parent nodes
	for (let i = $from.depth; i > 0; i--) {
		const node = $from.node(i)
		if (node && node.type.name === 'blockquote') {
			return true
		}
	}
	
	return false
}

// Helper: Update style mà không tính toán lại kích thước
const updateStyleWithoutResize = () => {
	if (!props.renderer || !props.selectedNode || !props.editorInstance) return
	
	const nodeId = props.selectedNode.id
	// Tìm foreignObject element
	const nodeGroup = props.renderer.g?.select(`[data-node-id="${nodeId}"]`)
	if (nodeGroup && !nodeGroup.empty()) {
		const fo = nodeGroup.select('.node-text')
		const foNode = fo.node()
		if (foNode) {
			const node = props.renderer.nodes?.find(n => n.id === nodeId)
			if (node) {
				handleEditorStyleUpdate(props.renderer, nodeId, foNode, node)
			}
		}
	}
}

// Helper: Kiểm tra xem có mark trong title paragraphs không
const checkMarkInTitle = (editor, markType) => {
	if (!editor) return false
	
	try {
		const { state } = editor.view
		const { doc } = state
		
		// Tìm tất cả text nodes trong title paragraphs (không trong blockquote)
		let hasMark = false
		
		doc.descendants((node, pos) => {
			if (hasMark) return false // Đã tìm thấy, dừng iteration
			
			if (node.isText) {
				const resolvedPos = state.doc.resolve(pos)
				let inBlockquote = false
				
				// Kiểm tra parent nodes
				for (let i = resolvedPos.depth; i > 0; i--) {
					const nodeAtDepth = resolvedPos.node(i)
					if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
						inBlockquote = true
						break
					}
				}
				
				if (!inBlockquote) {
					// Text node là title, kiểm tra xem có mark không
					const marks = node.marks || []
					if (marks.some(mark => mark.type.name === markType)) {
						hasMark = true
						return false // Stop iteration
					}
				}
			}
		})
		
		
		return hasMark
	} catch (error) {
		
		return false
	}
}

// Helper: Lấy highlight color từ title paragraphs
const getHighlightColorFromTitle = (editor) => {
	if (!editor) return null
	
	try {
		const { state } = editor.view
		const { doc } = state
		
		// Tìm highlight color trong title paragraphs (không trong blockquote)
		let foundColor = null
		
		doc.descendants((node, pos) => {
			if (foundColor) return false // Đã tìm thấy, dừng iteration
			
			if (node.isText) {
				const resolvedPos = state.doc.resolve(pos)
				let inBlockquote = false
				
				// Kiểm tra parent nodes
				for (let i = resolvedPos.depth; i > 0; i--) {
					const nodeAtDepth = resolvedPos.node(i)
					if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
						inBlockquote = true
						break
					}
				}
				
				if (!inBlockquote) {
					// Text node là title, kiểm tra xem có textStyle mark với backgroundColor không
					const marks = node.marks || []
					const textStyleMark = marks.find(mark => mark.type.name === 'textStyle')
					if (textStyleMark && textStyleMark.attrs && textStyleMark.attrs.backgroundColor) {
						foundColor = textStyleMark.attrs.backgroundColor
						return false // Stop iteration
					}
				}
			}
		})
		
		// Map hex color to color name
		if (foundColor) {
			const hexColor = foundColor.toLowerCase().trim()
			const colorMap = {
				'#fce7f3': 'pink',
				'#fef3c7': 'yellow',
				'#f3e8ff': 'purple',
				'#dbeafe': 'blue',
				'#ccfbf1': 'teal',
				'#d1fae5': 'green',
				'#d1d5db': 'grey',
				'rgb(252, 231, 243)': 'pink',
				'rgb(254, 243, 199)': 'yellow',
				'rgb(243, 232, 255)': 'purple',
				'rgb(219, 234, 254)': 'blue',
				'rgb(204, 251, 241)': 'teal',
				'rgb(209, 250, 229)': 'green',
				'rgb(243, 244, 246)': 'grey'
			}
			const colorName = colorMap[hexColor] || null
			
			return colorName
		}
		
		
		return null
	} catch (error) {
		
		return null
	}
}

// Cập nhật trạng thái từ editor
const updateEditorState = (editor) => {
	if (!editor) {
		
		return
	}
	
	
	
	// ⚠️ IMPORTANT: Cập nhật trạng thái button dựa trên editing state
	if (props.isEditing) {
		// Khi editing: kiểm tra tại cursor position
		isBold.value = editor.isActive('bold')
		isItalic.value = editor.isActive('italic')
		isUnderline.value = editor.isActive('underline')
		
	} else {
		// Khi không editing: kiểm tra toàn bộ title paragraphs
		isBold.value = checkMarkInTitle(editor, 'bold')
		isItalic.value = checkMarkInTitle(editor, 'italic')
		isUnderline.value = checkMarkInTitle(editor, 'underline')
		
	}
	
	// ⚠️ NEW: Chỉ kiểm tra blockquote khi đang editing
	// Khi không editing, mặc định cursor sẽ ở title, nên isInBlockquote = false
	if (props.isEditing) {
		// Kiểm tra xem cursor có đang ở trong blockquote không
		isInBlockquote.value = checkIfInBlockquote(editor)
	} else {
		// Không editing: mặc định ở title, không ở blockquote
		isInBlockquote.value = false
	}
	
	// Chỉ lấy highlight color nếu cursor không ở trong blockquote
	if (!isInBlockquote.value) {
		if (props.isEditing) {
			// Khi editing: lấy highlight color tại cursor position
			const textStyleAttrs = editor.getAttributes('textStyle')
			if (textStyleAttrs && textStyleAttrs.backgroundColor) {
				// Map hex color to color name
				const hexColor = textStyleAttrs.backgroundColor.toLowerCase().trim()
				const colorMap = {
					'#fce7f3': 'pink',
					'#fef3c7': 'yellow',
					'#f3e8ff': 'purple',
					'#dbeafe': 'blue',
					'#ccfbf1': 'teal',
					'#d1fae5': 'green',
					'#d1d5db': 'grey',
					'rgb(252, 231, 243)': 'pink',
					'rgb(254, 243, 199)': 'yellow',
					'rgb(243, 232, 255)': 'purple',
					'rgb(219, 234, 254)': 'blue',
					'rgb(204, 251, 241)': 'teal',
					'rgb(209, 250, 229)': 'green',
					'rgb(243, 244, 246)': 'grey'
				}
				currentHighlightColor.value = colorMap[hexColor] || null
			} else {
				currentHighlightColor.value = null
			}
		} else {
			// Khi không editing: lấy highlight color từ title paragraphs
			currentHighlightColor.value = getHighlightColorFromTitle(editor)
		}
	} else {
		// Nếu đang ở trong blockquote, clear highlight color
		currentHighlightColor.value = null
	}
}

// Helper: Áp dụng style cho title (paragraphs không trong blockquote)
const applyStyleToTitle = (editor, markType, attrs = {}) => {
	if (!editor) return
	
	const { state } = editor.view
	const { doc, schema } = state
	
	// Tìm tất cả text nodes trong title paragraphs (không trong blockquote)
	const titleRanges = []
	
	doc.descendants((node, pos) => {
		if (node.isText) {
			// Kiểm tra xem text node có trong blockquote không
			const resolvedPos = state.doc.resolve(pos)
			let inBlockquote = false
			
			// Kiểm tra parent nodes
			for (let i = resolvedPos.depth; i > 0; i--) {
				const nodeAtDepth = resolvedPos.node(i)
				if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
					inBlockquote = true
					break
				}
			}
			
			if (!inBlockquote) {
				// Text node là title
				titleRanges.push({ from: pos, to: pos + node.nodeSize })
			}
		}
	})
	
	if (titleRanges.length > 0) {
		// ⚠️ NEW: Set flag để skip handleEditorInput khi style update
		const nodeId = props.selectedNode?.id
		if (props.renderer && nodeId) {
			if (!props.renderer.isUpdatingStyle) {
				props.renderer.isUpdatingStyle = new Set()
			}
			props.renderer.isUpdatingStyle.add(nodeId)
		}
		
		// Áp dụng mark cho tất cả title text
		let tr = state.tr
		const mark = schema.marks[markType]
		
		if (mark) {
			// ⚠️ FIX: Kiểm tra xem có mark trong title paragraphs không (không dùng editor.isActive vì không có cursor)
			// Kiểm tra xem có ít nhất một text node trong title có mark này không
			let hasMark = false
			titleRanges.forEach(({ from, to }) => {
				const node = state.doc.nodeAt(from)
				if (node && node.isText) {
					const marks = node.marks || []
					if (marks.some(m => m.type.name === markType)) {
						hasMark = true
					}
				}
			})
			
			
			
			titleRanges.forEach(({ from, to }) => {
				if (hasMark) {
					// Bỏ mark - remove mark từ tất cả text nodes
					tr = tr.removeMark(from, to, mark.create(attrs))
				} else {
					// Thêm mark - add mark cho tất cả text nodes
					tr = tr.addMark(from, to, mark.create(attrs))
				}
			})
			
			// Dispatch transaction
			editor.view.dispatch(tr)
			
			
			// ⚠️ NEW: Clear flag sau khi dispatch
			if (props.renderer && nodeId) {
				setTimeout(() => {
					if (props.renderer.isUpdatingStyle) {
						props.renderer.isUpdatingStyle.delete(nodeId)
					}
				}, 100)
			}
			
			updateEditorState(editor)
		}
	}
}

// Toggle Bold
const toggleBold = () => {
	
	
	
	
	
	// ⚠️ FIX: Retry lấy editor instance nếu chưa có (quan trọng với node mới)
	let editorInstance = props.editorInstance
	if (!editorInstance && props.selectedNode && props.renderer) {
		
		// Thử lấy trực tiếp từ renderer
		editorInstance = props.renderer.getEditorInstance(props.selectedNode.id)
		if (editorInstance) {
			
		} else {
			// Nếu vẫn chưa có, đợi một chút rồi thử lại
			setTimeout(() => {
				const retryInstance = props.renderer?.getEditorInstance(props.selectedNode?.id)
				if (retryInstance) {
					
					// Gọi lại hàm với editor instance mới
					executeToggleBold(retryInstance)
				} else {
					
				}
			}, 100)
			return
		}
	}
	
	if (!editorInstance) {
		
		return
	}
	
	executeToggleBold(editorInstance)
}

// Helper function để thực hiện toggle bold
const executeToggleBold = (editorInstance) => {
	
	// ⚠️ NEW: Set flag để skip handleEditorInput khi style update
	const nodeId = props.selectedNode?.id
	
	if (props.renderer && nodeId) {
		if (!props.renderer.isUpdatingStyle) {
			props.renderer.isUpdatingStyle = new Set()
		}
		props.renderer.isUpdatingStyle.add(nodeId)
	}
	
	// ⚠️ FIX: Check cả isFocused để hoạt động với node mới
	const isEditorActive = props.isEditing || (editorInstance && editorInstance.isFocused)
	if (isEditorActive) {
		
		// Đang edit: áp dụng cho selection hiện tại
		// Sử dụng saved selection nếu có, nếu không thì lấy từ state
		const { state } = editorInstance.view
		let from, to
		if (savedSelection) {
			from = savedSelection.from
			to = savedSelection.to
			
		} else {
			from = state.selection.from
			to = state.selection.to
			
		}
		
		
		
		// Sử dụng requestAnimationFrame để đảm bảo editor focus và selection được giữ
		requestAnimationFrame(() => {
			// ⚠️ FIX: Check editor instance và view trước khi truy cập
			if (!editorInstance || editorInstance.isDestroyed || !editorInstance.view) {
				
				return
			}
			
			
			// Focus editor nếu chưa focus
			if (!editorInstance.isFocused) {
				
				try {
					editorInstance.chain().focus().run()
				} catch (error) {
					
					return
				}
			}
			
			// Restore selection nếu có
			if (from !== to) {
				
				editorInstance.chain().setTextSelection({ from, to }).focus().toggleBold().run()
			} else {
				
				// Không có selection: chọn toàn bộ paragraph và toggle bold
				const $from = state.doc.resolve(from)
				// Tìm paragraph chứa cursor
				let paragraphStart = from
				let paragraphEnd = from
				
				// Tìm đầu paragraph
				for (let depth = $from.depth; depth > 0; depth--) {
					const node = $from.node(depth)
					if (node.type.name === 'paragraph') {
						paragraphStart = $from.start(depth)
						paragraphEnd = $from.end(depth)
						break
					}
				}
				
				
				if (paragraphStart !== paragraphEnd) {
					editorInstance.chain().setTextSelection({ from: paragraphStart, to: paragraphEnd }).focus().toggleBold().run()
				} else {
					// Fallback: toggle bold tại vị trí cursor
					editorInstance.chain().focus().toggleBold().run()
				}
			}
			
			// Clear saved selection sau khi dùng
			savedSelection = null
		})
	} else {
		
		// Chỉ chọn: chỉ áp dụng cho title (KHÔNG focus editor)
		applyStyleToTitle(editorInstance, 'bold', {})
	}
	
	// ⚠️ NEW: Clear flag sau khi dispatch
	if (props.renderer && nodeId) {
		setTimeout(() => {
			if (props.renderer.isUpdatingStyle) {
				props.renderer.isUpdatingStyle.delete(nodeId)
			}
		}, 100)
	}
	
	// Update style mà không tính toán lại kích thước
	updateStyleWithoutResize()
	updateEditorState(editorInstance)
	emit('bold')
}

// Helper function để retry lấy editor instance
const getEditorInstanceWithRetry = (callback) => {
	let editorInstance = props.editorInstance
	if (!editorInstance && props.selectedNode && props.renderer) {
		
		// Thử lấy trực tiếp từ renderer
		editorInstance = props.renderer.getEditorInstance(props.selectedNode.id)
		if (editorInstance) {
			
			callback(editorInstance)
			return
		} else {
			// Nếu vẫn chưa có, đợi một chút rồi thử lại
			setTimeout(() => {
				const retryInstance = props.renderer?.getEditorInstance(props.selectedNode?.id)
				if (retryInstance) {
					
					callback(retryInstance)
				} else {
					
				}
			}, 100)
			return
		}
	}
	
	if (!editorInstance) {
		
		return
	}
	
	callback(editorInstance)
}

// Toggle Italic
const toggleItalic = () => {
	
	
	
	
	getEditorInstanceWithRetry((editorInstance) => {
		executeToggleItalic(editorInstance)
	})
}

// Helper function để thực hiện toggle italic
const executeToggleItalic = (editorInstance) => {
	
	// ⚠️ NEW: Set flag để skip handleEditorInput khi style update
	const nodeId = props.selectedNode?.id
	if (props.renderer && nodeId) {
		if (!props.renderer.isUpdatingStyle) {
			props.renderer.isUpdatingStyle = new Set()
		}
		props.renderer.isUpdatingStyle.add(nodeId)
	}
	
	// ⚠️ FIX: Check cả isFocused để hoạt động với node mới
	const isEditorActive = props.isEditing || (editorInstance && editorInstance.isFocused)
	if (isEditorActive) {
		
		// Đang edit: áp dụng cho selection hiện tại
		// Sử dụng saved selection nếu có
		const { state } = editorInstance.view
		let from, to
		if (savedSelection) {
			from = savedSelection.from
			to = savedSelection.to
			
		} else {
			from = state.selection.from
			to = state.selection.to
			
		}
		
		
		
		// Sử dụng requestAnimationFrame để đảm bảo editor focus và selection được giữ
		requestAnimationFrame(() => {
			// ⚠️ FIX: Check editor instance và view trước khi truy cập
			if (!editorInstance || editorInstance.isDestroyed || !editorInstance.view) {
				
				return
			}
			
			
			// Focus editor nếu chưa focus
			if (!editorInstance.isFocused) {
				
				try {
					editorInstance.chain().focus().run()
				} catch (error) {
					
					return
				}
			}
			
			// Restore selection nếu có
			if (from !== to) {
				
				editorInstance.chain().setTextSelection({ from, to }).focus().toggleItalic().run()
			} else {
				
				// Không có selection: chọn toàn bộ paragraph và toggle italic
				const $from = state.doc.resolve(from)
				let paragraphStart = from
				let paragraphEnd = from
				
				for (let depth = $from.depth; depth > 0; depth--) {
					const node = $from.node(depth)
					if (node.type.name === 'paragraph') {
						paragraphStart = $from.start(depth)
						paragraphEnd = $from.end(depth)
						break
					}
				}
				
				
				if (paragraphStart !== paragraphEnd) {
					editorInstance.chain().setTextSelection({ from: paragraphStart, to: paragraphEnd }).focus().toggleItalic().run()
				} else {
					editorInstance.chain().focus().toggleItalic().run()
				}
			}
			
			savedSelection = null
		})
	} else {
		
		// Chỉ chọn: chỉ áp dụng cho title (KHÔNG focus editor)
		applyStyleToTitle(editorInstance, 'italic', {})
	}
	
	// ⚠️ NEW: Clear flag sau khi dispatch
	if (props.renderer && nodeId) {
		setTimeout(() => {
			if (props.renderer.isUpdatingStyle) {
				props.renderer.isUpdatingStyle.delete(nodeId)
			}
		}, 100)
	}
	
	// Update style mà không tính toán lại kích thước
	updateStyleWithoutResize()
	updateEditorState(editorInstance)
	emit('italic')
}

// Toggle Underline
const toggleUnderline = () => {
	
	
	
	
	getEditorInstanceWithRetry((editorInstance) => {
		executeToggleUnderline(editorInstance)
	})
}

// Helper function để thực hiện toggle underline
const executeToggleUnderline = (editorInstance) => {
	
	// ⚠️ NEW: Set flag để skip handleEditorInput khi style update
	const nodeId = props.selectedNode?.id
	if (props.renderer && nodeId) {
		if (!props.renderer.isUpdatingStyle) {
			props.renderer.isUpdatingStyle = new Set()
		}
		props.renderer.isUpdatingStyle.add(nodeId)
	}
	
	// ⚠️ FIX: Check cả isFocused để hoạt động với node mới
	const isEditorActive = props.isEditing || (editorInstance && editorInstance.isFocused)
	if (isEditorActive) {
		
		// Đang edit: áp dụng cho selection hiện tại
		// Sử dụng saved selection nếu có
		const { state } = editorInstance.view
		let from, to
		if (savedSelection) {
			from = savedSelection.from
			to = savedSelection.to
			
		} else {
			from = state.selection.from
			to = state.selection.to
			
		}
		
		
		
		// Sử dụng requestAnimationFrame để đảm bảo editor focus và selection được giữ
		requestAnimationFrame(() => {
			// ⚠️ FIX: Check editor instance và view trước khi truy cập
			if (!editorInstance || editorInstance.isDestroyed || !editorInstance.view) {
				return
			}
			
			
			// Focus editor nếu chưa focus
			if (!editorInstance.isFocused) {
				
				try {
					editorInstance.chain().focus().run()
				} catch (error) {
					
					return
				}
			}
			
			// Restore selection nếu có
			if (from !== to) {
				
				editorInstance.chain().setTextSelection({ from, to }).focus().toggleUnderline().run()
			} else {
				
				// Không có selection: chọn toàn bộ paragraph và toggle underline
				const $from = state.doc.resolve(from)
				let paragraphStart = from
				let paragraphEnd = from
				
				for (let depth = $from.depth; depth > 0; depth--) {
					const node = $from.node(depth)
					if (node.type.name === 'paragraph') {
						paragraphStart = $from.start(depth)
						paragraphEnd = $from.end(depth)
						break
					}
				}
				
				
				if (paragraphStart !== paragraphEnd) {
					editorInstance.chain().setTextSelection({ from: paragraphStart, to: paragraphEnd }).focus().toggleUnderline().run()
				} else {
					editorInstance.chain().focus().toggleUnderline().run()
				}
			}
			
			savedSelection = null
		})
	} else {
		
		// Chỉ chọn: chỉ áp dụng cho title (KHÔNG focus editor)
		applyStyleToTitle(editorInstance, 'underline', {})
	}
	
	// ⚠️ NEW: Clear flag sau khi dispatch
	if (props.renderer && nodeId) {
		setTimeout(() => {
			if (props.renderer.isUpdatingStyle) {
				props.renderer.isUpdatingStyle.delete(nodeId)
			}
		}, 100)
	}
	
	// Update style mà không tính toán lại kích thước
	updateStyleWithoutResize()
	updateEditorState(editorInstance)
	emit('underline')
}

// Helper function để highlight toàn bộ title
const applyHighlightToAllTitle = (editorInstance, hexColor, colorName) => {
	const { state } = editorInstance.view
	const { doc, schema } = state
	
	// Tìm tất cả text nodes trong title paragraphs (không trong blockquote)
	const titleRanges = []
	
	doc.descendants((node, pos) => {
		if (node.isText) {
			const resolvedPos = state.doc.resolve(pos)
			let inBlockquote = false
			let isTaskLink = false
			
			// Kiểm tra các parent nodes
			for (let i = resolvedPos.depth; i > 0; i--) {
				const nodeAtDepth = resolvedPos.node(i)
				if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
					inBlockquote = true
					break
				}
				// Kiểm tra xem paragraph có data-type="node-task-link" không
				if (nodeAtDepth && nodeAtDepth.type.name === 'paragraph') {
					const attrs = nodeAtDepth.attrs || {}
					if (attrs['data-type'] === 'node-task-link') {
						isTaskLink = true
						break
					}
					
					// Kiểm tra từ DOM nếu attribute chưa có trong ProseMirror document
					if (!isTaskLink && editorInstance.view && editorInstance.view.nodeDOM) {
						try {
							const paragraphPos = resolvedPos.start(i + 1)
							const domNode = editorInstance.view.nodeDOM(paragraphPos)
							if (domNode && domNode.nodeType === 1) {
								const domDataType = domNode.getAttribute('data-type')
								if (domDataType === 'node-task-link') {
									isTaskLink = true
									break
								}
								
								// Kiểm tra từ DOM: xem có text "Liên kết công việc" và có link với task_id không
								const paragraphText = domNode.textContent || ''
								const hasTaskLinkText = paragraphText.includes('Liên kết công việc')
								const hasTaskLinkAnchor = domNode.querySelector('a[href*="task_id"]') || 
								                          domNode.querySelector('a[href*="/mtp/project/"]')
								
								if (hasTaskLinkText && hasTaskLinkAnchor) {
									isTaskLink = true
									break
								}
							}
						} catch (e) {
							// Ignore errors khi không thể truy cập DOM
						}
					}
					
					// Kiểm tra từ ProseMirror document: text content và marks (links)
					if (!isTaskLink) {
						const paragraphText = nodeAtDepth.textContent || ''
						const hasTaskLinkText = paragraphText.includes('Liên kết công việc')
						
						// Kiểm tra xem có mark link với href chứa task_id không
						let hasTaskLinkMark = false
						nodeAtDepth.descendants((child) => {
							if (child.isText && child.marks) {
								const linkMark = child.marks.find(m => m.type.name === 'link' && m.attrs && m.attrs.href)
								if (linkMark && linkMark.attrs.href && 
								    (linkMark.attrs.href.includes('task_id') || linkMark.attrs.href.includes('/mtp/project/'))) {
									hasTaskLinkMark = true
									return false // Stop iteration
								}
							}
						})
						
						if (hasTaskLinkText && hasTaskLinkMark) {
							isTaskLink = true
							break
						}
					}
				}
			}
			
			// Chỉ thêm vào titleRanges nếu không phải blockquote và không phải task link
			if (!inBlockquote && !isTaskLink) {
				titleRanges.push({ from: pos, to: pos + node.nodeSize })
			}
		}
	})
	
	if (titleRanges.length > 0) {
		// ⚠️ NEW: Set flag để skip handleEditorInput khi style update
		const nodeId = props.selectedNode?.id
		if (props.renderer && nodeId) {
			if (!props.renderer.isUpdatingStyle) {
				props.renderer.isUpdatingStyle = new Set()
			}
			props.renderer.isUpdatingStyle.add(nodeId)
		}
		
		let tr = state.tr
		const textStyleMark = schema.marks.textStyle
		
		// Kiểm tra xem có highlight hiện tại không (kiểm tra tất cả text nodes)
		let textNodeCount = 0
		let highlightedTextNodeCount = 0
		
		titleRanges.forEach(({ from, to }) => {
			const node = state.doc.nodeAt(from)
			if (node && node.isText && node.textContent.trim().length > 0) {
				textNodeCount++
				const marks = node.marks || []
				const hasHighlight = marks.some(m => 
					m.type.name === 'textStyle' && 
					m.attrs && 
					m.attrs.backgroundColor === hexColor
				)
				if (hasHighlight) {
					highlightedTextNodeCount++
				}
			}
		})
		
		const hasCurrentHighlight = textNodeCount > 0 && highlightedTextNodeCount === textNodeCount
		
		titleRanges.forEach(({ from, to }) => {
			if (hasCurrentHighlight) {
				// Bỏ highlight
				tr = tr.removeMark(from, to, textStyleMark.create({ backgroundColor: hexColor }))
				tr = tr.removeMark(from, to, textStyleMark.create({ backgroundColor: null }))
			} else {
				// Thêm highlight
				tr = tr.addMark(from, to, textStyleMark.create({ backgroundColor: hexColor }))
			}
		})
		
		editorInstance.view.dispatch(tr)
		currentHighlightColor.value = hasCurrentHighlight ? null : colorName
		
		// ⚠️ NEW: Clear flag sau khi dispatch
		if (props.renderer && nodeId) {
			setTimeout(() => {
				if (props.renderer.isUpdatingStyle) {
					props.renderer.isUpdatingStyle.delete(nodeId)
				}
			}, 100)
		}
		
		// Update style mà không tính toán lại kích thước
		updateStyleWithoutResize()
		updateEditorState(editorInstance)
	}
}

// Set highlight color
const setHighlightColor = (colorName) => {
	
	
	
	
	
	// Không cho phép highlight nếu đang ở trong blockquote
	if (isInBlockquote.value) {
		return
	}
	
	getEditorInstanceWithRetry((editorInstance) => {
		executeSetHighlightColor(editorInstance, colorName)
	})
}

// Helper function để thực hiện set highlight color
const executeSetHighlightColor = (editorInstance, colorName) => {
	
	const colorMap = {
		pink: '#fce7f3',
		yellow: '#fef3c7',
		purple: '#f3e8ff',
		blue: '#dbeafe',
		teal: '#ccfbf1',
		green: '#d1fae5',
		grey: '#d1d5db'
	}
	
	const hexColor = colorMap[colorName]
	if (hexColor) {
		// ⚠️ FIX: Check cả isFocused để hoạt động với node mới
		const isEditorActive = props.isEditing || (editorInstance && editorInstance.isFocused)
		if (isEditorActive) {
			
			// Đang edit: chỉ áp dụng cho title (không áp dụng cho blockquote)
			// Kiểm tra xem selection có trong blockquote không
			if (isInBlockquote.value) {
				
				return
			}
			
			// ⚠️ NEW: Set flag để skip handleEditorInput khi style update
			const nodeId = props.selectedNode?.id
			if (props.renderer && nodeId) {
				if (!props.renderer.isUpdatingStyle) {
					props.renderer.isUpdatingStyle = new Set()
				}
				props.renderer.isUpdatingStyle.add(nodeId)
			}
			
			// Áp dụng cho selection hiện tại (chỉ khi không ở trong blockquote)
			// Sử dụng saved selection nếu có
			const { state } = editorInstance.view
			let from, to
			if (savedSelection) {
				from = savedSelection.from
				to = savedSelection.to
				
			} else {
				from = state.selection.from
				to = state.selection.to
				
			}
			
			
			
			
			// Sử dụng requestAnimationFrame để đảm bảo editor focus và selection được giữ
			requestAnimationFrame(() => {
				// ⚠️ FIX: Check editor instance và view trước khi truy cập
				if (!editorInstance || editorInstance.isDestroyed || !editorInstance.view) {
					
					return
				}
				
				
				// Focus editor nếu chưa focus
				if (!editorInstance.isFocused) {
					
					try {
						editorInstance.chain().focus().run()
					} catch (error) {
						
						return
					}
				}
				
				// ⚠️ FIX: Nếu không có selection, highlight toàn bộ title
				if (from === to) {
					// Không có selection: highlight toàn bộ title
					applyHighlightToAllTitle(editorInstance, hexColor, colorName)
					savedSelection = null
					return
				}
				
				// Có selection: áp dụng cho selection đó
				let selectionFrom = from
				let selectionTo = to
				
				// Sử dụng transaction với addMark/removeMark để xử lý đúng selection xuyên qua nhiều paragraphs
				const { schema } = editorInstance.view.state
				const textStyleMark = schema.marks.textStyle
				
				// Kiểm tra xem có highlight hiện tại trong selection không
				const currentState = editorInstance.view.state
				let textNodeCount = 0
				let highlightedTextNodeCount = 0
				
				// Kiểm tra tất cả text nodes trong selection có highlight không
				currentState.doc.nodesBetween(selectionFrom, selectionTo, (node, pos) => {
					if (node.isText && node.textContent.trim().length > 0) {
						textNodeCount++
						const marks = node.marks || []
						const hasHighlight = marks.some(m => 
							m.type.name === 'textStyle' && 
							m.attrs && 
							m.attrs.backgroundColor === hexColor
						)
						if (hasHighlight) {
							highlightedTextNodeCount++
						}
					}
				})
				
				// Nếu tất cả text nodes đều có highlight thì bỏ highlight, nếu không thì thêm highlight
				const hasCurrentHighlight = textNodeCount > 0 && highlightedTextNodeCount === textNodeCount
				
				// Set selection trước
				editorInstance.chain().setTextSelection({ from: selectionFrom, to: selectionTo }).focus().run()
				
				// Lấy state mới sau khi set selection
				const stateForTr = editorInstance.view.state
				let tr = stateForTr.tr
				
				if (hasCurrentHighlight) {
					// Bỏ highlight - remove mark từ toàn bộ selection
					tr = tr.removeMark(selectionFrom, selectionTo, textStyleMark.create({ backgroundColor: hexColor }))
					tr = tr.removeMark(selectionFrom, selectionTo, textStyleMark.create({ backgroundColor: null }))
					currentHighlightColor.value = null
				} else {
					// Thêm highlight - add mark cho toàn bộ selection
					tr = tr.addMark(selectionFrom, selectionTo, textStyleMark.create({ backgroundColor: hexColor }))
					currentHighlightColor.value = colorName
				}
				
				// Dispatch transaction
				editorInstance.view.dispatch(tr)
				
				// Collapse selection để hiển thị màu ngay (không còn vùng bôi đen)
				editorInstance.chain().setTextSelection({ from: selectionTo, to: selectionTo }).run()
				
				savedSelection = null
			})
			
			// ⚠️ NEW: Clear flag sau khi dispatch
			if (props.renderer && nodeId) {
				setTimeout(() => {
					if (props.renderer.isUpdatingStyle) {
						props.renderer.isUpdatingStyle.delete(nodeId)
					}
				}, 100)
			}
			
			// Update style mà không tính toán lại kích thước
			updateStyleWithoutResize()
			updateEditorState(editorInstance)
		} else {
			// Chỉ chọn: chỉ áp dụng cho title (sử dụng helper function)
			applyHighlightToAllTitle(editorInstance, hexColor, colorName)
		}
		emit('highlight-color', colorName)
	}
}

// Handle Done
const handleDone = () => {
	if (props.editorInstance) {
		props.editorInstance.commands.blur()
	}
	emit('done', props.selectedNode)
}

// Handle List action (focus vào mô tả/blockquote)
const handleListAction = () => {
	if (!props.selectedNode) return
	
	// ⚠️ FIX: Retry lấy editor instance nếu chưa có
	getEditorInstanceWithRetry((editorInstance) => {
		executeListAction(editorInstance)
	})
}

// Helper function để thực hiện list action
const executeListAction = (editorInstance) => {
	// Focus vào editor trước
	editorInstance.commands.focus()
	
	// Đợi editor focus xong, sau đó focus vào blockquote
	setTimeout(() => {
		if (!editorInstance || !editorInstance.view) return
		
		const { state } = editorInstance.view
		const { doc } = state
		
		// Tìm blockquote đầu tiên
		let blockquoteOffset = null
		doc.forEach((node, offset) => {
			if (node.type.name === 'blockquote' && blockquoteOffset === null) {
				blockquoteOffset = offset
			}
		})
		
		if (blockquoteOffset !== null) {
			// Đã có blockquote: focus vào cuối blockquote
			try {
				// Tìm blockquote node
				const blockquoteNode = state.doc.nodeAt(blockquoteOffset)
				if (blockquoteNode) {
					// Tìm vị trí cuối cùng của text trong blockquote
					// Tính phạm vi của blockquote trong document
					const blockquoteStart = blockquoteOffset + 1
					const blockquoteEnd = blockquoteOffset + blockquoteNode.nodeSize - 1
					
					// Duyệt qua toàn bộ document để tìm text nodes trong blockquote
					let lastTextPos = null
					
					doc.descendants((node, pos) => {
						// Kiểm tra xem node có nằm trong blockquote không
						// pos là vị trí bắt đầu của node, pos + node.nodeSize là vị trí cuối
						if (pos >= blockquoteStart && pos < blockquoteEnd && node.isText) {
							// Tính vị trí sau text node (cuối text content)
							// Đối với text node, sử dụng text.length để đảm bảo chính xác
							const textEndPos = pos + node.text.length
							// Đảm bảo vị trí không vượt quá blockquote
							if (textEndPos <= blockquoteEnd + 1) {
								lastTextPos = textEndPos
							}
						}
					})
					
					if (lastTextPos !== null) {
						// Có text: focus vào cuối text
						// Sử dụng resolve để đảm bảo vị trí hợp lệ
						try {
							const resolvedPos = state.doc.resolve(lastTextPos)
							editorInstance.chain()
								.setTextSelection(resolvedPos.pos)
								.focus()
								.run()
						} catch (e) {
							// Fallback: sử dụng vị trí trực tiếp
							editorInstance.chain()
								.setTextSelection(lastTextPos)
								.focus()
								.run()
						}
					} else {
						// Không có text: tìm paragraph cuối cùng trong blockquote và focus vào trong đó
						let lastParagraphPos = null
						blockquoteNode.forEach((child, childOffset) => {
							if (child.type.name === 'paragraph') {
								// Vị trí bắt đầu của paragraph trong document
								const paragraphStart = blockquoteOffset + 1 + childOffset + 1
								lastParagraphPos = paragraphStart
							}
						})
						
						if (lastParagraphPos !== null) {
							// Focus vào đầu paragraph cuối cùng
							editorInstance.chain()
								.setTextSelection(lastParagraphPos)
								.focus()
								.run()
						} else {
							// Fallback: focus vào cuối blockquote
							const blockquoteEndPos = blockquoteOffset + blockquoteNode.nodeSize - 1
							try {
								const resolvedPos = state.doc.resolve(blockquoteEndPos - 1)
								editorInstance.chain()
									.setTextSelection(resolvedPos.pos)
									.focus()
									.run()
							} catch (e) {
								editorInstance.chain()
									.setTextSelection(blockquoteEndPos - 1)
									.focus()
									.run()
							}
						}
					}
				} else {
					// Fallback: focus vào cuối document
					editorInstance.commands.focus('end')
				}
			} catch (e) {
				
				// Fallback: focus vào cuối document
				editorInstance.commands.focus('end')
			}
		} else {
			// Chưa có blockquote: tạo blockquote mới
			// Tìm vị trí chèn: sau tất cả paragraphs và images
			let insertPosition = null
			
			// Tìm node cuối cùng không phải blockquote (paragraph hoặc image)
			doc.forEach((node, offset) => {
				if (node.type.name !== 'blockquote') {
					// Tính vị trí sau node này (offset + nodeSize)
					const nodeEnd = offset + node.nodeSize
					if (insertPosition === null || nodeEnd > insertPosition) {
						insertPosition = nodeEnd
					}
				}
			})
			
			// Nếu không tìm thấy, dùng cuối document
			if (insertPosition === null) {
				insertPosition = doc.content.size
			}
			
			// Chèn blockquote tại vị trí đã tính
			editorInstance.chain()
				.setTextSelection(insertPosition)
				.focus()
				.insertContent('<blockquote><p></p></blockquote>')
				.run()
			
			// Focus vào paragraph trong blockquote vừa tạo
			setTimeout(() => {
				if (editorInstance && editorInstance.view) {
					const { state } = editorInstance.view
					const { doc: newDoc } = state
					
					// Tìm blockquote vừa tạo
					let newBlockquoteOffset = null
					newDoc.forEach((node, offset) => {
						if (node.type.name === 'blockquote' && newBlockquoteOffset === null) {
							newBlockquoteOffset = offset
						}
					})
					
					if (newBlockquoteOffset !== null) {
						const paragraphStartPos = newBlockquoteOffset + 1 + 1
						editorInstance.chain()
							.setTextSelection(paragraphStartPos)
							.focus()
							.run()
					} else {
						editorInstance.commands.focus('end')
					}
				}
			}, 50)
		}
	}, 50)
	
	emit('list-action', props.selectedNode)
}

// Handle Insert Image
const handleInsertImage = (event) => {
	if (!props.selectedNode) {
		
		return
	}
	
	// ⚠️ FIX: Không cần check editor instance vì parent component sẽ xử lý
	// Chỉ cần emit event với selectedNode
	emit('insert-image', { node: props.selectedNode })
}

// Clear timeout cho more options menu
const clearMoreOptionsMenuTimeout = () => {
	if (moreOptionsMenuTimeout) {
		clearTimeout(moreOptionsMenuTimeout)
		moreOptionsMenuTimeout = null
	}
}

// Handle More Options Wrapper Enter
const handleMoreOptionsWrapperEnter = () => {
	if (!props.selectedNode) return
	clearMoreOptionsMenuTimeout()
	showMoreOptionsMenu.value = true
	emit('more-options', { node: props.selectedNode })
}

// Handle More Options Wrapper Leave
const handleMoreOptionsWrapperLeave = () => {
	clearMoreOptionsMenuTimeout()
	moreOptionsMenuTimeout = setTimeout(() => {
		showMoreOptionsMenu.value = false
	}, 200) // Delay 200ms giống toolbar-top
}

// Handle More Options Popup Enter
const handleMoreOptionsPopupEnter = () => {
	clearMoreOptionsMenuTimeout()
	showMoreOptionsMenu.value = true
}

// Handle More Options Popup Leave
const handleMoreOptionsPopupLeave = () => {
	clearMoreOptionsMenuTimeout()
	moreOptionsMenuTimeout = setTimeout(() => {
		showMoreOptionsMenu.value = false
	}, 200)
}

// Handle context action
const handleContextAction = (action) => {
	showMoreOptionsMenu.value = false
	emit('context-action', {
		type: action,
		node: props.selectedNode
	})
}

// Handle Comments
const handleComments = () => {
	// showComments.value = !showComments.value
	emit('comments', { node: props.selectedNode })
}

// Expose methods để có thể gọi từ parent component
defineExpose({
	toggleBold,
	toggleItalic,
	toggleUnderline,
	setHighlightColor
})

// Cleanup
onBeforeUnmount(() => {
	clearMouseLeaveTimeout()
	clearMoreOptionsMenuTimeout()
	if (props.editorInstance) {
		props.editorInstance.off('selectionUpdate')
		props.editorInstance.off('update')
	}
})
</script>

<style scoped>
.mindmap-toolbar {
	position: fixed;
	bottom: 20px;
	left: 50%;
	transform: translateX(-50%);
	background: #4b5563;
	border-radius: 12px;
	display: flex;
	flex-direction: column;
	z-index: 10;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	padding: 8px;
}

.toolbar-bottom {
	display: flex;
	align-items: center;
	gap: 6px;
}

.toolbar-item-wrapper {
	position: relative;
}

.toolbar-top-popup {
	position: absolute;
	bottom: calc(100% + 12px);
	left: -8px;
	background: #4b5563;
	border-radius: 8px;
	padding: 8px;
	display: flex;
	align-items: center;
	gap: 6px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	white-space: nowrap;
	z-index: 1001;
}

.toolbar-context-menu-popup {
	flex-direction: column;
	align-items: stretch;
	gap: 0;
	padding: 6px;
	min-width: 200px;
	max-height: 450px;
	overflow-y: auto;
}

.context-menu-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	border-radius: 6px;
	cursor: pointer;
	color: white;
	font-size: 14px;
	transition: background 0.15s;
}

.context-menu-item:hover {
	background: rgba(255, 255, 255, 0.1);
}

.context-menu-item-danger {
	color: #ef4444;
}

.context-menu-item-danger:hover {
	background: rgba(239, 68, 68, 0.1);
}

.context-menu-item .menu-icon {
	flex-shrink: 0;
}

.toolbar-context-menu-popup .toolbar-separator {
	width: 100%;
	height: 1px;
	background: rgba(255, 255, 255, 0.2);
	margin: 4px 0;
}

/* Tạo vùng bridge vô hình giữa button và popup để dễ di chuyển chuột */
.toolbar-item-wrapper::after {
	content: '';
	position: absolute;
	bottom: 100%;
	left: 0;
	right: 0;
	height: 12px;
	background: transparent;
	pointer-events: auto;
	z-index: 1000;
}

.toolbar-btn {
	width: 32px;
	height: 32px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: none;
	border-radius: 6px;
	color: #ffffff;
	cursor: pointer;
	transition: all 0.2s ease;
	flex-shrink: 0;
}

.toolbar-btn:hover {
	background: rgba(255, 255, 255, 0.15);
}

.toolbar-btn.active {
	background: rgba(255, 255, 255, 0.25);
}

.toolbar-btn-done.active {
	background: #3b82f6;
	color: #ffffff;
}

.toolbar-btn svg {
	width: 16px;
	height: 16px;
	flex-shrink: 0;
}

.toolbar-text {
	font-size: 14px;
	font-weight: 600;
	color: #ffffff;
	line-height: 1;
	user-select: none;
}

.toolbar-text.italic {
	font-style: italic;
}

.toolbar-text.underline {
	text-decoration: underline;
}

.color-btn {
	width: 28px;
	height: 28px;
	border-radius: 4px;
	padding: 0;
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
}

.color-btn .color-label {
	font-size: 14px;
	font-weight: 600;
	line-height: 1;
	user-select: none;
}

.color-btn.active {
	border: 1.8px solid #3b82f6;
	box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
}

.toolbar-separator {
	width: 1px;
	height: 24px;
	background: rgba(255, 255, 255, 0.25);
	margin: 0 2px;
	flex-shrink: 0;
}
</style>

