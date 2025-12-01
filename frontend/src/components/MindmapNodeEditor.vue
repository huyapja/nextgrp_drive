<template>
  <div class="mindmap-node-editor">
    <editor-content
      class="mindmap-editor-content"
      :editor="editor"
    />
  </div>
</template>

<script>
import { Editor, EditorContent } from "@tiptap/vue-3"
import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "prosemirror-state"
import { Document } from "@/components/DocEditor/extensions/document"
import { Paragraph } from "@/components/DocEditor/extensions/paragraph"
import { Text } from "@/components/DocEditor/extensions/text"
import { Placeholder } from "@/components/DocEditor/extensions/placeholder"
import Bold from "@tiptap/extension-bold"
import Italic from "@tiptap/extension-italic"

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
    isRoot: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["update:modelValue", "focus", "blur", "input"],

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
        Bold, // Thêm Bold extension để hỗ trợ Ctrl+B
        Italic, // Thêm Italic extension để hỗ trợ Ctrl+I
        Placeholder.configure({
          placeholder: this.placeholder,
        }),
        // PreserveTrailingSpaces - tạm thời comment để test
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
          // Ngăn chặn các phím tắt của trình duyệt khi editor đang focus
          // Chỉ xử lý trong editor, không ảnh hưởng đến trình duyệt
          if (event.ctrlKey || event.metaKey) {
            const key = event.key.toLowerCase()
            
            // Các phím tắt editor (Ctrl+B, Ctrl+I, Ctrl+Z, Ctrl+Y, Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+A)
            // TipTap sẽ tự động preventDefault cho các phím tắt của nó
            // Chúng ta chỉ cần stopPropagation để không trigger event handler ở MindMap.vue
            if (['b', 'i', 'u', 'z', 'y', 'x', 'c', 'v', 'a'].includes(key)) {
              // Stop propagation để không trigger event handler ở MindMap.vue
              event.stopPropagation()
              // Cho phép TipTap xử lý các phím tắt này
              // TipTap extensions sẽ tự động preventDefault nếu cần
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
    
    // Thêm event listener để ngăn chặn các phím tắt của trình duyệt khi editor đang focus
    // Đảm bảo các phím tắt chỉ hoạt động trong editor, không ảnh hưởng đến trình duyệt
    this.$nextTick(() => {
      if (this.editor && this.editor.view && this.editor.view.dom) {
        const editorDOM = this.editor.view.dom
        
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
  user-select: text; /* Cho phép bôi đen text */
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.mindmap-editor-content {
  width: 100%;
  height: 100%; /* 100% để fit vào editor */
  min-height: 43px;
}

:deep(.mindmap-editor-prose) {
  width: 100%;
  height: auto; /* Auto để có thể mở rộng theo nội dung */
  min-height: 43px;
  padding: 8px 16px;
  font-size: 19px;
  line-height: 1.4;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  overflow: visible; /* Visible để hiển thị đủ nội dung */
  box-sizing: border-box;
  word-break: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  user-select: text; /* Cho phép bôi đen text */
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

:deep(.mindmap-editor-prose.is-root) {
  color: #ffffff;
  caret-color: #ffffff; /* Cursor nháy màu trắng */
}

:deep(.mindmap-editor-prose.is-root p) {
  color: #ffffff;
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
  padding: 0;
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
</style>

