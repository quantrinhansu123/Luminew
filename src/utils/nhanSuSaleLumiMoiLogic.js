/**
 * Logic trích từ nhanSuSaleLumiMoi.html (giữ nguyên công thức / lọc / gom nhóm).
 */

import { canonicalizeReportCa } from '../constants/reportShifts';
import { supabase } from '../supabase/config';
import { normalizePersonKey } from './emailFromName';
import { convertDateToAPIFormat } from '../services/ordersApiService';

/**
 * Chỉ cột cần cho view — giảm payload so với select('*').
 * Không gồm revenue_mess: một số DB chưa chạy migration (ADD COLUMN revenue_mess) → PostgREST lỗi PGRST204.
 * mapSupabaseSalesReportRow vẫn đọc row.revenue_mess nếu có (vd. select * fallback hoặc sau khi thêm cột).
 */
const SALES_REPORTS_SELECT = [
  'name',
  'email',
  'team',
  'branch',
  'position',
  'date',
  'shift',
  'product',
  'market',
  'mess_count',
  'response_count',
  'order_count',
  'revenue_actual',
  'revenue_go_actual',
  'order_cancel_count',
  'revenue_cancel',
  'order_success_count',
  'revenue_success',
  'order_cancel_count_actual',
  'revenue_cancel_actual',
].join(',');

export const SALES_REPORTS_API_BASE = 'https://lumidataapi.vercel.app';
/**
 * KPIs Sale — `KPISale.html` (cột Nhân viên = tên Sale).
 * KPIVandon.html vẫn dùng cho báo cáo Bộ phận Vận đơn.
 */
export const NSSL_KPI_EMBED_PATH = '/baocao-vandon-nv/KPISale.html';
export const NSSL_IFRAME_THU_CONG = 'https://nguyenbatyads37.github.io/static-html-show-data/baoCaoThuCong.html';
/** Host `/xem-bao-cao-sale` → iframe KPIs: đồng bộ bộ lọc thanh trái. */
export const NSSL_KPI_FILTERS_MSG_TYPE = 'LUMINEW_NSSL_KPI_FILTERS';
/** Iframe KPIs sẵn sàng nhận bộ lọc từ parent. */
export const NSSL_KPI_READY_MSG_TYPE = 'LUMINEW_NSSL_KPI_READY';

function buildKpiSaleEmbedUrl(idAppsheet, title) {
  const params = new URLSearchParams({
    view: 'vandon',
    table: 'orders',
    dept: 'Sale',
    hideFilters: '1',
  });
  if (title) params.set('title', title);
  if (idAppsheet) params.set('id', String(idAppsheet));
  if (typeof window === 'undefined') {
    return `${NSSL_KPI_EMBED_PATH}?${params.toString()}`;
  }
  return `${window.location.origin}${NSSL_KPI_EMBED_PATH}?${params.toString()}`;
}

/** URL iframe KPIs Sale = KPISale.html, nhân sự Bộ phận Sale. */
export function buildKpiEmbedUrl(idAppsheet) {
  return buildKpiSaleEmbedUrl(idAppsheet, 'KPI Sale');
}

export function formatCurrency(value) {
  return Number(value || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

export function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '0.00%';
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

export function formatDateDisplay(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return String(dateValue ?? '');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DEFAULT_FILTER_DAYS = 3;

function parseYmdToLocalDate(ymdStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymdStr).slice(0, 10));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) return null;
  return new Date(y, mo - 1, day);
}

/** `n` ngày gần nhất kết thúc hôm nay (mặc định 3 ngày, gồm cả hôm nay). */
export function getLastNDaysRangeLocal(nDays = DEFAULT_FILTER_DAYS) {
  const n = Math.max(1, Number(nDays) || DEFAULT_FILTER_DAYS);
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  start.setDate(start.getDate() - (n - 1));
  return {
    startDateStr: formatLocalYmd(start),
    endDateStr: formatLocalYmd(end),
  };
}

/**
 * Mặc định bộ lọc: `n` ngày kết thúc tại ngày báo cáo mới nhất trong `sales_reports` (Supabase).
 * `teamIn`: nếu có — chỉ xét các team đó (vd. CSKH-HCM / HCM-CSKH) thay vì cả bảng.
 * Trả về null nếu bảng trống hoặc không parse được ngày.
 */
export async function fetchLatestSalesReportNDayRange(
  signal,
  nDays = DEFAULT_FILTER_DAYS,
  tableName = 'sales_reports',
  teamIn = null
) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  let q = supabase
    .from(tableName)
    .select('date')
    .order('date', { ascending: false })
    .limit(1);
  if (Array.isArray(teamIn) && teamIn.length > 0) {
    q = q.in('team', teamIn);
  }
  const { data, error } = await q;

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const raw = row?.date;
  if (raw == null || raw === '') return null;

  const s = String(raw).slice(0, 10);
  const endD = parseYmdToLocalDate(s);
  if (!endD) return null;

  const n = Math.max(1, Number(nDays) || DEFAULT_FILTER_DAYS);
  const startD = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate());
  startD.setDate(startD.getDate() - (n - 1));

  return {
    startDateStr: formatLocalYmd(startD),
    endDateStr: formatLocalYmd(endD),
  };
}

