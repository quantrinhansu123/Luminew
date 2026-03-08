# Tài liệu Cột và Bộ lọc API

Tài liệu này mô tả chi tiết các cột trả về và bộ lọc hỗ trợ cho từng endpoint.

---

## 1. GET /orders

### Các cột trả về (Response Columns)

| Tên cột trong Response | Tên cột trong DB | Mô tả |
|------------------------|------------------|-------|
| `id` | `id` | ID đơn hàng |
| `nhanvien_maketing` | `marketing_staff` | Nhân viên marketing |
| `nhanvien_sale` | `sale_staff` | Nhân viên sale |
| `ngaytao` | `created_at` | Ngày tạo đơn hàng |
| `tongtien` | `total_vnd` | Tổng tiền (VND) |
| `order_date` | `order_date` | Ngày đơn hàng |
| `country` | `country` | Quốc gia |
| `product` | `product` | Sản phẩm |
| `total_amount_vnd` | `total_amount_vnd` | Tổng số tiền VND |
| `tracking_code` | `tracking_code` | Mã tracking |
| `team` | `team` | Team |
| `delivery_status` | `delivery_status` | Trạng thái giao hàng |
| `payment_status` | `payment_status` | Trạng thái thanh toán |
| `delivery_staff` | `delivery_staff` | Nhân viên giao hàng |
| `check_result` | `check_result` | Kết quả kiểm tra |
| `shift` | `shift` | Ca làm việc |

### Tham số phân trang

| Tham số | Kiểu | Mô tả | Ví dụ |
|---------|------|-------|-------|
| `limit` | int (1-10000) | Số bản ghi tối đa (không truyền = lấy tất cả) | `limit=100` |
| `offset` | int (≥0) | Vị trí bắt đầu | `offset=0` |
| `after_id` | string | Cursor: id bản ghi cuối trang trước | `after_id=abc123` |

### Tham số lọc ngày tháng

| Tham số | Kiểu | Mô tả | Ví dụ |
|---------|------|-------|-------|
| `from_date` | string | Ngày bắt đầu (dd/mm/yyyy) | `from_date=01/01/2026` |
| `to_date` | string | Ngày kết thúc (dd/mm/yyyy) | `to_date=31/01/2026` |
| `date_column` | string | Cột date để filter (mặc định: `order_date`) | `date_column=created_at` |

**Các giá trị `date_column` hỗ trợ:**
- `order_date` (mặc định)
- `created_at`
- `updated_at`
- `postponed_date`
- `accounting_check_date`
- `estimated_delivery_date`
- `order_time`
- `time_dayon`

### Bộ lọc (Filters)

Tất cả các cột trong bảng `orders` đều có thể dùng làm bộ lọc. Hỗ trợ nhiều giá trị cách nhau bởi dấu phẩy (`,`).

#### Bộ lọc thường dùng:

| Tham số | Cột DB | Mô tả | Ví dụ |
|---------|--------|-------|-------|
| `team` | `team` | Lọc theo chi nhánh/team | `team=Hà Nội` hoặc `team=Hà Nội,HCM` |
| `delivery_staff` | `delivery_staff` | Lọc theo nhân viên giao hàng | `delivery_staff=Nguyễn Văn A` hoặc `delivery_staff=Nguyễn Văn A,Trần Văn B` |
| `delivery_status` | `delivery_status` | Lọc theo trạng thái giao hàng | `delivery_status=Giao Thành Công` hoặc `delivery_status=Giao Thành Công,Chưa Giao` |
| `payment_status` | `payment_status` | Lọc theo trạng thái thanh toán | `payment_status=Có bill` hoặc `payment_status=Có bill,Chưa thu` |
| `country` | `country` | Lọc theo quốc gia | `country=Nhật Bản` |
| `product` | `product` | Lọc theo sản phẩm | `product=Fitgum CAFE 20X` |
| `check_result` | `check_result` | Lọc theo kết quả kiểm tra | `check_result=OK` |
| `marketing_staff` | `marketing_staff` | Lọc theo nhân viên marketing | `marketing_staff=Nguyễn Văn A` |
| `sale_staff` | `sale_staff` | Lọc theo nhân viên sale | `sale_staff=Trần Văn B` |
| `cskh` | `cskh` | Lọc theo CSKH | `cskh=CSKH Name` |
| `shift` | `shift` | Lọc theo ca làm việc | `shift=Morning` hoặc `shift=Morning,Evening` |

