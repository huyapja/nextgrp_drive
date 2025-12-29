<template>
  <div :class="['mindmap-node-editor', { 'is-root': isRoot }]">
    <editor-content :class="['mindmap-editor-content', { 'is-root': isRoot }]" :editor="editor" />
  </div>
</template>

<script>
import { Highlight as BackgroundColor } from "@/components/DocEditor/extensions/backgroundColor"
import { Document } from "@/components/DocEditor/extensions/document"
import ImageExtension from "@/components/DocEditor/extensions/image-extension"
import { Paragraph } from "@/components/DocEditor/extensions/paragraph"
import { Placeholder } from "@/components/DocEditor/extensions/placeholder"
import { Text } from "@/components/DocEditor/extensions/text"
import { Underline } from "@/components/DocEditor/extensions/underline"
import { Extension } from "@tiptap/core"
import Bold from "@tiptap/extension-bold"
import Code from "@tiptap/extension-code"
import Italic from "@tiptap/extension-italic"
import Link from "@tiptap/extension-link"
import TextStyle from "@tiptap/extension-text-style"
import Typography from "@tiptap/extension-typography"
import { Fragment, Slice } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import StarterKit from "@tiptap/starter-kit"
import { Editor, EditorContent } from "@tiptap/vue-3"

// Extension để filter content khi parse HTML - XÓA TẤT CẢ menu button text
const FilterMenuTextExtension = Extension.create({
  name: 'filterMenuText',
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          // Transform paste content
          transformPasted: (slice) => {
            const fragment = slice.content
            const nodes = []
            
            fragment.forEach((node) => {
              // Skip paragraphs chỉ chứa '⋮'
              if (node.type.name === 'paragraph') {
                let hasValidContent = false
                let cleanedContent = []
                
                node.content.forEach((child) => {
                  if (child.isText) {
                    // Xóa '⋮' khỏi text
                    const cleanText = child.text.replace(/⋮/g, '').trim()
                    if (cleanText) {
                      hasValidContent = true
                      cleanedContent.push(child.type.schema.text(cleanText, child.marks))
                    }
                  } else {
                    hasValidContent = true
                    cleanedContent.push(child)
                  }
                })
                
                // Chỉ thêm paragraph nếu có content hợp lệ
                if (hasValidContent) {
                  nodes.push(node.type.create(node.attrs, cleanedContent, node.marks))
                }
              } else {
                // Giữ nguyên các node khác (images, blockquote, etc)
                nodes.push(node)
              }
            })
            
            return new Slice(Fragment.from(nodes), slice.openStart, slice.openEnd)
          },
          
          // Transform pasted HTML
          transformPastedHTML: (html) => {
            // Xóa tất cả menu buttons
            let cleanHtml = html.replace(/<button[^>]*class="image-menu-button"[^>]*>.*?<\/button>/gi, '')
            
            // Xóa image wrappers
            cleanHtml = cleanHtml.replace(/<div[^>]*class="image-wrapper[^"]*"[^>]*>/gi, '')
            cleanHtml = cleanHtml.replace(/<\/div>/gi, '')
            
            // Xóa paragraphs chỉ chứa '⋮'
            cleanHtml = cleanHtml.replace(/<p[^>]*>\s*⋮\s*<\/p>/gi, '')
            
            // Xóa tất cả ký tự '⋮' còn lại
            cleanHtml = cleanHtml.replace(/⋮/g, '')
            
            // ⚠️ FIX: Thêm data-type="node-title" cho tất cả paragraphs (trừ những paragraph đã có data-type khác)
            // Bỏ qua blockquote và task-link (sẽ được xử lý sau)
            cleanHtml = cleanHtml.replace(/<p(?![^>]*data-type="node-task-link")(?![^>]*data-type="node-description")([^>]*)>/gi, (match, attrs) => {
              // Nếu đã có data-type, giữ nguyên
              if (attrs && attrs.includes('data-type')) {
                return match
              }
              // Nếu chưa có data-type, thêm node-title
              return `<p data-type="node-title"${attrs ? ' ' + attrs : ''}>`
            })
            
            return cleanHtml
          }
        },
        // ⚠️ CRITICAL FIX: Append transaction để xóa paragraph chứa '⋮' ngay sau mỗi transaction
        appendTransaction: (transactions, oldState, newState) => {
          try {
            const tr = newState.tr
            let modified = false
            const docSize = newState.doc.content.size
            
            // Tìm và xóa paragraphs chỉ chứa '⋮'
            newState.doc.descendants((node, pos) => {
              try {
                // Kiểm tra position hợp lệ trước khi thao tác
                if (pos < 0 || pos >= docSize) {
                  return true // Skip node này nếu position không hợp lệ
                }
                
                if (node.type.name === 'paragraph' && node.textContent.trim() === '⋮') {
                  const endPos = pos + node.nodeSize
                  // Kiểm tra lại position trước khi delete
                  if (endPos <= docSize) {
                    tr.delete(pos, endPos)
                    modified = true
                    return false
                  }
                }
                
                // Xóa text nodes chứa '⋮'
                if (node.isText && node.text.includes('⋮')) {
                  const cleanText = node.text.replace(/⋮/g, '')
                  if (cleanText !== node.text) {
                    const endPos = pos + node.nodeSize
                    // Kiểm tra lại position trước khi replace
                    if (endPos <= docSize) {
                      tr.replaceWith(pos, endPos, newState.schema.text(cleanText, node.marks))
                      modified = true
                    }
                  }
                }
              } catch (e) {
                // Bỏ qua lỗi cho node này và tiếp tục với node khác
                console.warn('[MindmapNodeEditor] Lỗi trong appendTransaction cho một node:', e)
                return true
              }
            })
            
            return modified ? tr : null
          } catch (e) {
            // Nếu có lỗi nghiêm trọng, không return transaction để tránh crash
            console.warn('[MindmapNodeEditor] Lỗi trong appendTransaction:', e)
            return null
          }
        },
        // ⚠️ CRITICAL FIX: View plugin để cleanup DOM ngay sau mỗi update
        view: (editorView) => {
          return {
            update: (view, prevState) => {
              // Cleanup paragraph chứa '⋮' trong DOM ngay sau mỗi update
              const proseElement = view.dom.querySelector('.mindmap-editor-prose')
              if (proseElement) {
                const paragraphs = proseElement.querySelectorAll('p')
                paragraphs.forEach(p => {
                  const textContent = p.textContent.trim()
                  const hasImage = p.querySelector('img') || p.querySelector('.image-menu-button')
                  const hasTaskLink = p.querySelector('.node-task-link-section') || 
                                   p.querySelector('[data-node-section="task-link"]') ||
                                   p.getAttribute('data-type') === 'node-task-link'
                  
                  if (textContent === '⋮' && !hasImage && !hasTaskLink) {
                    p.remove()
                  }
                })
              }
            }
          }
        }
      })
    ]
  }
})

// Extension đơn giản - ProseMirror text nodes tự nhiên preserve trailing spaces
// Chúng ta chỉ cần đảm bảo không bị normalize khi parse HTML
const PreserveTrailingSpaces = Extension.create({
  name: 'preserveTrailingSpaces',
})

// Extension để ngăn xóa task link sections trong edit mode
const PreventTaskLinkDeletionExtension = Extension.create({
  name: 'preventTaskLinkDeletion',
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            keydown: (view, event) => {
              // Chỉ xử lý Backspace và Delete
              if (event.key !== 'Backspace' && event.key !== 'Delete') {
                return false
              }
              
              const { state } = view
              const { selection } = state
              const { from, to } = selection
              
              // Kiểm tra xem selection có chứa task link section không
              let hasTaskLinkInSelection = false
              
              // Lấy DOM element tại vị trí selection
              const dom = view.domAtPos(from)
              if (dom) {
                let element = dom.node
                
                // Nếu là text node, lấy parent element
                if (element.nodeType === Node.TEXT_NODE) {
                  element = element.parentElement
                }
                
                // Kiểm tra element và các parent elements
                let currentElement = element
                while (currentElement && currentElement !== view.dom) {
                  if (currentElement.classList?.contains('node-task-link-section') ||
                      currentElement.getAttribute?.('data-node-section') === 'task-link' ||
                      currentElement.querySelector?.('.node-task-link-section') ||
                      currentElement.querySelector?.('[data-node-section="task-link"]') ||
                      currentElement.textContent?.includes('Liên kết công việc')) {
                    hasTaskLinkInSelection = true
                    break
                  }
                  currentElement = currentElement.parentElement
                }
              }
              
              // Kiểm tra trong ProseMirror document
              state.doc.nodesBetween(from, to, (node, pos) => {
                if (node.type.name === 'paragraph') {
                  const nodeText = node.textContent || ''
                  if (nodeText.includes('Liên kết công việc')) {
                    hasTaskLinkInSelection = true
                  }
                }
              })
              
              // Nếu selection chứa task link, ngăn xóa
              if (hasTaskLinkInSelection) {
                event.preventDefault()
                event.stopPropagation()
                return true
              }
              
              return false
            },
          },
        },
      }),
    ]
  },
})

// Extension để ngăn con trỏ di chuyển vào task link và ảnh khi nhấn phím mũi tên
const PreventCursorInTaskLinkAndImageExtension = Extension.create({
  name: 'preventCursorInTaskLinkAndImage',
  
  addProseMirrorPlugins() {
    let lastArrowKey = null
    
    return [
      new Plugin({
        appendTransaction: (transactions, oldState, newState) => {
          // Chỉ xử lý khi có thay đổi selection (do navigation)
          const selectionChanged = transactions.some(tr => tr.selectionSet)
          if (!selectionChanged || !lastArrowKey) {
            return null
          }
          
          const { selection } = newState
          const { $from } = selection
          
          // Kiểm tra xem con trỏ có nằm trong task link hoặc image không
          let isInTaskLinkOrImage = false
          
          // Kiểm tra NodeSelection (khi image được chọn)
          if (selection instanceof NodeSelection) {
            const node = selection.node
            if (node && node.type.name === 'image') {
              isInTaskLinkOrImage = true
            }
          }
          
          // Kiểm tra node tại vị trí hiện tại và các parent nodes
          for (let depth = $from.depth; depth >= 0; depth--) {
            const node = $from.node(depth)
            
            // Kiểm tra image node
            if (node.type.name === 'image') {
              isInTaskLinkOrImage = true
              break
            }
            
            // Kiểm tra paragraph có chứa task link
            if (node.type.name === 'paragraph') {
              const nodeText = node.textContent || ''
              if (nodeText.includes('Liên kết công việc')) {
                // Kiểm tra xem có link với task_id không bằng cách tìm trong node marks
                let hasTaskLink = false
                node.descendants((child) => {
                  if (child.type.name === 'text' && child.marks) {
                    child.marks.forEach((mark) => {
                      if (mark.type.name === 'link') {
                        const href = mark.attrs.href || ''
                        if (href.includes('task_id')) {
                          hasTaskLink = true
                          return false
                        }
                      }
                    })
                  }
                  if (hasTaskLink) return false
                })
                
                if (hasTaskLink) {
                  isInTaskLinkOrImage = true
                  break
                }
              }
            }
          }
          
          // Kiểm tra thêm: nếu con trỏ đang ở ngay trước hoặc sau image node
          const nodeAtPos = $from.node()
          if (nodeAtPos && nodeAtPos.type.name === 'image') {
            isInTaskLinkOrImage = true
          }
          
          // Kiểm tra node trước và sau vị trí hiện tại
          if (!isInTaskLinkOrImage) {
            try {
              // Kiểm tra node trước
              if ($from.pos > 0) {
                const prevNode = newState.doc.nodeAt($from.pos - 1)
                if (prevNode && prevNode.type.name === 'image') {
                  isInTaskLinkOrImage = true
                }
              }
              
              // Kiểm tra node sau
              if ($from.pos < newState.doc.content.size) {
                const nextNode = newState.doc.nodeAt($from.pos)
                if (nextNode && nextNode.type.name === 'image') {
                  isInTaskLinkOrImage = true
                }
              }
            } catch (e) {
              // Ignore errors
            }
          }
          
          // Nếu con trỏ nằm trong task link hoặc image, di chuyển ra ngoài
          if (isInTaskLinkOrImage) {
            const doc = newState.doc
            const tr = newState.tr
            let targetPos = null
            let bestPos = null
            let bestDistance = Infinity
            
            // Tìm paragraph hợp lệ gần nhất theo hướng mũi tên
            doc.forEach((node, offset) => {
              // Bỏ qua image nodes
              if (node.type.name === 'image') {
                return
              }
              
              if (node.type.name === 'paragraph') {
                const nodeText = node.textContent || ''
                const isTaskLink = nodeText.includes('Liên kết công việc')
                
                // Kiểm tra xem có phải task link không (kiểm tra qua DOM nếu có thể)
                let isInvalid = isTaskLink
                
                if (!isInvalid) {
                  const paragraphStart = offset + 1
                  const distance = Math.abs(paragraphStart - $from.pos)
                  
                  // Nếu nhấn ArrowUp, ưu tiên paragraph ở trên
                  if (lastArrowKey === 'ArrowUp' && paragraphStart < $from.pos) {
                    if (distance < bestDistance) {
                      bestDistance = distance
                      bestPos = paragraphStart
                    }
                  }
                  // Nếu nhấn ArrowDown, ưu tiên paragraph ở dưới
                  else if (lastArrowKey === 'ArrowDown' && paragraphStart > $from.pos) {
                    if (distance < bestDistance) {
                      bestDistance = distance
                      bestPos = paragraphStart
                    }
                  }
                  // Nếu không có paragraph ở hướng mong muốn, dùng paragraph gần nhất
                  else if (bestPos === null) {
                    if (distance < bestDistance) {
                      bestDistance = distance
                      bestPos = paragraphStart
                    }
                  }
                }
              }
            })
            
            // Sử dụng bestPos nếu tìm thấy, nếu không dùng paragraph hợp lệ đầu tiên
            if (bestPos === null) {
              // Tìm paragraph hợp lệ đầu tiên
              doc.forEach((node, offset) => {
                if (bestPos === null && node.type.name === 'paragraph') {
                  const nodeText = node.textContent || ''
                  const isTaskLink = nodeText.includes('Liên kết công việc')
                  if (!isTaskLink) {
                    bestPos = offset + 1
                  }
                }
              })
            }
            
            targetPos = bestPos
            
            // Di chuyển con trỏ
            if (targetPos !== null) {
              try {
                const resolvedPos = doc.resolve(Math.max(1, Math.min(targetPos, doc.content.size)))
                const newSelection = TextSelection.create(doc, resolvedPos.pos)
                tr.setSelection(newSelection)
                return tr
              } catch (e) {
                console.error('[PreventCursorInTaskLinkAndImage] Error:', e)
              }
            }
          }
          
          // Reset lastArrowKey sau khi xử lý
          lastArrowKey = null
          
          return null
        },
        view: (editorView) => {
          // Hàm kiểm tra xem một element có phải là task link hoặc image không (cho DOM)
          const isTaskLinkOrImageElement = (el) => {
            if (!el) return false
            
            // Kiểm tra task link
            if (el.classList?.contains('node-task-link-section') ||
                el.getAttribute('data-node-section') === 'task-link' ||
                el.getAttribute('data-type') === 'node-task-link' ||
                el.querySelector('.node-task-link-section') ||
                el.querySelector('[data-node-section="task-link"]')) {
              return true
            }
            
            // Kiểm tra image
            if (el.classList?.contains('image-wrapper-node') ||
                el.classList?.contains('image-wrapper') ||
                el.tagName === 'IMG' ||
                el.closest('.image-wrapper-node') ||
                el.closest('.image-wrapper')) {
              return true
            }
            
            // Kiểm tra text content
            if (el.textContent?.includes('Liên kết công việc')) {
              const hasTaskLinkAnchor = el.querySelector('a[href*="task_id"]')
              if (hasTaskLinkAnchor) {
                return true
              }
            }
            
            return false
          }
          
          // Hàm kiểm tra và di chuyển con trỏ nếu cần (backup check qua DOM)
          const checkAndMoveCursor = () => {
            const { state } = editorView
            const { selection } = state
            const { $from } = selection
            
            // Lấy DOM element tại vị trí con trỏ
            const dom = editorView.domAtPos($from.pos)
            if (!dom) return
            
            let element = dom.node
            if (element.nodeType === Node.TEXT_NODE) {
              element = element.parentElement
            }
            
            // Kiểm tra xem con trỏ có nằm trong task link hoặc image không
            let currentElement = element
            let foundTaskLinkOrImage = false
            
            while (currentElement && currentElement !== editorView.dom) {
              if (isTaskLinkOrImageElement(currentElement)) {
                foundTaskLinkOrImage = true
                break
              }
              currentElement = currentElement.parentElement
            }
            
            // Nếu con trỏ nằm trong task link hoặc image, di chuyển ra ngoài
            if (foundTaskLinkOrImage) {
              const doc = state.doc
              let targetPos = null
              let bestPos = null
              let bestDistance = Infinity
              
              // Tìm paragraph hợp lệ gần nhất theo hướng mũi tên
              doc.forEach((node, offset) => {
                if (node.type.name === 'paragraph') {
                  const nodeDOM = editorView.nodeDOM(offset)
                  if (nodeDOM) {
                    let isInvalid = false
                    let checkElement = nodeDOM
                    while (checkElement && checkElement !== editorView.dom) {
                      if (isTaskLinkOrImageElement(checkElement)) {
                        isInvalid = true
                        break
                      }
                      checkElement = checkElement.parentElement
                    }
                    
                    if (!isInvalid) {
                      const paragraphStart = offset + 1
                      const distance = Math.abs(paragraphStart - $from.pos)
                      
                      // Nếu nhấn ArrowUp, ưu tiên paragraph ở trên
                      if (lastArrowKey === 'ArrowUp' && paragraphStart < $from.pos) {
                        if (distance < bestDistance) {
                          bestDistance = distance
                          bestPos = paragraphStart
                        }
                      }
                      // Nếu nhấn ArrowDown, ưu tiên paragraph ở dưới
                      else if (lastArrowKey === 'ArrowDown' && paragraphStart > $from.pos) {
                        if (distance < bestDistance) {
                          bestDistance = distance
                          bestPos = paragraphStart
                        }
                      }
                      // Nếu không có paragraph ở hướng mong muốn, dùng paragraph gần nhất
                      else if (bestPos === null) {
                        if (distance < bestDistance) {
                          bestDistance = distance
                          bestPos = paragraphStart
                        }
                      }
                    }
                  }
                }
              })
              
              // Di chuyển con trỏ
              if (bestPos !== null) {
                try {
                  const resolvedPos = doc.resolve(Math.max(1, Math.min(bestPos, doc.content.size)))
                  const newSelection = TextSelection.create(doc, resolvedPos.pos)
                  editorView.dispatch(state.tr.setSelection(newSelection))
                } catch (e) {
                  console.error('[PreventCursorInTaskLinkAndImage] Error:', e)
                }
              }
            }
            
            // Reset lastArrowKey
            lastArrowKey = null
          }
          
          return {
            update: (view, prevState) => {
              // Backup check: Chỉ kiểm tra khi selection thay đổi và có phím mũi tên được nhấn
              if (lastArrowKey && view.state.selection.from !== prevState.selection.from) {
                setTimeout(() => {
                  checkAndMoveCursor()
                }, 10)
              }
            },
          }
        },
        props: {
          handleKeyDown: (view, event) => {
            // Chỉ xử lý ArrowUp và ArrowDown
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              lastArrowKey = event.key
              // Cho phép ProseMirror xử lý navigation trước, sau đó appendTransaction sẽ kiểm tra
              return false
            }
            return false
          },
        },
      }),
    ]
  },
})

// Extension để thêm data-type="node-description" cho blockquote
const BlockquoteWithDataTypeExtension = Extension.create({
  name: 'blockquoteWithDataType',
  
  addGlobalAttributes() {
    return [
      {
        types: ['blockquote'],
        attributes: {
          'data-type': {
            default: 'node-description',
            parseHTML: () => 'node-description',
            renderHTML: (attributes) => {
              if (!attributes['data-type']) {
                return {}
              }
              return {
                'data-type': attributes['data-type'],
              }
            },
          },
        },
      },
    ]
  },
})

// Extension để thêm data-type="node-title" cho paragraph đầu tiên
const ParagraphWithDataTypeExtension = Extension.create({
  name: 'paragraphWithDataType',
  
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          'data-type': {
            default: null,
            parseHTML: (element) => {
              // ⚠️ FIX: Kiểm tra xem paragraph có chứa task link không
              const existingDataType = element.getAttribute('data-type')
              if (existingDataType) {
                return existingDataType
              }
              
              // Kiểm tra xem paragraph có chứa link "Liên kết công việc" với task_id không
              const hasTaskLinkAnchor = element.querySelector('a[href*="task_id"]') || 
                element.querySelector('a[href*="/mtp/project/"]')
              const text = element.textContent?.trim() || ''
              const hasTaskLinkText = text.includes('Liên kết công việc')
              
              if (hasTaskLinkText && hasTaskLinkAnchor) {
                
                return 'node-task-link'
              }
              
              return null
            },
            renderHTML: (attributes) => {
              if (!attributes['data-type']) {
                return {}
              }
              return {
                'data-type': attributes['data-type'],
              }
            },
          },
        },
      },
    ]
  },
})

