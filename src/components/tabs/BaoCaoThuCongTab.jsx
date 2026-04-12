import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';

const SCRIPT_URL = 'https://n-api-gamma.vercel.app/bulk-insert';
const SPREADSHEET_ID = '1ylYT0UAcahij5UtDikKyJFWT3gIyRZsuFsYQ5aUTi2Y';
const EMPLOYEE_API_URL = 'https://n-api-rouge.vercel.app/sheet/getSheets?rangeSheet=A:K&sheetName=Nh%C3%A2n%20s%E1%BB%B1&spreadsheetId=1Cl-56By1eYFB4G7ITuG0IQhH39ITwo0AkZPFvsLfo54';

const SHIFT_LIST = ['Giữa ca,Hết ca'];
const PRODUCT_LIST = ["Gel Dạ Dày", "Gel Trĩ", "ComboGold24k", "Fitgum CAFE 20X", "Bonavita Coffee", "Dragon Blood Cream", "Kem Body", "Bakuchiol Retinol", "Serum sâm", "DG", "Kẹo Táo", "Glutathione Collagen", "Glutathione Collagen NEW", "Gel trị ngứa", "Nám DR Hancy", "Gel Xương Khớp", "Gel XK Thái", "Gel XK Phi", "Dán Kinoki", "Sữa tắm CUISHIFAN"];
const MARKET_LIST = ["Nhật Bản", "Hàn Quốc", "Canada", "US", "Úc", "Anh", "CĐ Nhật Bản"];

const HEADER_MKT = ["id", "Tên", "Email", "Ngày", "ca", "Sản_phẩm", "Thị_trường", "TKQC", "CPQC", "Số_Mess_Cmt", "Số đơn", "Doanh số", "Team", "id_NS", "Doanh số đi", "Số đơn hoàn hủy", "DS chốt", "DS sau hoàn hủy", "Số đơn hoàn hủy", "Doanh số sau ship", "Doanh số TC", "KPIs", "CPQC theo TKQC", "Báo cáo theo Page", "Trạng thái", "Cảnh báo"];
const HEADER_SALE = ["id", "Email", "Tên", "Ngày", "Ca", "Sản phẩm", "Thị trường", "Số Mess", "Phản hồi", "Đơn Mess", "Doanh số Mess", "id số mess", "id phản hồi", "Team", "Trạng thái", "Chi nhánh", "id_NS", "Doanh số đi", "Số đơn Hoàn huỷ", "Doanh số hoàn huỷ", "Số đơn thành công", "Doanh số thành công", "Khách mới", "Khách cũ", "Bán chéo"];

const HIDDEN_COLS = ['id', 'id phản hồi', 'id số mess', 'team', 'id_ns', 'trạng thái', 'chi nhánh', 'doanh số đi', 'số đơn hoàn huỷ', 'doanh số hoàn huỷ', 'số đơn thành công', 'doanh số thành công', 'khách mới', 'khách cũ', 'bán chéo', 'bán chéo team', 'doanh số đi', 'số đơn hoàn hủy', 'ds chốt', 'ds sau hoàn hủy', 'số đơn sau hoàn hủy', 'doanh số sau ship', 'doanh số tc', 'kpis', 'cpqc theo tkqc', 'báo cáo theo page', 'cảnh báo'];

