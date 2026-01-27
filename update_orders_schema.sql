-- SQL Migration to update 'orders' table for full features
-- Run this in Supabase SQL Editor

-- 1. Identity & Info
alter table orders add column if not exists tracking_code text;
alter table orders add column if not exists order_time timestamptz default now();

-- 2. Customer
alter table orders add column if not exists zipcode text;
alter table orders add column if not exists area text; -- Khu vực: US, Nhật, ...

-- 3. Product Info
alter table orders add column if not exists product_main text; -- Mặt hàng (Enums)
alter table orders add column if not exists product_name_1 text;
alter table orders add column if not exists quantity_1 numeric;
alter table orders add column if not exists product_name_2 text;
alter table orders add column if not exists quantity_2 numeric;
alter table orders add column if not exists gift text;
alter table orders add column if not exists gift_quantity numeric;

-- 4. Payment
alter table orders add column if not exists sale_price numeric; -- Giá bán
alter table orders add column if not exists payment_type text; -- Loại tiền: Zelle, COD...
alter table orders add column if not exists exchange_rate numeric default 1; -- Tỷ giá
alter table orders add column if not exists total_vnd numeric; -- Tổng tiền VNĐ
alter table orders add column if not exists payment_method_text text; -- Hình thức thanh toán (text input)
alter table orders add column if not exists shipping_fee numeric; -- Tiền ship (thu khách?)
alter table orders add column if not exists shipping_cost numeric; -- Phí ship (trả thực tế?)
alter table orders add column if not exists base_price numeric; -- Giá gốc
alter table orders add column if not exists reconciled_vnd numeric; -- Tiền Việt đã đối soát

-- 5. Staff
alter table orders add column if not exists delivery_staff text;
alter table orders add column if not exists team text;
alter table orders add column if not exists creator_name text;

-- 6. Order Status
alter table orders add column if not exists check_result text; -- Enum: OK, Huỷ...
alter table orders add column if not exists delivery_status_nb text; -- Trạng thái giao hàng NB
alter table orders add column if not exists delivery_status text; -- Giao thành công, hoàn...
alter table orders add column if not exists carrier text; -- BEE, T&T...
alter table orders add column if not exists payment_status text; -- Có bill, hoàn hàng...
alter table orders add column if not exists postponed_date date; -- Ngày hẹn đẩy đơn

-- 7. Shift & System
alter table orders add column if not exists shift text; -- Ca
alter table orders add column if not exists accountant_confirm text;

-- 8. CSKH
alter table orders add column if not exists cskh_status text;
alter table orders add column if not exists feedback_pos text;
alter table orders add column if not exists feedback_neg text;
alter table orders add column if not exists customer_type text; -- Blacklist goes here? Or separate?

-- 9. Logic & Notes
alter table orders add column if not exists blacklist_status text; -- "BackList" or "Trùng khách..."
alter table orders add column if not exists note_sale text;
alter table orders add column if not exists note_ffm text;
alter table orders add column if not exists note_delivery text;
