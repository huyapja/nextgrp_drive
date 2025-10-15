import { toast } from "./toasts"

export function handleResourceError(error) {
  if (!navigator.onLine || 
      error.message?.includes('ERR_INTERNET_DISCONNECTED') ||
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('Network Error')) {
    toast("Mất kết nối mạng. Vui lòng thử lại sau.")
    return true
  }
  return false
}