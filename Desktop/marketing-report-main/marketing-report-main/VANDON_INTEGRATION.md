# Tích hợp Trang Vận Đơn từ WebLumi

## 📋 Tổng quan
Đã tích hợp thành công chức năng quản lý vận đơn từ WebLumi vào component `VanDon.jsx` trong ứng dụng marketing report.

## ✅ Các tính năng đã tích hợp

### 1. **Kết nối Firebase Order Database**
- Database: `order-dc7b9-default-rtdb.asia-southeast1.firebasedatabase.app`
- Sử dụng Firebase App riêng biệt (named instance `orderApp`) để tránh conflict với database chính
- Tự động load dữ liệu vận đơn real-time

### 2. **Phân quyền người dùng**
- **Leader**: Xem tất cả đơn hàng
- **Nhân viên thường**: Chỉ xem đơn hàng của mình (theo field `Nhân viên Sale`)
- Hiển thị badge 👑 Leader khi user là leader
- Hiển thị tên người dùng trên header

### 3. **Bảng dữ liệu thông minh**
- **Group theo thị trường (Region)**: 
  - VN, US, EU, Nhật Bản, Hàn Quốc, Trung Quốc, TH, Canada, Úc
  - Mỗi region có màu riêng để dễ phân biệt
  
- **Group theo sản phẩm (Item)**
  - Hiển thị tất cả sản phẩm trong từng thị trường
  
- **Hiển thị theo ngày**
  - Header: ngày tháng năm (DD/MM/YYYY)
  - Cell: số lượng đơn hàng trong ngày
  - Tính toán tự động tổng FFM thanh toán cho mỗi sản phẩm
  
- **Dòng tổng (Total row)**
  - Background màu xanh lá
  - Tổng số đơn của tất cả sản phẩm theo từng ngày
  - Grand total tổng cộng

### 4. **Bộ lọc ngày**
- **Từ ngày** (Start Date): Lọc đơn hàng từ ngày được chọn
- **Đến ngày** (End Date): Lọc đơn hàng đến ngày được chọn
- Bao gồm cả ngày bắt đầu và ngày kết thúc trong khoảng lọc
- Nút **Xóa bộ lọc**: Reset về hiển thị tất cả dữ liệu
- Nút **Tải lại**: Refresh dữ liệu từ Firebase

### 5. **UI/UX**
- **Responsive design**: Tương thích với các kích thước màn hình
- **Loading state**: Hiển thị spinner khi đang tải dữ liệu
- **Empty state**: Thông báo khi không có dữ liệu
- **Hover effects**: Highlight row khi hover chuột
- **Sticky header**: Header bảng cố định khi scroll
- **Màu sắc theo region**: Mỗi thị trường có màu nền riêng
- **Toast notifications**: Thông báo lỗi/thành công
- **Counter**: Hiển thị tổng số đơn đang xem

## 🔧 Cấu trúc dữ liệu

### Input (từ Firebase order database)
```javascript
{
  "order_id_1": {
    "Date": "31/12/2024",
    "Region": "US",
    "Item": "Sản phẩm A",
    "Nhân viên Sale": "Nguyễn Văn A",
    "Đơn vị vận chuyển": "FFM"
  },
  // ... more orders
}
```

### Output (Table structure)
```
| Thị trường | Sản phẩm    | FFM thanh toán | 31/12/2024 | 01/01/2025 | ... |
|------------|-------------|----------------|------------|------------|-----|
| US         | Sản phẩm A  | 25             | 10         | 15         | ... |
| US         | Sản phẩm B  | 30             | 20         | 10         | ... |
| VN         | Sản phẩm C  | 15             | 5          | 10         | ... |
| Tổng:                    | 70             | 35         | 35         | ... |
```

## 🎨 Màu sắc theo region

