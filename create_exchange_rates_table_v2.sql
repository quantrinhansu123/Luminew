-- ============================================
-- SQL Migration: Tạo lại bảng exchange_rates
-- Mô tả: Bảng quản lý tỷ giá quy đổi các loại tiền tệ sang VNĐ
-- Cấu trúc mới: chỉ có 2 cột ti_gia và gia_tri
-- Chạy trong Supabase SQL Editor
-- ============================================

-- 1. Xóa bảng cũ nếu tồn tại (CẨN THẬN: sẽ mất dữ liệu cũ)
DROP TABLE IF EXISTS public.exchange_rates CASCADE;

-- 2. Tạo bảng exchange_rates mới với cấu trúc đơn giản
CREATE TABLE public.exchange_rates (
    id SERIAL PRIMARY KEY,
    ti_gia TEXT NOT NULL UNIQUE,  -- Loại tiền tệ: 'USD', 'JPY', 'CAD', 'AUD', 'GBP', 'KRW'
    gia_tri DECIMAL(15, 6) NOT NULL,  -- Giá trị tỷ giá (1 đơn vị = ? VNĐ)
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Tạo index để tối ưu query
CREATE INDEX IF NOT EXISTS idx_exchange_rates_ti_gia ON public.exchange_rates(ti_gia);

-- 4. Tạo trigger tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_exchange_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_exchange_rates_updated_at
    BEFORE UPDATE ON public.exchange_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_exchange_rates_updated_at();

-- 5. Insert dữ liệu mặc định
INSERT INTO public.exchange_rates (ti_gia, gia_tri)
VALUES 
    ('USD', 25000.000000),
    ('JPY', 180.000000),
    ('CAD', 19000.000000),
    ('AUD', 18000.000000),
    ('GBP', 32000.000000),
    ('KRW', 20.000000)
ON CONFLICT (ti_gia) DO NOTHING;

-- 6. Bật Row Level Security (RLS)
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- 7. Tạo Policy cho phép đọc/ghi
DROP POLICY IF EXISTS "Allow all access to exchange_rates" ON public.exchange_rates;
CREATE POLICY "Allow all access to exchange_rates" 
    ON public.exchange_rates 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- 8. Thêm comments mô tả
COMMENT ON TABLE public.exchange_rates IS 'Bảng quản lý tỷ giá quy đổi tiền tệ sang VNĐ. Mỗi loại tiền là một dòng riêng.';
COMMENT ON COLUMN public.exchange_rates.id IS 'ID tự động tăng';
COMMENT ON COLUMN public.exchange_rates.ti_gia IS 'Loại tiền tệ: USD, JPY, CAD, AUD, GBP, KRW';
COMMENT ON COLUMN public.exchange_rates.gia_tri IS 'Giá trị tỷ giá (1 đơn vị = ? VNĐ)';
COMMENT ON COLUMN public.exchange_rates.created_at IS 'Thời điểm tạo record';
COMMENT ON COLUMN public.exchange_rates.updated_at IS 'Thời điểm cập nhật lần cuối (tự động)';

-- ============================================
-- Hướng dẫn sử dụng:
-- 1. Copy toàn bộ script này
-- 2. Vào Supabase Dashboard > SQL Editor
-- 3. Paste và chạy (Run)
-- 4. Kiểm tra bảng đã được tạo: SELECT * FROM exchange_rates;
-- ============================================
