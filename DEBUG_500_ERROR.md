# Hướng dẫn Debug Lỗi 500 Internal Server Error

## 📋 Lỗi 500 Internal Server Error là gì?

Lỗi **500 Internal Server Error** có nghĩa là:
- ✅ Yêu cầu từ trình duyệt đã đến được máy chủ
- ❌ Máy chủ gặp lỗi khi xử lý yêu cầu
- ❌ Đây là lỗi từ phía **server**, không phải từ code frontend

## 🔍 Các bước để tìm endpoint bị lỗi

### Bước 1: Mở Developer Tools trong trình duyệt

1. Nhấn `F12` hoặc `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
2. Chuyển đến tab **Console** để xem thông báo lỗi
3. Chuyển đến tab **Network** (Mạng) để xem các request

### Bước 2: Tìm request bị lỗi trong tab Network

1. Trong tab **Network**, tìm các request có status code **500** (màu đỏ)
2. Click vào request đó để xem chi tiết:
   - **Request URL**: URL nào đang bị lỗi?
   - **Response**: Server trả về gì?
   - **Headers**: Thông tin headers

### Bước 3: Xác định endpoint đang lỗi

Các API endpoint có thể bị lỗi trong ứng dụng:

#### 1. API lấy dữ liệu F3
- **URL**: `https://n-api-gamma.vercel.app/sheet/F3/data`
- **Sử dụng trong**: `src/services/api.js` → `fetchOrders()`
- **Trang sử dụng**: Danh sách đơn, các trang báo cáo

#### 2. API detail_reports (MKT)
- **URL**: `https://lumidataapi.vercel.app/detail_reports`
- **Sử dụng trong**: `src/pages/BaoCaoHieuSuatKPI.jsx`, `viewNsMoiNhanh.html`
- **Trang sử dụng**: Báo cáo hiệu suất KPI, Xem báo cáo MKT

#### 3. API cập nhật dữ liệu
- **URL**: `https://n-api-gamma.vercel.app/sheet/F3/update-single`
- **Sử dụng trong**: `src/services/api.js` → `updateSingleCell()`

#### 4. API batch update
- **URL**: `https://n-api-gamma.vercel.app/sheet/F3/update?verbose=true`
- **Sử dụng trong**: `src/services/api.js` → `updateBatch()`

#### 5. API MGT nội bộ
- **URL**: `https://n-api-gamma.vercel.app/sheet/MGT nội bộ/data`
- **Sử dụng trong**: `src/services/api.js` → `fetchMGTNoiBoOrders()`

## 🛠️ Cách kiểm tra API có hoạt động không

### Cách 1: Test trực tiếp trong trình duyệt

Mở URL này trong trình duyệt (thay thế bằng URL đang bị lỗi):

```
https://n-api-gamma.vercel.app/sheet/F3/data
```

Nếu thấy JSON data → API đang hoạt động
Nếu thấy lỗi 500 → API đang gặp vấn đề

### Cách 2: Test bằng curl (Command Line)

```powershell
# Test API F3 data
curl https://n-api-gamma.vercel.app/sheet/F3/data

# Test API detail_reports (MKT)
curl "https://lumidataapi.vercel.app/detail_reports"
```

### Cách 3: Kiểm tra trong Console của trình duyệt

Mở Console (F12) và chạy:

```javascript
// Test API F3
fetch('https://n-api-gamma.vercel.app/sheet/F3/data')
  .then(r => r.json())
  .then(data => console.log('✅ API OK:', data))
  .catch(err => console.error('❌ API Error:', err));

// Test API detail_reports
fetch('https://lumidataapi.vercel.app/detail_reports')
  .then(r => r.json())
  .then(data => console.log('✅ API OK:', data))
  .catch(err => console.error('❌ API Error:', err));
```

## 🔧 Nguyên nhân có thể và cách xử lý

### 1. Server API đang down/bảo trì
**Giải pháp**: 
- Đợi server được sửa
- Liên hệ với team backend/DevOps
- Kiểm tra status của Vercel deployment

### 2. Server quá tải
**Giải pháp**:
- Đợi một chút rồi thử lại
- Giảm số lượng request gửi đi

### 3. Lỗi trong code backend
**Giải pháp**:
- Cần sửa code backend (không phải frontend)
- Kiểm tra logs của server nếu có quyền truy cập

### 4. Dữ liệu không hợp lệ được gửi lên
**Giải pháp**:
- Kiểm tra dữ liệu đang gửi trong tab Network → Request Payload
- Đảm bảo format dữ liệu đúng

## 💡 Xử lý tạm thời trong code

Nếu API bị lỗi 500, một số function đã có fallback data:

- `fetchOrders()` trong `src/services/api.js` có fallback demo data
- Các function khác có thể cần thêm error handling

### Cải thiện error handling:

```javascript
// Ví dụ: Thêm error handling tốt hơn
try {
  const response = await fetch(API_URL);
  
  if (!response.ok) {
    if (response.status === 500) {
      console.error('Server error 500 - API đang gặp vấn đề');
      // Có thể show thông báo cho user
      toast.error('Máy chủ đang gặp sự cố. Vui lòng thử lại sau.');
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data;
} catch (error) {
  console.error('API Error:', error);
  // Fallback hoặc thông báo lỗi
}
```

## 📝 Checklist khi gặp lỗi 500

- [ ] Mở Developer Tools (F12)
- [ ] Kiểm tra tab Console để xem có thông báo lỗi gì không
- [ ] Kiểm tra tab Network để tìm request bị lỗi 500
- [ ] Ghi lại URL endpoint bị lỗi
- [ ] Copy response từ server (nếu có)
- [ ] Test trực tiếp URL trong trình duyệt
- [ ] Kiểm tra xem có endpoint nào khác cũng bị lỗi không
- [ ] Thử refresh trang và xem lỗi có lặp lại không
- [ ] Kiểm tra xem server API có đang hoạt động không (Vercel status)

## 🆘 Thông tin cần cung cấp khi báo lỗi

Khi báo lỗi cho team backend hoặc support, cung cấp:

1. **URL endpoint bị lỗi**: `https://n-api-gamma.vercel.app/...`
2. **HTTP Method**: GET, POST, PATCH, etc.
3. **Request Payload**: Dữ liệu gửi lên (nếu có)
4. **Response**: Thông báo lỗi từ server (nếu có)
5. **Thời gian xảy ra**: Khi nào lỗi xảy ra?
6. **Có thể reproduce không**: Lỗi có xảy ra liên tục không?
7. **Screenshot**: Screenshot của tab Network và Console




