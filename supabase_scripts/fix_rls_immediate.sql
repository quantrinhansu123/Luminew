-- ============================================================================
-- FIX NGAY LẬP TỨC: RLS Policy cho app_page_permissions
-- Lỗi: "new row violates row-level security policy"
-- ============================================================================

-- Bước 1: Xóa TẤT CẢ policies cũ (tránh conflict)
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

-- Bước 2: Tạo policy cho anon (vì app đang dùng anon key)
CREATE POLICY "Allow all for anon users"
ON app_page_permissions
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Bước 2b: Tạo policy cho authenticated (nếu có session sau này)
CREATE POLICY "Allow all for authenticated users"
ON app_page_permissions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Bước 3: Grant quyền (ưu tiên anon vì app đang dùng anon key)
GRANT ALL ON app_page_permissions TO anon;
GRANT ALL ON app_page_permissions TO authenticated;
GRANT ALL ON app_page_permissions TO public;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Bước 4: Verify
SELECT 
    policyname,
    cmd,
    roles
FROM pg_policies 
WHERE tablename = 'app_page_permissions';
