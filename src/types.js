export const PRIMARY_KEY_COLUMN = "Mã đơn hàng";
export const SETTINGS_KEY = 'system_settings';
export const TEAM_COLUMN_NAME = "Team";

// --- VIEW 1: ORDER MANAGEMENT COLUMNS (Original) ---
export const ORDER_MGMT_COLUMNS = [
    "STT", "Mã đơn hàng", "Ngày lên đơn", "Name*", "Phone*", "Add", "City", "State",
    "Khu vực", "Zipcode", "Mặt hàng", "Tên mặt hàng 1", "Số lượng mặt hàng 1",
    "Tên mặt hàng 2", "Số lượng mặt hàng 2", "Quà tặng", "Số lượng quà kèm", "Giá bán",
    "Loại tiền thanh toán", "Tổng tiền VNĐ", "Hình thức thanh toán", "Ghi chú",
    "Ghi chú vận đơn", "Kết quả Check", "Mã Tracking", "Ngày đóng hàng",
    "Trạng thái giao hàng", "GHI CHÚ", "Thời gian giao dự kiến",
    "Ngày Kế toán đối soát với FFM lần 2", "Ngày đẩy đơn", "Ngày có mã tracking",
    "Ngày đối soát kế toán", "Phí xử lý đơn đóng hàng-Lưu kho(usd)",
    "Payment Bill", "Payment Image", "Lịch sử thay đổi"
];

/**
 * Cột được sửa / dán / fill trên lưới FFM (MGT, T&T, MGT HCM): toàn bộ cột quản lý đơn có thể map xuống DB,
 * trừ STT, mã đơn (không đổi khóa dòng), «Lịch sử thay đổi» (chỉ đọc). Thêm alias «Kết quả check».
 */
export const FFM_GRID_EDITABLE_COLUMNS = new Set([
    ...ORDER_MGMT_COLUMNS.filter(
        (c) => c !== "STT" && c !== PRIMARY_KEY_COLUMN && c !== "Lịch sử thay đổi"
    ),
    "Kết quả check",
    "Kết quả",
]);

// --- VIEW 2: BILL OF LADING COLUMNS (New) ---
export const BILL_LADING_COLUMNS = [
    "Mã đơn hàng", "Kết quả Check", "Trạng thái giao hàng NB", "Lý do",
    "Trạng thái thu tiền", "Ghi chú của VĐ", "Ngày lên đơn", "Cảnh báo trùng", "Name*", "Phone*", "Add",
    "City", "State", "Khu vực", "Zipcode", "Mặt hàng", "Tên mặt hàng 1", "Số lượng mặt hàng 1",
    "Tên mặt hàng 2", "Số lượng mặt hàng 2", "Quà tặng", "Số lượng quà kèm", "Giá bán",
    "Loại tiền thanh toán", "Tổng tiền VNĐ", "Hình thức thanh toán", "Ghi chú",
    "Mã Tracking", "Ngày đóng hàng", "Trạng thái giao hàng", "Thời gian giao dự kiến",
    "Ngày đối soát kế toán", "Phí xử lý đơn đóng hàng-Lưu kho(usd)", "GHI CHÚ",
    "Nhân viên Sale", "Nhân viên MKT", "Page", "NV Vận đơn", "Đơn vị vận chuyển", "Số tiền của đơn hàng đã về TK Cty",
    "Kế toán xác nhận thu tiền về", "Ngày Kế toán đối soát với FFM lần 2",
    "Ngày up bill", "Tiền đã thanh toán",
    "Nhật ký", "Lịch sử thay đổi"
];

// --- DEFAULT COLUMNS (Bill of Lading) ---
export const DEFAULT_BILL_LADING_COLUMNS = [
    "Mã đơn hàng", "Kết quả Check", "Ngày lên đơn", "Cảnh báo trùng", "Name*", "Phone*", "Add", "City", "State",
    "Mặt hàng", "Tổng tiền VNĐ", "Trạng thái giao hàng NB",
    "Mã Tracking", "Lý do", "Ghi chú của VĐ", "Trạng thái thu tiền", "Nhân viên MKT", "Page", "Nhật ký", "Lịch sử thay đổi"
];

/**
 * Danh mục trạng thái giao dùng chung cho mọi dropdown «Trạng thái giao hàng» / «Trạng thái giao hàng NB»
 * (Vận đơn, FFM, Thêm nhanh, v.v.). Chỉ giữ các nhãn viết thường có dấu, bỏ các biến thể viết HOA.
 * Lưu DB: FFM → `delivery_status`, vận đơn NB → `delivery_status_nb` (hiển thị NB không fallback sang FFM).
 */
