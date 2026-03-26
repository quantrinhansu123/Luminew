import { Settings } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { useLocation } from 'react-router-dom';

import ColumnSettingsModal from '../components/ColumnSettingsModal';
import usePermissions from '../hooks/usePermissions';
import { fetchSalesReportsFromAPI, convertDateToAPIFormat } from '../services/ordersApiService';
import { parseSmartDate } from '../utils/dateParsing';
import { supabase } from '../supabase/config';
import './XemBaoCaoMKT.css';

const MKT_DEV = import.meta.env.DEV;

/** Parse số tiền từ DB/API (số, hoặc chuỗi kiểu 26.088.000). */
function parseMoneyNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === '') return null;
  const direct = Number(s);
  if (Number.isFinite(direct)) return direct;
  const stripped = s.replace(/\./g, '').replace(/,/g, '');
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

/** Đếm đơn/mess: chuỗi kiểu "1.500" (VN) → 1500; tránh Number("1.500") = 1.5. */
function parseIntegerVi(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  const s = String(v).trim().replace(/\./g, '').replace(/,/g, '');
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/** DS Chốt (TT): ưu tiên field từ Supabase, fallback snake_case từ API. */
function pickDoanhSoTT(item) {
  if (item == null) return 0;
  const fromApi = parseMoneyNumber(item.doanh_so_tt);
  const fromDb = parseMoneyNumber(item['Doanh số TT']);
  return fromDb !== null ? fromDb : (fromApi !== null ? fromApi : 0);
}

/** Chuẩn hóa một dòng detail_reports từ API (dùng chung fetch + cache). */
function normalizeMktDetailApiRow(item) {
  return {
    ...item,
    'Ngày': item['Ngày'] || item.ngay || item.date || '',
    'Team': item['Team'] || item.team || '',
    'Tên': item['Tên'] || item.ten || item.name || '',
    'Email': item['Email'] || item.email || '',
    'Sản_phẩm': item['Sản_phẩm'] || item['Sản phẩm'] || item.san_pham || item.product || '',
    'Thị_trường': item['Thị_trường'] || item['Thị trường'] || item.thi_truong || item.market || '',
    'CPQC': item['CPQC'] || item.cpqc || 0,
    'Số_Mess_Cmt': parseIntegerVi(
      item['Số_Mess_Cmt'] ?? item['Số Mess Cmt'] ?? item.so_mess_cmt ?? item.mess_count ?? 0
    ),
    'Số đơn': parseIntegerVi(
      item['Số đơn'] ?? item['Số_đơn'] ?? item.so_don ?? item.order_count ?? 0
    ),
    'Số đơn thực tế': parseIntegerVi(
      item['Số đơn thực tế'] ??
        item['Số_đơn_thực_tế'] ??
        item.so_don_thuc_te ??
        item.order_count_actual ??
        0
    ),
    'Doanh số TT': pickDoanhSoTT(item),
    'Doanh số': item['Doanh số'] || item.doanh_so || item.revenue || 0,
    'Doanh thu chốt thực tế': item['Doanh thu chốt thực tế'] || item.doanh_thu_chot_thuc_te || item.revenue_actual || 0,
    'Số đơn hoàn hủy': parseIntegerVi(
      item['Số đơn hoàn hủy'] ?? item.so_don_hoan_huy ?? item.order_cancel_count ?? 0
    ),
    'Số đơn hoàn hủy thực tế': parseIntegerVi(
      item['Số đơn hoàn hủy thực tế'] ??
        item.so_don_hoan_huy_thuc_te ??
        item.order_cancel_count_actual ??
        0
    ),
    'Doanh số hoàn hủy thực tế': item['Doanh số hoàn hủy thực tế'] || item.doanh_so_hoan_huy_thuc_te || item.revenue_cancel_actual || 0,
    'DS sau hoàn hủy': item['DS sau hoàn hủy'] || item.ds_sau_hoan_huy || 0,
    'Doanh số sau hoàn hủy thực tế': item['Doanh số sau hoàn hủy thực tế'] || item.doanh_so_sau_hoan_huy_thuc_te || 0,
    'Doanh số sau ship': item['Doanh số sau ship'] || item.doanh_so_sau_ship || 0,
    'Doanh số TC': item['Doanh số TC'] || item.doanh_so_tc || 0,
    'KPIs': item['KPIs'] || item.kpis || 0,
    'ca': item['ca'] || item['Ca'] || item.ca || item.shift || ''
  };
}

const MKT_DETAIL_CACHE_PREFIX = 'mkt_detail_reports_v1';
const MKT_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const MKT_DETAIL_FETCH_TIMEOUT_MS = 90_000;

function mktDetailCacheKey(startDate, endDate, teamFilter) {
  return `${MKT_DETAIL_CACHE_PREFIX}:${teamFilter || 'default'}:${startDate}:${endDate}`;
}

function readMktDetailCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const rows = parsed?.rows;
    const t = parsed?.t;
    if (!Array.isArray(rows) || typeof t !== 'number') return null;
    if (Date.now() - t > MKT_DETAIL_CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return rows;
  } catch {
    return null;
  }
}

function writeMktDetailCache(key, rows) {
  try {
    const payload = JSON.stringify({ t: Date.now(), rows });
    if (payload.length > 4_500_000) return;
    sessionStorage.setItem(key, payload);
  } catch (e) {
    if (MKT_DEV) console.warn('mkt detail cache write failed', e);
  }
}

/** Formatters module-scope — tránh tạo lại mỗi lần render (bảng lớn). */
function fmtNum(n) {
  return n ? Math.round(n).toLocaleString('vi-VN') : '0';
}
function fmtCurrency(n) {
  return n ? Math.round(n).toLocaleString('vi-VN') + ' ₫' : '0 ₫';
}
function fmtPct(n) {
  return n ? n.toFixed(2) + '%' : '0.00%';
}
function getCpsCellStyle(cps) {
  if (cps > 2000000) return 'bg-lightred';
  if (cps > 1000000) return 'bg-yellow';
  return '';
}
function getRateClass(rate) {
  if (rate > 10) return 'bg-green';
  if (rate > 5) return 'bg-yellow';
  return '';
}

