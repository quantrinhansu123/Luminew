-- Chuyển 3 cột trạng thái sang jsonb: { "Giá trị hiển thị": số_đơn }
-- Chạy một lần sau bao_cao_van_don.sql (bỏ qua nếu cột đã là jsonb).

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'bao_cao_van_don'
      AND c.column_name = 'trang_thai_giao_hang' AND c.data_type = 'text'
  ) THEN
    ALTER TABLE public.bao_cao_van_don
      ALTER COLUMN trang_thai_giao_hang TYPE jsonb USING (
        CASE
          WHEN trang_thai_giao_hang IS NULL OR trim(trang_thai_giao_hang) = '' THEN '{}'::jsonb
          ELSE jsonb_build_object(trim(trang_thai_giao_hang), 1)
        END
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'bao_cao_van_don'
      AND c.column_name = 'ket_qua_check' AND c.data_type = 'text'
  ) THEN
    ALTER TABLE public.bao_cao_van_don
      ALTER COLUMN ket_qua_check TYPE jsonb USING (
        CASE
          WHEN ket_qua_check IS NULL OR trim(ket_qua_check) = '' THEN '{}'::jsonb
          ELSE jsonb_build_object(trim(ket_qua_check), 1)
        END
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'bao_cao_van_don'
      AND c.column_name = 'trang_thai_thanh_toan' AND c.data_type = 'text'
  ) THEN
    ALTER TABLE public.bao_cao_van_don
      ALTER COLUMN trang_thai_thanh_toan TYPE jsonb USING (
        CASE
          WHEN trang_thai_thanh_toan IS NULL OR trim(trang_thai_thanh_toan) = '' THEN '{}'::jsonb
          ELSE jsonb_build_object(trim(trang_thai_thanh_toan), 1)
        END
      );
  END IF;
END $mig$;

ALTER TABLE public.bao_cao_van_don
  ALTER COLUMN trang_thai_giao_hang SET DEFAULT '{}'::jsonb,
  ALTER COLUMN ket_qua_check SET DEFAULT '{}'::jsonb,
  ALTER COLUMN trang_thai_thanh_toan SET DEFAULT '{}'::jsonb;

UPDATE public.bao_cao_van_don SET trang_thai_giao_hang = '{}'::jsonb WHERE trang_thai_giao_hang IS NULL;
UPDATE public.bao_cao_van_don SET ket_qua_check = '{}'::jsonb WHERE ket_qua_check IS NULL;
UPDATE public.bao_cao_van_don SET trang_thai_thanh_toan = '{}'::jsonb WHERE trang_thai_thanh_toan IS NULL;

ALTER TABLE public.bao_cao_van_don
  ALTER COLUMN trang_thai_giao_hang SET NOT NULL,
  ALTER COLUMN ket_qua_check SET NOT NULL,
  ALTER COLUMN trang_thai_thanh_toan SET NOT NULL;

COMMENT ON COLUMN public.bao_cao_van_don.trang_thai_giao_hang IS 'jsonb: { "Trạng thái giao": số đơn } trong nhóm key';
COMMENT ON COLUMN public.bao_cao_van_don.ket_qua_check IS 'jsonb: { "Kết quả check": số đơn } trong nhóm key';
COMMENT ON COLUMN public.bao_cao_van_don.trang_thai_thanh_toan IS 'jsonb: { "Trạng thái thanh toán": số đơn } trong nhóm key';