function normalizeViAscii(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chuẩn hóa khoảng trắng trên nhãn Team (không đổi dấu gạch ngang ↔ khoảng trắng).
 * NBSP / khoảng Unicode / zero-width → space ASCII; gom space/tab/xuống dòng thừa.
 */
export function normalizeReportTeamSpaces(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/\uFEFF/g, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Khóa ổn định để lọc / gộp checkbox Team:
 * - Gom khoảng trắng quanh dấu `-` (HCM - Sale ≈ HCM-Sale).
 * - `_` coi như `-` (HCM_CSKH ≈ HCM-CSKH).
 * - HCM-CSKH ≈ CSKH-HCM.
 * - Không gộp team thiếu gạch (HCM Sale) với HCM-Sale.
 */
export function canonicalTeamKeyForFilter(s) {
  let t = normalizeReportTeamSpaces(s);
  t = normalizeViAscii(t);
  t = t.replace(/_/g, '-');
  t = t.replace(/\s*-\s*/g, '-');
  t = t.replace(/\s+/g, ' ').trim();
  const parts = t.split('-').map((p) => p.trim()).filter(Boolean);
  const pset = new Set(parts);
  if (pset.size === 2 && pset.has('cskh') && pset.has('hcm')) {
    return 'cskh-hcm';
  }
  return t;
}

/** Một nhãn hiển thị cho mỗi khóa team (ưu tiên bản không có space quanh `-`, ngắn hơn). */
export function uniqueTeamLabelsForFilter(rows) {
  const byKey = new Map();
  const prefer = (cur, cand) => {
    if (!cur) return cand;
    const score = (x) => (/\s-\s/.test(x) ? 1 : 0);
    if (score(cand) !== score(cur)) return score(cand) < score(cur) ? cand : cur;
    return String(cand).length < String(cur).length ? cand : cur;
  };
  for (const r of rows || []) {
    const raw = String(r?.team ?? '').trim();
    if (!raw) continue;
    const k = canonicalTeamKeyForFilter(raw);
    byKey.set(k, prefer(byKey.get(k), raw));
  }
  return [...byKey.values()].sort((a, b) =>
    String(a).localeCompare(String(b), 'vi', { sensitivity: 'base' })
  );
}

/**
 * Trang /xem-bao-cao-sale-hcm: chỉ team thuộc các nhóm
 * HCM–Sale ngày, HCM-Sale đêm, HCM-CSKH (và mọi biến thể viết / thứ tự từ, sau chuẩn hóa).
 * Loại team HCM khác (vd. MKT, chỉ «HCM» không sale/cskh).
 */
export function matchesHcmXemBaoCaoSaleTeam(teamLabel) {
  const raw = normalizeReportTeamSpaces(teamLabel);
  if (!raw) return false;
  const t = normalizeViAscii(raw);
  if (/^khong xac dinh$/.test(t) || t.includes('khong xac dinh')) return false;
  if (!t.includes('hcm')) return false;

  if (t.includes('cskh')) return true;

  if (!t.includes('sale')) return false;

  const isDem = t.includes('dem');
  const isNgay = t.includes('ngay');
  if (isDem) return true;
  if (isNgay) return true;
  /* «HCM-Sale» / «HCM - Sale» không ghi ngày/đêm — gộp với kênh Sale ngày */
  return true;
}

/**
 * Team có chứa «HCM» (không phân biệt hoa thường, bỏ dấu) — dùng lọc trang /xem-bao-cao-sale.
 */
export function teamLabelContainsHcm(teamLabel) {
  const raw = normalizeReportTeamSpaces(teamLabel);
  if (!raw) return false;
  const t = normalizeViAscii(raw);
  return t.includes('hcm');
}

/**
 * Admin trang HCM: danh sách nhân sự (users) gồm mọi team có «HCM» — rộng hơn `matchesHcmXemBaoCaoSaleTeam`
 * (vẫn bỏ «Không xác định»; «Đã nghỉ» lọc ở `employeeTeamMatchesReportFetchFilter`).
 */
export function matchesHcmAdminPersonnelTeam(teamLabel) {
  const raw = normalizeReportTeamSpaces(teamLabel);
  if (!raw) return false;
  const t = normalizeViAscii(raw);
  if (/^khong xac dinh$/.test(t) || t.includes('khong xac dinh')) return false;
  return t.includes('hcm');
}

/**
 * Team trên users khớp bộ lọc team khi tải báo cáo (HCM / teamIn / exact / keyword sale|cskh).
 * `adminHcmLooseTeamMatch`: trang HCM + admin → roster nhân sự theo mọi team HCM (không siết Sale/CSKH).
 */
export function employeeTeamMatchesReportFetchFilter(teamLabel, ctx = {}) {
  const team = String(teamLabel || '').trim();
  if (!team) return false;
  const tNorm = normalizeViAscii(team);
  if (tNorm === normalizeViAscii('Đã nghỉ')) return false;
  if (ctx.hcmXemBaoCaoSaleTeamFilter) {
    if (ctx.adminHcmLooseTeamMatch) {
      return matchesHcmAdminPersonnelTeam(team);
    }
    return matchesHcmXemBaoCaoSaleTeam(team);
  }
  if (ctx.excludeReportTeamsContainingHcm && teamLabelContainsHcm(team)) {
    return false;
  }
  const inSet =
    Array.isArray(ctx.teamInFilter) && ctx.teamInFilter.length > 0
      ? new Set(ctx.teamInFilter.map((x) => canonicalTeamKeyForFilter(x)))
      : null;
  if (inSet) {
    return inSet.has(canonicalTeamKeyForFilter(team));
  }
  const exactWant = ctx.teamExactFilter ? canonicalTeamKeyForFilter(ctx.teamExactFilter) : '';
  if (exactWant) {
    return canonicalTeamKeyForFilter(team) === exactWant;
  }
  const kw = String(ctx.teamKeyword ?? 'sale').toLowerCase();
  if (kw === 'cskh') {
    return String(team).toLowerCase().includes('cskh');
  }
  if (kw) {
    return !String(team).toLowerCase().includes('cskh');
  }
  return true;
}

/**
 * Dòng users (shape fetchEmployeeDataForRestrict) thuộc phạm vi báo cáo:
 * cùng rule tải team + (nếu restricted) chi nhánh / team Leader.
 * Dùng bổ sung mục «Tên Sale» khi NV chưa có dòng sales_reports trong khoảng ngày.
 */
export function employeeRowInSalesReportScope(emp, ctx = {}) {
  const ten = String(emp?.['Họ Và Tên'] ?? '').trim();
  if (!ten) return false;
  const team = String(emp?.Team ?? '').trim();
  if (!employeeTeamMatchesReportFetchFilter(team, ctx)) return false;
  if (!ctx.isRestrictedView) return true;
  const { allowedBranch, allowedTeam } = ctx;
  if (allowedBranch) {
    const r = { chiNhanh: String(emp['Chi nhánh'] ?? '').trim(), team };
    if (!recordMatchesAllowedBranch(allowedBranch, r)) return false;
  }
  if (allowedTeam) {
    if (!recordTeamMatchesAllowedTeam(team, allowedTeam)) return false;
  }
  if (!allowedBranch && !allowedTeam) return false;
  return true;
}

/** Chuỗi có dạng email (dùng để biết `sales_reports.name` nhập nhầm email). */
export function looksLikeEmail(s) {
  const t = String(s || '').trim();
  if (!t.includes('@')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(t);
}

/**
 * Map email (lowercase) → Họ tên từ bảng users (shape giống fetchEmployeeDataForRestrict).
 * Có thể truyền nhiều mảng; mảng trước ưu tiên, sau chỉ thêm key chưa có.
 */
export function buildEmployeeEmailToNameMap(...employeeRowArrays) {
  const m = new Map();
  for (const rows of employeeRowArrays) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const em = String(row.Email ?? row.email ?? '')
        .toLowerCase()
        .trim();
      const name = String(row['Họ Và Tên'] ?? row.name ?? '').trim();
      if (em && name && !m.has(em)) m.set(em, name);
    }
  }
  return m;
}

/**
 * Hiển thị tên Sale trên UI: nếu `ten` là email thì ưu tiên tên từ users; ngược lại giữ `ten`.
 * (Dòng báo cáo vẫn nhóm theo `ten` gốc trong DB.)
 */
export function displayNameForSaleReportKey(ten, rowEmail, emailToNameMap) {
  const t = String(ten || '').trim();
  if (!t) return '';
  const map = emailToNameMap instanceof Map ? emailToNameMap : new Map();
  const tLower = t.toLowerCase();
  if (looksLikeEmail(t)) {
    const fromMap = map.get(tLower);
    if (fromMap) return fromMap;
  }
  const re = String(rowEmail || '').toLowerCase().trim();
  if (re && (tLower === re || looksLikeEmail(t))) {
    const fromMap = map.get(re);
    if (fromMap) return fromMap;
  }
  return t;
}

/**
 * Khớp `name` trên dòng báo cáo (`ten`) với danh sách trong `users.selected_personnel` (tên hoặc email đã resolve sang tên).
 * Dùng chuẩn hóa + contains giống DanhSachVanDon.
 */
/** NV xem cá nhân: cho phép khớp `sales_reports.email` với user dù `name` trên bảng khác `users.name`. */
export function rowMatchesAllowedSaleName(r, allowedNames, allowedUserEmail) {
  if (!allowedNames || allowedNames.length === 0) return true;
  if (allowedNames.includes(r.ten)) return true;
  const e = String(allowedUserEmail || '').toLowerCase().trim();
  const rowE = String(r.email || '').toLowerCase().trim();
  if (e && rowE && rowE === e) return true;
  return false;
}

export function rowMatchesPersonnelList(ten, allowedList) {
  if (!allowedList || allowedList.length === 0) return true;
  const row = normalizeViAscii(ten);
  if (!row) return false;
  return allowedList.some((allowed) => {
    const n = normalizeViAscii(allowed);
    if (!n) return false;
    return row === n || row.includes(n) || n.includes(row);
  });
}

/** Dòng báo cáo raw có khớp một mục lọc nhân sự (tên hoặc email trên selected_personnel / checkbox). */
export function reportRowMatchesPersonnelOption(r, option) {
  const o = String(option ?? '').trim();
  if (!o || !r) return false;
  const ol = o.toLowerCase();
  const ten = String(r.ten ?? '').trim();
  const em = String(r.email ?? '').toLowerCase().trim();
  if (ten === o) return true;
  if (em && em === ol) return true;
  return rowMatchesPersonnelList(ten, [o]);
}

/**
 * Khóa chuẩn để so khớp chi nhánh: HCM ≈ Hồ Chí Minh ≈ TP.HCM; tránh mất dòng khi `branch` khác text với users.branch.
 */
export function canonicalBranchKey(label) {
  const t = normalizeViAscii(label);
  if (!t || t.includes('khong xac dinh')) return '';
  if (/hcm|tp\.?\s*hcm|ho\s*chi\s*minh|sai\s*gon|saigon|hochiminh/.test(t)) return 'BR_HCM';
  if (/(^|\s)hn(\s|$)|ha\s*noi|hanoi/.test(t)) return 'BR_HN';
  if (/da\s*nang|danang/.test(t)) return 'BR_DN';
  if (/can\s*tho|cantho/.test(t)) return 'BR_CT';
  return `BR_RAW_${t}`;
}

export function rowCanonicalBranchKey(r) {
  if (!r) return '';
  const fromChi = canonicalBranchKey(r.chiNhanh);
  if (fromChi) return fromChi;
  return canonicalBranchKey(r.team);
}

/**
 * So khớp team khi phân quyền Leader (users.Team vs cột team/branch báo cáo).
 * Tránh mất dòng khi lệch «HCM-Sale Ngày» vs «HCM - Sale ngày» hoặc báo cáo chỉ có branch «HCM».
 */
export function recordTeamMatchesAllowedTeam(recordTeam, allowedTeam) {
  const r0 = normalizeReportTeamSpaces(recordTeam);
  const a0 = normalizeReportTeamSpaces(allowedTeam);
  if (!a0) return true;
  if (!r0) return false;
  if (canonicalTeamKeyForFilter(r0) === canonicalTeamKeyForFilter(a0)) return true;
  const norm = (s) =>
    normalizeViAscii(s).replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
  const r = norm(r0);
  const a = norm(a0);
  if (r === a) return true;
  const shorter = r.length <= a.length ? r : a;
  const longer = r.length <= a.length ? a : r;
  if (shorter.length >= 8 && longer.includes(shorter)) return true;
  if (
    shorter.length >= 6 &&
    longer.includes(shorter) &&
    !/cskh/.test(longer) &&
    !/cskh/.test(shorter)
  ) {
    return true;
  }
  if (r === 'hcm') {
    if (/cskh/.test(a)) return false;
    if (/sale|dem|ngay/.test(a)) return true;
  }
  return false;
}

/** Sale Leader: dòng có cùng “chi nhánh logic” với user */
export function recordMatchesAllowedBranch(allowedBranch, r) {
  const a = String(allowedBranch || '').trim();
  if (!a) return true;
  const want = canonicalBranchKey(a);
  const got = rowCanonicalBranchKey(r);
  if (want && got) return want === got;
  return (r.chiNhanh || '').trim().toLowerCase() === a.toLowerCase();
}

function displayChiNhanhFromBranchAndTeam(branchStr, teamStr) {
  const b = String(branchStr || '').trim();
  if (b && !/^không xác định$/i.test(b)) return b;
  const t = normalizeViAscii(teamStr);
  if (/hcm|tp\.?\s*hcm|ho\s*chi\s*minh|sai\s*gon/.test(t)) return 'HCM';
  if (/(^|\s)hn(\s|$)|ha\s*noi/.test(t)) return 'Hà Nội';
  if (/da\s*nang/.test(t)) return 'Đà Nẵng';
  if (/can\s*tho/.test(t)) return 'Cần Thơ';
  return b || 'Không xác định';
}

export function mapApiToRawRows(apiData) {
  return apiData
    .filter(
      (r) =>
        r['Tên'] &&
        String(r['Tên']).trim() !== '' &&
        r['Team'] &&
        String(r['Team']).trim() !== ''
    )
    .map((r) => ({
      chucVu: (r['Chức vụ'] || '').trim(),
      ten: (r['Tên'] || '').trim(),
      email: (r['Email'] || '').trim(),
      team: (r['Team'] || '').trim(),
      chiNhanh: (r['Chi nhánh'] || r['chi nhánh'] || '').trim() || 'Không xác định',
      ngay: r['Ngày'],
      ca: r['Ca'],
      sanPham: r['Sản phẩm'],
      thiTruong: r['Thị trường'],
      soMessCmt: Number(r['Số Mess']) || 0,
      soDon: Number(r['Đơn Mess']) || 0,
      dsChot: Number(r['Doanh số Mess']) || 0,
      phanHoi: Number(r['Phản hồi']) || 0,
      doanhSoDi: Number(r['Doanh số đi']) || 0,
      soDonHuy: Number(r['Số đơn Hoàn huỷ']) || 0,
      doanhSoHuy: Number(r['Doanh số hoàn huỷ']) || 0,
      soDonThanhCong: Number(r['Số đơn thành công']) || 0,
      doanhSoThanhCong: Number(r['Doanh số thành công']) || 0,
      soDonThucTe: Number(r['Số đơn thực tế']) || 0,
      doanhThuChotThucTe: Number(r['Doanh thu chốt thực tế']) || 0,
      doanhSoDiThucTe: Number(r['Doanh số đi thực tế']) || 0,
      soDonHoanHuyThucTe: Number(r['Số đơn hoàn hủy thực tế']) || 0,
      doanhSoHoanHuyThucTe: Number(r['Doanh số hoàn hủy thực tế']) || 0,
      doanhSoSauHoanHuyThucTe: Number(r['Doanh số sau hoàn hủy thực tế']) || 0,
    }));
}

/**
 * Một dòng từ Supabase `sales_reports` — cùng shape với mapLumidataSalesReportRow (đồng bộ API lumidata).
 */
export function mapSupabaseSalesReportRow(row) {
  if (!row || typeof row !== 'object') return null;
  const ten = String(row.name ?? '').trim();
  const teamRaw = String(row.team ?? '').trim();
  const branchRaw = String(row.branch ?? '').trim();
  // HCM hay để trống `team` nhưng có `branch` — không drop dòng (trước đây mất cả chi nhánh).
  const team = teamRaw || branchRaw || 'Không xác định';
  if (!ten) return null;
  const oc = Number(row.order_count) || 0;
  const rm = Number(row.revenue_mess ?? 0) || 0;
  const ra = Number(row.revenue_actual) || 0;
  const revenue = ra || rm;
  const rca = Number(row.revenue_cancel_actual) || 0;
  return {
    chucVu: String(row.position ?? '').trim(),
    ten,
    email: String(row.email ?? '').trim(),
    team,
    chiNhanh: displayChiNhanhFromBranchAndTeam(row.branch, row.team),
    ngay: row.date ?? '',
    ca: canonicalizeReportCa(row.shift),
    sanPham: row.product || '',
    thiTruong: row.market || '',
    soMessCmt: Number(row.mess_count) || 0,
    soDon: oc,
    dsChot: revenue,
    phanHoi: Number(row.response_count) || 0,
    doanhSoDi: Number(row.revenue_go_actual) || 0,
    soDonHuy: Number(row.order_cancel_count) || 0,
    doanhSoHuy: Number(row.revenue_cancel) || 0,
    soDonThanhCong: Number(row.order_success_count) || 0,
    doanhSoThanhCong: Number(row.revenue_success) || 0,
    soDonThucTe: oc,
    doanhThuChotThucTe: revenue,
    doanhSoDiThucTe: Number(row.revenue_go_actual) || 0,
    soDonHoanHuyThucTe: Number(row.order_cancel_count_actual) || 0,
    doanhSoHoanHuyThucTe: rca,
    doanhSoSauHoanHuyThucTe: revenue - rca,
  };
}

/** Một dòng từ lumidataapi `/sales_reports` → cùng shape với mapApiToRawRows (đồng bộ BaoCaoSale.jsx). */
export function mapLumidataSalesReportRow(item) {
  if (!item || typeof item !== 'object') return null;
  const ten = String(item.ten ?? '').trim();
  const teamRaw = String(item.team ?? '').trim();
  const branchRaw = String(item.branch ?? '').trim();
  const team = teamRaw || branchRaw || 'Không xác định';
  if (!ten) return null;
  return {
    chucVu: String(item.position ?? '').trim(),
    ten,
    email: String(item.email ?? '').trim(),
    team,
    chiNhanh: displayChiNhanhFromBranchAndTeam(item.branch, item.team),
    ngay: item.date ?? '',
    ca: canonicalizeReportCa(item.ca),
    sanPham: item.san_pham || '',
    thiTruong: item.thi_truong || '',
    soMessCmt: Number(item.mess_count) || 0,
    soDon: Number(item.order_count) || 0,
    dsChot: Number(item.revenue_mess) || 0,
    phanHoi: Number(item.response_count) || 0,
    doanhSoDi: Number(item.revenue_go_actual) || 0,
    soDonHuy: Number(item.order_cancel_count_actual) || 0,
    doanhSoHuy: Number(item.revenue_cancel_actual) || 0,
    soDonThanhCong: Number(item.order_success_count) || 0,
    doanhSoThanhCong: Number(item.revenue_success) || 0,
    soDonThucTe: Number(item.order_count) || 0,
    doanhThuChotThucTe: Number(item.revenue_actual) || 0,
    doanhSoDiThucTe: Number(item.revenue_go_actual) || 0,
    soDonHoanHuyThucTe: Number(item.order_cancel_count_actual) || 0,
    doanhSoHoanHuyThucTe: Number(item.revenue_cancel_actual) || 0,
    doanhSoSauHoanHuyThucTe:
      (Number(item.revenue_actual) || 0) - (Number(item.revenue_cancel_actual) || 0),
  };
}

/**
 * Phân trang Supabase (nhanh hơn nhiều so với N lần gọi lumidataapi).
 * Không lọc team ở đây trừ khi truyền `teamIn` — lọc `sale`/`cskh` ở client (team HCM thường không chứa chữ "sale").
 * @param {string[] | null} [teamIn] — nếu có: `.in('team', teamIn)` trên từng trang.
 */
export async function fetchSalesReportsFromSupabase(
  startDateStr,
  endDateStr,
  signal,
  tableName = 'sales_reports',
  teamIn = null
) {
  if (!startDateStr || !endDateStr) return [];

  const PAGE = 1000;
  const teams =
    Array.isArray(teamIn) && teamIn.length > 0
      ? teamIn.map((t) => String(t).trim()).filter(Boolean)
      : null;

  async function paginate(buildChunk) {
    const acc = [];
    let from = 0;
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const { data, error } = await buildChunk(from);
      if (error) throw error;
      const chunk = data || [];
      acc.push(...chunk);
      if (chunk.length < PAGE) break;
      from += PAGE;
    }
    return acc;
  }

  const applyTeam = (q) => (teams ? q.in('team', teams) : q);

  const buildStrict = (from) =>
    applyTeam(
      supabase
        .from(tableName)
        .select(SALES_REPORTS_SELECT)
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .order('date', { ascending: false })
        .order('id', { ascending: true })
    ).range(from, from + PAGE - 1);

  let rows;
  try {
    rows = await paginate(buildStrict);
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    console.warn(
      '[fetchSalesReportsFromSupabase] Lỗi truy vấn chuẩn — thử select * + order date:',
      tableName,
      e?.message || e
    );
    const buildLoose = (from) =>
      applyTeam(
        supabase
          .from(tableName)
          .select('*')
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .order('date', { ascending: false })
      ).range(from, from + PAGE - 1);
    rows = await paginate(buildLoose);
  }

  return rows.map(mapSupabaseSalesReportRow).filter(Boolean);
}

