import { ChevronLeft, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

export default function DonChiaCSKH() {
  const [allData, setAllData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [hrData, setHrData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [allowedStaffNames, setAllowedStaffNames] = useState(null);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterCSKH, setFilterCSKH] = useState('');
  const [filterTrangThai, setFilterTrangThai] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Sync date range when month/year changes
  useEffect(() => {
    if (filterMonth && filterYear) {
      const year = parseInt(filterYear);
      const month = parseInt(filterMonth);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of month

      const formatDateISO = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };

      setStartDate(formatDateISO(startDate));
      setEndDate(formatDateISO(endDate));
    } else if (!filterMonth && !filterYear) {
      // Only clear if both are empty (though year usually has value)
      // Logic from HTML: if !month, clear dates.
    }
    // Note: If user manually changes dates, we might want to clear month/year selector?
    // For now, follow HTML logic: Month change -> set dates.
  }, [filterMonth, filterYear]);

  // Options
  const [trangThaiOptions, setTrangThaiOptions] = useState([]);
  const [cskhOptions, setCskhOptions] = useState([]);

  // Data key map for Firebase updates
  const [dataKeyMap, setDataKeyMap] = useState(new Map());

  const F3_URL = 'https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json';
  const HR_URL = 'https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Nh%C3%A2n_s%E1%BB%B1.json';

  // Helper: Get value from row with multiple column name options
  const getRowValue = (row, ...columnNames) => {
    for (const colName of columnNames) {
      if (row[colName] !== undefined && row[colName] !== null && row[colName] !== '') {
        return row[colName];
      }
    }
    return '';
  };

  // Helper: Parse money string to number
  const parseMoney = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    // Remove non-numeric characters except minus sign
    const cleaned = String(value).replace(/[^0-9-]/g, '');
    return parseFloat(cleaned) || 0;
  };

  // Helper: Format currency
  const formatCurrency = (value) => {
    const num = parseMoney(value);
    if (num === 0) return '0 ₫';
    const rounded = Math.round(num / 1000) * 1000;
    return rounded.toLocaleString('vi-VN') + ' ₫';
  };

  // Helper: Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  // Helper: Normalize data
  const normalizeData = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data.filter(item => item && typeof item === 'object');
    if (typeof data === 'object') {
      return Object.values(data).filter(item => item && typeof item === 'object');
    }
    return [];
  };

  // Get URL parameter
  const getQueryParam = (key) => {
    try {
      const params = new URLSearchParams(window.location.search);
      let val = params.get(key);
      if (!val) {
        const hash = window.location.hash || '';
        const match = hash.match(new RegExp(`[?#&]?(?:${key})=([^&]+)`));
        if (match && match[1]) val = decodeURIComponent(match[1]);
      }
      return val ? String(val).trim() : '';
    } catch {
      return '';
    }
  };

  // Fetch with retry
  const fetchWithRetry = async (url, retries = 3, delayMs = 500) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  };

  // Load HR data and process permissions
  const loadHRData = async () => {
    const scope = getQueryParam('scope');
    if (scope === 'allF3') {
      console.log('📌 scope=allF3, xem tất cả dữ liệu');
      setAllowedStaffNames(null);
      setCurrentEmployee(null);
      return;
    }

    const userId = getQueryParam('id');

    try {
      const data = await fetchWithRetry(HR_URL);
      const normalized = normalizeData(data);
      setHrData(normalized);

      if (!normalized.length) {
        console.warn('⚠️ Không có HR data');
        return;
      }

      if (!userId) {
        console.log('📌 Không có id, hiển thị tất cả (admin mode)');
        return;
      }

      // Find employee by id
      const matchId = (row) => {
        const candidates = ['id', 'ID', 'Id', 'uid', 'UID', 'Uid', 'Mã nhân sự', 'Mã_Nhân_sự', 'Ma_Nhan_su'];
        for (const k of candidates) {
          if (row[k] !== undefined && String(row[k]).trim() === userId) return true;
        }
        return false;
      };

      const foundEmployee = normalized.find(matchId);
      if (!foundEmployee) {
        console.warn('⚠️ Không tìm thấy nhân viên với id:', userId);
        return;
      }

      setCurrentEmployee(foundEmployee);

      const viTri = String(foundEmployee['Vị trí'] || '').trim();
      const team = String(foundEmployee['Team'] || '').trim();
      const hoVaTen = String(foundEmployee['Họ Và Tên'] || foundEmployee['Họ_và_tên'] || foundEmployee['Tên'] || '').trim();
      const isLeader = /leader/i.test(viTri);

      const allowedSet = new Set();
      if (isLeader) {
        normalized.forEach(emp => {
          const empTeam = String(emp['Team'] || '').trim();
          if (empTeam === team && empTeam && empTeam !== 'Đã nghỉ') {
            const name = String(emp['Họ Và Tên'] || emp['Họ_và_tên'] || emp['Tên'] || '').trim();
            if (name) allowedSet.add(name);
          }
        });
      } else {
        if (hoVaTen) allowedSet.add(hoVaTen);
      }

      setAllowedStaffNames(allowedSet.size ? allowedSet : null);
    } catch (error) {
      console.error('❌ Lỗi khi load HR data:', error);
    }
  };

  // Load F3 data
  const loadF3Data = async () => {
    setLoading(true);
    setError(null);

    try {
      await loadHRData();

      const data = await fetchWithRetry(F3_URL);
      const normalized = normalizeData(data);
      setAllData(normalized);

      // Build key map
      const keyMap = new Map();
      if (typeof data === 'object' && !Array.isArray(data)) {
        Object.keys(data).forEach(key => {
          const row = data[key];
          if (row && typeof row === 'object') {
            const maDonHang = getRowValue(row, 'Mã_đơn_hàng', 'Mã đơn hàng') || '';
            if (maDonHang) keyMap.set(maDonHang, key);
          }
        });
      }
      setDataKeyMap(keyMap);

      // Get unique options
      const cutoffSet = new Set();
      const cskhSet = new Set();
      normalized.forEach(row => {
        const cutoff = getRowValue(row, 'Thời_gian_cutoff', 'Thời gian cutoff') || '';
        if (cutoff && cutoff.trim()) cutoffSet.add(cutoff.trim());

        const cskh = getRowValue(row, 'CSKH', 'NV_CSKH', 'Nhân viên CSKH') || '';
        if (cskh && cskh.trim()) cskhSet.add(cskh.trim());
      });

      setTrangThaiOptions(Array.from(cutoffSet).sort());
      setCskhOptions(Array.from(cskhSet).sort());

      setLoading(false);
    } catch (err) {
      console.error('❌ Lỗi khi load dữ liệu:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Apply filters
  useEffect(() => {
    let result = [...allData];

    // Permission filter
    if (currentEmployee && allowedStaffNames !== null) {
      const viTri = String(currentEmployee['Vị trí'] || '').trim();
      const hoVaTen = String(currentEmployee['Họ Và Tên'] || currentEmployee['Tên'] || '').trim();

      result = result.filter(row => {
        const cskh = String(getRowValue(row, 'CSKH', 'NV_CSKH', 'Nhân viên CSKH') || '').trim();

        if (viTri === 'NV' || viTri === '') {
          return cskh === hoVaTen;
        } else if (viTri === 'Leader') {
          return cskh && allowedStaffNames.has(cskh);
        }
        return true;
      });
    }

    // Search filter
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      result = result.filter(row => {
        const searchableText = Object.values(row)
          .map(v => String(v || '').toLowerCase())
          .join(' ');
        return searchableText.includes(searchLower);
      });
    }

    // Date filter
    if (startDate || endDate) {
      result = result.filter(row => {
        const rowDate = getRowValue(row, 'Ngày_lên_đơn', 'Ngày lên đơn');
        if (!rowDate) return false;

        try {
          const date = new Date(rowDate);
          if (isNaN(date.getTime())) return false;

          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (date < start) return false;
          }

          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (date > end) return false;
          }

          return true;
        } catch {
          return false;
        }
      });
    }

    // CSKH filter
    if (filterCSKH) {
      result = result.filter(row => {
        const cskh = String(getRowValue(row, 'CSKH', 'NV_CSKH', 'Nhân viên CSKH') || '').trim();
        if (filterCSKH === '__EMPTY__') {
          return cskh === '';
        }
        return cskh === filterCSKH;
      });
    }

    // Trang thai filter
    if (filterTrangThai) {
      result = result.filter(row => {
        const trangThai = String(getRowValue(row, 'Thời_gian_cutoff', 'Thời gian cutoff') || '').trim();
        if (filterTrangThai === '__EMPTY__') {
          return trangThai === '';
        }
        return trangThai === filterTrangThai;
      });
    }

    // Sort: empty status first
    result.sort((a, b) => {
      const aTrangThai = String(getRowValue(a, 'Thời_gian_cutoff', 'Thời gian cutoff') || '').trim();
      const bTrangThai = String(getRowValue(b, 'Thời_gian_cutoff', 'Thời gian cutoff') || '').trim();

      const aEmpty = !aTrangThai;
      const bEmpty = !bTrangThai;

      if (aEmpty && !bEmpty) return -1;
      if (!aEmpty && bEmpty) return 1;
      if (aEmpty && bEmpty) return 0;

      return aTrangThai.localeCompare(bTrangThai, 'vi');
    });

    setFilteredData(result);
    setCurrentPage(1);
  }, [allData, searchText, startDate, endDate, filterCSKH, filterTrangThai, currentEmployee, allowedStaffNames]);

  // Load data on mount
  useEffect(() => {
    loadF3Data();
  }, []);

  // Calculate summary
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

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageData = filteredData.slice(startIndex, endIndex);

  // Handle status change
  const handleStatusChange = async (maDonHang, newValue) => {
    const firebaseKey = dataKeyMap.get(maDonHang);
    if (!firebaseKey) {
      alert('Không tìm thấy key để lưu dữ liệu');
      return;
    }

    const updateUrl = `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3/${firebaseKey}/Thời_gian_cutoff.json`;

    try {
      const response = await fetch(updateUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newValue)
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // Update local data
      setAllData(prev => prev.map(row => {
        const md = getRowValue(row, 'Mã_đơn_hàng', 'Mã đơn hàng') || '';
        if (md === maDonHang) {
          return { ...row, 'Thời_gian_cutoff': newValue, 'Thời gian cutoff': newValue };
        }
        return row;
      }));

      // Update AppSheet
      const APP_ID = 'f9aacd5a-8966-45b1-b20c-c8f5ea16c63b';
      const ACCESS_KEY = 'V2-w28Id-wg3Ec-NToRD-xUaHk-CPMlL-44lVt-tNHJ3-DeMAp';
      const appSheetUrl = `https://api.appsheet.com/api/v2/apps/${APP_ID}/tables/F3/Action`;

      await fetch(appSheetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ApplicationAccessKey': ACCESS_KEY
        },
        body: JSON.stringify({
          Action: 'Edit',
          Properties: { Locale: 'vi-VN' },
          Rows: [{ 'Mã đơn hàng': maDonHang, 'Thời gian cutoff': newValue }]
        })
      });

      console.log('✅ Đã lưu thành công');
    } catch (error) {
      console.error('❌ Lỗi khi lưu:', error);
      alert(`Lỗi: ${error.message}`);
    }
  };

  // Quick filters
  const handleQuickFilter = (type) => {
    const now = new Date();
    setFilterMonth('');

    switch (type) {
      case 'today': {
        const today = now.toISOString().split('T')[0];
        setStartDate(today);
        setEndDate(today);
        break;
      }
      case 'yesterday': {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        setStartDate(yesterdayStr);
        setEndDate(yesterdayStr);
        break;
      }
      case 'thisWeek': {
        const start = new Date(now);
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
        break;
      }
      case 'thisMonth': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
        break;
      }
      case 'clear':
        setStartDate('');
        setEndDate('');
        setFilterMonth('');
        // setFilterYear(new Date().getFullYear()); // Optional: reset year to current?
        break;
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!filteredData.length) {
      alert('Không có dữ liệu để xuất!');
      return;
    }

    const headers = [
      'STT', 'Mã đơn hàng', 'Ngày lên đơn', 'Name*', 'Phone*', 'Add',
      'Nhân viên Sale', 'CSKH', 'Mặt hàng', 'Khu vực',
      'Tổng tiền VNĐ', 'Phí ship', 'Tiền Việt đã đối soát', 'Trạng thái cuối cùng'
    ];

    const csvContent = [
      headers.join(','),
      ...filteredData.map((row, index) => {
        return [
          index + 1,
          `"${getRowValue(row, 'Mã_đơn_hàng', 'Mã đơn hàng') || ''}"`,
          `"${formatDate(getRowValue(row, 'Ngày_lên_đơn', 'Ngày lên đơn', 'Thời gian lên đơn'))}"`,
          `"${(getRowValue(row, 'Name', 'Name*', 'Tên lên đơn') || '').replace(/"/g, '""')}"`,
          `"${(getRowValue(row, 'Phone', 'Phone*', 'phone', 'phone*') || '').replace(/"/g, '""')}"`,
          `"${(getRowValue(row, 'Add', 'add', 'Địa chỉ', 'Địa_chỉ') || '').replace(/"/g, '""')}"`,
          `"${getRowValue(row, 'Nhân_viên_Sale', 'Nhân viên Sale') || ''}"`,
          `"${getRowValue(row, 'CSKH', 'NV_CSKH', 'NV CSKH') || ''}"`,
          `"${(getRowValue(row, 'Mặt_hàng', 'Mặt hàng') || '').replace(/"/g, '""')}"`,
          `"${getRowValue(row, 'Khu_vực', 'Khu vực') || ''}"`,
          parseMoney(getRowValue(row, 'Tổng_tiền_VNĐ', 'Tổng tiền VNĐ', 'Tổng_tiền_VND')),
          parseMoney(getRowValue(row, 'Phí_ship', 'Phí ship')),
          parseMoney(getRowValue(row, 'Tiền_Việt_đã_đối_soát', 'Tiền Việt đã đối soát')),
          `"${getRowValue(row, 'Thời_gian_cutoff', 'Thời gian cutoff') || ''}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const now = new Date();
    const fileName = `F3_Data_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}.csv`;
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          <p className="mt-4 text-gray-600">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          ❌ Lỗi tải dữ liệu: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-5">
      <div className="container mx-auto">
        {/* Back Button */}
        <Link to="/trang-chu" className="inline-flex items-center text-green-600 hover:text-green-700 mb-4">
          <ChevronLeft className="w-5 h-5" />
          <span>Quay lại</span>
        </Link>

        {/* Header */}
        <div className="bg-white p-4 rounded-lg shadow mb-4">
          <h1 className="text-2xl font-bold text-green-600 mb-2">📊 Dữ liệu F3 - Xem toàn bộ</h1>
          {currentEmployee && (
            <div className="text-sm text-green-600 font-medium mb-2">
              👋 Xin chào {currentEmployee['Họ Và Tên'] || currentEmployee['Tên']}
            </div>
          )}
          <div className="bg-green-100 p-3 rounded text-sm">
            📊 Tổng số: {allData.length.toLocaleString('vi-VN')} đơn |
            Lọc được: {filteredData.length.toLocaleString('vi-VN')} đơn |
            Hiển thị: {startIndex + 1}-{Math.min(endIndex, filteredData.length)}
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white p-4 rounded-lg shadow mb-4">
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="🔍 Tìm kiếm..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm"
              />
            </div>
            <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} className="px-3 py-2 border rounded text-sm">
              {[2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="px-3 py-2 border rounded text-sm">
              <option value="">Tất cả tháng</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => <option key={m} value={m}>Tháng {m}</option>)}
            </select>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setFilterMonth(''); }} className="px-3 py-2 border rounded text-sm" />
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setFilterMonth(''); }} className="px-3 py-2 border rounded text-sm" />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-[180px]">
              <label className="block text-xs font-semibold mb-1">CSKH (Team Lý)</label>
              <select value={filterCSKH} onChange={(e) => setFilterCSKH(e.target.value)} className="w-full px-2 py-1 border rounded text-xs">
                <option value="">Tất cả</option>
                <option value="__EMPTY__">Trống</option>
                {cskhOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="min-w-[150px]">
              <label className="block text-xs font-semibold mb-1">Trạng thái cuối cùng</label>
              <select value={filterTrangThai} onChange={(e) => setFilterTrangThai(e.target.value)} className="w-full px-2 py-1 border rounded text-xs">
                <option value="">Tất cả</option>
                <option value="__EMPTY__">Trống</option>
                {trangThaiOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <button onClick={loadF3Data} className="px-3 py-2 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700">
              <RefreshCw className="w-4 h-4 inline mr-1" /> Làm mới
            </button>
            <button onClick={exportToCSV} className="px-3 py-2 bg-gray-600 text-white rounded text-sm font-semibold hover:bg-gray-700">
              📥 Xuất Excel (CSV)
            </button>
          </div>
        </div>

        {/* Quick Filters */}
        <div className="bg-white p-3 rounded-lg shadow mb-4">
          <h3 className="text-sm font-bold text-green-600 mb-2">⚡ Lọc nhanh theo thời gian</h3>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Hôm nay', type: 'today' },
              { label: 'Hôm qua', type: 'yesterday' },
              { label: 'Tuần này', type: 'thisWeek' },
              { label: 'Tháng này', type: 'thisMonth' },
              { label: 'Xóa lọc', type: 'clear' }
            ].map(f => (
              <button
                key={f.type}
                onClick={() => handleQuickFilter(f.type)}
                className="px-3 py-1 border rounded text-xs font-medium hover:bg-green-600 hover:text-white transition"
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Table */}
        <div className="bg-white rounded-lg shadow mb-4 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-green-600 text-white">
              <tr>
                <th className="p-3 text-center">Tổng số đơn</th>
                <th className="p-3 text-center">Tổng tiền VNĐ</th>
                <th className="p-3 text-center">Số đơn của CSKH</th>
                <th className="p-3 text-center">Số đơn được chia</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-yellow-100 font-bold text-center">
                <td className="p-3">{summary.totalDon.toLocaleString('vi-VN')} đơn</td>
                <td className="p-3">{formatCurrency(summary.totalTongTien)}</td>
                <td className="p-3">{summary.soDonCSKH.toLocaleString('vi-VN')} đơn</td>
                <td className="p-3">{summary.soDonDuocChia.toLocaleString('vi-VN')} đơn</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow overflow-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
          <table className="w-full text-xs">
            <thead className="bg-green-600 text-white sticky top-0">
              <tr>
                <th className="p-2 text-left">STT</th>
                <th className="p-2 text-left">Mã đơn hàng</th>
                <th className="p-2 text-left">Ngày lên đơn</th>
                <th className="p-2 text-left">Name*</th>
                <th className="p-2 text-left">Phone</th>
                <th className="p-2 text-left">Add</th>
                <th className="p-2 text-left">NV Sale</th>
                <th className="p-2 text-left">CSKH</th>
                <th className="p-2 text-left">Mặt hàng</th>
                <th className="p-2 text-left">Khu vực</th>
                <th className="p-2 text-right">Tổng tiền</th>
                <th className="p-2 text-left">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr>
                  <td colSpan="12" className="p-4 text-center text-gray-500">Không có dữ liệu</td>
                </tr>
              ) : (
                pageData.map((row, idx) => {
                  const globalIdx = startIndex + idx;
                  const maDonHang = getRowValue(row, 'Mã_đơn_hàng', 'Mã đơn hàng') || '';
                  const trangThai = getRowValue(row, 'Thời_gian_cutoff', 'Thời gian cutoff') || '';

                  return (
                    <tr key={globalIdx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="p-2 text-center">{globalIdx + 1}</td>
                      <td className="p-2">{maDonHang}</td>
                      <td className="p-2">{formatDate(getRowValue(row, 'Ngày_lên_đơn', 'Ngày lên đơn'))}</td>
                      <td className="p-2">{getRowValue(row, 'Name', 'Name*')}</td>
                      <td className="p-2">{getRowValue(row, 'Phone', 'Phone*', 'SĐT')}</td>
                      <td className="p-2">{getRowValue(row, 'Add', 'Địa chỉ')}</td>
                      <td className="p-2">{getRowValue(row, 'Nhân_viên_Sale', 'Nhân viên Sale')}</td>
                      <td className="p-2">{getRowValue(row, 'CSKH', 'NV_CSKH')}</td>
                      <td className="p-2">{getRowValue(row, 'Mặt_hàng', 'Mặt hàng')}</td>
                      <td className="p-2">{getRowValue(row, 'Khu_vực', 'Khu vực')}</td>
                      <td className="p-2 text-right">{formatCurrency(getRowValue(row, 'Tổng_tiền_VNĐ', 'Tổng tiền VNĐ'))}</td>
                      <td className="p-2">
                        <select
                          value={trangThai}
                          onChange={(e) => handleStatusChange(maDonHang, e.target.value)}
                          className="w-full px-2 py-1 border rounded text-xs"
                        >
                          <option value="">-- Chọn --</option>
                          {trangThaiOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredData.length > 0 && (
          <div className="bg-white p-3 rounded-lg shadow mt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >
              ⏮ Đầu
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >
              ◀ Trước
            </button>
            <span className="text-sm">Trang {currentPage} / {totalPages}</span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >
              Sau ▶
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >
              Cuối ⏭
            </button>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="px-2 py-1 border rounded text-sm ml-3"
            >
              <option value="50">50/trang</option>
              <option value="100">100/trang</option>
              <option value="200">200/trang</option>
              <option value="500">500/trang</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
