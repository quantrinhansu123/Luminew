import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ArrowLeft, RefreshCw, Plus, X, RotateCw, Download, Upload, Trash2, History, Search, FileDown, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase/config';
import * as XLSX from 'xlsx';

// Bill: mẫu đối soát (ngay_update / note lưu DB nhưng không hiện bảng & Excel)
const BILL_TIEN_COLUMNS = [
  { key: 'stt', label: 'STT' },
  { key: 'ma_don_hang', label: 'Mã đơn hàng' },
  { key: 'ma_tracking', label: 'Mã Tracking' },
  { key: 'ngay_doi_soat', label: 'Ngày đối soát' },
  { key: 'ffm', label: 'FFM' },
  { key: 'so_tien_doi_soat', label: 'Số tiền đối soát' },
  { key: 'ty_gia', label: 'Tỷ giá' },
  { key: 'tien_viet', label: 'Tiền Việt' },
  { key: 'accountant_confirm', label: 'Kế toán xác nhận' },
  { key: 'sync_batch_label', label: 'Đợt đồng bộ', computed: true },
  { key: 'dem_lan_thanh_toan', label: 'Đếm lần thanh toán', computed: true },
];


// Cước: theo mẫu — bỏ Tiền cước / Đơn vị tiền / Tỷ giá / Thị trường (không nhập, không import Excel)
// Đếm lần thanh toán: số dòng cùng mã đơn trên bảng (pending), giống quy tắc Bill; ô đỏ nếu > 1
// Chi nhánh: tự link từ orders.team, không nhập từ Excel
const CUOC_COLUMNS = [
  { key: 'ma_don_hang', label: 'Mã đơn hàng' },
  { key: 'ngay_doi_soat_cuoc', label: 'Ngày đối soát cước' },
  { key: 'tien_ship_vnd', label: 'Tiền ship (Vnđ)' },
  { key: 'sync_batch_label', label: 'Đợt đồng bộ', computed: true },
  { key: 'dem_lan_thanh_toan', label: 'Đếm lần thanh toán', computed: true },
  { key: 'chi_nhanh', label: 'Chi nhánh', computed: true },
];

// Currency options for dropdown
const CURRENCY_OPTIONS = ['AUD', 'CAD', 'USD', 'YEN'];

/** Excel cước: dòng 1 ghi chú, dòng 2 header — đọc từ dòng header tìm được; không thì fallback json_to_json */
function sheetToJsonCuocImport(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows.length) return [];

  const normalizeLabel = (s) =>
    String(s ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // bỏ dấu tiếng Việt

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const hasMaDon = r.some(
      (c) => normalizeLabel(c) === normalizeLabel('Mã đơn hàng')
    );
    if (hasMaDon) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return XLSX.utils.sheet_to_json(ws);
  }
  const headers = (rows[headerIdx] || []).map((h) => String(h).trim());
  const out = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.some((c) => c !== '' && c != null && String(c).trim() !== '')) continue;
    const obj = {};
    headers.forEach((h, i) => {
      if (!h) return;
      const v = row[i];
      if (v !== '' && v != null) obj[h] = v;
    });
    if (Object.keys(obj).length) out.push(obj);
  }
  return out;
}

function normalizeCuocMaDon(code) {
  if (code == null || code === '') return '';
  return String(code).trim();
}

function toIsoDateString(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
      user?.name,
      localStorage.getItem('user_full_name')
    ];
    return parts.map((v) => String(v || '').trim()).find(Boolean) || 'Hệ thống';
  } catch (e) {
    return 'Hệ thống';
  }
}

function parseExcelDateToISO(rawValue) {
  if (rawValue == null || rawValue === '') return null;

  if (rawValue instanceof Date) {
    return toIsoDateString(rawValue);
  }

  if (typeof rawValue === 'number') {
    const parsed = XLSX.SSF.parse_date_code(rawValue);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const dt = new Date(parsed.y, parsed.m - 1, parsed.d);
      return toIsoDateString(dt);
    }
    return null;
  }

  const value = String(rawValue).trim();
  if (!value) return null;

  // Ưu tiên định dạng kế toán hay dùng: dd/mm/yyyy
  const dmy = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const yRaw = Number(dmy[3]);
    const y = yRaw < 100 ? 2000 + yRaw : yRaw;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return toIsoDateString(dt);
    }
  }

  // Fallback cho các định dạng Date chuẩn khác.
  const dt = new Date(value);
  return toIsoDateString(dt);
}

/** Mã đơn cước trên bảng (ưu tiên pending), đã normalize trim. */
function getEffectiveCuocMaDonHang(row, pendingChanges) {
  const pendRow = pendingChanges.get(row.id);
  const v = pendRow?.has('ma_don_hang') ? pendRow.get('ma_don_hang') : row.ma_don_hang;
  return normalizeCuocMaDon(v);
}

/** Mã tracking hiện trên bảng bill (ưu tiên pending). */
function getEffectiveBillMaTracking(row, pendingChanges) {
  const pendRow = pendingChanges.get(row.id);
  const v = pendRow?.has('ma_tracking') ? pendRow.get('ma_tracking') : row.ma_tracking;
  if (v == null || v === '') return '';
  return String(v).trim();
}

/** Mã đơn hiện trên bảng bill (ưu tiên pending). */
function getEffectiveBillMaDonHang(row, pendingChanges) {
  const pendRow = pendingChanges.get(row.id);
  const v = pendRow?.has('ma_don_hang') ? pendRow.get('ma_don_hang') : row.ma_don_hang;
  if (v == null || v === '') return '';
  return String(v).trim();
}

/**
 * Bill: tracking trống / null hoặc placeholder Dropoff (Drop off, DROPP OFF, droppoff, …).
 * Các trường hợp này khớp logic theo Mã đơn hàng trên dòng bill.
 */
function isBillTrackingDropoffPlaceholder(maTracking) {
  if (maTracking == null) return true;
  const t = String(maTracking).trim();
  if (t === '') return true;
  const n = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s._-]+/g, '');
  if (n === '') return true;
  if (n === 'dropoff' || n.startsWith('dropoff')) return true;
  if (n === 'droppoff' || n.startsWith('droppoff')) return true;
  return false;
}

/** Khóa gom "Đếm lần thanh toán" / modal: theo tracking thật, hoặc theo mã đơn khi dropoff/trống tracking. */
function getBillDemLanDetailId(row, pendingChanges) {
  const tk = getEffectiveBillMaTracking(row, pendingChanges);
  if (tk && !isBillTrackingDropoffPlaceholder(tk)) {
    return `tr:${tk}`;
  }
  const mdh = getEffectiveBillMaDonHang(row, pendingChanges);
  return mdh ? `ord:${mdh}` : '';
}

/** Mã đơn có thật trong bảng orders (batch), tránh đếm sai khi UPDATE không trả dòng do RLS. */
async function fetchExistingOrderCodesSet(supabaseClient, orderCodes) {
  const set = new Set();
  const list = [...orderCodes]
    .map((c) => (c == null ? '' : String(c).trim()))
    .filter(Boolean);
  if (list.length === 0) return set;
  const BATCH = 500;
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const { data, error } = await supabaseClient.from('orders').select('order_code').in('order_code', batch);
    if (error) throw error;
    for (const r of data || []) {
      if (r?.order_code != null) set.add(String(r.order_code).trim());
    }
  }
  return set;
}

/** Mã tracking (trim) → các order_code có đúng tracking_code đó (đồng bộ hết, kể cả nhiều đơn trùng tracking). */
async function fetchOrderCodesByTrackingMap(supabaseClient, trackingKeys) {
  const map = new Map();
  const unique = [
    ...new Set([...trackingKeys].map((t) => (t == null ? '' : String(t).trim())).filter(Boolean)),
  ];
  if (unique.length === 0) return map;
  const BATCH = 1000;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const { data, error } = await supabaseClient
      .from('orders')
      .select('order_code, tracking_code')
      .in('tracking_code', batch);
    if (error) throw error;
    for (const o of data || []) {
      const tc =
        o.tracking_code != null && o.tracking_code !== ''
          ? String(o.tracking_code).trim()
          : '';
      const oc = o.order_code != null ? String(o.order_code).trim() : '';
      if (!tc || !oc) continue;
      if (!map.has(tc)) map.set(tc, new Set());
      map.get(tc).add(oc);
    }
  }
  const out = new Map();
  for (const [tk, set] of map) {
    out.set(tk, [...set].sort((a, b) => a.localeCompare(b)));
  }
  return out;
}

