-- Migration mirror of supabase/manual/create_orders_backup_2025.sql
CREATE TABLE IF NOT EXISTS public.orders_backup_2025 (
  LIKE public.orders INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
);

CREATE TABLE IF NOT EXISTS public.order_code_hcm_backup_2025 (
  LIKE public.order_code_hcm INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
);

COMMENT ON TABLE public.orders_backup_2025 IS
  'Backup orders từ file backup_20260413 (không phải bảng live).';
COMMENT ON TABLE public.order_code_hcm_backup_2025 IS
  'Backup order_code_hcm từ file backup_20260413 (không phải bảng live).';

ALTER TABLE public.orders_backup_2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_code_hcm_backup_2025 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_backup_2025_all_client" ON public.orders_backup_2025;
CREATE POLICY "orders_backup_2025_all_client"
  ON public.orders_backup_2025
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "order_code_hcm_backup_2025_all_client" ON public.order_code_hcm_backup_2025;
CREATE POLICY "order_code_hcm_backup_2025_all_client"
  ON public.order_code_hcm_backup_2025
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders_backup_2025 TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_code_hcm_backup_2025 TO anon, authenticated, service_role;
