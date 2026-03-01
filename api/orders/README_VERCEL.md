# Orders API - Vercel Serverless Function

API endpoint để lấy tất cả các cột trong bảng `orders` từ Supabase với API key authentication.

## Endpoint

```
GET /api/orders
```

## Authentication

API yêu cầu API key để truy cập. Có thể cung cấp API key theo các cách sau:

### Cách 1: Header (Khuyến nghị)
```bash
curl -H "X-API-Key: your-api-key-here" \
  https://your-domain.vercel.app/api/orders
```

### Cách 2: Authorization Header
```bash
curl -H "Authorization: Bearer your-api-key-here" \
  https://your-domain.vercel.app/api/orders
```

### Cách 3: Query Parameter
```bash
curl "https://your-domain.vercel.app/api/orders?api_key=your-api-key-here"
```

## Query Parameters

### Filters

- `order_date_from` (string): Ngày bắt đầu (YYYY-MM-DD)
- `order_date_to` (string): Ngày kết thúc (YYYY-MM-DD)
- `total_amount_vnd_min` (number): Số tiền tối thiểu
- `total_amount_vnd_max` (number): Số tiền tối đa
- `country` (string): Lọc theo quốc gia
- `product` (string): Lọc theo sản phẩm
- `tracking_code` (string): Lọc theo mã tracking
- `marketing_staff` (string): Lọc theo nhân viên marketing
- `sale_staff` (string): Lọc theo nhân viên sale
- `team` (string): Lọc theo team

### Sorting

- `sort_by` (string): Cột để sort (mặc định: `order_date`)
- `sort_order` (string): Thứ tự sort - `asc` hoặc `desc` (mặc định: `desc`)

## Response Format

```json
{
  "success": true,
  "data": [
    {
      "order_date": "2024-01-15",
      "total_amount_vnd": "1000000",
      "country": "US",
      "product": "Product A",
      "tracking_code": "VN123456",
      "marketing_staff": "John Doe",
      "sale_staff": "Jane Smith",
      "team": "HCM",
      // ... tất cả các cột khác
    }
  ],
  "total": 1000,
  "fetched_at": "2024-01-15T10:30:00.000Z"
}
```

## Ví dụ sử dụng

### 1. Lấy tất cả orders
```bash
curl -H "X-API-Key: your-api-key" \
  https://your-domain.vercel.app/api/orders
```

### 2. Lọc theo date range
```bash
curl -H "X-API-Key: your-api-key" \
  "https://your-domain.vercel.app/api/orders?order_date_from=2024-01-01&order_date_to=2024-01-31"
```

### 3. Lọc theo team và country
```bash
curl -H "X-API-Key: your-api-key" \
  "https://your-domain.vercel.app/api/orders?team=HCM&country=US"
```

### 4. Sort theo total_amount_vnd
```bash
curl -H "X-API-Key: your-api-key" \
  "https://your-domain.vercel.app/api/orders?sort_by=total_amount_vnd&sort_order=desc"
```

### 5. Kết hợp nhiều filters
```bash
curl -H "X-API-Key: your-api-key" \
  "https://your-domain.vercel.app/api/orders?order_date_from=2024-01-01&order_date_to=2024-01-31&team=HCM&country=US&sort_by=order_date&sort_order=desc"
```

## Cấu hình Environment Variables

Trong Vercel Dashboard, thêm các biến môi trường sau:

### Bắt buộc:
- `SUPABASE_URL`: URL của Supabase project
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key của Supabase
- `ORDERS_API_KEY`: API key để bảo vệ endpoint (tạo một key ngẫu nhiên mạnh)

### Tùy chọn:
- `VITE_SUPABASE_URL`: Nếu muốn dùng chung với frontend
- `VITE_SUPABASE_SERVICE_ROLE_KEY`: Nếu muốn dùng chung với frontend
- `VITE_ORDERS_API_KEY`: Nếu muốn dùng chung với frontend

## Tạo API Key

Tạo một API key mạnh và ngẫu nhiên:

```bash
# Trên Linux/Mac
openssl rand -hex 32

# Hoặc dùng Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Hoặc dùng online tool: https://randomkeygen.com/
```

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key. Please provide a valid API key in X-API-Key header or api_key query parameter."
}
```

### 405 Method Not Allowed
```json
{
  "error": "Method not allowed",
  "message": "Only GET method is supported"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Error details..."
}
```

## Lưu ý

1. **API trả về TẤT CẢ dữ liệu** phù hợp với filters (không có pagination)
2. **Tự động fetch tất cả pages** (Supabase giới hạn 1000 records/page)
3. **Keys được normalize về lowercase** để đảm bảo consistency
4. **Có cache headers** để tối ưu performance
5. **API key là bắt buộc** để bảo mật endpoint

## Testing Local

Để test local với Vercel CLI:

```bash
# Cài đặt Vercel CLI
npm i -g vercel

# Chạy local
vercel dev
```

Sau đó truy cập: `http://localhost:3000/api/orders?api_key=your-api-key`

## Deployment

API sẽ tự động deploy lên Vercel khi bạn push code lên repository đã kết nối với Vercel.

Đảm bảo đã set đầy đủ environment variables trong Vercel Dashboard trước khi sử dụng.
