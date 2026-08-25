-- Chạy 1 lần trên Supabase SQL Editor để hết lỗi:
--   Lỗi khi lưu báo cáo: new row violates row-level security policy for table 'sale_report_hcm'

ALTER TABLE public.sale_report_hcm ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sale_report_hcm_insert_anon" ON public.sale_report_hcm;
CREATE POLICY "sale_report_hcm_insert_anon"
  ON public.sale_report_hcm
  FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "sale_report_hcm_insert_authenticated" ON public.sale_report_hcm;
CREATE POLICY "sale_report_hcm_insert_authenticated"
  ON public.sale_report_hcm
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "sale_report_hcm_delete_anon" ON public.sale_report_hcm;
CREATE POLICY "sale_report_hcm_delete_anon"
  ON public.sale_report_hcm
  FOR DELETE
  TO anon
  USING (true);

DROP POLICY IF EXISTS "sale_report_hcm_delete_authenticated" ON public.sale_report_hcm;
CREATE POLICY "sale_report_hcm_delete_authenticated"
  ON public.sale_report_hcm
  FOR DELETE
  TO authenticated
  USING (true);

GRANT INSERT, DELETE ON TABLE public.sale_report_hcm TO anon, authenticated;
