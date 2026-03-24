-- Fix loi PGRST204: missing column revenue_mess in sales_reports schema cache
-- Chay file nay trong Supabase SQL Editor

BEGIN;

ALTER TABLE public.sales_reports
ADD COLUMN IF NOT EXISTS revenue_mess NUMERIC DEFAULT 0;

-- Reload PostgREST schema cache de nhan cot moi ngay lap tuc
NOTIFY pgrst, 'reload schema';

COMMIT;
