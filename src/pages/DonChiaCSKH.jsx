import { Download, Edit, Eye, RefreshCw, Search, Settings, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';

import ColumnSettingsModal from '../components/ColumnSettingsModal';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../supabase/config';
import { COLUMN_MAPPING, PRIMARY_KEY_COLUMN, EDITABLE_COLS, DROPDOWN_OPTIONS } from '../types';
import {
  mergeUniqueRowsById,
  orderRangeToCreatedAtIsoBounds,
  sortOrdersByDisplayDateDesc,
} from '../utils/dateParsing';
import { resolveTrackingFromOrder, resolveTrangThaiThuTienFromOrder } from '../utils/orderTracking';
import { getCheckResult } from '../utils/orderCheckAndVnd';

// Helper Functions
const getRowValue = (row, ...keys) => {

  if (!row) return null;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
  }
  return null;
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('vi-VN').format(date);
};

const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

const parseMoney = (moneyString) => {
  if (typeof moneyString === 'number') return moneyString;
  if (!moneyString) return 0;
  return parseFloat(moneyString.toString().replace(/[^\d.-]/g, '')) || 0;
};

const DON_CHIA_CSKH_PAGE_SIZE = 1000;
/** Khoảng ngày quá rộng + select * dễ statement timeout (57014) trên order_code_hcm. */
const DON_CHIA_MAX_RANGE_DAYS = 93;

/** Chỉ cột cần cho lưới / map — tránh select('*') kéo jsonb/log nặng.
 * Không gồm alias chỉ có ở bảng tạm đối soát (vd. ma_tracking). */
const DON_CHIA_LIST_COLUMNS = [
  'id',
  'order_code',
  'order_date',
  'created_at',
  'customer_name',
  'customer_phone',
  'customer_address',
  'city',
  'state',
  'country',
  'zipcode',
  'product',
  'product_name_1',
  'total_amount_vnd',
  'payment_type',
  'payment_method',
  'payment_method_text',
  'tracking_code',
  'marketing_staff',
  'sale_staff',
  'team',
  'delivery_status',
  'check_result',
  'note',
  'cskh',
  'cskh_status',
  'delivery_staff',
  'reconciled_vnd',
  'reconciled_amount',
  'shipping_unit',
  'shipping_carrier',
  'accountant_confirm',
  'payment_status',
  'payment_status_detail',
  'reason',
  'page_name',
];

function parseMissingColumnName(err) {
  const msg = String(err?.message || err || '');
  const m =
    msg.match(/column\s+[\w.]+\.(\w+)\s+does not exist/i) ||
    msg.match(/Could not find the '(\w+)' column/i);
  return m?.[1] || null;
}

function formatLocalYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Luôn có cận trên; tránh gte không lte quét nửa bảng → timeout. */
function resolveDonChiaDateBounds(startDate, endDate) {
  const today = formatLocalYmd(new Date());
  let start = String(startDate || '').trim();
  let end = String(endDate || '').trim();
  let adjusted = false;
  let message = '';

  if (!start && !end) {
    return { ok: false, start: '', end: '', message: 'Vui lòng chọn Từ ngày / Đến ngày.' };
  }
  if (!start) {
    start = end || today;
    adjusted = true;
  }
  if (!end) {
    end = today;
    adjusted = true;
    message = `Đến ngày trống — dùng hôm nay (${today}) để tránh timeout.`;
  }
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
    adjusted = true;
    message = 'Đã đảo Từ ngày / Đến ngày vì khoảng không hợp lệ.';
  }

  const startMs = new Date(`${start}T00:00:00`).getTime();
  const endMs = new Date(`${end}T00:00:00`).getTime();
  const days = Math.floor((endMs - startMs) / 86400000) + 1;
  if (Number.isFinite(days) && days > DON_CHIA_MAX_RANGE_DAYS) {
    const cappedEnd = new Date(`${start}T00:00:00`);
    cappedEnd.setDate(cappedEnd.getDate() + DON_CHIA_MAX_RANGE_DAYS - 1);
    end = formatLocalYmd(cappedEnd);
    adjusted = true;
    message =
      `Khoảng ngày quá rộng (${days} ngày) — giới hạn ${DON_CHIA_MAX_RANGE_DAYS} ngày ` +
      `(${start} → ${end}) để tránh timeout Supabase. Thu hẹp hoặc tải theo từng đợt.`;
  }

  return { ok: true, start, end, adjusted, message, days };
}

/** Mặc định khớp menu Home + rbac (`/don-chia-cskh`). */
const DEFAULT_DON_CHIA_ACCESS_CODES = ['CSKH_PAID'];

function mapDonChiaOrderToFriendly(item) {
  const tracking = resolveTrackingFromOrder(item);
  return {
    id: item.id,
    /** Khớp cột Supabase đơn (orders / order_code_hcm) — dùng cho xuất Excel */
    order_code: item.order_code ?? '',
    cskh_status: item.cskh_status != null && item.cskh_status !== '' ? String(item.cskh_status) : '',
    "Mã đơn hàng": item.order_code,
    "Ngày lên đơn": item.order_date || item.created_at?.split('T')[0],
    "Name*": item.customer_name,
    "Phone*": item.customer_phone,
    "Add": item.customer_address,
    "City": item.city,
    "State": item.state,
    "Khu vực": item.country,
    "Zipcode": item.zipcode,
    "Mặt hàng": item.product,
    "Tên mặt hàng 1": item.product_name_1 || item.product,
    "Tổng tiền VNĐ": item.total_amount_vnd,
    "Loại tiền": item.payment_type,
    "Hình thức thanh toán": item.payment_method_text || item.payment_method,
    "Mã Tracking": tracking,
    tracking_code: tracking,
    "Nhân viên Marketing": item.marketing_staff,
    "Nhân viên Sale": item.sale_staff,
    "Team": item.team,
    "Trạng thái giao hàng": item.delivery_status,
    /** Cột DB `check_result` — bộ lọc Kết quả Check chỉ dùng field này */
    check_result: String(item.check_result ?? '').trim(),
    "Kết quả Check": item.check_result,
    "Ghi chú": item.note,
    "CSKH": item.cskh ? String(item.cskh).trim() : '',
    "Trạng thái cskh": item.cskh_status != null && item.cskh_status !== '' ? String(item.cskh_status) : '',
    _cskh_raw: item.cskh,
    "NV Vận đơn": item.delivery_staff,
    "Tiền Việt đã đối soát": item.reconciled_vnd || item.reconciled_amount,
    "Đơn vị vận chuyển": item.shipping_unit || item.shipping_carrier,
    "Kế toán xác nhận thu tiền về": item.accountant_confirm,
    "Trạng thái thu tiền": resolveTrangThaiThuTienFromOrder(item),
    "Lý do": item.reason,
    "Page": item.page_name,
  };
}

function applyDonChiaNonManagerCskhGate(mappedData, isManager) {
  if (isManager) return mappedData;
  return mappedData.filter((row) => {
    const cskh = row['CSKH'];
    if (cskh === null || cskh === undefined) return false;
    const trimmed = String(cskh).trim();
    return trimmed !== '' && trimmed.length > 0;
  });
}

