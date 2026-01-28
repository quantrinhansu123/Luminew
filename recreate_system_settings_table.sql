-- =====================================================
-- Script xóa và tạo lại bảng system_settings
-- Chỉ lưu Tên SP và Loại SP
-- =====================================================

-- 1. Xóa bảng cũ nếu tồn tại (CẢNH BÁO: Sẽ mất tất cả dữ liệu)
DROP TABLE IF EXISTS public.system_settings CASCADE;

-- 2. Tạo lại bảng system_settings với 2 cột: Tên SP và Loại SP
CREATE TABLE public.system_settings (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,  -- Tên sản phẩm
    type TEXT NOT NULL CHECK (type IN ('normal', 'test', 'key')),  -- Loại sản phẩm: normal, test, key
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name)  -- Đảm bảo tên sản phẩm không trùng lặp
);

-- 3. Tạo index cho name và type để query nhanh hơn
CREATE INDEX idx_system_settings_name ON public.system_settings(name);
CREATE INDEX idx_system_settings_type ON public.system_settings(type);
CREATE INDEX idx_system_settings_updated_at ON public.system_settings(updated_at);

-- 4. Insert dữ liệu mặc định
INSERT INTO public.system_settings (name, type, updated_by) VALUES
    ('Bakuchiol Retinol', 'normal', 'system'),
    ('Nám DR Hancy', 'normal', 'system'),
    ('Glutathione Collagen NEW', 'test', 'system'),
    ('Dragon Blood Cream', 'test', 'system'),
    ('Gel XK Thái', 'test', 'system'),
    ('Gel XK Phi', 'test', 'system'),
    ('Glutathione Collagen', 'key', 'system'),
    ('Kem Body', 'key', 'system'),
    ('DG', 'key', 'system'),
    ('Kẹo Táo', 'key', 'system')
ON CONFLICT (name) DO NOTHING;

-- 5. Kiểm tra kết quả
SELECT 
    'Bảng system_settings đã được tạo lại thành công!' as status,
    COUNT(*) as total_products,
    COUNT(*) FILTER (WHERE type = 'normal') as normal_products,
    COUNT(*) FILTER (WHERE type = 'test') as test_products,
    COUNT(*) FILTER (WHERE type = 'key') as key_products
FROM public.system_settings;

-- 6. Xem chi tiết từng sản phẩm
SELECT 
    id,
    name as ten_san_pham,
    type as loai_san_pham,
    CASE 
        WHEN type = 'normal' THEN 'SP thường'
        WHEN type = 'test' THEN 'SP Test (R&D)'
        WHEN type = 'key' THEN 'SP Trọng điểm'
        ELSE 'Không xác định'
    END as loai_san_pham_text,
    updated_at,
    updated_by
FROM public.system_settings
ORDER BY name;

-- =====================================================
-- Lưu ý:
-- 1. Script này sẽ XÓA hoàn toàn bảng cũ và tạo lại từ đầu
-- 2. Tất cả dữ liệu cũ sẽ bị mất
-- 3. Cấu trúc mới: 2 cột riêng biệt
--    - name: Tên sản phẩm (TEXT, UNIQUE)
--    - type: Loại sản phẩm (normal|test|key)
-- 4. Mỗi sản phẩm là một dòng riêng trong bảng
-- =====================================================
