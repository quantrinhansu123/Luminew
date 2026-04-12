# Sửa FFM T&T không hiện đơn HCM

## Vấn đề
- Trang FFM T&T (`/ffm_TT`) chỉ hiện đơn Hà Nội
- Không hiện đơn HCM

## Nguyên nhân
- Code variant TT chỉ fetch từ bảng `orders` (Hà Nội)
- Không fetch từ bảng `order_code_hcm` (HCM)

## Giải pháp
Thay đổi điều kiện fetch data:

**Trước:**
```javascript
if (variant === 'MGT') {
  // Fetch từ cả 2 bảng: orders + order_code_hcm
}
// Variant TT chỉ fetch từ orders
```

**Sau:**
```javascript
if (variant === 'MGT' || variant === 'TT') {
  // Cả 2 variant đều fetch từ cả 2 bảng
}
```

## Kiến trúc FFM

### Component dùng chung
- File: `src/pages/FFM.jsx`
- Component: `<FFM variant="MGT" />` hoặc `<FFM variant="TT" />`

### Routes
```javascript
<Route path="/ffm_MGT" element={<FFM variant="MGT" />} />
<Route path="/ffm_TT" element={<FFM variant="TT" />} />
```

### Sự khác biệt duy nhất
```javascript
// Trong applyFfmFilters()
if (variant === 'TT') {
  data = data.filter(isFfmTtCarrierRow); // Chỉ giữ ĐVVC = T&T
}
```

## Kết quả

| Trang | Dữ liệu | Bộ lọc |
|-------|---------|--------|
| **FFM MGT** | HN + HCM | Tất cả đơn |
| **FFM T&T** | HN + HCM | Chỉ ĐVVC = T&T |

✅ Cả 2 trang đều hiện đơn từ cả 2 chi nhánh  
✅ Có thể lọc thêm theo dropdown "Chi nhánh" (Hà Nội / HCM / Tất cả)  
✅ Code đơn giản, dễ bảo trì (dùng chung component)
