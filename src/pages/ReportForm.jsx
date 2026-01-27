import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { supabase } from '../services/supabaseClient';

function ReportForm() {
  const navigate = useNavigate();

  // Initial defaults for new rows
  const [defaultInfo, setDefaultInfo] = useState({
    name: '',
    email: '',
    date: new Date().toISOString().split('T')[0],
    shift: ''
  });

  // State for reports, initialized empty until user info loads
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // State for dropdown options
  const [productOptions, setProductOptions] = useState([]);
  const [marketOptions, setMarketOptions] = useState([]);
  const [dropdownLoading, setDropdownLoading] = useState(false);

  // Fetch dropdown data
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        setDropdownLoading(true);

        const { data, error } = await supabase
          .from('sales_reports')
          .select('product, market')
          .limit(1000)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const productsSet = new Set();
        const marketsSet = new Set();

        if (data) {
          data.forEach(item => {
            if (item.product?.trim()) productsSet.add(item.product.trim());
            if (item.market?.trim()) marketsSet.add(item.market.trim());
          });
        }

        if (productsSet.size === 0) {
          ['Lumi Eyes', 'Lumi Nano', 'Lumi Skin'].forEach(p => productsSet.add(p));
        }
        if (marketsSet.size === 0) {
          ['Việt Nam', 'Thái Lan', 'Philippines', 'Malaysia'].forEach(m => marketsSet.add(m));
        }

        setProductOptions(Array.from(productsSet).sort((a, b) => a.localeCompare(b, 'vi')));
        setMarketOptions(Array.from(marketsSet).sort((a, b) => a.localeCompare(b, 'vi')));
      } catch (err) {
        console.error('Error fetching dropdown data:', err);
        setProductOptions(['Lumi Eyes', 'Lumi Nano']);
        setMarketOptions(['Việt Nam', 'Thái Lan']);
      } finally {
        setDropdownLoading(false);
      }
    };

    fetchDropdownData();
  }, []);

  // Load current user info
  useEffect(() => {
    const name = localStorage.getItem('username') || '';
    const email = localStorage.getItem('userEmail') || '';
    const currentDate = new Date().toISOString().split('T')[0];

    setDefaultInfo(prev => ({
      ...prev,
      name,
      email,
      date: currentDate
    }));

    // Initialize first row
    setReports([{
      name: name,
      email: email,
      date: currentDate,
      shift: '',
      product: '',
      market: '',
      mess_cmt: '',
      response: '',
      orders: '',
      revenue: ''
    }]);
  }, []);

  const formatNumberInput = (value) => {
    const cleanValue = value.replace(/[^0-9]/g, '');
    return cleanValue ? new Intl.NumberFormat('de-DE').format(cleanValue) : '';
  };

  const cleanNumberInput = (value) => {
    return value.replace(/[^0-9]/g, '');
  };

  const handleReportChange = (e, reportIndex) => {
    const { name, value } = e.target;
    const numberFields = ['cpqc', 'mess_cmt', 'response', 'orders', 'revenue'];

    const newReports = [...reports];
    if (numberFields.includes(name)) {
      const formattedValue = formatNumberInput(value);
      newReports[reportIndex] = { ...newReports[reportIndex], [name]: formattedValue };
    } else {
      newReports[reportIndex] = { ...newReports[reportIndex], [name]: value };
    }
    setReports(newReports);

    const errorKey = `${reportIndex}-${name}`;
    if (errors[errorKey]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[errorKey];
        return newErrors;
      });
    }
  };

  const addReport = (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const lastReport = reports[reports.length - 1] || defaultInfo;
    const newReport = {
      name: lastReport.name,
      email: lastReport.email,
      date: lastReport.date,
      shift: lastReport.shift,
      product: lastReport.product || '',
      market: lastReport.market || '',
      mess_cmt: '',
      response: '',
      orders: '',
      revenue: ''
    };
    setReports(prev => [...prev, newReport]);
  };

  const deleteReport = (reportIndex) => {
    if (reports.length <= 1) {
      toast.warn("Cần ít nhất 1 dòng báo cáo!");
      return;
    }
    const newReports = reports.filter((_, index) => index !== reportIndex);
    setReports(newReports);
  };

  const validateForm = () => {
    const newErrors = {};
    reports.forEach((report, index) => {
      if (!report.name?.trim()) newErrors[`${index}-name`] = 'Required';
      if (!report.date) newErrors[`${index}-date`] = 'Required';
      if (!report.shift) newErrors[`${index}-shift`] = 'Required';
      if (!report.product?.trim()) newErrors[`${index}-product`] = 'Required';
      if (!report.market?.trim()) newErrors[`${index}-market`] = 'Required';
      if (!report.mess_cmt) newErrors[`${index}-mess_cmt`] = 'Required';
      if (!report.response) newErrors[`${index}-response`] = 'Required';
      if (!report.orders) newErrors[`${index}-orders`] = 'Required';
      if (!report.revenue) newErrors[`${index}-revenue`] = 'Required';
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error('Vui lòng điền đầy đủ thông tin bắt buộc (các ô viền đỏ)', { position: 'top-right', autoClose: 3000 });
      return;
    }

    setLoading(true);
    try {
      const payload = reports.map(report => ({
        name: report.name,
        email: report.email,
        date: report.date,
        shift: report.shift,
        product: report.product,
        market: report.market,
        mess_count: Number(cleanNumberInput(String(report.mess_cmt || ''))) || 0,
        response_count: Number(cleanNumberInput(String(report.response || ''))) || 0,
        order_count: Number(cleanNumberInput(String(report.orders || ''))) || 0,
        revenue_mess: Number(cleanNumberInput(String(report.revenue || ''))) || 0,
        team: localStorage.getItem('userTeam') || 'Sale',
        created_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('sales_reports')
        .insert(payload);

      if (error) throw error;

      toast.success(`Đã lưu thành công ${reports.length} báo cáo!`, { position: 'top-right', autoClose: 3000 });

      // Reset but keep user info settings for next entry
      setReports([{
        name: defaultInfo.name,
        email: defaultInfo.email,
        date: new Date().toISOString().split('T')[0],
        shift: '',
        product: '',
        market: '',
        mess_cmt: '',
        response: '',
        orders: '',
        revenue: ''
      }]);
      setErrors({});
    } catch (err) {
      console.error('Error saving reports:', err);
      toast.error('Lỗi khi lưu báo cáo: ' + (err.message || ''), { position: 'top-right', autoClose: 5000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="w-full mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6 mx-auto justify-center">
              <img
                src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Ff930e667.%E1%BA%A2nh.025539.jpg"
                alt="Logo"
                className="h-16 w-16 rounded-full shadow-lg"
              />
              <div>
                <h1 className="text-3xl font-bold bg-green-500 bg-clip-text text-transparent">
                  Báo Cáo Marketing
                </h1>
                <p className="text-gray-500 mt-1">LumiGlobal Report System</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 overflow-hidden">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-semibold text-gray-700 flex items-center gap-2">
            </h4>
            <div className="text-sm text-gray-500 italic">
              * Mẹo: Các dòng mới sẽ tự động sao chép Tên, Email, Ngày, Ca từ dòng trên.
            </div>
          </div>

          <div className="overflow-x-auto pb-4">
            <table className="w-full min-w-[1400px] border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left text-sm font-semibold text-gray-600 border-b border-gray-200">
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 min-w-[150px]">Tên nhân viên</th>
                  <th className="p-3 min-w-[200px]">Email</th>
                  <th className="p-3 min-w-[140px]">Ngày <span className="text-red-500">*</span></th>
                  <th className="p-3 min-w-[120px]">Ca <span className="text-red-500">*</span></th>
                  <th className="p-3 min-w-[160px]">Sản phẩm <span className="text-red-500">*</span></th>
                  <th className="p-3 min-w-[140px]">Thị trường <span className="text-red-500">*</span></th>
                  <th className="p-3 min-w-[100px]">Số mess <span className="text-red-500">*</span></th>
                  <th className="p-3 min-w-[100px]">Phản hồi <span className="text-red-500">*</span></th>
                  <th className="p-3 min-w-[100px]">Số đơn <span className="text-red-500">*</span></th>
                  <th className="p-3 min-w-[140px]">Doanh số <span className="text-red-500">*</span></th>
                  <th className="p-3 w-16 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map((report, idx) => (
                  <tr key={idx} className="hover:bg-blue-50 transition-colors group">
                    <td className="p-3 text-center text-gray-400 font-medium">
                      {idx + 1}
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        name="name"
                        value={report.name}
                        readOnly
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 cursor-not-allowed text-sm"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="email"
                        name="email"
                        value={report.email}
                        readOnly
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 cursor-not-allowed text-sm"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="date"
                        name="date"
                        value={report.date}
                        onChange={(e) => handleReportChange(e, idx)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm transition-all ${errors[`${idx}-date`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                      />
                    </td>
                    <td className="p-3">
                      <select
                        name="shift"
                        value={report.shift}
                        onChange={(e) => handleReportChange(e, idx)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm transition-all ${errors[`${idx}-shift`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                      >
                        <option value="">Chọn ca</option>
                        <option value="Hết ca">Hết ca</option>
                        <option value="Giữa ca">Giữa ca</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <select
                        name="product"
                        value={report.product}
                        onChange={(e) => handleReportChange(e, idx)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm transition-all ${errors[`${idx}-product`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                      >
                        <option value="">Chọn sản phẩm</option>
                        {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className="p-3">
                      <select
                        name="market"
                        value={report.market}
                        onChange={(e) => handleReportChange(e, idx)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm transition-all ${errors[`${idx}-market`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                      >
                        <option value="">Chọn thị trường</option>
                        {marketOptions.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        name="mess_cmt"
                        value={report.mess_cmt}
                        onChange={(e) => handleReportChange(e, idx)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm transition-all ${errors[`${idx}-mess_cmt`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                        placeholder="0"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        name="response"
                        value={report.response}
                        onChange={(e) => handleReportChange(e, idx)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm transition-all ${errors[`${idx}-response`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                        placeholder="0"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        name="orders"
                        value={report.orders}
                        onChange={(e) => handleReportChange(e, idx)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm transition-all ${errors[`${idx}-orders`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                        placeholder="0"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        name="revenue"
                        value={report.revenue}
                        onChange={(e) => handleReportChange(e, idx)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm transition-all ${errors[`${idx}-revenue`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                        placeholder="0"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => deleteReport(idx)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Xóa dòng"
                        disabled={reports.length <= 1}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <button
              onClick={addReport}
              className="flex items-center gap-2 px-4 py-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Thêm dòng
            </button>
          </div>
        </div>

        <div className="flex justify-center pt-8 pb-12">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`flex items-center gap-3 px-12 py-4 rounded-2xl font-bold text-lg text-white shadow-xl transition-all ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:shadow-2xl hover:scale-105'}`}
          >
            {loading ? 'Đang gửi...' : `Gửi ${reports.length} báo cáo`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportForm;
