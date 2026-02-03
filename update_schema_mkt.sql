-- Add missing columns to detail_reports table
ALTER TABLE public.detail_reports 
ADD COLUMN IF NOT EXISTS "TKQC" TEXT,
ADD COLUMN IF NOT EXISTS "id_NS" TEXT,
ADD COLUMN IF NOT EXISTS "CPQC theo TKQC" NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS "Báo cáo theo Page" TEXT,
ADD COLUMN IF NOT EXISTS "Trạng thái" TEXT,
ADD COLUMN IF NOT EXISTS "Cảnh báo" TEXT;

-- Verify columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'detail_reports';
