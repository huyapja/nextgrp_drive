/**
 * Mindmap Image Upload Utilities
 * Xử lý upload ảnh cho mindmap với chunked upload
 */

/**
 * Upload ảnh vào mindmap với chunked upload
 * @param {File} file - File ảnh cần upload
 * @param {string} team - Team name
 * @param {string} mindmapEntityName - Entity name của mindmap
 * @param {boolean} isPrivate - Mindmap có private không
 * @returns {Promise<string>} - URL của ảnh đã upload
 */
export async function uploadImageToMindmap(file, team, mindmapEntityName, isPrivate = false) {
  const { v4: uuidv4 } = await import('uuid')
  const fileUuid = uuidv4()
  const chunkSize = 5 * 1024 * 1024 // 5MB
  let chunkByteOffset = 0
  let chunkIndex = 0
  const totalChunks = Math.ceil(file.size / chunkSize)

  while (chunkByteOffset < file.size) {
    const currentChunk = file.slice(chunkByteOffset, chunkByteOffset + chunkSize)
    const response = await uploadChunk(
      file.name,
      team,
      currentChunk,
      fileUuid,
      file.size,
      file.type,
      chunkIndex,
      chunkSize,
      totalChunks,
      chunkByteOffset,
      mindmapEntityName,
      isPrivate
    )

    if (chunkIndex === totalChunks - 1) {
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`)
      }
      const data = await response.json()
      // Return embed URL - sử dụng absolute URL
      const imageUrl = `${window.location.origin}/api/method/drive.api.embed.get_file_content?embed_name=${data.message.name}&parent_entity_name=${mindmapEntityName}`
      
      return imageUrl
    }

    chunkByteOffset += chunkSize
    chunkIndex++
  }
}

/**
 * Upload một chunk của file
 * @private
 */
async function uploadChunk(
  fileName,
  team,
  currentChunk,
  fileUuid,
  fileSize,
  fileType,
  chunkIndex,
  chunkSize,
  totalChunks,
  chunkByteOffset,
  mindmapEntityName,
  isPrivate
) {
  const formData = new FormData()
  formData.append('filename', fileName)
  formData.append('team', team)
  formData.append('total_file_size', fileSize)
  formData.append('mime_type', fileType)
  formData.append('total_chunk_count', totalChunks)
  formData.append('chunk_byte_offset', chunkByteOffset)
  formData.append('chunk_index', chunkIndex)
  formData.append('chunk_size', chunkSize)
  formData.append('file', currentChunk)
  formData.append('parent', mindmapEntityName)
  formData.append('embed', 1)
  formData.append('personal', isPrivate ? 1 : 0)
  formData.append('uuid', fileUuid)

  return fetch(window.location.origin + '/api/method/drive.api.files.upload_file', {
    method: 'POST',
    body: formData,
    headers: {
      'X-Frappe-CSRF-Token': window.csrf_token,
      'Accept': 'application/json',
    }
  })
}

