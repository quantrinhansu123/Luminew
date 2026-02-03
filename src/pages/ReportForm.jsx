import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate } from 'react-router-dom';

function ReportForm() {
  // State cho thông tin cố định
  const [fixedInfo, setFixedInfo] = useState({
    name: '',
    email: '',
    date: new Date().toISOString().split('T')[0],
    shift: ''
  });

  // State cho các báo cáo (chỉ chứa thông tin thay đổi)
  const [reports, setReports] = useState([{
    product: '',
    market: '',
    tkqc: '',
    cpqc: '',
    mess_cmt: '',
    orders: '',
    revenue: ''
  }]);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [expandedRows, setExpandedRows] = useState(new Set([0]));

  // State for dropdown options
  const [productOptions, setProductOptions] = useState([]);
  const [marketOptions, setMarketOptions] = useState([]);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const navigate = useNavigate();

  // Fetch dropdown data from direct URL
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        setDropdownLoading(true);
        const reportsUrl = 'https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/B%C3%A1o_c%C3%A1o_MKT.json';

        const response = await fetch(reportsUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Extract unique products and markets from existing reports
        const productsSet = new Set();
        const marketsSet = new Set();

        if (data && typeof data === 'object') {
          Object.values(data).forEach(report => {
            if (report.Sản_phẩm && report.Sản_phẩm.trim()) {
              productsSet.add(String(report.Sản_phẩm).trim());
            }
            if (report.Thị_trường && report.Thị_trường.trim()) {
              marketsSet.add(String(report.Thị_trường).trim());
            }
          });
        }

        const products = Array.from(productsSet).sort((a, b) => a.localeCompare(b, 'vi'));
        const markets = Array.from(marketsSet).sort((a, b) => a.localeCompare(b, 'vi'));

        setProductOptions(products);
        setMarketOptions(markets);
      } catch (err) {
        console.error('Error fetching dropdown data:', err);
        // Set empty arrays on error
        setProductOptions([]);
        setMarketOptions([]);
      } finally {
        setDropdownLoading(false);
      }
    };

    fetchDropdownData();
  }, []);

  // Load current user info (name, email) from localStorage on mount
  useEffect(() => {
    const name = localStorage.getItem('username') || '';
    const email = localStorage.getItem('userEmail') || '';

    setFixedInfo(prev => ({
      ...prev,
      name,
      email
    }));
  }, []);

  const formatNumberInput = (value) => {
    const cleanValue = value.replace(/[^0-9]/g, '');
    return cleanValue ? new Intl.NumberFormat('de-DE').format(cleanValue) : '';
  };

  const cleanNumberInput = (value) => {
    return value.replace(/[^0-9]/g, '');
  };

  const handleFixedInfoChange = (e) => {
    const { name, value } = e.target;
    setFixedInfo(prev => ({ ...prev, [name]: value }));
  };

  const handleReportChange = (e, reportIndex) => {
    const { name, value } = e.target;
    const numberFields = ['cpqc', 'mess_cmt', 'orders', 'revenue'];
    
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

  const validateForm = () => {
    const newErrors = {};
    
    // Validate fixed info
    if (!fixedInfo.name.trim()) newErrors['fixed-name'] = 'Required';
    if (!fixedInfo.email.trim()) newErrors['fixed-email'] = 'Required';
    if (!fixedInfo.date) newErrors['fixed-date'] = 'Required';
    if (!fixedInfo.shift) newErrors['fixed-shift'] = 'Required';

    // Validate reports
    reports.forEach((report, index) => {
      if (!report.product.trim()) newErrors[`${index}-product`] = 'Required';
      if (!report.market.trim()) newErrors[`${index}-market`] = 'Required';
      if (!report.tkqc.trim()) newErrors[`${index}-tkqc`] = 'Required';
      if (!report.cpqc) newErrors[`${index}-cpqc`] = 'Required';
      if (!report.mess_cmt) newErrors[`${index}-mess_cmt`] = 'Required';
      if (!report.orders) newErrors[`${index}-orders`] = 'Required';
      if (!report.revenue) newErrors[`${index}-revenue`] = 'Required';
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error('Vui lòng điền đầy đủ thông tin bắt buộc', { position: 'top-right', autoClose: 3000 });
      return;
    }

    setLoading(true);
    try {
      const reportsUrl = 'https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/B%C3%A1o_c%C3%A1o_MKT.json';

      // Prepare pushes for all reports
      const pushes = reports.map(async (report) => {
        const payload = {
          "Tên": fixedInfo.name,
          "Email": fixedInfo.email,
          "Ngày": fixedInfo.date,
          "ca": fixedInfo.shift,
          "Sản_phẩm": report.product,
          "Thị_trường": report.market,
          "TKQC": report.tkqc,
          "CPQC": Number(cleanNumberInput(String(report.cpqc || ''))) || 0,
          "Số_Mess_Cmt": Number(cleanNumberInput(String(report.mess_cmt || ''))) || 0,
          "Số đơn": Number(cleanNumberInput(String(report.orders || ''))) || 0,
          "Doanh số": Number(cleanNumberInput(String(report.revenue || ''))) || 0,
          "Team": localStorage.getItem('userTeam') || '',
          "id_NS": localStorage.getItem('userId') || '',
          "Via_log": fixedInfo.name,
          "Tháng": new Date().getMonth() + 1,
          "DS chốt": 0
        };

        const response = await fetch(reportsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.json();
      });

      // Wait until all pushes finish
      await Promise.all(pushes);

      toast.success(`Đã lưu thành công ${reports.length} báo cáo!`, { position: 'top-right', autoClose: 3000 });

      // Reset reports but keep fixed info
      setReports([{
        product: '',
        market: '',
        tkqc: '',
        cpqc: '',
        mess_cmt: '',
        orders: '',
        revenue: ''
      }]);
      setErrors({});
      setExpandedRows(new Set([0]));
    } catch (err) {
      console.error('Error saving reports:', err);
      toast.error('Lỗi khi lưu báo cáo: ' + (err.message || ''), { position: 'top-right', autoClose: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const addReport = () => {
    const lastReport = reports[reports.length - 1] || {};
    const newReport = {
      product: lastReport.product || '',
      market: lastReport.market || '',
      tkqc: '',
      cpqc: '',
      mess_cmt: '',
      orders: '',
      revenue: ''
    };

    setReports(prev => [...prev, newReport]);

    const newExpanded = new Set(expandedRows);
    newExpanded.add(reports.length);
    setExpandedRows(newExpanded);
  };

  const deleteReport = (reportIndex) => {
    const newReports = reports.filter((_, index) => index !== reportIndex);
    setReports(newReports);
    const newExpanded = new Set(expandedRows);
    newExpanded.delete(reportIndex);
    setExpandedRows(newExpanded);
  };

  const toggleReport = (reportIndex) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(reportIndex)) {
      newExpanded.delete(reportIndex);
    } else {
      newExpanded.add(reportIndex);
    }
    setExpandedRows(newExpanded);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="w-full mx-auto px-4 py-8">
        {/* Modern Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-xl hover:bg-gray-50 transition-all duration-150"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Quay lại
              </button>
            </div>

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

            <div className="flex items-center">
              <button
                onClick={addReport}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Thêm báo cáo
              </button>
            </div>
          </div>
        </div>

        {/* Fixed Information Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-6">
          <h4 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Thông tin cố định
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tên</label>
              <input
                type="text"
                name="name"
                value={fixedInfo.name}
                disabled
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                name="email"
                value={fixedInfo.email}
                disabled
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ngày <span className="text-red-500">*</span></label>
              <input
                type="date"
                name="date"
                value={fixedInfo.date}
                onChange={handleFixedInfoChange}
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors['fixed-date'] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ca <span className="text-red-500">*</span></label>
              <select
                name="shift"
                value={fixedInfo.shift}
                onChange={handleFixedInfoChange}
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors['fixed-shift'] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
              >
                <option value="">Chọn ca</option>
                <option value="Hết ca">Hết ca</option>
                <option value="Giữa ca">Giữa ca</option>
              </select>
            </div>
          </div>
        </div>

        {/* Reports Section */}
        <div className="space-y-6">
          {reports.map((report, reportIndex) => {
            const isExpanded = expandedRows.has(reportIndex);
            const hasErrors = Object.keys(errors).some(key => key.startsWith(`${reportIndex}-`));
            
            return (
              <div key={reportIndex} className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-xl">
                {/* Card Header */}
                <div 
                  className={`p-6 cursor-pointer select-none transition-colors ${hasErrors ? 'bg-red-50' : 'bg-gradient-to-r from-blue-50 to-purple-50'}`}
                  onClick={() => toggleReport(reportIndex)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-md ${hasErrors ? 'bg-red-500' : 'bg-gradient-to-br from-green-500 to-green-300'}`}>
                        {reportIndex + 1}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800">
                          {report.product || 'Báo cáo chưa có sản phẩm'}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {report.market || 'Chưa chọn thị trường'} • {fixedInfo.shift || 'Chưa chọn ca'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {hasErrors && (
                        <span className="text-xs font-medium text-red-600 bg-red-100 px-3 py-1 rounded-full">
                          Thiếu thông tin
                        </span>
                      )}
                      {reports.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteReport(reportIndex);
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                      <svg 
                        className={`w-6 h-6 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Card Content - Tất cả trường trên 1 dòng */}
                {isExpanded && (
                  <div className="p-6 border-t border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
                      {/* Sản phẩm */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Sản phẩm <span className="text-red-500">*</span></label>
                        <select
                          name="product"
                          value={report.product}
                          onChange={(e) => handleReportChange(e, reportIndex)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors[`${reportIndex}-product`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                        >
                          <option value="">Chọn sản phẩm</option>
                          {dropdownLoading ? (
                            <option value="" disabled>Đang tải...</option>
                          ) : productOptions.length === 0 ? (
                            <option value="">Không có dữ liệu</option>
                          ) : (
                            productOptions.map(p => (
                              <option key={p} value={p}>{p}</option>
                            ))
                          )}
                        </select>
                      </div>

                      {/* Thị trường */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Thị trường <span className="text-red-500">*</span></label>
                        <select
                          name="market"
                          value={report.market}
                          onChange={(e) => handleReportChange(e, reportIndex)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors[`${reportIndex}-market`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                        >
                          <option value="">Chọn thị trường</option>
                          {dropdownLoading ? (
                            <option value="" disabled>Đang tải...</option>
                          ) : marketOptions.length === 0 ? (
                            <option value="">Không có dữ liệu</option>
                          ) : (
                            marketOptions.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))
                          )}
                        </select>
                      </div>

                      {/* TKQC */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">TKQC <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          name="tkqc"
                          value={report.tkqc}
                          onChange={(e) => handleReportChange(e, reportIndex)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors[`${reportIndex}-tkqc`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                          placeholder="Nhập TKQC"
                        />
                      </div>

                      {/* CPQC */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">CPQC <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          inputMode="numeric"
                          name="cpqc"
                          value={report.cpqc}
                          onChange={(e) => handleReportChange(e, reportIndex)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors[`${reportIndex}-cpqc`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                          placeholder="0"
                        />
                      </div>

                      {/* Mess/Cmt */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Mess/Cmt <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          inputMode="numeric"
                          name="mess_cmt"
                          value={report.mess_cmt}
                          onChange={(e) => handleReportChange(e, reportIndex)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors[`${reportIndex}-mess_cmt`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                          placeholder="0"
                        />
                      </div>

                      {/* Số đơn */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Số đơn <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          inputMode="numeric"
                          name="orders"
                          value={report.orders}
                          onChange={(e) => handleReportChange(e, reportIndex)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors[`${reportIndex}-orders`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                          placeholder="0"
                        />
                      </div>

                      {/* Doanh số */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Doanh số <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          inputMode="numeric"
                          name="revenue"
                          value={report.revenue}
                          onChange={(e) => handleReportChange(e, reportIndex)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${errors[`${reportIndex}-revenue`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Submit Button */}
          <div className="flex justify-center pt-4">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={`flex items-center gap-3 px-12 py-4 rounded-2xl font-bold text-lg text-white shadow-xl transition-all duration-300 ${
                loading 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-green-500 hover:shadow-2xl hover:scale-105'
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang gửi...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Gửi {reports.length} báo cáo
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportForm;