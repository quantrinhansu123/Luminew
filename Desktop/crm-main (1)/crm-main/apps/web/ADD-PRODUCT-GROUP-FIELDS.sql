-- Add fields for Product Groups:
-- 1) product_name (Sản phẩm)
-- 2) unit_price (Giá định lượng)
--
-- Run in Supabase SQL Editor.

alter table public.product_groups
  add column if not exists product_name text;

alter table public.product_groups
  add column if not exists unit_price numeric not null default 0;

