# Logic Chia Đều Đơn Hàng Cho Nhân Viên Vận Đơn

## Tổng Quan

Hệ thống chia đơn hàng cho nhân viên vận đơn (delivery staff) theo **4 Rules** để đảm bảo tính công bằng và cân bằng tải:

1. **Rule 1**: Xác định người được chia cuối cùng từ database
2. **Rule 2**: Lấy danh sách nhân viên U1 đang đi làm
3. **Rule 3**: Ưu tiên chia cho người có ít đơn hơn để cân bằng
4. **Rule 4**: Round-robin (chia vòng tròn) phần còn lại từ người tiếp theo sau người cuối cùng

---

## Điều Kiện Tiên Quyết

### 1. Lọc Đơn Hàng Cần Chia

Chỉ các đơn hàng thỏa mãn các điều kiện sau mới được chia:

- ✅ `delivery_staff` phải là: `null`, `undefined`, `''`, `'EMPTY'`, `'NULL'`, hoặc `'NONE'`
- ✅ `country` **KHÔNG** chứa: "Nhật Bản", "nhat ban", "japan", "jp" (đơn Nhật Bản bị loại trừ)
- ✅ `team` phải là **HCM** hoặc **Hà Nội** (các team khác không được chia)

### 2. Phân Loại Theo Team

Đơn hàng được phân loại thành 2 nhóm:
- **ordersHCM**: Đơn có `team` = HCM (hoặc các biến thể: "hcm", "hồ chí minh", "ho chi minh", ...)
- **ordersHaNoi**: Đơn có `team` = Hà Nội (hoặc các biến thể: "hà nội", "ha noi", "hanoi", ...)

### 3. Lấy Danh Sách Nhân Viên

Lấy danh sách nhân viên từ bảng `users` với điều kiện:
- `role` = "U1" (nhân viên vận đơn)
- `status` = "đang đi làm"
- `chi_nhanh` khớp với team của đơn hàng (HCM hoặc Hà Nội)

---

## Chi Tiết 4 Rules

### Rule 1: Xác Định Người Được Chia Cuối Cùng

**Mục đích**: Tìm người nhận đơn gần nhất để tiếp tục chia từ người tiếp theo, đảm bảo tính công bằng.

**Cách thực hiện**:
1. Query tất cả đơn hàng trong database có `delivery_staff` thuộc danh sách nhân viên hiện tại
2. Sắp xếp theo:
   - Ưu tiên: `id` (auto-increment, lớn hơn = mới hơn)
   - Fallback: `order_date` (ngày mới hơn = ưu tiên)
3. Lấy đơn hàng đầu tiên (mới nhất) → `delivery_staff` của đơn này là người được chia cuối cùng
4. Xác định `index` của người này trong danh sách nhân viên

**Ví dụ**:
```
Danh sách nhân viên: [A, B, C, D]
Đơn mới nhất có delivery_staff = "B" → lastAssignedPerson = "B", lastAssignedIndex = 1
```

---

### Rule 2: Danh Sách Nhân Viên U1

**Mục đích**: Lấy danh sách nhân viên vận đơn đang đi làm, có `chi_nhanh` khớp với team của đơn hàng.

**Cách thực hiện**:
- Query từ bảng `users` với điều kiện:
  - `role = 'U1'`
  - `status = 'đang đi làm'`
  - `chi_nhanh` khớp với team (HCM hoặc Hà Nội)

**Kết quả**: Mảng `staffListWithBranch` chứa `{name, chi_nhanh}`

---

### Rule 3: Cân Bằng - Chia Cho Người Có Ít Đơn Hơn

**Mục đích**: Ưu tiên chia đơn cho người có ít đơn hơn để cân bằng tải giữa các nhân viên.

**Cách thực hiện**:

1. **Đếm số đơn hiện tại** của mỗi nhân viên:
   ```javascript
   orderCountMap = {
     "Nhân viên A": 10,
     "Nhân viên B": 8,
     "Nhân viên C": 12,
     "Nhân viên D": 9
   }
   ```

2. **Tìm số đơn cao nhất** (`maxOrders`):
   - Ví dụ: `maxOrders = 12` (Nhân viên C)

3. **Tính số đơn thiếu** cho mỗi người:
   ```javascript
   deficit = maxOrders - orderCountMap[name]
   ```
   - Nhân viên A: `deficit = 12 - 10 = 2`
   - Nhân viên B: `deficit = 12 - 8 = 4`
   - Nhân viên C: `deficit = 12 - 12 = 0` (không cần bù)
   - Nhân viên D: `deficit = 12 - 9 = 3`

4. **Sắp xếp nhân viên** theo số đơn tăng dần (người có ít đơn nhất được ưu tiên trước)

5. **Chia đơn để bù**:
   - Với mỗi nhân viên có `deficit > 0`:
     - Lọc đơn có `team` khớp với `chi_nhanh` của nhân viên
     - Chia tối đa `deficit` đơn cho nhân viên đó
     - Cập nhật `orderCountMap` sau mỗi lần chia

