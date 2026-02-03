# Hướng dẫn sử dụng Tính năng Chốt Ca và Log Thay đổi

Tôi đã hoàn thành việc triển khai tính năng **Chốt Ca (Snapshot)** và **Ghi Log (Audit Log)** theo chuẩn Production.

## 1. Cài đặt Cơ sở dữ liệu (Quan trọng)

Trước khi sử dụng, bạn cần chạy file SQL Migration để tạo các bảng cần thiết trên Supabase.
File migration nằm tại: `MIGRATION.sql` trong thư mục gốc dự án.

Bạn có thể copy nội dung file này và chạy trong **Supabase Dashboard > SQL Editor**.

Các bảng được tạo:
- `change_logs`: Lưu lịch sử thay đổi.
- `detail_reports_view_copy`: Bảng "Báo cáo phảy" (Snapshot) để xem báo cáo.
- `f3_data_snapshot`: Bảng "F3 phảy" (Snapshot) lưu dữ liệu F3 tại thời điểm chốt ca.

## 2. Tính năng Chốt Ca (Snapshot)

### Cách sử dụng:
1. Truy cập vào **Cài đặt hệ thống** ở menu bên trái.
2. Chọn **Công cụ quản trị & Chốt ca**.
3. Nhấn nút **"Thực hiện Chốt Ca Ngay"**.

### Cơ chế hoạt động:
- Hệ thống sẽ xóa dữ liệu cũ trong bảng "Phảy" (`_snapshot`).
- Sao chép toàn bộ dữ liệu hiện tại từ bảng Gốc (Live) sang bảng "Phảy".
- Việc này giúp tách biệt dữ liệu xem báo cáo và dữ liệu đang thao tác, tránh tình trạng "vừa truy vấn vừa thao tác" gây chậm/lỗi.

## 3. Xem Log Thay đổi

### Cách sử dụng:
- Truy cập menu **Cài đặt hệ thống > Lịch sử thay đổi**.
- Bây giờ hệ thống đã đọc log từ Supabase (`change_logs`) thay vì Firebase cũ.
- Mỗi khi có thao tác sửa đổi trên đơn hàng (qua `api.js`), hệ thống sẽ tự động ghi log vào Supabase.

## 4. Kiểm tra mã nguồn

Các file quan trọng đã thay đổi/tạo mới:
- `src/services/snapshotService.js`: Logic chốt ca.
- `src/services/logging.js`: Logic ghi log.
- `src/services/api.js`: Đã thêm hook ghi log khi cập nhật đơn.
- `src/hooks/useReportData.js`: Đã cập nhật để đọc từ bảng Snapshot (`detail_reports_view_copy`) khi xem báo cáo.
- `src/pages/AdminTools.jsx`: Giao diện trang công cụ quản trị.
