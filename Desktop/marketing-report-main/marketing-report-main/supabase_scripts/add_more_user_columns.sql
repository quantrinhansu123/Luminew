-- Add missing columns based on user feedback/image
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS identity_issue_date DATE,
ADD COLUMN IF NOT EXISTS identity_issue_place TEXT,
ADD COLUMN IF NOT EXISTS employment_status TEXT;

-- Update comments
COMMENT ON COLUMN public.users.identity_issue_date IS 'Ngày cấp CCCD/CMND';
COMMENT ON COLUMN public.users.identity_issue_place IS 'Nơi cấp CCCD/CMND';
COMMENT ON COLUMN public.users.employment_status IS 'Trạng thái lao động (Chính thức, Thử việc...)';
