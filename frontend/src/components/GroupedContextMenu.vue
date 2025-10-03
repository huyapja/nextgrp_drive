<template>
  <ContextMenu
    ref="contextMenu"
    :model="groupedMenuItems"
    :pt="{
      root: {
        class: 'min-w-[220px] rounded-lg shadow-lg border border-[#E5E5E5] bg-white'
      },
      menu: {
        class: 'py-1'
      }
    }"
  />
</template>

<script setup>
import ContextMenu from 'primevue/contextmenu'
import { computed, ref } from 'vue'
import { useStore } from 'vuex'

const props = defineProps({
  actionItems: {
    type: Array,
    default: () => []
  },
  event: Object,
  close: Function
})

const contextMenu = ref(null)
const store = useStore()

// Định nghĩa các nhóm action theo cấu trúc như trong hình
const actionGroups = {
  preview: {
    label: 'Xem trước',
    icon: 'pi pi-eye',
    color: '#f0fdf4',
    borderColor: '#22c55e',
    textColor: '#15803d'
  },
  share: {
    label: 'Chia sẻ',
    icon: 'pi pi-share-alt',
    color: '#fefce8',
    borderColor: '#eab308',
    textColor: '#a16207'
  },
  organize: {
    label: 'Sắp xếp',
    icon: 'pi pi-sort-alt',
    color: '#f0fdf4',
    borderColor: '#22c55e',
    textColor: '#15803d'
  },
  download: {
    label: 'Tải xuống',
    icon: 'pi pi-download',
    color: '#fef2f2',
    borderColor: '#ef4444',
    textColor: '#dc2626'
  },
  info: {
    label: 'Thông tin',
    icon: 'pi pi-info-circle',
    color: '#eff6ff',
    borderColor: '#3b82f6',
    textColor: '#1d4ed8'
  },
  delete: {
    label: 'Xóa',
    icon: 'pi pi-trash',
    color: '#fff7ed',
    borderColor: '#f97316',
    textColor: '#ea580c'
  }
}

// Helper function để đóng menu
const closeMenu = () => {
  if (contextMenu.value) {
    contextMenu.value.hide()
  }
  if (props.close) {
    props.close()
  }
}

// Tạo menu items với styling theo nhóm dựa trên actionItems thực tế
const groupedMenuItems = computed(() => {
  if (!props.actionItems || props.actionItems.length === 0) {
    return []
  }
  
  const items = []
  
  // Nhóm Preview (Xem trước/Mở)
  const previewItems = props.actionItems.filter(item => 
    item.label?.includes('Xem') || item.label?.includes('Mở')
  )
  if (previewItems.length > 0) {
    const item = previewItems[0]
    items.push({
      label: actionGroups.preview.label,
      icon: actionGroups.preview.icon,
      command: () => {
        item.action([store.state.activeEntity])
        closeMenu()
      },
      template: 'groupedItem',
      groupData: actionGroups.preview
    })
  }
  
  // Nhóm Share (Chia sẻ, Chuyển quyền, Sao chép liên kết)
  const shareItems = props.actionItems.filter(item => 
    item.label?.includes('Chia sẻ') || 
    item.label?.includes('Chuyển') || 
    item.label?.includes('Sao chép liên kết')
  )
  if (shareItems.length > 0) {
    const shareSubItems = shareItems.map(item => ({
      label: item.label,
      icon: item.icon,
      command: () => {
        item.action([store.state.activeEntity])
        closeMenu()
      }
    }))
    
    items.push({
      label: actionGroups.share.label,
      icon: actionGroups.share.icon,
      items: shareSubItems,
      template: 'groupedItem',
      groupData: actionGroups.share
    })
  }
  
  // Nhóm Organize (Di chuyển, Tạo lối tắt, Tạo bản sao, Yêu thích)
  const organizeItems = props.actionItems.filter(item => 
    item.label?.includes('Di chuyển') || 
    item.label?.includes('Tạo lối tắt') || 
    item.label?.includes('Bỏ lối tắt') ||
    item.label?.includes('Tạo bản sao') || 
    item.label?.includes('Yêu thích') ||
    item.label?.includes('Bỏ yêu thích') ||
    item.label?.includes('Xóa khỏi gần đây')
  )
  if (organizeItems.length > 0) {
    const organizeSubItems = organizeItems.map(item => ({
      label: item.label,
      icon: item.icon,
      class: item.class,
      command: () => {
        item.action([store.state.activeEntity])
        closeMenu()
      }
    }))
    
    items.push({
      label: actionGroups.organize.label,
      icon: actionGroups.organize.icon,
      items: organizeSubItems,
      template: 'groupedItem',
      groupData: actionGroups.organize
    })
  }
  
  // Nhóm Download (Tải xuống)
  const downloadItems = props.actionItems.filter(item => 
    item.label?.includes('Tải xuống')
  )
  if (downloadItems.length > 0) {
    const item = downloadItems[0]
    items.push({
      label: actionGroups.download.label,
      icon: actionGroups.download.icon,
      command: () => {
        item.action([store.state.activeEntity])
        closeMenu()
      },
      template: 'groupedItem',
      groupData: actionGroups.download
    })
  }
  
  // Nhóm Info (Thông tin, Đổi tên)
  const infoItems = props.actionItems.filter(item => 
    item.label?.includes('Thông tin') || 
    item.label?.includes('Đổi tên') ||
    item.label?.includes('Hiển thị thông tin') ||
    item.label?.includes('Ẩn thông tin')
  )
  if (infoItems.length > 0) {
    const infoSubItems = infoItems.map(item => ({
      label: item.label,
      icon: item.icon,
      command: () => {
        item.action([store.state.activeEntity])
        closeMenu()
      }
    }))
    
    items.push({
      label: actionGroups.info.label,
      icon: actionGroups.info.icon,
      items: infoSubItems,
      template: 'groupedItem',
      groupData: actionGroups.info
    })
  }
  
  // Nhóm Delete (Xóa, Khôi phục, Xóa vĩnh viễn)
  const deleteItems = props.actionItems.filter(item => 
    item.label?.includes('Xóa') || 
    item.label?.includes('Khôi phục')
  )
  if (deleteItems.length > 0) {
    if (deleteItems.length > 1) {
      const deleteSubItems = deleteItems.map(item => ({
        label: item.label,
        icon: item.icon,
        command: () => {
          item.action([store.state.activeEntity])
          closeMenu()
        }
      }))
      
      items.push({
        label: actionGroups.delete.label,
        icon: actionGroups.delete.icon,
        items: deleteSubItems,
        template: 'groupedItem',
        groupData: actionGroups.delete
      })
    } else {
      const item = deleteItems[0]
      items.push({
        label: item.label,
        icon: item.icon,
        command: () => {
          item.action([store.state.activeEntity])
          closeMenu()
        },
        template: 'groupedItem',
        groupData: actionGroups.delete
      })
    }
  }
  
  return items
})

