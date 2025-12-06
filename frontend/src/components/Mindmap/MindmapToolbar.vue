<template>
	<div v-if="visible" ref="toolbarRef" class="mindmap-toolbar-container" @mousedown.prevent>
		<!-- Top Toolbar: Format Text + Highlight Colors (hiển thị khi hover Style button) -->
		<Transition :name="toolbarTopMounted ? '' : 'toolbar-slide'">
			<div 
				v-if="showStyleTooltip" 
				class="mindmap-contextual-toolbar toolbar-top" 
				:style="toolbarTopStyle"
				@mouseenter="showStyleTooltip = true"
				@mouseleave="showStyleTooltip = false"
			>
				<!-- Format Text Buttons -->
				<div class="toolbar-group">
				<button
					@mousedown.prevent
					@click.stop.prevent="toggleBold"
					:class="['toolbar-btn', { active: isBold }]"
					title="In đậm"
				>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>
						</svg>
					</button>
				<button
					@mousedown.prevent
					@click.stop.prevent="toggleItalic"
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
					@mousedown.prevent
					@click.stop.prevent="toggleUnderline"
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
						@mousedown.prevent
						@click.stop.prevent="setHighlight(color.value)"
						:class="['toolbar-btn highlight-color-btn', { active: currentColor === color.value && isHighlightActive }]"
						:style="{ backgroundColor: color.value }"
						:title="color.label"
					>
							<span class="highlight-color-text">A</span>
						</button>
					</div>
				</template>
			</div>
		</Transition>

		<!-- Bottom Toolbar: Additional Features -->
		<Transition name="toolbar-slide">
			<div class="mindmap-contextual-toolbar toolbar-bottom" :style="toolbarBottomStyle">
				<!-- Style Button -->
				<div 
					ref="styleButtonRef"
					class="toolbar-group style-button-wrapper"
					@mouseenter="showStyleTooltip = true"
					@mouseleave="handleStyleMouseLeave"
				>
					<button
						@click.stop="handleStyleClick"
						class="toolbar-btn"
						title="Kiểu chữ"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M8.437 4.898 5.447 13h6.063L8.437 4.898Zm6.025 15.881L12.269 15h-7.56l-2.131 5.78a1 1 0 1 1-1.873-.703L7.02 2.982c.491-1.31 2.344-1.31 2.835 0l6.48 17.095a1 1 0 1 1-1.872.702ZM15.056 5a1 1 0 1 0 0 2H23a1 1 0 1 0 0-2h-7.944Zm1.055 7a1 1 0 0 1 1-1H23a1 1 0 1 1 0 2h-5.89a1 1 0 0 1-1-1Zm3.056 5a1 1 0 1 0 0 2H23a1 1 0 1 0 0-2h-3.833Z" fill="currentColor"></path>
						</svg>
					</button>
				</div>

				<!-- Checklist Button -->
				<div class="toolbar-group">
					<button
						@click.stop="toggleChecklist"
						:class="['toolbar-btn', { active: hasChecklist }]"
						title="Đánh dấu hoàn thành"
					>
						<i class="pi pi-check-circle" style="font-size: 16px;"></i>
					</button>
				</div>

				<!-- Notes Button -->
				<div class="toolbar-group">
					<button
						@mousedown.prevent
						@click.stop.prevent="handleNoteClick"
						class="toolbar-btn"
						title="Ghi chú"
					>
						<i class="pi pi-file-edit" style="font-size: 16px;"></i>
					</button>
				</div>


				<!-- More Options Button -->
				<div 
					ref="moreOptionsButtonRef"
					class="toolbar-group"
					@mouseenter="showMoreOptionsMenu"
					@mouseleave="handleMoreOptionsMouseLeave"
				>
					<button
						class="toolbar-btn"
						title="Thêm tùy chọn"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="1"/>
							<circle cx="12" cy="5" r="1"/>
							<circle cx="12" cy="19" r="1"/>
						</svg>
					</button>
				</div>

				<!-- Separator -->
				<div class="toolbar-separator"></div>

				<!-- Comment Button -->
				<div class="toolbar-group">
					<button
						@click.stop="handleCommentClick"
						class="toolbar-btn"
						title="Nhận xét"
					>
						<i class="pi pi-comment" style="font-size: 16px;"></i>
					</button>
				</div>
			</div>
		</Transition>
	</div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
	visible: {
		type: Boolean,
		default: false
	},
	nodeId: {
		type: String,
		default: null
	},
	editor: {
		type: Object,
		default: null
	},
	renderer: {
		type: Object,
		default: null
	}
})

const emit = defineEmits(['comment-click', 'note-click', 'show-context-menu', 'hide-context-menu'])

const toolbarTopMounted = ref(false)

const toolbarRef = ref(null)
const showColorPicker = ref(false)
const showStyleTooltip = ref(false)
const currentColor = ref(null) // Màu highlight hiện tại

watch(showStyleTooltip, (newVal) => {
	if (newVal) {
		// Đợi một chút để transition chạy xong
		setTimeout(() => {
			toolbarTopMounted.value = true
		}, 300) // 300ms = thời gian transition
	} else {
		toolbarTopMounted.value = false
	}
})

// Danh sách màu highlight (7 màu như trong ảnh: pink, yellow, pink, blue, teal, green, grey)
const highlightColors = [
	{ label: 'Hồng', value: '#fbcfe8' },
	{ label: 'Vàng', value: '#fef08a' },
	{ label: 'Hồng nhạt', value: '#fce7f3' },
	{ label: 'Xanh dương', value: '#bfdbfe' },
	{ label: 'Xanh ngọc', value: '#99f6e4' },
	{ label: 'Xanh lá', value: '#bbf7d0' },
	{ label: 'Xám', value: '#e5e7eb' }
]

// Trạng thái format
const isBold = computed(() => {
	const editor = getEditor()
	if (!editor) return false
	return editor.isActive('bold')
})

const isItalic = computed(() => {
	const editor = getEditor()
	if (!editor) return false
	return editor.isActive('italic')
})

const isUnderline = computed(() => {
	const editor = getEditor()
	if (!editor) return false
	return editor.isActive('underline')
})

const isHighlightActive = computed(() => {
	const editor = getEditor()
	if (!editor) return false
	
	// Kiểm tra xem có backgroundColor mark không
	const { state } = editor
	const { selection } = state
	const marks = selection.$from.marks()
	const textStyleMark = marks.find(mark => mark.type.name === 'textStyle')
	if (textStyleMark && textStyleMark.attrs.backgroundColor) {
		return true
	}
	
	return false
})

// Kiểm tra xem đang focus vào blockquote (description) không - dùng ref để update nhanh hơn
const isInBlockquote = ref(false)

// Debounce timeout để tránh gọi quá nhiều lần
let checkIsInBlockquoteTimeout = null

