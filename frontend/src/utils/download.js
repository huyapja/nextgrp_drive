import editorStyle from "@/components/DocEditor/editor.css?inline"
import globalStyle from "@/index.css?inline"
import html2pdf from "html2pdf.js"
import JSZip from "jszip"
import { printDoc } from "./files"
import { toast } from "./toasts"

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
    
    // ✅ Xử lý file thông thường - thêm error handling
    try {
      // Thêm CSRF token vào URL để tránh lỗi 403
      const downloadUrl = `/api/method/drive.api.files.get_file_content?entity_name=${entity.name}&trigger_download=1&_csrf_token=${window.csrf_token}`
      
      console.log("Downloading file:", entity.title, "URL:", downloadUrl)
      
      // Trigger download
      window.location.href = downloadUrl
      toast(`Đang tải xuống ${entity.title}...`)
      
    } catch (error) {
      console.error("Error downloading file:", error)
      toast(`Lỗi tải xuống: ${error.message}`)
    }
    return
  }

  // ✅ Xử lý download nhiều entities
  const t = toast("Đang chuẩn bị tải xuống...")
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
      return zip.generateAsync({ type: "blob", streamFiles: true })
    })
    .then(async function (content) {
      var downloadLink = document.createElement("a")
      downloadLink.href = URL.createObjectURL(content)
      downloadLink.download = "Drive Download " + +new Date() + ".zip"

      document.body.appendChild(downloadLink)

      downloadLink.click()
      document.body.removeChild(downloadLink)
      
      const toastElement = document.getElementById(t)
      if (toastElement) {
        toastElement.remove()
      }
      toast("Tải xuống hoàn tất!")
    })
    .catch((error) => {
      console.error("Download error:", error)
      const toastElement = document.getElementById(t)
      if (toastElement) {
        toastElement.remove()
      }
      toast(`Lỗi tải xuống: ${error.message}`)
    })
}

export function folderDownload(team, root_entity) {
  const folderName = root_entity.title
  const zip = new JSZip()
  const rootFolder = zip.folder(root_entity.title)
  
  const t = toast("Đang chuẩn bị tải xuống...")
  
  temp(team, root_entity.name, rootFolder)
    .then(() => {
      return zip.generateAsync({ type: "blob", streamFiles: true })
    })
    .then((content) => {
      const downloadLink = document.createElement("a")
      downloadLink.href = URL.createObjectURL(content)
      downloadLink.download = folderName + ".zip"

      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
      
      // Xóa toast
      const toastElement = document.getElementById(t)
      if (toastElement) {
        toastElement.remove()
      }
    })
    .catch((error) => {
      console.error("Download error:", error)
      toast("Lỗi khi tải xuống: " + error.message)
    })
}

function temp(team, entity_name, parentZip) {
  return new Promise((resolve, reject) => {
    get_children(team, entity_name)
      .then((result) => {
        console.log(`Found ${result.length} children in ${entity_name}`)
        
        if (result.length === 0) {
          resolve()
          return
        }
        
        const promises = result.map((entity) => {
          if (entity.is_group) {
            const folder = parentZip.folder(entity.title)
            return temp(team, entity.name, folder)
          }
          if (entity.document) {
            return getPdfFromDoc(entity.name).then((content) =>
              parentZip.file(entity.title + ".pdf", content)
            )
          } else {
            return get_file_content(entity.name).then((fileContent) => {
              parentZip.file(entity.title, fileContent)
            })
          }
        })

        Promise.all(promises)
          .then(() => {
            resolve()
          })
          .catch((error) => {
            console.error(`Error processing children of ${entity_name}:`, error)
            reject(error)
          })
      })
      .catch((error) => {
        console.error(`Error getting children of ${entity_name}:`, error)
        reject(error)
      })
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