/**
 * Fallback: lumidataapi — phân trang after_id (có thể rất chậm nhiều vòng).
 */
export async function fetchSalesReportsFromLumidataApi(startDateStr, endDateStr, signal) {
  const from_date = convertDateToAPIFormat(startDateStr);
  const to_date = convertDateToAPIFormat(endDateStr);
  if (!from_date || !to_date) return [];

  const base = `${SALES_REPORTS_API_BASE.replace(/\/+$/, '')}/sales_reports`;
  const allData = [];
  let nextAfterId = null;
  let hasMore = true;
  let fetchCount = 0;
  const maxFetches = 100;

  while (hasMore && fetchCount < maxFetches) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    fetchCount += 1;
    const params = new URLSearchParams();
    params.append('from_date', from_date);
    params.append('to_date', to_date);
    params.append('limit', '1000');
    if (nextAfterId) params.append('after_id', nextAfterId);

    const res = await fetch(`${base}?${params}`, { signal });
    if (!res.ok) {
      throw new Error(`sales_reports ${res.status} ${res.statusText}`);
    }
    const result = await res.json();
    const items = Array.isArray(result) ? result : result.data || [];
    allData.push(...items);

    if (!Array.isArray(result) && result.next_after_id && items.length > 0) {
      nextAfterId = result.next_after_id;
    } else {
      hasMore = false;
    }
  }

  return allData.map(mapLumidataSalesReportRow).filter(Boolean);
}

