
-- Migration to add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dob date; -- ngay_sinh
ALTER TABLE users ADD COLUMN IF NOT EXISTS official_date date; -- ngay_lam_chinh_thuc
ALTER TABLE users ADD COLUMN IF NOT EXISTS join_date date; -- ngay_vao_lam
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text; -- gioi_tinh
ALTER TABLE users ADD COLUMN IF NOT EXISTS marital_status text; -- tinh_trang_hon_nhan
ALTER TABLE users ADD COLUMN IF NOT EXISTS hometown text; -- que_quan
ALTER TABLE users ADD COLUMN IF NOT EXISTS address text; -- dia_chi_thuong_tru
ALTER TABLE users ADD COLUMN IF NOT EXISTS cccd text; -- cccd
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id text; -- employeeId (LUxxxxx)
