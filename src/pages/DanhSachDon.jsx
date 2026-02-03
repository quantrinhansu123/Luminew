import { ChevronLeft, Download, RefreshCw, Search, Settings, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { logDataChange } from '../services/logging';
import { supabase } from '../supabase/config';
import { COLUMN_MAPPING, PRIMARY_KEY_COLUMN } from '../types';

function DanhSachDon() {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [filterMarket, setFilterMarket] = useState([]);
  const [filterProduct, setFilterProduct] = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);


  // Date state - default to today
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [quickFilter, setQuickFilter] = useState('today');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [syncing, setSyncing] = useState(false); // State for sync process

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
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing saved columns:', e);
      }
    }
    // Initialize with default columns
    const initial = {};
    defaultColumns.forEach(col => {
      initial[col] = true;
    });
    return initial;
  });

  // Update displayColumns based on visibleColumns
  const displayColumns = useMemo(() => {
    return allAvailableColumns.filter(col => visibleColumns[col] === true);
  }, [allAvailableColumns, visibleColumns]);

  // Save to localStorage when visibleColumns changes
  useEffect(() => {
    if (Object.keys(visibleColumns).length > 0) {
      localStorage.setItem('danhSachDon_visibleColumns', JSON.stringify(visibleColumns));
    }
  }, [visibleColumns]);

  // Load data from Supabase
  const loadData = async () => {
    if (!startDate || !endDate) return;

    setLoading(true);
    try {
      console.log('Loading orders from Supabase (Date Range)...');

      // Simple fetch with date range
      const { data: allOrders, error } = await supabase
        .from('orders')
        .select('*')
        .gte('order_date', `${startDate}T00:00:00`)
        .lte('order_date', `${endDate}T23:59:59`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Map Supabase columns to existing UI format
      const mappedData = allOrders.map(item => ({
        "Mã đơn hàng": item.order_code,
        "Ngày lên đơn": item.order_date || item.created_at,
        "Name*": item.customer_name,
        "Phone*": item.customer_phone,
        "Add": item.customer_address,
        "City": item.city,
        "State": item.state,
        "Khu vực": item.country, // Assuming 'country' maps to 'Khu vực' or similar
        "Zipcode": item.zipcode,
        "Mặt hàng": item.product,
        "Tên mặt hàng 1": item.product, // Mapping to legacy fields
        "Tổng tiền VNĐ": item.total_amount_vnd,
        "Hình thức thanh toán": item.payment_method,
        "Mã Tracking": item.tracking_code,
        "Phí ship": item.shipping_fee,
        "Nhân viên Marketing": item.marketing_staff,
        "Nhân viên Sale": item.sale_staff,
        "Team": item.team,
        "Trạng thái giao hàng": item.delivery_status,
        "Kết quả Check": item.payment_status,
        "Ghi chú": item.note,

        // Extended columns (kept data available even if hidden by default)
        "CSKH": item.cskh,
        "NV Vận đơn": item.delivery_staff,
        "Tiền Hàng": item.goods_amount,
        "Tiền Việt đã đối soát": item.reconciled_amount,
        "Phí Chung": item.general_fee,
        "Phí bay": item.flight_fee,
        "Thuê TK": item.account_rental_fee,
        "Phí xử lý đơn đóng hàng-Lưu kho(usd)": item.general_fee,
        "Thời gian cutoff": item.cutoff_time,
        "Đơn vị vận chuyển": item.shipping_unit,
        "Kế toán xác nhận thu tiền về": item.accountant_confirm,
        "Trạng thái thu tiền": item.payment_status_detail,
        "Lý do": item.reason,

        // Preserve original ID for updates if needed
        "_id": item.id
      }));

      setAllData(mappedData);
    } catch (error) {
      console.error('Load data error:', error);
      alert(`❌ Lỗi tải dữ liệu: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

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
    if (!window.confirm("Bạn có chắc chắn muốn đồng bộ dữ liệu từ F3 (Firebase) về Supabase? Dữ liệu cũ trên Supabase có thể bị ghi đè hoặc trùng lặp.")) return;

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

        // Upsert to Supabase
        const { error } = await supabase
          .from("orders")
          .upsert(transformedBatch, { onConflict: 'order_code', ignoreDuplicates: false });

        if (error) {
          console.error("Batch error:", error);
          // Capture the first error closely
          if (!lastError) lastError = error;
          errorCount += batch.length;
        } else {
          successCount += batch.length;

          // Log changes asynchronously (don't block UI too much)
          // We use Promise.all to fire them in parallel for this batch
          const userEmail = localStorage.getItem('userEmail') || 'system_sync';

          Promise.all(transformedBatch.map(item =>
            logDataChange({
              action: 'SYNC_F3',
              table_name: 'orders',
              record_id: item.order_code,
              user_email: userEmail,
              old_value: 'N/A (Bulk Sync)',
              new_value: JSON.stringify({
                status: item.delivery_status,
                total: item.total_amount_vnd,
                updated_at: new Date().toISOString()
              }),
              details: {
                message: 'Bản ghi được đồng bộ từ F3',
                orderCode: item.order_code,
                customerName: item.customer_name
              }
            })
          )).catch(err => console.error("Logging sync error", err));
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

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = [...allData];

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

    // Date filter (already applied on server-side)
    // Removed client-side logic since allData is already filtered

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
  }, [allData, debouncedSearchText, filterMarket, filterProduct, filterStatus, sortColumn, sortDirection]);

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

  // Export to CSV
  const handleExport = () => {
    const headers = ['Mã đơn hàng', 'Ngày lên đơn', 'Name*', 'Phone*', 'Khu vực', 'Mặt hàng', 'Mã Tracking', 'Trạng thái giao hàng', 'Tổng tiền VNĐ'];
    const csvRows = [
      headers.join(','),
      ...filteredData.map(row =>
        headers.map(header => {
          const val = row[header] || '';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        }).join(',')
      )
    ];
    const csv = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `danh-sach-don-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="text-gray-600 hover:text-gray-900">
                <ChevronLeft className="w-5 h-5" />
              </Link>
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

            {/* Export Button */}
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Excel
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
                    <tr key={row[PRIMARY_KEY_COLUMN] || index} className="hover:bg-gray-50 transition-colors">
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
                          <td key={col} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
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
      {showColumnSettings && (
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
                  Chọn các cột để hiển thị trong bảng ({displayColumns.length} / {allAvailableColumns.length} đã chọn):
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {allAvailableColumns.map((column) => (
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
      )}
    </div>
  );
}

export default DanhSachDon;

