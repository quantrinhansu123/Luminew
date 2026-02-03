# Tài Liệu API Đầy Đủ - Google Sheets API

## Tổng Quan

API này được xây dựng bằng Node.js và Express để quản lý dữ liệu trên Google Sheets. Hệ thống hỗ trợ đầy đủ các thao tác CRUD (Create, Read, Update, Delete) cùng với các tính năng nâng cao như báo cáo, validation, backup/restore và streaming dữ liệu.

### Thông Tin Dự Án
- **Tên dự án**: nApi (Google Sheets API)
- **Phiên bản**: 1.0.0
- **Ngôn ngữ**: JavaScript (ES6+)
- **Framework**: Express.js
- **Database**: Google Sheets
- **Port mặc định**: 8081

### Các Dependencies Chính
- express: Framework web
- googleapis: Tương tác#### 31. Tạo Báo Cáo
```http
GET /report/generate?tableName={tableName}
```

**Query Parameters**:
- `tableName` (string): Tên bảng cần tạo báo cáo

**Supported Tables**:
- `Báo cáo MKT`: Báo cáo Marketing (kết hợp dữ liệu từ 3 nguồn)
- `Báo cáo sale`: Báo cáo Sales

**Data Sources cho Báo cáo MKT**:
- Báo cáo MKT (Spreadsheet: 1ylYT0UAcahij5UtDikKyJFWT3gIyRZsuFsYQ5aUTi2Y)
- F3 (Spreadsheet: 1rI9cHBNlI2Dc-d6VF6zdKiUagBh-VPFrWdddPysuSmo)  
- Nhân sự (Spreadsheet: 1ylYT0UAcahij5UtDikKyJFWT3gIyRZsuFsYQ5aUTi2Y)

**Examples**:
```bash
# Báo cáo sales
curl -X GET "http://localhost:8081/report/generate?tableName=Báo%20cáo%20sale"

# Báo cáo marketing
curl -X GET "http://localhost:8081/report/generate?tableName=Báo%20cáo%20MKT"
```

**Response**:
```json
{
  "success": true,
  "message": "Report generated successfully for Báo cáo MKT",
  "data": {
    // Processed report data
  },
  "meta": {
    "processingTime": "1250ms",
    "requestedTable": "Báo cáo MKT",
    "totalRecords": 150,
    "dataSources": 3
  }
}
```ts API
- cors: Xử lý CORS
- compression: Nén response
- dotenv: Quản lý biến môi trường
- firebase-admin: Tích hợp Firebase
- axios: HTTP client
- qrcode: Tạo mã QR

---

## Base URLs

```
Production: https://your-domain.com
Development: http://localhost:8081
```

### Cấu Trúc Route Chính

1. **Sheet Management**: `/sheet/*` - Quản lý Google Sheets
2. **Report Generation**: `/report/*` - Tạo báo cáo

---

## 🌐 Deployment