// Function để check và update isInBlockquote
// Chỉ update nếu giá trị thực sự thay đổi để tránh re-render không cần thiết
const checkIsInBlockquote = (immediate = false) => {
	// Clear timeout trước đó nếu có
	if (checkIsInBlockquoteTimeout) {
		clearTimeout(checkIsInBlockquoteTimeout)
	}
	
	// Nếu immediate = true, check ngay lập tức (cho các trường hợp quan trọng)
	// Nếu không, debounce để tránh gọi quá nhiều lần
	const doCheck = () => {
		const editor = getEditor()
		if (!editor) {
			// Chỉ update nếu giá trị thay đổi
			if (isInBlockquote.value !== false) {
				isInBlockquote.value = false
			}
			return
		}
		
		try {
			const { state } = editor
			const { selection } = state
			const $from = selection.$from
			
			// Kiểm tra tất cả các node trong chain từ selection
			let depth = $from.depth
			let inBlockquote = false
			while (depth >= 0) {
				const node = $from.node(depth)
				if (node && node.type.name === 'blockquote') {
					inBlockquote = true
					break
				}
				depth--
			}
			
			// CHỈ update nếu giá trị thực sự thay đổi để tránh re-render không cần thiết
			if (isInBlockquote.value !== inBlockquote) {
				isInBlockquote.value = inBlockquote
			}
		} catch (error) {
			console.error('[Toolbar] Error checking blockquote:', error)
			// Chỉ update nếu giá trị thay đổi
			if (isInBlockquote.value !== false) {
				isInBlockquote.value = false
			}
		}
	}
	
	if (immediate) {
		doCheck()
	} else {
		// Debounce 50ms để tránh gọi quá nhiều lần
		checkIsInBlockquoteTimeout = setTimeout(doCheck, 50)
	}
}

const styleButtonRef = ref(null)
const moreOptionsButtonRef = ref(null)

// Vị trí toolbar top (hiển thị phía trên toolbar-bottom khi hover Style button)
const toolbarTopStyle = computed(() => {
	// Toolbar-top sẽ hiển thị ở phía trên toolbar-bottom, căn giữa màn hình
	// Toolbar-bottom ở bottom: 20px, toolbar có height khoảng 48px, nên đặt top toolbar ở bottom: 72px (20 + 48 + 4px gap)
	return {
		left: '50%',
		bottom: '72px', // Phía trên toolbar-bottom với khoảng cách 4px
		transform: 'translateX(-50%)'
	}
})

// Vị trí toolbar bottom (dưới toolbar top và hơi lệch phải)
const toolbarBottomStyle = computed(() => {
	return {
		left: 'calc(50% + 40px)',
		bottom: '20px',
		transform: 'translateX(-50%)'
	}
})

// Hàm helper để đảm bảo editor được focus trước khi thực hiện command
const ensureEditorReady = () => {
	if (!props.editor) {
		console.warn('[Toolbar] Editor not available')
		return false
	}
	
	// Đảm bảo editor view đã sẵn sàng
	if (!props.editor.view || !props.editor.view.dom) {
		console.warn('[Toolbar] Editor view not ready')
		return false
	}
	
	// Đảm bảo editor có thể chỉnh sửa
	if (!props.editor.isEditable) {
		console.warn('[Toolbar] Editor is not editable')
		return false
	}
	
	// Focus vào editor - luôn focus để đảm bảo command hoạt động
	try {
		props.editor.commands.focus()
		// Đợi một chút để focus được áp dụng
		setTimeout(() => {
			if (!props.editor.isFocused) {
				props.editor.view.focus()
			}
		}, 10)
	} catch (error) {
		console.error('[Toolbar] Error focusing editor:', error)
		return false
	}
	
	return true
}

// Hàm helper để select chỉ phần đang focus (title hoặc blockquote)
const selectCurrentSection = (editor) => {
	const { state } = editor
	const { doc, selection } = state
	const $from = selection.$from
	
	// Kiểm tra xem đang ở trong blockquote không
	let isInBlockquote = false
	let depth = $from.depth
	while (depth >= 0) {
		const node = $from.node(depth)
		if (node && node.type.name === 'blockquote') {
			isInBlockquote = true
			break
		}
		depth--
	}
	
	if (isInBlockquote) {
		// Đang ở trong blockquote: chỉ select blockquote này
		// Tìm vị trí bắt đầu và kết thúc của blockquote
		let blockquoteStart = null
		let blockquoteEnd = null
		
		doc.descendants((node, pos) => {
			if (node.type.name === 'blockquote') {
				// Tìm blockquote chứa selection hiện tại
				const resolvedPos = doc.resolve(pos)
				if (pos <= $from.pos && pos + node.nodeSize >= $from.pos) {
					blockquoteStart = pos + 1 // +1 để skip blockquote node
					blockquoteEnd = pos + node.nodeSize - 1 // -1 để skip closing
				}
			}
		})
		
		if (blockquoteStart !== null && blockquoteEnd !== null) {
			editor.commands.setTextSelection({ from: blockquoteStart, to: blockquoteEnd })
		}
	} else {
		// Đang ở title (paragraph): chỉ select các paragraph, không select blockquote
		let titleStart = 0
		let titleEnd = doc.content.size
		
		// Tìm vị trí blockquote đầu tiên
		doc.descendants((node, pos) => {
			if (node.type.name === 'blockquote' && titleEnd === doc.content.size) {
				titleEnd = pos
				return false // Stop traversal
			}
		})
		
		if (titleEnd > 0) {
			editor.commands.setTextSelection({ from: titleStart, to: titleEnd })
		} else {
			// Không có blockquote, select toàn bộ
			editor.commands.setTextSelection({ from: titleStart, to: titleEnd })
		}
	}
}

// Hàm helper để focus editor và đảm bảo có selection
const focusEditor = (editor, selectAll = false) => {
	if (!editor || !editor.view) {
		return Promise.resolve(false)
	}
	
	try {
		// Focus vào editor view DOM
		const dom = editor.view.dom
		if (!dom) {
			return Promise.resolve(false)
		}
		
		// Focus DOM element trước
		dom.focus()
		
		// Đợi một chút để DOM focus được áp dụng
		return new Promise((resolve) => {
			setTimeout(() => {
				try {
					const { state } = editor
					const { doc, selection } = state
					const textSize = doc.content.size
					
					// Nếu cần select all (cho bold, italic, underline)
					if (selectAll && textSize > 0) {
						// Chỉ select phần đang focus (title hoặc blockquote), không select toàn bộ
						selectCurrentSection(editor)
					} else if (textSize === 0 || selection.empty) {
						// Nếu document rỗng hoặc không có selection, chỉ focus vào đầu
						editor.commands.focus('start')
					} else {
						// Giữ nguyên selection hiện tại
						editor.commands.focus()
					}
					
					// Đợi thêm một chút để selection được áp dụng
					setTimeout(() => {
						resolve(true)
					}, 10)
				} catch (error) {
					console.error('[Toolbar] Error setting selection:', error)
					resolve(false)
				}
			}, 20)
		})
	} catch (error) {
		console.error('[Toolbar] Error focusing editor:', error)
		return Promise.resolve(false)
	}
}

