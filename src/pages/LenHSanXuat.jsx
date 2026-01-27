import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as API from '../services/api';
import { PRIMARY_KEY_COLUMN } from '../types';
import { ChevronLeft, Search, Calendar, Package, Truck, CheckCircle, Clock, AlertCircle } from 'lucide-react';

// Định nghĩa các bước trong quy trình sản xuất/đơn hàng
const PRODUCTION_STEPS = [
  {
    id: 'dat-don',
    label: 'Đặt đơn',
    key: 'Ngày lên đơn',
    icon: Calendar,
    color: 'bg-blue-500',
    statusKey: null
  },
  {
    id: 'check-don',
    label: 'Check đơn',
    key: null,
    icon: CheckCircle,
    color: 'bg-yellow-500',
    statusKey: 'Kết quả Check'
  },
  {
    id: 'dong-hang',
    label: 'Đóng hàng',
    key: 'Ngày đóng hàng',
    icon: Package,
    color: 'bg-green-500',
    statusKey: null
  },
  {
    id: 'day-don',
    label: 'Đẩy đơn',
    key: 'Ngày đẩy đơn',
    icon: Truck,
    color: 'bg-purple-500',
    statusKey: null
  },
  {
    id: 'co-tracking',
    label: 'Có mã tracking',
    key: 'Ngày có mã tracking',
    icon: Truck,
    color: 'bg-indigo-500',
    statusKey: 'Mã Tracking'
  },
  {
    id: 'giao-hang',
    label: 'Giao hàng',
    key: null,
    icon: CheckCircle,
    color: 'bg-green-600',
    statusKey: 'Trạng thái giao hàng'
  }
];

