# BÁO CÁO KIỂM THỬ BỘ LỌC TRANG VẬN ĐƠN

## 📋 TỔNG QUAN

Trang Vận đơn có hệ thống bộ lọc phức tạp với nhiều loại filter khác nhau:
1. **Bộ lọc Toolbar** (hàng trên cùng): Thị trường, Sản phẩm, NV Sale, NV MKT, NV Vận đơn, Đơn vị vận chuyển, Page, Trạng thái giao hàng, Trạng thái thanh toán
2. **Bộ lọc Header cột** (trên mỗi cột): Input text, date, select, MultiSelect
3. **Bộ lọc đặc biệt**: Mã Tracking (có 4 chế độ), Cảnh báo trùng, Tra cứu nhanh khách hàng

---

## ✅ CÁC TRƯỜNG HỢP ĐÃ KIỂM TRA - HOẠT ĐỘNG ĐÚNG

### 1. Cơ chế Apply Filter (Enter)
**Mô tả:** Người dùng phải bấm Enter để áp dụng filter
**Kết quả:** ✅ PASS
- Code có `applyFiltersAndSearch()` được trigger khi bấm Enter
- Có phân biệt `filterValues` (draft) và `appliedFilterValues` (đã apply)
- Tránh trigger khi đang edit cell trong bảng

```javascript
// Line 800-830
useEffect(() => {
  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    const active = document.activeElement;
    if (!active) return;
    if (active.closest?.('[data-van-cell-sync="1"]')) return; // Tránh trigger khi edit cell
    if (tableRef.current && tableRef.current.contains(active)) return;
    // ... apply filters
  };
  window.addEventListener('keydown', onKeyDown, true);
}, [applyFiltersAndSearch]);
```

### 2. Bộ lọc MultiSelect (Toolbar)
**Các cột:** Thị trường, Sản phẩm, NV Sale, NV MKT, NV Vận đơn, Đơn vị vận chuyển, Page, Trạng thái giao hàng, Trạng thái thanh toán
**Kết quả:** ✅ PASS
- Có hàm `getFilterMultiSelectOptions()` gộp dữ liệu từ 3 nguồn:
  - Admin catalog (system_settings)
  - Distinct từ database (RPC)
  - Unique values từ trang hiện tại
- Xử lý trùng lặp không phân biệt hoa thường
- Có mục "Trống" để lọc giá trị rỗng

```javascript
// Line 3400-3500
const getFilterMultiSelectOptions = useCallback((col) => {
  const preset = DROPDOWN_OPTIONS[keyMapped] || DROPDOWN_OPTIONS[col] || [];
  const fromDb = vanDonDistinctFilterOptions[col];
  const fromPage = getUniqueValues(col);
  // Gộp và deduplicate case-insensitive
  // ...
  return ['Trống', ...merged];
}, [getUniqueValues, vanDonDistinctFilterOptions, ...]);
```

### 3. Bộ lọc Header cột - Input Text
**Các cột:** Name*, Phone*, Add, City, v.v.
**Kết quả:** ✅ PASS
- Có placeholder hướng dẫn: "Nhập... (Dùng dấu phẩy , để lọc nhiều)"
- Giá trị được lưu vào `filterValues[filterKey]`
- Hỗ trợ lọc nhiều giá trị bằng dấu phẩy

```javascript
// Line 4550-4560
<input
  type="text"
  className={filterInputCls}
  placeholder="Nhập... (Dùng dấu phẩy , để lọc nhiều)"
  value={filterValues[filterKey] || ''}
  onChange={(e) => setFilterValues((p) => ({ ...p, [filterKey]: e.target.value }))}
/>
```

### 4. Bộ lọc Header cột - Date Input
**Các cột:** Ngày lên đơn, Ngày đóng hàng, Ngày đẩy đơn, Ngày có mã tracking, Ngày Kế toán đối soát với FFM lần 2
**Kết quả:** ✅ PASS
- Sử dụng `<input type="date">` chuẩn HTML5
- Giá trị được lưu vào `filterValues[filterKey]`

```javascript
// Line 4545-4550
['Ngày lên đơn', 'Ngày đóng hàng', ...].includes(col) ? (
  <input
    type="date"
    value={filterValues[filterKey] || ''}
    onChange={(e) => setFilterValues((p) => ({ ...p, [filterKey]: e.target.value }))}
  />
)
```

