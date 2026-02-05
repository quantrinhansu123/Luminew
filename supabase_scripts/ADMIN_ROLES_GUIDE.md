# Hướng Dẫn: Các Role Được Coi Là Admin

## 📋 Tóm Tắt

Để **nhìn được FULL** (xem tất cả dữ liệu và tất cả các trang/module), user cần có một trong các role sau:

## ✅ Các Role Được Coi Là Admin (Case-Insensitive)

### 1. **`admin`** (Khuyến nghị - dùng nhiều nhất)
- Role phổ biến nhất
- Được hỗ trợ ở cả frontend và backend
- **Ví dụ:** `role = 'admin'` hoặc `role = 'ADMIN'` đều được

### 2. **`administrator`**
- Tương đương với `admin`
- Được hỗ trợ trong SQL functions

### 3. **`super_admin`**
- Quyền cao nhất
- Được hỗ trợ ở cả frontend và backend
- **Ví dụ:** `role = 'super_admin'` hoặc `role = 'SUPER_ADMIN'`

### 4. **`director`**
- Dành cho giám đốc
- Có quyền xem tất cả

### 5. **`manager`**
- Dành cho quản lý
- Có quyền xem tất cả

## ⚠️ Lưu Ý Quan Trọng

### Case Sensitivity (Phân Biệt Chữ Hoa/Thường)

**Trong Database (SQL):**
- ✅ **Case-INSENSITIVE**: Script SQL dùng `LOWER(role)` nên không phân biệt hoa/thường
- ✅ `'admin'`, `'ADMIN'`, `'Admin'` đều được coi là admin

**Trong Frontend (JavaScript):**
- ⚠️ **Case-SENSITIVE**: Một số nơi check `role === 'ADMIN'` (uppercase)
- ⚠️ Một số nơi check `role.toLowerCase() === 'admin'` (lowercase)

**Khuyến nghị:**
- ✅ Dùng **`'admin'`** (lowercase) để đảm bảo hoạt động ở mọi nơi
- ✅ Hoặc dùng **`'ADMIN'`** (uppercase) nếu frontend check uppercase

## 🔍 Cách Kiểm Tra Role Hiện Tại

### 1. Kiểm tra trong Database:
```sql
SELECT id, email, role, name 
FROM public.users 
WHERE email = 'your-email@example.com';
```

### 2. Kiểm tra trong Frontend:
- Mở Developer Console (F12)
- Gõ: `localStorage.getItem('userRole')`
- Hoặc check trong Redux/Context state

### 3. Test function is_admin():
```sql
SELECT is_admin();
-- Sẽ return true nếu user hiện tại là admin
```

## 🛠️ Cách Set Role = Admin

### Cách 1: Update trực tiếp trong Database
```sql
UPDATE public.users 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

### Cách 2: Dùng script có sẵn
```sql
-- Chạy file: supabase_scripts/setup_admin_role.sql
-- Nhớ thay email của bạn vào
```

## 📊 So Sánh Các Role

| Role | Xem Tất Cả Dữ Liệu | Xem Tất Cả Pages | Sửa/Xóa Tất Cả | Ghi Chú |
|------|-------------------|------------------|----------------|---------|
| `admin` | ✅ | ✅ | ✅ | **Khuyến nghị** |
| `ADMIN` | ✅ | ✅ | ✅ | Uppercase version |
| `administrator` | ✅ | ✅ | ✅ | Tương đương admin |
| `super_admin` | ✅ | ✅ | ✅ | Quyền cao nhất |
| `director` | ✅ | ✅ | ✅ | Dành cho giám đốc |
| `manager` | ✅ | ✅ | ✅ | Dành cho quản lý |
| `leader` | ⚠️ | ⚠️ | ❌ | Chỉ xem team của mình |
| `user` | ❌ | ❌ | ❌ | User thường |

## 🎯 Khuyến Nghị

**Để đảm bảo nhìn được FULL, hãy set role = `'admin'` (lowercase):**

```sql
UPDATE public.users 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

Sau đó:
1. ✅ Đăng xuất và đăng nhập lại
2. ✅ Clear cache: `localStorage.clear()` (nếu cần)
3. ✅ Refresh trang

## 🔧 Troubleshooting

### Vẫn không thấy đầy đủ sau khi set role = 'admin'?

1. **Kiểm tra role trong database:**
```sql
SELECT role FROM public.users WHERE email = 'your-email@example.com';
-- Phải là: 'admin' (hoặc 'ADMIN', 'administrator', etc.)
```

2. **Kiểm tra permissions đã được grant:**
```sql
SELECT COUNT(*) 
FROM app_page_permissions 
WHERE LOWER(role_code) = 'admin';
-- Phải có khoảng 30+ permissions
```

3. **Kiểm tra RLS policies:**
```sql
SELECT policyname 
FROM pg_policies 
WHERE tablename = 'detail_reports' 
  AND policyname LIKE '%Admin%';
-- Phải có policies cho admin
```

4. **Clear cache và đăng nhập lại:**
   - Xóa localStorage
   - Đăng xuất và đăng nhập lại
   - Refresh trang

## 📝 Ghi Chú

- Script `ensure_admin_full_access.sql` tự động grant permissions cho tất cả các role admin
- Nếu thêm role mới, cần update script để include role đó
- Frontend có thể cần update để nhận diện role mới