| Region      | Màu nền   | Hex Code  |
|-------------|-----------|-----------|
| VN          | Vàng nhạt | #fff9c4   |
| US          | Tím nhạt  | #DAD2EA   |
| EU          | Tím pastel| #ede7f6   |
| Nhật Bản    | Vàng nhạt | #fff9c4   |
| Hàn Quốc    | Hồng nhạt | #f3e5f5   |
| Trung Quốc  | Xanh lá   | #e8f5e9   |
| TH          | Cam nhạt  | #fff3e0   |
| Canada      | Cam kem   | #FEE6CE   |
| Úc          | Hồng      | #F5CBCD   |
| Không xác định | Xám    | #f0f0f0   |

## 🔐 Authentication & Permission

### Load user info
```javascript
// Lấy userId từ localStorage (cùng hệ thống authentication hiện tại)
const userId = localStorage.getItem('appUserId');

// Fetch từ Employee database
const response = await fetch('https://oauth-954b4-default-rtdb.asia-southeast1.firebasedatabase.app/Employee.json');

// Check role
const isLeader = user.vi_tri?.toLowerCase() === 'leader';
```

### Filter data by permission
```javascript
// Leader sees all
if (isLeader) return true;

// Regular user sees only their orders
const userName = currentUser.ho_va_ten.toLowerCase();
const nhanVienSale = order['Nhân viên Sale'].toLowerCase();
return nhanVienSale === userName;
```

## 📊 Tính toán logic

### 1. Group by Region
```javascript
const grouped = {};
orders.forEach(order => {
  const region = normalizeRegion(order["Region"]);
  if (!grouped[region]) grouped[region] = [];
  grouped[region].push(order);
});
```

### 2. Group by Item & Date
```javascript
const itemMap = {};
orders.forEach(order => {
  const item = order["Item"];
  const date = order["Date"];
  const qty = order["Đơn vị vận chuyển"];
  const incri = (qty === null || qty === undefined) ? 0 : 1;

  if (!itemMap[item]) itemMap[item] = {};
  itemMap[item][date] = (itemMap[item][date] || 0) + incri;
});
```

### 3. Calculate totals
```javascript
// FFM thanh toán (total for each item)
let totalFFM = 0;
sortedDates.forEach(date => {
  totalFFM += itemMap[item][date] || 0;
});

// Daily totals
sortedDates.forEach(date => {
  totalByDate[date] = orders
    .filter(o => o.Date === date)
    .reduce((sum, o) => sum + (o["Đơn vị vận chuyển"] ? 1 : 0), 0);
});

// Grand total
const grandTotal = Object.values(totalByDate).reduce((a, b) => a + b, 0);
```

## 🚀 Cách sử dụng

### 1. Truy cập trang
Trong `ReportDashboard.jsx`, tab "Vận đơn" sẽ hiển thị component này.

### 2. Xem dữ liệu
- **Leader**: Thấy tất cả đơn hàng của tất cả nhân viên
- **Nhân viên**: Chỉ thấy đơn hàng của mình

### 3. Lọc theo ngày
- Chọn "Từ ngày" để lọc từ một ngày cụ thể
- Chọn "Đến ngày" để lọc đến một ngày cụ thể
- Có thể chọn cả hai để lọc theo khoảng thời gian
- Click "Xóa bộ lọc" để reset

### 4. Refresh dữ liệu
Click nút "🔄 Tải lại" để refresh dữ liệu từ Firebase

## 🛠️ Các file đã thay đổi

### 1. `src/components/VanDon.jsx`
- **Trước**: Component placeholder đơn giản
- **Sau**: Component đầy đủ tính năng với:
  - Firebase integration
  - User authentication
  - Data filtering
  - Table rendering
  - Date filtering
  - Permission management

## 🔗 Dependencies

### Packages đã có sẵn
```json
{
  "react": "^18.x",
  "firebase": "^10.x",
  "react-hot-toast": "^2.x"
}
```

### Firebase Databases
1. **Employee Database** (existing):
   - URL: `oauth-954b4-default-rtdb.asia-southeast1.firebasedatabase.app`
   - Purpose: User authentication & info

2. **Order Database** (new):
   - URL: `order-dc7b9-default-rtdb.asia-southeast1.firebasedatabase.app`
   - Purpose: Order tracking data

