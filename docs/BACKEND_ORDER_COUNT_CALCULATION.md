# Backend Service - Tự động tính order_count

## Tổng quan

Backend service tự động tính toán cột `order_count` trong bảng `sales_reports` bằng cách đếm số đơn trong bảng `orders` khớp với các điều kiện.

## API Endpoints

### 1. `/api/calculate-order-count`

**Mục đích:** Tính toán `order_count` cho các records trong `sales_reports`

**Methods:** `GET`, `POST`

**Query Parameters:**
- `recordId` (optional): Tính toán cho một record cụ thể
- `date` (optional): Tính toán cho tất cả records trong một ngày (format: YYYY-MM-DD)
- `recalculateAll` (optional): `true` để tính toán lại tất cả records (mặc định: `false`)

**Ví dụ:**
```bash
# Tính toán cho một record cụ thể
GET /api/calculate-order-count?recordId=123

# Tính toán cho tất cả records trong một ngày
GET /api/calculate-order-count?date=2026-01-15

# Tính toán lại tất cả records
GET /api/calculate-order-count?recalculateAll=true

# Tính toán cho các records chưa có order_count
GET /api/calculate-order-count
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully calculated order_count for 10 records",
  "updated": 10,
  "errors": 0,
  "total": 10,
  "data": [
    {
      "id": "123",
      "name": "Nguyễn Văn A",
      "date": "2026-01-15",
      "order_count": 5
    }
  ]
}
```

### 2. `/api/webhook-sales-reports`

**Mục đích:** Webhook handler để tự động tính `order_count` khi có record mới trong `sales_reports`

**Methods:** `POST`

**Payload:** Supabase webhook payload
```json
{
  "type": "INSERT",
  "record": {
    "id": "123",
    "name": "Nguyễn Văn A",
    "date": "2026-01-15",
    "shift": "Hết ca",
    "product": "SP1",
    "market": "VN"
  }
}
```

## Logic Tính Toán

### Điều kiện Matching

Một order được đếm vào `order_count` nếu **TẤT CẢ** các điều kiện sau đều khớp:

1. **Name Matching:**
   - `name` (sales_reports) = `sale_staff` (orders)
   - So sánh sau khi normalize (trim, lowercase)

2. **Date Matching:**
   - `date` (sales_reports) = `order_date` (orders)
   - Format: YYYY-MM-DD

3. **Shift Matching (Logic đặc biệt):**
   - Nếu `shift` (sales_reports) = **"Hết ca"**:
     - Match với `shift` (orders) = **"Hết ca"** hoặc **"Giữa ca,Hết ca"** hoặc **"Hết ca,Giữa ca"**
     - Tức là match nếu order shift **chứa** "Hết ca"
   
   - Nếu `shift` (sales_reports) = **"Giữa ca"**:
     - Match với `shift` (orders) = **"Giữa ca"** hoặc **"Giữa ca,Hết ca"** hoặc **"Hết ca,Giữa ca"**
     - Tức là match nếu order shift **chứa** "Giữa ca"
   
   - Các trường hợp khác: exact match hoặc contains

4. **Product Matching:**
   - `product` (sales_reports) = `product` (orders)
   - So sánh sau khi normalize (trim, lowercase)
   - Nếu `product` (sales_reports) = empty/null → bỏ qua điều kiện này

5. **Market Matching:**
   - `market` (sales_reports) = `country` (orders)
   - So sánh sau khi normalize (trim, lowercase)
   - Nếu `market` (sales_reports) = empty/null → bỏ qua điều kiện này

### Ví dụ Matching

**Sales Report:**
```javascript
{
  name: "Nguyễn Văn A",
  date: "2026-01-15",
  shift: "Hết ca",
  product: "SP1",
  market: "VN"
}
```

**Orders được đếm:**
- ✅ Order 1: `sale_staff="Nguyễn Văn A"`, `order_date="2026-01-15"`, `shift="Hết ca"`, `product="SP1"`, `country="VN"`
- ✅ Order 2: `sale_staff="Nguyễn Văn A"`, `order_date="2026-01-15"`, `shift="Giữa ca,Hết ca"`, `product="SP1"`, `country="VN"`
- ❌ Order 3: `sale_staff="Nguyễn Văn A"`, `order_date="2026-01-15"`, `shift="Giữa ca"`, `product="SP1"`, `country="VN"` (không match vì shift chỉ có "Giữa ca", không có "Hết ca")
- ❌ Order 4: `sale_staff="Nguyễn Văn B"`, `order_date="2026-01-15"`, `shift="Hết ca"`, `product="SP1"`, `country="VN"` (không match vì name khác)

## Cài đặt và Deploy

### 1. Environment Variables

Thêm các biến môi trường sau vào Vercel:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Lưu ý:** Cần dùng `SUPABASE_SERVICE_ROLE_KEY` (service role key) để bypass RLS, không dùng anon key.

### 2. Deploy lên Vercel

```bash
# Install Vercel CLI (nếu chưa có)
npm i -g vercel

# Deploy
vercel

# Hoặc deploy production
vercel --prod
```

### 3. Cấu hình Supabase Webhook (Tùy chọn)

Để tự động tính toán khi có record mới, cấu hình Database Webhook trong Supabase:

1. Vào Supabase Dashboard → Database → Webhooks
2. Tạo webhook mới:
   - **Table:** `sales_reports`
   - **Events:** `INSERT`, `UPDATE`
   - **HTTP Request:**
     - **URL:** `https://your-domain.vercel.app/api/webhook-sales-reports`
     - **Method:** `POST`
     - **HTTP Headers:** (có thể thêm authentication nếu cần)

## Sử dụng

### Tính toán thủ công

```bash
# Tính toán cho một record cụ thể
curl "https://your-domain.vercel.app/api/calculate-order-count?recordId=123"

# Tính toán cho một ngày
curl "https://your-domain.vercel.app/api/calculate-order-count?date=2026-01-15"

# Tính toán lại tất cả
curl "https://your-domain.vercel.app/api/calculate-order-count?recalculateAll=true"
```

### Tự động qua Webhook

Khi cấu hình webhook, mỗi khi có record mới hoặc cập nhật trong `sales_reports`, webhook sẽ tự động gọi API để tính `order_count`.

## Performance

- **Pagination:** API fetch orders với pagination (10,000 records/page) để tránh timeout
- **Batch Processing:** Có thể xử lý nhiều records cùng lúc
- **Limit:** Mặc định limit 1000 records (có thể tăng lên 10000 nếu `recalculateAll=true`)

## Lưu ý

1. **Service Role Key:** Phải dùng service role key để bypass RLS
2. **Timeout:** Vercel serverless functions có timeout 10s (Hobby) hoặc 60s (Pro). Nếu có quá nhiều records, nên chia nhỏ hoặc dùng cron job
3. **Normalization:** Tất cả string comparisons đều được normalize (trim, lowercase) để tránh lỗi do format khác nhau
4. **Shift Logic:** Logic matching shift đặc biệt - "Hết ca" match với cả "Giữa ca,Hết ca"

## Troubleshooting

### Lỗi: Missing Supabase configuration
→ Kiểm tra environment variables trong Vercel

### Lỗi: RLS Policy Error
→ Đảm bảo đang dùng `SUPABASE_SERVICE_ROLE_KEY` (service role key), không phải anon key

### Timeout
→ Giảm số lượng records xử lý mỗi lần, hoặc chia nhỏ theo ngày

### Không match được orders
→ Kiểm tra:
- Name có khớp không (sau khi normalize)
- Date format có đúng không
- Shift logic có đúng không
- Product và Market có khớp không
