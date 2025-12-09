// File này sẽ k động vào file core d3MindmapRenderer

export function installMindmapContextMenu(renderer) {
    const origUpdateNodes = renderer?.renderNodes.bind(renderer);

    renderer.renderNodes = function (nodesData) {
        // render bình thường
        origUpdateNodes(nodesData);

        // Bổ sung event context menu sau khi nodes được render
        const nodes = this.g.selectAll(".node-group");

        nodes.on("contextmenu.contextmenuPlugin", (event, d) => {
            event.preventDefault();
            event.stopPropagation();

            // ⚠️ CRITICAL: Context menu hiển thị cạnh vị trí chuột bên phải
            // Sử dụng clientX và clientY để lấy vị trí chuột trên viewport
            // Thêm offset nhỏ (8px) để menu hiển thị bên phải chuột, không che chuột
            this.callbacks?.onNodeContextMenu?.(d, {
                x: event.clientX + 8, // Vị trí X của chuột + offset để menu ở bên phải
                y: event.clientY      // Vị trí Y của chuột
            });
        });
    };
}
