-- =====================================================
-- Script cơ bản chỉ tạo bảng system_settings
-- Chạy script này trước, sau đó chạy script đầy đủ
-- =====================================================

-- Tạo bảng system_settings (chạy phần này trước)
CREATE TABLE IF NOT EXISTS public.system_settings (
    id TEXT PRIMARY KEY DEFAULT 'global_config',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kiểm tra bảng đã được tạo chưa
SELECT 
    'Bảng system_settings đã được tạo thành công!' as status,
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'system_settings'
ORDER BY ordinal_position;

-- Insert dữ liệu mặc định
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

-- Kiểm tra dữ liệu
SELECT 
    id,
    jsonb_array_length(COALESCE(settings->'products', '[]'::jsonb)) as total_products,
    updated_at
FROM public.system_settings
WHERE id = 'global_config';