**Ví dụ**:
```
Sau Rule 3:
- Nhân viên B nhận thêm 4 đơn (từ 8 → 12)
- Nhân viên D nhận thêm 3 đơn (từ 9 → 12)
- Nhân viên A nhận thêm 2 đơn (từ 10 → 12)
- Nhân viên C không nhận thêm (đã = 12)
```

**Lưu ý**: 
- Chỉ chia đơn có `team` khớp với `chi_nhanh` của nhân viên
- Nếu không đủ đơn để bù, chia hết số đơn có thể

---

### Rule 4: Round-Robin (Chia Vòng Tròn)

**Mục đích**: Chia đều phần đơn còn lại sau Rule 3 theo vòng tròn, bắt đầu từ người tiếp theo sau người được chia cuối cùng (Rule 1).

**Cách thực hiện**:

1. **Xác định điểm bắt đầu**:
   ```javascript
   startIndex = (lastAssignedIndex + 1) % staffListWithBranch.length
   ```
   - Nếu `lastAssignedIndex = 1` (Nhân viên B) và có 4 nhân viên
   - → `startIndex = (1 + 1) % 4 = 2` (Nhân viên C)

2. **Chia vòng tròn**:
   - Bắt đầu từ `startIndex`
   - Với mỗi đơn còn lại:
     - Tìm nhân viên tiếp theo có `chi_nhanh` khớp với `team` của đơn
     - Chia đơn cho nhân viên đó
     - Di chuyển đến nhân viên tiếp theo: `nextIndex = (currentIndex + 1) % staffList.length`
     - Lặp lại cho đến khi hết đơn

**Ví dụ**:
```
Danh sách nhân viên: [A, B, C, D]
lastAssignedIndex = 1 (Nhân viên B)
startIndex = 2 (Nhân viên C)

Đơn còn lại: [Đơn1, Đơn2, Đơn3, Đơn4, Đơn5]

Chia:
- Đơn1 → Nhân viên C (index 2)
- Đơn2 → Nhân viên D (index 3)
- Đơn3 → Nhân viên A (index 0)
- Đơn4 → Nhân viên B (index 1)
- Đơn5 → Nhân viên C (index 2)
```

**Lưu ý**:
- Nếu nhân viên hiện tại không có `chi_nhanh` khớp với `team` của đơn, bỏ qua và tìm nhân viên tiếp theo
- Nếu không tìm thấy nhân viên nào khớp, đơn đó sẽ không được chia (sẽ hiển thị trong danh sách "đơn không được chia")

---

## Quy Trình Tổng Thể

```
1. Lấy TẤT CẢ đơn hàng từ database (pagination)
   ↓
2. Loại trừ đơn Nhật Bản (country chứa "Nhật Bản"/"japan"/...)
   ↓
3. Lọc đơn có delivery_staff trống/null/empty
   ↓
4. Điền team cho đơn chưa có team (từ users.branch dựa trên sale_staff)
   ↓
5. Phân loại đơn theo team (HCM / Hà Nội)
   ↓
6. Lấy danh sách nhân viên U1 theo từng chi nhánh
   ↓
7. Với mỗi chi nhánh (HCM / Hà Nội):
   a. Rule 1: Xác định người được chia cuối cùng
   b. Rule 2: Lấy danh sách nhân viên (đã có)
   c. Rule 3: Cân bằng - chia cho người có ít đơn hơn
   d. Rule 4: Round-robin phần còn lại
   ↓
8. Cập nhật delivery_staff cho các đơn đã chia
   ↓
9. Hiển thị kết quả và danh sách đơn không được chia
```

---

## Ví Dụ Cụ Thể

### Tình Huống

**Nhân viên HCM**:
- Nhân viên A: 10 đơn
- Nhân viên B: 8 đơn
- Nhân viên C: 12 đơn
- Nhân viên D: 9 đơn

**Đơn cần chia**: 20 đơn HCM

**Đơn mới nhất trong DB**: có `delivery_staff = "B"` (Nhân viên B)

---

### Thực Hiện

**Rule 1**: 
- `lastAssignedPerson = "B"`, `lastAssignedIndex = 1`
- `startIndex = (1 + 1) % 4 = 2` (Nhân viên C)

**Rule 2**: 
- Danh sách: [A, B, C, D]

**Rule 3 - Cân bằng**:
- `maxOrders = 12` (Nhân viên C)
- Sắp xếp theo số đơn: [B(8), D(9), A(10), C(12)]
- Chia bù:
  - B: nhận 4 đơn (8 → 12)
  - D: nhận 3 đơn (9 → 12)
  - A: nhận 2 đơn (10 → 12)
  - C: không nhận (đã = 12)
- **Đã chia**: 4 + 3 + 2 = 9 đơn
- **Còn lại**: 20 - 9 = 11 đơn

