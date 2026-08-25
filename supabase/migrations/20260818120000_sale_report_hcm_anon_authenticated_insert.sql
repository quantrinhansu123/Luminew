-- Cho phép INSERT (và DELETE) sale_report_hcm qua anon/authenticated (SPA dùng anon key).
-- Trước đây chỉ có SELECT + UPDATE → form Nhập báo cáo Sale HCM lỗi:
--   new row violates row-level security policy for table 'sale_report_hcm'
-- Cảnh báo bảo mật: policy mở giống SELECT/UPDATE hiện tại; siết sau theo auth.uid() nếu cần.

DO $$
BEGIN
  IF to_regclass('public.sale_report_hcm') IS NULL THEN
    RAISE NOTICE 'Bỏ qua: chưa có bảng public.sale_report_hcm';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.sale_report_hcm ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS "sale_report_hcm_insert_anon" ON public.sale_report_hcm';
  EXECUTE $p$
    CREATE POLICY "sale_report_hcm_insert_anon"
    ON public.sale_report_hcm
    FOR INSERT
    TO anon
    WITH CHECK (true)
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS "sale_report_hcm_insert_authenticated" ON public.sale_report_hcm';
  EXECUTE $p$
    CREATE POLICY "sale_report_hcm_insert_authenticated"
    ON public.sale_report_hcm
    FOR INSERT
    TO authenticated
    WITH CHECK (true)
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS "sale_report_hcm_delete_anon" ON public.sale_report_hcm';
  EXECUTE $p$
    CREATE POLICY "sale_report_hcm_delete_anon"
    ON public.sale_report_hcm
    FOR DELETE
    TO anon
    USING (true)
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS "sale_report_hcm_delete_authenticated" ON public.sale_report_hcm';
  EXECUTE $p$
    CREATE POLICY "sale_report_hcm_delete_authenticated"
    ON public.sale_report_hcm
    FOR DELETE
    TO authenticated
    USING (true)
  $p$;

  EXECUTE 'GRANT INSERT, DELETE ON TABLE public.sale_report_hcm TO anon, authenticated';
END $$;
