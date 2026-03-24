/**
 * Logic trích từ nhanSuSaleLumiMoi.html (giữ nguyên công thức / lọc / gom nhóm).
 */

import { supabase } from '../supabase/config';
import { convertDateToAPIFormat } from '../services/ordersApiService';

/** Chỉ cột cần cho view — giảm payload so với select('*') */
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
/** KPI Sale — trong app (KPisale.html trên github.io bị CORS + timeout khi gọi n-api-rouge). */
export const NSSL_KPI_EMBED_PATH = '/embed/bao-cao-hieu-suat-kpi';
/** Trang trong app — thay Vandonsale.html (getAll ~7MB hay lỗi JSON: cắt nửa / chuỗi chưa escape). */
export const NSSL_VAN_DON_EMBED_PATH = '/embed/bao-cao-van-don';
export const NSSL_IFRAME_THU_CONG = 'https://nguyenbatyads37.github.io/static-html-show-data/baoCaoThuCong.html';

/** URL iframe Vận đơn Sale (same-origin để dùng session + API phân trang). */
export function buildVanDonEmbedUrl(idAppsheet) {
  if (typeof window === 'undefined') return NSSL_VAN_DON_EMBED_PATH;
  const base = `${window.location.origin}${NSSL_VAN_DON_EMBED_PATH}`;
  return idAppsheet ? `${base}?id=${encodeURIComponent(String(idAppsheet))}` : base;
}

