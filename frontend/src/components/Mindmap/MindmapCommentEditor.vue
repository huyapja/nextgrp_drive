<script setup>
import { ref, watch, onMounted, onBeforeUnmount, defineExpose, computed, nextTick } from "vue"
import { Editor, EditorContent } from "@tiptap/vue-3"
import StarterKit from "@tiptap/starter-kit"
import { Mention } from './components/extensions/mention'
import { MentionSuggestion } from "./components/extensions/mention_suggestion"
import { ImageRow } from "./components/extensions/ImageRow"
import Link from "@tiptap/extension-link"
import Placeholder from '@tiptap/extension-placeholder'
import { RemovableImage } from "./components/extensions/RemovableImage"
import { NodeSelection } from "prosemirror-state"
import { TextSelection } from "prosemirror-state"


function isImageNode(node) {
    return (
        node.type.name === "image" ||
        node.type.name === "imageRow"
    )
}

function deleteTextOnly(view) {
    const { state, dispatch } = view
    const { selection, doc } = state
    const { from, to } = selection

    let tr = state.tr
    const rangesToDelete = []

    doc.nodesBetween(from, to, (node, pos) => {
        if (isImageNode(node)) return false

        if (node.isText) {
            const start = Math.max(pos, from)
            const end = Math.min(pos + node.nodeSize, to)
            if (end > start) {
                rangesToDelete.push({ from: start, to: end })
            }
        }
    })

    if (!rangesToDelete.length) return false

    // xoá text từ phải sang trái
    rangesToDelete
        .sort((a, b) => b.from - a.from)
        .forEach(r => tr.delete(r.from, r.to))

    // ép selection về caret đơn (xoá selection xanh)
    const safePos = Math.min(
        tr.doc.content.size,
        tr.mapping.map(from)
    )

    tr.setSelection(
        TextSelection.near(tr.doc.resolve(safePos))
    )

    if (!editor.value?.storage?.__isInitializing) {
        dispatch(tr.scrollIntoView())
    }
    return true
}



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
    placeholder: {
        type: String,
        default: "Thêm nhận xét"
    }
})

const emit = defineEmits(["update:modelValue", "submit", "navigate", "open-gallery", "paste-images", "focus", "blur"])

const editor = ref(null)
const localInsertedImages = new Set()
const mentionMembers = ref(props.members || [])
const hasInitialized = ref(false)

const filteredMembers = computed(() => {
    if (!props.members) return []

    return props.members.filter(m =>
        m?.email && m.email !== props?.currentUser
    )
})

onMounted(() => {
    editor.value = new Editor({
        content: props.modelValue || "",
        onTransaction({ transaction, editor }) {
            if (editor.storage.__isInitializing) return
            const uiEvent = transaction.getMeta("uiEvent")

            // Trường hợp gõ @ trực tiếp
            if (uiEvent?.type === "input" && uiEvent?.data === "@") {
                editor.storage.__mentionUserTriggered = true
                return
            }
        },
        extensions: [
            StarterKit.configure({
                orderedList: false,
                bulletList: false,
                paragraph: { HTMLAttributes: { class: "text-[13px] text-black" } },
            }),
            RemovableImage.configure({ inline: false }),
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
            }),
            Placeholder.configure({
                placeholder: () => props.placeholder,  // dynamic theo node
                includeChildren: false,
            }),
        ],
        autofocus: false,

        onUpdate({ editor }) {
            emit("update:modelValue", editor.getHTML())
        },

        editorProps: {
            handleKeyDown(view, event) {

                if (!editor.value?.storage?.__isInitializing && event.key === "@") {
                    editor.value.storage.__mentionUserTriggered = true
                }
                const isMentionOpen = editor.value?.storage?.__mentionOpen;
                const { state } = view
                const { selection } = state


                if (
                    (event.key === "Backspace" || event.key === "Delete") &&
                    !selection.empty
                ) {
                    // nếu selection có image → xoá text thôi
                    let hasImage = false
                    state.doc.nodesBetween(selection.from, selection.to, node => {
                        if (isImageNode(node)) {
                            hasImage = true
                            return false
                        }
                    })

                    if (hasImage) {
                        event.preventDefault()
                        return deleteTextOnly(view)
                    }
                }

                if (
                    (event.key === "Backspace" || event.key === "Delete") &&
                    selection instanceof NodeSelection
                ) {
                    const node = selection.node
                    if (
                        node.type.name === "image" ||
                        node.type.name === "imageRow"
                    ) {
                        event.preventDefault()
                        return true // ⛔ chặn hoàn toàn
                    }
                }

                if ((event.ctrlKey || event.metaKey) &&
                    ["c", "v", "x", "a"].includes(event.key.toLowerCase())) {
                    return false;
                }


                if (
                    isMentionOpen &&
                    ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)
                ) {
                    return false
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

    editor.value.storage.__isInitializing = true

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            editor.value.storage.__isInitializing = false
        })
    })

    editor.value.view.scrollToSelection = () => { };

    editor.value.on("focus", () => {
        window.__EDITOR_FOCUSED__ = true
    })

    editor.value.on("blur", () => {
        window.__EDITOR_FOCUSED__ = false
        editor.value.storage.__mentionUserTriggered = false
    })

    editor.value.on("focus", () => emit("focus"));
    editor.value.on("blur", () => emit("blur"));

    editor.value.on("remove-image", (src) => {
        emit("update:previewImages", prev =>
            prev.filter(i => i !== src)
        )
        localInsertedImages.delete(src)
    })

    editor.value.on("open-gallery", ({ images, index }) => {
        emit("open-gallery", images, index)
    })

    if (!window.__ALL_EDITORS__) window.__ALL_EDITORS__ = []
    window.__ALL_EDITORS__.push(editor.value)
})