// Extension để luôn hiển thị placeholder cho node-title
const TitlePlaceholderExtension = Extension.create({
  name: 'titlePlaceholder',
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('titlePlaceholder'),
        props: {
          decorations: ({ doc, selection }) => {
            const { view } = this.editor
            if (!view || !view.dom) return null
            
            const decorations = []
            const { anchor } = selection
            
            // Tìm paragraph có data-type="node-title" và luôn hiển thị placeholder nếu trống
            doc.descendants((node, pos) => {
              if (node.type.name === 'paragraph') {
                // Kiểm tra data-type từ node attributes
                const dataType = node.attrs['data-type']

                // Kiểm tra từ DOM nếu attributes chưa có
                let isNodeTitle = false
                if (dataType === 'node-title') {
                  isNodeTitle = true
                } else {
                  // Fallback: Kiểm tra từ DOM
                  const domNode = view.nodeDOM(pos)
                  if (domNode && domNode.nodeType === 1) {
                    const domDataType = domNode.getAttribute('data-type')
                    if (domDataType === 'node-title') {
                      isNodeTitle = true
                    }
                  }
                }

                if (isNodeTitle) {
                  // Kiểm tra xem paragraph có thực sự trống không
                  // (bỏ qua ProseMirror trailingBreak)
                  const hasRealContent = node.content.size > 0 && node.content.content.some(child => {
                    if (child.isText && child.text.length > 0) return true
                    if (child.type.name !== 'hard_break' || !child.attrs?.class?.includes('ProseMirror-trailingBreak')) return true
                    return false
                  })

                  if (!hasRealContent) {
                    // Paragraph trống, hiển thị placeholder
                    const hasAnchor = anchor >= pos && anchor <= pos + node.nodeSize
                    const isEmptyDoc = this.editor.isEmpty
                    const classes = ['is-empty']

                    if (isEmptyDoc) {
                      classes.push('is-editor-empty')
                    }

                    const decoration = Decoration.node(pos, pos + node.nodeSize, {
                      class: classes.join(' '),
                      'data-placeholder': 'Nhập...',
                    })

                    decorations.push(decoration)
                  }
                }
              }
            })
            
            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
})

// Extension để upload ảnh khi paste (cho mindmap)
// Tạo extension factory để có thể pass uploadImage function
function createUploadImageOnPasteExtension(uploadImageFn) {
  return Extension.create({
    name: 'uploadImageOnPaste',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handlePaste: (view, event) => {
              const { state } = view
              const { schema } = state
              const clipboardData = event.clipboardData
              if (!clipboardData || !uploadImageFn) return false

              // ⚠️ FIX: Nếu có window.imageClipboard, để keyboard handler xử lý (tránh paste 2 lần)
              if (window.imageClipboard && window.imageClipboard.type === 'image') {
                return false
              }

              // Kiểm tra xem có ảnh trong clipboard không
              const items = Array.from(clipboardData.items || [])
              const imageItem = items.find(item => item.type.indexOf('image') === 0)

              if (imageItem) {
                const imageFile = imageItem.getAsFile()
                if (imageFile) {
                  event.preventDefault()
                  // ⚠️ FIX: Return true ngay lập tức để ngăn các plugin khác (như dropImagePlugin) xử lý
                  // Không đợi đến khi upload xong vì dropImagePlugin chạy đồng bộ và sẽ chèn ảnh base64 trước

                  // Đọc kích thước ảnh từ file
                  const reader = new FileReader()
                  reader.onload = (e) => {
                    const img = new Image()
                    img.onload = () => {
                      // Tính toán kích thước hiển thị (giữ tỷ lệ, max width theo số ảnh)
                      const maxWidth = 368 // Chiều rộng vùng nội dung
                      let displayWidth = img.width
                      let displayHeight = img.height
                      
                      if (displayWidth > maxWidth) {
                        const ratio = maxWidth / displayWidth
                        displayWidth = maxWidth
                        displayHeight = Math.round(img.height * ratio)
                      }
                      
                      // Tạo placeholder node với loading state
                      const placeholderNode = schema.nodes.image.create({
                        src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmM2Y0ZjYiLz48L3N2Zz4=',
                        width: displayWidth,
                        height: displayHeight,
                        loading: 'true',
                      })
                      
                      // ⚠️ FIX: Tìm vị trí chèn ảnh phù hợp - không chèn vào giữa text của title
                      const { selection } = view.state
                      const { from, $from } = selection
                      let insertPos = from
                      
                      // Kiểm tra xem cursor có đang ở trong title paragraph không (không phải blockquote)
                      let isInTitle = false
                      
                      // Kiểm tra depth để xem có đang trong blockquote không
                      for (let i = $from.depth; i > 0; i--) {
                        const nodeAtDepth = $from.node(i)
                        if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                          // Đang trong blockquote (description) - có thể chèn tại vị trí cursor
                          break
                        }
                        
                        // Nếu đang ở paragraph và không phải blockquote, đó là title
                        if (nodeAtDepth && nodeAtDepth.type.name === 'paragraph' && i === $from.depth) {
                          isInTitle = true
                          break
                        }
                      }
                      
                      // Nếu đang ở trong title paragraph, tìm vị trí sau tất cả title paragraphs và ảnh
                      if (isInTitle) {
                        const { doc } = view.state
                        let lastTitleEndPos = null
                        let lastImageEndPos = null
                        
                        // Tìm tất cả title paragraphs (paragraphs không phải blockquote)
                        doc.descendants((node, pos) => {
                          // Kiểm tra xem node có phải là paragraph không
                          if (node.type.name === 'paragraph') {
                            // Kiểm tra xem paragraph này có nằm trong blockquote không
                            const resolvedPos = doc.resolve(pos)
                            let inBlockquote = false
                            
                            for (let i = resolvedPos.depth; i > 0; i--) {
                              const nodeAtDepth = resolvedPos.node(i)
                              if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                                inBlockquote = true
                                break
                              }
                            }
                            
                            // Nếu không phải blockquote, đó là title paragraph
                            if (!inBlockquote) {
                              const paragraphEnd = pos + node.nodeSize
                              if (lastTitleEndPos === null || paragraphEnd > lastTitleEndPos) {
                                lastTitleEndPos = paragraphEnd
                              }
                            }
                          }
                          
                          // Tìm ảnh sau title paragraphs (không phải blockquote)
                          if (node.type.name === 'image') {
                            const resolvedPos = doc.resolve(pos)
                            let inBlockquote = false
                            
                            for (let i = resolvedPos.depth; i > 0; i--) {
                              const nodeAtDepth = resolvedPos.node(i)
                              if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                                inBlockquote = true
                                break
                              }
                            }
                            
                            // Nếu không phải blockquote, đó là ảnh sau title
                            if (!inBlockquote) {
                              const imageEnd = pos + node.nodeSize
                              if (lastImageEndPos === null || imageEnd > lastImageEndPos) {
                                lastImageEndPos = imageEnd
                              }
                            }
                          }
                        })
                        
                        // Chèn ảnh sau title paragraph cuối cùng và sau tất cả ảnh đã có
                        if (lastImageEndPos !== null) {
                          // Có ảnh đã tồn tại, chèn sau ảnh cuối cùng
                          insertPos = lastImageEndPos
                        } else if (lastTitleEndPos !== null) {
                          // Không có ảnh, chèn sau title paragraph cuối cùng
                          insertPos = lastTitleEndPos
                        }
                      } else {
                        // Không phải title paragraph hoặc đang trong blockquote - chèn tại vị trí cursor
                        insertPos = from
                      }
                      
                      const tr = view.state.tr.insert(insertPos, placeholderNode)
                      view.dispatch(tr)
                      
                      // Lưu vị trí đã chèn để tìm placeholder sau
                      const savedInsertPos = insertPos
                      
                      // Upload ảnh
                      uploadImageFn(imageFile).then((imageUrl) => {
                        if (imageUrl) {
                          // Tìm và thay thế placeholder bằng ảnh thực
                          const { state } = view
                          const { doc } = state
                          
                          // Tìm placeholder node tại vị trí đã chèn
                          let placeholderPos = null
                          doc.descendants((node, nodePos) => {
                            if (node.type.name === 'image' && node.attrs.loading === 'true') {
                              // Kiểm tra xem có phải placeholder tại vị trí đã chèn không
                              // Cho phép một chút sai số do có thể có thay đổi trong doc
                              if (Math.abs(nodePos - savedInsertPos) < 10) {
                                placeholderPos = nodePos
                                return false
                              }
                            }
                          })
                          
                          if (placeholderPos !== null) {
                            const realImageNode = schema.nodes.image.create({
                              src: imageUrl,
                              width: displayWidth,
                              height: displayHeight,
                            })
                            // ⚠️ CRITICAL FIX: Đợi ảnh load xong TRƯỚC KHI dispatch transaction
                            // Điều này đảm bảo khi handleEditorInput chạy, ảnh đã có naturalHeight
                            const checkImg = new Image()
                            checkImg.onload = () => {
                              
                              // Ảnh đã load xong, BÂY GIỜ MỚI thay thế placeholder
                              // Wrap trong setTimeout để đảm bảo không bị race condition
                              setTimeout(() => {
                                // Get fresh state vì có thể đã thay đổi
                                const currentState = view.state
                                const transaction = currentState.tr.replaceWith(
                                  placeholderPos,
                                  placeholderPos + placeholderNode.nodeSize,
                                  realImageNode
                                )
                                view.dispatch(transaction)
                                
                                // Trigger update lại sau một chút để đảm bảo DOM đã update
                                requestAnimationFrame(() => {
                                  view.dispatch(view.state.tr)
                                })
                              }, 10)
                            }
                            checkImg.onerror = () => {
                              
                              // Ảnh lỗi, vẫn thay thế placeholder
                              const transaction = state.tr.replaceWith(
                                placeholderPos,
                                placeholderPos + placeholderNode.nodeSize,
                                realImageNode
                              )
                              view.dispatch(transaction)
                            }
                            
                            // Nếu ảnh đã cached, onload sẽ fire ngay lập tức
                            checkImg.src = imageUrl
                            
                            // Fallback: Nếu sau 2s ảnh vẫn chưa load, thay thế anyway
                            setTimeout(() => {
                              if (!checkImg.complete) {
                                
                                const transaction = state.tr.replaceWith(
                                  placeholderPos,
                                  placeholderPos + placeholderNode.nodeSize,
                                  realImageNode
                                )
                                view.dispatch(transaction)
                              }
                            }, 200)
                          }
                        }
                      }).catch((error) => {
                        
                        // Xóa placeholder nếu upload thất bại
                        const { state } = view
                        const transaction = state.tr.delete(savedInsertPos, savedInsertPos + placeholderNode.nodeSize)
                        view.dispatch(transaction)
                      })
                    }
                    img.src = e.target.result
                  }
                  reader.readAsDataURL(imageFile)

                  return true
                }
              }

              return false
            },
          },
        }),
      ]
    },
  })
}

// Helper function để tạo SVG icon menu (3 chấm dọc)
function createMenuIcon() {
  const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svgIcon.setAttribute('width', '16')
  svgIcon.setAttribute('height', '16')
  svgIcon.setAttribute('viewBox', '0 0 24 24')
  svgIcon.setAttribute('fill', 'none')
  svgIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svgIcon.style.cssText = 'width: 16px; height: 16px; display: block;'
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M12 17C13.1046 17 14 17.8954 14 19C14 20.1046 13.1046 21 12 21C10.8954 21 10 20.1046 10 19C10 17.8954 10.8954 17 12 17ZM12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12C10 10.8954 10.8954 10 12 10ZM12 3C13.1046 3 14 3.89543 14 5C14 6.10457 13.1046 7 12 7C10.8954 7 10 6.10457 10 5C10 3.89543 10.8954 3 12 3Z')
  path.setAttribute('fill', 'currentColor')
  svgIcon.appendChild(path)
  return svgIcon
}

// Helper functions để tạo SVG icons cho menu items
function createCopyIcon() {
  const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svgIcon.setAttribute('width', '16')
  svgIcon.setAttribute('height', '16')
  svgIcon.setAttribute('viewBox', '0 0 24 24')
  svgIcon.setAttribute('fill', 'none')
  svgIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svgIcon.setAttribute('stroke', 'currentColor')
  svgIcon.setAttribute('stroke-width', '2')
  svgIcon.setAttribute('stroke-linecap', 'round')
  svgIcon.setAttribute('stroke-linejoin', 'round')
  svgIcon.style.cssText = 'width: 16px; height: 16px; display: block; flex-shrink: 0;'
  
  const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect1.setAttribute('x', '9')
  rect1.setAttribute('y', '9')
  rect1.setAttribute('width', '13')
  rect1.setAttribute('height', '13')
  rect1.setAttribute('rx', '2')
  rect1.setAttribute('ry', '2')
  svgIcon.appendChild(rect1)
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1')
  svgIcon.appendChild(path)
  
  return svgIcon
}

function createCutIcon() {
  const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svgIcon.setAttribute('width', '16')
  svgIcon.setAttribute('height', '16')
  svgIcon.setAttribute('viewBox', '0 0 24 24')
  svgIcon.setAttribute('fill', 'none')
  svgIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svgIcon.setAttribute('stroke', 'currentColor')
  svgIcon.setAttribute('stroke-width', '2')
  svgIcon.setAttribute('stroke-linecap', 'round')
  svgIcon.setAttribute('stroke-linejoin', 'round')
  svgIcon.style.cssText = 'width: 16px; height: 16px; display: block; flex-shrink: 0;'
  
  const circle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  circle1.setAttribute('cx', '6')
  circle1.setAttribute('cy', '6')
  circle1.setAttribute('r', '3')
  svgIcon.appendChild(circle1)
  
  const circle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  circle2.setAttribute('cx', '6')
  circle2.setAttribute('cy', '18')
  circle2.setAttribute('r', '3')
  svgIcon.appendChild(circle2)
  
  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  line1.setAttribute('x1', '8.12')
  line1.setAttribute('y1', '8.12')
  line1.setAttribute('x2', '19.26')
  line1.setAttribute('y2', '19.26')
  svgIcon.appendChild(line1)
  
  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  line2.setAttribute('x1', '19.26')
  line2.setAttribute('y1', '8.12')
  line2.setAttribute('x2', '8.12')
  line2.setAttribute('y2', '19.26')
  svgIcon.appendChild(line2)
  
  return svgIcon
}

function createDeleteIcon() {
  const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svgIcon.setAttribute('width', '16')
  svgIcon.setAttribute('height', '16')
  svgIcon.setAttribute('viewBox', '0 0 24 24')
  svgIcon.setAttribute('fill', 'none')
  svgIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svgIcon.setAttribute('stroke', 'currentColor')
  svgIcon.setAttribute('stroke-width', '2')
  svgIcon.setAttribute('stroke-linecap', 'round')
  svgIcon.setAttribute('stroke-linejoin', 'round')
  svgIcon.style.cssText = 'width: 16px; height: 16px; display: block; flex-shrink: 0;'
  
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
  polyline.setAttribute('points', '3 6 5 6 21 6')
  svgIcon.appendChild(polyline)
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2')
  svgIcon.appendChild(path)
  
  return svgIcon
}

// Extension để render image với menu button sử dụng NodeView
// ⚠️ Helper function để update layout của tất cả ảnh
function updateImageLayout(view) {
  const allImages = view.dom.querySelectorAll('.image-wrapper-node')
  const count = allImages.length
  
  // ⚠️ FIX: Nếu không có ảnh, không cần update
  if (count === 0) return
  
  
  
  
  let newWidth = '100%'
  let newGap = '0px'
  let newHeight = 'auto' // ⚠️ FIX: Luôn dùng auto để ảnh hiển thị đầy đủ
  let newObjectFit = 'cover' // ⚠️ FIX: Dùng cover thay vì cover để không crop ảnh
  let useAspectRatio = false // ⚠️ FIX: Khai báo biến useAspectRatio
  
  // ⚠️ FIX: Tính toán width chính xác dựa trên số lượng ảnh
  // Với gap 12px giữa các ảnh:
  // - 1 ảnh: 100% width (không có gap)
  // - 2 ảnh: (100% - 12px) / 2 = calc(50% - 14px) cho mỗi ảnh
  // - 3+ ảnh: (100% - 24px) / 3 = calc(33.333% - 14px) cho mỗi ảnh (2 gaps giữa 3 ảnh)
  if (count === 1) {
    newWidth = '100%' // ⚠️ CRITICAL: 1 ảnh = 100% width
    newGap = '0px'
    newHeight = 'auto' // ⚠️ FIX: Height auto để ảnh hiển thị đầy đủ
    useAspectRatio = false // 1 ảnh không cần hình vuông
    
  } else if (count === 2) {
    newWidth = 'calc(50% - 14px)' // 50% trừ đi nửa gap (12px / 2)
    newGap = '12px'
    newHeight = 'auto' // ⚠️ FIX: Thay vì 150px, dùng auto để ảnh hiển thị đầy đủ
    useAspectRatio = true // ⚠️ NEW: 2 ảnh trở lên dùng hình vuông
    
  } else if (count >= 3) {
    newWidth = 'calc(33.333% - 14px)' // 33.333% trừ đi 2/3 gap (24px / 3)
    newGap = '12px'
    newHeight = 'auto' // ⚠️ FIX: Thay vì 100px, dùng auto để ảnh hiển thị đầy đủ
    useAspectRatio = true // ⚠️ NEW: 2 ảnh trở lên dùng hình vuông
    
  }
  
  
  
  allImages.forEach((wrapper, index) => {
    // ⚠️ OPTIMIZE: Chỉ đọc inline style, tránh getComputedStyle để giảm lag
    const currentInlineWidth = wrapper.style.getPropertyValue('width')
    const currentAspectRatio = wrapper.style.getPropertyValue('aspect-ratio')
    const currentMarginRight = wrapper.style.getPropertyValue('margin-right')
    
    // ⚠️ OPTIMIZE: Chỉ update width nếu thay đổi
    if (currentInlineWidth !== newWidth) {
      wrapper.style.setProperty('width', newWidth, 'important')
      wrapper.style.setProperty('max-width', newWidth === '100%' ? '100%' : newWidth, 'important')
    }
    
    // ⚠️ OPTIMIZE: Chỉ update aspect-ratio nếu thay đổi
    const expectedAspectRatio = count >= 2 ? '1' : ''
    if (currentAspectRatio !== expectedAspectRatio) {
      if (count >= 2) {
        wrapper.style.setProperty('aspect-ratio', '1', 'important')
      } else {
        wrapper.style.removeProperty('aspect-ratio')
      }
      wrapper.style.setProperty('height', 'auto', 'important')
    }
    
    // ⚠️ OPTIMIZE: Chỉ update margin-right nếu thay đổi
    const expectedMarginRight = ((index + 1) % 3 === 0 || count === 1) ? '0' : newGap
    if (currentMarginRight !== expectedMarginRight) {
      wrapper.style.setProperty('margin-right', expectedMarginRight, 'important')
    }
    
    // Cập nhật height và object-fit cho img bên trong
    const img = wrapper.querySelector('img')
    if (img) {
      // ⚠️ OPTIMIZE: Chỉ đọc inline style, tránh getComputedStyle
      const currentImgWidth = img.style.getPropertyValue('width')
      const currentImgHeight = img.style.getPropertyValue('height')
      const currentImgObjectFit = img.style.getPropertyValue('object-fit')
      
      // ⚠️ NEW: Với 2+ ảnh, ảnh phải fill toàn bộ wrapper (hình vuông)
      if (count >= 2) {
        // ⚠️ OPTIMIZE: Chỉ update nếu thay đổi
        if (currentImgWidth !== '100%') {
          img.style.setProperty('width', '100%', 'important')
        }
        if (currentImgHeight !== '100%') {
          img.style.setProperty('height', '100%', 'important')
        }
        if (currentImgObjectFit !== 'cover') {
          img.style.setProperty('object-fit', 'cover', 'important')
        }
        if (img.style.getPropertyValue('max-height')) {
          img.style.removeProperty('max-height')
        }
      } else {
        // 1 ảnh: giữ nguyên logic cũ, chỉ update nếu thay đổi
        if (currentImgHeight !== newHeight) {
          img.style.setProperty('height', newHeight, 'important')
          img.style.setProperty('max-height', '200px', 'important')
        }
        if (currentImgObjectFit !== newObjectFit) {
          img.style.setProperty('object-fit', newObjectFit, 'important')
        }
        if (currentImgWidth !== '100%') {
          img.style.setProperty('width', '100%', 'important')
          img.style.setProperty('max-width', '100%', 'important')
        }
      }
    }
  })
  
  
  
  // ⚠️ REMOVED: Bỏ force reflow để tránh trigger lại update → nháy liên tục
  // Browser sẽ tự động reflow khi cần
}

