-- DEBUG SCRIPT: Check User Access & Policies
-- Run this in Supabase SQL Editor

-- 1. Check policies on 'orders' table
SELECT schemaname, tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'orders';

-- 2. Check info for user 'Trần Quốc Khải' (finding by name or similar)
-- We need to see his ID, role, team
SELECT id, email, role, team, name 
FROM public.users 
WHERE name ILIKE '%Trần Quốc Khải%';

-- 3. Check sample order data (limit 5) to see what 'marketing_staff' looks like
SELECT id, order_code, sale_staff, marketing_staff, team, created_by 
FROM public.orders 
LIMIT 5;

-- 4. Test the RLS function manually for this user (if you know his email/name)
-- Replacing values with what we find in step 2
-- SELECT public.check_hierarchical_access('Some Team', ARRAY['Some Name'], ARRAY['some@email.com']);