/**
 * Tải báo cáo sale (Supabase): ưu tiên bảng `tableName`.
 * Chỉ khi `tableName === 'sales_reports'` mới fallback sang lumidataapi `/sales_reports`.
 * Các bảng khác (vd. `sale_report_hcm` cho /xem-bao-cao-sale-hcm) không có API tương ứng — không được lẫn nguồn.
 */
export async function fetchSalesReportsMapped(
  startDateStr,
  endDateStr,
  signal,
  tableName = 'sales_reports',
  teamIn = null
) {
  try {
    return await fetchSalesReportsFromSupabase(
      startDateStr,
      endDateStr,
      signal,
      tableName,
      teamIn
    );
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    if (String(tableName || '').trim() !== 'sales_reports') {
      console.error(
        '[fetchSalesReportsMapped] Supabase lỗi — không fallback lumidata (chỉ có /sales_reports). Bảng:',
        tableName,
        e?.message || e
      );
      throw e;
    }
    console.warn('[fetchSalesReportsMapped] Supabase không dùng được, dùng lumidataapi:', e?.message || e);
    return fetchSalesReportsFromLumidataApi(startDateStr, endDateStr, signal);
  }
}

const initialSummary = () => ({
  mess: 0,
  don: 0,
  chot: 0,
  phanHoi: 0,
  doanhSoDi: 0,
  soDonHuy: 0,
  doanhSoHuy: 0,
  soDonThanhCong: 0,
  doanhSoThanhCong: 0,
  soDonThucTe: 0,
  doanhThuChotThucTe: 0,
  doanhSoDiThucTe: 0,
  soDonHoanHuyThucTe: 0,
  doanhSoHoanHuyThucTe: 0,
  doanhSoSauHoanHuyThucTe: 0,
});

