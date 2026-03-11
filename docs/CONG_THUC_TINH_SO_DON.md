# Công Thức Tính "Số Đơn" trong Danh Sách Báo Cáo Tay

## Tổng Quan

Cột **"Số đơn"** (`order_count`) trong trang `/danh-sach-bao-cao-tay` được tính tự động dựa trên số lượng đơn hàng từ API khớp với các điều kiện của báo cáo.

## Công Thức

```
Số đơn = Số lượng đơn hàng khớp với các điều kiện sau:
  - Ngày: order_date trùng với ngày báo cáo (YYYY-MM-DD)
  - Tên nhân viên Sale: Khớp (fuzzy matching)
  - Sản phẩm: Trùng khớp chính xác
  - Thị trường: Trùng khớp chính xác
```

## Chi Tiết Logic

### 1. Lấy Dữ Liệu Từ API

**API Endpoint:** `https://lumidataapi.vercel.app/orders`

**Parameters:**
- `from_date`: Ngày báo cáo (format: DD/MM/YYYY)
- `to_date`: Ngày báo cáo (format: DD/MM/YYYY) - cùng ngày với from_date
- `nhanvien_sale`: Tên nhân viên sale (nếu báo cáo có tên)
- `product`: Tên sản phẩm (nếu báo cáo có sản phẩm)
- `country`: Thị trường (nếu báo cáo có thị trường)

**Lưu ý:** Filter `shift` đã bị loại bỏ - không còn lọc theo ca làm việc.

### 2. Filter Client-Side (Bổ Sung)

Sau khi lấy dữ liệu từ API, hệ thống thực hiện thêm các filter ở client-side để đảm bảo độ chính xác:

#### a) Filter Theo Ngày (order_date)

**Logic:**
1. Lấy `order.order_date` từ mỗi đơn hàng
2. Normalize `order_date` về format YYYY-MM-DD:
   - Nếu là Date object: `orderDate.toISOString().split('T')[0]`
   - Nếu là string có dấu `/`: Parse DD/MM/YYYY → YYYY-MM-DD
   - Nếu là string có dấu `-`: Lấy phần trước `T` (YYYY-MM-DD)
3. So sánh với ngày báo cáo (đã normalize về YYYY-MM-DD)
4. Chỉ giữ lại các đơn có `order_date` trùng khớp với ngày báo cáo

**Trường dữ liệu từ API:**
- `order.order_date` (bắt buộc)

#### b) Filter Theo Tên Nhân Viên Sale (Fuzzy Matching)

**Hàm matching:** `namesMatch(name1, name2)`

**Logic:**
1. Normalize cả hai tên:
   - Trim (loại bỏ khoảng trắng đầu/cuối)
   - Chuyển sang lowercase
   - Loại bỏ khoảng trắng thừa (nhiều space thành 1 space)

2. So sánh:
   - Nếu `name1 === name2` → Khớp
   - Nếu `name1.includes(name2)` → Khớp
   - Nếu `name2.includes(name1)` → Khớp

**Ví dụ:**
- "Phạm Thị Yến" khớp với "Pham Thi Yen"
- "Nguyễn Văn A" khớp với "nguyễn văn a"
- "Trần Thị B" khớp với "Trần Thị B "

**Trường dữ liệu từ API:**
- `order.nhanvien_sale`
- `order.sale_staff` (fallback)

#### b) Filter Theo Sản Phẩm (Exact Match)

**Logic:**
- So sánh chính xác (case-sensitive) sau khi trim
- `order.product.trim() === report.product.trim()`

**Trường dữ liệu từ API:**
- `order.product`

#### c) Filter Theo Thị Trường (Exact Match)

**Logic:**
- So sánh chính xác (case-sensitive) sau khi trim
- `order.country.trim() === report.market.trim()`

**Trường dữ liệu từ API:**
- `order.country`

### 3. Tính Số Đơn

```javascript
const orderCount = matchingOrders.length;
```

**Kết quả:** Số lượng đơn hàng sau khi đã filter theo tất cả các điều kiện trên.

## Các Cột Liên Quan

Ngoài "Số đơn", hệ thống còn tính các cột khác:

### Số Đơn Hủy (`order_cancel_count`)
- **Điều kiện:** `check_result === "Hủy"` (chính xác, case-sensitive)
- **Công thức:** Số lượng đơn trong `matchingOrders` có `check_result = "Hủy"`

