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

export function getLink(entity, copy = true, withDomain = true, asShareable = false) {
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
    const encodedDriveLink = encodeURIComponent(link)
    link = `${parentOrigin}${parentPath}?drive_copy=${encodedDriveLink}`
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



// Helper function để detect parent app origin
function getParentAppOrigin() {
  const currentOrigin = window.location.origin
  
  // Nếu đang chạy trên port 8080 (drive service), 
  // thì parent app thường ở port 8081
  if (currentOrigin.includes(':8080')) {
    return currentOrigin.replace(':8080', ':8081')
  }
  
  // Nếu không phải localhost hoặc port khác, 
  // có thể cần config riêng
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