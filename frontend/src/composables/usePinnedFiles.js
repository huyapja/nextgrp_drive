import { call } from 'frappe-ui'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'

export function usePinnedFiles() {
  const store = useStore()
  const router = useRouter()

  const pinnedFiles = computed(() => store.state.pinnedFiles)
  const currentPinnedFile = computed(() => store.state.currentPinnedFile)
  const showPinnedSidebar = computed(() => store.state.showPinnedSidebar)

  const isPinned = (fileName) => {
    return pinnedFiles.value.some(f => f.name === fileName)
  }

  // Load pinned files from server
  const loadPinnedFiles = async () => {
    try {
      const files = await call('drive.api.pinned_files.get_pinned_files')
      store.commit('setPinnedFiles', files || [])
      return files
    } catch (error) {
      console.error('Error loading pinned files:', error)
      return []
    }
  }

  const pinFile = async (file) => {
    try {
      console.log('Pinning file:', file)
      const result = await call('drive.api.pinned_files.pin_file', {
        entity_name: file.name
      })
      
      console.log('Pin result:', result)
      
      if (result && result.success) {
        // Update local state
        store.commit('addPinnedFile', {
          name: file.name,
          title: file.title || file.file_name || file.name,
          is_group: file.is_group,
          mime_type: file.mime_type,
          modified: file.modified,
          owner: file.owner,
        })
        
        // Send message to parent window (MTP) to update RecentFilesDropdown
        if (window.parent && window.parent !== window) {
          try {
            const fileInfo = {
              name: file.name,
              title: file.title || file.file_name || file.name,
              mime_type: file.mime_type,
              file_ext: file.file_ext || '',
              modified: file.modified,
              owner: file.owner,
              is_group: file.is_group,
              team: file.team,
            }
            
            console.log('📤 [Drive] Sending file_pinned message to parent:', fileInfo)
            window.parent.postMessage({
              type: 'drive:file_pinned',
              payload: fileInfo
            }, '*')
          } catch (error) {
            console.warn('Cannot send file_pinned message to parent:', error)
          }
        }
      } else {
        console.error('Pin failed:', result?.message || 'Unknown error')
      }
      return result
    } catch (error) {
      console.error('Error pinning file:', error)
      return {
        success: false,
        message: error.message || 'Unknown error'
      }
    }
  }

  const unpinFile = async (fileName) => {
    try {
      console.log('Unpinning file:', fileName)
      const result = await call('drive.api.pinned_files.unpin_file', {
        entity_name: fileName
      })
      
      console.log('Unpin result:', result)
      
      if (result && result.success) {
        // Update local state
        store.commit('removePinnedFile', fileName)
        
        // If we're currently viewing this file, close it
        if (currentPinnedFile.value?.name === fileName) {
          closePinnedFile()
        }
        
        // Send message to parent window (MTP) to update RecentFilesDropdown
        if (window.parent && window.parent !== window) {
          try {
            console.log('📤 [Drive] Sending file_unpinned message to parent:', fileName)
            window.parent.postMessage({
              type: 'drive:file_unpinned',
              payload: { name: fileName }
            }, '*')
          } catch (error) {
            console.warn('Cannot send file_unpinned message to parent:', error)
          }
        }
      } else {
        console.error('Unpin failed:', result?.message || 'Unknown error')
      }
      return result
    } catch (error) {
      console.error('Error unpinning file:', error)
      return {
        success: false,
        message: error.message || 'Unknown error'
      }
    }
  }

  const openPinnedFile = (file) => {
    // Navigate to the file's route based on its type
    if (file.is_group) {
      // Navigate to folder
      router.push({
        name: 'Folder',
        params: { entityName: file.name }
      })
    } else if (file.mime_type === 'mindmap') {
      // Navigate to mindmap
      router.push({
        name: 'MindMap',
        params: { entityName: file.name }
      })
    } else if (file.mime_type && (
      file.mime_type.includes('document') ||
      file.mime_type.includes('spreadsheet') ||
      file.mime_type.includes('presentation') ||
      file.mime_type === 'application/pdf'
    )) {
      // Navigate to document viewer
      router.push({
        name: 'Document',
        params: { entityName: file.name }
      })
    } else {
      // Navigate to file view
      router.push({
        name: 'File',
        params: { entityName: file.name }
      })
    }
  }

  const closePinnedFile = () => {
    store.commit('setCurrentPinnedFile', null)
    store.commit('setShowPinnedSidebar', false)
  }

  const togglePin = async (file) => {
    if (isPinned(file.name)) {
      return await unpinFile(file.name)
    } else {
      return await pinFile(file)
    }
  }

  return {
    pinnedFiles,
    currentPinnedFile,
    showPinnedSidebar,
    isPinned,
    pinFile,
    unpinFile,
    openPinnedFile,
    closePinnedFile,
    togglePin,
    loadPinnedFiles,
  }
}

