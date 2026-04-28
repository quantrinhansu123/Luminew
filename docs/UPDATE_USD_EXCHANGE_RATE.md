# Hướng Dẫn Cập Nhật Tỷ Giá USD

## Tổng Quan

Tài liệu này hướng dẫn cách cập nhật tỷ giá USD từ **25,000 VNĐ** → **24,000 VNĐ** và tính lại các đơn hàng đã có.

## Vấn Đề

- Tỷ giá USD cũ: **25,000 VNĐ**
- Tỷ giá USD mới: **24,000 VNĐ**
- Các đơn hàng đã có được tính với tỷ giá cũ cần được tính lại

## Giải Pháp

Có 3 cách để cập nhật tỷ giá và tính lại đơn hàng:

| Cách | Cập nhật đơn có tổng ≠ 0 | Tốc độ | Yêu cầu quyền | Khuyến nghị |
|------|--------------------------|--------|---------------|-------------|
| Script Node.js | ✅ Có | Trung bình | Anon key | ⭐⭐⭐ Tốt nhất |
| Migration SQL | ✅ Có | Rất nhanh | Service role | ⭐⭐ Nhanh nhất |
| Nút trong App | ❌ Không | Chậm | Không cần | ⭐ Dễ nhất |

### Khi nào dùng cách nào?

- **Script Node.js**: Dùng khi cần cập nhật TẤT CẢ đơn USD (kể cả đơn đã có tổng tiền)
- **Migration SQL**: Dùng khi có nhiều đơn và cần xử lý nhanh
- **Nút trong App**: Dùng khi chỉ cần cập nhật vài đơn có tổng tiền = 0

### Cách 1: Sử dụng Script Node.js (Khuyến nghị)

Script này sẽ:
1. Cập nhật tỷ giá USD trong bảng `exchange_rates`
2. Tính lại tất cả đơn hàng USD có `exchange_rate = 25000`
3. Cập nhật các cột: `exchange_rate`, `total_vnd`, `total_amount_vnd`, `tong_tien_vnd`

```bash
# Chạy script
node scripts/recalculate_usd_orders_simple.js
```

**Ưu điểm:**
- Dễ chạy, không cần quyền admin
- Hiển thị tiến trình chi tiết
- Xử lý từng đơn một, an toàn hơn

**Nhược điểm:**
- Chậm hơn nếu có nhiều đơn (xử lý từng đơn)

### Cách 2: Sử dụng Migration SQL (Nhanh hơn)

Migration này sẽ cập nhật hàng loạt trong database.

#### Bước 1: Chạy qua Supabase SQL Editor

1. Mở **Supabase Dashboard** → **SQL Editor**
2. Copy toàn bộ nội dung file: `supabase/migrations/20260420000000_update_usd_rate_and_recalculate.sql`
3. Paste vào SQL Editor và click **Run**

#### Bước 2: Hoặc chạy qua Supabase CLI

```bash
npx supabase db push
```

**Ưu điểm:**
- Rất nhanh (bulk update)
- Xử lý tất cả bảng cùng lúc

**Nhược điểm:**
- Cần quyền admin hoặc service role key
- Khó debug nếu có lỗi

### Cách 3: Sử dụng Tính Năng Có Sẵn Trong App (Đã cập nhật)

Nếu chỉ có vài đơn cần cập nhật hoặc muốn cập nhật theo bộ lọc:

1. Vào trang **Danh Sách Đơn**
2. Lọc các đơn cần cập nhật (ví dụ: lọc theo ngày, loại tiền tệ, v.v.)
3. Sử dụng nút **"Tính lại Tổng tiền VNĐ"**

**Chức năng mới của nút này:**
- Tự động lấy tỷ giá MỚI NHẤT từ bảng `exchange_rates`
- Cập nhật CẢ `exchange_rate` VÀ `total_amount_vnd`
- Hiển thị tỷ giá sẽ áp dụng cho từng loại tiền tệ
- Chỉ cập nhật các đơn có "Tổng tiền VNĐ" = 0 hoặc trống

**Ưu điểm:**
- Dễ sử dụng, có giao diện
- Có thể lọc và cập nhật theo nhóm đơn cụ thể
- Hiển thị xác nhận trước khi cập nhật
- Tự động dùng tỷ giá mới nhất

