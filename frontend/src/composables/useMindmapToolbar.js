import { call } from 'frappe-ui'
import { toast } from '@/utils/toasts'

export function useMindmapToolbar({ 
  d3Renderer,
  nodes,
  edges,
  nodeCreationOrder,
  saveSnapshot,
  scheduleSave
}) {
  const getRenderer = () => {
    return typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
  }
  
  const applyStrikethroughToTitle = (editor, isCompleted) => {
    if (!editor) return

    const { state } = editor.view
    const { doc, schema } = state

    const titleRanges = []

    doc.descendants((node, pos) => {
      if (node.isText) {
        const resolvedPos = state.doc.resolve(pos)
        let inBlockquote = false

        for (let i = resolvedPos.depth; i > 0; i--) {
          const nodeAtDepth = resolvedPos.node(i)
          if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
            inBlockquote = true
            break
          }
        }

        if (!inBlockquote) {
          titleRanges.push({ from: pos, to: pos + node.nodeSize })
        }
      }
    })

    if (titleRanges.length > 0) {
      let tr = state.tr
      const strikeMark = schema.marks.strike || schema.marks.s

      if (strikeMark) {
        titleRanges.forEach(({ from, to }) => {
          if (isCompleted) {
            tr = tr.addMark(from, to, strikeMark.create())
          } else {
            tr = tr.removeMark(from, to, strikeMark.create())
          }
        })

        editor.view.dispatch(tr)
      }
    }
  }

  const handleToolbarDone = async (node) => {
    if (!node || !node.id || node.id === 'root') return

    const taskLink = node.data?.taskLink
    if (taskLink?.taskId) {
      try {
        const taskStatus = await call("drive.api.mindmap_task.get_task_status", {
          task_id: taskLink.taskId
        })

        if (!taskStatus || !taskStatus.exists) {
          const { taskLink: removedTaskLink, ...restData } = node.data
          node.data = restData

          const isCompleted = !node.data?.completed
          if (!node.data) node.data = {}
          node.data.completed = isCompleted

          const renderer = getRenderer()
          const editorInstance = renderer?.getEditorInstance?.(node.id)
          if (editorInstance) {
            applyStrikethroughToTitle(editorInstance, isCompleted)
          }

          if (renderer) {
            renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
            renderer.render()
          }
          saveSnapshot()
          scheduleSave()
          return
        }

        const isTaskCancelled = taskStatus.status === "Cancel" || taskStatus.status === "Cancelled" || taskStatus.status_vi === "Hủy"

        if (isTaskCancelled) {
          const isCompleted = !node.data?.completed
          if (!node.data) node.data = {}
          node.data.completed = isCompleted

          const renderer2 = getRenderer()
          const editorInstance = renderer2?.getEditorInstance?.(node.id)
          if (editorInstance) {
            applyStrikethroughToTitle(editorInstance, isCompleted)
          }

          if (renderer2) {
            renderer2.setData(nodes.value, edges.value, nodeCreationOrder.value)
            renderer2.render()
          }
          saveSnapshot()
          scheduleSave()
          return
        }

        const isTaskCompleted = taskStatus.is_completed || taskStatus.status === "Completed" || taskStatus.status_vi === "Hoàn thành"

        if (!isTaskCompleted) {
          toast({
            title: "Công việc chưa hoàn thành. Nhánh sẽ tự chuyển sang Hoàn thành khi công việc được kéo sang trạng thái Hoàn thành.",
            description: "",
            indicator: "orange",
            duration: 5000
          })
          return
        }

        const currentCompleted = node.data?.completed || false
        const newCompleted = !currentCompleted

        if (currentCompleted && isTaskCompleted) {
          toast({
            title: "Không thể bỏ hoàn thành nhánh vì công việc đã hoàn thành",
            description: "Nhánh này đã được tự động hoàn thành khi công việc hoàn thành. Để bỏ hoàn thành, vui lòng thay đổi trạng thái công việc.",
            indicator: "orange",
            duration: 5000
          })
          return
        }

        if (!node.data) node.data = {}
        node.data.completed = newCompleted

        const renderer3 = getRenderer()
        const editorInstance = renderer3?.getEditorInstance?.(node.id)
        if (editorInstance) {
          applyStrikethroughToTitle(editorInstance, newCompleted)
        }

        if (renderer3) {
          renderer3.setData(nodes.value, edges.value, nodeCreationOrder.value)
          renderer3.render()
        }
        saveSnapshot()
        scheduleSave()
        return

      } catch (error) {
        console.error("Error checking task status:", error)
        toast({
          title: "Không thể kiểm tra trạng thái công việc",
          indicator: "orange"
        })
      }
    }

    const isCompleted = !node.data?.completed

    if (!node.data) node.data = {}
    node.data.completed = isCompleted

    const renderer4 = getRenderer()
    const editorInstance = renderer4?.getEditorInstance?.(node.id)
    if (editorInstance) {
      applyStrikethroughToTitle(editorInstance, isCompleted)
    }

    if (renderer4) {
      renderer4.setData(nodes.value, edges.value, nodeCreationOrder.value)
      renderer4.render()
    }

    saveSnapshot()
    scheduleSave()
  }

  return {
    handleToolbarDone,
    applyStrikethroughToTitle,
  }
}

