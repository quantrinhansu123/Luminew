-- ============================================
-- TẠO RLS POLICIES CHO PHÉP ANONYMOUS ACCESS
-- ============================================
-- Nếu tắt RLS không hoạt động, thử cách này
-- Copy toàn bộ và chạy trong Supabase SQL Editor
-- ============================================

-- Bước 1: Bật RLS (nếu chưa bật)
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_allocation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_product_specializations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Bước 2: Xóa policies cũ (nếu có)
DROP POLICY IF EXISTS "Allow anonymous access" ON public.lead_sources;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.campaigns;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.leads;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.customers;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.product_groups;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.sales_employees;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.sales_allocation_rules;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.interaction_logs;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.orders;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.payments;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.quotations;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.design_orders;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.design_templates;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.design_files;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.assignment_config;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.assignment_logs;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.sales_product_specializations;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.profiles;

-- Bước 3: Tạo policies mới cho phép anonymous access
CREATE POLICY "Allow anonymous access" ON public.lead_sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.product_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.sales_employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.sales_allocation_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.interaction_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.quotations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.design_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.design_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.design_files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.assignment_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.assignment_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.sales_product_specializations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
