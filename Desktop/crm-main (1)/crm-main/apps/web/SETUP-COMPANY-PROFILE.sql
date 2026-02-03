-- ============================================
-- SETUP COMPANY PROFILE (THÔNG TIN CÔNG TY) + LOGO STORAGE
-- ============================================
-- Run this in Supabase SQL Editor.
-- This script:
-- 1) Creates table public.company_profile (singleton row id=1)
-- 2) Enables RLS + allows anon CRUD (same style as current app)
-- 3) Creates storage bucket 'company-assets' (public) for logo
-- 4) Adds RLS policies for storage.objects on bucket 'company-assets'
-- ============================================

-- 1) Table: company_profile (singleton)
create table if not exists public.company_profile (
  id smallint primary key,
  company_name text not null default '',
  representative_name text null,
  representative_title text null,
  address text null,
  phone text null,
  email text null,
  tax_code text null,
  website text null,

  -- Store logo reference (prefer bucket/object path; url is optional convenience)
  logo_path text null, -- ex: company-assets/logo.png  (or company-assets/<uuid>.png)
  logo_url text null,  -- optional (public URL)

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure singleton row exists (id=1)
insert into public.company_profile (id)
values (1)
on conflict (id) do nothing;

-- If the table existed before (older schema), add missing columns.
alter table public.company_profile
  add column if not exists representative_name text;

alter table public.company_profile
  add column if not exists representative_title text;

-- Keep updated_at in sync (reuse existing function if present)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_company_profile_updated_at on public.company_profile;
create trigger trg_company_profile_updated_at
before update on public.company_profile
for each row execute function public.set_updated_at();

-- RLS: allow anon access (matches current app style)
alter table public.company_profile enable row level security;
drop policy if exists "Allow anonymous access" on public.company_profile;
create policy "Allow anonymous access"
on public.company_profile
for all
using (true)
with check (true);

-- 2) Storage bucket for company assets (logo)
insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do update set public = true;

-- Storage RLS policies (anon CRUD on bucket 'company-assets')
drop policy if exists "Public read company assets" on storage.objects;
create policy "Public read company assets"
on storage.objects
for select
using (bucket_id = 'company-assets');

drop policy if exists "Anon insert company assets" on storage.objects;
create policy "Anon insert company assets"
on storage.objects
for insert
with check (bucket_id = 'company-assets');

drop policy if exists "Anon update company assets" on storage.objects;
create policy "Anon update company assets"
on storage.objects
for update
using (bucket_id = 'company-assets')
with check (bucket_id = 'company-assets');

drop policy if exists "Anon delete company assets" on storage.objects;
create policy "Anon delete company assets"
on storage.objects
for delete
using (bucket_id = 'company-assets');

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

