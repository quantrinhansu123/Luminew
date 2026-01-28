-- ==============================================================================
-- Script FIX quyền DELETE cho bảng detail_reports
-- Cho phép user có quyền MKT_MANUAL hoặc RND_MANUAL có thể xóa báo cáo của mình
-- ==============================================================================

-- 1. Xóa policy DELETE cũ nếu có
DROP POLICY IF EXISTS "Matrix Delete Reports" ON public.detail_reports;
DROP POLICY IF EXISTS "Open Delete Reports" ON public.detail_reports;
DROP POLICY IF EXISTS "Allow all delete" ON public.detail_reports;

-- 2. Tạo policy DELETE mới - Cho phép xóa nếu:
--    - User có permission MKT_INPUT, RND_INPUT, MKT_MANUAL, RND_MANUAL với quyền delete
--    - HOẶC user là Admin/Director/Manager
--    - HOẶC user xóa báo cáo của chính mình (dựa vào Tên hoặc Email)
CREATE POLICY "Matrix Delete Reports" ON public.detail_reports FOR DELETE
USING (
  -- Admin/Director/Manager luôn được xóa
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND role IN ('admin', 'director', 'manager', 'super_admin', 'ADMIN', 'DIRECTOR', 'MANAGER', 'SUPER_ADMIN')
  )
  OR
  -- User có permission delete cho MKT hoặc RND
  has_permission(ARRAY['MKT_INPUT', 'RND_INPUT', 'MKT_MANUAL', 'RND_MANUAL'], 'delete')
  OR
  -- User xóa báo cáo của chính mình (dựa vào Email hoặc Tên)
  (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
      AND (
        email = detail_reports."Email"
        OR 
        EXISTS (
          SELECT 1 FROM public.human_resources 
          WHERE LOWER(TRIM("Họ Và Tên")) = LOWER(TRIM(detail_reports."Tên"))
          AND LOWER(TRIM(email)) = LOWER(TRIM((SELECT email FROM auth.users WHERE id = auth.uid())))
        )
      )
    )
  )
);

-- 3. Kiểm tra lại policies
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'detail_reports'
ORDER BY cmd, policyname;

-- ==============================================================================
-- Lưu ý:
-- 1. Policy này cho phép user xóa báo cáo của chính mình
-- 2. Admin/Director/Manager có thể xóa tất cả
-- 3. User có permission delete có thể xóa (nếu có quyền trong app_page_permissions)
-- ==============================================================================
