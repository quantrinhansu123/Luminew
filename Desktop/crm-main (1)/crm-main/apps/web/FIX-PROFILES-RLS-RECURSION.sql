-- Fix: infinite recursion detected in policy for relation "profiles"
-- Run in Supabase SQL Editor.
--
-- Cause: a RLS policy (or helper function used by it) queries `public.profiles`,
-- which triggers RLS again and causes recursion.
--
-- This script:
-- 1) Drops ALL existing policies on public.profiles
-- 2) Disables RLS on public.profiles (matches this app's "direct frontend access" approach)
-- 3) Reloads PostgREST schema cache

do $$
declare
  pol record;
begin
  if to_regclass('public.profiles') is null then
    raise notice 'public.profiles does not exist, nothing to fix';
    return;
  end if;

  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;

  alter table public.profiles disable row level security;
end $$;

-- Reload PostgREST schema cache (so API stops using stale policy/schema)
notify pgrst, 'reload schema';

