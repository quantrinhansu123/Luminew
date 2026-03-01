# Orders API

FastAPI endpoint để query dữ liệu từ bảng `orders` trong Supabase PostgreSQL với tối ưu hiệu năng cao.

## Cài đặt

### 1. Cài đặt dependencies

```bash
pip install -r requirements.txt
```

### 2. Cấu hình biến môi trường

Tạo file `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Chạy API

```bash
# Development
uvicorn orders_api:app --reload --port 8000

# Production
uvicorn orders_api:app --host 0.0.0.0 --port 8000 --workers 4
```

## API Endpoints

### GET `/` - Lấy danh sách orders

**Query Parameters:**

- **Filters:**
  - `order_date_from` (date): Lọc từ ngày
  - `order_date_to` (date): Lọc đến ngày
  - `total_amount_vnd_min` (float): Số tiền tối thiểu
  - `total_amount_vnd_max` (float): Số tiền tối đa
  - `country` (string): Lọc theo country
  - `product` (string): Lọc theo product
  - `tracking_code` (string): Lọc theo tracking code
  - `marketing_staff` (string): Lọc theo marketing staff
  - `sale_staff` (string): Lọc theo sale staff
  - `team` (string): Lọc theo team

- **Pagination:**
  - `page` (int, default=1): Số trang (bắt đầu từ 1)
  - `page_size` (int, default=10): Số bản ghi mỗi trang (10 hoặc 100)

- **Sorting:**
  - `sort_by` (string, default="order_date"): Trường để sort
  - `sort_order` (string, default="desc"): "asc" hoặc "desc"

**Response:**

```json
{
  "data": [
    {
      "order_date": "2024-01-15",
      "total_amount_vnd": 1500000.00,
      "country": "Vietnam",
      "product": "Product A",
      "tracking_code": "TRACK123",
      "marketing_staff": "John Doe",
      "sale_staff": "Jane Smith",
      "team": "Team A"
    }
  ],
  "total": 1000,
  "page": 1,
  "page_size": 10,
  "total_pages": 100
}
```

**Ví dụ requests:**

```bash
# Lấy 10 orders đầu tiên
curl "http://localhost:8000/?page=1&page_size=10"

# Lọc theo date range và team
curl "http://localhost:8000/?order_date_from=2024-01-01&order_date_to=2024-01-31&team=Team%20A&page=1&page_size=100"

# Lọc theo amount range
curl "http://localhost:8000/?total_amount_vnd_min=1000000&total_amount_vnd_max=5000000&page=1&page_size=10"

# Lọc theo multiple criteria
curl "http://localhost:8000/?country=Vietnam&product=Product%20A&marketing_staff=John%20Doe&page=1&page_size=100"
```

### GET `/health` - Health check

```bash
curl "http://localhost:8000/health"
```

## Tối ưu hiệu năng

### 1. Indexes

Chạy SQL script `supabase_scripts/optimize_orders_table.sql` để tạo indexes:

```bash
# Trong Supabase SQL Editor hoặc psql
psql -h your-db-host -U postgres -d postgres -f supabase_scripts/optimize_orders_table.sql
```

### 2. Query Optimization Tips

- **Date range queries**: Sử dụng `order_date_from` và `order_date_to` cùng lúc để tận dụng index
- **Combined filters**: Kết hợp `team` + `order_date` sẽ sử dụng composite index
- **Pagination**: Luôn sử dụng `page_size=100` cho queries lớn để giảm số lần round-trip
- **Sorting**: Mặc định sort theo `order_date DESC` để tận dụng index

### 3. Monitoring

Kiểm tra query performance:

```sql
-- Xem index usage
SELECT * FROM pg_stat_user_indexes WHERE tablename = 'orders';

-- Analyze query plan
EXPLAIN ANALYZE SELECT * FROM orders WHERE order_date >= '2024-01-01' AND order_date <= '2024-01-31';
```

## Deployment

### Vercel

1. Tạo `vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/orders/orders_api.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/api/orders/(.*)",
      "dest": "api/orders/orders_api.py"
    }
  ]
}
```

2. Set environment variables trong Vercel dashboard

### Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "api.orders.orders_api:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Performance Benchmarks

Với indexes đã tối ưu:
- **Simple query** (date range): < 50ms
- **Complex query** (multiple filters): < 200ms
- **Pagination**: < 100ms per page

## Troubleshooting

### Slow queries

1. Kiểm tra indexes đã được tạo chưa
2. Chạy `ANALYZE orders;` để update statistics
3. Kiểm tra query plan với `EXPLAIN ANALYZE`

### Connection errors

1. Kiểm tra `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`
2. Đảm bảo Supabase project đang hoạt động
3. Kiểm tra network connectivity
