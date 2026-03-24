# Tài Liệu: Logic Chia Vận Đơn

## Tổng Quan

Logic chia vận đơn tự động phân bổ các đơn hàng chưa có nhân viên vận đơn (`delivery_staff` trống) cho các nhân viên vận đơn (role = U1) theo nguyên tắc công bằng và thông minh.

**File**: `src/pages/AdminTools.jsx`  
**Hàm**: `handleChiaDonVanDon()`

---

## Quy Trình Chia Đơn

### Bước 1: Lấy Danh Sách Nhân Viên Vận Đơn (U1)

**Nguồn dữ liệu**: Bảng `danh_sach_van_don`

**Điều kiện**:
- `trang_thai_chia = 'U1'`

**Phân loại theo chi nhánh**:
- **HCM**: Nhân viên có `chi_nhanh` là "HCM" hoặc các biến thể
- **Hà Nội**: Nhân viên có `chi_nhanh` là "Hà Nội" hoặc các biến thể

**Logic nhận diện chi_nhanh**:

#### HCM:
- `chi_nhanh === 'HCM'`
- `chi_nhanh.toLowerCase() === 'hcm'`
- `chi_nhanhClean === 'hcm'`
- `chi_nhanh.toLowerCase() === 'hồ chí minh'` hoặc `'ho chi minh'`
- `chi_nhanhClean === 'hochiminh'`
- Hoặc chứa các từ khóa: `'hcm'`, `'hồ chí minh'`, `'ho chi minh'`, `'hochiminh'`

#### Hà Nội:
- `chi_nhanh === 'Hà Nội'`
- `chi_nhanh.toLowerCase() === 'hà nội'` hoặc `'ha noi'` hoặc `'hanoi'`
- `chi_nhanhClean === 'hanoi'` hoặc `'ha noi'`
- Hoặc chứa các từ khóa: `'hà nội'`, `'hanoi'`, `'ha noi'`

**Chuẩn hóa**: Sau khi phân loại, `chi_nhanh` được chuẩn hóa về `'HCM'` hoặc `'Hà Nội'`.

---

### Bước 2: Query Đơn Hàng Có delivery_staff Trống

**Các query được thực hiện**:

1. **Query 1**: Đơn có `delivery_staff IS NULL`
   ```sql
   SELECT * FROM orders WHERE delivery_staff IS NULL LIMIT 100000
   ```

2. **Query 2**: Đơn có `delivery_staff = ''` (empty string)
   ```sql
   SELECT * FROM orders WHERE delivery_staff = '' LIMIT 100000
   ```

3. **Query 3**: Đơn có `delivery_staff = 'NULL'` (string, case insensitive)
   ```sql
   SELECT * FROM orders WHERE delivery_staff ILIKE 'NULL' LIMIT 100000
   ```

4. **Query 4**: Đơn có `delivery_staff = 'EMPTY'` (string, case insensitive)
   ```sql
   SELECT * FROM orders WHERE delivery_staff ILIKE 'EMPTY' LIMIT 100000
   ```

5. **Query 5**: Đơn có `delivery_staff = 'NONE'` (string, case insensitive)
   ```sql
   SELECT * FROM orders WHERE delivery_staff ILIKE 'NONE' LIMIT 100000
   ```

6. **Query 6**: Tất cả đơn (để đếm đơn hiện tại cho Rule 3)
   ```sql
   SELECT * FROM orders LIMIT 100000
   ```

**Gộp kết quả**: Gộp tất cả các đơn từ 5 query đầu, loại trùng lặp theo `order_code`.

**Lọc client-side bổ sung**: Duyệt lại TẤT CẢ đơn từ Query 6 để đảm bảo không bỏ sót:
- Đơn có `delivery_staff` là `null` hoặc `undefined`
- Đơn có `delivery_staff` là empty string hoặc chỉ có whitespace
- Đơn có `delivery_staff` là `'EMPTY'`, `'NULL'`, `'NONE'` (case insensitive)

