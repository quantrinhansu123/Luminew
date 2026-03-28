/**
 * Giá trị từ DB / sheet trông trống nhưng không phải ô thật sự rỗng —
 * gộp cùng lọc & tùy chọn "Trống" trên trang Vận đơn.
 */
export function isVanDonSemanticEmpty(v) {
  if (v == null) return true;
  const raw = String(v).replace(/[\u00a0\u200b\ufeff]/g, '').trim();
  if (raw === '') return true;
  const l = raw.toLowerCase();
  const compact = l.replace(/\s+/g, '');
  if (compact === '') return true;
  // Chỉ ký tự gạch / chấm / khoảng trắng
  if (/^[\-–—_.\s,;]+$/u.test(raw)) return true;
  const exact = new Set([
    'null',
    'undefined',
    'none',
    'n/a',
    'na',
    '#n/a',
    '#na',
    '__empty__',
    'trống',
    '(trống)',
    'empty',
    'blank',
    '(empty)',
    'nil',
    '-',
    '--',
    '—',
    'n\\a',
  ]);
  if (exact.has(l) || exact.has(compact)) return true;
  return false;
}
