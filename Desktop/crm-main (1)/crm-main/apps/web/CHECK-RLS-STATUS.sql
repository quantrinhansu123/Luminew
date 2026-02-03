-- ============================================
-- KIỂM TRA TRẠNG THÁI RLS CỦA CÁC BẢNG
-- ============================================
-- Chạy query này để xem RLS đã tắt chưa
-- ============================================

SELECT 
  schemaname, 
  tablename, 
  rowsecurity as "RLS Enabled",
  CASE 
    WHEN rowsecurity = true THEN '❌ RLS ĐANG BẬT - Cần tắt!'
    WHEN rowsecurity = false THEN '✅ RLS ĐÃ TẮT'
  END as "Status"
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
    'lead_sources', 
    'campaigns', 
    'leads', 
    'customers', 
    'product_groups', 
    'sales_employees', 
    'sales_allocation_rules',
    'interaction_logs', 
    'orders', 
    'payments', 
    'quotations',
    'profiles',
    'design_orders', 
    'design_templates', 
    'design_files',
    'assignment_config', 
    'assignment_logs', 
    'sales_product_specializations'
  )
ORDER BY tablename;

-- Nếu tất cả đều là "RLS ĐÃ TẮT" (rowsecurity = false) thì đã OK!
-- Nếu có bảng nào còn "RLS ĐANG BẬT" thì cần chạy TURN-OFF-RLS-NOW.sql
