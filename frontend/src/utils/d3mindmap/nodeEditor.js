/**
 * Node Editor Management
 * Handles mounting/unmounting Vue TipTap editor components and editor event handlers
 */

import MindmapNodeEditor from '@/components/MindmapNodeEditor.vue'
import * as d3 from 'd3'
import { TextSelection } from 'prosemirror-state'
import { createApp } from 'vue'

/**
 * Mount Vue component vào container
 */
export function mountNodeEditor(renderer, nodeId, container, props = {}) {
	// Unmount component cũ nếu có
	unmountNodeEditor(renderer, nodeId)
	
	// Tạo Vue app instance
	const app = createApp(MindmapNodeEditor, {
		modelValue: props.value || '',
		placeholder: props.placeholder || 'Nhập...',
		color: props.color || '#1f2937',
		minHeight: props.minHeight || '43px',
		width: props.width || '100%',
		height: props.height || 'auto',
		// Pass event handlers as props - component sẽ gọi chúng khi emit events
		onInput: props.onInput || null,
		onFocus: props.onFocus || null,
		onBlur: props.onBlur || null,
		isRoot: props.isRoot || false,
		uploadImage: props.uploadImage || null, // Pass uploadImage function
	})
	
	// Mount vào container
	const instance = app.mount(container)
	
	// Lưu app instance và component instance
	renderer.vueApps.set(nodeId, { app, instance })
	
	return { app, instance }
}

/**
 * Unmount Vue component
 */
export function unmountNodeEditor(renderer, nodeId) {
	const entry = renderer.vueApps.get(nodeId)
	if (entry) {
		try {
			// Set flag để ngăn update khi đang unmount
			if (entry.instance && typeof entry.instance._isUnmounting !== 'undefined') {
				entry.instance._isUnmounting = true
			}
			entry.app.unmount()
		} catch (e) {
			console.warn('Error unmounting node editor:', e)
		} finally {
			renderer.vueApps.delete(nodeId)
		}
	}
}

/**
 * Get editor instance từ Vue app
 */
export function getEditorInstance(renderer, nodeId) {
	const entry = renderer.vueApps.get(nodeId)
	if (entry && entry.instance) {
		// TipTap editor được lưu trong component instance
		return entry.instance.editor || null
	}
	return null
}

/**
 * Handler cho editor input event
 */
