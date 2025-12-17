/**
 * Node size estimation functions
 */

import { getNodeLabel } from './utils.js'

/**
 * Estimate node width based on content
 */
export function estimateNodeWidth(node, maxWidth = 400, getNodeLabelFn = getNodeLabel) {
	// Đảm bảo text luôn là string
	const text = getNodeLabelFn(node)
	const minWidth = 130 // Textarea width mặc định
	if (!text || text.trim() === '') return minWidth
	
	// ⚠️ STEP 1: Nếu có ảnh, LUÔN trả về maxWidth = 400px
	const hasImages = text.includes('<img') || text.includes('image-wrapper')
	if (hasImages) {
		return maxWidth
	}
	
	// Parse HTML để tách riêng title (paragraph) và description (blockquote)
	let titleText = ''
	let descriptionText = ''
	
	if (text.includes('<')) {
		const tempDiv = document.createElement('div')
		tempDiv.innerHTML = text
		
		// Lấy tất cả paragraph không trong blockquote (title)
		const paragraphs = tempDiv.querySelectorAll('p')
		paragraphs.forEach(p => {
			// Kiểm tra xem paragraph có trong blockquote không
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
		titleText = text.trim()
	}
	
	// Đo width của title (font-size 19px)
	let titleWidth = 0 // Khởi tạo = 0 để có thể tính toán width chính xác
	if (titleText) {
		// ⚠️ FIX: Nếu text là "Nhánh mới" (text mặc định), trả về minWidth ngay
		if (titleText.trim() === 'Nhánh mới') {
			titleWidth = minWidth
		} else {
			const titleLines = titleText.split('\n')
			titleLines.forEach(line => {
				if (line.trim()) {
					const lineSpan = document.createElement('span')
					lineSpan.style.cssText = `
						position: absolute;
						visibility: hidden;
						font-size: 19px;
						font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
						white-space: nowrap;
					`
					lineSpan.textContent = line.trim()
					document.body.appendChild(lineSpan)
					void lineSpan.offsetHeight
					const textWidth = lineSpan.offsetWidth
					// ⚠️ FIX: Tính buffer chính xác: padding 16px mỗi bên = 32px
					const padding = 32 // 16px mỗi bên
					// Với text rất ngắn (< 20px), chỉ cần padding nhỏ
					// Với text ngắn (20-50px), thêm buffer nhỏ 8px
					// Với text dài (> 50px), thêm buffer 16px
					let buffer = 0
					if (textWidth < 20) {
						buffer = 0 // Text rất ngắn như "1", không cần buffer
					} else if (textWidth < 50) {
						buffer = 8 // Text ngắn, buffer nhỏ
					} else {
						buffer = 16 // Text dài, buffer lớn hơn
					}
					const widthWithBuffer = textWidth + padding + buffer
					
					// ⚠️ FIX: Với text rất ngắn, cho phép width nhỏ hơn minWidth để node vừa với nội dung
					if (textWidth < 20) {
						// Text rất ngắn như "1": dùng width vừa với nội dung (textWidth + padding)
						// Không force tối thiểu, để node có kích thước chính xác như node gốc
						titleWidth = Math.max(titleWidth, widthWithBuffer)
					} else if (textWidth < 100 && widthWithBuffer <= minWidth + 30) {
						// Text ngắn: dùng minWidth
						titleWidth = Math.max(titleWidth, minWidth)
					} else {
						// Text dài: dùng width tính được
						titleWidth = Math.max(titleWidth, widthWithBuffer)
					}
					document.body.removeChild(lineSpan)
				}
			})
		}
	}
	
	// Đo width của description (font-size 16px)
	let descriptionWidth = 0 // Khởi tạo = 0 để có thể tính toán width chính xác
	if (descriptionText) {
		const descLines = descriptionText.split('\n')
		descLines.forEach(line => {
			if (line.trim()) {
				const lineSpan = document.createElement('span')
				lineSpan.style.cssText = `
					position: absolute;
					visibility: hidden;
					font-size: 16px;
					font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
					white-space: nowrap;
				`
				lineSpan.textContent = line.trim()
				document.body.appendChild(lineSpan)
				void lineSpan.offsetHeight
				const textWidth = lineSpan.offsetWidth
				// ⚠️ FIX: Tính buffer chính xác: padding 16px mỗi bên = 32px
				const padding = 32 // 16px mỗi bên
				// Với text rất ngắn (< 20px), chỉ cần padding
				// Với text ngắn (20-50px), thêm buffer nhỏ 8px
				// Với text dài (> 50px), thêm buffer 16px
				let buffer = 0
				if (textWidth < 20) {
					buffer = 0 // Text rất ngắn, không cần buffer
				} else if (textWidth < 50) {
					buffer = 8 // Text ngắn, buffer nhỏ
				} else {
					buffer = 16 // Text dài, buffer lớn hơn
				}
				const widthWithBuffer = textWidth + padding + buffer
				
				// ⚠️ FIX: Với text rất ngắn, cho phép width nhỏ hơn minWidth để node vừa với nội dung
				if (textWidth < 20) {
					// Text rất ngắn: dùng width vừa với nội dung (textWidth + padding)
					// Không force tối thiểu, để node có kích thước chính xác như node gốc
					descriptionWidth = Math.max(descriptionWidth, widthWithBuffer)
				} else if (textWidth < 100 && widthWithBuffer <= minWidth + 30) {
					// Text ngắn: dùng minWidth
					descriptionWidth = Math.max(descriptionWidth, minWidth)
				} else {
					// Text dài: dùng width tính được
					descriptionWidth = Math.max(descriptionWidth, widthWithBuffer)
				}
				document.body.removeChild(lineSpan)
			}
		})
	}
	
	// Lấy width lớn nhất giữa title và description
	const measuredWidth = Math.max(titleWidth, descriptionWidth)
	
	// ⚠️ FIX: Nếu measuredWidth = 0 (không có text), dùng minWidth
	// Nếu có text, dùng width tính được (có thể < 130px, thậm chí < 44px cho text rất ngắn như "1")
	// Không force tối thiểu để node có kích thước chính xác như node gốc
	// Clamp between min (measuredWidth cho text, 130px cho text rỗng) and max (400px)
	const finalWidth = measuredWidth === 0 
		? minWidth 
		: measuredWidth // Dùng trực tiếp width tính được, không force tối thiểu
	
	return Math.min(finalWidth, 400)
}

/**
 * Estimate node height based on content and width
 */
export function estimateNodeHeight(node, nodeWidth = null, getNodeLabelFn = getNodeLabel, estimateWidthFn = estimateNodeWidth) {
	let text = getNodeLabelFn(node)
	const singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px (19px * 1.4 line-height + 16px padding)
	if (!text || text.trim() === '') return singleLineHeight
	
	// ⚠️ STEP 1: Kiểm tra xem có ảnh không
	const hasImages = text.includes('<img') || text.includes('image-wrapper')
	
	// Extract plain text từ HTML
	let plainText = text
	if (text.includes('<')) {
		const tempDiv = document.createElement('div')
		tempDiv.innerHTML = text
		plainText = (tempDiv.textContent || tempDiv.innerText || '').trim()
	}
	
	if (!plainText && !hasImages) return singleLineHeight
	
	// ⚠️ STEP 2: Nếu có ảnh, LUÔN dùng maxWidth = 400px
	let width
	if (hasImages) {
		width = 400 // maxWidth
	} else {
		width = nodeWidth || estimateWidthFn(node)
	}
	
	// ⚠️ DEBUG: Log để kiểm tra
	const isRootNode = node.data?.isRoot || node.id === 'root'
	if (isRootNode) {
	}
	
	// ⚠️ FIX: Tạo temp element với ĐÚNG STYLES và ĐÚNG STRUCTURE
	const tempDiv = document.createElement('div')
	tempDiv.style.cssText = `
		position: absolute;
		visibility: hidden;
		width: ${width}px;
		box-sizing: border-box;
		padding: 8px 16px;
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
		overflow: hidden;
		margin: 0;
		height: auto;
		min-height: 0;
	`
	
	// ⚠️ CRITICAL: Dùng innerHTML để giữ structure (paragraph + blockquote + images)
	if (text.includes('<')) {
		tempDiv.innerHTML = text
		
		// Apply styles cho các elements bên trong
		const paragraphs = tempDiv.querySelectorAll('p')
		paragraphs.forEach(p => {
			p.style.margin = '0'
			p.style.padding = '0'
			p.style.fontSize = '19px'
			p.style.lineHeight = '1.4'
		})
		
		const blockquotes = tempDiv.querySelectorAll('blockquote')
		blockquotes.forEach(bq => {
			bq.style.margin = '4px 0 0 0' // Chỉ margin-top
			bq.style.padding = '0 0 0 6px' // Chỉ padding-left
			bq.style.fontSize = '16px'
			bq.style.lineHeight = '1.6'
			bq.style.whiteSpace = 'pre-wrap'
			bq.style.wordWrap = 'break-word'
			bq.style.overflowWrap = 'break-word'
			
			// Apply styles cho p trong blockquote
			const bqPs = bq.querySelectorAll('p')
			bqPs.forEach(p => {
				p.style.margin = '0'
				p.style.padding = '0'
				p.style.lineHeight = '1.6'
			})
		})
		
		// ⚠️ CRITICAL: Apply styles cho ảnh và image wrappers
		const images = tempDiv.querySelectorAll('img')
		const imageWrappers = tempDiv.querySelectorAll('.image-wrapper-node, .image-wrapper, div[data-image-src]')
		
		imageWrappers.forEach(wrapper => {
			wrapper.style.margin = '12px 0'
			wrapper.style.display = 'block'
		})
		
		images.forEach(img => {
			img.style.display = 'block'
			img.style.maxWidth = '100%'
			img.style.height = 'auto'
			img.style.margin = '12px 0'
		})
	} else {
		// Plain text: wrap trong paragraph
		const p = document.createElement('p')
		p.style.cssText = `
			margin: 0;
			padding: 0;
			font-size: 19px;
			line-height: 1.4;
			white-space: ${width >= 400 ? 'pre-wrap' : 'nowrap'};
			word-wrap: break-word;
			overflow-wrap: break-word;
		`
		p.textContent = plainText
		tempDiv.appendChild(p)
	}
	
	document.body.appendChild(tempDiv)
	
	// Force reflow
	void tempDiv.offsetWidth
	void tempDiv.offsetHeight
	
	// ⚠️ STEP 3: Đo height
	let estimatedHeight = tempDiv.offsetHeight || 0
	const images = tempDiv.querySelectorAll('img')
	const imageWrappers = tempDiv.querySelectorAll('.image-wrapper-node, .image-wrapper, div[data-image-src]')
	
	if (images.length > 0 || imageWrappers.length > 0) {
		
		const imageCount = Math.max(images.length, imageWrappers.length)
		
		// ⚠️ CRITICAL: Ước tính height dựa trên ảnh thực tế nếu có
		let totalImageHeight = 0
		
		// Kiểm tra xem ảnh đã load chưa để dùng naturalHeight
		let allImagesHaveSize = true
		images.forEach(img => {
			if (!img.naturalHeight || img.naturalHeight === 0) {
				allImagesHaveSize = false
			}
		})
		
		if (allImagesHaveSize && images.length > 0) {
			// Ảnh đã có size - tính chính xác
			const contentWidth = width - 32 // trừ padding
			images.forEach(img => {
				const imgWidth = contentWidth
				const imgHeight = (img.naturalHeight * imgWidth) / img.naturalWidth
				totalImageHeight += imgHeight + 24 // + margin
			})
		} else {
			// Ảnh chưa load - ước tính cao hơn (400px mỗi ảnh)
			// Vì ảnh thường có aspect ratio ~16:9 hoặc cao hơn
			totalImageHeight = imageCount * 400 // 400px mỗi ảnh (conservative estimate)
		}
		
		// Text height (chỉ lấy phần không phải ảnh)
		const textOnlyHeight = 50 // Ước tính text height
		
		// Tổng height = text + images
		estimatedHeight = textOnlyHeight + totalImageHeight
		
	}
	
	// ⚠️ FIX: Dùng offsetHeight (chính xác, không thừa)
	const actualHeight = Math.max(
		estimatedHeight,
		singleLineHeight
	)
	
	document.body.removeChild(tempDiv)
	
	// ⚠️ DEBUG: Log chiều cao tính được
	if (isRootNode) {
	}
	
	// ⚠️ NEW: Không thêm buffer ở đây (đã có padding trong CSS)
	return actualHeight
}

/**
 * Tính toán chiều cao của node khi có ảnh
 * Hàm này đảm bảo tính toán chiều cao đồng nhất giữa lúc thêm ảnh và lúc render
 * 
 * @param {Object} options - Các tùy chọn
 * @param {HTMLElement} options.editorContent - Editor content element (TipTap prose)
 * @param {number} options.nodeWidth - Chiều rộng của node
 * @param {string} options.htmlContent - Nội dung HTML của node
 * @param {number} options.singleLineHeight - Chiều cao của 1 dòng text (default: 43px)
 * @returns {Object} { height, hasImages, imageCount, estimatedHeight }
 */
export function calculateNodeHeightWithImages(options) {
	const {
		editorContent,
		nodeWidth,
		htmlContent,
		singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px
	} = options
	
	// STEP 1: Kiểm tra xem có ảnh không
	const hasImages = htmlContent?.includes('<img') || htmlContent?.includes('image-wrapper')
	
	if (!hasImages) {
		// Không có ảnh - chỉ tính text height
		return {
			height: singleLineHeight,
			hasImages: false,
			imageCount: 0,
			estimatedHeight: singleLineHeight
		}
	}
	
	// STEP 2: Có ảnh - tính toán layout và height
	const borderOffset = 4 // 2px border mỗi bên
	const padding = 32 // 16px mỗi bên (padding left + right)
	const contentWidth = nodeWidth - borderOffset - padding
	
	// Lấy tất cả ảnh từ editor content
	const images = editorContent ? editorContent.querySelectorAll('img') : []
	const imageCount = images.length
	
	if (imageCount === 0) {
		// Không tìm thấy ảnh trong DOM - fallback về text height
		return {
			height: singleLineHeight,
			hasImages: false,
			imageCount: 0,
			estimatedHeight: singleLineHeight
		}
	}
	
	// STEP 3: Tính toán layout của ảnh dựa trên số lượng
	// 1 ảnh: 1 cột (100% width)
	// 2 ảnh: 2 cột (50% width mỗi ảnh)
	// 3+ ảnh: 3 cột (33.333% width mỗi ảnh)
	let perImageWidth = contentWidth // 1 ảnh = 100% width
	let imagesPerRow = 1
	
	if (imageCount === 2) {
		imagesPerRow = 2
		perImageWidth = (contentWidth - 12) * 0.5 // 50% - half of gap (12px)
	} else if (imageCount >= 3) {
		imagesPerRow = 3
		perImageWidth = (contentWidth - 24) * 0.3333 // 33.333% - 2/3 of gap (12px)
	}
	
	// STEP 4: Tính height của từng ảnh dựa trên aspect ratio
	const imageHeights = []
	
	images.forEach((img) => {
		let imgHeight = 0
		
		// Ưu tiên lấy naturalHeight nếu ảnh đã load
		if (img.naturalHeight > 0 && img.naturalWidth > 0) {
			// Ảnh đã load - tính height chính xác dựa trên aspect ratio
			const aspectRatio = img.naturalWidth / img.naturalHeight
			imgHeight = perImageWidth / aspectRatio
		} else if (img.getAttribute('height') && img.getAttribute('width')) {
			// Có height/width attributes - ước tính dựa trên attributes
			const attrWidth = parseInt(img.getAttribute('width'))
			const attrHeight = parseInt(img.getAttribute('height'))
			if (attrWidth > 0 && attrHeight > 0) {
				const aspectRatio = attrWidth / attrHeight
				imgHeight = perImageWidth / aspectRatio
			}
		} else {
			// Không có thông tin - ước tính dựa trên aspect ratio mặc định
			// Giả sử aspect ratio 4:3 (conservative estimate)
			imgHeight = perImageWidth * 0.75 // 3/4
		}
		
		imageHeights.push(imgHeight)
	})
	
	// STEP 5: Nhóm ảnh theo hàng và tính MAX height của mỗi hàng
	const numRows = Math.ceil(imageCount / imagesPerRow)
	let totalRowsHeight = 0
	
	for (let row = 0; row < numRows; row++) {
		const startIdx = row * imagesPerRow
		const endIdx = Math.min(startIdx + imagesPerRow, imageCount)
		const rowImages = imageHeights.slice(startIdx, endIdx)
		const maxHeightInRow = Math.max(...rowImages)
		const rowMargin = 24 // 12px top + 12px bottom margin cho mỗi hàng
		totalRowsHeight += maxHeightInRow + rowMargin
	}
	
	// STEP 6: Cộng thêm text height + padding
	const textHeight = 50 // Ước tính cho text (title + description nếu có)
	const topBottomPadding = 16 // 8px top + 8px bottom
	const estimatedHeight = totalRowsHeight + textHeight + topBottomPadding
	
	// STEP 7: Đo height thực tế từ DOM nếu có editorContent
	let actualHeight = estimatedHeight
	
	if (editorContent) {
		// Force reflow để đảm bảo DOM đã cập nhật
		void editorContent.offsetWidth
		void editorContent.offsetHeight
		void editorContent.scrollHeight
		
		// Đo từ scrollHeight để lấy chiều cao đầy đủ (bao gồm overflow)
		const scrollHeight = editorContent.scrollHeight || editorContent.offsetHeight || 0
		
		// ⚠️ FIX: Đo chính xác từ image wrappers và images bằng getBoundingClientRect
		const imageWrappers = editorContent.querySelectorAll('.image-wrapper, .image-wrapper-node')
		const editorRect = editorContent.getBoundingClientRect()
		let maxBottom = 0
		
		// Đo từ image wrappers (nếu có) để lấy height chính xác bao gồm margin
		if (imageWrappers.length > 0) {
			imageWrappers.forEach((wrapper) => {
				const wrapperRect = wrapper.getBoundingClientRect()
				const wrapperStyle = window.getComputedStyle(wrapper)
				const wrapperMarginBottom = parseFloat(wrapperStyle.marginBottom) || 0
				// Tính bottom relative to editorContent
				const wrapperBottom = wrapperRect.bottom - editorRect.top + wrapperMarginBottom
				maxBottom = Math.max(maxBottom, wrapperBottom)
			})
		} else if (images.length > 0) {
			// Đo trực tiếp từ ảnh (nếu không có wrapper)
			images.forEach((img) => {
				const imgRect = img.getBoundingClientRect()
				const imgStyle = window.getComputedStyle(img)
				const imgMarginBottom = parseFloat(imgStyle.marginBottom) || 0
				// Tính bottom relative to editorContent
				const imgBottom = imgRect.bottom - editorRect.top + imgMarginBottom
				maxBottom = Math.max(maxBottom, imgBottom)
			})
		}
		
		// ⚠️ CRITICAL: Đo từ task link sections (Liên kết công việc)
		const taskLinkSections = editorContent.querySelectorAll('.node-task-link-section, [data-node-section="task-link"]')
		taskLinkSections.forEach((section) => {
			const sectionRect = section.getBoundingClientRect()
			const sectionStyle = window.getComputedStyle(section)
			const sectionMarginBottom = parseFloat(sectionStyle.marginBottom) || 0
			// Tính bottom relative to editorContent
			const sectionBottom = sectionRect.bottom - editorRect.top + sectionMarginBottom
			maxBottom = Math.max(maxBottom, sectionBottom)
		})
		
		// Đo từ các phần tử text (paragraphs, blockquotes, etc)
		const textElements = Array.from(editorContent.children).filter((child) => {
			const hasText = child.textContent?.trim().length > 0
			const hasImage = child.querySelector('img') || child.querySelector('.image-wrapper-node')
			const hasTaskLink = child.querySelector('.node-task-link-section') || child.querySelector('[data-node-section="task-link"]')
			return hasText || hasImage || hasTaskLink
		})
		
		textElements.forEach((element) => {
			const elementRect = element.getBoundingClientRect()
			const elementStyle = window.getComputedStyle(element)
			const elementMarginBottom = parseFloat(elementStyle.marginBottom) || 0
			// Tính bottom relative to editorContent
			const elementBottom = elementRect.bottom - editorRect.top + elementMarginBottom
			maxBottom = Math.max(maxBottom, elementBottom)
		})
		
		// Thêm padding bottom
		const paddingBottom = parseFloat(window.getComputedStyle(editorContent).paddingBottom) || 0
		if (maxBottom > 0) {
			maxBottom += paddingBottom
		}
		
		// Dùng giá trị lớn nhất giữa scrollHeight, maxBottom và estimatedHeight
		// Nhưng ưu tiên dùng giá trị nhỏ hơn để tránh khoảng trống thừa
		if (maxBottom > 0) {
			// Có đo được từ DOM, dùng giá trị này nhưng không lớn hơn scrollHeight quá nhiều
			actualHeight = Math.min(Math.max(scrollHeight, maxBottom), scrollHeight + 20) // Không lớn hơn scrollHeight quá 20px
		} else {
			// Không đo được từ DOM, dùng scrollHeight hoặc estimatedHeight
			actualHeight = Math.min(scrollHeight, estimatedHeight + 50) // Ưu tiên scrollHeight nhưng không quá lớn
		}
	}
	
	// STEP 8: Đảm bảo height tối thiểu là singleLineHeight
	const finalHeight = Math.max(actualHeight, singleLineHeight)
	
	return {
		height: finalHeight,
		hasImages: true,
		imageCount: imageCount,
		estimatedHeight: estimatedHeight,
		actualHeight: actualHeight
	}
}

/**
 * Get both width and height together to avoid circular dependency
 */
export function estimateNodeSize(node, renderer) {
	const isRootNode = node.data?.isRoot || node.id === 'root'
	
	// ⚠️ FIX: Root node lúc đầu KHÔNG dùng cache, luôn tính toán lại
	// Chỉ dùng cache khi đã render xong (có trong vueApps) VÀ cache hợp lý
	if (isRootNode && renderer) {
		const hasEditor = renderer.vueApps && renderer.vueApps.has(node.id)
		if (hasEditor && renderer.nodeSizeCache && renderer.nodeSizeCache.has(node.id)) {
			const cachedSize = renderer.nodeSizeCache.get(node.id)
			// ⚠️ CRITICAL: Chỉ dùng cache nếu height hợp lý (>= 43px)
			// Nếu cache có height < 43px hoặc không hợp lý, tính toán lại
			if (cachedSize && cachedSize.height >= 43) {
				return cachedSize
			}
		}
		// Chưa có editor, chưa có cache, hoặc cache không hợp lý -> tính toán lại
	} else {
		// Node thường: ưu tiên dùng fixedWidth/fixedHeight nếu có
		if (node.data && node.data.fixedWidth && node.data.fixedHeight) {
			return {
				width: node.data.fixedWidth,
				height: node.data.fixedHeight,
			}
		}
	}
	
	// Tính toán width cần thiết để chứa text
	const text = getNodeLabel(node)
	
	// Tính toán width
	const width = estimateNodeWidth(node, 400, getNodeLabel)
	
	// Luôn tính toán height dựa trên width thực tế để hỗ trợ text wrap
	// Đặc biệt quan trọng với root node có thể có nhiều dòng
	const height = estimateNodeHeight(node, width, getNodeLabel, (n, mw) => estimateNodeWidth(n, mw, getNodeLabel))
	
	return { width, height }
}

