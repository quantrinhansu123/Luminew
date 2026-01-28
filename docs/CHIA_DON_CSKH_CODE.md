# Code Chia Đơn CSKH

## Mô tả
Code này được sử dụng để tự động phân bổ đơn hàng cho nhân viên CSKH theo nguyên tắc:
- Đơn hàng có Sale là CSKH → tự chăm sóc
- Các đơn còn lại được chia đều theo tháng
- Chỉ chia các đơn có `accountant_confirm = 'Đã thu tiền'`
- Chỉ chia các đơn có CSKH trống

## Vị trí code
File: `src/pages/AdminTools.jsx`
Hàm: `handlePhanBoDonHang()`

## Code đầy đủ

```javascript
// --- AUTO ASSIGN FUNCTIONS ---
const loadCSKHStaff = async () => {
    try {
        // Lấy danh sách nhân sự CSKH từ bảng users
        // Filter theo department = 'CSKH'
        const { data, error } = await supabase
            .from('users')
            .select('name, email, department, position')
            .eq('department', 'CSKH')
            .order('name', { ascending: true });

        if (error) throw error;
        
        const staffNames = data?.map(u => u.name).filter(Boolean) || [];
        setCskhStaff(staffNames);
        return staffNames;
    } catch (error) {
        console.error('Error loading CSKH staff:', error);
        toast.error('Lỗi khi tải danh sách nhân sự CSKH');
        return [];
    }
};

const handlePhanBoDonHang = async () => {
    setAutoAssignLoading(true);
    setAutoAssignResult(null);
    
    try {
        const staffList = await loadCSKHStaff();
        if (staffList.length === 0) {
            throw new Error('Không tìm thấy nhân sự CSKH');
        }

        // Parse selectedMonth để filter đơn hàng
        const [year, month] = selectedMonth.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        // Lấy tất cả đơn hàng thỏa điều kiện (filter theo tháng được chọn)
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .eq('team', selectedTeam)
            .eq('accountant_confirm', 'Đã thu tiền')
            .gte('order_date', startDate.toISOString().split('T')[0])
            .lte('order_date', endDate.toISOString().split('T')[0]);

        if (ordersError) throw ordersError;

        // Filter: Chỉ chia các đơn có cột CSKH trống
        const eligibleOrders = orders?.filter(order => {
            const hasCSKH = order.cskh && order.cskh.toString().trim() !== '';
            return !hasCSKH; // Chỉ kiểm tra CSKH trống, không quan tâm cutoff
        }) || [];

        // Helper function: Lấy tháng từ order_date (format: YYYY-MM)
        const getMonthKey = (orderDate) => {
            if (!orderDate) return null;
            const date = new Date(orderDate);
            if (isNaN(date.getTime())) return null;
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            return `${year}-${month}`;
        };

        // Đếm số đơn hiện tại của mỗi nhân viên THEO TỪNG THÁNG
        // counter[staffName][monthKey] = số đơn
        const counter = {};
        staffList.forEach(name => {
            counter[name] = {};
        });

        // Đếm đơn đã có CSKH (không phải Sale tự chăm) - theo tháng
        orders?.forEach(order => {
            const cskh = order.cskh?.toString().trim();
            const sale = order.sale_staff?.toString().trim();
            const monthKey = getMonthKey(order.order_date);
            
            if (cskh && staffList.includes(cskh) && cskh !== sale && monthKey) {
                counter[cskh][monthKey] = (counter[cskh][monthKey] || 0) + 1;
            }
        });

        // Xử lý đơn Sale tự chăm
        const waitingRows = [];
        const updates = [];

        eligibleOrders.forEach(order => {
            const sale = order.sale_staff?.toString().trim();
            
            // Nếu Sale là CSKH -> tự chăm
            if (sale && staffList.includes(sale)) {
                updates.push({
                    order_code: order.order_code,
                    cskh: sale
                });
            } else {
                waitingRows.push(order);
            }
        });

        // Chia đều các đơn còn lại - THEO THÁNG của Ngày lên đơn
        waitingRows.forEach(order => {
            const monthKey = getMonthKey(order.order_date);
            if (!monthKey) {
                console.warn(`Đơn ${order.order_code} không có order_date hợp lệ`);
                return;
            }

            let selectedName = null;
            let minVal = Infinity;

            staffList.forEach(name => {
                // Đếm số đơn của nhân viên này trong tháng này
                const val = counter[name][monthKey] || 0;
                if (val < minVal) {
                    minVal = val;
                    selectedName = name;
                }
            });

            if (selectedName) {
                updates.push({
                    order_code: order.order_code,
                    cskh: selectedName
                });
                // Tăng counter cho tháng này
                counter[selectedName][monthKey] = (counter[selectedName][monthKey] || 0) + 1;
            }
        });

        // Cập nhật database
        if (updates.length > 0) {
            const CHUNK_SIZE = 50;
            for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                const chunk = updates.slice(i, i + CHUNK_SIZE);
                const updatePromises = chunk.map(update => 
                    supabase
                        .from('orders')
                        .update({ cskh: update.cskh })
                        .eq('order_code', update.order_code)
                );
                await Promise.all(updatePromises);
            }
        }

        const message = `✅ Phân bổ đơn hàng thành công!\n\n` +
            `- Tổng đơn đã xử lý: ${updates.length}\n` +
            `- Đơn Sale tự chăm: ${updates.filter(u => orders?.find(o => o.order_code === u.order_code)?.sale_staff === u.cskh).length}\n` +
            `- Đơn được chia mới: ${updates.length - updates.filter(u => orders?.find(o => o.order_code === u.order_code)?.sale_staff === u.cskh).length}\n` +
            `- Nhân sự CSKH: ${staffList.length} người`;

        setAutoAssignResult({ success: true, message });
        toast.success(`Đã phân bổ ${updates.length} đơn hàng!`);
    } catch (error) {
        console.error('Error in handlePhanBoDonHang:', error);
        setAutoAssignResult({ success: false, message: `Lỗi: ${error.message}` });
        toast.error('Lỗi phân bổ đơn hàng: ' + error.message);
    } finally {
        setAutoAssignLoading(false);
    }
};
```

## Logic chia đơn

### 1. Điều kiện đơn hàng được chia:
- `team` = team được chọn
- `accountant_confirm` = 'Đã thu tiền'
- `order_date` trong tháng được chọn
- `cskh` trống (chưa được phân bổ)

### 2. Quy tắc phân bổ:
1. **Sale tự chăm**: Nếu `sale_staff` là CSKH → tự động gán `cskh = sale_staff`
2. **Chia đều theo tháng**: 
   - Đếm số đơn của mỗi CSKH theo từng tháng
   - Chọn CSKH có ít đơn nhất trong tháng đó
   - Cập nhật counter sau mỗi lần chia

### 3. Cập nhật database:
- Chia nhỏ thành batch 50 đơn/lần để tránh timeout
- Sử dụng `Promise.all()` để cập nhật song song

## Sử dụng

```javascript
// Trong component AdminTools
<button onClick={handlePhanBoDonHang}>
    Phân bổ đơn hàng
</button>
```

## Dependencies
- `supabase`: Client Supabase để truy vấn database
- `toast`: Thư viện thông báo (react-toastify)
- State: `selectedMonth`, `selectedTeam`, `setAutoAssignLoading`, `setAutoAssignResult`
