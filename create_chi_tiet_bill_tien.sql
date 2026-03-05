-- SQL Script to create chi_tiet_bill_tien table
-- Bảng chi tiết bill tiền

CREATE TABLE IF NOT EXISTS public.chi_tiet_bill_tien (
    id SERIAL PRIMARY KEY,
    stt INTEGER,
    ma_don_hang VARCHAR(100) NOT NULL,
    ma_tracking VARCHAR(100),
    ngay_doi_soat DATE,
    ffm VARCHAR(50),
    don_vi_tien VARCHAR(10),
    so_tien_doi_soat DECIMAL(15, 2),
    ty_gia DECIMAL(15, 6),
    tien_viet DECIMAL(15, 2),
    dem_lan_thanh_toan INTEGER,
    khu_vuc VARCHAR(100),
    ngay_update TIMESTAMP,
    note TEXT,
    note_2 TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tạo index cho mã đơn hàng để tìm kiếm nhanh hơn
CREATE INDEX IF NOT EXISTS idx_chi_tiet_bill_tien_ma_don_hang ON public.chi_tiet_bill_tien(ma_don_hang);

-- Tạo index cho mã tracking
CREATE INDEX IF NOT EXISTS idx_chi_tiet_bill_tien_ma_tracking ON public.chi_tiet_bill_tien(ma_tracking);

-- Tạo index cho ngày đối soát
CREATE INDEX IF NOT EXISTS idx_chi_tiet_bill_tien_ngay_doi_soat ON public.chi_tiet_bill_tien(ngay_doi_soat);

-- Comment cho bảng và các cột
COMMENT ON TABLE public.chi_tiet_bill_tien IS 'Bảng chi tiết bill tiền';
COMMENT ON COLUMN public.chi_tiet_bill_tien.stt IS 'STT';
COMMENT ON COLUMN public.chi_tiet_bill_tien.ma_don_hang IS 'Mã đơn hàng';
COMMENT ON COLUMN public.chi_tiet_bill_tien.ma_tracking IS 'Mã Tracking';
COMMENT ON COLUMN public.chi_tiet_bill_tien.ngay_doi_soat IS 'Ngày đối soát';
COMMENT ON COLUMN public.chi_tiet_bill_tien.ffm IS 'FFM';
COMMENT ON COLUMN public.chi_tiet_bill_tien.don_vi_tien IS 'Đơn vị tiền';
COMMENT ON COLUMN public.chi_tiet_bill_tien.so_tien_doi_soat IS 'Số tiền đối soát';
COMMENT ON COLUMN public.chi_tiet_bill_tien.ty_gia IS 'Tỷ giá';
COMMENT ON COLUMN public.chi_tiet_bill_tien.tien_viet IS 'Tiền Việt';
COMMENT ON COLUMN public.chi_tiet_bill_tien.dem_lan_thanh_toan IS 'Đếm lần thanh toán';
COMMENT ON COLUMN public.chi_tiet_bill_tien.khu_vuc IS 'Khu vực';
COMMENT ON COLUMN public.chi_tiet_bill_tien.ngay_update IS 'Ngày Update';
COMMENT ON COLUMN public.chi_tiet_bill_tien.note IS 'Note';
COMMENT ON COLUMN public.chi_tiet_bill_tien.note_2 IS 'Note 2';
