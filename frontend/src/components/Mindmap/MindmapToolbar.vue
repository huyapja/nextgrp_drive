<template>
	<div v-if="shouldShowToolbar" class="mindmap-toolbar">
		<!-- Thanh công cụ dưới: Các tùy chọn khác (luôn hiển thị) -->
		<div class="toolbar-bottom">
			<!-- Hand icon (icon đầu tiên) - khi hover sẽ hiển thị toolbar-top -->
			<div class="toolbar-item-wrapper" @mouseenter="handleWrapperMouseEnter" @mouseleave="handleMouseLeave">
				<button
					class="toolbar-btn"
					title="Formatting Options"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M6 4v2M6 8v2M6 12v1" />
						<path d="M10 4v2M10 8v2M10 12v1" />
						<path d="M8 2v3M8 7v3M8 12v2" />
						<path d="M4 6h2M4 10h2M12 6h2M12 10h2" />
					</svg>
				</button>
				
				<!-- Toolbar-top hiển thị khi hover -->
				<div v-if="showTopToolbar" class="toolbar-top-popup" @mouseenter="handlePopupMouseEnter" @mouseleave="handlePopupMouseLeave">
					<!-- Bold -->
					<button
						class="toolbar-btn"
						:class="{ active: isBold }"
						@click="toggleBold"
						title="Bold (Ctrl+B)"
					>
						<span class="toolbar-text">B</span>
					</button>

					<!-- Italic -->
					<button
						class="toolbar-btn"
						:class="{ active: isItalic }"
						@click="toggleItalic"
						title="Italic (Ctrl+I)"
					>
						<span class="toolbar-text italic">I</span>
					</button>

					<!-- Underline -->
					<button
						class="toolbar-btn"
						:class="{ active: isUnderline }"
						@click="toggleUnderline"
						title="Underline (Ctrl+U)"
					>
						<span class="toolbar-text underline">U</span>
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
							@click="setHighlightColor(color.value)"
							:title="color.label"
						>
							<span class="color-label" :style="{ color: color.text }">A</span>
						</button>
					</template>
				</div>
			</div>

			<!-- Checkmark (Done) -->
			<button
				class="toolbar-btn"
				@click="handleDone"
				title="Done"
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="8" cy="8" r="7" />
					<path d="M5 8l2 2 4-4" stroke="white" stroke-width="2" fill="none" />
				</svg>
			</button>

			<!-- List with pen -->
			<button
				class="toolbar-btn"
				@click="handleListAction"
				title="List"
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M3 4h10M3 8h10M3 12h6" />
					<path d="M12 12l2 2 2-2" stroke-linecap="round" />
				</svg>
			</button>

			<!-- Insert image -->
			<button
				class="toolbar-btn"
				@click="handleInsertImage"
				title="Insert Image"
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="2" y="2" width="12" height="10" rx="1" />
					<path d="M2 8l4-3 3 3 3-2 2 2v3H2z" />
					<circle cx="5" cy="5" r="1" fill="currentColor" />
				</svg>
			</button>

			<!-- More options (ellipsis) -->
			<button
				class="toolbar-btn"
				@click="handleMoreOptions"
				title="More Options"
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
					<circle cx="8" cy="4" r="1.5" />
					<circle cx="8" cy="8" r="1.5" />
					<circle cx="8" cy="12" r="1.5" />
				</svg>
			</button>

			<!-- Separator -->
			<div class="toolbar-separator"></div>

			<!-- Comments -->
			<button
				class="toolbar-btn"
				:class="{ active: showComments }"
				@click="handleComments"
				title="Comments"
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

