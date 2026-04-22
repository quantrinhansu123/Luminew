/**
 * Nhãn cột hiển thị trong modal xác nhận lưu FFM (pending lưu theo colKey nội bộ / DB).
 */
const FFM_PENDING_COL_LABELS = {
  delivery_status: 'Trạng thái giao hàng',
  delivery_status_nb: 'Trạng thái giao hàng NB',
  tracking_code: 'Mã Tracking',
  'Mã Tracking': 'Mã Tracking',
  'Kết quả Check': 'Kết quả Check',
  'Ngày đóng hàng': 'Ngày đóng hàng',
  ngaydonghang: 'Ngày đóng hàng',
  'GHI CHÚ': 'GHI CHÚ',
  note_caps: 'GHI CHÚ',
  'Thời gian giao dự kiến': 'Thời gian giao dự kiến',
  thoigiangiaohangffm: 'Thời gian giao dự kiến',
  estimated_delivery_date: 'Thời gian giao dự kiến',
  'Ngày đối soát kế toán': 'Ngày đối soát kế toán',
  luu_kho_usd: 'Ngày đối soát kế toán',
  'Ngày có mã tracking': 'Ngày có mã tracking',
  ngay_co_ma_tracking: 'Ngày có mã tracking',
  shipping_unit: 'Đơn vị vận chuyển',
  'Đơn vị vận chuyển': 'Đơn vị vận chuyển',
  payment_bill: 'Payment Bill',
  payment_status: 'Trạng thái thu tiền',
};

export function ffmPendingColKeyLabel(colKey) {
  const k = String(colKey ?? '');
  return FFM_PENDING_COL_LABELS[k] || k;
}
