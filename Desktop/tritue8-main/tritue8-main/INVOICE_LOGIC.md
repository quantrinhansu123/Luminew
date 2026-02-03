# Logic Hóa Đơn (Invoice Logic)

## 1. Cấu trúc Invoice Key

**Format**: `${studentId}-${month}-${year}`

**Ví dụ**: 
- `student123-10-2024` = Invoice của học sinh có ID `student123` cho tháng 11 (month = 10) năm 2024

**Lưu ý**: 
- `month` là số từ 0-11 (0 = tháng 1, 11 = tháng 12)
- Mỗi học sinh chỉ có **1 invoice duy nhất** cho mỗi tháng/năm
- Invoice này có thể chứa **nhiều sessions từ nhiều lớp khác nhau**

## 2. Khi nào Invoice được tạo?

### 2.1. Tự động khi lưu Attendance Session
- Khi giáo viên lưu điểm danh trong `AttendanceSession.tsx`
- Hàm `syncInvoicesForCurrentSession()` được gọi tự động
- Chỉ tạo invoice cho học sinh **có mặt** hoặc **vắng có phép**

### 2.2. Điều kiện tạo Invoice:
```typescript
// Chỉ tạo invoice nếu:
1. Học sinh có mặt (Có mặt = true) HOẶC
2. Học sinh vắng có phép (Vắng có phép = true)
3. Lớp có giá học phí > 0
4. Invoice chưa được thanh toán (status !== "paid")
```

## 3. Cấu trúc dữ liệu Invoice

```typescript
interface StudentInvoice {
  id: string;                    // Key: "studentId-month-year"
  studentId: string;             // ID học sinh
  studentName: string;           // Tên học sinh
  studentCode: string;            // Mã học sinh
  month: number;                  // Tháng (0-11)
  year: number;                   // Năm
  totalSessions: number;          // Tổng số buổi học
  totalAmount: number;            // Tổng tiền (trước khi trừ discount)
  discount: number;               // Số tiền miễn giảm
  finalAmount: number;            // Thành tiền (sau khi trừ discount)
  status: "paid" | "unpaid";      // Trạng thái thanh toán
  sessions: AttendanceSession[];   // Danh sách các buổi học
  invoiceImage?: string;          // Ảnh hóa đơn (base64)
}
```

## 4. Logic tính giá (Price Calculation)

### 4.1. Thứ tự ưu tiên tìm giá:

1. **Course Price** (từ bảng `Khóa_học`):
   - Tìm course theo: `Khối` + `Môn học` của lớp
   - Nếu không tìm thấy, thử match với `subjectOptions` (ví dụ: "Toán" = "Mathematics")

2. **Class Price** (từ bảng `Lớp_học`):
   - Lấy từ field `Học phí mỗi buổi` của lớp
   - Nếu có `Mức giảm học phí`, áp dụng giảm giá

3. **Default**: 0 (nếu không tìm thấy)

### 4.2. Công thức tính:
```typescript
pricePerSession = course?.Giá || classInfo?.["Học phí mỗi buổi"] || 0

// Nếu có mức giảm học phí từ lớp:
if (classDiscount > 0) {
  if (classDiscount <= 100) {
    // Giảm theo phần trăm
    finalPrice = pricePerSession * (1 - classDiscount / 100)
  } else {
    // Giảm theo số tiền cố định
    finalPrice = pricePerSession - classDiscount
  }
}
```

## 5. Logic cập nhật Invoice

### 5.1. Khi thêm Session mới:

```typescript
// Kiểm tra session đã tồn tại chưa
const sessionExists = existingSessions.some(
  (s) => s["Ngày"] === sessionDate && s["Class ID"] === currentClassId
);

if (!sessionExists) {
  // Thêm session mới
  totalSessions += 1
  totalAmount += pricePerSession
  finalAmount = totalAmount - discount
}
```

### 5.2. Bảo vệ Invoice đã thanh toán:

