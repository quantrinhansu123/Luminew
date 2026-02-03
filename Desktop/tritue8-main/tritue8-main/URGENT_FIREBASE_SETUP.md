# 🔴 BẮT BUỘC: Bật Email Link Authentication trong Firebase

## ⚠️ Lỗi hiện tại
Nút "Gửi Link" không hoạt động vì **Email Link Authentication chưa được bật trong Firebase Console**.

## 🔧 Cách sửa (5 phút):

### Bước 1: Mở Firebase Console
1. Truy cập: https://console.firebase.google.com/
2. Chọn project: **upedu2-5df07**

### Bước 2: Bật Email Link Sign-In
1. Click vào **Authentication** (menu bên trái)
2. Click tab **Sign-in method**
3. Tìm và click vào **Email/Password**
4. Bật **cả hai** tùy chọn:
   ```
   ✅ Enable (Email/Password)
   ✅ Enable (Email link - passwordless sign-in)
   ```
5. Click nút **Save**

### Bước 3: Kiểm tra Authorized Domains
1. Vẫn trong **Authentication** → Click tab **Settings**
2. Kéo xuống phần **Authorized domains**
3. Đảm bảo có các domain sau:
   - ✅ `localhost`
   - ✅ `upedu2-5df07.firebaseapp.com` (hoặc domain của bạn)

### Bước 4: Test lại
1. Reload trang web
2. Nhập email vào form "Đăng nhập bằng Email"
3. Click "Gửi Link"
4. Kiểm tra email (inbox hoặc spam folder)
5. Click vào link trong email để đăng nhập

## ✅ Sau khi bật xong:

### Nếu thành công:
- Thấy thông báo: **"✅ Link đăng nhập đã được gửi đến email của bạn..."**
- Nhận được email từ Firebase có tiêu đề kiểu: "Sign in to Tutoring Space"
- Click link trong email → Tự động đăng nhập

### Nếu vẫn lỗi:
Kiểm tra **Console Log** trong browser (F12):
- `auth/unauthorized-continue-uri` → Domain chưa được authorize
- `auth/invalid-email` → Email không hợp lệ
- `auth/missing-continue-uri` → Cấu hình Firebase sai

## 🎯 Lợi ích của Email Link Authentication:
- ✅ **Không cần mật khẩu** - An toàn hơn
- ✅ **Đơn giản** - Chỉ cần click link trong email
- ✅ **Bảo mật cao** - Link tự động hết hạn sau 1 giờ
- ✅ **Hoạt động trên mọi thiết bị** - Mobile, Desktop, Tablet

## 📱 Screenshot hướng dẫn:

### 1. Vào Authentication
```
Firebase Console
├── Authentication (click vào đây)
│   ├── Users
│   ├── Sign-in method (click vào đây)
│   └── Settings
```

### 2. Enable Email/Password
```
Sign-in method
├── Google ✅ Enabled
├── Email/Password (click vào đây)
│   ├── Enable ☐ → Tick vào đây
│   └── Email link (passwordless sign-in) ☐ → Tick vào đây
└── Save (click)
```

## 🆘 Cần trợ giúp?
Nếu vẫn không được, hãy:
1. Check lại **Sign-in method** đã enable chưa
2. Check **Console log** (F12) để xem lỗi cụ thể
3. Đảm bảo đang test trên `localhost` hoặc domain đã authorize

---

**Quan trọng**: Sau khi enable, có thể cần đợi 1-2 phút để Firebase cập nhật cấu hình!

