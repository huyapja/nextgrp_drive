import { ref } from 'vue'
import { toast } from '@/utils/toasts'

export function useMindmapKeyboard({
  selectedNode,
  editingNode,
  permissions,
  toolbarRef,
  d3Renderer,
  addChildToNode,
  addSiblingToNode,
  deleteSelectedNode,
  handleToolbarDone,
  copyNode,
  cutNode,
  pasteToNode,
  pasteFromSystemClipboard,
  hasClipboard
}) {
  let recentAlphaKeys = []
  const ALPHA_KEY_TIMEOUT = 500
  let lastDeleteTime = 0
  const DELETE_DEBOUNCE = 300
  let isComposing = false

  const trackAlphaKey = (key) => {
    const isAlphaKey = /^[a-zA-Z]$/.test(key)
    if (isAlphaKey) {
      recentAlphaKeys.push({ key, time: Date.now() })
      setTimeout(() => {
        recentAlphaKeys = recentAlphaKeys.filter(k => Date.now() - k.time < ALPHA_KEY_TIMEOUT)
      }, ALPHA_KEY_TIMEOUT)
    }
  }

  const hasRecentAlphaKeys = () => {
    const now = Date.now()
    recentAlphaKeys = recentAlphaKeys.filter(k => now - k.time < ALPHA_KEY_TIMEOUT)
    return recentAlphaKeys.length > 0
  }

  const canDeleteNode = () => {
    const now = Date.now()
    if (now - lastDeleteTime < DELETE_DEBOUNCE) {
      return false
    }
    return true
  }

  const markNodeDeleted = () => {
    lastDeleteTime = Date.now()
  }

  const handleCompositionStart = () => {
    isComposing = true
  }

  const handleCompositionEnd = () => {
    isComposing = false
    recentAlphaKeys = []
  }

  const handleKeyDown = (event) => {
    const target = event.target
    const tagName = target?.tagName?.toLowerCase()
    const isInEditor = target?.closest('.mindmap-node-editor') ||
      target?.closest('.mindmap-editor-content') ||
      target?.closest('.mindmap-editor-prose') ||
      target?.classList?.contains('ProseMirror') ||
      target?.closest('[contenteditable="true"]') ||
      target?.closest('.comment-editor-root')

    const key = event.key


    if (isInEditor || editingNode.value) {
      trackAlphaKey(event.key)
      
      if (event.ctrlKey || event.metaKey) {
        return
      }
      return
    } else {
      if (recentAlphaKeys.length > 0) {
        setTimeout(() => {
          recentAlphaKeys = []
        }, 100)
      }
    }

    if (tagName === 'textarea' || tagName === 'input' || target?.isContentEditable) {
      return
    }

    if (!selectedNode.value) return
    
    const isRealDeleteKey = event.code === 'Delete' || event.code === 'Backspace'
    const isDeleteKeyPressed = key === 'Delete' || key === 'Backspace'
    
    const isUnikeyEvent = event.code === '' || event.code === null || event.code === undefined
    
    if (isUnikeyEvent) {
      isComposing = true
      
      setTimeout(() => {
        if (isComposing) {
          isComposing = false
        }
      }, 1000)
    }
    
    if (isDeleteKeyPressed && !isRealDeleteKey) {
      return
    }
    

    if (key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()

      if (!permissions.value.write) {
        toast.error("Bạn không có quyền chỉnh sửa")
        return
      }

      if (typeof window !== 'undefined' && window.__justBlurredFromEditorByTab) {
        window.__justBlurredFromEditorByTab = false
        return
      }

      if (d3Renderer.value && d3Renderer.value.collapsedNodes && d3Renderer.value.collapsedNodes.has(selectedNode.value.id)) {
        const parentId = selectedNode.value.id
        d3Renderer.value.collapsedNodes.delete(parentId)

        if (d3Renderer.value.callbacks && d3Renderer.value.callbacks.onNodeCollapse) {
          d3Renderer.value.callbacks.onNodeCollapse(parentId, false)
        }

        d3Renderer.value.render()
      }

      addChildToNode(selectedNode.value.id)
    }
    else if (key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      event.stopPropagation()

      if (!permissions.value.write) {
        toast.error("Bạn không có quyền chỉnh sửa")
        return
      }

      if (!isInEditor && selectedNode.value && selectedNode.value.id !== 'root') {
        handleToolbarDone(selectedNode.value)
      }
    }
    else if (key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()

      if (!permissions.value.write) {
        toast.error("Bạn không có quyền chỉnh sửa")
        return
      }

      if (selectedNode.value && selectedNode.value.id !== 'root') {
        if (isInEditor || editingNode.value) {
          return
        }

        const editorInstance = d3Renderer.value?.getEditorInstance?.(selectedNode.value.id)
        if (editorInstance) {
          editorInstance.commands.focus()

          setTimeout(() => {
            const { state } = editorInstance.view
            const { doc } = state

            let blockquoteOffset = null
            doc.forEach((node, offset) => {
              if (node.type.name === 'blockquote' && blockquoteOffset === null) {
                blockquoteOffset = offset
              }
            })

            if (blockquoteOffset !== null) {
              try {
                const blockquoteNode = state.doc.nodeAt(blockquoteOffset)
                if (blockquoteNode) {
                  const blockquoteStart = blockquoteOffset + 1
                  const blockquoteEnd = blockquoteOffset + blockquoteNode.nodeSize - 1

                  let lastTextPos = null

                  doc.descendants((node, pos) => {
                    if (pos >= blockquoteStart && pos < blockquoteEnd && node.isText) {
                      const textEndPos = pos + node.text.length
                      if (textEndPos <= blockquoteEnd + 1) {
                        lastTextPos = textEndPos
                      }
                    }
                  })

                  if (lastTextPos !== null) {
                    try {
                      const resolvedPos = state.doc.resolve(lastTextPos)
                      editorInstance.chain()
                        .setTextSelection(resolvedPos.pos)
                        .focus()
                        .run()
                    } catch (e) {
                      editorInstance.chain()
                        .setTextSelection(lastTextPos)
                        .focus()
                        .run()
                    }
                  } else {
                    let lastParagraphPos = null
                    blockquoteNode.forEach((child, childOffset) => {
                      if (child.type.name === 'paragraph') {
                        const paragraphStart = blockquoteOffset + 1 + childOffset + 1
                        lastParagraphPos = paragraphStart
                      }
                    })

                    if (lastParagraphPos !== null) {
                      editorInstance.chain()
                        .setTextSelection(lastParagraphPos)
                        .focus()
                        .run()
                    } else {
                      const blockquoteEndPos = blockquoteOffset + blockquoteNode.nodeSize - 1
                      try {
                        const resolvedPos = state.doc.resolve(blockquoteEndPos - 1)
                        editorInstance.chain()
                          .setTextSelection(resolvedPos.pos)
                          .focus()
                          .run()
                      } catch (e) {
                        editorInstance.chain()
                          .setTextSelection(blockquoteEndPos - 1)
                          .focus()
                          .run()
                      }
                    }
                  }
                } else {
                  editorInstance.commands.focus('end')
                }
              } catch (e) {
                editorInstance.commands.focus('end')
              }
            } else {
              let insertPosition = null

              doc.forEach((node, offset) => {
                if (node.type.name !== 'blockquote') {
                  const nodeEnd = offset + node.nodeSize
                  if (insertPosition === null || nodeEnd > insertPosition) {
                    insertPosition = nodeEnd
                  }
                }
              })

              if (insertPosition === null) {
                insertPosition = doc.content.size
              }

              editorInstance.chain()
                .setTextSelection(insertPosition)
                .focus()
                .insertContent('<blockquote><p></p></blockquote>')
                .run()

              setTimeout(() => {
                if (editorInstance) {
                  const { state } = editorInstance.view
                  const { doc: newDoc } = state

                  let newBlockquoteOffset = null
                  newDoc.forEach((node, offset) => {
                    if (node.type.name === 'blockquote' && newBlockquoteOffset === null) {
                      newBlockquoteOffset = offset
                    }
                  })

                  if (newBlockquoteOffset !== null) {
                    const newBlockquoteNode = state.doc.nodeAt(newBlockquoteOffset)
                    if (newBlockquoteNode) {
                      const paragraphStartPos = newBlockquoteOffset + 1 + 1
                      editorInstance.chain()
                        .setTextSelection(paragraphStartPos)
                        .focus()
                        .run()
                    } else {
                      editorInstance.commands.focus('end')
                    }
                  } else {
                    editorInstance.commands.focus('end')
                  }
                }
              }, 50)
            }
          }, 50)
        }
      }
    }
    else if (key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      
      if (!permissions.value.write) {
        toast.error("Bạn không có quyền chỉnh sửa")
        return
      }
      
      if (selectedNode.value.id !== 'root') {
        addSiblingToNode(selectedNode.value.id)
      }
    }
    else if (event.code === 'Delete' || event.code === 'Backspace') {
      if (isComposing) {
        return
      }
      
      if (!canDeleteNode()) {
        return
      }
      
      if (hasRecentAlphaKeys()) {
        return
      }
      
      if (isInEditor || editingNode.value) {
        return
      }
      
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return
      }
      
      if (!permissions.value.write) {
        toast.error("Bạn không có quyền xóa node")
        return
      }
      
      event.preventDefault()
      event.stopPropagation()

      if (selectedNode.value.id === 'root') {
        return false
      }

      deleteSelectedNode()
      
      markNodeDeleted()
    }
    else if ((key === 'v' || key === 'V') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      event.stopPropagation()

      if (isInEditor) {
        return
      }

      if (!permissions.value.write) {
        toast.error("Bạn không có quyền chỉnh sửa")
        return
      }

      if (selectedNode.value) {
        if (hasClipboard.value) {
          pasteToNode(selectedNode.value.id)
        } else {
          pasteFromSystemClipboard(selectedNode.value.id)
        }
      }
    }
    else if ((key === 'c' || key === 'C') && (event.ctrlKey || event.metaKey)) {
      if (!isInEditor && selectedNode.value) {
        event.preventDefault()
        event.stopPropagation()
        copyNode(selectedNode.value.id)
      }
    }
    else if ((key === 'x' || key === 'X') && (event.ctrlKey || event.metaKey)) {
      if (!isInEditor && selectedNode.value && selectedNode.value.id !== 'root') {
        event.preventDefault()
        event.stopPropagation()
        
        if (!permissions.value.write) {
          toast.error("Bạn không có quyền chỉnh sửa")
          return
        }
        
        cutNode(selectedNode.value.id)
      }
    }
    else if ((key === 'b' || key === 'B') && (event.ctrlKey || event.metaKey)) {
      if (!isInEditor && toolbarRef.value && selectedNode.value && selectedNode.value.id !== 'root') {
        event.preventDefault()
        event.stopPropagation()
        
        if (!permissions.value.write) {
          toast.error("Bạn không có quyền chỉnh sửa")
          return
        }
        
        toolbarRef.value.toggleBold()
      }
    }
    else if ((key === 'i' || key === 'I') && (event.ctrlKey || event.metaKey)) {
      if (!isInEditor && toolbarRef.value && selectedNode.value && selectedNode.value.id !== 'root') {
        event.preventDefault()
        event.stopPropagation()
        
        if (!permissions.value.write) {
          toast.error("Bạn không có quyền chỉnh sửa")
          return
        }
        
        toolbarRef.value.toggleItalic()
      }
    }
    else if ((key === 'u' || key === 'U') && (event.ctrlKey || event.metaKey)) {
      if (!isInEditor && toolbarRef.value && selectedNode.value && selectedNode.value.id !== 'root') {
        event.preventDefault()
        event.stopPropagation()
        
        if (!permissions.value.write) {
          toast.error("Bạn không có quyền chỉnh sửa")
          return
        }
        
        toolbarRef.value.toggleUnderline()
      }
    }
  }

  const handleCopy = (event) => {
    const target = event.target
    const isInEditor = target?.closest('.mindmap-node-editor') ||
      target?.closest('.mindmap-editor-content') ||
      target?.closest('.mindmap-editor-prose') ||
      target?.classList?.contains('ProseMirror') ||
      target?.closest('[contenteditable="true"]')

    if (isInEditor) {
      const selection = window.getSelection()
      const selectedText = selection?.toString() || ''

      if (selectedText && selectedText.trim() !== '') {
        if (typeof window.__copyText === 'function') {
          window.__copyText(selectedText)
        }
      }
    }
  }

  return {
    handleKeyDown,
    handleCopy,
    handleCompositionStart,
    handleCompositionEnd
  }
}

