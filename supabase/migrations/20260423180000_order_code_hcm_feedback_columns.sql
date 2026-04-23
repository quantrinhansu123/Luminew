-- Phản hồi khách (đồng bộ với public.orders) trên bảng HCM.
-- Sau khi chạy: trên Vercel đặt VITE_ORDER_CODE_HCM_HAS_FEEDBACK=true rồi build lại,
-- để Nhập đơn / CSKH gửi feedback_pos, feedback_neg vào order_code_hcm.

alter table public.order_code_hcm add column if not exists feedback_pos text;
alter table public.order_code_hcm add column if not exists feedback_neg text;
