function normalizeGiaoHangHistogramKey(key) {
  return String(key)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Key tổng hợp trong jsonb trang_thai_giao_hang (đếm từ tracking_code / shipping_unit).
 * Khớp mọi cách viết: "Mã Tracking", "Mã tracking", …
 */
export function isGiaoHangHistogramSyntheticKey(key) {
  const n = normalizeGiaoHangHistogramKey(key);
  return n === 'mã tracking' || n === 'lên vận hành';
}

function giaoHangSyntheticSortRank(key) {
  const n = normalizeGiaoHangHistogramKey(key);
  if (n === 'mã tracking') return 0;
  if (n === 'lên vận hành') return 1;
  return 99;
}

/**
 * Hiển thị cột jsonb trạng thái dạng { "Giá trị": số_lượng } trên UI.
 * Với trang_thai_giao_hang: hai dòng tổng hợp (Mã Tracking, Lên vận hành) luôn hiện nếu có trong json,
 * kể cả 0 — đứng trên các dòng delivery_status (còn lại sắp theo số giảm dần).
 * @param {unknown} value — object từ Supabase hoặc chuỗi JSON
 * @returns {string} nhiều dòng "Trạng thái: n"
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
  const synthetic = [];
  const rest = [];
  for (const [k, raw] of Object.entries(obj)) {
    const num = Number(raw);
    if (Number.isNaN(num)) continue;
    if (isGiaoHangHistogramSyntheticKey(k)) {
      synthetic.push([k, num]);
    } else if (num > 0) {
      rest.push([k, num]);
    }
  }
  synthetic.sort((a, b) => giaoHangSyntheticSortRank(a[0]) - giaoHangSyntheticSortRank(b[0]));
  rest.sort((a, b) => Number(b[1]) - Number(a[1]));
  const ordered = [...synthetic, ...rest];
  if (ordered.length === 0) return '—';
  return ordered.map(([k, n]) => `${k}: ${n}`).join('\n');
}

/** Định dạng số tiền VNĐ (không ký hiệu tiền tệ, thêm "VNĐ" ở chỗ gọi). */
function formatVndPlain(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}

/**
 * Cột trạng thái thanh toán + tổng tiền theo từng nhãn (cùng key với jsonb đếm đơn).
 * @param {unknown} countHist — trang_thai_thanh_toan
 * @param {unknown} moneyHist — tien_trang_thai_thanh_toan
 */
export function formatBaoCaoVanDonPaymentStatusWithMoney(countHist, moneyHist) {
  const counts = parseBaoCaoVanDonHistogram(countHist);
  const money = parseBaoCaoVanDonHistogram(moneyHist);
  const entries = Object.entries(counts).filter(([, n]) => Number(n) > 0);
  if (entries.length === 0) return '—';
  entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  return entries
    .map(([k, n]) => {
      const raw = Object.prototype.hasOwnProperty.call(money, k) ? money[k] : undefined;
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        return `${k}: ${n} — ${formatVndPlain(raw)} VNĐ`;
      }
      return `${k}: ${n}`;
    })
    .join('\n');
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
 * Tổng đơn theo `trang_thai_giao_hang` — bỏ các key tổng hợp (Mã Tracking, Lên vận hành)
 * vì chúng trùng logic với đơn đã nằm trong bucket delivery_status; cộng đủ mọi key sẽ đếm thừa.
 */
export function sumBaoCaoVanDonGiaoHangOrderCount(value) {
  const o = parseBaoCaoVanDonHistogram(value);
  let s = 0;
  for (const [key, raw] of Object.entries(o)) {
    if (isGiaoHangHistogramSyntheticKey(key)) continue;
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

/** Đơn "có bill" đủ (loại trừ bill 1 phần) — cùng quy tắc BaoCaoVanDon / BC vận hành. */
function donCoBillFullHistogramKeyMatches(key) {
  const k = String(key);
  if (k.includes('Có bill 1 phần') || (k.includes('1 phần') && k.toLowerCase().includes('bill'))) return false;
  if (k.includes('Có bill') || k.toLowerCase().includes('có bill')) return true;
  return false;
}

/** @param {unknown} histogram — jsonb số đơn theo key */
export function sumDonCoBillFullCount(histogram) {
  const o = parseBaoCaoVanDonHistogram(histogram);
  let s = 0;
  for (const [key, raw] of Object.entries(o)) {
    const n = Number(raw) || 0;
    if (n <= 0) continue;
    if (donCoBillFullHistogramKeyMatches(key)) s += n;
  }
  return s;
}

/** @param {unknown} moneyByKeyHistogram — jsonb tổng tiền VNĐ theo cùng key */
export function sumDonCoBillFullAmount(moneyByKeyHistogram) {
  const o = parseBaoCaoVanDonHistogram(moneyByKeyHistogram);
  let s = 0;
  for (const [key, raw] of Object.entries(o)) {
    const n = Number(raw) || 0;
    if (n <= 0) continue;
    if (donCoBillFullHistogramKeyMatches(key)) s += n;
  }
  return s;
}
