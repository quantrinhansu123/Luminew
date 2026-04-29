import { Download, Layers, RefreshCw, Search, Settings, Truck, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';

import ColumnSettingsModal from '../components/ColumnSettingsModal';
const BillImageViewer = lazy(() => import('../components/BillImageViewer'));
import usePermissions from '../hooks/usePermissions';
import { logDataChange } from '../services/logging';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';
import { COLUMN_MAPPING, PRIMARY_KEY_COLUMN } from '../types';
import { isDateInRange, orderRangeToCreatedAtIsoBounds, parseSmartDate } from '../utils/dateParsing';
import { parseVietnameseMoneyToNumber } from '../utils/parseVietnameseMoney';
import { totalAmountVndFromLenDonFormula } from '../utils/totalAmountVndFromLenDon';
import { labelForOrderLogDbKey, parseOrderLogJsonb } from '../utils/orderLogJsonb';
import {
  computeCanhBaoUpdatesForDuplicateCustomers,
  normalizeCustomerTextForDup,
  normalizePhoneDigits,
} from '../utils/customerDuplicateCanhBao';
import { getCheckResult } from '../utils/orderCheckAndVnd';
import { F3SummaryTab } from '../components/tabs/F3SummaryTab';
import { F3_STATIC_DATA } from '../data/f3_static_data';

/**
 * PostgREST thường bị giới hạn ~1000 dòng / request.
 * Vì vậy phải fetch theo trang bằng range().
 * Tăng lên 2000 để giảm số lần request
 */
// Supabase/PostgREST thường trả tối đa 1000 dòng mỗi request theo project setting.
// Dùng đúng ngưỡng này để điều kiện phân trang không bị dừng sớm ở page 1.
const ORDERS_PAGE_SIZE = 1000;

function chunkArray(arr, size) {
  const a = arr || [];
  const out = [];
  for (let i = 0; i < a.length; i += size) out.push(a.slice(i, i + size));
  return out;
}

/**
 * Chèn từ `orders` → `order_code_hcm`: chỉ copy own keys, bỏ mọi cột GENERATED STORED
 * (vd. `van_don_line_total_vnd` — Postgres lỗi «cannot insert a non-DEFAULT value» nếu gửi tay).
 * `preserveId`: giữ `id` từ orders để trùng khóa 1–1 và tránh điền trùng khi đã có cùng id trên HCM.
 */
function cloneOrderRowForHcmInsert(row, opts = {}) {
  const preserveId = !!opts.preserveId;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
  const out = {};
  for (const key of Object.keys(row)) {
    if (key === 'id' && !preserveId) continue;
    if (key === 'van_don_line_total_vnd') continue;
    out[key] = row[key];
  }
  return out;
}


/** Giá trị Ca sau khi gộp Giữa ca + Hết ca (khớp NhapDonMoi / báo cáo) */
const SHIFT_GIUA_CA_HET_CA = 'Giữa ca,Hết ca';

/** Chỉ đơn đang là đúng một ca "Giữa ca" (không phẩy, không Hết ca) */
function isOnlyGiuaCaShift(shiftVal) {
  const s = String(shiftVal ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return false;
  if (s.includes(',')) return false;
  const n = s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return n === 'giua ca';
}

/** Chuẩn hoá dấu phẩy / khoảng trắng trong cột Ca (vd. «Giữa ca, Hết ca» → «Giữa ca,Hết ca») — khớp NhapDonMoi / migration SQL. */
function normalizeCaShiftDisplay(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',');
}

/** Chuẩn hoá ca đầu vào trước khi lưu DB, không để lọt "Giữa ca" thuần. */
function normalizeIncomingShiftForSave(rawShift, fallbackDateTime) {
  const stored = normalizeCaShiftDisplay(rawShift);
  if (stored) {
    const n = stored.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const hasHet = n.includes('het ca');
    const hasGua = n.includes('giua ca');
    if (hasGua && !hasHet) return SHIFT_GIUA_CA_HET_CA;
    if (hasHet && hasGua) return SHIFT_GIUA_CA_HET_CA;
    if (hasHet) return 'Hết ca';
  }
  const inferred = inferCaShiftFromDateTime(fallbackDateTime);
  if (inferred) return inferred;
  return SHIFT_GIUA_CA_HET_CA;
}

/**
 * Suy ca từ datetime khi DB chưa có shift — cùng khung giờ với NhapDonMoi; chỉ khi chuỗi có giờ rõ ràng (tránh date-only → 00:00 sai).
 */
function inferCaShiftFromDateTime(dateTimeString) {
  const s = String(dateTimeString ?? '').trim();
  if (!s) return '';
  const hasExplicitTime =
    /^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}/.test(s);
  if (!hasExplicitTime) return '';
  try {
    let hour;
    let minute;
    const localMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (localMatch) {
      hour = parseInt(localMatch[4], 10);
      minute = parseInt(localMatch[5], 10);
    } else {
      const date = new Date(s);
      if (Number.isNaN(date.getTime())) return '';
      hour = date.getHours();
      minute = date.getMinutes();
    }
    const totalMinutes = hour * 60 + minute;
    const startGiuaCa = 7 * 60 + 30;
    const endGiuaCa = 15 * 60 + 30;
    const endDay = 23 * 60 + 59;
    if (totalMinutes >= startGiuaCa && totalMinutes <= endDay) return SHIFT_GIUA_CA_HET_CA;
    return 'Hết ca';
  } catch {
    return '';
  }
}

/** Khớp bộ phận Vận đơn trên users.department hoặc human_resources."Bộ phận". */
function isBoPhanVanDon(dept) {
  const raw = (dept ?? '').toString().trim();
  if (!raw) return false;
  const compact = raw.toLowerCase().replace(/\s+/g, ' ');
  if (compact.includes('vận đơn') || compact.includes('van đơn')) return true;
  const ascii = raw.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');
  if (ascii.includes('van don')) return true;
  if (ascii === 'logistics' || ascii.startsWith('logistics ')) return true;
  return false;
}

/**
 * Danh sách tên NV vận đơn cho bộ lọc / modal (không phụ thuộc đơn đang có delivery_staff).
 * Nguồn: users (bộ phận), human_resources, danh_sach_van_don.ho_va_ten.
 */
