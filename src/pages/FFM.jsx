import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import {
  PRIMARY_KEY_COLUMN,
  ORDER_MGMT_COLUMNS,
  COLUMN_MAPPING,
  EDITABLE_COLS,
  TEAM_COLUMN_NAME,
  DROPDOWN_OPTIONS
} from '../types';
import '../styles/selection.css';
import * as API from '../services/api';
import MultiSelect from '../components/MultiSelect';
import { rafThrottle } from '../utils/throttle';

const SyncPopover = lazy(() => import('../components/SyncPopover'));
const QuickAddModal = lazy(() => import('../components/QuickAddModal'));

const UPDATE_DELAY = 500;
const BULK_THRESHOLD = 1;

function FFM() {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(false);
  // Only ORDER_MANAGEMENT mode - BILL_OF_LADING removed
  const viewMode = 'ORDER_MANAGEMENT';

  const [legacyChanges, setLegacyChanges] = useState(new Map());
  const [pendingChanges, setPendingChanges] = useState(new Map());
  const [syncPopoverOpen, setSyncPopoverOpen] = useState(false);
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);

  const [filterValues, setFilterValues] = useState({
    market: [],
    product: [],
    tracking_include: '',
    tracking_exclude: ''
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
  const [omShowTracking, setOmShowTracking] = useState(false);
  const [omShowDuplicateTracking, setOmShowDuplicateTracking] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const [selection, setSelection] = useState({ startRow: null, startCol: null, endRow: null, endCol: null });
  const [copiedData, setCopiedData] = useState(null);
  const [copiedSelection, setCopiedSelection] = useState(null);
  const isSelecting = useRef(false);

  const [mgtNoiBoOrder, setMgtNoiBoOrder] = useState([]);

  const updateQueue = useRef(new Map());

  const [toasts, setToasts] = useState([]);
  const toastIdCounter = useRef(0);

  useEffect(() => {
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
        console.error('Error loading pending changes', e);
      }
    }
  }, []);


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

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await API.fetchFFMOrders?.() || await API.fetchOrders();
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
      tracking_exclude: ''
    };
    setFilterValues(defaultFilters);
    setLocalFilterValues(defaultFilters);
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
    await loadData();
  };

  const currentColumns = ORDER_MGMT_COLUMNS;

  const getFilteredData = useMemo(() => {
    let data = [...allData];

    data = data.map((row) => {
      const orderId = row[PRIMARY_KEY_COLUMN];
      let rowCopy = { ...row };

      rowCopy['Ngày đẩy đơn'] = extractDateFromDateTime(row['Ngày Kế toán đối soát với FFM lần 2']);
      rowCopy['Ngày có mã tracking'] = extractDateFromDateTime(row['Ngày Kế toán đối soát với FFM lần 1']);

      const legacy = legacyChanges.get(orderId);
      if (legacy) {
        legacy.forEach((info, key) => {
          rowCopy[key] = info.newValue;
        });
      }
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
      data = data.filter((row) => {
        const carrier = row['Đơn vị vận chuyển'] || row['Đơn_vị_vận_chuyển'];
        return carrier?.toString().toUpperCase() === 'MGT';
      });

      if (omActiveTeam === 'mgt_noi_bo') {
        const orderedIds = new Set(mgtNoiBoOrder);
        data = data.filter((row) => orderedIds.has(row[PRIMARY_KEY_COLUMN]));
      } else if (omActiveTeam !== 'all') {
        data = data.filter((row) => row[TEAM_COLUMN_NAME] === omActiveTeam);
      }

      if (omShowDuplicateTracking) {
        const counts = new Map();
        data.forEach((r) => {
          const code = String(r['Mã Tracking'] || '').trim();
          if (code) counts.set(code, (counts.get(code) || 0) + 1);
        });
        data = data.filter((r) => {
          const code = String(r['Mã Tracking'] || '').trim();
          return (counts.get(code) || 0) > 1;
        });
        data.sort((a, b) => String(a['Mã Tracking']).localeCompare(String(b['Mã Tracking'])));
      } else {
        data = data.filter((row) => {
          const code = String(row['Mã Tracking'] || '').trim();
          return omShowTracking ? code !== '' : !code;
        });
        data.sort((a, b) => Number(a['rowIndex'] || 0) - Number(b['rowIndex'] || 0));
      }
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
        const val = row[activeDateType];
        if (!val) return false;
        return new Date(val).getTime() >= d.getTime();
      });
    }
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      data = data.filter((row) => {
        const val = row[activeDateType];
        if (!val) return false;
        return new Date(val).getTime() <= d.getTime();
      });
    }

    Object.entries(filterValues).forEach(([key, val]) => {
      if (['market', 'product', 'tracking_include', 'tracking_exclude'].includes(key)) return;
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
          const dVal = new Date(cellValue);
          dVal.setHours(0, 0, 0, 0);
          const fVal = new Date(val);
          fVal.setHours(0, 0, 0, 0);
          return dVal >= fVal;
        }

        return cellValue.toLowerCase().includes(String(val).toLowerCase());
      });
    });

    if (filterValues.tracking_include || filterValues.tracking_exclude) {
      const inc = filterValues.tracking_include.toLowerCase();
      const exc = filterValues.tracking_exclude.toLowerCase();
      data = data.filter((row) => {
        const code = String(row['Mã Tracking'] || '').trim().toLowerCase();
        if (exc && code.includes(exc)) return false;
        if (inc) {
          if (inc.includes('\n')) {
            const codes = new Set(inc.split('\n').map((t) => t.trim()).filter(Boolean));
            if (!codes.has(code)) return false;
          } else {
            if (!code.includes(inc)) return false;
          }
        }
        return true;
      });
    }

    return data;
  }, [allData, legacyChanges, pendingChanges, omActiveTeam, omDateType, omShowTracking, omShowDuplicateTracking, filterValues, dateFrom, dateTo, mgtNoiBoOrder]);

  const getUniqueValues = useMemo(() => (key) => {
    const values = new Set();
    const keyMapped = COLUMN_MAPPING[key] || key;
    allData.forEach((row) => {
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

  const savePendingToLocalStorage = (newPending, newLegacy) => {
    const combined = new Map([...newLegacy, ...newPending]);
    const obj = {};
    combined.forEach((val, key) => {
      const rowObj = {};
      val.forEach((v, k) => (rowObj[k] = v));
      obj[key] = rowObj;
    });
    localStorage.setItem('speegoPendingChanges', JSON.stringify(obj));
  };

  const handleCellChange = useCallback((orderId, colKey, newValue) => {
    const originalRow = allData.find((r) => r[PRIMARY_KEY_COLUMN] === orderId);
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
        setLegacyChanges((prevLeg) => {
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
      updateQueue.current.forEach((v) => {
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
  }, [allData, legacyChanges]);

  const processUpdateQueue = async (forceBulk) => {
    const queue = updateQueue.current;
    if (queue.size === 0) return;

    const rowsToUpdate = [];
    const queueEntries = Array.from(queue.entries());
    queue.clear();

    queueEntries.forEach(([orderId, data]) => {
      const rowObj = { [PRIMARY_KEY_COLUMN]: orderId };
      data.changes.forEach((info, key) => {
        rowObj[key] = info.newValue;
      });
      rowsToUpdate.push(rowObj);
    });

    if (rowsToUpdate.length === 0) return;

    if (!forceBulk && rowsToUpdate.length === 1 && Object.keys(rowsToUpdate[0]).length === 2) {
      const row = rowsToUpdate[0];
      const col = Object.keys(row).find((k) => k !== PRIMARY_KEY_COLUMN);
      try {
        const toastId = addToast('Đang cập nhật...', 'loading', 0);
        await API.updateSingleCell(row[PRIMARY_KEY_COLUMN], col, row[col]);
        setAllData((prev) => {
          const idx = prev.findIndex((r) => r[PRIMARY_KEY_COLUMN] === row[PRIMARY_KEY_COLUMN]);
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
          setAllData((prev) => {
            let next = [...prev];
            rowsToUpdate.forEach((updatedRow) => {
              const idx = next.findIndex((r) => r[PRIMARY_KEY_COLUMN] === updatedRow[PRIMARY_KEY_COLUMN]);
              if (idx > -1) next[idx] = { ...next[idx], ...updatedRow };
            });
            return next;
          });
          setPendingChanges((prev) => {
            const next = new Map(prev);
            rowsToUpdate.forEach((r) => {
              const oid = r[PRIMARY_KEY_COLUMN];
              if (next.has(oid)) {
                Object.keys(r).forEach((k) => {
                  if (k !== PRIMARY_KEY_COLUMN) next.get(oid).delete(k);
                });
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
  };

  const handleUpdateAll = async () => {
    const combined = new Map([...legacyChanges, ...pendingChanges]);
    if (combined.size === 0) {
      addToast('Không có thay đổi cần cập nhật', 'info');
      return;
    }
    const rowsToSend = [];
    combined.forEach((changes, orderId) => {
      const row = { [PRIMARY_KEY_COLUMN]: orderId };
      changes.forEach((info, key) => {
        row[key] = info.newValue;
      });
      rowsToSend.push(row);
    });
    try {
      const toastId = addToast('Đang gửi tất cả thay đổi...', 'loading', 0);
      const res = await API.updateBatch(rowsToSend);
      if (res.success) {
        setAllData((prev) => {
          let next = [...prev];
          rowsToSend.forEach((updatedRow) => {
            const idx = next.findIndex((r) => r[PRIMARY_KEY_COLUMN] === updatedRow[PRIMARY_KEY_COLUMN]);
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
    let updatedCount = 0;
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

      if (e.ctrlKey && e.key === 'c' && !isInInput) {
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, quickAddModalOpen, handleCopy, getSelectionBounds, paginatedData.length, currentColumns.length]);

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

      let updatedCount = 0;
      let skippedCount = 0;

      const selectionRows = bounds.maxRow - bounds.minRow + 1;
      const selectionCols = bounds.maxCol - bounds.minCol + 1;
      const dataRows = rows.length;
      const dataCols = Math.max(...rows.map((r) => r.length));

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

          if (pasteValue === '' && dataRows > 1) continue;

          const originalValue = rowData[dataKey] ?? '';

          if (String(pasteValue) !== String(originalValue)) {
            if (!newPending.has(orderId)) newPending.set(orderId, new Map());
            newPending.get(orderId).set(dataKey, { newValue: String(pasteValue), originalValue: String(originalValue) });
            updatedCount++;
          }
        }
      }

      setCopiedSelection(null);
      setCopiedData(null);

      if (updatedCount > 0) {
        setPendingChanges(newPending);
        savePendingToLocalStorage(newPending, legacyChanges);
        const msg = skippedCount > 0 ? `✅ Đã dán ${updatedCount} ô (${skippedCount} ô không thể sửa)` : `✅ Đã dán ${updatedCount} ô dữ liệu`;
        addToast(msg, 'success', 2500);
      } else {
        addToast('Không có dữ liệu mới để dán', 'info', 2000);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [selection, pendingChanges, legacyChanges, quickAddModalOpen, currentColumns, paginatedData, selectionBounds]);

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

  const teams = Array.from(new Set(allData.map((r) => r[TEAM_COLUMN_NAME]).filter(Boolean))).sort();

  const getCellClass = (row, col, val, rIdx, cIdx) => {
    let classes = 'px-3 py-2 border border-gray-200 text-sm h-[38px] whitespace-nowrap ';

    if (col === 'Kết quả Check' || col === 'Kết quả check') {
      const v = val.toLowerCase();
      if (v === 'ok') classes += 'bg-green-100 text-green-800 font-bold ';
      else if (v.includes('huỷ')) classes += 'bg-red-100 text-red-800 font-bold ';
      else if (v === 'vận đơn xl') classes += 'bg-yellow-100 text-yellow-800 ';
    }

    if (viewMode === 'BILL_OF_LADING' && LONG_TEXT_COLS.includes(col)) {
      classes = classes.replace(
        'whitespace-nowrap',
        isLongTextExpanded
          ? 'whitespace-pre-wrap max-w-xs break-words bg-yellow-50'
          : 'whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] cursor-pointer'
      );
    }

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

  return (
    <div className="min-h-screen flex flex-col p-5 font-sans text-gray-800 bg-[#f8f9fa]">
      <div className="flex justify-center items-center gap-4 mb-6">
        <img
          src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Fbe61f44f.%E1%BA%A2nh.021347.png"
          alt="Header"
          className="h-12 object-contain"
        />
        <h2 className="text-2xl font-bold text-gray-700 uppercase">HỆ THỐNG QUẢN LÝ SPEEGO</h2>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
            ) : (
              <span>🔄</span>
            )}
            {loading ? 'Đang tải...' : 'Tải lại dữ liệu'}
          </button>

          <div className="flex items-center gap-1 text-xs">
            <span className={`h-2 w-2 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-gray-600">
              {allData.length > 0 ? `${allData.length} đơn hàng` : 'Chưa có dữ liệu'}
            </span>
          </div>
        </div>
      </div>

      {/* ORDER_MANAGEMENT Controls */}
      <div className="space-y-4 mb-4">
          <div className="bg-white p-4 rounded shadow-sm flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1 w-48">
              <label className="text-xs font-semibold text-gray-500">Thị trường</label>
              <MultiSelect
                label="Tất cả Thị trường"
                mainFilter={true}
                options={getUniqueValues('Khu vực')}
                selected={filterValues.market}
                onChange={(vals) => setFilterValues((prev) => ({ ...prev, market: vals }))}
              />
            </div>
            <div className="flex flex-col gap-1 w-48">
              <label className="text-xs font-semibold text-gray-500">Sản phẩm</label>
              <MultiSelect
                label="Tất cả Sản phẩm"
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
              <input type="date" className="px-2 py-1.5 border rounded text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Tới ngày</label>
              <input type="date" className="px-2 py-1.5 border rounded text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <button onClick={refreshData} className="bg-danger text-white px-3 py-1.5 rounded text-sm hover:bg-dangerHover transition shadow-sm mb-0.5">
              🗑️ Xóa lọc
            </button>
          </div>

          <div className="bg-white p-2 rounded shadow-sm flex flex-wrap gap-2">
            <button
              className={`px-3 py-1.5 text-sm rounded border transition ${
                omActiveTeam === 'all'
                  ? 'bg-primary text-white border-primaryHover font-bold'
                  : 'bg-gray-100 hover:bg-gray-200 border-gray-300'
              }`}
              onClick={() => setOmActiveTeam('all')}
            >
              Tất cả
            </button>
            {teams.map((t) => (
              <button
                key={t}
                className={`px-3 py-1.5 text-sm rounded border transition ${
                  omActiveTeam === t ? 'bg-primary text-white border-primaryHover font-bold' : 'bg-gray-100 hover:bg-gray-200 border-gray-300'
                }`}
                onClick={() => setOmActiveTeam(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>


      <div className="sticky top-0 z-[40] bg-white p-4 rounded-md shadow-md border border-gray-200 mb-6 flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={loadData} disabled={loading} className="bg-success hover:bg-successHover text-white px-3 py-1.5 rounded shadow-sm font-medium transition-transform active:scale-95">
            {loading ? '...' : '↻ Load'}
          </button>
          <button onClick={() => setSyncPopoverOpen(true)} className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded shadow-sm font-medium relative transition-all">
            Trạng thái cập nhật
            {legacyChanges.size + pendingChanges.size > 0 && (
              <span className="ml-2 bg-white text-[#F37021] text-xs font-bold px-1.5 py-0.5 rounded-full border border-[#F37021]">
                {legacyChanges.size + pendingChanges.size}
              </span>
            )}
          </button>
          <button onClick={handleUpdateAll} className="bg-primary hover:bg-primaryHover text-white px-3 py-1.5 rounded shadow-sm font-medium transition-transform active:scale-95">
            Cập nhật
          </button>
          <button onClick={() => setQuickAddModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded shadow-sm font-medium">
            ⚡ Thêm nhanh
          </button>
          <button onClick={handleDownloadExcel} className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded shadow-sm font-medium">
            Excel
          </button>

          <div className="flex items-center gap-1 ml-2 text-sm bg-gray-100 p-1.5 rounded">
            <span>Cột cố định:</span>
            <input type="number" min="0" className="w-12 p-1 border rounded" value={fixedColumns} onChange={(e) => setFixedColumns(Number(e.target.value))} />
          </div>

          <div className="bg-[#E8EAF6] text-[#1D2F5F] px-3 py-1.5 rounded border border-[#c9d1e9] text-sm font-bold">
            Tổng đơn: {getFilteredData.length} | Tổng tiền: <span className="text-success">{totalMoney.toLocaleString('vi-VN')} ₫</span>
          </div>
        </div>

        <div className="flex gap-2">
            <button
              onClick={() => {
                setOmShowTracking(!omShowTracking);
                setOmShowDuplicateTracking(false);
              }}
              className={`px-3 py-1.5 text-sm rounded border ${
                omShowTracking ? 'bg-dangerHover text-white' : 'bg-danger text-white'
              } transition`}
            >
              {omShowTracking ? 'Đơn không Tracking' : 'Đơn có Tracking'}
            </button>
            <button
              onClick={() => {
                setOmShowDuplicateTracking(!omShowDuplicateTracking);
                setOmShowTracking(false);
              }}
              className={`px-3 py-1.5 text-sm rounded border ${
                omShowDuplicateTracking ? 'bg-dangerHover text-white' : 'bg-danger text-white'
              } transition`}
            >
              {omShowDuplicateTracking ? 'Tất cả đơn' : 'Trùng Tracking'}
            </button>
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
                      <div className="flex flex-col gap-1">
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
                      const val = row[key] ?? row[col] ?? row[col.replace(/ /g, '_')] ?? '';
                      const displayVal = ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2'].includes(col)
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
            className={`pointer-events-auto min-w-[300px] p-4 rounded shadow-lg bg-white border-l-4 transform transition-all animate-in slide-in-from-right-10 duration-300 ${
              t.type === 'success'
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
          legacyChanges={legacyChanges}
          onApply={handleUpdateAll}
          onDiscard={() => {
            if (confirm('Hủy bỏ tất cả thay đổi?')) {
              setPendingChanges(new Map());
              setLegacyChanges(new Map());
              localStorage.removeItem('speegoPendingChanges');
              setSyncPopoverOpen(false);
              refreshData();
            }
          }}
        />
      </Suspense>

      <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>}>
        <QuickAddModal isOpen={quickAddModalOpen} onClose={() => setQuickAddModalOpen(false)} onSync={handleQuickSync} />
      </Suspense>
    </div>
  );
}

export default FFM;
