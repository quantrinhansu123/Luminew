# Đoạn Code Chia Đơn Vận Đơn

## Tổng Quan

File chứa code: `src/pages/AdminTools.jsx`

Hàm chính: `handleChiaDonVanDon()` - Bắt đầu từ dòng 1521

Hàm chia đơn thông minh: `smartDistribute()` - Bắt đầu từ dòng 2520

---

## 1. Hàm Chính `handleChiaDonVanDon()`

### Khởi tạo và Setup

```javascript
const handleChiaDonVanDon = async () => {
    setAutoAssignLoading(true);
    setAutoAssignResult(null);
    setNotDividedOrders([]);
    setOrderSearchResult(null);
    setStepLogs([]); // Reset log

    // Helper function để thêm log
    const addLog = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString('vi-VN');
        const logEntry = {
            timestamp,
            type, // 'info', 'success', 'warning', 'error'
            message
        };
        setStepLogs(prev => [...prev, logEntry]);
        // Log vào console để debug
        if (type === 'error') {
            console.error(`[${timestamp}] ${message}`);
        } else if (type === 'warning') {
            console.warn(`[${timestamp}] ${message}`);
        } else {
            console.log(`[${timestamp}] ${message}`);
        }
    };
```

### Bước 1: Lấy Danh Sách Nhân Viên U1

```javascript
// Lấy danh sách nhân sự từ danh_sach_van_don
const { data: vanDonList, error: vanDonError } = await supabase
    .from('danh_sach_van_don')
    .select('ho_va_ten, chi_nhanh, trang_thai_chia');

if (vanDonError) throw vanDonError;

// Lọc nhân viên có trạng thái = "U1"
const nhanVienU1 = vanDonList.filter(item => item.trang_thai_chia === 'U1');
```

### Bước 2: Phân Loại Nhân Viên Theo Chi Nhánh

```javascript
const nhanVienHCM = [];
const nhanVienHaNoi = [];

nhanVienU1.forEach(item => {
    const name = item.ho_va_ten;
    const chiNhanhRaw = item.chi_nhanh || '';
    const chiNhanh = chiNhanhRaw.toString().trim();
    const chiNhanhLower = chiNhanh.toLowerCase();
    const chiNhanhClean = chiNhanhLower.replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, '').replace(/\s+/g, ' ').trim();
    
    // Kiểm tra HCM
    const isHCM = chiNhanh === 'HCM' ||
                 chiNhanhLower === 'hcm' ||
                 chiNhanhClean === 'hcm' ||
                 chiNhanhLower === 'hồ chí minh' ||
                 chiNhanhLower === 'ho chi minh' ||
                 chiNhanhClean === 'hochiminh' ||
                 chiNhanhLower.includes('hcm') ||
                 chiNhanhLower.includes('hồ chí minh') ||
                 chiNhanhLower.includes('ho chi minh') ||
                 chiNhanhClean.includes('hcm') ||
                 chiNhanhClean.includes('hochiminh');
    
    // Kiểm tra Hà Nội
    const isHanoi = chiNhanh === 'Hà Nội' ||
                   chiNhanhLower === 'hà nội' ||
                   chiNhanhClean === 'hanoi' ||
                   chiNhanhClean === 'ha noi' ||
                   chiNhanhLower === 'ha noi' ||
                   chiNhanhLower === 'hanoi' ||
                   chiNhanhLower.includes('hà nội') ||
                   chiNhanhLower.includes('hanoi') ||
                   chiNhanhLower.includes('ha noi') ||
                   chiNhanhClean.includes('hanoi');
    
    if (isHCM) {
        nhanVienHCM.push({ name, chi_nhanh: 'HCM' });
    } else if (isHanoi) {
        nhanVienHaNoi.push({ name, chi_nhanh: 'Hà Nội' });
    }
});
```

### Bước 3: Query Đơn Hàng Có delivery_staff Trống

```javascript
// Query đơn có delivery_staff IS NULL
const { data: ordersNull, error: ordersNullError } = await supabase
    .from('orders')
    .select('*')
    .is('delivery_staff', null)
    .limit(100000);

// Query đơn có delivery_staff = ''
const { data: ordersEmpty, error: ordersEmptyError } = await supabase
    .from('orders')
    .select('*')
    .eq('delivery_staff', '')
    .limit(100000);

// Gộp kết quả và lọc thêm các giá trị đặc biệt
const ordersArray = [
    ...(ordersNull || []),
    ...(ordersEmpty || [])
].filter(order => {
    const ds = order.delivery_staff;
    if (ds === null || ds === undefined || ds === '') return true;
    const dsUpper = String(ds).trim().toUpperCase();
    return dsUpper === 'EMPTY' || dsUpper === 'NULL' || dsUpper === 'NONE';
});
```

