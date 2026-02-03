# Hướng dẫn tắt RLS (Row Level Security) trong Supabase

## ⚠️ QUAN TRỌNG: Phải làm bước này để frontend có thể kết nối database!

### Bước 1: Mở Supabase SQL Editor

1. Truy cập: https://qeiuslbmjcrbzqcuwcst.supabase.co/project/qeiuslbmjcrbzqcuwcst/sql/new
2. Hoặc vào Dashboard → SQL Editor → New Query

### Bước 2: Copy và chạy SQL sau

```sql
-- Tắt RLS cho tất cả các bảng public
ALTER TABLE public.lead_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_allocation_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaction_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_product_specializations DISABLE ROW LEVEL SECURITY;
```

### Bước 3: Click "Run" hoặc nhấn Ctrl+Enter

### Bước 4: Refresh trình duyệt (Ctrl+F5)

---

## Kiểm tra RLS đã tắt chưa

Chạy SQL sau để kiểm tra:

```sql
SELECT 
  schemaname, 
  tablename, 
  rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
    'lead_sources', 'campaigns', 'leads', 'customers', 
    'product_groups', 'sales_employees', 'sales_allocation_rules',
    'interaction_logs', 'orders', 'payments', 'quotations',
    'design_orders', 'design_templates', 'design_files',
    'assignment_config', 'assignment_logs', 'sales_product_specializations'
  )
ORDER BY tablename;
```

Nếu `rowsecurity = false` thì đã tắt thành công!

---

## Lưu ý bảo mật

⚠️ **Tắt RLS chỉ nên dùng cho development!**

Trong production, nên:
1. Bật lại RLS
2. Tạo policies phù hợp cho từng bảng
3. Sử dụng authentication và authorization đúng cách

---

## Nếu vẫn lỗi 401 sau khi tắt RLS

1. Kiểm tra anon key trong `.env.local` có đúng không
2. Restart Next.js dev server
3. Clear browser cache (Ctrl+Shift+Delete)
4. Kiểm tra Network tab xem request có header `apikey` không