const ImageWithMenuExtension = Extension.create({
  name: 'imageWithMenu',
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: (editorView) => {
          // Track view để có thể update layout sau
          let lastImageCount = 0
          let updateTimeout = null
          let isInitialized = false
          
          // ⚠️ FIX: Gọi updateImageLayout lần đầu khi view được khởi tạo (khi reload)
          // Đảm bảo layout được áp dụng ngay cả khi số lượng ảnh không thay đổi
         
            requestAnimationFrame(() => {
              const initialImageCount = editorView.dom.querySelectorAll('.image-wrapper-node').length
              if (initialImageCount > 0) {
                lastImageCount = initialImageCount
                updateImageLayout(editorView)
                isInitialized = true
              }
            })
          
          
          return {
            update: (view, prevState) => {
              // ⚠️ CRITICAL FIX: Chỉ update layout khi số lượng ảnh thay đổi
              // Tránh update liên tục gây nháy khi hover
              const currentImageCount = view.dom.querySelectorAll('.image-wrapper-node').length
              
              // ⚠️ FIX: Nếu chưa khởi tạo lần đầu, gọi updateImageLayout
              if (!isInitialized && currentImageCount > 0) {
                lastImageCount = currentImageCount
                isInitialized = true
                setTimeout(() => {
                  requestAnimationFrame(() => {
                    updateImageLayout(view)
                  })
                }, 50)
                return
              }
              
              // Chỉ update nếu số lượng ảnh thay đổi
              if (currentImageCount === lastImageCount) {
                return // Không có thay đổi về số lượng ảnh, skip
              }
              
              lastImageCount = currentImageCount
              
              // Debounce để tránh update quá nhiều lần
              if (updateTimeout) {
                clearTimeout(updateTimeout)
              }
              
              // ⚠️ OPTIMIZE: Tăng debounce time để tránh lag khi hover
              // Sử dụng requestAnimationFrame để đảm bảo update chỉ xảy ra khi browser sẵn sàng
              updateTimeout = setTimeout(() => {
                requestAnimationFrame(() => {
                  updateImageLayout(view)
                })
              }, 50) // Tăng từ 10ms lên 50ms để giảm lag
            },
            destroy: () => {
              if (updateTimeout) {
                clearTimeout(updateTimeout)
              }
            }
          }
        },
        props: {
          nodeViews: {
            image: (node, view, getPos) => {
              const dom = document.createElement('div')
              dom.className = 'image-wrapper-node'
              dom.setAttribute('data-image-src', node.attrs.src)
              dom.setAttribute('data-type', 'node-image')
              dom.setAttribute('contenteditable', 'false')
              dom.setAttribute('draggable', 'false')
              
              // ⚠️ CRITICAL: Tính width dựa trên số ảnh trong editor
              // Đếm số ảnh hiện có để xác định layout
              // ⚠️ FIX: Không cộng thêm 1 vì ảnh hiện tại có thể đã được add vào DOM
              // hoặc sẽ được update bởi updateImageLayout sau khi add vào DOM
              const allImages = view.dom.querySelectorAll('.image-wrapper-node')
              // ⚠️ FIX: Đếm chính xác số ảnh, không cộng thêm 1
              // Nếu ảnh hiện tại chưa có trong DOM, nó sẽ được add sau, và updateImageLayout sẽ handle
              // Nếu ảnh hiện tại đã có trong DOM, nó đã được đếm trong allImages.length
              const totalImages = allImages.length
              
              
              
              // ⚠️ FIX: Tính width chính xác dựa trên số lượng ảnh
              // Với gap 12px giữa các ảnh:
              // - 1 ảnh: 100% width (không có gap)
              // - 2 ảnh: (100% - 12px) / 2 = calc(50% - 14px) cho mỗi ảnh
              // - 3+ ảnh: (100% - 24px) / 3 = calc(33.333% - 14px) cho mỗi ảnh
              let imageWidth = '100%'
              let gap = '0px'
              
              // ⚠️ FIX: Nếu ảnh hiện tại chưa có trong DOM, sẽ có ít hơn 1 ảnh trong allImages
              // Nên ta cần xem xét cả trường hợp 0 ảnh (tức là ảnh đầu tiên đang được tạo)
              if (totalImages === 0 || totalImages === 1) {
                imageWidth = '100%'
                gap = '0px'
                
              } else if (totalImages === 2) {
                imageWidth = 'calc(50% - 14px)' // 50% trừ đi nửa gap (12px / 2)
                gap = '12px'
                
              } else if (totalImages >= 3) {
                imageWidth = 'calc(33.333% - 14px)' // 33.333% trừ đi 2/3 gap (24px / 3)
                gap = '12px'
                
              }
              
              // ⚠️ NEW: Từ 2 ảnh trở lên, dùng hình vuông (aspect-ratio: 1)
              const useAspectRatio = totalImages >= 2
              
              // Thống nhất chiều cao cho tất cả ảnh để không bị cao thấp không thống nhất
              // Dùng max-height cố định để tất cả ảnh có cùng chiều cao tối đa
              let imageHeight = 'auto'
              let maxHeight = '200px' // Chiều cao tối đa thống nhất cho tất cả ảnh (chỉ dùng cho 1 ảnh)
              let objectFit = 'cover' // Dùng cover để không crop ảnh, giữ tỷ lệ
              
              dom.style.cssText = `
                position: relative;
                display: inline-block;
                width: ${imageWidth};
                margin: 12px ${gap} 12px 0;
                box-sizing: border-box;
                vertical-align: top;
                ${useAspectRatio ? 'aspect-ratio: 1;' : ''}
              `
              
              // Layout sẽ được update tự động bởi Plugin.view.update()
              
              // Tạo img element
              const img = document.createElement('img')
              img.src = node.attrs.src
              if (node.attrs.alt) img.alt = node.attrs.alt
              if (node.attrs.title) img.title = node.attrs.title
              if (node.attrs.width) img.width = node.attrs.width
              if (node.attrs.height) img.height = node.attrs.height
              
              // ⚠️ NEW: Với 2+ ảnh, ảnh fill toàn bộ wrapper (hình vuông)
              if (useAspectRatio) {
                img.style.cssText = `
                  display: block;
                  width: 100%;
                  height: 100%;
                  object-fit: cover;
                  border-radius: 5px;
                  cursor: zoom-in;
                `
              } else {
                img.style.cssText = `
                  display: block;
                  width: 100%;
                  height: ${imageHeight} !important;
                  max-height: ${maxHeight} !important;
                  object-fit: ${objectFit};
                  border-radius: 5px;
                  cursor: zoom-in;
                `
              }
              
              // ⚠️ CRITICAL: Khi ảnh load xong, trigger updateNodeHeight()
              // Dispatch custom event để component có thể lắng nghe và gọi updateNodeHeight()
              const triggerHeightUpdate = () => {
                // ⚠️ FIX: Giảm delay để update layout nhanh hơn, tránh jump
                setTimeout(() => {
                  // Kiểm tra xem editor đã sẵn sàng chưa trước khi dispatch event
                  // Tìm editor instance từ view
                  const editorDOM = view.dom
                  if (editorDOM && editorDOM.querySelector('.mindmap-editor-prose')) {
                    // Editor đã sẵn sàng, dispatch event
                    window.dispatchEvent(new CustomEvent('image-loaded-in-editor'))
                  } else {
                    // Editor chưa sẵn sàng, retry sau (giảm delay)
                    setTimeout(() => {
                      if (view.dom && view.dom.querySelector('.mindmap-editor-prose')) {
                        window.dispatchEvent(new CustomEvent('image-loaded-in-editor'))
                      }
                    }, 50) // Giảm từ 200ms xuống 50ms
                  }
                }, 20) // Giảm từ 100ms xuống 20ms
              }
              
              if (img.complete && img.naturalHeight !== 0) {
                // Ảnh đã load xong
                triggerHeightUpdate()
              } else {
                // Ảnh chưa load, thêm listener
                img.addEventListener('load', triggerHeightUpdate, { once: true })
                img.addEventListener('error', triggerHeightUpdate, { once: true })
              }
              
              // Tạo menu button - KHÔNG LÀM CONTENT EDITABLE
              const menuButton = document.createElement('button')
              menuButton.className = 'image-menu-button'
              menuButton.setAttribute('type', 'button')
              menuButton.setAttribute('contenteditable', 'false')
              menuButton.setAttribute('data-tiptap-ignore', 'true')
              menuButton.setAttribute('data-pm-ignore', 'true')
              menuButton.setAttribute('draggable', 'false')
              menuButton.setAttribute('data-menu-button', 'true')
              menuButton.setAttribute('aria-label', 'Image options')
              // Sử dụng SVG icon thay vì text để tránh ProseMirror parse
              menuButton.appendChild(createMenuIcon())
              menuButton.style.cssText = `
                position: absolute;
                top: 8px;
                right: 8px;
                width: 28px;
                height: 28px;
                border-radius: 4px;
                background: rgba(0, 0, 0, 0.6);
                color: white;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                line-height: 1;
                opacity: 0;
                transition: opacity 0.2s ease, background 0.2s ease;
                z-index: 100;
                backdrop-filter: blur(4px);
                pointer-events: auto;
              `
              
              // Event handlers
              const showButton = () => {
                // ⚠️ CRITICAL: Chỉ cho phép hover vào menu tooltip khi editor đang focused
                if (view && view.focused) {
                  menuButton.style.opacity = '1'
                  menuButton.style.background = 'rgba(0, 0, 0, 0.8)'
                }
              }
              
              const hideButton = () => {
                menuButton.style.opacity = '0'
                menuButton.style.background = 'rgba(0, 0, 0, 0.6)'
              }
              
              dom.addEventListener('mouseenter', showButton)
              dom.addEventListener('mouseleave', hideButton)
              menuButton.addEventListener('mouseenter', showButton)
              menuButton.addEventListener('mouseleave', hideButton)
              
              // Click handler cho button
              menuButton.addEventListener('mousedown', (e) => {
                // ⚠️ CRITICAL: Prevent blur khi click vào menu button
                e.preventDefault()
                e.stopPropagation()
              })
              
              menuButton.addEventListener('click', (e) => {
                e.preventDefault()
                e.stopPropagation()
                
                // ⚠️ CRITICAL: Focus lại editor ngay lập tức để tránh blur
                if (view && view.focused) {
                  // Editor đang focus, giữ focus
                } else {
                  // Editor không focus, focus lại
                  view.focus()
                }
                
                // Tạo context menu
                const existingMenu = document.querySelector('.image-context-menu')
                if (existingMenu) existingMenu.remove()
                
                const menu = document.createElement('div')
                menu.className = 'image-context-menu'
                menu.style.cssText = `
                  position: absolute;
                  background: white;
                  border-radius: 8px;
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                  padding: 4px;
                  z-index: 10000;
                  min-width: 150px;
                `
                
                const items = [
                  { label: 'Sao chép', iconFn: createCopyIcon, action: 'copy' },
                  { label: 'Cắt', iconFn: createCutIcon, action: 'cut' },
                  { label: 'Xóa', iconFn: createDeleteIcon, action: 'delete' },
                ]
                
                items.forEach(item => {
                  const menuItem = document.createElement('div')
                  menuItem.className = 'image-menu-item'
                  menuItem.style.cssText = `
                    padding: 8px 12px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    border-radius: 4px;
                    font-size: 14px;
                    transition: background 0.2s;
                  `
                  
                  // Tạo icon SVG
                  const iconSpan = document.createElement('span')
                  iconSpan.style.cssText = 'display: flex; align-items: center; flex-shrink: 0;'
                  iconSpan.appendChild(item.iconFn())
                  
                  // Tạo label span
                  const labelSpan = document.createElement('span')
                  labelSpan.textContent = item.label
                  
                  menuItem.appendChild(iconSpan)
                  menuItem.appendChild(labelSpan)
                  
                  menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.background = '#f3f4f6'
                  })
                  menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.background = 'transparent'
                  })
                  
                  // ⚠️ CRITICAL: Prevent blur khi click vào menu item
                  menuItem.addEventListener('mousedown', (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    // Focus lại editor ngay lập tức để tránh blur
                    if (view && view.focused) {
                      // Editor đang focus, giữ focus
                    } else {
                      view.focus()
                    }
                  })
                  
                  menuItem.addEventListener('click', (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    
                    // ⚠️ CRITICAL: Focus lại editor ngay lập tức để tránh blur
                    if (view && view.focused) {
                      // Editor đang focus, giữ focus
                    } else {
                      view.focus()
                    }
                    
                    const pos = getPos()
                    if (typeof pos !== 'number') return
                    
                    const { state, dispatch } = view
                    
                    if (item.action === 'copy' || item.action === 'cut') {
                      window.imageClipboard = {
                        type: 'image',
                        data: {
                          src: node.attrs.src,
                          alt: node.attrs.alt || '',
                          title: node.attrs.title || '',
                          width: node.attrs.width || null,
                          height: node.attrs.height || null,
                        },
                        operation: item.action,
                      }
                      
                      if (item.action === 'cut') {
                        const tr = state.tr.delete(pos, pos + node.nodeSize)
                        dispatch(tr)
                        
                        // ⚠️ FIX: Trigger tính toán lại kích thước node sau khi xóa ảnh
                        setTimeout(() => {
                          // Dispatch custom event để component có thể lắng nghe và gọi updateNodeHeight()
                          window.dispatchEvent(new CustomEvent('image-deleted-in-editor'))
                          // Emit input event để trigger handleEditorInput và tính toán lại kích thước
                          const inputEvent = new Event('input', { bubbles: true })
                          view.dom.dispatchEvent(inputEvent)
                        }, 50)
                      }
                    } else if (item.action === 'delete') {
                      const tr = state.tr.delete(pos, pos + node.nodeSize)
                      dispatch(tr)
                      
                      // ⚠️ FIX: Trigger tính toán lại kích thước node sau khi xóa ảnh
                      setTimeout(() => {
                        // Dispatch custom event để component có thể lắng nghe và gọi updateNodeHeight()
                        window.dispatchEvent(new CustomEvent('image-deleted-in-editor'))
                        // Emit input event để trigger handleEditorInput và tính toán lại kích thước
                        const inputEvent = new Event('input', { bubbles: true })
                        view.dom.dispatchEvent(inputEvent)
                      }, 50)
                    }
                    
                    // Đóng menu và remove event listeners
                    menu.remove()
                    document.removeEventListener('mousedown', closeMenu, true)
                    document.removeEventListener('click', closeMenu, true)
                  })
                  
                  menu.appendChild(menuItem)
                })
                
                // Tính toán vị trí menu - đảm bảo luôn hiển thị đầy đủ
                const rect = menuButton.getBoundingClientRect()
                document.body.appendChild(menu)
                
                // Đợi menu được render để lấy kích thước
                const menuRect = menu.getBoundingClientRect()
                
                // Vị trí mặc định: dưới button, căn trái
                let finalTop = rect.bottom + window.scrollY + 4
                let finalLeft = rect.left + window.scrollX
                
                // Đảm bảo menu không bị tràn ra ngoài viewport
                const viewportWidth = window.innerWidth
                const viewportHeight = window.innerHeight
                
                // Nếu menu bị tràn bên phải, đặt ở bên trái button
                if (finalLeft + menuRect.width > viewportWidth) {
                  finalLeft = rect.right + window.scrollX - menuRect.width
                  // Đảm bảo không bị tràn bên trái
                  if (finalLeft < 8) {
                    finalLeft = 8
                  }
                }
                
                // Nếu menu bị tràn bên dưới, đặt ở trên button
                if (finalTop + menuRect.height > viewportHeight + window.scrollY) {
                  finalTop = rect.top + window.scrollY - menuRect.height - 4
                  // Đảm bảo không bị tràn bên trên
                  if (finalTop < window.scrollY + 8) {
                    finalTop = window.scrollY + 8
                  }
                }
                
                menu.style.top = `${finalTop}px`
                menu.style.left = `${finalLeft}px`
                menu.style.position = 'fixed' // Dùng fixed để tính toán chính xác với viewport
                
                const closeMenu = (e) => {
                  // Không đóng nếu click vào menu, menu button, hoặc menu item
                  if (menu.contains(e.target) || 
                      e.target === menuButton || 
                      e.target.closest('.image-menu-button') ||
                      e.target.closest('.image-context-menu')) {
                    return
                  }
                  
                  // Click ra ngoài: đóng menu
                  menu.remove()
                  document.removeEventListener('mousedown', closeMenu)
                  document.removeEventListener('click', closeMenu)
                }
                
                // Sử dụng cả mousedown và click để đảm bảo đóng menu khi click ra ngoài
                setTimeout(() => {
                  document.addEventListener('mousedown', closeMenu, true)
                  document.addEventListener('click', closeMenu, true)
                }, 0)
              })
              
              // Click handler cho img (zoom)
              img.addEventListener('click', (e) => {
                e.preventDefault()
                e.stopPropagation()
                
                if (node.attrs.src) {
                  window.dispatchEvent(new CustomEvent('open-image-modal', {
                    detail: { imageUrl: node.attrs.src }
                  }))
                }
              })
              
              dom.appendChild(img)
              dom.appendChild(menuButton)
              
              // ⚠️ CRITICAL FIX: Cleanup paragraph chứa '⋮' ngay sau khi ảnh được tạo
              setTimeout(() => {
                const proseElement = view.dom.querySelector('.mindmap-editor-prose')
                if (proseElement) {
                  const paragraphs = proseElement.querySelectorAll('p')
                  paragraphs.forEach(p => {
                    const textContent = p.textContent.trim()
                    const hasImage = p.querySelector('img') || p.querySelector('.image-menu-button')
                    const hasTaskLink = p.querySelector('.node-task-link-section') || 
                                     p.querySelector('[data-node-section="task-link"]') ||
                                     p.getAttribute('data-type') === 'node-task-link'
                    
                    if (textContent === '⋮' && !hasImage && !hasTaskLink) {
                      p.remove()
                    }
                  })
                }
              }, 0)
              
              return {
                dom,
                contentDOM: null,
                // ⚠️ CRITICAL FIX: Bỏ qua mutations trong button menu để ProseMirror không serialize nó
                ignoreMutation: (mutation) => {
                  // Bỏ qua tất cả mutations trong button menu
                  if (mutation.target === menuButton || menuButton.contains(mutation.target)) {
                    return true
                  }
                  // Bỏ qua mutations trong SVG icon
                  if (mutation.target.closest && mutation.target.closest('.image-menu-button')) {
                    return true
                  }
                  return false
                },
                update: (updatedNode) => {
                  if (updatedNode.type.name !== 'image') return false
                  
                  // Update img attributes
                  img.src = updatedNode.attrs.src
                  if (updatedNode.attrs.alt) img.alt = updatedNode.attrs.alt
                  if (updatedNode.attrs.title) img.title = updatedNode.attrs.title
                  if (updatedNode.attrs.width) img.width = updatedNode.attrs.width
                  if (updatedNode.attrs.height) img.height = updatedNode.attrs.height
                  
                  // ⚠️ CRITICAL FIX: Cleanup paragraph chứa '⋮' sau khi update
                  setTimeout(() => {
                    const proseElement = view.dom.querySelector('.mindmap-editor-prose')
                    if (proseElement) {
                      const paragraphs = proseElement.querySelectorAll('p')
                      paragraphs.forEach(p => {
                        const textContent = p.textContent.trim()
                        const hasImage = p.querySelector('img') || p.querySelector('.image-menu-button')
                        const hasTaskLink = p.querySelector('.node-task-link-section') || 
                                         p.querySelector('[data-node-section="task-link"]') ||
                                         p.getAttribute('data-type') === 'node-task-link'
                        
                        if (textContent === '⋮' && !hasImage && !hasTaskLink) {
                          p.remove()
                        }
                      })
                    }
                  }, 0)
                  
                  return true
                },
                destroy: () => {
                  dom.removeEventListener('mouseenter', showButton)
                  dom.removeEventListener('mouseleave', hideButton)
                  menuButton.removeEventListener('mouseenter', showButton)
                  menuButton.removeEventListener('mouseleave', hideButton)
                }
              }
            }
          }
        }
      })
    ]
  }
})

// Extension để ngăn chặn cursor xuất hiện trong vùng ảnh (image-wrapper-node)
const PreventCursorInImageAreaExtension = Extension.create({
  name: 'preventCursorInImageArea',
  
  addProseMirrorPlugins() {
    let editorView = null
    
    return [
      new Plugin({
        view: (view) => {
          editorView = view
          return {}
        },
        appendTransaction: (transactions, oldState, newState) => {
          // Chỉ xử lý khi có thay đổi selection
          const selectionChanged = transactions.some(tr => tr.selectionSet)
          if (!selectionChanged) {
            return null
          }
          
          const { selection } = newState
          const { $from } = selection
          
          // Kiểm tra xem selection có nằm cạnh image node không
          let needsMove = false
          
          // Kiểm tra node trước và sau selection
          const nodeBefore = $from.nodeBefore
          const nodeAfter = $from.nodeAfter
          
          if (nodeBefore && nodeBefore.type.name === 'image') {
            needsMove = true
          }
          
          if (nodeAfter && nodeAfter.type.name === 'image') {
            needsMove = true
          }
          
          // Kiểm tra xem có click vào vùng image-wrapper-node không (qua DOM)
          if (!needsMove && editorView) {
            try {
              const domAtPos = editorView.domAtPos($from.pos)
              if (domAtPos) {
                let element = domAtPos.node
                if (element.nodeType === Node.TEXT_NODE) {
                  element = element.parentElement
                }
                
                // Kiểm tra xem có nằm trong image-wrapper-node không
                if (element && (
                  element.classList?.contains('image-wrapper-node') ||
                  element.closest('.image-wrapper-node')
                )) {
                  needsMove = true
                }
              }
            } catch (e) {
              // Ignore errors
            }
          }
          
          if (!needsMove) {
            return null
          }
          
          // Tìm vị trí an toàn để di chuyển cursor
          const { doc } = newState
          let safePos = null
          let lastBlockquoteEnd = null
          
          // Tìm blockquote (mô tả) cuối cùng
          doc.descendants((node, nodePos) => {
            if (node.type.name === 'blockquote') {
              const blockquoteEnd = nodePos + node.nodeSize
              if (lastBlockquoteEnd === null || blockquoteEnd > lastBlockquoteEnd) {
                lastBlockquoteEnd = blockquoteEnd
                node.descendants((pNode, pPos) => {
                  if (pNode.type.name === 'paragraph') {
                    const paragraphPos = nodePos + pPos + 1
                    if (paragraphPos < blockquoteEnd) {
                      safePos = paragraphPos
                    }
                  }
                })
              }
            }
          })
          
          // Nếu không tìm thấy blockquote, tìm paragraph (title) cuối cùng
          if (safePos === null) {
            let lastParagraphEnd = null
            doc.descendants((node, nodePos) => {
              if (node.type.name === 'paragraph') {
                const resolvedPos = doc.resolve(nodePos)
                let inBlockquote = false
                for (let i = resolvedPos.depth; i > 0; i--) {
                  if (resolvedPos.node(i).type.name === 'blockquote') {
                    inBlockquote = true
                    break
                  }
                }
                if (!inBlockquote) {
                  const paragraphEnd = nodePos + node.nodeSize
                  if (lastParagraphEnd === null || paragraphEnd > lastParagraphEnd) {
                    lastParagraphEnd = paragraphEnd
                    safePos = paragraphEnd - 1
                  }
                }
              }
            })
          }
          
          if (safePos === null) {
            safePos = doc.content.size
          }
          
          // Di chuyển cursor đến vị trí an toàn
          try {
            const tr = newState.tr
            const selection = TextSelection.create(tr.doc, safePos)
            tr.setSelection(selection)
            return tr
          } catch (e) {
            return null
          }
        },
        props: {
          handleClick: (view, pos, event) => {
            const target = event.target
            
            // Kiểm tra xem click có xảy ra trong vùng image-wrapper-node không
            if (target.closest('.image-wrapper-node') || 
                target.classList?.contains('image-wrapper-node') ||
                (target.tagName === 'IMG' && target.closest('.image-wrapper-node'))) {
              
              // Ngăn chặn click mặc định
              event.preventDefault()
              event.stopPropagation()
              
              // Di chuyển cursor đến vị trí an toàn
              const { state } = view
              const { doc } = state
              
              // Tìm blockquote (mô tả) cuối cùng hoặc paragraph (title) cuối cùng
              let safePos = null
              let lastBlockquoteEnd = null
              
              doc.descendants((node, nodePos) => {
                if (node.type.name === 'blockquote') {
                  const blockquoteEnd = nodePos + node.nodeSize
                  if (lastBlockquoteEnd === null || blockquoteEnd > lastBlockquoteEnd) {
                    lastBlockquoteEnd = blockquoteEnd
                    node.descendants((pNode, pPos) => {
                      if (pNode.type.name === 'paragraph') {
                        const paragraphPos = nodePos + pPos + 1
                        if (paragraphPos < blockquoteEnd) {
                          safePos = paragraphPos
                        }
                      }
                    })
                  }
                }
              })
              
              if (safePos === null) {
                let lastParagraphEnd = null
                doc.descendants((node, nodePos) => {
                  if (node.type.name === 'paragraph') {
                    const resolvedPos = doc.resolve(nodePos)
                    let inBlockquote = false
                    for (let i = resolvedPos.depth; i > 0; i--) {
                      if (resolvedPos.node(i).type.name === 'blockquote') {
                        inBlockquote = true
                        break
                      }
                    }
                    if (!inBlockquote) {
                      const paragraphEnd = nodePos + node.nodeSize
                      if (lastParagraphEnd === null || paragraphEnd > lastParagraphEnd) {
                        lastParagraphEnd = paragraphEnd
                        safePos = paragraphEnd - 1
                      }
                    }
                  }
                })
              }
              
              if (safePos === null) {
                safePos = doc.content.size
              }
              
              // Di chuyển cursor đến vị trí an toàn
              try {
                const transaction = state.tr
                const selection = TextSelection.create(transaction.doc, safePos)
                transaction.setSelection(selection)
                view.dispatch(transaction)
                view.focus()
              } catch (e) {
                // Nếu không thể tạo selection, bỏ qua
              }
              
              return true // Ngăn chặn xử lý click mặc định
            }
            
            return false // Cho phép xử lý click mặc định
          },
          handleDOMEvents: {
            mousedown: (view, event) => {
              const target = event.target
              
              // Kiểm tra xem mousedown có xảy ra trong vùng image-wrapper-node không
              if (target.closest('.image-wrapper-node') || 
                  target.classList?.contains('image-wrapper-node') ||
                  (target.tagName === 'IMG' && target.closest('.image-wrapper-node'))) {
                
                // Chỉ ngăn chặn nếu không phải click vào menu button
                if (!target.closest('.image-menu-button') && 
                    !target.closest('.image-context-menu')) {
                  event.preventDefault()
                  event.stopPropagation()
                  
                  // Di chuyển cursor đến vị trí an toàn
                  const { state } = view
                  const { doc } = state
                  
                  let safePos = null
                  let lastBlockquoteEnd = null
                  
                  doc.descendants((node, nodePos) => {
                    if (node.type.name === 'blockquote') {
                      const blockquoteEnd = nodePos + node.nodeSize
                      if (lastBlockquoteEnd === null || blockquoteEnd > lastBlockquoteEnd) {
                        lastBlockquoteEnd = blockquoteEnd
                        node.descendants((pNode, pPos) => {
                          if (pNode.type.name === 'paragraph') {
                            const paragraphPos = nodePos + pPos + 1
                            if (paragraphPos < blockquoteEnd) {
                              safePos = paragraphPos
                            }
                          }
                        })
                      }
                    }
                  })
                  
                  if (safePos === null) {
                    let lastParagraphEnd = null
                    doc.descendants((node, nodePos) => {
                      if (node.type.name === 'paragraph') {
                        const resolvedPos = doc.resolve(nodePos)
                        let inBlockquote = false
                        for (let i = resolvedPos.depth; i > 0; i--) {
                          if (resolvedPos.node(i).type.name === 'blockquote') {
                            inBlockquote = true
                            break
                          }
                        }
                        if (!inBlockquote) {
                          const paragraphEnd = nodePos + node.nodeSize
                          if (lastParagraphEnd === null || paragraphEnd > lastParagraphEnd) {
                            lastParagraphEnd = paragraphEnd
                            safePos = paragraphEnd - 1
                          }
                        }
                      }
                    })
                  }
                  
                  if (safePos === null) {
                    safePos = doc.content.size
                  }
                  
                  try {
                    const transaction = state.tr
                    const selection = TextSelection.create(transaction.doc, safePos)
                    transaction.setSelection(selection)
                    view.dispatch(transaction)
                    view.focus()
                  } catch (e) {
                    // Nếu không thể tạo selection, bỏ qua
                  }
                  
                  return true
                }
              }
              
              return false
            }
          }
        }
      })
    ]
  }
})