### Số Đơn Go (`order_go`)
- **Điều kiện:** 
  - Có Mã Tracking (khác rỗng)
  - Và `check_result !== "Hủy"`
- **Công thức:** Số lượng đơn trong `matchingOrders` thỏa cả 2 điều kiện trên

### Doanh Số (`revenue_actual`)
- **Công thức:** Tổng `total_amount_vnd` của tất cả đơn trong `matchingOrders`
- **Trường dữ liệu (theo thứ tự ưu tiên):**
  1. `order.total_amount_vnd`
  2. `order.total_vnd`
  3. `order.tongtien`
  4. `order.revenue_vnd`
  5. `order.total_amount`
  6. `order.amount`

### Doanh Số Hủy (`revenue_cancel_actual`)
- **Công thức:** Tổng `total_amount_vnd` của các đơn có `check_result = "Hủy"`

### Doanh Số Go (`revenue_go_actual`)
- **Công thức:** Tổng `total_amount_vnd` của các đơn "go" (có tracking code và không hủy)

## Ví Dụ Tính Toán Mẫu

### Báo Cáo Mẫu:
- **Ngày:** 15/03/2024
- **Tên:** "Dương Thị Hạnh"
- **Team:** "CSKH- LÝ"
- **Sản phẩm:** "Fitgum CAFE 20X"
- **Thị trường:** "US"

### Quy Trình Tính Toán Chi Tiết:

#### Bước 1: Gọi API với các filter cơ bản

```
GET https://lumidataapi.vercel.app/orders?
  from_date=15/03/2024&
  to_date=15/03/2024&
  nhanvien_sale=Dương Thị Hạnh&
  product=Fitgum CAFE 20X&
  country=US
```

**Kết quả từ API:** Giả sử API trả về 50 đơn hàng

#### Bước 2: Filter Client-Side theo order_date

**Ngày báo cáo normalized:** `2024-03-15` (YYYY-MM-DD)

**Lọc các đơn có order_date trùng khớp:**

| order.order_date (từ API) | Normalized | Khớp? | Kết quả |
|---------------------------|------------|-------|---------|
| "2024-03-15" | 2024-03-15 | ✅ | Giữ lại |
| "15/03/2024" | 2024-03-15 | ✅ | Giữ lại |
| "2024-03-14" | 2024-03-14 | ❌ | Loại bỏ |
| "2024-03-16" | 2024-03-16 | ❌ | Loại bỏ |
| "2024-03-15T10:30:00" | 2024-03-15 | ✅ | Giữ lại |

**Sau bước này:** Giả sử còn lại **45 đơn hàng**

#### Bước 3: Filter theo Tên Nhân Viên Sale (Fuzzy Matching)

**Tên báo cáo:** "Dương Thị Hạnh"

**Logic matching:**
- Normalize: `"dương thị hạnh"` (lowercase, trim, loại bỏ khoảng trắng thừa)

**Ví dụ các đơn được giữ lại:**
- `order.nhanvien_sale = "Dương Thị Hạnh"` → ✅ Khớp (exact match sau normalize)
- `order.nhanvien_sale = "Duong Thi Hanh"` → ✅ Khớp (includes match)
- `order.nhanvien_sale = "Dương Thị Hạnh "` → ✅ Khớp (trim spaces)
- `order.nhanvien_sale = "Nguyễn Văn A"` → ❌ Loại bỏ

**Sau bước này:** Giả sử còn lại **38 đơn hàng**

#### Bước 4: Filter theo Sản Phẩm (Exact Match)

**Sản phẩm báo cáo:** "Fitgum CAFE 20X"

**Logic matching:**
- So sánh chính xác sau khi trim: `order.product.trim() === "Fitgum CAFE 20X"`

**Ví dụ:**
- `order.product = "Fitgum CAFE 20X"` → ✅ Khớp
- `order.product = "Fitgum CAFE 20X "` → ✅ Khớp (sau trim)
- `order.product = "fitgum cafe 20x"` → ❌ Loại bỏ (case-sensitive)
- `order.product = "Fitgum CAFE 20"` → ❌ Loại bỏ (không đúng tên)

**Sau bước này:** Giả sử còn lại **32 đơn hàng**

#### Bước 5: Filter theo Thị Trường (Exact Match)

**Thị trường báo cáo:** "US"

