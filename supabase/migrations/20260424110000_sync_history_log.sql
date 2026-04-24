-- Lưu lịch sử thao tác đồng bộ trên trang /doi-soat-bill-cuoc
-- Dùng cho modal "Lịch sử" (fetch/insert từ bảng sync_history_log).

create table if not exists public.sync_history_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  performed_by text,
  sync_type text,
  mode_label text,
  total_input_rows integer,
  unique_orders_count integer,
  success_count integer,
  missing_count integer
);

create index if not exists sync_history_log_created_at_idx
  on public.sync_history_log (created_at desc);

create index if not exists sync_history_log_sync_type_idx
  on public.sync_history_log (sync_type);

alter table public.sync_history_log enable row level security;

drop policy if exists "sync_history_log_select_authenticated" on public.sync_history_log;
drop policy if exists "sync_history_log_insert_authenticated" on public.sync_history_log;
drop policy if exists "sync_history_log_update_authenticated" on public.sync_history_log;
drop policy if exists "sync_history_log_delete_authenticated" on public.sync_history_log;

create policy "sync_history_log_select_authenticated"
  on public.sync_history_log
  for select
  to authenticated
  using (true);

create policy "sync_history_log_insert_authenticated"
  on public.sync_history_log
  for insert
  to authenticated
  with check (true);

create policy "sync_history_log_update_authenticated"
  on public.sync_history_log
  for update
  to authenticated
  using (true)
  with check (true);

create policy "sync_history_log_delete_authenticated"
  on public.sync_history_log
  for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.sync_history_log to authenticated;
grant select, insert, update, delete on public.sync_history_log to service_role;

