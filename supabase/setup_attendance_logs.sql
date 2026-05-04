-- Tạo bảng attendance_logs nếu chưa có
CREATE TABLE IF NOT EXISTS attendance_logs (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  check_in_time TIMESTAMPTZ NOT NULL,
  check_in_photo TEXT,
  check_out_time TIMESTAMPTZ,
  check_out_photo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tạo index để tăng tốc query
CREATE INDEX IF NOT EXISTS idx_attendance_user_email ON attendance_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_attendance_check_in_time ON attendance_logs(check_in_time);

-- Bật Row Level Security
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- Xóa các policy cũ nếu có
DROP POLICY IF EXISTS "Users can view their own attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Users can insert their own attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Users can update their own attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Admin can view all attendance" ON attendance_logs;

-- Policy 1: User có thể xem dữ liệu chấm công của chính họ
CREATE POLICY "Users can view their own attendance"
ON attendance_logs
FOR SELECT
USING (true); -- Cho phép tất cả user xem (hoặc có thể giới hạn: user_email = auth.jwt() ->> 'email')

-- Policy 2: User có thể insert dữ liệu chấm công của chính họ
CREATE POLICY "Users can insert their own attendance"
ON attendance_logs
FOR INSERT
WITH CHECK (true); -- Cho phép tất cả user insert (vì app đã kiểm tra email từ localStorage)

-- Policy 3: User có thể update dữ liệu chấm công của chính họ
CREATE POLICY "Users can update their own attendance"
ON attendance_logs
FOR UPDATE
USING (true) -- Cho phép tất cả user update
WITH CHECK (true);

-- Policy 4: Admin có thể xem tất cả (optional - nếu có role admin)
-- CREATE POLICY "Admin can view all attendance"
-- ON attendance_logs
-- FOR ALL
-- USING (auth.jwt() ->> 'email' = 'admin@marketing.com');

-- Grant permissions
GRANT ALL ON attendance_logs TO anon;
GRANT ALL ON attendance_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE attendance_logs_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE attendance_logs_id_seq TO authenticated;
