class ThumbnailQueue {
  constructor(maxConcurrent = 2, timeoutMs = 10000) {
    this.queue = []
    this.running = 0
    this.maxConcurrent = maxConcurrent
    this.timeoutMs = timeoutMs
    this.cache = new Map()
    this.controllers = new Map()
  }

  add(entityName, callback) {
    if (this.cache.has(entityName)) {
      callback(this.cache.get(entityName))
      return () => {}
    }

    let cancelled = false
    const task = {
      entityName,
      callback: (result) => {
        if (!cancelled) callback(result)
      },
    }

    this.queue.push(task)
    this.process()

    return () => {
      cancelled = true
      const idx = this.queue.indexOf(task)
      if (idx > -1) this.queue.splice(idx, 1)
      const controller = this.controllers.get(entityName)
      if (controller) {
        controller.abort()
        this.controllers.delete(entityName)
      }
    }
  }

  async process() {
    if (this.running >= this.maxConcurrent || !this.queue.length) return

    const task = this.queue.shift()
    this.running++

    const controller = new AbortController()
    this.controllers.set(task.entityName, controller)

    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const url = `/api/method/drive.api.files.get_thumbnail?entity_name=${task.entityName}`
      const response = await fetch(url, { signal: controller.signal })

      if (response.ok) {
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        this.cache.set(task.entityName, objectUrl)
        task.callback(objectUrl)
      } else {
        task.callback(null)
      }
    } catch (e) {
      task.callback(null)
    } finally {
      clearTimeout(timeoutId)
      this.controllers.delete(task.entityName)
      this.running--
      this.process()
    }
  }

  clearCache() {
    this.cache.forEach((url) => URL.revokeObjectURL(url))
    this.cache.clear()
  }
}

export const thumbnailQueue = new ThumbnailQueue(2, 10000)

export function useThumbnail(entityName, fileType, isGroup) {
  const HTML_THUMBNAILS = ["Markdown", "Code", "Text", "Document", "MindMap"]
  const IMAGE_THUMBNAILS = ["Image", "Video", "PDF", "Presentation", "Link"]

  const isImage = IMAGE_THUMBNAILS.includes(fileType)
  const needsThumbnail = isImage || HTML_THUMBNAILS.includes(fileType)

  return {
    needsThumbnail: needsThumbnail && !isGroup,
    isImage,
    loadThumbnail: (callback) => {
      if (!needsThumbnail || isGroup || !entityName) {
        callback(null)
        return () => {}
      }
      return thumbnailQueue.add(entityName, callback)
    },
  }
}

