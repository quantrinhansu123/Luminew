-- RLS: cho phép anon (và authenticated) đọc sale_report_hcm + users — cùng kiểu truy cập SPA React (Supabase anon key).
--
-- Lưu ý:
-- - Policy PostgreSQL là theo HÀNG, không theo cột. Client chỉ nhận các cột trong .select(); RLS quyết định hàng nào được phép đọc.
-- - Role service_role bỏ qua RLS (dùng trong Edge Functions / server có service key).
-- - Mở SELECT toàn bộ hàng users là rủi ro bảo mật; siết lại sau (vd. auth.uid() = id, hoặc view public_users).

-- ========== sale_report_hcm ==========
DO $$
BEGIN
  IF to_regclass('public.sale_report_hcm') IS NULL THEN
    RAISE NOTICE 'Bỏ qua: chưa có bảng public.sale_report_hcm (chạy migration create_hcm_clone_tables trước).';
    RETURN;
  END IF;

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

-- ========== users ==========
-- Cột đọc bởi báo cáo Sale/HCM (tham chiếu code):
--   NhanSuSaleLumiMoiView: id_appsheet, email, name, username, role, team, branch, position, department
--   + fetchUsersEmailNameForDisplayMap: email, name, username
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_anon" ON public.users;
CREATE POLICY "users_select_anon"
  ON public.users
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "users_select_authenticated" ON public.users;
CREATE POLICY "users_select_authenticated"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON TABLE public.users TO anon, authenticated;
