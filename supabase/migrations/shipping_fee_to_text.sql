-- Chạy trong Supabase → SQL Editor
-- Ép orders.shipping_fee (cột app: "Ngày đối soát kế toán") sang text.
-- Chạy lại an toàn: bỏ qua nếu cột đã là text / varchar.

DO $$
DECLARE
  dt text;
BEGIN
  SELECT c.data_type INTO dt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'orders'
    AND c.column_name = 'shipping_fee';

  IF dt IS NULL THEN
    RAISE NOTICE 'orders.shipping_fee: column not found, skip';
    RETURN;
  END IF;

  IF dt IN ('text', 'character varying', 'character') THEN
    RAISE NOTICE 'orders.shipping_fee: already text-like (%), skip', dt;
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.orders ALTER COLUMN shipping_fee TYPE text USING (shipping_fee::text)';
  RAISE NOTICE 'orders.shipping_fee: altered from % to text', dt;
END $$;
