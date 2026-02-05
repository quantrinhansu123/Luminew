# Hướng Dẫn: Đảm Bảo Admin Thấy Hết Tất Cả Dữ Liệu

## Mục Đích
Script `ensure_admin_full_access.sql` đảm bảo rằng user có role = `'admin'` có thể xem và thao tác **TẤT CẢ** dữ liệu trong hệ thống, bất kể các RLS policies khác.

## Cách Sử Dụng

### Bước 1: Chạy Script trong Supabase Dashboard

1. Mở **Supabase Dashboard** > **SQL Editor**
2. Copy toàn bộ nội dung file `ensure_admin_full_access.sql`
3. Paste vào SQL Editor và chạy

### Bước 2: Kiểm Tra User Có Role Admin

Đảm bảo user của bạn có role = `'admin'` trong bảng `users`:

```sql
-- Kiểm tra role hiện tại
SELECT id, email, role, name 
FROM public.users 
WHERE email = 'your-email@example.com';

-- Nếu chưa phải admin, cập nhật:
UPDATE public.users 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

### Bước 3: Verify Policies

Sau khi chạy script, kiểm tra các policies đã được tạo:

```sql
SELECT 
    tablename,
    policyname,
    cmd
FROM pg_policies 
WHERE schemaname = 'public' 
  AND policyname LIKE '%Admin%'
ORDER BY tablename;
```

## Các Tính Năng

### 1. Helper Functions

- `is_admin()`: Kiểm tra nếu user hiện tại là admin
- `is_admin_or_leader()`: Kiểm tra nếu user là admin hoặc leader

### 2. RLS Policies Cho Tất Cả Bảng

Script tạo policies cho các bảng sau:
- ✅ `users` - Danh sách người dùng
- ✅ `human_resources` - Dữ liệu nhân sự
- ✅ `detail_reports` - Báo cáo chi tiết
- ✅ `reports` - Báo cáo tổng hợp
- ✅ `orders` - Đơn hàng
- ✅ `system_settings` - Cấu hình hệ thống
- ✅ `marketing_pages` - Trang marketing
- ✅ `bill_of_lading_history` - Lịch sử vận đơn
- ✅ `sales_order_logs` - Log đơn hàng
- ✅ `cskh_crm_logs` - Log CSKH & CRM
- ✅ `app_page_permissions` - Quyền truy cập các trang/module
- ✅ `app_roles` - Danh sách roles

### 3. Tự Động Grant Quyền Xem Tất Cả Pages/Views

Script tự động tạo permissions cho admin để xem **TẤT CẢ** các trang/module trong hệ thống:

**Các Module & Pages được grant:**
- **MODULE_MKT**: MKT_INPUT, MKT_VIEW, MKT_ORDERS, MKT_PAGES, MKT_MANUAL
- **MODULE_RND**: RND_INPUT, RND_VIEW, RND_ORDERS, RND_PAGES, RND_MANUAL, RND_NEW_ORDER, RND_HISTORY
- **MODULE_SALE**: SALE_ORDERS, SALE_NEW_ORDER, SALE_INPUT, SALE_VIEW, SALE_MANUAL, SALE_HISTORY
- **MODULE_ORDERS**: ORDERS_LIST, ORDERS_NEW, ORDERS_UPDATE, ORDERS_REPORT, ORDERS_FFM, ORDERS_HISTORY
- **MODULE_CSKH**: CSKH_LIST, CSKH_PAID, CSKH_NEW_ORDER, CSKH_INPUT, CSKH_VIEW, CSKH_HISTORY
- **MODULE_HR**: HR_LIST, HR_DASHBOARD, HR_KPI, HR_PROFILE
- **MODULE_FINANCE**: FINANCE_DASHBOARD, FINANCE_KPI
- **MODULE_ADMIN**: ADMIN_TOOLS

**Kết quả:** Admin có `can_view = true`, `can_edit = true`, `can_delete = true` và `allowed_columns = ['*']` cho tất cả các pages trên.

### 4. Cập Nhật Helper Functions

Script cũng cập nhật các functions:
- `has_permission()`: Admin luôn return `true` cho mọi page code
- `check_hierarchical_access()`: Admin luôn thấy tất cả dữ liệu

## Lưu Ý Quan Trọng

### Service Role Key
Nếu bạn đang dùng **Service Role Key** (thường dùng trong backend), các policies sẽ tự động bypass vì `auth.uid()` sẽ là `NULL`. Điều này có nghĩa là:
- ✅ Service Role Key có thể truy cập tất cả dữ liệu
- ✅ Không cần check role khi dùng Service Role Key

### Anon Key
Nếu dùng **Anon Key** (thường dùng trong frontend), cần:
- ✅ User phải đăng nhập (có `auth.uid()`)
- ✅ User phải có role = `'admin'` trong bảng `users`

## Troubleshooting

### Admin vẫn không thấy dữ liệu?

1. **Kiểm tra role trong database:**
```sql
SELECT id, email, role FROM public.users WHERE id = auth.uid()::text;
```

2. **Kiểm tra policies đã được tạo:**
```sql
SELECT * FROM pg_policies WHERE tablename = 'detail_reports';
```

3. **Test function is_admin():**
```sql
SELECT is_admin();
```

4. **Kiểm tra auth context:**
```sql
SELECT auth.uid(), auth.role();
```

### Lỗi "permission denied"

- Đảm bảo đã chạy script `ensure_admin_full_access.sql`
- Kiểm tra RLS đã được enable trên bảng
- Kiểm tra user có role = 'admin'

### Admin vẫn không thấy một số trang/module?

1. **Kiểm tra permissions trong database:**
```sql
-- Xem tất cả permissions của admin
SELECT role_code, page_code, can_view, can_edit, can_delete
FROM app_page_permissions
WHERE LOWER(role_code) IN ('admin', 'administrator', 'super_admin', 'director', 'manager')
ORDER BY page_code;
```

2. **Kiểm tra role của user:**
```sql
SELECT id, email, role FROM public.users WHERE email = 'your-email@example.com';
```

3. **Kiểm tra xem page code có tồn tại không:**
```sql
SELECT DISTINCT page_code FROM app_page_permissions ORDER BY page_code;
```

4. **Nếu thiếu permissions, chạy lại phần grant permissions trong script:**
```sql
-- Xem phần 4 trong ensure_admin_full_access.sql
```

## Các Role Được Hỗ Trợ

Script hỗ trợ các role sau được coi là admin:
- `admin`
- `administrator`
- `super_admin`
- `director`
- `manager`

## Xóa Policies (Nếu Cần)

Nếu muốn xóa các policies đã tạo:

```sql
-- Xóa tất cả Admin policies
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND policyname LIKE '%Admin%'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;
```
