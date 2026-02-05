# Hướng Dẫn: Bảng Quản Lý Tài Khoản Đăng Nhập

## 📋 Tổng Quan

Hệ thống đã được bổ sung bảng `auth_accounts` để quản lý riêng phần authentication, tách biệt với bảng `users`. Điều này giúp:

- ✅ Tách biệt concerns: User info vs Authentication
- ✅ Bảo mật tốt hơn: Quản lý password, login attempts, 2FA
- ✅ Tracking: Lịch sử đăng nhập, password history
- ✅ Flexible: Dễ mở rộng thêm tính năng bảo mật

## 🗂️ Cấu Trúc Bảng

### 1. `auth_accounts` - Tài khoản đăng nhập

**Các cột chính:**
- `id` (UUID): Primary key
- `username` (TEXT): Username (optional, có thể null)
- `email` (TEXT): Email (required, unique)
- `password_hash` (TEXT): Mật khẩu đã hash (bcrypt)
- `user_id` (TEXT): Foreign key đến bảng `users`
- `status`: `'active'`, `'inactive'`, `'locked'`, `'suspended'`
- `login_attempts`: Số lần đăng nhập sai
- `locked_until`: Thời gian unlock (nếu bị lock)
- `last_login_at`, `last_login_ip`, `last_login_device`
- `password_changed_at`, `password_expires_at`
- `must_change_password`: Bắt buộc đổi mật khẩu lần đầu
- `password_reset_token`, `password_reset_expires_at`
- `two_factor_enabled`, `two_factor_secret`, `backup_codes`

### 2. `login_history` - Lịch sử đăng nhập

**Các cột chính:**
- `id` (UUID): Primary key
- `auth_account_id`: Foreign key đến `auth_accounts`
- `user_id`: Foreign key đến `users`
- `email`: Email đăng nhập
- `login_at`: Thời gian đăng nhập
- `login_ip`, `user_agent`, `device_type`, `browser`, `os`
- `status`: `'success'`, `'failed'`, `'blocked'`
- `failure_reason`: Lý do thất bại
- `country`, `city`, `latitude`, `longitude`
- `session_id`, `session_duration`

### 3. `password_history` - Lịch sử mật khẩu

**Các cột chính:**
- `id` (UUID): Primary key
- `auth_account_id`: Foreign key đến `auth_accounts`
- `user_id`: Foreign key đến `users`
- `password_hash`: Mật khẩu cũ (đã hash)
- `changed_at`: Thời gian đổi
- `changed_by`: Người đổi

## 🚀 Cách Sử Dụng

### Bước 1: Tạo Bảng

Chạy script trong Supabase Dashboard > SQL Editor:

```sql
-- Chạy file: supabase_scripts/create_auth_accounts_table.sql
```

### Bước 2: Migrate Dữ Liệu (Nếu Cần)

Nếu bạn đã có dữ liệu trong bảng `users`, chạy script migration:

```sql
-- Chạy file: supabase_scripts/migrate_users_to_auth_accounts.sql
```

### Bước 3: Tạo Tài Khoản Mới

```sql
-- Tạo auth account mới
INSERT INTO public.auth_accounts (
    username,
    email,
    password_hash,
    user_id,
    status
) VALUES (
    'john_doe',
    'john@example.com',
    '$2a$10$...',  -- Password đã hash bằng bcrypt
    'user-id-from-users-table',
    'active'
);
```

## 🔐 Các Functions Hữu Ích

### 1. Log Login Attempt

```sql
-- Ghi log đăng nhập
SELECT public.log_login_attempt(
    'auth-account-id'::UUID,
    'user-id',
    'email@example.com',
    'success',  -- hoặc 'failed'
    '192.168.1.1',  -- IP
    'Mozilla/5.0...',  -- User agent
    NULL  -- Failure reason (nếu failed)
);
```

### 2. Save Password to History

```sql
-- Lưu mật khẩu cũ vào history khi đổi mật khẩu
SELECT public.save_password_to_history(
    'auth-account-id'::UUID,
    'user-id',
    'old-password-hash',
    'admin@example.com'  -- Changed by
);
```

## 📊 Views Có Sẵn

### 1. `auth_accounts_with_users`

Xem thông tin auth account kèm user info:

```sql
SELECT * FROM public.auth_accounts_with_users
WHERE email = 'user@example.com';
```

