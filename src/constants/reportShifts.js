/**
 * Ca chuẩn trên báo cáo (MKT / Sale / CSKH).
 * «Giữa ca,Hết ca» (và biến thể) luôn tính / lọc như «Hết ca».
 */
export const REPORT_CA_COMBINED = 'Giữa ca,Hết ca';
export const REPORT_CA_HET = 'Hết ca';
export const REPORT_CA_GIUA = 'Giữa ca';

/** Gộp «Giữa ca,Hết ca» → «Hết ca»; trống → «Hết ca». */
export function canonicalizeReportCa(caVal) {
  const raw = String(caVal ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!raw) return REPORT_CA_HET;
  if (reportCaMeansBothHetAndGua(raw)) return REPORT_CA_HET;
  return raw;
}

/** Hai ca tách riêng. */
export const REPORT_CA_SHIFT_OPTIONS = ['Giữa ca', 'Hết ca'];

/** Sổ xuống nhập báo cáo MKT: chỉ hai ca tách (không còn gộp). */
export const REPORT_CA_INPUT_OPTIONS = [...REPORT_CA_SHIFT_OPTIONS];

/** true nếu ca là «Giữa ca» thuần (không kèm Hết ca). */
export function isReportCaGiuacaOnly(caVal) {
  const s = String(caVal ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const hasGua = s.includes('giua ca');
  const hasHet = s.includes('het ca');
  return hasGua && !hasHet;
}

/**
 * true nếu giá trị ca (sau khi bỏ dấu) chứa cả «hết ca» lẫn «giua ca»
 * → luôn xử lý như đủ cả Hết ca và Giữa ca (giống `reportCaToGroups` trong recalc MKT).
 */
export function reportCaMeansBothHetAndGua(caVal) {
  const s = String(caVal ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return s.includes('het ca') && s.includes('giua ca');
}

/** Chuỗi ca so sánh lọc: NBSP → space, gộp khoảng trắng, thường, bỏ dấu (khớp viewNsMoiNhanh / DB). */
function foldCaForShiftMatch(s) {
  return String(s ?? '')
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Lọc theo ca:
 * - «Giữa ca,Hết ca» luôn = «Hết ca».
 * - Chỉ chọn «Hết ca»: dòng Hết ca thuần và dòng gộp.
 * - Chỉ chọn «Giữa ca»: chỉ Giữa ca thuần.
 * Nhiều mục chọn = OR.
 */
export function rowCaMatchesSelectedShifts(rowCa, selectedShifts) {
  const list = Array.isArray(selectedShifts) ? selectedShifts : [];
  if (!list.length) return true;
  const rowCanon = canonicalizeReportCa(rowCa);
  const foldedRow = foldCaForShiftMatch(rowCanon);

  for (const f of list) {
    const fs = String(f ?? '').trim();
    if (!fs) continue;
    const filterCanon = canonicalizeReportCa(fs);
    const foldedFilter = foldCaForShiftMatch(filterCanon);
    if (foldedRow === foldedFilter) return true;
  }
  return false;
}
