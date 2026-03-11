import { Eye, RefreshCw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';

import usePermissions from '../hooks/usePermissions';
import { supabase } from '../supabase/config';

function QuanLyXe() {
  const { role } = usePermissions();
  const roleLower = (role || '').toLowerCase();
  const isAdmin = ['admin', 'super_admin', 'director', 'manager'].includes(roleLower);

  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [userBenPhuTrach, setUserBenPhuTrach] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);

  // Lấy thông tin user hiện tại để lấy ben_phu_trach
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const userId = localStorage.getItem('userId');
        if (!userId) return;

        const { data, error } = await supabase
          .from('users')
          .select('ben_phu_trach')
          .eq('id', userId)
          .single();

        if (error) {
          console.error('Error fetching user info:', error);
          return;
        }

        setUserBenPhuTrach(data?.ben_phu_trach);
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    };

    fetchUserInfo();
  }, []);

  // Debounce search text
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Load data từ bảng vehicles
  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase.from('vehicles').select('*');

      // Nếu không phải admin, filter theo ben_phu_trach của user
      if (!isAdmin && userBenPhuTrach) {
        query = query.eq('ben_phu_trach', userBenPhuTrach);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      setAllData(data || []);
      toast.success(`Đã tải ${data?.length || 0} xe`);
    } catch (error) {
      console.error('Error loading vehicles:', error);
      toast.error('Lỗi khi tải dữ liệu: ' + (error.message || 'Lỗi không xác định'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userBenPhuTrach, isAdmin]);

  // Filter và sort data
  const filteredData = useMemo(() => {
    let data = [...allData];

    // Search filter
    if (debouncedSearchText) {
      const searchLower = debouncedSearchText.toLowerCase();
      data = data.filter((row) => {
        return (
          (row.bien_so_xe || '').toLowerCase().includes(searchLower) ||
          (row.phan_bien_kiem_soat || '').toLowerCase().includes(searchLower) ||
          (row.ten_xe || '').toLowerCase().includes(searchLower) ||
          (row.loai_xe || '').toLowerCase().includes(searchLower)
        );
      });
    }

    // Sort
    if (sortColumn) {
      data.sort((a, b) => {
        const aVal = a[sortColumn] || '';
        const bVal = b[sortColumn] || '';
        const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return data;
  }, [allData, debouncedSearchText, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredData.slice(start, end);
  }, [filteredData, currentPage, rowsPerPage]);

  // Handle sort
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Handle view detail
  const handleViewDetail = (vehicle) => {
    setSelectedVehicle(vehicle);
    setShowViewModal(true);
  };

  // Get column names from data
  const columns = useMemo(() => {
    if (allData.length === 0) return [];
    const cols = Object.keys(allData[0]);
    // Đảm bảo các cột quan trọng luôn hiển thị
    const importantCols = ['bien_so_xe', 'phan_bien_kiem_soat', 'ben_phu_trach', 'ten_xe', 'loai_xe'];
    const otherCols = cols.filter((c) => !importantCols.includes(c) && c !== 'id');
    return [...importantCols, ...otherCols];
  }, [allData]);

  // Format column name for display
  const formatColumnName = (col) => {
    const mapping = {
      bien_so_xe: 'Biển số xe',
      phan_bien_kiem_soat: 'Phân biển kiểm soát (*)',
      ben_phu_trach: 'Bến phụ trách',
      ten_xe: 'Tên xe',
      loai_xe: 'Loại xe',
      trang_thai: 'Trạng thái',
      created_at: 'Ngày tạo',
      updated_at: 'Ngày cập nhật',
    };
    return mapping[col] || col.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-800">QUẢN LÝ XE</h1>
                <p className="text-xs text-gray-500">Danh sách xe vận chuyển</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                <span className={`h-2 w-2 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-sm text-gray-600">
                  {filteredData.length} / {allData.length} xe
                </span>
              </div>
              <button
                onClick={loadData}
                disabled={loading}
                className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Đang tải...' : 'Làm mới'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Tìm kiếm theo biển số, phân biển kiểm soát, tên xe..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F37021] text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-full mx-auto px-6 py-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
            <table className="w-full border-collapse bg-white text-sm">
              <thead className="bg-gray-50 sticky top-0 z-20">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                    >
                      <div className="flex items-center gap-2">
                        {formatColumnName(col)}
                        {sortColumn === col && (
                          <span className="text-[#F37021]">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200 sticky right-0 bg-gray-50 z-[100]">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-[#F37021]" />
                        <span>Đang tải dữ liệu...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-gray-500">
                      Không có dữ liệu
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((row, idx) => (
                    <tr key={row.id || idx} className="hover:bg-gray-50">
                      {columns.map((col) => {
                        let value = row[col];
                        if (value === null || value === undefined) value = '-';
                        if (typeof value === 'object') value = JSON.stringify(value);
                        if (col === 'created_at' || col === 'updated_at') {
                          value = value ? new Date(value).toLocaleString('vi-VN') : '-';
                        }
                        return (
                          <td key={col} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                            {String(value)}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border-l border-gray-200 sticky right-0 bg-white z-[100] text-center">
                        <button
                          onClick={() => handleViewDetail(row)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors relative z-[101]"
                          title="Xem chi tiết"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
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
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors shadow-sm"
                >
                  ← Trước
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors shadow-sm"
                >
                  Sau →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* View Detail Modal */}
      {showViewModal && selectedVehicle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-[201]">
              <h2 className="text-xl font-bold text-gray-800">Chi tiết xe</h2>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedVehicle(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                {columns.map((col) => {
                  let value = selectedVehicle[col];
                  if (value === null || value === undefined) value = '-';
                  if (typeof value === 'object') value = JSON.stringify(value);
                  if (col === 'created_at' || col === 'updated_at') {
                    value = value ? new Date(value).toLocaleString('vi-VN') : '-';
                  }
                  return (
                    <div key={col} className="border-b border-gray-100 pb-2">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                        {formatColumnName(col)}
                      </div>
                      <div className="text-sm text-gray-900 font-medium">{String(value)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuanLyXe;