watch(() => props.members, (val) => {
    mentionMembers.value = val || []
})

watch(
    () => props.previewImages.length,
    async (images) => {
        if (!editor.value) return

        if (images.length === 0) {
            localInsertedImages.clear()
            return
        }

        const newImages = props.previewImages.filter(
            src => !localInsertedImages.has(src)
        )
        if (!newImages.length) return

        editor.value.commands.command(({ tr, state }) => {
            const { doc, schema } = state

            /* =====================================================
             * 1️⃣ APPEND ẢNH VÀO imageRow HOẶC TẠO MỚI
             * ===================================================== */

            let inserted = false

            doc.descendants((node, pos) => {
                if (node.type.name === "imageRow" && !inserted) {
                    const images = newImages.map(src =>
                        schema.nodes.image.create({ src })
                    )
                    tr.insert(pos + node.nodeSize - 1, images)
                    inserted = true
                    return false
                }
            })

            if (!inserted) {
                const images = newImages.map(src =>
                    schema.nodes.image.create({ src })
                )
                const row = schema.nodes.imageRow.create({}, images)
                tr.insert(tr.selection.from, row)
            }

            /* =====================================================
             * 2️⃣ TÌM LẠI imageRow TRONG tr.doc (SAU KHI INSERT)
             * ===================================================== */

            let imageRowPos = null
            let imageRowNode = null

            tr.doc.descendants((node, pos) => {
                if (node.type.name === "imageRow") {
                    imageRowPos = pos
                    imageRowNode = node
                }
            })

            if (!imageRowNode) return true

            /* =====================================================
             * 3️⃣ ĐẢM BẢO CÓ paragraph NGAY TRƯỚC imageRow
             * ===================================================== */

            let paragraphPos = null

            tr.doc.descendants((node, pos) => {
                if (node.type.name === "paragraph" && pos + node.nodeSize === imageRowPos) {
                    paragraphPos = pos
                }
            })

            if (paragraphPos == null) {
                const p = schema.nodes.paragraph.create()
                tr.insert(imageRowPos, p)
                paragraphPos = imageRowPos
            }

            /* =====================================================
             * 4️⃣ ĐẶT CARET VÀO CUỐI paragraph (NHẤP NHÁY TRÊN ẢNH)
             * ===================================================== */

            const paragraphNode = tr.doc.nodeAt(paragraphPos)
            if (!paragraphNode) return true

            const caretPos =
                paragraphPos + paragraphNode.nodeSize - 1

            tr.setSelection(
                TextSelection.create(tr.doc, caretPos)
            )

            return true
        })

        newImages.forEach(src => localInsertedImages.add(src))

        // 3️⃣ focus lại editor
        await nextTick()
        editor.value.commands.focus()
    }
)


const isSyncing = ref(false)

watch(
    () => props.modelValue,
    (val) => {
        if (!editor.value) return
        if (isSyncing.value) return

        const next = val || ""
        const current = editor.value.getHTML()

        // tránh setContent vô hạn vòng lặp
        if (current === next) return

        isSyncing.value = true
        editor.value.commands.setContent(next, false)
        queueMicrotask(() => (isSyncing.value = false))
    },
    { immediate: true }
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
    editor,
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
        if (!editor.value) return

        editor.value.commands.clearContent(true) // clear chuẩn nhất
        localInsertedImages.clear()

        // modelValue phải được set về "" từ parent, không emit 2 chiều kiểu này nữa
        emit("update:modelValue", "")
    },
    insertMention({ id, label }) {
        if (!editor.value) return;

        const view = editor.value.view;
        const state = view.state;
        const tr = state.tr;
        const { schema } = state;

        const paragraph = state.doc.firstChild;
        const firstChild = paragraph?.firstChild;

        // -----------------------------
        // 1️⃣ Nếu token đầu tiên là mention → XOÁ MENTION CŨ
        // -----------------------------
        if (firstChild?.type.name === "mention") {
            const from = 1;
            const to = 1 + firstChild.nodeSize;

            tr.delete(from, to);
        }

        // -----------------------------
        // 2️⃣ CHÈN LẠI MENTION MỚI VỀ ĐẦU DOCUMENT
        // -----------------------------
        const mentionNode = schema.nodes.mention.create({ id, label });
        const space = schema.text(" ");

        // insert vào vị trí 1 (bên trong paragraph)
        tr.insert(1, mentionNode);
        tr.insert(1 + mentionNode.nodeSize, space);

        // -----------------------------
        // 3️⃣ Đặt caret ngay sau space
        // -----------------------------
        const pos = 1 + mentionNode.nodeSize + space.nodeSize;

        tr.setSelection(
            state.selection.constructor.near(tr.doc.resolve(pos))
        );

        view.dispatch(tr);
        view.focus();
    },
})

const isTextEmpty = computed(() => {
    if (!editor.value) return true

    const doc = editor.value.state.doc
    let hasText = false

    doc.descendants(node => {
        if (node.isText && node.text?.trim()) {
            hasText = true
            return false
        }
    })

    return !hasText
})


</script>

<template>
    <div class="rounded p-2 pr-0 editor-wrapper comment-editor-root" comment-editor-root>
        <div class="editor-content-flex">
            <EditorContent :data-placeholder="props.placeholder" :editor="editor" :class="[
                'tiptap-editor overflow-y-auto',
                isTextEmpty ? 'text-empty' : ''
            ]" />

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

.text-empty :deep(p:first-child)::before {
    content: attr(data-placeholder);
    color: #9ca3af;
    pointer-events: none;
    float: left;
    height: 0;
}
</style>