// Hàm lấy editor instance (từ props hoặc từ renderer)
const getEditor = () => {
	// Thử lấy từ props trước
	if (props.editor) {
		return props.editor
	}
	
	// Nếu không có, thử lấy từ renderer
	if (props.renderer && props.nodeId) {
		const editor = props.renderer.getEditorInstance(props.nodeId)
		if (editor) {
			return editor
		}
	}
	
	return null
}

// Helper function để check editor có editable không
const isEditorEditable = (editor) => {
	if (!editor) return false
	// TipTap editor có thể check qua view.editable hoặc isEditable
	return editor.view?.editable !== false && editor.isEditable !== false
}

// Helper function để select toàn bộ title (không select blockquote)
const selectAllTitle = (editor) => {
	const { state } = editor
	const { doc } = state
	const textSize = doc.content.size
	
	if (textSize === 0) return
	
	// Tìm vị trí bắt đầu blockquote đầu tiên (tức là cuối title)
	let titleEnd = textSize
	doc.descendants((node, pos) => {
		if (node.type.name === 'blockquote' && titleEnd === textSize) {
			titleEnd = pos
			return false // Stop at first blockquote
		}
	})
	
	// Select từ đầu đến cuối title
	editor.commands.setTextSelection({ from: 0, to: titleEnd })
}

// Sửa lại các hàm toggle format để tránh toolbar nháy
// TH1 (Read-only): Format toàn bộ title, không quan tâm cursor ở đâu
// TH2 (Editable): Format theo vị trí cursor (title có đầy đủ, blockquote chỉ có B/I/U)
const toggleBold = async () => {
	const editor = getEditor()
	if (!editor) {
		console.warn('[Toolbar] Cannot toggle bold - editor not available')
		return
	}
	
	const isEditable = isEditorEditable(editor)
	console.log('[Toolbar] Toggling bold, isEditable:', isEditable)
	
	// TH1: Read-only - Format toàn bộ title
	if (!isEditable) {
		try {
			// Lưu vị trí cuối title trước khi select (để đặt lại cursor nhanh hơn)
			const { state: stateBefore } = editor
			const { doc: docBefore } = stateBefore
			let titleEndBefore = docBefore.content.size
			docBefore.descendants((node, pos) => {
				if (node.type.name === 'blockquote' && titleEndBefore === docBefore.content.size) {
					titleEndBefore = pos
					return false
				}
			})
			
			// Select toàn bộ title
			selectAllTitle(editor)
			await new Promise(resolve => setTimeout(resolve, 30))
			
			// Format
			const result = editor.chain().focus().toggleBold().run()
			console.log('[Toolbar] Bold command executed (read-only), result:', result)
			
			// Đặt cursor lại NGAY SAU KHI FORMAT để tránh buttons nháy
			// Không đợi setTimeout, đặt cursor ngay trong cùng một synchronous block
			if (result) {
				// Đặt cursor ở cuối title ngay lập tức
				const safePos = Math.max(1, Math.min(titleEndBefore - 1, docBefore.content.size - 1))
				editor.commands.setTextSelection({ from: safePos, to: safePos })
				
				// Sau đó check lại isInBlockquote (với delay nhỏ để đảm bảo cursor đã được đặt)
				setTimeout(() => {
					checkIsInBlockquote(true) // immediate để cập nhật ngay
				}, 10)
			}
		} catch (error) {
			console.error('[Toolbar] Error toggling bold (read-only):', error)
		}
		return
	}
	
	// TH2: Editable - Format theo vị trí cursor
	const { state: stateBefore } = editor
	const { selection: selectionBefore } = stateBefore
	const $fromBefore = selectionBefore.$from
	
	// Kiểm tra xem đang ở blockquote hay title
	let wasInBlockquote = false
	let depth = $fromBefore.depth
	while (depth >= 0) {
		const node = $fromBefore.node(depth)
		if (node && node.type.name === 'blockquote') {
			wasInBlockquote = true
			break
		}
		depth--
	}
	
	// Lưu selection hiện tại để restore sau khi format
	const originalSelection = {
		from: selectionBefore.from,
		to: selectionBefore.to,
		empty: selectionBefore.empty
	}
	
	console.log('[Toolbar] Toggling bold (editable), wasInBlockquote:', wasInBlockquote, 'selection:', originalSelection)
	
	try {
		// Nếu không có selection, select current section trước
		if (originalSelection.empty) {
			selectCurrentSection(editor)
			await new Promise(resolve => setTimeout(resolve, 50))
		}
		
		const result = editor.chain().focus().toggleBold().run()
		console.log('[Toolbar] Bold command executed (editable), result:', result)
		
		// Restore selection ban đầu
		if (result) {
			setTimeout(() => {
				if (!originalSelection.empty) {
					// Có selection: restore selection
					editor.commands.setTextSelection({
						from: originalSelection.from,
						to: originalSelection.to
					})
				} else {
					// Không có selection: restore cursor ở vị trí ban đầu
					if (wasInBlockquote) {
						// Đang ở blockquote: đặt cursor ở vị trí ban đầu trong blockquote
						const originalCursorPos = originalSelection.from
						editor.commands.setTextSelection({ from: originalCursorPos, to: originalCursorPos })
					} else {
						// Đang ở title: tìm cuối title để đặt cursor
						const { state } = editor
						let titleEnd = state.doc.content.size
						state.doc.descendants((node, pos) => {
							if (node.type.name === 'blockquote' && titleEnd === state.doc.content.size) {
								titleEnd = pos
								return false
							}
						})
						const safePos = Math.max(0, Math.min(titleEnd - 1, state.doc.content.size - 1))
						editor.commands.setTextSelection({ from: safePos, to: safePos })
					}
				}
				// Không cần focus lại vì editor chưa bị blur (đã prevent blur ở toolbar level)
				// Cập nhật isInBlockquote (debounced để tránh nháy)
				checkIsInBlockquote()
			}, 10)
		}
	} catch (error) {
		console.error('[Toolbar] Error toggling bold (editable):', error)
	}
}

