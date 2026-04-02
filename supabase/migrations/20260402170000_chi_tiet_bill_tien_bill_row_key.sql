-- Key nội bộ / file đối tác cho từng dòng bill (khi chưa có hoặc chưa gán mã đơn).
ALTER TABLE public.chi_tiet_bill_tien
  ADD COLUMN IF NOT EXISTS bill_row_key text;

COMMENT ON COLUMN public.chi_tiet_bill_tien.bill_row_key IS
  'Key dòng bill (tham chiếu file / nội bộ), không thay cho order_code khi đồng bộ orders.';

CREATE INDEX IF NOT EXISTS idx_chi_tiet_bill_tien_bill_row_key
  ON public.chi_tiet_bill_tien (bill_row_key)
  WHERE bill_row_key IS NOT NULL;
