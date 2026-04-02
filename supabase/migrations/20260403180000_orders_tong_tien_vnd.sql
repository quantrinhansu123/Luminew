-- Tổng tiền VND riêng cho báo cáo (tab1 «Đơn có mã» / tab 5 DS). Chạy cả file: ADD COLUMN trước, rồi UPDATE.

alter table public.orders add column if not exists tong_tien_vnd numeric;

comment on column public.orders.tong_tien_vnd is 'Tổng tiền VND (báo cáo vận hành tab1 — cột Đơn có mã / Số tiền); ưu tiên hơn total_amount_vnd khi có.';

-- Điền ban đầu từ total_amount_vnd (chỉ khi tong_tien_vnd đang null).
update public.orders
set tong_tien_vnd = total_amount_vnd
where tong_tien_vnd is null
  and total_amount_vnd is not null;

do $$
begin
  if to_regclass('public.order_code_hcm') is not null then
    execute 'alter table public.order_code_hcm add column if not exists tong_tien_vnd numeric';
    execute
      'update public.order_code_hcm set tong_tien_vnd = total_amount_vnd where tong_tien_vnd is null and total_amount_vnd is not null';
  end if;
end $$;