### 2. `login_stats_daily`

Thống kê đăng nhập theo ngày:

```sql
SELECT * FROM public.login_stats_daily
WHERE login_date >= CURRENT_DATE - INTERVAL '7 days';
```

## 🔒 Bảo Mật

### RLS Policies

- **Admin**: Xem và sửa tất cả accounts
- **User**: Chỉ xem và sửa account của chính mình
- **Password History**: Chỉ admin mới xem được

### Auto-Lock Account

- Sau **5 lần** đăng nhập sai, account tự động bị lock
- Lock trong **30 phút**
- Tự động unlock sau khi hết thời gian

### Password Requirements

- Password phải được hash bằng **bcrypt** (không lưu plain text)
- Có thể enforce password expiration
- Có thể prevent reuse password cũ (dùng `password_history`)

## 🔄 Migration từ users sang auth_accounts

Nếu bạn đang dùng bảng `users` để login, có thể:

### Option 1: Giữ cả 2 bảng (Dual Write)

- Khi tạo user mới: Tạo cả trong `users` và `auth_accounts`
- Khi login: Check từ `auth_accounts` trước, fallback về `users` nếu chưa migrate

### Option 2: Migrate hoàn toàn

1. Chạy script migration
2. Update code để chỉ dùng `auth_accounts`
3. Có thể giữ `users` để backward compatibility

## 📝 Ví Dụ Sử Dụng trong Code

### JavaScript/TypeScript

```javascript
import { supabase } from './supabase/config';
import bcrypt from 'bcryptjs';

// 1. Tạo auth account
async function createAuthAccount(email, password, userId) {
  const passwordHash = bcrypt.hashSync(password, 10);
  
  const { data, error } = await supabase
    .from('auth_accounts')
    .insert({
      email,
      password_hash: passwordHash,
      user_id: userId,
      status: 'active'
    });
  
  return { data, error };
}

// 2. Login
async function login(email, password, ip, userAgent) {
  // Tìm auth account
  const { data: account, error } = await supabase
    .from('auth_accounts')
    .select('*')
    .eq('email', email)
    .single();
  
  if (error || !account) {
    // Log failed attempt
    await logLoginAttempt(account?.id, null, email, 'failed', ip, userAgent, 'Account not found');
    return { success: false, error: 'Invalid credentials' };
  }
  
  // Check password
  const passwordMatch = bcrypt.compareSync(password, account.password_hash);
  
  if (!passwordMatch) {
    // Log failed attempt
    await logLoginAttempt(account.id, account.user_id, email, 'failed', ip, userAgent, 'Wrong password');
    return { success: false, error: 'Invalid credentials' };
  }
  
  // Check account status
  if (account.status !== 'active') {
    return { success: false, error: `Account is ${account.status}` };
  }
  
  // Log successful login
  await logLoginAttempt(account.id, account.user_id, email, 'success', ip, userAgent);
  
  return { success: true, account };
}

// 3. Log login attempt
async function logLoginAttempt(authAccountId, userId, email, status, ip, userAgent, failureReason = null) {
  const { data, error } = await supabase.rpc('log_login_attempt', {
    p_auth_account_id: authAccountId,
    p_user_id: userId,
    p_email: email,
    p_status: status,
    p_login_ip: ip,
    p_user_agent: userAgent,
    p_failure_reason: failureReason
  });
  
  return { data, error };
}
```

## 🛠️ Troubleshooting

### Account bị lock?

```sql
-- Unlock account manually
UPDATE public.auth_accounts
SET 
    status = 'active',
    login_attempts = 0,
    locked_until = NULL
WHERE email = 'user@example.com';
```

### Reset password?

```sql
-- Generate reset token
UPDATE public.auth_accounts
SET 
    password_reset_token = gen_random_uuid()::text,
    password_reset_expires_at = NOW() + INTERVAL '1 hour'
WHERE email = 'user@example.com';
```

### Xem lịch sử đăng nhập?

```sql
-- Lịch sử đăng nhập của user
SELECT * FROM public.login_history
WHERE email = 'user@example.com'
ORDER BY login_at DESC
LIMIT 10;
```

## 📚 Tài Liệu Tham Khảo

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [bcrypt.js Documentation](https://www.npmjs.com/package/bcryptjs)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
