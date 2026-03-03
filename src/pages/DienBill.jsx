import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import usePermissions from '../hooks/usePermissions';
import * as API from '../services/api';
import { PRIMARY_KEY_COLUMN } from '../types';

const BillEntryCard = lazy(() => import('../components/BillEntryCard'));

function DienBill() {
  const { canView } = usePermissions();
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(new Map());
  const [legacyChanges, setLegacyChanges] = useState(new Map());

  // Load dữ liệu đơn hàng - Load tất cả đơn hàng để có thể tìm kiếm bất kỳ đơn nào
  const loadData = async () => {
    setLoading(true);
    try {
      // Thử load từ Supabase trực tiếp để có tất cả đơn hàng (không filter)
      const { supabase } = await import('../supabase/config');
      
      try {
        const { data: supabaseData, error } = await supabase
          .from('orders')
          .select('*')
          .order('order_date', { ascending: false })
          .limit(5000); // Load nhiều đơn hàng để tìm kiếm
        
        if (!error && supabaseData && supabaseData.length > 0) {
          // Map to App Format nếu có hàm mapSupabaseOrderToApp
          const { mapSupabaseOrderToApp } = await import('../services/api');
          const mappedData = supabaseData.map(mapSupabaseOrderToApp || ((row) => {
            // Fallback mapping nếu không có hàm
            return {
              ...row,
              'Mã đơn hàng': row.order_code || row['Mã đơn hàng'],
              'Name*': row.customer_name || row['Name*'],
              'Phone*': row.customer_phone || row['Phone*'],
            };
          }));
          setAllData(mappedData);
          console.log(`✅ [DienBill] Loaded ${mappedData.length} orders from Supabase`);
        } else {
          // Fallback to API
          const data = await API.fetchOrders();
          setAllData(data);
          console.log(`✅ [DienBill] Loaded ${data.length} orders from API`);
        }
      } catch (supabaseError) {
        console.warn('Supabase direct query failed, using API:', supabaseError);
        // Fallback to API
        const data = await API.fetchOrders();
        setAllData(data);
      }
    } catch (error) {
      console.error('Load data error:', error);
      // Final fallback
      try {
        const data = await API.fetchOrders();
        setAllData(data);
      } catch (fallbackError) {
        console.error('All data loading methods failed:', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle cell change - tương tự FFM
  const handleCellChange = useCallback((orderId, colKey, newValue) => {
    const originalRow = allData.find((r) => r[PRIMARY_KEY_COLUMN] === orderId);
    const originalValue = originalRow ? String(originalRow[colKey] ?? '') : '';

    setPendingChanges((prev) => {
      const next = new Map(prev);
      if (!next.has(orderId)) next.set(orderId, new Map());

      if (newValue !== originalValue) {
        next.get(orderId).set(colKey, { newValue, originalValue });
      } else {
        next.get(orderId).delete(colKey);
        if (next.get(orderId).size === 0) next.delete(orderId);
        setLegacyChanges((prevLeg) => {
          const nextLeg = new Map(prevLeg);
          if (nextLeg.has(orderId)) {
            nextLeg.get(orderId).delete(colKey);
            if (nextLeg.get(orderId).size === 0) nextLeg.delete(orderId);
          }
          return nextLeg;
        });
      }
      return next;
    });
  }, [allData]);

  // Update all changes
  const handleUpdateAll = async () => {
    if (pendingChanges.size === 0 && legacyChanges.size === 0) {
      alert('Không có thay đổi nào để cập nhật');
      return;
    }

    const allChanges = new Map([...legacyChanges, ...pendingChanges]);
    const rowsToSend = [];

    allChanges.forEach((changes, orderId) => {
      const row = { [PRIMARY_KEY_COLUMN]: orderId };
      changes.forEach((info, key) => {
        row[key] = info.newValue;
      });
      rowsToSend.push(row);
    });

    try {
      const res = await API.updateBatch(rowsToSend);
      if (res.success) {
        setPendingChanges(new Map());
        setLegacyChanges(new Map());
        alert(`Đã cập nhật ${rowsToSend.length} đơn hàng thành công!`);
        loadData();
      } else {
        alert('Cập nhật thất bại: ' + (res.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('Lỗi khi cập nhật: ' + error.message);
    }
  };

  if (!canView('ORDERS_FFM')) {
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này (ORDERS_FFM).
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-4 font-sans text-gray-800 bg-[#f8f9fa]">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-700">Điền Bill</h2>
              <p className="text-sm text-gray-500">Tìm kiếm và cập nhật thông tin bill cho đơn hàng</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {loading ? 'Đang tải...' : '↻ Tải lại'}
            </button>
            {pendingChanges.size + legacyChanges.size > 0 && (
              <button
                onClick={handleUpdateAll}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium relative"
              >
                Cập nhật ({pendingChanges.size + legacyChanges.size})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bill Entry Card */}
      <Suspense fallback={
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="animate-pulse h-32 bg-gray-200 rounded"></div>
        </div>
      }>
        <BillEntryCard 
          allData={allData}
          handleCellChange={handleCellChange}
          onUpdate={loadData}
        />
      </Suspense>

      {/* Info Card */}
      <div className="bg-white rounded-lg shadow-sm p-4 mt-4">
        <h3 className="text-lg font-semibold text-gray-700 mb-3">Hướng dẫn sử dụng</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-start gap-2">
            <span className="text-blue-500 font-bold">1.</span>
            <span>Nhập mã đơn hàng vào ô tìm kiếm và nhấn "Tìm kiếm"</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-500 font-bold">2.</span>
            <span>Chọn trạng thái bill: "Có bill" hoặc "Bill một phần"</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-500 font-bold">3.</span>
            <span>Dán các link hình ảnh bill vào ô "Link hình ảnh Bill" (mỗi link một dòng)</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-500 font-bold">4.</span>
            <span>Nhấn "Cập nhật Bill" để thêm vào danh sách thay đổi</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-500 font-bold">5.</span>
            <span>Nhấn "Cập nhật" ở trên để lưu tất cả thay đổi</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DienBill;
