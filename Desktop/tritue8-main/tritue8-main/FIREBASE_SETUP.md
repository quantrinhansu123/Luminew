# 🔐 Hướng dẫn Setup Google Authentication

## ✅ Bạn đã làm:

- ✓ Bật Google Authentication trên Firebase Console

## 📝 Còn cần làm:

### 1. Lấy Firebase Config

1. Mở **Firebase Console**: https://console.firebase.google.com/
2. Chọn project `upedu2-5df07`
3. Click vào **⚙️ Settings** (góc trên bên trái) → **Project settings**
4. Scroll xuống phần **Your apps** → **SDK setup and configuration**
5. Chọn **Config** (không phải npm)
6. Copy toàn bộ object `firebaseConfig`

### 2. Cập nhật file `firebase.ts`

Mở file `firebase.ts` và thay thế các giá trị sau:

```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY", // ← Thay bằng apiKey thật
  authDomain: "upedu2-5df07.firebaseapp.com",
  databaseURL:
    "https://morata-a9eba-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "upedu2-5df07",
  storageBucket: "upedu2-5df07.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // ← Thay bằng messagingSenderId thật
  appId: "YOUR_APP_ID", // ← Thay bằng appId thật
};
```

### 3. Thêm Authorized Domain (nếu cần)

Nếu deploy lên hosting, thêm domain vào danh sách authorized:

1. Trong Firebase Console → **Authentication**
2. Tab **Settings** → **Authorized domains**
3. Click **Add domain** và thêm:
   - `upedu2-5df07.web.app`
   - Domain custom của bạn (nếu có)

### 4. Test Local

```bash
npm run dev
```

Truy cập: http://localhost:5173

**Nếu gặp lỗi "auth/configuration-not-found":** → Kiểm tra lại Firebase Config
đã đúng chưa

### 5. Build và Deploy

```bash
npm run build
cd ..
firebase deploy --only hosting
```

## 🎯 Cách hoạt động:

1. **Khi chưa login:**

   - User thấy màn hình Login
   - Click "Đăng nhập bằng Google"
   - Chọn tài khoản Google

2. **Sau khi login:**

   - Tự động vào Landing Page
   - Hiển thị email ở góc phải
   - Có nút "Logout"

3. **Khi logout:**
   - Tự động quay về màn hình Login

## 🔧 Files đã tạo:

- `firebase.ts` - Firebase configuration
- `contexts/AuthContext.tsx` - Auth state management
- `components/Login.tsx` - Login UI
- Updated `App.tsx` - Protected routes
- Updated `LandingPage.tsx` - Logout button

## 📱 Screenshots chức năng:

### Login Page:

- Logo Tutoring Space
- Nút "Đăng nhập bằng Google" với icon
- Responsive design

### After Login:

- Header hiển thị email
- Nút Logout màu đỏ rượu
- Full access vào app

## ⚠️ Lưu ý:

- **KHÔNG commit** `firebase.ts` với API keys thật vào Git public
- Nên dùng environment variables cho production
- Google Authentication đã được bật, chỉ cần config là xong

## 🆘 Troubleshooting:

**Lỗi: "Firebase: Error (auth/configuration-not-found)"** → Kiểm tra `apiKey`,
`messagingSenderId`, `appId` trong `firebase.ts`

**Lỗi: "auth/unauthorized-domain"** → Thêm domain vào Authorized domains trong
Firebase Console

**Login popup bị block** → Cho phép popup trong browser settings

---

✅ **Sau khi làm xong, app sẽ có Google Authentication đầy đủ!** 🎉