function numMax(a, b) {
  const x = Number(a) || 0;
  const y = Number(b) || 0;
  return Math.max(x, y);
}

/**
 * Khóa logic giống công thức đếm đơn (Ngày + Tên + SP + TT), không gồm ca — tránh cộng dồn trùng bản ghi.
 */
export function buildSalesReportRowDedupeKey(r) {
  const ngay = String(r?.ngay ?? '')
    .trim()
    .slice(0, 10);
  const ten = normalizeViAscii(r?.ten ?? '');
  const sp = normalizeViAscii(r?.sanPham ?? '');
  const tt = normalizeViAscii(r?.thiTruong ?? '');
  return `${ngay}|${ten}|${sp}|${tt}`;
}

function mergeDuplicateSalesReportRows(prev, next) {
  const merged = {
    ...prev,
    soMessCmt: numMax(prev.soMessCmt, next.soMessCmt),
    soDon: numMax(prev.soDon, next.soDon),
    dsChot: numMax(prev.dsChot, next.dsChot),
    phanHoi: numMax(prev.phanHoi, next.phanHoi),
    doanhSoDi: numMax(prev.doanhSoDi, next.doanhSoDi),
    soDonHuy: numMax(prev.soDonHuy, next.soDonHuy),
    doanhSoHuy: numMax(prev.doanhSoHuy, next.doanhSoHuy),
    soDonThanhCong: numMax(prev.soDonThanhCong, next.soDonThanhCong),
    doanhSoThanhCong: numMax(prev.doanhSoThanhCong, next.doanhSoThanhCong),
    soDonThucTe: numMax(prev.soDonThucTe, next.soDonThucTe),
    doanhThuChotThucTe: numMax(prev.doanhThuChotThucTe, next.doanhThuChotThucTe),
    doanhSoDiThucTe: numMax(prev.doanhSoDiThucTe, next.doanhSoDiThucTe),
    soDonHoanHuyThucTe: numMax(prev.soDonHoanHuyThucTe, next.soDonHoanHuyThucTe),
    doanhSoHoanHuyThucTe: numMax(prev.doanhSoHoanHuyThucTe, next.doanhSoHoanHuyThucTe),
  };
  merged.doanhSoSauHoanHuyThucTe =
    (Number(merged.doanhThuChotThucTe) || 0) - (Number(merged.doanhSoHoanHuyThucTe) || 0);
  return merged;
}

