-- ============================================================================
-- FIX RLS CHO ANON KEY (App đang dùng anon key, không có authenticated session)
-- ============================================================================

-- Bước 1: Xóa TẤT CẢ policies cũ
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

-- Bước 2: Tạo policy cho anon (QUAN TRỌNG - vì app dùng anon key)
CREATE POLICY "Allow all for anon"
ON app_page_permissions
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Bước 3: Tạo policy cho authenticated (để tương lai nếu có session)
CREATE POLICY "Allow all for authenticated"
ON app_page_permissions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Bước 4: Grant quyền (ưu tiên anon)
GRANT ALL ON app_page_permissions TO anon;
GRANT ALL ON app_page_permissions TO authenticated;
GRANT ALL ON app_page_permissions TO public;

-- Bước 5: Grant schema usage
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Bước 6: Verify
SELECT 
    policyname,
    cmd,
    roles,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'app_page_permissions'
ORDER BY policyname;

-- Bước 7: Test (nên trả về số lượng permissions)
SELECT COUNT(*) as total_permissions FROM app_page_permissions;
