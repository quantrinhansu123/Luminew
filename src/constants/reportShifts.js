/**
 * Ca chuẩn trên báo cáo (MKT / Sale / CSKH): một chuỗi gộp.
 * «Giữa ca,Hết ca» luôn được coi là đủ cả hai nhóm Giữa ca và Hết ca (recalc, lọc, khớp đơn).
 */
export const REPORT_CA_COMBINED = 'Giữa ca,Hết ca';

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
 * Lọc theo ca (React — cùng quy tắc trang xem MKT HTML):
 * - Chỉ chọn «Hết ca»: chỉ dòng ca thuần «Hết ca» (không Giữa, không gộp).
 * - Chỉ chọn «Giữa ca»: Giữa ca thuần hoặc gộp «Giữa ca,Hết ca».
 * - Nhãn lọc gộp (cả hai cụm): chỉ dòng gộp.
 * Nhiều mục chọn = OR.
 */
export function rowCaMatchesSelectedShifts(rowCa, selectedShifts) {
  const list = Array.isArray(selectedShifts) ? selectedShifts : [];
  if (!list.length) return true;
  const foldedRow = foldCaForShiftMatch(rowCa);
  const rowHet = foldedRow.includes('het ca');
  const rowGua = foldedRow.includes('giua ca');
  const isRowCombined = rowHet && rowGua;

  for (const f of list) {
    const fs = String(f ?? '').trim();
    if (!fs) continue;
    const foldedFilter = foldCaForShiftMatch(fs);
    if (foldedRow === foldedFilter) return true;
    const selHet = foldedFilter.includes('het ca');
    const selGua = foldedFilter.includes('giua ca');
    const selOnlyHet = selHet && !selGua;
    const selOnlyGua = selGua && !selHet;

    if (selOnlyHet) {
      if (rowHet && !rowGua) return true;
      continue;
    }
    if (selOnlyGua) {
      if (rowGua || isRowCombined) return true;
      continue;
    }
    if (selHet && selGua) {
      if (isRowCombined) return true;
      continue;
    }
  }
  return false;
}
