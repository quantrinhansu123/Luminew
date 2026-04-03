-- Đã tạo van_don_line_total_vnd với coalesce(tong_tien_vnd, ...) — tong_tien_vnd = 0 làm SUM luôn 0.
-- Tạo lại cột với nullif(tong_tien_vnd, 0) (giữ đơn có tong thật = 0 hiếm gặp).

alter table public.orders drop column if exists van_don_line_total_vnd;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'tong_tien_vnd'
  ) then
    execute $sql$
      alter table public.orders
      add column van_don_line_total_vnd numeric
      generated always as (
        coalesce(
          nullif(tong_tien_vnd, 0::numeric),
          total_amount_vnd,
          sale_price,
          goods_amount,
          0::numeric
        )
      ) stored
    $sql$;
  else
    execute $sql$
      alter table public.orders
      add column van_don_line_total_vnd numeric
      generated always as (
        coalesce(
          total_amount_vnd,
          sale_price,
          goods_amount,
          0::numeric
        )
      ) stored
    $sql$;
  end if;
end $$;

comment on column public.orders.van_don_line_total_vnd is
  'SUM header /van-don: coalesce(nullif(tong_tien_vnd,0), total_amount_vnd, sale_price, goods_amount).';

do $$
begin
  if to_regclass('public.order_code_hcm') is null then
    return;
  end if;

  execute 'alter table public.order_code_hcm drop column if exists van_don_line_total_vnd';

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_code_hcm'
      and column_name = 'tong_tien_vnd'
  ) then
    execute $sql$
      alter table public.order_code_hcm
      add column van_don_line_total_vnd numeric
      generated always as (
        coalesce(
          nullif(tong_tien_vnd, 0::numeric),
          total_amount_vnd,
          sale_price,
          goods_amount,
          0::numeric
        )
      ) stored
    $sql$;
  else
    execute $sql$
      alter table public.order_code_hcm
      add column van_don_line_total_vnd numeric
      generated always as (
        coalesce(
          total_amount_vnd,
          sale_price,
          goods_amount,
          0::numeric
        )
      ) stored
    $sql$;
  end if;
end $$;