#### Tất cả các cột có thể lọc:

`id`, `order_code`, `order_date`, `customer_name`, `customer_phone`, `customer_address`, `city`, `state`, `zipcode`, `country`, `product`, `total_amount_vnd`, `payment_method`, `tracking_code`, `shipping_fee`, `marketing_staff`, `sale_staff`, `team`, `delivery_status`, `payment_status`, `note`, `created_at`, `updated_at`, `cskh`, `delivery_staff`, `goods_amount`, `reconciled_amount`, `general_fee`, `flight_fee`, `account_rental_fee`, `cutoff_time`, `shipping_unit`, `accountant_confirm`, `payment_status_detail`, `reason`, `order_time`, `area`, `product_main`, `product_name_1`, `quantity_1`, `product_name_2`, `quantity_2`, `gift`, `gift_quantity`, `sale_price`, `payment_type`, `exchange_rate`, `total_vnd`, `payment_method_text`, `shipping_cost`, `base_price`, `reconciled_vnd`, `creator_name`, `check_result`, `delivery_status_nb`, `carrier`, `postponed_date`, `shift`, `cskh_status`, `feedback_pos`, `feedback_neg`, `customer_type`, `blacklist_status`, `note_sale`, `note_ffm`, `note_delivery`, `created_by`, `page_name`, `vandon_note`, `item_name_1`, `item_qty_1`, `item_name_2`, `item_qty_2`, `gift_item`, `gift_qty`, `payment_currency`, `estimated_delivery_date`, `warehouse_fee`, `note_caps`, `accounting_check_date`, `last_modified_by`, `time_dayon`

### Ví dụ URL

```
GET /orders?delivery_staff=Nguyễn Văn A&delivery_status=Giao Thành Công
GET /orders?team=Hà Nội&delivery_status=Giao Thành Công&payment_status=Có bill&delivery_staff=Staff1,Staff2&from_date=01/01/2026&to_date=31/01/2026
GET /orders?limit=1000&offset=0&from_date=01/01/2026&to_date=31/01/2026&date_column=created_at
```

---

## 2. GET /orders/export

### Mô tả

Export danh sách orders đã lọc ra file CSV hoặc Excel. Hỗ trợ tất cả các bộ lọc giống như endpoint `/orders`.

### Tham số

| Tham số | Kiểu | Mô tả | Ví dụ |
|---------|------|-------|-------|
| `format` | string | Định dạng file export (csv, excel) - mặc định: `csv` | `format=csv` |
| `from_date` | string | Ngày bắt đầu (dd/mm/yyyy) | `from_date=01/01/2026` |
| `to_date` | string | Ngày kết thúc (dd/mm/yyyy) | `to_date=31/01/2026` |
| `date_column` | string | Cột date để filter (mặc định: `order_date`) | `date_column=created_at` |

### Bộ lọc

Hỗ trợ tất cả các bộ lọc giống như endpoint `/orders` (xem phần 1).

### Ví dụ URL

```
GET /orders/export?format=csv&team=Hà Nội&delivery_status=Giao Thành Công&from_date=01/01/2026&to_date=31/01/2026
GET /orders/export?format=csv&delivery_staff=Nguyễn Văn A,Trần Văn B&payment_status=Có bill
```

---

## 3. GET /detail_reports

### Các cột trả về (Response Columns)

API trả về tất cả các cột từ bảng `detail_reports`. Các cột được chuẩn hóa về tên chuẩn:

