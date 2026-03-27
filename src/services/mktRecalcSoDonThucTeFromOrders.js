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

/** Parse cột ca giống orders.shift: một ca hoặc "Giữa ca,Hết ca" → 2 nhóm. */
function reportCaToGroups(caVal) {
  return orderShiftToGroups(caVal);
}

function orderShiftToGroups(shiftVal) {
  const shiftLower = normalizeStr(shiftVal);
  const groups = [];
  if (!shiftLower) return groups;

  if (shiftLower.includes('hết ca') || shiftLower.includes('het ca')) groups.push('Hết ca');
  if (shiftLower.includes('giữa ca') || shiftLower.includes('giua ca')) groups.push('Giữa ca');
  return groups;
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

/** Chuẩn ca về nhãn cố định để 2 dòng cùng ca không tách key do khoảng trắng/dấu. */
function normalizeCaForRowKey(caVal) {
  const s = normalizeFieldForKey(caVal);
  // Trống ca thường tương đương dòng «Hết ca» trong thực tế — gộp key với "Hết ca" để không cộng đôi Số đơn TT.
  if (!s) return 'het';
  const hasHet = s.includes('hết ca') || s.includes('het ca');
  const hasGua = s.includes('giữa ca') || s.includes('giua ca');
  if (hasHet && hasGua) return 'het+gua';
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
 * chỉ CPQC và Số_Mess_Cmt: tổng; Số đơn TT / DS Chốt TT: max; các cột khác giữ theo dòng đầu (không cộng).
 */
export function dedupeMktDetailReportRows(rows) {
  const merged = mergeUniqueRowsById(rows || []);
  const byKey = new Map();
  for (const row of merged) {
    const k = buildMktDetailReportRowKey(row);
    const sd = parseSoDonThucTeFromRow(row);
    const ds = parseDoanhSoChotTTFromRow(row);
    const cpqc = parseCpqcFromRow(row);
    const mess = parseSoMessCmtFromRow(row);

    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, { row, sd, ds, cpqc, mess });
      continue;
    }

    const mergedSd = Math.max(prev.sd, sd);
    const mergedDs = Math.max(prev.ds, ds);
    const mergedCpqc = prev.cpqc + cpqc;
    const mergedMess = prev.mess + mess;

    prev.sd = mergedSd;
    prev.ds = mergedDs;
    prev.cpqc = mergedCpqc;
    prev.mess = mergedMess;
    prev.row['Số đơn thực tế'] = mergedSd;
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

async function fetchAllReportsInRange(startDate, endDate) {
  const PAGE_SIZE = 1000;
  const reports = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('detail_reports')
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

async function fetchAllOrdersInRange(startDate, endDate) {
  const PAGE_SIZE = 2000;
  const orders = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
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
  const { data, error } = await supabase.from('users').select('name, email, team');

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
    const nameKey = normalizeStr(name);
    const emailKey = normalizeEmail(email);

    if (nameKey && !byName.has(nameKey)) {
      byName.set(nameKey, { email, team });
    }
    if (emailKey && !byEmail.has(emailKey)) {
      byEmail.set(emailKey, { name, nameKey, email, team });
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
      return { email: byN.email, team: byN.team };
    }
    const byE = byEmail.get(emailKey);
    if (byE && normalizeStr(byE.name) === nameKey) {
      return { email: byE.email, team: byE.team };
    }
  }

  if (emailKey) {
    const byE = byEmail.get(emailKey);
    if (byE) return { email: byE.email, team: byE.team };
  }

  if (nameKey) {
    const byN = byName.get(nameKey);
    if (byN) return { email: byN.email, team: byN.team };
  }

  return { email: '', team: '' };
}

export async function recalcMktSoDonThucTeFromOrders({
  startDate,
  endDate,
  dryRun = false,
  // Bỏ tính năng "thêm dòng mới": chỉ cập nhật các dòng đã có sẵn trong detail_reports.
  createMissingRows = false,
} = {}) {
  const normalizedStart = normalizeDateStr(startDate);
  const normalizedEnd = normalizeDateStr(endDate);

  if (!normalizedStart || !normalizedEnd) {
    throw new Error('Khoảng ngày không hợp lệ. Vui lòng truyền startDate/endDate dạng YYYY-MM-DD.');
  }

  // Tuần tự để lỗi báo đúng bảng (Promise.all chỉ thấy “Failed to fetch” chung)
  let reports;
  let orders;
  let hrEmailLookup;
  let usersLookup;
  try {
    reports = await fetchAllReportsInRange(normalizedStart, normalizedEnd);
  } catch (e) {
    throw wrapRecalcReadError('detail_reports', e);
  }
  try {
    orders = await fetchAllOrdersInRange(normalizedStart, normalizedEnd);
  } catch (e) {
    throw wrapRecalcReadError('orders', e);
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
   * - Đơn: shift chỉ Hết ca → chỉ cộng nhóm Hết ca; chỉ Giữa ca → chỉ Giữa ca; "Giữa ca,Hết ca" → cộng cả hai nhóm.
   * - Tự tạo / cập nhật dòng: mỗi dòng DB có ca chuẩn "Hết ca" hoặc "Giữa ca" (không gộp hai ca trong một dòng sau recalc).
   * - Dòng đang lưu chuỗi gộp (2 ca): coi là dòng Hết ca — cập nhật số theo nhóm Hết ca, ghi ca = "Hết ca";
   *   nếu chưa có dòng Giữa ca|cùng key thì chỉ UPDATE khi `createMissingRows=true` (mặc định là `false`).
   * - Dòng một ca: UPDATE số theo đúng nhóm; key = Ngày + Tên + SP + TT (không gồm ca).
   */
  // countsByGroup: Map value { count, totalRevenueVnd, cancelCount, cancelRevenueVnd, sample }
  const countsByGroup = {
    'Hết ca': new Map(),
    'Giữa ca': new Map(),
  };

  // B2: Gom mọi đơn khớp key + đơn/DS hủy (Check = Hủy). Ghi Số đơn thực tế & Doanh số TT = tổng − phần hủy.
  for (const order of orders || []) {
    const groups = orderShiftToGroups(order.shift);
    if (!groups.length) continue;

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
  const reportRows = (reports || []).filter((r) => reportCaToGroups(r.ca).length > 0);

  // canonicalNameByNormalized: normalizedName -> Tên chuẩn lấy từ detail_reports
  // Dùng cho việc "chỉ tạo dòng nếu name tồn tại trong detail_reports".
  const canonicalNameByNormalized = new Map();
  for (const r of reportRows) {
    const nm = canonicalNameByNormalized.get(normalizeNameForKey(r['Tên']));
    if (!nm) canonicalNameByNormalized.set(normalizeNameForKey(r['Tên']), String(r['Tên'] ?? '').trim());
  }

  for (const r of reportRows) {
    const key = buildKey(r['Ngày'], r['Tên'], r['Sản_phẩm'], r['Thị_trường']);
    if (!key) continue;
    const gs = reportCaToGroups(r.ca);
    if (gs.length === 1) {
      existingByCaKey.add(`${gs[0]}|${key}`);
    } else if (gs.length === 2) {
      existingByCaKey.add(`Hết ca|${key}`);
    }
  }

  const updateRows = [];
  const createRows = [];
  const previewRows = [];
  const PREVIEW_LIMIT = 50;

  // 1) Update existing reports' "Số đơn thực tế"
  for (const r of reportRows) {
    const gs = reportCaToGroups(r.ca);
    if (!gs.length) continue;
    const key = buildKey(r['Ngày'], r['Tên'], r['Sản_phẩm'], r['Thị_trường']);
    const primaryGroup = gs.length === 2 ? 'Hết ca' : gs[0];
    const agg = countsByGroup[primaryGroup]?.get(key);
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
      'Số đơn hoàn hủy thực tế': soDonHoanHuyTT,
      'Doanh số hoàn hủy thực tế': dsHoanHuyTT,
    };
    if (gs.length === 2) {
      patch.ca = 'Hết ca';
    }
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
      else {
        const hrTeam = teamFromNameHr(r['Tên'], hrEmailLookup);
        if (hrTeam) patch['Team'] = hrTeam;
      }
    }
    updateRows.push(patch);

    if (previewRows.length < PREVIEW_LIMIT) {
      previewRows.push({
        ca: primaryGroup,
        'Ngày': normalizeDateStr(r['Ngày']),
        'Tên': String(r['Tên'] || '').trim(),
        'Sản_phẩm': String(r['Sản_phẩm'] || '').trim(),
        'Thị_trường': String(r['Thị_trường'] || '').trim(),
        'Số đơn thực tế': count,
        'Doanh số TT': doanhSoTT,
        'Số đơn hoàn hủy thực tế': soDonHoanHuyTT,
        'Doanh số hoàn hủy thực tế': dsHoanHuyTT,
        action: 'update',
      });
    }
  }

  // 2) Create missing report rows for keys not present in detail_reports (B2)
  if (createMissingRows) {
    for (const group of ['Hết ca', 'Giữa ca']) {
      const mapForGroup = countsByGroup[group];
      for (const [key, entry] of mapForGroup.entries()) {
        const exists = existingByCaKey.has(`${group}|${key}`);
        if (exists) continue;

        // Chặn "tạo dòng cho tên không tồn tại trong detail_reports":
        // nếu không tìm được Tên canonical theo normalizedName => skip.
        const normalizedName = normalizeNameForKey(entry.sample.name);
        const canonicalName = canonicalNameByNormalized.get(normalizedName);
        if (!canonicalName) continue;

        const resolved = resolveUserTeamEmail(canonicalName, '', usersLookup);
        const email = resolved.email || emailFromName(canonicalName, hrEmailLookup) || '';
        const hrTeam = teamFromNameHr(canonicalName, hrEmailLookup);
        const resolvedTeam = resolved.team || hrTeam || entry.sample.team || 'MKT';

        const cc = entry.cancelCount ?? 0;
        const crv = entry.cancelRevenueVnd ?? 0;
        const netSoDon = Math.max(0, (entry.count ?? 0) - cc);
        const netDoanhSoTT = Math.max(0, (entry.totalRevenueVnd ?? 0) - crv);
        const row = {
          id: makeId(),
          'Tên': canonicalName,
          'Email': email,
          'Ngày': entry.sample.date,
          ca: group,
          'Sản_phẩm': entry.sample.product,
          'Thị_trường': entry.sample.market,
          'Team': resolvedTeam,
          'Số đơn thực tế': netSoDon,
          'Doanh số TT': netDoanhSoTT,
          'Số đơn hoàn hủy thực tế': cc,
          'Doanh số hoàn hủy thực tế': crv,
        };
        createRows.push(row);

        if (previewRows.length < PREVIEW_LIMIT) {
          previewRows.push({
            ca: group,
            'Ngày': row['Ngày'],
            'Tên': row['Tên'],
            'Sản_phẩm': row['Sản_phẩm'],
            'Thị_trường': row['Thị_trường'],
            'Số đơn thực tế': row['Số đơn thực tế'],
            'Doanh số TT': row['Doanh số TT'],
            'Số đơn hoàn hủy thực tế': row['Số đơn hoàn hủy thực tế'],
            'Doanh số hoàn hủy thực tế': row['Doanh số hoàn hủy thực tế'],
            action: 'create',
          });
        }
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
          return supabase.from('detail_reports').update(rest).eq('id', id);
        })
      );
      const firstErr = results.find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
    } catch (e) {
      const raw = e?.message || String(e);
      const isNetwork =
        e?.name === 'TypeError' ||
        (typeof raw === 'string' && raw.toLowerCase().includes('failed to fetch'));
      if (!isNetwork) throw wrapRecalcReadError('detail_reports (cập nhật)', e);
      for (const row of chunk) {
        const { id, ...rest } = row;
        const { error } = await supabase.from('detail_reports').update(rest).eq('id', id);
        if (error) throw wrapRecalcReadError('detail_reports (cập nhật)', error);
      }
    }
    touched += chunk.length;
  }

  const INSERT_CHUNK = 200;
  for (let i = 0; i < createRows.length; i += INSERT_CHUNK) {
    const chunk = createRows.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from('detail_reports').insert(chunk);
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
 * Sau khi Lưu / Cập nhật đơn (nhap-don): tính lại Số đơn thực tế, Doanh số TT (đã trừ đơn/VND hủy), đơn/DS hoàn hủy thực tế (chỉ đơn Check = Hủy).
 *
 * @param {string} newOrderDate - Ngày đơn sau lưu (YYYY-MM-DD hoặc string DB)
 * @param {string} [previousOrderDate] - Khi sửa đơn: ngày đơn trước khi đổi (để tính lại cả ngày cũ)
 */
export async function recalcMktSoDonAfterOrderSave({ newOrderDate, previousOrderDate, createMissingRows = true } = {}) {
  const n = normalizeDateStr(newOrderDate);
  const p = previousOrderDate != null && previousOrderDate !== '' ? normalizeDateStr(previousOrderDate) : '';
  if (!n && !p) {
    return { skipped: true, reason: 'no_dates' };
  }
  const dates = [n, p].filter(Boolean).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  return recalcMktSoDonThucTeFromOrders({ startDate, endDate, dryRun: false, createMissingRows });
}

