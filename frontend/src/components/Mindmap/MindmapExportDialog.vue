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
          class="flex items-center gap-3 p-4 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all duration-200 group"
          :disabled="isExporting"
          :class="{ 'opacity-50 cursor-not-allowed': isExporting }"
        >
          <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
            <LucideImage class="w-6 h-6 text-blue-600" />
          </div>
          <div class="flex-1 text-left">
            <div class="font-semibold text-gray-900">PNG Image</div>
            <div class="text-sm text-gray-500">Xuất dưới dạng hình ảnh</div>
          </div>
          <svg v-if="isExporting && exportFormat === 'png'" class="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <LucideDownload v-else class="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
        </button>
        <button
          @click="handleExport('pdf')"
          class="flex items-center gap-3 p-4 border border-gray-300 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all duration-200 group"
          :disabled="isExporting"
          :class="{ 'opacity-50 cursor-not-allowed': isExporting }"
        >
          <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center group-hover:bg-red-200 transition-colors">
            <LucideFileText class="w-6 h-6 text-red-600" />
          </div>
          <div class="flex-1 text-left">
            <div class="font-semibold text-gray-900">PDF Document</div>
            <div class="text-sm text-gray-500">Xuất dưới dạng tài liệu PDF</div>
          </div>
          <svg v-if="isExporting && exportFormat === 'pdf'" class="animate-spin h-5 w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <LucideDownload v-else class="w-5 h-5 text-gray-400 group-hover:text-red-600 transition-colors" />
        </button>
        <button
          @click="handleExport('nextgrp')"
          class="flex items-center gap-3 p-4 border border-gray-300 rounded-lg hover:bg-green-50 hover:border-green-300 transition-all duration-200 group"
          :disabled="isExporting"
          :class="{ 'opacity-50 cursor-not-allowed': isExporting }"
        >
          <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
            <LucideFileCode class="w-6 h-6 text-green-600" />
          </div>
          <div class="flex-1 text-left">
            <div class="font-semibold text-gray-900">NextGRP Format</div>
            <div class="text-sm text-gray-500">Xuất với đầy đủ thông tin, có thể import lại</div>
          </div>
          <svg v-if="isExporting && exportFormat === 'nextgrp'" class="animate-spin h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <LucideDownload v-else class="w-5 h-5 text-gray-400 group-hover:text-green-600 transition-colors" />
        </button>
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end items-center">
        <PrimeButton
          label="Đóng"
          severity="secondary"
          @click="$emit('update:visible', false)"
          :disabled="isExporting"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { toast, toastPersistent, updateToast, removeToast } from '@/utils/toasts'
import PrimeButton from 'primevue/button'
import Dialog from 'primevue/dialog'
import { ref, h } from 'vue'
import LucideDownload from "~icons/lucide/download"
import LucideFileCode from "~icons/lucide/file-code"
import LucideFileText from "~icons/lucide/file-text"
import LucideImage from "~icons/lucide/image"

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

const emit = defineEmits(['update:visible'])

const isExporting = ref(false)
const exportFormat = ref(null)
let progressToastId = null

// Helper function để cập nhật progress
const updateProgress = (progress, message) => {
  if (progressToastId) {
    updateToast(progressToastId, {
      title: message || `Đang xuất... ${progress}%`,
      text: h('div', { class: 'mt-2' }, [
        h('div', { class: 'w-full bg-gray-200 rounded-full h-2' }, [
          h('div', {
            class: 'bg-blue-600 h-2 rounded-full transition-all duration-300',
            style: { width: `${progress}%` }
          })
        ])
      ])
    })
  }
}

