-- Fix: app_roles (va bang RBAC lien quan) thieu updated_at tren DB cu.
-- CREATE TABLE IF NOT EXISTS khong them cot neu bang da ton tai.

ALTER TABLE public.app_roles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.app_permissions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.app_page_permissions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Cot ip cho login info (neu chua co)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ip jsonb;
