-- Create RBAC tables used by AdminTools/PermissionManager.
-- Idempotent migration: safe to run multiple times.

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

-- Optional legacy compatibility table (some environments still reference this name)
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
