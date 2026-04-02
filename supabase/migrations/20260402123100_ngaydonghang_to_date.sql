-- Ép orders.ngaydonghang (Ngày đóng hàng) về kiểu date.
-- View van_don_page tham chiếu cột này → drop/recreate view trước/sau ALTER.
--
-- Idempotent: bỏ qua nếu cột đã là date.
-- Từ text: ISO YYYY-MM-DD hoặc dd/mm/yyyy (chuỗi không parse được → NULL).
-- Từ timestamp: lấy phần ngày theo cast.
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

  IF dt = 'date' THEN
    RAISE NOTICE 'orders.ngaydonghang: already date, skip';
    RETURN;
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS public.van_don_page';

  IF dt IN ('text', 'character varying', 'character') THEN
    EXECUTE $ngay_to_date$
      ALTER TABLE public.orders
      ALTER COLUMN ngaydonghang TYPE date USING (
        CASE
          WHEN ngaydonghang IS NULL OR btrim(ngaydonghang::text) = '' THEN NULL::date
          WHEN btrim(ngaydonghang::text) ~ '^\d{4}-\d{2}-\d{2}' THEN left(btrim(ngaydonghang::text), 10)::date
          WHEN btrim(ngaydonghang::text) ~ '^\d{1,2}/\d{1,2}/' THEN to_date(
            lpad(split_part(split_part(btrim(ngaydonghang::text), ' ', 1), '/', 1), 2, '0') || '/' ||
            lpad(split_part(split_part(btrim(ngaydonghang::text), ' ', 1), '/', 2), 2, '0') || '/' ||
            CASE
              WHEN length(split_part(split_part(btrim(ngaydonghang::text), ' ', 1), '/', 3)) <= 2
                THEN '20' || lpad(split_part(split_part(btrim(ngaydonghang::text), ' ', 1), '/', 3), 2, '0')
              ELSE split_part(split_part(btrim(ngaydonghang::text), ' ', 1), '/', 3)
            END,
            'DD/MM/YYYY'
          )
          ELSE NULL::date
        END
      )
    $ngay_to_date$;
    RAISE NOTICE 'orders.ngaydonghang: altered from % to date (via text parse)', dt;
  ELSIF dt IN ('timestamp without time zone', 'timestamp with time zone') THEN
    EXECUTE 'ALTER TABLE public.orders ALTER COLUMN ngaydonghang TYPE date USING ((ngaydonghang::timestamp)::date)';
    RAISE NOTICE 'orders.ngaydonghang: altered from % to date (via timestamp)', dt;
  ELSE
    EXECUTE 'ALTER TABLE public.orders ALTER COLUMN ngaydonghang TYPE date USING (ngaydonghang::date)';
    RAISE NOTICE 'orders.ngaydonghang: altered from % to date (generic cast)', dt;
  END IF;

  EXECUTE $van_don_page_view$
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
  $van_don_page_view$;

  EXECUTE 'COMMENT ON VIEW public.van_don_page IS ''Trang /van-don: ngaydonghang = Ngày đóng hàng (date).''';
  EXECUTE 'GRANT SELECT ON public.van_don_page TO authenticated';
END $$;
