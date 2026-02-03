# Hướng dẫn sử dụng Báo cáo Học sinh

## Tổng quan
Hệ thống báo cáo học sinh cho phép bạn xem và in báo cáo chi tiết về lịch sử học tập của từng học sinh, bao gồm:
- Thông tin cá nhân
- Thống kê chuyên cần (điểm danh)
- Lịch sử học tập chi tiết
- Điểm số và bài tập

## 3 cách truy cập Báo cáo Học sinh

### 1. Từ Danh sách Học sinh (StudentListView)
- Vào trang **Quản lý học sinh** (`/workspace/students`)
- Tìm học sinh cần xem báo cáo
- Nhấn nút **"Báo cáo"** trong cột "Cài đặt"
- Modal báo cáo sẽ hiện ra với đầy đủ thông tin

### 2. Từ Modal Chi tiết Học sinh
- Vào trang **Quản lý học sinh**
- Nhấn nút **"Chi tiết"** của học sinh
- Trong modal chi tiết, nhấn nút **"Báo cáo"** (nếu có)

### 3. Trang Báo cáo riêng (StudentReportPage)
- Truy cập trực tiếp: `/workspace/students/:studentId/report`
- Trang này hiển thị báo cáo toàn màn hình
- Có nút **"In báo cáo"** để in trực tiếp

## Nội dung Báo cáo

### Thông tin cá nhân
- Họ và tên
- Mã học sinh
- Ngày sinh
- Số điện thoại
- Email
- Địa chỉ

### Thống kê chuyên cần
- **Tổng số buổi**: Tổng số buổi học đã tham gia
- **Số buổi có mặt**: Số buổi học sinh có mặt
- **Số buổi vắng**: Số buổi học sinh vắng
- **Tỷ lệ tham gia**: Phần trăm buổi có mặt / tổng số buổi
- **Tổng số giờ học**: Tổng thời gian học (giờ)
- **Điểm trung bình**: Điểm trung bình của tất cả các buổi học

### Lịch sử học tập
Bảng chi tiết các buổi học bao gồm:
- Ngày học
- Tên lớp
- Giờ học (bắt đầu - kết thúc)
- Trạng thái (Có mặt, Vắng có phép, Vắng không phép, Đi muộn)
- Điểm
- Bài tập (số bài hoàn thành / tổng số bài)
- Ghi chú

## Tính năng In báo cáo

### Từ Modal (StudentReport)
- Nhấn nút **"In báo cáo"** ở footer modal
- Cửa sổ in sẽ mở ra với định dạng đẹp
- Chọn máy in và nhấn "Print"

### Từ Trang riêng (StudentReportPage)
- Nhấn nút **"In báo cáo"** ở góc trên bên phải
- Trình duyệt sẽ mở hộp thoại in
- Báo cáo được tối ưu hóa cho in A4

### Định dạng In
- Tự động ẩn các nút và phần không cần thiết
- Hiển thị đầy đủ thông tin quan trọng
- Định dạng chuyên nghiệp, dễ đọc
- Phù hợp với khổ giấy A4

## Lưu ý kỹ thuật

### Dữ liệu nguồn
- **Thông tin học sinh**: Từ bảng `Danh_sách_học_sinh`
- **Lịch sử điểm danh**: Từ bảng `Điểm_danh_sessions`
- Dữ liệu được tải real-time từ Firebase

### Component liên quan
1. **StudentReportButton**: Nút mở modal báo cáo
2. **StudentReport**: Modal hiển thị báo cáo
3. **StudentReportPage**: Trang báo cáo toàn màn hình
4. **useAttendanceStats**: Hook tính toán thống kê

### Route
- Trang báo cáo: `/workspace/students/:studentId/report`
- Được định nghĩa trong `routes/privateRoutes.tsx`

## Troubleshooting

### Báo cáo không hiển thị dữ liệu
- Kiểm tra xem học sinh có tham gia buổi học nào chưa
- Kiểm tra kết nối Firebase
- Xem console để biết lỗi chi tiết

### Nút "In báo cáo" không hoạt động
- Kiểm tra trình duyệt có chặn popup không
- Thử sử dụng trình duyệt khác
- Kiểm tra quyền in của trình duyệt

### Dữ liệu không chính xác
- Làm mới trang để tải lại dữ liệu
- Kiểm tra dữ liệu trong Firebase Console
- Xác nhận `Student ID` khớp giữa các bảng

## Cải tiến trong tương lai
- [ ] Xuất báo cáo ra PDF
- [ ] Gửi báo cáo qua email
- [ ] Lọc báo cáo theo khoảng thời gian
- [ ] Biểu đồ trực quan hóa dữ liệu
- [ ] So sánh với các học sinh khác
