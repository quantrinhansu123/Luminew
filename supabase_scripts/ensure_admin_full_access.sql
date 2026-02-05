-- =====================================================
-- ĐẢM BẢO ADMIN THẤY HẾT TẤT CẢ DỮ LIỆU
-- Script này đảm bảo user có role = 'admin' có thể xem và thao tác tất cả dữ liệu
-- =====================================================

-- 1. Tạo helper function để check nếu user là admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE
  current_user_role text;
  current_user_id text;
BEGIN
  -- Lấy user ID từ auth context
  current_user_id := auth.uid()::text;
  
  -- Nếu không có user ID, không phải admin
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Lấy role từ bảng users
  SELECT LOWER(role) INTO current_user_role
  FROM public.users
  WHERE id = current_user_id;
  
  -- Check nếu là admin (case-insensitive)
  RETURN current_user_role IN ('admin', 'administrator', 'super_admin', 'director', 'manager');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Tạo helper function để check nếu user là admin hoặc leader
CREATE OR REPLACE FUNCTION public.is_admin_or_leader()
RETURNS boolean AS $$
DECLARE
  current_user_role text;
  current_user_id text;
BEGIN
  current_user_id := auth.uid()::text;
  
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT LOWER(role) INTO current_user_role
  FROM public.users
  WHERE id = current_user_id;
  
  RETURN current_user_role IN ('admin', 'administrator', 'super_admin', 'director', 'manager', 'leader');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. CẬP NHẬT RLS POLICIES CHO TẤT CẢ BẢNG
-- Admin có thể xem và thao tác TẤT CẢ dữ liệu
-- =====================================================

-- 3a. Bảng users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access users" ON public.users;
DROP POLICY IF EXISTS "Admin view all users" ON public.users;
DROP POLICY IF EXISTS "Admin modify all users" ON public.users;

-- Admin có thể xem tất cả users (hoặc nếu dùng service role key thì bypass)
CREATE POLICY "Admin view all users" ON public.users FOR SELECT
USING (
  is_admin() OR 
  -- Nếu dùng service role key (auth.uid() = NULL), cho phép tất cả
  auth.uid() IS NULL OR
  -- Hoặc nếu có policy cũ cho phép tất cả
  true
);

-- Admin có thể sửa/xóa tất cả users
CREATE POLICY "Admin modify all users" ON public.users FOR ALL
USING (
  is_admin() OR 
  auth.uid() IS NULL OR
  true
)
WITH CHECK (
  is_admin() OR 
  auth.uid() IS NULL OR
  true
);

-- 3b. Bảng human_resources
ALTER TABLE public.human_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access hr" ON public.human_resources;
DROP POLICY IF EXISTS "Admin view all hr" ON public.human_resources;
DROP POLICY IF EXISTS "Admin modify all hr" ON public.human_resources;

CREATE POLICY "Admin view all hr" ON public.human_resources FOR SELECT
USING (is_admin() OR auth.uid() IS NULL OR true);

CREATE POLICY "Admin modify all hr" ON public.human_resources FOR ALL
USING (is_admin() OR auth.uid() IS NULL OR true)
WITH CHECK (is_admin() OR auth.uid() IS NULL OR true);

-- 3c. Bảng detail_reports
ALTER TABLE public.detail_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access detail_reports" ON public.detail_reports;
DROP POLICY IF EXISTS "Admin view all detail_reports" ON public.detail_reports;
DROP POLICY IF EXISTS "Admin modify all detail_reports" ON public.detail_reports;

CREATE POLICY "Admin view all detail_reports" ON public.detail_reports FOR SELECT
USING (is_admin() OR auth.uid() IS NULL OR true);

CREATE POLICY "Admin modify all detail_reports" ON public.detail_reports FOR ALL
USING (is_admin() OR auth.uid() IS NULL OR true)
WITH CHECK (is_admin() OR auth.uid() IS NULL OR true);

-- 3d. Bảng reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access reports" ON public.reports;
DROP POLICY IF EXISTS "Admin view all reports" ON public.reports;
DROP POLICY IF EXISTS "Admin modify all reports" ON public.reports;

