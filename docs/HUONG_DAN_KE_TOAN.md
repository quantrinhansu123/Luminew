# Hướng Dẫn Sử Dụng Trang Kế Toán

## Mục Lục
1. [Giới thiệu](#giới-thiệu)
2. [Trang Đối Soát Bill và Cước](#trang-đối-soát-bill-và-cước)
3. [Trang Finance Manager](#trang-finance-manager)
4. [Trang Quản Lý Tỷ Giá](#trang-quản-lý-tỷ-giá)

---

## Giới thiệu

Hệ thống kế toán bao gồm các trang chính:
- **Đối Soát Bill và Cước**: Quản lý đối soát thanh toán và cước vận chuyển
- **Finance Manager**: Hệ thống quản lý tài chính tổng thể
- **Quản Lý Tỷ Giá**: Cập nhật và quản lý tỷ giá ngoại tệ

---

## Trang Đối Soát Bill và Cước

### 1. Tổng Quan

Trang này giúp bạn quản lý hai loại dữ liệu:
- **Bill (Tiền)**: Đối soát các khoản thanh toán từ khách hàng
- **Cước**: Đối soát chi phí vận chuyển

### 2. Các Tab Chính

#### Tab Bill (Đối soát tiền)
Hiển thị các cột:
- **STT**: Số thứ tự
- **Mã đơn hàng**: Mã đơn hàng trong hệ thống
- **Mã Tracking**: Mã vận đơn (có thể để trống hoặc ghi "Drop off" cho đơn tự giao)
- **Ngày đối soát**: Ngày thực hiện đối soát
- **FFM**: Đơn vị vận chuyển (tự động điền từ đơn hàng)
- **Số tiền đối soát**: Số tiền nhận được (ngoại tệ)
- **Tỷ giá**: Tỷ giá quy đổi (tự động điền theo đơn vị tiền)
- **Tiền Việt**: Số tiền quy đổi ra VNĐ
- **Đếm lần thanh toán**: Số lần thanh toán cho cùng mã tracking/đơn hàng (tự động tính)

#### Tab Cước (Đối soát cước vận chuyển)
Hiển thị các cột:
- **Mã đơn hàng**: Mã đơn hàng
- **Ngày đối soát cước**: Ngày đối soát chi phí vận chuyển
- **Tiền ship (Vnđ)**: Chi phí vận chuyển bằng VNĐ
- **Đếm lần thanh toán**: Số lần thanh toán cho cùng mã đơn (tự động tính)
- **Chi nhánh**: Chi nhánh xử lý đơn (tự động điền từ đơn hàng)

### 3. Các Chức Năng Chính

#### 3.1. Thêm Dữ Liệu Thủ Công

**Bước 1**: Nhấn nút **"+ Thêm"**

**Bước 2**: Nhập danh sách mã đơn hàng (mỗi mã một dòng)
```
Bona272f26d
Fit31b31704
DG6da921bf
```

**Bước 3**: Nhấn **"Thêm"** để tạo các dòng trống

**Bước 4**: Điền thông tin vào các ô:
- Click vào ô cần sửa
- Nhập giá trị mới
- Hệ thống tự động lưu vào pending changes

#### 3.2. Import Dữ Liệu Từ Excel

**Tab Bill:**

**Bước 1**: Tải mẫu Excel
- Nhấn nút **"Tải mẫu Excel"**
- Mở file mẫu và điền dữ liệu theo cột

**Bước 2**: Chuẩn bị file Excel
- Cột **STT**: Số thứ tự
- Cột **Mã đơn hàng**: Mã đơn (bắt buộc nếu không có Mã Tracking)
- Cột **Mã Tracking**: Mã vận đơn (để trống hoặc "Drop off" cho đơn tự giao)
- Cột **Ngày đối soát**: Định dạng dd/mm/yyyy (ví dụ: 02/04/2026)
- Cột **Số tiền đối soát**: Số tiền ngoại tệ
- Cột **Tỷ giá**: Có thể để trống (hệ thống tự điền)
- Cột **Tiền Việt**: Số tiền VNĐ

**Bước 3**: Import file
- Nhấn nút **"📤 Import Excel"**
- Chọn file Excel đã chuẩn bị
- Hệ thống sẽ đọc và thêm dữ liệu vào bảng

**Tab Cước:**

**Bước 1**: Tải mẫu Excel
- Nhấn nút **"Tải mẫu Excel"**

**Bước 2**: Chuẩn bị file Excel
- File có thể có dòng ghi chú ở đầu
- Dòng header chứa: "Mã đơn hàng", "Ngày đối soát cước", "Tiền ship (Vnđ)"
- Điền dữ liệu từ dòng tiếp theo

**Bước 3**: Import file
- Nhấn nút **"📤 Import Excel"**
- Chọn file Excel
- Hệ thống tự động tìm dòng header và đọc dữ liệu

#### 3.3. Chỉnh Sửa Dữ Liệu

**Chỉnh sửa từng ô:**
1. Click vào ô cần sửa
2. Nhập giá trị mới
3. Nhấn Enter hoặc click ra ngoài

**Chỉnh sửa hàng loạt (Copy/Paste):**

**Copy dữ liệu:**
1. Click vào ô đầu tiên
2. Giữ chuột và kéo để chọn vùng
3. Nhấn **Ctrl+C** để copy
4. Hoặc dùng **Shift+Click** để chọn vùng

**Paste dữ liệu:**
1. Chọn ô đầu tiên của vùng muốn paste
2. Nhấn **Ctrl+V**
3. Hệ thống sẽ paste dữ liệu vào các ô tương ứng

**Lưu ý về Copy/Paste:**
- Hỗ trợ copy/paste từ Excel
- Có thể copy/paste nhiều dòng, nhiều cột cùng lúc
- Dữ liệu sẽ được lưu vào pending changes

**Phím tắt hữu ích:**
- **Ctrl+C**: Copy vùng đã chọn
- **Ctrl+V**: Paste dữ liệu
- **Ctrl+A**: Chọn toàn bộ bảng
- **Esc**: Bỏ chọn
- **Arrow keys**: Di chuyển giữa các ô
- **Shift+Arrow**: Mở rộng vùng chọn

#### 3.4. Lưu Thay Đổi

**Bước 1**: Sau khi chỉnh sửa, nhấn nút **"💾 Lưu thay đổi"**

**Bước 2**: Hệ thống sẽ:
- Cập nhật tất cả thay đổi vào database
- Tự động điền các trường phụ thuộc:
  - **FFM** (từ đơn hàng)
  - **Đơn vị tiền** (từ payment_type)
  - **Tỷ giá** (từ bảng tỷ giá)
  - **Chi nhánh** (từ đơn hàng)
- Hiển thị thông báo thành công

**Lưu ý:**
- Các thay đổi chưa lưu sẽ được đánh dấu màu vàng nhạt
- Cột "Đếm lần thanh toán" màu đỏ nếu > 1 (cảnh báo trùng lặp)

#### 3.5. Đồng Bộ Dữ Liệu Lên Orders

**Đồng bộ Bill:**

**Bước 1**: Nhấn nút **"🔄 Đồng bộ Bill"**

**Bước 2**: Xác nhận đồng bộ

**Cách thức hoạt động:**
- **Với Mã Tracking thật**: 
  - Gom tổng tiền theo Mã Tracking
  - Tìm tất cả đơn hàng có cùng tracking_code
  - Chia đều tiền cho các đơn (nếu nhiều đơn cùng tracking)
  - Cập nhật `total_vnd` lên bảng orders

- **Với Mã Tracking trống/Drop off**:
  - Gom tiền theo Mã đơn hàng
  - Cập nhật `total_vnd` cho đúng đơn đó

**Kết quả:**
- Hiển thị số đơn đã đồng bộ thành công
- Lưu log vào bảng `bill_sync_results`
- Chuyển sang tab "Xem Bill" (chỉ hiển thị dữ liệu chưa đồng bộ)

**Đồng bộ Cước:**

**Bước 1**: Nhấn nút **"🔄 Đồng bộ Cước"**

**Bước 2**: Xác nhận đồng bộ

**Cách thức hoạt động:**
- Gom tổng tiền ship theo Mã đơn hàng
- Đếm số lần thanh toán cho mỗi đơn
- Cập nhật lên bảng orders:
  - `shipping_cost`: Tổng tiền ship
  - `order_count_actual`: Số lần thanh toán

**Kết quả:**
- Hiển thị số đơn đã đồng bộ
- Lưu log vào bảng `bill_sync_results`
- Chuyển sang tab "Xem Cước"

#### 3.6. Xem Chi Tiết Trùng Lặp

**Với Bill:**
- Click vào số trong cột **"Đếm lần thanh toán"** (màu đỏ nếu > 1)
- Hiển thị modal với tất cả dòng có cùng Mã Tracking/Mã đơn
- Có thể xóa từng dòng trùng lặp

**Với Cước:**
- Click vào số trong cột **"Đếm lần thanh toán"**
- Hiển thị modal với tất cả dòng có cùng Mã đơn hàng
- Có thể xóa từng dòng trùng lặp

#### 3.7. Xóa Dữ Liệu

**Xóa toàn bộ dữ liệu tạm:**
- Nhấn nút **"🗑️ Xóa hết Bill tạm"** hoặc **"🗑️ Xóa hết Cước tạm"**
- Xác nhận xóa
- **Lưu ý**: Chỉ xóa dữ liệu trong bảng tạm, KHÔNG ảnh hưởng đến bảng orders

**Xóa từng dòng:**
- Trong modal chi tiết, nhấn nút **"Xóa"** bên cạnh dòng cần xóa

#### 3.8. Làm Mới Dữ Liệu

- Nhấn nút **"🔄 Làm mới"** để tải lại dữ liệu từ database
- Các thay đổi chưa lưu sẽ bị mất

### 4. Quy Trình Làm Việc Khuyến Nghị

#### Quy trình đối soát Bill:

1. **Chuẩn bị dữ liệu**
   - Tải mẫu Excel
   - Điền thông tin đối soát từ ngân hàng/payment gateway
   - Đảm bảo có Mã Tracking hoặc Mã đơn hàng

2. **Import dữ liệu**
   - Import file Excel vào hệ thống
   - Kiểm tra dữ liệu đã import

3. **Kiểm tra và sửa lỗi**
   - Xem cột "Đếm lần thanh toán" (màu đỏ = trùng lặp)
   - Click vào số đỏ để xem chi tiết
   - Xóa các dòng trùng lặp nếu cần
   - Sửa các thông tin sai lệch

4. **Lưu thay đổi**
   - Nhấn "💾 Lưu thay đổi"
   - Kiểm tra thông báo thành công

5. **Đồng bộ lên Orders**
   - Nhấn "🔄 Đồng bộ Bill"
   - Kiểm tra kết quả đồng bộ
   - Dữ liệu đã đồng bộ sẽ chuyển sang tab "Xem Bill"

#### Quy trình đối soát Cước:

1. **Chuẩn bị dữ liệu**
   - Tải mẫu Excel
   - Điền thông tin cước vận chuyển
   - Đảm bảo có Mã đơn hàng chính xác

2. **Import dữ liệu**
   - Import file Excel
   - Hệ thống tự động điền Chi nhánh từ đơn hàng

3. **Kiểm tra**
   - Xem cột "Đếm lần thanh toán"
   - Kiểm tra Chi nhánh đã được điền đúng
   - Sửa các lỗi nếu có

4. **Lưu và đồng bộ**
   - Lưu thay đổi
   - Đồng bộ Cước lên Orders

### 5. Lưu Ý Quan Trọng

#### Về Mã Tracking:
- **Tracking thật**: Hệ thống sẽ tìm tất cả đơn có cùng tracking_code và chia đều tiền
- **"Drop off" / "DROPP OFF" / trống**: Hệ thống sẽ gom tiền theo Mã đơn hàng trên dòng bill
- Viết hoa/thường không quan trọng với "drop off"

#### Về Tỷ Giá:
- Tỷ giá tự động điền từ bảng `exchange_rates`
- Các loại tiền hỗ trợ: USD, AUD, CAD, YEN (JPY)
- Nếu chưa có tỷ giá, cần cập nhật ở trang "Quản Lý Tỷ Giá"

#### Về Đồng Bộ:
- Dữ liệu đã đồng bộ sẽ không hiển thị ở tab chính (Bill/Cước)
- Xem lại dữ liệu đã đồng bộ ở tab "Xem Bill" / "Xem Cước"
- Mỗi lần đồng bộ tạo một `sync_batch_id` để theo dõi

#### Về Phân Trang:
- Mặc định hiển thị 50 dòng/trang
- Có thể thay đổi số dòng hiển thị: 10, 25, 50, 100, 200
- Dùng nút "Trang trước" / "Trang sau" để di chuyển

---

## Trang Finance Manager

### 1. Giới Thiệu

Trang Finance Manager là hệ thống quản lý tài chính tổng thể, được tích hợp từ ứng dụng bên ngoài.

### 2. Truy Cập

- Từ menu chính, chọn **"Finance Manager"**
- Trang sẽ mở trong iframe từ: `https://lumi-finance-manager.vercel.app/`

### 3. Chức Năng

Trang này cung cấp các chức năng quản lý tài chính nâng cao (chi tiết phụ thuộc vào ứng dụng Finance Manager).

---

## Trang Quản Lý Tỷ Giá

### 1. Giới Thiệu

Trang này cho phép cập nhật tỷ giá ngoại tệ, được sử dụng tự động trong trang Đối Soát Bill.

### 2. Các Loại Tiền Tệ

Hệ thống hỗ trợ:
- **USD**: Đô la Mỹ
- **AUD**: Đô la Úc
- **CAD**: Đô la Canada
- **JPY/YEN**: Yên Nhật

### 3. Cập Nhật Tỷ Giá

**Bước 1**: Truy cập trang "Quản Lý Tỷ Giá"

**Bước 2**: Nhập tỷ giá mới cho từng loại tiền

**Bước 3**: Nhấn "Lưu" để cập nhật

**Lưu ý:**
- Tỷ giá được lưu trong bảng `exchange_rates`
- Schema: `ti_gia` (loại tiền), `gia_tri` (giá trị)
- Tỷ giá sẽ tự động áp dụng cho các dòng bill mới

### 4. Mapping Tỷ Giá

Hệ thống tự động map từ `payment_type` sang đơn vị tiền:
- **USD** → USD
- **AUD** → AUD
- **CAD** → CAD
- **JPY** hoặc **YEN** → YEN
- **Zelle** → USD
- **COD** → USD

---

## Câu Hỏi Thường Gặp (FAQ)

### 1. Tại sao cột "Đếm lần thanh toán" màu đỏ?

Màu đỏ cảnh báo có nhiều hơn 1 dòng thanh toán cho cùng một Mã Tracking (Bill) hoặc Mã đơn hàng (Cước). Click vào số để xem chi tiết và xóa dòng trùng nếu cần.

### 2. Tại sao không đồng bộ được?

Kiểm tra:
- Mã đơn hàng có tồn tại trong bảng orders không?
- Mã Tracking có khớp với tracking_code trong orders không?
- Có quyền truy cập bảng orders không? (RLS policy)

### 3. Làm sao để sửa dữ liệu đã đồng bộ?

Dữ liệu đã đồng bộ được lưu vào bảng orders. Cần sửa trực tiếp trong bảng orders hoặc tạo dòng mới trong bảng tạm và đồng bộ lại.

### 4. Import Excel bị lỗi?

Kiểm tra:
- File Excel có đúng định dạng không?
- Cột header có đúng tên không?
- Ngày tháng có đúng định dạng dd/mm/yyyy không?
- Số tiền có phải là số không? (không có ký tự đặc biệt)

### 5. Tỷ giá không tự động điền?

Kiểm tra:
- Đã cập nhật tỷ giá trong trang "Quản Lý Tỷ Giá" chưa?
- Cột "Đơn vị tiền" đã được điền chưa?
- Đơn vị tiền có nằm trong danh sách hỗ trợ không? (USD, AUD, CAD, YEN)

---

## Liên Hệ Hỗ Trợ

Nếu gặp vấn đề khi sử dụng, vui lòng liên hệ bộ phận IT hoặc quản trị hệ thống.

---

**Phiên bản**: 1.0  
**Ngày cập nhật**: 18/04/2026
