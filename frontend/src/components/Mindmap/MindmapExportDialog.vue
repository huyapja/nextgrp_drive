<template>
  <Dialog
    :visible="visible"
    modal
    :header="'Xuất/Nhập sơ đồ'"
    :style="{ width: '400px' }"
    :draggable="false"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-4">
      <div class="text-sm text-gray-600">
        Chọn định dạng xuất:
      </div>
      <div class="flex flex-col gap-2">
        <button
          @click="handleExport('png')"
          class="flex items-center gap-3 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          :disabled="isExporting"
        >
          <div class="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
            <span class="text-blue-600 font-semibold">PNG</span>
          </div>
          <div class="flex-1 text-left">
            <div class="font-medium">PNG Image</div>
            <div class="text-sm text-gray-500">Xuất dưới dạng hình ảnh</div>
          </div>
          <svg v-if="isExporting && exportFormat === 'png'" class="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </button>
        <button
          @click="handleExport('pdf')"
          class="flex items-center gap-3 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          :disabled="isExporting"
        >
          <div class="w-10 h-10 bg-red-100 rounded flex items-center justify-center">
            <span class="text-red-600 font-semibold">PDF</span>
          </div>
          <div class="flex-1 text-left">
            <div class="font-medium">PDF Document</div>
            <div class="text-sm text-gray-500">Xuất dưới dạng tài liệu PDF</div>
          </div>
          <svg v-if="isExporting && exportFormat === 'pdf'" class="animate-spin h-5 w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </button>
        <button
          @click="handleExport('nextgrp')"
          class="flex items-center gap-3 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          :disabled="isExporting"
        >
          <div class="w-10 h-10 bg-green-100 rounded flex items-center justify-center">
            <span class="text-green-600 font-semibold">NGRP</span>
          </div>
          <div class="flex-1 text-left">
            <div class="font-medium">NextGRP Format</div>
            <div class="text-sm text-gray-500">Xuất với đầy đủ thông tin, có thể import lại</div>
          </div>
          <svg v-if="isExporting && exportFormat === 'nextgrp'" class="animate-spin h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </button>
      </div>
    </div>
    <template #footer>
      <div class="flex justify-between items-center">
        <div>
          <input
            ref="importFileInput"
            type="file"
            accept=".nextgrp,application/json"
            style="display: none"
            @change="handleImportNextGRP"
          />
          <PrimeButton
            label="Import NextGRP"
            severity="secondary"
            @click="importFileInput?.click()"
            :disabled="isExporting"
          />
        </div>
        <div>
          <PrimeButton
            label="Đóng"
            severity="secondary"
            @click="$emit('update:visible', false)"
            :disabled="isExporting"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { toast } from '@/utils/toasts'
import * as d3 from 'd3'
import { call } from 'frappe-ui'
import PrimeButton from 'primevue/button'
import Dialog from 'primevue/dialog'
import { ref } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  d3Renderer: {
    type: Object,
    required: true
  },
  d3Container: {
    type: Object,
    required: true
  },
  nodes: {
    type: Array,
    required: true
  },
  edges: {
    type: Array,
    required: true
  },
  mindmap: {
    type: Object,
    required: true
  },
  nodeCreationOrder: {
    type: Object,
    required: true
  },
  entityName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['update:visible', 'imported'])

const isExporting = ref(false)
const exportFormat = ref(null)
const importFileInput = ref(null)

// Export functions
const handleExport = async (format) => {
  if (!props.d3Renderer || !props.d3Renderer.svg) {
    toast({ title: "Không thể xuất sơ đồ", indicator: "red" })
    return
  }

  isExporting.value = true
  exportFormat.value = format
  emit('update:visible', false)

  try {
    const mindmapTitle = props.mindmap?.title || "Mindmap"
    const fileName = `${mindmapTitle.replace(/[^a-z0-9]/gi, '_')}.${format === 'nextgrp' ? 'nextgrp' : format}`

    if (format === 'png') {
      await exportToPNG(fileName)
    } else if (format === 'pdf') {
      await exportToPDF(fileName)
    } else if (format === 'nextgrp') {
      await exportToNextGRP(fileName)
    }
  } catch (error) {
    console.error('Export error:', error)
    toast({ title: `Lỗi khi xuất: ${error.message}`, indicator: "red" })
  } finally {
    isExporting.value = false
    exportFormat.value = null
  }
}

