# Hướng dẫn sử dụng chức năng Quản lý Lớp học

## Tổng quan

Chức năng quản lý lớp học cho phép:
- **Admin**: Tạo, chỉnh sửa, xóa lớp học và quản lý học sinh trong lớp
- **Giáo viên**: Xem thông tin lớp học được phân công và thêm học sinh vào lớp

## Cấu trúc dữ liệu Firebase

### Node mới: `datasheet/Lớp_học`

```json
{
  "datasheet": {
    "Lớp_học": {
    "-UniqueId": {
      "Tên lớp": "Lớp Toán 10A1",
      "Mã lớp": "TOAN10A1",
      "Môn học": "Toán",
      "Khối": "10",
      "Giáo viên chủ nhiệm": "Nguyễn Văn A",
      "Teacher ID": "-TeacherId",
      "Học sinh": ["Học sinh 1", "Học sinh 2"],
      "Student IDs": ["-StudentId1", "-StudentId2"],
      "Lịch học": [
        {
          "Thứ": 2,
          "Giờ bắt đầu": "08:00",
          "Giờ kết thúc": "10:00",
          "Địa điểm": "Phòng 101"
        }
      ],
      "Ghi chú": "Lớp học bổ trợ",
      "Trạng thái": "active",
      "Ngày tạo": "2025-11-13T10:00:00.000Z",
      "Người tạo": "admin@example.com"
    }
  }
  }
}
```

**Lưu ý:** Tất cả dữ liệu lớp học được lưu trong node `datasheet/Lớp_học` để đồng nhất với cấu trúc hiện tại của Firebase (cùng với `datasheet/Giáo_viên`, `datasheet/Danh_sách_học_sinh`, v.v.)

## Chức năng cho Admin

### 1. Truy cập trang quản lý lớp học
- Đăng nhập với tài khoản Admin
- Vào menu **"Quản lý lớp học"** trên sidebar

### 2. Thêm lớp học mới
1. Click nút **"Thêm lớp học"**
2. Điền thông tin:
   - Tên lớp (VD: Lớp Toán 10A1)
   - Mã lớp (VD: TOAN10A1)
   - Môn học (VD: Toán)
   - Khối (Chọn từ 1-12)
   - Giáo viên chủ nhiệm (Chọn từ danh sách)
   - Lịch học trong tuần:
     - Click "Thêm lịch học"
     - Chọn thứ (2-8, với 8 là Chủ nhật)
     - Chọn giờ bắt đầu và kết thúc
     - Nhập địa điểm (tùy chọn)
   - Trạng thái (Hoạt động/Ngừng hoạt động)
   - Ghi chú (tùy chọn)
3. Click **"Thêm"** để lưu

### 3. Chỉnh sửa lớp học
1. Click icon **Edit** (✏️) ở cột "Thao tác"
2. Cập nhật thông tin cần thiết
3. Click **"Cập nhật"** để lưu

### 4. Xóa lớp học
1. Click icon **Delete** (🗑️) ở cột "Thao tác"
2. Xác nhận xóa

### 5. Xem chi tiết lớp học
1. Click nút **"Xem"** (👁️) ở cột "Thao tác"
2. Modal hiển thị đầy đủ thông tin:
   - Thông tin cơ bản (mã lớp, tên, môn học, khối)
   - Giáo viên chủ nhiệm
   - Lịch học trong tuần (dạng bảng)
   - Danh sách học sinh
   - Ghi chú

### 6. Thêm học sinh vào lớp (Hỗ trợ thêm hàng loạt)
1. Click nút **"HS"** ở cột "Thao tác"
2. Chọn một hoặc nhiều học sinh từ dropdown
   - Có thể gõ để tìm kiếm
   - Chọn nhiều học sinh cùng lúc
3. Click **"Thêm X học sinh"**
4. Tất cả học sinh được chọn sẽ được thêm vào lớp

### 7. Xóa học sinh khỏi lớp
1. Click nút **"HS"** để mở modal quản lý học sinh
2. Click icon **Delete** (🗑️) bên cạnh tên học sinh
3. Xác nhận xóa

### 8. Lọc lớp học
- Sử dụng dropdown để lọc theo trạng thái:
  - Tất cả
  - Hoạt động
  - Ngừng hoạt động

## Chức năng cho Giáo viên

### 1. Truy cập lớp học của tôi
- Đăng nhập với tài khoản Giáo viên
- Vào menu **"Lớp học của tôi"** trên sidebar

