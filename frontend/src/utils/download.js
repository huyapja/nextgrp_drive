import editorStyle from "@/components/DocEditor/editor.css?inline"
import globalStyle from "@/index.css?inline"
import html2pdf from "html2pdf.js"
import JSZip from "jszip"
import { printDoc } from "./files"
import { removeToast, toast, toastPersistent, updateToast } from "./toasts"

async function getPdfFromDoc(entity_name) {
  const res = await fetch(
    `/api/method/drive.api.files.get_file_content?entity_name=${entity_name}`
  )
  const raw_html = (await res.json()).message
  const content = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>${globalStyle}</style>
              <style>${editorStyle}</style>
            </head>
            <body>
              <div class="Prosemirror prose-sm" style='padding-left: 40px; padding-right: 40px; padding-top: 20px; padding-bottom: 20px; margin: 0;'>
                ${raw_html}
              </div>
            </body>
          </html>
        `

  const pdfBlob = html2pdf().from(content).toPdf()
  await pdfBlob
  return pdfBlob.prop.pdf.output("arraybuffer")
}

export async function entitiesDownload(team, entities) {
  // Log activity
  if (entities.length > 0) {
    try {
      await fetch(`/api/method/drive.api.activity.create_new_entity_activity_log`, {
        method: "POST",
        headers: {
          "X-Frappe-CSRF-Token": window.csrf_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entity: entities[0].name,
          action_type: "download",
        }),
      })
    } catch (e) {
      console.warn("Failed to log activity:", e)
    }
  }
  
  // ✅ Xử lý download 1 entity
  if (entities.length === 1) {
    const entity = entities[0]
    
    // Xử lý frappe doc
    if (entity.mime_type === "frappe_doc") {
      try {
        const response = await fetch(
          `/api/method/drive.api.files.get_file_content?entity_name=${entity.name}&trigger_download=1`
        )
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`)
        }
        const raw_html = (await response.json()).message
        printDoc(raw_html)
      } catch (error) {
        console.error("Error downloading frappe doc:", error)
        toast(`Lỗi tải xuống: ${error.message}`)
      }
      return
    }
    
    // Xử lý folder
    if (entity.is_group) {
      return folderDownload(team, entity)
    }
    
    // ✅ Xử lý file thông thường - trigger native browser download dialog ngay lập tức
    try {
      // ✅ FIX: Dùng native <a> tag với download attribute
      // Điều này sẽ:
      // 1. Hiển thị ngay Save As dialog (không đợi API)
      // 2. File xuất hiện ở Recent downloads
      // 3. Progress bar hiển thị như tải file bình thường
      const downloadUrl = `/api/method/drive.api.files.get_file_content?entity_name=${entity.name}&trigger_download=1&_t=${Date.now()}`
      
      console.log("📥 Downloading file:", entity.title)
      
      // Tạo link ẩn với download attribute
      const downloadLink = document.createElement('a')
      downloadLink.href = downloadUrl
      downloadLink.download = entity.title // Trigger Save As dialog ngay
      downloadLink.style.display = 'none'
      
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
      
      toast(`📥 Đang tải xuống ${entity.title}...`)
      
    } catch (error) {
      console.error("❌ Error downloading file:", error)
      toast(`❌ Lỗi tải xuống: ${error.message}`)
    }
    return
  }

  // ✅ Xử lý download nhiều entities
  const toastId = toastPersistent("📦 Đang chuẩn bị tải xuống...")
  const zip = new JSZip()

  const processEntity = async (entity, parentFolder) => {
    if (entity.is_group) {
      const folder = parentFolder.folder(entity.title)
      return get_children(team, entity.name).then((children) => {
        const promises = children.map((childEntity) =>
          processEntity(childEntity, folder)
        )
        return Promise.all(promises)
      })
    } else if (entity.document) {
      const content = await getPdfFromDoc(entity.name)
      parentFolder.file(entity.title + ".pdf", content)
    } else {
      const fileContent = await get_file_content(entity.name)
      parentFolder.file(entity.title, fileContent)
    }
  }

  const promises = entities.map((entity) => processEntity(entity, zip))

  Promise.all(promises)
    .then(() => {
      updateToast(toastId, { title: "📦 Đang nén file..." })
      return zip.generateAsync({ type: "blob", streamFiles: true })
    })
    .then(async function (content) {
      updateToast(toastId, { title: "⬇️ Đang tải xuống..." })
      
      const blobUrl = URL.createObjectURL(content)
      var downloadLink = document.createElement("a")
      downloadLink.href = blobUrl
      downloadLink.download = "Drive Download " + +new Date() + ".zip"

      document.body.appendChild(downloadLink)
      downloadLink.click()
      
      // ✅ FIX: Cleanup blob URL sau khi click
      setTimeout(() => {
        document.body.removeChild(downloadLink)
        URL.revokeObjectURL(blobUrl)
      }, 100)
      
      updateToast(toastId, {
        title: "✅ Tải xuống hoàn tất!",
        icon: "check-circle",
      })
      
      // Remove toast after 3 seconds
      setTimeout(() => {
        removeToast(toastId)
      }, 3000)
    })
    .catch((error) => {
      console.error("❌ Download error:", error)
      updateToast(toastId, {
        title: `❌ Lỗi tải xuống: ${error.message}`,
        icon: "alert-circle",
        background: "bg-surface-red-3",
      })
      
      // Remove error toast after 5 seconds
      setTimeout(() => {
        removeToast(toastId)
      }, 5000)
    })
}

