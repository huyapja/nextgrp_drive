import { toast } from "./toasts"

/**
 * Kiểm tra xem lỗi có phải do mất kết nối mạng không
 */
export function isNetworkError(error) {
  // Kiểm tra navigator.onLine
  if (!navigator.onLine) {
    return true
  }
  
  // Kiểm tra error message
  const errorMessage = error?.message || error?.exc || ''
  const errorString = String(errorMessage).toLowerCase()
  
  return (
    errorString.includes('err_internet_disconnected') ||
    errorString.includes('failed to fetch') ||
    errorString.includes('network error') ||
    errorString.includes('networkerror') ||
    errorString.includes('network request failed') ||
    errorString.includes('load failed') ||
    errorString.includes('err_network_changed') ||
    errorString.includes('err_connection_refused') ||
    errorString.includes('err_connection_timed_out') ||
    errorString.includes('timeout') ||
    error?.exc_type === 'NetworkError' ||
    error?.httpStatus === 0 // Status 0 thường là mất kết nối
  )
}

/**
 * Xử lý lỗi mất kết nối mạng và hiển thị thông báo
 * @param {Error} error - Lỗi từ API call
 * @returns {boolean} - true nếu đã xử lý (là lỗi mạng), false nếu không phải
 */
export function handleResourceError(error) {
  if (isNetworkError(error)) {
    toast({
      title: "Thất bại",
      text: "Vui lòng kiểm tra kết nối mạng và thử lại",
      icon: "x",
      iconClasses: "text-red-600",
      background: "bg-surface-red-2",
      position: "bottom-right",
      timeout: 5,
    })
    return true
  }
  return false
}