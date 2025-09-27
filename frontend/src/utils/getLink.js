import { toast } from "@/utils/toasts.js"
import router from "../router.js"

export function getLinkStem(entity) {
  return `${
    {
      true: "file",
      [new Boolean(entity.is_group)]: "folder",
      [new Boolean(entity.document)]: "document",
    }[true]
  }/${entity.name}`
}

export function getLink(entity, copy = true, withDomain = true, asShareable = true) {
  const team = router.currentRoute.value.params.team
  let link = entity.is_link
    ? entity.path
    : `${
        withDomain ? window.location.origin + "/drive" : ""
      }/t/${team}/${getLinkStem(entity)}`

  // Nếu yêu cầu shareable link, wrap trong parent app URL
  if (asShareable) {
    const parentOrigin = getParentAppOrigin()
    const parentPath = "/mtp/my-drive" // Có thể config được
    
    // Đảm bảo drive_copy parameter được preserve
    const shareableUrl = buildShareableUrl(parentOrigin, parentPath, link)
    link = shareableUrl
  }

  if (!copy) return link
  
  try {
    const successMessage = asShareable ? __("Shareable link copied") : __("Copied link")
    copyToClipboard(link).then(() => toast(successMessage))
  } catch (err) {
    if (err.name === "NotAllowedError") {
      toast({
        icon: "alert-triangle",
        iconClasses: "text-red-700",
        title: __("Clipboard permission denied"),
        position: "bottom-right",
      })
    } else {
      console.error(__("Failed to copy link:"), err)
    }
  }
}

// Helper function để build shareable URL với query preservation
function buildShareableUrl(parentOrigin, parentPath, driveLink) {
  try {
    const parentUrl = new URL(parentPath, parentOrigin)
    
    // Encode drive link để đảm bảo safe
    const encodedDriveLink = encodeURIComponent(driveLink)
    
    // Set drive_copy parameter
    parentUrl.searchParams.set('drive_copy', encodedDriveLink)
    
    return parentUrl.toString()
  } catch (error) {
    console.error('Error building shareable URL:', error)
    // Fallback to simple string concatenation
    const encodedDriveLink = encodeURIComponent(driveLink)
    return `${parentOrigin}${parentPath}?drive_copy=${encodedDriveLink}`
  }
}

// Updated getParentAppOrigin functions
function getParentAppOrigin() {
  const currentOrigin = window.location.origin
  const currentHost = window.location.host
  const protocol = window.location.protocol
  
  // Development: localhost với port
  if (currentOrigin.includes(':8080')) {
    return currentOrigin.replace(':8080', ':8081')
  }
  
  // Production: Frappe framework patterns
  
  // Case 1: Drive service chạy trên port khác (domain.com:8080 → domain.com)
  if (currentHost.includes(':') && !currentHost.includes(':80') && !currentHost.includes(':443')) {
    const hostname = currentHost.split(':')[0]
    return `${protocol}//${hostname}`
  }
  
  // Case 2: Drive service là subdomain (drive.domain.com → domain.com)
  if (currentHost.startsWith('drive.')) {
    const mainDomain = currentHost.replace('drive.', '')
    return `${protocol}//${mainDomain}`
  }
  
  // Case 3: Drive service có prefix/suffix khác
  if (currentHost.includes('-drive.')) {
    const mainDomain = currentHost.replace('-drive', '')
    return `${protocol}//${mainDomain}`
  }
  
  // Case 4: Cùng domain, khác path (most common cho Frappe)
  return currentOrigin
}


// Helper function để check xem có đang chạy trong iframe không
export function isRunningInIframe() {
  try {
    return window.self !== window.top
  } catch (e) {
    return true
  }
}

// Helper function để communicate với parent window
export function notifyParentOfNavigation(path) {
  if (isRunningInIframe()) {
    try {
      window.parent.postMessage({
        type: 'DRIVE_NAVIGATION',
        path: path,
        fullUrl: window.location.href
      }, '*')
    } catch (e) {
      console.warn('Could not notify parent of navigation:', e)
    }
  }
}

const copyToClipboard = (str) => {
  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(str)
  } else {
    // Fallback to the legacy clipboard API
    const textArea = document.createElement("textarea")
    textArea.value = str
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand("copy")
    document.body.removeChild(textArea)
    return Promise.resolve()
  }
}