// Export functions
const handleExport = async (format) => {
  if (!props.d3Renderer || !props.d3Renderer.svg) {
    toast({ title: "Không thể xuất sơ đồ", indicator: "red" })
    return
  }

  isExporting.value = true
  exportFormat.value = format
  
  // Tạo progress toast
  const formatName = format === 'png' ? 'PNG' : format === 'pdf' ? 'PDF' : 'NextGRP'
  progressToastId = toastPersistent({
    title: `Đang xuất ${formatName}... 0%`,
    icon: format === 'png' ? 'image' : format === 'pdf' ? 'file-text' : 'file-code',
    background: 'bg-surface-white',
    text: h('div', { class: 'mt-2' }, [
      h('div', { class: 'w-full bg-gray-200 rounded-full h-2' }, [
        h('div', {
          class: 'bg-blue-600 h-2 rounded-full transition-all duration-300',
          style: { width: '0%' }
        })
      ])
    ])
  })
  
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
    
    // Cập nhật toast thành công
    if (progressToastId) {
      updateToast(progressToastId, {
        title: `Xuất ${formatName} thành công!`,
        icon: 'check-circle',
        background: 'bg-surface-green-3',
        text: null,
        timeout: 3
      })
      setTimeout(() => {
        if (progressToastId) {
          removeToast(progressToastId)
          progressToastId = null
        }
      }, 3000)
    }
  } catch (error) {
    console.error('Export error:', error)
    if (progressToastId) {
      updateToast(progressToastId, {
        title: `Lỗi khi xuất: ${error.message}`,
        icon: 'alert-circle',
        background: 'bg-surface-red-3',
        text: null,
        timeout: 5
      })
      setTimeout(() => {
        if (progressToastId) {
          removeToast(progressToastId)
          progressToastId = null
        }
      }, 5000)
    } else {
      toast({ title: `Lỗi khi xuất: ${error.message}`, indicator: "red" })
    }
  } finally {
    isExporting.value = false
    exportFormat.value = null
  }
}

// Helper: Get CSS styles for SVG elements
const getCSSStyles = (parentElement) => {
  const selectorTextArr = []
  
  // Add Parent element Id and Classes
  if (parentElement.id) {
    selectorTextArr.push('#' + parentElement.id)
  }
  for (let c = 0; c < parentElement.classList.length; c++) {
    const className = '.' + parentElement.classList[c]
    if (!selectorTextArr.includes(className)) {
      selectorTextArr.push(className)
    }
  }
  
  // Add Children element Ids and Classes
  const nodes = parentElement.getElementsByTagName('*')
  for (let i = 0; i < nodes.length; i++) {
    const id = nodes[i].id
    if (id && !selectorTextArr.includes('#' + id)) {
      selectorTextArr.push('#' + id)
    }
    
    const classes = nodes[i].classList
    for (let c = 0; c < classes.length; c++) {
      const className = '.' + classes[c]
      if (!selectorTextArr.includes(className)) {
        selectorTextArr.push(className)
      }
    }
  }
  
  // Extract CSS Rules
  let extractedCSSText = ''
  for (let i = 0; i < document.styleSheets.length; i++) {
    const s = document.styleSheets[i]
    
    try {
      if (!s.cssRules) continue
    } catch (e) {
      if (e.name !== 'SecurityError') throw e
      continue
    }
    
    const cssRules = s.cssRules
    for (let r = 0; r < cssRules.length; r++) {
      if (cssRules[r].selectorText && selectorTextArr.some(sel => cssRules[r].selectorText.includes(sel))) {
        extractedCSSText += cssRules[r].cssText
      }
    }
  }
  
  return extractedCSSText
}

// Helper: Append CSS to SVG
const appendCSS = (cssText, element) => {
  const styleElement = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleElement.setAttribute('type', 'text/css')
  styleElement.textContent = cssText
  const refNode = element.hasChildNodes() ? element.children[0] : null
  element.insertBefore(styleElement, refNode)
}

// Helper: Get SVG string with styles
const getSVGString = (svgNode) => {
  svgNode.setAttribute('xlink', 'http://www.w3.org/1999/xlink')
  const cssStyleText = getCSSStyles(svgNode)
  appendCSS(cssStyleText, svgNode)
  
  const serializer = new XMLSerializer()
  let svgString = serializer.serializeToString(svgNode)
  svgString = svgString.replace(/(\w+)?:?xlink=/g, 'xmlns:xlink=') // Fix root xlink without namespace
  svgString = svgString.replace(/NS\d+:href/g, 'xlink:href') // Safari NS namespace fix
  
  return svgString
}

// Helper: Convert images in foreignObject to base64 data URLs
const convertImagesToDataURLs = async (svgElement) => {
  const foreignObjects = svgElement.querySelectorAll('foreignObject')
  const imagePromises = []
  
  for (const fo of foreignObjects) {
    const images = fo.querySelectorAll('img')
    for (const img of images) {
      if (img.src && !img.src.startsWith('data:')) {
        imagePromises.push(
          new Promise((resolve) => {
            const image = new Image()
            image.crossOrigin = 'anonymous'
            image.onload = function() {
              try {
                const canvas = document.createElement('canvas')
                canvas.width = image.width
                canvas.height = image.height
                const ctx = canvas.getContext('2d')
                ctx.drawImage(image, 0, 0)
                const dataURL = canvas.toDataURL('image/png')
                img.src = dataURL
                resolve()
              } catch (e) {
                console.warn('Failed to convert image to data URL:', e)
                resolve() // Continue even if conversion fails
              }
            }
            image.onerror = () => {
              console.warn('Failed to load image:', img.src)
              resolve() // Continue even if image fails to load
            }
            image.src = img.src
          })
        )
      }
    }
  }
  
  await Promise.all(imagePromises)
}

