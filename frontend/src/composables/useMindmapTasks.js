import { ref, computed, watch } from 'vue'
import { call } from 'frappe-ui'

export function useMindmapTasks() {
  const showTaskLinkModal = ref(false)
  const taskLinkNode = ref(null)
  const taskLinkMode = ref('existing')
  const taskSearch = ref('')
  const taskSearchInput = ref('')
  const selectedTaskId = ref(null)
  const taskLinkUrl = ref('')
  const taskProjectFilter = ref('all')
  const taskPage = ref(1)
  const TASK_PAGE_SIZE = 10
  const taskOptions = ref([])
  const taskPagination = ref({ page: 1, total_pages: 1, total: 0 })
  const taskLoading = ref(false)
  const taskProjectOptionMap = ref({})

  const fetchProjectOptions = async () => {
    try {
      const res = await call("drive.api.mindmap_task.get_my_projects")
      const projects = res?.data || []

      const nextMap = { ...(taskProjectOptionMap.value || {}) }
      projects.forEach(p => {
        if (p.name) {
          nextMap[p.name] = {
            label: p.project_name || p.name,
            project_name: p.project_name || p.name,
            end_date: p.end_date || null,
            need_approve: p.need_approve || false
          }
        }
      })
      taskProjectOptionMap.value = nextMap
    } catch (err) {
      console.error("Failed to fetch project options", err)
    }
  }

  const fetchTaskOptions = async ({ resetPage = false } = {}) => {
    if (resetPage) taskPage.value = 1
    taskLoading.value = true
    try {
      const res = await call("drive.api.mindmap_task.get_my_tasks", {
        project: taskProjectFilter.value !== 'all' ? taskProjectFilter.value : null,
        page: taskPage.value,
        page_size: TASK_PAGE_SIZE,
        search: taskSearch.value?.trim() || undefined
      })

      let list = []
      if (res?.message?.data) {
        list = res.message.data
      } else if (res?.data) {
        list = res.data
      } else if (Array.isArray(res)) {
        list = res
      }

      taskOptions.value = list.map(t => ({
        id: t.id,
        task_name: t.task_name || t.title || t.id,
        title: t.task_name || t.title || t.id,
        assignee: t.assignee || '',
        office_name: t.office_name || '',
        status: t.status_vi || t.status || '',
        project: t.project || null,
        project_name: t.project_name || t.project || null
      }))

      const nextMap = { ...(taskProjectOptionMap.value || {}) }
      taskOptions.value.forEach(t => {
        if (t.project) {
          nextMap[t.project] = t.project_name || t.project
        }
      })
      taskProjectOptionMap.value = nextMap

      let pag = {}
      if (res?.message?.pagination) {
        pag = res.message.pagination
      } else if (res?.pagination) {
        pag = res.pagination
      }
      taskPagination.value = {
        page: pag.page || taskPage.value,
        total_pages: pag.total_pages || 1,
        total: pag.total || taskOptions.value.length
      }

      if (!taskOptions.value.length) {
        selectedTaskId.value = null
      } else if (!selectedTaskId.value || !taskOptions.value.some(t => t.id === selectedTaskId.value)) {
        selectedTaskId.value = taskOptions.value[0].id
      }
    } catch (err) {
      console.error("Failed to fetch tasks", err)
      taskOptions.value = []
      taskPagination.value = { page: 1, total_pages: 1, total: 0 }
      selectedTaskId.value = null
    } finally {
      taskLoading.value = false
    }
  }

  const taskProjectOptions = computed(() => {
    return Object.entries(taskProjectOptionMap.value || {}).map(([value, data]) => {
      if (typeof data === 'object' && data !== null) {
        return {
          value,
          label: data.label || data.project_name || value,
          end_date: data.end_date || null,
          need_approve: data.need_approve !== undefined ? data.need_approve : false
        }
      }
      return {
        value,
        label: data || value,
        end_date: null,
        need_approve: false
      }
    })
  })

  const filteredTasksRaw = computed(() => taskOptions.value)
  const totalTaskPages = computed(() => taskPagination.value.total_pages || 1)
  const filteredTasks = computed(() => filteredTasksRaw.value)

  watch([() => taskProjectFilter.value, () => taskSearch.value], () => {
    taskPage.value = 1
    fetchTaskOptions({ resetPage: true })
  })

  watch(() => taskPage.value, () => {
    fetchTaskOptions()
  })

  watch(filteredTasks, (list) => {
    if (!list || list.length === 0) {
      selectedTaskId.value = null
      return
    }
    if (!selectedTaskId.value || !list.some(t => t.id === selectedTaskId.value)) {
      selectedTaskId.value = list[0].id
    }
  })

  watch(filteredTasksRaw, (list) => {
    if (!list || list.length === 0) {
      selectedTaskId.value = null
      return
    }
  })

  watch([filteredTasks, taskPage], ([list]) => {
    if (!list || list.length === 0) {
      selectedTaskId.value = null
      return
    }
    if (!selectedTaskId.value || !list.some(t => t.id === selectedTaskId.value)) {
      selectedTaskId.value = list[0].id
    }
  })

  let taskSearchDebounce
  watch(taskSearchInput, (val) => {
    if (taskSearchDebounce) clearTimeout(taskSearchDebounce)
    taskSearchDebounce = setTimeout(() => {
      taskSearch.value = val
    }, 350)
  })

  const setTaskPage = (page) => {
    const total = totalTaskPages.value
    if (page < 1) page = 1
    if (page > total) page = total
    if (page !== taskPage.value) {
      taskPage.value = page
    }
  }

  return {
    showTaskLinkModal,
    taskLinkNode,
    taskLinkMode,
    taskSearch,
    taskSearchInput,
    selectedTaskId,
    taskLinkUrl,
    taskProjectFilter,
    taskPage,
    TASK_PAGE_SIZE,
    taskOptions,
    taskPagination,
    taskLoading,
    taskProjectOptionMap,
    taskProjectOptions,
    filteredTasksRaw,
    totalTaskPages,
    filteredTasks,
    fetchProjectOptions,
    fetchTaskOptions,
    setTaskPage,
  }
}

