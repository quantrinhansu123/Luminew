import { RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';


import usePermissions from '../hooks/usePermissions';
import { isDateInRange } from '../utils/dateParsing';
import './BaoCaoSale.css';

import { supabase } from '../services/supabaseClient';

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


    // --- State ---
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false); // State for sync process
    const [deleting, setDeleting] = useState(false); // State for delete process
    const [rawData, setRawData] = useState([]);

    const [currentUserInfo, setCurrentUserInfo] = useState(null);
    const [isRestrictedView, setIsRestrictedView] = useState(false);

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
        return tab || 'sau-huy';
    });

    // Toggle visibility for filters
    const [showProductFilter, setShowProductFilter] = useState(false);
    const [showShiftFilter, setShowShiftFilter] = useState(true);
    const [showTeamFilter, setShowTeamFilter] = useState(true);
    const [showMarketFilter, setShowMarketFilter] = useState(true);

    // --- Sync F3 Logic ---
    const handleSyncF3Report = async () => {
        if (!window.confirm(`Bạn có chắc chắn muốn đồng bộ TOÀN BỘ dữ liệu Báo Cáo Sale từ F3?\n\n(Quá trình này có thể mất một chút thời gian nếu dữ liệu lớn)`)) return;

        try {
            setSyncing(true);
            // Updated URL provided by user
            const SALES_REPORT_URL = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/B%C3%A1o_c%C3%A1o_sale.json";
            console.log("Fetching Sales Report data from:", SALES_REPORT_URL);

            const response = await fetch(SALES_REPORT_URL);
            const dataRaw = await response.json();

            // Convert object to array
            let firebaseData = [];
            if (Array.isArray(dataRaw)) {
                firebaseData = dataRaw;
            } else if (dataRaw && typeof dataRaw === 'object') {
                firebaseData = Object.values(dataRaw);
            }

            if (firebaseData.length === 0) {
                alert("Không tìm thấy dữ liệu trên F3 (Báo cáo sale).");
                return;
            }

            // Filter for SALES REPORT items
            // Reverted Optimization: Sync ALL items as requested by user
            const reportItems = firebaseData.filter(item =>
                item["Email"] &&
                item["Ngày"]
            );

            console.log(`Found ${reportItems.length} sales report items (Full Sync).`);

            if (reportItems.length === 0) {
                alert("Không tìm thấy bản ghi báo cáo hợp lệ (cần có Email và Ngày).");
                return;
            }

            // Map to Supabase Columns
            const mappedItems = reportItems.map(item => {
                // Parse numbers safely
                const parseNum = (val) => parseFloat(String(val || 0).replace(/[^0-9.-]+/g, "")) || 0;

                return {
                    // NEW: Map Firebase ID
                    firebase_id: String(item["id"] || ""), // Ensure string

                    name: item["Tên"],
                    email: item["Email"],
                    team: item["Team"],
                    branch: item["Chi_nhánh"],
                    position: item["Chức vụ"] || item["Vị trí"], // Fallback if available

                    date: item["Ngày"], // Assumed YYYY-MM-DD or parseable
                    shift: item["Ca"],
                    product: item["Sản_phẩm"],
                    market: item["Thị_trường"],

                    // Metrics
                    mess_count: parseNum(item["Số_Mess"] || item["Số mess"] || item["mess_count"]),
                    response_count: parseNum(item["Phản_hồi"] || item["Phản hồi"] || item["response_count"]),
                    order_count: parseNum(item["Đơn Mess"] || item["Đơn_Mess"] || item["order_count"]),
                    revenue_mess: parseNum(item["Doanh_số_Mess"] || item["Doanh số Mess"] || item["revenue_mess"]),

                    order_cancel_count: parseNum(item["Số_đơn_Hoàn_huỷ"] || item["Số đơn hoàn hủy"]),
                    revenue_cancel: parseNum(item["Doanh_số_hoàn_huỷ"] || item["Doanh số hoàn hủy"]),

                    order_success_count: parseNum(item["Số_đơn_thành_công"] || item["Số đơn thành công"]),
                    revenue_success: parseNum(item["Doanh_số_thành_công"] || item["Doanh số thành công"]),

                    revenue_go: parseNum(item["Doanh_số_đi"] || item["Doanh số đi"]),

                    // ACTUAL METRICS (Correctly mapped)
                    order_count_actual: parseNum(item["Số_đơn_thực_tế"] || item["Số đơn thực tế"]),
                    revenue_actual: parseNum(item["Doanh_thu_chốt_thực_tế"] || item["Doanh thu chốt thực tế"]),

                    order_cancel_count_actual: parseNum(item["Số_đơn_hoàn_hủy_thực_tế"] || item["Số_đơn_hoàn_huỷ_thực_tế"]),
                    revenue_cancel_actual: parseNum(item["Doanh_số_hoàn_hủy_thực_tế"] || item["Doanh_số_hoàn_huỷ_thực_tế"]),

                    revenue_after_cancel_actual: parseNum(item["Doanh_số_sau_hoàn_hủy_thực_tế"]),
                    revenue_go_actual: parseNum(item["Doanh_số_đi_thực_tế"]),

                    // New Fields
                    customer_old: parseNum(item["Khách_cũ"]),
                    customer_new: parseNum(item["Khách_mới"]),
                    cross_sale: parseNum(item["Bán_chéo"]),
                    status: item["Trạng_thái"],
                    id_ns: item["id_NS"] || item["id_ns"],

                    // IDs
                    id_feedback: item["id_phản_hồi"] || item["id_phan_hoi"],
                    id_mess_count: item["id_số_mess"] || item["id_so_mess"],

                    // Metadata
                    updated_at: new Date().toISOString()
                };
            });

            // --- OPTIMIZED SYNC STRATEGY WITH UNIQUE ID ---

            // 0. DEDUPLICATION (Prioritize Firebase ID)
            const uniqueItemsMap = new Map();
            mappedItems.forEach(item => {
                if (item.firebase_id) {
                    uniqueItemsMap.set(item.firebase_id, item);
                } else {
                    // Fallback for items without ID
                    const key = `${item.email}|${item.date}|${item.product}`.toLowerCase();
                    uniqueItemsMap.set(key, item);
                }
            });
            const dedupedItems = Array.from(uniqueItemsMap.values());
            console.log(`Deduplication: Reduced from ${mappedItems.length} to ${dedupedItems.length} unique items.`);

            // 5. Execute Operations (Bulk Upsert directly on firebase_id)
            let successCount = 0;
            const BATCH_SIZE = 500;

            for (let i = 0; i < dedupedItems.length; i += BATCH_SIZE) {
                const batch = dedupedItems.slice(i, i + BATCH_SIZE);

                // Using firebase_id as the conflict target.
                const { error: upsertError } = await supabase
                    .from('sales_reports')
                    .upsert(batch, { onConflict: 'firebase_id', ignoreDuplicates: false });

                if (upsertError) {
                    console.error("Bulk Upsert Error:", upsertError);
                    if (upsertError.code === '42703') { // Undefined column
                        throw new Error("Cột 'firebase_id' chưa tồn tại. Vui lòng chạy script 'add_firebase_id_column.sql'.");
                    }
                    if (upsertError.code === '42P10') { // Invalid conflict target
                        throw new Error("Chưa có Unique Index cho 'firebase_id'. Vui lòng chạy script cập nhật.");
                    }
                    throw upsertError;
                }
                successCount += batch.length;
            }

            alert(`✅ Đã đồng bộ xong! (Tổng: ${dedupedItems.length} bản ghi)`);
            window.location.reload();

        } catch (error) {
            console.error("Sync Error:", error);
            alert(`❌ Lỗi đồng bộ: ${error.message}`);
        } finally {
            setSyncing(false);
        }
    };

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
        const fetchGlobalOptions = async () => {
            try {
                // Fetch distinct values for products, markets, teams, shifts from historical data
                // We'll fetch from the 'sales_reports' table
                const { data, error } = await supabase
                    .from('sales_reports')
                    .select('product, market, team, shift');

                if (error) throw error;

                const unique = (key) => [...new Set(data.map(d => d[key]).filter(Boolean))].sort();

                const globalProducts = unique('product');
                const globalMarkets = unique('market');
                const globalTeams = unique('team');
                const globalShifts = unique('shift');

                const newOptions = {
                    products: globalProducts,
                    markets: globalMarkets,
                    teams: globalTeams,
                    shifts: globalShifts
                };

                setOptions(newOptions);

                // Initialize filters with all options selected by default
                setFilters(prev => ({
                    ...prev,
                    products: globalProducts,
                    markets: globalMarkets,
                    teams: globalTeams,
                    shifts: globalShifts
                }));

            } catch (err) {
                console.warn('Could not fetch global options:', err);
            }
        };
        fetchGlobalOptions();
    }, []);

    // 3. Fetch Data
    useEffect(() => {
        const fetchData = async () => {
            // Wait for dates to be initialized
            if (!filters.startDate || !filters.endDate) return;

            setLoading(true);

            // --- TESTING MODE CHECK ---
            try {
                const settings = localStorage.getItem('system_settings');
                if (settings) {
                    const parsed = JSON.parse(settings);
                    if (parsed.dataSource === 'test') {
                        console.log("🔶 [TEST MODE] Loading Mock Data for Sale Report");
                        // Generate consistent mock data
                        const mockData = [
                            {
                                'Chức vụ': 'Sale Leader', 'Tên': 'Sale Leader Test', 'Email': 'leader@test.com', 'Team': 'Team Test 1', 'Chi nhánh': 'Hà Nội',
                                'Ngày': filters.endDate, 'Ca': 'Sáng', 'Sản phẩm': 'Sản phẩm A', 'Thị trường': 'VN',
                                'Số Mess': 50, 'Đơn Mess': 10, 'Doanh số Mess': 15000000, 'Phản hồi': 40,
                                'Doanh số đi': 15000000, 'Số đơn Hoàn huỷ': 2, 'Doanh số hoàn huỷ': 3000000,
                                'Số đơn thành công': 8, 'Doanh số thành công': 12000000,
                                'Số đơn thực tế': 10, 'Doanh thu chốt thực tế': 15000000,
                                'Số đơn hoàn hủy thực tế': 2, 'Doanh số hoàn hủy thực tế': 3000000, 'Doanh số sau hoàn hủy thực tế': 12000000
                            },
                            {
                                'Chức vụ': 'Sale Member', 'Tên': 'Sale Member 1', 'Email': 'member1@test.com', 'Team': 'Team Test 1', 'Chi nhánh': 'Hà Nội',
                                'Ngày': filters.endDate, 'Ca': 'Chiều', 'Sản phẩm': 'Sản phẩm A', 'Thị trường': 'VN',
                                'Số Mess': 30, 'Đơn Mess': 5, 'Doanh số Mess': 5000000, 'Phản hồi': 25,
                                'Doanh số đi': 5000000, 'Số đơn Hoàn huỷ': 0, 'Doanh số hoàn huỷ': 0,
                                'Số đơn thành công': 5, 'Doanh số thành công': 5000000,
                                'Số đơn thực tế': 5, 'Doanh thu chốt thực tế': 5000000,
                                'Số đơn hoàn hủy thực tế': 0, 'Doanh số hoàn hủy thực tế': 0, 'Doanh số sau hoàn hủy thực tế': 5000000
                            },
                            {
                                'Chức vụ': 'Sale Member', 'Tên': 'Sale Member 2', 'Email': 'member2@test.com', 'Team': 'Team Test 2', 'Chi nhánh': 'Hồ Chí Minh',
                                'Ngày': filters.endDate, 'Ca': 'Tối', 'Sản phẩm': 'Sản phẩm B', 'Thị trường': 'VN',
                                'Số Mess': 40, 'Đơn Mess': 8, 'Doanh số Mess': 12000000, 'Phản hồi': 35,
                                'Doanh số đi': 12000000, 'Số đơn Hoàn huỷ': 1, 'Doanh số hoàn huỷ': 1500000,
                                'Số đơn thành công': 7, 'Doanh số thành công': 10500000,
                                'Số đơn thực tế': 8, 'Doanh thu chốt thực tế': 12000000,
                                'Số đơn hoàn hủy thực tế': 1, 'Doanh số hoàn hủy thực tế': 1500000, 'Doanh số sau hoàn hủy thực tế': 10500000
                            }
                        ];

                        // Fake employee data for permissions check
                        const mockEmployeeData = [
                            { 'id': 'TEST-USER-ID', 'Họ Và Tên': 'Admin Test', 'Chức vụ': 'Admin', 'Email': 'admin@test.com', 'Team': 'All', 'Chi nhánh': 'All' }
                        ];

                        processFetchedData(mockData, mockEmployeeData);
                        setLoading(false);
                        return; // EXIT EARLY
                    }
                }
            } catch (e) {
                console.warn("Error checking test mode:", e);
            }
            // --------------------------

            try {
                // Call Supabase RPC
                const { data, error } = await supabase.rpc('get_sales_analytics', {
                    p_start_date: filters.startDate,
                    p_end_date: filters.endDate
                });

                if (error) throw error;

                // Transform data to match existing component logic
                const transformedData = (data || []).map(item => ({
                    'Tên': item["Tên"],
                    'Chức vụ': item["Chức vụ"],
                    'Email': item["Email"],
                    'Team': item["Team"],
                    'Chi nhánh': item["Chi nhánh"], // Adjust if case differs
                    'Ngày': item["Ngày"], // YYYY-MM-DD
                    'Ca': item["Ca"],
                    'Sản phẩm': item["Sản phẩm"],
                    'Thị trường': item["Thị trường"],

                    'Số Mess': item["Số Mess"],
                    'Phản hồi': item["Phản hồi"],
                    'Đơn Mess': item["Đơn Mess"],
                    'Doanh số Mess': item["Doanh số Mess"],

                    // Actual metrics
                    'Số đơn thực tế': item["Số đơn thực tế"],
                    'Doanh thu chốt thực tế': item["Doanh thu chốt thực tế"],
                    'Số đơn Hoàn huỷ': item["Số đơn Hoàn huỷ"],
                    'Doanh số hoàn huỷ': item["Doanh số hoàn huỷ"],
                    'Số đơn thành công': item["Số đơn thành công"],
                    'Doanh số thành công': item["Doanh số thành công"],

                    'Doanh số đi': item["Doanh số đi"],
                    'Doanh số đi thực tế': item["Doanh số đi thực tế"],
                    'Số đơn hoàn hủy thực tế': item["Số đơn hoàn hủy thực tế"],
                    'Doanh số hoàn hủy thực tế': item["Doanh số hoàn hủy thực tế"],
                    'Doanh số sau hoàn hủy thực tế': item["Doanh số sau hoàn hủy thực tế"]
                }));

                // Fetch employee list for permissions - reusing same fetch logic or simple supabase fetch
                // Efficiently get employee list (distinct users)
                // For now, let's just list unique users from the report or fetching profiles if needed.
                // The original code expected `employeeData`.
                // Let's create a minimal employee list from the report data itself for now to resolve permission logic.
                const uniqueEmployees = Array.from(new Map(transformedData.map(item => [item['Email'], item])).values());
                const employeeData = uniqueEmployees.map(u => ({
                    'id': u['Email'], // Mock ID using email
                    'Họ Và Tên': u['Tên'],
                    'Email': u['Email'],
                    'Chức vụ': u['Chức vụ'],
                    'Team': u['Team'],
                    'Chi nhánh': u['Chi nhánh'] || u['chi nhánh'],
                    'Vị trí': u['Chức vụ']
                }));

                processFetchedData(transformedData, employeeData);

            } catch (err) {
                console.error('Fetch Error:', err);
                // alert(`Đã xảy ra lỗi khi tải dữ liệu: ${err.message}`);
                // Don't alert detailed error to user, maybe show empty state or log
                setRawData([]);
            } finally {
                setLoading(false);
            }
        };

        const processFetchedData = (apiData, employeeData) => {
            // --- Permissions Logic based on URL Param 'id' ---
            const params = new URLSearchParams(window.location.search);
            const idFromUrl = params.get('id');

            let newPermissions = { ...permissions };
            let userInfo = null;

            if (idFromUrl) {
                // Existing logic for URL params...
                const currentUserRecord = employeeData.find(record => record['id'] === idFromUrl && record['Email']);
                if (currentUserRecord) {
                    setIsRestrictedView(true);
                    const cleanName = (currentUserRecord['Họ Và Tên'] || '').trim();
                    const userRole = (currentUserRecord['Chức vụ'] || currentUserRecord['Vị trí'] || '').trim();
                    const userBranch = (currentUserRecord['chi nhánh'] || currentUserRecord['Chi nhánh'] || '').trim() || 'Không xác định';
                    const userTeam = (currentUserRecord['Team'] || '').trim();

                    userInfo = { ten: cleanName, email: (currentUserRecord['Email'] || '').trim() };
                    setCurrentUserInfo(userInfo);

                    if (userRole === 'Sale Leader') {
                        newPermissions = {
                            allowedBranch: userBranch,
                            allowedTeam: null,
                            allowedNames: [],
                            title: `DỮ LIỆU CHI NHÁNH - ${userBranch}`
                        };
                    } else if (userRole === 'Leader') {
                        newPermissions = {
                            allowedBranch: null,
                            allowedTeam: userTeam ? userTeam.trim() : null,
                            allowedNames: [],
                            title: `DỮ LIỆU TEAM - ${userTeam}`
                        };
                    } else {
                        // NV or others
                        newPermissions = {
                            allowedBranch: null,
                            allowedTeam: null,
                            allowedNames: [cleanName],
                            title: `DỮ LIỆU CÁ NHÂN - ${cleanName}`
                        };
                    }
                } else {
                    newPermissions.title = 'KHÔNG TÌM THẤY DỮ LIỆU NGƯỜI DÙNG';
                }
            } else {
                // NEW: Automatic Restriction based on logged-in user
                const userJson = localStorage.getItem("user");
                const user = userJson ? JSON.parse(userJson) : null;
                const userName = localStorage.getItem("username") || user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || user?.username || user?.name || "";

                // Broader check: ANY role containing 'admin' or Manager/Director titles
                const userRole = (role || '').toLowerCase();
                const isManager = userRole.includes('admin') ||
                    ['director', 'manager'].includes(userRole) ||
                    String(userName || '').toLowerCase().includes('admin');

                if (!isManager && userName) {
                    setIsRestrictedView(true);
                    // Determine if Leader or Staff based on role/info (simplified)
                    // If we have employeeData matching userName, use it.
                    const matchedEmployee = employeeData.find(e =>
                        (e['Họ Và Tên'] || '').toLowerCase() === userName.toLowerCase() ||
                        (e['Email'] || '').toLowerCase() === (user?.email || '').toLowerCase()
                    );

                    if (matchedEmployee) {
                        const userRole = (matchedEmployee['Chức vụ'] || '').trim();
                        const userTeam = (matchedEmployee['Team'] || '').trim();

                        if (userRole.includes('Leader')) {
                            newPermissions = {
                                allowedBranch: null,
                                allowedTeam: userTeam,
                                allowedNames: [],
                                title: `DỮ LIỆU TEAM - ${userTeam}`
                            };
                        } else {
                            newPermissions = {
                                allowedBranch: null,
                                allowedTeam: null,
                                allowedNames: [matchedEmployee['Họ Và Tên']],
                                title: `DỮ LIỆU CÁ NHÂN - ${matchedEmployee['Họ Và Tên']}`
                            };
                        }
                    } else {
                        // Fallback: Filter by name only
                        newPermissions = {
                            allowedBranch: null,
                            allowedTeam: null,
                            allowedNames: [userName],
                            title: `DỮ LIỆU CÁ NHÂN - ${userName}`
                        };
                    }
                } else {
                    setIsRestrictedView(false);
                    newPermissions.title = 'DỮ LIỆU TỔNG HỢP';
                }
            }
            setPermissions(newPermissions);

            // --- Process Data ---
            const processed = (apiData || [])
                .filter(r => r['Tên'] && String(r['Tên']).trim() !== '' && r['Team'] && String(r['Team']).trim() !== '')
                .map(r => ({
                    chucVu: (r['Chức vụ'] || '').trim(),
                    ten: (r['Tên'] || '').trim(),
                    email: (r['Email'] || '').trim(),
                    team: (r['Team'] || '').trim(),
                    chiNhanh: (r['Chi nhánh'] || r['chi nhánh'] || '').trim() || 'Không xác định',
                    ngay: r['Ngày'],
                    ca: r['Ca'],
                    sanPham: r['Sản phẩm'],
                    thiTruong: r['Thị trường'],
                    soMessCmt: Number(r['Số Mess']) || 0,
                    soDon: Number(r['Đơn Mess']) || 0,
                    dsChot: Number(r['Doanh số Mess']) || 0,
                    phanHoi: Number(r['Phản hồi']) || 0,
                    doanhSoDi: Number(r['Doanh số đi']) || 0,
                    soDonHuy: Number(r['Số đơn Hoàn huỷ']) || 0,
                    doanhSoHuy: Number(r['Doanh số hoàn huỷ']) || 0,
                    soDonThanhCong: Number(r['Số đơn thành công']) || 0,
                    doanhSoThanhCong: Number(r['Doanh số thành công']) || 0,
                    soDonThucTe: Number(r['Số đơn thực tế']) || 0,
                    doanhThuChotThucTe: Number(r['Doanh thu chốt thực tế']) || 0,
                    doanhSoDiThucTe: Number(r['Doanh số đi thực tế']) || 0,
                    soDonHoanHuyThucTe: Number(r['Số đơn hoàn hủy thực tế']) || 0,
                    doanhSoHoanHuyThucTe: Number(r['Doanh số hoàn hủy thực tế']) || 0,
                    doanhSoSauHoanHuyThucTe: Number(r['Doanh số sau hoàn hủy thực tế']) || 0,
                    originalRecord: r // Keep ref if needed
                }));

            let visibleData = processed;
            if (isRestrictedView || idFromUrl) {
                visibleData = processed.filter(r => {
                    if (newPermissions.allowedBranch && r.chiNhanh.toLowerCase() !== newPermissions.allowedBranch.toLowerCase()) return false;
                    if (newPermissions.allowedTeam && r.team !== newPermissions.allowedTeam) return false;
                    if (newPermissions.allowedNames.length > 0 && !newPermissions.allowedNames.includes(r.ten)) return false;
                    return true;
                });
            }

            setRawData(visibleData);
            setLoading(false);
        };

        fetchData();
    }, [filters.startDate, filters.endDate]);

    // --- Filtering Logic ---
    const filteredData = useMemo(() => {
        if (loading) return [];
        return rawData.filter(r => {
            // Date Filter
            if (!isDateInRange(r.ngay, filters.startDate, filters.endDate)) return false;

            // Checkboxes
            if (!filters.products.includes(r.sanPham)) return false;
            if (!filters.markets.includes(r.thiTruong)) return false;
            if (!filters.shifts.includes(String(r.ca))) return false;
            if (!filters.teams.includes(String(r.team))) return false;

            return true;
        });
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
            doanhSoDi: 0, soDonHuy: 0, doanhSoHuy: 0,
            soDonThanhCong: 0, doanhSoThanhCong: 0,
            soDonThucTe: 0, doanhThuChotThucTe: 0, doanhSoDiThucTe: 0,
            soDonHoanHuyThucTe: 0, doanhSoHoanHuyThucTe: 0, doanhSoSauHoanHuyThucTe: 0
        };

        data.forEach(r => {
            if (!summary[r.ten]) {
                summary[r.ten] = {
                    name: r.ten, chiNhanh: r.chiNhanh, team: r.team, ...initial
                };
            }
            const s = summary[r.ten];
            s.mess += r.soMessCmt;
            s.don += r.soDon;
            s.chot += r.dsChot;
            s.phanHoi += r.phanHoi;
            s.soDonThucTe += r.soDonThucTe;
            s.doanhThuChotThucTe += r.doanhThuChotThucTe;
            s.soDonHoanHuyThucTe += r.soDonHoanHuyThucTe;
            s.doanhSoHoanHuyThucTe += r.doanhSoHoanHuyThucTe;
            s.doanhSoDi += r.doanhSoDi;
            s.soDonHuy += r.soDonHuy;
            s.doanhSoHuy += r.doanhSoHuy;
            s.soDonThanhCong += r.soDonThanhCong;
            s.doanhSoThanhCong += r.doanhSoThanhCong;
        });

        const flatList = Object.values(summary).sort((a, b) => a.team.localeCompare(b.team) || b.chot - a.chot || a.name.localeCompare(b.name));

        const total = flatList.reduce((acc, item) => {
            Object.keys(initial).forEach(k => acc[k] += item[k]);
            return acc;
        }, { ...initial });

        return { flatList, total };
    };



    // --- Derived Data for Rendering ---
    const { flatList: summaryList, total: summaryTotal } = useMemo(() => summarizeData(filteredData), [filteredData]);

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


    // --- Render Helpers ---
    const getRateClass = (rate) => rate >= 0.1 ? 'bg-green' : (rate > 0.05 ? 'bg-yellow' : '');

    if (!canView(permissionCode)) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
    }

    return (
        <div className="bao-cao-sale-container">
            {loading && <div className="loading-overlay">Đang tải dữ liệu...</div>}

            <div className="report-container">
                {/* SIDEBAR FILTERS */}
                <div className="sidebar">
                    <h3>Bộ lọc</h3>

                    {/* Excel Tools - Only for Internal Report Tab */}


                    <label>
                        Từ ngày:
                        <input type="date" value={filters.startDate} onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))} />
                    </label>
                    <label>
                        Đến ngày:
                        <input type="date" value={filters.endDate} onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))} />
                    </label>

                    {/* Product Filter */}
                    <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        Sản phẩm
                        <button
                            onClick={() => setShowProductFilter(!showProductFilter)}
                            style={{
                                fontSize: '0.75em',
                                padding: '2px 8px',
                                background: showProductFilter ? '#4A6E23' : '#f0f0f0',
                                color: showProductFilter ? '#fff' : '#666',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontWeight: '500',
                                transition: 'all 0.2s'
                            }}
                        >
                            {showProductFilter ? '▼' : '▶'}
                        </button>
                    </h3>
                    {showProductFilter && (
                        <>
                            <label>
                                <input type="checkbox"
                                    checked={filters.products.length === options.products.length}
                                    onChange={(e) => handleSelectAll('products', e.target.checked)}
                                /> Tất cả
                            </label>
                            <div className="indent">
                                {options.products.map(opt => (
                                    <label key={opt}>
                                        <input type="checkbox" checked={filters.products.includes(opt)} onChange={(e) => handleFilterChange('products', opt, e.target.checked)} />
                                        {opt}
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Shift Filter */}
                    <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        Ca
                        <button
                            onClick={() => setShowShiftFilter(!showShiftFilter)}
                            style={{
                                fontSize: '0.75em',
                                padding: '2px 8px',
                                background: showShiftFilter ? '#4A6E23' : '#f0f0f0',
                                color: showShiftFilter ? '#fff' : '#666',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontWeight: '500',
                                transition: 'all 0.2s'
                            }}
                        >
                            {showShiftFilter ? '▼' : '▶'}
                        </button>
                    </h3>
                    {showShiftFilter && (
                        <>
                            <label>
                                <input type="checkbox"
                                    checked={filters.shifts.length === options.shifts.length}
                                    onChange={(e) => handleSelectAll('shifts', e.target.checked)}
                                /> Tất cả
                            </label>
                            <div className="indent">
                                {options.shifts.map(opt => (
                                    <label key={opt}>
                                        <input type="checkbox" checked={filters.shifts.includes(opt)} onChange={(e) => handleFilterChange('shifts', opt, e.target.checked)} />
                                        {opt}
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Team Filter */}
                    <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        Team
                        <button
                            onClick={() => setShowTeamFilter(!showTeamFilter)}
                            style={{
                                fontSize: '0.75em',
                                padding: '2px 8px',
                                background: showTeamFilter ? '#4A6E23' : '#f0f0f0',
                                color: showTeamFilter ? '#fff' : '#666',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontWeight: '500',
                                transition: 'all 0.2s'
                            }}
                        >
                            {showTeamFilter ? '▼' : '▶'}
                        </button>
                    </h3>
                    {showTeamFilter && (
                        <>
                            <label>
                                <input type="checkbox"
                                    checked={filters.teams.length === options.teams.length}
                                    onChange={(e) => handleSelectAll('teams', e.target.checked)}
                                /> Tất cả
                            </label>
                            <div className="indent">
                                {options.teams.map(opt => (
                                    <label key={opt}>
                                        <input type="checkbox" checked={filters.teams.includes(opt)} onChange={(e) => handleFilterChange('teams', opt, e.target.checked)} />
                                        {opt}
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Market Filter */}
                    <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        Thị trường
                        <button
                            onClick={() => setShowMarketFilter(!showMarketFilter)}
                            style={{
                                fontSize: '0.75em',
                                padding: '2px 8px',
                                background: showMarketFilter ? '#4A6E23' : '#f0f0f0',
                                color: showMarketFilter ? '#fff' : '#666',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontWeight: '500',
                                transition: 'all 0.2s'
                            }}
                        >
                            {showMarketFilter ? '▼' : '▶'}
                        </button>
                    </h3>
                    {showMarketFilter && (
                        <>
                            <label>
                                <input type="checkbox"
                                    checked={filters.markets.length === options.markets.length}
                                    onChange={(e) => handleSelectAll('markets', e.target.checked)}
                                /> Tất cả
                            </label>
                            <div className="indent">
                                {options.markets.map(opt => (
                                    <label key={opt}>
                                        <input type="checkbox" checked={filters.markets.includes(opt)} onChange={(e) => handleFilterChange('markets', opt, e.target.checked)} />
                                        {opt}
                                    </label>
                                ))}
                            </div>
                        </>
                    )}



                </div>

                {/* MAIN CONTENT */}
                <div className="main-detailed">
                    <div className="header">
                        <img src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Ff930e667.%E1%BA%A2nh.025539.jpg" alt="Logo" />
                        <h2>{permissions.title}</h2>

                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
                            {/* <button className="btn-excel">
                                <FileSpreadsheet size={16} /> Xuất Excel
                            </button> */}
                            <button
                                onClick={handleDeleteAll}
                                disabled={deleting}
                                className="btn-delete-all"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    background: '#dc2626', color: 'white', border: 'none',
                                    padding: '8px 12px', borderRadius: '4px', cursor: 'pointer',
                                    opacity: deleting ? 0.7 : 1,
                                    fontWeight: '500',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}
                            >
                                <Trash2 size={16} />
                                {deleting ? "Đang xóa..." : "Xóa hết dữ liệu"}
                            </button>

                            <button
                                onClick={handleSyncF3Report}
                                disabled={syncing}
                                className="btn-sync"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    background: '#2563eb', color: 'white', border: 'none',
                                    padding: '8px 12px', borderRadius: '4px', cursor: 'pointer',
                                    opacity: syncing ? 0.7 : 1,
                                    fontWeight: '500',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}
                            >
                                <RefreshCw size={16} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
                                {syncing ? "Đang đồng bộ..." : "Đồng bộ Sale"}
                            </button>
                            <style>{`
                                @keyframes spin { 100% { transform: rotate(360deg); } }
                             `}</style>
                        </div>
                    </div>

                    <div className="tabs-container">
                        <button className={`tab-button ${activeTab === 'sau-huy' ? 'active' : ''}`} onClick={() => setActiveTab('sau-huy')}>Sale đã trừ hủy</button>
                        <button className={`tab-button ${activeTab === 'kpi-sale' ? 'active' : ''}`} onClick={() => setActiveTab('kpi-sale')}>KPIs Sale</button>
                        <button className={`tab-button ${activeTab === 'van-don-sale' ? 'active' : ''}`} onClick={() => setActiveTab('van-don-sale')}>Vận đơn Sale</button>
                        {currentUserInfo && (
                            <button className={`tab-button ${activeTab === 'thu-cong' ? 'active' : ''}`} onClick={() => setActiveTab('thu-cong')}>Báo cáo thủ công</button>
                        )}
                    </div>

                    {/* Tab 1: Sau Huy */}
                    <div className={`tab-content ${activeTab === 'sau-huy' ? 'active' : ''}`}>
                        <div className="table-responsive-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>STT</th><th>Chi nhánh</th><th>Team</th><th>Sale</th>
                                        <th>Số Mess</th><th>Phản hồi</th><th>Số đơn sau huỷ</th>
                                        <th>DS Sau Hủy TT</th><th>Tỉ lệ chốt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Total Row */}
                                    {(() => {
                                        const totalSoDon = summaryTotal.soDonThucTe - summaryTotal.soDonHoanHuyThucTe;
                                        const totalDS = summaryTotal.doanhThuChotThucTe - summaryTotal.doanhSoHoanHuyThucTe;
                                        const totalRate = summaryTotal.mess ? totalSoDon / summaryTotal.mess : 0;
                                        return (
                                            <tr className="total-row">
                                                <td className="total-label" colSpan={4}>TỔNG CỘNG</td>
                                                <td className="total-value">{formatNumber(summaryTotal.mess)}</td>
                                                <td className="total-value">{formatNumber(summaryTotal.phanHoi)}</td>
                                                <td className="total-value">{formatNumber(totalSoDon)}</td>
                                                <td className="total-value">{formatCurrency(totalDS)}</td>
                                                <td className="total-value">{formatPercent(totalRate)}</td>
                                            </tr>
                                        )
                                    })()}
                                    {/* Rows */}
                                    {summaryList.map((item, index) => {
                                        const soDon = item.soDonThucTe - item.soDonHoanHuyThucTe;
                                        const ds = item.doanhThuChotThucTe - item.doanhSoHoanHuyThucTe;
                                        const rate = item.mess ? soDon / item.mess : 0;
                                        return (
                                            <tr key={index} style={{ '--row-index': index }}>
                                                <td className="text-center">{index + 1}</td>
                                                <td className="text-left">{item.chiNhanh}</td>
                                                <td className="text-left">{item.team}</td>
                                                <td className="text-left">{item.name}</td>
                                                <td>{formatNumber(item.mess)}</td>
                                                <td>{formatNumber(item.phanHoi)}</td>
                                                <td>{formatNumber(soDon)}</td>
                                                <td>{formatCurrency(ds)}</td>
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
                                const totalSoDon = total.soDonThucTe - total.soDonHoanHuyThucTe;
                                const totalDS = total.doanhThuChotThucTe - total.doanhSoHoanHuyThucTe;
                                const totalRate = total.mess ? totalSoDon / total.mess : 0;

                                return (
                                    <div key={dayItem.date}>
                                        <h3>Chi tiết ngày: {dayItem.date}</h3>
                                        <div className="table-responsive-container">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>STT</th><th>Chi nhánh</th><th>Team</th><th>Sale</th>
                                                        <th>Số Mess</th><th>Phản hồi</th><th>Số đơn sau huỷ</th>
                                                        <th>DS Sau Hủy TT</th><th>Tỉ lệ chốt</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr className="total-row">
                                                        <td className="total-label" colSpan={4}>TỔNG NGÀY {dayItem.date}</td>
                                                        <td className="total-value">{formatNumber(total.mess)}</td>
                                                        <td className="total-value">{formatNumber(total.phanHoi)}</td>
                                                        <td className="total-value">{formatNumber(totalSoDon)}</td>
                                                        <td className="total-value">{formatCurrency(totalDS)}</td>
                                                        <td className="total-value">{formatPercent(totalRate)}</td>
                                                    </tr>
                                                    {flatList.map((item, index) => {
                                                        const soDon = item.soDonThucTe - item.soDonHoanHuyThucTe;
                                                        const ds = item.doanhThuChotThucTe - item.doanhSoHoanHuyThucTe;
                                                        const rate = item.mess ? soDon / item.mess : 0;
                                                        return (
                                                            <tr key={index}>
                                                                <td className="text-center">{index + 1}</td>
                                                                <td className="text-left">{item.chiNhanh}</td>
                                                                <td className="text-left">{item.team}</td>
                                                                <td className="text-left">{item.name}</td>
                                                                <td>{formatNumber(item.mess)}</td>
                                                                <td>{formatNumber(item.phanHoi)}</td>
                                                                <td>{formatNumber(soDon)}</td>
                                                                <td>{formatCurrency(ds)}</td>
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

                    {/* Tab 3: KPI Sale */}
                    <div className={`tab-content ${activeTab === 'kpi-sale' ? 'active' : ''}`}>
                        <iframe
                            src={`https://nguyenbatyads37.github.io/static-html-show-data/KPisale.html${window.location.search}`}
                            title="KPIs Sale"
                        />
                    </div>

                    {/* Tab 4: Van Don Sale */}
                    <div className={`tab-content ${activeTab === 'van-don-sale' ? 'active' : ''}`}>
                        <iframe
                            src={`https://nguyenbatyads37.github.io/static-html-show-data/Vandonsale.html${window.location.search}`}
                            title="Vận đơn Sale"
                        />
                    </div>

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