**Logic matching:**
- So sánh chính xác sau khi trim: `order.country.trim() === "US"`

**Ví dụ:**
- `order.country = "US"` → ✅ Khớp
- `order.country = "US "` → ✅ Khớp (sau trim)
- `order.country = "us"` → ❌ Loại bỏ (case-sensitive)
- `order.country = "USA"` → ❌ Loại bỏ (không đúng)

**Sau bước này:** Giả sử còn lại **28 đơn hàng**

#### Bước 6: Tính Các Chỉ Số

**Kết quả cuối cùng:** 28 đơn hàng khớp với tất cả điều kiện

**Tính toán các chỉ số:**

1. **Số đơn (`order_count`):** 28

2. **Số đơn hủy (`order_cancel_count`):**
   - Đếm các đơn có `check_result === "Hủy"`
   - Giả sử có 3 đơn hủy → **Số đơn hủy = 3**

3. **Số đơn go (`order_go`):**
   - Đếm các đơn có:
     - `tracking_code !== ""` (có mã tracking)
     - Và `check_result !== "Hủy"` (không hủy)
   - Giả sử có 20 đơn go → **Số đơn go = 20**

4. **Doanh số (`revenue_actual`):**
   - Tổng `total_amount_vnd` của 28 đơn
   - Ví dụ: 1.500.000 + 2.300.000 + ... = **15.800.000 VNĐ**

5. **Doanh số hủy (`revenue_cancel_actual`):**
   - Tổng `total_amount_vnd` của 3 đơn hủy
   - Ví dụ: 500.000 + 300.000 + 200.000 = **1.000.000 VNĐ**

6. **Doanh số go (`revenue_go_actual`):**
   - Tổng `total_amount_vnd` của 20 đơn go
   - Ví dụ: 1.200.000 + 1.500.000 + ... = **12.500.000 VNĐ**

### Kết Quả Cuối Cùng:

| Chỉ số | Giá trị |
|--------|---------|
| **Số đơn** | 28 |
| **Số đơn hủy** | 3 |
| **Số đơn go** | 20 |
| **Doanh số** | 15.800.000 VNĐ |
| **Doanh số hủy** | 1.000.000 VNĐ |
| **Doanh số go** | 12.500.000 VNĐ |

### Lưu Ý Quan Trọng:

1. **order_date là điều kiện bắt buộc đầu tiên** - Chỉ các đơn có `order_date` trùng với ngày báo cáo mới được xem xét.

2. **Thứ tự filter:**
   - Bước 1: Filter theo `order_date` (bắt buộc)
   - Bước 2: Filter theo tên (fuzzy matching)
   - Bước 3: Filter theo sản phẩm (exact match)
   - Bước 4: Filter theo thị trường (exact match)

3. **Fuzzy matching cho tên** giúp xử lý các trường hợp:
   - Chữ hoa/chữ thường khác nhau
   - Có dấu/không dấu
   - Khoảng trắng thừa

4. **Exact matching cho sản phẩm và thị trường** đảm bảo độ chính xác cao.

## Lưu Ý

1. **Filter Theo order_date:** Chỉ lấy các đơn hàng có `order_date` trùng khớp với ngày báo cáo (format YYYY-MM-DD). Đây là điều kiện bắt buộc và được kiểm tra đầu tiên.

2. **Không Filter Theo Shift:** Filter `shift` đã bị loại bỏ, không còn ảnh hưởng đến tính toán.

3. **Fuzzy Matching:** Tên nhân viên được so khớp linh hoạt để xử lý các trường hợp:
   - Chữ hoa/chữ thường khác nhau
   - Khoảng trắng thừa
   - Có thể có dấu hoặc không dấu (tùy thuộc vào cách normalize)

4. **Exact Matching:** Sản phẩm và thị trường phải khớp chính xác (sau khi trim).

4. **Tự Động Tính:** Số đơn được tính tự động khi:
   - Sale nhập báo cáo mới (trong `/sale-nhap-bao-cao`)
   - Admin nhấn nút "Tính số đơn" (trong `/danh-sach-bao-cao-tay`)

## Code Reference

**File:** `src/pages/DanhSachBaoCaoTay.jsx`
**Hàm:** `handleCalculateAndUpdateOrders()` (dòng 753-1031)
**Hàm matching:** `namesMatch()` (dòng 649-653)
