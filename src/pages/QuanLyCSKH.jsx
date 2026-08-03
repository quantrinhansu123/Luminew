import { Edit, Eye, RefreshCw, Search, Settings, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import ColumnSettingsModal from '../components/ColumnSettingsModal';
import usePermissions from '../hooks/usePermissions';
import { getSelectedPersonnel } from '../services/rbacService';
import { supabase } from '../supabase/config';
import { COLUMN_MAPPING, PRIMARY_KEY_COLUMN } from '../types';
import {
  mergeUniqueRowsById,
  orderRangeToCreatedAtIsoBounds,
  sortOrdersByDisplayDateDesc,
} from '../utils/dateParsing';
import { resolveTrackingFromOrder, resolveTrangThaiThuTienFromOrder } from '../utils/orderTracking';
import '../styles/selection.css';
import { getCheckResult } from '../utils/orderCheckAndVnd';

/** Hotfix: chỉ bật gửi feedback_* khi DB production đã sẵn sàng cho cả orders + order_code_hcm */
const FEEDBACK_COLUMNS_ENABLED = import.meta.env.VITE_ENABLE_FEEDBACK_COLUMNS === 'true';

const QUICK_FILTER_OPTIONS = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: 'this-week', label: 'Tuần này' },
  { value: 'last-week', label: 'Tuần trước' },
  { value: 'this-month', label: 'Tháng này' },
  { value: 'last-month', label: 'Tháng trước' },
  { value: 'this-year', label: 'Năm nay' },
];

/** Map một dòng orders (Supabase) → object hiển thị (tiếng Việt) */
function mapOrderRowToFriendlyCSKH(item) {
  const tracking = resolveTrackingFromOrder(item);
  return {
    id: item.id,
    "Mã đơn hàng": item.order_code,
    "Ngày lên đơn": item.order_date || item.created_at?.split('T')[0],
    "Name*": item.customer_name,
    "Phone*": item.customer_phone,
    "Add": item.customer_address,
    "City": item.city,
    "State": item.state,
    "Khu vực": item.country,
    "Zipcode": item.zipcode,
    "Mặt hàng": item.product,
    "Tên mặt hàng 1": item.product_name_1 || item.product,
    "Số lượng mặt hàng 1": item.quantity_1 ?? item.item_qty_1 ?? '',
    "Tên mặt hàng 2": item.product_name_2 ?? item.item_name_2 ?? '',
    "Số lượng mặt hàng 2": item.quantity_2 ?? item.item_qty_2 ?? '',
    "Tổng tiền VNĐ": item.total_amount_vnd,
    "Phí ship": item.shipping_cost ?? item.shipping_fee ?? 0,
    "Loại tiền": item.payment_type,
    "Hình thức thanh toán": item.payment_method_text || item.payment_method,
    "Mã Tracking": tracking,
    tracking_code: tracking,
    "Nhân viên Marketing": item.marketing_staff,
    "Nhân viên Sale": item.sale_staff,
    "Team": item.team,
    "Trạng thái giao hàng": item.delivery_status,
    /** Cột DB `check_result` — bộ lọc Kết quả Check chỉ dùng field này */
    check_result: String(item.check_result ?? '').trim(),
    "Kết quả Check": item.check_result,
    "Ghi chú": item.note,
    "Phản hồi tích cực": item.feedback_pos,
    "Phản hồi tiêu cực": item.feedback_neg,
    "CSKH": item.cskh,
    "NV Vận đơn": item.delivery_staff,
    "Tiền Việt đã đối soát": item.reconciled_vnd || item.reconciled_amount,
    "Đơn vị vận chuyển": item.shipping_unit || item.shipping_carrier,
    "Kế toán xác nhận thu tiền về": item.accountant_confirm,
    "Ngày đối soát bill": item.ngay_doi_soat_bill || '',
    "Ngày đối soát cước": item.ngay_doi_soat_cuoc || '',
    "Trạng thái thu tiền": resolveTrangThaiThuTienFromOrder(item),
    "Lý do": item.reason,
    "Page": item.page_name,
    feedback_pos: item.feedback_pos,
    feedback_neg: item.feedback_neg,
  };
}

const EMPTY_ORDER_QUERY_ID = '00000000-0000-0000-0000-000000000000';
const CSKH_ORDERS_PAGE_SIZE = 1000;
/** PostgREST `.or()` dễ Bad Request khi quá nhiều điều kiện — chia nhỏ theo lô tên. */
const CSKH_MAX_STAFF_VARIANTS_PER_OR = 8;

