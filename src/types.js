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
    "Payment Bill", "Payment Image"
];

// --- VIEW 2: BILL OF LADING COLUMNS (New) ---
export const BILL_LADING_COLUMNS = [
    "Mã đơn hàng", "Kết quả Check", "Trạng thái giao hàng NB", "Lý do",
    "Trạng thái thu tiền", "Ghi chú của VĐ", "Ngày lên đơn", "Name*", "Phone*", "Add",
    "City", "State", "Khu vực", "Zipcode", "Mặt hàng", "Tên mặt hàng 1", "Số lượng mặt hàng 1",
    "Tên mặt hàng 2", "Số lượng mặt hàng 2", "Quà tặng", "Số lượng quà kèm", "Giá bán",
    "Loại tiền thanh toán", "Tổng tiền VNĐ", "Hình thức thanh toán", "Ghi chú",
    "Mã Tracking", "Ngày đóng hàng", "Trạng thái giao hàng", "Thời gian giao dự kiến",
    "Ngày đối soát kế toán", "Phí xử lý đơn đóng hàng-Lưu kho(usd)", "GHI CHÚ",
    "Nhân viên Sale", "Nhân viên MKT", "NV Vận đơn", "Đơn vị vận chuyển", "Số tiền của đơn hàng đã về TK Cty",
    "Kế toán xác nhận thu tiền về", "Ngày Kế toán đối soát với FFM lần 2",
    "Ngày up bill", "Tiền đã thanh toán"
];

// --- DEFAULT COLUMNS (Bill of Lading) ---
export const DEFAULT_BILL_LADING_COLUMNS = [
    "Mã đơn hàng", "Kết quả Check", "Ngày lên đơn", "Name*", "Phone*", "Add", "City", "State",
    "Mặt hàng", "Tổng tiền VNĐ", "Trạng thái giao hàng NB",
    "Mã Tracking", "Lý do", "Ghi chú của VĐ", "Trạng thái thu tiền", "Nhân viên MKT"
];

// Specific dropdown options for columns defined in the HTML
export const DROPDOWN_OPTIONS = {
    "Kết quả Check": ["", "OK", "Huỷ", "Treo", "Vận đơn XL", "Đợi hàng", "Khách hẹn", "Chờ check lại", "Sai SĐT", "Sai địa chỉ", "Khác"],
    "Trạng thái giao hàng NB": ["", "Giao Thành Công", "Đang Giao", "Chưa Giao", "Hủy", "Hoàn", "chờ check", "Giao không thành công", "Bom_Thất Lạc"],
    "Trạng thái thu tiền": ["", "Có bill", "Có bill 1 phần", "Bom_bùng_chặn", "Hẹn Thanh Toán", "Hoàn Hàng", "Khó Đòi", "Không nhận được hàng", "Không PH dưới 3N", "Thanh toán phí hoàn", "KPH nhiều ngày"],
    "Trạng thái giao hàng": ["", "NHÃN", "ĐANG GIAO", "ĐÃ GIAO", "HOÀN"],
    "Payment Bill": ["", "Có bill", "Bill một phần"],
    "Trạng thái cskh": ["", "Chặn", "Đã có người xử lý", "Đã lênđơn mới", "Đã xử lý", "Khách chặn", "Không thấy mess"]
};

// Columns that are editable directly
export const EDITABLE_COLS = [
    "Kết quả Check", "Trạng thái giao hàng NB", "Mã Tracking", "Lý do",
    "Trạng thái thu tiền", "Ghi chú của VĐ", "Ghi chú", "Ngày đóng hàng",
    "Trạng thái giao hàng", "Thời gian giao dự kiến", "Ngày đối soát kế toán",
    "Phí xử lý đơn đóng hàng-Lưu kho(usd)", "GHI CHÚ", "Đơn vị vận chuyển",
    "Ngày Kế toán đối soát với FFM lần 2", "Ghi chú vận đơn",
    // Thêm các cột khách hàng để có thể paste
    "Name*", "Phone*", "Add", "City", "State", "Zipcode", "Khu vực", "Mặt hàng",
    "Tên mặt hàng 1", "Số lượng mặt hàng 1", "Tên mặt hàng 2", "Số lượng mặt hàng 2",
    "Quà tặng", "Số lượng quà kèm", "Giá bán", "Loại tiền thanh toán", "Tổng tiền VNĐ",
    "Hình thức thanh toán",
    // Cột bill
    "Payment Bill", "Payment Image",
    // Cột CSKH
    "Trạng thái cskh"
];

// Columns that expand with Ctrl+Enter
export const LONG_TEXT_COLS = ["Lý do", "Ghi chú của VĐ", "Ghi chú", "GHI CHÚ"];

export const COLUMN_MAPPING = {
    "Ghi chú vận đơn": "Ghi chú của VĐ",
    "Kết quả check": "Kết quả Check",
    "khu vực": "Khu vực",
    "Payment Bill": "payment_bill",
    "Payment Image": "payment_image",
    "Ngày up bill": "ngayupbill",
    "Nhân viên Sale": "sale_staff",
    "Nhân viên MKT": "marketing_staff",
    "Tiền đã thanh toán": "reconciled_vnd"
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
    "Ngày đối soát kế toán",
    "Phí xử lý đơn đóng hàng-Lưu kho(usd)"
];
