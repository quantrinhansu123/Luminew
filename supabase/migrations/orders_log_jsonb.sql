-- Chuyển orders.log từ text sang jsonb (mảng: thoi_gian, nhan_vien, cot, gia_tri_cu, gia_tri_moi).
-- Chạy sau orders_log_canh_bao_columns.sql nếu cột log đang là text.
--
-- View public.van_don_page tham chiếu cột log → Postgres không cho ALTER TYPE trực tiếp.
-- Bắt buộc DROP VIEW → ALTER → CREATE VIEW lại.

CREATE OR REPLACE FUNCTION public._migrate_orders_log_text_to_jsonb(txt text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF txt IS NULL OR btrim(txt) = '' THEN
    RETURN '[]'::jsonb;
  END IF;
  BEGIN
    RETURN txt::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_array(
      jsonb_build_object(
        'thoi_gian', to_jsonb(now()::timestamptz),
        'nhan_vien', to_jsonb('hệ thống'::text),
        'cot', to_jsonb('Nhật ký cũ (text)'::text),
        'cot_db', to_jsonb('legacy_text'::text),
        'gia_tri_cu', 'null'::jsonb,
        'gia_tri_moi', to_jsonb(txt)
      )
    );
  END;
END;
$$;

-- CASCADE: nếu có view/materialized view phụ thuộc van_don_page (hiếm).
DROP VIEW IF EXISTS public.van_don_page CASCADE;

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT c.data_type INTO col_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'orders'
    AND c.column_name = 'log';

  IF col_type IS NULL THEN
    ALTER TABLE public.orders
      ADD COLUMN log jsonb DEFAULT '[]'::jsonb;
  ELSIF col_type IN ('text', 'character varying') THEN
    ALTER TABLE public.orders ALTER COLUMN log DROP DEFAULT;
    ALTER TABLE public.orders
      ALTER COLUMN log TYPE jsonb
      USING public._migrate_orders_log_text_to_jsonb(log::text);
    ALTER TABLE public.orders ALTER COLUMN log SET DEFAULT '[]'::jsonb;
    UPDATE public.orders SET log = '[]'::jsonb WHERE log IS NULL;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public._migrate_orders_log_text_to_jsonb(text);

COMMENT ON COLUMN public.orders.log IS
  'JSONB: mảng {thoi_gian, nhan_vien, cot, cot_db?, gia_tri_cu, gia_tri_moi} — nhật ký nhập/sửa đơn.';

-- Khôi phục view (khớp orders_log_canh_bao_columns.sql + api.js VAN_DON_PAGE_COLUMN_LIST).
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
  cskh_status,
  log,
  canh_bao
FROM public.orders;

COMMENT ON VIEW public.van_don_page IS
  'Nhân bản tập cột dùng cho trang /van-don. Khớp api.js VAN_DON_SELECT_QUERY + log, canh_bao.';

GRANT SELECT ON public.van_don_page TO authenticated;
