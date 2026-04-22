-- Lịch sử riêng cho trang FFM (tách khỏi orders.log dùng cho Vận đơn / Nhập đơn).
-- Cùng cấu trúc phần tử jsonb như log: thoi_gian, nhan_vien, cot, cot_db?, gia_tri_cu, gia_tri_moi;
-- thêm tùy chọn tac_nhan: 'nguoi_dung' | 'he_thong' (người thao tác vs hệ thống).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ffm_log jsonb DEFAULT '[]'::jsonb;

UPDATE public.orders
SET ffm_log = '[]'::jsonb
WHERE ffm_log IS NULL;

COMMENT ON COLUMN public.orders.ffm_log IS
  'JSONB (FFM): mảng bản ghi thay đổi chỉ cho luồng FFM — không gộp vào orders.log.';

ALTER TABLE public.order_code_hcm
  ADD COLUMN IF NOT EXISTS ffm_log jsonb DEFAULT '[]'::jsonb;

UPDATE public.order_code_hcm
SET ffm_log = '[]'::jsonb
WHERE ffm_log IS NULL;

COMMENT ON COLUMN public.order_code_hcm.ffm_log IS
  'JSONB (FFM): mảng bản ghi thay đổi chỉ cho luồng FFM — không gộp vào orders.log.';
