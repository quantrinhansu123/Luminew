-- View van_don_page: cột lydo trên bảng orders đã có sẵn — chỉ cập nhật view (thay reason bằng lydo trên view).
-- Đổi reason → lydo: Postgres không cho CREATE OR REPLACE bỏ cột cũ → drop rồi tạo lại.
-- CASCADE: view/materialized view hiếm phụ thuộc van_don_page.
drop view if exists public.van_don_page cascade;

-- Nếu lydo trống thì fallback reason (dữ liệu cũ).
create view public.van_don_page as
select
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
  coalesce(nullif(trim(both from o.lydo::text), ''), o.reason) as lydo,
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
from public.orders o;

grant select on public.van_don_page to authenticated;

comment on view public.van_don_page is
  'Nhân bản tập cột dùng cho trang /van-don. Cột lydo = coalesce(lydo đầy đủ, reason). Khớp api.js VAN_DON_PAGE_COLUMN_LIST + cskh_status.';