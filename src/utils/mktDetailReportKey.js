import { REPORT_CA_COMBINED } from '../constants/reportShifts';
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

/**
 * Một nhóm đơn (Hết / Giữa). Với ca gộp «Giữa ca,Hết ca» trả về null — phải dùng logic hai nhóm
 * (`reportCaMeansBothHetAndGua` / recalc `reportCaToGroups`).
 */
export function reportCaToGroup(caVal) {
  const lower = normalizePersonKey(caVal);
  if (!lower) return null;
  const de = lower
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const hasHet = de.includes('het ca') || lower.includes('hết ca');
  const hasGua = de.includes('giua ca') || lower.includes('giữa ca');
  if (hasHet && hasGua) return null;
  if (hasHet) return 'Hết ca';
  if (hasGua) return 'Giữa ca';
  return null;
}

/**
 * Bucket ca cho key gộp báo cáo: mọi ca chuẩn (Giữa / Hết / gộp) cùng một bucket
 * để không tách thành hai dòng trùng key.
 */
export function caBucketForDedupeKey(row) {
  const raw = String(row?.ca ?? '').trim();
  if (!raw) return REPORT_CA_COMBINED;
  const lower = normalizePersonKey(raw);
  const hasHet = lower.includes('hết ca') || lower.includes('het ca');
  const hasGua = lower.includes('giữa ca') || lower.includes('giua ca');
  if (hasHet || hasGua) return REPORT_CA_COMBINED;
  return `raw:${lower}`;
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

/**
 * Chuẩn hoá 5 trường dùng cho `buildMktReportDedupeKey` (dòng modal / clipboard / lưới).
 * Bỏ BOM, \r, trim — tránh lệch khớp với dữ liệu copy từ Excel.
 */
export function mktRowSnapshotForDedupeKey(row) {
  const o = row && typeof row === 'object' ? row : {};
  const strip = (v) =>
    String(v ?? '')
      .replace(/^\uFEFF/, '')
      .replace(/\r/g, '')
      .trim();
  return {
    Ngày: normalizeMktReportDate(strip(o['Ngày'])),
    Tên: strip(o['Tên']),
    ca: strip(o['ca']),
    Sản_phẩm: strip(o['Sản_phẩm']),
    Thị_trường: strip(o['Thị_trường']),
  };
}
