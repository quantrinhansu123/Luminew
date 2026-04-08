import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { supabase } from '../services/supabaseClient';
import { recalcSaleOrderCountFromOrders } from '../services/saleRecalcOrderCountFromOrders';

/** Phòng ban Sale trên `users.department` (chuẩn hóa, có cả biến thể tiếng Việt). */
function isUserDepartmentSale(department) {
  const raw = String(department ?? '').trim().toLowerCase();
  if (!raw) return false;
  if (raw.includes('presale')) return false;
  if (raw === 'sale' || raw === 'sales') return true;
  if (/\bsale\b/.test(raw)) return true;
  const noTone = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(bo phan|phong) sale\b/.test(noTone)) return true;
  return false;
}

function ReportForm({
  reportTable = 'sales_reports',
  ordersTable = 'orders',
  pageTitle = 'Báo Cáo Sale',
}) {
  // Initial defaults for new rows
  const [defaultInfo, setDefaultInfo] = useState({
    name: '',
    email: '',
    date: new Date().toISOString().split('T')[0],
    shift: 'Hết ca', // Tự động điền "Hết ca"
    branch: ''
  });

  // State for reports, initialized empty until user info loads
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // State for dropdown options
  const [productOptions, setProductOptions] = useState([]);
  const [marketOptions, setMarketOptions] = useState([]);
  const [branchOptions, setBranchOptions] = useState([]);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  /** Nhân sự phòng Sale: { label, email, search } */
  const [salePersonnel, setSalePersonnel] = useState([]);
  const [openNameRowIdx, setOpenNameRowIdx] = useState(null);
  const [nameDdPos, setNameDdPos] = useState({ top: 0, left: 0, width: 240 });
  const nameInputRefs = useRef({});
  const nameDdPanelRef = useRef(null);

  // Danh sách NV Sale theo ô đang mở + chuỗi gõ
  const filteredSalePersonnel = useMemo(() => {
    if (openNameRowIdx === null) return [];
    const q = String(reports[openNameRowIdx]?.name ?? '')
      .trim()
      .toLowerCase();
    if (!q) return salePersonnel;
    return salePersonnel.filter((p) => p.search.includes(q));
  }, [openNameRowIdx, reports, salePersonnel]);

  const placeNameDropdown = (idx) => {
    const el = nameInputRefs.current[idx];
    if (!el) return;
    const r = el.getBoundingClientRect();
    setNameDdPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
  };

  useEffect(() => {
    if (openNameRowIdx === null) return;
    const place = () => placeNameDropdown(openNameRowIdx);
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [openNameRowIdx]);

  useEffect(() => {
    if (openNameRowIdx === null) return;
    const onDown = (e) => {
      const t = e.target;
      const inputEl = nameInputRefs.current[openNameRowIdx];
      if (inputEl?.contains(t) || nameDdPanelRef.current?.contains(t)) return;
      setOpenNameRowIdx(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openNameRowIdx]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('name, username, email, department')
          .not('email', 'is', null);
        if (error) throw error;
        const list = [];
        const seen = new Set();
        for (const u of data || []) {
          if (!isUserDepartmentSale(u.department)) continue;
          const email = String(u.email || '').trim();
          const key = email.toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          const label = String(u.name || u.username || '').trim() || email;
          list.push({
            label,
            email,
            search: `${label} ${email}`.toLowerCase(),
          });
        }
        list.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
        if (!cancelled) setSalePersonnel(list);
      } catch (e) {
        console.warn('[ReportForm] sale personnel:', e);
        if (!cancelled) setSalePersonnel([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickSaleStaff = (reportIndex, person) => {
    const newReports = [...reports];
    newReports[reportIndex] = {
      ...newReports[reportIndex],
      name: person.label,
      email: person.email,
    };
    setReports(newReports);
    setOpenNameRowIdx(null);
    const errorKey = `${reportIndex}-name`;
    const errorKeyE = `${reportIndex}-email`;
    setErrors((prev) => {
      const next = { ...prev };
      delete next[errorKey];
      delete next[errorKeyE];
      return next;
    });
  };

  // Fetch dropdown data
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        setDropdownLoading(true);

        let productsSet = new Set();
        let marketsSet = new Set();

        // Bước 1: Load sản phẩm từ bảng system_settings (type <> 'test')
        try {
          const { data: productsData, error: productsError } = await supabase
            .from('system_settings')
            .select('name')
            .neq('type', 'test')
            .order('name', { ascending: true });

          if (!productsError && productsData && productsData.length > 0) {
            productsData.forEach(item => {
              if (item.name?.trim()) productsSet.add(item.name.trim());
            });
            console.log(`✅ Loaded ${productsData.length} products from system_settings (excluding test)`);
          } else if (productsError) {
            console.log('⚠️ Could not fetch products from system_settings:', productsError);
          }
        } catch (supabaseError) {
          console.log('⚠️ Error fetching products from system_settings:', supabaseError);
        }

        // Bước 2: Load thị trường từ bảng báo cáo (DISTINCT market)
        try {
          let allMarkets = new Set();
          let page = 0;
          const pageSize = 1000;
          let hasMore = true;

          while (hasMore) {
            const { data, error } = await supabase
              .from(reportTable)
              .select('market')
              .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error || !data || data.length === 0) {
              hasMore = false;
            } else {
              data.forEach(item => {
                if (item.market?.trim()) allMarkets.add(item.market.trim());
              });
              if (data.length < pageSize) hasMore = false;
              page++;
            }
            if (page > 10) hasMore = false;
          }

          allMarkets.forEach(m => marketsSet.add(m));
          console.log(`✅ Loaded ${allMarkets.size} unique markets from ${reportTable}`);

        } catch (dbError) {
          console.error(`Error fetching markets from ${reportTable}:`, dbError);
        }

        // Bước 3: Fallback cuối cùng - giá trị mặc định
        if (productsSet.size === 0) {
          ['Lumi Eyes', 'Lumi Nano', 'Lumi Skin'].forEach(p => productsSet.add(p));
          console.log('⚠️ Using default products');
        }
        if (marketsSet.size === 0) {
          ['Việt Nam', 'Thái Lan', 'Philippines', 'Malaysia'].forEach(m => marketsSet.add(m));
        }

        // Bước 4: Load danh sách chi nhánh từ users
        try {
          const { data: branchData, error: branchError } = await supabase
            .from('users')
            .select('branch')
            .not('branch', 'is', null);

          if (!branchError && branchData) {
            const uniqueBranches = [...new Set(branchData.map(u => u.branch).filter(Boolean))].sort();
            setBranchOptions(uniqueBranches);
            console.log(`✅ Loaded ${uniqueBranches.length} branches:`, uniqueBranches);
          }
        } catch (branchDbError) {
          console.error('Error fetching branches from users:', branchDbError);
        }

        console.log(`📦 Loaded ${productsSet.size} products:`, Array.from(productsSet));
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

    // Listen for storage changes (when settings are updated in AdminTools)
    const handleStorageChange = () => {
      fetchDropdownData();
    };
    window.addEventListener('storage', handleStorageChange);

    // Also listen for custom event dispatched from AdminTools
    window.addEventListener('settingsUpdated', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('settingsUpdated', handleStorageChange);
    };
  }, [reportTable]);

  // Load current user info and branch
  useEffect(() => {
    const loadUserInfo = async () => {
      const name = localStorage.getItem('username') || '';
      const email = localStorage.getItem('userEmail') || '';
      const currentDate = new Date().toISOString().split('T')[0];
      let userBranch = '';

      // Tự động lấy chi nhánh từ bảng users theo email
      if (email) {
        try {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('branch')
            .eq('email', email)
            .single();

          if (!userError && userData?.branch) {
            userBranch = userData.branch.trim();
            console.log(`✅ Tự động lấy chi nhánh từ users: ${userBranch} (email: ${email})`);
          } else {
            console.log(`⚠️ Không tìm thấy chi nhánh cho email: ${email}`);
          }
        } catch (err) {
          console.error('❌ Lỗi khi lấy chi nhánh từ users:', err);
        }
      }

      setDefaultInfo(prev => ({
        ...prev,
        name,
        email,
        date: currentDate,
        shift: 'Hết ca', // Tự động điền "Hết ca"
        branch: userBranch
      }));

      // Initialize first row
      setReports([{
        name: name,
        email: email,
        date: currentDate,
        shift: 'Hết ca', // Tự động điền "Hết ca"
        product: '',
        market: '',
        branch: userBranch, // Tự động điền chi nhánh từ users
        mess_cmt: '',
        response: ''
      }]);
    };

    loadUserInfo();
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
    const numberFields = ['cpqc', 'mess_cmt', 'response', 'orders'];

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
    const normalizedShift = String(lastReport.shift || '').trim().toLowerCase();
    const isGiuaCa = normalizedShift.includes('giữa ca') || normalizedShift.includes('giua ca');

    // Sale only: không tự động thêm dòng khi dòng hiện tại là "Giữa ca"
    if (isGiuaCa) {
      toast.info('Dòng "Giữa ca" không tự động thêm. Chỉ thêm 1 lần "Hết ca".', {
        position: 'top-right',
        autoClose: 2500
      });
      return;
    }

    const newReport = {
      name: lastReport.name,
      email: lastReport.email,
      date: lastReport.date,
      shift: 'Hết ca',
      product: lastReport.product || '',
      market: lastReport.market || '',
      branch: lastReport.branch || defaultInfo.branch || '',
      mess_cmt: '',
      response: '',
      orders: ''
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
      // Fetch teams for all emails in the reports to ensure accuracy
      const emails = [...new Set(reports.map(r => r.email).filter(e => e && e.trim()))];
      let emailToTeamMap = {};

      if (emails.length > 0) {
        try {
          const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('email, team')
            .in('email', emails);

          if (!usersError && usersData) {
            usersData.forEach(u => {
              if (u.email && u.team) {
                emailToTeamMap[u.email.trim().toLowerCase()] = u.team;
              }
            });
            console.log('✅ Fetched teams for emails:', emailToTeamMap);
          }
        } catch (fetchTeamError) {
          console.error('⚠️ Error fetching teams from users table:', fetchTeamError);
        }
      }

      const payload = reports.map((report, index) => {
        const reportEmail = (report.email || '').trim().toLowerCase();
        // Priority: Team from Users Table > LocalStorage User Team
        const correctTeam = emailToTeamMap[reportEmail] || localStorage.getItem('userTeam') || '';

        return {
          name: report.name,
          email: report.email,
          date: report.date,
          shift: report.shift,
          product: report.product,
          market: report.market,
          mess_count: Number(cleanNumberInput(String(report.mess_cmt || ''))) || 0,
          response_count: Number(cleanNumberInput(String(report.response || ''))) || 0,
          order_count: 0, // Sẽ được tính tự động sau khi lưu
          team: correctTeam,
          branch: report.branch || defaultInfo.branch || '', // Chi nhánh từ form hoặc tự động điền
          created_at: new Date().toISOString(),
        };
      });

      // Remove _originalIndex before inserting
      const payloadToInsert = payload.map(({ _originalIndex, ...rest }) => rest);

      const { data: insertedData, error } = await supabase
        .from(reportTable)
        .insert(payloadToInsert)
        .select('id');

      if (error) throw error;

      toast.success(`Đã lưu thành công ${reports.length} báo cáo!`, { position: 'top-right', autoClose: 3000 });

      if (insertedData && insertedData.length > 0) {
        try {
          const normalizeDate = (dateStr) => {
            if (!dateStr) return '';
            const dt = new Date(dateStr);
            if (isNaN(dt.getTime())) return '';
            return dt.toISOString().split('T')[0];
          };
          const insertedDates = reports.map((r) => normalizeDate(r.date)).filter(Boolean);
          if (insertedDates.length > 0) {
            const startDate = insertedDates.reduce((a, b) => (a < b ? a : b));
            const endDate = insertedDates.reduce((a, b) => (a > b ? a : b));
            const result = await recalcSaleOrderCountFromOrders({
              startDate,
              endDate,
              createMissingForHetCa: true,
              reportsTable: reportTable,
              ordersTable,
            });
            console.log(`✅ Đã tự động cập nhật ${reportTable} (TT):`, result);
          }
        } catch (apiError) {
          console.error('❌ Error in calculation process:', apiError);
        }
      }

      // Reset but keep user info settings for next entry
      setReports([{
        name: defaultInfo.name,
        email: defaultInfo.email,
        date: new Date().toISOString().split('T')[0],
        shift: 'Hết ca', // Tự động điền "Hết ca"
        product: '',
        market: '',
        branch: defaultInfo.branch || '', // Giữ chi nhánh
        mess_cmt: '',
        response: ''
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
      <div className="w-full mx-auto px-4 py-4">
        {/* Header — một dòng */}
        <div className="bg-white rounded-xl shadow-lg px-4 py-3 mb-4 border border-gray-100">
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto">
            <img
              src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Ff930e667.%E1%BA%A2nh.025539.jpg"
              alt="Logo"
              className="h-10 w-10 rounded-full shadow shrink-0"
            />
            <h1 className="text-lg font-bold text-green-600 whitespace-nowrap shrink-0">
              {pageTitle}
            </h1>
            <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">LumiGlobal Report</span>
          </div>
        </div>

        {/* Main Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 overflow-hidden">
          <p className="mb-3 text-xs text-gray-500 leading-snug">
            * Mẹo: Dòng mới sao chép Tên, Email, Ngày, Chi nhánh từ dòng trên; Ca mặc định &quot;Hết ca&quot;. &quot;Giữa ca&quot; không tự thêm dòng.
          </p>

          <div className="space-y-2 pb-2">
            {reports.map((report, idx) => (
              <div
                key={idx}
                className="border border-gray-200 rounded-lg px-2 py-2 hover:bg-blue-50/40 transition-colors"
              >
                <div className="flex flex-nowrap items-end gap-2 overflow-x-auto pb-0.5">
                  <div className="flex shrink-0 items-center gap-1.5 self-end pb-1.5 border-r border-gray-100 pr-2 mr-0.5">
                    <span className="text-[11px] font-semibold text-gray-500 whitespace-nowrap w-8">#{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Bạn có chắc chắn muốn xóa dòng ${idx + 1}?`)) {
                          deleteReport(idx);
                        }
                      }}
                      className={`inline-flex items-center justify-center p-1.5 rounded-md transition-colors ${reports.length <= 1
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-red-50 text-red-600 hover:bg-red-100'
                        }`}
                      title="Xóa dòng"
                      disabled={reports.length <= 1}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex flex-col min-w-[7.5rem] shrink-0">
                    <label className="text-[10px] font-medium text-gray-500 mb-0.5 whitespace-nowrap">Tên NV</label>
                    <input
                      ref={(el) => {
                        nameInputRefs.current[idx] = el;
                      }}
                      type="text"
                      name="name"
                      value={report.name}
                      onChange={(e) => handleReportChange(e, idx)}
                      onFocus={() => {
                        setOpenNameRowIdx(idx);
                        requestAnimationFrame(() => placeNameDropdown(idx));
                      }}
                      autoComplete="off"
                      className={`w-full px-2 py-1.5 border rounded-md focus:ring-1 focus:ring-blue-500 text-xs ${errors[`${idx}-name`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                      placeholder={salePersonnel.length ? 'Gõ để tìm hoặc chọn…' : 'Tên'}
                      title="Danh sách NV phòng Sale — gõ để lọc"
                    />
                  </div>
                  <div className="flex flex-col min-w-[10rem] shrink-0">
                    <label className="text-[10px] font-medium text-gray-500 mb-0.5 whitespace-nowrap">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={report.email}
                      onChange={(e) => handleReportChange(e, idx)}
                      className={`w-full px-2 py-1.5 border rounded-md focus:ring-1 focus:ring-blue-500 text-xs ${errors[`${idx}-email`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                      placeholder="Email"
                    />
                  </div>
                  <div className="flex flex-col min-w-[8.5rem] shrink-0">
                    <label className="text-[10px] font-medium text-gray-500 mb-0.5 whitespace-nowrap">Ngày <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      name="date"
                      value={report.date}
                      onChange={(e) => handleReportChange(e, idx)}
                      className={`w-full px-1 py-1 border rounded-md focus:ring-1 focus:ring-blue-500 text-xs ${errors[`${idx}-date`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                    />
                  </div>
                  <div className="flex flex-col min-w-[5.5rem] shrink-0">
                    <label className="text-[10px] font-medium text-gray-500 mb-0.5 whitespace-nowrap">Ca <span className="text-red-500">*</span></label>
                    <select
                      name="shift"
                      value={report.shift}
                      onChange={(e) => handleReportChange(e, idx)}
                      className={`w-full px-1 py-1.5 border rounded-md focus:ring-1 focus:ring-blue-500 text-xs ${errors[`${idx}-shift`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                    >
                      <option value="">—</option>
                      <option value="Hết ca">Hết ca</option>
                      <option value="Giữa ca">Giữa ca</option>
                    </select>
                  </div>
                  <div className="flex flex-col min-w-[6.5rem] shrink-0">
                    <label className="text-[10px] font-medium text-gray-500 mb-0.5 whitespace-nowrap">Chi nhánh</label>
                    <select
                      name="branch"
                      value={report.branch || ''}
                      onChange={(e) => handleReportChange(e, idx)}
                      className="w-full px-1 py-1.5 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 text-xs"
                    >
                      <option value="">—</option>
                      {branchOptions.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col min-w-[7rem] shrink-0">
                    <label className="text-[10px] font-medium text-gray-500 mb-0.5 whitespace-nowrap" title="Sản phẩm">SP <span className="text-red-500">*</span></label>
                    <select
                      name="product"
                      value={report.product}
                      onChange={(e) => handleReportChange(e, idx)}
                      className={`w-full px-1 py-1.5 border rounded-md focus:ring-1 focus:ring-blue-500 text-xs ${errors[`${idx}-product`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                    >
                      <option value="">—</option>
                      {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col min-w-[7rem] shrink-0">
                    <label className="text-[10px] font-medium text-gray-500 mb-0.5 whitespace-nowrap" title="Thị trường">TT <span className="text-red-500">*</span></label>
                    <select
                      name="market"
                      value={report.market}
                      onChange={(e) => handleReportChange(e, idx)}
                      className={`w-full px-1 py-1.5 border rounded-md focus:ring-1 focus:ring-blue-500 text-xs ${errors[`${idx}-market`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                    >
                      <option value="">—</option>
                      {marketOptions.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col min-w-[4.5rem] shrink-0">
                    <label className="text-[10px] font-medium text-gray-500 mb-0.5 whitespace-nowrap">Mess <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      inputMode="numeric"
                      name="mess_cmt"
                      value={report.mess_cmt}
                      onChange={(e) => handleReportChange(e, idx)}
                      className={`w-full px-2 py-1.5 border rounded-md focus:ring-1 focus:ring-blue-500 text-xs ${errors[`${idx}-mess_cmt`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex flex-col min-w-[4.5rem] shrink-0">
                    <label className="text-[10px] font-medium text-gray-500 mb-0.5 whitespace-nowrap" title="Phản hồi">PH <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      inputMode="numeric"
                      name="response"
                      value={report.response}
                      onChange={(e) => handleReportChange(e, idx)}
                      className={`w-full px-2 py-1.5 border rounded-md focus:ring-1 focus:ring-blue-500 text-xs ${errors[`${idx}-response`] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto pb-1">
            <div className="flex flex-nowrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={addReport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Thêm dòng
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Bạn có chắc chắn muốn xóa tất cả các dòng báo cáo? Hành động này không thể hoàn tác.')) {
                    setReports([{
                      name: defaultInfo.name,
                      email: defaultInfo.email,
                      date: new Date().toISOString().split('T')[0],
                      shift: 'Hết ca', // Tự động điền "Hết ca"
                      product: '',
                      market: '',
                      branch: defaultInfo.branch || '',
                      mess_cmt: '',
                      response: '',
                      orders: ''
                    }]);
                    setErrors({});
                    toast.info('Đã xóa tất cả các dòng báo cáo', { position: 'top-right', autoClose: 2000 });
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50"
                disabled={reports.length <= 1}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Xóa tất cả
              </button>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className={`shrink-0 flex items-center gap-2 px-5 py-1.5 rounded-lg font-semibold text-sm text-white shadow-md transition-all ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {loading ? 'Đang gửi...' : `Gửi ${reports.length} báo cáo`}
            </button>
          </div>
        </div>
      </div>

      {openNameRowIdx !== null &&
        salePersonnel.length > 0 &&
        createPortal(
          <div
            ref={nameDdPanelRef}
            className="fixed z-[10050] max-h-52 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 text-xs shadow-lg"
            style={{ top: nameDdPos.top, left: nameDdPos.left, width: nameDdPos.width }}
            role="listbox"
            aria-label="Nhân sự phòng Sale"
          >
            {filteredSalePersonnel.length === 0 ? (
              <div className="px-3 py-2 text-gray-500">
                Không có NV Sale khớp «{String(reports[openNameRowIdx]?.name ?? '').trim() || '…'}»
              </div>
            ) : (
              filteredSalePersonnel.map((p) => (
                <button
                  key={p.email}
                  type="button"
                  role="option"
                  className="flex w-full flex-col items-stretch px-3 py-1.5 text-left hover:bg-blue-50"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickSaleStaff(openNameRowIdx, p);
                  }}
                >
                  <span className="font-medium text-gray-800">{p.label}</span>
                  <span className="text-[10px] text-gray-500">{p.email}</span>
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

export default ReportForm;