/** Chuẩn hóa ngày báo cáo → YYYY-MM-DD để nhóm theo ngày. */
function ymdKeyFromReportRow(row) {
  const d = parseSmartDate(row['Ngày']);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Một dòng bảng chi tiết: tỉ lệ / CPS / giá tính từ Mess–Đơn–CPQC–DS nếu API không gửi. */
function mapRawRowToProcessRow(row) {
  const mess = parseIntegerVi(row['Số_Mess_Cmt']);
  const cpqc = Number(row['CPQC'] || 0);
  const soDonTT = parseIntegerVi(row['Số đơn thực tế']);
  const orders = soDonTT;
  const dsChotTTCore = pickDoanhSoTT(row);
  const dsChotTTFallback = parseMoneyNumber(row['Doanh thu chốt thực tế']);
  const dsChotTT = dsChotTTCore || (dsChotTTFallback !== null ? dsChotTTFallback : 0);
  const dsChot = dsChotTT;

  const tiLeChot = mess > 0 ? (orders / mess) * 100 : Number(row['Tỉ lệ chốt'] || 0);
  const tiLeChotTT = mess > 0 ? (soDonTT / mess) * 100 : Number(row['Tỉ lệ chốt thực tế'] || row['Tỉ lệ chốt TT'] || 0);
  const giaMess = mess > 0 ? cpqc / mess : Number(row['Giá Mess'] || 0);
  const cps = orders > 0 ? cpqc / orders : Number(row['CPS'] || 0);
  const cp_ds = dsChot > 0 ? (cpqc / dsChot) * 100 : Number(row['%CP/DS'] || 0);
  const giaTBDon = orders > 0 ? dsChot / orders : Number(row['Giá TB Đơn'] || 0);

  const dsSauShip = Number(row['Doanh số sau ship'] || 0);
  const kpiValue = Number(row['KPIs'] || 0);
  const soDonHuyTT = parseIntegerVi(row['Số đơn hoàn hủy thực tế']);
  const dsHuyTT = Number(row['Doanh số hoàn hủy thực tế'] || 0);
  const dsThanhCongTT = Number(row['Doanh số đi thực tế'] || 0);
  const cp_ds_sau_ship = dsSauShip > 0 ? (cpqc / dsSauShip) * 100 : 0;
  const kpi_percent = kpiValue > 0 ? (dsSauShip / kpiValue) * 100 : 0;

  return {
    team: row['Team'] || '',
    name: row['Tên'] || '',
    mess,
    cpqc,
    orders,
    soDonTT,
    dsChot,
    dsChotTT,
    tiLeChot,
    tiLeChotTT,
    giaMess,
    cps,
    cp_ds,
    giaTBDon,
    dsSauShip,
    kpiValue,
    soDonHuyTT,
    dsHuyTT,
    dsThanhCongTT,
    cp_ds_sau_ship,
    kpi_percent,
  };
}

function sumProcessRows(rows) {
  return rows.reduce(
    (acc, cur) => ({
      mess: acc.mess + cur.mess,
      cpqc: acc.cpqc + cur.cpqc,
      orders: acc.orders + cur.orders,
      soDonTT: acc.soDonTT + cur.soDonTT,
      dsChot: acc.dsChot + cur.dsChot,
      dsChotTT: acc.dsChotTT + cur.dsChotTT,
      dsSauShip: acc.dsSauShip + cur.dsSauShip,
      kpiValue: acc.kpiValue + cur.kpiValue,
      soDonHuyTT: acc.soDonHuyTT + cur.soDonHuyTT,
      dsHuyTT: acc.dsHuyTT + cur.dsHuyTT,
      dsThanhCongTT: acc.dsThanhCongTT + cur.dsThanhCongTT,
    }),
    {
      mess: 0,
      cpqc: 0,
      orders: 0,
      soDonTT: 0,
      dsChot: 0,
      dsChotTT: 0,
      dsSauShip: 0,
      kpiValue: 0,
      soDonHuyTT: 0,
      dsHuyTT: 0,
      dsThanhCongTT: 0,
    }
  );
}

function deriveTotalsFromSums(sums) {
  const m = sums.mess;
  const ord = sums.orders;
  const cp = sums.cpqc;
  const ds = sums.dsChot;
  const tt = sums.soDonTT;
  const dsShip = sums.dsSauShip;
  const kpiSum = sums.kpiValue;
  return {
    mess: sums.mess,
    cpqc: sums.cpqc,
    orders: sums.orders,
    soDonTT: sums.soDonTT,
    dsChot: sums.dsChot,
    dsChotTT: sums.dsChotTT,
    tiLeChot: m > 0 ? (ord / m) * 100 : 0,
    tiLeChotTT: m > 0 ? (tt / m) * 100 : 0,
    giaMess: m > 0 ? cp / m : 0,
    cps: ord > 0 ? cp / ord : 0,
    cp_ds: ds > 0 ? (cp / ds) * 100 : 0,
    giaTBDon: ord > 0 ? ds / ord : 0,
    dsSauShip: sums.dsSauShip,
    kpiValue: sums.kpiValue,
    soDonHuyTT: sums.soDonHuyTT,
    dsHuyTT: sums.dsHuyTT,
    dsThanhCongTT: sums.dsThanhCongTT,
    cp_ds_sau_ship: dsShip > 0 ? (cp / dsShip) * 100 : 0,
    kpi_percent: kpiSum > 0 ? (dsShip / kpiSum) * 100 : 0,
  };
}

const LUMIDATA_DETAIL_PAGE_LIMIT = 1000;
const LUMIDATA_DETAIL_MAX_PAGES = 250;

const MKT_SUPABASE_PAGE_SIZE = 1000;
const MKT_SUPABASE_MAX_PAGES = 250;

/**
 * Nguồn MKT: https://lumidataapi.vercel.app/detail_reports?team=HN-MKT
 * `?team=RD` trên URL: không gửi `team` lên API, chỉ lọc department RD ở client.
 */
function lumidataDetailReportsTeamParam(teamFromUrl) {
  const t = String(teamFromUrl || '').trim();
  if (t === 'RD') return undefined;
  return 'HN-MKT';
}

/**
 * Chỉ lấy detail_reports từ lumidataapi + team=HN-MKT (mọi dòng bảng từ API).
 * Phân trang next_after_id / after_id nếu API trả về.
 */
async function fetchDetailReportsFromLumidataAll(startDate, endDate, teamFilter, signal) {
  const from_date = convertDateToAPIFormat(startDate);
  const to_date = convertDateToAPIFormat(endDate);
  const apiTeam = lumidataDetailReportsTeamParam(teamFilter);
  if (MKT_DEV) {
    if (apiTeam) {
      console.log('📡 lumidata detail_reports?team=HN-MKT (+ from_date, to_date, limit, cursor…)');
    } else {
      console.log('📡 lumidata detail_reports (không team=) — chế độ ?team=RD, lọc department ở client');
    }
  }
  const rows = [];
  let nextCursor = null;
  /** API có thể dùng `next_after_id` hoặc `after_id` cho trang sau */
  let cursorParam = 'next_after_id';

  for (let page = 0; page < LUMIDATA_DETAIL_MAX_PAGES; page++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const filters = {
      from_date,
      to_date,
      limit: LUMIDATA_DETAIL_PAGE_LIMIT,
      ...(apiTeam ? { team: apiTeam } : {}),
      signal,
    };
    if (nextCursor) {
      if (cursorParam === 'after_id') filters.after_id = nextCursor;
      else filters.next_after_id = nextCursor;
    }

    const res = await fetchSalesReportsFromAPI(filters);

    const chunk = Array.isArray(res?.data) ? res.data : [];
    rows.push(...chunk);

    let next = res?.next_after_id || null;
    if (next) {
      cursorParam = 'next_after_id';
    } else {
      next = res?.after_id || null;
      if (next) cursorParam = 'after_id';
    }
    if (!next || chunk.length === 0) break;
    nextCursor = next;
  }

  if (teamFilter === 'RD') {
    return rows.filter((r) => String(r?.department || '').toUpperCase() === 'RD');
  }
  return rows.filter((r) => String(r?.department || '').toUpperCase() !== 'RD');
}

/**
 * Lấy trực tiếp từ Supabase (DB): bảng `detail_reports`.
 * - team != RD: Team = 'HN-MKT' và department != 'RD'
 * - team == RD: department = 'RD' (giữ cùng component để tab/permission hoạt động)
 */
async function fetchDetailReportsFromSupabaseAll(startDate, endDate, teamFilter) {
  const rows = [];
  let from = 0;

  for (let page = 0; page < MKT_SUPABASE_MAX_PAGES; page++) {
    let q = supabase
      .from('detail_reports')
      .select('*');

    if (teamFilter === 'RD') {
      q = q.eq('department', 'RD');
    } else {
      q = q.eq('Team', 'HN-MKT').neq('department', 'RD');
    }

    if (startDate) q = q.gte('Ngày', startDate);
    if (endDate) q = q.lte('Ngày', endDate);

    q = q.order('id', { ascending: true }).range(from, from + MKT_SUPABASE_PAGE_SIZE - 1);

    const { data, error } = await q;
    if (error) throw error;

    const chunk = data || [];
    rows.push(...chunk);

    if (chunk.length < MKT_SUPABASE_PAGE_SIZE) break;
    from += MKT_SUPABASE_PAGE_SIZE;
  }

  return rows;
}

const MARKET_GROUPS = {
  'Ngoài Châu Á': ['US', 'Canada', 'Úc', 'Anh', 'Khác'],
  'Châu Á': ['Nhật Bản', 'Hàn Quốc', 'Đài Loan', 'Malaysia', 'Singapore']
};

export default function XemBaoCaoMKT() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  /** `RD` = RnD (API không kèm team=). Mọi trường hợp khác: API luôn `team=HN-MKT`. */
  const teamFilter = searchParams.get('team');

  // Permission Logic
  const { canView, role, team: userTeam } = usePermissions();
  const permissionCode = teamFilter === 'RD' ? 'RND_VIEW' : 'MKT_VIEW';

  // Kiểm tra Admin
  const roleFromHook = (role || '').toUpperCase();
  const roleFromStorage = (localStorage.getItem('userRole') || '').toLowerCase();
  const userJson = localStorage.getItem("user");
  const userObj = userJson ? JSON.parse(userJson) : null;
  const roleFromUserObj = (userObj?.role || '').toLowerCase();

  const roleFromHookLower = (roleFromHook || '').toLowerCase();
  const isAdmin = roleFromHookLower === 'admin' ||
    roleFromHookLower === 'super_admin' ||
    roleFromHookLower === 'finance' ||
    roleFromStorage === 'admin' ||
    roleFromStorage === 'super_admin' ||
    roleFromStorage === 'finance' ||
    roleFromUserObj === 'admin' ||
    roleFromUserObj === 'super_admin' ||
    roleFromUserObj === 'finance';

  // Get user email and name for filtering
  const userEmail = localStorage.getItem('userEmail') || '';
  const userName = localStorage.getItem('username') || '';



  const [activeTab, setActiveTab] = useState('DetailedReport');
  const [data, setData] = useState([]);
  const deferredData = useDeferredValue(data);
  const [loading, setLoading] = useState(false);
  /** Mặc định ẩn — bảng chi tiết theo ngày nhân đôi DOM, rất nặng với nhiều ngày/dòng. */
  const [showDailyBreakdown, setShowDailyBreakdown] = useState(false);
  /** Hủy request detail_reports cũ khi đổi ngày/tab (tránh chờ lâu + state lỗi thời). */
  const fetchMktSeqRef = useRef(0);
  const fetchMktAbortRef = useRef(null);
  const fetchMktTimeoutRef = useRef(null);
  const mktMountedRef = useRef(true);

  // Helper function để format date theo LOCAL time (tránh lỗi timezone trên Vercel)
  const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  /** Mặc định 2 ngày (hôm qua → hôm nay) — tải detail_reports nhanh. */
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatLocalDate(d);
  });
  const [endDate, setEndDate] = useState(() => {
    return formatLocalDate(new Date());
  });
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [selectedTeams, setSelectedTeams] = useState([]); // Multi-select Team filter for Detailed Report
  const [teams, setTeams] = useState([]);

  // Column Settings Modal State
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  // Column Visibility State
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('mktReport_visibleColumns');
    const defaultColumns = {
      stt: true, team: true, marketing: true, mess: true, cpqc: true, orders: true,
      soDonTT: true, dsChot: true, dsChotTT: true, tiLeChot: true, tiLeChotTT: true,
      giaMess: true, cps: true, cp_ds: true, giaTBDon: true,
      soDonHuy: false, dsHuy: false // Ẩn các cột không có trong hình
    };

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Luôn hiện Số đơn / Số đơn TT (có tổng cộng khớp cột)
        parsed.soDonTT = true;
        parsed.orders = true;
        if (MKT_DEV) console.log('📋 Loaded visibleColumns from localStorage:', parsed);
        return parsed;
      } catch (e) {
        console.warn('⚠️ Error parsing visibleColumns from localStorage, using defaults');
        return defaultColumns;
      }
    }
    if (MKT_DEV) console.log('📋 Using default visibleColumns:', defaultColumns);
    return defaultColumns;
  });

  useEffect(() => {
    localStorage.setItem('mktReport_visibleColumns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // Filters for Market Tab
  const [selectedProduct, setSelectedProduct] = useState('ALL');
  const [products, setProducts] = useState([]);
  const [selectedMarket, setSelectedMarket] = useState('ALL');
  const [markets, setMarkets] = useState([]);

  // Filters for Detailed Report Tab
  const [quickSelect, setQuickSelect] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]); // Array for multiple selection
  const [selectedShifts, setSelectedShifts] = useState([]); // Array for Ca filter
  const [selectedMarkets, setSelectedMarkets] = useState([]); // Array for Thị trường filter
  const [shifts, setShifts] = useState([]); // Unique shifts from data
  const [showQuickFilter, setShowQuickFilter] = useState(false);
  const [showTeamFilter, setShowTeamFilter] = useState(false);
  const [showProductFilter, setShowProductFilter] = useState(false);
  const [showShiftFilter, setShowShiftFilter] = useState(false);
  const [showMarketFilter, setShowMarketFilter] = useState(false);

  useEffect(() => {
    mktMountedRef.current = true;
    if (activeTab === 'DetailedReport' || activeTab === 'KpiReport' || activeTab === 'MarketReport') {
      fetchData();
    }
    return () => {
      mktMountedRef.current = false;
      fetchMktAbortRef.current?.abort();
      if (fetchMktTimeoutRef.current) {
        clearTimeout(fetchMktTimeoutRef.current);
        fetchMktTimeoutRef.current = null;
      }
    };
  }, [startDate, endDate, activeTab, teamFilter]);

  // Auto-select "Tất cả" when data is loaded and filters are empty
  useEffect(() => {
    if (activeTab === 'DetailedReport' && products.length > 0 && selectedProducts.length === 0) {
      setSelectedProducts([...products]);
    }
    if (activeTab === 'DetailedReport' && teams.length > 0 && selectedTeams.length === 0) {
      setSelectedTeams([...teams]);
    }
    if (activeTab === 'DetailedReport' && shifts.length > 0 && selectedShifts.length === 0) {
      setSelectedShifts([...shifts]);
    }
    if (activeTab === 'DetailedReport' && markets.length > 0 && selectedMarkets.length === 0) {
      setSelectedMarkets([...markets]);
    }
  }, [products, teams, shifts, markets, activeTab, selectedTeams.length, selectedProducts.length, selectedShifts.length, selectedMarkets.length]);

  const fetchData = async () => {
    setLoading(true);
    /** Chỉ gán khi thực sự gọi API (không phải test mode). */
    let abortSeq = null;
    let timedOut = false;
    try {
      // --- TESTING MODE CHECK ---
      try {
        const settings = localStorage.getItem('system_settings');
        if (settings) {
          const parsed = JSON.parse(settings);
          if (parsed.dataSource === 'test') {
            console.log("🔶 [TEST MODE] Loading Mock Data for MKT Detailed Report");
            const mockReports = [
              {
                'Ngày': new Date().toISOString(),
                'Team': 'Team Test',
                'Tên': 'MKT Test User 1',
                'Sản_phẩm': 'Sản phẩm A',
                'Thị_trường': 'Hà Nội',
                'CPQC': 1000000,
                'Số_Mess_Cmt': 50,
                'Số đơn': 10,
                'Doanh số': 3000000,
                'Số đơn thực tế': 8,
                'Doanh thu chốt thực tế': 2400000,
                'Số đơn hoàn hủy': 2,
                'Số đơn hoàn hủy thực tế': 1,
                'Doanh số hoàn hủy thực tế': 300000,
                'DS sau hoàn hủy': 2400000,
                'Doanh số sau hoàn hủy thực tế': 2100000,
                'Doanh số sau ship': 2000000,
                'Doanh số TC': 2000000,
                'KPIs': 10000000
              },
              {
                'Ngày': new Date().toISOString(),
                'Team': 'Team Test',
                'Tên': 'MKT Test User 2',
                'Sản_phẩm': 'Sản phẩm B',
                'Thị_trường': 'Hồ Chí Minh',
                'CPQC': 800000,
                'Số_Mess_Cmt': 40,
                'Số đơn': 8,
                'Doanh số': 2400000,
                'Số đơn thực tế': 8,
                'Doanh thu chốt thực tế': 2400000,
                'Số đơn hoàn hủy': 0,
                'Số đơn hoàn hủy thực tế': 0,
                'Doanh số hoàn hủy thực tế': 0,
                'DS sau hoàn hủy': 2400000,
                'Doanh số sau hoàn hủy thực tế': 2400000,
                'Doanh số sau ship': 2300000,
                'Doanh số TC': 2300000,
                'KPIs': 8000000
              }
            ];

            startTransition(() => {
              setShowDailyBreakdown(false);
              setData(mockReports);
              setTeams(['Team Test']);
              setProducts(['Sản phẩm A', 'Sản phẩm B']);
              setMarkets(['Hà Nội', 'Hồ Chí Minh']);
            });
            setLoading(false);
            return; // EXIT EARLY
          }
        }
      } catch (e) {
        console.warn("Error checking test mode:", e);
      }
      // --------------------------

      abortSeq = ++fetchMktSeqRef.current;
      fetchMktAbortRef.current?.abort();
      if (fetchMktTimeoutRef.current) {
        clearTimeout(fetchMktTimeoutRef.current);
        fetchMktTimeoutRef.current = null;
      }
      const ac = new AbortController();
      fetchMktAbortRef.current = ac;
      fetchMktTimeoutRef.current = setTimeout(() => {
        timedOut = true;
        ac.abort();
      }, MKT_DETAIL_FETCH_TIMEOUT_MS);
      const signal = ac.signal;

      function applyDetailReportsPayload(allReports) {
        if (abortSeq !== fetchMktSeqRef.current) return;

        if (MKT_DEV) console.log(`✅ Đã tải ${allReports.length} bản ghi detail_reports`);

        if (MKT_DEV && allReports.length > 0) {
          const sampleDates = allReports.slice(0, 3).map(r => r['Ngày']);
          console.log(`📅 Sample dates từ DB:`, sampleDates);
          console.log(`📅 Date format check: startDate=${startDate}, endDate=${endDate}`);
        }

        // Lọc theo khoảng ngày UI; giữ dòng không parse được ngày (tránh mất data API format lạ)
        let dateFilteredReports = allReports.filter((r) => {
          const reportDate = parseSmartDate(r['Ngày']);
          if (!reportDate) return true;

          reportDate.setHours(0, 0, 0, 0);
          const start = startDate ? parseSmartDate(startDate) : null;
          const end = endDate ? parseSmartDate(endDate) : null;

          if (start) {
            start.setHours(0, 0, 0, 0);
            if (reportDate < start) return false;
          }

          if (end) {
            end.setHours(0, 0, 0, 0);
            if (reportDate > end) return false;
          }

          return true;
        });

        if (MKT_DEV) console.log(`📊 After client-side date filter: ${dateFilteredReports.length}/${allReports.length}`);

        // Then filter by hierarchical permissions
        // Admin: luôn xem tất cả dữ liệu, không bị filter
        if (!isAdmin) {
          // Non-admin: Áp dụng filter theo role
          // Leader: see team data only
          if (role?.toUpperCase() === 'LEADER' && userTeam) {
            dateFilteredReports = dateFilteredReports.filter(item =>
              item['Team'] && item['Team'].toLowerCase() === userTeam.toLowerCase()
            );
          } else {
            // Helper function to normalize name for matching
            const normalizeNameForMatch = (str) => {
              if (!str) return '';
              return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
            };

            // Staff: see own data only (by name or email)
            dateFilteredReports = dateFilteredReports.filter(item => {
              const itemName = normalizeNameForMatch(item['Tên'] || '');
              const itemEmail = normalizeNameForMatch(item['Email'] || '');
              const currentUserName = normalizeNameForMatch(userName);
              const currentUserEmail = normalizeNameForMatch(userEmail);

              return (itemName === currentUserName && currentUserName !== '') ||
                (itemEmail === currentUserEmail && currentUserEmail !== '') ||
                itemName.includes(currentUserName) ||
                currentUserName.includes(itemName);
            });
          }
        } else {
          // Admin: xem tất cả, không filter
          if (MKT_DEV) console.log('✅ Admin: Viewing all MKT reports (no filter applied)');
        }

        if (MKT_DEV) {
          console.log(
            `📊 Filtered to ${dateFilteredReports.length} records based on permissions (role: ${role}, team: ${userTeam}, isAdmin: ${isAdmin})`
          );
        }

        const uniqueTeams = [...new Set(dateFilteredReports.map(r => r['Team']).filter(Boolean))].sort();
        const uniqueProducts = [...new Set(dateFilteredReports.map(r => r['Sản_phẩm']).filter(Boolean))].sort();
        const uniqueMarkets = [...new Set(dateFilteredReports.map(r => r['Thị_trường']).filter(Boolean))].sort();
        const uniqueShifts = [...new Set(dateFilteredReports.map(r => r['ca']).filter(Boolean))].sort();

        startTransition(() => {
          setShowDailyBreakdown(false);
          setData(dateFilteredReports);
          setTeams(uniqueTeams);
          setSelectedTeams((prev) => {
            const next = prev.filter((v) => uniqueTeams.includes(v));
            return next.length > 0 ? next : uniqueTeams;
          });
          setProducts(uniqueProducts);
          setSelectedProducts((prev) => {
            const next = prev.filter((v) => uniqueProducts.includes(v));
            return next.length > 0 ? next : uniqueProducts;
          });
          setMarkets(uniqueMarkets);
          setSelectedMarkets((prev) => {
            const next = prev.filter((v) => uniqueMarkets.includes(v));
            return next.length > 0 ? next : uniqueMarkets;
          });
          setShifts(uniqueShifts);
          setSelectedShifts((prev) => {
            const next = prev.filter((v) => uniqueShifts.includes(v));
            return next.length > 0 ? next : uniqueShifts;
          });
        });
      }

      const cacheKey = mktDetailCacheKey(startDate, endDate, teamFilter);
      const cachedRaw = readMktDetailCache(cacheKey);
      if (cachedRaw) {
        if (fetchMktTimeoutRef.current) {
          clearTimeout(fetchMktTimeoutRef.current);
          fetchMktTimeoutRef.current = null;
        }
        if (MKT_DEV) console.log('✅ detail_reports từ cache (session, ~5 phút)');
        if (abortSeq !== fetchMktSeqRef.current) return;
        const allReports = cachedRaw.map(normalizeMktDetailApiRow);
        applyDetailReportsPayload(allReports);
        return;
      }

      if (MKT_DEV) console.log(`📡 detail_reports (Supabase): ${startDate} → ${endDate}`);

      let rawRows;
      try {
        rawRows = await fetchDetailReportsFromSupabaseAll(startDate, endDate, teamFilter);
      } finally {
        if (fetchMktTimeoutRef.current) {
          clearTimeout(fetchMktTimeoutRef.current);
          fetchMktTimeoutRef.current = null;
        }
      }
      if (abortSeq !== fetchMktSeqRef.current) return;
      writeMktDetailCache(cacheKey, rawRows);
      const allReports = rawRows.map(normalizeMktDetailApiRow);
      applyDetailReportsPayload(allReports);

    } catch (err) {
      if (err?.name === 'AbortError') {
        if (abortSeq === fetchMktSeqRef.current && timedOut) {
          alert(
            '⏱️ Tải dữ liệu quá lâu (90 giây). Vui lòng thu hẹp khoảng ngày hoặc thử lại sau khi mạng/API ổn định.'
          );
          setData([]);
        }
        return;
      }
      console.error('❌ Error fetching data:', err);
      console.error('❌ Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      });

      // Hiển thị thông báo lỗi rõ ràng hơn cho user
      if (err.message && (err.message.includes('Backend server') || err.message.includes('non-JSON'))) {
        alert(`⚠️ ${err.message}\n\nVui lòng đảm bảo backend server đang chạy:\nnpm run server`);
      } else {
        alert(`❌ Lỗi khi tải dữ liệu: ${err.message || 'Lỗi không xác định'}\n\nVui lòng kiểm tra console để xem chi tiết.`);
      }

      setData([]);
    } finally {
      if (fetchMktTimeoutRef.current) {
        clearTimeout(fetchMktTimeoutRef.current);
        fetchMktTimeoutRef.current = null;
      }
      if (mktMountedRef.current && abortSeq !== null && abortSeq === fetchMktSeqRef.current) {
        setLoading(false);
      }
    }
  };

  const processData = useMemo(() => {
    if (!deferredData.length) {
      return {
        rows: [],
        total: {
          mess: 0,
          cpqc: 0,
          orders: 0,
          soDonTT: 0,
          dsChot: 0,
          dsChotTT: 0,
          tiLeChot: 0,
          tiLeChotTT: 0,
          giaMess: 0,
          cps: 0,
          cp_ds: 0,
          giaTBDon: 0,
          dsSauShip: 0,
          kpiValue: 0,
          soDonHuyTT: 0,
          dsHuyTT: 0,
          dsThanhCongTT: 0,
          cp_ds_sau_ship: 0,
          kpi_percent: 0,
        },
        dailyData: []
      };
    }

    const filteredRaw = deferredData.filter((row) => {
      if (selectedTeams.length > 0 && !selectedTeams.includes(row['Team'])) return false;
      if (selectedProducts.length > 0 && !selectedProducts.includes(row['Sản_phẩm'])) return false;
      if (selectedShifts.length > 0 && !selectedShifts.includes(row['ca'])) return false;
      if (selectedMarkets.length > 0 && !selectedMarkets.includes(row['Thị_trường'])) return false;
      return true;
    });

    const rows = filteredRaw
      .map((row) => mapRawRowToProcessRow(row))
      .sort((a, b) => (a.team || '').localeCompare(b.team || '') || (a.name || '').localeCompare(b.name || ''));

    const total = deriveTotalsFromSums(sumProcessRows(rows));

    let dailyData = [];
    if (activeTab === 'DetailedReport') {
      const byDay = new Map();
      for (const row of filteredRaw) {
        const key = ymdKeyFromReportRow(row);
        if (!key) continue;
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(row);
      }

      dailyData = Array.from(byDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, dayRaw]) => {
          const dayRows = dayRaw
            .map((r) => mapRawRowToProcessRow(r))
            .sort((a, b) => (a.team || '').localeCompare(b.team || '') || (a.name || '').localeCompare(b.name || ''));
          return {
            date,
            rows: dayRows,
            total: deriveTotalsFromSums(sumProcessRows(dayRows)),
          };
        });
    }

    return { rows, total, dailyData };
  }, [deferredData, selectedTeams, selectedProducts, selectedShifts, selectedMarkets, activeTab]);

  // Logic for Market Report (Tab 4)
  const processMarketData = useMemo(() => {
    if (activeTab !== 'MarketReport') {
      return { asia: [], nonAsia: [], summary: [] };
    }
    if (!deferredData.length) return { asia: [], nonAsia: [], summary: [] };

    const processGroup = (records, showMarketColumns = true) => {
      const productGroups = {};

      records.forEach(r => {
        if (selectedProduct !== 'ALL' && r['Sản_phẩm'] !== selectedProduct) return;
        if (selectedMarket !== 'ALL' && r['Thị_trường'] !== selectedMarket) return;
        if (selectedTeam !== 'ALL' && r.Team !== selectedTeam) return;

        const productKey = r['Sản_phẩm'] || 'Chưa xác định';
        const marketKey = showMarketColumns ? (r['Thị_trường'] || 'Không xác định') : '_TOTAL_';

        if (!productGroups[productKey]) productGroups[productKey] = {};
        if (!productGroups[productKey][marketKey]) {
          productGroups[productKey][marketKey] = {
            product: productKey,
            market: marketKey,
            cpqc: 0, soDon: 0, soDonThucTe: 0, soMessCmt: 0,
            dsChot: 0, dsChotThucTe: 0, dsHoanHuyThucTe: 0,
            dsSauHoanHuyThucTe: 0
          };
        }

        const g = productGroups[productKey][marketKey];
        g.cpqc += Number(r['CPQC'] || 0);
        const donTT = parseIntegerVi(r['Số đơn thực tế']);
        g.soDon += donTT;
        g.soDonThucTe += donTT;
        g.soMessCmt += parseIntegerVi(r['Số_Mess_Cmt']);
        const dtChotTT = parseMoneyNumber(r['Doanh thu chốt thực tế']);
        const dsTT = pickDoanhSoTT(r) || (dtChotTT !== null ? dtChotTT : 0);
        g.dsChot += dsTT;
        g.dsChotThucTe += dsTT;
        g.dsHoanHuyThucTe += Number(r['Doanh số hoàn hủy thực tế'] || 0);
        g.dsSauHoanHuyThucTe += Number(r['Doanh số sau hoàn hủy thực tế'] || 0);
      });

      let flattened = [];
      Object.keys(productGroups).sort().forEach(pKey => {
        const markets = productGroups[pKey];
        const pTotal = {
          product: pKey, market: 'Tổng',
          cpqc: 0, soDon: 0, soDonThucTe: 0, soMessCmt: 0,
          dsChot: 0, dsChotThucTe: 0, dsHoanHuyThucTe: 0,
          dsSauHoanHuyThucTe: 0,
          isHeader: true
        };

        Object.keys(markets).sort().forEach(mKey => {
          const mData = markets[mKey];
          flattened.push(calculateMarketMetrics(mData));
          pTotal.cpqc += mData.cpqc;
          pTotal.soDon += mData.soDon;
          pTotal.soDonThucTe += mData.soDonThucTe;
          pTotal.soMessCmt += mData.soMessCmt;
          pTotal.dsChot += mData.dsChot;
          pTotal.dsChotThucTe += mData.dsChotThucTe;
          pTotal.dsHoanHuyThucTe += mData.dsHoanHuyThucTe;
          pTotal.dsSauHoanHuyThucTe += mData.dsSauHoanHuyThucTe;
        });

        if (showMarketColumns && Object.keys(markets).length > 1) {
          flattened.push(calculateMarketMetrics(pTotal));
        }
      });

      return flattened;
    };

    const calculateMarketMetrics = (d) => {
      const costPercent = d.dsSauHoanHuyThucTe > 0 ? (d.cpqc / d.dsSauHoanHuyThucTe) * 100 : 0;
      const cps = d.soDon ? d.cpqc / d.soDon : 0;
      const avgOrderValue = d.soDon ? d.dsSauHoanHuyThucTe / d.soDon : 0;
      const closingRate = d.soMessCmt ? (d.soDon / d.soMessCmt) * 100 : 0;
      const closingRateThucTe = d.soMessCmt ? (d.soDonThucTe / d.soMessCmt) * 100 : 0;

      return { ...d, costPercent, cps, avgOrderValue, closingRate, closingRateThucTe };
    };

    const asiaList = [];
    const nonAsiaList = [];
    const nonAsiaMarketsLower = MARKET_GROUPS['Ngoài Châu Á'].map(m => m.toLowerCase());

    deferredData.forEach((r) => {
      const market = (r['Thị_trường'] || '').toLowerCase();
      if (nonAsiaMarketsLower.some(m => market.includes(m))) {
        nonAsiaList.push(r);
      } else {
        asiaList.push(r);
      }
    });

    return {
      nonAsia: processGroup(nonAsiaList, true),
      asia: processGroup(asiaList, true),
      summary: processGroup(deferredData, false)
    };

  }, [deferredData, selectedProduct, selectedMarket, selectedTeam, activeTab]);



  // Quick date select handler
  const handleQuickDateSelect = (value) => {
    setQuickSelect(value);
    if (!value) return;

    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (value) {
      case 'today':
        start = new Date(today);
        end = new Date(today);
        break;
      case 'yesterday':
        start = new Date(today);
        start.setDate(today.getDate() - 1);
        end = new Date(start);
        break;
      case 'thisWeek':
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        start = new Date(today.getFullYear(), today.getMonth(), diff);
        end = new Date(today);
        break;
      case 'lastWeek':
        const lastWeekDay = today.getDay();
        const lastWeekDiff = today.getDate() - lastWeekDay - 6 + (lastWeekDay === 0 ? -6 : 1);
        start = new Date(today.getFullYear(), today.getMonth(), lastWeekDiff);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'last7Days':
        start = new Date(today);
        start.setDate(today.getDate() - 7);
        end = new Date(today);
        break;
      case 'last30Days':
        start = new Date(today);
        start.setDate(today.getDate() - 30);
        end = new Date(today);
        break;
      default:
        return;
    }

    setStartDate(formatLocalDate(start));
    setEndDate(formatLocalDate(end));
  };

  const handleDateInputChange = (setter, value) => {
    setter(value);
    setQuickSelect('');
  };

  // Handle filter checkbox changes
  const handleFilterChange = (filterType, value, isChecked) => {
    if (filterType === 'team') {
      if (value === 'ALL') {
        setSelectedTeams(isChecked ? teams : []);
      } else {
        setSelectedTeams(prev =>
          isChecked ? [...prev, value] : prev.filter(t => t !== value)
        );
      }
    } else if (filterType === 'product') {
      if (value === 'ALL') {
        setSelectedProducts(isChecked ? products : []);
      } else {
        setSelectedProducts(prev =>
          isChecked ? [...prev, value] : prev.filter(p => p !== value)
        );
      }
    } else if (filterType === 'shift') {
      if (value === 'ALL') {
        setSelectedShifts(isChecked ? shifts : []);
      } else {
        setSelectedShifts(prev =>
          isChecked ? [...prev, value] : prev.filter(s => s !== value)
        );
      }
    } else if (filterType === 'market') {
      if (value === 'ALL') {
        setSelectedMarkets(isChecked ? markets : []);
      } else {
        setSelectedMarkets(prev =>
          isChecked ? [...prev, value] : prev.filter(m => m !== value)
        );
      }
    }
  };

  const handleSelectAll = (filterType, isChecked) => {
    handleFilterChange(filterType, 'ALL', isChecked);
  };

  const renderMarketTable = (rows, title) => {
    if (!rows || rows.length === 0) return null;

    const total = {
      cpqc: 0, soDon: 0, soDonThucTe: 0, soMessCmt: 0,
      dsChot: 0, dsChotThucTe: 0, dsHoanHuyThucTe: 0, dsSauHoanHuyThucTe: 0
    };

    rows.forEach(r => {
      if (!r.isHeader) {
        total.cpqc += r.cpqc;
        total.soDon += r.soDon;
        total.soDonThucTe += r.soDonThucTe;
        total.soMessCmt += r.soMessCmt;
        total.dsChot += r.dsChot;
        total.dsChotThucTe += r.dsChotThucTe;
        total.dsHoanHuyThucTe += r.dsHoanHuyThucTe;
        total.dsSauHoanHuyThucTe += r.dsSauHoanHuyThucTe;
      }
    });

    const totalMetrics = {
      costPercent: total.dsSauHoanHuyThucTe > 0 ? (total.cpqc / total.dsSauHoanHuyThucTe) * 100 : 0,
      cps: total.soDon ? total.cpqc / total.soDon : 0,
      avgOrderValue: total.soDon ? total.dsSauHoanHuyThucTe / total.soDon : 0,
      closingRate: total.soMessCmt ? (total.soDon / total.soMessCmt) * 100 : 0,
      closingRateThucTe: total.soMessCmt ? (total.soDonThucTe / total.soMessCmt) * 100 : 0
    };


    return (
      <div className="table-responsive-container" style={{ marginTop: '20px' }}>
        <h3 style={{ color: '#2d7c2d', marginBottom: '10px' }}>{title}</h3>
        <table className="report-table">
          <thead>
            <tr>
              <th className="green-header text-left">Sản phẩm</th>
              <th className="green-header text-left">Thị trường</th>
              <th className="green-header">CPQC</th>
              <th className="green-header">Số Đơn</th>
              <th className="green-header">Số Mess</th>
              <th className="green-header">DS Chốt</th>
              <th className="green-header">DS Chốt (TT)</th>
              <th className="green-header">DS Hoàn Hủy (TT)</th>
              <th className="green-header">DS Sau HH (TT)</th>
              <th className="yellow-header">%CP/DS</th>
              <th className="yellow-header">CPS</th>
              <th className="yellow-header">Giá TB Đơn</th>
              <th className="yellow-header">Tỉ lệ chốt</th>
              <th className="yellow-header">TL Chốt (TT)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="total-row">
              <td colSpan={2} className="text-center">TỔNG CỘNG</td>
              <td>{fmtCurrency(total.cpqc)}</td>
              <td>{fmtNum(total.soDon)}</td>
              <td>{fmtNum(total.soDonThucTe)}</td>
              <td>{fmtNum(total.soMessCmt)}</td>
              <td>{fmtCurrency(total.dsChot)}</td>
              <td>{fmtCurrency(total.dsChotThucTe)}</td>
              <td>{fmtCurrency(total.dsHoanHuyThucTe)}</td>
              <td>{fmtCurrency(total.dsSauHoanHuyThucTe)}</td>
              <td className="text-center">{fmtPct(totalMetrics.costPercent)}</td>
              <td>{fmtCurrency(totalMetrics.cps)}</td>
              <td>{fmtCurrency(totalMetrics.avgOrderValue)}</td>
              <td className="text-center">{fmtPct(totalMetrics.closingRate)}</td>
              <td className="text-center">{fmtPct(totalMetrics.closingRateThucTe)}</td>
            </tr>
            {rows.map((r, i) => (
              <tr key={i} style={r.isHeader ? { fontWeight: 'bold', backgroundColor: '#e8f5e9' } : {}}>
                <td className="text-left">{r.isHeader ? 'Tổng ' + r.product : r.product}</td>
                <td className="text-left">{r.market === '_TOTAL_' ? '' : r.market}</td>
                <td>{fmtCurrency(r.cpqc)}</td>
                <td>{fmtNum(r.soDon)}</td>
                <td>{fmtNum(r.soDonThucTe)}</td>
                <td>{fmtNum(r.soMessCmt)}</td>
                <td>{fmtCurrency(r.dsChot)}</td>
                <td>{fmtCurrency(r.dsChotThucTe)}</td>
                <td>{fmtCurrency(r.dsHoanHuyThucTe)}</td>
                <td>{fmtCurrency(r.dsSauHoanHuyThucTe)}</td>
                <td className="text-center">{fmtPct(r.costPercent)}</td>
                <td>{fmtCurrency(r.cps)}</td>
                <td>{fmtCurrency(r.avgOrderValue)}</td>
                <td className={`text-center ${getRateClass(r.closingRate)}`}>{fmtPct(r.closingRate)}</td>
                <td className={`text-center ${getRateClass(r.closingRateThucTe)}`}>{fmtPct(r.closingRateThucTe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (!canView(permissionCode)) {
    return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
  }

  return (
    <div className="report-view-container">
      {loading && (
        <div className="mkt-loading-banner" role="status" aria-live="polite">
          Đang tải dữ liệu…
        </div>
      )}

      <div className="tab-container">
        <button
          className={`tablinks ${activeTab === 'DetailedReport' ? 'active' : ''}`}
          onClick={() => setActiveTab('DetailedReport')}
        >
          Báo cáo chi tiết
        </button>
        <button
          className={`tablinks ${activeTab === 'KpiReport' ? 'active' : ''}`}
          onClick={() => setActiveTab('KpiReport')}
          style={{ display: 'none' }}
        >
          Hiệu suất KPI
        </button>
        <button
          className={`tablinks ${activeTab === 'MarketReport' ? 'active' : ''}`}
          onClick={() => setActiveTab('MarketReport')}
        >
          Hiệu quả MKT
        </button>
        <button
          className={`tablinks ${activeTab === 'HieuSuatKPI' ? 'active' : ''}`}
          onClick={() => setActiveTab('HieuSuatKPI')}
          style={{ display: 'none' }}
        >
          Hiệu suất KPI
        </button>
      </div>


      {/* TAB 1: Detailed Report */}
      {
        activeTab === 'DetailedReport' && (
          <div id="DetailedReport" className={`tab-content ${activeTab === 'DetailedReport' ? 'active' : ''}`}>
            <div className="main-content-area detailed-report-main">
              <div className="filters-bar mkt-sale-filters">
                <div className="filters-row">
                  <div className="filter-group dropdown-group">
                    <button
                      className="filter-dropdown-btn"
                      onClick={() => setShowQuickFilter(!showQuickFilter)}
                    >
                      Lọc nhanh
                      <span className="dropdown-arrow">{showQuickFilter ? '▼' : '▶'}</span>
                    </button>
                    {showQuickFilter && (
                      <div className="filter-dropdown-content">
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('today'); setShowQuickFilter(false); }}>Hôm nay</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('yesterday'); setShowQuickFilter(false); }}>Hôm qua</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('thisWeek'); setShowQuickFilter(false); }}>Tuần này</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('lastWeek'); setShowQuickFilter(false); }}>Tuần trước</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('thisMonth'); setShowQuickFilter(false); }}>Tháng này</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('lastMonth'); setShowQuickFilter(false); }}>Tháng trước</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('last7Days'); setShowQuickFilter(false); }}>7 ngày qua</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('last30Days'); setShowQuickFilter(false); }}>30 ngày qua</button>
                      </div>
                    )}
                  </div>

                  <div className="filter-group date-group">
                    <label>Từ ngày</label>
                    <input type="date" value={startDate} onChange={e => handleDateInputChange(setStartDate, e.target.value)} />
                  </div>

                  <div className="filter-group date-group">
                    <label>Đến ngày</label>
                    <input type="date" value={endDate} onChange={e => handleDateInputChange(setEndDate, e.target.value)} />
                  </div>

                  <div className="filter-group dropdown-group">
                    <button
                      className="filter-dropdown-btn"
                      onClick={() => setShowTeamFilter(!showTeamFilter)}
                    >
                      Team {selectedTeams.length > 0 && selectedTeams.length < teams.length ? `(${selectedTeams.length})` : ''}
                      <span className="dropdown-arrow">{showTeamFilter ? '▼' : '▶'}</span>
                    </button>
                    {showTeamFilter && (
                      <div className="filter-dropdown-content">
                        <label className="select-all-label">
                          <input
                            type="checkbox"
                            checked={teams.length > 0 && selectedTeams.length === teams.length}
                            onChange={e => handleSelectAll('team', e.target.checked)}
                          />
                          <span className="filter-option-text">Tất cả</span>
                        </label>
                        {teams.map(team => (
                          <label key={team}>
                            <input
                              type="checkbox"
                              checked={selectedTeams.includes(team)}
                              onChange={e => handleFilterChange('team', team, e.target.checked)}
                            />
                            <span className="filter-option-text">{team}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="filter-group dropdown-group">
                    <button
                      className="filter-dropdown-btn"
                      onClick={() => setShowProductFilter(!showProductFilter)}
                    >
                      Sản phẩm {selectedProducts.length > 0 && selectedProducts.length < products.length ? `(${selectedProducts.length})` : ''}
                      <span className="dropdown-arrow">{showProductFilter ? '▼' : '▶'}</span>
                    </button>
                    {showProductFilter && (
                      <div className="filter-dropdown-content">
                        <label className="select-all-label">
                          <input
                            type="checkbox"
                            checked={products.length > 0 && selectedProducts.length === products.length}
                            onChange={e => handleSelectAll('product', e.target.checked)}
                          />
                          <span className="filter-option-text">Tất cả</span>
                        </label>
                        {products.map(product => (
                          <label key={product}>
                            <input
                              type="checkbox"
                              checked={selectedProducts.includes(product)}
                              onChange={e => handleFilterChange('product', product, e.target.checked)}
                            />
                            <span className="filter-option-text">{product}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="filter-group dropdown-group">
                    <button
                      className="filter-dropdown-btn"
                      onClick={() => setShowShiftFilter(!showShiftFilter)}
                    >
                      Ca {selectedShifts.length > 0 && selectedShifts.length < shifts.length ? `(${selectedShifts.length})` : ''}
                      <span className="dropdown-arrow">{showShiftFilter ? '▼' : '▶'}</span>
                    </button>
                    {showShiftFilter && (
                      <div className="filter-dropdown-content">
                        <label className="select-all-label">
                          <input
                            type="checkbox"
                            checked={shifts.length > 0 && selectedShifts.length === shifts.length}
                            onChange={e => handleSelectAll('shift', e.target.checked)}
                          />
                          <span className="filter-option-text">Tất cả</span>
                        </label>
                        {shifts.map(shift => (
                          <label key={shift}>
                            <input
                              type="checkbox"
                              checked={selectedShifts.includes(shift)}
                              onChange={e => handleFilterChange('shift', shift, e.target.checked)}
                            />
                            <span className="filter-option-text">{shift}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="filter-group dropdown-group">
                    <button
                      className="filter-dropdown-btn"
                      onClick={() => setShowMarketFilter(!showMarketFilter)}
                    >
                      Thị trường {selectedMarkets.length > 0 && selectedMarkets.length < markets.length ? `(${selectedMarkets.length})` : ''}
                      <span className="dropdown-arrow">{showMarketFilter ? '▼' : '▶'}</span>
                    </button>
                    {showMarketFilter && (
                      <div className="filter-dropdown-content">
                        <label className="select-all-label">
                          <input
                            type="checkbox"
                            checked={markets.length > 0 && selectedMarkets.length === markets.length}
                            onChange={e => handleSelectAll('market', e.target.checked)}
                          />
                          <span className="filter-option-text">Tất cả</span>
                        </label>
                        {markets.map(market => (
                          <label key={market}>
                            <input
                              type="checkbox"
                              checked={selectedMarkets.includes(market)}
                              onChange={e => handleFilterChange('market', market, e.target.checked)}
                            />
                            <span className="filter-option-text">{market}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="filter-group btn-group">
                    <button
                      className="btn-view"
                      onClick={() => {
                        if (startDate && endDate) {
                          fetchData();
                        } else {
                          alert('Vui lòng chọn khoảng thời gian');
                        }
                      }}
                      disabled={loading || !startDate || !endDate}
                    >
                      {loading ? 'Đang tải...' : 'Xem'}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="table-responsive-container">
                  {/* Column Settings Button */}
                  <div className="mb-4">
                    <button
                      onClick={() => setShowColumnSettings(true)}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      Cột hiển thị
                    </button>
                  </div>

                  {/* Banner Header */}
                  <div className="bg-[#2d7c2d] text-white p-3 font-bold text-lg uppercase mb-0 rounded-t-lg">
                    BÁO CÁO TỔNG HỢP
                  </div>

                  {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center' }}>Đang tải dữ liệu...</div>
                  ) : (
                    // Main Summary Table
                    <>
                      <table className="report-table" style={{ marginTop: 0 }}>
                        <thead>
                          <tr>
                            {visibleColumns.stt && <th className="green-header">STT</th>}
                            {visibleColumns.team && <th className="green-header">Team</th>}
                            {visibleColumns.marketing && <th className="green-header">Marketing</th>}
                            {visibleColumns.mess && <th className="green-header">Số Mess</th>}
                            {visibleColumns.cpqc && <th className="green-header">CPQC</th>}
                            {visibleColumns.orders && <th className="green-header">Số Đơn</th>}
                            <th className="green-header" style={{ backgroundColor: '#4CAF50', color: 'white', fontWeight: 'bold' }}>Số Đơn TT</th>
                            {visibleColumns.dsChot && <th className="green-header">DS Chốt</th>}
                            {visibleColumns.dsChotTT && <th className="green-header">DS Chốt (TT)</th>}
                            {visibleColumns.tiLeChot && <th className="yellow-header">Tỉ lệ chốt</th>}
                            {visibleColumns.tiLeChotTT && <th className="yellow-header">Tỉ lệ chốt (TT)</th>}
                            {visibleColumns.giaMess && <th className="yellow-header">Giá Mess</th>}
                            {visibleColumns.cps && <th className="yellow-header">CPS</th>}
                            {visibleColumns.cp_ds && <th className="yellow-header">%CP/DS</th>}
                            {visibleColumns.giaTBDon && <th className="yellow-header">Giá TB Đơn</th>}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="total-row">
                            {(visibleColumns.stt || visibleColumns.team || visibleColumns.marketing) && (
                              <td colSpan={(visibleColumns.stt ? 1 : 0) + (visibleColumns.team ? 1 : 0) + (visibleColumns.marketing ? 1 : 0)} className="text-center total-label">TỔNG CỘNG</td>
                            )}
                            {visibleColumns.mess && <td className="total-value">{fmtNum(processData.total.mess)}</td>}
                            {visibleColumns.cpqc && <td className="total-value">{fmtCurrency(processData.total.cpqc)}</td>}
                            {visibleColumns.orders && <td className="total-value">{fmtNum(processData.total.orders)}</td>}
                            {visibleColumns.soDonTT ? (
                              <td className="total-value" style={{ backgroundColor: processData.total.soDonTT > 0 ? '#e8f5e9' : 'transparent' }}>
                                {fmtNum(processData.total.soDonTT)}
                              </td>
                            ) : (
                              <td className="total-value" style={{ color: 'red' }}>HIDDEN</td>
                            )}
                            {visibleColumns.dsChot && <td className="total-value">{fmtCurrency(processData.total.dsChot)}</td>}
                            {visibleColumns.dsChotTT && <td className="total-value">{fmtCurrency(processData.total.dsChotTT)}</td>}
                            {visibleColumns.tiLeChot && <td className={`text-center total-value ${getRateClass(processData.total.tiLeChot)}`}>{fmtPct(processData.total.tiLeChot)}</td>}
                            {visibleColumns.tiLeChotTT && <td className={`text-center total-value ${getRateClass(processData.total.tiLeChotTT)}`}>{fmtPct(processData.total.tiLeChotTT)}</td>}
                            {visibleColumns.giaMess && <td className="total-value">{fmtCurrency(processData.total.giaMess)}</td>}
                            {visibleColumns.cps && <td className="total-value">{fmtCurrency(processData.total.cps)}</td>}
                            {visibleColumns.cp_ds && <td className="total-value">{fmtPct(processData.total.cp_ds)}</td>}
                            {visibleColumns.giaTBDon && <td className="total-value">{fmtCurrency(processData.total.giaTBDon)}</td>}
                          </tr>
                          {processData.rows.map((row, index) => (
                            <tr key={index}>
                              {visibleColumns.stt && <td className="text-center">{index + 1}</td>}
                              {visibleColumns.team && <td className="text-left">{row.team}</td>}
                              {visibleColumns.marketing && <td className="text-left">{row.name}</td>}
                              {visibleColumns.mess && <td>{fmtNum(row.mess)}</td>}
                              {visibleColumns.cpqc && <td>{fmtCurrency(row.cpqc)}</td>}
                              {visibleColumns.orders && <td>{fmtNum(row.orders)}</td>}
                              {visibleColumns.soDonTT ? (
                                <td title={`soDonTT=${row.soDonTT}`} style={{ backgroundColor: row.soDonTT > 0 ? '#e8f5e9' : 'transparent' }}>
                                  {fmtNum(row.soDonTT)}
                                </td>
                              ) : (
                                <td style={{ color: 'red' }}>HIDDEN</td>
                              )}
                              {visibleColumns.dsChot && <td>{fmtCurrency(row.dsChot)}</td>}
                              {visibleColumns.dsChotTT && <td>{fmtCurrency(row.dsChotTT)}</td>}
                              {visibleColumns.tiLeChot && <td className={`text-center ${getRateClass(row.tiLeChot)}`}>{fmtPct(row.tiLeChot)}</td>}
                              {visibleColumns.tiLeChotTT && <td className={`text-center ${getRateClass(row.tiLeChotTT)}`}>{fmtPct(row.tiLeChotTT)}</td>}
                              {visibleColumns.giaMess && <td>{fmtCurrency(row.giaMess)}</td>}
                              {visibleColumns.cps && <td className={getCpsCellStyle(row.cps)}>{fmtCurrency(row.cps)}</td>}
                              {visibleColumns.cp_ds && <td className={`text-center ${row.cp_ds > 33 ? 'bg-yellow' : ''}`}>{fmtPct(row.cp_ds)}</td>}
                              {visibleColumns.giaTBDon && <td>{fmtCurrency(row.giaTBDon)}</td>}
                            </tr>
                          ))}
                          {processData.rows.length === 0 && (
                            <tr>
                              <td colSpan={15} className="text-center" style={{ padding: '30px' }}>
                                Không có dữ liệu trong khoảng thời gian này
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                      {/* Khoảng ngày đang xem (input type=date = YYYY-MM-DD) */}
                      <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                        {startDate && endDate
                          ? `${parseSmartDate(startDate)?.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) || startDate} → ${parseSmartDate(endDate)?.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) || endDate}`
                          : ''}
                      </div>

                      {processData.dailyData.length > 0 && (
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '14px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            userSelect: 'none',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={showDailyBreakdown}
                            onChange={(e) => setShowDailyBreakdown(e.target.checked)}
                          />
                          Hiển thị chi tiết theo ngày ({processData.dailyData.length} ngày)
                        </label>
                      )}

                      {/* Daily Breakdown — tắt mặc định: giảm lag khi nhiều ngày */}
                      {showDailyBreakdown && processData.dailyData.length > 0 && processData.dailyData.map((dayData, dIdx) => (
                        <div key={dIdx} style={{ marginTop: '30px' }}>
                          <h3 style={{ borderBottom: '2px solid #2d7c2d', paddingBottom: '5px', marginBottom: '10px' }}>
                            {dayData.date.split('-').reverse().join('/')}
                          </h3>
                          <table className="report-table" style={{ marginTop: '10px' }}>
                            <thead>
                              <tr>
                                {visibleColumns.stt && <th className="green-header">STT</th>}
                                {visibleColumns.team && <th className="green-header">Team</th>}
                                {visibleColumns.marketing && <th className="green-header">Marketing</th>}
                                {visibleColumns.mess && <th className="green-header">Số Mess</th>}
                                {visibleColumns.cpqc && <th className="green-header">CPQC</th>}
                                {visibleColumns.orders && <th className="green-header">Số Đơn</th>}
                                <th className="green-header" style={{ backgroundColor: '#4CAF50', color: 'white', fontWeight: 'bold' }}>Số Đơn TT</th>
                                {visibleColumns.dsChot && <th className="green-header">DS Chốt</th>}
                                {visibleColumns.dsChotTT && <th className="green-header">DS Chốt (TT)</th>}
                                {visibleColumns.tiLeChot && <th className="yellow-header">Tỉ lệ chốt</th>}
                                {visibleColumns.tiLeChotTT && <th className="yellow-header">Tỉ lệ chốt (TT)</th>}
                                {visibleColumns.giaMess && <th className="yellow-header">Giá Mess</th>}
                                {visibleColumns.cps && <th className="yellow-header">CPS</th>}
                                {visibleColumns.cp_ds && <th className="yellow-header">%CP/DS</th>}
                                {visibleColumns.giaTBDon && <th className="yellow-header">Giá TB Đơn</th>}
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="total-row">
                                {(visibleColumns.stt || visibleColumns.team || visibleColumns.marketing) && (
                                  <td colSpan={(visibleColumns.stt ? 1 : 0) + (visibleColumns.team ? 1 : 0) + (visibleColumns.marketing ? 1 : 0)} className="text-center total-label">TỔNG CỘNG</td>
                                )}
                                {visibleColumns.mess && <td className="total-value">{fmtNum(dayData.total.mess)}</td>}
                                {visibleColumns.cpqc && <td className="total-value">{fmtCurrency(dayData.total.cpqc)}</td>}
                                {visibleColumns.orders && <td className="total-value">{fmtNum(dayData.total.orders)}</td>}
                                <td className="total-value" style={{ backgroundColor: dayData.total.soDonTT > 0 ? '#e8f5e9' : 'transparent', fontWeight: 'bold' }}>
                                  {fmtNum(dayData.total.soDonTT)}
                                </td>
                                {visibleColumns.dsChot && <td className="total-value">{fmtCurrency(dayData.total.dsChot)}</td>}
                                {visibleColumns.dsChotTT && <td className="total-value">{fmtCurrency(dayData.total.dsChotTT)}</td>}
                                {visibleColumns.tiLeChot && <td className={`text-center total-value ${getRateClass(dayData.total.tiLeChot)}`}>{fmtPct(dayData.total.tiLeChot)}</td>}
                                {visibleColumns.tiLeChotTT && <td className={`text-center total-value ${getRateClass(dayData.total.tiLeChotTT)}`}>{fmtPct(dayData.total.tiLeChotTT)}</td>}
                                {visibleColumns.giaMess && <td className="total-value">{fmtCurrency(dayData.total.giaMess)}</td>}
                                {visibleColumns.cps && <td className="total-value">{fmtCurrency(dayData.total.cps)}</td>}
                                {visibleColumns.cp_ds && <td className="total-value">{fmtPct(dayData.total.cp_ds)}</td>}
                                {visibleColumns.giaTBDon && <td className="total-value">{fmtCurrency(dayData.total.giaTBDon)}</td>}
                              </tr>
                              {dayData.rows.map((row, rIdx) => (
                                <tr key={rIdx}>
                                  {visibleColumns.stt && <td className="text-center">{rIdx + 1}</td>}
                                  {visibleColumns.team && <td className="text-left">{row.team}</td>}
                                  {visibleColumns.marketing && <td className="text-left">{row.name}</td>}
                                  {visibleColumns.mess && <td>{fmtNum(row.mess)}</td>}
                                  {visibleColumns.cpqc && <td>{fmtCurrency(row.cpqc)}</td>}
                                  {visibleColumns.orders && <td>{fmtNum(row.orders)}</td>}
                                  <td style={{ backgroundColor: row.soDonTT > 0 ? '#e8f5e9' : 'transparent' }}>
                                    {fmtNum(row.soDonTT)}
                                  </td>
                                  {visibleColumns.dsChot && <td>{fmtCurrency(row.dsChot)}</td>}
                                  {visibleColumns.dsChotTT && <td>{fmtCurrency(row.dsChotTT)}</td>}
                                  {visibleColumns.tiLeChot && <td className={`text-center ${getRateClass(row.tiLeChot)}`}>{fmtPct(row.tiLeChot)}</td>}
                                  {visibleColumns.tiLeChotTT && <td className={`text-center ${getRateClass(row.tiLeChotTT)}`}>{fmtPct(row.tiLeChotTT)}</td>}
                                  {visibleColumns.giaMess && <td>{fmtCurrency(row.giaMess)}</td>}
                                  {visibleColumns.cps && <td className={getCpsCellStyle(row.cps)}>{fmtCurrency(row.cps)}</td>}
                                  {visibleColumns.cp_ds && <td className={`text-center ${row.cp_ds > 33 ? 'bg-yellow' : ''}`}>{fmtPct(row.cp_ds)}</td>}
                                  {visibleColumns.giaTBDon && <td>{fmtCurrency(row.giaTBDon)}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* TAB 2: KPI Report */}
      {
        activeTab === 'KpiReport' && (
          <div id="KpiReport" className={`tab-content ${activeTab === 'KpiReport' ? 'active' : ''}`}>
            <div className="report-container">
              <div className="sidebar">
                <h3>Bộ lọc</h3>
                <label>Từ ngày:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
                <label>Đến ngày:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
                <h3>Team</h3>
                <div className="indent">
                  <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
                    <option value="ALL">Tất cả</option>
                    {teams.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="main-content-area">
                <div className="header">
                  <div style={{ width: 60, height: 60, borderRadius: '50%', backgroundColor: '#2d7c2d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '24px', fontWeight: 'bold' }}>MKT</div>
                  <h2>BÁO CÁO HIỆU SUẤT KPI</h2>
                </div>
                <div className="table-responsive-container">
                  {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center' }}>Đang tải dữ liệu...</div>
                  ) : (
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th className="green-header">STT</th>
                          <th className="green-header">Team</th>
                          <th className="green-header">Marketing</th>
                          <th className="green-header">CPQC</th>
                          <th className="green-header">DS Chốt</th>
                          <th className="blue-header">DS Chốt (TT)</th>
                          <th className="blue-header">Số đơn hủy (TT)</th>
                          <th className="blue-header">Doanh số Hủy (TT)</th>
                          <th className="blue-header">DS Thành Công (TT)</th>
                          <th className="yellow-header">%CP/DS</th>
                          <th className="yellow-header">% KPI</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="total-row">
                          <td colSpan={3} className="text-center">TỔNG CỘNG</td>
                          <td>{fmtCurrency(processData.total.cpqc)}</td>
                          <td>{fmtCurrency(processData.total.dsChot)}</td>
                          <td>{fmtCurrency(processData.total.dsChotTT)}</td>
                          <td>{fmtNum(processData.total.soDonHuyTT)}</td>
                          <td>{fmtCurrency(processData.total.dsHuyTT)}</td>
                          <td>{fmtCurrency(processData.total.dsThanhCongTT)}</td>
                          <td>{fmtPct(processData.total.cp_ds_sau_ship)}</td>
                          <td>{fmtPct(processData.total.kpi_percent)}</td>
                        </tr>
                        {processData.rows.map((row, index) => (
                          <tr key={index}>
                            <td className="text-center">{index + 1}</td>
                            <td>{row.team}</td>
                            <td>{row.name}</td>
                            <td>{fmtCurrency(row.cpqc)}</td>
                            <td>{fmtCurrency(row.dsChot)}</td>
                            <td>{fmtCurrency(row.dsChotTT)}</td>
                            <td>{fmtNum(row.soDonHuyTT)}</td>
                            <td>{fmtCurrency(row.dsHuyTT)}</td>
                            <td>{fmtCurrency(row.dsThanhCongTT)}</td>
                            <td className="text-center">{fmtPct(row.cp_ds_sau_ship)}</td>
                            <td className="text-center">{fmtPct(row.kpi_percent)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* TAB 3: Hieu Suat KPI - Legacy Iframe */}
      {
        activeTab === 'HieuSuatKPI' && (
          <div style={{ width: '100%', height: 'calc(100vh - 100px)' }}>
            <iframe
              src="/embed/bao-cao-hieu-suat-kpi"
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Hiệu suất KPI"
            />
          </div>
        )
      }

      {/* TAB 4: Market Report */}
      {
        activeTab === 'MarketReport' && (
          <div id="MarketReport" className={`tab-content ${activeTab === 'MarketReport' ? 'active' : ''}`}>
            <div className="report-header">
              <div className="report-title">THỐNG KÊ HIỆU QUẢ MARKETING THEO SẢN PHẨM & THỊ TRƯỜNG</div>
            </div>
            <div className="filter-container">
              <div className="filter-group">
                <label>Từ ngày:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <label>Đến ngày:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <label>Team:</label>
                <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
                  <option value="ALL">Tất cả</option>
                  {teams.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label>Sản phẩm:</label>
                <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
                  <option value="ALL">Tất cả</option>
                  {products.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label>Thị trường:</label>
                <select value={selectedMarket} onChange={e => setSelectedMarket(e.target.value)}>
                  <option value="ALL">Tất cả</option>
                  {markets.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button
                onClick={fetchData}
                style={{
                  background: '#2d7c2d',
                  color: 'white',
                  border: 'none',
                  padding: '8px 15px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Áp dụng
              </button>
            </div>

            <div className="section-title">THỊ TRƯỜNG CHÂU Á</div>
            {renderMarketTable(processMarketData.asia, 'THỊ TRƯỜNG CHÂU Á')}
            {renderMarketTable(processMarketData.nonAsia, 'THỊ TRƯỜNG NGOÀI CHÂU Á')}
            {renderMarketTable(processMarketData.summary, 'TỔNG HỢP')}
          </div>
        )
      }

      {/* Column Settings Modal */}
      <ColumnSettingsModal
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        allColumns={[
          'stt', 'team', 'marketing', 'cpqc', 'mess', 'orders', 'soDonTT',
          'dsChot', 'dsChotTT', 'tiLeChot', 'tiLeChotTT', 'giaMess', 'cps',
          'cp_ds', 'giaTBDon', 'soDonHuy', 'dsHuy'
        ]}
        columnLabelMap={{
          stt: 'STT',
          team: 'Team',
          marketing: 'Marketing',
          cpqc: 'CPQC',
          mess: 'Số Mess',
          orders: 'Số Đơn',
          soDonTT: 'Số Đơn TT',
          dsChot: 'DS Chốt',
          dsChotTT: 'DS Chốt (TT)',
          tiLeChot: 'Tỉ lệ chốt',
          tiLeChotTT: 'Tỉ lệ chốt (TT)',
          giaMess: 'Giá Mess',
          cps: 'CPS',
          cp_ds: '%CP/DS',
          giaTBDon: 'Giá TB Đơn',
          soDonHuy: 'Số đơn Huỷ',
          dsHuy: 'DS Huỷ'
        }}
        visibleColumns={visibleColumns}
        onToggleColumn={(key) => {
          if (key === 'soDonTT' || key === 'orders') {
            return;
          }
          setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
        }}
        onSelectAll={() => {
          const all = {};
          ['stt', 'team', 'marketing', 'cpqc', 'mess', 'orders', 'soDonTT',
            'dsChot', 'dsChotTT', 'tiLeChot', 'tiLeChotTT', 'giaMess', 'cps',
            'cp_ds', 'giaTBDon', 'soDonHuy', 'dsHuy'].forEach(key => {
              all[key] = true;
            });
          all.soDonTT = true;
          all.orders = true;
          setVisibleColumns(all);
        }}
        onDeselectAll={() => {
          const none = {};
          ['stt', 'team', 'marketing', 'cpqc', 'mess', 'orders', 'soDonTT',
            'dsChot', 'dsChotTT', 'tiLeChot', 'tiLeChotTT', 'giaMess', 'cps',
            'cp_ds', 'giaTBDon', 'soDonHuy', 'dsHuy'].forEach(key => {
              none[key] = false;
            });
          none.soDonTT = true;
          none.orders = true;
          setVisibleColumns(none);
        }}
        onResetDefault={() => {
          const defaultCols = {
            stt: true, team: true, marketing: true, mess: true, cpqc: true, orders: true,
            soDonTT: true, dsChot: true, dsChotTT: true, tiLeChot: true, tiLeChotTT: true,
            giaMess: true, cps: true, cp_ds: true, giaTBDon: true,
            soDonHuy: false, dsHuy: false
          };
          defaultCols.soDonTT = true;
          defaultCols.orders = true;
          setVisibleColumns(defaultCols);
        }}
        defaultColumns={['stt', 'team', 'marketing', 'mess', 'cpqc', 'orders', 'soDonTT',
          'dsChot', 'dsChotTT', 'tiLeChot', 'tiLeChotTT', 'giaMess', 'cps',
          'cp_ds', 'giaTBDon']}
      />
    </div >
  );
}
