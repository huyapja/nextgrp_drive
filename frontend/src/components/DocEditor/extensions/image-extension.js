// Plugin adapted from the following examples:
// - https://github.com/ueberdosis/tiptap/blob/main/packages/extension-image/src/image.ts
// - https://gist.github.com/slava-vishnyakov/16076dff1a77ddaca93c4bccd4ec4521

import fileToBase64 from "@/utils/file-to-base64"
import { mergeAttributes, Node, nodeInputRule } from "@tiptap/core"
import { Plugin } from "prosemirror-state"

export const inputRegex =
  /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/

export default Node.create({
  name: "image",
  addOptions() {
    return {
      inline: false,
      HTMLAttributes: {},
      disableDropImage: false, // Option để disable dropImagePlugin (dùng cho mindmap)
    }
  },
  inline() {
    return this.options.inline
  },
  group() {
    return this.options.inline ? "inline" : "block"
  },
  draggable: true,
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: element => element.getAttribute('src'),
        renderHTML: attributes => {
          if (!attributes.src) {
            return {}
          }
          return {
            src: attributes.src,
          }
        },
      },
      alt: {
        default: null,
        parseHTML: element => element.getAttribute('alt'),
        renderHTML: attributes => {
          if (!attributes.alt) {
            return {}
          }
          return {
            alt: attributes.alt,
          }
        },
      },
      title: {
        default: null,
        parseHTML: element => element.getAttribute('title'),
        renderHTML: attributes => {
          if (!attributes.title) {
            return {}
          }
          return {
            title: attributes.title,
          }
        },
      },
      width: {
        default: null,
        parseHTML: element => element.getAttribute('width'),
        renderHTML: attributes => {
          if (!attributes.width) {
            return {}
          }
          return {
            width: attributes.width,
          }
        },
      },
      height: {
        default: null,
        parseHTML: element => element.getAttribute('height'),
        renderHTML: attributes => {
          if (!attributes.height) {
            return {}
          }
          return {
            height: attributes.height,
          }
        },
      },
      loading: {
        default: null,
        parseHTML: element => element.getAttribute('data-loading'),
        renderHTML: attributes => {
          if (!attributes.loading) {
            return {}
          }
          return {
            'data-loading': attributes.loading,
            class: 'image-loading',
          }
        },
      },
    }
  },
  parseHTML() {
    return [
      {
        tag: "img[src]",
      },
      {
        tag: ".image-wrapper img",
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    // Wrap ảnh trong div với button menu và tooltip menu
    const imgAttrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
      onerror: "this.style.display='none'; console.error('Image failed to load:', this.src);",
    })
    
    // Tạo menu HTML string
    const menuHTML = `
      <div class="image-context-menu" style="position: absolute; top: 40px; right: 0px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); padding: 4px; z-index: 10000; min-width: 150px; display: none;">
        <div class="image-menu-item" data-action="copy" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-radius: 4px; font-size: 14px; transition: background 0.2s;">
          <span>📋</span>
          <span>Sao chép</span>
        </div>
        <div class="image-menu-item" data-action="cut" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-radius: 4px; font-size: 14px; transition: background 0.2s;">
          <span>✂️</span>
          <span>Cắt</span>
        </div>
        <div class="image-menu-item" data-action="delete" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-radius: 4px; font-size: 14px; transition: background 0.2s;">
          <span>🗑️</span>
          <span>Xóa</span>
        </div>
      </div>
    `
    
    return [
      "div",
      {
        class: "image-wrapper",
        "data-image-src": HTMLAttributes.src || "",
        style: "position: relative; display: inline-block;",
      },
      [
        "img",
        imgAttrs,
      ],
      [
        "button",
        {
          class: "image-menu-button",
          "aria-label": "Image options",
          type: "button",
          style: "position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 4px; background: rgba(0, 0, 0, 0.6); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; line-height: 1; opacity: 0; transition: opacity 0.2s ease, background 0.2s ease; z-index: 100; backdrop-filter: blur(4px); pointer-events: auto;",
        },
        "⋮",
      ],
    ]
  },

  addCommands() {
    return {
      setImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          })
        },
    }
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: inputRegex,
        type: this.type,
        getAttributes: (match) => {
          const [, , alt, src, title] = match

          return { src, alt, title }
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    return [
      ...(this.options.disableDropImage ? [] : [dropImagePlugin()]),
      // Plugin để attach event listeners cho button menu
      new Plugin({
        view(editorView) {
          // Function để xử lý menu actions
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
              }
            } else if (action === 'delete') {
              // Xóa ảnh
              const transaction = state.tr.delete(imgPos, imgPos + imgNode.nodeSize)
              dispatch(transaction)
            }
          }
          
          const attachMenuButtonListeners = () => {
            const { dom } = editorView
            
            // editorView.dom chính là element có class mindmap-editor-prose
            // (được set trong editorProps.attributes.class)
            let proseElement = null
            
            // Kiểm tra xem dom chính có class mindmap-editor-prose không
            if (dom && dom.classList && dom.classList.contains('mindmap-editor-prose')) {
              proseElement = dom
            } else if (dom && dom.querySelector) {
              // Nếu không, thử tìm trong dom
              proseElement = dom.querySelector('.mindmap-editor-prose')
            }
            
            if (!proseElement) {
              // Fallback: tìm trong document (có thể có nhiều editor)
              // Tìm editor gần nhất với dom này
              const allProseElements = document.querySelectorAll('.mindmap-editor-prose')
              if (allProseElements.length > 0) {
                // Tìm element gần nhất với dom
                for (const elem of allProseElements) {
                  if (elem.contains(dom) || dom.contains(elem) || elem === dom) {
                    proseElement = elem
                    break
                  }
                }
                // Nếu không tìm thấy, dùng element đầu tiên
                if (!proseElement && allProseElements.length > 0) {
                  proseElement = allProseElements[0]
                }
              }
            }
            
            if (!proseElement) {
              
              return
            }

            // Tìm tất cả button menu chưa có listeners
            const menuButtons = Array.from(proseElement.querySelectorAll('.image-menu-button'))
            
            
            menuButtons.forEach((menuButton, index) => {
              // Bỏ qua nếu đã có listeners
              if (menuButton.hasAttribute('data-listeners-attached')) {
                
                return
              }
              
              const imageWrapper = menuButton.closest('.image-wrapper')
              if (!imageWrapper) {
                return
              }
              
              
              
              // Tìm hoặc tạo menu tooltip
              let menuTooltip = imageWrapper.querySelector('.image-context-menu')
              if (!menuTooltip) {
                // Tạo menu tooltip nếu chưa có
                menuTooltip = document.createElement('div')
                menuTooltip.className = 'image-context-menu'
                menuTooltip.style.cssText = `
                  position: absolute;
                  top: 40px;
                  right: 0px;
                  background: white;
                  border-radius: 8px;
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                  padding: 4px;
                  z-index: 10000;
                  min-width: 150px;
                  display: none;
                `
                
                // Tạo menu items
                const items = [
                  { label: 'Sao chép', icon: '📋', action: 'copy' },
                  { label: 'Cắt', icon: '✂️', action: 'cut' },
                  { label: 'Xóa', icon: '🗑️', action: 'delete' },
                ]
                
                items.forEach(item => {
                  const menuItem = document.createElement('div')
                  menuItem.className = 'image-menu-item'
                  menuItem.setAttribute('data-action', item.action)
                  menuItem.style.cssText = `
                    padding: 8px 12px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    border-radius: 4px;
                    font-size: 14px;
                    transition: background 0.2s;
                    color: #1f2937;
                  `
                  menuItem.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`
                  
                  // Hover effect
                  menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.background = '#f3f4f6'
                  })
                  menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.background = 'transparent'
                  })
                  
                  menuTooltip.appendChild(menuItem)
                })
                
                imageWrapper.appendChild(menuTooltip)
              }
              
              // Thêm event listeners cho button
              menuButton.addEventListener('mouseenter', () => {
                menuButton.style.background = 'rgba(0, 0, 0, 0.8)'
                menuButton.style.opacity = '1'
              })
              menuButton.addEventListener('mouseleave', () => {
                menuButton.style.background = 'rgba(0, 0, 0, 0.6)'
                // Không ẩn nếu đang hover vào wrapper hoặc menu
                if (!imageWrapper.matches(':hover') && menuTooltip.style.display !== 'block') {
                  menuButton.style.opacity = '0'
                }
              })
              
              // Thêm event listeners cho wrapper
              imageWrapper.addEventListener('mouseenter', () => {
                menuButton.style.opacity = '1'
                imageWrapper.classList.add('image-wrapper-hover')
              })
              imageWrapper.addEventListener('mouseleave', (e) => {
                const relatedTarget = e.relatedTarget
                if (!relatedTarget || 
                    (!relatedTarget.classList.contains('image-menu-button') && 
                     !relatedTarget.closest('.image-menu-button') &&
                     !relatedTarget.closest('.image-context-menu'))) {
                  menuButton.style.opacity = '0'
                  imageWrapper.classList.remove('image-wrapper-hover')
                }
              })
              
              // Thêm click handler cho button để toggle menu
              menuButton.addEventListener('click', (e) => {
                e.preventDefault()
                e.stopPropagation()
                
                if (menuTooltip) {
                  const isVisible = menuTooltip.style.display === 'block'
                  menuTooltip.style.display = isVisible ? 'none' : 'block'
                  
                  // Đóng menu khác nếu có
                  if (!isVisible) {
                    const allMenus = proseElement.querySelectorAll('.image-context-menu')
                    allMenus.forEach(menu => {
                      if (menu !== menuTooltip && menu.style.display === 'block') {
                        menu.style.display = 'none'
                      }
                    })
                  }
                }
              })
              
              // Thêm click handlers cho menu items
              if (menuTooltip) {
                const menuItems = menuTooltip.querySelectorAll('.image-menu-item')
                menuItems.forEach(item => {
                  item.addEventListener('click', (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    
                    const action = item.getAttribute('data-action')
                    if (action) {
                      // Tìm image node trong ProseMirror
                      const imgElement = imageWrapper.querySelector('img')
                      if (imgElement) {
                        const imageSrc = imageWrapper.getAttribute('data-image-src') || imgElement.getAttribute('src')
                        const { state, dispatch } = editorView
                        const { doc } = state
                        let imgPos = null
                        let imgNode = null
                        
                        // Tìm ảnh trong doc
                        doc.descendants((node, pos) => {
                          if (node.type.name === 'image' && node.attrs.src === imageSrc) {
                            if (imgPos === null) {
                              imgPos = pos
                              imgNode = node
                              return false
                            }
                          }
                        })
                        
                        if (imgPos !== null && imgNode) {
                          handleMenuAction(action, imgNode, imgPos, editorView)
                        }
                      }
                      
                      // Đóng menu
                      menuTooltip.style.display = 'none'
                    }
                  })
                  
                  // Hover effect cho menu items
                  item.addEventListener('mouseenter', () => {
                    item.style.background = '#f3f4f6'
                  })
                  item.addEventListener('mouseleave', () => {
                    item.style.background = 'transparent'
                  })
                })
              }
              
              // Đóng menu khi click bên ngoài
              const closeMenuOnOutsideClick = (e) => {
                if (menuTooltip && 
                    !imageWrapper.contains(e.target) && 
                    menuTooltip.style.display === 'block') {
                  menuTooltip.style.display = 'none'
                }
              }
              document.addEventListener('click', closeMenuOnOutsideClick)
              
              // Đánh dấu đã attach listeners
              menuButton.setAttribute('data-listeners-attached', 'true')
            })
          }
          
          // Attach listeners ngay khi plugin được khởi tạo
          // Đợi lâu hơn để đảm bảo DOM đã render
          setTimeout(() => {
            
            attachMenuButtonListeners()
          }, 300)
          
          // Thêm MutationObserver để theo dõi khi DOM thay đổi
          const observer = new MutationObserver(() => {
            attachMenuButtonListeners()
          })
          
          // Bắt đầu observe sau khi DOM sẵn sàng
          setTimeout(() => {
            const { dom } = editorView
            let proseElement = dom.querySelector('.mindmap-editor-prose')
            if (!proseElement && dom.classList && dom.classList.contains('mindmap-editor-prose')) {
              proseElement = dom
            }
            if (proseElement) {
              observer.observe(proseElement, {
                childList: true,
                subtree: true,
              })
            }
          }, 500)
          
          return {
            update: () => {
              // Attach listeners mỗi khi view update
              setTimeout(() => {
                attachMenuButtonListeners()
              }, 100)
            },
            destroy: () => {
              observer.disconnect()
            },
          }
        },
      }),
    ]
  },
})

const dropImagePlugin = () => {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items || [])
        const { schema } = view.state

        items.forEach((item) => {
          const image = item.getAsFile()
          if (!image) return

          if (item.type.indexOf("image") === 0) {
            event.preventDefault()

            fileToBase64(image).then((base64) => {
              const node = schema.nodes.image.create({
                src: base64,
              })
              const transaction = view.state.tr.replaceSelectionWith(node)
              view.dispatch(transaction)
              
              requestAnimationFrame(() => {
                window.dispatchEvent(new CustomEvent('image-loaded-in-editor'))
              })
            })
          }
        })

        return false
      },
      handleDOMEvents: {
        drop: (view, event) => {
          const hasFiles =
            event.dataTransfer &&
            event.dataTransfer.files &&
            event.dataTransfer.files.length

          if (!hasFiles) {
            return false
          }

          const images = Array.from(event.dataTransfer?.files ?? []).filter(
            (file) => /image/i.test(file.type)
          )

          if (images.length === 0) {
            return false
          }

          event.preventDefault()

          const { schema } = view.state
          const coordinates = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })
          if (!coordinates) return false

          images.forEach(async (image) => {
            fileToBase64(image).then((base64) => {
              const node = schema.nodes.image.create({
                src: base64,
              })
              const transaction = view.state.tr.insert(coordinates.pos, node)
              view.dispatch(transaction)
              
              requestAnimationFrame(() => {
                window.dispatchEvent(new CustomEvent('image-loaded-in-editor'))
              })
            })
          })

          return true
        },
      },
    },
  })
}