export function handleEditorInput(renderer, nodeId, value, foElement, nodeData) {
	// ⚠️ NEW: Skip nếu đang update style (không tính toán lại kích thước)
	if (renderer.isUpdatingStyle && renderer.isUpdatingStyle.has(nodeId)) {
		// Chỉ cập nhật label, không tính toán lại kích thước
		if (!nodeData.data) nodeData.data = {}
		nodeData.data.label = value
		// Trigger callback với flag skipSizeCalculation
		if (renderer.callbacks.onNodeUpdate) {
			renderer.callbacks.onNodeUpdate(nodeId, { 
				label: value,
				skipSizeCalculation: true
			})
		}
		return
	}
	
	// Tương tự như textarea on('input') handler - tự động mở rộng khi nhập text
	const nodeGroup = d3.select(foElement.parentNode)
	const rect = nodeGroup.select('.node-rect')
	
	// ⚠️ IMPORTANT: Lấy kích thước BAN ĐẦU (lúc focus) làm kích thước tối thiểu
	const initialSize = renderer.nodeSizeCache.get(`${nodeId}_initial`)
	const minNodeWidth = initialSize?.width || parseFloat(rect.attr('data-initial-width')) || 130
	const minNodeHeight = initialSize?.height || parseFloat(rect.attr('data-initial-height')) || 43
	
	// Lấy text trước đó để xác định có phải edit lần đầu không (TRƯỚC KHI cập nhật)
	const previousText = renderer.getNodeLabel(nodeData)
	const isFirstEdit = !previousText || !previousText.trim()
	
	// Cập nhật node data với giá trị mới
	if (!nodeData.data) nodeData.data = {}
	nodeData.data.label = value
	
	// Tính toán kích thước mới (tương tự logic textarea)
	const maxWidth = 400
	const minWidth = 130
	const singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px
	
	// ⚠️ FIX: Check isEmpty đúng cách, bao gồm cả HTML rỗng như <p></p> hoặc <p><br></p>
	let isEmpty = !value || !value.trim()
	if (!isEmpty && value.includes('<')) {
		// Nếu là HTML, parse và check text content
		const tempDiv = document.createElement('div')
		tempDiv.innerHTML = value
		const textContent = (tempDiv.textContent || tempDiv.innerText || '').trim()
		isEmpty = !textContent || textContent === ''
	}
	
	const isRootNode = nodeData.data?.isRoot || nodeId === 'root'
	
	console.log('[DEBUG handleEditorInput] Node:', nodeId, 'value:', value, 'isEmpty:', isEmpty)
	
	// Tính toán width mới dựa trên nội dung
	let newWidth = minWidth
	if (!isEmpty) {
		// Tạo temp node để tính toán kích thước
		const tempNode = { ...nodeData, data: { ...nodeData.data, label: value } }
		newWidth = renderer.estimateNodeWidth(tempNode, maxWidth)
		newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth))
	}
	
	// XỬ LÝ WIDTH: Node không co lại nhỏ hơn kích thước ban đầu
	let currentWidth
	if (isEmpty) {
		// ⚠️ FIX: Khi xóa hết nội dung:
		// - Nếu node có kích thước lớn hơn mặc định (minNodeWidth >= minWidth): giữ lại kích thước đã khóa
		// - Nếu node có kích thước nhỏ hơn mặc định (minNodeWidth < minWidth): dùng kích thước mặc định
		const currentRectWidth = parseFloat(rect.attr('width')) || minWidth
		console.log('[DEBUG handleEditorInput] Xóa hết nội dung - currentRectWidth:', currentRectWidth, 'minNodeWidth:', minNodeWidth, 'minWidth:', minWidth)
		
		// Nếu kích thước đã khóa >= kích thước mặc định: giữ lại kích thước đã khóa
		// Nếu kích thước đã khóa < kích thước mặc định: dùng kích thước mặc định
		currentWidth = Math.max(minNodeWidth, minWidth)
		console.log('[DEBUG handleEditorInput] Xóa hết nội dung, giãn ra kích thước:', currentWidth, '(minNodeWidth:', minNodeWidth, 'minWidth:', minWidth, ')')
		
		if (nodeData.data && isFirstEdit) {
			delete nodeData.data.fixedWidth
			delete nodeData.data.fixedHeight
			nodeData.data.keepSingleLine = true
		}
	} else {
		// Có nội dung: tính toán width dựa trên text
		const text = value || ''
		
		// Extract plain text từ HTML nếu cần
		let plainText = text
		if (text.includes('<')) {
			const tempDiv = document.createElement('div')
			tempDiv.innerHTML = text
			plainText = (tempDiv.textContent || tempDiv.innerText || '').trim()
		}
		
		if (!plainText || !plainText.trim()) {
			// Không có text: dùng minWidth hoặc minNodeWidth
			currentWidth = Math.max(newWidth, minNodeWidth || minWidth)
		} else {
			// Parse HTML để tách riêng title (paragraph) và description (blockquote)
			let titleText = ''
			let descriptionText = ''
			
			if (text.includes('<')) {
				const tempDiv = document.createElement('div')
				tempDiv.innerHTML = text
				
				// Lấy tất cả paragraph không trong blockquote (title)
				const paragraphs = tempDiv.querySelectorAll('p')
				paragraphs.forEach(p => {
					let inBlockquote = false
					let parent = p.parentElement
					while (parent && parent !== tempDiv) {
						if (parent.tagName === 'BLOCKQUOTE') {
							inBlockquote = true
							break
						}
						parent = parent.parentElement
					}
					
					if (!inBlockquote) {
						const paraText = (p.textContent || p.innerText || '').trim()
						if (paraText) {
							titleText += (titleText ? '\n' : '') + paraText
						}
					}
				})
				
				// Lấy tất cả text trong blockquote (description)
				const blockquotes = tempDiv.querySelectorAll('blockquote')
				blockquotes.forEach(blockquote => {
					const blockquoteText = (blockquote.textContent || blockquote.innerText || '').trim()
					if (blockquoteText) {
						descriptionText += (descriptionText ? '\n' : '') + blockquoteText
					}
				})
			} else {
				// Plain text: coi như title
				titleText = plainText
			}
			
			// Đo width của title (font-size 19px)
			let titleWidth = 0
			if (titleText) {
				const titleLines = titleText.split('\n')
				titleLines.forEach(line => {
					if (line.trim()) {
						const lineSpan = document.createElement('span')
						lineSpan.style.cssText = `
							position: absolute;
							visibility: hidden;
							white-space: nowrap;
							font-size: 19px;
							font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
						`
						lineSpan.textContent = line.trim()
						document.body.appendChild(lineSpan)
						void lineSpan.offsetHeight
						titleWidth = Math.max(titleWidth, lineSpan.offsetWidth)
						document.body.removeChild(lineSpan)
					}
				})
			}
			
			// Đo width của description (font-size 16px)
			let descriptionWidth = 0
			if (descriptionText) {
				const descLines = descriptionText.split('\n')
				descLines.forEach(line => {
					if (line.trim()) {
						const lineSpan = document.createElement('span')
						lineSpan.style.cssText = `
							position: absolute;
							visibility: hidden;
							white-space: nowrap;
							font-size: 16px;
							font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
						`
						lineSpan.textContent = line.trim()
						document.body.appendChild(lineSpan)
						void lineSpan.offsetHeight
						descriptionWidth = Math.max(descriptionWidth, lineSpan.offsetWidth)
						document.body.removeChild(lineSpan)
					}
				})
			}
			
			// Lấy width lớn nhất giữa title và description
			const maxTextWidth = Math.max(titleWidth, descriptionWidth)
			// Padding: 16px mỗi bên = 32px, border: 2px mỗi bên = 4px
			const requiredWidth = maxTextWidth + 32 + 4
			
			// ⚠️ IMPORTANT: Node không bao giờ co lại nhỏ hơn kích thước ban đầu
			if (requiredWidth < maxWidth) {
				// Text chưa đạt maxWidth: mở rộng node đến width cần thiết
				// Nhưng KHÔNG nhỏ hơn kích thước ban đầu
				currentWidth = Math.max(minNodeWidth, Math.min(requiredWidth, maxWidth))
			} else {
				// Text đã đạt hoặc vượt maxWidth: node width = maxWidth, text sẽ wrap
				currentWidth = maxWidth
			}
		}
	}
	
	// Cập nhật width trước để editor có width đúng khi đo height
	rect.attr('width', currentWidth)
	const fo = d3.select(foElement)
	const borderOffset = 4 // 2px border mỗi bên
	const foWidth = Math.max(0, currentWidth - borderOffset)
	fo.attr('x', 2)
	fo.attr('y', 2)
	fo.attr('width', foWidth)
	
	// Đảm bảo editor content có width đúng NGAY LẬP TỨC để tránh text wrap sớm
	const editorInstance = getEditorInstance(renderer, nodeId)
	if (editorInstance && editorInstance.view && editorInstance.view.dom) {
		const editorDOM = editorInstance.view.dom
		const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
		
		if (editorContent) {
			// Set box-sizing để padding được tính đúng
			editorContent.style.boxSizing = 'border-box'
			// Set width ngay lập tức để tránh text wrap sớm
			editorContent.style.width = `${foWidth}px`
			
			// Xác định có cần wrap không dựa trên currentWidth
			// Nếu currentWidth < maxWidth: text chưa đạt max-width, không wrap
			// Nếu currentWidth >= maxWidth: text đã đạt max-width, cho phép wrap
			const willWrap = currentWidth >= maxWidth
			
			// Set white-space dựa trên việc có wrap hay không
			if (willWrap) {
				editorContent.style.whiteSpace = 'pre-wrap' // Cho phép wrap
			} else {
				editorContent.style.whiteSpace = 'nowrap' // Không wrap - text trên 1 dòng
			}
			
			// Force reflow để đảm bảo width và white-space đã được áp dụng
			void editorContent.offsetWidth
		}
	}
	
	// Tính toán height mới dựa trên width và nội dung - tự động mở rộng để hiển thị đủ nội dung
	let currentHeight
	let measuredHeight = singleLineHeight // ⚠️ FIX: Định nghĩa ở ngoài để có thể dùng trong log
	if (isEmpty) {
		// ⚠️ FIX: Khi xóa hết nội dung:
		// - Nếu node có kích thước lớn hơn mặc định (minNodeHeight >= singleLineHeight): giữ lại kích thước đã khóa
		// - Nếu node có kích thước nhỏ hơn mặc định (minNodeHeight < singleLineHeight): dùng kích thước mặc định
		// Điều này đảm bảo node giữ lại kích thước đã khóa nếu lớn hơn mặc định, hoặc dùng mặc định nếu nhỏ hơn
		currentHeight = Math.max(minNodeHeight, singleLineHeight)
		measuredHeight = currentHeight
		console.log('[DEBUG handleEditorInput] Xóa hết nội dung, height giãn ra kích thước:', currentHeight, '(minNodeHeight:', minNodeHeight, 'singleLineHeight:', singleLineHeight, ')')
	} else {
		// ⚠️ FIX: Đo chiều cao trực tiếp từ TipTap editor DOM
		const editorInstance = getEditorInstance(renderer, nodeId)
		measuredHeight = singleLineHeight
		
		if (editorInstance && editorInstance.view && editorInstance.view.dom) {
			const editorDOM = editorInstance.view.dom
			const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
			
			if (editorContent) {
				// ⚠️ CRITICAL FIX: Set styles TRƯỚC KHI đo
				const foWidth = currentWidth - borderOffset
				// ⚠️ CRITICAL: Set overflow: visible TRƯỚC để scrollHeight tính đúng ảnh
				editorContent.style.overflow = 'visible'
				editorContent.style.boxSizing = 'border-box'
				editorContent.style.width = `${foWidth}px`
				editorContent.style.height = 'auto'
				editorContent.style.minHeight = `${singleLineHeight}px`
				editorContent.style.maxHeight = 'none'
				editorContent.style.padding = '8px 16px'
				editorContent.style.whiteSpace = currentWidth >= maxWidth ? 'pre-wrap' : 'nowrap'
				
				// Force reflow NHIỀU LẦN để đảm bảo DOM đã cập nhật
				void editorContent.offsetWidth
				void editorContent.offsetHeight
				void editorContent.scrollHeight
				
				// ⚠️ CRITICAL: Lấy scrollHeight để lấy chiều cao đầy đủ của content (bao gồm cả overflow)
				// scrollHeight = total content height (bao gồm cả phần bị ẩn)
				// offsetHeight = actual rendered height (có thể bị cắt nếu overflow)
				// Dùng scrollHeight để đảm bảo node đủ cao để hiển thị toàn bộ content
				let scrollHeight = editorContent.scrollHeight || editorContent.offsetHeight || 0
				
				// ⚠️ CRITICAL: Nếu có ảnh, đo height bao gồm cả ảnh
				const images = editorContent.querySelectorAll('img')
				const imageWrappers = editorContent.querySelectorAll('.image-wrapper-node')
				
				if (images.length > 0 || imageWrappers.length > 0) {
					// Có ảnh - đo height từ phần tử cuối cùng (có thể là ảnh)
					let maxBottom = scrollHeight
					
					// Đo từ tất cả image wrappers (bao gồm margin)
					imageWrappers.forEach((wrapper) => {
						const wrapperStyle = window.getComputedStyle(wrapper)
						const wrapperMarginBottom = parseFloat(wrapperStyle.marginBottom) || 0
						const wrapperBottom = wrapper.offsetTop + wrapper.offsetHeight + wrapperMarginBottom
						maxBottom = Math.max(maxBottom, wrapperBottom)
					})
					
					// Đo từ tất cả ảnh (nếu không có wrapper)
					images.forEach((img) => {
						const imgStyle = window.getComputedStyle(img)
						const imgMarginBottom = parseFloat(imgStyle.marginBottom) || 0
						const imgBottom = img.offsetTop + img.offsetHeight + imgMarginBottom
						maxBottom = Math.max(maxBottom, imgBottom)
					})
					
					// Dùng maxBottom nếu lớn hơn scrollHeight
					if (maxBottom > scrollHeight) {
						scrollHeight = maxBottom
						console.log('[DEBUG handleEditorInput] Using maxBottom from images:', maxBottom, 'original scrollHeight:', editorContent.scrollHeight)
					}
				}
				
				const contentHeight = Math.max(
					scrollHeight,
					singleLineHeight
				)
				
				measuredHeight = contentHeight
				console.log('[DEBUG handleEditorInput] Final measuredHeight:', measuredHeight, 'scrollHeight:', scrollHeight)
			}
		}
		
		// ⚠️ CRITICAL: Height của node = height của editor (không bị giới hạn bởi minNodeHeight)
		// Chỉ dùng minNodeHeight nếu measuredHeight nhỏ hơn
		currentHeight = Math.max(measuredHeight, minNodeHeight)
	}
	
	// Cập nhật height của node-rect và foreignObject
	rect.attr('height', currentHeight)
	fo.attr('height', Math.max(0, currentHeight - borderOffset))
	
	// ⚠️ CRITICAL: Log kích thước thực tế sau khi cập nhật
	console.log(`📐 [handleEditorInput] Node ${nodeId} size after update:`, {
		rect: { width: currentWidth, height: currentHeight },
		foreignObject: { width: currentWidth - borderOffset, height: Math.max(0, currentHeight - borderOffset) },
		measuredHeight: measuredHeight,
		minNodeHeight: minNodeHeight
	})
	
	// ⚠️ FIX: Cập nhật wrapper và editor container để hiển thị đầy đủ nội dung
	const wrapper = fo.select('.node-content-wrapper')
	wrapper.style('width', '100%')
	wrapper.style('height', 'auto') // Dùng auto để hiển thị đủ nội dung
	wrapper.style('min-height', '0')
	wrapper.style('max-height', 'none')
	wrapper.style('overflow', 'visible') // Visible để hiển thị đủ nội dung
	
	const editorContainer = fo.select('.node-editor-container')
	if (editorContainer.node()) {
		editorContainer.style('width', '100%')
		editorContainer.style('height', 'auto') // Dùng auto để hiển thị đủ nội dung
		editorContainer.style('min-height', '0')
		editorContainer.style('max-height', 'none')
		editorContainer.style('overflow', 'visible') // Visible để hiển thị đủ nội dung
	}
	
	// Cập nhật vị trí nút add-child
	nodeGroup.select('.add-child-btn').attr('cx', currentWidth + 20)
	nodeGroup.select('.add-child-btn').attr('cy', currentHeight / 2)
	nodeGroup.select('.add-child-text').attr('x', currentWidth + 20)
	nodeGroup.select('.add-child-text').attr('y', currentHeight / 2)
	
	// Cập nhật cache với kích thước mới (để các lần tính toán sau dùng)
	renderer.nodeSizeCache.set(nodeId, { width: currentWidth, height: currentHeight })
	
	// Trigger callback để cập nhật dữ liệu
	if (renderer.callbacks.onNodeUpdate) {
		renderer.callbacks.onNodeUpdate(nodeId, { label: value })
	}
}

