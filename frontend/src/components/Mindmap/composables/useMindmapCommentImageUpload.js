// composables/useMindmapCommentImageUpload.js

export function useMindmapCommentImageUpload({ route, isPrivate }) {
  // -----------------------------
  // 1) Hàm upload chunked → trả URL embed
  // -----------------------------
  async function uploadImageGeneric(file, parentEntityName) {
    const { v4: uuidv4 } = await import("uuid")
    const fileUuid = uuidv4()

    const chunkSize = 5 * 1024 * 1024
    let chunkByteOffset = 0
    let chunkIndex = 0
    const totalChunks = Math.ceil(file.size / chunkSize)

    while (chunkByteOffset < file.size) {
      const currentChunk = file.slice(
        chunkByteOffset,
        chunkByteOffset + chunkSize
      )

      const formData = new FormData()
      formData.append("filename", file.name)
      formData.append("team", route.params.team)
      formData.append("total_file_size", file.size)
      formData.append("mime_type", file.type)
      formData.append("total_chunk_count", totalChunks)
      formData.append("chunk_byte_offset", chunkByteOffset)
      formData.append("chunk_index", chunkIndex)
      formData.append("chunk_size", chunkSize)
      formData.append("file", currentChunk)
      formData.append("parent", parentEntityName)
      formData.append("embed", 1)
      formData.append("personal", isPrivate.value ? 1 : 0)
      formData.append("uuid", fileUuid)

      const res = await fetch("/api/method/drive.api.files.upload_file", {
        method: "POST",
        body: formData,
        headers: {
          "X-Frappe-CSRF-Token": window.csrf_token,
          Accept: "application/json",
        },
      })

      // → Chunk cuối: trả URL embed
      if (chunkIndex === totalChunks - 1) {
        const data = await res.json()
        return `${window.location.origin}/api/method/drive.api.embed.get_file_content?embed_name=${data.message.name}&parent_entity_name=${parentEntityName}`
      }

      chunkByteOffset += chunkSize
      chunkIndex++
    }
  }

  // -----------------------------
  // 2) Hàm mở dialog chọn ảnh + trả list URL
  // -----------------------------
  async function pickAndUploadImages(entityName) {
    return new Promise((resolve) => {
      const input = document.createElement("input")
      input.type = "file"
      // ⚠️ FIX: Chỉ định rõ các định dạng ảnh được phép, không dùng image/* để tránh chọn "Tất cả tệp tin"
      input.accept = ".jpg,.jpeg,.png,.gif,.webp,.bmp,.svg"
      input.multiple = true
      input.setAttribute("data-upload-image-to-comment", "true")
      input.style.display = "none"
      document.body.appendChild(input)

      input.onchange = async () => {
        const files = Array.from(input.files || [])
        input.remove()

        if (!files.length) return resolve([])

        // ⚠️ CRITICAL: Validate file types để đảm bảo chỉ upload ảnh
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml']
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
        const validFiles = files.filter(file => {
          const fileName = file.name.toLowerCase()
          const fileExtension = fileName.substring(fileName.lastIndexOf('.'))
          return allowedTypes.includes(file.type) || allowedExtensions.includes(fileExtension)
        })

        if (validFiles.length !== files.length) {
          console.warn("Một số file không phải là ảnh đã bị loại bỏ")
        }

        if (!validFiles.length) {
          return resolve([])
        }

        const urls = []
        try {
          for (const file of validFiles) {
            const url = await uploadImageGeneric(file, entityName)
            urls.push(url)
          }
        } catch (err) {
          console.error("Upload image failed:", err)
        }

        resolve(urls)
      }

      input.click()
    })
  }

  async function uploadImageFiles(files, entityName) {
    if (!files?.length) return []

    // ⚠️ CRITICAL: Validate file types để đảm bảo chỉ upload ảnh
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml']
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
    const validFiles = files.filter(file => {
      const fileName = file.name?.toLowerCase() || ''
      const fileExtension = fileName.substring(fileName.lastIndexOf('.'))
      return allowedTypes.includes(file.type) || allowedExtensions.includes(fileExtension)
    })

    if (!validFiles.length) return []

    const urls = []
    try {
      for (const file of validFiles) {
        const url = await uploadImageGeneric(file, entityName)
        urls.push(url)
      }
    } catch (err) {
      console.error("Upload pasted image failed:", err)
    }

    return urls
  }

  return {
    uploadImageGeneric,
    pickAndUploadImages,
    uploadImageFiles
  }
}
