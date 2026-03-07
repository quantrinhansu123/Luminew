# Cơ chế lọc (Filter Mechanism) - Test Báo Cáo Orders

## Tổng quan

View Test Báo Cáo Orders sử dụng cơ chế lọc **server-side filtering** - tất cả các filter được gửi lên API và xử lý ở phía server.

## Luồng hoạt động

```
User Input → Frontend State → API Request → Backend Filter → Response → Display
```

## 1. Frontend - State Management

### 1.1. Filter State
```javascript
const [filters, setFilters] = useState({
    from_date: '',      // Từ ngày (YYYY-MM-DD)
    to_date: '',        // Đến ngày (YYYY-MM-DD)
    team: '',           // Team (Hà Nội, HCM, ...)
    ca: '',             // Ca làm việc (Sáng, Giữa ca, Hết ca, ...)
    san_pham: '',       // Sản phẩm (Fitgum CAFE 20X, Dán Kinoki, ...)
    thi_truong: ''      // Thị trường/Quốc gia (Úc, US, Nhật Bản, ...)
});
```

### 1.2. Filter Options State
```javascript
const [filterOptions, setFilterOptions] = useState({
    teams: [],          // Danh sách teams từ dữ liệu đã load
    shifts: [],         // Danh sách ca từ dữ liệu đã load
    products: [],       // Danh sách sản phẩm từ dữ liệu đã load
    countries: []       // Danh sách quốc gia từ dữ liệu đã load
});
```

## 2. Cơ chế Extract Options

### 2.1. Tự động extract từ dữ liệu đã load
```javascript
useEffect(() => {
    if (orders.length > 0) {
        // Extract unique values từ orders
        const newTeams = [...new Set(orders.map(o => o.team).filter(Boolean))];
        const newShifts = [...new Set(orders.map(o => o.shift).filter(Boolean))];
        const newProducts = [...new Set(orders.map(o => o.product).filter(Boolean))];
        const newCountries = [...new Set(orders.map(o => o.country).filter(Boolean))];
        
        // Merge với options hiện có (không mất options khi filter)
        setFilterOptions(prev => ({
            teams: [...new Set([...prev.teams, ...newTeams])].sort(),
            shifts: [...new Set([...prev.shifts, ...newShifts])].sort(),
            products: [...new Set([...prev.products, ...newProducts])].sort(),
            countries: [...new Set([...prev.countries, ...newCountries])].sort()
        }));
    }
}, [orders]);
```

**Đặc điểm:**
- ✅ Tự động extract sau mỗi lần load dữ liệu
- ✅ Merge với options cũ để không mất options khi filter
- ✅ Sắp xếp alphabetically
- ✅ Loại bỏ giá trị null/undefined/empty

## 3. Chuyển đổi dữ liệu

### 3.1. Date Format Conversion
```javascript
// Frontend: YYYY-MM-DD (HTML date input)
from_date: "2026-01-23"

// API: DD/MM/YYYY
from_date: "23/01/2026"
```

**Hàm convert:**
```javascript
convertDateToAPIFormat("2026-01-23") → "23/01/2026"
```

### 3.2. Filter Value Mapping
```javascript
// Frontend state → API params
{
    from_date: "2026-01-23"     → from_date: "23/01/2026"
    to_date: "2026-02-23"       → to_date: "23/02/2026"
    team: "Hà Nội"              → team: "Hà Nội"
    ca: "Hết ca"                 → ca: "Hết ca"
    san_pham: "Fitgum CAFE 20X" → san_pham: "Fitgum CAFE 20X"
    thi_truong: "Úc"             → thi_truong: "Úc"
}
```

## 4. API Request

### 4.1. URL Construction
```javascript
const params = new URLSearchParams();

if (filters.from_date) params.append('from_date', convertDateToAPIFormat(filters.from_date));
if (filters.to_date) params.append('to_date', convertDateToAPIFormat(filters.to_date));
if (filters.team) params.append('team', filters.team);
if (filters.ca) params.append('ca', filters.ca);
if (filters.san_pham) params.append('san_pham', filters.san_pham);
if (filters.thi_truong) params.append('thi_truong', filters.thi_truong);

const url = `https://lumidataapi.vercel.app/orders?${params.toString()}`;
```

### 4.2. Example Request
```
GET https://lumidataapi.vercel.app/orders?
    from_date=23/01/2026&
    to_date=23/02/2026&
    team=Hà%20Nội&
    ca=Hết%20ca&
    san_pham=Fitgum%20CAFE%2020X&
    thi_truong=Úc
