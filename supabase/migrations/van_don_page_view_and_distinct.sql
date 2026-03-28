-- View + RPC cho bộ lọc /van-don: distinct lấy từ cùng "khung" cột trang Vận đơn.
-- Đồng bộ cột với VAN_DON_PAGE_COLUMN_LIST / VAN_DON_SELECT_QUERY trong src/services/api.js

-- Bỏ WITH (security_invoker) nếu Postgres < 15; Supabase thường dùng PG15+ và có thể bật lại.
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
  note_caps,
  accounting_check_date,
  tracking_check_date,
  reconciled_amount,
  payment_bill,
  payment_image,
  ngayupbill,
  reconciled_vnd,
  cskh_status
FROM public.orders;

COMMENT ON VIEW public.van_don_page IS
  'Nhân bản tập cột dùng cho trang /van-don (Bill of Lading). Giữ khớp api.js VAN_DON_SELECT_QUERY + cskh_status.';

GRANT SELECT ON public.van_don_page TO authenticated;

-- Distinct cho MultiSelect: chỉ trên view (cùng phạm vi cột trang).
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

COMMENT ON FUNCTION public.get_orders_distinct_values(text) IS
  'Distinct (trim) trên public.van_don_page — khớp view trang /van-don.';

GRANT EXECUTE ON FUNCTION public.get_orders_distinct_values(text) TO authenticated;
