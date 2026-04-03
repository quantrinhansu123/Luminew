-- Log đẩy FFM riêng cho trang vận đơn HCM (order_code_hcm / van-don-hcm).
-- Cấu trúc giống public.ffm_push_logs để tái sử dụng cùng luồng insert/update từ app.

create table if not exists public.ffm_push_logs_hcm (like public.ffm_push_logs including all);

comment on table public.ffm_push_logs_hcm is 'FFM push audit log — nguồn từ /van-don-hcm (Đẩy Đơn HCM).';
