import { REPORT_CA_COMBINED } from '../constants/reportShifts';
import { supabase } from '../supabase/config';
import { buildEmailByNameLookup, emailFromName } from '../utils/emailFromName';
import { mergeUniqueRowsById, parseSmartDate } from '../utils/dateParsing';
import { getCheckResult, isCheckResultHuy, orderAmountVnd } from '../utils/orderCheckAndVnd';

function normalizeStr(str) {
  if (str === null || str === undefined) return '';
  return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeNameForKeyAndMatch(v) {
  // Normalize mạnh để khớp "Tên" orders ↔ detail_reports dù khác dấu/các ký tự ẩn.
  const s = String(v ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\p{Cf}+/gu, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    // 'đ/Đ' không tách dấu theo NFD giống các chữ khác
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Chỉ giữ chữ/số/khoảng trắng, xóa dấu câu để tránh lệch do format.
  return s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeNameForKey(v) {
  return normalizeNameForKeyAndMatch(v);
}

function normalizeEmail(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase();
}

function normalizeDateStr(dateVal) {
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

  // If it's already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // If it's DD/MM/YYYY
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (y && m && d) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // If it's DD-MM-YYYY
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

/** Gộp thống kê đơn theo hai nhóm ca (cùng key Ngày|Tên|SP|TT). */
function mergeOrderAggs(a, b) {
  if (!a && !b) return null;
  if (!a) return { ...b };
  if (!b) return { ...a };
  return {
    count: (a.count ?? 0) + (b.count ?? 0),
    totalRevenueVnd: (a.totalRevenueVnd ?? 0) + (b.totalRevenueVnd ?? 0),
    cancelCount: (a.cancelCount ?? 0) + (b.cancelCount ?? 0),
    cancelRevenueVnd: (a.cancelRevenueVnd ?? 0) + (b.cancelRevenueVnd ?? 0),
    sample: a.sample || b.sample,
  };
}

function nextDateStr(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse cột ca giống orders.shift: một ca hoặc danh sách ngăn bởi dấu phẩy/chấm phẩy (vd. "Giữa ca,Hết ca") → 2 nhóm. */
function reportCaToGroups(caVal) {
  return orderShiftToGroups(caVal);
}

/**
 * Mỗi phần sau khi tách (phẩy / chấm phẩy / bản fullwidth) được quét riêng — «Hết ca» ở phần sau vẫn nhận (vd. "Giữa ca,Hết ca").
 * Không có dấu tách: quét cả chuỗi (vd. một cụm có cả hai từ).
 */
function orderShiftToGroups(shiftVal) {
  const raw = String(shiftVal ?? '').trim();
  if (!raw) return [];

  const segments = raw
    .split(/[,，;；]/)
    .map((p) => normalizeStr(String(p).trim()))
    .filter((p) => p.length > 0);

  const parts = segments.length > 0 ? segments : [normalizeStr(raw)];
  let hasHet = false;
  let hasGua = false;
  for (const seg of parts) {
    if (!seg) continue;
    if (seg.includes('hết ca') || seg.includes('het ca')) hasHet = true;
    if (seg.includes('giữa ca') || seg.includes('giua ca')) hasGua = true;
  }

  const groups = [];
  if (hasHet) groups.push('Hết ca');
  if (hasGua) groups.push('Giữa ca');
  return groups;
}

/**
 * Đơn (orders.shift): trống hoặc không chứa «Hết ca»/«Giữa ca» → vẫn cộng vào «Hết ca».
 * Trước đây `orderShiftToGroups` trả [] → đơn bị bỏ qua hẳn → không có trong countsByGroup → không tự tạo dòng báo cáo.
 */
function orderShiftGroupsForRecalc(shiftVal) {
  const g = orderShiftToGroups(shiftVal);
  if (g.length) return g;
  return ['Hết ca'];
}

/** Ca trống → «Hết ca» khi recalc (khớp normalizeCaForRowKey). Ca có chữ nhưng không nhận diện → bỏ qua dòng. */
function reportCaGroupsForRecalc(caVal) {
  const g = reportCaToGroups(caVal);
  if (g.length) return g;
  if (!String(caVal ?? '').trim()) return ['Hết ca'];
  return [];
}

/**
 * Dòng báo cáo thiếu SP hoặc TT: nếu trong tập đơn chỉ có đúng một cặp (product, country)
 * khớp ngày + tên (+ SP/TT đã nhập nếu có) thì điền để khớp key với đơn.
 */
function inferProductMarketFromOrders(row, ordersList) {
  const d = normalizeNgayForKey(row['Ngày']);
  const n = normalizeNameForKey(row['Tên']);
  if (!d || !n) return null;
  const rowSp = String(row['Sản_phẩm'] ?? '').trim();
  const rowTt = String(row['Thị_trường'] ?? '').trim();
  const seen = new Map();
  for (const o of ordersList || []) {
    if (normalizeNgayForKey(o.order_date) !== d) continue;
    if (normalizeNameForKey(o.marketing_staff) !== n) continue;
    const p = String(o.product ?? '').trim();
    const c = String(o.country ?? '').trim();
    if (rowSp && normalizeFieldForKey(p) !== normalizeFieldForKey(rowSp)) continue;
    if (rowTt && normalizeFieldForKey(c) !== normalizeFieldForKey(rowTt)) continue;
    const pk = `${normalizeFieldForKey(p)}|${normalizeFieldForKey(c)}`;
    if (!pk || pk === '|') continue;
    if (!seen.has(pk)) seen.set(pk, { product: p, market: c });
  }
  if (seen.size !== 1) return null;
  return [...seen.values()][0];
}

function effectiveKeyPartsForReportRow(r, ordersList) {
  let product = String(r['Sản_phẩm'] ?? '').trim();
  let market = String(r['Thị_trường'] ?? '').trim();
  const inf = inferProductMarketFromOrders(
    { ...r, 'Sản_phẩm': product, 'Thị_trường': market },
    ordersList
  );
  const patchProduct = !product && !!inf?.product;
  const patchMarket = !market && !!inf?.market;
  if (patchProduct) product = inf.product;
  if (patchMarket) market = inf.market;
  const key = buildKey(r['Ngày'], r['Tên'], product, market);
  return { product, market, key, patchProduct, patchMarket };
}

/** SP/TT: trim + lower + bỏ ký tự ẩn (không bỏ dấu câu như Tên — tránh gộp nhầm SP khác nhau). */
function normalizeFieldForKey(v) {
  let s = String(v ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\p{Cf}+/gu, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  // "20 x" / "20  x" → "20x" (hai dòng nhập khác nhau vẫn cùng key)
  s = s.replace(/(\d)\s+([a-z])/gi, '$1$2');
  s = s.replace(/([a-z])\s+(\d)/gi, '$1$2');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Ngày trong key: ưu tiên parse giống bảng (parseSmartDate) để DD/MM, ISO+TZ, v.v. về cùng YYYY-MM-DD.
 * Giữ Date object theo local như normalizeDateStr — tránh lệch ngày do chuỗi ISO.
 */
function normalizeNgayForKey(dateVal) {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    const year = dateVal.getFullYear();
    const month = String(dateVal.getMonth() + 1).padStart(2, '0');
    const day = String(dateVal.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const d = parseSmartDate(dateVal);
  if (d && !isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return normalizeDateStr(dateVal);
}

function buildKey(dateStr, name, product, market) {
  // Key(R) = lower(Ngày | Tên | Sản_phẩm | Thị_trường)
  // Key(F) = lower(formatDate(Ngày_lên_đơn) | Nhân_viên_Marketing | Mặt_hàng | Khu_vực)
  return [
    normalizeNgayForKey(dateStr),
    normalizeNameForKey(name),
    normalizeFieldForKey(product),
    normalizeFieldForKey(market),
  ].join('|');
}

/**
 * Chuẩn ca về segment key (Ngày|Tên|SP|TT|ca) — cùng logic tách phẩy với orderShiftToGroups.
 * Có «Hết ca» (kể cả chuỗi «Giữa ca, Hết ca») → luôn `het` — khớp cách recalc lấy primaryGroup = Hết ca cho dòng gộp 2 ca.
 */
function normalizeCaForRowKey(caVal) {
  const s = normalizeFieldForKey(caVal);
  if (!s) return 'het';
  const g = orderShiftToGroups(caVal);
  const hasHet = g.includes('Hết ca');
  const hasGua = g.includes('Giữa ca');
  if (hasHet) return 'het';
  if (hasGua) return 'gua';
  return s;
}

/**
 * Key 1 dòng detail_reports — trùng với logic recalc (buildKey + ca).
 * Dùng chung UI để không cộng trùng Số đơn thực tế khi có bản ghi trùng / lệch parse ngày.
 */
export function buildMktDetailReportRowKey(row) {
  const r = row || {};
  const ngay = r['Ngày'] ?? r.ngay ?? r.date;
  const ten = r['Tên'] ?? r.ten ?? r.name;
  const sp = r['Sản_phẩm'] ?? r['Sản phẩm'] ?? r.san_pham ?? r.product;
  const tt = r['Thị_trường'] ?? r['Thị trường'] ?? r.thi_truong ?? r.market;
  const caRaw = r.ca ?? r['Ca'] ?? r.shift;
  const base = buildKey(ngay, ten, sp, tt);
  return `${base}|${normalizeCaForRowKey(caRaw)}`;
}

function parseSoDonThucTeFromRow(row) {
  if (!row) return 0;
  const v = row['Số đơn thực tế'] ?? row.so_don_thuc_te;
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  const s = String(v).trim().replace(/\./g, '').replace(/,/g, '');
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseSoDonHoanHuyFromRow(row) {
  if (!row) return 0;
  const v = row['Số đơn hoàn hủy'] ?? row['Số đơn hoàn hủy thực tế'];
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  const s = String(v).trim().replace(/\./g, '').replace(/,/g, '');
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Cột «Số đơn» nhập tay trên báo cáo — recalc không ghi đè. */
function parseSoDonBaoCaoTayFromRow(row) {
  if (!row) return 0;
  const v = row['Số đơn'] ?? row.so_don;
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  const s = String(v).trim().replace(/\./g, '').replace(/,/g, '');
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseDoanhSoChotTTFromRow(row) {
  if (!row) return 0;
  return Number(row['Doanh số TT'] ?? row.doanh_so_tt ?? 0) || 0;
}

function parseCpqcFromRow(row) {
  if (!row) return 0;
  const v = row['CPQC'] ?? row.cpqc;
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(/\./g, '').replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseSoMessCmtFromRow(row) {
  if (!row) return 0;
  const v = row['Số_Mess_Cmt'] ?? row.so_mess_cmt;
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  const s = String(v).trim().replace(/\./g, '').replace(/,/g, '');
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Trùng `id` (API lặp) hoặc trùng key logic → gộp một dòng:
 * chỉ CPQC và Số_Mess_Cmt: tổng; Số đơn TT / hoàn hủy / DS Chốt TT: max; «Số đơn» (nhập tay): max.
 */
export function dedupeMktDetailReportRows(rows) {
  const merged = mergeUniqueRowsById(rows || []);
  const byKey = new Map();
  for (const row of merged) {
    const k = buildMktDetailReportRowKey(row);
    const sd = parseSoDonThucTeFromRow(row);
    const sh = parseSoDonHoanHuyFromRow(row);
    const sm = parseSoDonBaoCaoTayFromRow(row);
    const ds = parseDoanhSoChotTTFromRow(row);
    const cpqc = parseCpqcFromRow(row);
    const mess = parseSoMessCmtFromRow(row);

    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, { row, sd, sh, sm, ds, cpqc, mess });
      continue;
    }

    const mergedSd = Math.max(prev.sd, sd);
    const mergedSh = Math.max(prev.sh, sh);
    const mergedSm = Math.max(prev.sm, sm);
    const mergedDs = Math.max(prev.ds, ds);
    const mergedCpqc = prev.cpqc + cpqc;
    const mergedMess = prev.mess + mess;

    prev.sd = mergedSd;
    prev.sh = mergedSh;
    prev.sm = mergedSm;
    prev.ds = mergedDs;
    prev.cpqc = mergedCpqc;
    prev.mess = mergedMess;
    prev.row['Số đơn thực tế'] = mergedSd;
    prev.row['Số đơn hoàn hủy'] = mergedSh;
    prev.row['Số đơn hoàn hủy thực tế'] = mergedSh;
    prev.row['Số đơn'] = mergedSm;
    prev.row['Doanh số TT'] = mergedDs;
    prev.row['CPQC'] = mergedCpqc;
    prev.row['Số_Mess_Cmt'] = mergedMess;
    if (prev.row.so_don_thuc_te != null) prev.row.so_don_thuc_te = mergedSd;
    if (prev.row.doanh_so_tt != null) prev.row.doanh_so_tt = mergedDs;
    if (prev.row.cpqc != null) prev.row.cpqc = mergedCpqc;
    if (prev.row.so_mess_cmt != null) prev.row.so_mess_cmt = mergedMess;
  }

  return [...byKey.values()].map((m) => m.row);
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `mkt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** Gắn nhãn bảng + gợi ý khi lỗi mạng (Failed to fetch). */
function wrapRecalcReadError(table, err) {
  const raw = err?.message || err?.hint || String(err);
  const isNetwork =
    err?.name === 'TypeError' ||
    (typeof raw === 'string' && raw.toLowerCase().includes('failed to fetch'));
  if (isNetwork) {
    const hasEnv =
      typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_SUPABASE_URL &&
      import.meta.env?.VITE_SUPABASE_ANON_KEY;
    const envHint = hasEnv
      ? 'Đã có VITE_SUPABASE_* — kiểm tra URL đúng https://….supabase.co, mạng/VPN/firewall, dự án Supabase không Pause, tắt extension chặn request, thử trình duyệt khác.'
      : 'Thiếu hoặc chưa nạp .env: thêm VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY, rồi dừng và chạy lại npm run dev.';
    return new Error(`[${table}] ${raw}. ${envHint}`);
  }
  if (err && typeof err === 'object' && err.code) {
    return new Error(`[${table}] ${raw} (code: ${err.code})`);
  }
  return new Error(`[${table}] ${raw}`);
}

const ORDERS_EXTERNAL_API_BASE = 'https://lumidataapi.vercel.app';

/** YYYY-MM-DD → DD/MM/YYYY (lumidataapi). */
function ymdToApiDdMmYyyy(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '').trim());
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function mapExternalApiOrderToRecalcShape(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const order_date = normalizeDateStr(raw.order_date ?? raw.ngaydonghang ?? raw.date ?? '');
  const marketing_staff = String(
    raw.marketing_staff ??
      raw.nhanvien_marketing ??
      raw.nhan_vien_marketing ??
      raw.Nhan_vien_Marketing ??
      raw.marketingStaff ??
      ''
  ).trim();
  const product = String(
    raw.product ?? raw.san_pham ?? raw.mat_hang ?? raw.San_pham ?? raw['mặt_hàng'] ?? ''
  ).trim();
  const country = String(
    raw.country ?? raw.thi_truong ?? raw.khu_vuc ?? raw.Khu_vuc ?? raw.market ?? ''
  ).trim();
  return {
    order_code: raw.order_code,
    order_date,
    marketing_staff,
    product,
    country,
    shift: raw.shift ?? raw.ca ?? '',
    team: raw.team ?? '',
    check_result: raw.check_result ?? '',
    payment_status: raw.payment_status ?? '',
    total_amount_vnd: raw.total_amount_vnd,
    total_vnd: raw.total_vnd,
    reconciled_vnd: raw.reconciled_vnd,
    goods_amount: raw.goods_amount,
    sale_price: raw.sale_price,
  };
}

/**
 * Lấy đơn theo khoảng ngày từ lumidataapi (`/orders` hoặc `/order_hcm`).
 */
async function fetchAllOrdersInRangeViaExternalApi(startDate, endDate, apiPath) {
  const from_date = ymdToApiDdMmYyyy(startDate);
  const to_date = ymdToApiDdMmYyyy(endDate);
  if (!from_date || !to_date) {
    throw new Error('Khoảng ngày không hợp lệ cho API đơn.');
  }
  const rawPath = apiPath || '/orders';
  const path = String(rawPath).startsWith('/') ? rawPath : `/${rawPath}`;
  const all = [];
  let next_after_id;
  for (let guard = 0; guard < 600; guard += 1) {
    const params = new URLSearchParams();
    params.set('from_date', from_date);
    params.set('to_date', to_date);
    if (next_after_id) params.set('next_after_id', next_after_id);
    const url = `${ORDERS_EXTERNAL_API_BASE}${path}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`${path} HTTP ${res.status}: ${t || res.statusText}`);
    }
    const json = await res.json();
    const chunk = json?.data || [];
    for (const row of chunk) {
      const mapped = mapExternalApiOrderToRecalcShape(row);
      if (mapped && mapped.order_date) all.push(mapped);
    }
    next_after_id = json?.next_after_id;
    if (!next_after_id) break;
  }
  return all;
}

/** Gộp đơn API + Supabase: ưu tiên thứ tự API trước, bổ sung mã chưa có (tránh đếm trùng). */
function mergeOrdersByOrderCode(apiOrders, supaOrders) {
  const out = [...(apiOrders || [])];
  const codes = new Set(
    out.map((o) => String(o?.order_code ?? '').trim()).filter(Boolean)
  );
  for (const o of supaOrders || []) {
    const c = String(o?.order_code ?? '').trim();
    if (c && !codes.has(c)) {
      codes.add(c);
      out.push(o);
    }
  }
  return out;
}

function isOrderHcmApiPath(ordersApiPath) {
  return String(ordersApiPath || '')
    .toLowerCase()
    .includes('order_hcm');
}

async function fetchAllOrdersInRangeFromSupabaseTable(startDate, endDate, tableName = 'orders') {
  const table = String(tableName || 'orders').trim() || 'orders';
  const PAGE_SIZE = 2000;
  const orders = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(
        'order_code, order_date, marketing_staff, product, country, shift, team, check_result, payment_status, total_amount_vnd, total_vnd, reconciled_vnd, goods_amount, sale_price'
      )
      .gte('order_date', startDate)
      .lte('order_date', endDate)
      .order('order_date', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    orders.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return orders;
}

async function fetchAllReportsInRange(startDate, endDate, reportsTableName) {
  const table = reportsTableName || 'detail_reports';
  const PAGE_SIZE = 1000;
  const reports = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gte('Ngày', startDate)
      .lte('Ngày', endDate)
      .order('Ngày', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    reports.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return reports;
}

async function fetchAllOrdersInRangeFromSupabase(startDate, endDate) {
  return fetchAllOrdersInRangeFromSupabaseTable(startDate, endDate, 'orders');
}

async function fetchReportsForExactKeys(exactKeys, reportsTableName) {
  const table = reportsTableName || 'detail_reports';
  const rows = [];
  const seen = new Set();
  for (const k of exactKeys) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('Ngày', k.date)
      .ilike('Tên', k.name);
    if (error) throw error;
    for (const r of data || []) {
      const rp = normalizeFieldForKey(r['Sản_phẩm'] || '');
      const rc = normalizeFieldForKey(r['Thị_trường'] || '');
      const kp = normalizeFieldForKey(k.product);
      const kc = normalizeFieldForKey(k.market);
      if (rp !== kp || rc !== kc) continue;

      const id = r?.id ? String(r.id) : `${r?.['Ngày'] || ''}|${r?.['Tên'] || ''}|${r?.['Sản_phẩm'] || ''}|${r?.['Thị_trường'] || ''}|${r?.ca || ''}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(r);
    }
  }
  return rows;
}

async function fetchOrdersForExactKeysFromSupabaseTable(exactKeys, tableName = 'orders') {
  const table = String(tableName || 'orders').trim() || 'orders';
  const rows = [];
  const seen = new Set();
  for (const k of exactKeys) {
    const next = nextDateStr(k.date);
    const { data, error } = await supabase
      .from(table)
      .select(
        'order_code, order_date, marketing_staff, product, country, shift, team, check_result, payment_status, total_amount_vnd, total_vnd, reconciled_vnd, goods_amount, sale_price'
      )
      .gte('order_date', k.date)
      .lt('order_date', next)
      .ilike('marketing_staff', k.name);
    if (error) throw error;
    for (const r of data || []) {
      const rp = normalizeFieldForKey(r.product || '');
      const rc = normalizeFieldForKey(r.country || '');
      const kp = normalizeFieldForKey(k.product);
      const kc = normalizeFieldForKey(k.market);
      if (rp !== kp || rc !== kc) continue;

      const id = String(r?.order_code || '');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      rows.push(r);
    }
  }
  return rows;
}

async function fetchOrdersForExactKeysFromSupabase(exactKeys) {
  return fetchOrdersForExactKeysFromSupabaseTable(exactKeys, 'orders');
}

function filterOrdersMatchingExactKeys(ordersList, exactKeys) {
  if (!exactKeys?.length) return ordersList || [];
  return (ordersList || []).filter((o) =>
    exactKeys.some(
      (k) =>
        buildKey(o.order_date, o.marketing_staff, o.product, o.country) === buildKey(k.date, k.name, k.product, k.market)
    )
  );
}

async function fetchHumanResourceEmailLookup() {
  const { data, error } = await supabase
    .from('human_resources')
    .select('"Họ Và Tên", email, Team');

  if (error) {
    console.warn('[MKT recalc] human_resources:', error.message);
    return buildEmailByNameLookup([]);
  }
  return buildEmailByNameLookup(data || []);
}

/** Team từ human_resources theo tên (khi users không có team). */
function teamFromNameHr(name, hrLookup) {
  if (!hrLookup?.list || !name) return '';
  const n = normalizeStr(name);
  for (const row of hrLookup.list) {
    const raw = row['Họ Và Tên'] ?? row['Họ và Tên'] ?? row.name ?? row['Tên'] ?? '';
    if (normalizeStr(raw) === n) {
      return String(row.Team ?? row.team ?? '').trim();
    }
  }
  return '';
}

/**
 * Lấy email + team từ bảng users (ưu tiên khớp cả tên lẫn email khi có đủ hai giá trị).
 */
async function fetchUsersIdentityLookup() {
  const { data, error } = await supabase.from('users').select('name, email, team, department');

  if (error) {
    console.warn('[MKT recalc] users identity:', error.message);
    return { byName: new Map(), byEmail: new Map() };
  }

  const byName = new Map();
  const byEmail = new Map();

  for (const row of data || []) {
    const name = String(row?.name || '').trim();
    const email = String(row?.email || '').trim();
    const team = String(row?.team || '').trim();
    const department = String(row?.department || '').trim();
    const nameKey = normalizeStr(name);
    const emailKey = normalizeEmail(email);

    if (nameKey && !byName.has(nameKey)) {
      byName.set(nameKey, { email, team, department });
    }
    if (emailKey && !byEmail.has(emailKey)) {
      byEmail.set(emailKey, { name, nameKey, email, team, department });
    }
  }

  return { byName, byEmail };
}

/**
 * @param {string} name - Tên hiển thị (vd. marketing_staff, cột Tên)
 * @param {string} [emailFromRow] - Email trên dòng báo cáo (nếu có)
 * @param {{ byName: Map, byEmail: Map }} lookup
 */
function resolveUserTeamEmail(name, emailFromRow, lookup) {
  const { byName, byEmail } = lookup || { byName: new Map(), byEmail: new Map() };
  const nameKey = normalizeStr(name);
  const emailKey = normalizeEmail(emailFromRow);

  if (nameKey && emailKey) {
    const byN = byName.get(nameKey);
    if (byN && normalizeEmail(byN.email) === emailKey) {
      return { email: byN.email, team: byN.team, department: byN.department };
    }
    const byE = byEmail.get(emailKey);
    if (byE && normalizeStr(byE.name) === nameKey) {
      return { email: byE.email, team: byE.team, department: byE.department };
    }
  }

  if (emailKey) {
    const byE = byEmail.get(emailKey);
    if (byE) return { email: byE.email, team: byE.team, department: byE.department };
  }

  if (nameKey) {
    const byN = byName.get(nameKey);
    if (byN) return { email: byN.email, team: byN.team, department: byN.department };
  }

  return { email: '', team: '', department: '' };
}

export async function recalcMktSoDonThucTeFromOrders({
  startDate,
  endDate,
  dryRun = false,
  // true: tạo dòng detail_reports cho key (ngày+Tên+SP+TT+ca) có đơn nhưng chưa có dòng; tên ưu tiên theo bản ghi đã có, không thì lấy marketing_staff trên đơn.
  createMissingRows = false,
  // Chỉ tính đúng các key này (không quét key khác trong ngày) khi có truyền vào.
  exactKeys = null,
  /** Bảng báo cáo MKT (vd. marketing_report_hcm). */
  reportsTableName = 'detail_reports',
  /**
   * Lấy đơn từ bảng Supabase (vd. `order_code_hcm`). Nếu set thì **không** gọi API `ordersApiPath`.
   * Dùng cùng stack HCM: báo cáo `marketing_report_hcm` + đơn `order_code_hcm`.
   */
  ordersSupabaseTable = null,
  /**
   * Lấy đơn từ lumidataapi (khi không dùng `ordersSupabaseTable`).
   * Ví dụ: `/order_hcm`.
   */
  ordersApiPath = null,
} = {}) {
  const normalizedStart = normalizeDateStr(startDate);
  const normalizedEnd = normalizeDateStr(endDate);
  const reportsTable = String(reportsTableName || 'detail_reports').trim() || 'detail_reports';

  if (!normalizedStart || !normalizedEnd) {
    throw new Error('Khoảng ngày không hợp lệ. Vui lòng truyền startDate/endDate dạng YYYY-MM-DD.');
  }

  const normalizedExactKeys = Array.isArray(exactKeys)
    ? exactKeys
        .map((k) => ({
          date: normalizeDateStr(k?.date),
          name: String(k?.name || '').trim(),
          product: String(k?.product || '').trim(),
          market: String(k?.market || '').trim(),
        }))
        .filter((k) => k.date && k.name && k.product && k.market)
    : [];

  // Tuần tự để lỗi báo đúng bảng (Promise.all chỉ thấy “Failed to fetch” chung)
  let reports;
  let orders;
  let hrEmailLookup;
  let usersLookup;
  try {
    reports = normalizedExactKeys.length > 0
      ? await fetchReportsForExactKeys(normalizedExactKeys, reportsTable)
      : await fetchAllReportsInRange(normalizedStart, normalizedEnd, reportsTable);
  } catch (e) {
    throw wrapRecalcReadError(reportsTable, e);
  }
  try {
    let rangeStart = normalizedStart;
    let rangeEnd = normalizedEnd;
    if (normalizedExactKeys.length > 0) {
      const ds = normalizedExactKeys.map((k) => k.date).sort();
      rangeStart = ds[0];
      rangeEnd = ds[ds.length - 1];
    }

    const ordersTableOpt = String(ordersSupabaseTable || '').trim();

    if (ordersTableOpt) {
      orders =
        normalizedExactKeys.length > 0
          ? await fetchOrdersForExactKeysFromSupabaseTable(normalizedExactKeys, ordersTableOpt)
          : await fetchAllOrdersInRangeFromSupabaseTable(rangeStart, rangeEnd, ordersTableOpt);
      orders = filterOrdersMatchingExactKeys(orders, normalizedExactKeys);
    } else if (ordersApiPath) {
      const rawList = await fetchAllOrdersInRangeViaExternalApi(rangeStart, rangeEnd, ordersApiPath);
      let merged = filterOrdersMatchingExactKeys(rawList, normalizedExactKeys);
      if (isOrderHcmApiPath(ordersApiPath)) {
        const localOrders = await fetchAllOrdersInRangeFromSupabaseTable(rangeStart, rangeEnd, 'order_code_hcm');
        merged = mergeOrdersByOrderCode(merged, localOrders);
        merged = filterOrdersMatchingExactKeys(merged, normalizedExactKeys);
      }
      orders = merged;
    } else {
      orders =
        normalizedExactKeys.length > 0
          ? await fetchOrdersForExactKeysFromSupabase(normalizedExactKeys)
          : await fetchAllOrdersInRangeFromSupabase(normalizedStart, normalizedEnd);
    }
  } catch (e) {
    const src = String(ordersSupabaseTable || '').trim() || ordersApiPath || 'orders';
    throw wrapRecalcReadError(src, e);
  }
  try {
    hrEmailLookup = await fetchHumanResourceEmailLookup();
  } catch (e) {
    throw wrapRecalcReadError('human_resources', e);
  }
  try {
    usersLookup = await fetchUsersIdentityLookup();
  } catch (e) {
    throw wrapRecalcReadError('users', e);
  }

  /*
   * Ca (shift) và số liệu:
   * - Đơn: tách nhóm Hết ca / Giữa ca như cũ (kể cả shift gộp trên đơn).
   * - Dòng báo cáo lưu ca chuẩn «Giữa ca,Hết ca»: cập nhật số = tổng đơn khớp key của cả hai nhóm; patch.ca giữ chuỗi gộp.
   * - Dòng một ca (legacy): vẫn cập nhật theo đúng một nhóm.
   * - Ca trống / không nhận diện khi recalc: coi là Hết ca để gom đơn; patch.ca ghi «Giữa ca,Hết ca» khi auto-điền.
   */
  // countsByGroup: Map value { count, totalRevenueVnd, cancelCount, cancelRevenueVnd, sample }
  const countsByGroup = {
    'Hết ca': new Map(),
    'Giữa ca': new Map(),
  };

  // B2: Gom mọi đơn khớp key + đơn/DS hủy (Check = Hủy). Ghi Số đơn thực tế (TT) & Doanh số TT = tổng − phần hủy. Cột «Số đơn» nhập tay — không cập nhật.
  for (const order of orders || []) {
    const groups = orderShiftGroupsForRecalc(order.shift);

    if (!normalizeNgayForKey(order.order_date) || !normalizeNameForKey(order.marketing_staff)) continue;

    const key = buildKey(order.order_date, order.marketing_staff, order.product, order.country);
    if (!key) continue;

    const vnd = orderAmountVnd(order);
    const huy = isCheckResultHuy(getCheckResult(order));

    for (const group of groups) {
      const mapForGroup = countsByGroup[group];
      const existing = mapForGroup.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalRevenueVnd += vnd;
        if (huy) {
          existing.cancelCount += 1;
          existing.cancelRevenueVnd += vnd;
        }
      } else {
        mapForGroup.set(key, {
          count: 1,
          totalRevenueVnd: vnd,
          cancelCount: huy ? 1 : 0,
          cancelRevenueVnd: huy ? vnd : 0,
          sample: {
            date: normalizeDateStr(order.order_date),
            name: String(order.marketing_staff || '').trim(),
            product: String(order.product || '').trim(),
            market: String(order.country || '').trim(),
            team: String(order.team || '').trim(),
          },
        });
      }
    }
  }

  // existingByCaKey: caGroup|key => đã có dòng báo cáo (tránh tạo trùng)
  const existingByCaKey = new Set();
  const reportRows = (reports || []).filter(
    (r) => normalizeNgayForKey(r['Ngày']) && normalizeNameForKey(r['Tên'])
  );

  // canonicalNameByNormalized: normalizedName -> Tên chuẩn đã có trong detail_reports (nếu có).
  // Khi tạo dòng mới: ưu tiên tên chuẩn này; nếu chưa có → dùng tên trên đơn (marketing_staff).
  const canonicalNameByNormalized = new Map();
  for (const r of reportRows) {
    const nm = canonicalNameByNormalized.get(normalizeNameForKey(r['Tên']));
    if (!nm) canonicalNameByNormalized.set(normalizeNameForKey(r['Tên']), String(r['Tên'] ?? '').trim());
  }

  for (const r of reportRows) {
    const ek = effectiveKeyPartsForReportRow(r, orders);
    const key = ek.key;
    if (!key) continue;
    const gs = reportCaGroupsForRecalc(r.ca);
    if (!gs.length) continue;
    if (gs.length === 1) {
      existingByCaKey.add(`${gs[0]}|${key}`);
    } else if (gs.length === 2) {
      // Một dòng gộp 2 ca → đã có cả hai nhóm, không tạo thêm dòng «Giữa ca» trùng key.
      existingByCaKey.add(`Hết ca|${key}`);
      existingByCaKey.add(`Giữa ca|${key}`);
    }
  }

  const updateRows = [];
  const createRows = [];
  const previewRows = [];
  const PREVIEW_LIMIT = 50;

  // 1) Update existing reports' "Số đơn thực tế"
  for (const r of reportRows) {
    const gs = reportCaGroupsForRecalc(r.ca);
    if (!gs.length) continue;
    const ek = effectiveKeyPartsForReportRow(r, orders);
    const key = ek.key;
    const hadExplicitCa = reportCaToGroups(r.ca).length > 0;
    const primaryGroup = gs.length === 2 ? 'Hết ca' : gs[0];
    const agg =
      gs.length === 2
        ? mergeOrderAggs(countsByGroup['Hết ca']?.get(key), countsByGroup['Giữa ca']?.get(key))
        : countsByGroup[primaryGroup]?.get(key);
    const grossCount = agg?.count || 0;
    const soDonHoanHuyTT = agg?.cancelCount ?? 0;
    const dsHoanHuyTT = agg?.cancelRevenueVnd ?? 0;
    const grossDoanhSoTT = agg?.totalRevenueVnd ?? 0;
    const count = Math.max(0, grossCount - soDonHoanHuyTT);
    const doanhSoTT = Math.max(0, grossDoanhSoTT - dsHoanHuyTT);

    if (!r.id) continue;
    const resolved = resolveUserTeamEmail(r['Tên'], r['Email'], usersLookup);
    const patch = {
      id: r.id,
      'Số đơn thực tế': count,
      'Doanh số TT': doanhSoTT,
      // «Số đơn hoàn hủy»: tổng đơn Check = Hủy (cùng số với Số đơn hoàn hủy thực tế).
      'Số đơn hoàn hủy': soDonHoanHuyTT,
      'Số đơn hoàn hủy thực tế': soDonHoanHuyTT,
      'Doanh số hoàn hủy thực tế': dsHoanHuyTT,
    };
    if (gs.length === 2) {
      patch.ca = REPORT_CA_COMBINED;
    } else if (!hadExplicitCa) {
      patch.ca = REPORT_CA_COMBINED;
    }
    if (ek.patchProduct) patch['Sản_phẩm'] = ek.product;
    if (ek.patchMarket) patch['Thị_trường'] = ek.market;
    const rowEmail = String(r['Email'] ?? '').trim();
    const rowTeam = String(r['Team'] ?? '').trim();
    // Chỉ tự điền khi đang trống: users (theo tên+email) → HR
    if (!rowEmail) {
      if (resolved.email) patch['Email'] = resolved.email;
      else {
        const hrEmail = emailFromName(r['Tên'], hrEmailLookup);
        if (hrEmail) patch['Email'] = hrEmail;
      }
    }
    if (!rowTeam) {
      if (resolved.team) patch['Team'] = resolved.team;
    }
    const rowDepartment = String(r['department'] ?? '').trim();
    if (!rowDepartment && resolved.department && reportsTableName !== 'marketing_report_hcm') {
      patch['department'] = resolved.department;
    }
    updateRows.push(patch);

    if (previewRows.length < PREVIEW_LIMIT) {
      previewRows.push({
        ca: gs.length === 2 ? REPORT_CA_COMBINED : primaryGroup,
        'Ngày': normalizeDateStr(r['Ngày']),
        'Tên': String(r['Tên'] || '').trim(),
        'Sản_phẩm': ek.product,
        'Thị_trường': ek.market,
        'Số đơn thực tế': count,
        'Doanh số TT': doanhSoTT,
        'Số đơn hoàn hủy': soDonHoanHuyTT,
        'Số đơn hoàn hủy thực tế': soDonHoanHuyTT,
        'Doanh số hoàn hủy thực tế': dsHoanHuyTT,
        action: 'update',
        autoFilledKey: ek.patchProduct || ek.patchMarket || !hadExplicitCa,
      });
    }
  }

  // 2) Create missing report rows — một dòng / key với ca «Giữa ca,Hết ca» (tổng cả hai nhóm)
  if (createMissingRows) {
    const allKeys = new Set([
      ...countsByGroup['Hết ca'].keys(),
      ...countsByGroup['Giữa ca'].keys(),
    ]);
    for (const key of allKeys) {
      const existsHet = existingByCaKey.has(`Hết ca|${key}`);
      const existsGua = existingByCaKey.has(`Giữa ca|${key}`);
      if (existsHet || existsGua) continue;

      const entry = mergeOrderAggs(
        countsByGroup['Hết ca'].get(key),
        countsByGroup['Giữa ca'].get(key)
      );
      if (!entry) continue;

      const rawNameFromOrder = String(entry.sample.name || '').trim();
      if (!rawNameFromOrder) continue;
      const normalizedName = normalizeNameForKey(rawNameFromOrder);
      const canonicalName =
        canonicalNameByNormalized.get(normalizedName) || rawNameFromOrder;

      const resolved = resolveUserTeamEmail(canonicalName, '', usersLookup);
      const email = resolved.email || emailFromName(canonicalName, hrEmailLookup) || '';
      const resolvedTeam = resolved.team || null;

      const cc = entry.cancelCount ?? 0;
      const crv = entry.cancelRevenueVnd ?? 0;
      const netSoDon = Math.max(0, (entry.count ?? 0) - cc);
      const netDoanhSoTT = Math.max(0, (entry.totalRevenueVnd ?? 0) - crv);
      const row = {
        id: makeId(),
        'Tên': canonicalName,
        'Email': email,
        'Ngày': entry.sample.date,
        ca: REPORT_CA_COMBINED,
        'Sản_phẩm': entry.sample.product,
        'Thị_trường': entry.sample.market,
        'Team': resolvedTeam,
        'Số đơn thực tế': netSoDon,
        'Doanh số TT': netDoanhSoTT,
        'Số đơn hoàn hủy': cc,
        'Số đơn hoàn hủy thực tế': cc,
        'Doanh số hoàn hủy thực tế': crv,
      };
      if (reportsTableName !== 'marketing_report_hcm' && resolved.department) {
        row['department'] = resolved.department;
      }
      createRows.push(row);
      existingByCaKey.add(`Hết ca|${key}`);
      existingByCaKey.add(`Giữa ca|${key}`);

      if (previewRows.length < PREVIEW_LIMIT) {
        previewRows.push({
          ca: REPORT_CA_COMBINED,
          'Ngày': row['Ngày'],
          'Tên': row['Tên'],
          'Sản_phẩm': row['Sản_phẩm'],
          'Thị_trường': row['Thị_trường'],
          'Số đơn thực tế': row['Số đơn thực tế'],
          'Doanh số TT': row['Doanh số TT'],
          'Số đơn hoàn hủy': row['Số đơn hoàn hủy'],
          'Số đơn hoàn hủy thực tế': row['Số đơn hoàn hủy thực tế'],
          'Doanh số hoàn hủy thực tế': row['Doanh số hoàn hủy thực tế'],
          action: 'create',
        });
      }
    }
  }

  if (dryRun) {
    return {
      success: true,
      reportsFetched: reportRows.length,
      ordersFetched: orders?.length || 0,
      updatedExisting: updateRows.length,
      createdMissing: createRows.length,
      upsertCount: updateRows.length + createRows.length,
      previewRows,
    };
  }

  // Cập nhật từng dòng — đồng thời thấp; lỗi mạng thì fallback từng dòng
  const UPDATE_CONCURRENCY = 4;
  let touched = 0;

  for (let i = 0; i < updateRows.length; i += UPDATE_CONCURRENCY) {
    const chunk = updateRows.slice(i, i + UPDATE_CONCURRENCY);
    try {
      const results = await Promise.all(
        chunk.map((row) => {
          const { id, ...rest } = row;
          return supabase.from(reportsTable).update(rest).eq('id', id);
        })
      );
      const firstErr = results.find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
    } catch (e) {
      const raw = e?.message || String(e);
      const isNetwork =
        e?.name === 'TypeError' ||
        (typeof raw === 'string' && raw.toLowerCase().includes('failed to fetch'));
      if (!isNetwork) throw wrapRecalcReadError(`${reportsTable} (cập nhật)`, e);
      for (const row of chunk) {
        const { id, ...rest } = row;
        const { error } = await supabase.from(reportsTable).update(rest).eq('id', id);
        if (error) throw wrapRecalcReadError(`${reportsTable} (cập nhật)`, error);
      }
    }
    touched += chunk.length;
  }

  const INSERT_CHUNK = 200;
  for (let i = 0; i < createRows.length; i += INSERT_CHUNK) {
    const chunk = createRows.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from(reportsTable).insert(chunk);
    if (error) throw error;
    touched += chunk.length;
  }

  return {
    success: true,
    reportsFetched: reportRows.length,
    ordersFetched: orders?.length || 0,
    updatedExisting: updateRows.length,
    createdMissing: createRows.length,
    upserted: touched,
    previewRows,
  };
}

/**
 * Sau khi Lưu / Cập nhật đơn (nhap-don): tính lại Số đơn thực tế (TT), Doanh số TT (đã trừ đơn/VND hủy), cột Số đơn hoàn hủy + đơn/DS hoàn hủy thực tế (chỉ đơn Check = Hủy). Cột «Số đơn» nhập tay không cập nhật.
 *
 * @param {string} newOrderDate - Ngày đơn sau lưu (YYYY-MM-DD hoặc string DB)
 * @param {string} [previousOrderDate] - Khi sửa đơn: ngày đơn trước khi đổi (fallback khi không có key cũ/mới)
 * @param {{date:string,name:string,product:string,market:string}} [newOrderKey]
 * @param {{date:string,name:string,product:string,market:string}} [previousOrderKey]
 */
export async function recalcMktSoDonAfterOrderSave({
  newOrderDate,
  previousOrderDate,
  newOrderKey,
  previousOrderKey,
  createMissingRows = true,
  reportsTableName = 'detail_reports',
  ordersSupabaseTable = null,
  ordersApiPath = null,
} = {}) {
  const exactKeys = [newOrderKey, previousOrderKey]
    .filter(Boolean)
    .map((k) => ({
      date: normalizeDateStr(k.date),
      name: String(k.name || '').trim(),
      product: String(k.product || '').trim(),
      market: String(k.market || '').trim(),
    }))
    .filter((k) => k.date && k.name);

  if (exactKeys.length > 0) {
    const keyMap = new Map();
    exactKeys.forEach((k) => {
      const id = buildKey(k.date, k.name, k.product, k.market);
      if (!keyMap.has(id)) keyMap.set(id, k);
    });
    const dedupedKeys = Array.from(keyMap.values());
    const dates = dedupedKeys.map((k) => k.date).sort();
    return recalcMktSoDonThucTeFromOrders({
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      dryRun: false,
      createMissingRows,
      exactKeys: dedupedKeys,
      reportsTableName,
      ordersSupabaseTable,
      ordersApiPath,
    });
  }

  const n = normalizeDateStr(newOrderDate);
  const p = previousOrderDate != null && previousOrderDate !== '' ? normalizeDateStr(previousOrderDate) : '';
  if (!n && !p) {
    return { skipped: true, reason: 'no_dates' };
  }
  const dates = [n, p].filter(Boolean).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  return recalcMktSoDonThucTeFromOrders({
    startDate,
    endDate,
    dryRun: false,
    createMissingRows,
    reportsTableName,
    ordersSupabaseTable,
    ordersApiPath,
  });
}