### Bước 4: Lọc Đơn Theo Điều Kiện

```javascript
// Loại trừ đơn Nhật Bản
const ordersExcluded = ordersArray.filter(order => {
    const country = (order.country || '').toString().toLowerCase();
    return country.includes('nhật bản') || 
           country.includes('nhat ban') || 
           country.includes('japan') || 
           country.includes('jp');
});

const ordersAfterJapanFilter = ordersArray.filter(order => {
    const country = (order.country || '').toString().toLowerCase();
    return !country.includes('nhật bản') && 
           !country.includes('nhat ban') && 
           !country.includes('japan') && 
           !country.includes('jp');
});

// Phân loại đơn theo team
const ordersHCM = [];
const ordersHaNoi = [];
const ordersWithoutTeam = [];

ordersAfterJapanFilter.forEach(order => {
    const team = (order.team || '').toString().trim().toLowerCase();
    const isHCM = team === 'hcm' || 
                  team.includes('hcm') || 
                  team.includes('hồ chí minh') || 
                  team.includes('ho chi minh');
    const isHanoi = team === 'hà nội' || 
                    team === 'ha noi' || 
                    team === 'hanoi' || 
                    team.includes('hà nội') || 
                    team.includes('hanoi') || 
                    team.includes('ha noi');
    
    if (isHCM) {
        ordersHCM.push(order);
    } else if (isHanoi) {
        ordersHaNoi.push(order);
    } else {
        ordersWithoutTeam.push(order);
    }
});
```

---

## 2. Hàm `smartDistribute()` - Chia Đơn Theo 4 Rules

### Cấu Trúc Hàm

```javascript
const smartDistribute = (staffListWithBranch, pendingOrders, allDBOrders, branchName) => {
    // staffListWithBranch: array of {name, chi_nhanh}
    // pendingOrders: đơn cần chia (đã được lọc theo team)
    // allDBOrders: tất cả đơn trong DB (để đếm đơn hiện tại)
    // branchName: tên chi nhánh (HCM hoặc Hà Nội)
    
    if (staffListWithBranch.length === 0) return [];
    if (pendingOrders.length === 0) return [];
    
    const result = [];
    const staffList = staffListWithBranch.map(s => s.name);
```

### Helper: Kiểm Tra Team Khớp Với Chi Nhánh

```javascript
const isTeamBranchMatch = (orderTeamRaw, staffChiNhanhRaw) => {
    const orderTeam = orderTeamRaw?.toString().trim() || '';
    const staffChiNhanh = staffChiNhanhRaw?.toString().trim() || '';
    const orderTeamLower = orderTeam.toLowerCase();
    const staffChiNhanhLower = staffChiNhanh.toLowerCase();
    
    // Loại bỏ các ký tự đặc biệt và khoảng trắng thừa
    const orderTeamClean = orderTeamLower.replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, '').replace(/\s+/g, ' ').trim();
    const staffChiNhanhClean = staffChiNhanhLower.replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, '').replace(/\s+/g, ' ').trim();
    
    // Kiểm tra HCM
    const orderIsHCM = orderTeam === 'HCM' ||
                      orderTeamLower === 'hcm' ||
                      orderTeamClean === 'hcm' ||
                      orderTeamLower === 'hồ chí minh' ||
                      orderTeamLower === 'ho chi minh' ||
                      orderTeamClean === 'hochiminh' ||
                      orderTeamLower.includes('hcm') ||
                      orderTeamLower.includes('hồ chí minh') ||
                      orderTeamLower.includes('ho chi minh') ||
                      orderTeamClean.includes('hcm') ||
                      orderTeamClean.includes('hochiminh');
    
    const staffIsHCM = staffChiNhanh === 'HCM' ||
                       staffChiNhanhLower === 'hcm' ||
                       staffChiNhanhClean === 'hcm' ||
                       staffChiNhanhLower === 'hồ chí minh' ||
                       staffChiNhanhLower === 'ho chi minh' ||
                       staffChiNhanhClean === 'hochiminh' ||
                       staffChiNhanhLower.includes('hcm') ||
                       staffChiNhanhLower.includes('hồ chí minh') ||
                       staffChiNhanhLower.includes('ho chi minh') ||
                       staffChiNhanhClean.includes('hcm') ||
                       staffChiNhanhClean.includes('hochiminh');
    
    const isHCM = orderIsHCM && staffIsHCM;
    
    // Kiểm tra Hà Nội
    const orderIsHanoi = orderTeam === 'Hà Nội' ||
                        orderTeamLower === 'hà nội' ||
                        orderTeamClean === 'hanoi' ||
                        orderTeamClean === 'ha noi' ||
                        orderTeamLower === 'ha noi' ||
                        orderTeamLower === 'hanoi' ||
                        orderTeamLower.includes('hà nội') ||
                        orderTeamLower.includes('hanoi') ||
                        orderTeamLower.includes('ha noi') ||
                        orderTeamClean.includes('hanoi');
    
    const staffIsHanoi = staffChiNhanh === 'Hà Nội' ||
                        staffChiNhanhLower === 'hà nội' ||
                        staffChiNhanhClean === 'hanoi' ||
                        staffChiNhanhClean === 'ha noi' ||
                        staffChiNhanhLower === 'ha noi' ||
                        staffChiNhanhLower === 'hanoi' ||
                        staffChiNhanhLower.includes('hà nội') ||
                        staffChiNhanhLower.includes('hanoi') ||
                        staffChiNhanhLower.includes('ha noi') ||
                        staffChiNhanhClean.includes('hanoi');
    
    const isHanoi = orderIsHanoi && staffIsHanoi;
    
    return isHCM || isHanoi;
};
```

