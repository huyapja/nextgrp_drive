<template>
  <div class="rich-comment-editor">
    <div
      v-if="editor"
      class="editor-content "
    >
      <EditorContent
        :editor="editor"
        class="prose prose-sm max-w-none min-h-[40px] max-h-[80px] overflow-y-auto focus:outline-none !m-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      />
    </div>
  </div>
</template>

<script>
import { Document } from "@tiptap/extension-document"
import { History } from "@tiptap/extension-history"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Text } from "@tiptap/extension-text"
import { Editor, EditorContent, VueRenderer } from "@tiptap/vue-3"
import { call } from "frappe-ui"
import tippy from "tippy.js"
import { Mention } from "../extensions/mention/MentionExtension"
import { Placeholder } from "../extensions/placeholder"
import MentionList from "./MentionList.vue"

export default {
  name: "RichCommentEditor",
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
      default: "Add comment",
    },
    entityName: {
      type: String,
      required: true,
    },
  },
  emits: ["update:modelValue", "mentionedUsers", "input", "resize"],
  data() {
    return {
      editor: null,
      usersData: [],
    }
  },
  watch: {
    modelValue(value) {
      if (this.editor && this.editor.getHTML() !== value) {
        this.editor.commands.setContent(value, false)
      }
    },
  },
  async mounted() {
    // Fetch users first, then init editor
    try {
      const response = await call("drive.api.product.get_system_users")
      console.log("Raw users response:", response)
      
      // Get user emails for permission check
      const userEmails = response.map(user => user.email)
      
      // Check permissions for all users
      let userPermissions = {}
      try {
        const permissionResponse = await call("drive.api.product.check_users_permissions", {
          entity_name: this.entityName,
          user_emails: JSON.stringify(userEmails)
        })
        
        permissionResponse.forEach(perm => {
          userPermissions[perm.email] = perm.has_permission
        })
        console.log("User permissions:", userPermissions)
      } catch (permError) {
        console.error("Failed to check permissions:", permError)
        // Default to false if permission check fails
        userEmails.forEach(email => {
          userPermissions[email] = false
        })
      }
      
      this.usersData = response.map((item) => ({
        id: item.email,
        label: item.full_name,
        value: item.email,
        user_image: item.user_image,
        type: "user",
        author: this.$store?.state?.user?.id || "Administrator",
        has_permission: userPermissions[item.email] || false
      }))
      
      console.log("Transformed users data:", this.usersData)
    } catch (error) {
      console.error("Failed to fetch users:", error)
      this.usersData = []
    }
    
    this.initEditor()
  },
  beforeUnmount() {
    if (this.editor) {
      this.editor.destroy()
    }
  },
  methods: {
    // Hàm bỏ dấu tiếng Việt
    removeVietnameseTones(str) {
      if (!str) return ''
      
      str = str.toLowerCase()
      
      // Bỏ dấu các ký tự tiếng Việt
      str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a')
      str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e')
      str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i')
      str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o')
      str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u')
      str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y')
      str = str.replace(/đ/g, 'd')
      
      // Bỏ các ký tự đặc biệt
      str = str.replace(/[^a-z0-9\s]/g, '')
      
      return str
    },
    
    initEditor() {
      this.editor = new Editor({
        content: this.modelValue,
        extensions: [
          Document,
          Paragraph,
          Text,
          History,
          Placeholder.configure({
            placeholder: this.placeholder,
          }),
          Mention.configure({
            HTMLAttributes: {
              class: "mention",
            },
            suggestion: {
              // CHO PHÉP DẤU CÁCH TRONG MENTION
              char: '@',
              allowSpaces: true,
              
              items: ({ query }) => {
                console.log("Mention items function called, query:", query, "data:", this.usersData)
                const users = this.usersData || []
                
                // Tìm kiếm linh hoạt hơn với nhiều từ
                const queryLower = query.toLowerCase().trim()
                
                if (!queryLower) {
                  // Nếu không có query, hiển thị tất cả
                  return users.slice(0, 10)
                }
                
                // Bỏ dấu query để tìm kiếm
                const queryNoTones = this.removeVietnameseTones(queryLower)
                
                return users
                  .filter((item) => {
                    const labelLower = item.label.toLowerCase()
                    const labelNoTones = this.removeVietnameseTones(labelLower)
                    
                    // Tìm kiếm theo từng từ trong query
                    // Hỗ trợ cả CÓ DẤU và KHÔNG DẤU
                    // VD: "tran quang" hoặc "trần quang" đều tìm được "Trần Quang"
                    const queryWords = queryNoTones.split(/\s+/).filter(w => w)
                    
                    return queryWords.every(word => {
                      // Tìm cả trong bản có dấu và không dấu
                      return labelLower.includes(word) || labelNoTones.includes(word)
                    })
                  })
                  .sort((a, b) => {
                    // Ưu tiên kết quả khớp chính xác hơn
                    const aLabel = this.removeVietnameseTones(a.label.toLowerCase())
                    const bLabel = this.removeVietnameseTones(b.label.toLowerCase())
                    
                    const aStartsWith = aLabel.startsWith(queryNoTones)
                    const bStartsWith = bLabel.startsWith(queryNoTones)
                    
                    if (aStartsWith && !bStartsWith) return -1
                    if (!aStartsWith && bStartsWith) return 1
                    
                    // Nếu cả 2 đều starts with hoặc đều không, giữ nguyên thứ tự
                    return 0
                  })
                  .slice(0, 10)
              },
              
              render: () => {
                let component
                let popup

                return {
                  onStart: (props) => {
                    console.log("Mention popup onStart called")
                    component = new VueRenderer(MentionList, {
                      props,
                      editor: props.editor,
                    })
                    if (!props.clientRect) {
                      return
                    }
                    popup = tippy("body", {
                      getReferenceClientRect: props.clientRect,
                      appendTo: () => document.body,
                      content: component.element,
                      showOnCreate: true,
                      interactive: true,
                      trigger: "manual",
                      placement: "bottom-start",
                    })
                  },
                  onUpdate(props) {
                    component.updateProps(props)
                    if (!props.clientRect) {
                      return
                    }
                    popup[0].setProps({
                      getReferenceClientRect: props.clientRect,
                    })
                  },
                  onKeyDown(props) {
                    if (props.event.key === "Escape") {
                      popup[0].hide()
                      return true
                    }
                    return component.ref?.onKeyDown(props)
                  },
                  onExit() {
                    popup[0].destroy()
                    component.destroy()
                  },
                }
              },
            },
          }),
        ],
        onUpdate: () => {
          const html = this.editor.getHTML()
          this.$emit("update:modelValue", html)
          
          // Extract mentions
          const mentions = this.parseMentions(this.editor.getJSON())
          this.$emit("mentionedUsers", mentions)
          this.$emit("input")
          this.$emit("resize")
        },
        editorProps: {
          attributes: {
            class: "focus:outline-none",
          },
        },
      })
    },
    parseMentions(data) {
      const tempMentions = (data.content || []).flatMap(this.parseMentions)
      if (data.type === "mention") {
        tempMentions.push({
          id: data.attrs.id,
          author: data.attrs.author,
          type: data.attrs.type,
        })
      }
      const uniqueMentions = [
        ...new Set(tempMentions.map((item) => item.id)),
      ].map((id) => tempMentions.find((item) => item.id === id))
      return uniqueMentions
    },
    // INSERT MENTION - HÀM MỚI
    insertMention(user) {
      if (!this.editor) {
        console.error("Editor not initialized")
        return
      }

      // Focus vào editor trước
      this.editor.commands.focus()

      // Insert mention node với TipTap
      this.editor
        .chain()
        .focus()
        .insertContent([
          {
            type: 'mention',
            attrs: {
              id: user.id,
              label: user.value,
              author: user.author || this.$store?.state?.user?.id || "Administrator",
              type: user.type || "user",
            },
          },
          {
            type: 'text',
            text: ' ', // Thêm space sau mention
          },
        ])
        .run()

      // Emit update
      const html = this.editor.getHTML()
      this.$emit("update:modelValue", html)
      
      const mentions = this.parseMentions(this.editor.getJSON())
      this.$emit("mentionedUsers", mentions)
      this.$emit("input")
      this.$emit("resize")

      console.log("Mention inserted:", user)
    },
    focus() {
      if (this.editor) {
        this.editor.commands.focus()
      }
    },
    clear() {
      if (this.editor) {
        this.editor.commands.clearContent()
      }
    },
    getText() {
      return this.editor ? this.editor.getText() : ""
    },
    getHTML() {
      return this.editor ? this.editor.getHTML() : ""
    },
    isEmpty() {
      return this.editor ? this.editor.isEmpty : true
    },
  },
}
</script>

<style scoped>
:deep(.is-empty.is-editor-empty){
  margin: 0 !important;
}

.rich-comment-editor {
  position: relative;
  width: 100%;
}

.rich-comment-editor :deep(.ProseMirror) {
  outline: none;
  border: none;
  font-size: 14px;
  line-height: 1.4;
  min-height: 40px;
  padding: 8px 12px;
  width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.rich-comment-editor :deep(.ProseMirror p) {
  margin: 0 !important;
}

.rich-comment-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: #9ca3af;
  pointer-events: none;
  height: 0;
  margin: 0 !important;
}

.rich-comment-editor :deep(span[data-type="mention"]) {
  background-color: rgba(59, 130, 246, 0.1);
  color: #3b82f6 !important;
  border-radius: 4px;
  padding: 2px 4px;
  font-weight: 500;
  text-decoration: none;
}

.rich-comment-editor :deep(.ProseMirror:focus) {
  outline: none;
}
</style>