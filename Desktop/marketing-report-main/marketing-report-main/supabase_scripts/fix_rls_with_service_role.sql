-- ============================================================================
-- FIX RLS VỚI SERVICE ROLE (Nếu có quyền admin)
-- ============================================================================

-- Xóa tất cả policies cũ
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'app_page_permissions'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON app_page_permissions', r.policyname);
    END LOOP;
END $$;

-- Tạo policy cho anon (vì app đang dùng anon key)
CREATE POLICY "Allow all operations for anon users"
ON app_page_permissions
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Tạo policy cho authenticated (nếu có session sau này)
CREATE POLICY "Allow all operations for authenticated users"
ON app_page_permissions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Grant quyền cho cả anon và authenticated
GRANT ALL ON app_page_permissions TO anon;
GRANT ALL ON app_page_permissions TO authenticated;
GRANT ALL ON app_page_permissions TO public;

-- Verify
SELECT 
    policyname,
    cmd,
    roles
FROM pg_policies 
WHERE tablename = 'app_page_permissions';
