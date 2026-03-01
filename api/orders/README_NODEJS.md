# Orders API - Node.js Version

API Node.js/Express để query dữ liệu từ bảng `orders` trong Supabase PostgreSQL.

## Cài đặt

1. **Cài đặt dependencies:**
   ```bash
   cd api/orders
   npm install
   ```

2. **Tạo file `.env`:**
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   PORT=8000
   ```

3. **Chạy API:**
   ```bash
   # Cách 1: Dùng npm
   npm start

   # Cách 2: Dùng file .bat (Windows)
   START_API_NODEJS.bat

   # Cách 3: Development mode với auto-reload
   npm run dev
   ```

## API Endpoints

### GET `/`
Lấy danh sách orders với filtering và sorting.

**Query Parameters:**
- `order_date_from` (optional): Ngày bắt đầu (YYYY-MM-DD)
- `order_date_to` (optional): Ngày kết thúc (YYYY-MM-DD)
- `total_amount_vnd_min` (optional): Số tiền tối thiểu
- `total_amount_vnd_max` (optional): Số tiền tối đa
- `country` (optional): Lọc theo country
- `product` (optional): Lọc theo product
- `tracking_code` (optional): Lọc theo tracking code
- `marketing_staff` (optional): Lọc theo marketing staff
- `sale_staff` (optional): Lọc theo sale staff
- `team` (optional): Lọc theo team
- `sort_by` (optional): Trường để sort (default: "order_date")
- `sort_order` (optional): Thứ tự sort "asc" hoặc "desc" (default: "desc")

**Response:**
```json
{
  "data": [...],
  "total": 12345
}
```

**Ví dụ:**
```
GET http://localhost:8000/?order_date_from=2026-02-03&order_date_to=2026-02-03
GET http://localhost:8000/?country=US&sort_by=order_date&sort_order=desc
```

### GET `/health`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-03T10:00:00.000Z"
}
```

## Tính năng

- ✅ Tự động fetch tất cả records (loop qua pages)
- ✅ Filter theo nhiều tiêu chí
- ✅ Sorting
- ✅ Normalize keys về lowercase
- ✅ Logging chi tiết
- ✅ Error handling

## So sánh với Python API

| Tính năng | Node.js | Python |
|-----------|---------|--------|
| Performance | ⚡ Nhanh | ⚡ Nhanh |
| Dependencies | Nhẹ (Express, Supabase) | Nhẹ (FastAPI, Supabase) |
| Setup | `npm install` | `pip install` |
| Auto-reload | Có (nodemon) | Có (uvicorn --reload) |

## Troubleshooting

1. **Lỗi "Cannot find module":**
   ```bash
   npm install
   ```

2. **Lỗi "SUPABASE_URL not set":**
   - Kiểm tra file `.env` có tồn tại không
   - Kiểm tra các biến môi trường có đúng không

3. **Port đã được sử dụng:**
   - Thay đổi `PORT` trong `.env` hoặc
   - Dừng process đang dùng port 8000
