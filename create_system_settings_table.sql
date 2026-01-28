-- =====================================================
-- Script tạo bảng system_settings để lưu cấu hình hệ thống
-- Bao gồm: Quản lý Danh sách Sản phẩm và các cấu hình khác
-- =====================================================

-- 1. Tạo bảng system_settings
CREATE TABLE IF NOT EXISTS public.system_settings (
    id TEXT PRIMARY KEY DEFAULT 'global_config',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tạo index cho updated_at để query nhanh hơn
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at ON public.system_settings(updated_at);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 4. Xóa các policy cũ nếu tồn tại (để có thể chạy lại script)
DROP POLICY IF EXISTS "Allow read access to system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Allow admin to update system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Allow admin to insert system_settings" ON public.system_settings;

-- 5. Tạo policy cho phép tất cả users đọc (để các trang có thể load settings)
CREATE POLICY "Allow read access to system_settings"
ON public.system_settings
FOR SELECT
USING (true);

-- 6. Tạo policy cho phép Admin/Super Admin chỉnh sửa
-- Lưu ý: Cần điều chỉnh policy này theo logic phân quyền của bạn
CREATE POLICY "Allow admin to update system_settings"
ON public.system_settings
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.email = auth.email()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
    OR
    EXISTS (
        SELECT 1 FROM public.app_roles ar
        JOIN public.users u ON u.role = ar.code
        WHERE u.email = auth.email()
        AND ar.code IN ('ADMIN', 'SUPER_ADMIN')
    )
);

-- 7. Tạo policy cho phép Admin/Super Admin insert
CREATE POLICY "Allow admin to insert system_settings"
ON public.system_settings
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.email = auth.email()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
    OR
    EXISTS (
        SELECT 1 FROM public.app_roles ar
        JOIN public.users u ON u.role = ar.code
        WHERE u.email = auth.email()
        AND ar.code IN ('ADMIN', 'SUPER_ADMIN')
    )
);

-- 8. Tạo trigger để tự động cập nhật updated_at
-- Xóa trigger cũ nếu tồn tại
DROP TRIGGER IF EXISTS trigger_update_system_settings_updated_at ON public.system_settings;

CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION update_system_settings_updated_at();

-- 9. Insert dữ liệu mặc định nếu chưa có
-- Cấu trúc: Mảng các object với "name" và "type"
INSERT INTO public.system_settings (id, settings, updated_by)
VALUES (
    'global_config',
    '{
        "products": [
            {"name": "Bakuchiol Retinol", "type": "normal"},
            {"name": "Nám DR Hancy", "type": "normal"},
            {"name": "Glutathione Collagen NEW", "type": "test"},
            {"name": "Dragon Blood Cream", "type": "test"},
            {"name": "Gel XK Thái", "type": "test"},
            {"name": "Gel XK Phi", "type": "test"},
            {"name": "Glutathione Collagen", "type": "key"},
            {"name": "Kem Body", "type": "key"},
            {"name": "DG", "type": "key"},
            {"name": "Kẹo Táo", "type": "key"}
        ]
    }'::jsonb,
    'system'
)
ON CONFLICT (id) DO NOTHING;

-- 10. Kiểm tra kết quả
-- Xem danh sách sản phẩm với tên và loại
SELECT 
    id,
    jsonb_pretty(settings->'products') as products_list,
    jsonb_array_length(COALESCE(settings->'products', '[]'::jsonb)) as total_products,
    updated_at,
    updated_by
FROM public.system_settings
WHERE id = 'global_config';

-- Query để xem từng sản phẩm và loại của nó:
SELECT 
    id,
    product->>'name' as ten_san_pham,
    product->>'type' as loai_san_pham,
    CASE 
        WHEN product->>'type' = 'normal' THEN 'SP thường'
        WHEN product->>'type' = 'test' THEN 'SP Test (R&D)'
        WHEN product->>'type' = 'key' THEN 'SP Trọng điểm'
        ELSE 'Không xác định'
    END as loai_san_pham_text
FROM public.system_settings,
     jsonb_array_elements(settings->'products') as product
WHERE id = 'global_config'
ORDER BY product->>'name';

-- =====================================================
-- Lưu ý:
-- 1. Bảng này lưu danh sách sản phẩm trong cột settings (JSONB)
-- 2. Cấu trúc settings.products là mảng các object:
--    [
--      {"name": "Tên sản phẩm", "type": "normal|test|key"},
--      ...
--    ]
-- 3. Loại sản phẩm (type):
--    - "normal": Sản phẩm thường
--    - "test": Sản phẩm R&D (SP test)
--    - "key": Sản phẩm trọng điểm
-- 4. Policy RLS có thể cần điều chỉnh theo logic phân quyền thực tế của bạn
-- =====================================================
