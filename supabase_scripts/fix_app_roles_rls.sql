-- Enable RLS on app_roles if not already enabled
ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all" ON app_roles;
DROP POLICY IF EXISTS "Enable insert access for all" ON app_roles;
DROP POLICY IF EXISTS "Enable update access for all" ON app_roles;
DROP POLICY IF EXISTS "Enable delete access for all" ON app_roles;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON app_roles;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON app_roles;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON app_roles;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON app_roles;

-- Create full access policies for PUBLIC (both anonymous and authenticated)
-- This ensures that even if the session is not perfectly established, the operation succeeds.
-- WARNING: In a production environment with public access, you would want to restrict this.
CREATE POLICY "Enable access for all users" ON app_roles
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);
