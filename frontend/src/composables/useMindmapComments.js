export function useMindmapComments({ 
  activeCommentNode,
  showPanel,
  suppressPanelAutoFocus,
  d3Renderer
}) {
  
  const openCommentPanel = (node, { focus = false } = {}) => {
    if (!node) return
    
    activeCommentNode.value = node
    showPanel.value = true
    
    if (focus) {
      suppressPanelAutoFocus.value = false
    } else {
      suppressPanelAutoFocus.value = true
    }
  }

  const onCancelComment = () => {
    activeCommentNode.value = null
  }

  const handleHighlightNode = (node) => {
    if (!node) return

    let nodeID = node.id || node.node_id
    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer
    renderer?.selectCommentNode(nodeID, false)
  }

  const handleSelectCommentNode = (node) => {
    if (!node) return

    if (activeCommentNode.value?.id === node.id) {
      return
    }

    activeCommentNode.value = node
    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer
    renderer?.selectCommentNode(node.id, false)
  }

  const onOpenComment = (node) => {
    openCommentPanel(node, { focus: true })
  }

  return {
    openCommentPanel,
    onCancelComment,
    handleHighlightNode,
    handleSelectCommentNode,
    onOpenComment,
  }
}