// Expose methods để có thể gọi từ parent component
defineExpose({
  show: (event) => {
    contextMenu.value.show(event)
  },
  hide: () => {
    closeMenu()
  }
})
</script>

<style scoped>
:deep(.p-contextmenu) {
  min-width: 220px;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

:deep(.p-contextmenu .p-menuitem) {
  margin: 0;
  border-bottom: 1px solid #f3f4f6;
}

:deep(.p-contextmenu .p-menuitem:last-child) {
  border-bottom: none;
}

:deep(.p-contextmenu .p-menuitem-link) {
  padding: 14px 16px;
  border-radius: 0;
  border-left: 4px solid transparent;
  display: flex;
  align-items: center;
  font-weight: 500;
  transition: all 0.2s ease;
}

/* Styling cho Preview group - màu xanh lá */
:deep(.p-contextmenu .p-menuitem:nth-child(1) .p-menuitem-link) {
  background-color: #f0fdf4;
  border-left-color: #22c55e;
  color: #15803d;
}

:deep(.p-contextmenu .p-menuitem:nth-child(1) .p-menuitem-link:hover) {
  background-color: #dcfce7;
}

/* Styling cho Share group - màu vàng */
:deep(.p-contextmenu .p-menuitem:nth-child(2) .p-menuitem-link) {
  background-color: #fefce8;
  border-left-color: #eab308;
  color: #a16207;
}

:deep(.p-contextmenu .p-menuitem:nth-child(2) .p-menuitem-link:hover) {
  background-color: #fef3c7;
}

/* Styling cho Organize group - màu xanh lá */
:deep(.p-contextmenu .p-menuitem:nth-child(3) .p-menuitem-link) {
  background-color: #f0fdf4;
  border-left-color: #22c55e;
  color: #15803d;
}

:deep(.p-contextmenu .p-menuitem:nth-child(3) .p-menuitem-link:hover) {
  background-color: #dcfce7;
}

/* Styling cho Download group - màu đỏ */
:deep(.p-contextmenu .p-menuitem:nth-child(4) .p-menuitem-link) {
  background-color: #fef2f2;
  border-left-color: #ef4444;
  color: #dc2626;
}

:deep(.p-contextmenu .p-menuitem:nth-child(4) .p-menuitem-link:hover) {
  background-color: #fee2e2;
}

/* Styling cho Info group - màu xanh dương */
:deep(.p-contextmenu .p-menuitem:nth-child(5) .p-menuitem-link) {
  background-color: #eff6ff;
  border-left-color: #3b82f6;
  color: #1d4ed8;
}

:deep(.p-contextmenu .p-menuitem:nth-child(5) .p-menuitem-link:hover) {
  background-color: #dbeafe;
}

/* Styling cho Delete group - màu cam */
:deep(.p-contextmenu .p-menuitem:nth-child(6) .p-menuitem-link) {
  background-color: #fff7ed;
  border-left-color: #f97316;
  color: #ea580c;
}

:deep(.p-contextmenu .p-menuitem:nth-child(6) .p-menuitem-link:hover) {
  background-color: #fed7aa;
}

/* Icon styling */
:deep(.p-contextmenu .p-menuitem-link .p-menuitem-icon) {
  margin-right: 12px;
  font-size: 16px;
}

/* Submenu styling */
:deep(.p-contextmenu .p-submenu-list) {
  background-color: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  margin-left: 8px;
}

:deep(.p-contextmenu .p-submenu-list .p-menuitem) {
  border-bottom: 1px solid #f3f4f6;
}

:deep(.p-contextmenu .p-submenu-list .p-menuitem:last-child) {
  border-bottom: none;
}

:deep(.p-contextmenu .p-submenu-list .p-menuitem-link) {
  padding: 10px 16px;
  border-left: none;
  background-color: white;
  color: #374151;
  font-weight: 400;
}

:deep(.p-contextmenu .p-submenu-list .p-menuitem-link:hover) {
  background-color: #f9fafb;
  color: #111827;
}

/* Arrow icon for submenu */
:deep(.p-contextmenu .p-menuitem-link .p-submenu-icon) {
  margin-left: auto;
  font-size: 12px;
}

/* Focus states */
:deep(.p-contextmenu .p-menuitem-link:focus) {
  outline: 2px solid #3b82f6;
  outline-offset: -2px;
}
</style>