**Rule 4 - Round-robin**:
- Bắt đầu từ Nhân viên C (index 2)
- Chia 11 đơn còn lại:
  - Đơn1 → C (index 2)
  - Đơn2 → D (index 3)
  - Đơn3 → A (index 0)
  - Đơn4 → B (index 1)
  - Đơn5 → C (index 2)
  - Đơn6 → D (index 3)
  - Đơn7 → A (index 0)
  - Đơn8 → B (index 1)
  - Đơn9 → C (index 2)
  - Đơn10 → D (index 3)
  - Đơn11 → A (index 0)

---

### Kết Quả Cuối Cùng

**Số đơn mỗi người nhận thêm**:
- Nhân viên A: 2 (Rule 3) + 3 (Rule 4) = **5 đơn**
- Nhân viên B: 4 (Rule 3) + 2 (Rule 4) = **6 đơn**
- Nhân viên C: 0 (Rule 3) + 3 (Rule 4) = **3 đơn**
- Nhân viên D: 3 (Rule 3) + 3 (Rule 4) = **6 đơn**

**Tổng**: 5 + 6 + 3 + 6 = 20 đơn ✅

**Số đơn sau khi chia**:
- Nhân viên A: 10 + 5 = **15 đơn**
- Nhân viên B: 8 + 6 = **14 đơn**
- Nhân viên C: 12 + 3 = **15 đơn**
- Nhân viên D: 9 + 6 = **15 đơn**

**Chênh lệch**: Tối đa 1 đơn (từ 14 đến 15) → **Cân bằng tốt** ✅

---

## Điều Kiện Khớp Team - Chi Nhánh

Để đơn hàng được chia cho nhân viên, `team` của đơn phải khớp với `chi_nhanh` của nhân viên.

### HCM

**Đơn hàng** (`team`):
- "HCM", "hcm", "Hồ Chí Minh", "hồ chí minh", "Ho Chi Minh", "ho chi minh", "TP.HCM", "tp hcm", ...
- Hoặc chứa từ khóa: "hcm", "hồ chí minh", "ho chi minh"

**Nhân viên** (`chi_nhanh`):
- Phải khớp với các biến thể trên

### Hà Nội

**Đơn hàng** (`team`):
- "Hà Nội", "hà nội", "Ha Noi", "ha noi", "Hanoi", "hanoi", "HN", ...
- Hoặc chứa từ khóa: "hà nội", "hanoi", "ha noi"

**Nhân viên** (`chi_nhanh`):
- Phải khớp với các biến thể trên

**Lưu ý**: Hệ thống sẽ normalize (loại bỏ ký tự đặc biệt, khoảng trắng thừa) để so sánh chính xác hơn.

---

## Xử Lý Trường Hợp Đặc Biệt

### 1. Không Có Nhân Viên

Nếu không có nhân viên nào trong chi nhánh:
- Tất cả đơn của chi nhánh đó sẽ không được chia
- Hiển thị cảnh báo trong log

### 2. Không Có Đơn

Nếu không có đơn nào cần chia:
- Không thực hiện chia đơn
- Hiển thị thông báo trong log

### 3. Đơn Không Khớp Team

Nếu đơn không khớp với `chi_nhanh` của bất kỳ nhân viên nào:
- Đơn đó sẽ không được chia
- Hiển thị trong danh sách "đơn không được chia" với lý do: "team không khớp với chi_nhanh của nhân viên"

### 4. Tất Cả Nhân Viên Có Số Đơn Bằng Nhau

Nếu tất cả nhân viên đều có số đơn bằng nhau (Rule 3 không chia gì):
- Rule 4 sẽ chia tất cả đơn theo round-robin
- Đảm bảo tính công bằng

---

## Logging và Debug

Hệ thống ghi log chi tiết cho từng bước:

- ✅ **Rule 1**: Người được chia cuối cùng và index
- ✅ **Rule 2**: Danh sách nhân viên
- ✅ **Rule 3**: Số đơn hiện tại, số đơn thiếu, số đơn đã bù
- ✅ **Rule 4**: Điểm bắt đầu, chi tiết từng đơn được chia
- ✅ **Kết quả**: Tổng số đơn mỗi người nhận

Các log này được hiển thị trong:
- Console (cho developer)
- UI Log (cho người dùng) - với các icon và màu sắc khác nhau

---

## Tóm Tắt

Logic chia đều đảm bảo:

1. ✅ **Cân bằng tải**: Người có ít đơn hơn được ưu tiên (Rule 3)
2. ✅ **Công bằng**: Chia vòng tròn từ người tiếp theo sau người cuối cùng (Rule 4)
3. ✅ **Chính xác**: Chỉ chia đơn có team khớp với chi_nhanh của nhân viên
4. ✅ **Minh bạch**: Log chi tiết từng bước để dễ debug

Kết quả: Số đơn giữa các nhân viên chênh lệch tối thiểu, đảm bảo công bằng và hiệu quả.
