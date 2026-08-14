/** Giống cột hiển thị «Kết quả Check» trên lưới đơn: ưu tiên check_result, fallback payment_status (legacy). */
export function getCheckResult(order) {
  const check = String(order?.check_result ?? '').trim();
  if (check) return check;
  return String(order?.payment_status ?? '').trim();
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

/** Chuẩn hóa để khớp Ok / OK */
export function isCheckResultOk(val) {
  const s = String(val ?? '').trim();
  if (!s) return false;
  const ascii = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return ascii === 'ok';
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
