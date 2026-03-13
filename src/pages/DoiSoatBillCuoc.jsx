import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ArrowLeft, RefreshCw, Plus, X, Settings, RotateCw, Download, Upload } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/config';
import * as XLSX from 'xlsx';

// Mapping tên cột database -> tên hiển thị đầy đủ
const BILL_TIEN_COLUMNS = [
  { key: 'stt', label: 'STT' },
  { key: 'ma_don_hang', label: 'Mã đơn hàng' },
  { key: 'ma_tracking', label: 'Mã Tracking' },
  { key: 'ngay_doi_soat', label: 'Ngày đối soát' },
  { key: 'ffm', label: 'FFM' },
  { key: 'don_vi_tien', label: 'Đơn vị tiền' },
  { key: 'so_tien_doi_soat', label: 'Số tiền đối soát' },
  { key: 'ty_gia', label: 'Tỷ giá' },
  { key: 'tien_viet', label: 'Tiền Việt' },
  { key: 'dem_lan_thanh_toan', label: 'Đếm lần thanh toán' },
  { key: 'ngay_update', label: 'Ngày Update' },
  { key: 'note', label: 'Note' },
  { key: 'note_2', label: 'Note 2' },
];

const CUOC_COLUMNS = [
  { key: 'ma_don_hang', label: 'Mã đơn hàng' },
  { key: 'tien_cuoc', label: 'Tiền cước' },
  { key: 'don_vi_tien_te', label: 'Đơn vị tiền tệ' },
  { key: 'ngay_doi_soat_cuoc', label: 'Ngày đối soát cước' },
  { key: 'ty_gia', label: 'Tỷ giá' },
  { key: 'tien_ship_vnd', label: 'Tiền ship (Vnđ)' },
  { key: 'thi_truong', label: 'Thị trường' },
  { key: 'loc_trung', label: 'Lọc trùng' },
  { key: 'chi_nhanh', label: 'Chi nhánh' },
];

// Currency options for dropdown
const CURRENCY_OPTIONS = ['AUD', 'CAD', 'USD', 'YEN'];

