import { toast } from "@/utils/toasts.js";
import router from "../router.js";

// Global variable để lưu parent domain
let cachedParentDomain = null;

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
    : `${withDomain ? window.location.origin + "/drive" : ""}/t/${team}/${getLinkStem(entity)}`

  if (asShareable) {
    getParentAppOrigin().then(parentOrigin => {
      console.log('Parent origin determined as:', parentOrigin)
      const parentPath = "/mtp/my-drive"
      const shareableUrl = buildShareableUrl(parentOrigin, parentPath, link)
      
      // Thực hiện copy với shareable URL
      performCopy(shareableUrl, copy, asShareable)
    }).catch(err => {
      console.warn('Could not get parent origin, using current origin:', err)
      // Fallback to current origin
      const parentPath = "/mtp/my-drive"
      const shareableUrl = buildShareableUrl(window.location.origin, parentPath, link)
      performCopy(shareableUrl, copy, asShareable)
    })
    return // Exit early for async handling
  }

  // Non-shareable link - immediate copy
  performCopy(link, copy, asShareable)
}

// Extracted copy logic
function performCopy(link, copy, asShareable) {
  if (!copy) return link
  
  try {
    // Method 1: execCommand (hoạt động trong hầu hết trường hợp)
    const textArea = document.createElement('textarea');
    textArea.value = link;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (successful) {
      const successMessage = asShareable ? __("Đã sao chép link") : __("Đã sao chép link")
      toast(successMessage);
    } else {
      throw new Error('execCommand failed');
    }
  } catch (err) {
    console.warn('Auto copy failed, showing manual copy option:', err);
    
    // Fallback: Show prompt for manual copy
    setTimeout(() => {
      const result = window.prompt(
        __("Please copy this link manually:"), 
        link
      );
      if (result !== null) {
        toast(__("Link ready to paste"));
      }
    }, 100);
  }
}

// Helper function để build shareable URL
function buildShareableUrl(parentOrigin, parentPath, driveLink) {
  try {
    const parentUrl = new URL(parentPath, parentOrigin)
    
    // Đảm bảo chỉ encode 1 lần
    const encodedDriveLink = encodeURIComponent(driveLink)
    parentUrl.searchParams.set('drive_copy', encodedDriveLink)
    
    const finalUrl = parentUrl.toString()
    console.log('Drive link original:', driveLink)
    console.log('Drive link encoded:', encodedDriveLink)
    console.log('Built shareable URL:', finalUrl)
    
    return finalUrl
  } catch (error) {
    console.error('Error building shareable URL:', error)
    // Fallback: manual construction
    const encodedDriveLink = encodeURIComponent(driveLink)
    const fallbackUrl = `${parentOrigin}${parentPath}?drive_copy=${encodedDriveLink}`
    console.log('Fallback URL:', fallbackUrl)
    return fallbackUrl
  }
}

// Updated getParentAppOrigin function - now returns Promise
function getParentAppOrigin() {
  return new Promise((resolve, reject) => {
    // Return cached value if available
    if (cachedParentDomain) {
      resolve(cachedParentDomain);
      return;
    }

    const currentOrigin = window.location.origin
    const currentHost = window.location.host
    const protocol = window.location.protocol

    console.log('Current origin:', currentOrigin)

    // Method 1: Try direct access (works for same-origin)
    try {
      const parentDomain = window.parent.location.hostname;
      console.log("Parent domain (direct access):", parentDomain);
      const parentOrigin = `${window.parent.location.protocol}//${parentDomain}`;
      cachedParentDomain = parentOrigin;
      resolve(parentOrigin);
      return;
    } catch (e) {
      console.log("Direct access to parent blocked, trying alternatives");
    }

    // Method 2: Use document.referrer
    if (document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer);
        // Use full host (hostname + port) instead of just hostname
        const parentOrigin = `${referrerUrl.protocol}//${referrerUrl.host}`;
        console.log("Parent domain from referrer:", referrerUrl.host);
        console.log("Full parent origin from referrer:", parentOrigin);
        cachedParentDomain = parentOrigin;
        resolve(parentOrigin);
        return;
      } catch (e) {
        console.warn("Could not parse referrer:", e);
      }
    }

    // Method 3: Request from parent via postMessage
    if (isRunningInIframe()) {
      const messageHandler = (event) => {
        if (event.data && event.data.type === 'PARENT_ORIGIN_RESPONSE') {
          window.removeEventListener('message', messageHandler);
          cachedParentDomain = event.data.origin;
          console.log("Parent origin from postMessage:", event.data.origin);
          resolve(event.data.origin);
        }
      };

      window.addEventListener('message', messageHandler);
      
      // Request parent origin
      window.parent.postMessage({
        type: 'REQUEST_PARENT_ORIGIN'
      }, '*');

      // Timeout after 2 seconds
      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        console.warn("Timeout waiting for parent origin response");
        fallbackToInferredOrigin();
      }, 2000);
    } else {
      fallbackToInferredOrigin();
    }

    function fallbackToInferredOrigin() {
      // Method 4: Infer from current origin patterns
      let inferredOrigin = currentOrigin;

      // Development: localhost với port pattern
      if (currentHost === 'localhost:8081') {
        inferredOrigin = 'http://localhost:8081'; // Giữ nguyên cho development
      }
      
      // Production: Frappe framework patterns
      
      // Case 1: Drive service chạy trên port khác (domain.com:8080 → domain.com)
      else if (currentHost.includes(':') && !currentHost.includes(':80') && !currentHost.includes(':443')) {
        const hostname = currentHost.split(':')[0]
        inferredOrigin = `${protocol}//${hostname}`
      }
      
      // Case 2: Drive service là subdomain (drive.domain.com → domain.com)
      else if (currentHost.startsWith('drive.')) {
        const mainDomain = currentHost.replace('drive.', '')
        inferredOrigin = `${protocol}//${mainDomain}`
      }
      
      // Case 3: Drive service có prefix/suffix khác
      else if (currentHost.includes('-drive.')) {
        const mainDomain = currentHost.replace('-drive', '')
        console.log('Detected -drive subdomain, main domain:', mainDomain)
        inferredOrigin = `${protocol}//${mainDomain}`
      }
      
      // Case 4: Production domain patterns
      else if (currentHost.includes('nextgrp.vn')) {
        // Assuming drive service và main app cùng domain
        inferredOrigin = `${protocol}//${currentHost}`
      }
      
      console.log('Using inferred parent origin:', inferredOrigin);
      cachedParentDomain = inferredOrigin;
      resolve(inferredOrigin);
    }
  });
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

// Initialize parent communication
export function initParentCommunication() {
  if (isRunningInIframe()) {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'REQUEST_PARENT_ORIGIN') {
        // This should be handled by the parent, not the iframe
        // But we can add it here for completeness
        return;
      }
    });

    // Notify parent that iframe is ready
    window.parent.postMessage({
      type: 'DRIVE_IFRAME_READY',
      origin: window.location.origin
    }, '*');
  }
}

// Call this when your app initializes
// initParentCommunication();

// const copyToClipboard = (str) => {
//   if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
//     return navigator.clipboard.writeText(str)
//   } else {
//     // Fallback to the legacy clipboard API
//     const textArea = document.createElement("textarea")
//     textArea.value = str
//     document.body.appendChild(textArea)
//     textArea.select()
//     document.execCommand("copy")
//     document.body.removeChild(textArea)
//     return Promise.resolve()
//   }
// }