-- SQL Script to create exchange_rates table
-- Bảng quản lý tỷ giá quy đổi tiền tệ

CREATE TABLE IF NOT EXISTS public.exchange_rates (
    id INTEGER PRIMARY KEY DEFAULT 1,
    usd DECIMAL(15, 6) DEFAULT 25000,
    jpy DECIMAL(15, 6) DEFAULT 180,
    cad DECIMAL(15, 6) DEFAULT 19000,
    aud DECIMAL(15, 6) DEFAULT 18000,
    gbp DECIMAL(15, 6) DEFAULT 32000,
    krw DECIMAL(15, 6) DEFAULT 20,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default values if table is empty
INSERT INTO public.exchange_rates (id, usd, jpy, cad, aud, gbp, krw)
VALUES (1, 25000, 180, 19000, 18000, 32000, 20)
ON CONFLICT (id) DO NOTHING;

-- Comment cho bảng và các cột
COMMENT ON TABLE public.exchange_rates IS 'Bảng quản lý tỷ giá quy đổi tiền tệ';
COMMENT ON COLUMN public.exchange_rates.id IS 'ID (luôn là 1)';
COMMENT ON COLUMN public.exchange_rates.usd IS 'Tỷ giá USD (1 USD = ? VNĐ)';
COMMENT ON COLUMN public.exchange_rates.jpy IS 'Tỷ giá JPY/YEN (1 JPY = ? VNĐ)';
COMMENT ON COLUMN public.exchange_rates.cad IS 'Tỷ giá CAD (1 CAD = ? VNĐ)';
COMMENT ON COLUMN public.exchange_rates.aud IS 'Tỷ giá AUD (1 AUD = ? VNĐ)';
COMMENT ON COLUMN public.exchange_rates.gbp IS 'Tỷ giá GBP (1 GBP = ? VNĐ)';
COMMENT ON COLUMN public.exchange_rates.krw IS 'Tỷ giá KRW (1 KRW = ? VNĐ)';
