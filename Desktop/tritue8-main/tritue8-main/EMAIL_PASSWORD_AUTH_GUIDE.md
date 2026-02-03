# 🔐 Hướng dẫn Đăng ký/Đăng nhập bằng Email & Mật khẩu

## ✅ Tính năng đã implement

### 3 phương thức xác thực:
1. **Email + Mật khẩu** ⭐ MỚI
   - Đăng ký tài khoản mới
   - Đăng nhập với email/password
   - Xác nhận email tự động

2. **Email Link** (Passwordless)
   - Đăng nhập không cần mật khẩu
   - Nhận link qua email

3. **Google Sign-In**
   - Đăng nhập nhanh với Google

## 📋 Flow đăng ký

### Bước 1: User click "Chưa có tài khoản? Đăng ký ngay"
```
┌─────────────────────────────────┐
│   Đăng ký tài khoản             │
│   Tạo tài khoản mới để bắt đầu  │
│                                 │
│   Email: [____________]         │
│   Mật khẩu: [____________]      │
│   Xác nhận MK: [____________]   │
│                                 │
│   [🎉 Tạo tài khoản]            │
│                                 │
│   ← Đã có tài khoản? Đăng nhập  │
└─────────────────────────────────┘
```

### Bước 2: Nhập thông tin
- Email: phải hợp lệ (có @ và domain)
- Mật khẩu: tối thiểu 6 ký tự
- Xác nhận mật khẩu: phải khớp với mật khẩu

### Bước 3: Click "🎉 Tạo tài khoản"
- Tài khoản được tạo trong Firebase
- **Email xác nhận tự động được gửi**
- Hiển thị thông báo: "🎉 Đăng ký thành công! Vui lòng kiểm tra email..."
- Tự động chuyển về form đăng nhập sau 3 giây

### Bước 4: Kiểm tra email
```
From: noreply@tutoring-space.firebaseapp.com
Subject: Verify your email for Tutoring Space

Click vào link để xác nhận email:
[Verify Email]
```

### Bước 5: Click link xác nhận
- Email được xác nhận
- Có thể đăng nhập ngay

## 🔐 Flow đăng nhập

### Với Email/Password:
```
┌─────────────────────────────────┐
│   Đăng nhập                      │
│   Chào mừng bạn trở lại          │
│                                  │
│   Email: [____________]          │
│   Mật khẩu: [____________]       │
│                                  │
│   [🔐 Đăng nhập]                 │
│                                  │
│   → Chưa có tài khoản? Đăng ký   │
└─────────────────────────────────┘
```

1. Nhập email + password
2. Click "🔐 Đăng nhập"
3. Đăng nhập thành công → Vào Landing Page

## ⚠️ Xử lý lỗi

### Lỗi đăng ký:
- ❌ **Email đã được sử dụng**: Email này đã được đăng ký
- ❌ **Email không hợp lệ**: Định dạng email sai
- ❌ **Mật khẩu quá yếu**: Phải ít nhất 6 ký tự
- ❌ **Mật khẩu không khớp**: Xác nhận mật khẩu sai

### Lỗi đăng nhập:
- ❌ **Email chưa được đăng ký**: Tài khoản không tồn tại
- ❌ **Mật khẩu không đúng**: Sai mật khẩu
- ❌ **Quá nhiều lần thử**: Bị tạm khóa, thử lại sau

## 🎨 UI/UX Features

### 1. **Auto-clear error**
- Error tự động mất khi user bắt đầu gõ

### 2. **Loading states**
```
[Đang đăng ký...]  // Với spinner
[Đang đăng nhập...] // Với spinner
```

### 3. **Success messages**
```
✅ Đăng nhập thành công!
🎉 Đăng ký thành công! Vui lòng kiểm tra email...
```

### 4. **Toggle button**
- Chuyển đổi mượt giữa Login ↔ Register
- Tự động clear form khi chuyển