function DoiSoatBillCuoc() {
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
  // Đồng bộ bill / cước tách riêng: mỗi bên có mốc thời gian để ẩn bản ghi đã sync khỏi view
  const [lastBillSyncTime, setLastBillSyncTime] = useState(null);
  const [lastCuocSyncTime, setLastCuocSyncTime] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  /** Chuẩn hóa mã đơn — modal chi tiết trùng cước */
  const [cuocDupDetailKey, setCuocDupDetailKey] = useState(null);
  /** Mã tracking — modal các dòng bill cùng mã (theo bảng đang hiện) */
  const [billTrackingDetailKey, setBillTrackingDetailKey] = useState(null);
  const [deletingBillDetailRowId, setDeletingBillDetailRowId] = useState(null);
  const [deletingCuocDetailRowId, setDeletingCuocDetailRowId] = useState(null);
  
  /** Modal kết quả import Excel - hiển thị dòng trùng hoàn toàn */
  const [importResultData, setImportResultData] = useState(null); // { duplicateRows: [], newRows: [], tableName: '' }
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  
  /** Tiến độ import */
  const [importProgress, setImportProgress] = useState(null); // { current: 0, total: 0, status: 'processing' | 'success' | 'error' }

  /** Chế độ đồng bộ Bill: 'tracking' (theo tracking, fallback mã đơn) hoặc 'order_code' (chỉ theo mã đơn). */
  const [billSyncMode, setBillSyncMode] = useState('tracking');

  /** Chọn hàng loạt */
  const [selectedRows, setSelectedRows] = useState(new Set()); // Set of row.id
  const [bulkAccountantConfirm, setBulkAccountantConfirm] = useState('');
  const [showBulkDropdown, setShowBulkDropdown] = useState(false);
  const accountantOptions = ["", "Đã thu tiền", "Chưa thu tiền", "Treo", "Hủy", "Khác"];

  /** Modal đồng bộ tùy chỉnh (Premium) */
  const [showSyncConfirmModal, setShowSyncConfirmModal] = useState(false);
  const [syncConfirmData, setSyncConfirmData] = useState({
    title: '',
    modeLabel: '',
    stats: { total: 0, found: 0, missing: 0, rawRows: 0 },
    errorList: [], // { label, items }
    onConfirm: () => {}
  });

  /** Modal Lịch sử */
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState({ type: 'all', search: '', date: '' });

  /** Tiến độ đồng bộ */
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, active: false });

  const fetchSyncHistory = async () => {
    setLoadingHistory(true);
    try {
      let query = supabase
        .from('sync_history_log')
        .select('*')
        .order('created_at', { ascending: false });
      
      const { data, error } = await query;
      if (error) throw error;
      setHistoryLogs(data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
      alert(`Không tải được lịch sử đồng bộ: ${err?.message || String(err)}`);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleExportHistoryExcel = () => {
    if (!historyLogs.length) return;
    const exportData = historyLogs.map(log => ({
      'ID': log.id,
      'Thời gian': new Date(log.created_at).toLocaleString('vi-VN'),
      'Người thực hiện': log.performed_by,
      'Loại': log.sync_type,
      'Chế độ': log.mode_label,
      'Tổng dòng thô': log.total_input_rows,
      'Mã đơn duy nhất': log.unique_orders_count,
      'Thành công': log.success_count,
      'Thất bại/Bỏ qua': log.missing_count
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lịch sử đồng bộ");
    XLSX.writeFile(wb, `LichSuDongBo_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const saveSyncHistory = async (stats) => {
    try {
      const performedBy = getVanDonSessionDisplayName();
      const { error } = await supabase.from('sync_history_log').insert([{
        performed_by: performedBy,
        sync_type: stats.syncType,
        mode_label: stats.modeLabel,
        total_input_rows: stats.totalInputRows,
        unique_orders_count: stats.uniqueOrdersCount,
        success_count: stats.successCount,
        missing_count: stats.missingCount
      }]);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error saving sync history:', err);
      alert(
        `Đồng bộ đã chạy nhưng KHÔNG lưu được lịch sử: ${err?.message || String(err)}\n` +
        'Vui lòng kiểm tra bảng sync_history_log và quyền RLS/GRANT.'
      );
      return false;
    }
  };

  // Helper chia mảng thành các lô nhỏ (chunks)
  const chunkArray = (array, size) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  };

  /** Đếm lần thanh toán: cùng Mã Tracking (tracking thật) hoặc cùng Mã đơn (dropoff / trống tracking). */
  const billDataWithTableDemLan = useMemo(() => {
    const rows = billData || [];
    const counts = {};
    rows.forEach((r) => {
      const id = getBillDemLanDetailId(r, pendingChanges);
      if (id) counts[id] = (counts[id] || 0) + 1;
    });
    return rows.map((row) => {
      const id = getBillDemLanDetailId(row, pendingChanges);
      return {
        ...row,
        dem_lan_thanh_toan: id ? counts[id] : null,
      };
    });
  }, [billData, pendingChanges]);

  /** Đếm lần thanh toán (cước): số dòng cùng mã đơn trên bảng đang hiện + pending — cùng quy tắc cột Bill. */
  const cuocDataWithTableDemLan = useMemo(() => {
    const rows = cuocData || [];
    const counts = {};
    rows.forEach((r) => {
      const k = getEffectiveCuocMaDonHang(r, pendingChanges);
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
    return rows.map((row) => {
      const k = getEffectiveCuocMaDonHang(row, pendingChanges);
      const n = k ? counts[k] : 0;
      return {
        ...row,
        dem_lan_thanh_toan: k ? n : null,
      };
    });
  }, [cuocData, pendingChanges]);

  // Load data từ chi_tiet_bill_tien — truyền syncCutoff (ISO) khi vừa đồng bộ để tránh stale state
  const loadBillData = async (syncCutoff) => {
    setLoading(true);
    try {
      const billCutoff = syncCutoff !== undefined && syncCutoff !== null ? syncCutoff : lastBillSyncTime;
      const { data, error } = await supabase
        .from('chi_tiet_bill_tien')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Lấy shipping_unit và payment_type từ orders theo mã đơn; theo mã tracking nếu thiếu mã đơn
      const orderCodes = [...new Set((data || []).map((row) => row.ma_don_hang).filter(Boolean))];
      const trackingCodes = [
        ...new Set(
          (data || [])
            .map((row) =>
              row.ma_tracking != null && row.ma_tracking !== '' ? String(row.ma_tracking).trim() : ''
            )
            .filter((tc) => tc && !isBillTrackingDropoffPlaceholder(tc))
        ),
      ];
      const shippingUnitMap = new Map();
      const paymentTypeMap = new Map();
      const trackingOrderMap = new Map();

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

      if (trackingCodes.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < trackingCodes.length; i += batchSize) {
          const batch = trackingCodes.slice(i, i + batchSize);
          const { data: byTracking, error: trErr } = await supabase
            .from('orders')
            .select('order_code, shipping_unit, payment_type, tracking_code')
            .in('tracking_code', batch);

          if (!trErr && byTracking) {
            const tcGroups = new Map();
            byTracking.forEach((order) => {
              const tc =
                order.tracking_code != null && order.tracking_code !== ''
                  ? String(order.tracking_code).trim()
                  : '';
              if (!tc) return;
              if (!tcGroups.has(tc)) tcGroups.set(tc, []);
              tcGroups.get(tc).push(order);
            });
            tcGroups.forEach((arr, tc) => {
              arr.sort((a, b) => String(a.order_code).localeCompare(String(b.order_code)));
              trackingOrderMap.set(tc, arr[0]);
            });
          }
        }
      }

      const applyPaymentTypeToRow = (updatedRow, paymentType) => {
        if (!paymentType) return;
        const currencyMap = {
          USD: 'USD',
          AUD: 'AUD',
          CAD: 'CAD',
          JPY: 'YEN',
          YEN: 'YEN',
          ZELLE: 'USD',
          COD: 'USD',
        };
        const mappedCurrency =
          currencyMap[String(paymentType).toUpperCase()] || String(paymentType).toUpperCase();
        if (CURRENCY_OPTIONS.includes(mappedCurrency)) {
          updatedRow.don_vi_tien = mappedCurrency;
        }
      };

      // Tự động điền tỷ giá cho các hàng có đơn vị tiền tệ nhưng chưa có tỷ giá
      let processedData = (data || []).map((row) => {
        const updatedRow = { ...row };

        const tk =
          row.ma_tracking != null && row.ma_tracking !== '' ? String(row.ma_tracking).trim() : '';
        const mdh =
          row.ma_don_hang != null && row.ma_don_hang !== '' ? String(row.ma_don_hang).trim() : '';
        const fromTracking =
          tk && !isBillTrackingDropoffPlaceholder(tk) ? trackingOrderMap.get(tk) : null;
        /** Tracking thật → đơn từ orders theo tracking; Dropoff / trống → đơn theo Mã đơn trên dòng bill. */
        const effectiveOrder =
          tk && !isBillTrackingDropoffPlaceholder(tk)
            ? fromTracking?.order_code ?? null
            : mdh || null;

        if (effectiveOrder) {
          const shippingUnit = shippingUnitMap.get(effectiveOrder) || fromTracking?.shipping_unit;
          if (shippingUnit) {
            updatedRow.ffm = shippingUnit;
          }
          const paymentType = paymentTypeMap.get(effectiveOrder) || fromTracking?.payment_type;
          applyPaymentTypeToRow(updatedRow, paymentType);
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

      if (billCutoff) {
        const last = new Date(billCutoff).getTime();
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

  // Load dữ liệu tab Bill đã tải lên từ bảng lịch sử đã đồng bộ
  const loadBillUploadedHistoryData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bill_uploaded_history')
        .select('*')
        .order('synced_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data || []).map((item) => {
        const sourceRow =
          item?.source_row && typeof item.source_row === 'object' && !Array.isArray(item.source_row)
            ? item.source_row
            : {};
        return {
          ...sourceRow,
          id: `history-${item.id}`,
          sync_batch_label: item.sync_batch_label || '',
          synced_at: item.synced_at || null,
          synced_by: item.performed_by || '',
        };
      });

      setBillData(rows);
    } catch (error) {
      console.error('Error loading bill uploaded history data:', error);
      alert('Lỗi khi tải dữ liệu Bill đã tải lên: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load data từ chitiet_cuoc — syncCutoff tương tự loadBillData
  const loadCuocData = async (syncCutoff) => {
    setLoading(true);
    try {
      const cuocCutoff = syncCutoff !== undefined && syncCutoff !== null ? syncCutoff : lastCuocSyncTime;
      const { data, error } = await supabase
        .from('chitiet_cuoc')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Lấy danh sách mã đơn hàng để tìm chi nhánh từ bảng orders
      const orderCodes = [...new Set((data || []).map((row) => normalizeCuocMaDon(row.ma_don_hang)).filter(Boolean))];
      
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
            ordersData.forEach((order) => {
              const k = normalizeCuocMaDon(order.order_code);
              if (k && order.team) {
                ordersMap.set(k, order.team);
              }
            });
          }
        }
      }
      
      let processedData = (data || []).map((row) => {
        const updatedRow = { ...row };
        const orderCode = normalizeCuocMaDon(row.ma_don_hang);
        if (orderCode) {
          const branch = ordersMap.get(orderCode);
          if (branch) {
            updatedRow.chi_nhanh = branch;
          }
        }
        return updatedRow;
      });

      if (cuocCutoff) {
        const last = new Date(cuocCutoff).getTime();
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

  // Load dữ liệu tab Cước đã tải lên từ bảng lịch sử đã đồng bộ
  const loadCuocUploadedHistoryData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cuoc_uploaded_history')
        .select('*')
        .order('synced_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data || []).map((item) => {
        const sourceRow =
          item?.source_row && typeof item.source_row === 'object' && !Array.isArray(item.source_row)
            ? item.source_row
            : {};
        return {
          ...sourceRow,
          id: `cuoc-history-${item.id}`,
          sync_batch_label: item.sync_batch_label || '',
          synced_at: item.synced_at || null,
          synced_by: item.performed_by || '',
        };
      });

      setCuocData(rows);
    } catch (error) {
      console.error('Error loading cuoc uploaded history data:', error);
      alert('Lỗi khi tải dữ liệu Cước đã tải lên: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load exchange rates from database (schema mới: ti_gia, gia_tri)
  useEffect(() => {
    const loadExchangeRates = async () => {
      try {
        const { data, error } = await supabase
          .from('exchange_rates')
          .select('ti_gia, gia_tri')
          .order('ti_gia');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Map từ schema mới (ti_gia, gia_tri) sang object exchangeRates
          const ratesMap = {
            AUD: null,
            CAD: null,
            USD: null,
            YEN: null, // YEN map từ JPY trong DB
          };
          
          data.forEach(rate => {
            const currency = (rate.ti_gia || '').trim().toUpperCase();
            const value = parseFloat(rate.gia_tri) || null;
            
            // Map các loại tiền tệ
            if (currency === 'USD') {
              ratesMap.USD = value;
            } else if (currency === 'AUD') {
              ratesMap.AUD = value;
            } else if (currency === 'CAD') {
              ratesMap.CAD = value;
            } else if (currency === 'JPY' || currency === 'YEN') {
              ratesMap.YEN = value; // YEN trong UI map từ JPY trong DB
            }
          });
          
          setExchangeRates(ratesMap);
          console.log('✅ [DoiSoatBillCuoc] Đã tải tỷ giá từ bảng exchange_rates:', ratesMap);
        } else {
          console.warn('Không có dữ liệu tỷ giá trong DB');
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
    if (activeTab === 'bill') {
      loadBillData();
    } else if (activeTab === 'bill_view') {
      loadBillUploadedHistoryData();
    } else if (activeTab === 'cuoc_view') {
      loadCuocUploadedHistoryData();
    } else {
      loadCuocData();
    }
  }, [activeTab, exchangeRates]);

  useEffect(() => {
    if (activeTab === 'bill' && lastBillSyncTime) {
      setActiveTab('bill_view');
    }
    if (activeTab === 'cuoc' && lastCuocSyncTime) {
      setActiveTab('cuoc_view');
    }
  }, [activeTab, lastBillSyncTime, lastCuocSyncTime]);

  // Tự động cập nhật tỷ giá cho tab bill (tab cước không còn cột đơn vị tiền / tỷ giá trên UI)
  useEffect(() => {
    if (Object.values(exchangeRates).every((rate) => rate === null)) return;

    const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
    if (!isBillTab) return;

    const data = billData;
    if (!data || data.length === 0) return;

    setPendingChanges((prevPending) => {
      const newPending = new Map(prevPending);
      let hasUpdates = false;

      data.forEach((row) => {
        const currency = row.don_vi_tien;
        const currentTyGia = row.ty_gia;

        if (currency && (!currentTyGia || currentTyGia === '' || currentTyGia === null)) {
          const currencyUpper = String(currency).toUpperCase();
          const rate = exchangeRates[currencyUpper];

          if (rate !== null && rate !== undefined) {
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
  }, [exchangeRates, activeTab, billData]);

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
    return isBillTab ? billDataWithTableDemLan : cuocDataWithTableDemLan;
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

        if (col.computed) continue;

        // Skip read-only fields
        if (
          colKey === 'id' ||
          colKey === 'created_at' ||
          colKey === 'updated_at' ||
          colKey === 'dem_lan_thanh_toan'
        ) {
          continue;
        }

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
        } else if (colKey.includes('tien') || colKey.includes('so_tien') || colKey.includes('ty_gia') || colKey.includes('cuoc') || colKey === 'stt') {
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
                  rowChanges.set('chi_nhanh', branch);
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
    if (activeTab === 'bill') {
      loadBillData();
    } else if (activeTab === 'bill_view') {
      loadBillUploadedHistoryData();
    } else if (activeTab === 'cuoc_view') {
      loadCuocUploadedHistoryData();
    } else {
      loadCuocData();
    }
  };

  const handleDeleteBillDetailRow = async (rowId) => {
    if (rowId == null) return;
    if (
      !window.confirm('Xóa dòng này khỏi chi_tiet_bill_tien? Thao tác không hoàn tác.')
    ) {
      return;
    }
    setDeletingBillDetailRowId(rowId);
    try {
      const { error } = await supabase.from('chi_tiet_bill_tien').delete().eq('id', rowId);
      if (error) throw error;
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(rowId);
        return next;
      });
      await loadBillData();
    } catch (err) {
      console.error('Error deleting bill row:', err);
      alert('Lỗi khi xóa: ' + err.message);
    } finally {
      setDeletingBillDetailRowId(null);
    }
  };

  const handleDeleteCuocDetailRow = async (rowId) => {
    if (rowId == null) return;
    if (!window.confirm('Xóa dòng này khỏi chitiet_cuoc? Thao tác không hoàn tác.')) return;
    setDeletingCuocDetailRowId(rowId);
    try {
      const { error } = await supabase.from('chitiet_cuoc').delete().eq('id', rowId);
      if (error) throw error;
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(rowId);
        return next;
      });
      await loadCuocData();
    } catch (err) {
      console.error('Error deleting cuoc row:', err);
      alert('Lỗi khi xóa: ' + err.message);
    } finally {
      setDeletingCuocDetailRowId(null);
    }
  };

  useEffect(() => {
    if (!billTrackingDetailKey) return;
    const n = billDataWithTableDemLan.filter(
      (r) => getBillDemLanDetailId(r, pendingChanges) === billTrackingDetailKey
    ).length;
    if (n === 0) setBillTrackingDetailKey(null);
  }, [billTrackingDetailKey, billDataWithTableDemLan, pendingChanges]);

  useEffect(() => {
    if (!cuocDupDetailKey) return;
    const n = cuocDataWithTableDemLan.filter(
      (r) => getEffectiveCuocMaDonHang(r, pendingChanges) === cuocDupDetailKey
    ).length;
    if (n === 0) setCuocDupDetailKey(null);
  }, [cuocDupDetailKey, cuocDataWithTableDemLan, pendingChanges]);

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

  const syncOrderKeyForScope = (code) => {
    if (code == null || code === '') return null;
    const s = String(code).trim();
    return s || null;
  };

  const makeSyncBatchId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });

  /** Chỉ ghi reconciled_vnd từ chi_tiet_bill_tien → orders */
  const handleSyncBill = async () => {
    const modeLabel = billSyncMode === 'tracking' ? 'Theo Mã Tracking (gom tiền theo tracking; Dropoff/trống dùng Mã đơn)' : 'Theo Mã đơn hàng (gom tiền theo Mã đơn trên dòng bill)';
    
    setSyncing(true);
    try {
      // 1. Lấy dữ liệu từ bảng tạm
      const { data: billData, error: billError } = await supabase
        .from('chi_tiet_bill_tien')
        .select('ma_don_hang, ma_tracking, tien_viet, accountant_confirm');

      if (billError) throw billError;

      if (!billData || billData.length === 0) {
        alert('Không có dữ liệu trong bảng tạm để đồng bộ.');
        setSyncing(false);
        return;
      }

      // 2. Gom tiền theo logic tracking/mã đơn
      const vndByTracking = new Map();
      const vndByOrderFromDropoff = new Map();
      for (const row of billData) {
        if (row.tien_viet === null || row.tien_viet === undefined || row.tien_viet === '') continue;
        const raw = String(row.tien_viet).replace(/,/g, '');
        const num = parseFloat(raw);
        if (isNaN(num)) continue;

        const tk = row.ma_tracking != null && row.ma_tracking !== '' ? String(row.ma_tracking).trim() : '';
        const mdh = row.ma_don_hang != null && row.ma_don_hang !== '' ? String(row.ma_don_hang).trim() : '';
        const accConfirmValue = row.accountant_confirm || null;

        if (billSyncMode === 'order_code' || !tk || isBillTrackingDropoffPlaceholder(tk)) {
          if (!mdh) continue;
          if (!vndByOrderFromDropoff.has(mdh)) {
            vndByOrderFromDropoff.set(mdh, { sum: 0, acc: accConfirmValue });
          }
          vndByOrderFromDropoff.get(mdh).sum += num;
        } else {
          if (!vndByTracking.has(tk)) {
            vndByTracking.set(tk, { sum: 0, acc: accConfirmValue });
          }
          vndByTracking.get(tk).sum += num;
        }
      }

      // 3. Map tracking sang order code
      const trackingToOrders = await fetchOrderCodesByTrackingMap(supabase, Array.from(vndByTracking.keys()));
      const finalUpdateMap = new Map();
      const trackingsKhongCoDon = [];

      for (const [tk, info] of vndByTracking) {
        const ocs = trackingToOrders.get(tk);
        if (!ocs || ocs.length === 0) {
          trackingsKhongCoDon.push(tk);
          continue;
        }
        const perOrder = info.sum / ocs.length;
        for (const ocRaw of ocs) {
          const oc = syncOrderKeyForScope(ocRaw);
          if (!oc) continue;
          if (!finalUpdateMap.has(oc)) {
            finalUpdateMap.set(oc, { total_vnd: 0, acc_confirm: info.acc });
          }
          finalUpdateMap.get(oc).total_vnd += perOrder;
        }
      }

      for (const [oc, info] of vndByOrderFromDropoff) {
        const k = syncOrderKeyForScope(oc);
        if (!k) continue;
        if (!finalUpdateMap.has(k)) {
          finalUpdateMap.set(k, { total_vnd: 0, acc_confirm: info.acc });
        }
        finalUpdateMap.get(k).total_vnd += info.sum;
      }

      const allOrderCodes = [...finalUpdateMap.keys()];
      if (allOrderCodes.length === 0) {
        alert('Không tìm thấy mã đơn nào hợp lệ từ dữ liệu đối soát.');
        setSyncing(false);
        return;
      }

      // 4. Kiểm tra sự tồn tại trên hệ thống (orders)
      const existingOrderCodes = await fetchExistingOrderCodesSet(supabase, allOrderCodes);
      const missingInOrders = allOrderCodes.filter((c) => !existingOrderCodes.has(c));
      const foundCount = existingOrderCodes.size;

      // 5. Chuẩn bị Modal xác nhận
      const errorList = [];
      if (trackingsKhongCoDon.length > 0) {
        errorList.push({ 
          label: 'Mã Tracking không tìm thấy đơn tương ứng trên hệ thống', 
          items: trackingsKhongCoDon 
        });
      }
      if (missingInOrders.length > 0) {
        errorList.push({ 
          label: 'Mã đơn hàng không tồn tại trong CSDL orders', 
          items: missingInOrders 
        });
      }

      setSyncConfirmData({
        title: 'Đồng bộ Bill',
        modeLabel: modeLabel,
        stats: {
          total: allOrderCodes.length, // Số mã đơn duy nhất
          found: foundCount,
          missing: missingInOrders.length,
          rawRows: billData.length // Số dòng gốc từ Excel/DB
        },
        errorList,
        onConfirm: async () => {
          setShowSyncConfirmModal(false);
          await executeSyncBillBatch(finalUpdateMap, allOrderCodes, existingOrderCodes, missingInOrders);
        }
      });
      setShowSyncConfirmModal(true);
      setSyncing(false);
    } catch (error) {
      console.error('Error syncing bill:', error);
      alert('Lỗi khi đồng bộ Bill: ' + error.message);
      setSyncing(false);
    }
  };

  /** Thực thi đồng bộ Bill theo lô */
  const executeSyncBillBatch = async (finalUpdateMap, allOrderCodes, existingOrderCodes, missingInOrders) => {
    setSyncing(true);
    try {
      let updateCount = 0;
      const syncBatchId = makeSyncBatchId();
      const syncTime = new Date().toISOString();
      const syncLogRows = [];
      
      const ordersToUpdate = allOrderCodes
        .filter(oc => existingOrderCodes.has(oc))
        .map(oc => {
          const info = finalUpdateMap.get(oc);
          return {
            order_code: oc,
            reconciled_vnd: info.total_vnd,
            accountant_confirm: info.acc_confirm
          };
        });

      setSyncProgress({ current: 0, total: ordersToUpdate.length, active: true });
      
      const chunks = chunkArray(ordersToUpdate, 50);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const { error: updateError } = await supabase.from('orders').upsert(chunk, { onConflict: 'order_code' });

        if (updateError) {
          console.error(`Error batch updating orders (chunk ${i}):`, updateError);
        } else {
          updateCount += chunk.length;
          chunk.forEach(item => {
            syncLogRows.push({
              sync_batch_id: syncBatchId,
              synced_at: syncTime,
              order_code: item.order_code,
              shipping_cost: null,
              total_vnd: null,
              revenue_actual: item.reconciled_vnd ?? null,
              order_count_actual: null,
            });
          });
        }
        setSyncProgress(prev => ({ ...prev, current: updateCount }));
      }

      if (syncLogRows.length > 0) {
        await supabase.from('bill_sync_results').insert(syncLogRows);
      }

      // Lưu snapshot toàn bộ dữ liệu Nhập bill vào bảng lịch sử theo từng đợt đồng bộ
      const performedBy = getVanDonSessionDisplayName();
      const syncBatchLabel = `Đợt ${new Date(syncTime).toLocaleString('vi-VN')}`;
      const { data: tempRows, error: tempRowsError } = await supabase
        .from('chi_tiet_bill_tien')
        .select('*');
      if (tempRowsError) throw tempRowsError;

      if ((tempRows || []).length > 0) {
        const historyRows = tempRows.map((row) => ({
          sync_batch_id: syncBatchId,
          sync_batch_label: syncBatchLabel,
          synced_at: syncTime,
          performed_by: performedBy,
          source_row: row,
        }));
        const historyChunks = chunkArray(historyRows, 200);
        for (const hChunk of historyChunks) {
          const { error: historyError } = await supabase.from('bill_uploaded_history').insert(hChunk);
          if (historyError) throw historyError;
        }
      }

      // Sau khi đồng bộ thành công, xóa dữ liệu khỏi bảng nhập bill tạm
      const { error: clearTempError } = await supabase.from('chi_tiet_bill_tien').delete().neq('id', 0);
      if (clearTempError) throw clearTempError;
      setBillData([]);

      alert(`Đã đồng bộ thành công ${updateCount} đơn.`);
      
      // Lưu lịch sử
      const historySaved = await saveSyncHistory({
        syncType: 'Bill',
        modeLabel: syncConfirmData?.modeLabel || (billSyncMode === 'order_code' ? 'Theo Mã đơn hàng' : 'Theo Mã Tracking'),
        totalInputRows: syncConfirmData.stats.rawRows,
        uniqueOrdersCount: allOrderCodes.length,
        successCount: updateCount,
        missingCount: missingInOrders.length
      });
      if (historySaved) {
        await fetchSyncHistory();
      }

      setLastBillSyncTime(syncTime);

      setActiveTab('bill_view');
      await loadBillUploadedHistoryData();
    } catch (error) {
      console.error('Error in executeSyncBillBatch:', error);
      alert('Lỗi khi thực thi đồng bộ Bill: ' + error.message);
    } finally {
      setSyncing(false);
      setSyncProgress({ current: 0, total: 0, active: false });
    }
  };


  /** Chỉ ghi shipping_cost + order_count_actual từ chitiet_cuoc → orders */
  const handleSyncCuoc = async () => {
    try {
      const { data: cuocData, error: cuocError } = await supabase
        .from('chitiet_cuoc')
        .select('ma_don_hang, tien_ship_vnd');

      if (cuocError) throw cuocError;

      const shippingCostMap = new Map();
      const orderCountMap = new Map();
      if (cuocData) {
        cuocData.forEach((row) => {
          const orderCode = syncOrderKeyForScope(row.ma_don_hang);
          if (orderCode) {
            orderCountMap.set(orderCode, (orderCountMap.get(orderCode) || 0) + 1);
            if (
              row.tien_ship_vnd !== null &&
              row.tien_ship_vnd !== undefined &&
              row.tien_ship_vnd !== ''
            ) {
              const currentTotal = shippingCostMap.get(orderCode) || 0;
              const raw = String(row.tien_ship_vnd).replace(/,/g, '');
              const num = parseFloat(raw);
              if (!isNaN(num)) {
                shippingCostMap.set(orderCode, currentTotal + num);
              }
            }
          }
        });
      }

      const allOrderCodes = new Set([
        ...Array.from(shippingCostMap.keys()),
        ...Array.from(orderCountMap.keys()),
      ]);
      
      const orderCodeList = [...allOrderCodes];
      const existingOrderCodes = await fetchExistingOrderCodesSet(supabase, orderCodeList);
      
      const missingOrderCodes = orderCodeList.filter(oc => !existingOrderCodes.has(oc));
      const validOrderCodes = orderCodeList.filter(oc => existingOrderCodes.has(oc));

      // HIỂN THỊ MODAL BÁO CÁO TRƯỚC KHI ĐỒNG BỘ
      setSyncConfirmData({
        title: 'Đồng bộ Cước',
        modeLabel: 'Cập nhật tiền ship & số lượng thực tế',
        stats: {
          total: orderCodeList.length,
          found: validOrderCodes.length,
          missing: missingOrderCodes.length
        },
        errorList: missingOrderCodes.length > 0 ? [{ label: 'Mã đơn hàng không tìm thấy trên hệ thống', items: missingOrderCodes }] : [],
        onConfirm: async () => {
          setShowSyncConfirmModal(false);
          await executeSyncCuocBatch(validOrderCodes, shippingCostMap, orderCountMap, missingOrderCodes, orderCodeList.length);
        }
      });
      setShowSyncConfirmModal(true);
    } catch (error) {
      console.error('Error syncing cuoc:', error);
      alert('Lỗi khi chuẩn bị đồng bộ Cước: ' + error.message);
    }
  };

  /** Thực thi đồng bộ Cước theo lô */
  const executeSyncCuocBatch = async (validOrderCodes, shippingCostMap, orderCountMap, missingOrderCodes, totalInputCount) => {
    setSyncing(true);
    try {
      let updateCount = 0;
      const syncBatchId = makeSyncBatchId();
      const syncTime = new Date().toISOString();
      const syncLogRows = [];

      const ordersToUpdate = validOrderCodes.map(oc => {
        const updateData = { order_code: oc };
        if (shippingCostMap.has(oc)) {
          updateData.shipping_cost = shippingCostMap.get(oc);
        }
        if (orderCountMap.has(oc)) {
          updateData.order_count_actual = orderCountMap.get(oc);
        }
        return updateData;
      });

      setSyncProgress({ current: 0, total: ordersToUpdate.length, active: true });

      const chunks = chunkArray(ordersToUpdate, 50);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        const { error: updateError } = await supabase
          .from('orders')
          .upsert(chunk, { onConflict: 'order_code' });

        if (updateError) {
          console.error(`Error batch updating orders (cuoc chunk ${i}):`, updateError);
        } else {
          updateCount += chunk.length;
          chunk.forEach(item => {
            syncLogRows.push({
              sync_batch_id: syncBatchId,
              synced_at: syncTime,
              order_code: item.order_code,
              shipping_cost: item.shipping_cost ?? null,
              total_vnd: null,
              revenue_actual: null,
              order_count_actual: item.order_count_actual ?? null,
            });
          });
        }
        setSyncProgress(prev => ({ ...prev, current: updateCount }));
      }

      if (syncLogRows.length > 0) {
        await supabase.from('bill_sync_results').insert(syncLogRows);
      }

      // Lưu snapshot toàn bộ dữ liệu Nhập cước vào bảng lịch sử theo từng đợt đồng bộ
      const performedBy = getVanDonSessionDisplayName();
      const syncBatchLabel = `Đợt ${new Date(syncTime).toLocaleString('vi-VN')}`;
      const { data: tempRows, error: tempRowsError } = await supabase
        .from('chitiet_cuoc')
        .select('*');
      if (tempRowsError) throw tempRowsError;

      if ((tempRows || []).length > 0) {
        const historyRows = tempRows.map((row) => ({
          sync_batch_id: syncBatchId,
          sync_batch_label: syncBatchLabel,
          synced_at: syncTime,
          performed_by: performedBy,
          source_row: row,
        }));
        const historyChunks = chunkArray(historyRows, 200);
        for (const hChunk of historyChunks) {
          const { error: historyError } = await supabase.from('cuoc_uploaded_history').insert(hChunk);
          if (historyError) throw historyError;
        }
      }

      // Sau khi đồng bộ thành công, xóa dữ liệu khỏi bảng nhập cước tạm
      const { error: clearTempError } = await supabase.from('chitiet_cuoc').delete().neq('id', 0);
      if (clearTempError) throw clearTempError;
      setCuocData([]);

      let alertMsg = `Đã đồng bộ Cước thành công ${updateCount} đơn.`;
      if (missingOrderCodes.length > 0) {
        alertMsg += `\n\n⚠️ Có ${missingOrderCodes.length} mã đơn KHÔNG TÌM THẤY trong hệ thống (đã bỏ qua):`;
        alertMsg += `\n${missingOrderCodes.slice(0, 50).join(', ')}${missingOrderCodes.length > 50 ? '...' : ''}`;
      }
      alert(alertMsg);

      // Lưu lịch sử
      const historySaved = await saveSyncHistory({
        syncType: 'Cước',
        modeLabel: 'Cập nhật tiền ship & số lượng thực tế',
        totalInputRows: totalInputCount,
        uniqueOrdersCount: validOrderCodes.length + missingOrderCodes.length,
        successCount: updateCount,
        missingCount: missingOrderCodes.length
      });
      if (historySaved) {
        await fetchSyncHistory();
      }

      setLastCuocSyncTime(syncTime);
      setActiveTab('cuoc_view');
      await loadCuocUploadedHistoryData();
    } catch (error) {
      console.error('Error syncing cuoc:', error);
      alert('Lỗi khi đồng bộ Cước: ' + error.message);
    } finally {
      setSyncing(false);
      setSyncProgress({ current: 0, total: 0, active: false });
    }
  };

  // --- Bulk Selection Handlers ---
  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = paginatedData().map(r => r.id).filter(Boolean);
      setSelectedRows(new Set(allIds));
    } else {
      setSelectedRows(new Set());
    }
  };

  const toggleRowSelect = (id) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkUpdate = () => {
    if (selectedRows.size === 0) return;
    if (!bulkAccountantConfirm && !window.confirm('Xóa trạng thái xác nhận của các hàng đã chọn?')) return;
    
    setPendingChanges(prev => {
      const next = new Map(prev);
      selectedRows.forEach(id => {
        if (!next.has(id)) next.set(id, new Map());
        next.get(id).set('accountant_confirm', bulkAccountantConfirm);
      });
      return next;
    });
    
    // Clear selection after update
    setSelectedRows(new Set());
    setBulkAccountantConfirm('');
    setShowBulkDropdown(false);
    alert(`Đã cập nhật trạng thái cho ${selectedRows.size} hàng.`);
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

  const getOrderByTrackingCode = async (tracking) => {
    const t = tracking != null ? String(tracking).trim() : '';
    if (!t) return null;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('order_code, shipping_unit, payment_type')
        .eq('tracking_code', t)
        .limit(1);

      if (error || !data?.length) return null;
      return data[0];
    } catch (err) {
      console.error('Error fetching order by tracking:', err);
      return null;
    }
  };

  const applyBillOrderDerivedFields = (rowId, orderRow) => {
    if (!orderRow) return;
    setPendingChanges((current) => {
      const updated = new Map(current);
      if (!updated.has(rowId)) {
        updated.set(rowId, new Map());
      }
      const ch = updated.get(rowId);
      if (orderRow.shipping_unit) {
        ch.set('ffm', orderRow.shipping_unit);
      }
      if (orderRow.payment_type) {
        const currencyMap = {
          USD: 'USD',
          AUD: 'AUD',
          CAD: 'CAD',
          JPY: 'YEN',
          YEN: 'YEN',
          Zelle: 'USD',
          COD: 'USD',
        };
        const currency =
          currencyMap[String(orderRow.payment_type).toUpperCase()] ||
          String(orderRow.payment_type).toUpperCase();
        if (CURRENCY_OPTIONS.includes(currency)) {
          ch.set('don_vi_tien', currency);
          const rate = exchangeRates[currency];
          if (rate !== null && rate !== undefined) {
            ch.set('ty_gia', rate);
          }
        }
      }
      return updated;
    });
  };

  // Handle cell change - lưu vào pending changes
  const handleCellChange = async (rowId, columnKey, newValue) => {
    if (activeTab === 'bill_view' || activeTab === 'cuoc_view') return;
    setPendingChanges((prev) => {
      const next = new Map(prev);
      if (!next.has(rowId)) {
        next.set(rowId, new Map());
      }
      const rowChanges = next.get(rowId);

      const currentData = getCurrentData();
      const currentRow = currentData.find((r) => r.id === rowId);
      const originalValue = currentRow?.[columnKey] ?? '';

      if (String(newValue) !== String(originalValue)) {
        rowChanges.set(columnKey, newValue);
      } else {
        rowChanges.delete(columnKey);
        if (rowChanges.size === 0) {
          next.delete(rowId);
        }
      }

      if (columnKey === 'don_vi_tien' && newValue) {
        const currency = String(newValue).toUpperCase();
        const rate = exchangeRates[currency];
        if (rate !== null && rate !== undefined) {
          rowChanges.set('ty_gia', rate);
        }
      }

      if (
        (activeTab === 'bill' || activeTab === 'bill_view') &&
        columnKey === 'ty_gia' &&
        (!newValue || newValue === '' || newValue === null)
      ) {
        const currency = currentRow?.don_vi_tien;
        if (currency) {
          const currencyUpper = String(currency).toUpperCase();
          const rate = exchangeRates[currencyUpper];
          if (rate !== null && rate !== undefined) {
            rowChanges.set('ty_gia', rate);
          }
        }
      }

      if ((activeTab === 'cuoc' || activeTab === 'cuoc_view') && columnKey === 'ma_don_hang' && newValue) {
        getChiNhanhFromOrder(newValue).then((branch) => {
          if (!branch) return;
          setPendingChanges((current) => {
            const updated = new Map(current);
            if (!updated.has(rowId)) {
              updated.set(rowId, new Map());
            }
            updated.get(rowId).set('chi_nhanh', branch);
            return updated;
          });
        });
      }

      if (columnKey !== 'ngay_update' && (activeTab === 'bill' || activeTab === 'bill_view')) {
        rowChanges.set('ngay_update', new Date().toISOString());
      }

      return next;
    });

    if ((activeTab === 'bill' || activeTab === 'bill_view') && columnKey === 'ma_don_hang' && newValue) {
      supabase
        .from('orders')
        .select('order_code, shipping_unit, payment_type')
        .eq('order_code', newValue)
        .maybeSingle()
        .then(({ data: ord }) => {
          if (ord) applyBillOrderDerivedFields(rowId, ord);
        });
    }

    if ((activeTab === 'bill' || activeTab === 'bill_view') && columnKey === 'ma_tracking' && newValue) {
      const t = String(newValue).trim();
      if (isBillTrackingDropoffPlaceholder(t)) {
        const data = getCurrentData();
        const r = data.find((x) => x.id === rowId);
        const pend = pendingChanges.get(rowId);
        const mdhRaw = pend?.has('ma_don_hang') ? pend.get('ma_don_hang') : r?.ma_don_hang;
        const mdh = mdhRaw != null && String(mdhRaw).trim() !== '' ? String(mdhRaw).trim() : '';
        if (mdh) {
          supabase
            .from('orders')
            .select('order_code, shipping_unit, payment_type')
            .eq('order_code', mdh)
            .maybeSingle()
            .then(({ data: ord }) => {
              if (ord) applyBillOrderDerivedFields(rowId, ord);
            });
        }
      } else {
        getOrderByTrackingCode(newValue).then((ord) => {
          if (ord) applyBillOrderDerivedFields(rowId, ord);
        });
      }
    }
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
          if (columnKey !== 'dem_lan_thanh_toan' && columnKey !== 'chi_nhanh') {
            updateObj[columnKey] = value;
          }
        });
        if (isBillTab) {
          updateObj.ngay_update = today;
        }
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
    const templateData = [];

    if (activeTab === 'bill' || activeTab === 'bill_view') {
      templateData.push({
        STT: 1,
        'Mã đơn hàng': 'Bona272f26d',
        'Mã Tracking': '',
        'Ngày đối soát': '02/04/2026',
        FFM: '',
        'Số tiền đối soát': 100.5,
        'Tỷ giá': 25000,
        'Tiền Việt': 2512500,
        'Đếm lần thanh toán': '',
      });
      templateData.push({
        STT: 2,
        'Mã đơn hàng': '',
        'Mã Tracking': 'TRACK002',
        'Ngày đối soát': '02/04/2026',
        FFM: '',
        'Số tiền đối soát': 50.75,
        'Tỷ giá': 18000,
        'Tiền Việt': 913500,
        'Đếm lần thanh toán': '',
      });
      templateData.push({
        STT: 3,
        'Mã đơn hàng': 'DG6da921bf',
        'Mã Tracking': 'TRACK003',
        'Ngày đối soát': '09/04/2026',
        FFM: '',
        'Số tiền đối soát': 75.25,
        'Tỷ giá': 19000,
        'Tiền Việt': 1429750,
        'Đếm lần thanh toán': '',
      });
    } else {
      const today = new Date().toISOString().split('T')[0];
      const wb = XLSX.utils.book_new();
      const cuocAoa = [
        ['Mã đơn hàng', 'Ngày đối soát cước', 'Tiền ship (Vnđ)'],
        ['Bona272f26d', today, 637500],
        ['Fit31b31704', today, 283500],
        ['DG6da921bf', today, 570000],
      ];
      const ws = XLSX.utils.aoa_to_sheet(cuocAoa);
      XLSX.utils.book_append_sheet(wb, ws, 'Cuoc');
      XLSX.writeFile(wb, `Mau_Cuoc_${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(wb, ws, (activeTab === 'bill' || activeTab === 'bill_view') ? 'Bill' : 'Cuoc');
    
    const fileName = (activeTab === 'bill' || activeTab === 'bill_view') 
      ? `Mau_Bill_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `Mau_Cuoc_${new Date().toISOString().slice(0, 10)}.xlsx`;
    
    XLSX.writeFile(wb, fileName);
  };

  // Xử lý khi người dùng xác nhận từ modal kết quả import
  const handleConfirmImportResult = async (saveDuplicates) => {
    if (!importResultData) return;
    
    const { newRows, duplicateRows, tableName } = importResultData;
    const rowsToInsert = saveDuplicates ? [...newRows, ...duplicateRows] : newRows;
    
    if (rowsToInsert.length === 0) {
      alert('Không có dòng nào để lưu.');
      setImportResultData(null);
      return;
    }
    
    setUploading(true);
    try {
      const { data, error } = await supabase
        .from(tableName)
        .insert(rowsToInsert)
        .select();
      
      if (error) {
        if (error.code === '23505') {
          alert(`Một số dữ liệu đã tồn tại trong hệ thống.`);
        } else {
          throw error;
        }
      } else {
        const successCount = data?.length || 0;
        const dupCount = saveDuplicates ? duplicateRows.length : 0;
        alert(`Đã nhập thành công ${successCount} bản ghi!${dupCount > 0 ? ` (bao gồm ${dupCount} dòng trùng)` : ''}`);
        
        // Reload data
        const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
        if (isBillTab) {
          await loadBillData();
        } else {
          await loadCuocData();
        }
      }
    } catch (error) {
      console.error('Error saving import result:', error);
      alert('Lỗi khi lưu dữ liệu: ' + error.message);
    } finally {
      setImportResultData(null);
      setUploading(false);
    }
  };

  // Kiểm tra dòng trùng hoàn toàn trong bảng hiện tại
  const handleCheckDuplicates = async () => {
    if (!window.confirm('Kiểm tra dòng trùng hoàn toàn trong bảng hiện tại? Quá trình này có thể mất vài giây.')) {
      return;
    }
    
    setCheckingDuplicates(true);
    try {
      const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
      const tableName = isBillTab ? 'chi_tiet_bill_tien' : 'chitiet_cuoc';
      
      // Tạo key duy nhất cho mỗi dòng để so sánh
      const createRowKey = (r) => {
        const maDon = r.ma_don_hang || '';
        const maTracking = r.ma_tracking || '';
        const tienViet = r.tien_viet != null ? String(r.tien_viet) : '';
        const tienUsd = r.tien_usd != null ? String(r.tien_usd) : '';
        const ngayDoiSoat = r.ngay_doi_soat || r.ngay_doi_soat_cuoc || '';
        return `${maDon}|${maTracking}|${tienViet}|${tienUsd}|${ngayDoiSoat}`;
      };
      
      // Lấy tất cả dữ liệu từ database
      const { data: allData, error } = await supabase
        .from(tableName)
        .select('*')
        .order('id', { ascending: true });
      
      if (error) throw error;
      
      // Tìm các dòng trùng
      const keyToRows = new Map();
      (allData || []).forEach((row) => {
        const key = createRowKey(row);
        if (!keyToRows.has(key)) {
          keyToRows.set(key, []);
        }
        keyToRows.get(key).push(row);
      });
      
      // Lọc ra các nhóm có từ 2 dòng trở lên (trùng)
      const duplicateGroups = [];
      keyToRows.forEach((rows, key) => {
        if (rows.length > 1) {
          duplicateGroups.push({ key, rows, count: rows.length });
        }
      });
      
      if (duplicateGroups.length === 0) {
        alert('Không tìm thấy dòng trùng hoàn toàn trong bảng!');
        return;
      }
      
      // Tính tổng số dòng trùng
      const totalDuplicateRows = duplicateGroups.reduce((sum, g) => sum + g.count, 0);
      
      setImportResultData({
        duplicateRows: duplicateGroups.flatMap(g => g.rows),
        newRows: [],
        tableName,
        totalImported: allData.length,
        duplicateCount: totalDuplicateRows,
        newCount: allData.length - totalDuplicateRows,
        duplicateGroups, // Thêm thông tin nhóm để hiển thị
        isCheckMode: true // Đánh dấu là chế độ kiểm tra (không phải import)
      });
      
    } catch (error) {
      console.error('Error checking duplicates:', error);
      alert('Lỗi khi kiểm tra trùng: ' + error.message);
    } finally {
      setCheckingDuplicates(false);
    }
  };

  // Upload Excel và import dữ liệu
  const handleUploadExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (activeTab === 'bill_view') {
      alert('Tab "Bill đã tải lên" là lịch sử. Vui lòng chuyển sang tab "Nhập bill" để tải file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (activeTab === 'cuoc_view') {
      alert('Tab "Cước đã tải lên" là lịch sử. Vui lòng chuyển sang tab "Nhập Cước" để tải file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn nhập dữ liệu từ file Excel này? Dữ liệu sẽ được thêm vào bảng ${activeTab === 'bill' ? 'chi_tiet_bill_tien' : 'chitiet_cuoc'}.`)) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const isBillImport = activeTab === 'bill';
      const jsonData = isBillImport ? XLSX.utils.sheet_to_json(ws) : sheetToJsonCuocImport(ws);

      if (jsonData.length === 0) {
        alert('File Excel không có dữ liệu!');
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const columns = getCurrentColumns();
      const tableName = activeTab === 'bill' ? 'chi_tiet_bill_tien' : 'chitiet_cuoc';
      
      const getColumnKey = (excelLabel) => {
        const normalizeLabel = (s) =>
          String(s ?? '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, ''); // bỏ dấu tiếng Việt

        const exNorm = normalizeLabel(excelLabel);

        // Alias mềm cho các cột có thể có trong file thực tế nhưng không hiển thị trên UI.
        const importColumnAliases = {
          'don vi tien': 'don_vi_tien',
          'đon vi tien': 'don_vi_tien',
          'donvitien': 'don_vi_tien',
          'currency': 'don_vi_tien',
          'ngay update': 'ngay_update',
          'ngay cap nhat': 'ngay_update',
          'updated at': 'ngay_update',
          'update date': 'ngay_update',
        };
        if (importColumnAliases[exNorm]) return importColumnAliases[exNorm];

        const col = columns.find((c) => !c.computed && normalizeLabel(c.label) === exNorm);
        if (col) return col.key;
        return null;
      };

      const normalizeCurrencyForImport = (value) => {
        if (value == null || value === '') return null;
        const normalized = String(value)
          .trim()
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Z]/g, '');

        if (!normalized) return null;
        if (normalized === 'CAD' || normalized === 'CANADA') return 'CAD';
        if (normalized === 'USD') return 'USD';
        if (normalized === 'AUD' || normalized === 'AUSTRALIA') return 'AUD';
        if (normalized === 'JPY' || normalized === 'YEN' || normalized === 'JAPAN') return 'YEN';
        return normalized;
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
            if (
              dbKey === 'id' ||
              dbKey === 'created_at' ||
              dbKey === 'updated_at' ||
              dbKey === 'dem_lan_thanh_toan'
            ) {
              return;
            }

            // Xử lý giá trị theo loại cột
            if (dbKey.includes('ngay') || dbKey.includes('date')) {
              const parsedDate = parseExcelDateToISO(value);
              if (parsedDate) {
                record[dbKey] = parsedDate;
                hasData = true;
              }
            } else if (dbKey === 'don_vi_tien') {
              const normalizedCurrency = normalizeCurrencyForImport(value);
              if (normalizedCurrency) {
                record[dbKey] = normalizedCurrency;
                hasData = true;
              }
            } else if (dbKey.includes('tien') || dbKey.includes('so_tien') || dbKey.includes('ty_gia') || dbKey.includes('cuoc') || dbKey === 'stt') {
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

        // Bill: hỗ trợ file thực tế có cột ngày thêm tay nhưng để trống tiêu đề
        // (XLSX thường sinh key kiểu __EMPTY / __EMPTY_1).
        if (tableName === 'chi_tiet_bill_tien' && !record.ngay_doi_soat) {
          for (const [excelKey, rawValue] of Object.entries(row)) {
            const key = String(excelKey ?? '').trim().toLowerCase();
            if (key === '' || key.startsWith('__empty')) {
              const parsedDate = parseExcelDateToISO(rawValue);
              if (parsedDate) {
                record.ngay_doi_soat = parsedDate;
                hasData = true;
                break;
              }
            }
          }
        }

        delete record.dem_lan_thanh_toan;

        if (tableName === 'chitiet_cuoc') {
          delete record.chi_nhanh;
        }

        if (tableName === 'chi_tiet_bill_tien') {
          if (!record.ngay_doi_soat) {
            record.ngay_doi_soat = today;
          }
        }

        if (tableName === 'chitiet_cuoc') {
          if (!record.ngay_doi_soat_cuoc) {
            record.ngay_doi_soat_cuoc = today;
          }
        }

        const mdh = record.ma_don_hang != null && String(record.ma_don_hang).trim() !== '';
        if (tableName === 'chitiet_cuoc' && !mdh) {
          continue;
        }

        if (hasData) {
          recordsToInsert.push(record);
        }
      }

      if (recordsToInsert.length === 0) {
        alert(
          activeTab === 'bill' || activeTab === 'bill_view'
            ? 'Không có dòng hợp lệ: không map được cột nào từ Excel (kiểm tra tên cột theo mẫu Bill; Ngày đối soát / Đơn vị tiền không cần trong file — hệ thống tự gán / lấy từ đơn hàng).'
            : activeTab === 'cuoc' || activeTab === 'cuoc_view'
              ? 'Không có dòng hợp lệ: mỗi dòng cước cần có Mã đơn hàng (các cột Tiền cước / Đơn vị / Tỷ giá / Thị trường / Đếm lần thanh toán / Chi nhánh không lấy từ Excel).'
              : 'Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng kiểm tra lại định dạng file.'
        );
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      let rowsToInsert = recordsToInsert;
      let billImportWithoutOrderCode = 0;

      if (activeTab === 'bill' || activeTab === 'bill_view') {
        recordsToInsert.forEach((r) => {
          const d = r.ma_don_hang != null ? String(r.ma_don_hang).trim() : '';
          const t = r.ma_tracking != null ? String(r.ma_tracking).trim() : '';
          r.ma_don_hang = d || null;
          r.ma_tracking = t || null;
        });

        const trackingNeed = [
          ...new Set(
            recordsToInsert
              .map((r) => (r.ma_tracking != null ? String(r.ma_tracking).trim() : ''))
              .filter((tk) => tk && !isBillTrackingDropoffPlaceholder(tk))
          ),
        ];
        const trackingToOrdersImport = await fetchOrderCodesByTrackingMap(supabase, trackingNeed);

        for (const r of recordsToInsert) {
          const tk = r.ma_tracking != null ? String(r.ma_tracking).trim() : '';
          const mdhRaw = r.ma_don_hang != null ? String(r.ma_don_hang).trim() : '';

          if (!tk || isBillTrackingDropoffPlaceholder(tk)) {
            r.ma_don_hang = mdhRaw || null;
            if (!mdhRaw) billImportWithoutOrderCode++;
            continue;
          }

          const ocs = trackingToOrdersImport.get(tk);
          if (ocs && ocs.length > 0) {
            r.ma_don_hang = ocs[0];
          } else {
            r.ma_don_hang = null;
            billImportWithoutOrderCode++;
          }
        }
        rowsToInsert = recordsToInsert;

        const trackingCounts = new Map();
        rowsToInsert.forEach((r) => {
          const tk = r.ma_tracking != null ? String(r.ma_tracking).trim() : '';
          if (!tk || isBillTrackingDropoffPlaceholder(tk)) return;
          trackingCounts.set(tk, (trackingCounts.get(tk) || 0) + 1);
        });
        const duplicateTrackings = [...trackingCounts.entries()]
          .filter(([, cnt]) => cnt > 1)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        if (duplicateTrackings.length > 0) {
          const preview = duplicateTrackings
            .slice(0, 15)
            .map(([tk, cnt]) => `- ${tk}: trùng ${cnt} lần`)
            .join('\n');
          const extra =
            duplicateTrackings.length > 15
              ? `\n... và ${duplicateTrackings.length - 15} mã Tracking khác.`
              : '';
          const shouldContinue = window.confirm(
            `⚠️ Phát hiện trùng Mã Tracking trong file import (${duplicateTrackings.length} mã).\n` +
              `${preview}${extra}\n\nBạn có muốn tiếp tục nhập dữ liệu không?`
          );
          if (!shouldContinue) {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }
        }
      } else if (tableName === 'chitiet_cuoc') {
        recordsToInsert.forEach((r) => {
          const d = r.ma_don_hang != null ? String(r.ma_don_hang).trim() : '';
          r.ma_don_hang = d || null;
        });
      }

      // Insert vào database với batch processing và progress tracking
      const BATCH_SIZE = 500; // Supabase giới hạn ~1000 rows/request, dùng 500 để an toàn
      const MAX_RETRIES = 3;
      const totalRows = rowsToInsert.length;
      const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
      
      let successCount = 0;
      let failedBatches = [];
      
      // Hiển thị progress
      setImportProgress({ current: 0, total: totalBatches, status: 'processing', successRows: 0, totalRows });
      
      for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, totalRows);
        const batch = rowsToInsert.slice(start, end);
        
        let retries = 0;
        let batchSuccess = false;
        
        while (retries < MAX_RETRIES && !batchSuccess) {
          try {
            const { data, error } = await supabase
              .from(tableName)
              .insert(batch)
              .select();
            
            if (error) {
              if (error.code === '23505') {
                // Duplicate key - vẫn coi là thành công
                console.warn(`Batch ${i + 1}: Một số dữ liệu đã tồn tại`);
                batchSuccess = true;
                successCount += batch.length;
              } else {
                throw error;
              }
            } else {
              batchSuccess = true;
              successCount += data?.length || 0;
            }
            
            // Cập nhật progress
            setImportProgress({
              current: i + 1,
              total: totalBatches,
              status: 'processing',
              successRows: successCount,
              totalRows
            });
            
          } catch (error) {
            retries++;
            console.error(`Batch ${i + 1} failed (attempt ${retries}/${MAX_RETRIES}):`, error);
            
            if (retries >= MAX_RETRIES) {
              failedBatches.push({ batchIndex: i, start, end, error: error.message });
              // Cập nhật progress với lỗi
              setImportProgress({
                current: i + 1,
                total: totalBatches,
                status: 'error',
                successRows: successCount,
                totalRows,
                failedBatches
              });
            } else {
              // Đợi trước khi retry
              await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            }
          }
        }
        
        // Đợi một chút giữa các batch để tránh quá tải
        if (i < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Hoàn thành
      setImportProgress({
        current: totalBatches,
        total: totalBatches,
        status: failedBatches.length > 0 ? 'partial' : 'success',
        successRows: successCount,
        totalRows,
        failedBatches
      });
      
      // Hiển thị kết quả
      const billInfoNote =
        activeTab === 'bill' || activeTab === 'bill_view'
          ? billImportWithoutOrderCode > 0
            ? ` (${billImportWithoutOrderCode} dòng chưa có mã đơn trên hệ thống — vẫn đã lưu; có thể gán sau hoặc khi tracking khớp đơn.)`
            : ''
          : '';
      
      if (failedBatches.length > 0) {
        const failedRows = failedBatches.reduce((sum, b) => sum + (b.end - b.start), 0);
        alert(
          `Đã nhập ${successCount}/${totalRows} bản ghi.\n` +
          `${failedBatches.length} batch thất bại (${failedRows} dòng).\n` +
          `Vui lòng kiểm tra console để xem chi tiết lỗi.${billInfoNote}`
        );
        console.error('Failed batches:', failedBatches);
      } else {
        alert(`Đã nhập thành công ${successCount} bản ghi từ file Excel!${billInfoNote}`);
      }
      
      // Reload data
      const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
      if (isBillTab) {
        await loadBillData();
      } else {
        await loadCuocData();
      }
      
      // Đợi 3 giây trước khi ẩn progress (để người dùng thấy kết quả)
      await new Promise(resolve => setTimeout(resolve, 3000));
      setImportProgress(null);
      
    } catch (error) {
      console.error('Error uploading Excel:', error);
      alert('Lỗi khi nhập file Excel: ' + error.message);
      setImportProgress(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Thêm nhiều mã đơn hàng
  const handleAddOrderCodes = async () => {
    const codes = [...new Set(parseOrderCodes(orderCodesInput).map((c) => c.trim()).filter(Boolean))];

    if (codes.length === 0) {
      alert('Vui lòng nhập ít nhất một mã (mã đơn hàng hoặc mã tracking — tab bill)');
      return;
    }

    if (codes.length > 1000) {
      alert(`Số lượng mã vượt quá giới hạn 1000. Bạn đã nhập ${codes.length} mã.`);
      return;
    }

    setAdding(true);
    try {
      const isBillTab = activeTab === 'bill' || activeTab === 'bill_view';
      const tableName = isBillTab ? 'chi_tiet_bill_tien' : 'chitiet_cuoc';

      let recordsToInsert;
      if (isBillTab) {
        const trackingToOrder = new Map();
        if (codes.length > 0) {
          const bs = 1000;
          for (let i = 0; i < codes.length; i += bs) {
            const batch = codes.slice(i, i + bs);
            const { data: hitByTr, error: e2 } = await supabase
              .from('orders')
              .select('order_code, tracking_code')
              .in('tracking_code', batch);
            if (e2) throw e2;
            (hitByTr || []).forEach((o) => {
              const tc = o.tracking_code != null ? String(o.tracking_code).trim() : '';
              if (tc && !trackingToOrder.has(tc)) {
                trackingToOrder.set(tc, o.order_code);
              }
            });
          }
        }

        const { data: hitByCode, error: e1 } = await supabase.from('orders').select('order_code').in('order_code', codes);
        if (e1) throw e1;
        const asOrder = new Set((hitByCode || []).map((o) => o.order_code));

        recordsToInsert = codes.map((code) => {
          const c = String(code).trim();
          if (isBillTrackingDropoffPlaceholder(c)) {
            return { ma_tracking: c || null, ma_don_hang: null };
          }
          if (trackingToOrder.has(c)) {
            const oc = trackingToOrder.get(c);
            return { ma_don_hang: oc, ma_tracking: c };
          }
          if (asOrder.has(c)) {
            return { ma_don_hang: c };
          }
          return { ma_tracking: c, ma_don_hang: null };
        });
      } else {
        recordsToInsert = codes.map((code) => ({ ma_don_hang: code }));
      }

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
              onClick={() => {
                fetchSyncHistory();
                setShowHistoryModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition shadow-sm"
            >
              <History className="w-4 h-4 text-indigo-500" />
              Lịch sử
            </button>
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
              onClick={handleCheckDuplicates}
              disabled={checkingDuplicates || loading}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              title="Kiểm tra các dòng trùng hoàn toàn trong bảng hiện tại"
            >
              {checkingDuplicates ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Đang kiểm tra...
                </>
              ) : (
                <>
                  <span>🔍</span>
                  Kiểm tra trùng
                </>
              )}
            </button>
            <div className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/80 px-2 py-1">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-blue-900 px-1 uppercase tracking-wider">Đồng bộ Bill</span>
                <select
                  value={billSyncMode}
                  onChange={(e) => setBillSyncMode(e.target.value)}
                  className="bg-transparent border-none text-[10px] text-blue-700 outline-none cursor-pointer font-medium focus:ring-0 py-0"
                >
                  <option value="tracking">Theo Mã Tracking</option>
                  <option value="order_code">Theo Mã đơn hàng</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleSyncBill}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-sm transition disabled:opacity-50"
                  title={billSyncMode === 'tracking' ? 'Đồng bộ dựa trên Mã Tracking (khớp tracking_code)' : 'Đồng bộ dựa trên Mã đơn hàng (khớp order_code)'}
                >
                  {syncing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="w-3.5 h-3.5" />
                  )}
                  Đồng bộ
                </button>
                <button
                  type="button"
                  onClick={handleClearAllBillTemp}
                  disabled={loading || syncing}
                  className="px-2.5 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-md text-xs font-medium transition disabled:opacity-50"
                >
                  Xóa
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50/80 px-2 py-1">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-teal-900 px-1 uppercase tracking-wider">Đồng bộ Cước</span>
                <span className="text-[10px] text-teal-700 px-1 font-medium">Theo Mã đơn hàng</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleSyncCuoc}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {syncing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="w-3.5 h-3.5" />
                  )}
                  Đồng bộ
                </button>
                <button
                  type="button"
                  onClick={handleClearAllCuocTemp}
                  disabled={loading || syncing}
                  className="px-2.5 py-1.5 bg-white border border-red-100 text-red-600 hover:bg-red-50 rounded-md text-xs font-medium transition disabled:opacity-50"
                >
                  Xóa
                </button>
              </div>
            </div>

            {false && ( // Ẩn nút thêm mã đơn hàng
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
          {/* Tab nhập — ẩn riêng sau khi đồng bộ từng loại */}
          {!lastBillSyncTime && (
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
          )}
          {!lastCuocSyncTime && (
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
            <div className="flex-1">
              <p className="text-sm text-gray-500">
                {activeTab === 'bill'
                  ? 'Dữ liệu từ bảng chi_tiet_bill_tien'
                  : activeTab === 'bill_view'
                    ? 'Dữ liệu lịch sử từ bảng bill_uploaded_history'
                    : activeTab === 'cuoc_view'
                      ? 'Dữ liệu lịch sử từ bảng cuoc_uploaded_history'
                      : 'Dữ liệu từ bảng chitiet_cuoc'}
              </p>
              <p className="text-lg font-semibold text-gray-800 mt-1">
                Tổng số bản ghi: {getCurrentData().length}
              </p>
            </div>

            {/* Bulk actions - Only for Bill tabs */}
            {(activeTab === 'bill' || activeTab === 'bill_view') && selectedRows.size > 0 && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl animate-in fade-in slide-in-from-top-2">
                <span className="text-sm font-semibold text-blue-700">Đã chọn: {selectedRows.size}</span>
                <div className="h-6 w-px bg-blue-200 mx-1"></div>
                
                <div className="relative group">
                   <div className="flex items-center bg-white border border-blue-300 rounded-lg shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                      <input
                        type="text"
                        placeholder="Tìm trạng thái..."
                        value={bulkAccountantConfirm}
                        onChange={(e) => {
                          setBulkAccountantConfirm(e.target.value);
                          setShowBulkDropdown(true);
                        }}
                        onFocus={() => setShowBulkDropdown(true)}
                        className="px-3 py-1.5 text-xs outline-none w-48 font-medium"
                      />
                      <button 
                        onClick={() => setShowBulkDropdown(!showBulkDropdown)}
                        className="px-2 border-l border-blue-100 hover:bg-blue-50"
                      >
                        <RotateCw className={`w-3 h-3 transition-transform ${showBulkDropdown ? 'rotate-180' : ''}`} />
                      </button>
                   </div>

                   {showBulkDropdown && (
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={() => setShowBulkDropdown(false)}></div>
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[70] max-h-48 overflow-y-auto">
                        {accountantOptions
                          .filter(opt => (opt || 'Trống').toLowerCase().includes(bulkAccountantConfirm.toLowerCase()))
                          .map((opt, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                setBulkAccountantConfirm(opt);
                                setShowBulkDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-none"
                            >
                              {opt || <span className="text-gray-400 italic">(Trống)</span>}
                            </button>
                          ))
                        }
                      </div>
                    </>
                   )}
                </div>

                <button
                  onClick={handleBulkUpdate}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md transition-all active:scale-95"
                >
                  Cập nhật hàng loạt
                </button>
                <button
                  onClick={() => setSelectedRows(new Set())}
                  className="text-gray-500 hover:text-red-500 p-1 transition-colors"
                  title="Bỏ chọn tất cả"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          {(activeTab === 'bill' || activeTab === 'bill_view') && (
            <p className="text-sm text-gray-600 mt-2 max-w-4xl">
              Bill: <strong>ưu tiên Mã Tracking</strong> để gán đơn và đồng bộ Tiền Việt; với{' '}
              <strong>Drop off / DROPP OFF / trống tracking</strong> thì gán đơn, đồng bộ và đếm lần thanh toán theo{' '}
              <strong>Mã đơn hàng</strong> trên dòng.
              Đếm lần thanh toán: số lần cùng Mã Tracking; bấm số để xem chi tiết.
            </p>
          )}
          {(activeTab === 'cuoc' || activeTab === 'cuoc_view') && (
            <p className="text-sm text-gray-600 mt-2 max-w-4xl">
              Cước: chỉ nhập Mã đơn hàng, Ngày đối soát cước, Tiền ship (Vnđ). Chi nhánh: lấy từ đơn hàng.
            </p>
          )}
        </div>


        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  {(activeTab === 'bill' || activeTab === 'bill_view') && (
                    <th className="px-4 py-3 border-b border-gray-200">
                      <input
                        type="checkbox"
                        checked={selectedRows.size > 0 && selectedRows.size === paginatedData().length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                  )}
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
                    
                    const isCuocDup =
                      (activeTab === 'cuoc' || activeTab === 'cuoc_view') &&
                      row.dem_lan_thanh_toan != null &&
                      Number(row.dem_lan_thanh_toan) > 1;

                    return (
                      <tr
                        key={rowId || rowIdx}
                        className={`hover:bg-gray-50 ${
                          hasPendingChanges ? 'bg-yellow-50' : isCuocDup ? 'bg-red-50' : ''
                        } ${selectedRows.has(rowId) ? 'bg-blue-50/50' : ''}`}
                      >
                        {(activeTab === 'bill' || activeTab === 'bill_view') && (
                          <td className="px-4 py-3 border-b border-gray-100 text-center">
                            <input
                              type="checkbox"
                              checked={selectedRows.has(rowId)}
                              onChange={() => toggleRowSelect(rowId)}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                        )}

                        {columns.map((col, colIdx) => {
                          const isViewMode = activeTab === 'bill_view' || activeTab === 'cuoc_view';
                          const isReadOnly =
                            isViewMode ||
                            col.computed ||
                            col.key === 'id' ||
                            col.key === 'created_at' ||
                            col.key === 'updated_at' ||
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
                          if (
                            (activeTab === 'bill' || activeTab === 'bill_view') &&
                            col.key === 'ty_gia' &&
                            !rowPendingChanges.has('ty_gia')
                          ) {
                            const currencyKey = 'don_vi_tien';
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
                              } else if (col.key === 'ngay_doi_soat_cuoc') {
                                formattedValue =
                                  displayValue === '' || displayValue == null ? '' : String(displayValue);
                              } else {
                                formattedValue = formatDate(displayValue);
                              }
                            } else if (
                              col.key.includes('tien') ||
                              col.key.includes('so_tien') ||
                              col.key.includes('ty_gia') ||
                              col.key.includes('cuoc') ||
                              col.key === 'dem_lan_thanh_toan'
                            ) {
                              formattedValue =
                                col.key === 'dem_lan_thanh_toan'
                                  ? displayValue !== '' && displayValue != null
                                    ? String(displayValue)
                                    : ''
                                  : formatNumber(displayValue);
                            }
                          }

                          const hasChange = rowPendingChanges.has(col.key);
                          const isDateField =
                            (col.key.includes('ngay') || col.key.includes('date')) &&
                            col.key !== 'ngay_doi_soat_cuoc';
                          const isNumberField =
                            !col.key.includes('ngay') &&
                            (col.key.includes('tien') ||
                              col.key.includes('so_tien') ||
                              col.key.includes('ty_gia') ||
                              col.key.includes('cuoc') ||
                              col.key === 'stt');
                          const isCurrencyField = col.key === 'don_vi_tien';

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
                                (activeTab === 'bill' || activeTab === 'bill_view') &&
                                col.key === 'dem_lan_thanh_toan' &&
                                (() => {
                                  const detailId = getBillDemLanDetailId(row, pendingChanges);
                                  const cnt =
                                    displayValue !== '' && displayValue != null
                                      ? Number(displayValue)
                                      : NaN;
                                  return detailId && !Number.isNaN(cnt) && cnt >= 1;
                                })() ? (
                                  <button
                                    type="button"
                                    className="font-semibold text-blue-700 underline decoration-blue-400 underline-offset-2 hover:text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-300 rounded px-0.5"
                                    title="Xem các dòng cùng nhóm (tracking hoặc mã đơn nếu Dropoff)"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setBillTrackingDetailKey(getBillDemLanDetailId(row, pendingChanges));
                                    }}
                                  >
                                    {formattedValue}
                                  </button>
                                ) : (activeTab === 'cuoc' || activeTab === 'cuoc_view') &&
                                col.key === 'dem_lan_thanh_toan' &&
                                (() => {
                                  const dupKey = getEffectiveCuocMaDonHang(row, pendingChanges);
                                  const cnt =
                                    displayValue !== '' && displayValue != null
                                      ? Number(displayValue)
                                      : NaN;
                                  return dupKey && !Number.isNaN(cnt) && cnt >= 1;
                                })() ? (
                                  <button
                                    type="button"
                                    className="font-semibold text-blue-700 underline decoration-blue-400 underline-offset-2 hover:text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-300 rounded px-0.5"
                                    title="Xem các dòng cùng mã đơn trong bảng"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCuocDupDetailKey(getEffectiveCuocMaDonHang(row, pendingChanges));
                                    }}
                                  >
                                    {formattedValue}
                                  </button>
                                ) : (
                                  <span
                                    className={
                                      col.key === 'dem_lan_thanh_toan' &&
                                      (activeTab === 'cuoc' || activeTab === 'cuoc_view') &&
                                      displayValue !== '' &&
                                      displayValue != null &&
                                      Number(displayValue) > 1
                                        ? 'text-red-600 font-semibold'
                                        : 'text-gray-500'
                                    }
                                  >
                                    {formattedValue || '-'}
                                  </span>
                                )
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
                                  value={displayValue != null ? String(displayValue) : ''}
                                  onChange={(e) => {
                                    handleCellChange(rowId, col.key, e.target.value);
                                  }}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                  placeholder={
                                    col.key === 'ngay_doi_soat_cuoc'
                                      ? 'vd: 2026-03-28 hoặc 28/03/2026'
                                      : ''
                                  }
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
                {activeTab === 'bill' || activeTab === 'bill_view'
                  ? 'Thêm mã (đơn hàng hoặc tracking) — Nhập bill'
                  : 'Thêm mã đơn hàng — Nhập Cước'}
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
                  {activeTab === 'bill' || activeTab === 'bill_view'
                    ? 'Dán danh sách mã đơn hàng hoặc mã tracking (mỗi dòng một mã, tối đa 1000):'
                    : 'Dán danh sách mã đơn hàng (mỗi mã một dòng, tối đa 1000 mã):'}
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
                  {activeTab === 'bill' || activeTab === 'bill_view' ? (
                    <>
                      <li>Tab bill: ưu tiên tracking; mã đơn khi tracking trống hoặc Dropoff</li>
                      <li>Tối đa 1000 mã mỗi lần thêm</li>
                      <li>Các cột khác điền sau trên lưới hoặc qua Excel</li>
                    </>
                  ) : (
                    <>
                      <li>Dán danh sách mã đơn hàng vào ô trên (mỗi mã một dòng)</li>
                      <li>Tối đa 1000 mã đơn hàng mỗi lần thêm</li>
                      <li>Hệ thống sẽ tự động tạo các dòng mới với mã đơn hàng tương ứng</li>
                      <li>Các trường khác có thể để trống và điền sau</li>
                    </>
                  )}
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

      {/* Progress bar cho import Excel */}
      {importProgress && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-800">
              {importProgress.status === 'processing' ? '⏳ Đang nhập dữ liệu...' :
               importProgress.status === 'success' ? '✅ Hoàn thành!' :
               importProgress.status === 'partial' ? '⚠️ Hoàn thành một phần' :
               '❌ Có lỗi xảy ra'}
            </h3>
            
            {/* Progress bar */}
            <div className="mb-4">
              <div className="mb-2 flex justify-between text-sm text-gray-600">
                <span>Batch {importProgress.current}/{importProgress.total}</span>
                <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full transition-all duration-300 ${
                    importProgress.status === 'error' ? 'bg-red-500' :
                    importProgress.status === 'partial' ? 'bg-yellow-500' :
                    importProgress.status === 'success' ? 'bg-green-500' :
                    'bg-blue-500'
                  }`}
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
            
            {/* Thống kê */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Tổng số dòng:</span>
                <span className="font-semibold">{importProgress.totalRows.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Đã nhập thành công:</span>
                <span className="font-semibold text-green-600">{importProgress.successRows.toLocaleString()}</span>
              </div>
              {importProgress.failedBatches && importProgress.failedBatches.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Batch thất bại:</span>
                  <span className="font-semibold text-red-600">{importProgress.failedBatches.length}</span>
                </div>
              )}
            </div>
            
            {/* Thông báo */}
            {importProgress.status === 'processing' && (
              <div className="mt-4 rounded bg-blue-50 p-3 text-xs text-blue-800">
                <p className="font-semibold">💡 Lưu ý:</p>
                <p>• Không đóng trình duyệt trong quá trình nhập</p>
                <p>• Quá trình có thể mất vài phút với file lớn</p>
              </div>
            )}
            
            {importProgress.status === 'success' && (
              <div className="mt-4 rounded bg-green-50 p-3 text-xs text-green-800">
                ✅ Đã nhập thành công tất cả dữ liệu!
              </div>
            )}
            
            {importProgress.status === 'partial' && importProgress.failedBatches && (
              <div className="mt-4 rounded bg-yellow-50 p-3 text-xs text-yellow-800">
                <p className="font-semibold">⚠️ Một số batch thất bại:</p>
                <ul className="mt-1 list-inside list-disc">
                  {importProgress.failedBatches.slice(0, 3).map((b, idx) => (
                    <li key={idx}>Batch {b.batchIndex + 1}: {b.error}</li>
                  ))}
                  {importProgress.failedBatches.length > 3 && (
                    <li>... và {importProgress.failedBatches.length - 3} batch khác</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal kết quả import Excel - hiển thị dòng trùng hoàn toàn */}
      {importResultData && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
        >
          <div
            className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-result-modal-title"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 id="import-result-modal-title" className="text-lg font-semibold text-gray-800">
                {importResultData.isCheckMode ? 'Kết quả kiểm tra dòng trùng' : 'Kết quả nhập dữ liệu từ Excel'}
              </h2>
              <button
                onClick={() => setImportResultData(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              {/* Thống kê */}
              <div className="mb-4 flex gap-4">
                <div className="flex-1 rounded-lg bg-blue-50 p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{importResultData.totalImported}</div>
                  <div className="text-sm text-blue-800">Tổng dòng trong bảng</div>
                </div>
                {!importResultData.isCheckMode && (
                  <div className="flex-1 rounded-lg bg-green-50 p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{importResultData.newCount}</div>
                    <div className="text-sm text-green-800">Dòng mới</div>
                  </div>
                )}
                <div className="flex-1 rounded-lg bg-red-50 p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{importResultData.duplicateCount}</div>
                  <div className="text-sm text-red-800">Dòng trùng hoàn toàn</div>
                </div>
                {importResultData.isCheckMode && (
                  <div className="flex-1 rounded-lg bg-yellow-50 p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {importResultData.duplicateGroups?.length || 0}
                    </div>
                    <div className="text-sm text-yellow-800">Nhóm trùng</div>
                  </div>
                )}
              </div>
              
              {/* Danh sách dòng trùng */}
              {importResultData.duplicateCount > 0 && (
                <div className="rounded-lg border border-red-200">
                  <div className="bg-red-50 px-4 py-2 font-semibold text-red-800 flex justify-between items-center">
                    <span>Các dòng trùng hoàn toàn {importResultData.isCheckMode ? 'trong bảng' : 'với dữ liệu đã có'}:</span>
                    <button
                      onClick={() => {
                        // Xuất Excel các dòng trùng
                        const wb = XLSX.utils.book_new();
                        const ws = XLSX.utils.json_to_sheet(
                          importResultData.duplicateRows.map(row => ({
                            'ID': row.id,
                            'Mã đơn hàng': row.ma_don_hang || '',
                            'Mã Tracking': row.ma_tracking || '',
                            'Tiền Việt': row.tien_viet || '',
                            'Tiền USD': row.tien_usd || '',
                            'Ngày đối soát': row.ngay_doi_soat || row.ngay_doi_soat_cuoc || '',
                            'Đơn vị tiền': row.don_vi_tien || '',
                            'Tỷ giá': row.ty_gia || '',
                          }))
                        );
                        XLSX.utils.book_append_sheet(wb, ws, 'Dong_trung');
                        const fileName = `Dong_trung_${new Date().toISOString().slice(0, 10)}.xlsx`;
                        XLSX.writeFile(wb, fileName);
                      }}
                      className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                    >
                      <Download className="w-3 h-3" />
                      Xuất Excel
                    </button>
                  </div>
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-100">
                        <tr>
                          {importResultData.isCheckMode && <th className="px-3 py-2 text-left">ID</th>}
                          <th className="px-3 py-2 text-left">Mã đơn hàng</th>
                          <th className="px-3 py-2 text-left">Mã Tracking</th>
                          <th className="px-3 py-2 text-right">Tiền Việt</th>
                          <th className="px-3 py-2 text-right">Tiền USD</th>
                          <th className="px-3 py-2 text-left">Ngày đối soát</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResultData.duplicateRows.slice(0, 100).map((row, idx) => (
                          <tr key={idx} className="border-t border-gray-100 bg-red-25">
                            {importResultData.isCheckMode && <td className="px-3 py-2 text-gray-500">{row.id}</td>}
                            <td className="px-3 py-2">{row.ma_don_hang || '-'}</td>
                            <td className="px-3 py-2">{row.ma_tracking || '-'}</td>
                            <td className="px-3 py-2 text-right">{row.tien_viet?.toLocaleString() || '-'}</td>
                            <td className="px-3 py-2 text-right">{row.tien_usd?.toLocaleString() || '-'}</td>
                            <td className="px-3 py-2">{row.ngay_doi_soat || row.ngay_doi_soat_cuoc || '-'}</td>
                          </tr>
                        ))}
                        {importResultData.duplicateCount > 100 && (
                          <tr>
                            <td colSpan={importResultData.isCheckMode ? 6 : 5} className="px-3 py-2 text-center text-gray-500">
                              ... và {importResultData.duplicateCount - 100} dòng khác
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            
            {/* Nút hành động */}
            <div className="flex justify-between border-t border-gray-200 px-4 py-3">
              <button
                onClick={() => setImportResultData(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Đóng
              </button>
              {!importResultData.isCheckMode && (
                <div className="flex gap-2">
                  {importResultData.duplicateCount > 0 && (
                    <button
                      onClick={() => handleConfirmImportResult(false)}
                      disabled={importResultData.newCount === 0}
                      className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Chỉ lưu {importResultData.newCount} dòng mới
                    </button>
                  )}
                  <button
                    onClick={() => handleConfirmImportResult(true)}
                    className="rounded-lg bg-orange-500 px-4 py-2 text-white hover:bg-orange-600"
                  >
                    Lưu tất cả ({importResultData.totalImported} dòng)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {billTrackingDetailKey && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setBillTrackingDetailKey(null)}
          role="presentation"
        >
          <div
            className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-tracking-modal-title"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 id="bill-tracking-modal-title" className="text-lg font-semibold text-gray-800">
                {billTrackingDetailKey.startsWith('ord:')
                  ? 'Cùng Mã đơn hàng (Dropoff / trống tracking) — '
                  : 'Cùng Mã Tracking trong bảng — '}
                <span className="font-mono text-blue-800">
                  {billTrackingDetailKey.startsWith('ord:')
                    ? billTrackingDetailKey.slice(4)
                    : billTrackingDetailKey.startsWith('tr:')
                      ? billTrackingDetailKey.slice(3)
                      : billTrackingDetailKey}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setBillTrackingDetailKey(null)}
                className="rounded p-1 hover:bg-gray-100"
                aria-label="Đóng"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="overflow-auto px-4 py-3">
              <p className="mb-3 text-sm text-gray-600">
                Có{' '}
                <strong>
                  {
                    billDataWithTableDemLan.filter(
                      (r) => getBillDemLanDetailId(r, pendingChanges) === billTrackingDetailKey
                    ).length
                  }
                </strong>{' '}
                dòng (theo nhóm hiện tại trên bảng; gồm chỉnh sửa chưa lưu nếu có).
              </p>
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-700">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Mã đơn hàng</th>
                    <th className="px-3 py-2 font-medium">Mã Tracking</th>
                    <th className="px-3 py-2 font-medium">Ngày đối soát</th>
                    <th className="px-3 py-2 font-medium">FFM</th>
                    <th className="px-3 py-2 font-medium text-right">Số tiền đối soát</th>
                    <th className="px-3 py-2 font-medium text-right">Tiền Việt</th>
                    <th className="px-3 py-2 font-medium">Tạo lúc</th>
                    <th className="px-3 py-2 font-medium w-24">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {billDataWithTableDemLan
                    .filter(
                      (r) => getBillDemLanDetailId(r, pendingChanges) === billTrackingDetailKey
                    )
                    .slice()
                    .sort((a, b) => {
                      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                      return tb - ta;
                    })
                    .map((r, i) => {
                      const tkShow = getEffectiveBillMaTracking(r, pendingChanges);
                      const canDelete = r.id != null;
                      return (
                        <tr key={r.id ?? `${tkShow}-${i}`} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.ma_don_hang ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-xs">{tkShow || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.ngay_doi_soat ? formatDate(r.ngay_doi_soat) : '—'}
                          </td>
                          <td className="px-3 py-2">{r.ffm ?? '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatNumber(r.so_tien_doi_soat) || '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatNumber(r.tien_viet) || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                            {r.created_at ? formatDateTime(r.created_at) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              title="Xóa dòng khỏi chi_tiet_bill_tien"
                              disabled={!canDelete || deletingBillDetailRowId != null}
                              className="inline-flex items-center justify-center rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:pointer-events-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteBillDetailRow(r.id);
                              }}
                            >
                              {deletingBillDetailRowId === r.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {cuocDupDetailKey && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCuocDupDetailKey(null)}
          role="presentation"
        >
          <div
            className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cuoc-dup-modal-title"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 id="cuoc-dup-modal-title" className="text-lg font-semibold text-gray-800">
                Trùng mã đơn trong chitiet_cuoc — <span className="font-mono text-red-700">{cuocDupDetailKey}</span>
              </h2>
              <button
                type="button"
                onClick={() => setCuocDupDetailKey(null)}
                className="rounded p-1 hover:bg-gray-100"
                aria-label="Đóng"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="overflow-auto px-4 py-3">
              <p className="mb-3 text-sm text-gray-600">
                Có{' '}
                <strong>
                  {
                    cuocDataWithTableDemLan.filter(
                      (r) => getEffectiveCuocMaDonHang(r, pendingChanges) === cuocDupDetailKey
                    ).length
                  }
                </strong>{' '}
                dòng cùng mã (theo bảng hiện tại; gồm chỉnh sửa chưa lưu nếu có).
              </p>
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-700">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Mã đơn hàng</th>
                    <th className="px-3 py-2 font-medium">Ngày đối soát cước</th>
                    <th className="px-3 py-2 font-medium text-right">Tiền ship (VNĐ)</th>
                    <th className="px-3 py-2 font-medium">Chi nhánh</th>
                    <th className="px-3 py-2 font-medium">Tạo lúc</th>
                    <th className="px-3 py-2 font-medium w-24">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cuocDataWithTableDemLan
                    .filter((r) => getEffectiveCuocMaDonHang(r, pendingChanges) === cuocDupDetailKey)
                    .slice()
                    .sort((a, b) => {
                      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                      return tb - ta;
                    })
                    .map((r, i) => {
                      const canDelete = r.id != null;
                      const mdhShow = getEffectiveCuocMaDonHang(r, pendingChanges);
                      return (
                        <tr key={r.id ?? `${mdhShow}-${i}`} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                          <td className="px-3 py-2 font-mono text-xs">{mdhShow || '—'}</td>
                          <td className="px-3 py-2">
                            {r.ngay_doi_soat_cuoc != null && r.ngay_doi_soat_cuoc !== ''
                              ? String(r.ngay_doi_soat_cuoc)
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatNumber(r.tien_ship_vnd) || '—'}
                          </td>
                          <td className="px-3 py-2">{r.chi_nhanh ?? '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                            {r.created_at ? formatDateTime(r.created_at) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              title="Xóa dòng khỏi chitiet_cuoc"
                              disabled={!canDelete || deletingCuocDetailRowId != null}
                              className="inline-flex items-center justify-center rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:pointer-events-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCuocDetailRow(r.id);
                              }}
                            >
                              {deletingCuocDetailRowId === r.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* Custom Sync Confirmation Modal (Premium) */}
      {showSyncConfirmModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-[0_20px_70px_rgba(0,0,0,0.3)] w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden border border-white/20">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 p-6 text-white relative">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                    <RotateCw className="w-5 h-5 animate-spin-slow" />
                    {syncConfirmData.title}
                  </h3>
                  <p className="text-blue-100 text-xs mt-1 font-medium italic opacity-90">
                    {syncConfirmData.modeLabel}
                  </p>
                </div>
                <button 
                  onClick={() => setShowSyncConfirmModal(false)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="bg-gray-50 border border-gray-100 p-3 rounded-2xl text-center">
                  <div className="text-[9px] uppercase font-bold text-gray-400 mb-1">Số dòng bill</div>
                  <div className="text-xl font-black text-gray-600 leading-none">{syncConfirmData.stats.rawRows || 0}</div>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-3 rounded-2xl text-center">
                  <div className="text-[9px] uppercase font-bold text-blue-400 mb-1">Mã đơn duy nhất</div>
                  <div className="text-xl font-black text-blue-700 leading-none">{syncConfirmData.stats.total}</div>
                </div>
                <div className="bg-green-50 border border-green-100 p-3 rounded-2xl text-center">
                  <div className="text-[9px] uppercase font-bold text-green-400 mb-1">Khớp hệ thống</div>
                  <div className="text-xl font-black text-green-700 leading-none">{syncConfirmData.stats.found}</div>
                </div>
                <div className="bg-red-50 border border-red-100 p-3 rounded-2xl text-center">
                  <div className="text-[9px] uppercase font-bold text-red-400 mb-1">Bị bỏ qua</div>
                  <div className="text-xl font-black text-red-700 leading-none">{syncConfirmData.stats.missing}</div>
                </div>
              </div>

              {/* Notice */}
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-xl mb-6">
                <div className="flex gap-3">
                  <span className="text-xl">💡</span>
                  <p className="text-xs text-yellow-800 leading-relaxed font-medium">
                    Hệ thống sẽ cập nhật dữ liệu cho <strong className="text-yellow-900 font-bold">{syncConfirmData.stats.found} đơn hàng</strong> đã khớp được mã. Các đơn hàng không tìm thấy sẽ được giữ nguyên trạng thái cũ.
                  </p>
                </div>
              </div>

              {/* Error List Sections */}
              {syncConfirmData.errorList && syncConfirmData.errorList.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-red-500 rounded-full"></span>
                    Danh sách đơn bị bỏ qua ({syncConfirmData.errorList.reduce((acc, cur) => acc + cur.items.length, 0)})
                  </h4>
                  {syncConfirmData.errorList.map((err, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                      <div className="text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-wide flex items-center justify-between">
                        {err.label}
                        <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-md">{err.items.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                        {err.items.map((item, i) => (
                          <span key={i} className="text-[10px] font-bold bg-white border border-gray-200 text-gray-600 px-2 py-1 rounded-md shadow-sm">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button
                disabled={syncing}
                onClick={() => setShowSyncConfirmModal(false)}
                className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button
                disabled={syncing}
                onClick={() => {
                  syncConfirmData.onConfirm();
                }}
                className="flex-[2] px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {syncing ? 'Đang xử lý...' : 'Xác nhận đồng bộ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar Overlay when Syncing */}
      {syncProgress.active && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[11000] w-full max-w-md px-4">

          <div className="bg-white rounded-2xl shadow-[0_10px_50px_rgba(0,0,0,0.15)] border border-blue-100 p-5 overflow-hidden relative">
            {/* Glossy edge effect */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500" />
            
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs font-bold text-gray-800 uppercase tracking-widest">Đang đồng bộ dữ liệu</span>
              </div>
              <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                {Math.round((syncProgress.current / syncProgress.total) * 100)}%
              </span>
            </div>
            
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden border border-gray-50 shadow-inner">
              <div 
                className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full transition-all duration-500 ease-out relative"
                style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
              >
                {/* Shine effect */}
                <div className="absolute inset-0 bg-white/20 skew-x-[45deg] translate-x-[-100%] animate-[shine_2s_infinite]" />
              </div>
            </div>
            
            <div className="mt-3 flex justify-between items-center">
              <span className="text-[10px] text-gray-400 font-medium italic">Vui lòng không đóng tab...</span>
              <span className="text-[10px] font-bold text-gray-500 tabular-nums">
                {syncProgress.current.toLocaleString()} / {syncProgress.total.toLocaleString()} đơn
              </span>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shine {
          0% { transform: translateX(-200%) skewX(-45deg); }
          100% { transform: translateX(200%) skewX(-45deg); }
        }
      `}} />

      {/* Sync History Modal (Premium) */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-[0_20px_70px_rgba(0,0,0,0.3)] w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-white/20">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 rounded-2xl">
                  <History className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Lịch sử đồng bộ</h3>
                  <p className="text-xs text-gray-500 font-medium">Theo dõi hoạt động cập nhật dữ liệu của quản trị viên</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleExportHistoryExcel}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-green-100 transition-all hover:-translate-y-0.5 active:translate-y-0"
                >
                  <FileDown className="w-4 h-4" />
                  Xuất Excel
                </button>
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="p-2.5 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded-xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-gray-50/50 border-b border-gray-100 px-6 py-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
                <Search className="w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Tìm người thực hiện..." 
                  className="text-sm outline-none w-40"
                  value={historyFilter.search}
                  onChange={(e) => setHistoryFilter({...historyFilter, search: e.target.value})}
                />
              </div>
              <select 
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium shadow-sm outline-none"
                value={historyFilter.type}
                onChange={(e) => setHistoryFilter({...historyFilter, type: e.target.value})}
              >
                <option value="all">Tất cả loại</option>
                <option value="Bill">Đồng bộ Bill</option>
                <option value="Cước">Đồng bộ Cước</option>
              </select>
              <input 
                type="date" 
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium shadow-sm outline-none"
                value={historyFilter.date}
                onChange={(e) => setHistoryFilter({...historyFilter, date: e.target.value})}
              />
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-auto p-0 scrollbar-thin bg-gray-50/30">
              {loadingHistory ? (
                <div className="h-full flex flex-col items-center justify-center gap-4">
                  <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
                  <p className="text-gray-500 font-bold animate-pulse">Đang tải lịch sử...</p>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-white shadow-[0_1px_0_rgba(0,0,0,0.05)]">
                      <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Thời gian</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Người thực hiện</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Loại đồng bộ</th>
                      <th className="px-6 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Dòng thô</th>
                      <th className="px-6 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Mã duy nhất</th>
                      <th className="px-6 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Thành công</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyLogs
                      .filter(log => {
                        const matchType = historyFilter.type === 'all' || log.sync_type === historyFilter.type;
                        const matchSearch = (log.performed_by || '').toLowerCase().includes(historyFilter.search.toLowerCase());
                        const matchDate = !historyFilter.date || log.created_at.startsWith(historyFilter.date);
                        return matchType && matchSearch && matchDate;
                      })
                      .map((log) => (
                      <tr key={log.id} className="bg-white hover:bg-blue-50/40 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-bold text-gray-800">
                            {new Date(log.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className="text-[10px] font-medium text-gray-400">
                            {new Date(log.created_at).toLocaleDateString('vi-VN')}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-black shadow-lg shadow-indigo-100">
                              {(log.performed_by || 'A')[0].toUpperCase()}
                            </div>
                            <span className="text-sm font-bold text-gray-700">{log.performed_by}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight ${
                            log.sync_type === 'Bill' 
                              ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                              : 'bg-teal-50 text-teal-600 border border-teal-100'
                          }`}>
                            {log.sync_type}
                          </span>
                          <div className="text-[10px] text-gray-400 mt-1 italic font-medium">{log.mode_label}</div>
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          <span className="text-sm font-black text-gray-500">{log.total_input_rows?.toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          <span className="text-sm font-black text-indigo-600">{log.unique_orders_count?.toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-black ring-1 ring-green-100 shadow-sm shadow-green-50">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            {log.success_count?.toLocaleString()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-white border-t border-gray-100 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Hệ thống ghi nhận lịch sử đồng bộ tự động</p>
            </div>
          </div>
        </div>
      )}

       <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shine {
          0% { transform: translateX(-200%) skewX(-45deg); }
          100% { transform: translateX(200%) skewX(-45deg); }
        }
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
         @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
}

export default DoiSoatBillCuoc;
