import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import {
  ORDER_MGMT_COLUMNS, BILL_LADING_COLUMNS, COLUMN_MAPPING,
  EDITABLE_COLS, TEAM_COLUMN_NAME, DROPDOWN_OPTIONS,
  LONG_TEXT_COLS, PRIMARY_KEY_COLUMN
} from '../types';
import '../styles/selection.css';
import * as API from '../services/api';
import MultiSelect from '../components/MultiSelect';
import { rafThrottle } from '../utils/throttle';
import { ChevronLeft, Settings } from 'lucide-react';
import ColumnSettingsModal from '../components/ColumnSettingsModal';

// Lazy load heavy components
const SyncPopover = lazy(() => import('../components/SyncPopover'));
const QuickAddModal = lazy(() => import('../components/QuickAddModal'));

const UPDATE_DELAY = 500;
const BULK_THRESHOLD = 1;

function VanDon() {
  // --- Data State ---
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [useBackendPagination, setUseBackendPagination] = useState(true); // Enable backend pagination
  // Always use BILL_OF_LADING view - ORDER_MANAGEMENT is hidden
  const [viewMode] = useState('BILL_OF_LADING');

  // --- Change Tracking ---
  const [legacyChanges, setLegacyChanges] = useState(new Map());
  const [pendingChanges, setPendingChanges] = useState(new Map());
  const [syncPopoverOpen, setSyncPopoverOpen] = useState(false);
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);

  // --- Common Filter State ---
  const [filterValues, setFilterValues] = useState({
    market: [],
    product: [],
    tracking_include: '',
    tracking_exclude: ''
  });
  const [localFilterValues, setLocalFilterValues] = useState(filterValues);

  // Debounce filter updates
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilterValues(localFilterValues);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [localFilterValues]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [enableDateFilter, setEnableDateFilter] = useState(false);
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
    // Initialize with all columns visible
    const initial = {};
    const cols = viewMode === 'ORDER_MANAGEMENT' ? ORDER_MGMT_COLUMNS : BILL_LADING_COLUMNS;
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
  const [bolActiveTab, setBolActiveTab] = useState('all'); // all, japan, hcm, hanoi
  const [bolDateType, setBolDateType] = useState('Ngày lên đơn');
  const [isLongTextExpanded, setIsLongTextExpanded] = useState(false);

  // --- Pagination ---
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // --- Selection & Clipboard ---
  const [selection, setSelection] = useState({
    startRow: null, startCol: null, endRow: null, endCol: null
  });
  const [copiedData, setCopiedData] = useState(null);
  const [copiedSelection, setCopiedSelection] = useState(null);
  const isSelecting = useRef(false);
  const tableRef = useRef(null);

  // --- MGT Noi Bo specific ---
  const [mgtNoiBoOrder, setMgtNoiBoOrder] = useState([]);

  // --- Update Queue & Debounce ---
  const updateQueue = useRef(new Map()); // orderId -> { changes: Map, hasDelete: boolean, timeout?: ReturnType<typeof setTimeout> }

  // --- Toasts ---
  const [toasts, setToasts] = useState([]);
  const toastIdCounter = useRef(0);

  // --- Initialize ---
  useEffect(() => {
    // Only load data on mount, subsequent loads handled by filter/pagination useEffect
    loadData();
    const storedChanges = localStorage.getItem('speegoPendingChanges');
    if (storedChanges) {
      try {
        const parsed = JSON.parse(storedChanges);
        const map = new Map();
        for (const id in parsed) {
          const innerMap = new Map();
          for (const key in parsed[id]) {
            innerMap.set(key, parsed[id][key]);
          }
          map.set(id, innerMap);
        }
        setLegacyChanges(map);
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
      const date = new Date(dateString.includes('Z') ? dateString : dateString + 'Z');
      if (isNaN(date.getTime())) return dateString;
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
    setLoading(true);
    try {
      console.log('Starting data load...');
      
      if (useBackendPagination) {
        // Use backend with pagination
        const activeTeam = bolActiveTab === 'hcm' ? 'HCM' : (bolActiveTab === 'hanoi' ? 'Hà Nội' : (omActiveTeam !== 'all' ? omActiveTeam : undefined));
        const activeStatus = enableDateFilter ? undefined : (filterValues.status || undefined);
        
        const result = await API.fetchVanDon({
          page: currentPage,
          limit: rowsPerPage,
          team: activeTeam,
          status: activeStatus,
          market: filterValues.market,
          product: filterValues.product,
          dateFrom: enableDateFilter ? dateFrom : undefined,
          dateTo: enableDateFilter ? dateTo : undefined
        });
        
        setAllData(result.data);
        setTotalRecords(result.total);
        
        if (result.data.length === 0 && result.total === 0) {
          addToast('⚠️ Không tìm thấy dữ liệu phù hợp', 'warning', 3000);
        } else {
          addToast(`✅ Đã tải ${result.data.length}/${result.total} đơn hàng (trang ${result.page}/${result.totalPages})`, 'success', 2000);
        }
      } else {
        // Fallback: Load all data (old way)
        const data = await API.fetchOrders();
        setAllData(data);
        setTotalRecords(data.length);

        if (data.length === 2 && data[0]["Mã đơn hàng"] === "DEMO001") {
          addToast('⚠️ Đang sử dụng dữ liệu demo do API lỗi. Kiểm tra kết nối mạng.', 'error', 8000);
        } else {
          addToast(`✅ Đã tải ${data.length} đơn hàng`, 'success', 2000);
        }
      }

      // Load MGT Noi Bo orders
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
    }
  };

  const refreshData = async () => {
    setPendingChanges(new Map());
    // Reset tất cả filter values về default
    const defaultFilters = {
      market: [],
      product: [],
      tracking_include: '',
      tracking_exclude: ''
    };
    setFilterValues(defaultFilters);
    setLocalFilterValues(defaultFilters);
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
    await loadData();
  };

  // Reload data when filters or pagination change (if using backend)
  // Skip initial mount to avoid double loading
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    if (useBackendPagination) {
      const timeoutId = setTimeout(() => {
        loadData();
      }, 300); // Debounce filter changes
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, bolActiveTab, omActiveTeam, filterValues.market, filterValues.product, enableDateFilter, dateFrom, dateTo, useBackendPagination]);

  const savePendingToLocalStorage = (newPending, newLegacy) => {
    const changesToSave = {};
    const merge = new Map([...newLegacy, ...newPending]);

    merge.forEach((val, id) => {
      changesToSave[id] = Object.fromEntries(val);
    });
    localStorage.setItem('speegoPendingChanges', JSON.stringify(changesToSave));
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

  // --- Filtering Logic ---
  const allColumns = viewMode === 'ORDER_MANAGEMENT' ? ORDER_MGMT_COLUMNS : BILL_LADING_COLUMNS;
  const currentColumns = useMemo(() => {
    return allColumns.filter(col => visibleColumns[col] === true);
  }, [allColumns, visibleColumns]);

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
    if (DROPDOWN_OPTIONS[col]) return ['__EMPTY__', ...DROPDOWN_OPTIONS[col]];
    if (DROPDOWN_OPTIONS[key]) return ['__EMPTY__', ...DROPDOWN_OPTIONS[key]];
    return ['__EMPTY__', ...getUniqueValues(col)];
  };

  const getFilteredData = useMemo(() => {
    let data = [...allData];

    // 1. Apply changes (Pending > Legacy > Original)
    data = data.map(row => {
      const orderId = row[PRIMARY_KEY_COLUMN];
      let rowCopy = { ...row };

      // Computed columns
      rowCopy["Ngày đẩy đơn"] = extractDateFromDateTime(row["Ngày Kế toán đối soát với FFM lần 2"]);
      rowCopy["Ngày có mã tracking"] = extractDateFromDateTime(row["Ngày Kế toán đối soát với FFM lần 1"]);

      const legacy = legacyChanges.get(orderId);
      if (legacy) {
        legacy.forEach((info, key) => { rowCopy[key] = info.newValue; });
      }
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

      // Tab Logic - use early filtering to reduce dataset size
      if (bolActiveTab === 'japan') {
        data = data.filter(row => (row['Khu vực'] || row['khu vực']) === 'Nhật Bản');
      } else if (bolActiveTab === 'hcm') {
        data = data.filter(row => (row['Team'] === 'HCM' && !row['Đơn vị vận chuyển'] && row['Kết quả Check'] === 'OK'));
      } else if (bolActiveTab === 'hanoi') {
        data = data.filter(row => (row['Team'] === 'Hà Nội' && !row['Đơn vị vận chuyển'] && row['Kết quả Check'] === 'OK'));
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

    // Market & Product
    if (filterValues.market.length > 0) {
      const set = new Set(filterValues.market);
      data = data.filter(row => set.has(row["Khu vực"] || row["khu vực"]));
    }
    if (filterValues.product.length > 0) {
      const set = new Set(filterValues.product);
      data = data.filter(row => set.has(row["Mặt hàng"]));
    }

    // Date Range (only if enabled)
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

    // Column Filters (Text & Dropdown)
    Object.entries(filterValues).forEach(([key, val]) => {
      if (['market', 'product', 'tracking_include', 'tracking_exclude'].includes(key)) return;
      if (Array.isArray(val) && val.length === 0) return;
      if (typeof val === 'string' && val.trim() === '') return;

      // Tìm data key chính xác cho column này
      const dataKey = COLUMN_MAPPING[key] || key;

      data = data.filter(row => {
        // Thử nhiều cách lấy giá trị từ row
        let cellValue = row[dataKey] ?? row[key] ?? row[key.replace(/ /g, '_')] ?? row[dataKey.replace(/ /g, '_')] ?? '';
        cellValue = String(cellValue).trim();

        // Use exact match for dropdown columns in Bill of Lading, or specific cols in Order Mgmt
        if (DROPDOWN_OPTIONS[dataKey] || DROPDOWN_OPTIONS[key] || ["Trạng thái giao hàng", "Kết quả check", "GHI CHÚ"].includes(dataKey)) {
          const selected = val;
          if (selected.length === 0) return true;
          if (cellValue === '' && selected.includes('__EMPTY__')) return true;
          return selected.includes(cellValue);
        }

        // Date columns logic
        if (["Ngày lên đơn", "Ngày đóng hàng", "Ngày đẩy đơn", "Ngày có mã tracking"].includes(key)) {
          if (!cellValue) return false;
          const dVal = new Date(cellValue); dVal.setHours(0, 0, 0, 0);
          const fVal = new Date(val); fVal.setHours(0, 0, 0, 0);
          return dVal >= fVal;
        }

        // Text search - case insensitive, partial match
        return cellValue.toLowerCase().includes(val.toLowerCase());
      });
    });

    // Tracking Filters
    if (filterValues.tracking_include || filterValues.tracking_exclude) {
      const inc = filterValues.tracking_include.toLowerCase();
      const exc = filterValues.tracking_exclude.toLowerCase();
      data = data.filter(row => {
        const code = String(row['Mã Tracking'] || '').trim().toLowerCase();
        if (exc && code.includes(exc)) return false;
        if (inc) {
          if (inc.includes('\n')) {
            const codes = new Set(inc.split('\n').map(t => t.trim()).filter(Boolean));
            if (!codes.has(code)) return false;
          } else {
            if (!code.includes(inc)) return false;
          }
        }
        return true;
      });
    }

    return data;
  }, [allData, legacyChanges, pendingChanges, viewMode, omActiveTeam, omDateType, omShowTracking, omShowDuplicateTracking, bolActiveTab, bolDateType, filterValues, dateFrom, dateTo, mgtNoiBoOrder]);

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

  // --- Change Management (Shared) ---
  const processUpdateQueue = useCallback(async (forceBulk) => {
    const queue = updateQueue.current;
    if (queue.size === 0) return;

    const rowsToUpdate = [];
    const queueEntries = Array.from(queue.entries());
    queue.clear();

    queueEntries.forEach(([orderId, data]) => {
      const rowObj = { [PRIMARY_KEY_COLUMN]: orderId };
      data.changes.forEach((info, key) => { rowObj[key] = info.newValue; });
      rowsToUpdate.push(rowObj);
    });

    if (rowsToUpdate.length === 0) return;

    if (!forceBulk && rowsToUpdate.length === 1 && Object.keys(rowsToUpdate[0]).length === 2) {
      const row = rowsToUpdate[0];
      const col = Object.keys(row).find(k => k !== PRIMARY_KEY_COLUMN);
      try {
        const toastId = addToast('Đang cập nhật...', 'loading', 0);
        await API.updateSingleCell(row[PRIMARY_KEY_COLUMN], col, row[col]);
        setAllData(prev => {
          const idx = prev.findIndex(r => r[PRIMARY_KEY_COLUMN] === row[PRIMARY_KEY_COLUMN]);
          if (idx > -1) {
            const next = [...prev];
            next[idx] = { ...next[idx], [col]: row[col] };
            return next;
          }
          return prev;
        });
        setPendingChanges((prev) => {
          const next = new Map(prev);
          if (next.has(row[PRIMARY_KEY_COLUMN])) {
            next.get(row[PRIMARY_KEY_COLUMN]).delete(col);
            if (next.get(row[PRIMARY_KEY_COLUMN]).size === 0) next.delete(row[PRIMARY_KEY_COLUMN]);
          }
          savePendingToLocalStorage(next, legacyChanges);
          return next;
        });
        removeToast(toastId);
        addToast('Cập nhật thành công!', 'success');
      } catch (e) {
        addToast(e.message, 'error');
      }
    } else {
      try {
        const toastId = addToast(`Đang cập nhật ${rowsToUpdate.length} đơn hàng...`, 'loading', 0);
        const res = await API.updateBatch(rowsToUpdate);
        if (res.success) {
          setAllData(prev => {
            let next = [...prev];
            rowsToUpdate.forEach(updatedRow => {
              const idx = next.findIndex(r => r[PRIMARY_KEY_COLUMN] === updatedRow[PRIMARY_KEY_COLUMN]);
              if (idx > -1) next[idx] = { ...next[idx], ...updatedRow };
            });
            return next;
          });
          setPendingChanges((prev) => {
            const next = new Map(prev);
            rowsToUpdate.forEach(r => {
              const oid = r[PRIMARY_KEY_COLUMN];
              if (next.has(oid)) {
                Object.keys(r).forEach(k => { if (k !== PRIMARY_KEY_COLUMN) next.get(oid).delete(k); });
                if (next.get(oid).size === 0) next.delete(oid);
              }
            });
            savePendingToLocalStorage(next, legacyChanges);
            return next;
          });
          removeToast(toastId);
          addToast(`Đã cập nhật ${res.summary?.updated || rowsToUpdate.length} đơn hàng.`, 'success');
        }
      } catch (e) {
        addToast(e.message, 'error');
      }
    }
  }, [addToast, removeToast, legacyChanges, savePendingToLocalStorage]);

  const handleCellChange = useCallback((orderId, colKey, newValue) => {
    const originalRow = allData.find(r => r[PRIMARY_KEY_COLUMN] === orderId);
    const originalValue = originalRow ? String(originalRow[colKey] ?? '') : '';
    const isDelete = newValue === '' && originalValue !== '';

    setPendingChanges((prev) => {
      const next = new Map(prev);
      if (!next.has(orderId)) next.set(orderId, new Map());

      if (newValue !== originalValue) {
        next.get(orderId).set(colKey, { newValue, originalValue });
      } else {
        next.get(orderId).delete(colKey);
        if (next.get(orderId).size === 0) next.delete(orderId);
        setLegacyChanges(prevLeg => {
          const nextLeg = new Map(prevLeg);
          if (nextLeg.has(orderId)) {
            nextLeg.get(orderId).delete(colKey);
            if (nextLeg.get(orderId).size === 0) nextLeg.delete(orderId);
          }
          return nextLeg;
        });
      }
      savePendingToLocalStorage(next, legacyChanges);

      if (!updateQueue.current.has(orderId)) {
        updateQueue.current.set(orderId, { changes: new Map(), hasDelete: false });
      }
      const qEntry = updateQueue.current.get(orderId);
      if (qEntry.timeout) clearTimeout(qEntry.timeout);

      qEntry.changes.set(colKey, { newValue, originalValue });
      if (isDelete) qEntry.hasDelete = true;

      let totalChanges = 0;
      let hasAnyDelete = false;
      updateQueue.current.forEach(v => {
        totalChanges += v.changes.size;
        if (v.hasDelete) hasAnyDelete = true;
      });

      if (hasAnyDelete || totalChanges >= BULK_THRESHOLD) {
        qEntry.timeout = setTimeout(() => processUpdateQueue(true), UPDATE_DELAY);
      } else {
        qEntry.timeout = setTimeout(() => processUpdateQueue(false), UPDATE_DELAY);
      }
      return next;
    });
  }, [allData, legacyChanges, processUpdateQueue, savePendingToLocalStorage]);

  const handleUpdateAll = async () => {
    const combined = new Map([...legacyChanges, ...pendingChanges]);
    if (combined.size === 0) {
      addToast('Không có thay đổi cần cập nhật', 'info');
      return;
    }
    const rowsToSend = [];
    combined.forEach((changes, orderId) => {
      const row = { [PRIMARY_KEY_COLUMN]: orderId };
      changes.forEach((info, key) => { row[key] = info.newValue; });
      rowsToSend.push(row);
    });
    try {
      const toastId = addToast('Đang gửi tất cả thay đổi...', 'loading', 0);
      const res = await API.updateBatch(rowsToSend);
      if (res.success) {
        setAllData(prev => {
          let next = [...prev];
          rowsToSend.forEach(updatedRow => {
            const idx = next.findIndex(r => r[PRIMARY_KEY_COLUMN] === updatedRow[PRIMARY_KEY_COLUMN]);
            if (idx > -1) next[idx] = { ...next[idx], ...updatedRow };
          });
          return next;
        });
        setLegacyChanges(new Map());
        setPendingChanges(new Map());
        savePendingToLocalStorage(new Map(), new Map());
        setSyncPopoverOpen(false);
        removeToast(toastId);
        addToast('Cập nhật thành công!', 'success');
      }
    } catch (e) {
      addToast(e.message, 'error');
    }
  };

  const handleQuickSync = (rows) => {
    const newPending = new Map(pendingChanges);
    // Phải khớp với COLUMNS trong QuickAddModal.tsx
    const COL_KEYS = [
      "Mã đơn hàng",           // index 0 - khóa chính
      "Mã Tracking",           // index 1
      "Ngày đóng hàng",        // index 2
      "Trạng thái giao hàng",  // index 3
      "GHI CHÚ",               // index 4
      "Thời gian giao dự kiến", // index 5
      "Phí ship nội địa Mỹ (usd)", // index 6
      "Phí xử lý đơn đóng hàng-Lưu kho(usd)", // index 7
      "Kết quả Check",         // index 8
      "Ghi chú",               // index 9
      "Đơn vị vận chuyển"      // index 10
    ];
    let updatedCount = 0;
    let notFoundCount = 0;
    rows.forEach(row => {
      const orderId = row[0]?.trim();
      if (!orderId) return;
      const originalRow = allData.find(r => r[PRIMARY_KEY_COLUMN] === orderId);
      if (!originalRow) {
        notFoundCount++;
        return;
      }
      COL_KEYS.forEach((colName, idx) => {
        if (idx === 0) return;
        const val = row[idx];
        if (val !== undefined && val !== "") {
          const dataKey = COLUMN_MAPPING[colName] || colName;
          if (!newPending.has(orderId)) newPending.set(orderId, new Map());
          const originalVal = originalRow[dataKey] ?? '';
          if (String(originalVal) !== String(val)) {
            newPending.get(orderId).set(dataKey, { newValue: String(val), originalValue: String(originalVal) });
            updatedCount++;
          }
        }
      });
    });
    setPendingChanges(newPending);
    savePendingToLocalStorage(newPending, legacyChanges);
    if (notFoundCount > 0) addToast(`Không tìm thấy ${notFoundCount} mã đơn hàng.`, 'error');
    addToast(`Đã đồng bộ ${updatedCount} trường dữ liệu.`, 'success');
  };

  const handleDownloadExcel = () => {
    // Generate simple excel/csv
    const headers = currentColumns;
    const body = getFilteredData.map(row => {
      return headers.map(col => {
        const val = row[COLUMN_MAPPING[col] || col] || row[col] || '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(",");
    }).join("\n");

    const csv = `\uFEFF${headers.join(",")}\n${body}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Interaction (Mouse) ---
  const handleMouseDown = (rowIdx, colIdx, e) => {
    if (e.button !== 0) return; // Only left click

    // If click on input/select, don't start selection drag immediately?
    // Actually we want click to select the cell.

    isSelecting.current = true;

    if (e.ctrlKey) {
      // Add to selection? Complex. Let's stick to single contiguous selection for now google sheets style
      setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
    } else if (e.shiftKey && selection.startRow !== null) {
      setSelection(prev => ({ ...prev, endRow: rowIdx, endCol: colIdx }));
    } else {
      setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
    }
  };

  const handleMouseEnter = (rowIdx, colIdx) => {
    if (isSelecting.current) {
      setSelection(prev => ({ ...prev, endRow: rowIdx, endCol: colIdx }));
    }
  };

  useEffect(() => {
    const handleMouseUp = () => { isSelecting.current = false; };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // --- Keyboard Navigation ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Copy / Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const bounds = getSelectionBounds();
        if (!bounds) return;

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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, paginatedData.length, currentColumns.length, getSelectionBounds, paginatedData, currentColumns]);

  // --- Paste Logic ---
  useEffect(() => {
    const handlePaste = (e) => {
      if (quickAddModalOpen) return;

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

      const newPending = new Map(pendingChanges);
      let updatedCount = 0;

      // Paste logic: repeat pattern if source smaller than selection
      // Simply: iterate selection or data based on rules.
      // Simplified: Paste top-left aligned to selection start

      rows.forEach((rowVals, rIdx) => {
        const targetRowIdx = bounds.minRow + rIdx;
        if (targetRowIdx >= paginatedData.length) return;

        const rowData = paginatedData[targetRowIdx];
        const orderId = rowData[PRIMARY_KEY_COLUMN];

        rowVals.forEach((val, cIdx) => {
          const targetColIdx = bounds.minCol + cIdx;
          if (targetColIdx >= currentColumns.length) return;

          const colName = currentColumns[targetColIdx];
          if (!EDITABLE_COLS.includes(colName)) return; // Skip read-only

          const dataKey = COLUMN_MAPPING[colName] || colName;
          const originalValue = rowData[dataKey] ?? '';

          if (String(val) !== String(originalValue)) {
            if (!newPending.has(orderId)) newPending.set(orderId, new Map());
            newPending.get(orderId).set(dataKey, {
              newValue: String(val),
              originalValue: String(originalValue)
            });
            updatedCount++;
          }
        });
      });

      if (updatedCount > 0) {
        setPendingChanges(newPending);
        savePendingToLocalStorage(newPending, legacyChanges);
        addToast(`Đã dán ${updatedCount} ô`, 'success');
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [selection, quickAddModalOpen, pendingChanges, legacyChanges, paginatedData, currentColumns, getSelectionBounds]);


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
    let classes = "px-3 py-2 border border-gray-200 text-sm h-[38px] whitespace-nowrap ";

    // Status
    if (col === "Kết quả Check" || col === "Kết quả check") {
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

    // Fixed
    if (cIdx < fixedColumns) {
      classes += "sticky z-10 left-0 bg-gray-50 ";
    }

    // Selection
    if (selectionBounds && rIdx >= selectionBounds.minRow && rIdx <= selectionBounds.maxRow &&
      cIdx >= selectionBounds.minCol && cIdx <= selectionBounds.maxCol) {
      classes += "!bg-[#e3f2fd] ";
      if (rIdx === selectionBounds.minRow) classes += "selection-border-top ";
      if (rIdx === selectionBounds.maxRow) classes += "selection-border-bottom ";
      if (cIdx === selectionBounds.minCol) classes += "selection-border-left ";
      if (cIdx === selectionBounds.maxCol) classes += "selection-border-right ";
    }

    return classes;
  };

  /* End Component Logic */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Bar */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="text-gray-600 hover:text-gray-900 transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <img
                  src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Fbe61f44f.%E1%BA%A2nh.021347.png"
                  alt="Logo"
                  className="h-10 object-contain"
                />
              <div>
                <h1 className="text-xl font-bold text-gray-800">QUẢN LÝ VẬN ĐƠN</h1>
                <p className="text-xs text-gray-500">Hệ thống quản lý SPEEGO</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                <span className={`h-2 w-2 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-sm text-gray-600">
                  {allData.length > 0 ? `${allData.length} đơn hàng` : 'Chưa có dữ liệu'}
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
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {loading ? 'Đang tải...' : 'Tải lại'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-full mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="bg-white rounded-t-lg border-b border-gray-200 mb-0 shadow-sm">
          <div className="flex overflow-x-auto">
            {[
              { id: 'all', label: 'Dữ liệu đơn hàng', icon: '📋' },
              { id: 'japan', label: 'Đơn Nhật', icon: '🇯🇵' },
              { id: 'hcm', label: 'FFM đẩy vận hành', icon: '🚚' },
              { id: 'hanoi', label: 'FFM Hà Nội', icon: '🏢' }
            ].map(tab => (
              <button
                key={tab.id}
                className={`px-6 py-4 text-sm font-semibold transition-all whitespace-nowrap border-b-3 flex items-center gap-2 ${
                  bolActiveTab === tab.id
                    ? 'text-[#F37021] border-b-3 border-[#F37021] bg-[#fff5f0]'
                    : 'text-gray-600 border-b-3 border-transparent hover:text-[#F37021] hover:bg-gray-50'
                }`}
                onClick={() => { setBolActiveTab(tab.id); setCurrentPage(1); }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filters Panel */}
        <div className="bg-white rounded-b-lg shadow-sm border border-t-0 border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Date Type Selector */}
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Ngày:</label>
              <select 
                value={bolDateType} 
                onChange={e => setBolDateType(e.target.value)} 
                className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#F37021] focus:border-transparent"
              >
                <option value="Ngày lên đơn">Lên đơn</option>
                <option value="Ngày đóng hàng">Đóng hàng</option>
              </select>
            </div>

            {/* Quick Filter */}
            <div className="min-w-[180px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Lọc nhanh</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                value={quickFilter || ''}
                onChange={(e) => handleQuickFilter(e.target.value)}
              >
                <option value="">-- Chọn --</option>
                <option value="today">Hôm nay</option>
                <option value="yesterday">Hôm qua</option>
                <option value="this-week">Tuần này</option>
                <option value="last-week">Tuần trước</option>
                <option value="this-month">Tháng này</option>
                <option value="last-month">Tháng trước</option>
                <option value="this-year">Năm nay</option>
              </select>
            </div>

            {/* Date Range Filter with Checkbox */}
            <div className="min-w-[200px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableDateFilter || false}
                  onChange={(e) => {
                    setEnableDateFilter(e.target.checked);
                    if (!e.target.checked) {
                      setDateFrom('');
                      setDateTo('');
                      setQuickFilter('');
                    }
                  }}
                  className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                />
                <span>Thời gian (Từ - Đến)</span>
              </label>
              <div className="flex gap-2">
                <input 
                  type="date" 
                  disabled={!enableDateFilter}
                  className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#F37021] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed" 
                  value={dateFrom} 
                  onChange={e => setDateFrom(e.target.value)} 
                />
                <input 
                  type="date" 
                  disabled={!enableDateFilter}
                  className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#F37021] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed" 
                  value={dateTo} 
                  onChange={e => setDateTo(e.target.value)} 
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <label className="text-xs font-semibold text-gray-600">Sản phẩm</label>
              <MultiSelect
                label="Lọc sản phẩm"
                mainFilter={true}
                options={getUniqueValues("Mặt hàng")}
                selected={filterValues.product}
                onChange={(vals) => setFilterValues(prev => ({ ...prev, product: vals }))}
              />
            </div>

            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <label className="text-xs font-semibold text-gray-600">Khu vực</label>
              <MultiSelect
                label="Lọc khu vực"
                mainFilter={true}
                options={getUniqueValues("Khu vực")}
                selected={filterValues.market}
                onChange={(vals) => setFilterValues(prev => ({ ...prev, market: vals }))}
              />
            </div>

            <button
              onClick={refreshData}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors border border-gray-300 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Xóa lọc
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button 
                onClick={() => setSyncPopoverOpen(true)} 
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors border border-gray-300 relative flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Trạng thái cập nhật
                {(legacyChanges.size + pendingChanges.size) > 0 && (
                  <span className="absolute -top-2 -right-2 bg-[#F37021] text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                    {legacyChanges.size + pendingChanges.size}
                  </span>
                )}
              </button>
              <button 
                onClick={handleUpdateAll} 
                className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Cập nhật
              </button>
              <button 
                onClick={() => setQuickAddModalOpen(true)} 
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Thêm nhanh
              </button>
              <button 
                onClick={() => setShowColumnSettings(true)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Cài đặt cột
              </button>
              <button 
                onClick={handleDownloadExcel} 
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Excel
              </button>

              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <label className="text-sm text-gray-600">Cột cố định:</label>
                <input 
                  type="number" 
                  min="0" 
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]" 
                  value={fixedColumns} 
                  onChange={e => setFixedColumns(Number(e.target.value))} 
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 rounded-lg border border-blue-200">
                <div className="text-sm font-semibold text-gray-700">
                  Tổng đơn: <span className="text-[#F37021]">{getFilteredData.length}</span>
                </div>
                <div className="text-xs text-gray-600">
                  Tổng tiền: <span className="text-green-600 font-bold">{totalMoney.toLocaleString('vi-VN')} ₫</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-500px)] relative select-none">
        <table className="w-full border-collapse min-w-[2500px] text-sm">
          <thead className="sticky top-0 z-30">
            <tr className="bg-gray-100 h-12">
              {currentColumns.map((col, idx) => {
                const key = COLUMN_MAPPING[col] || col;
                const filterKey = col;
                const stickyStyle = idx < fixedColumns ?
                  { position: 'sticky', left: idx * 100, zIndex: 40, background: '#f8f9fa' } : {};

                return (
                  <th key={`filter-${col}`} className="p-1.5 border-b-2 border-r border-gray-300 min-w-[120px] align-top bg-[#f8f9fa]" style={stickyStyle}>
                    <div className="font-semibold mb-1 text-gray-700">{col}</div>
                    {/* Render Filters based on View Mode and Column Type */}
                    {col === "STT" ? (
                      <div className="text-xs text-gray-400">-</div>
                    ) : col === "Mã Tracking" ? (
                      <div className="flex flex-col gap-1">
                        <input
                          className="w-full text-xs px-1 py-0.5 border rounded" placeholder="Bao gồm..."
                          value={localFilterValues.tracking_include} onChange={e => setLocalFilterValues(p => ({ ...p, tracking_include: e.target.value }))}
                        />
                        <input
                          className="w-full text-xs px-1 py-0.5 border rounded" placeholder="Loại trừ..."
                          value={localFilterValues.tracking_exclude} onChange={e => setLocalFilterValues(p => ({ ...p, tracking_exclude: e.target.value }))}
                        />
                      </div>
                    ) : DROPDOWN_OPTIONS[col] || DROPDOWN_OPTIONS[key] || ["Trạng thái giao hàng", "Kết quả check", "GHI CHÚ"].includes(col) ? (
                      <MultiSelect
                        label={`Lọc...`}
                        options={getMultiSelectOptions(col)}
                        selected={filterValues[filterKey] || []}
                        onChange={vals => setFilterValues(p => ({ ...p, [filterKey]: vals }))}
                      />
                    ) : ["Ngày lên đơn", "Ngày đóng hàng", "Ngày đẩy đơn", "Ngày có mã tracking", "Ngày Kế toán đối soát với FFM lần 2"].includes(col) ? (
                      <input
                        type="date" className="w-full text-xs px-1 py-1 border rounded shadow-sm"
                        value={filterValues[filterKey] || ''} onChange={e => setFilterValues(p => ({ ...p, [filterKey]: e.target.value }))}
                      />
                    ) : (
                      <input
                        type="text" className="w-full text-xs px-1 py-1 border rounded shadow-sm" placeholder="..."
                        value={localFilterValues[filterKey] || ''} onChange={e => setLocalFilterValues(p => ({ ...p, [filterKey]: e.target.value }))}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={currentColumns.length} className="text-center p-10 text-gray-500">Đang tải dữ liệu...</td></tr>
            ) : paginatedData.length === 0 ? (
              <tr><td colSpan={currentColumns.length} className="text-center p-10 text-gray-500 italic">Không có dữ liệu phù hợp</td></tr>
            ) : (
              paginatedData.map((row, rIdx) => {
                const orderId = row[PRIMARY_KEY_COLUMN];
                return (
                  <tr key={orderId} className="hover:bg-[#E8EAF6] transition-colors">
                    {currentColumns.map((col, cIdx) => {
                      const key = COLUMN_MAPPING[col] || col;
                      const val = row[key] ?? row[col] ?? row[col.replace(/ /g, '_')] ?? '';
                      // Use formatDate for dates
                      const displayVal = ["Ngày lên đơn", "Ngày đóng hàng", "Ngày đẩy đơn", "Ngày có mã tracking", "Ngày Kế toán đối soát với FFM lần 2"].includes(col)
                        ? formatDate(val)
                        : (col === "Tổng tiền VNĐ" ? Number(String(val).replace(/[^\d.-]/g, "")).toLocaleString('vi-VN') : val);

                      const cellStyle = cIdx < fixedColumns ?
                        { position: 'sticky', left: cIdx * 100, zIndex: 10 } : {};

                      return (
                        <td
                          key={`${orderId}-${col}`}
                          className={getCellClass(row, col, String(displayVal), rIdx, cIdx)}
                          style={cellStyle}
                          onMouseDown={(e) => handleMouseDown(rIdx, cIdx, e)}
                          onMouseEnter={() => handleMouseEnter(rIdx, cIdx)}
                        >
                          {col === "STT" ? (row['rowIndex'] || ((currentPage - 1) * rowsPerPage + rIdx + 1)) :
                            DROPDOWN_OPTIONS[col] ? (
                              <select
                                className="w-full bg-transparent border-none outline-none text-sm p-0 m-0 cursor-pointer"
                                value={String(val)}
                                onChange={(e) => handleCellChange(orderId, key, e.target.value)}
                              >
                                {DROPDOWN_OPTIONS[col].map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (viewMode === 'ORDER_MANAGEMENT' && (col === "Kết quả Check" || col === "Trạng thái giao hàng")) ? (
                              <select
                                className="w-full bg-transparent border-none outline-none text-sm p-0 m-0"
                                value={String(val)}
                                onChange={(e) => handleCellChange(orderId, key, e.target.value)}
                              >
                                {getMultiSelectOptions(key).filter(o => o !== '__EMPTY__').map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : EDITABLE_COLS.includes(col) ? (
                              <input
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
          <div className="flex justify-center items-center gap-4 flex-wrap">
            <button
              disabled={currentPage <= 1} 
              onClick={() => setCurrentPage(p => p - 1)}
              className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors shadow-sm"
            >
              ← Trang trước
            </button>
            <span className="text-sm font-medium text-gray-700 px-4">
              Trang <span className="font-bold text-[#F37021]">{currentPage}</span> / {totalPages || 1}
            </span>
            <button
              disabled={currentPage >= totalPages} 
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors shadow-sm"
            >
              Trang sau →
            </button>
            <div className="flex items-center gap-2 ml-4">
              <label className="text-sm text-gray-600">Số dòng/trang:</label>
              <select
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                value={rowsPerPage} 
                onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              >
                <option value="50">50</option>
                <option value="70">70</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </select>
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
          legacyChanges={legacyChanges}
          onApply={handleUpdateAll}
          onDiscard={() => {
            if (confirm("Hủy bỏ tất cả thay đổi?")) {
              setPendingChanges(new Map());
              setLegacyChanges(new Map());
              localStorage.removeItem('speegoPendingChanges');
              setSyncPopoverOpen(false);
              refreshData();
            }
          }}
        />
      </Suspense>

      {/* Quick Add Modal */}
      <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>}>
        <QuickAddModal
          isOpen={quickAddModalOpen}
          onClose={() => setQuickAddModalOpen(false)}
          onSync={handleQuickSync}
        />
      </Suspense>

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
          allColumns.forEach(col => { defaultCols[col] = true; });
          setVisibleColumns(defaultCols);
        }}
        defaultColumns={allColumns}
      />
    </div>
  );
}

export default VanDon;