| Tên cột chuẩn | Tên cột có thể có trong DB | Mô tả |
|---------------|----------------------------|-------|
| `id` | `id` | ID bản ghi |
| `ten` | `ten`, `name`, `Tên` | Tên nhân viên |
| `ngay` | `ngay`, `date`, `Ngày` | Ngày báo cáo |
| `ca` | `ca`, `shift`, `camkt` | Ca làm việc |
| `san_pham` | `san_pham`, `product`, `productmkt`, `Sản_phẩm` | Sản phẩm |
| `thi_truong` | `thi_truong`, `market`, `marketmkt`, `Thị_trường` | Thị trường |
| `team` | `team`, `Team`, `teammkt` | Team |
| `cpqc` | `cpqc`, `CPQC` | CPQC |
| `so_mess_cmt` | `so_mess_cmt`, `Số_Mess_Cmt` | Số Mess/Cmt |
| `phan_hoi` | `phan_hoi`, `Phản hồi`, `Phản_hồi`, `response_count`, `Số phản hồi`, `Số_phản_hồi` | Phản hồi |
| `so_don` | `so_don`, `Số đơn`, `Số_đơn` | Số đơn |
| `doanh_so` | `doanh_so`, `Doanh số`, `Doanh_số` | Doanh số |

### Tham số phân trang

| Tham số | Kiểu | Mô tả | Ví dụ |
|---------|------|-------|-------|
| `limit` | int (1-10000) | Số bản ghi tối đa (mặc định: 100) | `limit=1000` |
| `offset` | int (≥0) | Vị trí bắt đầu | `offset=0` |
| `after_id` | string | Cursor: id bản ghi cuối trang trước | `after_id=abc123` |

### Tham số lọc ngày tháng

| Tham số | Kiểu | Mô tả | Ví dụ |
|---------|------|-------|-------|
| `from_date` | string | Ngày bắt đầu (dd/mm/yyyy) | `from_date=01/02/2026` |
| `to_date` | string | Ngày kết thúc (dd/mm/yyyy) | `to_date=10/02/2026` |
| `date_column` | string | Cột date để filter (mặc định: `date`) | `date_column=ngay` |

### Bộ lọc (Filters)

Hỗ trợ nhiều giá trị cách nhau bởi dấu phẩy (`,`). Các alias được hỗ trợ:

#### Lọc theo nhân sự (ten)

| Tham số | Map tới cột | Ví dụ |
|---------|-------------|-------|
| `ten` | `ten` | `ten=Nguyễn Văn A` |
| `nhan_su` | `ten` | `nhan_su=Nguyễn Văn A` |
| `nhansu` | `ten` | `nhansu=Nguyễn Văn A` |
| `marketing_staff` | `ten` | `marketing_staff=Nguyễn Văn A` |
| `staff` | `ten` | `staff=Nguyễn Văn A` |
| `tennhanvien` | `ten` | `tennhanvien=Nguyễn Văn A` |

**Nhiều giá trị:** `nhan_su=Nguyễn Văn A,Trần Thị B`

#### Lọc theo ca (ca)

| Tham số | Map tới cột | Ví dụ |
|---------|-------------|-------|
| `ca` | `ca` | `ca=Morning` |
| `camkt` | `ca` | `camkt=Morning` |
| `shift` | `ca` | `shift=Morning` |

**Nhiều giá trị:** `ca=Morning,Evening`

#### Lọc theo sản phẩm (san_pham)

| Tham số | Map tới cột | Ví dụ |
|---------|-------------|-------|
| `san_pham` | `san_pham` | `san_pham=Product A` |
| `product` | `san_pham` | `product=Product A` |
| `productmkt` | `san_pham` | `productmkt=Product A` |
| `sanpham` | `san_pham` | `sanpham=Product A` |

**Nhiều giá trị:** `san_pham=Product A,Product B`

#### Lọc theo thị trường (thi_truong)

| Tham số | Map tới cột | Ví dụ |
|---------|-------------|-------|
| `thi_truong` | `thi_truong` | `thi_truong=Market A` |
| `market` | `thi_truong` | `market=Market A` |
| `marketmkt` | `thi_truong` | `marketmkt=Market A` |
| `thitruong` | `thi_truong` | `thitruong=Market A` |

**Nhiều giá trị:** `thi_truong=Market A,Market B`

#### Lọc theo team