export const DELIVERY_STATUS_PRESETS = Object.freeze([
    "",
    "Giao Thành Công",
    "Đang Giao",
    "Chưa Giao",
    "Hủy",
    "Hoàn",
    "chờ check",
    "Giao không thành công",
    "Bom_Thất Lạc",
]);

// Specific dropdown options for columns defined in the HTML
export const DROPDOWN_OPTIONS = {
    "Kết quả Check": ["", "OK", "Huỷ", "Treo", "Vận đơn XL", "Đợi hàng", "Khách hẹn", "Chờ check lại", "Sai SĐT", "Sai địa chỉ", "Khác"],
    "Trạng thái giao hàng NB": DELIVERY_STATUS_PRESETS,
    "Trạng thái thu tiền": ["", "Có bill", "Có bill 1 phần", "Bom_bùng_chặn", "Hẹn Thanh Toán", "Hoàn Hàng", "Khó Đòi", "Không nhận được hàng", "Không PH dưới 3N", "Thanh toán phí hoàn", "KPH nhiều ngày"],
    "Trạng thái giao hàng": DELIVERY_STATUS_PRESETS,
    "Payment Bill": ["", "Có bill", "Bill một phần"],
    "Trạng thái cskh": ["", "Chặn", "Đã có người xử lý", "Đã lênđơn mới", "Đã xử lý", "Khách chặn", "Không thấy mess", "Nhận hàng chưa tt"]
};

// Columns that are editable directly
export const EDITABLE_COLS = [
    "Kết quả Check", "Trạng thái giao hàng NB", "Mã Tracking", "Lý do",
    "Trạng thái thu tiền", "Ghi chú của VĐ", "Ghi chú", "Ngày đóng hàng",
    "Trạng thái giao hàng", "Thời gian giao dự kiến", "Ngày đối soát kế toán",
    "Phí xử lý đơn đóng hàng-Lưu kho(usd)", "GHI CHÚ", "Đơn vị vận chuyển",
    "Ngày Kế toán đối soát với FFM lần 2", "Ghi chú vận đơn",
    // Thêm các cột khách hàng để có thể paste
    "Name*", "Phone*", "Add", "City", "State", "Zipcode", "Khu vực", "Mặt hàng", "Page",
    "Tên mặt hàng 1", "Số lượng mặt hàng 1", "Tên mặt hàng 2", "Số lượng mặt hàng 2",
    "Quà tặng", "Số lượng quà kèm", "Giá bán", "Loại tiền thanh toán", "Tổng tiền VNĐ",
    "Hình thức thanh toán",
    // Cột bill
    "Payment Bill", "Payment Image",
    // Cột CSKH
    "Trạng thái cskh",
    /** JSONB orders.log — hiển thị dạng text trên lưới; lưu qua API merge mảng */
    "Nhật ký"
];

// Columns that expand with Ctrl+Enter
export const LONG_TEXT_COLS = [
    "Lý do",
    "Ghi chú của VĐ",
    "Ghi chú vận đơn",
    "Ghi chú",
    "GHI CHÚ",
    "Nhật ký",
    "Cảnh báo trùng"
];

export const COLUMN_MAPPING = {
    /** Hiển thị & lưu theo cột NB (vận đơn); trùng khóa dữ liệu với «Trạng thái giao hàng NB» khi cả hai có trên lưới. */
    "Trạng thái giao hàng": "Trạng thái giao hàng NB",
    "Ghi chú vận đơn": "Ghi chú của VĐ",
    "Kết quả check": "Kết quả Check",
    "khu vực": "Khu vực",
    "Ngày up bill": "ngayupbill",
    "Nhân viên Sale": "sale_staff",
    "Nhân viên MKT": "marketing_staff",
    "Tên Page": "page_name",
    "Tiền đã thanh toán": "reconciled_vnd",
    "Trạng thái thu tiền": "payment_status",
    "Đội/Team": "team",
    "Địa chỉ": "customer_address",
    "Thành phố": "city",
    "Tỉnh/Bang": "state",
    "Mã bưu điện": "zipcode",
    "Trạng thái Bill": "payment_bill",
    "Ảnh thanh toán": "payment_image",
    "Trạng thái giao hàng NB": "delivery_status_nb",
    "Trạng thái thanh toán": "payment_status"
};

// Columns used by Quick Add modal in FFM (single source of truth).
// Keep this array order in sync with paste/sync behavior.
export const FFM_QUICK_ADD_COLUMNS = [
    "Mã đơn hàng",
    "Mã Tracking",
    "Ngày đóng hàng",
    "Trạng thái giao hàng",
    "GHI CHÚ",
    "Thời gian giao dự kiến",
    "Ngày đối soát kế toán"
];