async function fetchVanDonStaffNameList(supabaseClient) {
  const names = new Set();
  const [usersRes, hrRes, dsvdRes] = await Promise.all([
    supabaseClient
      .from('users')
      .select('name, department')
      .not('name', 'is', null)
      .order('name', { ascending: true }),
    supabaseClient.from('human_resources').select('"Họ Và Tên", "Bộ phận"'),
    supabaseClient.from('danh_sach_van_don').select('ho_va_ten').not('ho_va_ten', 'is', null),
  ]);
  if (usersRes.error) throw usersRes.error;
  (usersRes.data || []).forEach((u) => {
    if (isBoPhanVanDon(u.department)) {
      const n = String(u.name || '').trim();
      if (n) names.add(n);
    }
  });
  if (hrRes.error) {
    console.warn('human_resources (bộ phận Vận đơn):', hrRes.error);
  } else {
    (hrRes.data || []).forEach((row) => {
      if (isBoPhanVanDon(row['Bộ phận'])) {
        const n = String(row['Họ Và Tên'] || '').trim();
        if (n) names.add(n);
      }
    });
  }
  if (dsvdRes.error) {
    console.warn('danh_sach_van_don (ho_va_ten NV vận đơn):', dsvdRes.error);
  } else {
    (dsvdRes.data || []).forEach((r) => {
      const n = String(r.ho_va_ten || '').trim();
      if (n) names.add(n);
    });
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
}

// Các cột tự động ẩn mặc định trong bảng danh sách đơn hàng
const HIDDEN_COLUMNS = [
  'Phí Chung',
  'Phí bay',
  'Phí ship',
  // Note: "Phí ship" bị ẩn, vì đối soát cước đang cần hiển thị theo tên "Phí cước".
  // Mình thêm cột "Phí cước" (alias) để hiện dữ liệu mà không đụng logic ẩn hiện tại.
  'Phí xử lý đơn đóng hàng-Lưu kho(usd)',
  'Thuê TK',
  'Thời gian cutoff',
  'Tiền Hàng',
  '_source',
  '_id'
];

/**
 * Cùng phạm vi đơn như loadData: team, nhân sự, khoảng order_date + đơn order_date null (created_at trong khoảng).
 */
async function fetchDanhSachDonMergedRawOrders({
  supabaseClient,
  ordersTableName = 'orders',
  startDate,
  endDate,
  teamFilter,
  isAdmin,
  selectedPersonnelNames,
  userName,
  selectColumns = '*',
  skipImplicitFilters = false,
}) {
  const normalizeNameForQuery = (str) => {
    if (!str) return '';
    return String(str).trim().replace(/\s+/g, ' ');
  };

  const applyTeamAndPersonnel = (q) => {
    let query = q;
    // Áp dụng bộ lọc Team nếu có
    if (!skipImplicitFilters && teamFilter) {
      query = query.eq('team', teamFilter);
    } else if (!skipImplicitFilters && ordersTableName === 'orders') {
      // Mặc định cho phép Admin xem toàn bộ, hoặc nếu không có teamFilter cụ thể
      // Không ép lọc "neq.HCM" ở tầng query trừ khi database yêu cầu tách biệt hoàn toàn
    }

    // Áp dụng bộ lọc nhân sự nếu không phải Admin
    if (!isAdmin && !skipImplicitFilters) {
      const allNames = [...new Set([...(selectedPersonnelNames || []), userName].filter(Boolean))];
      if (allNames.length > 0) {
        const orConditions = allNames.flatMap((name) => {
          const normalizedName = normalizeNameForQuery(name);
          return [
            `sale_staff.ilike.%${normalizedName}%`,
            `marketing_staff.ilike.%${normalizedName}%`,
            `delivery_staff.ilike.%${normalizedName}%`,
          ];
        });
        query = query.or(orConditions.join(','));
      }
    }
    return query;
  };

  const fetchAllPages = async ({ orderField = 'order_date', includeOrderDateRange = true, extraQueryBuilder = null }) => {
    const all = [];
    let from = 0;
    const maxPages = 100;

    for (let page = 0; page < maxPages; page++) {
      // Tạo query mới cho mỗi page
      let query = supabaseClient.from(ordersTableName).select(selectColumns);
      query = applyTeamAndPersonnel(query);

      // Áp dụng filter theo ngày tại Database level
      if (!skipImplicitFilters && includeOrderDateRange) {
        if (startDate) query = query.gte('order_date', startDate);
        if (endDate) query = query.lte('order_date', endDate);
      }
      if (typeof extraQueryBuilder === 'function') {
        query = extraQueryBuilder(query);
      }

      query = query
        .order(orderField, { ascending: false })
        .order('order_code', { ascending: false })
        .range(from, from + ORDERS_PAGE_SIZE - 1);

      const { data, error } = await query;

      if (error) {
        console.error(`❌ Lỗi tải page ${page + 1}:`, error);
        throw error;
      }

      const chunk = data || [];
      all.push(...chunk);

      console.log(`📦 Page ${page + 1}: +${chunk.length} đơn. Tổng: ${all.length}`);

      if (chunk.length < ORDERS_PAGE_SIZE) {
        console.log(`✅ Hoàn tất: ${all.length} đơn từ ${page + 1} pages`);
        break;
      }

      from += ORDERS_PAGE_SIZE;
    }

    return all;
  };

  const supaData = await fetchAllPages({ orderField: 'order_date' });

  let mergedRaw = [...(supaData || [])];
  if (!skipImplicitFilters && startDate && endDate) {
    const { start: cStart, end: cEnd } = orderRangeToCreatedAtIsoBounds(startDate, endDate);
    try {
      const extraRows = await fetchAllPages({
        orderField: 'created_at',
        includeOrderDateRange: false,
        extraQueryBuilder: (q) => q.is('order_date', null).gte('created_at', cStart).lte('created_at', cEnd),
      });
      if (extraRows?.length) {
        mergedRaw.push(...extraRows);
      }
    } catch (e) {
      console.warn('⚠️ [DanhSachDon] Không gộp được đơn order_date null:', e?.message || String(e));
    }
  }

  // Trùng order_code (dữ liệu DB / gộp) → chỉ giữ một bản ghi, ưu tiên dòng có order_date.
  const byKey = new Map();
  mergedRaw.forEach((r, i) => {
    const code = r?.order_code != null && String(r.order_code).trim() !== '' ? String(r.order_code).trim() : '';
    const key = code || `__row_${r?.id ?? i}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      return;
    }
    const prevOd = prev?.order_date != null && String(prev.order_date).trim() !== '';
    const curOd = r?.order_date != null && String(r.order_date).trim() !== '';
    if (!prevOd && curOd) byKey.set(key, r);
  });
  return [...byKey.values()];
}

/** Khóa trùng Name* + Phone* + Add trong danh sách (chuẩn hóa giống cảnh báo trùng khách). */
function tripleNamePhoneAddKey(row) {
  const name = row['Name*'] ?? row['Name'] ?? '';
  const phone = row['Phone*'] ?? row['Phone'] ?? '';
  const add = row['Add'] ?? '';
  const np = normalizePhoneDigits(phone);
  const nn = normalizeCustomerTextForDup(name);
  const na = normalizeCustomerTextForDup(add);
  if (!np && !nn && !na) return null;
  return `${np}\u001f${nn}\u001f${na}`;
}

/** Cùng nguồn giá trị với ô lưới (COLUMN_MAPPING → sale_staff / marketing_staff). */
function rowDisplaySaleStaff(row) {
  return String(row?.['Nhân viên Sale'] ?? row?.sale_staff ?? row?.saleStaff ?? '').trim();
}
function rowDisplayMktStaff(row) {
  return String(row?.['Nhân viên Marketing'] ?? row?.marketing_staff ?? row?.marketingStaff ?? '').trim();
}

/**
 * Tiền về cho F3 Summary:
 * - Ưu tiên reconciled_vnd (chuẩn mới)
 * - Fallback reconciled_amount cho dữ liệu legacy
 * - Nếu reconciled_vnd rất nhỏ nhưng reconciled_amount lớn bất thường, coi như dữ liệu vnd đã bị cụt và dùng legacy
 */
function resolveTienVeForSummary(row) {
  const vnd = parseVietnameseMoneyToNumber(
    row?.["Tiền Việt đã đối soát"] ?? row?.reconciled_vnd ?? 0
  ) || 0;
  const legacy = parseVietnameseMoneyToNumber(
    row?.["Số tiền của đơn hàng đã về TK Cty"] ?? row?.reconciled_amount ?? 0
  ) || 0;

  if (vnd <= 0 && legacy > 0) return legacy;
  if (vnd > 0 && legacy > 0) {
    // Heuristic cho dữ liệu bị parse cụt kiểu 4.725 thay vì 4.725.000
    if (vnd < 1000 && legacy >= 100000) return legacy;
  }
  return vnd;
}

function DanhSachDon({ dataSource = 'default' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const teamFilter = searchParams.get('team'); // e.g. 'RD'

  // State để chuyển đổi giữa các tab
  const [activeTab, setActiveTab] = useState(dataSource === 'hcm' ? 'hcm' : 'rd'); // rd, hcm, f3_summary
  const isHcmDataSource = dataSource === 'hcm';
  const isHcmView = activeTab === 'hcm';
  const baseSourceTable = isHcmDataSource ? 'order_code_hcm' : 'orders';
  const ordersTableName = activeTab === 'hcm' ? 'order_code_hcm' : 'orders';

  // Cache để tránh load lại khi chuyển đổi
  const [dataCache, setDataCache] = useState({
    orders: null,
    order_code_hcm: null
  });
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [selectedPersonnelLoaded, setSelectedPersonnelLoaded] = useState(false);

  // Permission Logic
  const { canView, canEdit, canDelete, role } = usePermissions();
  // Check Admin from multiple sources
  const userJson = localStorage.getItem("user");
  const user = userJson ? JSON.parse(userJson) : null;
  const userEmail = (user?.Email || user?.email || localStorage.getItem("userEmail") || "").toString().toLowerCase().trim();
  const ADMIN_MAIL = "admin@marketing.com";
  const roleLower = (role || '').toLowerCase();
  const isAdmin = ['admin', 'super_admin', 'finance'].includes(roleLower) ||
    userEmail === ADMIN_MAIL ||
    (user?.Bộ_phận || user?.['Bộ phận'] || "").toString().trim().toLowerCase() === 'admin' ||
    (user?.Bộ_phận || user?.['Bộ phận'] || "").toString().trim().toLowerCase() === 'finance';

  // Chỉ Admin thực sự (không bao gồm Finance) mới có quyền đồng bộ và xóa toàn bộ
  const isAdminOnly = ['admin', 'super_admin', 'ADMIN', 'SUPER_ADMIN'].includes(roleLower) ||
    userEmail === ADMIN_MAIL ||
    (user?.Bộ_phận || user?.['Bộ phận'] || "").toString().trim().toLowerCase() === 'admin';
  // Quyền xem/sửa: ưu tiên mã HCM khi vào /danh-sach-don-hcm; dự phòng *_NEW_ORDER nếu DB chưa có dòng SALE_ORDERS.
  const ORDER_LIST_ACCESS_RD = ['RND_ORDERS', 'RND_NEW_ORDER', 'RND_NEW_ORDER_HCM'];
  const ORDER_LIST_ACCESS_SALE_HCM = [
    'SALE_ORDERS_HCM',
    'SALE_NEW_ORDER_HCM',
    'CSKH_NEW_ORDER_HCM',
    'ORDERS_NEW',
    'RND_NEW_ORDER',
  ];
  const ORDER_LIST_ACCESS_SALE_DEFAULT = [
    'SALE_ORDERS',
    'SALE_NEW_ORDER',
    'CSKH_NEW_ORDER',
    'ORDERS_NEW',
    'RND_NEW_ORDER',
  ];
  const orderListAccessCodes =
    teamFilter === 'RD'
      ? ORDER_LIST_ACCESS_RD
      : activeTab === 'hcm'
        ? ORDER_LIST_ACCESS_SALE_HCM
        : ORDER_LIST_ACCESS_SALE_DEFAULT;

  const hasOrderListAccess = orderListAccessCodes.some((code) => canView(code));
  const effectivePermissionCode =
    orderListAccessCodes.find((code) => canView(code)) || orderListAccessCodes[0];
  /** Xóa đơn: một số bản ghi RBAC (vd. SALE_ORDERS_HCM) chưa bật can_delete; vẫn cho xóa nếu user có can_delete ở mã khác trong cùng nhóm quyền danh sách đơn. */
  const canDeleteOnThisOrderList = orderListAccessCodes.some((code) => canDelete(code));
  /** Sửa / xóa vận đơn hàng loạt: cùng logic với nút Sửa VĐ từng dòng. */
  const canEditOnThisOrderList = orderListAccessCodes.some((code) => canEdit(code));


  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPersonnelEmails, setSelectedPersonnelEmails] = useState([]); // Danh sách email nhân sự đã chọn
  const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]); // Danh sách tên nhân sự đã chọn
  const [personnelEmailToNameMap, setPersonnelEmailToNameMap] = useState({}); // Map email -> name


  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [filterMarket, setFilterMarket] = useState([]);
  const [showMarketFilter, setShowMarketFilter] = useState(false);
  const [filterProduct, setFilterProduct] = useState([]);
  const [showProductFilter, setShowProductFilter] = useState(false);
  const [filterStatus, setFilterStatus] = useState([]);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [filterCheckResult, setFilterCheckResult] = useState([]);
  const [showCheckResultFilter, setShowCheckResultFilter] = useState(false);
  const [checkResultFilterSearchText, setCheckResultFilterSearchText] = useState('');
  const [filterSaleStaff, setFilterSaleStaff] = useState([]);
  const [showSaleStaffFilter, setShowSaleStaffFilter] = useState(false);
  const [saleStaffFilterSearchText, setSaleStaffFilterSearchText] = useState('');
  const [filterMktStaff, setFilterMktStaff] = useState([]);
  const [showMktStaffFilter, setShowMktStaffFilter] = useState(false);
  const [mktStaffFilterSearchText, setMktStaffFilterSearchText] = useState('');
  const [filterDeliveryStaff, setFilterDeliveryStaff] = useState([]);
  const [showDeliveryStaffFilter, setShowDeliveryStaffFilter] = useState(false);
  const [deliveryStaffFilterSearchText, setDeliveryStaffFilterSearchText] = useState('');
  /** Facebook/Page… — cột «Page» (page_name) */
  const [filterPageNames, setFilterPageNames] = useState([]);
  const [showPageFilter, setShowPageFilter] = useState(false);
  const [pageFilterSearchText, setPageFilterSearchText] = useState('');
  /** payment_status_detail — cột «Trạng thái thu tiền» */
  const [filterPaymentCollectionStatus, setFilterPaymentCollectionStatus] = useState([]);
  const [showPaymentCollectionFilter, setShowPaymentCollectionFilter] = useState(false);
  const [paymentCollectionFilterSearchText, setPaymentCollectionFilterSearchText] = useState('');
  // Không giới hạn ngày mặc định - lấy toàn bộ
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [billSyncStartDate, setBillSyncStartDate] = useState('');
  const [billSyncEndDate, setBillSyncEndDate] = useState('');
  const [cuocSyncStartDate, setCuocSyncStartDate] = useState('');
  const [cuocSyncEndDate, setCuocSyncEndDate] = useState('');


  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [syncing, setSyncing] = useState(false); // State for sync process
  /** Chỉ HCM: tra cứu `orders` (team chứa HCM), theo Từ/Đến ngày trên trang — modal xem, không ghi DB. */
  const [isFetchingOrdersHcmLookaside, setIsFetchingOrdersHcmLookaside] = useState(false);
  const [isFillingHcmFromOrdersLookaside, setIsFillingHcmFromOrdersLookaside] = useState(false);
  const [hcmOrdersLookasideOpen, setHcmOrdersLookasideOpen] = useState(false);
  const [hcmOrdersLookasideRows, setHcmOrdersLookasideRows] = useState([]);
  const [selectedRowId, setSelectedRowId] = useState(null); // For copy feature
  /** Bôi đỏ dòng trùng bộ ba Name* / Phone* / Add trong phạm vi filteredData */
  const [highlightDupNamePhoneAdd, setHighlightDupNamePhoneAdd] = useState(false);
  const [deleting, setDeleting] = useState(false); // State for delete all process
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyOrderCode, setHistoryOrderCode] = useState(null);
  const [historyTableRows, setHistoryTableRows] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  /** Checkbox để chọn nhiều dòng */
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showBulkAccountantModal, setShowBulkAccountantModal] = useState(false);
  const [bulkAccountantValue, setBulkAccountantValue] = useState('');
  const [bulkAccountantSearchText, setBulkAccountantSearchText] = useState('');
  const [accountantOptions, setAccountantOptions] = useState([]);
  const [savingBulkAccountant, setSavingBulkAccountant] = useState(false);

  /** Can thiệp sửa cột NV vận đơn (delivery_staff) từng đơn */
  const [showEditNvVanDonModal, setShowEditNvVanDonModal] = useState(false);
  const [editNvVanDonRow, setEditNvVanDonRow] = useState(null);
  const [editNvVanDonValue, setEditNvVanDonValue] = useState('');
  const [nvVanDonOptions, setNvVanDonOptions] = useState([]);
  const [loadingNvVanDonOptions, setLoadingNvVanDonOptions] = useState(false);
  const [savingNvVanDon, setSavingNvVanDon] = useState(false);
  /** Tên NV vận đơn chuẩn từ master (users/HR/danh_sach_van_don) — luôn có trong dropdown lọc chia vận đơn */
  const [vanDonStaffMasterNames, setVanDonStaffMasterNames] = useState([]);

  const defaultColumns = [
    'Mã đơn hàng',
    'Ngày lên đơn',
    'Name*',
    'Phone*',
    'Địa chỉ',
    'Khu vực',
    'Tên mặt hàng 1',
    'Số lượng mặt hàng 1',
    'Loại tiền thanh toán',
    'Ca',
    'Mã Tracking',
    'Đội/Team',
    'Trạng thái giao hàng',
    'Trạng thái giao hàng NB',
    'Phí cước',
    'Trạng thái thu tiền',
    'Trạng thái thanh toán',
    'Tiền Việt đã đối soát',
    'Ngày đối soát bill',
    'Ngày đối soát cước',
    'Tổng tiền VNĐ',
  ];

  // Debounce search text for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterPageNames, filterPaymentCollectionStatus]);

  useEffect(() => {
    setCurrentPage(1);
  }, [billSyncStartDate, billSyncEndDate, cuocSyncStartDate, cuocSyncEndDate]);

  // Get all available columns from data (excluding hidden columns and technical columns)
  const allAvailableColumns = useMemo(() => {
    // Get all potential keys from data
    const allKeys = new Set();

    if (allData.length > 0) {
      allData.forEach(row => {
        Object.keys(row).forEach(key => {
          // Exclude PRIMARY_KEY_COLUMN, HIDDEN_COLUMNS, and technical columns starting with _
          if (key !== PRIMARY_KEY_COLUMN &&
            !HIDDEN_COLUMNS.includes(key) &&
            !key.startsWith('_')) {
            allKeys.add(key);
          }
        });
      });
    }

    // Đảm bảo các cột mặc định luôn có trong danh sách, ngay cả khi không có trong dữ liệu
    defaultColumns.forEach(col => {
      if (!HIDDEN_COLUMNS.includes(col)) {
        allKeys.add(col);
      }
    });

    // Strategy:
    // 1. Start Defaults: Defaults excluding pinned ones
    // 2. Other/Dynamic Cols: Alphabetic sort
    // 3. End Cols: Pinned ones (Status, Total)

    const pinnedEndColumns = ['Trạng thái giao hàng', 'Tổng tiền VNĐ'];

    const startDefaults = defaultColumns
      .filter(col => !pinnedEndColumns.includes(col) && allKeys.has(col));

    const otherCols = Array.from(allKeys)
      .filter(key => !defaultColumns.includes(key))
      .sort();

    const endCols = pinnedEndColumns.filter(col => allKeys.has(col));

    return [...startDefaults, ...otherCols, ...endCols];
  }, [allData, defaultColumns.join('|')]);

  // Default columns

  // Load column visibility from localStorage or use defaults
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('danhSachDon_visibleColumns');
    let initial = {};

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Remove any columns that are no longer available
        Object.keys(parsed).forEach(col => {
          // Only keep columns that are not in HIDDEN_COLUMNS
          if (!HIDDEN_COLUMNS.includes(col)) {
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

  // Clean up hidden columns from visibleColumns and ensure default columns exist
  useEffect(() => {
    setVisibleColumns(prev => {
      let updated = { ...prev };
      let changed = false;

      // Remove any hidden columns
      HIDDEN_COLUMNS.forEach(col => {
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

      return changed ? updated : prev;
    });
  }, [defaultColumns.join('|')]);

  // Save to localStorage when visibleColumns changes (excluding hidden columns)
  useEffect(() => {
    if (Object.keys(visibleColumns).length > 0) {
      // Clean up: remove any columns that are no longer available
      const toSave = {};
      Object.keys(visibleColumns).forEach(col => {
        if (!HIDDEN_COLUMNS.includes(col)) {
          toSave[col] = visibleColumns[col];
        }
      });
      localStorage.setItem('danhSachDon_visibleColumns', JSON.stringify(toSave));
    }
  }, [visibleColumns]);

  // Master NV vận đơn cho dropdown lọc "chia vận đơn" (không phụ thuộc đơn đã gán delivery_staff)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchVanDonStaffNameList(supabase);
        if (!cancelled) setVanDonStaffMasterNames(list);
      } catch (e) {
        console.warn('DanhSachDon: tải master NV vận đơn cho bộ lọc:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load danh sách giá trị accountant_confirm hiện có
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from(ordersTableName)
          .select('accountant_confirm')
          .not('accountant_confirm', 'is', null)
          .neq('accountant_confirm', '');

        if (error) throw error;

        const uniqueValues = [...new Set((data || []).map(r => r.accountant_confirm).filter(Boolean))];
        if (!cancelled) setAccountantOptions(uniqueValues.sort());
      } catch (e) {
        console.warn('Lỗi tải danh sách kế toán:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ordersTableName]);

  // Helper: Map Supabase DB row to UI format
  const mapSupabaseToUI = (item) => ({
    "Mã đơn hàng": item.order_code,
    "Ngày lên đơn": item.order_date || item.created_at?.split('T')[0],
    "Name*": item.customer_name,
    "Phone*": item.customer_phone,
    "Địa chỉ": item.customer_address,
    "Thành phố": item.city,
    "Tỉnh/Bang": item.state,
    "Khu vực": item.country, // Lấy từ country
    "Mã bưu điện": item.zipcode,
    "Mặt hàng": item.product,
    /** Chuẩn DB: payment_currency; fallback payment_type (dữ liệu cũ) — cùng quy tắc NhapDonMoi.readPaymentCurrencyFromOrderRow */
    "Loại tiền thanh toán": String(
      item.payment_currency ?? item.paymentCurrency ?? item.payment_type ?? ''
    ).trim(),
    "Tên mặt hàng 1": item.product_name_1 || item.product,
    "Số lượng mặt hàng 1": item.quantity_1 ?? item.item_qty_1 ?? '',
    "Tên mặt hàng 2": item.product_name_2 ?? item.item_name_2 ?? '',
    "Số lượng mặt hàng 2": item.quantity_2 ?? item.item_qty_2 ?? '',
    "Tổng tiền VNĐ": item.total_amount_vnd,
    /** Dùng nội bộ: công thức lên đơn = sale_price * exchange_rate (không hiện trong picker nếu không thêm vào cột) */
    _sale_price: item.sale_price,
    _exchange_rate: item.exchange_rate,
    "Hình thức thanh toán": item.payment_method_text || item.payment_method, // payment_method_text is new
    "Mã Tracking": item.tracking_code,
    "Nhân viên Marketing": item.marketing_staff || item.marketingStaff || '',
    "Nhân viên Sale": item.sale_staff || item.saleStaff || '',
    "Đội/Team": item.team,
    "Trạng thái giao hàng": item.delivery_status,
    "Trạng thái giao hàng NB": item.delivery_status_nb,
    /** Cột DB `check_result` — dùng cho bộ lọc Kết quả Check (không gộp payment_status). */
    check_result: String(item.check_result ?? '').trim(),
    "Kết quả Check": item.check_result || item.payment_status, // Hiển thị lưới: ưu tiên check_result, fallback payment_status
    "Ghi chú": item.note,
    "CSKH": item.cskh,
    "NV Vận đơn": item.delivery_staff,
    // F3 summary phải bám đúng số đối soát VNĐ; không fallback reconciled_amount để tránh lấy nhầm số cũ.
    "Tiền Việt đã đối soát": item.reconciled_vnd ?? 0,
    "Số tiền của đơn hàng đã về TK Cty": item.reconciled_amount ?? 0,
    "Ngày đối soát bill": item.ngay_doi_soat_bill || '',
    "Ngày đối soát cước": item.ngay_doi_soat_cuoc || '',
    "Đơn vị vận chuyển": item.shipping_unit || item.shipping_carrier, // shipping_carrier might be new?
    "Kế toán xác nhận thu tiền về": item.accountant_confirm,
    "Trạng thái thu tiền": item.payment_status_detail,
    "Trạng thái thanh toán": item.payment_status,
    "Lý do": item.reason,
    // Đối soát cước trả về shipping_cost => hiển thị bằng tên "Phí cước".
    "Phí cước": item.shipping_cost ?? item.shipping_fee,
    // Giữ alias cũ "Phí ship" cho tương thích nếu đã bật ở localStorage trước đó.
    "Phí ship": item.shipping_cost ?? item.shipping_fee,
    "Tên Page": item.page_name, // Map Page Name
    "Ca": (() => {
      const stored = normalizeCaShiftDisplay(item.shift ?? item.ca ?? '');
      if (stored) return stored;
      return inferCaShiftFromDateTime(item.created_at || item.order_date);
    })(),
    "Trạng thái Bill": item.payment_bill, // Trạng thái bill
    "Ảnh thanh toán": item.payment_image, // Link hình ảnh bill
    "Cảnh báo trùng": item.canh_bao || '',
    _id: item.id,
    _log: item.log ?? null,
    // Note: _id and technical keys excluded from column picker via allAvailableColumns filter
  });

  // Modified loadData to use cache
  const loadData = async (forceReload = false) => {
    setLoading(true);
    setLoadingProgress(0);
    try {
      console.log(`Loading data from ${ordersTableName}...`);

      // Cache key phải bao gồm cả ngày tháng và nhân sự để đảm bảo tính chính xác
      const cacheKey = `${ordersTableName}_${startDate}_${endDate}_${selectedPersonnelNames.join(',')}`;

      // Kiểm tra cache trước - Cache key phải bao gồm cả ngày tháng và nhân sự để đảm bảo tính chính xác
      if (!forceReload && dataCache[cacheKey]) {
        console.log(`✅ Sử dụng cache cho ${cacheKey}`);
        setAllData(dataCache[cacheKey]);
        setLoading(false);
        return;
      }

      // --- TESTING MODE CHECK ---
      try {
        const settings = localStorage.getItem('system_settings');
        if (settings) {
          const parsed = JSON.parse(settings);
          if (parsed.dataSource === 'test') {
            console.log("🔶 [TEST MODE] Loading Mock Data for Order List");

            const mockOrders = [
              {
                order_code: "TEST-001",
                order_date: new Date().toISOString(),
                customer_name: "Nguyễn Văn Test",
                customer_phone: "0901234567",
                customer_address: "123 Đường Test, Q1",
                city: "Hồ Chí Minh",
                country: "Miền Nam",
                product: "Sản phẩm A",
                total_amount_vnd: 500000,
                delivery_status: "ĐANG GIAO",
                payment_status: "Chưa thanh toán"
              },
              {
                order_code: "TEST-002",
                order_date: new Date(Date.now() - 86400000).toISOString(),
                customer_name: "Trần Thị Test",
                customer_phone: "0909876543",
                customer_address: "456 Phố Mẫu, HN",
                city: "Hà Nội",
                country: "Miền Bắc",
                product: "Sản phẩm B",
                total_amount_vnd: 1200000,
                delivery_status: "GIAO THÀNH CÔNG",
                payment_status: "Đã thanh toán"
              },
              {
                order_code: "TEST-003",
                order_date: new Date(Date.now() - 172800000).toISOString(),
                customer_name: "Lê Văn Mẫu",
                customer_phone: "0911223344",
                customer_address: "789 Đường Demo, ĐN",
                city: "Đà Nẵng",
                country: "Miền Trung",
                product: "Combo C",
                total_amount_vnd: 2500000,
                delivery_status: "HOÀN",
                payment_status: "Có bill"
              }
            ];

            const mappedMock = mockOrders.map(mapSupabaseToUI);
            setAllData(mappedMock);
            setLoading(false);
            return; // EXIT EARLY
          }
        }
      } catch (e) {
        console.warn("Error checking test mode:", e);
      }
      // --------------------------

      setLoadingProgress(10);

      // 1. Fetch Supabase Data
      const userJson = localStorage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;
      const userName = localStorage.getItem("username") || user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || user?.username || user?.name || "";

      setLoadingProgress(20);

      // Giữ scope dữ liệu nhất quán với /van-don:
      // - HCM: chỉ lấy team HCM (tránh lẫn dữ liệu nhánh khác)
      // - Mặc định: dùng teamFilter hiện tại (nếu có)
      const effectiveTeamFilter = isHcmView ? 'HCM' : teamFilter;

      const mergedRaw = await fetchDanhSachDonMergedRawOrders({
        supabaseClient: supabase,
        ordersTableName,
        startDate,
        endDate,
        teamFilter: effectiveTeamFilter,
        isAdmin,
        selectedPersonnelNames,
        userName,
        selectColumns: '*',
        // Không bỏ implicit filters ở HCM để vẫn áp ngày + scope team đúng nguồn
        skipImplicitFilters: false,
      });

      setLoadingProgress(70);

      // 2. Process Supabase Data
      const supaMapped = mergedRaw.map(mapSupabaseToUI);

      setLoadingProgress(85);

      // 3. Sort by Date Descending (Client side sort for display)
      supaMapped.sort((a, b) => {
        const dateA = parseSmartDate(a["Ngày lên đơn"]);
        const dateB = parseSmartDate(b["Ngày lên đơn"]);
        return (dateB || 0) - (dateA || 0);
      });

      setLoadingProgress(95);

      console.log(`✅ Loaded: ${supaMapped.length} orders from ${ordersTableName}`);

      // Lưu vào cache
      setDataCache(prev => ({
        ...prev,
        [cacheKey]: supaMapped,
        // Giữ thêm cache theo tên bảng để tab Tổng hợp luôn lấy đúng nhánh dữ liệu.
        [ordersTableName]: supaMapped,
      }));

      setAllData(supaMapped);
      setLoadingProgress(100);

    } catch (error) {
      console.error('Load data error:', error);
      alert(`❌ Lỗi tải dữ liệu: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const inferPaymentCurrencyFromArea = (areaRaw) => {
    const s = String(areaRaw ?? '').trim();
    if (!s) return '';
    const n = s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

    if (n === 'us' || n.includes('u.s') || n.includes('usa') || n.includes('my')) return 'USD';
    if (n.includes('nhat') || n.includes('cd nhat')) return 'JPY';
    if (n.includes('han quoc') || n.includes('korea')) return 'KRW';
    if (n.includes('canada')) return 'CAD';
    if (n.includes('uc') || n.includes('australia')) return 'AUD';
    if (n.includes('anh') || n.includes('uk') || n.includes('england')) return 'GBP';
    return 'VND';
  };

  const handleAutoFillPaymentCurrencyFromArea = async () => {
    const rows = filteredData || [];
    if (rows.length === 0) {
      toast.info('Không có đơn nào để xử lý.', { autoClose: 1500, hideProgressBar: true });
      return;
    }

    const rowsToUpdate = rows
      .map((r) => {
        const orderCode = String(r?.['Mã đơn hàng'] ?? '').trim();
        const existing = String(r?.['Loại tiền thanh toán'] ?? '').trim();
        if (!orderCode) return null;
        if (existing) return null; // chỉ điền khi đang trống
        const currency = inferPaymentCurrencyFromArea(r?.['Khu vực']);
        if (!currency) return null;
        return { orderCode, currency };
      })
      .filter(Boolean);

    if (rowsToUpdate.length === 0) {
      toast.info('Tất cả đơn đang hiển thị đã có "Loại tiền thanh toán".', { autoClose: 2000, hideProgressBar: true });
      return;
    }

    const preview = rowsToUpdate
      .slice(0, 10)
      .map((x) => `${x.orderCode} → ${x.currency}`)
      .join('\n');

    if (
      !window.confirm(
        `Tự điền "Loại tiền thanh toán" theo "Khu vực" cho các đơn đang hiển thị (chỉ các đơn đang trống).\n\nSẽ cập nhật: ${rowsToUpdate.length} đơn.\n\nVí dụ:\n${preview}${rowsToUpdate.length > 10 ? '\n…' : ''}`
      )
    ) {
      return;
    }

    setIsFillingPaymentCurrency(true);
    try {
      let success = 0;
      const chunkSize = 10;
      for (let i = 0; i < rowsToUpdate.length; i += chunkSize) {
        const chunk = rowsToUpdate.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (u) => {
            const { error } = await supabase
              .from(ordersTableName)
              .update({ payment_currency: u.currency })
              .eq('order_code', u.orderCode);
            if (!error) success++;
          })
        );
      }

      // Update local UI state immediately
      const byCode = new Map(rowsToUpdate.map((u) => [u.orderCode, u.currency]));
      setAllData((prev) =>
        (prev || []).map((r) => {
          const code = String(r?.['Mã đơn hàng'] ?? '').trim();
          const currency = byCode.get(code);
          if (!currency) return r;
          return { ...r, 'Loại tiền thanh toán': currency };
        })
      );

      toast.success(`✅ Đã tự điền Loại tiền thanh toán: ${success}/${rowsToUpdate.length} đơn`, {
        autoClose: 2500,
        hideProgressBar: true,
      });
    } catch (err) {
      console.error('Auto fill payment currency error:', err);
      toast.error(`❌ Lỗi tự điền Loại tiền thanh toán: ${err?.message || String(err)}`);
    } finally {
      setIsFillingPaymentCurrency(false);
    }
  };

  /** Tổng tiền VNĐ = 0 hoặc trống → tính lại theo NhapDonMoi: sale_price × exchange_rate. Không đụng dòng đã có tổng ≠ 0. */
  const handleRecalculateZeroTotalVnd = async () => {
    const rows = filteredData || [];
    if (rows.length === 0) {
      toast.info('Không có đơn nào trong bộ lọc hiện tại.', { autoClose: 1500, hideProgressBar: true });
      return;
    }

    // Lấy tỷ giá mới nhất từ bảng exchange_rates
    const { data: exchangeRatesData, error: ratesError } = await supabase
      .from('exchange_rates')
      .select('ti_gia, gia_tri');

    if (ratesError) {
      console.error('Error fetching exchange rates:', ratesError);
      toast.error('Không thể lấy tỷ giá từ hệ thống');
      return;
    }

    // Map tỷ giá theo loại tiền tệ
    const exchangeRatesMap = {};
    (exchangeRatesData || []).forEach((rate) => {
      exchangeRatesMap[rate.ti_gia.toUpperCase()] = rate.gia_tri;
    });

    const rowsToUpdate = rows
      .map((r) => {
        const orderCode = String(r?.['Mã đơn hàng'] ?? '').trim();
        if (!orderCode) return null;

        const rawTotal = r?.['Tổng tiền VNĐ'];
        const cur = parseVietnameseMoneyToNumber(
          rawTotal === '' || rawTotal == null ? null : rawTotal
        );
        const isZeroLike = cur === null || cur === 0;
        if (!isZeroLike) return null;

        const salePrice = parseFloat(r._sale_price) || 0;
        if (salePrice <= 0) return null;

        // Lấy loại tiền tệ từ payment_type hoặc payment_currency
        const paymentType = String(r?.['Hình thức thanh toán'] || r?.payment_type || '').toUpperCase().trim();
        const paymentCurrency = String(r?.payment_currency || '').toUpperCase().trim();

        // Xác định loại tiền tệ (USD, AUD, CAD, JPY/YEN, etc.)
        let currency = null;
        for (const curr of ['USD', 'AUD', 'CAD', 'JPY', 'YEN', 'GBP', 'KRW']) {
          if (paymentType.includes(curr) || paymentCurrency.includes(curr)) {
            currency = curr === 'YEN' ? 'JPY' : curr; // Normalize YEN to JPY
            break;
          }
        }

        // Nếu không phải ngoại tệ, dùng tỷ giá cũ từ DB
        let newExchangeRate = parseFloat(r._exchange_rate) || 1;

        // Nếu là ngoại tệ, lấy tỷ giá mới từ exchange_rates
        if (currency && exchangeRatesMap[currency]) {
          newExchangeRate = exchangeRatesMap[currency];
        }

        const newTotal = salePrice * newExchangeRate;
        if (!Number.isFinite(newTotal) || newTotal === 0) return null;

        return {
          orderCode,
          newTotal,
          newExchangeRate,
          currency,
          salePrice
        };
      })
      .filter(Boolean);

    if (rowsToUpdate.length === 0) {
      toast.info(
        'Không có đơn thỏa điều kiện: Tổng tiền VNĐ = 0 (hoặc trống) và có Giá bán × Tỷ giá > 0 trên hệ thống.',
        { autoClose: 4000, hideProgressBar: true }
      );
      return;
    }

    // Hiển thị thông tin chi tiết về tỷ giá sẽ dùng
    const currencySummary = rowsToUpdate.reduce((acc, u) => {
      if (u.currency) {
        acc[u.currency] = (acc[u.currency] || 0) + 1;
      }
      return acc;
    }, {});

    const currencyInfo = Object.entries(currencySummary)
      .map(([curr, count]) => `${curr}: ${count} đơn (tỷ giá ${exchangeRatesMap[curr]?.toLocaleString('vi-VN')})`)
      .join('\n');

    if (
      !window.confirm(
        'Tính lại "Tổng tiền VNĐ" theo công thức lên đơn: Giá bán (ngoại tệ) × Tỷ giá MỚI NHẤT.\n\n' +
        'Chỉ cập nhật các đơn đang hiển thị có Tổng tiền VNĐ = 0 hoặc trống.\n' +
        'Đơn đã có tổng tiền khác 0 sẽ không bị thay đổi.\n\n' +
        `Số đơn sẽ cập nhật: ${rowsToUpdate.length}\n\n` +
        (currencyInfo ? `Tỷ giá sẽ áp dụng:\n${currencyInfo}\n\n` : '') +
        'Lưu ý: Cả exchange_rate và total_amount_vnd sẽ được cập nhật.'
      )
    ) {
      return;
    }

    setIsRecalculatingZeroTotalVnd(true);
    try {
      let success = 0;
      const chunkSize = 10;
      for (let i = 0; i < rowsToUpdate.length; i += chunkSize) {
        const chunk = rowsToUpdate.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (u) => {
            const { error } = await supabase
              .from(ordersTableName)
              .update({
                total_amount_vnd: u.newTotal,
                exchange_rate: u.newExchangeRate,
                total_vnd: u.newTotal,
                tong_tien_vnd: u.newTotal
              })
              .eq('order_code', u.orderCode);
            if (!error) success++;
          })
        );
      }

      const byCode = new Map(rowsToUpdate.map((u) => [u.orderCode, u.newTotal]));
      setAllData((prev) =>
        (prev || []).map((r) => {
          const code = String(r?.['Mã đơn hàng'] ?? '').trim();
          const nt = byCode.get(code);
          if (nt === undefined) return r;
          return { ...r, 'Tổng tiền VNĐ': nt };
        })
      );

      toast.success(`Đã tính lại Tổng tiền VNĐ với tỷ giá mới: ${success}/${rowsToUpdate.length} đơn`, {
        autoClose: 2500,
        hideProgressBar: true,
      });
    } catch (err) {
      console.error('Recalculate total_amount_vnd error:', err);
      toast.error(`Lỗi tính lại Tổng tiền VNĐ: ${err?.message || String(err)}`);
    } finally {
      setIsRecalculatingZeroTotalVnd(false);
    }
  };

  /**
   * Trùng khách: cùng SĐT hoặc tên hoặc địa chỉ (rule NhapDonMoi).
   * Thứ tự “lần 1 / lần 2”: sắp theo Ngày lên đơn (order_date) tăng dần, tie-break created_at.
   * Chỉ ghi orders.canh_bao cho đơn từ lần 2 trở đi trong cùng nhóm trùng.
   */
  const handleApplyCanhBaoTrungDon = async () => {
    if (isApplyingCanhBaoTrung) return;

    try {
      const settings = localStorage.getItem('system_settings');
      if (settings) {
        const parsed = JSON.parse(settings);
        if (parsed.dataSource === 'test') {
          toast.info('Đang ở chế độ test — không ghi cột canh_bao.', { autoClose: 2500, hideProgressBar: true });
          return;
        }
      }
    } catch {
      /* ignore */
    }

    const normStart = String(startDate || '').trim();
    const normEnd = String(endDate || '').trim();
    if (!normStart || !normEnd) {
      toast.error('Vui lòng chọn Từ ngày và Đến ngày.', { autoClose: 2500, hideProgressBar: true });
      return;
    }

    if (
      !window.confirm(
        'Áp dụng cảnh báo trùng vào cột canh_bao (Cảnh báo trùng) trên database?\n\n' +
        '• Phạm vi: cùng Từ/Đến ngày và cùng bộ lọc team/nhân sự như khi tải danh sách.\n' +
        '• Rule trùng: cùng SĐT HOẶC cùng tên HOẶC cùng địa chỉ (chuẩn hóa giống trang nhập đơn).\n' +
        '• Thứ tự: Ngày lên đơn (order_date) sớm hơn = lần 1; cùng ngày thì created_at sớm hơn = lần 1.\n' +
        '• Chỉ các đơn từ lần 2 trở đi trong nhóm được ghi canh_bao (danh sách mã đơn trước đó trong nội dung).\n' +
        '• Đơn “lần 1” không bị xóa/ghi đè canh_bao bởi thao tác này.\n\n' +
        'Tiếp tục?'
      )
    ) {
      return;
    }

    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    const userName =
      localStorage.getItem('username') ||
      user?.['Họ_và_tên'] ||
      user?.['Họ và tên'] ||
      user?.['Tên'] ||
      user?.username ||
      user?.name ||
      '';

    setIsApplyingCanhBaoTrung(true);
    try {
      const mergedRaw = await fetchDanhSachDonMergedRawOrders({
        supabaseClient: supabase,
        ordersTableName,
        startDate: normStart,
        endDate: normEnd,
        teamFilter,
        isAdmin,
        selectedPersonnelNames,
        userName,
        selectColumns:
          'order_code, order_date, created_at, customer_phone, customer_name, customer_address, sale_staff',
        skipImplicitFilters: isHcmView,
      });

      const updates = computeCanhBaoUpdatesForDuplicateCustomers(mergedRaw);
      if (updates.length === 0) {
        toast.success('Không có nhóm trùng (SĐT/tên/địa chỉ) trong phạm vi đã tải.', {
          autoClose: 3000,
          hideProgressBar: true,
        });
        return;
      }

      let success = 0;
      const chunkSize = 12;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map((u) =>
            supabase.from(ordersTableName).update({ canh_bao: u.canh_bao }).eq('order_code', u.order_code)
          )
        );
        const err = results.find((r) => r.error)?.error;
        if (err) throw err;
        success += chunk.length;
      }

      toast.success(`Đã cập nhật canh_bao cho ${success} đơn (cảnh báo trùng).`, {
        autoClose: 3500,
        hideProgressBar: true,
      });
      await loadData();
    } catch (err) {
      console.error('Apply canh_bao trùng error:', err);
      toast.error(`Lỗi ghi cảnh báo trùng: ${err?.message || String(err)}`);
    } finally {
      setIsApplyingCanhBaoTrung(false);
    }
  };

  // Load selected personnel names for current user (giờ lưu TÊN, không phải email)
  useEffect(() => {
    const loadSelectedPersonnel = async () => {
      try {
        // Lấy userEmail từ localStorage (được set khi login)
        const userEmail = localStorage.getItem("userEmail") || "";

        console.log('🔍 Current userEmail:', userEmail);

        if (!userEmail) {
          console.warn('⚠️ Không tìm thấy userEmail trong localStorage');
          setSelectedPersonnelEmails([]);
          setSelectedPersonnelNames([]);
          setPersonnelEmailToNameMap({});
          setSelectedPersonnelLoaded(true);
          return;
        }

        const userEmailLower = userEmail.toLowerCase().trim();
        console.log('📧 Loading selected personnel for:', userEmailLower);

        // Get selected personnel (giờ là TÊN, không phải email)
        const personnelMap = await rbacService.getSelectedPersonnel([userEmailLower]);
        const personnelNames = personnelMap[userEmailLower] || [];

        console.log('📋 Personnel map from DB:', personnelMap);
        console.log('👥 Selected personnel names (TÊN):', personnelNames);

        if (personnelNames.length === 0) {
          console.log('ℹ️ Không có nhân sự nào được chọn trong cột "Nhân sự"');
          setSelectedPersonnelEmails([]);
          setSelectedPersonnelNames([]);
          setPersonnelEmailToNameMap({});
          setSelectedPersonnelLoaded(true);
          return;
        }

        // Lọc chỉ lấy tên hợp lệ (không phải email)
        const validNames = personnelNames.filter(name => {
          const nameStr = String(name).trim();
          return nameStr.length > 0 && !nameStr.includes('@');
        });

        console.log('📝 Valid personnel names:', validNames);
        console.log('✅ Đã load', validNames.length, 'nhân sự');

        // Giờ selectedPersonnelNames chứa tên trực tiếp từ DB
        setSelectedPersonnelEmails([]); // Không dùng email nữa
        setSelectedPersonnelNames(validNames);
        setPersonnelEmailToNameMap({}); // Không cần map nữa
        setSelectedPersonnelLoaded(true);
      } catch (error) {
        console.error('❌ Error loading selected personnel:', error);
        setSelectedPersonnelEmails([]);
        setSelectedPersonnelNames([]);
        setPersonnelEmailToNameMap({});
        setSelectedPersonnelLoaded(true);
      }
    };

    loadSelectedPersonnel();
  }, []); // Load once on mount

  useEffect(() => {
    if (!selectedPersonnelLoaded) return;
    if (activeTab === 'f3_summary') return;
    loadData();
  }, [startDate, endDate, role, selectedPersonnelNames.join('|'), selectedPersonnelLoaded, activeTab]); // reload khi filter nhân sự đổi

  // Reload khi chuyển đổi bảng (sử dụng cache nếu có)
  useEffect(() => {
    if (activeTab === 'f3_summary') return; // Không load orders cho tab summary
    if (!selectedPersonnelLoaded) return;

    if (dataCache[ordersTableName]) {
      setAllData(dataCache[ordersTableName]);
    }
  }, [activeTab, selectedPersonnelLoaded, dataCache, ordersTableName]);

  // Route /du-lieu-f3-hcm chỉ dùng nguồn HCM, không cho drift sang RD.
  useEffect(() => {
    if (!isHcmDataSource) return;
    if (activeTab === 'rd') {
      setActiveTab('hcm');
    }
  }, [activeTab, isHcmDataSource]);

  // Get unique values for filters - Bao gồm cả giá trị trống
  const uniqueMarkets = useMemo(() => {
    const markets = new Set();
    let hasEmpty = false;
    allData.forEach(row => {
      const market = row["Khu vực"] || row["khu vực"];
      if (market && String(market).trim()) {
        markets.add(String(market).trim());
      } else {
        hasEmpty = true;
      }
    });
    const sortedMarkets = Array.from(markets).sort();
    // Thêm "Trống" vào đầu danh sách nếu có giá trị trống
    if (hasEmpty) {
      return ['(Trống)', ...sortedMarkets];
    }
    return sortedMarkets;
  }, [allData]);

  // Sync data from F3 Firebase
  const handleSyncF3 = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn đồng bộ dữ liệu từ F3 (Firebase) về Supabase?\n\nLưu ý: Chỉ thêm dữ liệu MỚI (chưa có), KHÔNG ghi đè dữ liệu đã tồn tại.")) return;

    try {
      setSyncing(true);
      const F3_URL = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json";
      console.log("Fetching F3 data from:", F3_URL);

      const response = await fetch(F3_URL);
      const dataRaw = await response.json();

      let firebaseData = [];
      if (Array.isArray(dataRaw)) {
        firebaseData = dataRaw;
      } else if (dataRaw && typeof dataRaw === 'object') {
        firebaseData = Object.values(dataRaw);
      }

      if (firebaseData.length === 0) {
        alert("Không tìm thấy dữ liệu trên F3.");
        return;
      }

      console.log(`Found ${firebaseData.length} records.`);

      // DEBUG: Show first item structure to verify keys
      const firstItem = firebaseData[0];
      const sampleKeys = Object.keys(firstItem).join(", ");
      console.log("First item keys:", sampleKeys);
      // alert(`Debug keys: ${sampleKeys}`); // Uncomment if you need to see this in UI

      // Prepare batch data
      const batchSize = 50;
      let successCount = 0;
      let errorCount = 0;
      let lastError = null;
      const skippedDuplicateCodes = [];

      for (let i = 0; i < firebaseData.length; i += batchSize) {
        const batch = firebaseData.slice(i, i + batchSize);
        const transformedBatch = batch.map((item, index) => {
          // Parse date helper
          // Parse date helper with support for multiple formats
          let dateRaw = item["Ngày lên đơn"] || item["Ngày_lên_đơn"];
          let orderDate = null;
          if (dateRaw) {
            try {
              if (dateRaw.includes("/")) {
                let [p1, p2, p3] = dateRaw.split("/");
                // Check if parts are valid numbers
                let d = parseInt(p1);
                let m = parseInt(p2);
                let y = parseInt(p3);

                if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
                  // Handle case where format is MM/DD/YYYY (m > 12 is impossible for month)
                  // If 2nd part > 12, it must be Day -> so 1st part is Month.
                  if (m > 12) {
                    const temp = d; d = m; m = temp;
                  }
                  // Also simply swap if d is clearly month (>12 impossible) 
                  // But wait, if d > 12, d is definitely day. m must be month.
                  // Standard assumption: p1=Day, p2=Month. 
                  // If p2 > 12 (invalid month), then swap? No, if p2 > 12 it CANNOT be month.
                  // So p2 is Day, p1 is Month.

                  // Validate final components
                  if (m > 0 && m <= 12 && d > 0 && d <= 31) {
                    orderDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  }
                }
              } else if (dateRaw.includes("-")) {
                const d = new Date(dateRaw);
                if (!isNaN(d.getTime())) {
                  orderDate = d.toISOString();
                }
              }
            } catch (e) {
              console.warn("Date parse error", dateRaw);
            }
          }

          // Handle amount with various key formats
          const rawAmount = item["Tổng tiền VNĐ"] || item["Tổng_tiền_VNĐ"] || "0";
          const rawShip = item["Phí ship"] || item["Phí_ship"] || "0";
          const rawGoodsAmount = item["Tiền Hàng"] || item["Tiền_Hàng"] || "0";
          const rawReconciled = item["Tiền Việt đã đối soát"] || item["Tiền_Việt_đã_đối_soát"] || "0";
          const rawShift = item["Ca"] || item["ca"] || item["Shift"] || item["shift"] || "";

          const amount = parseVietnameseMoneyToNumber(rawAmount) || 0;
          const ship = parseVietnameseMoneyToNumber(rawShip);
          const goodsAmount = parseVietnameseMoneyToNumber(rawGoodsAmount) || 0;
          const reconciled = parseVietnameseMoneyToNumber(rawReconciled) || 0;

          return {
            order_code: item["Mã đơn hàng"] || item["Mã_đơn_hàng"] || `UNK-${Date.now()}-${i + index}`,
            order_date: orderDate,
            customer_name: item["Name"] || item["Name*"] || "",
            customer_phone: item["Phone"] || item["Phone*"] || "",
            customer_address: item["Add"] || "",
            city: item["City"] || "",
            state: item["State"] || "",
            zipcode: item["Zipcode"] || "",
            country: item["Khu vực"] || item["Khu_vực"] || "",
            product: item["Mặt hàng"] || item["Mặt_hàng"] || item["Tên mặt hàng 1"] || "",
            total_amount_vnd: amount,
            payment_method: item["Hình thức thanh toán"] || item["Hình_thức_thanh_toán"] || "",
            payment_currency: item["Loại tiền thanh toán"] || item["Loại_tiền_thanh_toán"] || item["payment_currency"] || "",
            tracking_code: item["Mã Tracking"] || item["Mã_Tracking"] || "",
            shipping_fee: ship,
            marketing_staff: item["Nhân viên Marketing"] || item["Nhân_viên_Marketing"] || "",
            sale_staff: item["Nhân viên Sale"] || item["Nhân_viên_Sale"] || "",
            shift: normalizeIncomingShiftForSave(rawShift, dateRaw || orderDate),
            team: item["Team"] || "",
            delivery_status: item["Trạng thái giao hàng"] || item["Trạng_thái_giao_hàng_NB"] || item["Trạng_thái_giao_hàng"] || "",
            check_result: item["Kết quả Check"] || item["Kết_quả_Check"] || "", // Map vào check_result thay vì payment_status
            payment_status: item["Kết quả Check"] || item["Kết_quả_Check"] || "", // Giữ lại để backward compatibility
            note: item["Ghi chú"] || item["Ghi_chú"] || "",

            // New extended columns
            cskh: item["CSKH"] || "",
            delivery_staff: item["NV_Vận_đơn"] || item["NV Vận đơn"] || "",
            goods_amount: goodsAmount,
            reconciled_vnd: reconciled,
            general_fee: parseVietnameseMoneyToNumber(item["Phí_Chung"] || item["Phí Chung"] || "0") || 0,
            flight_fee: parseVietnameseMoneyToNumber(item["Phí_bay"] || item["Phí bay"] || "0") || 0,
            account_rental_fee: parseVietnameseMoneyToNumber(item["Thuê_TK"] || item["Thuê TK"] || "0") || 0,
            cutoff_time: item["Thời_gian_cutoff"] || item["Thời gian cutoff"] || "",
            shipping_unit: item["Đơn_vị_vận_chuyển"] || item["Đơn vị vận chuyển"] || "",
            accountant_confirm: item["Kế_toán_xác_nhận_thu_tiền_về"] || item["Kế toán xác nhận thu tiền về"] || "",
            payment_status_detail: item["Trạng_thái_thu_tiền"] || item["Trạng thái thu tiền"] || "",
            reason: item["Lý_do"] || item["Lý do"] || ""
          };
        });

        const codesInBatch = [
          ...new Set(transformedBatch.map((t) => String(t.order_code ?? '').trim()).filter(Boolean)),
        ];
        const existingInDb = new Set();
        for (const codeChunk of chunkArray(codesInBatch, 200)) {
          if (codeChunk.length === 0) continue;
          const { data: existingRows, error: exErr } = await supabase
            .from('orders')
            .select('order_code')
            .in('order_code', codeChunk);
          if (exErr) throw exErr;
          (existingRows || []).forEach((r) => {
            if (r?.order_code != null) existingInDb.add(String(r.order_code).trim());
          });
        }

        const toInsert = transformedBatch.filter((t) => {
          const code = String(t.order_code ?? '').trim();
          if (!code) return false;
          return !existingInDb.has(code);
        });
        transformedBatch.forEach((t) => {
          const code = String(t.order_code ?? '').trim();
          if (code && existingInDb.has(code)) skippedDuplicateCodes.push(code);
        });

        const toInsertUnique = [...new Map(toInsert.map((t) => [String(t.order_code ?? '').trim(), t])).values()];

        if (toInsertUnique.length === 0) {
          continue;
        }

        const { error } = await supabase
          .from('orders')
          .upsert(toInsertUnique, { onConflict: 'order_code', ignoreDuplicates: true });

        if (error) {
          console.error("Batch error:", error);
          if (!lastError) lastError = error;
          errorCount += toInsertUnique.length;
        } else {
          successCount += toInsertUnique.length;

          const userEmail = localStorage.getItem('userEmail') || 'system_sync';
          const validLogEntries = toInsertUnique.map((newItem) => ({
            action: 'SYNC_F3',
            table_name: 'orders',
            record_id: newItem.order_code,
            user_email: userEmail,
            old_value: null,
            new_value: JSON.stringify(newItem),
            details: {
              note: `Đồng bộ đơn mới: Trạng thái "${newItem.delivery_status || ''}"`,
              orderCode: newItem.order_code,
            },
          }));

          Promise.all(validLogEntries.map((entry) => logDataChange(entry))).catch((err) =>
            console.error('Logging sync error', err)
          );
        }
      }

      const dupUnique = [...new Set(skippedDuplicateCodes)];
      const dupPreview =
        dupUnique.length > 40 ? `${dupUnique.slice(0, 40).join(', ')}… (+${dupUnique.length - 40} mã)` : dupUnique.join(', ');

      let msg =
        `Đồng bộ hoàn tất!\n` +
        `• Đã gửi chèn mới (upsert): ${successCount} dòng\n` +
        `• Bỏ qua (trùng Mã đơn hàng đã có trong DB): ${dupUnique.length} mã`;
      if (dupUnique.length > 0) {
        msg += `\n\nMã bỏ qua:\n${dupPreview}`;
      }
      msg += `\n\nLỗi xử lý batch: ${errorCount}`;
      if (lastError) {
        msg += `\n\nChi tiết lỗi cuối: ${lastError.message || JSON.stringify(lastError)}`;
      }
      if (dupUnique.length > 0) {
        toast.info(`Đã bỏ qua ${dupUnique.length} mã đơn trùng (đã tồn tại).`, { autoClose: 6000, hideProgressBar: true });
      }
      alert(msg);
      loadData(); // Reload table

    } catch (error) {
      console.error("Sync error:", error);
      alert("Lỗi quá trình đồng bộ: " + error.message);
    } finally {
      setSyncing(false);
    }
  };

  // --- FEATURE: FIX MISSING TEAMS ---
  /** Khóa khớp tên NV Sale ↔ users.name (bỏ dấu, gộp khoảng trắng). */
  const normalizeStaffNameKey = (s) =>
    String(s ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');

  const handleFixMissingTeams = async () => {
    if (
      !window.confirm(
        "Bạn có muốn tự động sửa Team và Nhân viên Sale cho các đơn đang thiếu Team không?\n\n" +
        "• Team: khớp tên sale trên đơn với users.name → ghi users.team; nếu trống thì users.branch (không dùng team cũ trên đơn).\n" +
        "• Nhân viên Sale: ghi đúng users.name (chuẩn master), không giữ biến thể tên từ đơn."
      )
    )
      return;

    setIsFixingTeams(true);
    try {
      // 1. Fetch orders with missing team
      const { data: ordersMissing, error: fetchError } = await supabase
        .from(ordersTableName)
        .select('id, sale_staff')
        .or('team.is.null,team.eq.,team.eq.-,team.eq.""');

      if (fetchError) throw fetchError;

      if (!ordersMissing || ordersMissing.length === 0) {
        alert("✅ Không tìm thấy đơn hàng nào bị thiếu thông tin Team.");
        return;
      }

      console.log(`Found ${ordersMissing.length} orders detecting missing team.`);

      const staffNames = [...new Set(ordersMissing.map(o => o.sale_staff).filter(Boolean).map(s => s.trim()))];

      if (staffNames.length === 0) {
        alert("⚠️ Các đơn thiếu Team đều không có tên Nhân viên Sale, không thể tự sửa.");
        return;
      }

      const { data: users, error: userError } = await supabase
        .from('users')
        .select('name, team, branch')
        .not('name', 'is', null);

      if (userError) throw userError;

      const userMap = {};
      (users || []).forEach((u) => {
        const rawName = String(u.name || '').trim();
        if (!rawName) return;
        const teamVal = String(u.team ?? '').trim();
        const branchVal = String(u.branch ?? '').trim();
        const resolvedTeam = teamVal || branchVal;
        if (!resolvedTeam) return;
        const key = normalizeStaffNameKey(rawName);
        if (key) userMap[key] = { resolvedTeam, canonicalName: rawName };
      });

      const updates = [];

      for (const order of ordersMissing) {
        const saleName = order.sale_staff ? order.sale_staff.trim() : "";
        if (!saleName) continue;

        const match = userMap[normalizeStaffNameKey(saleName)];
        if (match) {
          updates.push({
            id: order.id,
            team: match.resolvedTeam,
            sale_staff: match.canonicalName,
          });
        }
      }

      if (updates.length === 0) {
        alert(
          "⚠️ Không gán được Team/Sale: kiểm tra users — khớp tên với «Nhân viên Sale» và user phải có ít nhất team hoặc branch."
        );
        return;
      }

      console.log(`Updating ${updates.length} orders...`);

      let success = 0;
      const chunkSize = 10;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (row) => {
            const { error } = await supabase
              .from(ordersTableName)
              .update({ team: row.team, sale_staff: row.sale_staff })
              .eq('id', row.id);
            if (!error) success++;
          })
        );
      }

      alert(
        `✅ Đã cập nhật xong!\n` +
        `- Tìm thấy: ${ordersMissing.length} đơn thiếu Team.\n` +
        `- Cập nhật Team + Nhân viên Sale (theo users): ${success} đơn.\n` +
        `- Không khớp user / thiếu team+branch trên user: ${ordersMissing.length - success} đơn.`
      );
    } catch (err) {
      console.error('Error fixing teams:', err);
      alert(`❌ Lỗi: ${err.message}`);
    } finally {
      setIsFixingTeams(false);
      loadData();
    }
  };

  /**
   * Chỉ /danh-sach-don-hcm: đọc bảng `orders` (không phải order_code_hcm).
   * Team: cột team chứa "HCM" (ilike, vd. CSKH-HCM, HCM-Sale đêm).
   * Ngày: theo Từ/Đến ngày trên trang + đơn order_date null nhưng created_at trong khoảng.
   * Mở modal bảng — không ghi DB.
   */
  const handlePreviewOrdersHcmFromMainTable = useCallback(async () => {
    if (!isHcmView) return;
    if (!startDate || !endDate) {
      toast.warning('Chọn đủ «Từ ngày» và «Đến ngày» ở bộ lọc phía dưới, rồi bấm lại.', {
        autoClose: 5000,
        hideProgressBar: true,
      });
      return;
    }
    setIsFetchingOrdersHcmLookaside(true);
    try {
      const selectCols = 'id, order_code, order_date, team, customer_name, customer_phone, sale_staff, created_at';
      const fetchPaged = async (buildQuery, applyOrder) => {
        const all = [];
        let from = 0;
        for (let page = 0; page < 500; page++) {
          let q = buildQuery();
          q = applyOrder(q);
          const { data, error } = await q.range(from, from + ORDERS_PAGE_SIZE - 1);
          if (error) throw error;
          const chunk = data || [];
          all.push(...chunk);
          if (chunk.length < ORDERS_PAGE_SIZE) break;
          from += ORDERS_PAGE_SIZE;
        }
        return all;
      };

      const orderByOd = (q) => q.order('order_date', { ascending: false }).order('order_code', { ascending: false });
      const orderByCreated = (q) => q.order('created_at', { ascending: false }).order('order_code', { ascending: false });

      const withTeamHcm = () => {
        let q = supabase.from('orders').select(selectCols).ilike('team', '%HCM%');
        if (startDate) q = q.gte('order_date', startDate);
        if (endDate) q = q.lte('order_date', endDate);
        return q;
      };

      const mainRows = await fetchPaged(withTeamHcm, orderByOd);

      let extraNullOd = [];
      const { start: cStart, end: cEnd } = orderRangeToCreatedAtIsoBounds(startDate, endDate);
      if (cStart && cEnd) {
        const withTeamHcmNullOd = () => {
          let q = supabase
            .from('orders')
            .select(selectCols)
            .ilike('team', '%HCM%')
            .is('order_date', null)
            .gte('created_at', cStart)
            .lte('created_at', cEnd);
          return q;
        };
        extraNullOd = await fetchPaged(withTeamHcmNullOd, orderByCreated);
      }

      const seen = new Set();
      const merged = [];
      for (const r of [...mainRows, ...extraNullOd]) {
        const code = r?.order_code != null && String(r.order_code).trim() !== '' ? String(r.order_code).trim() : '';
        const key = code || `__id_${r?.id ?? Math.random()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(r);
      }

      merged.sort((a, b) => {
        const ta = a?.order_date ? String(a.order_date) : String(a?.created_at ?? '');
        const tb = b?.order_date ? String(b.order_date) : String(b?.created_at ?? '');
        return tb.localeCompare(ta);
      });

      console.log('[DanhSachDon HCM] orders (team %HCM%, khoảng ngày trang):', merged);
      setHcmOrdersLookasideRows(merged);
      setHcmOrdersLookasideOpen(true);
      if (merged.length > 0) {
        toast.success(`Tìm thấy ${merged.length} dòng trong bảng orders (team chứa HCM). Xem bảng bật lên.`, {
          autoClose: 4000,
          hideProgressBar: true,
        });
      } else {
        toast.info(
          'Không có dòng nào trong bảng orders: team chứa «HCM» trong khoảng ngày đã chọn. Thử mở rộng Từ/Đến ngày hoặc kiểm tra RLS/team trên DB.',
          { autoClose: 7000, hideProgressBar: true }
        );
      }
    } catch (err) {
      console.error('Preview orders HCM:', err);
      toast.error(`Lỗi tra cứu bảng orders: ${err?.message || String(err)}`);
    } finally {
      setIsFetchingOrdersHcmLookaside(false);
    }
  }, [isHcmView, startDate, endDate]);

  /** Modal HCM: chèn từ `orders` → `order_code_hcm` (giữ cùng id). Ưu tiên kiểm tra mã: trùng Mã đơn trên HCM → không chèn nhưng xóa orders; trùng id (mã không trùng) → không chèn, giữ orders; chèn mới → xóa orders. */
  const handleFillHcmFromOrdersLookaside = async () => {
    if (!isHcmView || !hcmOrdersLookasideRows.length) return;
    if (
      !window.confirm(
        'Chuyển các dòng đang xem từ bảng orders sang order_code_hcm?\n\n' +
        '• Trùng Mã đơn hàng đã có trên order_code_hcm → không chèn, nhưng vẫn xóa dòng đó ở orders.\n' +
        '• Trùng id trên HCM (mã không trùng như vậy) → không chèn, giữ orders.\n' +
        '• Chèn mới thành công → xóa khỏi orders.'
      )
    ) {
      return;
    }
    setIsFillingHcmFromOrdersLookaside(true);
    try {
      const IN_CHUNK = 100;
      const preview = hcmOrdersLookasideRows;
      const ids = [...new Set(preview.map((r) => r.id).filter(Boolean))];
      const fullById = new Map();
      for (const idChunk of chunkArray(ids, IN_CHUNK)) {
        const { data, error } = await supabase.from('orders').select('*').in('id', idChunk);
        if (error) throw error;
        (data || []).forEach((row) => {
          if (row?.id != null) fullById.set(row.id, row);
        });
      }

      const orderedFull = [];
      const couldNotLoad = [];
      for (const pr of preview) {
        let full = pr.id != null ? fullById.get(pr.id) : null;
        if (!full && pr.order_code) {
          const code = String(pr.order_code).trim();
          const { data: one, error: e1 } = await supabase
            .from('orders')
            .select('*')
            .eq('order_code', code)
            .maybeSingle();
          if (e1) throw e1;
          full = one;
        }
        if (full) orderedFull.push(full);
        else couldNotLoad.push(String(pr.order_code ?? pr.id ?? '?'));
      }

      if (couldNotLoad.length) {
        toast.warning(`Không tải được ${couldNotLoad.length} dòng từ orders.`, { autoClose: 5000, hideProgressBar: true });
      }

      const ordersRowIds = [...new Set(orderedFull.map((r) => r.id).filter((x) => x != null))];
      const existingHcmIds = new Set();
      for (const idChunk of chunkArray(ordersRowIds, 150)) {
        if (!idChunk.length) continue;
        const { data: exId, error: eId } = await supabase.from('order_code_hcm').select('id').in('id', idChunk);
        if (eId) throw eId;
        (exId || []).forEach((r) => {
          if (r?.id != null) existingHcmIds.add(r.id);
        });
      }

      const codes = orderedFull.map((r) => String(r.order_code ?? '').trim()).filter(Boolean);
      const existingHcm = new Set();
      for (const ch of chunkArray(codes, 150)) {
        if (!ch.length) continue;
        const { data: ex, error: e2 } = await supabase.from('order_code_hcm').select('order_code').in('order_code', ch);
        if (e2) throw e2;
        (ex || []).forEach((r) => existingHcm.add(String(r.order_code).trim()));
      }

      const skippedDupCodeDeleteOrders = [];
      const skippedDupNoDelete = [];
      const orderIdsToDeleteFromOrders = [];
      const payloads = [];
      const payloadSourceIds = [];
      for (const row of orderedFull) {
        const code = String(row.order_code ?? '').trim();
        const oid = row.id;
        if (oid == null) {
          skippedDupNoDelete.push('(thiếu id)');
          continue;
        }
        if (!code) {
          skippedDupNoDelete.push('(trống mã)');
          continue;
        }
        if (existingHcm.has(code)) {
          skippedDupCodeDeleteOrders.push(`${code} (trùng mã HCM — đã xóa orders)`);
          orderIdsToDeleteFromOrders.push(oid);
          continue;
        }
        if (existingHcmIds.has(oid)) {
          skippedDupNoDelete.push(`id:${oid} (HCM đã có cùng id)`);
          continue;
        }
        payloads.push(cloneOrderRowForHcmInsert(row, { preserveId: true }));
        payloadSourceIds.push(oid);
      }

      let inserted = 0;
      for (const insChunk of chunkArray(payloads, 25)) {
        if (!insChunk.length) continue;
        const start = inserted;
        const sanitized = insChunk.map((p) => cloneOrderRowForHcmInsert(p, { preserveId: true }));
        const { error: insErr } = await supabase.from('order_code_hcm').insert(sanitized);
        if (insErr) throw insErr;
        inserted += insChunk.length;
        for (let i = 0; i < insChunk.length; i++) {
          orderIdsToDeleteFromOrders.push(payloadSourceIds[start + i]);
        }
      }

      let deletedOrders = 0;
      const uniqueDeleteIds = [...new Set(orderIdsToDeleteFromOrders)];
      for (const delChunk of chunkArray(uniqueDeleteIds, 50)) {
        if (!delChunk.length) continue;
        const { error: delErr } = await supabase.from('orders').delete().in('id', delChunk);
        if (delErr) throw delErr;
        deletedOrders += delChunk.length;
      }

      const dupCodeUnique = [...new Set(skippedDupCodeDeleteOrders)];
      const dupNoDelUnique = [...new Set(skippedDupNoDelete)];
      const dupCodePreview =
        dupCodeUnique.length > 45
          ? `${dupCodeUnique.slice(0, 45).join(', ')}… (+${dupCodeUnique.length - 45})`
          : dupCodeUnique.join(', ');
      const dupNoDelPreview =
        dupNoDelUnique.length > 45
          ? `${dupNoDelUnique.slice(0, 45).join(', ')}… (+${dupNoDelUnique.length - 45})`
          : dupNoDelUnique.join(', ');

      toast.success(
        `Điền HCM: chèn mới ${inserted} đơn; đã xóa ${deletedOrders} dòng trong orders (gồm cả trùng mã đã có trên HCM). Giữ orders: ${dupNoDelUnique.length} dòng (trùng id / trống mã / thiếu id).`,
        { autoClose: 6500, hideProgressBar: true }
      );
      if (dupCodeUnique.length > 0 || dupNoDelUnique.length > 0) {
        const parts = [];
        if (dupCodeUnique.length > 0) {
          parts.push(
            `Trùng Mã đơn trên HCM — không chèn, đã xóa orders (${dupCodeUnique.length} dòng):\n${dupCodePreview}`
          );
        }
        if (dupNoDelUnique.length > 0) {
          parts.push(
            `Bỏ qua, giữ orders — trùng id trên HCM, trống mã hoặc thiếu id (${dupNoDelUnique.length} dòng):\n${dupNoDelPreview}`
          );
        }
        window.alert(parts.join('\n\n'));
      }
      setHcmOrdersLookasideOpen(false);
      loadData();
    } catch (err) {
      console.error('Fill HCM from orders:', err);
      toast.error(`Lỗi điền sang order_code_hcm: ${err?.message || String(err)}`);
    } finally {
      setIsFillingHcmFromOrdersLookaside(false);
    }
  };

  /** Đổi Ca từ "Giữa ca" → "Giữa ca,Hết ca" trong cùng phạm vi team / nhân sự / ngày như Tải lại */
  const handleFixGiuaCaShift = async () => {
    if (
      !window.confirm(
        'Đổi trường Ca từ "Giữa ca" sang "Giữa ca,Hết ca" cho các đơn trong phạm vi lọc hiện tại (chi nhánh, nhân sự, khoảng ngày) giống khi bấm Tải lại?\n\nChỉ các đơn đang là đúng "Giữa ca" (không có dấu phẩy / Hết ca) mới được cập nhật.'
      )
    )
      return;

    setIsFixingShift(true);
    try {
      const userJson = localStorage.getItem('user');
      const user = userJson ? JSON.parse(userJson) : null;
      const userName =
        localStorage.getItem('username') ||
        user?.['Họ_và_tên'] ||
        user?.['Họ và tên'] ||
        user?.['Tên'] ||
        user?.username ||
        user?.name ||
        '';

      const normalizeNameForQuery = (str) => {
        if (!str) return '';
        return String(str).trim().replace(/\s+/g, ' ');
      };

      const applyTeamAndPersonnel = (q) => {
        let query = q;
        if (ordersTableName === 'orders') {
          // View mặc định /danh-sach-don: không hiển thị Team=HCM
          query = query.or('team.is.null,team.neq.HCM');
        }
        if (!isAdmin) {
          if (selectedPersonnelNames.length > 0) {
            const allNames = [...new Set([...selectedPersonnelNames, userName].filter(Boolean))];
            const orConditions = allNames.flatMap((name) => {
              const normalizedName = normalizeNameForQuery(name);
              return [
                `sale_staff.ilike.%${normalizedName}%`,
                `marketing_staff.ilike.%${normalizedName}%`,
                `delivery_staff.ilike.%${normalizedName}%`,
              ];
            });
            query = query.or(orConditions.join(','));
          } else if (userName) {
            const normalizedUserName = normalizeNameForQuery(userName);
            query = query.or(
              `sale_staff.ilike.%${normalizedUserName}%,marketing_staff.ilike.%${normalizedUserName}%,delivery_staff.ilike.%${normalizedUserName}%`
            );
          }
        }
        return query;
      };

      const PAGE = 1000;
      const toUpdateIds = new Set();

      const collectMatchingIds = (rows) => {
        for (const r of rows || []) {
          if (r?.id && isOnlyGiuaCaShift(r.shift)) toUpdateIds.add(r.id);
        }
      };

      let from = 0;
      while (true) {
        let q = applyTeamAndPersonnel(supabase.from(ordersTableName).select('id, shift'));
        if (startDate) q = q.gte('order_date', startDate);
        if (endDate) q = q.lte('order_date', endDate);
        const { data, error } = await q.order('order_date', { ascending: false }).range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        collectMatchingIds(batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }

      if (startDate && endDate) {
        const { start: cStart, end: cEnd } = orderRangeToCreatedAtIsoBounds(startDate, endDate);
        let qNull = applyTeamAndPersonnel(supabase.from(ordersTableName).select('id, shift'));
        qNull = qNull.is('order_date', null).gte('created_at', cStart).lte('created_at', cEnd);
        from = 0;
        while (true) {
          const { data: nb, error: ne } = await qNull
            .order('created_at', { ascending: false })
            .range(from, from + PAGE - 1);
          if (ne) {
            console.warn('⚠️ [Chỉnh ca] Không gộp được đơn order_date null:', ne.message);
            break;
          }
          const batch = nb || [];
          collectMatchingIds(batch);
          if (batch.length < PAGE) break;
          from += PAGE;
        }
      }

      const ids = [...toUpdateIds];
      if (ids.length === 0) {
        toast.info('Không có đơn nào có Ca = "Giữa ca" (thuần) trong phạm vi lọc.');
        return;
      }

      const chunkSize = 10;
      let success = 0;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (id) => {
            const { error } = await supabase.from(ordersTableName).update({ shift: SHIFT_GIUA_CA_HET_CA }).eq('id', id);
            if (!error) success++;
          })
        );
      }

      toast.success(`Đã cập nhật Ca → "${SHIFT_GIUA_CA_HET_CA}" cho ${success} đơn.`);
    } catch (err) {
      console.error('Chỉnh ca error:', err);
      toast.error(`Lỗi: ${err.message}`);
    } finally {
      setIsFixingShift(false);
      loadData();
    }
  };

  // Handle Delete All
  const handleDeleteAll = async () => {
    const confirm1 = window.confirm(
      "⚠️ CẢNH BÁO NGHIÊM TRỌNG!\n\n" +
      "Bạn sắp XÓA TOÀN BỘ dữ liệu đơn hàng trong hệ thống!\n\n" +
      "Hành động này KHÔNG THỂ HOÀN TÁC!\n\n" +
      "Nhấn OK để tiếp tục, hoặc Cancel để hủy."
    );

    if (!confirm1) return;

    const confirm2 = window.confirm(
      "⚠️ XÁC NHẬN LẦN CUỐI!\n\n" +
      "Bạn có chắc chắn muốn xóa TẤT CẢ đơn hàng?\n" +
      "Tất cả dữ liệu sẽ bị mất vĩnh viễn!\n\n" +
      "Nhập 'XÓA' vào ô bên dưới để xác nhận."
    );

    if (!confirm2) return;

    const userInput = window.prompt(
      "Nhập 'XÓA' để xác nhận xóa toàn bộ dữ liệu:"
    );

    if (userInput !== 'XÓA') {
      alert("Xác nhận không đúng. Hủy bỏ thao tác xóa.");
      return;
    }

    try {
      setDeleting(true);
      console.log('🗑️ Starting delete all orders...');

      // Try delete all first
      const { error } = await supabase
        .from(ordersTableName)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (hack for delete all)

      if (error) {
        console.log('⚠️ First delete method failed, trying batch delete...', error);

        // If the above doesn't work, try deleting by selecting all IDs first
        const { data: allRecords, error: fetchError } = await supabase
          .from(ordersTableName)
          .select('id')
          .limit(100000); // Increase limit for orders table

        if (fetchError) {
          console.error('❌ Error fetching order IDs:', fetchError);
          throw fetchError;
        }

        if (allRecords && allRecords.length > 0) {
          console.log(`📋 Found ${allRecords.length} orders to delete. Deleting in batches...`);
          const ids = allRecords.map(r => r.id);

          // Delete in batches
          const batchSize = 1000;
          let deletedCount = 0;

          for (let i = 0; i < ids.length; i += batchSize) {
            const batch = ids.slice(i, i + batchSize);
            const { error: batchError } = await supabase
              .from(ordersTableName)
              .delete()
              .in('id', batch);

            if (batchError) {
              console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} error:`, batchError);
              throw batchError;
            }

            deletedCount += batch.length;
            console.log(`✅ Deleted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} orders (Total: ${deletedCount}/${ids.length})`);
          }

          alert(`✅ Đã xóa toàn bộ ${deletedCount} đơn hàng thành công!`);
        } else {
          alert("ℹ️ Không có dữ liệu để xóa.");
        }
      } else {
        alert("✅ Đã xóa toàn bộ dữ liệu đơn hàng thành công!");
      }

      setAllData([]); // Clear local state
      loadData(); // Reload to refresh
    } catch (error) {
      console.error('❌ Delete all error:', error);
      alert(`❌ Lỗi xóa toàn bộ dữ liệu: ${error.message || String(error)}\n\nVui lòng kiểm tra Console để xem chi tiết.`);
    } finally {
      setDeleting(false);
    }
  };

  const formatHistoryCell = (v) => {
    if (v === null || v === undefined || v === '') return '(Trống)';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  const formatHistoryTime = (t) => {
    if (t == null || t === '') return '—';
    const d = new Date(t);
    if (!Number.isFinite(d.getTime())) return String(t);
    return d.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const buildUnifiedHistoryRows = (orderLogRaw, salesLogs) => {
    const rows = [];
    const jsonbEntries = parseOrderLogJsonb(orderLogRaw);
    jsonbEntries.forEach((e, i) => {
      const cot = e.cot != null && String(e.cot).trim() !== '' ? String(e.cot) : labelForOrderLogDbKey(e.cot_db);
      rows.push({
        id: `jsonb-${i}-${e.thoi_gian || ''}`,
        thoi_gian: e.thoi_gian || '',
        nhan_vien: e.nhan_vien != null ? String(e.nhan_vien) : '',
        cot,
        gia_tri_cu: formatHistoryCell(e.gia_tri_cu),
        gia_tri_moi: formatHistoryCell(e.gia_tri_moi),
      });
    });

    (salesLogs || []).forEach((log) => {
      const changes = getHistoryChanges(log.old_data, log.new_data);
      changes.forEach((ch, idx) => {
        rows.push({
          id: `sales-${log.id}-${ch.key}-${idx}`,
          thoi_gian: log.changed_at || '',
          nhan_vien: log.changed_by != null ? String(log.changed_by) : '',
          cot: ch.label,
          gia_tri_cu: formatHistoryCell(ch.old),
          gia_tri_moi: formatHistoryCell(ch.new),
        });
      });
    });

    rows.sort((a, b) => {
      const ta = new Date(a.thoi_gian).getTime();
      const tb = new Date(b.thoi_gian).getTime();
      const na = Number.isFinite(ta) ? ta : 0;
      const nb = Number.isFinite(tb) ? tb : 0;
      return nb - na;
    });
    return rows;
  };

  /** Bảng sales_order_logs có thể chưa tạo trên một số project — chỉ bỏ qua, vẫn dùng orders.log */
  const isSalesOrderLogsTableMissing = (err) => {
    if (!err) return false;
    const msg = String(err.message || err.details || '');
    return (
      msg.includes('sales_order_logs') ||
      (msg.includes('schema cache') && msg.includes('Could not find')) ||
      err.code === 'PGRST205'
    );
  };

  // Handle View History — chỉ admin thực sự (isAdminOnly); orders.log (JSONB) + sales_order_logs nếu có
  const handleViewHistory = async (orderCode, preloadedLog) => {
    if (!isAdminOnly) return;
    if (!orderCode || orderCode.startsWith('UNK-') || orderCode.startsWith('NO_CODE_')) {
      toast.error('Không thể xem lịch sử đơn hàng này vì thiếu mã đơn hàng');
      return;
    }

    setHistoryOrderCode(orderCode);
    setShowHistoryModal(true);
    setLoadingHistory(true);
    setHistoryTableRows([]);

    try {
      const logPromise =
        preloadedLog !== undefined && preloadedLog !== null
          ? Promise.resolve({ data: { log: preloadedLog }, error: null })
          : supabase.from(ordersTableName).select('log').eq('order_code', orderCode).maybeSingle();

      const [orderRes, salesRes] = await Promise.all([
        logPromise,
        supabase
          .from('sales_order_logs')
          .select('*')
          .eq('order_code', orderCode)
          .order('changed_at', { ascending: false }),
      ]);

      if (orderRes.error) throw orderRes.error;

      let salesLogs = [];
      if (salesRes.error) {
        if (isSalesOrderLogsTableMissing(salesRes.error)) {
          console.warn('[DanhSachDon] Bỏ qua sales_order_logs (bảng chưa có):', salesRes.error.message);
        } else {
          throw salesRes.error;
        }
      } else {
        salesLogs = salesRes.data || [];
      }

      const logRaw = orderRes.data?.log ?? null;
      const unified = buildUnifiedHistoryRows(logRaw, salesLogs);
      setHistoryTableRows(unified);
    } catch (error) {
      console.error('Error fetching history:', error);
      toast.error('Lỗi khi tải lịch sử chỉnh sửa: ' + error.message);
      setHistoryTableRows([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Helper to get changes from old and new data
  const getHistoryChanges = (oldData, newData) => {
    const changes = [];
    if (!oldData || !newData) return changes;

    Object.keys(newData).forEach(key => {
      // Skip metadata columns
      if (['updated_at', 'last_modified_by', 'created_at', 'id', 'order_time'].includes(key)) return;

      const oldVal = oldData[key];
      const newVal = newData[key];

      // Check if values are different
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        // Map database key to display name
        const displayKey = COLUMN_MAPPING[key] || key;
        changes.push({
          key,
          label: displayKey,
          old: oldVal,
          new: newVal
        });
      }
    });

    return changes;
  };

  // Handle Edit - Navigate to edit page
  const handleEdit = (orderCode) => {
    if (!orderCode || orderCode.startsWith('UNK-') || orderCode.startsWith('NO_CODE_')) {
      toast.error('Không thể chỉnh sửa đơn hàng này vì thiếu mã đơn hàng');
      return;
    }
    // Navigate to edit page (chinh-sua-don) with orderId in query params
    navigate(`/chinh-sua-don?orderId=${encodeURIComponent(orderCode)}`);
  };

  // Handle Bulk Update Accountant Confirm
  const handleBulkUpdateAccountant = () => {
    if (selectedRows.size === 0) {
      toast.warning('Vui lòng chọn ít nhất 1 đơn hàng');
      return;
    }
    setShowBulkAccountantModal(true);
  };

  const saveBulkAccountant = async () => {
    const valueToSave = bulkAccountantValue.trim();

    if (!valueToSave) {
      toast.warning('Vui lòng chọn hoặc nhập giá trị Kế toán xác nhận');
      return;
    }

    const selectedOrderCodes = Array.from(selectedRows).map(idx => {
      const row = filteredData[idx];
      return row?.['Mã đơn hàng'];
    }).filter(Boolean);

    if (selectedOrderCodes.length === 0) {
      toast.error('Không tìm thấy mã đơn hàng hợp lệ');
      return;
    }

    if (!window.confirm(
      `Cập nhật "Kế toán xác nhận thu tiền về" = "${valueToSave}" cho ${selectedOrderCodes.length} đơn?\n\n` +
      `Mã đơn: ${selectedOrderCodes.slice(0, 5).join(', ')}${selectedOrderCodes.length > 5 ? '...' : ''}`
    )) {
      return;
    }

    setSavingBulkAccountant(true);
    try {
      let successCount = 0;
      const chunkSize = 10;

      for (let i = 0; i < selectedOrderCodes.length; i += chunkSize) {
        const chunk = selectedOrderCodes.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map(code =>
            supabase
              .from(ordersTableName)
              .update({ accountant_confirm: valueToSave })
              .eq('order_code', code)
          )
        );

        const errors = results.filter(r => r.error);
        if (errors.length > 0) {
          console.error('Bulk update errors:', errors);
        }
        successCount += chunk.length - errors.length;
      }

      // Update local state
      setAllData(prev =>
        prev.map(row => {
          const code = row?.['Mã đơn hàng'];
          if (selectedOrderCodes.includes(code)) {
            return { ...row, 'Kế toán xác nhận thu tiền về': valueToSave };
          }
          return row;
        })
      );

      // Clear cache để reload lại
      setDataCache(prev => ({
        ...prev,
        [ordersTableName]: null
      }));

      toast.success(`✅ Đã cập nhật ${successCount}/${selectedOrderCodes.length} đơn`);
      setShowBulkAccountantModal(false);
      setBulkAccountantValue('');
      setBulkAccountantSearchText('');
      setSelectedRows(new Set());
    } catch (err) {
      console.error('Bulk update error:', err);
      toast.error(`Lỗi: ${err?.message || String(err)}`);
    } finally {
      setSavingBulkAccountant(false);
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const allIndices = new Set(filteredData.map((_, idx) => idx));
      setSelectedRows(allIndices);
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleSelectRow = (index, checked) => {
    const newSelected = new Set(selectedRows);
    if (checked) {
      newSelected.add(index);
    } else {
      newSelected.delete(index);
    }
    setSelectedRows(newSelected);
  };

  const openEditNvVanDonModal = async (row) => {
    const orderCode = row?.['Mã đơn hàng'];
    const codeStr = orderCode != null ? String(orderCode).trim() : '';
    if (!codeStr || codeStr.startsWith('UNK-') || codeStr.startsWith('NO_CODE_')) {
      toast.error('Không thể sửa NV vận đơn: thiếu mã đơn hợp lệ');
      return;
    }
    setEditNvVanDonRow(row);
    setEditNvVanDonValue(String(row['NV Vận đơn'] ?? row.delivery_staff ?? '').trim());
    setShowEditNvVanDonModal(true);
    setLoadingNvVanDonOptions(true);
    setNvVanDonOptions([]);
    try {
      const sorted = await fetchVanDonStaffNameList(supabase);
      setNvVanDonOptions(sorted);
      if (sorted.length === 0) {
        toast.warning(
          'Chưa có nhân sự bộ phận Vận đơn (kiểm tra users.department / human_resources."Bộ phận").',
          { autoClose: 5000 }
        );
      }
    } catch (e) {
      console.error('load nhân sự bộ phận Vận đơn cho modal NV vận đơn:', e);
      toast.warning('Không tải được danh sách nhân sự — thử lại sau.', { autoClose: 4000 });
      setNvVanDonOptions([]);
    } finally {
      setLoadingNvVanDonOptions(false);
    }
  };

  const closeEditNvVanDonModal = () => {
    setShowEditNvVanDonModal(false);
    setEditNvVanDonRow(null);
    setEditNvVanDonValue('');
    setNvVanDonOptions([]);
  };

  const saveEditNvVanDon = async () => {
    if (!editNvVanDonRow) return;
    const orderCode = String(editNvVanDonRow['Mã đơn hàng'] || '').trim();
    const rowId = editNvVanDonRow._id;
    const trimmed = String(editNvVanDonValue || '').trim();
    const newDb = trimmed || null;
    const oldStr = String(editNvVanDonRow['NV Vận đơn'] ?? editNvVanDonRow.delivery_staff ?? '').trim();
    const oldDb = oldStr || null;
    if (oldDb === newDb) {
      toast.info('Không có thay đổi.', { autoClose: 1500, hideProgressBar: true });
      closeEditNvVanDonModal();
      return;
    }
    setSavingNvVanDon(true);
    try {
      const payload = { delivery_staff: newDb };
      let error = null;
      if (orderCode && !orderCode.startsWith('UNK-') && !orderCode.startsWith('NO_CODE_')) {
        ({ error } = await supabase.from(ordersTableName).update(payload).eq('order_code', orderCode));
      } else if (rowId) {
        ({ error } = await supabase.from(ordersTableName).update(payload).eq('id', rowId));
      } else {
        throw new Error('Thiếu order_code hoặc id');
      }
      if (error) throw error;
      await logDataChange({
        action: 'UPDATE',
        table_name: 'orders',
        record_id: orderCode || String(rowId),
        field: 'delivery_staff',
        old_value: oldDb ?? '',
        new_value: newDb ?? '',
        details: { note: 'Sửa NV vận đơn (Danh sách đơn)', orderCode },
      });
      setAllData((prev) =>
        (prev || []).map((r) => {
          const c = String(r['Mã đơn hàng'] || '').trim();
          if (orderCode && c === orderCode) {
            return { ...r, 'NV Vận đơn': trimmed, delivery_staff: newDb };
          }
          if (rowId && r._id === rowId) {
            return { ...r, 'NV Vận đơn': trimmed, delivery_staff: newDb };
          }
          return r;
        })
      );
      toast.success('Đã cập nhật nhân viên vận đơn.', { autoClose: 2200, hideProgressBar: true });
      closeEditNvVanDonModal();
    } catch (err) {
      console.error('save NV vận đơn:', err);
      toast.error(err?.message || 'Lỗi khi lưu NV vận đơn');
    } finally {
      setSavingNvVanDon(false);
    }
  };

  // Handle Delete
  const handleDelete = async (orderCode, rowId) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa đơn hàng này? Hành động này không thể hoàn tác.")) return;

    try {
      setLoading(true);
      let error = null;

      if (orderCode && !orderCode.startsWith('UNK-') && !orderCode.startsWith('NO_CODE_')) {
        // Delete by order_code
        const res = await supabase.from(ordersTableName).delete().eq('order_code', orderCode);
        error = res.error;
      } else if (rowId) {
        // Delete by ID (fallback for orders without code)
        const res = await supabase.from(ordersTableName).delete().eq('id', rowId);
        error = res.error;
      } else {
        throw new Error("Không tìm thấy thông tin định danh để xóa (Mã đơn hoặc ID).");
      }

      if (error) throw error;

      alert("✅ Đã xóa đơn hàng thành công!");

      // Update local state directly instead of reloading
      setAllData(prev => prev.filter(item => {
        if (orderCode && item['Mã đơn hàng'] === orderCode) return false;
        if (rowId && item._id === rowId) return false;
        return true;
      }));
      setLoading(false);
    } catch (err) {
      console.error("Delete error:", err);
      alert(`❌ Lỗi xóa đơn hàng: ${err.message}`);
      setLoading(false);
    }
  };

  const uniqueProducts = useMemo(() => {
    const products = new Set();
    let hasEmpty = false;
    allData.forEach(row => {
      const product = row["Mặt hàng"];
      if (product && String(product).trim()) {
        products.add(String(product).trim());
      } else {
        hasEmpty = true;
      }
    });
    const sortedProducts = Array.from(products).sort();
    if (hasEmpty) {
      return ['(Trống)', ...sortedProducts];
    }
    return sortedProducts;
  }, [allData]);

  const uniqueStatuses = useMemo(() => {
    const statuses = new Set();
    let hasEmpty = false;
    allData.forEach(row => {
      const status = row["Trạng thái giao hàng"];
      if (status && String(status).trim()) {
        statuses.add(String(status).trim());
      } else {
        hasEmpty = true;
      }
    });
    const sortedStatuses = Array.from(statuses).sort();
    if (hasEmpty) {
      return ['(Trống)', ...sortedStatuses];
    }
    return sortedStatuses;
  }, [allData]);

  const uniqueCheckResults = useMemo(() => {
    const checkResults = new Set();
    let hasEmpty = false;
    allData.forEach((row) => {
      const s = getCheckResult(row);
      if (s) checkResults.add(s);
      else hasEmpty = true;
    });
    const sortedCheckResults = Array.from(checkResults).sort();
    if (hasEmpty) {
      return ['(Trống)', ...sortedCheckResults];
    }
    return sortedCheckResults;
  }, [allData]);

  const filteredCheckResults = useMemo(() => {
    const kw = String(checkResultFilterSearchText || '').trim().toLowerCase();
    if (!kw) return uniqueCheckResults;
    return uniqueCheckResults.filter((v) => String(v || '').toLowerCase().includes(kw));
  }, [checkResultFilterSearchText, uniqueCheckResults]);

  const uniquePageNames = useMemo(() => {
    const pages = new Set();
    let hasEmpty = false;
    allData.forEach((row) => {
      const p = row['Page'] ?? row.page_name;
      if (p != null && String(p).trim()) {
        pages.add(String(p).trim());
      } else {
        hasEmpty = true;
      }
    });
    const sorted = Array.from(pages).sort((a, b) => a.localeCompare(b, 'vi'));
    if (hasEmpty) return ['(Trống)', ...sorted];
    return sorted;
  }, [allData]);

  const filteredPageNames = useMemo(() => {
    const kw = String(pageFilterSearchText || '').trim().toLowerCase();
    if (!kw) return uniquePageNames;
    return uniquePageNames.filter((v) => String(v || '').toLowerCase().includes(kw));
  }, [pageFilterSearchText, uniquePageNames]);

  const uniquePaymentCollectionStatuses = useMemo(() => {
    const vals = new Set();
    let hasEmpty = false;
    allData.forEach((row) => {
      const v = row['Trạng thái thu tiền'] ?? row.payment_status_detail;
      if (v != null && String(v).trim()) {
        vals.add(String(v).trim());
      } else {
        hasEmpty = true;
      }
    });
    const sorted = Array.from(vals).sort((a, b) => a.localeCompare(b, 'vi'));
    if (hasEmpty) return ['(Trống)', ...sorted];
    return sorted;
  }, [allData]);

  const filteredPaymentCollectionStatuses = useMemo(() => {
    const kw = String(paymentCollectionFilterSearchText || '').trim().toLowerCase();
    if (!kw) return uniquePaymentCollectionStatuses;
    return uniquePaymentCollectionStatuses.filter((v) =>
      String(v || '').toLowerCase().includes(kw)
    );
  }, [paymentCollectionFilterSearchText, uniquePaymentCollectionStatuses]);

  const uniqueSaleStaff = useMemo(() => {
    const vals = new Set();
    allData.forEach(row => {
      const v = rowDisplaySaleStaff(row);
      if (v) vals.add(v);
    });
    return Array.from(vals).sort();
  }, [allData]);

  const filteredAccountantOptions = useMemo(() => {
    const kw = String(bulkAccountantSearchText || '').trim().toLowerCase();
    if (!kw) return accountantOptions;
    return accountantOptions.filter((v) => String(v || '').toLowerCase().includes(kw));
  }, [bulkAccountantSearchText, accountantOptions]);

  const filteredSaleStaff = useMemo(() => {
    const kw = String(saleStaffFilterSearchText || '').trim().toLowerCase();
    if (!kw) return uniqueSaleStaff;
    return uniqueSaleStaff.filter((v) => String(v || '').toLowerCase().includes(kw));
  }, [saleStaffFilterSearchText, uniqueSaleStaff]);

  const uniqueMktStaff = useMemo(() => {
    const vals = new Set();
    allData.forEach(row => {
      const v = rowDisplayMktStaff(row);
      if (v) vals.add(v);
    });
    return Array.from(vals).sort();
  }, [allData]);

  const filteredMktStaff = useMemo(() => {
    const kw = String(mktStaffFilterSearchText || '').trim().toLowerCase();
    if (!kw) return uniqueMktStaff;
    return uniqueMktStaff.filter((v) => String(v || '').toLowerCase().includes(kw));
  }, [mktStaffFilterSearchText, uniqueMktStaff]);

  const uniqueDeliveryStaff = useMemo(() => {
    const vals = new Set(vanDonStaffMasterNames || []);
    allData.forEach((row) => {
      const v = row['NV Vận đơn'] ?? row['Nhân viên Vận đơn'] ?? row.delivery_staff;
      if (v && String(v).trim()) vals.add(String(v).trim());
    });
    return Array.from(vals).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [allData, vanDonStaffMasterNames]);

  const filteredDeliveryStaff = useMemo(() => {
    const kw = String(deliveryStaffFilterSearchText || '').trim().toLowerCase();
    if (!kw) return uniqueDeliveryStaff;
    return uniqueDeliveryStaff.filter((v) => String(v || '').toLowerCase().includes(kw));
  }, [deliveryStaffFilterSearchText, uniqueDeliveryStaff]);

  /** Dropdown modal NV vận đơn: danh sách bộ phận Vận đơn + giá trị hiện tại nếu lệch. */
  const nvVanDonSelectOptions = useMemo(() => {
    const cur = String(editNvVanDonValue || '').trim();
    const set = new Set((nvVanDonOptions || []).filter(Boolean));
    if (cur) set.add(cur);
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [nvVanDonOptions, editNvVanDonValue]);

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = [...allData];

    // Bỏ bộ lọc cứng "Hà Nội" để hiển thị đầy đủ data từ các team khác (RD, MKT, ...)
    // if (!isHcmView) {
    //   data = data.filter((row) => {
    //     const raw = String(row["Team"] ?? row["Chi nhánh"] ?? '').trim().toLowerCase();
    //     return raw === 'hà nội' || raw === 'ha noi' || raw === 'hanoi';
    //   });
    // }

    // Filter by selected personnel (nếu có)
    // Admin KHÔNG bị filter, luôn xem tất cả đơn
    // Giờ selectedPersonnelNames chứa TÊN trực tiếp từ DB
    // Match với các cột: "Nhân viên Marketing", "Nhân viên Sale", "NV Vận đơn"
    if (!isAdmin && selectedPersonnelNames.length > 0) {
      const beforeFilter = data.length;
      let debugCount = 0;

      data = data.filter((row, index) => {
        const marketingStaff = rowDisplayMktStaff(row).toLowerCase();
        const salesStaff = rowDisplaySaleStaff(row).toLowerCase();
        const deliveryStaff = String(row["NV Vận đơn"] || row["Nhân viên Vận đơn"] || '').toLowerCase().trim();

        // Match theo tên (selectedPersonnelNames giờ là tên trực tiếp)
        const matchByName = selectedPersonnelNames.some(name => {
          const nameLower = name.toLowerCase().trim();
          // Match tên trong cột "Nhân viên Marketing" HOẶC "Nhân viên Sale" HOẶC "NV Vận đơn"
          return (marketingStaff && marketingStaff.includes(nameLower)) ||
            (salesStaff && salesStaff.includes(nameLower)) ||
            (deliveryStaff && deliveryStaff.includes(nameLower));
        });

        // Debug log cho 3 row đầu tiên
        if (debugCount < 3 && index < 10) {
          debugCount++;
          console.log('🔍 Row check:', {
            index,
            orderCode: row["Mã đơn hàng"],
            marketingStaff: marketingStaff || '(trống)',
            salesStaff: salesStaff || '(trống)',
            deliveryStaff: deliveryStaff || '(trống)',
            selectedNames: selectedPersonnelNames,
            matchByName,
            matched: matchByName
          });
        }

        return matchByName;
      });

      const afterFilter = data.length;
      console.log(`📊 Filter by personnel: ${beforeFilter} → ${afterFilter} đơn hàng`);
      console.log(`👥 Đang filter theo ${selectedPersonnelNames.length} tên nhân sự (Marketing/Sale/Vận đơn)`);
    } else {
      console.log('ℹ️ Không có selectedPersonnel, hiển thị tất cả đơn hàng');
    }

    // Search filter (using debounced value) - Tìm kiếm toàn diện thông tin khách hàng và nhân viên
    if (debouncedSearchText) {
      const searchLower = debouncedSearchText.toLowerCase();
      data = data.filter(row => {
        return (
          // Thông tin đơn hàng
          String(row["Mã đơn hàng"] || '').toLowerCase().includes(searchLower) ||
          String(row["Mã Tracking"] || '').toLowerCase().includes(searchLower) ||
          // Thông tin khách hàng - Tên
          String(row["Name*"] || '').toLowerCase().includes(searchLower) ||
          // Thông tin khách hàng - Số điện thoại
          String(row["Phone*"] || '').toLowerCase().includes(searchLower) ||
          // Thông tin khách hàng - Địa chỉ
          String(row["Add"] || '').toLowerCase().includes(searchLower) ||
          String(row["City"] || '').toLowerCase().includes(searchLower) ||
          String(row["State"] || '').toLowerCase().includes(searchLower) ||
          String(row["Zipcode"] || '').toLowerCase().includes(searchLower) ||
          // Khu vực
          String(row["Khu vực"] || '').toLowerCase().includes(searchLower) ||
          // Tên nhân viên - Marketing, Sale, CSKH, Vận đơn
          rowDisplayMktStaff(row).toLowerCase().includes(searchLower) ||
          rowDisplaySaleStaff(row).toLowerCase().includes(searchLower) ||
          String(row["CSKH"] || '').toLowerCase().includes(searchLower) ||
          String(row["NV Vận đơn"] || '').toLowerCase().includes(searchLower) ||
          // Team
          String(row["Team"] || '').toLowerCase().includes(searchLower)
        );
      });
    }

    // Date Range Filter (áp dụng cho cả view thường và HCM)
    if (startDate || endDate) {
      data = data.filter(row => isDateInRange(row["Ngày lên đơn"], startDate, endDate));
    }

    // Lọc theo ngày đồng bộ bill (ngày đối soát bill)
    if (billSyncStartDate || billSyncEndDate) {
      data = data.filter((row) =>
        isDateInRange(row['Ngày đối soát bill'], billSyncStartDate, billSyncEndDate)
      );
    }

    // Lọc theo ngày đồng bộ cước (ngày đối soát cước)
    if (cuocSyncStartDate || cuocSyncEndDate) {
      data = data.filter((row) =>
        isDateInRange(row['Ngày đối soát cước'], cuocSyncStartDate, cuocSyncEndDate)
      );
    }

    // Market filter - Hỗ trợ multi-select và giá trị trống
    if (filterMarket.length > 0) {
      data = data.filter(row => {
        const market = row["Khu vực"] || row["khu vực"];
        const marketStr = market ? String(market).trim() : '';

        // Kiểm tra nếu có chọn "(Trống)"
        if (filterMarket.includes('(Trống)')) {
          if (!marketStr) return true; // Nếu giá trị trống và đã chọn "(Trống)"
        }

        // Kiểm tra các giá trị khác
        return filterMarket.includes(marketStr);
      });
    }

    // Product filter - Hỗ trợ multi-select và giá trị trống
    if (filterProduct.length > 0) {
      data = data.filter(row => {
        const product = row["Mặt hàng"];
        const productStr = product ? String(product).trim() : '';

        if (filterProduct.includes('(Trống)')) {
          if (!productStr) return true;
        }

        return filterProduct.includes(productStr);
      });
    }

    // Status filter - Hỗ trợ multi-select và giá trị trống
    if (filterStatus.length > 0) {
      data = data.filter(row => {
        const status = row["Trạng thái giao hàng"];
        const statusStr = status ? String(status).trim() : '';

        if (filterStatus.includes('(Trống)')) {
          if (!statusStr) return true;
        }

        return filterStatus.includes(statusStr);
      });
    }

    // Check Result filter — chỉ theo cột DB check_result (không theo payment_status fallback trên cột hiển thị)
    if (filterCheckResult.length > 0) {
      data = data.filter((row) => {
        const checkResultStr = getCheckResult(row);

        if (filterCheckResult.includes('(Trống)')) {
          if (!checkResultStr) return true;
        }

        return filterCheckResult.includes(checkResultStr);
      });
    }

    // Sale Staff filter
    if (filterSaleStaff.length > 0) {
      data = data.filter(row => {
        const val = rowDisplaySaleStaff(row);
        return filterSaleStaff.includes(val);
      });
    }

    // MKT Staff filter
    if (filterMktStaff.length > 0) {
      data = data.filter(row => {
        const val = rowDisplayMktStaff(row);
        return filterMktStaff.includes(val);
      });
    }

    // Delivery Staff filter
    if (filterDeliveryStaff.length > 0) {
      data = data.filter(row => {
        const val = row["NV Vận đơn"] ? String(row["NV Vận đơn"]).trim() : '';
        return filterDeliveryStaff.includes(val);
      });
    }

    // Page (page_name) — multi-select + tìm trong dropdown
    if (filterPageNames.length > 0) {
      data = data.filter((row) => {
        const pageVal = row['Page'] ?? row.page_name;
        const pageStr = pageVal != null ? String(pageVal).trim() : '';
        if (filterPageNames.includes('(Trống)')) {
          if (!pageStr) return true;
        }
        return filterPageNames.includes(pageStr);
      });
    }

    // Trạng thái thu tiền (payment_status_detail)
    if (filterPaymentCollectionStatus.length > 0) {
      data = data.filter((row) => {
        const v = row['Trạng thái thu tiền'] ?? row.payment_status_detail;
        const s = v != null ? String(v).trim() : '';
        if (filterPaymentCollectionStatus.includes('(Trống)')) {
          if (!s) return true;
        }
        return filterPaymentCollectionStatus.includes(s);
      });
    }

    // Sort
    if (sortColumn) {
      data.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        // Specific handling for Date column sorting
        if (sortColumn === 'Ngày lên đơn') {
          const dA = parseSmartDate(aVal);
          const dB = parseSmartDate(bVal);
          if (!dA) return 1;
          if (!dB) return -1;
          return sortDirection === 'asc' ? dA - dB : dB - dA;
        }

        const comparison = String(aVal || '').localeCompare(String(bVal || ''), 'vi', { numeric: true });
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return data;
  }, [
    allData,
    debouncedSearchText,
    startDate,
    endDate,
    billSyncStartDate,
    billSyncEndDate,
    cuocSyncStartDate,
    cuocSyncEndDate,
    isAdmin,
    isHcmView,
    filterMarket,
    filterProduct,
    filterStatus,
    filterCheckResult,
    filterSaleStaff,
    filterMktStaff,
    filterDeliveryStaff,
    filterPageNames,
    filterPaymentCollectionStatus,
    sortColumn,
    sortDirection,
    selectedPersonnelNames,
    selectedPersonnelEmails,
    personnelEmailToNameMap,
  ]);

  const duplicateTripleKeysInFilter = useMemo(() => {
    const counts = new Map();
    for (const row of filteredData) {
      const k = tripleNamePhoneAddKey(row);
      if (!k) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const dup = new Set();
    for (const [k, n] of counts) {
      if (n >= 2) dup.add(k);
    }
    return dup;
  }, [filteredData]);

  // Format date — cùng logic lịch với isDateInRange (parseSmartDate), tránh lệch ±1 ngày do UTC của new Date(iso).
  const formatDate = useCallback((dateString) => {
    if (!dateString) return '';
    const d = parseSmartDate(dateString);
    if (!d || isNaN(d.getTime())) return String(dateString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }, []);

  /** Giá trị ô như trên lưới / Ctrl+C — dùng cho xuất Excel để khớp giao diện. */
  const getCellDisplayValueForRow = useCallback(
    (row, col, isExcel = false) => {
      const key = COLUMN_MAPPING[col] || col;
      let value = row[key] ?? row[col] ?? '';

      if (col.includes('Ngày')) {
        return formatDate(value);
      }

      // Danh sách các cột chứa dữ liệu số (Tiền, Số lượng) để xuất Excel dạng số
      const numericColumns = [
        'Tổng tiền VNĐ',
        'Phí cước',
        'Phí ship',
        'Tiền Việt đã đối soát',
        'Phí Chung',
        'Phí bay',
        'Phí xử lý đơn đóng hàng-Lưu kho(usd)',
        'Thuê TK',
        'Tiền Hàng',
        'Số lượng mặt hàng 1',
        'Số lượng mặt hàng 2',
        'reconciled_vnd',
        'total_amount_vnd'
      ];

      const isNumeric = numericColumns.includes(col);

      if (isNumeric) {
        const numValue = parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
        if (isExcel) return numValue; // Trả về số thực cho Excel
        
        // Trình bày cho Grid UI
        if (col.includes('Số lượng')) return numValue;
        return numValue.toLocaleString('vi-VN') + ' ₫';
      }

      if (col === 'Payment Image') {
        value = row['Payment Image'] ?? row.payment_image ?? value ?? '';
      }

      return String(value ?? '').replace(/\t/g, ' ').trim();
    },
    [formatDate]
  );

  // Handle Ctrl+C to copy selected row
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedRowId === null) return;

        const row = filteredData[selectedRowId];
        if (!row) return;

        e.preventDefault();

        const rowValues = displayColumns.map((col) => getCellDisplayValueForRow(row, col));

        const tsv = rowValues.join('\t');

        try {
          await navigator.clipboard.writeText(tsv);
          toast.success("📋 Đã sao chép dòng vào bộ nhớ tạm!", {
            autoClose: 2000,
            hideProgressBar: true,
          });
        } catch (err) {
          console.error('Copy failed:', err);
          toast.error("❌ Sao chép thất bại");
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRowId, filteredData, displayColumns, getCellDisplayValueForRow]);

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

  const handleExportExcelMaDonNamePhoneAdd = () => {
    const rows = filteredData || [];
    if (rows.length === 0) {
      toast.info('Không có đơn nào trong bộ lọc hiện tại để xuất.', {
        autoClose: 2000,
        hideProgressBar: true,
      });
      return;
    }
    const cols = displayColumns || [];
    if (cols.length === 0) {
      toast.info('Không có cột hiển thị để xuất — bật cột trong Cài đặt cột.', {
        autoClose: 2500,
        hideProgressBar: true,
      });
      return;
    }
    const exportRows = rows.map((row) => {
      const obj = {};
      for (const col of cols) {
        // null value: pass as null so Excel shows it as empty
        const val = getCellDisplayValueForRow(row, col, true);
        obj[col] = val;
      }
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TheoBoLoc');
    const stamp = new Date().toISOString().slice(0, 10);
    const suffix = activeTab === 'hcm' ? '_HCM' : '';
    XLSX.writeFile(wb, `DanhSachDon_theo_luoi_hien_thi${suffix}_${stamp}.xlsx`);
    toast.success(
      `Đã tải Excel: ${exportRows.length} dòng, ${cols.length} cột (theo bộ lọc và cột đang hiển thị).`,
      {
        autoClose: 2200,
        hideProgressBar: true,
      }
    );
  };

  // Copy single cell content (click)
  const handleCellClick = async (e, value) => {
    const textValue = String(value ?? '').trim();
    if (!textValue || textValue === '-') {
      toast.success("⚠️ Ô này không có nội dung", { autoClose: 1500, hideProgressBar: true });
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

  // Lọc các cột có thể hiển thị trong modal (loại bỏ các cột bị ẩn)
  const visibleColumnsInModal = useMemo(() => {
    return allAvailableColumns.filter(col => !HIDDEN_COLUMNS.includes(col));
  }, [allAvailableColumns]);

  // Handle column visibility toggle
  const toggleColumn = (column) => {
    // Không cho phép toggle các cột bị ẩn
    if (HIDDEN_COLUMNS.includes(column)) {
      return;
    }
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  // Select all columns (trừ các cột bị ẩn)
  const selectAllColumns = () => {
    const all = { ...visibleColumns };
    visibleColumnsInModal.forEach(col => {
      all[col] = true;
    });
    // Đảm bảo các cột bị ẩn luôn là false
    HIDDEN_COLUMNS.forEach(col => {
      all[col] = false;
    });
    setVisibleColumns(all);
  };

  // Deselect all columns (trừ các cột bị ẩn)
  const deselectAllColumns = () => {
    const none = { ...visibleColumns };
    visibleColumnsInModal.forEach(col => {
      none[col] = false;
    });
    // Đảm bảo các cột bị ẩn luôn là false
    HIDDEN_COLUMNS.forEach(col => {
      none[col] = false;
    });
    setVisibleColumns(none);
  };

  // Reset to default columns (trừ các cột bị ẩn)
  const resetToDefault = () => {
    const defaultCols = { ...visibleColumns };
    defaultColumns.forEach(col => {
      if (!HIDDEN_COLUMNS.includes(col)) {
        defaultCols[col] = true;
      }
    });
    // Đảm bảo các cột bị ẩn luôn là false
    HIDDEN_COLUMNS.forEach(col => {
      defaultCols[col] = false;
    });
    setVisibleColumns(defaultCols);
  };


  // --- F3 SUMMARY CALCULATION (DYNAMIC) ---
  const f3SummaryData = useMemo(() => {
    if (activeTab !== 'f3_summary') return null;
    // Tổng hợp phải bám theo nhánh màn hình hiện tại (HCM/HN), không phụ thuộc tab vừa xem trước đó.
    const cachedRows = Array.isArray(dataCache?.[baseSourceTable]) ? dataCache[baseSourceTable] : null;
    const summaryRows = cachedRows ?? (ordersTableName === baseSourceTable ? allData : []);

    const stats = {
      mkt: {},
      sales: {},
      delivery: {}
    };

    summaryRows.forEach(row => {
      const teamVal = String(row["Đội/Team"] || row.Team || row.team || '').trim().toUpperCase();
      // Trang mặc định loại HCM để không lẫn nhánh; trang HCM thì giữ dữ liệu theo nguồn hiện tại.
      if (!isHcmDataSource && (teamVal === 'HCM' || teamVal.includes('HCM'))) return;
      const mktStaff = rowDisplayMktStaff(row);
      const saleStaff = rowDisplaySaleStaff(row);
      const deliveryStaff = String(row["NV Vận đơn"] || row["Nhân viên Vận đơn"] || row.delivery_staff || "").trim();

      const tienVe = resolveTienVeForSummary(row);
      const shipRaw = parseVietnameseMoneyToNumber(
        row["Phí ship"] ?? row.shipping_cost ?? 0
      ) || 0;
      // So sánh cùng mẫu dữ liệu: chỉ tính ship cho các đơn đã có tiền về/đối soát.
      const ship = tienVe > 0 ? shipRaw : 0;

      const hasTracking = String(row["Mã Tracking"] || row.tracking_code || "").trim() !== "";
      const dsDi = hasTracking
        ? (parseVietnameseMoneyToNumber(row["Tổng tiền VNĐ"] ?? row.total_amount_vnd ?? 0) || 0)
        : 0;

      const updateStats = (dept, rawName) => {
        const name = String(rawName || "").trim() || "Trống";
        if (!stats[dept][name]) {
          stats[dept][name] = { name, tienVe: 0, ship: 0, dsDi: 0 };
        }
        stats[dept][name].tienVe += tienVe;
        stats[dept][name].ship += ship;
        stats[dept][name].dsDi += dsDi;
      };

      updateStats('mkt', mktStaff);
      updateStats('sales', saleStaff);
      updateStats('delivery', deliveryStaff);
    });

    const formatList = (deptStats) => {
      return Object.values(deptStats)
        .sort((a, b) => b.tienVe - a.tienVe)
        .map(s => ({
          ...s,
          // Tiền về sau ship = tiền đã đối soát / thực nhận trừ phí ship (không phải DS đi − ship)
          dsSauShip: s.tienVe - s.ship,
          tile: s.dsDi > 0 ? ((s.tienVe / s.dsDi) * 100).toFixed(2) + '%' : '0%'
        }));
    };

    const result = {
      mkt: formatList(stats.mkt),
      sales: formatList(stats.sales),
      delivery: formatList(stats.delivery),
      totals: {
        mkt: Object.values(stats.mkt).reduce((acc, curr) => { acc.tienVe += curr.tienVe; acc.ship += curr.ship; acc.dsDi += curr.dsDi; return acc; }, { tienVe: 0, ship: 0, dsDi: 0 }),
        sales: Object.values(stats.sales).reduce((acc, curr) => { acc.tienVe += curr.tienVe; acc.ship += curr.ship; acc.dsDi += curr.dsDi; return acc; }, { tienVe: 0, ship: 0, dsDi: 0 }),
        delivery: Object.values(stats.delivery).reduce((acc, curr) => { acc.tienVe += curr.tienVe; acc.ship += curr.ship; acc.dsDi += curr.dsDi; return acc; }, { tienVe: 0, ship: 0, dsDi: 0 })
      }
    };

    return result;
  }, [allData, activeTab, dataCache, baseSourceTable, ordersTableName]);

  if (!hasOrderListAccess) {
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này. Cần quyền xem ít nhất một mã:{' '}
        {orderListAccessCodes.join(', ')}.
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
                <h1 className="text-xl font-bold text-gray-800">DANH SÁCH ĐƠN HÀNG</h1>
                <p className="text-xs text-gray-500">Dữ liệu từ Database</p>
              </div>

              {/* Hệ thống Tab */}
              <div className="flex bg-gray-100 p-1 rounded-xl ml-4">
                <button
                  onClick={() => setActiveTab(isHcmDataSource ? 'hcm' : 'rd')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${(isHcmDataSource ? activeTab === 'hcm' : activeTab === 'rd')
                      ? 'bg-white text-[#F37021] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  {isHcmDataSource ? 'Dữ liệu HCM' : 'Dữ liệu RD'}
                </button>
                {/* <button
                  onClick={() => setActiveTab('hcm')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === 'hcm'
                      ? 'bg-white text-[#F37021] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Dữ liệu HCM
                </button> */}
                <button
                  onClick={() => setActiveTab('f3_summary')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'f3_summary'
                      ? 'bg-white text-[#F37021] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  📦 Tổng hợp F3
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {loading && loadingProgress > 0 && loadingProgress < 100 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${loadingProgress}%` }}
                    />
                  </div>
                  <span className="text-xs text-blue-600 font-medium">{loadingProgress}%</span>
                </div>
              )}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg border border-green-200">
                <span className="text-sm font-semibold text-green-700">Tổng tiền:</span>
                <span className="text-sm text-green-600">
                  {filteredData.reduce((sum, row) => {
                    const amount = parseFloat(String(row["Tổng tiền VNĐ"] || 0).replace(/[^\d.-]/g, '')) || 0;
                    return sum + amount;
                  }, 0).toLocaleString('vi-VN')} ₫
                </span>
              </div>


              {isHcmView && (
                <button
                  type="button"
                  onClick={handlePreviewOrdersHcmFromMainTable}
                  disabled={
                    loading ||
                    syncing ||
                    deleting ||
                    isFetchingOrdersHcmLookaside
                  }
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                  title="Đọc bảng orders: team chứa HCM — theo Từ/Đến ngày đang chọn; mở bảng xem (không ghi DB)"
                >
                  {isFetchingOrdersHcmLookaside ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Đang tra…
                    </>
                  ) : (
                    <>
                      <Layers className="w-4 h-4" />
                      Đơn HCM từ orders
                    </>
                  )}
                </button>
              )}

              {selectedRows.size > 0 && (
                <button
                  onClick={handleBulkUpdateAccountant}
                  disabled={loading || savingBulkAccountant}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                  title={`Cập nhật Kế toán xác nhận cho ${selectedRows.size} đơn đã chọn`}
                >
                  <Settings className="w-4 h-4" />
                  Cập nhật KT ({selectedRows.size})
                </button>
              )}

              <button
                onClick={() => loadData(true)}
                disabled={loading}
                className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                title="Tải lại dữ liệu từ database (bỏ qua cache)"
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

      {isHcmView && hcmOrdersLookasideOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hcm-orders-lookaside-title"
          onClick={() => setHcmOrdersLookasideOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[88vh] flex flex-col border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <div>
                <h2 id="hcm-orders-lookaside-title" className="text-lg font-bold text-gray-900">
                  Đơn từ bảng orders (team chứa HCM)
                </h2>
                <p className="text-xs text-gray-600 mt-0.5">
                  Nguồn: <code className="bg-gray-200 px-1 rounded">orders</code> — không phải{' '}
                  <code className="bg-gray-200 px-1 rounded">order_code_hcm</code>. Khoảng ngày (order_date; thêm đơn
                  order_date trống theo created_at): <strong>{startDate}</strong> → <strong>{endDate}</strong>
                </p>
              </div>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-gray-200 text-gray-700"
                aria-label="Đóng"
                onClick={() => setHcmOrdersLookasideOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto flex-1 p-3">
              {hcmOrdersLookasideRows.length === 0 ? (
                <p className="text-sm text-gray-600 py-8 text-center">Không có dòng nào khớp điều kiện.</p>
              ) : (
                <table className="min-w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-left text-xs uppercase text-gray-600">
                      <th className="p-2 border border-gray-200">#</th>
                      <th className="p-2 border border-gray-200">Mã đơn</th>
                      <th className="p-2 border border-gray-200">Team</th>
                      <th className="p-2 border border-gray-200">Ngày lên đơn</th>
                      <th className="p-2 border border-gray-200">Tên KH</th>
                      <th className="p-2 border border-gray-200">SĐT</th>
                      <th className="p-2 border border-gray-200">Sale</th>
                      <th className="p-2 border border-gray-200">created_at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hcmOrdersLookasideRows.map((r, i) => (
                      <tr key={r.id ?? `${r.order_code}-${i}`} className="hover:bg-orange-50/50">
                        <td className="p-2 border border-gray-200 text-gray-500">{i + 1}</td>
                        <td className="p-2 border border-gray-200 font-mono text-xs">{String(r.order_code ?? '').trim() || '—'}</td>
                        <td className="p-2 border border-gray-200">{String(r.team ?? '').trim() || '—'}</td>
                        <td className="p-2 border border-gray-200 whitespace-nowrap text-xs">
                          {r.order_date != null && String(r.order_date).trim() !== ''
                            ? String(r.order_date).slice(0, 19)
                            : '—'}
                        </td>
                        <td className="p-2 border border-gray-200 max-w-[200px] truncate" title={String(r.customer_name ?? '')}>
                          {String(r.customer_name ?? '').trim() || '—'}
                        </td>
                        <td className="p-2 border border-gray-200 font-mono text-xs">{String(r.customer_phone ?? '').trim() || '—'}</td>
                        <td className="p-2 border border-gray-200 max-w-[140px] truncate">{String(r.sale_staff ?? '').trim() || '—'}</td>
                        <td className="p-2 border border-gray-200 whitespace-nowrap text-xs text-gray-600">
                          {r.created_at != null ? String(r.created_at).slice(0, 19) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 rounded-b-xl text-xs text-gray-600 flex flex-wrap items-center justify-between gap-2">
              <span>
                Tổng: <strong>{hcmOrdersLookasideRows.length}</strong> dòng
              </span>
              {hcmOrdersLookasideRows.length > 0 && (
                <button
                  type="button"
                  onClick={handleFillHcmFromOrdersLookaside}
                  disabled={isFillingHcmFromOrdersLookaside || isFetchingOrdersHcmLookaside}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#F37021] hover:bg-[#e55f1a] text-white disabled:bg-gray-400 disabled:opacity-60"
                  title="Chuyển sang order_code_hcm (giữ id); trùng Mã đơn trên HCM → không chèn nhưng xóa orders; trùng id / trống mã → giữ orders; chèn xong xóa orders"
                >
                  {isFillingHcmFromOrdersLookaside ? 'Đang điền…' : 'Điền sang order_code_hcm'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-full mx-auto px-6 py-6">
        {/* Filters Area - Always Visible */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            {activeTab !== 'f3_summary' && (
              <>
                {/* Search */}
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tìm kiếm</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Tìm kiếm: mã đơn, tên KH, tên NV, SĐT, địa chỉ, tracking..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Trùng Name / Phone / Add</label>
                  <button
                    type="button"
                    onClick={() => setHighlightDupNamePhoneAdd((v) => !v)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors flex items-center gap-2 whitespace-nowrap ${highlightDupNamePhoneAdd
                        ? 'bg-red-100 border-red-400 text-red-800'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    title="Bật: tô đỏ cả dòng khi có ít nhất 2 đơn trong bộ lọc hiện tại trùng Name*, Phone* và Add (đã chuẩn hóa)"
                  >
                    <Layers className="w-4 h-4 shrink-0" />
                    {highlightDupNamePhoneAdd ? 'Đang bật lọc trùng' : 'Lọc trùng'}
                  </button>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Xuất file</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleExportExcelMaDonNamePhoneAdd}
                      disabled={loading || (filteredData || []).length === 0}
                      className="px-3 py-2 rounded-lg text-sm font-semibold border border-[#F37021] text-[#F37021] bg-white hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 whitespace-nowrap"
                      title="Tải Excel: đủ các cột đang hiển thị trên bảng (Cài đặt cột) — theo bộ lọc hiện tại"
                    >
                      <Download className="w-4 h-4 shrink-0" />
                      Tải Excel (theo lưới)
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowColumnSettings(true)}
                      className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-colors flex items-center gap-2 whitespace-nowrap"
                      title="Cài đặt các cột hiển thị trên bảng"
                    >
                      <Settings className="w-4 h-4 shrink-0" />
                      Cài đặt cột
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Date Range Filter */}
            <div className={`flex gap-2 ${activeTab === 'f3_summary' ? 'flex-1' : ''}`}>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Từ ngày</label>
                <input
                  type="date"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Đến ngày</label>
                <input
                  type="date"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2 border border-orange-200 bg-orange-50/40 rounded-lg px-3 py-2">
              <div className="w-full text-xs font-bold text-orange-700">
                Lọc ngày đồng bộ bill/cước
              </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Đồng bộ bill từ</label>
                  <input
                    type="date"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                    value={billSyncStartDate}
                    onChange={(e) => setBillSyncStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">đến</label>
                  <input
                    type="date"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                    value={billSyncEndDate}
                    onChange={(e) => setBillSyncEndDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Đồng bộ cước từ</label>
                  <input
                    type="date"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                    value={cuocSyncStartDate}
                    onChange={(e) => setCuocSyncStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">đến</label>
                  <input
                    type="date"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                    value={cuocSyncEndDate}
                    onChange={(e) => setCuocSyncEndDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Thao tác</label>
                  <button
                    type="button"
                    onClick={() => {
                      setBillSyncStartDate('');
                      setBillSyncEndDate('');
                      setCuocSyncStartDate('');
                      setCuocSyncEndDate('');
                    }}
                    className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                  >
                    Xóa lọc sync
                  </button>
                </div>
            </div>

            {activeTab !== 'f3_summary' && (
              <>
                {/* Filters Content Placeholder */}
                <div className="flex flex-wrap items-end gap-4 w-full">
                  <div className="min-w-[200px] relative">
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Khu vực</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowMarketFilter(!showMarketFilter)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                      >
                        <span className="truncate">
                          {filterMarket.length === 0
                            ? 'Tất cả'
                            : filterMarket.length === 1
                              ? filterMarket[0]
                              : `Đã chọn ${filterMarket.length}`}
                        </span>
                        <span className="ml-2">▼</span>
                      </button>

                      {showMarketFilter && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div className="p-2">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                              <span className="text-xs font-semibold text-gray-700">Chọn khu vực:</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFilterMarket([]);
                                  setShowMarketFilter(false);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                Bỏ chọn tất cả
                              </button>
                            </div>
                            {uniqueMarkets.map(market => {
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
                                        setFilterMarket(filterMarket.filter(m => m !== market));
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

                    {/* Click outside to close */}
                    {showMarketFilter && (
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowMarketFilter(false)}
                      />
                    )}
                  </div>

                  {/* Product Filter - Multi-select với checkbox */}
                  <div className="min-w-[200px] relative">
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Mặt hàng</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowProductFilter(!showProductFilter)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                      >
                        <span className="truncate">
                          {filterProduct.length === 0
                            ? 'Tất cả'
                            : filterProduct.length === 1
                              ? filterProduct[0]
                              : `Đã chọn ${filterProduct.length}`}
                        </span>
                        <span className="ml-2">▼</span>
                      </button>

                      {showProductFilter && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div className="p-2">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                              <span className="text-xs font-semibold text-gray-700">Chọn mặt hàng:</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFilterProduct([]);
                                  setShowProductFilter(false);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                Bỏ chọn tất cả
                              </button>
                            </div>
                            {uniqueProducts.map(product => {
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
                                        setFilterProduct(filterProduct.filter(p => p !== product));
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

                    {showProductFilter && (
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowProductFilter(false)}
                      />
                    )}
                  </div>

                  {/* Status Filter - Multi-select với checkbox */}
                  <div className="min-w-[200px] relative">
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Trạng thái</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowStatusFilter(!showStatusFilter)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                      >
                        <span className="truncate">
                          {filterStatus.length === 0
                            ? 'Tất cả'
                            : filterStatus.length === 1
                              ? filterStatus[0]
                              : `Đã chọn ${filterStatus.length}`}
                        </span>
                        <span className="ml-2">▼</span>
                      </button>

                      {showStatusFilter && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div className="p-2">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                              <span className="text-xs font-semibold text-gray-700">Chọn trạng thái:</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFilterStatus([]);
                                  setShowStatusFilter(false);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                Bỏ chọn tất cả
                              </button>
                            </div>
                            {uniqueStatuses.map(status => {
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
                                        setFilterStatus(filterStatus.filter(s => s !== status));
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

                    {showStatusFilter && (
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowStatusFilter(false)}
                      />
                    )}
                  </div>

                  {/* Check Result Filter - Multi-select với checkbox */}
                  <div className="min-w-[200px] relative">
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Kết quả Check</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowCheckResultFilter(!showCheckResultFilter)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                      >
                        <span className="truncate">
                          {filterCheckResult.length === 0
                            ? 'Tất cả'
                            : filterCheckResult.length === 1
                              ? filterCheckResult[0]
                              : `Đã chọn ${filterCheckResult.length}`}
                        </span>
                        <span className="ml-2">▼</span>
                      </button>

                      {showCheckResultFilter && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div className="p-2">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                              <span className="text-xs font-semibold text-gray-700">Chọn kết quả check:</span>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = Array.from(new Set([...(filterCheckResult || []), ...filteredCheckResults]));
                                    setFilterCheckResult(next);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Chọn tất cả
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFilterCheckResult([]);
                                    setShowCheckResultFilter(false);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Bỏ chọn tất cả
                                </button>
                              </div>
                            </div>
                            <div className="mb-2">
                              <input
                                type="text"
                                value={checkResultFilterSearchText}
                                onChange={(e) => setCheckResultFilterSearchText(e.target.value)}
                                placeholder="Gõ để tìm nhanh..."
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                              />
                            </div>
                            {filteredCheckResults.map(checkResult => {
                              const isChecked = filterCheckResult.includes(checkResult);
                              return (
                                <label
                                  key={checkResult}
                                  className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFilterCheckResult([...filterCheckResult, checkResult]);
                                      } else {
                                        setFilterCheckResult(filterCheckResult.filter(c => c !== checkResult));
                                      }
                                    }}
                                    className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                                  />
                                  <span className="ml-2 text-sm text-gray-700">{checkResult}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {showCheckResultFilter && (
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowCheckResultFilter(false)}
                      />
                    )}
                  </div>

                  {/* Page — checkbox + gõ tìm (page_name) */}
                  <div className="min-w-[200px] relative">
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Page</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowPageFilter(!showPageFilter)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                      >
                        <span className="truncate">
                          {filterPageNames.length === 0
                            ? 'Tất cả'
                            : filterPageNames.length === 1
                              ? filterPageNames[0]
                              : `Đã chọn ${filterPageNames.length}`}
                        </span>
                        <span className="ml-2">▼</span>
                      </button>

                      {showPageFilter && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div className="p-2">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                              <span className="text-xs font-semibold text-gray-700">Chọn Page:</span>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = Array.from(
                                      new Set([...(filterPageNames || []), ...filteredPageNames])
                                    );
                                    setFilterPageNames(next);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Chọn tất cả
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFilterPageNames([]);
                                    setShowPageFilter(false);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Bỏ chọn tất cả
                                </button>
                              </div>
                            </div>
                            <div className="mb-2">
                              <input
                                type="text"
                                value={pageFilterSearchText}
                                onChange={(e) => setPageFilterSearchText(e.target.value)}
                                placeholder="Gõ để tìm nhanh..."
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                              />
                            </div>
                            {filteredPageNames.map((pageName) => {
                              const isChecked = filterPageNames.includes(pageName);
                              return (
                                <label
                                  key={pageName}
                                  className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFilterPageNames([...filterPageNames, pageName]);
                                      } else {
                                        setFilterPageNames(filterPageNames.filter((p) => p !== pageName));
                                      }
                                    }}
                                    className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                                  />
                                  <span className="ml-2 text-sm text-gray-700">{pageName}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {showPageFilter && (
                      <div className="fixed inset-0 z-40" onClick={() => setShowPageFilter(false)} />
                    )}
                  </div>

                  {/* Trạng thái thu tiền (payment_status_detail) */}
                  <div className="min-w-[200px] relative">
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                      Trạng thái thu tiền
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowPaymentCollectionFilter(!showPaymentCollectionFilter)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                      >
                        <span className="truncate">
                          {filterPaymentCollectionStatus.length === 0
                            ? 'Tất cả'
                            : filterPaymentCollectionStatus.length === 1
                              ? filterPaymentCollectionStatus[0]
                              : `Đã chọn ${filterPaymentCollectionStatus.length}`}
                        </span>
                        <span className="ml-2">▼</span>
                      </button>

                      {showPaymentCollectionFilter && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div className="p-2">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                              <span className="text-xs font-semibold text-gray-700">Chọn trạng thái thu tiền:</span>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = Array.from(
                                      new Set([
                                        ...(filterPaymentCollectionStatus || []),
                                        ...filteredPaymentCollectionStatuses,
                                      ])
                                    );
                                    setFilterPaymentCollectionStatus(next);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Chọn tất cả
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFilterPaymentCollectionStatus([]);
                                    setShowPaymentCollectionFilter(false);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Bỏ chọn tất cả
                                </button>
                              </div>
                            </div>
                            <div className="mb-2">
                              <input
                                type="text"
                                value={paymentCollectionFilterSearchText}
                                onChange={(e) => setPaymentCollectionFilterSearchText(e.target.value)}
                                placeholder="Gõ để tìm nhanh..."
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                              />
                            </div>
                            {filteredPaymentCollectionStatuses.map((st) => {
                              const isChecked = filterPaymentCollectionStatus.includes(st);
                              return (
                                <label
                                  key={st}
                                  className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFilterPaymentCollectionStatus([
                                          ...filterPaymentCollectionStatus,
                                          st,
                                        ]);
                                      } else {
                                        setFilterPaymentCollectionStatus(
                                          filterPaymentCollectionStatus.filter((x) => x !== st)
                                        );
                                      }
                                    }}
                                    className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                                  />
                                  <span className="ml-2 text-sm text-gray-700">{st}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {showPaymentCollectionFilter && (
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowPaymentCollectionFilter(false)}
                      />
                    )}
                  </div>

                  {/* Sale Staff Filter */}
                  <div className="min-w-[200px] relative">
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nhân viên Sale</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowSaleStaffFilter(!showSaleStaffFilter)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                      >
                        <span className="truncate">
                          {filterSaleStaff.length === 0
                            ? 'Tất cả'
                            : filterSaleStaff.length === 1
                              ? filterSaleStaff[0]
                              : `Đã chọn ${filterSaleStaff.length}`}
                        </span>
                        <span className="ml-2">▼</span>
                      </button>
                      {showSaleStaffFilter && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div className="p-2">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                              <span className="text-xs font-semibold text-gray-700">Chọn NV Sale:</span>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = Array.from(new Set([...(filterSaleStaff || []), ...filteredSaleStaff]));
                                    setFilterSaleStaff(next);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Chọn tất cả
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setFilterSaleStaff([]); setShowSaleStaffFilter(false); }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Bỏ chọn tất cả
                                </button>
                              </div>
                            </div>
                            <div className="mb-2">
                              <input
                                type="text"
                                value={saleStaffFilterSearchText}
                                onChange={(e) => setSaleStaffFilterSearchText(e.target.value)}
                                placeholder="Gõ để tìm nhanh..."
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                              />
                            </div>
                            {filteredSaleStaff.map(name => (
                              <label key={name} className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={filterSaleStaff.includes(name)}
                                  onChange={(e) => {
                                    if (e.target.checked) setFilterSaleStaff([...filterSaleStaff, name]);
                                    else setFilterSaleStaff(filterSaleStaff.filter(v => v !== name));
                                  }}
                                  className="w-4 h-4 ml-1 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                                />
                                <span className="ml-2 text-sm text-gray-700">{name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {showSaleStaffFilter && (
                      <div className="fixed inset-0 z-40" onClick={() => setShowSaleStaffFilter(false)} />
                    )}
                  </div>

                  {/* MKT Staff Filter */}
                  <div className="min-w-[200px] relative">
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nhân viên MKT</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowMktStaffFilter(!showMktStaffFilter)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                      >
                        <span className="truncate">
                          {filterMktStaff.length === 0
                            ? 'Tất cả'
                            : filterMktStaff.length === 1
                              ? filterMktStaff[0]
                              : `Đã chọn ${filterMktStaff.length}`}
                        </span>
                        <span className="ml-2">▼</span>
                      </button>
                      {showMktStaffFilter && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div className="p-2">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                              <span className="text-xs font-semibold text-gray-700">Chọn NV MKT:</span>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = Array.from(new Set([...(filterMktStaff || []), ...filteredMktStaff]));
                                    setFilterMktStaff(next);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Chọn tất cả
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setFilterMktStaff([]); setShowMktStaffFilter(false); }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Bỏ chọn tất cả
                                </button>
                              </div>
                            </div>
                            <div className="mb-2">
                              <input
                                type="text"
                                value={mktStaffFilterSearchText}
                                onChange={(e) => setMktStaffFilterSearchText(e.target.value)}
                                placeholder="Gõ để tìm nhanh..."
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                              />
                            </div>
                            {filteredMktStaff.map(name => (
                              <label key={name} className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={filterMktStaff.includes(name)}
                                  onChange={(e) => {
                                    if (e.target.checked) setFilterMktStaff([...filterMktStaff, name]);
                                    else setFilterMktStaff(filterMktStaff.filter(v => v !== name));
                                  }}
                                  className="w-4 h-4 ml-1 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                                />
                                <span className="ml-2 text-sm text-gray-700">{name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {showMktStaffFilter && (
                      <div className="fixed inset-0 z-40" onClick={() => setShowMktStaffFilter(false)} />
                    )}
                  </div>

                  {/* Delivery Staff Filter */}
                  <div className="min-w-[200px] relative">
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nhân viên vận đơn</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowDeliveryStaffFilter(!showDeliveryStaffFilter)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                      >
                        <span className="truncate">
                          {filterDeliveryStaff.length === 0
                            ? 'Tất cả'
                            : filterDeliveryStaff.length === 1
                              ? filterDeliveryStaff[0]
                              : `Đã chọn ${filterDeliveryStaff.length}`}
                        </span>
                        <span className="ml-2">▼</span>
                      </button>
                      {showDeliveryStaffFilter && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div className="p-2">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                              <span className="text-xs font-semibold text-gray-700">Chọn NV vận đơn:</span>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = Array.from(new Set([...(filterDeliveryStaff || []), ...filteredDeliveryStaff]));
                                    setFilterDeliveryStaff(next);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Chọn tất cả
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setFilterDeliveryStaff([]); setShowDeliveryStaffFilter(false); }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Bỏ chọn tất cả
                                </button>
                              </div>
                            </div>
                            <div className="mb-2">
                              <input
                                type="text"
                                value={deliveryStaffFilterSearchText}
                                onChange={(e) => setDeliveryStaffFilterSearchText(e.target.value)}
                                placeholder="Gõ để tìm nhanh..."
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                              />
                            </div>
                            {filteredDeliveryStaff.map(name => (
                              <label key={name} className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={filterDeliveryStaff.includes(name)}
                                  onChange={(e) => {
                                    if (e.target.checked) setFilterDeliveryStaff([...filterDeliveryStaff, name]);
                                    else setFilterDeliveryStaff(filterDeliveryStaff.filter(v => v !== name));
                                  }}
                                  className="w-4 h-4 ml-1 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                                />
                                <span className="ml-2 text-sm text-gray-700">{name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {showDeliveryStaffFilter && (
                      <div className="fixed inset-0 z-40" onClick={() => setShowDeliveryStaffFilter(false)} />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'f3_summary' ? (
          <F3SummaryTab
            data={f3SummaryData}
            startDate={startDate}
            endDate={endDate}
          />
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedRows.size === filteredData.length && filteredData.length > 0}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                        />
                      </th>
                      {displayColumns.map((col) => (
                        <th
                          key={col}
                          className={`px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 ${col === 'Loại tiền thanh toán' ? 'whitespace-nowrap w-[150px]' : ''
                            }`}
                          onClick={() => handleSort(col)}
                        >
                          <div className="flex items-center gap-2">
                            {col}
                            {sortColumn === col && (
                              <span className="text-[#F37021]">
                                {sortDirection === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>

                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={displayColumns.length + 1} className="px-4 py-8 text-center text-gray-500">
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin h-5 w-5 border-2 border-[#F37021] border-t-transparent rounded-full"></div>
                            Đang tải dữ liệu...
                          </div>
                        </td>
                      </tr>
                    ) : paginatedData.length === 0 ? (
                      <tr>
                        <td colSpan={displayColumns.length + 1} className="px-4 py-8 text-center text-gray-500">
                          Không có dữ liệu phù hợp
                        </td>
                      </tr>
                    ) : (
                      paginatedData.map((row, index) => {
                        const rowIndexFiltered = (currentPage - 1) * rowsPerPage + index;
                        const tKey = tripleNamePhoneAddKey(row);
                        const isDupRow =
                          highlightDupNamePhoneAdd && tKey && duplicateTripleKeysInFilter.has(tKey);
                        const isSelected = selectedRowId === rowIndexFiltered;
                        let trClass = 'cursor-pointer transition-colors ';
                        if (isDupRow && isSelected) {
                          trClass += 'bg-red-200 ring-2 ring-inset ring-blue-500 hover:bg-red-200';
                        } else if (isDupRow) {
                          trClass += 'bg-red-100 hover:bg-red-50';
                        } else if (isSelected) {
                          trClass += 'bg-blue-100 hover:bg-blue-200';
                        } else {
                          trClass += 'hover:bg-gray-50';
                        }
                        return (
                          <tr
                            key={row[PRIMARY_KEY_COLUMN] || index}
                            onClick={() => setSelectedRowId(rowIndexFiltered)}
                            className={trClass}
                          >
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedRows.has(rowIndexFiltered)}
                                onChange={(e) => handleSelectRow(rowIndexFiltered, e.target.checked)}
                                className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                              />
                            </td>
                            {displayColumns.map((col) => {
                              let value = getCellDisplayValueForRow(row, col);

                              // Special rendering for Payment Bill and Payment Image
                              if (col === 'Payment Bill') {
                                return (
                                  <td
                                    key={col}
                                    className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <select
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      value={value || ''}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        // Handle update if needed
                                        const newValue = e.target.value;
                                        if (newValue !== value) {
                                          // TODO: Add update logic here if needed
                                          console.log('Update Payment Bill:', row['Mã đơn hàng'], newValue);
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="">-- Chọn --</option>
                                      <option value="Có bill">Có bill</option>
                                      <option value="Bill một phần">Bill một phần</option>
                                    </select>
                                  </td>
                                );
                              }

                              if (col === 'Payment Image') {
                                return (
                                  <td
                                    key={col}
                                    className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Suspense fallback={<span className="text-gray-400">...</span>}>
                                      <BillImageViewer
                                        paymentImage={value || row['Payment Image'] || row.payment_image || ''}
                                        orderCode={row['Mã đơn hàng'] || row.order_code || ''}
                                      />
                                    </Suspense>
                                  </td>
                                );
                              }

                              return (
                                <td
                                  key={col}
                                  className={`px-4 py-3 text-sm text-gray-900 whitespace-nowrap cursor-copy hover:bg-blue-50 transition-colors ${col === 'Loại tiền thanh toán' ? 'w-[150px]' : ''
                                    }`}
                                  title={`${value || '-'} (Click để copy)`}
                                  onClick={(e) => {
                                    e.stopPropagation(); // Ngăn chặn select row khi click vào ô
                                    handleCellClick(e, value);
                                  }}
                                >
                                  {value || '-'}
                                </td>
                              );
                            })}

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
          </>
        )}
      </div>

      {/* Sửa NV vận đơn (can thiệp delivery_staff) */}
      {showEditNvVanDonModal && editNvVanDonRow && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => {
            if (!savingNvVanDon) closeEditNvVanDonModal();
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-amber-600" />
                  Sửa nhân viên vận đơn
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Mã đơn:{' '}
                  <span className="font-mono font-semibold text-gray-800">
                    {editNvVanDonRow['Mã đơn hàng']}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditNvVanDonModal}
                disabled={savingNvVanDon}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                  NV vận đơn (delivery_staff)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Danh sách từ: <span className="font-medium">users.department</span>,{' '}
                  <span className="font-medium">human_resources &quot;Bộ phận&quot;</span>,{' '}
                  <span className="font-medium">danh_sach_van_don.ho_va_ten</span> (Vận đơn / Logistics).
                </p>
                <select
                  value={editNvVanDonValue}
                  onChange={(e) => setEditNvVanDonValue(e.target.value)}
                  disabled={savingNvVanDon || loadingNvVanDonOptions}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] disabled:bg-gray-100 bg-white"
                >
                  <option value="">— Để trống (xóa NV vận đơn) —</option>
                  {nvVanDonSelectOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {loadingNvVanDonOptions && (
                  <p className="text-xs text-gray-500 mt-1.5">Đang tải danh sách nhân sự…</p>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Giá trị đang có trên đơn nhưng không thuộc danh sách bộ phận vẫn hiện trong sổ xuống để giữ đúng dữ liệu cũ.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
              <button
                type="button"
                onClick={closeEditNvVanDonModal}
                disabled={savingNvVanDon}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={saveEditNvVanDon}
                disabled={savingNvVanDon}
                className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg text-sm font-medium transition-colors disabled:bg-gray-400 flex items-center gap-2"
              >
                {savingNvVanDon ? (
                  <>
                    <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang lưu…
                  </>
                ) : (
                  'Lưu'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Update Accountant Modal */}
      {showBulkAccountantModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => !savingBulkAccountant && setShowBulkAccountantModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  Cập nhật Kế toán xác nhận thu tiền về
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Đã chọn: <span className="font-semibold text-gray-800">{selectedRows.size}</span> đơn
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBulkAccountantModal(false);
                  setBulkAccountantValue('');
                  setBulkAccountantSearchText('');
                }}
                disabled={savingBulkAccountant}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Left: Selected orders list */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Danh sách đơn đã chọn
                  </h3>
                  <div className="border border-gray-300 rounded-lg max-h-80 overflow-y-auto bg-gray-50">
                    {Array.from(selectedRows).length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        Chưa chọn đơn nào
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {Array.from(selectedRows).map((idx) => {
                          const row = filteredData[idx];
                          const orderCode = row?.['Mã đơn hàng'];
                          const customerName = row?.['Name*'] || row?.['Name'];
                          const currentAccountant = row?.['Kế toán xác nhận thu tiền về'];

                          return (
                            <div key={idx} className="p-3 hover:bg-white transition-colors">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 truncate">
                                    {orderCode || '(Không có mã)'}
                                  </p>
                                  {customerName && (
                                    <p className="text-xs text-gray-600 truncate mt-0.5">
                                      {customerName}
                                    </p>
                                  )}
                                  {currentAccountant && (
                                    <p className="text-xs text-blue-600 mt-1">
                                      Hiện tại: {currentAccountant}
                                    </p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSelectRow(idx, false)}
                                  disabled={savingBulkAccountant}
                                  className="text-red-500 hover:text-red-700 p-1 disabled:opacity-50"
                                  title="Bỏ chọn"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Value selection */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Chọn giá trị mới
                  </h3>

                  {/* Search input */}
                  <div className="mb-3">
                    <input
                      type="text"
                      value={bulkAccountantSearchText}
                      onChange={(e) => setBulkAccountantSearchText(e.target.value)}
                      placeholder="Gõ để tìm kiếm hoặc nhập giá trị mới..."
                      disabled={savingBulkAccountant}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] disabled:bg-gray-100"
                    />
                  </div>

                  {/* Options list */}
                  <div className="border border-gray-300 rounded-lg max-h-60 overflow-y-auto">
                    {filteredAccountantOptions.length === 0 && bulkAccountantSearchText ? (
                      <div className="p-3 text-center">
                        <p className="text-sm text-gray-500 mb-2">Không tìm thấy giá trị phù hợp</p>
                        <button
                          type="button"
                          onClick={() => {
                            setBulkAccountantValue(bulkAccountantSearchText.trim());
                            setBulkAccountantSearchText('');
                          }}
                          disabled={savingBulkAccountant}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Sử dụng "{bulkAccountantSearchText.trim()}"
                        </button>
                      </div>
                    ) : (
                      <div className="p-2">
                        {filteredAccountantOptions.map((option) => (
                          <label
                            key={option}
                            className="flex items-center px-2 py-2 hover:bg-gray-50 cursor-pointer rounded"
                          >
                            <input
                              type="radio"
                              name="accountant-option"
                              checked={bulkAccountantValue === option}
                              onChange={() => setBulkAccountantValue(option)}
                              disabled={savingBulkAccountant}
                              className="w-4 h-4 text-[#F37021] border-gray-300 focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{option}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {bulkAccountantValue && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-xs text-green-700">
                        <span className="font-semibold">Giá trị sẽ cập nhật:</span>
                      </p>
                      <p className="text-sm font-bold text-green-800 mt-1">
                        {bulkAccountantValue}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowBulkAccountantModal(false);
                  setBulkAccountantValue('');
                  setBulkAccountantSearchText('');
                }}
                disabled={savingBulkAccountant}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={saveBulkAccountant}
                disabled={savingBulkAccountant || !bulkAccountantValue || selectedRows.size === 0}
                className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg text-sm font-medium transition-colors disabled:bg-gray-400 flex items-center gap-2"
              >
                {savingBulkAccountant ? (
                  <>
                    <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang lưu…
                  </>
                ) : (
                  `Cập nhật ${selectedRows.size} đơn`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowHistoryModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Lịch sử chỉnh sửa đơn hàng</h2>
                <p className="text-sm text-gray-500 mt-1">Mã đơn: <span className="font-mono font-bold text-blue-600">{historyOrderCode}</span></p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingHistory ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin h-8 w-8 border-2 border-[#F37021] border-t-transparent rounded-full mx-auto mb-2"></div>
                  Đang tải lịch sử...
                </div>
              ) : historyTableRows.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Chưa có lịch sử chỉnh sửa nào cho đơn hàng này.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-sm text-left">
                    <thead className="bg-gray-100 text-gray-700 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-3 py-2 font-semibold whitespace-nowrap">Thời gian</th>
                        <th className="px-3 py-2 font-semibold whitespace-nowrap">Nhân viên</th>
                        <th className="px-3 py-2 font-semibold whitespace-nowrap">Cột</th>
                        <th className="px-3 py-2 font-semibold whitespace-nowrap">Giá trị cũ</th>
                        <th className="px-3 py-2 font-semibold whitespace-nowrap">Giá trị mới</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {historyTableRows.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-800 whitespace-nowrap align-top">
                            {formatHistoryTime(r.thoi_gian)}
                          </td>
                          <td className="px-3 py-2 text-gray-800 align-top max-w-[140px] break-words">
                            {r.nhan_vien || '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-800 align-top max-w-[160px] break-words">
                            {r.cot || '—'}
                          </td>
                          <td className="px-3 py-2 text-red-800 align-top max-w-[220px] break-words">
                            {r.gia_tri_cu}
                          </td>
                          <td className="px-3 py-2 text-green-800 align-top max-w-[220px] break-words">
                            {r.gia_tri_moi}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

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
        hiddenColumns={HIDDEN_COLUMNS}
      />
    </div>
  );
}

export default DanhSachDon;

