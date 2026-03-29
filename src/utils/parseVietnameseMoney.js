/**
 * Chuẩn hóa chuỗi tiền/số kiểu Việt Nam (dấu chấm phân cách nghìn, vd 4.725.000) → number cho PostgreSQL `numeric`.
 * @param {unknown} value
 * @returns {number | null} null khi rỗng / không parse được
 */
export function parseVietnameseMoneyToNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const raw = String(value).trim();
  if (raw === '') return null;

  const neg = raw.startsWith('-');
  const body = (neg ? raw.slice(1) : raw).trim().replace(/\s/g, '');
  if (body === '') return null;

  const applyNeg = (n) => (Number.isFinite(n) ? (neg ? -n : n) : null);

  if (/^\d+$/.test(body)) return applyNeg(Number(body));

  // Thập phân dấu phẩy: 12,5
  if (/^\d+,\d{1,4}$/.test(body)) return applyNeg(Number(body.replace(',', '.')));

  // EU: 1.234,56
  if (/^\d{1,3}(\.\d{3})*,\d{1,4}$/.test(body)) {
    return applyNeg(Number(body.replace(/\./g, '').replace(',', '.')));
  }

  // VN: 4.725.000
  if (/^\d{1,3}(\.\d{3})+$/.test(body)) {
    return applyNeg(Number(body.replace(/\./g, '')));
  }

  const dotCount = (body.match(/\./g) || []).length;
  if (dotCount === 1) {
    const [a, b] = body.split('.');
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
      if (b.length <= 2) return applyNeg(Number(`${a}.${b}`));
      if (b.length === 3) return applyNeg(Number(a + b));
    }
  }

  if (dotCount > 1) return applyNeg(Number(body.replace(/\./g, '')));

  const stripped = body.replace(/[^\d]/g, '');
  if (stripped === '') return null;
  return applyNeg(Number(stripped));
}