**Kiểm tra cuối cùng**: Đếm số đơn có `delivery_staff` NULL/trống trong tất cả đơn và so sánh với số đơn trong `ordersArray` để đảm bảo không bỏ sót.

---

### Bước 3: Điền Team Cho Đơn Chưa Có Team

**Điều kiện đơn cần điền team**:
- `team` trống hoặc `null`
- `team` không phải HCM hoặc Hà Nội (sau khi normalize)

**Logic điền team (theo thứ tự ưu tiên)**:

#### Phương án 1: Từ sale_staff → branch (bảng users)
1. Lấy `sale_staff` từ đơn
2. Tìm `branch` của `sale_staff` trong bảng `users`
3. Map `branch` sang format chuẩn:
   - `branch` chứa "hcm" → `team = 'HCM'`
   - `branch` chứa "hà nội" → `team = 'Hà Nội'`
4. Cập nhật `team` vào database

#### Phương án 2: Từ các đơn khác có cùng sale_staff
1. Tìm các đơn khác có cùng `sale_staff` đã có `team`
2. Lấy `team` phổ biến nhất từ các đơn đó
3. Sử dụng `team` đó nếu là HCM hoặc Hà Nội

#### Phương án 3: Từ các đơn có cùng country
1. Tìm các đơn khác có cùng `country` đã có `team` hợp lệ (HCM hoặc Hà Nội)
2. Lấy `team` phổ biến nhất từ các đơn đó
3. Sử dụng `team` đó

**Sau khi điền team**:
- Cập nhật `team` vào database (xử lý theo chunk 50 đơn/lần)
- Reload lại đơn từ database để có dữ liệu mới nhất
- Cập nhật `team` trong `ordersArray` để logic phía sau dùng đúng

---

### Bước 4: Phân Loại Đơn Theo Team

**Loại trừ đơn Nhật Bản**:
- Đơn có `country` chứa các từ khóa: `'nhật bản'`, `'nhat ban'`, `'japan'`, `'jp'` → Bị loại trừ

**Phân loại theo team**:

#### Logic nhận diện team:

**HCM**:
- `team === 'HCM'`
- `team.toLowerCase() === 'hcm'`
- `teamClean === 'hcm'`
- `team.toLowerCase() === 'hồ chí minh'` hoặc `'ho chi minh'`
- `teamClean === 'hochiminh'` hoặc `'ho chi minh'`
- Hoặc chứa các từ khóa: `'hcm'`, `'hồ chí minh'`, `'ho chi minh'`, `'hochiminh'`

**Hà Nội**:
- `team === 'Hà Nội'`
- `team.toLowerCase() === 'hà nội'` hoặc `'ha noi'` hoặc `'hanoi'`
- `teamClean === 'hanoi'` hoặc `'ha noi'`
- Hoặc chứa các từ khóa: `'hà nội'`, `'hanoi'`, `'ha noi'`

**teamClean**: Loại bỏ ký tự đặc biệt và khoảng trắng thừa để so sánh:
```javascript
const teamClean = teamLower.replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, '').replace(/\s+/g, ' ').trim();
```

**Kết quả phân loại**:
- **ordersHCM**: Đơn có `team` là HCM
- **ordersHaNoi**: Đơn có `team` là Hà Nội
- **ordersWithoutTeam**: Đơn không có `team` hoặc `team` khác (không được chia)
- **ordersExcluded**: Đơn bị loại trừ (ví dụ: Nhật Bản)

---

### Bước 5: Chia Đơn Theo 4 Rules

Hệ thống sử dụng hàm `smartDistribute()` để chia đơn cho mỗi chi nhánh (HCM và Hà Nội) theo 4 rules:

#### Rule 1: Xác Định Người Được Chia Cuối Cùng

**Mục đích**: Đảm bảo tính công bằng, tiếp tục từ vị trí đã dừng lại.

