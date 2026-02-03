-- ============================================
-- TẮT RLS (ROW LEVEL SECURITY) CHO SUPABASE
-- ============================================
-- Copy toàn bộ file này và chạy trong Supabase SQL Editor
-- Link: https://qeiuslbmjcrbzqcuwcst.supabase.co/project/qeiuslbmjcrbzqcuwcst/sql/new
-- ============================================

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

-- Kiểm tra kết quả (sau khi chạy, chạy query này để xác nhận)
-- SELECT schemaname, tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' 
--   AND tablename IN ('lead_sources', 'campaigns', 'leads', 'customers', 'product_groups')
-- ORDER BY tablename;
-- Nếu rowsecurity = false thì đã thành công!
