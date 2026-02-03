-- Add selected_personnel column to users table
-- This column stores an array of employee emails that a user has selected

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS selected_personnel jsonb;

COMMENT ON COLUMN public.users.selected_personnel IS 'List of selected employee emails (JSON array) for personnel management';
