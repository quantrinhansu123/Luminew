-- SQL Script to create chitiet_cuoc table
-- Bảng chi tiết cước phí

CREATE TABLE IF NOT EXISTS public.chitiet_cuoc (
    id SERIAL PRIMARY KEY,
    ma_don_hang VARCHAR(100) NOT NULL,
    tien_cuoc DECIMAL(15, 2),
    don_vi_tien_te VARCHAR(10),
    ngay_doi_soat_cuoc DATE,
    ty_gia DECIMAL(15, 6),
    tien_ship_vnd DECIMAL(15, 2),
    thi_truong VARCHAR(100),
    ffm VARCHAR(50),
    loc_trung VARCHAR(50),
    san_pham VARCHAR(200),
    chi_nhanh VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tạo index cho mã đơn hàng để tìm kiếm nhanh hơn
CREATE INDEX IF NOT EXISTS idx_chitiet_cuoc_ma_don_hang ON public.chitiet_cuoc(ma_don_hang);

-- Tạo index cho ngày đối soát cước
CREATE INDEX IF NOT EXISTS idx_chitiet_cuoc_ngay_doi_soat ON public.chitiet_cuoc(ngay_doi_soat_cuoc);

-- Comment cho bảng và các cột
COMMENT ON TABLE public.chitiet_cuoc IS 'Bảng chi tiết cước phí';
COMMENT ON COLUMN public.chitiet_cuoc.ma_don_hang IS 'Mã đơn hàng';
COMMENT ON COLUMN public.chitiet_cuoc.tien_cuoc IS 'Tiền cước';
COMMENT ON COLUMN public.chitiet_cuoc.don_vi_tien_te IS 'Đơn vị tiền tệ';
COMMENT ON COLUMN public.chitiet_cuoc.ngay_doi_soat_cuoc IS 'Ngày đối soát cước';
COMMENT ON COLUMN public.chitiet_cuoc.ty_gia IS 'Tỷ giá';
COMMENT ON COLUMN public.chitiet_cuoc.tien_ship_vnd IS 'Tiền ship (Vnđ)';
COMMENT ON COLUMN public.chitiet_cuoc.thi_truong IS 'Thị trường';
COMMENT ON COLUMN public.chitiet_cuoc.ffm IS 'FFM';
COMMENT ON COLUMN public.chitiet_cuoc.loc_trung IS 'Lọc trùng';
COMMENT ON COLUMN public.chitiet_cuoc.san_pham IS 'Sản phẩm';
COMMENT ON COLUMN public.chitiet_cuoc.chi_nhanh IS 'Chi nhánh';