**Logic**:
1. Tìm tất cả đơn có `delivery_staff` thuộc danh sách nhân viên U1 của chi nhánh
2. Sắp xếp theo `id` giảm dần (hoặc `order_date` nếu không có `id`)
3. Lấy đơn mới nhất → Xác định người được chia cuối cùng
4. Xác định index của người đó trong danh sách nhân viên

**Kết quả**: `lastAssignedPerson` và `lastAssignedIndex`

---

#### Rule 2: List Nhân Viên U1

**Mục đích**: Xác định danh sách nhân viên sẽ nhận đơn.

**Logic**:
- Danh sách nhân viên U1 đã được lấy ở Bước 1
- Chỉ lấy nhân viên có `chi_nhanh` khớp với `team` của đơn

**Kết quả**: `staffList` (array of names)

---

#### Rule 3: Cân Bằng Số Đơn

**Mục đích**: Ưu tiên chia cho người có ít đơn hơn để đảm bảo công bằng.

**Logic**:
1. **Đếm số đơn hiện tại** của mỗi nhân viên từ tất cả đơn trong database
2. **Tìm số đơn lớn nhất** (`maxOrders`)
3. **Tính số đơn cần bù** cho mỗi người: `deficit = maxOrders - orderCountMap[staff.name]`
4. **Sắp xếp nhân viên** theo số đơn tăng dần
5. **Chia đơn**:
   - Với mỗi nhân viên có `deficit > 0`:
     - Lọc đơn có `team` khớp với `chi_nhanh` của nhân viên
     - Chia tối đa `deficit` đơn cho nhân viên đó
     - Cập nhật `orderCountMap` sau mỗi lần chia
   - Xóa đơn đã chia khỏi `remainingOrders`

**Điều kiện khớp team với chi_nhanh**:
- Sử dụng hàm `isTeamBranchMatch(orderTeam, staffChiNhanh)`:
  - `orderTeam` và `staffChiNhanh` đều phải là HCM, HOẶC
  - `orderTeam` và `staffChiNhanh` đều phải là Hà Nội

**Kết quả**: `balanceUpdates` (array of {order_code, delivery_staff})

---

#### Rule 4: Round-Robin

**Mục đích**: Chia phần đơn còn lại theo vòng tròn, bắt đầu từ người sau người được chia cuối cùng.

**Logic**:
1. **Xác định điểm bắt đầu**: `startIndex = (lastAssignedIndex + 1) % staffList.length`
2. **Duyệt từng đơn còn lại**:
   - Với mỗi đơn, tìm nhân viên đầu tiên (bắt đầu từ `nextIndex`) có `chi_nhanh` khớp với `team` của đơn
   - Gán đơn cho nhân viên đó
   - Cập nhật `nextIndex = (idx + 1) % staffList.length` để tiếp tục vòng tròn
3. **Nếu không tìm thấy nhân viên phù hợp**: Bỏ qua đơn (log cảnh báo)

**Điều kiện khớp**: Tương tự Rule 3, sử dụng `isTeamBranchMatch()`

**Kết quả**: Thêm vào `result` array

---

### Bước 6: Cập Nhật Database

**Xử lý theo chunk**: 50 đơn/chunk để tối ưu hiệu suất

**Logic**:
```javascript
for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    const updatePromises = chunk.map(async (update) => {
        const { data, error } = await supabase
            .from('orders')
            .update({ delivery_staff: update.delivery_staff })
            .eq('order_code', update.order_code)
            .select();
        
        // Kiểm tra kết quả update
        if (error) {
            // Log lỗi
            return { success: false, error };
        }
        
        // Kiểm tra delivery_staff đã được cập nhật đúng chưa
        if (data && data.length > 0 && data[0].delivery_staff === update.delivery_staff) {
            return { success: true, data };
        }
        
        // Log cảnh báo nếu không khớp
        return { success: false, error: 'No data returned or mismatch' };
    });
    
    await Promise.all(updatePromises);
}
```

**Kết quả**:
- `successCount`: Số đơn cập nhật thành công
- `errorCount`: Số đơn bị lỗi
- `errors`: Danh sách lỗi chi tiết