function DoiSoatBillCuoc() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('bill'); // 'bill' or 'cuoc'
  const [billData, setBillData] = useState([]);
  const [cuocData, setCuocData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [showAddModal, setShowAddModal] = useState(false);
  const [orderCodesInput, setOrderCodesInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(new Map()); // Map<rowId, Map<columnKey, newValue>>
  const [updating, setUpdating] = useState(false);
  const [selection, setSelection] = useState({ startRow: null, startCol: null, endRow: null, endCol: null });
  const isSelecting = useRef(false);
  const [exchangeRates, setExchangeRates] = useState({ AUD: null, CAD: null, USD: null, YEN: null });
  const [syncing, setSyncing] = useState(false);
  // Sau khi nhấn Đồng bộ, 2 tab nhập sẽ ẩn đi, chỉ còn tab xem dữ liệu đã tải lên
  const [hasSynced, setHasSynced] = useState(false);
  // Thời điểm đồng bộ gần nhất – dùng để ẩn các bản ghi đã sync khỏi view (data DB vẫn giữ nguyên)
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Load data từ chi_tiet_bill_tien
  const loadBillData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('chi_tiet_bill_tien')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Lấy shipping_unit và payment_type từ bảng orders để map vào FFM và Đơn vị tiền
      const orderCodes = [...new Set((data || []).map((row) => row.ma_don_hang).filter(Boolean))];
      const shippingUnitMap = new Map();
      const paymentTypeMap = new Map();

      if (orderCodes.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < orderCodes.length; i += batchSize) {
          const batch = orderCodes.slice(i, i + batchSize);
          const { data: ordersData, error: ordersError } = await supabase
            .from('orders')
            .select('order_code, shipping_unit, payment_type')
            .in('order_code', batch);

          if (!ordersError && ordersData) {
            ordersData.forEach((order) => {
              if (order.order_code) {
                if (order.shipping_unit) {
                  shippingUnitMap.set(order.order_code, order.shipping_unit);
                }
                if (order.payment_type) {
                  paymentTypeMap.set(order.order_code, order.payment_type);
                }
              }
            });
          }
        }
      }
      
      // Tự động điền tỷ giá cho các hàng có đơn vị tiền tệ nhưng chưa có tỷ giá
      let processedData = (data || []).map((row) => {
        const updatedRow = { ...row };

        // FFM lấy theo orders.shipping_unit khi ma_don_hang khớp orders.order_code
        if (row.ma_don_hang) {
          const shippingUnit = shippingUnitMap.get(row.ma_don_hang);
          if (shippingUnit) {
            updatedRow.ffm = shippingUnit;
          }

          const paymentType = paymentTypeMap.get(row.ma_don_hang);
          if (paymentType) {
            const currencyMap = {
              USD: 'USD',
              AUD: 'AUD',
              CAD: 'CAD',
              JPY: 'YEN',
              YEN: 'YEN',
              ZELLE: 'USD',
              COD: 'USD',
            };
            const mappedCurrency = currencyMap[String(paymentType).toUpperCase()] || String(paymentType).toUpperCase();
            if (CURRENCY_OPTIONS.includes(mappedCurrency)) {
              updatedRow.don_vi_tien = mappedCurrency;
            }
          }
        }

        if (updatedRow.don_vi_tien && (!updatedRow.ty_gia || updatedRow.ty_gia === null || updatedRow.ty_gia === '')) {
          const currency = String(updatedRow.don_vi_tien).toUpperCase();
          const rate = exchangeRates[currency];
          if (rate !== null && rate !== undefined) {
            updatedRow.ty_gia = rate;
          }
        }

        return updatedRow;
      });

      // Nếu đã đồng bộ, chỉ hiển thị các bản ghi được tạo sau lần sync cuối cùng
      if (lastSyncTime) {
        const last = new Date(lastSyncTime).getTime();
        processedData = processedData.filter((row) => {
          if (!row.created_at) return false;
          const created = new Date(row.created_at).getTime();
          if (Number.isNaN(created)) return false;
          return created > last;
        });
      }
      
      setBillData(processedData);
    } catch (error) {
      console.error('Error loading bill data:', error);
      alert('Lỗi khi tải dữ liệu bill: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load data từ chitiet_cuoc
  const loadCuocData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('chitiet_cuoc')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Đếm số lần lặp lại của mỗi mã đơn hàng
      const orderCodeCounts = {};
      (data || []).forEach((row) => {
        const orderCode = row.ma_don_hang;
        if (orderCode) {
          orderCodeCounts[orderCode] = (orderCodeCounts[orderCode] || 0) + 1;
        }
      });
      
      // Lấy danh sách mã đơn hàng để tìm chi nhánh từ bảng orders
      const orderCodes = [...new Set((data || []).map(row => row.ma_don_hang).filter(Boolean))];
      
      // Load orders data để lấy chi nhánh
      const ordersMap = new Map();
      if (orderCodes.length > 0) {
        // Supabase có giới hạn 1000 rows, nên cần chia nhỏ query nếu có nhiều mã
        const batchSize = 1000;
        for (let i = 0; i < orderCodes.length; i += batchSize) {
          const batch = orderCodes.slice(i, i + batchSize);
          const { data: ordersData, error: ordersError } = await supabase
            .from('orders')
            .select('order_code, team')
            .in('order_code', batch);
          
          if (!ordersError && ordersData) {
            ordersData.forEach(order => {
              if (order.order_code && order.team) {
                ordersMap.set(order.order_code, order.team);
              }
            });
          }
        }
      }
      
      // Tự động điền tỷ giá và tính lọc trùng
      let processedData = (data || []).map((row) => {
        let updatedRow = { ...row };
        
        // Tự động điền tỷ giá cho các hàng có đơn vị tiền tệ nhưng chưa có tỷ giá
        if (row.don_vi_tien_te && (!row.ty_gia || row.ty_gia === null || row.ty_gia === '')) {
          const currency = String(row.don_vi_tien_te).toUpperCase();
          const rate = exchangeRates[currency];
          if (rate !== null && rate !== undefined) {
            updatedRow.ty_gia = rate;
          }
        }
        
        // Tính số lần lặp lại cho cột Lọc trùng
        const orderCode = row.ma_don_hang;
        if (orderCode && orderCodeCounts[orderCode] > 1) {
          updatedRow.loc_trung = orderCodeCounts[orderCode];
        } else {
          updatedRow.loc_trung = null;
        }
        
        // Tự động điền Chi nhánh từ bảng orders
        if (orderCode && !updatedRow.chi_nhanh) {
          const branch = ordersMap.get(orderCode);
          if (branch) {
            updatedRow.chi_nhanh = branch;
          }
        }
        
        return updatedRow;
      });

      // Nếu đã đồng bộ, chỉ hiển thị các bản ghi được tạo sau lần sync cuối cùng
      if (lastSyncTime) {
        const last = new Date(lastSyncTime).getTime();
        processedData = processedData.filter((row) => {
          if (!row.created_at) return false;
          const created = new Date(row.created_at).getTime();
          if (Number.isNaN(created)) return false;
          return created > last;
        });
      }
      
      setCuocData(processedData);
    } catch (error) {
      console.error('Error loading cuoc data:', error);
      alert('Lỗi khi tải dữ liệu cước: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load exchange rates from database
  useEffect(() => {
    const loadExchangeRates = async () => {
      try {
        const { data, error } = await supabase
          .from('exchange_rates')
          .select('*')
          .eq('id', 1)
          .single();

        if (error) throw error;
        if (data) {
          setExchangeRates({
            AUD: data.aud || null,
            CAD: data.cad || null,
            USD: data.usd || null,
            YEN: data.jpy || null, // Map YEN to JPY
          });
        }
      } catch (err) {
        console.warn('Không thể tải tỷ giá từ database:', err);
        // Keep default null values
      }
    };
    loadExchangeRates();
  }, []);

  // Reload data when exchange rates change
  useEffect(() => {
    const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
    if (isBillTab) {
      loadBillData();
    } else {
      loadCuocData();
    }
  }, [activeTab, exchangeRates]);

  // Tự động cập nhật tỷ giá cho các hàng có đơn vị tiền tệ nhưng tỷ giá trống
  useEffect(() => {
    if (Object.values(exchangeRates).every(rate => rate === null)) return; // Chưa load xong
    
    const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
    const data = isBillTab ? billData : cuocData;
    if (!data || data.length === 0) return;
    
    setPendingChanges((prevPending) => {
      const newPending = new Map(prevPending);
      let hasUpdates = false;
      
      data.forEach((row) => {
        const currencyKey = (activeTab === 'bill' || activeTab === 'bill_view') ? 'don_vi_tien' : 'don_vi_tien_te';
        const currency = row[currencyKey];
        const currentTyGia = row.ty_gia;
        
        // Chỉ cập nhật nếu có đơn vị tiền tệ và tỷ giá trống
        if (currency && (!currentTyGia || currentTyGia === '' || currentTyGia === null)) {
          const currencyUpper = String(currency).toUpperCase();
          const rate = exchangeRates[currencyUpper];
          
          if (rate !== null && rate !== undefined) {
            // Kiểm tra xem đã có pending change cho ty_gia chưa
            const rowPending = newPending.get(row.id);
            if (!rowPending || !rowPending.has('ty_gia')) {
              if (!newPending.has(row.id)) {
                newPending.set(row.id, new Map());
              }
              const rowChanges = newPending.get(row.id);
              rowChanges.set('ty_gia', rate);
              hasUpdates = true;
            }
          }
        }
      });
      
      return hasUpdates ? newPending : prevPending;
    });
  }, [exchangeRates, activeTab, billData, cuocData]);

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

  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (e) {
      return dateString;
    }
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getCurrentData = () => {
    const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
    return isBillTab ? billData : cuocData;
  };

  const getCurrentColumns = () => {
    const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
    return isBillTab ? BILL_TIEN_COLUMNS : CUOC_COLUMNS;
  };

  const paginatedData = () => {
    const data = getCurrentData();
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return data.slice(start, end);
  };

  const totalPages = Math.ceil(getCurrentData().length / rowsPerPage);

  // Selection bounds
  const selectionBounds = useMemo(() => {
    if (selection.startRow === null) return null;
    return {
      minRow: Math.min(selection.startRow, selection.endRow),
      maxRow: Math.max(selection.startRow, selection.endRow),
      minCol: Math.min(selection.startCol, selection.endCol),
      maxCol: Math.max(selection.startCol, selection.endCol)
    };
  }, [selection]);

  // Mouse handlers for selection
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
    }
  }, [selection.startRow]);

  const handleMouseEnter = useCallback((rowIndex, colIndex) => {
    if (isSelecting.current) {
      setSelection((prev) => ({ ...prev, endRow: rowIndex, endCol: colIndex }));
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isSelecting.current = false;
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  // Copy handler - supports up to 200 rows for mã đơn hàng
  const handleCopy = useCallback(() => {
    if (selection.startRow === null || !selectionBounds) return;

    const data = paginatedData();
    const copiedRows = [];

    for (let r = selectionBounds.minRow; r <= selectionBounds.maxRow && r < data.length; r++) {
      const rowData = [];
      const row = data[r];
      for (let c = selectionBounds.minCol; c <= selectionBounds.maxCol && c < getCurrentColumns().length; c++) {
        const col = getCurrentColumns()[c];
        let val = row[col.key] ?? '';
        
        // Get pending change if exists
        const rowPending = pendingChanges.get(row.id);
        if (rowPending && rowPending.has(col.key)) {
          val = rowPending.get(col.key);
        }
        
        rowData.push(String(val));
      }
      copiedRows.push(rowData);
    }

    const text = copiedRows.map((row) => row.join('\t')).join('\n');
    navigator.clipboard
      .writeText(text)
      .then(() => {
        alert(`📋 Đã copy ${selectionBounds.maxRow - selectionBounds.minRow + 1} hàng × ${selectionBounds.maxCol - selectionBounds.minCol + 1} cột`);
      })
      .catch(() => {
        alert('Không thể copy vào clipboard');
      });
  }, [selection, selectionBounds, pendingChanges]);

  // Paste handler - supports up to 200 rows for mã đơn hàng
  const handlePaste = useCallback((e) => {
    // Không cho paste khi đang ở tab chỉ xem dữ liệu
    if (activeTab === 'bill_view' || activeTab === 'cuoc_view') return;
    const active = document.activeElement;
    
    // If pasting into an input field, check if we should handle it as bulk paste
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
      // If there's a selection, handle as bulk paste
      if (selection.startRow !== null && selectionBounds) {
        // Check if Ctrl+V was pressed (bulk paste mode)
        // We'll handle this case below
      } else {
        // No selection, let default paste handle single input
        return;
      }
    }

    if (selection.startRow === null || !selectionBounds) return;

    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain');
    if (!text) return;

    const rows = text
      .split(/\r\n?|\n/)
      .filter((r) => r.length > 0)
      .map((r) => r.split('\t'));
    if (rows.length === 0) return;

    const data = paginatedData();
    const newPending = new Map(pendingChanges);

    const selectionRows = selectionBounds.maxRow - selectionBounds.minRow + 1;
    const selectionCols = selectionBounds.maxCol - selectionBounds.minCol + 1;
    const dataRows = rows.length;
    const dataCols = Math.max(...rows.map((r) => r.length));

    // Determine how to repeat data
    // If selection is 1 row, repeat data rows
    // If selection is 1 col, repeat data cols
    // Otherwise, use min of selection and data dimensions
    const repeatRows = selectionRows === 1 ? dataRows : (dataRows === 1 ? selectionRows : Math.min(selectionRows, dataRows));
    const repeatCols = selectionCols === 1 ? dataCols : (dataCols === 1 ? selectionCols : Math.min(selectionCols, dataCols));

    let updatedCount = 0;
    const columns = getCurrentColumns();

    for (let pasteRow = 0; pasteRow < repeatRows; pasteRow++) {
      const targetRowIndex = selectionBounds.minRow + pasteRow;
      if (targetRowIndex >= data.length) break;

      const rowData = data[targetRowIndex];
      const rowId = rowData.id;
      
      // Determine source row: 
      // - If data has 1 row, use it for all target rows (repeat value)
      // - If data has multiple rows, map each row to target row (pasteRow)
      const sourceRow = dataRows === 1 ? 0 : (pasteRow < dataRows ? pasteRow : dataRows - 1);

      for (let pasteCol = 0; pasteCol < repeatCols; pasteCol++) {
        const targetColIndex = selectionBounds.minCol + pasteCol;
        if (targetColIndex >= columns.length) break;

        const col = columns[targetColIndex];
        const colKey = col.key;
        
        // Skip read-only fields
        if (colKey === 'id' || colKey === 'created_at' || colKey === 'updated_at' || colKey === 'loc_trung') continue;

        // Determine source col:
        // - If data has 1 col, use it for all target cols (repeat value)
        // - If data has multiple cols, map each col to target col (pasteCol)
        const sourceCol = dataCols === 1 ? 0 : (pasteCol < dataCols ? pasteCol : dataCols - 1);
        const pasteValue = rows[sourceRow]?.[sourceCol] ?? '';

        // Allow empty values to be pasted (they will clear the field)

        const originalValue = rowData[colKey] ?? '';

        // Convert value based on column type
        let processedValue = pasteValue;
        if (colKey.includes('ngay') || colKey.includes('date')) {
          // Date field - keep as is or convert
          processedValue = pasteValue || null;
        } else if (colKey.includes('tien') || colKey.includes('so_tien') || colKey.includes('ty_gia') || colKey.includes('cuoc') || colKey === 'stt' || colKey === 'dem_lan_thanh_toan') {
          // Number field
          processedValue = pasteValue === '' ? null : parseFloat(pasteValue);
          if (isNaN(processedValue)) processedValue = null;
        }

        if (String(processedValue) !== String(originalValue)) {
          if (!newPending.has(rowId)) {
            newPending.set(rowId, new Map());
          }
          newPending.get(rowId).set(colKey, processedValue);
          updatedCount++;
          
          // Auto-fill chi_nhanh when ma_don_hang is pasted (only for cuoc tab)
          if (activeTab === 'cuoc' && colKey === 'ma_don_hang' && processedValue) {
            getChiNhanhFromOrder(processedValue).then((branch) => {
              if (branch) {
                setPendingChanges((current) => {
                  const updated = new Map(current);
                  if (!updated.has(rowId)) {
                    updated.set(rowId, new Map());
                  }
                  const rowChanges = updated.get(rowId);
                  // Only set if chi_nhanh is empty or not set
                  const currentRow = getCurrentData().find((r) => r.id === rowId);
                  if (!currentRow?.chi_nhanh) {
                    rowChanges.set('chi_nhanh', branch);
                  }
                  return updated;
                });
              }
            });
          }
        }
      }
    }

    if (updatedCount > 0) {
      setPendingChanges(newPending);
      alert(`✅ Đã dán ${updatedCount} ô dữ liệu`);
    } else {
      alert('Không có dữ liệu mới để dán');
    }
  }, [selection, selectionBounds, pendingChanges, activeTab]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showAddModal) return;
      const active = document.activeElement;
      const isInInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');

      if (e.ctrlKey && e.key === 'c' && !isInInput) {
        e.preventDefault();
        handleCopy();
        return;
      }

      if (e.key === 'Escape') {
        setSelection({ startRow: null, startCol: null, endRow: null, endCol: null });
        return;
      }

      if (!isInInput && selection.startRow !== null && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const data = paginatedData();
        const columns = getCurrentColumns();
        
        if (!selectionBounds) return;

        let newRow = e.shiftKey ? selection.endRow : selection.startRow;
        let newCol = e.shiftKey ? selection.endCol : selection.startCol;

        switch (e.key) {
          case 'ArrowUp':
            newRow = Math.max(0, newRow - 1);
            break;
          case 'ArrowDown':
            newRow = Math.min(data.length - 1, newRow + 1);
            break;
          case 'ArrowLeft':
            newCol = Math.max(0, newCol - 1);
            break;
          case 'ArrowRight':
            newCol = Math.min(columns.length - 1, newCol + 1);
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
        const data = paginatedData();
        const columns = getCurrentColumns();
        setSelection({
          startRow: 0,
          startCol: 0,
          endRow: data.length - 1,
          endCol: columns.length - 1
        });
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, showAddModal, handleCopy, selectionBounds]);

  // Paste event listener
  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleRefresh = () => {
    const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
    if (isBillTab) {
      loadBillData();
    } else {
      loadCuocData();
    }
  };

  // Xóa toàn bộ dữ liệu tạm của bill (staging), KHÔNG ảnh hưởng bảng orders
  const handleClearAllBillTemp = async () => {
    if (
      !window.confirm(
        'Bạn có chắc chắn muốn xóa TẤT CẢ dữ liệu bill tạm? Dữ liệu trong bảng orders KHÔNG bị ảnh hưởng.'
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('chi_tiet_bill_tien').delete().neq('id', 0);
      if (error) throw error;
      setBillData([]);
      alert('Đã xóa hết dữ liệu bill tạm (chi_tiet_bill_tien).');
    } catch (err) {
      console.error('Error clearing bill temp data:', err);
      alert('Lỗi khi xóa dữ liệu bill tạm: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Xóa toàn bộ dữ liệu tạm của cước (staging), KHÔNG ảnh hưởng bảng orders
  const handleClearAllCuocTemp = async () => {
    if (
      !window.confirm(
        'Bạn có chắc chắn muốn xóa TẤT CẢ dữ liệu cước tạm? Dữ liệu trong bảng orders KHÔNG bị ảnh hưởng.'
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('chitiet_cuoc').delete().neq('id', 0);
      if (error) throw error;
      setCuocData([]);
      alert('Đã xóa hết dữ liệu cước tạm (chitiet_cuoc).');
    } catch (err) {
      console.error('Error clearing cuoc temp data:', err);
      alert('Lỗi khi xóa dữ liệu cước tạm: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Hàm đồng bộ dữ liệu từ bill/cuoc sang orders
  const handleSync = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn đồng bộ dữ liệu? Hành động này sẽ cập nhật bảng orders.')) {
      return;
    }

    setSyncing(true);
    try {
      // 1. Lấy tất cả dữ liệu từ chitiet_cuoc để tính tổng tien_ship_vnd theo ma_don_hang
      const { data: cuocData, error: cuocError } = await supabase
        .from('chitiet_cuoc')
        .select('ma_don_hang, tien_ship_vnd');

      if (cuocError) throw cuocError;

      // 2. Lấy tất cả dữ liệu từ chi_tiet_bill_tien để tính tổng tien_viet theo ma_don_hang
      const { data: billData, error: billError } = await supabase
        .from('chi_tiet_bill_tien')
        .select('ma_don_hang, tien_viet');

      if (billError) throw billError;

      // 3. Tính tổng shipping_cost từ chitiet_cuoc theo ma_don_hang
      const shippingCostMap = new Map();
      if (cuocData) {
        cuocData.forEach((row) => {
          if (row.ma_don_hang && row.tien_ship_vnd) {
            const orderCode = row.ma_don_hang;
            const currentTotal = shippingCostMap.get(orderCode) || 0;
            shippingCostMap.set(orderCode, currentTotal + (parseFloat(row.tien_ship_vnd) || 0));
          }
        });
      }

      // 4. Tính tổng total_vnd từ chi_tiet_bill_tien theo ma_don_hang
      const totalVndMap = new Map();
      if (billData) {
        billData.forEach((row) => {
          if (row.ma_don_hang && row.tien_viet) {
            const orderCode = row.ma_don_hang;
            const currentTotal = totalVndMap.get(orderCode) || 0;
            totalVndMap.set(orderCode, currentTotal + (parseFloat(row.tien_viet) || 0));
          }
        });
      }

      // 5. Tính order_count_actual (số lượng records trong chitiet_cuoc theo ma_don_hang)
      const orderCountMap = new Map();
      if (cuocData) {
        cuocData.forEach((row) => {
          if (row.ma_don_hang) {
            const orderCode = row.ma_don_hang;
            orderCountMap.set(orderCode, (orderCountMap.get(orderCode) || 0) + 1);
          }
        });
      }

      // 6. Tính revenue_actual (tổng total_vnd từ chi_tiet_bill_tien theo ma_don_hang)
      // revenue_actual = total_vnd (đã tính ở trên)

      // 7. Lấy tất cả order codes cần update
      const allOrderCodes = new Set([
        ...Array.from(shippingCostMap.keys()),
        ...Array.from(totalVndMap.keys()),
        ...Array.from(orderCountMap.keys())
      ]);

      // 8. Update orders table
      let updateCount = 0;
      for (const orderCode of allOrderCodes) {
        const updateData = {};
        
        // Update shipping_cost
        if (shippingCostMap.has(orderCode)) {
          updateData.shipping_cost = shippingCostMap.get(orderCode);
        }
        
        // Update total_vnd
        if (totalVndMap.has(orderCode)) {
          updateData.total_vnd = totalVndMap.get(orderCode);
        }
        
        // Update order_count_actual
        if (orderCountMap.has(orderCode)) {
          updateData.order_count_actual = orderCountMap.get(orderCode);
        }
        
        // Update revenue_actual = total_vnd
        if (totalVndMap.has(orderCode)) {
          updateData.revenue_actual = totalVndMap.get(orderCode);
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from('orders')
            .update(updateData)
            .eq('order_code', orderCode);

          if (updateError) {
            console.error(`Error updating order ${orderCode}:`, updateError);
          } else {
            updateCount++;
          }
        }
      }

      alert(`Đã đồng bộ thành công ${updateCount} đơn hàng!`);
      // Ghi nhận thời điểm sync để ẩn các bản ghi đã sync khỏi view (data DB vẫn giữ nguyên)
      const syncTime = new Date().toISOString();
      setLastSyncTime(syncTime);
      // Sau khi đồng bộ: ẩn tab nhập, chuyển sang tab xem dữ liệu bill
      setHasSynced(true);
      setActiveTab('bill_view');
      
      // Reload data – lúc này loadBillData sẽ chỉ hiển thị các bản ghi tạo sau thời điểm sync
      await loadBillData();
    } catch (error) {
      console.error('Error syncing data:', error);
      alert('Lỗi khi đồng bộ dữ liệu: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  // Parse mã đơn hàng từ text input
  const parseOrderCodes = (text) => {
    return text
      .split(/\r\n?|\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };

  // Helper function to get chi_nhanh from orders table
  const getChiNhanhFromOrder = async (orderCode) => {
    if (!orderCode) return null;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('team')
        .eq('order_code', orderCode)
        .single();
      
      if (error || !data) return null;
      return data.team || null;
    } catch (err) {
      console.error('Error fetching chi_nhanh:', err);
      return null;
    }
  };

  // Helper function to get payment_type from orders table
  const getPaymentTypeFromOrder = async (orderCode) => {
    if (!orderCode) return null;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('payment_type')
        .eq('order_code', orderCode)
        .single();
      
      if (error || !data) return null;
      return data.payment_type || null;
    } catch (err) {
      console.error('Error fetching payment_type:', err);
      return null;
    }
  };

  // Handle cell change - lưu vào pending changes
  const handleCellChange = async (rowId, columnKey, newValue) => {
    // Không cho sửa khi đang ở tab chỉ xem dữ liệu
    if (activeTab === 'bill_view' || activeTab === 'cuoc_view') return;
    setPendingChanges((prev) => {
      const next = new Map(prev);
      if (!next.has(rowId)) {
        next.set(rowId, new Map());
      }
      const rowChanges = next.get(rowId);
      
      // Lấy giá trị hiện tại từ data
      const currentData = getCurrentData();
      const currentRow = currentData.find((r) => r.id === rowId);
      const originalValue = currentRow?.[columnKey] ?? '';
      
      // Nếu giá trị mới khác giá trị gốc, thêm vào pending
      if (String(newValue) !== String(originalValue)) {
        rowChanges.set(columnKey, newValue);
      } else {
        // Nếu giống giá trị gốc, xóa khỏi pending
        rowChanges.delete(columnKey);
        if (rowChanges.size === 0) {
          next.delete(rowId);
        }
      }

      // Auto-fill exchange rate when currency changes - LUÔN tự động điền
      // Check if this is a currency field (don_vi_tien or don_vi_tien_te)
      if ((columnKey === 'don_vi_tien' || columnKey === 'don_vi_tien_te') && newValue) {
        const currency = String(newValue).toUpperCase();
        const rate = exchangeRates[currency];
        
        if (rate !== null && rate !== undefined) {
          // Determine the exchange rate column key
          const rateColumnKey = (activeTab === 'bill' || activeTab === 'bill_view') ? 'ty_gia' : 'ty_gia';
          
          // LUÔN tự động điền tỷ giá khi chọn đơn vị tiền tệ (không phụ thuộc vào giá trị hiện tại)
          rowChanges.set(rateColumnKey, rate);
        }
      }
      
      // Auto-fill exchange rate when ty_gia is empty but currency exists
      // Nếu user xóa tỷ giá hoặc tỷ giá trống, tự động điền lại từ exchangeRates
      if (columnKey === 'ty_gia' && (!newValue || newValue === '' || newValue === null)) {
        const currentData = getCurrentData();
        const currentRow = currentData.find((r) => r.id === rowId);
        const currencyKey = (activeTab === 'bill' || activeTab === 'bill_view') ? 'don_vi_tien' : 'don_vi_tien_te';
        const currency = currentRow?.[currencyKey];
        
        if (currency) {
          const currencyUpper = String(currency).toUpperCase();
          const rate = exchangeRates[currencyUpper];
          
          if (rate !== null && rate !== undefined) {
            // Tự động điền lại tỷ giá từ cài đặt
            rowChanges.set('ty_gia', rate);
          }
        }
      }

      // Auto-fill chi_nhanh when ma_don_hang changes (only for cuoc tab)
      if ((activeTab === 'cuoc' || activeTab === 'cuoc_view') && columnKey === 'ma_don_hang' && newValue) {
        // Fetch chi_nhanh asynchronously
        getChiNhanhFromOrder(newValue).then((branch) => {
          if (branch) {
            setPendingChanges((current) => {
              const updated = new Map(current);
              if (!updated.has(rowId)) {
                updated.set(rowId, new Map());
              }
              const rowChanges = updated.get(rowId);
              // Only set if chi_nhanh is empty or not set
              const currentRow = getCurrentData().find((r) => r.id === rowId);
              if (!currentRow?.chi_nhanh) {
                rowChanges.set('chi_nhanh', branch);
              }
              return updated;
            });
          }
        });
      }

      // Auto-fill don_vi_tien from payment_type when ma_don_hang changes (only for bill tab)
      if ((activeTab === 'bill' || activeTab === 'bill_view') && columnKey === 'ma_don_hang' && newValue) {
        // Fetch payment_type asynchronously and map to don_vi_tien
        getPaymentTypeFromOrder(newValue).then((paymentType) => {
          if (paymentType) {
            setPendingChanges((current) => {
              const updated = new Map(current);
              if (!updated.has(rowId)) {
                updated.set(rowId, new Map());
              }
              const rowChanges = updated.get(rowId);
              // Map payment_type to currency code
              // Có thể cần mapping: Zelle -> USD, COD -> USD, etc.
              // Tạm thời dùng trực tiếp payment_type nếu nó là currency code
              const currencyMap = {
                'USD': 'USD',
                'AUD': 'AUD',
                'CAD': 'CAD',
                'JPY': 'YEN',
                'YEN': 'YEN',
                'Zelle': 'USD',
                'COD': 'USD',
              };
              const currency = currencyMap[paymentType.toUpperCase()] || paymentType.toUpperCase();
              if (CURRENCY_OPTIONS.includes(currency)) {
                rowChanges.set('don_vi_tien', currency);
              }
              return updated;
            });
          }
        });
      }

      // Tự động cập nhật ngay_update = today khi có bất kỳ thay đổi nào
      // (trừ khi chính ngay_update được thay đổi)
      if (columnKey !== 'ngay_update') {
        const today = new Date().toISOString();
        rowChanges.set('ngay_update', today);
      }

      return next;
    });
  };

  // Update database với pending changes
  const handleSaveChanges = async () => {
    if (pendingChanges.size === 0) {
      alert('Không có thay đổi nào để lưu');
      return;
    }

    setUpdating(true);
    try {
      const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
      const tableName = isBillTab ? 'chi_tiet_bill_tien' : 'chitiet_cuoc';
      const updates = [];

      // Tạo danh sách các update
      const today = new Date().toISOString();
      pendingChanges.forEach((rowChanges, rowId) => {
        const updateObj = { id: rowId };
        rowChanges.forEach((value, columnKey) => {
          // Skip loc_trung as it's a calculated field
          if (columnKey !== 'loc_trung') {
            updateObj[columnKey] = value;
          }
        });
        // Đảm bảo ngay_update luôn = today khi có thay đổi
        updateObj.ngay_update = today;
        updates.push(updateObj);
      });

      // Batch update
      for (const update of updates) {
        const { id, ...updateData } = update;
        const { error } = await supabase
          .from(tableName)
          .update(updateData)
          .eq('id', id);

        if (error) throw error;
      }

      // Clear pending changes
      setPendingChanges(new Map());
      
      // Reload data
      if (isBillTab) {
        await loadBillData();
      } else {
        await loadCuocData();
      }

      alert(`Đã cập nhật thành công ${updates.length} bản ghi!`);
    } catch (error) {
      console.error('Error saving changes:', error);
      alert('Lỗi khi lưu thay đổi: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

  // Tải mẫu Excel
  const handleDownloadTemplate = () => {
    const columns = getCurrentColumns();
    const today = new Date().toISOString().split('T')[0];
    
    // Tạo dữ liệu mẫu với 3 dòng ví dụ
    const templateData = [];
    
    if (activeTab === 'bill' || activeTab === 'bill_view') {
      // Mẫu cho tab Bill
      templateData.push({
        'STT': 1,
        'Mã đơn hàng': 'Bona272f26d',
        'Mã Tracking': 'TRACK001',
        'Ngày đối soát': today,
        'FFM': 'DHL',
        'Đơn vị tiền': 'USD',
        'Số tiền đối soát': 100.50,
        'Tỷ giá': 25000,
        'Tiền Việt': 2512500,
        'Đếm lần thanh toán': 1,
        'Ngày Update': today,
        'Note': 'Ghi chú mẫu 1',
        'Note 2': 'Ghi chú mẫu 2'
      });
      templateData.push({
        'STT': 2,
        'Mã đơn hàng': 'Fit31b31704',
        'Mã Tracking': 'TRACK002',
        'Ngày đối soát': today,
        'FFM': 'FedEx',
        'Đơn vị tiền': 'AUD',
        'Số tiền đối soát': 50.75,
        'Tỷ giá': 18000,
        'Tiền Việt': 913500,
        'Đếm lần thanh toán': 1,
        'Ngày Update': today,
        'Note': 'Ghi chú mẫu 3',
        'Note 2': ''
      });
      templateData.push({
        'STT': 3,
        'Mã đơn hàng': 'DG6da921bf',
        'Mã Tracking': 'TRACK003',
        'Ngày đối soát': today,
        'FFM': 'UPS',
        'Đơn vị tiền': 'CAD',
        'Số tiền đối soát': 75.25,
        'Tỷ giá': 19000,
        'Tiền Việt': 1429750,
        'Đếm lần thanh toán': 2,
        'Ngày Update': today,
        'Note': '',
        'Note 2': 'Ghi chú mẫu 4'
      });
    } else {
      // Mẫu cho tab Cước
      templateData.push({
        'Mã đơn hàng': 'Bona272f26d',
        'Tiền cước': 25.50,
        'Đơn vị tiền tệ': 'USD',
        'Ngày đối soát cước': today,
        'Tỷ giá': 25000,
        'Tiền ship (Vnđ)': 637500,
        'Thị trường': 'US',
        'Lọc trùng': '',
        'Chi nhánh': 'HCM'
      });
      templateData.push({
        'Mã đơn hàng': 'Fit31b31704',
        'Tiền cước': 15.75,
        'Đơn vị tiền tệ': 'AUD',
        'Ngày đối soát cước': today,
        'Tỷ giá': 18000,
        'Tiền ship (Vnđ)': 283500,
        'Thị trường': 'AU',
        'Lọc trùng': '',
        'Chi nhánh': 'Hà Nội'
      });
      templateData.push({
        'Mã đơn hàng': 'DG6da921bf',
        'Tiền cước': 30.00,
        'Đơn vị tiền tệ': 'CAD',
        'Ngày đối soát cước': today,
        'Tỷ giá': 19000,
        'Tiền ship (Vnđ)': 570000,
        'Thị trường': 'CA',
        'Lọc trùng': '',
        'Chi nhánh': 'HCM'
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(wb, ws, (activeTab === 'bill' || activeTab === 'bill_view') ? 'Bill' : 'Cuoc');
    
    const fileName = (activeTab === 'bill' || activeTab === 'bill_view') 
      ? `Mau_Bill_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `Mau_Cuoc_${new Date().toISOString().slice(0, 10)}.xlsx`;
    
    XLSX.writeFile(wb, fileName);
  };

  // Upload Excel và import dữ liệu
  const handleUploadExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm(`Bạn có chắc chắn muốn nhập dữ liệu từ file Excel này? Dữ liệu sẽ được thêm vào bảng ${(activeTab === 'bill' || activeTab === 'bill_view') ? 'chi_tiet_bill_tien' : 'chitiet_cuoc'}.`)) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(ws);

      if (jsonData.length === 0) {
        alert('File Excel không có dữ liệu!');
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const columns = getCurrentColumns();
      const tableName = (activeTab === 'bill' || activeTab === 'bill_view') ? 'chi_tiet_bill_tien' : 'chitiet_cuoc';
      
      // Helper function để map tên cột Excel (có thể là label) về key database
      const getColumnKey = (excelLabel) => {
        const col = columns.find(c => c.label === excelLabel || c.label.toLowerCase() === excelLabel.toLowerCase());
        return col ? col.key : null;
      };

      // Map dữ liệu từ Excel vào format database
      const recordsToInsert = [];
      for (const row of jsonData) {
        const record = {};
        let hasData = false;

        // Map từng cột
        Object.keys(row).forEach(excelKey => {
          const dbKey = getColumnKey(excelKey);
          if (dbKey) {
            const value = row[excelKey];
            
            // Bỏ qua các cột read-only
            if (dbKey === 'id' || dbKey === 'created_at' || dbKey === 'updated_at' || dbKey === 'loc_trung') {
              return;
            }

            // Xử lý giá trị theo loại cột
            if (dbKey.includes('ngay') || dbKey.includes('date')) {
              // Date field - chuyển đổi format
              if (value) {
                // Nếu là string date, chuyển sang ISO format
                if (typeof value === 'string') {
                  const date = new Date(value);
                  if (!isNaN(date.getTime())) {
                    record[dbKey] = date.toISOString().split('T')[0];
                    hasData = true;
                  }
                } else if (value instanceof Date) {
                  record[dbKey] = value.toISOString().split('T')[0];
                  hasData = true;
                }
              }
            } else if (dbKey.includes('tien') || dbKey.includes('so_tien') || dbKey.includes('ty_gia') || dbKey.includes('cuoc') || dbKey === 'stt' || dbKey === 'dem_lan_thanh_toan') {
              // Number field
              if (value !== null && value !== undefined && value !== '') {
                const num = parseFloat(value);
                if (!isNaN(num)) {
                  record[dbKey] = num;
                  hasData = true;
                }
              }
            } else {
              // Text field
              if (value !== null && value !== undefined && value !== '') {
                record[dbKey] = String(value).trim();
                hasData = true;
              }
            }
          }
        });

        // Chỉ thêm record nếu có ít nhất một trường dữ liệu
        if (hasData) {
          recordsToInsert.push(record);
        }
      }

      if (recordsToInsert.length === 0) {
        alert('Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng kiểm tra lại định dạng file.');
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Insert vào database
      const { data, error } = await supabase
        .from(tableName)
        .insert(recordsToInsert)
        .select();

      if (error) {
        if (error.code === '23505') {
          alert(`Một số dữ liệu đã tồn tại trong hệ thống. Đã thêm ${recordsToInsert.length} bản ghi mới.`);
        } else {
          throw error;
        }
      } else {
        const successCount = data?.length || 0;
        alert(`Đã nhập thành công ${successCount} bản ghi từ file Excel!`);
        
        // Reload data
        const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
        if (isBillTab) {
          await loadBillData();
        } else {
          await loadCuocData();
        }
      }
    } catch (error) {
      console.error('Error uploading Excel:', error);
      alert('Lỗi khi nhập file Excel: ' + error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Thêm nhiều mã đơn hàng
  const handleAddOrderCodes = async () => {
    const codes = parseOrderCodes(orderCodesInput);
    
    if (codes.length === 0) {
      alert('Vui lòng nhập ít nhất một mã đơn hàng');
      return;
    }

    if (codes.length > 1000) {
      alert(`Số lượng mã đơn hàng vượt quá giới hạn 1000. Bạn đã nhập ${codes.length} mã.`);
      return;
    }

    setAdding(true);
    try {
      const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
      const tableName = isBillTab ? 'chi_tiet_bill_tien' : 'chitiet_cuoc';
      
      // Tạo mảng các bản ghi cần insert
      const recordsToInsert = codes.map((code) => ({
        ma_don_hang: code,
      }));

      // Insert vào database
      const { data, error } = await supabase
        .from(tableName)
        .insert(recordsToInsert)
        .select();

      if (error) {
        // Kiểm tra nếu lỗi do duplicate (mã đơn hàng đã tồn tại)
        if (error.code === '23505') {
          alert(`Một số mã đơn hàng đã tồn tại trong hệ thống. Vui lòng kiểm tra lại.`);
        } else {
          throw error;
        }
      } else {
        const successCount = data?.length || 0;
        alert(`Đã thêm thành công ${successCount} mã đơn hàng vào hệ thống!`);
        setShowAddModal(false);
        setOrderCodesInput('');
        
        // Reload data
        if (isBillTab) {
          await loadBillData();
        } else {
          await loadCuocData();
        }
      }
    } catch (error) {
      console.error('Error adding order codes:', error);
      alert('Lỗi khi thêm mã đơn hàng: ' + error.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm z-10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-800">Đối soát bill cước</h1>
              <p className="text-xs text-gray-500">Quản lý tài chính - Đối soát bill và cước phí</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition"
            >
              <Download className="w-4 h-4" />
              Tải mẫu Excel
            </button>
            <label className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-sm font-medium transition cursor-pointer">
              <Upload className="w-4 h-4" />
              {uploading ? 'Đang tải lên...' : 'Tải lên Excel'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleUploadExcel}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Đang đồng bộ...
                </>
              ) : (
                <>
                  <RotateCw className="w-4 h-4" />
                  Đồng bộ
                </>
              )}
            </button>
            {/* Khu vực xử lý tạm thời dữ liệu Excel (staging) */}
            <button
              onClick={handleClearAllBillTemp}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition disabled:opacity-50"
            >
              Xóa bill tạm
            </button>
            <button
              onClick={handleClearAllCuocTemp}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition disabled:opacity-50"
            >
              Xóa cước tạm
            </button>
            <button
              onClick={() => navigate('/quan-ly-ty-gia')}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition"
            >
              <Settings className="w-4 h-4" />
              Cài đặt tỷ giá
            </button>
            {!hasSynced && (
              <>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition"
                >
                  <Plus className="w-4 h-4" />
                  Thêm mã đơn hàng
                </button>
                {pendingChanges.size > 0 && (
                  <button
                    onClick={handleSaveChanges}
                    disabled={updating}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 relative"
                  >
                    {updating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Đang lưu...
                      </>
                    ) : (
                      <>
                        Lưu thay đổi
                        <span className="ml-1 bg-white text-orange-500 text-xs font-bold px-1.5 py-0.5 rounded-full">
                          {pendingChanges.size}
                        </span>
                      </>
                    )}
                  </button>
                )}
              </>
            )}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Đang tải...' : 'Tải lại'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-4">
        <div className="flex gap-2">
          {/* Tabs nhập dữ liệu - sẽ ẩn sau khi đồng bộ */}
          {!hasSynced && (
            <>
              <button
                onClick={() => {
                  setActiveTab('bill');
                  setCurrentPage(1);
                }}
                className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === 'bill'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Nhập bill
              </button>
              <button
                onClick={() => {
                  setActiveTab('cuoc');
                  setCurrentPage(1);
                }}
                className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === 'cuoc'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Nhập Cước
              </button>
            </>
          )}

          {/* Tabs xem toàn bộ data đã tải lên */}
          <button
            onClick={() => {
              setActiveTab('bill_view');
              setCurrentPage(1);
            }}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'bill_view'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Bill đã tải lên
          </button>
          <button
            onClick={() => {
              setActiveTab('cuoc_view');
              setCurrentPage(1);
            }}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'cuoc_view'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Cước đã tải lên
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Summary */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">
                {activeTab === 'bill' || activeTab === 'bill_view'
                  ? 'Dữ liệu từ bảng chi_tiet_bill_tien'
                  : 'Dữ liệu từ bảng chitiet_cuoc'}
              </p>
              <p className="text-lg font-semibold text-gray-800 mt-1">
                Tổng số bản ghi: {getCurrentData().length}
              </p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  {getCurrentColumns().map((col) => (
                    <th
                      key={col.key}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200 whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td
                      colSpan={getCurrentColumns().length}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                ) : paginatedData().length === 0 ? (
                  <tr>
                    <td
                      colSpan={getCurrentColumns().length}
                      className="px-4 py-8 text-center text-gray-500 italic"
                    >
                      Không có dữ liệu
                    </td>
                  </tr>
                ) : (
                  paginatedData().map((row, rowIdx) => {
                    const rowId = row.id;
                    const hasPendingChanges = pendingChanges.has(rowId);
                    const rowPendingChanges = pendingChanges.get(rowId) || new Map();
                    const columns = getCurrentColumns();
                    
                    return (
                      <tr key={rowId || rowIdx} className={`hover:bg-gray-50 ${hasPendingChanges ? 'bg-yellow-50' : ''}`}>
                        {columns.map((col, colIdx) => {
                          const isViewMode = activeTab === 'bill_view' || activeTab === 'cuoc_view';
                          // Bỏ qua các trường không cho phép chỉnh sửa hoặc khi đang ở chế độ chỉ xem
                          const isReadOnly =
                            isViewMode ||
                            col.key === 'id' ||
                            col.key === 'created_at' ||
                            col.key === 'updated_at' ||
                            col.key === 'loc_trung' ||
                            col.key === 'ngay_update';
                          
                          // Lấy giá trị hiện tại (ưu tiên pending changes)
                          let originalValue = row[col.key] ?? '';
                          let displayValue = originalValue;
                          
                          // Nếu có pending change, dùng giá trị pending
                          if (rowPendingChanges.has(col.key)) {
                            displayValue = rowPendingChanges.get(col.key);
                          }
                          
                          // Hiển thị tỷ giá tự động từ cài đặt nếu:
                          // - Đây là cột ty_gia
                          // - Tỷ giá trống hoặc null
                          // - Có đơn vị tiền tệ
                          // - Chưa có pending change cho ty_gia
                          if (col.key === 'ty_gia' && !rowPendingChanges.has('ty_gia')) {
                            const currencyKey =
                              activeTab === 'bill' || activeTab === 'bill_view' ? 'don_vi_tien' : 'don_vi_tien_te';
                            const currency = row[currencyKey];
                            
                            // Kiểm tra pending change cho currency
                            const currencyPending = rowPendingChanges.get(currencyKey);
                            const finalCurrency = currencyPending !== undefined ? currencyPending : currency;
                            
                            if (finalCurrency && (!displayValue || displayValue === '' || displayValue === null)) {
                              const currencyUpper = String(finalCurrency).toUpperCase();
                              const rate = exchangeRates[currencyUpper];
                              
                              if (rate !== null && rate !== undefined) {
                                // Hiển thị tỷ giá tự động từ cài đặt (sẽ được lưu qua useEffect)
                                displayValue = rate;
                              }
                            }
                          }
                          
                          // Tự động hiển thị ngay_update = today nếu trống
                          if (col.key === 'ngay_update' && (!displayValue || displayValue === '' || displayValue === null)) {
                            displayValue = new Date().toISOString();
                          }
                          
                          // Format dựa trên loại dữ liệu (chỉ format khi hiển thị, không format khi edit)
                          let formattedValue = displayValue;
                          if (!rowPendingChanges.has(col.key)) {
                            if (col.key.includes('ngay') || col.key.includes('date')) {
                              if (col.key === 'ngay_update') {
                                formattedValue = formatDateTime(displayValue);
                              } else {
                                formattedValue = formatDate(displayValue);
                              }
                            } else if (
                              col.key.includes('tien') ||
                              col.key.includes('so_tien') ||
                              col.key.includes('ty_gia') ||
                              col.key.includes('cuoc')
                            ) {
                              formattedValue = formatNumber(displayValue);
                            }
                          }

                          const hasChange = rowPendingChanges.has(col.key);
                          const isDateField = col.key.includes('ngay') || col.key.includes('date');
                          const isNumberField = col.key.includes('tien') || col.key.includes('so_tien') || col.key.includes('ty_gia') || col.key.includes('cuoc') || col.key === 'stt' || col.key === 'dem_lan_thanh_toan';
                          const isCurrencyField = col.key === 'don_vi_tien' || col.key === 'don_vi_tien_te';

                      const isSelected = selectionBounds && 
                        rowIdx >= selectionBounds.minRow && 
                        rowIdx <= selectionBounds.maxRow &&
                        colIdx >= selectionBounds.minCol &&
                        colIdx <= selectionBounds.maxCol;

                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-3 text-sm border-b border-gray-100 ${
                            hasChange ? 'bg-yellow-200' : ''
                          } ${isReadOnly ? 'bg-gray-50' : 'cursor-text'} ${
                            isSelected ? 'bg-blue-200 border-2 border-blue-400' : ''
                          }`}
                          onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                          onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                        >
                              {isReadOnly ? (
                                <span className="text-gray-500">{formattedValue || '-'}</span>
                              ) : isCurrencyField ? (
                                <select
                                  value={displayValue || ''}
                                  onChange={(e) => {
                                    const newValue = e.target.value || null;
                                    handleCellChange(rowId, col.key, newValue);
                                  }}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                  <option value="">-- Chọn --</option>
                                  {CURRENCY_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              ) : isDateField ? (
                                <input
                                  type="date"
                                  value={displayValue ? (new Date(displayValue).toISOString().split('T')[0]) : ''}
                                  onChange={(e) => {
                                    const newValue = e.target.value || null;
                                    handleCellChange(rowId, col.key, newValue);
                                  }}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                />
                              ) : isNumberField ? (
                                <input
                                  type="number"
                                  step="any"
                                  value={displayValue || ''}
                                  onChange={(e) => {
                                    const newValue = e.target.value === '' ? null : parseFloat(e.target.value);
                                    handleCellChange(rowId, col.key, newValue);
                                  }}
                                  onBlur={(e) => {
                                    // Format lại khi blur
                                    if (e.target.value) {
                                      const num = parseFloat(e.target.value);
                                      if (!isNaN(num)) {
                                        handleCellChange(rowId, col.key, num);
                                      }
                                    }
                                  }}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                  placeholder="0"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={displayValue || ''}
                                  onChange={(e) => {
                                    handleCellChange(rowId, col.key, e.target.value);
                                  }}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                  placeholder=""
                                />
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

          {/* Pagination */}
          {!loading && getCurrentData().length > 0 && (
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Số dòng mỗi trang:</label>
                <select
                  className="border rounded px-2 py-1 text-sm"
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Trước
                </button>
                <span className="text-sm text-gray-600">
                  Trang {currentPage} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800">
                Thêm mã đơn hàng - {activeTab === 'bill' || activeTab === 'bill_view' ? 'Nhập bill' : 'Nhập Cước'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setOrderCodesInput('');
                }}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dán danh sách mã đơn hàng (mỗi mã một dòng, tối đa 1000 mã):
                </label>
                <textarea
                  value={orderCodesInput}
                  onChange={(e) => setOrderCodesInput(e.target.value)}
                  placeholder="Bona272f26d&#10;Dánbdb25d1a&#10;Fit31b31704&#10;DG6da921bf&#10;..."
                  className="w-full h-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  disabled={adding}
                />
                <div className="mt-2 text-sm text-gray-500">
                  Số mã đã nhập: {parseOrderCodes(orderCodesInput).length} / 1000
                </div>
                {parseOrderCodes(orderCodesInput).length > 1000 && (
                  <div className="mt-2 text-sm text-red-600 font-medium">
                    ⚠️ Vượt quá giới hạn 1000 mã đơn hàng!
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Hướng dẫn:</strong>
                </p>
                <ul className="text-sm text-blue-700 mt-1 list-disc list-inside space-y-1">
                  <li>Dán danh sách mã đơn hàng vào ô trên (mỗi mã một dòng)</li>
                  <li>Tối đa 1000 mã đơn hàng mỗi lần thêm</li>
                  <li>Hệ thống sẽ tự động tạo các dòng mới với mã đơn hàng tương ứng</li>
                  <li>Các trường khác có thể để trống và điền sau</li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setOrderCodesInput('');
                }}
                disabled={adding}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleAddOrderCodes}
                disabled={adding || parseOrderCodes(orderCodesInput).length === 0 || parseOrderCodes(orderCodesInput).length > 1000}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {adding ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Đang thêm...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Thêm ({parseOrderCodes(orderCodesInput).length} mã)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DoiSoatBillCuoc;
