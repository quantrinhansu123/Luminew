# Hướng dẫn tạo bảng Báo cáo MKT và KPIs

## File SQL Migration
File: `CREATE-MKT-AND-KPIS-TABLES.sql`

## Cách chạy migration

### Cách 1: Chạy trực tiếp trên PostgreSQL
```bash
psql -U your_username -d your_database -f CREATE-MKT-AND-KPIS-TABLES.sql
```

### Cách 2: Chạy qua Supabase SQL Editor
1. Mở Supabase Dashboard
2. Vào SQL Editor
3. Copy nội dung file `CREATE-MKT-AND-KPIS-TABLES.sql`
4. Paste và chạy

### Cách 3: Chạy qua Prisma Studio hoặc database client
Copy và paste nội dung SQL vào database client của bạn.

## Cấu trúc bảng

### 1. Bảng `bao_cao_mkt` (Báo cáo Marketing)
- `id` (SERIAL PRIMARY KEY)
- `ho_va_ten` (VARCHAR(100)) - Họ và tên
- `page` (VARCHAR(255)) - Page
- `cpqc` (DECIMAL(15,2)) - Chi phí quảng cáo
- `so_mess` (INTEGER) - Số message
- `so_don` (INTEGER) - Số đơn
- `cps` (DECIMAL(15,2)) - Chi phí sản xuất
- `ti_le_chot` (DECIMAL(5,2)) - Tỉ lệ chốt (%)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### 2. Bảng `kpis` (KPIs nhân viên)
- `id` (SERIAL PRIMARY KEY)
- `ho_ten` (VARCHAR(100)) - Họ tên
- `bo_phan` (VARCHAR(100)) - Bộ phận
- `kpi_thang` (DECIMAL(15,2)) - KPI tháng
- `kpi_tuan` (DECIMAL(15,2)) - KPI tuần
- `kpi_ngay` (DECIMAL(15,2)) - KPI ngày
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

## Sau khi chạy SQL

Sau khi chạy file SQL, cần chạy Prisma để đồng bộ schema:

```bash
cd apps/api
npx prisma generate
```

## Lưu ý

- File SQL này chỉ cần chạy 1 lần
- Các bảng đã được tạo với indexes và triggers tự động cập nhật `updated_at`
- Tất cả các trường đều có giá trị mặc định để tránh lỗi NULL