/**
 * Gộp các dòng trùng khóa (Ngày + Tên + Sản phẩm + Thị trường) — không gồm ca.
 * Dùng max trên từng chỉ số (tránh nhân đôi đơn / doanh số). Cột Số mess: tính tổng từ dòng gốc
 * qua `summarizeAndSortSalesData(..., { rawRowsForMess })`, không phụ thuộc gộp trùng.
 */
export function dedupeSalesReportRowsByTTKey(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const map = new Map();
  for (const r of rows) {
    const k = buildSalesReportRowDedupeKey(r);
    if (!map.has(k)) {
      map.set(k, { ...r });
      continue;
    }
    map.set(k, mergeDuplicateSalesReportRows(map.get(k), r));
  }
  return Array.from(map.values());
}

/**
 * @param {object[]} data — thường là dòng đã dedupe (Ngày+Tên+SP+TT).
 * @param {{ rawRowsForMess?: object[] }} [options] — nếu có: cột mess = cộng mọi `soMessCmt` theo tên
 *   trên dữ liệu gốc (không gộp trùng key). Các cột khác vẫn từ `data`.
 */
export function summarizeAndSortSalesData(data, options = {}) {
  const rawList = options.rawRowsForMess;
  const useRawMessSum =
    Array.isArray(rawList) && rawList.length > 0;
  const summaryData = {};
  const tmpl = initialSummary();

  data.forEach((r) => {
    const nameKey = normalizePersonKey(r.ten);
    if (!nameKey) return;
    if (!summaryData[nameKey]) {
      summaryData[nameKey] = {
        name: String(r.ten || '').trim(),
        chiNhanh: r.chiNhanh,
        team: r.team,
        ...initialSummary(),
      };
    }
    if (!useRawMessSum) {
      summaryData[nameKey].mess += r.soMessCmt;
    }
    summaryData[nameKey].don += r.soDon;
    // DS Chốt (tab Dữ liệu báo cáo tay): cộng revenue_actual (doanhThuChotThucTe), không dùng revenue_mess (dsChot).
    summaryData[nameKey].chot += r.doanhThuChotThucTe;
    summaryData[nameKey].phanHoi += r.phanHoi;
    summaryData[nameKey].soDonThucTe += r.soDonThucTe;
    summaryData[nameKey].doanhThuChotThucTe += r.doanhThuChotThucTe;
    summaryData[nameKey].soDonHoanHuyThucTe += r.soDonHoanHuyThucTe;
    summaryData[nameKey].doanhSoHoanHuyThucTe += r.doanhSoHoanHuyThucTe;
    summaryData[nameKey].doanhSoDi += r.doanhSoDi;
    summaryData[nameKey].soDonHuy += r.soDonHuy;
    summaryData[nameKey].doanhSoHuy += r.doanhSoHuy;
    summaryData[nameKey].soDonThanhCong += r.soDonThanhCong;
    summaryData[nameKey].doanhSoThanhCong += r.doanhSoThanhCong;
  });

  if (useRawMessSum) {
    const messByName = {};
    for (const r of rawList) {
      const nameKey = normalizePersonKey(r.ten);
      if (!nameKey) continue;
      messByName[nameKey] = (messByName[nameKey] || 0) + (Number(r.soMessCmt) || 0);
    }
    Object.keys(summaryData).forEach((nameKey) => {
      summaryData[nameKey].mess = messByName[nameKey] ?? 0;
    });
  }

  const flatList = Object.keys(summaryData)
    .map((nameKey) => ({ name: summaryData[nameKey].name || nameKey, ...summaryData[nameKey] }))
    .sort(
      (a, b) =>
        a.team.localeCompare(b.team) || b.chot - a.chot || a.name.localeCompare(b.name)
    );

  const total = aggregateTotalFromFlatList(flatList);

  return { flatList, total };
}

