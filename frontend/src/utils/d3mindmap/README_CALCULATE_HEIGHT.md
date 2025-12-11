# Hướng dẫn sử dụng `calculateNodeHeightWithImages`

## Mục đích

Tạo một hàm tập trung để tính toán chiều cao của node **1 LẦN DUY NHẤT** khi insert ảnh.

**Nguyên tắc:**
- ✅ **Khi insert ảnh**: Tính toán height và LƯU vào `fixedHeight`
- ✅ **Khi blur**: CHỈ ĐỌC `fixedHeight` đã lưu, không tính lại
- ✅ **Khi render**: CHỈ ĐỌC `fixedHeight` từ cache, không tính lại

→ **Tính 1 lần, dùng mãi mãi!**

## Cách sử dụng

### CHỈ DÙNG 1 LẦN khi insert ảnh (trong `handleEditorInput`)

```javascript
// 1. Kiểm tra có ảnh
const hasImages = value.includes('<img') || value.includes('image-wrapper')

if (hasImages) {
  // 2. Setup styles
  editorContent.style.setProperty('width', `${foWidth}px`, 'important')
  editorContent.style.setProperty('white-space', 'pre-wrap', 'important')
  
  // Force reflow
  void editorContent.offsetWidth
  void editorContent.offsetHeight
  
  // 3. Tính toán height (CHỈ 1 LẦN)
  const heightResult = calculateNodeHeightWithImages({
    editorContent,
    nodeWidth: 400,
    htmlContent: value,
    singleLineHeight: 43
  })
  
  // 4. LƯU NGAY vào fixedWidth/fixedHeight
  nodeData.data.fixedWidth = 400
  nodeData.data.fixedHeight = heightResult.height
  
  // 5. Cập nhật cache
  renderer.nodeSizeCache.set(nodeId, { 
    width: 400, 
    height: heightResult.height 
  })
  
  // 6. Cập nhật UI
  rect.attr('height', heightResult.height)
  fo.attr('height', heightResult.height - 4)
}
```

### CÁC ACTION KHÁC chỉ ĐỌC

```javascript
// handleEditorBlur - CHỈ ĐỌC, không tính lại
if (hasImages && nodeData.data.fixedHeight) {
  finalHeight = nodeData.data.fixedHeight // ĐỌC từ fixedHeight
}

// renderNodes - CHỈ ĐỌC từ cache
const cachedSize = renderer.nodeSizeCache.get(nodeId)
if (cachedSize) {
  return cachedSize // ĐỌC từ cache
}
```

## Kết quả trả về

```javascript
{
  height: number,           // Chiều cao tính được
  hasImages: boolean,       // Có ảnh hay không
  imageCount: number,       // Số lượng ảnh
  estimatedHeight: number,  // Height ước tính (khi ảnh chưa load)
  actualHeight: number      // Height thực tế (khi ảnh đã load)
}
```

## Logic tính toán

1. **Kiểm tra có ảnh**: `htmlContent.includes('<img')`
2. **Tính layout**: 1 ảnh = 1 cột, 2 ảnh = 2 cột, 3+ ảnh = 3 cột
3. **Tính width mỗi ảnh**: Dựa trên layout và gap
4. **Tính height mỗi ảnh**: Dựa trên aspect ratio
5. **Nhóm theo hàng**: Lấy MAX height của mỗi hàng
6. **Cộng text + padding**: Tổng height = rows + text + padding
7. **Đo thực tế từ DOM**: scrollHeight và offsetTop
8. **Trả về max**: max(estimated, actual, singleLineHeight)

## Ví dụ

### Thêm 1 ảnh 800x600

```javascript
const result = calculateNodeHeightWithImages({
  editorContent,
  nodeWidth: 400,
  htmlContent: '<img src="..." width="800" height="600">',
  singleLineHeight: 43
})

// result = {
//   height: 366,
//   hasImages: true,
//   imageCount: 1,
//   estimatedHeight: 366,
//   actualHeight: 366
// }
```

### Thêm 2 ảnh 800x600

```javascript
const result = calculateNodeHeightWithImages({
  editorContent,
  nodeWidth: 400,
  htmlContent: '<img src="1.jpg"><img src="2.jpg">',
  singleLineHeight: 43
})

// result = {
//   height: 224,
//   hasImages: true,
//   imageCount: 2,
//   estimatedHeight: 224,
//   actualHeight: 224
// }
```

## Tóm tắt Flow

```
Upload ảnh
    ↓
Insert vào TipTap
    ↓
handleEditorInput được gọi
    ↓
calculateNodeHeightWithImages() → Tính height
    ↓
LƯU vào fixedWidth/fixedHeight ✅
    ↓
handleEditorBlur → ĐỌC fixedHeight (không tính lại)
    ↓
renderNodes → ĐỌC từ cache (không tính lại)
```

**→ TÍNH 1 LẦN, DÙNG MÃI MÃI!**

## Lợi ích

✅ **Hiệu năng cao**: Chỉ tính 1 lần thay vì 3 lần  
✅ **Đồng nhất**: 1 nguồn duy nhất, không conflict  
✅ **Đơn giản**: Blur và render chỉ cần đọc, không cần logic phức tạp

## Xem thêm

Xem [CALCULATE_NODE_HEIGHT_GUIDE.md](./CALCULATE_NODE_HEIGHT_GUIDE.md) để hiểu chi tiết về:
- Logic tính toán từng bước
- Xử lý ảnh chưa load
- Ví dụ chi tiết với 1, 2, 4 ảnh

