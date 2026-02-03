-- Check all tables in public schema
SELECT 
    schemaname,
    tablename,
    tableowner,
    rowsecurity as "RLS Enabled"
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check all RLS policies
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
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check app_page_permissions table specifically
SELECT * FROM pg_tables WHERE tablename = 'app_page_permissions';
SELECT * FROM pg_policies WHERE tablename = 'app_page_permissions';

-- Check grants on app_page_permissions
SELECT 
    grantee, 
    privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name='app_page_permissions';