---

## Điều Kiện Đơn Được Chia

Đơn hàng phải thỏa mãn **TẤT CẢ** các điều kiện sau:

1. ✅ **delivery_staff trống**: 
   - `null`
   - `undefined`
   - `''` (empty string)
   - `'EMPTY'`, `'NULL'`, `'NONE'` (case insensitive)

2. ✅ **Country không phải Nhật Bản**: 
   - `country` không được chứa: `'nhật bản'`, `'nhat ban'`, `'japan'`, `'jp'`

3. ✅ **Team hợp lệ**: 
   - `team` phải là "HCM" hoặc "Hà Nội" (hoặc các biến thể được hỗ trợ)

4. ✅ **Khớp chi_nhanh với nhân viên**: 
   - Đơn HCM chỉ được chia cho nhân viên có `chi_nhanh = 'HCM'`
   - Đơn Hà Nội chỉ được chia cho nhân viên có `chi_nhanh = 'Hà Nội'`

---

## Hàm isTeamBranchMatch

**Mục đích**: Kiểm tra xem `team` của đơn có khớp với `chi_nhanh` của nhân viên không.

**Logic**:
1. Normalize cả `orderTeam` và `staffChiNhanh`:
   - Loại bỏ ký tự đặc biệt
   - Loại bỏ khoảng trắng thừa
   - Chuyển về lowercase
   - Tạo `teamClean` và `chiNhanhClean`

2. Kiểm tra HCM:
   - `orderIsHCM = true` (orderTeam là HCM)
   - `staffIsHCM = true` (staffChiNhanh là HCM)
   - `isHCM = orderIsHCM && staffIsHCM`

3. Kiểm tra Hà Nội:
   - `orderIsHanoi = true` (orderTeam là Hà Nội)
   - `staffIsHanoi = true` (staffChiNhanh là Hà Nội)
   - `isHanoi = orderIsHanoi && staffIsHanoi`

4. Kết quả: `return isHCM || isHanoi`

---

## Thống Kê và Logging

Hệ thống có logging chi tiết để debug:

### Thống kê delivery_staff:
- Số đơn có `delivery_staff` NULL
- Số đơn có `delivery_staff` empty string
- Số đơn có `delivery_staff = 'NULL'`, `'EMPTY'`, `'NONE'`
- Tổng đơn null/empty/đặc biệt (loại trùng)

### Thống kê team:
- Thống kê team trước khi phân loại
- Chi tiết team của 10 đơn đầu
- Số đơn HCM, Hà Nội, không có team

### Thống kê chia đơn:
- Số nhân viên HCM và Hà Nội
- Số đơn HCM và Hà Nội cần chia
- Số đơn được chia (Rule 3 và Rule 4)
- Số đơn bị lỗi khi cập nhật

### Tổng hợp:
- Tổng đơn có delivery_staff trống/null
- Đơn HCM và Hà Nội
- Đơn không có team/team khác
- Đơn bị loại trừ (Nhật Bản)
- Nhân viên HCM và Hà Nội (U1)
- Tổng đơn sẽ được cập nhật
- Cảnh báo nếu không có đơn nào được chia

---

## Danh Sách Đơn Không Được Chia

Hệ thống lưu danh sách đơn không được chia với lý do cụ thể:

1. **Đơn không có team/team khác**: `ordersWithoutTeam`
   - Lý do: `team` trống hoặc không phải HCM/Hà Nội

2. **Đơn có trong danh sách chia nhưng không được gán**: `ordersNotAssigned`
   - Lý do: Không khớp `chi_nhanh` giữa đơn và nhân viên, hoặc không có nhân viên phù hợp

**Lưu ý**: Đơn Nhật Bản bị loại trừ nhưng **KHÔNG** hiển thị trong danh sách đơn không được chia (đã được loại bỏ khỏi danh sách hiển thị).

**Sắp xếp**: Danh sách được sắp xếp theo `order_date` giảm dần (ngày gần nhất lên đầu).