/**
 * Handler để update style chữ mà không tính toán lại kích thước node
 * Sử dụng khi chỉ thay đổi formatting (bold, italic, underline, color) mà không thay đổi nội dung text
 */
export function handleEditorStyleUpdate(renderer, nodeId, foElement, nodeData) {
	if (!renderer || !nodeId || !foElement || !nodeData) return
	
	const editor = getEditorInstance(renderer, nodeId)
	if (!editor) return
	
	// ⚠️ NEW: Set flag để skip handleEditorInput khi style update
	if (!renderer.isUpdatingStyle) {
		renderer.isUpdatingStyle = new Set()
	}
	renderer.isUpdatingStyle.add(nodeId)
	
	// Lấy HTML hiện tại từ editor (đã có style mới)
	const newHtml = editor.getHTML()
	
	// Cập nhật node data với HTML mới
	if (!nodeData.data) nodeData.data = {}
	nodeData.data.label = newHtml
	
	// KHÔNG tính toán lại kích thước node
	// KHÔNG cập nhật rect, foreignObject
	// CHỈ cập nhật nội dung HTML
	
	// Trigger callback để cập nhật dữ liệu (nhưng không trigger tính toán lại kích thước)
	if (renderer.callbacks.onNodeUpdate) {
		// Pass flag để báo rằng đây chỉ là style update, không cần tính toán lại kích thước
		renderer.callbacks.onNodeUpdate(nodeId, { 
			label: newHtml,
			skipSizeCalculation: true // Flag để skip tính toán lại kích thước
		})
	}
	
	// ⚠️ NEW: Clear flag sau một chút để cho phép input event bình thường sau đó
	setTimeout(() => {
		if (renderer.isUpdatingStyle) {
			renderer.isUpdatingStyle.delete(nodeId)
		}
	}, 100)
}

/**
 * Handler cho editor focus event
 */
