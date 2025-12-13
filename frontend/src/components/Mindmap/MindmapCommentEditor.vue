<script setup>
import { ref, watch, onMounted, onBeforeUnmount, defineExpose, computed } from "vue"
import { Editor, EditorContent } from "@tiptap/vue-3"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import { Mention } from './components/extensions/mention'
import { MentionSuggestion } from "./components/extensions/mention_suggestion"
import { ImageRow } from "./components/extensions/ImageRow"
// import { UploadImage } from "./components/extensions/UploadImage"
import Link from "@tiptap/extension-link"



const SafeImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            src: {
                default: null,
                renderHTML: attributes => {
                    if (!attributes.src) {
                        return {}
                    }
                    return { src: attributes.src }
                },
            },
        }
    },
})


const props = defineProps({
    currentUser: String,
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

const emit = defineEmits(["update:modelValue", "submit", "navigate", "open-gallery", "paste-images"])

const editor = ref(null)
const localInsertedImages = new Set()
const mentionMembers = ref(props.members || [])

const filteredMembers = computed(() => {
    if (!props.members) return []

    return props.members.filter(m =>
        m?.email && m.email !== props?.currentUser
    )
})


function handleEditorImageClick(e) {
    const img = e.target.closest("img")
    if (!img) return

    const root = editor.value?.view?.dom
    if (!root) return

    const images = Array.from(root.querySelectorAll("img")).map(
        i => i.src
    )

    const index = images.indexOf(img.src)
    if (index === -1) return

    emit("open-gallery", images, index)
}


onMounted(() => {
    editor.value = new Editor({
        content: props.modelValue || "",
        extensions: [
            StarterKit.configure({
                paragraph: { HTMLAttributes: { class: "text-[13px] text-black" } },
            }),
            SafeImage.configure({ inline: false }),
            ImageRow,
            Mention.configure({
                suggestion: MentionSuggestion({
                    getMembers: () => filteredMembers.value,
                    nodeId: props.nodeId
                })
            }),
            Link.configure({
                openOnClick: true,
                autolink: true,
                linkOnPaste: true,
                HTMLAttributes: {
                    class: "comment-link",
                    rel: "noopener noreferrer",
                    target: "_blank",
                },
            })

        ],
        autofocus: false,

        onUpdate({ editor }) {
            emit("update:modelValue", editor.getHTML())
        },

        editorProps: {
            handleKeyDown(view, event) {
                const isMentionOpen = editor.value?.storage?.__mentionOpen;

                if ((event.ctrlKey || event.metaKey) &&
                    ["c", "v", "x", "a"].includes(event.key.toLowerCase())) {
                    return false;
                }


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
                    const items = event.clipboardData?.items
                    if (!items) return false

                    const imageFiles = []

                    for (const item of items) {
                        if (item.type.startsWith("image/")) {
                            const blob = item.getAsFile()
                            if (blob) {
                                const file = new File(
                                    [blob],
                                    `paste-${Date.now()}.png`,
                                    { type: blob.type }
                                )
                                imageFiles.push(file)
                            }
                        }
                    }

                    if (!imageFiles.length) {
                        // không có ảnh → cho paste text bình thường
                        return false
                    }

                    event.preventDefault()

                    emit("paste-images", imageFiles, editor.value)
                    return true
                },
            }
        },

    })

    editor.value.view.dom.addEventListener("click", handleEditorImageClick)

    editor.value.view.scrollToSelection = () => { };

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
    mentionMembers.value = val || []
})

watch(
    () => props.previewImages.length,
    () => {
        if (!editor.value) return

        const newImages = props.previewImages.filter(
            src => !localInsertedImages.has(src)
        )

        if (!newImages.length) return

        editor.value.commands.insertImageRow(newImages)

        newImages.forEach(src => localInsertedImages.add(src))
    }
)


watch(
    () => props.modelValue,
    (val) => {
        if (!editor.value) return

        const current = editor.value.getHTML()

        if (val !== current) {
            editor.value.commands.setContent(val || "", false)
        }
    }
)


onBeforeUnmount(() => {
    if (editor.value) {
        editor.value.view.dom.removeEventListener(
            "click",
            handleEditorImageClick
        )
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
    <div class="rounded p-2 pr-0 editor-wrapper comment-editor-root" comment-editor-root>
        <div class="editor-content-flex">
            <EditorContent :editor="editor" class="tiptap-editor overflow-y-auto" />
        </div>
    </div>

</template>

<style scoped>
.tiptap-editor :deep(.image-row) {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 4px 0;
}


.editor-content-flex {
    display: flex;
    flex-direction: column;
}

.tiptap-editor :deep(p:has(img)) {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.tiptap-editor :deep(p:not(:has(img))) {
    display: block;
}

.tiptap-editor :deep(img) {
    display: inline-block;
    width: 62px;
    height: 62px;
    object-fit: cover;
    border-radius: 6px;
    cursor: zoom-in;
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

.tiptap-editor :deep(a.comment-link) {
    color: #2563eb;
    text-decoration: underline;
    cursor: pointer;
    word-break: break-all;
}

.tiptap-editor :deep(a.comment-link:hover) {
    color: #1d4ed8;
}
</style>
