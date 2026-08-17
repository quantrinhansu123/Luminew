-- Trang /xem-bao-cao-sale-hcm (HTML) từng select cột revenue_mess + order id.
-- Nếu sale_report_hcm clone trước khi sales_reports có cột này → PostgREST PGRST204
-- và alert "Không thể tải dữ liệu từ Supabase (bảng sale_report_hcm)".

DO $$
BEGIN
  IF to_regclass('public.sale_report_hcm') IS NULL THEN
    RAISE NOTICE 'Bỏ qua: chưa có bảng public.sale_report_hcm';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.sale_report_hcm ADD COLUMN IF NOT EXISTS revenue_mess NUMERIC DEFAULT 0';
  EXECUTE 'ALTER TABLE public.sale_report_hcm ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS "sale_report_hcm_select_anon" ON public.sale_report_hcm';
  EXECUTE $p$
    CREATE POLICY "sale_report_hcm_select_anon"
    ON public.sale_report_hcm
    FOR SELECT
    TO anon
    USING (true)
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS "sale_report_hcm_select_authenticated" ON public.sale_report_hcm';
  EXECUTE $p$
    CREATE POLICY "sale_report_hcm_select_authenticated"
    ON public.sale_report_hcm
    FOR SELECT
    TO authenticated
    USING (true)
  $p$;

  EXECUTE 'GRANT SELECT ON TABLE public.sale_report_hcm TO anon, authenticated';
END $$;

NOTIFY pgrst, 'reload schema';