const toggleItalic = async () => {
	const editor = getEditor()
	if (!editor) {
		console.warn('[Toolbar] Cannot toggle italic - editor not available')
		return
	}
	
	const isEditable = isEditorEditable(editor)
	console.log('[Toolbar] Toggling italic, isEditable:', isEditable)
	
	// TH1: Read-only - Format toàn bộ title
	if (!isEditable) {
		try {
			// Lưu vị trí cuối title trước khi select
			const { state: stateBefore } = editor
			const { doc: docBefore } = stateBefore
			let titleEndBefore = docBefore.content.size
			docBefore.descendants((node, pos) => {
				if (node.type.name === 'blockquote' && titleEndBefore === docBefore.content.size) {
					titleEndBefore = pos
					return false
				}
			})
			
			selectAllTitle(editor)
			await new Promise(resolve => setTimeout(resolve, 30))
			
			const result = editor.chain().focus().toggleItalic().run()
			console.log('[Toolbar] Italic command executed (read-only), result:', result)
			
			// Đặt cursor lại NGAY SAU KHI FORMAT để tránh buttons nháy
			if (result) {
				const safePos = Math.max(1, Math.min(titleEndBefore - 1, docBefore.content.size - 1))
				editor.commands.setTextSelection({ from: safePos, to: safePos })
				
				setTimeout(() => {
					checkIsInBlockquote(true)
				}, 10)
			}
		} catch (error) {
			console.error('[Toolbar] Error toggling italic (read-only):', error)
		}
		return
	}
	
	// TH2: Editable - Format theo vị trí cursor
	const { state: stateBefore } = editor
	const { selection: selectionBefore } = stateBefore
	const $fromBefore = selectionBefore.$from
	
	let wasInBlockquote = false
	let depth = $fromBefore.depth
	while (depth >= 0) {
		const node = $fromBefore.node(depth)
		if (node && node.type.name === 'blockquote') {
			wasInBlockquote = true
			break
		}
		depth--
	}
	
	const originalSelection = {
		from: selectionBefore.from,
		to: selectionBefore.to,
		empty: selectionBefore.empty
	}
	
	console.log('[Toolbar] Toggling italic (editable), wasInBlockquote:', wasInBlockquote, 'selection:', originalSelection)
	
	try {
		if (originalSelection.empty) {
			selectCurrentSection(editor)
			await new Promise(resolve => setTimeout(resolve, 50))
		}
		
		const result = editor.chain().focus().toggleItalic().run()
		console.log('[Toolbar] Italic command executed (editable), result:', result)
		
		if (result) {
			setTimeout(() => {
				if (!originalSelection.empty) {
					editor.commands.setTextSelection({
						from: originalSelection.from,
						to: originalSelection.to
					})
				} else {
					// Không có selection: restore cursor ở vị trí ban đầu
					if (wasInBlockquote) {
						// Đang ở blockquote: đặt cursor ở vị trí ban đầu trong blockquote
						const originalCursorPos = originalSelection.from
						editor.commands.setTextSelection({ from: originalCursorPos, to: originalCursorPos })
					} else {
						// Đang ở title: tìm cuối title để đặt cursor
						const { state } = editor
						let titleEnd = state.doc.content.size
						state.doc.descendants((node, pos) => {
							if (node.type.name === 'blockquote' && titleEnd === state.doc.content.size) {
								titleEnd = pos
								return false
							}
						})
						const safePos = Math.max(0, Math.min(titleEnd - 1, state.doc.content.size - 1))
						editor.commands.setTextSelection({ from: safePos, to: safePos })
					}
				}
				
				// Không cần focus lại vì editor chưa bị blur (đã prevent blur ở toolbar level)
				
				checkIsInBlockquote()
			}, 10)
		}
	} catch (error) {
		console.error('[Toolbar] Error toggling italic (editable):', error)
	}
}

const toggleUnderline = async () => {
	const editor = getEditor()
	if (!editor) {
		console.warn('[Toolbar] Cannot toggle underline - editor not available')
		return
	}
	
	const isEditable = isEditorEditable(editor)
	console.log('[Toolbar] Toggling underline, isEditable:', isEditable)
	
	// TH1: Read-only - Format toàn bộ title
	if (!isEditable) {
		try {
			// Lưu vị trí cuối title trước khi select
			const { state: stateBefore } = editor
			const { doc: docBefore } = stateBefore
			let titleEndBefore = docBefore.content.size
			docBefore.descendants((node, pos) => {
				if (node.type.name === 'blockquote' && titleEndBefore === docBefore.content.size) {
					titleEndBefore = pos
					return false
				}
			})
			
			selectAllTitle(editor)
			await new Promise(resolve => setTimeout(resolve, 30))
			
			const result = editor.chain().focus().toggleUnderline().run()
			console.log('[Toolbar] Underline command executed (read-only), result:', result)
			
			// Đặt cursor lại NGAY SAU KHI FORMAT để tránh buttons nháy
			if (result) {
				const safePos = Math.max(1, Math.min(titleEndBefore - 1, docBefore.content.size - 1))
				editor.commands.setTextSelection({ from: safePos, to: safePos })
				
				setTimeout(() => {
					checkIsInBlockquote(true)
				}, 10)
			}
		} catch (error) {
			console.error('[Toolbar] Error toggling underline (read-only):', error)
		}
		return
	}
	
	// TH2: Editable - Format theo vị trí cursor
	const { state: stateBefore } = editor
	const { selection: selectionBefore } = stateBefore
	const $fromBefore = selectionBefore.$from
	
	let wasInBlockquote = false
	let depth = $fromBefore.depth
	while (depth >= 0) {
		const node = $fromBefore.node(depth)
		if (node && node.type.name === 'blockquote') {
			wasInBlockquote = true
			break
		}
		depth--
	}
	
	const originalSelection = {
		from: selectionBefore.from,
		to: selectionBefore.to,
		empty: selectionBefore.empty
	}
	
	console.log('[Toolbar] Toggling underline (editable), wasInBlockquote:', wasInBlockquote, 'selection:', originalSelection)
	
	try {
				if (originalSelection.empty) {
					selectCurrentSection(editor)
					await new Promise(resolve => setTimeout(resolve, 50))
				}
				
				const result = editor.chain().focus().toggleUnderline().run()
				console.log('[Toolbar] Underline command executed (editable), result:', result)
				
				if (result) {
					setTimeout(() => {
						if (!originalSelection.empty) {
							editor.commands.setTextSelection({
								from: originalSelection.from,
								to: originalSelection.to
							})
						} else {
							// Không có selection: restore cursor ở vị trí ban đầu
							if (wasInBlockquote) {
								// Đang ở blockquote: đặt cursor ở vị trí ban đầu trong blockquote
								const originalCursorPos = originalSelection.from
								editor.commands.setTextSelection({ from: originalCursorPos, to: originalCursorPos })
							} else {
								// Đang ở title: tìm cuối title để đặt cursor
								const { state } = editor
								let titleEnd = state.doc.content.size
								state.doc.descendants((node, pos) => {
									if (node.type.name === 'blockquote' && titleEnd === state.doc.content.size) {
										titleEnd = pos
										return false
									}
								})
								const safePos = Math.max(0, Math.min(titleEnd - 1, state.doc.content.size - 1))
								editor.commands.setTextSelection({ from: safePos, to: safePos })
							}
						}
						
						// Không cần focus lại vì editor chưa bị blur (đã prevent blur ở toolbar level)
						
						checkIsInBlockquote()
					}, 10)
				}
			} catch (error) {
				console.error('[Toolbar] Error toggling underline (editable):', error)
			}
		}
