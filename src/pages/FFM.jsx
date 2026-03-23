import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MultiSelect from '../components/MultiSelect';
import usePermissions from '../hooks/usePermissions';
import * as API from '../services/api';
import { supabase } from '../supabase/config';
import '../styles/selection.css';
import {
  COLUMN_MAPPING,
  DROPDOWN_OPTIONS,
  EDITABLE_COLS,
  ORDER_MGMT_COLUMNS,
  PRIMARY_KEY_COLUMN,
  TEAM_COLUMN_NAME
} from '../types';
import { rafThrottle } from '../utils/throttle';

const SyncPopover = lazy(() => import('../components/SyncPopover'));
const QuickAddModal = lazy(() => import('../components/QuickAddModal'));
const ColumnSettingsModal = lazy(() => import('../components/ColumnSettingsModal'));
const BillImageViewer = lazy(() => import('../components/BillImageViewer'));


function FFM() {
  const { canView } = usePermissions();



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
    const saved = localStorage.getItem('ffm_visibleColumns');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing saved columns:', e);
      }
    }
    // Initialize with default columns
    const initial = {};
    ORDER_MGMT_COLUMNS.forEach(col => {
      initial[col] = true;
    });
    return initial;
  });

  const [filterValues, setFilterValues] = useState({
    market: [],
    product: [],
    tracking_include: '',
    tracking_exclude: '',
    tracking_status: 'Tình trạng mã'
  });
  const [localFilterValues, setLocalFilterValues] = useState(filterValues);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilterValues(localFilterValues);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [localFilterValues]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fixedColumns, setFixedColumns] = useState(2);

  const [omActiveTeam, setOmActiveTeam] = useState('all');
  const [omDateType, setOmDateType] = useState('Ngày đóng hàng');
  const [showFilters, setShowFilters] = useState(true); // Collapse/expand filters

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const [selection, setSelection] = useState({ startRow: null, startCol: null, endRow: null, endCol: null });
  const [copiedData, setCopiedData] = useState(null);
  const [copiedSelection, setCopiedSelection] = useState(null);
  const isSelecting = useRef(false);

  const [mgtNoiBoOrder, setMgtNoiBoOrder] = useState([]);
  const [canViewHaNoi, setCanViewHaNoi] = useState(false); // User có quyền xem tab Hà Nội không (dựa trên can_day_ffm)

  const updateQueue = useRef(new Map()); // Legacy

  const changeHistoryRef = useRef([]); // Stack for Ctrl-Z
  const historyIndexRef = useRef(-1);
  const dbQueueRef = useRef([]); // FIFO Queue for Backend
  const isProcessingQueue = useRef(false);

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
    const storedChanges = localStorage.getItem('speegoPendingChanges');
    if (storedChanges) {
      try {
        const parsed = JSON.parse(storedChanges);
        const map = new Map();
        const initialDbQueue = [];
        for (const id in parsed) {
          const innerMap = new Map();
          for (const key in parsed[id]) {
            innerMap.set(key, parsed[id][key]);
            initialDbQueue.push({ 
              orderId: id, 
              colKey: key, 
              newValue: parsed[id][key].newValue, 
              originalValue: parsed[id][key].originalValue 
            });
          }
          map.set(id, innerMap);
        }
        setPendingChanges(map);
        dbQueueRef.current = initialDbQueue;
        if (initialDbQueue.length > 0) {
          setTimeout(() => processDbQueue(), 1000);
        }
      } catch (e) {
        console.error('Error loading pending changes', e);
      }
    }
  }, []);

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

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await API.fetchFFMOrders?.() || await API.fetchOrders();
      // Debug: Kiểm tra dữ liệu tracking_code
      if (data.length > 0) {
        const sample = data[0];
        console.log('🔍 [FFM] Sample data keys:', Object.keys(sample));
        console.log('🔍 [FFM] Sample tracking_code:', sample.tracking_code);
        console.log('🔍 [FFM] Sample Mã Tracking:', sample['Mã Tracking']);
        const withTracking = data.filter(row => {
          const tc = String(row['tracking_code'] || row['Mã Tracking'] || row.tracking_code || '').trim();
          return tc !== '' && tc !== 'null' && tc !== 'undefined';
        });
        console.log(`📊 [FFM] Tổng ${data.length} đơn, trong đó ${withTracking.length} đơn có tracking code`);
      }
      setAllData(data);

      if (data.length === 2 && data[0][PRIMARY_KEY_COLUMN] === 'DEMO001') {
        addToast('⚠️ Đang sử dụng dữ liệu demo do API lỗi. Kiểm tra kết nối mạng.', 'error', 8000);
      } else {
        addToast(`✅ Đã tải ${data.length} đơn hàng`, 'success', 2000);
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
    const defaultFilters = {
      market: [],
      product: [],
      tracking_include: '',
      tracking_exclude: '',
      tracking_status: 'Tình trạng mã'
    };
    setFilterValues(defaultFilters);
    setLocalFilterValues(defaultFilters);
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
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
    localStorage.setItem('speegoPendingChanges', JSON.stringify(changesToSave));
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
    return ORDER_MGMT_COLUMNS.filter(col => visibleColumns[col] === true);
  }, [visibleColumns]);

  // Save column visibility to localStorage
  useEffect(() => {
    if (Object.keys(visibleColumns).length > 0) {
      localStorage.setItem('ffm_visibleColumns', JSON.stringify(visibleColumns));
    }
  }, [visibleColumns]);

  const getFilteredData = useMemo(() => {
    let data = [...allData];

    data = data.map((row) => {
      const orderId = row[PRIMARY_KEY_COLUMN];
      let rowCopy = { ...row };

      rowCopy['Ngày đẩy đơn'] = extractDateFromDateTime(row['time_dayon'] || row.time_dayon || row['Ngày Kế toán đối soát với FFM lần 2']);
      rowCopy['Ngày có mã tracking'] = extractDateFromDateTime(row['Ngày Kế toán đối soát với FFM lần 1']);

      const pending = pendingChanges.get(orderId);
      if (pending) {
        pending.forEach((info, key) => {
          rowCopy[key] = info.newValue;
        });
      }
      return rowCopy;
    });

    // ORDER_MANAGEMENT filtering
    {
      // FFM đẩy vận hành: Đã filter ở API level (MGT, Kết quả Check="OK")
      // Tracking code được filter ở client-side theo tab đã chọn

      if (omActiveTeam === 'mgt_noi_bo') {
        const orderedIds = new Set(mgtNoiBoOrder);
        data = data.filter((row) => orderedIds.has(row[PRIMARY_KEY_COLUMN]));
      } else if (omActiveTeam !== 'all') {
        data = data.filter((row) => row[TEAM_COLUMN_NAME] === omActiveTeam);
      }

      // Sort by rowIndex
      data.sort((a, b) => Number(a['rowIndex'] || 0) - Number(b['rowIndex'] || 0));
    }

    const activeDateType = omDateType;

    if (filterValues.market.length > 0) {
      const set = new Set(filterValues.market);
      data = data.filter((row) => set.has(row['Khu vực'] || row['khu vực']));
    }
    if (filterValues.product.length > 0) {
      const set = new Set(filterValues.product);
      data = data.filter((row) => set.has(row['Mặt hàng']));
    }

    if (dateFrom) {
      const d = new Date(dateFrom);
      d.setHours(0, 0, 0, 0);
      data = data.filter((row) => {
        let val = row[activeDateType];
        // Đặc biệt xử lý "Ngày đẩy đơn" - lấy từ time_dayon
        if (activeDateType === 'Ngày đẩy đơn') {
          val = row['time_dayon'] || row.time_dayon || row['Ngày đẩy đơn'];
        }
        if (!val) return false;
        return new Date(val).getTime() >= d.getTime();
      });
    }
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      data = data.filter((row) => {
        let val = row[activeDateType];
        // Đặc biệt xử lý "Ngày đẩy đơn" - lấy từ time_dayon
        if (activeDateType === 'Ngày đẩy đơn') {
          val = row['time_dayon'] || row.time_dayon || row['Ngày đẩy đơn'];
        }
        if (!val) return false;
        return new Date(val).getTime() <= d.getTime();
      });
    }

    Object.entries(filterValues).forEach(([key, val]) => {
      if (['market', 'product', 'tracking_include', 'tracking_exclude', 'tracking_status'].includes(key)) return;
      if (Array.isArray(val) && val.length === 0) return;
      if (typeof val === 'string' && val.trim() === '') return;

      const dataKey = COLUMN_MAPPING[key] || key;

      data = data.filter((row) => {
        let cellValue = row[dataKey] ?? row[key] ?? row[key.replace(/ /g, '_')] ?? row[dataKey.replace(/ /g, '_')] ?? '';
        cellValue = String(cellValue).trim();

        if (DROPDOWN_OPTIONS[dataKey] || DROPDOWN_OPTIONS[key] || ['Trạng thái giao hàng', 'Kết quả check', 'GHI CHÚ'].includes(dataKey)) {
          const selected = val;
          if (selected.length === 0) return true;
          if (cellValue === '' && selected.includes('__EMPTY__')) return true;
          return selected.includes(cellValue);
        }

        if (['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking'].includes(key)) {
          if (!cellValue) return false;
          // Đặc biệt xử lý "Ngày đẩy đơn" - lấy từ time_dayon
          if (key === 'Ngày đẩy đơn') {
            cellValue = row['time_dayon'] || row.time_dayon || cellValue;
          }
          const dVal = new Date(cellValue);
          dVal.setHours(0, 0, 0, 0);
          const fVal = new Date(val);
          fVal.setHours(0, 0, 0, 0);
          return dVal >= fVal;
        }

        return cellValue.toLowerCase().includes(String(val).toLowerCase());
      });
    });

    if (filterValues.tracking_status || filterValues.tracking_include || filterValues.tracking_exclude) {
      const inc = filterValues.tracking_include ? String(filterValues.tracking_include).toLowerCase() : '';
      const exc = filterValues.tracking_exclude ? String(filterValues.tracking_exclude).toLowerCase() : '';
      const status = filterValues.tracking_status || 'Tình trạng mã';

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
            if (inc.includes('\n')) {
              const codes = new Set(inc.split('\n').map((t) => t.trim()).filter(Boolean).map(t => t.toLowerCase()));
              if (!codes.has(lowerCode)) return false;
            } else {
              if (!lowerCode.includes(inc)) return false;
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

    return data;
  }, [allData, pendingChanges, omActiveTeam, omDateType, filterValues, dateFrom, dateTo, mgtNoiBoOrder]);

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
    }
  }, [addToast, removeToast, deepCloneMapOfMaps]);

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
    const originalRow = allData.find((r) => r[PRIMARY_KEY_COLUMN] === orderId);
    const baseValue = originalRow ? String(originalRow[colKey] ?? '') : '';

    const pendingVal = pendingChanges.get(orderId)?.get(colKey);
    const stepOriginalValue = pendingVal ? pendingVal.newValue : baseValue;

    if (String(newValue) === String(stepOriginalValue)) return;

    pushChange([{ orderId, colKey, originalValue: String(stepOriginalValue), newValue: String(newValue) }]);
  }, [allData, pendingChanges, pushChange]);

  const handleUpdateAll = async () => {
    setSyncPopoverOpen(false);
    if (dbQueueRef.current.length === 0) {
      addToast('Không có thay đổi cần cập nhật', 'info');
      return;
    }
    processDbQueue();
  };
  const handleQuickSync = (rows) => {
    const changesArray = [];
    const COL_KEYS = [
      'Mã đơn hàng',
      'Mã Tracking',
      'Ngày đóng hàng',
      'Trạng thái giao hàng',
      'GHI CHÚ',
      'Thời gian giao dự kiến',
      'Phí ship nội địa Mỹ (usd)',
      'Phí xử lý đơn đóng hàng-Lưu kho(usd)',
      'Kết quả Check',
      'Ghi chú',
      'Đơn vị vận chuyển'
    ];
    let notFoundCount = 0;

    rows.forEach((row) => {
      const orderId = row[0]?.trim();
      if (!orderId) return;
      const originalRow = allData.find((r) => r[PRIMARY_KEY_COLUMN] === orderId);
      if (!originalRow) {
        notFoundCount++;
        return;
      }

      COL_KEYS.forEach((colName, idx) => {
        if (idx === 0) return;
        const val = row[idx];
        if (val !== undefined && val !== '') {
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
      processDbQueue();
    }
  };


  const effectiveRowsPerPage = rowsPerPage;

  const paginatedData = useMemo(() => {
    return getFilteredData.slice((currentPage - 1) * effectiveRowsPerPage, currentPage * effectiveRowsPerPage);
  }, [getFilteredData, currentPage, effectiveRowsPerPage]);
  const totalPages = Math.ceil(getFilteredData.length / effectiveRowsPerPage);

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

  const handleMouseDown = useCallback((rowIndex, colIndex, e) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
    e.preventDefault();

    if (e.shiftKey && selection.startRow !== null) {
      setSelection((prev) => ({ ...prev, endRow: rowIndex, endCol: colIndex }));
    } else {
      isSelecting.current = true;
      setSelection({ startRow: rowIndex, startCol: colIndex, endRow: rowIndex, endCol: colIndex });
      setCopiedSelection(null);
    }
  }, [selection.startRow]);

  const throttledSetSelection = useRef(
    rafThrottle((rowIndex, colIndex) => {
      setSelection((prev) => ({ ...prev, endRow: rowIndex, endCol: colIndex }));
    })
  ).current;

  const handleMouseEnter = useCallback(
    (rowIndex, colIndex) => {
      if (isSelecting.current) {
        throttledSetSelection(rowIndex, colIndex);
      }
    },
    [throttledSetSelection]
  );

  const handleMouseUp = useCallback(() => {
    isSelecting.current = false;
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

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
  }, [selection, quickAddModalOpen, handleCopy, getSelectionBounds, paginatedData.length, currentColumns.length, handleUndo, handleRedo, paginatedData, currentColumns]);

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
            const colIndex = Array.from(tr.children).indexOf(td);
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
          if (!EDITABLE_COLS.includes(colName)) {
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
          }
        }
      }

      setCopiedSelection(null);
      setCopiedData(null);

      if (pasteChanges.length > 0) {
        pushChange(pasteChanges);
        const msg = skippedCount > 0 ? `✅ Đã dán ${updatedCount} ô (${skippedCount} ô không thể sửa)` : `✅ Đã dán ${updatedCount} ô dữ liệu`;
        addToast(msg, 'success', 2500);
      } else {
        addToast('Không có dữ liệu mới để dán', 'info', 2000);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [selection, pendingChanges, quickAddModalOpen, currentColumns, paginatedData, getSelectionBounds]);

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

  const totalMoney = useMemo(() => {
    return getFilteredData.reduce((sum, row) => {
      let val = row['Tổng tiền VNĐ'] || row['Tổng_tiền_VNĐ'] || row['Giá bán'] || 0;
      const num = parseFloat(String(val).replace(/[^\d.-]/g, '')) || 0;
      return sum + num;
    }, 0);
  }, [getFilteredData]);

  const getCellClass = (row, col, val, rIdx, cIdx) => {
    let classes = 'px-3 py-2 border border-gray-200 text-sm h-[38px] whitespace-nowrap ';

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

    const isEditable = EDITABLE_COLS.includes(col);
    if (isEditable) {
      const orderId = row[PRIMARY_KEY_COLUMN];
      if (pendingChanges.get(orderId)?.has(COLUMN_MAPPING[col] || col)) {
        classes += '!bg-yellow-300 ';
      } else {
        classes += 'bg-[#e8f5e9] ';
      }
    }

    if (cIdx < fixedColumns) {
      classes += 'sticky z-10 left-0 bg-gray-50 ';
    }

    if (
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
  };

  if (!canView('ORDERS_FFM')) {
    return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này (ORDERS_FFM).</div>;
  }

  return (
    <div className="min-h-screen flex flex-col p-4 font-sans text-gray-800 bg-[#f8f9fa]">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Fbe61f44f.%E1%BA%A2nh.021347.png"
              alt="Header"
              className="h-10 object-contain"
            />
            <h2 className="text-xl font-bold text-gray-700">HỆ THỐNG QUẢN LÝ SPEEGO</h2>
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-gray-600">{allData.length} đơn hàng</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Section - Collapsible */}
      <div className="bg-white rounded-lg shadow-sm mb-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-t-lg"
        >
          <span className="font-semibold text-gray-700">🔍 Bộ lọc</span>
          <span className="text-gray-500">{showFilters ? '▲' : '▼'}</span>
        </button>
        {showFilters && (
          <div className="px-4 pb-4 border-t border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Thị trường</label>
                <MultiSelect
                  label="Tất cả"
                  mainFilter={true}
                  options={getUniqueValues('Khu vực')}
                  selected={filterValues.market}
                  onChange={(vals) => setFilterValues((prev) => ({ ...prev, market: vals }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Sản phẩm</label>
                <MultiSelect
                  label="Tất cả"
                  mainFilter={true}
                  options={getUniqueValues('Mặt hàng')}
                  selected={filterValues.product}
                  onChange={(vals) => setFilterValues((prev) => ({ ...prev, product: vals }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Loại ngày</label>
                <select className="px-2 py-1.5 border rounded text-sm bg-white" value={omDateType} onChange={(e) => setOmDateType(e.target.value)}>
                  <option value="Ngày lên đơn">Ngày lên đơn</option>
                  <option value="Ngày đóng hàng">Ngày đóng hàng</option>
                  <option value="Ngày đẩy đơn">Ngày đẩy đơn</option>
                  <option value="Ngày có mã tracking">Ngày có mã tracking</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Từ ngày</label>
                <input
                  type="date"
                  className="px-2 py-1.5 border rounded text-sm bg-white"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Tới ngày</label>
                <input
                  type="date"
                  className="px-2 py-1.5 border rounded text-sm bg-white"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1 justify-end">
                <button onClick={refreshData} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-sm transition shadow-sm">
                  🗑️ Xóa lọc
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="sticky top-0 z-[40] bg-white rounded-lg shadow-sm border border-gray-200 mb-4 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={loadData} disabled={loading} className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium transition disabled:opacity-50">
              {loading ? '...' : '↻ Load'}
            </button>
            <button onClick={() => setSyncPopoverOpen(true)} className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded text-sm font-medium relative">
              Trạng thái
              {pendingChanges.size > 0 && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center border border-white">
                  {pendingChanges.size}
                </div>
              )}
            </button>
            <button onClick={handleUpdateAll} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium">
              Cập nhật
            </button>
            <button onClick={() => setQuickAddModalOpen(true)} className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded text-sm font-medium">
              ⚡ Thêm nhanh
            </button>
            <button onClick={() => setShowColumnSettings(true)} className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded text-sm font-medium transition flex items-center gap-1">
              ⚙️ Cài đặt cột
            </button>
          </div>

          {/* Right: Summary & Tracking Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded text-sm font-semibold border border-blue-200">
              {getFilteredData.length} đơn | {totalMoney.toLocaleString('vi-VN')} ₫
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-md rounded border border-gray-200 overflow-auto max-h-[65vh] relative select-none">
        <table className="w-full border-collapse min-w-[2500px] text-sm">
          <thead className="sticky top-0 z-30">
            <tr className="bg-gray-100 h-12">
              {currentColumns.map((col, idx) => {
                const key = COLUMN_MAPPING[col] || col;
                const filterKey = col;
                const stickyStyle = idx < fixedColumns ? { position: 'sticky', left: idx * 100, zIndex: 40, background: '#f8f9fa' } : {};

                return (
                  <th key={`filter-${col}`} className="p-1.5 border-b-2 border-r border-gray-300 min-w-[120px] align-top bg-[#f8f9fa]" style={stickyStyle}>
                    <div className="font-semibold mb-1 text-gray-700">{col}</div>
                    {col === 'STT' ? (
                      <div className="text-xs text-gray-400">-</div>
                    ) : col === 'Mã Tracking' ? (
                      <div className="flex flex-col gap-1.5 relative" style={{ zIndex: 1002 }}>
                        <select
                          className="w-full text-[13px] px-2 py-1.5 border rounded bg-white font-semibold text-gray-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                          value={localFilterValues.tracking_status || 'Tình trạng mã'}
                          onChange={e => setLocalFilterValues(p => ({ ...p, tracking_status: e.target.value }))}
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
                    ) : DROPDOWN_OPTIONS[col] || DROPDOWN_OPTIONS[key] || ['Trạng thái giao hàng', 'Kết quả check', 'GHI CHÚ'].includes(col) ? (
                      <MultiSelect
                        label={`Lọc...`}
                        options={getMultiSelectOptions(col)}
                        selected={filterValues[filterKey] || []}
                        onChange={(vals) => setFilterValues((p) => ({ ...p, [filterKey]: vals }))}
                      />
                    ) : ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2'].includes(col) ? (
                      <input
                        type="date"
                        className="w-full text-xs px-1 py-1 border rounded shadow-sm"
                        value={filterValues[filterKey] || ''}
                        onChange={(e) => setFilterValues((p) => ({ ...p, [filterKey]: e.target.value }))}
                      />
                    ) : (
                      <input
                        type="text"
                        className="w-full text-xs px-1 py-1 border rounded shadow-sm"
                        placeholder="..."
                        value={localFilterValues[filterKey] || ''}
                        onChange={(e) => setLocalFilterValues((p) => ({ ...p, [filterKey]: e.target.value }))}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={currentColumns.length} className="text-center p-10 text-gray-500">
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={currentColumns.length} className="text-center p-10 text-gray-500 italic">
                  Không có dữ liệu phù hợp
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rIdx) => {
                const orderId = row[PRIMARY_KEY_COLUMN];
                return (
                  <tr key={orderId} className="hover:bg-[#E8EAF6] transition-colors">
                    {currentColumns.map((col, cIdx) => {
                      const key = COLUMN_MAPPING[col] || col;
                      // Đặc biệt xử lý cho "Mã Tracking" - kiểm tra cả tracking_code (DB) và Mã Tracking (mapped)
                      let val = '';
                      if (col === 'Mã Tracking') {
                        val = row['Mã Tracking'] ?? row['tracking_code'] ?? row.tracking_code ?? '';
                      } else if (col === 'Ngày đẩy đơn') {
                        // Đặc biệt xử lý "Ngày đẩy đơn" - lấy từ time_dayon
                        val = row['time_dayon'] ?? row.time_dayon ?? row['Ngày đẩy đơn'] ?? row[key] ?? '';
                      } else if (col === 'Payment Bill') {
                        // Lấy từ cả tên hiển thị và database
                        val = row['Payment Bill'] ?? row.payment_bill ?? row[key] ?? '';
                      } else if (col === 'Payment Image') {
                        // Lấy từ cả tên hiển thị và database
                        val = row['Payment Image'] ?? row.payment_image ?? row[key] ?? '';
                      } else {
                        val = row[key] ?? row[col] ?? row[col.replace(/ /g, '_')] ?? '';
                      }

                      // Merge pending changes vào giá trị hiển thị
                      const pendingInfo = pendingChanges.get(orderId)?.get(key);
                      if (pendingInfo) {
                        val = pendingInfo.newValue;
                      }

                      const displayVal = ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2', 'Thời gian giao dự kiến'].includes(col)
                        ? formatDate(val)
                        : col === 'Tổng tiền VNĐ'
                          ? Number(String(val).replace(/[^\d.-]/g, '')).toLocaleString('vi-VN')
                          : val;

                      const cellStyle = cIdx < fixedColumns ? { position: 'sticky', left: cIdx * 100, zIndex: 10 } : {};

                      return (
                        <td
                          key={`${orderId}-${col}`}
                          className={getCellClass(row, col, String(displayVal), rIdx, cIdx)}
                          style={cellStyle}
                          onMouseDown={(e) => handleMouseDown(rIdx, cIdx, e)}
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
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          ) : (col === 'Kết quả Check' || col === 'Trạng thái giao hàng') ? (
                            <select
                              className="w-full bg-transparent border-none outline-none text-sm p-0 m-0"
                              value={String(val)}
                              onChange={(e) => handleCellChange(orderId, key, e.target.value)}
                            >
                              {getMultiSelectOptions(key)
                                .filter((o) => o !== '__EMPTY__')
                                .map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                            </select>
                          ) : col === 'Payment Bill' ? (
                            <select
                              className="w-full bg-transparent border-none outline-none text-sm p-0 m-0 cursor-pointer"
                              value={String(val)}
                              onChange={(e) => handleCellChange(orderId, key, e.target.value)}
                            >
                              {DROPDOWN_OPTIONS['Payment Bill']?.map((o) => (
                                <option key={o} value={o}>
                                  {o || '-- Chọn --'}
                                </option>
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
                          ) : EDITABLE_COLS.includes(col) ? (
                            <input
                              type="text"
                              key={`${orderId}-${col}-${String(displayVal)}`}
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
          onApply={handleUpdateAll}
          onDiscard={() => {
            if (confirm('Hủy bỏ tất cả thay đổi?')) {
              setPendingChanges(new Map());
              savePendingToLocalStorage(new Map());
              localStorage.removeItem('speegoPendingChanges');
              setSyncPopoverOpen(false);
              refreshData();
            }
          }}
        />
      </Suspense>

      <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>}>
        <QuickAddModal 
          isOpen={quickAddModalOpen} 
          onClose={() => setQuickAddModalOpen(false)} 
          onSync={handleQuickSync}
        />
      </Suspense>

      <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>}>
        <ColumnSettingsModal
          isOpen={showColumnSettings}
          onClose={() => setShowColumnSettings(false)}
          allColumns={ORDER_MGMT_COLUMNS}
          visibleColumns={visibleColumns}
          onToggleColumn={(col) => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))}
          onSelectAll={() => {
            const all = {};
            ORDER_MGMT_COLUMNS.forEach(col => { all[col] = true; });
            setVisibleColumns(all);
          }}
          onDeselectAll={() => {
            const none = {};
            ORDER_MGMT_COLUMNS.forEach(col => { none[col] = false; });
            setVisibleColumns(none);
          }}
          onResetDefault={() => {
            const defaultCols = {};
            ORDER_MGMT_COLUMNS.forEach(col => { defaultCols[col] = true; });
            setVisibleColumns(defaultCols);
          }}
          defaultColumns={ORDER_MGMT_COLUMNS}
        />
      </Suspense>
    </div>
  );
}

export default FFM;
