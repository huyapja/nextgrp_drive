<template>
  <LoadingIndicator
    v-if="loading"
    class="w-10 h-full z-10 text-neutral-100 mx-auto"
  />
  <div
    v-else
    id="container"
    class="flex items-center justify-center w-full h-full overflow-auto"
  >
    <div
      v-if="previewEntity.mime_type === 'text/markdown'"
      class="markdown-body text-wrap bg-white sm:w-full md:w-4/5 h-[85vh] text-gray-800 text-sm border select-text p-3 font-mono overflow-x-auto overflow-y-auto"
    >
      <template v-for="(blobLine, index) in blob" :key="index">
        <component
          :is="'div'"
          :ref="focusedLine === index ? 'activeTextarea' : ''"
          contenteditable
          rows="1"
          v-html="focusedLine === index ? blobLine : markdownToHTML(blobLine)"
          class="block min-h-[24px] focus:ring-0 focus:outline-none p-0 border-none w-full resize-none text-wrap"
          @click="
            focusedLine === index
              ? ($event.target.style.height = $event.target.scrollHeight + 'px')
              : (focusedLine = index)
          "
          @v-on-outside-click="focusedLine = null"
          @keydown.up="
            ;(focusedLine -= 1), $event.target.previousSibling?.focus()
          "
          @keydown.down="console.log('hi'), (focusedLine += 1)"
          @keydown.meta="handleKeyBoard"
        />
      </template>
    </div>
    <pre
      v-else
      contenteditable
      class="focus:ring-0 focus:outline-none text-wrap bg-gray-50 sm:w-full md:w-2/3 h-[85vh] text-gray-800 text-sm border select-text p-3 font-mono overflow-x-auto overflow-y-auto"
      >{{ blob }}</pre
    >
  </div>
</template>

<script setup>
/* Consider adding https://codemirror.net/ and add a mimetype eval list for all possible mimetypes */

import { LoadingIndicator } from "frappe-ui"
import { onMounted, ref, watch, useTemplateRef, nextTick } from "vue"
import { markdownToHTML } from "@/utils/markdown"

const props = defineProps({
  previewEntity: Object,
})

const loading = ref(true)
const blob = ref(null)

const focusedLine = ref(null)
const offset = ref(0)
const activeTextarea = useTemplateRef("activeTextarea")

watch([activeTextarea, focusedLine], async ([k, _], [a, b]) => {
  // For some reason, focus is overriden to ~10 for the first click
  if (!(a && !b)) offset.value = window.getSelection().baseOffset
  if (k) {
    await nextTick()
    k[0].focus()
    k[0].selectionStart = offset.value
    k[0].selectionEnd = offset.value
  }
})

async function fetchContent() {
  loading.value = true
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
    "X-Frappe-Site-Name": window.location.hostname,
    Range: "bytes=0-10000000",
  }
  const res = await fetch(
    `/api/method/drive.api.files.get_file_content?entity_name=${props.previewEntity.name}`,
    {
      method: "GET",
      headers,
    }
  )
  if (res.ok) {
    let resBlob = await res.blob()
    if (props.previewEntity.mime_type === "text/markdown") {
      blob.value = (await resBlob.text()).split("\n")
    } else {
      blob.value = await resBlob.text()
    }

    loading.value = false
  }
}
watch(
  () => props.previewEntity,
  () => {
    fetchContent()
  }
)
onMounted(() => {
  fetchContent()
})

const handleKeyBoard = (e) => {
  if (!["i", "s", "b"].includes(e.key)) return
  const selection = window.getSelection()
  let [start, end] = [selection.baseOffset, selection.focusOffset]
  const node = selection.focusNode.parentElement
  const text = selection.focusNode.textContent
  const val = text.slice(start, end)

  let repl = val

  if (e.key === "b") {
    if (text.slice(start - 2, start) === "**") (start -= 2), (end += 2)
    else repl = "**" + val + "**"
  } else if (e.key === "i") {
    if (val[0] === "*" || val[0] == "_") repl = val.slice(1, -1)
    else repl = "_" + val + "_"
  }
  if (e.key === "s" && e.shiftKey) {
    if (val.slice(0, 2) === "~~") repl = val.slice(2, -2)
    else repl = "~~" + val + "~~"
  }

  if (repl) {
    e.preventDefault()
    e.stopPropagation()
    const oldVal = blob.value[focusedLine.value]
    blob.value[focusedLine.value] =
      oldVal.slice(0, start) + repl + oldVal.slice(end)
    setTimeout(() => {
      const range = createRange(node, {
        count: start + (repl.length - val.length) / 2 + val.length,
      })
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }, 40)
  }
}

function createRange(node, chars, range) {
  if (!range) {
    range = document.createRange()
    range.selectNode(node)
    range.setStart(node, 0)
  }

  if (chars.count === 0) {
    range.setEnd(node, chars.count)
  } else if (node && chars.count > 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.length < chars.count) {
        chars.count -= node.textContent.length
      } else {
        range.setEnd(node, chars.count)
        chars.count = 0
      }
    } else {
      for (var lp = 0; lp < node.childNodes.length; lp++) {
        range = createRange(node.childNodes[lp], chars, range)

        if (chars.count === 0) {
          break
        }
      }
    }
  }

  return range
}
</script>
<style>
@import "./markdown.css";
</style>
