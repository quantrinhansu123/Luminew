-- SQL Migration to add Payment Bill columns to orders table
-- Run this in Supabase SQL Editor

-- Add Payment Bill column (dropdown: Có bill, Bill một phần)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_bill TEXT;

-- Add Payment Image column (text field for multiple image links)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_image TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.orders.payment_bill IS 'Trạng thái bill: Có bill, Bill một phần';
COMMENT ON COLUMN public.orders.payment_image IS 'Danh sách link hình ảnh bill, mỗi link một dòng';