export function handleEditorFocus(renderer, nodeId, foElement, nodeData) {
	renderer.selectNode(nodeId)
	
	const nodeGroup = d3.select(foElement.parentNode)
	nodeGroup.raise()
	
	const fo = d3.select(foElement)
	const rect = nodeGroup.select('.node-rect')
	
	const currentText = renderer.getNodeLabel(nodeData)
	const isFirstEdit = !currentText || !currentText.trim()
	
	// ⚠️ IMPORTANT: Lưu kích thước HIỆN TẠI của node khi focus
	// Đây sẽ là kích thước TỐI THIỂU trong suốt quá trình edit
	const currentWidth = parseFloat(rect.attr('width')) || 130
	const currentHeight = parseFloat(rect.attr('height')) || 43
	
	let lockedWidth, lockedHeight
	
	if (isFirstEdit || !currentText || currentText.trim() === 'Nhánh mới') {
		// Lần đầu hoặc text mặc định: dùng kích thước tối thiểu
		lockedWidth = 130
		lockedHeight = 43
	} else {
		// ⚠️ CHANGED: Luôn giữ kích thước hiện tại làm tối thiểu
		// Node sẽ không co lại nhỏ hơn kích thước này khi xóa nội dung
		lockedWidth = currentWidth
		lockedHeight = currentHeight
	}
	
	// ⚠️ NEW: Lưu kích thước ban đầu vào data attribute để sử dụng trong handleEditorInput
	rect.attr('data-initial-width', lockedWidth)
	rect.attr('data-initial-height', lockedHeight)
	
	// Lưu vào cache với key đặc biệt để phân biệt
	renderer.nodeSizeCache.set(`${nodeId}_initial`, { width: lockedWidth, height: lockedHeight })
	renderer.nodeSizeCache.set(nodeId, { width: lockedWidth, height: lockedHeight })
	
	rect.attr('width', lockedWidth)
	rect.attr('height', lockedHeight)
	
	const borderOffset = 4
	fo.attr('x', 2).attr('y', 2)
	fo.attr('width', Math.max(0, lockedWidth - borderOffset))
	fo.attr('height', Math.max(0, lockedHeight - borderOffset))
	
	// ⚠️ FIX: Set wrapper và editor container để hiển thị đầy đủ nội dung
	const wrapper = fo.select('.node-content-wrapper')
	if (wrapper.node()) {
		wrapper.style('width', '100%')
		wrapper.style('height', 'auto') // Dùng auto để hiển thị đủ nội dung
		wrapper.style('min-height', '0')
		wrapper.style('max-height', 'none')
		wrapper.style('overflow', 'visible') // Visible để hiển thị đủ nội dung
	}
	
	const editorContainer = fo.select('.node-editor-container')
	if (editorContainer.node()) {
		editorContainer.style('pointer-events', 'auto')
		editorContainer.style('width', '100%')
		editorContainer.style('height', 'auto') // Dùng auto để hiển thị đủ nội dung
		editorContainer.style('min-height', '0')
		editorContainer.style('max-height', 'none')
		editorContainer.style('overflow', 'visible') // Visible để hiển thị đủ nội dung
	}
	
	// ⚠️ FIX: Đo lại height từ DOM ngay sau khi focus để đảm bảo chính xác
	// Đợi một chút để editor đã render xong
	requestAnimationFrame(() => {
		const editor = getEditorInstance(renderer, nodeId)
		if (editor && editor.view && editor.view.dom) {
			const editorDOM = editor.view.dom
			const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
			
			if (editorContent) {
				const foWidth = lockedWidth - borderOffset
				editorContent.style.cssText = `
					box-sizing: border-box;
					width: ${foWidth}px;
					height: auto;
					min-height: 43px;
					max-height: none;
					overflow: visible;
					padding: 8px 16px;
					white-space: ${lockedWidth >= 400 ? 'pre-wrap' : 'nowrap'};
				`
				
				// Force reflow
				void editorContent.offsetWidth
				void editorContent.offsetHeight
				
				// Đo height thực tế từ DOM - dùng scrollHeight để lấy chiều cao đầy đủ
				const actualHeight = Math.max(
					editorContent.scrollHeight || editorContent.offsetHeight || 0,
					43 // singleLineHeight
				)
				
				// Cập nhật height nếu khác
				if (Math.abs(actualHeight - lockedHeight) > 1) {
					rect.attr('height', actualHeight)
					fo.attr('height', Math.max(0, actualHeight - borderOffset))
					renderer.nodeSizeCache.set(nodeId, { width: lockedWidth, height: actualHeight })
					
					// Cập nhật vị trí nút add-child
					nodeGroup.select('.add-child-btn').attr('cy', actualHeight / 2)
					nodeGroup.select('.add-child-text').attr('y', actualHeight / 2)
				}
			}
		}
	})
	
	// Add focused class
	const editorInstance = getEditorInstance(renderer, nodeId)
	if (editorInstance && editorInstance.view && editorInstance.view.dom) {
		const editorDOM = editorInstance.view.dom
		editorDOM.classList.add('ProseMirror-focused')
		
		// ⚠️ NEW: Set editor DOM overflow visible
		const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
		if (editorContent) {
			editorContent.style.overflow = 'visible'
			editorContent.style.height = 'auto'
			editorContent.style.minHeight = '43px'
			editorContent.style.maxHeight = 'none'
		}
	}
	
	// Select all nếu là text mặc định
	const isDefaultText = currentText === 'Nhánh mới' || (isFirstEdit && currentText)
	if (isDefaultText) {
		setTimeout(() => {
			const editorInstance = getEditorInstance(renderer, nodeId)
			if (editorInstance && editorInstance.view) {
				const { state } = editorInstance.view
				const { doc } = state
				
				if (doc.content.size > 0) {
					const selection = TextSelection.create(doc, 0, doc.content.size)
					const tr = state.tr.setSelection(selection)
					editorInstance.view.dispatch(tr)
				}
			}
		}, 50)
	}
	
	if (renderer.callbacks.onNodeEditingStart) {
		renderer.callbacks.onNodeEditingStart(nodeId)
		renderer.editingNode = nodeId
	}
}

/**
 * Handler cho editor blur event
 */
