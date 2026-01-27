-- ==============================================================================
-- Enforce Matrix Permissions using Row Level Security (RLS)
-- This script relies on `app_page_permissions` and `users` table.
-- ==============================================================================

-- 0. Ensure Tables Exist (Prevent 42P01 Errors)
CREATE TABLE IF NOT EXISTS public.human_resources (
  id TEXT PRIMARY KEY,
  "Họ Và Tên" TEXT,
  email TEXT,
  "Bộ phận" TEXT,
  "Team" TEXT,
  "Vị trí" TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketing_pages (
  id TEXT PRIMARY KEY,
  page_name TEXT,
  mkt_staff TEXT,
  product TEXT,
  market TEXT,
  pancake_id TEXT,
  page_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1. Create Helper Function `has_permission`
-- This function checks if the current user (auth.uid()) has the required permission
-- for ANY of the provided page_codes.
CREATE OR REPLACE FUNCTION public.has_permission(required_page_codes text[], required_action text)
RETURNS boolean AS $$
DECLARE
  current_role text;
  user_id text; 
BEGIN
  -- Get current user ID
  user_id := auth.uid()::text;

  -- 1. Get role from public.users
  SELECT role INTO current_role
  FROM public.users
  WHERE id = user_id;

  -- If no role found or user not found, access denied
  IF current_role IS NULL THEN
    RETURN false;
  END IF;

  -- 2. Admin / Leader Bypass
  -- 'admin' always has full permission access (they can see all pages).
  -- 'leader' also typically has access to team pages.
  IF current_role IN ('admin', 'director', 'manager') THEN
    RETURN true;
  END IF;

  -- 3. Check app_page_permissions
  RETURN EXISTS (
    SELECT 1
    FROM app_page_permissions
    WHERE role_code = current_role
      AND page_code = ANY(required_page_codes)
      AND (
        (required_action = 'view' AND can_view = true) OR
        (required_action = 'edit' AND can_edit = true) OR
        (required_action = 'delete' AND can_delete = true)
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 1b. Create Helper Function `check_hierarchical_access` (NEW)
-- Enforces: Staff sees own data, Leader sees team data, Admin sees all.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.check_hierarchical_access(
  row_team_value text,
  row_owners_names text[],
  row_owners_emails text[]
)
RETURNS boolean AS $$
DECLARE
  u_role text;
  u_team text;
  u_email text;
  u_name text;
  owner_name text;
BEGIN
  -- Fetch current user details from public.users
  -- Use COALESCE to fallback to username if name column doesn't exist or is NULL
  SELECT lower(role), team, email, COALESCE(name, username) as user_name
  INTO u_role, u_team, u_email, u_name
  FROM public.users
  WHERE id = auth.uid()::text;

  -- 1. Admin/Director/Manager Access (View All)
  IF u_role IN ('admin', 'director', 'manager', 'super_admin') THEN
    RETURN true;
  END IF;

  -- 2. Leader Access (Team Match)
  IF u_role = 'leader' THEN
     -- Check if User Team matches Row Team (Case Insensitive)
     IF row_team_value IS NOT NULL AND u_team IS NOT NULL AND lower(row_team_value) = lower(u_team) THEN
       RETURN true;
     END IF;
  END IF;

  -- 3. Staff Access (Ownership Match)
  -- Check Name match (Case Insensitive)
  IF row_owners_names IS NOT NULL AND u_name IS NOT NULL THEN
    FOREACH owner_name IN ARRAY row_owners_names
    LOOP
       IF owner_name IS NOT NULL AND lower(owner_name) = lower(u_name) THEN
          RETURN true;
       END IF;
    END LOOP;
  END IF;

  -- Check Email match (Case Insensitive)
  IF row_owners_emails IS NOT NULL AND u_email IS NOT NULL THEN
    IF lower(u_email) = ANY(SELECT lower(x) FROM unnest(row_owners_emails) x) THEN
       RETURN true;
    END IF;
  END IF;

  -- 4. Implicit Access (Self)
  -- If checking 'users' table, and id matches, allow? 
  -- (This function is generic for data tables, not users table strictly, but checking email covers self-data).

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 2. Apply RLS to `orders` Table
-- Maps to: SALE, ORDERS (Delivery), CSKH, RND (duplicates), MKT (duplicates)
-- ==============================================================================

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all access" ON public.orders;
DROP POLICY IF EXISTS "Allow all read access" ON public.orders;
DROP POLICY IF EXISTS "Allow all insert" ON public.orders;
DROP POLICY IF EXISTS "Allow all update" ON public.orders;
DROP POLICY IF EXISTS "Allow all delete" ON public.orders;
DROP POLICY IF EXISTS "Matrix View Orders" ON public.orders;
DROP POLICY IF EXISTS "Matrix Insert Orders" ON public.orders;
DROP POLICY IF EXISTS "Matrix Update Orders" ON public.orders;
DROP POLICY IF EXISTS "Matrix Delete Orders" ON public.orders;

-- SELECT: Needs (View Permission) AND (Hierarchical Access)
CREATE POLICY "Matrix View Orders" ON public.orders FOR SELECT
USING (
  has_permission(ARRAY[
    'SALE_ORDERS', 'SALE_VIEW',
    'ORDERS_LIST', 'ORDERS_HISTORY', 'ORDERS_REPORT',
    'CSKH_LIST', 'CSKH_VIEW',
    'MKT_ORDERS',
    'RND_ORDERS',
    'FINANCE_KPI', 'FINANCE_DASHBOARD',
    'ORDERS_FFM'
  ], 'view')
  AND
  check_hierarchical_access(
    team, 
    ARRAY[sale_staff, marketing_staff, cskh, created_by], 
    NULL -- No email column in orders reliably known yet
  )
);

-- INSERT: Needs Edit Permission (Creation)
-- Usually users can insert their own data. RLS for INSERT with CHECK ensures they own it?
-- Or just check permission code.
CREATE POLICY "Matrix Insert Orders" ON public.orders FOR INSERT
WITH CHECK (
  has_permission(ARRAY[
    'SALE_NEW_ORDER', 'CSKH_NEW_ORDER', 'RND_NEW_ORDER', 'ORDERS_NEW'
  ], 'edit')
);

-- UPDATE: Needs (Edit Permission) AND (Hierarchical Access)
CREATE POLICY "Matrix Update Orders" ON public.orders FOR UPDATE
USING (
  has_permission(ARRAY[
    'SALE_ORDERS', 'SALE_INPUT', 
    'ORDERS_LIST', 'ORDERS_UPDATE', 'ORDERS_FFM',
    'CSKH_LIST', 'CSKH_INPUT',
    'MKT_ORDERS',
    'RND_ORDERS'
  ], 'edit')
  AND
  check_hierarchical_access(
    team, 
    ARRAY[sale_staff, marketing_staff, cskh, created_by], 
    NULL
  )
);

-- DELETE: Needs (Delete Permission) AND (Hierarchical Access)
CREATE POLICY "Matrix Delete Orders" ON public.orders FOR DELETE
USING (
  has_permission(ARRAY[
    'SALE_NEW_ORDER',
    'SALE_ORDERS',
    'CSKH_NEW_ORDER',
    'RND_NEW_ORDER'
  ], 'delete')
  AND
  check_hierarchical_access(
    team, 
    ARRAY[sale_staff, marketing_staff, cskh, created_by], 
    NULL
  )
);

-- ==============================================================================
-- 3. Apply RLS to `detail_reports` (Marketing/R&D Reports)
-- Maps to: MKT, RND
-- ==============================================================================

ALTER TABLE public.detail_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access" ON public.detail_reports;
DROP POLICY IF EXISTS "Allow all read access" ON public.detail_reports;
DROP POLICY IF EXISTS "Allow all insert" ON public.detail_reports;
DROP POLICY IF EXISTS "Allow all update" ON public.detail_reports;
DROP POLICY IF EXISTS "Allow all delete" ON public.detail_reports;
DROP POLICY IF EXISTS "Matrix View Reports" ON public.detail_reports;
DROP POLICY IF EXISTS "Matrix Insert Reports" ON public.detail_reports;
DROP POLICY IF EXISTS "Matrix Update Reports" ON public.detail_reports;
DROP POLICY IF EXISTS "Matrix Delete Reports" ON public.detail_reports;

-- SELECT
CREATE POLICY "Matrix View Reports" ON public.detail_reports FOR SELECT
USING (
  has_permission(ARRAY['MKT_VIEW', 'MKT_INPUT', 'MKT_MANUAL', 'RND_VIEW', 'RND_INPUT', 'RND_MANUAL', 'FINANCE_KPI'], 'view')
  AND
  check_hierarchical_access(
    "Team", -- Use "Team" column instead of department
    ARRAY["Tên"], 
    ARRAY[email]
  )
);

-- INSERT
CREATE POLICY "Matrix Insert Reports" ON public.detail_reports FOR INSERT
WITH CHECK (
  has_permission(ARRAY['MKT_INPUT', 'RND_INPUT'], 'edit')
);

-- UPDATE
CREATE POLICY "Matrix Update Reports" ON public.detail_reports FOR UPDATE
USING (
  has_permission(ARRAY['MKT_INPUT', 'RND_INPUT'], 'edit')
  AND
  check_hierarchical_access(department, ARRAY["Tên"], ARRAY[email])
);

-- DELETE
CREATE POLICY "Matrix Delete Reports" ON public.detail_reports FOR DELETE
USING (
  has_permission(ARRAY['MKT_INPUT', 'RND_INPUT'], 'delete')
  AND
  check_hierarchical_access(department, ARRAY["Tên"], ARRAY[email])
);

-- ==============================================================================
-- 4. Apply RLS to `marketing_pages`
-- Maps to: MKT_PAGES, RND_PAGES
-- ==============================================================================

ALTER TABLE public.marketing_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access" ON public.marketing_pages;
DROP POLICY IF EXISTS "Allow all read" ON public.marketing_pages;
DROP POLICY IF EXISTS "Allow all insert" ON public.marketing_pages;
DROP POLICY IF EXISTS "Allow all update" ON public.marketing_pages;
DROP POLICY IF EXISTS "Allow all delete" ON public.marketing_pages;
DROP POLICY IF EXISTS "Matrix View Pages" ON public.marketing_pages;
DROP POLICY IF EXISTS "Matrix Modify Pages" ON public.marketing_pages;
DROP POLICY IF EXISTS "Matrix Insert Update Pages" ON public.marketing_pages;
DROP POLICY IF EXISTS "Matrix Update Pages" ON public.marketing_pages;
DROP POLICY IF EXISTS "Matrix Delete Pages" ON public.marketing_pages;

-- SELECT
CREATE POLICY "Matrix View Pages" ON public.marketing_pages FOR SELECT
USING (
  has_permission(ARRAY['MKT_PAGES', 'RND_PAGES'], 'view')
  AND
  check_hierarchical_access(
    NULL, 
    ARRAY[mkt_staff], 
    NULL
  )
);

-- INSERT/UPDATE/DELETE handled by specific permissions, AND hierarchy
CREATE POLICY "Matrix Insert Update Pages" ON public.marketing_pages FOR INSERT
WITH CHECK ( has_permission(ARRAY['MKT_PAGES', 'RND_PAGES'], 'edit') );

CREATE POLICY "Matrix Update Pages" ON public.marketing_pages FOR UPDATE
USING (
  has_permission(ARRAY['MKT_PAGES', 'RND_PAGES'], 'edit')
  AND
  check_hierarchical_access(NULL, ARRAY[mkt_staff], NULL) -- Only owner or Admin
);

CREATE POLICY "Matrix Delete Pages" ON public.marketing_pages FOR DELETE
USING (
  has_permission(ARRAY['MKT_PAGES', 'RND_PAGES'], 'delete')
  AND
  check_hierarchical_access(NULL, ARRAY[mkt_staff], NULL)
);

-- ==============================================================================
-- 4b. Apply RLS to `rd_pages` (NEW)
-- Maps to: RND_PAGES
-- ==============================================================================

ALTER TABLE public.rd_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access" ON public.rd_pages;
DROP POLICY IF EXISTS "Allow all read" ON public.rd_pages;
DROP POLICY IF EXISTS "Allow all insert" ON public.rd_pages;
DROP POLICY IF EXISTS "Allow all update" ON public.rd_pages;
DROP POLICY IF EXISTS "Allow all delete" ON public.rd_pages;
DROP POLICY IF EXISTS "Matrix View RD Pages" ON public.rd_pages;
DROP POLICY IF EXISTS "Matrix Insert RD Pages" ON public.rd_pages;
DROP POLICY IF EXISTS "Matrix Update RD Pages" ON public.rd_pages;
DROP POLICY IF EXISTS "Matrix Delete RD Pages" ON public.rd_pages;

-- SELECT
CREATE POLICY "Matrix View RD Pages" ON public.rd_pages FOR SELECT
USING (
  has_permission(ARRAY['RND_PAGES'], 'view')
  AND
  check_hierarchical_access(
    NULL, 
    ARRAY[rd_staff], 
    NULL
  )
);

-- INSERT
CREATE POLICY "Matrix Insert RD Pages" ON public.rd_pages FOR INSERT
WITH CHECK ( has_permission(ARRAY['RND_PAGES'], 'edit') );

-- UPDATE
CREATE POLICY "Matrix Update RD Pages" ON public.rd_pages FOR UPDATE
USING (
  has_permission(ARRAY['RND_PAGES'], 'edit')
  AND
  check_hierarchical_access(NULL, ARRAY[rd_staff], NULL)
);

-- DELETE
CREATE POLICY "Matrix Delete RD Pages" ON public.rd_pages FOR DELETE
USING (
  has_permission(ARRAY['RND_PAGES'], 'delete')
  AND
  check_hierarchical_access(NULL, ARRAY[rd_staff], NULL)
);

-- ==============================================================================
-- 5. Apply RLS to `human_resources`
-- Maps to: HR_ACCESS
-- ==============================================================================

ALTER TABLE public.human_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access" ON public.human_resources;
DROP POLICY IF EXISTS "Allow all read access" ON public.human_resources;
DROP POLICY IF EXISTS "Allow all insert" ON public.human_resources;
DROP POLICY IF EXISTS "Allow all update" ON public.human_resources;
DROP POLICY IF EXISTS "Allow all delete" ON public.human_resources;
DROP POLICY IF EXISTS "Matrix View HR" ON public.human_resources;
DROP POLICY IF EXISTS "Matrix Modify HR" ON public.human_resources;

-- HR / Admin / Leader can view
CREATE POLICY "Matrix View HR" ON public.human_resources FOR SELECT
USING (
  has_permission(ARRAY['HR_LIST', 'HR_DASHBOARD'], 'view')
);

-- HR can modify
CREATE POLICY "Matrix Modify HR" ON public.human_resources FOR ALL
USING (
  has_permission(ARRAY['HR_LIST'], 'edit')
)
WITH CHECK (
  has_permission(ARRAY['HR_LIST'], 'edit')
);

-- ==============================================================================
-- 5b. Apply RLS to `users` table (Actual Employee List)
-- Maps to: HR_LIST (View), HR_LIST (Edit/Add/Delete)
-- ==============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access" ON public.users;
DROP POLICY IF EXISTS "Allow all read" ON public.users;
DROP POLICY IF EXISTS "Allow all modify" ON public.users;
DROP POLICY IF EXISTS "Matrix View Users" ON public.users;
DROP POLICY IF EXISTS "Matrix Modify Users" ON public.users;

-- VIEW
CREATE POLICY "Matrix View Users" ON public.users FOR SELECT
USING (
  has_permission(ARRAY['HR_LIST'], 'view') OR -- HR/Admin
  (auth.uid()::text = id) OR                  -- Self
  (role = 'leader')                           -- Leader
);

-- MODIFY: HR Only (and Admin)
CREATE POLICY "Matrix Modify Users" ON public.users FOR ALL
USING ( has_permission(ARRAY['HR_LIST'], 'edit') )
WITH CHECK ( has_permission(ARRAY['HR_LIST'], 'edit') );

-- ==============================================================================
-- 6. Apply RLS to `app_page_permissions` & `app_roles` (Protect the System itself)
-- Only Admin should modify these? Or Leader?
-- 'ADMIN_TOOLS' page covers this.
-- ==============================================================================

-- app_page_permissions
ALTER TABLE app_page_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated users to read page_permissions" ON app_page_permissions;
DROP POLICY IF EXISTS "Allow authenticated users to modify page_permissions" ON app_page_permissions;
DROP POLICY IF EXISTS "Allow all access" ON app_page_permissions;

DROP POLICY IF EXISTS "Read Permissions" ON app_page_permissions;
DROP POLICY IF EXISTS "Admin Modify Permissions" ON app_page_permissions;

CREATE POLICY "Read Permissions" ON app_page_permissions FOR SELECT
USING (true); -- Everyone needs to read to check their own perms (or UI rendering)

CREATE POLICY "Admin Modify Permissions" ON app_page_permissions FOR ALL
USING (
  has_permission(ARRAY['ADMIN_TOOLS'], 'edit')
)
WITH CHECK (
  has_permission(ARRAY['ADMIN_TOOLS'], 'edit')
);

-- app_roles
ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read Roles" ON app_roles;
DROP POLICY IF EXISTS "Admin Modify Roles" ON app_roles;

DROP POLICY IF EXISTS "Read Roles" ON app_roles;

CREATE POLICY "Read Roles" ON app_roles FOR SELECT USING (true);
CREATE POLICY "Admin Modify Roles" ON app_roles FOR ALL
USING ( has_permission(ARRAY['ADMIN_TOOLS'], 'edit') )
WITH CHECK ( has_permission(ARRAY['ADMIN_TOOLS'], 'edit') );

-- ==============================================================================
-- 7. Lock down Legacy/Unused Tables (app_permissions, app_user_roles)
-- To clear "UNRESTRICTED" warnings and prevent misuse.
-- ==============================================================================

-- app_permissions (Legacy)
ALTER TABLE app_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Legacy Read" ON app_permissions;
CREATE POLICY "Legacy Read" ON app_permissions FOR SELECT USING (has_permission(ARRAY['ADMIN_TOOLS'], 'view'));
-- No write access allowed effectively unless superuser

-- app_user_roles (Legacy - we use 'users' table now)
ALTER TABLE app_user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Legacy Read" ON app_user_roles;
CREATE POLICY "Legacy Read" ON app_user_roles FOR SELECT USING (has_permission(ARRAY['ADMIN_TOOLS'], 'view'));
