/**
 * Hiển thị cột jsonb trạng thái dạng { "Giá trị": số_lượng } trên UI.
 * @param {unknown} value — object từ Supabase hoặc chuỗi JSON
 * @returns {string} nhiều dòng "Trạng thái: n" (sắp theo số giảm dần)
 */
export function formatBaoCaoVanDonStatusHistogram(value) {
  let obj = value;
  if (obj == null) return '—';
  if (typeof obj === 'string') {
    const t = obj.trim();
    if (!t) return '—';
    try {
      obj = JSON.parse(t);
    } catch {
      return t;
    }
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return String(obj);
  }
  const entries = Object.entries(obj).filter(([, n]) => Number(n) > 0);
  if (entries.length === 0) return '—';
  entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  return entries.map(([k, n]) => `${k}: ${n}`).join('\n');
}

/** @returns {Record<string, number|string>} */
export function parseBaoCaoVanDonHistogram(value) {
  if (value == null) return {};
  let obj = value;
  if (typeof obj === 'string') {
    const t = obj.trim();
    if (!t) return {};
    try {
      obj = JSON.parse(t);
    } catch {
      return {};
    }
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
  return obj;
}

export function sumBaoCaoVanDonHistogramValues(value) {
  const o = parseBaoCaoVanDonHistogram(value);
  let s = 0;
  for (const raw of Object.values(o)) {
    s += Number(raw) || 0;
  }
  return s;
}

/**
 * @param {unknown[]} rows
 * @param {(row: unknown) => unknown} getHistogram
 */
export function collectBaoCaoHistogramKeys(rows, getHistogram) {
  const s = new Set();
  for (const row of rows || []) {
    const o = parseBaoCaoVanDonHistogram(getHistogram(row));
    for (const k of Object.keys(o)) {
      const t = String(k).trim();
      if (t) s.add(t);
    }
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'vi'));
}

export function baoCaoHistogramHasKey(histogram, needle) {
  if (needle == null || String(needle).trim() === '') return true;
  const o = parseBaoCaoVanDonHistogram(histogram);
  const want = String(needle).trim();
  return Object.keys(o).some((k) => String(k).trim() === want);
}
