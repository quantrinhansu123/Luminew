import { Edit, Eye, RefreshCw, Search, Settings, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import ColumnSettingsModal from '../components/ColumnSettingsModal';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../supabase/config';
import { COLUMN_MAPPING, PRIMARY_KEY_COLUMN } from '../types';

function QuanLyCSKH() {
  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const navigate = useNavigate();
  const { canView, canEdit, canDelete, role } = usePermissions();

  const [allData, setAllData] = useState([]);

  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [searchOrderCode, setSearchOrderCode] = useState(''); // Tìm kiếm riêng theo mã đơn hàng
  const [debouncedSearchOrderCode, setDebouncedSearchOrderCode] = useState('');
  const [filterMarket, setFilterMarket] = useState([]);
  const [filterProduct, setFilterProduct] = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);
  const [filterSale, setFilterSale] = useState([]); // Filter by NV Sale (multi-select checkbox)
  const [filterMKT, setFilterMKT] = useState([]); // Filter by MKT (multi-select checkbox)
  const [showSaleFilter, setShowSaleFilter] = useState(false);
  const [showMKTFilter, setShowMKTFilter] = useState(false);

  // Date state - default to last 3 days
  // Helper function để format date theo LOCAL time (tránh lỗi timezone trên Vercel)
  const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return formatLocalDate(d);
  });
  const [endDate, setEndDate] = useState(() => formatLocalDate(new Date()));

  const [quickFilter, setQuickFilter] = useState('today');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState(null);

  // --- Edit Modal State (must be before early return) ---
  const [editingOrder, setEditingOrder] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

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
    'Mã Tracking',
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
    'team': 'Team',
    'sale_staff': 'Nhân viên Sale',
    'marketing_staff': 'Nhân viên Marketing',
    'delivery_staff': 'Nhân viên Vận đơn',
    'note': 'Ghi chú',
    'reason': 'Lý do',
    'payment_status': 'Trạng thái thanh toán',
    'payment_status_detail': 'Trạng thái thu tiền',
    'check_result': 'Kết quả Check',
    'vandon_note': 'Ghi chú vận đơn',
    'shipping_fee': 'Phí ship',
    'shipping_unit': 'Đơn vị vận chuyển',
    'shipping_carrier': 'Đơn vị vận chuyển',
    'goods_amount': 'Giá bán',
    'sale_price': 'Giá bán',
    'general_fee': 'Phí chung',
    'flight_fee': 'Phí bay',
    'account_rental_fee': 'Thuê TK',
    'warehouse_fee': 'Phí xử lý đơn đóng hàng-Lưu kho(usd)',
    'estimated_delivery_date': 'Thời gian giao dự kiến',
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

  // Debounce search text for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Debounce search order code
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchOrderCode(searchOrderCode);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchOrderCode]);

  // Helper function để kiểm tra xem tên cột có phải là tiếng Anh không (cột DB gốc)
  const isEnglishColumn = (columnName) => {
    // Giữ lại các cột đặc biệt đã được sử dụng trong hệ thống
    const specialColumns = ['Name*', 'Phone*', 'Add', 'City', 'State', 'Zipcode', 'Team', 'CSKH'];
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

  // Default columns


  // Load column visibility from localStorage or use defaults
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('quanLyCSKH_visibleColumns');
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

      // Ensure default columns are present
      defaultColumns.forEach(col => {
        if (updated[col] === undefined) {
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
      localStorage.setItem('quanLyCSKH_visibleColumns', JSON.stringify(cleaned));
    }
  }, [visibleColumns]);

  // Load data from Supabase with date filter
  const loadData = async () => {
    if (!startDate || !endDate) return;

    setLoading(true);
    try {
      console.log('Loading orders from Supabase (Date Range)...');

      // Get user info for permission
      const userJson = localStorage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;      
      // Fetch username from multiple possible sources
      const userEmail = localStorage.getItem("userEmail") || (user?.Email || user?.email || "").toString().toLowerCase().trim();
      const userName = localStorage.getItem("username") || (user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || user?.name || user?.fullName || "").toString().trim();
      const boPhan = (user?.['Bộ_phận'] || user?.['Bộ phận'] || "").toString().trim().toLowerCase();
      const viTri = (user?.['Vị_trí'] || user?.['Vị trí'] || "").toString().trim().toLowerCase();

      const ADMIN_MAIL = "admin@marketing.com";
      const isAdmin = userEmail === ADMIN_MAIL || boPhan === 'admin';
      const isLeader = viTri.includes('leader') || viTri.includes('quản lý') || boPhan.includes('manager');
      const roleLower = (role || '').toLowerCase();
      const isManager = isAdmin || isLeader || roleLower === 'admin' || roleLower === 'super_admin' || roleLower === 'finance';

      let query = supabase.from('orders').select('*');

      // Date Filter Logic
      // Date Filter Logic (Aligned with DanhSachDon)
      if (startDate) {
        query = query.gte('order_date', startDate);
      }
      if (endDate) {
        query = query.lte('order_date', endDate);
      }

      query = query.order('order_date', { ascending: false });

      // --- USER ISOLATION FILTER (CSKH) ---
      // Khớp với các cột: Nhân viên Sale, Nhân viên MKT, Nhân viên Vận đơn
      // => Dùng các field trong bảng orders: sale_staff, marketing_staff, delivery_staff
      if (!isManager) {
        const ownName = (userName || '').trim();
        if (ownName) {
          const pattern = `%${ownName}%`;
          const orConditions = [
            `sale_staff.ilike.${pattern}`,
            `marketing_staff.ilike.${pattern}`,
            `delivery_staff.ilike.${pattern}`
          ];

          console.log('🔍 [CSKH] Filtering by current user name (Sale/MKT/Vận đơn):', ownName);
          try {
            query = query.or(orConditions.join(','));
            console.log('✅ [CSKH] Applied current user OR filter:', orConditions.join(','));
          } catch (orError) {
            console.error('❌ [CSKH] Error applying current user OR filter, falling back to sale_staff:', orError);
            query = query.ilike('sale_staff', pattern);
          }
        } else {
          // Không lấy được tên user hiện tại: không hiển thị đơn nào để tránh lộ dữ liệu
          console.warn('⚠️ [CSKH] Missing current user name, returning empty result');
          query = query.eq('id', '00000000-0000-0000-0000-000000000000'); // Return no results
        }
      } else {
        // Admin/Manager: xem tất cả đơn (filter sẽ được áp dụng ở client-side)
        console.log('✅ [CSKH] Admin/Manager: viewing all orders (filters applied client-side)');
      }

      const { data, error } = await query;

      if (error) throw error;

      // Tự động lấy danh sách các cột DB đã được map sang tên thân thiện (để loại bỏ trùng lặp)
      const mappedDbColumns = new Set([
        ...Object.keys(COLUMN_DISPLAY_NAMES), // Tất cả các keys từ COLUMN_DISPLAY_NAMES
        'created_at', // Thêm các cột khác có thể được dùng nhưng không có trong mapping
        'updated_at',
        'id'
      ]);

      const mappedData = (data || []).map(item => {
        // Tạo object với các cột friendly name (đầy đủ như BaoCaoChiTiet)
        const friendlyData = {
          "Mã đơn hàng": item.order_code,
          "Ngày lên đơn": item.order_date || item.created_at?.split('T')[0],
          "Name*": item.customer_name,
          "Phone*": item.customer_phone,
          "Add": item.customer_address,
          "City": item.city,
          "State": item.state,
          "Khu vực": item.country,
          "Zipcode": item.zipcode,
          "Mặt hàng": item.product_main || item.product,
          "Tên mặt hàng 1": item.product_name_1 || item.product_main || item.product,
          "Tổng tiền VNĐ": item.total_amount_vnd,
          "Loại tiền": item.payment_type,
          "Hình thức thanh toán": item.payment_method_text || item.payment_method,
          "Mã Tracking": item.tracking_code,
          "Nhân viên Marketing": item.marketing_staff,
          "Nhân viên Sale": item.sale_staff,
          "Team": item.team,
          "Trạng thái giao hàng": item.delivery_status,
          "Kết quả Check": item.payment_status,
          "Ghi chú": item.note,
          "CSKH": item.cskh,
          "NV Vận đơn": item.delivery_staff,
          "Tiền Việt đã đối soát": item.reconciled_vnd || item.reconciled_amount,
          "Đơn vị vận chuyển": item.shipping_unit || item.shipping_carrier,
          "Kế toán xác nhận thu tiền về": item.accountant_confirm,
          "Trạng thái thu tiền": item.payment_status_detail,
          "Lý do": item.reason,
          "Page": item.page_name,
        };

        // Loại bỏ tất cả các cột tiếng Anh (snake_case, camelCase) - chỉ giữ cột tiếng Việt
        // Không thêm bất kỳ cột nào từ DB nếu chưa được map sang tiếng Việt

        return friendlyData;
      });

      setAllData(mappedData);
      console.log(`✅ [CSKH] Loaded ${mappedData.length} orders`);

    } catch (error) {
      console.error('❌ [CSKH] Load data error:', {
        error,
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        startDate,
        endDate,
        isManager,
        userName
      });

      // User-friendly error message
      const errorMessage = error?.message || 'Lỗi không xác định';
      const isRLSError = errorMessage.includes('row-level security') || errorMessage.includes('RLS');
      const isPermissionError = errorMessage.includes('permission') || errorMessage.includes('quyền');

      if (isRLSError || isPermissionError) {
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
  }, [startDate, endDate, role]);



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

  // Get unique Sale staff names from data
  const uniqueSale = useMemo(() => {
    const sales = new Set();
    let hasEmpty = false;
    allData.forEach(row => {
      const sale = row["Nhân viên Sale"];
      if (sale && String(sale).trim()) {
        sales.add(String(sale).trim());
      } else {
        hasEmpty = true;
      }
    });
    const sortedSales = Array.from(sales).sort();
    if (hasEmpty) {
      return ['(Trống)', ...sortedSales];
    }
    return sortedSales;
  }, [allData]);

  // Get unique Marketing staff names from data
  const uniqueMKT = useMemo(() => {
    const mkts = new Set();
    let hasEmpty = false;
    allData.forEach(row => {
      const mkt = row["Nhân viên Marketing"];
      if (mkt && String(mkt).trim()) {
        mkts.add(String(mkt).trim());
      } else {
        hasEmpty = true;
      }
    });
    const sortedMKTs = Array.from(mkts).sort();
    if (hasEmpty) {
      return ['(Trống)', ...sortedMKTs];
    }
    return sortedMKTs;
  }, [allData]);

  // Handle quick filter
  const handleQuickFilter = (value) => {
    setQuickFilter(value);
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

    setStartDate(formatLocalDate(start));
    setEndDate(formatLocalDate(end));
  };

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = [...allData];

    // Search filter by order code (priority - exact match)
    if (debouncedSearchOrderCode) {
      const orderCodeLower = debouncedSearchOrderCode.trim().toLowerCase();
      data = data.filter(row => {
        const orderCode = String(row["Mã đơn hàng"] || '').toLowerCase();
        return orderCode.includes(orderCodeLower);
      });
    }

    // Search filter (using debounced value) - only if order code search is empty
    if (!debouncedSearchOrderCode && debouncedSearchText) {
      const searchLower = debouncedSearchText.toLowerCase();
      data = data.filter(row => {
        return (
          String(row["Mã đơn hàng"] || '').toLowerCase().includes(searchLower) ||
          String(row["Name*"] || '').toLowerCase().includes(searchLower) ||
          String(row["Phone*"] || '').toLowerCase().includes(searchLower) ||
          String(row["Mã Tracking"] || '').toLowerCase().includes(searchLower)
        );
      });
    }

    // Market filter
    if (filterMarket.length > 0) {
      data = data.filter(row => {
        const market = row["Khu vực"] || row["khu vực"];
        return filterMarket.includes(String(market).trim());
      });
    }

    // Product filter
    if (filterProduct.length > 0) {
      data = data.filter(row => {
        const product = row["Mặt hàng"];
        return filterProduct.includes(String(product).trim());
      });
    }

    // Status filter
    if (filterStatus.length > 0) {
      data = data.filter(row => {
        const status = row["Trạng thái giao hàng"];
        return filterStatus.includes(String(status).trim());
      });
    }

    // Sale filter - Multi-select checkbox
    if (filterSale.length > 0) {
      data = data.filter(row => {
        const sale = row["Nhân viên Sale"];
        const saleStr = sale ? String(sale).trim() : '';

        // Kiểm tra nếu có chọn "(Trống)"
        if (filterSale.includes('(Trống)')) {
          if (!saleStr) return true; // Nếu giá trị trống và đã chọn "(Trống)"
        }

        // Kiểm tra các giá trị khác
        return filterSale.includes(saleStr);
      });
    }

    // MKT filter - Multi-select checkbox
    if (filterMKT.length > 0) {
      data = data.filter(row => {
        const mkt = row["Nhân viên Marketing"];
        const mktStr = mkt ? String(mkt).trim() : '';

        // Kiểm tra nếu có chọn "(Trống)"
        if (filterMKT.includes('(Trống)')) {
          if (!mktStr) return true; // Nếu giá trị trống và đã chọn "(Trống)"
        }

        // Kiểm tra các giá trị khác
        return filterMKT.includes(mktStr);
      });
    }

    // Date filter (already applied on server-side, but double check if needed or just skip)
    // Since allData is already filtered by date from server, we might not need strict filtering here 
    // BUT if the user changes local state `startDate` it triggers fetch. 
    // We can skip client-side date filter or keep it for safety if `allData` contains out-of-range rows (unlikely with this logic)

    // Sort
    if (sortColumn) {
      data.sort((a, b) => {
        const aVal = a[sortColumn] || '';
        const bVal = b[sortColumn] || '';
        const comparison = String(aVal).localeCompare(String(bVal), 'vi', { numeric: true });
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return data;
  }, [allData, debouncedSearchText, debouncedSearchOrderCode, filterMarket, filterProduct, filterStatus, filterSale, filterMKT, sortColumn, sortDirection]);

  // Handle Ctrl+C to copy selected row
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (!selectedRowId) return;

        const filteredRow = filteredData.find(row => row.id === selectedRowId);
        if (!filteredRow) return;

        // Prevent default copy behavior if we are handling it
        e.preventDefault();

        // Format data based on visible columns (displayColumns)
        const rowValues = displayColumns.map(col => {
          let value = filteredRow[col];

          if (value === undefined || value === null) {
            const key = COLUMN_MAPPING[col];
            if (key) value = filteredRow[key];
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

          return String(value).replace(/\t/g, ' ').trim(); // Remove tabs from content to avoid breaking TSV
        });

        const tsv = rowValues.join('\t');

        try {
          await navigator.clipboard.writeText(tsv);
          toast.success("📋 Đã sao chép dòng vào bộ nhớ tạm!", {
            autoClose: 2000,
            hideProgressBar: true,
          });
        } catch (err) {
          console.error('Copy failed:', err);
          toast.error("❌ Sao chép thất bại");
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRowId, filteredData, displayColumns]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const paginatedData = useMemo(() => {
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

  // Handle sort
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
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

  // Open Edit modal - Chỉ Admin mới được phép
  const openEditModal = (order) => {
    if (!isAdmin()) {
      toast.error("Chỉ Admin mới có quyền sửa đơn hàng!");
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
        .from('orders')
        .update({
          customer_name: editingOrder.customer_name,
          customer_phone: editingOrder.customer_phone,
          customer_address: editingOrder.customer_address,
          country: editingOrder.country || editingOrder["Khu vực"], // Khu vực
          note: editingOrder.note,

          // Extended fields
          product_main: editingOrder.product_main,
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


  // Handle Delete - Chỉ Admin mới được phép
  const handleDelete = async (id) => {
    if (!isAdmin()) {
      toast.error("Chỉ Admin mới có quyền xóa đơn hàng!");
      return;
    }
    if (!window.confirm("Bạn có chắc chắn muốn xóa đơn hàng này? Hành động này không thể hoàn tác!")) return;

    try {
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) throw error;

      alert("✅ Đã xóa đơn hàng thành công!");
      // Update UI locally to avoid reload
      setAllData(prev => prev.filter(item => item.id !== id));
    } catch (error) {
      console.error("Delete error:", error);
      alert("❌ Lỗi xóa đơn: " + error.message);
    }
  };

  if (!canView('CSKH_LIST')) {
    return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này (CSKH_LIST).</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">

              <div>
                <h1 className="text-xl font-bold text-gray-800">QUẢN LÝ CSKH</h1>
                <p className="text-xs text-gray-500">Dữ liệu từ F3</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                <span className={`h-2 w-2 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-sm text-gray-600">
                  {filteredData.length} / {allData.length} đơn hàng
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg border border-green-200">
                <span className="text-sm font-semibold text-green-700">Tổng tiền:</span>
                <span className="text-sm text-green-600 font-bold">
                  {filteredData.reduce((sum, row) => {
                    const amount = parseFloat(String(row["Tổng tiền VNĐ"] || 0).replace(/[^\d.-]/g, '')) || 0;
                    return sum + amount;
                  }, 0).toLocaleString('vi-VN')} ₫
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
                  <RefreshCw className="w-4 h-4" />
                )}
                {loading ? 'Đang tải...' : 'Tải lại'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-full mx-auto px-6 py-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Search by Order Code */}
            <div className="min-w-[200px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tìm theo mã đơn hàng</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Nhập mã đơn hàng..."
                  className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  value={searchOrderCode}
                  onChange={(e) => setSearchOrderCode(e.target.value)}
                />
                {searchOrderCode && (
                  <button
                    onClick={() => setSearchOrderCode('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="Xóa"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tìm kiếm</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tên, SĐT, tracking..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] disabled:bg-gray-100 disabled:cursor-not-allowed"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  disabled={!!searchOrderCode}
                />
              </div>
              {searchOrderCode && (
                <p className="text-xs text-gray-500 mt-1">Tìm kiếm chung bị vô hiệu khi đang tìm theo mã đơn</p>
              )}
            </div>

            {/* Market Filter */}
            <div className="min-w-[150px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Khu vực</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                value={filterMarket[0] || ''}
                onChange={(e) => setFilterMarket(e.target.value ? [e.target.value] : [])}
              >
                <option value="">Tất cả</option>
                {uniqueMarkets.map(market => (
                  <option key={market} value={market}>{market}</option>
                ))}
              </select>
            </div>

            {/* Product Filter */}
            <div className="min-w-[150px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Mặt hàng</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                value={filterProduct[0] || ''}
                onChange={(e) => setFilterProduct(e.target.value ? [e.target.value] : [])}
              >
                <option value="">Tất cả</option>
                {uniqueProducts.map(product => (
                  <option key={product} value={product}>{product}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="min-w-[150px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Trạng thái</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                value={filterStatus[0] || ''}
                onChange={(e) => setFilterStatus(e.target.value ? [e.target.value] : [])}
              >
                <option value="">Tất cả</option>
                {uniqueStatuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            {/* Sale Filter - Multi-select với checkbox */}
            <div className="min-w-[200px] relative">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Lọc theo NV Sale</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSaleFilter(!showSaleFilter)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterSale.length === 0
                      ? 'Tất cả'
                      : filterSale.length === 1
                        ? filterSale[0]
                        : `Đã chọn ${filterSale.length}`}
                  </span>
                  <span className="ml-2">▼</span>
                </button>

                {showSaleFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn NV Sale:</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setFilterSale([...uniqueSale]);
                            }}
                            className="text-xs text-green-600 hover:text-green-800"
                          >
                            Chọn tất cả
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFilterSale([]);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Bỏ chọn tất cả
                          </button>
                        </div>
                      </div>
                      {uniqueSale.map(sale => {
                        const isChecked = filterSale.includes(sale);
                        return (
                          <label
                            key={sale}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterSale([...filterSale, sale]);
                                } else {
                                  setFilterSale(filterSale.filter(s => s !== sale));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{sale}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Click outside to close */}
              {showSaleFilter && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSaleFilter(false)}
                />
              )}
            </div>

            {/* MKT Filter - Multi-select với checkbox */}
            <div className="min-w-[200px] relative">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Lọc theo MKT</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMKTFilter(!showMKTFilter)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterMKT.length === 0
                      ? 'Tất cả'
                      : filterMKT.length === 1
                        ? filterMKT[0]
                        : `Đã chọn ${filterMKT.length}`}
                  </span>
                  <span className="ml-2">▼</span>
                </button>

                {showMKTFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn MKT:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setFilterMKT([]);
                            setShowMKTFilter(false);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Bỏ chọn tất cả
                        </button>
                      </div>
                      {uniqueMKT.map(mkt => {
                        const isChecked = filterMKT.includes(mkt);
                        return (
                          <label
                            key={mkt}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterMKT([...filterMKT, mkt]);
                                } else {
                                  setFilterMKT(filterMKT.filter(m => m !== mkt));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{mkt}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Click outside to close */}
              {showMKTFilter && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMKTFilter(false)}
                />
              )}
            </div>

            {/* Quick Filter */}
            <div className="min-w-[180px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Lọc nhanh</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                value={quickFilter}
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

            {/* Date Range Filter */}
            <div className="min-w-[200px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                Thời gian (Từ - Đến)
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <input
                  type="date"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Settings Button */}
            <button
              onClick={() => setShowColumnSettings(true)}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Cài đặt cột
            </button>


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
                  {isAdmin() && (
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-l border-gray-200 sticky right-0 z-10 w-[120px]">
                      Thao tác
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={displayColumns.length + (isAdmin() ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin h-5 w-5 border-2 border-[#F37021] border-t-transparent rounded-full"></div>
                        Đang tải dữ liệu...
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={displayColumns.length + (isAdmin() ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
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

                        if (value === undefined || value === null) {
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

                        return (
                          <td
                            key={col}
                            className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap cursor-copy hover:bg-blue-50"
                            title={`${value || '-'} (Double-click để copy)`}
                            onDoubleClick={(e) => handleCellClick(e, value)}
                          >
                            {value || '-'}
                          </td>
                        );
                      })}

                      {/* Action Column - Chỉ Admin mới thấy */}
                      {isAdmin() && (
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border-l border-gray-200 sticky right-0 bg-white z-10 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* View - Open Modal Read Only */}
                            <button
                              onClick={() => openViewModal(row)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                              title="Xem chi tiết"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Xem
                            </button>

                            {/* Edit - Chỉnh sửa đầy đủ trong form NhapDonMoi */}
                            {(canEdit('CSKH_LIST') || canEdit('SALE_ORDERS') || isAdmin()) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const orderId = row['Mã đơn hàng'] || row.order_code;
                                  if (orderId) {
                                    navigate(`/chinh-sua-don?orderId=${orderId}`);
                                  } else {
                                    toast.error('Không tìm thấy mã đơn hàng');
                                  }
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 border border-green-200 rounded transition-colors"
                                title="Chỉnh sửa đầy đủ thông tin đơn hàng"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                Sửa
                              </button>
                            )}

                            {/* Delete - Chỉ Admin mới thấy */}
                            {isAdmin() && (
                              <button
                                onClick={() => handleDelete(row.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors"
                                title="Xóa đơn hàng"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Xóa
                              </button>
                            )}
                          </div>
                        </td>
                      )}
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
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
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
                    <input
                      name="product_main"
                      value={editingOrder.product_main || ''}
                      onChange={handleEditChange}
                      readOnly={isViewing}
                      disabled={isViewing}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${isViewing ? 'bg-gray-100' : ''}`}
                    />
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

export default QuanLyCSKH;
