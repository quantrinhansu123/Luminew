# Quick Start - Orders API

## Bước 1: Chạy SQL Script trong Supabase

1. Mở Supabase Dashboard: https://app.supabase.com
2. Chọn project của bạn
3. Vào **SQL Editor**
4. Mở file `supabase_scripts/optimize_orders_table.sql`
5. Copy toàn bộ nội dung và paste vào SQL Editor
6. Click **Run** để tạo indexes

⏱️ Thời gian chạy: ~2-5 phút tùy vào số lượng dữ liệu

## Bước 2: Setup và Chạy API

### Option A: Dùng script tự động

```bash
./setup_orders_api.sh
```

### Option B: Chạy thủ công

```bash
# 1. Cài đặt dependencies
cd api/orders
pip install -r requirements.txt

# 2. Tạo file .env
cat > .env << EOF
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
EOF

# 3. Sửa .env với thông tin Supabase của bạn

# 4. Chạy API
uvicorn orders_api:app --reload --port 8000
```

## Bước 3: Test API

### Mở browser:
- API Docs: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

### Test với curl:

```bash
# Lấy 10 orders đầu tiên
curl "http://localhost:8000/?page=1&page_size=10"

# Filter theo date range
curl "http://localhost:8000/?order_date_from=2024-01-01&order_date_to=2024-01-31&page_size=100"

# Filter theo team và date
curl "http://localhost:8000/?team=Team%20A&order_date_from=2024-01-01&page=1&page_size=100"

# Filter theo amount range
curl "http://localhost:8000/?total_amount_vnd_min=1000000&total_amount_vnd_max=5000000&page_size=10"
```

## Kiểm tra Performance

Sau khi chạy SQL script, kiểm tra indexes:

```sql
-- Xem tất cả indexes đã tạo
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'orders';

-- Kiểm tra index usage
SELECT * FROM pg_stat_user_indexes 
WHERE tablename = 'orders' 
ORDER BY idx_scan DESC;
```

## Troubleshooting

### Lỗi connection
- Kiểm tra `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` trong `.env`
- Đảm bảo dùng **Service Role Key** (không phải anon key)

### Query chậm
- Đảm bảo đã chạy SQL script để tạo indexes
- Chạy `ANALYZE orders;` trong Supabase SQL Editor
- Kiểm tra query plan: `EXPLAIN ANALYZE SELECT ...`

### API không start
- Kiểm tra Python version: `python --version` (cần >= 3.8)
- Cài lại dependencies: `pip install -r requirements.txt --force-reinstall`
