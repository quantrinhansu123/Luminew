-- Nhật ký thao tác nhập đơn + cảnh báo trùng SĐT (đồng bộ api.js VAN_DON_PAGE_COLUMN_LIST + view van_don_page).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS log jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS canh_bao text DEFAULT '';

COMMENT ON COLUMN public.orders.log IS 'JSONB: mảng bản ghi thay đổi (thoi_gian, nhan_vien, cot, gia_tri_cu, gia_tri_moi).';
COMMENT ON COLUMN public.orders.canh_bao IS 'Cảnh báo trùng SĐT / blacklist — cập nhật khi lưu đơn.';

-- Giữ khớp van_don_page_view_and_distinct.sql + thêm 2 cột cuối.
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
