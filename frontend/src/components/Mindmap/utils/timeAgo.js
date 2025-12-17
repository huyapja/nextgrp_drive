export function timeAgo(dateStr) {
  if (!dateStr) return "";

  const now = new Date();
  const past = new Date(dateStr);
  const diff = (now - past) / 1000; // giây

  // < 1 ngày → relative time
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return Math.floor(diff / 60) + " phút trước";
  if (diff < 86400) return Math.floor(diff / 3600) + " giờ trước";

  // Calendar info
  const nowDay = now.getDate();
  const nowMonth = now.getMonth();
  const nowYear = now.getFullYear();

  const pastDay = past.getDate();
  const pastMonth = past.getMonth();
  const pastYear = past.getFullYear();

  // ---- Nếu khác năm → DD/MM/YYYY ----
  if (pastYear !== nowYear) {
    const d = pastDay.toString().padStart(2, "0");
    const mo = (pastMonth + 1).toString().padStart(2, "0");
    const y = pastYear;

    return `${d}/${mo}/${y}`;
  }

  // ---- Nếu hôm qua ----
  const isYesterday =
    pastYear === nowYear &&
    pastMonth === nowMonth &&
    pastDay === nowDay - 1;

  if (isYesterday) {
    return "Hôm qua";
  }

  // ---- Cùng năm nhưng không phải hôm qua → HH:mm DD/MM ----
  const h = past.getHours().toString().padStart(2, "0");
  const m = past.getMinutes().toString().padStart(2, "0");
  const d = pastDay.toString().padStart(2, "0");
  const mo = (pastMonth + 1).toString().padStart(2, "0");

  return `${h}:${m} ${d}/${mo}`;
}
