-- Đồng bộ schema: migration rebuild_users có cột user_name; DB remote có thể thiếu nếu chạy lệch bản.
-- Khắc phục lỗi Postgres 42703 "column users.user_name does not exist" cho mọi truy vấn/UPDATE cũ.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_name text;
