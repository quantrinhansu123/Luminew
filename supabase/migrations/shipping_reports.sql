-- Lịch sử / báo cáo giao hàng–vận đơn (đọc trên trang Quản lý vận đơn)
create table if not exists public.shipping_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_code text,
  ngay date,
  nhan_vien text,
  san_pham text,
  thi_truong text,
  trang_thai_giao_hang text,
  ket_qua_check text,
  trang_thai_thanh_toan text,
  ghi_chu text,
  updated_at timestamptz not null default now()
);

comment on table public.shipping_reports is 'Lịch sử báo cáo vận đơn / giao hàng (snapshot hoặc dòng tổng hợp)';
comment on column public.shipping_reports.order_code is 'Mã đơn hàng (nếu gắn với một đơn cụ thể)';

create index if not exists shipping_reports_created_at_idx on public.shipping_reports (created_at desc);
create index if not exists shipping_reports_order_code_idx on public.shipping_reports (order_code);

create or replace function public.set_shipping_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_shipping_reports_updated_at on public.shipping_reports;
create trigger trg_shipping_reports_updated_at
  before update on public.shipping_reports
  for each row
  execute procedure public.set_shipping_reports_updated_at();

alter table public.shipping_reports enable row level security;

drop policy if exists "shipping_reports_select_authenticated" on public.shipping_reports;
drop policy if exists "shipping_reports_insert_authenticated" on public.shipping_reports;
drop policy if exists "shipping_reports_update_authenticated" on public.shipping_reports;
drop policy if exists "shipping_reports_delete_authenticated" on public.shipping_reports;

create policy "shipping_reports_select_authenticated"
  on public.shipping_reports
  for select
  to authenticated
  using (true);

create policy "shipping_reports_insert_authenticated"
  on public.shipping_reports
  for insert
  to authenticated
  with check (true);

create policy "shipping_reports_update_authenticated"
  on public.shipping_reports
  for update
  to authenticated
  using (true)
  with check (true);

create policy "shipping_reports_delete_authenticated"
  on public.shipping_reports
  for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.shipping_reports to authenticated;
grant select, insert, update, delete on public.shipping_reports to service_role;