### 5. **Password validation**
- Hiển thị "••••••••"
- Required field
- Min 6 characters
- Confirm password match

## 🔧 Cấu hình Firebase (Đã có sẵn)

Email/Password authentication đã được bật mặc định trong Firebase. Không cần cấu hình thêm!

### Kiểm tra:
1. Firebase Console → Authentication
2. Sign-in method → Email/Password
3. Should be: ✅ **Enabled**

## 🧪 Test Cases

### Test Đăng ký:
```
✅ Đăng ký với email hợp lệ
✅ Nhận email verification
✅ Lỗi khi email đã tồn tại
✅ Lỗi khi password < 6 chars
✅ Lỗi khi confirm password không khớp
✅ Auto switch to login sau khi đăng ký
```

### Test Đăng nhập:
```
✅ Đăng nhập với email/password đúng
✅ Lỗi khi email chưa đăng ký
✅ Lỗi khi password sai
✅ Lỗi khi quá nhiều lần thử
✅ Warning khi email chưa verify (optional)
```

### Test Toggle:
```
✅ Click "Đăng ký ngay" → Form đổi sang Register
✅ Click "Đăng nhập ngay" → Form đổi sang Login
✅ Password field clear khi toggle
✅ Error clear khi toggle
```

## 📱 Email Verification

### Tùy chỉnh email template:
1. Firebase Console → Authentication → Templates
2. Chọn "Email address verification"
3. Customize:
   - Subject: "Xác nhận email của bạn - Tutoring Space"
   - Body: Tùy chỉnh nội dung
4. Save

### Kiểm tra email verification:
```typescript
// Trong AuthContext.tsx
const userCredential = await signInWithEmailAndPassword(auth, email, password);

if (!userCredential.user.emailVerified) {
  console.warn('⚠️ Email chưa được xác nhận');
  // Có thể:
  // 1. Cho phép đăng nhập (hiện tại)
  // 2. Chặn đăng nhập cho đến khi verify
  // 3. Hiển thị banner cảnh báo
}
```

## 🚀 Tính năng nâng cao (Optional)

### 1. Resend verification email:
```typescript
import { sendEmailVerification } from 'firebase/auth';

const resendVerificationEmail = async () => {
  if (auth.currentUser && !auth.currentUser.emailVerified) {
    await sendEmailVerification(auth.currentUser);
    alert('Email xác nhận đã được gửi lại!');
  }
};
```

### 2. Password reset:
```typescript
import { sendPasswordResetEmail } from 'firebase/auth';

const resetPassword = async (email: string) => {
  await sendPasswordResetEmail(auth, email);
  alert('Email đặt lại mật khẩu đã được gửi!');
};
```

### 3. Require email verification:
```typescript
// Trong signInWithEmail function
if (!userCredential.user.emailVerified) {
  await auth.signOut();
  throw new Error('Vui lòng xác nhận email trước khi đăng nhập');
}
```

## 📊 So sánh 3 phương thức

| Tính năng | Email/Password | Email Link | Google |
|-----------|---------------|------------|--------|
| **Bảo mật** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Dễ dùng** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Tốc độ** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Cần nhớ password** | ✅ Có | ❌ Không | ❌ Không |
| **Verification** | Email | Email | Tự động |
| **Mobile-friendly** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

## ✨ Best Practices

1. **Always validate email format** ✅
2. **Minimum password length: 6** ✅
3. **Confirm password on registration** ✅
4. **Send email verification** ✅
5. **Handle all Firebase error codes** ✅
6. **Show loading states** ✅
7. **Auto-clear errors on input change** ✅
8. **Provide helpful error messages** ✅

## 🎉 Hoàn tất!

Bây giờ app của bạn có **3 phương thức đăng nhập** hoàn chỉnh:
1. ✅ **Email + Password** (with verification)
2. ✅ **Email Link** (passwordless)
3. ✅ **Google Sign-In**

Users có thể chọn phương thức phù hợp nhất với họ! 🚀