export function folderDownload(team, root_entity) {
  const folderName = root_entity.title
  const toastId = toastPersistent(`📦 Đang tải folder dưới dạng ZIP...`)
  
  // ✅ OPTIMIZED: Call backend API to create ZIP directly
  const zipUrl = `/api/method/drive.api.files.download_folder_as_zip?entity_name=${root_entity.name}&_t=${Date.now()}`
  
  fetch(zipUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`API failed: ${response.status}`)
      }
      
      return response.blob().then((blob) => {
        // ✅ Use native download
        const blobUrl = URL.createObjectURL(blob)
        const downloadLink = document.createElement("a")
        downloadLink.href = blobUrl
        downloadLink.download = folderName + ".zip"
        
        document.body.appendChild(downloadLink)
        downloadLink.click()
        
        // Cleanup
        setTimeout(() => {
          document.body.removeChild(downloadLink)
          URL.revokeObjectURL(blobUrl)
        }, 100)
        
        // Update toast to success
        updateToast(toastId, {
          title: `✅ Tải xuống thư mục "${folderName}" hoàn tất!`,
          icon: "check-circle",
        })
        
        // Remove toast after 3 seconds
        setTimeout(() => {
          removeToast(toastId)
        }, 3000)
      })
    })
    .catch((error) => {
      console.error("❌ Folder download error:", error)
      updateToast(toastId, {
        title: `❌ Lỗi tải xuống: ${error.message}`,
        icon: "alert-circle",
        background: "bg-surface-red-3",
      })
      
      // Remove error toast after 5 seconds
      setTimeout(() => {
        removeToast(toastId)
      }, 5000)
    })
}

function get_file_content(entity_name) {
  const fileUrl =
    "/api/method/" +
    `drive.api.files.get_file_content?entity_name=${entity_name}`

  return fetch(fileUrl).then((response) => {
    if (response.ok) {
      return response.blob()
    } else if (response.status === 204) {
      console.log(response)
    } else {
      throw new Error(`Request failed with status ${response.status}`)
    }
  })
}

// ✅ FIX: Sử dụng API đơn giản hơn dành riêng cho download
function get_children(team, entity_name) {
  // Option 1: Dùng API mới (đơn giản hơn)
  const url = `/api/method/drive.api.files.get_folder_children?entity_name=${entity_name}`
  
  return fetch(url, {
    method: "GET",
    headers: {
      "X-Frappe-CSRF-Token": window.csrf_token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }
      return response.json()
    })
    .then((json) => {
      const children = json.message || []
      console.log(`✅ get_children(${entity_name}): Found ${children.length} items`)
      return children
    })
    .catch((error) => {
      console.error(`❌ Error in get_children(${entity_name}):`, error)
      throw error
    })
}