---

## Ví Dụ

### Trường Hợp 1: Chia Đơn HCM

**Input**:
- 100 đơn HCM có `delivery_staff` trống
- 5 nhân viên U1 thuộc HCM
- Tất cả nhân viên đều có số đơn bằng nhau (20 đơn/người)

**Quá trình**:
1. Rule 3: Không có ai thiếu đơn → Không chia gì
2. Rule 4: Chia 100 đơn theo round-robin → Mỗi người 20 đơn

**Kết quả**: Mỗi nhân viên nhận thêm 20 đơn (tổng 40 đơn/người)

---

### Trường Hợp 2: Cân Bằng Đơn

**Input**:
- Nhân viên A: 50 đơn
- Nhân viên B: 45 đơn
- Nhân viên C: 40 đơn
- 30 đơn mới cần chia

**Quá trình**:
1. Rule 3:
   - `maxOrders = 50`
   - A: `deficit = 0` → Không chia
   - B: `deficit = 5` → Chia 5 đơn
   - C: `deficit = 10` → Chia 10 đơn
   - Còn lại: 15 đơn

2. Rule 4: Chia 15 đơn còn lại theo round-robin

**Kết quả**: 
- A: 50 đơn (không thay đổi)
- B: 50 đơn (+5)
- C: 50 đơn (+10, sau đó thêm từ round-robin)

---

### Trường Hợp 3: Đơn Không Được Chia

**Ví dụ 1**: Đơn có `delivery_staff = 'Nguyễn Văn A'`
- ❌ Không được chia (đã có nhân viên)

**Ví dụ 2**: Đơn có `country = 'Nhật Bản'`
- ❌ Không được chia (bị loại trừ)

**Ví dụ 3**: Đơn có `team = 'Đà Nẵng'`
- ❌ Không được chia (không phải HCM/Hà Nội)

**Ví dụ 4**: Đơn HCM nhưng không có nhân viên U1 thuộc HCM
- ❌ Không được chia (không có nhân viên phù hợp)

---

## Lưu Ý Quan Trọng

1. **Giới hạn query**: Supabase mặc định chỉ trả về 1000 rows. Hệ thống đã xử lý bằng cách:
   - Query riêng từng trường hợp (NULL, empty, 'NULL', 'EMPTY', 'NONE')
   - Sử dụng `.limit(100000)` để lấy nhiều đơn hơn
   - Lọc lại client-side để đảm bảo không bỏ sót

2. **Điền team tự động**: Nếu đơn chưa có `team`, hệ thống sẽ tự động điền theo thứ tự ưu tiên:
   - Từ `sale_staff` → `branch` (bảng users)
   - Từ các đơn khác có cùng `sale_staff`
   - Từ các đơn có cùng `country`

3. **Khớp team với chi_nhanh**: Đơn chỉ được chia cho nhân viên có `chi_nhanh` khớp với `team` của đơn. Ví dụ:
   - Đơn có `team = 'HCM'` chỉ được chia cho nhân viên có `chi_nhanh = 'HCM'`

4. **Cân bằng đơn**: Rule 3 đảm bảo chia đều đơn cho các nhân viên. Nếu tất cả nhân viên đều có số đơn bằng nhau, Rule 4 sẽ chia theo round-robin.

5. **Xử lý lỗi**: Nếu có lỗi khi cập nhật database, hệ thống sẽ:
   - Log lỗi vào Console
   - Lưu danh sách đơn bị lỗi
   - Hiển thị cảnh báo trong thông báo

6. **Debug**: Hệ thống có logging chi tiết cho đơn đặc biệt (được định nghĩa trong `TARGET_ORDER_CODE`) để debug dễ dàng hơn.

---

## Tài Liệu Liên Quan

- `docs/CHIA_VAN_DON.md`: Tài liệu tổng quan về nút chia vận đơn
- `src/pages/AdminTools.jsx`: File chứa logic chia đơn vận đơn
