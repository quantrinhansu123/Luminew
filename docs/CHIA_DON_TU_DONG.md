# Tài Liệu: Nút Chia Đơn Tự Động

## Tổng Quan

Hệ thống cung cấp hai tính năng chia đơn tự động chính:
1. **Chia đơn CSKH** - Phân bổ đơn hàng cho nhân viên chăm sóc khách hàng
2. **Chia đơn vận đơn** - Phân bổ đơn hàng cho nhân viên vận đơn

Cả hai tính năng đều được tích hợp trong trang **Admin Tools** với giao diện trực quan và dễ sử dụng.

---

## 1. Chia Đơn CSKH

### 1.1. Mô Tả

Tính năng **Phân bổ đơn hàng** tự động chia các đơn hàng chưa có CSKH cho nhân viên CSKH theo nguyên tắc công bằng và thông minh.

### 1.2. Vị Trí

- **File**: `src/pages/AdminTools.jsx`
- **Hàm**: `handlePhanBoDonHang()`
- **UI**: Tab "Admin Tools" → Phần "Chia đơn CSKH" → Nút "Phân bổ đơn hàng"

### 1.3. Điều Kiện Đơn Hàng Được Chia

Đơn hàng phải thỏa mãn **TẤT CẢ** các điều kiện sau:

1. ✅ **Team**: Phải khớp với team được chọn trong dropdown
2. ✅ **Tháng**: `order_date` phải nằm trong tháng được chọn
3. ✅ **CSKH trống**: Cột `cskh` phải trống hoặc null
4. ✅ **Tự động điền team**: Nếu đơn chưa có team, hệ thống sẽ tự động điền team dựa trên `sale_staff` từ bảng `users`

> **Lưu ý**: Trước đây yêu cầu `accountant_confirm = 'Đã thu tiền'`, nhưng đã được bỏ để có thể chia đơn ngay cả khi chưa có xác nhận.

### 1.4. Logic Phân Bổ

#### Bước 1: Xử lý đơn Sale tự chăm
- Nếu `sale_staff` là nhân viên CSKH → Tự động gán `cskh = sale_staff`
- Đơn này được xử lý ngay, không cần chia

#### Bước 2: Chia đều các đơn còn lại
- **Nguyên tắc**: Chia đều theo **từng tháng** của `order_date`
- **Thuật toán**:
  1. Đếm số đơn hiện tại của mỗi CSKH theo từng tháng
  2. Với mỗi đơn cần chia:
     - Xác định tháng của đơn (từ `order_date`)
     - Chọn CSKH có **ít đơn nhất** trong tháng đó
     - Gán đơn cho CSKH đó
     - Tăng counter của CSKH trong tháng đó

#### Bước 3: Cập nhật Database
- Chia nhỏ thành batch **50 đơn/lần** để tránh timeout
- Sử dụng `Promise.all()` để cập nhật song song, tăng tốc độ xử lý

### 1.5. Kết Quả

Sau khi hoàn tất, hệ thống hiển thị:
- ✅ Tổng số đơn đã xử lý
- ✅ Số đơn Sale tự chăm
- ✅ Số đơn được chia mới
- ✅ Tổng số nhân sự CSKH tham gia

### 1.6. Ví Dụ

```
Tháng 1/2024:
- CSKH A: 10 đơn
- CSKH B: 8 đơn
- CSKH C: 12 đơn

→ Đơn mới sẽ được gán cho CSKH B (ít đơn nhất)

Sau khi gán:
- CSKH A: 10 đơn
- CSKH B: 9 đơn ← nhận đơn mới
- CSKH C: 12 đơn
```

---

## 2. Chia Đơn Vận Đơn

### 2.1. Mô Tả

Tính năng **Chia đơn vận đơn** tự động phân bổ đơn hàng cho nhân viên vận đơn theo chi nhánh (HCM/Hà Nội) với logic công bằng và round-robin.

### 2.2. Vị Trí

- **File**: `src/pages/AdminTools.jsx`
- **Hàm**: `handleChiaDonVanDon()`
- **UI**: Tab "Admin Tools" → Phần "Chia đơn vận đơn" → Nút "Chia đơn vận đơn"

### 2.3. Điều Kiện Đơn Hàng Được Chia

Đơn hàng phải thỏa mãn **TẤT CẢ** các điều kiện sau:

1. ✅ **Delivery Staff trống**: 
   - `delivery_staff` phải là: `null`, `undefined`, `''`, `'EMPTY'`, `'NULL'`, hoặc `'NONE'`
   - Không phân biệt chữ hoa/thường

