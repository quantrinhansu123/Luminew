# Script Tạo Tài Khoản Từ Human Resources

Script này giúp tự động tạo tài khoản người dùng trong Firebase Realtime Database dựa trên dữ liệu từ bảng `human_resources`.

## 📋 Yêu cầu

- Node.js (phiên bản 14+)
- Firebase Client SDK (đã có trong package.json)
- File JSON export từ Firebase (tùy chọn)

## 📦 Cài đặt dependencies

Dependencies đã có sẵn trong package.json:
- `firebase`: SDK Firebase Client
- `bcryptjs`: Hash mật khẩu

## 🔧 Cấu hình

Script sử dụng Firebase configuration có sẵn trong project.

## 📊 Mapping dữ liệu

### Từ `human_resources` sang `users`:

| Trường HR | Trường Users | Mapping |
|-----------|-------------|---------|
| `email` | `email` | Giữ nguyên |
| `id` | `id_ns` | Giữ nguyên |
| `Họ Và Tên` | `name` | Giữ nguyên |
| `Bộ phận` | `department` | Giữ nguyên |
| `Team` | `team` | Giữ nguyên |
| `Ca` | `shift` | Giữ nguyên |
| `chi nhánh` | `branch` | Giữ nguyên |
| `Vị trí` | `position` | Giữ nguyên |
| `Vị trí` | `role` | Map theo quy tắc |

### Quy tắc mapping Role:

- `"NV"` → `"user"`
- `"Leader"` → `"leader"`
- `"Vận đơn"` → `"van-don"`
- `"Kế toán"` → `"ke-toan"`

### Thông tin mặc định:

- `password`: `"123456"` (được hash bằng bcryptjs)
- `username`: Phần trước `@` của email
- `createdAt`: Thời gian hiện tại
- `createdBy`: `"auto-script"` hoặc `"import-script"`

## 🚀 Cách sử dụng

### 1. Tạo users từ dữ liệu mẫu:

```bash
node create-users-from-hr.js
```

### 2. Import từ file JSON Firebase export:

```bash
node import-users-from-json.js <path-to-json-file>
```

Ví dụ:
```bash
node import-users-from-json.js report-867c2-default-rtdb-0-export.json
```

### 3. Sử dụng trong code:

```javascript
import { processHumanResourcesData } from './create-users-from-hr.js';

// Dữ liệu human_resources từ Firebase hoặc file JSON
const hrData = [
  {
    "Bộ phận": "CSKH",
    "Ca": "Ca Ngày",
    "Họ Và Tên": "Phạm Hải Yến",
    "Team": "CSKH- Lý",
    "Vị trí": "NV",
    "chi nhánh": "Hà Nội",
    "email": "pham.h.yen21072001@gmail.com",
    "id": "fgfdgd2"
  }
  // ... thêm dữ liệu khác
];

processHumanResourcesData(hrData)
  .then(results => {
    console.log('Hoàn thành:', results);
  })
  .catch(error => {
    console.error('Lỗi:', error);
  });
```

### 4. Import từ file JSON:

```javascript
import { importUsersFromJsonFile } from './import-users-from-json.js';

importUsersFromJsonFile('path/to/firebase-export.json')
  .then(results => {
    console.log('Import hoàn thành:', results);
  });
```

## 📄 Định dạng dữ liệu đầu vào

### Cho create-users-from-hr.js:
Dữ liệu `human_resources` phải là mảng các object:

```json
[
  {
    "Bộ phận": "Tên bộ phận",
    "Ca": "Ca làm việc",
    "Họ Và Tên": "Tên đầy đủ",
    "Team": "Tên team",
    "Vị trí": "NV/Leader/Vận đơn/Kế toán",
    "chi nhánh": "Tên chi nhánh",
    "email": "email@domain.com",
    "id": "unique_id"
  }
]
```

### Cho import-users-from-json.js:
File JSON export từ Firebase Realtime Database, có cấu trúc:

```json
{
  "human_resources": {
    "user_id_1": {
      "Bộ phận": "CSKH",
      "Ca": "Ca Ngày",
      "Họ Và Tên": "Tên người dùng",
      "Team": "Team name",
      "Vị trí": "NV",
      "chi nhánh": "Hà Nội",
      "email": "user@example.com",
      "id": "user_id_1"
    }
  }
}
```

## 📊 Kết quả

Script sẽ:
- ✅ Tạo tài khoản trong Firebase `users/{id}`
- ✅ Tạo/cập nhật record trong `human_resources/{id}`
- ✅ Hash password với bcryptjs
- ✅ Mapping role theo quy tắc
- ✅ Xuất báo cáo chi tiết thành công/thất bại
- ✅ Hiển thị danh sách users sau khi tạo
- ✅ Cung cấp thông tin đăng nhập

## 🔍 Kiểm tra kết quả

Sau khi chạy script, kiểm tra:
1. Firebase Realtime Database → `users/`
2. Firebase Realtime Database → `human_resources/`
3. Console log để xem kết quả và thông tin đăng nhập

## ⚠️ Lưu ý

- Script sẽ ghi đè dữ liệu nếu user đã tồn tại
- Password mặc định là `123456` - nên thay đổi sau khi đăng nhập
- Đảm bảo kết nối Firebase hoạt động
- Script tạo cả record trong `users` và `human_resources`

## 🐛 Xử lý lỗi

Script sẽ:
- Bỏ qua entries không hợp lệ (thiếu email/id/name)
- Tiếp tục xử lý các entries khác nếu có lỗi
- Xuất báo cáo chi tiết về thành công/thất bại
- Hiển thị danh sách users hiện tại sau khi xử lý

## 📁 Files

- `create-users-from-hr.js`: Script tạo users từ dữ liệu mẫu hoặc array
- `import-users-from-json.js`: Script import từ file JSON Firebase export
- `CREATE_USERS_README.md`: Tài liệu hướng dẫn này