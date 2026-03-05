import { useEffect, useState } from 'react';
import { ArrowLeft, Save, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase/config';

const CURRENCY_OPTIONS = [
  { key: 'usd', label: 'USD', symbol: '$' },
  { key: 'jpy', label: 'JPY (YEN)', symbol: '¥' },
  { key: 'cad', label: 'CAD', symbol: 'C$' },
  { key: 'aud', label: 'AUD', symbol: 'A$' },
  { key: 'gbp', label: 'GBP', symbol: '£' },
  { key: 'krw', label: 'KRW', symbol: '₩' },
];

function QuanLyTyGia() {
  const [exchangeRates, setExchangeRates] = useState({
    usd: 0,
    jpy: 0,
    cad: 0,
    aud: 0,
    gbp: 0,
    krw: 0,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Load tỷ giá từ database
  const loadExchangeRates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) {
        // Nếu bảng chưa tồn tại hoặc chưa có dữ liệu, tạo mới
        if (error.code === 'PGRST116') {
          // Không có dữ liệu, giữ giá trị mặc định
          setMessage({ type: 'info', text: 'Chưa có dữ liệu tỷ giá. Vui lòng nhập và lưu.' });
        } else {
          throw error;
        }
      } else if (data) {
        setExchangeRates({
          usd: data.usd || 0,
          jpy: data.jpy || 0,
          cad: data.cad || 0,
          aud: data.aud || 0,
          gbp: data.gbp || 0,
          krw: data.krw || 0,
        });
        setMessage({ type: 'success', text: 'Đã tải tỷ giá từ database' });
      }
    } catch (error) {
      console.error('Error loading exchange rates:', error);
      setMessage({ type: 'error', text: 'Lỗi khi tải tỷ giá: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExchangeRates();
  }, []);

  // Handle input change
  const handleRateChange = (currency, value) => {
    const numValue = parseFloat(value) || 0;
    setExchangeRates((prev) => ({
      ...prev,
      [currency]: numValue,
    }));
  };

  // Save tỷ giá vào database
  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    
    try {
      // Kiểm tra xem đã có record với id=1 chưa
      const { data: existingData } = await supabase
        .from('exchange_rates')
        .select('id')
        .eq('id', 1)
        .single();

      if (existingData) {
        // Update existing record
        const { error } = await supabase
          .from('exchange_rates')
          .update({
            ...exchangeRates,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);

        if (error) throw error;
        setMessage({ type: 'success', text: 'Đã cập nhật tỷ giá thành công!' });
      } else {
        // Insert new record
        const { error } = await supabase
          .from('exchange_rates')
          .insert({
            id: 1,
            ...exchangeRates,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
        setMessage({ type: 'success', text: 'Đã tạo mới tỷ giá thành công!' });
      }
    } catch (error) {
      console.error('Error saving exchange rates:', error);
      setMessage({ type: 'error', text: 'Lỗi khi lưu tỷ giá: ' + error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm z-10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/doi-soat-bill-cuoc"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-800">Quản lý tỷ giá</h1>
              <p className="text-xs text-gray-500">Cài đặt tỷ giá quy đổi tiền tệ</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadExchangeRates}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Đang tải...' : 'Tải lại'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Đang lưu...' : 'Lưu tỷ giá'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Message */}
        {message.text && (
          <div
            className={`mb-4 p-3 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : message.type === 'error'
                ? 'bg-red-50 text-red-800 border border-red-200'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Exchange Rates Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Tỷ giá quy đổi (1 đơn vị = ? VNĐ)</h2>
            <p className="text-sm text-gray-500 mt-1">
              Nhập tỷ giá quy đổi từ các loại tiền tệ sang VNĐ. Ví dụ: 1 USD = 25,000 VNĐ
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
                    Loại tiền tệ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
                    Ký hiệu
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
                    Tỷ giá (VNĐ)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
                    Ví dụ
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {CURRENCY_OPTIONS.map((currency) => {
                  const rate = exchangeRates[currency.key];
                  return (
                    <tr key={currency.key} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {currency.label}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {currency.symbol}
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="number"
                          step="0.01"
                          value={rate || ''}
                          onChange={(e) => handleRateChange(currency.key, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {rate > 0 ? (
                          <>
                            1 {currency.label} = {rate.toLocaleString('vi-VN')} VNĐ
                          </>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-50 border-t border-gray-200">
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-2">📝 Lưu ý:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>Tỷ giá sẽ được tự động áp dụng khi chọn đơn vị tiền tệ trong bảng đối soát bill cước</li>
                <li>Vui lòng cập nhật tỷ giá thường xuyên để đảm bảo tính chính xác</li>
                <li>Sau khi thay đổi, nhấn "Lưu tỷ giá" để lưu vào database</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuanLyTyGia;
