import { Settings } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import ColumnSettingsModal from '../components/ColumnSettingsModal';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../supabase/config';
import { parseSmartDate } from '../utils/dateParsing';
import './XemBaoCaoMKT.css';

const MARKET_GROUPS = {
  'Ngoài Châu Á': ['US', 'Canada', 'Úc', 'Anh', 'Khác'],
  'Châu Á': ['Nhật Bản', 'Hàn Quốc', 'Đài Loan', 'Malaysia', 'Singapore']
};

export default function XemBaoCaoMKT() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const teamFilter = searchParams.get('team'); // 'RD' or null

  // Permission Logic
  const { canView, role, team: userTeam } = usePermissions();
  const permissionCode = teamFilter === 'RD' ? 'RND_VIEW' : 'MKT_VIEW';

  // Kiểm tra Admin
  const roleFromHook = (role || '').toUpperCase();
  const roleFromStorage = (localStorage.getItem('userRole') || '').toLowerCase();
  const userJson = localStorage.getItem("user");
  const userObj = userJson ? JSON.parse(userJson) : null;
  const roleFromUserObj = (userObj?.role || '').toLowerCase();

  const roleFromHookLower = (roleFromHook || '').toLowerCase();
  const isAdmin = roleFromHookLower === 'admin' ||
    roleFromHookLower === 'super_admin' ||
    roleFromHookLower === 'finance' ||
    roleFromStorage === 'admin' ||
    roleFromStorage === 'super_admin' ||
    roleFromStorage === 'finance' ||
    roleFromUserObj === 'admin' ||
    roleFromUserObj === 'super_admin' ||
    roleFromUserObj === 'finance';

  // Get user email and name for filtering
  const userEmail = localStorage.getItem('userEmail') || '';
  const userName = localStorage.getItem('username') || '';



  const [activeTab, setActiveTab] = useState('DetailedReport');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Helper function để format date theo LOCAL time (tránh lỗi timezone trên Vercel)
  const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Last 30 Days default
    return formatLocalDate(d);
  });
  const [endDate, setEndDate] = useState(() => {
    return formatLocalDate(new Date());
  });
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [teams, setTeams] = useState([]);

  // Column Settings Modal State
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  // Column Visibility State
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('mktReport_visibleColumns');
    const defaultColumns = {
      stt: true, team: true, marketing: true, mess: true, cpqc: true, orders: true,
      soDonTT: true, dsChot: true, dsChotTT: true, tiLeChot: true, tiLeChotTT: true,
      giaMess: true, cps: true, cp_ds: true, giaTBDon: true,
      soDonHuy: false, dsHuy: false // Ẩn các cột không có trong hình
    };

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Đảm bảo soDonTT luôn là true
        parsed.soDonTT = true;
        console.log('📋 Loaded visibleColumns from localStorage:', parsed);
        return parsed;
      } catch (e) {
        console.warn('⚠️ Error parsing visibleColumns from localStorage, using defaults');
        return defaultColumns;
      }
    }
    console.log('📋 Using default visibleColumns:', defaultColumns);
    return defaultColumns;
  });

  useEffect(() => {
    localStorage.setItem('mktReport_visibleColumns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // Filters for Market Tab
  const [selectedProduct, setSelectedProduct] = useState('ALL');
  const [products, setProducts] = useState([]);
  const [selectedMarket, setSelectedMarket] = useState('ALL');
  const [markets, setMarkets] = useState([]);

  // Filters for Detailed Report Tab
  const [quickSelect, setQuickSelect] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]); // Array for multiple selection
  const [selectedShifts, setSelectedShifts] = useState([]); // Array for Ca filter
  const [selectedMarkets, setSelectedMarkets] = useState([]); // Array for Thị trường filter
  const [shifts, setShifts] = useState([]); // Unique shifts from data

  useEffect(() => {
    if (activeTab === 'DetailedReport' || activeTab === 'KpiReport' || activeTab === 'MarketReport') {
      fetchData();
    }
  }, [startDate, endDate, activeTab]);

  // Auto-select "Tất cả" when data is loaded and filters are empty
  useEffect(() => {
    if (activeTab === 'DetailedReport' && products.length > 0 && selectedProducts.length === 0) {
      setSelectedProducts([...products]);
    }
    if (activeTab === 'DetailedReport' && shifts.length > 0 && selectedShifts.length === 0) {
      setSelectedShifts([...shifts]);
    }
    if (activeTab === 'DetailedReport' && markets.length > 0 && selectedMarkets.length === 0) {
      setSelectedMarkets([...markets]);
    }
  }, [products, shifts, markets, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Detail Reports

      // --- TESTING MODE CHECK ---
      try {
        const settings = localStorage.getItem('system_settings');
        if (settings) {
          const parsed = JSON.parse(settings);
          if (parsed.dataSource === 'test') {
            console.log("🔶 [TEST MODE] Loading Mock Data for MKT Detailed Report");
            const mockReports = [
              {
                'Ngày': new Date().toISOString(),
                'Team': 'Team Test',
                'Tên': 'MKT Test User 1',
                'Sản_phẩm': 'Sản phẩm A',
                'Thị_trường': 'Hà Nội',
                'CPQC': 1000000,
                'Số_Mess_Cmt': 50,
                'Số đơn': 10,
                'Doanh số': 3000000,
                'Số đơn thực tế': 8,
                'Doanh thu chốt thực tế': 2400000,
                'Số đơn hoàn hủy': 2,
                'Số đơn hoàn hủy thực tế': 1,
                'Doanh số hoàn hủy thực tế': 300000,
                'DS sau hoàn hủy': 2400000,
                'Doanh số sau hoàn hủy thực tế': 2100000,
                'Doanh số sau ship': 2000000,
                'Doanh số TC': 2000000,
                'KPIs': 10000000
              },
              {
                'Ngày': new Date().toISOString(),
                'Team': 'Team Test',
                'Tên': 'MKT Test User 2',
                'Sản_phẩm': 'Sản phẩm B',
                'Thị_trường': 'Hồ Chí Minh',
                'CPQC': 800000,
                'Số_Mess_Cmt': 40,
                'Số đơn': 8,
                'Doanh số': 2400000,
                'Số đơn thực tế': 8,
                'Doanh thu chốt thực tế': 2400000,
                'Số đơn hoàn hủy': 0,
                'Số đơn hoàn hủy thực tế': 0,
                'Doanh số hoàn hủy thực tế': 0,
                'DS sau hoàn hủy': 2400000,
                'Doanh số sau hoàn hủy thực tế': 2400000,
                'Doanh số sau ship': 2300000,
                'Doanh số TC': 2300000,
                'KPIs': 8000000
              }
            ];

            setData(mockReports);
            setTeams(['Team Test']);
            setProducts(['Sản phẩm A', 'Sản phẩm B']);
            setMarkets(['Hà Nội', 'Hồ Chí Minh']);
            setLoading(false);
            return; // EXIT EARLY
          }
        }
      } catch (e) {
        console.warn("Error checking test mode:", e);
      }
      // --------------------------

      // Fetch trực tiếp từ Supabase (thay vì qua backend API - để deploy được trên Vercel)
      // Sử dụng PAGINATION để lấy tất cả records (Supabase mặc định giới hạn 1000 rows/request)
      const PAGE_SIZE = 1000;
      let allReports = [];
      let hasMore = true;
      let offset = 0;
      let totalCount = 0;

      console.log(`📡 Fetching detail_reports trực tiếp từ Supabase...`);
      console.log(`📅 Date range: ${startDate} đến ${endDate}`);

      while (hasMore) {
        let query = supabase
          .from('detail_reports')
          .select('*', { count: 'exact' });

        // Apply date filters if provided
        if (startDate) {
          query = query.gte('Ngày', startDate);
        }
        if (endDate) {
          query = query.lte('Ngày', endDate);
        }

        // Order by date descending (mới nhất trước)
        query = query.order('Ngày', { ascending: false });

        // Pagination
        query = query.range(offset, offset + PAGE_SIZE - 1);

        const { data: pageData, error, count } = await query;

        if (error) {
          console.error('❌ Error fetching detail_reports:', error);
          throw new Error(`Lỗi truy vấn Supabase: ${error.message}`);
        }

        if (count !== null && totalCount === 0) {
          totalCount = count;
          console.log(`📊 Detail Reports: Tổng số records: ${totalCount}`);
        }

        if (pageData && pageData.length > 0) {
          allReports = [...allReports, ...pageData];
          offset += PAGE_SIZE;
          console.log(`📊 Detail Reports: Đã lấy ${allReports.length}/${totalCount}...`);

          if (pageData.length < PAGE_SIZE) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`✅ Fetched ${allReports.length} records từ detail_reports`);

      // Debug: Log sample date format từ database
      if (allReports.length > 0) {
        const sampleDates = allReports.slice(0, 3).map(r => r['Ngày']);
        console.log(`📅 Sample dates từ DB:`, sampleDates);
        console.log(`📅 Date format check: startDate=${startDate}, endDate=${endDate}`);
      }

      // Supabase đã filter theo date ở query, nhưng vẫn filter lại ở client để đảm bảo chính xác
      let dateFilteredReports = allReports.filter(r => {
        const reportDate = r['Ngày'];
        if (!reportDate) return false;

        // Normalize date to YYYY-MM-DD for comparison
        let dateStr = reportDate;
        if (reportDate.includes('T')) {
          // If it's ISO format with time, extract just the date part
          dateStr = reportDate.split('T')[0];
        }

        // Compare as strings (YYYY-MM-DD format sorts correctly)
        if (startDate && dateStr < startDate) return false;
        if (endDate && dateStr > endDate) return false;
        return true;
      });

      console.log(`📊 After client-side date filter: ${dateFilteredReports.length}/${allReports.length}`);

      // Then filter by hierarchical permissions
      // Admin: luôn xem tất cả dữ liệu, không bị filter
      if (!isAdmin) {
        // Non-admin: Áp dụng filter theo role
        // Leader: see team data only
        if (role?.toUpperCase() === 'LEADER' && userTeam) {
          dateFilteredReports = dateFilteredReports.filter(item =>
            item['Team'] && item['Team'].toLowerCase() === userTeam.toLowerCase()
          );
        } else {
          // Helper function to normalize name for matching
          const normalizeNameForMatch = (str) => {
            if (!str) return '';
            return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
          };

          // Staff: see own data only (by name or email)
          dateFilteredReports = dateFilteredReports.filter(item => {
            const itemName = normalizeNameForMatch(item['Tên'] || '');
            const itemEmail = normalizeNameForMatch(item['Email'] || '');
            const currentUserName = normalizeNameForMatch(userName);
            const currentUserEmail = normalizeNameForMatch(userEmail);

            return (itemName === currentUserName && currentUserName !== '') ||
              (itemEmail === currentUserEmail && currentUserEmail !== '') ||
              itemName.includes(currentUserName) ||
              currentUserName.includes(itemName);
          });
        }
      } else {
        // Admin: xem tất cả, không filter
        console.log('✅ Admin: Viewing all MKT reports (no filter applied)');
      }

      console.log(`📊 Filtered to ${dateFilteredReports.length} records based on permissions (role: ${role}, team: ${userTeam}, isAdmin: ${isAdmin})`);

      // Enrich Team từ bảng users/human_resources nếu thiếu
      await enrichTeamFromUsers(dateFilteredReports);

      // Enrich với số đơn TT từ bảng orders
      await enrichWithTotalOrdersFromOrders(dateFilteredReports, startDate, endDate);

      setData(dateFilteredReports);

      // Extract unique teams, products, markets from detail_reports
      // Tất cả dữ liệu đều lấy từ bảng detail_reports
      const uniqueTeams = [...new Set(dateFilteredReports.map(r => r['Team']).filter(Boolean))].sort();
      setTeams(uniqueTeams);

      const uniqueProducts = [...new Set(dateFilteredReports.map(r => r['Sản_phẩm']).filter(Boolean))].sort();
      setProducts(uniqueProducts);
      // Auto-select tất cả sản phẩm để tránh filter sai
      setSelectedProducts(uniqueProducts);

      const uniqueMarkets = [...new Set(dateFilteredReports.map(r => r['Thị_trường']).filter(Boolean))].sort();
      setMarkets(uniqueMarkets);
      // Auto-select tất cả thị trường
      setSelectedMarkets(uniqueMarkets);

      // Extract unique shifts (Ca) from detail_reports
      const uniqueShifts = [...new Set(dateFilteredReports.map(r => r['ca']).filter(Boolean))].sort();
      setShifts(uniqueShifts);
      // Auto-select tất cả ca
      setSelectedShifts(uniqueShifts);

    } catch (err) {
      console.error('❌ Error fetching data:', err);
      console.error('❌ Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      });

      // Hiển thị thông báo lỗi rõ ràng hơn cho user
      if (err.message && (err.message.includes('Backend server') || err.message.includes('non-JSON'))) {
        alert(`⚠️ ${err.message}\n\nVui lòng đảm bảo backend server đang chạy:\nnpm run server`);
      } else {
        alert(`❌ Lỗi khi tải dữ liệu: ${err.message || 'Lỗi không xác định'}\n\nVui lòng kiểm tra console để xem chi tiết.`);
      }

      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const processData = useMemo(() => {
    if (!data.length) return { rows: [], total: {}, dailyData: [] };

    // Group by Marketing Name (+ Team)
    const grouped = {};

    data.forEach(row => {
      // Filter by Team if selected
      // Tất cả dữ liệu lấy từ bảng detail_reports:
      // - Team: từ cột "Team" trong detail_reports
      // - Tên MKT (Marketing): từ cột "Tên" trong detail_reports
      // - CPQC: từ cột "CPQC" trong detail_reports
      // - Số mess: từ cột "Số_Mess_Cmt" trong detail_reports
      if (selectedTeam !== 'ALL' && row['Team'] !== selectedTeam) return;

      // Filter by Product (if any selected, must match; if none selected, show all)
      if (selectedProducts.length > 0 && !selectedProducts.includes(row['Sản_phẩm'])) return;

      // Filter by Shift (Ca) (if any selected, must match; if none selected, show all)
      if (selectedShifts.length > 0 && !selectedShifts.includes(row['ca'])) return;

      // Filter by Market (Thị trường) (if any selected, must match; if none selected, show all)
      if (selectedMarkets.length > 0 && !selectedMarkets.includes(row['Thị_trường'])) return;

      const key = `${row['Team']}_${row['Tên']}`;
      if (!grouped[key]) {
        grouped[key] = {
          team: row['Team'], // detail_reports."Team"
          name: row['Tên'], // detail_reports."Tên" (Tên MKT/Marketing)
          mess: 0,
          cpqc: 0,
          orders: 0,
          ordersTT: 0, // Thực tế (mapped if available)
          soDonTT: 0, // Số đơn TT từ bảng orders
          dsChot: 0,
          dsChotTT: 0, // Thực tế trước ship / doanh thu thuần
          soDonHuy: 0,
          soDonHuyTT: 0,
          dsHuy: 0,
          dsHuyTT: 0,
          dsSauShip: 0, // Doanh số sau ship
          dsThanhCong: 0,
          dsThanhCongTT: 0,
          kpiValue: 0, // KPI
          via_log: 0
        };
      }

      // Lấy từ detail_reports:
      grouped[key].mess += Number(row['Số_Mess_Cmt'] || 0); // detail_reports."Số_Mess_Cmt"
      grouped[key].cpqc += Number(row['CPQC'] || 0); // detail_reports."CPQC"
      grouped[key].orders += Number(row['Số đơn'] || 0); // detail_reports."Số đơn"
      grouped[key].ordersTT += Number(row['Số đơn thực tế'] || 0); // detail_reports."Số đơn thực tế"
      const soDonTTValue = Number(row['Số đơn TT'] || 0);
      grouped[key].soDonTT += soDonTTValue; // Số đơn TT từ bảng orders

      // Debug logging cho 3 record đầu tiên
      if (Object.keys(grouped).length <= 3 && soDonTTValue > 0) {
        console.log(`🔍 processData: Key "${key}" - soDonTT += ${soDonTTValue} (từ row['Số đơn TT'] = ${row['Số đơn TT']})`);
      }

      grouped[key].dsChot += Number(row['Doanh số'] || 0);
      // Doanh số chốt TT lấy từ orders (total_amount_vnd), nếu không có thì fallback về "Doanh thu chốt thực tế"
      const dsChotTTFromOrders = Number(row['Doanh số chốt TT'] || 0);
      grouped[key].dsChotTT += dsChotTTFromOrders > 0 ? dsChotTTFromOrders : Number(row['Doanh thu chốt thực tế'] || 0);

      grouped[key].soDonHuy += Number(row['Số đơn hoàn hủy'] || 0);
      grouped[key].soDonHuyTT += Number(row['Số đơn hoàn hủy thực tế'] || 0);

      grouped[key].dsHuy += Number(row['DS sau hoàn hủy'] || 0);
      grouped[key].dsHuyTT += Number(row['Doanh số hoàn hủy thực tế'] || 0);

      grouped[key].dsSauShip += Number(row['Doanh số sau ship'] || 0);
      grouped[key].dsThanhCong += Number(row['Doanh số TC'] || 0);
      grouped[key].dsThanhCongTT += Number(row['Doanh số sau hoàn hủy thực tế'] || 0);

      grouped[key].kpiValue += Number(row['KPIs'] || 0);
    });

    const rows = Object.values(grouped).map(item => {
      const tiLeChot = item.mess ? (item.orders / item.mess) * 100 : 0;
      const tiLeChotTT = item.mess ? (item.soDonTT / item.mess) * 100 : 0; // Số đơn TT / Số Mess
      const giaMess = item.mess ? item.cpqc / item.mess : 0;
      const cps = item.orders ? item.cpqc / item.orders : 0;
      const cp_ds = item.dsChot ? (item.cpqc / item.dsChot) * 100 : 0;
      const giaTBDon = item.orders ? item.dsChot / item.orders : 0;

      // KPI metrics
      const cp_ds_sau_ship = item.dsSauShip ? (item.cpqc / item.dsSauShip) * 100 : 0;
      const kpi_percent = item.kpiValue ? (item.dsSauShip / item.kpiValue) * 100 : 0;

      return {
        ...item,
        tiLeChot, tiLeChotTT, giaMess, cps, cp_ds, giaTBDon,
        cp_ds_sau_ship, kpi_percent
      };
    });

    // Sort by Team then Name
    rows.sort((a, b) => (a.team || '').localeCompare(b.team || '') || (a.name || '').localeCompare(b.name || ''));

    // Calculate Grand Total
    const total = rows.reduce((acc, cur) => ({
      mess: acc.mess + cur.mess,
      cpqc: acc.cpqc + cur.cpqc,
      orders: acc.orders + cur.orders,
      ordersTT: acc.ordersTT + cur.ordersTT,
      soDonTT: acc.soDonTT + cur.soDonTT,
      dsChot: acc.dsChot + cur.dsChot,
      dsChotTT: acc.dsChotTT + cur.dsChotTT,
      soDonHuy: acc.soDonHuy + cur.soDonHuy,
      soDonHuyTT: acc.soDonHuyTT + cur.soDonHuyTT,
      dsHuyTT: acc.dsHuyTT + cur.dsHuyTT,
      dsSauShip: acc.dsSauShip + cur.dsSauShip,
      dsThanhCongTT: acc.dsThanhCongTT + cur.dsThanhCongTT,
      dsThanhCong: acc.dsThanhCong + cur.dsThanhCong,
      kpiValue: acc.kpiValue + cur.kpiValue,
    }), {
      mess: 0, cpqc: 0, orders: 0, ordersTT: 0, soDonTT: 0, dsChot: 0, dsChotTT: 0,
      soDonHuy: 0, soDonHuyTT: 0, dsHuyTT: 0, dsSauShip: 0, dsThanhCongTT: 0, dsThanhCong: 0,
      kpiValue: 0
    });

    // Debug: Log total soDonTT và visibleColumns
    console.log(`🔍 processData total.soDonTT = ${total.soDonTT}`);
    console.log(`🔍 visibleColumns.soDonTT = ${visibleColumns.soDonTT}`);

    // Calculate Total Rates
    const totalRates = {
      tiLeChot: total.mess ? (total.orders / total.mess) * 100 : 0,
      tiLeChotTT: total.mess ? (total.soDonTT / total.mess) * 100 : 0, // Số đơn TT / Số Mess
      giaMess: total.mess ? total.cpqc / total.mess : 0,
      cps: total.orders ? total.cpqc / total.orders : 0,
      cp_ds: total.dsChot ? (total.cpqc / total.dsChot) * 100 : 0,
      giaTBDon: total.orders ? total.dsChot / total.orders : 0,
      cp_ds_sau_ship: total.dsSauShip ? (total.cpqc / total.dsSauShip) * 100 : 0,
      kpi_percent: total.kpiValue ? (total.dsSauShip / total.kpiValue) * 100 : 0,
    };

    // --- DAILY BREAKDOWN LOGIC ---
    const dailyGroups = {};
    let debugFilterStats = { total: 0, passedTeam: 0, passedProduct: 0, passedShift: 0, passedMarket: 0, passedDate: 0 };

    if (activeTab === 'DetailedReport') {
      data.forEach(row => {
        debugFilterStats.total++;
        // Tất cả dữ liệu lấy từ detail_reports
        if (selectedTeam !== 'ALL' && row['Team'] !== selectedTeam) return;
        debugFilterStats.passedTeam++;
        if (selectedProducts.length > 0 && !selectedProducts.includes(row['Sản_phẩm'])) return;
        debugFilterStats.passedProduct++;
        if (selectedShifts.length > 0 && !selectedShifts.includes(row['ca'])) return;
        debugFilterStats.passedShift++;
        if (selectedMarkets.length > 0 && !selectedMarkets.includes(row['Thị_trường'])) return;
        debugFilterStats.passedMarket++;
        if (!row['Ngày']) return;

        const dObj = parseSmartDate(row['Ngày']);
        if (!dObj) return;
        // Sử dụng LOCAL date để tránh lỗi timezone (toISOString trả về UTC)
        const year = dObj.getFullYear();
        const month = String(dObj.getMonth() + 1).padStart(2, '0');
        const day = String(dObj.getDate()).padStart(2, '0');
        const date = `${year}-${month}-${day}`;
        debugFilterStats.passedDate++;

        if (!dailyGroups[date]) dailyGroups[date] = [];
        dailyGroups[date].push(row);
      });

      console.log(`🔍 Filter stats: Total=${debugFilterStats.total}, PassedTeam=${debugFilterStats.passedTeam}, PassedProduct=${debugFilterStats.passedProduct}, PassedShift=${debugFilterStats.passedShift}, PassedMarket=${debugFilterStats.passedMarket}, PassedDate=${debugFilterStats.passedDate}`);
    }

    // Sort dates desc
    const sortedDates = Object.keys(dailyGroups).sort((a, b) => new Date(b) - new Date(a));
    console.log(`📅 Daily dates found: ${sortedDates.length} ngày:`, sortedDates.slice(0, 10));

    const dailyData = sortedDates.map(date => {
      const dayRows = dailyGroups[date];
      const dayGrouped = {};

      dayRows.forEach(row => {
        // Tất cả dữ liệu lấy từ detail_reports
        const key = `${row['Team']}_${row['Tên']}`;
        if (!dayGrouped[key]) {
          dayGrouped[key] = {
            team: row['Team'], // detail_reports."Team"
            name: row['Tên'], // detail_reports."Tên" (Tên MKT/Marketing)
            mess: 0, cpqc: 0, orders: 0, ordersTT: 0, soDonTT: 0,
            dsChot: 0, dsChotTT: 0
          };
        }
        const g = dayGrouped[key];
        g.mess += Number(row['Số_Mess_Cmt'] || 0); // detail_reports."Số_Mess_Cmt"
        g.cpqc += Number(row['CPQC'] || 0); // detail_reports."CPQC"
        g.orders += Number(row['Số đơn'] || 0); // detail_reports."Số đơn"
        g.ordersTT += Number(row['Số đơn thực tế'] || 0); // detail_reports."Số đơn thực tế"
        g.soDonTT += Number(row['Số đơn TT'] || 0); // Số đơn TT từ bảng orders
        g.dsChot += Number(row['Doanh số'] || 0); // detail_reports."Doanh số"
        // Doanh số chốt TT lấy từ orders (total_amount_vnd), nếu không có thì fallback về "Doanh thu chốt thực tế"
        const dsChotTTFromOrders = Number(row['Doanh số chốt TT'] || 0);
        g.dsChotTT += dsChotTTFromOrders > 0 ? dsChotTTFromOrders : Number(row['Doanh thu chốt thực tế'] || 0);
      });

      const currentDayRows = Object.values(dayGrouped).map(item => {
        const tiLeChot = item.mess ? (item.orders / item.mess) * 100 : 0;
        const tiLeChotTT = item.mess ? (item.soDonTT / item.mess) * 100 : 0; // Số đơn TT / Số Mess
        const giaMess = item.mess ? item.cpqc / item.mess : 0;
        const cps = item.orders ? item.cpqc / item.orders : 0;
        const cp_ds = item.dsChot ? (item.cpqc / item.dsChot) * 100 : 0;
        const giaTBDon = item.orders ? item.dsChot / item.orders : 0;

        return { ...item, tiLeChot, tiLeChotTT, giaMess, cps, cp_ds, giaTBDon };
      });

      currentDayRows.sort((a, b) => (a.team || '').localeCompare(b.team || '') || (a.name || '').localeCompare(b.name || ''));

      const dTotal = currentDayRows.reduce((acc, cur) => ({
        mess: acc.mess + cur.mess,
        cpqc: acc.cpqc + cur.cpqc,
        orders: acc.orders + cur.orders,
        ordersTT: acc.ordersTT + cur.ordersTT,
        soDonTT: acc.soDonTT + cur.soDonTT,
        dsChot: acc.dsChot + cur.dsChot,
        dsChotTT: acc.dsChotTT + cur.dsChotTT
      }), { mess: 0, cpqc: 0, orders: 0, ordersTT: 0, soDonTT: 0, dsChot: 0, dsChotTT: 0 });

      const dTotalRates = {
        tiLeChot: dTotal.mess ? (dTotal.orders / dTotal.mess) * 100 : 0,
        tiLeChotTT: dTotal.mess ? (dTotal.soDonTT / dTotal.mess) * 100 : 0, // Số đơn TT / Số Mess
        giaMess: dTotal.mess ? dTotal.cpqc / dTotal.mess : 0,
        cps: dTotal.orders ? dTotal.cpqc / dTotal.orders : 0,
        cp_ds: dTotal.dsChot ? (dTotal.cpqc / dTotal.dsChot) * 100 : 0,
        giaTBDon: dTotal.orders ? dTotal.dsChot / dTotal.orders : 0
      };

      return { date, rows: currentDayRows, total: { ...dTotal, ...dTotalRates } };
    });

    return { rows, total: { ...total, ...totalRates }, dailyData };
  }, [data, selectedTeam, selectedProducts, selectedShifts, selectedMarkets, activeTab]);

  // Logic for Market Report (Tab 4)
  const processMarketData = useMemo(() => {
    if (!data.length) return { asia: [], nonAsia: [], summary: [] };

    const processGroup = (records, showMarketColumns = true) => {
      const productGroups = {};

      records.forEach(r => {
        if (selectedProduct !== 'ALL' && r['Sản_phẩm'] !== selectedProduct) return;
        if (selectedMarket !== 'ALL' && r['Thị_trường'] !== selectedMarket) return;
        if (selectedTeam !== 'ALL' && r.Team !== selectedTeam) return;

        const productKey = r['Sản_phẩm'] || 'Chưa xác định';
        const marketKey = showMarketColumns ? (r['Thị_trường'] || 'Không xác định') : '_TOTAL_';

        if (!productGroups[productKey]) productGroups[productKey] = {};
        if (!productGroups[productKey][marketKey]) {
          productGroups[productKey][marketKey] = {
            product: productKey,
            market: marketKey,
            cpqc: 0, soDon: 0, soDonThucTe: 0, soMessCmt: 0,
            dsChot: 0, dsChotThucTe: 0, dsHoanHuyThucTe: 0,
            dsSauHoanHuyThucTe: 0
          };
        }

        const g = productGroups[productKey][marketKey];
        g.cpqc += Number(r['CPQC'] || 0);
        g.soDon += Number(r['Số đơn'] || 0);
        g.soDonThucTe += Number(r['Số đơn thực tế'] || 0);
        g.soMessCmt += Number(r['Số_Mess_Cmt'] || 0);
        g.dsChot += Number(r['Doanh số'] || 0);
        g.dsChotThucTe += Number(r['Doanh thu chốt thực tế'] || 0);
        g.dsHoanHuyThucTe += Number(r['Doanh số hoàn hủy thực tế'] || 0);
        g.dsSauHoanHuyThucTe += Number(r['Doanh số sau hoàn hủy thực tế'] || 0);
      });

      let flattened = [];
      Object.keys(productGroups).sort().forEach(pKey => {
        const markets = productGroups[pKey];
        const pTotal = {
          product: pKey, market: 'Tổng',
          cpqc: 0, soDon: 0, soDonThucTe: 0, soMessCmt: 0,
          dsChot: 0, dsChotThucTe: 0, dsHoanHuyThucTe: 0,
          dsSauHoanHuyThucTe: 0,
          isHeader: true
        };

        Object.keys(markets).sort().forEach(mKey => {
          const mData = markets[mKey];
          flattened.push(calculateMarketMetrics(mData));
          pTotal.cpqc += mData.cpqc;
          pTotal.soDon += mData.soDon;
          pTotal.soDonThucTe += mData.soDonThucTe;
          pTotal.soMessCmt += mData.soMessCmt;
          pTotal.dsChot += mData.dsChot;
          pTotal.dsChotThucTe += mData.dsChotThucTe;
          pTotal.dsHoanHuyThucTe += mData.dsHoanHuyThucTe;
          pTotal.dsSauHoanHuyThucTe += mData.dsSauHoanHuyThucTe;
        });

        if (showMarketColumns && Object.keys(markets).length > 1) {
          flattened.push(calculateMarketMetrics(pTotal));
        }
      });

      return flattened;
    };

    const calculateMarketMetrics = (d) => {
      const costPercent = d.dsSauHoanHuyThucTe > 0 ? (d.cpqc / d.dsSauHoanHuyThucTe) * 100 : 0;
      const cps = d.soDon ? d.cpqc / d.soDon : 0;
      const avgOrderValue = d.soDon ? d.dsSauHoanHuyThucTe / d.soDon : 0;
      const closingRate = d.soMessCmt ? (d.soDon / d.soMessCmt) * 100 : 0;
      const closingRateThucTe = d.soMessCmt ? (d.soDonThucTe / d.soMessCmt) * 100 : 0;

      return { ...d, costPercent, cps, avgOrderValue, closingRate, closingRateThucTe };
    };

    const asiaList = [];
    const nonAsiaList = [];
    const nonAsiaMarketsLower = MARKET_GROUPS['Ngoài Châu Á'].map(m => m.toLowerCase());

    data.forEach(r => {
      const market = (r['Thị_trường'] || '').toLowerCase();
      if (nonAsiaMarketsLower.some(m => market.includes(m))) {
        nonAsiaList.push(r);
      } else {
        asiaList.push(r);
      }
    });

    return {
      nonAsia: processGroup(nonAsiaList, true),
      asia: processGroup(asiaList, true),
      summary: processGroup(data, false)
    };

  }, [data, selectedProduct, selectedMarket, selectedTeam]);



  // Quick date select handler
  const handleQuickDateSelect = (value) => {
    setQuickSelect(value);
    if (!value) return;

    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (value) {
      case 'today':
        start = new Date(today);
        end = new Date(today);
        break;
      case 'yesterday':
        start = new Date(today);
        start.setDate(today.getDate() - 1);
        end = new Date(start);
        break;
      case 'thisWeek':
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        start = new Date(today.getFullYear(), today.getMonth(), diff);
        end = new Date(today);
        break;
      case 'lastWeek':
        const lastWeekDay = today.getDay();
        const lastWeekDiff = today.getDate() - lastWeekDay - 6 + (lastWeekDay === 0 ? -6 : 1);
        start = new Date(today.getFullYear(), today.getMonth(), lastWeekDiff);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'last7Days':
        start = new Date(today);
        start.setDate(today.getDate() - 7);
        end = new Date(today);
        break;
      case 'last30Days':
        start = new Date(today);
        start.setDate(today.getDate() - 30);
        end = new Date(today);
        break;
      default:
        return;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  // Handle filter checkbox changes
  const handleFilterChange = (filterType, value, isChecked) => {
    if (filterType === 'product') {
      if (value === 'ALL') {
        setSelectedProducts(isChecked ? products : []);
      } else {
        setSelectedProducts(prev =>
          isChecked ? [...prev, value] : prev.filter(p => p !== value)
        );
      }
    } else if (filterType === 'shift') {
      if (value === 'ALL') {
        setSelectedShifts(isChecked ? shifts : []);
      } else {
        setSelectedShifts(prev =>
          isChecked ? [...prev, value] : prev.filter(s => s !== value)
        );
      }
    } else if (filterType === 'market') {
      if (value === 'ALL') {
        setSelectedMarkets(isChecked ? markets : []);
      } else {
        setSelectedMarkets(prev =>
          isChecked ? [...prev, value] : prev.filter(m => m !== value)
        );
      }
    }
  };

  // Enrich Team từ bảng users/human_resources nếu thiếu trong detail_reports
  const enrichTeamFromUsers = async (reports) => {
    try {
      // Helper function để normalize string
      const normalizeStr = (str) => {
        if (!str) return '';
        return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
      };

      // Lấy danh sách Email và Tên từ reports để tìm Team
      const emailsFromReports = [...new Set(reports
        .map(item => item['Email'])
        .filter(email => email && email.trim().length > 0)
      )];

      const namesFromReports = [...new Set(reports
        .map(item => item['Tên'])
        .filter(name => name && name.trim().length > 0)
      )];

      // Tạo map từ users table (ưu tiên email)
      const teamMapByEmail = new Map();
      const teamMapByName = new Map();

      if (emailsFromReports.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('email, name, team')
          .in('email', emailsFromReports);

        if (usersError) {
          console.warn('⚠️ Error fetching users for Team enrichment:', usersError);
        } else if (usersData) {
          usersData.forEach(user => {
            if (user.email && user.team) {
              teamMapByEmail.set(normalizeStr(user.email), user.team);
            }
            if (user.name && user.team) {
              teamMapByName.set(normalizeStr(user.name), user.team);
            }
          });
        }
      }

      // Tạo map từ human_resources table (fallback)
      if (namesFromReports.length > 0) {
        const { data: hrData, error: hrError } = await supabase
          .from('human_resources')
          .select('"Họ Và Tên", email, "Team"')
          .or(namesFromReports.map(name => `"Họ Và Tên".ilike.%${name}%`).join(','));

        if (hrError) {
          console.warn('⚠️ Error fetching human_resources for Team enrichment:', hrError);
        } else if (hrData) {
          hrData.forEach(hr => {
            if (hr.email && hr['Team']) {
              teamMapByEmail.set(normalizeStr(hr.email), hr['Team']);
            }
            if (hr['Họ Và Tên'] && hr['Team']) {
              teamMapByName.set(normalizeStr(hr['Họ Và Tên']), hr['Team']);
            }
          });
        }
      }

      // Enrich Team cho các reports thiếu Team
      let enrichedCount = 0;
      reports.forEach(report => {
        if (!report['Team'] || report['Team'].trim() === '') {
          const reportEmail = normalizeStr(report['Email'] || '');
          const reportName = normalizeStr(report['Tên'] || '');

          // Ưu tiên tìm theo Email, sau đó theo Tên
          const teamFromEmail = reportEmail ? teamMapByEmail.get(reportEmail) : null;
          const teamFromName = reportName ? teamMapByName.get(reportName) : null;

          const foundTeam = teamFromEmail || teamFromName;

          if (foundTeam) {
            report['Team'] = foundTeam;
            enrichedCount++;
            console.log(`✅ Enriched Team for "${report['Tên']}" (${report['Email'] || 'N/A'}): ${foundTeam}`);
          } else {
            console.warn(`⚠️ Could not find Team for "${report['Tên']}" (${report['Email'] || 'N/A'})`);
          }
        }
      });

      if (enrichedCount > 0) {
        console.log(`✅ Enriched Team for ${enrichedCount} reports from users/human_resources`);
      }
    } catch (err) {
      console.error('❌ Error enriching Team from users:', err);
    }
  };

  // Fetch số đơn tổng (tất cả các đơn, không filter theo check_result) từ bảng orders cho MKT
  const enrichWithTotalOrdersFromOrders = async (reports, startDate, endDate) => {
    try {
      // Helper function để normalize date format
      const normalizeDate = (date) => {
        if (!date) return '';
        if (date instanceof Date) {
          return date.toISOString().split('T')[0];
        }
        if (typeof date === 'string') {
          const trimmed = date.trim();
          if (trimmed.includes('T')) {
            return trimmed.split('T')[0];
          }
          if (trimmed.includes(' ')) {
            return trimmed.split(' ')[0];
          }
          // Nếu là format DD/MM/YYYY, convert sang YYYY-MM-DD
          if (trimmed.includes('/')) {
            const parts = trimmed.split('/');
            if (parts.length === 3) {
              return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
          // Nếu đã là YYYY-MM-DD
          if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed;
          }
          // Thử parse
          const parsed = new Date(trimmed);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
          }
          return trimmed;
        }
        return String(date);
      };

      // Helper function để normalize string
      const normalizeStr = (str) => {
        if (!str) return '';
        return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
      };

      const normalizedStartDate = normalizeDate(startDate);
      const normalizedEndDate = normalizeDate(endDate);

      // Lấy danh sách tên Marketing từ báo cáo để filter ở query level
      const marketingNamesFromReports = [...new Set(reports
        .map(item => item['Tên'])
        .filter(name => name && name.trim().length > 0)
      )];

      // Build query với PAGINATION để lấy tất cả orders (Supabase mặc định giới hạn 1000 rows/request)
      const PAGE_SIZE = 1000;
      let allOrders = [];
      let hasMore = true;
      let offset = 0;
      let totalCount = 0;

      console.log(`📊 MKT: Đang query orders với khoảng ngày: ${normalizedStartDate} đến ${normalizedEndDate}`);

      while (hasMore) {
        let query = supabase
          .from('orders')
          .select('order_date, marketing_staff, product, country, total_amount_vnd', { count: 'exact' })
          .gte('order_date', normalizedStartDate)
          .lte('order_date', normalizedEndDate)
          .order('order_date', { ascending: false }); // Lấy đơn mới nhất trước

        // KHÔNG filter theo marketing_staff để lấy TẤT CẢ đơn trong khoảng thời gian
        // Việc match sẽ thực hiện ở bước sau

        query = query.range(offset, offset + PAGE_SIZE - 1);

        const { data: pageData, error, count } = await query;

        if (error) {
          console.error('❌ Error fetching total orders for MKT:', error);
          return;
        }

        if (count !== null && totalCount === 0) {
          totalCount = count;
          console.log(`📊 MKT: Tổng số đơn cần lấy: ${totalCount}`);
        }

        if (pageData && pageData.length > 0) {
          allOrders = [...allOrders, ...pageData];
          offset += PAGE_SIZE;
          console.log(`📊 MKT: Đã lấy ${allOrders.length}/${totalCount} đơn...`);

          // Kiểm tra còn dữ liệu không
          if (pageData.length < PAGE_SIZE) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`✅ MKT: Hoàn tất lấy ${allOrders.length} đơn (không giới hạn 1000)`);

      console.log(`📊 MKT: Tìm thấy ${allOrders?.length || 0} đơn tổng trong khoảng ${normalizedStartDate} - ${normalizedEndDate}`);
      console.log(`📊 MKT: Tên Marketing từ báo cáo:`, marketingNamesFromReports.slice(0, 5));

      if (allOrders && allOrders.length > 0) {
        const sampleOrder = allOrders[0];
        console.log(`📊 MKT: Sample order:`, {
          marketing_staff: sampleOrder.marketing_staff,
          order_date: sampleOrder.order_date,
          product: sampleOrder.product,
          country: sampleOrder.country,
          total_amount_vnd: sampleOrder.total_amount_vnd
        });
      }



      // Group đơn theo Tên Marketing + Ngày + Thị trường (BỎ sản phẩm vì orders thường không có)
      // Lưu cả số đơn và tổng tiền VNĐ
      const ordersByMarketingDateMarket = new Map();

      (allOrders || []).forEach(order => {
        const orderMarketingName = normalizeStr(order.marketing_staff);
        const orderDateStr = normalizeDate(order.order_date);
        const orderMarket = normalizeStr(order.country || '');
        // Key WITHOUT product - chỉ dùng Tên + Ngày + Thị trường
        const key = `${orderMarketingName}|${orderDateStr}|${orderMarket}`;

        if (!ordersByMarketingDateMarket.has(key)) {
          ordersByMarketingDateMarket.set(key, { orders: [], totalAmount: 0 });
        }
        ordersByMarketingDateMarket.get(key).orders.push(order);
        ordersByMarketingDateMarket.get(key).totalAmount += Number(order.total_amount_vnd || 0);
      });

      console.log(`📊 MKT: Đã group ${ordersByMarketingDateMarket.size} keys từ ${allOrders?.length || 0} đơn`);
      if (ordersByMarketingDateMarket.size > 0) {
        const sampleKeys = Array.from(ordersByMarketingDateMarket.keys()).slice(0, 3);
        console.log(`📊 MKT: Sample keys từ orders:`, sampleKeys);
      }

      // Cập nhật reports với số đơn tổng từ orders
      let matchedCount = 0;
      let unmatchedCount = 0;

      reports.forEach((item, index) => {
        const marketingName = normalizeStr(item['Tên']);
        const reportDateRaw = item['Ngày'];
        const reportDate = normalizeDate(reportDateRaw);
        const reportMarket = normalizeStr(item['Thị_trường'] || '');

        if (!marketingName || !reportDate) {
          item['Số đơn TT'] = 0;
          item['Doanh số chốt TT'] = 0;
          if (index < 3) {
            console.log(`⚠️ MKT [${index}]: Thiếu dữ liệu - Tên: "${item['Tên']}", Ngày: "${reportDateRaw}"`);
          }
          unmatchedCount++;
          return;
        }

        // Key WITHOUT product - chỉ dùng Tên + Ngày + Thị trường
        const key = `${marketingName}|${reportDate}|${reportMarket}`;
        const matchingData = ordersByMarketingDateMarket.get(key) || { orders: [], totalAmount: 0 };
        item['Số đơn TT'] = matchingData.orders.length;
        item['Doanh số chốt TT'] = matchingData.totalAmount; // Tổng tiền VNĐ từ orders

        if (matchingData.orders.length > 0) {
          matchedCount++;
        } else {
          unmatchedCount++;
        }
      });

      // Chỉ log tóm tắt, không log từng record
      console.log(`✅ MKT: Enriched ${reports.length} báo cáo - Match: ${matchedCount}, Không match: ${unmatchedCount}`);
    } catch (err) {
      console.error('❌ Error enriching with total orders for MKT:', err);
    }
  };

  // Format Helper
  const fmtNum = (n) => n ? Math.round(n).toLocaleString('vi-VN') : '0';
  const fmtCurrency = (n) => n ? Math.round(n).toLocaleString('vi-VN') + ' ₫' : '0 ₫';
  const fmtPct = (n) => n ? n.toFixed(2) + '%' : '0.00%';

  const getCpsCellStyle = (cps) => {
    // Match với hình: red cho >2M, yellow cho >1M
    if (cps > 2000000) return 'bg-lightred'; // > 2M - Red
    if (cps > 1000000) return 'bg-yellow';   // > 1M - Yellow
    return ''; // < 1M - White/Default
  };

  const getRateClass = (rate) => {
    // Match với hình: green cho >10%, yellow cho 5-10%
    if (rate > 10) return 'bg-green';  // > 10% - Green
    if (rate > 5) return 'bg-yellow';   // 5-10% - Yellow
    return ''; // < 5% - White/Default
  };

  const renderMarketTable = (rows, title) => {
    if (!rows || rows.length === 0) return null;

    const total = {
      cpqc: 0, soDon: 0, soDonThucTe: 0, soMessCmt: 0,
      dsChot: 0, dsChotThucTe: 0, dsHoanHuyThucTe: 0, dsSauHoanHuyThucTe: 0
    };

    rows.forEach(r => {
      if (!r.isHeader) {
        total.cpqc += r.cpqc;
        total.soDon += r.soDon;
        total.soDonThucTe += r.soDonThucTe;
        total.soMessCmt += r.soMessCmt;
        total.dsChot += r.dsChot;
        total.dsChotThucTe += r.dsChotThucTe;
        total.dsHoanHuyThucTe += r.dsHoanHuyThucTe;
        total.dsSauHoanHuyThucTe += r.dsSauHoanHuyThucTe;
      }
    });

    const totalMetrics = {
      costPercent: total.dsSauHoanHuyThucTe > 0 ? (total.cpqc / total.dsSauHoanHuyThucTe) * 100 : 0,
      cps: total.soDon ? total.cpqc / total.soDon : 0,
      avgOrderValue: total.soDon ? total.dsSauHoanHuyThucTe / total.soDon : 0,
      closingRate: total.soMessCmt ? (total.soDon / total.soMessCmt) * 100 : 0,
      closingRateThucTe: total.soMessCmt ? (total.soDonThucTe / total.soMessCmt) * 100 : 0
    };


    return (
      <div className="table-responsive-container" style={{ marginTop: '20px' }}>
        <h3 style={{ color: '#2d7c2d', marginBottom: '10px' }}>{title}</h3>
        <table className="report-table">
          <thead>
            <tr>
              <th className="green-header text-left">Sản phẩm</th>
              <th className="green-header text-left">Thị trường</th>
              <th className="green-header">CPQC</th>
              <th className="green-header">Số Đơn</th>
              <th className="green-header">Số Mess</th>
              <th className="green-header">DS Chốt</th>
              <th className="green-header">DS Chốt (TT)</th>
              <th className="green-header">DS Hoàn Hủy (TT)</th>
              <th className="green-header">DS Sau HH (TT)</th>
              <th className="yellow-header">%CP/DS</th>
              <th className="yellow-header">CPS</th>
              <th className="yellow-header">Giá TB Đơn</th>
              <th className="yellow-header">Tỉ lệ chốt</th>
              <th className="yellow-header">TL Chốt (TT)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="total-row">
              <td colSpan={2} className="text-center">TỔNG CỘNG</td>
              <td>{fmtCurrency(total.cpqc)}</td>
              <td>{fmtNum(total.soDon)}</td>
              <td>{fmtNum(total.soDonThucTe)}</td>
              <td>{fmtNum(total.soMessCmt)}</td>
              <td>{fmtCurrency(total.dsChot)}</td>
              <td>{fmtCurrency(total.dsChotThucTe)}</td>
              <td>{fmtCurrency(total.dsHoanHuyThucTe)}</td>
              <td>{fmtCurrency(total.dsSauHoanHuyThucTe)}</td>
              <td className="text-center">{fmtPct(totalMetrics.costPercent)}</td>
              <td>{fmtCurrency(totalMetrics.cps)}</td>
              <td>{fmtCurrency(totalMetrics.avgOrderValue)}</td>
              <td className="text-center">{fmtPct(totalMetrics.closingRate)}</td>
              <td className="text-center">{fmtPct(totalMetrics.closingRateThucTe)}</td>
            </tr>
            {rows.map((r, i) => (
              <tr key={i} style={r.isHeader ? { fontWeight: 'bold', backgroundColor: '#e8f5e9' } : {}}>
                <td className="text-left">{r.isHeader ? 'Tổng ' + r.product : r.product}</td>
                <td className="text-left">{r.market === '_TOTAL_' ? '' : r.market}</td>
                <td>{fmtCurrency(r.cpqc)}</td>
                <td>{fmtNum(r.soDon)}</td>
                <td>{fmtNum(r.soDonThucTe)}</td>
                <td>{fmtNum(r.soMessCmt)}</td>
                <td>{fmtCurrency(r.dsChot)}</td>
                <td>{fmtCurrency(r.dsChotThucTe)}</td>
                <td>{fmtCurrency(r.dsHoanHuyThucTe)}</td>
                <td>{fmtCurrency(r.dsSauHoanHuyThucTe)}</td>
                <td className="text-center">{fmtPct(r.costPercent)}</td>
                <td>{fmtCurrency(r.cps)}</td>
                <td>{fmtCurrency(r.avgOrderValue)}</td>
                <td className={`text-center ${getRateClass(r.closingRate)}`}>{fmtPct(r.closingRate)}</td>
                <td className={`text-center ${getRateClass(r.closingRateThucTe)}`}>{fmtPct(r.closingRateThucTe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (!canView(permissionCode)) {
    return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
  }

  return (
    <div className="report-view-container">
      {/* Loading Overlay */}
      <div id="loading-overlay" className={loading ? 'visible' : ''}>
        Đang tải dữ liệu...
      </div>

      <div className="tab-container">
        <button
          className={`tablinks ${activeTab === 'DetailedReport' ? 'active' : ''}`}
          onClick={() => setActiveTab('DetailedReport')}
        >
          Báo cáo chi tiết
        </button>
        <button
          className={`tablinks ${activeTab === 'KpiReport' ? 'active' : ''}`}
          onClick={() => setActiveTab('KpiReport')}
          style={{ display: 'none' }}
        >
          Hiệu suất KPI
        </button>
        <button
          className={`tablinks ${activeTab === 'MarketReport' ? 'active' : ''}`}
          onClick={() => setActiveTab('MarketReport')}
          style={{ display: 'none' }}
        >
          Hiệu quả MKT
        </button>
        <button
          className={`tablinks ${activeTab === 'HieuSuatKPI' ? 'active' : ''}`}
          onClick={() => setActiveTab('HieuSuatKPI')}
          style={{ display: 'none' }}
        >
          Hiệu suất KPI
        </button>
      </div>


      {/* TAB 1: Detailed Report */}
      {
        activeTab === 'DetailedReport' && (
          <div id="DetailedReport" className={`tab-content ${activeTab === 'DetailedReport' ? 'active' : ''}`}>
            <div className="report-container">
              <div className="sidebar">
                <h3>Bộ lọc</h3>
                <label>Chọn nhanh:</label>
                <select
                  value={quickSelect}
                  onChange={e => handleQuickDateSelect(e.target.value)}
                >
                  <option value="">-- Chọn nhanh --</option>
                  <option value="today">Hôm nay</option>
                  <option value="yesterday">Hôm qua</option>
                  <option value="thisWeek">Tuần này</option>
                  <option value="lastWeek">Tuần trước</option>
                  <option value="thisMonth">Tháng này</option>
                  <option value="lastMonth">Tháng trước</option>
                  <option value="last7Days">7 ngày qua</option>
                  <option value="last30Days">30 ngày qua</option>
                </select>
                <label>Từ ngày:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    setQuickSelect('');
                  }}
                />
                <label>Đến ngày:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => {
                    setEndDate(e.target.value);
                    setQuickSelect('');
                  }}
                />

                <h3>Sản phẩm</h3>
                <div className="indent">
                  <label style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedProducts.length === products.length && products.length > 0}
                      onChange={e => handleFilterChange('product', 'ALL', e.target.checked)}
                      style={{ marginRight: '8px' }}
                    />
                    Tất cả
                  </label>
                  {products.map(p => (
                    <label key={p} style={{ cursor: 'pointer', display: 'block', marginLeft: '16px' }}>
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(p)}
                        onChange={e => handleFilterChange('product', p, e.target.checked)}
                        style={{ marginRight: '8px' }}
                      />
                      {p}
                    </label>
                  ))}
                </div>

                <h3>Ca</h3>
                <div className="indent">
                  <label style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedShifts.length === shifts.length && shifts.length > 0}
                      onChange={e => handleFilterChange('shift', 'ALL', e.target.checked)}
                      style={{ marginRight: '8px' }}
                    />
                    Tất cả
                  </label>
                  {shifts.map(s => (
                    <label key={s} style={{ cursor: 'pointer', display: 'block', marginLeft: '16px' }}>
                      <input
                        type="checkbox"
                        checked={selectedShifts.includes(s)}
                        onChange={e => handleFilterChange('shift', s, e.target.checked)}
                        style={{ marginRight: '8px' }}
                      />
                      {s}
                    </label>
                  ))}
                </div>

                <h3>Team</h3>
                <div className="indent">
                  <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
                    <option value="ALL">Tất cả</option>
                    {teams.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <h3>Thị trường</h3>
                <div className="indent">
                  <label style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedMarkets.length === markets.length && markets.length > 0}
                      onChange={e => handleFilterChange('market', 'ALL', e.target.checked)}
                      style={{ marginRight: '8px' }}
                    />
                    Tất cả
                  </label>
                  {markets.map(m => (
                    <label key={m} style={{ cursor: 'pointer', display: 'block', marginLeft: '16px' }}>
                      <input
                        type="checkbox"
                        checked={selectedMarkets.includes(m)}
                        onChange={e => handleFilterChange('market', m, e.target.checked)}
                        style={{ marginRight: '8px' }}
                      />
                      {m}
                    </label>
                  ))}
                </div>
              </div>
              <div className="main-content-area">
                <div className="header">
                  <div style={{ width: 60, height: 60, borderRadius: '50%', backgroundColor: '#2d7c2d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '24px', fontWeight: 'bold' }}>MKT</div>
                  <h2 id="report-title-tab1">DỮ LIỆU CHI PHÍ ADS</h2>
                </div>
                <div className="table-responsive-container">
                  {/* Column Settings Button */}
                  <div className="mb-4">
                    <button
                      onClick={() => setShowColumnSettings(true)}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      Cột hiển thị
                    </button>
                  </div>

                  {/* Banner Header */}
                  <div className="bg-[#2d7c2d] text-white p-3 font-bold text-lg uppercase mb-0 rounded-t-lg">
                    BÁO CÁO TỔNG HỢP
                  </div>

                  {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center' }}>Đang tải dữ liệu...</div>
                  ) : (
                    // Main Summary Table
                    <>
                      <table className="report-table" style={{ marginTop: 0 }}>
                        <thead>
                          <tr>
                            {visibleColumns.stt && <th className="green-header">STT</th>}
                            {visibleColumns.team && <th className="green-header">Team</th>}
                            {visibleColumns.marketing && <th className="green-header">Marketing</th>}
                            {visibleColumns.mess && <th className="green-header">Số Mess</th>}
                            {visibleColumns.cpqc && <th className="green-header">CPQC</th>}
                            {visibleColumns.orders && <th className="green-header">Số Đơn</th>}
                            <th className="green-header" style={{ backgroundColor: '#4CAF50', color: 'white', fontWeight: 'bold' }}>Số Đơn TT</th>
                            {visibleColumns.dsChot && <th className="green-header">DS Chốt</th>}
                            {visibleColumns.dsChotTT && <th className="green-header">DS Chốt (TT)</th>}
                            {visibleColumns.tiLeChot && <th className="yellow-header">Tỉ lệ chốt</th>}
                            {visibleColumns.tiLeChotTT && <th className="yellow-header">Tỉ lệ chốt (TT)</th>}
                            {visibleColumns.giaMess && <th className="yellow-header">Giá Mess</th>}
                            {visibleColumns.cps && <th className="yellow-header">CPS</th>}
                            {visibleColumns.cp_ds && <th className="yellow-header">%CP/DS</th>}
                            {visibleColumns.giaTBDon && <th className="yellow-header">Giá TB Đơn</th>}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="total-row">
                            {(visibleColumns.stt || visibleColumns.team || visibleColumns.marketing) && (
                              <td colSpan={(visibleColumns.stt ? 1 : 0) + (visibleColumns.team ? 1 : 0) + (visibleColumns.marketing ? 1 : 0)} className="text-center total-label">TỔNG CỘNG</td>
                            )}
                            {visibleColumns.mess && <td className="total-value">{fmtNum(processData.total.mess)}</td>}
                            {visibleColumns.cpqc && <td className="total-value">{fmtCurrency(processData.total.cpqc)}</td>}
                            {visibleColumns.orders && <td className="total-value">{fmtNum(processData.total.orders)}</td>}
                            {visibleColumns.soDonTT ? (
                              <td className="total-value" style={{ backgroundColor: processData.total.soDonTT > 0 ? '#e8f5e9' : 'transparent' }}>
                                {fmtNum(processData.total.soDonTT)}
                              </td>
                            ) : (
                              <td className="total-value" style={{ color: 'red' }}>HIDDEN</td>
                            )}
                            {visibleColumns.dsChot && <td className="total-value">{fmtCurrency(processData.total.dsChot)}</td>}
                            {visibleColumns.dsChotTT && <td className="total-value">{fmtCurrency(processData.total.dsChotTT)}</td>}
                            {visibleColumns.tiLeChot && <td className={`text-center total-value ${getRateClass(processData.total.tiLeChot)}`}>{fmtPct(processData.total.tiLeChot)}</td>}
                            {visibleColumns.tiLeChotTT && <td className={`text-center total-value ${getRateClass(processData.total.tiLeChotTT)}`}>{fmtPct(processData.total.tiLeChotTT)}</td>}
                            {visibleColumns.giaMess && <td className="total-value">{fmtCurrency(processData.total.giaMess)}</td>}
                            {visibleColumns.cps && <td className="total-value">{fmtCurrency(processData.total.cps)}</td>}
                            {visibleColumns.cp_ds && <td className="total-value">{fmtPct(processData.total.cp_ds)}</td>}
                            {visibleColumns.giaTBDon && <td className="total-value">{fmtCurrency(processData.total.giaTBDon)}</td>}
                          </tr>
                          {processData.rows.map((row, index) => (
                            <tr key={index}>
                              {visibleColumns.stt && <td className="text-center">{index + 1}</td>}
                              {visibleColumns.team && <td className="text-left">{row.team}</td>}
                              {visibleColumns.marketing && <td className="text-left">{row.name}</td>}
                              {visibleColumns.mess && <td>{fmtNum(row.mess)}</td>}
                              {visibleColumns.cpqc && <td>{fmtCurrency(row.cpqc)}</td>}
                              {visibleColumns.orders && <td>{fmtNum(row.orders)}</td>}
                              {visibleColumns.soDonTT ? (
                                <td title={`soDonTT=${row.soDonTT}`} style={{ backgroundColor: row.soDonTT > 0 ? '#e8f5e9' : 'transparent' }}>
                                  {fmtNum(row.soDonTT)}
                                </td>
                              ) : (
                                <td style={{ color: 'red' }}>HIDDEN</td>
                              )}
                              {visibleColumns.dsChot && <td>{fmtCurrency(row.dsChot)}</td>}
                              {visibleColumns.dsChotTT && <td>{fmtCurrency(row.dsChotTT)}</td>}
                              {visibleColumns.tiLeChot && <td className={`text-center ${getRateClass(row.tiLeChot)}`}>{fmtPct(row.tiLeChot)}</td>}
                              {visibleColumns.tiLeChotTT && <td className={`text-center ${getRateClass(row.tiLeChotTT)}`}>{fmtPct(row.tiLeChotTT)}</td>}
                              {visibleColumns.giaMess && <td>{fmtCurrency(row.giaMess)}</td>}
                              {visibleColumns.cps && <td className={getCpsCellStyle(row.cps)}>{fmtCurrency(row.cps)}</td>}
                              {visibleColumns.cp_ds && <td className={`text-center ${row.cp_ds > 33 ? 'bg-yellow' : ''}`}>{fmtPct(row.cp_ds)}</td>}
                              {visibleColumns.giaTBDon && <td>{fmtCurrency(row.giaTBDon)}</td>}
                            </tr>
                          ))}
                          {processData.rows.length === 0 && (
                            <tr>
                              <td colSpan={15} className="text-center" style={{ padding: '30px' }}>
                                Không có dữ liệu trong khoảng thời gian này
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                      {/* Date footer */}
                      <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                        {endDate ? new Date(endDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                      </div>

                      {/* Daily Breakdown */}
                      {processData.dailyData && processData.dailyData.length > 0 && processData.dailyData.map((dayData, dIdx) => (
                        <div key={dIdx} style={{ marginTop: '30px' }}>
                          <h3 style={{ borderBottom: '2px solid #2d7c2d', paddingBottom: '5px', marginBottom: '10px' }}>
                            {dayData.date.split('-').reverse().join('/')}
                          </h3>
                          <table className="report-table" style={{ marginTop: '10px' }}>
                            <thead>
                              <tr>
                                {visibleColumns.stt && <th className="green-header">STT</th>}
                                {visibleColumns.team && <th className="green-header">Team</th>}
                                {visibleColumns.marketing && <th className="green-header">Marketing</th>}
                                {visibleColumns.mess && <th className="green-header">Số Mess</th>}
                                {visibleColumns.cpqc && <th className="green-header">CPQC</th>}
                                {visibleColumns.orders && <th className="green-header">Số Đơn</th>}
                                <th className="green-header" style={{ backgroundColor: '#4CAF50', color: 'white', fontWeight: 'bold' }}>Số Đơn TT</th>
                                {visibleColumns.dsChot && <th className="green-header">DS Chốt</th>}
                                {visibleColumns.dsChotTT && <th className="green-header">DS Chốt (TT)</th>}
                                {visibleColumns.tiLeChot && <th className="yellow-header">Tỉ lệ chốt</th>}
                                {visibleColumns.tiLeChotTT && <th className="yellow-header">Tỉ lệ chốt (TT)</th>}
                                {visibleColumns.giaMess && <th className="yellow-header">Giá Mess</th>}
                                {visibleColumns.cps && <th className="yellow-header">CPS</th>}
                                {visibleColumns.cp_ds && <th className="yellow-header">%CP/DS</th>}
                                {visibleColumns.giaTBDon && <th className="yellow-header">Giá TB Đơn</th>}
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="total-row">
                                {(visibleColumns.stt || visibleColumns.team || visibleColumns.marketing) && (
                                  <td colSpan={(visibleColumns.stt ? 1 : 0) + (visibleColumns.team ? 1 : 0) + (visibleColumns.marketing ? 1 : 0)} className="text-center total-label">TỔNG CỘNG</td>
                                )}
                                {visibleColumns.mess && <td className="total-value">{fmtNum(dayData.total.mess)}</td>}
                                {visibleColumns.cpqc && <td className="total-value">{fmtCurrency(dayData.total.cpqc)}</td>}
                                {visibleColumns.orders && <td className="total-value">{fmtNum(dayData.total.orders)}</td>}
                                <td className="total-value" style={{ backgroundColor: dayData.total.soDonTT > 0 ? '#e8f5e9' : 'transparent', fontWeight: 'bold' }}>
                                  {fmtNum(dayData.total.soDonTT)}
                                </td>
                                {visibleColumns.dsChot && <td className="total-value">{fmtCurrency(dayData.total.dsChot)}</td>}
                                {visibleColumns.dsChotTT && <td className="total-value">{fmtCurrency(dayData.total.dsChotTT)}</td>}
                                {visibleColumns.tiLeChot && <td className={`text-center total-value ${getRateClass(dayData.total.tiLeChot)}`}>{fmtPct(dayData.total.tiLeChot)}</td>}
                                {visibleColumns.tiLeChotTT && <td className={`text-center total-value ${getRateClass(dayData.total.tiLeChotTT)}`}>{fmtPct(dayData.total.tiLeChotTT)}</td>}
                                {visibleColumns.giaMess && <td className="total-value">{fmtCurrency(dayData.total.giaMess)}</td>}
                                {visibleColumns.cps && <td className="total-value">{fmtCurrency(dayData.total.cps)}</td>}
                                {visibleColumns.cp_ds && <td className="total-value">{fmtPct(dayData.total.cp_ds)}</td>}
                                {visibleColumns.giaTBDon && <td className="total-value">{fmtCurrency(dayData.total.giaTBDon)}</td>}
                              </tr>
                              {dayData.rows.map((row, rIdx) => (
                                <tr key={rIdx}>
                                  {visibleColumns.stt && <td className="text-center">{rIdx + 1}</td>}
                                  {visibleColumns.team && <td className="text-left">{row.team}</td>}
                                  {visibleColumns.marketing && <td className="text-left">{row.name}</td>}
                                  {visibleColumns.mess && <td>{fmtNum(row.mess)}</td>}
                                  {visibleColumns.cpqc && <td>{fmtCurrency(row.cpqc)}</td>}
                                  {visibleColumns.orders && <td>{fmtNum(row.orders)}</td>}
                                  <td style={{ backgroundColor: row.soDonTT > 0 ? '#e8f5e9' : 'transparent' }}>
                                    {fmtNum(row.soDonTT)}
                                  </td>
                                  {visibleColumns.dsChot && <td>{fmtCurrency(row.dsChot)}</td>}
                                  {visibleColumns.dsChotTT && <td>{fmtCurrency(row.dsChotTT)}</td>}
                                  {visibleColumns.tiLeChot && <td className={`text-center ${getRateClass(row.tiLeChot)}`}>{fmtPct(row.tiLeChot)}</td>}
                                  {visibleColumns.tiLeChotTT && <td className={`text-center ${getRateClass(row.tiLeChotTT)}`}>{fmtPct(row.tiLeChotTT)}</td>}
                                  {visibleColumns.giaMess && <td>{fmtCurrency(row.giaMess)}</td>}
                                  {visibleColumns.cps && <td className={getCpsCellStyle(row.cps)}>{fmtCurrency(row.cps)}</td>}
                                  {visibleColumns.cp_ds && <td className={`text-center ${row.cp_ds > 33 ? 'bg-yellow' : ''}`}>{fmtPct(row.cp_ds)}</td>}
                                  {visibleColumns.giaTBDon && <td>{fmtCurrency(row.giaTBDon)}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* TAB 2: KPI Report */}
      {
        activeTab === 'KpiReport' && (
          <div id="KpiReport" className={`tab-content ${activeTab === 'KpiReport' ? 'active' : ''}`}>
            <div className="report-container">
              <div className="sidebar">
                <h3>Bộ lọc</h3>
                <label>Từ ngày:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
                <label>Đến ngày:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
                <h3>Team</h3>
                <div className="indent">
                  <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
                    <option value="ALL">Tất cả</option>
                    {teams.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="main-content-area">
                <div className="header">
                  <div style={{ width: 60, height: 60, borderRadius: '50%', backgroundColor: '#2d7c2d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '24px', fontWeight: 'bold' }}>MKT</div>
                  <h2>BÁO CÁO HIỆU SUẤT KPI</h2>
                </div>
                <div className="table-responsive-container">
                  {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center' }}>Đang tải dữ liệu...</div>
                  ) : (
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th className="green-header">STT</th>
                          <th className="green-header">Team</th>
                          <th className="green-header">Marketing</th>
                          <th className="green-header">CPQC</th>
                          <th className="green-header">DS Chốt</th>
                          <th className="blue-header">DS Chốt (TT)</th>
                          <th className="blue-header">Số đơn hủy (TT)</th>
                          <th className="blue-header">Doanh số Hủy (TT)</th>
                          <th className="blue-header">DS Thành Công (TT)</th>
                          <th className="yellow-header">%CP/DS</th>
                          <th className="yellow-header">% KPI</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="total-row">
                          <td colSpan={3} className="text-center">TỔNG CỘNG</td>
                          <td>{fmtCurrency(processData.total.cpqc)}</td>
                          <td>{fmtCurrency(processData.total.dsChot)}</td>
                          <td>{fmtCurrency(processData.total.dsChotTT)}</td>
                          <td>{fmtNum(processData.total.soDonHuyTT)}</td>
                          <td>{fmtCurrency(processData.total.dsHuyTT)}</td>
                          <td>{fmtCurrency(processData.total.dsThanhCongTT)}</td>
                          <td>{fmtPct(processData.total.cp_ds_sau_ship)}</td>
                          <td>{fmtPct(processData.total.kpi_percent)}</td>
                        </tr>
                        {processData.rows.map((row, index) => (
                          <tr key={index}>
                            <td className="text-center">{index + 1}</td>
                            <td>{row.team}</td>
                            <td>{row.name}</td>
                            <td>{fmtCurrency(row.cpqc)}</td>
                            <td>{fmtCurrency(row.dsChot)}</td>
                            <td>{fmtCurrency(row.dsChotTT)}</td>
                            <td>{fmtNum(row.soDonHuyTT)}</td>
                            <td>{fmtCurrency(row.dsHuyTT)}</td>
                            <td>{fmtCurrency(row.dsThanhCongTT)}</td>
                            <td className="text-center">{fmtPct(row.cp_ds_sau_ship)}</td>
                            <td className="text-center">{fmtPct(row.kpi_percent)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* TAB 3: Hieu Suat KPI - Legacy Iframe */}
      {
        activeTab === 'HieuSuatKPI' && (
          <div style={{ width: '100%', height: 'calc(100vh - 100px)' }}>
            <iframe
              src="/baocaokpiCEO.html"
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Hiệu suất KPI"
            />
          </div>
        )
      }

      {/* TAB 4: Market Report */}
      {
        activeTab === 'MarketReport' && (
          <div id="MarketReport" className={`tab-content ${activeTab === 'MarketReport' ? 'active' : ''}`}>
            <div className="report-header">
              <div className="report-title">THỐNG KÊ HIỆU QUẢ MARKETING THEO SẢN PHẨM & THỊ TRƯỜNG</div>
            </div>
            <div className="filter-container">
              <div className="filter-group">
                <label>Từ ngày:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <label>Đến ngày:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <label>Team:</label>
                <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
                  <option value="ALL">Tất cả</option>
                  {teams.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label>Sản phẩm:</label>
                <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
                  <option value="ALL">Tất cả</option>
                  {products.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label>Thị trường:</label>
                <select value={selectedMarket} onChange={e => setSelectedMarket(e.target.value)}>
                  <option value="ALL">Tất cả</option>
                  {markets.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button
                onClick={fetchData}
                style={{
                  background: '#2d7c2d',
                  color: 'white',
                  border: 'none',
                  padding: '8px 15px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Áp dụng
              </button>
            </div>

            <div className="section-title">THỊ TRƯỜNG CHÂU Á</div>
            {renderMarketTable(processMarketData.asia, 'THỊ TRƯỜNG CHÂU Á')}
            {renderMarketTable(processMarketData.nonAsia, 'THỊ TRƯỜNG NGOÀI CHÂU Á')}
            {renderMarketTable(processMarketData.summary, 'TỔNG HỢP')}
          </div>
        )
      }

      {/* Column Settings Modal */}
      <ColumnSettingsModal
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        allColumns={[
          'stt', 'team', 'marketing', 'cpqc', 'mess', 'orders', 'soDonTT',
          'dsChot', 'dsChotTT', 'tiLeChot', 'tiLeChotTT', 'giaMess', 'cps',
          'cp_ds', 'giaTBDon', 'soDonHuy', 'dsHuy'
        ]}
        columnLabelMap={{
          stt: 'STT',
          team: 'Team',
          marketing: 'Marketing',
          cpqc: 'CPQC',
          mess: 'Số Mess',
          orders: 'Số Đơn',
          soDonTT: 'Số Đơn TT',
          dsChot: 'DS Chốt',
          dsChotTT: 'DS Chốt (TT)',
          tiLeChot: 'Tỉ lệ chốt',
          tiLeChotTT: 'Tỉ lệ chốt (TT)',
          giaMess: 'Giá Mess',
          cps: 'CPS',
          cp_ds: '%CP/DS',
          giaTBDon: 'Giá TB Đơn',
          soDonHuy: 'Số đơn Huỷ',
          dsHuy: 'DS Huỷ'
        }}
        visibleColumns={visibleColumns}
        onToggleColumn={(key) => {
          // Đảm bảo soDonTT luôn là true
          if (key === 'soDonTT') {
            return; // Không cho phép tắt soDonTT
          }
          setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
        }}
        onSelectAll={() => {
          const all = {};
          ['stt', 'team', 'marketing', 'cpqc', 'mess', 'orders', 'soDonTT',
            'dsChot', 'dsChotTT', 'tiLeChot', 'tiLeChotTT', 'giaMess', 'cps',
            'cp_ds', 'giaTBDon', 'soDonHuy', 'dsHuy'].forEach(key => {
              all[key] = true;
            });
          // Đảm bảo soDonTT luôn là true
          all.soDonTT = true;
          setVisibleColumns(all);
        }}
        onDeselectAll={() => {
          const none = {};
          ['stt', 'team', 'marketing', 'cpqc', 'mess', 'orders', 'soDonTT',
            'dsChot', 'dsChotTT', 'tiLeChot', 'tiLeChotTT', 'giaMess', 'cps',
            'cp_ds', 'giaTBDon', 'soDonHuy', 'dsHuy'].forEach(key => {
              none[key] = false;
            });
          setVisibleColumns(none);
        }}
        onResetDefault={() => {
          const defaultCols = {
            stt: true, team: true, marketing: true, mess: true, cpqc: true, orders: true,
            soDonTT: true, dsChot: true, dsChotTT: true, tiLeChot: true, tiLeChotTT: true,
            giaMess: true, cps: true, cp_ds: true, giaTBDon: true,
            soDonHuy: false, dsHuy: false
          };
          // Đảm bảo soDonTT luôn là true
          defaultCols.soDonTT = true;
          setVisibleColumns(defaultCols);
        }}
        defaultColumns={['stt', 'team', 'marketing', 'mess', 'cpqc', 'orders', 'soDonTT',
          'dsChot', 'dsChotTT', 'tiLeChot', 'tiLeChotTT', 'giaMess', 'cps',
          'cp_ds', 'giaTBDon']}
      />
    </div >
  );
}
