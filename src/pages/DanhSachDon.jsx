import { RefreshCw, Search, Settings, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';

import usePermissions from '../hooks/usePermissions';
import { logDataChange } from '../services/logging';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';
import { COLUMN_MAPPING, PRIMARY_KEY_COLUMN } from '../types';
import { isDateInRange, parseSmartDate } from '../utils/dateParsing';

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
  const searchParams = new URLSearchParams(location.search);
  const teamFilter = searchParams.get('team'); // e.g. 'RD'

  // Permission Logic
  const { canView, canEdit, canDelete, role } = usePermissions();
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
  const [filterProduct, setFilterProduct] = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);
  // Initialize dates with "Last 3 Days"
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [searchDate, setSearchDate] = useState(''); // Keep existing if needed, or remove if redundant


  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [syncing, setSyncing] = useState(false); // State for sync process
  const [selectedRowId, setSelectedRowId] = useState(null); // For copy feature



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

  // Debounce search text for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Get all available columns from data
  const allAvailableColumns = useMemo(() => {
    if (allData.length === 0) return [];

    // Get all potential keys from data
    const allKeys = new Set();
    allData.forEach(row => {
      Object.keys(row).forEach(key => {
        if (key !== PRIMARY_KEY_COLUMN) {
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

  // Default columns

  // Load column visibility from localStorage or use defaults
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('danhSachDon_visibleColumns');
    let initial = {};
    
    if (saved) {
      try {
        initial = JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing saved columns:', e);
      }
    }
    
    // Initialize with default columns
    if (Object.keys(initial).length === 0) {
      defaultColumns.forEach(col => {
        initial[col] = true;
      });
    }
    
    // Đảm bảo các cột cần ẩn luôn bị ẩn
    HIDDEN_COLUMNS.forEach(col => {
      initial[col] = false;
    });
    
    return initial;
  });

  // Update displayColumns based on visibleColumns
  const displayColumns = useMemo(() => {
    return allAvailableColumns.filter(col => visibleColumns[col] === true);
  }, [allAvailableColumns, visibleColumns]);

  // Đảm bảo các cột cần ẩn luôn bị ẩn
  useEffect(() => {
    setVisibleColumns(prev => {
      let updated = { ...prev };
      let changed = false;
      
      HIDDEN_COLUMNS.forEach(col => {
        if (updated[col] !== false) {
          updated[col] = false;
          changed = true;
        }
      });
      
      return changed ? updated : prev;
    });
  }, []); // Chỉ chạy một lần khi component mount

  // Save to localStorage when visibleColumns changes
  useEffect(() => {
    if (Object.keys(visibleColumns).length > 0) {
      // Đảm bảo các cột cần ẩn không được lưu là true
      const toSave = { ...visibleColumns };
      HIDDEN_COLUMNS.forEach(col => {
        toSave[col] = false;
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
    "Khu vực": item.country || item.area, // Fallback to 'area' from new form
    "Zipcode": item.zipcode,
    "Mặt hàng": item.product_main || item.product,
    "Tên mặt hàng 1": item.product_name_1 || item.product_main || item.product,
    "Tổng tiền VNĐ": item.total_amount_vnd,
    "Hình thức thanh toán": item.payment_method_text || item.payment_method, // payment_method_text is new
    "Mã Tracking": item.tracking_code,
    "Phí ship": item.shipping_fee,
    "Nhân viên Marketing": item.marketing_staff || item.marketingStaff || '',
    "Nhân viên Sale": item.sale_staff || item.saleStaff || '',
    "Team": item.team,
    "Trạng thái giao hàng": item.delivery_status,
    "Kết quả Check": item.payment_status,
    "Ghi chú": item.note,
    "CSKH": item.cskh,
    "NV Vận đơn": item.delivery_staff,
    "Tiền Hàng": item.sale_price || item.goods_amount, // Map sale_price (foreign) or goods_amount
    "Tiền Việt đã đối soát": item.reconciled_vnd || item.reconciled_amount, // reconciled_vnd new
    "Phí Chung": item.general_fee,
    "Phí bay": item.flight_fee,
    "Thuê TK": item.account_rental_fee,
    "Phí xử lý đơn đóng hàng-Lưu kho(usd)": item.general_fee,
    "Thời gian cutoff": item.cutoff_time,
    "Đơn vị vận chuyển": item.shipping_unit || item.shipping_carrier, // shipping_carrier might be new?
    "Kế toán xác nhận thu tiền về": item.accountant_confirm,
    "Trạng thái thu tiền": item.payment_status_detail,
    "Lý do": item.reason,
    "Page": item.page_name, // Map Page Name
    "_id": item.id,
    "_source": 'supabase'
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
                country: "Hồ Chí Minh",
                area: "Miền Nam",
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
                country: "Hà Nội",
                area: "Miền Bắc",
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
                country: "Đà Nẵng",
                area: "Miền Trung",
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
      let query = supabase.from('orders').select('*');

      if (teamFilter === 'RD') {
        // If context is R&D, ONLY show R&D data
        query = query.eq('team', 'RD');
      } else {
        // If context is standard (Sale/MKT), EXCLUDE R&D data
        query = query.neq('team', 'RD');
      }

      // --- USER FILTER ---
      // Nếu có selectedPersonnelNames, lấy đơn hàng của tất cả nhân sự trong danh sách
      // Nếu không có, mới filter theo user hiện tại
      const userJson = localStorage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;
      const userName = localStorage.getItem("username") || user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || user?.username || user?.name || "";

      const isManager = ['admin', 'director', 'manager', 'super_admin'].includes((role || '').toLowerCase());

      // Nếu có selectedPersonnelNames, lấy đơn hàng của tất cả nhân sự đó
      if (!isManager && selectedPersonnelNames.length > 0) {
        // Tạo danh sách tên để filter (bao gồm cả user hiện tại nếu chưa có trong danh sách)
        const allNames = [...new Set([...selectedPersonnelNames, userName].filter(Boolean))];
        console.log('🔍 Filtering by selected personnel names:', allNames);
        
        // Filter theo sale_staff, marketing_staff, hoặc delivery_staff
        // Sử dụng .or() để match với bất kỳ tên nào trong danh sách
        const orConditions = allNames.flatMap(name => [
          `sale_staff.ilike.%${name}%`,
          `marketing_staff.ilike.%${name}%`,
          `delivery_staff.ilike.%${name}%`
        ]);
        
        query = query.or(orConditions.join(','));
      } else if (!isManager && userName) {
        // Nếu không có selectedPersonnelNames, filter theo user hiện tại
        // Filter by sale_staff, marketing_staff, hoặc delivery_staff
        query = query.or(`sale_staff.ilike.%${userName}%,marketing_staff.ilike.%${userName}%,delivery_staff.ilike.%${userName}%`);
      }

      if (startDate) {
        query = query.gte('order_date', startDate);
      }
      if (endDate) {
        // Add time to end of day? Or just date string comparison works if strict YYYY-MM-DD
        // Supabase date column might be date or timestamp. Assuming date or timestamp.
        // If timestamp, YYYY-MM-DD matches start of day. lte needs end of day.
        // Safer: lte YYYY-MM-DD might mean midnight if timestamp.
        // Let's rely on string comparison or add time if needed.
        // For 'order_date', usually it's just date.
        query = query.lte('order_date', endDate);
      }

      const { data: supaData, error: supaError } = await query.order('order_date', { ascending: false });

      if (supaError) throw supaError;



      // 2. Process Supabase Data
      const supaMapped = (supaData || []).map(mapSupabaseToUI);

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

  // Get unique values for filters
  const uniqueMarkets = useMemo(() => {
    const markets = new Set();
    allData.forEach(row => {
      const market = row["Khu vực"] || row["khu vực"];
      if (market) markets.add(String(market).trim());
    });
    return Array.from(markets).sort();
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

          const amount = parseFloat(String(rawAmount).replace(/[^0-9.-]+/g, "")) || 0;
          const ship = parseFloat(String(rawShip).replace(/[^0-9.-]+/g, "")) || 0;
          const goodsAmount = parseFloat(String(rawGoodsAmount).replace(/[^0-9.-]+/g, "")) || 0;
          const reconciled = parseFloat(String(rawReconciled).replace(/[^0-9.-]+/g, "")) || 0;

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
            tracking_code: item["Mã Tracking"] || item["Mã_Tracking"] || "",
            shipping_fee: ship,
            marketing_staff: item["Nhân viên Marketing"] || item["Nhân_viên_Marketing"] || "",
            sale_staff: item["Nhân viên Sale"] || item["Nhân_viên_Sale"] || "",
            team: item["Team"] || "",
            delivery_status: item["Trạng thái giao hàng"] || item["Trạng_thái_giao_hàng_NB"] || item["Trạng_thái_giao_hàng"] || "",
            payment_status: item["Kết quả Check"] || item["Kết_quả_Check"] || "",
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



  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = [...allData];

    // Filter by selected personnel (nếu có)
    // Giờ selectedPersonnelNames chứa TÊN trực tiếp từ DB
    // Match với các cột: "Nhân viên Marketing", "Nhân viên Sale", "NV Vận đơn"
    if (selectedPersonnelNames.length > 0) {
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

    // Search filter (using debounced value)
    if (debouncedSearchText) {
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

    // Date Range Filter
    if (startDate || endDate) {
      data = data.filter(row => isDateInRange(row["Ngày lên đơn"], startDate, endDate));
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
  }, [allData, debouncedSearchText, filterMarket, filterProduct, filterStatus, searchDate, sortColumn, sortDirection, selectedPersonnelNames, selectedPersonnelEmails, personnelEmailToNameMap]);

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
              <button
                onClick={handleSyncF3}
                disabled={syncing || loading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {syncing ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                ) : (
                  <span>🔄</span>
                )}
                {syncing ? 'Đang đồng bộ...' : 'Đồng bộ F3'}
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
                  placeholder="Mã đơn, tên, SĐT, tracking..."
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





            {/* Date Search Filter */}
            <div className="min-w-[150px]">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Lọc theo ngày</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
              />
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
                        {col}
                        {sortColumn === col && (
                          <span className="text-[#F37021]">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>

                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={displayColumns.length + 1} className="px-4 py-8 text-center text-gray-500">
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
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-center">
                        {canDelete(permissionCode) && (
                          <button
                            onClick={() => handleDelete(row['Mã đơn hàng'], row._id)}
                            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                            title="Xóa đơn hàng"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>

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
      {
        showColumnSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowColumnSettings(false)}>
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-800">Cài đặt hiển thị cột</h2>
                <button
                  onClick={() => setShowColumnSettings(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Action Buttons */}
                <div className="flex gap-2 mb-4 pb-4 border-b border-gray-200">
                  <button
                    onClick={selectAllColumns}
                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors"
                  >
                    Chọn tất cả
                  </button>
                  <button
                    onClick={deselectAllColumns}
                    className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm font-medium transition-colors"
                  >
                    Bỏ chọn tất cả
                  </button>
                  <button
                    onClick={resetToDefault}
                    className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition-colors"
                  >
                    Mặc định
                  </button>
                </div>

                {/* Column List */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700 mb-3">
                    Chọn các cột để hiển thị trong bảng ({displayColumns.length} / {visibleColumnsInModal.length} đã chọn):
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {visibleColumnsInModal.map((column) => (
                      <label
                        key={column}
                        className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns[column] === true}
                          onChange={() => toggleColumn(column)}
                          className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021] focus:ring-2"
                        />
                        <span className="text-sm text-gray-700 flex-1">{column}</span>
                        {defaultColumns.includes(column) && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Mặc định</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => setShowColumnSettings(false)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Đóng
                </button>
                <button
                  onClick={() => setShowColumnSettings(false)}
                  className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}

export default DanhSachDon;

