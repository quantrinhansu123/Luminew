-- Disable RLS (Row Level Security) for public tables to allow direct frontend access
-- Run this in Supabase SQL Editor (Project > SQL Editor)

-- Disable RLS on all public tables
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
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- If you prefer to keep RLS enabled but allow anonymous access, use these policies instead:
-- (Comment out the ALTER TABLE commands above and uncomment these)

/*
-- Allow anonymous SELECT, INSERT, UPDATE, DELETE on all tables
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
*/
