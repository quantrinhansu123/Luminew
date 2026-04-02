-- Log snapshot giá trị tổng hợp khi nhấn "Đồng bộ" trên trang /doi-soat-bill-cuoc
-- Mục tiêu: lưu lại shipping_cost / total_vnd / revenue_actual / order_count_actual theo từng lần sync.

create table if not exists public.bill_sync_results (
  id uuid primary key default gen_random_uuid(),
  sync_batch_id uuid not null,
  synced_at timestamptz not null default now(),
  order_code text not null,

  shipping_cost numeric,
  total_vnd numeric,
  revenue_actual numeric,
  order_count_actual integer,

  -- Ghi chú bổ sung nếu cần (ví dụ: source file / tab / user)
  note text,

  created_at timestamptz not null default now()
);

create index if not exists bill_sync_results_sync_batch_id_idx
  on public.bill_sync_results (sync_batch_id desc);

create index if not exists bill_sync_results_synced_at_idx
  on public.bill_sync_results (synced_at desc);

-- Truy vấn nhanh theo order
create index if not exists bill_sync_results_order_code_idx
  on public.bill_sync_results (order_code);

alter table public.bill_sync_results enable row level security;

-- Policy theo RBAC hiện có trong project: cho role authenticated quyền select/insert/update/delete
drop policy if exists "bill_sync_results_select_authenticated" on public.bill_sync_results;
drop policy if exists "bill_sync_results_insert_authenticated" on public.bill_sync_results;
drop policy if exists "bill_sync_results_update_authenticated" on public.bill_sync_results;
drop policy if exists "bill_sync_results_delete_authenticated" on public.bill_sync_results;

create policy "bill_sync_results_select_authenticated"
  on public.bill_sync_results
  for select
  to authenticated
  using (true);

create policy "bill_sync_results_insert_authenticated"
  on public.bill_sync_results
  for insert
  to authenticated
  with check (true);

create policy "bill_sync_results_update_authenticated"
  on public.bill_sync_results
  for update
  to authenticated
  using (true)
  with check (true);

create policy "bill_sync_results_delete_authenticated"
  on public.bill_sync_results
  for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.bill_sync_results to authenticated;
grant select, insert, update, delete on public.bill_sync_results to service_role;

