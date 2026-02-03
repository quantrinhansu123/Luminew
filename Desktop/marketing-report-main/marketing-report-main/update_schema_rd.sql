-- Add department column to detail_reports
ALTER TABLE public.detail_reports ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'MKT';

-- Update existing rows to have 'MKT' if null (safe assumption for now as only MKT existed)
UPDATE public.detail_reports SET department = 'MKT' WHERE department IS NULL;

-- Create rd_pages table
CREATE TABLE IF NOT EXISTS public.rd_pages (
  id TEXT PRIMARY KEY,
  page_name TEXT,
  rd_staff TEXT, -- Replaces mkt_staff
  product TEXT,
  market TEXT,
  pancake_id TEXT,
  page_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for rd_pages
ALTER TABLE public.rd_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON public.rd_pages FOR ALL USING (true) WITH CHECK (true);
