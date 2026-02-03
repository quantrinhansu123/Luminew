-- =====================================================
-- Tạo bảng "Danh sách vận đơn"
-- Chạy script này trong Supabase Dashboard > SQL Editor
-- =====================================================

-- Tạo bảng danh_sach_van_don
CREATE TABLE IF NOT EXISTS public.danh_sach_van_don (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ho_va_ten TEXT NOT NULL,
  trang_thai_chia TEXT,
  chi_nhanh TEXT,
  nguoi_sua_ho TEXT,
  so_don INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tạo index để tìm kiếm nhanh hơn
CREATE INDEX IF NOT EXISTS idx_danh_sach_van_don_ho_va_ten ON public.danh_sach_van_don(ho_va_ten);
CREATE INDEX IF NOT EXISTS idx_danh_sach_van_don_chi_nhanh ON public.danh_sach_van_don(chi_nhanh);

-- Bật Row Level Security
ALTER TABLE public.danh_sach_van_don ENABLE ROW LEVEL SECURITY;

-- Tạo Policy cho phép tất cả người dùng xem/thêm/sửa/xóa
CREATE POLICY "Enable all access for authenticated users" 
ON public.danh_sach_van_don 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Tạo trigger để tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_danh_sach_van_don_updated_at 
BEFORE UPDATE ON public.danh_sach_van_don
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Comment cho các cột
COMMENT ON TABLE public.danh_sach_van_don IS 'Bảng quản lý danh sách vận đơn';
COMMENT ON COLUMN public.danh_sach_van_don.id IS 'ID tự động (UUID)';
COMMENT ON COLUMN public.danh_sach_van_don.ho_va_ten IS 'Họ và tên';
COMMENT ON COLUMN public.danh_sach_van_don.trang_thai_chia IS 'Trạng thái chia';
COMMENT ON COLUMN public.danh_sach_van_don.chi_nhanh IS 'Chi nhánh';
COMMENT ON COLUMN public.danh_sach_van_don.nguoi_sua_ho IS 'Người sửa hộ';
COMMENT ON COLUMN public.danh_sach_van_don.so_don IS 'Số đơn';
