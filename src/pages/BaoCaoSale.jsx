import { Trash2, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';


import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';
import { isDateInRange } from '../utils/dateParsing';
import './BaoCaoSale.css';

import { supabase } from '../services/supabaseClient';
import MultiSelect from '../components/MultiSelect';
import { fetchOrdersFromAPI, convertDateToAPIFormat } from '../services/ordersApiService';

const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN');
const formatPercent = (value) => {
    if (value === null || value === undefined || !Number.isFinite(+value)) return '0.00%';
    return `${(Number(value || 0) * 100).toFixed(2)}% `;
};
const formatDate = (dateValue) => {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return dateValue;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day} /${month}/${year} `;
};

export default function BaoCaoSale() {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // Context: 'RD' or null

    // Permission Logic
    const { canView, role } = usePermissions();
    const permissionCode = teamFilter === 'RD' ? 'RND_VIEW' : 'SALE_VIEW';

    // Kiểm tra xem user có phải Admin không (chỉ Admin mới thấy nút xóa)
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

    // Chỉ Admin thực sự (không bao gồm Finance) mới có quyền xóa toàn bộ
    const isAdminOnly = roleFromHookLower === 'admin' ||
        roleFromHookLower === 'super_admin' ||
        roleFromStorage === 'admin' ||
        roleFromStorage === 'super_admin' ||
        roleFromUserObj === 'admin' ||
        roleFromUserObj === 'super_admin';

    // Get user email for filtering
    const userEmail = localStorage.getItem('userEmail') || '';

    // Selected personnel names (từ cột selected_personnel trong users table)
    // null = chưa load, [] = đã load nhưng không có, [names] = đã load và có danh sách
    const [selectedPersonnelNames, setSelectedPersonnelNames] = useState(null);

    // --- State ---
    const [loading, setLoading] = useState(false); // Start as false since we don't auto-fetch

    const [deleting, setDeleting] = useState(false); // State for delete process
    const [rawData, setRawData] = useState([]);
    const [employeeData, setEmployeeData] = useState([]); // State for employee data for permissions/KPI

    const [currentUserInfo, setCurrentUserInfo] = useState(null);
    const [isRestrictedView, setIsRestrictedView] = useState(false);

    // Track xem người dùng đã thay đổi filter chưa
    const [userChangedFilter, setUserChangedFilter] = useState(false);

    // Filters State
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        products: [], // active selected
        shifts: [],
        teams: [],
        markets: []
    });

    // Options for filters (derived from data)
    const [options, setOptions] = useState({
        products: [],
        shifts: [],
        teams: [],
        markets: []
    });

    // Validations for Restricted View
    const [permissions, setPermissions] = useState({
        allowedNames: [],
        allowedTeam: null,
        allowedBranch: null,
        title: 'DỮ LIỆU TỔNG HỢP'
    });

    // Active Tab
    const [activeTab, setActiveTab] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        // Nếu tab là kpi-sale hoặc van-don-sale (đã bị ẩn), fallback về 'sau-huy'
        if (tab === 'kpi-sale' || tab === 'van-don-sale') {
            return 'sau-huy';
        }
        return tab || 'sau-huy';
    });

    // KPI Report Filters
    const [kpiFilters, setKpiFilters] = useState({
        team: [],
        personnel: [],
        products: [],
        markets: [],
        branches: [],
        includeShipZero: false
    });

    // KPI Column Visibility
    const [kpiColumnVisibility, setKpiColumnVisibility] = useState({
        soDonDSChot: true,
        soDonDSHuy: true,
        soDonDSSauHuy: true,
        soDonDSDi: true,
        soDonDThuTC: true,
        ship: true,
        dThuTinhKPI: true,
        tyLeThuTien: true
    });

    // Toggle visibility for filters
    const [showProductFilter, setShowProductFilter] = useState(false);
    const [showShiftFilter, setShowShiftFilter] = useState(true);
    const [showTeamFilter, setShowTeamFilter] = useState(false);
    const [showMarketFilter, setShowMarketFilter] = useState(false);
    const [showQuickFilter, setShowQuickFilter] = useState(false);
    
    // Collapse state for KPI filter panel
    const [isKpiFilterExpanded, setIsKpiFilterExpanded] = useState(false);

    // --- Sync F3 Logic DISABLED ---
    // User requested to remove Firebase integration.
    // handleSyncF3Report was removed.




    // --- Delete All Logic ---
    const handleDeleteAll = async () => {
        if (!window.confirm("⚠️ CẢNH BÁO: Bạn có chắc chắn muốn XÓA TOÀN BỘ dữ liệu báo cáo sale không?\n\nHành động này KHÔNG THỂ khôi phục!")) return;

        // Double Check
        const confirmation = prompt("Để xác nhận xóa, vui lòng nhập chính xác chữ: XOA DU LIEU");
        if (confirmation !== "XOA DU LIEU") {
            alert("Mã xác nhận không đúng. Đã hủy thao tác xóa.");
            return;
        }

        try {
            setDeleting(true);
            console.log("Deleting all records from sales_reports...");

            // Delete all records where ID is not null (effectively all)
            const { error } = await supabase
                .from('sales_reports')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Dummy UUID for filter

            if (error) throw error;

            alert("✅ Đã xóa toàn bộ dữ liệu thành công!");
            window.location.reload();

        } catch (err) {
            console.error("Delete All Error:", err);
            alert(`❌ Lỗi khi xóa dữ liệu: ${err.message}`);
        } finally {
            setDeleting(false);
        }
    };

    // --- Helper Functions ---




    // --- Effects ---

    // 1. Initialize Dates
    useEffect(() => {
        const today = new Date();
        // Default to Last 3 Days
        const d = new Date();
        d.setDate(d.getDate() - 3);
        const formatDateForInput = (date) => date.toISOString().split('T')[0];

        setFilters(prev => ({
            ...prev,
            startDate: formatDateForInput(d),
            endDate: formatDateForInput(today)
        }));
    }, []);

    // 2. Fetch Global Filter Options (Mount only)
    useEffect(() => {
        // Removed fetchGlobalOptions logic
    }, []);

    // Khởi tạo filters với 3 ngày gần nhất khi component mount (chỉ lần đầu)
    useEffect(() => {
        if (!userChangedFilter && !filters.startDate && !filters.endDate) {
            const today = new Date();
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(today.getDate() - 2); // 3 ngày: hôm nay, hôm qua, hôm kia

            const formatDateForInput = (date) => date.toISOString().split('T')[0];

            setFilters(prev => ({
                ...prev,
                startDate: formatDateForInput(threeDaysAgo),
                endDate: formatDateForInput(today)
            }));

            console.log('📅 [BaoCaoSale] Khởi tạo filters với 3 ngày gần nhất:', {
                startDate: formatDateForInput(threeDaysAgo),
                endDate: formatDateForInput(today)
            });
        }
    }, []); // Chỉ chạy một lần khi mount

    // Track khi người dùng thay đổi filter (cho date inputs)
    const handleDateFilterChange = (type, value) => {
        setUserChangedFilter(true);
        setFilters(prev => ({ ...prev, [type]: value }));
    };

    // Quick date filter handler
    const handleQuickDateFilter = (period) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let startDate = '';
        let endDate = '';
        
        switch(period) {
            case 'today':
                startDate = endDate = today.toISOString().split('T')[0];
                break;
            case 'yesterday':
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                startDate = endDate = yesterday.toISOString().split('T')[0];
                break;
            case 'thisWeek':
                const dayOfWeek = today.getDay();
                const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday = 1
                const monday = new Date(today);
                monday.setDate(today.getDate() + diff);
                monday.setHours(0, 0, 0, 0);
                startDate = monday.toISOString().split('T')[0];
                endDate = today.toISOString().split('T')[0];
                break;
            case 'lastWeek':
                const currentDayOfWeek = today.getDay();
                const lastWeekMonday = new Date(today);
                lastWeekMonday.setDate(today.getDate() - (currentDayOfWeek === 0 ? 13 : currentDayOfWeek + 6));
                lastWeekMonday.setHours(0, 0, 0, 0);
                const lastWeekSunday = new Date(lastWeekMonday);
                lastWeekSunday.setDate(lastWeekMonday.getDate() + 6);
                startDate = lastWeekMonday.toISOString().split('T')[0];
                endDate = lastWeekSunday.toISOString().split('T')[0];
                break;
            case 'thisMonth':
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                startDate = firstDay.toISOString().split('T')[0];
                endDate = lastDay.toISOString().split('T')[0];
                break;
            case 'lastMonth':
                const lastMonthFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const lastMonthLast = new Date(today.getFullYear(), today.getMonth(), 0);
                startDate = lastMonthFirst.toISOString().split('T')[0];
                endDate = lastMonthLast.toISOString().split('T')[0];
                break;
            default:
                return;
        }
        
        setFilters(prev => ({ ...prev, startDate, endDate }));
        setUserChangedFilter(true);
    };

    // Load selected personnel names from API sales_reports
    useEffect(() => {
        const loadSelectedPersonnel = async () => {
            try {
                if (isAdmin) {
                    // Admin không cần filter
                    setSelectedPersonnelNames([]); // Empty array = không filter
                    return;
                }

                // Fetch unique names from API sales_reports
                let allData = [];
                let nextAfterId = null;
                let hasMore = true;
                let fetchCount = 0;
                const maxFetches = 10; // Limit để tránh fetch quá nhiều

                while (hasMore && fetchCount < maxFetches) {
                    fetchCount++;
                    const params = new URLSearchParams();
                    if (nextAfterId) {
                        params.append('after_id', nextAfterId);
                    }
                    params.append('limit', '1000');

                    const url = `https://lumidataapi.vercel.app/sales_reports?${params.toString()}`;
                    
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const result = await response.json();
                    if (result.data && Array.isArray(result.data)) {
                        allData = [...allData, ...result.data];
                    }

                    // Check if there's more data
                    if (result.next_after_id && result.data && result.data.length > 0) {
                        nextAfterId = result.next_after_id;
                    } else {
                        hasMore = false;
                    }
                }

                // Extract unique names from API data
                const uniqueNames = [...new Set(
                    allData
                        .map(item => item.ten)
                        .filter(name => name && typeof name === 'string' && name.trim().length > 0)
                        .map(name => name.trim())
                )].sort();

                // If user has email, filter by email match
                let validNames = uniqueNames;
                if (userEmail) {
                    const userEmailLower = userEmail.toLowerCase().trim();
                    // Find names where email matches
                    const namesByEmail = allData
                        .filter(item => item.email && item.email.toLowerCase().trim() === userEmailLower)
                        .map(item => item.ten)
                        .filter(name => name && typeof name === 'string' && name.trim().length > 0)
                        .map(name => name.trim());

                    if (namesByEmail.length > 0) {
                        validNames = [...new Set(namesByEmail)].sort();
                    }
                }

                console.log('📝 [BaoCaoSale] Names loaded from API:', validNames);
                setSelectedPersonnelNames(validNames.length > 0 ? validNames : []); // Empty array nếu không có
            } catch (error) {
                console.error('❌ [BaoCaoSale] Error loading selected personnel from API:', error);
                setSelectedPersonnelNames([]); // Empty array nếu có lỗi
            }
        };

        loadSelectedPersonnel();
    }, [userEmail, isAdmin]);

    // 3. Fetch Data from API
    const fetchData = async () => {
        if (!filters.startDate || !filters.endDate) {
            alert('Vui lòng chọn khoảng thời gian');
            return;
        }

        setLoading(true);
        try {
            // Convert dates to API format (DD/MM/YYYY)
            const fromDate = convertDateToAPIFormat(filters.startDate);
            const toDate = convertDateToAPIFormat(filters.endDate);

            // Fetch data with date filtering from API (much faster!)
            let allData = [];
            let nextAfterId = null;
            let hasMore = true;
            let fetchCount = 0;
            const maxFetches = 100; // Safety limit to prevent infinite loops

            while (hasMore && fetchCount < maxFetches) {
                fetchCount++;
                const params = new URLSearchParams();
                params.append('from_date', fromDate);
                params.append('to_date', toDate);
                if (nextAfterId) {
                    params.append('after_id', nextAfterId);
                }
                // Add limit to reduce response size
                params.append('limit', '1000');

                const url = `https://lumidataapi.vercel.app/sales_reports?${params.toString()}`;
                
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                if (result.data && Array.isArray(result.data)) {
                    allData = [...allData, ...result.data];
                }

                // Check if there's more data
                if (result.next_after_id && result.data && result.data.length > 0) {
                    nextAfterId = result.next_after_id;
                } else {
                    hasMore = false;
                }
            }

            // Data is already filtered by date from API, but we can do a final check
            const filteredByDate = allData.filter(item => {
                if (!item.date) return false;
                const itemDate = new Date(item.date);
                const startDate = new Date(filters.startDate);
                const endDate = new Date(filters.endDate);
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                return itemDate >= startDate && itemDate <= endDate;
            });

            // Map API data to component format
            const processed = filteredByDate.map(item => ({
                chucVu: item.position || '',
                ten: item.ten || '',
                email: item.email || '',
                team: item.team || '',
                chiNhanh: item.branch || 'Không xác định',
                ngay: item.date || '',
                ca: item.ca || 'Hết ca',
                sanPham: item.san_pham || '',
                thiTruong: item.thi_truong || '',
                soMessCmt: Number(item.mess_count) || 0,
                soDon: 0, // Not available in API
                dsChot: 0, // Not available in API
                phanHoi: Number(item.response_count) || 0,
                doanhSoDi: Number(item.revenue_go_actual) || 0,
                soDonHuy: Number(item.order_cancel_count_actual) || 0,
                doanhSoHuy: Number(item.revenue_cancel_actual) || 0,
                soDonThanhCong: Number(item.order_success_count) || 0,
                doanhSoThanhCong: Number(item.revenue_success) || 0,
                soDonThucTe: Number(item.order_count) || 0,
                doanhThuChotThucTe: Number(item.revenue_actual) || 0,
                doanhSoDiThucTe: Number(item.revenue_go_actual) || 0,
                soDonHoanHuyThucTe: Number(item.order_cancel_count_actual) || 0,
                doanhSoHoanHuyThucTe: Number(item.revenue_cancel_actual) || 0,
                soDonTT: Number(item.order_count) || 0,
                doanhSoTT: Number(item.revenue_actual) || 0,
                doanhSoSauHuy: (Number(item.revenue_actual) || 0) - (Number(item.revenue_cancel_actual) || 0),
                originalRecord: item
            }));

            // Extract unique values for filters
            const uniqueProducts = [...new Set(processed.map(r => r.sanPham).filter(Boolean))].sort();
            const uniqueMarkets = [...new Set(processed.map(r => r.thiTruong).filter(Boolean))].sort();
            const uniqueTeams = [...new Set(processed.map(r => r.team).filter(Boolean))].sort();

            setOptions(prev => ({
                ...prev,
                products: uniqueProducts,
                markets: uniqueMarkets,
                teams: uniqueTeams
            }));

            console.log('✅ [BaoCaoSale] Data fetched successfully:', {
                totalRecords: processed.length,
                sampleRecords: processed.slice(0, 3).map(r => ({
                    ten: r.ten,
                    ngay: r.ngay,
                    mess: r.soMessCmt
                }))
            });

            setRawData(processed);
            setLoading(false);
        } catch (error) {
            console.error('❌ [BaoCaoSale] Error fetching data from API:', error);
            alert('Lỗi khi tải dữ liệu: ' + error.message);
            setLoading(false);
        }
    };

    // useEffect để kiểm tra điều kiện nhưng không auto-fetch
    useEffect(() => {
        // Chỉ kiểm tra điều kiện, không fetch tự động
        // Fetch chỉ khi user click nút "Xem"
        if (!isAdmin && selectedPersonnelNames === null) {
            console.log('⏳ [BaoCaoSale] Đợi selectedPersonnelNames được load...');
            return;
        }

        console.log('✅ [BaoCaoSale] selectedPersonnelNames đã sẵn sàng:', {
            isAdmin,
            selectedPersonnelNames,
            hasSelectedPersonnel: selectedPersonnelNames && selectedPersonnelNames.length > 0
        });

        // Tắt auto-fetch - chỉ fetch khi user click nút "Xem"
        // fetchData();
    }, [filters.startDate, filters.endDate, selectedPersonnelNames, isAdmin]);

    // Lưu selectedPersonnelNames vào localStorage để giữ lại khi component re-render hoặc filter thay đổi
    useEffect(() => {
        if (selectedPersonnelNames !== null && selectedPersonnelNames.length > 0) {
            localStorage.setItem('baoCaoSale_selectedPersonnelNames', JSON.stringify(selectedPersonnelNames));
            console.log('💾 [BaoCaoSale] Đã lưu selectedPersonnelNames vào localStorage:', selectedPersonnelNames);
        }
    }, [selectedPersonnelNames]);

    // Khôi phục selectedPersonnelNames từ localStorage khi filter thay đổi
    // Đảm bảo selectedPersonnelNames không bị mất khi ngày thay đổi
    useEffect(() => {
        if (!isAdmin) {
            const saved = localStorage.getItem('baoCaoSale_selectedPersonnelNames');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        // Chỉ cập nhật nếu selectedPersonnelNames là null hoặc empty
                        // Nếu đã có giá trị, giữ nguyên để không bị mất khi filter thay đổi
                        if (selectedPersonnelNames === null || (Array.isArray(selectedPersonnelNames) && selectedPersonnelNames.length === 0)) {
                            setSelectedPersonnelNames(parsed);
                            console.log('📝 [BaoCaoSale] Khôi phục selectedPersonnelNames từ localStorage:', parsed);
                        } else if (selectedPersonnelNames && selectedPersonnelNames.length > 0) {
                            // Đảm bảo selectedPersonnelNames không bị reset
                            console.log('✅ [BaoCaoSale] selectedPersonnelNames đã được giữ lại:', selectedPersonnelNames);
                        }
                    }
                } catch (e) {
                    console.warn('⚠️ [BaoCaoSale] Lỗi parse selectedPersonnelNames từ localStorage:', e);
                }
            }
        }
    }, [filters.startDate, filters.endDate, isAdmin]); // Chạy lại khi filter thay đổi

    // --- Filtering Logic ---
    const filteredData = useMemo(() => {
        if (loading) return [];

        console.log(`🔍 [BaoCaoSale] Filtering rawData:`, {
            rawDataLength: rawData.length,
            filters: {
                products: filters.products.length,
                markets: filters.markets.length,
                teams: filters.teams.length,
                startDate: filters.startDate,
                endDate: filters.endDate
            }
        });

        const filtered = rawData.filter(r => {
            const reasons = [];

            // Date Filter - Đảm bảo chỉ lọc theo ngày, không filter lại
            const isInDateRange = isDateInRange(r.ngay, filters.startDate, filters.endDate);
            if (!isInDateRange) {
                reasons.push(`date out of range (ngay: ${r.ngay}, start: ${filters.startDate}, end: ${filters.endDate})`);
            }

            // Nếu là record được thêm vào (originalRecord === null), bỏ qua filter products/markets
            // vì các records này có sanPham = '' và thiTruong = ''
            const isAddedRecord = r.originalRecord === null;

            // Checkboxes - chỉ filter khi filters có giá trị và không phải record được thêm vào
            if (!isAddedRecord) {
                // Chỉ filter khi filters.products có giá trị (length > 0)
                if (filters.products.length > 0 && !filters.products.includes(r.sanPham)) {
                    reasons.push(`product "${r.sanPham}" not in filters`);
                }
                // Chỉ filter khi filters.markets có giá trị (length > 0)
                if (filters.markets.length > 0 && !filters.markets.includes(r.thiTruong)) {
                    reasons.push(`market "${r.thiTruong}" not in filters`);
                }
            } else {
                // Log records được thêm vào
                console.log(`  📝 Record được thêm vào (bỏ qua filter products/markets): "${r.ten}"`);
            }

            // Bỏ filter theo Ca vì tất cả đều tự động là "Hết ca"
            // if (!filters.shifts.includes(String(r.ca))) return false;

            // Team filter - chỉ filter khi filters.teams có giá trị (length > 0)
            // Vẫn áp dụng cho cả records được thêm vào
            if (filters.teams.length > 0 && !filters.teams.includes(String(r.team))) {
                reasons.push(`team "${r.team}" not in filters`);
            }

            if (reasons.length > 0) {
                console.log(`  ❌ Loại bỏ record: "${r.ten}" - Lý do:`, reasons);
                return false;
            }

            return true;
        });

        console.log(`✅ [BaoCaoSale] Filtered data: ${filtered.length} records (từ ${rawData.length} records)`);

        // Log để debug
        if (filtered.length > 0) {
            const dates = [...new Set(filtered.map(r => r.ngay))].sort();
            console.log(`📊 Filtered data: ${filtered.length} records, date range: ${dates[0]} to ${dates[dates.length - 1]} (${dates.length} unique dates)`);
        } else {
            console.warn(`⚠️ [BaoCaoSale] Không có records nào sau khi filter!`);
        }

        return filtered;

        // Log để debug
        if (filtered.length > 0) {
            const dates = [...new Set(filtered.map(r => r.ngay))].sort();
            console.log(`📊 Filtered data: ${filtered.length} records, date range: ${dates[0]} to ${dates[dates.length - 1]} (${dates.length} unique dates)`);
        }

        return filtered;
    }, [rawData, filters, loading]);

    // --- Handlers ---
    const handleFilterChange = (type, value, checked) => {
        setFilters(prev => {
            const list = prev[type];
            if (checked) return { ...prev, [type]: [...list, value] };
            return { ...prev, [type]: list.filter(item => item !== value) };
        });
    };

    const handleSelectAll = (type, checked) => {
        setFilters(prev => ({
            ...prev,
            [type]: checked ? options[type] : []
        }));
    };

    // --- Summarization Logic ---
    const summarizeData = (data) => {
        const summary = {};
        const initial = {
            mess: 0, don: 0, chot: 0, phanHoi: 0,
            doanhSoDi: 0, soDonHuy: 0,
            soDonThanhCong: 0, doanhSoThanhCong: 0,
            soDonThucTe: 0, doanhThuChotThucTe: 0, doanhSoDiThucTe: 0,
            soDonHoanHuyThucTe: 0, doanhSoHoanHuyThucTe: 0, doanhSoSauHoanHuyThucTe: 0,
            doanhSoHuy: 0, // Doanh số hủy từ form nhập (revenue_cancel)
            soDonTT: 0, // Số đơn tổng từ bảng orders
            doanhSoTT: 0, // Tổng doanh số từ bảng orders (total_amount_vnd)
            doanhSoSauHuy: 0 // Doanh số sau hủy (tổng VNĐ của các đơn không phải Hủy)
        };

        // Log tổng số Mess trước khi tổng hợp
        const totalMessBeforeSummary = data.reduce((sum, r) => sum + (r.soMessCmt || 0), 0);
        console.log(`📊 Tổng số Mess trước khi tổng hợp theo tên: ${totalMessBeforeSummary} (từ ${data.length} records)`);

        data.forEach(r => {
            // Group by name only (like HTML file), but keep date info for display
            const name = r.ten || 'Không tên';
            
            if (!summary[name]) {
                summary[name] = {
                    name: name,
                    ngay: r.ngay ? formatDate(r.ngay) : 'N/A', // Keep first date for display
                    chiNhanh: r.chiNhanh, 
                    team: r.team, 
                    ...initial
                };
            }
            const s = summary[name];

            // Tính "Số Mess" và "Phản hồi" từ TẤT CẢ records
            // Vì "Số Mess" và "Phản hồi" đã được enrich độc lập từ sales_reports
            // cho cả actual records và empty records (từ enrichMessAndResponseFromSalesReports)
            s.mess += r.soMessCmt || 0;
            s.phanHoi += r.phanHoi || 0;

            // "Số đơn TT" giờ lấy từ input sales_reports
            s.soDonTT += r.soDonTT || 0;

            // Các giá trị khác
            s.don += r.soDon || 0;
            s.chot += r.dsChot || 0;
            s.soDonThucTe += r.soDonThucTe || 0;
            s.doanhThuChotThucTe += r.doanhThuChotThucTe || 0;
            // "Số đơn hoàn hủy thực tế" lấy từ record (đã được map từ sales_reports)
            s.soDonHoanHuyThucTe += r.soDonHuy || 0;
            s.doanhSoHoanHuyThucTe += r.doanhSoHoanHuyThucTe || 0;
            s.doanhSoHuy += r.doanhSoHuy || 0;
            s.doanhSoTT += r.doanhSoTT || 0;
            s.doanhSoSauHuy += r.doanhSoSauHuy || 0;
            s.doanhSoDi += r.doanhSoDi || 0;

            s.soDonHuy += r.soDonHuy || 0;
            s.soDonThanhCong += r.soDonThanhCong || 0;
            s.doanhSoThanhCong += r.doanhSoThanhCong || 0;
        });

        // Sort by team, then by chot (descending), then by name (like HTML file)
        const flatList = Object.values(summary).sort((a, b) => {
            // First by team
            const teamCompare = (a.team || '').localeCompare(b.team || '');
            if (teamCompare !== 0) return teamCompare;
            // Then by chot (descending)
            if (b.chot !== a.chot) return b.chot - a.chot;
            // Finally by name
            return (a.name || '').localeCompare(b.name || '');
        });

        const total = flatList.reduce((acc, item) => {
            Object.keys(initial).forEach(k => acc[k] += item[k]);
            return acc;
        }, { ...initial });

        // Log tổng số Mess sau khi tổng hợp
        console.log(`📊 Tổng số Mess sau khi tổng hợp theo tên: ${total.mess} (từ ${flatList.length} người)`);
        console.log(`📊 Tổng số Phản hồi sau khi tổng hợp: ${total.phanHoi}`);
        console.log(`📊 Tổng số đơn Hủy TT sau khi tổng hợp: ${total.soDonHoanHuyThucTe}`);
        // Log tổng số đơn hủy (giờ soDonHuy = soDonHoanHuyThucTe từ orders, không còn từ sales_reports)
        const totalSoDonHuyBeforeSummary = data.reduce((sum, r) => sum + (r.soDonHuy || 0), 0);
        const totalSoDonHoanHuyThucTeBeforeSummary = data.reduce((sum, r) => sum + (r.soDonHoanHuyThucTe || 0), 0);
        console.log(`📊 Tổng số đơn Hoàn huỷ (giờ = soDonHoanHuyThucTe từ orders) sau khi tổng hợp: ${total.soDonHuy} (từ ${flatList.length} người)`);
        console.log(`📊 Tổng số đơn Hoàn huỷ (giờ = soDonHoanHuyThucTe từ orders) trước khi tổng hợp: ${totalSoDonHuyBeforeSummary} (từ ${data.length} records)`);
        console.log(`📊 Tổng số đơn hoàn hủy thực tế (từ orders) trước khi tổng hợp: ${totalSoDonHoanHuyThucTeBeforeSummary} (từ ${data.length} records)`);

        if (totalMessBeforeSummary !== total.mess) {
            console.warn(`⚠️ CẢNH BÁO: Tổng số Mess không khớp! Trước = ${totalMessBeforeSummary}, Sau = ${total.mess}, Chênh lệch = ${totalMessBeforeSummary - total.mess}`);
        }
        if (totalSoDonHuyBeforeSummary !== total.soDonHuy) {
            console.warn(`⚠️ CẢNH BÁO: Tổng số đơn Hoàn huỷ (từ orders) không khớp! Trước = ${totalSoDonHuyBeforeSummary}, Sau = ${total.soDonHuy}, Chênh lệch = ${totalSoDonHuyBeforeSummary - total.soDonHuy}`);
        }
        if (totalSoDonHoanHuyThucTeBeforeSummary !== total.soDonHoanHuyThucTe) {
            console.warn(`⚠️ CẢNH BÁO: Tổng số đơn hoàn hủy thực tế (từ orders) không khớp! Trước = ${totalSoDonHoanHuyThucTeBeforeSummary}, Sau = ${total.soDonHoanHuyThucTe}, Chênh lệch = ${totalSoDonHoanHuyThucTeBeforeSummary - total.soDonHoanHuyThucTe}`);
        }

        return { flatList, total };
    };



    // --- Derived Data for Rendering ---
    const { flatList: summaryList, total: summaryTotal } = useMemo(() => {
        const result = summarizeData(filteredData);
        console.log('📊 [BaoCaoSale] Summary data:', {
            filteredDataLength: filteredData.length,
            summaryListLength: result.flatList.length,
            sampleItems: result.flatList.slice(0, 3)
        });
        return result;
    }, [filteredData]);

    // Group by Date for Breakdowns
    const dailyBreakdown = useMemo(() => {
        const groups = {};
        filteredData.forEach(r => {
            const d = formatDate(r.ngay); // dd/mm/yyyy
            if (!groups[d]) groups[d] = [];
            groups[d].push(r);
        });

        // Sort keys by date descending
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const [d1, m1, y1] = a.split('/').map(Number);
            const [d2, m2, y2] = b.split('/').map(Number);
            return new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
        });

        return sortedKeys.map(date => ({
            date,
            data: summarizeData(groups[date])
        }));
    }, [filteredData]);

    // --- KPI Report Calculation ---
    const [kpiReportData, setKpiReportData] = useState({ kpiData: [], kpiTotal: null });
    const [kpiLoading, setKpiLoading] = useState(false);

    useEffect(() => {
        if (activeTab !== 'bao-cao-kpis' || !filters.startDate || !filters.endDate) {
            setKpiReportData({ kpiData: [], kpiTotal: null });
            return;
        }

        // Removed calculateKPI logic
        setKpiLoading(false);
    }, [activeTab, filters.startDate, filters.endDate, kpiFilters, employeeData]);

    // --- Vận đơn Report Calculation ---
    const [vanDonReportData, setVanDonReportData] = useState({ vanDonData: [], vanDonTotal: null });
    const [vanDonLoading, setVanDonLoading] = useState(false);

    useEffect(() => {
        if (activeTab !== 'bao-cao-van-don' || !filters.startDate || !filters.endDate) {
            setVanDonReportData({ vanDonData: [], vanDonTotal: null });
            return;
        }

        // Removed calculateVanDon logic
        setVanDonLoading(false);
    }, [activeTab, filters.startDate, filters.endDate, kpiFilters]);

    // --- Render Helpers ---
    const getRateClass = (rate) => rate >= 0.1 ? 'bg-green' : (rate > 0.05 ? 'bg-yellow' : '');

    if (!canView(permissionCode)) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
    }

    return (
        <div className="bao-cao-sale-container">
            <div className="report-container">
                {/* MAIN CONTENT */}
                <div className="main-detailed" style={{ width: '100%' }}>
                    <div className="header">
                        <img src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Ff930e667.%E1%BA%A2nh.025539.jpg" alt="Logo" />
                        <h2>{permissions.title}</h2>

                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
                            {/* <button className="btn-excel">
                                <FileSpreadsheet size={16} /> Xuất Excel
                            </button> */}
                        </div>
                    </div>

                    <div className="tabs-container">
                        <button className={`tab-button ${activeTab === 'sau-huy' ? 'active' : ''}`} onClick={() => setActiveTab('sau-huy')}>Dữ liệu báo cáo</button>
                        <button className={`tab-button ${activeTab === 'du-lieu-tru-huy' ? 'active' : ''}`} onClick={() => setActiveTab('du-lieu-tru-huy')}>Dữ liệu trừ hủy</button>
                        <button className={`tab-button ${activeTab === 'bao-cao-kpis' ? 'active' : ''}`} onClick={() => setActiveTab('bao-cao-kpis')}>Báo cáo KPIs</button>
                        <button className={`tab-button ${activeTab === 'bao-cao-van-don' ? 'active' : ''}`} onClick={() => setActiveTab('bao-cao-van-don')}>Báo cáo Vận đơn</button>
                        {/* Ẩn 2 tab này */}
                        {/* <button className={`tab-button ${activeTab === 'kpi-sale' ? 'active' : ''}`} onClick={() => setActiveTab('kpi-sale')}>KPIs Sale</button> */}
                        {/* <button className={`tab-button ${activeTab === 'van-don-sale' ? 'active' : ''}`} onClick={() => setActiveTab('van-don-sale')}>Vận đơn Sale</button> */}
                        {currentUserInfo && (
                            <button className={`tab-button ${activeTab === 'thu-cong' ? 'active' : ''}`} onClick={() => setActiveTab('thu-cong')}>Báo cáo thủ công</button>
                        )}
                    </div>

                    {/* Tab 1: Sau Huy */}
                    <div className={`tab-content ${activeTab === 'sau-huy' ? 'active' : ''}`}>
                        {/* FILTERS BAR - Only in this tab */}
                        <div className="filters-bar">
                            <div className="filters-row">
                                {/* Quick Date Filter */}
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
                                            <button className="quick-filter-btn" onClick={() => { handleQuickDateFilter('today'); setShowQuickFilter(false); }}>Hôm nay</button>
                                            <button className="quick-filter-btn" onClick={() => { handleQuickDateFilter('yesterday'); setShowQuickFilter(false); }}>Hôm qua</button>
                                            <button className="quick-filter-btn" onClick={() => { handleQuickDateFilter('thisWeek'); setShowQuickFilter(false); }}>Tuần này</button>
                                            <button className="quick-filter-btn" onClick={() => { handleQuickDateFilter('lastWeek'); setShowQuickFilter(false); }}>Tuần trước</button>
                                            <button className="quick-filter-btn" onClick={() => { handleQuickDateFilter('thisMonth'); setShowQuickFilter(false); }}>Tháng này</button>
                                            <button className="quick-filter-btn" onClick={() => { handleQuickDateFilter('lastMonth'); setShowQuickFilter(false); }}>Tháng trước</button>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="filter-group date-group">
                                    <label>Từ ngày</label>
                                    <input type="date" value={filters.startDate} onChange={e => handleDateFilterChange('startDate', e.target.value)} />
                                </div>
                                <div className="filter-group date-group">
                                    <label>Đến ngày</label>
                                    <input type="date" value={filters.endDate} onChange={e => handleDateFilterChange('endDate', e.target.value)} />
                                </div>
                                
                                <div className="filter-group dropdown-group">
                                    <button 
                                        className="filter-dropdown-btn"
                                        onClick={() => setShowProductFilter(!showProductFilter)}
                                    >
                                        Sản phẩm {filters.products.length > 0 && filters.products.length < options.products.length ? `(${filters.products.length})` : ''}
                                        <span className="dropdown-arrow">{showProductFilter ? '▼' : '▶'}</span>
                                    </button>
                                    {showProductFilter && (
                                        <div className="filter-dropdown-content">
                                            <label className="select-all-label">
                                                <input type="checkbox"
                                                    checked={filters.products.length === options.products.length}
                                                    onChange={(e) => handleSelectAll('products', e.target.checked)}
                                                /> Tất cả
                                            </label>
                                            {options.products.map(opt => (
                                                <label key={opt}>
                                                    <input type="checkbox" checked={filters.products.includes(opt)} onChange={(e) => handleFilterChange('products', opt, e.target.checked)} />
                                                    {opt}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                <div className="filter-group dropdown-group">
                                    <button 
                                        className="filter-dropdown-btn"
                                        onClick={() => setShowTeamFilter(!showTeamFilter)}
                                    >
                                        Team {filters.teams.length > 0 && filters.teams.length < options.teams.length ? `(${filters.teams.length})` : ''}
                                        <span className="dropdown-arrow">{showTeamFilter ? '▼' : '▶'}</span>
                                    </button>
                                    {showTeamFilter && (
                                        <div className="filter-dropdown-content">
                                            <label className="select-all-label">
                                                <input type="checkbox"
                                                    checked={filters.teams.length === options.teams.length}
                                                    onChange={(e) => handleSelectAll('teams', e.target.checked)}
                                                /> Tất cả
                                            </label>
                                            {options.teams.map(opt => (
                                                <label key={opt}>
                                                    <input type="checkbox" checked={filters.teams.includes(opt)} onChange={(e) => handleFilterChange('teams', opt, e.target.checked)} />
                                                    {opt}
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
                                        Thị trường {filters.markets.length > 0 && filters.markets.length < options.markets.length ? `(${filters.markets.length})` : ''}
                                        <span className="dropdown-arrow">{showMarketFilter ? '▼' : '▶'}</span>
                                    </button>
                                    {showMarketFilter && (
                                        <div className="filter-dropdown-content">
                                            <label className="select-all-label">
                                                <input type="checkbox"
                                                    checked={filters.markets.length === options.markets.length}
                                                    onChange={(e) => handleSelectAll('markets', e.target.checked)}
                                                /> Tất cả
                                            </label>
                                            {options.markets.map(opt => (
                                                <label key={opt}>
                                                    <input type="checkbox" checked={filters.markets.includes(opt)} onChange={(e) => handleFilterChange('markets', opt, e.target.checked)} />
                                                    {opt}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                <div className="filter-group btn-group">
                                    <button
                                        onClick={() => {
                                            if (filters.startDate && filters.endDate) {
                                                fetchData();
                                            } else {
                                                alert('Vui lòng chọn khoảng thời gian');
                                            }
                                        }}
                                        disabled={loading || !filters.startDate || !filters.endDate}
                                        className="btn-view"
                                    >
                                        {loading ? 'Đang tải...' : '🔍 Xem'}
                                    </button>
                                </div>
                            </div>
                            
                            {/* API Link Display */}
                            {filters.startDate && filters.endDate && (
                                <div style={{
                                    marginTop: '15px',
                                    padding: '12px',
                                    backgroundColor: '#f8f9fa',
                                    border: '1px solid #dee2e6',
                                    borderRadius: '6px',
                                    fontSize: '13px'
                                }}>
                                    <div style={{ fontWeight: '600', marginBottom: '8px', color: '#495057' }}>
                                        🔗 Link API:
                                    </div>
                                    <div style={{
                                        wordBreak: 'break-all',
                                        padding: '8px',
                                        backgroundColor: '#fff',
                                        border: '1px solid #ced4da',
                                        borderRadius: '4px',
                                        fontFamily: 'monospace',
                                        fontSize: '12px',
                                        color: '#0066cc',
                                        cursor: 'pointer',
                                        userSelect: 'all'
                                    }}
                                    onClick={(e) => {
                                        e.target.select();
                                        navigator.clipboard.writeText(e.target.textContent);
                                        alert('Đã copy link API!');
                                    }}
                                    title="Click để copy"
                                    >
                                        {(() => {
                                            const params = new URLSearchParams();
                                            const fromDate = convertDateToAPIFormat(filters.startDate);
                                            const toDate = convertDateToAPIFormat(filters.endDate);
                                            params.append('from_date', fromDate);
                                            params.append('to_date', toDate);
                                            
                                            // Thêm các filter khác nếu có
                                            if (filters.products.length > 0) {
                                                filters.products.forEach(product => {
                                                    params.append('product', product);
                                                });
                                            }
                                            if (filters.markets.length > 0) {
                                                filters.markets.forEach(market => {
                                                    params.append('country', market);
                                                });
                                            }
                                            
                                            return `https://lumidataapi.vercel.app/sale_report?${params.toString()}`;
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="table-responsive-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>STT</th><th>Chi nhánh</th><th>Team</th><th>Sale</th>
                                        <th>Số Mess</th><th>Phản hồi</th><th>Số đơn hủy</th><th>Số đơn TT</th><th>Doanh số</th><th>Số đơn sau huỷ</th>
                                        <th>Tỉ lệ chốt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Total Row */}
                                    {(() => {
                                        const totalSoDonSauHuy = summaryTotal.soDonTT - summaryTotal.soDonHoanHuyThucTe;
                                        const totalRate = summaryTotal.mess ? totalSoDonSauHuy / summaryTotal.mess : 0;
                                        return (
                                            <tr className="total-row">
                                                <td className="total-label" colSpan={4}>TỔNG CỘNG</td>
                                                <td className="total-value">{formatNumber(summaryTotal.mess)}</td>
                                                <td className="total-value">{formatNumber(summaryTotal.phanHoi)}</td>
                                                <td className="total-value text-red-600">{formatNumber(summaryTotal.soDonHoanHuyThucTe)}</td>
                                                <td className="total-value">{formatNumber(summaryTotal.soDonTT)}</td>
                                                <td className="total-value">{formatCurrency(summaryTotal.doanhSoTT)}</td>
                                                <td className="total-value">{formatNumber(totalSoDonSauHuy)}</td>
                                                <td className="total-value">{formatPercent(totalRate)}</td>
                                            </tr>
                                        )
                                    })()}
                                    {/* Rows */}
                                    {summaryList.map((item, index) => {
                                        const soDonSauHuy = item.soDonTT - item.soDonHoanHuyThucTe;
                                        const rate = item.mess ? soDonSauHuy / item.mess : 0;
                                        return (
                                            <tr key={index} style={{ '--row-index': index }}>
                                                <td className="text-center">{index + 1}</td>
                                                <td className="text-left">{item.chiNhanh}</td>
                                                <td className="text-left">{item.team}</td>
                                                <td className="text-left">{item.name}</td>
                                                <td>{formatNumber(item.mess)}</td>
                                                <td>{formatNumber(item.phanHoi)}</td>
                                                <td className="text-red-600">{formatNumber(item.soDonHoanHuyThucTe)}</td>
                                                <td>{formatNumber(item.soDonTT)}</td>
                                                <td>{formatCurrency(item.doanhSoTT)}</td>
                                                <td>{formatNumber(soDonSauHuy)}</td>
                                                <td className={getRateClass(rate)}>{formatPercent(rate)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Daily Breakdown for Tab 1 */}
                        <div className="daily-breakdown">
                            {dailyBreakdown.map((dayItem) => {
                                const { total, flatList } = dayItem.data;
                                const totalSoDonSauHuy = total.soDonTT - total.soDonHoanHuyThucTe;
                                const totalRate = total.mess ? totalSoDonSauHuy / total.mess : 0;

                                return (
                                    <div key={dayItem.date}>
                                        <h3>Chi tiết ngày: {dayItem.date}</h3>
                                        <div className="table-responsive-container">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>STT</th><th>Chi nhánh</th><th>Team</th><th>Sale</th>
                                                        <th>Số Mess</th><th>Phản hồi</th><th>Số đơn hủy</th><th>Số đơn TT</th><th>Doanh số</th><th>Số đơn sau huỷ</th>
                                                        <th>Tỉ lệ chốt</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr className="total-row">
                                                        <td className="total-label" colSpan={5}>TỔNG NGÀY {dayItem.date}</td>
                                                        <td className="total-value">{formatNumber(total.mess)}</td>
                                                        <td className="total-value">{formatNumber(total.phanHoi)}</td>
                                                        <td className="total-value text-red-600">{formatNumber(total.soDonHoanHuyThucTe)}</td>
                                                        <td className="total-value">{formatNumber(total.soDonTT)}</td>
                                                        <td className="total-value">{formatCurrency(total.doanhSoTT)}</td>
                                                        <td className="total-value">{formatNumber(totalSoDonSauHuy)}</td>
                                                        <td className="total-value">{formatPercent(totalRate)}</td>
                                                    </tr>
                                                    {flatList.map((item, index) => {
                                                        const soDonSauHuy = item.soDonTT - item.soDonHoanHuyThucTe;
                                                        const rate = item.mess ? soDonSauHuy / item.mess : 0;
                                                        return (
                                                            <tr key={index}>
                                                                <td className="text-center">{index + 1}</td>
                                                                <td className="text-left">{item.chiNhanh}</td>
                                                                <td className="text-left">{item.team}</td>
                                                                <td className="text-left">{item.name}</td>
                                                                <td>{formatNumber(item.mess)}</td>
                                                                <td>{formatNumber(item.phanHoi)}</td>
                                                                <td className="text-red-600">{formatNumber(item.soDonHoanHuyThucTe)}</td>
                                                                <td>{formatNumber(item.soDonTT)}</td>
                                                                <td>{formatCurrency(item.doanhSoTT)}</td>
                                                                <td>{formatNumber(soDonSauHuy)}</td>
                                                                <td className={getRateClass(rate)}>{formatPercent(rate)}</td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Tab 2: Dữ liệu trừ hủy */}
                    <div className={`tab-content ${activeTab === 'du-lieu-tru-huy' ? 'active' : ''}`}>
                        <div className="table-responsive-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Chi nhánh</th>
                                        <th>Team</th>
                                        <th>Sale</th>
                                        <th>Số đơn hủy</th>
                                        <th>Số đơn TT</th>
                                        <th>Số đơn sau hủy</th>
                                        <th>Doanh số</th>
                                        <th>Doanh số sau hủy</th>
                                        <th>Tỉ lệ chốt</th>
                                        <th>Tỉ lệ hủy</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Total Row */}
                                    {(() => {
                                        const totalSoDonSauHuy = summaryTotal.soDonTT - summaryTotal.soDonHoanHuyThucTe;
                                        const totalTiLeChot = summaryTotal.mess ? summaryTotal.soDonTT / summaryTotal.mess : 0;
                                        const totalTiLeHuy = summaryTotal.soDonTT ? summaryTotal.soDonHoanHuyThucTe / summaryTotal.soDonTT : 0;
                                        return (
                                            <tr className="total-row">
                                                <td className="total-label" colSpan={4}>TỔNG CỘNG</td>
                                                <td className="total-value text-red-600">{formatNumber(summaryTotal.soDonHoanHuyThucTe)}</td>
                                                <td className="total-value">{formatNumber(summaryTotal.soDonTT)}</td>
                                                <td className="total-value">{formatNumber(totalSoDonSauHuy)}</td>
                                                <td className="total-value">{formatCurrency(summaryTotal.doanhSoTT)}</td>
                                                <td className="total-value">{formatCurrency(summaryTotal.doanhSoSauHuy)}</td>
                                                <td className="total-value">{formatPercent(totalTiLeChot)}</td>
                                                <td className="total-value">{formatPercent(totalTiLeHuy)}</td>
                                            </tr>
                                        )
                                    })()}
                                    {/* Rows */}
                                    {summaryList.map((item, index) => {
                                        const soDonSauHuy = item.soDonTT - item.soDonHoanHuyThucTe;
                                        const tiLeChot = item.mess ? item.soDonTT / item.mess : 0;
                                        const tiLeHuy = item.soDonTT ? item.soDonHoanHuyThucTe / item.soDonTT : 0;
                                        return (
                                            <tr key={index} style={{ '--row-index': index }}>
                                                <td className="text-center">{index + 1}</td>
                                                <td className="text-left">{item.chiNhanh}</td>
                                                <td className="text-left">{item.team}</td>
                                                <td className="text-left">{item.name}</td>
                                                <td className="text-red-600">{formatNumber(item.soDonHoanHuyThucTe)}</td>
                                                <td>{formatNumber(item.soDonTT)}</td>
                                                <td>{formatNumber(soDonSauHuy)}</td>
                                                <td>{formatCurrency(item.doanhSoTT)}</td>
                                                <td>{formatCurrency(item.doanhSoSauHuy)}</td>
                                                <td className={getRateClass(tiLeChot)}>{formatPercent(tiLeChot)}</td>
                                                <td className={getRateClass(tiLeHuy)}>{formatPercent(tiLeHuy)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Tab 3: Báo cáo KPIs */}
                    <div className={`tab-content ${activeTab === 'bao-cao-kpis' ? 'active' : ''}`}>
                        {/* KPI Filters - Collapsible */}
                        <div style={{ 
                            marginBottom: '20px', 
                            backgroundColor: '#f5f5f5', 
                            borderRadius: '8px',
                            border: '1px solid #e0e0e0',
                            overflow: 'hidden',
                            transition: 'all 0.3s ease'
                        }}>
                            {/* Header - Clickable */}
                            <div 
                                onClick={() => setIsKpiFilterExpanded(!isKpiFilterExpanded)}
                                style={{ 
                                    padding: '12px 15px',
                                    backgroundColor: '#2d5016',
                                    color: 'white',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    userSelect: 'none'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Filter size={18} />
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Chỉ số vận đơn của MKT</h3>
                                </div>
                                {isKpiFilterExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </div>

                            {/* Collapsible Content */}
                            <div 
                                style={{ 
                                    maxHeight: isKpiFilterExpanded ? '2000px' : '0',
                                    overflow: 'hidden',
                                    transition: 'max-height 0.3s ease-out',
                                    padding: isKpiFilterExpanded ? '15px' : '0 15px'
                                }}
                            >
                                {/* Quick Filters Row */}
                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                                    gap: '10px', 
                                    marginBottom: '15px' 
                                }}>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Bộ lọc nhanh:</label>
                                        <select style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px' }}>
                                            <option>Tất cả</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Từ ngày:</label>
                                        <input
                                            type="date"
                                            value={filters.startDate}
                                            onChange={e => handleDateFilterChange('startDate', e.target.value)}
                                            style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Đến ngày:</label>
                                        <input
                                            type="date"
                                            value={filters.endDate}
                                            onChange={e => handleDateFilterChange('endDate', e.target.value)}
                                            style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px' }}
                                        />
                                    </div>
                                </div>

                                {/* Main Filters Row */}
                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                                    gap: '10px', 
                                    marginBottom: '15px' 
                                }}>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Team:</label>
                                        <div style={{ position: 'relative', zIndex: 1002 }}>
                                            <MultiSelect
                                                label="Chọn Team..."
                                                options={(options.teams || []).filter(t => t && t.trim() !== '')}
                                                selected={kpiFilters.team || []}
                                                onChange={(vals) => {
                                                    setKpiFilters({ ...kpiFilters, team: vals });
                                                }}
                                                placeholder="Chọn Team..."
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Tìm tên:</label>
                                        <div style={{ position: 'relative', zIndex: 1002 }}>
                                            <MultiSelect
                                                label="Chọn tên..."
                                                options={(summaryList || []).map(item => item.name).filter(name => name && name.trim() !== '')}
                                                selected={kpiFilters.personnel || []}
                                                onChange={(vals) => {
                                                    setKpiFilters({ ...kpiFilters, personnel: vals });
                                                }}
                                                placeholder="Chọn tên..."
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Sản phẩm:</label>
                                        <div style={{ position: 'relative', zIndex: 1002 }}>
                                            <MultiSelect
                                                label="Chọn sản phẩm..."
                                                options={(options.products || []).filter(p => p && p.trim() !== '')}
                                                selected={kpiFilters.products || []}
                                                onChange={(vals) => {
                                                    setKpiFilters({ ...kpiFilters, products: vals });
                                                }}
                                                placeholder="Chọn sản phẩm..."
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Thị trường:</label>
                                        <div style={{ position: 'relative', zIndex: 1002 }}>
                                            <MultiSelect
                                                label="Chọn thị trường..."
                                                options={(options.markets || []).filter(m => m && m.trim() !== '')}
                                                selected={kpiFilters.markets || []}
                                                onChange={(vals) => {
                                                    setKpiFilters({ ...kpiFilters, markets: vals });
                                                }}
                                                placeholder="Chọn thị trường..."
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Chi nhánh:</label>
                                        <div style={{ position: 'relative', zIndex: 1002 }}>
                                            <MultiSelect
                                                label="Chọn chi nhánh..."
                                                options={[]}
                                                selected={kpiFilters.branches || []}
                                                onChange={(vals) => {
                                                    setKpiFilters({ ...kpiFilters, branches: vals });
                                                }}
                                                placeholder="Chọn chi nhánh..."
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div style={{ 
                                    display: 'flex', 
                                    gap: '10px', 
                                    alignItems: 'center', 
                                    marginBottom: '15px',
                                    flexWrap: 'wrap'
                                }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={kpiFilters.includeShipZero}
                                            onChange={e => setKpiFilters({ ...kpiFilters, includeShipZero: e.target.checked })}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        Bao gồm đơn ship = 0
                                    </label>
                                    <button
                                        onClick={() => {
                                            setKpiFilters({
                                                team: [],
                                                personnel: [],
                                                products: [],
                                                markets: [],
                                                branches: [],
                                                includeShipZero: false
                                            });
                                        }}
                                        style={{ 
                                            padding: '6px 12px', 
                                            backgroundColor: '#2d5016', 
                                            color: 'white', 
                                            border: 'none', 
                                            borderRadius: '4px', 
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            fontWeight: '500',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseOver={(e) => e.target.style.backgroundColor = '#1f3a0f'}
                                        onMouseOut={(e) => e.target.style.backgroundColor = '#2d5016'}
                                    >
                                        Hiện tất cả
                                    </button>
                                    <button
                                        onClick={() => {
                                            // Trigger recalculation
                                            setKpiFilters({ ...kpiFilters });
                                        }}
                                        style={{ 
                                            padding: '6px 12px', 
                                            backgroundColor: '#2d5016', 
                                            color: 'white', 
                                            border: 'none', 
                                            borderRadius: '4px', 
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            fontWeight: '500',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseOver={(e) => e.target.style.backgroundColor = '#1f3a0f'}
                                        onMouseOut={(e) => e.target.style.backgroundColor = '#2d5016'}
                                    >
                                        Làm mới
                                    </button>
                                </div>
                            </div>

                            {/* Column Visibility Options */}
                            <div style={{ marginTop: '15px' }}>
                                <label style={{ fontWeight: 'bold', marginBottom: '10px', display: 'block' }}>Tùy chọn hiển thị cột:</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input
                                            type="checkbox"
                                            checked={kpiColumnVisibility.soDonDSChot}
                                            onChange={e => setKpiColumnVisibility({ ...kpiColumnVisibility, soDonDSChot: e.target.checked })}
                                        />
                                        Số đơn & DS chốt
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input
                                            type="checkbox"
                                            checked={kpiColumnVisibility.soDonDSHuy}
                                            onChange={e => setKpiColumnVisibility({ ...kpiColumnVisibility, soDonDSHuy: e.target.checked })}
                                        />
                                        Số đơn & DS hủy
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input
                                            type="checkbox"
                                            checked={kpiColumnVisibility.soDonDSSauHuy}
                                            onChange={e => setKpiColumnVisibility({ ...kpiColumnVisibility, soDonDSSauHuy: e.target.checked })}
                                        />
                                        Số đơn & DS sau hủy
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input
                                            type="checkbox"
                                            checked={kpiColumnVisibility.soDonDSDi}
                                            onChange={e => setKpiColumnVisibility({ ...kpiColumnVisibility, soDonDSDi: e.target.checked })}
                                        />
                                        Số đơn & DS đi
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input
                                            type="checkbox"
                                            checked={kpiColumnVisibility.soDonDThuTC}
                                            onChange={e => setKpiColumnVisibility({ ...kpiColumnVisibility, soDonDThuTC: e.target.checked })}
                                        />
                                        Số đơn & DThu thành công
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input
                                            type="checkbox"
                                            checked={kpiColumnVisibility.ship}
                                            onChange={e => setKpiColumnVisibility({ ...kpiColumnVisibility, ship: e.target.checked })}
                                        />
                                        Ship
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input
                                            type="checkbox"
                                            checked={kpiColumnVisibility.dThuTinhKPI}
                                            onChange={e => setKpiColumnVisibility({ ...kpiColumnVisibility, dThuTinhKPI: e.target.checked })}
                                        />
                                        DThu tính KPI
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input
                                            type="checkbox"
                                            checked={kpiColumnVisibility.tyLeThuTien}
                                            onChange={e => setKpiColumnVisibility({ ...kpiColumnVisibility, tyLeThuTien: e.target.checked })}
                                        />
                                        Tỷ lệ thu tiền
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* KPI Table */}
                        <div className="table-responsive-container">
                            <table>
                                <thead>
                                    <tr style={{ backgroundColor: '#2d5016', color: 'white' }}>
                                        <th rowSpan={2} style={{ verticalAlign: 'middle' }}>STT</th>
                                        <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Nhân viên</th>
                                        <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Team</th>
                                        {kpiColumnVisibility.soDonDSChot && (
                                            <>
                                                <th colSpan="2" className="text-center">Số đơn và DS chốt</th>
                                            </>
                                        )}
                                        {kpiColumnVisibility.soDonDSHuy && (
                                            <>
                                                <th colSpan="2" className="text-center">Số đơn và DS hủy</th>
                                            </>
                                        )}
                                        {kpiColumnVisibility.soDonDSSauHuy && (
                                            <>
                                                <th colSpan="2" className="text-center">Số đơn và DS sau hủy</th>
                                            </>
                                        )}
                                        {kpiColumnVisibility.soDonDSDi && (
                                            <>
                                                <th colSpan="2" className="text-center">Số đơn và DS đi</th>
                                            </>
                                        )}
                                        {kpiColumnVisibility.soDonDThuTC && (
                                            <>
                                                <th colSpan="2" className="text-center">Số đơn và DThu thành công</th>
                                            </>
                                        )}
                                        {kpiColumnVisibility.ship && <th rowSpan={2} style={{ verticalAlign: 'middle', minWidth: '150px' }}>Ship</th>}
                                        {kpiColumnVisibility.dThuTinhKPI && <th rowSpan={2} style={{ verticalAlign: 'middle' }}>DThu tính KPI</th>}
                                        {kpiColumnVisibility.tyLeThuTien && <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Tỷ lệ thu tiền</th>}
                                    </tr>
                                    <tr style={{ backgroundColor: '#2d5016', color: 'white' }}>
                                        {kpiColumnVisibility.soDonDSChot && (
                                            <>
                                                <th>Số đơn</th>
                                                <th>DS chốt</th>
                                            </>
                                        )}
                                        {kpiColumnVisibility.soDonDSHuy && (
                                            <>
                                                <th>Số đơn</th>
                                                <th>DS hủy</th>
                                            </>
                                        )}
                                        {kpiColumnVisibility.soDonDSSauHuy && (
                                            <>
                                                <th>Số đơn</th>
                                                <th>DS sau hủy</th>
                                            </>
                                        )}
                                        {kpiColumnVisibility.soDonDSDi && (
                                            <>
                                                <th>Số đơn</th>
                                                <th>DS đi</th>
                                            </>
                                        )}
                                        {kpiColumnVisibility.soDonDThuTC && (
                                            <>
                                                <th>Số đơn</th>
                                                <th>DThu TC</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Total Row */}
                                    {kpiReportData.kpiTotal && (
                                        <tr className="total-row" style={{ backgroundColor: '#fffacd' }}>
                                            <td className="total-label" colSpan={3} style={{ fontWeight: 'bold' }}>TỔNG CỘNG</td>
                                            {kpiColumnVisibility.soDonDSChot && (
                                                <>
                                                    <td className="total-value">{formatNumber(kpiReportData.kpiTotal.soDonChot)}</td>
                                                    <td className="total-value">{formatCurrency(kpiReportData.kpiTotal.dsChot)}</td>
                                                </>
                                            )}
                                            {kpiColumnVisibility.soDonDSHuy && (
                                                <>
                                                    <td className="total-value">{formatNumber(kpiReportData.kpiTotal.soDonHuy)}</td>
                                                    <td className="total-value">{formatCurrency(kpiReportData.kpiTotal.dsHuy)}</td>
                                                </>
                                            )}
                                            {kpiColumnVisibility.soDonDSSauHuy && (
                                                <>
                                                    <td className="total-value">{formatNumber(kpiReportData.kpiTotal.soDonSauHuy)}</td>
                                                    <td className="total-value">{formatCurrency(kpiReportData.kpiTotal.dsSauHuy)}</td>
                                                </>
                                            )}
                                            {kpiColumnVisibility.soDonDSDi && (
                                                <>
                                                    <td className="total-value">{formatNumber(kpiReportData.kpiTotal.soDonDi)}</td>
                                                    <td className="total-value">{formatCurrency(kpiReportData.kpiTotal.dsDi)}</td>
                                                </>
                                            )}
                                            {kpiColumnVisibility.soDonDThuTC && (
                                                <>
                                                    <td className="total-value">{formatNumber(kpiReportData.kpiTotal.soDonTC)}</td>
                                                    <td className="total-value">{formatCurrency(kpiReportData.kpiTotal.dThuTC)}</td>
                                                </>
                                            )}
                                            {kpiColumnVisibility.ship && (
                                                <td className="total-value" style={{ whiteSpace: 'nowrap' }}>{formatCurrency(kpiReportData.kpiTotal.ship)}</td>
                                            )}
                                            {kpiColumnVisibility.dThuTinhKPI && (
                                                <td className="total-value">{formatCurrency(kpiReportData.kpiTotal.dThuTinhKPI)}</td>
                                            )}
                                            {kpiColumnVisibility.tyLeThuTien && (
                                                <td className="total-value">{formatPercent(kpiReportData.kpiTotal.tyLeThuTien)}</td>
                                            )}
                                        </tr>
                                    )}
                                    {/* Data Rows */}
                                    {kpiReportData.kpiData.length > 0 ? (
                                        kpiReportData.kpiData.map((item, index) => (
                                            <tr key={index}>
                                                <td className="text-center">{index + 1}</td>
                                                <td className="text-left">{item.name}</td>
                                                <td className="text-left">{item.team}</td>
                                                {kpiColumnVisibility.soDonDSChot && (
                                                    <>
                                                        <td>{formatNumber(item.soDonChot)}</td>
                                                        <td>{formatCurrency(item.dsChot)}</td>
                                                    </>
                                                )}
                                                {kpiColumnVisibility.soDonDSHuy && (
                                                    <>
                                                        <td>{formatNumber(item.soDonHuy)}</td>
                                                        <td>{formatCurrency(item.dsHuy)}</td>
                                                    </>
                                                )}
                                                {kpiColumnVisibility.soDonDSSauHuy && (
                                                    <>
                                                        <td>{formatNumber(item.soDonSauHuy)}</td>
                                                        <td>{formatCurrency(item.dsSauHuy)}</td>
                                                    </>
                                                )}
                                                {kpiColumnVisibility.soDonDSDi && (
                                                    <>
                                                        <td>{formatNumber(item.soDonDi)}</td>
                                                        <td>{formatCurrency(item.dsDi)}</td>
                                                    </>
                                                )}
                                                {kpiColumnVisibility.soDonDThuTC && (
                                                    <>
                                                        <td>{formatNumber(item.soDonTC)}</td>
                                                        <td>{formatCurrency(item.dThuTC)}</td>
                                                    </>
                                                )}
                                                {kpiColumnVisibility.ship && (
                                                    <td style={{ whiteSpace: 'nowrap' }}>{formatCurrency(item.ship)}</td>
                                                )}
                                                {kpiColumnVisibility.dThuTinhKPI && (
                                                    <td>{formatCurrency(item.dThuTinhKPI)}</td>
                                                )}
                                                {kpiColumnVisibility.tyLeThuTien && (
                                                    <td className={getRateClass(item.tyLeThuTien)}>{formatPercent(item.tyLeThuTien)}</td>
                                                )}
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={20} className="text-center py-4 text-gray-500">
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {!kpiLoading && kpiReportData.kpiData.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                Không có dữ liệu để hiển thị
                            </div>
                        )}
                    </div>

                    {/* Tab 4: Báo cáo Vận đơn */}
                    <div className={`tab-content ${activeTab === 'bao-cao-van-don' ? 'active' : ''}`}>
                        <h2 style={{ marginBottom: '20px', fontWeight: 'bold' }}>Báo cáo chi tiết</h2>

                        {/* Vận đơn Table */}
                        {vanDonReportData.vanDonData.length > 0 && (
                            <div className="table-responsive-container">
                                <table>
                                    <thead>
                                        <tr style={{ backgroundColor: '#2d5016', color: 'white' }}>
                                            <th>Tên NV</th>
                                            <th colSpan="2">Đã Thanh Toán (có bill)</th>
                                            <th colSpan="2">Bill 1 phần</th>
                                            <th>Tổng đơn lên nội bộ</th>
                                            <th>Tổng đơn đủ đkien đẩy vh</th>
                                            <th colSpan="2">Hoàn vận hành</th>
                                            <th>Tổng đơn lên vận hành chưa mã</th>
                                            <th>Đơn OK chưa đẩy đi</th>
                                            <th colSpan="2">Giao Thành Công</th>
                                            <th colSpan="2">Đang Giao</th>
                                            <th colSpan="2">Chưa Giao</th>
                                            <th colSpan="2">chờ check</th>
                                            <th colSpan="2">Trống trạng thái</th>
                                            <th>Tỷ lệ đơn lên vận hành</th>
                                            <th>Tỷ lệ thu tiền/giao thành công</th>
                                            <th>Tỷ lệ TT thành công/Đơn tính phí</th>
                                        </tr>
                                        <tr style={{ backgroundColor: '#2d5016', color: 'white' }}>
                                            <th></th>
                                            <th>Số đơn</th>
                                            <th>Thành Tiền</th>
                                            <th>Số đơn</th>
                                            <th>Thành Tiền</th>
                                            <th></th>
                                            <th></th>
                                            <th>Số đơn</th>
                                            <th>Thành Tiền</th>
                                            <th></th>
                                            <th></th>
                                            <th>Số đơn</th>
                                            <th>Thành Tiền</th>
                                            <th>Số đơn</th>
                                            <th>Thành Tiền</th>
                                            <th>Số đơn</th>
                                            <th>Thành Tiền</th>
                                            <th>Số đơn</th>
                                            <th>Thành Tiền</th>
                                            <th>Số đơn</th>
                                            <th>Thành Tiền</th>
                                            <th></th>
                                            <th></th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Total Row */}
                                        {vanDonReportData.vanDonTotal && (
                                            <tr className="total-row" style={{ backgroundColor: '#fffacd' }}>
                                                <td className="total-label" style={{ fontWeight: 'bold' }}>TỔNG CỘNG</td>
                                                <td className="total-value">{formatNumber(vanDonReportData.vanDonTotal.daThanhToanCoBill.soDon)}</td>
                                                <td className="total-value">{formatCurrency(vanDonReportData.vanDonTotal.daThanhToanCoBill.thanhTien)}</td>
                                                <td className="total-value">{formatNumber(vanDonReportData.vanDonTotal.billMotPhan.soDon)}</td>
                                                <td className="total-value">{formatCurrency(vanDonReportData.vanDonTotal.billMotPhan.thanhTien)}</td>
                                                <td className="total-value">{formatNumber(vanDonReportData.vanDonTotal.tongDonLenNoiBo)}</td>
                                                <td className="total-value">{formatNumber(vanDonReportData.vanDonTotal.tongDonDuDkienDayVh)}</td>
                                                <td className="total-value">{formatNumber(vanDonReportData.vanDonTotal.hoanVanHanh.soDon)}</td>
                                                <td className="total-value">{formatCurrency(vanDonReportData.vanDonTotal.hoanVanHanh.thanhTien)}</td>
                                                <td className="total-value">{formatNumber(vanDonReportData.vanDonTotal.tongDonLenVanHanhChuaMa)}</td>
                                                <td className="total-value">{formatNumber(vanDonReportData.vanDonTotal.donOKChuaDayDi)}</td>
                                                <td className="total-value">{formatNumber(vanDonReportData.vanDonTotal.giaoThanhCong.soDon)}</td>
                                                <td className="total-value">{formatCurrency(vanDonReportData.vanDonTotal.giaoThanhCong.thanhTien)}</td>
                                                <td className="total-value">{formatNumber(vanDonReportData.vanDonTotal.dangGiao.soDon)}</td>
                                                <td className="total-value">{formatCurrency(vanDonReportData.vanDonTotal.dangGiao.thanhTien)}</td>
                                                <td className="total-value">{formatNumber(vanDonReportData.vanDonTotal.chuaGiao.soDon)}</td>
                                                <td className="total-value">{formatCurrency(vanDonReportData.vanDonTotal.chuaGiao.thanhTien)}</td>
                                                <td className="total-value">{formatNumber(vanDonReportData.vanDonTotal.choCheck.soDon)}</td>
                                                <td className="total-value">{formatCurrency(vanDonReportData.vanDonTotal.choCheck.thanhTien)}</td>
                                                <td className="total-value">{formatNumber(vanDonReportData.vanDonTotal.trongTrangThai.soDon)}</td>
                                                <td className="total-value">{formatCurrency(vanDonReportData.vanDonTotal.trongTrangThai.thanhTien)}</td>
                                                <td className="total-value">{formatPercent(vanDonReportData.vanDonTotal.tyLeDonLenVanHanh)}</td>
                                                <td className="total-value">{formatPercent(vanDonReportData.vanDonTotal.tyLeThuTienGiaoThanhCong)}</td>
                                                <td className="total-value">{formatPercent(vanDonReportData.vanDonTotal.tyLeTTThanhCongDonTinhPhi)}</td>
                                            </tr>
                                        )}
                                        {/* Data Rows */}
                                        {vanDonReportData.vanDonData.map((item, index) => (
                                            <tr key={index}>
                                                <td className="text-left">{item.name}</td>
                                                <td>{formatNumber(item.daThanhToanCoBill.soDon)}</td>
                                                <td>{formatCurrency(item.daThanhToanCoBill.thanhTien)}</td>
                                                <td>{formatNumber(item.billMotPhan.soDon)}</td>
                                                <td>{formatCurrency(item.billMotPhan.thanhTien)}</td>
                                                <td>{formatNumber(item.tongDonLenNoiBo)}</td>
                                                <td>{formatNumber(item.tongDonDuDkienDayVh)}</td>
                                                <td>{formatNumber(item.hoanVanHanh.soDon)}</td>
                                                <td>{formatCurrency(item.hoanVanHanh.thanhTien)}</td>
                                                <td>{formatNumber(item.tongDonLenVanHanhChuaMa)}</td>
                                                <td>{formatNumber(item.donOKChuaDayDi)}</td>
                                                <td>{formatNumber(item.giaoThanhCong.soDon)}</td>
                                                <td>{formatCurrency(item.giaoThanhCong.thanhTien)}</td>
                                                <td>{formatNumber(item.dangGiao.soDon)}</td>
                                                <td>{formatCurrency(item.dangGiao.thanhTien)}</td>
                                                <td>{formatNumber(item.chuaGiao.soDon)}</td>
                                                <td>{formatCurrency(item.chuaGiao.thanhTien)}</td>
                                                <td>{formatNumber(item.choCheck.soDon)}</td>
                                                <td>{formatCurrency(item.choCheck.thanhTien)}</td>
                                                <td>{formatNumber(item.trongTrangThai.soDon)}</td>
                                                <td>{formatCurrency(item.trongTrangThai.thanhTien)}</td>
                                                <td className={getRateClass(item.tyLeDonLenVanHanh)}>{formatPercent(item.tyLeDonLenVanHanh)}</td>
                                                <td className={getRateClass(item.tyLeThuTienGiaoThanhCong)}>{formatPercent(item.tyLeThuTienGiaoThanhCong)}</td>
                                                <td className={getRateClass(item.tyLeTTThanhCongDonTinhPhi)}>{formatPercent(item.tyLeTTThanhCongDonTinhPhi)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {!vanDonLoading && vanDonReportData.vanDonData.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                Không có dữ liệu để hiển thị
                            </div>
                        )}
                    </div>

                    {/* Ẩn 2 tab này */}
                    {/* Tab 3: KPI Sale */}
                    {/* <div className={`tab-content ${activeTab === 'kpi-sale' ? 'active' : ''}`}>
                        <iframe
                            src={`https://nguyenbatyads37.github.io/static-html-show-data/KPisale.html${window.location.search}`}
                            title="KPIs Sale"
                        />
                    </div> */}

                    {/* Tab 4: Van Don Sale */}
                    {/* <div className={`tab-content ${activeTab === 'van-don-sale' ? 'active' : ''}`}>
                        <iframe
                            src={`https://nguyenbatyads37.github.io/static-html-show-data/Vandonsale.html${window.location.search}`}
                            title="Vận đơn Sale"
                        />
                    </div> */}

                    {/* Tab 5: Thu Cong */}
                    {
                        activeTab === 'thu-cong' && currentUserInfo && (
                            <div className={`tab-content active`}>
                                <iframe
                                    src={`https://nguyenbatyads37.github.io/static-html-show-data/baoCaoThuCong.html?hoten=${encodeURIComponent(currentUserInfo.ten)}&email=${encodeURIComponent(currentUserInfo.email)}&tableName=Báo cáo sale`}
                                    title="Báo cáo thủ công"
                                />
                            </div>
                        )
                    }



                </div>
            </div>
        </div >
    );
}