/**
 * Gom dòng chi tiết của 1 Sale theo Sản phẩm × Thị trường (cùng metric bảng tổng).
 * @param {string} staffName — `ten` gốc trên báo cáo (khóa summary).
 * @param {object[]} dedupedRows — dòng đã dedupe (Ngày+Tên+SP+TT), đã lọc bộ lọc hiện tại.
 * @param {object[]} [rawRowsForMess] — dòng gốc để cộng Số Mess theo SP×TT (nếu có).
 */
export function buildSaleStaffProductMarketBreakdown(staffName, dedupedRows, rawRowsForMess = []) {
  const nameKey = normalizePersonKey(staffName);
  if (!nameKey) return { rows: [], sourceRowCount: 0 };

  const matchName = (r) => normalizePersonKey(r?.ten) === nameKey;
  const rows = (dedupedRows || []).filter(matchName);
  const messSource = Array.isArray(rawRowsForMess) && rawRowsForMess.length > 0 ? rawRowsForMess : rows;

  const groups = new Map();
  const ensure = (product, market) => {
    const gKey = `${normalizeViAscii(product)}||${normalizeViAscii(market)}`;
    if (!groups.has(gKey)) {
      groups.set(gKey, {
        product,
        market,
        mess: 0,
        phanHoi: 0,
        don: 0,
        soDonThucTe: 0,
        soDonThanhCong: 0,
        doanhSoThanhCong: 0,
        chot: 0,
        doanhThuChotThucTe: 0,
        soDonHoanHuyThucTe: 0,
        doanhSoHoanHuyThucTe: 0,
      });
    }
    return groups.get(gKey);
  };

  for (const r of rows) {
    const product = String(r.sanPham || '').trim() || 'Chưa xác định';
    const market = String(r.thiTruong || '').trim() || 'Không xác định';
    const G = ensure(product, market);
    G.phanHoi += Number(r.phanHoi) || 0;
    G.don += Number(r.soDon) || 0;
    G.soDonThucTe += Number(r.soDonThucTe) || 0;
    G.soDonThanhCong += Number(r.soDonThanhCong) || 0;
    G.doanhSoThanhCong += Number(r.doanhSoThanhCong) || 0;
    // DS Chốt (tab báo cáo tay): cộng revenue_actual giống summarizeAndSortSalesData
    G.chot += Number(r.doanhThuChotThucTe) || 0;
    G.doanhThuChotThucTe += Number(r.doanhThuChotThucTe) || 0;
    G.soDonHoanHuyThucTe += Number(r.soDonHoanHuyThucTe) || 0;
    G.doanhSoHoanHuyThucTe += Number(r.doanhSoHoanHuyThucTe) || 0;
  }

  for (const r of messSource) {
    if (!matchName(r)) continue;
    const product = String(r.sanPham || '').trim() || 'Chưa xác định';
    const market = String(r.thiTruong || '').trim() || 'Không xác định';
    const G = ensure(product, market);
    G.mess += Number(r.soMessCmt) || 0;
  }

  const list = [...groups.values()].sort((a, b) => {
    const p = String(a.product).localeCompare(String(b.product), 'vi');
    if (p !== 0) return p;
    return String(a.market).localeCompare(String(b.market), 'vi');
  });

  return { rows: list, sourceRowCount: rows.length };
}

/** Cộng các chỉ số từ danh sách đã gom (vd. sau khi loại team «Đã nghỉ» để khớp TỔNG với dòng hiển thị). */
export function aggregateTotalFromFlatList(flatList) {
  const tmpl = initialSummary();
  if (!Array.isArray(flatList) || flatList.length === 0) return initialSummary();
  return flatList.reduce((acc, item) => {
    Object.keys(tmpl).forEach((key) => {
      acc[key] += item[key];
    });
    return acc;
  }, initialSummary());
}

/**
 * Gắn `Bộ phận` (users.department) vào từng dòng báo cáo theo email, fallback theo tên NV.
 */
export function enrichSalesReportRowsWithBoPhan(rows, employeeRecords) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const byEmail = new Map();
  const byName = new Map();
  for (const u of employeeRecords || []) {
    const em = String(u.Email || '').toLowerCase().trim();
    const bp = String(u['Bộ phận'] ?? '').trim();
    const ten = String(u['Họ Và Tên'] || '').trim();
    if (em) byEmail.set(em, bp);
    if (ten) byName.set(ten, bp);
  }
  return rows.map((r) => {
    const em = String(r.email || '').toLowerCase().trim();
    const ten = String(r.ten || '').trim();
    const fromEmail = em ? byEmail.get(em) : undefined;
    const fromName = ten ? byName.get(ten) : undefined;
    const boPhan = (fromEmail != null && fromEmail !== '' ? fromEmail : fromName) || '';
    return { ...r, boPhan: String(boPhan || '').trim() };
  });
}

