-- Migration: Tạo 2 bảng Báo cáo MKT và KPIs
-- Chạy file này 1 lần để tạo 2 bảng

-- Bảng 1: Báo cáo MKT
CREATE TABLE IF NOT EXISTS public.bao_cao_mkt (
    id SERIAL PRIMARY KEY,
    ho_va_ten VARCHAR(100) NOT NULL,
    page VARCHAR(255),
    cpqc DECIMAL(15, 2) DEFAULT 0,
    so_mess INTEGER DEFAULT 0,
    so_don INTEGER DEFAULT 0,
    cps DECIMAL(15, 2) DEFAULT 0,
    ti_le_chot DECIMAL(5, 2) DEFAULT 0,
    created_at TIMESTAMPTZ(6) DEFAULT NOW(),
    updated_at TIMESTAMPTZ(6) DEFAULT NOW()
);

-- Bảng 2: KPIs
CREATE TABLE IF NOT EXISTS public.kpis (
    id SERIAL PRIMARY KEY,
    ho_ten VARCHAR(100) NOT NULL,
    bo_phan VARCHAR(100),
    kpi_thang DECIMAL(15, 2) DEFAULT 0,
    kpi_tuan DECIMAL(15, 2) DEFAULT 0,
    kpi_ngay DECIMAL(15, 2) DEFAULT 0,
    created_at TIMESTAMPTZ(6) DEFAULT NOW(),
    updated_at TIMESTAMPTZ(6) DEFAULT NOW()
);

-- Tạo index cho các trường thường dùng
CREATE INDEX IF NOT EXISTS idx_bao_cao_mkt_ho_va_ten ON public.bao_cao_mkt(ho_va_ten);
CREATE INDEX IF NOT EXISTS idx_bao_cao_mkt_page ON public.bao_cao_mkt(page);
CREATE INDEX IF NOT EXISTS idx_kpis_ho_ten ON public.kpis(ho_ten);
CREATE INDEX IF NOT EXISTS idx_kpis_bo_phan ON public.kpis(bo_phan);

-- Tạo trigger để tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bao_cao_mkt_updated_at BEFORE UPDATE ON public.bao_cao_mkt
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kpis_updated_at BEFORE UPDATE ON public.kpis
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Thêm comment cho các bảng
COMMENT ON TABLE public.bao_cao_mkt IS 'Bảng báo cáo Marketing';
COMMENT ON TABLE public.kpis IS 'Bảng KPIs nhân viên';

-- Thêm comment cho các cột quan trọng
COMMENT ON COLUMN public.bao_cao_mkt.cpqc IS 'Chi phí quảng cáo';
COMMENT ON COLUMN public.bao_cao_mkt.so_mess IS 'Số message';
COMMENT ON COLUMN public.bao_cao_mkt.so_don IS 'Số đơn hàng';
COMMENT ON COLUMN public.bao_cao_mkt.cps IS 'Chi phí sản xuất';
COMMENT ON COLUMN public.bao_cao_mkt.ti_le_chot IS 'Tỉ lệ chốt đơn (%)';
