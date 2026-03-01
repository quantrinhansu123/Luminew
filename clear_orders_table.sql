-- Script SQL để xóa toàn bộ dữ liệu trong bảng orders
-- CẢNH BÁO: Thao tác này sẽ xóa TẤT CẢ dữ liệu trong bảng orders!
-- Chạy script này trong Supabase SQL Editor

-- Kiểm tra số lượng records trước khi xóa
SELECT COUNT(*) as total_orders_before FROM public.orders;

-- Xóa toàn bộ dữ liệu trong bảng orders
-- Phương pháp 1: Sử dụng TRUNCATE (nhanh hơn, reset auto-increment nếu có)
TRUNCATE TABLE public.orders RESTART IDENTITY CASCADE;

-- Hoặc phương pháp 2: Sử dụng DELETE (nếu TRUNCATE không hoạt động do RLS)
-- DELETE FROM public.orders;

-- Kiểm tra số lượng records sau khi xóa
SELECT COUNT(*) as total_orders_after FROM public.orders;

-- Lưu ý:
-- - TRUNCATE nhanh hơn DELETE nhưng có thể bị chặn bởi RLS (Row Level Security)
-- - Nếu TRUNCATE không hoạt động, sử dụng DELETE FROM public.orders;
-- - RESTART IDENTITY sẽ reset sequence nếu có
-- - CASCADE sẽ xóa các bảng con có foreign key references (nếu có)
