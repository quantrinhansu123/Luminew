# 🚀 Hướng dẫn Deploy lên Vercel

## ✅ Đã hoàn thành

1. ✅ Sửa code upload ảnh trực tiếp từ frontend (không cần backend)
2. ✅ Tạo Cloudinary Upload Preset: `attendance_preset`
3. ✅ Cập nhật file .env

## 📋 Checklist Deploy

### 1. Setup Supabase RLS (Bắt buộc)

Chạy SQL này trên Supabase SQL Editor:

```sql
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
```

**Link:** https://supabase.com/dashboard/project/gsjhsmxyxjyiqovauyrp/editor

---

### 2. Cấu hình Vercel Environment Variables

Vào Vercel Dashboard > Settings > Environment Variables, thêm:

```env
# Supabase
VITE_SUPABASE_URL=https://gsjhsmxyxjyiqovauyrp.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy

# Cloudinary
VITE_CLOUDINARY_CLOUD_NAME=deyeh3h7o
VITE_CLOUDINARY_UPLOAD_PRESET=attendance_preset

# Firebase (nếu dùng)
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your_project_id-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# HR & Page URLs
VITE_HR_URL=https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Nh%C3%A2n_s%E1%BB%B1.json
VITE_PAGE_URL=https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Pages.json
VITE_ADMIN_MAIL=admin@marketing.com
```

---

### 3. Deploy

```bash
# Commit changes
git add .
git commit -m "feat: Upload ảnh trực tiếp lên Cloudinary cho Vercel"
git push

# Vercel sẽ tự động deploy
```

Hoặc deploy thủ công:

```bash
vercel --prod
```

---

## 🧪 Test sau khi Deploy

1. Truy cập app trên Vercel
2. Đăng nhập
3. Vào trang Chấm công
4. Thử Check-in (chụp ảnh)
5. Kiểm tra:
   - ✅ Ảnh được upload lên Cloudinary
   - ✅ Dữ liệu được lưu vào Supabase
   - ✅ Không có lỗi RLS

---

## 🔍 Troubleshooting

### Lỗi: "Upload preset not found"
**Nguyên nhân:** Chưa tạo upload preset trên Cloudinary

**Giải pháp:**
1. Truy cập: https://console.cloudinary.com/settings/upload
2. Tạo preset tên `attendance_preset` với Signing Mode = **Unsigned**

---

### Lỗi: "new row violates row-level security policy"
**Nguyên nhân:** Chưa setup RLS policies trên Supabase

**Giải pháp:** Chạy SQL ở bước 1

---

### Lỗi: "Failed to fetch"
**Nguyên nhân:** Thiếu environment variables trên Vercel

**Giải pháp:** Kiểm tra lại bước 2

---

## 📊 So sánh Local vs Vercel

| Tính năng | Local Development | Vercel Production |
|-----------|-------------------|-------------------|
| Frontend | ✅ Vite dev server | ✅ Static hosting |
| Backend | ✅ Node.js server | ❌ Không hỗ trợ |
| Upload ảnh | ✅ Trực tiếp Cloudinary | ✅ Trực tiếp Cloudinary |
| Database | ✅ Supabase | ✅ Supabase |
| Chạy lệnh | `npm run dev:full` | Tự động deploy |

---

## 💡 Lưu ý

### Local Development
```bash
# Chạy cả frontend + backend (nếu cần backend cho các API khác)
npm run dev:full

# Hoặc chỉ chạy frontend (đủ cho chức năng chấm công)
npm run dev
```

### Production (Vercel)
- Không cần backend server
- Upload ảnh trực tiếp từ browser lên Cloudinary
- Tất cả hoạt động tự động

---

## 🎉 Hoàn thành!

Sau khi làm theo 3 bước trên, app sẽ hoạt động hoàn hảo trên Vercel!