const removeHighlight = async () => {
	const editor = getEditor()
	if (!editor) {
		console.warn('[Toolbar] Cannot remove highlight - editor not available')
		return
	}
	
	console.log('[Toolbar] Removing highlight')
	
	// Focus editor
	const dom = editor.view?.dom
	if (dom) {
		dom.focus()
	}
	
	await new Promise(resolve => setTimeout(resolve, 30))
	
	try {
		const { state } = editor
		const { doc, selection } = state
		const textSize = doc.content.size
		
		// ⚠️ FIX: Lưu selection ban đầu
		const originalSelection = {
			from: selection.from,
			to: selection.to,
			empty: selection.empty
		}
		
		// Nếu không có selection hoặc selection rỗng, chỉ select title (không select blockquote)
		if (textSize > 0 && (selection.empty || !editor.isFocused)) {
			let titleEnd = textSize
			doc.descendants((node, pos) => {
				if (node.type.name === 'blockquote' && titleEnd === textSize) {
					titleEnd = pos
					return false
				}
			})
			editor.commands.setTextSelection({ from: 0, to: titleEnd })
			await new Promise(resolve => setTimeout(resolve, 20))
		}
		
		const result = editor.chain().focus().unsetHighlight().run()
		console.log('[Toolbar] Remove highlight result:', result)
		if (result) {
			currentColor.value = null
			
			// ⚠️ FIX: Restore selection ban đầu và cập nhật isInBlockquote
			setTimeout(() => {
				if (!originalSelection.empty) {
					editor.commands.setTextSelection({
						from: originalSelection.from,
						to: originalSelection.to
					})
				} else {
					// Đặt cursor trong title, không để cursor nhảy xuống blockquote
					const { state } = editor
					let titleEnd = state.doc.content.size
					state.doc.descendants((node, pos) => {
						if (node.type.name === 'blockquote' && titleEnd === state.doc.content.size) {
							titleEnd = pos
							return false
						}
					})
					const safePos = Math.max(0, Math.min(titleEnd - 1, state.doc.content.size - 1))
					editor.commands.setTextSelection({ from: safePos, to: safePos })
				}
				// Cập nhật isInBlockquote sau khi restore selection (debounced để tránh nháy)
				checkIsInBlockquote()
			}, 10)
		}
	} catch (error) {
		console.error('[Toolbar] Error removing highlight:', error)
	}
	
	showColorPicker.value = false
}
const setHighlight = async (color) => {
	const editor = getEditor()
	if (!editor) {
		console.warn('[Toolbar] Cannot set highlight - editor not available')
		return
	}
	
	console.log('[Toolbar] Setting highlight color:', color)
	
	// Focus editor và đảm bảo có selection
	const dom = editor.view?.dom
	if (dom) {
		dom.focus()
	}
	
	// Đợi một chút để DOM focus được áp dụng
	await new Promise(resolve => setTimeout(resolve, 50))
	
	try {
		const { state } = editor
		const { doc, selection } = state
		const textSize = doc.content.size
		
		if (textSize === 0) {
			console.warn('[Toolbar] Document is empty, cannot highlight')
			showColorPicker.value = false
			return
		}
		
		// Kiểm tra xem selection có trong blockquote (description) không
		let isInBlockquote = false
		const $from = selection.$from
		let node = $from.node($from.depth)
		let depth = $from.depth
		
		// Kiểm tra tất cả các node trong chain từ selection
		while (depth >= 0 && node) {
			if (node.type.name === 'blockquote') {
				isInBlockquote = true
				break
			}
			depth--
			if (depth >= 0) {
				node = $from.node(depth)
			}
		}
		
		if (isInBlockquote) {
			console.warn('[Toolbar] Cannot highlight in description (blockquote)')
			return
		}
		
		// ⚠️ FIX: Lưu selection ban đầu và tính toán vị trí cursor cần restore trước
		const originalSelection = {
			from: selection.from,
			to: selection.to,
			empty: selection.empty
		}
		
		// Tính toán vị trí cursor cần restore (nếu không có selection)
		let restoreCursorPos = null
		if (originalSelection.empty) {
			// Tìm cuối title trước khi select
			let titleEnd = doc.content.size
			doc.descendants((node, pos) => {
				if (node.type.name === 'blockquote' && titleEnd === doc.content.size) {
					titleEnd = pos
					return false
				}
			})
			restoreCursorPos = Math.max(1, Math.min(titleEnd - 1, doc.content.size - 1))
		}
		
		// Luôn đảm bảo có selection - chỉ select phần đang focus (title hoặc blockquote)
		let hasValidSelection = !selection.empty && editor.isFocused
		
		if (!hasValidSelection) {
			console.log('[Toolbar] No valid selection, selecting current section')
			// Chỉ select phần đang focus (title hoặc blockquote)
			selectCurrentSection(editor)
			// Đợi selection được áp dụng
			await new Promise(resolve => setTimeout(resolve, 30))
		}
		
		// Kiểm tra lại trạng thái highlight hiện tại từ editor
		const currentState = editor.state
		const currentSelection = currentState.selection
		const currentMarks = currentSelection.$from.marks()
		const currentBgColor = currentMarks.find(m => m.type.name === 'textStyle')?.attrs?.backgroundColor
		
		// Nếu click vào cùng màu đang được highlight, thì bỏ highlight
		if (currentBgColor === color) {
			console.log('[Toolbar] Same color selected, removing highlight')
			const result = editor.chain().focus().unsetHighlight().run()
			console.log('[Toolbar] Unset highlight result:', result)
			currentColor.value = null
			
			// ⚠️ FIX: Restore selection NGAY SAU KHI remove highlight để tránh buttons nháy
			if (result) {
				if (!originalSelection.empty) {
					// Có selection: restore selection ngay lập tức
					editor.commands.setTextSelection({
						from: originalSelection.from,
						to: originalSelection.to
					})
				} else if (restoreCursorPos !== null) {
					// Không có selection: đặt cursor ở vị trí đã tính toán trước
					editor.commands.setTextSelection({ from: restoreCursorPos, to: restoreCursorPos })
				}
				
				// Cập nhật isInBlockquote (với delay nhỏ để đảm bảo cursor đã được đặt)
				setTimeout(() => {
					checkIsInBlockquote()
				}, 10)
			}
		} else {
			// Set màu highlight mới
			console.log('[Toolbar] Applying highlight color:', color)
			// Đảm bảo focus và có selection trước khi apply
			editor.commands.focus()
			await new Promise(resolve => setTimeout(resolve, 20))
			
			const result = editor.chain().focus().toggleHighlight(color).run()
			console.log('[Toolbar] Toggle highlight result:', result)
			if (result) {
				currentColor.value = color
				
			// ⚠️ FIX: Restore selection NGAY SAU KHI apply highlight để tránh buttons nháy
			if (!originalSelection.empty) {
				// Có selection: restore selection ngay lập tức
				editor.commands.setTextSelection({
					from: originalSelection.from,
					to: originalSelection.to
				})
			} else if (restoreCursorPos !== null) {
				// Không có selection: đặt cursor ở vị trí đã tính toán trước
				editor.commands.setTextSelection({ from: restoreCursorPos, to: restoreCursorPos })
			}
			
			// Không cần focus lại vì editor chưa bị blur (đã prevent blur ở toolbar level)
			// Cập nhật isInBlockquote (với delay nhỏ để đảm bảo cursor đã được đặt)
			setTimeout(() => {
				checkIsInBlockquote()
			}, 10)
			} else {
				console.warn('[Toolbar] Highlight command returned false')
			}
		}
	} catch (error) {
		console.error('[Toolbar] Error setting highlight:', error)
		// Retry với cách khác - chỉ select title và thử lại
		try {
			const { doc } = editor.state
			const textSize = doc.content.size
			if (textSize > 0) {
				let titleEnd = textSize
				doc.descendants((node, pos) => {
					if (node.type.name === 'blockquote' && titleEnd === textSize) {
						titleEnd = pos
						return false
					}
				})
				
				editor.commands.setTextSelection({ from: 0, to: titleEnd })
				await new Promise(resolve => setTimeout(resolve, 50))
				editor.commands.focus()
				await new Promise(resolve => setTimeout(resolve, 20))
				const result = editor.chain().focus().toggleHighlight(color).run()
				if (result) {
					currentColor.value = color
					console.log('[Toolbar] Highlight applied successfully on retry')
					
					setTimeout(() => {
						const cursorPos = titleEnd > 0 ? titleEnd : textSize
						editor.commands.setTextSelection({ from: cursorPos, to: cursorPos })
					}, 10)
				} else {
					console.error('[Toolbar] Retry also failed')
				}
			}
		} catch (retryError) {
			console.error('[Toolbar] Retry failed:', retryError)
		}
	}
	
	showColorPicker.value = false
}