| Tham số | Map tới cột | Ví dụ |
|---------|-------------|-------|
| `team` | `team` | `team=Team A` |
| `teammkt` | `team` | `teammkt=Team A` |

**Nhiều giá trị:** `team=Team A,Team B`

#### Lọc theo ngày (ngay)

| Tham số | Map tới cột | Ví dụ |
|---------|-------------|-------|
| `ngay` | `ngay` | `ngay=01/02/2026` |
| `date` | `ngay` | `date=01/02/2026` |
| `report_date` | `ngay` | `report_date=01/02/2026` |

**Nhiều giá trị:** `ngay=01/02/2026,02/02/2026`

### Ví dụ URL

```
GET /detail_reports?nhan_su=Nguyễn Văn A,Trần Thị B&from_date=01/02/2026&to_date=10/02/2026
GET /detail_reports?ten=Nguyễn Văn A&ca=Morning&san_pham=Product A&limit=1000
GET /detail_reports?marketing_staff=Nguyễn Văn A&shift=Morning&product=Product A&market=Market A&team=Team A
GET /detail_reports?from_date=01/02/2026&to_date=10/02/2026&limit=500&offset=0
```

---

## 4. GET /sales_reports

### Các cột trả về (Response Columns)

API trả về tất cả các cột từ bảng `sales_reports`. Các cột được chuẩn hóa về tên chuẩn:

| Tên cột chuẩn | Tên cột có thể có trong DB | Mô tả |
|---------------|----------------------------|-------|
| `id` | `id` | ID bản ghi |
| `ten` | `ten`, `name`, `Tên` | Tên nhân viên |
| `date` | `date`, `ngay`, `Ngày` | Ngày báo cáo |
| `ca` | `ca`, `shift`, `casle`, `camkt` | Ca làm việc |
| `san_pham` | `san_pham`, `product`, `productsale`, `productmkt`, `Sản_phẩm` | Sản phẩm |
| `thi_truong` | `thi_truong`, `market`, `marketsale`, `marketmkt`, `Thị_trường` | Thị trường |
| `team` | `team`, `Team`, `teamsale`, `teammkt` | Team |
| `cpqc` | `cpqc`, `CPQC` | CPQC |
| `so_mess_cmt` | `so_mess_cmt`, `Số_Mess_Cmt` | Số Mess/Cmt |

### Tham số phân trang

| Tham số | Kiểu | Mô tả | Ví dụ |
|---------|------|-------|-------|
| `limit` | int (1-10000) | Số bản ghi tối đa (mặc định: 100) | `limit=1000` |
| `offset` | int (≥0) | Vị trí bắt đầu | `offset=0` |
| `after_id` | string | Cursor: id bản ghi cuối trang trước | `after_id=abc123` |

### Tham số lọc ngày tháng

| Tham số | Kiểu | Mô tả | Ví dụ |
|---------|------|-------|-------|
| `from_date` | string | Ngày bắt đầu (dd/mm/yyyy) | `from_date=01/02/2026` |
| `to_date` | string | Ngày kết thúc (dd/mm/yyyy) | `to_date=10/02/2026` |
| `date_column` | string | Cột date để filter (mặc định: `ngay`) | `date_column=date` |

### Bộ lọc (Filters)

Hỗ trợ nhiều giá trị cách nhau bởi dấu phẩy (`,`). Các alias được hỗ trợ:

#### Lọc theo nhân sự (ten)

| Tham số | Map tới cột | Ví dụ |
|---------|-------------|-------|
| `ten` | `ten` | `ten=Nguyễn Văn A` |
| `nhan_su` | `ten` | `nhan_su=Nguyễn Văn A` |
| `nhansu` | `ten` | `nhansu=Nguyễn Văn A` |
| `marketing_staff` | `ten` | `marketing_staff=Nguyễn Văn A` |
| `staff` | `ten` | `staff=Nguyễn Văn A` |
| `tennhanvien` | `ten` | `tennhanvien=Nguyễn Văn A` |

**Nhiều giá trị:** `nhan_su=Nguyễn Văn A,Trần Thị B`

