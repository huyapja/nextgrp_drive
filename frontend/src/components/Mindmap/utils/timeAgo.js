export function timeAgo(dateStr) {
  if (!dateStr) return ""

  const now = new Date()
  const past = new Date(dateStr)
  const diff = (now - past) / 1000

  if (diff < 60) return "vừa xong"
  if (diff < 3600) return Math.floor(diff / 60) + " phút trước"
  if (diff < 86400) return Math.floor(diff / 3600) + " giờ trước"

  const days = Math.floor(diff / 86400)
  if (days === 1) return "Hôm qua"
  if (days < 30) return `${days} ngày trước`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} tháng trước`

  const years = Math.floor(months / 12)
  return `${years} năm trước`
}
