-- Ngày đối soát kế toán: chuyển dữ liệu từ orders.shipping_fee (lưu nhầm) sang orders.warehouse_fee, theo từng order_code.
-- Sao lưu phí lưu kho USD (warehouse_fee numeric cũ) vào orders.luu_kho_usd để cột UI "Phí xử lý đơn đóng hàng-Lưu kho(usd)" không mất.
-- shipping_fee sau migration dùng lại cho Phí ship (numeric).

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS luu_kho_usd numeric;

-- Giữ phí lưu kho USD trước khi đổi kiểu warehouse_fee (chỉ khi cột vẫn là numeric — chạy lại migration an toàn)
DO $$
DECLARE
  dt text;
BEGIN
  SELECT c.data_type INTO dt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'orders'
    AND c.column_name = 'warehouse_fee';

  IF dt IN ('numeric', 'double precision', 'real', 'integer', 'bigint', 'smallint') THEN
    UPDATE public.orders
    SET luu_kho_usd = warehouse_fee
    WHERE warehouse_fee IS NOT NULL;
  END IF;
END $$;

-- warehouse_fee → text (chuỗi ngày đối soát)
DO $$
DECLARE
  dt text;
BEGIN
  SELECT c.data_type INTO dt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'orders'
    AND c.column_name = 'warehouse_fee';

  IF dt IS NULL THEN
    RAISE NOTICE 'orders.warehouse_fee: missing, skip alter';
    RETURN;
  END IF;

  IF dt IN ('text', 'character varying', 'character') THEN
    RAISE NOTICE 'orders.warehouse_fee: already text-like (%), skip alter', dt;
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.orders ALTER COLUMN warehouse_fee TYPE text USING (warehouse_fee::text)';
  RAISE NOTICE 'orders.warehouse_fee: altered from % to text', dt;
END $$;

-- Chép nội dung từ shipping_fee (ngày/lịch sử nhập) sang warehouse_fee
UPDATE public.orders
SET warehouse_fee = trim(both from shipping_fee::text)
WHERE shipping_fee IS NOT NULL
  AND trim(both from shipping_fee::text) <> '';

-- Chỉ xóa warehouse_fee dạng số thuần khi không có gì trong shipping_fee để chuyển (tránh hiện phí USD trong cột ngày; idempotent khi chạy lại)
UPDATE public.orders
SET warehouse_fee = NULL
WHERE (shipping_fee IS NULL OR trim(both from coalesce(shipping_fee::text, '')) = '')
  AND warehouse_fee IS NOT NULL
  AND trim(both from warehouse_fee::text) ~ '^-?[0-9]+(\.[0-9]*)?([eE][+-]?[0-9]+)?$';

-- Gỡ dữ liệu khỏi shipping_fee; ép lại kiểu numeric cho Phí ship
UPDATE public.orders SET shipping_fee = NULL;

DO $$
DECLARE
  dt text;
BEGIN
  SELECT c.data_type INTO dt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'orders'
    AND c.column_name = 'shipping_fee';

  IF dt IS NULL THEN
    RAISE NOTICE 'orders.shipping_fee: missing, skip alter';
    RETURN;
  END IF;

  IF dt IN ('numeric', 'double precision', 'real', 'integer', 'bigint', 'smallint') THEN
    RAISE NOTICE 'orders.shipping_fee: already numeric-like (%), skip alter', dt;
    RETURN;
  END IF;

  EXECUTE $a$
    ALTER TABLE public.orders
    ALTER COLUMN shipping_fee TYPE numeric
    USING (CASE
      WHEN shipping_fee IS NULL THEN NULL
      WHEN trim(both from shipping_fee::text) = '' THEN NULL
      ELSE trim(both from shipping_fee::text)::numeric
    END)
  $a$;
  RAISE NOTICE 'orders.shipping_fee: altered from % to numeric', dt;
END $$;

-- View trang vận đơn: thêm luu_kho_usd (khớp api.js VAN_DON_PAGE_COLUMN_LIST)
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
  'Trang /van-don: thêm luu_kho_usd (phí lưu kho USD); warehouse_fee = ngày đối soát kế toán (text).';

GRANT SELECT ON public.van_don_page TO authenticated;
