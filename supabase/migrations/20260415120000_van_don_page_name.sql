-- Tên Page (page_name) cho /van-don: cột orders + order_code_hcm, view van_don_page, distinct RPC.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS page_name text;

DO $$
BEGIN
  IF to_regclass('public.order_code_hcm') IS NOT NULL THEN
    ALTER TABLE public.order_code_hcm ADD COLUMN IF NOT EXISTS page_name text;
  END IF;
END $$;

COMMENT ON COLUMN public.orders.page_name IS 'Tên fanpage / page (Facebook…) — lọc trang vận đơn.';

DROP VIEW IF EXISTS public.van_don_page CASCADE;

CREATE OR REPLACE VIEW public.van_don_page AS
SELECT
  order_code,
  customer_name,
  customer_phone,
  customer_address,
  city,
  state,
  country,
  zipcode,
  product,
  total_amount_vnd,
  payment_method,
  payment_method_text,
  tracking_code,
  shipping_fee,
  marketing_staff,
  sale_staff,
  page_name,
  team,
  delivery_staff,
  delivery_status,
  payment_status,
  note,
  reason,
  order_date,
  sale_price,
  goods_amount,
  shipping_unit,
  accountant_confirm,
  created_at,
  ngaydonghang,
  check_result,
  vandon_note,
  product_name_1,
  quantity_1,
  product_name_2,
  quantity_2,
  gift,
  gift_item,
  gift_quantity,
  gift_qty,
  delivery_status_nb,
  payment_currency,
  estimated_delivery_date,
  thoigiangiaohangffm,
  warehouse_fee,
  luu_kho_usd,
  note_caps,
  accounting_check_date,
  tracking_check_date,
  reconciled_amount,
  payment_bill,
  payment_image,
  ngayupbill,
  reconciled_vnd,
  cskh_status,
  log,
  canh_bao
FROM public.orders;

COMMENT ON VIEW public.van_don_page IS
  'Nhân bản tập cột dùng cho trang /van-don. Khớp api.js VAN_DON_SELECT_QUERY + log, canh_bao, page_name.';

GRANT SELECT ON public.van_don_page TO authenticated;

CREATE OR REPLACE FUNCTION public.get_orders_distinct_values(p_column text)
RETURNS TABLE (val text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY[
    'country',
    'product',
    'sale_staff',
    'marketing_staff',
    'page_name',
    'delivery_staff',
    'shipping_unit',
    'delivery_status',
    'delivery_status_nb',
    'payment_status',
    'check_result',
    'vandon_note',
    'note_caps',
    'payment_bill',
    'cskh_status'
  ];
BEGIN
  IF p_column IS NULL OR trim(p_column) = '' THEN
    RAISE EXCEPTION 'get_orders_distinct_values: empty column';
  END IF;

  IF NOT (p_column = ANY (allowed)) THEN
    RAISE EXCEPTION 'get_orders_distinct_values: column not allowed: %', p_column;
  END IF;

  RETURN QUERY EXECUTE format(
    $q$
      SELECT DISTINCT trim(both from t.%I::text) AS val
      FROM public.van_don_page t
      WHERE t.%I IS NOT NULL
        AND trim(both from t.%I::text) <> ''
      ORDER BY 1
    $q$,
    p_column,
    p_column,
    p_column
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_order_code_hcm_distinct_values(p_column text)
RETURNS TABLE (val text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY[
    'country',
    'product',
    'sale_staff',
    'marketing_staff',
    'page_name',
    'delivery_staff',
    'shipping_unit',
    'delivery_status',
    'delivery_status_nb',
    'payment_status',
    'check_result',
    'vandon_note',
    'note_caps',
    'payment_bill',
    'cskh_status'
  ];
BEGIN
  IF to_regclass('public.order_code_hcm') IS NULL THEN
    RETURN;
  END IF;

  IF p_column IS NULL OR trim(p_column) = '' THEN
    RAISE EXCEPTION 'get_order_code_hcm_distinct_values: empty column';
  END IF;

  IF NOT (p_column = ANY (allowed)) THEN
    RAISE EXCEPTION 'get_order_code_hcm_distinct_values: column not allowed: %', p_column;
  END IF;

  RETURN QUERY EXECUTE format(
    $q$
      SELECT DISTINCT trim(both from t.%I::text) AS val
      FROM public.order_code_hcm t
      WHERE t.%I IS NOT NULL
        AND trim(both from t.%I::text) <> ''
      ORDER BY 1
    $q$,
    p_column,
    p_column,
    p_column
  );
END;
$$;