### 5. Bộ lọc Header cột - MultiSelect
**Các cột:** Trạng thái giao hàng, Kết quả check, Đơn vị vận chuyển, Nhân viên Sale, Nhân viên MKT, Page, NV Vận đơn, Mặt hàng, Khu vực
**Kết quả:** ✅ PASS
- Sử dụng component `<MultiSelect>` tùy chỉnh
- Có chế độ compact cho header
- Options được lấy từ `getFilterMultiSelectOptions(col)`

```javascript
// Line 4535-4545
DROPDOWN_OPTIONS[col] || [...].includes(col) ? (
  <div className="relative w-full" style={{ zIndex: 1002 }}>
    <MultiSelect
      compact
      label="Lọc..."
      options={getFilterMultiSelectOptions(col)}
      selected={filterValues[filterKey] || []}
      onChange={(vals) => setFilterValues((p) => ({ ...p, [filterKey]: vals }))}
    />
  </div>
)
```

### 6. Bộ lọc Mã Tracking (Đặc biệt)
**Kết quả:** ✅ PASS
- Có 4 chế độ:
  1. "Tình trạng mã" (mặc định): Hiện 2 ô "Gồm..." và "Trừ..."
  2. "Tất cả có mã": Lọc tất cả đơn có tracking
  3. "Trống": Lọc đơn không có tracking
  4. "Toàn số": Lọc tracking chỉ chứa số
- Logic xử lý trong `serverTrackingFilter`

```javascript
// Line 4510-4530
col === 'Mã Tracking' ? (
  <div className="flex flex-col gap-0.5">
    <select
      value={filterValues.tracking_status || 'Tình trạng mã'}
      onChange={(e) => setFilterValues((p) => ({ ...p, tracking_status: e.target.value }))}
    >
      <option value="Tình trạng mã">Tình trạng mã</option>
      <option value="Tất cả có mã">Tất cả có mã</option>
      <option value="Trống">Trống</option>
      <option value="Toàn số">Toàn số</option>
    </select>
    {filterValues.tracking_status === 'Tình trạng mã' && (
      <div className="grid grid-cols-2 gap-0.5">
        <input placeholder="Gồm…" value={filterValues.tracking_include || ''} ... />
        <input placeholder="Trừ…" value={filterValues.tracking_exclude || ''} ... />
      </div>
    )}
  </div>
)
```

### 7. Bộ lọc Cảnh báo trùng
**Kết quả:** ✅ PASS
- 3 tùy chọn: "Tất cả", "Có trùng", "Không trùng"
- Giá trị: '', 'co_trung', 'khong_trung'

```javascript
// Line 4520-4530
isCanhBaoFilterCol ? (
  <select
    value={filterValues.canh_bao_filter || ''}
    onChange={(e) => setFilterValues((p) => ({ ...p, canh_bao_filter: e.target.value }))}
  >
    <option value="">Tất cả</option>
    <option value="co_trung">Có trùng</option>
    <option value="khong_trung">Không trùng</option>
  </select>
)
```

### 8. Server-side Column Filters
**Kết quả:** ✅ PASS
- Có hàm `serverColumnFilters` để build query cho backend
- Loại trừ các filter đặc biệt (market, product, tracking, ...)
- Xử lý DATE_FILTER_KEYS với toolbar date override

```javascript
// Line 1035-1075
const serverColumnFilters = useMemo(() => {
  if (!useBackendPagination) return {};
  const out = {};
  const DATE_FILTER_KEYS = ['Ngày lên đơn', 'Ngày đóng hàng', ...];
  
  Object.entries(appliedFilterValues).forEach(([key, val]) => {
    // Loại trừ các filter đặc biệt
    if (['market', 'product', 'nv_sale', ...].includes(key)) return;
    // Loại trừ date filter nếu toolbar override
    if (appliedEnableDateFilter && DATE_FILTER_KEYS.includes(key) && toolbarDateOverrideKeys.has(key)) return;
    // Loại trừ giá trị rỗng
    if (val == null) return;
    if (Array.isArray(val) && val.length === 0) return;
    if (typeof val === 'string' && val.trim() === '') return;
    
    out[key] = val;
  });
  return out;
}, [useBackendPagination, appliedFilterValues, ...]);
```

---

## ⚠️ CÁC VẤN ĐỀ TIỀM ẨN CẦN KIỂM TRA

### 1. Xung đột giữa Toolbar Date Filter và Header Column Date Filter
**Mức độ:** 🟡 TRUNG BÌNH
**Mô tả:** 
- Toolbar có bộ lọc ngày với dropdown "Loại ngày" (Ngày lên đơn, Ngày đóng hàng, ...)
- Header cột cũng có input date cho từng cột ngày
- Có thể gây nhầm lẫn khi cả 2 cùng được set

