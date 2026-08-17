# Logic bảng BC Vận Hành (tab2)

Trang: [`/bao-cao-van-hanh?tab=tab2`](https://luminew-1db7.vercel.app/bao-cao-van-hanh?tab=tab2)

Mỗi **dòng ngang** = một bộ tiêu chí (khoảng ngày + sản phẩm + thị trường).  
Mỗi **cột / nhóm metric** = chỉ số cộng từ đơn đã lọc theo tiêu chí đó.

Code chính:

- UI: `src/pages/BaoCaoVanHanhHtml.jsx` (tab `tab2`)
- Công thức: `src/utils/baoCaoVanDonOperationalReport.js` → `aggregateOperationalReportSlice`
- Map đơn → virtual row: `mapOrderRowToVirtual` trong `BaoCaoVanHanhHtml.jsx`

## Nguồn dữ liệu

| Nguồn | Khi nào | Ghi chú |
| --- | --- | --- |
| `orders` | Nguồn chính khi tải theo ngày | Mỗi đơn → 1 virtual row (`_source: 'orders'`) |
| `bao_cao_van_don` | Có thể trộn / fallback | Histogram sẵn (`_source: 'bao_cao'`) |

Virtual row từ `orders` mang các histogram:

| Field ảo | Từ cột đơn |
| --- | --- |
| `_ket_qua_check` | `check_result` |
| `_trang_thai_giao_hang` | `delivery_status_nb` / `delivery_status` + key tổng hợp **Mã Tracking**, **Lên vận hành** |
| `_trang_thai_thanh_toan` | `payment_status` |
| `_tien_trang_thai_thanh_toan` | tiền theo key TT (chỉ «Có bill» full) |
| `_tong_tien_vnd` | tổng tiền hiển thị VNĐ |
| `_len_vh_don_vi` | `1` nếu `shipping_unit` khác rỗng, else `0` |

**Mã Tracking** = có `tracking_code`.  
**Lên vận hành** (ĐVVC) = có `shipping_unit`.

## Bộ lọc từng dòng (tiêu chí)

Hàm `filterSliceForCriteriaRow`:

1. **Ngày lên đơn** nằm trong `[startDate, endDate]` của dòng.
2. **Sản phẩm** (`Mặt hàng`) — nếu chọn.
3. **Thị trường** (`khu vực`) — nếu chọn.

Sau khi tải, dòng để trống sản phẩm/thị trường có thể **tách** thành nhiều dòng theo giá trị có trong data (`expandBcvhCriteriaRowsFromRawData`).  
Hàng **TỔNG** = gộp mọi slice của các dòng đang hiện.

## Nhóm cột trên bảng

### 1. Đã TT (bill)

| Metric | Công thức |
| --- | --- |
| SL | Số đơn có trạng thái TT chứa **Có bill** (không tính «Có bill 1 phần») |
| Tiền | `Σ` tiền theo key «Có bill» full (`_tien_trang_thai_thanh_toan`) |

`%` so với **TỔNG NB** (SL / DS tương ứng).

### 2. TỔNG NB — Tổng đơn Sale lên file nội bộ

| Metric | Công thức |
| --- | --- |
| SL | Đếm mọi đơn trong slice (mỗi row = 1) |
| DS | `Σ _tong_tien_vnd` |

### 3. LÊN VH — Tổng đơn lên vận hành

| Metric | Công thức |
| --- | --- |
| SL | **Đơn OK** (`check_result` = OK) **và** có ĐVVC: orders → `_len_vh_don_vi > 0`; bao_cao → bucket **Lên vận hành** > 0 |
| DS | `Σ _tong_tien_vnd` trên cùng tập đó |

`%` so với TỔNG NB.

### 4. CHƯA MÃ — Đã lên VH, trống mã, check OK

| Metric | Công thức |
| --- | --- |
| SL | Đã lên VH **và** không có mã tracking **và** Kết quả check = **OK** |
| DS | `Σ _tong_tien_vnd` trên tập đó |

### 5. TỶ LỆ

| Cột | Công thức |
| --- | --- |
| **VH/NB** | `100 × (SL lên VH) / (SL TỔNG NB)` |
| **TT/Phí** | `100 × (SL Đã TT bill) / (số đơn có mã tracking)` |
| **TT/Giao** | `100 × (SL Đã TT bill) / (Giao Thành Công)` |

Nếu mẫu số = 0 → không có tỷ lệ (`null`).

### 6. GIAO HÀNG NB — Trạng thái giao hàng

Đếm theo **Trạng thái giao hàng NB** (bỏ key tổng hợp Mã Tracking / Lên vận hành). Bucket:

| Cột UI | Nhãn bucket |
| --- | --- |
| Giao TC | `Giao Thành Công` (gồm cả nhãn chứa «Đơn thành công») |
| Đang giao | `Đang Giao` |
| Chưa giao | `Chưa Giao` |
| Hoàn | `Hoàn` |
| Hủy VH | `Hủy` (huỷ / hủy / cancel) |
| Chờ check | `chờ check` |
| TT giao NB | `Σ` mọi giá trị trong `_tien_trang_thai_thanh_toan` |

SL các cột trạng thái: `%` / TỔNG NB SL.  
TT giao NB: `%` / TỔNG NB DS.

### 7. KẾT QUẢ CHECK — Tổng đơn theo check

Mỗi đơn tối đa **1 lần** mỗi cột nếu match nhãn (không phụ thuộc ĐVVC):

| Cột UI | Điều kiện `check_result` (đã bỏ dấu, lowercase) |
| --- | --- |
| Huỷ NB | chứa `huy` |
| Đợi hàng | chứa `doi hang` |
| Khách hẹn | chứa `khach hen` hoặc (`hen` và `khach`) |
| Treo | đúng / bắt đầu bằng `treo` (không đếm «Không treo») |
| VĐ XL | chứa `van don xl` hoặc từ `xl` |
| OK chưa mã | check = `ok` **và** chưa có mã tracking |

### 8. THU TIỀN — Trạng thái thu tiền

Gán key `payment_status` vào cột đầu tiên khớp (theo thứ tự):

| Cột | Match |
| --- | --- |
| Bom_bùng_chặn | bom / bùng / chặn |
| Hẹn thanh toán | hẹn thanh toán |
| Khó Đòi | khó đòi |
| Hoàn Hàng | hoàn hàng (không phải phí hoàn) |
| Không nhận được hàng | không nhận được hàng |
| Không phản hồi dưới 3N | không ph… |
| KPH nhiều ngày | kph… nhiều ngày |
| Thanh toán phí hoàn | phí hoàn / thanh toán phí hoàn |

Key không khớp → `__other` (không hiện cột riêng trên UI tab2).

## Tóm tắt nhanh các định nghĩa hay nhầm

| Khái niệm | Định nghĩa đúng trên tab2 |
| --- | --- |
| Tổng NB | Mọi đơn trong bộ lọc dòng |
| Lên VH | Check **OK** + có **shipping_unit** (ĐVVC) |
| Có mã | Có **tracking_code** |
| Chưa mã | Đã lên VH + không mã + check OK |
| Đã TT (bill) | «Có bill» full, **không** gồm bill 1 phần |
| Hủy VH | Trạng thái **giao hàng** = Hủy |
| Huỷ NB | Kết quả **check** chứa huỷ |

## Khác với docs cũ `BAO_CAO_VAN_DON_LOGIC.md`

File cũ mô tả `BaoCaoVanDon` / `reportStats` (điều kiện đẩy VH = có bill…).  
**Tab2 hiện tại** dùng `aggregateOperationalReportSlice`: **lên VH = Đơn OK + có ĐVVC**, không bắt buộc có bill.
