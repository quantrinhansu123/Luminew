# Cập nhật Báo cáo Học tập - Student Report

## Tính năng mới

### 1. Xuất bảng điểm CSV
- Thêm nút "Xuất bảng điểm CSV" trong trang báo cáo học sinh
- Xuất dữ liệu điểm theo định dạng CSV với cấu trúc:
  - Chia theo từng môn học
  - Các cột: Ngày, Tên HS, Chuyên cần, % BTVN, Tên bài kiểm tra, Điểm, Điểm thưởng, Nhận xét
  - Hỗ trợ UTF-8 BOM để mở đúng trong Excel
  - Tên file: `bang_diem_[Tên học sinh]_[Ngày].csv`

### 2. In bảng điểm chi tiết
- Thêm phần "BẢNG ĐIỂM CHI TIẾT" vào báo cáo in
- Hiển thị bảng điểm theo từng môn học
- Định dạng bảng rõ ràng, dễ đọc
- Tự động phân trang khi in

## Cấu trúc dữ liệu

### Bảng điểm theo môn học
```
Môn [Tên môn],,,,,,,
Ngày,Tên HS,Chuyên cần,% BTVN,Tên bài kiểm tra,Điểm,Điểm thưởng,Nhận xét
01/01/2025,Nguyễn Văn A,Có mặt,100,Kiểm tra 15 phút,8.5,0.5,Tốt
02/01/2025,Nguyễn Văn A,Có mặt,90,,,0.5,
...
```

### Trạng thái chuyên cần
- **Có mặt**: Học sinh có mặt đúng giờ
- **Đi muộn**: Học sinh có mặt nhưng đến muộn
- **Vắng**: Học sinh vắng không phép
- **Vắng có phép**: Học sinh vắng có phép

## Cách sử dụng

### Xuất CSV
1. Vào trang "Báo cáo học tập" của học sinh
2. Áp dụng bộ lọc nếu cần (theo ngày, theo tên điểm)
3. Click nút "Xuất bảng điểm CSV"
4. File CSV sẽ được tải về tự động

### In báo cáo
1. Vào trang "Báo cáo học tập" của học sinh
2. Áp dụng bộ lọc nếu cần
3. Click nút "In báo cáo"
4. Báo cáo sẽ bao gồm:
   - Thông tin học sinh
   - Thống kê chuyên cần
   - Lịch sử học tập (bảng tổng hợp)
   - Bảng điểm chi tiết theo môn học

## Lưu ý kỹ thuật

### Phân loại môn học
- Môn học được tách từ tên lớp (phần trước dấu " - ")
- Ví dụ: "Toán - Lớp 8A" → Môn "Toán"
- Nếu không có dấu " - ", toàn bộ tên lớp sẽ được dùng làm môn học

### Định dạng in
- Trang in được chuyển sang chế độ landscape (ngang)
- Bảng điểm được định dạng với border rõ ràng
- Tự động phân trang để tránh cắt ngang bảng

### Tương thích Excel
- File CSV sử dụng UTF-8 BOM để Excel nhận diện đúng tiếng Việt
- Dấu phẩy trong ghi chú được thay bằng dấu chấm phẩy để tránh lỗi format

## File thay đổi
- `components/pages/StudentReportPage.tsx`: Thêm chức năng xuất CSV và in bảng điểm chi tiết
