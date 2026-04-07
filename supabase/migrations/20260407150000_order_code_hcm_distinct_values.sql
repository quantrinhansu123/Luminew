-- Distinct đầy đủ cho bộ lọc /van-don-hcm (order_code_hcm).
-- Tránh .limit(10000) trên bảng — chỉ lấy 10k dòng ngẫu nhiên → thiếu product/country.

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

COMMENT ON FUNCTION public.get_order_code_hcm_distinct_values(text) IS
  'Distinct (trim) trên public.order_code_hcm — bộ lọc MultiSelect trang /van-don-hcm.';

GRANT EXECUTE ON FUNCTION public.get_order_code_hcm_distinct_values(text) TO authenticated;
