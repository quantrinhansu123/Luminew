-- ============================================
-- SETUP LEAD TIMELINE EVENTS (LỊCH SỬ THAO TÁC)
-- ============================================
-- Run in Supabase SQL Editor.
-- This creates a generic event log for leads: assignments, status changes, quotations, interactions, etc.

create table if not exists public.lead_timeline_events (
  id bigserial primary key,
  lead_id bigint not null,
  event_type text not null, -- e.g. status_change, assignment, interaction, quotation_created, quotation_pdf_uploaded, converted, note_updated
  title text not null,
  description text null,
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_lead_timeline_events_lead_id on public.lead_timeline_events(lead_id);
create index if not exists idx_lead_timeline_events_occurred_at on public.lead_timeline_events(occurred_at desc);

-- Optional FK to leads when table exists (ignore mismatches)
do $$
begin
  if to_regclass('public.leads') is not null then
    begin
      alter table public.lead_timeline_events
        add constraint lead_timeline_events_lead_id_fkey
        foreign key (lead_id) references public.leads(id) on delete cascade;
    exception
      when duplicate_object then null;
      when others then null;
    end;
  end if;
end $$;

-- RLS: allow anon access (matches current app style)
alter table public.lead_timeline_events enable row level security;
drop policy if exists "Allow anonymous access" on public.lead_timeline_events;
create policy "Allow anonymous access"
on public.lead_timeline_events
for all
using (true)
with check (true);

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

