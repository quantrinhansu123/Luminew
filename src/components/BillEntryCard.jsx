import React, { useState } from 'react';
import { Search, FileText, Image, CheckCircle, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { PRIMARY_KEY_COLUMN } from '../types';

const BillEntryCard = ({ allData, handleCellChange, onUpdate }) => {
  const [searchOrderCode, setSearchOrderCode] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paymentBill, setPaymentBill] = useState('');
  const [paymentImage, setPaymentImage] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Tìm kiếm đơn hàng theo mã đơn trong allData
  const handleSearch = () => {
    if (!searchOrderCode.trim()) {
      toast.error('Vui lòng nhập mã đơn hàng');
      return;
    }

    setIsSearching(true);
    
    // Normalize search term
    const searchTerm = searchOrderCode.trim().toLowerCase();
    
    // Debug: Log sample data để kiểm tra
    if (allData.length > 0) {
      const sample = allData[0];
      console.log('🔍 [BillEntry] Sample row keys:', Object.keys(sample));
      console.log('🔍 [BillEntry] Sample "Mã đơn hàng":', sample[PRIMARY_KEY_COLUMN]);
      console.log('🔍 [BillEntry] Sample order_code:', sample.order_code);
      console.log('🔍 [BillEntry] Searching for:', searchTerm);
    }
    
    // Tìm trong allData - kiểm tra nhiều cột và nhiều cách
    const foundOrder = allData.find((row) => {
      // Thử nhiều cách lấy mã đơn hàng
      const possibleCodes = [
        row[PRIMARY_KEY_COLUMN],           // "Mã đơn hàng"
        row.order_code,                     // order_code
        row['order_code'],                  // order_code (string key)
        row['Mã đơn hàng'],                 // Mã đơn hàng (string key)
        row['Mã_đơn_hàng'],                 // Mã_đơn_hàng (snake_case)
      ].filter(Boolean); // Loại bỏ null/undefined
      
      // So sánh với tất cả các giá trị có thể
      return possibleCodes.some(code => {
        const normalizedCode = String(code).trim().toLowerCase();
        return normalizedCode === searchTerm;
      });
    });

    if (foundOrder) {
      setSelectedOrder(foundOrder);
      // Load giá trị hiện tại nếu có
      const orderId = foundOrder[PRIMARY_KEY_COLUMN] || foundOrder.order_code;
      setPaymentBill(foundOrder['Payment Bill'] || foundOrder.payment_bill || '');
      setPaymentImage(foundOrder['Payment Image'] || foundOrder.payment_image || '');
      toast.success('Tìm thấy đơn hàng');
      console.log('✅ [BillEntry] Found order:', orderId);
    } else {
      // Debug: Hiển thị một vài mã đơn hàng đầu tiên để user biết format
      const sampleCodes = allData.slice(0, 5).map(row => 
        row[PRIMARY_KEY_COLUMN] || row.order_code || 'N/A'
      ).filter(Boolean);
      console.log('❌ [BillEntry] Not found. Sample codes in data:', sampleCodes);
      toast.error(`Không tìm thấy đơn hàng "${searchOrderCode}". Vui lòng kiểm tra lại mã đơn hàng.`);
      setSelectedOrder(null);
      setPaymentBill('');
      setPaymentImage('');
    }
    
    setIsSearching(false);
  };

  // Cập nhật thông tin bill
  const handleUpdateBill = () => {
    if (!selectedOrder) {
      toast.error('Vui lòng tìm kiếm đơn hàng trước');
      return;
    }

    if (!paymentBill) {
      toast.error('Vui lòng chọn trạng thái bill');
      return;
    }

    const orderId = selectedOrder[PRIMARY_KEY_COLUMN];
    
    // Cập nhật Payment Bill
    if (handleCellChange) {
      handleCellChange(orderId, 'Payment Bill', paymentBill);
    }
    
    // Cập nhật Payment Image
    if (handleCellChange) {
      handleCellChange(orderId, 'Payment Image', paymentImage);
    }

    toast.success('Đã cập nhật vào danh sách thay đổi. Vui lòng đồng bộ để lưu!');
    
    // Reset form
    setSearchOrderCode('');
    setSelectedOrder(null);
    setPaymentBill('');
    setPaymentImage('');
    
    // Gọi callback để refresh dữ liệu nếu có
    if (onUpdate) {
      onUpdate();
    }
  };

  // Xử lý Enter để tìm kiếm
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-800">Điền Bill</h3>
          <p className="text-xs text-gray-500">Tìm kiếm và cập nhật thông tin bill</p>
        </div>
      </div>

      {/* Thanh tìm kiếm */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Tìm kiếm mã đơn hàng
        </label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchOrderCode}
              onChange={(e) => setSearchOrderCode(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Nhập mã đơn hàng..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
          >
            {isSearching ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Đang tìm...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Tìm kiếm</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Thông tin đơn hàng đã chọn */}
      {selectedOrder && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Mã đơn hàng:</p>
              <p className="text-lg font-bold text-blue-700">
                {selectedOrder['Mã đơn hàng'] || selectedOrder.order_code}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedOrder(null);
                setPaymentBill('');
                setPaymentImage('');
                setSearchOrderCode('');
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {selectedOrder['Name*'] && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">Khách hàng:</span> {selectedOrder['Name*']}
            </p>
          )}
        </div>
      )}

      {/* Form cập nhật */}
      {selectedOrder && (
        <div className="space-y-4">
          {/* Payment Bill */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trạng thái Bill <span className="text-red-500">*</span>
            </label>
            <select
              value={paymentBill}
              onChange={(e) => setPaymentBill(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">-- Chọn trạng thái --</option>
              <option value="Có bill">Có bill</option>
              <option value="Bill một phần">Bill một phần</option>
            </select>
          </div>

          {/* Payment Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Image className="w-4 h-4 inline mr-1" />
              Link hình ảnh Bill (có thể dán nhiều link, mỗi link một dòng)
            </label>
            <textarea
              value={paymentImage}
              onChange={(e) => setPaymentImage(e.target.value)}
              placeholder="Dán các đường link hình ảnh bill, mỗi link một dòng..."
              rows={4}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 Có thể dán nhiều link, mỗi link một dòng
            </p>
          </div>

          {/* Nút cập nhật */}
          <button
            onClick={handleUpdateBill}
            disabled={!paymentBill}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
          >
            <CheckCircle className="w-5 h-5" />
            <span>Cập nhật Bill</span>
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">
            💡 Thay đổi sẽ được thêm vào danh sách chờ đồng bộ
          </p>
        </div>
      )}
    </div>
  );
};

export default BillEntryCard;
