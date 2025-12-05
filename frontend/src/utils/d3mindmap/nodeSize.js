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
	let titleWidth = minWidth
	if (titleText) {
		const titleLines = titleText.split('\n')
		titleLines.forEach(line => {
			if (line.trim()) {
				const lineSpan = document.createElement('span')
				lineSpan.style.cssText = `
					position: absolute;
					visibility: hidden;
					font-size: 19px;
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
					white-space: nowrap;
				`
				lineSpan.textContent = line.trim()
				document.body.appendChild(lineSpan)
				void lineSpan.offsetHeight
				titleWidth = Math.max(titleWidth, lineSpan.offsetWidth + 56) // padding + margin + buffer để tránh text xuống dòng khi render lần đầu
				document.body.removeChild(lineSpan)
			}
		})
	}
	
	// Đo width của description (font-size 16px)
	let descriptionWidth = minWidth
	if (descriptionText) {
		const descLines = descriptionText.split('\n')
		descLines.forEach(line => {
			if (line.trim()) {
				const lineSpan = document.createElement('span')
				lineSpan.style.cssText = `
					position: absolute;
					visibility: hidden;
					font-size: 16px;
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
					white-space: nowrap;
				`
				lineSpan.textContent = line.trim()
				document.body.appendChild(lineSpan)
				void lineSpan.offsetHeight
				descriptionWidth = Math.max(descriptionWidth, lineSpan.offsetWidth + 56) // padding + margin + buffer để tránh text xuống dòng khi render lần đầu
				document.body.removeChild(lineSpan)
			}
		})
	}
	
	// Lấy width lớn nhất giữa title và description
	const measuredWidth = Math.max(titleWidth, descriptionWidth)
	
	// Clamp between min (130px) and max (400px)
	return Math.min(Math.max(measuredWidth, 130), 400)
}

/**
 * Estimate node height based on content and width
 */
export function estimateNodeHeight(node, nodeWidth = null, getNodeLabelFn = getNodeLabel, estimateWidthFn = estimateNodeWidth) {
	let text = getNodeLabelFn(node)
	const singleLineHeight = Math.ceil(19 * 1.4) + 16 // ~43px (19px * 1.4 line-height + 16px padding)
	if (!text || text.trim() === '') return singleLineHeight
	
	// Extract plain text từ HTML
	let plainText = text
	if (text.includes('<')) {
		const tempDiv = document.createElement('div')
		tempDiv.innerHTML = text
		plainText = (tempDiv.textContent || tempDiv.innerText || '').trim()
	}
	
	if (!plainText) return singleLineHeight
	
	const width = nodeWidth || estimateWidthFn(node)
	
	// ⚠️ DEBUG: Log để kiểm tra
	const isRootNode = node.data?.isRoot || node.id === 'root'
	if (isRootNode) {
		console.log('[ROOT NODE] estimateNodeHeight - width:', width, 'text:', text.substring(0, 100))
	}
	
	// ⚠️ FIX: Tạo temp element với ĐÚNG STYLES và ĐÚNG STRUCTURE
	const tempDiv = document.createElement('div')
	tempDiv.style.cssText = `
		position: absolute;
		visibility: hidden;
		width: ${width}px;
		box-sizing: border-box;
		padding: 8px 16px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		overflow: hidden;
		margin: 0;
		height: auto;
		min-height: 0;
	`
	
	// ⚠️ CRITICAL: Dùng innerHTML để giữ structure (paragraph + blockquote)
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
	
	// ⚠️ FIX: Dùng offsetHeight (chính xác, không thừa)
	const actualHeight = Math.max(
		tempDiv.offsetHeight || 0,
		singleLineHeight
	)
	
	document.body.removeChild(tempDiv)
	
	// ⚠️ DEBUG: Log chiều cao tính được
	if (isRootNode) {
		console.log('[ROOT NODE] estimateNodeHeight - tempDiv.offsetHeight:', tempDiv.offsetHeight)
		console.log('[ROOT NODE] estimateNodeHeight - calculated height:', actualHeight)
		console.log('[ROOT NODE] estimateNodeHeight - HTML content:', text)
	}
	
	// ⚠️ NEW: Không thêm buffer ở đây (đã có padding trong CSS)
	return actualHeight
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

