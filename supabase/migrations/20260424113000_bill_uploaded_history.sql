-- Lưu lịch sử dữ liệu Bill đã đồng bộ từ bảng tạm chi_tiet_bill_tien
-- Mỗi lần đồng bộ tạo một "đợt" để lọc/truy vết dễ hơn.

create table if not exists public.bill_uploaded_history (
  id uuid primary key default gen_random_uuid(),
  sync_batch_id uuid not null,
  sync_batch_label text not null,
  synced_at timestamptz not null default now(),
  performed_by text,
  source_row jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists bill_uploaded_history_sync_batch_id_idx
  on public.bill_uploaded_history (sync_batch_id desc);

create index if not exists bill_uploaded_history_synced_at_idx
  on public.bill_uploaded_history (synced_at desc);

create index if not exists bill_uploaded_history_sync_batch_label_idx
  on public.bill_uploaded_history (sync_batch_label);

alter table public.bill_uploaded_history enable row level security;

drop policy if exists "bill_uploaded_history_select_authenticated" on public.bill_uploaded_history;
drop policy if exists "bill_uploaded_history_insert_authenticated" on public.bill_uploaded_history;
drop policy if exists "bill_uploaded_history_update_authenticated" on public.bill_uploaded_history;
drop policy if exists "bill_uploaded_history_delete_authenticated" on public.bill_uploaded_history;

create policy "bill_uploaded_history_select_authenticated"
  on public.bill_uploaded_history
  for select
  to authenticated
  using (true);

create policy "bill_uploaded_history_insert_authenticated"
  on public.bill_uploaded_history
  for insert
  to authenticated
  with check (true);

create policy "bill_uploaded_history_update_authenticated"
  on public.bill_uploaded_history
  for update
  to authenticated
  using (true)
  with check (true);

create policy "bill_uploaded_history_delete_authenticated"
  on public.bill_uploaded_history
  for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.bill_uploaded_history to authenticated;
grant select, insert, update, delete on public.bill_uploaded_history to service_role;