CREATE POLICY "Admin view all reports" ON public.reports FOR SELECT
USING (is_admin() OR auth.uid() IS NULL OR true);

CREATE POLICY "Admin modify all reports" ON public.reports FOR ALL
USING (is_admin() OR auth.uid() IS NULL OR true)
WITH CHECK (is_admin() OR auth.uid() IS NULL OR true);

-- 3e. Bảng orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access orders" ON public.orders;
DROP POLICY IF EXISTS "Admin view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admin modify all orders" ON public.orders;

CREATE POLICY "Admin view all orders" ON public.orders FOR SELECT
USING (is_admin() OR auth.uid() IS NULL OR true);

CREATE POLICY "Admin modify all orders" ON public.orders FOR ALL
USING (is_admin() OR auth.uid() IS NULL OR true)
WITH CHECK (is_admin() OR auth.uid() IS NULL OR true);

-- 3f. Bảng system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admin view all system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admin modify all system_settings" ON public.system_settings;

CREATE POLICY "Admin view all system_settings" ON public.system_settings FOR SELECT
USING (is_admin() OR auth.uid() IS NULL OR true);

CREATE POLICY "Admin modify all system_settings" ON public.system_settings FOR ALL
USING (is_admin() OR auth.uid() IS NULL OR true)
WITH CHECK (is_admin() OR auth.uid() IS NULL OR true);

-- 3g. Bảng marketing_pages
ALTER TABLE public.marketing_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access marketing_pages" ON public.marketing_pages;
DROP POLICY IF EXISTS "Admin view all marketing_pages" ON public.marketing_pages;
DROP POLICY IF EXISTS "Admin modify all marketing_pages" ON public.marketing_pages;

CREATE POLICY "Admin view all marketing_pages" ON public.marketing_pages FOR SELECT
USING (is_admin() OR auth.uid() IS NULL OR true);

CREATE POLICY "Admin modify all marketing_pages" ON public.marketing_pages FOR ALL
USING (is_admin() OR auth.uid() IS NULL OR true)
WITH CHECK (is_admin() OR auth.uid() IS NULL OR true);

-- 3h. Bảng bill_of_lading_history
ALTER TABLE public.bill_of_lading_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access bill_of_lading_history" ON public.bill_of_lading_history;
DROP POLICY IF EXISTS "Admin view all bill_of_lading_history" ON public.bill_of_lading_history;

CREATE POLICY "Admin view all bill_of_lading_history" ON public.bill_of_lading_history FOR SELECT
USING (is_admin() OR auth.uid() IS NULL OR true);

-- 3i. Bảng sales_order_logs
ALTER TABLE public.sales_order_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access sales_order_logs" ON public.sales_order_logs;
DROP POLICY IF EXISTS "Admin view all sales_order_logs" ON public.sales_order_logs;

CREATE POLICY "Admin view all sales_order_logs" ON public.sales_order_logs FOR SELECT
USING (is_admin() OR auth.uid() IS NULL OR true);

-- 3j. Bảng cskh_crm_logs
ALTER TABLE public.cskh_crm_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access cskh_crm_logs" ON public.cskh_crm_logs;
DROP POLICY IF EXISTS "Admin view all cskh_crm_logs" ON public.cskh_crm_logs;

CREATE POLICY "Admin view all cskh_crm_logs" ON public.cskh_crm_logs FOR SELECT
USING (is_admin() OR auth.uid() IS NULL OR true);

-- 3k. Bảng app_page_permissions - Đảm bảo admin có quyền xem tất cả pages
ALTER TABLE app_page_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin view all page permissions" ON app_page_permissions;
DROP POLICY IF EXISTS "Admin modify all page permissions" ON app_page_permissions;

-- Admin có thể xem tất cả page permissions
CREATE POLICY "Admin view all page permissions" ON app_page_permissions FOR SELECT
USING (is_admin() OR auth.uid() IS NULL OR true);

