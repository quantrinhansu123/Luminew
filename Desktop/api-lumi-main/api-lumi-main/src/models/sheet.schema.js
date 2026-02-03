// Schema cho các bảng Google Sheets
export const SHEET_SCHEMAS = {
  'F3': {
    name: 'F3',
    columns: [
      { key: 'Mã đơn hàng', header: 'Mã đơn hàng', type: 'string', required: true },
      { key: 'Mã Tracking', header: 'Mã Tracking', type: 'string' },
      { key: 'Ngày lên đơn', header: 'Ngày lên đơn', type: 'date' },
      { key: 'Name*', header: 'Name*', type: 'string', required: true },
      { key: 'Phone*', header: 'Phone*', type: 'string', required: true },
      { key: 'Add', header: 'Add', type: 'string' },
      { key: 'City', header: 'City', type: 'string' },
      { key: 'State', header: 'State', type: 'string' },
      { key: 'Zipcode', header: 'Zipcode', type: 'string' },
      { key: 'Mặt hàng', header: 'Mặt hàng', type: 'string' },
      { key: 'Tên mặt hàng 1', header: 'Tên mặt hàng 1', type: 'string' },
      { key: 'Số lượng mặt hàng 1', header: 'Số lượng mặt hàng 1', type: 'number' },
      { key: 'Tên mặt hàng 2', header: 'Tên mặt hàng 2', type: 'string' },
      { key: 'Số lượng mặt hàng 2', header: 'Số lượng mặt hàng 2', type: 'number' },
      { key: 'Quà tặng', header: 'Quà tặng', type: 'string' },
      { key: 'Số lượng quà kèm', header: 'Số lượng quà kèm', type: 'number' },
      { key: 'Giá bán', header: 'Giá bán', type: 'number' },
      { key: 'Loại tiền thanh toán', header: 'Loại tiền thanh toán', type: 'string' },
      { key: 'Tổng tiền VNĐ', header: 'Tổng tiền VNĐ', type: 'number' },
      { key: 'Hình thức thanh toán', header: 'Hình thức thanh toán', type: 'string' },
      { key: 'Ghi chú', header: 'Ghi chú', type: 'text' },
      { key: 'Nhân viên Sale', header: 'Nhân viên Sale', type: 'string' },
      { key: 'Nhân viên Marketing', header: 'Nhân viên Marketing', type: 'string' },
      { key: 'NV Vận đơn', header: 'NV Vận đơn', type: 'string' },
      { key: 'Kết quả Check', header: 'Kết quả Check', type: 'string' },
      { key: 'Trạng thái giao hàng NB', header: 'Trạng thái giao hàng NB', type: 'string' },
      { key: 'Lý do', header: 'Lý do', type: 'string' },
      { key: 'Đơn vị vận chuyển', header: 'Đơn vị vận chuyển', type: 'string' },
      { key: 'Trạng thái thu tiền', header: 'Trạng thái thu tiền', type: 'string' },
      { key: 'Ngày hẹn đẩy đơn', header: 'Ngày hẹn đẩy đơn', type: 'date' },
      { key: 'Số tiền thực thu', header: 'Số tiền thực thu', type: 'number' },
      { key: 'Ngày Up bill', header: 'Ngày Up bill', type: 'date' },
      { key: 'Ảnh bill', header: 'Ảnh bill', type: 'string' },
      { key: 'Ngày chuyển khoản', header: 'Ngày chuyển khoản', type: 'date' },
      { key: 'Loại thanh toán', header: 'Loại thanh toán', type: 'string' },
      { key: 'Tên người chuyển khoản', header: 'Tên người chuyển khoản', type: 'string' },
      { key: 'Tài khoản nhận', header: 'Tài khoản nhận', type: 'string' },
      { key: 'Số tiền đã nhận', header: 'Số tiền đã nhận', type: 'number' },
      { key: 'Tỷ giá cước', header: 'Tỷ giá cước', type: 'number' },
      { key: 'Đơn vị tiền đối soát', header: 'Đơn vị tiền đối soát', type: 'string' },
      { key: 'Ngày đối soát cước', header: 'Ngày đối soát cước', type: 'date' },
      { key: 'Tiền ship', header: 'Tiền ship', type: 'number' },
      { key: 'Tỷ giá', header: 'Tỷ giá', type: 'number' },
      { key: 'Đơn vị tiền tệ tính cước', header: 'Đơn vị tiền tệ tính cước', type: 'string' },
      { key: 'Thời gian lên đơn', header: 'Thời gian lên đơn', type: 'datetime' },
      { key: 'Ghi chú của FFM', header: 'Ghi chú của FFM', type: 'text' },
      { key: 'FFM thanh toán', header: 'FFM thanh toán', type: 'string' },
      { key: 'Ngày đối soát bill', header: 'Ngày đối soát bill', type: 'date' },
      { key: 'Ngày Kế toán đối soát với FFM lần 1', header: 'Ngày Kế toán đối soát với FFM lần 1', type: 'datetime' },
      { key: 'Số tiền về TK Cty từ FFM lần 1', header: 'Số tiền về TK Cty từ FFM lần 1', type: 'number' },
      { key: 'Ngày Kế toán đối soát với FFM lần 2', header: 'Ngày Kế toán đối soát với FFM lần 2', type: 'datetime' },
      { key: 'Tiền Việt đã đối soát', header: 'Tiền Việt đã đối soát', type: 'number' },
      { key: 'Ngày Kế toán đối soát với FFM lần 3', header: 'Ngày Kế toán đối soát với FFM lần 3', type: 'datetime' },
      { key: 'Ca', header: 'Ca', type: 'string' },
      { key: 'Tổng số tiền từ FFM', header: 'Tổng số tiền từ FFM', type: 'number' },
      { key: 'Số tiền về TK Cty ngoài FFM', header: 'Số tiền về TK Cty ngoài FFM', type: 'datetime' },
      { key: 'Số tiền của đơn hàng đã về TK Cty', header: 'Số tiền của đơn hàng đã về TK Cty', type: 'datetime' },
      { key: 'Kế toán xác nhận thu tiền về', header: 'Kế toán xác nhận thu tiền về', type: 'datetime' },
      { key: 'Thông tin đơn', header: 'Thông tin đơn', type: 'text' },
      { key: 'Thông tin khách hàng', header: 'Thông tin khách hàng', type: 'text' },
      { key: 'Thông tin nhân sự', header: 'Thông tin nhân sự', type: 'text' },
      { key: 'Phản hồi tích cực', header: 'Phản hồi tích cực', type: 'text' },
      { key: 'Phản hồi tiêu cực', header: 'Phản hồi tiêu cực', type: 'text' },
      { key: 'Count', header: 'Count', type: 'number' },
      { key: 'Phân loại KH', header: 'Phân loại KH', type: 'string' },
      { key: 'Xác nhận đơn', header: 'Xác nhận đơn', type: 'string' },
      { key: 'Diễn giải', header: 'Diễn giải', type: 'text' },
      { key: 'Tên page', header: 'Tên page', type: 'string' },
      { key: 'Giá gốc', header: 'Giá gốc', type: 'number' },
      { key: 'Màu backlist', header: 'Màu backlist', type: 'string' },
      { key: 'Trạng thái đơn', header: 'Trạng thái đơn', type: 'string' },
      { key: 'Tiền chiết khấu', header: 'Tiền chiết khấu', type: 'number' },
      { key: 'Phí ship', header: 'Phí ship', type: 'number' },
      { key: 'Tiền sau ship', header: 'Tiền sau ship', type: 'number' },
      { key: 'Tên lên đơn', header: 'Tên lên đơn', type: 'string' },
      { key: 'Tạo bản in', header: 'Tạo bản in', type: 'string' },
      { key: 'In', header: 'In', type: 'string' },
      { key: 'Cảnh báo Blacklist, Trùng đơn', header: 'Cảnh báo Blacklist, Trùng đơn', type: 'text' },
      { key: 'Khu vực', header: 'Khu vực', type: 'string' },
      { key: 'Phí lưu kho', header: 'Phí lưu kho', type: 'number' },
      { key: 'Team', header: 'Team', type: 'string' },
      { key: 'Mã check', header: 'Mã check', type: 'string' },
      { key: 'Ghi chú của BEE', header: 'Ghi chú của BEE', type: 'text' },
      { key: 'Đánh dấu', header: 'Đánh dấu', type: 'string' },
      { key: 'Ngày đóng hàng', header: 'Ngày đóng hàng', type: 'date' },
      { key: 'Trạng thái giao hàng', header: 'Trạng thái giao hàng', type: 'string' },
      { key: 'Thời gian giao dự kiến', header: 'Thời gian giao dự kiến', type: 'string' },
      { key: 'Phí ship nội địa Mỹ (usd)', header: 'Phí ship nội địa Mỹ (usd)', type: 'string' },
      { key: 'Phí xử lý đơn đóng hàng-Lưu kho(usd)', header: 'Phí xử lý đơn đóng hàng-Lưu kho(usd)', type: 'string' },
      { key: 'GHI CHÚ', header: 'GHI CHÚ', type: 'text' },
      { key: 'Ngày đối soát', header: 'Ngày đối soát', type: 'date' },
      { key: 'Time kế toán xác nhận', header: 'Time kế toán xác nhận', type: 'time' },
      { key: 'Ghi chú của VĐ', header: 'Ghi chú của VĐ', type: 'text' },
      { key: 'Đơn vị thanh toán', header: 'Đơn vị thanh toán', type: 'string' },
      { key: 'Tài khoản thanh toán', header: 'Tài khoản thanh toán', type: 'string' },
      { key: 'Update', header: 'Update', type: 'string' },
      { key: 'Trạng thái dvvc', header: 'Trạng thái dvvc', type: 'string' },
      { key: 'Nhập kho', header: 'Nhập kho', type: 'string' },
      { key: 'Tổng phí vc', header: 'Tổng phí vc', type: 'number' },
      { key: 'Tiền cước', header: 'Tiền cước', type: 'number' },
      { key: 'Số tiền đối soát', header: 'Số tiền đối soát', type: 'number' },
      { key: 'maDonHang', header: 'maDonHang', type: 'string' },
      { key: 'SST đơn MKT', header: 'SST đơn MKT', type: 'string' },
      { key: 'CSKH', header: 'CSKH', type: 'string' },
      { key: 'Thời gian cutoff', header: 'Thời gian cutoff', type: 'date' }
    ]
  },
  'MGT nội bộ': {
    name: 'MGT nội bộ',
    columns: [
      { key: 'Mã đơn hàng', header: 'Mã đơn hàng', type: 'string', required: true }
    ]
  },
  'F3 test': {
    name: 'F3 test',
    columns: [
      { key: 'Mã đơn hàng', header: 'Mã đơn hàng', type: 'string', required: true },
      { key: 'Mã Tracking', header: 'Mã Tracking', type: 'string' },
      { key: 'Ngày lên đơn', header: 'Ngày lên đơn', type: 'date' },
      { key: 'Name*', header: 'Name*', type: 'string', required: true },
      { key: 'Phone*', header: 'Phone*', type: 'string', required: true },
      { key: 'Add', header: 'Add', type: 'string' },
      { key: 'City', header: 'City', type: 'string' },
      { key: 'State', header: 'State', type: 'string' },
      { key: 'Zipcode', header: 'Zipcode', type: 'string' },
      { key: 'Mặt hàng', header: 'Mặt hàng', type: 'string' },
      { key: 'Tên mặt hàng 1', header: 'Tên mặt hàng 1', type: 'string' },
      { key: 'Số lượng mặt hàng 1', header: 'Số lượng mặt hàng 1', type: 'number' },
      { key: 'Tên mặt hàng 2', header: 'Tên mặt hàng 2', type: 'string' },
      { key: 'Số lượng mặt hàng 2', header: 'Số lượng mặt hàng 2', type: 'number' },
      { key: 'Quà tặng', header: 'Quà tặng', type: 'string' },
      { key: 'Số lượng quà kèm', header: 'Số lượng quà kèm', type: 'number' },
      { key: 'Giá bán', header: 'Giá bán', type: 'number' },
      { key: 'Loại tiền thanh toán', header: 'Loại tiền thanh toán', type: 'string' },
      { key: 'Tổng tiền VNĐ', header: 'Tổng tiền VNĐ', type: 'number' },
      { key: 'Hình thức thanh toán', header: 'Hình thức thanh toán', type: 'string' },
      { key: 'Ghi chú', header: 'Ghi chú', type: 'text' },
      { key: 'Nhân viên Sale', header: 'Nhân viên Sale', type: 'string' },
      { key: 'Nhân viên Marketing', header: 'Nhân viên Marketing', type: 'string' },
      { key: 'NV Vận đơn', header: 'NV Vận đơn', type: 'string' },
      { key: 'Kết quả Check', header: 'Kết quả Check', type: 'string' },
      { key: 'Trạng thái giao hàng NB', header: 'Trạng thái giao hàng NB', type: 'string' },
      { key: 'Lý do', header: 'Lý do', type: 'string' },
      { key: 'Đơn vị vận chuyển', header: 'Đơn vị vận chuyển', type: 'string' },
      { key: 'Trạng thái thu tiền', header: 'Trạng thái thu tiền', type: 'string' },
      { key: 'Ngày hẹn đẩy đơn', header: 'Ngày hẹn đẩy đơn', type: 'date' },
      { key: 'Số tiền thực thu', header: 'Số tiền thực thu', type: 'number' },
      { key: 'Ngày Up bill', header: 'Ngày Up bill', type: 'date' },
      { key: 'Ảnh bill', header: 'Ảnh bill', type: 'string' },
      { key: 'Ngày chuyển khoản', header: 'Ngày chuyển khoản', type: 'date' },
      { key: 'Loại thanh toán', header: 'Loại thanh toán', type: 'string' },
      { key: 'Tên người chuyển khoản', header: 'Tên người chuyển khoản', type: 'string' },
      { key: 'Tài khoản nhận', header: 'Tài khoản nhận', type: 'string' },
      { key: 'Số tiền đã nhận', header: 'Số tiền đã nhận', type: 'number' },
      { key: 'Tỷ giá cước', header: 'Tỷ giá cước', type: 'number' },
      { key: 'Đơn vị tiền đối soát', header: 'Đơn vị tiền đối soát', type: 'string' },
      { key: 'Ngày đối soát cước', header: 'Ngày đối soát cước', type: 'date' },
      { key: 'Tiền ship', header: 'Tiền ship', type: 'number' },
      { key: 'Tỷ giá', header: 'Tỷ giá', type: 'number' },
      { key: 'Đơn vị tiền tệ tính cước', header: 'Đơn vị tiền tệ tính cước', type: 'string' },
      { key: 'Thời gian lên đơn', header: 'Thời gian lên đơn', type: 'datetime' },
      { key: 'Ghi chú của FFM', header: 'Ghi chú của FFM', type: 'text' },
      { key: 'FFM thanh toán', header: 'FFM thanh toán', type: 'string' },
      { key: 'Ngày đối soát bill', header: 'Ngày đối soát bill', type: 'date' },
      { key: 'Ngày Kế toán đối soát với FFM lần 1', header: 'Ngày Kế toán đối soát với FFM lần 1', type: 'datetime' },
      { key: 'Số tiền về TK Cty từ FFM lần 1', header: 'Số tiền về TK Cty từ FFM lần 1', type: 'number' },
      { key: 'Ngày Kế toán đối soát với FFM lần 2', header: 'Ngày Kế toán đối soát với FFM lần 2', type: 'datetime' },
      { key: 'Tiền Việt đã đối soát', header: 'Tiền Việt đã đối soát', type: 'number' },
      { key: 'Ngày Kế toán đối soát với FFM lần 3', header: 'Ngày Kế toán đối soát với FFM lần 3', type: 'datetime' },
      { key: 'Ca', header: 'Ca', type: 'string' },
      { key: 'Tổng số tiền từ FFM', header: 'Tổng số tiền từ FFM', type: 'number' },
      { key: 'Số tiền về TK Cty ngoài FFM', header: 'Số tiền về TK Cty ngoài FFM', type: 'datetime' },
      { key: 'Số tiền của đơn hàng đã về TK Cty', header: 'Số tiền của đơn hàng đã về TK Cty', type: 'datetime' },
      { key: 'Kế toán xác nhận thu tiền về', header: 'Kế toán xác nhận thu tiền về', type: 'datetime' },
      { key: 'Thông tin đơn', header: 'Thông tin đơn', type: 'text' },
      { key: 'Thông tin khách hàng', header: 'Thông tin khách hàng', type: 'text' },
      { key: 'Thông tin nhân sự', header: 'Thông tin nhân sự', type: 'text' },
      { key: 'Phản hồi tích cực', header: 'Phản hồi tích cực', type: 'text' },
      { key: 'Phản hồi tiêu cực', header: 'Phản hồi tiêu cực', type: 'text' },
      { key: 'Count', header: 'Count', type: 'number' },
      { key: 'Phân loại KH', header: 'Phân loại KH', type: 'string' },
      { key: 'Xác nhận đơn', header: 'Xác nhận đơn', type: 'string' },
      { key: 'Diễn giải', header: 'Diễn giải', type: 'text' },
      { key: 'Tên page', header: 'Tên page', type: 'string' },
      { key: 'Giá gốc', header: 'Giá gốc', type: 'number' },
      { key: 'Màu backlist', header: 'Màu backlist', type: 'string' },
      { key: 'Trạng thái đơn', header: 'Trạng thái đơn', type: 'string' },
      { key: 'Tiền chiết khấu', header: 'Tiền chiết khấu', type: 'number' },
      { key: 'Phí ship', header: 'Phí ship', type: 'number' },
      { key: 'Tiền sau ship', header: 'Tiền sau ship', type: 'number' },
      { key: 'Tên lên đơn', header: 'Tên lên đơn', type: 'string' },
      { key: 'Tạo bản in', header: 'Tạo bản in', type: 'string' },
      { key: 'In', header: 'In', type: 'string' },
      { key: 'Cảnh báo Blacklist, Trùng đơn', header: 'Cảnh báo Blacklist, Trùng đơn', type: 'text' },
      { key: 'Khu vực', header: 'Khu vực', type: 'string' },
      { key: 'Phí lưu kho', header: 'Phí lưu kho', type: 'number' },
      { key: 'Team', header: 'Team', type: 'string' },
      { key: 'Mã check', header: 'Mã check', type: 'string' },
      { key: 'Ghi chú của BEE', header: 'Ghi chú của BEE', type: 'text' },
      { key: 'Đánh dấu', header: 'Đánh dấu', type: 'string' },
      { key: 'Ngày đóng hàng', header: 'Ngày đóng hàng', type: 'date' },
      { key: 'Trạng thái giao hàng', header: 'Trạng thái giao hàng', type: 'string' },
      { key: 'Thời gian giao dự kiến', header: 'Thời gian giao dự kiến', type: 'string' },
      { key: 'Phí ship nội địa Mỹ (usd)', header: 'Phí ship nội địa Mỹ (usd)', type: 'string' },
      { key: 'Phí xử lý đơn đóng hàng-Lưu kho(usd)', header: 'Phí xử lý đơn đóng hàng-Lưu kho(usd)', type: 'string' },
      { key: 'GHI CHÚ', header: 'GHI CHÚ', type: 'text' },
      { key: 'Ngày đối soát', header: 'Ngày đối soát', type: 'date' },
      { key: 'Time kế toán xác nhận', header: 'Time kế toán xác nhận', type: 'time' },
      { key: 'Ghi chú của VĐ', header: 'Ghi chú của VĐ', type: 'text' },
      { key: 'Đơn vị thanh toán', header: 'Đơn vị thanh toán', type: 'string' },
      { key: 'Tài khoản thanh toán', header: 'Tài khoản thanh toán', type: 'string' },
      { key: 'Update', header: 'Update', type: 'string' },
      { key: 'Trạng thái dvvc', header: 'Trạng thái dvvc', type: 'string' },
      { key: 'Nhập kho', header: 'Nhập kho', type: 'string' },
      { key: 'Tổng phí vc', header: 'Tổng phí vc', type: 'number' },
      { key: 'Tiền cước', header: 'Tiền cước', type: 'number' },
      { key: 'Số tiền đối soát', header: 'Số tiền đối soát', type: 'number' },
      { key: 'maDonHang', header: 'maDonHang', type: 'string' },
      { key: 'SST đơn MKT', header: 'SST đơn MKT', type: 'string' },
      { key: 'CSKH', header: 'CSKH', type: 'string' },
      { key: 'Thời gian cutoff', header: 'Thời gian cutoff', type: 'date' }
    ]
  },
  'MGT nội bộ test': {
    name: 'MGT nội bộ test',
    columns: [
      { key: 'Mã đơn hàng', header: 'Mã đơn hàng', type: 'string', required: true }
    ]
  },
  'Báo cáo sale': {
    name: 'Báo cáo sale',
    columns: [
      { key: 'id', header: 'id', type: 'string', required: true },
      { key: 'Email', header: 'Email', type: 'string', required: false },
      { key: 'Tên', header: 'Tên', type: 'string', required: false },
      { key: 'Ngày', header: 'Ngày', type: 'date', required: false },
      { key: 'Ca', header: 'Ca', type: 'string', required: false },
      { key: 'Sản phẩm', header: 'Sản phẩm', type: 'string', required: false },
      { key: 'Thị trường', header: 'Thị trường', type: 'string', required: false },
      { key: 'Số Mess', header: 'Số Mess', type: 'number', required: false },
      { key: 'Phản hồi', header: 'Phản hồi', type: 'number', required: false },
      { key: 'Đơn Mess', header: 'Đơn Mess', type: 'number', required: false },
      { key: 'Doanh số Mess', header: 'Doanh số Mess', type: 'number', required: false },
      { key: 'id số mess', header: 'id số mess', type: 'string', required: false },
      { key: 'id phản hồi', header: 'id phản hồi', type: 'string', required: false },
      { key: 'Team', header: 'Team', type: 'string', required: false },
      { key: 'Trạng thái', header: 'Trạng thái', type: 'string', required: false },
      { key: 'Chi nhánh', header: 'Chi nhánh', type: 'string', required: false },
      { key: 'id_NS', header: 'id_NS', type: 'string', required: false },
      { key: 'Doanh số đi', header: 'Doanh số đi', type: 'number', required: false },
      { key: 'Số đơn Hoàn huỷ', header: 'Số đơn Hoàn huỷ', type: 'number', required: false },
      { key: 'Doanh số hoàn huỷ', header: 'Doanh số hoàn huỷ', type: 'number', required: false },
      { key: 'Số đơn thành công', header: 'Số đơn thành công', type: 'number', required: false },
      { key: 'Doanh số thành công', header: 'Doanh số thành công', type: 'number', required: false },
      { key: 'Khách mới', header: 'Khách mới', type: 'number', required: false },
      { key: 'Khách cũ', header: 'Khách cũ', type: 'number', required: false },
      { key: 'Bán chéo', header: 'Bán chéo', type: 'string', required: false }
    ]
  },
  'Báo cáo MKT': {
    name: 'Báo cáo MKT',
    columns: [
      { key: 'id', header: 'id', type: 'string', required: true },
      { key: 'Tên', header: 'Tên', type: 'string', required: false },
      { key: 'Email', header: 'Email', type: 'string', required: false },
      { key: 'Ngày', header: 'Ngày', type: 'date', required: false },
      { key: 'ca', header: 'ca', type: 'string', required: false },
      { key: 'Sản_phẩm', header: 'Sản_phẩm', type: 'string', required: false },
      { key: 'Thị_trường', header: 'Thị_trường', type: 'string', required: false },
      { key: 'page', header: 'page', type: 'string', required: false },
      { key: 'TKQC', header: 'TKQC', type: 'string', required: false },
      { key: 'CPQC', header: 'CPQC', type: 'number', required: false },
      { key: 'Via_log', header: 'Via_log', type: 'string', required: false },
      { key: 'Số_Mess_Cmt', header: 'Số_Mess_Cmt', type: 'number', required: false },
      { key: 'Số đơn', header: 'Số đơn', type: 'number', required: false },
      { key: 'Doanh số', header: 'Doanh số', type: 'number', required: false },
      { key: 'Team', header: 'Team', type: 'string', required: false },
      { key: 'id_NS', header: 'id_NS', type: 'string', required: false },
      { key: 'Doanh số đi', header: 'Doanh số đi', type: 'number', required: false },
      { key: 'Số đơn hoàn hủy', header: 'Số đơn hoàn hủy', type: 'number', required: false },
      { key: 'DS chốt', header: 'DS chốt', type: 'number', required: false },
      { key: 'DS sau hoàn hủy', header: 'DS sau hoàn hủy', type: 'number', required: false },
      { key: 'Số đơn hoàn hủy', header: 'Số đơn hoàn hủy', type: 'number', required: false },
      { key: 'Doanh số sau ship', header: 'Doanh số sau ship', type: 'number', required: false },
      { key: 'Doanh số TC', header: 'Doanh số TC', type: 'number', required: false },
      { key: 'KPIs', header: 'KPIs', type: 'number', required: false },
      { key: 'CPQC theo TKQC', header: 'CPQC theo TKQC', type: 'string', required: false },
      { key: 'Báo cáo theo Page', header: 'Báo cáo theo Page', type: 'string', required: false },
      { key: 'Trạng thái', header: 'Trạng thái', type: 'string', required: false },
      { key: 'Cảnh báo', header: 'Cảnh báo', type: 'string', required: false }
    ]
  },
  'Nhân sự': {
    name: 'Nhân sự', //id	Họ Và Tên	Bộ phận	Vị trí	Email	SĐT	Team	chi nhánh	Ca	Vị trí vận đơn	link vận đơn
    columns: [
      { key: 'id', header: 'id', type: 'string', required: true },
      { key: 'Họ Và Tên', header: 'Họ Và Tên', type: 'string', required: false },
      { key: 'Bộ phận', header: 'Bộ phận', type: 'string', required: false },
      { key: 'Vị trí', header: 'Vị trí', type: 'string', required: false },
      { key: 'Email', header: 'Email', type: 'string', required: false },
      { key: 'SĐT', header: 'SĐT', type: 'string', required: false },
      { key: 'Team', header: 'Team', type: 'string', required: false },
      { key: 'chi nhánh', header: 'chi nhánh', type: 'string', required: false },
      { key: 'Ca', header: 'Ca', type: 'string', required: false },
      { key: 'Vị trí vận đơn', header: 'Vị trí vận đơn', type: 'string', required: false },
      { key: 'link vận đơn', header: 'link vận đơn', type: 'string', required: false }
    ]
  }
};

