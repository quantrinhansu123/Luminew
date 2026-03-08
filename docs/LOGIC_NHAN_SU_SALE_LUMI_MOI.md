# Logic Tính Toán - nhanSuSaleLumiMoi.html

## Tổng quan

File `nhanSuSaleLumiMoi.html` là một báo cáo tổng hợp chi tiết cho nhân sự Sale, sử dụng logic **fetch một lần, filter client-side** để tối ưu hiệu suất.

## Nguồn dữ liệu

### API Endpoint
```
GET https://n-api-gamma.vercel.app/report/generate?tableName=Báo cáo sale
```

**Response structure:**
```javascript
{
    data: [
        {
            'Tên': 'Nguyễn Văn A',
            'Email': 'a@example.com',
            'Team': 'Team A',
            'Chi nhánh': 'Hà Nội',
            'Ngày': '2026-01-15',
            'Ca': 'Sáng',
            'Sản phẩm': 'SP1',
            'Thị trường': 'VN',
            'Số Mess': 50,
            'Đơn Mess': 10,
            'Doanh số Mess': 15000000,
            'Phản hồi': 40,
            'Số đơn thực tế': 10,
            'Doanh thu chốt thực tế': 15000000,
            'Số đơn hoàn hủy thực tế': 2,
            'Doanh số hoàn hủy thực tế': 3000000,
            // ... các trường khác
        }
    ],
    employeeData: [
        {
            'id': 'user-id',
            'Họ Và Tên': 'Nguyễn Văn A',
            'Email': 'a@example.com',
            'Chức vụ': 'Sale Leader',
            'Team': 'Team A',
            'Chi nhánh': 'Hà Nội'
        }
    ]
}
```

## Quy trình xử lý

### Bước 1: Fetch Data (Một lần duy nhất)

```javascript
fetch(`${hostUse}/report/generate?tableName=Báo cáo sale`)
    .then(res => res.json())
    .then(result => {
        const apiData = result.data;
        // Xử lý data...
    });
```

**Đặc điểm:**
- ✅ Fetch **một lần duy nhất** khi load trang
- ✅ Không có pagination
- ✅ Không fetch lại khi filter thay đổi
- ✅ Tất cả data được lưu vào `rawData` để filter client-side

### Bước 2: Xử lý Permissions (Role-Based Access Control)

Dựa trên `id` từ URL parameter và `employeeData`:

#### **Sale Leader:**
- Xem toàn bộ **chi nhánh** của mình
- `allowedBranch = userBranch`
- `allowedTeam = null`
- `allowedNames = []`

#### **Leader:**
- Xem toàn bộ **team** của mình
- `allowedTeam = userTeam`
- `allowedBranch = null`
- `allowedNames = []`

#### **NV (Nhân viên):**
- Chỉ xem **dữ liệu cá nhân**
- `allowedNames = [cleanName]`
- `allowedTeam = null`
- `allowedBranch = null`

#### **Admin (không có id trong URL):**
- Xem **toàn bộ dữ liệu**
- `isRestrictedView = false`

### Bước 3: Transform Data

```javascript
rawData = apiData
    .filter(r => r['Tên'] && r['Team']) // Lọc bỏ records không có Tên hoặc Team
    .map(r => ({
        chucVu: r['Chức vụ'],
        ten: r['Tên'],
        email: r['Email'],
        team: r['Team'],
        chiNhanh: r['Chi nhánh'],
        ngay: r['Ngày'],
        ca: r['Ca'],
        sanPham: r['Sản phẩm'],
        thiTruong: r['Thị trường'],
        soMessCmt: Number(r['Số Mess']) || 0,
        soDon: Number(r['Đơn Mess']) || 0,
        dsChot: Number(r['Doanh số Mess']) || 0,
        phanHoi: Number(r['Phản hồi']) || 0,
        soDonThucTe: Number(r['Số đơn thực tế']) || 0,
        doanhThuChotThucTe: Number(r['Doanh thu chốt thực tế']) || 0,
        soDonHoanHuyThucTe: Number(r['Số đơn hoàn hủy thực tế']) || 0,
        doanhSoHoanHuyThucTe: Number(r['Doanh số hoàn hủy thực tế']) || 0,
        // ... các trường khác
    }));
```

### Bước 4: Filter Client-Side

Khi user thay đổi filter (date, product, market, shift, team), **không fetch lại từ API**, mà filter từ `rawData`:

