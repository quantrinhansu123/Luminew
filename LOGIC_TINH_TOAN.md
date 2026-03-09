# Logic Tính Toán - Hệ Thống Báo Cáo Sale

## 📋 Tổng Quan

Hệ thống tự động tính toán 6 chỉ số từ API đơn hàng:
1. **Số đơn** (`order_count`)
2. **Số đơn hủy** (`order_cancel_count`)
3. **Số đơn go** (`order_go`)
4. **Doanh số** (`revenue_actual`)
5. **Doanh số hủy** (`revenue_cancel_actual`)
6. **Doanh số go** (`revenue_go_actual`)

---

## 🔗 API Endpoint

```
https://lumidataapi.vercel.app/orders
```

### Tham số API:
- `from_date`: Ngày bắt đầu (format: `DD/MM/YYYY`)
- `to_date`: Ngày kết thúc (format: `DD/MM/YYYY`)
- `nhanvien_sale`: Tên nhân viên sale
- `product`: Sản phẩm
- `country`: Thị trường

**Lưu ý:** Không lọc theo `shift` (Ca) nữa - đã bỏ điều kiện này.

### Ví dụ URL:
```
https://lumidataapi.vercel.app/orders?from_date=07/03/2026&to_date=07/03/2026&nhanvien_sale=Phạm Thị Yến&product=Bonavita Coffee&country=US
```

---

## 🔍 Bước 1: Lọc Đơn Hàng Từ API

### 1.1. Gọi API với các tham số filter
```javascript
const params = new URLSearchParams();
params.append('from_date', apiDate);      // Ngày của báo cáo
params.append('to_date', apiDate);        // Cùng ngày
params.append('nhanvien_sale', report.name);
// Shift filter removed - không lọc theo shift nữa
params.append('product', report.product);
params.append('country', report.market);
```

### 1.2. Lọc bổ sung phía Client (để đảm bảo chính xác)

#### A. Lọc theo Người báo cáo (nhanvien_sale)
```javascript
// So khớp mờ (fuzzy matching) để xử lý tên có thể khác nhau
matchingOrders = matchingOrders.filter(order => {
    const orderSaleStaff = (order.nhanvien_sale || order.sale_staff || '').trim();
    if (!orderSaleStaff) return false;
    return namesMatch(orderSaleStaff, report.name);
});
```

**Logic `namesMatch`:**
- Chuẩn hóa tên: loại bỏ dấu, chuyển chữ hoa, xóa khoảng trắng thừa
- So sánh: tên khớp hoàn toàn hoặc một tên chứa tên kia

#### B. Lọc theo Sản phẩm (product)
```javascript
matchingOrders = matchingOrders.filter(order => {
    const orderProduct = (order.product || '').trim();
    if (!orderProduct) return false;
    return orderProduct === report.product.trim(); // So khớp chính xác
});
```

#### C. Lọc theo Thị trường (market/country)
```javascript
matchingOrders = matchingOrders.filter(order => {
    const orderCountry = (order.country || '').trim();
    if (!orderCountry) return false;
    return orderCountry === report.market.trim(); // So khớp chính xác
});
```

---

## 📊 Bước 2: Tính Toán Các Chỉ Số

### 2.1. Số đơn (`order_count`)
```javascript
const orderCount = matchingOrders.length;
```
**Giải thích:** Đếm tổng số đơn hàng sau khi đã lọc theo tất cả điều kiện.

---

### 2.2. Số đơn hủy (`order_cancel_count`)
```javascript
const cancelledOrders = matchingOrders.filter(order => {
    const checkResult = (order.check_result || '').trim();
    return checkResult === 'Hủy'; // So khớp chính xác, có dấu
});
const orderCancelCount = cancelledOrders.length;
```
**Giải thích:** 
- Lọc từ các đơn đã khớp
- Chỉ lấy đơn có `check_result = "Hủy"` (chính xác, có dấu)
- Đếm số lượng

---

