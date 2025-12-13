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
      input.accept = "image/*"
      input.multiple = true
      input.setAttribute("data-upload-image-to-comment", "true")
      input.style.display = "none"
      document.body.appendChild(input)

      input.onchange = async () => {
        const files = Array.from(input.files || [])
        input.remove()

        if (!files.length) return resolve([])

        const urls = []
        try {
          for (const file of files) {
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

    const urls = []
    try {
      for (const file of files) {
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
