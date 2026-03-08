# Logic Tính Toán Báo Cáo Vận Đơn

## Tổng Quan

Component `BaoCaoVanDon` tính toán các chỉ số dựa trên dữ liệu từ API `/orders`. Logic tính toán được thực hiện trong hàm `reportStats` (useMemo).

## Cấu Trúc Dữ Liệu Đầu Vào

Dữ liệu từ API có dạng:
```json
{
  "id": "00002796-190f-49a2-b7c4-21052b779387",
  "nhanvien_maketing": "Mạnh Cường",
  "nhanvien_sale": "Phạm Thị Yến",
  "ngaytao": "2026-03-06T12:40:20.130728+00:00",
  "tongtien": 2064000,
  "order_date": "2025-10-07",
  "country": "Nhật Bản",
  "product": "Fitgum CAFE 20X",
  "total_amount_vnd": 2064000,
  "tracking_code": "856733743460",
  "team": "Hà Nội",
  "delivery_status": "Giao Thành Công",
  "payment_status": "Có bill",
  "delivery_staff": null,
  "check_result": "OK",
  "shift": "Hết ca"
}
```

## Các Chỉ Số Được Tính

### 1. Đã Thanh Toán (có bill)
- **Điều kiện**: `payment_status` chứa chuỗi "Có bill"
- **Cách tính**: 
  - Đếm số đơn: `count++`
  - Cộng dồn tiền: `amount += total_amount_vnd`
- **Nguồn dữ liệu**: `payment_status` từ API

### 2. Bill 1 phần
- **Điều kiện**: `payment_status` chứa chuỗi "Có bill 1 phần"
- **Cách tính**: Chỉ đếm số đơn (`count++`)
- **Nguồn dữ liệu**: `payment_status` từ API

### 3. Tổng đơn lên nội bộ
- **Điều kiện**: Tất cả các đơn trong khoảng thời gian đã chọn
- **Cách tính**: Đếm tất cả các đơn (`count++`)
- **Lưu ý**: Đây là chỉ số tổng, không có điều kiện lọc

### 4. Tổng đơn đủ điều kiện đẩy vận hành
- **Điều kiện**: `payment_status` chứa "Có bill" HOẶC "Có bill 1 phần"
- **Cách tính**: Đếm số đơn (`count++`)
- **Ý nghĩa**: Số đơn đã có bill (toàn phần hoặc một phần) → đủ điều kiện để đẩy sang vận hành

### 5. Tổng đơn lên vận hành
- **Điều kiện**: 
  - `delivery_status` có giá trị (không rỗng)
  - VÀ không phải "Chưa Giao"
  - VÀ không phải "chờ check"
  - VÀ không phải "Hủy" (huỷ/hủy/cancel)
- **Cách tính**: Đếm số đơn (`count++`)
- **Ý nghĩa**: Số đơn đã được đẩy lên hệ thống vận hành

### 6. Giao Thành Công
- **Điều kiện**: `delivery_status` chứa chuỗi "Giao Thành Công"
- **Cách tính**: Đếm số đơn (`count++`)

### 7. Đang Giao
- **Điều kiện**: `delivery_status` chứa chuỗi "Đang Giao"
- **Cách tính**: Đếm số đơn (`count++`)

### 8. Chưa Giao
- **Điều kiện**: `delivery_status` chứa chuỗi "Chưa Giao"
- **Cách tính**: Đếm số đơn (`count++`)

### 9. Hoàn
- **Điều kiện**: `delivery_status` chứa chuỗi "Hoàn"
- **Cách tính**: Đếm số đơn (`count++`)

### 10. Hủy
- **Điều kiện**: `delivery_status` chứa một trong các chuỗi: "huỷ", "hủy", "cancel" (không phân biệt hoa thường)
- **Cách tính**: Đếm số đơn (`count++`)

### 11. chờ check
- **Điều kiện**: `delivery_status` chứa chuỗi "chờ check"
- **Cách tính**: Đếm số đơn (`count++`)

### 12. Trống trạng thái
- **Điều kiện**: `delivery_status` rỗng hoặc null
- **Cách tính**: Đếm số đơn (`count++`)

## Các Tỷ Lệ Được Tính

### 1. Tỷ lệ đơn lên vận hành
- **Công thức**: `(Tổng đơn lên vận hành / Tổng đơn lên nội bộ) * 100`
- **Ý nghĩa**: Phần trăm đơn được đẩy lên vận hành so với tổng đơn
- **Ngưỡng cảnh báo**: 
  - > 70%: Màu xanh (tích cực)
  - ≤ 70%: Màu đỏ (cần cải thiện)

### 2. Tỷ lệ thu tiền/giao thành công
- **Công thức**: `(Đã Thanh Toán (có bill) / Giao Thành Công) * 100`
- **Ý nghĩa**: Phần trăm đơn đã thu tiền so với đơn giao thành công
- **Ngưỡng cảnh báo**: 
  - > 80%: Màu xanh (tích cực)
  - ≤ 80%: Màu đỏ (cần cải thiện)

### 3. Tỷ lệ đơn tính phí vận chuyển
- **Công thức**: `(Giao Thành Công / Tổng đơn lên vận hành) * 100`
- **Ý nghĩa**: Phần trăm đơn giao thành công so với đơn đã lên vận hành
- **Ngưỡng cảnh báo**: 
  - > 80%: Màu xanh (tích cực)
  - ≤ 80%: Màu đỏ (cần cải thiện)