2. ✅ **Team hợp lệ**: 
   - `team` phải là **HCM** hoặc **Hà Nội** (hoặc các biến thể: "Hồ Chí Minh", "Ho Chi Minh", "Hà Nội", "Ha Noi", "Hanoi")
   - Nếu đơn chưa có team, hệ thống sẽ tự động điền dựa trên `sale_staff` từ bảng `users`

3. ✅ **Country không phải Nhật Bản**: 
   - Loại trừ đơn có `country` chứa: "Nhật Bản", "Nhat Ban", "Japan", "JP"
   - Loại trừ "CĐ Nhật Bản"

### 2.4. Logic Phân Bổ

#### Bước 1: Lấy danh sách nhân viên vận đơn
- Query từ bảng `danh_sach_van_don`
- **Lọc**: Chỉ lấy nhân viên có `trang_thai_chia = 'U1'`
- **Phân loại**: Chia theo chi nhánh (HCM và Hà Nội)

#### Bước 2: Lọc đơn hàng
- Query tất cả đơn có `delivery_staff` trống/null/empty
- **Tự động điền team**: Nếu đơn chưa có team, điền dựa trên `sale_staff`
- **Loại trừ**: Đơn có country = Nhật Bản
- **Phân loại**: Chia đơn theo team (HCM và Hà Nội)

#### Bước 3: Chia đơn theo chi nhánh

**Rule 1: Xác định người được chia cuối cùng**
- Lấy đơn có `delivery_staff` đã có, sắp xếp theo thời gian
- Xác định nhân viên được chia đơn cuối cùng

**Rule 2: List nhân viên U1 đang đi làm**
- Đã có từ Bước 1

**Rule 3: Ưu tiên người có ít đơn hơn**
- Đếm số đơn hiện tại của mỗi nhân viên trong team tương ứng
- Ưu tiên nhân viên có ít đơn nhất

**Rule 4: Round-robin tiếp từ người sau người cuối cùng**
- Bắt đầu chia từ nhân viên **sau** người được chia cuối cùng
- Đảm bảo tính công bằng và luân phiên

#### Bước 4: Cập nhật Database
- Chia nhỏ thành batch **50 đơn/lần**
- Cập nhật `delivery_staff` cho từng đơn

### 2.5. Kết Quả

Sau khi hoàn tất, hệ thống hiển thị:
- ✅ Tổng số đơn đã chia
- ✅ Số đơn chia cho HCM
- ✅ Số đơn chia cho Hà Nội
- ✅ Danh sách đơn không được chia (nếu có) và lý do

### 2.6. Ví Dụ

```
Nhân viên HCM (U1):
- NV A: 5 đơn
- NV B: 3 đơn
- NV C: 4 đơn
- Người được chia cuối cùng: NV B

→ Đơn mới sẽ được gán cho NV C (sau NV B, và có ít đơn hơn NV A)

Sau khi gán:
- NV A: 5 đơn
- NV B: 3 đơn
- NV C: 5 đơn ← nhận đơn mới
```

---

## 3. Tính Năng Bổ Sung

### 3.1. Hạch Toán Báo Cáo (CSKH)

**Mô tả**: Tạo báo cáo thống kê về số đơn của mỗi nhân viên CSKH.

**Thông tin báo cáo**:
- Số đơn cá nhân (sale_staff = chính họ)
- Số đơn đã xử lý (có cutoff_time)
- Số đơn mới được chia (chưa có cutoff_time)
- Số đơn chia sau (được chia từ đơn của người khác)

**Điều kiện**: Chỉ tính đơn có `accountant_confirm = 'Đã thu tiền'`

### 3.2. Chạy Toàn Bộ (CSKH)

**Mô tả**: Chạy tuần tự cả hai tính năng:
1. Phân bổ đơn hàng
2. Hạch toán báo cáo

**Lưu ý**: Có xác nhận trước khi chạy để tránh thao tác nhầm.

### 3.3. Tìm Kiếm Đơn Hàng

**Mô tả**: Tìm kiếm đơn hàng theo mã đơn để kiểm tra trạng thái.

**Thông tin hiển thị**:
- Mã đơn hàng
- Ngày lên đơn
- Team
- Country
- Trạng thái NV vận đơn (đã gán/chưa gán)
- Lý do nếu đơn chưa được gán

---

## 4. Hướng Dẫn Sử Dụng

### 4.1. Chia Đơn CSKH

1. Truy cập **Admin Tools**
2. Chọn **Team** và **Tháng** cần chia đơn
3. Click nút **"Phân bổ đơn hàng"**
4. Đợi hệ thống xử lý (có thể mất vài phút nếu có nhiều đơn)
5. Xem kết quả trong thông báo