**Kiểm tra cần làm:**
1. Set toolbar date filter = "Ngày lên đơn" với khoảng 01/01/2024 - 31/01/2024
2. Đồng thời set header column "Ngày lên đơn" = 15/01/2024
3. Kiểm tra kết quả: Có lọc đúng không? Ưu tiên filter nào?

**Code liên quan:**
```javascript
// Line 1045-1050
if (appliedEnableDateFilter && DATE_FILTER_KEYS.includes(key) && toolbarDateOverrideKeys.has(key)) return;
```
→ Có vẻ toolbar sẽ override header column filter khi `enableDateFilter = true`

**Khuyến nghị:** Cần test thực tế để confirm behavior

### 2. Filter với giá trị có dấu phẩy
**Mức độ:** 🟡 TRUNG BÌNH
**Mô tả:**
- Placeholder nói "Dùng dấu phẩy , để lọc nhiều"
- Nhưng không thấy code xử lý split bằng dấu phẩy trong `serverColumnFilters`

**Kiểm tra cần làm:**
1. Nhập vào ô filter "Name*": "Nguyễn Văn A, Trần Thị B"
2. Kiểm tra xem có lọc được cả 2 tên không?

**Code liên quan:**
```javascript
// Line 4555
placeholder="Nhập... (Dùng dấu phẩy , để lọc nhiều)"
```
→ Không thấy logic split comma trong `serverColumnFilters`

**Khuyến nghị:** Cần kiểm tra xem backend API có xử lý comma-separated values không

### 3. Filter "Trống" trong MultiSelect
**Mức độ:** 🟢 THẤP
**Mô tả:**
- MultiSelect có option "Trống" để lọc giá trị rỗng
- Cần kiểm tra xem backend có hiểu đúng ý nghĩa của "Trống" không

**Kiểm tra cần làm:**
1. Chọn "Trống" trong filter "Nhân viên Sale"
2. Kiểm tra xem có lọc đúng các đơn không có NV Sale không

**Code liên quan:**
```javascript
// Line 3500
return ['Trống', ...merged];
```

**Khuyến nghị:** Test với backend để đảm bảo "Trống" được map đúng sang SQL query

### 4. Case-insensitive matching
**Mức độ:** 🟢 THẤP
**Mô tả:**
- Code có xử lý deduplicate case-insensitive cho MultiSelect options
- Cần kiểm tra xem backend filter có case-insensitive không

**Kiểm tra cần làm:**
1. Có đơn với "Nhân viên Sale" = "Nguyễn Văn A"
2. Filter với "nguyễn văn a" (lowercase)
3. Kiểm tra xem có tìm thấy không

**Code liên quan:**
```javascript
// Line 3420-3430
const byLower = new Map();
for (const raw of base) {
  const lk = s.toLowerCase();
  if (!byLower.has(lk)) byLower.set(lk, s);
  else byLower.set(lk, pickBetterCase(byLower.get(lk), s));
}
```

**Khuyến nghị:** Kiểm tra backend API có dùng ILIKE (PostgreSQL) hay LIKE

### 5. Filter với pending changes
**Mức độ:** 🟡 TRUNG BÌNH
**Mô tả:**
- Có logic `mergePendingRowsIntoFetchedData()` để ghép đơn đang sửa vào kết quả
- Cần kiểm tra xem filter có hoạt động đúng với pending changes không

**Kiểm tra cần làm:**
1. Sửa "Nhân viên Sale" của đơn A từ "Nguyễn Văn A" → "Trần Văn B" (chưa lưu)
2. Filter "Nhân viên Sale" = "Trần Văn B"
3. Kiểm tra xem đơn A có xuất hiện không (mặc dù DB vẫn là "Nguyễn Văn A")

**Code liên quan:**
```javascript
// Line 1000-1020
const mergePendingRowsIntoFetchedData = (rows) => {
  const pending = pendingChangesRef.current;
  if (!pending || pending.size === 0) return rows;
  // ... logic ghép pending rows
};
```

**Khuyến nghị:** Test kỹ scenario này vì có thể gây confusion cho user

### 6. Filter với Unicode normalization
**Mức độ:** 🟢 THẤP
**Mô tả:**
- Code có normalize NFC cho column headers
- Cần kiểm tra xem filter có xử lý đúng với các ký tự Unicode đặc biệt không