// Checklist/Tích done
const hasChecklist = computed(() => {
	// Kiểm tra từ node data thay vì editor
	if (!props.renderer || !props.nodeId) return false
	
	const node = props.renderer.nodes?.find(n => n.id === props.nodeId)
	return node?.data?.completed === true
})

const toggleChecklist = async () => {
	const editor = getEditor()
	if (!editor) {
		console.warn('[Toolbar] Cannot toggle checklist - editor not available')
		return
	}
	
	if (!props.renderer || !props.nodeId) {
		console.warn('[Toolbar] Cannot toggle checklist - renderer or nodeId not available')
		return
	}
	
	console.log('[Toolbar] Toggling checklist')
	
	// Lấy node hiện tại
	const node = props.renderer.nodes?.find(n => n.id === props.nodeId)
	const currentCompleted = node?.data?.completed === true
	const newCompleted = !currentCompleted
	
	// Apply strikethrough cho toàn bộ title text trong editor
	try {
		const { state } = editor
		const { doc } = state
		
		// Tìm vị trí cuối title (trước blockquote đầu tiên)
		let titleEnd = doc.content.size
		doc.descendants((node, pos) => {
			if (node.type.name === 'blockquote' && titleEnd === doc.content.size) {
				titleEnd = pos
				return false
			}
		})
		
		// Select toàn bộ title
		editor.commands.setTextSelection({ from: 0, to: titleEnd })
		
		// Toggle strikethrough cho toàn bộ title
		editor.chain().focus().toggleStrike().run()
		
		// Đặt cursor lại ở cuối title
		const safePos = Math.max(1, Math.min(titleEnd - 1, doc.content.size - 1))
		editor.commands.setTextSelection({ from: safePos, to: safePos })
		
		// Update node data để apply opacity cho node hiện tại
		if (props.renderer.callbacks && props.renderer.callbacks.onNodeUpdate) {
			props.renderer.callbacks.onNodeUpdate(props.nodeId, { completed: newCompleted })
		}
		
		// Lấy tất cả descendants và đánh dấu completed cho chúng
		if (props.renderer.getDescendantIds) {
			const descendantIds = props.renderer.getDescendantIds(props.nodeId)
			console.log('[Toolbar] Toggling completed for descendants:', descendantIds)
			
			// Update completed cho tất cả descendants
			descendantIds.forEach(descendantId => {
				if (props.renderer.callbacks && props.renderer.callbacks.onNodeUpdate) {
					props.renderer.callbacks.onNodeUpdate(descendantId, { completed: newCompleted })
				}
			})
		}
		
		console.log('[Toolbar] Checklist toggled, completed:', newCompleted)
	} catch (error) {
		console.error('[Toolbar] Error toggling checklist:', error)
	}
}

// Style
const handleStyleClick = () => {
	// Toggle toolbar top on click
	showStyleTooltip.value = !showStyleTooltip.value
	// Check lại isInBlockquote khi toggle toolbar (immediate để hiển thị đúng ngay)
	if (showStyleTooltip.value) {
		checkIsInBlockquote(true)
	}
}

const handleStyleMouseLeave = (event) => {
	// Delay một chút để có thể di chuyển chuột vào toolbar-top
	setTimeout(() => {
		const toolbarTop = toolbarRef.value?.querySelector('.toolbar-top')
		const styleWrapper = styleButtonRef.value
		// Nếu không hover vào toolbar-top hoặc style button, ẩn toolbar-top
		if (toolbarTop && !toolbarTop.matches(':hover') && styleWrapper && !styleWrapper.matches(':hover')) {
			showStyleTooltip.value = false
		}
	}, 150)
}

// Apply style
const applyStyle = (styleType) => {
	const editor = getEditor()
	if (!editor) {
		console.warn('[Toolbar] Cannot apply style - editor not available')
		return
	}
	
	console.log('[Toolbar] Applying style:', styleType)
	
	// Focus editor
	const dom = editor.view?.dom
	if (dom) {
		dom.focus()
	}
	
	setTimeout(() => {
		try {
			const { doc } = editor.state
			const textSize = doc.content.size
			
			// Select all if no selection
			if (textSize > 0 && editor.state.selection.empty) {
				editor.commands.setTextSelection({ from: 0, to: textSize })
				setTimeout(() => {
					applyStyleCommand(editor, styleType)
				}, 20)
			} else {
				applyStyleCommand(editor, styleType)
			}
		} catch (error) {
			console.error('[Toolbar] Error applying style:', error)
		}
	}, 30)
	
	showStyleTooltip.value = false
}

const applyStyleCommand = (editor, styleType) => {
	switch (styleType) {
		case 'paragraph':
			editor.chain().focus().setParagraph().run()
			break
		case 'heading1':
			if (editor.can().setHeading({ level: 1 })) {
				editor.chain().focus().setHeading({ level: 1 }).run()
			}
			break
		case 'heading2':
			if (editor.can().setHeading({ level: 2 })) {
				editor.chain().focus().setHeading({ level: 2 }).run()
			}
			break
		case 'heading3':
			if (editor.can().setHeading({ level: 3 })) {
				editor.chain().focus().setHeading({ level: 3 }).run()
			}
			break
	}
	
	// Remove selection after applying
	const { doc } = editor.state
	const textSize = doc.content.size
	if (textSize > 0) {
		setTimeout(() => {
			editor.commands.setTextSelection({ from: textSize, to: textSize })
		}, 10)
	}
}


