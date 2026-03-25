import { Clock, Eye, Pencil, RefreshCw, Search, Settings, Trash2, Wrench, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import ColumnSettingsModal from '../components/ColumnSettingsModal';
const BillImageViewer = lazy(() => import('../components/BillImageViewer'));
import usePermissions from '../hooks/usePermissions';
import { logDataChange } from '../services/logging';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';
import { COLUMN_MAPPING, PRIMARY_KEY_COLUMN } from '../types';
import { isDateInRange, orderRangeToCreatedAtIsoBounds, parseSmartDate } from '../utils/dateParsing';

/** PostgREST thường chỉ trả ~1000 dòng nếu không set limit — dễ thiếu đơn khi dữ liệu nhiều */
const ORDERS_FETCH_LIMIT = 50000;

/** Giá trị Ca sau khi gộp Giữa ca + Hết ca (khớp NhapDonMoi / báo cáo) */
const SHIFT_GIUA_CA_HET_CA = 'Giữa ca,Hết ca';

/** Chỉ đơn đang là đúng một ca "Giữa ca" (không phẩy, không Hết ca) */
function isOnlyGiuaCaShift(shiftVal) {
  const s = String(shiftVal ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return false;
  if (s.includes(',')) return false;
  const n = s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return n === 'giua ca';
}

// Các cột tự động ẩn mặc định trong bảng danh sách đơn hàng
const HIDDEN_COLUMNS = [
  'Phí Chung',
  'Phí bay',
  'Phí ship',
  'Phí xử lý đơn đóng hàng-Lưu kho(usd)',
  'Thuê TK',
  'Thời gian cutoff',
  'Tiền Hàng',
  '_source',
  '_id'
];

function DanhSachDon() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const teamFilter = searchParams.get('team'); // e.g. 'RD'

  // Permission Logic
  const { canView, canEdit, canDelete, role } = usePermissions();
  // Check Admin from multiple sources
  const userJson = localStorage.getItem("user");
  const user = userJson ? JSON.parse(userJson) : null;
  const userEmail = (user?.Email || user?.email || localStorage.getItem("userEmail") || "").toString().toLowerCase().trim();
  const ADMIN_MAIL = "admin@marketing.com";
  const roleLower = (role || '').toLowerCase();
  const isAdmin = ['admin', 'super_admin', 'finance'].includes(roleLower) ||
    userEmail === ADMIN_MAIL ||
    (user?.Bộ_phận || user?.['Bộ phận'] || "").toString().trim().toLowerCase() === 'admin' ||
    (user?.Bộ_phận || user?.['Bộ phận'] || "").toString().trim().toLowerCase() === 'finance';

  // Chỉ Admin thực sự (không bao gồm Finance) mới có quyền đồng bộ và xóa toàn bộ
  const isAdminOnly = ['admin', 'super_admin', 'ADMIN', 'SUPER_ADMIN'].includes(roleLower) ||
    userEmail === ADMIN_MAIL ||
    (user?.Bộ_phận || user?.['Bộ phận'] || "").toString().trim().toLowerCase() === 'admin';
  // Determine relevant page code based on team switch
  // If team=RD, we are in R&D context -> RND_ORDERS
  // Else (default), we are in Sale context -> SALE_ORDERS
  const permissionCode = teamFilter === 'RD' ? 'RND_ORDERS' : 'SALE_ORDERS';


  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPersonnelEmails, setSelectedPersonnelEmails] = useState([]); // Danh sách email nhân sự đã chọn
  const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]); // Danh sách tên nhân sự đã chọn
  const [personnelEmailToNameMap, setPersonnelEmailToNameMap] = useState({}); // Map email -> name


  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [filterMarket, setFilterMarket] = useState([]);
  const [showMarketFilter, setShowMarketFilter] = useState(false);
  const [filterProduct, setFilterProduct] = useState([]);
  const [showProductFilter, setShowProductFilter] = useState(false);
  const [filterStatus, setFilterStatus] = useState([]);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [filterCheckResult, setFilterCheckResult] = useState([]);
  const [showCheckResultFilter, setShowCheckResultFilter] = useState(false);
  const [filterSaleStaff, setFilterSaleStaff] = useState([]);
  const [showSaleStaffFilter, setShowSaleStaffFilter] = useState(false);
  const [filterMktStaff, setFilterMktStaff] = useState([]);
  const [showMktStaffFilter, setShowMktStaffFilter] = useState(false);
  const [filterDeliveryStaff, setFilterDeliveryStaff] = useState([]);
  const [showDeliveryStaffFilter, setShowDeliveryStaffFilter] = useState(false);
  // Mặc định 30 ngày (trước chỉ 3 ngày — dễ không thấy đơn cũ hơn)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });


  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [syncing, setSyncing] = useState(false); // State for sync process
  const [isFixingTeams, setIsFixingTeams] = useState(false); // State for fixing missing teams
  const [isFixingShift, setIsFixingShift] = useState(false); // Chỉnh ca: Giữa ca → Giữa ca,Hết ca
  const [selectedRowId, setSelectedRowId] = useState(null); // For copy feature
  const [deleting, setDeleting] = useState(false); // State for delete all process
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyOrderCode, setHistoryOrderCode] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);



  const defaultColumns = [
    'Mã đơn hàng',
    'Ngày lên đơn',
    'Name*',
    'Phone*',
    'Khu vực',
    'Mặt hàng',
    'Loại tiền thanh toán',
    'Ca',
    'Mã Tracking',
    'Trạng thái giao hàng',
    'Tổng tiền VNĐ',
  ];

  // Debounce search text for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Get all available columns from data (excluding hidden columns and technical columns)
  const allAvailableColumns = useMemo(() => {
    // Get all potential keys from data
    const allKeys = new Set();

    if (allData.length > 0) {
      allData.forEach(row => {
        Object.keys(row).forEach(key => {
          // Exclude PRIMARY_KEY_COLUMN, HIDDEN_COLUMNS, and technical columns starting with _
          if (key !== PRIMARY_KEY_COLUMN &&
            !HIDDEN_COLUMNS.includes(key) &&
            !key.startsWith('_')) {
            allKeys.add(key);
          }
        });
      });
    }

    // Đảm bảo các cột mặc định luôn có trong danh sách, ngay cả khi không có trong dữ liệu
    defaultColumns.forEach(col => {
      if (!HIDDEN_COLUMNS.includes(col)) {
        allKeys.add(col);
      }
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
  }, [allData, defaultColumns.join('|')]);

  // Default columns

  // Load column visibility from localStorage or use defaults
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('danhSachDon_visibleColumns');
    let initial = {};

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Remove any columns that are no longer available
        Object.keys(parsed).forEach(col => {
          // Only keep columns that are not in HIDDEN_COLUMNS
          if (!HIDDEN_COLUMNS.includes(col)) {
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

  // Clean up hidden columns from visibleColumns and ensure default columns exist
  useEffect(() => {
    setVisibleColumns(prev => {
      let updated = { ...prev };
      let changed = false;

      // Remove any hidden columns
      HIDDEN_COLUMNS.forEach(col => {
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
  }, [defaultColumns.join('|')]);

  // Save to localStorage when visibleColumns changes (excluding hidden columns)
  useEffect(() => {
    if (Object.keys(visibleColumns).length > 0) {
      // Clean up: remove any columns that are no longer available
      const toSave = {};
      Object.keys(visibleColumns).forEach(col => {
        if (!HIDDEN_COLUMNS.includes(col)) {
          toSave[col] = visibleColumns[col];
        }
      });
      localStorage.setItem('danhSachDon_visibleColumns', JSON.stringify(toSave));
    }
  }, [visibleColumns]);

  // Helper: Map Supabase DB row to UI format
  const mapSupabaseToUI = (item) => ({
    "Mã đơn hàng": item.order_code,
    "Ngày lên đơn": item.order_date || item.created_at?.split('T')[0],
    "Name*": item.customer_name,
    "Phone*": item.customer_phone,
    "Add": item.customer_address,
    "City": item.city,
    "State": item.state,
    "Khu vực": item.country, // Lấy từ country
    "Zipcode": item.zipcode,
    "Mặt hàng": item.product,
    "Loại tiền thanh toán": item.payment_currency || item.paymentCurrency || '',
    "Tên mặt hàng 1": item.product_name_1 || item.product,
    "Tổng tiền VNĐ": item.total_amount_vnd,
    "Hình thức thanh toán": item.payment_method_text || item.payment_method, // payment_method_text is new
    "Mã Tracking": item.tracking_code,
    "Nhân viên Marketing": item.marketing_staff || item.marketingStaff || '',
    "Nhân viên Sale": item.sale_staff || item.saleStaff || '',
    "Team": item.team,
    "Trạng thái giao hàng": item.delivery_status,
    "Kết quả Check": item.check_result || item.payment_status, // Ưu tiên check_result, fallback về payment_status
    "Ghi chú": item.note,
    "CSKH": item.cskh,
    "NV Vận đơn": item.delivery_staff,
    "Tiền Việt đã đối soát": item.reconciled_vnd || item.reconciled_amount, // reconciled_vnd new
    "Đơn vị vận chuyển": item.shipping_unit || item.shipping_carrier, // shipping_carrier might be new?
    "Kế toán xác nhận thu tiền về": item.accountant_confirm,
    "Trạng thái thu tiền": item.payment_status_detail,
    "Lý do": item.reason,
    "Page": item.page_name, // Map Page Name
    "Ca": item.shift, // Map shift to Ca
    "Payment Bill": item.payment_bill, // Trạng thái bill
    "Payment Image": item.payment_image // Link hình ảnh bill
    // Note: _id and _source are excluded from mapSupabaseToUI to prevent them from appearing in column settings
  });

  // Modified loadData to use date filters on server side
  const loadData = async () => {
    setLoading(true);
    try {
      console.log(`Loading data from Supabase (From: ${startDate} To: ${endDate})...`);

      // --- TESTING MODE CHECK ---
      try {
        const settings = localStorage.getItem('system_settings');
        if (settings) {
          const parsed = JSON.parse(settings);
          if (parsed.dataSource === 'test') {
            console.log("🔶 [TEST MODE] Loading Mock Data for Order List");

            const mockOrders = [
              {
                order_code: "TEST-001",
                order_date: new Date().toISOString(),
                customer_name: "Nguyễn Văn Test",
                customer_phone: "0901234567",
                customer_address: "123 Đường Test, Q1",
                city: "Hồ Chí Minh",
                country: "Miền Nam",
                product: "Sản phẩm A",
                total_amount_vnd: 500000,
                delivery_status: "ĐANG GIAO",
                payment_status: "Chưa thanh toán"
              },
              {
                order_code: "TEST-002",
                order_date: new Date(Date.now() - 86400000).toISOString(),
                customer_name: "Trần Thị Test",
                customer_phone: "0909876543",
                customer_address: "456 Phố Mẫu, HN",
                city: "Hà Nội",
                country: "Miền Bắc",
                product: "Sản phẩm B",
                total_amount_vnd: 1200000,
                delivery_status: "GIAO THÀNH CÔNG",
                payment_status: "Đã thanh toán"
              },
              {
                order_code: "TEST-003",
                order_date: new Date(Date.now() - 172800000).toISOString(),
                customer_name: "Lê Văn Mẫu",
                customer_phone: "0911223344",
                customer_address: "789 Đường Demo, ĐN",
                city: "Đà Nẵng",
                country: "Miền Trung",
                product: "Combo C",
                total_amount_vnd: 2500000,
                delivery_status: "HOÀN",
                payment_status: "Có bill"
              }
            ];

            const mappedMock = mockOrders.map(mapSupabaseToUI);
            setAllData(mappedMock);
            setLoading(false);
            return; // EXIT EARLY
          }
        }
      } catch (e) {
        console.warn("Error checking test mode:", e);
      }
      // --------------------------

      // 1. Fetch Supabase Data with Date Filter
      // Exclude R&D orders (Isolation Rule: Data only appears in RD module)
      // UPDATED: Logic to support R&D context
      const userJson = localStorage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;
      const userName = localStorage.getItem("username") || user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || user?.username || user?.name || "";

      const normalizeNameForQuery = (str) => {
        if (!str) return '';
        return String(str).trim().replace(/\s+/g, ' ');
      };

      /** Team + nhân sự — dùng lại cho truy vấn phụ (đơn order_date null) */
      const applyTeamAndPersonnel = (q) => {
        let query = q;
        if (teamFilter === 'RD') {
          query = query.eq('team', 'RD');
        } else {
          // QUAN TRỌNG: .neq('team','RD') trong SQL loại cả dòng team NULL → đơn không chi nhánh không thấy
          query = query.or('team.is.null,team.neq.RD');
        }
        if (!isAdmin) {
          if (selectedPersonnelNames.length > 0) {
            const allNames = [...new Set([...selectedPersonnelNames, userName].filter(Boolean))];
            console.log('🔍 Filtering by selected personnel names:', allNames);
            const orConditions = allNames.flatMap((name) => {
              const normalizedName = normalizeNameForQuery(name);
              return [
                `sale_staff.ilike.%${normalizedName}%`,
                `marketing_staff.ilike.%${normalizedName}%`,
                `delivery_staff.ilike.%${normalizedName}%`
              ];
            });
            query = query.or(orConditions.join(','));
          } else if (userName) {
            const normalizedUserName = normalizeNameForQuery(userName);
            query = query.or(
              `sale_staff.ilike.%${normalizedUserName}%,marketing_staff.ilike.%${normalizedUserName}%,delivery_staff.ilike.%${normalizedUserName}%`
            );
          }
        } else {
          console.log('✅ Admin: Viewing all orders (no filter applied)');
        }
        return query;
      };

      let query = applyTeamAndPersonnel(supabase.from('orders').select('*'));

      if (startDate) {
        query = query.gte('order_date', startDate);
      }
      if (endDate) {
        query = query.lte('order_date', endDate);
      }

      const { data: supaData, error: supaError } = await query
        .order('order_date', { ascending: false })
        .limit(ORDERS_FETCH_LIMIT);

      if (supaError) throw supaError;

      // Gộp thêm đơn có order_date NULL nhưng created_at nằm trong khoảng (tránh thiếu đơn trên UI)
      let mergedRaw = [...(supaData || [])];
      if (startDate && endDate) {
        const { start: cStart, end: cEnd } = orderRangeToCreatedAtIsoBounds(startDate, endDate);
        let qNull = applyTeamAndPersonnel(supabase.from('orders').select('*'));
        qNull = qNull.is('order_date', null).gte('created_at', cStart).lte('created_at', cEnd);
        const { data: extraRows, error: extraErr } = await qNull
          .order('created_at', { ascending: false })
          .limit(ORDERS_FETCH_LIMIT);
        if (extraErr) {
          console.warn('⚠️ [DanhSachDon] Không gộp được đơn order_date null:', extraErr.message);
        } else if (extraRows?.length) {
          const seen = new Set(mergedRaw.map((r) => r.order_code));
          for (const row of extraRows) {
            if (row.order_code && !seen.has(row.order_code)) {
              mergedRaw.push(row);
              seen.add(row.order_code);
            }
          }
        }
      }

      // 2. Process Supabase Data
      const supaMapped = mergedRaw.map(mapSupabaseToUI);

      // 3. Sort by Date Descending (Client side sort for display)
      supaMapped.sort((a, b) => {
        const dateA = parseSmartDate(a["Ngày lên đơn"]);
        const dateB = parseSmartDate(b["Ngày lên đơn"]);
        return (dateB || 0) - (dateA || 0);
      });

      console.log(`Loaded: ${supaMapped.length} Supabase orders.`);
      setAllData(supaMapped);

    } catch (error) {
      console.error('Load data error:', error);
      alert(`❌ Lỗi tải dữ liệu: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load selected personnel names for current user (giờ lưu TÊN, không phải email)
  useEffect(() => {
    const loadSelectedPersonnel = async () => {
      try {
        // Lấy userEmail từ localStorage (được set khi login)
        const userEmail = localStorage.getItem("userEmail") || "";

        console.log('🔍 Current userEmail:', userEmail);

        if (!userEmail) {
          console.warn('⚠️ Không tìm thấy userEmail trong localStorage');
          setSelectedPersonnelEmails([]);
          setSelectedPersonnelNames([]);
          setPersonnelEmailToNameMap({});
          return;
        }

        const userEmailLower = userEmail.toLowerCase().trim();
        console.log('📧 Loading selected personnel for:', userEmailLower);

        // Get selected personnel (giờ là TÊN, không phải email)
        const personnelMap = await rbacService.getSelectedPersonnel([userEmailLower]);
        const personnelNames = personnelMap[userEmailLower] || [];

        console.log('📋 Personnel map from DB:', personnelMap);
        console.log('👥 Selected personnel names (TÊN):', personnelNames);

        if (personnelNames.length === 0) {
          console.log('ℹ️ Không có nhân sự nào được chọn trong cột "Nhân sự"');
          setSelectedPersonnelEmails([]);
          setSelectedPersonnelNames([]);
          setPersonnelEmailToNameMap({});
          return;
        }

        // Lọc chỉ lấy tên hợp lệ (không phải email)
        const validNames = personnelNames.filter(name => {
          const nameStr = String(name).trim();
          return nameStr.length > 0 && !nameStr.includes('@');
        });

        console.log('📝 Valid personnel names:', validNames);
        console.log('✅ Đã load', validNames.length, 'nhân sự');

        // Giờ selectedPersonnelNames chứa tên trực tiếp từ DB
        setSelectedPersonnelEmails([]); // Không dùng email nữa
        setSelectedPersonnelNames(validNames);
        setPersonnelEmailToNameMap({}); // Không cần map nữa
      } catch (error) {
        console.error('❌ Error loading selected personnel:', error);
        setSelectedPersonnelEmails([]);
        setSelectedPersonnelNames([]);
        setPersonnelEmailToNameMap({});
      }
    };

    loadSelectedPersonnel();
  }, []); // Load once on mount

  // Reload data when selectedPersonnelNames changes (để áp dụng filter mới ở DB level)
  useEffect(() => {
    if (selectedPersonnelNames.length >= 0) {
      // Reload data khi selectedPersonnelNames thay đổi
      console.log('🔄 Reloading data due to selectedPersonnelNames change:', selectedPersonnelNames.length);
      loadData();
    }
  }, [selectedPersonnelNames.length]); // Chỉ reload khi số lượng thay đổi

  useEffect(() => {
    loadData();
  }, [startDate, endDate, role]); // Reload when dates change

  // Get unique values for filters - Bao gồm cả giá trị trống
  const uniqueMarkets = useMemo(() => {
    const markets = new Set();
    let hasEmpty = false;
    allData.forEach(row => {
      const market = row["Khu vực"] || row["khu vực"];
      if (market && String(market).trim()) {
        markets.add(String(market).trim());
      } else {
        hasEmpty = true;
      }
    });
    const sortedMarkets = Array.from(markets).sort();
    // Thêm "Trống" vào đầu danh sách nếu có giá trị trống
    if (hasEmpty) {
      return ['(Trống)', ...sortedMarkets];
    }
    return sortedMarkets;
  }, [allData]);

  // Sync data from F3 Firebase
  const handleSyncF3 = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn đồng bộ dữ liệu từ F3 (Firebase) về Supabase?\n\nLưu ý: Chỉ thêm dữ liệu MỚI (chưa có), KHÔNG ghi đè dữ liệu đã tồn tại.")) return;

    try {
      setSyncing(true);
      const F3_URL = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json";
      console.log("Fetching F3 data from:", F3_URL);

      const response = await fetch(F3_URL);
      const dataRaw = await response.json();

      let firebaseData = [];
      if (Array.isArray(dataRaw)) {
        firebaseData = dataRaw;
      } else if (dataRaw && typeof dataRaw === 'object') {
        firebaseData = Object.values(dataRaw);
      }

      if (firebaseData.length === 0) {
        alert("Không tìm thấy dữ liệu trên F3.");
        return;
      }

      console.log(`Found ${firebaseData.length} records.`);

      // DEBUG: Show first item structure to verify keys
      const firstItem = firebaseData[0];
      const sampleKeys = Object.keys(firstItem).join(", ");
      console.log("First item keys:", sampleKeys);
      // alert(`Debug keys: ${sampleKeys}`); // Uncomment if you need to see this in UI

      // Prepare batch data
      const batchSize = 50;
      let successCount = 0;
      let errorCount = 0;
      let lastError = null;

      for (let i = 0; i < firebaseData.length; i += batchSize) {
        const batch = firebaseData.slice(i, i + batchSize);
        const transformedBatch = batch.map((item, index) => {
          // Parse date helper
          // Parse date helper with support for multiple formats
          let dateRaw = item["Ngày lên đơn"] || item["Ngày_lên_đơn"];
          let orderDate = null;
          if (dateRaw) {
            try {
              if (dateRaw.includes("/")) {
                let [p1, p2, p3] = dateRaw.split("/");
                // Check if parts are valid numbers
                let d = parseInt(p1);
                let m = parseInt(p2);
                let y = parseInt(p3);

                if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
                  // Handle case where format is MM/DD/YYYY (m > 12 is impossible for month)
                  // If 2nd part > 12, it must be Day -> so 1st part is Month.
                  if (m > 12) {
                    const temp = d; d = m; m = temp;
                  }
                  // Also simply swap if d is clearly month (>12 impossible) 
                  // But wait, if d > 12, d is definitely day. m must be month.
                  // Standard assumption: p1=Day, p2=Month. 
                  // If p2 > 12 (invalid month), then swap? No, if p2 > 12 it CANNOT be month.
                  // So p2 is Day, p1 is Month.

                  // Validate final components
                  if (m > 0 && m <= 12 && d > 0 && d <= 31) {
                    orderDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  }
                }
              } else if (dateRaw.includes("-")) {
                const d = new Date(dateRaw);
                if (!isNaN(d.getTime())) {
                  orderDate = d.toISOString();
                }
              }
            } catch (e) {
              console.warn("Date parse error", dateRaw);
            }
          }

          // Handle amount with various key formats
          const rawAmount = item["Tổng tiền VNĐ"] || item["Tổng_tiền_VNĐ"] || "0";
          const rawShip = item["Phí ship"] || item["Phí_ship"] || "0";
          const rawGoodsAmount = item["Tiền Hàng"] || item["Tiền_Hàng"] || "0";
          const rawReconciled = item["Tiền Việt đã đối soát"] || item["Tiền_Việt_đã_đối_soát"] || "0";

          const amount = rawAmount ? (parseFloat(String(rawAmount).replace(/[^0-9.-]+/g, "")) || 0) : 0;
          const ship = rawShip ? (parseFloat(String(rawShip).replace(/[^0-9.-]+/g, "")) || 0) : null;
          const goodsAmount = rawGoodsAmount ? (parseFloat(String(rawGoodsAmount).replace(/[^0-9.-]+/g, "")) || 0) : 0;
          const reconciled = rawReconciled ? (parseFloat(String(rawReconciled).replace(/[^0-9.-]+/g, "")) || 0) : 0;

          return {
            order_code: item["Mã đơn hàng"] || item["Mã_đơn_hàng"] || `UNK-${Date.now()}-${i + index}`,
            order_date: orderDate,
            customer_name: item["Name"] || item["Name*"] || "",
            customer_phone: item["Phone"] || item["Phone*"] || "",
            customer_address: item["Add"] || "",
            city: item["City"] || "",
            state: item["State"] || "",
            zipcode: item["Zipcode"] || "",
            country: item["Khu vực"] || item["Khu_vực"] || "",
            product: item["Mặt hàng"] || item["Mặt_hàng"] || item["Tên mặt hàng 1"] || "",
            total_amount_vnd: amount,
            payment_method: item["Hình thức thanh toán"] || item["Hình_thức_thanh_toán"] || "",
            payment_currency: item["Loại tiền thanh toán"] || item["Loại_tiền_thanh_toán"] || item["payment_currency"] || "",
            tracking_code: item["Mã Tracking"] || item["Mã_Tracking"] || "",
            shipping_fee: ship,
            marketing_staff: item["Nhân viên Marketing"] || item["Nhân_viên_Marketing"] || "",
            sale_staff: item["Nhân viên Sale"] || item["Nhân_viên_Sale"] || "",
            team: item["Team"] || "",
            delivery_status: item["Trạng thái giao hàng"] || item["Trạng_thái_giao_hàng_NB"] || item["Trạng_thái_giao_hàng"] || "",
            check_result: item["Kết quả Check"] || item["Kết_quả_Check"] || "", // Map vào check_result thay vì payment_status
            payment_status: item["Kết quả Check"] || item["Kết_quả_Check"] || "", // Giữ lại để backward compatibility
            note: item["Ghi chú"] || item["Ghi_chú"] || "",

            // New extended columns
            cskh: item["CSKH"] || "",
            delivery_staff: item["NV_Vận_đơn"] || item["NV Vận đơn"] || "",
            goods_amount: goodsAmount,
            reconciled_amount: reconciled,
            general_fee: parseFloat(String(item["Phí_Chung"] || item["Phí Chung"] || "0").replace(/[^0-9.-]+/g, "")) || 0,
            flight_fee: parseFloat(String(item["Phí_bay"] || item["Phí bay"] || "0").replace(/[^0-9.-]+/g, "")) || 0,
            account_rental_fee: parseFloat(String(item["Thuê_TK"] || item["Thuê TK"] || "0").replace(/[^0-9.-]+/g, "")) || 0,
            cutoff_time: item["Thời_gian_cutoff"] || item["Thời gian cutoff"] || "",
            shipping_unit: item["Đơn_vị_vận_chuyển"] || item["Đơn vị vận chuyển"] || "",
            accountant_confirm: item["Kế_toán_xác_nhận_thu_tiền_về"] || item["Kế toán xác nhận thu tiền về"] || "",
            payment_status_detail: item["Trạng_thái_thu_tiền"] || item["Trạng thái thu tiền"] || "",
            reason: item["Lý_do"] || item["Lý do"] || ""
          };
        });

        // Insert only new records to Supabase (don't update existing)
        const { error } = await supabase
          .from("orders")
          .upsert(transformedBatch, { onConflict: 'order_code', ignoreDuplicates: true });

        if (error) {
          console.error("Batch error:", error);
          // Capture the first error closely
          if (!lastError) lastError = error;
          errorCount += batch.length;
        } else {
          successCount += batch.length;

          // Log changes asynchronously
          const userEmail = localStorage.getItem('userEmail') || 'system_sync';
          const validLogEntries = [];

          // Create a lookup map for current data to find old values
          const currentDataMap = new Map();
          if (Array.isArray(allData)) {
            allData.forEach(row => {
              if (row["Mã đơn hàng"]) currentDataMap.set(String(row["Mã đơn hàng"]), row);
            });
          }

          transformedBatch.forEach(newItem => {
            const oldItem = currentDataMap.get(String(newItem.order_code));

            // POLICY: ONLY ADD NEW, DO NOT UPDATE
            // So if oldItem exists, the DB upsert with ignoreDuplicates: true did NOTHING.
            // Therefore, we should NOT log any changes for existing items.

            if (!oldItem) {
              // Truly new item
              validLogEntries.push({
                action: 'SYNC_F3',
                table_name: 'orders',
                record_id: newItem.order_code,
                user_email: userEmail,
                old_value: null,
                new_value: JSON.stringify(newItem),
                details: {
                  note: `Đồng bộ đơn mới: Trạng thái "${newItem.delivery_status || ''}"`,
                  orderCode: newItem.order_code
                }
              });
            }
            // Else: Item exists. Since ignoreDuplicates is TRUE, nothing happened in DB.
            // LOG NOTHING.
          });

          Promise.all(validLogEntries.map(entry => logDataChange(entry)))
            .catch(err => console.error("Logging sync error", err));
        }
      }

      let msg = `Đồng bộ hoàn tất!\nThành công: ${successCount}\nLỗi: ${errorCount}`;
      if (lastError) {
        msg += `\n\nChi tiết lỗi cuối cùng: ${lastError.message || JSON.stringify(lastError)}`;
      }
      alert(msg);
      loadData(); // Reload table

    } catch (error) {
      console.error("Sync error:", error);
      alert("Lỗi quá trình đồng bộ: " + error.message);
    } finally {
      setSyncing(false);
    }
  };

  // --- FEATURE: FIX MISSING TEAMS ---
  const handleFixMissingTeams = async () => {
    if (!window.confirm("Bạn có muốn tự động điền 'Chi nhánh' (Team) cho các đơn hàng bị thiếu không?\n\nHệ thống sẽ dựa vào tên 'Nhân viên Sale' để tra cứu chi nhánh.")) return;

    setIsFixingTeams(true);
    try {
      // 1. Fetch orders with missing team
      // team is null OR team is empty string OR team is '-'
      const { data: ordersMissing, error: fetchError } = await supabase
        .from('orders')
        .select('id, sale_staff')
        .or('team.is.null,team.eq.,team.eq.-,team.eq.""');

      if (fetchError) throw fetchError;

      if (!ordersMissing || ordersMissing.length === 0) {
        alert("✅ Không tìm thấy đơn hàng nào bị thiếu thông tin Team.");
        return;
      }

      console.log(`Found ${ordersMissing.length} orders detecting missing team.`);

      // 2. Get unique sale staff names
      const staffNames = [...new Set(ordersMissing.map(o => o.sale_staff).filter(Boolean).map(s => s.trim()))];

      if (staffNames.length === 0) {
        alert("⚠️ Các đơn thiếu Team đều không có tên Nhân viên Sale, không thể tự sửa.");
        return;
      }

      // 3. Fetch users map (name -> branch)
      // We need to fetch ALL users matching these names.
      // Since 'ilike' with array is tricky, let's fetch matching users loosely
      // or just fetch all sales? No, too many.
      // Let's iterate in chunks or just fetch all valid users if database isn't huge.
      // Better: Fetch all users who have a branch.
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('name, branch')
        .not('branch', 'is', null)
        .neq('branch', '');

      if (userError) throw userError;

      // Create a map: clean_name -> branch
      // Normalization: trim, lowercase? Let's try exact match first then loose.
      const userMap = {};
      users.forEach(u => {
        if (u.name) userMap[u.name.trim().toLowerCase()] = u.branch;
      });

      // 4. Prepare updates
      let updateCount = 0;
      const updates = [];

      for (const order of ordersMissing) {
        const saleName = order.sale_staff ? order.sale_staff.trim() : "";
        if (!saleName) continue;

        const branch = userMap[saleName.toLowerCase()];
        if (branch) {
          updates.push({
            id: order.id,
            team: branch
          });
        }
      }

      if (updates.length === 0) {
        alert("⚠️ Không tìm thấy thông tin Chi nhánh của các nhân viên Sale tương ứng trong bảng Users.");
        return;
      }

      // 5. Execute updates
      // Supabase upsert requires unique key, but we are updating by ID.
      // Bulk update is tricky in Supabase without proper RPC or Upsert.
      // Upsert works if we provide all required fields, but we only want to patch 'team'.
      // So safest way is individual updates or loops.
      // For performance, do simple loop for now (assuming not thousands).

      // Optimization: Group by branch to reduce calls?
      // No, ID is unique.

      console.log(`Updating ${updates.length} orders...`);

      let success = 0;
      // Process in chunks of 10 parallel requests
      const chunkSize = 10;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (u) => {
          const { error } = await supabase.from('orders').update({ team: u.team }).eq('id', u.id);
          if (!error) success++;
        }));
      }

      alert(`✅ Đã cập nhật xong!\n- Tìm thấy: ${ordersMissing.length} đơn thiếu.\n- Sửa thành công: ${success} đơn.\n- Không tìm thấy thông tin sale: ${ordersMissing.length - success} đơn.`);

    } catch (err) {
      console.error('Error fixing teams:', err);
      alert(`❌ Lỗi: ${err.message}`);
    } finally {
      setIsFixingTeams(false);
      loadData();
    }
  };

  /** Đổi Ca từ "Giữa ca" → "Giữa ca,Hết ca" trong cùng phạm vi team / nhân sự / ngày như Tải lại */
  const handleFixGiuaCaShift = async () => {
    if (
      !window.confirm(
        'Đổi trường Ca từ "Giữa ca" sang "Giữa ca,Hết ca" cho các đơn trong phạm vi lọc hiện tại (chi nhánh, nhân sự, khoảng ngày) giống khi bấm Tải lại?\n\nChỉ các đơn đang là đúng "Giữa ca" (không có dấu phẩy / Hết ca) mới được cập nhật.'
      )
    )
      return;

    setIsFixingShift(true);
    try {
      const userJson = localStorage.getItem('user');
      const user = userJson ? JSON.parse(userJson) : null;
      const userName =
        localStorage.getItem('username') ||
        user?.['Họ_và_tên'] ||
        user?.['Họ và tên'] ||
        user?.['Tên'] ||
        user?.username ||
        user?.name ||
        '';

      const normalizeNameForQuery = (str) => {
        if (!str) return '';
        return String(str).trim().replace(/\s+/g, ' ');
      };

      const applyTeamAndPersonnel = (q) => {
        let query = q;
        if (teamFilter === 'RD') {
          query = query.eq('team', 'RD');
        } else {
          query = query.or('team.is.null,team.neq.RD');
        }
        if (!isAdmin) {
          if (selectedPersonnelNames.length > 0) {
            const allNames = [...new Set([...selectedPersonnelNames, userName].filter(Boolean))];
            const orConditions = allNames.flatMap((name) => {
              const normalizedName = normalizeNameForQuery(name);
              return [
                `sale_staff.ilike.%${normalizedName}%`,
                `marketing_staff.ilike.%${normalizedName}%`,
                `delivery_staff.ilike.%${normalizedName}%`,
              ];
            });
            query = query.or(orConditions.join(','));
          } else if (userName) {
            const normalizedUserName = normalizeNameForQuery(userName);
            query = query.or(
              `sale_staff.ilike.%${normalizedUserName}%,marketing_staff.ilike.%${normalizedUserName}%,delivery_staff.ilike.%${normalizedUserName}%`
            );
          }
        }
        return query;
      };

      const PAGE = 1000;
      const toUpdateIds = new Set();

      const collectMatchingIds = (rows) => {
        for (const r of rows || []) {
          if (r?.id && isOnlyGiuaCaShift(r.shift)) toUpdateIds.add(r.id);
        }
      };

      let from = 0;
      while (true) {
        let q = applyTeamAndPersonnel(supabase.from('orders').select('id, shift'));
        if (startDate) q = q.gte('order_date', startDate);
        if (endDate) q = q.lte('order_date', endDate);
        const { data, error } = await q.order('order_date', { ascending: false }).range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        collectMatchingIds(batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }

      if (startDate && endDate) {
        const { start: cStart, end: cEnd } = orderRangeToCreatedAtIsoBounds(startDate, endDate);
        let qNull = applyTeamAndPersonnel(supabase.from('orders').select('id, shift'));
        qNull = qNull.is('order_date', null).gte('created_at', cStart).lte('created_at', cEnd);
        from = 0;
        while (true) {
          const { data: nb, error: ne } = await qNull
            .order('created_at', { ascending: false })
            .range(from, from + PAGE - 1);
          if (ne) {
            console.warn('⚠️ [Chỉnh ca] Không gộp được đơn order_date null:', ne.message);
            break;
          }
          const batch = nb || [];
          collectMatchingIds(batch);
          if (batch.length < PAGE) break;
          from += PAGE;
        }
      }

      const ids = [...toUpdateIds];
      if (ids.length === 0) {
        toast.info('Không có đơn nào có Ca = "Giữa ca" (thuần) trong phạm vi lọc.');
        return;
      }

      const chunkSize = 10;
      let success = 0;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (id) => {
            const { error } = await supabase.from('orders').update({ shift: SHIFT_GIUA_CA_HET_CA }).eq('id', id);
            if (!error) success++;
          })
        );
      }

      toast.success(`Đã cập nhật Ca → "${SHIFT_GIUA_CA_HET_CA}" cho ${success} đơn.`);
    } catch (err) {
      console.error('Chỉnh ca error:', err);
      toast.error(`Lỗi: ${err.message}`);
    } finally {
      setIsFixingShift(false);
      loadData();
    }
  };

  // Handle Delete All
  const handleDeleteAll = async () => {
    const confirm1 = window.confirm(
      "⚠️ CẢNH BÁO NGHIÊM TRỌNG!\n\n" +
      "Bạn sắp XÓA TOÀN BỘ dữ liệu đơn hàng trong hệ thống!\n\n" +
      "Hành động này KHÔNG THỂ HOÀN TÁC!\n\n" +
      "Nhấn OK để tiếp tục, hoặc Cancel để hủy."
    );

    if (!confirm1) return;

    const confirm2 = window.confirm(
      "⚠️ XÁC NHẬN LẦN CUỐI!\n\n" +
      "Bạn có chắc chắn muốn xóa TẤT CẢ đơn hàng?\n" +
      "Tất cả dữ liệu sẽ bị mất vĩnh viễn!\n\n" +
      "Nhập 'XÓA' vào ô bên dưới để xác nhận."
    );

    if (!confirm2) return;

    const userInput = window.prompt(
      "Nhập 'XÓA' để xác nhận xóa toàn bộ dữ liệu:"
    );

    if (userInput !== 'XÓA') {
      alert("Xác nhận không đúng. Hủy bỏ thao tác xóa.");
      return;
    }

    try {
      setDeleting(true);
      console.log('🗑️ Starting delete all orders...');

      // Try delete all first
      const { error } = await supabase
        .from('orders')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (hack for delete all)

      if (error) {
        console.log('⚠️ First delete method failed, trying batch delete...', error);

        // If the above doesn't work, try deleting by selecting all IDs first
        const { data: allRecords, error: fetchError } = await supabase
          .from('orders')
          .select('id')
          .limit(100000); // Increase limit for orders table

        if (fetchError) {
          console.error('❌ Error fetching order IDs:', fetchError);
          throw fetchError;
        }

        if (allRecords && allRecords.length > 0) {
          console.log(`📋 Found ${allRecords.length} orders to delete. Deleting in batches...`);
          const ids = allRecords.map(r => r.id);

          // Delete in batches
          const batchSize = 1000;
          let deletedCount = 0;

          for (let i = 0; i < ids.length; i += batchSize) {
            const batch = ids.slice(i, i + batchSize);
            const { error: batchError } = await supabase
              .from('orders')
              .delete()
              .in('id', batch);

            if (batchError) {
              console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} error:`, batchError);
              throw batchError;
            }

            deletedCount += batch.length;
            console.log(`✅ Deleted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} orders (Total: ${deletedCount}/${ids.length})`);
          }

          alert(`✅ Đã xóa toàn bộ ${deletedCount} đơn hàng thành công!`);
        } else {
          alert("ℹ️ Không có dữ liệu để xóa.");
        }
      } else {
        alert("✅ Đã xóa toàn bộ dữ liệu đơn hàng thành công!");
      }

      setAllData([]); // Clear local state
      loadData(); // Reload to refresh
    } catch (error) {
      console.error('❌ Delete all error:', error);
      alert(`❌ Lỗi xóa toàn bộ dữ liệu: ${error.message || String(error)}\n\nVui lòng kiểm tra Console để xem chi tiết.`);
    } finally {
      setDeleting(false);
    }
  };

  // Handle View History - Show history modal
  const handleViewHistory = async (orderCode) => {
    if (!orderCode || orderCode.startsWith('UNK-') || orderCode.startsWith('NO_CODE_')) {
      toast.error('Không thể xem lịch sử đơn hàng này vì thiếu mã đơn hàng');
      return;
    }

    setHistoryOrderCode(orderCode);
    setShowHistoryModal(true);
    setLoadingHistory(true);

    try {
      const { data, error } = await supabase
        .from('sales_order_logs')
        .select('*')
        .eq('order_code', orderCode)
        .order('changed_at', { ascending: false });

      if (error) throw error;

      setHistoryLogs(data || []);
    } catch (error) {
      console.error('Error fetching history:', error);
      toast.error('Lỗi khi tải lịch sử chỉnh sửa: ' + error.message);
      setHistoryLogs([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Helper to get changes from old and new data
  const getHistoryChanges = (oldData, newData) => {
    const changes = [];
    if (!oldData || !newData) return changes;

    Object.keys(newData).forEach(key => {
      // Skip metadata columns
      if (['updated_at', 'last_modified_by', 'created_at', 'id', 'order_time'].includes(key)) return;

      const oldVal = oldData[key];
      const newVal = newData[key];

      // Check if values are different
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        // Map database key to display name
        const displayKey = COLUMN_MAPPING[key] || key;
        changes.push({
          key,
          label: displayKey,
          old: oldVal,
          new: newVal
        });
      }
    });

    return changes;
  };

  // Handle Edit - Navigate to edit page
  const handleEdit = (orderCode) => {
    if (!orderCode || orderCode.startsWith('UNK-') || orderCode.startsWith('NO_CODE_')) {
      toast.error('Không thể chỉnh sửa đơn hàng này vì thiếu mã đơn hàng');
      return;
    }
    // Navigate to edit page (chinh-sua-don) with orderId in query params
    navigate(`/chinh-sua-don?orderId=${encodeURIComponent(orderCode)}`);
  };

  // Handle Delete
  const handleDelete = async (orderCode, rowId) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa đơn hàng này? Hành động này không thể hoàn tác.")) return;

    try {
      setLoading(true);
      let error = null;

      if (orderCode && !orderCode.startsWith('UNK-') && !orderCode.startsWith('NO_CODE_')) {
        // Delete by order_code
        const res = await supabase.from('orders').delete().eq('order_code', orderCode);
        error = res.error;
      } else if (rowId) {
        // Delete by ID (fallback for orders without code)
        const res = await supabase.from('orders').delete().eq('id', rowId);
        error = res.error;
      } else {
        throw new Error("Không tìm thấy thông tin định danh để xóa (Mã đơn hoặc ID).");
      }

      if (error) throw error;

      alert("✅ Đã xóa đơn hàng thành công!");

      // Update local state directly instead of reloading
      setAllData(prev => prev.filter(item => {
        if (orderCode && item['Mã đơn hàng'] === orderCode) return false;
        if (rowId && item._id === rowId) return false;
        return true;
      }));
      setLoading(false);
    } catch (err) {
      console.error("Delete error:", err);
      alert(`❌ Lỗi xóa đơn hàng: ${err.message}`);
      setLoading(false);
    }
  };

  const uniqueProducts = useMemo(() => {
    const products = new Set();
    let hasEmpty = false;
    allData.forEach(row => {
      const product = row["Mặt hàng"];
      if (product && String(product).trim()) {
        products.add(String(product).trim());
      } else {
        hasEmpty = true;
      }
    });
    const sortedProducts = Array.from(products).sort();
    if (hasEmpty) {
      return ['(Trống)', ...sortedProducts];
    }
    return sortedProducts;
  }, [allData]);

  const uniqueStatuses = useMemo(() => {
    const statuses = new Set();
    let hasEmpty = false;
    allData.forEach(row => {
      const status = row["Trạng thái giao hàng"];
      if (status && String(status).trim()) {
        statuses.add(String(status).trim());
      } else {
        hasEmpty = true;
      }
    });
    const sortedStatuses = Array.from(statuses).sort();
    if (hasEmpty) {
      return ['(Trống)', ...sortedStatuses];
    }
    return sortedStatuses;
  }, [allData]);

  const uniqueCheckResults = useMemo(() => {
    const checkResults = new Set();
    let hasEmpty = false;
    allData.forEach(row => {
      const checkResult = row["Kết quả Check"];
      if (checkResult && String(checkResult).trim()) {
        checkResults.add(String(checkResult).trim());
      } else {
        hasEmpty = true;
      }
    });
    const sortedCheckResults = Array.from(checkResults).sort();
    if (hasEmpty) {
      return ['(Trống)', ...sortedCheckResults];
    }
    return sortedCheckResults;
  }, [allData]);

  const uniqueSaleStaff = useMemo(() => {
    const vals = new Set();
    allData.forEach(row => {
      const v = row["Nhân viên Sale"];
      if (v && String(v).trim()) vals.add(String(v).trim());
    });
    return Array.from(vals).sort();
  }, [allData]);

  const uniqueMktStaff = useMemo(() => {
    const vals = new Set();
    allData.forEach(row => {
      const v = row["Nhân viên Marketing"];
      if (v && String(v).trim()) vals.add(String(v).trim());
    });
    return Array.from(vals).sort();
  }, [allData]);

  const uniqueDeliveryStaff = useMemo(() => {
    const vals = new Set();
    allData.forEach(row => {
      const v = row["NV Vận đơn"];
      if (v && String(v).trim()) vals.add(String(v).trim());
    });
    return Array.from(vals).sort();
  }, [allData]);



  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = [...allData];

    // View này chỉ hiển thị dữ liệu chi nhánh Hà Nội.
    data = data.filter((row) => {
      const raw = String(row["Team"] ?? row["Chi nhánh"] ?? '').trim().toLowerCase();
      return raw === 'hà nội' || raw === 'ha noi' || raw === 'hanoi';
    });

    // Filter by selected personnel (nếu có)
    // Admin KHÔNG bị filter, luôn xem tất cả đơn
    // Giờ selectedPersonnelNames chứa TÊN trực tiếp từ DB
    // Match với các cột: "Nhân viên Marketing", "Nhân viên Sale", "NV Vận đơn"
    if (!isAdmin && selectedPersonnelNames.length > 0) {
      const beforeFilter = data.length;
      let debugCount = 0;

      data = data.filter((row, index) => {
        const marketingStaff = String(row["Nhân viên Marketing"] || '').toLowerCase().trim();
        const salesStaff = String(row["Nhân viên Sale"] || '').toLowerCase().trim();
        const deliveryStaff = String(row["NV Vận đơn"] || row["Nhân viên Vận đơn"] || '').toLowerCase().trim();

        // Match theo tên (selectedPersonnelNames giờ là tên trực tiếp)
        const matchByName = selectedPersonnelNames.some(name => {
          const nameLower = name.toLowerCase().trim();
          // Match tên trong cột "Nhân viên Marketing" HOẶC "Nhân viên Sale" HOẶC "NV Vận đơn"
          return (marketingStaff && marketingStaff.includes(nameLower)) ||
            (salesStaff && salesStaff.includes(nameLower)) ||
            (deliveryStaff && deliveryStaff.includes(nameLower));
        });

        // Debug log cho 3 row đầu tiên
        if (debugCount < 3 && index < 10) {
          debugCount++;
          console.log('🔍 Row check:', {
            index,
            orderCode: row["Mã đơn hàng"],
            marketingStaff: marketingStaff || '(trống)',
            salesStaff: salesStaff || '(trống)',
            deliveryStaff: deliveryStaff || '(trống)',
            selectedNames: selectedPersonnelNames,
            matchByName,
            matched: matchByName
          });
        }

        return matchByName;
      });

      const afterFilter = data.length;
      console.log(`📊 Filter by personnel: ${beforeFilter} → ${afterFilter} đơn hàng`);
      console.log(`👥 Đang filter theo ${selectedPersonnelNames.length} tên nhân sự (Marketing/Sale/Vận đơn)`);
    } else {
      console.log('ℹ️ Không có selectedPersonnel, hiển thị tất cả đơn hàng');
    }

    // Search filter (using debounced value) - Tìm kiếm toàn diện thông tin khách hàng và nhân viên
    if (debouncedSearchText) {
      const searchLower = debouncedSearchText.toLowerCase();
      data = data.filter(row => {
        return (
          // Thông tin đơn hàng
          String(row["Mã đơn hàng"] || '').toLowerCase().includes(searchLower) ||
          String(row["Mã Tracking"] || '').toLowerCase().includes(searchLower) ||
          // Thông tin khách hàng - Tên
          String(row["Name*"] || '').toLowerCase().includes(searchLower) ||
          // Thông tin khách hàng - Số điện thoại
          String(row["Phone*"] || '').toLowerCase().includes(searchLower) ||
          // Thông tin khách hàng - Địa chỉ
          String(row["Add"] || '').toLowerCase().includes(searchLower) ||
          String(row["City"] || '').toLowerCase().includes(searchLower) ||
          String(row["State"] || '').toLowerCase().includes(searchLower) ||
          String(row["Zipcode"] || '').toLowerCase().includes(searchLower) ||
          // Khu vực
          String(row["Khu vực"] || '').toLowerCase().includes(searchLower) ||
          // Tên nhân viên - Marketing, Sale, CSKH, Vận đơn
          String(row["Nhân viên Marketing"] || '').toLowerCase().includes(searchLower) ||
          String(row["Nhân viên Sale"] || '').toLowerCase().includes(searchLower) ||
          String(row["CSKH"] || '').toLowerCase().includes(searchLower) ||
          String(row["NV Vận đơn"] || '').toLowerCase().includes(searchLower) ||
          // Team
          String(row["Team"] || '').toLowerCase().includes(searchLower)
        );
      });
    }

    // Date Range Filter
    if (startDate || endDate) {
      data = data.filter(row => isDateInRange(row["Ngày lên đơn"], startDate, endDate));
    }

    // Market filter - Hỗ trợ multi-select và giá trị trống
    if (filterMarket.length > 0) {
      data = data.filter(row => {
        const market = row["Khu vực"] || row["khu vực"];
        const marketStr = market ? String(market).trim() : '';

        // Kiểm tra nếu có chọn "(Trống)"
        if (filterMarket.includes('(Trống)')) {
          if (!marketStr) return true; // Nếu giá trị trống và đã chọn "(Trống)"
        }

        // Kiểm tra các giá trị khác
        return filterMarket.includes(marketStr);
      });
    }

    // Product filter - Hỗ trợ multi-select và giá trị trống
    if (filterProduct.length > 0) {
      data = data.filter(row => {
        const product = row["Mặt hàng"];
        const productStr = product ? String(product).trim() : '';

        if (filterProduct.includes('(Trống)')) {
          if (!productStr) return true;
        }

        return filterProduct.includes(productStr);
      });
    }

    // Status filter - Hỗ trợ multi-select và giá trị trống
    if (filterStatus.length > 0) {
      data = data.filter(row => {
        const status = row["Trạng thái giao hàng"];
        const statusStr = status ? String(status).trim() : '';

        if (filterStatus.includes('(Trống)')) {
          if (!statusStr) return true;
        }

        return filterStatus.includes(statusStr);
      });
    }

    // Check Result filter - Hỗ trợ multi-select và giá trị trống
    if (filterCheckResult.length > 0) {
      data = data.filter(row => {
        const checkResult = row["Kết quả Check"];
        const checkResultStr = checkResult ? String(checkResult).trim() : '';

        if (filterCheckResult.includes('(Trống)')) {
          if (!checkResultStr) return true;
        }

        return filterCheckResult.includes(checkResultStr);
      });
    }

    // Sale Staff filter
    if (filterSaleStaff.length > 0) {
      data = data.filter(row => {
        const val = row["Nhân viên Sale"] ? String(row["Nhân viên Sale"]).trim() : '';
        return filterSaleStaff.includes(val);
      });
    }

    // MKT Staff filter
    if (filterMktStaff.length > 0) {
      data = data.filter(row => {
        const val = row["Nhân viên Marketing"] ? String(row["Nhân viên Marketing"]).trim() : '';
        return filterMktStaff.includes(val);
      });
    }

    // Delivery Staff filter
    if (filterDeliveryStaff.length > 0) {
      data = data.filter(row => {
        const val = row["NV Vận đơn"] ? String(row["NV Vận đơn"]).trim() : '';
        return filterDeliveryStaff.includes(val);
      });
    }





    // Sort
    if (sortColumn) {
      data.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        // Specific handling for Date column sorting
        if (sortColumn === 'Ngày lên đơn') {
          const dA = parseSmartDate(aVal);
          const dB = parseSmartDate(bVal);
          if (!dA) return 1;
          if (!dB) return -1;
          return sortDirection === 'asc' ? dA - dB : dB - dA;
        }

        const comparison = String(aVal || '').localeCompare(String(bVal || ''), 'vi', { numeric: true });
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return data;
  }, [allData, debouncedSearchText, startDate, endDate, isAdmin, filterMarket, filterProduct, filterStatus, filterCheckResult, filterSaleStaff, filterMktStaff, filterDeliveryStaff, sortColumn, sortDirection, selectedPersonnelNames, selectedPersonnelEmails, personnelEmailToNameMap]);

  // Handle Ctrl+C to copy selected row
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedRowId === null) return;

        const row = filteredData[selectedRowId];
        if (!row) return;

        e.preventDefault();

        // Format data based on visible columns
        const rowValues = displayColumns.map(col => {
          const key = COLUMN_MAPPING[col] || col;
          let value = row[key] ?? row[col] ?? '';

          // Format date
          if (col.includes('Ngày')) {
            value = formatDate(value);
          }

          // Format money
          if (col === 'Tổng tiền VNĐ') {
            const num = parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
            value = num.toLocaleString('vi-VN') + ' ₫';
          }

          return String(value ?? '').replace(/\t/g, ' ').trim();
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



  // Copy single cell content (click)
  const handleCellClick = async (e, value) => {
    const textValue = String(value ?? '').trim();
    if (!textValue || textValue === '-') {
      toast.success("⚠️ Ô này không có nội dung", { autoClose: 1500, hideProgressBar: true });
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

  // Lọc các cột có thể hiển thị trong modal (loại bỏ các cột bị ẩn)
  const visibleColumnsInModal = useMemo(() => {
    return allAvailableColumns.filter(col => !HIDDEN_COLUMNS.includes(col));
  }, [allAvailableColumns]);

  // Handle column visibility toggle
  const toggleColumn = (column) => {
    // Không cho phép toggle các cột bị ẩn
    if (HIDDEN_COLUMNS.includes(column)) {
      return;
    }
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  // Select all columns (trừ các cột bị ẩn)
  const selectAllColumns = () => {
    const all = { ...visibleColumns };
    visibleColumnsInModal.forEach(col => {
      all[col] = true;
    });
    // Đảm bảo các cột bị ẩn luôn là false
    HIDDEN_COLUMNS.forEach(col => {
      all[col] = false;
    });
    setVisibleColumns(all);
  };

  // Deselect all columns (trừ các cột bị ẩn)
  const deselectAllColumns = () => {
    const none = { ...visibleColumns };
    visibleColumnsInModal.forEach(col => {
      none[col] = false;
    });
    // Đảm bảo các cột bị ẩn luôn là false
    HIDDEN_COLUMNS.forEach(col => {
      none[col] = false;
    });
    setVisibleColumns(none);
  };

  // Reset to default columns (trừ các cột bị ẩn)
  const resetToDefault = () => {
    const defaultCols = { ...visibleColumns };
    defaultColumns.forEach(col => {
      if (!HIDDEN_COLUMNS.includes(col)) {
        defaultCols[col] = true;
      }
    });
    // Đảm bảo các cột bị ẩn luôn là false
    HIDDEN_COLUMNS.forEach(col => {
      defaultCols[col] = false;
    });
    setVisibleColumns(defaultCols);
  };

  if (!canView(permissionCode)) {
    return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">

              <div>
                <h1 className="text-xl font-bold text-gray-800">DANH SÁCH ĐƠN HÀNG</h1>
                <p className="text-xs text-gray-500">Dữ liệu từ Database</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                <span className={`h-2 w-2 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-sm text-gray-600">
                  {filteredData.length} / {allData.length} đơn hàng
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-sm font-semibold text-blue-700">Số đơn:</span>
                <span className="text-sm text-blue-600">{filteredData.length}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg border border-green-200">
                <span className="text-sm font-semibold text-green-700">Tổng tiền:</span>
                <span className="text-sm text-green-600">
                  {filteredData.reduce((sum, row) => {
                    const amount = parseFloat(String(row["Tổng tiền VNĐ"] || 0).replace(/[^\d.-]/g, '')) || 0;
                    return sum + amount;
                  }, 0).toLocaleString('vi-VN')} ₫
                </span>
              </div>
              {isAdmin && (
                <>
                  <button
                    onClick={handleFixMissingTeams}
                    disabled={syncing || loading || deleting || isFixingTeams || isFixingShift}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                  >
                    {isFixingTeams ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <Wrench className="w-4 h-4" />
                        Sửa lỗi Team
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleFixGiuaCaShift}
                    disabled={syncing || loading || deleting || isFixingTeams || isFixingShift}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                  >
                    {isFixingShift ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4" />
                        Chỉnh ca
                      </>
                    )}
                  </button>
                </>
              )}
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
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tìm kiếm</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm kiếm: mã đơn, tên KH, tên NV, SĐT, địa chỉ, tracking..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>
            </div>

            {/* Date Range Filter */}
            <div className="flex gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Từ ngày</label>
                <input
                  type="date"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Đến ngày</label>
                <input
                  type="date"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Market Filter - Multi-select với checkbox */}
            <div className="min-w-[200px] relative">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Khu vực</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMarketFilter(!showMarketFilter)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterMarket.length === 0
                      ? 'Tất cả'
                      : filterMarket.length === 1
                        ? filterMarket[0]
                        : `Đã chọn ${filterMarket.length}`}
                  </span>
                  <span className="ml-2">▼</span>
                </button>

                {showMarketFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn khu vực:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setFilterMarket([]);
                            setShowMarketFilter(false);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Bỏ chọn tất cả
                        </button>
                      </div>
                      {uniqueMarkets.map(market => {
                        const isChecked = filterMarket.includes(market);
                        return (
                          <label
                            key={market}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterMarket([...filterMarket, market]);
                                } else {
                                  setFilterMarket(filterMarket.filter(m => m !== market));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{market}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Click outside to close */}
              {showMarketFilter && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMarketFilter(false)}
                />
              )}
            </div>

            {/* Product Filter - Multi-select với checkbox */}
            <div className="min-w-[200px] relative">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Mặt hàng</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowProductFilter(!showProductFilter)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterProduct.length === 0
                      ? 'Tất cả'
                      : filterProduct.length === 1
                        ? filterProduct[0]
                        : `Đã chọn ${filterProduct.length}`}
                  </span>
                  <span className="ml-2">▼</span>
                </button>

                {showProductFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn mặt hàng:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setFilterProduct([]);
                            setShowProductFilter(false);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Bỏ chọn tất cả
                        </button>
                      </div>
                      {uniqueProducts.map(product => {
                        const isChecked = filterProduct.includes(product);
                        return (
                          <label
                            key={product}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterProduct([...filterProduct, product]);
                                } else {
                                  setFilterProduct(filterProduct.filter(p => p !== product));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{product}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {showProductFilter && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowProductFilter(false)}
                />
              )}
            </div>

            {/* Status Filter - Multi-select với checkbox */}
            <div className="min-w-[200px] relative">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Trạng thái</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowStatusFilter(!showStatusFilter)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterStatus.length === 0
                      ? 'Tất cả'
                      : filterStatus.length === 1
                        ? filterStatus[0]
                        : `Đã chọn ${filterStatus.length}`}
                  </span>
                  <span className="ml-2">▼</span>
                </button>

                {showStatusFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn trạng thái:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setFilterStatus([]);
                            setShowStatusFilter(false);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Bỏ chọn tất cả
                        </button>
                      </div>
                      {uniqueStatuses.map(status => {
                        const isChecked = filterStatus.includes(status);
                        return (
                          <label
                            key={status}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterStatus([...filterStatus, status]);
                                } else {
                                  setFilterStatus(filterStatus.filter(s => s !== status));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{status}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {showStatusFilter && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowStatusFilter(false)}
                />
              )}
            </div>

            {/* Check Result Filter - Multi-select với checkbox */}
            <div className="min-w-[200px] relative">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Kết quả Check</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCheckResultFilter(!showCheckResultFilter)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterCheckResult.length === 0
                      ? 'Tất cả'
                      : filterCheckResult.length === 1
                        ? filterCheckResult[0]
                        : `Đã chọn ${filterCheckResult.length}`}
                  </span>
                  <span className="ml-2">▼</span>
                </button>

                {showCheckResultFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn kết quả check:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setFilterCheckResult([]);
                            setShowCheckResultFilter(false);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Bỏ chọn tất cả
                        </button>
                      </div>
                      {uniqueCheckResults.map(checkResult => {
                        const isChecked = filterCheckResult.includes(checkResult);
                        return (
                          <label
                            key={checkResult}
                            className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterCheckResult([...filterCheckResult, checkResult]);
                                } else {
                                  setFilterCheckResult(filterCheckResult.filter(c => c !== checkResult));
                                }
                              }}
                              className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                            />
                            <span className="ml-2 text-sm text-gray-700">{checkResult}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {showCheckResultFilter && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowCheckResultFilter(false)}
                />
              )}
            </div>

            {/* Sale Staff Filter */}
            <div className="min-w-[200px] relative">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nhân viên Sale</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSaleStaffFilter(!showSaleStaffFilter)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterSaleStaff.length === 0
                      ? 'Tất cả'
                      : filterSaleStaff.length === 1
                        ? filterSaleStaff[0]
                        : `Đã chọn ${filterSaleStaff.length}`}
                  </span>
                  <span className="ml-2">▼</span>
                </button>
                {showSaleStaffFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn NV Sale:</span>
                        <button type="button" onClick={() => { setFilterSaleStaff([]); setShowSaleStaffFilter(false); }} className="text-xs text-blue-600 hover:text-blue-800">Bỏ chọn tất cả</button>
                      </div>
                      {uniqueSaleStaff.map(name => (
                        <label key={name} className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filterSaleStaff.includes(name)}
                            onChange={(e) => {
                              if (e.target.checked) setFilterSaleStaff([...filterSaleStaff, name]);
                              else setFilterSaleStaff(filterSaleStaff.filter(v => v !== name));
                            }}
                            className="w-4 h-4 ml-1 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                          />
                          <span className="ml-2 text-sm text-gray-700">{name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {showSaleStaffFilter && (
                <div className="fixed inset-0 z-40" onClick={() => setShowSaleStaffFilter(false)} />
              )}
            </div>

            {/* MKT Staff Filter */}
            <div className="min-w-[200px] relative">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nhân viên MKT</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMktStaffFilter(!showMktStaffFilter)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterMktStaff.length === 0
                      ? 'Tất cả'
                      : filterMktStaff.length === 1
                        ? filterMktStaff[0]
                        : `Đã chọn ${filterMktStaff.length}`}
                  </span>
                  <span className="ml-2">▼</span>
                </button>
                {showMktStaffFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn NV MKT:</span>
                        <button type="button" onClick={() => { setFilterMktStaff([]); setShowMktStaffFilter(false); }} className="text-xs text-blue-600 hover:text-blue-800">Bỏ chọn tất cả</button>
                      </div>
                      {uniqueMktStaff.map(name => (
                        <label key={name} className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filterMktStaff.includes(name)}
                            onChange={(e) => {
                              if (e.target.checked) setFilterMktStaff([...filterMktStaff, name]);
                              else setFilterMktStaff(filterMktStaff.filter(v => v !== name));
                            }}
                            className="w-4 h-4 ml-1 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                          />
                          <span className="ml-2 text-sm text-gray-700">{name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {showMktStaffFilter && (
                <div className="fixed inset-0 z-40" onClick={() => setShowMktStaffFilter(false)} />
              )}
            </div>

            {/* Delivery Staff Filter */}
            <div className="min-w-[200px] relative">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nhân viên vận đơn</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowDeliveryStaffFilter(!showDeliveryStaffFilter)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {filterDeliveryStaff.length === 0
                      ? 'Tất cả'
                      : filterDeliveryStaff.length === 1
                        ? filterDeliveryStaff[0]
                        : `Đã chọn ${filterDeliveryStaff.length}`}
                  </span>
                  <span className="ml-2">▼</span>
                </button>
                {showDeliveryStaffFilter && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-xs font-semibold text-gray-700">Chọn NV vận đơn:</span>
                        <button type="button" onClick={() => { setFilterDeliveryStaff([]); setShowDeliveryStaffFilter(false); }} className="text-xs text-blue-600 hover:text-blue-800">Bỏ chọn tất cả</button>
                      </div>
                      {uniqueDeliveryStaff.map(name => (
                        <label key={name} className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filterDeliveryStaff.includes(name)}
                            onChange={(e) => {
                              if (e.target.checked) setFilterDeliveryStaff([...filterDeliveryStaff, name]);
                              else setFilterDeliveryStaff(filterDeliveryStaff.filter(v => v !== name));
                            }}
                            className="w-4 h-4 ml-1 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                          />
                          <span className="ml-2 text-sm text-gray-700">{name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {showDeliveryStaffFilter && (
                <div className="fixed inset-0 z-40" onClick={() => setShowDeliveryStaffFilter(false)} />
              )}
            </div>

            {/* Settings Button - Tất cả người dùng đều có thể sử dụng */}
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
                        {col}
                        {sortColumn === col && (
                          <span className="text-[#F37021]">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>

                  ))}
                  {isAdmin && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Hành động
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={displayColumns.length + (isAdmin ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin h-5 w-5 border-2 border-[#F37021] border-t-transparent rounded-full"></div>
                        Đang tải dữ liệu...
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={displayColumns.length + (isAdmin ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                      Không có dữ liệu phù hợp
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((row, index) => (
                    <tr
                      key={row[PRIMARY_KEY_COLUMN] || index}
                      onClick={() => setSelectedRowId((currentPage - 1) * rowsPerPage + index)}
                      className={`cursor-pointer transition-colors ${selectedRowId === (currentPage - 1) * rowsPerPage + index ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-gray-50'}`}
                    >
                      {displayColumns.map((col) => {
                        const key = COLUMN_MAPPING[col] || col;
                        let value = row[key] ?? row[col] ?? '';

                        // Format date
                        if (col.includes('Ngày')) {
                          value = formatDate(value);
                        }

                        // Format money
                        if (col === 'Tổng tiền VNĐ') {
                          const num = parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
                          value = num.toLocaleString('vi-VN') + ' ₫';
                        }

                        // Special rendering for Payment Bill and Payment Image
                        if (col === 'Payment Bill') {
                          return (
                            <td
                              key={col}
                              className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <select
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={value || ''}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  // Handle update if needed
                                  const newValue = e.target.value;
                                  if (newValue !== value) {
                                    // TODO: Add update logic here if needed
                                    console.log('Update Payment Bill:', row['Mã đơn hàng'], newValue);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="">-- Chọn --</option>
                                <option value="Có bill">Có bill</option>
                                <option value="Bill một phần">Bill một phần</option>
                              </select>
                            </td>
                          );
                        }

                        if (col === 'Payment Image') {
                          return (
                            <td
                              key={col}
                              className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Suspense fallback={<span className="text-gray-400">...</span>}>
                                <BillImageViewer 
                                  paymentImage={value || row['Payment Image'] || row.payment_image || ''}
                                  orderCode={row['Mã đơn hàng'] || row.order_code || ''}
                                />
                              </Suspense>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={col}
                            className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap cursor-copy hover:bg-blue-50 transition-colors"
                            title={`${value || '-'} (Click để copy)`}
                            onClick={(e) => {
                              e.stopPropagation(); // Ngăn chặn select row khi click vào ô
                              handleCellClick(e, value);
                            }}
                          >
                            {value || '-'}
                          </td>
                        );
                      })}
                      {isAdmin && (
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewHistory(row['Mã đơn hàng']);
                              }}
                              className="text-green-500 hover:text-green-700 p-1 rounded hover:bg-green-50 transition-colors"
                              title="Xem lịch sử chỉnh sửa"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {canEdit(permissionCode) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(row['Mã đơn hàng']);
                                }}
                                className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                                title="Chỉnh sửa đơn hàng"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {isAdmin && canDelete(permissionCode) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(row['Mã đơn hàng'], row._id);
                                }}
                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                                title="Xóa đơn hàng"
                              >
                                <Trash2 className="w-4 h-4" />
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

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowHistoryModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Lịch sử chỉnh sửa đơn hàng</h2>
                <p className="text-sm text-gray-500 mt-1">Mã đơn: <span className="font-mono font-bold text-blue-600">{historyOrderCode}</span></p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingHistory ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin h-8 w-8 border-2 border-[#F37021] border-t-transparent rounded-full mx-auto mb-2"></div>
                  Đang tải lịch sử...
                </div>
              ) : historyLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Chưa có lịch sử chỉnh sửa nào cho đơn hàng này.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {historyLogs.map((log, index) => {
                    const changes = getHistoryChanges(log.old_data, log.new_data);
                    if (changes.length === 0) return null;

                    const changedAt = new Date(log.changed_at);
                    const formattedDate = changedAt.toLocaleString('vi-VN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    return (
                      <div key={log.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-300">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                              {log.changed_by ? log.changed_by.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">{log.changed_by || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{formattedDate}</p>
                            </div>
                          </div>
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            {changes.length} thay đổi
                          </span>
                        </div>

                        <div className="space-y-2">
                          {changes.map((change, idx) => (
                            <div key={idx} className="bg-white rounded p-3 border border-gray-200">
                              <div className="font-medium text-sm text-gray-700 mb-1">{change.label}</div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <span className="text-xs text-gray-500">Trước:</span>
                                  <div className="bg-red-50 text-red-700 px-2 py-1 rounded mt-1">
                                    {change.old === null || change.old === '' ? '(Trống)' : String(change.old)}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-xs text-gray-500">Sau:</span>
                                  <div className="bg-green-50 text-green-700 px-2 py-1 rounded mt-1">
                                    {change.new === null || change.new === '' ? '(Trống)' : String(change.new)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

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
        hiddenColumns={HIDDEN_COLUMNS}
      />
    </div >
  );
}

export default DanhSachDon;

