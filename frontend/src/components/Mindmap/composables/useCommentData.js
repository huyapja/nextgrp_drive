import { reactive } from "vue"
import { call } from "frappe-ui"

const commentGate = reactive({
  loaded: false,
  loading: false,
  data: []
})

export function useMindmapCommentGate(entityName) {
  async function open() {
    if (commentGate.loaded || commentGate.loading) return

    commentGate.loading = true
    try {
      const res = await call(
        "drive.api.mindmap_comment.get_comments",
        { mindmap_id: entityName }
      )
      commentGate.data = res || []
      commentGate.loaded = true
    } finally {
      commentGate.loading = false
    }
  }

  return {
    commentGate,
    open
  }
}