/** URL iframe KPIs Sale (same-origin). */
export function buildKpiEmbedUrl(idAppsheet) {
  if (typeof window === 'undefined') return NSSL_KPI_EMBED_PATH;
  const base = `${window.location.origin}${NSSL_KPI_EMBED_PATH}`;
  return idAppsheet ? `${base}?id=${encodeURIComponent(String(idAppsheet))}` : base;
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

function normalizeViAscii(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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
  const team = String(row.team ?? '').trim();
  if (!ten || !team) return null;
  const oc = Number(row.order_count) || 0;
  const ra = Number(row.revenue_actual) || 0;
  const rca = Number(row.revenue_cancel_actual) || 0;
  return {
    chucVu: String(row.position ?? '').trim(),
    ten,
    email: String(row.email ?? '').trim(),
    team,
    chiNhanh: displayChiNhanhFromBranchAndTeam(row.branch, row.team),
    ngay: row.date ?? '',
    ca: row.shift || 'Hết ca',
    sanPham: row.product || '',
    thiTruong: row.market || '',
    soMessCmt: Number(row.mess_count) || 0,
    soDon: 0,
    dsChot: 0,
    phanHoi: Number(row.response_count) || 0,
    doanhSoDi: Number(row.revenue_go_actual) || 0,
    soDonHuy: Number(row.order_cancel_count) || 0,
    doanhSoHuy: Number(row.revenue_cancel) || 0,
    soDonThanhCong: Number(row.order_success_count) || 0,
    doanhSoThanhCong: Number(row.revenue_success) || 0,
    soDonThucTe: oc,
    doanhThuChotThucTe: ra,
    doanhSoDiThucTe: Number(row.revenue_go_actual) || 0,
    soDonHoanHuyThucTe: Number(row.order_cancel_count_actual) || 0,
    doanhSoHoanHuyThucTe: rca,
    doanhSoSauHoanHuyThucTe: ra - rca,
  };
}

/** Một dòng từ lumidataapi `/sales_reports` → cùng shape với mapApiToRawRows (đồng bộ BaoCaoSale.jsx). */
export function mapLumidataSalesReportRow(item) {
  if (!item || typeof item !== 'object') return null;
  const ten = String(item.ten ?? '').trim();
  const team = String(item.team ?? '').trim();
  if (!ten || !team) return null;
  return {
    chucVu: String(item.position ?? '').trim(),
    ten,
    email: String(item.email ?? '').trim(),
    team,
    chiNhanh: displayChiNhanhFromBranchAndTeam(item.branch, item.team),
    ngay: item.date ?? '',
    ca: item.ca || 'Hết ca',
    sanPham: item.san_pham || '',
    thiTruong: item.thi_truong || '',
    soMessCmt: Number(item.mess_count) || 0,
    soDon: 0,
    dsChot: 0,
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
 * Không lọc team ở đây — lọc `sale`/`cskh` ở client (team HCM thường không chứa chữ "sale").
 */
export async function fetchSalesReportsFromSupabase(startDateStr, endDateStr, signal) {
  if (!startDateStr || !endDateStr) return [];

  const PAGE = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const q = supabase
      .from('sales_reports')
      .select(SALES_REPORTS_SELECT)
      .gte('date', startDateStr)
      .lte('date', endDateStr)
      .order('date', { ascending: false })
      .range(from, from + PAGE - 1);

    const { data, error } = await q;

    if (error) {
      throw error;
    }

    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
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
 * Tải sales_reports: ưu tiên Supabase, lỗi/RLS thì fallback lumidataapi.
 * Lọc sale/cskh theo team — thực hiện ở component sau khi map (tránh loại nhầm chi nhánh HCM).
 */
export async function fetchSalesReportsMapped(startDateStr, endDateStr, signal) {
  try {
    return await fetchSalesReportsFromSupabase(startDateStr, endDateStr, signal);
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
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

export function summarizeAndSortSalesData(data) {
  const summaryData = {};
  const tmpl = initialSummary();

  data.forEach((r) => {
    const name = r.ten;
    if (!summaryData[name]) {
      summaryData[name] = {
        chiNhanh: r.chiNhanh,
        team: r.team,
        ...initialSummary(),
      };
    }
    summaryData[name].mess += r.soMessCmt;
    summaryData[name].don += r.soDon;
    summaryData[name].chot += r.dsChot;
    summaryData[name].phanHoi += r.phanHoi;
    summaryData[name].soDonThucTe += r.soDonThucTe;
    summaryData[name].doanhThuChotThucTe += r.doanhThuChotThucTe;
    summaryData[name].soDonHoanHuyThucTe += r.soDonHoanHuyThucTe;
    summaryData[name].doanhSoHoanHuyThucTe += r.doanhSoHoanHuyThucTe;
    summaryData[name].doanhSoDi += r.doanhSoDi;
    summaryData[name].soDonHuy += r.soDonHuy;
    summaryData[name].doanhSoHuy += r.doanhSoHuy;
    summaryData[name].soDonThanhCong += r.soDonThanhCong;
    summaryData[name].doanhSoThanhCong += r.doanhSoThanhCong;
  });

  const flatList = Object.keys(summaryData)
    .map((name) => ({ name, ...summaryData[name] }))
    .sort(
      (a, b) =>
        a.team.localeCompare(b.team) || b.chot - a.chot || a.name.localeCompare(b.name)
    );

  const total = flatList.reduce((acc, item) => {
    Object.keys(tmpl).forEach((key) => {
      acc[key] += item[key];
    });
    return acc;
  }, initialSummary());

  return { flatList, total };
}

/** Lọc rawData theo restricted + ngày + checkbox (giống applyFilters HTML) */
export function filterRawData({
  rawData,
  isRestrictedView,
  allowedBranch,
  allowedTeam,
  allowedNames,
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
}) {
  const startDate = startDateStr ? new Date(startDateStr) : null;
  if (startDate) startDate.setHours(0, 0, 0, 0);
  const endDate = endDateStr ? new Date(endDateStr) : null;
  if (endDate) endDate.setHours(23, 59, 59, 999);

  return rawData.filter((r) => {
    if (isRestrictedView) {
      if (allowedBranch && !recordMatchesAllowedBranch(allowedBranch, r)) return false;
      if (allowedTeam) {
        const recordTeam = (r.team || '').trim();
        if (recordTeam !== allowedTeam) return false;
      }
      if (allowedNames.length > 0 && !allowedNames.includes(r.ten)) return false;
    }
    const recordDate = new Date(r.ngay);
    recordDate.setHours(12, 0, 0, 0);
    const isDateOk =
      (!startDate || recordDate >= startDate) && (!endDate || recordDate <= endDate);
    const isProductOk =
      productAll || (selectedProducts && selectedProducts.includes(r.sanPham));
    const isMarketOk =
      marketAll || (selectedMarkets && selectedMarkets.includes(r.thiTruong));
    const isShiftOk =
      caAll || (selectedShifts && selectedShifts.includes(String(r.ca)));
    const isTeamOk =
      teamAll || (selectedTeams && selectedTeams.includes(String(r.team)));
    return isDateOk && isProductOk && isMarketOk && isShiftOk && isTeamOk;
  });
}

export function filterRawForRestrictedPopulate(rawData, isRestrictedView, allowedBranch, allowedTeam, allowedNames) {
  if (!isRestrictedView) return rawData;
  return rawData.filter((r) => {
    if (allowedBranch) {
      return recordMatchesAllowedBranch(allowedBranch, r);
    }
    if (allowedTeam) {
      const recordTeam = (r.team || '').trim();
      return recordTeam === allowedTeam;
    }
    if (allowedNames.length > 0) return allowedNames.includes(r.ten);
    return false;
  });
}

export function uniqueSorted(data, key) {
  return [...new Set(data.map((r) => r[key]).filter(Boolean))].sort();
}
