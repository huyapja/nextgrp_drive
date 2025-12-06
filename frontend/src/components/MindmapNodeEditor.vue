<template>
  <div :class="['mindmap-node-editor', { 'is-root': isRoot }]">
    <editor-content
      :class="['mindmap-editor-content', { 'is-root': isRoot }]"
      :editor="editor"
    />
  </div>
</template>

<script>
import { Document } from "@/components/DocEditor/extensions/document"
import { Paragraph } from "@/components/DocEditor/extensions/paragraph"
import { Placeholder } from "@/components/DocEditor/extensions/placeholder"
import { Text } from "@/components/DocEditor/extensions/text"
import { Underline } from "@/components/DocEditor/extensions/underline"
import { Extension } from "@tiptap/core"
import Bold from "@tiptap/extension-bold"
import Code from "@tiptap/extension-code"
import Italic from "@tiptap/extension-italic"
import Link from "@tiptap/extension-link"
import Typography from "@tiptap/extension-typography"
import StarterKit from "@tiptap/starter-kit"
import { Editor, EditorContent } from "@tiptap/vue-3"

// Extension đơn giản - ProseMirror text nodes tự nhiên preserve trailing spaces
// Chúng ta chỉ cần đảm bảo không bị normalize khi parse HTML
const PreserveTrailingSpaces = Extension.create({
  name: 'preserveTrailingSpaces',
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
  },
  emits: ["update:modelValue", "focus", "blur", "input", "create-description"],

  data() {
    return {
      editor: null,
      isUpdatingFromModelValue: false, // Flag để tránh vòng lặp khi update từ modelValue
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
  },
  watch: {
    modelValue(value) {
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
            // Set HTML content (giữ formatting)
            this.editor.commands.setContent(value, false)
          } else {
            // Insert plain text
            this.editor.commands.insertContent(value, false)
          }
        }
        
        // Reset flag sau một tick
        this.$nextTick(() => {
          this.isUpdatingFromModelValue = false
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
        Document,
        Paragraph,
        Text,
        Bold,
        Italic,
        Underline,
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
          openOnClick: false,
          autolink: true,
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
                this.editor.chain()
                  .focus('end')
                  .insertContent('<blockquote><p></p></blockquote>')
                  .run()
                
                // Focus vào paragraph trong blockquote vừa tạo
                this.$nextTick(() => {
                  // Đơn giản: focus vào cuối (sẽ vào blockquote vừa tạo)
                  this.editor.commands.focus('end')
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
      content: this.modelValue || "",
      onUpdate: () => {
        // Skip nếu đang update từ modelValue để tránh vòng lặp
        if (this.isUpdatingFromModelValue) return
        
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
        // Lấy plain text để lưu vào modelValue (nếu cần)
        const text = this.getEditorTextWithTrailingSpaces()
        
        // Emit cả HTML và text - có thể dùng HTML để hiển thị, text để lưu
        this.$emit("update:modelValue", html) // Lưu HTML để giữ formatting
        this.$emit("input", html)
        // Gọi callback nếu có
        if (this.onInput) {
          this.onInput(html)
        }
      },
      onFocus: () => {
        this.$emit("focus")
        // Gọi callback nếu có
        if (this.onFocus) {
          this.onFocus()
        }
      },
      onBlur: () => {
        this.$emit("blur")
        // Gọi callback nếu có
        if (this.onBlur) {
          this.onBlur()
        }
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
      }
    })
  },
  beforeUnmount() {
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
    
    if (this.editor) {
      this.editor.destroy()
    }
  },
}
</script>

<style scoped>
.mindmap-node-editor {
  width: 100%;
  height: 100%; /* 100% để fit vào container */
  min-height: 43px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  user-select: text; /* Cho phép bôi đen text */
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  overflow: visible; /* Visible để hiển thị đủ nội dung */
}

/* ⚠️ CRITICAL: Root node không bị giới hạn height */
.mindmap-node-editor.is-root {
  height: auto !important;
  min-height: 43px !important;
  max-height: none !important;
}

.mindmap-editor-content {
  width: 100%;
  height: 100%; /* 100% để fit vào editor */
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
  max-width: 100%;
  height: auto;
  min-height: 43px;
  padding: 8px 16px;
  font-size: 19px;
  line-height: 1.4;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  overflow: visible; /* ⚠️ CRITICAL: visible để hiển thị đủ nội dung khi edit */
  box-sizing: border-box;
  word-break: break-word;
  overflow-wrap: break-word;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  min-width: 0;
  margin: 0; /* ⚠️ NEW: Xóa margin thừa */
  padding-bottom: 8px; /* ⚠️ FIX: Padding đều 8px (không thừa) */
}

:deep(.mindmap-editor-prose > *) {
  max-width: 100%;
  box-sizing: border-box;
  width: 100%;
}

:deep(.mindmap-editor-prose.is-root) {
  color: #ffffff;
  caret-color: #ffffff; /* Cursor nháy màu trắng */
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
  margin: 0; /* ⚠️ CRITICAL: Xóa margin thừa */
  padding: 0; /* ⚠️ CRITICAL: Xóa padding thừa */
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.4; /* ⚠️ NEW: Match với editor line-height */
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
  max-width: 100%;
  height: auto;
  min-height: 43px;
  padding: 8px 16px;
  font-size: 19px;
  line-height: 1.4;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  overflow: visible; /* ⚠️ CRITICAL: visible để hiển thị đủ nội dung khi edit */
  box-sizing: border-box;
  word-break: break-word;
  overflow-wrap: break-word;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  min-width: 0;
  margin: 0; /* ⚠️ NEW: Xóa margin thừa */
  padding-bottom: 8px; /* ⚠️ FIX: Padding đều 8px (không thừa) */
}

:deep(.mindmap-editor-prose p) {
  margin: 0; /* ⚠️ CRITICAL: Xóa margin thừa */
  padding: 0; /* ⚠️ CRITICAL: Xóa padding thừa */
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.4; /* ⚠️ NEW: Match với editor line-height */
}

:deep(.mindmap-editor-prose blockquote) {
  margin: 4px 0 0 0; /* ⚠️ FIX: Chỉ margin-top, không có margin-bottom */
  margin-right: 0 !important;
  margin-left: 0;
  padding-left: 6px;
  padding-right: 0 !important;
  padding-top: 0; /* ⚠️ NEW: Xóa padding-top thừa */
  padding-bottom: 0; /* ⚠️ NEW: Xóa padding-bottom thừa */
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
  margin-bottom: 0; /* ⚠️ NEW: Không có margin-bottom khi edit */
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
  line-height: 1.6; /* ⚠️ NEW: Match với blockquote line-height */
}
</style>

