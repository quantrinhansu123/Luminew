-- Fix: danh_sach_van_don.id trên production là UUID; cột lịch sử từng khai báo bigint
-- nên mọi INSERT (kèm record id) đều fail và lịch sử U1 luôn trống.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'danh_sach_van_don_u1_history'
      AND column_name = 'danh_sach_van_don_id'
      AND udt_name = 'int8'
  ) THEN
    ALTER TABLE public.danh_sach_van_don_u1_history
      ALTER COLUMN danh_sach_van_don_id TYPE uuid
      USING NULL;
  END IF;
END $$;
