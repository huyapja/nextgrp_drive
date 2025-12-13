import { ref, watch } from "vue"

export function useGalleryZoom(galleryIndex) {
  const imageScale = ref(1)
  const originX = ref(50)
  const originY = ref(50)
  const rotateDeg = ref(0)

  const MIN_SCALE = 1
  const MAX_SCALE = 5
  const STEP = 0.15

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v))
  }

  function normDeg(deg) {
    // đưa về 0..359
    const d = ((deg % 360) + 360) % 360
    // ép đúng 0/90/180/270 (tránh sai số nếu có)
    const snap = Math.round(d / 90) * 90
    return ((snap % 360) + 360) % 360
  }

  function mapOriginByRotation(rawX, rawY, deg) {
    // rawX/rawY: % theo rect hiện tại (screen)
    // trả về originX/originY: % theo local coords (chưa rotate)
    const d = normDeg(deg)

    if (d === 0) {
      return { x: rawX, y: rawY }
    }

    if (d === 90) {
      // xoay phải 90: top của screen tương ứng left của local, ...
      // localX = rawY, localY = 100 - rawX
      return { x: rawY, y: 100 - rawX }
    }

    if (d === 180) {
      // lật ngược: đảo cả 2 trục
      return { x: 100 - rawX, y: 100 - rawY }
    }

    // d === 270
    // xoay trái 90: localX = 100 - rawY, localY = rawX
    return { x: 100 - rawY, y: rawX }
  }

  function resetZoom() {
    imageScale.value = 1
    originX.value = 50
    originY.value = 50
  }

  function handleImageWheel(e) {
    e.preventDefault()
    e.stopPropagation()

    const el = e.currentTarget
    if (!el) return

    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    // 1) raw theo screen rect (đã bị rotate bởi parent)
    const rawX = ((e.clientX - rect.left) / rect.width) * 100
    const rawY = ((e.clientY - rect.top) / rect.height) * 100

    // 2) map ngược về local origin (chưa rotate)
    const mapped = mapOriginByRotation(rawX, rawY, rotateDeg.value)

    originX.value = clamp(mapped.x, 0, 100)
    originY.value = clamp(mapped.y, 0, 100)

    const delta = e.deltaY < 0 ? STEP : -STEP
    imageScale.value = clamp(imageScale.value + delta, MIN_SCALE, MAX_SCALE)
  }

  function rotateLeft() {
    rotateDeg.value -= 90
    resetZoom()
  }

  function rotateRight() {
    rotateDeg.value += 90
    resetZoom()
  }

  watch(galleryIndex, () => {
    rotateDeg.value = 0
    resetZoom()
  })

  return {
    imageScale,
    originX,
    originY,
    rotateDeg,
    handleImageWheel,
    rotateLeft,
    rotateRight,
    resetZoom,
  }
}
