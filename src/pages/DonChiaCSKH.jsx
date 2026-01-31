import { Download, Edit, Eye, RefreshCw, Search, Settings, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';

import ColumnSettingsModal from '../components/ColumnSettingsModal';
import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';
import { COLUMN_MAPPING, PRIMARY_KEY_COLUMN } from '../types';

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


function DonChiaCSKH() {
  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const navigate = useNavigate();
  const { canView, canEdit, canDelete, role } = usePermissions();

  const [allData, setAllData] = useState([]);
  const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]); // Danh sách tên nhân sự đã chọn

  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [filterMarket, setFilterMarket] = useState([]);
  const [filterProduct, setFilterProduct] = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);
  const [filterCheckResult, setFilterCheckResult] = useState([]);
  const [filterPersonnel, setFilterPersonnel] = useState(''); // Filter by personnel name
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterCSKH, setFilterCSKH] = useState('');
  const [filterTrangThai, setFilterTrangThai] = useState('');

  // Date state - default to last 3 days
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

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

  // Helper function để kiểm tra Admin
  const isAdmin = () => {
    return role === 'ADMIN' || role === 'SUPER_ADMIN';
  };

  // Debounce search text for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

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
    if (allData.length === 0) return [];

    // Get all potential keys from data - chỉ lấy cột tiếng Việt
    const allKeys = new Set();
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
    const saved = localStorage.getItem('donChiaCSKH_visibleColumns');
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
      localStorage.setItem('donChiaCSKH_visibleColumns', JSON.stringify(cleaned));
    }
  }, [visibleColumns]);

  // Load data from Supabase with date filter
  const loadData = async () => {
    // Nếu không có date range, không load (hoặc có thể load tất cả - tùy yêu cầu)
    // Tạm thời: nếu không có date thì return
    // if (!startDate || !endDate) return;

    setLoading(true);
    try {
      console.log('🔍 [DonChiaCSKH] Loading orders from Supabase...');
      console.log(`📅 [DonChiaCSKH] Date range: ${startDate || 'ALL'} to ${endDate || 'ALL'}`);

      // Get user info for permission
      const userJson = localStorage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;
      const userEmail = (user?.Email || user?.email || "").toString().toLowerCase().trim();
      const userName = (user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || "").toString().trim();
      const boPhan = (user?.['Bộ_phận'] || user?.['Bộ phận'] || "").toString().trim().toLowerCase();
      const viTri = (user?.['Vị_trí'] || user?.['Vị trí'] || "").toString().trim().toLowerCase();

      const ADMIN_MAIL = "admin@marketing.com";
      const isAdmin = userEmail === ADMIN_MAIL || boPhan === 'admin';
      const isLeader = viTri.includes('leader') || viTri.includes('quản lý') || boPhan.includes('manager');
      const isManager = isAdmin || isLeader || role === 'ADMIN' || role === 'SUPER_ADMIN';

      let query = supabase.from('orders').select('*');

      // Filter: Chỉ lấy đơn có CSKH không trống (loại bỏ null, rỗng, và khoảng trắng)
      query = query.not('cskh', 'is', null);
      query = query.neq('cskh', '');
      query = query.neq('cskh', ' ');
      // Đảm bảo cskh không phải là chuỗi rỗng sau khi trim
      // Supabase không hỗ trợ trim trong query, nên sẽ filter ở client-side

      // Date Filter Logic
      // Date Filter Logic (Aligned with DanhSachDon)
      // Chỉ filter theo date nếu có giá trị
      if (startDate && startDate.trim() !== '') {
        query = query.gte('order_date', startDate);
        console.log(`📅 [DonChiaCSKH] Applied startDate filter: >= ${startDate}`);
      } else {
        console.log(`📅 [DonChiaCSKH] No startDate filter - showing all dates`);
      }
      if (endDate && endDate.trim() !== '') {
        query = query.lte('order_date', endDate);
        console.log(`📅 [DonChiaCSKH] Applied endDate filter: <= ${endDate}`);
      } else {
        console.log(`📅 [DonChiaCSKH] No endDate filter - showing all dates`);
      }

      query = query.order('order_date', { ascending: false });

      // --- USER ISOLATION FILTER (CSKH) ---
      // Khớp với các cột: Nhân viên Sale, Nhân viên MKT, Nhân viên Vận đơn
      // => Dùng các field trong bảng orders: sale_staff, marketing_staff, delivery_staff
      if (!isManager) {
        // Nếu có filterPersonnel được chọn: chỉ lấy đơn mà người đó xuất hiện
        if (filterPersonnel && filterPersonnel.trim().length > 0) {
          const name = filterPersonnel.trim();
          const pattern = `%${name}%`;
          console.log('🔍 [DonChiaCSKH] Filtering by selected personnel (Sale/MKT/Vận đơn):', name);

          const orConditions = [
            `sale_staff.ilike.${pattern}`,
            `marketing_staff.ilike.${pattern}`,
            `delivery_staff.ilike.${pattern}`
          ];

          try {
            query = query.or(orConditions.join(','));
            console.log('✅ [DonChiaCSKH] Applied personnel OR filter:', orConditions.join(','));
          } catch (orError) {
            console.error('❌ [DonChiaCSKH] Error applying personnel OR filter, falling back to single column:', orError);
            // Fallback: dùng sale_staff
            query = query.ilike('sale_staff', pattern);
          }
        } else if (selectedPersonnelNames.length > 0) {
          // Có danh sách nhân sự được tích trong phân quyền:
          // Lấy đơn mà bất kỳ người nào trong danh sách xuất hiện ở Sale/MKT/Vận đơn
          console.log('🔍 [DonChiaCSKH] Filtering by selected personnel list (Sale/MKT/Vận đơn):', selectedPersonnelNames);

          const orConditions = [];
          selectedPersonnelNames
            .filter(name => name && name.trim().length > 0)
            .forEach(name => {
              const pattern = `%${name.trim()}%`;
              orConditions.push(`sale_staff.ilike.${pattern}`);
              orConditions.push(`marketing_staff.ilike.${pattern}`);
              orConditions.push(`delivery_staff.ilike.${pattern}`);
            });

          if (orConditions.length > 0) {
            try {
              query = query.or(orConditions.join(','));
              console.log('✅ [DonChiaCSKH] Applied OR filter for selected personnel list:', orConditions.join(','));
            } catch (orError) {
              console.error('❌ [DonChiaCSKH] Error applying OR filter for list, falling back to first name:', orError);
              const first = selectedPersonnelNames[0]?.trim();
              if (first) {
                const pattern = `%${first}%`;
                query = query.or([
                  `sale_staff.ilike.${pattern}`,
                  `marketing_staff.ilike.${pattern}`,
                  `delivery_staff.ilike.${pattern}`
                ].join(','));
              }
            }
          } else {
            // Không có tên hợp lệ -> không trả về đơn nào
            console.warn('⚠️ [DonChiaCSKH] No valid selected personnel names after trim, returning empty result');
            query = query.eq('id', '00000000-0000-0000-0000-000000000000');
          }
        } else {
          // Không có nhân sự được tích trong phân quyền: không hiển thị đơn nào
          console.warn('⚠️ [DonChiaCSKH] No selected personnel found in permission table, returning empty result');
          query = query.eq('id', '00000000-0000-0000-0000-000000000000'); // Return no results
        }
      } else {
        // Admin/Manager: có thể filter theo nhân sự nếu được chọn
        if (filterPersonnel && filterPersonnel.trim().length > 0) {
          const name = filterPersonnel.trim();
          const pattern = `%${name}%`;
          console.log('🔍 [DonChiaCSKH] Admin filtering by selected personnel (Sale/MKT/Vận đơn):', name);

          const orConditions = [
            `sale_staff.ilike.${pattern}`,
            `marketing_staff.ilike.${pattern}`,
            `delivery_staff.ilike.${pattern}`
          ];

          try {
            query = query.or(orConditions.join(','));
            console.log('✅ [DonChiaCSKH] Admin applied personnel OR filter:', orConditions.join(','));
          } catch (orError) {
            console.error('❌ [DonChiaCSKH] Admin error applying personnel OR filter, falling back to sale_staff:', orError);
            query = query.ilike('sale_staff', pattern);
          }
        } else {
          console.log('✅ [DonChiaCSKH] Admin/Manager: viewing all orders (no personnel filter)');
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      console.log(`📦 [DonChiaCSKH] Raw data from DB: ${data?.length || 0} orders`);
      
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
          "CSKH": item.cskh ? String(item.cskh).trim() : '', // Chỉ lấy từ cột cskh, không fallback
          // Giữ lại cột gốc để debug
          _cskh_raw: item.cskh,
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

      // Lọc thêm ở client-side để đảm bảo chỉ hiển thị đơn có CSKH không trống
      // Loại bỏ: null, undefined, chuỗi rỗng, và chuỗi chỉ có khoảng trắng
      const filteredData = mappedData.filter(row => {
        const cskh = row['CSKH'];
        // Kiểm tra null, undefined, và chuỗi rỗng sau khi trim
        if (cskh === null || cskh === undefined) return false;
        const trimmed = String(cskh).trim();
        return trimmed !== '' && trimmed.length > 0;
      });

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
        isManager,
        selectedPersonnelNames,
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
        
        console.log('📝 [DonChiaCSKH] Valid personnel names:', validNames);
        setSelectedPersonnelNames(validNames);
      } catch (error) {
        console.error('❌ [DonChiaCSKH] Error loading selected personnel:', error);
        setSelectedPersonnelNames([]);
      }
    };

    loadSelectedPersonnel();
  }, []);

  useEffect(() => {
    loadData();
  }, [startDate, endDate, role, selectedPersonnelNames]);

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

  const uniqueCSKH = useMemo(() => {
    const cskhSet = new Set();
    allData.forEach(row => {
      const cskh = row["CSKH"];
      if (cskh) cskhSet.add(String(cskh).trim());
    });
    return Array.from(cskhSet).sort();
  }, [allData]);

  const uniqueCheckResults = useMemo(() => {
    const checkResults = new Set();
    allData.forEach(row => {
      const checkResult = row["Kết quả Check"];
      if (checkResult) checkResults.add(String(checkResult).trim());
    });
    return Array.from(checkResults).sort();
  }, [allData]);

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredData.length === 0) {
      toast.error("Không có dữ liệu để xuất Excel.");
      return;
    }

    const dataToExport = filteredData.map(row => {
      const newRow = {};
      displayColumns.forEach(col => {
        const key = COLUMN_MAPPING[col] || col;
        newRow[col] = row[key] ?? row[col] ?? '';
      });
      return newRow;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Auto-width columns
    const wscols = displayColumns.map(() => ({ wch: 20 }));
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "DonChiaCSKH");
    XLSX.writeFile(wb, `DonChiaCSKH_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("✅ Đã xuất Excel thành công!");
  };

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
    let data = [...allData];

    // Search filter (using debounced value) - search in all columns
    if (debouncedSearchText) {
      const searchLower = debouncedSearchText.toLowerCase();
      data = data.filter(row => {
        // Search in all column values
        return Object.values(row).some(val => 
          String(val || '').toLowerCase().includes(searchLower)
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

    // Check Result filter
    if (filterCheckResult.length > 0) {
      data = data.filter(row => {
        const checkResult = row["Kết quả Check"];
        return filterCheckResult.includes(String(checkResult).trim());
      });
    }

    // Personnel filter (client-side filter for additional filtering - full match)
    if (filterPersonnel && filterPersonnel.trim().length > 0) {
      data = data.filter(row => {
        const cskh = String(row["CSKH"] || '').trim();
        const filterName = filterPersonnel.trim();
        // Match chính xác tên đầy đủ (case-insensitive)
        return cskh.toLowerCase() === filterName.toLowerCase() || 
               cskh.toLowerCase().includes(filterName.toLowerCase());
      });
    }

    // CSKH filter
    if (filterCSKH && filterCSKH !== '__EMPTY__') {
      data = data.filter(row => {
        const cskh = String(row["CSKH"] || '').trim();
        return cskh === filterCSKH;
      });
    } else if (filterCSKH === '__EMPTY__') {
      data = data.filter(row => !row["CSKH"]);
    }

    // Trạng thái filter
    if (filterTrangThai && filterTrangThai !== '__EMPTY__') {
      data = data.filter(row => {
        const status = String(row["Trạng thái giao hàng"] || '').trim();
        return status === filterTrangThai;
      });
    } else if (filterTrangThai === '__EMPTY__') {
      data = data.filter(row => !row["Trạng thái giao hàng"]);
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

  if (!canView('CSKH_PAID')) {
    return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này (CSKH_PAID).</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">

              <div>
                <h1 className="text-xl font-bold text-gray-800">ĐƠN CHIA CSKH</h1>
                <p className="text-xs text-gray-500">Dữ liệu từ Supabase</p>
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

              {/* Check Result Filter */}
              <div className="min-w-[150px]">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Kết quả Check</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                  value={filterCheckResult[0] || ''}
                  onChange={(e) => setFilterCheckResult(e.target.value ? [e.target.value] : [])}
                >
                  <option value="">Tất cả</option>
                  {uniqueCheckResults.map(checkResult => (
                    <option key={checkResult} value={checkResult}>{checkResult}</option>
                  ))}
                </select>
              </div>

              {/* CSKH Filter */}
              <div className="min-w-[180px]">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">CSKH (Team Lý)</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={filterCSKH}
                  onChange={(e) => setFilterCSKH(e.target.value)}
                >
                  <option value="">Tất cả</option>
                  <option value="__EMPTY__">Trống</option>
                  {uniqueCSKH.map(cskh => (
                    <option key={cskh} value={cskh}>{cskh}</option>
                  ))}
                </select>
              </div>

              {/* Trạng thái Filter */}
              <div className="min-w-[150px]">
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Trạng thái cuối cùng</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={filterTrangThai}
                  onChange={(e) => setFilterTrangThai(e.target.value)}
                >
                  <option value="">Tất cả</option>
                  <option value="__EMPTY__">Trống</option>
                  {uniqueStatuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
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
                <button
                  onClick={handleExportExcel}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Xuất Excel
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

                        // Đặc biệt: CSKH chỉ lấy từ cột cskh, không fallback
                        if (col === 'CSKH') {
                          value = row['CSKH'];
                          // Nếu không có, thử lấy từ cột gốc cskh
                          if (value === undefined || value === null || value === '') {
                            value = row['cskh'];
                          }
                          // Đảm bảo là string và trim
                          value = value ? String(value).trim() : '';
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

export default DonChiaCSKH;