function LenHSanXuat() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (orderId && allData.length > 0) {
      const order = allData.find(o => o[PRIMARY_KEY_COLUMN] === orderId);
      if (order) {
        setSelectedOrder(order);
      }
    }
  }, [orderId, allData]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await API.fetchOrders();
      setAllData(data);
    } catch (error) {
      console.error('Load data error:', error);
      alert(`❌ Lỗi tải dữ liệu: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    if (!searchText.trim()) return allData.slice(0, 100); // Limit to 100 for performance
    
    const searchLower = searchText.toLowerCase();
    return allData.filter(order => {
      const orderCode = String(order[PRIMARY_KEY_COLUMN] || '').toLowerCase();
      const customerName = String(order['Name*'] || '').toLowerCase();
      const phone = String(order['Phone*'] || '').toLowerCase();
      const tracking = String(order['Mã Tracking'] || '').toLowerCase();
      
      return orderCode.includes(searchLower) ||
             customerName.includes(searchLower) ||
             phone.includes(searchLower) ||
             tracking.includes(searchLower);
    }).slice(0, 100);
  }, [allData, searchText]);

  const getStepStatus = (step, order) => {
    if (step.statusKey) {
      // Bước có status key (như Kết quả Check, Trạng thái giao hàng)
      const status = order[step.statusKey];
      if (!status || status === '' || status === 'Chưa Giao' || status === 'NHÃN') {
        return 'pending';
      }
      if (status === 'OK' || status === 'ĐÃ GIAO' || status === 'Giao Thành Công') {
        return 'completed';
      }
      if (status.includes('Huỷ') || status === 'Hủy' || status === 'HOÀN') {
        return 'cancelled';
      }
      return 'in-progress';
    } else if (step.key) {
      // Bước có date key
      const dateValue = order[step.key];
      if (!dateValue || dateValue === '') {
        return 'pending';
      }
      return 'completed';
    }
    return 'pending';
  };

  const getStepDate = (step, order) => {
    if (step.key && order[step.key]) {
      const dateStr = order[step.key];
      if (typeof dateStr === 'string') {
        // Try to parse date
        try {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('vi-VN');
          }
          return dateStr;
        } catch (e) {
          return dateStr;
        }
      }
    }
    return null;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString.includes('Z') ? dateString : dateString + 'Z');
      if (isNaN(date.getTime())) return dateString;
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <Link to="/" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 mb-4">
          <ChevronLeft className="w-4 h-4" />
          Quay lại
        </Link>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500 rounded-lg">
              <Package className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Lệnh Sản xuất</h1>
              <p className="text-gray-500">Theo dõi các bước của đơn hàng</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Order List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Tìm kiếm đơn hàng..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Đang tải...</div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Không tìm thấy đơn hàng</div>
              ) : (
                filteredOrders.map((order) => {
                  const orderCode = order[PRIMARY_KEY_COLUMN];
                  const isSelected = selectedOrder && selectedOrder[PRIMARY_KEY_COLUMN] === orderCode;
                  
                  return (
                    <div
                      key={orderCode}
                      onClick={() => setSelectedOrder(order)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-blue-50 border-blue-500 shadow-md'
                          : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="font-semibold text-gray-800">{orderCode}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        {order['Name*'] || 'N/A'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatDate(order['Ngày lên đơn'])}
                      </div>
                      {order['Trạng thái giao hàng'] && (
                        <div className="mt-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            order['Trạng thái giao hàng'] === 'ĐÃ GIAO' 
                              ? 'bg-green-100 text-green-800'
                              : order['Trạng thái giao hàng'] === 'ĐANG GIAO'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {order['Trạng thái giao hàng']}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Order Details Timeline */}
        <div className="lg:col-span-2">
          {selectedOrder ? (
            <div className="bg-white rounded-lg shadow-md p-6">
              {/* Order Header */}
              <div className="border-b border-gray-200 pb-4 mb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">
                      {selectedOrder[PRIMARY_KEY_COLUMN]}
                    </h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Khách hàng:</span>
                        <span className="ml-2 font-medium">{selectedOrder['Name*'] || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">SĐT:</span>
                        <span className="ml-2 font-medium">{selectedOrder['Phone*'] || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Địa chỉ:</span>
                        <span className="ml-2 font-medium">{selectedOrder['Add'] || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Tổng tiền:</span>
                        <span className="ml-2 font-medium text-green-600">
                          {Number(selectedOrder['Tổng tiền VNĐ'] || 0).toLocaleString('vi-VN')} ₫
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="relative">
                {/* Vertical Line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

                {/* Steps */}
                <div className="space-y-8">
                  {PRODUCTION_STEPS.map((step, index) => {
                    const status = getStepStatus(step, selectedOrder);
                    const stepDate = getStepDate(step, selectedOrder);
                    const statusValue = step.statusKey ? selectedOrder[step.statusKey] : null;
                    const Icon = step.icon;

                    return (
                      <div key={step.id} className="relative flex items-start gap-4">
                        {/* Icon Circle */}
                        <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full ${
                          status === 'completed' ? step.color : 
                          status === 'in-progress' ? 'bg-yellow-400' :
                          status === 'cancelled' ? 'bg-red-500' :
                          'bg-gray-300'
                        }`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 pb-8">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className={`text-lg font-semibold ${
                                status === 'completed' ? 'text-green-600' :
                                status === 'in-progress' ? 'text-yellow-600' :
                                status === 'cancelled' ? 'text-red-600' :
                                'text-gray-400'
                              }`}>
                                {step.label}
                              </h3>
                              {stepDate && (
                                <div className="text-sm text-gray-500 mt-1">
                                  <Clock className="w-4 h-4 inline mr-1" />
                                  {stepDate}
                                </div>
                              )}
                              {statusValue && (
                                <div className="text-sm text-gray-700 mt-2">
                                  <span className="font-medium">Trạng thái:</span>{' '}
                                  <span className={`px-2 py-1 rounded ${
                                    status === 'completed' ? 'bg-green-100 text-green-800' :
                                    status === 'in-progress' ? 'bg-yellow-100 text-yellow-800' :
                                    status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {statusValue}
                                  </span>
                                </div>
                              )}
                              {step.id === 'co-tracking' && selectedOrder['Mã Tracking'] && (
                                <div className="text-sm text-gray-700 mt-2">
                                  <span className="font-medium">Mã Tracking:</span>{' '}
                                  <span className="font-mono bg-blue-50 px-2 py-1 rounded">
                                    {selectedOrder['Mã Tracking']}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div>
                              {status === 'completed' && (
                                <CheckCircle className="w-6 h-6 text-green-500" />
                              )}
                              {status === 'in-progress' && (
                                <Clock className="w-6 h-6 text-yellow-500" />
                              )}
                              {status === 'cancelled' && (
                                <AlertCircle className="w-6 h-6 text-red-500" />
                              )}
                              {status === 'pending' && (
                                <Clock className="w-6 h-6 text-gray-400" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Additional Info */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Thông tin bổ sung</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Mặt hàng:</span>
                    <span className="ml-2 font-medium">{selectedOrder['Mặt hàng'] || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Khu vực:</span>
                    <span className="ml-2 font-medium">{selectedOrder['Khu vực'] || 'N/A'}</span>
                  </div>
                  {selectedOrder['Ghi chú'] && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Ghi chú:</span>
                      <span className="ml-2 font-medium">{selectedOrder['Ghi chú']}</span>
                    </div>
                  )}
                  {selectedOrder['GHI CHÚ'] && (
                    <div className="col-span-2">
                      <span className="text-gray-500">GHI CHÚ:</span>
                      <span className="ml-2 font-medium">{selectedOrder['GHI CHÚ']}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                Chọn đơn hàng để xem chi tiết
              </h3>
              <p className="text-gray-500">
                Vui lòng chọn một đơn hàng từ danh sách bên trái để xem các bước sản xuất
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LenHSanXuat;

