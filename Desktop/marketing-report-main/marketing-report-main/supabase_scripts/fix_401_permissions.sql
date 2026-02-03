-- Fix 401 Unauthorized error on app_page_permissions

-- Step 1: Ensure table exists
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
    UNIQUE(role_code, page_code)
);

-- Step 2: Enable RLS
ALTER TABLE app_page_permissions ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop existing policies (if any)
DROP POLICY IF EXISTS "Allow authenticated users to read page_permissions" ON app_page_permissions;
DROP POLICY IF EXISTS "Allow authenticated users to modify page_permissions" ON app_page_permissions;

-- Step 4: Recreate policies with correct permissions
CREATE POLICY "Enable read access for authenticated users"
ON app_page_permissions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable insert access for authenticated users"
ON app_page_permissions FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users"
ON app_page_permissions FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users"
ON app_page_permissions FOR DELETE
TO authenticated
USING (true);

-- Step 5: Grant all necessary permissions
GRANT ALL ON app_page_permissions TO authenticated;
GRANT ALL ON app_page_permissions TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Step 6: Verify
SELECT 
    tablename, 
    policyname, 
    cmd 
FROM pg_policies 
WHERE tablename = 'app_page_permissions';