// Highlight colors với background pastel
const highlightColors = [
	{ value: 'pink', label: 'Pink', bg: '#fce7f3', text: '#ec4899' },
	{ value: 'yellow', label: 'Yellow', bg: '#fef3c7', text: '#f59e0b' },
	{ value: 'purple', label: 'Purple', bg: '#f3e8ff', text: '#a855f7' },
	{ value: 'blue', label: 'Blue', bg: '#dbeafe', text: '#3b82f6' },
	{ value: 'teal', label: 'Teal', bg: '#ccfbf1', text: '#14b8a6' },
	{ value: 'green', label: 'Green', bg: '#d1fae5', text: '#10b981' },
	{ value: 'grey', label: 'Grey', bg: '#f3f4f6', text: '#6b7280' }
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

// Cập nhật trạng thái từ editor
const updateEditorState = (editor) => {
	if (!editor) return
	
	isBold.value = editor.isActive('bold')
	isItalic.value = editor.isActive('italic')
	isUnderline.value = editor.isActive('underline')
	
	// Kiểm tra xem cursor có đang ở trong blockquote không
	isInBlockquote.value = checkIfInBlockquote(editor)
	
	// Chỉ lấy highlight color nếu cursor không ở trong blockquote
	if (!isInBlockquote.value) {
		// Lấy highlight color hiện tại nếu có (sử dụng backgroundColor từ textStyle)
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
				'#f3f4f6': 'grey',
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
		// Áp dụng mark cho tất cả title text
		let tr = state.tr
		const mark = schema.marks[markType]
		
		if (mark) {
			// Kiểm tra xem mark đã active chưa
			const isActive = editor.isActive(markType)
			
			titleRanges.forEach(({ from, to }) => {
				if (isActive) {
					// Bỏ mark
					tr = tr.removeMark(from, to, mark.create(attrs))
				} else {
					// Thêm mark
					tr = tr.addMark(from, to, mark.create(attrs))
				}
			})
			
			// Dispatch transaction
			editor.view.dispatch(tr)
			updateEditorState(editor)
		}
	}
}

// Toggle Bold
const toggleBold = () => {
	if (!props.editorInstance) return
	
	if (props.isEditing) {
		// Đang edit: áp dụng cho selection hiện tại
		props.editorInstance.chain().focus().toggleBold().run()
		updateEditorState(props.editorInstance)
	} else {
		// Chỉ chọn: chỉ áp dụng cho title
		applyStyleToTitle(props.editorInstance, 'bold', {})
	}
	emit('bold')
}

// Toggle Italic
const toggleItalic = () => {
	if (!props.editorInstance) return
	
	if (props.isEditing) {
		// Đang edit: áp dụng cho selection hiện tại
		props.editorInstance.chain().focus().toggleItalic().run()
		updateEditorState(props.editorInstance)
	} else {
		// Chỉ chọn: chỉ áp dụng cho title
		const isActive = props.editorInstance.isActive('italic')
		if (isActive) {
			// Bỏ italic
			applyStyleToTitle(props.editorInstance, 'italic', {})
		} else {
			// Thêm italic
			applyStyleToTitle(props.editorInstance, 'italic', {})
		}
	}
	emit('italic')
}

// Toggle Underline
const toggleUnderline = () => {
	if (!props.editorInstance) return
	
	if (props.isEditing) {
		// Đang edit: áp dụng cho selection hiện tại
		props.editorInstance.chain().focus().toggleUnderline().run()
		updateEditorState(props.editorInstance)
	} else {
		// Chỉ chọn: chỉ áp dụng cho title
		applyStyleToTitle(props.editorInstance, 'underline', {})
	}
	emit('underline')
}

// Set highlight color
const setHighlightColor = (colorName) => {
	if (!props.editorInstance) return
	
	// Không cho phép highlight nếu đang ở trong blockquote
	if (isInBlockquote.value) {
		return
	}
	
	const colorMap = {
		pink: '#fce7f3',
		yellow: '#fef3c7',
		purple: '#f3e8ff',
		blue: '#dbeafe',
		teal: '#ccfbf1',
		green: '#d1fae5',
		grey: '#f3f4f6'
	}
	
	const hexColor = colorMap[colorName]
	if (hexColor) {
		if (props.isEditing) {
			// Đang edit: chỉ áp dụng cho title (không áp dụng cho blockquote)
			// Kiểm tra xem selection có trong blockquote không
			if (isInBlockquote.value) {
				return
			}
			
			// Áp dụng cho selection hiện tại (chỉ khi không ở trong blockquote)
			const currentAttrs = props.editorInstance.getAttributes('textStyle')
			if (currentAttrs && currentAttrs.backgroundColor === hexColor) {
				// Bỏ highlight
				props.editorInstance.chain().focus().setMark('textStyle', { backgroundColor: null }).removeEmptyTextStyle().run()
				currentHighlightColor.value = null
			} else {
				// Set highlight
				props.editorInstance.chain().focus().setMark('textStyle', { backgroundColor: hexColor }).run()
				currentHighlightColor.value = colorName
			}
			updateEditorState(props.editorInstance)
		} else {
			// Chỉ chọn: chỉ áp dụng cho title
			// Sử dụng applyStyleToTitle với textStyle mark và backgroundColor attribute
			const { state } = props.editorInstance.view
			const { doc, schema } = state
			
			// Tìm tất cả text nodes trong title paragraphs (không trong blockquote)
			const titleRanges = []
			
			doc.descendants((node, pos) => {
				if (node.isText) {
					const resolvedPos = state.doc.resolve(pos)
					let inBlockquote = false
					
					for (let i = resolvedPos.depth; i > 0; i--) {
						const nodeAtDepth = resolvedPos.node(i)
						if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
							inBlockquote = true
							break
						}
					}
					
					if (!inBlockquote) {
						titleRanges.push({ from: pos, to: pos + node.nodeSize })
					}
				}
			})
			
			if (titleRanges.length > 0) {
				let tr = state.tr
				const textStyleMark = schema.marks.textStyle
				
				// Kiểm tra xem có highlight hiện tại không
				const currentAttrs = props.editorInstance.getAttributes('textStyle')
				const hasCurrentHighlight = currentAttrs && currentAttrs.backgroundColor === hexColor
				
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
				
				props.editorInstance.view.dispatch(tr)
				currentHighlightColor.value = hasCurrentHighlight ? null : colorName
				updateEditorState(props.editorInstance)
			}
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

// Handle List action
const handleListAction = () => {
	emit('list-action', props.selectedNode)
}

// Handle Insert Image
const handleInsertImage = () => {
	emit('insert-image', props.selectedNode)
}

// Handle More Options
const handleMoreOptions = () => {
	emit('more-options', props.selectedNode)
}

// Handle Comments
const handleComments = () => {
	showComments.value = !showComments.value
	emit('comments', { node: props.selectedNode, show: showComments.value })
}

// Cleanup
onBeforeUnmount(() => {
	clearMouseLeaveTimeout()
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
	z-index: 1000;
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
	border: 2px solid #ffffff;
	box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2), inset 0 0 0 1px rgba(255, 255, 255, 0.3);
}

.toolbar-separator {
	width: 1px;
	height: 24px;
	background: rgba(255, 255, 255, 0.25);
	margin: 0 2px;
	flex-shrink: 0;
}
</style>

