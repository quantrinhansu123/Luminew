-- Chạy trên Supabase SQL Editor nếu migration chưa apply.
-- Nguyên nhân: danh_sach_van_don.id = uuid, nhưng danh_sach_van_don_u1_history.danh_sach_van_don_id = bigint
-- → mọi lần bật/tắt U1 ghi lịch sử đều fail.

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
    RAISE NOTICE 'Changed danh_sach_van_don_u1_history.danh_sach_van_don_id to uuid';
  ELSE
    RAISE NOTICE 'Column already uuid (or table/column missing) — no change';
  END IF;
END $$;
