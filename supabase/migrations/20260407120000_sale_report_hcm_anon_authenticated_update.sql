-- Cho phép UPDATE sale_report_hcm qua anon/authenticated (SPA dùng anon key).
-- Trước đây chỉ có SELECT (20260402140000_rls_sale_report_hcm_users_anon_select.sql) → sửa mess_count inline / form không ghi được DB.
-- Cảnh báo bảo mật: policy mở giống SELECT hiện tại; siết sau theo auth.uid() nếu cần.

DO $$
BEGIN
  IF to_regclass('public.sale_report_hcm') IS NULL THEN
    RAISE NOTICE 'Bỏ qua: chưa có bảng public.sale_report_hcm';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "sale_report_hcm_update_anon" ON public.sale_report_hcm';
  EXECUTE $p$
    CREATE POLICY "sale_report_hcm_update_anon"
    ON public.sale_report_hcm
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true)
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS "sale_report_hcm_update_authenticated" ON public.sale_report_hcm';
  EXECUTE $p$
    CREATE POLICY "sale_report_hcm_update_authenticated"
    ON public.sale_report_hcm
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true)
  $p$;

  EXECUTE 'GRANT UPDATE ON TABLE public.sale_report_hcm TO anon, authenticated';
END $$;