#### Lọc theo ca (ca)

| Tham số | Map tới cột | Ví dụ |
|---------|-------------|-------|
| `ca` | `ca` | `ca=Morning` |
| `casle` | `ca` | `casle=Morning` |
| `camkt` | `ca` | `camkt=Morning` |
| `shift` | `ca` | `shift=Morning` |

**Nhiều giá trị:** `ca=Morning,Evening`

#### Lọc theo sản phẩm (san_pham)

| Tham số | Map tới cột | Ví dụ |
|---------|-------------|-------|
| `san_pham` | `san_pham` | `san_pham=Product A` |
| `product` | `san_pham` | `product=Product A` |
| `productsale` | `san_pham` | `productsale=Product A` |
| `productmkt` | `san_pham` | `productmkt=Product A` |
| `sanpham` | `san_pham` | `sanpham=Product A` |

**Nhiều giá trị:** `san_pham=Product A,Product B`

#### Lọc theo thị trường (thi_truong)

| Tham số | Map tới cột | Ví dụ |
|---------|-------------|-------|
| `thi_truong` | `thi_truong` | `thi_truong=Market A` |
| `market` | `thi_truong` | `market=Market A` |
| `marketsale` | `thi_truong` | `marketsale=Market A` |
| `marketmkt` | `thi_truong` | `marketmkt=Market A` |
| `thitruong` | `thi_truong` | `thitruong=Market A` |

**Nhiều giá trị:** `thi_truong=Market A,Market B`

#### Lọc theo team

| Tham số | Map tới cột | Ví dụ |
|---------|-------------|-------|
| `team` | `team` | `team=Team A` |
| `teamsale` | `team` | `teamsale=Team A` |
| `teammkt` | `team` | `teammkt=Team A` |

**Nhiều giá trị:** `team=Team A,Team B`

#### Lọc theo ngày (date)

| Tham số | Map tới cột | Ví dụ |
|---------|-------------|-------|
| `date` | `date` | `date=01/02/2026` |
| `ngay` | `date` | `ngay=01/02/2026` |
| `report_date` | `date` | `report_date=01/02/2026` |

**Nhiều giá trị:** `date=01/02/2026,02/02/2026`

### Ví dụ URL

```
GET /sales_reports?teamsale=Team A&from_date=01/02/2026&to_date=10/02/2026&date_column=date
GET /sales_reports?ten=Nguyễn Văn A&casle=Morning&productsale=Product A&limit=1000
GET /sales_reports?marketing_staff=Nguyễn Văn A&shift=Morning&product=Product A&market=Market A&team=Team A
GET /sales_reports?from_date=01/02/2026&to_date=10/02/2026&limit=500&offset=0
```

---

## Lưu ý chung

### Định dạng ngày tháng

- Hỗ trợ định dạng: `dd/mm/yyyy`, `dd-mm-yyyy`, `yyyy-mm-dd`
- Ví dụ: `01/02/2026`, `01-02-2026`, `2026-02-01`

### Nhiều giá trị

- Tất cả các bộ lọc hỗ trợ nhiều giá trị, cách nhau bởi dấu phẩy (`,`)
- Ví dụ: `delivery_staff=Nguyễn Văn A,Trần Văn B` sẽ lọc các đơn hàng có `delivery_staff` là "Nguyễn Văn A" **HOẶC** "Trần Văn B"

### Phân trang

- **Offset-based:** Dùng `limit` và `offset` (ví dụ: `limit=100&offset=0`)
- **Cursor-based:** Dùng `limit` và `after_id` (ví dụ: `limit=100&after_id=abc123`)
- Giới hạn tối đa: **10,000 bản ghi** cho mỗi request

### Case-insensitive

- Tất cả các bộ lọc text đều không phân biệt hoa thường (case-insensitive)

### Encoding URL

- Khi sử dụng tiếng Việt hoặc ký tự đặc biệt trong URL, cần encode đúng cách
- Ví dụ: `Nguyễn Văn A` → `Nguyễn%20Văn%20A` hoặc `Nguy%E1%BB%85n%20V%C4%83n%20A`
