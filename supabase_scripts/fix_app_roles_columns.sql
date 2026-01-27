-- Add missing 'position' column to app_roles table
ALTER TABLE app_roles 
ADD COLUMN IF NOT EXISTS position TEXT;

-- Add 'name' column if it doesn't exist (common requirement)
ALTER TABLE app_roles 
ADD COLUMN IF NOT EXISTS name TEXT;

-- Add 'department' column if it doesn't exist
ALTER TABLE app_roles 
ADD COLUMN IF NOT EXISTS department TEXT;

-- Add comment
COMMENT ON COLUMN app_roles.position IS 'Position/title associated with this role';
COMMENT ON COLUMN app_roles.name IS 'Display name of the role';
COMMENT ON COLUMN app_roles.department IS 'Department this role belongs to';
