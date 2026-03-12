import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../supabase/config';

export default function BaoCaoMarketing() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const teamFilter = searchParams.get('team'); // 'RD' or null

  // Permission Logic
  const { canView, role } = usePermissions();
  const permissionCode = teamFilter === 'RD' ? 'RND_INPUT' : 'MKT_INPUT';



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

  // Load products from system_settings (type <> 'test')
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('name')
          .neq('type', 'test')
          .order('name', { ascending: true });

        if (!error && data && data.length > 0) {
          const products = data.map(item => item.name).filter(Boolean);
          setAppData(prev => ({
            ...prev,
            productList: products.length > 0 ? products : prev.productList
          }));
          console.log(`✅ Loaded ${products.length} products from system_settings (excluding test)`);
        }
      } catch (err) {
        console.error('Error fetching products from system_settings:', err);
      }
    };

    fetchProducts();
  }, []);

  const [tableHeaders, setTableHeaders] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [userEmail, setUserEmail] = useState('');
  const [currentTableName, setCurrentTableName] = useState('Báo cáo MKT');
  const [employeeNameFromUrl, setEmployeeNameFromUrl] = useState('');
  const [status, setStatus] = useState('Đang khởi tạo ứng dụng...');
  const [responseMsg, setResponseMsg] = useState({ text: '', isSuccess: true, visible: false });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [realValuesMap, setRealValuesMap] = useState({}); // Map row ID to real values
  const [calculatingRealValues, setCalculatingRealValues] = useState({}); // Track which rows are calculating
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

  // Auto-calculate real values when rows change or when relevant fields are filled
  // Note: Real values calculation removed - Số đơn thực tế và Doanh số thực tế không còn được tính/hiển thị



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

  const parseVietnameseNumberInput = (value) => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    const str = String(value || '').trim();
    if (!str) return 0;

    // Keep digits (and optional leading minus), drop separators like . , spaces
    const negative = str.startsWith('-');
    const digitsOnly = str.replace(/[^0-9]/g, '');
    if (!digitsOnly) return 0;

    const parsed = Number((negative ? '-' : '') + digitsOnly);
    return Number.isFinite(parsed) ? parsed : 0;
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
      // data['Email'] = data['Email'] || userEmail; // REMOVED: Don't force userEmail if not found in list
      if (employeeNameFromUrl) {
        data['Tên'] = data['Tên'] || employeeNameFromUrl;
      }
    }

    // --- LOCK USER FIELDS FOR NON-ADMINS ---
    const userJson = localStorage.getItem("user");
    const user = userJson ? JSON.parse(userJson) : null;
    const userName = localStorage.getItem("username") || user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || user?.username || user?.name || "";
    const isManager = ['admin', 'director', 'manager', 'super_admin'].includes((role || '').toLowerCase());

    if (!isManager && userEmail) { // userEmail is set from localStorage/URL in useEffect
      // Check if userEmail matches logged in user.
      // Actually, relying on `userEmail` state which came from localStorage is fine.
      // Force them:
      data['Email'] = userEmail;
      data['Tên'] = userName || data['Tên']; // if userName found

      // Try to fill other fields if employeeToUse was null but now we forced email
      if (!employeeToUse) {
        const forcedEmp = employees?.find((emp) => emp.email?.toLowerCase() === userEmail.toLowerCase());
        if (forcedEmp) {
          data['Tên'] = forcedEmp.name;
          data['Team'] = forcedEmp.team;
          data['id_NS'] = forcedEmp.id_ns;
          data['Chi nhánh'] = forcedEmp.branch;
        }
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

  const handleAddNewRow = () => {
    setTableRows([...tableRows, createRowData({}, appData.employeeDetails)]);
  };

  const handleRemoveRow = (index) => {
    if (tableRows.length <= 1) {
      alert('Bạn không thể xóa dòng cuối cùng.');
      return;
    }

    // Confirm before deleting
    if (!window.confirm(`Bạn có chắc chắn muốn xóa dòng ${index + 1}?\n\nDữ liệu trong dòng này sẽ bị mất.`)) {
      return;
    }

    const rowId = tableRows[index]?.id;

    // Remove from table
    setTableRows(tableRows.filter((_, i) => i !== index));

    // Clean up real values map
    if (rowId) {
      setRealValuesMap(prev => {
        const newMap = { ...prev };
        delete newMap[rowId];
        return newMap;
      });
      setCalculatingRealValues(prev => {
        const newMap = { ...prev };
        delete newMap[rowId];
        return newMap;
      });
    }

    updateStatus(`Đã xóa dòng ${index + 1}.`);
  };

  // Calculate real values from orders table for a single report row
  const calculateRealValues = async (rowData, rowId) => {
    try {
      let reportDate = rowData['Ngày'];
      const reportName = rowData['Tên'];
      const reportCa = rowData['ca'];
      const reportProduct = rowData['Sản_phẩm'];
      const reportMarket = rowData['Thị_trường'];

      if (!reportName) {
        return {
          so_don_thuc_te: 0,
          doanh_so_thuc_te: 0
        };
      }

      // Nếu không có ngày, không tính toán
      if (!reportDate) {
        return {
          so_don_thuc_te: 0,
          doanh_so_thuc_te: 0
        };
      }

      // Normalize date format to YYYY-MM-DD for Supabase DATE comparison
      if (reportDate instanceof Date) {
        reportDate = reportDate.toISOString().split('T')[0];
      } else if (typeof reportDate === 'string') {
        // Handle different date formats
        // If format is DD/MM/YYYY, convert to YYYY-MM-DD
        if (reportDate.includes('/')) {
          const parts = reportDate.split('/');
          if (parts.length === 3) {
            // Assume DD/MM/YYYY
            reportDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
        // Remove time part if present (YYYY-MM-DDTHH:mm:ss)
        reportDate = reportDate.split('T')[0];
      }

      console.log('📅 Date normalization:', {
        original: rowData['Ngày'],
        normalized: reportDate,
        type: typeof reportDate
      });

      // Build query
      let query = supabase
        .from('orders')
        .select('*')
        .eq('order_date', reportDate);

      // Filter by marketing_staff (name) - use ilike for flexible matching
      if (reportName) {
        // Simple ilike matching - Supabase will handle partial matches
        query = query.ilike('marketing_staff', `%${reportName.trim()}%`);
      }

      // Filter by shift/ca
      const caValue = String(reportCa || '').trim();

      if (caValue === 'Hết ca' || caValue.toLowerCase() === 'hết ca') {
        // Hết ca: tính đơn có shift chứa "Hết ca"
        query = query.ilike('shift', '%Hết ca%');
      } else if (caValue === 'Giữa ca' || caValue.toLowerCase() === 'giữa ca') {
        // Giữa ca: tính đơn có shift chứa "Giữa ca" hoặc "giữa ca"
        query = query.or('shift.ilike.%Giữa ca%,shift.ilike.%giữa ca%');
      } else if (caValue) {
        // Other ca: partial match
        query = query.ilike('shift', `%${caValue}%`);
      }

      // Filter by product - use ilike for flexible matching
      if (reportProduct) {
        // Use ilike for partial matching (case-insensitive)
        query = query.ilike('product', `%${reportProduct.trim()}%`);
      }

      // Filter by market (country)
      if (reportMarket) {
        query = query.ilike('country', `%${reportMarket}%`);
      }

      console.log('🔍 Query parameters:', {
        reportDate,
        reportName,
        reportCa,
        reportProduct,
        reportMarket
      });

      // First, let's check if there are any orders on this date at all
      const { data: ordersByDate, error: dateError } = await supabase
        .from('orders')
        .select('id, order_date, marketing_staff, product, country, shift')
        .eq('order_date', reportDate)
        .limit(10);

      if (dateError) {
        console.error('❌ Error checking orders by date:', dateError);
      } else {
        console.log(`📅 Found ${ordersByDate?.length || 0} orders on date ${reportDate}:`, ordersByDate?.slice(0, 3).map(o => ({
          marketing_staff: o.marketing_staff,
          product: o.product,
          country: o.country,
          shift: o.shift
        })));
      }

      const { data: orders, error } = await query;

      if (error) {
        console.error('❌ Error calculating real values:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        return {
          so_don_thuc_te: 0,
          doanh_thu_chot_thuc_te: 0,
          doanh_so_hoan_huy_thuc_te: 0,
          so_don_hoan_huy_thuc_te: 0,
          doanh_so_sau_hoan_huy_thuc_te: 0,
          doanh_so_di_thuc_te: 0
        };
      }

      console.log(`📊 Found ${orders?.length || 0} orders matching all criteria:`, {
        reportDate,
        reportName,
        reportCa,
        reportProduct,
        reportMarket
      });

      if (orders && orders.length > 0) {
        console.log('📋 Sample order:', {
          order_date: orders[0].order_date,
          marketing_staff: orders[0].marketing_staff,
          product: orders[0].product,
          country: orders[0].country,
          shift: orders[0].shift,
          total_amount_vnd: orders[0].total_amount_vnd,
          total_vnd: orders[0].total_vnd,
          check_result: orders[0].check_result,
          delivery_status: orders[0].delivery_status
        });
      } else {
        // Debug: Try to find orders step by step
        console.log('🔍 Debugging: Checking each filter step by step...');

        // Check orders by date only
        const { data: ordersDateOnly } = await supabase
          .from('orders')
          .select('id, marketing_staff, product, country, shift')
          .eq('order_date', reportDate)
          .limit(5);
        console.log(`  📅 Orders on date ${reportDate}: ${ordersDateOnly?.length || 0}`, ordersDateOnly);

        // Check orders by date + name
        if (reportName) {
          const { data: ordersDateName } = await supabase
            .from('orders')
            .select('id, marketing_staff, product, country, shift')
            .eq('order_date', reportDate)
            .ilike('marketing_staff', `%${reportName.trim()}%`)
            .limit(5);
          console.log(`  👤 Orders with name "${reportName}": ${ordersDateName?.length || 0}`, ordersDateName);
        }

        // Check orders by date + name + product
        if (reportName && reportProduct) {
          const { data: ordersDateNameProduct } = await supabase
            .from('orders')
            .select('id, marketing_staff, product, country, shift')
            .eq('order_date', reportDate)
            .ilike('marketing_staff', `%${reportName.trim()}%`)
            .eq('product', reportProduct)
            .limit(5);
          console.log(`  📦 Orders with name + product "${reportProduct}": ${ordersDateNameProduct?.length || 0}`, ordersDateNameProduct);
        }
      }

      if (!orders || orders.length === 0) {
        console.log('⚠️ No orders found matching all criteria');
        return {
          so_don_thuc_te: 0,
          doanh_thu_chot_thuc_te: 0,
          doanh_so_hoan_huy_thuc_te: 0,
          so_don_hoan_huy_thuc_te: 0,
          doanh_so_sau_hoan_huy_thuc_te: 0,
          doanh_so_di_thuc_te: 0
        };
      }

      // Calculate values
      const totalOrders = orders.length;

      // Doanh số thực tế: tổng total_amount_vnd của tất cả đơn khớp điều kiện
      const doanhSoThucTe = orders.reduce((sum, o) => {
        const amount = o.total_amount_vnd || o.total_vnd || 0;
        return sum + (Number(amount) || 0);
      }, 0);

      return {
        so_don_thuc_te: totalOrders,
        doanh_so_thuc_te: doanhSoThucTe
      };
    } catch (error) {
      console.error('Error calculating real values:', error);
      return {
        so_don_thuc_te: 0,
        doanh_so_thuc_te: 0
      };
    }
  };

  // Calculate real values when relevant fields change
  const calculateRealValuesForRow = async (rowIndex, rowData) => {
    const rowId = tableRows[rowIndex]?.id;
    if (!rowId) return;

    console.log('🔄 Calculating real values for row:', {
      rowId,
      rowData: {
        Ngày: rowData['Ngày'],
        Tên: rowData['Tên'],
        ca: rowData['ca'],
        Sản_phẩm: rowData['Sản_phẩm'],
        Thị_trường: rowData['Thị_trường']
      }
    });

    setCalculatingRealValues(prev => ({ ...prev, [rowId]: true }));

    try {
      const realValues = await calculateRealValues(rowData, rowId);
      console.log('✅ Calculated real values:', realValues);
      setRealValuesMap(prev => ({ ...prev, [rowId]: realValues }));
    } catch (error) {
      console.error('❌ Error calculating real values for row:', error);
    } finally {
      setCalculatingRealValues(prev => {
        const newState = { ...prev };
        delete newState[rowId];
        return newState;
      });
    }
  };

  const handleRowChange = async (index, field, value) => {
    // Prevent editing Email/Name if restricted
    const isManager = ['admin', 'director', 'manager', 'super_admin'].includes((role || '').toLowerCase());
    if (!isManager && (field === 'Email' || field === 'Tên')) {
      return;
    }

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

    // Calculate real values if relevant fields changed
    const fieldsToTriggerCalculation = ['Ngày', 'Tên', 'ca', 'Sản_phẩm', 'Thị_trường'];
    if (fieldsToTriggerCalculation.includes(field)) {
      // Debounce calculation
      setTimeout(() => {
        calculateRealValuesForRow(index, newRows[index].data);
      }, 500);
    }
  };

  // Delete all data from detail_reports
  const handleDeleteAll = async () => {
    const confirm1 = window.confirm(
      "⚠️ CẢNH BÁO NGHIÊM TRỌNG!\n\n" +
      "Bạn có chắc chắn muốn XÓA TOÀN BỘ dữ liệu trong bảng detail_reports?\n\n" +
      "Hành động này KHÔNG THỂ HOÀN TÁC!\n\n" +
      "Nhấn OK để tiếp tục, hoặc Cancel để hủy."
    );

    if (!confirm1) return;

    const confirm2 = window.confirm(
      "⚠️ XÁC NHẬN LẦN CUỐI!\n\n" +
      "Bạn có THỰC SỰ muốn xóa TOÀN BỘ dữ liệu?\n\n" +
      "Tất cả báo cáo MKT sẽ bị mất vĩnh viễn!\n\n" +
      "Nhập 'XÓA' vào ô bên dưới để xác nhận."
    );

    if (!confirm2) return;

    const userInput = window.prompt(
      "Nhập 'XÓA' (chữ hoa) để xác nhận xóa toàn bộ dữ liệu:"
    );

    if (userInput !== 'XÓA') {
      alert("Xác nhận không đúng. Hủy bỏ thao tác xóa.");
      return;
    }

    try {
      setDeleting(true);
      updateStatus('Đang xóa dữ liệu...');

      // Delete all records from detail_reports
      const { error } = await supabase
        .from('detail_reports')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (hack for delete all)

      if (error) {
        // If the above doesn't work, try deleting by selecting all IDs first
        const { data: allRecords, error: fetchError } = await supabase
          .from('detail_reports')
          .select('id')
          .limit(10000);

        if (fetchError) throw fetchError;

        if (allRecords && allRecords.length > 0) {
          const ids = allRecords.map(r => r.id);
          // Delete in batches
          const batchSize = 1000;
          for (let i = 0; i < ids.length; i += batchSize) {
            const batch = ids.slice(i, i + batchSize);
            const { error: batchError } = await supabase
              .from('detail_reports')
              .delete()
              .in('id', batch);

            if (batchError) {
              console.error(`Batch ${i / batchSize + 1} error:`, batchError);
              throw batchError;
            }
          }
        }
      }

      alert("✅ Đã xóa toàn bộ dữ liệu thành công!");
      updateStatus('Đã xóa toàn bộ dữ liệu thành công.');
      setResponseMsg({
        text: '✅ Đã xóa toàn bộ dữ liệu thành công!',
        isSuccess: true,
        visible: true,
      });

    } catch (error) {
      console.error("Delete error:", error);
      const errorMsg = error.message || String(error);
      alert("Lỗi khi xóa dữ liệu: " + errorMsg);
      updateStatus('Lỗi khi xóa dữ liệu: ' + errorMsg, true);
      setResponseMsg({
        text: `Lỗi khi xóa dữ liệu: ${errorMsg}`,
        isSuccess: false,
        visible: true,
      });
    } finally {
      setDeleting(false);
    }
  };

  // Sync data from Firebase Báo cáo MKT via backend API (bypasses RLS)
  const handleSyncMKT = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn đồng bộ dữ liệu từ Firebase Báo cáo MKT về Supabase?\n\nLưu ý: Chỉ thêm dữ liệu MỚI (chưa có), KHÔNG ghi đè dữ liệu đã tồn tại.")) return;

    try {
      setSyncing(true);
      updateStatus('Đang đồng bộ dữ liệu từ Firebase...');

      // Call backend API which uses service role key to bypass RLS
      const response = await fetch('/api/sync-mkt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Lỗi không xác định');
      }

      const message = `Đồng bộ hoàn tất!\nThành công: ${result.successCount} bản ghi\nLỗi: ${result.errorCount} bản ghi`;
      if (result.errorCount > 0 && result.error) {
        alert(message + `\n\nLỗi: ${result.error}`);
        updateStatus(`Đồng bộ hoàn tất: ${result.successCount} thành công, ${result.errorCount} lỗi.`, true);
      } else {
        alert(message);
        updateStatus(`Đồng bộ hoàn tất: ${result.successCount} thành công.`);
      }

      setResponseMsg({
        text: `Đồng bộ hoàn tất: ${result.successCount} thành công, ${result.errorCount} lỗi.`,
        isSuccess: result.errorCount === 0,
        visible: true,
      });

    } catch (error) {
      console.error("Sync error:", error);
      const errorMsg = error.message || String(error);
      updateStatus('Lỗi đồng bộ: ' + errorMsg, true);
      alert("Lỗi khi đồng bộ: " + errorMsg);
      setResponseMsg({
        text: `Lỗi khi đồng bộ: ${errorMsg}`,
        isSuccess: false,
        visible: true,
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (tableRows.length === 0) {
      setResponseMsg({ text: 'Không có dữ liệu để gửi.', isSuccess: false, visible: true });
      return;
    }

    setLoading(true);
    updateStatus('Bắt đầu gửi dữ liệu lên Supabase...');

    try {
      const rowsData = tableRows.map((row) => {
        const rowObject = {
          id: row.id // Include the ID generated at the row level
        };

        // Map fields
        // Must match Supabase detail_reports columns exactly
        // List of columns that DO NOT exist in detail_reports and should be excluded
        const excludedColumns = ['Chi nhánh', 'chi nhánh', 'Chi_nhánh', 'chi_nhánh', 'branch'];

        Object.keys(row.data).forEach((key) => {
          // Skip excluded columns that don't exist in detail_reports schema
          if (excludedColumns.includes(key)) {
            return;
          }

          let value = row.data[key];

          // Process numeric fields
          const numberFields = ['Số Mess', 'Phản hồi', 'Đơn Mess', 'Doanh số Mess', 'CPQC', 'Số_Mess_Cmt', 'Số đơn', 'Doanh số', 'Doanh số đi', 'Số đơn hoàn hủy', 'DS chốt', 'DS sau hoàn hủy', 'Doanh số sau ship', 'Doanh số TC', 'KPIs'];
          if (numberFields.includes(key)) {
            value = parseVietnameseNumberInput(value);
          }
          rowObject[key] = value;
        });

        // Ensure critical fields
        if (!rowObject['Email']) rowObject['Email'] = userEmail;
        if (!rowObject['Tên']) rowObject['Tên'] = employeeNameFromUrl || userEmail;

        // Ensure Team - CRITICAL for 400 error fix
        // If not in row data, try to get from appData or fallback to 'MKT'
        if (!rowObject['Team']) {
          const emp = appData.employeeDetails?.find(e => e.email?.toLowerCase() === rowObject['Email']?.toLowerCase() || e.name === rowObject['Tên']);
          rowObject['Team'] = emp?.team || localStorage.getItem('userTeam') || 'MKT';
        }

        // Ensure id_NS
        if (!rowObject['id_NS']) {
          const emp = appData.employeeDetails?.find(e => e.email?.toLowerCase() === rowObject['Email']?.toLowerCase() || e.name === rowObject['Tên']);
          rowObject['id_NS'] = emp?.id_ns || '';
        }

        // Auto-fields if missing
        if (!rowObject['Ngày']) rowObject['Ngày'] = getToday();

        // Note: Số đơn thực tế và Doanh số thực tế được tính tự động từ orders table sau khi insert
        // Không truyền vào payload khi submit

        return rowObject;
      });

      // --- TESTING MODE CHECK ---
      try {
        const settings = localStorage.getItem('system_settings');
        if (settings) {
          const parsed = JSON.parse(settings);
          if (parsed.dataSource === 'test') {
            console.log("🔶 [TEST MODE] Simulating Submit for MKT Report");

            // Simulate delay
            await new Promise(resolve => setTimeout(resolve, 1000));

            setResponseMsg({
              text: `✅ [TEST MODE] Giả lập gửi thành công ${rowsData.length} dòng! Dữ liệu KHÔNG lưu vào DB.`,
              isSuccess: true,
              visible: true,
            });
            updateStatus('Gửi báo cáo thành công (Giả lập).');
            setTableRows([createRowData({ Tên: employeeNameFromUrl, Email: userEmail }, appData.employeeDetails)]);
            setLoading(false);
            return; // EXIT EARLY
          }
        }
      } catch (e) {
        console.warn("Error checking test mode:", e);
      }
      // --------------------------

      // Insert into Supabase
      const { data, error } = await supabase
        .from('detail_reports')
        .insert(rowsData)
        .select();

      if (error) throw error;

      setResponseMsg({
        text: `Thành công! Đã thêm ${data.length} dòng vào hệ thống.`,
        isSuccess: true,
        visible: true,
      });
      updateStatus('Gửi báo cáo thành công.');

      // Reset form
      setTableRows([createRowData({ Tên: employeeNameFromUrl, Email: userEmail }, appData.employeeDetails)]);

    } catch (error) {
      console.error('Lỗi khi gửi dữ liệu:', error);
      const errorMsg = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      const errorDetail = error.details || '';
      const errorHint = error.hint || '';

      setResponseMsg({
        text: `Lỗi khi gửi dữ liệu: ${errorMsg} ${errorDetail ? `(${errorDetail})` : ''} ${errorHint ? `- Gợi ý: ${errorHint}` : ''}`,
        isSuccess: false,
        visible: true
      });
      updateStatus('Gửi báo cáo thất bại: ' + errorMsg, true);
    } finally {
      setLoading(false);
    }
  };

  const numberFields = ['Số Mess', 'Phản hồi', 'Đơn Mess', 'Doanh số Mess', 'CPQC', 'Số_Mess_Cmt', 'Số đơn', 'Doanh số'];
  const hiddenFields = ['id', 'id phản hồi', 'id số mess', 'team', 'id_ns', 'trạng thái', 'chi nhánh', 'doanh số đi', 'số đơn hoàn huỷ', 'số đơn hoàn hủy', 'doanh số hoàn huỷ', 'số đơn thành công', 'doanh số thành công', 'khách mới', 'khách cũ', 'bán chéo', 'bán chéo team', 'ds chốt', 'ds sau hoàn hủy', 'số đơn sau hoàn hủy', 'doanh số sau ship', 'doanh số tc', 'kpis', 'cpqc theo tkqc', 'báo cáo theo page', 'cảnh báo', 'số đơn thực tế', 'doanh số thực tế'];

  if (!canView(permissionCode)) {
    return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-3">
      <div className="bg-white rounded-lg shadow-lg p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-blue-600">
          <h1 className="text-2xl font-bold text-blue-600">Báo Cáo MKT</h1>
        </div>

        {/* Status */}
        <div className="mb-3 p-2 rounded bg-gray-100 text-gray-700 text-sm">{status}</div>

        {/* Add Row Button */}
        <button
          type="button"
          onClick={handleAddNewRow}
          className="mb-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-semibold transition"
        >
          ➕ Thêm dòng
        </button>

        {/* Table */}
        <form onSubmit={handleSubmit}>
          <div className="overflow-x-auto mb-4 border border-gray-300 rounded-lg" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="w-full align-middle">
              <table className="w-full border-collapse bg-white text-xs table-fixed">
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
                            <td key={`${row.id}-${header}`} className="border px-2 py-2">
                              {header === 'Ngày' ? (
                                <input
                                  type="date"
                                  value={row.data[header] || ''}
                                  onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                                />
                              ) : header === 'ca' ? (
                                <input
                                  type="text"
                                  list={`ca-datalist-${row.id}`}
                                  placeholder="--"
                                  value={row.data[header] || ''}
                                  onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                                />
                              ) : header === 'Sản_phẩm' ? (
                                <input
                                  type="text"
                                  list={`product-datalist-${row.id}`}
                                  placeholder="--"
                                  value={row.data[header] || ''}
                                  onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                                />
                              ) : header === 'Thị_trường' ? (
                                <input
                                  type="text"
                                  list={`market-datalist-${row.id}`}
                                  placeholder="--"
                                  value={row.data[header] || ''}
                                  onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                                />
                              ) : header === 'Email' ? (
                                <input
                                  type="email"
                                  list="email-datalist"
                                  placeholder="--"
                                  value={row.data[header] || ''}
                                  onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                  className="w-48 px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                                />
                              ) : header === 'Tên' ? (
                                <input
                                  type="text"
                                  list="employee-datalist"
                                  placeholder="--"
                                  value={row.data[header] || ''}
                                  onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                                />
                              ) : numberFields.includes(header) ? (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="Số"
                                  value={row.data[header] ? formatNumberInput(row.data[header]) : ''}
                                  onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                  className="w-28 px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={row.data[header] || ''}
                                  onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-600"
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

        {/* Ca Datalist - Dynamic for each row */}
        {tableRows.map((row) => (
          <datalist key={`ca-${row.id}`} id={`ca-datalist-${row.id}`}>
            {appData.shiftList?.map((shift) => (
              <option key={shift} value={shift} />
            ))}
          </datalist>
        ))}

        {/* Product Datalist - Dynamic for each row */}
        {tableRows.map((row) => (
          <datalist key={`product-${row.id}`} id={`product-datalist-${row.id}`}>
            {appData.productList?.map((product) => (
              <option key={product} value={product} />
            ))}
          </datalist>
        ))}

        {/* Market Datalist - Dynamic for each row */}
        {tableRows.map((row) => (
          <datalist key={`market-${row.id}`} id={`market-datalist-${row.id}`}>
            {appData.marketList?.map((market) => (
              <option key={market} value={market} />
            ))}
          </datalist>
        ))}
      </div>
    </div>
  );
}