## ⚠️ Lưu ý quan trọng

### 1. Firebase Instance
Component sử dụng **named Firebase instance** (`orderApp`) để tránh conflict với Firebase instance chính của app. Đừng lo lắng về việc khởi tạo nhiều Firebase apps.

### 2. Data Structure
Dữ liệu trong order database phải có các field sau:
- `Date`: Ngày đơn hàng (format: "DD/MM/YYYY")
- `Region`: Thị trường (VN, US, EU, v.v.)
- `Item`: Tên sản phẩm
- `Nhân viên Sale`: Tên nhân viên (phải match với `ho_va_ten` trong Employee table)
- `Đơn vị vận chuyển`: Đơn vị vận chuyển (optional)

### 3. Permission Logic
- User permission dựa trên field `vi_tri` trong Employee table
- Value "leader" (case-insensitive) = Leader
- Các value khác = Nhân viên thường

### 4. Date Format
- Input: "DD/MM/YYYY" (31/12/2024)
- Display: "MM/DD/YYYY" (12/31/2024)
- Filter: YYYY-MM-DD (HTML5 date input)

## 🐛 Troubleshooting

### Lỗi: "Cannot read property 'database' of undefined"
**Nguyên nhân**: Firebase chưa được khởi tạo đúng cách
**Giải pháp**: Check Firebase config và đảm bảo `orderDatabase` đã được export

### Lỗi: "Không có dữ liệu vận đơn"
**Nguyên nhân**: 
1. User chưa có đơn hàng nào
2. Field `Nhân viên Sale` không match với `ho_va_ten`
3. Database rỗng

**Giải pháp**: 
- Check data trong Firebase console
- Verify field names match exactly
- Check user permissions

### Lỗi: "Vui lòng đăng nhập để tiếp tục"
**Nguyên nhân**: `appUserId` không có trong localStorage
**Giải pháp**: Đăng nhập lại vào hệ thống

## 📈 Performance

### Optimization đã áp dụng
1. **useMemo**: Cache computed values (groupedData, sortedDates, totals)
2. **Lazy loading**: Chỉ load data khi user đã authenticated
3. **Efficient filtering**: Filter tại client-side sau khi load
4. **Minimal re-renders**: Only re-render when data/filters change

### Estimated performance
- **Initial load**: ~1-2 seconds (depending on data size)
- **Filter change**: <100ms (instant UI update)
- **Date change**: <100ms (instant UI update)

## 🎯 Future Enhancements (Optional)

### Có thể thêm sau
1. **Export to Excel**: Download bảng dữ liệu dạng Excel
2. **Print view**: Giao diện in ấn
3. **Advanced filters**: Lọc theo region, sản phẩm, nhân viên
4. **Charts**: Biểu đồ thống kê theo region/sản phẩm
5. **Pagination**: Phân trang nếu dữ liệu quá nhiều
6. **Search**: Tìm kiếm sản phẩm, region
7. **Sort**: Sắp xếp theo cột
8. **Real-time updates**: Auto refresh khi có data mới

## ✅ Testing Checklist

- [x] Load dữ liệu từ Firebase
- [x] Filter theo user permission (Leader/User)
- [x] Filter theo ngày (start/end date)
- [x] Hiển thị tổng số đơn
- [x] Group theo region và item
- [x] Tính tổng FFM thanh toán
- [x] Tính tổng theo ngày
- [x] Grand total
- [x] Loading state
- [x] Empty state
- [x] Error handling
- [x] Toast notifications
- [x] Responsive design
- [x] Sticky header
- [x] Hover effects
- [x] Color coding by region

## 📞 Support

Nếu gặp vấn đề, check:
1. Browser console cho error messages
2. Firebase console cho dữ liệu
3. Network tab cho API calls
4. localStorage cho `appUserId`

---

**Tóm tắt**: Đã tích hợp thành công trang quản lý vận đơn từ WebLumi vào app marketing report. Component hoàn chỉnh với đầy đủ tính năng: authentication, permission, filtering, grouping, totals calculation, và UI/UX tốt.
