-- ============================================
-- SQL Migration: Tạo/Cập nhật bảng exchange_rates
-- Mô tả: Bảng quản lý tỷ giá quy đổi các loại tiền tệ sang VNĐ
-- Chạy trong Supabase SQL Editor
-- ============================================

-- 1. Tạo bảng exchange_rates (nếu chưa tồn tại)
CREATE TABLE IF NOT EXISTS public.exchange_rates (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    -- Tỷ giá các loại tiền tệ (1 đơn vị = ? VNĐ)
    usd DECIMAL(15, 6) DEFAULT 25000.000000 NOT NULL,
    jpy DECIMAL(15, 6) DEFAULT 180.000000 NOT NULL,  -- JPY/YEN
    cad DECIMAL(15, 6) DEFAULT 19000.000000 NOT NULL,
    aud DECIMAL(15, 6) DEFAULT 18000.000000 NOT NULL,
    gbp DECIMAL(15, 6) DEFAULT 32000.000000,
    krw DECIMAL(15, 6) DEFAULT 20.000000,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Thêm các cột còn thiếu nếu bảng đã tồn tại
DO $$ 
BEGIN
    -- Thêm created_at nếu chưa có
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'exchange_rates' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.exchange_rates 
        ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
    END IF;

    -- Thêm updated_at nếu chưa có
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'exchange_rates' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.exchange_rates 
        ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
    END IF;

    -- Thêm gbp nếu chưa có
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'exchange_rates' 
        AND column_name = 'gbp'
    ) THEN
        ALTER TABLE public.exchange_rates 
        ADD COLUMN gbp DECIMAL(15, 6) DEFAULT 32000.000000;
    END IF;

    -- Thêm krw nếu chưa có
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'exchange_rates' 
        AND column_name = 'krw'
    ) THEN
        ALTER TABLE public.exchange_rates 
        ADD COLUMN krw DECIMAL(15, 6) DEFAULT 20.000000;
    END IF;
END $$;

-- 2. Tạo index để tối ưu query
CREATE INDEX IF NOT EXISTS idx_exchange_rates_id ON public.exchange_rates(id);

-- 3. Tạo trigger tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_exchange_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_exchange_rates_updated_at ON public.exchange_rates;
CREATE TRIGGER trigger_update_exchange_rates_updated_at
    BEFORE UPDATE ON public.exchange_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_exchange_rates_updated_at();

-- 4. Insert dữ liệu mặc định nếu chưa có record nào
INSERT INTO public.exchange_rates (id, usd, jpy, cad, aud, gbp, krw, created_at, updated_at)
SELECT 1, 25000.000000, 180.000000, 19000.000000, 18000.000000, 32000.000000, 20.000000, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.exchange_rates WHERE id = 1);

-- 5. Bật Row Level Security (RLS)
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- 6. Tạo Policy cho phép đọc/ghi (có thể điều chỉnh theo nhu cầu bảo mật)
DROP POLICY IF EXISTS "Allow all access to exchange_rates" ON public.exchange_rates;
CREATE POLICY "Allow all access to exchange_rates" 
    ON public.exchange_rates 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- 7. Thêm comments mô tả
COMMENT ON TABLE public.exchange_rates IS 'Bảng quản lý tỷ giá quy đổi tiền tệ sang VNĐ. Chỉ có 1 record duy nhất với id=1.';
COMMENT ON COLUMN public.exchange_rates.id IS 'ID duy nhất (luôn là 1)';
COMMENT ON COLUMN public.exchange_rates.usd IS 'Tỷ giá USD (1 USD = ? VNĐ)';
COMMENT ON COLUMN public.exchange_rates.jpy IS 'Tỷ giá JPY/YEN (1 JPY = ? VNĐ)';
COMMENT ON COLUMN public.exchange_rates.cad IS 'Tỷ giá CAD (1 CAD = ? VNĐ)';
COMMENT ON COLUMN public.exchange_rates.aud IS 'Tỷ giá AUD (1 AUD = ? VNĐ)';
COMMENT ON COLUMN public.exchange_rates.gbp IS 'Tỷ giá GBP (1 GBP = ? VNĐ)';
COMMENT ON COLUMN public.exchange_rates.krw IS 'Tỷ giá KRW (1 KRW = ? VNĐ)';
COMMENT ON COLUMN public.exchange_rates.created_at IS 'Thời điểm tạo record';
COMMENT ON COLUMN public.exchange_rates.updated_at IS 'Thời điểm cập nhật lần cuối (tự động)';

-- ============================================
-- Hướng dẫn sử dụng:
-- 1. Copy toàn bộ script này
-- 2. Vào Supabase Dashboard > SQL Editor
-- 3. Paste và chạy (Run)
-- 4. Kiểm tra bảng đã được tạo: SELECT * FROM exchange_rates;
-- ============================================
