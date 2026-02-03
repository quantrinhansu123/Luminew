# 🔧 HƯỚNG DẪN SỬA LỖI 401 (Unauthorized)

## ⚠️ Vấn đề
Frontend không thể kết nối với Supabase database, trả về lỗi 401 (Unauthorized).

## ✅ Giải pháp

### Bước 1: Kiểm tra Anon Key

1. Mở Supabase Dashboard: https://qeiuslbmjcrbzqcuwcst.supabase.co
2. Vào **Settings** → **API**
3. Tìm **"anon public"** key (JWT token dài, bắt đầu bằng `eyJ...`)
4. Copy key này

### Bước 2: Cập nhật .env.local

Mở file `apps/web/.env.local` và cập nhật:

```env
NEXT_PUBLIC_SUPABASE_URL=https://qeiuslbmjcrbzqcuwcst.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste-anon-key-ở-đây>
```

### Bước 3: Tắt RLS trong Supabase

1. Mở Supabase SQL Editor:
   - https://qeiuslbmjcrbzqcuwcst.supabase.co/project/qeiuslbmjcrbzqcuwcst/sql/new

2. Copy **TOÀN BỘ** nội dung từ file `TURN-OFF-RLS-NOW.sql`

3. Paste vào SQL Editor và click **RUN** (hoặc Ctrl+Enter)

4. Đợi thấy message "Success" hoặc "Command executed successfully"

### Bước 4: Kiểm tra RLS đã tắt

1. Trong SQL Editor, chạy file `CHECK-RLS-STATUS.sql`
2. Tất cả bảng phải hiển thị: **"RLS ĐÃ TẮT"** (rowsecurity = false)
3. Nếu còn bảng nào hiển thị "RLS ĐANG BẬT", chạy lại `TURN-OFF-RLS-NOW.sql`

### Bước 5: Restart Server

```bash
# Dừng server (Ctrl+C)
# Sau đó chạy lại:
pnpm dev
```

### Bước 6: Refresh Trình duyệt

Nhấn **Ctrl+F5** để hard refresh

---

## 🔍 Kiểm tra

Mở file `apps/web/test-supabase-connection.html` trong trình duyệt và click "Test Connection".

- ✅ Nếu thấy "Connection Successful!" → Đã fix thành công!
- ❌ Nếu vẫn lỗi → Xem phần Troubleshooting bên dưới

---

## 🐛 Troubleshooting

### Vẫn lỗi 401 sau khi tắt RLS?

1. **Kiểm tra lại anon key:**
   - Vào Supabase Dashboard → Settings → API
   - Copy lại "anon public" key
   - Cập nhật trong `.env.local`
   - Restart server

2. **Kiểm tra RLS đã tắt chưa:**
   - Chạy `CHECK-RLS-STATUS.sql` trong Supabase SQL Editor
   - Tất cả bảng phải là `rowsecurity = false`

3. **Thử tạo RLS Policies thay vì tắt RLS:**
   - Chạy file `apps/web/CREATE-RLS-POLICIES.sql` trong Supabase SQL Editor

4. **Kiểm tra Network tab:**
   - Mở DevTools (F12) → Network tab
   - Xem request đến Supabase
   - Kiểm tra headers có `apikey` không
   - Kiểm tra response error message

### Lỗi "Missing Supabase environment variables"

- Kiểm tra file `.env.local` có tồn tại không
- Kiểm tra các biến `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` có đúng không
- Restart Next.js dev server sau khi sửa `.env.local`

---

## ⚠️ Lưu ý Bảo mật

- **Tắt RLS chỉ nên dùng cho development!**
- Trong production, nên:
  1. Bật lại RLS
  2. Tạo RLS policies phù hợp
  3. Sử dụng authentication đúng cách

---

## 📞 Cần hỗ trợ?

Nếu vẫn gặp vấn đề, cung cấp:
1. Kết quả của `CHECK-RLS-STATUS.sql`
2. Error message từ Network tab (F12)
3. Nội dung file `.env.local` (ẩn key nếu cần)
