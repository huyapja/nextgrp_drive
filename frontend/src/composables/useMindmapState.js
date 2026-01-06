import { ref, computed } from 'vue'

export function useMindmapState() {
  const isSaving = ref(false)
  const savingCount = ref(0)
  const lastSaved = ref(null)
  const selectedNode = ref(null)
  const changedNodeIds = ref(new Set())
  const hoveredNode = ref(null)
  const editingNode = ref(null)
  const nodeEditingUsers = ref(new Map())
  const lastBroadcastState = ref(new Map())
  const editingStartTime = ref(null)
  const isRendering = ref(true)
  const showPanel = ref(false)
  const activeCommentNode = ref(null)
  const commentPanelRef = ref(null)
  const commentInputValue = ref("")
  const isFromUI = ref(false)
  const isMindmapReady = ref(false)
  const toolbarRef = ref(null)
  const elements = ref([])
  const d3Container = ref(null)
  const currentView = ref('visual')
  const textViewVersion = ref(0)

  const showContextMenu = ref(false)
  const contextMenuPos = ref({ x: 0, y: 0 })
  const contextMenuNode = ref(null)
  const contextMenuCentered = ref(false)

  const permissions = ref({
    read: 0,
    write: 0,
    comment: 0,
    share: 0
  })

  const showPermissionModal = ref(false)
  const permissionModalTimer = ref(null)
  const permissionModalCountdown = ref(5)
  const permissionModalMessage = ref("")
  const cachedPermissionVersion = ref(null)

  const showExportDialog = ref(false)

  const nodes = computed(() => elements.value.filter(el => el.id && !el.source && !el.target))
  const edges = computed(() => elements.value.filter(el => el.source && el.target))

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return {
    isSaving,
    savingCount,
    lastSaved,
    selectedNode,
    changedNodeIds,
    hoveredNode,
    editingNode,
    nodeEditingUsers,
    lastBroadcastState,
    editingStartTime,
    isRendering,
    showPanel,
    activeCommentNode,
    commentPanelRef,
    commentInputValue,
    isFromUI,
    isMindmapReady,
    toolbarRef,
    elements,
    d3Container,
    currentView,
    textViewVersion,
    showContextMenu,
    contextMenuPos,
    contextMenuNode,
    contextMenuCentered,
    permissions,
    showPermissionModal,
    permissionModalTimer,
    permissionModalCountdown,
    permissionModalMessage,
    cachedPermissionVersion,
    showExportDialog,
    nodes,
    edges,
    formatTime,
  }
}