// Helper: Convert SVG string to image blob
const svgString2Image = (svgString, width, height, format = 'png') => {
  return new Promise((resolve, reject) => {
    const imgsrc = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)))
    
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    
    canvas.width = width
    canvas.height = height
    
    const image = new Image()
    image.onload = function() {
      context.clearRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob'))
        }
      }, `image/${format}`)
    }
    
    image.onerror = () => {
      reject(new Error('Failed to load SVG image'))
    }
    
    image.src = imgsrc
  })
}

// Export to PNG - Sử dụng SVG string conversion như ví dụ
const exportToPNG = async (fileName) => {
  try {
    updateProgress(10, 'Đang chuẩn bị xuất PNG...')
    
    // 1. Lấy SVG element từ d3Renderer
    const svgElement = props.d3Renderer.svg.node()
    if (!svgElement) {
      throw new Error("SVG element not found")
    }
    
    updateProgress(20, 'Đang đợi render hoàn tất...')
    // 2. Đợi Vue components render xong và đảm bảo tất cả images load xong
    await new Promise(resolve => requestAnimationFrame(resolve))
    await new Promise(resolve => requestAnimationFrame(resolve))
    await new Promise(resolve => setTimeout(resolve, 500))
    
    updateProgress(30, 'Đang tính toán kích thước...')
    // 3. Tính bounding box từ tất cả nodes (giống như fitView)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    
    if (props.d3Renderer && props.d3Renderer.positions && props.d3Renderer.nodes) {
      props.d3Renderer.nodes.forEach(node => {
        const pos = props.d3Renderer.positions.get(node.id)
        if (pos) {
          const size = props.d3Renderer.nodeSizeCache?.get(node.id) || 
                      props.d3Renderer.estimateNodeSize?.(node) || 
                      { width: 200, height: 100 }
          
          minX = Math.min(minX, pos.x)
          minY = Math.min(minY, pos.y)
          maxX = Math.max(maxX, pos.x + size.width)
          maxY = Math.max(maxY, pos.y + size.height)
        }
      })
    }
    
    // Nếu không tính được từ positions, fallback to getBBox
    if (minX === Infinity) {
      const bbox = svgElement.getBBox()
      minX = bbox.x
      minY = bbox.y
      maxX = bbox.x + bbox.width
      maxY = bbox.y + bbox.height
    }
    
    const padding = 40
    const width = Math.max(maxX - minX + padding * 2, 800)
    const height = Math.max(maxY - minY + padding * 2, 600)
    
    updateProgress(40, 'Đang xử lý SVG...')
    // 4. Clone SVG để không ảnh hưởng đến SVG gốc
    const clonedSvg = svgElement.cloneNode(true)
    
    // 5. Reset transform để show full content
    const mainGroup = clonedSvg.querySelector('g')
    if (mainGroup) {
      mainGroup.removeAttribute('transform')
    }
    
    updateProgress(50, 'Đang chuyển đổi hình ảnh...')
    // 6. Convert images trong foreignObject thành base64 data URLs
    await convertImagesToDataURLs(clonedSvg)
    
    updateProgress(70, 'Đang tạo hình ảnh PNG...')
    // 7. Set viewBox và dimensions
    clonedSvg.setAttribute('viewBox', `${minX - padding} ${minY - padding} ${width} ${height}`)
    clonedSvg.setAttribute('width', width)
    clonedSvg.setAttribute('height', height)
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    
    // 8. Get SVG string with styles
    const svgString = getSVGString(clonedSvg)
    
    // 9. Convert to image blob với scale 2x cho chất lượng cao
    const blob = await svgString2Image(svgString, width * 2, height * 2, 'png')
    
    updateProgress(90, 'Đang tải xuống...')
    // 10. Download image
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
    
    updateProgress(100, 'Hoàn tất!')
    
  } catch (error) {
    console.error('Export PNG error:', error)
    throw error
  }
}

