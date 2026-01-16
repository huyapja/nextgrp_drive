import { nextTick, inject  } from 'vue'

/**
 * Mindmap UI Actions
 * Xử lý các tương tác UI: context menu, rename, click outside
 */
export function useMindmapUIActions({
  store,
  mindmap,
  rename,
  entityName,
  nodes,
  edges,
  selectedNode,
  editingNode,
  showContextMenu,
  contextMenuNode,
  contextMenuPos,
  contextMenuCentered,
  showPanel,
  activeCommentNode,
  commentPanelRef,
  commentInputValue,
  isFromUI,
  d3Renderer,
  suppressPanelAutoFocus,
  textInputSaveTimeout,
  nodeFocusTimeouts,
  hasClipboard,
  addChildToNode,
  addSiblingToNode,
  copyNode,
  cutNode,
  pasteToNode,
  pasteFromSystemClipboard,
  copyNodeLink,
  openTaskLinkModal,
  deleteTaskLink,
  deleteSelectedNode,
  scrollToNodeWithRetry,
  scheduleSave
}) {

  // const ensureCommentSession = inject("ensureCommentSession", null)


  /**
   * Rename mindmap title (khi sửa root node)
   */
  const renameMindmapTitle = (newTitle) => {
    if (!newTitle || !newTitle.trim()) return

    if (mindmap.data) {
      mindmap.data.title = newTitle
    }
    if (store.state.activeEntity) {
      store.state.activeEntity.title = newTitle
    }
    window.document.title = newTitle

    const currentBreadcrumbs = store.state.breadcrumbs || []
    if (Array.isArray(currentBreadcrumbs) && currentBreadcrumbs.length > 0) {
      const updated = currentBreadcrumbs.map((crumb, idx) => {
        if (idx === currentBreadcrumbs.length - 1) {
          return {
            ...crumb,
            label: newTitle,
            title: newTitle,
          }
        }
        return crumb
      })
      store.commit("setBreadcrumbs", updated)
    }

    rename.submit({
      entity_name: entityName,
      new_title: newTitle.trim(),
    })
  }

  /**
   * Open comment panel
   */
  const openCommentPanel = (input, options = {}) => {
    if (!input) return

    const { focus = true } = options

    const nodeId =
      typeof input === "string"
        ? input
        : typeof input === "object"
          ? input.id
          : null

    if (!nodeId) return

    const syncedNode = nodes.value.find(n => n.id === nodeId)
    if (!syncedNode) return

    // ensureCommentSession?.(nodeId)

    isFromUI.value = true
    
    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
    
    activeCommentNode.value = syncedNode
    showPanel.value = true

    nextTick(() => {
      if (renderer) {
        renderer.selectCommentNode?.(nodeId, false)
        
        // ⚠️ REMOVED: Không scroll đến node khi mở comment panel
        // if (typeof scrollToNodeWithRetry === 'function') {
        //   scrollToNodeWithRetry(nodeId)
        // }
      }

      if (focus) {
        suppressPanelAutoFocus && (suppressPanelAutoFocus.value = false)
        commentPanelRef.value?.focusEditorForNode?.(nodeId)
      }

      isFromUI.value = false
    })
  }

  /**
   * Handle context menu actions
   */
  const handleContextMenuAction = ({ type, node }) => {
    if (!node) return

    switch (type) {
      case "add-child":
        addChildToNode(node.id)
        break

      case "add-sibling":
        addSiblingToNode(node.id)
        break

      case "copy":
        copyNode(node.id)
        break

      case "cut":
        cutNode(node.id)
        break

      case "paste":
        if (hasClipboard.value) {
          pasteToNode(node.id)
        } else {
          pasteFromSystemClipboard(node.id)
        }
        break

      case "copy-link":
        copyNodeLink(node.id)
        break

      case "link-task":
        openTaskLinkModal(node)
        break

      case "delete-task-link":
        deleteTaskLink(node)
        break

      case "delete":
        selectedNode.value = node
        deleteSelectedNode()
        break

      case 'add-comment': {
        openCommentPanel(node, { focus: true })
        break
      }
    }
  }

  /**
   * Handle click outside
   */
  const handleClickOutside = (e) => {
    if (showContextMenu.value) {
      const contextMenu = e.target.closest('.mindmap-context-menu')
      if (!contextMenu) {
        showContextMenu.value = false
      }
    }

    const clickedInsideNode = e.target.closest(".node-group") ||
      e.target.closest('.mindmap-node-editor') ||
      e.target.closest('.mindmap-editor-content') ||
      e.target.closest('.mindmap-editor-prose') ||
      e.target.closest('.ProseMirror') ||
      e.target.closest('[contenteditable="true"]') ||
      e.target.closest('.mindmap-toolbar') ||
      e.target.closest('.toolbar-btn') ||
      e.target.closest('.toolbar-top-popup') ||
      e.target.closest('.toolbar-bottom') ||
      e.target.closest('.image-menu-button') ||
      e.target.closest('.image-context-menu') ||
      e.target.closest('.image-menu-item')

    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer

    if (editingNode.value) {
      if (!clickedInsideNode) {
        const nodeId = editingNode.value
        const editorInstance = renderer?.getEditorInstance?.(nodeId)
        if (editorInstance && !editorInstance.isDestroyed) {
          editorInstance.commands.blur()
        }
        editingNode.value = null
        
        if (textInputSaveTimeout && textInputSaveTimeout.value) {
          clearTimeout(textInputSaveTimeout.value)
          scheduleSave()
          textInputSaveTimeout.value = null
        }
      }
    }

    if (selectedNode.value && !clickedInsideNode) {
      if (nodeFocusTimeouts && Array.isArray(nodeFocusTimeouts.value)) {
        nodeFocusTimeouts.value.forEach(timeoutId => clearTimeout(timeoutId))
        nodeFocusTimeouts.value = []
      }
      
      if (typeof window !== 'undefined') {
        window.__shouldClearFocusTimeouts = true
        setTimeout(() => {
          window.__shouldClearFocusTimeouts = false
        }, 1000)
      }
      
      selectedNode.value = null
      if (renderer) {
        renderer.selectNode?.(null, true)
      }
    }

    if (!showPanel.value) return

    const panel = commentPanelRef.value?.$el
    const clickedInsidePanel = panel?.contains(e.target)

    if (clickedInsidePanel) return
    if (e.target.closest(".node-group")) return
    if (e.target.closest(".pi-comment")) return
    if (e.target.closest("[data-comment-panel]")) return
    if (e.target.closest("[data-comment-dropdown]")) return
    if (e.target.closest("[data-comment-more]")) return
    if (e.target.closest("[comment-editor-root]")) return
    if (e.target.closest("[data-comment-dots]")) return
    if (e.target.closest("[data-upload-image-to-comment]")) return

    if (commentInputValue.value.trim().length > 0) return

    activeCommentNode.value = null
  }

  return {
    renameMindmapTitle,
    openCommentPanel,
    handleContextMenuAction,
    handleClickOutside
  }
}

