import { Settings } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import ColumnSettingsModal from '../components/ColumnSettingsModal';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../supabase/config';
import { fetchSalesReportsFromAPI, convertDateToAPIFormat } from '../services/ordersApiService';
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
  const [selectedTeams, setSelectedTeams] = useState([]); // Multi-select Team filter for Detailed Report
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
  const [showQuickFilter, setShowQuickFilter] = useState(false);
  const [showTeamFilter, setShowTeamFilter] = useState(false);
  const [showProductFilter, setShowProductFilter] = useState(false);
  const [showShiftFilter, setShowShiftFilter] = useState(false);
  const [showMarketFilter, setShowMarketFilter] = useState(false);

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
    if (activeTab === 'DetailedReport' && teams.length > 0 && selectedTeams.length === 0) {
      setSelectedTeams([...teams]);
    }
    if (activeTab === 'DetailedReport' && shifts.length > 0 && selectedShifts.length === 0) {
      setSelectedShifts([...shifts]);
    }
    if (activeTab === 'DetailedReport' && markets.length > 0 && selectedMarkets.length === 0) {
      setSelectedMarkets([...markets]);
    }
  }, [products, teams, shifts, markets, activeTab, selectedTeams.length, selectedProducts.length, selectedShifts.length, selectedMarkets.length]);

  const fetchData = async () => {
    setLoading(true);
    try {
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

      console.log(`📡 Fetching detail_reports từ API...`);
      console.log(`📅 Date range: ${startDate} đến ${endDate}`);

      const apiResponse = await fetchSalesReportsFromAPI({
        from_date: convertDateToAPIFormat(startDate),
        to_date: convertDateToAPIFormat(endDate)
      });

      const normalizeApiRow = (item) => ({
        ...item,
        'Ngày': item['Ngày'] || item.ngay || item.date || '',
        'Team': item['Team'] || item.team || '',
        'Tên': item['Tên'] || item.ten || item.name || '',
        'Email': item['Email'] || item.email || '',
        'Sản_phẩm': item['Sản_phẩm'] || item['Sản phẩm'] || item.san_pham || item.product || '',
        'Thị_trường': item['Thị_trường'] || item['Thị trường'] || item.thi_truong || item.market || '',
        'CPQC': item['CPQC'] || item.cpqc || 0,
        'Số_Mess_Cmt': item['Số_Mess_Cmt'] || item['Số Mess Cmt'] || item.so_mess_cmt || item.mess_count || 0,
        'Số đơn': item['Số đơn'] || item['Số_đơn'] || item.so_don || item.order_count || 0,
        'Số đơn thực tế': item['Số đơn thực tế'] || item['Số_đơn_thực_tế'] || item.so_don_thuc_te || item.order_count_actual || 0,
        'Doanh số TT': item['Doanh số TT'] || item['Doanh số chốt TT'] || item.doanh_so_tt || 0,
        'Doanh số': item['Doanh số'] || item.doanh_so || item.revenue || 0,
        'Doanh thu chốt thực tế': item['Doanh thu chốt thực tế'] || item.doanh_thu_chot_thuc_te || item.revenue_actual || 0,
        'Số đơn hoàn hủy': item['Số đơn hoàn hủy'] || item.so_don_hoan_huy || item.order_cancel_count || 0,
        'Số đơn hoàn hủy thực tế': item['Số đơn hoàn hủy thực tế'] || item.so_don_hoan_huy_thuc_te || item.order_cancel_count_actual || 0,
        'Doanh số hoàn hủy thực tế': item['Doanh số hoàn hủy thực tế'] || item.doanh_so_hoan_huy_thuc_te || item.revenue_cancel_actual || 0,
        'DS sau hoàn hủy': item['DS sau hoàn hủy'] || item.ds_sau_hoan_huy || 0,
        'Doanh số sau hoàn hủy thực tế': item['Doanh số sau hoàn hủy thực tế'] || item.doanh_so_sau_hoan_huy_thuc_te || 0,
        'Doanh số sau ship': item['Doanh số sau ship'] || item.doanh_so_sau_ship || 0,
        'Doanh số TC': item['Doanh số TC'] || item.doanh_so_tc || 0,
        'KPIs': item['KPIs'] || item.kpis || 0,
        'ca': item['ca'] || item['Ca'] || item.ca || item.shift || ''
      });

      const allReports = (apiResponse?.data || []).map(normalizeApiRow);

      console.log(`✅ Fetched ${allReports.length} records từ /detail_reports`);

      // Debug: Log sample date format từ database
      if (allReports.length > 0) {
        const sampleDates = allReports.slice(0, 3).map(r => r['Ngày']);
        console.log(`📅 Sample dates từ DB:`, sampleDates);
        console.log(`📅 Date format check: startDate=${startDate}, endDate=${endDate}`);
      }

      // API đã lọc theo date, nhưng vẫn lọc lại ở client bằng parse date để tránh sai format
      let dateFilteredReports = allReports.filter(r => {
        const reportDate = parseSmartDate(r['Ngày']);
        if (!reportDate) return false;

        reportDate.setHours(0, 0, 0, 0);
        const start = startDate ? parseSmartDate(startDate) : null;
        const end = endDate ? parseSmartDate(endDate) : null;

        if (start) {
          start.setHours(0, 0, 0, 0);
          if (reportDate < start) return false;
        }

        if (end) {
          end.setHours(0, 0, 0, 0);
          if (reportDate > end) return false;
        }

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

      setData(dateFilteredReports);

      // Extract unique teams, products, markets from detail_reports
      // Tất cả dữ liệu đều lấy từ bảng detail_reports
      const uniqueTeams = [...new Set(dateFilteredReports.map(r => r['Team']).filter(Boolean))].sort();
      setTeams(uniqueTeams);
      setSelectedTeams(prev => {
        const next = prev.filter(v => uniqueTeams.includes(v));
        return next.length > 0 ? next : uniqueTeams;
      });

      const uniqueProducts = [...new Set(dateFilteredReports.map(r => r['Sản_phẩm']).filter(Boolean))].sort();
      setProducts(uniqueProducts);
      setSelectedProducts(prev => {
        const next = prev.filter(v => uniqueProducts.includes(v));
        return next.length > 0 ? next : uniqueProducts;
      });

      const uniqueMarkets = [...new Set(dateFilteredReports.map(r => r['Thị_trường']).filter(Boolean))].sort();
      setMarkets(uniqueMarkets);
      setSelectedMarkets(prev => {
        const next = prev.filter(v => uniqueMarkets.includes(v));
        return next.length > 0 ? next : uniqueMarkets;
      });

      // Extract unique shifts (Ca) from detail_reports
      const uniqueShifts = [...new Set(dateFilteredReports.map(r => r['ca']).filter(Boolean))].sort();
      setShifts(uniqueShifts);
      setSelectedShifts(prev => {
        const next = prev.filter(v => uniqueShifts.includes(v));
        return next.length > 0 ? next : uniqueShifts;
      });

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
    if (!data.length) {
      return {
        rows: [],
        total: {
          mess: 0, cpqc: 0, orders: 0, soDonTT: 0, dsChot: 0, dsChotTT: 0,
          tiLeChot: 0, tiLeChotTT: 0, giaMess: 0, cps: 0, cp_ds: 0, giaTBDon: 0
        },
        dailyData: []
      };
    }

    const rows = data
      .filter((row) => {
        if (selectedTeams.length > 0 && !selectedTeams.includes(row['Team'])) return false;
        if (selectedProducts.length > 0 && !selectedProducts.includes(row['Sản_phẩm'])) return false;
        if (selectedShifts.length > 0 && !selectedShifts.includes(row['ca'])) return false;
        if (selectedMarkets.length > 0 && !selectedMarkets.includes(row['Thị_trường'])) return false;
        return true;
      })
      .map((row) => ({
        team: row['Team'] || '',
        name: row['Tên'] || '',
        mess: Number(row['Số_Mess_Cmt'] || 0),
        cpqc: Number(row['CPQC'] || 0),
        orders: Number(row['Số đơn'] || 0),
        soDonTT: Number(row['Số đơn thực tế'] || 0),
        dsChot: Number(row['Doanh số'] || 0),
        dsChotTT: Number(row['Doanh thu chốt thực tế'] || 0),
        tiLeChot: Number(row['Tỉ lệ chốt'] || 0),
        tiLeChotTT: Number(row['Tỉ lệ chốt thực tế'] || row['Tỉ lệ chốt TT'] || 0),
        giaMess: Number(row['Giá Mess'] || 0),
        cps: Number(row['CPS'] || 0),
        cp_ds: Number(row['%CP/DS'] || 0),
        giaTBDon: Number(row['Giá TB Đơn'] || 0),
      }))
      .sort((a, b) => (a.team || '').localeCompare(b.team || '') || (a.name || '').localeCompare(b.name || ''));

    const total = rows.reduce((acc, cur) => ({
      mess: acc.mess + cur.mess,
      cpqc: acc.cpqc + cur.cpqc,
      orders: acc.orders + cur.orders,
      soDonTT: acc.soDonTT + cur.soDonTT,
      dsChot: acc.dsChot + cur.dsChot,
      dsChotTT: acc.dsChotTT + cur.dsChotTT,
      tiLeChot: 0,
      tiLeChotTT: 0,
      giaMess: 0,
      cps: 0,
      cp_ds: 0,
      giaTBDon: 0,
    }), {
      mess: 0, cpqc: 0, orders: 0, soDonTT: 0, dsChot: 0, dsChotTT: 0,
      tiLeChot: 0, tiLeChotTT: 0, giaMess: 0, cps: 0, cp_ds: 0, giaTBDon: 0
    });

    return { rows, total, dailyData: [] };
  }, [data, selectedTeams, selectedProducts, selectedShifts, selectedMarkets]);

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

    setStartDate(formatLocalDate(start));
    setEndDate(formatLocalDate(end));
  };

  const handleDateInputChange = (setter, value) => {
    setter(value);
    setQuickSelect('');
  };

  // Handle filter checkbox changes
  const handleFilterChange = (filterType, value, isChecked) => {
    if (filterType === 'team') {
      if (value === 'ALL') {
        setSelectedTeams(isChecked ? teams : []);
      } else {
        setSelectedTeams(prev =>
          isChecked ? [...prev, value] : prev.filter(t => t !== value)
        );
      }
    } else if (filterType === 'product') {
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

  const handleSelectAll = (filterType, isChecked) => {
    handleFilterChange(filterType, 'ALL', isChecked);
  };

  // Enrich Team từ bảng users nếu thiếu trong detail_reports
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

      // Bỏ lấy Team từ human_resources - chỉ lấy từ users

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
        console.log(`✅ Enriched Team for ${enrichedCount} reports from users`);
      }
    } catch (err) {
      console.error('❌ Error enriching Team from users:', err);
    }
  };

  // Fetch số đơn tổng (tất cả các đơn, không filter theo check_result) từ bảng orders cho MKT
  const enrichWithTotalOrdersFromOrders = async (reports, startDate, endDate) => {
    try {
      // Helper function để normalize date format (sử dụng LOCAL time)
      const normalizeDate = (date) => {
        if (!date) return '';
        if (date instanceof Date) {
          // Sử dụng local date thay vì toISOString() (UTC)
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
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
          // Thử parse - sử dụng local date
          const parsed = new Date(trimmed);
          if (!isNaN(parsed.getTime())) {
            const year = parsed.getFullYear();
            const month = String(parsed.getMonth() + 1).padStart(2, '0');
            const day = String(parsed.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
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
          item['Doanh số TT'] = 0;
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
        item['Doanh số TT'] = matchingData.totalAmount;

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
            <div className="main-content-area detailed-report-main">
              <div className="filters-bar mkt-sale-filters">
                <div className="filters-row">
                  <div className="filter-group dropdown-group">
                    <button
                      className="filter-dropdown-btn"
                      onClick={() => setShowQuickFilter(!showQuickFilter)}
                    >
                      Lọc nhanh
                      <span className="dropdown-arrow">{showQuickFilter ? '▼' : '▶'}</span>
                    </button>
                    {showQuickFilter && (
                      <div className="filter-dropdown-content">
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('today'); setShowQuickFilter(false); }}>Hôm nay</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('yesterday'); setShowQuickFilter(false); }}>Hôm qua</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('thisWeek'); setShowQuickFilter(false); }}>Tuần này</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('lastWeek'); setShowQuickFilter(false); }}>Tuần trước</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('thisMonth'); setShowQuickFilter(false); }}>Tháng này</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('lastMonth'); setShowQuickFilter(false); }}>Tháng trước</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('last7Days'); setShowQuickFilter(false); }}>7 ngày qua</button>
                        <button className="quick-filter-btn" onClick={() => { handleQuickDateSelect('last30Days'); setShowQuickFilter(false); }}>30 ngày qua</button>
                      </div>
                    )}
                  </div>

                  <div className="filter-group date-group">
                    <label>Từ ngày</label>
                    <input type="date" value={startDate} onChange={e => handleDateInputChange(setStartDate, e.target.value)} />
                  </div>

                  <div className="filter-group date-group">
                    <label>Đến ngày</label>
                    <input type="date" value={endDate} onChange={e => handleDateInputChange(setEndDate, e.target.value)} />
                  </div>

                  <div className="filter-group dropdown-group">
                    <button
                      className="filter-dropdown-btn"
                      onClick={() => setShowTeamFilter(!showTeamFilter)}
                    >
                      Team {selectedTeams.length > 0 && selectedTeams.length < teams.length ? `(${selectedTeams.length})` : ''}
                      <span className="dropdown-arrow">{showTeamFilter ? '▼' : '▶'}</span>
                    </button>
                    {showTeamFilter && (
                      <div className="filter-dropdown-content">
                        <label className="select-all-label">
                          <input
                            type="checkbox"
                            checked={teams.length > 0 && selectedTeams.length === teams.length}
                            onChange={e => handleSelectAll('team', e.target.checked)}
                          />
                          <span className="filter-option-text">Tất cả</span>
                        </label>
                        {teams.map(team => (
                          <label key={team}>
                            <input
                              type="checkbox"
                              checked={selectedTeams.includes(team)}
                              onChange={e => handleFilterChange('team', team, e.target.checked)}
                            />
                            <span className="filter-option-text">{team}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="filter-group dropdown-group">
                    <button
                      className="filter-dropdown-btn"
                      onClick={() => setShowProductFilter(!showProductFilter)}
                    >
                      Sản phẩm {selectedProducts.length > 0 && selectedProducts.length < products.length ? `(${selectedProducts.length})` : ''}
                      <span className="dropdown-arrow">{showProductFilter ? '▼' : '▶'}</span>
                    </button>
                    {showProductFilter && (
                      <div className="filter-dropdown-content">
                        <label className="select-all-label">
                          <input
                            type="checkbox"
                            checked={products.length > 0 && selectedProducts.length === products.length}
                            onChange={e => handleSelectAll('product', e.target.checked)}
                          />
                          <span className="filter-option-text">Tất cả</span>
                        </label>
                        {products.map(product => (
                          <label key={product}>
                            <input
                              type="checkbox"
                              checked={selectedProducts.includes(product)}
                              onChange={e => handleFilterChange('product', product, e.target.checked)}
                            />
                            <span className="filter-option-text">{product}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="filter-group dropdown-group">
                    <button
                      className="filter-dropdown-btn"
                      onClick={() => setShowShiftFilter(!showShiftFilter)}
                    >
                      Ca {selectedShifts.length > 0 && selectedShifts.length < shifts.length ? `(${selectedShifts.length})` : ''}
                      <span className="dropdown-arrow">{showShiftFilter ? '▼' : '▶'}</span>
                    </button>
                    {showShiftFilter && (
                      <div className="filter-dropdown-content">
                        <label className="select-all-label">
                          <input
                            type="checkbox"
                            checked={shifts.length > 0 && selectedShifts.length === shifts.length}
                            onChange={e => handleSelectAll('shift', e.target.checked)}
                          />
                          <span className="filter-option-text">Tất cả</span>
                        </label>
                        {shifts.map(shift => (
                          <label key={shift}>
                            <input
                              type="checkbox"
                              checked={selectedShifts.includes(shift)}
                              onChange={e => handleFilterChange('shift', shift, e.target.checked)}
                            />
                            <span className="filter-option-text">{shift}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="filter-group dropdown-group">
                    <button
                      className="filter-dropdown-btn"
                      onClick={() => setShowMarketFilter(!showMarketFilter)}
                    >
                      Thị trường {selectedMarkets.length > 0 && selectedMarkets.length < markets.length ? `(${selectedMarkets.length})` : ''}
                      <span className="dropdown-arrow">{showMarketFilter ? '▼' : '▶'}</span>
                    </button>
                    {showMarketFilter && (
                      <div className="filter-dropdown-content">
                        <label className="select-all-label">
                          <input
                            type="checkbox"
                            checked={markets.length > 0 && selectedMarkets.length === markets.length}
                            onChange={e => handleSelectAll('market', e.target.checked)}
                          />
                          <span className="filter-option-text">Tất cả</span>
                        </label>
                        {markets.map(market => (
                          <label key={market}>
                            <input
                              type="checkbox"
                              checked={selectedMarkets.includes(market)}
                              onChange={e => handleFilterChange('market', market, e.target.checked)}
                            />
                            <span className="filter-option-text">{market}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="filter-group btn-group">
                    <button
                      className="btn-view"
                      onClick={() => {
                        if (startDate && endDate) {
                          fetchData();
                        } else {
                          alert('Vui lòng chọn khoảng thời gian');
                        }
                      }}
                      disabled={loading || !startDate || !endDate}
                    >
                      {loading ? 'Đang tải...' : 'Xem'}
                    </button>
                  </div>
                </div>
              </div>

              <div>
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