### Rule 1: Xác Định Người Được Chia Cuối Cùng

```javascript
// Tìm đơn gần nhất (theo order_date hoặc id) có delivery_staff thuộc staffList
const staffSet = new Set(staffList);
const assignedOrders = allDBOrders
    .filter(o => o.delivery_staff && staffSet.has(o.delivery_staff.trim()))
    .sort((a, b) => {
        // Ưu tiên sort theo id (auto-increment, lớn hơn = mới hơn)
        if (a.id && b.id) return b.id - a.id;
        // Fallback theo order_date
        const dateA = a.order_date ? new Date(a.order_date) : new Date(0);
        const dateB = b.order_date ? new Date(b.order_date) : new Date(0);
        return dateB - dateA;
    });

const lastAssignedPerson = assignedOrders.length > 0
    ? assignedOrders[0].delivery_staff.trim()
    : null;

const lastAssignedIndex = lastAssignedPerson
    ? staffList.indexOf(lastAssignedPerson)
    : -1;
```

### Rule 2: List Nhân Viên U1

```javascript
// Danh sách nhân viên U1 đã có sẵn = staffList
console.log(`👥 [${branchName}] Rule 2 - Nhân viên U1: [${staffList.join(', ')}]`);
```

### Rule 3: Cân Bằng Số Đơn

```javascript
// Đếm số đơn hiện tại của mỗi nhân viên
const orderCountMap = {};
staffList.forEach(name => { orderCountMap[name] = 0; });

allDBOrders.forEach(order => {
    const ds = order.delivery_staff?.trim();
    if (ds && orderCountMap[ds] !== undefined) {
        orderCountMap[ds]++;
    }
});

// Tìm số đơn lớn nhất để xác định mức cần cân bằng
const orderCounts = Object.values(orderCountMap);
const maxOrders = orderCounts.length > 0 ? Math.max(...orderCounts) : 0;

// Chia ưu tiên: ai có ít đơn hơn maxOrders → chia trước để bù cho cân
let remainingOrders = [...pendingOrders];
const balanceUpdates = [];

// Tính số đơn cần bù cho mỗi người (sắp xếp theo số đơn tăng dần)
const staffSorted = [...staffListWithBranch].sort((a, b) => orderCountMap[a.name] - orderCountMap[b.name]);

// Rule 3: Chia cho người có ít đơn hơn để cân bằng
for (const staff of staffSorted) {
    if (remainingOrders.length === 0) break;
    const deficit = maxOrders - orderCountMap[staff.name];
    if (deficit <= 0) continue; // Người này đã đủ hoặc bằng maxOrders

    // Chỉ lấy đơn có team khớp với chi_nhanh của nhân viên
    const matchingOrders = remainingOrders.filter(order => {
        const orderTeam = order.team?.toString().trim() || '';
        const staffChiNhanh = staff.chi_nhanh?.toString().trim() || '';
        return isTeamBranchMatch(orderTeam, staffChiNhanh);
    });

    const toAssign = Math.min(deficit, matchingOrders.length);
    for (let i = 0; i < toAssign; i++) {
        const order = matchingOrders[i];
        // Xóa đơn khỏi remainingOrders
        const index = remainingOrders.findIndex(o => o.order_code === order.order_code);
        if (index >= 0) {
            remainingOrders.splice(index, 1);
        }
        
        balanceUpdates.push({
            order_code: order.order_code,
            delivery_staff: staff.name
        });
        orderCountMap[staff.name]++; // Cập nhật số đơn sau khi chia
    }
}

result.push(...balanceUpdates);
```

