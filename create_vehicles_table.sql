-- SQL Script to create vehicles table
-- Bảng quản lý xe vận chuyển

CREATE TABLE IF NOT EXISTS public.vehicles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    bien_so_xe TEXT NOT NULL,
    phan_bien_kiem_soat TEXT, -- Phân biển kiểm soát (*)
    ben_phu_trach uuid, -- Foreign key to bến xe (có thể là bảng khác hoặc reference)
    ten_xe TEXT,
    loai_xe TEXT,
    trang_thai TEXT DEFAULT 'active',
    ghi_chu TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    updated_by TEXT
);

-- Tạo index cho biển số xe để tìm kiếm nhanh hơn
CREATE INDEX IF NOT EXISTS idx_vehicles_bien_so_xe ON public.vehicles(bien_so_xe);

-- Tạo index cho phân biển kiểm soát
CREATE INDEX IF NOT EXISTS idx_vehicles_phan_bien_kiem_soat ON public.vehicles(phan_bien_kiem_soat);

-- Tạo index cho bến phụ trách
CREATE INDEX IF NOT EXISTS idx_vehicles_ben_phu_trach ON public.vehicles(ben_phu_trach);

-- Bật Row Level Security (Bảo mật)
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Tạo Policy cho phép xem/thêm/sửa/xóa (có thể điều chỉnh theo yêu cầu)
DROP POLICY IF EXISTS "Allow all access" ON public.vehicles;
CREATE POLICY "Allow all access" ON public.vehicles 
    FOR ALL USING (true) WITH CHECK (true);

-- Tạo trigger để tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_vehicles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vehicles_updated_at_trigger ON public.vehicles;
CREATE TRIGGER vehicles_updated_at_trigger
    BEFORE UPDATE ON public.vehicles
    FOR EACH ROW
    EXECUTE FUNCTION update_vehicles_updated_at();

-- Comment cho bảng và các cột
COMMENT ON TABLE public.vehicles IS 'Bảng quản lý xe vận chuyển';
COMMENT ON COLUMN public.vehicles.bien_so_xe IS 'Biển số xe';
COMMENT ON COLUMN public.vehicles.phan_bien_kiem_soat IS 'Phân biển kiểm soát (*)';
COMMENT ON COLUMN public.vehicles.ben_phu_trach IS 'Bến phụ trách (UUID)';
COMMENT ON COLUMN public.vehicles.ten_xe IS 'Tên xe';
COMMENT ON COLUMN public.vehicles.loai_xe IS 'Loại xe';
COMMENT ON COLUMN public.vehicles.trang_thai IS 'Trạng thái (active, inactive, etc.)';
