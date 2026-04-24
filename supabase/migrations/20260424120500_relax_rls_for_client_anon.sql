-- Fix 401/RLS cho client đang dùng role anon (không dùng Supabase Auth session)
-- Áp dụng cho các bảng đồng bộ/lịch sử dùng ở trang doi-soat-bill-cuoc.

-- =========================
-- bill_sync_results
-- =========================
alter table public.bill_sync_results enable row level security;

drop policy if exists "bill_sync_results_select_authenticated" on public.bill_sync_results;
drop policy if exists "bill_sync_results_insert_authenticated" on public.bill_sync_results;
drop policy if exists "bill_sync_results_update_authenticated" on public.bill_sync_results;
drop policy if exists "bill_sync_results_delete_authenticated" on public.bill_sync_results;
drop policy if exists "bill_sync_results_select_client" on public.bill_sync_results;
drop policy if exists "bill_sync_results_insert_client" on public.bill_sync_results;
drop policy if exists "bill_sync_results_update_client" on public.bill_sync_results;
drop policy if exists "bill_sync_results_delete_client" on public.bill_sync_results;

create policy "bill_sync_results_select_client"
  on public.bill_sync_results
  for select
  to anon, authenticated
  using (true);

create policy "bill_sync_results_insert_client"
  on public.bill_sync_results
  for insert
  to anon, authenticated
  with check (true);

create policy "bill_sync_results_update_client"
  on public.bill_sync_results
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "bill_sync_results_delete_client"
  on public.bill_sync_results
  for delete
  to anon, authenticated
  using (true);

grant select, insert, update, delete on public.bill_sync_results to anon;
grant select, insert, update, delete on public.bill_sync_results to authenticated;
grant select, insert, update, delete on public.bill_sync_results to service_role;

-- =========================
-- sync_history_log
-- =========================
alter table public.sync_history_log enable row level security;

drop policy if exists "sync_history_log_select_authenticated" on public.sync_history_log;
drop policy if exists "sync_history_log_insert_authenticated" on public.sync_history_log;
drop policy if exists "sync_history_log_update_authenticated" on public.sync_history_log;
drop policy if exists "sync_history_log_delete_authenticated" on public.sync_history_log;
drop policy if exists "sync_history_log_select_client" on public.sync_history_log;
drop policy if exists "sync_history_log_insert_client" on public.sync_history_log;
drop policy if exists "sync_history_log_update_client" on public.sync_history_log;
drop policy if exists "sync_history_log_delete_client" on public.sync_history_log;

create policy "sync_history_log_select_client"
  on public.sync_history_log
  for select
  to anon, authenticated
  using (true);

create policy "sync_history_log_insert_client"
  on public.sync_history_log
  for insert
  to anon, authenticated
  with check (true);

create policy "sync_history_log_update_client"
  on public.sync_history_log
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "sync_history_log_delete_client"
  on public.sync_history_log
  for delete
  to anon, authenticated
  using (true);

grant select, insert, update, delete on public.sync_history_log to anon;
grant select, insert, update, delete on public.sync_history_log to authenticated;
grant select, insert, update, delete on public.sync_history_log to service_role;

-- =========================
-- bill_uploaded_history
-- =========================
alter table public.bill_uploaded_history enable row level security;

drop policy if exists "bill_uploaded_history_select_authenticated" on public.bill_uploaded_history;
drop policy if exists "bill_uploaded_history_insert_authenticated" on public.bill_uploaded_history;
drop policy if exists "bill_uploaded_history_update_authenticated" on public.bill_uploaded_history;
drop policy if exists "bill_uploaded_history_delete_authenticated" on public.bill_uploaded_history;
drop policy if exists "bill_uploaded_history_select_client" on public.bill_uploaded_history;
drop policy if exists "bill_uploaded_history_insert_client" on public.bill_uploaded_history;
drop policy if exists "bill_uploaded_history_update_client" on public.bill_uploaded_history;
drop policy if exists "bill_uploaded_history_delete_client" on public.bill_uploaded_history;

create policy "bill_uploaded_history_select_client"
  on public.bill_uploaded_history
  for select
  to anon, authenticated
  using (true);

create policy "bill_uploaded_history_insert_client"
  on public.bill_uploaded_history
  for insert
  to anon, authenticated
  with check (true);

create policy "bill_uploaded_history_update_client"
  on public.bill_uploaded_history
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "bill_uploaded_history_delete_client"
  on public.bill_uploaded_history
  for delete
  to anon, authenticated
  using (true);

grant select, insert, update, delete on public.bill_uploaded_history to anon;
grant select, insert, update, delete on public.bill_uploaded_history to authenticated;
grant select, insert, update, delete on public.bill_uploaded_history to service_role;

-- =========================
-- cuoc_uploaded_history
-- =========================
alter table public.cuoc_uploaded_history enable row level security;

drop policy if exists "cuoc_uploaded_history_select_authenticated" on public.cuoc_uploaded_history;
drop policy if exists "cuoc_uploaded_history_insert_authenticated" on public.cuoc_uploaded_history;
drop policy if exists "cuoc_uploaded_history_update_authenticated" on public.cuoc_uploaded_history;
drop policy if exists "cuoc_uploaded_history_delete_authenticated" on public.cuoc_uploaded_history;
drop policy if exists "cuoc_uploaded_history_select_client" on public.cuoc_uploaded_history;
drop policy if exists "cuoc_uploaded_history_insert_client" on public.cuoc_uploaded_history;
drop policy if exists "cuoc_uploaded_history_update_client" on public.cuoc_uploaded_history;
drop policy if exists "cuoc_uploaded_history_delete_client" on public.cuoc_uploaded_history;

create policy "cuoc_uploaded_history_select_client"
  on public.cuoc_uploaded_history
  for select
  to anon, authenticated
  using (true);

create policy "cuoc_uploaded_history_insert_client"
  on public.cuoc_uploaded_history
  for insert
  to anon, authenticated
  with check (true);

create policy "cuoc_uploaded_history_update_client"
  on public.cuoc_uploaded_history
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "cuoc_uploaded_history_delete_client"
  on public.cuoc_uploaded_history
  for delete
  to anon, authenticated
  using (true);

grant select, insert, update, delete on public.cuoc_uploaded_history to anon;
grant select, insert, update, delete on public.cuoc_uploaded_history to authenticated;
grant select, insert, update, delete on public.cuoc_uploaded_history to service_role;

-- =========================
-- bảng tạm: cần delete sau sync
-- =========================
grant select, insert, update, delete on public.chi_tiet_bill_tien to anon;
grant select, insert, update, delete on public.chitiet_cuoc to anon;

