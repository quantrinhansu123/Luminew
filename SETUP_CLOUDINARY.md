# Hướng dẫn Setup Cloudinary cho Vercel Deploy

## Vấn đề
- Vercel chỉ host frontend (static files), không chạy được Node.js backend (`server.js`)
- Không thể dùng `npm run dev:full` trên Vercel
- Cần upload ảnh trực tiếp từ browser lên Cloudinary

## Giải pháp: Unsigned Upload

### Bước 1: Tạo Upload Preset trên Cloudinary

1. **Đăng nhập Cloudinary Dashboard**
   - Truy cập: https://console.cloudinary.com/
   - Đăng nhập với tài khoản của bạn

2. **Vào Settings**
   - Click vào biểu tượng ⚙️ (Settings) ở góc trên bên phải
   - Hoặc truy cập: https://console.cloudinary.com/settings

3. **Tạo Upload Preset**
   - Vào tab **Upload**
   - Scroll xuống phần **Upload presets**
   - Click **Add upload preset**

4. **Cấu hình Upload Preset**
   ```
   Preset name: attendance_preset
   Signing Mode: Unsigned
   Folder: attendance (optional - để tổ chức ảnh)
   ```

5. **Lưu lại**
   - Click **Save**
   - Copy tên preset: `attendance_preset`

### Bước 2: Cập nhật file .env

Thêm/sửa các dòng sau trong file `.env`:

```env
# Cloudinary Configuration (Frontend - Unsigned Upload)
VITE_CLOUDINARY_CLOUD_NAME=deyeh3h7o
VITE_CLOUDINARY_UPLOAD_PRESET=attendance_preset
```

### Bước 3: Cập nhật Vercel Environment Variables

1. Vào Vercel Dashboard: https://vercel.com/dashboard
2. Chọn project của bạn
3. Vào **Settings** > **Environment Variables**
4. Thêm 2 biến:
   ```
   VITE_CLOUDINARY_CLOUD_NAME = deyeh3h7o
   VITE_CLOUDINARY_UPLOAD_PRESET = attendance_preset
   ```
5. Click **Save**

### Bước 4: Redeploy

```bash
git add .
git commit -m "Fix: Upload ảnh trực tiếp lên Cloudinary"
git push
```

Vercel sẽ tự động deploy lại.

## Kiểm tra

1. Truy cập app trên Vercel
2. Thử chức năng chấm công
3. Ảnh sẽ được upload trực tiếp từ browser lên Cloudinary

## Lưu ý

### ✅ Ưu điểm
- Hoạt động trên cả local và Vercel
- Không cần backend server
- Upload nhanh hơn (trực tiếp từ browser)

### ⚠️ Bảo mật
- Unsigned upload cho phép bất kỳ ai có preset name đều có thể upload
- Nên set giới hạn:
  - Max file size: 5MB
  - Allowed formats: jpg, png, jpeg
  - Rate limiting

### 🔒 Tăng cường bảo mật (Optional)

Trong Cloudinary Upload Preset settings:
```
Max file size: 5 MB
Allowed formats: jpg, png, jpeg
Max image width: 1920
Max image height: 1920
```

## Troubleshooting

### Lỗi: "Upload preset not found"
- Kiểm tra tên preset có đúng không
- Kiểm tra Signing Mode = **Unsigned**

### Lỗi: "Invalid cloud name"
- Kiểm tra `VITE_CLOUDINARY_CLOUD_NAME` trong .env
- Kiểm tra environment variables trên Vercel

### Ảnh không hiển thị
- Kiểm tra URL trả về từ Cloudinary
- Kiểm tra CORS settings trên Cloudinary
