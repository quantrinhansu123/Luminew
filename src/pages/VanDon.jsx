import { ChevronLeft, ChevronRight } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

function VanDon() {
  const { canView, role } = usePermissions();
  const isAdmin = ['admin', 'super_admin'].includes((role || '').toLowerCase());



  // --- Data State ---

  // --- Data State ---
  const [allData, setAllData] = useState([]);
  const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]); // Danh sách tên nhân sự đã chọn
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [useBackendPagination, setUseBackendPagination] = useState(true); // Enable backend pagination
  // Always use BILL_OF_LADING view - ORDER_MANAGEMENT is hidden
  const [viewMode] = useState('BILL_OF_LADING');

  // --- Change Tracking ---
  const [legacyChanges, setLegacyChanges] = useState(new Map());
  const [pendingChanges, setPendingChanges] = useState(new Map());
  const [syncPopoverOpen, setSyncPopoverOpen] = useState(false);

  // --- Undo/Redo History ---
  const [changeHistory, setChangeHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);


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
  const isSelecting = useRef(false);
  const tableRef = useRef(null);

  // --- Row Selection for Hanoi Tab ---
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showPhanFFMDropdown, setShowPhanFFMDropdown] = useState(false);
  const phanFFMRef = useRef(null);

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

      // --- 1. PREPARE PERMISSIONS & ALLOWED NAMES BEFORE FETCHING ---
      const userJson = localStorage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;
      const userName = localStorage.getItem("username") || user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || user?.username || user?.name || "";
      const isManager = ['admin', 'director', 'manager', 'super_admin'].includes((role || '').toLowerCase());

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
        const activeTeam = bolActiveTab === 'hanoi' ? 'Hà Nội' : (omActiveTeam !== 'all' ? omActiveTeam : undefined);
        const activeStatus = enableDateFilter ? undefined : (filterValues.status || undefined);
        const isJapanTab = bolActiveTab === 'japan';
        const marketFilter = isJapanTab ? ['Nhật Bản', 'CĐ Nhật Bản'] : filterValues.market;
        const shouldApplyDateFilter = enableDateFilter && !isAdmin;

        // Pass allowedStaff to API ONLY if not Manager AND Not Japan Tab
        const apiAllowedStaff = (!isManager && !isJapanTab) ? allAllowedNames : undefined;

        console.log('🚀 [VanDon] Fetching API with allowedStaff:', apiAllowedStaff);

        const result = await API.fetchVanDon({
          page: currentPage,
          limit: rowsPerPage,
          team: activeTeam,
          status: activeStatus,
          market: marketFilter,
          product: filterValues.product,
          dateFrom: shouldApplyDateFilter ? dateFrom : undefined,
          dateTo: shouldApplyDateFilter ? dateTo : undefined,
          allowedStaff: apiAllowedStaff
        });

        let filteredData = result.data;
        let filteredTotal = result.total;

        // --- 3. CLIENT SIDE POST-PROCESSING (Hanoi Tab, etc) ---

        // Tab "Đẩy đơn Hà Nội": extra client restrictions
        if (bolActiveTab === 'hanoi') {
          filteredData = result.data.filter(row => {
            const checkResult = String(row['Kết quả Check'] || row['Kết quả check'] || '').trim();
            const tracking = String(row['Mã Tracking'] || row['Mã tracking'] || '').trim();
            const deliveryUnit = String(row['Đơn vị vận chuyển'] || row['Đơn vị Vận chuyển'] || '').trim();

            // Kết quả Check phải là "Ok" hoặc "OK"
            const isCheckOk = checkResult.toLowerCase() === 'ok';
            // Mã Tracking phải trống hoặc null
            const isTrackingEmpty = !tracking || tracking === '' || tracking === 'null';
            // Đơn vị vận chuyển phải trống hoặc null
            const isDeliveryUnitEmpty = !deliveryUnit || deliveryUnit === '' || deliveryUnit === 'null';

            return isCheckOk && isTrackingEmpty && isDeliveryUnitEmpty;
          });
          filteredTotal = filteredData.length;
          console.log('🏛️ [VanDon Backend] Tab Hà Nội - Filtered by Check="Ok", empty Tracking and empty Đơn vị vận chuyển:', filteredData.length, 'orders');
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
          const m = normalizeNameForMatchFallback(row.marketing_staff || row["Nhân viên Sale"]);
          const d = normalizeNameForMatchFallback(row.delivery_staff || row["NV Vận đơn"] || row["Nhân viên Vận đơn"]);
          return allAllowedNamesFallback.some(n => {
            const nn = normalizeNameForMatchFallback(n);
            return s.includes(nn) || m.includes(nn) || d.includes(nn) || nn.includes(s) || nn.includes(m) || nn.includes(d);
          });
        };

        // --- CLIENT-SIDE FILTERING ---
        const isJapanTab = bolActiveTab === 'japan';

        if (isJapanTab) {
          data = data.filter(r => {
            const c = String(r.country || r['Khu vực'] || '').toLowerCase();
            return c === 'nhật bản' || c === 'cđ nhật bản';
          });
          console.log('🇯🇵 [VanDon Fallback] Japan tab - filtering by country only');
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
              const m = normalizeNameForMatchFallback(r.marketing_staff || r["Nhân viên Sale"]);
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
  }, []);

  // Tự động chuyển về 'all' nếu user đang ở tab hanoi nhưng không có quyền
  useEffect(() => {
    if (bolActiveTab === 'hanoi' && !canViewHaNoi) {
      console.log('⚠️ [VanDon] User không có quyền xem Đẩy đơn Hà Nội, chuyển về "all"');
      setBolActiveTab('all');
    }
  }, [canViewHaNoi, bolActiveTab]);

  // Reload data when filters or pagination change (if using backend)
  // Don't skip initial mount - let it load on mount
  useEffect(() => {
    if (useBackendPagination) {
      const timeoutId = setTimeout(() => {
        loadData();
      }, 100); // Small delay to ensure state is ready
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, bolActiveTab, omActiveTeam, filterValues.market, filterValues.product, enableDateFilter, dateFrom, dateTo, useBackendPagination, selectedPersonnelNames.length]);

  const savePendingToLocalStorage = (newPending, newLegacy) => {
    const changesToSave = {};
    const merge = new Map([...newLegacy, ...newPending]);

    merge.forEach((val, id) => {
      changesToSave[id] = Object.fromEntries(val);
    });
    localStorage.setItem('speegoPendingChanges', JSON.stringify(changesToSave));
  };

  // Save snapshot to history for undo
  const saveToHistory = (pending, legacy) => {
    const snapshot = {
      pending: new Map(pending),
      legacy: new Map(legacy),
      timestamp: Date.now()
    };

    setChangeHistory(prev => {
      // Remove any history after current index (when undoing then making new changes)
      const newHistory = prev.slice(0, historyIndex + 1);
      // Add new snapshot
      newHistory.push(snapshot);
      // Keep only last 50 snapshots to avoid memory issues
      return newHistory.slice(-50);
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  };

  // Undo last change
  const handleUndo = () => {
    if (historyIndex < 0) {
      addToast('Không có thay đổi nào để hoàn tác', 'info', 2000);
      return;
    }

    const previousIndex = historyIndex - 1;
    if (previousIndex < 0) {
      // Undo to initial state (empty)
      setPendingChanges(new Map());
      setLegacyChanges(new Map());
      savePendingToLocalStorage(new Map(), new Map());
      setHistoryIndex(-1);
      addToast('Đã hoàn tác tất cả thay đổi', 'success', 2000);
      return;
    }

    const previousSnapshot = changeHistory[previousIndex];
    setPendingChanges(new Map(previousSnapshot.pending));
    setLegacyChanges(new Map(previousSnapshot.legacy));
    savePendingToLocalStorage(previousSnapshot.pending, previousSnapshot.legacy);
    setHistoryIndex(previousIndex);
    addToast('Đã hoàn tác', 'success', 2000);
  };

  // Redo last undone change
  const handleRedo = () => {
    if (historyIndex >= changeHistory.length - 1) {
      addToast('Không có thay đổi nào để làm lại', 'info', 2000);
      return;
    }

    const nextIndex = historyIndex + 1;
    const nextSnapshot = changeHistory[nextIndex];
    setPendingChanges(new Map(nextSnapshot.pending));
    setLegacyChanges(new Map(nextSnapshot.legacy));
    savePendingToLocalStorage(nextSnapshot.pending, nextSnapshot.legacy);
    setHistoryIndex(nextIndex);
    addToast('Đã làm lại', 'success', 2000);
  };

  // Handle Phân FFM - Update "Đơn vị vận chuyển" and "Ngày Kế toán đối soát với FFM lần 2" for selected rows
  const handlePhanFFM = async (carrierName) => {
    if (selectedRows.size === 0) return;

    const selectedCount = selectedRows.size;
    // Use the UI column name "Đơn vị vận chuyển" directly, as it will be mapped correctly when saving
    const carrierKey = 'Đơn vị vận chuyển';
    const accountingDateKey = 'Ngày Kế toán đối soát với FFM lần 2';

    // Get current date/time in ISO format
    const now = new Date().toISOString();

    // Update pending changes
    const newPending = new Map(pendingChanges);
    selectedRows.forEach(orderId => {
      if (!newPending.has(orderId)) {
        newPending.set(orderId, new Map());
      }
      // Update "Đơn vị vận chuyển" - use UI column name, it will be mapped to DB field when saving
      const originalRow = allData.find(r => r[PRIMARY_KEY_COLUMN] === orderId);
      const originalCarrierValue = originalRow ? String(originalRow[carrierKey] || originalRow['shipping_unit'] || originalRow['Đơn vị vận chuyển'] || '') : '';
      newPending.get(orderId).set(carrierKey, { newValue: carrierName, originalValue: originalCarrierValue });

      // Update "Ngày Kế toán đối soát với FFM lần 2" với thời gian hiện tại
      const originalDateValue = originalRow ? String(originalRow[accountingDateKey] || originalRow['accounting_check_date'] || '') : '';
      newPending.get(orderId).set(accountingDateKey, { newValue: now, originalValue: originalDateValue });
    });

    setPendingChanges(newPending);
    savePendingToLocalStorage(newPending, legacyChanges);

    // Save to history for undo
    saveToHistory(newPending, legacyChanges);

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

  // --- Filtering Logic ---
  // Filter out hidden columns from allColumns
  const allColumns = useMemo(() => {
    const base = viewMode === 'ORDER_MANAGEMENT' ? ORDER_MGMT_COLUMNS : BILL_LADING_COLUMNS;
    return base.filter(col => !HIDDEN_COLUMNS.includes(col));
  }, [viewMode]);
  const currentColumns = useMemo(() => {
    const filtered = allColumns.filter(col => visibleColumns[col] === true);

    // Trong tab "Hà Nội", đẩy cột "Đơn vị vận chuyển" lên đầu
    if (bolActiveTab === 'hanoi') {
      const carrierCol = 'Đơn vị vận chuyển';
      const hasCarrier = filtered.includes(carrierCol);
      if (hasCarrier) {
        const withoutCarrier = filtered.filter(col => col !== carrierCol);
        return [carrierCol, ...withoutCarrier];
      }
    }

    return filtered;
  }, [allColumns, visibleColumns, bolActiveTab]);

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

      // Filter: Chỉ hiển thị đơn có ít nhất một tên nhân sự (không trống)
      const initialDataLength = data.length;
      data = data.filter(row => {
        const saleStaff = String(row.sale_staff || row["Nhân viên Sale"] || '').trim();
        const mktStaff = String(row.marketing_staff || row["Nhân viên Sale"] || '').trim();
        const deliveryStaff = String(row.delivery_staff || row["NV Vận đơn"] || row["Nhân viên Vận đơn"] || '').trim();
        return saleStaff.length > 0 || mktStaff.length > 0 || deliveryStaff.length > 0;
      });
      console.log('🔍 [VanDon Client-side] Filtered out orders with empty personnel names:', initialDataLength - data.length, 'orders removed');

      // Tab Logic - use early filtering to reduce dataset size
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
        const currentUsername = localStorage.getItem('username') || 'Unknown';
        await API.updateSingleCell(row[PRIMARY_KEY_COLUMN], col, row[col], currentUsername);
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
        const currentUsername = localStorage.getItem('username') || 'Unknown';
        const res = await API.updateBatch(rowsToUpdate, currentUsername);
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
      const currentUsername = localStorage.getItem('username') || 'Unknown';
      const res = await API.updateBatch(rowsToSend, currentUsername);
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

  // Save to history when pendingChanges or legacyChanges change (debounced)
  const historyTimeoutRef = useRef(null);
  useEffect(() => {
    if (historyTimeoutRef.current) {
      clearTimeout(historyTimeoutRef.current);
    }

    historyTimeoutRef.current = setTimeout(() => {
      // Only save if there are actual changes
      if (pendingChanges.size > 0 || legacyChanges.size > 0) {
        saveToHistory(pendingChanges, legacyChanges);
      }
    }, 1000); // Debounce 1 second

    return () => {
      if (historyTimeoutRef.current) {
        clearTimeout(historyTimeoutRef.current);
      }
    };
  }, [pendingChanges, legacyChanges]);

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

      const newPending = new Map(pendingChanges);
      let updatedCount = 0;

      // Paste logic: repeat pattern if source smaller than selection
      // Simply: iterate selection or data based on rules.
      // Simplified: Paste top-left aligned to selection start

      // Flood Fill Logic:
      // If clipboard has only 1 cell (1x1), and selection > 1x1, fill the selection with that value.
      const isFloodFill = rows.length === 1 && rows[0].length === 1 &&
        ((bounds.maxRow - bounds.minRow > 0) || (bounds.maxCol - bounds.minCol > 0));

      if (isFloodFill) {
        const val = rows[0][0];
        for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
          if (r >= paginatedData.length) continue;
          const rowData = paginatedData[r];
          const orderId = rowData[PRIMARY_KEY_COLUMN];

          for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
            if (c >= currentColumns.length) continue;
            const colName = currentColumns[c];
            if (!EDITABLE_COLS.includes(colName)) continue;

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
      }

      if (updatedCount > 0) {
        setPendingChanges(newPending);
        savePendingToLocalStorage(newPending, legacyChanges);

        // -- Auto-save logic --
        // Push these changes to updateQueue for immediate processing
        newPending.forEach((changes, orderId) => {
          if (!updateQueue.current.has(orderId)) {
            updateQueue.current.set(orderId, { changes: new Map(), hasDelete: false });
          }
          const qEntry = updateQueue.current.get(orderId);
          if (qEntry.timeout) clearTimeout(qEntry.timeout); // Clear any pending debounce

          changes.forEach((val, key) => {
            qEntry.changes.set(key, val);
          });
        });

        // Trigger immediate bulk update
        addToast(`Đã dán ${updatedCount} ô. Đang tự động lưu...`, 'info', 1000);
        processUpdateQueue(true);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [selection, pendingChanges, legacyChanges, paginatedData, currentColumns, getSelectionBounds, processUpdateQueue, savePendingToLocalStorage]);


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

    // Default cell sizing
    // NOTE: For select-based columns, avoid vertical padding so the select can fill the cell height cleanly.
    let classes = `${(isCheckCol || isStatusCol) ? "py-0" : "py-2"} border border-gray-200 text-sm h-[38px] whitespace-nowrap `;

    // Padding adjustment for specific columns
    if (isCheckCol) {
      classes += "pl-2 pr-3 ";
    } else {
      classes += "px-3 ";
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
                { id: 'japan', label: 'Đơn Nhật', icon: '🇯🇵' },
                { id: 'hanoi', label: 'Đẩy đơn Hà Nội', icon: '🏛️' }
              ].filter(tab => {
                // Chỉ hiển thị tab "Đẩy đơn Hà Nội" nếu user có quyền
                if (tab.id === 'hanoi') {
                  return canViewHaNoi;
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
              {(legacyChanges.size + pendingChanges.size) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] px-1 rounded-full shadow-sm">
                  {legacyChanges.size + pendingChanges.size}
                </span>
              )}
            </button>
            <button onClick={handleUpdateAll} className="p-1 px-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded text-xs font-bold transition-all flex items-center gap-1 shadow-sm">
              ✅ Cập nhật
            </button>

            <button onClick={() => setShowColumnSettings(true)} className="p-1 px-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-xs font-bold transition-all flex items-center gap-1">
              ⚙️ Cài đặt cột
            </button>

            <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100">
              Cố định:
              <input
                type="number" min="0"
                className="w-10 border-none bg-transparent focus:ring-0 text-center font-bold text-[#F37021]"
                value={fixedColumns} onChange={e => setFixedColumns(Number(e.target.value))}
              />
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
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden flex-1 flex flex-col">
          <div className="overflow-auto relative select-none flex-1" style={{ overflowX: 'auto', overflowY: 'auto' }}>
            <table className="w-full border-collapse min-w-[2500px] text-[13px] leading-tight" style={{ position: 'relative' }}>
              <thead className="sticky top-0 shadow-sm bg-white" style={{ position: 'sticky', top: 0, zIndex: 1000, backgroundColor: 'white' }}>

                <tr className="bg-gray-100 h-12" style={{ position: 'relative', zIndex: 1000 }}>
                  {/* Checkbox column header - chỉ hiển thị trong tab Hà Nội */}
                  {bolActiveTab === 'hanoi' && (
                    <th className="py-2 border-b-2 border-r border-gray-300 align-top bg-[#f8f9fa] relative whitespace-nowrap px-2" style={{ position: 'sticky', left: 0, zIndex: 1002, background: '#f8f9fa' }}>
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={paginatedData.length > 0 && paginatedData.every(row => selectedRows.has(row[PRIMARY_KEY_COLUMN]))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllRows();
                            } else {
                              deselectAllRows();
                            }
                          }}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                      </div>
                    </th>
                  )}
                  {currentColumns.map((col, idx) => {
                    const key = COLUMN_MAPPING[col] || col;
                    const filterKey = col;
                    const stickyStyle = idx < fixedColumns ?
                      { position: 'sticky', left: idx * 100, zIndex: 1001, background: '#f8f9fa' } : { zIndex: 1000 };
                    const isCheckCol = (col === "Kết quả Check" || col === "Kết quả check");

                    return (
                      <th key={`filter-${col}`} className={`py-2 border-b-2 border-r border-gray-300 align-top bg-[#f8f9fa] whitespace-nowrap ${isCheckCol ? 'pl-2 pr-3' : 'px-4'}`} style={{ ...stickyStyle, minWidth: isCheckCol ? '140px' : 'fit-content', maxWidth: isCheckCol ? '160px' : 'auto', width: isCheckCol ? '150px' : 'auto' }}>
                        <div className={`font-semibold mb-2 text-gray-700 text-sm whitespace-nowrap ${(col === "Kết quả Check" || col === "Kết quả check") ? 'text-left' : ''}`}>{col}</div>
                        {/* Render Filters based on View Mode and Column Type */}
                        {col === "STT" ? (
                          <div className="text-xs text-gray-400">-</div>
                        ) : col === "Mã Tracking" ? (
                          <div className="flex flex-col gap-1.5 relative" style={{ zIndex: 1002 }}>
                            <input
                              className="w-full text-sm px-2 py-1.5 border rounded" style={{ zIndex: 1002 }} placeholder="Bao gồm..."
                              value={localFilterValues.tracking_include} onChange={e => setLocalFilterValues(p => ({ ...p, tracking_include: e.target.value }))}
                            />
                            <input
                              className="w-full text-sm px-2 py-1.5 border rounded" style={{ zIndex: 1002 }} placeholder="Loại trừ..."
                              value={localFilterValues.tracking_exclude} onChange={e => setLocalFilterValues(p => ({ ...p, tracking_exclude: e.target.value }))}
                            />
                          </div>
                        ) : DROPDOWN_OPTIONS[col] || DROPDOWN_OPTIONS[key] || ["Trạng thái giao hàng", "Kết quả check", "GHI CHÚ"].includes(col) ? (
                          <div className="relative w-full" style={{ zIndex: 1002, marginTop: '-0.125rem' }}>
                            <MultiSelect
                              label={`Lọc...`}
                              options={getMultiSelectOptions(col)}
                              selected={filterValues[filterKey] || []}
                              onChange={vals => setFilterValues(p => ({ ...p, [filterKey]: vals }))}
                            />
                          </div>
                        ) : ["Ngày lên đơn", "Ngày đóng hàng", "Ngày đẩy đơn", "Ngày có mã tracking", "Ngày Kế toán đối soát với FFM lần 2"].includes(col) ? (
                          <input
                            type="date" className="w-full text-sm px-2 py-1.5 border rounded shadow-sm" style={{ zIndex: 1002 }}
                            value={filterValues[filterKey] || ''} onChange={e => setFilterValues(p => ({ ...p, [filterKey]: e.target.value }))}
                          />
                        ) : (
                          <input
                            type="text" className="w-full text-sm px-2 py-1.5 border rounded shadow-sm" style={{ zIndex: 1002 }} placeholder="..."
                            value={localFilterValues[filterKey] || ''} onChange={e => setLocalFilterValues(p => ({ ...p, [filterKey]: e.target.value }))}
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody style={{ position: 'relative', zIndex: 1 }}>
                {loading ? (
                  <tr><td colSpan={currentColumns.length + (bolActiveTab === 'hanoi' ? 1 : 0)} className="text-center p-10 text-gray-500">Đang tải dữ liệu...</td></tr>
                ) : paginatedData.length === 0 ? (
                  <tr><td colSpan={currentColumns.length + (bolActiveTab === 'hanoi' ? 1 : 0)} className="text-center p-10 text-gray-500 italic">Không có dữ liệu phù hợp</td></tr>
                ) : (
                  paginatedData.map((row, rIdx) => {
                    const orderId = row[PRIMARY_KEY_COLUMN];
                    return (
                      <tr key={orderId} className={`hover:bg-[#E8EAF6] transition-colors ${selectedRows.has(orderId) ? 'bg-blue-50' : ''}`}>
                        {/* Checkbox column - chỉ hiển thị trong tab Hà Nội */}
                        {bolActiveTab === 'hanoi' && (
                          <td className="py-2 border border-gray-200 text-sm h-[38px] whitespace-nowrap px-2 bg-gray-50 sticky left-0 z-10" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: selectedRows.has(orderId) ? '#dbeafe' : '#f9fafb' }}>
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
                          const key = COLUMN_MAPPING[col] || col;
                          const val = row[key] ?? row[col] ?? row[col.replace(/ /g, '_')] ?? '';
                          // Use formatDate for dates
                          const displayVal = ["Ngày lên đơn", "Ngày đóng hàng", "Ngày đẩy đơn", "Ngày có mã tracking", "Ngày Kế toán đối soát với FFM lần 2"].includes(col)
                            ? formatDate(val)
                            : (col === "Tổng tiền VNĐ" ? Number(String(val).replace(/[^\d.-]/g, "")).toLocaleString('vi-VN') : val);

                          const isCheckCol = (col === "Kết quả Check" || col === "Kết quả check");
                          const cellStyle = cIdx < fixedColumns ?
                            { position: 'sticky', left: cIdx * 100, zIndex: 10, ...(isCheckCol ? { minWidth: '140px', maxWidth: '160px', width: '150px' } : {}) } :
                            (isCheckCol ? { minWidth: '140px', maxWidth: '160px', width: '150px' } : {});

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
                                    className="w-full h-full bg-transparent border-none outline-none text-sm p-0 m-0 cursor-pointer"
                                    value={String(val)}
                                    onChange={(e) => handleCellChange(orderId, key, e.target.value)}
                                  >
                                    {DROPDOWN_OPTIONS[col].map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                ) : (col === "Kết quả Check" || col === "Trạng thái giao hàng") ? (
                                  <select
                                    className="w-full h-full bg-transparent border-none outline-none text-sm flex items-center"
                                    style={{ padding: 0, margin: 0, lineHeight: '38px' }}
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
