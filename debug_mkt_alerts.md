# Tóm tắt vấn đề và giải pháp

## ✅ Đã sửa xong!

### Vấn đề chính
PostgreSQL không hỗ trợ ký tự `\u0000` (null byte) trong text fields. Hàm `buildAlertId()` trong các file HTML đang sử dụng `\u0000` làm separator, khiến việc insert vào database thất bại với lỗi:
```
Error: unsupported Unicode escape sequence
Details: \u0000 cannot be converted to text.
```

### Giải pháp đã áp dụng

1. **Sửa separator trong HTML** (2 files):
   - `public/viewNsMoiNhanh.html`: Đổi từ `\u0000` sang `|`
   - `public/viewNsMoiNhanh-HCM.html`: Đổi từ `\u0000` sang `|`

2. **Thêm logging để debug**:
   - `src/services/mktKpiAlertsService.js`: Thêm console.log chi tiết
   - `src/pages/XemBaoCaoMKTLegacy.jsx`: Thêm console.log khi sync

3. **Việt hóa giao diện**:
   - `src/pages/MktKpiAlertsAdmin.jsx`: 
     - Đổi "open" → "Mới"
     - Đổi "explained" → "Đã giải trình"
     - Đổi "resolved" → "Đã xử lý"
     - Đổi "ignored" → "Bỏ qua"
     - Đổi "all" → "Tất cả"
     - Đổi "Resolve" → "Đã xử lý"
     - Đổi "Ignore" → "Bỏ qua"
     - Đổi "Reopen" → "Mở lại"

4. **Thêm vào menu điều hướng**:
   - `src/pages/Home.jsx`: Thêm "Quản lý cảnh báo MKT" vào:
     - Sidebar menu (dưới "Cài đặt hệ thống")
     - Content sections (thẻ lớn màu cam)
   - Import icon `AlertTriangle` từ lucide-react

### Kết quả
- ✅ Database đã có dữ liệu (34 bản ghi test)
- ✅ Trang `/admin/mkt-alerts` hiển thị dữ liệu bình thường
- ✅ Giao diện đã được Việt hóa hoàn toàn
- ✅ Đã thêm vào menu điều hướng

---

# Giải thích: Tại sao chuông Header hiển thị được nhưng trang Admin không có dữ liệu?

## Nguyên nhân

**Chuông Header** và **Trang Admin** lấy dữ liệu từ **2 nguồn khác nhau**:

### 1. Chuông Header (✅ Hoạt động)
- **Nguồn dữ liệu**: `localStorage` với key `luminew.mktAlerts.v1`
- **Cách hoạt động**: 
  - Iframe HTML gửi alerts qua `postMessage`
  - Component `XemBaoCaoMKTLegacy` nhận message và lưu vào `localStorage`
  - Header đọc từ `localStorage` và hiển thị chuông
- **Ưu điểm**: Nhanh, không cần database
- **Nhược điểm**: Chỉ lưu trên trình duyệt, mất khi clear cache

### 2. Trang Admin `/admin/mkt-alerts` (❌ Không có dữ liệu)
- **Nguồn dữ liệu**: Bảng `mkt_kpi_alerts` trong Supabase database
- **Cách hoạt động**:
  - Iframe HTML gửi alerts qua `postMessage`
  - Component `XemBaoCaoMKTLegacy` nhận message
  - Sau 800ms debounce, gọi `upsertMktKpiAlerts()` để lưu vào database
  - Trang admin query từ database
- **Ưu điểm**: Lưu trữ lâu dài, quản lý tập trung
- **Nhược điểm**: Phụ thuộc vào việc lưu database thành công

## Vấn đề hiện tại

Việc lưu vào `localStorage` thành công (nên chuông hiển thị), nhưng việc lưu vào database **thất bại hoặc chưa được thực hiện** (nên trang admin trống).

---

# Hướng dẫn Debug MKT Alerts

## Bước 1: Kiểm tra xem iframe có gửi message không

1. Mở trang `/xem-bao-cao-mkt` trong trình duyệt
2. Mở DevTools Console (F12)
3. Chạy lệnh sau để lắng nghe message:

```javascript
window.addEventListener('message', (event) => {
  console.log('📨 Received message:', event.data);
  if (event.data?.type === 'LUMINEW_MKT_ALERTS') {
    console.log('✅ MKT Alerts message received!');
    console.log('Number of alerts:', event.data?.alerts?.length);
    console.log('Alerts:', event.data.alerts);
  }
});
```

4. Chọn một khoảng thời gian và thị trường trong iframe
5. Kiểm tra xem có message nào được log ra không

## Bước 2: Kiểm tra localStorage

Sau khi iframe gửi message, dữ liệu cũng được lưu vào localStorage:

```javascript
const data = localStorage.getItem('luminew.mktAlerts.v1');
console.log('LocalStorage alerts:', JSON.parse(data));
```

## Bước 3: Kiểm tra việc lưu vào database

Thêm console.log vào file `src/pages/XemBaoCaoMKTLegacy.jsx` dòng 146:

```javascript
await upsertMktKpiAlerts(batch, { sourcePage: payload.page });
console.log('✅ Upserted', batch.length, 'alerts to database');
```

## Bước 4: Kiểm tra lỗi trong service

Thêm console.log vào file `src/services/mktKpiAlertsService.js`:

```javascript
export async function upsertMktKpiAlerts(alerts, { sourcePage = 'xem-bao-cao-mkt' } = {}) {
  console.log('🔄 upsertMktKpiAlerts called with', alerts.length, 'alerts');
  
  const list = Array.isArray(alerts) ? alerts : [];
  if (list.length === 0) {
    console.log('⚠️ No alerts to upsert');
    return { upserted: 0 };
  }

  // ... existing code ...
  
  console.log('📝 Prepared', rows.length, 'rows for upsert');
  
  const { error } = await supabase.from('mkt_kpi_alerts').upsert(rows, { onConflict: 'alert_id' });
  if (error) {
    console.error('❌ Upsert error:', error);
    throw error;
  }
  
  console.log('✅ Successfully upserted', rows.length, 'alerts');
  return { upserted: rows.length };
}
```

## Bước 5: Test thủ công

Nếu các bước trên không phát hiện lỗi, hãy test thủ công bằng cách chạy:

```bash
node test_manual_upsert_alerts.js
```

## Kiểm tra nhanh

Chạy lệnh sau để xem có dữ liệu trong bảng không:

```bash
node .agent/scratch/check_mkt_alerts.js
```
