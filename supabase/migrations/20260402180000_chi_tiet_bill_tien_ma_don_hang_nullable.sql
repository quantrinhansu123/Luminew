-- Import Bill: cho phép dòng chỉ có tracking / Key dòng / chưa gán mã đơn (ma_don_hang NULL).
-- Bản có timestamp để db push luôn chạy; idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chi_tiet_bill_tien'
      AND column_name = 'ma_don_hang'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.chi_tiet_bill_tien
      ALTER COLUMN ma_don_hang DROP NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.chi_tiet_bill_tien.ma_don_hang IS
  'Mã đơn hàng; có thể NULL nếu chỉ có ma_tracking / bill_row_key — gán sau hoặc khi tracking khớp orders.';
