import { createResource } from 'frappe-ui'

export function useMindmapSave({ 
  isSaving, 
  savingCount, 
  lastSaved, 
  formatTime,
  changedNodeIds,
  SAVE_DELAY 
}) {
  let saveTimeout = null

  const saveNodeResource = createResource({
    url: "drive.api.mindmap.save_mindmap_node",
    method: "POST",
    onSuccess() {
      savingCount.value--
      if (savingCount.value <= 0) {
        savingCount.value = 0
        isSaving.value = false
      }
      lastSaved.value = formatTime(new Date())
    },
    onError() {
      savingCount.value--
      if (savingCount.value <= 0) {
        savingCount.value = 0
        isSaving.value = false
      }
    }
  })

  const deleteNodesResource = createResource({
    url: "drive.api.mindmap.delete_mindmap_nodes",
    method: "POST",
    onSuccess() {
      savingCount.value--
      if (savingCount.value <= 0) {
        savingCount.value = 0
        isSaving.value = false
      }
      lastSaved.value = formatTime(new Date())
    },
    onError() {
      savingCount.value--
      if (savingCount.value <= 0) {
        savingCount.value = 0
        isSaving.value = false
      }
    }
  })

  const saveNodesBatchResource = createResource({
    url: "drive.api.mindmap.save_mindmap_nodes_batch",
    method: "POST",
    onSuccess() {
      savingCount.value--
      if (savingCount.value <= 0) {
        savingCount.value = 0
        isSaving.value = false
      }
      lastSaved.value = formatTime(new Date())
    },
    onError() {
      savingCount.value--
      if (savingCount.value <= 0) {
        savingCount.value = 0
        isSaving.value = false
      }
    }
  })

  const broadcastEditingResource = createResource({
    url: "drive.api.mindmap.broadcast_node_editing",
    method: "POST"
  })

  const saveNode = ({ nodeId, entityName, nodes, edges, d3Renderer, nodeCreationOrder, permissions, mindmapData }) => {
    if (!mindmapData || !permissions.value.write) return

    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) return

    console.log('💾 [saveNode] Saving node:', nodeId, {
      parentId: node.data?.parentId,
      stackTrace: new Error().stack.split('\n').slice(1, 4).join('\n')
    });

    const { count, ...nodeData } = node
    const nodeWithPos = { ...nodeData }
    
    // ⚠️ CRITICAL: Đảm bảo nodeWithPos.data.label có giá trị từ node.data.label trước
    if (!nodeWithPos.data) {
      nodeWithPos.data = {}
    }
    // Luôn đảm bảo có label từ node.data.label làm fallback
    if (!nodeWithPos.data.label && node.data?.label) {
      nodeWithPos.data.label = node.data.label
    }

    // ⚠️ FIX: Nếu editor đang mount và có content đầy đủ, lấy label từ editor.getHTML()
    // Tránh dùng label bị corrupt từ realtime update
    // ⚠️ CRITICAL: Chỉ dùng editor.getHTML() nếu nó có giá trị đầy đủ, nếu không dùng node.data.label
    if (d3Renderer) {
      const editorInstance = d3Renderer.getEditorInstance?.(nodeId)
      if (editorInstance && !editorInstance.isDestroyed && editorInstance.getHTML) {
        const editorLabel = editorInstance.getHTML()
        // ⚠️ FIX: Normalize Unicode để tránh lỗi dấu tiếng Việt khi undo/redo
        const normalizedLabel = editorLabel && typeof editorLabel === 'string' 
          ? editorLabel.normalize('NFC') 
          : editorLabel
        // Chỉ dùng editorLabel nếu nó có giá trị và không rỗng
        if (normalizedLabel && normalizedLabel.trim() !== '' && normalizedLabel !== '<p></p>' && normalizedLabel !== '<p data-type="node-title"></p>') {
          console.log('[DEBUG] 📝 Lấy label từ editor.getHTML() thay vì node.data.label:', {
            nodeId,
            editorLabelLength: normalizedLabel.length,
            editorLabelPreview: normalizedLabel.substring(0, 100),
            nodeLabelLength: nodeWithPos.data?.label?.length || 0,
            nodeLabelPreview: nodeWithPos.data?.label?.substring(0, 100) || ''
          })
          nodeWithPos.data.label = normalizedLabel
        } else {
          // Editor có nhưng content rỗng, dùng label từ node.data.label (đã set ở trên)
          console.log('[DEBUG] ⚠️ Editor.getHTML() trả về rỗng cho node:', nodeId, 'dùng label từ node.data.label:', {
            nodeLabelLength: nodeWithPos.data?.label?.length || 0,
            nodeLabelPreview: nodeWithPos.data?.label?.substring(0, 100) || ''
          })
        }
      } else {
        // Editor chưa sẵn sàng, dùng label từ node.data.label (đã set ở trên)
        console.log('[DEBUG] 💾 Editor chưa sẵn sàng, dùng label từ node.data.label:', {
          nodeId,
          nodeLabelLength: nodeWithPos.data?.label?.length || 0,
          nodeLabelPreview: nodeWithPos.data?.label?.substring(0, 100) || ''
        })
      }
    }
    
    // ⚠️ CRITICAL: Đảm bảo label có giá trị trước khi lưu
    if (!nodeWithPos.data?.label || nodeWithPos.data.label.trim() === '') {
      console.warn('[DEBUG] ⚠️ Node không có label, không thể lưu:', nodeId, {
        hasNodeData: !!node.data,
        hasNodeDataLabel: !!node.data?.label,
        nodeDataLabelLength: node.data?.label?.length || 0
      })
      return
    }
    
    console.log('[DEBUG] ✅ Node có label đầy đủ, sẽ lưu:', nodeId, {
      labelLength: nodeWithPos.data.label.length,
      labelPreview: nodeWithPos.data.label.substring(0, 100)
    })

    if (d3Renderer && d3Renderer.positions) {
      const pos = d3Renderer.positions.get(nodeId)
      if (pos) {
        nodeWithPos.position = { ...pos }
      }
    }

    if (nodeCreationOrder.value.has(nodeId)) {
      const order = nodeCreationOrder.value.get(nodeId)
      if (!nodeWithPos.data) {
        nodeWithPos.data = {}
      }
      nodeWithPos.data.order = order
    }

    const edge = edges.value.find(e => e.target === nodeId)

    const params = {
      entity_name: entityName,
      node_id: nodeId,
      node_data: JSON.stringify(nodeWithPos)
    }

    if (edge) {
      params.edge_data = JSON.stringify(edge)
    }

    savingCount.value++
    console.log('📤 [saveNode] Calling API save_mindmap_node for:', nodeId);
    saveNodeResource.submit(params)

    changedNodeIds.value.delete(nodeId)
  }

  const saveImmediately = ({ entityName, nodes, edges, d3Renderer, nodeCreationOrder, permissions, mindmapData, elements }) => {
    if (!mindmapData || elements.value.length === 0) return

    if (!permissions.value.write) {
      return
    }

    if (changedNodeIds.value.size > 0) {
      console.log('💾 [saveImmediately] Called with changedNodeIds:', Array.from(changedNodeIds.value), {
        stackTrace: new Error().stack.split('\n').slice(1, 5).join('\n')
      });
      
      isSaving.value = true

      const nodeIdsArray = Array.from(changedNodeIds.value)

      if (nodeIdsArray.length > 3) {
        const nodesToSave = []
        const edgesToSave = []

        nodeIdsArray.forEach(nodeId => {
          const node = nodes.value.find(n => n.id === nodeId)
          if (!node) return

          const { count, ...nodeData } = node
          const nodeWithPos = { ...nodeData }

          // ⚠️ CRITICAL: Đảm bảo label có giá trị
          if (!nodeWithPos.data) {
            nodeWithPos.data = {}
          }
          // Đảm bảo nodeWithPos.data.label có giá trị từ node.data.label
          if (!nodeWithPos.data.label && node.data?.label) {
            nodeWithPos.data.label = node.data.label
            console.log('[DEBUG] 💾 [saveImmediately] Đảm bảo label có giá trị cho node:', nodeId, {
              labelLength: nodeWithPos.data.label.length,
              labelPreview: nodeWithPos.data.label.substring(0, 100)
            })
          }
          
          // ⚠️ CRITICAL: Kiểm tra label trước khi lưu
          if (!nodeWithPos.data.label || nodeWithPos.data.label.trim() === '') {
            console.warn('[DEBUG] ⚠️ [saveImmediately] Node không có label, bỏ qua:', nodeId)
            return
          }

          if (d3Renderer && d3Renderer.positions) {
            const pos = d3Renderer.positions.get(nodeId)
            if (pos) {
              nodeWithPos.position = { ...pos }
            }
          }

          if (nodeCreationOrder.value.has(nodeId)) {
            const order = nodeCreationOrder.value.get(nodeId)
            nodeWithPos.data.order = order
          }

          nodesToSave.push(nodeWithPos)

          const edge = edges.value.find(e => e.target === nodeId)
          if (edge && !edgesToSave.find(e => e.id === edge.id)) {
            edgesToSave.push(edge)
          }
        })

        if (nodesToSave.length > 0) {
          savingCount.value++
          saveNodesBatchResource.submit({
            entity_name: entityName,
            nodes_data: JSON.stringify(nodesToSave),
            edges_data: edgesToSave.length > 0 ? JSON.stringify(edgesToSave) : null
          })
          
          // ⚠️ CRITICAL FIX: Chỉ xóa nodes đã save, tránh xóa mất nodes mới
          nodeIdsArray.forEach(nodeId => {
            changedNodeIds.value.delete(nodeId)
          })
        } else {
          isSaving.value = false
          nodeIdsArray.forEach(nodeId => {
            changedNodeIds.value.delete(nodeId)
          })
        }
      } else {
        const savedCount = nodeIdsArray.filter(nodeId => {
          const node = nodes.value.find(n => n.id === nodeId)
          if (node) {
            saveNode({ nodeId, entityName, nodes, edges, d3Renderer, nodeCreationOrder, permissions, mindmapData })
            return true
          }
          return false
        }).length

        if (savedCount === 0) {
          isSaving.value = false
          // ⚠️ FIX: Chỉ xóa nodes đã try save
          nodeIdsArray.forEach(nodeId => {
            changedNodeIds.value.delete(nodeId)
          })
        }
      }
    } else {
      console.log('⏭️ Không có node nào thay đổi, bỏ qua save')
    }
  }

  const scheduleSave = (params) => {
    if (!params.mindmapData) return

    if (!params.permissions.value.write) {
      return
    }

    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }

    saveTimeout = setTimeout(() => {
      saveImmediately(params)
    }, SAVE_DELAY)
  }

  return {
    saveNodeResource,
    deleteNodesResource,
    saveNodesBatchResource,
    broadcastEditingResource,
    saveNode,
    saveImmediately,
    scheduleSave,
  }
}