/**
 * Node Selection Module
 * Handles node selection logic
 */

import * as d3 from "d3"

export function selectCommentNode(renderer, nodeId, skipCallback = false) {
  renderer.selectedNode = nodeId

  // Update node styles
  renderer.g
    .selectAll(".node-group")
    .select(".node-rect")
    .attr("fill", (d) => {
      if (renderer.selectedNode === d.id) return "#e0e7ff"
      return "#ffffff"
    })
    .attr("stroke", (d) => {
      if (renderer.selectedNode === d.id) return " #ffc60a"
      return "#cbd5e1"
    })
    .attr("stroke-width", 2)

  // ⚠️ FIX: Chỉ gọi callback nếu không skip (tránh vòng lặp vô hạn)
  // Khi deselect (nodeId === null), chỉ gọi callback nếu không skip
  if (!skipCallback && nodeId === null && renderer.callbacks.onNodeClick) {
    renderer.callbacks.onNodeClick(null)
  }

  // Nếu deselect, đảm bảo tất cả buttons đều được ẩn ngay lập tức
  if (nodeId === null) {
    renderer.g.selectAll(".node-group").each(function () {
      const nodeGroup = d3.select(this)
      nodeGroup
        .select(".add-child-btn")
        .interrupt()
        .attr("opacity", 0)
        .style("pointer-events", "none")
      nodeGroup
        .select(".add-child-text")
        .interrupt()
        .attr("opacity", 0)
        .style("pointer-events", "none")
    })
  }

  // ✅ LOGIC HIỂN THỊ NÚT - 3 NÚT TÁCH BIỆT:
  // 1. Nút số: chỉ khi collapsed (ưu tiên cao nhất)
  // 2. Nút thêm mới: chỉ khi selected và chưa collapse
  // 3. Nút collapse mũi tên: luôn ẩn (chỉ hiện khi hover)
  renderer.g.selectAll(".node-group").each(function (nodeData) {
    const isSelected = renderer.selectedNode === nodeData.id
    const hasChildren = renderer.edges.some((e) => e.source === nodeData.id)
    const isCollapsed = renderer.collapsedNodes.has(nodeData.id)
    const nodeGroup = d3.select(this)

    // 1. Nút số: chỉ khi collapsed (ưu tiên cao nhất)
    if (hasChildren && isCollapsed) {
      nodeGroup
        .select(".collapse-btn-number")
        .attr("opacity", 1)
        .style("pointer-events", "auto")
      nodeGroup.select(".collapse-text-number").attr("opacity", 1)

      // Ẩn nút thêm mới khi collapsed và tắt pointer-events
      nodeGroup
        .select(".add-child-btn")
        .attr("opacity", 0)
        .style("pointer-events", "none")
      nodeGroup
        .select(".add-child-text")
        .attr("opacity", 0)
        .style("pointer-events", "none")
    } else {
      nodeGroup
        .select(".collapse-btn-number")
        .attr("opacity", 0)
        .style("pointer-events", "none")
      nodeGroup
        .select(".collapse-text-number")
        .attr("opacity", 0)
        .style("pointer-events", "none")

      // 2. Nút thêm mới: chỉ khi selected và chưa collapse
      if (isSelected && !isCollapsed) {
        nodeGroup
          .select(".add-child-btn")
          .transition()
          .duration(150)
          .attr("opacity", 1)
          .style("pointer-events", "auto")
        nodeGroup
          .select(".add-child-text")
          .transition()
          .duration(150)
          .attr("opacity", 1)
      } else {
        // Ẩn ngay lập tức khi deselect (không có transition để tránh delay)
        nodeGroup
          .select(".add-child-btn")
          .interrupt() // Dừng transition nếu đang chạy
          .attr("opacity", 0)
          .style("pointer-events", "none")
        nodeGroup
          .select(".add-child-text")
          .interrupt() // Dừng transition nếu đang chạy
          .attr("opacity", 0)
          .style("pointer-events", "none")
      }
    }

    // 3. Nút collapse mũi tên: luôn ẩn (chỉ hiện khi hover trong mouseenter) và tắt pointer-events
    nodeGroup
      .select(".collapse-btn-arrow")
      .attr("opacity", 0)
      .style("pointer-events", "none")
    nodeGroup
      .select(".collapse-arrow")
      .attr("opacity", 0)
      .style("pointer-events", "none")
  })
}
