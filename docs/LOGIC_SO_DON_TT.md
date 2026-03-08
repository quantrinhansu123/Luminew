# Logic Tính Cột "Số đơn TT" (Total Orders)

## Tổng quan

Cột **"Số đơn TT"** trong view `/xem-bao-cao-sale` được tính bằng cách **match** các đơn hàng từ API `/orders` với các records trong báo cáo (`sales_reports`) dựa trên các tiêu chí matching.

## Nguồn dữ liệu

1. **Báo cáo (transformedData)**: Dữ liệu từ bảng `sales_reports` đã được transform
   - Trường: `Tên` (Sale staff), `Ngày`, `Sản phẩm`, `Thị trường`

2. **Đơn hàng (allOrders)**: Dữ liệu từ API `/orders` endpoint
   - Trường: `sale_staff` (hoặc `nhanvien_sale`), `order_date`, `product`, `country`

## Quy trình tính toán

### Bước 1: Fetch đơn hàng từ API

```javascript
// Fetch tất cả đơn hàng trong khoảng thời gian với filters
const apiFilters = {
    from_date: startDate,  // DD/MM/YYYY
    to_date: endDate,      // DD/MM/YYYY
    product: filters.products?.join(','),  // Nếu có filter
    country: filters.markets?.join(','),   // Nếu có filter
    team: filters.teams?.join(','),        // Nếu có filter
    shift: filters.shifts?.join(',')       // Nếu có filter
};

// Sử dụng cursor pagination để fetch tất cả đơn hàng
// Mỗi batch: limit = 10000, sử dụng next_after_id để pagination
```

### Bước 2: Normalize dữ liệu

**Normalize Date:**
- Chuyển tất cả các format date về `YYYY-MM-DD` (local time, không dùng UTC)
- Hỗ trợ các format: `YYYY-MM-DD`, `DD/MM/YYYY`, `Date object`, ISO string

**Normalize String:**
- Trim whitespace
- Chuyển về lowercase
- Chuẩn hóa khoảng trắng (nhiều space → 1 space)

### Bước 3: Group đơn hàng theo Key

**Key format:** `{sale_name}|{date}|{product}|{market}`

```javascript
// Ví dụ key:
"phạm tuyết trinh|2026-01-29|dragon blood cream|us"
"nguyễn văn a|2026-01-30|fitgum cafe 20x|vn"
```

Tất cả đơn hàng được group vào `Map` với key này.

### Bước 4: Match đơn hàng với records trong báo cáo

Với mỗi record trong báo cáo, thực hiện matching theo thứ tự ưu tiên:

#### **Ưu tiên 1: Match đầy đủ (Exact Match)**

```javascript
key = `${saleName}|${reportDate}|${reportProduct}|${reportMarket}`;
matchingOrders = ordersBySaleDateProductMarket.get(key) || [];
```

**Điều kiện match:**
- ✅ Tên Sale: `normalizeStr(item['Tên'])` === `normalizeStr(order.sale_staff)`
- ✅ Ngày: `normalizeDate(item['Ngày'])` === `normalizeDate(order.order_date)`
- ✅ Sản phẩm: `normalizeStr(item['Sản phẩm'])` === `normalizeStr(order.product)`
- ✅ Thị trường: `normalizeStr(item['Thị trường'])` === `normalizeStr(order.country)`

#### **Ưu tiên 2: Match khi báo cáo không có Product/Market**

Nếu record trong báo cáo có `Sản phẩm` hoặc `Thị trường` = empty:

```javascript
// Tìm tất cả đơn hàng của Sale này ngày này (bất kỳ product/market nào)
prefix = `${saleName}|${reportDate}|`;
// Lấy tất cả orders có key bắt đầu bằng prefix
```

#### **Ưu tiên 3: Match với key không có Product/Market**

Nếu không match được với key đầy đủ:

```javascript
keyWithoutProductMarket = `${saleName}|${reportDate}||`;
matchingOrders = ordersBySaleDateProductMarket.get(keyWithoutProductMarket) || [];

// Chỉ lấy các đơn hàng có product hoặc market empty
emptyProductMarketOrders = matchingOrders.filter(order => {
    return normalizeStr(order.product || '') === '' || 
           normalizeStr(order.country || '') === '';
});
```

#### **Ưu tiên 4: Fallback Match (Tên + Ngày)**

Nếu vẫn không match được, thử match theo **Tên + Ngày** (bỏ qua product/market):

**Điều kiện:**
1. Có đơn hàng của Sale này ngày này
2. Tổng số đơn > số đơn đã match bởi các records khác (còn đơn chưa match)
3. Chỉ lấy các đơn **chưa được match** bởi records khác (tránh tính trùng)