// Export to PDF - Sử dụng cùng logic như PNG, sau đó convert PNG sang PDF
const exportToPDF = async (fileName) => {
  try {
    updateProgress(10, 'Đang chuẩn bị xuất PDF...')
    
    // 1. Lấy SVG element từ d3Renderer
    const svgElement = props.d3Renderer.svg.node()
    if (!svgElement) {
      throw new Error("SVG element not found")
    }
    
    updateProgress(20, 'Đang đợi render hoàn tất...')
    // 2. Đợi Vue components render xong và đảm bảo tất cả images load xong
    await new Promise(resolve => requestAnimationFrame(resolve))
    await new Promise(resolve => requestAnimationFrame(resolve))
    await new Promise(resolve => setTimeout(resolve, 500))
    
    updateProgress(30, 'Đang tính toán kích thước...')
    // 3. Tính bounding box từ tất cả nodes (giống như PNG export)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    
    if (props.d3Renderer && props.d3Renderer.positions && props.d3Renderer.nodes) {
      props.d3Renderer.nodes.forEach(node => {
        const pos = props.d3Renderer.positions.get(node.id)
        if (pos) {
          const size = props.d3Renderer.nodeSizeCache?.get(node.id) || 
                      props.d3Renderer.estimateNodeSize?.(node) || 
                      { width: 200, height: 100 }
          
          minX = Math.min(minX, pos.x)
          minY = Math.min(minY, pos.y)
          maxX = Math.max(maxX, pos.x + size.width)
          maxY = Math.max(maxY, pos.y + size.height)
        }
      })
    }
    
    // Nếu không tính được từ positions, fallback to getBBox
    if (minX === Infinity) {
      const bbox = svgElement.getBBox()
      minX = bbox.x
      minY = bbox.y
      maxX = bbox.x + bbox.width
      maxY = bbox.y + bbox.height
    }
    
    const padding = 40
    const width = Math.max(maxX - minX + padding * 2, 800)
    const height = Math.max(maxY - minY + padding * 2, 600)
    
    updateProgress(40, 'Đang xử lý SVG...')
    // 4. Clone SVG để không ảnh hưởng đến SVG gốc
    const clonedSvg = svgElement.cloneNode(true)
    
    // 5. Reset transform để show full content
    const mainGroup = clonedSvg.querySelector('g')
    if (mainGroup) {
      mainGroup.removeAttribute('transform')
    }
    
    updateProgress(50, 'Đang chuyển đổi hình ảnh...')
    // 6. Convert images trong foreignObject thành base64 data URLs
    await convertImagesToDataURLs(clonedSvg)
    
    updateProgress(60, 'Đang tạo hình ảnh PNG...')
    // 7. Set viewBox và dimensions
    clonedSvg.setAttribute('viewBox', `${minX - padding} ${minY - padding} ${width} ${height}`)
    clonedSvg.setAttribute('width', width)
    clonedSvg.setAttribute('height', height)
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    
    // 8. Get SVG string with styles
    const svgString = getSVGString(clonedSvg)
    
    // 9. Convert SVG to PNG blob (giống như PNG export)
    const pngBlob = await svgString2Image(svgString, width * 2, height * 2, 'png')
    
    updateProgress(75, 'Đang tạo PDF...')
    // 10. Load PNG vào Image và vẽ lên canvas
    const image = new Image()
    const imageUrl = URL.createObjectURL(pngBlob)
    
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = imageUrl
    })
    
    // 11. Import jsPDF và tạo PDF từ PNG
    // Import jsPDF - xử lý cả default và named export
    const jsPDFModule = await import('jspdf')
    const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF || jsPDFModule
    
    // Tính kích thước PDF (mm)
    const pdfWidth = (width * 2) * 0.264583 // Convert px to mm (1px = 0.264583mm)
    const pdfHeight = (height * 2) * 0.264583
    
    // Tạo PDF với kích thước phù hợp
    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [pdfWidth, pdfHeight]
    })
    
    // Thêm PNG vào PDF
    pdf.addImage(image, 'PNG', 0, 0, pdfWidth, pdfHeight)
    
    updateProgress(90, 'Đang tải xuống...')
    // Download PDF
    pdf.save(fileName)
    
    // Cleanup
    URL.revokeObjectURL(imageUrl)
    
    updateProgress(100, 'Hoàn tất!')
    
  } catch (error) {
    console.error('Export PDF error:', error)
    throw error
  }
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
  toast({ title: "Đang tải xuống định dạng NextGRP...", indicator: "green" })
}
</script>
