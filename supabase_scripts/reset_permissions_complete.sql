-- NUCLEAR RESET SCRIPT
-- Defines the schema exactly as expected by the JS code

-- 1. Drop the table completely to remove any bad schema/state
DROP TABLE IF EXISTS app_page_permissions CASCADE;

-- 2. Recreate the table with explicit types
CREATE TABLE app_page_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_code TEXT NOT NULL,
    page_code TEXT NOT NULL,
    can_view BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    allowed_columns TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Vital for upsert to work
    CONSTRAINT app_page_permissions_unique_key UNIQUE(role_code, page_code)
);

-- 3. Enable RLS
ALTER TABLE app_page_permissions ENABLE ROW LEVEL SECURITY;

-- 4. Create ultra-permissive policies (for debugging phase)
-- Allow authenticated users to do ANYTHING
CREATE POLICY "Allow All For Authenticated"
ON app_page_permissions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 5. Grant permissions
GRANT ALL ON app_page_permissions TO authenticated;
GRANT ALL ON app_page_permissions TO anon;
-- Sequence grant not needed for UUID

-- 6. Verify
SELECT * FROM app_page_permissions LIMIT 1;
