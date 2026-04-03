-- Tổng tiền header /van-don: SUM(total_amount_vnd) = 0 khi tiền nằm ở sale_price/goods_amount/tong_tien_vnd.
-- Cột generated khớp thứ tự ưu tiên hiển thị thực tế trên lưới.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'van_don_line_total_vnd'
  ) then
    return;
  end if;

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
  'Dùng cho SUM «Tổng tiền» header /van-don; coalesce(tong_tien_vnd, total_amount_vnd, sale_price, goods_amount).';

do $$
begin
  if to_regclass('public.order_code_hcm') is null then
    return;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_code_hcm'
      and column_name = 'van_don_line_total_vnd'
  ) then
    return;
  end if;

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
