# Báo Cáo Marketing

## Tổng quan

Trang **Báo Cáo Marketing** (`/bao-cao-marketing`) là một module cho phép nhân viên Marketing nhập và quản lý báo cáo công việc hàng ngày. Trang này cung cấp giao diện dạng bảng để nhập liệu và tự động lưu vào cơ sở dữ liệu Supabase.

## URL

- **Development**: `http://localhost:3001/bao-cao-marketing`
- **Route**: `/bao-cao-marketing`

## Quyền truy cập

- **Permission Code**: `MKT_INPUT`
- Chỉ những người dùng có quyền `MKT_INPUT` mới có thể truy cập trang này
- Nếu không có quyền, sẽ hiển thị thông báo: "Bạn không có quyền truy cập trang này (MKT_INPUT)"

## Chức năng chính

### 1. Nhập báo cáo Marketing

Trang cho phép nhân viên Marketing nhập các thông tin báo cáo bao gồm:

#### Các trường dữ liệu

| Trường | Mô tả | Loại | Bắt buộc |
|--------|-------|------|----------|
| `id` | ID tự động | UUID | Tự động |
| `Tên` | Tên nhân viên | Text | Có |
| `Email` | Email nhân viên | Email | Có |
| `Ngày` | Ngày báo cáo | Date | Có |
| `ca` | Ca làm việc (Hết ca, Giữa ca) | Text | Không |
| `Sản_phẩm` | Tên sản phẩm | Text | Không |
| `Thị_trường` | Thị trường (Nhật Bản, Hàn Quốc, Canada, US, Úc, Anh, CĐ Nhật Bản) | Text | Không |
| `TKQC` | Tài khoản quảng cáo | Text | Không |
| `CPQC` | Chi phí quảng cáo | Number | Không |
| `Số_Mess_Cmt` | Số lượng Mess/Comment | Number | Không |
| `Số đơn` | Số đơn hàng | Number | Không |
| `Doanh số` | Doanh số | Number | Không |
| `Team` | Team | Text | Tự động |
| `id_NS` | ID nhân sự | Text | Tự động |
| `Doanh số đi` | Doanh số đi | Number | Không |
| `Số đơn hoàn hủy` | Số đơn hoàn hủy | Number | Không |
| `DS chốt` | Doanh số chốt | Number | Không |
| `DS sau hoàn hủy` | Doanh số sau hoàn hủy | Number | Không |
| `Doanh số sau ship` | Doanh số sau ship | Number | Không |
| `Doanh số TC` | Doanh số TC | Number | Không |
| `KPIs` | KPIs | Number | Không |
| `CPQC theo TKQC` | Chi phí quảng cáo theo tài khoản | Number | Không |
| `Báo cáo theo Page` | Báo cáo theo Page | Text | Không |
| `Trạng thái` | Trạng thái | Text | Không |
| `Cảnh báo` | Cảnh báo | Text | Không |

### 2. Quản lý dòng dữ liệu

- **Thêm dòng mới**: Nhấn nút "➕ Thêm dòng" để thêm một dòng trống mới
- **Copy dòng**: Nhấn nút "➕" trong cột "Hành động" để copy dòng hiện tại (sao chép các trường: Tên, Email, ca, Sản_phẩm, Thị_trường)
- **Xóa dòng**: Nhấn nút "❌" trong cột "Hành động" để xóa dòng (có xác nhận)
- **Lưu ý**: Không thể xóa dòng cuối cùng

### 3. Tự động điền thông tin

- Khi nhập **Tên**, hệ thống tự động điền:
  - Email
  - Team
  - id_NS
  - Chi nhánh

- Khi nhập **Email**, hệ thống tự động điền:
  - Tên
  - Team
  - id_NS
  - Chi nhánh

### 4. Datalist (Gợi ý nhập liệu)

- **Tên nhân viên**: Tự động load từ danh sách nhân viên MKT
- **Email**: Tự động load từ danh sách nhân viên MKT
- **Ca**: ['Hết ca', 'Giữa ca']
- **Sản phẩm**: Load từ `system_settings` (type <> 'test')
- **Thị trường**: ['Nhật Bản', 'Hàn Quốc', 'Canada', 'US', 'Úc', 'Anh', 'CĐ Nhật Bản']

### 5. Tính toán giá trị thực tế

Hệ thống tự động tính toán các giá trị thực tế từ bảng `orders` dựa trên:
- Ngày
- Tên (marketing_staff)
- Ca (shift)
- Sản phẩm (product)
- Thị trường (country)

**Lưu ý**: Tính năng này đã được loại bỏ trong phiên bản hiện tại (theo comment trong code).