## Cấu Trúc Tính Toán

### Phân Cấp Dữ Liệu

Logic tính toán được thực hiện theo 3 cấp độ:

1. **Theo Đơn vị vận chuyển** (company level)
   - Tính cho từng nhân viên + từng đơn vị vận chuyển

2. **Theo Nhân viên** (staff level)
   - Tính tổng cho từng nhân viên (tổng hợp từ tất cả các đơn vị vận chuyển)

3. **Tổng toàn bộ** (grand total)
   - Tính tổng cho tất cả nhân viên và đơn vị vận chuyển

### Code Logic

```javascript
filteredReportData.forEach(row => {
    const staffName = row["NV Vận đơn"] || "Chưa có NV";
    const company = row["Đơn vị vận chuyển"] || "Không xác định";
    
    // Khởi tạo stats nếu chưa có
    if (!staffStats[staffName]) {
        staffStats[staffName] = { 
            _total: createEmptyStats(), 
            byCompany: {} 
        };
    }
    if (!staffStats[staffName].byCompany[company]) {
        staffStats[staffName].byCompany[company] = createEmptyStats();
    }
    
    // 3 targets: company level, staff level, grand total
    const targets = [
        staffStats[staffName].byCompany[company],  // Company level
        staffStats[staffName]._total,              // Staff level
        grandTotal                                 // Grand total
    ];
    
    // Tính toán cho cả 3 cấp độ cùng lúc
    targets.forEach(t => {
        // Tính các chỉ số...
    });
});
```

## Ví Dụ Tính Toán

### Ví dụ 1: Đơn có bill và giao thành công

**Dữ liệu đơn:**
- `payment_status`: "Có bill"
- `delivery_status`: "Giao Thành Công"
- `total_amount_vnd`: 2,000,000

**Kết quả tính toán:**
- ✅ Đã Thanh Toán (có bill): count = 1, amount = 2,000,000
- ✅ Tổng đơn lên nội bộ: count = 1
- ✅ Tổng đơn đủ đkien đẩy vh: count = 1
- ✅ Tổng đơn lên vận hành: count = 1
- ✅ Giao Thành Công: count = 1

### Ví dụ 2: Đơn chưa có bill và chưa giao

**Dữ liệu đơn:**
- `payment_status`: "" (rỗng)
- `delivery_status`: "Chưa Giao"
- `total_amount_vnd`: 1,500,000

**Kết quả tính toán:**
- ❌ Đã Thanh Toán (có bill): count = 0, amount = 0
- ✅ Tổng đơn lên nội bộ: count = 1
- ❌ Tổng đơn đủ đkien đẩy vh: count = 0 (không có bill)
- ❌ Tổng đơn lên vận hành: count = 0 (trạng thái "Chưa Giao")
- ✅ Chưa Giao: count = 1

### Ví dụ 3: Đơn bị hủy

**Dữ liệu đơn:**
- `payment_status`: "Có bill"
- `delivery_status`: "Hủy"
- `total_amount_vnd`: 3,000,000

**Kết quả tính toán:**
- ✅ Đã Thanh Toán (có bill): count = 1, amount = 3,000,000
- ✅ Tổng đơn lên nội bộ: count = 1
- ✅ Tổng đơn đủ đkien đẩy vh: count = 1
- ❌ Tổng đơn lên vận hành: count = 0 (bị hủy)
- ✅ Hủy: count = 1

## Lưu Ý Quan Trọng

1. **Case-insensitive matching**: Khi kiểm tra trạng thái, code sử dụng `.toLowerCase()` để so sánh không phân biệt hoa thường.

2. **Partial string matching**: Code sử dụng `.includes()` để kiểm tra chuỗi con, không phải so sánh chính xác.

3. **Multiple conditions**: Một đơn có thể được tính vào nhiều chỉ số khác nhau (ví dụ: vừa là "Đã Thanh Toán" vừa là "Giao Thành Công").

4. **Null/Empty handling**: Code xử lý các trường hợp null, undefined, và chuỗi rỗng một cách an toàn.

5. **Currency parsing**: Khi tính tiền, code parse số từ chuỗi và loại bỏ các ký tự không phải số.

## Mapping Từ API

Các field từ API được map sang format mà component sử dụng:

| API Field | Component Field | Ghi chú |
|-----------|----------------|---------|
| `order_date` | `"Ngày lên đơn"` | Date của đơn |
| `total_amount_vnd` | `"Tổng tiền VNĐ"` | Số tiền |
| `delivery_staff` | `"NV Vận đơn"` | Nhân viên vận đơn |
| `delivery_status` | `"Trạng thái giao hàng NB"` | Trạng thái giao hàng |
| `payment_status` | `"Trạng thái thu tiền"` | Trạng thái thanh toán |
| `check_result` | `"Kết quả check"` | Kết quả kiểm tra |
| `country` | `"khu vực"` | Khu vực/thị trường |
| `product` | `"Mặt hàng"` | Sản phẩm |
| `tracking_code` | `"Mã Tracking"` | Mã tracking |
| `team` | `"Team"` | Team |
| `id` | `"Mã đơn hàng"` | Mã đơn |