```

## 5. Backend Processing

### 5.1. Filter Logic (Server-side)
Backend API sẽ:
1. Parse query parameters
2. Apply filters theo thứ tự:
   - **Date range filter**: `order_date BETWEEN from_date AND to_date`
   - **Team filter**: `team = 'Hà Nội'` (nếu có)
   - **Ca filter**: `shift LIKE '%Hết ca%'` (nếu có)
   - **Sản phẩm filter**: `product = 'Fitgum CAFE 20X'` (nếu có)
   - **Thị trường filter**: `country = 'Úc'` (nếu có)
3. Return filtered results + statistics

### 5.2. Response Structure
```json
{
    "data": [
        {
            "id": "...",
            "order_date": "2025-10-07",
            "team": "Hà Nội",
            "country": "Úc",
            "product": "Fitgum CAFE 20X",
            "shift": "Hết ca",
            ...
        }
    ],
    "count": 100,
    "statistics": {
        "total_orders": 1000,
        "total_revenue_vnd": 3921434000.0,
        "by_team": {...},
        "by_country": {...}
    }
}
```

## 6. User Interaction Flow

### 6.1. Initial Load
1. Component mount → Set default dates (30 days ago to today)
2. User clicks "Tìm kiếm"
3. Load data với default date range
4. Extract filter options từ response

### 6.2. Filter Application
1. User chọn filter values từ dropdowns
2. User clicks "Tìm kiếm"
3. Convert filters → API format
4. Send request với all filters
5. Display filtered results
6. Update filter options (merge với options cũ)

### 6.3. Clear Filters
1. User clicks "Xóa"
2. Reset filters về default (chỉ giữ date range)
3. Clear all other filters

## 7. Filter Types

### 7.1. Required Filters
- **from_date**: Bắt buộc (validation)
- **to_date**: Bắt buộc (validation)

### 7.2. Optional Filters
- **team**: Dropdown với options từ dữ liệu
- **ca**: Dropdown với options từ dữ liệu
- **san_pham**: Dropdown với options từ dữ liệu
- **thi_truong**: Dropdown với options từ dữ liệu

## 8. Đặc điểm quan trọng

### 8.1. Server-side Filtering
- ✅ Tất cả filter được xử lý ở backend
- ✅ Giảm tải dữ liệu về frontend
- ✅ Statistics được tính trên filtered data

### 8.2. Dynamic Options
- ✅ Options được extract từ dữ liệu thực tế
- ✅ Merge options để không mất khi filter
- ✅ Sorted alphabetically

### 8.3. Date Handling
- ✅ Frontend: HTML date input (YYYY-MM-DD)
- ✅ API: Vietnamese format (DD/MM/YYYY)
- ✅ Auto conversion

### 8.4. Empty Filter Handling
- ✅ Empty string = "Tất cả" (no filter)
- ✅ Chỉ gửi params khi có giá trị
- ✅ Backend xử lý empty params

## 9. Example Scenarios

### Scenario 1: Filter by Date Only
```
Input: from_date=23/01/2026, to_date=23/02/2026
Result: Tất cả orders trong khoảng thời gian này
```

### Scenario 2: Filter by Team + Date
```
Input: 
  from_date=23/01/2026
  to_date=23/02/2026
  team=Hà Nội
Result: Chỉ orders của team Hà Nội trong khoảng thời gian
```

### Scenario 3: Multiple Filters
```
Input:
  from_date=23/01/2026
  to_date=23/02/2026
  team=HCM
  ca=Hết ca
  san_pham=Fitgum CAFE 20X
  thi_truong=Úc
Result: Orders thỏa mãn TẤT CẢ các điều kiện (AND logic)
```

## 10. Performance Considerations

- **Lazy Loading**: Chỉ load khi user click "Tìm kiếm"
- **No Auto-refresh**: Không tự động reload khi filter thay đổi
- **Options Caching**: Options được merge và giữ lại
- **Server-side Stats**: Statistics được tính ở backend

## 11. Error Handling

- Validation: Kiểm tra from_date và to_date trước khi search
- API Errors: Hiển thị alert với error message
- Empty Results: Hiển thị "Không có dữ liệu"
- Loading State: Hiển thị loading overlay khi đang fetch