export function BaoCaoThuCongTab({ tableName = 'Báo cáo MKT' }) {
  const [employeeDetails, setEmployeeDetails] = useState([]);
  const [tableHeaders, setTableHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Đang khởi tạo ứng dụng...');
  const [responseMessage, setResponseMessage] = useState({ text: '', type: '' });

  const userEmail = localStorage.getItem('userEmail') || '';
  const userName = localStorage.getItem('username') || '';

  useEffect(() => {
    initializeApp();
  }, [tableName]);

  const createEmptyRowData = (headers, employees = employeeDetails) => {
    const row = {};
    const employee = employees.find(emp => emp.email.toLowerCase() === userEmail.toLowerCase()) || employees.find(emp => emp.name === userName);
    
    headers.forEach(header => {
      if (header === 'id') {
        row[header] = crypto.randomUUID();
      } else if (header === 'Ngày') {
        row[header] = new Date().toISOString().split('T')[0];
      } else if (header === 'Tên' && employee) {
        row[header] = employee.name;
      } else if (header === 'Email' && employee) {
        row[header] = employee.email;
      } else if (header === 'Team' && employee) {
        row[header] = employee.team;
      } else if (header === 'id_NS' && employee) {
        row[header] = employee.id_ns;
      } else if (header === 'Chi nhánh' && employee) {
        row[header] = employee.branch;
      } else {
        row[header] = '';
      }
    });
    
    return row;
  };

  const initializeApp = async () => {
    try {
      setStatus('Đang tải danh sách nhân viên...');
      const employees = await fetchEmployeeList();
      setEmployeeDetails(employees);
      
      setStatus('Đang chuẩn bị bảng...');
      const headers = tableName === 'Báo cáo MKT' ? HEADER_MKT : HEADER_SALE;
      setTableHeaders(headers);
      
      const newRow = createEmptyRowData(headers, employees);
      setRows([newRow]);
      setStatus('Ứng dụng đã sẵn sàng.');
    } catch (error) {
      setStatus(`Lỗi: ${error.message}`);
      toast.error(`Lỗi khởi tạo: ${error.message}`);
    }
  };

  const fetchEmployeeList = async () => {
    try {
      const response = await fetch(EMPLOYEE_API_URL);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();

      let headers, rowObjects;
      if (result.headers && result.rows) {
        headers = result.headers;
        rowObjects = result.rows;
      } else if (Array.isArray(result)) {
        rowObjects = result;
        headers = rowObjects.length > 0 ? Object.keys(rowObjects[0]) : [];
      } else {
        throw new Error("Cấu trúc dữ liệu API không được hỗ trợ");
      }

      const findHeader = (keywords) => headers.find(h => keywords.every(kw => h.toLowerCase().includes(kw))) || null;

      const nameCol = findHeader(['họ', 'tên']) || 'Họ và Tên';
      const deptCol = findHeader(['bộ', 'phận']) || 'Bộ phận';
      const emailCol = findHeader(['email']) || 'email';
      const teamCol = findHeader(['team']) || 'Team';
      const idCol = findHeader(['id']) || 'id';
      const branchCol = findHeader(['chi nhánh']) || 'chi nhánh';

      const targetDepts = tableName === 'Báo cáo MKT' ? ['MKT'] : ['Sale', 'CSKH'];

      const filteredEmployees = rowObjects
        .filter(row => {
          const dept = row[deptCol];
          const name = row[nameCol];
          const deptMatch = dept && targetDepts.some(target =>
            dept.toString().toUpperCase().includes(target.toUpperCase())
          );
          return deptMatch && name && name.toString().trim() !== '';
        })
        .map(row => ({
          name: row[nameCol]?.toString().trim(),
          email: row[emailCol]?.toString().trim() || '',
          team: row[teamCol]?.toString().trim() || '',
          id_ns: row[idCol]?.toString().trim() || '',
          branch: row[branchCol]?.toString().trim() || ''
        }))
        .filter((emp, idx, arr) => arr.findIndex(e => e.name === emp.name) === idx);

      return filteredEmployees;
    } catch (error) {
      console.error("Lỗi chi tiết:", error);
      toast.error(`Lỗi khi tải danh sách nhân viên: ${error.message}`);
      return [];
    }
  };


  const formatNumberInput = (value) => {
    const cleanValue = value.replace(/[^0-9]/g, '');
    return cleanValue ? new Intl.NumberFormat('de-DE').format(cleanValue) : '';
  };

  const cleanNumberValue = (value) => {
    return value.replace(/[^0-9]/g, '');
  };

  const handleCellChange = (rowIndex, header, value) => {
    const newRows = [...rows];
    const numberFields = ['Số Mess', 'Phản hồi', 'Đơn Mess', 'Doanh số Mess', 'CPQC', 'Số_Mess_Cmt', 'Số đơn', 'Doanh số'];
    
    if (numberFields.includes(header)) {
      newRows[rowIndex] = { ...newRows[rowIndex], [header]: formatNumberInput(value) };
    } else {
      newRows[rowIndex] = { ...newRows[rowIndex], [header]: value };
    }

    // Auto-fill employee info when name changes
    if (header === 'Tên') {
      const employee = employeeDetails.find(emp => emp.name === value);
      if (employee) {
        newRows[rowIndex]['Email'] = employee.email;
        newRows[rowIndex]['Team'] = employee.team;
        newRows[rowIndex]['id_NS'] = employee.id_ns;
        newRows[rowIndex]['Chi nhánh'] = employee.branch;
      }
    }

    setRows(newRows);
  };

  const addRow = () => {
    const lastRow = rows[rows.length - 1] || {};
    const newRow = createEmptyRowData(tableHeaders);
    
    // Copy non-number fields from last row
    tableHeaders.forEach(header => {
      const numberFields = ['Số Mess', 'Phản hồi', 'Đơn Mess', 'Doanh số Mess', 'CPQC', 'Số_Mess_Cmt', 'Số đơn', 'Doanh số', 'id'];
      if (!numberFields.includes(header) && lastRow[header]) {
        newRow[header] = lastRow[header];
      }
    });
    
    setRows([...rows, newRow]);
  };

  const addSimilarRow = (rowIndex) => {
    const currentRow = rows[rowIndex];
    const newRow = createEmptyRowData(tableHeaders);
    
    tableHeaders.forEach(header => {
      const numberFields = ['Số Mess', 'Phản hồi', 'Đơn Mess', 'Doanh số Mess', 'CPQC', 'Số_Mess_Cmt', 'Số đơn', 'Doanh số', 'id'];
      if (!numberFields.includes(header) && currentRow[header]) {
        newRow[header] = currentRow[header];
      }
    });
    
    const newRows = [...rows];
    newRows.splice(rowIndex + 1, 0, newRow);
    setRows(newRows);
  };

  const removeRow = (rowIndex) => {
    if (rows.length <= 1) {
      toast.warning('Bạn không thể xóa dòng cuối cùng.');
      return;
    }
    setRows(rows.filter((_, idx) => idx !== rowIndex));
  };

  const validateForm = () => {
    const requiredFields = tableName === 'Báo cáo MKT' 
      ? ['Tên', 'Ngày', 'ca', 'Sản_phẩm', 'Thị_trường', 'TKQC', 'CPQC', 'Số_Mess_Cmt', 'Số đơn', 'Doanh số']
      : ['Tên', 'Ngày', 'Ca', 'Sản phẩm', 'Thị trường', 'Số Mess', 'Phản hồi', 'Đơn Mess', 'Doanh số Mess'];

    for (const row of rows) {
      for (const field of requiredFields) {
        if (tableHeaders.includes(field) && !row[field]?.toString().trim()) {
          toast.error(`Vui lòng điền đầy đủ thông tin cho trường: ${field}`);
          return false;
        }
      }
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setStatus('Bắt đầu quá trình gửi dữ liệu...');

    try {
      const rowsData = rows.map(row => {
        const rowObj = {};
        tableHeaders.forEach(header => {
          let value = row[header] || '';
          const numberFields = ['Số Mess', 'Phản hồi', 'Đơn Mess', 'Doanh số Mess', 'CPQC', 'Số_Mess_Cmt', 'Số đơn', 'Doanh số'];
          if (numberFields.includes(header)) {
            value = cleanNumberValue(value);
          }
          rowObj[header] = value;
        });
        if (!rowObj['Email']) {
          rowObj['Email'] = userEmail;
        }
        return rowObj;
      });

      const payload = {
        sheetName: tableName,
        spreadsheetId: SPREADSHEET_ID,
        fields: tableHeaders,
        rows: rowsData,
        settings: {
          checkDuplicates: true,
          validateData: true,
          returnDetails: true
        }
      };

      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || `Lỗi HTTP: ${response.status}`);
      }

      const summary = result.summary;
      setResponseMessage({
        text: `Thành công! Đã thêm ${summary.added} dòng. Trùng lặp: ${summary.duplicates}. Lỗi: ${summary.validationErrors}.`,
        type: 'success'
      });
      setStatus('Gửi báo cáo thành công.');
      toast.success(`Đã thêm ${summary.added} dòng thành công!`);

      // Reset form
      const resetRow = createEmptyRowData(tableHeaders);
      setRows([resetRow]);
      setResponseMessage({ text: '', type: '' });

    } catch (error) {
      console.error('Lỗi khi gửi dữ liệu:', error);
      setResponseMessage({
        text: 'Lỗi khi gửi dữ liệu: ' + error.message,
        type: 'error'
      });
      setStatus('Gửi báo cáo thất bại: ' + error.message);
      toast.error('Lỗi khi gửi dữ liệu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderCell = (row, rowIndex, header) => {
    const value = row[header] || '';
    const isHidden = HIDDEN_COLS.includes(header.toLowerCase());

    if (isHidden) {
      return (
        <td key={header} className="hidden">
          <input
            type="text"
            value={value}
            onChange={(e) => handleCellChange(rowIndex, header, e.target.value)}
            className="w-full"
          />
        </td>
      );
    }

    switch (header) {
      case 'Ngày':
        return (
          <td key={header} className="px-3 py-2 border border-gray-200">
            <input
              type="date"
              value={value || new Date().toISOString().split('T')[0]}
              onChange={(e) => handleCellChange(rowIndex, header, e.target.value)}
              className="w-full px-2 py-1 border rounded"
            />
          </td>
        );
      case 'Ca': case 'ca':
        return (
          <td key={header} className="px-3 py-2 border border-gray-200">
            <select
              value={value}
              onChange={(e) => handleCellChange(rowIndex, header, e.target.value)}
              className="w-full px-2 py-1 border rounded"
            >
              <option value="">-- Chọn ca --</option>
              {SHIFT_LIST.map(shift => (
                <option key={shift} value={shift}>{shift}</option>
              ))}
            </select>
          </td>
        );
      case 'Sản phẩm': case 'Sản_phẩm':
        return (
          <td key={header} className="px-3 py-2 border border-gray-200">
            <select
              value={value}
              onChange={(e) => handleCellChange(rowIndex, header, e.target.value)}
              className="w-full px-2 py-1 border rounded"
            >
              <option value="">-- Chọn sản phẩm --</option>
              {PRODUCT_LIST.map(product => (
                <option key={product} value={product}>{product}</option>
              ))}
            </select>
          </td>
        );
      case 'Thị trường': case 'Thị_trường':
        return (
          <td key={header} className="px-3 py-2 border border-gray-200">
            <div className="flex gap-1">
              <select
                value={value}
                onChange={(e) => handleCellChange(rowIndex, header, e.target.value)}
                className="flex-1 px-2 py-1 border rounded"
              >
                <option value="">-- Chọn thị trường --</option>
                {MARKET_LIST.map(market => (
                  <option key={market} value={market}>{market}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => addSimilarRow(rowIndex)}
                className="px-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                title="Thêm dòng tương tự"
              >
                ➕
              </button>
            </div>
          </td>
        );
      case 'Số Mess': case 'Phản hồi': case 'Đơn Mess': case 'Doanh số Mess':
      case 'CPQC': case 'Số_Mess_Cmt': case 'Số đơn': case 'Doanh số':
        return (
          <td key={header} className="px-3 py-2 border border-gray-200">
            <input
              type="text"
              inputMode="numeric"
              value={value}
              onChange={(e) => handleCellChange(rowIndex, header, e.target.value)}
              placeholder="Chỉ nhập số"
              className="w-full px-2 py-1 border rounded"
            />
          </td>
        );
      case 'Tên':
        return (
          <td key={header} className="px-3 py-2 border border-gray-200">
            <input
              type="text"
              list={`employee-list-${rowIndex}`}
              value={value}
              onChange={(e) => handleCellChange(rowIndex, header, e.target.value)}
              placeholder="-- Chọn hoặc nhập tên --"
              className="w-full px-2 py-1 border rounded"
            />
            <datalist id={`employee-list-${rowIndex}`}>
              {employeeDetails.map(emp => (
                <option key={emp.name} value={emp.name} />
              ))}
            </datalist>
          </td>
        );
      default:
        return (
          <td key={header} className="px-3 py-2 border border-gray-200">
            <input
              type="text"
              value={value}
              onChange={(e) => handleCellChange(rowIndex, header, e.target.value)}
              className="w-full px-2 py-1 border rounded"
            />
          </td>
        );
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Báo Cáo Thực Công</h2>
        <p className="text-sm text-gray-500 mt-1">{tableName}</p>
      </div>

      <div className="mb-4 p-3 bg-gray-50 rounded text-sm text-gray-600">
        {status}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <button
            type="button"
            onClick={addRow}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            disabled={loading}
          >
            ➕ Thêm dòng trống
          </button>
        </div>

        <div className="overflow-x-auto border border-gray-300 rounded">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th className="px-3 py-2 border border-gray-300">Hành động</th>
                {tableHeaders.map(header => (
                  !HIDDEN_COLS.includes(header.toLowerCase()) && (
                    <th key={header} className="px-3 py-2 border border-gray-300 whitespace-nowrap">
                      {header}
                    </th>
                  )
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border border-gray-200">
                    <button
                      type="button"
                      onClick={() => removeRow(rowIndex)}
                      className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                    >
                      ❌
                    </button>
                  </td>
                  {tableHeaders.map(header => (
                    !HIDDEN_COLS.includes(header.toLowerCase()) && renderCell(row, rowIndex, header)
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-red-500 text-white rounded hover:bg-red-600 font-semibold disabled:opacity-50"
          >
            {loading ? 'Đang gửi...' : '🚀 Gửi báo cáo'}
          </button>
        </div>

        {responseMessage.text && (
          <div className={`mt-4 p-4 rounded ${
            responseMessage.type === 'success' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {responseMessage.text}
          </div>
        )}
      </form>
    </div>
  );
}