```javascript
function applyFilters() {
    const filtered = rawData.filter(r => {
        // 1. Filter theo permissions (nếu có)
        if (isRestrictedView) {
            if (allowedBranch && r.chiNhanh !== allowedBranch) return false;
            if (allowedTeam && r.team !== allowedTeam) return false;
            if (allowedNames.length > 0 && !allowedNames.includes(r.ten)) return false;
        }
        
        // 2. Filter theo date
        const recordDate = new Date(r.ngay);
        const isDateOk = (!startDate || recordDate >= startDate) && 
                         (!endDate || recordDate <= endDate);
        
        // 3. Filter theo product, market, shift, team
        const isProductOk = !selectedProducts || selectedProducts.includes(r.sanPham);
        const isMarketOk = !selectedMarkets || selectedMarkets.includes(r.thiTruong);
        const isShiftOk = !selectedShifts || selectedShifts.includes(String(r.ca));
        const isTeamOk = !selectedTeams || selectedTeams.includes(String(r.team));
        
        return isDateOk && isProductOk && isMarketOk && isShiftOk && isTeamOk;
    });
    
    renderSummary(filtered);
    renderDailyBreakdown(filtered);
}
```

## Logic Tính Toán

### Hàm `summarizeAndSortSalesData(data)`

**Mục đích:** Tổng hợp dữ liệu theo từng nhân viên (group by tên)

```javascript
function summarizeAndSortSalesData(data) {
    const summaryData = {};
    const initialSummary = {
        mess: 0,
        don: 0,
        chot: 0,
        phanHoi: 0,
        soDonThucTe: 0,
        doanhThuChotThucTe: 0,
        soDonHoanHuyThucTe: 0,
        doanhSoHoanHuyThucTe: 0,
        // ... các trường khác
    };

    // Group by tên nhân viên
    data.forEach(r => {
        const name = r.ten;
        if (!summaryData[name]) {
            summaryData[name] = {
                chiNhanh: r.chiNhanh,
                team: r.team,
                ...JSON.parse(JSON.stringify(initialSummary))
            };
        }
        
        // Cộng dồn tất cả các giá trị
        summaryData[name].mess += r.soMessCmt;
        summaryData[name].don += r.soDon;
        summaryData[name].chot += r.dsChot;
        summaryData[name].phanHoi += r.phanHoi;
        summaryData[name].soDonThucTe += r.soDonThucTe;
        summaryData[name].doanhThuChotThucTe += r.doanhThuChotThucTe;
        summaryData[name].soDonHoanHuyThucTe += r.soDonHoanHuyThucTe;
        summaryData[name].doanhSoHoanHuyThucTe += r.doanhSoHoanHuyThucTe;
        // ... các trường khác
    });

    // Chuyển thành array và sort
    const flatList = Object.keys(summaryData)
        .map(name => ({ name, ...summaryData[name] }))
        .sort((a, b) => 
            a.team.localeCompare(b.team) || 
            b.chot - a.chot || 
            a.name.localeCompare(b.name)
        );

    // Tính tổng
    const total = flatList.reduce((acc, item) => {
        Object.keys(initialSummary).forEach(key => {
            acc[key] += item[key];
        });
        return acc;
    }, JSON.parse(JSON.stringify(initialSummary)));

    return { flatList, total };
}
```

## Công thức tính toán các cột

### Tab 1: "Sale đã trừ hủy"

#### **Cột "Số đơn hủy":**
```javascript
soDonHuy = soDonTT - soDonSauHuy
         = item.soDonThucTe - (item.soDonThucTe - item.soDonHoanHuyThucTe)
         = item.soDonHoanHuyThucTe
```

**Công thức:** `Số đơn hủy = Số đơn TT - Số đơn sau hủy`

#### **Cột "Số đơn TT":**
```javascript
soDonTT = item.soDonThucTe
```

**Lấy trực tiếp từ:** `r['Số đơn thực tế']` trong API response

#### **Cột "Số đơn sau hủy":**
```javascript
soDonSauHuy = item.soDonThucTe - item.soDonHoanHuyThucTe
```

**Công thức:** `Số đơn sau hủy = Số đơn TT - Số đơn hoàn hủy thực tế`

#### **Cột "DS Sau Hủy TT":**
```javascript
dsSauHuyTT = item.doanhThuChotThucTe - item.doanhSoHoanHuyThucTe
```

**Công thức:** `DS Sau Hủy TT = Doanh thu chốt thực tế - Doanh số hoàn hủy thực tế`

#### **Cột "Tỉ lệ chốt":**
```javascript
rate = item.mess ? soDonSauHuy / item.mess : 0
```

**Công thức:** `Tỉ lệ chốt = Số đơn sau hủy / Số Mess`

**Điều kiện màu:**
- `rate >= 0.1` (10%) → `bg-green` (xanh lá)
- `rate > 0.05` (5%) → `bg-yellow` (vàng)
- `rate <= 0.05` → không có màu

#### **Cột "Tỉ lệ hủy":**
```javascript
tiLeHuy = soDonTT > 0 ? (soDonHuy / soDonTT) : 0
```