export function handleEditorBlur(renderer, nodeId, foElement, nodeData) {
	// ⚠️ IMPORTANT: Xóa cache kích thước ban đầu khi blur
	renderer.nodeSizeCache.delete(`${nodeId}_initial`)
	
	// Tương tự textarea on('blur') handler
	const editor = getEditorInstance(renderer, nodeId)
	// Lưu HTML để giữ formatting (bold, italic, etc.)
	let finalValue = editor ? editor.getHTML() : (nodeData.data?.label || '')
	
	const nodeGroup = d3.select(foElement.parentNode)
	const rect = nodeGroup.select('.node-rect')
	
	// Check isEmpty: extract plain text từ HTML nếu cần
	let isEmpty = !finalValue || !finalValue.trim()
	if (!isEmpty && finalValue.includes('<')) {
		// Nếu là HTML, extract plain text để check empty
		const tempDiv = document.createElement('div')
		tempDiv.innerHTML = finalValue
		const plainText = (tempDiv.textContent || tempDiv.innerText || '').trim()
		isEmpty = !plainText || plainText === ''
	}
	const isRootNode = nodeData.data?.isRoot || nodeId === 'root'
	const maxWidth = 400
	const minWidth = 130
	const singleLineHeight = Math.ceil(19 * 1.4) + 16
	
	let finalWidth, finalHeight
	
	if (isEmpty) {
		// ⚠️ FIX: Nếu node root rỗng, tự động điền "Sơ đồ"
		if (isRootNode) {
			const defaultText = 'Sơ đồ'
			const defaultHtml = `<p>${defaultText}</p>`
			// Cập nhật editor với text mặc định
			if (editor) {
				editor.commands.setContent(defaultHtml)
			}
			// Cập nhật finalValue để đảm bảo được lưu đúng
			finalValue = defaultHtml
			// Cập nhật nodeData với text mặc định
			if (!nodeData.data) nodeData.data = {}
			nodeData.data.label = defaultHtml
			
			// Tính toán lại kích thước dựa trên "Sơ đồ"
			const tempNode = { ...nodeData, data: { ...nodeData.data, label: `<p>${defaultText}</p>` } }
			if (tempNode.data) {
				delete tempNode.data.fixedWidth
				delete tempNode.data.fixedHeight
			}
			
			// Tính toán width và height dựa trên "Sơ đồ"
			const absoluteMinWidth = 50
			let measuredWidth = absoluteMinWidth
			let measuredHeight = singleLineHeight
			
			// Đo width của "Sơ đồ"
			const textSpan = document.createElement('span')
			textSpan.style.cssText = `
				position: absolute;
				visibility: hidden;
				white-space: nowrap;
				font-size: 19px;
				font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
			`
			textSpan.textContent = defaultText
			document.body.appendChild(textSpan)
			void textSpan.offsetHeight
			const textWidth = textSpan.offsetWidth
			document.body.removeChild(textSpan)
			
			// Padding: 16px mỗi bên = 32px, border: 2px mỗi bên = 4px
			const requiredWidth = textWidth + 32 + 4
			measuredWidth = Math.max(absoluteMinWidth, Math.min(requiredWidth, maxWidth))
			
			finalWidth = measuredWidth
			finalHeight = measuredHeight
			
			// ⚠️ CRITICAL: Set white-space ngay sau khi điền "Sơ đồ" để đảm bảo text không xuống dòng
			// Đợi editor cập nhật xong trước khi set white-space
			if (editor && editor.view && editor.view.dom) {
				requestAnimationFrame(() => {
					const editorDOM = editor.view.dom
					const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
					if (editorContent) {
						// Với "Sơ đồ", width sẽ < maxWidth, nên dùng nowrap
						editorContent.style.setProperty('white-space', 'nowrap', 'important')
						editorContent.style.setProperty('overflow', 'hidden', 'important')
						editorContent.style.setProperty('width', `${finalWidth - 4}px`, 'important') // borderOffset = 4
					}
				})
			}
		} else {
			// Node không phải root: dùng kích thước mặc định
			finalWidth = minWidth
			finalHeight = singleLineHeight
		}
	} else {
		const tempNode = { ...nodeData, data: { ...nodeData.data, label: finalValue } }
		if (tempNode.data) {
			delete tempNode.data.fixedWidth
			delete tempNode.data.fixedHeight
		}
		
		// ⚠️ CRITICAL: Đo width và height chính xác từ DOM để fit với nội dung
		const absoluteMinWidth = 50 // Giá trị tối thiểu để không vỡ layout (giảm từ 80px để fit tốt hơn với nội dung ngắn)
		let measuredWidth = absoluteMinWidth
		let measuredHeight = singleLineHeight
		let hasMeasuredFromDOM = false // Flag để đánh dấu đã đo được width từ DOM chưa
		let hasMeasuredHeightFromDOM = false // Flag để đánh dấu đã đo được height từ DOM chưa
		
		console.log('[DEBUG handleEditorBlur] Node:', nodeId, 'finalValue:', finalValue)
		
		if (editor && editor.view && editor.view.dom) {
			const editorDOM = editor.view.dom
			const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
			if (editorContent) {
				// ⚠️ STEP 1: Đo width chính xác từ nội dung thực tế
				// Parse HTML để lấy text và đo width của từng dòng
				let titleText = ''
				let descriptionText = ''
				
				console.log('[DEBUG handleEditorBlur] Bắt đầu parse HTML, finalValue:', finalValue)
				
				if (finalValue.includes('<')) {
					const tempDiv = document.createElement('div')
					tempDiv.innerHTML = finalValue
					const paragraphs = tempDiv.querySelectorAll('p')
					paragraphs.forEach(p => {
						let inBlockquote = false
						let parent = p.parentElement
						while (parent && parent !== tempDiv) {
							if (parent.tagName === 'BLOCKQUOTE') {
								inBlockquote = true
								break
							}
							parent = parent.parentElement
						}
						if (!inBlockquote) {
							const paraText = (p.textContent || p.innerText || '').trim()
							if (paraText) {
								titleText += (titleText ? '\n' : '') + paraText
							}
						}
					})
					const blockquotes = tempDiv.querySelectorAll('blockquote')
					blockquotes.forEach(bq => {
						const bqText = (bq.textContent || bq.innerText || '').trim()
						if (bqText) {
							descriptionText += (descriptionText ? '\n' : '') + bqText
						}
					})
					// Nếu không có paragraph, lấy text trực tiếp từ div
					if (!titleText && !descriptionText) {
						titleText = (tempDiv.textContent || tempDiv.innerText || '').trim()
					}
				} else {
					titleText = finalValue.trim()
				}
				
				console.log('[DEBUG handleEditorBlur] Sau khi parse - titleText:', titleText, 'descriptionText:', descriptionText)
				
				// Đo width của title (font-size 19px)
				let maxTitleWidth = 0
				if (titleText) {
					const titleLines = titleText.split('\n')
					titleLines.forEach(line => {
						if (line.trim()) {
							const lineSpan = document.createElement('span')
							lineSpan.style.cssText = `
								position: absolute;
								visibility: hidden;
								white-space: nowrap;
								font-size: 19px;
								font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
							`
							lineSpan.textContent = line.trim()
							document.body.appendChild(lineSpan)
							void lineSpan.offsetHeight
							maxTitleWidth = Math.max(maxTitleWidth, lineSpan.offsetWidth)
							document.body.removeChild(lineSpan)
						}
					})
				}
				
				// Đo width của description (font-size 16px)
				let maxDescWidth = 0
				if (descriptionText) {
					const descLines = descriptionText.split('\n')
					descLines.forEach(line => {
						if (line.trim()) {
							const lineSpan = document.createElement('span')
							lineSpan.style.cssText = `
								position: absolute;
								visibility: hidden;
								white-space: nowrap;
								font-size: 16px;
								font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
							`
							lineSpan.textContent = line.trim()
							document.body.appendChild(lineSpan)
							void lineSpan.offsetHeight
							maxDescWidth = Math.max(maxDescWidth, lineSpan.offsetWidth)
							document.body.removeChild(lineSpan)
						}
					})
				}
				
				// Lấy width lớn nhất giữa title và description
				const maxTextWidth = Math.max(maxTitleWidth, maxDescWidth)
				
				// ⚠️ Kiểm tra xem có ảnh trong editor không
				// editorContent có thể là .mindmap-editor-prose hoặc chứa .mindmap-editor-prose
				let proseElement = editorContent
				if (editorContent.classList && !editorContent.classList.contains('mindmap-editor-prose')) {
					proseElement = editorContent.querySelector('.mindmap-editor-prose')
				}
				// Kiểm tra ảnh trong proseElement hoặc trong editorContent
				const imagesInProse = proseElement ? proseElement.querySelectorAll('img').length : 0
				const imagesInContent = editorContent.querySelectorAll('img').length
				const hasImages = imagesInProse > 0 || imagesInContent > 0
				
				// Kiểm tra thêm trong HTML content của editor nếu có
				let hasImagesInHTML = false
				if (editor && editor.getHTML) {
					const html = editor.getHTML()
					hasImagesInHTML = html.includes('<img') || html.includes('<image')
				}
				
				const finalHasImages = hasImages || hasImagesInHTML
				
				console.log('[DEBUG handleEditorBlur] Đo width - maxTitleWidth:', maxTitleWidth, 'maxDescWidth:', maxDescWidth, 'maxTextWidth:', maxTextWidth, 'hasImages:', finalHasImages, 'imagesInProse:', imagesInProse, 'imagesInContent:', imagesInContent, 'hasImagesInHTML:', hasImagesInHTML)
				
				// Nếu có ảnh, node PHẢI có width = 400px (maxWidth)
				// Không cần đo scrollWidth, chỉ cần force width = 400px
				if (finalHasImages) {
					measuredWidth = maxWidth // 400px
					console.log('[DEBUG handleEditorBlur] Có ảnh - Force width = 400px, measuredWidth:', measuredWidth)
					// ⚠️ KHÔNG clamp khi có ảnh, vì đã force = maxWidth
				} else if (maxTextWidth === 0) {
					// Nếu không có text và không có ảnh, dùng absoluteMinWidth
					measuredWidth = absoluteMinWidth
					console.log('[DEBUG handleEditorBlur] Không có text, dùng absoluteMinWidth:', absoluteMinWidth)
					// Clamp width giữa absoluteMinWidth và maxWidth
					measuredWidth = Math.min(measuredWidth, maxWidth)
				} else {
					// Padding: 16px mỗi bên = 32px, border: 2px mỗi bên = 4px
					const requiredWidth = maxTextWidth + 32 + 4
					// Cho phép node thu nhỏ xuống fit với nội dung
					// Chỉ clamp với absoluteMinWidth nếu requiredWidth quá nhỏ (< 40px)
					// Nếu requiredWidth >= 40px thì dùng trực tiếp để fit chính xác với nội dung
					const minRequiredWidth = 40 // Giá trị tối thiểu hợp lý cho requiredWidth
					if (requiredWidth < minRequiredWidth) {
						measuredWidth = Math.max(requiredWidth, absoluteMinWidth)
					} else {
						measuredWidth = requiredWidth // Dùng trực tiếp để fit chính xác
					}
					console.log('[DEBUG handleEditorBlur] Tính toán width - maxTextWidth:', maxTextWidth, 'requiredWidth:', requiredWidth, 'measuredWidth (trước clamp):', measuredWidth)
					// Clamp width giữa absoluteMinWidth và maxWidth
					measuredWidth = Math.min(measuredWidth, maxWidth)
				}
				console.log('[DEBUG handleEditorBlur] measuredWidth (sau clamp):', measuredWidth, 'maxWidth:', maxWidth, 'hasImages:', finalHasImages)
				
				// Đánh dấu đã đo được từ DOM
				hasMeasuredFromDOM = true
				
				// ⚠️ STEP 2: Set width chính xác và đo height
				const borderOffset = 4
				const foWidth = measuredWidth - borderOffset
				
				// Set styles để đo height chính xác
				editorContent.style.boxSizing = 'border-box'
				editorContent.style.setProperty('width', `${foWidth}px`, 'important')
				editorContent.style.height = 'auto'
				editorContent.style.minHeight = '0'
				editorContent.style.maxHeight = 'none'
				editorContent.style.padding = '8px 16px'
				editorContent.style.margin = '0'
				
				// Xác định white-space dựa trên width
				// Nếu width < maxWidth: dùng nowrap để text không xuống dòng
				// Nếu width >= maxWidth: dùng pre-wrap để text có thể wrap
				const whiteSpaceValue = (measuredWidth >= maxWidth) ? 'pre-wrap' : 'nowrap'
				editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
				// ⚠️ CRITICAL: Set white-space cho tất cả các p bên trong để đảm bảo text không xuống dòng
				const paragraphs = editorContent.querySelectorAll('p')
				paragraphs.forEach(p => {
					p.style.setProperty('white-space', whiteSpaceValue, 'important')
				})
				if (measuredWidth >= maxWidth) {
					editorContent.style.setProperty('word-wrap', 'break-word', 'important')
					editorContent.style.setProperty('overflow-wrap', 'break-word', 'important')
					editorContent.style.setProperty('overflow', 'visible', 'important')
				} else {
					editorContent.style.setProperty('overflow', 'hidden', 'important')
				}
				
				// Force reflow để đảm bảo width và white-space đã được set
				void editorContent.offsetWidth
				void editorContent.offsetHeight
				void editorContent.scrollHeight
				
				// ⚠️ STEP 3: Đo height chính xác từ scrollHeight để lấy chiều cao đầy đủ
				// Dùng scrollHeight thay vì offsetHeight để đảm bảo lấy được toàn bộ content height
				let scrollHeight = editorContent.scrollHeight || editorContent.offsetHeight || 0
				
				// ⚠️ CRITICAL: Nếu có ảnh, đo height bao gồm cả ảnh
				const images = editorContent.querySelectorAll('img')
				const imageWrappers = editorContent.querySelectorAll('.image-wrapper-node')
				
				if (images.length > 0 || imageWrappers.length > 0) {
					// Có ảnh - đo height từ phần tử cuối cùng (có thể là ảnh)
					let maxBottom = scrollHeight
					
					// Đo từ tất cả image wrappers (bao gồm margin)
					imageWrappers.forEach((wrapper) => {
						const wrapperStyle = window.getComputedStyle(wrapper)
						const wrapperMarginBottom = parseFloat(wrapperStyle.marginBottom) || 0
						const wrapperBottom = wrapper.offsetTop + wrapper.offsetHeight + wrapperMarginBottom
						maxBottom = Math.max(maxBottom, wrapperBottom)
					})
					
					// Đo từ tất cả ảnh (nếu không có wrapper)
					images.forEach((img) => {
						const imgStyle = window.getComputedStyle(img)
						const imgMarginBottom = parseFloat(imgStyle.marginBottom) || 0
						const imgBottom = img.offsetTop + img.offsetHeight + imgMarginBottom
						maxBottom = Math.max(maxBottom, imgBottom)
					})
					
					// Dùng maxBottom nếu lớn hơn scrollHeight
					if (maxBottom > scrollHeight) {
						scrollHeight = maxBottom
						console.log('[DEBUG handleEditorBlur] Using maxBottom from images:', maxBottom, 'original scrollHeight:', editorContent.scrollHeight)
					}
				}
				
				measuredHeight = Math.max(
					scrollHeight,
					singleLineHeight
				)
				// Đánh dấu đã đo được height từ DOM
				hasMeasuredHeightFromDOM = true
				console.log('[DEBUG handleEditorBlur] Đo height - scrollHeight:', scrollHeight, 'measuredHeight:', measuredHeight, 'singleLineHeight:', singleLineHeight, 'images.length:', images.length, 'imageWrappers.length:', imageWrappers.length)
			}
			
			// Remove focused class
			editorDOM.classList.remove('ProseMirror-focused')
		}
		
		// ⚠️ FIX: Fallback CHỈ KHI không đo được từ DOM (hasMeasuredFromDOM === false)
		// ⚠️ NHƯNG: Nếu có ảnh, LUÔN set width = 400px, không dùng fallback
		if (!hasMeasuredFromDOM && finalValue && finalValue.trim()) {
			// Kiểm tra xem có ảnh không để quyết định có dùng fallback không
			const editorDOM = editor && editor.view && editor.view.dom ? editor.view.dom : null
			const editorContent = editorDOM ? (editorDOM.querySelector('.mindmap-editor-prose') || editorDOM) : null
			
			// Kiểm tra ảnh trong editorContent
			let proseElement = editorContent
			if (editorContent && editorContent.classList && !editorContent.classList.contains('mindmap-editor-prose')) {
				proseElement = editorContent.querySelector('.mindmap-editor-prose')
			}
			const imagesInProse = proseElement ? proseElement.querySelectorAll('img').length : 0
			const imagesInContent = editorContent ? editorContent.querySelectorAll('img').length : 0
			const hasImages = imagesInProse > 0 || imagesInContent > 0
			
			// Kiểm tra thêm trong HTML content của editor nếu có
			let hasImagesInHTML = false
			if (editor && editor.getHTML) {
				const html = editor.getHTML()
				hasImagesInHTML = html.includes('<img') || html.includes('<image')
			}
			
			const finalHasImages = hasImages || hasImagesInHTML
			
			if (finalHasImages) {
				// Có ảnh, LUÔN set width = 400px
				measuredWidth = maxWidth
				console.log('[DEBUG handleEditorBlur] Fallback - Có ảnh, force width = 400px. measuredWidth:', measuredWidth)
			} else {
				console.log('[DEBUG handleEditorBlur] Fallback - KHÔNG đo được từ DOM, dùng estimateNodeWidth')
				const calculatedWidth = renderer.estimateNodeWidth(tempNode, maxWidth)
				// Cho phép thu nhỏ xuống absoluteMinWidth
				measuredWidth = Math.max(calculatedWidth, absoluteMinWidth)
				measuredWidth = Math.min(measuredWidth, maxWidth)
				console.log('[DEBUG handleEditorBlur] Fallback - calculatedWidth:', calculatedWidth, 'measuredWidth:', measuredWidth)
			}
		} else if (hasMeasuredFromDOM) {
			console.log('[DEBUG handleEditorBlur] Đã đo được từ DOM, KHÔNG dùng fallback. measuredWidth:', measuredWidth)
		}
		// ⚠️ FIX: Fallback height CHỈ KHI không đo được từ DOM (hasMeasuredHeightFromDOM === false)
		if (!hasMeasuredHeightFromDOM && finalValue && finalValue.trim()) {
			console.log('[DEBUG handleEditorBlur] Fallback height - KHÔNG đo được từ DOM, dùng estimateNodeHeight')
			const calculatedHeight = renderer.estimateNodeHeight(tempNode, measuredWidth)
			measuredHeight = Math.max(calculatedHeight, singleLineHeight)
			console.log('[DEBUG handleEditorBlur] Fallback height - calculatedHeight:', calculatedHeight, 'measuredHeight:', measuredHeight)
		} else if (hasMeasuredHeightFromDOM) {
			console.log('[DEBUG handleEditorBlur] Đã đo được height từ DOM, KHÔNG dùng fallback. measuredHeight:', measuredHeight)
		}
		
		// ⚠️ FINAL CHECK: Nếu có ảnh, LUÔN đảm bảo width = 400px
		// Kiểm tra lại một lần nữa để chắc chắn
		if (editor && editor.view && editor.view.dom) {
			const editorDOM = editor.view.dom
			const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
			
			let proseElement = editorContent
			if (editorContent.classList && !editorContent.classList.contains('mindmap-editor-prose')) {
				proseElement = editorContent.querySelector('.mindmap-editor-prose')
			}
			const imagesInProse = proseElement ? proseElement.querySelectorAll('img').length : 0
			const imagesInContent = editorContent.querySelectorAll('img').length
			const hasImages = imagesInProse > 0 || imagesInContent > 0
			
			let hasImagesInHTML = false
			if (editor && editor.getHTML) {
				const html = editor.getHTML()
				hasImagesInHTML = html.includes('<img') || html.includes('<image')
			}
			
			const finalHasImages = hasImages || hasImagesInHTML
			
			if (finalHasImages && measuredWidth !== maxWidth) {
				console.log('[DEBUG handleEditorBlur] ⚠️ FINAL CHECK - Có ảnh nhưng measuredWidth không phải 400px, force lại. measuredWidth:', measuredWidth, '->', maxWidth)
				measuredWidth = maxWidth
			}
		}
		
		finalWidth = measuredWidth
		finalHeight = measuredHeight
		
		console.log('[DEBUG handleEditorBlur] KẾT QUẢ CUỐI CÙNG - finalWidth:', finalWidth, 'finalHeight:', finalHeight, 'nodeId:', nodeId)
		
		// Update cache TRƯỚC KHI clear editingNode
		renderer.nodeSizeCache.set(nodeId, { width: finalWidth, height: finalHeight })
	}
	
	// ⚠️ CRITICAL: Log kích thước thực tế sau khi cập nhật
	// Đợi một chút để DOM đã cập nhật
	setTimeout(() => {
		const nodeGroup = d3.select(foElement.parentNode)
		const rect = nodeGroup.select('.node-rect')
		const fo = nodeGroup.select('.node-text')
		if (rect.node() && fo.node()) {
			const rectWidth = parseFloat(rect.attr('width')) || 0
			const rectHeight = parseFloat(rect.attr('height')) || 0
			const foWidth = parseFloat(fo.attr('width')) || 0
			const foHeight = parseFloat(fo.attr('height')) || 0
			console.log(`📐 [handleEditorBlur] Node ${nodeId} actual size after update:`, {
				rect: { width: rectWidth, height: rectHeight },
				foreignObject: { width: foWidth, height: foHeight },
				finalWidth: finalWidth,
				finalHeight: finalHeight
			})
		}
	}, 200)
	
	// Cập nhật node data
	if (nodeData.data) {
		nodeData.data.label = finalValue
		// Root node không lưu fixedWidth/fixedHeight để luôn tính toán lại dựa trên nội dung mới
		// Điều này đảm bảo root node có thể hiển thị đầy đủ nội dung nhiều dòng
		if (!isRootNode) {
			nodeData.data.fixedWidth = finalWidth
			nodeData.data.fixedHeight = finalHeight
		} else {
			// Root node: xóa fixedWidth/fixedHeight để tính toán lại
			delete nodeData.data.fixedWidth
			delete nodeData.data.fixedHeight
			// Cache sẽ được cập nhật ở dưới
		}
		nodeData.data.keepSingleLine = (finalWidth < maxWidth)
	}
	
	rect.attr('width', finalWidth)
	rect.attr('height', finalHeight)
	
	// Cập nhật vị trí nút add-child
	nodeGroup.select('.add-child-btn').attr('cx', finalWidth + 20)
	nodeGroup.select('.add-child-btn').attr('cy', finalHeight / 2)
	nodeGroup.select('.add-child-text').attr('x', finalWidth + 20)
	nodeGroup.select('.add-child-text').attr('y', finalHeight / 2)
	
	const fo = d3.select(foElement)
	const borderOffset = 4
	fo.attr('width', Math.max(0, finalWidth - borderOffset))
	fo.attr('height', Math.max(0, finalHeight - borderOffset))
	
	// ⚠️ CRITICAL: Log kích thước thực tế sau khi cập nhật
	console.log(`📐 [handleEditorBlur] Node ${nodeId} size after update:`, {
		rect: { width: finalWidth, height: finalHeight },
		foreignObject: { width: Math.max(0, finalWidth - borderOffset), height: Math.max(0, finalHeight - borderOffset) },
		finalWidth: finalWidth,
		finalHeight: finalHeight
	})
	
	// ⚠️ CRITICAL: Set white-space ngay sau khi blur để đảm bảo text wrap đúng
	// Nếu width < maxWidth: dùng nowrap để text không xuống dòng
	// Nếu width >= maxWidth: dùng pre-wrap để text có thể wrap
	if (editor && editor.view && editor.view.dom) {
		const editorDOM = editor.view.dom
		const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
		if (editorContent) {
			const whiteSpaceValue = (finalWidth >= maxWidth) ? 'pre-wrap' : 'nowrap'
			if (finalWidth >= maxWidth) {
				// ⚠️ CRITICAL: Set với !important để không bị CSS override
				editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
				editorContent.style.setProperty('word-wrap', 'break-word', 'important')
				editorContent.style.setProperty('overflow-wrap', 'break-word', 'important')
				editorContent.style.setProperty('overflow', 'visible', 'important')
				editorContent.style.setProperty('max-height', 'none', 'important')
			} else {
				// Width < maxWidth: dùng nowrap để text không xuống dòng
				editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
				editorContent.style.setProperty('overflow', 'hidden', 'important')
			}
			// ⚠️ CRITICAL: Set white-space cho tất cả các p bên trong để đảm bảo text không xuống dòng
			const paragraphs = editorContent.querySelectorAll('p')
			paragraphs.forEach(p => {
				p.style.setProperty('white-space', whiteSpaceValue, 'important')
			})
		}
	}
	
	// ⚠️ FIX: Đợi một chút và đo lại height để đảm bảo chính xác
	if (editor && editor.view && editor.view.dom) {
		const editorDOM = editor.view.dom
		const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
		if (editorContent) {
			setTimeout(() => {
				// ⚠️ CRITICAL: Đảm bảo width và white-space đúng trước khi đo
				const borderOffset = 4
				const foWidth = finalWidth - borderOffset
				editorContent.style.setProperty('width', `${foWidth}px`, 'important')
				
				// Nếu width < maxWidth: dùng nowrap để text không xuống dòng
				// Nếu width >= maxWidth: dùng pre-wrap để text có thể wrap
				const whiteSpaceValue = (finalWidth >= maxWidth) ? 'pre-wrap' : 'nowrap'
				if (finalWidth >= maxWidth) {
					// ⚠️ CRITICAL: Set với !important để không bị CSS override
					editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
					editorContent.style.setProperty('word-wrap', 'break-word', 'important')
					editorContent.style.setProperty('overflow-wrap', 'break-word', 'important')
					editorContent.style.setProperty('overflow', 'visible', 'important')
					editorContent.style.setProperty('max-height', 'none', 'important')
				} else {
					// Width < maxWidth: dùng nowrap để text không xuống dòng
					editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
					editorContent.style.setProperty('overflow', 'hidden', 'important')
				}
				// ⚠️ CRITICAL: Set white-space cho tất cả các p bên trong để đảm bảo text không xuống dòng
				const paragraphs = editorContent.querySelectorAll('p')
				paragraphs.forEach(p => {
					p.style.setProperty('white-space', whiteSpaceValue, 'important')
				})
				
				// Force reflow để đảm bảo DOM đã cập nhật
				void editorContent.offsetWidth
				void editorContent.offsetHeight
				
				// Đo lại height sau khi DOM đã cập nhật hoàn toàn
				// Dùng scrollHeight để lấy chiều cao đầy đủ của content
				const actualHeight = Math.max(
					editorContent.scrollHeight || editorContent.offsetHeight || 0,
					singleLineHeight
				)
				
				// Chỉ cập nhật nếu khác biệt đáng kể (> 1px)
				if (Math.abs(actualHeight - finalHeight) > 1) {
					const updatedHeight = actualHeight
					
					// Cập nhật lại node size
					rect.attr('height', updatedHeight)
					fo.attr('height', Math.max(0, updatedHeight - borderOffset))
					
					// ⚠️ CRITICAL: Với root node, đảm bảo wrapper và container có height đúng
					if (isRootNode) {
						const wrapper = fo.select('.node-content-wrapper')
						if (wrapper.node()) {
							wrapper.style('height', 'auto')
							wrapper.style('min-height', '0')
							wrapper.style('max-height', 'none')
							wrapper.style('overflow', 'visible')
						}
						const editorContainer = fo.select('.node-editor-container')
						if (editorContainer.node()) {
							editorContainer.style('height', 'auto')
							editorContainer.style('min-height', '0')
							editorContainer.style('max-height', 'none')
							editorContainer.style('overflow', 'visible')
						}
					}
					
					// Cập nhật cache
					renderer.nodeSizeCache.set(nodeId, { width: finalWidth, height: updatedHeight })
					
					// Cập nhật vị trí nút add-child
					nodeGroup.select('.add-child-btn').attr('cy', updatedHeight / 2)
					nodeGroup.select('.add-child-text').attr('y', updatedHeight / 2)
					
					// Cập nhật fixedHeight nếu không phải root node
					if (nodeData.data && !isRootNode) {
						nodeData.data.fixedHeight = updatedHeight
					}
				}
			}, 50)
		}
	}
	
	// Đảm bảo wrapper và editor container có height đúng để hiển thị đầy đủ nội dung
	// ⚠️ CRITICAL: Tất cả các node đều dùng auto để hiển thị đầy đủ nội dung (bao gồm ảnh)
	const wrapper = fo.select('.node-content-wrapper')
	if (wrapper.node()) {
		wrapper.style('width', '100%')
		wrapper.style('height', 'auto') // Tất cả node dùng auto
		wrapper.style('min-height', '0')
		wrapper.style('max-height', 'none')
		wrapper.style('overflow', 'visible') // Tất cả node dùng visible
	}
	
	// Disable pointer events
	const editorContainer = fo.select('.node-editor-container')
	if (editorContainer.node()) {
		editorContainer.style('pointer-events', 'none')
			.style('width', '100%')
			.style('height', 'auto') // Tất cả node dùng auto
			.style('min-height', '0')
			.style('max-height', 'none')
			.style('overflow', 'visible') // Tất cả node dùng visible
	}
	
	// ⚠️ FIX: Set editor content styles để height vừa khít, không thừa
	if (editor && editor.view && editor.view.dom) {
		const editorDOM = editor.view.dom
		const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
		if (editorContent) {
			const borderOffset = 4
			const foWidth = finalWidth - borderOffset
			
			// Set styles để height vừa khít với nội dung
			// ⚠️ CRITICAL: Với root node, LUÔN dùng pre-wrap để hiển thị đầy đủ nội dung
			const whiteSpaceValue = isRootNode ? 'pre-wrap' : (finalWidth >= maxWidth ? 'pre-wrap' : 'nowrap')
			editorContent.style.cssText = `
				box-sizing: border-box;
				width: ${foWidth}px;
				height: auto;
				min-height: ${singleLineHeight}px;
				max-height: none;
				overflow: visible;
				padding: 8px 16px;
				margin: 0;
				word-wrap: break-word;
				overflow-wrap: break-word;
			`
			// ⚠️ CRITICAL: Set white-space với !important để không bị CSS override
			editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
			
			// Force reflow để đảm bảo height được tính đúng
			void editorContent.offsetWidth
			void editorContent.offsetHeight
			
			// ⚠️ FIX: Đo lại height từ DOM và cập nhật nếu cần
			// Dùng scrollHeight để lấy chiều cao đầy đủ của content
			const actualHeight = Math.max(
				editorContent.scrollHeight || editorContent.offsetHeight || 0,
				singleLineHeight
			)
			
			// Nếu height thực tế khác với finalHeight, cập nhật lại
			if (Math.abs(actualHeight - finalHeight) > 1) {
				finalHeight = actualHeight
				rect.attr('height', finalHeight)
				fo.attr('height', Math.max(0, finalHeight - borderOffset))
				renderer.nodeSizeCache.set(nodeId, { width: finalWidth, height: finalHeight })
			}
			
			// ⚠️ CRITICAL: Với root node, LUÔN đảm bảo wrapper và container có height đúng
			// (không chỉ khi height thay đổi, mà LUÔN set lại để đảm bảo không bị reset)
			if (isRootNode) {
				const wrapper = fo.select('.node-content-wrapper')
				if (wrapper.node()) {
					wrapper.style('height', 'auto')
					wrapper.style('min-height', '0')
					wrapper.style('max-height', 'none')
					wrapper.style('overflow', 'visible')
				}
				const editorContainer = fo.select('.node-editor-container')
				if (editorContainer.node()) {
					editorContainer.style('height', 'auto')
					editorContainer.style('min-height', '0')
					editorContainer.style('max-height', 'none')
					editorContainer.style('overflow', 'visible')
				}
			}
			
			// Cập nhật vị trí nút add-child
			nodeGroup.select('.add-child-btn').attr('cy', finalHeight / 2)
			nodeGroup.select('.add-child-text').attr('y', finalHeight / 2)
		}
	}
	
	// Update cache TRƯỚC KHI clear editingNode để đảm bảo cache được cập nhật
	renderer.nodeSizeCache.set(nodeId, { width: finalWidth, height: finalHeight })
	
	// Clear editingNode SAU KHI update cache để tránh nháy
	renderer.editingNode = null
	
	// Trigger callback
	if (renderer.callbacks.onNodeEditingEnd) {
		renderer.callbacks.onNodeEditingEnd(nodeId, finalValue)
	}
	
	// Không gọi render() ngay lập tức để tránh nháy
	// Layout sẽ được cập nhật bởi callback onNodeEditingEnd trong MindMap.vue
	// thông qua updateD3RendererWithDelay
}