// More Options - Hover để hiển thị (giống như Style button)
const showMoreOptionsMenu = () => {
	// Clear timeout nếu có
	if (moreOptionsLeaveTimeout) {
		clearTimeout(moreOptionsLeaveTimeout)
		moreOptionsLeaveTimeout = null
	}
	
	// Hiển thị context menu của node
	if (props.nodeId && moreOptionsButtonRef.value) {
		const buttonRect = moreOptionsButtonRef.value.getBoundingClientRect()
		
		if (buttonRect) {
			emit('show-context-menu', {
				nodeId: props.nodeId,
				position: {
					x: buttonRect.left - 280, // Offset tương tự như trong mindmapExtensions.js
					y: buttonRect.top // Tạm thời đặt ở top của button, sẽ được điều chỉnh sau
				},
				buttonTop: buttonRect.top,
				spacing: 16 // Khoảng cách 16px từ toolbar
			})
		}
	}
}

let moreOptionsLeaveTimeout = null

const handleMoreOptionsMouseLeave = (event) => {
	// Delay một chút để có thể di chuyển chuột vào context menu
	moreOptionsLeaveTimeout = setTimeout(() => {
		const contextMenu = document.querySelector('.mindmap-context-menu')
		
		// Kiểm tra xem chuột có đang ở trong context menu không
		if (contextMenu) {
			const mouseX = event?.clientX || 0
			const mouseY = event?.clientY || 0
			const elementUnderMouse = document.elementFromPoint(mouseX, mouseY)
			const isHoveringMenu = contextMenu.contains(elementUnderMouse) || contextMenu.matches(':hover')
			
			// Nếu không hover vào menu, đóng menu
			if (!isHoveringMenu) {
				emit('hide-context-menu')
			}
		} else {
			// Nếu không có menu, đóng luôn
			emit('hide-context-menu')
		}
	}, 150)
}

// Ghi chú
const handleNoteClick = async () => {
	const editor = getEditor()
	if (!editor) {
		console.warn('[Toolbar] Cannot handle note click - editor not available')
		emit('note-click')
		return
	}
	
	console.log('[Toolbar] Handling note click - focusing on description')
	
	// Focus editor trước
	const dom = editor.view?.dom
	if (dom) {
		dom.focus()
	}
	
	await new Promise(resolve => setTimeout(resolve, 50))
	
	try {
		const { state } = editor
		const { doc } = state
		
		// Kiểm tra xem đã có blockquote chưa
		let hasBlockquote = false
		let blockquotePos = null
		
		doc.descendants((node, pos) => {
			if (node.type.name === 'blockquote' && !hasBlockquote) {
				hasBlockquote = true
				blockquotePos = pos
				return false
			}
		})
		
		if (hasBlockquote && blockquotePos !== null) {
			// Đã có blockquote: focus vào blockquote
			try {
				// Tìm vị trí paragraph đầu tiên trong blockquote
				let paragraphPos = null
				doc.descendants((node, pos) => {
					if (pos > blockquotePos && pos < blockquotePos + doc.nodeAt(blockquotePos).nodeSize) {
						if (node.type.name === 'paragraph' && paragraphPos === null) {
							paragraphPos = pos + 1 // +1 để vào trong paragraph
							return false
						}
					}
				})
				
				if (paragraphPos !== null) {
					editor.commands.setTextSelection(paragraphPos)
				} else {
					// Fallback: focus vào đầu blockquote
					editor.commands.setTextSelection(blockquotePos + 1)
				}
				
				editor.commands.focus()
				console.log('[Toolbar] Focused on existing blockquote at position:', paragraphPos || blockquotePos + 1)
			} catch (e) {
				console.warn('[Toolbar] Error focusing on blockquote:', e)
				// Fallback: focus vào cuối và tìm blockquote
				editor.commands.focus('end')
			}
		} else {
			// Chưa có blockquote: tạo blockquote mới
			editor.chain()
				.focus('end')
				.insertContent('<blockquote><p></p></blockquote>')
				.run()
			
			// Đợi một chút để blockquote được tạo
			await new Promise(resolve => setTimeout(resolve, 50))
			
			// Focus vào paragraph trong blockquote vừa tạo
			const { state: newState } = editor
			const { doc: newDoc } = newState
			
			let newBlockquotePos = null
			newDoc.descendants((node, pos) => {
				if (node.type.name === 'blockquote' && newBlockquotePos === null) {
					newBlockquotePos = pos
					return false
				}
			})
			
			if (newBlockquotePos !== null) {
				// Tìm paragraph đầu tiên trong blockquote
				let paragraphPos = null
				newDoc.descendants((node, pos) => {
					if (pos > newBlockquotePos && pos < newBlockquotePos + newDoc.nodeAt(newBlockquotePos).nodeSize) {
						if (node.type.name === 'paragraph' && paragraphPos === null) {
							paragraphPos = pos + 1
							return false
						}
					}
				})
				
				if (paragraphPos !== null) {
					editor.commands.setTextSelection(paragraphPos)
					editor.commands.focus()
					console.log('[Toolbar] Created and focused on new blockquote at position:', paragraphPos)
				}
			}
		}
		
		// Đảm bảo editor ở chế độ editable
		if (!isEditorEditable(editor)) {
			// Set editor to editable nếu chưa
			editor.setEditable(true)
		}
		
		// Đảm bảo focus được giữ lại sau khi set editable
		// Sử dụng setTimeout với delay lớn hơn để đảm bảo các event đã được xử lý xong
		setTimeout(() => {
			try {
				// Focus lại để đảm bảo cursor vẫn ở blockquote
				const { state: finalState } = editor
				const { doc: finalDoc } = finalState
				
				// Tìm lại blockquote và focus vào đó
				let finalBlockquotePos = null
				finalDoc.descendants((node, pos) => {
					if (node.type.name === 'blockquote' && finalBlockquotePos === null) {
						finalBlockquotePos = pos
						return false
					}
				})
				
				if (finalBlockquotePos !== null) {
					// Tìm paragraph trong blockquote
					let finalParagraphPos = null
					finalDoc.descendants((node, pos) => {
						if (pos > finalBlockquotePos && pos < finalBlockquotePos + finalDoc.nodeAt(finalBlockquotePos).nodeSize) {
							if (node.type.name === 'paragraph' && finalParagraphPos === null) {
								finalParagraphPos = pos + 1
								return false
							}
						}
					})
					
					if (finalParagraphPos !== null) {
						editor.commands.setTextSelection(finalParagraphPos)
						editor.commands.focus()
						console.log('[Toolbar] Re-focused on blockquote after delay')
					}
				}
			} catch (error) {
				console.warn('[Toolbar] Error re-focusing on blockquote:', error)
			}
		}, 150)
		
		// Emit event để parent component biết (nếu cần) - emit sau khi đã focus xong
		emit('note-click')
	} catch (error) {
		console.error('[Toolbar] Error handling note click:', error)
		emit('note-click')
	}
}

// Comment
const handleCommentClick = () => {
	emit('comment-click')
}

