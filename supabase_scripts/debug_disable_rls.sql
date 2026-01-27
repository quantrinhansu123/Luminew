-- NUCLEAR OPTION: Temporarily disable RLS to confirm if that is the cause
ALTER TABLE app_page_permissions DISABLE ROW LEVEL SECURITY;

-- If this works, then we know for sure it is a policy issue.
-- After testing, you should re-enable it:
-- ALTER TABLE app_page_permissions ENABLE ROW LEVEL SECURITY;
