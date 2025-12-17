/**
 * Edge rendering functions
 */

import * as d3 from 'd3'
import { estimateNodeSize } from './nodeSize.js'
import { isNodeHidden } from './utils.js'

/**
 * Render edges between nodes
 */
export function renderEdges(renderer, positions) {
	// Render all edges, but hide collapsed ones
	const edges = renderer.g.selectAll('.edge')
		.data(renderer.edges, d => d.id)
	
	// Remove old edges
	edges.exit().remove()
	
	// Add new edges
	const edgesEnter = edges.enter()
		.append('path')
		.attr('class', 'edge')
		.attr('data-edge-id', d => d.id) // Thêm data-edge-id để có thể select sau
		.attr('fill', 'none')
		.attr('stroke', '#3b82f6')
		.attr('stroke-width', 2)
		.attr('stroke-linecap', 'round')
		.attr('stroke-linejoin', 'round')
		.style('pointer-events', 'none') // Edges không chặn click vào nodes/nút
	
	// Update all edges
	const edgesUpdate = edgesEnter.merge(edges)
	
	// Đảm bảo data-edge-id luôn được set
	edgesUpdate.attr('data-edge-id', d => d.id)
	
	// Hide edges to collapsed children
	// Không override opacity của edge đang được làm mờ do drag
	edgesUpdate
		.style('opacity', function(d) {
			const element = d3.select(this)
			// Nếu edge đang được làm mờ do drag, giữ nguyên opacity
			if (element.classed('drag-branch-edge')) {
				return parseFloat(element.style('opacity')) || 0.2
			}
			return isNodeHidden(d.target, renderer.edges, renderer.collapsedNodes) ? 0 : 1
		})
		.style('pointer-events', d => {
			return isNodeHidden(d.target, renderer.edges, renderer.collapsedNodes) ? 'none' : 'auto'
		})
	
	edgesUpdate.attr('d', d => {
		const sourcePos = positions.get(d.source)
		const targetPos = positions.get(d.target)
		
		if (!sourcePos || !targetPos) return ''
		
		// ⚠️ FIX: Lấy kích thước từ DOM thực tế thay vì chỉ dùng cache
		const sourceNode = renderer.nodes.find(n => n.id === d.source)
		const targetNode = renderer.nodes.find(n => n.id === d.target)
		
		// Ưu tiên lấy từ DOM rect thực tế (đã render)
		const sourceRect = renderer.g.select(`[data-node-id="${d.source}"] .node-rect`)
		const targetRect = renderer.g.select(`[data-node-id="${d.target}"] .node-rect`)
		
		let sourceSize
		if (!sourceRect.empty()) {
			sourceSize = {
				width: parseFloat(sourceRect.attr('width')) || 130,
				height: parseFloat(sourceRect.attr('height')) || 43
			}
		} else {
			// Fallback: dùng cache hoặc tính toán
			sourceSize = renderer.nodeSizeCache.get(d.source)
			if (!sourceSize && sourceNode) {
				sourceSize = estimateNodeSize(sourceNode, renderer)
				renderer.nodeSizeCache.set(d.source, sourceSize)
			}
			if (!sourceSize) {
				sourceSize = { width: 130, height: 43 }
			}
		}
		
		let targetSize
		if (!targetRect.empty()) {
			targetSize = {
				width: parseFloat(targetRect.attr('width')) || 130,
				height: parseFloat(targetRect.attr('height')) || 43
			}
		} else {
			// Fallback: dùng cache hoặc tính toán
			targetSize = renderer.nodeSizeCache.get(d.target)
			if (!targetSize && targetNode) {
				targetSize = estimateNodeSize(targetNode, renderer)
				renderer.nodeSizeCache.set(d.target, targetSize)
			}
			if (!targetSize) {
				targetSize = { width: 130, height: 43 }
			}
		}
		
		const sourceWidth = sourceSize.width
		const sourceHeight = sourceSize.height
		const targetWidth = targetSize.width
		const targetHeight = targetSize.height
		
		// ⚠️ FIX: Connection points LUÔN ở giữa node theo chiều dọc
		const x1 = sourcePos.x + sourceWidth
		const y1 = sourcePos.y + (sourceHeight / 2) // Giữa node theo chiều dọc
		
		const x2 = targetPos.x
		const y2 = targetPos.y + (targetHeight / 2)
	
		const dx = x2 - x1
		const dy = y2 - y1
		const direction = dy >= 0 ? 1 : -1
		const baseOffset = Math.max(40, Math.min(Math.abs(dx) * 0.45, 130))
		const horizontalOffset = Math.min(baseOffset, dx - 16)
		const cornerRadius = Math.min(
			18,
			Math.abs(dy) / 2,
			Math.max(8, horizontalOffset / 3)
		)
		
		// When nodes are very close horizontally, keep a straight line
		if (horizontalOffset < cornerRadius * 2 + 4) {
			return `M ${x1} ${y1} L ${x2} ${y2}`
		}
		
		const midX = x1 + horizontalOffset
		const path = [
			`M ${x1} ${y1}`,
			`L ${midX - cornerRadius} ${y1}`,
			`Q ${midX} ${y1} ${midX} ${y1 + direction * cornerRadius}`,
			`L ${midX} ${y2 - direction * cornerRadius}`,
			`Q ${midX} ${y2} ${midX + cornerRadius} ${y2}`,
			`L ${x2} ${y2}`
		]
		
		return path.join(' ')
	})
}