### Vercel Configuration
Dự án đã được cấu hình sẵn để deploy lên Vercel:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.js"
    }
  ]
}
```

### Environment Variables cần thiết:
- `GOOGLE_SHEETS_API_KEY`: API key của Google Sheets
- `SPREADSHEET_ID`: ID của spreadsheet chính
- `PORT`: Port server (mặc định 8081)

---

## 🧰 Utility Functions

### Helper Functions
Dự án bao gồm các utility functions hỗ trợ:

#### Array Utilities (`utils/functions/arr.js`)
- `arrayToClass()`: Chuyển đổi array thành class instance

#### Date Utilities (`utils/functions/date.js`)  
- `toLocaleDateString()`: Format date theo locale "vi-VN"
- `getStartAndEndDates()`: Lấy ngày bắt đầu/kết thúc theo khoảng thời gian

#### String Utilities (`utils/functions/string.js`)
- Các hàm xử lý chuỗi ký tự

#### Number Utilities (`utils/functions/number.js`)
- Các hàm xử lý số và format

#### Object Utilities (`utils/functions/ojb.js`)
- Các hàm xử lý object

---

## 🗂️ SHEET MANAGEMENT APIs

### Thông Tin Spreadsheet

#### 1. Lấy Thông Tin Spreadsheet
```http
GET /sheet/info
```

**Mô tả**: Lấy thông tin tổng quan về spreadsheet và tất cả các sheets.

**Response**:
```json
{
  "success": true,
  "data": {
    "spreadsheetId": "1abc...",
    "title": "Main Database",
    "sheets": [
      {
        "sheetId": 0,
        "title": "F3",
        "rowCount": 1000,
        "columnCount": 50
      }
    ]
  }
}
```

#### 2. Lấy Danh Sách Schemas
```http
GET /sheet/schemas
```

**Mô tả**: Lấy danh sách tất cả schemas có sẵn trong hệ thống.

**Response**:
```json
{
  "success": true,
  "schemas": [
    "F3",
    "MGT nội bộ", 
    "F3 test",
    "MGT nội bộ test",
    "Báo cáo sale",
    "Báo cáo MKT",
    "Nhân sự"
  ]
}
```

#### 3. Lấy Schema Của Sheet
```http
GET /sheet/:sheetName/schema
```

**Parameters**:
- `sheetName` (string): Tên sheet cần lấy schema

**Example**:
```bash
curl -X GET "http://localhost:8081/sheet/F3/schema"
```

**Response**:
```json
{
  "success": true,
  "schema": {
    "name": "F3",
    "columns": [
      {
        "key": "Mã đơn hàng",
        "header": "Mã đơn hàng",
        "type": "string",
        "required": true
      },
      {
        "key": "Name*",
        "header": "Name*", 
        "type": "string",
        "required": true
      }
    ]
  }
}
```

### Quản Lý Sheet

#### 4. Tạo Sheet Mới
```http
POST /sheet/
```

**Body**:
```json
{
  "sheetName": "New Sheet Name"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8081/sheet/" \
  -H "Content-Type: application/json" \
  -d '{"sheetName": "Test Sheet"}'
```

#### 5. Xóa Sheet
```http
DELETE /sheet/:sheetName
```

**Example**:
```bash
curl -X DELETE "http://localhost:8081/sheet/Test%20Sheet"
```

#### 6. Thiết Lập Headers
```http
PUT /sheet/:sheetName/headers
```

**Mô tả**: Thiết lập lại headers cho sheet theo schema đã định nghĩa.

#### 7. Xóa Tất Cả Dữ Liệu
```http
DELETE /sheet/:sheetName/data
```

**Mô tả**: Xóa toàn bộ dữ liệu nhưng giữ lại headers.

### Truy Xuất Dữ Liệu

#### 8. Lấy Tất Cả Dữ Liệu
```http
GET /sheet/:sheetName/data
```

**Query Parameters**:
- `limit` (number): Giới hạn số dòng
- `offset` (number): Bỏ qua số dòng đầu
- `fields` (string): Các cột cần lấy (phân cách bằng dấu phẩy)
- `compress` (boolean): Nén dữ liệu

**Examples**:
```bash
# Lấy tất cả dữ liệu
curl -X GET "http://localhost:8081/sheet/F3/data"

# Phân trang
curl -X GET "http://localhost:8081/sheet/F3/data?limit=10&offset=0"

# Lấy fields cụ thể
curl -X GET "http://localhost:8081/sheet/F3/data?fields=Mã%20đơn%20hàng,Name*,Phone*"
```

#### 9. Streaming Dữ Liệu
```http
GET /sheet/:sheetName/stream
```

**Query Parameters**:
- `batchSize` (number): Kích thước batch mỗi lần stream

**Mô tả**: Streaming dữ liệu cho datasets lớn để tránh timeout.

#### 10. Lấy Dữ Liệu Theo Range
```http
GET /sheet/:sheetName/data/range
```

**Query Parameters**:
- `range` (string): Range cụ thể (VD: A1:D10)

**Example**:
```bash
curl -X GET "http://localhost:8081/sheet/F3/data/range?range=A1:E100"
```

#### 11. Đếm Số Dòng
```http
GET /sheet/:sheetName/count
```

**Response**:
```json
{
  "success": true,
  "count": 1500
}
```

#### 12. Tìm Kiếm Dữ Liệu
```http
GET /sheet/:sheetName/search
```

**Query Parameters**:
- `searchColumn` (string): Cột cần tìm kiếm
- `searchValue` (string): Giá trị cần tìm
- `exactMatch` (boolean): Tìm kiếm chính xác

**Example**:
```bash
curl -X GET "http://localhost:8081/sheet/F3/search?searchColumn=Name*&searchValue=John&exactMatch=false"
```

### Thêm/Cập Nhật Dữ Liệu

#### 13. Thêm Một Dòng
```http
POST /sheet/:sheetName/rows
```

**Body**:
```json
{
  "Mã đơn hàng": "ORD001",
  "Name*": "Nguyen Van A",
  "Phone*": "0123456789",
  "City": "Ho Chi Minh"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8081/sheet/F3/rows" \
  -H "Content-Type: application/json" \
  -d '{
    "Mã đơn hàng": "ORD001",
    "Name*": "Nguyen Van A", 
    "Phone*": "0123456789"
  }'
```

#### 14. Thêm Nhiều Dòng
```http
POST /sheet/:sheetName/rows/batch
```

**Body**:
```json
{
  "rows": [
    {
      "Mã đơn hàng": "ORD001",
      "Name*": "Nguyen Van A",
      "Phone*": "0123456789"
    },
    {
      "Mã đơn hàng": "ORD002", 
      "Name*": "Tran Thi B",
      "Phone*": "0987654321"
    }
  ]
}
```

#### 15. Cập Nhật Theo Index
```http
PUT /sheet/:sheetName/rows/:rowIndex
```

**Parameters**:
- `rowIndex` (number): Vị trí dòng (0-based, không tính header)

**Body**: Dữ liệu cần cập nhật

#### 16. Cập Nhật Theo Điều Kiện
```http
PUT /sheet/:sheetName/rows/condition
```

**Body**:
```json
{
  "searchColumn": "Mã đơn hàng",
  "searchValue": "ORD001",
  "newRowData": {
    "Name*": "Updated Name",
    "Phone*": "0999888777"
  }
}
```

#### 17. Cập Nhật Theo Primary Key (Batch)
```http
PATCH /sheet/:sheetName/update
```

**Mô tả**: Cập nhật nhiều bản ghi theo primary key (cột đầu tiên). Chỉ cập nhật các fields được cung cấp.

**Body**:
```json
[
  {
    "Mã đơn hàng": "ORD001",
    "Name*": "New Name 1",
    "Phone*": "0111111111"
  },
  {
    "Mã đơn hàng": "ORD002",
    "Name*": "New Name 2"
  }
]
```

#### 18. Cập Nhật Single Record
```http
PATCH /sheet/:sheetName/update-single
```

**Mô tả**: Phiên bản tối ưu cho việc cập nhật một bản ghi duy nhất.

**Body**:
```json
{
  "Mã đơn hàng": "ORD001",
  "Name*": "Updated Name",
  "Phone*": "0999888777"
}
```

### Xóa Dữ Liệu

#### 19. Xóa Theo Index
```http
DELETE /sheet/:sheetName/rows/:rowIndex
```

#### 20. Xóa Theo Điều Kiện
```http
DELETE /sheet/:sheetName/rows/condition
```

**Body**:
```json
{
  "searchColumn": "Mã đơn hàng",
  "searchValue": "ORD001"
}
```

### Utility APIs

#### 21. Backup Sheet
```http
POST /sheet/:sheetName/backup
```

**Mô tả**: Backup toàn bộ dữ liệu của sheet.

#### 22. Restore Sheet
```http
POST /sheet/:sheetName/restore
```

**Body**:
```json
{
  "backupData": [
    ["Mã đơn hàng", "Name*", "Phone*"],
    ["ORD001", "Name 1", "0123456789"],
    ["ORD002", "Name 2", "0987654321"]
  ]
}
```

#### 23. Copy Sheet Data
```http
POST /sheet/copy
```

**Body**:
```json
{
  "sourceSheetName": "F3",
  "targetSheetName": "F3 backup"
}
```

#### 24. Validate Batch Data
```http
POST /sheet/:sheetName/validate
```

**Body**:
```json
{
  "rows": [
    {
      "Mã đơn hàng": "ORD001",
      "Name*": "Test Name"
    }
  ]
}
```

#### 25. Import Data With Validation
```http
POST /sheet/:sheetName/import
```

**Body**:
```json
{
  "rows": [
    {
      "Mã đơn hàng": "ORD001",
      "Name*": "Test Name"
    }
  ],
  "options": {
    "skipErrors": true,
    "clearBeforeImport": false
  }
}
```

#### 26. Lấy Thống Kê Sheet
```http
GET /sheet/:sheetName/statistics
```

**Response**:
```json
{
  "success": true,
  "statistics": {
    "totalRows": 1500,
    "totalColumns": 50,
    "lastModified": "2024-01-15T10:30:00Z",
    "dataTypes": {
      "string": 30,
      "number": 15,
      "date": 5
    }
  }
}
```

#### 27. Find and Replace
```http
POST /sheet/:sheetName/find-replace
```

**Body**:
```json
{
  "searchValue": "old_value",
  "replaceValue": "new_value",
  "options": {
    "searchColumns": ["Name*", "Phone*"],
    "exactMatch": false,
    "caseSensitive": false
  }
}
```

#### 28. Export to CSV
```http
GET /sheet/:sheetName/export/csv
```

**Mô tả**: Export sheet thành file CSV.

#### 29. Duplicate Sheet
```http
POST /sheet/duplicate
```

**Body**:
```json
{
  "sourceSheetName": "F3",
  "newSheetName": "F3 Copy"
}
```

---

## 📊 REPORT APIs

### 30. Lấy Danh Sách Báo Cáo
```http
GET /report/available
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "sheetName": "Báo cáo MKT",
      "description": "Báo cáo tổng hợp Marketing - kết hợp dữ liệu từ Báo cáo MKT, F3 và Nhân sự", 
      "dataSources": [
        {
          "spreadsheetId": "1ylYT0UAcahij5UtDikKyJFWT3gIyRZsuFsYQ5aUTi2Y",
          "sheet": "Báo cáo MKT"
        },
        {
          "spreadsheetId": "1rI9cHBNlI2Dc-d6VF6zdKiUagBh-VPFrWdddPysuSmo", 
          "sheet": "F3"
        },
        {
          "spreadsheetId": "1ylYT0UAcahij5UtDikKyJFWT3gIyRZsuFsYQ5aUTi2Y",
          "sheet": "Nhân sự"
        }
      ]
    }
  ],
  "meta": {
    "totalAvailable": 1
  }
}
```

### 31. Tạo Báo Cáo
```http
GET /report/generate?tableName={tableName}
```

**Query Parameters**:
- `tableName` (string): Tên bảng cần tạo báo cáo

**Examples**:
```bash
# Báo cáo sales
curl -X GET "http://localhost:8081/report/generate?tableName=Báo%20cáo%20sale"

