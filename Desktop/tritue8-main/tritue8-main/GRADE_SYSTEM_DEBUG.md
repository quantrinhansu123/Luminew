# Hướng dẫn kiểm tra hệ thống điểm

## Vấn đề đã sửa

### 1. Điểm thường xuyên (từ buổi học)
**Vấn đề cũ:** Code chỉ đọc `record["Điểm"]` (điểm đơn lẻ)
**Đã sửa:** Code bây giờ đọc từ `record["Chi tiết điểm"]` và tính điểm trung bình

**Cách hoạt động:**
- Khi giáo viên nhập điểm qua `ScoreDetailModal`, điểm được lưu vào mảng `"Chi tiết điểm"` trong mỗi `AttendanceRecord`
- `ClassGradesView` sẽ tính điểm trung bình của tất cả điểm trong `"Chi tiết điểm"` cho mỗi buổi học
- Nếu không có `"Chi tiết điểm"`, sẽ fallback về `record["Điểm"]` (để tương thích ngược)

### 2. Điểm tự nhập (kiểm tra)
**Cấu trúc dữ liệu:**
```
Lớp_học/{classId}/
  ├── "Cột điểm tự nhập": [
  │     { id, name, maxScore, weight, createdAt }
  │   ]
  └── "Điểm tự nhập": {
        "{studentId}-{columnId}": {
          studentId,
          columnId,
          score,
          note,
          updatedAt
        }
      }
```

## Cách kiểm tra

### Bước 1: Kiểm tra điểm thường xuyên
1. **Mở Console (F12)** để xem debug logs
2. Vào trang "Lớp học của tôi"
3. Chọn một lớp
4. Click "Nhập điểm" cho một học sinh
   - **Xem console:** Sẽ hiện log `🎯 Opening score modal` với thông tin session
5. Thêm điểm mới (ví dụ: "Bài tập về nhà", điểm 8)
   - **Xem console:** Sẽ hiện log `💾 Saving score` và `✅ Score saved successfully`
6. Vào "Bảng điểm" → Tab "Điểm thường xuyên"
   - **Xem console:** Sẽ hiện log `📊 ClassGradesView Debug` với thông tin sessions
7. **Kiểm tra:** Điểm vừa nhập phải hiển thị ở cột ngày tương ứng

### Debug Logs để theo dõi:
- `🎯 Opening score modal` - Khi mở modal nhập điểm
- `📖 Loading scores for student` - Khi load điểm hiện có
- `💾 Saving score` - Khi lưu điểm mới
- `📝 Updated record for student` - Record sau khi cập nhật
- `🔄 Updating Firebase` - Dữ liệu gửi lên Firebase
- `✅ Score saved successfully` - Lưu thành công
- `📊 ClassGradesView Debug` - Dữ liệu sessions trong bảng điểm

### Bước 2: Kiểm tra điểm tự nhập
1. Vào "Bảng điểm" → Tab "Điểm kiểm tra"
2. Click "Thêm cột điểm" (ví dụ: "Kiểm tra 15 phút", hệ số 1)
3. Click vào ô điểm của học sinh để nhập điểm
4. Nhập điểm (ví dụ: 9)
5. **Kiểm tra:** Điểm phải hiển thị ngay lập tức

### Bước 3: Kiểm tra điểm trung bình
1. Nhập nhiều điểm cho cùng một học sinh
2. **Kiểm tra:** Cột "Điểm TB" phải tính đúng trung bình

## Debug trong Firebase

### Xem dữ liệu điểm thường xuyên:
```
datasheet/Điểm_danh_sessions/{sessionId}/Điểm danh/[index]/Chi tiết điểm
```

### Xem dữ liệu điểm tự nhập:
```
datasheet/Lớp_học/{classId}/Điểm tự nhập
datasheet/Lớp_học/{classId}/Cột điểm tự nhập
```

## Nếu vẫn không hiển thị

1. **Mở Console (F12)** và kiểm tra:
   - Có lỗi JavaScript không?
   - Dữ liệu có load đúng không? (xem tab Network)

2. **Kiểm tra Firebase Rules:**
   - Đảm bảo user có quyền đọc/ghi vào `Lớp_học` và `Điểm_danh_sessions`

3. **Kiểm tra dữ liệu trong Firebase:**
   - Vào Firebase Console
   - Xem Realtime Database
   - Kiểm tra cấu trúc dữ liệu có đúng như mô tả trên không

## Code đã thay đổi

### ClassGradesView.tsx
- ✅ Đọc điểm từ `"Chi tiết điểm"` thay vì chỉ `"Điểm"`
- ✅ Tính điểm trung bình từ nhiều điểm chi tiết
- ✅ Xóa biến không dùng (`customGrades`, `EditOutlined`, `DATABASE_URL_BASE`)
- ✅ Sửa logic đọc dữ liệu cho nhất quán