function applyDonChiaClientTableFilters(data, ctx) {
  let rows = [...data];

  if (ctx.debouncedSearchText) {
    const searchLower = ctx.debouncedSearchText.toLowerCase();
    rows = rows.filter((row) =>
      Object.values(row).some((val) => String(val || '').toLowerCase().includes(searchLower))
    );
  }

  if (ctx.filterMarket.length > 0) {
    rows = rows.filter((row) => {
      const market = row["Khu vực"] || row["khu vực"];
      return ctx.filterMarket.includes(String(market).trim());
    });
  }

  if (ctx.filterProduct.length > 0) {
    rows = rows.filter((row) => {
      const product = row["Mặt hàng"];
      return ctx.filterProduct.includes(String(product).trim());
    });
  }

  if (ctx.filterStatus.length > 0) {
    rows = rows.filter((row) => {
      const status = row["Trạng thái giao hàng"];
      return ctx.filterStatus.includes(String(status).trim());
    });
  }

  if (ctx.filterCheckResult.length > 0) {
    rows = rows.filter((row) => {
      const s = getCheckResult(row);
      if (ctx.filterCheckResult.includes('(Trống)')) {
        if (!s) return true;
      }
      return ctx.filterCheckResult.includes(s);
    });
  }

  if (ctx.filterPersonnel.length > 0) {
    rows = rows.filter((row) => {
      const cskh = String(row["CSKH"] || '').trim();
      return ctx.filterPersonnel.some((filterName) => {
        const name = String(filterName).trim();
        return cskh.toLowerCase() === name.toLowerCase() ||
          cskh.toLowerCase().includes(name.toLowerCase());
      });
    });
  }

  if (ctx.filterCSKH.length > 0) {
    rows = rows.filter((row) => {
      const cskh = String(row["CSKH"] || '').trim();
      return ctx.filterCSKH.some((filterValue) => {
        if (filterValue === '__EMPTY__') return !cskh || cskh === '';
        return cskh.toLowerCase() === String(filterValue).trim().toLowerCase();
      });
    });
  }

  if (ctx.filterTrangThai.length > 0) {
    rows = rows.filter((row) => {
      const status = String(row["Trạng thái cskh"] || '').trim();
      const statusLower = status.toLowerCase();
      return ctx.filterTrangThai.some((filterValue) => {
        if (filterValue === '__EMPTY__') return !status || status === '';
        return statusLower === String(filterValue).trim().toLowerCase();
      });
    });
  }

  if (ctx.sortColumn) {
    rows.sort((a, b) => {
      const aVal = a[ctx.sortColumn] || '';
      const bVal = b[ctx.sortColumn] || '';
      const comparison = String(aVal).localeCompare(String(bVal), 'vi', { numeric: true });
      return ctx.sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  return rows;
}


function DonChiaCSKH({
  ordersTableName = 'orders',
  pageTitle = 'ĐƠN CHIA CSKH',
  pageSubtitle = 'Dữ liệu từ Supabase',
  accessPermissionCodes = DEFAULT_DON_CHIA_ACCESS_CODES,
  /** HCM: tải hết đơn từ server (lặp range), không giới hạn 10k dòng */
  unlimitedDataFetch = false,
  /** Số dòng/trang mặc định; 0 = Tất cả */
  defaultRowsPerPage,
} = {}) {
  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const navigate = useNavigate();
  const { canView, canEdit, canDelete, role } = usePermissions();

  const canAccessPage = useMemo(
    () => accessPermissionCodes.some((code) => canView(code)),
    [accessPermissionCodes, canView]
  );

  const columnPrefsKey = `donChiaCSKH_visibleColumns_${ordersTableName}`;
  const excelExportBaseName =
    ordersTableName === 'order_code_hcm' ? 'DonChiaCSKH_HCM' : 'DonChiaCSKH';

  const [allData, setAllData] = useState([]);
  const [allMappedData, setAllMappedData] = useState([]); // Lưu tất cả dữ liệu đã map (trước khi filter CSKH) để lấy unique CSKH

  const [loading, setLoading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [filterMarket, setFilterMarket] = useState([]);
  const [filterProduct, setFilterProduct] = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);
  const [filterCheckResult, setFilterCheckResult] = useState([]);
  const [filterPersonnel, setFilterPersonnel] = useState([]); // Filter by personnel name - array
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterCSKH, setFilterCSKH] = useState([]); // Array for multiple selection
  const [filterTrangThai, setFilterTrangThai] = useState([]); // Array for multiple selection
  
  // State for dropdown open/close
  const [openDropdowns, setOpenDropdowns] = useState({
    market: false,
    product: false,
    status: false,
    checkResult: false,
    cskh: false,
    trangThai: false
  });

  // Date state - default to last 3 days
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [quickFilter, setQuickFilter] = useState('today');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(() =>
    defaultRowsPerPage !== undefined ? defaultRowsPerPage : 1000
  );
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState(null);

  // --- Edit Modal State (must be before early return) ---
  const [editingOrder, setEditingOrder] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [clearingCskhBulk, setClearingCskhBulk] = useState(false);

  // --- Permission State ---
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [cskhPersonnelCache, setCSKHPersonnelCache] = useState({}); // Cache để lưu selected_personnel của mỗi CSKH

  // List of columns that should be hidden/removed (no longer needed)
  const REMOVED_COLUMNS = [
    'Phí ship',
    'Tiền Hàng',
    'Phí Chung',
    'Phí bay',
    'Thuê TK',
    'Phí xử lý đơn đóng hàng-Lưu kho(usd)',
    'Thời gian cutoff',
    '_id',
    '_source'
  ];

  const defaultColumns = [
    'Mã đơn hàng',
    'Ngày lên đơn',
    'Name*',
    'Phone*',
    'Khu vực',
    'Mặt hàng',
    'Page',
    'Mã Tracking',
    'Kết quả Check',
    'CSKH',
    'Nhân viên Sale',
    'Trạng thái cskh',
    'Trạng thái giao hàng',
    'Tổng tiền VNĐ',
  ];

  // Mapping từ tên cột DB sang tên hiển thị thân thiện
  const COLUMN_DISPLAY_NAMES = {
    // Các cột đã được map
    'order_code': 'Mã đơn hàng',
    'order_date': 'Ngày lên đơn',
    'customer_name': 'Tên khách hàng',
    'customer_phone': 'Số điện thoại',
    'customer_address': 'Địa chỉ',
    'city': 'Thành phố',
    'state': 'Bang/Tỉnh',
    'country': 'Khu vực',
    'zipcode': 'Mã bưu điện',
    'product': 'Mặt hàng',
    'product_main': 'Mặt hàng chính',
    'product_name_1': 'Tên mặt hàng 1',
    'payment_type': 'Loại tiền',
    'payment_method': 'Hình thức thanh toán',
    'payment_method_text': 'Hình thức thanh toán',
    'tracking_code': 'Mã Tracking',
    'delivery_status': 'Trạng thái giao hàng',
    'total_amount_vnd': 'Tổng tiền VNĐ',
    'cskh': 'CSKH',
    'cskh_status': 'Trạng thái cskh',
    'team': 'Team',
    'sale_staff': 'Nhân viên Sale',
    'marketing_staff': 'Nhân viên Marketing',
    'delivery_staff': 'Nhân viên Vận đơn',
    'note': 'Ghi chú',
    'reason': 'Lý do',
    'payment_status': 'Trạng thái thu tiền',
    'payment_status_detail': 'Trạng thái thu tiền (chi tiết)',
    'check_result': 'Kết quả Check',
    'vandon_note': 'Ghi chú vận đơn',
    'shipping_fee': 'Phí ship',
    'warehouse_fee': 'Phí xử lý đơn đóng hàng-Lưu kho(usd)',
    'shipping_unit': 'Đơn vị vận chuyển',
    'shipping_carrier': 'Đơn vị vận chuyển',
    'goods_amount': 'Giá bán',
    'sale_price': 'Giá bán',
    'general_fee': 'Phí chung',
    'flight_fee': 'Phí bay',
    'account_rental_fee': 'Thuê TK',
    'luu_kho_usd': 'Ngày đối soát kế toán',
    'thoigiangiaohangffm': 'Thời gian giao dự kiến',
    'cutoff_time': 'Thời gian cutoff',
    'reconciled_vnd': 'Tiền Việt đã đối soát',
    'reconciled_amount': 'Tiền Việt đã đối soát',
    'accountant_confirm': 'Kế toán xác nhận thu tiền về',
    'page_name': 'Page',
    'shift': 'Ca',
    'created_at': 'Ngày tạo',
    'updated_at': 'Ngày cập nhật',
    'id': 'ID',
  };

  // Hàm chuyển đổi tên cột DB sang tên hiển thị thân thiện
  const getDisplayColumnName = (columnName) => {
    // Nếu đã có trong mapping, trả về tên thân thiện
    if (COLUMN_DISPLAY_NAMES[columnName]) {
      return COLUMN_DISPLAY_NAMES[columnName];
    }
    
    // Nếu là tên thân thiện đã được map (không có trong COLUMN_DISPLAY_NAMES), giữ nguyên
    // Kiểm tra xem có phải là tên DB (snake_case hoặc camelCase) không
    if (columnName.includes('_') || (columnName.match(/[a-z][A-Z]/))) {
      // Chuyển snake_case hoặc camelCase sang Title Case
      return columnName
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
    
    // Nếu không phải tên DB, giữ nguyên (đã là tên thân thiện)
    return columnName;
  };

  // Helper function để kiểm tra Admin hoặc Finance
  const isAdmin = () => {
    const roleLower = (role || '').toLowerCase();
    return roleLower === 'admin' || roleLower === 'super_admin' || roleLower === 'finance';
  };

  /** Chỉ admin (không tính finance) + tài khoản admin@marketing.com / Bộ phận admin — cho nút gỡ gán CSKH */
  const isStrictAdminForCskhClear = () => {
    const roleLower = (role || '').toLowerCase();
    if (roleLower === 'admin' || roleLower === 'super_admin') return true;
    try {
      const userJson = localStorage.getItem('user');
      const user = userJson ? JSON.parse(userJson) : null;
      const userEmail = (localStorage.getItem('userEmail') || user?.Email || user?.email || '')
        .toString()
        .toLowerCase()
        .trim();
      const boPhan = (user?.['Bộ_phận'] || user?.['Bộ phận'] || '').toString().trim().toLowerCase();
      return userEmail === 'admin@marketing.com' || boPhan === 'admin';
    } catch {
      return false;
    }
  };

  const normalizePersonnelList = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try {
          const parsed = JSON.parse(trimmed);
          return normalizePersonnelList(parsed);
        } catch (e) {
          // Fall back to comma-separated format if JSON parsing fails.
        }
      }
      return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [];
  };

  // Debounce search text for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Extract current user email on mount
  useEffect(() => {
    const userEmail = localStorage.getItem("userEmail") || 
                     (localStorage.getItem("user") 
                       ? JSON.parse(localStorage.getItem("user"))?.Email || 
                         JSON.parse(localStorage.getItem("user"))?.email || '' 
                       : '');
    if (userEmail) {
      setCurrentUserEmail(userEmail.trim().toLowerCase());
      console.log('👤 [DonChiaCSKH] Current user email:', userEmail.trim().toLowerCase());
    }
  }, []);

  // Helper function để kiểm tra xem tên cột có phải là tiếng Anh không (cột DB gốc)
  const isEnglishColumn = (columnName) => {
    // Giữ lại các cột đặc biệt đã được sử dụng trong hệ thống
    const specialColumns = [
      'Name*',
      'Phone*',
      'Add',
      'City',
      'State',
      'Zipcode',
      'Team',
      'CSKH',
      'Mã đơn hàng',
      'Mã Tracking',
      'Kết quả Check',
      'Trạng thái thu tiền',
      'Trạng thái giao hàng',
      'Trạng thái cskh',
    ];
    if (specialColumns.includes(columnName)) return false;
    
    // Kiểm tra snake_case (có dấu gạch dưới) - đây là tên cột DB
    if (columnName.includes('_')) return true;
    // Kiểm tra camelCase (có chữ thường tiếp theo chữ hoa) - đây là tên cột DB
    if (columnName.match(/[a-z][A-Z]/)) return true;
    // Kiểm tra toàn bộ là chữ cái tiếng Anh và số, không có ký tự đặc biệt (trừ *)
    // và không có dấu tiếng Việt - đây là tên cột DB
    if (columnName.match(/^[a-zA-Z0-9]+$/) && !columnName.match(/[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđĐ]/)) {
      return true;
    }
    return false;
  };

  // Get all available columns from data - chỉ lấy cột tiếng Việt
  const allAvailableColumns = useMemo(() => {
    // Get all potential keys from data - chỉ lấy cột tiếng Việt
    const allKeys = new Set();
    
    // Luôn thêm các cột mặc định vào danh sách (để đảm bảo chúng luôn có trong cài đặt)
    defaultColumns.forEach(col => allKeys.add(col));
    
    if (allData.length > 0) {
      allData.forEach(row => {
        Object.keys(row).forEach(key => {
          // Exclude PRIMARY_KEY_COLUMN, English columns, removed columns, and technical columns
          if (key !== PRIMARY_KEY_COLUMN && 
              !isEnglishColumn(key) && 
              !REMOVED_COLUMNS.includes(key) &&
              !key.startsWith('_')) {
            allKeys.add(key);
          }
        });
      });
    }

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
  }, [allData]);

  // Load column visibility from localStorage or use defaults
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem(columnPrefsKey);
    let initial = {};
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Remove any columns that are no longer available
        Object.keys(parsed).forEach(col => {
          // Only keep columns that are not in REMOVED_COLUMNS
          if (!REMOVED_COLUMNS.includes(col)) {
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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.relative')) {
        setOpenDropdowns({
          market: false,
          product: false,
          status: false,
          checkResult: false,
          cskh: false,
          trangThai: false
        });
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Clean up removed columns from visibleColumns on mount
  useEffect(() => {
    setVisibleColumns(prev => {
      let updated = { ...prev };
      let changed = false;
      
      // Remove any removed columns
      REMOVED_COLUMNS.forEach(col => {
        if (updated[col] !== undefined) {
          delete updated[col];
          changed = true;
        }
      });
      
      // Ensure default columns are present (including "Trạng thái")
      defaultColumns.forEach(col => {
        if (updated[col] === undefined) {
          updated[col] = true;
          changed = true;
        }
      });
      
      // Đảm bảo cột "Trạng thái cskh" luôn được bật
      if (updated['Trạng thái cskh'] === false || updated['Trạng thái cskh'] === undefined) {
        updated['Trạng thái cskh'] = true;
        changed = true;
      }

      ['Mã đơn hàng', 'Mã Tracking', 'Kết quả Check'].forEach((col) => {
        if (updated[col] !== true) {
          updated[col] = true;
          changed = true;
        }
      });

      return changed ? updated : prev;
    });
  }, []); // Only run once on mount

  // Save to localStorage when visibleColumns changes (excluding removed columns)
  useEffect(() => {
    if (Object.keys(visibleColumns).length > 0) {
      // Clean up: remove any columns that are no longer available
      const cleaned = {};
      Object.keys(visibleColumns).forEach(col => {
        if (!REMOVED_COLUMNS.includes(col)) {
          cleaned[col] = visibleColumns[col];
        }
      });
      localStorage.setItem(columnPrefsKey, JSON.stringify(cleaned));
    }
  }, [visibleColumns, columnPrefsKey]);

  const getDonChiaOrdersQuery = async (options = {}) => {
    const dateMode = options.dateMode === 'created_at' ? 'created_at' : 'order_date';
    const boundStart = options.boundStart ?? startDate;
    const boundEnd = options.boundEnd ?? endDate;

    const userJson = localStorage.getItem("user");
    const user = userJson ? JSON.parse(userJson) : null;

    const userEmail = localStorage.getItem("userEmail") || (user?.Email || user?.email || "").toString().toLowerCase().trim();
    const userName = localStorage.getItem("username") || (user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || user?.name || user?.fullName || "").toString().trim();
    const boPhan = (user?.['Bộ_phận'] || user?.['Bộ phận'] || "").toString().trim().toLowerCase();
    const viTri = (user?.['Vị_trí'] || user?.['Vị trí'] || "").toString().trim().toLowerCase();

    const ADMIN_MAIL = "admin@marketing.com";
    const isAdmin = userEmail === ADMIN_MAIL || boPhan === 'admin';
    const isLeader = viTri.includes('leader') || viTri.includes('quản lý') || boPhan.includes('manager');
    const roleLower = (role || '').toLowerCase();
    const isManager = isAdmin || isLeader || roleLower === 'admin' || roleLower === 'super_admin' || roleLower === 'finance';

    const selectCols = (options.selectCols || DON_CHIA_LIST_COLUMNS).filter(Boolean);
    let query = supabase.from(ordersTableName).select(selectCols.join(','));

    if (!isManager) {
      query = query.not('cskh', 'is', null);
      query = query.neq('cskh', '');
      query = query.neq('cskh', ' ');
    }

    if (dateMode === 'order_date') {
      if (boundStart && String(boundStart).trim() !== '') {
        query = query.gte('order_date', String(boundStart).trim());
      }
      if (boundEnd && String(boundEnd).trim() !== '') {
        query = query.lte('order_date', String(boundEnd).trim());
      }
      query = query.order('order_date', { ascending: false });
    } else if (boundStart && boundEnd && String(boundStart).trim() !== '' && String(boundEnd).trim() !== '') {
      const { start, end } = orderRangeToCreatedAtIsoBounds(String(boundStart).trim(), String(boundEnd).trim());
      if (start && end) {
        query = query.is('order_date', null);
        query = query.gte('created_at', start).lte('created_at', end);
        query = query.order('created_at', { ascending: false });
      }
    } else {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    }

    if (!isManager) {
      const normalizedEmail = (userEmail || '').trim().toLowerCase();

      if (normalizedEmail) {
        const { data: userPermissionData, error: userPermissionError } = await supabase
          .from('users')
          .select('selected_personnel')
          .eq('email', normalizedEmail)
          .maybeSingle();

        if (userPermissionError) {
          console.error('❌ [DonChiaCSKH] Error loading selected_personnel:', userPermissionError);
        }

        const selectedPersonnel = normalizePersonnelList(userPermissionData?.selected_personnel);

        if (selectedPersonnel.length > 0) {
          const orConditions = selectedPersonnel
            .map((name) => {
              const pattern = `%${String(name).trim()}%`;
              return `cskh.ilike.${pattern}`;
            })
            .join(',');
          query = query.or(orConditions);
        } else {
          // Chưa cấu hình "Nhân sự" trong Admin: fallback theo tên tài khoản (users.name / username + localStorage)
          const { data: meRow } = await supabase
            .from('users')
            .select('name, username')
            .eq('email', normalizedEmail)
            .maybeSingle();
          const lsName = localStorage.getItem('username') || '';
          const fallbacks = [...new Set(
            [meRow?.name, meRow?.username, lsName]
              .map((s) => String(s || '').trim())
              .filter(Boolean)
          )];
          if (fallbacks.length === 0) {
            query = query.eq('id', '00000000-0000-0000-0000-000000000000');
          } else {
            const orConditions = fallbacks
              .map((n) => `cskh.ilike.%${n}%`)
              .join(',');
            query = query.or(orConditions);
            console.log('🔍 [DonChiaCSKH] selected_personnel trống — lọc cskh theo tên tài khoản:', fallbacks);
          }
        }
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    } else {
      if (filterPersonnel && filterPersonnel.length > 0 && typeof filterPersonnel[0] === 'string') {
        const name = filterPersonnel[0].trim();
        const pattern = `%${name}%`;
        const orConditions = [
          `sale_staff.ilike.${pattern}`,
          `marketing_staff.ilike.${pattern}`,
          `delivery_staff.ilike.${pattern}`
        ];
        try {
          query = query.or(orConditions.join(','));
        } catch (orError) {
          console.error('❌ [DonChiaCSKH] Admin error applying personnel OR filter, falling back to sale_staff:', orError);
          query = query.ilike('sale_staff', pattern);
        }
      }
    }

    return { query, isManager };
  };

  /** Lấy toàn bộ dòng khớp query (lặp range), tránh .limit cố định. */
  const fetchAllRowsForDonChiaQuery = async (dateMode, bounds = {}) => {
    const acc = [];
    let from = 0;
    let isManagerFlag = false;
    let selectCols = [...DON_CHIA_LIST_COLUMNS];
    for (;;) {
      let pageData = null;
      for (;;) {
        const { query, isManager } = await getDonChiaOrdersQuery({
          dateMode,
          boundStart: bounds.start,
          boundEnd: bounds.end,
          selectCols,
        });
        isManagerFlag = isManager;
        const { data, error } = await query.range(from, from + DON_CHIA_CSKH_PAGE_SIZE - 1);
        if (!error) {
          pageData = data;
          break;
        }
        const missing = parseMissingColumnName(error);
        if (missing && selectCols.includes(missing) && selectCols.length > 3) {
          console.warn(`[DonChiaCSKH] Bỏ cột không tồn tại trên ${ordersTableName}:`, missing);
          selectCols = selectCols.filter((c) => c !== missing);
          continue;
        }
        throw error;
      }
      if (!pageData?.length) break;
      acc.push(...pageData);
      if (pageData.length < DON_CHIA_CSKH_PAGE_SIZE) break;
      from += DON_CHIA_CSKH_PAGE_SIZE;
    }
    return { data: acc, isManager: isManagerFlag };
  };

  // Load data from Supabase with date filter
  const loadData = async () => {
    setLoading(true);
    try {
      const bounds = resolveDonChiaDateBounds(startDate, endDate);
      if (!bounds.ok) {
        toast.info(bounds.message || 'Vui lòng chọn khoảng ngày.');
        setAllData([]);
        return;
      }
      if (bounds.adjusted && (bounds.start !== startDate || bounds.end !== endDate)) {
        if (bounds.message) toast.warning(bounds.message);
        setStartDate(bounds.start);
        setEndDate(bounds.end);
        return;
      }
      if (bounds.message && bounds.adjusted) {
        toast.warning(bounds.message);
      }

      console.log('🔍 [DonChiaCSKH] Loading orders from Supabase...');
      console.log(`📅 [DonChiaCSKH] Date range: ${bounds.start} to ${bounds.end}`);

      const FETCH_LIMIT = 10000;
      let data;
      let isManager;
      const dateOpts = { boundStart: bounds.start, boundEnd: bounds.end };

      if (unlimitedDataFetch) {
        const r1 = await fetchAllRowsForDonChiaQuery('order_date', { start: bounds.start, end: bounds.end });
        data = r1.data;
        isManager = r1.isManager;
        const r2 = await fetchAllRowsForDonChiaQuery('created_at', { start: bounds.start, end: bounds.end });
        if (r2.data?.length) {
          data = sortOrdersByDisplayDateDesc(mergeUniqueRowsById(data, r2.data));
          console.log(
            `📅 [DonChiaCSKH] Gộp đơn order_date trống theo created_at: +${r2.data.length} dòng`
          );
        }
      } else {
        let selectCols = [...DON_CHIA_LIST_COLUMNS];
        let res1;
        for (;;) {
          const { query: query1, isManager: im } = await getDonChiaOrdersQuery({
            dateMode: 'order_date',
            ...dateOpts,
            selectCols,
          });
          isManager = im;
          res1 = await query1.limit(FETCH_LIMIT);
          if (!res1.error) break;
          const missing = parseMissingColumnName(res1.error);
          if (missing && selectCols.includes(missing) && selectCols.length > 3) {
            console.warn(`[DonChiaCSKH] Bỏ cột không tồn tại trên ${ordersTableName}:`, missing);
            selectCols = selectCols.filter((c) => c !== missing);
            continue;
          }
          throw res1.error;
        }
        data = res1.data;

        const { query: query2 } = await getDonChiaOrdersQuery({
          dateMode: 'created_at',
          ...dateOpts,
          selectCols,
        });
        const r2 = await query2.limit(FETCH_LIMIT);
        if (r2.error) throw r2.error;
        data = sortOrdersByDisplayDateDesc(mergeUniqueRowsById(data, r2.data));
        console.log(
          `📅 [DonChiaCSKH] Gộp đơn order_date trống theo created_at: +${(r2.data || []).length} dòng`
        );
      }

      // Fallback: if query returns 0 results and user is non-manager, fetch ALL to verify and debug
      if (!isManager && (!data || data.length === 0)) {
        console.warn('⚠️ [DonChiaCSKH] Non-manager query returned 0 results. Fetching ALL orders to debug...');
        const { data: allOrders, error: allError } = await supabase
          .from(ordersTableName)
          .select('order_code, cskh, order_date')
          .not('cskh', 'is', null)
          .neq('cskh', '')
          .neq('cskh', ' ');
        
        if (!allError && allOrders) {
          const uniqueCSKH = [...new Set(allOrders.map(o => String(o.cskh).trim()))];
          console.log('🔍 [DonChiaCSKH] All unique CSKH values in DB:', uniqueCSKH);
          console.log('🔍 [DonChiaCSKH] Total orders with CSKH:', allOrders.length);
        }
      }

      console.log(`📦 [DonChiaCSKH] Raw data from DB: ${data?.length || 0} orders`);
      
      // Debug: get ALL CSKH values from unfiltered query to see what's in DB
      if (data?.length === 0 && !isManager) {
        console.log('⚠️ [DonChiaCSKH] No data found with CSKH filter. Fetching ALL orders to see available CSKH values...');
        const { data: allOrders } = await supabase.from(ordersTableName).select('order_code, cskh').not('cskh', 'is', null).neq('cskh', '').neq('cskh', ' ');
        const cskhValues = allOrders?.map(o => ({ order_code: o.order_code, cskh: o.cskh, cskh_trimmed: String(o.cskh).trim() })) || [];
        console.log('📊 [DonChiaCSKH] All CSKH values in DB (total ' + cskhValues.length + ' orders):', cskhValues);
        console.log('🔍 [DonChiaCSKH] Unique CSKH values:', [...new Set(cskhValues.map(v => v.cskh_trimmed))]);
      }
      
      console.log('🔍 [DonChiaCSKH] Sample CSKH values in raw data:', data?.slice(0, 3).map(item => ({ order_code: item.order_code, cskh: item.cskh, cskh_length: String(item.cskh).length })) || []);
      
      // Debug: Kiểm tra CSKH trong raw data
      if (data && data.length > 0) {
        const withCSKH = data.filter(item => item.cskh && String(item.cskh).trim() !== '');
        const withoutCSKH = data.filter(item => !item.cskh || String(item.cskh).trim() === '');
        console.log(`🔍 [DonChiaCSKH] Raw data breakdown:`);
        console.log(`   - Có CSKH: ${withCSKH.length}`);
        console.log(`   - Không có CSKH: ${withoutCSKH.length}`);
        if (withCSKH.length > 0) {
          console.log(`   - Sample có CSKH:`, {
            order_code: withCSKH[0].order_code,
            order_date: withCSKH[0].order_date,
            cskh: withCSKH[0].cskh,
            team: withCSKH[0].team
          });
        }
      }

      const mappedData = (data || []).map((item) => mapDonChiaOrderToFriendly(item));

      const filteredData = applyDonChiaNonManagerCskhGate(mappedData, isManager);

      // Lưu mappedData để lấy unique CSKH từ tất cả dữ liệu (không chỉ đơn đã filter)
      setAllMappedData(mappedData);
      setAllData(filteredData);
      console.log(`✅ [DonChiaCSKH] Loaded ${mappedData.length} orders from DB`);
      console.log(`🔍 [DonChiaCSKH] After CSKH filter: ${filteredData.length} orders`);
      
      // Debug chi tiết
      if (mappedData.length > 0) {
        const withCSKH = mappedData.filter(row => {
          const cskh = row['CSKH'];
          return cskh && String(cskh).trim() !== '';
        });
        const withoutCSKH = mappedData.filter(row => {
          const cskh = row['CSKH'];
          return !cskh || String(cskh).trim() === '';
        });
        
        console.log(`📊 [DonChiaCSKH] Breakdown:`);
        console.log(`   - Có CSKH: ${withCSKH.length}`);
        console.log(`   - Không có CSKH: ${withoutCSKH.length}`);
        
        if (withCSKH.length > 0) {
          console.log(`   - Sample có CSKH:`, {
            order_code: withCSKH[0]['Mã đơn hàng'],
            cskh: withCSKH[0]['CSKH'],
            cskh_raw: withCSKH[0]['_cskh_raw']
          });
        }
        if (withoutCSKH.length > 0) {
          console.log(`   - Sample không có CSKH:`, {
            order_code: withoutCSKH[0]['Mã đơn hàng'],
            cskh: withoutCSKH[0]['CSKH'],
            cskh_raw: withoutCSKH[0]['_cskh_raw']
          });
        }
      }
      
      if (filteredData.length === 0 && mappedData.length > 0) {
        console.warn(`⚠️ [DonChiaCSKH] Có ${mappedData.length} đơn từ DB nhưng tất cả đều bị filter do CSKH trống!`);
      }

    } catch (error) {
      console.error('❌ [DonChiaCSKH] Load data error:', {
        error,
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        startDate,
        endDate,
      });
      
      // User-friendly error message
      const errorMessage = error?.message || 'Lỗi không xác định';
      const isTimeout =
        error?.code === '57014' ||
        /statement timeout|canceling statement/i.test(errorMessage);
      const isRLSError = errorMessage.includes('row-level security') || errorMessage.includes('RLS');
      const isPermissionError = errorMessage.includes('permission') || errorMessage.includes('quyền');
      
      if (isTimeout) {
        alert(
          `❌ Timeout khi tải dữ liệu (khoảng ngày quá rộng hoặc bảng quá nặng).\n\n` +
            `Đang lọc: ${startDate || '—'} → ${endDate || '—'}\n\n` +
            `Hãy thu hẹp khoảng ngày (tối đa ~${DON_CHIA_MAX_RANGE_DAYS} ngày / lần) rồi tải lại.`
        );
      } else if (isRLSError || isPermissionError) {
        alert(`❌ Lỗi phân quyền:\n\n${errorMessage}\n\nVui lòng kiểm tra quyền truy cập của bạn hoặc liên hệ Admin.`);
      } else {
        alert(`❌ Lỗi tải dữ liệu CSKH:\n\n${errorMessage}\n\nVui lòng thử lại hoặc liên hệ IT nếu lỗi tiếp tục xảy ra.`);
      }
      
      setAllData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate, role, ordersTableName, unlimitedDataFetch]);

  // Get unique values for filters
  const uniqueMarkets = useMemo(() => {
    const markets = new Set();
    allData.forEach(row => {
      const market = row["Khu vực"] || row["khu vực"];
      if (market) markets.add(String(market).trim());
    });
    return Array.from(markets).sort();
  }, [allData]);

  const uniqueProducts = useMemo(() => {
    const products = new Set();
    allData.forEach(row => {
      const product = row["Mặt hàng"];
      if (product) products.add(String(product).trim());
    });
    return Array.from(products).sort();
  }, [allData]);

  const uniqueStatuses = useMemo(() => {
    const statuses = new Set();
    allData.forEach(row => {
      const status = row["Trạng thái giao hàng"];
      if (status) statuses.add(String(status).trim());
    });
    return Array.from(statuses).sort();
  }, [allData]);

  // Unique values từ cột "Trạng thái cskh" (cskh_status)
  const uniqueTrangThaiCSKH = useMemo(() => {
    const statuses = new Set();
    allData.forEach(row => {
      const status = row["Trạng thái cskh"];
      if (status && String(status).trim() !== '') {
        statuses.add(String(status).trim());
      }
    });
    return Array.from(statuses).sort();
  }, [allData]);

  const uniqueCSKH = useMemo(() => {
    const cskhSet = new Set();
    // Lấy từ allMappedData (tất cả dữ liệu) thay vì allData (đã filter) để hiển thị đầy đủ các CSKH
    allMappedData.forEach(row => {
      const cskh = row["CSKH"];
      if (cskh && String(cskh).trim() !== '') {
        cskhSet.add(String(cskh).trim());
      }
    });
    return Array.from(cskhSet).sort();
  }, [allMappedData]);

  const uniqueCheckResults = useMemo(() => {
    const checkResults = new Set();
    let hasEmpty = false;
    allData.forEach((row) => {
      const s = getCheckResult(row);
      if (s) checkResults.add(s);
      else hasEmpty = true;
    });
    const sorted = Array.from(checkResults).sort();
    if (hasEmpty) return ['(Trống)', ...sorted];
    return sorted;
  }, [allData]);


  // Handle quick filter
  const handleQuickFilter = (value) => {
    setQuickFilter(value);
    setFilterMonth(''); // Reset month filter when using quick filter
    if (!value) return;

    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (value) {
      case 'today':
        start = new Date(today);
        end = new Date(today);
        break;
      case 'yesterday':
        start = new Date(today);
        start.setDate(today.getDate() - 1);
        end = new Date(start);
        break;
      case 'this-week': {
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
        start = new Date(today.getFullYear(), today.getMonth(), diff);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      }
      case 'last-week': {
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek - 6 + (dayOfWeek === 0 ? -6 : 1); // Last Monday
        start = new Date(today.getFullYear(), today.getMonth(), diff);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      }
      case 'this-month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'last-month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'this-year':
        start = new Date(today.getFullYear(), 0, 1);
        end = new Date(today.getFullYear(), 11, 31);
        break;
      default:
        return;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  // Filter and sort data
  const filteredData = useMemo(() => {
    return applyDonChiaClientTableFilters(allData, {
      debouncedSearchText,
      filterMarket,
      filterProduct,
      filterStatus,
      filterCheckResult,
      filterPersonnel,
      filterCSKH,
      filterTrangThai,
      sortColumn,
      sortDirection,
    });
  }, [allData, debouncedSearchText, filterMarket, filterProduct, filterStatus, filterCheckResult, filterPersonnel, filterCSKH, filterTrangThai, sortColumn, sortDirection]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const seenCodes = new Set();
    let totalDon = 0;
    let totalTongTien = 0;
    let soDonCSKH = 0;
    let soDonDuocChia = 0;

    filteredData.forEach(row => {
      const maDonHang = String(getRowValue(row, 'Mã_đơn_hàng', 'Mã đơn hàng') || '').trim();

      if (maDonHang && !seenCodes.has(maDonHang)) {
        seenCodes.add(maDonHang);
        totalDon++;

        const tongTien = parseMoney(getRowValue(row, 'Tổng_tiền_VNĐ', 'Tổng tiền VNĐ', 'Tổng_tiền_VND'));
        totalTongTien += tongTien;

        const cskh = String(getRowValue(row, 'CSKH', 'NV_CSKH') || '').trim();
        const nvSale = String(getRowValue(row, 'Nhân_viên_Sale', 'Nhân viên Sale') || '').trim();

        if (cskh && nvSale && cskh === nvSale) {
          soDonCSKH++;
        }

        if (cskh && cskh !== nvSale) {
          soDonDuocChia++;
        }
      }
    });

    return { totalDon, totalTongTien, soDonCSKH, soDonDuocChia };
  }, [filteredData]);

  // Pagination (rowsPerPage === 0: hiển thị toàn bộ kết quả sau lọc)
  const totalPages =
    rowsPerPage > 0 ? Math.max(1, Math.ceil(filteredData.length / rowsPerPage)) : 1;
  const paginatedData = useMemo(() => {
    if (!rowsPerPage || rowsPerPage <= 0) return filteredData;
    const start = (currentPage - 1) * rowsPerPage;
    return filteredData.slice(start, start + rowsPerPage);
  }, [filteredData, currentPage, rowsPerPage]);

  // Format date
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

  const handleExportDonChiaExcel = async () => {
    if (!filteredData.length) {
      toast.warning('Không có dữ liệu để xuất (sau khi lọc).');
      return;
    }
    if (exportingExcel) return;

    const filterCtx = {
      debouncedSearchText,
      filterMarket,
      filterProduct,
      filterStatus,
      filterCheckResult,
      filterPersonnel,
      filterCSKH,
      filterTrangThai,
      sortColumn,
      sortDirection,
    };

    setExportingExcel(true);
    const toastId = 'donchia-cskh-excel-export';
    toast.info('Đang tải đủ đơn từ server (tự chia từng 1000 dòng nếu cần)...', { toastId, autoClose: false });

    try {
      const acc = [];
      let from = 0;
      let isManagerFlag = false;
      for (;;) {
        const { query, isManager } = await getDonChiaOrdersQuery();
        isManagerFlag = isManager;
        const { data, error } = await query.range(from, from + DON_CHIA_CSKH_PAGE_SIZE - 1);
        if (error) throw error;
        if (!data?.length) break;
        acc.push(...data);
        if (data.length < DON_CHIA_CSKH_PAGE_SIZE) break;
        from += DON_CHIA_CSKH_PAGE_SIZE;
      }

      const friendly = acc.map((item) => mapDonChiaOrderToFriendly(item));
      const afterCskhGate = applyDonChiaNonManagerCskhGate(friendly, isManagerFlag);
      const rowsFiltered = applyDonChiaClientTableFilters(afterCskhGate, filterCtx);

      if (!rowsFiltered.length) {
        toast.dismiss(toastId);
        toast.warning('Sau khi lọc không còn dòng để xuất.');
        return;
      }

      const rows = rowsFiltered.map((row) => ({
        'Mã đơn hàng': String(row.order_code ?? row['Mã đơn hàng'] ?? ''),
        'Trạng thái CSKH': String(row.cskh_status ?? row['Trạng thái cskh'] ?? ''),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'CSKH');
      const stamp = `${startDate || 'all'}_${endDate || 'all'}`;
      XLSX.writeFile(wb, `${excelExportBaseName}_${stamp}.xlsx`);
      toast.dismiss(toastId);
      toast.success(`Đã tải ${rows.length} dòng Excel (đã gộp mọi trang từ server).`);
    } catch (err) {
      console.error('Export DonChia CSKH Excel:', err);
      toast.dismiss(toastId);
      toast.error(err?.message || 'Lỗi khi xuất Excel');
    } finally {
      setExportingExcel(false);
    }
  };

  // Handle sort
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Handle cell change for editable columns
  const handleCellChange = async (orderId, columnName, newValue) => {
    if (!orderId) {
      toast.error("Không tìm thấy ID đơn hàng");
      return;
    }

    try {
      // Map column name to database column
      const dbColumnMap = {
        'Trạng thái cskh': 'cskh_status',
        'CSKH': 'cskh',
      };
      
      const dbColumn = dbColumnMap[columnName] || columnName.toLowerCase().replace(/\s+/g, '_');
      
      const { error } = await supabase
        .from(ordersTableName)
        .update({ [dbColumn]: newValue })
        .eq('id', orderId);

      if (error) throw error;

      // Update local state
      setAllData(prev => prev.map(item => {
        if (item.id === orderId) {
          const next = { ...item, [columnName]: newValue };
          if (columnName === 'Trạng thái cskh') {
            next.cskh_status = newValue != null ? String(newValue) : '';
          }
          if (columnName === 'CSKH') {
            next._cskh_raw = newValue != null ? String(newValue) : '';
          }
          return next;
        }
        return item;
      }));

      setAllMappedData(prev => prev.map(item => {
        if (item.id === orderId) {
          const next = { ...item, [columnName]: newValue };
          if (columnName === 'Trạng thái cskh') {
            next.cskh_status = newValue != null ? String(newValue) : '';
          }
          if (columnName === 'CSKH') {
            next._cskh_raw = newValue != null ? String(newValue) : '';
          }
          return next;
        }
        return item;
      }));

      toast.success("✅ Đã cập nhật thành công!");
    } catch (error) {
      console.error("Update cell error:", error);
      toast.error("❌ Lỗi cập nhật: " + error.message);
    }
  };

  // Copy single cell content (double-click)
  const handleCellClick = async (e, value) => {
    const textValue = String(value ?? '').trim();
    if (!textValue || textValue === '-') {
      toast.info("⚠️ Ô này không có nội dung", { autoClose: 1500, hideProgressBar: true });
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

  // Handle column visibility toggle
  const toggleColumn = (column) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  // Select all columns
  const selectAllColumns = () => {
    const all = {};
    allAvailableColumns.forEach(col => {
      all[col] = true;
    });
    setVisibleColumns(all);
  };

  // Deselect all columns
  const deselectAllColumns = () => {
    const none = {};
    allAvailableColumns.forEach(col => {
      none[col] = false;
    });
    setVisibleColumns(none);
  };

  // Reset to default columns
  const resetToDefault = () => {
    const defaultCols = {};
    defaultColumns.forEach(col => {
      defaultCols[col] = true;
    });
    setVisibleColumns(defaultCols);
  };

  // Check if current user has permission to edit/delete based on selected_personnel or admin role
  const canEditDeleteOrder = async (cskhName) => {
    // Admin can always edit/delete
    if (isAdmin()) {
      console.log('🔐 [DonChiaCSKH] User is admin, granting edit/delete permission');
      return true;
    }

    // Non-admin: check if current user is in CSKH person's selected_personnel
    if (!cskhName || !currentUserEmail) {
      console.log('⚠️ [DonChiaCSKH] Missing CSKH name or current user email');
      return false;
    }

    try {
      // Check cache first
      if (cskhPersonnelCache[cskhName]) {
        const selectedPersonnel = cskhPersonnelCache[cskhName];
        const hasPermission = isUserInPersonnelList(selectedPersonnel);
        console.log(`🔍 [DonChiaCSKH] Checking permission for CSKH "${cskhName}" (cached):`, { 
          selectedPersonnel, 
          currentUserEmail, 
          hasPermission 
        });
        return hasPermission;
      }

      // Fetch CSKH person's data from users table
      const { data, error } = await supabase
        .from('users')
        .select('selected_personnel')
        .ilike('name', cskhName)
        .single();

      if (error) {
        console.error('❌ [DonChiaCSKH] Error fetching CSKH data:', error);
        return false;
      }

      if (!data) {
        console.warn(`⚠️ [DonChiaCSKH] No user found for CSKH name: ${cskhName}`);
        return false;
      }

      // Cache the result
      setCSKHPersonnelCache(prev => ({
        ...prev,
        [cskhName]: data.selected_personnel
      }));

      const hasPermission = isUserInPersonnelList(data.selected_personnel);
      console.log(`🔍 [DonChiaCSKH] Checking permission for CSKH "${cskhName}":`, { 
        selectedPersonnel: data.selected_personnel, 
        currentUserEmail, 
        hasPermission 
      });
      return hasPermission;
    } catch (err) {
      console.error('❌ [DonChiaCSKH] Error checking permission:', err);
      return false;
    }
  };

  // Helper function to check if current user email is in personnel list
  const isUserInPersonnelList = (selectedPersonnel) => {
    if (!selectedPersonnel) return false;
    
    let personnelEmails = [];
    if (Array.isArray(selectedPersonnel)) {
      personnelEmails = selectedPersonnel;
    } else if (typeof selectedPersonnel === 'string') {
      personnelEmails = selectedPersonnel.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    }

    return personnelEmails.some(email => email.toLowerCase() === currentUserEmail.toLowerCase());
  };

  // Open Edit modal - Chỉ Admin hoặc người trong selected_personnel của CSKH mới được phép
  const openEditModal = async (order) => {
    const cskhName = order['CSKH'] || '';
    const hasPermission = await canEditDeleteOrder(cskhName);
    
    if (!hasPermission) {
      toast.error("❌ Bạn không có quyền sửa đơn hàng này! Chỉ Admin hoặc nhân sự được chọn của CSKH mới được phép.");
      return;
    }
    
    setEditingOrder({ ...order });
    setIsViewing(false);
    setIsEditModalOpen(true);
  };

  // Open View modal
  const openViewModal = (order) => {
    setEditingOrder({ ...order });
    setIsViewing(true);
    setIsEditModalOpen(true);
  };

  // Handle Input Change in Modal
  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditingOrder(prev => ({ ...prev, [name]: value }));
  };

  // Save Updates - Chỉ Admin mới được phép
  const handleUpdateOrder = async () => {
    if (!editingOrder) return;
    if (!isAdmin()) {
      return toast.error("Chỉ Admin mới có quyền sửa!");
    }

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from(ordersTableName)
        .update({
          customer_name: editingOrder.customer_name,
          customer_phone: editingOrder.customer_phone,
          customer_address: editingOrder.customer_address,
          country: editingOrder.country || editingOrder["Khu vực"], // Khu vực
          note: editingOrder.note,

          // Extended fields
          product: editingOrder.product,
          payment_method: editingOrder.payment_method, // or payment_method_text if needed, check schema
          delivery_status: editingOrder.delivery_status,
          total_amount_vnd: parseFloat(editingOrder.total_amount_vnd) || 0,
          tracking_code: editingOrder.tracking_code,
          // Add others if necessary based on schema
        })
        .eq('id', editingOrder.id);

      if (error) throw error;

      alert("✅ Cập nhật thành công!");

      // Update local list
      setAllData(prev => prev.map(item => item.id === editingOrder.id ? { ...item, ...editingOrder } : item));
      setIsEditModalOpen(false);
      setEditingOrder(null);

    } catch (err) {
      console.error("Update error:", err);
      alert("❌ Lỗi cập nhật: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const normCskh = (s) => String(s ?? '').trim().toLowerCase();

  /** Admin: xóa cột CSKH + Trạng thái cskh trên các đơn đang hiển thị sau bộ lọc (để điền lại). */
  const handleClearCskhBulkForTarget = async () => {
    if (!isStrictAdminForCskhClear()) {
      toast.error('Chỉ Admin mới được thao tác này.');
      return;
    }
    if (clearingCskhBulk) return;

    const ids = [
      ...new Set(
        filteredData
          .filter((row) => {
            if (!row.id) return false;
            const hasCskh = Boolean(normCskh(row['CSKH']));
            const hasStatus = Boolean(String(row['Trạng thái cskh'] ?? '').trim());
            return hasCskh || hasStatus;
          })
          .map((row) => row.id)
      ),
    ];

    if (ids.length === 0) {
      toast.info('Không có đơn nào trong bộ lọc hiện tại còn dữ liệu cột CSKH / Trạng thái cskh.');
      return;
    }

    if (
      !window.confirm(
        `Xóa hết cột CSKH (tên nhân sự + trạng thái cskh) cho ${ids.length} đơn đang khớp bộ lọc?\n` +
          'Hai cột sẽ để trống để bạn điền lại. Thao tác không hoàn tác tự động.'
      )
    ) {
      return;
    }

    setClearingCskhBulk(true);
    try {
      const chunkSize = 500;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { error: upErr } = await supabase
          .from(ordersTableName)
          .update({ cskh: null, cskh_status: null })
          .in('id', chunk);
        if (upErr) throw upErr;
      }

      const idSet = new Set(ids);
      const wipeLocal = (row) => {
        if (!idSet.has(row.id)) return row;
        return {
          ...row,
          CSKH: '',
          'Trạng thái cskh': '',
          cskh_status: '',
          _cskh_raw: '',
        };
      };
      setAllData((prev) => prev.map(wipeLocal));
      setAllMappedData((prev) => prev.map(wipeLocal));

      toast.success(`Đã xóa hết cột CSKH trên ${ids.length} đơn (theo bộ lọc).`);
      await loadData();
    } catch (err) {
      console.error('Clear CSKH bulk:', err);
      toast.error(err?.message || 'Lỗi khi xóa cột CSKH');
    } finally {
      setClearingCskhBulk(false);
    }
  };

  // Handle Delete - Chỉ Admin hoặc người trong selected_personnel của CSKH mới được phép
  const handleDelete = async (id) => {
    // Find the order to get CSKH name
    const order = allData.find(item => item.id === id);
    if (!order) {
      toast.error("Không tìm thấy đơn hàng!");
      return;
    }

    const cskhName = order['CSKH'] || '';
    const hasPermission = await canEditDeleteOrder(cskhName);
    
    if (!hasPermission) {
      toast.error("❌ Bạn không có quyền xóa đơn hàng này! Chỉ Admin hoặc nhân sự được chọn của CSKH mới được phép.");
      return;
    }
    
    if (!window.confirm("Bạn có chắc chắn muốn xóa đơn hàng này? Hành động này không thể hoàn tác!")) return;

    try {
      const { error } = await supabase.from(ordersTableName).delete().eq('id', id);
      if (error) throw error;

      alert("✅ Đã xóa đơn hàng thành công!");
      // Update UI locally to avoid reload
      setAllData(prev => prev.filter(item => item.id !== id));
    } catch (error) {
      console.error("Delete error:", error);
      alert("❌ Lỗi xóa đơn: " + error.message);
    }
  };

  if (!canAccessPage) {
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này ({accessPermissionCodes.join(', ')}).
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
                <h1 className="text-xl font-bold text-gray-800">{pageTitle}</h1>
                <p className="text-xs text-gray-500">{pageSubtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                <span className={`h-2 w-2 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-sm text-gray-600">
                  {filteredData.length} / {allData.length} đơn hàng
                </span>
              </div>
              <button
                type="button"
                onClick={handleExportDonChiaExcel}
                disabled={loading || exportingExcel || filteredData.length === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                title={`Excel: ${ordersTableName}.order_code → Mã đơn hàng; ${ordersTableName}.cskh_status → Trạng thái CSKH. Tải đủ trang từ server, áp dụng bộ lọc trên trang.`}
              >
                {exportingExcel ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {exportingExcel ? 'Đang xuất...' : 'Tải Excel'}
              </button>
              <button
                onClick={loadData}
                disabled={loading}
                className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {loading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {loading ? 'Đang tải...' : 'Tải lại'}
              </button>
              {isStrictAdminForCskhClear() && (
                <button
                  type="button"
                  onClick={handleClearCskhBulkForTarget}
                  disabled={loading || clearingCskhBulk}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                  title="Chỉ Admin: xóa hết cột CSKH + Trạng thái cskh trên các đơn đang khớp bộ lọc (để điền lại)"
                >
                  {clearingCskhBulk ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {clearingCskhBulk ? 'Đang xử lý...' : 'Xóa hết cột CSKH'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-full mx-auto px-6 py-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <div className="space-y-4">
            {/* Top Row: Search and Date Filters */}
            <div className="flex flex-wrap items-end gap-4">
              {/* Search */}
              <div className="flex-1 min-w-[300px]">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tìm kiếm</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Tìm kiếm trong tất cả các cột..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </div>
              </div>

              {/* Month Filter */}
              <div className="min-w-[120px]">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tháng:</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={filterMonth}
                  onChange={(e) => {
                    setFilterMonth(e.target.value);
                    if (e.target.value) {
                      const year = filterYear;
                      const month = parseInt(e.target.value);
                      const start = new Date(year, month - 1, 1);
                      const end = new Date(year, month, 0);
                      setStartDate(start.toISOString().split('T')[0]);
                      setEndDate(end.toISOString().split('T')[0]);
                    }
                  }}
                >
                  <option value="">Tất cả</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                    <option key={m} value={m}>Tháng {m}</option>
                  ))}
                </select>
              </div>

              {/* Year Filter */}
              <div className="min-w-[100px]">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Năm:</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={filterYear}
                  onChange={(e) => {
                    setFilterYear(Number(e.target.value));
                    if (filterMonth) {
                      const year = Number(e.target.value);
                      const month = parseInt(filterMonth);
                      const start = new Date(year, month - 1, 1);
                      const end = new Date(year, month, 0);
                      setStartDate(start.toISOString().split('T')[0]);
                      setEndDate(end.toISOString().split('T')[0]);
                    }
                  }}
                />
              </div>

              {/* From Date */}
              <div className="min-w-[150px]">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Từ ngày:</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setFilterMonth('');
                  }}
                />
              </div>

              {/* To Date */}
              <div className="min-w-[150px]">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Đến ngày:</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setFilterMonth('');
                  }}
                />
              </div>

              {/* Market Filter - Checkbox */}
              <div className="min-w-[180px] relative">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Khu vực</label>
                <button
                  type="button"
                  onClick={() => setOpenDropdowns({...openDropdowns, market: !openDropdowns.market})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterMarket.length === 0 ? 'Tất cả' : `${filterMarket.length} đã chọn`}
                  </span>
                  <span className="ml-2">{openDropdowns.market ? '▲' : '▼'}</span>
                </button>
                {openDropdowns.market && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      {uniqueMarkets.map(market => (
                        <label key={market} className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer rounded">
                          <input
                            type="checkbox"
                            checked={filterMarket.includes(market)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilterMarket([...filterMarket, market]);
                              } else {
                                setFilterMarket(filterMarket.filter(v => v !== market));
                              }
                            }}
                            className="mr-2"
                          />
                          <span className="text-sm">{market}</span>
                        </label>
                      ))}
                      <div className="border-t mt-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterMarket([]);
                            setOpenDropdowns({...openDropdowns, market: false});
                          }}
                          className="w-full text-xs text-blue-600 hover:text-blue-800 py-1"
                        >
                          Xóa tất cả
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Product Filter - Checkbox */}
              <div className="min-w-[180px] relative">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Mặt hàng</label>
                <button
                  type="button"
                  onClick={() => setOpenDropdowns({...openDropdowns, product: !openDropdowns.product})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterProduct.length === 0 ? 'Tất cả' : `${filterProduct.length} đã chọn`}
                  </span>
                  <span className="ml-2">{openDropdowns.product ? '▲' : '▼'}</span>
                </button>
                {openDropdowns.product && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      {uniqueProducts.map(product => (
                        <label key={product} className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer rounded">
                          <input
                            type="checkbox"
                            checked={filterProduct.includes(product)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilterProduct([...filterProduct, product]);
                              } else {
                                setFilterProduct(filterProduct.filter(v => v !== product));
                              }
                            }}
                            className="mr-2"
                          />
                          <span className="text-sm">{product}</span>
                        </label>
                      ))}
                      <div className="border-t mt-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterProduct([]);
                            setOpenDropdowns({...openDropdowns, product: false});
                          }}
                          className="w-full text-xs text-blue-600 hover:text-blue-800 py-1"
                        >
                          Xóa tất cả
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Filter - Checkbox */}
              <div className="min-w-[180px] relative">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Trạng thái</label>
                <button
                  type="button"
                  onClick={() => setOpenDropdowns({...openDropdowns, status: !openDropdowns.status})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterStatus.length === 0 ? 'Tất cả' : `${filterStatus.length} đã chọn`}
                  </span>
                  <span className="ml-2">{openDropdowns.status ? '▲' : '▼'}</span>
                </button>
                {openDropdowns.status && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      {uniqueStatuses.map(status => (
                        <label key={status} className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer rounded">
                          <input
                            type="checkbox"
                            checked={filterStatus.includes(status)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilterStatus([...filterStatus, status]);
                              } else {
                                setFilterStatus(filterStatus.filter(v => v !== status));
                              }
                            }}
                            className="mr-2"
                          />
                          <span className="text-sm">{status}</span>
                        </label>
                      ))}
                      <div className="border-t mt-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterStatus([]);
                            setOpenDropdowns({...openDropdowns, status: false});
                          }}
                          className="w-full text-xs text-blue-600 hover:text-blue-800 py-1"
                        >
                          Xóa tất cả
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Check Result Filter - Checkbox */}
              <div className="min-w-[180px] relative">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Kết quả Check</label>
                <button
                  type="button"
                  onClick={() => setOpenDropdowns({...openDropdowns, checkResult: !openDropdowns.checkResult})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterCheckResult.length === 0 ? 'Tất cả' : `${filterCheckResult.length} đã chọn`}
                  </span>
                  <span className="ml-2">{openDropdowns.checkResult ? '▲' : '▼'}</span>
                </button>
                {openDropdowns.checkResult && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      {uniqueCheckResults.map(checkResult => (
                        <label key={checkResult} className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer rounded">
                          <input
                            type="checkbox"
                            checked={filterCheckResult.includes(checkResult)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilterCheckResult([...filterCheckResult, checkResult]);
                              } else {
                                setFilterCheckResult(filterCheckResult.filter(v => v !== checkResult));
                              }
                            }}
                            className="mr-2"
                          />
                          <span className="text-sm">{checkResult}</span>
                        </label>
                      ))}
                      <div className="border-t mt-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterCheckResult([]);
                            setOpenDropdowns({...openDropdowns, checkResult: false});
                          }}
                          className="w-full text-xs text-blue-600 hover:text-blue-800 py-1"
                        >
                          Xóa tất cả
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* CSKH Filter - Checkbox */}
              <div className="min-w-[180px] relative">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">CSKH</label>
                <button
                  type="button"
                  onClick={() => setOpenDropdowns({...openDropdowns, cskh: !openDropdowns.cskh})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterCSKH.length === 0 ? 'Tất cả' : `${filterCSKH.length} đã chọn`}
                  </span>
                  <span className="ml-2">{openDropdowns.cskh ? '▲' : '▼'}</span>
                </button>
                {openDropdowns.cskh && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <label className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer rounded">
                        <input
                          type="checkbox"
                          checked={filterCSKH.includes('__EMPTY__')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFilterCSKH([...filterCSKH, '__EMPTY__']);
                            } else {
                              setFilterCSKH(filterCSKH.filter(v => v !== '__EMPTY__'));
                            }
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm">Trống</span>
                      </label>
                      {uniqueCSKH.map(cskh => (
                        <label key={cskh} className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer rounded">
                          <input
                            type="checkbox"
                            checked={filterCSKH.includes(cskh)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilterCSKH([...filterCSKH, cskh]);
                              } else {
                                setFilterCSKH(filterCSKH.filter(v => v !== cskh));
                              }
                            }}
                            className="mr-2"
                          />
                          <span className="text-sm">{cskh}</span>
                        </label>
                      ))}
                      <div className="border-t mt-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterCSKH([]);
                            setOpenDropdowns({...openDropdowns, cskh: false});
                          }}
                          className="w-full text-xs text-blue-600 hover:text-blue-800 py-1"
                        >
                          Xóa tất cả
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Trạng thái CSKH Filter - Checkbox */}
              <div className="min-w-[180px] relative">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Trạng thái CSKH</label>
                <button
                  type="button"
                  onClick={() => setOpenDropdowns({...openDropdowns, trangThai: !openDropdowns.trangThai})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterTrangThai.length === 0 ? 'Tất cả' : `${filterTrangThai.length} đã chọn`}
                  </span>
                  <span className="ml-2">{openDropdowns.trangThai ? '▲' : '▼'}</span>
                </button>
                {openDropdowns.trangThai && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <label className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer rounded">
                        <input
                          type="checkbox"
                          checked={filterTrangThai.includes('__EMPTY__')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFilterTrangThai([...filterTrangThai, '__EMPTY__']);
                            } else {
                              setFilterTrangThai(filterTrangThai.filter(v => v !== '__EMPTY__'));
                            }
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm">Trống</span>
                      </label>
                      {uniqueTrangThaiCSKH.map(status => (
                        <label key={status} className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer rounded">
                          <input
                            type="checkbox"
                            checked={filterTrangThai.includes(status)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilterTrangThai([...filterTrangThai, status]);
                              } else {
                                setFilterTrangThai(filterTrangThai.filter(v => v !== status));
                              }
                            }}
                            className="mr-2"
                          />
                          <span className="text-sm">{status}</span>
                        </label>
                      ))}
                      <div className="border-t mt-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterTrangThai([]);
                            setOpenDropdowns({...openDropdowns, trangThai: false});
                          }}
                          className="w-full text-xs text-blue-600 hover:text-blue-800 py-1"
                        >
                          Xóa tất cả
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Settings Button */}
              <button
                onClick={() => setShowColumnSettings(true)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Cài đặt cột
              </button>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportDonChiaExcel}
                  disabled={loading || exportingExcel || filteredData.length === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                  title={`Excel: ${ordersTableName}.order_code → Mã đơn hàng; ${ordersTableName}.cskh_status → Trạng thái CSKH. Tải đủ trang từ server, áp dụng bộ lọc trên trang.`}
                >
                  {exportingExcel ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {exportingExcel ? 'Đang xuất...' : 'Tải Excel'}
                </button>
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
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

            {/* Quick Time Filters */}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-bold text-green-600 mb-2">⚡ Lọc nhanh theo thời gian</h3>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Hôm nay', value: 'today' },
                  { label: 'Hôm qua', value: 'yesterday' },
                  { label: 'Tuần này', value: 'this-week' },
                  { label: 'Tuần trước', value: 'last-week' },
                  { label: 'Tháng này', value: 'this-month' },
                  { label: 'Xóa lọc', value: 'clear' }
                ].map(f => (
                  <button
                    key={f.value}
                    onClick={() => {
                      if (f.value === 'clear') {
                        setStartDate('');
                        setEndDate('');
                        setFilterMonth('');
                      } else {
                        handleQuickFilter(f.value);
                      }
                    }}
                    className="px-3 py-1.5 border border-gray-300 rounded text-xs font-medium hover:bg-green-600 hover:text-white hover:border-green-600 transition-colors"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Summary Statistics Bar */}
        <div className="bg-green-600 text-white rounded-lg shadow-sm p-4 mb-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-sm font-semibold mb-1">Tổng số đơn</div>
              <div className="text-2xl font-bold">{summary.totalDon.toLocaleString('vi-VN')} đơn</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold mb-1">Tổng tiền VNĐ</div>
              <div className="text-2xl font-bold">{summary.totalTongTien.toLocaleString('vi-VN')} ₫</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold mb-1">Số đơn của CSKH</div>
              <div className="text-2xl font-bold">{summary.soDonCSKH.toLocaleString('vi-VN')} đơn</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold mb-1">Số đơn được chia</div>
              <div className="text-2xl font-bold">{summary.soDonDuocChia.toLocaleString('vi-VN')} đơn</div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {displayColumns.map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort(col)}
                    >
                      <div className="flex items-center gap-2">
                        {getDisplayColumnName(col)}
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
                    <td colSpan={displayColumns.length} className="px-4 py-8 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin h-5 w-5 border-2 border-[#F37021] border-t-transparent rounded-full"></div>
                        Đang tải dữ liệu...
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={displayColumns.length} className="px-4 py-8 text-center text-gray-500">
                      Không có dữ liệu phù hợp
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((row, index) => (
                    <tr
                      key={row[PRIMARY_KEY_COLUMN] || index}
                      onClick={() => setSelectedRowId(row.id)}
                      className={`cursor-pointer transition-colors ${selectedRowId === row.id ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-gray-50'}`}
                    >
                      {displayColumns.map((col) => {
                        // Priority: Check if row has exact key 'col'. If not, try COLUMN_MAPPING.
                        // This prevents COLUMN_MAPPING from overriding our manually mapped friendly keys.
                        let value = row[col];

                        // Đặc biệt: CSKH chỉ lấy từ cột cskh trong database (đã được map trong mappedData)
                        if (col === 'CSKH') {
                          // row['CSKH'] đã được map từ item.cskh trong database
                          value = row['CSKH'];
                          // Đảm bảo là string và trim
                          value = value ? String(value).trim() : '';
                        } else if (col === 'Mã Tracking') {
                          value = row['Mã Tracking'] ?? row.tracking_code;
                        } else if (col === 'Kết quả Check') {
                          value = row['Kết quả Check'] ?? row.check_result;
                        } else if (col === 'Trạng thái thu tiền') {
                          value = row['Trạng thái thu tiền'] ?? row.payment_status_detail ?? row.payment_status;
                        } else if (value === undefined || value === null) {
                          const key = COLUMN_MAPPING[col];
                          if (key) value = row[key];
                        }

                        value = value ?? '';

                        // Format date
                        if (col.includes('Ngày') || col.includes('Time') || col === 'order_date') {
                          value = formatDate(value);
                        }

                        // Format money
                        if (['Tổng tiền VNĐ', 'Tiền Hàng', 'Phí ship', 'Phí Chung'].includes(col)) {
                          const num = parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
                          value = num.toLocaleString('vi-VN') + ' ₫';
                        }

                        // Admin: cho phép chỉnh CSKH trực tiếp bằng dropdown.
                        if (col === 'CSKH' && isAdmin()) {
                          return (
                            <td
                              key={col}
                              className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <select
                                value={value || ''}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  handleCellChange(row.id, col, newValue);
                                }}
                                className="w-full min-w-[180px] px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                              >
                                <option value="">(Trống)</option>
                                {uniqueCSKH.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        }

                        // Render editable cell for "Trạng thái cskh" with dropdown
                        if (col === 'Trạng thái cskh' && EDITABLE_COLS.includes(col)) {
                          const dropdownOptions = DROPDOWN_OPTIONS[col] || [];
                          return (
                            <td
                              key={col}
                              className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <select
                                value={value || ''}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  handleCellChange(row.id, col, newValue);
                                }}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                              >
                                {dropdownOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option || '(Trống)'}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={col}
                            className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap hover:bg-blue-50 select-text"
                            title={`${value || '-'} (Double-click để copy)`}
                            onDoubleClick={(e) => handleCellClick(e, value)}
                          >
                            {value || '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))
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
                <option value="0">Tất cả</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
                <option value="1000">1000</option>
                <option value="5000">5000</option>
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
      </div>

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
        getDisplayColumnName={getDisplayColumnName}
      />
      {/* Edit/View Modal for CSKH */}
      {isEditModalOpen && editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  {isViewing ? "Chi tiết đơn hàng" : "Chỉnh sửa thông tin CSKH"}
                </h2>
                <p className="text-sm text-gray-500">Mã đơn: <span className="font-mono font-bold text-blue-600">{editingOrder.order_code}</span></p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">

              {/* Section 1: Thông tin khách hàng */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-3 border-b pb-2">1. Thông tin khách hàng</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên khách hàng</label>
                    <input
                      name="customer_name"
                      value={editingOrder.customer_name || ''}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                    <input
                      name="customer_phone"
                      value={editingOrder.customer_phone || ''}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
                  <input
                    name="customer_address"
                    value={editingOrder.customer_address || ''}
                    onChange={handleEditChange}
                    readOnly={isViewing}
                    disabled={isViewing}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Khu vực</label>
                    <input
                      name="country"
                      value={editingOrder.country || editingOrder["Khu vực"] || ''}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Thông tin đơn hàng */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-3 border-b pb-2">2. Thông tin đơn hàng</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mặt hàng chính</label>
                    <select
                      name="product"
                      value={editingOrder.product || ''}
                      onChange={handleEditChange}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 bg-white ${isViewing ? 'bg-gray-100' : ''}`}
                    >
                      <option value="">-- Chọn mặt hàng --</option>
                      {uniqueProducts.map(product => (
                        <option key={product} value={product}>
                          {product}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tổng tiền (VNĐ)</label>
                    <input
                      name="total_amount_vnd"
                      type="number"
                      value={editingOrder.total_amount_vnd || 0}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 font-bold text-red-600 ${isViewing ? 'bg-gray-100' : ''}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hình thức thanh toán</label>
                    <select
                      name="payment_method"
                      value={editingOrder.payment_method || ''}
                      onChange={handleEditChange}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                    >
                      <option value="">-- Chọn --</option>
                      <option value="COD">COD (Thu hộ)</option>
                      <option value="CK">Chuyển khoản</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Trạng thái & Vận chuyển */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-3 border-b pb-2">3. Trạng thái & Vận chuyển</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mã Tracking</label>
                    <input
                      name="tracking_code"
                      value={editingOrder.tracking_code || ''}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 font-mono ${isViewing ? 'bg-gray-100' : ''}`}
                      placeholder="Nhập mã vận đơn..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái giao hàng</label>
                    <input
                      name="delivery_status"
                      value={editingOrder.delivery_status || ''}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                      placeholder="Ví dụ: Đã giao, Đang vận chuyển..."
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú CSKH</label>
                <textarea
                  name="note"
                  rows={3}
                  value={editingOrder.note || ''}
                  onChange={handleEditChange}
                  readOnly={isViewing}
                  disabled={isViewing}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                  placeholder="Nhập ghi chú..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                disabled={isUpdating}
              >
                {isViewing ? "Đóng" : "Hủy bỏ"}
              </button>

              {!isViewing && (
                <button
                  onClick={handleUpdateOrder}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2"
                >
                  {isUpdating && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {isUpdating ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DonChiaCSKH;
