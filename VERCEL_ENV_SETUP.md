# Hướng dẫn cấu hình Environment Variables trên Vercel

## ⚠️ Vấn đề
Khi deploy lên Vercel, ứng dụng cần biến môi trường để kết nối với Supabase. File `.env` chỉ hoạt động ở local, không được sử dụng trên Vercel.

## ✅ Giải pháp: Cấu hình Environment Variables trên Vercel Dashboard

### Bước 1: Đăng nhập vào Vercel Dashboard
- Truy cập: https://vercel.com/dashboard
- Đăng nhập vào tài khoản của bạn
- Chọn project của bạn (Lumifull hoặc tên project tương ứng)

### Bước 2: Vào Settings > Environment Variables
- Click vào **project name** ở dashboard
- Click vào tab **Settings** (ở menu trên cùng)
- Click vào **Environment Variables** ở menu bên trái

### Bước 3: Thêm các biến môi trường

Thêm **2 biến môi trường** sau:

#### Biến 1:
- **Key:** `VITE_SUPABASE_URL`
- **Value:** `https://gsjhsmxyxjyiqovauyrp.supabase.co`
- **Environment:** Chọn tất cả: ☑️ Production, ☑️ Preview, ☑️ Development

#### Biến 2:
- **Key:** `VITE_SUPABASE_ANON_KEY`
- **Value:** `sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy`
- **Environment:** Chọn tất cả: ☑️ Production, ☑️ Preview, ☑️ Development

### Bước 4: Click Save
- Sau khi thêm xong cả 2 biến, click nút **Save** ở cuối trang

### Bước 5: ⚠️ QUAN TRỌNG - Redeploy
**Sau khi thêm biến môi trường, BẮT BUỘC phải Redeploy để áp dụng!**

Có 2 cách:

#### Cách 1: Redeploy qua Dashboard (Nhanh nhất)
1. Vào tab **Deployments** (ở menu trên cùng)
2. Tìm deployment mới nhất
3. Click vào 3 chấm (⋯) bên cạnh deployment
4. Chọn **Redeploy**
5. Đợi deployment hoàn thành (1-2 phút)

#### Cách 2: Push commit mới lên Git
1. Tạo một commit mới bất kỳ (có thể chỉ sửa README)
2. Push lên GitHub
3. Vercel sẽ tự động deploy

### Bước 6: Kiểm tra
Sau khi redeploy xong:
1. Mở ứng dụng trên Vercel
2. Mở Developer Console (F12)
3. Kiểm tra xem có còn lỗi "supabaseUrl is required" không
4. Nếu không còn lỗi = ✅ Thành công!

## ❓ Troubleshooting

### Vẫn còn lỗi sau khi redeploy?
1. **Kiểm tra lại Environment Variables:**
   - Vào Settings > Environment Variables
   - Đảm bảo có đúng 2 biến: `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`
   - Đảm bảo giá trị chính xác (copy-paste lại)
   - Đảm bảo đã chọn Environment (Production/Preview/Development)

2. **Kiểm tra build logs:**
   - Vào tab Deployments
   - Click vào deployment mới nhất
   - Xem Build Logs
   - Tìm xem có lỗi gì trong quá trình build không

3. **Clear cache và redeploy:**
   - Trong trang Settings, tìm phần "Build & Development Settings"
   - Hoặc dùng Vercel CLI: `vercel --prod --force`

### Làm sao biết env vars đã được inject?
Trong build logs của Vercel, bạn sẽ thấy:
```
> vite build
Environment variables loaded from .env
```

Nhưng trên Vercel, env vars được inject tự động, không cần file .env.

## 📝 Lưu ý

- ⚠️ **KHÔNG** commit file `.env` vào git (đã được thêm vào `.gitignore`)
- ✅ Biến môi trường trên Vercel được mã hóa và bảo mật
- ✅ Sau mỗi lần thêm/sửa biến môi trường, **BẮT BUỘC phải redeploy**
- ✅ Biến môi trường chỉ được inject vào **build time**, không phải runtime
- ✅ Nếu bạn có nhiều môi trường (Production, Preview, Development), cần thêm env vars cho cả 3

## 🔗 Tham khảo

- [Vercel Environment Variables Documentation](https://vercel.com/docs/concepts/projects/environment-variables)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