// Utility functions cho data validation và transformation
export const DataValidator = {
  validateRequired(value, column) {
    if (column.required && (!value || value.toString().trim() === '')) {
      throw new Error(`Field ${column.header} is required`);
    }
    return true;
  },

  transformValue(value, type) {
    if (!value || value === '') return '';

    switch (type) {
      case 'string':
        return value.toString().trim();

      case 'number':
        const num = parseFloat(value.toString().replace(/[,\s]/g, ''));
        return isNaN(num) ? 0 : num;

      case 'date':
        // Xử lý ngày tháng
        if (value instanceof Date) return value.toLocaleDateString('vi-VN');
        if (typeof value === 'string' && value.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/)) {
          return value;
        }
        return '';

      case 'datetime':
        // Xử lý ngày giờ 8/5/2025 22:32:28
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString('vi-VN', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
          });
        }
        return '';

      case 'time':
        const time = new Date(value);
        if (!isNaN(time.getTime())) {
          return time.toLocaleTimeString('vi-VN', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
          });
        }
        return '';

      case 'text':
        return value.toString();

      default:
        return value.toString();
    }
  },

  validateRow(rowData, sheetName) {
    const schema = SHEET_SCHEMAS[sheetName];
    if (!schema) {
      throw new Error(`Schema not found for sheet: ${sheetName}`);
    }

    const validatedData = {};
    const errors = [];

    schema.columns.forEach(column => {
      const value = rowData[column.key];

      try {
        // Validate required fields
        this.validateRequired(value, column);

        // Transform and validate data type
        validatedData[column.key] = this.transformValue(value, column.type);
      } catch (error) {
        errors.push(`${column.header}: ${error.message}`);
      }
    });

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }

    return validatedData;
  },

  // Convert validated data to array format for Google Sheets
  dataToArray(rowData, sheetName) {
    const schema = SHEET_SCHEMAS[sheetName];
    if (!schema) {
      throw new Error(`Schema not found for sheet: ${sheetName}`);
    }

    return schema.columns.map(column => rowData[column.key] || '');
  },

  // Convert array from Google Sheets to object
  arrayToData(rowArray, sheetName) {
    const schema = SHEET_SCHEMAS[sheetName];
    if (!schema) {
      throw new Error(`Schema not found for sheet: ${sheetName}`);
    }

    const data = {};
    schema.columns.forEach((column, index) => {
      data[column.key] = rowArray[index] || '';
    });

    return data;
  },

  // Get headers array for a sheet
  getHeaders(sheetName) {
    const schema = SHEET_SCHEMAS[sheetName];
    if (!schema) {
      throw new Error(`Schema not found for sheet: ${sheetName}`);
    }

    return schema.columns.map(column => column.header);
  }
};

export default SHEET_SCHEMAS;