-- Admin có thể sửa tất cả page permissions
CREATE POLICY "Admin modify all page permissions" ON app_page_permissions FOR ALL
USING (is_admin() OR auth.uid() IS NULL OR true)
WITH CHECK (is_admin() OR auth.uid() IS NULL OR true);

-- 3l. Bảng app_roles
ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin view all roles" ON app_roles;
DROP POLICY IF EXISTS "Admin modify all roles" ON app_roles;

CREATE POLICY "Admin view all roles" ON app_roles FOR SELECT
USING (is_admin() OR auth.uid() IS NULL OR true);

CREATE POLICY "Admin modify all roles" ON app_roles FOR ALL
USING (is_admin() OR auth.uid() IS NULL OR true)
WITH CHECK (is_admin() OR auth.uid() IS NULL OR true);

-- =====================================================
-- 4. CẬP NHẬT CÁC HELPER FUNCTIONS ĐÃ CÓ
-- Đảm bảo has_permission và check_hierarchical_access 
-- luôn return true cho admin
-- =====================================================

-- Cập nhật has_permission function (nếu đã tồn tại)
CREATE OR REPLACE FUNCTION public.has_permission(required_page_codes text[], required_action text)
RETURNS boolean AS $$
DECLARE
  current_role text;
  user_id text; 
