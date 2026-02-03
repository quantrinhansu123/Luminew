-- ============================================================================
-- COMPLETE FIX FOR RLS POLICY ON app_page_permissions
-- This script fixes the "new row violates row-level security policy" error
-- ============================================================================

-- Step 1: Ensure table exists with correct structure
CREATE TABLE IF NOT EXISTS app_page_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_code TEXT NOT NULL,
    page_code TEXT NOT NULL,
    can_view BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    allowed_columns TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT app_page_permissions_unique_key UNIQUE(role_code, page_code)
);

-- Step 2: Enable RLS
ALTER TABLE app_page_permissions ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop ALL existing policies to avoid conflicts
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'app_page_permissions') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON app_page_permissions', r.policyname);
    END LOOP;
END $$;

-- Step 4: Create new comprehensive policies
-- Policy 1: Allow all authenticated users to SELECT (read)
CREATE POLICY "policy_select_all_authenticated"
ON app_page_permissions FOR SELECT
TO authenticated
USING (true);

-- Policy 2: Allow all authenticated users to INSERT
CREATE POLICY "policy_insert_all_authenticated"
ON app_page_permissions FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy 3: Allow all authenticated users to UPDATE
CREATE POLICY "policy_update_all_authenticated"
ON app_page_permissions FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy 4: Allow all authenticated users to DELETE
CREATE POLICY "policy_delete_all_authenticated"
ON app_page_permissions FOR DELETE
TO authenticated
USING (true);

-- Step 5: Grant table permissions
GRANT ALL ON app_page_permissions TO authenticated;
GRANT ALL ON app_page_permissions TO anon;

-- Step 6: Grant schema usage
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Step 7: Verify the policies were created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'app_page_permissions'
ORDER BY policyname;

-- Step 8: Test query (should return empty or existing rows)
SELECT COUNT(*) as total_permissions FROM app_page_permissions;
