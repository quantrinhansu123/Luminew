-- Rebuild/normalize public.users so RBAC and employee management work consistently.
-- Safe to run multiple times (idempotent).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

UPDATE public.users
SET
  email = lower(trim(email)),
  username = COALESCE(NULLIF(trim(username), ''), split_part(lower(trim(email)), '@', 1)),
  user_name = COALESCE(NULLIF(trim(user_name), ''), NULLIF(trim(username), ''), split_part(lower(trim(email)), '@', 1)),
  role = COALESCE(NULLIF(trim(role), ''), 'user'),
  selected_personnel = COALESCE(selected_personnel, '[]'::jsonb),
  leader_teams = COALESCE(leader_teams, '[]'::jsonb),
  can_day_ffm = COALESCE(can_day_ffm, false),
  updated_at = COALESCE(updated_at, now()),
  created_at = COALESCE(created_at, now())
WHERE true;

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
