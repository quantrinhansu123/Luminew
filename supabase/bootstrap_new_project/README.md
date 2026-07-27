# Bootstrap Supabase mới (clone LUMI OMS)

Gói SQL tối thiểu để dựng **bảng `users` + RBAC** trên một project Supabase trống — đủ để app login / phân quyền chạy được.

## Bước 1 — Tạo project Supabase mới

1. Vào [https://supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Lấy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

## Bước 2 — Chạy SQL

Dashboard Supabase → **SQL Editor** → New query → dán lần lượt:

1. `01_users_and_rbac.sql` (bắt buộc)
2. (Tuỳ chọn) các migration nghiệp vụ khác trong `supabase/migrations/` khi bạn cần orders, báo cáo…

## Bước 3 — Cấu hình web clone

Trong repo clone, tạo `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

Rồi:

```bash
npm install
npm run dev
```

## Tài khoản seed (sau khi chạy SQL)

| Field | Value |
|-------|--------|
| Email | `admin@example.com` |
| Password | `admin123` |
| Role | `super_admin` |

**Đổi mật khẩu ngay** sau lần đăng nhập đầu (Hồ sơ / Admin Tools).

## Ghi chú quan trọng

- App **không** dùng Supabase Auth session cho login thường ngày: mật khẩu nằm cột `users.password` (bcrypt), client gọi bằng **anon key**.
- Policy RLS hiện tại cho `anon`/`authenticated` **full CRUD** trên `users` + RBAC (giống production hiện tại). Khi harden bảo mật, thu hẹp policy và chuyển sang Auth/JWT.
- Clone web = copy code + `.env` mới; **không** copy data production trừ khi bạn chủ động export/import.
- Chỉ `users` + RBAC **chưa đủ** toàn bộ OMS (còn `orders`, `detail_reports`, …). Đây là nền tảng đăng nhập để bạn dựng tiếp.

## Cột bảng `users` (tóm tắt)

| Cột | Kiểu | Ý nghĩa |
|-----|------|---------|
| `id` | uuid PK | |
| `email` | text UNIQUE | Đăng nhập |
| `username` / `user_name` / `name` | text | Tên hiển thị / login phụ |
| `password` | text | bcrypt hash |
| `role` | text | `user` / `leader` / `admin` / `super_admin` / … |
| `team`, `branch`, `department`, `position`, `shift` | text | Tổ chức |
| `selected_personnel` | jsonb[] | Nhân sự được xem |
| `leader_teams` | jsonb[] | Team leader quản lý |
| `can_day_ffm` | boolean | Quyền đẩy FFM |
| `id_appsheet`, `avatar_url` | text | |
| `dob`, `official_date` | date | |
| `created_by`, `updated_by` | text | |
| `created_at`, `updated_at` | timestamptz | |
