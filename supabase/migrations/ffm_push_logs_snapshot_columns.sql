-- Snapshot từ đơn khi chuẩn bị đẩy FFM (tab Đẩy đơn Hà Nội) + thời điểm xác nhận đẩy
alter table public.ffm_push_logs add column if not exists product text;
alter table public.ffm_push_logs add column if not exists country text;
alter table public.ffm_push_logs add column if not exists chi_nhanh text;
alter table public.ffm_push_logs add column if not exists total_amount_vnd numeric;
alter table public.ffm_push_logs add column if not exists pushed_at timestamptz;

comment on column public.ffm_push_logs.product is 'Mặt hàng (snapshot)';
comment on column public.ffm_push_logs.country is 'Thị trường / Khu vực (snapshot)';
comment on column public.ffm_push_logs.chi_nhanh is 'Chi nhánh / Team (snapshot)';
comment on column public.ffm_push_logs.total_amount_vnd is 'Tổng tiền VNĐ (snapshot)';
comment on column public.ffm_push_logs.pushed_at is 'Ghi khi xác nhận đẩy (confirmed)';
