-- order_code_hcm clone từ orders sớm; sau đó orders thêm order_count_actual (20260402160000)
-- nhưng HCM chưa có → PostgREST lỗi khi insert có cột đó.
do $$
begin
  if to_regclass('public.order_code_hcm') is not null then
    execute 'alter table public.order_code_hcm add column if not exists order_count_actual integer';
    execute
      'comment on column public.order_code_hcm.order_count_actual is '
      || quote_literal(
        'Khớp orders.order_count_actual — số bản ghi chitiet_cuoc gắn mã đơn (đối soát bill/cước).'
      );
  end if;
end $$;
