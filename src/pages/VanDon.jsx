import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TableVirtuoso } from 'react-virtuoso';

import ColumnSettingsModal from '../components/ColumnSettingsModal';
import MultiSelect from '../components/MultiSelect';
import usePermissions from '../hooks/usePermissions';
import * as API from '../services/api';
import * as rbacService from '../services/rbacService';
import '../styles/selection.css';
import { supabase } from '../supabase/config';
import { isVanDonSemanticEmpty } from '../utils/vanDonSemanticEmpty';

import {
  BILL_LADING_COLUMNS, COLUMN_MAPPING,
  DEFAULT_BILL_LADING_COLUMNS,
  DROPDOWN_OPTIONS,
  EDITABLE_COLS,
  LONG_TEXT_COLS,
  ORDER_MGMT_COLUMNS,
  PRIMARY_KEY_COLUMN,
  TEAM_COLUMN_NAME
} from '../types';

// Columns to always hide (both in table and column settings)
const HIDDEN_COLUMNS = ["Thuê TK", "Thời gian cutoff", "Tiền Hàng"];

// Lazy load heavy components
const SyncPopover = lazy(() => import('../components/SyncPopover'));


const UPDATE_DELAY = 500;
const BULK_THRESHOLD = 1;
/** Độ rộng cột checkbox (tab Hà Nội) — bù `left` cho cột sticky kế bên */
const VAN_DON_CHECKBOX_COL_PX = 50;

/** Chuẩn hóa header cột (NFC) — tránh lệch ký tự Unicode so với EDITABLE_COLS. */
function normalizeColHeader(col) {
  if (col == null || col === '') return '';
  return String(col).normalize('NFC').trim();
}

function colInList(col, list) {
  const n = normalizeColHeader(col);
  if (!n) return false;
  for (let i = 0; i < list.length; i++) {
    if (normalizeColHeader(list[i]) === n) return true;
  }
  return false;
}

/** TableVirtuoso chỉ bọc sẵn <tr> — không được trả về <tr> từ itemContent (tránh <tr> lồng <tr>, DOM hỏng). */
function VanDonVirtuosoTable({ style, ...props }) {
  return (
    <table
      {...props}
      className="border-separate border-spacing-0 w-max text-[13px] leading-tight table-fixed"
      style={{ ...style, tableLayout: 'fixed' }}
    />
  );
}

const VanDonVirtuosoTableBody = React.forwardRef((props, ref) => <tbody {...props} ref={ref} />);
VanDonVirtuosoTableBody.displayName = 'VanDonVirtuosoTableBody';

/** Cuộn ngang + dọc trên cùng một scroller; `overflow: hidden` mặc định của ô không áp dụng lên `sticky` (xem VanDonVirtuoso). */
const VanDonVirtuosoScroller = React.forwardRef(({ style, ...props }, ref) => (
  <div
    {...props}
    ref={ref}
    style={{
      ...style,
      overflow: 'auto',
      WebkitOverflowScrolling: 'touch',
    }}
  />
));
VanDonVirtuosoScroller.displayName = 'VanDonVirtuosoScroller';

/** Tên hiển thị phiên đăng nhập — khớp với cột NV Vận đơn / delivery_staff (tab Đơn cá nhân). */
function getVanDonSessionDisplayName() {
  try {
    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    const parts = [
      localStorage.getItem('username'),
      user?.['Họ_và_tên'],
      user?.['Họ và tên'],
      user?.['Họ Và Tên'],
      user?.full_name,
      user?.name
    ];
    return parts.map((v) => String(v || '').trim()).find(Boolean) || '';
  } catch {
    return '';
  }
}

function normalizeVanDonNameKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Các khóa tên coi là bản thân — không đưa vào `allowedStaff` (tab Đơn nhắc hộ). */
function getVanDonSelfNameKeySet() {
  try {
    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    const parts = [
      localStorage.getItem('username'),
      user?.['Họ_và_tên'],
      user?.['Họ và tên'],
      user?.['Họ Và Tên'],
      user?.full_name,
      user?.name,
      user?.username,
    ];
    const set = new Set();
    for (const p of parts) {
      const k = normalizeVanDonNameKey(p);
      if (k) set.add(k);
    }
    return set;
  } catch {
    return new Set();
  }
}

function isVanDonStaffNameSelf(candidate, selfKeys) {
  const c = normalizeVanDonNameKey(candidate);
  if (!c || selfKeys.size === 0) return false;
  return selfKeys.has(c);
}

/** Khớp tab Đơn cá nhân: đồng bộ với API `delivery_staff` ILIKE %tên% (tên phiên ≥ 3 ký tự mới dùng includes). */
function vanDonDeliveryStaffIsSelf(row, sessionNorm) {
  if (!sessionNorm) return false;
  const ds = String(row.delivery_staff || row['NV Vận đơn'] || row['Nhân viên Vận đơn'] || '').trim().toLowerCase();
  if (ds === sessionNorm) return true;
  if (sessionNorm.length >= 3 && ds.includes(sessionNorm)) return true;
  return false;
}

/** Khi ghép đơn chưa lưu vào kết quả API sau đổi bộ lọc — chỉ giữ dòng phù hợp tab (tránh lệch với Đơn Nhật/Hà Nội). */
function rowMatchesBolTabForInject(row, tab) {
  if (tab === 'hanoi') {
    const checkResult = String(row['Kết quả Check'] || row['Kết quả check'] || '').trim();
    const deliveryUnit = String(row['Đơn vị vận chuyển'] || row['Đơn vị Vận chuyển'] || '').trim();
    const isCheckOk = checkResult.toLowerCase() === 'ok';
    const isDeliveryUnitEmpty = !deliveryUnit || deliveryUnit === '' || deliveryUnit === 'null';
    return isCheckOk && isDeliveryUnitEmpty;
  }
  if (tab === 'japan') {
    const country = String(row.country || row['Country'] || row['Khu vực'] || '').trim();
    return country === 'Nhật Bản' || country === 'CĐ Nhật Bản' ||
      country.toLowerCase() === 'nhật bản' || country.toLowerCase() === 'cđ nhật bản';
  }
  if (tab === 'ca_nhan') {
    const n = getVanDonSessionDisplayName().trim().toLowerCase();
    return vanDonDeliveryStaffIsSelf(row, n);
  }
  return true;
}

