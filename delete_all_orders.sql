-- SQL Script to delete all data from orders table
-- ⚠️ CẢNH BÁO: Script này sẽ XÓA TẤT CẢ dữ liệu trong bảng orders
-- Hành động này KHÔNG THỂ HOÀN TÁC!
-- Chạy script này trong Supabase SQL Editor

-- Xóa tất cả dữ liệu trong bảng orders
DELETE FROM public.orders;

-- Hoặc nếu muốn reset ID sequence (nếu dùng SERIAL/IDENTITY):
-- TRUNCATE TABLE public.orders RESTART IDENTITY CASCADE;

-- Kiểm tra số lượng records còn lại (sau khi xóa sẽ là 0)
SELECT COUNT(*) as remaining_orders FROM public.orders;
