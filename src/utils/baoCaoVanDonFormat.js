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
