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

            this.callbacks?.onNodeContextMenu?.(d, {
                x: event.clientX - 280,
                y: event.clientY - 70
            });
        });
    };
}
