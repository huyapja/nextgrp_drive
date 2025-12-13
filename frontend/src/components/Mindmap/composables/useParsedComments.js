import { computed } from "vue"

export function useParsedComments(groups) {
  function parseCommentHTML(html) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html || "", "text/html")

    const images = [...doc.querySelectorAll("img")].map(img => img.src)
    doc.querySelectorAll("img").forEach(img => img.remove())

    return {
      text: doc.body.innerHTML.trim(),
      images,
    }
  }

  function normalizeText(text) {
    if (!text) return ""

    return text
      .trim()
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n/g, "<br>")
  }

  const parsedGroups = computed(() =>
    groups.value.map(group => ({
      ...group,
      comments: group.comments.map(c => {
        const { text, images } = parseCommentHTML(
          c.parsed?.safe_html || c.parsed?.text
        )

        return {
          ...c,
          parsedText: normalizeText(text),
          parsedImages: images,
        }
      }),
    }))
  )

  return {
    parsedGroups,
  }
}