**Công thức:** `Tỉ lệ hủy = Số đơn hủy / Số đơn TT`

### Tab 2: "Dữ liệu báo cáo tay"

#### **Cột "Số Đơn TT":**
```javascript
soDonTT = item.soDonThucTe
```

**Lấy trực tiếp từ:** `r['Số đơn thực tế']` trong API response

#### **Cột "DS Chốt TT":**
```javascript
dsChotTT = item.doanhThuChotThucTe
```

**Lấy trực tiếp từ:** `r['Doanh thu chốt thực tế']` trong API response

#### **Cột "Tỉ lệ chốt":**
```javascript
rate = item.mess ? item.soDonThucTe / item.mess : 0
```

**Công thức:** `Tỉ lệ chốt = Số đơn TT / Số Mess`

**Điều kiện màu:** Giống Tab 1

## Ví dụ cụ thể

### Ví dụ 1: Tính toán cho một nhân viên

**Input data (từ API):**
```javascript
{
    'Tên': 'Nguyễn Văn A',
    'Số Mess': 50,
    'Đơn Mess': 10,
    'Doanh số Mess': 15000000,
    'Số đơn thực tế': 10,
    'Doanh thu chốt thực tế': 15000000,
    'Số đơn hoàn hủy thực tế': 2,
    'Doanh số hoàn hủy thực tế': 3000000
}
```

**Kết quả tính toán:**

**Tab 1: Sale đã trừ hủy**
- Số đơn TT = 10
- Số đơn hủy = 10 - (10 - 2) = 2
- Số đơn sau hủy = 10 - 2 = 8
- DS Sau Hủy TT = 15000000 - 3000000 = 12000000
- Tỉ lệ chốt = 8 / 50 = 0.16 (16%) → `bg-green`
- Tỉ lệ hủy = 2 / 10 = 0.2 (20%)

**Tab 2: Dữ liệu báo cáo tay**
- Số Đơn TT = 10
- DS Chốt TT = 15000000
- Tỉ lệ chốt = 10 / 50 = 0.2 (20%) → `bg-green`

## Điểm khác biệt so với BaoCaoSale.jsx

### 1. **Fetch Strategy:**
- **nhanSuSaleLumiMoi.html:** Fetch một lần, filter client-side
- **BaoCaoSale.jsx:** Fetch nhiều lần với pagination, enrich từ nhiều nguồn

### 2. **Nguồn dữ liệu:**
- **nhanSuSaleLumiMoi.html:** Chỉ dùng data từ `/report/generate` (đã có sẵn `Số đơn thực tế`)
- **BaoCaoSale.jsx:** Fetch từ `sales_reports` + enrich từ `/orders` API để tính `Số đơn TT`

### 3. **Tính toán:**
- **nhanSuSaleLumiMoi.html:** Đơn giản, chỉ cộng dồn và tính tỉ lệ
- **BaoCaoSale.jsx:** Phức tạp hơn, có matching logic giữa `sales_reports` và `orders`

### 4. **Performance:**
- **nhanSuSaleLumiMoi.html:** Nhanh hơn vì chỉ fetch một lần
- **BaoCaoSale.jsx:** Chậm hơn vì phải fetch và match nhiều nguồn dữ liệu

## Lưu ý quan trọng

1. **"Số đơn TT" trong file HTML:**
   - Lấy trực tiếp từ `r['Số đơn thực tế']` trong API response
   - **KHÔNG** fetch từ `/orders` API
   - API `/report/generate` đã tính sẵn giá trị này

2. **Filter client-side:**
   - Tất cả filters (date, product, market, shift, team) đều filter từ `rawData`
   - Không fetch lại từ API khi filter thay đổi
   - Rất nhanh vì chỉ xử lý trong memory

3. **Group by tên:**
   - Dữ liệu được group theo `tên` nhân viên
   - Tất cả các records của cùng một nhân viên được cộng dồn lại
   - Sort theo: Team → Doanh số chốt (giảm dần) → Tên

4. **Daily Breakdown:**
   - Dữ liệu được group theo ngày
   - Mỗi ngày có một bảng riêng
   - Logic tính toán giống như summary, nhưng chỉ cho một ngày

## Kết luận

Logic của `nhanSuSaleLumiMoi.html` rất đơn giản và hiệu quả:
- ✅ Fetch một lần duy nhất
- ✅ Filter client-side (nhanh)
- ✅ Tính toán đơn giản (chỉ cộng dồn và tính tỉ lệ)
- ✅ Không cần enrich từ nhiều nguồn
- ✅ Performance tốt

**Điểm mấu chốt:** API `/report/generate` đã tính sẵn `Số đơn thực tế` và `Doanh thu chốt thực tế`, nên không cần fetch thêm từ `/orders` API.