// Export to PNG - Sử dụng html2canvas để capture như chụp màn hình (giữ nguyên Vue components)
const exportToPNG = async (fileName) => {
  const svgElement = props.d3Renderer.svg.node()
  if (!svgElement) throw new Error("SVG not found")

  try {
    // Lấy transform hiện tại
    const currentTransform = d3.zoomTransform(svgElement)
    
    // Tính bounding box từ positions
    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity

    props.nodes.forEach(node => {
      const pos = props.d3Renderer.positions.get(node.id)
      if (!pos) return
      
      const size = props.d3Renderer.nodeSizeCache?.get(node.id) || { width: 150, height: 60 }
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + size.width)
      maxY = Math.max(maxY, pos.y + size.height)
    })

    const padding = 40
    const bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    
    // Clone và prepare SVG
    const clonedSvg = svgElement.cloneNode(true)
    const mainGroup = clonedSvg.querySelector('g')
    
    // ⚠️ CRITICAL: Reset transform để hiển thị toàn bộ content
    if (mainGroup) {
      mainGroup.removeAttribute('transform')
    }

    // Set viewBox để bao gồm tất cả content
    clonedSvg.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`)
    clonedSvg.setAttribute('width', bbox.width + padding * 2)
    clonedSvg.setAttribute('height', bbox.height + padding * 2)

    // ⚠️ CRITICAL: Render foreignObject content vào canvas riêng để giữ rich content
    // ForeignObject có thể gây ra lỗi "Tainted canvases may not be exported"
    // Giải pháp: Render từng foreignObject content vào canvas riêng bằng html2canvas,
    // sau đó embed canvas data URL như một <image> element trong SVG
    const foreignObjects = clonedSvg.querySelectorAll('foreignObject')
    
    // Đợi Vue components render xong
    await new Promise(resolve => requestAnimationFrame(resolve))
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Import html2canvas
    const html2canvas = (await import('html2canvas')).default
    
    // Process từng foreignObject
    for (const fo of foreignObjects) {
      // Tìm foreignObject tương ứng trong SVG gốc để lấy content
      const nodeId = fo.querySelector('[data-node-id]')?.getAttribute('data-node-id')
      let originalFO = null
      let contentDiv = null
      
      if (!nodeId) {
        // Thử tìm từ parent node-group
        const nodeGroup = fo.closest('[data-node-id]')
        if (nodeGroup) {
          const foundNodeId = nodeGroup.getAttribute('data-node-id')
          if (foundNodeId) {
            originalFO = svgElement.querySelector(`[data-node-id="${foundNodeId}"]`)?.querySelector('foreignObject')
          }
        }
      } else {
        originalFO = svgElement.querySelector(`[data-node-id="${nodeId}"]`)?.querySelector('foreignObject')
      }
      
      if (!originalFO) continue
      
      // Lấy HTML content từ foreignObject gốc (đã có Vue components render)
      contentDiv = originalFO.querySelector('.node-content-wrapper')
      if (!contentDiv) continue
      
      try {
        // Clone contentDiv để render riêng (tránh ảnh hưởng đến DOM gốc)
        const clonedContent = contentDiv.cloneNode(true)
        const foWidth = parseFloat(fo.getAttribute('width')) || contentDiv.offsetWidth || 150
        const foHeight = parseFloat(fo.getAttribute('height')) || contentDiv.offsetHeight || 60
        
        // ⚠️ CRITICAL: Setup styles để căn giữa content theo chiều dọc
        // Sử dụng flex để căn giữa (html2canvas render tốt hơn flex)
        console.log('[DEBUG Export] foWidth:', foWidth)
        console.log('[DEBUG Export] foHeight:', foHeight)
        clonedContent.style.position = 'absolute'
        clonedContent.style.left = '-9999px'
        clonedContent.style.top = '0'
        clonedContent.style.width = `${foWidth}px`
        clonedContent.style.height = `${foHeight}px`
        clonedContent.style.display = 'flex'
        clonedContent.style.alignItems = 'center' // Căn giữa theo chiều dọc
        clonedContent.style.justifyContent = 'center' // Căn giữa theo chiều ngang
        clonedContent.style.boxSizing = 'border-box'
        clonedContent.style.overflow = 'hidden'
        
        // Đảm bảo node-editor-container cũng dùng flex để căn giữa
        const editorContainer = clonedContent.querySelector('.node-editor-container')
        if (editorContainer) {
          editorContainer.style.display = 'flex'
          editorContainer.style.alignItems = 'center' // Căn giữa theo chiều dọc
          editorContainer.style.justifyContent = 'center' // Căn giữa theo chiều ngang
          editorContainer.style.width = '100%'
          editorContainer.style.height = `${foHeight}px` // ⚠️ CRITICAL: Set height cố định để flex alignment hoạt động
          editorContainer.style.boxSizing = 'border-box'
          editorContainer.style.overflow = 'hidden'
        }
        
        // Đảm bảo mindmap-node-editor và mindmap-editor-content cũng có height đúng
        const nodeEditor = clonedContent.querySelector('.mindmap-node-editor')
        if (nodeEditor) {
          nodeEditor.style.height = '100%'
          nodeEditor.style.display = 'flex'
          nodeEditor.style.alignItems = 'center'
          nodeEditor.style.justifyContent = 'center'
        }
        
        const editorContent = clonedContent.querySelector('.mindmap-editor-content')
        if (editorContent) {
          editorContent.style.height = '100%'
          editorContent.style.display = 'flex'
          editorContent.style.alignItems = 'center'
          editorContent.style.justifyContent = 'center'
        }
        
        // Đảm bảo mindmap-editor-prose - giữ nguyên các style quan trọng, chỉ tạm thời KHÔNG có padding để đo chính xác content height
        const proseContent = clonedContent.querySelector('.mindmap-editor-prose')
        if (proseContent) {
          // Lưu lại các style quan trọng từ element gốc
          const originalProse = contentDiv.querySelector('.mindmap-editor-prose')
          if (originalProse) {
            const computedStyle = window.getComputedStyle(originalProse)
            // Giữ nguyên width, max-width, white-space, và các style khác
            proseContent.style.width = computedStyle.width || '100%'
            proseContent.style.maxWidth = computedStyle.maxWidth || '100%'
            proseContent.style.whiteSpace = computedStyle.whiteSpace || 'nowrap'
            proseContent.style.fontSize = computedStyle.fontSize || '19px'
            proseContent.style.lineHeight = computedStyle.lineHeight || '1.4'
            proseContent.style.fontFamily = computedStyle.fontFamily || 'inherit'
            proseContent.style.color = computedStyle.color || 'inherit'
          }
          
          proseContent.style.margin = '0'
          proseContent.style.height = 'auto'
          proseContent.style.boxSizing = 'border-box'
          proseContent.style.display = 'block'
          proseContent.style.overflow = 'hidden'
          // Tạm thời KHÔNG có padding để đo content height chính xác
          proseContent.style.padding = '0'
        }
        
        document.body.appendChild(clonedContent)
        
        // Đợi một chút để đảm bảo cloned content được render
        await new Promise(resolve => requestAnimationFrame(resolve))
        await new Promise(resolve => setTimeout(resolve, 100)) // Tăng thời gian đợi
        
        // ⚠️ CRITICAL: Đo chiều cao thực tế của CONTENT (KHÔNG có padding) và tính padding để căn giữa
        if (proseContent) {
          // Force reflow nhiều lần để đảm bảo height được tính đúng
          void proseContent.offsetHeight
          void proseContent.scrollHeight
          await new Promise(resolve => requestAnimationFrame(resolve))
          void proseContent.offsetHeight
          void proseContent.scrollHeight
          
          // Đo content height thực tế (KHÔNG có padding) - dùng scrollHeight để chính xác hơn
          // Lấy cả offsetHeight và scrollHeight, dùng giá trị lớn hơn
          const offsetH = proseContent.offsetHeight || 0
          const scrollH = proseContent.scrollHeight || 0
          const actualContentHeight = Math.max(offsetH, scrollH)
          const nodeHeight = foHeight
          
          console.log('[DEBUG Export] Content height calculation:', {
            actualContentHeight,
            nodeHeight,
            remainingSpace: nodeHeight - actualContentHeight
          })
          
          // Tính padding để căn giữa hoàn hảo
          // Tổng không gian dọc = nodeHeight
          // Content height = actualContentHeight
          // Không gian còn lại = nodeHeight - actualContentHeight
          // Padding mỗi bên = (nodeHeight - actualContentHeight) / 2
          const remainingVerticalSpace = nodeHeight - actualContentHeight
          
          if (remainingVerticalSpace > 0) {
            // Tính padding để căn giữa: chia đều không gian còn lại
            const verticalPadding = remainingVerticalSpace / 2
            
            // ⚠️ CRITICAL: Tính padding để căn giữa, không dùng Math.max với 8px
            // Vì nếu dùng Math.max(8, verticalPadding), sẽ không căn giữa được nếu verticalPadding < 8
            // Nhưng đảm bảo padding tối thiểu là 0 (không âm)
            const finalPaddingTop = Math.max(0, verticalPadding)
            const finalPaddingBottom = Math.max(0, verticalPadding)
            
            console.log('[DEBUG Export] Padding calculation:', {
              verticalPadding,
              finalPaddingTop,
              finalPaddingBottom,
              nodeHeight,
              actualContentHeight,
              remainingVerticalSpace
            })
            
            // Apply padding để căn giữa - giữ nguyên các style đã set trước đó
            proseContent.style.paddingTop = `${finalPaddingTop}px`
            proseContent.style.paddingBottom = `${finalPaddingBottom}px`
            proseContent.style.paddingLeft = '16px'
            proseContent.style.paddingRight = '16px'
            
            // ⚠️ CRITICAL: Đảm bảo proseContent không dùng flex để tránh conflict với padding
            proseContent.style.display = 'block'
            
            // Đảm bảo các style quan trọng vẫn được giữ nguyên
            // Không override các style đã set từ computedStyle
            const originalProse = contentDiv.querySelector('.mindmap-editor-prose')
            if (originalProse) {
              const computedStyle = window.getComputedStyle(originalProse)
              if (!proseContent.style.width || proseContent.style.width === '100%') {
                proseContent.style.width = computedStyle.width || '100%'
              }
              if (!proseContent.style.maxWidth || proseContent.style.maxWidth === '100%') {
                proseContent.style.maxWidth = computedStyle.maxWidth || '100%'
              }
              if (!proseContent.style.whiteSpace) {
                proseContent.style.whiteSpace = computedStyle.whiteSpace || 'nowrap'
              }
            }
            
            // Force reflow lại sau khi thay đổi padding
            void proseContent.offsetHeight
            void proseContent.scrollHeight
            
            // Verify padding đã được apply đúng
            console.log('[DEBUG Export] Final padding:', {
              paddingTop: proseContent.style.paddingTop,
              paddingBottom: proseContent.style.paddingBottom,
              computedPaddingTop: window.getComputedStyle(proseContent).paddingTop,
              computedPaddingBottom: window.getComputedStyle(proseContent).paddingBottom
            })
          } else {
            // Nếu content vượt quá node height, dùng padding tối thiểu nhưng vẫn giữ các style
            proseContent.style.padding = '8px 16px'
            const originalProse = contentDiv.querySelector('.mindmap-editor-prose')
            if (originalProse) {
              const computedStyle = window.getComputedStyle(originalProse)
              if (!proseContent.style.width || proseContent.style.width === '100%') {
                proseContent.style.width = computedStyle.width || '100%'
              }
              if (!proseContent.style.maxWidth || proseContent.style.maxWidth === '100%') {
                proseContent.style.maxWidth = computedStyle.maxWidth || '100%'
              }
              if (!proseContent.style.whiteSpace) {
                proseContent.style.whiteSpace = computedStyle.whiteSpace || 'nowrap'
              }
            }
          }
        }
        
        // Đợi thêm một chút để đảm bảo padding được apply
        await new Promise(resolve => requestAnimationFrame(resolve))
        
        // Render clonedContent vào canvas bằng html2canvas
        const canvas = await html2canvas(clonedContent, {
          backgroundColor: '#ffffff', // White background
          scale: 2, // Higher quality
          useCORS: true,
          logging: false,
          width: foWidth,
          height: foHeight,
          windowWidth: foWidth,
          windowHeight: foHeight,
        })
        
        // Remove cloned content từ DOM
        document.body.removeChild(clonedContent)
        
        // Convert canvas thành data URL
        const dataUrl = canvas.toDataURL('image/png')
        
        // Tạo SVG <image> element thay thế foreignObject
        const image = document.createElementNS('http://www.w3.org/2000/svg', 'image')
        image.setAttribute('x', fo.getAttribute('x') || '0')
        image.setAttribute('y', fo.getAttribute('y') || '0')
        image.setAttribute('width', fo.getAttribute('width') || '150')
        image.setAttribute('height', fo.getAttribute('height') || '60')
        // Sử dụng href (SVG 2.0) hoặc xlink:href (SVG 1.1) để tương thích
        if (image.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')) {
          image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl)
        } else {
          image.setAttribute('href', dataUrl)
        }
        image.setAttribute('preserveAspectRatio', 'xMidYMid meet')
        
        // Replace foreignObject với image
        fo.parentNode.replaceChild(image, fo)
      } catch (error) {
        console.warn('Failed to render foreignObject to canvas, falling back to text:', error)
        // Fallback: Convert thành SVG text nếu html2canvas fail
        const textContent = getTextContentFromHTML(contentDiv)
        if (textContent) {
          const textGroup = createSVGTextFromContent(textContent, fo)
          fo.parentNode.replaceChild(textGroup, fo)
        }
      }
    }
    
    // Đợi một chút để đảm bảo content được render
    await new Promise(resolve => requestAnimationFrame(resolve))

    // Serialize SVG
    const svgString = new XMLSerializer().serializeToString(clonedSvg)
    
    // ⚠️ CRITICAL: Encode SVG để tránh lỗi tainted canvas
    // Sử dụng data URL thay vì blob URL
    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString)

    // Create image và load SVG
    const img = new Image()
    const canvas = document.createElement('canvas')
    canvas.width = bbox.width + padding * 2
    canvas.height = bbox.height + padding * 2
    const ctx = canvas.getContext('2d')

    await new Promise((resolve, reject) => {
      img.onload = () => {
        try {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0)
          resolve()
        } catch (error) {
          reject(new Error(`Failed to draw image: ${error.message}`))
        }
      }
      img.onerror = (error) => {
        reject(new Error(`Failed to load SVG image: ${error.message || 'Unknown error'}`))
      }
      // ⚠️ CRITICAL: Set crossOrigin để tránh tainted canvas
      img.crossOrigin = 'anonymous'
      img.src = svgDataUrl
    })

    // Download
    canvas.toBlob((blob) => {
      if (!blob) {
        throw new Error('Failed to create PNG blob')
      }
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(link.href), 100)
      toast({ title: "✅ Đang tải xuống...", indicator: "green" })
    }, 'image/png')

  } catch (error) {
    console.error('Export error:', error)
    throw error
  }
}

// Helper function: Lấy text content từ HTML element (loại bỏ HTML tags nhưng giữ text)
const getTextContentFromHTML = (element) => {
  if (!element) return ''
  
  // Clone element để không ảnh hưởng đến DOM gốc
  const clone = element.cloneNode(true)
  
  // Xóa các elements không cần thiết (buttons, menus, etc.)
  clone.querySelectorAll('button, .image-menu-button, [aria-label="Image options"]').forEach(el => el.remove())
  
  // Lấy text content
  return clone.textContent?.trim() || ''
}

// Helper function: Tạo SVG text group từ text content
const createSVGTextFromContent = (textContent, foreignObject) => {
  const textGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  
  if (!textContent) return textGroup
  
  // Parse text thành các dòng (split by newline hoặc <br>)
  const lines = textContent.split(/\n/).filter(line => line.trim())
  const lineHeight = 20
  const fontSize = 14
  const startY = parseFloat(foreignObject.getAttribute('y')) || 0
  const startX = parseFloat(foreignObject.getAttribute('x')) || 0
  const foWidth = parseFloat(foreignObject.getAttribute('width')) || 150
  const foHeight = parseFloat(foreignObject.getAttribute('height')) || 60
  
  // Nếu không có lines, tạo một text element
  if (lines.length === 0) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', startX + 8)
    text.setAttribute('y', startY + fontSize + 8)
    text.setAttribute('font-family', 'Arial, sans-serif')
    text.setAttribute('font-size', fontSize.toString())
    text.setAttribute('fill', '#000000')
    text.textContent = textContent.trim()
    textGroup.appendChild(text)
    return textGroup
  }
  
  // Tạo text element cho mỗi dòng
  lines.forEach((line, index) => {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', startX + 8) // Padding
    text.setAttribute('y', startY + fontSize + (index * lineHeight) + 8) // Padding
    text.setAttribute('font-family', 'Arial, sans-serif')
    text.setAttribute('font-size', fontSize.toString())
    text.setAttribute('fill', '#000000')
    
    // Word wrap nếu text quá dài
    const maxCharsPerLine = Math.floor((foWidth - 16) / (fontSize * 0.6)) // Ước tính
    if (line.length > maxCharsPerLine) {
      // Split thành nhiều dòng
      const words = line.split(' ')
      let currentLine = ''
      let lineIndex = index
      
      words.forEach(word => {
        const testLine = currentLine ? `${currentLine} ${word}` : word
        if (testLine.length > maxCharsPerLine && currentLine) {
          // Tạo text cho dòng hiện tại
          const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text')
          textEl.setAttribute('x', startX + 8)
          textEl.setAttribute('y', startY + fontSize + (lineIndex * lineHeight) + 8)
          textEl.setAttribute('font-family', 'Arial, sans-serif')
          textEl.setAttribute('font-size', fontSize.toString())
          textEl.setAttribute('fill', '#000000')
          textEl.textContent = currentLine
          textGroup.appendChild(textEl)
          
          currentLine = word
          lineIndex++
        } else {
          currentLine = testLine
        }
      })
      
      // Thêm dòng cuối cùng
      if (currentLine) {
        const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        textEl.setAttribute('x', startX + 8)
        textEl.setAttribute('y', startY + fontSize + (lineIndex * lineHeight) + 8)
        textEl.setAttribute('font-family', 'Arial, sans-serif')
        textEl.setAttribute('font-size', fontSize.toString())
        textEl.setAttribute('fill', '#000000')
        textEl.textContent = currentLine
        textGroup.appendChild(textEl)
      }
    } else {
      text.textContent = line.trim()
      textGroup.appendChild(text)
    }
  })
  
  return textGroup
}

// Export to PDF
const exportToPDF = async (fileName) => {
  const svgElement = props.d3Renderer.svg.node()
  if (!svgElement) {
    throw new Error("SVG element not found")
  }

  // Clone SVG to avoid modifying original
  const clonedSvg = svgElement.cloneNode(true)
  
  // Get the main group (g element) that contains the zoom transform
  const mainGroup = clonedSvg.querySelector('g')
  if (mainGroup) {
    // Reset transform to show full content
    mainGroup.removeAttribute('transform')
  }

  // Get bounding box
  const bbox = clonedSvg.getBBox()
  const padding = 40
  const width = Math.max(bbox.width + padding * 2, 800)
  const height = Math.max(bbox.height + padding * 2, 600)

  // Set viewBox to include all content
  clonedSvg.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`)
  clonedSvg.setAttribute('width', width)
  clonedSvg.setAttribute('height', height)
  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  // Get SVG content
  const svgData = new XMLSerializer().serializeToString(clonedSvg)

  // Create HTML content with SVG
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          svg {
            display: block;
            margin: 0;
          }
        </style>
      </head>
      <body>
        ${svgData}
      </body>
    </html>
  `

  // Use html2pdf
  const html2pdf = (await import('html2pdf.js')).default
  const opt = {
    margin: 0,
    filename: fileName,
    image: { type: 'svg', quality: 1.0 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'px', format: [width, height], orientation: width > height ? 'landscape' : 'portrait' }
  }

  await html2pdf().set(opt).from(htmlContent).save()
  toast({ title: "✅ Đang tải xuống...", indicator: "green" })
}

// Export to NextGRP format
const exportToNextGRP = async (fileName) => {
  // Get current mindmap data with all information
  const nodesWithPositions = props.nodes.map(({ count, ...node }) => {
    const nodeWithPos = { ...node }
    if (props.d3Renderer && props.d3Renderer.positions) {
      const pos = props.d3Renderer.positions.get(node.id)
      if (pos) {
        nodeWithPos.position = { ...pos }
      }
    }
    // Include order
    if (props.nodeCreationOrder.has(node.id)) {
      const order = props.nodeCreationOrder.get(node.id)
      if (!nodeWithPos.data) {
        nodeWithPos.data = {}
      }
      nodeWithPos.data.order = order
    }
    return nodeWithPos
  })

  const nextgrpData = {
    version: "1.0",
    format: "nextgrp",
    exported_at: new Date().toISOString(),
    mindmap: {
      title: props.mindmap?.title || "Mindmap",
      nodes: nodesWithPositions,
      edges: props.edges,
      layout: "horizontal"
    }
  }

  // Convert to JSON and download
  const jsonStr = JSON.stringify(nextgrpData, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
  
  toast({ title: "✅ Đang tải xuống...", indicator: "green" })
}

// Import NextGRP format
const handleImportNextGRP = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  // Reset input
  if (importFileInput.value) {
    importFileInput.value.value = ''
  }

  // Validate file extension
  const fileName = file.name.toLowerCase()
  if (!fileName.endsWith('.nextgrp') && !fileName.endsWith('.json')) {
    toast({ title: "File không hợp lệ. Vui lòng chọn file .nextgrp hoặc .json", indicator: "red" })
    return
  }

  isExporting.value = true
  exportFormat.value = 'import'

  try {
    // Read file content
    const fileContent = await file.text()
    let nextgrpData

    try {
      nextgrpData = JSON.parse(fileContent)
    } catch (e) {
      throw new Error("File không phải định dạng JSON hợp lệ")
    }

    // Validate NextGRP format
    if (!nextgrpData.format || nextgrpData.format !== 'nextgrp') {
      toast({ 
        title: "File không phải định dạng NextGRP hợp lệ", 
        indicator: "red" 
      })
      return
    }

    if (!nextgrpData.mindmap || !nextgrpData.mindmap.nodes) {
      toast({ 
        title: "File NextGRP thiếu dữ liệu mindmap", 
        indicator: "red" 
      })
      return
    }

    // Call backend API to import
    const response = await call("drive.api.mindmap.import_mindmap_nextgrp", {
      entity_name: props.entityName,
      nextgrp_data: nextgrpData
    })

    if (response && response.message) {
      toast({ 
        title: `✅ Import thành công! ${response.message.nodes_count} nodes, ${response.message.edges_count} edges`, 
        indicator: "green" 
      })

      // Emit event to parent to reload mindmap
      emit('imported')
      
      // Close dialog
      emit('update:visible', false)
    } else {
      throw new Error("Import failed")
    }
  } catch (error) {
    console.error('Import error:', error)
    toast({ 
      title: `Lỗi khi import: ${error.message || 'Unknown error'}`, 
      indicator: "red" 
    })
  } finally {
    isExporting.value = false
    exportFormat.value = null
  }
}
</script>