// Extension để xử lý click vào ảnh (zoom) và menu button
const ImageClickExtension = Extension.create({
  name: 'imageClick',
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(editorView) {
          let activeMenu = null
          const pluginViewRef = { createImageMenu: null, handleMenuAction: null }
          
          const createImageMenu = (imgElement, imgNode, imgPos) => {
            // Xóa menu cũ nếu có
            if (activeMenu) {
              activeMenu.remove()
              activeMenu = null
            }
            
            // Tạo menu container
            const menu = document.createElement('div')
            menu.className = 'image-context-menu'
            menu.style.cssText = `
              position: absolute;
              background: white;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
              padding: 4px;
              z-index: 10000;
              min-width: 150px;
            `
            
            // Menu items
            const items = [
              { label: 'Sao chép', iconFn: createCopyIcon, action: 'copy' },
              { label: 'Cắt', iconFn: createCutIcon, action: 'cut' },
              { label: 'Xóa', iconFn: createDeleteIcon, action: 'delete' },
            ]
            
            // Định nghĩa closeMenu trước để có thể dùng trong menuItem click handler
            const closeMenu = (e) => {
              // Không đóng nếu click vào menu button, menu, hoặc menu item
              if (e.target.classList.contains('image-menu-button') ||
                  e.target.closest('.image-menu-button') ||
                  menu.contains(e.target) ||
                  e.target.closest('.image-context-menu')) {
                return
              }
              
              // Click ra ngoài: đóng menu
              menu.remove()
              activeMenu = null
              document.removeEventListener('mousedown', closeMenu, true)
              document.removeEventListener('click', closeMenu, true)
            }
            
            items.forEach(item => {
              const menuItem = document.createElement('div')
              menuItem.className = 'image-menu-item'
              menuItem.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                border-radius: 4px;
                font-size: 14px;
                transition: background 0.2s;
              `
              
              // Tạo icon SVG
              const iconSpan = document.createElement('span')
              iconSpan.style.cssText = 'display: flex; align-items: center; flex-shrink: 0;'
              iconSpan.appendChild(item.iconFn())
              
              // Tạo label span
              const labelSpan = document.createElement('span')
              labelSpan.textContent = item.label
              
              menuItem.appendChild(iconSpan)
              menuItem.appendChild(labelSpan)
              
              // ⚠️ CRITICAL: Prevent blur khi click vào menu item
              menuItem.addEventListener('mousedown', (e) => {
                e.preventDefault()
                e.stopPropagation()
                // Focus lại editor ngay lập tức để tránh blur
                if (editorView && editorView.focused !== undefined) {
                  if (!editorView.focused) {
                    editorView.focus()
                  }
                }
              })
              
              menuItem.addEventListener('mouseenter', () => {
                menuItem.style.background = '#f3f4f6'
              })
              menuItem.addEventListener('mouseleave', () => {
                menuItem.style.background = 'transparent'
              })
              
              menuItem.addEventListener('click', (e) => {
                e.preventDefault()
                e.stopPropagation()
                
                // ⚠️ CRITICAL: Focus lại editor ngay lập tức để tránh blur
                if (editorView && editorView.focused !== undefined) {
                  if (!editorView.focused) {
                    editorView.focus()
                  }
                }
                
                handleMenuAction(item.action, imgNode, imgPos, editorView)
                menu.remove()
                activeMenu = null
                // Remove event listeners
                document.removeEventListener('mousedown', closeMenu, true)
                document.removeEventListener('click', closeMenu, true)
              })
              
              menu.appendChild(menuItem)
            })
            
            // Tính toán vị trí menu - đảm bảo luôn hiển thị đầy đủ
            const imgRect = imgElement.getBoundingClientRect()
            document.body.appendChild(menu)
            
            // Đợi menu được render để lấy kích thước
            const menuRect = menu.getBoundingClientRect()
            
            // Vị trí mặc định: góc trên bên phải của ảnh
            let finalTop = imgRect.top + window.scrollY + 8
            let finalLeft = imgRect.right + window.scrollX - menuRect.width - 8
            
            // Đảm bảo menu không bị tràn ra ngoài viewport
            const viewportWidth = window.innerWidth
            const viewportHeight = window.innerHeight
            
            // Nếu menu bị tràn bên phải, đặt ở bên trái ảnh
            if (finalLeft + menuRect.width > viewportWidth) {
              finalLeft = imgRect.left + window.scrollX - menuRect.width - 8
              // Đảm bảo không bị tràn bên trái
              if (finalLeft < 8) {
                finalLeft = 8
              }
            }
            
            // Nếu menu bị tràn bên dưới, đặt ở trên ảnh
            if (finalTop + menuRect.height > viewportHeight + window.scrollY) {
              finalTop = imgRect.bottom + window.scrollY - menuRect.height - 8
              // Đảm bảo không bị tràn bên trên
              if (finalTop < window.scrollY + 8) {
                finalTop = window.scrollY + 8
              }
            }
            
            menu.style.top = `${finalTop}px`
            menu.style.left = `${finalLeft}px`
            menu.style.position = 'fixed' // Dùng fixed để tính toán chính xác với viewport
            
            activeMenu = menu
            
            // Sử dụng cả mousedown và click để đảm bảo đóng menu khi click ra ngoài
            setTimeout(() => {
              document.addEventListener('mousedown', closeMenu, true)
              document.addEventListener('click', closeMenu, true)
            }, 0)
          }
          
          const handleMenuAction = (action, imgNode, imgPos, view) => {
            const { state, dispatch } = view
            const imageUrl = imgNode.attrs.src
            const imageData = {
              src: imageUrl,
              alt: imgNode.attrs.alt || '',
              title: imgNode.attrs.title || '',
              width: imgNode.attrs.width || null,
              height: imgNode.attrs.height || null,
            }
            
            if (action === 'copy' || action === 'cut') {
              // Lưu vào clipboard
              window.imageClipboard = {
                type: 'image',
                data: imageData,
                operation: action,
              }
              
              if (action === 'cut') {
                // Xóa ảnh khỏi node hiện tại
                const transaction = state.tr.delete(imgPos, imgPos + imgNode.nodeSize)
                dispatch(transaction)
                
                // ⚠️ FIX: Trigger tính toán lại kích thước node sau khi xóa ảnh
                setTimeout(() => {
                  // Dispatch custom event để component có thể lắng nghe và gọi updateNodeHeight()
                  window.dispatchEvent(new CustomEvent('image-deleted-in-editor'))
                  // Emit input event để trigger handleEditorInput và tính toán lại kích thước
                  const inputEvent = new Event('input', { bubbles: true })
                  view.dom.dispatchEvent(inputEvent)
                }, 50)
              }
            } else if (action === 'delete') {
              // Xóa ảnh
              const transaction = state.tr.delete(imgPos, imgPos + imgNode.nodeSize)
              dispatch(transaction)
              
              // ⚠️ FIX: Trigger tính toán lại kích thước node sau khi xóa ảnh
              setTimeout(() => {
                // Dispatch custom event để component có thể lắng nghe và gọi updateNodeHeight()
                window.dispatchEvent(new CustomEvent('image-deleted-in-editor'))
                // Emit input event để trigger handleEditorInput và tính toán lại kích thước
                const inputEvent = new Event('input', { bubbles: true })
                view.dom.dispatchEvent(inputEvent)
              }, 50)
            }
          }
          
          // Lưu reference để có thể truy cập từ handleDOMEvents
          pluginViewRef.createImageMenu = createImageMenu
          pluginViewRef.handleMenuAction = handleMenuAction
          
          return {
            update: () => {
              // Cleanup menu khi editor update
              if (activeMenu) {
                activeMenu.remove()
                activeMenu = null
              }
            },
            destroy: () => {
              if (activeMenu) {
                activeMenu.remove()
              }
            },
          }
        },
        props: {
          handleDOMEvents: {
            click: (view, event) => {
              const target = event.target
              
              // Xử lý click vào menu button (3 chấm)
              if (target.classList.contains('image-menu-button')) {
                event.preventDefault()
                event.stopPropagation()
                
                const imageWrapper = target.closest('.image-wrapper')
                const imgElement = imageWrapper?.querySelector('img')
                if (!imgElement) return true
                
                const imageSrc = imageWrapper.getAttribute('data-image-src') || imgElement.getAttribute('src')
                if (!imageSrc) return true
                
                // Tìm node position trong ProseMirror doc
                const { state } = view
                const { doc } = state
                let imgPos = null
                let imgNode = null
                
                // Tìm ảnh đầu tiên có src khớp
                doc.descendants((node, pos) => {
                  if (node.type.name === 'image' && node.attrs.src === imageSrc) {
                    // Kiểm tra xem ảnh này đã được tìm thấy chưa (tránh duplicate)
                    if (imgPos === null) {
                      imgPos = pos
                      imgNode = node
                      return false
                    }
                  }
                })
                
                if (imgPos !== null && imgNode && pluginViewRef.createImageMenu) {
                  pluginViewRef.createImageMenu(imgElement, imgNode, imgPos)
                }
                
                return true
              }
              
              // Xử lý click vào ảnh (zoom)
              if (target.tagName === 'IMG') {
                event.preventDefault()
                event.stopPropagation()
                
                // Emit event để mở modal
                const imageUrl = target.getAttribute('src')
                if (imageUrl && !target.getAttribute('data-loading')) {
                  // Dispatch custom event
                  window.dispatchEvent(new CustomEvent('open-image-modal', {
                    detail: { imageUrl }
                  }))
                }
                
                return true
              }
              
              // ⚠️ CRITICAL: Ngăn chặn đặt cursor vào vùng ảnh hoàn toàn
              // Kiểm tra xem click có liên quan đến ảnh không
              const isImageWrapper = target.closest('.image-wrapper') || target.closest('.image-wrapper-node')
              const isImageGroupWrapper = target.closest('.image-group-wrapper')
              const isImage = target.tagName === 'IMG'
              const isImageMenu = target.closest('.image-menu-button') || target.closest('.image-context-menu')
              const isGapCursor = target.classList?.contains('ProseMirror-gapcursor')
              
              // ⚠️ NEW: Nếu click vào bất kỳ thành phần nào liên quan đến ảnh, ngăn chặn hoàn toàn
              if (isImage || isImageWrapper || isImageGroupWrapper || isImageMenu || isGapCursor) {
                event.preventDefault()
                event.stopPropagation()
                return true
              }
              
              // Nếu click không phải vào ảnh, image wrapper, hoặc menu
              if (!isImage && !isImageWrapper && !isImageGroupWrapper && !isImageMenu) {
                // Lấy vị trí click trong document
                const coords = view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY
                })
                
                if (coords) {
                  const { state } = view
                  const { doc } = state
                  const clickPos = coords.pos
                  
                  // Tìm ảnh trước và sau vị trí click
                  let imageBefore = null
                  let imageAfter = null
                  let imageBeforePos = null
                  let imageAfterPos = null
                  
                  doc.descendants((node, pos) => {
                    if (node.type.name === 'image') {
                      const nodeEnd = pos + node.nodeSize
                      
                      // Ảnh trước vị trí click
                      if (nodeEnd <= clickPos && (imageBeforePos === null || pos > imageBeforePos)) {
                        imageBefore = node
                        imageBeforePos = pos
                      }
                      
                      // Ảnh sau vị trí click
                      if (pos > clickPos && (imageAfterPos === null || pos < imageAfterPos)) {
                        imageAfter = node
                        imageAfterPos = pos
                      }
                    }
                  })
                  
                  // Nếu có ảnh trước và sau vị trí click, và click vào khoảng trống giữa chúng
                  if (imageBefore && imageAfter) {
                    // Kiểm tra xem có phải khoảng trống thực sự không (không có text node)
                    const rangeStart = imageBeforePos + imageBefore.nodeSize
                    const rangeEnd = imageAfterPos
                    
                    // Kiểm tra xem trong khoảng này có text không
                    let hasText = false
                    doc.nodesBetween(rangeStart, rangeEnd, (node) => {
                      if (node.isText && node.text.trim().length > 0) {
                        hasText = true
                        return false // Stop searching
                      }
                      if (node.type.name === 'paragraph' && node.textContent.trim().length > 0) {
                        hasText = true
                        return false // Stop searching
                      }
                    })
                    
                    // Nếu không có text trong khoảng trống giữa 2 ảnh, ngăn chặn đặt cursor
                    if (!hasText && clickPos >= rangeStart && clickPos <= rangeEnd) {
                      event.preventDefault()
                      event.stopPropagation()
                      return true // Prevent default cursor placement
                    }
                  }
                }
              }
              
              return false
            },
          },
        },
      }),
    ]
  },
})

// Extension để group images liên tiếp và thêm class cho styling
const ImageGroupExtension = Extension.create({
  name: 'imageGroup',
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(editorView) {
          let isUpdating = false
          let updateTimeout = null
          
          const updateImageLayout = () => {
            if (isUpdating) return
            
            const { dom } = editorView
            const proseElement = dom.querySelector('.mindmap-editor-prose')
            if (!proseElement) {
              
              return
            }
            
            isUpdating = true
            
            try {
              // Xóa wrapper cũ
              const oldWrappers = proseElement.querySelectorAll('.image-group-wrapper')
              
              oldWrappers.forEach(wrapper => {
                const images = Array.from(wrapper.children).filter(c => 
                  c.classList.contains('image-wrapper')
                ).map(w => w.querySelector('img')).filter(Boolean)
                
                images.forEach(img => {
                  if (wrapper.parentElement) {
                    wrapper.parentElement.insertBefore(img, wrapper)
                  }
                })
                wrapper.remove()
              })
              
              // Tìm tất cả images
              const allImages = Array.from(proseElement.querySelectorAll('img'))
              
              
              if (allImages.length === 0) {
                isUpdating = false
                return
              }
              
              // ⚠️ DISABLED: Không dùng image-group-wrapper nữa
              // ImageWithMenuExtension đã tạo wrapper riêng cho mỗi ảnh với width dynamic
              // Return sớm để không tạo wrapper group
              isUpdating = false
              return
              
              // OLD CODE BELOW (DISABLED)
              // Tạo wrapper mới cho TẤT CẢ ảnh
              const wrapper = document.createElement('div')
              wrapper.className = 'image-group-wrapper'
              wrapper.setAttribute('data-image-group', 'true')
              wrapper.style.cssText = `
                display: flex !important;
                flex-direction: row !important;
                flex-wrap: wrap !important;
                gap: 4px !important;
                margin: 12px 0 !important;
                width: 100% !important;
                max-width: 368px !important;
                box-sizing: border-box !important;
              `
              
              // Insert wrapper vào đầu prose (sau text nodes)
              const firstImage = allImages[0]
              if (firstImage && firstImage.parentElement) {
                firstImage.parentElement.insertBefore(wrapper, firstImage)
              }
              
              // Wrap từng ảnh
              allImages.forEach((img, index) => {
                
                
                // Tạo image wrapper
                const imageWrapper = document.createElement('div')
                imageWrapper.className = 'image-wrapper'
                imageWrapper.style.cssText = `
                  position: relative !important;
                  display: flex !important;
                  box-sizing: border-box !important;
                  background: transparent !important;
                  flex-shrink: 0 !important;
                `
                imageWrapper.setAttribute('data-image-src', img.getAttribute('src') || '')
                
                // Tạo menu button
                const menuButton = document.createElement('button')
                menuButton.className = 'image-menu-button'
                menuButton.setAttribute('type', 'button')
                menuButton.setAttribute('contenteditable', 'false')
                menuButton.setAttribute('data-tiptap-ignore', 'true')
                menuButton.setAttribute('data-pm-ignore', 'true')
                menuButton.setAttribute('draggable', 'false')
                menuButton.setAttribute('data-menu-button', 'true')
                menuButton.setAttribute('aria-label', 'Image options')
                // Sử dụng SVG icon thay vì text để tránh ProseMirror parse
                menuButton.appendChild(createMenuIcon())
                menuButton.style.cssText = `
                  position: absolute !important;
                  top: 4px !important;
                  right: 4px !important;
                  width: 32px !important;
                  height: 32px !important;
                  border-radius: 6px !important;
                  background: rgba(0, 0, 0, 0.7) !important;
                  color: white !important;
                  border: 2px solid rgba(255, 255, 255, 0.3) !important;
                  cursor: pointer !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  font-size: 20px !important;
                  font-weight: bold !important;
                  line-height: 1 !important;
                  opacity: 0 !important;
                  transition: all 0.2s ease !important;
                  z-index: 1000 !important;
                  backdrop-filter: blur(4px) !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  pointer-events: auto !important;
                `
                
                
                
                // Events
                menuButton.addEventListener('mouseenter', (e) => {
                  
                  menuButton.style.background = 'rgba(0, 0, 0, 0.9)'
                  menuButton.style.opacity = '1'
                })
                
                menuButton.addEventListener('mouseleave', () => {
                  menuButton.style.background = 'rgba(0, 0, 0, 0.7)'
                })
                
                // ⚠️ CRITICAL: Prevent blur khi click vào menu button
                menuButton.addEventListener('mousedown', (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  // Focus lại editor ngay lập tức để tránh blur
                  if (this.editor && !this.editor.isDestroyed) {
                    this.editor.chain().focus().run()
                  }
                })
                
                menuButton.addEventListener('click', (e) => {
                  
                  e.preventDefault()
                  e.stopPropagation()
                })
                
                // Remove img từ parent hiện tại
                if (img.parentElement) {
                  img.parentElement.removeChild(img)
                }
                
                // Thêm img vào wrapper
                imageWrapper.appendChild(img)
                imageWrapper.appendChild(menuButton)
                wrapper.appendChild(imageWrapper)
                
                // Hover events cho wrapper
                imageWrapper.addEventListener('mouseenter', () => {
                  
                  menuButton.style.opacity = '1'
                })
                
                imageWrapper.addEventListener('mouseleave', () => {
                  
                  menuButton.style.opacity = '0'
                })
              })
              
              
              
            } catch (error) {
              
            } finally {
              isUpdating = false
            }
          }
          
          const handleUpdate = () => {
            if (isUpdating) return
            if (updateTimeout) clearTimeout(updateTimeout)
            updateTimeout = setTimeout(() => {
              
              updateImageLayout()
            }, 100)
          }
          
          // Initial update
          setTimeout(() => {
            
            updateImageLayout()
          }, 200)
          
          // Observer
          const observer = new MutationObserver((mutations) => {
            if (isUpdating) return
            
            const hasImageChanges = mutations.some(mutation => {
              return Array.from(mutation.addedNodes).some(node => node.tagName === 'IMG') ||
                     Array.from(mutation.removedNodes).some(node => node.tagName === 'IMG')
            })
            
            if (hasImageChanges) {
              
              handleUpdate()
            }
          })
          
          observer.observe(editorView.dom, {
            childList: true,
            subtree: true,
          })
          
          return {
            update: () => {
              
              handleUpdate()
            },
            destroy: () => {
              if (updateTimeout) clearTimeout(updateTimeout)
              observer.disconnect()
            },
          }
        },
      }),
    ]
  },
})

// Extension để áp dụng style hiện tại khi paste text
const ApplyCurrentStyleOnPaste = Extension.create({
  name: 'applyCurrentStyleOnPaste',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const { state, dispatch } = view
            const { selection } = state
            const { $from } = selection

            // Lấy clipboard data
            const clipboardData = event.clipboardData
            if (!clipboardData) return false

            // Kiểm tra xem có ảnh trong clipboard không - nếu có thì bỏ qua (để UploadImageOnPaste xử lý)
            const items = Array.from(clipboardData.items || [])
            const hasImage = items.some(item => item.type.indexOf('image') === 0)
            if (hasImage) return false

            // Lấy plain text từ clipboard (bỏ qua HTML format)
            const plainText = clipboardData.getData('text/plain')
            if (!plainText) return false

            // Lấy style hiện tại tại vị trí cursor
            const marks = $from.marks()
            const activeMarks = marks.filter(mark => {
              // Chỉ lấy các marks liên quan đến formatting (bold, italic, underline, textStyle, strike)
              return mark.type.name === 'bold' ||
                mark.type.name === 'italic' ||
                mark.type.name === 'underline' ||
                mark.type.name === 'textStyle' ||
                mark.type.name === 'strike' ||
                mark.type.name === 's' // strike có thể là 's' hoặc 'strike'
            })

            // Kiểm tra xem node có completed không (có strike mark trong title)
            // Nếu cursor không có strike mark, kiểm tra xem có strike mark trong title paragraphs không
            const hasStrikeInMarks = marks.some(m => m.type.name === 'strike' || m.type.name === 's')
            let shouldApplyStrike = hasStrikeInMarks

            if (!shouldApplyStrike) {
              // Kiểm tra xem có strike mark trong title paragraphs không (node đã completed)
              const { doc } = state
              doc.descendants((node, pos) => {
                if (node.isText) {
                  const resolvedPos = state.doc.resolve(pos)
                  let inBlockquote = false

                  // Check if in blockquote
                  for (let i = resolvedPos.depth; i > 0; i--) {
                    const nodeAtDepth = resolvedPos.node(i)
                    if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                      inBlockquote = true
                      break
                    }
                  }

                  if (!inBlockquote) {
                    // Title paragraph - kiểm tra có strike mark không
                    const nodeMarks = node.marks || []
                    if (nodeMarks.some(m => m.type.name === 'strike' || m.type.name === 's')) {
                      shouldApplyStrike = true
                      return false // Stop iteration
                    }
                  }
                }
              })
            }

            // Nếu node đã completed (có strike), thêm strike mark vào activeMarks
            if (shouldApplyStrike) {
              const strikeMark = state.schema.marks.strike || state.schema.marks.s
              if (strikeMark && !activeMarks.some(m => m.type.name === 'strike' || m.type.name === 's')) {
                activeMarks.push(strikeMark.create())
              }
            }

            // Nếu không có style nào, cho phép paste bình thường (TipTap sẽ xử lý)
            if (activeMarks.length === 0) return false

            // Ngăn chặn paste mặc định để tự xử lý
            event.preventDefault()

            // Tạo transaction để insert text với marks
            const { from, to } = selection
            const tr = state.tr

            // Nếu có selection, xóa nó trước
            if (from !== to) {
              tr.delete(from, to)
            }

            // Insert text với marks hiện tại
            // Xử lý text có nhiều dòng (split by newline)
            const lines = plainText.split('\n')
            let insertPos = from

            lines.forEach((line, index) => {
              if (line) {
                // Insert text với marks hiện tại (áp dụng style)
                const textNode = state.schema.text(line, activeMarks)
                tr.insert(insertPos, textNode)
                insertPos += line.length
              }

              // Nếu không phải dòng cuối, insert paragraph break
              if (index < lines.length - 1) {
                const paragraph = state.schema.nodes.paragraph.create()
                tr.insert(insertPos, paragraph)
                insertPos += paragraph.nodeSize
              }
            })

            // Set selection sau text vừa paste
            tr.setSelection(state.selection.constructor.near(tr.doc.resolve(insertPos)))

            dispatch(tr)
            return true
          }
        }
      })
    ]
  }
})

export default {
  name: "MindmapNodeEditor",
  components: {
    EditorContent,
  },
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    placeholder: {
      type: String,
      default: "Nhập...",
    },
    color: {
      type: String,
      default: "#1f2937",
    },
    minHeight: {
      type: String,
      default: "43px",
    },
    width: {
      type: String,
      default: "100%",
    },
    height: {
      type: String,
      default: "auto",
    },
    onInput: {
      type: Function,
      default: null,
    },
    onFocus: {
      type: Function,
      default: null,
    },
    onBlur: {
      type: Function,
      default: null,
    },
    onCreateDescription: {
      type: Function,
      default: null,
    },
    isRoot: {
      type: Boolean,
      default: false,
    },
    uploadImage: {
      type: Function,
      default: null,
    },
    nodeId: {
      type: String,
      default: null,
    },
  },
  emits: ["update:modelValue", "focus", "blur", "input", "create-description"],

  data() {
    return {
      editor: null,
      isUpdatingFromModelValue: false, // Flag để tránh vòng lặp khi update từ modelValue
      _isUnmounting: false, // Flag để ngăn update khi đang unmount
      isCalculatingHeight: false, // ⚠️ NEW: Flag để tránh recalculate đồng thời
      heightUpdateTimer: null, // ⚠️ NEW: Timer cho debounce
    }
  },
  expose: ['editor'], // Expose editor để có thể truy cập từ bên ngoài
  methods: {
    // Thêm data-type cho các phần tử trong node
    setDataTypesForElements() {
      if (!this.editor || !this.editor.view) {
        
        return
      }
      
      const { dom } = this.editor.view
      const proseElement = dom.querySelector('.mindmap-editor-prose') || dom
      if (!proseElement) {
        
        return
      }
      
      // 1. Thêm data-type="node-image" cho image wrappers (nếu chưa có)
      const imageWrappers = proseElement.querySelectorAll('.image-wrapper-node')
      imageWrappers.forEach((wrapper) => {
        if (wrapper.getAttribute('data-type') !== 'node-image') {
          wrapper.setAttribute('data-type', 'node-image')
        }
        
        // ⚠️ NEW: Thêm event handlers để ngăn editor focus khi click vào ảnh
        const preventEditorFocus = (e) => {
          // Chỉ stop propagation nếu click vào wrapper (không phải button menu)
          if (!e.target.closest('.image-menu-button')) {
            e.stopPropagation()
          }
        }
        
        // Remove old listeners nếu có (tránh duplicate)
        wrapper.removeEventListener('mousedown', preventEditorFocus, true)
        
        // Add new listeners
        wrapper.addEventListener('mousedown', preventEditorFocus, true)
      })
      
      // ⚠️ NEW: Thêm event handlers cho tất cả ảnh trực tiếp
      const images = proseElement.querySelectorAll('img:not(.image-menu-button *)')
      images.forEach((img) => {
        const preventEditorFocus = (e) => {
          // Chỉ stop propagation nếu click vào ảnh (không phải button menu)
          if (!e.target.closest('.image-menu-button')) {
            e.stopPropagation()
          }
        }
        
        // Remove old listeners nếu có (tránh duplicate)
        img.removeEventListener('mousedown', preventEditorFocus, true)
        
        // Add new listeners
        img.addEventListener('mousedown', preventEditorFocus, true)
      })
      
      // 2. Thêm data-type="node-task-link" cho task link sections (nếu chưa có)
      const taskLinkSections = proseElement.querySelectorAll('.node-task-link-section, [data-node-section="task-link"]')
      taskLinkSections.forEach((section) => {
        if (section.getAttribute('data-type') !== 'node-task-link') {
          section.setAttribute('data-type', 'node-task-link')
        }
        
        // ⚠️ NEW: Thêm event handlers để ngăn editor focus khi click vào task link
        const preventEditorFocus = (e) => {
          e.stopPropagation()
          // Không preventDefault để link vẫn hoạt động
        }
        
        // Remove old listeners nếu có (tránh duplicate)
        section.removeEventListener('mousedown', preventEditorFocus, true)
        section.removeEventListener('click', preventEditorFocus, true)
        
        // Add new listeners
        section.addEventListener('mousedown', preventEditorFocus, true)
        section.addEventListener('click', preventEditorFocus, true)
      })
      
      // ⚠️ FIX: Thêm data-type="node-task-link" cho paragraph chứa link "Liên kết công việc" với task_id
      // (Trường hợp ProseMirror chuyển đổi <section> thành <p>)
      const allParagraphs = proseElement.querySelectorAll('p')
      
      allParagraphs.forEach((p, index) => {
        const hasTaskLinkAnchor = p.querySelector('a[href*="task_id"]') || 
          p.querySelector('a[href*="/mtp/project/"]')
        const text = p.textContent?.trim() || ''
        const hasTaskLinkText = text.includes('Liên kết công việc')
        const currentDataType = p.getAttribute('data-type')
        
        if (hasTaskLinkText && hasTaskLinkAnchor) {
          // Đây là paragraph chứa task link - thêm data-type
          if (currentDataType !== 'node-task-link') {
            p.setAttribute('data-type', 'node-task-link')
            
            
            // ⚠️ NEW: Thêm event handlers để ngăn editor focus khi click vào task link paragraph
            const preventEditorFocus = (e) => {
              // Chỉ stop propagation nếu click vào paragraph hoặc link, không phải vào text editor
              if (e.target === p || e.target.closest('a')) {
                e.stopPropagation()
              }
            }
            
            // Remove old listeners nếu có (tránh duplicate)
            p.removeEventListener('mousedown', preventEditorFocus, true)
            p.removeEventListener('click', preventEditorFocus, true)
            
            // Add new listeners
            p.addEventListener('mousedown', preventEditorFocus, true)
            p.addEventListener('click', preventEditorFocus, true)
            
            // ⚠️ FIX: Update ProseMirror document để giữ lại attribute khi serialize
            // Sử dụng requestAnimationFrame để tránh vòng lặp
            if (this.editor && this.editor.view && !this.isUpdatingFromModelValue) {
              requestAnimationFrame(() => {
                try {
                  const { view } = this.editor
                  const pos = view.posAtDOM(p, 0)
                  if (pos !== null && pos !== undefined && pos >= 0) {
                    const $pos = view.state.doc.resolve(pos)
                    const node = $pos.parent
                    if (node && node.type.name === 'paragraph') {
                      // Tìm vị trí của paragraph trong document
                      let paragraphPos = null
                      view.state.doc.descendants((n, p) => {
                        if (n === node) {
                          paragraphPos = p
                          return false
                        }
                      })
                      
                      if (paragraphPos !== null && paragraphPos >= 0) {
                        // Update attribute trong ProseMirror document
                        const tr = view.state.tr
                        tr.setNodeMarkup(paragraphPos, null, {
                          ...node.attrs,
                          'data-type': 'node-task-link'
                        })
                        view.dispatch(tr)
                        
                      }
                    }
                  }
                } catch (err) {
                  console.error('[DEBUG] Lỗi khi update ProseMirror document:', err)
                }
              })
            }
          } 
        }
      })
      
      // 3. Thêm data-type="node-title" cho TẤT CẢ các title paragraphs (không trong blockquote và không phải task-link)
      // ⚠️ FIX: Set data-type="node-title" cho tất cả title paragraphs, không chỉ paragraph đầu tiên
      const paragraphs = Array.from(proseElement.querySelectorAll('p'))
      
      
      for (const p of paragraphs) {
        const isInBlockquote = p.closest('blockquote') !== null
        const currentDataType = p.getAttribute('data-type')
        
        // ⚠️ FIX: Bỏ qua paragraph có data-type="node-task-link"
        if (currentDataType === 'node-task-link') {
          
          continue
        }
        
        // Bỏ qua paragraph trong blockquote
        if (isInBlockquote) {
          continue
        }
        
        // Kiểm tra xem có phải task link không (bằng cách kiểm tra text và link)
        const hasTaskLinkAnchor = p.querySelector('a[href*="task_id"]') || 
          p.querySelector('a[href*="/mtp/project/"]')
        const text = p.textContent?.trim() || ''
        const hasTaskLinkText = text.includes('Liên kết công việc')
        const isTaskLink = p.querySelector('.node-task-link-section') || 
                          p.querySelector('[data-node-section="task-link"]') ||
                          p.classList.contains('node-task-link-section') ||
                          p.getAttribute('data-node-section') === 'task-link' ||
                          (hasTaskLinkText && hasTaskLinkAnchor)
        
        // Nếu không phải task link, set data-type="node-title"
        if (!isTaskLink) {
          if (currentDataType !== 'node-title') {
            p.setAttribute('data-type', 'node-title')
            
            
            // ⚠️ FIX: Update ProseMirror document để giữ lại attribute khi serialize
            if (this.editor && this.editor.view && !this.isUpdatingFromModelValue) {
              requestAnimationFrame(() => {
                try {
                  const { view } = this.editor
                  const pos = view.posAtDOM(p, 0)
                  if (pos !== null && pos !== undefined && pos >= 0) {
                    const $pos = view.state.doc.resolve(pos)
                    const node = $pos.parent
                    if (node && node.type.name === 'paragraph') {
                      // Tìm vị trí của paragraph trong document
                      let paragraphPos = null
                      view.state.doc.descendants((n, p) => {
                        if (n === node) {
                          paragraphPos = p
                          return false
                        }
                      })
                      
                      if (paragraphPos !== null && paragraphPos >= 0) {
                        // Update attribute trong ProseMirror document
                        const tr = view.state.tr
                        tr.setNodeMarkup(paragraphPos, null, {
                          ...node.attrs,
                          'data-type': 'node-title'
                        })
                        view.dispatch(tr)
                      }
                    }
                  }
                } catch (err) {
                  console.error('[DEBUG] Lỗi khi update ProseMirror document:', err)
                }
              })
            }
          }
        }
      }
    },
    // Lấy text từ editor mà preserve trailing spaces
    getEditorTextWithTrailingSpaces() {
      if (!this.editor || !this.editor.state) return ''

      // Lấy text từ ProseMirror document để preserve trailing spaces
      // ProseMirror text nodes giữ nguyên trailing spaces trong text property
      const { doc } = this.editor.state
      const paragraphs = []

      // Duyệt qua tất cả paragraphs
      doc.forEach((node) => {
        if (node.type.name === 'paragraph') {
          // Lấy text từ paragraph, giữ nguyên trailing spaces
          let paraText = ''
          node.forEach((child) => {
            if (child.isText) {
              paraText += child.text
            }
          })
          paragraphs.push(paraText)
        }
      })

      // Join các paragraphs với newline
      return paragraphs.join('\n')
    },
    // Force wrap ảnh ngay khi mount để đảm bảo button menu được thêm vào DOM
    forceWrapImages() {
      if (!this.editor || !this.editor.view) return
      
      const { dom } = this.editor.view
      const proseElement = dom.querySelector('.mindmap-editor-prose')
      if (!proseElement) return

      // Tìm tất cả ảnh chưa được wrap
      const images = Array.from(proseElement.querySelectorAll('img'))
      
      if (images.length === 0) return
      
      let wrappedCount = 0
      
      images.forEach((img) => {
        // Bỏ qua nếu ảnh đã có image-wrapper
        if (img.closest('.image-wrapper')) {
          wrappedCount++
          return
        }
        
        // Bỏ qua ảnh đang loading
        if (img.getAttribute('data-loading') === 'true') return
        
        // Tạo image wrapper
        const imageWrapper = document.createElement('div')
        imageWrapper.className = 'image-wrapper'
        imageWrapper.style.cssText = 'position: relative; display: flex; flex-shrink: 0;'
        imageWrapper.setAttribute('data-image-src', img.getAttribute('src') || '')
        
        // Tạo menu button
        const menuButton = document.createElement('button')
        menuButton.className = 'image-menu-button'
        menuButton.setAttribute('contenteditable', 'false')
        menuButton.setAttribute('data-tiptap-ignore', 'true')
        menuButton.setAttribute('data-pm-ignore', 'true')
        menuButton.setAttribute('draggable', 'false')
        menuButton.setAttribute('data-menu-button', 'true')
        menuButton.setAttribute('aria-label', 'Image options')
        // Sử dụng SVG icon thay vì text để tránh ProseMirror parse
        menuButton.appendChild(createMenuIcon())
        menuButton.style.cssText = `
          position: absolute;
          top: 8px;
          right: 8px;
          width: 28px;
          height: 28px;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.6);
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          line-height: 1;
          opacity: 0;
          transition: opacity 0.2s ease, background 0.2s ease;
          z-index: 100;
          backdrop-filter: blur(4px);
          pointer-events: auto;
        `
        
                // ⚠️ CRITICAL: Prevent blur khi click vào menu button
                menuButton.addEventListener('mousedown', (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  // Focus lại editor ngay lập tức để tránh blur
                  if (this.editor && !this.editor.isDestroyed) {
                    this.editor.chain().focus().run()
                  }
                })
                
                menuButton.addEventListener('mouseenter', () => {
                  menuButton.style.background = 'rgba(0, 0, 0, 0.8)'
                })
                menuButton.addEventListener('mouseleave', () => {
                  menuButton.style.background = 'rgba(0, 0, 0, 0.6)'
                })
        
        // Wrap ảnh
        const parent = img.parentElement
        if (parent) {
          parent.insertBefore(imageWrapper, img)
          imageWrapper.appendChild(img)
          imageWrapper.appendChild(menuButton)
          
          // Thêm event listeners với tối ưu để giảm lag
          // ⚠️ OPTIMIZE: Cache editor focused state và dùng requestAnimationFrame
          let isEditorFocused = this.editor && this.editor.view && this.editor.view.focused
          
          const showMenu = () => {
            if (isEditorFocused) {
              requestAnimationFrame(() => {
                menuButton.style.opacity = '1'
                imageWrapper.classList.add('image-wrapper-hover')
              })
            }
          }
          
          const hideMenu = (e) => {
            const relatedTarget = e.relatedTarget
            if (!relatedTarget || 
                (!relatedTarget.classList.contains('image-menu-button') && 
                 !relatedTarget.closest('.image-menu-button'))) {
              requestAnimationFrame(() => {
                menuButton.style.opacity = '0'
                imageWrapper.classList.remove('image-wrapper-hover')
              })
            }
          }
          
          imageWrapper.addEventListener('mouseenter', showMenu, { passive: true })
          imageWrapper.addEventListener('mouseleave', hideMenu, { passive: true })
          menuButton.addEventListener('mouseenter', showMenu, { passive: true })
          menuButton.addEventListener('mouseleave', (e) => {
            const relatedTarget = e.relatedTarget
            if (!relatedTarget || 
                (!relatedTarget.classList.contains('image-wrapper') && 
                 !relatedTarget.closest('.image-wrapper'))) {
              requestAnimationFrame(() => {
                menuButton.style.opacity = '0'
                imageWrapper.classList.remove('image-wrapper-hover')
              })
            }
          }, { passive: true })
          
          imageWrapper.setAttribute('data-menu-attached', 'true')
        }
      })
      
      // Log để debug
      if (wrappedCount < images.length) {
        
      }
    },
    // Đo lại height sau khi ảnh load xong
    measureHeightAfterImageLoad() {
      if (!this.editor || !this.editor.view) return
      
      const { dom } = this.editor.view
      const proseElement = dom.querySelector('.mindmap-editor-prose')
      if (!proseElement) return
      
      // Tìm tất cả ảnh trong editor
      const images = Array.from(proseElement.querySelectorAll('img'))
      if (images.length === 0) return
      
      // Đếm số ảnh đã load xong
      let loadedCount = 0
      const totalImages = images.length
      
      // Kiểm tra ảnh đã load chưa
      const checkImageLoad = (img) => {
        if (img.complete && img.naturalHeight !== 0) {
          loadedCount++
          if (loadedCount === totalImages) {
            // Tất cả ảnh đã load xong, đo lại height
            this.updateNodeHeight()
          }
        } else {
          // Ảnh chưa load, thêm listener
          img.addEventListener('load', () => {
            loadedCount++
            if (loadedCount === totalImages) {
              // Tất cả ảnh đã load xong, đo lại height
              this.updateNodeHeight()
            }
          }, { once: true })
          
          // Nếu ảnh load lỗi, vẫn tính là đã load
          img.addEventListener('error', () => {
            loadedCount++
            if (loadedCount === totalImages) {
              this.updateNodeHeight()
            }
          }, { once: true })
        }
      }
      
      // Kiểm tra từng ảnh
      images.forEach(checkImageLoad)
      
      // Nếu tất cả ảnh đã load sẵn, đo ngay
      if (loadedCount === totalImages) {
        this.updateNodeHeight()
      }
    },
    // Cập nhật height của node dựa trên editor content
    updateNodeHeight() {
      // ⚠️ CRITICAL FIX: Debounce để tránh gọi nhiều lần đồng thời
      if (this.heightUpdateTimer) {
        clearTimeout(this.heightUpdateTimer)
      }
      
      this.heightUpdateTimer = setTimeout(() => {
        this.updateNodeHeightImmediate()
      }, 16) // ~1 frame (16ms)
    },
    // Internal method - gọi ngay lập tức không debounce
    updateNodeHeightImmediate() {
      // ⚠️ CRITICAL FIX: Skip nếu đang tính toán height
      if (this.isCalculatingHeight) {
        
        return
      }
      
      if (!this.editor || !this.editor.view) {
        
        return
      }
      
      const { dom } = this.editor.view
      if (!dom) {
        
        return
      }
      
      const proseElement = dom.querySelector('.mindmap-editor-prose')
      if (!proseElement) {
        
        // Retry sau một chút nếu proseElement chưa có
        setTimeout(() => {
          if (this.editor && this.editor.view && this.editor.view.dom) {
            const retryProseElement = this.editor.view.dom.querySelector('.mindmap-editor-prose')
            if (retryProseElement) {
              
              this.updateNodeHeightImmediate()
            } else {
              
            }
          }
        }, 100)
        return
      }
      
      // ⚠️ CRITICAL FIX: Set flag để tránh recalculate đồng thời
      this.isCalculatingHeight = true
      
      
      
      // ⚠️ CRITICAL: Kiểm tra xem có ảnh không, nếu có thì đợi ảnh load xong trước khi đo
      const images = Array.from(proseElement.querySelectorAll('img'))
      const hasImages = images.length > 0
      
      
      
      if (hasImages) {
        // Có ảnh - đợi tất cả ảnh load xong trước khi đo height
        let loadedCount = 0
        const totalImages = images.length
        
        const checkAndMeasure = () => {
          loadedCount++
          
          if (loadedCount >= totalImages) {
            // Tất cả ảnh đã load xong, đo lại height
            
            // ⚠️ FIX: Giảm delay để update nhanh hơn, tránh layout jump
            setTimeout(() => {
              this.measureHeightInternal(proseElement)
            }, 20) // Giảm từ 50ms xuống 20ms
          }
        }
        
        images.forEach((img, idx) => {
          // ⚠️ CRITICAL: Kiểm tra xem ảnh có src không (không phải placeholder)
          const hasSrc = img.src && img.src !== 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmM2Y0ZjYiLz48L3N2Zz4='
          
          
          
          if (hasSrc && img.complete && img.naturalHeight !== 0) {
            // Ảnh đã load xong
            
            checkAndMeasure()
          } else if (hasSrc) {
            // Ảnh có src nhưng chưa load xong, thêm listener
            // ⚠️ CRITICAL: Khi ảnh load xong trong DOM, nó sẽ trigger load event
            
            img.addEventListener('load', () => {
              
              checkAndMeasure()
            }, { once: true })
            img.addEventListener('error', () => {
              
              checkAndMeasure()
            }, { once: true })
          } else {
            // Ảnh chưa có src (placeholder), không đợi
            // Sẽ được gọi lại khi ảnh được thay thế và load xong
            
            checkAndMeasure()
          }
        })
        
        // Nếu tất cả ảnh đã load sẵn, đo ngay
        if (loadedCount === totalImages) {
          
          this.measureHeightInternal(proseElement)
        }
      } else {
        // Không có ảnh - đo ngay
        
        this.measureHeightInternal(proseElement)
      }
    },
    // Internal method để đo height thực tế
    measureHeightInternal(proseElement) {
      
      // Đợi một chút để DOM đã render xong
      this.$nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            
            // ⚠️ CRITICAL: Set styles trước khi đo để đảm bảo chính xác
            const borderOffset = 4
            const maxWidth = 400
            // Kiểm tra xem có ảnh không để set width đúng
            const hasImages = proseElement.querySelectorAll('img').length > 0
            // Nếu có ảnh, width phải = 400px (maxWidth)
            const currentWidth = hasImages ? maxWidth : (parseFloat(proseElement.style.width) || 368)
            const foWidth = currentWidth - borderOffset
            
            // ⚠️ CRITICAL: Set overflow: visible TRƯỚC để scrollHeight tính đúng ảnh
            proseElement.style.overflow = 'visible'
            proseElement.style.boxSizing = 'border-box'
            proseElement.style.width = `${foWidth}px`
            proseElement.style.height = 'auto'
            proseElement.style.minHeight = '0'
            proseElement.style.maxHeight = 'none'
            proseElement.style.padding = '8px 16px'
            proseElement.style.whiteSpace = currentWidth >= maxWidth ? 'pre-wrap' : 'nowrap'
            
            // Force reflow để đảm bảo styles đã được áp dụng
            void proseElement.offsetWidth
            void proseElement.offsetHeight
            void proseElement.scrollHeight
            
            // ⚠️ CRITICAL: Đảm bảo overflow là visible để scrollHeight tính đúng ảnh
            proseElement.style.overflow = 'visible'
            
            // Force reflow lại sau khi set overflow
            void proseElement.offsetWidth
            void proseElement.offsetHeight
            void proseElement.scrollHeight
            
            // Đo height thực tế từ DOM - chỉ đo đến phần tử cuối cùng có nội dung
            // ⚠️ CRITICAL: Đảm bảo đo height chính xác, không đo phần trống thừa
            const paddingTop = parseFloat(window.getComputedStyle(proseElement).paddingTop) || 0
            const paddingBottom = parseFloat(window.getComputedStyle(proseElement).paddingBottom) || 0
            const proseRect = proseElement.getBoundingClientRect()
            
            // Tìm phần tử cuối cùng có nội dung thực tế
            let lastElementBottom = 0
            
            // Tìm tất cả các phần tử có nội dung thực tế
            const allElements = []
            
            // Thêm image wrappers
            const imageWrappers = proseElement.querySelectorAll('.image-wrapper-node')
            imageWrappers.forEach((wrapper) => {
              allElements.push(wrapper)
            })
            
            // Thêm images (nếu không có wrapper)
            if (imageWrappers.length === 0) {
              const images = proseElement.querySelectorAll('img')
              images.forEach((img) => {
                allElements.push(img)
              })
            }
            
            // ⚠️ CRITICAL: Thêm task link sections (Liên kết công việc)
            const taskLinkSections = proseElement.querySelectorAll('.node-task-link-section, [data-node-section="task-link"]')
            taskLinkSections.forEach((section) => {
              allElements.push(section)
            })
            
            // Thêm các phần tử text (paragraphs, blockquotes, headings, etc)
            const textElements = Array.from(proseElement.children).filter((child) => {
              // Bỏ qua các phần tử rỗng hoặc chỉ chứa whitespace
              const hasText = child.textContent.trim().length > 0
              const hasImage = child.querySelector('img') || child.querySelector('.image-wrapper-node')
              const hasTaskLink = child.querySelector('.node-task-link-section') || child.querySelector('[data-node-section="task-link"]')
              return hasText || hasImage || hasTaskLink
            })
            allElements.push(...textElements)
            
            // ⚠️ CRITICAL: Sắp xếp các phần tử theo vị trí bottom để tìm phần tử cuối cùng thực sự có nội dung
            const elementsWithPosition = []
            
            allElements.forEach((element) => {
              // Kiểm tra xem phần tử có nội dung thực tế không
              const hasRealContent = () => {
                // Nếu là image wrapper hoặc image, luôn có nội dung
                if (element.classList.contains('image-wrapper-node') || element.tagName === 'IMG') {
                  return true
                }
                // ⚠️ CRITICAL: Nếu là task link section, luôn có nội dung
                if (element.classList.contains('node-task-link-section') || 
                    element.getAttribute('data-node-section') === 'task-link' ||
                    element.querySelector('.node-task-link-section') ||
                    element.querySelector('[data-node-section="task-link"]') ||
                    element.querySelector('.node-task-badge')) {
                  return true
                }
                // Kiểm tra text content (bỏ qua whitespace)
                const text = element.textContent?.trim() || ''
                if (text.length > 0) {
                  return true
                }
                // Kiểm tra xem có chứa image không
                if (element.querySelector('img') || element.querySelector('.image-wrapper-node')) {
                  return true
                }
                return false
              }
              
              if (!hasRealContent()) {
                return // Bỏ qua phần tử không có nội dung
              }
              
              const elementRect = element.getBoundingClientRect()
              // Tính bottom relative to top của proseElement
              const elementBottom = elementRect.bottom - proseRect.top
              const elementStyle = window.getComputedStyle(element)
              const elementMarginBottom = parseFloat(elementStyle.marginBottom) || 0
              const totalBottom = elementBottom + elementMarginBottom
              
              elementsWithPosition.push({
                element,
                bottom: totalBottom
              })
            })
            
            // Sắp xếp theo bottom (từ lớn đến nhỏ) và lấy phần tử cuối cùng
            if (elementsWithPosition.length > 0) {
              elementsWithPosition.sort((a, b) => b.bottom - a.bottom)
              // Lấy phần tử cuối cùng (có bottom lớn nhất)
              lastElementBottom = elementsWithPosition[0].bottom
            }
            
            // Tính height: lastElementBottom đã là khoảng cách từ top của proseElement đến bottom của phần tử cuối
            let contentHeight = 0
            if (lastElementBottom > paddingTop) {
              // Có nội dung thực tế: lastElementBottom đã tính từ top của proseElement
              // Chỉ cần cộng thêm padding bottom
              contentHeight = lastElementBottom + paddingBottom
            } else {
              // Không có nội dung thực tế hoặc chỉ có padding
              // Dùng min height hợp lý
              contentHeight = paddingTop + paddingBottom + 27 // 27px cho text tối thiểu
            }
            
            // ⚠️ CRITICAL: Đảm bảo không có khoảng trống thừa
            // Nếu tính được height quá lớn so với scrollHeight thực tế, dùng scrollHeight
            const scrollHeight = proseElement.scrollHeight
            const offsetHeight = proseElement.offsetHeight
            
            // Nếu contentHeight lớn hơn scrollHeight đáng kể (> 20px), có thể có vấn đề
            // Ưu tiên dùng giá trị nhỏ hơn để tránh khoảng trống thừa
            if (contentHeight > scrollHeight + 20) {
              // Có khoảng trống thừa, dùng scrollHeight
              contentHeight = scrollHeight
            }
            
            // Đảm bảo height tối thiểu nhưng không quá lớn
            contentHeight = Math.max(contentHeight, 43) // min height
            contentHeight = Math.min(contentHeight, scrollHeight || contentHeight) // không lớn hơn scrollHeight
            
            
            
            // ⚠️ CRITICAL: Cập nhật height trực tiếp vào foreignObject và rect
            // Đảm bảo height được cập nhật ngay cả khi editor ở chế độ readonly
            const editorContainer = this.editor?.view?.dom?.closest('.node-editor-container')
            if (editorContainer) {
              const nodeId = editorContainer.getAttribute('data-node-id')
              if (nodeId) {
                // Tìm node-rect và foreignObject trong SVG
                const nodeGroup = document.querySelector(`[data-node-id="${nodeId}"]`)
                if (nodeGroup) {
                  const rect = nodeGroup.querySelector('.node-rect')
                  const fo = nodeGroup.querySelector('.node-text')
                  if (rect && fo) {
                    const borderOffset = 4
                    const currentWidth = parseFloat(rect.getAttribute('width')) || 400
                    const newHeight = Math.max(contentHeight, 43) // min height
                    
                    // Cập nhật height trực tiếp
                    rect.setAttribute('height', newHeight)
                    fo.setAttribute('height', Math.max(0, newHeight - borderOffset))
                  }
                }
              }
            }
            
            // ⚠️ CRITICAL: Trigger input event để d3MindmapRenderer tính lại height (fallback)
            // Lấy HTML hiện tại
            const html = this.editor.getHTML()
            
            
            
            // ⚠️ CRITICAL: Set flag để tránh vòng lặp
            this.isUpdatingFromModelValue = true
            
            // Emit input event với HTML hiện tại để trigger handleEditorInput
            // handleEditorInput sẽ đo lại height và cập nhật foreignObject (nếu cần)
            if (this.onInput) {
              
              this.onInput(html)
            }
            
            // Cũng emit update:modelValue để đảm bảo sync
            this.$emit('update:modelValue', html)
            this.$emit('input', html)
            
            
            
            // Reset flag sau một chút
            this.$nextTick(() => {
              this.isUpdatingFromModelValue = false
              // ⚠️ CRITICAL FIX: Reset flag để cho phép update tiếp theo
              this.isCalculatingHeight = false
            })
          })
        })
      })
    },
    // Clean HTML trước khi save - xóa menu buttons
    cleanHTMLForSave(html) {
      if (!html) return html
      
      // Parse HTML
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      
      // Xóa tất cả menu buttons
      const menuButtons = doc.querySelectorAll('.image-menu-button, button[data-menu-button="true"]')
      menuButtons.forEach(btn => btn.remove())
      
      // Xóa tất cả image wrappers nhưng giữ lại img
      const imageWrappers = doc.querySelectorAll('.image-wrapper')
      imageWrappers.forEach(wrapper => {
        const img = wrapper.querySelector('img')
        if (img && wrapper.parentElement) {
          wrapper.parentElement.insertBefore(img, wrapper)
        }
        wrapper.remove()
      })
      
      // Xóa image-group-wrapper nhưng giữ lại imgs
      const groupWrappers = doc.querySelectorAll('.image-group-wrapper')
      groupWrappers.forEach(wrapper => {
        const imgs = wrapper.querySelectorAll('img')
        imgs.forEach(img => {
          if (wrapper.parentElement) {
            wrapper.parentElement.insertBefore(img, wrapper)
          }
        })
        wrapper.remove()
      })
      
      // Xóa text nodes chứa '⋮'
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
      const nodesToRemove = []
      let node
      while (node = walker.nextNode()) {
        if (node.textContent.includes('⋮')) {
          nodesToRemove.push(node)
        }
      }
      nodesToRemove.forEach(n => n.remove())
      
      // Xóa paragraphs chỉ chứa '⋮'
      const paragraphs = doc.querySelectorAll('p')
      paragraphs.forEach(p => {
        if (p.textContent.trim() === '⋮' && !p.querySelector('img')) {
          p.remove()
        }
      })
      
      return doc.body.innerHTML
    },
    // Cleanup tất cả ký tự '⋮' từ editor (DOM và ProseMirror document)
    cleanupRemoveMenuText() {
      if (this._isUnmounting) return
      if (!this.editor || !this.editor.view) return
      
      const { state, dispatch } = this.editor.view
      const { doc } = state
      const tr = state.tr
      let modified = false
      
      // Tìm và xóa paragraphs chỉ chứa '⋮'
      doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph' && node.textContent.trim() === '⋮') {
          tr.delete(pos, pos + node.nodeSize)
          modified = true
          return false
        }
        
        // Xóa text nodes chứa '⋮'
        if (node.isText && node.text.includes('⋮')) {
          const cleanText = node.text.replace(/⋮/g, '')
          if (cleanText !== node.text) {
            tr.replaceWith(pos, pos + node.nodeSize, state.schema.text(cleanText, node.marks))
            modified = true
          }
        }
      })
      
      if (modified) {
        this.isUpdatingFromModelValue = true
        dispatch(tr)
        this.$nextTick(() => {
          this.isUpdatingFromModelValue = false
        })
      }
      
      // Cleanup DOM trực tiếp
      if (this.editor.view.dom) {
        const proseElement = this.editor.view.dom.querySelector('.mindmap-editor-prose')
        if (proseElement) {
          // Xóa paragraphs chỉ chứa '⋮'
          const paragraphs = proseElement.querySelectorAll('p')
          paragraphs.forEach(p => {
            if (p.textContent.trim() === '⋮' && !p.querySelector('img') && !p.querySelector('.image-menu-button')) {
              p.remove()
            }
          })
          
          // Xóa text nodes chứa '⋮' (không nằm trong button)
          const walker = document.createTreeWalker(proseElement, NodeFilter.SHOW_TEXT)
          const nodesToRemove = []
          let node
          while (node = walker.nextNode()) {
            if (node.textContent.includes('⋮')) {
              const parent = node.parentElement
              if (!parent || !parent.classList.contains('image-menu-button')) {
                nodesToRemove.push(node)
              }
            }
          }
          nodesToRemove.forEach(n => {
            const parent = n.parentElement
            if (parent && parent.textContent.trim() === '⋮') {
              parent.remove()
            } else {
              n.remove()
            }
          })
        }
      }
    },
  },
  watch: {
    modelValue(value) {
      if (this._isUnmounting) return
      if (!this.editor || this.isUpdatingFromModelValue) return

      // Lấy content hiện tại từ editor (HTML để so sánh với formatting)
      const currentHtml = this.editor.getHTML()

      // Chỉ cập nhật nếu khác nhau để tránh vòng lặp
      if (currentHtml !== value && value !== undefined && value !== null) {
        // Set flag để tránh vòng lặp
        this.isUpdatingFromModelValue = true

        // Set content - value có thể là HTML hoặc plain text
        // Nếu value là HTML (có thẻ <p>, <strong>, <em>), dùng setContent
        // Nếu là plain text, dùng insertContent
        const isEmpty = this.editor.isEmpty

        if (!isEmpty) {
          this.editor.commands.clearContent(false)
        }

        if (value) {
          // Kiểm tra xem value có phải HTML không
          const isHtml = /<[a-z][\s\S]*>/i.test(value)

          if (isHtml) {
            // ⚠️ CRITICAL: Clean HTML trước khi set vào editor để xóa <p>⋮</p> và menu buttons
            let cleanedValue = value
            // Xóa paragraphs chỉ chứa '⋮'
            cleanedValue = cleanedValue.replace(/<p[^>]*>\s*⋮\s*<\/p>/gi, '')
            // Xóa tất cả menu buttons
            cleanedValue = cleanedValue.replace(/<button[^>]*class="image-menu-button"[^>]*>.*?<\/button>/gi, '')
            // Xóa tất cả ký tự '⋮' còn lại (không nằm trong button)
            cleanedValue = cleanedValue.replace(/⋮/g, '')
            
            // Set HTML content (giữ formatting)
            this.editor.commands.setContent(cleanedValue, false)
          } else {
            // Insert plain text
            this.editor.commands.insertContent(value, false)
          }
        }

        // Reset flag sau một tick
        this.$nextTick(() => {
          this.isUpdatingFromModelValue = false
          
          // Force wrap ảnh sau khi content được set
          // ⚠️ CRITICAL: Clean menu text trước khi wrap
          setTimeout(() => {
            if (this.editor && this.editor.view && this.editor.view.dom) {
              const paragraphs = this.editor.view.dom.querySelectorAll('p')
              paragraphs.forEach(p => {
                if (p.textContent.trim() === '⋮') p.remove()
              })
            }
          }, 50)
          
          setTimeout(() => {
            this.forceWrapImages()
          }, 100)
        })
      }
    },
    width(newWidth) {
      if (this.$el) {
        this.$el.style.width = newWidth
      }
    },
    height(newHeight) {
      if (this.$el) {
        this.$el.style.height = newHeight
      }
    },
    isRoot(newVal) {
      // Cập nhật lại editor attributes khi isRoot thay đổi
      if (this.editor) {
        const editorEl = this.editor.view.dom
        if (editorEl) {
          if (newVal) {
            editorEl.classList.add('is-root')
            editorEl.style.color = '#ffffff'
          } else {
            editorEl.classList.remove('is-root')
            editorEl.style.color = ''
          }
        }
      }
    },
  },
  mounted() {
    this.editor = new Editor({
      extensions: [
        FilterMenuTextExtension, // ⚠️ CRITICAL: Phải là extension đầu tiên
        PreventTaskLinkDeletionExtension, // Ngăn xóa task link sections
        PreventCursorInTaskLinkAndImageExtension, // Ngăn con trỏ di chuyển vào task link và ảnh
        BlockquoteWithDataTypeExtension, // Thêm data-type="node-description" cho blockquote
        ParagraphWithDataTypeExtension, // Thêm data-type="node-title" cho paragraph đầu tiên
        Document,
        Paragraph,
        Text,
        TextStyle, // Cần cho backgroundColor extension
        Bold,
        Italic,
        Underline,
        BackgroundColor, // Extension để highlight text
        createUploadImageOnPasteExtension(this.uploadImage || null), // Extension để upload ảnh khi paste
        ApplyCurrentStyleOnPaste, // Extension để áp dụng style hiện tại khi paste
        ImageExtension.configure({ disableDropImage: true }), // Extension để chèn hình ảnh (disable dropImagePlugin để tránh duplicate)
        ImageClickExtension, // Extension để xử lý click vào ảnh
        ImageWithMenuExtension, // Extension để render image với menu button
        PreventCursorInImageAreaExtension, // Extension để ngăn chặn cursor xuất hiện trong vùng ảnh
        StarterKit.configure({
          // Disable các extension không cần thiết từ StarterKit
          bold: false, // Dùng extension riêng
          italic: false, // Dùng extension riêng
          code: false, // Dùng extension riêng
          history: false, // Không cần undo/redo trong mindmap node
          heading: false,
          blockquote: true, // Bật blockquote để dùng cho description
          codeBlock: false,
          horizontalRule: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
        }),
        Code,
        Link.configure({
          openOnClick: true,
          autolink: true,
          HTMLAttributes: {
            rel: "noopener noreferrer",
            target: "_parent",
          },
        }),
        Typography,
        TitlePlaceholderExtension, // Luôn hiển thị placeholder cho node-title
        Placeholder.configure({
          placeholder: ({ node }) => {
            // Không hiển thị placeholder cho node-title (đã được xử lý bởi TitlePlaceholderExtension)
            if (node.type.name === 'paragraph') {
              const dataType = node.attrs['data-type']
              if (dataType === 'node-title') {
                return '' // TitlePlaceholderExtension sẽ xử lý
              }
            }
            // Placeholder mặc định cho các node khác
            return ''
          },
          showOnlyCurrent: true, // Chỉ hiển thị cho node hiện tại (trừ node-title)
        }),
      ],
      editorProps: {
        attributes: {
          class: `mindmap-editor-prose ${this.isRoot ? 'is-root' : ''}`,
          style: this.isRoot ? 'color: #ffffff;' : '',
        },
        handleDOMEvents: {
          mousedown: (view, event) => {
            const target = event.target
            
            // Ngăn chặn mousedown trên ảnh và các wrapper
            const isImageRelated = target.tagName === 'IMG' ||
                                   target.closest('.image-wrapper-node') ||
                                   target.closest('.image-wrapper') ||
                                   target.closest('.image-group-wrapper') ||
                                   target.classList?.contains('ProseMirror-gapcursor')
            
            if (isImageRelated) {
              event.preventDefault()
              return true
            }
            
            return false
          },
        },
        handleTextInput: (view, from, to, text) => {
          // Xử lý đặc biệt cho space ở cuối text
          // Để preserve trailing spaces, insert space trực tiếp vào document
          if (text === ' ') {
            const { state, dispatch } = view
            const { $from } = state.selection

            // Insert space trực tiếp
            const tr = state.tr.insertText(' ', from, to)
            dispatch(tr)

            // Return true để prevent default behavior và đảm bảo space được preserve
            return true
          }

          // Cho phép ProseMirror xử lý các ký tự khác bình thường
          return false
        },
        handleKeyDown: (view, event) => {
          // ⚠️ FIX: Xử lý Tab để blur editor và tránh text bị select all lại
          if (event.key === 'Tab') {
            event.preventDefault()
            event.stopPropagation()

            // Đánh dấu vừa blur bằng Tab (để MindMap.vue biết không tạo node ngay)
            // và trigger clear các timeout focus đang chờ
            if (typeof window !== 'undefined') {
              window.__justBlurredFromEditorByTab = true
              window.__shouldClearFocusTimeouts = true
              
              // Clear flag tạo node nhanh để có thể tạo node tiếp
              setTimeout(() => {
                window.__justBlurredFromEditorByTab = false
              }, 10)
              
              // Clear flag focus timeout chậm hơn để đảm bảo select all timeout (100ms) đã bị skip
              setTimeout(() => {
                window.__shouldClearFocusTimeouts = false
              }, 150)
            }

            // Blur editor để thoát khỏi chế độ edit
            this.editor.commands.blur()
            
            // Focus vào foreignObject parent để có thể nhận Tab event tiếp
            setTimeout(() => {
              const editorElement = this.editor?.view?.dom
              if (editorElement) {
                // Tìm foreignObject parent
                const foreignObject = editorElement.closest('foreignObject')
                if (foreignObject) {
                  foreignObject.focus()
                }
              }
            }, 50)
            
            return true
          }

          // ⚠️ NEW: Xử lý Enter (không có Shift) để blur editor và thoát khỏi chế độ edit
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            event.stopPropagation()

            // Blur editor để thoát khỏi chế độ edit
            this.editor.commands.blur()
            return true
          }

          // Xử lý Shift + Enter để chuyển focus giữa title và description
          if (event.key === 'Enter' && event.shiftKey) {
            event.preventDefault()
            event.stopPropagation()

            const { state } = view
            const { doc, selection } = state
            const { $from } = selection
            let isInBlockquote = false

            // Tìm node blockquote trong parent chain
            for (let depth = $from.depth; depth > 0; depth--) {
              const node = $from.node(depth)
              if (node.type.name === 'blockquote') {
                isInBlockquote = true
                break
              }
            }

            if (isInBlockquote) {
              // Đang ở trong blockquote: focus lên title (paragraph đầu tiên)
              // Đơn giản: di chuyển lên đầu document
              this.editor.chain()
                .focus('start')
                .run()
            } else {
              // Đang ở paragraph (title): kiểm tra xem đã có blockquote chưa
              let hasBlockquote = false

              // Tìm blockquote đầu tiên
              doc.forEach((node) => {
                if (node.type.name === 'blockquote' && !hasBlockquote) {
                  hasBlockquote = true
                }
              })

              if (hasBlockquote) {
                // Đã có blockquote: focus vào blockquote (di chuyển xuống cuối và tìm blockquote)
                // Tìm vị trí blockquote đầu tiên
                let blockquoteOffset = null
                doc.forEach((node, offset) => {
                  if (node.type.name === 'blockquote' && blockquoteOffset === null) {
                    blockquoteOffset = offset
                  }
                })

                if (blockquoteOffset !== null) {
                  // Focus vào đầu blockquote
                  try {
                    const resolvedPos = state.doc.resolve(blockquoteOffset + 1)
                    this.editor.chain()
                      .setTextSelection(resolvedPos.pos)
                      .focus()
                      .run()
                  } catch (e) {
                    // Fallback: focus vào cuối
                    this.editor.chain()
                      .focus('end')
                      .run()
                  }
                }
              } else {
                // Chưa có blockquote: tạo blockquote mới
                // Tìm vị trí chèn: sau tất cả paragraphs và images
                let insertPosition = null

                // Tìm node cuối cùng không phải blockquote (paragraph hoặc image)
                doc.forEach((node, offset) => {
                  if (node.type.name !== 'blockquote') {
                    // Tính vị trí sau node này (offset + nodeSize)
                    const nodeEnd = offset + node.nodeSize
                    if (insertPosition === null || nodeEnd > insertPosition) {
                      insertPosition = nodeEnd
                    }
                  }
                })

                // Nếu không tìm thấy, dùng cuối document
                if (insertPosition === null) {
                  insertPosition = doc.content.size
                }

                

                // Chèn blockquote tại vị trí đã tính
                this.editor.chain()
                  .setTextSelection(insertPosition)
                  .focus()
                  .insertContent('<blockquote><p></p></blockquote>')
                  .run()

                // Focus vào paragraph trong blockquote vừa tạo
                this.$nextTick(() => {
                  const { state } = this.editor.view
                  const { doc: newDoc } = state

                  // Tìm blockquote vừa tạo
                  let newBlockquoteOffset = null
                  newDoc.forEach((node, offset) => {
                    if (node.type.name === 'blockquote' && newBlockquoteOffset === null) {
                      newBlockquoteOffset = offset
                    }
                  })

                  if (newBlockquoteOffset !== null) {
                    const paragraphStartPos = newBlockquoteOffset + 1 + 1
                    this.editor.chain()
                      .setTextSelection(paragraphStartPos)
                      .focus()
                      .run()
                  } else {
                    this.editor.commands.focus('end')
                  }
                })
              }
            }

            // Emit event để parent component xử lý (nếu cần)
            this.$emit('create-description')
            return true
          }

          // Ngăn chặn các phím tắt của trình duyệt khi editor đang focus
          // Chỉ xử lý trong editor, không ảnh hưởng đến trình duyệt
          if (event.ctrlKey || event.metaKey) {
            const key = event.key.toLowerCase()

            // Xử lý Ctrl+V để paste ảnh từ clipboard
            if (key === 'v') {
              // Kiểm tra xem có imageClipboard không
              if (window.imageClipboard && window.imageClipboard.type === 'image') {
                event.preventDefault()
                event.stopPropagation()
                
                const { state, dispatch } = view
                const { selection } = state
                const { schema } = state
                const imageData = window.imageClipboard.data
                
                // Tính toán kích thước hiển thị (giữ tỷ lệ, max width theo số ảnh)
                const maxWidth = 368 // Chiều rộng vùng nội dung
                let displayWidth = imageData.width || maxWidth
                let displayHeight = imageData.height || null
                
                // Nếu có width và height, tính toán lại để fit maxWidth
                if (imageData.width && imageData.height) {
                  if (imageData.width > maxWidth) {
                    const ratio = maxWidth / imageData.width
                    displayWidth = maxWidth
                    displayHeight = Math.round(imageData.height * ratio)
                  } else {
                    displayWidth = imageData.width
                    displayHeight = imageData.height
                  }
                } else if (imageData.width) {
                  if (imageData.width > maxWidth) {
                    displayWidth = maxWidth
                    displayHeight = null // Sẽ tự tính từ aspect ratio
                  }
                } else {
                  displayWidth = maxWidth
                  displayHeight = null
                }
                
                // Tạo image node từ clipboard data
                const imageNode = schema.nodes.image.create({
                  src: imageData.src,
                  alt: imageData.alt || '',
                  title: imageData.title || '',
                  width: displayWidth,
                  height: displayHeight,
                })
                
                // ⚠️ FIX: Tìm vị trí chèn ảnh phù hợp - không chèn vào giữa text của title
                const { from, $from } = selection
                let insertPos = from
                
                // Kiểm tra xem cursor có đang ở trong title paragraph không (không phải blockquote)
                let isInTitle = false
                
                // Kiểm tra depth để xem có đang trong blockquote không
                for (let i = $from.depth; i > 0; i--) {
                  const nodeAtDepth = $from.node(i)
                  if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                    // Đang trong blockquote (description) - có thể chèn tại vị trí cursor
                    break
                  }
                  
                  // Nếu đang ở paragraph và không phải blockquote, đó là title
                  if (nodeAtDepth && nodeAtDepth.type.name === 'paragraph' && i === $from.depth) {
                    isInTitle = true
                    break
                  }
                }
                
                // Nếu đang ở trong title paragraph, tìm vị trí sau tất cả title paragraphs và ảnh
                if (isInTitle) {
                  const { doc } = state
                  let lastTitleEndPos = null
                  let lastImageEndPos = null
                  
                  // Tìm tất cả title paragraphs (paragraphs không phải blockquote)
                  doc.descendants((node, pos) => {
                    // Kiểm tra xem node có phải là paragraph không
                    if (node.type.name === 'paragraph') {
                      // Kiểm tra xem paragraph này có nằm trong blockquote không
                      const resolvedPos = doc.resolve(pos)
                      let inBlockquote = false
                      
                      for (let i = resolvedPos.depth; i > 0; i--) {
                        const nodeAtDepth = resolvedPos.node(i)
                        if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                          inBlockquote = true
                          break
                        }
                      }
                      
                      // Nếu không phải blockquote, đó là title paragraph
                      if (!inBlockquote) {
                        const paragraphEnd = pos + node.nodeSize
                        if (lastTitleEndPos === null || paragraphEnd > lastTitleEndPos) {
                          lastTitleEndPos = paragraphEnd
                        }
                      }
                    }
                    
                    // Tìm ảnh sau title paragraphs (không phải blockquote)
                    if (node.type.name === 'image') {
                      const resolvedPos = doc.resolve(pos)
                      let inBlockquote = false
                      
                      for (let i = resolvedPos.depth; i > 0; i--) {
                        const nodeAtDepth = resolvedPos.node(i)
                        if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                          inBlockquote = true
                          break
                        }
                      }
                      
                      // Nếu không phải blockquote, đó là ảnh sau title
                      if (!inBlockquote) {
                        const imageEnd = pos + node.nodeSize
                        if (lastImageEndPos === null || imageEnd > lastImageEndPos) {
                          lastImageEndPos = imageEnd
                        }
                      }
                    }
                  })
                  
                  // Chèn ảnh sau title paragraph cuối cùng và sau tất cả ảnh đã có
                  if (lastImageEndPos !== null) {
                    // Có ảnh đã tồn tại, chèn sau ảnh cuối cùng
                    insertPos = lastImageEndPos
                  } else if (lastTitleEndPos !== null) {
                    // Không có ảnh, chèn sau title paragraph cuối cùng
                    insertPos = lastTitleEndPos
                  }
                } else {
                  // Không phải title paragraph hoặc đang trong blockquote - chèn tại vị trí cursor
                  insertPos = from
                }
                
                const transaction = state.tr.insert(insertPos, imageNode)
                dispatch(transaction)
                
                // ⚠️ FIX: Xóa clipboard sau khi paste (cho cả copy và cut) để tránh paste lại
                window.imageClipboard = null
                
                return true
              }
            }

            // Các phím tắt editor (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+X, Ctrl+E, Ctrl+Z, Ctrl+Y, Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+A)
            // TipTap sẽ tự động preventDefault cho các phím tắt của nó
            // Chúng ta chỉ cần stopPropagation để không trigger event handler ở MindMap.vue
            if (['b', 'i', 'u', 'z', 'y', 'x', 'c', 'v', 'a'].includes(key)) {
              // Stop propagation để không trigger event handler ở MindMap.vue
              event.stopPropagation()
              // Cho phép TipTap xử lý các phím tắt này
              // TipTap extensions sẽ tự động preventDefault nếu cần
              return false
            }

            // Xử lý Ctrl+Shift+X cho strikethrough
            if (key === 'x' && event.shiftKey) {
              event.stopPropagation()
              return false
            }

            // Xử lý Ctrl+E cho code
            if (key === 'e') {
              event.stopPropagation()
              return false
            }
          }

          // Cho phép TipTap xử lý các phím khác
          return false
        },
      },
      content: (() => {
        // ⚠️ CRITICAL: Clean HTML trước khi set vào editor lần đầu
        const initialContent = this.modelValue || ""
        if (!initialContent) {
          // ⚠️ NEW: Luôn có một paragraph trống ở đầu để nhập title với data-type
          return '<p data-type="node-title"></p>'
        }
        
        // Kiểm tra xem có phải HTML không
        const isHtml = /<[a-z][\s\S]*>/i.test(initialContent)
        if (isHtml) {
          // Clean HTML: xóa <p>⋮</p>, menu buttons, và ký tự '⋮'
          let cleaned = initialContent
          cleaned = cleaned.replace(/<p[^>]*>\s*⋮\s*<\/p>/gi, '')
          cleaned = cleaned.replace(/<button[^>]*class="image-menu-button"[^>]*>.*?<\/button>/gi, '')
          cleaned = cleaned.replace(/⋮/g, '')
          
          // ⚠️ NEW: Đảm bảo luôn có một paragraph trống ở đầu với data-type
          // Kiểm tra xem có bắt đầu bằng paragraph không
          if (!cleaned.trim().startsWith('<p')) {
            cleaned = '<p data-type="node-title"></p>' + cleaned
          } else {
            // Thêm data-type cho paragraph đầu tiên nếu chưa có
            cleaned = cleaned.replace(/<p([^>]*)>/, (match, attrs) => {
              if (!attrs || !attrs.includes('data-type')) {
                return `<p data-type="node-title"${attrs ? ' ' + attrs : ''}>`
              }
              return match
            })
          }
          
          return cleaned
        }
        // Plain text: wrap trong paragraph với data-type
        return `<p data-type="node-title">${initialContent}</p>`
      })(),
      onCreate: () => {
        // ⚠️ CRITICAL: Cleanup ngay khi editor được tạo
        this.$nextTick(() => {
          this.cleanupRemoveMenuText()
          
          // ⚠️ NEW: Đảm bảo luôn có một paragraph trống ở đầu để nhập title
          if (this.editor) {
            const { state } = this.editor.view
            const { doc } = state
            
            // Kiểm tra xem node đầu tiên có phải là paragraph không
            const firstNode = doc.firstChild
            if (!firstNode || firstNode.type.name !== 'paragraph') {
              // Không có paragraph ở đầu, thêm một paragraph trống ở đầu với data-type
              this.isUpdatingFromModelValue = true
              this.editor.chain()
                .insertContentAt(0, '<p data-type="node-title"></p>', { updateSelection: false })
                .run()
              this.$nextTick(() => {
                this.isUpdatingFromModelValue = false
                // Đảm bảo data-type được set sau khi insert
                this.setDataTypesForElements()
              })
            }
            
            // ⚠️ NEW: Đảm bảo data-type được set cho các phần tử
            this.$nextTick(() => {
              setTimeout(() => {
                this.setDataTypesForElements()
              }, 150)
            })
            
            // ⚠️ FIX: Gọi updateImageLayout sau khi editor được tạo để đảm bảo layout đúng khi reload
            this.$nextTick(() => {
              setTimeout(() => {
                if (this.editor && this.editor.view) {
                  updateImageLayout(this.editor.view)
                }
              }, 200) // Đợi DOM render xong
            })
          }
        })
      },
      onUpdate: () => {
        // Skip nếu component đang unmount
        if (this._isUnmounting) return
        
        // Skip nếu đang update từ modelValue để tránh vòng lặp
        if (this.isUpdatingFromModelValue) return
        
        // ⚠️ CRITICAL FIX: Skip nếu đang tính toán height để tránh vòng lặp
        if (this.isCalculatingHeight) return
        
        // ⚠️ CRITICAL: Clean up menu text NGAY LẬP TỨC (đặc biệt khi ảnh được tạo)
        this.cleanupRemoveMenuText()
        
        // ⚠️ NEW: Thêm data-type cho các phần tử (chỉ khi cần thiết)
        this.$nextTick(() => {
          this.setDataTypesForElements()
          // ⚠️ CRITICAL FIX: Cleanup lại sau khi setDataTypesForElements để xóa paragraph chứa '⋮' được tạo ra khi ảnh được tạo
          this.cleanupRemoveMenuText()
        })
        
        // ⚠️ NEW: Đảm bảo luôn có một paragraph trống ở đầu để nhập title
        if (this.editor) {
          const { state } = this.editor.view
          const { doc } = state
          
          // Kiểm tra xem node đầu tiên có phải là paragraph không
          const firstNode = doc.firstChild
          if (!firstNode || firstNode.type.name !== 'paragraph') {
            // Không có paragraph ở đầu, thêm một paragraph trống với data-type
            this.isUpdatingFromModelValue = true
            this.editor.chain()
              .insertContentAt(0, '<p data-type="node-title"></p>', { updateSelection: false })
              .run()
            this.$nextTick(() => {
              this.isUpdatingFromModelValue = false
              // Đảm bảo data-type được set sau khi insert
              this.setDataTypesForElements()
            })
          }
        }

        // Không override style khi đang edit - để d3MindmapRenderer kiểm soát width và white-space
        // Chỉ set style mặc định khi không edit (khi white-space chưa được set)
        this.$nextTick(() => {
          if (this.editor && this.editor.view && this.editor.view.dom) {
            const editorDOM = this.editor.view.dom
            const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
            if (editorContent) {
              // Chỉ set style mặc định nếu chưa được set bởi d3MindmapRenderer
              // Nếu white-space đã được set (nowrap hoặc pre-wrap), không override
              if (!editorContent.style.whiteSpace) {
                editorContent.style.width = '100%'
                editorContent.style.maxWidth = '100%'
                editorContent.style.whiteSpace = 'pre-wrap'
              }
              // Luôn đảm bảo box-sizing
              editorContent.style.boxSizing = 'border-box'
            }
          }
          
          // ⚠️ NEW: Đảm bảo data-type được set sau khi DOM render xong
          this.setDataTypesForElements()
          
        // Force wrap ảnh mới nếu có
        this.forceWrapImages()
        
        // ⚠️ CRITICAL: Đo lại height sau khi ảnh load xong (để đảm bảo chính xác)
        // updateNodeHeight() sẽ tự động đợi ảnh load xong trước khi đo
        // Đợi một chút để DOM đã render xong (ảnh đã được chèn vào DOM)
        this.$nextTick(() => {
          this.updateNodeHeight()
          // ⚠️ NEW: Set data-type lại sau khi update height
          this.setDataTypesForElements()
        })
      })

        // Xóa các paragraph trống ở cuối document
        const { state } = this.editor
        const { doc } = state

        // Chỉ xóa paragraph trống nếu có nhiều hơn 1 node
        if (doc.childCount > 1) {
          const lastNode = doc.lastChild

          // Xóa paragraph trống ở cuối (không phải blockquote)
          if (lastNode && lastNode.type.name === 'paragraph' && lastNode.textContent.trim() === '') {
            // Đặt flag để tránh vòng lặp
            this.isUpdatingFromModelValue = true

            const lastPos = doc.content.size - lastNode.nodeSize
            this.editor.chain()
              .deleteRange({ from: lastPos, to: doc.content.size })
              .run()

            // Reset flag sau khi xóa
            this.$nextTick(() => {
              this.isUpdatingFromModelValue = false
            })

            // Return sớm vì sẽ có onUpdate mới được trigger
            return
          }
        }

        // Lấy HTML content để giữ formatting (bold, italic)
        const html = this.editor.getHTML()
        
        // Clean HTML trước khi emit
        const cleanedHtml = this.cleanHTMLForSave(html)
        
        // Lấy plain text để lưu vào modelValue (nếu cần)
        const text = this.getEditorTextWithTrailingSpaces()

        // Emit cả HTML và text - có thể dùng HTML để hiển thị, text để lưu
        this.$emit("update:modelValue", cleanedHtml) // Lưu HTML đã clean
        this.$emit("input", cleanedHtml)
        // Gọi callback nếu có
        if (this.onInput) {
          this.onInput(cleanedHtml)
        }
      },
      onFocus: () => {
        this.$emit("focus")
        // Gọi callback nếu có
        if (this.onFocus) {
          this.onFocus()
        }
      },
      onBlur: (event) => {
        // ⚠️ CRITICAL: Kiểm tra ngay event target để prevent blur khi click vào menu
        const relatedTarget = event?.relatedTarget || event?.target || null
        
        // Kiểm tra xem blur có phải do click vào image menu button hoặc context menu không
        const isImageMenuClick = relatedTarget && (
          relatedTarget.classList?.contains('image-menu-button') ||
          relatedTarget.closest?.('.image-menu-button') ||
          relatedTarget.classList?.contains('image-menu-item') ||
          relatedTarget.closest?.('.image-context-menu') ||
          relatedTarget.closest?.('.image-menu-item')
        )
        
        if (isImageMenuClick) {
          // Blur do click vào image menu: focus lại editor ngay lập tức
          if (this.editor && !this.editor.isDestroyed) {
            this.$nextTick(() => {
              this.editor.chain().focus().run()
            })
          }
          // Không emit blur event để tránh đóng editor
          return
        }
        
        // ⚠️ NEW: Kiểm tra xem blur có phải do click vào toolbar không
        // Sử dụng setTimeout để kiểm tra activeElement sau khi blur xảy ra
        setTimeout(() => {
          const activeElement = document.activeElement
          const isToolbarClick = activeElement && (
            activeElement.closest('.mindmap-toolbar') ||
            activeElement.closest('.toolbar-btn') ||
            activeElement.closest('.toolbar-top-popup') ||
            activeElement.closest('.toolbar-bottom')
          )
          
          // Kiểm tra lại image menu (fallback)
          const isImageMenuClickFallback = activeElement && (
            activeElement.classList.contains('image-menu-button') ||
            activeElement.closest('.image-menu-button') ||
            activeElement.classList.contains('image-menu-item') ||
            activeElement.closest('.image-context-menu') ||
            activeElement.closest('.image-menu-item')
          )

          if (isToolbarClick || isImageMenuClickFallback) {
            // Blur do click vào toolbar hoặc image menu: focus lại editor ngay lập tức để tiếp tục chỉnh sửa
            if (this.editor && !this.editor.isDestroyed) {
              this.editor.chain().focus().run()
            }
            // Không emit blur event để tránh đóng editor
            return
          }

          // ⚠️ CRITICAL: Ẩn tất cả menu buttons khi editor blur (không phải do click vào menu)
          const editorDOM = this.editor?.view?.dom
          if (editorDOM) {
            const menuButtons = editorDOM.querySelectorAll('.image-menu-button')
            menuButtons.forEach(btn => {
              btn.style.opacity = '0'
            })
            const imageWrappers = editorDOM.querySelectorAll('.image-wrapper, .image-wrapper-node')
            imageWrappers.forEach(wrapper => {
              wrapper.classList.remove('image-wrapper-hover')
            })
          }

         
          this.$emit("blur")
          // Gọi callback nếu có
          if (this.onBlur) {
            

            this.onBlur()
          }
        }, 10)
      },
    })

    // Set initial styles
    if (this.$el) {
      this.$el.style.width = this.width
      this.$el.style.height = this.height
      this.$el.style.minHeight = this.minHeight
    }

    // Function để đảm bảo style luôn đúng
    // Không override style khi đang edit - để d3MindmapRenderer kiểm soát width và white-space
    const ensureCorrectStyles = () => {
      if (this.editor && this.editor.view && this.editor.view.dom) {
        const editorDOM = this.editor.view.dom
        const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM

        if (editorContent) {
          // Chỉ set style mặc định nếu chưa được set bởi d3MindmapRenderer
          // Nếu white-space đã được set (nowrap hoặc pre-wrap), không override
          if (!editorContent.style.whiteSpace) {
            editorContent.style.width = '100%'
            editorContent.style.maxWidth = '100%'
            editorContent.style.whiteSpace = 'pre-wrap'
          }
          // Luôn đảm bảo box-sizing
          editorContent.style.boxSizing = 'border-box'
        }
      }
    }

    // Thêm event listener để ngăn chặn các phím tắt của trình duyệt khi editor đang focus
    // Đảm bảo các phím tắt chỉ hoạt động trong editor, không ảnh hưởng đến trình duyệt
    this.$nextTick(() => {
      ensureCorrectStyles()

      if (this.editor && this.editor.view && this.editor.view.dom) {
        const editorDOM = this.editor.view.dom

        // MutationObserver để theo dõi thay đổi style và override lại
        const observer = new MutationObserver(() => {
          ensureCorrectStyles()
        })

        observer.observe(editorDOM, {
          attributes: true,
          attributeFilter: ['style'],
          subtree: true
        })

        // Lưu observer để có thể disconnect khi unmount
        this._styleObserver = observer

        // ⚠️ CRITICAL: Lắng nghe event khi ảnh load xong trong NodeView
        // Khi ảnh load xong, trigger updateNodeHeight() để cập nhật height đúng
        const handleImageLoaded = () => {
          
          // ⚠️ FIX: Giảm delay, sử dụng requestAnimationFrame thay vì setTimeout
          // để đồng bộ với browser rendering cycle
          this.$nextTick(() => {
            if (this.editor && this.editor.view && this.editor.view.dom) {
              // Dùng requestAnimationFrame để đợi browser render xong
              requestAnimationFrame(() => {
                this.updateNodeHeight()
              })
            } else {
              
              // Retry sau một chút (giảm delay)
              setTimeout(() => {
                if (this.editor && this.editor.view && this.editor.view.dom) {
                  requestAnimationFrame(() => {
                    this.updateNodeHeight()
                  })
                }
              }, 50) // Giảm từ 100ms xuống 50ms
            }
          })
        }
        window.addEventListener('image-loaded-in-editor', handleImageLoaded)
        // Lưu handler để có thể remove khi unmount
        this._imageLoadedHandler = handleImageLoaded
        
        // ⚠️ FIX: Lắng nghe event khi ảnh bị xóa để trigger tính toán lại kích thước node
        const handleImageDeleted = () => {
          this.$nextTick(() => {
            if (this.editor && this.editor.view && this.editor.view.dom) {
              // Dùng requestAnimationFrame để đợi browser render xong sau khi xóa ảnh
              requestAnimationFrame(() => {
                this.updateNodeHeight()
              })
            }
          })
        }
        window.addEventListener('image-deleted-in-editor', handleImageDeleted)
        // Lưu handler để có thể remove khi unmount
        this._imageDeletedHandler = handleImageDeleted

        // Event listener để ngăn chặn các phím tắt lan truyền lên MindMap.vue
        // Chỉ stop propagation để không trigger event handler ở MindMap.vue
        // TipTap extensions sẽ tự động preventDefault khi xử lý keyboard shortcuts
        const handleEditorKeyDown = (event) => {
          if (event.ctrlKey || event.metaKey) {
            const key = event.key.toLowerCase()

            // Tất cả các phím tắt editor (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Z, Ctrl+Y, Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+A)
            // Chỉ stop propagation để không trigger event handler ở MindMap.vue
            // TipTap extensions sẽ tự động preventDefault khi xử lý các phím tắt này
            if (['b', 'i', 'u', 'z', 'y', 'x', 'c', 'v', 'a'].includes(key)) {
              // Stop propagation để không trigger event handler ở MindMap.vue
              event.stopPropagation()
              // TipTap extensions (Bold, Italic) sẽ tự động preventDefault khi xử lý Ctrl+B, Ctrl+I
              // Điều này đảm bảo các phím tắt chỉ hoạt động trong editor, không ảnh hưởng đến trình duyệt
            }
          }
        }

        // Sử dụng bubble phase để TipTap xử lý trước
        editorDOM.addEventListener('keydown', handleEditorKeyDown, false)

        // Lưu handler để có thể remove khi unmount
        this._editorKeyDownHandler = handleEditorKeyDown

        // ⚠️ CRITICAL: Cleanup ngay khi editor được mount
        this.cleanupRemoveMenuText()
        
        // Force wrap ảnh ngay khi mount để đảm bảo button menu được thêm vào DOM
        // Đợi một chút để đảm bảo DOM đã được render
        setTimeout(() => {
          this.cleanupRemoveMenuText() // Cleanup trước khi wrap
          this.forceWrapImages()
          // Cleanup lại sau khi wrap để đảm bảo
          setTimeout(() => {
            this.cleanupRemoveMenuText()
          }, 100)
        }, 300)
      }
    })
  },
  beforeUnmount() {
    // Set flag để ngăn các update tiếp theo
    this._isUnmounting = true
    
    // Disconnect MutationObserver nếu có
    if (this._styleObserver) {
      this._styleObserver.disconnect()
      this._styleObserver = null
    }

    // Remove event listener nếu có
    if (this.editor && this.editor.view && this.editor.view.dom && this._editorKeyDownHandler) {
      this.editor.view.dom.removeEventListener('keydown', this._editorKeyDownHandler, true)
      this._editorKeyDownHandler = null
    }

    // Remove image loaded event listener nếu có
    if (this._imageLoadedHandler) {
      window.removeEventListener('image-loaded-in-editor', this._imageLoadedHandler)
      if (this._imageDeletedHandler) {
        window.removeEventListener('image-deleted-in-editor', this._imageDeletedHandler)
      }
      this._imageLoadedHandler = null
    }

    if (this.editor) {
      try {
        this.editor.destroy()
      } catch (e) {
        
      }
      this.editor = null
    }
  },
}
</script>

<style scoped>
.mindmap-node-editor {
  width: 100%;
  height: 100%;
  /* 100% để fit vào container */
  min-height: 43px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  user-select: text;
  /* Cho phép bôi đen text */
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  overflow: visible;
  /* Visible để hiển thị đủ nội dung */
  background: transparent !important; /* Đảm bảo background trong suốt */
}

/* ⚠️ FIX: Đảm bảo node-content-wrapper và node-editor-container có background trắng */
:deep(.node-content-wrapper),
:deep(.node-editor-container) {
  background: #ffffff !important; /* Tất cả đều có nền trắng */
}

/* ⚠️ FIX: Root node wrapper vẫn có nền xanh - sử dụng class is-root */
:deep(.node-content-wrapper:has(.mindmap-node-editor.is-root)),
:deep(.node-content-wrapper:has(.mindmap-editor-content.is-root)),
:deep(.node-editor-container:has(.mindmap-node-editor.is-root)),
:deep(.node-editor-container:has(.mindmap-editor-content.is-root)) {
  background: #3b82f6 !important; /* Root node có nền xanh */
}

/* ⚠️ CRITICAL: Root node không bị giới hạn height */
.mindmap-node-editor.is-root {
  height: auto !important;
  min-height: 43px !important;
  max-height: none !important;
}

.mindmap-editor-content {
  width: 100%;
  height: auto;
  /* auto để container tự mở rộng khi có ảnh và mô tả */
  min-height: 43px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

/* ⚠️ CRITICAL: Root node content không bị giới hạn height */
.mindmap-editor-content.is-root {
  height: auto !important;
  min-height: 43px !important;
  max-height: none !important;
}

:deep(.mindmap-editor-content > div) {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}

:deep(.mindmap-editor-prose) {
  width: 100%;
  max-width: none;
  /* Cho phép node giãn ra khi có ảnh hoặc nội dung dài */
  min-width: 400px;
  /* Chiều rộng tối thiểu là 400px */
  height: auto;
  min-height: 43px;
  padding: 8px 16px;
  box-sizing: border-box;
  font-size: 19px;
  line-height: 1.4;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  overflow: visible;
  /* ⚠️ CRITICAL: visible để hiển thị đủ nội dung khi edit */
  box-sizing: border-box;
  word-break: break-word;
  overflow-wrap: break-word;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  min-width: 0;
  margin: 0;
  /* ⚠️ NEW: Xóa margin thừa */
  padding-bottom: 8px;
  /* ⚠️ FIX: Padding đều 8px (không thừa) */
}

/* ⚠️ NEW: Ngăn chặn text cursor và text selection cho task link và ảnh */
:deep(.mindmap-editor-prose p[data-type="node-task-link"]),
:deep(.mindmap-editor-prose .node-task-link-section),
:deep(.mindmap-editor-prose [data-node-section="task-link"]),
:deep(.mindmap-editor-prose .node-task-link-section *),
:deep(.mindmap-editor-prose [data-node-section="task-link"] *),
:deep(.mindmap-editor-prose img),
:deep(.mindmap-editor-prose .image-wrapper-node),
:deep(.mindmap-editor-prose .image-wrapper-node *) {
  cursor: pointer !important;
  user-select: none !important;
  -webkit-user-select: none !important;
  -moz-user-select: none !important;
  -ms-user-select: none !important;
  pointer-events: auto !important;
}

/* ⚠️ FIX: Đảm bảo background luôn trong suốt khi focus */
:deep(.mindmap-editor-prose:focus),
:deep(.mindmap-editor-prose:focus-within),
:deep(.mindmap-editor-prose.ProseMirror-focused) {
  background: transparent !important;
}

:deep(.mindmap-editor-prose > *) {
  max-width: 100%;
  box-sizing: border-box;
  width: 100%;
}

:deep(.mindmap-editor-prose.is-root) {
  color: #ffffff;
  caret-color: #ffffff;
  /* Cursor nháy màu trắng */
  /* ⚠️ CRITICAL: Đảm bảo root node hiển thị đầy đủ nội dung */
  /* ⚠️ NOTE: white-space được kiểm soát bởi d3MindmapRenderer dựa trên width */
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  overflow: visible !important;
  max-height: none !important;
  -webkit-line-clamp: unset !important;
  line-clamp: unset !important;
  display: block !important;
}

:deep(.mindmap-editor-prose.is-root p) {
  color: #ffffff;
  /* ⚠️ CRITICAL: Đảm bảo paragraph hiển thị đầy đủ */
  /* ⚠️ NOTE: white-space được kiểm soát bởi d3MindmapRenderer dựa trên width */
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  -webkit-line-clamp: unset !important;
  line-clamp: unset !important;
  display: block !important;
}

:deep(.mindmap-editor-prose.is-root *::selection) {
  background: rgba(255, 255, 255, 0.3);
  color: #ffffff;
}

:deep(.mindmap-editor-prose.is-root::selection) {
  background: rgba(255, 255, 255, 0.3);
}

:deep(.mindmap-editor-prose.is-root::-moz-selection) {
  background: rgba(255, 255, 255, 0.3);
}

:deep(.mindmap-editor-prose p) {
  margin: 0;
  /* ⚠️ CRITICAL: Xóa margin thừa */
  padding: 0;
  /* ⚠️ CRITICAL: Xóa padding thừa */
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.4;
  /* ⚠️ NEW: Match với editor line-height */
}

:deep(.mindmap-editor-prose p.is-editor-empty::before),
:deep(.mindmap-editor-prose p.is-empty[data-type="node-title"]::before) {
  color: #9ca3af;
  content: "Nhập...";
  float: left;
  height: 0;
  pointer-events: none;
}

/* Bold và Italic formatting */
:deep(.mindmap-editor-prose strong),
:deep(.mindmap-editor-prose b) {
  font-weight: bold;
}

:deep(.mindmap-editor-prose em),
:deep(.mindmap-editor-prose i) {
  font-style: italic;
}

/* Root node styling cho bold/italic */
:deep(.mindmap-editor-prose.is-root strong),
:deep(.mindmap-editor-prose.is-root b) {
  font-weight: bold;
  color: #ffffff;
}

:deep(.mindmap-editor-prose.is-root em),
:deep(.mindmap-editor-prose.is-root i) {
  font-style: italic;
  color: #ffffff;
}

:deep(.mindmap-editor-prose u) {
  text-decoration: underline;
}

:deep(.mindmap-editor-prose s),
:deep(.mindmap-editor-prose del) {
  text-decoration: line-through;
}

:deep(.mindmap-editor-prose code) {
  background: #f3f4f6;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

:deep(.mindmap-editor-prose a) {
  color: #3b82f6;
  text-decoration: underline;
  cursor: pointer;
}

:deep(.mindmap-editor-prose.is-root u) {
  text-decoration: underline;
  color: #ffffff;
}

:deep(.mindmap-editor-prose.is-root s),
:deep(.mindmap-editor-prose.is-root del) {
  text-decoration: line-through;
  color: #ffffff;
}

:deep(.mindmap-editor-prose.is-root code) {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

:deep(.mindmap-editor-prose.is-root a) {
  color: #ffffff;
  text-decoration: underline;
}

/* Blockquote styling cho description - mặc định (khi editor đóng) */
:deep(.mindmap-editor-prose blockquote) {
  margin: 4px 0;
  margin-right: 0 !important;
  margin-left: 0;
  padding-left: 6px;
  padding-right: 0 !important;
  border-left: 3px solid #adc6ee;
  color: #a19c9c;
  font-size: 12px;
  line-height: 1.6;
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  min-width: 0;
  
  /* ⚠️ CRITICAL: Ellipsis khi editor đóng (không focus) - hiển thị 1 dòng duy nhất */
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  white-space: normal;
  max-height: calc(1.6em * 1); /* Giới hạn chiều cao = 1 dòng */
}

:deep(.mindmap-editor-prose blockquote p) {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  min-width: 0;
  
  /* ⚠️ CRITICAL: Ellipsis khi editor đóng (không focus) - hiển thị 1 dòng duy nhất */
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  white-space: normal;
  max-height: calc(1.6em * 1); /* Giới hạn chiều cao = 1 dòng */
}

:deep(.mindmap-editor-prose blockquote p:first-child) {
  margin-top: 0;
}

:deep(.mindmap-editor-prose blockquote p:last-child) {
  margin-bottom: 0;
}

:deep(.mindmap-editor-prose) {
  width: 100%;
  max-width: none;
  /* Cho phép node giãn ra khi có ảnh hoặc nội dung dài */
  min-width: 400px;
  /* Chiều rộng tối thiểu là 400px */
  height: auto;
  min-height: 43px;
  padding: 8px 16px;
  box-sizing: border-box;
  font-size: 19px;
  line-height: 1.4;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  overflow: visible;
  /* ⚠️ CRITICAL: visible để hiển thị đủ nội dung khi edit */
  box-sizing: border-box;
  word-break: break-word;
  overflow-wrap: break-word;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  min-width: 0;
  margin: 0;
  /* ⚠️ NEW: Xóa margin thừa */
  padding-bottom: 8px;
  /* ⚠️ FIX: Padding đều 8px (không thừa) */
}

:deep(.mindmap-editor-prose p) {
  margin: 0;
  /* ⚠️ CRITICAL: Xóa margin thừa */
  padding: 0;
  /* ⚠️ CRITICAL: Xóa padding thừa */
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.4;
  /* ⚠️ NEW: Match với editor line-height */
}

/* ⚠️ CRITICAL: Blockquote khi editor đóng (không focus) - hiển thị 1 dòng duy nhất */
:deep(.mindmap-editor-prose:not(:focus-within):not(.ProseMirror-focused) blockquote),
:deep(.mindmap-editor-prose:not([contenteditable="true"]) blockquote) {
  margin: 4px 0 0 0;
  margin-right: 0 !important;
  margin-left: 0;
  padding-left: 6px;
  padding-right: 0 !important;
  padding-top: 0;
  padding-bottom: 0;
  border-left: 3px solid #adc6ee;
  color: #a19c9c;
  font-size: 12px;
  line-height: 1.6;
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  min-width: 0;

  /* ⚠️ CRITICAL: Ellipsis khi editor đóng - hiển thị 1 dòng duy nhất */
  display: -webkit-box !important;
  -webkit-line-clamp: 1 !important;
  line-clamp: 1 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  word-break: break-word !important;
  white-space: normal !important;
  max-height: calc(1.6em * 1) !important; /* Giới hạn chiều cao = 1 dòng */
}

/* ⚠️ CRITICAL FIX: Blockquote description khi editor đóng (không focus) - hiển thị 1 dòng duy nhất */
:deep(.mindmap-editor-prose:not(:focus-within):not(.ProseMirror-focused) blockquote[data-type="node-description"]),
:deep(.mindmap-editor-prose:not([contenteditable="true"]) blockquote[data-type="node-description"]) {
  /* Ellipsis khi editor đóng - đảm bảo hiển thị dấu 3 chấm */
  display: -webkit-box !important;
  -webkit-line-clamp: 1 !important;
  line-clamp: 1 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  word-break: break-word !important;
  white-space: normal !important;
  max-height: calc(1.6em * 1) !important; /* Giới hạn chiều cao = 1 dòng */
}

/* Khi đang edit: hiển thị tất cả dòng */
:deep(.mindmap-editor-prose:focus-within blockquote),
:deep(.mindmap-editor-prose.ProseMirror-focused blockquote),
:deep(.mindmap-editor-prose[contenteditable="true"] blockquote) {
  display: block !important;
  -webkit-line-clamp: unset !important;
  line-clamp: unset !important;
  -webkit-box-orient: unset !important;
  overflow: visible !important;
  text-overflow: clip !important;
  white-space: normal !important;
  margin-bottom: 0;
  /* ⚠️ NEW: Không có margin-bottom khi edit */
  max-height: none !important;
}

/* ⚠️ CRITICAL FIX: Khi đang edit blockquote description, hiển thị tất cả dòng */
:deep(.mindmap-editor-prose:focus-within blockquote[data-type="node-description"]),
:deep(.mindmap-editor-prose.ProseMirror-focused blockquote[data-type="node-description"]),
:deep(.mindmap-editor-prose[contenteditable="true"] blockquote[data-type="node-description"]) {
  display: block !important;
  -webkit-line-clamp: unset !important;
  line-clamp: unset !important;
  -webkit-box-orient: unset !important;
  overflow: visible !important;
  text-overflow: clip !important;
  white-space: normal !important;
  max-height: none !important;
}

:deep(.mindmap-editor-prose:focus-within blockquote[data-type="node-description"] p),
:deep(.mindmap-editor-prose.ProseMirror-focused blockquote[data-type="node-description"] p),
:deep(.mindmap-editor-prose[contenteditable="true"] blockquote[data-type="node-description"] p) {
  display: block !important;
  -webkit-line-clamp: unset !important;
  line-clamp: unset !important;
  -webkit-box-orient: unset !important;
  overflow: visible !important;
  text-overflow: clip !important;
  white-space: normal !important;
  max-height: none !important;
}

/* ⚠️ REMOVED: Khi có ảnh trong node, mô tả vẫn chỉ hiển thị 1 dòng như bình thường */
/* Rule này đã được xóa để mô tả luôn chỉ hiển thị 1 dòng, ngay cả khi có ảnh */

:deep(.mindmap-editor-prose blockquote p) {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  min-width: 0;
  line-height: 1.6;
  /* ⚠️ NEW: Match với blockquote line-height */
}

/* ⚠️ CRITICAL FIX: Paragraph trong blockquote description khi editor đóng (không focus) - hiển thị 1 dòng duy nhất */
:deep(.mindmap-editor-prose:not(:focus-within):not(.ProseMirror-focused) blockquote[data-type="node-description"] p),
:deep(.mindmap-editor-prose:not([contenteditable="true"]) blockquote[data-type="node-description"] p),
:deep(.mindmap-editor-prose:not(:focus-within):not(.ProseMirror-focused) blockquote p),
:deep(.mindmap-editor-prose:not([contenteditable="true"]) blockquote p) {
  display: -webkit-box !important;
  -webkit-line-clamp: 1 !important;
  line-clamp: 1 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  word-break: break-word !important;
  white-space: normal !important;
  max-height: calc(1.6em * 1) !important; /* Giới hạn chiều cao = 1 dòng */
}

/* Container cho images - đảm bảo chiều rộng 400px */
/* Note: max-width đã được set ở trên, chỉ cần đảm bảo box-sizing */

/* Style cho image trong editor - hiển thị ngang */
:deep(.mindmap-editor-prose .image-group-wrapper) {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 4px;
  margin: 12px 0;
  width: 100%;
  max-width: 368px;
  box-sizing: border-box;
}

/* 1 ảnh trong wrapper: 100% */
:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper:only-child) {
  width: 100% !important;
  max-width: 368px !important;
  flex: 0 0 100% !important;
}

:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper:only-child img) {
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  max-height: 200px !important; /* Thống nhất chiều cao tối đa */
  display: block !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  object-fit: cover; /* Dùng cover để không crop ảnh */
}

/* 2 ảnh trong wrapper: mỗi ảnh 50% */
/* Với gap 4px, flexbox tự động xử lý khoảng cách */
:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper:first-child:nth-last-child(2)),
:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper:first-child:nth-last-child(2) ~ .image-wrapper) {
  width: calc((100% - 4px) / 2) !important;
  /* (100% - 4px gap) / 2 ảnh */
  max-width: calc((100% - 4px) / 2) !important;
  flex: 0 0 calc((100% - 4px) / 2) !important;
}

:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper:first-child:nth-last-child(2) img),
:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper:first-child:nth-last-child(2) ~ .image-wrapper img) {
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  max-height: 200px !important; /* Thống nhất chiều cao tối đa */
  display: block !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  object-fit: cover; /* Dùng cover để không crop ảnh */
}

/* 3+ ảnh trong wrapper: mỗi ảnh 33.33% */
/* Với gap 4px, flexbox tự động xử lý khoảng cách */
:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper:first-child:nth-last-child(n+3)),
:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper:first-child:nth-last-child(n+3) ~ .image-wrapper) {
  width: calc((100% - 8px) / 3) !important;
  /* (100% - 8px gap) / 3 ảnh để đảm bảo vừa 1 hàng */
  max-width: calc((100% - 8px) / 3) !important;
  flex: 0 0 calc((100% - 8px) / 3) !important;
}

:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper:first-child:nth-last-child(n+3) img),
:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper:first-child:nth-last-child(n+3) ~ .image-wrapper img) {
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  max-height: 200px !important; /* Thống nhất chiều cao tối đa */
  display: block !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  object-fit: cover; /* Dùng cover để không crop ảnh */
}

/* Fallback: Style cho ảnh direct children (khi chưa có wrapper) */
/* Node có width 400px với padding 16px mỗi bên = vùng nội dung 368px */

/* 1 ảnh duy nhất: 100% chiều rộng */
:deep(.mindmap-editor-prose > img:only-of-type) {
  display: block !important;
  width: 100% !important;
  max-width: 368px !important;
  height: auto !important;
  margin: 12px 0 !important;
  box-sizing: border-box !important;
  object-fit: cover; /* ⚠️ FIX: Dùng cover để không crop ảnh */
}

/* 2 ảnh: mỗi ảnh 50% (với margin 4px giữa các ảnh) */
:deep(.mindmap-editor-prose > img:first-of-type:nth-last-of-type(2)),
:deep(.mindmap-editor-prose > img:first-of-type:nth-last-of-type(2) ~ img) {
  display: inline-block !important;
  vertical-align: top !important;
  width: calc((100% - 4px) / 2) !important;
  /* (100% - 4px margin) / 2 ảnh */
  max-width: calc((100% - 4px) / 2) !important;
  height: auto !important;
  margin: 0 4px 4px 0 !important;
  box-sizing: border-box !important;
  object-fit: cover; /* ⚠️ FIX: Dùng cover để không crop ảnh */
}

/* Ảnh thứ 2 (cuối hàng) trong trường hợp 2 ảnh */
:deep(.mindmap-editor-prose > img:first-of-type:nth-last-of-type(2) ~ img:last-of-type) {
  margin-right: 0 !important;
}

/* 3+ ảnh: mỗi ảnh 33.33% (với margin 4px), tối đa 3 ảnh/hàng */
:deep(.mindmap-editor-prose > img:first-of-type:nth-last-of-type(n+3)),
:deep(.mindmap-editor-prose > img:first-of-type:nth-last-of-type(n+3) ~ img) {
  display: inline-block !important;
  vertical-align: top !important;
  width: calc((100% - 14px) / 3) !important;
  /* (100% - 8px margin - 3px buffer) / 3 ảnh để đảm bảo vừa 1 hàng */
  max-width: calc((100% - 14px) / 3) !important;
  height: auto !important;
  margin: 0 4px 4px 0 !important;
  box-sizing: border-box !important;
  object-fit: cover; /* ⚠️ FIX: Dùng cover để không crop ảnh */
}

/* Ảnh thứ 3, 6, 9... (cuối hàng) không có margin-right */
:deep(.mindmap-editor-prose > img:nth-of-type(3n)) {
  margin-right: 0 !important;
}


/* Image không nên inline trong paragraph */
/* ⚠️ FIX: Chỉ áp dụng cho img không có wrapper */
:deep(.mindmap-editor-prose p > img:not(.image-wrapper-node img)) {
  display: block;
  margin: 12px 0;
  width: 400px;
  min-width: 400px;
  flex-shrink: 0;
  flex-grow: 0;
}

/* ⚠️ NEW: Style cho .image-wrapper-node để đảm bảo width đúng */
:deep(.mindmap-editor-prose .image-wrapper-node) {
  box-sizing: border-box !important;
  display: inline-block !important;
  vertical-align: top !important;
}

/* ⚠️ NEW: 1 ảnh = 100% width */
:deep(.mindmap-editor-prose .image-wrapper-node:only-child),
:deep(.mindmap-editor-prose .image-wrapper-node:only-of-type) {
  width: 100% !important;
  max-width: 100% !important;
}

/* ⚠️ NEW: Ảnh bên trong wrapper luôn 100% width của wrapper */
:deep(.mindmap-editor-prose .image-wrapper-node img) {
  width: 100% !important;
  max-width: 100% !important;
  display: block !important;
  box-sizing: border-box !important;
}

/* ⚠️ NEW: Từ 2 ảnh trở lên, wrapper phải có hình vuông (aspect-ratio: 1) */
:deep(.mindmap-editor-prose .image-wrapper-node:nth-of-type(n+2)) {
  aspect-ratio: 1 !important;
}

/* ⚠️ NEW: Ảnh trong wrapper hình vuông phải fill toàn bộ wrapper */
:deep(.mindmap-editor-prose .image-wrapper-node:nth-of-type(n+2) img) {
  height: 100% !important;
  object-fit: contain !important;
}

/* Đảm bảo image node được render đúng */
:deep(.mindmap-editor-prose figure) {
  margin: 12px 0;
}

:deep(.mindmap-editor-prose figure img) {
  display: block;
  margin: 0;
}

/* Error handling cho broken images */
:deep(.mindmap-editor-prose img[src=""]) {
  display: none;
}

:deep(.mindmap-editor-prose img:not([src])) {
  display: none;
}

/* Thêm error handler cho images */
:deep(.mindmap-editor-prose img) {
  image-rendering: auto;
  border-radius: 5px !important;
  border: 2px solid transparent !important;
  /* ⚠️ OPTIMIZE: Chỉ transition border-color, bỏ box-shadow để giảm lag */
  transition: border-color 0.15s ease !important;
  cursor: zoom-in !important;
  box-sizing: border-box !important;
  position: relative;
  outline: none !important;
  max-height: 200px !important; /* Thống nhất chiều cao tối đa cho tất cả ảnh */
  /* ⚠️ OPTIMIZE: Hint browser để tối ưu rendering */
  will-change: border-color;
}

/* Bỏ border khi click/focus */
:deep(.mindmap-editor-prose img:focus),
:deep(.mindmap-editor-prose img:active) {
  border-color: transparent !important;
  outline: none !important;
}

/* Hover effect - border xanh dương + zoom icon */
:deep(.mindmap-editor-prose img:hover) {
  border-color: #76a6f5 !important;
}

/* Zoom icon overlay khi hover */
:deep(.mindmap-editor-prose img:hover::after) {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'%3E%3C/circle%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'%3E%3C/line%3E%3Cline x1='11' y1='8' x2='11' y2='14'%3E%3C/line%3E%3Cline x1='8' y1='11' x2='14' y2='11'%3E%3C/line%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 24px 24px;
  pointer-events: none;
  opacity: 0;
  /* ⚠️ OPTIMIZE: Dùng transform và opacity thay vì các properties gây reflow */
  transition: opacity 0.15s ease;
  will-change: opacity;
}

:deep(.mindmap-editor-prose img:hover::after) {
  opacity: 1;
}

/* Debug: hiển thị border khi image load error */
:deep(.mindmap-editor-prose img[onerror]) {
  /* Bỏ border màu đỏ */
  border: none;
}

/* Loading skeleton cho ảnh đang upload */
:deep(.mindmap-editor-prose img.image-loading),
:deep(.mindmap-editor-prose img[data-loading="true"]) {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading-shimmer 1.5s infinite;
  border-radius: 4px;
  position: relative;
}

@keyframes loading-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Style cho image context menu */
:deep(.image-context-menu) {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

:deep(.image-menu-item) {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  transition: all 0.15s ease;
  user-select: none;
}

:deep(.image-menu-item:hover) {
  background-color: #f9fafb;
  transform: translateX(2px);
}

:deep(.image-menu-item:active) {
  transform: translateX(2px) scale(0.98);
}

:deep(.image-menu-item svg) {
  width: 16px;
  height: 16px;
  stroke-width: 2;
  opacity: 0.9;
  color: #6b7280;
  flex-shrink: 0;
}

:deep(.image-menu-item:hover svg) {
  color: #111827;
}

/* Style cho delete item */
:deep(.image-menu-item:has(svg path[d*="M19 6v14"])) {
  color: #dc2626;
}

:deep(.image-menu-item:has(svg path[d*="M19 6v14"]):hover) {
  background-color: #fef2f2;
  color: #b91c1c;
}

:deep(.image-menu-item:has(svg path[d*="M19 6v14"]) svg) {
  color: #ef4444;
}

:deep(.image-menu-item:has(svg path[d*="M19 6v14"]):hover svg) {
  color: #b91c1c;
}

/* Image wrapper - CRITICAL */
:deep(.mindmap-editor-prose .image-group-wrapper) {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  gap: 4px !important;
  margin: 12px 0 !important;
  width: 100% !important;
  max-width: 368px !important;
  box-sizing: border-box !important;
  position: relative !important;
}

/* Ngăn chặn selection và cursor trên ảnh */
:deep(.mindmap-editor-prose .image-wrapper-node),
:deep(.mindmap-editor-prose .image-wrapper) {
  user-select: none !important;
  -webkit-user-select: none !important;
  -moz-user-select: none !important;
  -ms-user-select: none !important;
  pointer-events: auto !important;
}

/* Đảm bảo img không thể nhận focus hoặc selection */
:deep(.mindmap-editor-prose .image-wrapper-node img),
:deep(.mindmap-editor-prose .image-wrapper img) {
  user-select: none !important;
  -webkit-user-select: none !important;
  pointer-events: auto !important;
}

/* Ẩn ProseMirror gapcursor trong vùng ảnh */
:deep(.image-wrapper-node .ProseMirror-gapcursor),
:deep(.image-wrapper .ProseMirror-gapcursor) {
  display: none !important;
}

:deep(.mindmap-editor-prose .image-wrapper) {
  position: relative !important;
  display: flex !important;
  box-sizing: border-box !important;
  overflow: visible !important;
  flex-shrink: 0 !important;
  align-items: flex-start !important;
}

:deep(.mindmap-editor-prose .image-wrapper img) {
  width: 100% !important;
  height: auto !important;
  max-height: 200px !important; /* Thống nhất chiều cao tối đa */
  display: block !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  object-fit: cover; /* Dùng cover để không crop ảnh */
}

/* Menu button - ULTRA CRITICAL với specificity cao */
:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper .image-menu-button) {
  position: absolute !important;
  top: 4px !important;
  right: 4px !important;
  width: 32px !important;
  height: 32px !important;
  border-radius: 6px !important;
  background: rgba(0, 0, 0, 0.7) !important;
  color: white !important;
  border: 2px solid rgba(255, 255, 255, 0.3) !important;
  cursor: pointer !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 20px !important;
  font-weight: bold !important;
  line-height: 1 !important;
  opacity: 0 !important;
  /* ⚠️ OPTIMIZE: Chỉ transition opacity để giảm lag */
  transition: opacity 0.15s ease !important;
  z-index: 1000 !important;
  backdrop-filter: blur(4px) !important;
  /* ⚠️ OPTIMIZE: Hint browser để tối ưu rendering */
  will-change: opacity;
  padding: 0 !important;
  margin: 0 !important;
  pointer-events: auto !important;
  /* ⚠️ OPTIMIZE: Bỏ box-shadow để giảm lag, dùng backdrop-filter thay thế */
  /* box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important; */
}

:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper .image-menu-button svg) {
  width: 16px !important;
  height: 16px !important;
  color: white !important;
  fill: white !important;
}

/* Show button khi hover - cho cả image-group-wrapper và direct children */
:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper:hover .image-menu-button),
:deep(.mindmap-editor-prose .image-wrapper:hover .image-menu-button) {
  opacity: 1 !important;
}

/* Button hover */
:deep(.mindmap-editor-prose .image-group-wrapper .image-wrapper .image-menu-button:hover),
:deep(.mindmap-editor-prose .image-wrapper .image-menu-button:hover) {
  background: rgba(0, 0, 0, 0.9) !important;
  border-color: rgba(255, 255, 255, 0.5) !important;
  transform: scale(1.05) !important;
  opacity: 1 !important;
}

/* Đảm bảo button có thể nhận click */
:deep(.mindmap-editor-prose .image-wrapper .image-menu-button) {
  position: absolute !important;
  top: 8px !important;
  right: 8px !important;
  width: 28px !important;
  height: 28px !important;
  border-radius: 4px !important;
}

:deep(.mindmap-editor-prose .image-wrapper .image-menu-button svg) {
  width: 16px !important;
  height: 16px !important;
  color: white !important;
  fill: white !important;
}

:deep(.mindmap-editor-prose .image-wrapper .image-menu-button) {
  background: rgba(0, 0, 0, 0.6) !important;
  color: white !important;
  border: none !important;
  cursor: pointer !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 18px !important;
  line-height: 1 !important;
  opacity: 0 !important;
  transition: opacity 0.2s ease, background 0.2s ease !important;
  z-index: 100 !important;
  backdrop-filter: blur(4px) !important;
  pointer-events: auto !important;
}
</style>