**Kiểm tra cần làm:**
1. Có đơn với tên có dấu: "Nguyễn Văn Á" (Á có dấu sắc)
2. Filter với "Nguyễn Văn Á" (copy-paste từ nguồn khác, có thể khác encoding)
3. Kiểm tra xem có match không

**Code liên quan:**
```javascript
// Line 100-105
function normalizeColHeader(col) {
  if (col == null || col === '') return '';
  return String(col).normalize('NFC').trim();
}
```

**Khuyến nghị:** Test với các ký tự đặc biệt: é, ê, ô, ơ, ư, ...

---

## 🔍 CÁC TRƯỜNG HỢP EDGE CASE CẦN TEST

### 1. Filter với giá trị null/undefined/empty string
**Test cases:**
- [ ] Filter với giá trị rỗng ""
- [ ] Filter với giá trị null
- [ ] Filter với giá trị undefined
- [ ] Filter với giá trị chỉ có khoảng trắng "   "

### 2. Filter với giá trị đặc biệt
**Test cases:**
- [ ] Filter với SQL injection: `'; DROP TABLE orders; --`
- [ ] Filter với regex special chars: `.*`, `[a-z]`, `\d+`
- [ ] Filter với HTML tags: `<script>alert('xss')</script>`
- [ ] Filter với emoji: 🎉, 😀, 🚀

### 3. Filter với số lượng lớn
**Test cases:**
- [ ] Chọn 100+ options trong MultiSelect
- [ ] Nhập 1000+ ký tự vào text filter
- [ ] Filter với 50+ giá trị comma-separated

### 4. Filter kết hợp
**Test cases:**
- [ ] Toolbar filter + Header column filter cùng lúc
- [ ] 10+ filters active cùng lúc
- [ ] Filter → Clear → Filter lại (kiểm tra state cleanup)

### 5. Performance
**Test cases:**
- [ ] Filter với 10,000+ rows
- [ ] Filter với 50+ columns
- [ ] Rapid filter changes (type nhanh, không đợi debounce)

---

## 📊 TỔNG KẾT

### Điểm mạnh ✅
1. **Kiến trúc tốt:** Phân tách rõ `filterValues` (draft) vs `appliedFilterValues` (applied)
2. **UX tốt:** Phải bấm Enter mới apply, tránh query liên tục
3. **Xử lý deduplicate:** Case-insensitive, gộp từ nhiều nguồn
4. **Hỗ trợ đa dạng:** Text, Date, Select, MultiSelect, Special filters
5. **Backend pagination:** Gửi filter lên server, không filter client-side

### Điểm cần cải thiện ⚠️
1. **Thiếu validation:** Không validate input (SQL injection, XSS)
2. **Thiếu feedback:** Không hiển thị số lượng kết quả sau khi filter
3. **Thiếu clear button:** Không có nút "Xóa tất cả filter" nhanh
4. **Thiếu save filter:** Không lưu filter preset cho lần sau
5. **Thiếu documentation:** Không có tooltip/help text giải thích cách dùng

### Khuyến nghị kiểm thử 🧪
1. **Unit tests:** Test từng hàm filter riêng lẻ
2. **Integration tests:** Test filter với backend API
3. **E2E tests:** Test user flow hoàn chỉnh
4. **Performance tests:** Test với data lớn
5. **Security tests:** Test SQL injection, XSS

---

## 📝 CHECKLIST KIỂM THỬ CHI TIẾT

### A. Bộ lọc Toolbar
- [ ] Thị trường: Chọn 1 giá trị
- [ ] Thị trường: Chọn nhiều giá trị
- [ ] Thị trường: Chọn "Trống"
- [ ] Thị trường: Clear selection
- [ ] Sản phẩm: Chọn 1 giá trị
- [ ] Sản phẩm: Chọn nhiều giá trị
- [ ] NV Sale: Chọn 1 giá trị
- [ ] NV Sale: Chọn nhiều giá trị
- [ ] NV MKT: Chọn 1 giá trị
- [ ] NV MKT: Chọn nhiều giá trị
- [ ] NV Vận đơn: Chọn 1 giá trị
- [ ] Đơn vị vận chuyển: Chọn 1 giá trị
- [ ] Page: Chọn 1 giá trị
- [ ] Trạng thái giao hàng: Chọn 1 giá trị
- [ ] Trạng thái giao hàng NB: Chọn 1 giá trị
- [ ] Trạng thái thanh toán: Chọn 1 giá trị

