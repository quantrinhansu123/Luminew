import { ChevronLeft, ChevronRight } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import ColumnSettingsModal from '../components/ColumnSettingsModal';
import MultiSelect from '../components/MultiSelect';
import usePermissions from '../hooks/usePermissions';
import * as API from '../services/api';
import * as rbacService from '../services/rbacService';
import '../styles/selection.css';
import { supabase } from '../supabase/config';

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
const VAN_DON_CHECKBOX_COL_PX = 52;

function VanDon() {
  const { canView, role, loading: permissionsLoading } = usePermissions();
  const roleLower = (role || '').toLowerCase();
  const isAdmin = ['admin', 'super_admin', 'director', 'manager'].includes(roleLower);



  // --- Data State ---

  // --- Data State ---
  const [allData, setAllData] = useState([]);
  const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]); // Danh sách tên nhân sự đã chọn
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [useBackendPagination, setUseBackendPagination] = useState(true); // Enable backend pagination
  // Always use BILL_OF_LADING view - ORDER_MANAGEMENT is hidden
  const [viewMode] = useState('BILL_OF_LADING');
  const isLoadingDataRef = useRef(false);

  // --- Action Queue & History Architecture ---
  const [pendingChanges, setPendingChanges] = useState(new Map()); // UI ONLY: yellow highlight
  const [syncPopoverOpen, setSyncPopoverOpen] = useState(false);

  const changeHistoryRef = useRef([]); // Stack for Ctrl-Z
  const historyIndexRef = useRef(-1);
  const dbQueueRef = useRef([]); // FIFO Queue for Backend
  const isProcessingQueue = useRef(false);

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
  const [localFilterValues, setLocalFilterValues] = useState(filterValues);

  // Debounce filter updates
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilterValues(localFilterValues);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [localFilterValues]);

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
  const [bolActiveTab, setBolActiveTab] = useState('all'); // all, japan, hanoi
  const [bolDateType, setBolDateType] = useState('Ngày lên đơn');
  const [isLongTextExpanded, setIsLongTextExpanded] = useState(false);
  const [canViewHaNoi, setCanViewHaNoi] = useState(false); // User có quyền xem tab Đẩy đơn Hà Nội không

  // --- Pagination ---
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem('vanDon_rowsPerPage');
    return saved ? Number(saved) : 50;
  });

  // Save rowsPerPage to localStorage
  useEffect(() => {
    localStorage.setItem('vanDon_rowsPerPage', String(rowsPerPage));
  }, [rowsPerPage]);

  // --- Selection & Clipboard ---
  const [selection, setSelection] = useState({
    startRow: null, startCol: null, endRow: null, endCol: null
  });
  const [copiedData, setCopiedData] = useState(null);
  const [copiedSelection, setCopiedSelection] = useState(null);
  const [stickyOffsets, setStickyOffsets] = useState([]);
  const [firstDataRowTop, setFirstDataRowTop] = useState(0); // sticky top cho dòng dữ liệu đầu tiên
  const isSelecting = useRef(false);
  const tableRef = useRef(null);

  // --- Row Selection for Hanoi Tab ---
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showPhanFFMDropdown, setShowPhanFFMDropdown] = useState(false);
  const phanFFMRef = useRef(null);

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
    if (str.includes(' ')) {
      const [d, m, y] = str.split(' ')[0].split('/').map(Number);
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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

  // --- Data Loading ---
  const loadData = async () => {
    if (isLoadingDataRef.current) return;
    isLoadingDataRef.current = true;
    setLoading(true);
    try {
      console.log('Starting data load...');

      // --- 1. PREPARE PERMISSIONS & ALLOWED NAMES BEFORE FETCHING ---
      const userJson = localStorage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;
      const userName = localStorage.getItem("username") || user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || user?.username || user?.name || "";
      // Admin luôn được coi là Manager để có full quyền
      const isManager = isAdmin || ['admin', 'director', 'manager', 'super_admin'].includes((role || '').toLowerCase());

      let allAllowedNames = [];

      // If not manager, we must calculate allowed names
      if (!isManager) {
        // Load nguoi_sua_ho từ danh_sach_van_don
        let allowedDeliveryStaffNames = [];
        if (userName) {
          try {
            const { data: vanDonRecords, error: vanDonError } = await supabase
              .from('danh_sach_van_don')
              .select('ho_va_ten, nguoi_sua_ho');

            if (!vanDonError && vanDonRecords) {
              const relevantRecords = vanDonRecords.filter(record => {
                let nguoiSuaHo = [];
                if (record.nguoi_sua_ho) {
                  if (Array.isArray(record.nguoi_sua_ho)) {
                    nguoiSuaHo = record.nguoi_sua_ho;
                  } else if (typeof record.nguoi_sua_ho === 'string') {
                    try {
                      const parsed = JSON.parse(record.nguoi_sua_ho);
                      nguoiSuaHo = Array.isArray(parsed) ? parsed : [record.nguoi_sua_ho];
                    } catch {
                      nguoiSuaHo = record.nguoi_sua_ho.trim() ? [record.nguoi_sua_ho] : [];
                    }
                  }
                }
                const isOwnRecord = record.ho_va_ten && record.ho_va_ten.toLowerCase().trim() === userName.toLowerCase().trim();
                const isInNguoiSuaHo = nguoiSuaHo.some(name => name && name.toLowerCase().trim() === userName.toLowerCase().trim());
                return isOwnRecord || isInNguoiSuaHo;
              });

              allowedDeliveryStaffNames = relevantRecords.map(r => r.ho_va_ten).filter(Boolean);
              if (userName && !allowedDeliveryStaffNames.includes(userName)) {
                allowedDeliveryStaffNames.push(userName);
              }
              console.log('🔐 [VanDon] Loaded allowed delivery staff names:', allowedDeliveryStaffNames);
            }
          } catch (err) {
            console.error('❌ [VanDon] Error loading nguoi_sua_ho:', err);
            allowedDeliveryStaffNames = userName ? [userName] : [];
          }
        }

        // Merge sources
        if (selectedPersonnelNames.length > 0) {
          allAllowedNames = [...new Set([...selectedPersonnelNames, ...allowedDeliveryStaffNames])];
          console.log('📝 [VanDon] Using selectedPersonnelNames + allowedDeliveryStaffNames:', allAllowedNames);
        } else if (allowedDeliveryStaffNames.length > 0) {
          allAllowedNames = allowedDeliveryStaffNames;
          console.log('📝 [VanDon] Using only allowedDeliveryStaffNames:', allAllowedNames);
        } else if (userName) {
          allAllowedNames = [userName];
          console.log('📝 [VanDon] Fallback: Using userName only:', allAllowedNames);
        }
      }

      // --- 2. FETCH DATA WITH BACKEND PERMISSIONS ---
      if (useBackendPagination) {
        const isReadonlyAllTab = bolActiveTab === 'readonly_all';
        // Admin: xem tất cả dữ liệu, KHÔNG bị filter bởi bất kỳ filter nào
        const activeTeam = isReadonlyAllTab ? undefined : (isAdmin ? undefined : (bolActiveTab === 'hanoi' ? 'Hà Nội' : (omActiveTeam !== 'all' ? omActiveTeam : undefined)));
        const activeStatus = isReadonlyAllTab ? undefined : (isAdmin ? undefined : (enableDateFilter ? undefined : (filterValues.status || undefined)));
        const isJapanTab = bolActiveTab === 'japan';
        // Admin: KHÔNG filter theo market/product/date (xem tất cả)
        const marketFilter = isReadonlyAllTab ? undefined : (isAdmin ? undefined : (isJapanTab ? ['Nhật Bản', 'CĐ Nhật Bản'] : filterValues.market));
        const productFilter = isReadonlyAllTab ? undefined : (isAdmin ? undefined : filterValues.product);
        const shouldApplyDateFilter = !isReadonlyAllTab && enableDateFilter && !isAdmin;

        // Admin/Manager: không filter theo nhân sự (luôn xem tất cả)
        // Pass allowedStaff to API ONLY if not Manager AND Not Japan Tab AND Not Admin
        const apiAllowedStaff = (!isManager && !isJapanTab && !isAdmin) ? allAllowedNames : undefined;

        console.log('🚀 [VanDon] Fetching API - isAdmin:', isAdmin, 'allowedStaff:', apiAllowedStaff, 'activeTeam:', activeTeam, 'marketFilter:', marketFilter);

        // Admin: load tất cả đơn hàng một lần (không pagination)
        const fetchLimit = isAdmin ? 100000 : rowsPerPage;
        const fetchPage = isAdmin ? 1 : currentPage;

        const saleStaffApi =
          (isAdmin || isReadonlyAllTab) ? undefined : (filterValues.nv_sale?.length ? filterValues.nv_sale : undefined);
        const mktStaffApi =
          (isAdmin || isReadonlyAllTab) ? undefined : (filterValues.nv_mkt?.length ? filterValues.nv_mkt : undefined);
        const vanDonStaffApi =
          (isAdmin || isReadonlyAllTab) ? undefined : (filterValues.nv_van_don?.length ? filterValues.nv_van_don : undefined);

        const result = await API.fetchVanDon({
          page: fetchPage,
          limit: fetchLimit,
          team: activeTeam,
          status: activeStatus,
          market: marketFilter,
          product: productFilter,
          nv_sale: saleStaffApi?.length ? saleStaffApi : undefined,
          nv_mkt: mktStaffApi?.length ? mktStaffApi : undefined,
          nv_van_don: vanDonStaffApi?.length ? vanDonStaffApi : undefined,
          dateFrom: shouldApplyDateFilter ? dateFrom : undefined,
          dateTo: shouldApplyDateFilter ? dateTo : undefined,
          allowedStaff: apiAllowedStaff
        });

        if (result.error) {
          throw new Error(result.error);
        }

        let filteredData = result.data;
        let filteredTotal = result.total;

        // --- 3. CLIENT SIDE POST-PROCESSING (Hanoi Tab, etc) ---

        // Tab "Đẩy đơn Hà Nội": chỉ hiển thị đơn OK và đơn vị vận chuyển trống (áp dụng cho cả Admin)
        if (bolActiveTab === 'hanoi') {
          filteredData = result.data.filter(row => {
            const checkResult = String(row['Kết quả Check'] || row['Kết quả check'] || '').trim();
            const deliveryUnit = String(row['Đơn vị vận chuyển'] || row['Đơn vị Vận chuyển'] || '').trim();

            // Kết quả Check phải là "Ok" hoặc "OK"
            const isCheckOk = checkResult.toLowerCase() === 'ok';
            // Đơn vị vận chuyển phải trống hoặc null
            const isDeliveryUnitEmpty = !deliveryUnit || deliveryUnit === '' || deliveryUnit === 'null';

            return isCheckOk && isDeliveryUnitEmpty;
          });
          filteredTotal = filteredData.length;
          console.log('🏛️ [VanDon Backend] Tab Hà Nội - Filtered by Check="OK" and empty Đơn vị vận chuyển:', filteredData.length, 'orders');
        }

        // Tab "Đơn Nhật": không filter theo selectedPersonnelNames (đã filter ở API level)
        else if (isJapanTab) {
          // Tab "Đơn Nhật": đã filter theo country ở API level, chỉ cần bỏ filter nhân sự
          console.log('🇯🇵 [VanDon Backend] Japan tab - already filtered by country at API level, no personnel filter');
          filteredData = result.data; // Data đã được filter theo country ở API
          filteredTotal = result.total; // Total đã đúng từ API
        } else {
          // Standard tabs - already filtered by backend
          // No extra client filtering needed
        }

        // Debug: Kiểm tra đơn hàng cụ thể (chỉ log, không block)
        if (isAdmin) {
          const debugCodes = ['Bonb11bf9db', 'Kemb5a90cf6'];
          debugCodes.forEach(debugCode => {
            const found = result.data.find(row => {
              const orderCode = row['Mã đơn hàng'] || row.order_code || row['order_code'];
              return orderCode === debugCode;
            });
            if (found) {
              console.log('✅ [DEBUG] Tìm thấy đơn hàng', debugCode, 'trong result.data');
            } else {
              console.log('❌ [DEBUG] KHÔNG tìm thấy đơn hàng', debugCode, 'trong result.data');
              console.log('  - Total:', result.total, 'Page:', result.page, '/', result.totalPages);
            }
          });
        }

        setAllData(filteredData);
        setTotalRecords(filteredTotal);

        if (filteredData.length === 0 && filteredTotal === 0) {
          addToast('⚠️ Không tìm thấy dữ liệu phù hợp', 'warning', 3000);
        } else {
          addToast(`✅ Đã tải ${filteredData.length}/${filteredTotal} đơn hàng (trang ${result.page}/${result.totalPages})`, 'success', 2000);
        }

      } else {
        // Fallback: Load all data (Client Side Pagination) logic...
        let data = await API.fetchOrders();

        // --- PREPARE PERMISSIONS & ALLOWED NAMES FOR CLIENT-SIDE FILTERING ---
        // userJson, user, userName, isManager are already defined above
        let allAllowedNamesFallback = [];
        if (!isManager) {
          if (selectedPersonnelNames.length > 0) {
            allAllowedNamesFallback = [...new Set([...selectedPersonnelNames, ...allAllowedNames])]; // allAllowedNames from above is allowedDeliveryStaffNames
            console.log('📝 [VanDon Fallback] Using selectedPersonnelNames + allowedDeliveryStaffNames:', allAllowedNamesFallback);
          } else if (allAllowedNames.length > 0) { // allAllowedNames from above is allowedDeliveryStaffNames
            allAllowedNamesFallback = allAllowedNames;
            console.log('📝 [VanDon Fallback] Using only allowedDeliveryStaffNames:', allAllowedNamesFallback);
          } else if (userName) {
            allAllowedNamesFallback = [userName];
            console.log('📝 [VanDon Fallback] Fallback: Using userName only:', allAllowedNamesFallback);
          }
        }

        const normalizeNameForMatchFallback = (str) => String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');

        const matchesPersonnelFilterFallback = (row) => {
          if (isManager || allAllowedNamesFallback.length === 0) return true;
          const s = normalizeNameForMatchFallback(row.sale_staff || row["Nhân viên Sale"]);
          const m = normalizeNameForMatchFallback(row.marketing_staff || row["Nhân viên MKT"]);
          const d = normalizeNameForMatchFallback(row.delivery_staff || row["NV Vận đơn"] || row["Nhân viên Vận đơn"]);
          return allAllowedNamesFallback.some(n => {
            const nn = normalizeNameForMatchFallback(n);
            return s.includes(nn) || m.includes(nn) || d.includes(nn) || nn.includes(s) || nn.includes(m) || nn.includes(d);
          });
        };

        // --- CLIENT-SIDE FILTERING ---
        const isJapanTab = bolActiveTab === 'japan';
        const isHanoiTab = bolActiveTab === 'hanoi';

        if (isJapanTab) {
          data = data.filter(r => {
            const c = String(r.country || r['Khu vực'] || '').toLowerCase();
            return c === 'nhật bản' || c === 'cđ nhật bản';
          });
          console.log('🇯🇵 [VanDon Fallback] Japan tab - filtering by country only');
        } else if (isHanoiTab) {
          // Tab "Đẩy đơn Hà Nội": chỉ hiển thị đơn OK và đơn vị vận chuyển trống
          data = data.filter(r => {
            const checkResult = String(r['Kết quả Check'] || r['Kết quả check'] || '').trim();
            const deliveryUnit = String(r['Đơn vị vận chuyển'] || r['Đơn vị Vận chuyển'] || '').trim();

            // Kết quả Check phải là "Ok" hoặc "OK"
            const isCheckOk = checkResult.toLowerCase() === 'ok';
            // Đơn vị vận chuyển phải trống hoặc null
            const isDeliveryUnitEmpty = !deliveryUnit || deliveryUnit === '' || deliveryUnit === 'null';

            return isCheckOk && isDeliveryUnitEmpty;
          });
          console.log('🏛️ [VanDon Fallback] Tab Hà Nội - Filtered by Check="OK" and empty Đơn vị vận chuyển:', data.length, 'orders');
        } else {
          // Filter by personnel for non-manager and non-Japan tabs
          if (!isManager && allAllowedNamesFallback.length > 0) {
            data = data.filter(r => matchesPersonnelFilterFallback(r));
            console.log('🔍 [VanDon Fallback] Filtering by personnel:', allAllowedNamesFallback);
          } else if (!isManager && userName) {
            // Fallback: If no specific personnel names, filter by current userName
            const uNorm = normalizeNameForMatchFallback(userName);
            data = data.filter(r => {
              const s = normalizeNameForMatchFallback(r.sale_staff || r["Nhân viên Sale"]);
              const m = normalizeNameForMatchFallback(r.marketing_staff || r["Nhân viên MKT"]);
              const d = normalizeNameForMatchFallback(r.delivery_staff || r["NV Vận đơn"] || r["Nhân viên Vận đơn"]);
              return s.includes(uNorm) || m.includes(uNorm) || d.includes(uNorm) || uNorm.includes(s) || uNorm.includes(m) || uNorm.includes(d);
            });
            console.log('🔍 [VanDon Fallback] Fallback filtering by username:', userName);
          }
        }

        setAllData(data);
        setTotalRecords(data.length);
        addToast(`✅ Đã tải ${data.length} đơn hàng (Client Mode)`, 'success', 2000);
      }

      // Load MGT Noi Bo orders (This block runs after both backend and client pagination logic)
      try {
        const mgtOrder = await API.fetchMGTNoiBoOrders();
        setMgtNoiBoOrder(mgtOrder);
      } catch (e) {
        console.error('Error loading MGT Noi Bo orders:', e);
      }

    } catch (error) {
      console.error('Load data error:', error);
      addToast(`❌ Lỗi tải dữ liệu: ${error.message}. Vui lòng thử lại.`, 'error', 8000);
    } finally {
      setLoading(false);
      isLoadingDataRef.current = false;
    }
  };

  const refreshData = async () => {
    setPendingChanges(new Map());
    // Reset tất cả filter values về default
    const defaultFilters = {
      market: [],
      product: [],
      nv_sale: [],
      nv_mkt: [],
      nv_van_don: [],
      shipping_unit: [],
      tracking_include: '',
      tracking_exclude: '',
      tracking_status: 'Tình trạng mã'
    };
    setFilterValues(defaultFilters);
    setLocalFilterValues(defaultFilters);
    setDateFrom(isAdmin ? '' : getThreeDaysAgo());
    setDateTo(isAdmin ? '' : getToday());
    setEnableDateFilter(!isAdmin);
    setCurrentPage(1);
    await loadData();
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

  // Load selected personnel names for current user
  useEffect(() => {
    const loadSelectedPersonnel = async () => {
      try {
        const userEmail = localStorage.getItem("userEmail") || "";

        if (!userEmail) {
          setSelectedPersonnelNames([]);
          return;
        }

        const userEmailLower = userEmail.toLowerCase().trim();
        const personnelMap = await rbacService.getSelectedPersonnel([userEmailLower]);
        const personnelNames = personnelMap[userEmailLower] || [];

        const validNames = personnelNames.filter(name => {
          const nameStr = String(name).trim();
          return nameStr.length > 0 && !nameStr.includes('@');
        });

        console.log('📝 [VanDon] Valid personnel names:', validNames);
        setSelectedPersonnelNames(validNames);
      } catch (error) {
        console.error('❌ [VanDon] Error loading selected personnel:', error);
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

  // Reload data when filters or pagination change (if using backend)
  // Don't skip initial mount - let it load on mount
  useEffect(() => {
    if (useBackendPagination && !permissionsLoading) {
      const timeoutId = setTimeout(() => {
        loadData();
      }, 100); // Small delay to ensure state is ready
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, bolActiveTab, omActiveTeam, filterValues.market, filterValues.product, filterValues.nv_sale, filterValues.nv_mkt, filterValues.nv_van_don, filterValues.shipping_unit, enableDateFilter, dateFrom, dateTo, useBackendPagination, selectedPersonnelNames.length, permissionsLoading]);

  const savePendingToLocalStorage = (newPending) => {
    const changesToSave = {};
    if (newPending && newPending.size > 0) {
      newPending.forEach((val, id) => {
        changesToSave[id] = Object.fromEntries(val);
      });
    }
    localStorage.setItem('speegoPendingChanges', JSON.stringify(changesToSave));
  };

  const deepCloneMapOfMaps = useCallback((sourceMap) => {
    const clone = new Map();
    if (sourceMap) {
      sourceMap.forEach((innerMap, key) => { clone.set(key, new Map(innerMap)); });
    }
    return clone;
  }, []);

  // Handle Phân FFM - Update "Đơn vị vận chuyển" and "Ngày Kế toán đối soát với FFM lần 2" for selected rows
  const handlePhanFFM = async (carrierName) => {
    if (selectedRows.size === 0) return;

    const selectedCount = selectedRows.size;
    const carrierKey = 'Đơn vị vận chuyển';
    const accountingDateKey = 'Ngày Kế toán đối soát với FFM lần 2';

    // Get current date/time in ISO format
    const now = new Date().toISOString();

    const historyChanges = [];
    selectedRows.forEach(orderId => {
      const originalRow = allData.find(r => r[PRIMARY_KEY_COLUMN] === orderId);

      const originalCarrierValue = originalRow ? String(originalRow[carrierKey] || originalRow['shipping_unit'] || originalRow['Đơn vị vận chuyển'] || '') : '';
      const pendingCarrierVal = pendingChanges.get(orderId)?.get(carrierKey);
      const stepCarrierValue = pendingCarrierVal ? String(pendingCarrierVal.newValue) : originalCarrierValue;

      if (String(carrierName) !== String(stepCarrierValue)) {
        historyChanges.push({ orderId, colKey: carrierKey, originalValue: stepCarrierValue, newValue: carrierName });
      }

      const originalDateValue = originalRow ? String(originalRow[accountingDateKey] || originalRow['accounting_check_date'] || '') : '';
      const pendingDateVal = pendingChanges.get(orderId)?.get(accountingDateKey);
      const stepDateValue = pendingDateVal ? String(pendingDateVal.newValue) : originalDateValue;

      if (String(now) !== String(stepDateValue)) {
        historyChanges.push({ orderId, colKey: accountingDateKey, originalValue: stepDateValue, newValue: now });
      }
    });

    if (historyChanges.length > 0) {
      pushChange(historyChanges);
    }

    // Clear selection
    setSelectedRows(new Set());

    addToast(`✅ Đã phân ${carrierName} cho ${selectedCount} đơn hàng và cập nhật ngày đối soát`, 'success', 3000);
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

  /** Độ rộng cố định theo từng cột để tính offset sticky chính xác khi cuộn ngang. */
  const getColumnWidthPx = useCallback((col) => {
    const isCheckCol = (col === "Kết quả Check" || col === "Kết quả check");
    const isNameCol = (col === "Name*");
    const isAddCol = (col === "Add");
    const isCityCol = (col === "City");
    const isProductCol = (col === "Mặt hàng");
    const isProductNameCol = (col === "Tên mặt hàng 1" || col === "Tên mặt hàng 2");
    const isQtyCol = col === "Số lượng mặt hàng 1" || col === "Số lượng mặt hàng 2";
    if (isQtyCol) return 52;
    if (isCheckCol) return 150;
    if (isNameCol) return 220;
    if (isAddCol) return 400;
    if (isCityCol) return 140;
    if (isProductCol) return 160;
    if (isProductNameCol) return 260;
    return 120;
  }, []);

  const getColumnWidthStyles = useCallback((col) => {
    const isCheckCol = (col === "Kết quả Check" || col === "Kết quả check");
    const isNameCol = (col === "Name*");
    const isAddCol = (col === "Add");
    const isCityCol = (col === "City");
    const isProductCol = (col === "Mặt hàng");
    const isProductNameCol = (col === "Tên mặt hàng 1" || col === "Tên mặt hàng 2");
    const isQtyCol = col === "Số lượng mặt hàng 1" || col === "Số lượng mặt hàng 2";

    if (isQtyCol) return { minWidth: '48px', maxWidth: '58px', width: '52px' };
    if (isCheckCol) return { minWidth: '140px', maxWidth: '160px', width: '150px' };
    if (isNameCol) return { minWidth: '200px', maxWidth: '250px', width: '220px' };
    if (isAddCol) return { minWidth: '380px', maxWidth: '450px', width: '400px' };
    if (isCityCol) return { minWidth: '130px', maxWidth: '200px', width: '140px' };
    if (isProductCol) return { minWidth: '150px', maxWidth: '220px', width: '160px' };
    if (isProductNameCol) return { minWidth: '220px', maxWidth: '420px', width: '260px' };
    return { minWidth: '120px', width: '120px' };
  }, []);

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
      const tableEl = tableRef.current;
      if (!tableEl || !currentColumns.length) {
        setStickyOffsets([]);
        return;
      }

      const thList = Array.from(tableEl.querySelectorAll('thead tr:first-child th[data-col-idx]')).sort(
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
  }, [currentColumns, checkboxStickyPad, getColumnWidthPx, filterValues, localFilterValues, isLongTextExpanded]);

  /** Đóng băng dòng dữ liệu đầu tiên (rIdx=0) ngay dưới header khi cuộn dọc */
  useLayoutEffect(() => {
    const root = tableRef.current;
    if (!root) return;

    const calcTop = () => {
      const fallback = 38; // chiều cao header tối thiểu để tránh pinned-row đè header lúc mới render
      // splitPane: có 2 thead, lấy max height để top khớp
      if (splitPane) {
        const left = root.querySelector('[data-vandon-pane="left"]');
        const right = root.querySelector('[data-vandon-pane="right"]');
        const lh = left?.querySelector('thead')?.getBoundingClientRect?.().height || 0;
        const rh = right?.querySelector('thead')?.getBoundingClientRect?.().height || 0;
        const h = Math.max(lh, rh);
        setFirstDataRowTop(Math.max(fallback, h));
        if (h <= 0) requestAnimationFrame(calcTop);
        return;
      }
      const h = root.querySelector('thead')?.getBoundingClientRect?.().height || 0;
      setFirstDataRowTop(Math.max(fallback, h));
      if (h <= 0) requestAnimationFrame(calcTop);
    };

    calcTop();
    const raf = requestAnimationFrame(calcTop);
    window.addEventListener('resize', calcTop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', calcTop);
    };
  }, [splitPane, currentColumns.length, fixedColumns, bolActiveTab, viewMode]);

  /**
   * Chế độ freeze tách 2 <table> trái/phải: thead/tbody tự tính chiều cao khác nhau → lệch dòng.
   * Đồng bộ minHeight của hàng tiêu đề + bộ lọc và từng cặp hàng dữ liệu giữa hai bảng.
   */
  useLayoutEffect(() => {
    if (!splitPane) return;

    const sync = () => {
      const root = tableRef.current;
      if (!root) return;
      const leftTable = root.querySelector('[data-vandon-pane="left"]');
      const rightTable = root.querySelector('[data-vandon-pane="right"]');
      if (!leftTable || !rightTable) return;

      const leftHeadRow = leftTable.querySelector('thead tr');
      const rightHeadRow = rightTable.querySelector('thead tr');
      if (leftHeadRow && rightHeadRow) {
        leftHeadRow.style.minHeight = '';
        rightHeadRow.style.minHeight = '';
        leftHeadRow.style.height = '';
        rightHeadRow.style.height = '';
        const headH = Math.max(
          leftHeadRow.getBoundingClientRect().height,
          rightHeadRow.getBoundingClientRect().height
        );
        if (headH > 0) {
          leftHeadRow.style.minHeight = `${headH}px`;
          rightHeadRow.style.minHeight = `${headH}px`;
          // Ép chiều cao header để tránh lệch “nhìn thấy” giữa hai bảng
          // (khi nội dung header có khác biệt do editor lọc).
          leftHeadRow.style.height = `${headH}px`;
          rightHeadRow.style.height = `${headH}px`;
        }
      }

      const leftRows = leftTable.querySelectorAll('tbody tr');
      const rightRows = rightTable.querySelectorAll('tbody tr');
      const n = Math.min(leftRows.length, rightRows.length);
      for (let i = 0; i < n; i++) {
        leftRows[i].style.minHeight = '';
        rightRows[i].style.minHeight = '';
      }
      for (let i = 0; i < n; i++) {
        const lh = leftRows[i].getBoundingClientRect().height;
        const rh = rightRows[i].getBoundingClientRect().height;
        const rowH = Math.max(lh, rh);
        if (rowH > 0) {
          leftRows[i].style.minHeight = `${rowH}px`;
          rightRows[i].style.minHeight = `${rowH}px`;
        }
      }
    };

    sync();
    const raf = requestAnimationFrame(() => sync());
    const onResize = () => sync();
    window.addEventListener('resize', onResize);

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => sync());
      const left = tableRef.current?.querySelector('[data-vandon-pane="left"]');
      const right = tableRef.current?.querySelector('[data-vandon-pane="right"]');
      if (left) ro.observe(left);
      if (right) ro.observe(right);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [
    splitPane,
    currentColumns,
    effectiveFixedColumns,
    currentPage,
    rowsPerPage,
    filterValues,
    localFilterValues,
    isLongTextExpanded,
    bolActiveTab,
    loading,
    stickyOffsets,
  ]);

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
      if (val) values.add(val);
    });
    return Array.from(values).sort();
  }, [allData]);

  const getMultiSelectOptions = (col) => {
    const key = COLUMN_MAPPING[col] || col;
    const emptyValues = ['Trống'];
    // Backward-compat: keep old sentinel if something set it in state/localStorage.
    const legacyEmpty = ['__EMPTY__'];
    if (DROPDOWN_OPTIONS[col]) return [...emptyValues, ...legacyEmpty, ...DROPDOWN_OPTIONS[col]];
    if (DROPDOWN_OPTIONS[key]) return [...emptyValues, ...legacyEmpty, ...DROPDOWN_OPTIONS[key]];
    return [...emptyValues, ...legacyEmpty, ...getUniqueValues(col)];
  };

  const getFilteredData = useMemo(() => {
    let data = [...allData];

    // 1. Apply changes (Pending > Original)
    data = data.map(row => {
      const orderId = row[PRIMARY_KEY_COLUMN];
      let rowCopy = { ...row };

      // Computed columns
      rowCopy["Ngày đẩy đơn"] = extractDateFromDateTime(row["Ngày Kế toán đối soát với FFM lần 2"]);
      rowCopy["Ngày có mã tracking"] = extractDateFromDateTime(row["Ngày Kế toán đối soát với FFM lần 1"]);

      const pending = pendingChanges.get(orderId);
      if (pending) {
        pending.forEach((info, key) => { rowCopy[key] = info.newValue; });
      }
      return rowCopy;
    });

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
          const code = String(r['Mã Tracking'] || '').trim();
          if (code) counts.set(code, (counts.get(code) || 0) + 1);
        });
        data = data.filter(r => {
          const code = String(r['Mã Tracking'] || '').trim();
          return (counts.get(code) || 0) > 1;
        });
        data.sort((a, b) => String(a['Mã Tracking']).localeCompare(String(b['Mã Tracking'])));
      } else {
        data = data.filter(row => {
          const code = String(row['Mã Tracking'] || '').trim();
          return omShowTracking ? code !== '' : !code;
        });
        // Sort by STT
        data.sort((a, b) => (Number(a['rowIndex'] || 0) - Number(b['rowIndex'] || 0)));
      }

    } else {
      // --- BILL OF LADING FILTERING LOGIC ---

      // Filter: Chỉ hiển thị đơn có ít nhất một tên nhân sự (không trống) - Admin không bị filter này
      if (!isAdmin) {
        const initialDataLength = data.length;
        data = data.filter(row => {
          const saleStaff = String(row.sale_staff || row["Nhân viên Sale"] || '').trim();
          const mktStaff = String(row.marketing_staff || row["Nhân viên MKT"] || '').trim();
          const deliveryStaff = String(row.delivery_staff || row["NV Vận đơn"] || row["Nhân viên Vận đơn"] || '').trim();
          return saleStaff.length > 0 || mktStaff.length > 0 || deliveryStaff.length > 0;
        });
        console.log('🔍 [VanDon Client-side] Filtered out orders with empty personnel names:', initialDataLength - data.length, 'orders removed');
      } else {
        console.log('👑 [VanDon Client-side] Admin - Không filter theo nhân sự (hiển thị tất cả)');
      }

      // Tab Logic - use early filtering to reduce dataset size (Admin không bị filter)
      if (!isAdmin) {
        if (bolActiveTab === 'japan') {
          // Tab "Đơn Nhật": hiển thị full các đơn có country="Nhật Bản" hoặc "CĐ Nhật Bản"
          data = data.filter(row => {
            const country = String(row['country'] || row['Country'] || '').trim();
            return country === 'Nhật Bản' || country === 'CĐ Nhật Bản' ||
              country.toLowerCase() === 'nhật bản' || country.toLowerCase() === 'cđ nhật bản';
          });
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
            const isTrackingEmpty = !tracking || tracking === '' || tracking === 'null';
            // Đơn vị vận chuyển phải trống hoặc null
            const isDeliveryUnitEmpty = !deliveryUnit || deliveryUnit === '' || deliveryUnit === 'null';

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

    // Market & Product - Áp dụng cho tất cả users
    try {
      if (filterValues.market && Array.isArray(filterValues.market) && filterValues.market.length > 0) {
        const set = new Set(filterValues.market);
        data = data.filter(row => {
            const market = String(row["Khu vực"] || row["khu vực"] || '').trim();
            if ((set.has('Trống') || set.has('__EMPTY__')) && !market) return true;
            return market && set.has(market);
        });
      }
      if (filterValues.product && Array.isArray(filterValues.product) && filterValues.product.length > 0) {
        const set = new Set(filterValues.product);
        data = data.filter(row => {
            const product = String(row["Mặt hàng"] || '').trim();
            if ((set.has('Trống') || set.has('__EMPTY__')) && !product) return true;
            return product && set.has(product);
        });
      }
      if (filterValues.nv_sale && Array.isArray(filterValues.nv_sale) && filterValues.nv_sale.length > 0) {
        const set = new Set(filterValues.nv_sale);
        data = data.filter((row) => {
          const v = String(row.sale_staff || row['Nhân viên Sale'] || '').trim();
          if ((set.has('Trống') || set.has('__EMPTY__')) && !v) return true;
          return v && set.has(v);
        });
      }
      if (filterValues.nv_mkt && Array.isArray(filterValues.nv_mkt) && filterValues.nv_mkt.length > 0) {
        const set = new Set(filterValues.nv_mkt);
        data = data.filter((row) => {
          const v = String(row.marketing_staff || row['Nhân viên MKT'] || '').trim();
          if ((set.has('Trống') || set.has('__EMPTY__')) && !v) return true;
          return v && set.has(v);
        });
      }
      if (filterValues.nv_van_don && Array.isArray(filterValues.nv_van_don) && filterValues.nv_van_don.length > 0) {
        const set = new Set(filterValues.nv_van_don);
        data = data.filter((row) => {
          const v = String(row.delivery_staff || row['NV Vận đơn'] || row['Nhân viên Vận đơn'] || '').trim();
          if ((set.has('Trống') || set.has('__EMPTY__')) && !v) return true;
          return v && set.has(v);
        });
      }
      if (filterValues.shipping_unit && Array.isArray(filterValues.shipping_unit) && filterValues.shipping_unit.length > 0) {
        const set = new Set(filterValues.shipping_unit);
        data = data.filter((row) => {
          const v = String(row['Đơn vị vận chuyển'] || row['Đơn_vị_vận_chuyển'] || '').trim();
          if ((set.has('Trống') || set.has('__EMPTY__')) && !v) return true;
          return v && set.has(v);
        });
      }
    } catch (err) {
      console.warn('⚠️ [Filter Error] Lỗi khi xử lý Market/Product filter:', err);
    }

    // Date Range (only if enabled) - Áp dụng cho tất cả users
    if (enableDateFilter) {
      if (dateFrom) {
        const d = new Date(dateFrom);
        d.setHours(0, 0, 0, 0);
        data = data.filter(row => {
          const val = row[activeDateType];
          if (!val) return false;
          return new Date(val).getTime() >= d.getTime();
        });
      }
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        data = data.filter(row => {
          const val = row[activeDateType];
          if (!val) return false;
          return new Date(val).getTime() <= d.getTime();
        });
      }
    }

    // Column Filters (Text & Dropdown) - Áp dụng cho tất cả users (bao gồm Admin nếu họ muốn filter)
    Object.entries(filterValues).forEach(([key, val]) => {
      // Skip các filter đặc biệt đã được xử lý riêng
      if (['market', 'product', 'nv_sale', 'nv_mkt', 'nv_van_don', 'shipping_unit', 'tracking_include', 'tracking_exclude', 'tracking_status'].includes(key)) return;

      // Skip nếu giá trị rỗng
      if (val === null || val === undefined) return;
      if (Array.isArray(val) && val.length === 0) return;
      if (typeof val === 'string' && val.trim() === '') return;

      // Tìm data key chính xác cho column này
      const dataKey = COLUMN_MAPPING[key] || key;

      try {
        data = data.filter(row => {
          try {
            // Thử nhiều cách lấy giá trị từ row
            // Đặc biệt cho "Mã đơn hàng", cần check cả order_code
            let cellValue = '';
            if (key === 'Mã đơn hàng') {
              cellValue = row['Mã đơn hàng'] ?? row['order_code'] ?? row['orderCode'] ?? row[PRIMARY_KEY_COLUMN] ?? '';
            } else {
              cellValue = row[dataKey] ?? row[key] ?? row[key.replace(/ /g, '_')] ?? row[dataKey.replace(/ /g, '_')] ?? '';
            }
            cellValue = String(cellValue).trim();

            // Use exact match for dropdown columns in Bill of Lading, or specific cols in Order Mgmt
            if (DROPDOWN_OPTIONS[dataKey] || DROPDOWN_OPTIONS[key] || ["Trạng thái giao hàng", "Kết quả check", "GHI CHÚ"].includes(dataKey)) {
              // Đảm bảo val là array
              if (!Array.isArray(val)) return true;
              const selected = val;
              if (selected.length === 0) return true;
              if (cellValue === '' && (selected.includes('Trống') || selected.includes('__EMPTY__'))) return true;
              return selected.includes(cellValue);
            }

            // Date columns logic
            if (["Ngày lên đơn", "Ngày đóng hàng", "Ngày đẩy đơn", "Ngày có mã tracking", "Ngày Kế toán đối soát với FFM lần 2"].includes(key)) {
              if (!cellValue) return false;
              if (typeof val !== 'string') return true; // Skip nếu không phải string
              const dVal = new Date(cellValue);
              if (isNaN(dVal.getTime())) return false;
              dVal.setHours(0, 0, 0, 0);
              const fVal = new Date(val);
              if (isNaN(fVal.getTime())) return true; // Skip nếu date không hợp lệ
              fVal.setHours(0, 0, 0, 0);
              return dVal >= fVal;
            }

            // Text search - case insensitive, partial match
            if (typeof val !== 'string') return true; // Skip nếu không phải string
            const searchVal = val.toLowerCase().trim();
            if (!searchVal) return true; // Nếu filter rỗng, hiển thị tất cả
            return cellValue.toLowerCase().includes(searchVal);
          } catch (err) {
            console.warn(`⚠️ [Filter Error] Lỗi khi filter column "${key}":`, err);
            return true; // Nếu có lỗi, giữ lại row
          }
        });
      } catch (err) {
        console.warn(`⚠️ [Filter Error] Lỗi khi xử lý filter cho key "${key}":`, err);
        // Nếu có lỗi, không filter gì cả
      }
    });

    // Tracking Filters - Áp dụng cho tất cả users
    try {
      if (filterValues.tracking_status || filterValues.tracking_include || filterValues.tracking_exclude) {
        const inc = filterValues.tracking_include ? String(filterValues.tracking_include).toLowerCase() : '';
        const exc = filterValues.tracking_exclude ? String(filterValues.tracking_exclude).toLowerCase() : '';
        const status = filterValues.tracking_status || 'Tình trạng mã';

        data = data.filter(row => {
          try {
            const code = String(row['Mã Tracking'] || row['Mã tracking'] || '').trim();
            const lowerCode = code.toLowerCase();

            // Status Filter Logic
            if (status === 'Tất cả có mã' && code === '') return false;
            if (status === 'Trống' && code !== '') return false;
            if (status === 'Toàn số' && (code === '' || !/^\d+$/.test(code))) return false;

            // Only apply include/exclude if in 'Tình trạng mã' state
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

    // Debug: Kiểm tra đơn hàng trong getFilteredData (tạm thời comment để fix lỗi)
    /* try {
      const debugOrderCode = 'Kemb5a90cf6';
      const debugInFiltered = data.find(row => {
        const orderId = row[PRIMARY_KEY_COLUMN];
        return orderId === debugOrderCode;
      });
      if (debugInFiltered) {
        console.log('✅ [DEBUG Step 3] Đơn hàng', debugOrderCode, 'có trong getFilteredData');
      } else {
        console.log('❌ [DEBUG Step 3] Đơn hàng', debugOrderCode, 'KHÔNG có trong getFilteredData');
        console.log('  - Total data length:', data.length);
        console.log('  - isAdmin:', isAdmin);
        console.log('  - bolActiveTab:', bolActiveTab);
        console.log('  - filterValues market:', filterValues?.market);
        console.log('  - filterValues product:', filterValues?.product);
      }
    } catch (debugErr) {
      console.warn('⚠️ [DEBUG] Lỗi trong debug code:', debugErr);
    } */

    return data;
  }, [allData, pendingChanges, viewMode, omActiveTeam, omDateType, omShowTracking, omShowDuplicateTracking, bolActiveTab, bolDateType, filterValues, dateFrom, dateTo, enableDateFilter, mgtNoiBoOrder, isAdmin]);

  // --- Render Prep (moved up for dependencies) ---
  // Use fewer rows for Bill of Lading due to long text columns
  const effectiveRowsPerPage = viewMode === 'BILL_OF_LADING' ? 30 : rowsPerPage;

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
          let latestData;
          setAllData(prevData => {
            latestData = [...prevData];
            rowsToUpdate.forEach(updatedRow => {
              const idx = latestData.findIndex(r => r[PRIMARY_KEY_COLUMN] === updatedRow[PRIMARY_KEY_COLUMN]);
              if (idx > -1) latestData[idx] = { ...latestData[idx], ...updatedRow };
            });
            return latestData;
          });

          saveToShippingReports(rowsToUpdate, latestData).catch(console.error);

          setPendingChanges(prev => {
            const next = deepCloneMapOfMaps(prev);
            batchToProcess.forEach(({ orderId, colKey }) => {
              if (next.has(orderId)) {
                next.get(orderId).delete(colKey);
                if (next.get(orderId).size === 0) next.delete(orderId);
              }
            });
            savePendingToLocalStorage(next);
            return next;
          });
        }
      }
    } finally {
      isProcessingQueue.current = false;
    }
  }, [addToast, removeToast, saveToShippingReports, deepCloneMapOfMaps]);

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
      savePendingToLocalStorage(next);
      return next;
    });

    // 3. Trigger worker
    setTimeout(() => processDbQueue(), 10);
  }, [deepCloneMapOfMaps, processDbQueue]);

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
      savePendingToLocalStorage(next);
      return next;
    });

    historyIndexRef.current = currentIndex - 1;
    addToast('Đã hoàn tác', 'success', 2000);
    setTimeout(() => processDbQueue(), 10);
  }, [addToast, processDbQueue, deepCloneMapOfMaps]);

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
      savePendingToLocalStorage(next);
      return next;
    });

    historyIndexRef.current = nextIndex;
    addToast('Đã làm lại', 'success', 2000);
    setTimeout(() => processDbQueue(), 10);
  }, [addToast, processDbQueue, deepCloneMapOfMaps]);

  const handleCellChange = useCallback((orderId, colKey, newValue) => {
    if (isReadonlyEditTab) return;
    // Tab "Dữ liệu đơn hàng": một số cột chỉ xem
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
    if (dbQueueRef.current.length === 0) {
      addToast('Không có thay đổi cần cập nhật', 'info');
      return;
    }
    processDbQueue();
  };





  // --- Interaction (Mouse) ---
  const handleMouseDown = (rowIdx, colIdx, e) => {
    if (e.button !== 0) return; // Only left click

    // Nếu click vào input/select/textarea, vẫn cho phép selection nhưng không bắt đầu drag ngay
    const target = e.target;
    const isInputElement = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA';

    // Nếu click vào input/select, chỉ select cell đó, không bắt đầu drag
    if (isInputElement) {
      setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
      isSelecting.current = false;
      return;
    }

    // Bắt đầu selection drag
    isSelecting.current = true;

    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd click: thêm vào selection (multi-select)
      // Tạm thời chỉ select cell đó, có thể mở rộng sau
      setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
    } else if (e.shiftKey && selection.startRow !== null && selection.startCol !== null) {
      // Shift click: mở rộng selection từ điểm bắt đầu
      setSelection(prev => ({ ...prev, endRow: rowIdx, endCol: colIdx }));
    } else {
      // Click thường: bắt đầu selection mới
      setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
    }
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
    const handleMouseUp = () => {
      isSelecting.current = false;
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

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
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
            if (!EDITABLE_COLS.includes(colName)) continue;

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
            if (!EDITABLE_COLS.includes(colName)) return; // Skip read-only

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
        addToast(`Đã dán ${historyChanges.length} ô. Đang đưa vào hàng đợi xử lý...`, 'info', 1500);
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
    return getFilteredData.reduce((sum, row) => {
      let val = row["Tổng tiền VNĐ"] || row["Tổng_tiền_VNĐ"] || row["Giá bán"] || 0;
      const num = parseFloat(String(val).replace(/[^\d.-]/g, "")) || 0;
      return sum + num;
    }, 0);
  }, [getFilteredData]);

  const teams = Array.from(new Set(allData.map(r => r[TEAM_COLUMN_NAME]).filter(Boolean))).sort();

  // Simplified cell class
  const getCellClass = (row, col, val, rIdx, cIdx) => {
    const isCheckCol = (col === "Kết quả Check" || col === "Kết quả check");
    const isStatusCol = (col === "Trạng thái giao hàng");
    const isQtyCol = col === "Số lượng mặt hàng 1" || col === "Số lượng mặt hàng 2";

    // Default cell sizing
    // NOTE: For select-based columns, avoid vertical padding so the select can fill the cell height cleanly.
    let classes = `${(isCheckCol || isStatusCol) ? "py-0" : "py-2"} border border-gray-200 text-sm h-[38px] whitespace-nowrap `;

    // Padding adjustment for specific columns
    if (isCheckCol) {
      classes += "pl-2 pr-3 ";
    } else if (isQtyCol) {
      classes += "px-1 ";
    } else {
      classes += "px-3 ";
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
    if (viewMode === 'BILL_OF_LADING' && LONG_TEXT_COLS.includes(col)) {
      classes = classes.replace('whitespace-nowrap', isLongTextExpanded ? "whitespace-pre-wrap max-w-xs break-words bg-yellow-50" : "whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] cursor-pointer");
    }

    // Editable
    const isEditable = EDITABLE_COLS.includes(col);
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

  const renderVanDonFilterTh = (col, idx, positionStyle, showFreezeShadow) => {
    const key = COLUMN_MAPPING[col] || col;
    const filterKey = col;
    const isCheckCol = col === 'Kết quả Check' || col === 'Kết quả check';
    const isNameCol = col === 'Name*';
    const isAddCol = col === 'Add';
    const isCityCol = col === 'City';
    const isProductCol = col === 'Mặt hàng';
    const isQtyCol = col === 'Số lượng mặt hàng 1' || col === 'Số lượng mặt hàng 2';

    return (
      <th
        data-col-idx={idx}
        key={`filter-${col}-${idx}`}
        className={`py-2 border-b-2 border-r border-gray-300 align-top bg-[#f8f9fa] ${isQtyCol ? 'whitespace-normal text-[11px] leading-tight px-1' : 'whitespace-nowrap'} ${isCheckCol ? 'pl-2 pr-3' : isQtyCol ? '' : 'px-4'}`}
        style={{
          ...positionStyle,
          ...getColumnWidthStyles(col),
          boxShadow: showFreezeShadow ? '2px 0 0 #d1d5db' : undefined
        }}
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
              value={localFilterValues.tracking_status || 'Tình trạng mã'}
              onChange={(e) => setLocalFilterValues((p) => ({ ...p, tracking_status: e.target.value }))}
            >
              <option value="Tình trạng mã">Tình trạng mã</option>
              <option value="Tất cả có mã">Tất cả có mã</option>
              <option value="Trống">Trống</option>
              <option value="Toàn số">Toàn số</option>
            </select>
            {(localFilterValues.tracking_status === 'Tình trạng mã' || !localFilterValues.tracking_status) && (
              <>
                <input
                  className="w-full text-sm px-2 py-1.5 border rounded"
                  style={{ zIndex: 1002 }}
                  placeholder="Bao gồm..."
                  value={localFilterValues.tracking_include}
                  onChange={(e) => setLocalFilterValues((p) => ({ ...p, tracking_include: e.target.value }))}
                />
                <input
                  className="w-full text-sm px-2 py-1.5 border rounded"
                  style={{ zIndex: 1002 }}
                  placeholder="Loại trừ..."
                  value={localFilterValues.tracking_exclude}
                  onChange={(e) => setLocalFilterValues((p) => ({ ...p, tracking_exclude: e.target.value }))}
                />
              </>
            )}
          </div>
        ) : DROPDOWN_OPTIONS[col] || DROPDOWN_OPTIONS[key] || ['Trạng thái giao hàng', 'Kết quả check', 'GHI CHÚ'].includes(col) ? (
          <div className="relative w-full" style={{ zIndex: 1002, marginTop: '-0.125rem' }}>
            <MultiSelect
              label="Lọc..."
              options={getMultiSelectOptions(col)}
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
            value={localFilterValues[filterKey] || ''}
            onChange={(e) => setLocalFilterValues((p) => ({ ...p, [filterKey]: e.target.value }))}
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

    const mergedCellStyle = (() => {
      const s = { ...(cellStyle || {}) };
      if (rIdx === 0) {
        // Sticky "dòng đầu tiên" ngay dưới header. Không dùng overlay để tránh lệch/nhân đôi dòng.
        s.position = s.position || 'sticky';
        s.top = firstDataRowTop;
        s.zIndex = Math.max(Number(s.zIndex) || 0, 5000);
        // đảm bảo nền không bị trong suốt khi đè lên các dòng phía dưới
        if (!('background' in s) && !('backgroundColor' in s)) s.background = '#ffffff';
      }
      return s;
    })();

    return (
      <td
        key={`${orderId}-${col}`}
        className={getCellClass(row, col, String(displayVal), rIdx, cIdx)}
        style={mergedCellStyle}
        onMouseDown={(e) => handleMouseDown(rIdx, cIdx, e)}
        onMouseEnter={() => handleMouseEnter(rIdx, cIdx)}
      >
        {col === 'STT' ? (
          row.rowIndex || (currentPage - 1) * rowsPerPage + rIdx + 1
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
            {getMultiSelectOptions(key)
              .filter((o) => o !== 'Trống' && o !== '__EMPTY__')
              .map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
          </select>
        ) : EDITABLE_COLS.includes(col) ? (
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
    <div className="min-h-screen bg-gray-50 flex flex-col h-screen overflow-hidden">
      {/* Header Bar - Now including Tabs and Main Actions */}
      <div className="bg-white border-b border-gray-200 shadow-sm z-50 flex-shrink-0">
        <div className="max-w-full mx-auto px-4 py-2">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo & Title (Smaller) */}
            <div className="flex items-center gap-3">

              <img
                src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Fbe61f44f.%E1%BA%A2nh.021347.png"
                alt="Logo"
                className="h-8 object-contain"
              />
              <div>
                <h1 className="text-lg font-bold text-gray-800 leading-tight">QUẢN LÝ VẬN ĐƠN</h1>
              </div>
            </div>

            {/* Middle: Tabs (Moved here) */}
            <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
              {[
                { id: 'all', label: 'Dữ liệu đơn hàng', icon: '📋' },
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
                  className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${bolActiveTab === tab.id
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

            {/* Right: Status & Actions */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md border border-gray-100">
                <span className={`h-1.5 w-1.5 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-[10px] uppercase font-bold text-gray-500">
                  {allData.length > 0 ? `${allData.length} ĐƠN` : 'NO DATA'}
                </span>
              </div>
              <button
                onClick={loadData}
                disabled={loading}
                className="px-3 py-1.5 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-md text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {loading ? <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div> : <span>🔄</span>}
                {loading ? '...' : 'TẢI LẠI'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area - Scrollable but compact */}
      <div className="flex-1 flex flex-col p-2 space-y-2 overflow-hidden bg-[#f4f7fa]">

        {/* Toolbar Actions Row */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-3 py-2 flex flex-wrap items-center gap-3">
          {/* Date Filter */}
          <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
            <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">📅 Lọc thời gian:</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom || ''}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Từ ngày"
              />
              <span className="text-xs text-gray-500 font-bold">→</span>
              <input
                type="date"
                value={dateTo || ''}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setCurrentPage(1);
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
          <div className="flex items-center gap-2 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-200">
            <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">🌍 Thị trường:</label>
            <div className="relative" style={{ minWidth: '150px', zIndex: 1002 }}>
              <MultiSelect
                label="Chọn thị trường..."
                options={getMultiSelectOptions('Khu vực')}
                selected={filterValues.market || []}
                onChange={(vals) => {
                  setFilterValues(prev => ({ ...prev, market: vals }));
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
            <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">📦 Sản phẩm:</label>
            <div className="relative" style={{ minWidth: '150px', zIndex: 1002 }}>
              <MultiSelect
                label="Chọn sản phẩm..."
                options={getMultiSelectOptions('Mặt hàng')}
                selected={filterValues.product || []}
                onChange={(vals) => {
                  setFilterValues(prev => ({ ...prev, product: vals }));
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
            <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">👤 NV Sale:</label>
            <div className="relative" style={{ minWidth: '160px', zIndex: 1001 }}>
              <MultiSelect
                label="Chọn NV Sale..."
                options={getMultiSelectOptions('Nhân viên Sale')}
                selected={filterValues.nv_sale || []}
                onChange={(vals) => {
                  setFilterValues((prev) => ({ ...prev, nv_sale: vals }));
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-200">
            <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">📣 NV MKT:</label>
            <div className="relative" style={{ minWidth: '160px', zIndex: 1000 }}>
              <MultiSelect
                label="Chọn NV MKT..."
                options={getMultiSelectOptions('Nhân viên MKT')}
                selected={filterValues.nv_mkt || []}
                onChange={(vals) => {
                  setFilterValues((prev) => ({ ...prev, nv_mkt: vals }));
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
            <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">🚚 NV Vận đơn:</label>
            <div className="relative" style={{ minWidth: '160px', zIndex: 999 }}>
              <MultiSelect
                label="Chọn NV Vận đơn..."
                options={getMultiSelectOptions('NV Vận đơn')}
                selected={filterValues.nv_van_don || []}
                onChange={(vals) => {
                  setFilterValues((prev) => ({ ...prev, nv_van_don: vals }));
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-cyan-50 px-3 py-1.5 rounded-lg border border-cyan-200">
            <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">🚛 ĐV Vận chuyển:</label>
            <div className="relative" style={{ minWidth: '170px', zIndex: 998 }}>
              <MultiSelect
                label="Chọn đơn vị..."
                options={getMultiSelectOptions('Đơn vị vận chuyển')}
                selected={filterValues.shipping_unit || []}
                onChange={(vals) => {
                  setFilterValues((prev) => ({ ...prev, shipping_unit: vals }));
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          {/* Toolbar Actions Group */}
          <div className="flex items-center gap-2">
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
              title={isReadonlyEditTab ? 'Tab chỉ xem: không cho cập nhật/chỉnh sửa' : 'Cập nhật thay đổi'}
            >
              ✅ Cập nhật
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
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[150px]">
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

          {/* Stats on the far right */}
          <div className="ml-auto flex items-center gap-2">
            <div className="text-right flex flex-col items-end">
              <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Tổng tiền</span>
              <span className="text-sm font-black text-emerald-600 leading-none">{totalMoney.toLocaleString('vi-VN')} ₫</span>
            </div>
          </div>
        </div>


        {/* Table Area - Optimized for Height */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden flex-1 flex flex-col min-h-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center min-h-[200px] text-gray-500">Đang tải dữ liệu...</div>
          ) : paginatedData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center min-h-[200px] text-gray-500 italic">Không có dữ liệu phù hợp</div>
          ) : splitPane ? (
            <div
              ref={tableRef}
              className="flex-1 min-h-0 overflow-y-auto flex flex-row items-start select-none relative"
              style={{ isolation: 'isolate' }}
              onDoubleClickCapture={blockTableDoubleClickCopy}
              onDragStartCapture={blockTableDragStart}
            >
              <div className="shrink-0 border-r-2 border-gray-300 bg-white z-20 self-start overflow-y-hidden">
                <table className="border-separate border-spacing-0 w-max text-[13px] leading-tight" data-vandon-pane="left">
                  <thead className="sticky top-0 shadow-sm bg-white" style={{ position: 'sticky', top: 0, zIndex: 7000, backgroundColor: 'white' }}>
                    <tr className="bg-gray-100 align-top" style={{ position: 'relative', zIndex: 7000 }}>
                      {bolActiveTab === 'hanoi' && (
                        <th className="py-2 border-b-2 border-r border-gray-300 align-top bg-[#f8f9fa] relative whitespace-nowrap px-2" style={{ position: 'sticky', left: 0, zIndex: 7100, background: '#f8f9fa' }}>
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={paginatedData.length > 0 && paginatedData.every((r) => selectedRows.has(r[PRIMARY_KEY_COLUMN]))}
                              onChange={(e) => {
                                if (e.target.checked) selectAllRows();
                                else deselectAllRows();
                              }}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                            />
                          </div>
                        </th>
                      )}
                      {frozenCols.map((col, i) =>
                        renderVanDonFilterTh(
                          col,
                          i,
                          { position: 'relative', zIndex: 7200, background: '#f8f9fa' },
                          i === frozenCols.length - 1
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody style={{ position: 'relative', zIndex: 0 }}>
                    {paginatedData.map((row, rIdx) => {
                      const orderId = row[PRIMARY_KEY_COLUMN];
                      return (
                        <tr key={orderId} className={`hover:bg-[#E8EAF6] transition-colors ${selectedRows.has(orderId) ? 'bg-blue-50' : ''}`}>
                          {bolActiveTab === 'hanoi' && (
                            <td
                              className="py-2 border border-gray-200 text-sm h-[38px] whitespace-nowrap px-2 bg-gray-50 sticky left-0 z-10"
                              style={{
                                position: 'sticky',
                                top: rIdx === 0 ? firstDataRowTop : undefined,
                                left: 0,
                                zIndex: rIdx === 0 ? 5200 : 3300,
                                backgroundColor: selectedRows.has(orderId) ? '#dbeafe' : '#f9fafb'
                              }}
                            >
                              <div className="flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={selectedRows.has(orderId)}
                                  onChange={() => toggleRowSelection(orderId)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                />
                              </div>
                            </td>
                          )}
                          {frozenCols.map((col, i) => {
                            const colWidthStyles = getColumnWidthStyles(col);
                            const lastF = i === frozenCols.length - 1;
                            const cellStyle = {
                              ...colWidthStyles,
                              position: 'relative',
                              zIndex: 10,
                              ...(lastF ? { boxShadow: '2px 0 0 #e5e7eb' } : {})
                            };
                            return renderVanDonDataCell(row, rIdx, col, i, cellStyle);
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden min-h-0 self-start">
                <table className="border-separate border-spacing-0 w-max min-w-max text-[13px] leading-tight" data-vandon-pane="right">
                  <thead className="sticky top-0 shadow-sm bg-white" style={{ position: 'sticky', top: 0, zIndex: 7000, backgroundColor: 'white' }}>
                    <tr className="bg-gray-100 align-top" style={{ position: 'relative', zIndex: 7000 }}>
                      {scrollCols.map((col, i) =>
                        renderVanDonFilterTh(
                          col,
                          effectiveFixedColumns + i,
                          { position: 'relative', zIndex: 7200 },
                          false
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody style={{ position: 'relative', zIndex: 0 }}>
                    {paginatedData.map((row, rIdx) => {
                      const orderId = row[PRIMARY_KEY_COLUMN];
                      return (
                        <tr key={`${orderId}-right`} className={`hover:bg-[#E8EAF6] transition-colors ${selectedRows.has(orderId) ? 'bg-blue-50' : ''}`}>
                          {scrollCols.map((col, i) => {
                            const cIdx = effectiveFixedColumns + i;
                            const cellStyle = { ...getColumnWidthStyles(col), position: 'relative', zIndex: 10 };
                            return renderVanDonDataCell(row, rIdx, col, cIdx, cellStyle);
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div
              ref={tableRef}
              className="overflow-auto relative select-none flex-1 min-h-0"
              style={{ overflowX: 'auto', overflowY: 'auto', isolation: 'isolate' }}
              onDoubleClickCapture={blockTableDoubleClickCopy}
              onDragStartCapture={blockTableDragStart}
            >
              <table className="w-full border-separate border-spacing-0 min-w-[2500px] text-[13px] leading-tight" style={{ position: 'relative' }}>
                <thead className="sticky top-0 shadow-sm bg-white" style={{ position: 'sticky', top: 0, zIndex: 7000, backgroundColor: 'white' }}>
                  <tr className="bg-gray-100 align-top" style={{ position: 'relative', zIndex: 7000 }}>
                    {bolActiveTab === 'hanoi' && (
                      <th className="py-2 border-b-2 border-r border-gray-300 align-top bg-[#f8f9fa] relative whitespace-nowrap px-2" style={{ position: 'sticky', left: 0, zIndex: 7100, background: '#f8f9fa' }}>
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={paginatedData.length > 0 && paginatedData.every((r) => selectedRows.has(r[PRIMARY_KEY_COLUMN]))}
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
                      const stickyStyle =
                        idx < effectiveFixedColumns
                          ? { position: 'sticky', left: stickyLeft, zIndex: 7200, background: '#f8f9fa' }
                          : { position: 'relative', zIndex: 7200 };
                      return renderVanDonFilterTh(col, idx, stickyStyle, idx === effectiveFixedColumns - 1);
                    })}
                  </tr>
                </thead>
                <tbody style={{ position: 'relative', zIndex: 0 }}>
                  {paginatedData.map((row, rIdx) => {
                    const orderId = row[PRIMARY_KEY_COLUMN];
                    return (
                      <tr key={orderId} className={`hover:bg-[#E8EAF6] transition-colors ${selectedRows.has(orderId) ? 'bg-blue-50' : ''}`}>
                        {bolActiveTab === 'hanoi' && (
                          <td
                            className="py-2 border border-gray-200 text-sm h-[38px] whitespace-nowrap px-2 bg-gray-50 sticky left-0 z-10"
                            style={{
                              position: 'sticky',
                              top: rIdx === 0 ? firstDataRowTop : undefined,
                              left: 0,
                              zIndex: rIdx === 0 ? 5200 : 3300,
                              backgroundColor: selectedRows.has(orderId) ? '#dbeafe' : '#f9fafb'
                            }}
                          >
                            <div className="flex items-center justify-center">
                              <input
                                type="checkbox"
                                checked={selectedRows.has(orderId)}
                                onChange={() => toggleRowSelection(orderId)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                              />
                            </div>
                          </td>
                        )}
                        {currentColumns.map((col, cIdx) => {
                          const cellStickyLeft = getStickyLeftPx(cIdx);
                          const colWidthStyles = getColumnWidthStyles(col);
                          const cellStyle =
                            cIdx < effectiveFixedColumns
                              ? {
                                  position: 'sticky',
                                  left: cellStickyLeft,
                                  zIndex: 3100,
                                  ...colWidthStyles,
                                  boxShadow: cIdx === effectiveFixedColumns - 1 ? '2px 0 0 #e5e7eb' : undefined
                                }
                              : { position: 'relative', zIndex: 10, ...colWidthStyles };
                          return renderVanDonDataCell(row, rIdx, col, cIdx, cellStyle);
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {/* Pagination Footer - Also compact */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-2 flex-shrink-0">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Trang</span>
              <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="w-7 h-7 flex items-center justify-center bg-white hover:bg-gray-50 text-gray-700 rounded shadow-sm disabled:opacity-30 disabled:shadow-none transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-gray-700 px-3 bg-white mx-1 py-1 rounded border border-gray-200 min-w-[60px] text-center shadow-inner">
                  {currentPage} <span className="font-normal text-gray-400">/</span> {totalPages || 1}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="w-7 h-7 flex items-center justify-center bg-white hover:bg-gray-50 text-gray-700 rounded shadow-sm disabled:opacity-30 disabled:shadow-none transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-tighter">Hiển thị:</label>
                <select
                  className="border-none bg-transparent text-xs font-black text-[#F37021] focus:ring-0 p-0 cursor-pointer"
                  value={rowsPerPage}
                  onChange={e => {
                    const value = Number(e.target.value);
                    if (value > 0) {
                      setRowsPerPage(value);
                      setCurrentPage(1);
                    }
                  }}
                >
                  <option value="25">25 dòng</option>
                  <option value="50">50 dòng</option>
                  <option value="100">100 dòng</option>
                  <option value="200">200 dòng</option>
                  <option value="500">500 dòng</option>
                  <option value="1000">1000 dòng</option>
                </select>
                <span className="text-xs text-gray-400">|</span>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={rowsPerPage}
                  onChange={e => {
                    const value = Number(e.target.value);
                    if (value > 0 && value <= 10000) {
                      setRowsPerPage(value);
                      setCurrentPage(1);
                    }
                  }}
                  onBlur={e => {
                    const value = Number(e.target.value);
                    if (value < 1) {
                      setRowsPerPage(50);
                    } else if (value > 10000) {
                      setRowsPerPage(10000);
                    }
                  }}
                  className="w-16 text-xs font-bold text-[#F37021] border border-gray-300 rounded px-1 py-0.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Tùy chỉnh"
                />
                <span className="text-xs text-gray-400">dòng/trang</span>
              </div>
            </div>
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
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
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
          onDiscard={() => {
            if (confirm("Hủy bỏ tất cả thay đổi?")) {
              setPendingChanges(new Map());
              localStorage.removeItem('speegoPendingChanges');
              setSyncPopoverOpen(false);
              refreshData();
            }
          }}
        />
      </Suspense>

      {/* Quick Add Modal */}


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
  );
}

export default VanDon;