### 6. Gửi báo cáo

- Nhấn nút "🚀 Gửi báo cáo" để lưu dữ liệu vào Supabase
- Dữ liệu được lưu vào bảng `detail_reports`
- Sau khi gửi thành công, form sẽ được reset về trạng thái ban đầu

### 7. Kiểm soát quyền chỉnh sửa

- **Admin/Manager/Director**: Có thể chỉnh sửa tất cả các trường, bao gồm Tên và Email
- **User thường**: Không thể chỉnh sửa Tên và Email (tự động khóa dựa trên thông tin đăng nhập)

## Nguồn dữ liệu

### Danh sách nhân viên

- **API**: `https://n-api-rouge.vercel.app/sheet/getSheets?rangeSheet=A:K&sheetName=Nhân sự&spreadsheetId=1Cl-56By1eYFB4G7ITuG0IQhH39ITwo0AkZPFvsLfo54`
- **Lọc**: Chỉ lấy nhân viên có bộ phận = 'MKT'
- **Thông tin lấy**: Họ và Tên, Email, Team, ID, Chi nhánh

### Danh sách sản phẩm

- **Nguồn**: Bảng `system_settings` trong Supabase
- **Điều kiện**: `type <> 'test'`
- **Sắp xếp**: Theo tên (ascending)

## Cấu trúc dữ liệu

### Bảng `detail_reports`

Dữ liệu được lưu vào bảng `detail_reports` trong Supabase với các cột tương ứng với `headerMkt`.

### Mapping dữ liệu

- Các trường số được format và parse tự động
- Các trường bị loại trừ: 'Chi nhánh', 'chi nhánh', 'Chi_nhánh', 'chi_nhánh', 'branch'
- Tự động điền Team nếu thiếu (mặc định: 'MKT')
- Tự động điền Ngày nếu thiếu (mặc định: ngày hôm nay)

## Xử lý lỗi

- Hiển thị thông báo lỗi chi tiết khi gửi dữ liệu thất bại
- Hiển thị thông báo thành công khi gửi dữ liệu thành công
- Log lỗi vào console để debug

## Test Mode

- Hệ thống hỗ trợ chế độ test (kiểm tra từ `localStorage.getItem('system_settings')`)
- Khi ở chế độ test, dữ liệu sẽ không được lưu vào database
- Hiển thị thông báo "[TEST MODE]" khi gửi thành công

## Giao diện

- **Header**: "Báo Cáo MKT" với màu xanh dương
- **Status bar**: Hiển thị trạng thái hiện tại của ứng dụng
- **Table**: Bảng dạng scroll với header cố định
- **Responsive**: Hỗ trợ scroll ngang và dọc cho màn hình nhỏ

## Các trường ẩn

Các trường sau không hiển thị trong bảng (nhưng vẫn có trong schema):
- `id`
- `id phản hồi`
- `id số mess`
- `team`
- `id_ns`
- `trạng thái`
- `chi nhánh`
- `doanh số đi`
- `số đơn hoàn huỷ`
- `số đơn hoàn hủy`
- `doanh số hoàn huỷ`
- `số đơn thành công`
- `doanh số thành công`
- `khách mới`
- `khách cũ`
- `bán chéo`
- `bán chéo team`
- `ds chốt`
- `ds sau hoàn hủy`
- `số đơn sau hoàn hủy`
- `doanh số sau ship`
- `doanh số tc`
- `kpis`
- `cpqc theo tkqc`
- `báo cáo theo page`
- `cảnh báo`
- `số đơn thực tế`
- `doanh số thực tế`

## Lưu ý kỹ thuật

1. **Date Format**: Ngày được lưu dưới dạng YYYY-MM-DD
2. **Number Format**: Các trường số được format với dấu phẩy (VD: 1.000.000)
3. **Auto-complete**: Sử dụng HTML5 `<datalist>` để gợi ý nhập liệu
4. **Debounce**: Tính toán giá trị thực tế có debounce 500ms
5. **Validation**: Kiểm tra dữ liệu trước khi gửi

## Tích hợp

- **Supabase**: Lưu trữ dữ liệu vào bảng `detail_reports`
- **Google Sheets API**: Lấy danh sách nhân viên từ Google Sheets
- **System Settings**: Lấy danh sách sản phẩm từ bảng `system_settings`

## Cải tiến trong tương lai

- Tính toán giá trị thực tế từ bảng `orders` (hiện đã bị loại bỏ)
- Thêm tính năng chỉnh sửa báo cáo đã gửi
- Thêm tính năng xóa báo cáo
- Thêm tính năng export dữ liệu ra Excel
- Thêm tính năng import dữ liệu từ Excel
