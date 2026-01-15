<template>
  <!-- Desktop: ContextMenu -->
  <ContextMenu
    v-if="!isMobile"
    ref="contextMenu"
    :model="groupedMenuItems"
    :pt="{
      root: {
        class: '!min-w-[230px] !rounded-lg !shadow-lg !border !border-[#E5E5E5] bg-white !text-[14px] !text-semibold !gap-0'
      },
      menu: {
        class: '!py-1 !px-2 !min-w-[220px]'
      },
      submenu: {
        class: '!right-full !rounded-lg !text-[14px] !text-semibold !min-w-[220px]'
      }
    }"
  >
    <template #item="{ item, props }">
      <a v-ripple class="flex align-items-center" v-bind="props.action">
        <component 
          v-if="item.iconComponent" 
          :is="item.iconComponent" 
          class="w-4 h-4 menu-icon-svg"
          :class="item.class"
        />
        <i v-else-if="item.icon" :class="item.icon"></i>
        <span class="ml-1 font-[500]">{{ item.label }}</span>
        <i v-if="item.items" class="pi pi-angle-left ml-auto"></i>
      </a>
    </template>
  </ContextMenu>

  <!-- Mobile: Bottom Sheet Dialog -->
  <Dialog
    v-else
    v-model:visible="showMobileMenu"
    position="bottom"
    :modal="true"
    :dismissableMask="true"
    :showHeader="false"
    :style="{ width: '100vw', maxWidth: '100vw', margin: 0 }"
    :breakpoints="{ '960px': '100vw', '640px': '100vw' }"
    :pt="{
      root: { class: 'mobile-bottom-sheet' },
      mask: { class: 'mobile-sheet-mask' }
    }"
    @hide="handleMobileMenuClose"
  >
    <div class="mobile-menu-container">
      <!-- Handle bar -->
      <div class="mobile-menu-handle"></div>
      
      <!-- Menu items -->
      <div class="mobile-menu-content">
        <template v-for="(item, index) in flattenedMenuItems" :key="index">
          <!-- Main action item -->
          <div
            v-if="!item.isSubItem"
            class="mobile-menu-item"
            :class="{ 'has-submenu': item.items && item.items.length > 0 }"
            @click="item.items ? toggleSubMenu(index) : handleMobileItemClick(item)"
          >
            <div class="mobile-item-content">
              <component 
                v-if="item.iconComponent" 
                :is="item.iconComponent" 
                class="mobile-item-icon"
                :class="item.class"
              />
              <i v-else-if="item.icon" :class="[item.icon, 'mobile-item-icon']"></i>
              <span class="mobile-item-label">{{ item.label }}</span>
            </div>
            <i v-if="item.items" :class="['pi', expandedSubmenu === index ? 'pi-chevron-up' : 'pi-chevron-down', 'mobile-submenu-arrow']"></i>
          </div>

          <!-- Submenu items -->
          <div v-if="item.items && expandedSubmenu === index" class="mobile-submenu">
            <div
              v-for="(subItem, subIndex) in item.items"
              :key="subIndex"
              class="mobile-submenu-item"
              @click="handleMobileItemClick(subItem)"
            >
              <component 
                v-if="subItem.iconComponent" 
                :is="subItem.iconComponent" 
                class="mobile-item-icon"
                :class="subItem.class"
              />
              <i v-else-if="subItem.icon" :class="[subItem.icon, 'mobile-item-icon']"></i>
              <span class="mobile-item-label">{{ subItem.label }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Dialog>
</template>

<script setup>
import ContextMenu from 'primevue/contextmenu'
import Dialog from 'primevue/dialog'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useStore } from 'vuex'

const props = defineProps({
  actionItems: {
    type: Array,
    default: () => []
  },
  event: Object,
  close: Function,
  onDownloadMindmap: {
    type: Function,
    default: null
  }
})

const contextMenu = ref(null)
const store = useStore()

// Mobile detection
const isMobile = ref(false)
const showMobileMenu = ref(false)
const expandedSubmenu = ref(null)

const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

