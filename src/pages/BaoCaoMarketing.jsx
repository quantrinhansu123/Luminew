import { useEffect, useRef, useState } from 'react';
// If xlsx is not available, processExcelFile will fail. Assuming environment setup.
// I will keep imports minimal.


export default function BaoCaoMarketing() {
  const [appData, setAppData] = useState({
    employeeDetails: [],
    shiftList: ['Hết ca', 'Giữa ca'],
    productList: [
      'Gel Dạ Dày',
      'Gel Trĩ',
      'ComboGold24k',
      'Fitgum CAFE 20X',
      'Bonavita Coffee',
      'Dragon Blood Cream',
      'Kem Body',
      'Bakuchiol Retinol',
      'Serum sâm',
      'DG',
      'Kẹo Táo',
      'Glutathione Collagen',
      'Glutathione Collagen NEW',
      'Gel trị ngứa',
      'Nám DR Hancy',
      'Gel Xương Khớp',
      'Gel XK Thái',
      'Gel XK Phi',
      'Dán Kinoki',
      'Sữa tắm CUISHIFAN',
    ],
    marketList: ['Nhật Bản', 'Hàn Quốc', 'Canada', 'US', 'Úc', 'Anh', 'CĐ Nhật Bản'],
  });

  const [tableHeaders, setTableHeaders] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [userEmail, setUserEmail] = useState('');
  const [currentTableName, setCurrentTableName] = useState('Báo cáo MKT');
  const [employeeNameFromUrl, setEmployeeNameFromUrl] = useState('');
  const [status, setStatus] = useState('Đang khởi tạo ứng dụng...');
  const [responseMsg, setResponseMsg] = useState({ text: '', isSuccess: true, visible: false });
  const [loading, setLoading] = useState(false);
  const employeeDatalistRef = useRef(null);

  const EMPLOYEE_API_URL =
    'https://n-api-rouge.vercel.app/sheet/getSheets?rangeSheet=A:K&sheetName=Nh%C3%A2n%20s%E1%BB%B1&spreadsheetId=1Cl-56By1eYFB4G7ITuG0IQhH39ITwo0AkZPFvsLfo54';
  const SCRIPT_URL = 'https://n-api-gamma.vercel.app/bulk-insert';
  const SPREADSHEET_ID = '1ylYT0UAcahij5UtDikKyJFWT3gIyRZsuFsYQ5aUTi2Y';
  const headerMkt = [
    'id',
    'Tên',
    'Email',
    'Ngày',
    'ca',
    'Sản_phẩm',
    'Thị_trường',
    'TKQC',
    'CPQC',
    'Số_Mess_Cmt',
    'Số đơn',
    'Doanh số',
    'Team',
    'id_NS',
    'Doanh số đi',
    'Số đơn hoàn hủy',
    'DS chốt',
    'DS sau hoàn hủy',
    'Doanh số sau ship',
    'Doanh số TC',
    'KPIs',
    'CPQC theo TKQC',
    'Báo cáo theo Page',
    'Trạng thái',
    'Cảnh báo',
  ];

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const email = urlParams.get('email') || localStorage.getItem('userEmail') || '';
    const hoten = urlParams.get('hoten') || localStorage.getItem('userName') || '';

    setUserEmail(email);
    setEmployeeNameFromUrl(hoten);

    initializeApp(email, hoten);
  }, []);

  const fetchEmployeeList = async () => {
    updateStatus('Đang tải danh sách nhân viên...');
    try {
      const response = await fetch(EMPLOYEE_API_URL);
      if (!response.ok) throw new Error(`Lỗi HTTP! status: ${response.status}`);
      const result = await response.json();

      let headers, rowObjects;
      if (result.headers && result.rows) {
        headers = result.headers;
        rowObjects = result.rows;
      } else if (Array.isArray(result)) {
        rowObjects = result;
        headers = rowObjects.length > 0 ? Object.keys(rowObjects[0]) : [];
      } else {
        throw new Error('Cấu trúc dữ liệu API không được hỗ trợ');
      }

      const findHeader = (keywords) => headers.find((h) => keywords.every((kw) => h.toLowerCase().includes(kw))) || null;

      const nameCol = findHeader(['họ', 'tên']) || 'Họ và Tên';
      const deptCol = findHeader(['bộ', 'phận']) || 'Bộ phận';
      const emailCol = findHeader(['email']) || 'email';
      const teamCol = findHeader(['team']) || 'Team';
      const idCol = findHeader(['id']) || 'id';
      const branchCol = findHeader(['chi nhánh']) || 'chi nhánh';

      const targetDepts = ['MKT'];

      const filteredEmployees = rowObjects
        .filter((row) => {
          const dept = row[deptCol];
          const name = row[nameCol];
          const deptMatch = dept && targetDepts.some((target) => dept.toString().toUpperCase().includes(target.toUpperCase()));
          return deptMatch && name && name.toString().trim() !== '';
        })
        .map((row) => ({
          name: row[nameCol]?.toString().trim(),
          email: row[emailCol]?.toString().trim() || '',
          team: row[teamCol]?.toString().trim() || '',
          id_ns: row[idCol]?.toString().trim() || '',
          branch: row[branchCol]?.toString().trim() || '',
        }))
        .filter((emp, idx, arr) => arr.findIndex((e) => e.name === emp.name) === idx);

      updateStatus(`Đã tải thành công ${filteredEmployees.length} nhân viên MKT.`);
      return filteredEmployees;
    } catch (error) {
      console.error('Lỗi chi tiết:', error);
      updateStatus(`Lỗi khi tải danh sách nhân viên: ${error.message}`, true);
      return [];
    }
  };

  const updateStatus = (message, isError = false) => {
    setStatus(new Date().toLocaleTimeString() + ': ' + message);
  };

  const formatNumberInput = (value) => {
    const cleanValue = String(value).replace(/[^0-9]/g, '');
    return cleanValue ? new Intl.NumberFormat('de-DE').format(cleanValue) : '';
  };

  const getToday = () => {
    const today = new Date();
    return today.toLocaleDateString('en-CA');
  };

  const initializeApp = async (email, hoten) => {
    const employees = await fetchEmployeeList();
    setAppData((prev) => ({ ...prev, employeeDetails: employees }));
    setTableHeaders(headerMkt);

    // Find employee by email first, then by name
    let employee = null;
    if (email) {
      employee = employees?.find((emp) => emp.email?.toLowerCase() === email.toLowerCase());
    }
    if (!employee && hoten) {
      employee = employees?.find((emp) => emp.name?.toLowerCase() === hoten.toLowerCase());
    }

    const employeeName = employee?.name || hoten || '';

    setTableRows([createRowData({ Tên: employeeName, Email: email }, employees)]);
    updateStatus('Ứng dụng đã sẵn sàng.');
  };

  const createRowData = (data = {}, employees = appData.employeeDetails) => {
    let employeeToUse = null;

    // Priority: 1) Find by name if provided, 2) Find by email if provided
    if (data['Tên']) {
      employeeToUse = employees?.find((emp) => emp.name?.toLowerCase() === data['Tên'].toLowerCase());
    }

    if (!employeeToUse && data['Email']) {
      employeeToUse = employees?.find((emp) => emp.email?.toLowerCase() === data['Email'].toLowerCase());
    }

    if (!employeeToUse && userEmail) {
      employeeToUse = employees?.find((emp) => emp.email?.toLowerCase() === userEmail.toLowerCase());
    }

    if (employeeToUse) {
      data['Tên'] = data['Tên'] || employeeToUse.name;
      data['Email'] = data['Email'] || employeeToUse.email;
      data['Team'] = data['Team'] || employeeToUse.team;
      data['id_NS'] = data['id_NS'] || employeeToUse.id_ns;
      data['Chi nhánh'] = data['Chi nhánh'] || employeeToUse.branch;
    } else {
      data['Email'] = data['Email'] || userEmail;
      if (employeeNameFromUrl) {
        data['Tên'] = data['Tên'] || employeeNameFromUrl;
      }
    }

    return {
      id: crypto.randomUUID(),
      data,
    };
  };

  const handleAddRow = (rowIndexToCopy = 0) => {
    const sourceRow = tableRows[rowIndexToCopy];
    const newRowData = {};

    // Fields to copy up to and including "Thị_trường"
    const fieldsToKeep = ['Tên', 'Email', 'ca', 'Sản_phẩm', 'Thị_trường'];

    fieldsToKeep.forEach((field) => {
      if (sourceRow?.data?.[field]) {
        newRowData[field] = sourceRow.data[field];
      }
    });

    setTableRows([...tableRows, createRowData(newRowData, appData.employeeDetails)]);
  };

  const handleRemoveRow = (index) => {
    if (tableRows.length <= 1) {
      alert('Bạn không thể xóa dòng cuối cùng.');
      return;
    }
    setTableRows(tableRows.filter((_, i) => i !== index));
  };

  const handleRowChange = (index, field, value) => {
    const newRows = [...tableRows];
    newRows[index].data[field] = value;

    if (field === 'Tên') {
      const employee = appData.employeeDetails?.find((emp) => emp.name === value);
      if (employee) {
        newRows[index].data['Email'] = employee.email || '';
        newRows[index].data['Team'] = employee.team || '';
        newRows[index].data['id_NS'] = employee.id_ns || '';
        newRows[index].data['Chi nhánh'] = employee.branch || '';
      }
    }

    if (field === 'Email') {
      const employee = appData.employeeDetails?.find((emp) => emp.email?.toLowerCase() === value.toLowerCase());
      if (employee) {
        newRows[index].data['Tên'] = employee.name || '';
        newRows[index].data['Team'] = employee.team || '';
        newRows[index].data['id_NS'] = employee.id_ns || '';
        newRows[index].data['Chi nhánh'] = employee.branch || '';
      }
    }

    setTableRows(newRows);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (tableRows.length === 0) {
      setResponseMsg({ text: 'Không có dữ liệu để gửi.', isSuccess: false, visible: true });
      return;
    }

    setLoading(true);
    updateStatus('Bắt đầu quá trình gửi dữ liệu...');

    const rowsData = tableRows.map((row) => {
      const rowObject = {};
      Object.keys(row.data).forEach((key) => {
        let value = row.data[key];
        const numberFields = ['Số Mess', 'Phản hồi', 'Đơn Mess', 'Doanh số Mess', 'CPQC', 'Số_Mess_Cmt', 'Số đơn', 'Doanh số'];
        if (numberFields.includes(key)) {
          value = String(value).replace(/[^0-9]/g, '');
        }
        rowObject[key] = value;
      });

      if (!rowObject['Email']) {
        rowObject['Email'] = userEmail;
      }
      return rowObject;
    });

    const payload = {
      sheetName: currentTableName,
      spreadsheetId: SPREADSHEET_ID,
      fields: headerMkt,
      rows: rowsData,
      settings: {
        checkDuplicates: true,
        validateData: true,
        returnDetails: true,
      },
    };

    try {
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || `Lỗi HTTP: ${response.status}`);
      }

      const summary = result.summary;
      setResponseMsg({
        text: `Thành công! Đã thêm ${summary.added} dòng. Trùng lặp: ${summary.duplicates}. Lỗi: ${summary.validationErrors}.`,
        isSuccess: true,
        visible: true,
      });
      updateStatus('Gửi báo cáo thành công.');

      setTableRows([createRowData({ Tên: employeeNameFromUrl, Email: userEmail }, appData.employeeDetails)]);
    } catch (error) {
      console.error('Lỗi khi gửi dữ liệu:', error);
      setResponseMsg({ text: 'Lỗi khi gửi dữ liệu: ' + error.message, isSuccess: false, visible: true });
      updateStatus('Gửi báo cáo thất bại: ' + error.message, true);
    } finally {
      setLoading(false);
    }
  };

  const numberFields = ['Số Mess', 'Phản hồi', 'Đơn Mess', 'Doanh số Mess', 'CPQC', 'Số_Mess_Cmt', 'Số đơn', 'Doanh số'];
  const hiddenFields = ['id', 'id phản hồi', 'id số mess', 'team', 'id_ns', 'trạng thái', 'chi nhánh', 'doanh số đi', 'số đơn hoàn huỷ', 'số đơn hoàn hủy', 'doanh số hoàn huỷ', 'số đơn thành công', 'doanh số thành công', 'khách mới', 'khách cũ', 'bán chéo', 'bán chéo team', 'ds chốt', 'ds sau hoàn hủy', 'số đơn sau hoàn hủy', 'doanh số sau ship', 'doanh số tc', 'kpis', 'cpqc theo tkqc', 'báo cáo theo page', 'cảnh báo'];

  return (
    <div className="min-h-screen bg-gray-100 p-3">
      <div className="bg-white rounded-lg shadow-lg p-4">
        {/* Header */}
        <div className="flex items-center mb-4 pb-3 border-b-2 border-blue-600">
          <h1 className="text-2xl font-bold text-blue-600">Báo Cáo MKT</h1>
        </div>

        {/* Status */}
        <div className="mb-3 p-2 rounded bg-gray-100 text-gray-700 text-sm">{status}</div>

        {/* Add Row Button */}
        <button
          type="button"
          onClick={() => handleAddRow(0)}
          className="mb-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-semibold transition"
        >
          ➕ Thêm dòng
        </button>

        {/* Table */}
        <form onSubmit={handleSubmit}>
          <div className="overflow-x-auto mb-4 border border-gray-300 rounded-lg">
            <table className="w-full border-collapse bg-white text-xs">
              <thead>
                <tr className="bg-blue-600 text-white sticky top-0">
                  <th className="border px-2 py-1 text-left font-semibold whitespace-nowrap">Hành động</th>
                  {headerMkt.map(
                    (header) =>
                      !hiddenFields.includes(header.toLowerCase()) && (
                        <th key={header} className="border px-2 py-1 text-left font-semibold whitespace-nowrap">
                          {header}
                        </th>
                      )
                  )}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rowIndex) => (
                  <tr key={row.id} className="hover:bg-gray-50 even:bg-gray-50">
                    <td className="border px-2 py-1 flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleAddRow(rowIndex)}
                        className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded transition text-xs font-semibold"
                        title="Copy dòng này"
                      >
                        ➕
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(rowIndex)}
                        className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded transition text-xs font-semibold"
                      >
                        ❌
                      </button>
                    </td>
                    {headerMkt.map(
                      (header) =>
                        !hiddenFields.includes(header.toLowerCase()) && (
                          <td key={`${row.id}-${header}`} className="border px-2 py-1">
                            {header === 'Ngày' ? (
                              <input
                                type="date"
                                value={row.data[header] || getToday()}
                                onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                              />
                            ) : header === 'ca' ? (
                              <select
                                value={row.data[header] || ''}
                                onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                              >
                                <option value="">--</option>
                                {appData.shiftList.map((shift) => (
                                  <option key={shift} value={shift}>
                                    {shift}
                                  </option>
                                ))}
                              </select>
                            ) : header === 'Sản_phẩm' ? (
                              <select
                                value={row.data[header] || ''}
                                onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                              >
                                <option value="">--</option>
                                {appData.productList.map((product) => (
                                  <option key={product} value={product}>
                                    {product}
                                  </option>
                                ))}
                              </select>
                            ) : header === 'Thị_trường' ? (
                              <select
                                value={row.data[header] || ''}
                                onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                              >
                                <option value="">--</option>
                                {appData.marketList.map((market) => (
                                  <option key={market} value={market}>
                                    {market}
                                  </option>
                                ))}
                              </select>
                            ) : header === 'Email' ? (
                              <input
                                type="email"
                                list="email-datalist"
                                placeholder="--"
                                value={row.data[header] || ''}
                                onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                className="w-32 px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                              />
                            ) : header === 'Tên' ? (
                              <input
                                type="text"
                                list="employee-datalist"
                                placeholder="--"
                                value={row.data[header] || ''}
                                onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                              />
                            ) : numberFields.includes(header) ? (
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="Số"
                                value={row.data[header] ? formatNumberInput(row.data[header]) : ''}
                                onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                className="w-12 px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                              />
                            ) : (
                              <input
                                type="text"
                                value={row.data[header] || ''}
                                onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                              />
                            )}
                          </td>
                        )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition"
          >
            {loading ? '⏳ Đang gửi...' : '🚀 Gửi báo cáo'}
          </button>
        </form>

        {/* Response Message */}
        {responseMsg.visible && (
          <div
            className={`mt-4 p-2 rounded text-sm text-center ${responseMsg.isSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}
          >
            {responseMsg.text}
          </div>
        )}

        {/* Employee Datalist */}
        <datalist id="employee-datalist" ref={employeeDatalistRef}>
          {appData.employeeDetails
            ?.sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }))
            .map((emp) => (
              <option key={emp.name} value={emp.name} />
            ))}
        </datalist>

        {/* Email Datalist */}
        <datalist id="email-datalist">
          {appData.employeeDetails
            ?.sort((a, b) => a.email.localeCompare(b.email))
            .map((emp) => (
              <option key={emp.email} value={emp.email} />
            ))}
        </datalist>
      </div>
    </div>
  );
}
