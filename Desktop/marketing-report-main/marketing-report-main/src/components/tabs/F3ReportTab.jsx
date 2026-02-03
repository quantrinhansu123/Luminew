import { useState, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useF3Data } from '../../hooks/useF3Data';
import { Pagination } from '../shared/Pagination';
import { supabase } from '../../supabase/config';

export function F3ReportTab({ filters, setFilters, userRole, userEmail }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [editingOrder, setEditingOrder] = useState(null);
  const [newOrderStatus, setNewOrderStatus] = useState('');
  const itemsPerPage = 50;

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    stt: true,
    orderCode: true,
    customerName: true,
    phone: true,
    address: true,
    product: true,
    quantity: true,
    price: true,
    totalVND: true,
    marketing: true,
    sale: true,
    team: true,
    shift: true,
    orderDate: true,
    status: true,
    paymentMethod: true,
  });

  // Check if user can edit status
  const canEditStatus = userRole === 'admin' || userRole === 'leader';

  // Toggle column visibility
  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }));
  };

  // Select all columns
  const selectAllColumns = () => {
    const allVisible = {};
    Object.keys(visibleColumns).forEach(key => {
      allVisible[key] = true;
    });
    setVisibleColumns(allVisible);
  };

  // Deselect all columns
  const deselectAllColumns = () => {
    const allHidden = {};
    Object.keys(visibleColumns).forEach(key => {
      allHidden[key] = false;
    });
    setVisibleColumns(allHidden);
  };

  // Fetch and filter F3 data
  const { f3Data: filteredF3Data, loading, error, totalRecords } = useF3Data(filters, userRole, userEmail);

  // Paginate filtered data
  const paginatedF3Data = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredF3Data.slice(startIndex, endIndex);
  }, [filteredF3Data, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredF3Data.length / itemsPerPage);

  // Handle page change
  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Calculate summary stats
  const stats = useMemo(() => ({
    totalOrders: filteredF3Data.length,
    totalRevenue: filteredF3Data.reduce((sum, item) => sum + (item['Tổng tiền VNĐ'] || 0), 0),
    validOrders: filteredF3Data.filter(item => item['Trạng thái đơn'] === 'Đơn hợp lệ').length,
    avgOrderValue: filteredF3Data.length > 0 
      ? filteredF3Data.reduce((sum, item) => sum + (item['Tổng tiền VNĐ'] || 0), 0) / filteredF3Data.length
      : 0
  }), [filteredF3Data]);

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      products: [],
      shifts: [],
      markets: [],
      teams: [],
      searchText: '',
    });
    setCurrentPage(1);
    toast.info('Đã xóa tất cả bộ lọc', {
      position: "top-right",
      autoClose: 2000,
    });
  };

  // Update F3 order status
  const handleUpdateOrderStatus = async () => {
    if (!editingOrder || !newOrderStatus) return;

    try {
      const { error } = await supabase
        .from('f3_data')
        .update({ 'Trạng thái đơn': newOrderStatus })
        .eq('id', editingOrder.id);
      
      if (error) throw error;
      
      toast.success('Cập nhật trạng thái đơn thành công');
      
      // Reload data
      window.location.reload();
    } catch (err) {
      console.error('Error updating order status:', err);
      toast.error('Lỗi khi cập nhật trạng thái đơn');
    }
  };

  // Open edit order status modal
  const openEditOrderStatus = (order) => {
    setEditingOrder(order);
    setNewOrderStatus(order['Trạng thái đơn'] || 'Chưa xác định');
  };

  // Close edit order status modal
  const closeEditOrderStatus = () => {
    setEditingOrder(null);
    setNewOrderStatus('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Đang tải dữ liệu F3...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 bg-red-50 rounded-lg">
        <p className="text-red-600">Lỗi: {error}</p>
      </div>
    );
  }

  const hasActiveFilters = filters.startDate || filters.endDate || filters.searchText || 
    filters.shifts.length > 0 || filters.teams.length > 0 || filters.products.length > 0 || filters.markets.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-primary">Báo cáo F3</h2>
      </div>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1">Tổng đơn hàng</p>
              <p className="text-3xl font-bold">{stats.totalOrders}</p>
            </div>
            <svg className="w-12 h-12 opacity-80" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"></path>
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"></path>
            </svg>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1">Tổng doanh thu (VNĐ)</p>
              <p className="text-2xl font-bold">
                {stats.totalRevenue.toLocaleString('vi-VN')}
              </p>
            </div>
            <svg className="w-12 h-12 opacity-80" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"></path>
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"></path>
            </svg>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1">Đơn hợp lệ</p>
              <p className="text-3xl font-bold">{stats.validOrders}</p>
            </div>
            <svg className="w-12 h-12 opacity-80" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
            </svg>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1">Giá trị TB/Đơn</p>
              <p className="text-2xl font-bold">
                {stats.avgOrderValue.toLocaleString('vi-VN', {maximumFractionDigits: 0})}
              </p>
            </div>
            <svg className="w-12 h-12 opacity-80" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"></path>
            </svg>
          </div>
        </div>
      </div>

      {/* Column Selector */}
      <div className="mb-4 bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-700">Chọn cột hiển thị</h3>
          <div className="flex gap-2">
            <button
              onClick={selectAllColumns}
              className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition"
            >
              Chọn tất cả
            </button>
            <button
              onClick={deselectAllColumns}
              className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition"
            >
              Bỏ chọn tất cả
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.stt}
              onChange={() => toggleColumn('stt')}
              className="w-4 h-4"
            />
            <span className="text-sm">STT</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.orderCode}
              onChange={() => toggleColumn('orderCode')}
              className="w-4 h-4"
            />
            <span className="text-sm">Mã đơn hàng</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.customerName}
              onChange={() => toggleColumn('customerName')}
              className="w-4 h-4"
            />
            <span className="text-sm">Tên khách hàng</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.phone}
              onChange={() => toggleColumn('phone')}
              className="w-4 h-4"
            />
            <span className="text-sm">Điện thoại</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.address}
              onChange={() => toggleColumn('address')}
              className="w-4 h-4"
            />
            <span className="text-sm">Địa chỉ</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.product}
              onChange={() => toggleColumn('product')}
              className="w-4 h-4"
            />
            <span className="text-sm">Mặt hàng</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.quantity}
              onChange={() => toggleColumn('quantity')}
              className="w-4 h-4"
            />
            <span className="text-sm">Số lượng</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.price}
              onChange={() => toggleColumn('price')}
              className="w-4 h-4"
            />
            <span className="text-sm">Giá bán</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.totalVND}
              onChange={() => toggleColumn('totalVND')}
              className="w-4 h-4"
            />
            <span className="text-sm">Tổng tiền VNĐ</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.marketing}
              onChange={() => toggleColumn('marketing')}
              className="w-4 h-4"
            />
            <span className="text-sm">NV Marketing</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.sale}
              onChange={() => toggleColumn('sale')}
              className="w-4 h-4"
            />
            <span className="text-sm">NV Sale</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.team}
              onChange={() => toggleColumn('team')}
              className="w-4 h-4"
            />
            <span className="text-sm">Team</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.shift}
              onChange={() => toggleColumn('shift')}
              className="w-4 h-4"
            />
            <span className="text-sm">Ca</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.orderDate}
              onChange={() => toggleColumn('orderDate')}
              className="w-4 h-4"
            />
            <span className="text-sm">Ngày lên đơn</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.status}
              onChange={() => toggleColumn('status')}
              className="w-4 h-4"
            />
            <span className="text-sm">Trạng thái đơn</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={visibleColumns.paymentMethod}
              onChange={() => toggleColumn('paymentMethod')}
              className="w-4 h-4"
            />
            <span className="text-sm">Hình thức TT</span>
          </label>
        </div>
      </div>

      {/* F3 Data Table */}
      {filteredF3Data.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <p className="text-gray-500">Không có dữ liệu F3</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto shadow-md rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-blue-600 to-purple-600">
                <tr>
                  {visibleColumns.stt && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">STT</th>
                  )}
                  {visibleColumns.orderCode && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Mã đơn hàng</th>
                  )}
                  {visibleColumns.customerName && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Tên khách hàng</th>
                  )}
                  {visibleColumns.phone && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Điện thoại</th>
                  )}
                  {visibleColumns.address && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Địa chỉ</th>
                  )}
                  {visibleColumns.product && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Mặt hàng</th>
                  )}
                  {visibleColumns.quantity && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Số lượng</th>
                  )}
                  {visibleColumns.price && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Giá bán</th>
                  )}
                  {visibleColumns.totalVND && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Tổng tiền VNĐ</th>
                  )}
                  {visibleColumns.marketing && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">NV Marketing</th>
                  )}
                  {visibleColumns.sale && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">NV Sale</th>
                  )}
                  {visibleColumns.team && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Team</th>
                  )}
                  {visibleColumns.shift && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Ca</th>
                  )}
                  {visibleColumns.orderDate && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Ngày lên đơn</th>
                  )}
                  {visibleColumns.status && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Trạng thái đơn</th>
                  )}
                  {visibleColumns.paymentMethod && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Hình thức TT</th>
                  )}
                  {canEditStatus && (
                    <th className="px-3 py-3 text-center text-sm font-medium text-white uppercase tracking-wider border border-gray-300 whitespace-nowrap">Thao tác</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedF3Data.map((item, index) => {
                  const globalIndex = (currentPage - 1) * itemsPerPage + index;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      {visibleColumns.stt && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">{globalIndex + 1}</td>
                      )}
                      {visibleColumns.orderCode && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">{item['Mã đơn hàng'] || '-'}</td>
                      )}
                      {visibleColumns.customerName && (
                        <td className="px-3 py-3 text-sm font-medium text-gray-900 border border-gray-300 max-w-[150px] break-words">{item['Name*'] || item['Tên lên đơn'] || '-'}</td>
                      )}
                      {visibleColumns.phone && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">{item['Phone*'] || '-'}</td>
                      )}
                      {visibleColumns.address && (
                        <td className="px-3 py-3 text-sm font-medium text-gray-900 border border-gray-300">
                          {[item['Add'], item['City'], item['State']].filter(Boolean).join(', ') || '-'}
                        </td>
                      )}
                      {visibleColumns.product && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">{item['Mặt hàng'] || item['Tên mặt hàng 1'] || '-'}</td>
                      )}
                      {visibleColumns.quantity && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">{item['Số lượng mặt hàng 1'] || '-'}</td>
                      )}
                      {visibleColumns.price && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">
                          ${item['Giá bán'] || 0}
                        </td>
                      )}
                      {visibleColumns.totalVND && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-bold text-green-600 border border-gray-300">
                          {(item['Tổng tiền VNĐ'] || 0).toLocaleString('vi-VN')}₫
                        </td>
                      )}
                      {visibleColumns.marketing && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">{item['Nhân viên Marketing'] || '-'}</td>
                      )}
                      {visibleColumns.sale && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">{item['Nhân viên Sale'] || '-'}</td>
                      )}
                      {visibleColumns.team && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">{item['Team'] || '-'}</td>
                      )}
                      {visibleColumns.shift && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">{item['Ca'] || '-'}</td>
                      )}
                      {visibleColumns.orderDate && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">
                          {item['Ngày lên đơn'] ? new Date(item['Ngày lên đơn']).toLocaleDateString('vi-VN') : '-'}
                        </td>
                      )}
                      {visibleColumns.status && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm border border-gray-300">
                          <span className={`px-2 py-1 text-sm font-medium rounded-full ${
                            item['Trạng thái đơn'] === 'Đơn hợp lệ' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {item['Trạng thái đơn'] || 'Chưa xác định'}
                          </span>
                        </td>
                      )}
                      {visibleColumns.paymentMethod && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">{item['Hình thức thanh toán'] || '-'}</td>
                      )}
                      {canEditStatus && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm border border-gray-300 text-center">
                          <button
                            onClick={() => openEditOrderStatus(item)}
                            className="px-3 py-1 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition text-sm"
                          >
                            Sửa
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredF3Data.length > itemsPerPage && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredF3Data.length}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}

      {/* Edit Order Status Modal */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              Cập nhật trạng thái đơn hàng
            </h3>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Mã đơn hàng: <span className="font-semibold">{editingOrder['Mã đơn hàng'] || '-'}</span>
              </p>
              <p className="text-sm text-gray-600 mb-2">
                Khách hàng: <span className="font-semibold">{editingOrder['Name*'] || editingOrder['Tên lên đơn'] || '-'}</span>
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Tổng tiền: <span className="font-semibold">{(editingOrder['Tổng tiền VNĐ'] || 0).toLocaleString('vi-VN')}₫</span>
              </p>

              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trạng thái mới
              </label>
              <select
                value={newOrderStatus}
                onChange={(e) => setNewOrderStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Chưa xác định">Chưa xác định</option>
                <option value="Đơn hợp lệ">Đơn hợp lệ</option>
                <option value="Đơn hủy">Đơn hủy</option>
                <option value="Đơn chờ xử lý">Đơn chờ xử lý</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleUpdateOrderStatus}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Lưu
              </button>
              <button
                onClick={closeEditOrderStatus}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
