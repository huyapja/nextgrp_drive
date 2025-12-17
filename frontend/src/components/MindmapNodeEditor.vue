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
import { Plugin } from "@tiptap/pm/state"
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
            
            return cleanHtml
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
  
  let newWidth = '100%'
  let newGap = '0px'
  let newHeight = 'auto'
  
  if (count === 2) {
    newWidth = 'calc(50% - 12px)'
    newGap = '12px'
    newHeight = '150px'
  } else if (count >= 3) {
    newWidth = 'calc(33.333% - 8px)'
    newGap = '12px'
    newHeight = '100px'
  }
  
  allImages.forEach((wrapper, index) => {
    wrapper.style.width = newWidth
    // Ảnh cuối mỗi hàng (index 2, 5, 8, ...) không có margin-right
    wrapper.style.marginRight = ((index + 1) % 3 === 0 || count === 1) ? '0' : newGap
    
    // Cập nhật height cho img bên trong
    const img = wrapper.querySelector('img')
    if (img) {
      img.style.setProperty('height', newHeight, 'important')
    }
  })
  
  // ⚠️ CRITICAL FIX: Force reflow để đảm bảo width mới được áp dụng NGAY
  // Điều này đảm bảo ảnh có đúng kích thước trước khi đo height
  allImages.forEach((wrapper) => {
    void wrapper.offsetWidth
    void wrapper.offsetHeight
    const img = wrapper.querySelector('img')
    if (img) {
      void img.offsetWidth
      void img.offsetHeight
    }
  })
}

