-- ==============================================================================
-- Fix for missing 'name' column in users table
-- This should be run BEFORE enforce_matrix_permissions.sql
-- ==============================================================================

-- Add 'name' column to users table if it doesn't exist
-- This will store the full name of the user for matching against owner fields
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name TEXT;

-- Populate 'name' column from username if empty (temporary fallback)
-- You should update this with actual names later
UPDATE public.users 
SET name = username 
WHERE name IS NULL OR name = '';

-- Optionally: Add index for performance
CREATE INDEX IF NOT EXISTS idx_users_name ON public.users(name);

SELECT 'Added name column to users table' as message;