```typescript
// KHÔNG BAO GIỜ sửa invoice đã paid
if (status === "paid") {
  return; // Bỏ qua, không cập nhật
}
```

## 6. Logic nhóm Invoice (Grouping)

### 6.1. Trong InvoicePage:
- Invoice được **nhóm theo học sinh** (GroupedStudentInvoice)
- Một học sinh có thể có **nhiều invoices** nếu học nhiều lớp khác nhau
- Nhưng thực tế, với key `${studentId}-${month}-${year}`, mỗi học sinh chỉ có 1 invoice/tháng

### 6.2. Tính tổng:
```typescript
// Tổng từ tất cả invoices của học sinh
totalSessions = sum(invoice.totalSessions)
totalAmount = sum(invoice.totalAmount)
discount = sum(invoice.discount)
finalAmount = sum(invoice.finalAmount)
```

## 7. Logic so sánh với Tổng tài chính

### 7.1. Tổng từ Điểm danh (FinancialSummaryPage):
```typescript
// Tính từ attendance sessions
totalRevenue = sum(
  tuitionPerSession * số_học_sinh_có_mặt
)
```

### 7.2. Tổng từ Hóa đơn:
```typescript
// Tính từ invoices
totalRevenueFromInvoices = sum(
  invoice.totalAmount
)
```

### 7.3. Tại sao có thể không khớp?

1. **Invoice chưa được tạo**: Một số attendance sessions chưa được lưu hoặc chưa tạo invoice
2. **Invoice bị thiếu**: Học sinh có mặt nhưng invoice chưa được tạo
3. **Giá khác nhau**: Giá trong invoice khác với giá trong class/course data
4. **Invoice bị duplicate**: Invoice có thể bị tạo nhiều lần cho cùng session
5. **Invoice đã bị xóa**: Invoice đã bị xóa nhưng attendance session vẫn còn

## 8. Chức năng đồng bộ hóa

### 8.1. Nút "Đồng bộ hóa đơn từ điểm danh":
- Quét tất cả attendance sessions trong tháng/năm đã chọn
- Tạo/cập nhật invoice cho học sinh có mặt hoặc vắng có phép
- Không sửa invoice đã thanh toán (paid)
- Tránh duplicate sessions

### 8.2. Khi nào nên dùng:
- Khi thấy chênh lệch giữa "Tổng thu (Từ điểm danh)" và "Tổng thu (Từ hóa đơn)"
- Khi có attendance sessions mới nhưng chưa có invoice
- Khi cần đồng bộ lại dữ liệu sau khi chỉnh sửa

## 9. Lưu ý quan trọng

1. **Invoice key là duy nhất**: Mỗi học sinh chỉ có 1 invoice/tháng
2. **Invoice đã paid không được sửa**: Bảo vệ dữ liệu đã thanh toán
3. **Session không duplicate**: Kiểm tra `Ngày` + `Class ID` trước khi thêm
4. **Giá ưu tiên Course**: Tìm giá từ Course trước, sau đó mới đến Class
5. **Discount được giữ nguyên**: Khi cập nhật invoice, giữ nguyên discount cũ

## 10. Flow hoàn chỉnh

```
1. Giáo viên điểm danh → Lưu Attendance Session
   ↓
2. syncInvoicesForCurrentSession() được gọi
   ↓
3. Với mỗi học sinh có mặt/vắng có phép:
   - Tìm invoice key: `${studentId}-${month}-${year}`
   - Nếu chưa có → Tạo mới
   - Nếu đã có → Kiểm tra session đã tồn tại chưa
   - Nếu chưa tồn tại → Thêm session + cập nhật totalAmount
   ↓
4. Lưu vào Firebase: `datasheet/Phiếu_thu_học_phí/${key}`
   ↓
5. InvoicePage hiển thị invoice
   ↓
6. Có thể chỉnh sửa discount, giá từng session (nếu chưa paid)
   ↓
7. Đánh dấu "Đã thanh toán" → status = "paid" (không thể sửa nữa)
```







