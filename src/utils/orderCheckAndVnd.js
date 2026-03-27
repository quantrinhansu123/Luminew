/** Dùng đúng cột Kết quả Check: chỉ lấy check_result */
export function getCheckResult(order) {
  return String(order?.check_result ?? '').trim();
}

/** Chuẩn hóa để khớp Hủy / Huỷ */
export function isCheckResultHuy(val) {
  const s = String(val ?? '').trim();
  if (!s) return false;
  const ascii = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return ascii === 'huy';
}

/** Một giá trị VND cho đơn (thứ tự ưu tiên giống báo cáo tay / sales recalc). */
export function orderAmountVnd(order) {
  const raw =
    order?.total_amount_vnd ??
    order?.total_vnd ??
    order?.reconciled_vnd ??
    order?.goods_amount ??
    order?.sale_price ??
    0;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return n;
}
