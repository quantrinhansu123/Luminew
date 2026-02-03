-- Comprehensive Column Fix for 'orders' table
-- Run this if you see errors like "Could not find column..."

-- 1. Identity & Tracking
alter table orders add column if not exists tracking_code text;
alter table orders add column if not exists order_time timestamptz default now();

-- 2. Customer Location
alter table orders add column if not exists city text;
alter table orders add column if not exists state text;
alter table orders add column if not exists zipcode text;
alter table orders add column if not exists area text;

-- 3. Product Details
alter table orders add column if not exists product_main text;
alter table orders add column if not exists product_name_1 text;
alter table orders add column if not exists quantity_1 numeric;
alter table orders add column if not exists product_name_2 text;
alter table orders add column if not exists quantity_2 numeric;
alter table orders add column if not exists gift text;
alter table orders add column if not exists gift_quantity numeric;

-- 4. Financials
alter table orders add column if not exists sale_price numeric;     -- Giá ngoại tệ
alter table orders add column if not exists payment_type text;      -- Loại tiền (USD, VND...)
alter table orders add column if not exists exchange_rate numeric;  -- Tỷ giá
alter table orders add column if not exists total_amount_vnd numeric; -- Tổng tiền VNĐ
alter table orders add column if not exists payment_method_text text; -- Hình thức TT (Zelle, COD...)
alter table orders add column if not exists shipping_fee numeric;   -- Tiền ship thu khách
alter table orders add column if not exists shipping_cost numeric;  -- Phí ship thực tế
alter table orders add column if not exists base_price numeric;     -- Giá gốc
alter table orders add column if not exists reconciled_vnd numeric; -- VNĐ Đối soát

-- 5. Staff & Management (The missing ones causing errors)
alter table orders add column if not exists page_name text;         -- Tên Page
alter table orders add column if not exists marketing_staff text;   -- NV Marketing
alter table orders add column if not exists sale_staff text;        -- NV Sale
alter table orders add column if not exists delivery_staff text;    -- NV Vận đơn
alter table orders add column if not exists team text;              -- Team
alter table orders add column if not exists cskh text;              -- NV CSKH
alter table orders add column if not exists created_by text;        -- Người tạo đơn (Email)
alter table orders add column if not exists note text;              -- Ghi chú chung

-- 6. Status & Feedback (Future proofing)
alter table orders add column if not exists feedback_pos text;
alter table orders add column if not exists feedback_neg text;
alter table orders add column if not exists delivery_status text;

-- 7. Force Schema Cache Refresh (Supabase sometimes needs this)
NOTIFY pgrst, 'reload schema';
