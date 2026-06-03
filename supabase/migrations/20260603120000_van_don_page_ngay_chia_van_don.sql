-- /van-don: lọc toolbar «Ngày chia đơn» — cột ngay_chia_van_don trên orders + view van_don_page.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ngay_chia_van_don date;

COMMENT ON COLUMN public.orders.ngay_chia_van_don IS
  'Ngày gán NV vận đơn (chia đơn).';

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
  canh_bao,
  ngay_chia_van_don
FROM public.orders;

COMMENT ON VIEW public.van_don_page IS
  'Nhân bản tập cột dùng cho trang /van-don. Khớp api.js VAN_DON_PAGE_COLUMN_LIST + ngay_chia_van_don.';

GRANT SELECT ON public.van_don_page TO authenticated;
