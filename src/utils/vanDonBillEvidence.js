/** Chuẩn hóa nhãn trạng thái thu tiền để so khớp «Có bill» (không phân biệt hoa/thường/dấu). */
export function normalizeVanDonPaymentLabel(label) {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/** Chỉ «Có bill» — loại «Có bill 1 phần» / bill một phần. */
export function vanDonPaymentLabelIsCoBillOnly(label) {
  const s = normalizeVanDonPaymentLabel(label);
  if (!s) return false;
  if (s.includes('1 phan') && s.includes('bill')) return false;
  return s.includes('co bill');
}

export function resolveVanDonPaymentLabelFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  const detail =
    row.payment_status_detail != null ? String(row.payment_status_detail).trim() : '';
  if (detail) return detail;
  const ui = row['Trạng thái thu tiền'];
  if (ui != null && String(ui).trim() !== '') return String(ui).trim();
  return row.payment_status != null ? String(row.payment_status).trim() : '';
}

/**
 * Có bill trên một dòng đơn:
 * - ảnh / ngày up bill / payment_bill (legacy)
 * - hoặc trạng thái thu tiền = «Có bill» (không tính bill 1 phần)
 */
export function vanDonRowHasBillEvidence(row) {
  if (!row || typeof row !== 'object') return false;
  const img = row.payment_image ?? row['Payment Image'];
  if (img != null && String(img).trim() !== '') return true;
  const up = row.ngayupbill ?? row.ngay_up_bill ?? row['Ngày up bill'];
  if (up != null && String(up).trim() !== '') return true;
  const pb = row.payment_bill ?? row['Payment Bill'];
  if (pb != null && String(pb).trim() !== '') return true;
  return vanDonPaymentLabelIsCoBillOnly(resolveVanDonPaymentLabelFromRow(row));
}
