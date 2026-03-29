-- Bảng báo cáo vận đơn (tổng hợp theo ngày / nhân viên / sản phẩm / thị trường / trạng thái)
-- Chạy trong Supabase SQL Editor hoặc qua supabase db push / migration.

create table if not exists public.bao_cao_van_don (
  id uuid primary key default gen_random_uuid(),
  ngay date not null,
  nhan_vien text,
  san_pham text,
  thi_truong text,
  trang_thai_giao_hang text,
  ket_qua_check text,
  trang_thai_thanh_toan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bao_cao_van_don is 'Báo cáo vận đơn (snapshot / tổng hợp)';
comment on column public.bao_cao_van_don.ngay is 'Ngày báo cáo';
comment on column public.bao_cao_van_don.nhan_vien is 'Nhân viên (sale / mkt / vận đơn — tùy nghiệp vụ ghi)';
comment on column public.bao_cao_van_don.san_pham is 'Sản phẩm / mặt hàng';
comment on column public.bao_cao_van_don.thi_truong is 'Thị trường / khu vực';
comment on column public.bao_cao_van_don.trang_thai_giao_hang is 'Trạng thái giao hàng';
comment on column public.bao_cao_van_don.ket_qua_check is 'Kết quả check';
comment on column public.bao_cao_van_don.trang_thai_thanh_toan is 'Trạng thái thanh toán';

create index if not exists bao_cao_van_don_ngay_idx on public.bao_cao_van_don (ngay desc);
create index if not exists bao_cao_van_don_nhan_vien_ngay_idx on public.bao_cao_van_don (nhan_vien, ngay desc);

-- Cập nhật updated_at khi sửa dòng
create or replace function public.set_bao_cao_van_don_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_bao_cao_van_don_updated_at on public.bao_cao_van_don;
create trigger trg_bao_cao_van_don_updated_at
  before update on public.bao_cao_van_don
  for each row
  execute procedure public.set_bao_cao_van_don_updated_at();

alter table public.bao_cao_van_don enable row level security;

-- Điều chỉnh policy theo quy tắc RBAC của bạn (ví dụ chỉ role cụ thể).
drop policy if exists "bao_cao_van_don_select_authenticated" on public.bao_cao_van_don;
drop policy if exists "bao_cao_van_don_insert_authenticated" on public.bao_cao_van_don;
drop policy if exists "bao_cao_van_don_update_authenticated" on public.bao_cao_van_don;
drop policy if exists "bao_cao_van_don_delete_authenticated" on public.bao_cao_van_don;

create policy "bao_cao_van_don_select_authenticated"
  on public.bao_cao_van_don
  for select
  to authenticated
  using (true);

create policy "bao_cao_van_don_insert_authenticated"
  on public.bao_cao_van_don
  for insert
  to authenticated
  with check (true);

create policy "bao_cao_van_don_update_authenticated"
  on public.bao_cao_van_don
  for update
  to authenticated
  using (true)
  with check (true);

create policy "bao_cao_van_don_delete_authenticated"
  on public.bao_cao_van_don
  for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.bao_cao_van_don to authenticated;
grant select, insert, update, delete on public.bao_cao_van_don to service_role;
