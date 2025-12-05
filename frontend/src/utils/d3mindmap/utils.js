/**
 * Utility functions for D3 Mindmap Renderer
 */

import * as d3 from 'd3'

/**
 * Helper function để lấy label một cách an toàn (luôn trả về string)
 */
export function getNodeLabel(node) {
	const label = node?.data?.label
	if (label == null) return ''
	return typeof label === 'string' ? label : String(label)
}

/**
 * Check if a node is hidden due to collapsed ancestor
 */
export function isNodeHidden(nodeId, edges, collapsedNodes) {
	// Check if any ancestor is collapsed
	let currentId = nodeId
	while (currentId) {
		// Find parent edge
		const parentEdge = edges.find(e => e.target === currentId)
		if (!parentEdge) break
		
		// Check if parent is collapsed
		if (collapsedNodes.has(parentEdge.source)) {
			return true
		}
		
		currentId = parentEdge.source
	}
	return false
}

/**
 * Get all descendant node IDs
 */
export function getDescendantIds(nodeId, edges) {
	const descendants = []
	const children = edges.filter(e => e.source === nodeId).map(e => e.target)
	
	children.forEach(childId => {
		descendants.push(childId)
		descendants.push(...getDescendantIds(childId, edges))
	})
	
	return descendants
}

/**
 * Check if a node is a descendant of another node
 */
export function isDescendant(ancestorId, nodeId, edges) {
	if (ancestorId === nodeId) return false
	const descendants = getDescendantIds(ancestorId, edges)
	return descendants.includes(nodeId)
}

/**
 * Count all descendants (children + cháu + ... ) của một node
 * Dùng cho nút hiển thị tổng số nhánh con khi một node bị thu gọn.
 */
export function countChildren(nodeId, edges) {
	const visited = new Set()
	let count = 0
	const stack = [nodeId]

	while (stack.length > 0) {
		const current = stack.pop()
		const childrenEdges = edges.filter(e => e.source === current)

		childrenEdges.forEach(edge => {
			const childId = edge.target
			if (!visited.has(childId)) {
				visited.add(childId)
				count += 1
				stack.push(childId)
			}
		})
	}

	// Không tính chính node, chỉ tính toàn bộ descendants
	return count
}

/**
 * Cleanup drag branch effects (restore opacity, remove border, etc.)
 */
export function cleanupDragBranchEffects(renderer) {
	// Xóa border nét đứt bao quanh nhánh
	if (renderer.dragBranchGhost) {
		// Xóa cả group chứa rect
		const ghostGroup = renderer.dragBranchGhost.node()?.parentNode
		if (ghostGroup) {
			d3.select(ghostGroup).remove()
		} else {
			renderer.dragBranchGhost.remove()
		}
		renderer.dragBranchGhost = null
	}
	
	// Xóa group nếu còn sót lại
	const ghostGroup = renderer.g.select('.drag-branch-ghost-group')
	if (!ghostGroup.empty()) {
		ghostGroup.remove()
	}
	
	// Restore opacity của tất cả các node trong nhánh
	renderer.dragBranchNodeIds.forEach(nodeId => {
		const branchNodeGroup = renderer.g.select(`[data-node-id="${nodeId}"]`)
		if (!branchNodeGroup.empty()) {
			branchNodeGroup.style('opacity', 1)
			branchNodeGroup.style('pointer-events', 'auto')
		}
	})
	
	// Restore opacity của tất cả các edge liên quan đến nhánh
	const branchNodeIdsSet = new Set(renderer.dragBranchNodeIds)
	renderer.edges.forEach(edge => {
		const isSourceInBranch = branchNodeIdsSet.has(edge.source)
		const isTargetInBranch = branchNodeIdsSet.has(edge.target)
		
		// Restore tất cả edge có source hoặc target trong nhánh
		if (isSourceInBranch || isTargetInBranch) {
			const edgeElement = renderer.g.select(`.edge[data-edge-id="${edge.id}"]`)
			if (!edgeElement.empty()) {
				edgeElement
					.classed('drag-branch-edge', false) // Xóa class đánh dấu
					.style('opacity', 1) // Restore opacity về 1
			}
		}
	})
	
	// Reset danh sách node trong nhánh
	renderer.dragBranchNodeIds = []
}

