-- Create app_page_permissions table for hierarchical RBAC
CREATE TABLE IF NOT EXISTS app_page_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_code TEXT NOT NULL,
    page_code TEXT NOT NULL,
    can_view BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    allowed_columns TEXT[], -- JSON array of column names
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(role_code, page_code)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_page_permissions_role ON app_page_permissions(role_code);
CREATE INDEX IF NOT EXISTS idx_page_permissions_page ON app_page_permissions(page_code);

-- Enable Row Level Security (RLS)
ALTER TABLE app_page_permissions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read
CREATE POLICY "Allow authenticated users to read page_permissions"
ON app_page_permissions FOR SELECT
TO authenticated
USING (true);

-- Create policy to allow authenticated users to insert/update
CREATE POLICY "Allow authenticated users to modify page_permissions"
ON app_page_permissions FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Grant permissions to authenticated users
GRANT ALL ON app_page_permissions TO authenticated;

-- Add comment to table
COMMENT ON TABLE app_page_permissions IS 'Page-level permissions for hierarchical RBAC (Module→Page→Actions)';
