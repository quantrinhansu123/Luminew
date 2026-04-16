/**
 * Chuẩn hoá nhãn ô cột NB (trim, bỏ ký tự ẩn) — nguồn chỉ từ `delivery_status_nb` / nhãn «Trạng thái giao hàng NB».
 */
export function normalizeVanDonNbDeliveryStatusDisplay(raw) {
  if (raw == null) return '';
  const s = String(raw).replace(/[\u00a0\u200b\ufeff]/g, '').trim();
  return s;
}

/** Giá trị cột «Trạng thái giao hàng NB»: chỉ đọc `delivery_status_nb` (và alias nhãn app), không fallback FFM / cột gộp. */
export function resolveVanDonDeliveryStatusForNbColumn(row) {
  if (!row) return '';
  const nb = row.delivery_status_nb ?? row['Trạng thái giao hàng NB'];
  if (nb === undefined || nb === null) return '';
  return String(nb).trim();
}
