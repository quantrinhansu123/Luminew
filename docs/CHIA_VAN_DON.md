# Tài Liệu: Nút Chia Vận Đơn

## Tổng Quan

Nút **"Chia đơn vận đơn"** trong trang Admin Tools (`http://localhost:3001/admin-tools`) tự động phân bổ các đơn hàng chưa có nhân viên vận đơn (`delivery_staff` trống) cho các nhân viên vận đơn (role = U1) theo nguyên tắc công bằng và thông minh.

---

## Vị Trí

- **File**: `src/pages/AdminTools.jsx`
- **Hàm**: `handleChiaDonVanDon()`
- **UI**: Tab "Admin Tools" → Phần "Chia đơn vận đơn" → Nút "Chia đơn vận đơn"

---

## Điều Kiện Đơn Hàng Được Chia

Đơn hàng phải thỏa mãn **TẤT CẢ** các điều kiện sau:

1. ✅ **delivery_staff trống**: Cột `delivery_staff` phải là:
   - `null`
   - `undefined`
   - `''` (empty string)
   - `'EMPTY'`, `'NULL'`, `'NONE'` (case insensitive)

2. ✅ **Country không phải Nhật Bản**: `country` không được chứa các từ khóa:
   - "nhật bản"
   - "nhat ban"
   - "japan"
   - "jp"

3. ✅ **Team hợp lệ**: `team` phải là:
   - "HCM" hoặc các biến thể: "hcm", "hồ chí minh", "ho chi minh", "tp.hcm", "tp hcm"
   - "Hà Nội" hoặc các biến thể: "hà nội", "ha noi", "hanoi", "hn"

> **Lưu ý**: Nếu đơn chưa có `team` hoặc `team` không phải HCM/Hà Nội, hệ thống sẽ tự động điền `team` dựa trên `sale_staff` từ bảng `users` (lấy `branch`).

---

## Quy Trình Chia Đơn

### Bước 1: Lấy Danh Sách Nhân Viên Vận Đơn (U1)

- Query từ bảng `danh_sach_van_don` với điều kiện:
  - `trang_thai = 'U1'`
- Phân loại nhân viên theo `chi_nhanh`:
  - **HCM**: Nhân viên có `chi_nhanh` là "HCM" hoặc các biến thể
  - **Hà Nội**: Nhân viên có `chi_nhanh` là "Hà Nội" hoặc các biến thể

### Bước 2: Query Đơn Hàng Có delivery_staff Trống

Hệ thống thực hiện 2 query song song:

1. **Query 1**: Đơn có `delivery_staff IS NULL`
2. **Query 2**: Đơn có `delivery_staff = ''`

Sau đó gộp kết quả và lọc thêm các giá trị đặc biệt:
- `'EMPTY'`, `'NULL'`, `'NONE'` (case insensitive)

### Bước 3: Điền Team Cho Đơn Chưa Có Team

Nếu đơn chưa có `team` hoặc `team` không phải HCM/Hà Nội:

1. Lấy danh sách `users` với `name` và `branch`
2. Tìm `branch` của `sale_staff` trong đơn hàng
3. Map `branch` sang format chuẩn:
   - `branch` chứa "hcm" → `team = 'HCM'`
   - `branch` chứa "hà nội" → `team = 'Hà Nội'`
4. Cập nhật `team` vào database cho các đơn tìm thấy

### Bước 4: Phân Loại Đơn Theo Team

Sau khi có `team`, hệ thống phân loại đơn:

- **ordersHCM**: Đơn có `team` là HCM
- **ordersHaNoi**: Đơn có `team` là Hà Nội
- **ordersWithoutTeam**: Đơn không có `team` hoặc `team` khác (không được chia)
- **ordersExcluded**: Đơn bị loại trừ (ví dụ: Nhật Bản)

### Bước 5: Chia Đơn Theo 4 Rules

Hệ thống sử dụng hàm `smartDistribute()` để chia đơn cho mỗi chi nhánh (HCM và Hà Nội) theo 4 rules:

#### Rule 1: Xác Định Người Được Chia Cuối Cùng

- Tìm đơn gần nhất (theo `id` hoặc `order_date`) có `delivery_staff` thuộc danh sách nhân viên U1
- Xác định người được chia cuối cùng từ đơn đó

#### Rule 2: List Nhân Viên U1

- Danh sách nhân viên U1 đang đi làm (đã lấy ở Bước 1)
- Chỉ lấy nhân viên có `chi_nhanh` khớp với `team` của đơn

#### Rule 3: Cân Bằng Số Đơn

- Đếm số đơn hiện tại của mỗi nhân viên từ tất cả đơn trong database
- Tìm số đơn lớn nhất (`maxOrders`)
- Ưu tiên chia cho người có ít đơn hơn để bù cho cân bằng
- Chỉ chia đơn có `team` khớp với `chi_nhanh` của nhân viên

#### Rule 4: Round-Robin

- Chia phần đơn còn lại theo vòng tròn (round-robin)
- Bắt đầu từ người **SAU** người được chia cuối cùng (Rule 1)
- Tiếp tục vòng tròn cho đến khi hết đơn
- Chỉ chia đơn có `team` khớp với `chi_nhanh` của nhân viên

### Bước 6: Cập Nhật Database