// Click outside để đóng color picker và style tooltip
const handleClickOutside = (event) => {
	if (toolbarRef.value && !toolbarRef.value.contains(event.target)) {
		showColorPicker.value = false
		showStyleTooltip.value = false
	}
}

// Hàm cập nhật highlight từ editor
const updateColorFromEditor = () => {
	const editor = getEditor()
	if (!editor) return
	
	const { state } = editor
	const { selection } = state
	const marks = selection.$from.marks()
	const textStyleMark = marks.find(mark => mark.type.name === 'textStyle')
	if (textStyleMark && textStyleMark.attrs.backgroundColor) {
		currentColor.value = textStyleMark.attrs.backgroundColor
	} else {
		currentColor.value = null
	}
	
	// Cập nhật isInBlockquote mỗi khi selection thay đổi (debounced để tránh nháy)
	checkIsInBlockquote()
}

// Watch editor và nodeId để cập nhật màu hiện tại và lắng nghe selection changes
let currentEditorInstance = null

watch([() => props.editor, () => props.nodeId, () => props.renderer], ([editor, nodeId, renderer], [oldEditor]) => {
	// Cleanup old editor listeners
	if (oldEditor) {
		oldEditor.off('selectionUpdate', updateColorFromEditor)
		oldEditor.off('update', updateColorFromEditor)
	}
	
	// Lấy editor instance
	const editorInstance = getEditor()
	
	if (editorInstance && editorInstance !== currentEditorInstance) {
		currentEditorInstance = editorInstance
		console.log('[Toolbar] Editor instance updated:', editorInstance)
		updateColorFromEditor()
		checkIsInBlockquote(true) // Check ngay khi editor được set (immediate)
		
		// Lắng nghe selection changes (debounced để tránh nháy)
		editorInstance.on('selectionUpdate', () => {
			updateColorFromEditor()
			checkIsInBlockquote() // Debounced
		})
		editorInstance.on('update', () => {
			updateColorFromEditor()
			checkIsInBlockquote() // Debounced
		})
	} else if (!editorInstance) {
		currentEditorInstance = null
		isInBlockquote.value = false
		console.log('[Toolbar] Editor instance is null')
	}
}, { immediate: true })

// Prevent editor blur khi click vào toolbar buttons
const handleToolbarMouseDown = (e) => {
	// Ngăn blur editor khi click vào toolbar
	e.preventDefault()
	e.stopPropagation()
}

onMounted(() => {
	document.addEventListener('click', handleClickOutside)
	
	// Prevent blur editor khi mousedown vào toolbar
	if (toolbarRef.value) {
		toolbarRef.value.addEventListener('mousedown', handleToolbarMouseDown)
	}
})

onUnmounted(() => {
	document.removeEventListener('click', handleClickOutside)
	
	if (toolbarRef.value) {
		toolbarRef.value.removeEventListener('mousedown', handleToolbarMouseDown)
	}
})

// Đóng color picker khi toolbar ẩn
watch(() => props.visible, (visible) => {
	if (!visible) {
		showColorPicker.value = false
	}
})
</script>

<style scoped>
.mindmap-toolbar-container {
	position: fixed;
	z-index: 1000;
}

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

.toolbar-btn span {
	display: block;
	line-height: 1;
}

.color-icon {
	font-size: 16px;
	font-weight: 700;
}

.color-picker-wrapper {
	position: relative;
}

.color-btn {
	position: relative;
}

.color-indicator {
	position: absolute;
	bottom: 2px;
	right: 2px;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	border: 2px solid white;
}

.color-picker-dropdown {
	position: absolute;
	bottom: 100%;
	left: 50%;
	transform: translateX(-50%);
	margin-bottom: 8px;
	padding: 8px;
	background: white;
	border: 1px solid #e5e7eb;
	border-radius: 8px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	z-index: 1001;
}

.color-picker-grid {
	display: grid;
	grid-template-columns: repeat(5, 1fr);
	gap: 4px;
}

.color-option {
	width: 24px;
	height: 24px;
	border-radius: 4px;
	cursor: pointer;
	border: 2px solid transparent;
	transition: all 0.2s;
}

.color-option:hover {
	border-color: #3b82f6;
	transform: scale(1.1);
}

.color-option.active {
	border-color: #3b82f6;
	box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.color-option-remove {
	background-color: #f3f4f6;
	border: 2px solid #d1d5db;
	display: flex;
	align-items: center;
	justify-content: center;
}

.color-option-remove:hover {
	background-color: #e5e7eb;
	border-color: #ef4444;
}

.color-option-remove span {
	color: #6b7280;
	font-size: 12px;
	font-weight: bold;
}

.color-option-remove:hover span {
	color: #ef4444;
}

/* Transitions - Slide up/down animation */
.toolbar-slide-enter-active {
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toolbar-slide-leave-active {
	transition: all 0.25s cubic-bezier(0.4, 0, 1, 1);
}

.toolbar-slide-enter-from {
	opacity: 0;
	transform: translateX(-50%) translateY(100px);
}

.toolbar-slide-enter-to {
	opacity: 1;
	transform: translateX(-50%) translateY(0);
}

.toolbar-slide-leave-from {
	opacity: 1;
	transform: translateX(-50%) translateY(0);
}

.toolbar-slide-leave-to {
	opacity: 0;
	transform: translateX(-50%) translateY(100px);
}

.color-picker-enter-active,
.color-picker-leave-active {
	transition: all 0.2s ease;
}

.color-picker-enter-from,
.color-picker-leave-to {
	opacity: 0;
	transform: translateX(-50%) translateY(-5px);
}

/* Style Tooltip */
.style-button-wrapper {
	position: relative;
}

.style-tooltip {
	position: absolute;
	bottom: calc(100% + 12px);
	left: 50%;
	transform: translateX(-50%);
	z-index: 1001;
	pointer-events: auto;
	white-space: nowrap;
}

.tooltip-content {
	background: white;
	border: 1px solid #e5e7eb;
	border-radius: 6px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	padding: 4px;
	min-width: 140px;
}

.tooltip-item {
	padding: 8px 12px;
	border-radius: 4px;
	cursor: pointer;
	transition: background-color 0.2s;
	display: flex;
	align-items: center;
}

.tooltip-item:hover {
	background: #f3f4f6;
}

.tooltip-item-label {
	font-size: 14px;
	color: #1f2937;
	font-weight: 400;
}

.tooltip-item:first-child .tooltip-item-label {
	font-weight: 600;
}

.tooltip-item-label.heading1 {
	font-size: 24px;
	font-weight: 700;
	line-height: 1.2;
}

.tooltip-item-label.heading2 {
	font-size: 20px;
	font-weight: 700;
	line-height: 1.2;
}

.tooltip-item-label.heading3 {
	font-size: 18px;
	font-weight: 600;
	line-height: 1.2;
}

/* Tooltip fade transition */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
	transition: all 0.2s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
	opacity: 0;
	transform: translateX(-50%) translateY(5px);
}
</style>