### Rule 4: Round-Robin

```javascript
// Round-robin phần còn lại từ người tiếp theo sau người cuối cùng
if (remainingOrders.length > 0) {
    // Bắt đầu từ người SAU người được chia cuối cùng (Rule 1)
    let startIndex = lastAssignedIndex >= 0
        ? (lastAssignedIndex + 1) % staffListWithBranch.length
        : 0;

    let nextIndex = startIndex;

    remainingOrders.forEach((order, i) => {
        let assigned = false;

        for (let attempt = 0; attempt < staffListWithBranch.length; attempt++) {
            const idx = (nextIndex + attempt) % staffListWithBranch.length;
            const staff = staffListWithBranch[idx];
            const orderTeam = order.team?.toString().trim() || '';
            const staffChiNhanh = staff.chi_nhanh?.toString().trim() || '';
            const isMatch = isTeamBranchMatch(orderTeam, staffChiNhanh);

            if (!isMatch) {
                continue;
            }

            result.push({
                order_code: order.order_code,
                delivery_staff: staff.name
            });

            // Tiếp tục vòng tròn sau người vừa nhận đơn để giữ round-robin công bằng
            nextIndex = (idx + 1) % staffListWithBranch.length;
            assigned = true;
            break;
        }

        if (!assigned) {
            console.warn(`⚠️ [${branchName}] Rule 4 - Bỏ qua đơn ${order.order_code}: không tìm thấy nhân viên nào có chi_nhanh khớp với team="${orderTeam}"`);
        }
    });
}

return result;
```

---

## 3. Thực Hiện Chia Đơn và Cập Nhật Database

### Gọi Hàm Chia Đơn

```javascript
// Chia đơn HCM
if (nhanVienHCM.length > 0 && ordersHCM.length > 0) {
    const hcmUpdates = smartDistribute(nhanVienHCM, ordersHCM, allDBOrdersHCM, 'HCM');
    updates.push(...hcmUpdates);
}

// Chia đơn Hà Nội
if (nhanVienHaNoi.length > 0 && ordersHaNoi.length > 0) {
    const hanoiUpdates = smartDistribute(nhanVienHaNoi, ordersHaNoi, allDBOrdersHaNoi, 'Hà Nội');
    updates.push(...hanoiUpdates);
}
```

### Cập Nhật Database

```javascript
if (updates.length > 0) {
    const CHUNK_SIZE = 50;
    successCount = 0;
    errorCount = 0;
    errors.length = 0;

    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
        const totalChunks = Math.ceil(updates.length / CHUNK_SIZE);

        const updatePromises = chunk.map(async (update) => {
            try {
                const { data, error } = await supabase
                    .from('orders')
                    .update({ delivery_staff: update.delivery_staff })
                    .eq('order_code', update.order_code)
                    .select();

                if (error) {
                    errors.push({ order_code: update.order_code, error: error.message });
                    errorCount++;
                    return { success: false, error };
                }

                if (data && data.length > 0) {
                    const updatedOrder = data[0];
                    if (updatedOrder.delivery_staff === update.delivery_staff) {
                        successCount++;
                        return { success: true, data };
                    }
                }
            } catch (err) {
                errors.push({ order_code: update.order_code, error: err.message });
                errorCount++;
                return { success: false, error: err };
            }
        });

        await Promise.all(updatePromises);
    }
}
```

---

## Tóm Tắt Logic Chia Đơn

1. **Lấy nhân viên U1** từ bảng `danh_sach_van_don`
2. **Phân loại nhân viên** theo chi nhánh (HCM/Hà Nội)
3. **Query đơn hàng** có `delivery_staff` trống/null/empty
4. **Lọc đơn** theo điều kiện (loại trừ Nhật Bản, phân loại theo team)
5. **Chia đơn theo 4 Rules**:
   - Rule 1: Xác định người được chia cuối cùng
   - Rule 2: List nhân viên U1
   - Rule 3: Cân bằng số đơn (ưu tiên người có ít đơn hơn)
   - Rule 4: Round-robin phần còn lại
6. **Cập nhật database** với chunk size = 50 đơn/chunk

---

## Lưu Ý Quan Trọng

- Đơn chỉ được chia cho nhân viên có `chi_nhanh` khớp với `team` của đơn
- Đơn Nhật Bản sẽ bị loại trừ
- Đơn không có team hoặc team khác HCM/Hà Nội sẽ không được chia
- Hệ thống tự động điền `team` dựa trên `sale_staff` → `branch` từ bảng `users` nếu đơn chưa có team
