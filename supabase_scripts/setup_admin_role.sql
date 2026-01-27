-- =====================================================
-- NÂNG CẤP TÀI KHOẢN LÊN ADMIN (QUẢN TRỊ VIÊN)
-- =====================================================

-- Thay 'EMAIL_CUA_BAN@GMAIL.COM' bằng email của anh
UPDATE public.users 
SET role = 'ADMIN' 
WHERE email = 'admin@marketing.com'; 

-- Nếu email chưa tồn tại trong bảng users, anh có thể INSERT mới:
-- INSERT INTO public.users (email, role, name, team)
-- VALUES ('EMAIL_CUA_BAN@GMAIL.COM', 'ADMIN', 'Ten Cua Ban', 'ADMIN');

SELECT 'Đã nâng cấp quyền Admin cho tài khoản!' as message;