### 2. Xem thông tin lớp học
- Hệ thống tự động hiển thị các lớp mà giáo viên được phân công
- Mỗi lớp hiển thị trong một tab riêng
- Thông tin bao gồm:
  - Mã lớp
  - Môn học
  - Khối
  - Trạng thái
  - Số học sinh
  - Lịch học trong tuần
  - Ghi chú

### 3. Xem danh sách học sinh
- Trong mỗi tab lớp học, có bảng danh sách học sinh
- Hiển thị:
  - Mã học sinh
  - Họ và tên
  - Ngày sinh
  - Số điện thoại
  - Email

### 4. Thêm học sinh vào lớp (Hỗ trợ thêm hàng loạt)
1. Click nút **"Thêm học sinh"**
2. Chọn một hoặc nhiều học sinh từ dropdown
   - Có thể gõ để tìm kiếm
   - Chọn nhiều học sinh cùng lúc
3. Click **"Thêm X học sinh"**
4. Tất cả học sinh được chọn sẽ được thêm vào lớp

### 5. Xóa học sinh khỏi lớp
1. Click nút **"Thêm học sinh"** để mở modal
2. Click icon **Delete** bên cạnh tên học sinh
3. Xác nhận xóa

### 6. Debug khi không thấy lớp học
Nếu giáo viên không thấy lớp học của mình:
1. Mở Console (F12) để xem log
2. Kiểm tra:
   - `Teacher ID` trong lớp học có khớp với ID giáo viên không
   - Email giáo viên có đúng trong bảng `Giáo_viên` không
   - Giáo viên có tồn tại trong bảng `datasheet/Giáo_viên` không

## Files đã tạo

### 1. Types
- `types.ts`: Thêm interface `Class` và `ClassSchedule`

### 2. Hooks
- `hooks/useClasses.ts`: Hook quản lý CRUD operations cho lớp học

### 3. Components
- `components/pages/ClassManagement.tsx`: Trang quản lý lớp học cho Admin
- `components/pages/TeacherClassView.tsx`: Trang xem lớp học cho Giáo viên
- `components/ClassFormModal.tsx`: Modal form thêm/sửa lớp học
- `components/AddStudentModal.tsx`: Modal thêm/xóa học sinh trong lớp

### 4. Routes
- `routes/privateRoutes.tsx`: Thêm routes `/workspace/classes` và `/workspace/my-classes`

### 5. Navigation
- `components/Sidebar.tsx`: Thêm menu items cho lớp học

## Lưu ý

1. **Quyền truy cập**:
   - Trang "Quản lý lớp học" (`/workspace/classes`) chỉ dành cho Admin
   - Trang "Lớp học của tôi" (`/workspace/my-classes`) chỉ dành cho Giáo viên
   - Giáo viên chỉ thấy các lớp mà họ được phân công
   - Admin được xác định qua:
     - `userProfile.isAdmin === true` HOẶC
     - `userProfile.role === "admin"` HOẶC
     - Vị trí trong bảng `Giáo_viên` là "Admin"

2. **Dữ liệu liên kết**:
   - Lớp học liên kết với `Giáo_viên` qua `Teacher ID`
   - Lớp học liên kết với `Danh_sách_học_sinh` qua `Student IDs`
   - Khi thêm/xóa học sinh, cả `Student IDs` và `Học sinh` (tên) đều được cập nhật

3. **Lịch học**:
   - Thứ được đánh số từ 2-8 (2=Thứ Hai, 8=Chủ Nhật)
   - Giờ học theo định dạng HH:mm (24h)
   - Có thể thêm nhiều buổi học trong tuần

4. **Trạng thái lớp**:
   - `active`: Lớp đang hoạt động
   - `inactive`: Lớp ngừng hoạt động (có thể do kết thúc khóa học)

## Tích hợp với các chức năng khác

Chức năng lớp học có thể tích hợp với:
- **Điểm danh**: Lọc học sinh theo lớp khi điểm danh
- **Thời khóa biểu**: Tự động tạo lịch học từ lịch của lớp
- **Báo cáo**: Thống kê theo lớp học

## Hỗ trợ

Nếu gặp vấn đề, vui lòng kiểm tra:
1. Firebase Realtime Database rules cho phép đọc/ghi node `datasheet/Lớp_học`
2. Dữ liệu `datasheet/Giáo_viên` và `datasheet/Danh_sách_học_sinh` đã tồn tại trong Firebase
3. User đã đăng nhập và có quyền phù hợp
4. Mở Console (F12) để xem log và kiểm tra dữ liệu được load đúng chưa
