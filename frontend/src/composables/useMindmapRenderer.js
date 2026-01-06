import { ref, nextTick } from 'vue'
import { D3MindmapRenderer } from '@/utils/d3mindmap'
import { installMindmapContextMenu } from '@/utils/mindmapExtensions'
import { toast } from '@/utils/toasts'
import { scrollToNode } from '@/utils/d3mindmap/viewUtils'

export function useMindmapRenderer({
  d3Container,
  nodes,
  edges,
  nodeCreationOrder,
  permissions,
  selectedNode,
  editingNode,
  changedNodeIds,
  hoveredNode,
  showContextMenu,
  contextMenuNode,
  contextMenuPos,
  contextMenuCentered,
  editingStartTime,
  nodeEditingUsers,
  isRendering,
  isMindmapReady,
  extractTitleFromLabel,
  renameMindmapTitle,
  updateD3Renderer,
  updateD3RendererWithDelay,
  saveSnapshot,
  scheduleSave,
  broadcastNodeEditing,
  showTaskLinkDragWarning,
  applyStrikethroughToTitle,
  handleContextMenuAction,
  uploadImageToMindmap,
  team,
  entityName
}) {
  const d3Renderer = ref(null)
  let textInputSaveTimeout = null
  const TEXT_INPUT_SAVE_DELAY = 300

  const initD3Renderer = async () => {
    if (!d3Container.value) return

    isRendering.value = true

    d3Renderer.value = new D3MindmapRenderer(d3Container.value, {
      width: window.innerWidth,
      height: window.innerHeight - 84,
      nodeSpacing: 20,
      layerSpacing: 40,
      padding: 20,
      nodeCreationOrder: nodeCreationOrder.value,
      permissions: permissions.value
    })

    d3Renderer.value.uploadImage = async (file) => {
      return await uploadImageToMindmap(file, team, entityName)
    }

    installMindmapContextMenu(d3Renderer.value)

    d3Renderer.value.setCallbacks({
      onNodeClick: (node, event) => {
        if (showContextMenu.value) {
          showContextMenu.value = false
        }
        
        if (event?.target?.closest?.('.comment-count-badge')) {
          return
        }
        if (node) {
          selectedNode.value = node
          d3Renderer.value.selectNode(node.id, false)
        } else {
          selectedNode.value = null
          d3Renderer.value.selectNode(null, true)
        }
      },
      onNodeDoubleClick: () => {
      },
      onNodeAdd: (parentId) => {
        if (typeof window.__addChildToNode === 'function') {
          window.__addChildToNode(parentId)
        }
      },
      onNodeUpdate: (nodeId, updates) => {
        const node = nodes.value.find(n => n.id === nodeId)
        if (!node) return

        if (!permissions.value.write) {
          if (updates.label !== undefined) {
            toast.error("Bạn không có quyền chỉnh sửa node")
            return
          }
          if (updates.parentId !== undefined) {
            toast.error("Bạn không có quyền di chuyển node")
            return
          }
        }

        if (updates.label !== undefined) {
          node.data.label = updates.label
          changedNodeIds.value.add(nodeId)
        }

        if (updates.parentId !== undefined) {
          if (nodeId === updates.parentId) {
            console.warn(`Cannot make node ${nodeId} a child of itself`)
            toast.error("Không thể di chuyển node thành con của chính nó")
            return
          }
          
          const isDescendant = (potentialParent, checkNodeId) => {
            if (potentialParent === checkNodeId) return true
            const parentEdge = edges.value.find(e => e.target === potentialParent)
            if (!parentEdge) return false
            return isDescendant(parentEdge.source, checkNodeId)
          }
          
          if (isDescendant(updates.parentId, nodeId)) {
            console.warn(`Circular reference detected: ${nodeId} -> ${updates.parentId}`)
            toast.error("Không thể di chuyển node vào nhánh con của chính nó")
            return
          }
          
          saveSnapshot()
          
          node.data = node.data || {}
          node.data.parentId = updates.parentId
          changedNodeIds.value.add(nodeId)

          const edgeIndex = edges.value.findIndex(e => e.target === nodeId)
          if (edgeIndex !== -1) {
            edges.value[edgeIndex] = {
              ...edges.value[edgeIndex],
              source: updates.parentId,
            }
          } else {
            edges.value.push({
              id: `edge-${updates.parentId}-${nodeId}`,
              source: updates.parentId,
              target: nodeId,
            })
          }

          updateD3RendererWithDelay()
        }

        if (updates.skipSizeCalculation) {
          saveSnapshot()
          scheduleSave()
          return
        }

        if (textInputSaveTimeout) {
          clearTimeout(textInputSaveTimeout)
        }
        textInputSaveTimeout = setTimeout(() => {
          scheduleSave()
          textInputSaveTimeout = null
        }, TEXT_INPUT_SAVE_DELAY)
      },
      onNodeReorder: (nodeId, newOrder) => {
        saveSnapshot()
        
        nodeCreationOrder.value.set(nodeId, newOrder)

        if (d3Renderer.value) {
          d3Renderer.value.options.nodeCreationOrder = nodeCreationOrder.value
          d3Renderer.value.render()
        }

        scheduleSave()
      },
      onNodeEditingStart: (nodeId) => {
        const editingUser = nodeEditingUsers.value.get(nodeId)
        if (editingUser) {
          toast({
            title: `${editingUser.userName} đang chỉnh sửa node này`,
            text: "Vui lòng đợi họ hoàn thành",
            indicator: "orange",
            timeout: 3
          })
          return false
        }
        
        editingNode.value = nodeId
        editingStartTime.value = Date.now()
        broadcastNodeEditing(nodeId, true)
        return true
      },
      onNodeEditingEnd: (nodeId) => {
        const finishedNodeId = nodeId || editingNode.value
        if (finishedNodeId) {
          const node = nodes.value.find(n => n.id === finishedNodeId)
          if (node) {
            const hasChanges = changedNodeIds.value.has(finishedNodeId)
            
            if (hasChanges) {
              saveSnapshot()
            }

            if (node.id === 'root' || node.data?.isRoot) {
              const originalLabel = (node.data?.label || '').trim()
              let newTitle = extractTitleFromLabel(originalLabel)

              if (!newTitle) {
                newTitle = "Sơ đồ"
                node.data.label = newTitle
              }

              renameMindmapTitle(newTitle)
            }

            if (hasChanges) {
              if (typeof window.__saveImmediately === 'function') {
                window.__saveImmediately()
              }
            }
          }
        }

        broadcastNodeEditing(finishedNodeId, false)
        
        editingNode.value = null
        editingStartTime.value = null

        updateD3RendererWithDelay(300)
      },
      onNodeHover: (nodeId, isHovering) => {
        hoveredNode.value = isHovering ? nodeId : null
      },
      onNodeCollapse: (nodeId, isCollapsed) => {
        updateD3Renderer()
      },
      onRenderComplete: () => {
        if (typeof window.__scrollToNodeFromHash === 'function') {
          window.__scrollToNodeFromHash()
        }
        isRendering.value = false
        isMindmapReady.value = true
        
        nextTick(() => {
          setTimeout(() => {
            nodes.value.forEach(node => {
              if (node.id !== 'root') {
                const editorInstance = d3Renderer.value?.getEditorInstance?.(node.id)
                if (editorInstance) {
                  const isCompleted = node.data?.completed || false
                  applyStrikethroughToTitle(editorInstance, isCompleted)
                }
              }
            })
          }, 200)
        })
      },
      onNodeContextMenu: (node, pos) => {
        contextMenuNode.value = node
        contextMenuPos.value = pos
        contextMenuCentered.value = false
        showContextMenu.value = true
      },
      onOpenCommentList: handleContextMenuAction,
      onTaskLinkDragConfirm: async (nodeId) => {
        return await showTaskLinkDragWarning(nodeId)
      },
    })

    updateD3Renderer()
  }

  const fitView = () => {
    if (d3Renderer.value) {
      d3Renderer.value.fitView()
    }
  }

  const zoomIn = () => {
    if (d3Renderer.value && d3Renderer.value.svg) {
      d3Renderer.value.svg.transition()
        .call(d3Renderer.value.zoom.scaleBy, 1.2)
    }
  }

  const zoomOut = () => {
    if (d3Renderer.value && d3Renderer.value.svg) {
      d3Renderer.value.svg.transition()
        .call(d3Renderer.value.zoom.scaleBy, 0.8)
    }
  }

  const scrollToNodeFromHash = () => {
    const hash = window.location.hash
    if (hash && hash.startsWith('#node-')) {
      const nodeId = hash.substring(1)
      const node = nodes.value.find(n => n.id === nodeId)
      
      if (node && d3Renderer.value) {
        setTimeout(() => {
          scrollToNode(d3Renderer.value, nodeId)
          d3Renderer.value.selectNode(nodeId, false)
          selectedNode.value = node
        }, 500)
      }
    }
  }

  const handleResize = () => {
    if (d3Renderer.value) {
      d3Renderer.value.options.width = window.innerWidth
      d3Renderer.value.options.height = window.innerHeight - 84
      if (d3Renderer.value.svg) {
        d3Renderer.value.svg.attr('width', window.innerWidth)
        d3Renderer.value.svg.attr('height', window.innerHeight - 84)
      }
      updateD3Renderer()
    }
  }

  const destroy = () => {
    if (d3Renderer.value) {
      d3Renderer.value.destroy()
      d3Renderer.value = null
    }
    if (textInputSaveTimeout) {
      clearTimeout(textInputSaveTimeout)
      textInputSaveTimeout = null
    }
  }

  return {
    d3Renderer,
    initD3Renderer,
    fitView,
    zoomIn,
    zoomOut,
    scrollToNodeFromHash,
    handleResize,
    destroy
  }
}