# Báo cáo marketing
curl -X GET "http://localhost:8081/report/generate?tableName=Báo%20cáo%20MKT"
```

---

## 🔧 Data Schema và Validation

### Google Sheets Configuration
- **Main Spreadsheet ID**: `1rI9cHBNlI2Dc-d6VF6zdKiUagBh-VPFrWdddPysuSmo`
- **Report Spreadsheet ID**: `1ylYT0UAcahij5UtDikKyJFWT3gIyRZsuFsYQ5aUTi2Y`
- **Credentials File**: `sheetCredentials.json`

### Các Schema Có Sẵn

#### 1. Schema F3 (Đơn hàng chính)
- **Mã đơn hàng** (string, required): Mã định danh đơn hàng
- **Name*** (string, required): Tên khách hàng
- **Phone*** (string, required): Số điện thoại
- **Địa chỉ**: Add, City, State, Zipcode
- **Sản phẩm**: Mặt hàng, Tên mặt hàng 1&2, Số lượng
- **Tài chính**: Giá bán, Tổng tiền VNĐ, Hình thức thanh toán
- **Nhân sự**: Nhân viên Sale, Marketing, Vận đơn
- **Vận chuyển**: Đơn vị vận chuyển, Trạng thái giao hàng
- **Kế toán**: Các thông tin đối soát, chuyển khoản

#### 2. Schema Báo Cáo Sale
- **id** (string, required): ID nhân viên
- **Email, Tên**: Thông tin nhân viên
- **Ngày, Ca**: Thời gian làm việc
- **Số Mess, Phản hồi, Đơn Mess**: Chỉ số hoạt động
- **Doanh số**: Mess, đi, thành công, hoàn hủy
- **Phân loại**: Khách mới/cũ, Team, Chi nhánh

#### 3. Schema Báo Cáo Marketing
- **id** (string, required): ID nhân viên marketing
- **Thông tin**: Tên, Email, Ngày, Ca
- **Quảng cáo**: TKQC, CPQC, Page, Via_log
- **Hiệu suất**: Số Mess/Cmt, Số đơn, Doanh số
- **KPIs**: Các chỉ số đánh giá hiệu quả

#### 4. Schema Nhân Sự
- **id** (string, required): ID nhân viên
- **Thông tin cá nhân**: Họ tên, Email, SĐT
- **Công việc**: Bộ phận, Vị trí, Team, Chi nhánh
- **Ca làm việc**: Ca, Vị trí vận đơn

### Data Types Hỗ Trợ

- **string**: Chuỗi ký tự thông thường
- **number**: Số (integer/float)
- **date**: Ngày (format: DD/MM/YYYY)
- **datetime**: Ngày giờ (format: DD/MM/YYYY HH:mm:ss)
- **time**: Giờ (format: HH:mm:ss)
- **text**: Văn bản dài (cho ghi chú, mô tả)

### Validation Rules

1. **Required Fields**: Các trường bắt buộc phải có giá trị
2. **Type Validation**: Dữ liệu phải đúng kiểu được định nghĩa
3. **Data Transformation**: Tự động chuyển đổi format phù hợp
4. **Error Handling**: Trả về lỗi chi tiết khi validation fail

---

## 📝 Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    // Dữ liệu response
  },
  "message": "Operation completed successfully",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Field Name* is required",
    "details": "Detailed error information"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Common Error Codes

- `VALIDATION_ERROR`: Lỗi validation dữ liệu
- `SHEET_NOT_FOUND`: Không tìm thấy sheet
- `PERMISSION_DENIED`: Không có quyền truy cập
- `QUOTA_EXCEEDED`: Vượt quá giới hạn API
- `NETWORK_ERROR`: Lỗi kết nối mạng
- `INTERNAL_ERROR`: Lỗi server nội bộ

---

## 🚀 Getting Started

### 1. Cài Đặt Dependencies
```bash
npm install
```

### 2. Cấu Hình Environment
Tạo file `.env`:
```env
PORT=8081
GOOGLE_SHEETS_API_KEY=your_api_key
SPREADSHEET_ID=your_spreadsheet_id
```

### 3. Khởi Chạy Server
```bash
npm start
# hoặc
nodemon index.js
```

### 4. Test API
```bash
curl -X GET "http://localhost:8081/sheet/info"
```

---

## 📋 Examples

### Ví Dụ Workflow Hoàn Chỉnh

#### 1. Tạo đơn hàng mới
```bash
curl -X POST "http://localhost:8081/sheet/F3/rows" \
  -H "Content-Type: application/json" \
  -d '{
    "Mã đơn hàng": "ORD001",
    "Name*": "Nguyen Van A",
    "Phone*": "0123456789",
    "Add": "123 Le Loi",
    "City": "Ho Chi Minh",
    "Mặt hàng": "Product A",
    "Giá bán": 500000,
    "Nhân viên Sale": "John Doe"
  }'
