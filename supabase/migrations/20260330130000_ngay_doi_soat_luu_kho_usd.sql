-- Đúng mapping: luu_kho_usd = Ngày đối soát kế toán (text), warehouse_fee = Phí xử lý lưu kho USD (numeric).
-- Chạy sau 20260330120000. Hoán đổi dữ liệu: chuỗi từ warehouse_fee → luu_kho_usd; số từ luu_kho_usd → warehouse_fee.
-- Idempotent: bỏ qua nếu warehouse_fee đã numeric (đã swap).

-- Trường hợp bạn chạy migration này trước 20260330120000:
-- - luu_kho_usd có thể chưa tồn tại, nhưng phần CREATE VIEW bên dưới vẫn cần cột đó.
-- - Tạo cột trước để tránh lỗi 42703.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS luu_kho_usd numeric;

DO $body$
DECLARE
  dt_wh text;
  dt_lk text;
  has_luu_kho_numeric boolean;
BEGIN
  SELECT c.data_type INTO dt_wh
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'orders' AND c.column_name = 'warehouse_fee';
  SELECT c.data_type INTO dt_lk
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'orders' AND c.column_name = 'luu_kho_usd';

  IF dt_wh IS NULL OR dt_lk IS NULL THEN
    RAISE NOTICE 'ngay_doi_soat_luu_kho_usd: thiếu cột — skip';
    RETURN;
  END IF;

  IF dt_wh NOT IN ('text', 'character varying', 'character')
     OR dt_lk NOT IN ('numeric', 'double precision', 'real', 'integer', 'bigint', 'smallint') THEN
    RAISE NOTICE 'ngay_doi_soat_luu_kho_usd: skip (warehouse_fee=%, luu_kho_usd=%)', dt_wh, dt_lk;
    RETURN;
  END IF;

  -- Nếu luu_kho_usd (numeric) đang rỗng (không có bản ghi backup USD),
  -- không thể khôi phục warehouse_fee numeric USD một cách đúng nghĩa.
  -- Ta sẽ ít nhất chuyển "ngày" từ warehouse_fee (text) sang luu_kho_usd (text),
  -- còn warehouse_fee sẽ được ép numeric và các giá trị không phải số sẽ thành NULL.
  SELECT EXISTS(
    SELECT 1 FROM public.orders WHERE luu_kho_usd IS NOT NULL LIMIT 1
  ) INTO has_luu_kho_numeric;

  -- Tạm lưu "ngày" (text) từ warehouse_fee.
  EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS _mig_ngay_doi_soat text';
  EXECUTE 'UPDATE public.orders SET _mig_ngay_doi_soat = NULLIF(trim(both from warehouse_fee::text), '''') WHERE warehouse_fee IS NOT NULL';

  IF has_luu_kho_numeric THEN
    -- Swap đủ bộ: USD từ luu_kho_usd(numeric) -> warehouse_fee(numeric); Ngày từ warehouse_fee(text) -> luu_kho_usd(text)
    EXECUTE 'ALTER TABLE public.orders ALTER COLUMN warehouse_fee TYPE numeric USING (luu_kho_usd)';
    EXECUTE 'ALTER TABLE public.orders ALTER COLUMN luu_kho_usd TYPE text USING (_mig_ngay_doi_soat)';
  ELSE
    -- Backup USD bị mất: chỉ chuyển ngày và ép warehouse_fee về numeric (các chuỗi ngày -> NULL)
    EXECUTE 'ALTER TABLE public.orders ALTER COLUMN luu_kho_usd TYPE text USING (_mig_ngay_doi_soat)';
    EXECUTE 'ALTER TABLE public.orders ALTER COLUMN warehouse_fee TYPE numeric USING (CASE
      WHEN trim(both from warehouse_fee::text) ~ ''^-?[0-9]+(\\.[0-9]*)?([eE][+-]?[0-9]+)?$'' THEN trim(both from warehouse_fee::text)::numeric
      ELSE NULL
    END)';
  END IF;

  EXECUTE 'ALTER TABLE public.orders DROP COLUMN IF EXISTS _mig_ngay_doi_soat';

  RAISE NOTICE 'ngay_doi_soat_luu_kho_usd: hoán đổi xong';
END $body$;

COMMENT ON COLUMN public.orders.luu_kho_usd IS 'Ngày đối soát kế toán (text).';
COMMENT ON COLUMN public.orders.warehouse_fee IS 'Phí xử lý đơn đóng hàng / lưu kho USD (numeric).';

-- Tách DROP/CREATE riêng để tránh lỗi 42P16 khi Postgres cố "đổi tên" cột view cũ theo vị trí.
DROP VIEW IF EXISTS public.van_don_page;

CREATE VIEW public.van_don_page AS
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
  'Trang /van-don: luu_kho_usd = ngày đối soát kế toán (text); warehouse_fee = phí lưu kho USD.';

GRANT SELECT ON public.van_don_page TO authenticated;
