# Hướng dẫn sửa lỗi RLS cho Attendance Logs

## Lỗi hiện tại
```
new row violates row-level security policy for table "attendance_logs"
```

## Cách sửa (2 phút)

### Bước 1: Mở Supabase Dashboard
1. Truy cập: https://supabase.com/dashboard
2. Chọn project của bạn
3. Vào **SQL Editor** (biểu tượng </> ở sidebar bên trái)

### Bước 2: Chạy SQL
Copy toàn bộ nội dung file `supabase/setup_attendance_logs.sql` và paste vào SQL Editor, sau đó nhấn **Run**

Hoặc copy đoạn SQL này:

```sql
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

-- Tạo index
CREATE INDEX IF NOT EXISTS idx_attendance_user_email ON attendance_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_attendance_check_in_time ON attendance_logs(check_in_time);

-- Bật RLS
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- Xóa policy cũ
DROP POLICY IF EXISTS "Users can view their own attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Users can insert their own attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Users can update their own attendance" ON attendance_logs;

-- Tạo policy mới
CREATE POLICY "Users can view their own attendance"
ON attendance_logs FOR SELECT USING (true);

CREATE POLICY "Users can insert their own attendance"
ON attendance_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own attendance"
ON attendance_logs FOR UPDATE USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON attendance_logs TO anon;
GRANT ALL ON attendance_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE attendance_logs_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE attendance_logs_id_seq TO authenticated;
```

### Bước 3: Kiểm tra
Sau khi chạy SQL thành công, refresh lại trang web và thử chấm công lại.

## Giải thích
- **RLS (Row Level Security)**: Cơ chế bảo mật của Supabase
- **Policy**: Quy tắc cho phép user thực hiện các thao tác (SELECT, INSERT, UPDATE)
- SQL trên sẽ cho phép tất cả user insert/update dữ liệu chấm công của họ

## Nếu vẫn lỗi
Kiểm tra:
1. Bảng `attendance_logs` đã được tạo chưa (vào Table Editor)
2. RLS có đang bật không (xem ở Table Editor > attendance_logs > RLS enabled)
3. Policies có được tạo không (xem ở Authentication > Policies)