function VanDon() {
  const { canView, role, loading: permissionsLoading } = usePermissions();
  const roleLower = (role || '').toLowerCase();
  const isAdmin = ['admin', 'super_admin', 'director', 'manager'].includes(roleLower);



  // --- Data State ---

  // --- Data State ---
  const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]); // Danh sách tên nhân sự đã chọn
  const [useBackendPagination, setUseBackendPagination] = useState(true); // Enable backend pagination
  // Always use BILL_OF_LADING view - ORDER_MANAGEMENT is hidden
  const [viewMode] = useState('BILL_OF_LADING');
  const isLoadingDataRef = useRef(false);

  // --- Action Queue & History Architecture ---
  const [pendingChanges, setPendingChanges] = useState(new Map()); // UI ONLY: yellow highlight
  const pendingChangesRef = useRef(pendingChanges);
  useLayoutEffect(() => {
    pendingChangesRef.current = pendingChanges;
  }, [pendingChanges]);

  const [syncPopoverOpen, setSyncPopoverOpen] = useState(false);

  const changeHistoryRef = useRef([]); // Stack for Ctrl-Z
  const historyIndexRef = useRef(-1);
  const dbQueueRef = useRef([]); // FIFO Queue for Backend
  const isProcessingQueue = useRef(false);
  /** Bản ghi đầy đủ (đã merge pending) cho mỗi mã đơn — dùng khi đổi lọc khiến API không trả lại dòng đó. */
  const pendingRowSnapshotsRef = useRef(new Map());

  const savePendingToLocalStorage = useCallback((newPending) => {
    const changesToSave = {};
    if (newPending && newPending.size > 0) {
      newPending.forEach((val, id) => {
        changesToSave[id] = Object.fromEntries(val);
      });
    }
    localStorage.setItem('speegoPendingChanges', JSON.stringify(changesToSave));
    const snaps = {};
    pendingRowSnapshotsRef.current.forEach((row, id) => {
      snaps[id] = row;
    });
    if (Object.keys(snaps).length > 0) {
      localStorage.setItem('speegoPendingRowSnapshots', JSON.stringify(snaps));
    } else {
      localStorage.removeItem('speegoPendingRowSnapshots');
    }
  }, []);

  const [confirmPushData, setConfirmPushData] = useState(null); // { batchId, carrier, count, orderIds }

  const hasUnsavedDraft = () =>
    pendingChangesRef.current.size > 0 || dbQueueRef.current.length > 0;

  // --- Common Filter State ---
  const [filterValues, setFilterValues] = useState({
    market: [],
    product: [],
    nv_sale: [],
    nv_mkt: [],
    nv_van_don: [],
    shipping_unit: [],
    tracking_include: '',
    tracking_exclude: '',
    tracking_status: 'Tình trạng mã'
  });

  /** Tra nhanh theo SĐT / tên / địa chỉ — chỉ lọc client, không đưa vào query API. */
  const [customerQuickSearch, setCustomerQuickSearch] = useState('');

  // Calculate 3 days ago (today, yesterday, day before yesterday)
  const getThreeDaysAgo = () => {
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 2); // 2 days ago (including today = 3 days)
    return threeDaysAgo.toISOString().split('T')[0];
  };

  const getToday = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Admin xem tất cả dữ liệu, User thường chỉ xem 3 ngày gần nhất
  const [dateFrom, setDateFrom] = useState(isAdmin ? '' : getThreeDaysAgo());
  const [dateTo, setDateTo] = useState(isAdmin ? '' : getToday());
  const [enableDateFilter, setEnableDateFilter] = useState(!isAdmin);
  const [quickFilter, setQuickFilter] = useState('');
  const [fixedColumns, setFixedColumns] = useState(2);
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('vanDon_visibleColumns');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing saved columns:', e);
      }
    }
    // Initialize with default columns
    const initial = {};
    const cols = viewMode === 'ORDER_MANAGEMENT' ? ORDER_MGMT_COLUMNS : DEFAULT_BILL_LADING_COLUMNS;
    cols.forEach(col => {
      initial[col] = true;
    });
    return initial;
  });

  // --- Order Mgmt Specific State ---
  const [omActiveTeam, setOmActiveTeam] = useState('all');
  const [omDateType, setOmDateType] = useState('Ngày đóng hàng');
  const [omShowTracking, setOmShowTracking] = useState(false);
  const [omShowDuplicateTracking, setOmShowDuplicateTracking] = useState(false);

  // --- Bill of Lading Specific State ---
  const [bolActiveTab, setBolActiveTab] = useState('all'); // all, ca_nhan, readonly_all, japan, hanoi
  const [bolDateType, setBolDateType] = useState('Ngày lên đơn');
  const [isLongTextExpanded, setIsLongTextExpanded] = useState(false);
  const [canViewHaNoi, setCanViewHaNoi] = useState(false); // User có quyền xem tab Đẩy đơn Hà Nội không

  // --- Pagination ---
  /** Tab readonly_all: cho phép tới 1000 dòng/trang; các tab khác tối đa 500. */
  const maxRowsPerPageForTab = bolActiveTab === 'readonly_all' ? 1000 : 500;
  const clampRowsPerPage = (v) => {
    const n = Number(v) || 50;
    return Math.max(50, Math.min(n, maxRowsPerPageForTab));
  };
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem('vanDon_rowsPerPage');
    return clampRowsPerPage(saved ? Number(saved) : 50);
  });

  // Save rowsPerPage to localStorage; rút về max tab khi đổi tab (vd: 1000 → 500)
  useEffect(() => {
    const normalized = clampRowsPerPage(rowsPerPage);
    if (normalized !== rowsPerPage) {
      setRowsPerPage(normalized);
      return;
    }
    localStorage.setItem('vanDon_rowsPerPage', String(normalized));
  }, [rowsPerPage, bolActiveTab]);

  // --- Selection & Clipboard ---
  const [selection, setSelection] = useState({
    startRow: null, startCol: null, endRow: null, endCol: null
  });
  const [copiedData, setCopiedData] = useState(null);
  const [copiedSelection, setCopiedSelection] = useState(null);
  const [stickyOffsets, setStickyOffsets] = useState([]);
  const [horizontalTrackWidth, setHorizontalTrackWidth] = useState(0);
  const isSelecting = useRef(false);
  /** Kéo chọn vùng ô: neo (anchor) + điểm bắt đầu chuột (kể cả khi mousedown trên input/select). */
  const selectionPointerDragRef = useRef(null);
  const tableRef = useRef(null);
  const vanDonHeaderContainerRef = useRef(null);
  const vanDonScrollContainerRef = useRef(null);
  const splitLeftPaneRef = useRef(null);
  const splitRightPaneRef = useRef(null);
  const horizontalScrollHostRef = useRef(null);
  const horizontalScrollbarRef = useRef(null);

  // --- Row Selection for Hanoi Tab ---
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showPhanFFMDropdown, setShowPhanFFMDropdown] = useState(false);
  const phanFFMRef = useRef(null);

  // Khóa thanh trượt ngoài cùng của trang, chỉ giữ scroll trong vùng bảng.
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  // --- MGT Noi Bo specific ---
  const [mgtNoiBoOrder, setMgtNoiBoOrder] = useState([]);

  // --- Removed Old Queue Map ---
  // --- Toasts ---
  const [toasts, setToasts] = useState([]);
  const toastIdCounter = useRef(0);

  // --- Initialize ---
  useEffect(() => {
    // Only load data on mount, subsequent loads handled by filter/pagination useEffect
    const storedChanges = localStorage.getItem('speegoPendingChanges');
    if (storedChanges) {
      try {
        const parsed = JSON.parse(storedChanges);
        const map = new Map();
        const startupQueue = [];

        for (const id in parsed) {
          const innerMap = new Map();
          for (const key in parsed[id]) {
            innerMap.set(key, parsed[id][key]);

            // Push into DB Queue directly from localStorage
            startupQueue.push({
              orderId: id,
              colKey: key,
              originalValue: parsed[id][key].originalValue,
              newValue: parsed[id][key].newValue
            });
          }
          map.set(id, innerMap);
        }

        // Populate UI Map
        setPendingChanges(map);
        // Pre-fill backend queue
        if (startupQueue.length > 0) {
          dbQueueRef.current.push(...startupQueue);
          // Don't auto-start here to avoid double-loading clash, wait for interaction 
          // (or export processDbQueue to this scope if desired)
        }
      } catch (e) {
        console.error("Error loading pending changes", e);
      }
    }
    const storedSnaps = localStorage.getItem('speegoPendingRowSnapshots');
    if (storedSnaps) {
      try {
        const parsed = JSON.parse(storedSnaps);
        Object.entries(parsed).forEach(([id, row]) => {
          if (row && typeof row === 'object') pendingRowSnapshotsRef.current.set(id, row);
        });
      } catch (e) {
        console.error('Error loading pending row snapshots', e);
      }
    }
  }, []);

  // --- Global Keyboard Shortcuts (Ctrl+Enter) for Bill of Lading ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (viewMode === 'BILL_OF_LADING' && e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        setIsLongTextExpanded(prev => {
          const newState = !prev;
          addToast(newState ? "Đã mở rộng ô văn bản" : "Đã thu gọn ô văn bản", 'info', 1500);
          return newState;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);

  // --- Toast Helpers ---
  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++toastIdCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // --- Helper Functions ---
  const extractDateFromDateTime = (dateTimeString) => {
    if (!dateTimeString) return '';
    const str = String(dateTimeString).trim();
    
    // Case 1: Standard YYYY-MM-DD[...]
    if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
      return str.split('T')[0].split(' ')[0];
    }
    
    // Case 2: DD/MM/YYYY[...]
    if (str.includes('/')) {
      const parts = str.split(' ')[0].split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts.map(Number);
        const fullYear = y < 100 ? 2000 + y : y;
        return `${fullYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    
    return str;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const str = String(dateString).trim();
      let date;

      // Xử lý định dạng yyyy-mm-dd (như "2026-01-25")
      if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = str.split('-').map(Number);
        date = new Date(year, month - 1, day);
      }
      // Xử lý định dạng dd/mm/yyyy
      else if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
          const year = parseInt(parts[2], 10);
          date = new Date(year, month, day);
        } else {
          date = new Date(str);
        }
      }
      // Xử lý ISO string hoặc các định dạng khác
      else {
        date = new Date(str.includes('Z') || str.includes('T') ? str : str);
      }

      if (isNaN(date.getTime())) {
        return dateString; // Trả về nguyên bản nếu không parse được
      }

      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString;
    }
  };

  /** Ghép các đơn có thay đổi chưa lưu nhưng không còn trong trang API (do đổi bộ lọc / trang). */
  const mergePendingRowsIntoFetchedData = (rows) => {
    const pending = pendingChangesRef.current;
    if (!pending || pending.size === 0) return rows;
    const ids = new Set(rows.map(r => r[PRIMARY_KEY_COLUMN]));
    const extra = [];
    pending.forEach((_, orderId) => {
      if (ids.has(orderId)) return;
      const snap = pendingRowSnapshotsRef.current.get(orderId);
      if (!snap) return;
      if (!rowMatchesBolTabForInject(snap, bolActiveTab)) return;
      extra.push({ ...snap });
    });
    return extra.length ? [...rows, ...extra] : rows;
  };

  /** Lọc ô header cột + tracking — gửi API để lọc toàn CSDL (không chỉ trang hiện tại). */
  const serverColumnFilters = useMemo(() => {
    if (!useBackendPagination) return {};
    const out = {};
    const DATE_FILTER_KEYS = ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2'];
    const activeDateType = viewMode === 'ORDER_MANAGEMENT' ? omDateType : bolDateType;
    const toolbarDateOverrideKeys =
      activeDateType === 'Ngày đẩy đơn'
        ? new Set(['Ngày đẩy đơn', 'Ngày Kế toán đối soát với FFM lần 2'])
        : new Set([activeDateType]);

    Object.entries(filterValues).forEach(([key, val]) => {
      if (['market', 'product', 'nv_sale', 'nv_mkt', 'nv_van_don', 'shipping_unit', 'tracking_include', 'tracking_exclude', 'tracking_status'].includes(key)) return;
      if (enableDateFilter && DATE_FILTER_KEYS.includes(key) && toolbarDateOverrideKeys.has(key)) return;
      if (val == null) return;
      if (Array.isArray(val) && val.length === 0) return;
      if (typeof val === 'string' && val.trim() === '') return;
      out[key] = val;
    });
    return out;
  }, [useBackendPagination, filterValues, enableDateFilter, viewMode, omDateType, bolDateType]);

  const serverTrackingFilter = useMemo(() => {
    if (!useBackendPagination) return null;
    if (!filterValues.tracking_status && !filterValues.tracking_include && !filterValues.tracking_exclude) return null;
    return {
      status: filterValues.tracking_status || 'Tình trạng mã',
      include: filterValues.tracking_include || '',
      exclude: filterValues.tracking_exclude || ''
    };
  }, [useBackendPagination, filterValues.tracking_status, filterValues.tracking_include, filterValues.tracking_exclude]);

  // --- Data Loading with React Query ---
  const queryClient = useQueryClient();

  // Create stable filter object for query key
  const activeFilters = useMemo(() => {
    const sessionName = getVanDonSessionDisplayName().trim();
    const filters = {
      team: bolActiveTab === 'hanoi' ? 'Hà Nội' : (omActiveTeam !== 'all' ? omActiveTeam : undefined),
      market: bolActiveTab === 'japan' ? ['Nhật Bản', 'CĐ Nhật Bản'] : filterValues.market,
      product: filterValues.product,
      nv_sale: filterValues.nv_sale,
      nv_mkt: filterValues.nv_mkt,
      nv_van_don: filterValues.nv_van_don,
      shipping_unit: filterValues.shipping_unit,
      dateFrom: enableDateFilter ? dateFrom : undefined,
      dateTo: enableDateFilter ? dateTo : undefined,
      dateType: bolDateType,
      tab: bolActiveTab,
      /** Tab Đơn cá nhân: lọc delivery_staff khớp tên đăng nhập (đưa vào queryKey). */
      deliveryStaffSelfFilter: bolActiveTab === 'ca_nhan' ? sessionName : undefined,
      page: currentPage,
      limit: rowsPerPage,
      useBackend: useBackendPagination,
      columnFilters: serverColumnFilters,
      trackingFilter: serverTrackingFilter
    };
    console.log('🔍 [VanDon] Active Filters:', filters);
    return filters;
  }, [bolActiveTab, omActiveTeam, filterValues, enableDateFilter, dateFrom, dateTo, bolDateType, currentPage, rowsPerPage, useBackendPagination, serverColumnFilters, serverTrackingFilter]);

  const {
    data: queryResult,
    isLoading: isQueryLoading,
    isFetching,
    refetch: refetchVanDonData
  } = useQuery({
    queryKey: [
      'vanDon',
      activeFilters,
      activeFilters.tab === 'japan' || activeFilters.tab === 'hanoi'
        ? 'no-personnel-scope'
        : selectedPersonnelNames.slice().sort().join('|'),
      isAdmin
    ],
    queryFn: async () => {
      console.log('🚀 [VanDon] Query Function Started. useBackendPagination:', useBackendPagination, 'permissionsLoading:', permissionsLoading);
      if (!useBackendPagination || permissionsLoading) return null;

      const userJson = localStorage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;
      const userName = [
        localStorage.getItem("username"),
        user?.['Họ_và_tên'],
        user?.['Họ và tên'],
        user?.['Họ Và Tên'],
        user?.full_name,
        user?.name,
      ]
        .map((v) => String(v || "").trim())
        .find(Boolean) || "";
      const isManager = isAdmin || ['admin', 'director', 'manager', 'super_admin'].includes((role || '').toLowerCase());

      let allAllowedNames = [];
      if (!isManager) {
        const picked = (selectedPersonnelNames || []).map((n) => String(n || "").trim()).filter(Boolean);
        const selfKeys = getVanDonSelfNameKeySet();
        const withoutSelf = picked.filter((n) => !isVanDonStaffNameSelf(n, selfKeys));
        /**
         * - Còn tên khác sau khi trừ bản thân → chỉ OR các tên đó (tab Đơn nhắc hộ không tự thêm mình).
         * - RBAC chỉ có đúng tên mình → vẫn dùng `picked`, không để trang trắng.
         * - RBAC rỗng → fallback `userName` như trước (môi trường chưa cấu hình danh sách).
         */
        if (withoutSelf.length > 0) {
          allAllowedNames = withoutSelf;
        } else if (picked.length > 0) {
          allAllowedNames = picked;
        } else if (userName) {
          allAllowedNames = [userName];
        }
      }

      const selfDeliveryName =
        activeFilters.tab === 'ca_nhan' ? String(activeFilters.deliveryStaffSelfFilter || userName || '').trim() : '';

      if (activeFilters.tab === 'ca_nhan' && !selfDeliveryName) {
        return {
          data: [],
          total: 0,
          totalAmountVndSum: 0,
          page: currentPage,
          limit: rowsPerPage,
          totalPages: 0
        };
      }

      /** Tab khác `ca_nhan` / `japan` / `hanoi` / `readonly_all` cần `allowedStaff`: nếu không còn tên, không gọi API không lọc NV (sẽ lộ dữ liệu). Đơn Nhật + Đẩy Hà Nội + Xem tất cả (khóa sửa): không khóa theo danh sách nhân sự — phạm vi đã gắn với tab / ngày / bộ lọc toolbar. */
      if (
        !isManager &&
        activeFilters.tab !== 'ca_nhan' &&
        activeFilters.tab !== 'japan' &&
        activeFilters.tab !== 'hanoi' &&
        activeFilters.tab !== 'readonly_all' &&
        allAllowedNames.length === 0
      ) {
        return {
          data: [],
          total: 0,
          totalAmountVndSum: 0,
          page: currentPage,
          limit: rowsPerPage,
          totalPages: 0
        };
      }

      /** Đơn cá nhân / Đơn Nhật / Đẩy Hà Nội / Xem tất cả (khóa sửa): không gửi `allowedStaff` (Hà Nội = full hàng đợi Team Hà Nội; cá nhân chỉ `deliveryStaffSelfFilter`; readonly = xem toàn phạm vi theo ngày + bộ lọc). */
      const allowedStaffForRequest =
        isManager ||
        activeFilters.tab === 'ca_nhan' ||
        activeFilters.tab === 'japan' ||
        activeFilters.tab === 'hanoi' ||
        activeFilters.tab === 'readonly_all'
          ? undefined
          : allAllowedNames.length > 0
            ? allAllowedNames
            : undefined;

      const result = await API.fetchVanDon({
        page: currentPage,
        limit: rowsPerPage,
        team: activeFilters.team,
        market: activeFilters.market,
        product: activeFilters.product,
        nv_sale: activeFilters.nv_sale,
        nv_mkt: activeFilters.nv_mkt,
        nv_van_don: activeFilters.nv_van_don,
        shipping_unit: activeFilters.shipping_unit,
        dateFrom: activeFilters.dateFrom,
        dateTo: activeFilters.dateTo,
        dateType: activeFilters.dateType,
        allowedStaff: allowedStaffForRequest,
        deliveryStaffSelfFilter: selfDeliveryName || undefined,
        columnFilters: activeFilters.columnFilters || {},
        trackingFilter: activeFilters.trackingFilter || null
      });

      console.log('✅ [VanDon] fetchVanDon Result:', {
        count: result.data?.length || 0,
        total: result.total,
        isManager,
        tab: activeFilters.tab,
        allowedStaff: isManager ? 'ALL' : allowedStaffForRequest ?? '(none)',
        deliveryStaffSelfFilter: selfDeliveryName || '(none)'
      });

      if (result.error) {
        console.error('❌ [VanDon] API Error:', result.error);
        throw new Error(result.error);
      }

      // Load MGT Noi Bo in background if needed
      API.fetchMGTNoiBoOrders().then(mgtOrder => setMgtNoiBoOrder(mgtOrder));

      return result;
    },
    enabled: useBackendPagination && !permissionsLoading,
    keepPreviousData: true,
  });

  const { data: vanDonDistinctFilterOptions = {} } = useQuery({
    queryKey: ['vanDonDistinctFilterOptions'],
    queryFn: () => API.fetchVanDonDistinctFilterOptions(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !permissionsLoading
  });

  const allData = useMemo(() => {
    let rows = queryResult?.data || [];
    if (bolActiveTab === 'hanoi') {
      rows = rows.filter(row => {
        const checkResult = String(row['Kết quả Check'] || row['Kết quả check'] || '').trim();
        const deliveryUnit = String(row['Đơn vị vận chuyển'] || row['Đơn vị Vận chuyển'] || '').trim();
        return checkResult.toLowerCase() === 'ok' && isVanDonSemanticEmpty(deliveryUnit);
      });
    }
    const result = mergePendingRowsIntoFetchedData(rows);
    console.log('📊 [VanDon] Final allData length:', result.length);
    return result;
  }, [queryResult?.data, bolActiveTab]);

  const totalRecords = queryResult?.total || 0;
  const totalAmountVndSumFromServer = queryResult?.totalAmountVndSum ?? 0;
  // totalPages is calculated below based on pagination mode

  const getFilteredData = useMemo(() => {
    let data = [...allData];

    // 1. Apply changes (Pending > Original)
    data = data.map(row => {
      const orderId = row[PRIMARY_KEY_COLUMN];
      let rowCopy = { ...row };

      // Computed columns (giữ giá trị map từ DB nếu không có cột “lần 1”)
      rowCopy["Ngày đẩy đơn"] = extractDateFromDateTime(row["Ngày Kế toán đối soát với FFM lần 2"]);
      rowCopy["Ngày có mã tracking"] = extractDateFromDateTime(
        row["Ngày Kế toán đối soát với FFM lần 1"] ?? row["Ngày có mã tracking"]
      );

      const pending = pendingChanges.get(orderId);
      if (pending) {
        pending.forEach((info, key) => { rowCopy[key] = info.newValue; });
      }
      return rowCopy;
    });

    /** Giá trị gốc (trước khi sửa) để so khớp lọc — tránh hàng biến mất khi đổi ô chưa lưu. */
    const getPendingOriginal = (orderId, ...keyCandidates) => {
      const pmap = pendingChanges.get(orderId);
      if (!pmap?.size) return undefined;
      for (const k of keyCandidates) {
        if (k && pmap.has(k)) return pmap.get(k).originalValue;
      }
      const lowers = keyCandidates.filter(Boolean).map((k) => String(k).toLowerCase());
      for (const [colKey, info] of pmap.entries()) {
        const lc = String(colKey || '').toLowerCase();
        if (lowers.includes(lc)) return info.originalValue;
      }
      return undefined;
    };
    const strNorm = (v) => String(v ?? '').trim();

    if (viewMode === 'ORDER_MANAGEMENT') {
      // --- ORDER MANAGEMENT FILTERING LOGIC ---

      // Filter by Carrier (MGT only)
      data = data.filter(row => {
        const carrier = row["Đơn vị vận chuyển"] || row["Đơn_vị_vận_chuyển"];
        return carrier?.toString().toUpperCase() === "MGT";
      });

      // Team Filter
      if (omActiveTeam === 'mgt_noi_bo') {
        const orderedIds = new Set(mgtNoiBoOrder);
        data = data.filter(row => orderedIds.has(row[PRIMARY_KEY_COLUMN]));
      } else if (omActiveTeam !== 'all') {
        data = data.filter(row => row[TEAM_COLUMN_NAME] === omActiveTeam);
      }

      // Mode View (Tracking)
      if (omShowDuplicateTracking) {
        const counts = new Map();
        data.forEach(r => {
          const oid = r[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(oid, 'Mã Tracking', 'Mã tracking');
          const code = o !== undefined ? strNorm(o) : strNorm(r['Mã Tracking'] || '');
          if (code) counts.set(code, (counts.get(code) || 0) + 1);
        });
        data = data.filter(r => {
          const oid = r[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(oid, 'Mã Tracking', 'Mã tracking');
          const code = o !== undefined ? strNorm(o) : strNorm(r['Mã Tracking'] || '');
          return (counts.get(code) || 0) > 1;
        });
        data.sort((a, b) => String(a['Mã Tracking']).localeCompare(String(b['Mã Tracking'])));
      } else {
        data = data.filter(row => {
          const orderId = row[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(orderId, 'Mã Tracking', 'Mã tracking');
          const code = o !== undefined ? strNorm(o) : strNorm(row['Mã Tracking'] || '');
          return omShowTracking ? code !== '' : !code;
        });
        // Sort by STT
        data.sort((a, b) => (Number(a['rowIndex'] || 0) - Number(b['rowIndex'] || 0)));
      }

    } else {
      // --- BILL OF LADING FILTERING LOGIC ---

      // Filter: đơn phải có ít nhất một tên nhân sự — Admin, Đơn Nhật, Đẩy Hà Nội, Xem tất cả (khóa sửa) không áp (hàng đợi FFM có thể thiếu cột NV / đơn Nhật; tab chỉ xem cần đủ tập để lọc toolbar)
      if (!isAdmin && bolActiveTab !== 'japan' && bolActiveTab !== 'hanoi' && bolActiveTab !== 'readonly_all') {
        const initialDataLength = data.length;
        data = data.filter(row => {
          const saleStaff = String(row.sale_staff || row["Nhân viên Sale"] || '').trim();
          const mktStaff = String(row.marketing_staff || row["Nhân viên MKT"] || '').trim();
          const deliveryStaff = String(row.delivery_staff || row["NV Vận đơn"] || row["Nhân viên Vận đơn"] || '').trim();
          return (
            !isVanDonSemanticEmpty(saleStaff) ||
            !isVanDonSemanticEmpty(mktStaff) ||
            !isVanDonSemanticEmpty(deliveryStaff)
          );
        });
        console.log('🔍 [VanDon Client-side] Filtered out orders with empty personnel names:', initialDataLength - data.length, 'orders removed');
      } else if (isAdmin) {
        console.log('👑 [VanDon Client-side] Admin - Không filter theo nhân sự (hiển thị tất cả)');
      }

      // Tab Logic - use early filtering to reduce dataset size (Admin không bị filter)
      if (!isAdmin) {
        if (bolActiveTab === 'japan') {
          // Tab "Đơn Nhật": full đơn thị trường Nhật (đã lọc country ở API; client khớp thêm cột Khu vực)
          data = data.filter(row => {
            const country = String(row.country || row['Country'] || row['Khu vực'] || '').trim();
            return country === 'Nhật Bản' || country === 'CĐ Nhật Bản' ||
              country.toLowerCase() === 'nhật bản' || country.toLowerCase() === 'cđ nhật bản';
          });
        } else if (bolActiveTab === 'ca_nhan') {
          const n = getVanDonSessionDisplayName().trim().toLowerCase();
          data = n ? data.filter((row) => vanDonDeliveryStaffIsSelf(row, n)) : [];
        } else if (bolActiveTab === 'hanoi') {
          // Tab "Đẩy đơn Hà Nội": chỉ hiển thị đơn có Team="Hà Nội", Kết quả Check="Ok", Mã Tracking trống/null và Đơn vị vận chuyển trống/null
          data = data.filter(row => {
            const team = String(row['Team'] || '').trim();
            const checkResult = String(row['Kết quả Check'] || row['Kết quả check'] || '').trim();
            const tracking = String(row['Mã Tracking'] || row['Mã tracking'] || '').trim();
            const deliveryUnit = String(row['Đơn vị vận chuyển'] || row['Đơn vị Vận chuyển'] || '').trim();

            // Team phải là "Hà Nội"
            const isTeamHanoi = team === 'Hà Nội';
            // Kết quả Check phải là "Ok" hoặc "OK"
            const isCheckOk = checkResult.toLowerCase() === 'ok';
            // Mã Tracking phải trống hoặc null
            const isTrackingEmpty = isVanDonSemanticEmpty(tracking);
            // Đơn vị vận chuyển phải trống hoặc null
            const isDeliveryUnitEmpty = isVanDonSemanticEmpty(deliveryUnit);

            return isTeamHanoi && isCheckOk && isTrackingEmpty && isDeliveryUnitEmpty;
          });
          console.log('🏛️ [VanDon Fallback] Tab Hà Nội - Filtered by Team="Hà Nội", Check="Ok", empty Tracking and empty Đơn vị vận chuyển:', data.length, 'orders');
        }
      } else {
        console.log('👑 [VanDon Client-side] Admin - Không filter theo tab (hiển thị tất cả)');
      }

      // Sort by Date Desc - optimized with cached date parsing
      data.sort((a, b) => {
        const da = new Date(a["Ngày lên đơn"] || a["Thời gian lên đơn"] || 0).getTime();
        const db = new Date(b["Ngày lên đơn"] || b["Thời gian lên đơn"] || 0).getTime();
        return db - da;
      });
    }

    // --- COMMON FILTERS ---
    const activeDateType = viewMode === 'ORDER_MANAGEMENT' ? omDateType : bolDateType;

    const traCuuKhach = strNorm(customerQuickSearch);
    if (traCuuKhach) {
      const qLower = traCuuKhach.toLowerCase();
      const digitsOnly = (s) => String(s ?? '').replace(/\D/g, '');
      const qDigits = digitsOnly(traCuuKhach);
      data = data.filter((row) => {
        const orderId = row[PRIMARY_KEY_COLUMN];
        const nameO = getPendingOriginal(orderId, 'Name*', 'customer_name');
        const phoneO = getPendingOriginal(orderId, 'Phone*', 'customer_phone');
        const addO = getPendingOriginal(orderId, 'Add', 'customer_address');
        const name = strNorm(nameO !== undefined ? nameO : row['Name*'] ?? row.customer_name).toLowerCase();
        const phoneRaw = phoneO !== undefined ? phoneO : row['Phone*'] ?? row.customer_phone ?? '';
        const addr = strNorm(addO !== undefined ? addO : row['Add'] ?? row.customer_address).toLowerCase();
        if (name.includes(qLower)) return true;
        if (addr.includes(qLower)) return true;
        const phoneLower = String(phoneRaw).toLowerCase();
        if (phoneLower.includes(qLower)) return true;
        if (qDigits.length >= 3 && digitsOnly(phoneRaw).includes(qDigits)) return true;
        return false;
      });
    }

    // Market & Product — tab Đơn Nhật / Đẩy Hà Nội: không lọc lại Khu vực / NV trên toolbar (tránh ẩn đơn Nhật trong hàng đợi Hà Nội)
    const queueTabSkipMarketAndNvToolbar = bolActiveTab === 'japan' || bolActiveTab === 'hanoi';
    try {
      if (
        !queueTabSkipMarketAndNvToolbar &&
        filterValues.market &&
        Array.isArray(filterValues.market) &&
        filterValues.market.length > 0
      ) {
        const set = new Set(filterValues.market);
        data = data.filter(row => {
          const orderId = row[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(orderId, 'Khu vực', 'khu vực', 'country');
          const market = o !== undefined ? strNorm(o) : strNorm(row["Khu vực"] || row["khu vực"] || '');
          if ((set.has('Trống') || set.has('__EMPTY__')) && isVanDonSemanticEmpty(market)) return true;
          return !isVanDonSemanticEmpty(market) && set.has(market);
        });
      }
      if (filterValues.product && Array.isArray(filterValues.product) && filterValues.product.length > 0) {
        const set = new Set(filterValues.product);
        data = data.filter(row => {
          const orderId = row[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(orderId, 'Mặt hàng');
          const product = o !== undefined ? strNorm(o) : strNorm(row["Mặt hàng"] || '');
          if ((set.has('Trống') || set.has('__EMPTY__')) && isVanDonSemanticEmpty(product)) return true;
          return !isVanDonSemanticEmpty(product) && set.has(product);
        });
      }
      if (
        !queueTabSkipMarketAndNvToolbar &&
        filterValues.nv_sale &&
        Array.isArray(filterValues.nv_sale) &&
        filterValues.nv_sale.length > 0
      ) {
        const set = new Set(filterValues.nv_sale);
        data = data.filter((row) => {
          const orderId = row[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(orderId, 'Nhân viên Sale', 'sale_staff');
          const v = o !== undefined ? strNorm(o) : strNorm(row.sale_staff || row['Nhân viên Sale'] || '');
          if ((set.has('Trống') || set.has('__EMPTY__')) && isVanDonSemanticEmpty(v)) return true;
          return !isVanDonSemanticEmpty(v) && set.has(v);
        });
      }
      if (
        !queueTabSkipMarketAndNvToolbar &&
        filterValues.nv_mkt &&
        Array.isArray(filterValues.nv_mkt) &&
        filterValues.nv_mkt.length > 0
      ) {
        const set = new Set(filterValues.nv_mkt);
        data = data.filter((row) => {
          const orderId = row[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(orderId, 'Nhân viên MKT', 'marketing_staff');
          const v = o !== undefined ? strNorm(o) : strNorm(row.marketing_staff || row['Nhân viên MKT'] || '');
          if ((set.has('Trống') || set.has('__EMPTY__')) && isVanDonSemanticEmpty(v)) return true;
          return !isVanDonSemanticEmpty(v) && set.has(v);
        });
      }
      if (
        !queueTabSkipMarketAndNvToolbar &&
        filterValues.nv_van_don &&
        Array.isArray(filterValues.nv_van_don) &&
        filterValues.nv_van_don.length > 0
      ) {
        const set = new Set(filterValues.nv_van_don);
        data = data.filter((row) => {
          const orderId = row[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(orderId, 'NV Vận đơn', 'Nhân viên Vận đơn', 'delivery_staff');
          const v = o !== undefined ? strNorm(o) : strNorm(row.delivery_staff || row['NV Vận đơn'] || row['Nhân viên Vận đơn'] || '');
          if ((set.has('Trống') || set.has('__EMPTY__')) && isVanDonSemanticEmpty(v)) return true;
          return !isVanDonSemanticEmpty(v) && set.has(v);
        });
      }
      if (filterValues.shipping_unit && Array.isArray(filterValues.shipping_unit) && filterValues.shipping_unit.length > 0) {
        const set = new Set(filterValues.shipping_unit);
        data = data.filter((row) => {
          const orderId = row[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(orderId, 'Đơn vị vận chuyển', 'Đơn vị Vận chuyển', 'Đơn_vị_vận_chuyển');
          const v = o !== undefined ? strNorm(o) : strNorm(row['Đơn vị vận chuyển'] || row['Đơn_vị_vận_chuyển'] || '');
          if ((set.has('Trống') || set.has('__EMPTY__')) && isVanDonSemanticEmpty(v)) return true;
          return !isVanDonSemanticEmpty(v) && set.has(v);
        });
      }
    } catch (err) {
      console.warn('⚠️ [Filter Error] Lỗi khi xử lý Market/Product filter:', err);
    }

    // Date Range (toolbar "Lọc thời gian") — cùng quy tắc chuẩn hóa ngày với lọc cột & API (YYYY-MM-DD)
    if (enableDateFilter) {
      if (dateFrom) {
        const fromNorm = String(dateFrom).split('T')[0];
        data = data.filter((row) => {
          const orderId = row[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(orderId, activeDateType, COLUMN_MAPPING[activeDateType]);
          const raw = o !== undefined ? o : row[activeDateType];
          if (isVanDonSemanticEmpty(raw)) return false;
          if (!raw) return false;
          const rowDay = extractDateFromDateTime(raw);
          return rowDay && rowDay >= fromNorm;
        });
      }
      if (dateTo) {
        const toNorm = String(dateTo).split('T')[0];
        data = data.filter((row) => {
          const orderId = row[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(orderId, activeDateType, COLUMN_MAPPING[activeDateType]);
          const raw = o !== undefined ? o : row[activeDateType];
          if (isVanDonSemanticEmpty(raw)) return false;
          if (!raw) return false;
          const rowDay = extractDateFromDateTime(raw);
          return rowDay && rowDay <= toNorm;
        });
      }
    }

    // Cột ngày trùng với "Loại ngày+ khoảng" trên toolbar → đã lọc ở trên, bỏ lọc 1 ngày ở header cho tránh lệch / chồng hai bộ lọc
    const DATE_FILTER_KEYS = ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2'];
    const toolbarDateOverrideKeys =
      activeDateType === 'Ngày đẩy đơn'
        ? new Set(['Ngày đẩy đơn', 'Ngày Kế toán đối soát với FFM lần 2'])
        : new Set([activeDateType]);

    // Column Filters (Text & Dropdown) — phân trang backend: đã lọc ở API (toàn CSDL).
    if (!useBackendPagination) {
      Object.entries(filterValues).forEach(([key, val]) => {
        if (['market', 'product', 'nv_sale', 'nv_mkt', 'nv_van_don', 'shipping_unit', 'tracking_include', 'tracking_exclude', 'tracking_status'].includes(key)) return;

        if (
          enableDateFilter &&
          DATE_FILTER_KEYS.includes(key) &&
          toolbarDateOverrideKeys.has(key)
        ) {
          return;
        }

        if (val === null || val === undefined) return;
        if (Array.isArray(val) && val.length === 0) return;
        if (typeof val === 'string' && val.trim() === '') return;

        const dataKey = COLUMN_MAPPING[key] || key;

        try {
          data = data.filter(row => {
            try {
              const orderId = row[PRIMARY_KEY_COLUMN];
              let cellValue = '';
              if (key === 'Mã đơn hàng') {
                const o = getPendingOriginal(orderId, 'Mã đơn hàng', 'order_code', 'orderCode', PRIMARY_KEY_COLUMN);
                if (o !== undefined) cellValue = strNorm(o);
                else cellValue = strNorm(row['Mã đơn hàng'] ?? row['order_code'] ?? row['orderCode'] ?? row[PRIMARY_KEY_COLUMN] ?? '');
              } else {
                const o = getPendingOriginal(
                  orderId,
                  key,
                  dataKey,
                  key.replace(/ /g, '_'),
                  String(dataKey || '').replace(/ /g, '_')
                );
                if (o !== undefined) cellValue = strNorm(o);
                else cellValue = strNorm(row[dataKey] ?? row[key] ?? row[key.replace(/ /g, '_')] ?? row[dataKey.replace(/ /g, '_')] ?? '');
              }

              if (DROPDOWN_OPTIONS[dataKey] || DROPDOWN_OPTIONS[key] || ["Trạng thái giao hàng", "Kết quả check", "GHI CHÚ"].includes(dataKey)) {
                if (!Array.isArray(val)) return true;
                const selected = val;
                if (selected.length === 0) return true;
                if (isVanDonSemanticEmpty(cellValue) && (selected.includes('Trống') || selected.includes('__EMPTY__'))) return true;
                return selected.includes(cellValue);
              }

              if (["Ngày lên đơn", "Ngày đóng hàng", "Ngày đẩy đơn", "Ngày có mã tracking", "Ngày Kế toán đối soát với FFM lần 2"].includes(key)) {
                if (isVanDonSemanticEmpty(cellValue)) return false;
                if (!cellValue) return false;
                if (typeof val !== 'string') return true;

                const rowDate = extractDateFromDateTime(cellValue);
                const filterDate = extractDateFromDateTime(val);

                if (!rowDate || !filterDate) return true;
                return rowDate === filterDate;
              }

              if (typeof val !== 'string') return true;
              const searchVal = val.toLowerCase().trim();
              if (!searchVal) return true;
              return cellValue.toLowerCase().includes(searchVal);
            } catch (err) {
              console.warn(`⚠️ [Filter Error] Lỗi khi filter column "${key}":`, err);
              return true;
            }
          });
        } catch (err) {
          console.warn(`⚠️ [Filter Error] Lỗi khi xử lý filter cho key "${key}":`, err);
        }
      });
    }

    if (!useBackendPagination) {
      try {
        if (filterValues.tracking_status || filterValues.tracking_include || filterValues.tracking_exclude) {
          const inc = filterValues.tracking_include ? String(filterValues.tracking_include).toLowerCase() : '';
          const exc = filterValues.tracking_exclude ? String(filterValues.tracking_exclude).toLowerCase() : '';
          const status = filterValues.tracking_status || 'Tình trạng mã';

          data = data.filter(row => {
            try {
              const orderId = row[PRIMARY_KEY_COLUMN];
              const o = getPendingOriginal(orderId, 'Mã Tracking', 'Mã tracking');
              const code = o !== undefined ? strNorm(o) : strNorm(row['Mã Tracking'] || row['Mã tracking'] || '');
              const lowerCode = code.toLowerCase();

              if (status === 'Tất cả có mã' && isVanDonSemanticEmpty(code)) return false;
              if (status === 'Trống' && !isVanDonSemanticEmpty(code)) return false;
              if (status === 'Toàn số' && (isVanDonSemanticEmpty(code) || !/^\d+$/.test(code))) return false;

              if (status === 'Tình trạng mã') {
                if (exc && exc.trim() && lowerCode.includes(exc)) return false;
                if (inc && inc.trim()) {
                  if (inc.includes('\n')) {
                    const codes = new Set(inc.split('\n').map(t => t.trim()).filter(Boolean).map(t => t.toLowerCase()));
                    if (!codes.has(lowerCode)) return false;
                  } else {
                    if (!lowerCode.includes(inc)) return false;
                  }
                }
              }
              return true;
            } catch (err) {
              console.warn('⚠️ [Filter Error] Lỗi khi filter tracking:', err);
              return true;
            }
          });
        }
      } catch (err) {
        console.warn('⚠️ [Filter Error] Lỗi khi xử lý tracking filter:', err);
      }
    }

    return data;
  }, [allData, pendingChanges, viewMode, omActiveTeam, omDateType, omShowTracking, omShowDuplicateTracking, bolActiveTab, bolDateType, filterValues, customerQuickSearch, dateFrom, dateTo, enableDateFilter, mgtNoiBoOrder, isAdmin, useBackendPagination]);

  // --- Render Prep (moved up for dependencies) ---
  // Use fewer rows for Bill of Lading due to long text columns
  const effectiveRowsPerPage = clampRowsPerPage(rowsPerPage);

  // If using backend pagination, data is already paginated
  const paginatedData = useMemo(() => {
    if (useBackendPagination) {
      // Data is already paginated from backend, just apply client-side filters (tracking, etc.)
      return getFilteredData;
    } else {
      // Old way: paginate client-side
      return getFilteredData.slice((currentPage - 1) * effectiveRowsPerPage, currentPage * effectiveRowsPerPage);
    }
  }, [getFilteredData, currentPage, effectiveRowsPerPage, useBackendPagination]);

  const totalPages = useBackendPagination
    ? Math.ceil(totalRecords / effectiveRowsPerPage)
    : Math.ceil(getFilteredData.length / effectiveRowsPerPage);

  // Rebuild missing snapshots when data arrives
  useEffect(() => {
    if (queryResult?.data) {
      queryResult.data.forEach((row) => {
        const orderId = row[PRIMARY_KEY_COLUMN];
        if (pendingChangesRef.current.has(orderId) && !pendingRowSnapshotsRef.current.has(orderId)) {
          const pmap = pendingChangesRef.current.get(orderId);
          const copy = { ...row };
          pmap.forEach((info, key) => { copy[key] = info.newValue; });
          pendingRowSnapshotsRef.current.set(orderId, copy);
        }
      });
      savePendingToLocalStorage(pendingChangesRef.current);
    }
  }, [queryResult?.data, savePendingToLocalStorage]);

  const loadData = () => refetchVanDonData();
  const refreshData = async (opts = {}) => {
    const skipUnsavedCheck = opts.skipUnsavedCheck === true;
    const hasUnsaved =
      pendingChanges.size > 0 ||
      dbQueueRef.current.length > 0 ||
      changeHistoryRef.current.length > 0;
    if (!skipUnsavedCheck && hasUnsaved) {
      const ok = window.confirm(
        'Bạn có thay đổi chưa lưu (chưa nhấn Xác nhận lưu). Xóa lọc sẽ bỏ các thay đổi này. Tiếp tục?'
      );
      if (!ok) return;
    }
    dbQueueRef.current = [];
    changeHistoryRef.current = [];
    historyIndexRef.current = -1;
    pendingRowSnapshotsRef.current.clear();
    setPendingChanges(new Map());
    localStorage.removeItem('speegoPendingChanges');
    localStorage.removeItem('speegoPendingRowSnapshots');
    // Reset filters
    const defaultFilters = {
      market: [], product: [], nv_sale: [], nv_mkt: [], nv_van_don: [],
      shipping_unit: [], tracking_include: '', tracking_exclude: '',
      tracking_status: 'Tình trạng mã'
    };
    setFilterValues(defaultFilters);
    setCustomerQuickSearch('');
    setDateFrom(isAdmin ? '' : getThreeDaysAgo());
    setDateTo(isAdmin ? '' : getToday());
    setEnableDateFilter(!isAdmin);
    setCurrentPage(1);
    await queryClient.invalidateQueries(['vanDon']);
    queryClient.invalidateQueries({ queryKey: ['vanDonDistinctFilterOptions'] });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (phanFFMRef.current && !phanFFMRef.current.contains(event.target)) {
        setShowPhanFFMDropdown(false);
      }
    };

    if (showPhanFFMDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showPhanFFMDropdown]);

  // Danh sách tên được xem đơn: users.selected_personnel + bảng danh_sach_van_don (chủ + người sửa hộ)
  useEffect(() => {
    const loadSelectedPersonnel = async () => {
      try {
        const userJson = localStorage.getItem("user");
        const user = userJson ? JSON.parse(userJson) : null;
        const userEmail = localStorage.getItem("userEmail") || "";
        const userName = [
          localStorage.getItem("username"),
          user?.['Họ_và_tên'],
          user?.['Họ và tên'],
          user?.['Họ Và Tên'],
          user?.full_name,
          user?.name,
        ]
          .map((v) => String(v || "").trim())
          .find(Boolean) || "";

        if (!userEmail && !userName) {
          setSelectedPersonnelNames([]);
          return;
        }

        const allAllowed = [];

        if (userEmail) {
          const userEmailLower = userEmail.toLowerCase().trim();
          const personnelMap = await rbacService.getSelectedPersonnel([userEmailLower]);
          allAllowed.push(...(personnelMap[userEmailLower] || []));
        }

        const nameCandidates = new Set();
        if (userName) nameCandidates.add(userName);
        if (userEmail) {
          const { data: urow } = await supabase
            .from('users')
            .select('name, username')
            .eq('email', userEmail.trim())
            .maybeSingle();
          const n1 = (urow?.name || '').trim();
          const n2 = (urow?.username || '').trim();
          if (n1) nameCandidates.add(n1);
          if (n2) nameCandidates.add(n2);
        }

        const fromVanDonList = await rbacService.getVanDonVisibleNames({
          userNames: Array.from(nameCandidates),
          userEmail,
        });
        allAllowed.push(...fromVanDonList);

        const validNames = [...new Set(allAllowed.map((n) => String(n || "").trim()))].filter(
          (name) => name.length > 0 && !name.includes('@')
        );

        console.log('📝 [VanDon] Final allowed personnel names:', validNames);
        setSelectedPersonnelNames(validNames);
      } catch (error) {
        console.error('❌ [VanDon] Error loading allowed names:', error);
        setSelectedPersonnelNames([]);
      }
    };

    loadSelectedPersonnel();
  }, []);

  // Kiểm tra quyền xem tab "Đẩy đơn Hà Nội" dựa trên cột can_day_ffm trong users table
  useEffect(() => {
    const loadCanDayFFMPermission = async () => {
      try {
        // Admin luôn có quyền xem tab Hà Nội
        if (isAdmin) {
          console.log('🔐 [VanDon] Admin - luôn có quyền xem Đẩy đơn Hà Nội');
          setCanViewHaNoi(true);
          return;
        }

        const userEmail = localStorage.getItem('userEmail') || '';
        const userId = localStorage.getItem('userId') || '';

        if (!userEmail && !userId) {
          console.log('⚠️ [VanDon] No user email or ID found');
          setCanViewHaNoi(false);
          return;
        }

        // Query user từ bảng users để kiểm tra cột can_day_ffm
        let query = supabase.from('users').select('can_day_ffm');

        if (userId) {
          query = query.eq('id', userId);
        } else if (userEmail) {
          query = query.eq('email', userEmail);
        }

        const { data: userData, error } = await query.single();

        if (error) {
          console.error('❌ [VanDon] Error loading can_day_ffm:', error);
          setCanViewHaNoi(false);
          return;
        }

        const hasPermission = userData?.can_day_ffm === true;
        console.log('🔐 [VanDon] User can_day_ffm:', hasPermission);
        setCanViewHaNoi(hasPermission);
      } catch (error) {
        console.error('❌ [VanDon] Error checking can_day_ffm permission:', error);
        setCanViewHaNoi(false);
      }
    };

    loadCanDayFFMPermission();
  }, [isAdmin]);

  // Tự động chuyển về 'all' nếu user đang ở tab hanoi nhưng không có quyền
  useEffect(() => {
    if (bolActiveTab === 'hanoi' && !canViewHaNoi && !isAdmin) {
      console.log('⚠️ [VanDon] User không có quyền xem Đẩy đơn Hà Nội, chuyển về "all"');
      setBolActiveTab('all');
    }
  }, [canViewHaNoi, bolActiveTab, isAdmin]);

  /** Khởi tạo lọc ngày theo role một lần khi quyền tải xong — tránh reset liên tục và tránh admin “tưởng” chọn ngày nhưng Áp dụng tắt. */
  const roleDateFilterInitRef = useRef(false);
  useEffect(() => {
    if (permissionsLoading || roleDateFilterInitRef.current) return;
    roleDateFilterInitRef.current = true;
    if (isAdmin) {
      setEnableDateFilter(false);
      setDateFrom('');
      setDateTo('');
    } else {
      setEnableDateFilter(true);
      setDateFrom(getThreeDaysAgo());
      setDateTo(getToday());
    }
  }, [permissionsLoading, isAdmin]);

  // Reload data when filters or pagination change (if using backend)
  // Don't skip initial mount - let it load on mount
  useEffect(() => {
    if (useBackendPagination && !permissionsLoading) {
      refetchVanDonData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, bolActiveTab, omActiveTeam, filterValues.market, filterValues.product, filterValues.nv_sale, filterValues.nv_mkt, filterValues.nv_van_don, filterValues.shipping_unit, bolDateType, enableDateFilter, dateFrom, dateTo, useBackendPagination, selectedPersonnelNames.slice().sort().join('|'), permissionsLoading, serverColumnFilters, serverTrackingFilter]);


  // Đóng tab / F5: cảnh báo + ghi nháp localStorage ngay (tránh mất dữ liệu).
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!hasUnsavedDraft()) return;
      savePendingToLocalStorage(pendingChangesRef.current);
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [savePendingToLocalStorage]);

  // Chặn điều hướng SPA trong app cần `createBrowserRouter` (data router). App dùng BrowserRouter
  // nên không dùng useBlocker; nháp vẫn lưu localStorage + cảnh báo khi đóng tab/F5 (beforeunload).

  const deepCloneMapOfMaps = useCallback((sourceMap) => {
    const clone = new Map();
    if (sourceMap) {
      sourceMap.forEach((innerMap, key) => { clone.set(key, new Map(innerMap)); });
    }
    return clone;
  }, []);

  const upsertPendingRowSnapshot = useCallback((orderId, pendingMap, allDataRows) => {
    const pmap = pendingMap.get(orderId);
    if (!pmap || pmap.size === 0) {
      pendingRowSnapshotsRef.current.delete(orderId);
      return;
    }
    const rows = allDataRows || [];
    let base = rows.find(r => r[PRIMARY_KEY_COLUMN] === orderId);
    if (!base) base = pendingRowSnapshotsRef.current.get(orderId);
    if (!base) return;
    const row = { ...base };
    pmap.forEach((info, key) => {
      row[key] = info.newValue;
    });
    pendingRowSnapshotsRef.current.set(orderId, row);
  }, []);

  // Step 1: Handle Initial Click - Create Log Entries and Show Dialog
  const handlePhanFFM = async (carrierName) => {
    if (selectedRows.size === 0) {
      addToast('⚠️ Vui lòng chọn ít nhất một đơn hàng', 'warning');
      return;
    }

    try {
      const selectedCount = selectedRows.size;
      const orderIds = Array.from(selectedRows);
      const currentUser = localStorage.getItem('username') || 'Unknown User';

      const toastId = addToast(`Đang chuẩn bị đẩy ${selectedCount} đơn...`, 'loading', 0);

      const emptyToNull = (v) => {
        const x = v == null ? '' : String(v).trim();
        return x === '' ? null : x;
      };
      const entries = orderIds.map((orderId) => {
        const r = getFilteredData.find((x) => x[PRIMARY_KEY_COLUMN] === orderId);
        let total_amount_vnd = null;
        const rawTotal = r?.['Tổng tiền VNĐ'] ?? r?.total_amount_vnd;
        if (rawTotal != null && rawTotal !== '') {
          const n = Number(String(rawTotal).replace(/[^\d.-]/g, ''));
          if (Number.isFinite(n)) total_amount_vnd = n;
        }
        return {
          orderId,
          product: emptyToNull(r?.['Mặt hàng'] ?? r?.product),
          country: emptyToNull(r?.['Khu vực'] ?? r?.country),
          chi_nhanh: emptyToNull(r?.[TEAM_COLUMN_NAME] ?? r?.['Chi nhánh'] ?? r?.chi_nhanh),
          total_amount_vnd,
        };
      });

      const { batchId } = await API.createFfmPushLogs(entries, carrierName, currentUser);

      removeToast(toastId);

      // Show the confirmation dialog
      setConfirmPushData({
        batchId,
        carrier: carrierName,
        count: selectedCount,
        orderIds: orderIds
      });
    } catch (err) {
      console.error('❌ Error initializing FFM push:', err);
      addToast('Lỗi khi chuẩn bị đẩy đơn: ' + err.message, 'error');
    }
  };

  // Step 2: Handle Confirmed Change - Update main table and update log status
  const confirmPushFinal = async () => {
    if (!confirmPushData) return;

    const { batchId, carrier, orderIds } = confirmPushData;
    const carrierKey = 'Đơn vị vận chuyển';
    const accountingDateKey = 'Ngày Kế toán đối soát với FFM lần 2';
    const now = new Date().toISOString();

    const historyChanges = [];
    orderIds.forEach(orderId => {
      const originalRow = allData.find(r => r[PRIMARY_KEY_COLUMN] === orderId);

      // Update Carrier if different
      const originalCarrierValue = originalRow ? String(originalRow[carrierKey] || '') : '';
      historyChanges.push({
        orderId,
        colKey: carrierKey,
        originalValue: originalCarrierValue,
        newValue: carrier
      });

      // Update Push Date
      const originalDateValue = originalRow ? String(originalRow[accountingDateKey] || '') : '';
      historyChanges.push({
        orderId,
        colKey: accountingDateKey,
        originalValue: originalDateValue,
        newValue: now
      });
    });

    try {
      // 1. Update logs to confirmed
      await API.updateFfmPushLogStatus(batchId, 'confirmed');

      // 2. Apply changes to main UI/Queue
      pushChange(historyChanges);

      // 3. Cleanup
      setConfirmPushData(null);
      setSelectedRows(new Set());
      addToast(`🚀 Đã chuẩn bị đẩy ${orderIds.length} đơn sang ${carrier}. Nhấn "Xác nhận lưu" để hoàn tất.`, 'success', 5000);
    } catch (err) {
      console.error('❌ Error confirming FFM push:', err);
      addToast('Lỗi khi xác nhận đẩy đơn: ' + err.message, 'error');
    }
  };

  // Step 3: Handle Canceled Change - Update log status to cancelled
  const cancelPushFinal = async () => {
    if (!confirmPushData) return;
    const { batchId } = confirmPushData;

    try {
      await API.updateFfmPushLogStatus(batchId, 'cancelled');
    } catch (err) {
      console.warn('⚠️ Could not update cancel log status:', err);
    } finally {
      setConfirmPushData(null);
      addToast('Đã hủy đẩy đơn', 'info');
    }
  };

  // Toggle row selection
  const toggleRowSelection = (orderId) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  // Select all rows on current page
  const selectAllRows = () => {
    const allIds = new Set(paginatedData.map(row => row[PRIMARY_KEY_COLUMN]));
    setSelectedRows(allIds);
  };

  // Deselect all rows
  const deselectAllRows = () => {
    setSelectedRows(new Set());
  };

  const getSelectionBounds = useCallback(() => {
    if (selection.startRow === null || selection.startCol === null) return null;
    return {
      minRow: Math.min(selection.startRow, selection.endRow),
      maxRow: Math.max(selection.startRow, selection.endRow),
      minCol: Math.min(selection.startCol, selection.endCol),
      maxCol: Math.max(selection.startCol, selection.endCol)
    };
  }, [selection]);

  const selectionBounds = useMemo(() => getSelectionBounds(), [getSelectionBounds]);

  const copiedBounds = useMemo(() => {
    if (!copiedSelection) return null;
    return {
      minRow: Math.min(copiedSelection.startRow, copiedSelection.endRow),
      maxRow: Math.max(copiedSelection.startRow, copiedSelection.endRow),
      minCol: Math.min(copiedSelection.startCol, copiedSelection.endCol),
      maxCol: Math.max(copiedSelection.startCol, copiedSelection.endCol)
    };
  }, [copiedSelection]);
  // Tab chỉ xem: khóa sửa hoàn toàn.
  const isReadonlyAllTab = bolActiveTab === 'readonly_all';
  const isReadonlyEditTab = bolActiveTab === 'readonly_all';

  // --- Filtering Logic ---
  // Filter out hidden columns from allColumns
  const allColumns = useMemo(() => {
    const base = viewMode === 'ORDER_MANAGEMENT' ? ORDER_MGMT_COLUMNS : BILL_LADING_COLUMNS;
    return base.filter(col => !HIDDEN_COLUMNS.includes(col));
  }, [viewMode]);
  const currentColumns = useMemo(() => {
    const filtered = allColumns.filter(col => visibleColumns[col] === true);
    let cols = filtered;

    // Trong tab "Hà Nội", đẩy cột "Đơn vị vận chuyển" lên đầu
    if (bolActiveTab === 'hanoi') {
      const carrierCol = 'Đơn vị vận chuyển';
      const hasCarrier = cols.includes(carrierCol);
      if (hasCarrier) {
        const withoutCarrier = cols.filter(col => col !== carrierCol);
        cols = [carrierCol, ...withoutCarrier];
      }
    }

    // Muốn "Mã Tracking" nằm gần "Trạng thái giao hàng NB":
    // ép tracking sang ngay sau cột trạng thái giao hàng nội bộ (nếu cả 2 cột đều đang visible).
    const internalDeliveryCol = cols.find(
      (c) => String(c).trim().toLowerCase() === 'trạng thái giao hàng nb'
    );
    const trackingCol = cols.find(
      (c) => String(c).trim().toLowerCase() === 'mã tracking'
    );

    if (!internalDeliveryCol || !trackingCol) return cols;

    const internalIdx = cols.indexOf(internalDeliveryCol);
    const trackingIdx = cols.indexOf(trackingCol);
    const desiredIdx = internalIdx + 1;

    if (trackingIdx === desiredIdx) return cols; // Đã đúng kề nhau

    const next = [...cols];
    // Remove tracking first
    next.splice(trackingIdx, 1);
    // Re-find internalIdx after removal
    const internalIdxAfter = next.indexOf(internalDeliveryCol);
    next.splice(internalIdxAfter + 1, 0, trackingCol);
    return next;
  }, [allColumns, visibleColumns, bolActiveTab]);

  /** Luôn cố định tối thiểu 2 cột trái khi cuộn ngang. */
  const effectiveFixedColumns = useMemo(() => {
    const minFixed = Math.min(2, currentColumns.length);
    const raw = Number(fixedColumns);
    const n = Number.isFinite(raw) ? Math.floor(raw) : minFixed;
    return Math.max(minFixed, Math.min(n, currentColumns.length));
  }, [fixedColumns, currentColumns.length]);

  /** Hai bảng: cột cố định ngoài vùng cuộn ngang (giống FFM). */
  const splitPane =
    effectiveFixedColumns > 0 && effectiveFixedColumns < currentColumns.length;
  const frozenCols = splitPane ? currentColumns.slice(0, effectiveFixedColumns) : [];
  const scrollCols = splitPane ? currentColumns.slice(effectiveFixedColumns) : [];

  const checkboxStickyPad = bolActiveTab === 'hanoi' ? VAN_DON_CHECKBOX_COL_PX : 0;

  /** Tính toán độ rộng cột Nhân viên MKT dựa trên nội dung dài nhất trong data */
  const mktColumnWidth = useMemo(() => {
    if (!allData || allData.length === 0) return 140;

    let maxLen = 0;
    allData.forEach(row => {
      const name = String(row["Nhân viên MKT"] || row["marketing_staff"] || "").trim();
      if (name.length > maxLen) maxLen = name.length;
    });

    // Ước tính 8px mỗi ký tự + padding (khoảng 140px cho 12-15 ký tự, 200px cho 20 ký tự)
    const estimated = maxLen * 8.5 + 40;
    return Math.max(140, Math.min(estimated, 400)); // Min 140, Max 400
  }, [allData]);

  /** Độ rộng cố định theo từng cột để tính offset sticky chính xác khi cuộn ngang. */
  const getColumnWidthPx = useCallback((col) => {
    const c = String(col || "").trim();
    const cl = c.toLowerCase();

    // Specific Width Cases (Approximate to fit text)
    if (cl === "mã đơn hàng") return 150;
    if (cl === "mã tracking") return 180;
    if (cl === "lý do") return 150;
    if (cl === "trạng thái thu tiền") return 150;
    if (cl === "ghi chú của vđ" || cl === "ghi chú") return 200;
    if (cl === "ngày lên đơn") return 150;
    if (cl === "phone*") return 140;

    if (cl === "trạng thái giao hàng nb") return 240;
    if (cl === "nhân viên sale") return 140;
    if (cl === "nhân viên mkt") return mktColumnWidth;
    if (cl === "nv vận đơn") return 140;
    if (cl === "đơn vị vận chuyển") return 140;
    if (cl === "số tiền của đơn hàng đã về tk cty") return 320;
    if (cl === "kế toán xác nhận thu tiền về") return 260;
    if (cl === "ngày kế toán đối soát với ffm lần 2" || cl.includes("đối soát với ffm lần 2")) return 320;

    const isCheckCol = (cl === "kết quả check");
    const isNameCol = (cl === "name*");
    const isAddCol = (cl === "add");
    const isCityCol = (cl === "city");
    const isProductCol = (cl === "mặt hàng");
    const isProductNameCol = (cl === "tên mặt hàng 1" || cl === "tên mặt hàng 2");
    const isQtyCol = cl === "số lượng mặt hàng 1" || cl === "số lượng mặt hàng 2";

    if (isQtyCol) return 52;
    if (isCheckCol) return 150;
    if (isNameCol) return 220;
    if (isAddCol) return 400;
    if (isCityCol) return 140;
    if (isProductCol) return 160;
    if (isProductNameCol) return 260;
    return 120;
  }, [mktColumnWidth]);

  const getColumnWidthStyles = useCallback((col) => {
    const w = getColumnWidthPx(col) + 'px';

    return {
      width: w,
      minWidth: w,
      maxWidth: w,
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    };
  }, [getColumnWidthPx]);

  /** Left offset cho cột sticky = checkboxPad + tổng width các cột trước đó. */
  const getStickyLeftPx = useCallback((colIdx) => {
    if (Number.isFinite(stickyOffsets[colIdx])) return stickyOffsets[colIdx];
    let left = checkboxStickyPad;
    for (let i = 0; i < colIdx; i += 1) {
      left += getColumnWidthPx(currentColumns[i]);
    }
    return left;
  }, [stickyOffsets, checkboxStickyPad, currentColumns, getColumnWidthPx]);

  /** Đo width thực tế của header để freeze cột khớp tuyệt đối khi kéo ngang. */
  useLayoutEffect(() => {
    const recalcStickyOffsets = () => {
      const headerEl = vanDonHeaderContainerRef.current;
      if (!headerEl || !currentColumns.length) {
        setStickyOffsets([]);
        return;
      }

      const thList = Array.from(headerEl.querySelectorAll('th[data-col-idx]')).sort(
        (a, b) => Number(a.getAttribute('data-col-idx')) - Number(b.getAttribute('data-col-idx'))
      );
      const widthByIdx = new Map();
      thList.forEach((th) => {
        const idx = Number(th.getAttribute('data-col-idx'));
        if (Number.isFinite(idx)) {
          widthByIdx.set(idx, th.getBoundingClientRect().width || 0);
        }
      });

      const offsets = [];
      let left = checkboxStickyPad;
      for (let i = 0; i < currentColumns.length; i += 1) {
        offsets[i] = left;
        const w = widthByIdx.get(i) || getColumnWidthPx(currentColumns[i]);
        left += w;
      }
      setStickyOffsets(offsets);
    };

    recalcStickyOffsets();
    window.addEventListener('resize', recalcStickyOffsets);
    return () => window.removeEventListener('resize', recalcStickyOffsets);
  }, [currentColumns, checkboxStickyPad, getColumnWidthPx, filterValues, isLongTextExpanded]);


  // Virtualization is handled by react-virtuoso, so we no longer need manual height sync
  // or ResizeObservers. We keep only essentials.

  // Thanh cuộn ngang phụ dưới bảng để không phải kéo xuống cuối mới cuộn ngang.
  useLayoutEffect(() => {
    const host = horizontalScrollHostRef.current;
    const bar = horizontalScrollbarRef.current;
    if (!host || !bar) return;

    const updateWidth = () => {
      setHorizontalTrackWidth(host.scrollWidth || 0);
    };
    const syncFromHost = () => {
      if (bar.scrollLeft !== host.scrollLeft) bar.scrollLeft = host.scrollLeft;
    };
    const syncFromBar = () => {
      if (host.scrollLeft !== bar.scrollLeft) host.scrollLeft = bar.scrollLeft;
    };

    updateWidth();
    syncFromHost();

    host.addEventListener('scroll', syncFromHost, { passive: true });
    bar.addEventListener('scroll', syncFromBar, { passive: true });
    window.addEventListener('resize', updateWidth);

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateWidth());
      ro.observe(host);
    }

    return () => {
      host.removeEventListener('scroll', syncFromHost);
      bar.removeEventListener('scroll', syncFromBar);
      window.removeEventListener('resize', updateWidth);
      ro?.disconnect();
    };
  }, [currentColumns.length, currentPage, rowsPerPage, isLongTextExpanded, isQueryLoading, getFilteredData.length === 0]);

  // Scroll sync not needed with Virtuoso + single table logic
  // Scroll sync for separate header (FFM style)
  const onTableScroll = useCallback((e) => {
    // Sync the horizontal position of the separate header div with the table's scroller
    if (vanDonHeaderContainerRef.current) {
      vanDonHeaderContainerRef.current.scrollLeft = e.target.scrollLeft;
    }
  }, []);

  // Lăn chuột luôn cuộn phần nội dung bảng, header vẫn đứng yên (sticky).
  const handleTableWheel = useCallback((e) => {
    const root = tableRef.current;
    if (!root) return;
    const dy = Number(e?.deltaY || 0);
    if (!dy) return;

    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    const next = Math.max(0, Math.min(max, root.scrollTop + dy));
    if (next === root.scrollTop) return;

    e.preventDefault();
    root.scrollTop = next;
    /* Cuộn dọc chỉ trên root (tableRef); pane trái/phải di chuyển theo nội dung, không gán scrollTop riêng. */
  }, []);

  /** Khi ẩn bớt cột, hạ số cố định nếu đang vượt quá số cột hiển thị */
  useEffect(() => {
    setFixedColumns((prev) => {
      const n = Math.floor(Number(prev) || 0);
      if (currentColumns.length === 0) return n;
      return Math.min(n, currentColumns.length);
    });
  }, [currentColumns.length]);

  // Save column visibility to localStorage
  useEffect(() => {
    if (Object.keys(visibleColumns).length > 0) {
      localStorage.setItem('vanDon_visibleColumns', JSON.stringify(visibleColumns));
    }
  }, [visibleColumns]);

  // Handle quick filter
  const handleQuickFilter = (value) => {
    setQuickFilter(value);
    if (!value) {
      setDateFrom('');
      setDateTo('');
      setEnableDateFilter(false);
      return;
    }

    const today = new Date();
    let startDate = new Date();
    let endDate = new Date();

    switch (value) {
      case 'today':
        startDate = new Date(today);
        endDate = new Date(today);
        break;
      case 'yesterday':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 1);
        endDate = new Date(startDate);
        break;
      case 'this-week': {
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startDate = new Date(today.getFullYear(), today.getMonth(), diff);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        break;
      }
      case 'last-week': {
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek - 6 + (dayOfWeek === 0 ? -6 : 1);
        startDate = new Date(today.getFullYear(), today.getMonth(), diff);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        break;
      }
      case 'this-month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'last-month':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'this-year':
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = new Date(today.getFullYear(), 11, 31);
        break;
      default:
        return;
    }

    setDateFrom(startDate.toISOString().split('T')[0]);
    setDateTo(endDate.toISOString().split('T')[0]);
    setEnableDateFilter(true);
  };





  // --- UI Helpers ---
  const getUniqueValues = useMemo(() => (key) => {
    const values = new Set();
    const keyMapped = COLUMN_MAPPING[key] || key;
    allData.forEach(row => {
      // Thử nhiều cách lấy giá trị
      const val = String(row[key] || row[keyMapped] || row[key.replace(/ /g, '_')] || '').trim();
      if (val && !isVanDonSemanticEmpty(val)) values.add(val);
    });
    return Array.from(values).sort();
  }, [allData]);

  /**
   * Bộ lọc MultiSelect: ưu tiên distinct từ Supabase (RPC `get_orders_distinct_values` trên `orders`);
   * nếu chưa có / lỗi RPC thì fallback unique trên trang hiện tại (phân trang backend).
   */
  const getFilterMultiSelectOptions = useCallback(
    (col) => {
      const keyMapped = COLUMN_MAPPING[col] || col;
      const preset = DROPDOWN_OPTIONS[col] || DROPDOWN_OPTIONS[keyMapped] || [];

      /** Gộp bản ghi trùng không phân biệt hoa thường; ưu tiên đúng chuỗi trong DROPDOWN_OPTIONS. */
      const pickBetterCase = (a, b) => {
        const aEx = preset.some((p) => p !== '' && String(p) === String(a));
        const bEx = preset.some((p) => p !== '' && String(p) === String(b));
        if (aEx && !bEx) return a;
        if (bEx && !aEx) return b;
        const al = String(a).toLowerCase();
        const bl = String(b).toLowerCase();
        const piA = preset.findIndex((p) => p !== '' && String(p).toLowerCase() === al);
        const piB = preset.findIndex((p) => p !== '' && String(p).toLowerCase() === bl);
        if (piA !== -1 && piB === -1) return preset[piA];
        if (piB !== -1 && piA === -1) return preset[piB];
        if (piA !== -1 && piB !== -1) return preset[Math.min(piA, piB)];
        return String(a).localeCompare(String(b), 'vi', { sensitivity: 'base', numeric: true }) <= 0 ? a : b;
      };

      const fromDb = vanDonDistinctFilterOptions[col];
      const fromPage = getUniqueValues(col);
      const base = Array.isArray(fromDb) && fromDb.length > 0 ? fromDb : fromPage;

      const byLower = new Map();
      for (const raw of base) {
        if (isVanDonSemanticEmpty(raw)) continue;
        const s = String(raw).trim();
        const lk = s.toLowerCase();
        if (!byLower.has(lk)) byLower.set(lk, s);
        else byLower.set(lk, pickBetterCase(byLower.get(lk), s));
      }

      const merged = Array.from(byLower.values()).sort((a, b) =>
        String(a).localeCompare(String(b), 'vi', { sensitivity: 'base', numeric: true })
      );

      // Một mục "Trống" cho ô trống; không thêm __EMPTY__ (vẫn tương thích khi selected còn __EMPTY__ từ bản cũ)
      return ['Trống', ...merged];
    },
    [getUniqueValues, vanDonDistinctFilterOptions]
  );

  /** Ô chỉnh sửa trong bảng: vẫn gộp preset DROPDOWN + giá trị đã có trong data (cho phép chọn trạng thái chuẩn). */
  const getCellEditSelectOptions = (col) => {
    const key = COLUMN_MAPPING[col] || col;
    const preset = DROPDOWN_OPTIONS[col] || DROPDOWN_OPTIONS[key];
    const fromData = getUniqueValues(col);
    if (preset) {
      const merged = new Set();
      for (const x of [...preset, ...fromData]) {
        if (x === '') merged.add('');
        else if (!isVanDonSemanticEmpty(x)) merged.add(x);
      }
      return Array.from(merged).sort((a, b) => {
        if (a === '') return -1;
        if (b === '') return 1;
        return String(a).localeCompare(String(b), 'vi', { sensitivity: 'base', numeric: true });
      });
    }
    return fromData;
  };


  // Hàm lưu vào bảng shipping_reports
  const saveToShippingReports = useCallback(async (updatedRows, currentData = null) => {
    if (!updatedRows || updatedRows.length === 0) return;

    try {
      const currentUsername = localStorage.getItem('username') || 'Unknown';
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Sử dụng currentData nếu có, nếu không thì dùng allData
      const dataSource = currentData || allData;

      // Lấy dữ liệu đầy đủ từ dataSource cho các rows đã update
      const reportsToSave = [];

      for (const updatedRow of updatedRows) {
        const orderId = updatedRow[PRIMARY_KEY_COLUMN];
        const fullRow = dataSource.find(r => r[PRIMARY_KEY_COLUMN] === orderId);
        if (!fullRow) continue;

        // Lấy các giá trị từ row (ưu tiên giá trị mới từ updatedRow, fallback về fullRow)
        const product = (updatedRow['Mặt hàng'] || fullRow['Mặt hàng'] || '').trim();
        const market = (updatedRow['Khu vực'] || fullRow['Khu vực'] || '').trim();
        const checkResult = (updatedRow['Kết quả Check'] || updatedRow['Kết quả check'] || fullRow['Kết quả Check'] || fullRow['Kết quả check'] || '').trim();
        const status = (updatedRow['Trạng thái giao hàng NB'] || fullRow['Trạng thái giao hàng NB'] || '').trim();
        const deliveryStatus = (updatedRow['Trạng thái giao hàng'] || fullRow['Trạng thái giao hàng'] || '').trim();
        const billStatus = (updatedRow['Trạng thái thu tiền'] || fullRow['Trạng thái thu tiền'] || '').trim();

        // Chỉ lưu nếu có ít nhất một trong các trường quan trọng
        if (product || market || checkResult || status || deliveryStatus || billStatus) {
          reportsToSave.push({
            name: currentUsername,
            date: currentDate,
            product: product || null,
            market: market || null,
            check_result: checkResult || null,
            status: status || null,
            delivery_status: deliveryStatus || null,
            bill_status: billStatus || null,
            created_by: currentUsername,
            updated_by: currentUsername
          });
        }
      }

      if (reportsToSave.length === 0) return;

      // Kiểm tra và insert/update từng record
      for (const report of reportsToSave) {
        // Lấy tất cả records có cùng name và date
        const { data: candidates, error: queryError } = await supabase
          .from('shipping_reports')
          .select('*')
          .eq('name', report.name)
          .eq('date', report.date);

        if (queryError) {
          console.error('Error querying shipping_reports:', queryError);
          continue;
        }

        // So sánh các trường khác để tìm record trùng khớp
        const existing = candidates?.find(candidate => {
          const normalize = (val) => (val || '').trim();
          return (
            normalize(candidate.product) === normalize(report.product) &&
            normalize(candidate.market) === normalize(report.market) &&
            normalize(candidate.check_result) === normalize(report.check_result) &&
            normalize(candidate.status) === normalize(report.status) &&
            normalize(candidate.delivery_status) === normalize(report.delivery_status) &&
            normalize(candidate.bill_status) === normalize(report.bill_status)
          );
        });

        if (existing) {
          // Update nếu đã tồn tại
          await supabase
            .from('shipping_reports')
            .update({
              ...report,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          // Insert nếu chưa tồn tại
          await supabase
            .from('shipping_reports')
            .insert([report]);
        }
      }
    } catch (error) {
      console.error('Error saving to shipping_reports:', error);
      // Không hiển thị lỗi cho user để không làm gián đoạn flow chính
    }
  }, [allData]);

  // --- Change Management (Shared) ---
  const processDbQueue = useCallback(async () => {
    if (isProcessingQueue.current) return;
    if (dbQueueRef.current.length === 0) return;

    isProcessingQueue.current = true;
    try {
      while (dbQueueRef.current.length > 0) {
        // Take everything currently in queue as a single batch
        const batchToProcess = dbQueueRef.current.splice(0, dbQueueRef.current.length);

        const rowsObjMap = new Map();
        batchToProcess.forEach(({ orderId, colKey, newValue }) => {
          if (!rowsObjMap.has(orderId)) rowsObjMap.set(orderId, { [PRIMARY_KEY_COLUMN]: orderId });
          rowsObjMap.get(orderId)[colKey] = newValue;
        });

        const rowsToUpdate = Array.from(rowsObjMap.values());
        if (rowsToUpdate.length === 0) continue;

        const currentUsername = localStorage.getItem('username') || 'Unknown';
        let success = false;

        if (rowsToUpdate.length === 1 && Object.keys(rowsToUpdate[0]).length === 2) {
          const row = rowsToUpdate[0];
          const col = Object.keys(row).find(k => k !== PRIMARY_KEY_COLUMN);
          const toastId = addToast('Đang cập nhật...', 'loading', 0);
          try {
            await API.updateSingleCell(row[PRIMARY_KEY_COLUMN], col, row[col], currentUsername);
            success = true;
          } catch (e) {
            addToast(e.message, 'error');
          } finally {
            removeToast(toastId);
          }
        } else {
          const toastId = addToast(`Đang cập nhật ${rowsToUpdate.length} đơn hàng...`, 'loading', 0);
          try {
            const res = await API.updateBatch(rowsToUpdate, currentUsername);
            if (res.success) success = true;
          } catch (e) {
            addToast(e.message, 'error');
          } finally {
            removeToast(toastId);
          }
        }

        if (success) {
          const latestData = [...allData];
          rowsToUpdate.forEach(updatedRow => {
            const idx = latestData.findIndex(r => r[PRIMARY_KEY_COLUMN] === updatedRow[PRIMARY_KEY_COLUMN]);
            if (idx > -1) latestData[idx] = { ...latestData[idx], ...updatedRow };
          });

          saveToShippingReports(rowsToUpdate, latestData).catch(console.error);

          // Refresh data from server
          queryClient.invalidateQueries(['vanDon']);

          setPendingChanges(prev => {
            const next = deepCloneMapOfMaps(prev);
            batchToProcess.forEach(({ orderId, colKey }) => {
              if (next.has(orderId)) {
                next.get(orderId).delete(colKey);
                if (next.get(orderId).size === 0) {
                  next.delete(orderId);
                  pendingRowSnapshotsRef.current.delete(orderId);
                }
              }
            });
            const touchedOrderIds = new Set(batchToProcess.map((b) => b.orderId));
            touchedOrderIds.forEach((orderId) => {
              if (next.has(orderId)) upsertPendingRowSnapshot(orderId, next, latestData);
            });
            savePendingToLocalStorage(next);
            return next;
          });
        }
      }
    } finally {
      isProcessingQueue.current = false;
    }
  }, [addToast, removeToast, saveToShippingReports, deepCloneMapOfMaps, upsertPendingRowSnapshot, allData, queryClient, savePendingToLocalStorage]);

  // --- New Stack-Based History ---
  const pushChange = useCallback((changesArray) => {
    if (!changesArray || changesArray.length === 0) return;

    // 1. History Stack
    const currentIndex = historyIndexRef.current;
    const currentHist = changeHistoryRef.current;
    const newHistory = currentHist.slice(0, currentIndex + 1);

    newHistory.push({ timestamp: Date.now(), changes: changesArray });
    const finalHistory = newHistory.slice(-50);
    changeHistoryRef.current = finalHistory;
    historyIndexRef.current = finalHistory.length - 1;

    // 2. Add to DB Queue & UI state
    dbQueueRef.current.push(...changesArray);

    setPendingChanges(prev => {
      const next = deepCloneMapOfMaps(prev);
      changesArray.forEach(({ orderId, colKey, newValue, originalValue }) => {
        if (!next.has(orderId)) next.set(orderId, new Map());
        next.get(orderId).set(colKey, { newValue, originalValue });
      });
      changesArray.forEach(({ orderId }) => {
        upsertPendingRowSnapshot(orderId, next, allData);
      });
      savePendingToLocalStorage(next);
      return next;
    });

    // Không gọi processDbQueue ở đây — chỉ lưu DB khi user nhấn "Xác nhận lưu".
  }, [deepCloneMapOfMaps, upsertPendingRowSnapshot, allData]);

  // Undo last change
  const handleUndo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    if (currentIndex < 0) {
      addToast('Không có thay đổi nào để hoàn tác', 'info', 2000);
      return;
    }

    const currentSnapshot = changeHistoryRef.current[currentIndex];

    // Reverse changes
    const undoChanges = currentSnapshot.changes.map(change => ({
      orderId: change.orderId,
      colKey: change.colKey,
      newValue: change.originalValue,
      originalValue: change.newValue
    }));

    // Add to DB queue & Update UI
    dbQueueRef.current.push(...undoChanges);

    setPendingChanges(prev => {
      const next = deepCloneMapOfMaps(prev);
      undoChanges.forEach(({ orderId, colKey, newValue, originalValue }) => {
        if (!next.has(orderId)) next.set(orderId, new Map());
        next.get(orderId).set(colKey, { newValue, originalValue });
      });
      undoChanges.forEach(({ orderId }) => {
        upsertPendingRowSnapshot(orderId, next, allData);
      });
      savePendingToLocalStorage(next);
      return next;
    });

    historyIndexRef.current = currentIndex - 1;
    addToast('Đã hoàn tác (chưa lưu DB — nhấn Xác nhận lưu để ghi)', 'success', 2500);
  }, [addToast, deepCloneMapOfMaps, upsertPendingRowSnapshot, allData]);

  // Redo last undone change
  const handleRedo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    const currentHist = changeHistoryRef.current;

    if (currentIndex >= currentHist.length - 1) {
      addToast('Không có thay đổi nào để làm lại', 'info', 2000);
      return;
    }

    const nextIndex = currentIndex + 1;
    const nextSnapshot = currentHist[nextIndex];

    const redoChanges = nextSnapshot.changes.map(change => ({
      orderId: change.orderId,
      colKey: change.colKey,
      newValue: change.newValue,
      originalValue: change.originalValue
    }));

    dbQueueRef.current.push(...redoChanges);

    setPendingChanges(prev => {
      const next = deepCloneMapOfMaps(prev);
      redoChanges.forEach(({ orderId, colKey, newValue, originalValue }) => {
        if (!next.has(orderId)) next.set(orderId, new Map());
        next.get(orderId).set(colKey, { newValue, originalValue });
      });
      redoChanges.forEach(({ orderId }) => {
        upsertPendingRowSnapshot(orderId, next, allData);
      });
      savePendingToLocalStorage(next);
      return next;
    });

    historyIndexRef.current = nextIndex;
    addToast('Đã làm lại (chưa lưu DB — nhấn Xác nhận lưu để ghi)', 'success', 2500);
  }, [addToast, deepCloneMapOfMaps, upsertPendingRowSnapshot, allData]);

  const handleCellChange = useCallback((orderId, colKey, newValue) => {
    if (isReadonlyEditTab) return;
    // Tab "Đơn nhắc hộ": một số cột chỉ xem
    if (bolActiveTab === 'all') {
      const k = String(colKey || '').trim().toLowerCase();
      if (k === 'đơn vị vận chuyển' || k === 'mã tracking') return;
    }
    const originalRow = allData.find(r => r[PRIMARY_KEY_COLUMN] === orderId);
    const baseValue = originalRow ? String(originalRow[colKey] ?? '') : '';

    // Đảm bảo history ghi nhận đúng thao tác trung gian ngay cả khi chưa lưu server
    const pendingVal = pendingChanges.get(orderId)?.get(colKey);
    const stepOriginalValue = pendingVal ? pendingVal.newValue : baseValue;

    if (String(newValue) === String(stepOriginalValue)) return; // Không có thay đổi gì thực sự

    pushChange([{ orderId, colKey, originalValue: String(stepOriginalValue), newValue: String(newValue) }]);
  }, [allData, pendingChanges, pushChange, isReadonlyEditTab, bolActiveTab]);

  const handleUpdateAll = async () => {
    setSyncPopoverOpen(false);

    // --- Cơ chế Tự phục hồi: Đồng bộ lại Queue nếu Ref bị trống nhưng State vẫn còn dữ liệu ---
    if (dbQueueRef.current.length === 0 && pendingChanges.size > 0) {
      console.warn('🔄 [VanDon] Phát hiện hàng chờ bị trống trong khi State còn dữ liệu. Đang phục hồi...');
      const recovered = [];
      pendingChanges.forEach((innerMap, orderId) => {
        innerMap.forEach((info, colKey) => {
          recovered.push({
            orderId,
            colKey,
            newValue: info.newValue,
            originalValue: info.originalValue
          });
        });
      });
      dbQueueRef.current.push(...recovered);
    }

    if (dbQueueRef.current.length === 0) {
      addToast('Không có thay đổi cần lưu', 'info');
      return;
    }
    await processDbQueue();
  };





  // --- Interaction (Mouse) ---
  const handleMouseDown = (rowIdx, colIdx, e) => {
    if (e.button !== 0) return; // Only left click

    const target = e.target;
    const isInputElement =
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA';

    if (e.ctrlKey || e.metaKey) {
      selectionPointerDragRef.current = null;
      setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
      isSelecting.current = false;
      return;
    }

    if (e.shiftKey && selection.startRow !== null && selection.startCol !== null) {
      selectionPointerDragRef.current = {
        anchorRow: selection.startRow,
        anchorCol: selection.startCol,
        startX: e.clientX,
        startY: e.clientY,
      };
      setSelection((prev) => ({ ...prev, endRow: rowIdx, endCol: colIdx }));
      isSelecting.current = false;
      return;
    }

    selectionPointerDragRef.current = {
      anchorRow: rowIdx,
      anchorCol: colIdx,
      startX: e.clientX,
      startY: e.clientY,
    };

    // Input/select/textarea: giữ chọn 1 ô; nếu kéo chuột qua ngưỡng → document mousemove mở vùng chọn (ngang + dọc)
    if (isInputElement) {
      setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
      isSelecting.current = false;
      return;
    }

    // Click vào <td> (text chỉ đọc): focus editor nếu có; kéo vùng chờ ngưỡng giống input
    const td = target.closest?.('td');
    if (td) {
      const editor = td.querySelector('input:not([type="checkbox"]), textarea, select');
      if (editor && !editor.disabled && !editor.getAttribute('readonly')) {
        editor.focus();
        if (editor.tagName === 'INPUT' && typeof editor.select === 'function') {
          try {
            editor.select();
          } catch {
            /* ignore */
          }
        }
        setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
        isSelecting.current = false;
        return;
      }
    }

    // Ô chỉ hiển thị text: bắt đầu kéo vùng ngay (mouseenter vẫn hỗ trợ)
    isSelecting.current = true;
    setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
  };

  const handleMouseEnter = (rowIdx, colIdx) => {
    if (isSelecting.current) {
      setSelection(prev => {
        if (prev.startRow === null || prev.startCol === null) {
          return { startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx };
        }
        return { ...prev, endRow: rowIdx, endCol: colIdx };
      });
    }
  };

  useEffect(() => {
    const resolveCellFromPoint = (clientX, clientY) => {
      const root = tableRef.current;
      if (!root) return null;
      const stack = document.elementsFromPoint(clientX, clientY);
      if (!stack?.length) return null;
      for (const el of stack) {
        const td = el.closest?.('td[data-van-r]');
        if (td && root.contains(td)) {
          const r = Number(td.getAttribute('data-van-r'));
          const c = Number(td.getAttribute('data-van-c'));
          if (Number.isFinite(r) && Number.isFinite(c)) return { r, c };
        }
      }
      return null;
    };

    const DRAG_THRESHOLD_PX = 4;

    const handleMouseMove = (e) => {
      const drag = selectionPointerDragRef.current;
      if (!drag || (e.buttons & 1) !== 1) return;

      const dx = Math.abs(e.clientX - drag.startX);
      const dy = Math.abs(e.clientY - drag.startY);
      const pastThreshold = dx >= DRAG_THRESHOLD_PX || dy >= DRAG_THRESHOLD_PX;

      if (pastThreshold && !isSelecting.current) {
        isSelecting.current = true;
        const ae = document.activeElement;
        if (
          ae &&
          tableRef.current?.contains(ae) &&
          (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA')
        ) {
          ae.blur();
        }
      }

      if (!isSelecting.current) return;

      e.preventDefault();
      const cell = resolveCellFromPoint(e.clientX, e.clientY);
      if (!cell) return;

      setSelection({
        startRow: drag.anchorRow,
        startCol: drag.anchorCol,
        endRow: cell.r,
        endCol: cell.c,
      });
    };

    const handleMouseUp = () => {
      selectionPointerDragRef.current = null;
      isSelecting.current = false;
    };

    const handleSelectStartCapture = (e) => {
      if (!isSelecting.current || !tableRef.current?.contains(e.target)) return;
      e.preventDefault();
    };

    // Clear selection khi click ra ngoài table (nhưng không clear khi click vào control buttons)
    const handleClickOutside = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        // Chỉ clear nếu không phải đang click vào các control buttons
        const isControlButton = e.target.closest('button') ||
          e.target.closest('.pagination') ||
          e.target.closest('.filter') ||
          e.target.closest('.toolbar') ||
          e.target.closest('[role="dialog"]') ||
          e.target.closest('.modal');
        if (!isControlButton) {
          setSelection({ startRow: null, startCol: null, endRow: null, endCol: null });
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectstart', handleSelectStartCapture, true);
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectstart', handleSelectStartCapture, true);
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Removed debounced history save

  // --- Keyboard Navigation ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Copy / Paste
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const bounds = getSelectionBounds();
        if (!bounds) return;

        // If it's a single cell and user has selected only partial text in the input,
        // we might want to let the browser handle it. But to fix the reported issue
        // where Ctrl+C "doesn't work" at all, we'll take over but allow browser copy
        // if there's a specific internal selection that isn't the whole field.
        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        const isSingleCell = bounds.minRow === bounds.maxRow && bounds.minCol === bounds.maxCol;

        // If user manually selected a PART of the text, let browser handle it naturally
        if (isInput && isSingleCell && activeEl.selectionStart !== activeEl.selectionEnd &&
          (activeEl.selectionEnd - activeEl.selectionStart) < activeEl.value.length) {
          return;
        }

        e.preventDefault();

        // Prepare data for clipboard
        const rows = [];
        for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
          const rowData = [];
          for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
            const colName = currentColumns[c];
            const rData = paginatedData[r];
            if (!rData) continue;
            const val = rData[COLUMN_MAPPING[colName] || colName] ?? rData[colName] ?? '';
            rowData.push(val);
          }
          rows.push(rowData.join('\t'));
        }
        const text = rows.join('\n');
        navigator.clipboard.writeText(text);

        setCopiedSelection(selection);
        setCopiedData(text);
        addToast('Đã copy vào clipboard', 'info', 1000);
        return;
      }

      // Arrow keys
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selection.startRow !== null) {
        // Prevent default if not editing
        const activeEl = document.activeElement;
        const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA';
        if (isInput) return; // Let input handle arrows

        e.preventDefault();
        let { startRow, startCol, endRow, endCol } = selection;
        // Move the 'active' end, keep start anchor if shift
        let newRow = endRow;
        let newCol = endCol;

        if (e.key === 'ArrowUp') newRow = Math.max(0, endRow - 1);
        if (e.key === 'ArrowDown') newRow = Math.min(paginatedData.length - 1, endRow + 1);
        if (e.key === 'ArrowLeft') newCol = Math.max(0, endCol - 1);
        if (e.key === 'ArrowRight') newCol = Math.min(currentColumns.length - 1, endCol + 1);

        if (e.shiftKey) {
          setSelection(prev => ({ ...prev, endRow: newRow, endCol: newCol }));
        } else {
          setSelection({ startRow: newRow, startCol: newCol, endRow: newRow, endCol: newCol });
        }
        return;
      }

      // Ctrl+A - Select all visible
      if (e.ctrlKey && e.key === 'a') {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

        e.preventDefault();
        setSelection({
          startRow: 0,
          startCol: 0,
          endRow: paginatedData.length - 1,
          endCol: currentColumns.length - 1
        });
        return;
      }

      // Ctrl+Z - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z - Redo
      if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey)) {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

        e.preventDefault();
        handleRedo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, paginatedData.length, currentColumns.length, getSelectionBounds, paginatedData, currentColumns, handleUndo, handleRedo]);

  // --- Paste Logic ---
  useEffect(() => {
    const handlePaste = (e) => {


      const active = document.activeElement;
      // If focusing a filter input in header, allow normal paste
      if (active && active.closest('th')) return;
      // If focusing input in cell, handle carefully? simpler to just override or let it be.
      // Google sheets allows pasting into cell edit mode.
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        // return; // Let browser handle it? 
        // But if we want multi-cell paste support, we need to intercept if not editing.
        if (active.closest('td')) {
          // Find which cell
          // Logic to determine if we should handle multi-cell paste
        }
      }

      if (selection.startRow === null) return;

      // Handle paste logic
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;

      e.preventDefault();
      const rows = text.split(/\r\n?|\n/).filter(r => r.length > 0).map(r => r.split('\t'));
      if (rows.length === 0) return;

      const bounds = getSelectionBounds();
      if (!bounds) return;

      const historyChanges = [];

      // Flood Fill Logic:
      // If clipboard has only 1 cell (1x1), and selection > 1x1, fill the selection with that value.
      const isFloodFill = rows.length === 1 && rows[0].length === 1 &&
        ((bounds.maxRow - bounds.minRow > 0) || (bounds.maxCol - bounds.minCol > 0));

      if (isFloodFill) {
        const val = rows[0][0];
        if (val === '') return;
        for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
          if (r >= paginatedData.length) continue;
          const rowData = paginatedData[r];
          const orderId = rowData[PRIMARY_KEY_COLUMN];

          for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
            if (c >= currentColumns.length) continue;
            const colName = currentColumns[c];
            if (!colInList(colName, EDITABLE_COLS)) continue;

            const dataKey = COLUMN_MAPPING[colName] || colName;
            const baseValue = rowData[dataKey] ?? '';

            const pendingVal = pendingChanges.get(orderId)?.get(dataKey);
            const stepOriginalValue = pendingVal ? pendingVal.newValue : baseValue;

            if (String(val) !== String(stepOriginalValue)) {
              historyChanges.push({ orderId, colKey: dataKey, originalValue: String(stepOriginalValue), newValue: String(val) });
            }
          }
        }
      } else {
        // Normal Paste (Top-Left aligned)
        rows.forEach((rowVals, rIdx) => {
          const targetRowIdx = bounds.minRow + rIdx;
          if (targetRowIdx >= paginatedData.length) return;

          const rowData = paginatedData[targetRowIdx];
          const orderId = rowData[PRIMARY_KEY_COLUMN];

          rowVals.forEach((val, cIdx) => {
            const targetColIdx = bounds.minCol + cIdx;
            if (targetColIdx >= currentColumns.length || val === '') return;

            const colName = currentColumns[targetColIdx];
            if (!colInList(colName, EDITABLE_COLS)) return; // Skip read-only

            const dataKey = COLUMN_MAPPING[colName] || colName;
            const baseValue = rowData[dataKey] ?? '';

            const pendingVal = pendingChanges.get(orderId)?.get(dataKey);
            const stepOriginalValue = pendingVal ? pendingVal.newValue : baseValue;

            if (String(val) !== String(stepOriginalValue)) {
              historyChanges.push({ orderId, colKey: dataKey, originalValue: String(stepOriginalValue), newValue: String(val) });
            }
          });
        });
      }

      if (historyChanges.length > 0) {
        pushChange(historyChanges);
        addToast(`Đã dán ${historyChanges.length} ô. Nhấn "Xác nhận lưu" để ghi xuống CSDL.`, 'info', 2500);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [selection, pendingChanges, paginatedData, currentColumns, getSelectionBounds, pushChange, addToast]);


  // Calculated helpers for render
  const calculatedSummary = useMemo(() => {
    if (!selectionBounds) return null;
    const viewData = paginatedData;
    let count = 0;
    let sum = 0;
    let numericCount = 0;

    for (let r = selectionBounds.minRow; r <= selectionBounds.maxRow && r < viewData.length; r++) {
      for (let c = selectionBounds.minCol; c <= selectionBounds.maxCol && c < currentColumns.length; c++) {
        count++;
        const col = currentColumns[c];
        const key = COLUMN_MAPPING[col] || col;
        const val = viewData[r][key] ?? viewData[r][col] ?? '';
        const numVal = parseFloat(String(val).replace(/[^\d.-]/g, ''));
        if (!isNaN(numVal)) {
          sum += numVal;
          numericCount++;
        }
      }
    }
    return { count, sum: numericCount > 0 ? sum : 0, avg: numericCount > 0 ? sum / numericCount : 0 };
  }, [selectionBounds, paginatedData, currentColumns]);

  const totalMoney = useMemo(() => {
    if (useBackendPagination) {
      const n = Number(totalAmountVndSumFromServer);
      return Number.isFinite(n) ? n : 0;
    }
    return getFilteredData.reduce((sum, row) => {
      let val = row["Tổng tiền VNĐ"] || row["Tổng_tiền_VNĐ"] || row["Giá bán"] || 0;
      const num = parseFloat(String(val).replace(/[^\d.-]/g, "")) || 0;
      return sum + num;
    }, 0);
  }, [useBackendPagination, totalAmountVndSumFromServer, getFilteredData]);
  const totalOrdersCount = useBackendPagination ? totalRecords : getFilteredData.length;

  const teams = Array.from(new Set(allData.map(r => r[TEAM_COLUMN_NAME]).filter(Boolean))).sort();

  // Simplified cell class
  const getCellClass = (row, col, val, rIdx, cIdx) => {
    const isCheckCol = (col === "Kết quả Check" || col === "Kết quả check");
    const isStatusCol = (col === "Trạng thái giao hàng");
    const isQtyCol = col === "Số lượng mặt hàng 1" || col === "Số lượng mặt hàng 2";
    const isLongTextEditable =
      viewMode === 'BILL_OF_LADING' &&
      colInList(col, LONG_TEXT_COLS) &&
      colInList(col, EDITABLE_COLS) &&
      bolActiveTab !== 'readonly_all';

    // Default cell sizing
    // NOTE: For select-based columns, avoid vertical padding so the select can fill the cell height cleanly.
    let classes = `${(isCheckCol || isStatusCol) ? "py-0" : "py-2.5"} border border-gray-200 text-sm ${
      isLongTextEditable ? (isLongTextExpanded ? "min-h-[140px] h-auto" : "min-h-[56px] h-auto") : "h-[38px]"
    } whitespace-nowrap `;

    // Padding adjustment for specific columns
    if (isCheckCol) {
      classes += "pl-2 pr-3 ";
    } else if (isQtyCol) {
      classes += "px-1 ";
    } else {
      classes += "px-4 ";
    }

    if (isQtyCol) {
      classes += "text-center tabular-nums text-[12px] ";
    }

    // Status
    if (isCheckCol) {
      const v = String(val).toLowerCase();
      if (v === 'ok') classes += "bg-green-100 text-green-800 font-bold ";
      else if (v.includes('huỷ')) classes += "bg-red-100 text-red-800 font-bold ";
    }

    // Long Text
    if (viewMode === 'BILL_OF_LADING' && colInList(col, LONG_TEXT_COLS) && !isLongTextEditable) {
      classes = classes.replace('whitespace-nowrap', isLongTextExpanded ? "whitespace-pre-wrap max-w-xs break-words bg-yellow-50" : "whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] cursor-pointer");
    }
    if (isLongTextEditable) {
      classes = classes.replace(
        'whitespace-nowrap',
        isLongTextExpanded ? "whitespace-pre-wrap max-w-md break-words align-top" : "whitespace-pre-wrap max-w-[240px] align-top"
      );
    }

    // Editable
    const isEditable = colInList(col, EDITABLE_COLS);
    if (isEditable) {
      const orderId = row[PRIMARY_KEY_COLUMN];
      if (pendingChanges.get(orderId)?.has(COLUMN_MAPPING[col] || col)) {
        classes += "!bg-yellow-300 ";
      } else {
        classes += "bg-[#e8f5e9] ";
      }
    }

    // Fixed (sticky positioning được set bằng inline style để dùng offset chính xác)
    if (cIdx < effectiveFixedColumns) {
      classes += "z-10 bg-gray-50 ";
    }

    // Selection - Highlight cell nếu nằm trong vùng selection
    if (selectionBounds && rIdx >= selectionBounds.minRow && rIdx <= selectionBounds.maxRow &&
      cIdx >= selectionBounds.minCol && cIdx <= selectionBounds.maxCol) {
      classes += "!bg-[#e3f2fd] ";
      // Thêm border cho các cạnh của vùng selection
      if (rIdx === selectionBounds.minRow) classes += "selection-border-top ";
      if (rIdx === selectionBounds.maxRow) classes += "selection-border-bottom ";
      if (cIdx === selectionBounds.minCol) classes += "selection-border-left ";
      if (cIdx === selectionBounds.maxCol) classes += "selection-border-right ";
    }

    // Cursor style - hiển thị cursor cell khi hover (trừ khi đang trong input/select)
    classes += "cursor-cell ";

    return classes;
  };

  const vanDonVirtuosoComponents = useMemo(() => {
    const TableRow = React.forwardRef(({ item, children, ...rest }, ref) => {
      const orderId = item?.[PRIMARY_KEY_COLUMN];
      const isSelected = orderId != null && selectedRows.has(orderId);
      const mergedClass = [rest.className, isSelected ? 'bg-blue-50' : ''].filter(Boolean).join(' ').trim();
      return (
        <tr ref={ref} {...rest} className={mergedClass || undefined}>
          {children}
        </tr>
      );
    });
    TableRow.displayName = 'VanDonVirtuosoTableRow';
    return {
      Scroller: VanDonVirtuosoScroller,
      Table: VanDonVirtuosoTable,
      TableBody: VanDonVirtuosoTableBody,
      TableRow
    };
  }, [selectedRows]);

  const renderVanDonFilterTh = (col, idx, positionStyle, showFreezeShadow, isFixedCol) => {
    const key = COLUMN_MAPPING[col] || col;
    const filterKey = col;
    const isCheckCol = col === 'Kết quả Check' || col === 'Kết quả check';
    const isNameCol = col === 'Name*';
    const isAddCol = col === 'Add';
    const isCityCol = col === 'City';
    const isProductCol = col === 'Mặt hàng';
    const isQtyCol = col === 'Số lượng mặt hàng 1' || col === 'Số lượng mặt hàng 2';

    const widthStyles = getColumnWidthStyles(col);
    /** `overflow: hidden` trên chính phần tử sticky làm hỏng sticky ngang trên nhiều trình duyệt. */
    const cellWidthStyles = isFixedCol
      ? { ...widthStyles, overflow: 'visible', textOverflow: 'clip' }
      : widthStyles;

    const headerCellStyle = isFixedCol
      ? {
          ...cellWidthStyles,
          ...positionStyle,
          position: 'sticky',
          top: 0,
          background: '#f8f9fa',
          backgroundClip: 'padding-box',
          boxShadow: showFreezeShadow ? '2px 0 0 #d1d5db' : undefined,
        }
      : {
          ...widthStyles,
          ...positionStyle,
          background: '#f8f9fa',
        };

    return (
      <th
        data-col-idx={idx}
        key={`filter-${col}-${idx}`}
        className={`py-2.5 border-b-2 border-r border-gray-300 align-top bg-[#f8f9fa] ${isQtyCol ? 'whitespace-normal text-[11px] leading-tight px-1' : 'whitespace-nowrap'} ${isCheckCol ? 'pl-2 pr-3' : isQtyCol ? '' : 'px-4'}`}
        style={headerCellStyle}
      >
        <div
          className={`font-semibold mb-2 text-gray-700 ${isQtyCol ? 'text-[11px] leading-tight whitespace-normal break-words' : 'text-sm whitespace-nowrap'} ${isCheckCol ? 'text-left' : ''}`}
        >
          {col}
        </div>
        {col === 'STT' ? (
          <div className="text-xs text-gray-400">-</div>
        ) : col === 'Mã Tracking' ? (
          <div className="flex flex-col gap-1.5 relative" style={{ zIndex: 1002 }}>
            <select
              className="w-full text-[13px] px-2 py-1.5 border rounded bg-white font-semibold text-gray-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
              value={filterValues.tracking_status || 'Tình trạng mã'}
              onChange={(e) => setFilterValues((p) => ({ ...p, tracking_status: e.target.value }))}
            >
              <option value="Tình trạng mã">Tình trạng mã</option>
              <option value="Tất cả có mã">Tất cả có mã</option>
              <option value="Trống">Trống</option>
              <option value="Toàn số">Toàn số</option>
            </select>
            {(filterValues.tracking_status === 'Tình trạng mã' || !filterValues.tracking_status) && (
              <>
                <input
                  className="w-full text-sm px-2 py-1.5 border rounded"
                  style={{ zIndex: 1002 }}
                  placeholder="Bao gồm..."
                  value={filterValues.tracking_include || ''}
                  onChange={(e) => setFilterValues((p) => ({ ...p, tracking_include: e.target.value }))}
                />
                <input
                  className="w-full text-sm px-2 py-1.5 border rounded"
                  style={{ zIndex: 1002 }}
                  placeholder="Loại trừ..."
                  value={filterValues.tracking_exclude || ''}
                  onChange={(e) => setFilterValues((p) => ({ ...p, tracking_exclude: e.target.value }))}
                />
              </>
            )}
          </div>
        ) : DROPDOWN_OPTIONS[col] || DROPDOWN_OPTIONS[key] || ['Trạng thái giao hàng', 'Kết quả check', 'GHI CHÚ'].includes(col) ? (
          <div className="relative w-full" style={{ zIndex: 1002, marginTop: '-0.125rem' }}>
            <MultiSelect
              label="Lọc..."
              options={getFilterMultiSelectOptions(col)}
              selected={filterValues[filterKey] || []}
              onChange={(vals) => setFilterValues((p) => ({ ...p, [filterKey]: vals }))}
            />
          </div>
        ) : ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2'].includes(col) ? (
          <input
            type="date"
            className="w-full text-sm px-2 py-1.5 border rounded shadow-sm"
            style={{ zIndex: 1002 }}
            value={filterValues[filterKey] || ''}
            onChange={(e) => setFilterValues((p) => ({ ...p, [filterKey]: e.target.value }))}
          />
        ) : (
          <input
            type="text"
            className="w-full text-sm px-2 py-1.5 border rounded shadow-sm"
            style={{ zIndex: 1002 }}
            placeholder="..."
            value={filterValues[filterKey] || ''}
            onChange={(e) => setFilterValues((p) => ({ ...p, [filterKey]: e.target.value }))}
          />
        )}
      </th>
    );
  };

  const renderVanDonDataCell = (row, rIdx, col, cIdx, cellStyle) => {
    const orderId = row[PRIMARY_KEY_COLUMN];
    const key = COLUMN_MAPPING[col] || col;
    let val = row[key] ?? row[col] ?? row[col.replace(/ /g, '_')] ?? '';
    if (!val && col === 'Ngày up bill') {
      val = row.ngayupbill ?? row.ngay_up_bill ?? '';
    }
    if (!val && col === 'Tiền đã thanh toán') {
      val = row.reconciled_vnd ?? '';
    }
    const pendingInfo = pendingChanges.get(orderId)?.get(key);
    if (pendingInfo) {
      val = pendingInfo.newValue;
    }
    const displayVal = ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2', 'Ngày up bill'].includes(col)
      ? formatDate(val)
      : col === 'Tổng tiền VNĐ' || col === 'Tiền đã thanh toán'
        ? val !== '' && val !== null
          ? Number(String(val).replace(/[^\d.-]/g, '')).toLocaleString('vi-VN')
          : ''
        : val;

    const colLower = String(col || '').trim().toLowerCase();
    const isCarrierCol = colLower === 'đơn vị vận chuyển';
    const isTrackingCol = colLower === 'mã tracking';
    const isReadonlyOrderDataTab = bolActiveTab === 'all';

    const mergedCellStyle = { ...(cellStyle || {}) };

    return (
      <td
        key={`${orderId}-${col}`}
        data-van-r={rIdx}
        data-van-c={cIdx}
        className={getCellClass(row, col, String(displayVal), rIdx, cIdx)}
        style={mergedCellStyle}
        onMouseDown={(e) => handleMouseDown(rIdx, cIdx, e)}
        onMouseEnter={() => handleMouseEnter(rIdx, cIdx)}
      >
        {col === 'STT' ? (
          row.rowIndex || (currentPage - 1) * effectiveRowsPerPage + rIdx + 1
        ) : isReadonlyEditTab || (isReadonlyOrderDataTab && (isCarrierCol || isTrackingCol)) ? (
          displayVal
        ) : DROPDOWN_OPTIONS[col] ? (
          <select
            className="w-full h-full bg-transparent border-none outline-none text-sm p-0 m-0 cursor-pointer"
            value={String(val)}
            onChange={(e) => handleCellChange(orderId, key, e.target.value)}
          >
            {DROPDOWN_OPTIONS[col].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : col === 'Kết quả Check' || col === 'Trạng thái giao hàng' ? (
          <select
            className="w-full h-full bg-transparent border-none outline-none text-sm flex items-center"
            style={{ padding: 0, margin: 0, lineHeight: '38px' }}
            value={String(val)}
            onChange={(e) => handleCellChange(orderId, key, e.target.value)}
          >
            {getCellEditSelectOptions(col)
              .filter((o) => o === '' || !isVanDonSemanticEmpty(o))
              .map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
          </select>
        ) : colInList(col, EDITABLE_COLS) && colInList(col, LONG_TEXT_COLS) ? (
          <textarea
            key={`${orderId}-${col}-${String(displayVal)}`}
            defaultValue={String(displayVal)}
            rows={isLongTextExpanded ? 6 : 2}
            onBlur={(e) => {
              const newValue = e.target.value;
              if (newValue !== String(displayVal)) {
                handleCellChange(orderId, key, newValue);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.target.value = String(displayVal);
                e.target.blur();
              } else if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                const newValue = e.target.value;
                if (newValue !== String(displayVal)) {
                  handleCellChange(orderId, key, newValue);
                }
                e.target.blur();
              }
            }}
            onFocus={(e) => {
              setSelection({ startRow: rIdx, startCol: cIdx, endRow: rIdx, endCol: cIdx });
            }}
            className="block w-full min-h-[2.5rem] outline-none bg-transparent border-none p-0 text-sm resize-y leading-snug"
          />
        ) : colInList(col, EDITABLE_COLS) ? (
          <input
            key={`${orderId}-${col}-${String(displayVal)}`}
            type="text"
            defaultValue={String(displayVal)}
            onBlur={(e) => {
              const newValue = e.target.value;
              if (newValue !== String(displayVal)) {
                handleCellChange(orderId, key, newValue);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const newValue = e.target.value;
                if (newValue !== String(displayVal)) {
                  handleCellChange(orderId, key, newValue);
                }
                e.target.blur();
              } else if (e.key === 'Escape') {
                e.target.value = String(displayVal);
                e.target.blur();
              }
            }}
            onFocus={(e) => {
              e.target.select();
              setSelection({ startRow: rIdx, startCol: cIdx, endRow: rIdx, endCol: cIdx });
            }}
            className="w-full h-full outline-none bg-transparent border-none p-0 text-sm"
          />
        ) : (
          displayVal
        )}
      </td>
    );
  };

  // Không cho double click chọn/kéo text để "mang data đi" trong bảng (trừ input/select đang chỉnh sửa).
  const blockTableDoubleClickCopy = (e) => {
    const target = e?.target;
    if (!target) return;
    // Cho phép double click trong các input/select/textarea để user vẫn sửa được.
    const editable = target.closest?.('input, textarea, select, [contenteditable="true"]');
    if (editable) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const blockTableDragStart = (e) => {
    // Chặn drag text/drag selection từ bảng.
    e.preventDefault();
    e.stopPropagation();
  };

  if (!canView('ORDERS_LIST')) {
    return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này (ORDERS_LIST).</div>;
  }

  /* End Component Logic */
  return (
    <div className="bg-gray-50 flex flex-col h-[calc(100vh-64px)] min-h-0 overflow-hidden">
      {/* Header Bar - Now including Tabs and Main Actions */}
      <div className="bg-white border-b border-gray-200 shadow-sm z-50 flex-shrink-0">
        <div className="max-w-full mx-auto px-4 py-1 min-w-0">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between min-w-0">
            {/* Left: Logo & Title (Smaller) */}
            <div className="flex items-center gap-3 shrink-0">

              <img
                src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Fbe61f44f.%E1%BA%A2nh.021347.png"
                alt="Logo"
                className="h-8 object-contain"
              />
              <div>
                <h1 className="text-lg font-bold text-gray-800 leading-tight">QUẢN LÝ VẬN ĐƠN</h1>
              </div>
            </div>

            {/* Middle: Tabs — overflow-x-auto để màn hẹp vẫn thấy Đơn Nhật / Hà Nội */}
            <div className="min-w-0 w-full xl:flex-1 xl:max-w-none flex justify-center xl:px-2">
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200 overflow-x-auto max-w-full [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
              {[
                { id: 'all', label: 'Đơn nhắc hộ', icon: '📋' },
                { id: 'ca_nhan', label: 'Đơn cá nhân', icon: '👤' },
                { id: 'readonly_all', label: 'Xem tất cả (khóa sửa)', icon: '👁️' },
                { id: 'japan', label: 'Đơn Nhật', icon: '🇯🇵' },
                { id: 'hanoi', label: 'Đẩy đơn Hà Nội', icon: '🏛️' }
              ].filter(tab => {
                // Admin luôn thấy tất cả tabs, user thường chỉ thấy tab "Đẩy đơn Hà Nội" nếu có quyền
                if (tab.id === 'hanoi') {
                  return isAdmin || canViewHaNoi;
                }
                return true;
              }).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  className={`shrink-0 whitespace-nowrap px-2 sm:px-3 md:px-4 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${bolActiveTab === tab.id
                    ? 'bg-white text-[#F37021] shadow-sm'
                    : 'text-gray-600 hover:bg-white/50 hover:text-[#F37021]'
                    }`}
                  onClick={() => {
                    setBolActiveTab(tab.id);
                    setCurrentPage(1);
                    // Clear selection when switching tabs
                    if (tab.id !== 'hanoi') {
                      setSelectedRows(new Set());
                    }
                  }}
                >
                  <span className="text-sm">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
              </div>
            </div>

            {/* Right: Status & Actions */}
            <div className="flex items-center gap-2 shrink-0 justify-end xl:justify-start">
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md border border-gray-100">
                <span className={`h-1.5 w-1.5 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-[10px] uppercase font-bold text-gray-500">
                  {allData.length > 0 ? `${allData.length} ĐƠN` : 'NO DATA'}
                </span>
              </div>
              <button
                onClick={() => refetchVanDonData()}
                disabled={isQueryLoading}
                className="px-3 py-1.5 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-md text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {isQueryLoading ? <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div> : <span>🔄</span>}
                {isQueryLoading ? '...' : 'TẢI LẠI'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main: không overflow-hidden — để dropdown bộ lọc (MultiSelect) không bị cắt; cuộn chỉ ở vùng bảng bên dưới */}
      <div className="flex-1 min-h-0 grid grid-rows-[auto,1fr,auto] gap-1 p-1 bg-[#f4f7fa] min-w-0 overflow-hidden">

        {/* Toolbar: hàng 0 = số dòng/trang; hàng 1 = lọc; hàng 2 = thao tác + tổng tiền */}
        <div className="relative z-[100] bg-white rounded-lg shadow-sm border border-gray-200 px-2 py-1 flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 w-full border-b border-gray-100 pb-1.5 mb-0.5">
            <label className="text-xs font-semibold text-gray-700 whitespace-nowrap shrink-0" htmlFor="van-don-customer-quick-search">
              🔎 Tra SĐT / tên / địa chỉ:
            </label>
            <input
              id="van-don-customer-quick-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Nhập SĐT, tên khách hoặc địa chỉ…"
              value={customerQuickSearch}
              onChange={(e) => {
                setCustomerQuickSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="flex-1 min-w-[200px] max-w-2xl text-xs px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#F37021] focus:border-[#F37021] bg-white"
            />
            {customerQuickSearch.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setCustomerQuickSearch('');
                  setCurrentPage(1);
                }}
                className="text-xs text-gray-500 hover:text-gray-800 px-1.5 py-0.5 rounded border border-gray-200 hover:bg-gray-50 shrink-0"
              >
                Xóa
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
              <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">📅 Lọc thời gian:</label>
              <div className="flex items-center gap-2">
                <select
                  className="text-xs px-2 py-1 border border-gray-300 rounded bg-white font-bold text-blue-800"
                  value={bolDateType}
                  onChange={(e) => {
                    setBolDateType(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="Ngày lên đơn">📅 Lên đơn</option>
                  <option value="Ngày đóng hàng">📦 Đóng hàng</option>
                  <option value="Ngày đẩy đơn">🚀 Đẩy đơn</option>
                  <option value="Ngày có mã tracking">🎫 Có Tracking</option>
                </select>
                <input
                  type="date"
                  value={dateFrom || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDateFrom(v);
                    setCurrentPage(1);
                    if (v) setEnableDateFilter(true);
                  }}
                  className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Từ ngày"
                />
                <span className="text-xs text-gray-500 font-bold">→</span>
                <input
                  type="date"
                  value={dateTo || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDateTo(v);
                    setCurrentPage(1);
                    if (v) setEnableDateFilter(true);
                  }}
                  className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Đến ngày"
                />
                <label className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableDateFilter}
                    onChange={(e) => {
                      setEnableDateFilter(e.target.checked);
                      setCurrentPage(1);
                    }}
                    className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span>Áp dụng</span>
                </label>
              </div>
            </div>

            {/* Market & Product Filters */}
            <div className="flex items-center gap-1 bg-purple-50 px-2 py-1 rounded-lg border border-purple-200">
              <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">🌍 Thị trường:</label>
              <div className="relative" style={{ minWidth: '150px', zIndex: 1002 }}>
                <MultiSelect
                  label="Chọn thị trường..."
                  options={getFilterMultiSelectOptions('Khu vực')}
                  selected={filterValues.market || []}
                  onChange={(vals) => {
                    setFilterValues(prev => ({ ...prev, market: vals }));
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-lg border border-green-200">
              <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">📦 Sản phẩm:</label>
              <div className="relative" style={{ minWidth: '150px', zIndex: 1002 }}>
                <MultiSelect
                  label="Chọn sản phẩm..."
                  options={getFilterMultiSelectOptions('Mặt hàng')}
                  selected={filterValues.product || []}
                  onChange={(vals) => {
                    setFilterValues(prev => ({ ...prev, product: vals }));
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
              <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">👤 NV Sale:</label>
              <div className="relative" style={{ minWidth: '160px', zIndex: 1001 }}>
                <MultiSelect
                  label="Chọn NV Sale..."
                  options={getFilterMultiSelectOptions('Nhân viên Sale')}
                  selected={filterValues.nv_sale || []}
                  onChange={(vals) => {
                    setFilterValues((prev) => ({ ...prev, nv_sale: vals }));
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-200"> {/* Changed py-1 to py-0.5 */}
              <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">📣 NV MKT:</label>
              <div className="relative" style={{ minWidth: '160px', zIndex: 1000 }}>
                <MultiSelect
                  label="Chọn NV MKT..."
                  options={getFilterMultiSelectOptions('Nhân viên MKT')}
                  selected={filterValues.nv_mkt || []}
                  onChange={(vals) => {
                    setFilterValues((prev) => ({ ...prev, nv_mkt: vals }));
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-200">
              <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">🚚 NV Vận đơn:</label>
              <div className="relative" style={{ minWidth: '160px', zIndex: 999 }}>
                <MultiSelect
                  label="Chọn NV Vận đơn..."
                  options={getFilterMultiSelectOptions('NV Vận đơn')}
                  selected={filterValues.nv_van_don || []}
                  onChange={(vals) => {
                    setFilterValues((prev) => ({ ...prev, nv_van_don: vals }));
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1 bg-cyan-50 px-2 py-1 rounded-lg border border-cyan-200">
              <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">🚛 ĐV Vận chuyển:</label>
              <div className="relative" style={{ minWidth: '170px', zIndex: 998 }}>
                <MultiSelect
                  label="Chọn đơn vị..."
                  options={getFilterMultiSelectOptions('Đơn vị vận chuyển')}
                  selected={filterValues.shipping_unit || []}
                  onChange={(vals) => {
                    setFilterValues((prev) => ({ ...prev, shipping_unit: vals }));
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-gray-100 pt-2">
            {/* Toolbar Actions Group */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={refreshData}
                className="p-1 px-2 hover:bg-red-50 text-red-600 rounded text-xs transition-colors flex items-center gap-1 group flex-shrink-0"
                title="Xóa tất cả bộ lọc"
              >
                <span className="group-hover:rotate-90 transition-transform text-[10px]">✕</span>
                <span className="font-bold">XÓA LỌC</span>
              </button>
              <div className="h-4 w-px bg-gray-300 mx-1"></div>
              <button
                onClick={() => setSyncPopoverOpen(true)}
                className="p-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-bold transition-all flex items-center gap-1.5 relative border border-blue-100"
              >
                🔄 Trạng thái
                {pendingChanges.size > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] px-1 rounded-full shadow-sm">
                    {pendingChanges.size}
                  </span>
                )}
              </button>
              <button
                onClick={handleUpdateAll}
                disabled={isReadonlyEditTab}
                className="p-1 px-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded text-xs font-bold transition-all flex items-center gap-1 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title={isReadonlyEditTab ? 'Tab chỉ xem: không cho cập nhật/chỉnh sửa' : 'Ghi các thay đổi đang chờ xuống CSDL'}
              >
                ✅ Xác nhận lưu
              </button>

              <button onClick={() => setShowColumnSettings(true)} className="p-1 px-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-xs font-bold transition-all flex items-center gap-1">
                ⚙️ Cài đặt cột
              </button>

              <div
                className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100"
                title="Cố định chỉ ảnh hưởng khi kéo ngang (freeze cột), KHÔNG khóa chỉnh sửa ô. Nhập 0 để không ghim cột dữ liệu (cột checkbox tab Hà Nội vẫn ghim riêng)."
              >
                Cố định (freeze):
                <input
                  type="number"
                  min={Math.min(2, currentColumns.length)}
                  max={currentColumns.length}
                  className="w-10 border-none bg-transparent focus:ring-0 text-center font-bold text-[#F37021]"
                  value={fixedColumns}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setFixedColumns(Math.min(2, currentColumns.length));
                      return;
                    }
                    const v = Number(raw);
                    const minFixed = Math.min(2, currentColumns.length);
                    setFixedColumns(Number.isFinite(v) ? Math.max(minFixed, v) : minFixed);
                  }}
                  onBlur={() => {
                    const minFixed = Math.min(2, currentColumns.length);
                    setFixedColumns((p) =>
                      Math.max(minFixed, Math.min(Math.floor(Number(p) || minFixed), currentColumns.length))
                    );
                  }}
                />
                <span className="text-[10px] opacity-70 tabular-nums">/ {currentColumns.length}</span>
                <span className="text-[10px] text-gray-400 ml-1">vẫn sửa được</span>
              </div>

              {/* Phân FFM button - chỉ hiển thị trong tab Hà Nội */}
              {bolActiveTab === 'hanoi' && (
                <div className="relative" ref={phanFFMRef}>
                  <button
                    onClick={() => setShowPhanFFMDropdown(!showPhanFFMDropdown)}
                    disabled={selectedRows.size === 0}
                    className="p-1 px-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                  >
                    📦 Phân FFM {selectedRows.size > 0 && `(${selectedRows.size})`}
                  </button>
                  {showPhanFFMDropdown && selectedRows.size > 0 && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-[12000] min-w-[150px]">
                      <button
                        onClick={async () => {
                          await handlePhanFFM('MGT');
                          setShowPhanFFMDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 first:rounded-t-lg"
                      >
                        MGT
                      </button>
                      <button
                        onClick={async () => {
                          await handlePhanFFM('T&T');
                          setShowPhanFFMDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 last:rounded-b-lg"
                      >
                        T&T
                      </button>
                    </div>
                  )}
                </div>
              )}


              {isReadonlyAllTab && (
                <span className="px-2 py-1 rounded bg-gray-100 border border-gray-200 text-[11px] font-semibold text-gray-600">
                  Chế độ chỉ xem - không cho sửa
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 flex-shrink-0 sm:ml-auto">
              <div className="text-right flex flex-col items-end">
                <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Số lượng đơn</span>
                <span className="text-sm font-black text-blue-600 leading-none tabular-nums">{totalOrdersCount.toLocaleString('vi-VN')}</span>
              </div>
              <div className="text-right flex flex-col items-end">
                <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Tổng tiền</span>
                <span className="text-sm font-black text-emerald-600 leading-none">{totalMoney.toLocaleString('vi-VN')} ₫</span>
              </div>
            </div>
          </div>


          <div className="relative z-0 bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden flex flex-col min-h-0 flex-1">
            {isQueryLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] bg-white rounded-lg">
                <div className="relative w-16 h-16 mb-4">
                  <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-[#0052cc] border-t-transparent rounded-full animate-spin"></div>
                </div>
                <p className="text-gray-500 font-medium animate-pulse text-lg">Đang tải dữ liệu vận đơn...</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                {/* 1. FIXED HEADER AREA (FFM Style) */}
                <div
                  ref={vanDonHeaderContainerRef}
                  className="overflow-hidden border-b-2 border-gray-300 bg-[#f8f9fa] shrink-0 shadow-sm"
                  style={{ paddingRight: '15px' }}
                >
                  <table
                    className="border-separate border-spacing-0 w-max text-[13px] leading-tight table-fixed"
                    style={{ tableLayout: 'fixed' }}
                  >
                    <thead className="bg-[#f8f9fa]">
                      <tr className="bg-gray-100 align-top">
                        {bolActiveTab === 'hanoi' && (
                          <th className="py-2.5 border-b-2 border-r border-gray-300 align-top bg-[#f8f9fa] whitespace-nowrap px-2 sticky left-0 z-[10100]" style={{ width: VAN_DON_CHECKBOX_COL_PX, minWidth: VAN_DON_CHECKBOX_COL_PX }}>
                            <div className="flex items-center justify-center">
                              <input
                                type="checkbox"
                                checked={getFilteredData.length > 0 && getFilteredData.every((r) => selectedRows.has(r[PRIMARY_KEY_COLUMN]))}
                                onChange={(e) => {
                                  if (e.target.checked) selectAllRows();
                                  else deselectAllRows();
                                }}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                              />
                            </div>
                          </th>
                        )}
                        {currentColumns.map((col, idx) => {
                          const stickyLeft = getStickyLeftPx(idx);
                          const isFixed = idx < effectiveFixedColumns;
                          const style = isFixed
                            ? { position: 'sticky', left: stickyLeft, zIndex: 10200, background: '#f8f9fa' }
                            : { position: 'relative', zIndex: 10200 };
                          return renderVanDonFilterTh(col, idx, style, isFixed && idx === effectiveFixedColumns - 1, isFixed);
                        })}
                      </tr>
                    </thead>
                  </table>
                </div>

                {/* 2. SCROLLABLE BODY (Virtualized) */}
                {getFilteredData.length === 0 ? (
                  <div
                    className="flex-1 overflow-auto overscroll-contain bg-white relative"
                    onScroll={onTableScroll}
                    ref={(el) => {
                      if (el) {
                        tableRef.current = el;
                        horizontalScrollHostRef.current = el;
                        // Duy trì vị trí scroll khi chuyển giữa các state
                        if (vanDonHeaderContainerRef.current) {
                          el.scrollLeft = vanDonHeaderContainerRef.current.scrollLeft;
                        }
                      }
                    }}
                  >
                    <div className="sticky left-0 w-full h-64 flex justify-center items-center text-gray-500 italic z-50 pointer-events-none">
                      Không tìm thấy dữ liệu phù hợp
                    </div>
                    <table
                      className="border-separate border-spacing-0 w-max text-[13px] leading-tight table-fixed font-sans"
                      style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}
                    >
                      <tbody>
                        <tr className="h-0 pointer-events-none">
                          {bolActiveTab === 'hanoi' && (
                            <td style={{ width: VAN_DON_CHECKBOX_COL_PX, minWidth: VAN_DON_CHECKBOX_COL_PX }} className="p-0 border-none" />
                          )}
                          {currentColumns.map((col, idx) => (
                            <td key={idx} style={getColumnWidthStyles(col)} className="p-0 border-none" />
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <TableVirtuoso
                    data={getFilteredData}
                    style={{ height: '430px', width: '100%' }}
                    scrollerRef={(el) => {
                      if (el) {
                        tableRef.current = el;
                        horizontalScrollHostRef.current = el;
                        el.addEventListener('scroll', onTableScroll);
                        // Duy trì vị trí scroll khi chuyển giữa các state
                        if (vanDonHeaderContainerRef.current) {
                          el.scrollLeft = vanDonHeaderContainerRef.current.scrollLeft;
                        }
                      }
                    }}
                    components={vanDonVirtuosoComponents}
                    itemContent={(rIdx, row) => {
                      const orderId = row[PRIMARY_KEY_COLUMN];
                      const isSelected = selectedRows.has(orderId);
                      return (
                        <>
                          {bolActiveTab === 'hanoi' && (
                            <td
                              className="py-2 border border-gray-200 text-sm h-[38px] whitespace-nowrap px-2 sticky left-0 z-[3300]"
                              style={{
                                width: VAN_DON_CHECKBOX_COL_PX,
                                minWidth: VAN_DON_CHECKBOX_COL_PX,
                                backgroundColor: isSelected ? '#dbeafe' : '#f9fafb'
                              }}
                            >
                              <div className="flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleRowSelection(orderId)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                />
                              </div>
                            </td>
                          )}
                          {currentColumns.map((col, cIdx) => {
                            const cellStickyLeft = getStickyLeftPx(cIdx);
                            const isFixed = cIdx < effectiveFixedColumns;
                            const colWidthStyles = getColumnWidthStyles(col);
                            const cellStyle = isFixed
                              ? {
                                position: 'sticky',
                                left: cellStickyLeft,
                                zIndex: 3100,
                                ...colWidthStyles,
                                overflow: 'visible',
                                textOverflow: 'clip',
                                boxShadow: cIdx === effectiveFixedColumns - 1 ? '2px 0 0 #e5e7eb' : undefined
                              }
                              : { position: 'relative', zIndex: 10, ...colWidthStyles };
                            return renderVanDonDataCell(row, rIdx, col, cIdx, cellStyle);
                          })}
                        </>
                      );
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Improved Pagination Footer (FFM Style) */}
          <div className="bg-white p-3 rounded-lg shadow-sm mt-3 flex justify-center items-center gap-4 border border-gray-200">
            <button
              disabled={currentPage <= 1 || isQueryLoading}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="px-4 py-2 bg-[#0052cc] text-white rounded disabled:bg-gray-300 font-bold shadow-sm hover:bg-[#0747a6] transition-colors flex items-center gap-2"
            >
              <span> Trang trước</span>
            </button>

            <div className="flex items-center gap-1.5 min-w-[120px] justify-center">
              <span className="text-sm font-bold text-gray-700 bg-gray-100 px-4 py-2 rounded-full border border-gray-200 shadow-inner">
                Trang {currentPage} / {totalPages || 1}
              </span>
              {totalRecords > 0 && (
                <span className="text-[10px] text-gray-400 font-bold uppercase ml-1">
                  ({(useBackendPagination ? totalRecords : getFilteredData.length).toLocaleString()} kết quả)
                </span>
              )}
            </div>

            <button
              disabled={currentPage >= totalPages || isQueryLoading}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="px-4 py-2 bg-[#0052cc] text-white rounded disabled:bg-gray-300 font-bold shadow-sm hover:bg-[#0747a6] transition-colors flex items-center gap-2"
            >
              <span>Trang sau </span>
            </button>

            <div className="flex items-center gap-2 ml-4 bg-blue-50/50 px-3 py-1.5 rounded-lg border border-blue-100">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-tighter">Số dòng:</label>
              <select
                className="border-none bg-transparent text-sm font-black text-[#0052cc] focus:ring-0 p-0 cursor-pointer"
                value={rowsPerPage}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setRowsPerPage(val);
                  setCurrentPage(1);
                }}
              >
                {(bolActiveTab === 'readonly_all' ? [50, 70, 100, 200, 500, 1000] : [50, 70, 100, 200, 500]).map((v) => (
                  <option key={v} value={v}>{v} dòng</option>
                ))}
              </select>
            </div>
          </div>
        </div>


        {/* Selection Summary Bar */}
        {calculatedSummary && calculatedSummary.count > 1 && (
          <div className="selection-summary-bar">
            <div className="summary-item">
              <span className="summary-label">Số ô</span>
              <span className="summary-value">{calculatedSummary.count}</span>
            </div>
            {calculatedSummary.sum !== 0 && (
              <>
                <div className="divider"></div>
                <div className="summary-item">
                  <span className="summary-label">Tổng</span>
                  <span className="summary-value">{calculatedSummary.sum.toLocaleString('vi-VN')}</span>
                </div>
                <div className="divider"></div>
                <div className="summary-item">
                  <span className="summary-label">TB</span>
                  <span className="summary-value">{calculatedSummary.avg.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</span>
                </div>
              </>
            )}
            <div className="divider"></div>
            <div className="text-xs opacity-70">
              <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] mr-1">Ctrl+C</kbd> Copy
              <span className="mx-2">|</span>
              <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] mr-1">Ctrl+V</kbd> Paste
              <span className="mx-2">|</span>
              <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] mr-1">Esc</kbd> Bỏ chọn
            </div>
          </div>
        )}

        {/* Toast Container */}
        <div className="fixed top-5 right-5 z-[50000] flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className={`pointer-events-auto min-w-[300px] p-4 rounded shadow-lg bg-white border-l-4 transform transition-all animate-in slide-in-from-right-10 duration-300 ${t.type === 'success' ? 'border-green-500 bg-green-50' :
              t.type === 'error' ? 'border-red-500 bg-red-50' :
                t.type === 'loading' ? 'border-blue-500 bg-blue-50' : 'border-blue-500 bg-white'
              }`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  {t.type === 'loading' && <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>}
                  <span className="text-sm font-medium text-gray-800">{t.message}</span>
                </div>
                <button onClick={() => removeToast(t.id)} className="text-gray-400 hover:text-gray-600 font-bold">&times;</button>
              </div>
            </div>
          ))}
        </div>

        {/* Sync Popover */}
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>}>
          <SyncPopover
            isOpen={syncPopoverOpen}
            onClose={() => setSyncPopoverOpen(false)}
            pendingChanges={pendingChanges}
            legacyChanges={new Map()}
            onApply={handleUpdateAll}
            applyButtonLabel="Xác nhận lưu"
            onDiscard={() => {
              if (!window.confirm('Hủy bỏ tất cả thay đổi chưa lưu?')) return;
              dbQueueRef.current = [];
              changeHistoryRef.current = [];
              historyIndexRef.current = -1;
              pendingRowSnapshotsRef.current.clear();
              setPendingChanges(new Map());
              localStorage.removeItem('speegoPendingChanges');
              localStorage.removeItem('speegoPendingRowSnapshots');
              setSyncPopoverOpen(false);
              void refreshData({ skipUnsavedCheck: true });
            }}
          />
        </Suspense>

        {/* Quick Add Modal */}


        {/* FFM Push Confirmation Modal */}
        {confirmPushData && (
          <div className="fixed inset-0 z-[20000] flex items-center justify-center pointer-events-auto">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
              onClick={cancelPushFinal}
            ></div>
            <div className="relative bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-8 max-w-md w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Background Accent */}
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>

              <div className="flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center">
                  <ChevronRight className="w-10 h-10 rotate-90" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Xác nhận đẩy đơn
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed">
                    Bạn có chắc chắn muốn đẩy <span className="font-bold text-blue-600 dark:text-blue-400">{confirmPushData.count}</span> đơn hàng
                    sang đơn vị vận chuyển <span className="font-bold px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-900 dark:text-slate-200">{confirmPushData.carrier}</span>?
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  <button
                    onClick={cancelPushFinal}
                    className="flex-1 px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 active:scale-[0.98]"
                  >
                    Để sau
                  </button>
                  <button
                    onClick={confirmPushFinal}
                    className="flex-1 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-500/25 transition-all duration-200 active:scale-[0.98]"
                  >
                    Xác nhận đẩy
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Column Settings Modal */}
        <ColumnSettingsModal
          isOpen={showColumnSettings}
          onClose={() => setShowColumnSettings(false)}
          allColumns={allColumns}
          visibleColumns={visibleColumns}
          onToggleColumn={(col) => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))}
          onSelectAll={() => {
            const all = {};
            allColumns.forEach(col => { all[col] = true; });
            setVisibleColumns(all);
          }}
          onDeselectAll={() => {
            const none = {};
            allColumns.forEach(col => { none[col] = false; });
            setVisibleColumns(none);
          }}
          onResetDefault={() => {
            const defaultCols = {};
            const defaults = viewMode === 'ORDER_MANAGEMENT' ? allColumns : DEFAULT_BILL_LADING_COLUMNS.filter(col => !HIDDEN_COLUMNS.includes(col));
            defaults.forEach(col => { defaultCols[col] = true; });
            setVisibleColumns(defaultCols);
          }}
          defaultColumns={viewMode === 'ORDER_MANAGEMENT' ? allColumns : DEFAULT_BILL_LADING_COLUMNS.filter(col => !HIDDEN_COLUMNS.includes(col))}
        />
      </div>
    </div>
  );
}

export default VanDon;
