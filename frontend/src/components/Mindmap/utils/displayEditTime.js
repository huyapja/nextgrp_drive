import { timeAgo } from "./timeAgo"

function displayTime(c) {
  if (!c) return ""

  const created = new Date(c.creation)
  const modified = new Date(c.modified)

  const isEdited = modified > created

  const base = timeAgo(c.creation)

  return isEdited ? `${base} (đã chỉnh sửa)` : base
}
