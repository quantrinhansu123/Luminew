-- ==============================================================================
-- FIX SCHEMA COLUMNS (Run this FIRST)
-- This script ensures all required columns exist before applying permissions.
-- ==============================================================================

-- 1. Ensure 'name' exists in 'users' table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'name') THEN
        ALTER TABLE public.users ADD COLUMN name TEXT;
    END IF;
END $$;

-- 2. Populate 'name' from 'username' if it was empty (Fallback)
UPDATE public.users 
SET name = username 
WHERE (name IS NULL OR name = '') AND username IS NOT NULL;

-- 3. Ensure 'name' exists in 'detail_reports' table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'detail_reports' AND column_name = 'name') THEN
        ALTER TABLE public.detail_reports ADD COLUMN name TEXT;
    END IF;
END $$;

-- 4. Ensure 'email' exists in 'detail_reports' table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'detail_reports' AND column_name = 'email') THEN
        ALTER TABLE public.detail_reports ADD COLUMN email TEXT;
    END IF;
END $$;

-- 5. Ensure 'department' exists in 'detail_reports' table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'detail_reports' AND column_name = 'department') THEN
        ALTER TABLE public.detail_reports ADD COLUMN department TEXT;
    END IF;
END $$;

SELECT 'Schema fixed! Now you can run enforce_matrix_permissions.sql' as message;
