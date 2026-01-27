-- Create rd_reports table
CREATE TABLE IF NOT EXISTS rd_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    email TEXT,
    team TEXT,
    branch TEXT,
    position TEXT,
    date DATE NOT NULL,
    shift TEXT,
    product TEXT,
    market TEXT,
    mess_count INTEGER DEFAULT 0,
    response_count INTEGER DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    revenue_mess NUMERIC DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_rd_reports_date ON rd_reports(date);
CREATE INDEX IF NOT EXISTS idx_rd_reports_email ON rd_reports(email);
CREATE INDEX IF NOT EXISTS idx_rd_reports_created_at ON rd_reports(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE rd_reports ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read
CREATE POLICY "Allow authenticated users to read rd_reports"
ON rd_reports FOR SELECT
TO authenticated
USING (true);

-- Create policy to allow authenticated users to insert
CREATE POLICY "Allow authenticated users to insert rd_reports"
ON rd_reports FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create policy to allow users to update their own reports
CREATE POLICY "Allow users to update their own rd_reports"
ON rd_reports FOR UPDATE
TO authenticated
USING (auth.jwt() ->> 'email' = email)
WITH CHECK (auth.jwt() ->> 'email' = email);

-- Create policy to allow users to delete their own reports
CREATE POLICY "Allow users to delete their own rd_reports"
ON rd_reports FOR DELETE
TO authenticated
USING (auth.jwt() ->> 'email' = email);

-- Grant permissions to authenticated users
GRANT ALL ON rd_reports TO authenticated;

-- Add comment to table
COMMENT ON TABLE rd_reports IS 'Manual R&D reports submitted by team members';