### 2.4. Doanh số (`revenue_actual`)
```javascript
const totalRevenue = matchingOrders.reduce((sum, order) => {
    const revenue = parseFloat(
        order.total_amount_vnd ||    // Ưu tiên 1
        order.total_vnd ||            // Ưu tiên 2
        order.tongtien ||             // Ưu tiên 3
        order.revenue_vnd ||           // Ưu tiên 4
        order.total_amount ||          // Ưu tiên 5
        order.amount ||                // Ưu tiên 6
        0                              // Mặc định
    );
    return sum + (isNaN(revenue) || !isFinite(revenue) ? 0 : revenue);
}, 0);
```
**Giải thích:**
- Tính tổng `total_amount_vnd` của **TẤT CẢ** đơn hàng đã khớp
- Thử nhiều tên trường vì API có thể trả về tên khác nhau
- Xử lý giá trị không hợp lệ (NaN, Infinity) → trả về 0

---

### 2.5. Doanh số hủy (`revenue_cancel_actual`)
```javascript
const revenueCancelActual = cancelledOrders.reduce((sum, order) => {
    const revenue = parseFloat(
        order.total_amount_vnd || 
        order.total_vnd || 
        order.tongtien || 
        order.revenue_vnd ||
        order.total_amount ||
        order.amount ||
        0
    );
    return sum + (isNaN(revenue) || !isFinite(revenue) ? 0 : revenue);
}, 0);
```
**Giải thích:**
- Tính tổng `total_amount_vnd` của **CHỈ CÁC ĐƠN HỦY** (`cancelledOrders`)
- Cùng logic với `revenue_actual` nhưng chỉ tính trên đơn hủy

---

### 2.6. Doanh số go (`revenue_go_actual`)
```javascript
const revenueGoActual = goOrders.reduce((sum, order) => {
    const revenue = parseFloat(
        order.total_amount_vnd || 
        order.total_vnd || 
        order.tongtien || 
        order.revenue_vnd ||
        order.total_amount ||
        order.amount ||
        0
    );
    return sum + (isNaN(revenue) || !isFinite(revenue) ? 0 : revenue);
}, 0);
```
**Giải thích:**
- Tính tổng `total_amount_vnd` của **CHỈ CÁC ĐƠN GO** (`goOrders`)
- Cùng logic với `revenue_actual` nhưng chỉ tính trên đơn go (có tracking và không hủy)

---

### 2.6. Doanh số go (`revenue_go_actual`)
```javascript
const revenueGoActual = goOrders.reduce((sum, order) => {
    const revenue = parseFloat(
        order.total_amount_vnd || 
        order.total_vnd || 
        order.tongtien || 
        order.revenue_vnd ||
        order.total_amount ||
        order.amount ||
        0
    );
    return sum + (isNaN(revenue) || !isFinite(revenue) ? 0 : revenue);
}, 0);
```
**Giải thích:**
- Tính tổng `total_amount_vnd` của **CHỈ CÁC ĐƠN GO** (`goOrders`)
- Cùng logic với `revenue_actual` nhưng chỉ tính trên đơn go (có tracking và không hủy)

---

## ✅ Bước 3: Validate và Cập Nhật Database

### 3.1. Validate dữ liệu
```javascript
const validRevenue = isNaN(totalRevenue) || !isFinite(totalRevenue) ? 0 : Number(totalRevenue);
const validRevenueCancel = isNaN(revenueCancelActual) || !isFinite(revenueCancelActual) ? 0 : Number(revenueCancelActual);
const validOrderCount = Number(orderCount) || 0;
const validOrderCancelCount = Number(orderCancelCount) || 0;
```

### 3.2. Cập nhật Database
```javascript
const updateData = { 
    order_count: validOrderCount,
    order_cancel_count: validOrderCancelCount,
    order_go: validOrderGoCount,
    revenue_actual: validRevenue,
    revenue_cancel_actual: validRevenueCancel,
    revenue_go_actual: validRevenueGo
};

// Cập nhật vào Supabase
await supabase
    .from('sales_reports')
    .update(updateData)
    .eq('id', report.id);
```

