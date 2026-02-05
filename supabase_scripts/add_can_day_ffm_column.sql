-- =====================================================
-- Thêm cột "can_day_ffm" (boolean) vào bảng users
-- Cột này dùng để phân quyền xem tab "Đẩy đơn Hà Nội"
-- Chạy script này trong Supabase Dashboard > SQL Editor
-- =====================================================

-- Thêm cột can_day_ffm vào bảng users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS can_day_ffm BOOLEAN DEFAULT FALSE;

-- Comment cho cột
COMMENT ON COLUMN public.users.can_day_ffm IS 'Quyền đẩy FFM - nếu true thì có quyền xem tab Đẩy đơn Hà Nội';

-- Tạo index để query nhanh hơn
CREATE INDEX IF NOT EXISTS idx_users_can_day_ffm ON public.users(can_day_ffm);
