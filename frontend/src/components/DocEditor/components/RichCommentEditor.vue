<template>
  <div class="rich-comment-editor">
    <div v-if="editor" class="editor-content">
      <EditorContent :editor="editor"
        class="prose prose-sm max-w-none min-h-[40px] max-h-[80px] overflow-y-auto focus:outline-none !m-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" />
    </div>
  </div>
</template>

<script>
import { Extension } from "@tiptap/core"
import { Document } from "@tiptap/extension-document"
import { History } from "@tiptap/extension-history"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Text } from "@tiptap/extension-text"
import { Editor, EditorContent, VueRenderer } from "@tiptap/vue-3"
import { call } from "frappe-ui"
import { Plugin, PluginKey } from "prosemirror-state"
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
      userPermissions: {}, // Cache permissions để tránh check lại
      permissionsChecked: false, // Track xem đã check permissions chưa
      lockedMentionId: null, // Track mention bị lock
      mentionComponent: null, // Reference đến mention component để trigger update
      checkingPermissions: false, // Track xem đang check permissions không
    }
  },
  computed:{
    currentUserName() {
      return this.$store.state.user.id
    },
  },
  watch: {
    modelValue(value) {
      if (this.editor && this.editor.getHTML() !== value) {
        this.editor.commands.setContent(value, false)
      }
    },
  },
  async mounted() {
    // ⚠️ Initialize editor immediately, don't wait for users/permissions
    // Editor sẽ hoạt động ngay, không bị block bởi API calls
    this.initEditor()
    
    // Load users with permissions in one API call (NON-BLOCKING cho editor init)
    // - Editor đã được khởi tạo ở trên, không đợi API
    // - API get_system_users giờ trả về luôn permissions, không cần gọi thêm check_users_permissions
    // - Mention list sẽ hiển thị với permissions đúng ngay từ đầu
    this.loadUsers()
  },
  beforeUnmount() {
    if (this.editor) {
      this.editor.destroy()
    }
  },
  methods: {
    // Load users with permissions check in one API call
    async loadUsers() {
      try {
        const response = await call("drive.api.product.get_system_users", {
          entity_name: this.entityName,
        })
        console.log("Raw users response with permissions:", response)

        // Load users with permissions from API response
        this.usersData = response.map((item) => ({
          id: item.email,
          label: item.full_name,
          value: item.email,
          user_image: item.user_image,
          type: "user",
          author: this.$store?.state?.user?.id || "Administrator",
          has_permission: item.has_permission !== undefined ? item.has_permission : true,
          permissions: item.permissions || {
            read: item.has_permission !== undefined ? item.has_permission : true,
            write: false,
            share: false,
          },
        }))

        // Cache permissions
        response.forEach((item) => {
          const email = item.email || item.name
          this.userPermissions[email] = item.has_permission !== undefined ? item.has_permission : true
        })

        this.permissionsChecked = true
        console.log("Users loaded with permissions:", this.usersData)
      } catch (error) {
        console.error("Failed to fetch users:", error)
        this.usersData = []
      }
    },
    
    // DEPRECATED: Không cần check permissions riêng nữa vì get_system_users đã trả về permissions
    // Giữ lại để backward compatibility nếu có code khác gọi
    async checkUsersPermissions() {
      // Permissions đã được check trong loadUsers() rồi
      // Không cần làm gì thêm
      return
    },
    
    // Helper function để get mention items (extract từ items function)
    getMentionItems(query = "") {
      const users = this.usersData || []

      // Lấy danh sách các mention đã có trong editor
      const existingMentionIds = new Set()
      if (this.editor && this.editor.state) {
        this.editor.state.doc.descendants((node) => {
          if (node.type.name === "mention") {
            existingMentionIds.add(node.attrs.id)
          }
        })
      }

      // Lọc bỏ những user đã được mention
      const availableUsers = users.filter(
        (user) => !existingMentionIds.has(user.id) && user.id !== this.currentUserName
      )

      // Tìm kiếm linh hoạt hơn với nhiều từ
      const queryLower = query.toLowerCase().trim()

      if (!queryLower) {
        // Nếu không có query, hiển thị tất cả user chưa mention
        return availableUsers.slice(0, 10)
      }

      // Bỏ dấu query để tìm kiếm
      const queryNoTones = this.removeVietnameseTones(queryLower)

      return availableUsers
        .filter((item) => {
          const labelLower = item.label.toLowerCase()
          const labelNoTones = this.removeVietnameseTones(labelLower)

          // Tìm kiếm theo từng từ trong query
          const queryWords = queryNoTones
            .split(/\s+/)
            .filter((w) => w)

          return queryWords.every((word) => {
            // Tìm cả trong bản có dấu và không dấu
            return (
              labelLower.includes(word) || labelNoTones.includes(word)
            )
          })
        })
        .sort((a, b) => {
          // Ưu tiên kết quả khớp chính xác hơn
          const aLabel = this.removeVietnameseTones(
            a.label.toLowerCase()
          )
          const bLabel = this.removeVietnameseTones(
            b.label.toLowerCase()
          )

          const aStartsWith = aLabel.startsWith(queryNoTones)
          const bStartsWith = bLabel.startsWith(queryNoTones)

          if (aStartsWith && !bStartsWith) return -1
          if (!aStartsWith && bStartsWith) return 1

          return 0
        })
        .slice(0, 10)
    },
    // Hàm bỏ dấu tiếng Việt
    removeVietnameseTones(str) {
      if (!str) return ""

      str = str.toLowerCase()

      // Bỏ dấu các ký tự tiếng Việt
      str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a")
      str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e")
      str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i")
      str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o")
      str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u")
      str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y")
      str = str.replace(/đ/g, "d")

      // Bỏ các ký tự đặc biệt
      str = str.replace(/[^a-z0-9\s]/g, "")

      return str
    },

    initEditor() {
      const self = this

      this.editor = new Editor({
        content: this.modelValue,
        extensions: [
          Document,
          Paragraph,
          Text,
          History,
          Placeholder.configure({
            placeholder: this.placeholder,
            showOnlyCurrent: false,
          }),
          // Extension.create({
          //   name: 'handleEnter',
          //   addKeyboardShortcuts() {
          //     return {
          //       'Enter': ({ editor, event }) => {
          //         // Kiểm tra nếu đang nhấn Shift thì cho xuống dòng
          //         if (event.shiftKey) {
          //           return false // Cho phép xử lý mặc định (xuống dòng)
          //         }

          //         // Nếu không có nội dung, không làm gì cả
          //         if (editor.isEmpty) return true

          //         // Trigger event để component cha xử lý gửi comment
          //         self.$emit('onEnter')
                  
          //         // Ngăn không cho xuống dòng
          //         return true
          //       }
          //     }
          //   }
          // }),
          // Extension để prevent xóa locked mention
          Extension.create({
            name: "preventLockedMentionDeletion",

            addKeyboardShortcuts() {
              return {
                // Chặn Backspace
                Backspace: ({ editor }) => {
                  if (!self.lockedMentionId) return false

                  const { $from, from } = editor.state.selection
                  const nodeBefore = $from.nodeBefore

                  // Kiểm tra nếu node trước cursor là locked mention
                  if (
                    nodeBefore?.type.name === "mention" &&
                    nodeBefore.attrs.id === self.lockedMentionId
                  ) {
                    console.log(
                      "❌ Blocked deletion of locked mention via Backspace"
                    )
                    return true // Chặn xóa
                  }

                  return false
                },

                // Chặn Delete
                Delete: ({ editor }) => {
                  if (!self.lockedMentionId) return false

                  const { $from } = editor.state.selection
                  const nodeAfter = $from.nodeAfter

                  // Kiểm tra nếu node sau cursor là locked mention
                  if (
                    nodeAfter?.type.name === "mention" &&
                    nodeAfter.attrs.id === self.lockedMentionId
                  ) {
                    console.log(
                      "❌ Blocked deletion of locked mention via Delete"
                    )
                    return true // Chặn xóa
                  }

                  return false
                },

                // Chặn Ctrl+A + Delete/Backspace
                "Mod-a": ({ editor }) => {
                  if (!self.lockedMentionId) return false

                  // Không cho select all khi có locked mention
                  const doc = editor.state.doc
                  let hasLockedMention = false

                  doc.descendants((node) => {
                    if (
                      node.type.name === "mention" &&
                      node.attrs.id === self.lockedMentionId
                    ) {
                      hasLockedMention = true
                      return false // Stop traversal
                    }
                  })

                  if (hasLockedMention) {
                    console.log(
                      "❌ Blocked Select All with locked mention present"
                    )
                    return true
                  }

                  return false
                },
              }
            },

            // Chặn việc xóa qua mouse selection + delete
            addProseMirrorPlugins() {
              return [
                new Plugin({
                  key: new PluginKey("preventLockedMentionSelection"),
                  filterTransaction: (transaction, state) => {
                    if (!self.lockedMentionId) return true

                    // Kiểm tra nếu transaction xóa locked mention
                    let hasLockedMentionDeletion = false

                    transaction.steps.forEach((step) => {
                      if (
                        step.jsonID === "replace" ||
                        step.jsonID === "replaceAround"
                      ) {
                        const { from, to } = step
                        state.doc.nodesBetween(from, to, (node, pos) => {
                          if (
                            node.type.name === "mention" &&
                            node.attrs.id === self.lockedMentionId
                          ) {
                            hasLockedMentionDeletion = true
                            return false
                          }
                        })
                      }
                    })

                    if (hasLockedMentionDeletion) {
                      console.log(
                        "❌ Blocked transaction that deletes locked mention"
                      )
                      return false
                    }

                    return true
                  },
                }),
              ]
            },
          }),
          Mention.configure({
            HTMLAttributes: {
              class: "mention",
            },

            // Define attributes
            addAttributes() {
              return {
                id: {
                  default: null,
                  parseHTML: (element) => element.getAttribute("data-id"),
                  renderHTML: (attributes) => {
                    if (!attributes.id) return {}
                    return { "data-id": attributes.id }
                  },
                },
                label: {
                  default: null,
                  parseHTML: (element) => element.getAttribute("data-label"),
                  renderHTML: (attributes) => {
                    if (!attributes.label) return {}
                    return { "data-label": attributes.label }
                  },
                },
                author: {
                  default: null,
                  parseHTML: (element) => element.getAttribute("data-author"),
                  renderHTML: (attributes) => {
                    if (!attributes.author) return {}
                    return { "data-author": attributes.author }
                  },
                },
                type: {
                  default: "user",
                  parseHTML: (element) => {
                    // Lấy từ data-mention-type HOẶC data-type
                    return (
                      element.getAttribute("data-mention-type") ||
                      element.getAttribute("data-type") ||
                      "user"
                    )
                  },
                  renderHTML: (attributes) => {
                    return { "data-mention-type": attributes.type }
                  },
                },
              }
            },

            parseHTML() {
              return [
                {
                  // Parse span với data-type="mention"
                  tag: 'span[data-type="mention"]',
                  getAttrs: (dom) => {
                    return {
                      id: dom.getAttribute("data-id"),
                      label:
                        dom.getAttribute("data-label") ||
                        dom.textContent.replace("@", ""),
                      author: dom.getAttribute("data-author"),
                      type: dom.getAttribute("data-mention-type") || "user",
                    }
                  },
                },
                {
                  // Parse span với data-type="user" (FORMAT CŨ)
                  tag: 'span[data-type="user"]',
                  getAttrs: (dom) => {
                    return {
                      id: dom.getAttribute("data-id"),
                      label:
                        dom.getAttribute("data-label") ||
                        dom.textContent.replace("@", ""),
                      author: dom.getAttribute("data-author"),
                      type: "user",
                    }
                  },
                },
                {
                  // Parse span.mention với data-id
                  tag: "span.mention[data-id]",
                  getAttrs: (dom) => {
                    return {
                      id: dom.getAttribute("data-id"),
                      label:
                        dom.getAttribute("data-label") ||
                        dom.textContent.replace("@", ""),
                      author: dom.getAttribute("data-author"),
                      type: dom.getAttribute("data-mention-type") || "user",
                    }
                  },
                },
                {
                  // Fallback: span.mention
                  tag: "span.mention",
                  getAttrs: (dom) => {
                    const text = dom.textContent.replace("@", "").trim()
                    return {
                      id: dom.getAttribute("data-id") || text,
                      label: dom.getAttribute("data-label") || text,
                      author: dom.getAttribute("data-author"),
                      type: dom.getAttribute("data-mention-type") || "user",
                    }
                  },
                },
              ]
            },

            renderHTML({ node, HTMLAttributes }) {
              return [
                "span",
                {
                  ...HTMLAttributes,
                  "data-type": "mention",
                  "data-id": node.attrs.id,
                  "data-label": node.attrs.label,
                  "data-author": node.attrs.author,
                  "data-mention-type": node.attrs.type,
                  class: "mention",
                },
                `@${node.attrs.label}`,
              ]
            },
            suggestion: {
              // CHO PHÉP DẤU CÁCH TRONG MENTION
              char: "@",
              allowSpaces: true,

              items: ({ query, editor }) => {
                // ⚠️ Function này KHÔNG async, return ngay lập tức
                // Không block editor hoặc mention menu khi API pending
                console.log(
                  "Mention items function called, query:",
                  query,
                  "permissionsChecked:",
                  self.permissionsChecked,
                  "checkingPermissions:",
                  self.checkingPermissions
                )
                
                // Trigger check permissions nếu chưa check (NON-BLOCKING)
                // - Không đợi API, return ngay với data hiện tại
                // - Permissions sẽ được check trong background
                // - Component sẽ tự động update sau khi permissions check xong
                if (!self.permissionsChecked && !self.checkingPermissions) {
                  // Permissions đã được check trong loadUsers() rồi, không cần check lại
                }
                
                // Return items ngay lập tức (không đợi API)
                // Nếu permissions chưa check xong, sẽ trả về has_permission: true (default)
                // Component sẽ được update lại sau khi permissions check xong
                return self.getMentionItems(query)
              },

              render: () => {
                let component
                let popup

                return {
                  onStart: (props) => {
                    // ⚠️ Function này KHÔNG async, không đợi API
                    // Mention menu sẽ hiển thị ngay, không bị block
                    console.log("Mention popup onStart called")
                    
                    // Trigger check permissions nếu chưa check (NON-BLOCKING)
                    // - Không đợi API, tạo component ngay
                    // - Component sẽ tự động update sau khi permissions check xong
                    if (!self.permissionsChecked && !self.checkingPermissions) {
                      // Permissions đã được check trong loadUsers() rồi, không cần check lại
                    }
                    
                    // Tạo component ngay lập tức (không đợi API)
                    component = new VueRenderer(MentionList, {
                      props,
                      editor: props.editor,
                    })
                    // Lưu reference để có thể trigger update sau khi permissions check xong
                    self.mentionComponent = component
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
                    self.mentionComponent = null
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
    // INSERT MENTION
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
            type: "mention",
            attrs: {
              id: user.id,
              label: user.value,
              author:
                user.author || this.$store?.state?.user?.id || "Administrator",
              type: user.type || "user",
            },
          },
          {
            type: "text",
            text: " ", // Thêm space sau mention
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

    setHTML(htmlContent) {
      if (!this.editor) {
        console.error("Editor not initialized")
        return false
      }

      console.log("🔍 Original HTML:", htmlContent)

      // Parse HTML
      const tempDiv = document.createElement("div")
      tempDiv.innerHTML = htmlContent

      // FIX: Tìm mentions với data-type="user" HOẶC "mention"
      const mentionSpans = tempDiv.querySelectorAll(
        'span.mention, span[data-type="mention"], span[data-type="user"], span[data-id]'
      )

      console.log("🎯 Found mention spans:", mentionSpans.length)

      mentionSpans.forEach((span, idx) => {
        console.log(`Processing span ${idx}:`, span.outerHTML)

        // Chuyển data-type="user" thành data-type="mention"
        const currentType = span.getAttribute("data-type")
        if (currentType === "user" || !currentType) {
          span.setAttribute("data-type", "mention")
          console.log('✅ Changed data-type to "mention"')
        }

        // Ensure có data-id
        if (!span.getAttribute("data-id")) {
          const label =
            span.getAttribute("data-label") || span.textContent.replace("@", "")
          span.setAttribute("data-id", label)
          console.log(`✅ Added data-id: ${label}`)
        }

        // Ensure có data-label
        if (!span.getAttribute("data-label")) {
          const text = span.textContent.replace("@", "").trim()
          span.setAttribute("data-label", text)
          console.log(`✅ Added data-label: ${text}`)
        }

        // Ensure có class mention
        if (!span.classList.contains("mention")) {
          span.classList.add("mention")
        }

        // Ensure có data-author
        if (!span.getAttribute("data-author")) {
          span.setAttribute(
            "data-author",
            this.$store?.state?.user?.id || "Administrator"
          )
        }

        console.log("✅ Final span:", span.outerHTML)
      })

      const normalizedHTML = tempDiv.innerHTML
      console.log("✨ Normalized HTML:", normalizedHTML)

      // Set content
      this.editor.commands.setContent(normalizedHTML, false)

      // Verify
      let mentionCount = 0
      this.editor.state.doc.descendants((node) => {
        if (node.type.name === "mention") {
          mentionCount++
          console.log(`✅ Mention node ${mentionCount}:`, node.attrs)
        }
      })

      console.log(`📊 Total mentions parsed: ${mentionCount}`)

      const mentions = this.parseMentions(this.editor.getJSON())
      this.$emit("mentionedUsers", mentions)
      this.$emit("input")
      this.$emit("resize")

      return mentionCount > 0
    },

    // ========== METHOD: waitForEditor (NEW) ==========
    waitForEditor(timeout = 3000) {
      return new Promise((resolve) => {
        const startTime = Date.now()

        const checkEditor = () => {
          if (this.editor && this.editor.isEditable) {
            console.log("✅ Editor is ready")
            resolve(true)
            return
          }

          if (Date.now() - startTime > timeout) {
            console.error("❌ Editor timeout")
            resolve(false)
            return
          }

          setTimeout(checkEditor, 50)
        }

        checkEditor()
      })
    }
    ,

    // Thêm method để đợi editor ready
    rebuildContent(htmlContent) {
      if (!this.editor) {
        console.error("Editor not initialized")
        return false
      }

      console.log("Rebuilding content from HTML:", htmlContent)

      // Clear editor trước
      this.editor.commands.clearContent()

      // Parse HTML để extract mentions và text
      const parts = this.parseHTMLToParts(htmlContent)
      console.log("Parsed parts:", parts)

      // Insert từng part vào editor
      parts.forEach((part, index) => {
        if (part.type === "mention") {
          // Insert mention node
          this.editor.commands.insertContent({
            type: "mention",
            attrs: {
              id: part.id,
              label: part.label,
              author: part.author,
              type: part.mentionType || "user",
            },
          })
        } else if (part.type === "text") {
          // Insert text
          this.editor.commands.insertContent({
            type: "text",
            text: part.text,
          })
        }
      })

      const mentions = this.parseMentions(this.editor.getJSON())
      this.$emit("mentionedUsers", mentions)
      this.$emit("input")
      this.$emit("resize")

      return true
    },

    // Lock một mention cụ thể
    lockMention(mentionId) {
      this.lockedMentionId = mentionId
      console.log("🔒 Locked mention:", mentionId)
    },

    // Unlock mention
    unlockMention() {
      this.lockedMentionId = null
      console.log("🔓 Unlocked mention")
    },

    focus() {
      if (this.editor) {
        this.editor.commands.focus()
      }
    },
    clear() {
      if (this.editor) {
        this.editor.commands.clearContent()
        this.unlockMention() // Tự động unlock khi clear
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
:deep(.is-empty.is-editor-empty) {
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

.rich-comment-editor :deep(.ProseMirror p.is-editor-empty:first-child::before),
.rich-comment-editor :deep(.ProseMirror p.is-empty:first-child::before) {
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

.rich-comment-editor :deep(span[data-type="mention"]),
.rich-comment-editor :deep(span[data-type="user"]),
.rich-comment-editor :deep(span.mention) {
  background-color: rgba(59, 130, 246, 0.1) !important;
  color: #3b82f6 !important;
  border-radius: 4px;
  padding: 2px 4px;
  font-weight: 500;
  text-decoration: none;
  display: inline;
}
</style>