```

#### 2. Cập nhật trạng thái đơn hàng
```bash
curl -X PATCH "http://localhost:8081/sheet/F3/update-single" \
  -H "Content-Type: application/json" \
  -d '{
    "Mã đơn hàng": "ORD001",
    "Trạng thái giao hàng": "Đang giao",
    "Nhân viên Marketing": "Jane Smith"
  }'
```

#### 3. Tìm kiếm đơn hàng
```bash
curl -X GET "http://localhost:8081/sheet/F3/search?searchColumn=Mã%20đơn%20hàng&searchValue=ORD001"
```

#### 4. Tạo báo cáo sale
```bash
curl -X GET "http://localhost:8081/report/generate?tableName=Báo%20cáo%20sale"
```

### Authentication & Rate Limiting
- **Google Sheets API**: Sử dụng Service Account Authentication
- **Scope**: `https://www.googleapis.com/auth/spreadsheets`
- **Rate Limiting**: Được handle tự động bởi Google API client
- **Connection Pooling**: Sử dụng singleton pattern cho authenticated client

### Performance Optimizations
- **Smart Range Calculation**: Chỉ lấy các cột cần thiết
- **Batch Operations**: Hỗ trợ xử lý nhiều records cùng lúc
- **Caching**: Authentication client được cache
- **Compression**: Response tự động được nén

### Data Validation
- **Schema Validation**: Validate theo schema được định nghĩa
- **Type Conversion**: Tự động convert data types
- **Required Fields**: Kiểm tra fields bắt buộc
- **Error Handling**: Return lỗi chi tiết và actionable

---

## 🔒 Security & Best Practices

### Authentication
- API hiện tại chưa có authentication, cần implement JWT hoặc API key
- Sử dụng HTTPS trong production
- Rate limiting để tránh spam

### Performance
- Sử dụng compression cho response lớn
- Implement caching cho dữ liệu ít thay đổi
- Streaming cho datasets lớn
- Pagination để tránh overload

### Error Handling
- Validate input trước khi gửi request
- Handle network errors và timeouts
- Log errors cho debugging
- Graceful degradation khi service unavailable

---

## 📞 Support

Để được hỗ trợ và báo lỗi:
1. Kiểm tra logs server
2. Verify Google Sheets permissions
3. Check network connectivity
4. Review API documentation

---

*Tài liệu này được cập nhật lần cuối: 9/9/2025*
