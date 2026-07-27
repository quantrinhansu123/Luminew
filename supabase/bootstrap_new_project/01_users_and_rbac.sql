-- =============================================================================
-- LUMI OMS — Bootstrap Supabase MỚI: users + RBAC
-- Chạy trên SQL Editor của project trống (Supabase Dashboard).
-- Idempotent: chạy lại an toàn.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) public.users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  username text,
  user_name text,
  name text,
  password text,
  role text NOT NULL DEFAULT 'user',
  team text,
  branch text,
  department text,
  position text,
  shift text,
  selected_personnel jsonb NOT NULL DEFAULT '[]'::jsonb,
  leader_teams jsonb NOT NULL DEFAULT '[]'::jsonb,
  can_day_ffm boolean NOT NULL DEFAULT false,
  id_appsheet text,
  avatar_url text,
  dob date,
  official_date date,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_selected_personnel_is_array CHECK (jsonb_typeof(selected_personnel) = 'array'),
  CONSTRAINT users_leader_teams_is_array CHECK (jsonb_typeof(leader_teams) = 'array')
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS user_name text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS password text,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS team text,
  ADD COLUMN IF NOT EXISTS branch text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS shift text,
  ADD COLUMN IF NOT EXISTS selected_personnel jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS leader_teams jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS can_day_ffm boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS id_appsheet text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS official_date date,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON public.users (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON public.users ((lower(email)));
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);
CREATE INDEX IF NOT EXISTS idx_users_team ON public.users (team);
CREATE INDEX IF NOT EXISTS idx_users_branch ON public.users (branch);
CREATE INDEX IF NOT EXISTS idx_users_department ON public.users (department);
CREATE INDEX IF NOT EXISTS idx_users_position ON public.users (position);

CREATE OR REPLACE FUNCTION public.update_users_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_users_updated_at ON public.users;
CREATE TRIGGER trigger_update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_users_updated_at();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to users" ON public.users;
CREATE POLICY "Allow all access to users"
  ON public.users
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) RBAC (roles / permissions / page permissions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_roles (
  code text PRIMARY KEY,
  name text NOT NULL,
  department text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_permissions (
  role_code text NOT NULL REFERENCES public.app_roles(code) ON DELETE CASCADE,
  resource_code text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  allowed_columns jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, resource_code)
);

CREATE TABLE IF NOT EXISTS public.app_page_permissions (
  role_code text NOT NULL REFERENCES public.app_roles(code) ON DELETE CASCADE,
  page_code text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  allowed_columns jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, page_code)
);

CREATE TABLE IF NOT EXISTS public.app_user_roles (
  email text PRIMARY KEY,
  role_code text NOT NULL REFERENCES public.app_roles(code) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_permissions_resource_code
  ON public.app_permissions (resource_code);

CREATE INDEX IF NOT EXISTS idx_app_page_permissions_page_code
  ON public.app_page_permissions (page_code);

CREATE OR REPLACE FUNCTION public.update_rbac_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_app_roles_updated_at ON public.app_roles;
CREATE TRIGGER trigger_update_app_roles_updated_at
  BEFORE UPDATE ON public.app_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_rbac_updated_at();

DROP TRIGGER IF EXISTS trigger_update_app_permissions_updated_at ON public.app_permissions;
CREATE TRIGGER trigger_update_app_permissions_updated_at
  BEFORE UPDATE ON public.app_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_rbac_updated_at();

DROP TRIGGER IF EXISTS trigger_update_app_page_permissions_updated_at ON public.app_page_permissions;
CREATE TRIGGER trigger_update_app_page_permissions_updated_at
  BEFORE UPDATE ON public.app_page_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_rbac_updated_at();

INSERT INTO public.app_roles (code, name, department)
VALUES
  ('user', 'User', 'General'),
  ('leader', 'Leader', 'General'),
  ('admin', 'Admin', 'General'),
  ('super_admin', 'Super Admin', 'General')
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  department = COALESCE(public.app_roles.department, EXCLUDED.department),
  updated_at = now();

ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_page_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to app_roles" ON public.app_roles;
CREATE POLICY "Allow all access to app_roles"
  ON public.app_roles
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to app_permissions" ON public.app_permissions;
CREATE POLICY "Allow all access to app_permissions"
  ON public.app_permissions
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to app_page_permissions" ON public.app_page_permissions;
CREATE POLICY "Allow all access to app_page_permissions"
  ON public.app_page_permissions
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to app_user_roles" ON public.app_user_roles;
CREATE POLICY "Allow all access to app_user_roles"
  ON public.app_user_roles
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_roles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_permissions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_page_permissions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_roles TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) Seed admin (đổi mật khẩu sau khi login)
-- email: admin@example.com
-- password: admin123  (bcrypt)
-- -----------------------------------------------------------------------------
INSERT INTO public.users (
  email,
  username,
  user_name,
  name,
  password,
  role,
  team,
  branch,
  department,
  selected_personnel,
  leader_teams,
  can_day_ffm,
  created_by
)
VALUES (
  'admin@example.com',
  'admin',
  'admin',
  'Admin',
  '$2b$10$5LCV8KYgtgaNcVBQMMkIw.btGRKhfMz0c9HU7olRbVm4DjKwpnesW',
  'super_admin',
  'Admin',
  'Hà Nội',
  'Admin',
  '[]'::jsonb,
  '[]'::jsonb,
  true,
  'bootstrap'
)
ON CONFLICT (email) DO UPDATE
SET
  password = EXCLUDED.password,
  role = 'super_admin',
  name = COALESCE(public.users.name, EXCLUDED.name),
  updated_at = now();

INSERT INTO public.app_user_roles (email, role_code)
VALUES ('admin@example.com', 'super_admin')
ON CONFLICT (email) DO UPDATE
SET role_code = EXCLUDED.role_code;

-- Quyền trang tối thiểu cho super_admin (có thể bổ sung trong Admin Tools)
INSERT INTO public.app_page_permissions (role_code, page_code, can_view, can_edit, can_delete)
VALUES
  ('super_admin', 'DASHBOARD_QUAN_TRI', true, true, true),
  ('super_admin', 'MKT_VIEW', true, true, true),
  ('super_admin', 'MKT_VIEW_HCM', true, true, true),
  ('super_admin', 'SALE_VIEW', true, true, true),
  ('super_admin', 'CSKH_LIST', true, true, true),
  ('super_admin', 'ADMIN_TOOLS', true, true, true)
ON CONFLICT (role_code, page_code) DO UPDATE
SET
  can_view = true,
  can_edit = true,
  can_delete = true,
  updated_at = now();