### 4.2. Chia Đơn Vận Đơn

1. Truy cập **Admin Tools**
2. Click nút **"Chia đơn vận đơn"**
3. Đợi hệ thống xử lý
4. Xem kết quả và danh sách đơn không được chia (nếu có)

### 4.3. Tìm Kiếm Đơn Hàng

1. Nhập mã đơn hàng vào ô tìm kiếm
2. Click **"Tìm kiếm"** hoặc nhấn Enter
3. Xem thông tin chi tiết và trạng thái đơn

---

## 5. Xử Lý Lỗi

### 5.1. Lỗi Thường Gặp

#### "Không tìm thấy nhân sự CSKH"
- **Nguyên nhân**: Không có nhân viên nào có `department = 'CSKH'` trong bảng `users`
- **Giải pháp**: Kiểm tra và thêm nhân viên CSKH vào bảng `users`

#### "Không có nhân viên nào có trạng thái U1"
- **Nguyên nhân**: Không có nhân viên nào có `trang_thai_chia = 'U1'` trong bảng `danh_sach_van_don`
- **Giải pháp**: Cập nhật trạng thái chia cho nhân viên vận đơn

#### "Không tìm thấy đơn hàng"
- **Nguyên nhân**: Mã đơn không tồn tại hoặc không đúng
- **Giải pháp**: Kiểm tra lại mã đơn hàng

### 5.2. Đơn Không Được Chia

#### Đơn CSKH không được chia:
- ✅ Đã có CSKH rồi
- ✅ Không thuộc team/tháng được chọn

#### Đơn vận đơn không được chia:
- ✅ Đã có `delivery_staff`
- ✅ Team không phải HCM/Hà Nội
- ✅ Country = Nhật Bản
- ✅ Không tìm thấy team từ `sale_staff`

---

## 6. Lưu Ý Kỹ Thuật

### 6.1. Performance

- **Batch size**: 50 đơn/lần để tránh timeout
- **Parallel updates**: Sử dụng `Promise.all()` để tăng tốc
- **Query optimization**: Query có giới hạn 100,000 rows từ Supabase

### 6.2. Data Integrity

- **Tự động điền team**: Hệ thống tự động điền team cho đơn chưa có team
- **Validation**: Kiểm tra kỹ điều kiện trước khi chia
- **Logging**: Ghi log chi tiết để debug

### 6.3. Database Schema

**Bảng `orders`**:
- `order_code`: Mã đơn hàng (unique)
- `order_date`: Ngày lên đơn
- `team`: Chi nhánh (HCM/Hà Nội)
- `country`: Quốc gia
- `sale_staff`: Nhân viên bán hàng
- `cskh`: Nhân viên CSKH
- `delivery_staff`: Nhân viên vận đơn
- `accountant_confirm`: Xác nhận kế toán

**Bảng `users`**:
- `name`: Tên nhân viên
- `department`: Phòng ban (CSKH, ...)
- `branch`: Chi nhánh

**Bảng `danh_sach_van_don`**:
- `ho_va_ten`: Họ và tên
- `chi_nhanh`: Chi nhánh
- `trang_thai_chia`: Trạng thái chia (U1 = đang đi làm)

---

## 7. FAQ

### Q: Có thể chia đơn cho nhiều tháng cùng lúc không?
A: Không, mỗi lần chỉ chia đơn cho một tháng. Cần chạy nhiều lần cho nhiều tháng.

### Q: Đơn đã có CSKH có bị chia lại không?
A: Không, chỉ chia đơn có CSKH trống.

### Q: Làm sao biết đơn nào không được chia?
A: Sau khi chia đơn vận đơn, hệ thống sẽ hiển thị danh sách đơn không được chia và lý do.

### Q: Có thể hoàn tác việc chia đơn không?
A: Hiện tại không có tính năng hoàn tác tự động. Cần cập nhật thủ công trong database.

### Q: Tại sao đơn Nhật Bản không được chia?
A: Đây là quy tắc nghiệp vụ, đơn Nhật Bản được xử lý riêng, không chia tự động.

---

## 8. Tài Liệu Liên Quan

- [Code Chia Đơn CSKH](./CHIA_DON_CSKH_CODE.md) - Tài liệu chi tiết về code chia đơn CSKH
- [Role & Permission](./ROLE_PERMISSION_DOC.md) - Quyền truy cập và phân quyền

---

**Cập nhật lần cuối**: 2024
**Phiên bản**: 1.0
