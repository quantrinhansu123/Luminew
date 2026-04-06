-- Ngày đóng hàng: cột orders.ngaydonghang → text (giữ đúng chuỗi từ UI / Thêm nhanh, không ép date).
-- Idempotent: bỏ qua nếu đã là text.
-- View van_don_page phụ thuộc orders → drop trước ALTER, tạo lại khớp migration van_don_page_lydo gần nhất.

DO $$
DECLARE
  dt text;
BEGIN
  SELECT c.data_type INTO dt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'orders'
    AND c.column_name = 'ngaydonghang';

  IF dt IS NULL THEN
    RAISE NOTICE 'orders.ngaydonghang: column not found, skip';
    RETURN;
  END IF;

  IF dt IN ('text', 'character varying', 'character') THEN
    RAISE NOTICE 'orders.ngaydonghang: already text-like (%), skip', dt;
    RETURN;
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS public.van_don_page CASCADE';

  IF dt = 'date' THEN
    EXECUTE $e$
      ALTER TABLE public.orders
      ALTER COLUMN ngaydonghang TYPE text USING (
        CASE
          WHEN ngaydonghang IS NULL THEN NULL
          ELSE to_char(ngaydonghang, 'DD/MM/YYYY')
        END
      )
    $e$;
    RAISE NOTICE 'orders.ngaydonghang: date → text (DD/MM/YYYY)';
  ELSIF dt IN ('timestamp without time zone', 'timestamp with time zone') THEN
    EXECUTE $e$
      ALTER TABLE public.orders
      ALTER COLUMN ngaydonghang TYPE text USING (
        CASE
          WHEN ngaydonghang IS NULL THEN NULL
          ELSE to_char((ngaydonghang::timestamp)::date, 'DD/MM/YYYY')
        END
      )
    $e$;
    RAISE NOTICE 'orders.ngaydonghang: timestamp → text';
  ELSE
    EXECUTE 'ALTER TABLE public.orders ALTER COLUMN ngaydonghang TYPE text USING (btrim(ngaydonghang::text))';
    RAISE NOTICE 'orders.ngaydonghang: % → text (generic cast)', dt;
  END IF;
END $$;

COMMENT ON COLUMN public.orders.ngaydonghang IS 'Ngày đóng hàng (text, vd. dd/mm/yyyy — khớp nhập lưới / Thêm nhanh).';

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
  coalesce(nullif(trim(both FROM o.lydo::text), ''), o.reason) AS lydo,
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
FROM public.orders o;

GRANT SELECT ON public.van_don_page TO authenticated;

COMMENT ON VIEW public.van_don_page IS
  'Nhân bản tập cột dùng cho trang /van-don. ngaydonghang = Ngày đóng hàng (text). Cột lydo = coalesce(lydo, reason).';

-- Bảng clone HCM (LIKE orders): đồng bộ kiểu cột nếu tồn tại.
DO $$
DECLARE
  dt text;
BEGIN
  IF to_regclass('public.order_code_hcm') IS NULL THEN
    RETURN;
  END IF;

  SELECT c.data_type INTO dt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'order_code_hcm'
    AND c.column_name = 'ngaydonghang';

  IF dt IS NULL OR dt IN ('text', 'character varying', 'character') THEN
    RETURN;
  END IF;

  -- View nhap_don_hcm = SELECT * FROM order_code_hcm → chặn ALTER TYPE nếu không drop trước.
  EXECUTE 'DROP VIEW IF EXISTS public.nhap_don_hcm CASCADE';

  IF dt = 'date' THEN
    EXECUTE $e$
      ALTER TABLE public.order_code_hcm
      ALTER COLUMN ngaydonghang TYPE text USING (
        CASE
          WHEN ngaydonghang IS NULL THEN NULL
          ELSE to_char(ngaydonghang, 'DD/MM/YYYY')
        END
      )
    $e$;
  ELSIF dt IN ('timestamp without time zone', 'timestamp with time zone') THEN
    EXECUTE $e$
      ALTER TABLE public.order_code_hcm
      ALTER COLUMN ngaydonghang TYPE text USING (
        CASE
          WHEN ngaydonghang IS NULL THEN NULL
          ELSE to_char((ngaydonghang::timestamp)::date, 'DD/MM/YYYY')
        END
      )
    $e$;
  ELSE
    EXECUTE 'ALTER TABLE public.order_code_hcm ALTER COLUMN ngaydonghang TYPE text USING (btrim(ngaydonghang::text))';
  END IF;

  EXECUTE $rec$
    CREATE OR REPLACE VIEW public.nhap_don_hcm AS
    SELECT * FROM public.order_code_hcm
  $rec$;
  EXECUTE 'COMMENT ON VIEW public.nhap_don_hcm IS ''Nguồn dữ liệu nhập đơn HCM, clone từ orders nhưng lấy từ bảng order_code_hcm.''';
  EXECUTE 'GRANT SELECT ON public.nhap_don_hcm TO authenticated';

  RAISE NOTICE 'order_code_hcm.ngaydonghang: altered to text; nhap_don_hcm recreated';
END $$;

DO $$
BEGIN
  IF to_regclass('public.order_code_hcm') IS NOT NULL THEN
    EXECUTE 'COMMENT ON COLUMN public.order_code_hcm.ngaydonghang IS ''Ngày đóng hàng (text) — khớp orders.ngaydonghang.''';
  END IF;
END $$;