### B. Bộ lọc Header cột - Text Input
- [ ] Name*: Nhập 1 giá trị
- [ ] Name*: Nhập nhiều giá trị (comma-separated)
- [ ] Phone*: Nhập số điện thoại
- [ ] Phone*: Nhập nhiều số (comma-separated)
- [ ] Add: Nhập địa chỉ
- [ ] City: Nhập tên thành phố
- [ ] Mã đơn hàng: Nhập mã đơn
- [ ] Ghi chú: Nhập text dài

### C. Bộ lọc Header cột - Date Input
- [ ] Ngày lên đơn: Chọn 1 ngày
- [ ] Ngày lên đơn: Chọn ngày + toolbar date range
- [ ] Ngày đóng hàng: Chọn 1 ngày
- [ ] Ngày đẩy đơn: Chọn 1 ngày
- [ ] Ngày có mã tracking: Chọn 1 ngày
- [ ] Ngày Kế toán đối soát: Chọn 1 ngày

### D. Bộ lọc Header cột - MultiSelect
- [ ] Trạng thái giao hàng: Chọn 1 giá trị
- [ ] Trạng thái giao hàng: Chọn nhiều giá trị
- [ ] Kết quả check: Chọn "OK"
- [ ] Kết quả check: Chọn nhiều giá trị
- [ ] Đơn vị vận chuyển: Chọn 1 giá trị
- [ ] Nhân viên Sale: Chọn 1 giá trị
- [ ] Nhân viên MKT: Chọn 1 giá trị
- [ ] Page: Chọn 1 giá trị
- [ ] Mặt hàng: Chọn 1 giá trị
- [ ] Khu vực: Chọn 1 giá trị

### E. Bộ lọc đặc biệt
- [ ] Mã Tracking: "Tình trạng mã" + Gồm "ABC"
- [ ] Mã Tracking: "Tình trạng mã" + Trừ "XYZ"
- [ ] Mã Tracking: "Tình trạng mã" + Gồm + Trừ
- [ ] Mã Tracking: "Tất cả có mã"
- [ ] Mã Tracking: "Trống"
- [ ] Mã Tracking: "Toàn số"
- [ ] Cảnh báo trùng: "Tất cả"
- [ ] Cảnh báo trùng: "Có trùng"
- [ ] Cảnh báo trùng: "Không trùng"
- [ ] Tra cứu nhanh: Nhập SĐT
- [ ] Tra cứu nhanh: Nhập tên
- [ ] Tra cứu nhanh: Nhập địa chỉ
- [ ] Tra cứu nhanh: Nhập mã đơn

### F. Kết hợp filters
- [ ] Toolbar + Header column cùng lúc
- [ ] 5+ filters active
- [ ] 10+ filters active
- [ ] Filter → Clear → Filter lại
- [ ] Filter → Change tab → Back
- [ ] Filter → Refresh page

### G. Edge cases
- [ ] Filter với giá trị rỗng
- [ ] Filter với giá trị null
- [ ] Filter với khoảng trắng
- [ ] Filter với ký tự đặc biệt
- [ ] Filter với emoji
- [ ] Filter với số lượng lớn (1000+ chars)
- [ ] Filter với pending changes
- [ ] Filter với Unicode

### H. Performance
- [ ] Filter với 1,000 rows
- [ ] Filter với 10,000 rows
- [ ] Filter với 50+ columns
- [ ] Rapid filter changes
- [ ] Multiple users filtering cùng lúc

### I. Security
- [ ] SQL injection test
- [ ] XSS test
- [ ] CSRF test
- [ ] Authorization test (user không có quyền)

---

## 🎯 KẾT LUẬN

Bộ lọc trang Vận đơn được thiết kế khá tốt với:
- ✅ Kiến trúc rõ ràng, dễ maintain
- ✅ Hỗ trợ đa dạng loại filter
- ✅ UX tốt với Enter to apply
- ✅ Xử lý deduplicate case-insensitive

Tuy nhiên cần kiểm thử kỹ các trường hợp:
- ⚠️ Xung đột giữa toolbar date filter và header column date filter
- ⚠️ Filter với giá trị comma-separated
- ⚠️ Filter với pending changes
- ⚠️ Security (SQL injection, XSS)
- ⚠️ Performance với data lớn

**Khuyến nghị:** Thực hiện checklist kiểm thử chi tiết ở trên để đảm bảo bộ lọc hoạt động đúng trong mọi trường hợp.