### 3.3. Xử lý lỗi (nếu cột không tồn tại)
```javascript
if (error && error.code === 'PGRST204') {
    // Cột không tồn tại → thử cập nhật từng phần
    // 1. Thử cập nhật order_count và order_cancel_count
    // 2. Thử cập nhật revenue_actual riêng
    // 3. Thử cập nhật revenue_cancel_actual riêng
}
```

---

## 📍 Nơi Áp Dụng Logic

### 1. **DanhSachBaoCaoTay.jsx**
- **Hàm:** `handleCalculateAndUpdateOrders`
- **Kích hoạt:** Khi nhấn nút "Tính số đơn"
- **Phạm vi:** Tính toán cho tất cả báo cáo trong khoảng thời gian đã chọn

### 2. **ReportForm.jsx**
- **Hàm:** `handleSubmit` (phần tính toán tự động)
- **Kích hoạt:** Tự động khi sale nhấn "Lưu" báo cáo mới
- **Phạm vi:** Tính toán cho từng báo cáo vừa được tạo

---

## 🔑 Điểm Quan Trọng

1. **Lọc 2 bước:**
   - Bước 1: Gọi API với filter → giảm dữ liệu
   - Bước 2: Lọc client-side → đảm bảo chính xác

2. **Fuzzy Matching cho tên:**
   - Xử lý trường hợp tên có thể viết khác nhau
   - Ví dụ: "Phạm Thị Yến" vs "Pham Thi Yen"

3. **Xử lý lỗi graceful:**
   - Nếu cột không tồn tại → bỏ qua, không crash
   - Log lỗi để debug

4. **Đa dạng tên trường revenue:**
   - Thử nhiều tên trường vì API có thể trả về khác nhau
   - Ưu tiên: `total_amount_vnd` > `total_vnd` > `tongtien` > ...

---

## 📝 Ví Dụ Cụ Thể

### Báo cáo:
- **Ngày:** 07/03/2026
- **Người báo cáo:** Phạm Thị Yến
- **Sản phẩm:** Bonavita Coffee
- **Thị trường:** US

**Lưu ý:** Không lọc theo Ca (shift) nữa.

### Đơn hàng từ API:
1. Đơn A: `nhanvien_sale="Phạm Thị Yến"`, `shift="Hết ca"`, `product="Bonavita Coffee"`, `country="US"`, `check_result="Thành công"`, `total_amount_vnd=1000000`
2. Đơn B: `nhanvien_sale="Phạm Thị Yến"`, `shift="Hết ca,Giữa ca"`, `product="Bonavita Coffee"`, `country="US"`, `check_result="Hủy"`, `total_amount_vnd=500000`
3. Đơn C: `nhanvien_sale="Nguyễn Văn A"`, `shift="Hết ca"`, `product="Bonavita Coffee"`, `country="US"`, `check_result="Thành công"`, `total_amount_vnd=800000`

### Kết quả:
- **Số đơn (`order_count`):** 2 (Đơn A và Đơn B - Đơn C không khớp tên, không quan tâm shift)
- **Số đơn hủy (`order_cancel_count`):** 1 (Đơn B)
- **Số đơn go (`order_go`):** 1 (Đơn A - có tracking và không hủy)
- **Doanh số (`revenue_actual`):** 1,500,000 VNĐ (1,000,000 + 500,000)
- **Doanh số hủy (`revenue_cancel_actual`):** 500,000 VNĐ (chỉ Đơn B)
- **Doanh số go (`revenue_go_actual`):** 1,000,000 VNĐ (chỉ Đơn A)

---

## 🛠️ Helper Functions

### `normalizeNameForMatch(name)`
- Loại bỏ dấu tiếng Việt
- Chuyển chữ hoa → chữ thường
- Xóa khoảng trắng thừa

### `namesMatch(name1, name2)`
- So sánh 2 tên sau khi normalize
- Trả về `true` nếu khớp hoàn toàn hoặc một tên chứa tên kia

### `convertDateToAPIFormat(date)`
- Chuyển đổi ngày từ format database → format API (`DD/MM/YYYY`)

### `normalizeDate(date)`
- Chuẩn hóa ngày từ nhiều format khác nhau