**Nhược điểm:**
- Chỉ cập nhật các đơn có "Tổng tiền VNĐ" = 0 hoặc trống
- Không cập nhật các đơn đã có tổng tiền khác 0

## Chi Tiết Cập Nhật

### Các Bảng Được Cập Nhật

1. **exchange_rates**
   - `ti_gia = 'USD'` → `gia_tri = 24000`

2. **orders**
   - Điều kiện: `payment_type = 'USD'` hoặc `payment_currency = 'USD'`
   - Điều kiện: `exchange_rate = 25000`
   - Điều kiện: `sale_price > 0`
   - Cập nhật:
     - `exchange_rate = 24000`
     - `total_vnd = sale_price × 24000`
     - `total_amount_vnd = sale_price × 24000` (nếu bằng `sale_price × 25000`)
     - `tong_tien_vnd = sale_price × 24000` (nếu bằng `sale_price × 25000`)

3. **order_code_hcm** (nếu có)
   - Tương tự như bảng `orders`

4. **chi_tiet_bill_tien** (nếu có)
   - Điều kiện: `don_vi_tien = 'USD'`
   - Điều kiện: `ty_gia = 25000`
   - Cập nhật:
     - `ty_gia = 24000`
     - `tien_viet = so_tien_doi_soat × 24000`

### Cột Generated Tự Động Cập Nhật

Cột `van_don_line_total_vnd` là **generated column**, sẽ tự động cập nhật khi các cột nguồn thay đổi:

```sql
van_don_line_total_vnd = coalesce(
  nullif(tong_tien_vnd, 0),
  total_amount_vnd,
  sale_price,
  goods_amount,
  0
)
```

## Kiểm Tra Kết Quả

### 1. Kiểm tra tỷ giá mới

```sql
SELECT ti_gia, gia_tri 
FROM exchange_rates 
WHERE ti_gia = 'USD';
```

Kết quả mong đợi: `gia_tri = 24000`

### 2. Kiểm tra đơn hàng đã cập nhật

```sql
SELECT 
  order_code,
  sale_price,
  exchange_rate,
  total_vnd,
  total_amount_vnd,
  payment_type
FROM orders
WHERE (payment_type ILIKE 'USD' OR payment_currency ILIKE 'USD')
  AND sale_price > 0
ORDER BY id DESC
LIMIT 10;
```

Kiểm tra:
- `exchange_rate` phải = **24000**
- `total_vnd` phải = `sale_price × 24000`

### 3. Kiểm tra trên UI

1. Vào trang **Vận Đơn**
2. Lọc các đơn USD
3. Kiểm tra cột **"Tổng tiền VĐN"**
4. Công thức: `Tổng tiền VĐN = Giá bán (USD) × 24,000`

## Ví Dụ

### Trước khi cập nhật:
- `sale_price = 100 USD`
- `exchange_rate = 25000`
- `total_vnd = 2,500,000 VNĐ`

### Sau khi cập nhật:
- `sale_price = 100 USD` (không đổi)
- `exchange_rate = 24000` ✅
- `total_vnd = 2,400,000 VNĐ` ✅

## Rollback (Nếu Cần)

Nếu cần quay lại tỷ giá cũ:

```sql
-- Cập nhật tỷ giá về 25000
UPDATE exchange_rates
SET gia_tri = 25000
WHERE ti_gia = 'USD';

-- Tính lại đơn hàng (thay 24000 → 25000 trong migration)
```

## Lưu Ý Quan Trọng

1. **Backup trước khi chạy**: Nên backup database trước khi chạy migration
2. **Chạy ngoài giờ cao điểm**: Nếu có nhiều đơn, nên chạy khi ít người dùng
3. **Kiểm tra kỹ**: Sau khi chạy, kiểm tra một vài đơn mẫu để đảm bảo đúng
4. **Đơn mới**: Các đơn hàng mới sẽ tự động dùng tỷ giá 24,000 VNĐ
5. **Generated column**: Cột `van_don_line_total_vnd` tự động cập nhật, không cần xử lý thủ công

## Hỗ Trợ

Nếu gặp vấn đề:
1. Kiểm tra log của script
2. Kiểm tra quyền truy cập database
3. Kiểm tra file `.env` có đầy đủ thông tin Supabase
4. Liên hệ team dev để được hỗ trợ
