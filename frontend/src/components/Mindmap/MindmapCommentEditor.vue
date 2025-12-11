<script setup>
import { ref, watch, onMounted, onBeforeUnmount, defineExpose } from "vue"
import { Editor, EditorContent } from "@tiptap/vue-3"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"

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
})

const emit = defineEmits(["update:modelValue", "submit", "navigate"])

const editor = ref(null)
const localInsertedImages = new Set()

onMounted(() => {
    editor.value = new Editor({
        content: props.modelValue || "",
        extensions: [
            StarterKit.configure({
                paragraph: { HTMLAttributes: { class: "text-[13px] text-black" } },
            }),
            Image.configure({ inline: true }),
        ],
        autofocus: false,

        onUpdate({ editor }) {
            emit("update:modelValue", editor.getHTML())
        },

        editorProps: {
            handleKeyDown(view, event) {
                event.stopPropagation()

                // ✅ Arrow Down → chuyển node kế tiếp + BỎ FOCUS EDITOR
                if (event.key === "ArrowDown") {
                    event.preventDefault()

                    emit("navigate", "next")

                    
                    // ✅ blur editor để ngừng bắt phím
                     editor.value?.commands.blur()

                    return true
                }

                // ✅ Arrow Up → chuyển node trước + BỎ FOCUS EDITOR
                if (event.key === "ArrowUp") {
                    event.preventDefault()

                    emit("navigate", "prev")

                    // ✅ blur editor để ngừng bắt phím
                     editor.value?.commands.blur()

                    return true
                }

                // ✅ Enter → Submit (KHÔNG xuống dòng)
                if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    emit("submit")
                    return true
                }

                // ✅ Shift + Enter → xuống dòng bình thường
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
})

watch(
    () => props.previewImages,
    (list = []) => {
        if (!editor.value) return

        list.forEach((url) => {
            if (localInsertedImages.has(url)) return

            editor.value.chain().focus().setImage({ src: url }).run()
            localInsertedImages.add(url)
        })
    },
    { deep: true }
)

watch(
    () => props.modelValue,
    (val) => {
        if (!editor.value) return

        const current = editor.value.getHTML()

        if (
            (!current && val) ||
            (val === "" && current)
        ) {
            editor.value.commands.setContent(val || "", false)
            localInsertedImages.clear()
        }
    },
    { immediate: true }
)

onBeforeUnmount(() => {
    if (editor.value) {
        editor.value.destroy()
        editor.value = null
    }
})

defineExpose({
  focus() {
    if (!editor.value) return

    // ✅ Focus đúng ProseMirror view
    editor.value?.view?.focus()
  },

  blur() {
    editor.value?.view?.dom?.blur()
  },
})

</script>

<template>
    <!-- ✅ TÁCH ROOT RIÊNG → MINDMAP KHÔNG CAN THIỆP -->
    <div class="border rounded p-2 editor-wrapper comment-editor-root" comment-editor-root>
        <EditorContent v-if="editor" :editor="editor" class="tiptap-editor overflow-y-auto" />
    </div>

</template>

<style scoped>
.comment-editor-root {
    isolation: isolate;
    /* ✅ NGĂN CSS & DOM BLEED */
}

.tiptap-editor :deep(img) {
    max-width: 120px;
    border-radius: 6px;
    margin: 4px;
}
</style>
