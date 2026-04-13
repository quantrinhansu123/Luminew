/**
 * Ca chuẩn trên báo cáo (MKT / Sale / CSKH): một chuỗi gộp,
 * không tách chọn «Giữa ca» / «Hết ca» riêng.
 */
export const REPORT_CA_COMBINED = 'Giữa ca,Hết ca';

/** Hai lựa chọn trong sổ xuống ca (nhập báo cáo MKT / tương tự). */
export const REPORT_CA_SHIFT_OPTIONS = ['Giữa ca', 'Hết ca'];

/**
 * Lọc theo ca: chọn «Giữa ca,Hết ca» khớp mọi dòng có Hết / Giữa / gộp (dữ liệu cũ vẫn lọc được).
 */
export function rowCaMatchesSelectedShifts(rowCa, selectedShifts) {
  const list = Array.isArray(selectedShifts) ? selectedShifts : [];
  if (!list.length) return true;
  const shift = String(rowCa ?? '').trim();
  const sLo = shift.toLowerCase();
  const rowHet = sLo.includes('hết ca') || sLo.includes('het ca');
  const rowGua = sLo.includes('giữa ca') || sLo.includes('giua ca');

  for (const f of list) {
    const fs = String(f ?? '').trim();
    if (!fs) continue;
    if (shift === fs) return true;
    const fLo = fs.toLowerCase();
    const selHet = fLo.includes('hết ca') || fLo.includes('het ca');
    const selGua = fLo.includes('giữa ca') || fLo.includes('giua ca');
    if (selHet && selGua) {
      if (rowHet || rowGua) return true;
      continue;
    }
    if (selHet && rowHet) return true;
    if (selGua && rowGua) return true;
  }
  return false;
}
