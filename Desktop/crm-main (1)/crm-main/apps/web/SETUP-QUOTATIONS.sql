-- ============================================
-- SETUP QUOTATIONS (BÁO GIÁ) + STORAGE BUCKET
-- ============================================
-- Run this in Supabase SQL Editor.
-- This script:
-- 1) Creates table public.quotations (if missing)
-- 2) Creates storage bucket 'quotations' (public)
-- 3) Adds RLS policies to allow anon CRUD for this app
-- ============================================

-- 1) Table: quotations
create table if not exists public.quotations (
  id bigserial primary key,
  quotation_code text not null unique,
  -- Link to lead (optional). We keep it as bigint for compatibility.
  -- FK will be added later only if public.leads exists.
  lead_id bigint null,
  -- Link to customer (some schemas require it). FK will be added later only if public.customers exists.
  customer_id bigint null,

  customer_name text not null,
  phone text null,
  email text null,
  address text null,
  company_name text null,
  tax_code text null,

  subtotal numeric not null default 0,
  total_amount numeric not null default 0,
  items jsonb not null default '[]'::jsonb,
  notes text null,

  pdf_path text null,
  pdf_url text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If the table existed before (without lead_id), add it.
alter table public.quotations
  add column if not exists lead_id bigint;

-- If the table existed before (without customer_id), add it.
alter table public.quotations
  add column if not exists customer_id bigint;

-- If the table existed before (older schema), add missing business columns.
alter table public.quotations
  add column if not exists customer_name text not null default '';

alter table public.quotations
  add column if not exists phone text;

alter table public.quotations
  add column if not exists email text;

alter table public.quotations
  add column if not exists address text;

alter table public.quotations
  add column if not exists company_name text;

alter table public.quotations
  add column if not exists tax_code text;

alter table public.quotations
  add column if not exists subtotal numeric not null default 0;

alter table public.quotations
  add column if not exists total_amount numeric not null default 0;

alter table public.quotations
  add column if not exists items jsonb not null default '[]'::jsonb;

alter table public.quotations
  add column if not exists notes text;

-- If the table existed before (without pdf columns), add them.
alter table public.quotations
  add column if not exists pdf_path text;

alter table public.quotations
  add column if not exists pdf_url text;

-- Optional: add FK only when leads table exists (ignore if mismatched).
do $$
begin
  if to_regclass('public.leads') is not null then
    begin
      alter table public.quotations
        add constraint quotations_lead_id_fkey
        foreign key (lead_id) references public.leads(id) on delete set null;
    exception
      when duplicate_object then
        null;
      when others then
        -- Ignore FK failures (type mismatch / missing column) so setup can proceed.
        null;
    end;
  end if;
end $$;

-- Optional: add FK only when customers table exists (ignore if mismatched).
do $$
begin
  if to_regclass('public.customers') is not null then
    begin
      alter table public.quotations
        add constraint quotations_customer_id_fkey
        foreign key (customer_id) references public.customers(id) on delete set null;
    exception
      when duplicate_object then
        null;
      when others then
        null;
    end;
  end if;
end $$;

create index if not exists idx_quotations_lead_id on public.quotations(lead_id);
create index if not exists idx_quotations_customer_id on public.quotations(customer_id);
create index if not exists idx_quotations_created_at on public.quotations(created_at desc);

-- Keep updated_at in sync
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_quotations_updated_at on public.quotations;
create trigger trg_quotations_updated_at
before update on public.quotations
for each row execute function public.set_updated_at();

-- 2) RLS for quotations (anon access)
alter table public.quotations enable row level security;
drop policy if exists "Allow anonymous access" on public.quotations;
create policy "Allow anonymous access"
on public.quotations
for all
using (true)
with check (true);

-- 3) Storage bucket for PDF quotations
-- Create bucket if missing
insert into storage.buckets (id, name, public)
values ('quotations', 'quotations', true)
on conflict (id) do update set public = true;

-- Storage RLS policies (anon CRUD on bucket 'quotations')
drop policy if exists "Public read quotations" on storage.objects;
create policy "Public read quotations"
on storage.objects
for select
using (bucket_id = 'quotations');

drop policy if exists "Anon insert quotations" on storage.objects;
create policy "Anon insert quotations"
on storage.objects
for insert
with check (bucket_id = 'quotations');

drop policy if exists "Anon update quotations" on storage.objects;
create policy "Anon update quotations"
on storage.objects
for update
using (bucket_id = 'quotations')
with check (bucket_id = 'quotations');

drop policy if exists "Anon delete quotations" on storage.objects;
create policy "Anon delete quotations"
on storage.objects
for delete
using (bucket_id = 'quotations');

-- Reload PostgREST schema cache (important after creating/altering tables)
notify pgrst, 'reload schema';

