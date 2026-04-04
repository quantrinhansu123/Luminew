-- =============================================================================
-- CHẠY THỦ CÔNG trong Supabase Dashboard → SQL Editor (không nằm trong migrations).
--
-- Việc làm:
--   1) INSERT vào public.orders từ public.order_code_hcm
--      với sale_staff = 'Đặng Trinh Đức Anh' (khớp đúng chuỗi trong DB).
--      Bỏ qua cột id của HCM (orders tự sinh id / giữ id khi UPDATE conflict).
--   2) ON CONFLICT (order_code) DO UPDATE — ghi đè các cột chung (trừ id, order_code).
--   3) DELETE mọi dòng order_code_hcm có cùng sale_staff (đã chuyển xong).
--
-- Điều kiện: bảng orders có ràng buộc UNIQUE (hoặc PK) trên order_code.
-- Nếu lỗi conflict: kiểm tra tên constraint / index trên order_code.
--
-- Sao lưu DB trước khi chạy.
-- =============================================================================

DO $$
DECLARE
  sale_name constant text := 'Đặng Trinh Đức Anh';
  insert_cols text;
  update_set text;
  stmt text;
BEGIN
  IF to_regclass('public.orders') IS NULL OR to_regclass('public.order_code_hcm') IS NULL THEN
    RAISE EXCEPTION 'Thiếu bảng public.orders hoặc public.order_code_hcm';
  END IF;

  -- Cột có trên cả hai bảng, trừ id (không lấy id từ HCM).
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
  INTO insert_cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'orders'
    AND c.column_name <> 'id'
    AND COALESCE(c.is_generated, 'NEVER') <> 'ALWAYS'
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns h
      WHERE h.table_schema = 'public'
        AND h.table_name = 'order_code_hcm'
        AND h.column_name = c.column_name
    );

  IF insert_cols IS NULL OR btrim(insert_cols) = '' THEN
    RAISE EXCEPTION 'Không tìm thấy cột chung (ngoại trừ id) giữa orders và order_code_hcm';
  END IF;

  SELECT string_agg(
    quote_ident(c.column_name) || ' = EXCLUDED.' || quote_ident(c.column_name),
    ', ' ORDER BY c.ordinal_position
  )
  INTO update_set
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'orders'
    AND c.column_name NOT IN ('id', 'order_code')
    AND COALESCE(c.is_generated, 'NEVER') <> 'ALWAYS'
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns h
      WHERE h.table_schema = 'public'
        AND h.table_name = 'order_code_hcm'
        AND h.column_name = c.column_name
    );

  IF update_set IS NULL OR btrim(update_set) = '' THEN
    update_set := quote_ident('order_code') || ' = EXCLUDED.' || quote_ident('order_code');
  END IF;

  stmt := format(
    $f$
    INSERT INTO public.orders (%1$s)
    SELECT DISTINCT ON (h.order_code) %1$s
    FROM public.order_code_hcm h
    WHERE h.sale_staff = %2$L
      AND h.order_code IS NOT NULL
      AND btrim(h.order_code::text) <> ''
    ORDER BY h.order_code, h.id DESC NULLS LAST
    ON CONFLICT (order_code) DO UPDATE SET %3$s
    $f$,
    insert_cols,
    sale_name,
    update_set
  );

  RAISE NOTICE '%', stmt;
  EXECUTE stmt;

  DELETE FROM public.order_code_hcm h
  WHERE h.sale_staff = sale_name;

  RAISE NOTICE 'Xong: upsert orders + delete order_code_hcm cho sale_staff = %', sale_name;
END $$;
