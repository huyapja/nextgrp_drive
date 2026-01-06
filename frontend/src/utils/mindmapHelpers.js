export function generateNodeId(userId) {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 10000)
  const userHash = userId ? userId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0)
    return a & a
  }, 0) : 0
  return `node-${timestamp}-${Math.abs(userHash)}-${random}`
}

export function extractTitleFromLabel(label) {
  const raw = (label || '').trim()
  if (!raw) return ''
  if (!raw.includes('<')) return raw

  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = raw

  const paragraphs = Array.from(tempDiv.querySelectorAll('p'))
  for (const p of paragraphs) {
    if (!p.closest('blockquote')) {
      const text = (p.textContent || '').trim()
      if (text) return text
    }
  }

  return (tempDiv.textContent || '').trim()
}

export function getTaskOpenUrl(taskId, projectId) {
  if (!taskId || !projectId) return ''
  if (typeof window === 'undefined') return ''
  const origin = window.location.origin
  return `${origin}/mtp/project/${projectId}?task_id=${taskId}`
}

export function getDefaultTaskLink(nodeId, team, mindmapId) {
  if (typeof window === 'undefined') return ''
  const origin = window.location.origin
  const driveCopyUrl = `${origin}/drive/t/${team}/mindmap/${mindmapId}#node-${nodeId}`
  return `${origin}/mtp/my-drive?drive_copy=${encodeURIComponent(driveCopyUrl)}`
}

export function resolveTaskLinkNode(val, nodes) {
  if (!val) return null
  if (typeof val === 'string') {
    return nodes.find((n) => n.id === val) || null
  }
  if (val.id) return val
  return null
}