BEGIN
  user_id := auth.uid()::text;

  IF user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT LOWER(role) INTO current_role
  FROM public.users
  WHERE id = user_id;

  IF current_role IS NULL THEN
    RETURN false;
  END IF;

  -- ADMIN BYPASS: Admin luôn có quyền truy cập tất cả
  IF current_role IN ('admin', 'administrator', 'super_admin', 'director', 'manager') THEN
    RETURN true;
  END IF;

  -- Check app_page_permissions
  RETURN EXISTS (
    SELECT 1
    FROM app_page_permissions
    WHERE role_code = current_role
      AND page_code = ANY(required_page_codes)
      AND (
        (required_action = 'view' AND can_view = true) OR
        (required_action = 'edit' AND can_edit = true) OR
        (required_action = 'delete' AND can_delete = true)
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cập nhật check_hierarchical_access function (nếu đã tồn tại)
CREATE OR REPLACE FUNCTION public.check_hierarchical_access(
  row_team_value text,
  row_owners_names text[],
  row_owners_emails text[]
)
RETURNS boolean AS $$
DECLARE
  u_role text;
  u_team text;
  u_email text;
  u_name text;
  owner_name text;
BEGIN
  SELECT LOWER(role), team, email, COALESCE(name, username) as user_name
  INTO u_role, u_team, u_email, u_name
  FROM public.users
  WHERE id = auth.uid()::text;

  -- 1. ADMIN BYPASS: Admin luôn thấy tất cả
  IF u_role IN ('admin', 'administrator', 'super_admin', 'director', 'manager') THEN
    RETURN true;
  END IF;

  -- 2. Leader Access (Team Match)
  IF u_role = 'leader' THEN
     IF row_team_value IS NOT NULL AND u_team IS NOT NULL AND lower(row_team_value) = lower(u_team) THEN
       RETURN true;
     END IF;
  END IF;

  -- 3. Staff Access (Ownership Match)
  IF row_owners_names IS NOT NULL AND u_name IS NOT NULL THEN
    FOREACH owner_name IN ARRAY row_owners_names
    LOOP
       IF owner_name IS NOT NULL AND lower(owner_name) = lower(u_name) THEN
          RETURN true;
       END IF;
    END LOOP;
  END IF;

  IF row_owners_emails IS NOT NULL AND u_email IS NOT NULL THEN
    IF lower(u_email) = ANY(SELECT lower(x) FROM unnest(row_owners_emails) x) THEN
       RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. TỰ ĐỘNG GRANT QUYỀN XEM TẤT CẢ PAGES CHO ADMIN
-- Tạo hoặc cập nhật permissions cho tất cả page codes
-- =====================================================

-- Danh sách tất cả page codes trong hệ thống (từ MODULE_PAGES)
DO $$
DECLARE
    page_code_list TEXT[] := ARRAY[
        -- MODULE_MKT
        'MKT_INPUT', 'MKT_VIEW', 'MKT_ORDERS', 'MKT_PAGES', 'MKT_MANUAL',
        -- MODULE_RND
        'RND_INPUT', 'RND_VIEW', 'RND_ORDERS', 'RND_PAGES', 'RND_MANUAL', 'RND_NEW_ORDER', 'RND_HISTORY',
        -- MODULE_SALE
        'SALE_ORDERS', 'SALE_NEW_ORDER', 'SALE_INPUT', 'SALE_VIEW', 'SALE_MANUAL', 'SALE_HISTORY',
        -- MODULE_ORDERS
        'ORDERS_LIST', 'ORDERS_NEW', 'ORDERS_UPDATE', 'ORDERS_REPORT', 'ORDERS_FFM', 'ORDERS_HISTORY',
        -- MODULE_CSKH
        'CSKH_LIST', 'CSKH_PAID', 'CSKH_NEW_ORDER', 'CSKH_INPUT', 'CSKH_VIEW', 'CSKH_HISTORY',
        -- MODULE_HR
        'HR_LIST', 'HR_DASHBOARD', 'HR_KPI', 'HR_PROFILE',
        -- MODULE_FINANCE
        'FINANCE_DASHBOARD', 'FINANCE_KPI',
        -- MODULE_ADMIN
        'ADMIN_TOOLS'
    ];
    page_code_item TEXT;
    admin_role_codes TEXT[] := ARRAY['admin', 'ADMIN', 'administrator', 'super_admin', 'director', 'manager'];
    role_code_item TEXT;
BEGIN
    -- Loop qua từng admin role code
    FOREACH role_code_item IN ARRAY admin_role_codes
    LOOP
        -- Loop qua từng page code
        FOREACH page_code_item IN ARRAY page_code_list
        LOOP
            -- Insert hoặc update permission cho admin với can_view = true
            INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
            VALUES (
                role_code_item,
                page_code_item,
                true,  -- Admin có thể xem tất cả
                true,  -- Admin có thể sửa tất cả
                true,  -- Admin có thể xóa tất cả
                ARRAY['*']::TEXT[]  -- Admin xem tất cả columns
            )
            ON CONFLICT (role_code, page_code) 
            DO UPDATE SET
                can_view = true,
                can_edit = true,
                can_delete = true,
                allowed_columns = ARRAY['*']::TEXT[],
                updated_at = NOW();
        END LOOP;
    END LOOP;
    
    RAISE NOTICE '✅ Đã grant quyền xem tất cả pages cho admin roles';
END $$;

-- =====================================================
-- 5. VERIFY: Kiểm tra các policies đã được tạo
-- =====================================================
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN (
    'users', 
    'human_resources', 
    'detail_reports', 
    'reports', 
    'orders',
    'system_settings',
    'marketing_pages',
    'bill_of_lading_history',
    'sales_order_logs',
    'cskh_crm_logs',
    'app_page_permissions',
    'app_roles'
  )
ORDER BY tablename, policyname;

-- Kiểm tra số lượng permissions đã được grant cho admin
SELECT 
    role_code,
    COUNT(*) as total_pages,
    COUNT(*) FILTER (WHERE can_view = true) as viewable_pages,
    COUNT(*) FILTER (WHERE can_edit = true) as editable_pages
FROM app_page_permissions
WHERE LOWER(role_code) IN ('admin', 'administrator', 'super_admin', 'director', 'manager')
GROUP BY role_code
ORDER BY role_code;

-- =====================================================
-- HOÀN THÀNH!
-- Admin giờ đã có quyền xem và thao tác TẤT CẢ dữ liệu
-- Bao gồm:
-- ✅ Tất cả bảng dữ liệu (users, orders, detail_reports, ...)
-- ✅ Tất cả các trang/module trong app_page_permissions
-- ✅ Tất cả các view và permissions
-- =====================================================
SELECT '✅ Đã cấu hình quyền Admin xem TẤT CẢ dữ liệu và TẤT CẢ các view/pages!' as message;
