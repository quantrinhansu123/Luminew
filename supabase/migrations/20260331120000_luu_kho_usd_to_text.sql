-- Ép orders.luu_kho_usd (Ngày đối soát kế toán) về kiểu text.
-- Mục tiêu: tránh lỗi cast chuỗi ngày dd/mm/yyyy sang numeric.
--
-- Idempotent: bỏ qua nếu cột đã là text / varchar / character.
DO $$
DECLARE
  dt text;
BEGIN
  SELECT c.data_type INTO dt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'orders'
    AND c.column_name = 'luu_kho_usd';

  IF dt IS NULL THEN
    RAISE NOTICE 'orders.luu_kho_usd: column not found, skip';
    RETURN;
  END IF;

  IF dt IN ('text', 'character varying', 'character') THEN
    RAISE NOTICE 'orders.luu_kho_usd: already text-like (%), skip', dt;
    RETURN;
  END IF;

  -- van_don_page view phụ thuộc trực tiếp vào orders.luu_kho_usd,
  -- nên Postgres không cho ALTER TYPE khi view đang tồn tại.
  -- Drop/recreate view trong cùng migration để đảm bảo idempotent.
  EXECUTE 'DROP VIEW IF EXISTS public.van_don_page';
  EXECUTE 'ALTER TABLE public.orders ALTER COLUMN luu_kho_usd TYPE text USING (luu_kho_usd::text)';
  RAISE NOTICE 'orders.luu_kho_usd: altered from % to text', dt;

  -- Khôi phục view (giữ khớp VAN_DON_PAGE_COLUMN_LIST trong src/services/api.js)
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

  EXECUTE 'COMMENT ON VIEW public.van_don_page IS ''Trang /van-don: luu_kho_usd = ngày đối soát kế toán (text); warehouse_fee = phí lưu kho USD.''';
  EXECUTE 'GRANT SELECT ON public.van_don_page TO authenticated';
END $$;

