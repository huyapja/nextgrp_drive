/**
 * Node Editor Management
 * Handles mounting/unmounting Vue TipTap editor components and editor event handlers
 */

import MindmapNodeEditor from '@/components/MindmapNodeEditor.vue'
import * as d3 from 'd3'
import { TextSelection } from 'prosemirror-state'
import { createApp } from 'vue'
import { calculateNodeHeightWithImages } from './nodeSize.js'

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
	// ⚠️ CRITICAL FIX: Skip nếu đang tính toán height để tránh recalculate đồng thời
	if (!renderer.isCalculatingNodeHeight) {
		renderer.isCalculatingNodeHeight = new Map()
	}
	
	if (renderer.isCalculatingNodeHeight.has(nodeId)) {
		
		return
	}
	
	// Set flag để tránh recalculate đồng thời
	renderer.isCalculatingNodeHeight.set(nodeId, true)
	
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
		// Reset flag
		renderer.isCalculatingNodeHeight.delete(nodeId)
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
	
	
	// ⚠️ STEP 1: Kiểm tra xem có ảnh không
	const hasImages = value.includes('<img') || value.includes('image-wrapper')
	
	// Tính toán width mới dựa trên nội dung
	let newWidth = minWidth
	if (!isEmpty) {
		if (hasImages) {
			// Có ảnh → width = maxWidth (400px) để hiển thị ảnh tối đa
			newWidth = maxWidth
		} else {
			// Không có ảnh → tính toán width dựa trên text
			const tempNode = { ...nodeData, data: { ...nodeData.data, label: value } }
			newWidth = renderer.estimateNodeWidth(tempNode, maxWidth)
			newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth))
		}
	}
	
	// XỬ LÝ WIDTH: Node không co lại nhỏ hơn kích thước ban đầu
	let currentWidth
	if (isEmpty) {
		// ⚠️ FIX: Khi xóa hết nội dung:
		// - Nếu node có kích thước lớn hơn mặc định (minNodeWidth >= minWidth): giữ lại kích thước đã khóa
		// - Nếu node có kích thước nhỏ hơn mặc định (minNodeWidth < minWidth): dùng kích thước mặc định
		const currentRectWidth = parseFloat(rect.attr('width')) || minWidth
		
		// Nếu kích thước đã khóa >= kích thước mặc định: giữ lại kích thước đã khóa
		// Nếu kích thước đã khóa < kích thước mặc định: dùng kích thước mặc định
		currentWidth = Math.max(minNodeWidth, minWidth)
		
		if (nodeData.data && isFirstEdit) {
			delete nodeData.data.fixedWidth
			delete nodeData.data.fixedHeight
			nodeData.data.keepSingleLine = true
		}
	} else {
		// Có nội dung
		// ⚠️ STEP 2: Nếu có ảnh, LUÔN dùng maxWidth
		if (hasImages) {
			currentWidth = maxWidth
		} else {
			// Không có ảnh: tính toán width dựa trên text
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
	}
	
	// ⚠️ CRITICAL: Nếu có ảnh, FORCE currentWidth = maxWidth (400px)
	if (hasImages && currentWidth < maxWidth) {
		currentWidth = maxWidth
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
			// ⚠️ CRITICAL: Set width với !important để đảm bảo không bị override
			editorContent.style.setProperty('width', `${foWidth}px`, 'important')
			
			
			// Xác định có cần wrap không dựa trên currentWidth
			// Nếu currentWidth < maxWidth: text chưa đạt max-width, không wrap
			// Nếu currentWidth >= maxWidth: text đã đạt max-width, cho phép wrap
			const willWrap = currentWidth >= maxWidth || hasImages
			
			// Set white-space dựa trên việc có wrap hay không
			if (willWrap) {
				editorContent.style.setProperty('white-space', 'pre-wrap', 'important')
				editorContent.style.setProperty('overflow-wrap', 'break-word', 'important')
			} else {
				editorContent.style.whiteSpace = 'nowrap' // Không wrap - text trên 1 dòng
			}
			
			// Force reflow để đảm bảo width và white-space đã được áp dụng
			void editorContent.offsetWidth
		}
	}
	
	// Tính toán height mới dựa trên width và nội dung - tự động mở rộng để hiển thị đủ nội dung
	let currentHeight
	let measuredHeight = singleLineHeight
	
	if (isEmpty) {
		// ⚠️ FIX: Khi xóa hết nội dung:
		// - Nếu node có kích thước lớn hơn mặc định (minNodeHeight >= singleLineHeight): giữ lại kích thước đã khóa
		// - Nếu node có kích thước nhỏ hơn mặc định (minNodeHeight < singleLineHeight): dùng kích thước mặc định
		currentHeight = Math.max(minNodeHeight, singleLineHeight)
		measuredHeight = currentHeight
	} else {
		// ⚠️ NEW: Sử dụng hàm tập trung calculateNodeHeightWithImages
		const editorInstance = getEditorInstance(renderer, nodeId)
		
		if (editorInstance && editorInstance.view && editorInstance.view.dom) {
			const editorDOM = editorInstance.view.dom
			const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
			
			if (editorContent) {
				// ⚠️ STEP 1: Setup styles cho editorContent trước khi đo
				const foWidth = currentWidth - borderOffset
				
				// Tạm mở rộng foreignObject để không clip
				fo.attr('height', 0)
				rect.attr('height', 0)
				
				// Set styles
				editorContent.style.setProperty('overflow', 'visible', 'important')
				editorContent.style.boxSizing = 'border-box'
				editorContent.style.setProperty('width', `${foWidth}px`, 'important')
				editorContent.style.height = 'auto'
				editorContent.style.minHeight = `${singleLineHeight}px`
				editorContent.style.setProperty('max-height', 'none', 'important')
				editorContent.style.padding = '8px 16px'
				editorContent.style.setProperty('white-space', hasImages ? 'pre-wrap' : (currentWidth >= maxWidth ? 'pre-wrap' : 'nowrap'), 'important')
				editorContent.style.setProperty('overflow-wrap', 'break-word', 'important')
				
				// Mở rộng wrapper và container
				const wrapper = fo.select('.node-content-wrapper').node()
				const container = fo.select('.node-editor-container').node()
				if (wrapper) {
					wrapper.style.height = 'auto'
					wrapper.style.maxHeight = 'none'
					wrapper.style.overflow = 'visible'
				}
				if (container) {
					container.style.height = 'auto'
					container.style.maxHeight = 'none'
					container.style.overflow = 'visible'
				}
				
				// Force reflow
				void editorContent.offsetWidth
				void editorContent.offsetHeight
				
				// ⚠️ STEP 2: Đo height từ DOM để hiển thị đầy đủ nội dung đang nhập
				if (hasImages) {
					// Có ảnh: Gọi hàm tính toán chuyên dụng
					const heightResult = calculateNodeHeightWithImages({
						editorContent,
						nodeWidth: currentWidth,
						htmlContent: value,
						singleLineHeight
					})
					
					measuredHeight = heightResult.height
					
					// LƯU NGAY vào fixedWidth/fixedHeight (chỉ khi có ảnh)
					if (!nodeData.data) nodeData.data = {}
					nodeData.data.fixedWidth = currentWidth
					nodeData.data.fixedHeight = measuredHeight
					
					// Cập nhật cache
					renderer.nodeSizeCache.set(nodeId, { 
						width: currentWidth, 
						height: measuredHeight 
					})
					
					// Kiểm tra ảnh đã load chưa
					const images = editorContent.querySelectorAll('img')
					const allImagesLoaded = Array.from(images).every(img => img.complete && img.naturalHeight > 0)
					
					if (!allImagesLoaded) {
						// Đợi ảnh load xong rồi tính lại
						const imageLoadPromises = Array.from(images)
							.filter(img => !img.complete || img.naturalHeight === 0)
							.map(img => new Promise((resolve) => {
								if (img.complete && img.naturalHeight > 0) {
									resolve()
								} else {
									img.addEventListener('load', resolve, { once: true })
									img.addEventListener('error', () => {
										console.error('[handleEditorInput] Image failed to load:', img.src)
										resolve()
									}, { once: true })
								}
							}))
						
						Promise.all(imageLoadPromises).then(() => {
							if (renderer.isCalculatingNodeHeight) {
								renderer.isCalculatingNodeHeight.delete(nodeId)
							}
							
							setTimeout(() => {
								const updatedHeightResult = calculateNodeHeightWithImages({
									editorContent,
									nodeWidth: currentWidth,
									htmlContent: value,
									singleLineHeight
								})
								
								if (!nodeData.data) nodeData.data = {}
								nodeData.data.fixedHeight = updatedHeightResult.height
								
								renderer.nodeSizeCache.set(nodeId, { 
									width: currentWidth, 
									height: updatedHeightResult.height 
								})
								
								rect.attr('height', updatedHeightResult.height)
								fo.attr('height', Math.max(0, updatedHeightResult.height - borderOffset))
								
								nodeGroup.select('.add-child-btn').attr('cy', updatedHeightResult.height / 2)
								nodeGroup.select('.add-child-text').attr('y', updatedHeightResult.height / 2)
								
								if (renderer.callbacks.onNodeUpdate) {
									renderer.callbacks.onNodeUpdate(nodeId, { 
										label: value,
										fixedHeight: updatedHeightResult.height
									})
								}
							}, 20)
						})
					}
				} else {
					// ⚠️ KHÔNG có ảnh: Đo height trực tiếp từ DOM để hiển thị text nhiều dòng
					// Force height = auto để đo chính xác
					editorContent.style.height = 'auto'
					editorContent.style.minHeight = `${singleLineHeight}px`
					editorContent.style.maxHeight = 'none'
					
					// Force reflow để đảm bảo DOM đã update
					void editorContent.offsetHeight
					void editorContent.scrollHeight
					
					// Đo height thực tế từ scrollHeight (bao gồm tất cả nội dung)
					const contentScrollHeight = editorContent.scrollHeight || editorContent.offsetHeight || 0
					measuredHeight = Math.max(contentScrollHeight, singleLineHeight)
					
					// KHÔNG lưu vào fixedHeight (chỉ lưu khi có ảnh)
					// Vì text có thể thay đổi liên tục, không cần fix
				}
				
			}
		}
		
		// ⚠️ CRITICAL: Height của node = height đo được (không bị giới hạn bởi minNodeHeight)
		// Chỉ dùng minNodeHeight nếu measuredHeight nhỏ hơn
		currentHeight = Math.max(measuredHeight, minNodeHeight)
	}
	
	// Cập nhật height của node-rect và foreignObject
	const finalHeight = currentHeight
	const foHeight = Math.max(0, finalHeight - borderOffset)
	
	// ⚠️ CRITICAL: Verify rect và fo tồn tại
	
	if (rect.node()) {
		rect.attr('height', finalHeight)
		// ⚠️ CRITICAL: Verify bằng cách set trực tiếp
		rect.node().setAttribute('height', finalHeight)
	} else {
		console.error('[ERROR] rect.node() is null!')
	}
	
	if (fo.node()) {
		fo.attr('height', foHeight)
		// ⚠️ CRITICAL: Verify bằng cách set trực tiếp
		fo.node().setAttribute('height', foHeight)
	} else {
		console.error('[ERROR] fo.node() is null!')
	}
	
	// ⚠️ CRITICAL: Cũng update các element liên quan
	nodeGroup.select('.node-hover-layer').attr('height', finalHeight)
	nodeGroup.select('.collapse-button-bridge').attr('height', finalHeight)
	
	// ⚠️ FIX: Cập nhật wrapper và editor container - để height tự động điều chỉnh theo nội dung
	// Thay vì set height cố định, chỉ set min-height để tránh khoảng trống thừa
	const wrapperNode = fo.select('.node-content-wrapper').node()
	if (wrapperNode) {
		wrapperNode.style.setProperty('width', '100%', 'important')
		wrapperNode.style.setProperty('height', 'auto', 'important') // Tự động điều chỉnh theo nội dung
		wrapperNode.style.setProperty('min-height', `${foHeight}px`, 'important') // Đảm bảo không nhỏ hơn foHeight
		wrapperNode.style.setProperty('max-height', 'none', 'important')
		wrapperNode.style.setProperty('overflow', 'visible', 'important')
	}
	
	const containerNode = fo.select('.node-editor-container').node()
	if (containerNode) {
		containerNode.style.setProperty('width', '100%', 'important')
		containerNode.style.setProperty('height', 'auto', 'important') // Tự động điều chỉnh theo nội dung
		containerNode.style.setProperty('min-height', `${foHeight}px`, 'important') // Đảm bảo không nhỏ hơn foHeight
		containerNode.style.setProperty('max-height', 'none', 'important')
		containerNode.style.setProperty('overflow', 'visible', 'important')
	}
	
	// ⚠️ CRITICAL: Cũng set cho .mindmap-node-editor và .mindmap-editor-content
	const nodeEditorEl = fo.select('.mindmap-node-editor').node()
	if (nodeEditorEl) {
		nodeEditorEl.style.setProperty('height', 'auto', 'important') // Tự động điều chỉnh theo nội dung
		nodeEditorEl.style.setProperty('min-height', `${foHeight}px`, 'important') // Đảm bảo không nhỏ hơn foHeight
		nodeEditorEl.style.setProperty('max-height', 'none', 'important')
		nodeEditorEl.style.setProperty('overflow', 'visible', 'important')
	}
	
	const editorContentEl = fo.select('.mindmap-editor-content').node()
	if (editorContentEl) {
		editorContentEl.style.setProperty('height', 'auto', 'important') // Tự động điều chỉnh theo nội dung
		editorContentEl.style.setProperty('min-height', `${foHeight}px`, 'important') // Đảm bảo không nhỏ hơn foHeight
		editorContentEl.style.setProperty('max-height', 'none', 'important')
		editorContentEl.style.setProperty('overflow', 'visible', 'important')
	}
	
	// Cập nhật vị trí nút add-child
	nodeGroup.select('.add-child-btn').attr('cx', currentWidth + 20)
	nodeGroup.select('.add-child-btn').attr('cy', currentHeight / 2)
	nodeGroup.select('.add-child-text').attr('x', currentWidth + 20)
	nodeGroup.select('.add-child-text').attr('y', currentHeight / 2)
	
	// ⚠️ CRITICAL: Cập nhật vị trí nút collapse (number button và arrow button)
	nodeGroup.select('.collapse-btn-number').attr('cx', currentWidth + 20)
	nodeGroup.select('.collapse-btn-number').attr('cy', currentHeight / 2)
	nodeGroup.select('.collapse-text-number').attr('x', currentWidth + 20)
	nodeGroup.select('.collapse-text-number').attr('y', currentHeight / 2)
	nodeGroup.select('.collapse-btn-arrow').attr('cx', currentWidth + 20)
	nodeGroup.select('.collapse-btn-arrow').attr('cy', currentHeight / 2)
	nodeGroup.select('.collapse-arrow').attr('transform', `translate(${currentWidth + 20}, ${currentHeight / 2}) scale(0.7) translate(-12, -12)`)
	
	// Cập nhật collapse button bridge
	nodeGroup.select('.collapse-button-bridge').attr('width', 20)
	nodeGroup.select('.collapse-button-bridge').attr('x', currentWidth)
	
	// Cập nhật hover layer
	nodeGroup.select('.node-hover-layer').attr('width', currentWidth + 40)
	
	// Cập nhật cache với kích thước mới (để các lần tính toán sau dùng)
	renderer.nodeSizeCache.set(nodeId, { width: currentWidth, height: currentHeight })
	
	// Trigger callback để cập nhật dữ liệu
	if (renderer.callbacks.onNodeUpdate) {
		renderer.callbacks.onNodeUpdate(nodeId, { label: value })
	}
	
	// ⚠️ CRITICAL FIX: Reset flag để cho phép update tiếp theo
	// Dùng setTimeout để đảm bảo callback đã chạy xong
	setTimeout(() => {
		if (renderer.isCalculatingNodeHeight) {
			renderer.isCalculatingNodeHeight.delete(nodeId)
		}
	}, 50) // Delay nhỏ để đảm bảo tất cả update đã hoàn tất
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
		
		
		if (editor && editor.view && editor.view.dom) {
			const editorDOM = editor.view.dom
			const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
			if (editorContent) {
				// ⚠️ STEP 1: Đo width chính xác từ nội dung thực tế
				// Parse HTML để lấy text và đo width của từng dòng
				let titleText = ''
				let descriptionText = ''
				
				
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
				
				
				// ⚠️ CRITICAL: Kiểm tra xem có task link không
				// Task link có thể là section hoặc paragraph chứa link "Liên kết công việc"
				const hasTaskLinkSection = proseElement ? (
					proseElement.querySelector('.node-task-link-section') ||
					proseElement.querySelector('[data-node-section="task-link"]') ||
					proseElement.querySelector('.node-task-badge')
				) : false
				const hasTaskLinkParagraph = proseElement ? (
					Array.from(proseElement.querySelectorAll('p')).some(p => {
						const text = p.textContent?.trim() || ''
						return text.includes('Liên kết công việc') || 
							p.querySelector('a[href*="task_id"]') || 
							p.querySelector('a[href*="task"]')
					})
				) : false
				const hasTaskLinkInHTML = finalValue.includes('node-task-link-section') || 
					finalValue.includes('node-task-badge') || 
					finalValue.includes('data-node-section="task-link"') ||
					finalValue.includes('Liên kết công việc')
				const finalHasTaskLink = hasTaskLinkSection || hasTaskLinkParagraph || hasTaskLinkInHTML
				
				// ⚠️ CRITICAL: Nếu có ảnh, LUÔN set width = maxWidth (400px)
				if (finalHasImages) {
					measuredWidth = maxWidth // 400px
					hasMeasuredFromDOM = true
					
					// Nếu KHÔNG có task link, đọc fixedHeight đã lưu
					// Nếu CÓ task link, sẽ đo lại từ DOM ở phần dưới
					if (!finalHasTaskLink) {
						// ĐỌC fixedHeight đã lưu từ handleEditorInput
						if (nodeData.data && nodeData.data.fixedHeight) {
							measuredHeight = nodeData.data.fixedHeight
							hasMeasuredHeightFromDOM = true
						} else {
							// Nếu chưa có fixedHeight (trường hợp ảnh insert trước khi có hàm mới)
							// Fallback: đọc từ cache
							const cachedSize = renderer.nodeSizeCache.get(nodeId)
							if (cachedSize && cachedSize.height > 0) {
								measuredHeight = cachedSize.height
								hasMeasuredHeightFromDOM = true
							}
						}
					}
					// ⚠️ KHÔNG clamp khi có ảnh, vì đã force = maxWidth
				} else if (maxTextWidth === 0) {
					// Nếu không có text và không có ảnh, dùng absoluteMinWidth
					measuredWidth = absoluteMinWidth
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
					// Clamp width giữa absoluteMinWidth và maxWidth
					measuredWidth = Math.min(measuredWidth, maxWidth)
				}
				
				// Đánh dấu đã đo được từ DOM
				hasMeasuredFromDOM = true
				
				// ⚠️ STEP 2: Đo height từ DOM
				// - Nếu KHÔNG có ảnh: đo từ DOM
				// - Nếu có ảnh NHƯNG có task link: đo lại từ DOM để bao gồm task link
				if (!finalHasImages || (finalHasImages && finalHasTaskLink)) {
					const borderOffset = 4
					const foWidth = measuredWidth - borderOffset
					
					// ⚠️ CRITICAL: Tạm thời mở rộng foreignObject và rect để đo chính xác
					const fo = d3.select(foElement)
					fo.attr('height', 2000)
					rect.attr('height', 2000)
					
					// Mở rộng wrapper và container
					const wrapperEl = editorContent.closest('.node-content-wrapper')
					const containerEl = editorContent.closest('.node-editor-container')
					if (wrapperEl) {
						wrapperEl.style.height = 'auto'
						wrapperEl.style.maxHeight = 'none'
						wrapperEl.style.overflow = 'visible'
					}
					if (containerEl) {
						containerEl.style.height = 'auto'
						containerEl.style.maxHeight = 'none'
						containerEl.style.overflow = 'visible'
					}
					
					// Set styles để đo height
					editorContent.style.boxSizing = 'border-box'
					editorContent.style.setProperty('width', `${foWidth}px`, 'important')
					editorContent.style.height = 'auto'
					editorContent.style.minHeight = '0'
					editorContent.style.setProperty('max-height', 'none', 'important')
					editorContent.style.padding = '8px 16px'
					editorContent.style.margin = '0'
					
					const whiteSpaceValue = (measuredWidth >= maxWidth) ? 'pre-wrap' : 'nowrap'
					editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
					editorContent.style.setProperty('overflow-wrap', 'break-word', 'important')
					editorContent.style.setProperty('overflow', 'visible', 'important')
					
					// Set white-space cho các p
					const paragraphs = editorContent.querySelectorAll('p')
					paragraphs.forEach(p => {
						p.style.setProperty('white-space', whiteSpaceValue, 'important')
					})
					
					// Force reflow
					void editorContent.offsetWidth
					void editorContent.offsetHeight
					void editorContent.scrollHeight
					
					// ⚠️ CRITICAL: Đo height từ DOM, bao gồm cả task link sections
					let measuredHeightFromDOM = editorContent.scrollHeight || editorContent.offsetHeight || 0
					
					// Nếu có task link hoặc ảnh, đo chính xác hơn bằng getBoundingClientRect
					if (finalHasTaskLink || finalHasImages) {
						const editorRect = editorContent.getBoundingClientRect()
						const paddingTop = parseFloat(window.getComputedStyle(editorContent).paddingTop) || 0
						const paddingBottom = parseFloat(window.getComputedStyle(editorContent).paddingBottom) || 0
						let maxBottom = 0
						
						// Đo từ task link sections (có thể là section hoặc paragraph chứa link)
						const taskLinkSections = editorContent.querySelectorAll('.node-task-link-section, [data-node-section="task-link"]')
						taskLinkSections.forEach((section) => {
							const sectionRect = section.getBoundingClientRect()
							const sectionStyle = window.getComputedStyle(section)
							const sectionMarginBottom = parseFloat(sectionStyle.marginBottom) || 0
							const sectionBottom = sectionRect.bottom - editorRect.top + sectionMarginBottom
							maxBottom = Math.max(maxBottom, sectionBottom)
						})
						
						// ⚠️ CRITICAL: Tìm các paragraph chứa link "Liên kết công việc" (nếu không có section wrapper)
						if (taskLinkSections.length === 0) {
							const paragraphs = editorContent.querySelectorAll('p')
							paragraphs.forEach((p) => {
								const linkText = p.textContent?.trim() || ''
								const hasTaskLinkText = linkText.includes('Liên kết công việc') || 
									p.querySelector('a[href*="task_id"]') || 
									p.querySelector('a[href*="task"]')
								if (hasTaskLinkText) {
									const pRect = p.getBoundingClientRect()
									const pStyle = window.getComputedStyle(p)
									const pMarginBottom = parseFloat(pStyle.marginBottom) || 0
									const pBottom = pRect.bottom - editorRect.top + pMarginBottom
									maxBottom = Math.max(maxBottom, pBottom)
								}
							})
						}
						
						// Đo từ image wrappers (nếu có)
						const imageWrappers = editorContent.querySelectorAll('.image-wrapper-node, .image-wrapper')
						if (imageWrappers.length > 0) {
							imageWrappers.forEach((wrapper) => {
								const wrapperRect = wrapper.getBoundingClientRect()
								const wrapperStyle = window.getComputedStyle(wrapper)
								const wrapperMarginTop = parseFloat(wrapperStyle.marginTop) || 0
								const wrapperMarginBottom = parseFloat(wrapperStyle.marginBottom) || 0
								// Tính bottom bao gồm cả margin
								const wrapperBottom = wrapperRect.bottom - editorRect.top + wrapperMarginBottom
								maxBottom = Math.max(maxBottom, wrapperBottom)
							})
						}
						
						// Đo từ images (nếu không có wrapper)
						if (imageWrappers.length === 0) {
							const images = editorContent.querySelectorAll('img')
							images.forEach((img) => {
								const imgRect = img.getBoundingClientRect()
								const imgStyle = window.getComputedStyle(img)
								const imgMarginTop = parseFloat(imgStyle.marginTop) || 0
								const imgMarginBottom = parseFloat(imgStyle.marginBottom) || 0
								const imgBottom = imgRect.bottom - editorRect.top + imgMarginBottom
								maxBottom = Math.max(maxBottom, imgBottom)
							})
						}
						
						// Đo từ các phần tử text (paragraphs, blockquotes, etc)
						const textElements = Array.from(editorContent.children).filter((child) => {
							const hasText = child.textContent?.trim().length > 0
							const hasImage = child.querySelector('img') || child.querySelector('.image-wrapper-node')
							const hasTaskLinkSection = child.querySelector('.node-task-link-section') || child.querySelector('[data-node-section="task-link"]')
							// Kiểm tra xem có phải là paragraph chứa task link không
							const isTaskLinkParagraph = child.tagName === 'P' && (
								child.textContent?.includes('Liên kết công việc') ||
								child.querySelector('a[href*="task_id"]') ||
								child.querySelector('a[href*="task"]')
							)
							return hasText || hasImage || hasTaskLinkSection || isTaskLinkParagraph
						})
						
						textElements.forEach((element) => {
							const elementRect = element.getBoundingClientRect()
							const elementStyle = window.getComputedStyle(element)
							const elementMarginBottom = parseFloat(elementStyle.marginBottom) || 0
							const elementBottom = elementRect.bottom - editorRect.top + elementMarginBottom
							maxBottom = Math.max(maxBottom, elementBottom)
						})
						
						// Tính height: padding top + nội dung + padding bottom
						if (maxBottom > paddingTop) {
							// maxBottom đã tính từ top của editorContent (bao gồm padding top)
							// Chỉ cần cộng thêm padding bottom
							const calculatedHeight = maxBottom + paddingBottom
							// Dùng giá trị lớn hơn giữa calculatedHeight và scrollHeight để đảm bảo không thiếu
							measuredHeightFromDOM = Math.max(measuredHeightFromDOM, calculatedHeight, editorContent.scrollHeight || 0)
						} else {
							// Fallback: dùng scrollHeight
							measuredHeightFromDOM = Math.max(measuredHeightFromDOM, editorContent.scrollHeight || 0)
						}
					}
					
					// ⚠️ CRITICAL: Đảm bảo height không nhỏ hơn scrollHeight để tránh thiếu nội dung
					measuredHeightFromDOM = Math.max(measuredHeightFromDOM, editorContent.scrollHeight || measuredHeightFromDOM)
					
					measuredHeight = Math.max(measuredHeightFromDOM, singleLineHeight)
					hasMeasuredHeightFromDOM = true
				}
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
			} else {
				const calculatedWidth = renderer.estimateNodeWidth(tempNode, maxWidth)
				// Cho phép thu nhỏ xuống absoluteMinWidth
				measuredWidth = Math.max(calculatedWidth, absoluteMinWidth)
				measuredWidth = Math.min(measuredWidth, maxWidth)
			}
		} else if (hasMeasuredFromDOM) {
		}
		// ⚠️ FIX: Fallback height CHỈ KHI không đo được từ DOM (hasMeasuredHeightFromDOM === false)
		if (!hasMeasuredHeightFromDOM && finalValue && finalValue.trim()) {
			const calculatedHeight = renderer.estimateNodeHeight(tempNode, measuredWidth)
			measuredHeight = Math.max(calculatedHeight, singleLineHeight)
		} else if (hasMeasuredHeightFromDOM) {
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
				measuredWidth = maxWidth
			}
		}
		
		finalWidth = measuredWidth
		finalHeight = measuredHeight
		
		
		// Update cache TRƯỚC KHI clear editingNode
		renderer.nodeSizeCache.set(nodeId, { width: finalWidth, height: finalHeight })
	}
	
	// ⚠️ CRITICAL: Log kích thước thực tế sau khi cập nhật
	// Đợi một chút để DOM đã cập nhật
	setTimeout(() => {}, 200)
	
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
	const foWidth = Math.max(0, finalWidth - borderOffset)
	const foHeight = Math.max(0, finalHeight - borderOffset)
	
	fo.attr('width', foWidth)
	fo.attr('height', foHeight)
	
	// ⚠️ CRITICAL: Set height cho tất cả các element con với !important
	const wrapperNode = fo.select('.node-content-wrapper').node()
	if (wrapperNode) {
		wrapperNode.style.setProperty('width', '100%', 'important')
		wrapperNode.style.setProperty('height', `${foHeight}px`, 'important')
		wrapperNode.style.setProperty('min-height', `${foHeight}px`, 'important')
		wrapperNode.style.setProperty('max-height', 'none', 'important')
		wrapperNode.style.setProperty('overflow', 'visible', 'important')
	}
	
	const containerNode = fo.select('.node-editor-container').node()
	if (containerNode) {
		containerNode.style.setProperty('width', '100%', 'important')
		containerNode.style.setProperty('height', `${foHeight}px`, 'important')
		containerNode.style.setProperty('min-height', `${foHeight}px`, 'important')
		containerNode.style.setProperty('max-height', 'none', 'important')
		containerNode.style.setProperty('overflow', 'visible', 'important')
	}
	
	const nodeEditorEl = fo.select('.mindmap-node-editor').node()
	if (nodeEditorEl) {
		nodeEditorEl.style.setProperty('height', `${foHeight}px`, 'important')
		nodeEditorEl.style.setProperty('min-height', `${foHeight}px`, 'important')
		nodeEditorEl.style.setProperty('max-height', 'none', 'important')
		nodeEditorEl.style.setProperty('overflow', 'visible', 'important')
	}
	
	const editorContentEl = fo.select('.mindmap-editor-content').node()
	if (editorContentEl) {
		editorContentEl.style.setProperty('height', `${foHeight}px`, 'important')
		editorContentEl.style.setProperty('min-height', `${foHeight}px`, 'important')
		editorContentEl.style.setProperty('max-height', 'none', 'important')
		editorContentEl.style.setProperty('overflow', 'visible', 'important')
	}
	
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
		// Cho phép click vào link trong chế độ view
		editorContainer.style('pointer-events', 'auto')
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

