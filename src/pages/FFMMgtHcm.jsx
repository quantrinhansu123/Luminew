import { lazy, Suspense, startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MultiSelect from '../components/MultiSelect';
import usePermissions from '../hooks/usePermissions';
import * as API from '../services/api';
import { supabase } from '../supabase/config';
import '../styles/selection.css';
import {
  COLUMN_MAPPING,
  DROPDOWN_OPTIONS,
  EDITABLE_COLS,
  FFM_QUICK_ADD_COLUMNS,
  ORDER_MGMT_COLUMNS,
  PRIMARY_KEY_COLUMN,
  TEAM_COLUMN_NAME
} from '../types';
import { rafThrottle } from '../utils/throttle';
import * as XLSX from 'xlsx';

/** Trang FFM MGT HCM: đọc/ghi Supabase `order_code_hcm` (cùng schema map như `orders`). */
const FFM_HCM_SUPABASE_TABLE = 'order_code_hcm';
const FFM_HCM_PENDING_LS_KEY = 'speegoPendingChanges_ffm_mgt_hcm';

/** Giá trị Team / chi nhánh từ row (FFM) */
function getTeamStringFFM(row) {
  return String(row[TEAM_COLUMN_NAME] ?? row.team ?? '').trim();
}

/** Chuỗi đơn vị vận chuyển sau khi map (FFM). */
function getFfmShippingUnitString(row) {
  return String(
    row['Đơn vị vận chuyển'] ??
      row['Đơn_vị_vận_chuyển'] ??
      row.shipping_unit ??
      ''
  ).trim();
}

/** Chỉ đơn T&T (khớp lọc Supabase shipping_unit ilike %T&T%). */
function isFfmTtCarrierRow(row) {
  const u = getFfmShippingUnitString(row).toLowerCase();
  if (!u) return false;
  return u.includes('t&t');
}

/** Lọc Chi nhánh: all | hanoi | hcm */
function matchesFfmBranchFilter(teamStr, filter) {
  if (filter === 'all') return true;
  const t = teamStr.toLowerCase().normalize('NFC').trim();
  if (filter === 'hanoi') {
    return t === 'hà nội' || t === 'ha noi' || t === 'hanoi';
  }
  if (filter === 'hcm') {
    return (
      t === 'hcm' ||
      t === 'tp.hcm' ||
      t === 'tp hcm' ||
      t.includes('hồ chí minh') ||
      t.includes('ho chi minh') ||
      (t.includes('hcm') && !t.includes('hà nội') && !t.includes('ha noi'))
    );
  }
  return true;
}

/** Có mã tracking (sau khi map từ DB) */
function getTrackingCodeFFM(row) {
  return String(row.tracking_code ?? row['Mã Tracking'] ?? row['tracking_code'] ?? '').trim();
}

/** Sắp theo Ngày lên đơn giảm dần + gán rowIndex (khớp sort trong getFilteredData). */
function assignRowIndexByOrderDate(rows) {
  const sorted = [...rows].sort((a, b) => {
    const da = new Date(a['Ngày lên đơn'] || a.order_date || 0).getTime();
    const db = new Date(b['Ngày lên đơn'] || b.order_date || 0).getTime();
    if (Number.isNaN(da)) return 1;
    if (Number.isNaN(db)) return -1;
    return db - da;
  });
  return sorted.map((r, i) => ({ ...r, rowIndex: i + 1 }));
}

/** Lô đầu nhỏ để lên UI nhanh; các lô sau rộng hơn. */
const FFM_FIRST_BATCH_SIZE = 400;
const FFM_NEXT_BATCH_SIZE = 1000;
/** Kéo chuột ≥ px này thì coi là bôi vùng; nhỏ hơn thì coi là click để focus ô (sau mouseup). */
const DRAG_FOCUS_THRESHOLD_PX = 5;
/** Các key trong filterValues không xử lý trong vòng Object.entries (đã lọc riêng). */
const FFM_FILTER_SKIP_KEYS = new Set([
  'market', 'product', 'tracking_include', 'tracking_exclude', 'tracking_status',
  'packing_date_status', 'delivery_status_filter', 'delivery_status_search',
  'us_shipping_fee_search'
]);
const HIDDEN_FFM_COLUMNS = new Set([
  'Payment Bill',
  'Payment Image',
  'Phí xử lý đơn đóng hàng-Lưu kho(usd)',
]);

/** Xuất Excel: các cột khớp bộ lọc bảng (Mã đơn, Tracking + cột trong UI FFM). */
const FFM_EXCEL_EXPORT_COLUMNS = [
  PRIMARY_KEY_COLUMN,
  'Mã Tracking',
  'Ngày đóng hàng',
  'Trạng thái giao hàng',
  'GHI CHÚ',
  'Thời gian giao dự kiến',
  'Ngày Kế toán đối soát với FFM lần 2',
  'Ngày đẩy đơn',
  'Ngày có mã tracking',
  'Ngày đối soát kế toán',
];
const FFM_ALLOWED_EDIT_COLUMNS = new Set([
  'Kết quả Check',
  'Kết quả check',
  'Kết quả',
  'Ngày đóng hàng',
  'Trạng thái giao hàng',
  'GHI CHÚ',
  'Thời gian giao dự kiến',
  'Ngày đẩy đơn',
  'Ngày đối soát kế toán',
]);

/** Lấy ngày hôm nay định dạng YYYY-MM-DD */
function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Giá trị gốc ngày tracking từ row (dùng để suy ra cột ngày tracking). */
function getTrackingDateRawFFM(row) {
  return (
    row['tracking_check_date'] ||
    row.tracking_check_date ||
    row['Ngày có mã tracking'] ||
    row['thoigiangiaohangffm'] ||
    row['Ngày Kế toán đối soát với FFM lần 1']
  );
}

/**
 * Lấy phần ngày từ chuỗi datetime (dd/mm/yyyy, dd/mm/yyyy HH:mm, ISO YYYY-MM-DD…).
 * Trước đây chỉ xử lý khi có khoảng trắng → dd/mm không dấu cách bị lọc sai.
 */
function extractDateFromDateTime(dateTimeString) {
  if (!dateTimeString) return '';
  const str = String(dateTimeString).trim();
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dayPart = str.split(/\s|T/)[0];
  if (dayPart.includes('/')) {
    const parts = dayPart.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (y >= 1000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }
  return str;
}

/** Chuẩn về YYYY-MM-DD để so sánh chuỗi (tránh lệch timezone của new Date('YYYY-MM-DD')). */
function normalizeToYmdForCompare(val) {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val).trim();
  if (!str) return '';
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dayPart = str.split(/\s|T/)[0];
  if (dayPart.includes('/')) {
    const parts = dayPart.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (y >= 1000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }
  const dt = new Date(str);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Ngày theo «Bộ lọc theo ngày» (Từ ngày / Tới ngày) — cùng quy tắc với cột hiển thị. */
function getOmDateYmdFromRow(row, activeDateType) {
  if (activeDateType === 'Ngày đẩy đơn') {
    const v = row['time_dayon'] || row.time_dayon || row['Ngày đẩy đơn'];
    return normalizeToYmdForCompare(v);
  }
  if (activeDateType === 'Ngày có mã tracking') {
    const raw = getTrackingDateRawFFM(row);
    const step = extractDateFromDateTime(raw) || raw;
    return normalizeToYmdForCompare(step);
  }
  return normalizeToYmdForCompare(row[activeDateType]);
}

function isEditableColFFM(colName) {
  return FFM_ALLOWED_EDIT_COLUMNS.has(String(colName || '').trim());
}

/** Giá trị UI gốc (sau pending) cho một ô — dùng khi fill / paste. */
function getFfmRowColRaw(row, colName, pendingChanges) {
  const orderId = row[PRIMARY_KEY_COLUMN];
  const key = COLUMN_MAPPING[colName] || colName;
  let val = '';
  if (colName === 'Mã Tracking') {
    val = row['Mã Tracking'] ?? row['tracking_code'] ?? row.tracking_code ?? '';
  } else if (colName === 'Ngày đẩy đơn') {
    val = row['time_dayon'] ?? row.time_dayon ?? row['Ngày đẩy đơn'] ?? row[key] ?? '';
  } else if (colName === 'Payment Bill') {
    val = row['Payment Bill'] ?? row.payment_bill ?? row[key] ?? '';
  } else if (colName === 'Payment Image') {
    val = row['Payment Image'] ?? row.payment_image ?? row[key] ?? '';
  } else {
    val = row[key] ?? row[colName] ?? row[colName.replace(/ /g, '_')] ?? '';
  }
  const pendingInfo = pendingChanges.get(orderId)?.get(key);
  if (pendingInfo) val = pendingInfo.newValue;
  return { dataKey: key, raw: String(val ?? '') };
}

/** Highlight khi kéo — cập nhật class trực tiếp, không setState mỗi frame (tránh re-render cả bảng). */
function getFfDragTargetCells() {
  const root = document.querySelector('[data-ffm-grid-root]');
  return root
    ? root.querySelectorAll('td[data-ffm-r][data-ffm-c]')
    : document.querySelectorAll('td[data-ffm-r][data-ffm-c]');
}

function applyFfDragDomSelection(minR, maxR, minC, maxC) {
  const DRAG = 'ffm-drag-select';
  const edges = ['selection-border-top', 'selection-border-bottom', 'selection-border-left', 'selection-border-right'];
  getFfDragTargetCells().forEach((el) => {
    const r = +el.getAttribute('data-ffm-r');
    const c = +el.getAttribute('data-ffm-c');
    const inSel = r >= minR && r <= maxR && c >= minC && c <= maxC;
    el.classList.remove(DRAG, ...edges);
    if (inSel) {
      el.classList.add(DRAG);
      if (r === minR) el.classList.add('selection-border-top');
      if (r === maxR) el.classList.add('selection-border-bottom');
      if (c === minC) el.classList.add('selection-border-left');
      if (c === maxC) el.classList.add('selection-border-right');
    }
  });
}

function clearFfDragDomSelection() {
  const DRAG = 'ffm-drag-select';
  const edges = ['selection-border-top', 'selection-border-bottom', 'selection-border-left', 'selection-border-right'];
  getFfDragTargetCells().forEach((el) => {
    el.classList.remove(DRAG, ...edges);
  });
}

function clearFfFillPreview() {
  getFfDragTargetCells().forEach((el) => {
    el.classList.remove('ffm-fill-preview');
  });
}

const SyncPopover = lazy(() => import('../components/SyncPopover'));
const QuickAddModal = lazy(() => import('../components/QuickAddModal'));
const ColumnSettingsModal = lazy(() => import('../components/ColumnSettingsModal'));
const BillImageViewer = lazy(() => import('../components/BillImageViewer'));


/** Trang FFM MGT HCM — bản sao độc lập của FFM (cùng logic, `variant` cố định MGT_HCM). */
function FFMMgtHcm() {
  const variant = 'MGT_HCM';
  const { canView } = usePermissions();
  const visibleColumnsStorageKey =
    variant === 'TT'
      ? 'ffm_TT_visibleColumns'
      : variant === 'MGT_HCM'
        ? 'ffm_MGT_HCM_visibleColumns'
        : 'ffm_MGT_visibleColumns';
  const ffmColumns = useMemo(
    () => ORDER_MGMT_COLUMNS.filter((col) => !HIDDEN_FFM_COLUMNS.has(col)),
    []
  );



  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(false);
  // Only ORDER_MANAGEMENT mode - BILL_OF_LADING removed
  const viewMode = 'ORDER_MANAGEMENT';

  const [pendingChanges, setPendingChanges] = useState(new Map());
  const [syncPopoverOpen, setSyncPopoverOpen] = useState(false);
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState(() => {
    let saved = localStorage.getItem(visibleColumnsStorageKey);
    if (!saved && variant !== 'TT') {
      saved = localStorage.getItem('ffm_visibleColumns');
    }
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const oldShipCol = 'Phí ship nội địa Mỹ (usd)';
        const newShipCol = 'Ngày đối soát kế toán';
        if (Object.prototype.hasOwnProperty.call(parsed, oldShipCol) && !Object.prototype.hasOwnProperty.call(parsed, newShipCol)) {
          parsed[newShipCol] = parsed[oldShipCol];
          delete parsed[oldShipCol];
          try {
            localStorage.setItem(visibleColumnsStorageKey, JSON.stringify(parsed));
          } catch (_) { /* ignore */ }
        }
        return parsed;
      } catch (e) {
        console.error('Error parsing saved columns:', e);
      }
    }
    // Initialize with default columns
    const initial = {};
    ffmColumns.forEach(col => {
      initial[col] = true;
    });
    return initial;
  });

  const [filterValues, setFilterValues] = useState({
    market: [],
    product: [],
    tracking_include: '',
    tracking_exclude: '',
    tracking_status: 'Tình trạng mã',
    ['Kết quả Check']: [],
    packing_date_status: 'Tất cả',
    delivery_status_filter: 'Tất cả',
    delivery_status_search: '',
    us_shipping_fee_search: ''
  });
  const [localFilterValues, setLocalFilterValues] = useState(filterValues);
  const deferredFilterValues = useDeferredValue(filterValues);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      startTransition(() => setFilterValues(localFilterValues));
    }, 200);
    return () => clearTimeout(timeoutId);
  }, [localFilterValues]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fixedColumns, setFixedColumns] = useState(2);

  const [omActiveTeam, setOmActiveTeam] = useState('all');
  const [omDateType, setOmDateType] = useState('Ngày đóng hàng');
  const [showFilters, setShowFilters] = useState(false); // Collapse/expand filters

  /** Chi nhánh: Tất cả | Hà Nội | HCM */
  const [ffmBranchFilter, setFfmBranchFilter] = useState('all');
  /** Mã Tracking: Tất cả | có mã | chưa có mã */
  const [ffmTrackingPresence, setFfmTrackingPresence] = useState('all');

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const ffmMergeRef = useRef(new Map());
  const ffmCursorRef = useRef({
    mgtFrom: 0,
    trackedFrom: 0,
    mgtExhausted: false,
    trackedExhausted: false
  });
  const [ffmHasMore, setFfmHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Tự động gọi batch tiếp sau lô đầu cho đến khi hết (tránh thiếu đơn nếu không bấm «Tải thêm»). */
  const [ffmBackgroundLoading, setFfmBackgroundLoading] = useState(false);
  const ffmLoadGenRef = useRef(0);

  const [selection, setSelection] = useState({ startRow: null, startCol: null, endRow: null, endCol: null });
  const [copiedData, setCopiedData] = useState(null);
  const [copiedSelection, setCopiedSelection] = useState(null);
  const isSelecting = useRef(false);
  // Cache cell elements for smoother drag-selection (avoid scanning all td per frame).
  const ffmDragCellMapRef = useRef(null); // Map<"r-c", HTMLTableCellElement>
  const ffmDragPrevBoundsRef = useRef(null); // { minR, maxR, minC, maxC } | null
  const tableRef = useRef(null);
  const ffmScrollContainerRef = useRef(null);
  const ffmHeaderContainerRef = useRef(null);
  const headerTableRef = useRef(null);
  const dragAnchorRef = useRef({ r: 0, c: 0 });
  const dragEndRef = useRef({ r: 0, c: 0 });
  const dragListenersRef = useRef({ move: null, up: null });
  const fillListenersRef = useRef({ move: null, up: null });
  const dragStartClientRef = useRef({ x: 0, y: 0 });
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);

  const [mgtNoiBoOrder, setMgtNoiBoOrder] = useState([]);
  const [canViewHaNoi, setCanViewHaNoi] = useState(false); // User có quyền xem tab Hà Nội không (dựa trên can_day_ffm)

  const updateQueue = useRef(new Map()); // Legacy

  const changeHistoryRef = useRef([]); // Stack for Ctrl-Z
  const historyIndexRef = useRef(-1);
  const dbQueueRef = useRef([]); // FIFO Queue for Backend
  const isProcessingQueue = useRef(false);
  const manualSaveRequestedRef = useRef(false); // Chỉ lưu DB khi user bấm "Xác nhận lưu"

  const ffmRealtimeOrderCodesRef = useRef(new Set()); // Track order_code values pending a fetch
  const ffmRealtimeFetchTimerRef = useRef(null); // setTimeout handle for batching realtime events

  const [toasts, setToasts] = useState([]);
  const toastIdCounter = useRef(0);

  // Kiểm tra quyền xem tab "Hà Nội" dựa trên cột can_day_ffm trong users table
  const loadCanDayFFMPermission = async () => {
    try {
      const userEmail = localStorage.getItem('userEmail') || '';
      const userId = localStorage.getItem('userId') || '';

      if (!userEmail && !userId) {
        console.log('⚠️ [FFM] No user email or ID found');
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
        console.error('❌ [FFM] Error loading can_day_ffm:', error);
        setCanViewHaNoi(false);
        return;
      }

      const hasPermission = userData?.can_day_ffm === true;
      console.log('🔐 [FFM] User can_day_ffm:', hasPermission);
      setCanViewHaNoi(hasPermission);
    } catch (error) {
      console.error('❌ [FFM] Error checking can_day_ffm permission:', error);
      setCanViewHaNoi(false);
    }
  };

  useEffect(() => {
    loadData();
    loadCanDayFFMPermission();
    const storedChanges = localStorage.getItem(FFM_HCM_PENDING_LS_KEY);
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
        setPendingChanges(map);
        // Không tự gửi DB khi load — user bấm «Xác nhận lưu» (tránh lưu ngầm sau khi sửa bảng).
        dbQueueRef.current = [];
      } catch (e) {
        console.error('Error loading pending changes', e);
      }
    }
  }, []);

  useEffect(() => {
    // Auto-sync data changes made from "outside" (e.g., another tab/admin) into current grid.
    // We only patch rows that are already present in `allData` to avoid breaking pagination/sort.
    let cancelled = false;

    const flushRealtimeUpdates = async () => {
      if (cancelled) return;

      const orderCodes = Array.from(ffmRealtimeOrderCodesRef.current);
      ffmRealtimeOrderCodesRef.current.clear();
      ffmRealtimeFetchTimerRef.current = null;

      if (orderCodes.length === 0) return;

      try {
        const { data, error } = await supabase
          .from(FFM_HCM_SUPABASE_TABLE)
          .select('*')
          .in('order_code', orderCodes);

        if (error) throw error;
        const appRows = (data || []).map((r) => API.mapSupabaseOrderToApp(r));

        setAllData((prev) => {
          const mapById = new Map();
          for (const r of appRows) {
            const id = r?.[PRIMARY_KEY_COLUMN];
            if (id) mapById.set(id, r);
          }
          if (mapById.size === 0) return prev;

          const next = prev.map((row) => {
            const id = row?.[PRIMARY_KEY_COLUMN];
            if (!id || !mapById.has(id)) return row;
            return { ...row, ...mapById.get(id) };
          });
          return next;
        });
      } catch (e) {
        console.error('[FFM] realtime orders sync failed:', e);
      }
    };

    const channel = supabase
      .channel(`ffm-orders-${variant}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: FFM_HCM_SUPABASE_TABLE },
        (payload) => {
          const orderCode = payload?.new?.order_code;
          if (!orderCode) return;

          ffmRealtimeOrderCodesRef.current.add(orderCode);
          if (ffmRealtimeFetchTimerRef.current) return;

          ffmRealtimeFetchTimerRef.current = setTimeout(() => {
            void flushRealtimeUpdates();
          }, 250);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (ffmRealtimeFetchTimerRef.current) {
        clearTimeout(ffmRealtimeFetchTimerRef.current);
        ffmRealtimeFetchTimerRef.current = null;
      }
      channel.unsubscribe();
    };
  }, [variant]);

  // Tự động chuyển về "all" nếu user đang ở tab Hà Nội nhưng không có quyền
  useEffect(() => {
    if ((omActiveTeam === 'Hà Nội' || omActiveTeam === 'Hanoi') && !canViewHaNoi) {
      console.log('⚠️ [FFM] User không có quyền xem Hà Nội, chuyển về "all"');
      setOmActiveTeam('all');
    }
  }, [canViewHaNoi, omActiveTeam]);


  const addToast = (message, type, duration = 3000) => {
    const id = ++toastIdCounter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
    return id;
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      let date;
      const str = String(dateString).trim();

      // Xử lý định dạng dd/mm/yyyy hoặc d/m/yyyy
      if (str.includes('/')) {
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
      // Xử lý định dạng yyyy-mm-dd
      else if (str.includes('-')) {
        date = new Date(str);
      }
      // Xử lý ISO string hoặc các định dạng khác
      else {
        date = new Date(str.includes('Z') ? str : str + 'Z');
      }

      if (isNaN(date.getTime())) {
        // Thử parse lại với các định dạng khác
        date = new Date(str);
        if (isNaN(date.getTime())) return str; // Trả về nguyên bản nếu không parse được
      }

      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (e) {
      return String(dateString);
    }
  };

  /** Giá trị ô xuất Excel — khớp render bảng + thay đổi pending. */
  const getFfmExportCellValue = useCallback(
    (row, col) => {
      const orderId = row[PRIMARY_KEY_COLUMN];
      const key = COLUMN_MAPPING[col] || col;
      let val = '';
      if (col === 'Mã Tracking') {
        val = row['Mã Tracking'] ?? row['tracking_code'] ?? row.tracking_code ?? '';
      } else if (col === 'Ngày đẩy đơn') {
        val = row['time_dayon'] ?? row.time_dayon ?? row['Ngày đẩy đơn'] ?? row[key] ?? '';
      } else if (col === 'Ngày có mã tracking') {
        const raw = getTrackingDateRawFFM(row);
        val = row['Ngày có mã tracking'] ?? extractDateFromDateTime(raw) ?? raw ?? '';
      } else {
        val = row[key] ?? row[col] ?? row[col.replace(/ /g, '_')] ?? '';
      }
      const pendingInfo = pendingChanges.get(orderId)?.get(key);
      if (pendingInfo) val = pendingInfo.newValue;
      const dateCols = [
        'Ngày lên đơn',
        'Ngày đóng hàng',
        'Ngày đẩy đơn',
        'Ngày có mã tracking',
        'Ngày Kế toán đối soát với FFM lần 2',
      ];
      if (dateCols.includes(col)) {
        return formatDate(val);
      }
      return val === null || val === undefined ? '' : String(val);
    },
    [pendingChanges]
  );

  const getTodayYmd = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const loadData = async () => {
    ffmLoadGenRef.current += 1;
    const loadGen = ffmLoadGenRef.current;

    setLoading(true);
    setFfmHasMore(false);
    setFfmBackgroundLoading(false);
    try {
      if (typeof API.fetchFFMOrdersBatch === 'function') {
        ffmMergeRef.current = new Map();
        ffmCursorRef.current = {
          mgtFrom: 0,
          trackedFrom: 0,
          mgtExhausted: false,
          trackedExhausted: false
        };

        const b = await API.fetchFFMOrdersBatch({
          mgtFrom: 0,
          trackedFrom: 0,
          pageSize: FFM_FIRST_BATCH_SIZE,
          mgtExhausted: false,
          trackedExhausted: false,
          ordersTable: FFM_HCM_SUPABASE_TABLE
        });

        if (loadGen !== ffmLoadGenRef.current) return;

        ffmCursorRef.current = {
          mgtFrom: b.nextMgtFrom,
          trackedFrom: b.nextTrackedFrom,
          mgtExhausted: b.mgtExhausted,
          trackedExhausted: b.trackedExhausted
        };

        for (const r of b.rows) {
          const id = r[PRIMARY_KEY_COLUMN];
          if (id) ffmMergeRef.current.set(id, r);
        }

        const mergedList = assignRowIndexByOrderDate(Array.from(ffmMergeRef.current.values()));
        setAllData(mergedList);

        const hasMore = !b.mgtExhausted || !b.trackedExhausted;
        setFfmHasMore(hasMore);

        if (mergedList.length > 0) {
          const sample = mergedList[0];
          console.log('🔍 [FFM] Sample data keys:', Object.keys(sample));
          const withTracking = mergedList.filter((row) => {
            const tc = String(row['tracking_code'] || row['Mã Tracking'] || row.tracking_code || '').trim();
            return tc !== '' && tc !== 'null' && tc !== 'undefined';
          });
          console.log(`📊 [FFM] Lô 1: ${mergedList.length} đơn, ${withTracking.length} có mã tracking`);
        }

        if (mergedList.length === 2 && mergedList[0][PRIMARY_KEY_COLUMN] === 'DEMO001') {
          addToast('⚠️ Đang sử dụng dữ liệu demo do API lỗi. Kiểm tra kết nối mạng.', 'error', 8000);
        } else if (hasMore) {
          addToast(
            `✅ Hiển thị ${mergedList.length} đơn trước — đang tải đầy đủ trong nền.`,
            'success',
            3500
          );
          setFfmBackgroundLoading(true);
          void (async () => {
            try {
              while (loadGen === ffmLoadGenRef.current) {
                const c = ffmCursorRef.current;
                if (c.mgtExhausted && c.trackedExhausted) break;

                const next = await API.fetchFFMOrdersBatch({
                  mgtFrom: c.mgtFrom,
                  trackedFrom: c.trackedFrom,
                  pageSize: FFM_NEXT_BATCH_SIZE,
                  mgtExhausted: c.mgtExhausted,
                  trackedExhausted: c.trackedExhausted,
                  ordersTable: FFM_HCM_SUPABASE_TABLE
                });

                if (loadGen !== ffmLoadGenRef.current) return;

                ffmCursorRef.current = {
                  mgtFrom: next.nextMgtFrom,
                  trackedFrom: next.nextTrackedFrom,
                  mgtExhausted: next.mgtExhausted,
                  trackedExhausted: next.trackedExhausted
                };

                for (const r of next.rows) {
                  const id = r[PRIMARY_KEY_COLUMN];
                  if (id) ffmMergeRef.current.set(id, r);
                }

                const fullList = assignRowIndexByOrderDate(Array.from(ffmMergeRef.current.values()));
                setAllData(fullList);
              }

              if (loadGen === ffmLoadGenRef.current) {
                setFfmHasMore(false);
                const n = ffmMergeRef.current.size;
                addToast(`✅ Đã tải đủ ${n} đơn FFM`, 'success', 2500);
              }
            } catch (bgErr) {
              console.error('[FFM] Tải nền:', bgErr);
              if (loadGen === ffmLoadGenRef.current) {
                const c = ffmCursorRef.current;
                setFfmHasMore(!c.mgtExhausted || !c.trackedExhausted);
                addToast(
                  `⚠️ Tải nền lỗi: ${bgErr.message || bgErr}. Bấm «Tải thêm đơn» để thử tiếp.`,
                  'error',
                  6500
                );
              }
            } finally {
              if (loadGen === ffmLoadGenRef.current) {
                setFfmBackgroundLoading(false);
              }
            }
          })();
        } else {
          addToast(`✅ Đã tải ${mergedList.length} đơn hàng`, 'success', 2000);
        }
      } else {
        const data = await API.fetchFFMOrders?.({ ordersTable: FFM_HCM_SUPABASE_TABLE });
        const list = Array.isArray(data) ? assignRowIndexByOrderDate(data) : [];
        setAllData(list);
        setFfmHasMore(false);
        if (list.length === 2 && list[0][PRIMARY_KEY_COLUMN] === 'DEMO001') {
          addToast('⚠️ Đang sử dụng dữ liệu demo do API lỗi. Kiểm tra kết nối mạng.', 'error', 8000);
        } else {
          addToast(`✅ Đã tải ${list.length} đơn hàng`, 'success', 2000);
        }
      }
    } catch (error) {
      console.error('Load data error:', error);
      addToast(`❌ Lỗi tải dữ liệu: ${error.message}. Thử fallback...`, 'error', 4000);
      try {
        const data = await API.fetchFFMOrders({ ordersTable: FFM_HCM_SUPABASE_TABLE });
        const list = Array.isArray(data) ? assignRowIndexByOrderDate(data) : [];
        setAllData(list);
        setFfmHasMore(false);
        addToast(`✅ Fallback HCM: ${list.length} đơn`, 'success', 2000);
      } catch (e2) {
        addToast(`❌ ${e2.message || 'Không tải được dữ liệu.'}`, 'error', 8000);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMoreFfmData = async () => {
    if (!ffmHasMore || loadingMore || loading || ffmBackgroundLoading) return;
    if (typeof API.fetchFFMOrdersBatch !== 'function') return;

    setLoadingMore(true);
    try {
      const c = ffmCursorRef.current;
      const b = await API.fetchFFMOrdersBatch({
        mgtFrom: c.mgtFrom,
        trackedFrom: c.trackedFrom,
        pageSize: FFM_NEXT_BATCH_SIZE,
        mgtExhausted: c.mgtExhausted,
        trackedExhausted: c.trackedExhausted,
        ordersTable: FFM_HCM_SUPABASE_TABLE
      });

      ffmCursorRef.current = {
        mgtFrom: b.nextMgtFrom,
        trackedFrom: b.nextTrackedFrom,
        mgtExhausted: b.mgtExhausted,
        trackedExhausted: b.trackedExhausted
      };

      for (const r of b.rows) {
        const id = r[PRIMARY_KEY_COLUMN];
        if (id) ffmMergeRef.current.set(id, r);
      }

      const mergedList = assignRowIndexByOrderDate(Array.from(ffmMergeRef.current.values()));
      setAllData(mergedList);

      const hasMore = !b.mgtExhausted || !b.trackedExhausted;
      setFfmHasMore(hasMore);

      addToast(
        hasMore
          ? `Đã gộp thêm — hiện ${mergedList.length} đơn (còn dữ liệu, bấm tiếp nếu cần).`
          : `Đã tải xong — ${mergedList.length} đơn.`,
        'success',
        2500
      );
    } catch (err) {
      console.error('loadMoreFfmData error:', err);
      addToast(`❌ Lỗi tải thêm: ${err.message}`, 'error', 5000);
    } finally {
      setLoadingMore(false);
    }
  };

  const refreshData = async () => {
    dbQueueRef.current = [];
    setPendingChanges(new Map());
    const defaultFilters = {
      market: [],
      product: [],
      tracking_include: '',
      tracking_exclude: '',
      tracking_status: 'Tình trạng mã',
      ['Kết quả Check']: [],
      packing_date_status: 'Tất cả',
      delivery_status_filter: 'Tất cả',
      delivery_status_search: '',
      us_shipping_fee_search: ''
    };
    setFilterValues(defaultFilters);
    setLocalFilterValues(defaultFilters);
    setDateFrom('');
    setDateTo('');
    setFfmBranchFilter('all');
    setFfmTrackingPresence('all');
    setCurrentPage(1);
    savePendingToLocalStorage(new Map());
    await loadData();
  };
  const savePendingToLocalStorage = (newPending, newLegacy = new Map()) => {
    const combined = new Map([...newLegacy, ...newPending]);
    const changesToSave = {};
    if (combined && combined.size > 0) {
      combined.forEach((val, id) => {
        changesToSave[id] = Object.fromEntries(val);
      });
    }
    localStorage.setItem(FFM_HCM_PENDING_LS_KEY, JSON.stringify(changesToSave));
  };

  const deepCloneMapOfMaps = useCallback((sourceMap) => {
    const clone = new Map();
    if (sourceMap) {
      sourceMap.forEach((innerMap, key) => { clone.set(key, new Map(innerMap)); });
    }
    return clone;
  }, []);

  // Filter columns based on visibility
  const currentColumns = useMemo(() => {
    return ffmColumns.filter(col => visibleColumns[col] === true);
  }, [ffmColumns, visibleColumns]);

  // Số cột cố định khi kéo ngang (freeze từ trái sang phải)
  const effectiveFixedColumns = useMemo(() => {
    const raw = Number(fixedColumns);
    const n = Number.isFinite(raw) ? Math.floor(raw) : 0;
    return Math.max(0, Math.min(n, currentColumns.length));
  }, [fixedColumns, currentColumns.length]);

  // Nếu số cột hiển thị giảm, tự clamp lại fixedColumns
  useEffect(() => {
    setFixedColumns((prev) => {
      const n = Math.floor(Number(prev) || 0);
      return Math.max(0, Math.min(n, currentColumns.length));
    });
  }, [currentColumns.length]);

  // Save column visibility to localStorage
  useEffect(() => {
    if (Object.keys(visibleColumns).length > 0) {
      localStorage.setItem(visibleColumnsStorageKey, JSON.stringify(visibleColumns));
    }
  }, [visibleColumns, visibleColumnsStorageKey]);

  /** Dữ liệu nền cho FILTER: chỉ dùng dữ liệu gốc + cột ngày suy ra (không trộn pending). */
  const ffmEnrichedRowsForFilter = useMemo(() => {
    const n = allData.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = allData[i];
      const rowCopy = { ...row };

      rowCopy['Ngày đẩy đơn'] = extractDateFromDateTime(row['time_dayon'] || row.time_dayon || row['Ngày Kế toán đối soát với FFM lần 2']);

      const rawTrackingDate = getTrackingDateRawFFM(row);
      rowCopy['Ngày có mã tracking'] = extractDateFromDateTime(rawTrackingDate);
      out[i] = rowCopy;
    }
    return out;
  }, [allData]);

  /** Dữ liệu nền cho RENDER: có trộn pending để thể hiện ngay thay đổi (Thêm nhanh / Cập nhật hàng loạt). */
  const ffmEnrichedRowsForRender = useMemo(() => {
    const n = allData.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = allData[i];
      const orderId = row[PRIMARY_KEY_COLUMN];
      const rowCopy = { ...row };

      // Overlay pending trước để các cột suy ra (derived) phản ánh đúng giá trị vừa sửa.
      const pending = orderId ? pendingChanges.get(orderId) : undefined;
      if (pending) {
        pending.forEach((info, key) => {
          rowCopy[key] = info.newValue;
        });
      }

      rowCopy['Ngày đẩy đơn'] = extractDateFromDateTime(
        rowCopy['time_dayon'] || rowCopy.time_dayon || rowCopy['Ngày Kế toán đối soát với FFM lần 2']
      );

      const rawTrackingDate = getTrackingDateRawFFM(rowCopy);
      rowCopy['Ngày có mã tracking'] = extractDateFromDateTime(rawTrackingDate);

      out[i] = rowCopy;
    }
    return out;
  }, [allData, pendingChanges]);

  const ffmRenderRowMap = useMemo(() => {
    const m = new Map();
    for (const r of ffmEnrichedRowsForRender) {
      const id = r[PRIMARY_KEY_COLUMN];
      if (id) m.set(id, r);
    }
    return m;
  }, [ffmEnrichedRowsForRender]);
  const applyFfmFilters = useCallback((sourceRows, fv) => {
    let data = sourceRows;

    if (variant === 'TT') {
      data = data.filter(isFfmTtCarrierRow);
    }

    // ORDER_MANAGEMENT filtering
    {
      // FFM: API giữ đơn có mã tracking HOẶC đơn vị vận chuyển MGT/T&T (không cần Kết quả Check=OK)
      // Tracking code được filter ở client-side theo tab đã chọn
      // Thứ tự nguồn đã theo rowIndex (assignRowIndexByOrderDate) — filter giữ nguyên thứ tự, không sort lại.

      if (omActiveTeam === 'mgt_noi_bo') {
        const orderedIds = new Set(mgtNoiBoOrder);
        data = data.filter((row) => orderedIds.has(row[PRIMARY_KEY_COLUMN]));
      } else if (omActiveTeam !== 'all') {
        data = data.filter((row) => row[TEAM_COLUMN_NAME] === omActiveTeam);
      }

      // Lọc Chi nhánh (Hà Nội / HCM) — thanh bộ lọc FFM
      if (ffmBranchFilter !== 'all') {
        data = data.filter((row) => matchesFfmBranchFilter(getTeamStringFFM(row), ffmBranchFilter));
      }
    }

    const activeDateType = omDateType;

    if (fv.market.length > 0) {
      const set = new Set(fv.market);
      data = data.filter((row) => set.has(row['Khu vực'] || row['khu vực']));
    }
    if (fv.product.length > 0) {
      const set = new Set(fv.product);
      data = data.filter((row) => set.has(row['Mặt hàng']));
    }

    if (dateFrom) {
      const fromYmd = dateFrom;
      data = data.filter((row) => {
        const cellYmd = getOmDateYmdFromRow(row, activeDateType);
        if (!cellYmd) return false;
        return cellYmd >= fromYmd;
      });
    }
    if (dateTo) {
      const toYmd = dateTo;
      data = data.filter((row) => {
        const cellYmd = getOmDateYmdFromRow(row, activeDateType);
        if (!cellYmd) return false;
        return cellYmd <= toYmd;
      });
    }

    Object.entries(fv).forEach(([key, val]) => {
      if (FFM_FILTER_SKIP_KEYS.has(key)) return;
      if (Array.isArray(val) && val.length === 0) return;
      if (typeof val === 'string' && val.trim() === '') return;

      const dataKey = COLUMN_MAPPING[key] || key;
      const isDateColFilter = ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking'].includes(key);

      // MultiSelect (dạng mảng) phải match đúng theo danh sách đã chọn,
      // tránh rơi vào nhánh substring và dẫn đến cảm giác "lọc tự ý".
      if (Array.isArray(val)) {
        data = data.filter((row) => {
          let cellValue =
            row[dataKey] ?? row[key] ?? row[key.replace(/ /g, '_')] ?? row[dataKey.replace(/ /g, '_')] ?? '';
          cellValue = String(cellValue).trim();
          const selected = val;
          if (selected.length === 0) return true;
          if (cellValue === '' && selected.includes('__EMPTY__')) return true;
          return selected.includes(cellValue);
        });
        return;
      }

      if (isDateColFilter) {
        const filterYmd = normalizeToYmdForCompare(val);
        if (!filterYmd) return;
        data = data.filter((row) => {
          let cellYmd = '';
          if (key === 'Ngày có mã tracking') {
            const raw = getTrackingDateRawFFM(row);
            const v = row['Ngày có mã tracking'] || extractDateFromDateTime(raw) || raw;
            cellYmd = normalizeToYmdForCompare(v);
          } else if (key === 'Ngày đẩy đơn') {
            const v = row['time_dayon'] || row.time_dayon || row['Ngày đẩy đơn'];
            cellYmd = normalizeToYmdForCompare(v);
          } else {
            const cellValue = row[dataKey] ?? row[key] ?? row[key.replace(/ /g, '_')] ?? row[dataKey.replace(/ /g, '_')] ?? '';
            cellYmd = normalizeToYmdForCompare(String(cellValue).trim());
          }
          if (!cellYmd) return false;
          // Ô date trên tiêu đề cột = đúng ngày đó (không phải «từ ngày» — khoảng ngày dùng Từ/Tới + Bộ lọc theo ngày).
          return cellYmd === filterYmd;
        });
        return;
      }

      const valSearchLower = String(val).trim().toLowerCase();

      data = data.filter((row) => {
        let cellValue = row[dataKey] ?? row[key] ?? row[key.replace(/ /g, '_')] ?? row[dataKey.replace(/ /g, '_')] ?? '';
        cellValue = String(cellValue).trim();

        if (DROPDOWN_OPTIONS[dataKey] || DROPDOWN_OPTIONS[key] || ['Trạng thái giao hàng', 'Kết quả check', 'GHI CHÚ'].includes(dataKey)) {
          const selected = val;
          if (selected.length === 0) return true;
          if (cellValue === '' && selected.includes('__EMPTY__')) return true;
          return selected.includes(cellValue);
        }

        return cellValue.toLowerCase().includes(valSearchLower);
      });
    });

    // Handle Dropdown Filters: Packing Date, Delivery Status, Shipping Fee
    if (fv.packing_date_status && fv.packing_date_status !== 'Tất cả') {
      const status = fv.packing_date_status;
      const today = getTodayDateStr();
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;
      const customDate = fv['Ngày đóng hàng'];

      data = data.filter(row => {
        const val = row['Ngày đóng hàng'] || '';
        if (status === 'Trống') return !val || String(val).trim() === '';

        const dateStr = extractDateFromDateTime(val);
        if (status === 'Hôm nay') return dateStr === today;
        if (status === 'Hôm qua') return dateStr === yesterday;
        if (status === 'Ngày cụ thể' && customDate) return dateStr === customDate;
        return true;
      });
    }

    if (fv.delivery_status_filter && fv.delivery_status_filter !== 'Tất cả') {
      const status = fv.delivery_status_filter;
      const search = fv.delivery_status_search ? String(fv.delivery_status_search).trim().toLowerCase() : '';

      data = data.filter(row => {
        const val = String(row['Trạng thái giao hàng'] || '').trim();
        if (status === 'Trống') return val === '' || val === 'null';
        if (status === 'Tìm kiếm...') {
          return search ? val.toLowerCase().includes(search) : true;
        }
        return val === status;
      });
    }

    const shipFeeSearch =
      fv.us_shipping_fee_search != null && String(fv.us_shipping_fee_search).trim() !== ''
        ? String(fv.us_shipping_fee_search).trim().toLowerCase()
        : '';
    if (shipFeeSearch) {
      data = data.filter((row) => {
        const rawNgay = API.normalizeNgayDoiSoatKeToanText(
          row['Ngày đối soát kế toán'] ||
          row.warehouse_fee ||
          row.luu_kho_usd ||
          row.shipping_fee
        );
        const rawShip =
          row['Phí ship nội địa Mỹ (usd)'] ||
          row['Phí_ship_nội_địa_Mỹ_(usd)'] ||
          '';
        const rawVal = rawNgay || rawShip;
        return String(rawVal).trim().toLowerCase().includes(shipFeeSearch);
      });
    }

    if (fv.tracking_status || fv.tracking_include || fv.tracking_exclude) {
      const inc = fv.tracking_include ? String(fv.tracking_include).trim().toLowerCase() : '';
      const exc = fv.tracking_exclude ? String(fv.tracking_exclude).trim().toLowerCase() : '';
      const status = fv.tracking_status || 'Tình trạng mã';
      const incMultiLine = inc && inc.includes('\n');
      const incLinesSet = incMultiLine
        ? new Set(inc.split('\n').map((t) => t.trim()).filter(Boolean).map((t) => t.toLowerCase()))
        : null;

      data = data.filter((row) => {
        // Kiểm tra cả tracking_code (database) và Mã Tracking (display name)
        const code = String(row['tracking_code'] || row['Mã Tracking'] || '').trim();
        const lowerCode = code.toLowerCase();

        // Status Filter Logic
        if (status === 'Tất cả có mã' && code === '') return false;
        if (status === 'Trống' && code !== '') return false;
        if (status === 'Toàn số' && (code === '' || !/^\d+$/.test(code))) return false;

        // Only apply include/exclude if in 'Tình trạng mã' state
        if (status === 'Tình trạng mã') {
          if (exc && lowerCode.includes(exc)) return false;
          if (inc) {
            if (incLinesSet) {
              if (!incLinesSet.has(lowerCode)) return false;
            } else if (!lowerCode.includes(inc)) {
              return false;
            }
          }
        }
        return true;
      });
    }

    // Filter by tracking code status - This logic is now handled by filterValues.tracking_status
    // if (trackingFilter === 'with_tracking') {
    //   data = data.filter((row) => {
    //     // Kiểm tra cả tracking_code (database) và Mã Tracking (display name)
    //     const trackingCode = String(row['tracking_code'] || row['Mã Tracking'] || row.tracking_code || '').trim();
    //     const hasTracking = trackingCode !== '' && trackingCode !== 'null' && trackingCode !== 'undefined';
    //     if (hasTracking) {
    //       console.log('✅ [Filter] Đơn có tracking:', row['Mã đơn hàng'] || row.order_code, 'tracking:', trackingCode);
    //     }
    //     return hasTracking;
    //   });
    //   console.log(`📊 [Filter] Tab "Có mã": ${data.length} đơn có tracking code`);
    // } else if (trackingFilter === 'without_tracking') {
    //   data = data.filter((row) => {
    //     // Kiểm tra cả tracking_code (database) và Mã Tracking (display name)
    //     const trackingCode = String(row['tracking_code'] || row['Mã Tracking'] || row.tracking_code || '').trim();
    //     return trackingCode === '' || trackingCode === 'null' || trackingCode === 'undefined';
    //   });
    // }
    // 'all' - không lọc, hiển thị tất cả

    // Tình trạng mã Tracking: Có mã / Chưa có mã (bộ lọc nhanh FFM)
    if (ffmTrackingPresence === 'has') {
      data = data.filter((row) => {
        const code = getTrackingCodeFFM(row);
        return code !== '' && code !== 'null' && code !== 'undefined';
      });
    } else if (ffmTrackingPresence === 'no') {
      data = data.filter((row) => {
        const code = getTrackingCodeFFM(row);
        return code === '' || code === 'null' || code === 'undefined';
      });
    }

    // Lọc dựa trên data gốc (không pending), sau đó map sang row có pending để UI thể hiện ngay thay đổi.
    return data.map((row) => ffmRenderRowMap.get(row[PRIMARY_KEY_COLUMN]) || row);
  }, [ffmRenderRowMap, omActiveTeam, omDateType, dateFrom, dateTo, mgtNoiBoOrder, ffmBranchFilter, ffmTrackingPresence, variant]);

  const getFilteredData = useMemo(() => {
    return applyFfmFilters(ffmEnrichedRowsForFilter, deferredFilterValues);
  }, [applyFfmFilters, ffmEnrichedRowsForFilter, deferredFilterValues]);

  /** Xóa mọi lọc hiển thị (ô dưới tiêu đề cột, Từ/Tới ngày, bộ lọc nhanh) — không tải lại DB, không xóa thay đổi chưa lưu. */
  const clearFfmDisplayFilters = useCallback(() => {
    const next = {
      market: [],
      product: [],
      tracking_include: '',
      tracking_exclude: '',
      tracking_status: 'Tình trạng mã',
      ['Kết quả Check']: [],
      packing_date_status: 'Tất cả',
      delivery_status_filter: 'Tất cả',
      delivery_status_search: '',
      us_shipping_fee_search: ''
    };
    ffmColumns.forEach((col) => {
      if (col === 'STT') return;
      if (col === 'Khu vực' || col === 'Mặt hàng') return;
      if (Object.prototype.hasOwnProperty.call(next, col)) return;
      const multi =
        !!DROPDOWN_OPTIONS[col] ||
        [
          'Trạng thái giao hàng NB',
          'Trạng thái thu tiền',
          'Trạng thái giao hàng',
          'Payment Bill',
          'Trạng thái cskh',
          'GHI CHÚ'
        ].includes(col);
      next[col] = multi ? [] : '';
    });
    setLocalFilterValues(next);
    setDateFrom('');
    setDateTo('');
    setFfmBranchFilter('all');
    setFfmTrackingPresence('all');
    setOmActiveTeam('all');
    setCurrentPage(1);
    addToast('Đã xóa bộ lọc hiển thị (giữ nguyên dữ liệu đã tải).', 'success', 2500);
  }, [ffmColumns, addToast]);

  const handleExportFilteredExcel = useCallback(() => {
    const rows = applyFfmFilters(ffmEnrichedRowsForFilter, localFilterValues);
    if (!rows.length) {
      addToast('Không có dữ liệu phù hợp bộ lọc để xuất.', 'error');
      return;
    }
    const dataToExport = rows.map((row) => {
      const obj = {};
      for (const col of FFM_EXCEL_EXPORT_COLUMNS) {
        obj[col] = getFfmExportCellValue(row, col);
      }
      return obj;
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const sheetTag =
      variant === 'TT' ? 'FFM_TT' : variant === 'MGT_HCM' ? 'FFM_MGT_HCM' : 'FFM_MGT';
    XLSX.utils.book_append_sheet(wb, ws, sheetTag);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    XLSX.writeFile(wb, `${sheetTag}_loc_${stamp}.xlsx`);
    addToast(`Đã xuất ${rows.length} dòng ra Excel.`, 'success');
  }, [applyFfmFilters, ffmEnrichedRowsForFilter, localFilterValues, getFfmExportCellValue, addToast, variant]);

  const getUniqueValues = useMemo(() => (key) => {
    const values = new Set();
    const keyMapped = COLUMN_MAPPING[key] || key;
    allData.forEach((row) => {
      const val = String(row[key] || row[keyMapped] || row[key.replace(/ /g, '_')] || '').trim();
      if (val) values.add(val);
    });
    return Array.from(values).sort();
  }, [allData]);

  // Teams list - chỉ hiển thị Hà Nội nếu user có quyền
  const teams = useMemo(() => {
    const allTeams = getUniqueValues('Team');
    // Chỉ thêm Hà Nội vào danh sách nếu user có quyền xem
    const teamsList = [...allTeams];
    if (canViewHaNoi && !teamsList.includes('Hà Nội') && !teamsList.includes('Hanoi')) {
      teamsList.push('Hà Nội');
    }
    // Loại trừ Hà Nội nếu user không có quyền
    return teamsList.filter(t => {
      if (t === 'Hà Nội' || t === 'Hanoi') {
        return canViewHaNoi;
      }
      return true;
    });
  }, [getUniqueValues, canViewHaNoi]);

  const getMultiSelectOptions = (col) => {
    const key = COLUMN_MAPPING[col] || col;
    if (DROPDOWN_OPTIONS[col]) return ['__EMPTY__', ...DROPDOWN_OPTIONS[col]];
    if (DROPDOWN_OPTIONS[key]) return ['__EMPTY__', ...DROPDOWN_OPTIONS[key]];
    return ['__EMPTY__', ...getUniqueValues(col)];
  };


  const processDbQueue = useCallback(async () => {
    if (!manualSaveRequestedRef.current) return;
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
            await API.updateSingleCell(row[PRIMARY_KEY_COLUMN], col, row[col], currentUsername, {
              sourceTable: FFM_HCM_SUPABASE_TABLE
            });
            success = true;
          } catch (e) {
            addToast(e.message, 'error');
          } finally {
            removeToast(toastId);
          }
        } else {
          const toastId = addToast(`Đang cập nhật ${rowsToUpdate.length} đơn hàng...`, 'loading', 0);
          try {
            const res = await API.updateBatch(rowsToUpdate, currentUsername, null, {
              sourceTable: FFM_HCM_SUPABASE_TABLE
            });
            if (res.success) success = true;
          } catch (e) {
            addToast(e.message, 'error');
          } finally {
            removeToast(toastId);
          }
        }

        if (success) {
          setAllData(prevData => {
            const latestData = [...prevData];
            rowsToUpdate.forEach(updatedRow => {
              const idx = latestData.findIndex(r => r[PRIMARY_KEY_COLUMN] === updatedRow[PRIMARY_KEY_COLUMN]);
              if (idx > -1) latestData[idx] = { ...latestData[idx], ...updatedRow };
            });
            return latestData;
          });

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
      manualSaveRequestedRef.current = false;
    }
  }, [addToast, removeToast, deepCloneMapOfMaps]);

  /**
   * @param {Array} changesArray
   * @param {{ deferDbSave?: boolean }} options — deferDbSave: true = chỉ UI + localStorage (sửa trực tiếp trên bảng / dán); false = đưa vào hàng đợi DB (vd. Thêm nhanh).
   */
  const pushChange = useCallback((changesArray, options = {}) => {
    const { deferDbSave = false } = options;
    if (!changesArray || changesArray.length === 0) return;

    // 1. History Stack
    const currentIndex = historyIndexRef.current;
    const currentHist = changeHistoryRef.current;
    const newHistory = currentHist.slice(0, currentIndex + 1);

    newHistory.push({ timestamp: Date.now(), changes: changesArray });
    const finalHistory = newHistory.slice(-50);
    changeHistoryRef.current = finalHistory;
    historyIndexRef.current = finalHistory.length - 1;

    // 2. DB queue (chỉ khi không trì hoãn — sửa bảng phải bấm «Xác nhận lưu»)
    if (!deferDbSave) {
      dbQueueRef.current.push(...changesArray);
    }

    setPendingChanges(prev => {
      const next = deepCloneMapOfMaps(prev);
      changesArray.forEach(({ orderId, colKey, newValue, originalValue }) => {
        if (!next.has(orderId)) next.set(orderId, new Map());
        next.get(orderId).set(colKey, { newValue, originalValue });
      });
      savePendingToLocalStorage(next);
      return next;
    });

    if (!deferDbSave) {
      setTimeout(() => processDbQueue(), 10);
    }
  }, [deepCloneMapOfMaps, processDbQueue]);

  const handleUndo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    if (currentIndex < 0) {
      addToast('Không có thay đổi nào để hoàn tác', 'info', 2000);
      return;
    }

    const currentSnapshot = changeHistoryRef.current[currentIndex];

    const undoChanges = currentSnapshot.changes.map(change => ({
      orderId: change.orderId,
      colKey: change.colKey,
      newValue: change.originalValue,
      originalValue: change.newValue
    }));

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
  }, [addToast, deepCloneMapOfMaps]);

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
  }, [addToast, deepCloneMapOfMaps]);

  const handleCellChange = useCallback((orderId, colKey, newValue) => {
    const originalRow = allData.find((r) => r[PRIMARY_KEY_COLUMN] === orderId);
    const baseValue = originalRow ? String(originalRow[colKey] ?? '') : '';

    const pendingVal = pendingChanges.get(orderId)?.get(colKey);
    const stepOriginalValue = pendingVal ? pendingVal.newValue : baseValue;

    const isThoiGianGiaoDuKien =
      colKey === 'Thời gian giao dự kiến' ||
      colKey === 'thoigiangiaohangffm' ||
      colKey === 'estimated_delivery_date';

    if (isThoiGianGiaoDuKien) {
      const nextValue = newValue == null ? '' : String(newValue);
      if (nextValue === String(stepOriginalValue ?? '')) return;
      const changes = [
        { orderId, colKey, originalValue: String(stepOriginalValue ?? ''), newValue: nextValue },
      ];
      pushChange(changes, { deferDbSave: true });
      return;
    }

    if (String(newValue) === String(stepOriginalValue)) return;

    const nextValue = String(newValue ?? '').trim();
    if (String(nextValue) === String(stepOriginalValue)) return;

    const changes = [{ orderId, colKey, originalValue: String(stepOriginalValue), newValue: nextValue }];

    // Tự động nhảy ngày khi cập nhật mã Tracking
    const isTrackingCol = colKey === 'Mã Tracking' || colKey === 'tracking_code';
    if (isTrackingCol && nextValue !== '') {
      const todayStr = getTodayDateStr();
      const trackingDateKey = 'Ngày có mã tracking';

      const pendingInfo = pendingChanges.get(orderId)?.get(trackingDateKey);
      const rowTrackingDate = originalRow
        ? (originalRow[trackingDateKey] ?? originalRow.ngay_co_ma_tracking ?? originalRow.ngaycomatracking ?? '')
        : '';
      const currentTrackingDate = pendingInfo ? pendingInfo.newValue : rowTrackingDate;

      if (String(currentTrackingDate || '').trim() !== todayStr) {
        changes.push({
          orderId,
          colKey: trackingDateKey,
          originalValue: String(currentTrackingDate || ''),
          newValue: todayStr
        });
      }
    }


    pushChange(changes, { deferDbSave: true });
  }, [allData, pendingChanges, pushChange]);

  const handleUpdateAll = useCallback(async () => {
    setSyncPopoverOpen(false);
    const newQueue = [];
    pendingChanges.forEach((cols, orderId) => {
      cols.forEach((info, colKey) => {
        newQueue.push({
          orderId,
          colKey,
          newValue: info.newValue,
          originalValue: info.originalValue
        });
      });
    });
    if (newQueue.length === 0) {
      addToast('Không có thay đổi cần lưu', 'info');
      return;
    }
    dbQueueRef.current = newQueue;
    manualSaveRequestedRef.current = true;
    processDbQueue();
  }, [pendingChanges, addToast, processDbQueue]);
  const handleQuickSync = (rows) => {
    const changesArray = [];
    const COL_KEYS = FFM_QUICK_ADD_COLUMNS;
    let notFoundCount = 0;

    /** Chuẩn hóa mã đơn để khớp dòng trong bảng chính (đúng dòng / đúng khóa pending). */
    const normOrderId = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

    rows.forEach((row) => {
      const lookupId = normOrderId(row[0]);
      if (!lookupId) return;
      const originalRow = allData.find((r) => normOrderId(r[PRIMARY_KEY_COLUMN]) === lookupId);
      if (!originalRow) {
        notFoundCount++;
        return;
      }
      const orderId = String(originalRow[PRIMARY_KEY_COLUMN] ?? lookupId);

      COL_KEYS.forEach((colName, idx) => {
        if (idx === 0) return;
        const rawVal = row[idx];
        const val = typeof rawVal === 'string' ? rawVal.trim() : rawVal;
        // Chỉ sync khi ô quick-add có giá trị thực sự; ô trống không được phép ghi đè DB.
        if (val !== undefined && val !== null && val !== '') {
          const dataKey = COLUMN_MAPPING[colName] || colName;
          const originalVal = originalRow[dataKey] ?? '';

          const pendingVal = pendingChanges.get(orderId)?.get(dataKey);
          const currentUiVal = pendingVal ? pendingVal.newValue : originalVal;

          if (String(currentUiVal) !== String(val)) {
            changesArray.push({
              orderId,
              colKey: dataKey,
              originalValue: String(currentUiVal),
              newValue: String(val)
            });

            // Tự động nhảy ngày khi cập nhật mã Tracking trong Sync
            if (dataKey === 'Mã Tracking' && String(val).trim() !== '') {
              const todayStr = getTodayDateStr();
              const uiCol = 'Ngày có mã tracking';

              const pendingInfo = pendingChanges.get(orderId)?.get(uiCol);
              const currentUiValTracking = pendingInfo ? pendingInfo.newValue : (originalRow[uiCol] ?? '');

              if (String(currentUiValTracking) !== todayStr) {
                changesArray.push({
                  orderId,
                  colKey: uiCol,
                  originalValue: String(currentUiValTracking),
                  newValue: todayStr
                });
              }
            }
          }
        }
      });
    });

    if (changesArray.length > 0) {
      pushChange(changesArray);
      addToast(`Đã đồng bộ ${changesArray.length} trường dữ liệu.`, 'success');
    } else {
      addToast('Không có thay đổi nào mới để đồng bộ.', 'info');
    }

    if (notFoundCount > 0) addToast(`Không tìm thấy ${notFoundCount} mã đơn hàng.`, 'error');
  };

  const handleQuickSyncAndSave = async (rows) => {
    // Với hệ thống stack mới, ta chỉ cần gọi handleQuickSync (nó sẽ đưa vào history và queue)
    // Sau đó gọi processDbQueue để bắt đầu lưu ngay lập tức thay vì đợi 10ms
    const prevQueueLen = dbQueueRef.current.length;
    handleQuickSync(rows);
    if (dbQueueRef.current.length > prevQueueLen) {
      manualSaveRequestedRef.current = true;
      processDbQueue();
    }
  };


  const effectiveRowsPerPage = rowsPerPage;

  const paginatedData = useMemo(() => {
    return getFilteredData.slice((currentPage - 1) * effectiveRowsPerPage, currentPage * effectiveRowsPerPage);
  }, [getFilteredData, currentPage, effectiveRowsPerPage]);
  const totalPages = Math.ceil(getFilteredData.length / effectiveRowsPerPage);

  const renderFfmEmptyOverlay = () => {
    if (paginatedData.length > 0) return null;
    const filtered = getFilteredData.length;
    const loaded = allData.length;
    return (
      <div className="sticky left-0 w-full min-h-48 flex flex-col justify-center items-center gap-2 z-[60] px-4 py-6 mx-2 my-2 bg-amber-50 border border-amber-200 rounded-lg text-center shadow-sm">
        <p className="text-gray-800 font-medium not-italic text-sm">
          {loaded === 0
            ? 'Chưa có đơn nào được tải (hoặc không khớp điều kiện FFM trên Supabase).'
            : filtered === 0
              ? `Không có dòng nào khớp bộ lọc — đang có ${loaded.toLocaleString('vi-VN')} đơn đã tải.`
              : 'Không có dữ liệu trên trang này.'}
        </p>
        {loaded > 0 && filtered === 0 && (
          <p className="text-xs text-gray-600 not-italic max-w-lg">
            Thường do ô lọc dưới tiêu đề cột (ví dụ <strong>Mã đơn hàng</strong>), khoảng <strong>Từ / Tới ngày</strong>, hoặc <strong>Bộ lọc</strong> (Chi nhánh, Tracking, Thị trường…). Xóa nội dung ô lọc hoặc bấm nút bên dưới.
          </p>
        )}
        {loaded > 0 && filtered === 0 && (
          <button
            type="button"
            onClick={clearFfmDisplayFilters}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded shadow"
          >
            Xóa lọc để hiện lại dữ liệu
          </button>
        )}
      </div>
    );
  };

  const handleDownloadExcel = () => {
    const data = getFilteredData;
    if (data.length === 0) {
      addToast('Không có dữ liệu', 'info');
      return;
    }
    const sanitize = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
      if (s.includes(',') || s.includes('\n')) return `"${s}"`;
      return s;
    };
    const header = currentColumns.join(',');
    const rows = data
      .map((row) =>
        currentColumns
          .map((col) => {
            const key = COLUMN_MAPPING[col] || col;
            let val = row[key] ?? row[col] ?? row[col.replace(/ /g, '_')] ?? '';
            if (['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking'].includes(col)) {
              val = formatDate(val);
            }
            return sanitize(val);
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + '\n' + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date();
    const dStr = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
    const prefix = viewMode === 'ORDER_MANAGEMENT' ? 'BaoCaoDonHang' : 'VanDon';
    a.download = `${prefix}_${dStr}.csv`;
    a.click();
  };

  const selectionBounds = useMemo(() => {
    if (selection.startRow === null) return null;
    return {
      minRow: Math.min(selection.startRow, selection.endRow),
      maxRow: Math.max(selection.startRow, selection.endRow),
      minCol: Math.min(selection.startCol, selection.endCol),
      maxCol: Math.max(selection.startCol, selection.endCol)
    };
  }, [selection]);

  const copiedBounds = useMemo(() => {
    if (!copiedSelection || copiedSelection.startRow === null) return null;
    return {
      minRow: Math.min(copiedSelection.startRow, copiedSelection.endRow),
      maxRow: Math.max(copiedSelection.startRow, copiedSelection.endRow),
      minCol: Math.min(copiedSelection.startCol, copiedSelection.endCol),
      maxCol: Math.max(copiedSelection.startCol, copiedSelection.endCol)
    };
  }, [copiedSelection]);

  const buildFfDragCellMap = useCallback(() => {
    const cells = getFfDragTargetCells();
    const map = new Map();
    cells.forEach((el) => {
      const r = +el.getAttribute('data-ffm-r');
      const c = +el.getAttribute('data-ffm-c');
      if (Number.isFinite(r) && Number.isFinite(c)) {
        map.set(`${r}-${c}`, el);
      }
    });
    ffmDragCellMapRef.current = map;
    ffmDragPrevBoundsRef.current = null;
  }, [ffmDragCellMapRef, ffmDragPrevBoundsRef]);

  const paintFfDragSelection = useCallback((minR, maxR, minC, maxC) => {
    const DRAG = 'ffm-drag-select';
    const edges = ['selection-border-top', 'selection-border-bottom', 'selection-border-left', 'selection-border-right'];
    const cellMap = ffmDragCellMapRef.current;

    if (!cellMap || cellMap.size === 0) {
      // Fallback: behavior giống cũ nếu chưa kịp build map.
      applyFfDragDomSelection(minR, maxR, minC, maxC);
      ffmDragPrevBoundsRef.current = { minR, maxR, minC, maxC };
      return;
    }

    const prev = ffmDragPrevBoundsRef.current;
    if (
      prev &&
      prev.minR === minR && prev.maxR === maxR &&
      prev.minC === minC && prev.maxC === maxC
    ) return;

    // Clear vùng selection cũ
    if (prev) {
      for (let r = prev.minR; r <= prev.maxR; r += 1) {
        for (let c = prev.minC; c <= prev.maxC; c += 1) {
          const el = cellMap.get(`${r}-${c}`);
          if (!el) continue;
          el.classList.remove(DRAG, ...edges);
        }
      }
    }

    let missing = false;

    // Paint vùng selection mới
    for (let r = minR; r <= maxR; r += 1) {
      for (let c = minC; c <= maxC; c += 1) {
        const el = cellMap.get(`${r}-${c}`);
        if (!el) {
          // Nếu cache map thiếu một vài cell (DOM thay đổi trong lúc kéo / scroll),
          // fallback sang cách quét DOM để đảm bảo highlight đúng tất cả cột.
          missing = true;
          continue;
        }
        el.classList.add(DRAG);
        if (r === minR) el.classList.add('selection-border-top');
        if (r === maxR) el.classList.add('selection-border-bottom');
        if (c === minC) el.classList.add('selection-border-left');
        if (c === maxC) el.classList.add('selection-border-right');
      }
    }

    if (missing) {
      applyFfDragDomSelection(minR, maxR, minC, maxC);
      // Rebuild map để lần sau có thể incremental lại.
      buildFfDragCellMap();
    }

    ffmDragPrevBoundsRef.current = { minR, maxR, minC, maxC };
  }, [ffmDragCellMapRef, ffmDragPrevBoundsRef, buildFfDragCellMap]);

  const paintDragThrottled = useRef(
    rafThrottle((minR, maxR, minC, maxC) => {
      paintFfDragSelection(minR, maxR, minC, maxC);
    })
  ).current;

  const removeDragListeners = useCallback(() => {
    const L = dragListenersRef.current;
    if (L.move) {
      document.removeEventListener('mousemove', L.move);
      document.removeEventListener('mouseup', L.up);
      dragListenersRef.current = { move: null, up: null };
    }
  }, []);

  const removeFillDragListeners = useCallback(() => {
    const L = fillListenersRef.current;
    if (L.move) {
      document.removeEventListener('mousemove', L.move);
      document.removeEventListener('mouseup', L.up);
      fillListenersRef.current = { move: null, up: null };
    }
  }, []);

  const updateDragFromCell = useCallback(
    (r, c) => {
      if (!isSelecting.current) return;
      dragEndRef.current = { r, c };
      const sr = dragAnchorRef.current.r;
      const sc = dragAnchorRef.current.c;
      paintDragThrottled(
        Math.min(sr, r),
        Math.max(sr, r),
        Math.min(sc, c),
        Math.max(sc, c)
      );
    },
    [paintDragThrottled]
  );

  useEffect(() => {
    return () => {
      removeDragListeners();
      removeFillDragListeners();
      clearFfDragDomSelection();
      clearFfFillPreview();
      ffmDragCellMapRef.current = null;
      ffmDragPrevBoundsRef.current = null;
    };
  }, [removeDragListeners, removeFillDragListeners]);

  const handleFillHandleMouseDown = useCallback(
    (rIdx, cIdx, colName, e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isEditableColFFM(colName)) return;

      removeFillDragListeners();
      removeDragListeners();
      if (isSelecting.current) {
        isSelecting.current = false;
        setIsDraggingSelection(false);
      }
      clearFfDragDomSelection();
      clearFfFillPreview();

      const viewData = paginatedData;
      const anchorRow = viewData[rIdx];
      if (!anchorRow) return;
      const { dataKey, raw: fillValue } = getFfmRowColRaw(anchorRow, colName, pendingChanges);

      let endR = rIdx;

      const paintPreview = (r0, r1) => {
        clearFfFillPreview();
        const minR = Math.min(r0, r1);
        const maxR = Math.max(r0, r1);
        const root = document.querySelector('[data-ffm-grid-root]');
        for (let r = minR; r <= maxR; r++) {
          const td = root?.querySelector(`td[data-ffm-r="${r}"][data-ffm-c="${cIdx}"]`);
          td?.classList.add('ffm-fill-preview');
        }
      };

      paintPreview(rIdx, rIdx);

      const onMove = (ev) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const td = el?.closest?.('td[data-ffm-r]');
        if (!td) return;
        const tr = +td.getAttribute('data-ffm-r');
        const tc = +td.getAttribute('data-ffm-c');
        if (Number.isNaN(tr) || Number.isNaN(tc)) return;
        if (tc !== cIdx) return;
        if (tr < rIdx) return;
        endR = Math.min(tr, viewData.length - 1);
        paintPreview(rIdx, endR);
      };

      const onUp = () => {
        removeFillDragListeners();
        clearFfFillPreview();
        clearFfDragDomSelection();

        if (endR <= rIdx) {
          startTransition(() => {
            setSelection({ startRow: rIdx, startCol: cIdx, endRow: rIdx, endCol: cIdx });
          });
          return;
        }

        const fillChanges = [];
        for (let r = rIdx + 1; r <= endR; r++) {
          const targetRow = viewData[r];
          const tid = targetRow[PRIMARY_KEY_COLUMN];
          const { raw: cur } = getFfmRowColRaw(targetRow, colName, pendingChanges);
          if (String(fillValue) === String(cur)) continue;

          fillChanges.push({
            orderId: tid,
            colKey: dataKey,
            originalValue: String(cur),
            newValue: String(fillValue)
          });

          if (dataKey === 'Mã Tracking' && String(fillValue).trim() !== '') {
            const todayStr = getTodayDateStr();
            const uiCol = 'Ngày có mã tracking';
            const pendingInfo = pendingChanges.get(tid)?.get(uiCol);
            const rowDate = targetRow[uiCol] ?? targetRow.ngay_co_ma_tracking ?? '';
            const currentUiVal = pendingInfo ? pendingInfo.newValue : rowDate;
            if (String(currentUiVal) !== todayStr) {
              fillChanges.push({
                orderId: tid,
                colKey: uiCol,
                originalValue: String(currentUiVal || ''),
                newValue: todayStr
              });
            }
          }
        }

        const primaryCount = fillChanges.filter((c) => c.colKey === dataKey).length;
        if (primaryCount > 0) {
          pushChange(fillChanges, { deferDbSave: true });
          addToast(`Đã copy ${primaryCount} ô xuống`, 'success', 2000);
        } else {
          addToast('Các ô bên dưới đã cùng giá trị', 'info', 1800);
        }

        startTransition(() => {
          setSelection({ startRow: rIdx, startCol: cIdx, endRow: endR, endCol: cIdx });
        });
      };

      fillListenersRef.current = { move: onMove, up: onUp };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [paginatedData, pendingChanges, pushChange, addToast, removeFillDragListeners, removeDragListeners]
  );

  const handleMouseDown = useCallback(
    (rowIndex, colIndex, e) => {
      if (e.button !== 0) return;
      if (e.target?.closest?.('[data-ffm-fill-handle]')) return;
      // Let native controls (especially <select>) handle click/open by themselves.
      if (e.target?.closest?.('select, input, textarea, button, [contenteditable="true"]')) return;
      e.preventDefault();

      if (e.shiftKey && selection.startRow !== null) {
        setSelection((prev) => ({ ...prev, endRow: rowIndex, endCol: colIndex }));
        return;
      }

      removeDragListeners();
      dragStartClientRef.current = { x: e.clientX, y: e.clientY };
      dragAnchorRef.current = { r: rowIndex, c: colIndex };
      dragEndRef.current = { r: rowIndex, c: colIndex };
      isSelecting.current = true;
      setIsDraggingSelection(true);
      setSelection({ startRow: rowIndex, startCol: colIndex, endRow: rowIndex, endCol: colIndex });
      setCopiedSelection(null);

      // Build cell index once per drag to make repaint during mousemove smoother.
      buildFfDragCellMap();
      paintFfDragSelection(rowIndex, rowIndex, colIndex, colIndex);

      const onMove = (ev) => {
        if (!isSelecting.current) return;
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const td = el?.closest?.('td[data-ffm-r]');
        if (!td) return;
        const tr = +td.getAttribute('data-ffm-r');
        const tc = +td.getAttribute('data-ffm-c');
        if (Number.isNaN(tr) || Number.isNaN(tc)) return;
        updateDragFromCell(tr, tc);

        // Auto-scroll khi kéo chọn xuống gần mép viewport để không phải nhả chuột rồi click lại.
        // Chỉ chạy trong lúc đang selecting.
        const scrollEl = ffmScrollContainerRef.current;
        if (scrollEl) {
          const rect = scrollEl.getBoundingClientRect();
          const margin = 48; // px từ mép
          const maxSpeed = 20; // px/frame
          if (ev.clientY > rect.bottom - margin) {
            const delta = Math.min(maxSpeed, Math.ceil(((ev.clientY - (rect.bottom - margin)) / margin) * maxSpeed));
            if (delta > 0) scrollEl.scrollTop += delta;
          } else if (ev.clientY < rect.top + margin) {
            const delta = Math.min(maxSpeed, Math.ceil(((rect.top + margin - ev.clientY) / margin) * maxSpeed));
            if (delta > 0) scrollEl.scrollTop -= delta;
          }
        }
      };

      const onUp = (ev) => {
        removeDragListeners();
        isSelecting.current = false;
        clearFfDragDomSelection();
        ffmDragCellMapRef.current = null;
        ffmDragPrevBoundsRef.current = null;
        const { r: er, c: ec } = dragEndRef.current;
        const { r: sr, c: sc } = dragAnchorRef.current;
        const dx = ev.clientX - dragStartClientRef.current.x;
        const dy = ev.clientY - dragStartClientRef.current.y;
        const movedEnough = Math.hypot(dx, dy) >= DRAG_FOCUS_THRESHOLD_PX;
        const multiCell = sr !== er || sc !== ec;
        setIsDraggingSelection(false);
        startTransition(() => {
          setSelection({ startRow: sr, startCol: sc, endRow: er, endCol: ec });
        });
        if (!movedEnough && !multiCell) {
          requestAnimationFrame(() => {
            const root = document.querySelector('[data-ffm-grid-root]');
            const td = root?.querySelector(`td[data-ffm-r="${sr}"][data-ffm-c="${sc}"]`);
            const focusable = td?.querySelector('input:not([type="hidden"]), select, textarea');
            if (focusable) focusable.focus();
          });
        }
      };

      dragListenersRef.current = { move: onMove, up: onUp };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [selection.startRow, removeDragListeners, updateDragFromCell]
  );

  const handleMouseEnter = useCallback(
    (rowIndex, colIndex) => {
      if (isSelecting.current) {
        updateDragFromCell(rowIndex, colIndex);
      }
    },
    [updateDragFromCell]
  );

  const getSelectionBounds = useCallback(() => selectionBounds, [selectionBounds]);

  const handleCopy = useCallback(() => {
    if (selection.startRow === null) return;

    const bounds = selectionBounds;
    if (!bounds) return;

    const viewData = paginatedData;
    const copiedRows = [];

    for (let r = bounds.minRow; r <= bounds.maxRow && r < viewData.length; r++) {
      const rowData = [];
      for (let c = bounds.minCol; c <= bounds.maxCol && c < currentColumns.length; c++) {
        const col = currentColumns[c];
        const key = COLUMN_MAPPING[col] || col;
        let val = viewData[r][key] ?? viewData[r][col] ?? '';
        if (['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking'].includes(col)) {
          val = formatDate(val);
        }
        rowData.push(String(val));
      }
      copiedRows.push(rowData);
    }

    const text = copiedRows.map((row) => row.join('\t')).join('\n');
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedData(copiedRows);
        setCopiedSelection({ ...selection });
        addToast(`📋 Đã copy ${bounds.maxRow - bounds.minRow + 1} hàng × ${bounds.maxCol - bounds.minCol + 1} cột`, 'info', 2000);
      })
      .catch(() => {
        addToast('Không thể copy vào clipboard', 'error');
      });
  }, [selection, paginatedData, currentColumns, selectionBounds]);

  const handleClearSelection = useCallback(() => {
    if (selection.startRow === null) return;
    const bounds = selectionBounds;
    if (!bounds) return;

    const viewData = paginatedData;
    const deleteChanges = [];
    const seen = new Set();

    const appendDelete = (orderId, colKey, currentUiVal) => {
      if (String(currentUiVal) === '') return;
      const k = `${orderId}\0${colKey}`;
      if (seen.has(k)) return;
      seen.add(k);
      deleteChanges.push({
        orderId,
        colKey,
        originalValue: String(currentUiVal),
        newValue: ''
      });
    };

    for (let r = bounds.minRow; r <= bounds.maxRow && r < viewData.length; r++) {
      const rowData = viewData[r];
      const orderId = rowData[PRIMARY_KEY_COLUMN];

      for (let c = bounds.minCol; c <= bounds.maxCol && c < currentColumns.length; c++) {
        const colName = currentColumns[c];
        if (!isEditableColFFM(colName)) continue;

        const dataKey = COLUMN_MAPPING[colName] || colName;
        const originalVal = rowData[dataKey] ?? '';
        const pendingVal = pendingChanges.get(orderId)?.get(dataKey);
        const currentUiVal = pendingVal ? pendingVal.newValue : originalVal;

        appendDelete(orderId, dataKey, currentUiVal);

        if (dataKey === 'Mã Tracking' || dataKey === 'tracking_code') {
          const uiCol = 'Ngày có mã tracking';
          const pendingDate = pendingChanges.get(orderId)?.get(uiCol);
          const rowDate = rowData[uiCol] ?? rowData.ngay_co_ma_tracking ?? '';
          const currentDateVal = pendingDate ? pendingDate.newValue : rowDate;
          if (String(currentDateVal || '').trim() !== '') {
            appendDelete(orderId, uiCol, currentDateVal);
          }
        }
      }
    }

    if (deleteChanges.length === 0) {
      addToast('Không có ô nào để xóa', 'info', 2000);
      return;
    }
    pushChange(deleteChanges, { deferDbSave: true });
    addToast(`Đã xóa ${deleteChanges.length} ô`, 'success', 2000);
  }, [selection, selectionBounds, paginatedData, currentColumns, pendingChanges, pushChange, addToast]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (quickAddModalOpen) return;
      const active = document.activeElement;
      const isInInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const bounds = getSelectionBounds();
        if (!bounds) return;

        // If focusing an input AND has a partial text selection inside it, let browser handle it
        const isSingleCell = bounds.minRow === bounds.maxRow && bounds.minCol === bounds.maxCol;
        if (isInInput && isSingleCell && active.selectionStart !== active.selectionEnd &&
          (active.selectionEnd - active.selectionStart) < active.value.length) {
          return; // Let browser handle partial copy
        }

        e.preventDefault();
        handleCopy();
        return;
      }

      if (e.key === 'Escape') {
        setSelection({ startRow: null, startCol: null, endRow: null, endCol: null });
        setCopiedSelection(null);
        setCopiedData(null);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.startRow === null) return;
        const bounds = getSelectionBounds();
        if (!bounds) return;

        const isSingleCell = bounds.minRow === bounds.maxRow && bounds.minCol === bounds.maxCol;
        if (isInInput && isSingleCell) {
          if (active.tagName === 'SELECT') {
            e.preventDefault();
            handleClearSelection();
            return;
          }
          const hasSel = active.selectionStart !== active.selectionEnd;
          const partial = hasSel && (active.selectionEnd - active.selectionStart) < active.value.length;
          if (partial) return;
          if (!hasSel) return;
        }
        e.preventDefault();
        handleClearSelection();
        return;
      }

      if (!isInInput && selection.startRow !== null && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const bounds = getSelectionBounds();
        if (!bounds) return;

        let newRow = e.shiftKey ? selection.endRow : selection.startRow;
        let newCol = e.shiftKey ? selection.endCol : selection.startCol;

        switch (e.key) {
          case 'ArrowUp':
            newRow = Math.max(0, newRow - 1);
            break;
          case 'ArrowDown':
            newRow = Math.min(paginatedData.length - 1, newRow + 1);
            break;
          case 'ArrowLeft':
            newCol = Math.max(0, newCol - 1);
            break;
          case 'ArrowRight':
            newCol = Math.min(currentColumns.length - 1, newCol + 1);
            break;
          default:
            break;
        }

        if (e.shiftKey) {
          setSelection((prev) => ({ ...prev, endRow: newRow, endCol: newCol }));
        } else {
          setSelection({ startRow: newRow, startCol: newCol, endRow: newRow, endCol: newCol });
        }
        return;
      }

      if (e.ctrlKey && e.key === 'a' && !isInInput) {
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (isInInput) return;
        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z - Redo
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey)) {
        if (isInInput) return;
        e.preventDefault();
        handleRedo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, quickAddModalOpen, handleCopy, handleClearSelection, getSelectionBounds, paginatedData.length, currentColumns.length, handleUndo, handleRedo, paginatedData, currentColumns]);

  useEffect(() => {
    const handlePaste = (e) => {
      if (quickAddModalOpen) {
        return;
      }

      const active = document.activeElement;

      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
        if (active.closest('th')) {
          return;
        }

        if (active.closest('td')) {
          const td = active.closest('td');
          const tr = td.closest('tr');
          const table = tr.closest('table');
          const tbody = table.querySelector('tbody');

          if (tbody) {
            const rowIndex = Array.from(tbody.children).indexOf(tr);
            let colIndex = Array.from(tr.children).indexOf(td);
            if (table?.getAttribute('data-ffm-pane') === 'right') {
              colIndex += effectiveFixedColumns;
            }
            setSelection({ startRow: rowIndex, startCol: colIndex, endRow: rowIndex, endCol: colIndex });
          }
        }
      }

      if (selection.startRow === null || selection.startCol === null) return;

      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;

      const rows = text
        .split(/\r\n?|\n/)
        .filter((r) => r.length > 0)
        .map((r) => r.split('\t'));
      if (rows.length === 0) return;

      const viewData = paginatedData;
      const newPending = new Map(pendingChanges);
      const bounds = getSelectionBounds();
      if (!bounds) return;

      const pasteChanges = [];
      let updatedCount = 0;
      let skippedCount = 0;
      const dataRows = rows.length;
      const dataCols = Math.max(...rows.map((r) => r.length));

      const selectionRows = bounds.maxRow - bounds.minRow + 1;
      const selectionCols = bounds.maxCol - bounds.minCol + 1;

      const repeatRows = selectionRows === 1 ? dataRows : dataRows === 1 ? selectionRows : Math.min(selectionRows, dataRows);
      const repeatCols = selectionCols === 1 ? dataCols : dataCols === 1 ? selectionCols : Math.min(selectionCols, dataCols);

      for (let pasteRow = 0; pasteRow < repeatRows; pasteRow++) {
        const targetRowIndex = bounds.minRow + pasteRow;
        if (targetRowIndex >= viewData.length) break;

        const rowData = viewData[targetRowIndex];
        const orderId = rowData[PRIMARY_KEY_COLUMN];
        const sourceRow = dataRows === 1 ? 0 : pasteRow % dataRows;

        for (let pasteCol = 0; pasteCol < repeatCols; pasteCol++) {
          const targetColIndex = bounds.minCol + pasteCol;
          if (targetColIndex >= currentColumns.length) break;

          const colName = currentColumns[targetColIndex];
          if (!isEditableColFFM(colName)) {
            skippedCount++;
            continue;
          }

          const dataKey = COLUMN_MAPPING[colName] || colName;
          const sourceCol = dataCols === 1 ? 0 : pasteCol % dataCols;
          const pasteValue = rows[sourceRow]?.[sourceCol] ?? '';

          if (pasteValue === '') continue;

          const originalVal = rowData[dataKey] ?? '';

          const pendingVal = pendingChanges.get(orderId)?.get(dataKey);
          const currentUiVal = pendingVal ? pendingVal.newValue : originalVal;

          if (String(pasteValue) !== String(currentUiVal)) {
            pasteChanges.push({
              orderId,
              colKey: dataKey,
              originalValue: String(currentUiVal),
              newValue: String(pasteValue)
            });
            updatedCount++;

            // Tự động nhảy ngày khi cập nhật mã Tracking bằng Paste
            if (dataKey === 'Mã Tracking' && String(pasteValue).trim() !== '') {
              const todayStr = getTodayDateStr();
              const uiCol = 'Ngày có mã tracking';

              const pendingInfo = pendingChanges.get(orderId)?.get(uiCol);
              const currentUiVal = pendingInfo ? pendingInfo.newValue : (rowData[uiCol] ?? '');

              if (String(currentUiVal) !== todayStr) {
                pasteChanges.push({
                  orderId,
                  colKey: uiCol,
                  originalValue: String(currentUiVal),
                  newValue: todayStr
                });
              }
            }
          }
        }
      }

      setCopiedSelection(null);
      setCopiedData(null);

      if (pasteChanges.length > 0) {
        pushChange(pasteChanges, { deferDbSave: true });
        const msg = skippedCount > 0 ? `✅ Đã dán ${updatedCount} ô (${skippedCount} ô không thể sửa)` : `✅ Đã dán ${updatedCount} ô dữ liệu`;
        addToast(msg, 'success', 2500);
      } else {
        addToast('Không có dữ liệu mới để dán', 'info', 2000);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [selection, pendingChanges, quickAddModalOpen, currentColumns, paginatedData, getSelectionBounds, effectiveFixedColumns, pushChange, addToast]);

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

    return {
      count,
      sum: numericCount > 0 ? sum : 0,
      avg: numericCount > 0 ? sum / numericCount : 0
    };
  }, [selectionBounds, paginatedData, currentColumns]);

  const existingTrackingOwnerMap = useMemo(() => {
    const map = {};
    (allData || []).forEach((row) => {
      const orderId = String(row?.[PRIMARY_KEY_COLUMN] || '').trim();
      const tracking = getTrackingCodeFFM(row).toLowerCase();
      if (!orderId || !tracking) return;
      if (!map[tracking]) map[tracking] = orderId;
    });
    return map;
  }, [allData]);

  const checkResultColumnWidthPx = useMemo(() => {
    // Ước lượng width theo độ dài chuỗi option của bộ lọc “Kết quả Check”.
    // Ưu tiên các giá trị đang chọn; nếu không có chọn thì dùng toàn bộ option.
    const selected = localFilterValues['Kết quả Check'] || [];
    const allOptions = selected.length ? selected : getMultiSelectOptions('Kết quả Check');
    const options = (allOptions || []).filter((v) => v && v !== '__EMPTY__');
    const maxLen = options.reduce((m, v) => Math.max(m, String(v).length), 0);
    // Font table ~13px, ước lượng 7-8px/char + padding.
    const estimated = 20 + maxLen * 7.6;
    // Yêu cầu: tăng độ rộng cột lên ~x2.
    return Math.max(180, Math.min(440, Math.ceil(estimated * 2)));
  }, [localFilterValues, allData]);

  const getColumnWidthPx = useCallback((col) => {
    if (col === 'STT') return 50;
    if (col === 'Mã đơn hàng') return 150;
    if (col === 'Kết quả Check' || col === 'Kết quả check') return checkResultColumnWidthPx;
    if (col === 'Mã Tracking') return 260;
    if (col === 'Add') return 280;
    if (col === 'Name' || col === 'Name*') return 350;
    if (col === 'Ngày lên đơn') return 150;
    if (col === 'Ghi chú') return 400;
    if (col === 'GHI CHÚ') return 150;
    if (col === 'Phone' || col === 'Phone*') return 140;
    if (col === 'City') return 150;
    if (col === 'Mặt hàng') return 240;
    if (String(col).startsWith('Tên mặt hàng') || String(col).startsWith('Số lượng mặt hàng')) return 240;

    // Heuristic: Tự động tính width theo độ dài tên tiêu đề (fit content on head)
    const textLen = String(col).length;
    const estimated = 40 + (textLen * 8.5); // Padding + estimate char width
    return Math.max(120, Math.min(400, Math.ceil(estimated)));
  }, [checkResultColumnWidthPx]);

  const getColumnWidthStyles = useCallback((col) => {
    const w = getColumnWidthPx(col);
    // Trả về kích thước cố định tuyệt đối cho table-layout: fixed
    const style = {
      width: `${w}px`,
      minWidth: `${w}px`,
      maxWidth: `${w}px`,
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    };
    if (col === 'Add') {
      return { ...style, width: '250px', minWidth: '250px', maxWidth: '250px' };
    }
    return style;
  }, [getColumnWidthPx]);

  /** 
   * Tính toán offset cho các cột sticky để tránh đè lên nhau.
   */
  const [stickyOffsets, setStickyOffsets] = useState([]);

  // Lấy offset left cho từng cột sticky.
  // Ưu tiên dùng offsets đo được từ DOM; fallback về cộng width cấu hình nếu chưa đo kịp.
  const getStickyLeftPx = useCallback((colIdx) => {
    const measured = stickyOffsets[colIdx];
    if (Number.isFinite(measured)) return measured;

    let left = 0;
    for (let i = 0; i < colIdx; i += 1) {
      left += getColumnWidthPx(currentColumns[i]);
    }
    return left;
  }, [stickyOffsets, currentColumns, getColumnWidthPx]);

  // Đo width thực tế của header để freeze cột khớp tuyệt đối khi cuộn ngang.
  useLayoutEffect(() => {
    const recalcStickyOffsets = () => {
      const tableEl = headerTableRef.current;
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
      let left = 0;
      for (let i = 0; i < currentColumns.length; i += 1) {
        offsets[i] = left;
        const w = widthByIdx.get(i) || getColumnWidthPx(currentColumns[i]);
        left += w;
      }
      setStickyOffsets(offsets);
    };

    recalcStickyOffsets();
    const raf = requestAnimationFrame(recalcStickyOffsets);
    window.addEventListener('resize', recalcStickyOffsets);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', recalcStickyOffsets);
    };
  }, [tableRef, currentColumns, getColumnWidthPx]);

  /** Cố định > 0: tách cột trái ra khỏi vùng overflow-x (thanh kéo ngang chỉ nằm dưới phần cột cuộn). */
  // Bỏ tách 2 bảng (left/right) để chỉ hiển thị 1 bảng duy nhất.
  // Freeze cột vẫn hoạt động nhờ nhánh "single table" với `position: sticky`.
  const splitPane = false;
  const frozenCols = splitPane ? currentColumns.slice(0, effectiveFixedColumns) : [];
  const scrollCols = splitPane ? currentColumns.slice(effectiveFixedColumns) : currentColumns;

  /**
   * Khi bật freeze (splitPane), UI tách thành 2 <table> (left/right).
   * Mỗi bảng tự tính chiều cao `thead` + `tbody tr` khác nhau -> lệch dòng.
   * Đồng bộ minHeight giữa 2 bảng để các hàng thẳng hàng.
   */
  useLayoutEffect(() => {
    if (!splitPane) return;

    const syncRowHeights = () => {
      const leftTable = document.querySelector('table[data-ffm-pane="left"]');
      const rightTable = document.querySelector('table[data-ffm-pane="right"]');
      if (!leftTable || !rightTable) return;

      const leftHeadRow = leftTable.querySelector('thead tr');
      const rightHeadRow = rightTable.querySelector('thead tr');

      const clearRow = (rowEl) => {
        if (!rowEl) return;
        rowEl.style.minHeight = '';
        rowEl.style.height = '';
        rowEl.querySelectorAll('td, th').forEach((cell) => {
          cell.style.minHeight = '';
          cell.style.height = '';
        });
      };

      const applyRowHeight = (rowEl, rowH) => {
        if (!rowEl || !rowH) return;
        rowEl.style.minHeight = `${rowH}px`;
        rowEl.style.height = `${rowH}px`;
        rowEl.querySelectorAll('td, th').forEach((cell) => {
          cell.style.minHeight = `${rowH}px`;
          cell.style.height = `${rowH}px`;
        });
      };

      if (leftHeadRow && rightHeadRow) {
        clearRow(leftHeadRow);
        clearRow(rightHeadRow);
        const headH = Math.max(
          leftHeadRow.getBoundingClientRect().height,
          rightHeadRow.getBoundingClientRect().height
        );
        if (headH > 0) {
          applyRowHeight(leftHeadRow, headH);
          applyRowHeight(rightHeadRow, headH);
        }
      }

      const leftRows = leftTable.querySelectorAll('tbody tr');
      const rightRows = rightTable.querySelectorAll('tbody tr');
      const n = Math.min(leftRows.length, rightRows.length);

      for (let i = 0; i < n; i += 1) {
        clearRow(leftRows[i]);
        clearRow(rightRows[i]);
      }

      for (let i = 0; i < n; i += 1) {
        const lh = leftRows[i].getBoundingClientRect().height;
        const rh = rightRows[i].getBoundingClientRect().height;
        const rowH = Math.max(lh, rh);
        if (rowH > 0) applyRowHeight(leftRows[i], rowH);
        if (rowH > 0) applyRowHeight(rightRows[i], rowH);
      }
    };

    let raf = 0;
    const scheduleSync = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncRowHeights);
    };

    // Run at least twice to let layout settle (fonts, sticky header, etc.)
    syncRowHeights();
    scheduleSync();

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      // Observe the tables/tbody themselves (wrappers in flex are often `items-stretch`,
      // their height can remain constant even when row content changes).
      const leftTable = document.querySelector('table[data-ffm-pane="left"]');
      const rightTable = document.querySelector('table[data-ffm-pane="right"]');
      const leftTbody = document.querySelector('table[data-ffm-pane="left"] tbody');
      const rightTbody = document.querySelector('table[data-ffm-pane="right"] tbody');
      ro = new ResizeObserver(() => scheduleSync());
      if (leftTable) ro.observe(leftTable);
      if (rightTable) ro.observe(rightTable);
      if (leftTbody) ro.observe(leftTbody);
      if (rightTbody) ro.observe(rightTbody);
    }

    const onResize = () => scheduleSync();
    window.addEventListener('resize', onResize);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
    // Không phụ thuộc `paginatedData` (tránh chạy lại khi reference đổi do pendingChanges) — tránh
    // syncRowHeights chạy lại khi chỉ sửa ô (gây gộp/lệch hàng). Dùng length + trang; ResizeObserver xử lý khi hàng cao đổi.
  }, [splitPane, getFilteredData.length, currentPage, effectiveRowsPerPage, currentColumns, effectiveFixedColumns, loading]);

  const totalMoney = useMemo(() => {
    return getFilteredData.reduce((sum, row) => {
      let val = row['Tổng tiền VNĐ'] || row['Tổng_tiền_VNĐ'] || row['Giá bán'] || 0;
      const num = parseFloat(String(val).replace(/[^\d.-]/g, '')) || 0;
      return sum + num;
    }, 0);
  }, [getFilteredData]);

  const getCellClass = useCallback((row, col, val, rIdx, cIdx) => {
    let classes =
      'px-4 py-2.5 border border-gray-200 text-sm min-h-[38px] min-w-max align-top whitespace-normal break-words overflow-visible box-border ';

    // STT là cột cố định rất hẹp: tránh nội dung/header bị tràn do padding + overflow-visible.
    if (col === 'STT') {
      classes += '!px-2 !py-2.5 !whitespace-nowrap !break-words !overflow-hidden !text-ellipsis ';
    }

    if (col === 'Kết quả Check' || col === 'Kết quả check') {
      const v = val.toLowerCase();
      if (v === 'ok') classes += 'bg-green-100 text-green-800 font-bold ';
      else if (v.includes('huỷ')) classes += 'bg-red-100 text-red-800 font-bold ';
      else if (v === 'vận đơn xl') classes += 'bg-yellow-100 text-yellow-800 ';
    }

    // Removed BILL_OF_LADING mode - viewMode is now always ORDER_MANAGEMENT
    // if (viewMode === 'BILL_OF_LADING' && LONG_TEXT_COLS.includes(col)) {
    //   classes = classes.replace(
    //     'whitespace-nowrap',
    //     isLongTextExpanded
    //       ? 'whitespace-pre-wrap max-w-xs break-words bg-yellow-50'
    //       : 'whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] cursor-pointer'
    //   );
    // }

    const isEditable = isEditableColFFM(col);
    if (isEditable) {
      const orderId = row[PRIMARY_KEY_COLUMN];
      if (pendingChanges.get(orderId)?.has(COLUMN_MAPPING[col] || col)) {
        classes += '!bg-yellow-300 ';
      } else {
        classes += 'bg-[#e8f5e9] ';
      }
    }

    if (!splitPane && cIdx < effectiveFixedColumns) {
      // Sticky positioning được set bằng inline style (để có `left` chuẩn).
      classes += 'z-10 bg-gray-50 ';
    }

    if (
      !isDraggingSelection &&
      selectionBounds &&
      rIdx >= selectionBounds.minRow &&
      rIdx <= selectionBounds.maxRow &&
      cIdx >= selectionBounds.minCol &&
      cIdx <= selectionBounds.maxCol
    ) {
      classes += '!bg-[#e3f2fd] ';
      if (rIdx === selectionBounds.minRow) classes += 'selection-border-top ';
      if (rIdx === selectionBounds.maxRow) classes += 'selection-border-bottom ';
      if (cIdx === selectionBounds.minCol) classes += 'selection-border-left ';
      if (cIdx === selectionBounds.maxCol) classes += 'selection-border-right ';
    }

    if (
      copiedBounds &&
      rIdx >= copiedBounds.minRow &&
      rIdx <= copiedBounds.maxRow &&
      cIdx >= copiedBounds.minCol &&
      cIdx <= copiedBounds.maxCol
    ) {
      if (rIdx === copiedBounds.minRow) classes += 'copied-border-top ';
      if (rIdx === copiedBounds.maxRow) classes += 'copied-border-bottom ';
      if (cIdx === copiedBounds.minCol) classes += 'copied-border-left ';
      if (cIdx === copiedBounds.maxCol) classes += 'copied-border-right ';
    }

    return classes;
  }, [isDraggingSelection, selectionBounds, copiedBounds, pendingChanges, effectiveFixedColumns, splitPane]);

  const tableClassName = 'border-separate border-spacing-0 text-sm table-auto';

  const renderColumnFilterEditor = (col) => {
    const key = COLUMN_MAPPING[col] || col;
    const filterKey = col;
    if (col === 'STT') {
      return <div className="text-xs text-gray-400">-</div>;
    }
    if (col === 'Mã Tracking') {
      return (
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
                className="w-full text-xs px-1 py-0.5 border rounded"
                placeholder="Bao gồm..."
                value={localFilterValues.tracking_include}
                onChange={(e) => setLocalFilterValues((p) => ({ ...p, tracking_include: e.target.value }))}
              />
              <input
                className="w-full text-xs px-1 py-0.5 border rounded"
                placeholder="Loại trừ..."
                value={localFilterValues.tracking_exclude}
                onChange={(e) => setLocalFilterValues((p) => ({ ...p, tracking_exclude: e.target.value }))}
              />
            </>
          )}
        </div>
      );
    }
    if (col === 'Ngày đóng hàng') {
      return (
        <div className="flex flex-col gap-1.5 relative">
          <select
            className="w-full text-[13px] px-1 py-1 border rounded bg-white font-medium text-gray-700 shadow-sm"
            value={localFilterValues.packing_date_status || 'Tất cả'}
            onChange={(e) => setLocalFilterValues((p) => ({ ...p, packing_date_status: e.target.value }))}
          >
            <option value="Tất cả">Tất cả</option>
            <option value="Hôm nay">Hôm nay</option>
            <option value="Hôm qua">Hôm qua</option>
            <option value="Trống">Trống</option>
            <option value="Ngày cụ thể">Ngày cụ thể</option>
          </select>
          {localFilterValues.packing_date_status === 'Ngày cụ thể' && (
            <input
              type="date"
              className="w-full text-xs px-1 py-1 border rounded shadow-sm"
              value={localFilterValues[filterKey] || ''}
              onChange={(e) => setLocalFilterValues((p) => ({ ...p, [filterKey]: e.target.value }))}
            />
          )}
        </div>
      );
    }
    if (col === 'Trạng thái giao hàng') {
      return (
        <div className="flex flex-col gap-1.5 relative">
          <select
            className="w-full text-[13px] px-1 py-1 border rounded bg-white font-medium text-gray-700 shadow-sm"
            value={localFilterValues.delivery_status_filter || 'Tất cả'}
            onChange={(e) => setLocalFilterValues((p) => ({ ...p, delivery_status_filter: e.target.value }))}
          >
            <option value="Tất cả">Tất cả</option>
            {DROPDOWN_OPTIONS['Trạng thái giao hàng']?.filter((o) => o).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
            <option value="Trống">Trống</option>
            <option value="Tìm kiếm...">Tìm kiếm...</option>
          </select>
          {localFilterValues.delivery_status_filter === 'Tìm kiếm...' && (
            <input
              type="text"
              className="w-full text-xs px-1 py-1 border rounded shadow-sm"
              placeholder="Nhập trạng thái..."
              value={localFilterValues.delivery_status_search || ''}
              onChange={(e) => setLocalFilterValues((p) => ({ ...p, delivery_status_search: e.target.value }))}
            />
          )}
        </div>
      );
    }
    if (col === 'Ngày đối soát kế toán' || col === 'Phí ship nội địa Mỹ (usd)' || col === 'Phí ship nội địa mỹ') {
      return (
        <div className="flex flex-col gap-1.5 relative">
          <input
            type="text"
            className="w-full text-xs px-1 py-1 border rounded shadow-sm"
            placeholder="Lọc theo nội dung ô..."
            value={localFilterValues.us_shipping_fee_search || ''}
            onChange={(e) => setLocalFilterValues((p) => ({ ...p, us_shipping_fee_search: e.target.value }))}
          />
        </div>
      );
    }
    if (DROPDOWN_OPTIONS[col] || DROPDOWN_OPTIONS[key] || ['Trạng thái giao hàng', 'Kết quả check', 'GHI CHÚ'].includes(col)) {
      return (
        <MultiSelect
          label="Lọc..."
          options={getMultiSelectOptions(col)}
          selected={localFilterValues[filterKey] || []}
          onChange={(vals) => setLocalFilterValues((p) => ({ ...p, [filterKey]: vals }))}
        />
      );
    }
    if (['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2'].includes(col)) {
      return (
        <input
          type="date"
          className="w-full text-xs px-1 py-1 border rounded shadow-sm"
          value={localFilterValues[filterKey] || ''}
          onChange={(e) => setLocalFilterValues((p) => ({ ...p, [filterKey]: e.target.value }))}
        />
      );
    }
    return (
      <input
        type="text"
        className="w-full text-xs px-1 py-1 border rounded shadow-sm"
        placeholder="..."
        value={localFilterValues[filterKey] || ''}
        onChange={(e) => setLocalFilterValues((p) => ({ ...p, [filterKey]: e.target.value }))}
      />
    );
  };

  const renderFfmDataCell = (row, rIdx, col, cIdx, cellStyle) => {
    const orderId = row[PRIMARY_KEY_COLUMN];
    const key = COLUMN_MAPPING[col] || col;
    let val = '';
    if (col === 'Mã Tracking') {
      val = row['Mã Tracking'] ?? row['tracking_code'] ?? row.tracking_code ?? '';
    } else if (col === 'Ngày đẩy đơn') {
      val = row['time_dayon'] ?? row.time_dayon ?? row['Ngày đẩy đơn'] ?? row[key] ?? '';
    } else if (col === 'Payment Bill') {
      val = row['Payment Bill'] ?? row.payment_bill ?? row[key] ?? '';
    } else if (col === 'Payment Image') {
      val = row['Payment Image'] ?? row.payment_image ?? row[key] ?? '';
    } else if (col === 'Trạng thái giao hàng') {
      val =
        row['Trạng thái giao hàng'] ??
        row.delivery_status ??
        row[key] ??
        '';
    } else {
      val = row[key] ?? row[col] ?? row[col.replace(/ /g, '_')] ?? '';
    }
    const pendingInfo = pendingChanges.get(orderId)?.get(key);
    if (pendingInfo) val = pendingInfo.newValue;
    if (col === 'Ngày đối soát kế toán') {
      val = API.normalizeNgayDoiSoatKeToanText(val);
    }
    const displayVal = ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2'].includes(col)
      ? formatDate(val)
      : col === 'Tổng tiền VNĐ' || col === 'Tiền đã thanh toán'
        ? val !== '' && val !== null
          ? Number(String(val).replace(/[^\d.-]/g, '')).toLocaleString('vi-VN')
          : ''
        : val;

    const className = getCellClass(row, col, String(displayVal), rIdx, cIdx);

    return (
      <td
        key={`${orderId}-${col}`}
        data-ffm-r={rIdx}
        data-ffm-c={cIdx}
        className={`${className}${isEditableColFFM(col) ? ' relative group' : ''}`}
        style={cellStyle}
        onMouseDownCapture={(e) => handleMouseDown(rIdx, cIdx, e)}
        onMouseEnter={() => handleMouseEnter(rIdx, cIdx)}
      >
        {col === 'STT' ? (
          row['rowIndex'] || (currentPage - 1) * rowsPerPage + rIdx + 1
        ) : DROPDOWN_OPTIONS[col] ? (
          <select
            className="w-full bg-transparent border-none outline-none text-sm p-0 m-0 cursor-pointer"
            value={String(val)}
            onChange={(e) => handleCellChange(orderId, key, e.target.value)}
          >
            {DROPDOWN_OPTIONS[col].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ) : col === 'Kết quả Check' || col === 'Trạng thái giao hàng' ? (
          <select
            className="w-full bg-transparent border-none outline-none text-sm p-0 m-0"
            value={String(val)}
            onChange={(e) => handleCellChange(orderId, key, e.target.value)}
          >
            {getMultiSelectOptions(key)
              .filter((o) => o !== '__EMPTY__')
              .map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
          </select>
        ) : col === 'Payment Bill' ? (
          <select
            className="w-full bg-transparent border-none outline-none text-sm p-0 m-0 cursor-pointer"
            value={String(val)}
            onChange={(e) => handleCellChange(orderId, key, e.target.value)}
          >
            {DROPDOWN_OPTIONS['Payment Bill']?.map((o) => (
              <option key={o} value={o}>{o || '-- Chọn --'}</option>
            )) || (
                <>
                  <option value="">-- Chọn --</option>
                  <option value="Có bill">Có bill</option>
                  <option value="Bill một phần">Bill một phần</option>
                </>
              )}
          </select>
        ) : col === 'Payment Image' ? (
          <Suspense fallback={<span className="text-gray-400">...</span>}>
            <BillImageViewer
              paymentImage={val || row['Payment Image'] || row.payment_image || ''}
              orderCode={orderId}
            />
          </Suspense>
        ) : isEditableColFFM(col) ? (
          <input
            type="text"
            key={`${orderId}-${col}-${String(displayVal)}`}
            defaultValue={String(displayVal)}
            onBlur={(e) => {
              const newValue = e.target.value;
              if (newValue !== String(displayVal)) handleCellChange(orderId, key, newValue);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                // Không chốt pendingChanges khi bấm Enter.
                // Người dùng phải bấm "Xác nhận lưu" (đồng bộ server) theo luồng hiện tại.
                // Việc chốt có thể xảy ra khi blur (click ra ngoài / tab sang ô khác).
                return;
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
        {isEditableColFFM(col) && (
          <div
            data-ffm-fill-handle
            role="presentation"
            className="absolute bottom-px right-px z-[60] h-2.5 w-2.5 cursor-ns-resize rounded-sm border border-white bg-[#1a73e8] opacity-50 shadow-sm transition-opacity group-hover:opacity-100 hover:!opacity-100 hover:bg-[#1557b0]"
            title="Kéo xuống để copy giá trị ô này"
            onMouseDown={(ev) => handleFillHandleMouseDown(rIdx, cIdx, col, ev)}
          />
        )}
      </td>
    );
  };

  const ffmPageAllowed =
    variant === 'TT'
      ? canView('ORDERS_FFM_TT')
      : variant === 'MGT_HCM'
        ? canView('ORDERS_FFM_MGT_HCM')
        : canView('ORDERS_FFM_MGT');
  const ffmDeniedLabel =
    variant === 'TT' ? 'FFM T&T' : variant === 'MGT_HCM' ? 'FFM MGT HCM' : 'FFM MGT';
  if (!ffmPageAllowed && !canView('ORDERS_FFM')) {
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này ({ffmDeniedLabel}).
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden font-sans text-gray-800 bg-[#f8f9fa] p-2">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-2 mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {variant !== 'TT' && (
              <img
                src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Fbe61f44f.%E1%BA%A2nh.021347.png"
                alt="Header"
                className="h-7 object-contain"
              />
            )}
            <h2 className="text-lg font-bold text-gray-700">
              {variant === 'TT' ? 'HỆ THỐNG QUẢN LÝ LUMI-T&T' : 'HỆ THỐNG QUẢN LÝ SPEEGO'}
            </h2>
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`h-2 w-2 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-gray-600" title="Số đơn sau bộ lọc / số đơn đã tải">
                {getFilteredData.length !== allData.length
                  ? `${getFilteredData.length.toLocaleString('vi-VN')} / ${allData.length.toLocaleString('vi-VN')} sau lọc`
                  : `${allData.length.toLocaleString('vi-VN')} đơn hàng`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Section - Collapsible */}
      <div className="bg-white rounded-lg shadow-sm mb-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-t-lg"
        >
          <span className="font-semibold text-gray-700 text-sm">🔍 Bộ lọc</span>
          <span className="text-gray-500 text-xs">{showFilters ? '▲' : '▼'}</span>
        </button>
        {showFilters && (
          <div className="px-3 pb-2 border-t border-gray-200">
            <div className="flex flex-wrap items-end gap-2 pt-2">
              <div className="flex-1 flex flex-col gap-1 min-w-[120px]">
                <label className="text-xs font-semibold text-gray-500">Chi nhánh</label>
                <select
                  className="px-2 py-1 border rounded text-xs bg-white"
                  value={ffmBranchFilter}
                  onChange={(e) => {
                    setFfmBranchFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">Tất cả</option>
                  <option value="hanoi">Hà Nội</option>
                  <option value="hcm">HCM</option>
                </select>
              </div>
              <div className="flex-1 flex flex-col gap-1 min-w-[140px]">
                <label className="text-xs font-semibold text-gray-500">Tình trạng mã Tracking</label>
                <select
                  className="px-2 py-1 border rounded text-xs bg-white"
                  value={ffmTrackingPresence}
                  onChange={(e) => {
                    setFfmTrackingPresence(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">Tất cả</option>
                  <option value="has">Có mã</option>
                  <option value="no">Chưa có mã</option>
                </select>
              </div>
              <div className="flex-1 flex flex-col gap-1 min-w-[120px]">
                <label className="text-xs font-semibold text-gray-500">Thị trường</label>
                <MultiSelect
                  label="Tất cả"
                  mainFilter={true}
                  options={getUniqueValues('Khu vực')}
                  selected={localFilterValues.market}
                  onChange={(vals) => setLocalFilterValues((prev) => ({ ...prev, market: vals }))}
                />
              </div>
              <div className="flex-1 flex flex-col gap-1 min-w-[120px]">
                <label className="text-xs font-semibold text-gray-500">Sản phẩm</label>
                <MultiSelect
                  label="Tất cả"
                  mainFilter={true}
                  options={getUniqueValues('Mặt hàng')}
                  selected={localFilterValues.product}
                  onChange={(vals) => setLocalFilterValues((prev) => ({ ...prev, product: vals }))}
                />
              </div>
              <div className="flex-1 flex flex-col gap-1 min-w-[120px]">
                <label className="text-xs font-semibold text-gray-500">Loại ngày</label>
                <select className="px-2 py-1 border rounded text-xs bg-white" value={omDateType} onChange={(e) => setOmDateType(e.target.value)}>
                  <option value="Ngày lên đơn">Ngày lên đơn</option>
                  <option value="Ngày đóng hàng">Ngày đóng hàng</option>
                  <option value="Ngày đẩy đơn">Ngày đẩy đơn</option>
                  <option value="Ngày có mã tracking">Ngày có mã tracking</option>
                </select>
              </div>
              <div className="flex-1 flex flex-col gap-1 min-w-[120px]">
                <label className="text-xs font-semibold text-gray-500">Từ ngày</label>
                <input
                  type="date"
                  className="px-2 py-1 border rounded text-xs bg-white"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="flex-1 flex flex-col gap-1 min-w-[120px]">
                <label className="text-xs font-semibold text-gray-500">Tới ngày</label>
                <input
                  type="date"
                  className="px-2 py-1 border rounded text-xs bg-white"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div className="flex-1 flex flex-col gap-1 min-w-[120px]">
                <label className="text-xs font-semibold text-gray-500">Kết quả Check</label>
                <MultiSelect
                  label="Tất cả"
                  mainFilter={true}
                  options={getMultiSelectOptions('Kết quả Check')}
                  selected={localFilterValues['Kết quả Check'] || []}
                  onChange={(vals) => setLocalFilterValues((prev) => ({ ...prev, ['Kết quả Check']: vals }))}
                />
              </div>
              <div className="flex-1 flex flex-col gap-1 min-w-[110px]">
                <button
                  onClick={refreshData}
                  className="w-full bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs transition shadow-sm"
                  title="Xóa lọc, xóa thay đổi chưa lưu và tải lại dữ liệu từ server"
                >
                  🗑️ Xóa lọc + Load lại
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-2 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={loadData} disabled={loading} className="bg-green-500 hover:bg-green-600 text-white px-2.5 py-1 rounded text-xs font-medium transition disabled:opacity-50">
              {loading ? '...' : '↻ Load'}
            </button>
            <button
              type="button"
              onClick={clearFfmDisplayFilters}
              disabled={loading}
              title="Xóa ô lọc cột, Từ/Tới ngày, Chi nhánh… — không tải lại, không xóa thay đổi chưa lưu"
              className="bg-slate-500 hover:bg-slate-600 text-white px-2.5 py-1 rounded text-xs font-medium transition disabled:opacity-50"
            >
              ⊗ Xóa lọc hiển thị
            </button>
            {ffmHasMore && !ffmBackgroundLoading && (
              <button
                type="button"
                onClick={loadMoreFfmData}
                disabled={loading || loadingMore}
                className="bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded text-xs font-medium transition disabled:opacity-50"
              >
                {loadingMore ? 'Đang tải…' : '⬇ Tải thêm đơn'}
              </button>
            )}
            <button onClick={() => setSyncPopoverOpen(true)} className="bg-gray-500 hover:bg-gray-600 text-white px-2.5 py-1 rounded text-xs font-medium relative">
              Trạng thái
              {pendingChanges.size > 0 && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center border border-white">
                  {pendingChanges.size}
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={handleUpdateAll}
              title="Gửi các thay đổi đã sửa trên bảng (và dán) lên server"
              className={`px-2.5 py-1 rounded text-xs font-medium text-white transition ${pendingChanges.size > 0 ? 'bg-amber-600 hover:bg-amber-700 ring-2 ring-amber-300' : 'bg-blue-500 hover:bg-blue-600'}`}
            >
              Xác nhận lưu
            </button>
            <button onClick={() => setQuickAddModalOpen(true)} className="bg-indigo-500 hover:bg-indigo-600 text-white px-2.5 py-1 rounded text-xs font-medium">
              ⚡ Thêm nhanh
            </button>
            <button
              type="button"
              onClick={handleExportFilteredExcel}
              title="Tải Excel các cột đã chọn — theo đúng bộ lọc hiện tại (Mã đơn, Tracking, ngày, trạng thái, GHI CHÚ, …)"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-xs font-medium transition"
            >
              ⬇ Tải Excel (theo lọc)
            </button>
            <button onClick={() => setShowColumnSettings(true)} className="bg-gray-600 hover:bg-gray-700 text-white px-2.5 py-1 rounded text-xs font-medium transition flex items-center gap-1">
              ⚙️ Cài đặt cột
            </button>
            <div
              className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100"
              title="Nhập số cột cố định từ trái sang phải khi kéo ngang (freeze cột)."
            >
              Cố định:
              <input
                type="number"
                min={0}
                max={currentColumns.length}
                className="w-10 border-none bg-transparent focus:ring-0 text-center font-bold text-[#F37021]"
                value={fixedColumns}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setFixedColumns(0);
                    return;
                  }
                  const v = Number(raw);
                  setFixedColumns(Number.isFinite(v) ? v : 0);
                }}
                onBlur={() => {
                  setFixedColumns((p) => Math.max(0, Math.min(Math.floor(Number(p) || 0), currentColumns.length)));
                }}
              />
              <span className="text-[10px] opacity-70 tabular-nums">/ {currentColumns.length}</span>
            </div>
          </div>

          {/* Right: Summary & Tracking Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            {ffmBackgroundLoading && (
              <span className="text-amber-700 text-sm font-medium animate-pulse">Đang tải đầy đủ đơn…</span>
            )}
            <div className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded text-xs font-semibold border border-blue-200">
              {getFilteredData.length} đơn | {totalMoney.toLocaleString('vi-VN')} ₫
            </div>
          </div>
        </div>
      </div>

      <div
        className={`bg-white rounded border border-gray-200 relative flex flex-col flex-1 min-h-0 overflow-hidden select-none${isDraggingSelection ? ' ffm-drag-active' : ''}`}
        data-ffm-grid-root
      >
        {loading ? (
          <div className="flex-1 flex flex-col justify-center items-center text-gray-500 bg-white">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full shadow-sm"></div>
              <span className="font-medium animate-pulse">Đang tải dữ liệu đơn hàng...</span>
            </div>
          </div>
        ) : splitPane ? (
          <div className="h-full overflow-y-auto overflow-x-auto flex flex-row items-stretch overscroll-contain">
            <div className="shrink-0 min-h-0 border-r-2 border-gray-300 bg-white z-20 overflow-x-hidden">
              <table data-ffm-pane="left" className={`${tableClassName} w-max`}>
                <thead className="relative">
                  <tr className="sticky top-0 z-[100] bg-[#f8f9fa] align-top shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
                    {frozenCols.map((col) => (
                      <th
                        key={`ff-${col}`}
                        className={
                          col === 'STT'
                            ? 'px-2 py-2.5 border-b-2 border-r border-gray-300 min-w-max align-top bg-[#f8f9fa] whitespace-nowrap overflow-hidden text-ellipsis box-border shadow-[0_1px_0_0_rgba(0,0,0,0.06)]'
                            : 'px-4 py-2.5 border-b-2 border-r border-gray-300 min-w-max align-top bg-[#f8f9fa] whitespace-normal box-border shadow-[0_1px_0_0_rgba(0,0,0,0.06)]'
                        }
                        style={getColumnWidthStyles(col)}
                      >
                        <div className="font-semibold mb-1 text-gray-700">{col}</div>
                        {renderColumnFilterEditor(col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((row, rIdx) => (
                      <tr key={String(row[PRIMARY_KEY_COLUMN])} className="hover:bg-[#E8EAF6] transition-colors">
                        {frozenCols.map((col, i) => {
                          const lastF = i === frozenCols.length - 1;
                          const cellStyle = {
                            ...getColumnWidthStyles(col),
                            ...(lastF ? { boxShadow: '4px 0 8px -4px rgba(0,0,0,0.1)' } : {})
                          };
                          return renderFfmDataCell(row, rIdx, col, i, cellStyle);
                        })}
                      </tr>
                    ))
                  ) : (
                    <tr className="h-0 pointer-events-none">
                      {frozenCols.map((col, i) => (
                        <td key={i} style={getColumnWidthStyles(col)} className="p-0 border-none"></td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Dùng 1 vùng scroll dọc chung ở wrapper cha (`overflow-y-auto`).
                Tránh `overflow-y-clip` vì có thể làm sai chiều cao scroll của cha. */}
            <div className="flex-1 min-w-max min-h-0 overflow-x-visible overflow-y-visible relative">
              {renderFfmEmptyOverlay()}
              <table data-ffm-pane="right" className={`${tableClassName} w-max min-w-max`}>
                <thead className="relative">
                  <tr className="sticky top-0 z-[100] bg-[#f8f9fa] align-top shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
                    {scrollCols.map((col) => (
                      <th
                        key={`sf-${col}`}
                        className="px-4 py-2.5 border-b-2 border-r border-gray-300 min-w-max align-top bg-[#f8f9fa] whitespace-normal box-border shadow-[0_1px_0_0_rgba(0,0,0,0.06)]"
                        style={getColumnWidthStyles(col)}
                      >
                        <div className="font-semibold mb-1 text-gray-700">{col}</div>
                        {renderColumnFilterEditor(col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((row, rIdx) => (
                      <tr key={String(row[PRIMARY_KEY_COLUMN])} className="hover:bg-[#E8EAF6] transition-colors">
                        {scrollCols.map((col, i) => {
                          const cIdx = effectiveFixedColumns + i;
                          const cellStyle = { ...getColumnWidthStyles(col), position: 'relative', zIndex: 0 };
                          return renderFfmDataCell(row, rIdx, col, cIdx, cellStyle);
                        })}
                      </tr>
                    ))
                  ) : (
                    <tr className="h-0 pointer-events-none">
                      {scrollCols.map((col, i) => (
                        <td key={i} style={getColumnWidthStyles(col)} className="p-0 border-none"></td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white">
            {/* 1. FIXED HEADER AREA */}
            <div
              ref={ffmHeaderContainerRef}
              className="overflow-hidden border-b-2 border-gray-300 bg-[#f8f9fa] shrink-0 shadow-sm"
              style={{ paddingRight: '15px' }}
            >
              <table
                ref={headerTableRef}
                className={`${tableClassName} w-max`}
                style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}
              >
                <thead className="bg-[#f8f9fa]">
                  <tr className="bg-[#f8f9fa] align-top">
                    {currentColumns.map((col, idx) => {
                      const colWidthStyles = getColumnWidthStyles(col);
                      const lastFrozen = idx === effectiveFixedColumns - 1;
                      let stickyStyle = { ...colWidthStyles };

                      // Vẫn hỗ trợ freeze cột ngang cho header
                      if (idx < effectiveFixedColumns) {
                        stickyStyle = {
                          ...stickyStyle,
                          position: 'sticky',
                          left: getStickyLeftPx(idx),
                          zIndex: 11000,
                          background: '#f8f9fa',
                          backgroundClip: 'padding-box',
                          contain: 'none',
                          ...(lastFrozen ? { boxShadow: '4px 0 8px -4px rgba(0,0,0,0.12)' } : {})
                        };
                      } else {
                        stickyStyle = {
                          ...stickyStyle,
                          background: '#f8f9fa',
                        };
                      }

                      return (
                        <th
                          key={`head-${col}`}
                          data-col-idx={idx}
                          className={
                            col === 'STT'
                              ? 'px-2 py-2.5 border-b-2 border-r border-gray-300 min-w-max align-top bg-[#f8f9fa] whitespace-nowrap overflow-hidden text-ellipsis box-border'
                              : 'px-4 py-2.5 border-b-2 border-r border-gray-300 min-w-max align-top bg-[#f8f9fa] whitespace-normal box-border'
                          }
                          style={stickyStyle}
                        >
                          <div className="font-semibold mb-1 text-gray-700">{col}</div>
                          {renderColumnFilterEditor(col)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
              </table>
            </div>

            {/* 2. SCROLLABLE BODY AREA */}
            <div
              ref={ffmScrollContainerRef}
              className="flex-1 overflow-auto overscroll-contain bg-white relative"
              onScroll={(e) => {
                if (ffmHeaderContainerRef.current) {
                  ffmHeaderContainerRef.current.scrollLeft = e.target.scrollLeft;
                }
              }}
            >
              {renderFfmEmptyOverlay()}
              <table ref={tableRef} className={`${tableClassName} w-max`} style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                <tbody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((row, rIdx) => {
                      const orderId = row[PRIMARY_KEY_COLUMN];
                      return (
                        <tr key={orderId} className="hover:bg-[#E8EAF6] transition-colors">
                          {currentColumns.map((col, cIdx) => {
                            const colWidthStyles = getColumnWidthStyles(col);
                            const lastFrozenCol = cIdx === effectiveFixedColumns - 1;
                            const cellStyle = cIdx < effectiveFixedColumns
                              ? {
                                position: 'sticky',
                                left: getStickyLeftPx(cIdx),
                                zIndex: 20,
                                ...colWidthStyles,
                                ...(lastFrozenCol ? { boxShadow: '4px 0 8px -4px rgba(0,0,0,0.1)' } : {})
                              }
                              : { ...colWidthStyles };
                            return renderFfmDataCell(row, rIdx, col, cIdx, cellStyle);
                          })}
                        </tr>
                      );
                    })
                  ) : (
                    <tr className="h-0 pointer-events-none">
                      {currentColumns.map((col, idx) => (
                        <td key={idx} style={getColumnWidthStyles(col)} className="p-0 border-none"></td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <div className="bg-white p-3 rounded shadow-sm mt-4 flex justify-center items-center gap-4">
        <button disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)} className="px-4 py-2 bg-primary text-white rounded disabled:bg-gray-300">
          Trang trước
        </button>
        <span className="text-sm font-medium text-gray-600">Trang {currentPage} / {totalPages || 1}</span>
        <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)} className="px-4 py-2 bg-primary text-white rounded disabled:bg-gray-300">
          Trang sau
        </button>
        <div className="flex items-center gap-2 ml-4">
          <label className="text-sm text-gray-500">Số dòng:</label>
          <select className="border rounded p-1 text-sm" value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
            <option value="50">50</option>
            <option value="70">70</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
        </div>
      </div>

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
            <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] mr-1">Del</kbd> Xóa ô
            <span className="mx-2">|</span>
            <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] mr-1">Esc</kbd> Bỏ chọn
          </div>
        </div>
      )}

      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto min-w-[300px] p-4 rounded shadow-lg bg-white border-l-4 transform transition-all animate-in slide-in-from-right-10 duration-300 ${t.type === 'success'
              ? 'border-success bg-green-50'
              : t.type === 'error'
                ? 'border-danger bg-red-50'
                : t.type === 'loading'
                  ? 'border-primary bg-blue-50'
                  : 'border-primary bg-white'
              }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                {t.type === 'loading' && <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>}
                <span className="text-sm font-medium text-gray-800">{t.message}</span>
              </div>
              <button onClick={() => removeToast(t.id)} className="text-gray-400 hover:text-gray-600 font-bold">
                &times;
              </button>
            </div>
          </div>
        ))}
      </div>

      <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>}>
        <SyncPopover
          isOpen={syncPopoverOpen}
          onClose={() => setSyncPopoverOpen(false)}
          pendingChanges={pendingChanges}
          applyButtonLabel="Xác nhận lưu"
          onApply={handleUpdateAll}
          onDiscard={() => {
            if (confirm('Hủy bỏ tất cả thay đổi?')) {
              // Không re-fetch toàn bộ danh sách.
              // Hoàn tác đúng các cột đã thay đổi về lại `originalValue` đang nằm trong pendingChanges.
              const revertEntries = [];
              pendingChanges.forEach((cols, orderId) => {
                cols.forEach(({ originalValue }, colKey) => {
                  revertEntries.push({ orderId, colKey, originalValue });
                });
              });

              setAllData((prevData) => {
                const next = [...prevData];
                revertEntries.forEach(({ orderId, colKey, originalValue }) => {
                  const idx = next.findIndex((r) => r[PRIMARY_KEY_COLUMN] === orderId);
                  if (idx > -1) {
                    next[idx] = { ...next[idx], [colKey]: originalValue };
                  }
                });
                return next;
              });

              setPendingChanges(new Map());
              savePendingToLocalStorage(new Map());
              localStorage.removeItem(FFM_HCM_PENDING_LS_KEY);
              setSyncPopoverOpen(false);
            }
          }}
        />
      </Suspense>

      <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>}>
        <QuickAddModal
          isOpen={quickAddModalOpen}
          onClose={() => setQuickAddModalOpen(false)}
          onSync={handleQuickSync}
          existingTrackingOwnerMap={existingTrackingOwnerMap}
        />
      </Suspense>

      <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>}>
        <ColumnSettingsModal
          isOpen={showColumnSettings}
          onClose={() => setShowColumnSettings(false)}
          allColumns={ffmColumns}
          visibleColumns={visibleColumns}
          onToggleColumn={(col) => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))}
          onSelectAll={() => {
            const all = {};
            ffmColumns.forEach(col => { all[col] = true; });
            setVisibleColumns(all);
          }}
          onDeselectAll={() => {
            const none = {};
            ffmColumns.forEach(col => { none[col] = false; });
            setVisibleColumns(none);
          }}
          onResetDefault={() => {
            const defaultCols = {};
            ffmColumns.forEach(col => { defaultCols[col] = true; });
            setVisibleColumns(defaultCols);
          }}
          defaultColumns={ffmColumns}
        />
      </Suspense>
    </div>
  );
}

export default FFMMgtHcm;
