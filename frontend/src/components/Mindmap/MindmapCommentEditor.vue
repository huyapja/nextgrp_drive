<script setup>
import { ref, watch, onMounted, onBeforeUnmount, defineExpose } from "vue"
import { Editor, EditorContent } from "@tiptap/vue-3"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import { Mention } from './components/extensions/mention'
import { MentionSuggestion } from "./components/extensions/mention_suggestion"


const props = defineProps({
    visible: Boolean,
    modelValue: {
        type: String,
        default: "",
    },
    previewImages: {
        type: Array,
        default: () => [],
    },
    members: { type: Array, default: () => [] },
    nodeId: String,
})

const emit = defineEmits(["update:modelValue", "submit", "navigate"])

const editor = ref(null)
const localInsertedImages = new Set()
const mentionMembers = ref(props.members || [])



onMounted(() => {
    editor.value = new Editor({
        content: props.modelValue || "",
        extensions: [
            StarterKit.configure({
                paragraph: { HTMLAttributes: { class: "text-[13px] text-black" } },
            }),
            Image.configure({ inline: true }),
            Mention.configure({
                suggestion: MentionSuggestion({
                    getMembers: () => mentionMembers.value,
                    nodeId: props.nodeId
                })
            })
        ],
        autofocus: false,

        onUpdate({ editor }) {
            emit("update:modelValue", editor.getHTML())
        },

        editorProps: {
            handleKeyDown(view, event) {
                const isMentionOpen = editor.value?.storage?.__mentionOpen;

                if (isMentionOpen) {
                    return false;
                }

                if (event.key === "ArrowDown") {
                    event.preventDefault()

                    emit("navigate", "next")

                    editor.value?.commands.blur()

                    return true
                }

                if (event.key === "ArrowUp") {
                    event.preventDefault()

                    emit("navigate", "prev")

                    editor.value?.commands.blur()

                    return true
                }

                if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    emit("submit")
                    return true
                }

                return false
            },

            handleDOMEvents: {
                paste(view, event) {
                    event.stopPropagation()
                    return false
                },
            }
        },

    })

    editor.value.on("focus", () => {
        window.__EDITOR_FOCUSED__ = true
    })

    editor.value.on("blur", () => {
        window.__EDITOR_FOCUSED__ = false
    })

    if (!window.__ALL_EDITORS__) window.__ALL_EDITORS__ = []
    window.__ALL_EDITORS__.push(editor.value)
})


watch(() => props.members, (val) => {
    console.log(val);

    mentionMembers.value = val || []
})

watch(
    () => props.previewImages.length,
    () => {
        const list = props.previewImages
        if (!editor.value) return

        list.forEach((url) => {
            if (!localInsertedImages.has(url)) {
                editor.value.chain().focus().setImage({ src: url }).run()
                localInsertedImages.add(url)
            }
        })
    }
)


watch(
    () => props.modelValue,
    (val) => {
        if (!editor.value) return

        const current = editor.value.getHTML()

        // 🚀 Chỉ cập nhật nếu thay đổi từ bên ngoài, không phải do self-update
        if (val !== current) {
            editor.value.commands.setContent(val || "", false)
        }
    }
)


onBeforeUnmount(() => {
    if (editor.value) {
        editor.value.destroy()
        editor.value = null
    }
    if (window.__ALL_EDITORS__) {
        window.__ALL_EDITORS__ = window.__ALL_EDITORS__.filter(
            (ed) => ed !== editor.value
        )
    }
})

defineExpose({
    focus() {
        if (!editor.value) return
        editor.value?.view?.focus()
    },

    blur() {
        editor.value?.view?.dom?.blur()
    },
    clearImages() {
        localInsertedImages.clear()
    },
    clearValues() {
        editor.value?.commands.setContent("", false)
        localInsertedImages.clear()
        emit("update:modelValue", "")
    },
})

</script>

<template>
    <div class="rounded p-2 editor-wrapper comment-editor-root" comment-editor-root>
        <EditorContent :editor="editor" class="tiptap-editor overflow-y-auto" />
    </div>

</template>

<style scoped>
.tiptap-editor :deep(img) {
    max-width: 120px;
    border-radius: 6px;
    margin: 4px;
}

.tiptap-editor :deep(span[data-mention]) {
    background-color: #e7f3ff;
    color: #0b63c4;
    padding: 0px 4px;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
}
</style>
