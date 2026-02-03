import { ChevronLeft, Download, RefreshCw, Search, Settings, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase/config';
import { COLUMN_MAPPING, PRIMARY_KEY_COLUMN } from '../types';

function QuanLyCSKH() {
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
    const saved = localStorage.getItem('quanLyCSKH_visibleColumns');
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
      localStorage.setItem('quanLyCSKH_visibleColumns', JSON.stringify(visibleColumns));
    }
  }, [visibleColumns]);

  // Load data from Supabase with date filter
  const loadData = async () => {
    if (!startDate || !endDate) return;

    setLoading(true);
    try {
      console.log('Loading orders from Supabase (Date Range)...');

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .gte('order_date', `${startDate}T00:00:00`)
        .lte('order_date', `${endDate}T23:59:59`)
        .order('order_date', { ascending: false });

      if (error) throw error;

      // Map Supabase columns to UI format if needed
      // Assuming 'orders' table columns match what was expected or mapping is handled in filteredData
      // The previous code expected specific keys like "Mã đơn hàng". We need to map if the UI relies on them.
      // Based on DanhSachDon.jsx earlier, we mapped keys. Let's do a mapping here too to be safe.

      const mappedData = (data || []).map(item => ({
        "Mã đơn hàng": item.order_code,
        "Ngày lên đơn": item.order_date,
        "Name*": item.customer_name,
        "Phone*": item.customer_phone,
        "Khu vực": item.country, // or item.city or item.state depending on data
        "Mặt hàng": item.product,
        "Mã Tracking": item.tracking_code,
        "Trạng thái giao hàng": item.delivery_status,
        "Tổng tiền VNĐ": item.total_amount_vnd,

        // Preserve other fields
        ...item
      }));

      setAllData(mappedData);

    } catch (error) {
      console.error('Load data error:', error);
      alert(`❌ Lỗi tải dữ liệu: ${error.message}`);
      setAllData([]);
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
    link.download = `quan-ly-cskh-${new Date().toISOString().slice(0, 10)}.csv`;
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

export default QuanLyCSKH;

