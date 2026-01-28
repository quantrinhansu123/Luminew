-- =====================================================
-- Script đơn giản để tạo bảng system_settings
-- Chạy từng phần nếu gặp lỗi
-- =====================================================

-- Bước 1: Tạo bảng (chạy phần này trước)
CREATE TABLE IF NOT EXISTS public.system_settings (
    id TEXT PRIMARY KEY DEFAULT 'global_config',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bước 2: Tạo index
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at ON public.system_settings(updated_at);

-- Bước 3: Kiểm tra bảng đã được tạo chưa
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'system_settings'
ORDER BY ordinal_position;

-- Bước 4: Insert dữ liệu mặc định
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
ON CONFLICT (id) DO UPDATE SET
    settings = EXCLUDED.settings,
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by;

-- Bước 5: Kiểm tra dữ liệu đã được insert chưa
SELECT 
    id,
    jsonb_pretty(settings->'products') as products_list,
    jsonb_array_length(COALESCE(settings->'products', '[]'::jsonb)) as total_products,
    updated_at,
    updated_by
FROM public.system_settings
WHERE id = 'global_config';

-- Bước 6: Xem từng sản phẩm và loại
SELECT 
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
