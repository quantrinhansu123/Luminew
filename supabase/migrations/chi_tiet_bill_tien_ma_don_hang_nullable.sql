-- Cho phép nhập bill chỉ có mã tracking (ít nhất một trong hai: mã đơn hoặc mã tracking)
ALTER TABLE public.chi_tiet_bill_tien
  ALTER COLUMN ma_don_hang DROP NOT NULL;
