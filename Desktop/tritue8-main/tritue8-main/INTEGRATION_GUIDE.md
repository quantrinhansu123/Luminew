# Hướng dẫn tích hợp thống kê học tập/giảng dạy

## 1. Tích hợp vào trang StudentListView

Thêm vào modal xem chi tiết học sinh:

```tsx
import StudentStatsCard from '@/components/StudentStatsCard';

// Trong modal xem chi tiết học sinh, thêm:
<StudentStatsCard studentId={selectedStudent.id} />
```

## 2. Tích hợp vào trang TeacherListView

Thêm vào modal xem chi tiết giáo viên:

```tsx
import TeacherStatsCard from '@/components/TeacherStatsCard';

// Trong modal xem chi tiết giáo viên, thêm:
<TeacherStatsCard teacherId={selectedTeacher.id} />
```

## 3. Thêm cột thống kê vào bảng

### Cho bảng học sinh:

```tsx
import { useAttendanceStats } from '@/hooks/useAttendanceStats';

const StudentListView = () => {
    const { getStudentStats } = useAttendanceStats();
    
    // Thêm columns:
    {
        title: 'Số buổi học',
        key: 'sessions',
        render: (_, record) => {
            const stats = getStudentStats(record.id);
            return `${stats.presentSessions}/${stats.totalSessions}`;
        }
    },
    {
        title: 'Tổng giờ học',
        key: 'hours',
        render: (_, record) => {
            const stats = getStudentStats(record.id);
            return `${stats.totalHours} giờ`;
        }
    }
```

### Cho bảng giáo viên:

```tsx
import { useAttendanceStats } from '@/hooks/useAttendanceStats';

const TeacherListView = () => {
    const { getTeacherStats } = useAttendanceStats();
    
    // Thêm columns:
    {
        title: 'Số buổi dạy',
        key: 'sessions',
        render: (_, record) => {
            const stats = getTeacherStats(record.id);
            return stats.totalSessions;
        }
    },
    {
        title: 'Tổng giờ dạy',
        key: 'hours',
        render: (_, record) => {
            const stats = getTeacherStats(record.id);
            return `${stats.totalHours} giờ`;
        }
    }
```

## Cách hoạt động:

### Hook `useAttendanceStats`:
- Load tất cả sessions từ `datasheet/Điểm_danh_sessions`
- Tính toán thống kê realtime
- Cung cấp 2 hàm: `getStudentStats()` và `getTeacherStats()`

### Thống kê học sinh:
- **Tổng số buổi học**: Đếm số session có học sinh này
- **Tổng số giờ học**: Tính từ giờ bắt đầu - giờ kết thúc (chỉ buổi có mặt)
- **Số buổi có mặt**: Đếm số buổi "Có mặt" = true
- **Số buổi vắng**: Đếm số buổi "Có mặt" = false

### Thống kê giáo viên:
- **Tổng số buổi dạy**: Đếm số session của giáo viên
- **Tổng số giờ dạy**: Tính từ giờ bắt đầu - giờ kết thúc
- **Số lớp đang dạy**: Đếm số lớp unique (Class ID)

## 4. Tích hợp báo cáo học sinh

### Thêm nút báo cáo vào bảng học sinh:

```tsx
import StudentReportButton from '@/components/StudentReportButton';

// Trong columns của Table:
{
    title: 'Thao tác',
    key: 'action',
    render: (_, record) => (
        <Space>
            <Button icon={<EyeOutlined />} onClick={() => handleView(record)}>
                Xem
            </Button>
            <StudentReportButton student={record} type="link" size="small" />
        </Space>
    )
}
```

### Hoặc trong modal chi tiết:

```tsx
import StudentReportButton from '@/components/StudentReportButton';

// Trong modal footer hoặc extra:
<StudentReportButton student={selectedStudent} type="primary" />
```

## Tính năng báo cáo:

### Thông tin hiển thị:
- **Thông tin cá nhân**: Họ tên, mã HS, ngày sinh, SĐT, email, địa chỉ
- **Thống kê chuyên cần**:
  - Tổng số buổi học
  - Số buổi có mặt / vắng
  - Tỷ lệ tham gia (%)
  - Tổng số giờ học
  - Điểm trung bình
- **Lịch sử học tập**: Bảng chi tiết từng buổi học với:
  - Ngày, lớp, giờ học
  - Trạng thái (Có mặt/Đi muộn/Vắng có phép/Vắng không phép)
  - Điểm số
  - Bài tập hoàn thành
  - Ghi chú

### Chức năng:
- ✅ Xem báo cáo trong modal
- ✅ In báo cáo (mở cửa sổ print)
- ✅ Layout đẹp, chuyên nghiệp
- ✅ Có header, footer
- ✅ Dữ liệu realtime từ Firebase

## Lưu ý:
- Dữ liệu được tính từ lịch sử điểm danh thực tế
- Cập nhật realtime khi có session mới
- Chỉ tính các session đã hoàn thành (status = 'completed')
- Báo cáo có thể in trực tiếp hoặc save as PDF từ trình duyệt