- Cập nhật `delivery_staff` cho các đơn đã được chia
- Xử lý theo chunk (50 đơn/chunk) để tối ưu hiệu suất
- Hiển thị thông báo kết quả:
  - ✅ Thành công: Số đơn đã chia
  - ⚠️ Cảnh báo: Có đơn bị lỗi hoặc không chia được

---

## Logic Phân Loại Team

Hệ thống nhận diện nhiều biến thể của team:

### HCM:
- `"HCM"`
- `"hcm"`
- `"hồ chí minh"`
- `"ho chi minh"`
- `"tp.hcm"`
- `"tp hcm"`
- Hoặc bất kỳ chuỗi nào chứa các từ khóa trên

### Hà Nội:
- `"Hà Nội"`
- `"hà nội"`
- `"ha noi"`
- `"hanoi"`
- `"hn"`
- Hoặc bất kỳ chuỗi nào chứa các từ khóa trên

---

## Logic Phân Loại Country (Loại Trừ)

Đơn có `country` chứa các từ khóa sau sẽ **KHÔNG** được chia:

- `"nhật bản"`
- `"nhat ban"`
- `"japan"`
- `"jp"`

---

## Kết Quả Trả Về

Sau khi chia đơn, hệ thống hiển thị:

1. **Thông báo Toast**:
   - ✅ Thành công: `"Đã chia X đơn vận đơn thành công!"`
   - ⚠️ Cảnh báo: `"Không có đơn nào để chia vận đơn!"` hoặc `"Đã chia X đơn, nhưng có Y đơn bị lỗi!"`

2. **Thông tin Chi Tiết** (trong `autoAssignResult`):
   - Số nhân viên HCM và Hà Nội
   - Số đơn HCM và Hà Nội cần chia
   - Tổng đơn đã cập nhật
   - Số đơn bị lỗi (nếu có)
   - Thống kê chi tiết:
     - Tổng đơn có `delivery_staff` trống/null
     - Đơn bị loại trừ do Nhật Bản
     - Đơn không có team/team khác

3. **Danh Sách Đơn Không Được Chia** (`notDividedOrders`):
   - Lưu danh sách đơn không được chia kèm lý do

---

## Debug & Logging

Hệ thống có logging chi tiết trong Console để debug:

- 🔍 Query orders từ database
- 📊 Thống kê `delivery_staff`
- 📦 Danh sách đơn cần chia
- 🔍 Phân loại đơn theo team
- ⚖️ Kết quả cân bằng (Rule 3)
- 🔄 Kết quả round-robin (Rule 4)
- ✅ Kết quả cập nhật database

Nếu có đơn đặc biệt cần kiểm tra (được định nghĩa trong `TARGET_ORDER_CODE`), hệ thống sẽ log chi tiết từng bước xử lý đơn đó.

---

## Lưu Ý Quan Trọng

1. **Giới Hạn Query**: Supabase mặc định chỉ trả về 1000 rows. Hệ thống đã xử lý bằng cách:
   - Query riêng đơn có `delivery_staff IS NULL` và `delivery_staff = ''`
   - Sử dụng `.limit(100000)` để lấy nhiều đơn hơn

2. **Điền Team Tự Động**: Nếu đơn chưa có `team`, hệ thống sẽ tự động điền dựa trên `sale_staff` → `branch` từ bảng `users`. Nếu không tìm thấy, đơn sẽ không được chia.

3. **Khớp Team với Chi Nhánh**: Đơn chỉ được chia cho nhân viên có `chi_nhanh` khớp với `team` của đơn. Ví dụ:
   - Đơn có `team = 'HCM'` chỉ được chia cho nhân viên có `chi_nhanh = 'HCM'`

4. **Cân Bằng Đơn**: Rule 3 đảm bảo chia đều đơn cho các nhân viên. Nếu tất cả nhân viên đều có số đơn bằng nhau, Rule 4 sẽ chia theo round-robin.

5. **Xử Lý Lỗi**: Nếu có lỗi khi cập nhật database, hệ thống sẽ:
   - Log lỗi vào Console
   - Lưu danh sách đơn bị lỗi
   - Hiển thị cảnh báo trong thông báo

---

## Ví Dụ

### Trường Hợp 1: Chia Đơn HCM

1. Có 100 đơn HCM có `delivery_staff` trống
2. Có 5 nhân viên U1 thuộc HCM
3. Rule 3: Chia đều 100 đơn cho 5 người (mỗi người 20 đơn)
4. Rule 4: Không có đơn còn lại

### Trường Hợp 2: Cân Bằng Đơn

1. Nhân viên A có 50 đơn, B có 45 đơn, C có 40 đơn
2. Có 30 đơn mới cần chia
3. Rule 3: Chia 10 đơn cho C (để đạt 50), 5 đơn cho B (để đạt 50)
4. Rule 4: Chia 15 đơn còn lại theo round-robin

### Trường Hợp 3: Đơn Không Được Chia

1. Đơn có `delivery_staff = 'Nguyễn Văn A'` → Không được chia (đã có nhân viên)
2. Đơn có `country = 'Nhật Bản'` → Không được chia (bị loại trừ)
3. Đơn có `team = 'Đà Nẵng'` → Không được chia (không phải HCM/Hà Nội)

---

## Tài Liệu Liên Quan

- `docs/CHIA_DON_TU_DONG.md`: Tài liệu về nút chia đơn CSKH
- `src/pages/AdminTools.jsx`: File chứa logic chia đơn vận đơn
