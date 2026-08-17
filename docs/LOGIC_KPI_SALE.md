# Logic bảng KPIs Sale

Tab **KPIs Sale** trên `/xem-bao-cao-sale`. Bảng nằm trong iframe `public/baocao-vandon-nv/KPISale.html` (`table=orders`, `dept=Sale`). Bộ lọc ngày / team / tên / sản phẩm / thị trường lấy từ thanh trái trang cha.

Đây **không** phải bảng `sales_reports` (Sale ok / Sale sau huỷ). Mỗi dòng là **một nhân viên Sale**, số liệu cộng từ **đơn hàng**.

## Nguồn dữ liệu

| Nguồn | Bảng | Dùng để |
| --- | --- | --- |
| Đơn hàng | `orders` | Mọi cột số: chốt, hủy, đi, thu tiền, ship |
| Nhân sự | `users` (HR) | Danh sách dòng: tên, team, bộ phận = Sale |
| Báo cáo MKT | `detail_reports` | Cột CPQC (ẩn khi embed trong Xem báo cáo Sale) |

Ghép đơn với nhân viên: tên trên đơn cột **Nhân viên Sale** khớp tên HR (không phân biệt hoa thường, gộp khoảng trắng). Chỉ cộng đơn nếu tên đó có trong danh sách HR bộ phận Sale và có **Team** khác rỗng.

## Điều kiện lấy đơn

Đơn được tính khi thỏa **tất cả**:

1. **Ngày lên đơn** nằm trong khoảng ngày đang lọc.
2. Có cột **Ca** thì phải chứa **Hết ca**. Không có cột Ca thì bỏ qua điều kiện này.
3. Khớp bộ lọc sản phẩm (**Mặt hàng**), thị trường (**Khu vực**), team / tên nhân viên (từ HR).
4. Checkbox **Bao gồm đơn ship = 0** (mặc định bật). Tắt thì loại đơn `shipping_cost` / Phí cước = 0.

Mỗi đơn chỉ cộng **một lần** cho cùng một Sale (không nhân đôi nếu tên xuất hiện nhiều cột).

## Công thức từng cột

Giá trị trên một đơn:

- `tongTien` = **Tổng tiền VNĐ**
- `isHuy` = **Kết quả Check** đúng bằng `Huỷ` (khớp nguyên chuỗi)
- `isDi` = **Mã Tracking** khác rỗng
- `tienVietDoiSoat` = **Tiền Việt đã đối soát**
- `ship` = **Phí cước** / `shipping_cost` (không lấy phí ship text/ngày)

| Cột trên bảng | Ý nghĩa | Công thức |
| --- | --- | --- |
| **Chốt → Đơn** | Số đơn chốt | Đếm mọi đơn đã lọc của Sale đó |
| **Chốt → DS chốt** | Doanh số chốt | `Σ Tổng tiền VNĐ` |
| **Hủy → Đơn** | Số đơn hủy | Đếm đơn có `Kết quả Check = Huỷ` |
| **Hủy → DS hủy** | Doanh số hủy | `Σ Tổng tiền VNĐ` của đơn hủy |
| **Sau hủy → Đơn** | Đơn còn lại sau hủy | `max(0, Đơn chốt − Đơn hủy)` |
| **Sau hủy → DS sau hủy** | DS còn lại sau hủy | `max(0, DS chốt − DS hủy)` |
| **Đi → Đơn** | Đơn đã có mã vận | Có **Mã Tracking** và **không** phải đơn hủy |
| **Đi → DS đi** | DS đơn đã đi | `Σ Tổng tiền VNĐ` của đơn đi (loại hủy) |
| **Thu tiền → Đơn** | Số đơn đã đối soát tiền | `Tiền Việt đã đối soát > 0` |
| **Thu tiền → DThu TC** | Doanh thu thành công | `Σ Tiền Việt đã đối soát` (chỉ đơn > 0) |
| **Ship** | Phí ship | `Σ Phí cước` của đơn đi (không tính đơn hủy) |
| **DThu KPI** | Doanh thu tính KPI | `DThu TC − Ship` |
| **Tỷ lệ thu** | Tỷ lệ thu tiền | `DThu TC / DS đi` (nếu DS đi = 0 thì `0`) |

**Không** yêu cầu `Kết quả Check = OK` cho cột Đi. **Không** yêu cầu Kế toán xác nhận thu tiền cho cột Thu tiền.

### Ví dụ (một nhân viên)

- Đơn chốt = 93, Đơn hủy = 1 → Đơn sau hủy = 92
- DS chốt = 434.975.420đ, DS hủy = 5.355.000đ → DS sau hủy = 429.620.420đ

## Hàng TỔNG CỘNG

Cộng các cột số của **các dòng đang hiện**. Riêng **Tỷ lệ thu** tính lại trên tổng:

`Tỷ lệ thu tổng = (Σ DThu TC) / (Σ DS đi)`

không phải trung bình tỷ lệ từng người.

## Ai được hiện trên bảng

1. Lấy nhân sự HR **Bộ phận = Sale**, có **Team**.
2. Ẩn team **Đã nghỉ** trừ khi chọn đúng team đó trên bộ lọc.
3. Ẩn người mọi chỉ số = 0 (không đơn, không DS, không CPQC).
4. Sắp xếp: Team (vi) → Tên (vi). STT đánh lại sau khi lọc.

Khi embed tab KPIs Sale: cột **CPQC** và **%CP/DT** ẩn; bộ lọc local trong iframe ẩn, dùng thanh trái trang cha.
