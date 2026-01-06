import { nextTick } from 'vue'

/**
 * Mindmap Realtime Node Handlers
 * Xử lý các sự kiện realtime liên quan đến node operations
 */
export function useMindmapRealtimeNodes({
  store,
  nodes,
  edges,
  elements,
  selectedNode,
  editingNode,
  nodeEditingUsers,
  nodeCreationOrder,
  isSaving,
  entityName,
  d3Renderer,
  editingStartTime,
  changedNodeIds,
  calculateNodeHeightWithImages
}) {

  /**
   * Handle realtime nodes deleted
   */
  const handleRealtimeNodesDeleted = (payload) => {
    if (!payload) return
    
    if (payload.entity_name !== entityName) return
    
    const currentUser = store.state.user.id
    if (payload.modified_by === currentUser) {
      return
    }
    
    if (isSaving.value) {
      console.log('⏸️ Đang lưu, bỏ qua delete từ remote')
      return
    }
    
    console.log('📡 Nhận xóa nodes từ remote:', payload.node_ids)
    
    const nodeIdsToDelete = payload.node_ids || []
    if (!Array.isArray(nodeIdsToDelete) || nodeIdsToDelete.length === 0) {
      return
    }
    
    const editingNodeId = editingNode.value
    const selectedNodeId = selectedNode.value?.id
    
    if (nodeIdsToDelete.includes(editingNodeId) || nodeIdsToDelete.includes(selectedNodeId)) {
      selectedNode.value = null
      editingNode.value = null
    }
    
    const newNodes = nodes.value.filter(n => !nodeIdsToDelete.includes(n.id))
    const newEdges = edges.value.filter(e => 
      !nodeIdsToDelete.includes(e.source) && !nodeIdsToDelete.includes(e.target)
    )
    
    nodeIdsToDelete.forEach(nodeId => {
      nodeCreationOrder.value.delete(nodeId)
    })
    
    elements.value = [...newNodes, ...newEdges]
    
    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
    if (renderer) {
      nextTick(() => {
        renderer.setData(newNodes, newEdges, nodeCreationOrder.value)
        renderer.render()
      })
    }
  }

  /**
   * Handle realtime node editing
   */
  const handleRealtimeNodeEditing = (payload) => {
    if (!payload) return
    
    if (payload.entity_name !== entityName) return
    
    const currentUser = store.state.user.id
    if (payload.user_id === currentUser) {
      return
    }
    
    console.log(`📝 User ${payload.user_name} ${payload.is_editing ? 'bắt đầu' : 'kết thúc'} edit node:`, payload.node_id)
    
    if (payload.is_editing) {
      nodeEditingUsers.value.set(payload.node_id, {
        userId: payload.user_id,
        userName: payload.user_name
      })
    } else {
      nodeEditingUsers.value.delete(payload.node_id)
    }
    
    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
    if (renderer) {
      const nodeGroup = renderer.g.select(`[data-node-id="${payload.node_id}"]`)
      if (!nodeGroup.empty()) {
        const rect = nodeGroup.select('.node-rect')
        if (!rect.empty()) {
          if (payload.is_editing) {
            rect
              .style('stroke', '#f59e0b')
              .style('stroke-width', '2px')
              .attr('stroke-dasharray', '4 2')
            
            const existingBadge = nodeGroup.select('.editing-badge')
            if (existingBadge.empty()) {
              const badge = nodeGroup.append('g')
                .attr('class', 'editing-badge')
                .attr('transform', 'translate(10, -15)')
              
              const text = badge.append('text')
                .attr('x', 0)
                .attr('y', 14)
                .style('fill', 'white')
                .style('font-size', '11px')
                .style('font-weight', 'bold')
                .text(`${payload.user_name}`)
              
              const textBBox = text.node().getBBox()
              const padding = 12
              const badgeWidth = textBBox.width + padding * 2
              
              badge.insert('rect', 'text')
                .attr('width', badgeWidth)
                .attr('height', 20)
                .attr('rx', 10)
                .style('fill', '#f59e0b')
              
              text
                .attr('x', badgeWidth / 2)
                .attr('text-anchor', 'middle')
            }
          } else {
            rect
              .style('stroke', null)
              .style('stroke-width', null)
              .attr('stroke-dasharray', null)
            
            nodeGroup.select('.editing-badge').remove()
          }
        }
      }
    }
  }

  /**
   * Handle realtime nodes batch update
   */
  const handleRealtimeNodesBatchUpdate = (payload) => {
    if (!payload) return
    
    if (payload.entity_name !== entityName) return
    
    const currentUser = store.state.user.id
    if (payload.modified_by === currentUser) {
      return
    }
    
    if (isSaving.value) {
      console.log('⏸️ Đang lưu, bỏ qua batch update từ remote')
      return
    }
    
    console.log('📡 Nhận batch update nodes từ remote:', payload.node_ids)
    
    const remoteNodeUpdates = payload.nodes || []
    if (!Array.isArray(remoteNodeUpdates) || remoteNodeUpdates.length === 0) {
      return
    }
    
    const editingNodeId = editingNode.value
    const selectedNodeId = selectedNode.value?.id
    
    const remoteNodeIds = remoteNodeUpdates.map(n => n.id)
    if (remoteNodeIds.includes(editingNodeId) || remoteNodeIds.includes(selectedNodeId)) {
      console.log('⚠️ Remote update liên quan đến node đang edit/select, bỏ qua')
      return
    }
    
    const updatedNodes = nodes.value.map(localNode => {
      const remoteNode = remoteNodeUpdates.find(n => n.id === localNode.id)
      if (remoteNode) {
        if (remoteNode.data?.order !== undefined) {
          nodeCreationOrder.value.set(remoteNode.id, remoteNode.data.order)
        }
        return { ...localNode, ...remoteNode }
      }
      return localNode
    })
    
    elements.value = [...updatedNodes, ...edges.value]
    
    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
    if (renderer) {
      nextTick(() => {
        remoteNodeUpdates.forEach(updatedNode => {
          renderer.nodeSizeCache.delete(updatedNode.id)
        })
        
        renderer.setData(updatedNodes, edges.value, nodeCreationOrder.value)
        renderer.render()
      })
    }
  }

  const handleRealtimeNodeUpdate = (payload) => {
    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
    
      if (!payload) return
      
      if (payload.entity_name !== entityName) return
      
      const currentUser = store.state.user.id
      if (payload.modified_by === currentUser) {
        console.log('⏸️ Bỏ qua update từ chính mình')
        return
      }
      
      if (isSaving.value) {
        console.log('⏸️ Đang lưu, bỏ qua update từ remote')
        return
      }
      
      console.log('📡 Nhận update node từ remote:', payload.node_id, 'từ user:', payload.modified_by)
      
      const remoteNode = payload.node
      if (!remoteNode) {
        console.log('❌ Remote node không tồn tại')
        return
      }
      
      const editingNodeId = editingNode.value
      const selectedNodeId = selectedNode.value?.id
      
      console.log('🔍 Check editing state:', {
        remoteNodeId: remoteNode.id,
        editingNodeId,
        selectedNodeId,
        isLocalEditing: remoteNode.id === editingNodeId || remoteNode.id === selectedNodeId
      })
      
      const nodeIndex = nodes.value.findIndex(n => n.id === remoteNode.id)
      const isNodeBeingEdited = remoteNode.id === editingNodeId
      const isNodeSelected = remoteNode.id === selectedNodeId && remoteNode.id !== editingNodeId
      
      if (nodeIndex !== -1) {
        nodes.value[nodeIndex] = { ...remoteNode }
        console.log('✅ Đã cập nhật node vào nodes.value:', remoteNode.id)
      } else {
        nodes.value.push({ ...remoteNode })
        console.log('✅ Đã thêm node mới vào nodes.value:', remoteNode.id)
      }
      
      if (remoteNode.data?.order !== undefined) {
        nodeCreationOrder.value.set(remoteNode.id, remoteNode.data.order)
      }
      
      if (isNodeBeingEdited) {
        const timeSinceEditStart = editingStartTime.value ? Date.now() - editingStartTime.value : Infinity
        const hasLocalChanges = changedNodeIds.value.has(remoteNode.id)
        
        const shouldAllowUpdate = timeSinceEditStart < 2000 && !hasLocalChanges
        
        if (shouldAllowUpdate) {
          console.log('✨ Cho phép update editor vì vừa mới bắt đầu edit (<2s) và chưa có thay đổi')
        } else {
          console.log('⚠️ Node đang được LOCAL USER edit, bỏ qua render để không gián đoạn user', {
            timeSinceEditStart,
            hasLocalChanges
          })
          return
        }
      }
      
      if (payload.edge) {
        const remoteEdge = payload.edge
        const edgeIndex = edges.value.findIndex(e => e.id === remoteEdge.id)
        if (edgeIndex !== -1) {
          edges.value[edgeIndex] = { ...remoteEdge }
        } else {
          edges.value.push({ ...remoteEdge })
        }
      }
      
      if (renderer) {
        nextTick(() => {
          renderer.nodeSizeCache.delete(remoteNode.id)
          
          const d3Node = renderer.nodes.find(n => n.id === remoteNode.id)
          if (d3Node) {
            d3Node.data.label = remoteNode.data.label
            if (d3Node.data.fixedWidth || d3Node.data.fixedHeight) {
              delete d3Node.data.fixedWidth
              delete d3Node.data.fixedHeight
            }
          }
          
          renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
          renderer.render()
          
          if (isNodeSelected) {
            console.log('⚠️ Node đang được selected, bỏ qua update editor content để không gián đoạn user mở editor')
            return
          }
          
          const editorInstance = renderer.getEditorInstance(remoteNode.id)
          if (editorInstance && !editorInstance.isDestroyed) {
            try {
              editorInstance.commands.setContent(remoteNode.data.label, false)
              
              requestAnimationFrame(() => {
                setTimeout(() => {
                  requestAnimationFrame(() => {
                    const nodeGroup = renderer.g.select(`[data-node-id="${remoteNode.id}"]`)
                    if (!nodeGroup.empty()) {
                      const rect = nodeGroup.select('.node-rect')
                      const fo = nodeGroup.select('.node-text')
                      
                      if (!rect.empty() && !fo.empty()) {
                        const editorDOM = editorInstance.view?.dom
                        const editorContent = editorDOM?.querySelector('.mindmap-editor-prose') || editorDOM
                        
                        if (editorContent) {
                          const borderOffset = 4
                          const maxWidth = 400
                          const singleLineHeight = Math.ceil(19 * 1.4) + 16
                          
                          const hasImages = remoteNode.data?.label?.includes('<img') || remoteNode.data?.label?.includes('image-wrapper')
                          
                          let newSize
                          if (hasImages) {
                            newSize = { width: maxWidth, height: singleLineHeight }
                          } else {
                            newSize = renderer.estimateNodeSize(remoteNode)
                          }
                          
                          const foWidth = Math.max(0, newSize.width - borderOffset)
                          
                          rect.attr('width', newSize.width)
                          rect.node()?.setAttribute('width', newSize.width)
                          fo.attr('width', foWidth)
                          fo.node()?.setAttribute('width', foWidth)
                          
                          editorContent.style.setProperty('box-sizing', 'border-box', 'important')
                          editorContent.style.setProperty('width', `${foWidth}px`, 'important')
                          editorContent.style.setProperty('height', 'auto', 'important')
                          editorContent.style.setProperty('min-height', `${singleLineHeight}px`, 'important')
                          editorContent.style.setProperty('max-height', 'none', 'important')
                          editorContent.style.setProperty('overflow', 'visible', 'important')
                          editorContent.style.setProperty('padding', '8px 16px', 'important')
                          
                          const whiteSpaceValue = (newSize.width >= maxWidth || hasImages) ? 'pre-wrap' : 'nowrap'
                          editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
                          editorContent.style.setProperty('overflow-wrap', 'break-word', 'important')
                          
                          const wrapperNode = fo.select('.node-content-wrapper').node()
                          if (wrapperNode) {
                            wrapperNode.style.setProperty('width', '100%', 'important')
                            wrapperNode.style.setProperty('height', 'auto', 'important')
                            wrapperNode.style.setProperty('min-height', '0', 'important')
                            wrapperNode.style.setProperty('max-height', 'none', 'important')
                            wrapperNode.style.setProperty('overflow', 'visible', 'important')
                          }
                          
                          const containerNode = fo.select('.node-editor-container').node()
                          if (containerNode) {
                            containerNode.style.setProperty('width', '100%', 'important')
                            containerNode.style.setProperty('height', 'auto', 'important')
                            containerNode.style.setProperty('min-height', '0', 'important')
                            containerNode.style.setProperty('max-height', 'none', 'important')
                            containerNode.style.setProperty('overflow', 'visible', 'important')
                          }
                          
                          void editorContent.offsetWidth
                          void editorContent.offsetHeight
                          void editorContent.scrollHeight
                          
                          setTimeout(() => {
                            if (hasImages) {
                              const images = editorContent.querySelectorAll('img')
                              const allImagesLoaded = Array.from(images).every(img => img.complete && img.naturalHeight > 0)
                              
                              if (allImagesLoaded) {
                                const heightResult = calculateNodeHeightWithImages({
                                  editorContent,
                                  nodeWidth: newSize.width,
                                  htmlContent: remoteNode.data.label,
                                  singleLineHeight
                                })
                                newSize.height = heightResult.height
                              } else {
                                const imageLoadPromises = Array.from(images)
                                  .filter(img => !img.complete || img.naturalHeight === 0)
                                  .map(img => new Promise((resolve) => {
                                    if (img.complete && img.naturalHeight > 0) {
                                      resolve()
                                    } else {
                                      img.addEventListener('load', resolve, { once: true })
                                      img.addEventListener('error', () => {
                                        resolve()
                                      }, { once: true })
                                    }
                                  }))
                                
                                Promise.all(imageLoadPromises).then(() => {
                                  setTimeout(() => {
                                    const heightResult = calculateNodeHeightWithImages({
                                      editorContent,
                                      nodeWidth: newSize.width,
                                      htmlContent: remoteNode.data.label,
                                      singleLineHeight
                                    })
                                    newSize.height = heightResult.height
                                    
                                    renderer.nodeSizeCache.set(remoteNode.id, newSize)
                                    
                                    const node = renderer.nodes.find((n) => n.id === remoteNode.id)
                                    if (node && !node.data) node.data = {}
                                    
                                    // ⚠️ CRITICAL: Update node.data.rect để D3 biết size mới khi vẽ edges
                                    if (node) {
                                      node.data.rect = { width: newSize.width, height: newSize.height }
                                    }
                                    
                                    rect.attr('height', newSize.height)
                                    rect.node()?.setAttribute('height', newSize.height)
                                    
                                    const foHeight = Math.max(0, newSize.height - borderOffset)
                                    fo.attr('height', foHeight)
                                    fo.node()?.setAttribute('height', foHeight)
                                    
                                    // Re-select wrapperNode và containerNode trong scope này
                                    const wrapperNode2 = fo.select('.node-content-wrapper').node()
                                    if (wrapperNode2) {
                                      wrapperNode2.style.setProperty('height', `${foHeight}px`, 'important')
                                      wrapperNode2.style.setProperty('min-height', `${foHeight}px`, 'important')
                                    }
                                    
                                    const containerNode2 = fo.select('.node-editor-container').node()
                                    if (containerNode2) {
                                      containerNode2.style.setProperty('height', `${foHeight}px`, 'important')
                                      containerNode2.style.setProperty('min-height', `${foHeight}px`, 'important')
                                    }
                                    
                                    // foWidth đã được set ở trên (dòng 6304), không cần set lại
                                    
                                    nodeGroup.select('.add-child-btn').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                                    nodeGroup.select('.add-child-text').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
                                    nodeGroup.select('.collapse-btn-number').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                                    nodeGroup.select('.collapse-text-number').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
                                    nodeGroup.select('.collapse-btn-arrow').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                                    nodeGroup.select('.collapse-arrow').attr('transform', `translate(${newSize.width + 20}, ${newSize.height / 2}) scale(0.7) translate(-12, -12)`)
                                    nodeGroup.select('.collapse-button-bridge').attr('width', 20).attr('x', newSize.width).attr('height', newSize.height)
                                    nodeGroup.select('.node-hover-layer').attr('width', newSize.width + 40).attr('height', newSize.height)
                                    
                                    // ⚠️ CRITICAL: Update nodes.value với size mới để D3 biết khi recalculate layout
                                    const vueNode = nodes.value.find(n => n.id === remoteNode.id)
                                    if (vueNode && vueNode.data) {
                                      vueNode.data.rect = { width: newSize.width, height: newSize.height }
                                    }
                                    
                                    // Clear position của node này để force recalculate
                                    if (renderer.positions) {
                                      renderer.positions.delete(remoteNode.id)
                                    }
                                    
                                    // setData lại với nodes.value đã update, sau đó render
                                    requestAnimationFrame(() => {
                                      if (renderer) {
                                        renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
                                        renderer.render(true)
                                      }
                                    })
                                  }, 20)
                                })
                                return
                              }
                            } else {
                              const contentScrollHeight = editorContent.scrollHeight || editorContent.offsetHeight || 0
                              newSize.height = Math.max(contentScrollHeight, singleLineHeight)
                            }
                            
                            renderer.nodeSizeCache.set(remoteNode.id, newSize)
                            
                            const node = renderer.nodes.find((n) => n.id === remoteNode.id)
                            if (node && !node.data) node.data = {}
                            
                            // ⚠️ CRITICAL: Update node.data.rect để D3 biết size mới khi vẽ edges
                            if (node) {
                              node.data.rect = { width: newSize.width, height: newSize.height }
                            }
                            
                            rect.attr('width', newSize.width)
                            rect.attr('height', newSize.height)
                            rect.node()?.setAttribute('width', newSize.width)
                            rect.node()?.setAttribute('height', newSize.height)
                            
                            const foWidth = Math.max(0, newSize.width - borderOffset)
                            const foHeight = Math.max(0, newSize.height - borderOffset)
                            fo.attr('width', foWidth)
                            fo.attr('height', foHeight)
                            fo.node()?.setAttribute('width', foWidth)
                            fo.node()?.setAttribute('height', foHeight)
                            
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
                            
                            editorContent.style.setProperty('width', `${foWidth}px`, 'important')
                            
                            nodeGroup.select('.add-child-btn').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                            nodeGroup.select('.add-child-text').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
                            nodeGroup.select('.collapse-btn-number').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                            nodeGroup.select('.collapse-text-number').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
                            nodeGroup.select('.collapse-btn-arrow').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                            nodeGroup.select('.collapse-arrow').attr('transform', `translate(${newSize.width + 20}, ${newSize.height / 2}) scale(0.7) translate(-12, -12)`)
                            nodeGroup.select('.collapse-button-bridge').attr('width', 20).attr('x', newSize.width).attr('height', newSize.height)
                            nodeGroup.select('.node-hover-layer').attr('width', newSize.width + 40).attr('height', newSize.height)
                            
                            // ⚠️ CRITICAL: Update nodes.value với size mới để D3 biết khi recalculate layout
                            const vueNode = nodes.value.find(n => n.id === remoteNode.id)
                            if (vueNode && vueNode.data) {
                              vueNode.data.rect = { width: newSize.width, height: newSize.height }
                            }
                            
                            // Clear position của node này để force recalculate
                            if (renderer.positions) {
                              renderer.positions.delete(remoteNode.id)
                            }
                            
                            // setData lại với nodes.value đã update, sau đó render
                            requestAnimationFrame(() => {
                              if (renderer) {
                                renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
                                renderer.render(true)
                              }
                            })
                          }, 50)
                        }
                      }
                    }
                  })
                }, 10)
              })
            } catch (err) {
              console.error('Error updating node content:', err)
            }
          }
        })
      }
  }

  return {
    handleRealtimeNodesDeleted,
    handleRealtimeNodeEditing,
    handleRealtimeNodesBatchUpdate,
    handleRealtimeNodeUpdate
  }
}