```javascript
// Tìm tất cả orders của Sale này ngày này
allSaleOrdersOnDate = allOrders.filter(order => {
    return normalizeStr(order.sale_staff) === saleName && 
           normalizeDate(order.order_date) === reportDate;
});

// Lọc ra các đơn chưa được match bởi records khác
unmatchedOrders = allSaleOrdersOnDate.filter(order => {
    // Kiểm tra order này đã được match bởi record khác chưa
    // Nếu chưa → return true
});
```

### Bước 5: Tránh đếm trùng (Deduplication)

**Quan trọng:** Mỗi đơn hàng chỉ được đếm **1 lần duy nhất** cho **1 record**.

```javascript
// Track các order_code đã được đếm
const countedOrderCodes = new Set();

// Chỉ lấy các orders chưa được đếm
uncountedMatchingOrders = matchingOrders.filter(order => {
    return order.order_code && !countedOrderCodes.has(order.order_code);
});

// Đánh dấu các orders mới được đếm
uncountedMatchingOrders.forEach(order => {
    if (order.order_code) {
        countedOrderCodes.add(order.order_code);
    }
});

// Tính số đơn
soDonTT = uncountedMatchingOrders.length;
```

## Ví dụ cụ thể

### Ví dụ 1: Match đầy đủ

**Báo cáo:**
- Tên: "Phạm Tuyết Trinh"
- Ngày: "2026-01-29"
- Sản phẩm: "Dragon Blood Cream"
- Thị trường: "US"

**Đơn hàng:**
- Order 1: `sale_staff="Phạm Tuyết Trinh"`, `order_date="2026-01-29"`, `product="Dragon Blood Cream"`, `country="US"` ✅ Match
- Order 2: `sale_staff="Phạm Tuyết Trinh"`, `order_date="2026-01-29"`, `product="Fitgum CAFE"`, `country="US"` ❌ Không match (product khác)

**Kết quả:** `Số đơn TT = 1`

### Ví dụ 2: Match với Product/Market empty

**Báo cáo:**
- Tên: "Nguyễn Văn A"
- Ngày: "2026-01-30"
- Sản phẩm: "" (empty)
- Thị trường: "" (empty)

**Đơn hàng:**
- Order 1: `sale_staff="Nguyễn Văn A"`, `order_date="2026-01-30"`, `product=""`, `country="VN"` ✅ Match (fallback)
- Order 2: `sale_staff="Nguyễn Văn A"`, `order_date="2026-01-30"`, `product="SP1"`, `country=""` ✅ Match (fallback)

**Kết quả:** `Số đơn TT = 2` (tất cả đơn của Sale này ngày này)

### Ví dụ 3: Tránh đếm trùng

**Báo cáo có 2 records cùng Sale + Ngày:**

**Record 1:**
- Tên: "Phạm Tuyết Trinh"
- Ngày: "2026-01-29"
- Sản phẩm: "Dragon Blood Cream"
- Thị trường: "US"

**Record 2:**
- Tên: "Phạm Tuyết Trinh"
- Ngày: "2026-01-29"
- Sản phẩm: "Fitgum CAFE"
- Thị trường: "VN"

**Đơn hàng:**
- Order 1: `sale_staff="Phạm Tuyết Trinh"`, `order_date="2026-01-29"`, `product="Dragon Blood Cream"`, `country="US"` → Match với Record 1
- Order 2: `sale_staff="Phạm Tuyết Trinh"`, `order_date="2026-01-29"`, `product="Fitgum CAFE"`, `country="VN"` → Match với Record 2

**Kết quả:**
- Record 1: `Số đơn TT = 1` (Order 1)
- Record 2: `Số đơn TT = 1` (Order 2)
- **Tổng = 2** (không bị trùng)

## Lưu ý quan trọng

1. **Normalize là bắt buộc:** Tất cả string comparisons đều phải normalize (trim, lowercase) để tránh lỗi do format khác nhau.

2. **Date format:** Luôn sử dụng LOCAL date (YYYY-MM-DD), không dùng UTC để tránh lỗi timezone.

3. **Tránh đếm trùng:** Mỗi `order_code` chỉ được đếm 1 lần duy nhất cho 1 record. Nếu có nhiều records cùng Sale + Ngày, mỗi record chỉ lấy các đơn chưa được match bởi records khác.

4. **Fallback logic:** Chỉ dùng fallback match (Tên + Ngày) khi:
   - Không match được với key đầy đủ
   - Còn đơn chưa được match bởi records khác
   - Để tránh tính trùng

5. **API Filters:** Các filters (product, market, team, shift) được truyền vào API để giảm số lượng đơn hàng cần xử lý, nhưng matching vẫn được thực hiện client-side để đảm bảo chính xác.

## Debugging

Hàm có logging chi tiết để debug:
- Số đơn fetch được từ API
- Phân bổ đơn theo ngày
- Các keys được tạo
- Số đơn match được cho mỗi record
- Cảnh báo khi không match được nhưng có đơn của Sale này ngày này