const ImageWithMenuExtension = Extension.create({
  name: 'imageWithMenu',
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: (editorView) => {
          // Track view để có thể update layout sau
          return {
            update: (view, prevState) => {
              // ⚠️ CRITICAL FIX: Update layout TRƯỚC, sau đó đợi reflow bằng requestAnimationFrame
              // Điều này đảm bảo ảnh có đúng width trước khi tính height
              updateImageLayout(view)
              
              // Force reflow ngay lập tức
              const allImages = view.dom.querySelectorAll('.image-wrapper-node')
              allImages.forEach((wrapper) => {
                void wrapper.offsetWidth
                void wrapper.offsetHeight
              })
            }
          }
        },
        props: {
          nodeViews: {
            image: (node, view, getPos) => {
              const dom = document.createElement('div')
              dom.className = 'image-wrapper-node'
              dom.setAttribute('data-image-src', node.attrs.src)
              
              // ⚠️ CRITICAL: Tính width dựa trên số ảnh trong editor
              // Đếm số ảnh hiện có để xác định layout
              const allImages = view.dom.querySelectorAll('.image-wrapper-node')
              const totalImages = allImages.length + 1 // +1 cho ảnh hiện tại
              
              // Tính width: 1 ảnh = 100%, 2 ảnh = 50%, 3+ ảnh = 33.33%
              let imageWidth = '100%'
              let gap = '0px'
              
              if (totalImages === 2) {
                imageWidth = 'calc(50% - 6px)' // 50% - half of 12px gap
                gap = '12px'
              } else if (totalImages >= 3) {
                imageWidth = 'calc(33.333% - 8px)' // 33.33% - 2/3 of 12px gap
                gap = '12px'
              }
              
              // Tính height: 1 ảnh = auto, 2 ảnh = 150px, 3+ ảnh = 100px
              let imageHeight = 'auto'
              if (totalImages === 2) {
                imageHeight = '150px'
              } else if (totalImages >= 3) {
                imageHeight = '100px'
              }
              
              dom.style.cssText = `
                position: relative;
                display: inline-block;
                width: ${imageWidth};
                margin: 12px ${gap} 12px 0;
                box-sizing: border-box;
                vertical-align: top;
              `
              
              // Layout sẽ được update tự động bởi Plugin.view.update()
              
              // Tạo img element
              const img = document.createElement('img')
              img.src = node.attrs.src
              if (node.attrs.alt) img.alt = node.attrs.alt
              if (node.attrs.title) img.title = node.attrs.title
              if (node.attrs.width) img.width = node.attrs.width
              if (node.attrs.height) img.height = node.attrs.height
              
              img.style.cssText = `
                display: block;
                width: 100%;
                height: ${imageHeight} !important;
                object-fit: cover;
                border-radius: 5px;
                cursor: zoom-in;
              `
              
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
                menuButton.style.opacity = '1'
                menuButton.style.background = 'rgba(0, 0, 0, 0.8)'
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
              
              return {
                dom,
                contentDOM: null,
                update: (updatedNode) => {
                  if (updatedNode.type.name !== 'image') return false
                  
                  // Update img attributes
                  img.src = updatedNode.attrs.src
                  if (updatedNode.attrs.alt) img.alt = updatedNode.attrs.alt
                  if (updatedNode.attrs.title) img.title = updatedNode.attrs.title
                  if (updatedNode.attrs.width) img.width = updatedNode.attrs.width
                  if (updatedNode.attrs.height) img.height = updatedNode.attrs.height
                  
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
          
          // Thêm event listeners
          imageWrapper.addEventListener('mouseenter', () => {
            menuButton.style.opacity = '1'
            imageWrapper.classList.add('image-wrapper-hover')
          })
          imageWrapper.addEventListener('mouseleave', (e) => {
            const relatedTarget = e.relatedTarget
            if (!relatedTarget || 
                (!relatedTarget.classList.contains('image-menu-button') && 
                 !relatedTarget.closest('.image-menu-button'))) {
              menuButton.style.opacity = '0'
              imageWrapper.classList.remove('image-wrapper-hover')
            }
          })
          menuButton.addEventListener('mouseenter', () => {
            menuButton.style.opacity = '1'
            imageWrapper.classList.add('image-wrapper-hover')
          })
          menuButton.addEventListener('mouseleave', (e) => {
            const relatedTarget = e.relatedTarget
            if (!relatedTarget || 
                (!relatedTarget.classList.contains('image-wrapper') && 
                 !relatedTarget.closest('.image-wrapper'))) {
              menuButton.style.opacity = '0'
              imageWrapper.classList.remove('image-wrapper-hover')
            }
          })
          
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
        Placeholder.configure({
          placeholder: this.placeholder,
        }),
      ],
      editorProps: {
        attributes: {
          class: `mindmap-editor-prose ${this.isRoot ? 'is-root' : ''}`,
          style: this.isRoot ? 'color: #ffffff;' : '',
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
          // ⚠️ NEW: Luôn có một paragraph trống ở đầu để nhập title
          return "<p></p>"
        }
        
        // Kiểm tra xem có phải HTML không
        const isHtml = /<[a-z][\s\S]*>/i.test(initialContent)
        if (isHtml) {
          // Clean HTML: xóa <p>⋮</p>, menu buttons, và ký tự '⋮'
          let cleaned = initialContent
          cleaned = cleaned.replace(/<p[^>]*>\s*⋮\s*<\/p>/gi, '')
          cleaned = cleaned.replace(/<button[^>]*class="image-menu-button"[^>]*>.*?<\/button>/gi, '')
          cleaned = cleaned.replace(/⋮/g, '')
          
          // ⚠️ NEW: Đảm bảo luôn có một paragraph trống ở đầu
          // Kiểm tra xem có bắt đầu bằng paragraph không
          if (!cleaned.trim().startsWith('<p')) {
            cleaned = '<p></p>' + cleaned
          }
          
          return cleaned
        }
        // Plain text: wrap trong paragraph
        return `<p>${initialContent}</p>`
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
              // Không có paragraph ở đầu, thêm một paragraph trống ở đầu
              this.isUpdatingFromModelValue = true
              this.editor.chain()
                .insertContentAt(0, '<p></p>', { updateSelection: false })
                .run()
              this.$nextTick(() => {
                this.isUpdatingFromModelValue = false
              })
            }
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
        
        // ⚠️ CRITICAL: Clean up menu text NGAY LẬP TỨC
        this.cleanupRemoveMenuText()
        
        // ⚠️ NEW: Đảm bảo luôn có một paragraph trống ở đầu để nhập title
        if (this.editor) {
          const { state } = this.editor.view
          const { doc } = state
          
          // Kiểm tra xem node đầu tiên có phải là paragraph không
          const firstNode = doc.firstChild
          if (!firstNode || firstNode.type.name !== 'paragraph') {
            // Không có paragraph ở đầu, thêm một paragraph trống
            this.isUpdatingFromModelValue = true
            this.editor.chain()
              .insertContentAt(0, '<p></p>', { updateSelection: false })
              .run()
            this.$nextTick(() => {
              this.isUpdatingFromModelValue = false
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
          
        // Force wrap ảnh mới nếu có
        this.forceWrapImages()
        
        // ⚠️ CRITICAL: Đo lại height sau khi ảnh load xong (để đảm bảo chính xác)
        // updateNodeHeight() sẽ tự động đợi ảnh load xong trước khi đo
        // Đợi một chút để DOM đã render xong (ảnh đã được chèn vào DOM)
        this.$nextTick(() => {
          this.updateNodeHeight()
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

          // Blur bình thường (không phải từ toolbar hoặc image menu): emit blur event
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

:deep(.mindmap-editor-prose p.is-editor-empty:first-child::before) {
  color: #9ca3af;
  content: attr(data-placeholder);
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

/* Blockquote styling cho description */
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
  overflow: hidden;
  word-wrap: break-word;
  overflow-wrap: break-word;
  display: block;
  min-width: 0;
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

:deep(.mindmap-editor-prose blockquote) {
  margin: 4px 0 0 0;
  /* ⚠️ FIX: Chỉ margin-top, không có margin-bottom */
  margin-right: 0 !important;
  margin-left: 0;
  padding-left: 6px;
  padding-right: 0 !important;
  padding-top: 0;
  /* ⚠️ NEW: Xóa padding-top thừa */
  padding-bottom: 0;
  /* ⚠️ NEW: Xóa padding-bottom thừa */
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

  /* Ellipsis khi không edit */
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  white-space: normal;
}

/* Khi đang edit: hiển thị tất cả dòng */
:deep(.mindmap-editor-prose:focus-within blockquote),
:deep(.mindmap-editor-prose.ProseMirror-focused blockquote) {
  display: block;
  -webkit-line-clamp: unset;
  -webkit-box-orient: unset;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  margin-bottom: 0;
  /* ⚠️ NEW: Không có margin-bottom khi edit */
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
  display: block !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  object-fit: cover;
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
  display: block !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  object-fit: cover;
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
  display: block !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  object-fit: cover;
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
  object-fit: cover;
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
  object-fit: cover;
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
  object-fit: cover;
}

/* Ảnh thứ 3, 6, 9... (cuối hàng) không có margin-right */
:deep(.mindmap-editor-prose > img:nth-of-type(3n)) {
  margin-right: 0 !important;
}


/* Image không nên inline trong paragraph */
:deep(.mindmap-editor-prose p img) {
  display: block;
  margin: 12px 0;
  width: 400px;
  min-width: 400px;
  flex-shrink: 0;
  flex-grow: 0;
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
  transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
  cursor: zoom-in !important;
  box-sizing: border-box !important;
  position: relative;
  outline: none !important;
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
  transition: opacity 0.2s ease;
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
  display: block !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  object-fit: cover;
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
  transition: all 0.2s ease !important;
  z-index: 1000 !important;
  backdrop-filter: blur(4px) !important;
  padding: 0 !important;
  margin: 0 !important;
  pointer-events: auto !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
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
