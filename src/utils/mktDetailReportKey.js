import { normalizePersonKey } from './emailFromName';

/** Cùng logic chuẩn hóa ngày với mktRecalcSoDonThucTeFromOrders / Key(R) */
export function normalizeMktReportDate(dateVal) {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    const year = dateVal.getFullYear();
    const month = String(dateVal.getMonth() + 1).padStart(2, '0');
    const day = String(dateVal.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const s = String(dateVal).trim();
  if (!s) return '';
  if (s.includes('T')) return s.split('T')[0];

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (y && m && d) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (y && m && d && Number(y) > 1900) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return s;
}

/** Giống reportCaToGroup trong recalc MKT */
export function reportCaToGroup(caVal) {
  const lower = normalizePersonKey(caVal);
  if (!lower) return null;
  if (lower.includes('hết ca') || lower.includes('het ca')) return 'Hết ca';
  if (lower.includes('giữa ca') || lower.includes('giua ca')) return 'Giữa ca';
  return null;
}

/**
 * Bucket ca cho key khớp DB / nhập đơn: ca trống coi như "Giữa ca" (mặc định app),
 * tránh lệch key giữa form (để trống) và dòng đã có từ recalc ("Giữa ca").
 */
export function caBucketForDedupeKey(row) {
  const g = reportCaToGroup(row?.ca);
  if (g) return g;
  const raw = normalizePersonKey(row?.ca);
  if (raw) return `raw:${raw}`;
  return 'Giữa ca';
}

/**
 * Key để coi là cùng một dòng báo cáo MKT (trùng thì update, không insert mới):
 * ca + Ngày + Tên + Sản_phẩm + Thị_trường (không gồm TKQC).
 */
export function buildMktReportDedupeKey(row) {
  const d = normalizeMktReportDate(row?.['Ngày']);
  return [
    caBucketForDedupeKey(row),
    d,
    normalizePersonKey(row?.['Tên']),
    normalizePersonKey(row?.['Sản_phẩm']),
    normalizePersonKey(row?.['Thị_trường']),
  ].join('||');
}