function quotePostgrestOrIlikePattern(pat) {
  return `"${String(pat ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function chunkStringArray(arr, size) {
  const out = [];
  for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildCSKHStaffOrFilter(variants) {
  const orParts = [];
  for (const n of variants) {
    const name = String(n ?? '').trim();
    if (!name) continue;
    const pattern = quotePostgrestOrIlikePattern(`%${name}%`);
    // Không lọc theo cột cskh — tránh trùng đơn / lệch tổng tiền khi cùng tên vừa Sale vừa CSKH
    orParts.push(
      `sale_staff.ilike.${pattern}`,
      `marketing_staff.ilike.${pattern}`,
      `delivery_staff.ilike.${pattern}`
    );
  }
  return orParts.length ? orParts.join(',') : null;
}

async function fetchAllPagesForCSKHQuery(makeQuery) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await makeQuery().range(from, from + CSKH_ORDERS_PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < CSKH_ORDERS_PAGE_SIZE) break;
    from += chunk.length;
  }
  return all;
}

async function fetchCSKHOrdersForDateMode({
  ordersTableName,
  startDate,
  endDate,
  createdStart,
  createdEnd,
  variants,
  bypassStaffFilter,
  dateMode,
}) {
  const makeBaseQuery = () => {
    let q = supabase.from(ordersTableName).select('*');
    if (dateMode === 'order_date') {
      q = q
        .gte('order_date', startDate)
        .lte('order_date', endDate)
        .order('order_date', { ascending: false });
    } else {
      q = q
        .is('order_date', null)
        .gte('created_at', createdStart)
        .lte('created_at', createdEnd)
        .order('created_at', { ascending: false });
    }
    return q;
  };

  if (bypassStaffFilter) {
    return fetchAllPagesForCSKHQuery(makeBaseQuery);
  }

  if (!variants.length) {
    const { data, error } = await makeBaseQuery().eq('id', EMPTY_ORDER_QUERY_ID);
    if (error) throw error;
    return data || [];
  }

  const variantChunks =
    variants.length <= CSKH_MAX_STAFF_VARIANTS_PER_OR
      ? [variants]
      : chunkStringArray(variants, CSKH_MAX_STAFF_VARIANTS_PER_OR);

  const byId = new Map();
  for (const variantChunk of variantChunks) {
    const orFilter = buildCSKHStaffOrFilter(variantChunk);
    if (!orFilter) continue;
    const rows = await fetchAllPagesForCSKHQuery(() => makeBaseQuery().or(orFilter));
    for (const row of rows) {
      if (row?.id != null) byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

function rowMatchesCSKHStaffScope(row, variants) {
  if (!variants?.length) return false;
  // Không khớp theo cột CSKH — phạm vi nhân sự chỉ Sale / MKT / Vận đơn
  const fields = [
    row?.sale_staff,
    row?.marketing_staff,
    row?.delivery_staff,
    row?.['Nhân viên Sale'],
    row?.['Nhân viên Marketing'],
  ];
  const haystack = fields
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (!haystack.length) return false;
  return variants.some((name) => {
    const needle = String(name ?? '').trim().toLowerCase();
    if (!needle) return false;
    return haystack.some((h) => h.includes(needle));
  });
}

/** Gộp trùng theo mã đơn (ưu tiên) / id — tránh tổng tiền bị nhân đôi. */
function dedupeFriendlyOrdersByMaDon(rows) {
  const map = new Map();
  const extras = [];
  for (const row of rows || []) {
    const code = String(row['Mã đơn hàng'] ?? row.order_code ?? '').trim();
    const key = code || (row?.id != null ? `id:${row.id}` : '');
    if (!key) {
      extras.push(row);
      continue;
    }
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values(), ...extras];
}

function sumTongTienVnd(rows) {
  let sum = 0;
  for (const row of rows || []) {
    const amount = parseFloat(String(row['Tổng tiền VNĐ'] || 0).replace(/[^\d.-]/g, '')) || 0;
    sum += amount;
  }
  return sum;
}

/**
 * Gộp mọi biến thể tên để khớp cột sale_staff / marketing_staff / delivery_staff.
 * localStorage "username" có thể là username ngắn hoặc tên cũ; bảng users (theo email) có name đầy đủ.
 */
async function resolveNameVariantsForOrderFilter(userEmail) {
  const variants = new Set();
  const ls = localStorage.getItem('username');
  if (ls && ls.trim()) variants.add(ls.trim());
  const em = (userEmail || '').trim().toLowerCase();
  if (em) {
    const { data, error } = await supabase
      .from('users')
      .select('name, username')
      .eq('email', em)
      .maybeSingle();
    if (!error && data) {
      if (data.name?.trim()) variants.add(data.name.trim());
      if (data.username?.trim()) variants.add(data.username.trim());
    }
  }
  return [...variants];
}

/**
 * Trang quan-ly-cskh-hcm: chỉ nhân sự Bộ phận CSKH + Chi nhánh HCM mới load full danh sách.
 * (Admin hệ thống / finance / super_admin vẫn full — xử lý ở chỗ gọi qua bypassStaffFilter.)
 */
function userHasCskhHcmFullListProfile(user) {
  if (!user) return false;
  const dept = String(user?.['Bộ_phận'] || user?.['Bộ phận'] || user?.department || '').trim().toLowerCase();
  const branch = String(
    user?.['chi_nhánh'] || user?.['chi nhánh'] || user?.branch || user?.Chi_nhánh || ''
  ).trim().toLowerCase();
  const isCskh = dept === 'cskh' || dept.includes('cskh');
  const isHcmBranch =
    branch.includes('hcm') ||
    branch.includes('hồ chí minh') ||
    branch.includes('ho chi minh') ||
    branch.includes('tp.hcm') ||
    branch.includes('tp hcm');
  return isCskh && isHcmBranch;
}

/** Khớp `rbacService`: chỉ dùng để biết user có cấu hình `selected_personnel` trong DB hay không. */
function parseSelectedPersonnelRawLocal(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((e) => String(e).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
  }
  return [];
}


/** Cùng logic lọc/sắp với bảng (sau khi đã có đủ dòng từ server). */
function applyCSKHClientFilters(data, ctx) {
  const {
    debouncedSearchText,
    debouncedSearchOrderCode,
    filterMarket,
    filterProduct,
    filterStatus,
    filterPaymentThuTien,
    filterCheckResult,
    filterSale,
    filterMKT,
    sortColumn,
    sortDirection,
  } = ctx;

  let rows = [...data];

  if (debouncedSearchOrderCode) {
    const orderCodeLower = debouncedSearchOrderCode.trim().toLowerCase();
    rows = rows.filter((row) => {
      const orderCode = String(row["Mã đơn hàng"] || '').toLowerCase();
      return orderCode.includes(orderCodeLower);
    });
  }

  if (!debouncedSearchOrderCode && debouncedSearchText) {
    const searchLower = debouncedSearchText.toLowerCase();
    rows = rows.filter((row) => (
      String(row["Mã đơn hàng"] || '').toLowerCase().includes(searchLower) ||
      String(row["Name*"] || '').toLowerCase().includes(searchLower) ||
      String(row["Phone*"] || '').toLowerCase().includes(searchLower) ||
      String(row["Mã Tracking"] || '').toLowerCase().includes(searchLower)
    ));
  }

  if (filterMarket.length > 0) {
    rows = rows.filter((row) => {
      const market = row["Khu vực"] || row["khu vực"];
      return filterMarket.includes(String(market).trim());
    });
  }

  if (filterProduct.length > 0) {
    rows = rows.filter((row) => {
      const product = row["Mặt hàng"];
      return filterProduct.includes(String(product).trim());
    });
  }

  if (filterStatus.length > 0) {
    rows = rows.filter((row) => {
      const status = row["Trạng thái giao hàng"];
      return filterStatus.includes(String(status).trim());
    });
  }

  if (filterPaymentThuTien.length > 0) {
    rows = rows.filter((row) => {
      const raw = row["Trạng thái thu tiền"] ?? row.payment_status_detail ?? row.payment_status;
      const s = raw ? String(raw).trim() : '';
      if (filterPaymentThuTien.includes('(Trống)')) {
        if (!s) return true;
      }
      return filterPaymentThuTien.includes(s);
    });
  }

  if (filterCheckResult.length > 0) {
    rows = rows.filter((row) => {
      const checkStr = getCheckResult(row);
      if (filterCheckResult.includes('(Trống)')) {
        if (!checkStr) return true;
      }
      return filterCheckResult.includes(checkStr);
    });
  }

  if (filterSale.length > 0) {
    rows = rows.filter((row) => {
      const sale = row["Nhân viên Sale"];
      const saleStr = sale ? String(sale).trim() : '';
      if (filterSale.includes('(Trống)')) {
        if (!saleStr) return true;
      }
      return filterSale.includes(saleStr);
    });
  }

  if (filterMKT.length > 0) {
    rows = rows.filter((row) => {
      const mkt = row["Nhân viên Marketing"];
      const mktStr = mkt ? String(mkt).trim() : '';
      if (filterMKT.includes('(Trống)')) {
        if (!mktStr) return true;
      }
      return filterMKT.includes(mktStr);
    });
  }

  if (sortColumn) {
    rows.sort((a, b) => {
      const aVal = a[sortColumn] || '';
      const bVal = b[sortColumn] || '';
      const comparison = String(aVal).localeCompare(String(bVal), 'vi', { numeric: true });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  return rows;
}

/** Chuẩn hóa tên NV để khớp sale_staff ↔ users.name. */
function normalizeSalePersonName(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Tên NV Sale có team đúng `teamExact` trên bảng users (name + username).
 * @returns {Promise<Set<string>>} tập tên đã normalize
 */
async function fetchSaleStaffNameKeysByTeamExact(teamExact) {
  const team = String(teamExact || '').trim();
  if (!team) return new Set();
  const keys = new Set();
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('users')
      .select('name, username, team')
      .eq('team', team)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = data || [];
    for (const u of chunk) {
      const n = normalizeSalePersonName(u.name);
      const un = normalizeSalePersonName(u.username);
      if (n) keys.add(n);
      if (un) keys.add(un);
    }
    if (chunk.length < PAGE) break;
    from += chunk.length;
  }
  return keys;
}

/** Đơn có Nhân viên Sale khớp một trong các tên team đã cho. */
function orderSaleStaffMatchesTeamNames(row, nameKeys) {
  if (!nameKeys || nameKeys.size === 0) return false;
  const sale = normalizeSalePersonName(row?.sale_staff ?? row?.['Nhân viên Sale']);
  if (!sale) return false;
  if (nameKeys.has(sale)) return true;
  for (const key of nameKeys) {
    if (!key || key.length < 2) continue;
    if (sale.includes(key) || key.includes(sale)) return true;
  }
  return false;
}

function QuanLyCSKH({
  ordersTableName = 'orders',
  pageTitle = 'QUẢN LÝ CSKH',
  pageSubtitle = 'Dữ liệu từ F3',
  accessPermissionCodes = ['CSKH_LIST'],
  /** Nếu có: chỉ giữ đơn có Nhân viên Sale thuộc users.team đúng nhãn này (vd. CSKH-HCM). */
  saleStaffTeamExact = null,
} = {}) {
  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const navigate = useNavigate();
  const { canView, canEdit, role } = usePermissions();
  const isHcmOrders = ordersTableName === 'order_code_hcm';
  const saleTeamExact = String(saleStaffTeamExact || '').trim();
  const restrictBySaleTeam = Boolean(saleTeamExact);

  const canAccessPage = useMemo(
    () => accessPermissionCodes.some((code) => canView(code)),
    [accessPermissionCodes, canView]
  );

  const canEditFromThisList = useMemo(() => {
    if (accessPermissionCodes.some((code) => canEdit(code))) return true;
    if (isHcmOrders) return canEdit('SALE_ORDERS_HCM');
    return canEdit('SALE_ORDERS');
  }, [accessPermissionCodes, canEdit, isHcmOrders]);

  const [allData, setAllData] = useState([]);

  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [searchOrderCode, setSearchOrderCode] = useState(''); // Tìm kiếm riêng theo mã đơn hàng
  const [debouncedSearchOrderCode, setDebouncedSearchOrderCode] = useState('');
  const [filterMarket, setFilterMarket] = useState([]);
  const [filterProduct, setFilterProduct] = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);
  const [filterPaymentThuTien, setFilterPaymentThuTien] = useState([]);
  const [filterCheckResult, setFilterCheckResult] = useState([]);
  const [filterSale, setFilterSale] = useState([]); // Filter by NV Sale (multi-select checkbox)
  const [filterMKT, setFilterMKT] = useState([]); // Filter by MKT (multi-select checkbox)
  /** `null` = quản lý/full: tùy chọn lọc Sale/MKT lấy từ dữ liệu; mảng = chỉ danh sách nhân sự user (getSelectedPersonnel + fallback). */
  const [personnelScopeForFilters, setPersonnelScopeForFilters] = useState(null);
  const [showMarketFilter, setShowMarketFilter] = useState(false);
  const [showProductFilter, setShowProductFilter] = useState(false);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showPaymentThuTienFilter, setShowPaymentThuTienFilter] = useState(false);
  const [showCheckResultFilter, setShowCheckResultFilter] = useState(false);
  const [showQuickFilter, setShowQuickFilter] = useState(false);
  const [showSaleFilter, setShowSaleFilter] = useState(false);
  const [showMKTFilter, setShowMKTFilter] = useState(false);

  const closeAllFilterDropdowns = () => {
    setShowMarketFilter(false);
    setShowProductFilter(false);
    setShowStatusFilter(false);
    setShowPaymentThuTienFilter(false);
    setShowCheckResultFilter(false);
    setShowQuickFilter(false);
    setShowSaleFilter(false);
    setShowMKTFilter(false);
  };

  // Date state - default to last 3 days
  // Helper function để format date theo LOCAL time (tránh lỗi timezone trên Vercel)
  const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return formatLocalDate(d);
  });
  const [endDate, setEndDate] = useState(() => formatLocalDate(new Date()));

  const [quickFilter, setQuickFilter] = useState('today');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(1000);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState(null);

  // --- Edit Modal State (must be before early return) ---
  const [editingOrder, setEditingOrder] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // List of columns that should be hidden/removed (no longer needed)
  const REMOVED_COLUMNS = [
    'Tiền Hàng',
    'Phí Chung',
    'Phí bay',
    'Thuê TK',
    'Phí xử lý đơn đóng hàng-Lưu kho(usd)',
    'Thời gian cutoff',
    '_id',
    '_source'
  ];

  const defaultColumns = [
    'Mã đơn hàng',
    'Ngày lên đơn',
    'Name*',
    'Phone*',
    'Khu vực',
    'Mặt hàng',
    'Số lượng mặt hàng 1',
    'Mã Tracking',
    'Kết quả Check',
    'CSKH',
    'Trạng thái giao hàng',
    'Trạng thái thu tiền',
    'Ngày đối soát bill',
    'Ngày đối soát cước',
    'Phí ship',
    'Tổng tiền VNĐ',
  ];

  // Mapping từ tên cột DB sang tên hiển thị thân thiện
  const COLUMN_DISPLAY_NAMES = {
    // Các cột đã được map
    'order_code': 'Mã đơn hàng',
    'order_date': 'Ngày lên đơn',
    'customer_name': 'Tên khách hàng',
    'customer_phone': 'Số điện thoại',
    'customer_address': 'Địa chỉ',
    'city': 'Thành phố',
    'state': 'Bang/Tỉnh',
    'country': 'Khu vực',
    'zipcode': 'Mã bưu điện',
    'product': 'Mặt hàng',
    'product_main': 'Mặt hàng chính',
    'product_name_1': 'Tên mặt hàng 1',
    'quantity_1': 'Số lượng mặt hàng 1',
    'product_name_2': 'Tên mặt hàng 2',
    'quantity_2': 'Số lượng mặt hàng 2',
    'payment_type': 'Loại tiền',
    'payment_method': 'Hình thức thanh toán',
    'payment_method_text': 'Hình thức thanh toán',
    'tracking_code': 'Mã Tracking',
    'delivery_status': 'Trạng thái giao hàng',
    'total_amount_vnd': 'Tổng tiền VNĐ',
    'cskh': 'CSKH',
    'team': 'Team',
    'sale_staff': 'Nhân viên Sale',
    'marketing_staff': 'Nhân viên Marketing',
    'delivery_staff': 'Nhân viên Vận đơn',
    'note': 'Ghi chú',
    'reason': 'Lý do',
    'payment_status': 'Trạng thái thu tiền',
    'payment_status_detail': 'Trạng thái thu tiền (chi tiết)',
    'check_result': 'Kết quả Check',
    'vandon_note': 'Ghi chú vận đơn',
    'shipping_fee': 'Phí ship',
    'warehouse_fee': 'Phí xử lý đơn đóng hàng-Lưu kho(usd)',
    'shipping_unit': 'Đơn vị vận chuyển',
    'shipping_carrier': 'Đơn vị vận chuyển',
    'goods_amount': 'Giá bán',
    'sale_price': 'Giá bán',
    'general_fee': 'Phí chung',
    'flight_fee': 'Phí bay',
    'account_rental_fee': 'Thuê TK',
    'luu_kho_usd': 'Ngày đối soát kế toán',
    'thoigiangiaohangffm': 'Thời gian giao dự kiến',
    'cutoff_time': 'Thời gian cutoff',
    'reconciled_vnd': 'Tiền Việt đã đối soát',
    'reconciled_amount': 'Tiền Việt đã đối soát',
    'accountant_confirm': 'Kế toán xác nhận thu tiền về',
    'ngay_doi_soat_bill': 'Ngày đối soát bill',
    'ngay_doi_soat_cuoc': 'Ngày đối soát cước',
    'page_name': 'Page',
    'shift': 'Ca',
    'created_at': 'Ngày tạo',
    'updated_at': 'Ngày cập nhật',
    'id': 'ID',
  };

  // Hàm chuyển đổi tên cột DB sang tên hiển thị thân thiện
  const getDisplayColumnName = (columnName) => {
    // Nếu đã có trong mapping, trả về tên thân thiện
    if (COLUMN_DISPLAY_NAMES[columnName]) {
      return COLUMN_DISPLAY_NAMES[columnName];
    }

    // Nếu là tên thân thiện đã được map (không có trong COLUMN_DISPLAY_NAMES), giữ nguyên
    // Kiểm tra xem có phải là tên DB (snake_case hoặc camelCase) không
    if (columnName.includes('_') || (columnName.match(/[a-z][A-Z]/))) {
      // Chuyển snake_case hoặc camelCase sang Title Case
      return columnName
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }

    // Nếu không phải tên DB, giữ nguyên (đã là tên thân thiện)
    return columnName;
  };

  // Helper function để kiểm tra Admin hoặc Finance
  const isAdmin = () => {
    const roleLower = (role || '').toLowerCase();
    return roleLower === 'admin' || roleLower === 'super_admin' || roleLower === 'finance';
  };

  // Debounce search text for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Debounce search order code
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchOrderCode(searchOrderCode);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchOrderCode]);

  // Helper function để kiểm tra xem tên cột có phải là tiếng Anh không (cột DB gốc)
  const isEnglishColumn = (columnName) => {
    // Giữ lại các cột đặc biệt đã được sử dụng trong hệ thống
    const specialColumns = [
      'Name*',
      'Phone*',
      'Add',
      'City',
      'State',
      'Zipcode',
      'Team',
      'CSKH',
      'Mã đơn hàng',
      'Mã Tracking',
      'Kết quả Check',
      'Trạng thái thu tiền',
      'Trạng thái giao hàng',
    ];
    if (specialColumns.includes(columnName)) return false;

    // Kiểm tra snake_case (có dấu gạch dưới) - đây là tên cột DB
    if (columnName.includes('_')) return true;
    // Kiểm tra camelCase (có chữ thường tiếp theo chữ hoa) - đây là tên cột DB
    if (columnName.match(/[a-z][A-Z]/)) return true;
    // Kiểm tra toàn bộ là chữ cái tiếng Anh và số, không có ký tự đặc biệt (trừ *)
    // và không có dấu tiếng Việt - đây là tên cột DB
    if (columnName.match(/^[a-zA-Z0-9]+$/) && !columnName.match(/[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđĐ]/)) {
      return true;
    }
    return false;
  };

  // Get all available columns from data - chỉ lấy cột tiếng Việt
  const allAvailableColumns = useMemo(() => {
    // Get all potential keys from data - chỉ lấy cột tiếng Việt
    const allKeys = new Set();

    // Luôn thêm các cột mặc định vào danh sách (để đảm bảo chúng luôn có trong cài đặt)
    defaultColumns.forEach(col => allKeys.add(col));

    if (allData.length > 0) {
      allData.forEach(row => {
        Object.keys(row).forEach(key => {
          // Exclude PRIMARY_KEY_COLUMN, English columns, removed columns, and technical columns
          if (key !== PRIMARY_KEY_COLUMN &&
            !isEnglishColumn(key) &&
            !REMOVED_COLUMNS.includes(key) &&
            !key.startsWith('_')) {
            allKeys.add(key);
          }
        });
      });
    }

    // Strategy:
    // 1. Start Defaults: Defaults excluding pinned ones
    // 2. Other/Dynamic Cols: Alphabetic sort
    // 3. End Cols: Pinned ones (Status, Total)

    const pinnedEndColumns = ['Phí ship', 'Trạng thái giao hàng', 'Tổng tiền VNĐ'];

    const startDefaults = defaultColumns
      .filter(col => !pinnedEndColumns.includes(col) && allKeys.has(col));

    const otherCols = Array.from(allKeys)
      .filter(key => !defaultColumns.includes(key))
      .sort();

    const endCols = pinnedEndColumns.filter(col => allKeys.has(col));

    return [...startDefaults, ...otherCols, ...endCols];
  }, [allData]);

  // Default columns


  // Load column visibility from localStorage or use defaults
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('quanLyCSKH_visibleColumns');
    let initial = {};

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Remove any columns that are no longer available
        Object.keys(parsed).forEach(col => {
          // Only keep columns that are not in REMOVED_COLUMNS
          if (!REMOVED_COLUMNS.includes(col)) {
            initial[col] = parsed[col];
          }
        });
      } catch (e) {
        console.error('Error parsing saved columns:', e);
      }
    }

    // Initialize with default columns if empty
    if (Object.keys(initial).length === 0) {
      defaultColumns.forEach(col => {
        initial[col] = true;
      });
    } else {
      // Ensure default columns are present
      defaultColumns.forEach(col => {
        if (initial[col] === undefined) {
          initial[col] = true;
        }
      });
    }

    return initial;
  });

  // Update displayColumns based on visibleColumns
  const displayColumns = useMemo(() => {
    return allAvailableColumns.filter(col => visibleColumns[col] === true);
  }, [allAvailableColumns, visibleColumns]);

  // Clean up removed columns from visibleColumns on mount
  useEffect(() => {
    setVisibleColumns(prev => {
      let updated = { ...prev };
      let changed = false;

      // Remove any removed columns
      REMOVED_COLUMNS.forEach(col => {
        if (updated[col] !== undefined) {
          delete updated[col];
          changed = true;
        }
      });

      // Ensure default columns are present
      defaultColumns.forEach(col => {
        if (updated[col] === undefined) {
          updated[col] = true;
          changed = true;
        }
      });

      // Cột vận hành: luôn hiện (localStorage cũ có thể đã tắt nhầm)
      const alwaysShowCols = ['Mã đơn hàng', 'Mã Tracking', 'Kết quả Check', 'Phí ship'];
      alwaysShowCols.forEach((col) => {
        if (updated[col] !== true) {
          updated[col] = true;
          changed = true;
        }
      });

      return changed ? updated : prev;
    });
  }, []); // Only run once on mount

  // Save to localStorage when visibleColumns changes (excluding removed columns)
  useEffect(() => {
    if (Object.keys(visibleColumns).length > 0) {
      // Clean up: remove any columns that are no longer available
      const cleaned = {};
      Object.keys(visibleColumns).forEach(col => {
        if (!REMOVED_COLUMNS.includes(col)) {
          cleaned[col] = visibleColumns[col];
        }
      });
      localStorage.setItem('quanLyCSKH_visibleColumns', JSON.stringify(cleaned));
    }
  }, [visibleColumns]);

  // Load data from Supabase with date filter
  const loadData = useCallback(async () => {
    if (!startDate || !endDate) return;

    setLoading(true);
    try {
      console.log('Loading orders from Supabase (Date Range)...');

      const userJson = localStorage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;
      const userEmail = localStorage.getItem("userEmail") || (user?.Email || user?.email || "").toString().toLowerCase().trim();
      const boPhan = (user?.['Bộ_phận'] || user?.['Bộ phận'] || "").toString().trim().toLowerCase();
      const viTri = (user?.['Vị_trí'] || user?.['Vị trí'] || "").toString().trim().toLowerCase();

      const ADMIN_MAIL = "admin@marketing.com";
      const isAdmin = userEmail === ADMIN_MAIL || boPhan === 'admin';
      const isLeader = viTri.includes('leader') || viTri.includes('quản lý') || boPhan.includes('manager');
      const roleLower = (role || '').toLowerCase();
      const isManager = isAdmin || isLeader || roleLower === 'admin' || roleLower === 'super_admin' || roleLower === 'finance';

      const hcmCskhFullList = isHcmOrders && userHasCskhHcmFullListProfile(user);
      const hcmSystemFullAccess =
        userEmail === ADMIN_MAIL ||
        boPhan === 'admin' ||
        roleLower === 'admin' ||
        roleLower === 'super_admin' ||
        roleLower === 'finance';

      let bypassStaffFilter;
      let variants = [];

      if (isHcmOrders) {
        if (hcmSystemFullAccess) {
          bypassStaffFilter = true;
          console.log('✅ [CSKH HCM] Quyền quản trị: full danh sách (bỏ lọc nhân sự).');
        } else {
          const personnelMap = await getSelectedPersonnel([userEmail]);
          const personnelNames = personnelMap[userEmail] || [];

          const { data: uSpRow } = await supabase
            .from('users')
            .select('selected_personnel')
            .eq('email', userEmail)
            .maybeSingle();
          const rawSelected = parseSelectedPersonnelRawLocal(uSpRow?.selected_personnel);
          const allowFullCskhHcmWithoutConfiguredPersonnel =
            hcmCskhFullList && rawSelected.length === 0;

          if (allowFullCskhHcmWithoutConfiguredPersonnel) {
            bypassStaffFilter = true;
            console.log(
              '✅ [CSKH HCM] CSKH + Chi nhánh HCM, chưa cấu hình selected_personnel: full danh sách trong khoảng ngày.'
            );
          } else {
            bypassStaffFilter = false;
            variants = personnelNames;
            if (!variants.length) {
              console.warn(
                '⚠️ [CSKH HCM] selected_personnel / phạm vi nhân sự trống — không có tên để lọc (sale/mkt/vận đơn/CSKH).'
              );
            } else {
              console.log(
                '🔐 [CSKH HCM] Lọc đơn theo phạm vi nhân sự (selected_personnel + leader_teams + tên tài khoản):',
                variants.length,
                'tên'
              );
            }
          }
        }
      } else {
        bypassStaffFilter = isManager;
        if (!bypassStaffFilter) {
          const personnelMap = await getSelectedPersonnel([userEmail]);
          let personnelNames = personnelMap[userEmail] || [];
          if (!personnelNames.length) {
            personnelNames = await resolveNameVariantsForOrderFilter(userEmail);
          }
          variants = personnelNames;
          if (!variants.length) {
            console.warn(
              '⚠️ [CSKH] Không có danh sách nhân sự (selected_personnel / leader_teams) và không có tên tài khoản để lọc. Trả về rỗng.'
            );
          } else {
            console.log('🔍 [CSKH] Lọc đơn theo phạm vi nhân sự user (giống cấu hình Admin):', variants.length, 'tên');
          }
        } else {
          console.log('✅ [CSKH] Admin/Manager: viewing all orders (filters applied client-side)');
        }
      }

      const { start: createdStart, end: createdEnd } = orderRangeToCreatedAtIsoBounds(startDate, endDate);

      let d1 = [];
      let d2 = [];
      try {
        d1 = await fetchCSKHOrdersForDateMode({
          ordersTableName,
          startDate,
          endDate,
          variants,
          bypassStaffFilter,
          dateMode: 'order_date',
        });

        if (createdStart && createdEnd) {
          d2 = await fetchCSKHOrdersForDateMode({
            ordersTableName,
            startDate,
            endDate,
            createdStart,
            createdEnd,
            variants,
            bypassStaffFilter,
            dateMode: 'created_at_fallback',
          });
        }
      } catch (fetchErr) {
        const fetchMsg = String(fetchErr?.message || fetchErr || '');
        const isBadRequest =
          fetchMsg.toLowerCase().includes('bad request') ||
          fetchErr?.code === '400' ||
          fetchErr?.status === 400;
        if (!isBadRequest || bypassStaffFilter) throw fetchErr;

        console.warn(
          '[CSKH] Lỗi filter nhân sự trên server (Bad Request) — tải theo ngày rồi lọc client-side:',
          fetchMsg
        );
        d1 = await fetchCSKHOrdersForDateMode({
          ordersTableName,
          startDate,
          endDate,
          variants: [],
          bypassStaffFilter: true,
          dateMode: 'order_date',
        });
        if (createdStart && createdEnd) {
          d2 = await fetchCSKHOrdersForDateMode({
            ordersTableName,
            startDate,
            endDate,
            createdStart,
            createdEnd,
            variants: [],
            bypassStaffFilter: true,
            dateMode: 'created_at_fallback',
          });
        }
        const mergedRaw = sortOrdersByDisplayDateDesc(mergeUniqueRowsById(d1, d2));
        d1 = mergedRaw.filter((row) => rowMatchesCSKHStaffScope(row, variants));
        d2 = [];
      }

      const merged = sortOrdersByDisplayDateDesc(mergeUniqueRowsById(d1, d2));
      let rowsForMap = merged;

      if (restrictBySaleTeam) {
        const saleNameKeys = await fetchSaleStaffNameKeysByTeamExact(saleTeamExact);
        if (saleNameKeys.size === 0) {
          console.warn(
            `[CSKH] Không có user nào team="${saleTeamExact}" — danh sách đơn trống.`
          );
          rowsForMap = [];
        } else {
          const before = rowsForMap.length;
          rowsForMap = rowsForMap.filter((row) =>
            orderSaleStaffMatchesTeamNames(row, saleNameKeys)
          );
          console.log(
            `🔐 [CSKH] Chỉ đơn sale_staff ∈ users.team="${saleTeamExact}": ${rowsForMap.length}/${before} (có ${saleNameKeys.size} tên NV)`
          );
        }
      }

      const mappedData = dedupeFriendlyOrdersByMaDon(
        rowsForMap.map((item) => mapOrderRowToFriendlyCSKH(item))
      );

      const scopeForUi = bypassStaffFilter
        ? null
        : [...new Set(variants.map((v) => String(v).trim()).filter(Boolean))];
      setPersonnelScopeForFilters(scopeForUi);

      setAllData(mappedData);
      console.log(
        `✅ [CSKH] Loaded ${mappedData.length} orders (order_date: ${(d1 || []).length}, fallback created_at: ${d2.length})`
      );

    } catch (error) {
      console.error('❌ [CSKH] Load data error:', {
        error,
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        startDate,
        endDate,
      });

      // User-friendly error message
      const errorMessage = error?.message || 'Lỗi không xác định';
      const isRLSError = errorMessage.includes('row-level security') || errorMessage.includes('RLS');
      const isPermissionError = errorMessage.includes('permission') || errorMessage.includes('quyền');

      if (isRLSError || isPermissionError) {
        alert(`❌ Lỗi phân quyền:\n\n${errorMessage}\n\nVui lòng kiểm tra quyền truy cập của bạn hoặc liên hệ Admin.`);
      } else {
        alert(`❌ Lỗi tải dữ liệu CSKH:\n\n${errorMessage}\n\nVui lòng thử lại hoặc liên hệ IT nếu lỗi tiếp tục xảy ra.`);
      }

      setPersonnelScopeForFilters(null);
      setAllData([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, role, ordersTableName, restrictBySaleTeam, saleTeamExact]);

  useEffect(() => {
    loadData();
  }, [loadData]);



  // Get unique values for filters
  const uniqueMarkets = useMemo(() => {
    const markets = new Set();
    allData.forEach(row => {
      const market = row["Khu vực"] || row["khu vực"];
      if (market) markets.add(String(market).trim());
    });
    return Array.from(markets).sort();
  }, [allData]);

  const uniqueProducts = useMemo(() => {
    const products = new Set();
    allData.forEach(row => {
      const product = row["Mặt hàng"];
      if (product) products.add(String(product).trim());
    });
    return Array.from(products).sort();
  }, [allData]);

  const uniqueStatuses = useMemo(() => {
    const statuses = new Set();
    allData.forEach(row => {
      const status = row["Trạng thái giao hàng"];
      if (status) statuses.add(String(status).trim());
    });
    return Array.from(statuses).sort();
  }, [allData]);

  const uniquePaymentThuTien = useMemo(() => {
    const set = new Set();
    let hasEmpty = false;
    allData.forEach((row) => {
      const raw = row['Trạng thái thu tiền'] ?? row.payment_status_detail ?? row.payment_status;
      const s = raw ? String(raw).trim() : '';
      if (s) set.add(s);
      else hasEmpty = true;
    });
    const sorted = Array.from(set).sort();
    if (hasEmpty) return ['(Trống)', ...sorted];
    return sorted;
  }, [allData]);

  const uniqueCheckResults = useMemo(() => {
    const set = new Set();
    let hasEmpty = false;
    allData.forEach((row) => {
      const s = getCheckResult(row);
      if (s) set.add(s);
      else hasEmpty = true;
    });
    const sorted = Array.from(set).sort();
    if (hasEmpty) return ['(Trống)', ...sorted];
    return sorted;
  }, [allData]);

  // NV Sale / MKT: quản lý → mọi giá trị có trong dữ liệu; nhân viên → chỉ danh sách nhân sự trong user (selected_personnel…)
  const uniqueSale = useMemo(() => {
    let hasEmpty = false;
    allData.forEach((row) => {
      const sale = row['Nhân viên Sale'];
      if (sale && String(sale).trim()) {
        /* noop */
      } else {
        hasEmpty = true;
      }
    });
    const trang = hasEmpty ? ['(Trống)'] : [];
    if (personnelScopeForFilters === null) {
      const sales = new Set();
      allData.forEach((row) => {
        const sale = row['Nhân viên Sale'];
        if (sale && String(sale).trim()) sales.add(String(sale).trim());
      });
      return [...trang, ...Array.from(sales).sort()];
    }
    const sorted = [...new Set(personnelScopeForFilters.map((s) => String(s).trim()).filter(Boolean))].sort();
    return [...trang, ...sorted];
  }, [allData, personnelScopeForFilters]);

  const uniqueMKT = useMemo(() => {
    let hasEmpty = false;
    allData.forEach((row) => {
      const mkt = row['Nhân viên Marketing'];
      if (mkt && String(mkt).trim()) {
        /* noop */
      } else {
        hasEmpty = true;
      }
    });
    const trang = hasEmpty ? ['(Trống)'] : [];
    if (personnelScopeForFilters === null) {
      const mkts = new Set();
      allData.forEach((row) => {
        const mkt = row['Nhân viên Marketing'];
        if (mkt && String(mkt).trim()) mkts.add(String(mkt).trim());
      });
      return [...trang, ...Array.from(mkts).sort()];
    }
    const sorted = [...new Set(personnelScopeForFilters.map((s) => String(s).trim()).filter(Boolean))].sort();
    return [...trang, ...sorted];
  }, [allData, personnelScopeForFilters]);

  // Handle quick filter
  const handleQuickFilter = (value) => {
    setQuickFilter(value);
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
      case 'this-week': {
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
        start = new Date(today.getFullYear(), today.getMonth(), diff);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      }
      case 'last-week': {
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek - 6 + (dayOfWeek === 0 ? -6 : 1); // Last Monday
        start = new Date(today.getFullYear(), today.getMonth(), diff);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      }
      case 'this-month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'last-month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'this-year':
        start = new Date(today.getFullYear(), 0, 1);
        end = new Date(today.getFullYear(), 11, 31);
        break;
      default:
        return;
    }

    setStartDate(formatLocalDate(start));
    setEndDate(formatLocalDate(end));
  };

  // Filter and sort data
  const filteredData = useMemo(() => {
    return applyCSKHClientFilters(allData, {
      debouncedSearchText,
      debouncedSearchOrderCode,
      filterMarket,
      filterProduct,
      filterStatus,
      filterPaymentThuTien,
      filterCheckResult,
      filterSale,
      filterMKT,
      sortColumn,
      sortDirection,
    });
  }, [allData, debouncedSearchText, debouncedSearchOrderCode, filterMarket, filterProduct, filterStatus, filterPaymentThuTien, filterCheckResult, filterSale, filterMKT, sortColumn, sortDirection]);

  const filteredTongTien = useMemo(() => sumTongTienVnd(filteredData), [filteredData]);

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString;
    }
  };

  /** Giá trị ô như trên lưới — dùng cho Ctrl+C / sao chép dòng. */
  const getCellDisplayValueForRow = useCallback((row, col) => {
    let value = row[col];

    if (col === 'CSKH') {
      value = row['CSKH'];
      value = value != null && value !== '' ? String(value).trim() : '';
    } else if (col === 'Mã Tracking') {
      value = row['Mã Tracking'] ?? row.tracking_code;
    } else if (col === 'Kết quả Check') {
      value = row['Kết quả Check'] ?? row.check_result;
    } else if (col === 'Trạng thái thu tiền') {
      value = row['Trạng thái thu tiền'] ?? row.payment_status_detail ?? row.payment_status;
    } else if (value === undefined || value === null) {
      const key = COLUMN_MAPPING[col];
      if (key) value = row[key];
    }

    value = value ?? '';

    if (col.includes('Ngày') || col.includes('Time') || col === 'order_date') {
      value = formatDate(value);
    }

    if (['Tổng tiền VNĐ', 'Tiền Hàng', 'Phí ship', 'Phí Chung'].includes(col)) {
      const num = parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
      value = num.toLocaleString('vi-VN') + ' ₫';
    }

    return String(value).replace(/\t/g, ' ').trim();
  }, []);

  // Bôi đen vùng chọn → Ctrl+C; hoặc click dòng (highlight) rồi Ctrl+C copy cả dòng
  useEffect(() => {
    const gridRoot = () => document.querySelector('[data-cskh-grid-root]');

    const handleCopy = (e) => {
      const active = document.activeElement;
      const isInInput =
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
      if (isInInput && active && !active.closest('[data-cskh-grid-root]')) return;

      const root = gridRoot();
      const sel = window.getSelection();
      const selectedText = sel?.toString().trim() ?? '';
      if (
        selectedText &&
        root &&
        sel?.anchorNode &&
        root.contains(sel.anchorNode)
      ) {
        return;
      }

      if (selectedRowId == null) return;

      const filteredRow = filteredData[selectedRowId];
      if (!filteredRow) return;

      const rowValues = displayColumns.map((col) => getCellDisplayValueForRow(filteredRow, col));
      const tsv = rowValues.join('\t');
      if (!tsv) return;

      try {
        e.preventDefault();
        e.clipboardData.setData('text/plain', tsv);
        toast.success('📋 Đã sao chép dòng vào bộ nhớ tạm!', {
          autoClose: 2000,
          hideProgressBar: true,
        });
      } catch (err) {
        console.error('Copy failed:', err);
        navigator.clipboard.writeText(tsv).catch(() => {
          toast.error('❌ Sao chép thất bại');
        });
      }
    };

    document.addEventListener('copy', handleCopy, true);
    return () => document.removeEventListener('copy', handleCopy, true);
  }, [selectedRowId, filteredData, displayColumns, getCellDisplayValueForRow]);

  useEffect(() => {
    setSelectedRowId(null);
  }, [currentPage, rowsPerPage]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredData.slice(start, start + rowsPerPage);
  }, [filteredData, currentPage, rowsPerPage]);

  // Handle sort
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };






  // Copy single cell content (double-click)
  const handleCellClick = async (e, value) => {
    const textValue = String(value ?? '').trim();
    if (!textValue || textValue === '-') {
      toast.info("⚠️ Ô này không có nội dung", { autoClose: 1500, hideProgressBar: true });
      return;
    }

    try {
      await navigator.clipboard.writeText(textValue);
      toast.success(`📋 Đã copy: "${textValue.length > 30 ? textValue.substring(0, 30) + '...' : textValue}"`, {
        autoClose: 2000,
        hideProgressBar: true,
      });
    } catch (err) {
      console.error('Copy failed:', err);
      toast.error("❌ Sao chép thất bại");
    }
  };

  // Handle column visibility toggle
  const toggleColumn = (column) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  // Select all columns
  const selectAllColumns = () => {
    const all = {};
    allAvailableColumns.forEach(col => {
      all[col] = true;
    });
    setVisibleColumns(all);
  };

  // Deselect all columns
  const deselectAllColumns = () => {
    const none = {};
    allAvailableColumns.forEach(col => {
      none[col] = false;
    });
    setVisibleColumns(none);
  };

  // Reset to default columns
  const resetToDefault = () => {
    const defaultCols = {};
    defaultColumns.forEach(col => {
      defaultCols[col] = true;
    });
    setVisibleColumns(defaultCols);
  };

  // Open Edit modal - Chỉ Admin mới được phép
  const openEditModal = (order) => {
    if (!isAdmin()) {
      toast.error("Chỉ Admin mới có quyền sửa đơn hàng!");
      return;
    }
    setEditingOrder({ ...order });
    setIsViewing(false);
    setIsEditModalOpen(true);
  };

  // Open View modal
  const openViewModal = (order) => {
    setEditingOrder({ ...order });
    setIsViewing(true);
    setIsEditModalOpen(true);
  };

  // Handle Input Change in Modal
  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditingOrder(prev => ({ ...prev, [name]: value }));
  };

  // Save Updates - Chỉ Admin mới được phép
  const handleUpdateOrder = async () => {
    if (!editingOrder) return;
    if (!isAdmin()) {
      return toast.error("Chỉ Admin mới có quyền sửa!");
    }

    setIsUpdating(true);
    try {
      const updatePayload = {
        customer_name: editingOrder.customer_name,
        customer_phone: editingOrder.customer_phone,
        customer_address: editingOrder.customer_address,
        country: editingOrder.country || editingOrder["Khu vực"], // Khu vực
        note: editingOrder.note,

        // Extended fields
        product: editingOrder.product,
        payment_method: editingOrder.payment_method, // or payment_method_text if needed, check schema
        delivery_status: editingOrder.delivery_status,
        total_amount_vnd: parseFloat(editingOrder.total_amount_vnd) || 0,
        tracking_code: editingOrder.tracking_code,
        // Add others if necessary based on schema
      };
      if (FEEDBACK_COLUMNS_ENABLED) {
        updatePayload.feedback_pos =
          editingOrder.feedback_pos || editingOrder["Phản hồi tích cực"] || '';
        updatePayload.feedback_neg =
          editingOrder.feedback_neg || editingOrder["Phản hồi tiêu cực"] || '';
      }

      const { error } = await supabase.from(ordersTableName).update(updatePayload).eq('id', editingOrder.id);

      if (error) throw error;

      alert("✅ Cập nhật thành công!");

      // Update local list
      setAllData(prev => prev.map(item => item.id === editingOrder.id ? { ...item, ...editingOrder } : item));
      setIsEditModalOpen(false);
      setEditingOrder(null);

    } catch (err) {
      console.error("Update error:", err);
      alert("❌ Lỗi cập nhật: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };


  // Handle Delete - Chỉ Admin mới được phép
  const handleDelete = async (id) => {
    if (!isAdmin()) {
      toast.error("Chỉ Admin mới có quyền xóa đơn hàng!");
      return;
    }
    if (!window.confirm("Bạn có chắc chắn muốn xóa đơn hàng này? Hành động này không thể hoàn tác!")) return;

    try {
      const { error } = await supabase.from(ordersTableName).delete().eq('id', id);
      if (error) throw error;

      alert("✅ Đã xóa đơn hàng thành công!");
      // Update UI locally to avoid reload
      setAllData(prev => prev.filter(item => item.id !== id));
    } catch (error) {
      console.error("Delete error:", error);
      alert("❌ Lỗi xóa đơn: " + error.message);
    }
  };

  if (!canAccessPage) {
    const codes = accessPermissionCodes.join(', ');
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này ({codes}).
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">

              <div>
                <h1 className="text-xl font-bold text-gray-800">{pageTitle}</h1>
                <p className="text-xs text-gray-500">{pageSubtitle}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                <span className={`h-2 w-2 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-sm text-gray-600">
                  {filteredData.length} / {allData.length} đơn hàng
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg border border-green-200">
                <span className="text-sm font-semibold text-green-700">Tổng tiền:</span>
                <span className="text-sm text-green-600 font-bold">
                  {filteredTongTien.toLocaleString('vi-VN')} ₫
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-sm font-semibold text-blue-700">Tổng đơn:</span>
                <span className="text-sm text-blue-600 font-bold">
                  {filteredData.length.toLocaleString('vi-VN')}
                </span>
              </div>
              <button
                onClick={loadData}
                disabled={loading}
                className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {loading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {loading ? 'Đang tải...' : 'Tải lại'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-full mx-auto px-6 py-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 relative">
          <div className="flex flex-wrap items-end gap-4 relative z-50">
            {/* Search by Order Code */}
            <div className="min-w-[200px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tìm theo mã đơn hàng</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Nhập mã đơn hàng..."
                  className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  value={searchOrderCode}
                  onChange={(e) => setSearchOrderCode(e.target.value)}
                />
                {searchOrderCode && (
                  <button
                    onClick={() => setSearchOrderCode('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="Xóa"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tìm kiếm</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tên, SĐT, tracking..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] disabled:bg-gray-100 disabled:cursor-not-allowed"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  disabled={!!searchOrderCode}
                />
              </div>
              {searchOrderCode && (
                <p className="text-xs text-gray-500 mt-1">Tìm kiếm chung bị vô hiệu khi đang tìm theo mã đơn</p>
              )}
            </div>

            {/* Market Filter - checkbox */}
            <div className="min-w-[200px] relative z-50">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Khu vực</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (showMarketFilter) setShowMarketFilter(false);
                    else {
                      setShowProductFilter(false);
                      setShowStatusFilter(false);
                      setShowQuickFilter(false);
                      setShowCheckResultFilter(false);
                      setShowPaymentThuTienFilter(false);
                      setShowSaleFilter(false);
                      setShowMKTFilter(false);
                      setShowMarketFilter(true);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterMarket.length === 0
                      ? 'Tất cả'
                      : filterMarket.length === 1
                        ? filterMarket[0]
                        : `Đã chọn ${filterMarket.length}`}
                  </span>
                  <span className="ml-2">{showMarketFilter ? '▲' : '▼'}</span>
                </button>
                {showMarketFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn khu vực:</span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setFilterMarket([...uniqueMarkets])}
                            className="text-xs text-green-600 hover:text-green-800"
                          >
                            Chọn tất cả
                          </button>
                          <button
                            type="button"
                            onClick={() => setFilterMarket([])}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Bỏ chọn tất cả
                          </button>
                        </div>
                      </div>
                      {uniqueMarkets.map((market) => {
                        const isChecked = filterMarket.includes(market);
                        return (
                          <label
                            key={market}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterMarket([...filterMarket, market]);
                                } else {
                                  setFilterMarket(filterMarket.filter((m) => m !== market));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{market}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Product Filter - checkbox */}
            <div className="min-w-[200px] relative z-50">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Mặt hàng</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (showProductFilter) setShowProductFilter(false);
                    else {
                      setShowMarketFilter(false);
                      setShowStatusFilter(false);
                      setShowQuickFilter(false);
                      setShowCheckResultFilter(false);
                      setShowPaymentThuTienFilter(false);
                      setShowSaleFilter(false);
                      setShowMKTFilter(false);
                      setShowProductFilter(true);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterProduct.length === 0
                      ? 'Tất cả'
                      : filterProduct.length === 1
                        ? filterProduct[0]
                        : `Đã chọn ${filterProduct.length}`}
                  </span>
                  <span className="ml-2">{showProductFilter ? '▲' : '▼'}</span>
                </button>
                {showProductFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn mặt hàng:</span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setFilterProduct([...uniqueProducts])}
                            className="text-xs text-green-600 hover:text-green-800"
                          >
                            Chọn tất cả
                          </button>
                          <button
                            type="button"
                            onClick={() => setFilterProduct([])}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Bỏ chọn tất cả
                          </button>
                        </div>
                      </div>
                      {uniqueProducts.map((product) => {
                        const isChecked = filterProduct.includes(product);
                        return (
                          <label
                            key={product}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterProduct([...filterProduct, product]);
                                } else {
                                  setFilterProduct(filterProduct.filter((p) => p !== product));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{product}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Status Filter - checkbox */}
            <div className="min-w-[200px] relative z-50">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Trạng thái</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (showStatusFilter) setShowStatusFilter(false);
                    else {
                      setShowMarketFilter(false);
                      setShowProductFilter(false);
                      setShowQuickFilter(false);
                      setShowCheckResultFilter(false);
                      setShowPaymentThuTienFilter(false);
                      setShowSaleFilter(false);
                      setShowMKTFilter(false);
                      setShowStatusFilter(true);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterStatus.length === 0
                      ? 'Tất cả'
                      : filterStatus.length === 1
                        ? filterStatus[0]
                        : `Đã chọn ${filterStatus.length}`}
                  </span>
                  <span className="ml-2">{showStatusFilter ? '▲' : '▼'}</span>
                </button>
                {showStatusFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn trạng thái:</span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setFilterStatus([...uniqueStatuses])}
                            className="text-xs text-green-600 hover:text-green-800"
                          >
                            Chọn tất cả
                          </button>
                          <button
                            type="button"
                            onClick={() => setFilterStatus([])}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Bỏ chọn tất cả
                          </button>
                        </div>
                      </div>
                      {uniqueStatuses.map((status) => {
                        const isChecked = filterStatus.includes(status);
                        return (
                          <label
                            key={status}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterStatus([...filterStatus, status]);
                                } else {
                                  setFilterStatus(filterStatus.filter((s) => s !== status));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{status}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Trạng thái thu tiền - checkbox */}
            <div className="min-w-[200px] relative z-50">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Trạng thái thu tiền</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (showPaymentThuTienFilter) setShowPaymentThuTienFilter(false);
                    else {
                      setShowMarketFilter(false);
                      setShowProductFilter(false);
                      setShowStatusFilter(false);
                      setShowQuickFilter(false);
                      setShowCheckResultFilter(false);
                      setShowSaleFilter(false);
                      setShowMKTFilter(false);
                      setShowPaymentThuTienFilter(true);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterPaymentThuTien.length === 0
                      ? 'Tất cả'
                      : filterPaymentThuTien.length === 1
                        ? filterPaymentThuTien[0]
                        : `Đã chọn ${filterPaymentThuTien.length}`}
                  </span>
                  <span className="ml-2">{showPaymentThuTienFilter ? '▲' : '▼'}</span>
                </button>
                {showPaymentThuTienFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn trạng thái thu tiền:</span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setFilterPaymentThuTien([...uniquePaymentThuTien])}
                            className="text-xs text-green-600 hover:text-green-800"
                          >
                            Chọn tất cả
                          </button>
                          <button
                            type="button"
                            onClick={() => setFilterPaymentThuTien([])}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Bỏ chọn tất cả
                          </button>
                        </div>
                      </div>
                      {uniquePaymentThuTien.map((pt) => {
                        const isChecked = filterPaymentThuTien.includes(pt);
                        return (
                          <label
                            key={pt}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterPaymentThuTien([...filterPaymentThuTien, pt]);
                                } else {
                                  setFilterPaymentThuTien(filterPaymentThuTien.filter((v) => v !== pt));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{pt}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Kết quả Check - checkbox */}
            <div className="min-w-[200px] relative z-50">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Kết quả Check</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (showCheckResultFilter) setShowCheckResultFilter(false);
                    else {
                      setShowMarketFilter(false);
                      setShowProductFilter(false);
                      setShowStatusFilter(false);
                      setShowQuickFilter(false);
                      setShowPaymentThuTienFilter(false);
                      setShowSaleFilter(false);
                      setShowMKTFilter(false);
                      setShowCheckResultFilter(true);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterCheckResult.length === 0
                      ? 'Tất cả'
                      : filterCheckResult.length === 1
                        ? filterCheckResult[0]
                        : `Đã chọn ${filterCheckResult.length}`}
                  </span>
                  <span className="ml-2">{showCheckResultFilter ? '▲' : '▼'}</span>
                </button>
                {showCheckResultFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn kết quả:</span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setFilterCheckResult([...uniqueCheckResults])}
                            className="text-xs text-green-600 hover:text-green-800"
                          >
                            Chọn tất cả
                          </button>
                          <button
                            type="button"
                            onClick={() => setFilterCheckResult([])}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Bỏ chọn tất cả
                          </button>
                        </div>
                      </div>
                      {uniqueCheckResults.map((cr) => {
                        const isChecked = filterCheckResult.includes(cr);
                        return (
                          <label
                            key={cr}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterCheckResult([...filterCheckResult, cr]);
                                } else {
                                  setFilterCheckResult(filterCheckResult.filter((v) => v !== cr));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{cr}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sale Filter - Multi-select với checkbox */}
            <div className="min-w-[200px] relative z-50">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Lọc theo NV Sale</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (showSaleFilter) setShowSaleFilter(false);
                    else {
                      setShowMarketFilter(false);
                      setShowProductFilter(false);
                      setShowStatusFilter(false);
                      setShowCheckResultFilter(false);
                      setShowPaymentThuTienFilter(false);
                      setShowQuickFilter(false);
                      setShowMKTFilter(false);
                      setShowSaleFilter(true);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterSale.length === 0
                      ? 'Tất cả'
                      : filterSale.length === 1
                        ? filterSale[0]
                        : `Đã chọn ${filterSale.length}`}
                  </span>
                  <span className="ml-2">{showSaleFilter ? '▲' : '▼'}</span>
                </button>

                {showSaleFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn NV Sale:</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setFilterSale([...uniqueSale]);
                            }}
                            className="text-xs text-green-600 hover:text-green-800"
                          >
                            Chọn tất cả
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFilterSale([]);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Bỏ chọn tất cả
                          </button>
                        </div>
                      </div>
                      {uniqueSale.map(sale => {
                        const isChecked = filterSale.includes(sale);
                        return (
                          <label
                            key={sale}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterSale([...filterSale, sale]);
                                } else {
                                  setFilterSale(filterSale.filter(s => s !== sale));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{sale}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* MKT Filter - Multi-select với checkbox */}
            <div className="min-w-[200px] relative z-50">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Lọc theo MKT</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (showMKTFilter) setShowMKTFilter(false);
                    else {
                      setShowMarketFilter(false);
                      setShowProductFilter(false);
                      setShowStatusFilter(false);
                      setShowCheckResultFilter(false);
                      setShowPaymentThuTienFilter(false);
                      setShowQuickFilter(false);
                      setShowSaleFilter(false);
                      setShowMKTFilter(true);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterMKT.length === 0
                      ? 'Tất cả'
                      : filterMKT.length === 1
                        ? filterMKT[0]
                        : `Đã chọn ${filterMKT.length}`}
                  </span>
                  <span className="ml-2">{showMKTFilter ? '▲' : '▼'}</span>
                </button>

                {showMKTFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn MKT:</span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setFilterMKT([...uniqueMKT])}
                            className="text-xs text-green-600 hover:text-green-800"
                          >
                            Chọn tất cả
                          </button>
                          <button
                            type="button"
                            onClick={() => setFilterMKT([])}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Bỏ chọn tất cả
                          </button>
                        </div>
                      </div>
                      {uniqueMKT.map(mkt => {
                        const isChecked = filterMKT.includes(mkt);
                        return (
                          <label
                            key={mkt}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterMKT([...filterMKT, mkt]);
                                } else {
                                  setFilterMKT(filterMKT.filter(m => m !== mkt));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{mkt}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Filter - checkbox (một mốc thời gian tại một thời điểm) */}
            <div className="min-w-[200px] relative z-50">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Lọc nhanh</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (showQuickFilter) setShowQuickFilter(false);
                    else {
                      setShowMarketFilter(false);
                      setShowProductFilter(false);
                      setShowStatusFilter(false);
                      setShowCheckResultFilter(false);
                      setShowPaymentThuTienFilter(false);
                      setShowSaleFilter(false);
                      setShowMKTFilter(false);
                      setShowQuickFilter(true);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {QUICK_FILTER_OPTIONS.find((o) => o.value === quickFilter)?.label ?? '-- Chọn --'}
                  </span>
                  <span className="ml-2">{showQuickFilter ? '▲' : '▼'}</span>
                </button>
                {showQuickFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <span className="text-xs font-semibold text-gray-700 block mb-2 pb-2 border-b">
                        Chọn khoảng thời gian nhanh:
                      </span>
                      {QUICK_FILTER_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={quickFilter === opt.value}
                            onChange={(e) => {
                              if (e.target.checked) {
                                handleQuickFilter(opt.value);
                              } else if (quickFilter === opt.value) {
                                handleQuickFilter('');
                              }
                            }}
                            className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                          />
                          <span className="ml-2 text-sm text-gray-700">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Date Range Filter */}
            <div className="min-w-[200px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                Thời gian (Từ - Đến)
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <input
                  type="date"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Settings Button */}
            <button
              onClick={() => setShowColumnSettings(true)}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Cài đặt cột
            </button>
          </div>
          {(showMarketFilter ||
            showProductFilter ||
            showStatusFilter ||
            showPaymentThuTienFilter ||
            showCheckResultFilter ||
            showQuickFilter ||
            showSaleFilter ||
            showMKTFilter) && (
            <div
              className="fixed inset-0 z-40"
              aria-hidden
              onClick={closeAllFilterDropdowns}
            />
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <p className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
            Click dòng để bôi xanh → <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Ctrl+C</kbd> sao chép cả dòng. Hoặc kéo chuột bôi đen nhiều ô → <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Ctrl+C</kbd> dán vào Excel.
          </p>
          <div className="overflow-x-auto" data-cskh-grid-root>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {displayColumns.map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort(col)}
                    >
                      <div className="flex items-center gap-2">
                        {getDisplayColumnName(col)}
                        {sortColumn === col && (
                          <span className="text-[#F37021]">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                  {isAdmin() && (
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-l border-gray-200 sticky right-0 z-10 w-[120px]">
                      Thao tác
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={displayColumns.length + (isAdmin() ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin h-5 w-5 border-2 border-[#F37021] border-t-transparent rounded-full"></div>
                        Đang tải dữ liệu...
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={displayColumns.length + (isAdmin() ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                      Không có dữ liệu phù hợp
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((row, index) => {
                    const rowIndexFiltered = (currentPage - 1) * rowsPerPage + index;
                    const isSelected = selectedRowId === rowIndexFiltered;
                    const trClass = isSelected
                      ? 'cursor-pointer transition-colors bg-blue-100 ring-2 ring-inset ring-blue-500 hover:bg-blue-100'
                      : 'cursor-pointer transition-colors hover:bg-gray-50';

                    return (
                    <tr
                      key={row[PRIMARY_KEY_COLUMN] || row.id || index}
                      onMouseDown={() => setSelectedRowId(rowIndexFiltered)}
                      className={trClass}
                    >
                      {displayColumns.map((col) => {
                        const value = getCellDisplayValueForRow(row, col);

                        return (
                          <td
                            key={col}
                            className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap"
                            title={`${value || '-'} (Double-click để copy ô)`}
                            onDoubleClick={(e) => handleCellClick(e, value)}
                          >
                            {value || '-'}
                          </td>
                        );
                      })}

                      {/* Action Column - Chỉ Admin mới thấy */}
                      {isAdmin() && (
                        <td
                          className={`px-4 py-3 text-sm text-gray-900 whitespace-nowrap border-l border-gray-200 sticky right-0 z-10 text-center ${
                            isSelected ? 'bg-blue-100' : 'bg-white'
                          }`}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            {/* View - Open Modal Read Only */}
                            <button
                              onClick={() => openViewModal(row)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                              title="Xem chi tiết"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Xem
                            </button>

                            {/* Edit - Chỉnh sửa đầy đủ trong form NhapDonMoi */}
                            {(canEditFromThisList || isAdmin()) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const orderId = row['Mã đơn hàng'] || row.order_code;
                                  if (orderId) {
                                    const hcm = isHcmOrders ? '&view=hcm' : '';
                                    navigate(`/chinh-sua-don?orderId=${encodeURIComponent(orderId)}${hcm}`);
                                  } else {
                                    toast.error('Không tìm thấy mã đơn hàng');
                                  }
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 border border-green-200 rounded transition-colors"
                                title="Chỉnh sửa đầy đủ thông tin đơn hàng"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                Sửa
                              </button>
                            )}

                            {/* Delete - Chỉ Admin mới thấy */}
                            {isAdmin() && (
                              <button
                                onClick={() => handleDelete(row.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors"
                                title="Xóa đơn hàng"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Xóa
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Số dòng/trang:</label>
              <select
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
                <option value="1000">1000</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700">
                Trang <span className="font-bold text-[#F37021]">{currentPage}</span> / {totalPages || 1}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors shadow-sm"
                >
                  ← Trước
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors shadow-sm"
                >
                  Sau →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Column Settings Modal */}
      <ColumnSettingsModal
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        allColumns={allAvailableColumns}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onSelectAll={selectAllColumns}
        onDeselectAll={deselectAllColumns}
        onResetDefault={resetToDefault}
        defaultColumns={defaultColumns}
        getDisplayColumnName={getDisplayColumnName}
      />
      {/* Edit/View Modal for CSKH */}
      {isEditModalOpen && editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  {isViewing ? "Chi tiết đơn hàng" : "Chỉnh sửa thông tin CSKH"}
                </h2>
                <p className="text-sm text-gray-500">Mã đơn: <span className="font-mono font-bold text-blue-600">{editingOrder.order_code}</span></p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">

              {/* Section 1: Thông tin khách hàng */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-3 border-b pb-2">1. Thông tin khách hàng</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên khách hàng</label>
                    <input
                      name="customer_name"
                      value={editingOrder.customer_name || ''}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                    <input
                      name="customer_phone"
                      value={editingOrder.customer_phone || ''}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
                  <input
                    name="customer_address"
                    value={editingOrder.customer_address || ''}
                    onChange={handleEditChange}
                    readOnly={isViewing}
                    disabled={isViewing}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Khu vực</label>
                    <input
                      name="country"
                      value={editingOrder.country || editingOrder["Khu vực"] || ''}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Thông tin đơn hàng */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-3 border-b pb-2">2. Thông tin đơn hàng</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mặt hàng chính</label>
                    <select
                      name="product"
                      value={editingOrder.product || ''}
                      onChange={handleEditChange}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 bg-white ${isViewing ? 'bg-gray-100' : ''}`}
                    >
                      <option value="">-- Chọn mặt hàng --</option>
                      {uniqueProducts.map(product => (
                        <option key={product} value={product}>
                          {product}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tổng tiền (VNĐ)</label>
                    <input
                      name="total_amount_vnd"
                      type="number"
                      value={editingOrder.total_amount_vnd || 0}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 font-bold text-red-600 ${isViewing ? 'bg-gray-100' : ''}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hình thức thanh toán</label>
                    <select
                      name="payment_method"
                      value={editingOrder.payment_method || ''}
                      onChange={handleEditChange}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                    >
                      <option value="">-- Chọn --</option>
                      <option value="COD">COD (Thu hộ)</option>
                      <option value="CK">Chuyển khoản</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Trạng thái & Vận chuyển */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-3 border-b pb-2">3. Trạng thái & Vận chuyển</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mã Tracking</label>
                    <input
                      name="tracking_code"
                      value={editingOrder.tracking_code || ''}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 font-mono ${isViewing ? 'bg-gray-100' : ''}`}
                      placeholder="Nhập mã vận đơn..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái giao hàng</label>
                    <input
                      name="delivery_status"
                      value={editingOrder.delivery_status || ''}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                      placeholder="Ví dụ: Đã giao, Đang vận chuyển..."
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú CSKH</label>
                <textarea
                  name="note"
                  rows={3}
                  value={editingOrder.note || ''}
                  onChange={handleEditChange}
                  readOnly={isViewing}
                  disabled={isViewing}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                  placeholder="Nhập ghi chú..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-green-700 mb-1">Phản hồi tích cực</label>
                  <textarea
                    name="feedback_pos"
                    rows={3}
                    value={editingOrder.feedback_pos || editingOrder["Phản hồi tích cực"] || ''}
                    onChange={handleEditChange}
                    readOnly={isViewing}
                    disabled={isViewing}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                    placeholder="Khách hài lòng về điều gì..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-red-700 mb-1">Phản hồi tiêu cực</label>
                  <textarea
                    name="feedback_neg"
                    rows={3}
                    value={editingOrder.feedback_neg || editingOrder["Phản hồi tiêu cực"] || ''}
                    onChange={handleEditChange}
                    readOnly={isViewing}
                    disabled={isViewing}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                    placeholder="Vấn đề khách đang gặp..."
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                disabled={isUpdating}
              >
                {isViewing ? "Đóng" : "Hủy bỏ"}
              </button>

              {!isViewing && (
                <button
                  onClick={handleUpdateOrder}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2"
                >
                  {isUpdating && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {isUpdating ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuanLyCSKH;
