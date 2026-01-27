-- Add firebase_id column to sales_reports table
ALTER TABLE sales_reports 
ADD COLUMN IF NOT EXISTS firebase_id text;

-- Create a unique index on firebase_id to support UPSERT (ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_reports_firebase_id ON sales_reports (firebase_id);