/** Lọc rawData theo restricted + ngày + checkbox (giống applyFilters HTML) */
export function filterRawData({
  rawData,
  isRestrictedView,
  allowedBranch,
  allowedTeam,
  allowedNames,
  /** Email user khi xem cá nhân — khớp với cột `email` trên dòng `sales_reports`. */
  allowedUserEmail = null,
  /** Danh sách tên được phép xem (từ `users.selected_personnel`); null = không áp dụng. */
  allowedPersonnelNames = null,
  startDateStr,
  endDateStr,
  productAll,
  selectedProducts,
  caAll,
  selectedShifts,
  teamAll,
  selectedTeams,
  marketAll,
  selectedMarkets,
  /** Lọc theo cột tên (ten); nameAll=true bỏ qua. */
  nameAll = true,
  selectedNames = null,
  /** Chuỗi rỗng = tất cả — khớp `boPhan` (Bộ phận từ users.department). */
  boPhanPick = '',
  /** Chuỗi rỗng = tất cả — khớp `chucVu` (cột position / Vị trí trên báo cáo). */
  chucVuPick = '',
}) {
  const normalizeCaForFilter = (value) =>
    String(value || '')
      .replace(/\u00a0/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const rowMatchesShiftSelection = (rowCa, selectedShiftsList) => {
    if (!Array.isArray(selectedShiftsList) || selectedShiftsList.length === 0) return true;
    const rowNorm = normalizeCaForFilter(canonicalizeReportCa(rowCa));
    return selectedShiftsList.some((selected) => {
      const s = normalizeCaForFilter(canonicalizeReportCa(selected));
      return !!s && rowNorm === s;
    });
  };

  const startDate = startDateStr ? new Date(startDateStr) : null;
  if (startDate) startDate.setHours(0, 0, 0, 0);
  const endDate = endDateStr ? new Date(endDateStr) : null;
  if (endDate) endDate.setHours(23, 59, 59, 999);

  return rawData.filter((r) => {
    const hasPersonnelScope =
      allowedPersonnelNames && allowedPersonnelNames.length > 0;
    if (hasPersonnelScope) {
      if (!rowMatchesPersonnelList(r.ten, allowedPersonnelNames)) return false;
    }
    if (isRestrictedView) {
      /** Có selected_personnel → phạm vi theo danh sách tên; không siết thêm team/chi nhánh của người xem. */
      if (!hasPersonnelScope) {
        if (allowedBranch && !recordMatchesAllowedBranch(allowedBranch, r)) return false;
        if (allowedTeam) {
          const recordTeam = normalizeReportTeamSpaces(r.team);
          if (!recordTeamMatchesAllowedTeam(recordTeam, allowedTeam)) return false;
        }
      }
      if (
        !hasPersonnelScope &&
        allowedNames.length > 0 &&
        !rowMatchesAllowedSaleName(r, allowedNames, allowedUserEmail)
      ) {
        return false;
      }
    }
    const recordDate = new Date(r.ngay);
    recordDate.setHours(12, 0, 0, 0);
    const isDateOk =
      (!startDate || recordDate >= startDate) && (!endDate || recordDate <= endDate);
    const isProductOk =
      productAll || (selectedProducts && selectedProducts.includes(r.sanPham));
    const isMarketOk =
      marketAll || (selectedMarkets && selectedMarkets.includes(r.thiTruong));
    const isShiftOk = caAll || rowMatchesShiftSelection(r.ca, selectedShifts);
    const rowTeamKey = canonicalTeamKeyForFilter(String(r.team ?? ''));
    const isTeamOk =
      teamAll ||
      (selectedTeams &&
        selectedTeams.some((sel) => canonicalTeamKeyForFilter(String(sel)) === rowTeamKey));
    /** Bỏ "Tất cả": chỉ hiện dòng khớp tên đã chọn; không chọn ai thì không còn dòng (tắt hết). */
    let isNameOk = true;
    if (nameAll === false) {
      if (!Array.isArray(selectedNames) || selectedNames.length === 0) {
        isNameOk = false;
      } else {
        isNameOk = selectedNames.some((n) => rowMatchesPersonnelList(r.ten, [n]));
      }
    }
    const pickBp = String(boPhanPick || '').trim();
    const isBoPhanOk = !pickBp || String(r.boPhan || '').trim() === pickBp;
    const pickCv = String(chucVuPick || '').trim();
    const isChucVuOk = !pickCv || String(r.chucVu || '').trim() === pickCv;
    return isDateOk && isProductOk && isMarketOk && isShiftOk && isTeamOk && isNameOk && isBoPhanOk && isChucVuOk;
  });
}

export function filterRawForRestrictedPopulate(
  rawData,
  isRestrictedView,
  allowedBranch,
  allowedTeam,
  allowedNames,
  allowedPersonnelNames = null,
  allowedUserEmail = null
) {
  const passPersonnel = (r) =>
    !allowedPersonnelNames ||
    allowedPersonnelNames.length === 0 ||
    rowMatchesPersonnelList(r.ten, allowedPersonnelNames);

  if (!isRestrictedView) {
    return rawData.filter((r) => passPersonnel(r));
  }
  const hasPersonnelScope =
    allowedPersonnelNames && allowedPersonnelNames.length > 0;
  return rawData.filter((r) => {
    if (!passPersonnel(r)) return false;
    if (hasPersonnelScope) {
      return true;
    }
    if (allowedBranch) {
      return recordMatchesAllowedBranch(allowedBranch, r);
    }
    if (allowedTeam) {
      const recordTeam = normalizeReportTeamSpaces(r.team);
      return recordTeamMatchesAllowedTeam(recordTeam, allowedTeam);
    }
    if (allowedNames.length > 0) return rowMatchesAllowedSaleName(r, allowedNames, allowedUserEmail);
    return false;
  });
}

export function uniqueSorted(data, key) {
  return [...new Set(data.map((r) => r[key]).filter(Boolean))].sort();
}
