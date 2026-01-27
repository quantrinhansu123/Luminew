-- Fix RLS policy for app_page_permissions table
-- This script ensures authenticated users can insert/update permissions

-- Step 1: Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read page_permissions" ON app_page_permissions;
DROP POLICY IF EXISTS "Allow authenticated users to modify page_permissions" ON app_page_permissions;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON app_page_permissions;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON app_page_permissions;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON app_page_permissions;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON app_page_permissions;
DROP POLICY IF EXISTS "Read Permissions" ON app_page_permissions;
DROP POLICY IF EXISTS "Admin Modify Permissions" ON app_page_permissions;
DROP POLICY IF EXISTS "Allow All For Authenticated" ON app_page_permissions;

-- Step 2: Create comprehensive policies for authenticated users
-- Read policy
CREATE POLICY "Allow read for authenticated users"
ON app_page_permissions FOR SELECT
TO authenticated
USING (true);

-- Insert policy
CREATE POLICY "Allow insert for authenticated users"
ON app_page_permissions FOR INSERT
TO authenticated
WITH CHECK (true);

-- Update policy
CREATE POLICY "Allow update for authenticated users"
ON app_page_permissions FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Delete policy (optional, for cleanup)
CREATE POLICY "Allow delete for authenticated users"
ON app_page_permissions FOR DELETE
TO authenticated
USING (true);

-- Step 3: Grant necessary permissions
GRANT ALL ON app_page_permissions TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Step 4: Verify policies
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