// Định nghĩa các nhóm action theo cấu trúc như trong hình
const actionGroups = {
  preview: {
    label: 'Xem trước',
    icon: 'pi pi-eye',
  },
  share: {
    label: 'Chia sẻ',
    icon: 'pi pi-share-alt',
  },
  pin: {
    label: 'Ghim',
    icon: 'pi pi-bookmark',
  },
  organize: {
    label: 'Sắp xếp',
    icon: 'pi pi-sort-alt',
  },
  download: {
    label: 'Tải xuống',
    icon: 'pi pi-download',
  },
  info: {
    label: 'Thông tin',
    icon: 'pi pi-info-circle',
  },
  delete: {
    label: 'Xóa',
    icon: 'pi pi-trash',
    color: '#fef2f2',
    borderColor: '#ef4444',
    textColor: '#dc2626'
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
      icon: typeof item.icon === 'string' ? item.icon : null,
      iconComponent: typeof item.icon !== 'string' ? item.icon : null,
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
  
  // Nhóm Pin (Ghim tài liệu) - Hiển thị ở cấp 1
  const pinItems = props.actionItems.filter(item => 
    item.label?.includes('Ghim tài liệu') ||
    item.label?.includes('Bỏ ghim tài liệu')
  )
  if (pinItems.length > 0) {
    // Nếu chỉ có 1 action ghim, hiển thị trực tiếp
    if (pinItems.length === 1) {
      const item = pinItems[0]
      items.push({
        label: item.label,
        icon: typeof item.icon === 'string' ? item.icon : null,
        iconComponent: typeof item.icon !== 'string' ? item.icon : null,
        command: () => {
          item.action([store.state.activeEntity])
          closeMenu()
        },
        template: 'groupedItem',
        groupData: actionGroups.pin
      })
    } else {
      // Nếu có nhiều action ghim, hiển thị submenu
      const pinSubItems = pinItems.map(item => ({
        label: item.label,
        icon: typeof item.icon === 'string' ? item.icon : null,
        iconComponent: typeof item.icon !== 'string' ? item.icon : null,
        command: () => {
          item.action([store.state.activeEntity])
          closeMenu()
        }
      }))
      
      items.push({
        label: actionGroups.pin.label,
        icon: actionGroups.pin.icon,
        items: pinSubItems,
        template: 'groupedItem',
        groupData: actionGroups.pin
      })
    }
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
      icon: typeof item.icon === 'string' ? item.icon : null,
      iconComponent: typeof item.icon !== 'string' ? item.icon : null,
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
    const entity = store.state.activeEntity
    // Kiểm tra nếu là mindmap và có function export nmm
    const isMindmap = entity?.mindmap || entity?.type === 'mindmap'
    items.push({
      label: actionGroups.download.label,
      icon: actionGroups.download.icon,
      command: () => {
        // Nếu là mindmap và có function export nmm, gọi nó
        if (isMindmap && props.onDownloadMindmap) {
          props.onDownloadMindmap(entity)
        } else {
          // Ngược lại, dùng action mặc định
          item.action([entity])
        }
        closeMenu()
      },
      template: 'groupedItem',
      groupData: actionGroups.download
    })
  }
  
  // Nhóm Info (Thông tin, Đổi tên, Hiển thị thông tin, Lịch sử truy cập)
  // Tạo set các labels đã được xử lý ở các nhóm khác để tránh duplicate
  const processedLabels = new Set()
  shareItems.forEach(item => processedLabels.add(item.label))
  pinItems.forEach(item => processedLabels.add(item.label))
  organizeItems.forEach(item => processedLabels.add(item.label))
  downloadItems.forEach(item => processedLabels.add(item.label))
  
  const infoItems = props.actionItems.filter(item => {
    const label = item.label || ''
    // Bỏ qua các items đã được xử lý ở nhóm khác
    if (processedLabels.has(label)) {
      return false
    }
    // Filter các items thuộc nhóm Info
    return label.includes('Hiển thị thông tin') ||
           label.includes('Lịch sử truy cập') ||
           label.includes('Ẩn thông tin') ||
           (label.includes('Thông tin') && !label.includes('Chia sẻ') && !label.includes('Chuyển')) ||
           label.includes('Đổi tên')
  })
  
  if (infoItems.length > 0) {
    const infoSubItems = infoItems.map(item => ({
      label: item.label,
      icon: typeof item.icon === 'string' ? item.icon : null,
      iconComponent: typeof item.icon !== 'string' ? item.icon : null,
      class: item.class,
      command: () => {
        if (item.action) {
        item.action([store.state.activeEntity])
        }
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
  
  // Nhóm Delete (Xóa, Khôi phục, Xóa vĩnh viễn) - Hiển thị phẳng
  const deleteItems = props.actionItems.filter(item => 
    item.label?.includes('Xóa') || 
    item.label?.includes('Khôi phục')
  )
  
  // Thêm từng action xóa/khôi phục riêng biệt
  deleteItems.forEach(item => {
    items.push({
      label: item.label,
      icon: typeof item.icon === 'string' ? item.icon : null,
      iconComponent: typeof item.icon !== 'string' ? item.icon : null,
      command: () => {
        item.action([store.state.activeEntity])
        closeMenu()
      },
      template: 'groupedItem',
      groupData: actionGroups.delete,
      isDangerAction: true // Flag để style riêng
    })
  })
  
  return items
})

// Flattened menu items for mobile (không nested)
const flattenedMenuItems = computed(() => {
  return groupedMenuItems.value
})

// Mobile menu handlers
const handleMobileItemClick = (item) => {
  if (item.command) {
    item.command()
  }
  showMobileMenu.value = false
  expandedSubmenu.value = null
  if (props.close) {
    props.close()
  }
}

const toggleSubMenu = (index) => {
  if (expandedSubmenu.value === index) {
    expandedSubmenu.value = null
  } else {
    expandedSubmenu.value = index
  }
}

const handleMobileMenuClose = () => {
  expandedSubmenu.value = null
  if (props.close) {
    props.close()
  }
}

// Expose methods để có thể gọi từ parent component
defineExpose({
  show: (event) => {
    if (isMobile.value) {
      showMobileMenu.value = true
    } else {
      contextMenu.value?.show(event)
    }
  },
  hide: () => {
    if (isMobile.value) {
      showMobileMenu.value = false
      expandedSubmenu.value = null
    } else {
      closeMenu()
    }
  }
})
</script>

<style scoped>
/* Base typography - System font stack for better rendering */
:deep(.p-contextmenu) {
  min-width: 220px !important;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}


:deep(.p-contextmenu .p-menuitem) {
  margin: 0;
  border-bottom: 1px solid #f3f4f6;
}

:deep(.p-contextmenu .p-menuitem:last-child) {
  border-bottom: none;
}

/* Main menu items - Improved typography */
:deep(.p-contextmenu .p-menuitem-link) {
  padding: 8px 12px;
  border-radius: 0;
  border-left: 4px solid transparent;
  display: flex;
  align-items: center;
  font-weight: 500 !important;
  font-size: 14px !important;
  line-height: 1.5 !important;
  letter-spacing: 0.01em !important;
  transition: all 0.2s ease;
}

:deep(.p-contextmenu .p-menuitem-text) {
  font-weight: 500 !important;
  font-size: 14px !important;
  color: inherit;
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

/* Styling cho Pin group - màu tím */
:deep(.p-contextmenu .p-menuitem:nth-child(3) .p-menuitem-link) {
  background-color: #faf5ff;
  border-left-color: #a855f7;
  color: #7e22ce;
}

:deep(.p-contextmenu .p-menuitem:nth-child(3) .p-menuitem-link:hover) {
  background-color: #f3e8ff;
}

/* Styling cho Organize group - màu xanh lá */
:deep(.p-contextmenu .p-menuitem:nth-child(4) .p-menuitem-link) {
  background-color: #f0fdf4;
  border-left-color: #22c55e;
  color: #15803d;
}

:deep(.p-contextmenu .p-menuitem:nth-child(4) .p-menuitem-link:hover) {
  background-color: #dcfce7;
}

/* Styling cho Download group - màu đỏ */
:deep(.p-contextmenu .p-menuitem:nth-child(5) .p-menuitem-link) {
  background-color: #fef2f2;
  border-left-color: #ef4444;
  color: #dc2626;
}

:deep(.p-contextmenu .p-menuitem:nth-child(5) .p-menuitem-link:hover) {
  background-color: #fee2e2;
}

/* Styling cho Info group - màu xanh dương */
:deep(.p-contextmenu .p-menuitem:nth-child(6) .p-menuitem-link) {
  background-color: #eff6ff;
  border-left-color: #3b82f6;
  color: #1d4ed8;
}

:deep(.p-contextmenu .p-menuitem:nth-child(6) .p-menuitem-link:hover) {
  background-color: #dbeafe;
}

/* Styling cho các action Xóa/Khôi phục (danger actions) - màu cam/đỏ */
:deep(.p-contextmenu .p-menuitem:nth-child(n+7) .p-menuitem-link) {
  background-color: #fff7ed;
  border-left-color: #f97316;
  color: #ea580c;
}

:deep(.p-contextmenu .p-menuitem:nth-child(n+7) .p-menuitem-link:hover) {
  background-color: #fed7aa;
}

/* Icon styling - Better alignment */
:deep(.p-contextmenu .p-menuitem-link .p-menuitem-icon) {
  margin-right: 12px;
  font-size: 16px;
  display: flex;
  align-items: center;
  opacity: 0.9;
}

/* Submenu styling - Improved positioning and typography */
:deep(.p-contextmenu .p-submenu-list) {
  background-color: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  margin-right: 8px;
  min-width: 200px;
}

:deep(.p-contextmenu .p-submenu-list .p-menuitem) {
  border-bottom: 1px solid #f3f4f6;
}

:deep(.p-contextmenu .p-submenu-list .p-menuitem:last-child) {
  border-bottom: none;
}

:deep(.p-contextmenu .p-submenu-list .p-menuitem-link),
:deep(.p-contextmenu .p-submenu-list a) {
  padding: 10px 16px;
  border-left: none;
  background-color: white;
  color: #374151;
  font-weight: 400 !important;
  font-size: 13.5px !important;
  line-height: 1.5 !important;
  letter-spacing: 0.01em !important;
  transition: all 0.15s ease;
}

:deep(.p-contextmenu .p-submenu-list .p-menuitem-text) {
  font-weight: 400 !important;
  font-size: 13.5px !important;
}

:deep(.p-contextmenu .p-submenu-list .p-menuitem-link:hover),
:deep(.p-contextmenu .p-submenu-list a:hover) {
  background-color: #f9fafb;
  color: #111827;
  transform: translateX(-2px);
}

/* Icon styling for submenu items */
:deep(.p-contextmenu .p-submenu-list .p-menuitem-link .p-menuitem-icon),
:deep(.p-contextmenu .p-submenu-list a .p-menuitem-icon),
:deep(.p-contextmenu .p-submenu-list a i) {
  font-size: 14px;
  margin-right: 10px;
  opacity: 0.8;
  display: flex;
  align-items: center;
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

/* Submenu positioning - Show on left side */
:deep(.p-contextmenu-submenu) {
  inset-inline-start: auto !important;
  inset-inline-end: 100%;
  margin-right: 4px;
}

/* Additional override for all text elements */
:deep(.p-contextmenu .p-menuitem-link span) {
  font-size: 14px !important;
  font-weight: 500 !important;
}

:deep(.p-contextmenu .p-submenu-list .p-menuitem-link span),
:deep(.p-contextmenu .p-submenu-list a span) {
  font-size: 13.5px !important;
  font-weight: 400 !important;
}

.menu-icon-svg,
.menu-icon-svg svg {
  width: 16px !important;
  height: 16px !important;
  min-width: 16px !important;
  min-height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
  flex-shrink: 0;
}

:deep(.menu-icon-svg),
:deep(.menu-icon-svg svg) {
  width: 16px !important;
  height: 16px !important;
  min-width: 16px !important;
  min-height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
  flex-shrink: 0;
}

/* ============================================
   MOBILE BOTTOM SHEET STYLES
   ============================================ */
:deep(.mobile-bottom-sheet) {
  width: 100vw !important;
  max-width: 100vw !important;
  margin: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  border-radius: 20px 20px 0 0 !important;
  max-height: 90vh !important;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15) !important;
}

:deep(.mobile-bottom-sheet .p-dialog-content) {
  padding: 0 !important;
  overflow: hidden !important;
  width: 100% !important;
  max-width: 100% !important;
}

/* Override any PrimeVue default constraints */
:deep(.p-dialog.mobile-bottom-sheet) {
  transform: none !important;
}

:deep(.p-dialog-bottom.mobile-bottom-sheet) {
  width: 100vw !important;
  max-width: 100vw !important;
}

:deep(.mobile-sheet-mask) {
  background-color: rgba(0, 0, 0, 0.6) !important;
}

/* Force full width for all dialog wrappers */
:deep(.p-dialog-mask) {
  align-items: flex-end !important;
}

:deep(.p-dialog-mask .mobile-bottom-sheet) {
  margin-bottom: 0 !important;
}

.mobile-menu-container {
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  width: 100%;
}

.mobile-menu-handle {
  width: 48px;
  height: 5px;
  background-color: #d1d5db;
  border-radius: 3px;
  margin: 16px auto 12px;
  flex-shrink: 0;
}

.mobile-menu-content {
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0 24px;
  -webkit-overflow-scrolling: touch;
  width: 100%;
}

.mobile-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid #f3f4f6;
  min-height: 64px;
  width: 100%;
}

.mobile-menu-item:active {
  background-color: #f9fafb;
}

.mobile-menu-item.has-submenu {
  background-color: #fafafa;
}

.mobile-item-content {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.mobile-item-icon {
  width: 26px;
  height: 26px;
  font-size: 26px;
  flex-shrink: 0;
  color: #6b7280;
}

.mobile-item-label {
  font-size: 17px;
  font-weight: 500;
  color: #1f2937;
  line-height: 1.4;
}

.mobile-submenu-arrow {
  font-size: 18px;
  color: #9ca3af;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.mobile-submenu {
  background-color: #f9fafb;
  border-top: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  width: 100%;
}

.mobile-submenu-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 24px 18px 60px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid #f3f4f6;
  min-height: 60px;
  width: 100%;
}

.mobile-submenu-item:last-child {
  border-bottom: none;
}

.mobile-submenu-item:active {
  background-color: #f3f4f6;
}

.mobile-submenu-item .mobile-item-icon {
  width: 24px;
  height: 24px;
  font-size: 24px;
}

.mobile-submenu-item .mobile-item-label {
  font-size: 16px;
  font-weight: 400;
  line-height: 1.4;
}

/* Scrollbar for mobile menu */
.mobile-menu-content::-webkit-scrollbar {
  width: 6px;
}

.mobile-menu-content::-webkit-scrollbar-track {
  background: transparent;
  margin: 8px 0;
}

.mobile-menu-content::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.mobile-menu-content::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

/* Animation for bottom sheet */
:deep(.mobile-bottom-sheet) {
  animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Responsive adjustments for different mobile sizes */
@media (max-width: 480px) {
  .mobile-menu-item {
    padding: 18px 20px;
    min-height: 62px;
  }

  .mobile-item-icon {
    width: 24px;
    height: 24px;
    font-size: 24px;
  }

  .mobile-item-label {
    font-size: 16px;
  }

  .mobile-submenu-arrow {
    font-size: 16px;
  }

  .mobile-submenu-item {
    padding: 16px 20px 16px 56px;
    min-height: 58px;
  }

  .mobile-submenu-item .mobile-item-icon {
    width: 22px;
    height: 22px;
    font-size: 22px;
  }

  .mobile-submenu-item .mobile-item-label {
    font-size: 15px;
  }
}

@media (min-width: 481px) and (max-width: 768px) {
  /* Larger mobile/tablet devices - even bigger items */
  .mobile-menu-item {
    padding: 22px 28px;
    min-height: 68px;
  }

  .mobile-item-icon {
    width: 28px;
    height: 28px;
    font-size: 28px;
  }

  .mobile-item-label {
    font-size: 18px;
  }

  .mobile-submenu-arrow {
    font-size: 20px;
  }

  .mobile-submenu-item {
    padding: 20px 28px 20px 64px;
    min-height: 64px;
  }

  .mobile-submenu-item .mobile-item-icon {
    width: 26px;
    height: 26px;
    font-size: 26px;
  }

  .mobile-submenu-item .mobile-item-label {
    font-size: 17px;
  }
}

/* Note: Mobile devices will use the bottom sheet component instead of context menu */
</style>