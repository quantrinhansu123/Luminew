# Hướng dẫn cấu hình Email Link Authentication

## 📋 Tổng quan
Email Link Authentication cho phép người dùng đăng nhập không cần mật khẩu. Họ chỉ cần nhập email, và hệ thống sẽ gửi link đăng nhập đến email của họ.

## 🔧 Bước 1: Cấu hình Firebase Console

### 1.1. Bật Email Link Sign-in
1. Truy cập [Firebase Console](https://console.firebase.google.com/)
2. Chọn project **upedu2-5df07**
3. Vào **Authentication** → **Sign-in method**
4. Click vào **Email/Password**
5. Bật cả hai tùy chọn:
   - ✅ **Email/Password** (nếu chưa bật)
   - ✅ **Email link (passwordless sign-in)**
6. Click **Save**

### 1.2. Cấu hình Authorized Domains
1. Vẫn trong phần **Authentication** → **Settings** → **Authorized domains**
2. Thêm các domain sau (nếu chưa có):
   - `localhost` (cho development)
   - Domain production của bạn (ví dụ: `your-app.web.app`)
3. Click **Add domain** để thêm

### 1.3. Tùy chỉnh Email Template (Tùy chọn)
1. Vào **Authentication** → **Templates**
2. Chọn **Email link sign-in**
3. Tùy chỉnh nội dung email:
   - Thay đổi subject: "Đăng nhập vào Tutoring Space"
   - Tùy chỉnh body để phù hợp với brand
4. Click **Save**

## 📱 Bước 2: Test trên Web

### 2.1. Đăng nhập bằng Email Link
1. Chạy app: `npm run dev`
2. Mở trình duyệt tại `http://localhost:5173` (hoặc port khác nếu có)
3. Nhập email vào form "Đăng nhập bằng Email"
4. Click **Gửi Link**
5. Kiểm tra email (cả inbox và spam folder)
6. Click vào link trong email
7. Nếu mở trên cùng thiết bị/trình duyệt → tự động đăng nhập
8. Nếu mở trên thiết bị khác → nhập lại email để xác nhận

### 2.2. Test Cases
- ✅ Gửi email thành công
- ✅ Nhận email với link
- ✅ Click link và đăng nhập thành công
- ✅ Đăng nhập trên thiết bị khác (xác nhận email)
- ✅ Link hết hạn sau 1 giờ
- ✅ User được tạo trong Firebase Authentication

## 🔐 Bước 3: Security Best Practices

### 3.1. Email Domain Restrictions
Giới hạn email được phép đăng ký (nếu cần):
```typescript
// Trong AuthContext.tsx, thêm validation:
const sendEmailLink = async (email: string) => {
  // Chỉ cho phép email từ domain cụ thể
  const allowedDomains = ['yourdomain.com', 'company.edu.vn'];
  const emailDomain = email.split('@')[1];
  
  if (!allowedDomains.includes(emailDomain)) {
    throw new Error('Email domain không được phép');
  }
  
  // ... rest of the code
};
```

### 3.2. Rate Limiting
Firebase tự động giới hạn:
- Tối đa 5 email/phút cho mỗi địa chỉ email
- Tối đa 100 email/giờ cho mỗi project

### 3.3. Link Expiration
- Email link hết hạn sau **1 giờ**
- User cần request link mới nếu hết hạn

## 📲 Bước 4: Mobile Support (Android/iOS)

### 4.1. Android (React Native / Native)
Thêm vào `AndroidManifest.xml`:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" 
        android:host="your-project.firebaseapp.com" />
</intent-filter>
```

### 4.2. iOS (React Native / Native)
Thêm vào `Info.plist`:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>https</string>
    </array>
  </dict>
</array>
```

## 🎯 Tính năng đã implement

### ✅ Web Features
- [x] Form nhập email
- [x] Gửi email link
- [x] Hoàn tất đăng nhập từ link
- [x] Tự động detect khi user click vào email link
- [x] Lưu email vào localStorage
- [x] Xác nhận email nếu mở link trên thiết bị khác
- [x] Error handling và user feedback
- [x] Loading states
- [x] Responsive design

### 🔄 Flow hoàn chỉnh
1. User nhập email → Click "Gửi Link"
2. Email được gửi → Hiển thị thông báo thành công
3. User click link trong email
4. Nếu cùng thiết bị → Tự động đăng nhập
5. Nếu khác thiết bị → Yêu cầu nhập lại email
6. Đăng nhập thành công → Chuyển đến Landing Page

## 🚀 Deploy to Production

### Hosting URL
Khi deploy lên Firebase Hosting hoặc domain khác, cập nhật `actionCodeSettings`:

```typescript
// Trong AuthContext.tsx
const actionCodeSettings = {
  url: 'https://your-domain.com', // URL production
  handleCodeInApp: true,
};
```

### Dynamic Links (Deprecated)
⚠️ **Lưu ý**: Firebase Dynamic Links đã deprecated. Sử dụng Firebase App Hosting hoặc custom domain.

## 📚 Tài liệu tham khảo
- [Firebase Email Link Auth - Web](https://firebase.google.com/docs/auth/web/email-link-auth)
- [Firebase Email Link Auth - Android](https://firebase.google.com/docs/auth/android/email-link-auth)
- [Firebase Email Link Auth - iOS](https://firebase.google.com/docs/auth/ios/email-link-auth)

## ❓ Troubleshooting

### Lỗi "Invalid action code"
- Link đã hết hạn (>1 giờ)
- Link đã được sử dụng
- **Giải pháp**: Request link mới

### Email không nhận được
- Kiểm tra spam folder
- Đợi vài phút (có thể delay)
- Kiểm tra email address đúng chưa
- Verify Firebase configuration

### Link không hoạt động
- Kiểm tra authorized domains trong Firebase Console
- Đảm bảo URL match với configured URL
- Clear browser cache và localStorage

## 🎉 Hoàn tất!
Bây giờ app của bạn hỗ trợ 2 phương thức đăng nhập:
1. ✅ **Google Sign-In** (popup)
2. ✅ **Email Link** (passwordless)

