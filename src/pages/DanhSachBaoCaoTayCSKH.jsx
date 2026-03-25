import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';
import './BaoCaoSale.css'; // Reusing styles for consistency

// Helpers
const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN');
const formatDate = (dateValue) => {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return dateValue;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

const filterOptionsBySearch = (list, q) => {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) return list;
    return (list || []).filter((item) => String(item).toLowerCase().includes(needle));
};

/** YYYY-MM-DD theo giờ local — tránh lệch 1 ngày so với `toISOString()` (UTC). */
const formatLocalDateYMD = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export default function DanhSachBaoCaoTayCSKH() {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // 'RD' or null

    // Permission Logic
    const { canView, role, team: userTeam, permissions } = usePermissions();
    const permissionCode = 'CSKH_VIEW'; // CSKH uses CSKH_VIEW permission (same as XemBaoCaoCSKH)

    // Get user email and name for filtering
    const userEmail = localStorage.getItem('userEmail') || '';
    const userName = localStorage.getItem('username') || '';

    // Debug: Log permissions
    useEffect(() => {
        console.log('🔐 User Permissions:', {
            role,
            permissionCode,
            hasPermission: canView(permissionCode),
            allPermissions: permissions,
            userEmail,
            userName,
            userTeam
        });
    }, [role, permissionCode, permissions, userEmail, userName, userTeam]);

    // Kiểm tra xem user có phải Admin không (logic giống DanhSachDon.jsx)
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

    // Chỉ Admin thực sự (không bao gồm Finance) mới có quyền chỉnh team hàng loạt
    const isAdminOnly = roleFromHookLower === 'admin' ||
        roleFromHookLower === 'super_admin' ||
        roleFromStorage === 'admin' ||
        roleFromStorage === 'super_admin' ||
        roleFromUserObj === 'admin' ||
        roleFromUserObj === 'super_admin';

    const [loading, setLoading] = useState(true);
    const [manualReports, setManualReports] = useState([]);
    const [allReports, setAllReports] = useState([]); // Store all filtered reports for pagination
    const [realValuesMap, setRealValuesMap] = useState({}); // Map report ID to real values
    const [calculatingRealValues, setCalculatingRealValues] = useState(false);
    const [userChangedFilter, setUserChangedFilter] = useState(false); // Track if user changed filter
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        products: [],
        markets: [],
        personnel: []
    });
    const [teamSyncing, setTeamSyncing] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    // Available options for filters
    const [availableOptions, setAvailableOptions] = useState({
        products: [],
        markets: [],
        personnel: []
    });

    const [personnelSearch, setPersonnelSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [marketSearch, setMarketSearch] = useState('');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);

    // Edit State
    const [editingReport, setEditingReport] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);

    // Options for edit form
    const [editOptions, setEditOptions] = useState({
        products: [],
        markets: [],
        branches: [],
        shifts: ['Hết ca', 'Giữa ca']
    });

    // Map tên nhân sự -> email (lấy từ bảng nhân sự)
    const [hrEmailMap, setHrEmailMap] = useState({});

    // Selected personnel names (từ cột selected_personnel trong users table)
    const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]);

    const personnelFiltered = useMemo(
        () => filterOptionsBySearch(availableOptions.personnel, personnelSearch),
        [availableOptions.personnel, personnelSearch]
    );
    const productsFiltered = useMemo(
        () => filterOptionsBySearch(availableOptions.products, productSearch),
        [availableOptions.products, productSearch]
    );
    const marketsFiltered = useMemo(
        () => filterOptionsBySearch(availableOptions.markets, marketSearch),
        [availableOptions.markets, marketSearch]
    );

    // Load human_resources to map tên -> email
    useEffect(() => {
        const loadHrEmails = async () => {
            try {
                console.log('👥 Loading human_resources for email mapping...');
                const { data, error } = await supabase
                    .from('human_resources')
                    .select('"Họ Và Tên", email');

                if (error) {
                    console.error('❌ Error loading human_resources:', error);
                    return;
                }

                const map = {};
                (data || []).forEach(row => {
                    const nameKey = (row['Họ Và Tên'] || '').toLowerCase().trim();
                    const emailVal = (row.email || '').toLowerCase().trim();
                    if (nameKey && emailVal && !map[nameKey]) {
                        map[nameKey] = emailVal;
                    }
                });

                console.log(`✅ Loaded ${Object.keys(map).length} HR email mappings`);
                setHrEmailMap(map);
            } catch (err) {
                console.error('❌ Unexpected error loading HR emails:', err);
            }
        };

        loadHrEmails();
    }, []);

    // Load selected personnel names for current user
    useEffect(() => {
        const loadSelectedPersonnel = async () => {
            try {
                if (!userEmail) {
                    setSelectedPersonnelNames([]);
                    return;
                }

                const userEmailLower = userEmail.toLowerCase().trim();
                const personnelMap = await rbacService.getSelectedPersonnel([userEmailLower]);
                const personnelNames = personnelMap[userEmailLower] || [];

                const validNames = personnelNames.filter(name => {
                    const nameStr = String(name).trim();
                    return nameStr.length > 0 && !nameStr.includes('@');
                });

                console.log('📝 [DanhSachBaoCaoTayCSKH] Valid personnel names:', validNames);
                setSelectedPersonnelNames(validNames);
            } catch (error) {
                console.error('❌ [DanhSachBaoCaoTayCSKH] Error loading selected personnel:', error);
                setSelectedPersonnelNames([]);
            }
        };

        loadSelectedPersonnel();
    }, [userEmail]);

    // Initialize Dates - Default to last 3 days (only if user hasn't changed filter)
    useEffect(() => {
        if (!userChangedFilter && !filters.startDate && !filters.endDate) {
            const today = new Date();
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(today.getDate() - 2); // 3 ngày: hôm nay, hôm qua, hôm kia

            setFilters(prev => ({
                ...prev,
                startDate: formatLocalDateYMD(threeDaysAgo),
                endDate: formatLocalDateYMD(today)
            }));

            console.log('📅 [DanhSachBaoCaoTayCSKH] Khởi tạo filters với 3 ngày gần nhất:', {
                startDate: formatLocalDateYMD(threeDaysAgo),
                endDate: formatLocalDateYMD(today)
            });
        }
    }, []); // Chỉ chạy một lần khi mount

    // Load available options for filters
    useEffect(() => {
        const loadAvailableOptions = async () => {
            try {
                let productsSet = new Set();
                let marketsSet = new Set();
                let personnelSet = new Set();

                // Load products from system_settings
                try {
                    const { data: productsData } = await supabase
                        .from('system_settings')
                        .select('name')
                        .neq('type', 'test')
                        .order('name');

                    if (productsData) {
                        productsData.forEach(item => {
                            if (item.name?.trim()) productsSet.add(item.name.trim());
                        });
                    }
                } catch (err) {
                    console.error('Error loading products:', err);
                }

                // Load products and markets from sales_reports
                try {
                    const maxRecordsToLoad = 10000;
                    let allData = [];
                    let page = 0;
                    const pageSize = 1000;
                    let hasMore = true;

                    while (hasMore && allData.length < maxRecordsToLoad) {
                        const from = page * pageSize;
                        const to = Math.min(from + pageSize - 1, maxRecordsToLoad - 1);

                        const { data, error } = await supabase
                            .from('sales_reports')
                            .select('product, market, name')
                            .order('created_at', { ascending: false })
                            .range(from, to);

                        if (error) throw error;

                        if (data && data.length > 0) {
                            allData = allData.concat(data);
                            hasMore = data.length === pageSize && allData.length < maxRecordsToLoad;
                            page++;
                        } else {
                            hasMore = false;
                        }
                    }

                    const productsFromReports = [...new Set(allData.map(r => r.product).filter(Boolean))];
                    const marketsFromReports = [...new Set(allData.map(r => r.market).filter(Boolean))];
                    const personnelFromReports = [...new Set(allData.map(r => r.name).filter(Boolean))];

                    productsFromReports.forEach(p => productsSet.add(p));
                    marketsFromReports.forEach(m => marketsSet.add(m));
                    personnelFromReports.forEach(p => personnelSet.add(p));
                } catch (err) {
                    console.error('Error loading from sales_reports:', err);
                }

                setAvailableOptions({
                    products: Array.from(productsSet).sort(),
                    markets: Array.from(marketsSet).sort(),
                    personnel: Array.from(personnelSet).sort()
                });
            } catch (error) {
                console.error('Error loading available options:', error);
            }
        };

        if (selectedPersonnelNames !== undefined) {
            loadAvailableOptions();
        }
    }, [selectedPersonnelNames]);

    // Load options for edit form
    useEffect(() => {
        const loadEditOptions = async () => {
            try {
                const { data: productsData } = await supabase
                    .from('system_settings')
                    .select('name')
                    .neq('type', 'test')
                    .order('name');

                const products = productsData?.map(p => p.name) || [];

                const { data: marketsData } = await supabase
                    .from('sales_reports')
                    .select('market')
                    .not('market', 'is', null)
                    .limit(1000);

                const markets = [...new Set(marketsData?.map(m => m.market).filter(Boolean))].sort();

                const { data: branchesData } = await supabase
                    .from('users')
                    .select('branch')
                    .not('branch', 'is', null);

                const branches = [...new Set(branchesData?.map(b => b.branch).filter(Boolean))].sort();

                setEditOptions({
                    products,
                    markets,
                    branches,
                    shifts: ['Hết ca', 'Giữa ca']
                });
            } catch (error) {
                console.error('Error loading edit options:', error);
            }
        };

        loadEditOptions();
    }, []);

    // Calculate real values from orders table for a single report
    const calculateRealValues = async (report) => {
        try {
            const reportDate = report.date || report['Ngày'];
            const reportName = report.name || report['Tên'];
            const reportShift = report.shift || report['ca'];
            const reportProduct = report.product || report['Sản_phẩm'];
            const reportMarket = report.market || report['Thị_trường'];

            if (!reportDate || !reportName) {
                return {
                    order_count_actual: 0,
                    revenue_actual: 0
                };
            }

            // Build query - chỉ select các cột cần thiết để tăng tốc
            let query = supabase
                .from('orders')
                .select('total_amount_vnd, total_vnd') // Chỉ select cột cần thiết
                .eq('order_date', reportDate)
                .ilike('sale_staff', `%${reportName}%`); // CSKH uses sale_staff instead of marketing_staff

            // Filter by shift/ca
            const shiftValue = String(reportShift || '').trim();

            if (shiftValue === 'Hết ca' || shiftValue.toLowerCase() === 'hết ca') {
                query = query.ilike('shift', '%Hết ca%');
            } else if (shiftValue === 'Giữa ca' || shiftValue.toLowerCase() === 'giữa ca') {
                query = query.or('shift.ilike.%Giữa ca%,shift.ilike.%giữa ca%');
            } else if (shiftValue) {
                query = query.ilike('shift', `%${shiftValue}%`);
            }

            // Filter by product
            if (reportProduct) {
                query = query.eq('product', reportProduct);
            }

            // Filter by market (country)
            if (reportMarket) {
                query = query.ilike('country', `%${reportMarket}%`);
            }

            const { data: orders, error } = await query;

            if (error) {
                console.error('Error calculating real values:', error);
                return {
                    order_count_actual: 0,
                    revenue_actual: 0
                };
            }

            if (!orders || orders.length === 0) {
                return {
                    order_count_actual: 0,
                    revenue_actual: 0
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
                order_count_actual: totalOrders,
                revenue_actual: doanhSoThucTe
            };
        } catch (error) {
            console.error('Error calculating real values:', error);
            return {
                order_count_actual: 0,
                revenue_actual: 0
            };
        }
    };

    // Calculate real values for all reports (PARALLEL - tối ưu tốc độ)
    const calculateRealValuesForReports = async (reports) => {
        if (!reports || reports.length === 0) return;

        setCalculatingRealValues(true);

        try {
            // Chạy song song tất cả queries thay vì tuần tự
            // Giới hạn batch size để tránh quá tải
            const BATCH_SIZE = 10; // Chạy 10 queries cùng lúc
            const valuesMap = {};

            for (let i = 0; i < reports.length; i += BATCH_SIZE) {
                const batch = reports.slice(i, i + BATCH_SIZE);

                // Chạy song song trong batch này
                const batchPromises = batch.map(report =>
                    calculateRealValues(report).then(result => ({
                        id: report.id,
                        values: result
                    }))
                );

                const batchResults = await Promise.all(batchPromises);

                // Merge kết quả
                batchResults.forEach(({ id, values }) => {
                    valuesMap[id] = values;
                });

                console.log(`⚡ Calculated batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(reports.length / BATCH_SIZE)}: ${batch.length} reports`);
            }

            setRealValuesMap(valuesMap);
            console.log(`✅ Calculated real values for ${reports.length} reports (parallel)`);
        } catch (error) {
            console.error('Error calculating real values for reports:', error);
        } finally {
            setCalculatingRealValues(false);
        }
    };

    // Fetch Data trực tiếp từ bảng sales_reports
    const fetchData = useCallback(async () => {
        if (!filters.startDate || !filters.endDate) return;
        setLoading(true);
        try {
            let query = supabase
                .from('sales_reports')
                .select('*')
                .gte('date', filters.startDate)
                .lte('date', filters.endDate)
                .order('created_at', { ascending: false });

            // Helper function to normalize name (remove extra spaces)
            const normalizeNameForQuery = (str) => {
                if (!str) return '';
                return String(str).trim().replace(/\s+/g, ' ');
            };

            // Filter theo selected_personnel nếu có
            if (selectedPersonnelNames && selectedPersonnelNames.length > 0) {
                const orConditions = selectedPersonnelNames
                    .filter(name => name && name.trim().length > 0)
                    .map(name => {
                        const normalizedName = normalizeNameForQuery(name);
                        return `name.ilike.%${normalizedName}%`;
                    });

                if (orConditions.length > 0) {
                    query = query.or(orConditions.join(','));
                } else {
                    query = query.eq('id', '00000000-0000-0000-0000-000000000000');
                }
            }

            // Filter theo nhân sự (nếu có filter)
            if (filters.personnel && filters.personnel.length > 0) {
                const personnelConditions = filters.personnel
                    .filter(name => name && name.trim().length > 0)
                    .map(name => {
                        const normalizedName = normalizeNameForQuery(name);
                        return `name.ilike.%${normalizedName}%`;
                    });

                if (personnelConditions.length > 0) {
                    query = query.or(personnelConditions.join(','));
                }
            }

            // Filter theo sản phẩm
            if (filters.products && filters.products.length > 0) {
                query = query.in('product', filters.products);
            }

            // Filter theo thị trường
            if (filters.markets && filters.markets.length > 0) {
                query = query.in('market', filters.markets);
            }

            const { data, error } = await query;

            if (error) throw error;

            // Bổ sung Email nhân viên từ bảng nhân sự nếu thiếu
            const enrichedData = (data || []).map(item => {
                const currentEmail = (item.email || '').trim();
                const nameKey = (item.name || '').toLowerCase().trim();
                const hrEmail = hrEmailMap[nameKey];

                if (!currentEmail && hrEmail) {
                    return { ...item, email: hrEmail };
                }
                return item;
            });

            setAllReports(enrichedData);
            setCurrentPage(1);
            await calculateRealValuesForReports(enrichedData);
        } catch (error) {
            console.error('❌ Error fetching CSKH reports:', error);
            alert(`Lỗi khi tải dữ liệu: ${error?.message || String(error)}`);
            setManualReports([]);
            setAllReports([]);
        } finally {
            setLoading(false);
        }
    }, [filters.startDate, filters.endDate, filters.products, filters.markets, filters.personnel, selectedPersonnelNames, hrEmailMap]);

    useEffect(() => {
        if (filters.startDate && filters.endDate) {
            fetchData();
        }
    }, [fetchData]);

    // Quick date filter handlers
    const handleQuickDateSelect = (period) => {
        const today = new Date();
        let startDate, endDate;

        switch (period) {
            case 'today':
                startDate = today;
                endDate = today;
                break;
            case 'yesterday':
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                startDate = yesterday;
                endDate = yesterday;
                break;
            case 'thisWeek':
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - today.getDay());
                startDate = startOfWeek;
                endDate = today;
                break;
            case 'lastWeek':
                const lastWeekStart = new Date(today);
                lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
                const lastWeekEnd = new Date(lastWeekStart);
                lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
                startDate = lastWeekStart;
                endDate = lastWeekEnd;
                break;
            case 'thisMonth':
                const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                startDate = firstDayOfMonth;
                endDate = today;
                break;
            case 'lastMonth':
                const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                startDate = firstDayLastMonth;
                endDate = lastDayLastMonth;
                break;
            case 'last7Days':
                const last7Days = new Date(today);
                last7Days.setDate(today.getDate() - 7);
                startDate = last7Days;
                endDate = today;
                break;
            case 'last30Days':
                const last30Days = new Date(today);
                last30Days.setDate(today.getDate() - 30);
                startDate = last30Days;
                endDate = today;
                break;
            default:
                return;
        }

        setFilters(prev => ({
            ...prev,
            startDate: formatLocalDateYMD(startDate),
            endDate: formatLocalDateYMD(endDate)
        }));
    };

    // Filter change handlers
    const handleFilterChange = (type, value, checked) => {
        setFilters(prev => {
            const list = prev[type] || [];
            if (checked) {
                return { ...prev, [type]: [...list, value] };
            } else {
                return { ...prev, [type]: list.filter(item => item !== value) };
            }
        });
    };

    const handleSelectAll = (type, checked) => {
        setFilters(prev => ({
            ...prev,
            [type]: checked ? availableOptions[type] : []
        }));
    };

    // Delete single report
    const handleDeleteReport = async (reportId) => {
        if (!window.confirm('Bạn có chắc chắn muốn xóa báo cáo này?')) return;

        setDeletingId(reportId);
        try {
            const { error } = await supabase
                .from('sales_reports')
                .delete()
                .eq('id', reportId);

            if (error) throw error;

            alert('Đã xóa báo cáo thành công!');
            fetchData();
        } catch (error) {
            console.error('Error deleting report:', error);
            alert('Lỗi khi xóa báo cáo: ' + error.message);
        } finally {
            setDeletingId(null);
        }
    };

    // Calculate pagination
    const totalPages = Math.ceil(allReports.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedReports = allReports.slice(startIndex, endIndex);

    // Update displayed reports when pagination changes
    useEffect(() => {
        setManualReports(paginatedReports);
    }, [currentPage, itemsPerPage, allReports]);

    /** Tổng các cột số theo toàn bộ danh sách đã lọc (không chỉ trang hiện tại) */
    const reportColumnTotals = useMemo(() => {
        return allReports.reduce(
            (acc, item) => ({
                mess: acc.mess + (Number(item.mess_count) || 0),
                response: acc.response + (Number(item.response_count) || 0),
                orders: acc.orders + (Number(item.order_count) || 0),
                revenue: acc.revenue + (Number(item.revenue_mess) || 0),
            }),
            { mess: 0, response: 0, orders: 0, revenue: 0 }
        );
    }, [allReports]);

    const normalizePersonName = (s) =>
        String(s || '')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase();

    /** Khớp `sales_reports.name` với `users.name` (hoặc username nếu name trống), ghi `users.team` vào `sales_reports.team`. */
    const handleSyncTeamFromUsers = async () => {
        if (!window.confirm(
            'Đồng bộ cột Team và Chi nhánh (branch) từ bảng users?\n\n' +
            'Áp dụng cho các dòng đang có trong danh sách (theo bộ lọc ngày / nhân sự).\n' +
            'Khớp tên (name / username) không phân biệt hoa thường, sau khi chuẩn hóa khoảng trắng.'
        )) {
            return;
        }
        if (!allReports.length) {
            alert('Không có dữ liệu trong khoảng đã lọc.');
            return;
        }
        setTeamSyncing(true);
        try {
            const { data: users, error: userErr } = await supabase
                .from('users')
                .select('name, username, team, branch');
            if (userErr) throw userErr;

            const nameToProfile = new Map();
            (users || []).forEach((u) => {
                const teamVal = String(u.team ?? '').trim();
                const branchVal = String(u.branch ?? '').trim();
                if (!teamVal && !branchVal) return;
                const n = normalizePersonName(u.name);
                const un = normalizePersonName(u.username);
                const payload = { team: teamVal, branch: branchVal };
                if (n) nameToProfile.set(n, payload);
                if (un) nameToProfile.set(un, payload);
            });

            let updated = 0;
            let skippedNoMatch = 0;
            let skippedSame = 0;

            for (const r of allReports) {
                const key = normalizePersonName(r.name);
                const prof = nameToProfile.get(key);
                if (!prof) {
                    skippedNoMatch += 1;
                    continue;
                }
                const newTeam = prof.team || '';
                const newBranch = prof.branch || '';
                if (!newTeam && !newBranch) {
                    skippedNoMatch += 1;
                    continue;
                }
                const curTeam = String(r.team ?? '').trim();
                const curBranch = String(r.branch ?? '').trim();
                if (curTeam === newTeam && curBranch === newBranch) {
                    skippedSame += 1;
                    continue;
                }
                const { error: upErr } = await supabase
                    .from('sales_reports')
                    .update({
                        team: newTeam || null,
                        branch: newBranch || null,
                    })
                    .eq('id', r.id);
                if (upErr) throw upErr;
                updated += 1;
            }

            alert(
                `Đã cập nhật team & chi nhánh: ${updated} dòng.\n` +
                `Không khớp tên với users (hoặc user không có team/chi nhánh): ${skippedNoMatch} dòng.\n` +
                `Đã khớp, không đổi: ${skippedSame} dòng.`
            );
            fetchData();
        } catch (error) {
            console.error('handleSyncTeamFromUsers:', error);
            alert('Lỗi: ' + (error.message || String(error)));
        } finally {
            setTeamSyncing(false);
        }
    };

    if (!canView(permissionCode)) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
    }



    // Edit Handlers
    const handleEditClick = (report) => {
        setEditingReport(report);
        setEditForm({
            date: report.date ? report.date.split('T')[0] : '',
            shift: report.shift || '',
            product: report.product || '',
            market: report.market || '',
            branch: report.branch || '',
            mess_count: report.mess_count,
            response_count: report.response_count,
            order_count: report.order_count,
            revenue_mess: report.revenue_mess
        });
    };

    const handleCloseModal = () => {
        setEditingReport(null);
        setEditForm({});
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveEdit = async () => {
        if (!editingReport) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('sales_reports')
                .update({
                    date: editForm.date,
                    shift: editForm.shift,
                    product: editForm.product,
                    market: editForm.market,
                    branch: editForm.branch || null,
                    mess_count: Number(editForm.mess_count) || 0,
                    response_count: Number(editForm.response_count) || 0,
                    order_count: Number(editForm.order_count) || 0,
                    revenue_mess: Number(editForm.revenue_mess) || 0
                })
                .eq('id', editingReport.id);

            if (error) throw error;
            alert('Cập nhật thành công!');
            handleCloseModal();
            fetchData();
        } catch (error) {
            console.error('Error updating:', error);
            alert('Lỗi cập nhật: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bao-cao-sale-container">
            {loading && <div className="loading-overlay">Đang tải dữ liệu...</div>}

            <div className="report-container">
                {/* Filter Section */}
                <div className="sidebar" style={{ width: '280px', minWidth: '280px', padding: '15px', overflowY: 'auto', maxHeight: '100vh' }}>
                    <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: 'bold' }}>Bộ lọc</h3>

                    {/* Quick Date Filters */}
                    <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#333' }}>Lọc nhanh ngày:</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <button onClick={() => handleQuickDateSelect('today')} style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Hôm nay</button>
                            <button onClick={() => handleQuickDateSelect('yesterday')} style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Hôm qua</button>
                            <button onClick={() => handleQuickDateSelect('thisWeek')} style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Tuần này</button>
                            <button onClick={() => handleQuickDateSelect('lastWeek')} style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Tuần trước</button>
                            <button onClick={() => handleQuickDateSelect('thisMonth')} style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Tháng này</button>
                            <button onClick={() => handleQuickDateSelect('lastMonth')} style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Tháng trước</button>
                            <button onClick={() => handleQuickDateSelect('last7Days')} style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>7 ngày qua</button>
                            <button onClick={() => handleQuickDateSelect('last30Days')} style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>30 ngày qua</button>
                        </div>
                    </div>

                    {/* Date Range Filters */}
                    <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#333' }}>Khoảng thời gian:</h4>
                        <label style={{ display: 'block', marginBottom: '10px' }}>
                            <span style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Từ ngày:</span>
                            <input type="date" value={filters.startDate} onChange={e => {
                                setUserChangedFilter(true);
                                setFilters(prev => ({ ...prev, startDate: e.target.value }));
                            }} style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </label>
                        <label style={{ display: 'block' }}>
                            <span style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Đến ngày:</span>
                            <input type="date" value={filters.endDate} onChange={e => {
                                setUserChangedFilter(true);
                                setFilters(prev => ({ ...prev, endDate: e.target.value }));
                            }} style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </label>
                    </div>

                    {/* Personnel Filter */}
                    <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            Nhân sự
                            <label style={{ fontSize: '11px', fontWeight: 'normal' }}>
                                <input type="checkbox" checked={(filters.personnel || []).length === availableOptions.personnel.length && availableOptions.personnel.length > 0} onChange={(e) => handleSelectAll('personnel', e.target.checked)} style={{ marginRight: '5px' }} />
                                Tất cả
                            </label>
                        </h4>
                        <input
                            type="search"
                            placeholder="Tìm nhân sự..."
                            value={personnelSearch}
                            onChange={(e) => setPersonnelSearch(e.target.value)}
                            style={{ width: '100%', marginBottom: '8px', padding: '6px 8px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                        <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '5px' }}>
                            {availableOptions.personnel.length === 0 ? (
                                <div style={{ fontSize: '11px', color: '#999', padding: '5px' }}>Đang tải...</div>
                            ) : personnelFiltered.length === 0 ? (
                                <div style={{ fontSize: '11px', color: '#999', padding: '5px' }}>Không có mục khớp tìm kiếm.</div>
                            ) : (
                                personnelFiltered.map(person => (
                                    <label key={person} style={{ display: 'block', fontSize: '12px', marginBottom: '5px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={(filters.personnel || []).includes(person)} onChange={(e) => handleFilterChange('personnel', person, e.target.checked)} style={{ marginRight: '5px' }} />
                                        {person}
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Product Filter */}
                    <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            Sản phẩm
                            <label style={{ fontSize: '11px', fontWeight: 'normal' }}>
                                <input type="checkbox" checked={(filters.products || []).length === availableOptions.products.length && availableOptions.products.length > 0} onChange={(e) => handleSelectAll('products', e.target.checked)} style={{ marginRight: '5px' }} />
                                Tất cả
                            </label>
                        </h4>
                        <input
                            type="search"
                            placeholder="Tìm sản phẩm..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            style={{ width: '100%', marginBottom: '8px', padding: '6px 8px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                        <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '5px' }}>
                            {availableOptions.products.length === 0 ? (
                                <div style={{ fontSize: '11px', color: '#999', padding: '5px' }}>Đang tải...</div>
                            ) : productsFiltered.length === 0 ? (
                                <div style={{ fontSize: '11px', color: '#999', padding: '5px' }}>Không có mục khớp tìm kiếm.</div>
                            ) : (
                                productsFiltered.map(product => (
                                    <label key={product} style={{ display: 'block', fontSize: '12px', marginBottom: '5px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={(filters.products || []).includes(product)} onChange={(e) => handleFilterChange('products', product, e.target.checked)} style={{ marginRight: '5px' }} />
                                        {product}
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Market Filter */}
                    <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            Thị trường
                            <label style={{ fontSize: '11px', fontWeight: 'normal' }}>
                                <input type="checkbox" checked={(filters.markets || []).length === availableOptions.markets.length && availableOptions.markets.length > 0} onChange={(e) => handleSelectAll('markets', e.target.checked)} style={{ marginRight: '5px' }} />
                                Tất cả
                            </label>
                        </h4>
                        <input
                            type="search"
                            placeholder="Tìm thị trường..."
                            value={marketSearch}
                            onChange={(e) => setMarketSearch(e.target.value)}
                            style={{ width: '100%', marginBottom: '8px', padding: '6px 8px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                        <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '5px' }}>
                            {availableOptions.markets.length === 0 ? (
                                <div style={{ fontSize: '11px', color: '#999', padding: '5px' }}>Đang tải...</div>
                            ) : marketsFiltered.length === 0 ? (
                                <div style={{ fontSize: '11px', color: '#999', padding: '5px' }}>Không có mục khớp tìm kiếm.</div>
                            ) : (
                                marketsFiltered.map(market => (
                                    <label key={market} style={{ display: 'block', fontSize: '12px', marginBottom: '5px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={(filters.markets || []).includes(market)} onChange={(e) => handleFilterChange('markets', market, e.target.checked)} style={{ marginRight: '5px' }} />
                                        {market}
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="main-detailed">
                    <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <h2>DANH SÁCH BÁO CÁO TAY CSKH</h2>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {/* Chỉ Admin mới thấy nút xóa (không bao gồm Finance) */}
                            {isAdminOnly && (
                                <button
                                    type="button"
                                    onClick={handleSyncTeamFromUsers}
                                    disabled={teamSyncing || loading || calculatingRealValues}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
                                >
                                    {teamSyncing ? (
                                        <>
                                            <span className="animate-spin">⏳</span>
                                            Đang đồng bộ team & chi nhánh...
                                        </>
                                    ) : (
                                        <>Chỉnh team & chi nhánh (theo users)</>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="table-responsive-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>STT</th>
                                    <th>Ngày</th>
                                    <th>Ca</th>
                                    <th>Người báo cáo</th>
                                    <th>Team</th>
                                    <th>Sản phẩm</th>
                                    <th>Thị trường</th>
                                    <th>Số mess</th>
                                    <th>Phản hồi</th>
                                    <th>Số đơn</th>
                                    <th>Doanh số</th>
                                    <th>Thao tác</th>
                                </tr>
                                {allReports.length > 0 && (
                                    <tr className="total-row dsbcskh-thead-totals">
                                        <th colSpan="7" className="total-label">
                                            Tổng cộng ({allReports.length} dòng)
                                        </th>
                                        <th className="total-value">{formatNumber(reportColumnTotals.mess)}</th>
                                        <th className="total-value">{formatNumber(reportColumnTotals.response)}</th>
                                        <th className="total-value">{formatNumber(reportColumnTotals.orders)}</th>
                                        <th className="total-value">{formatCurrency(reportColumnTotals.revenue)}</th>
                                        <th className="total-value" aria-hidden="true">—</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {manualReports.length === 0 ? (
                                    <tr>
                                        <td colSpan="12" className="text-center">{loading || calculatingRealValues ? 'Đang tải...' : 'Không có dữ liệu trong khoảng thời gian này.'}</td>
                                    </tr>
                                ) : (
                                    manualReports.map((item, index) => {
                                        const realValues = realValuesMap[item.id] || {
                                            order_count_actual: item.order_count_actual || 0,
                                            revenue_actual: item.revenue_actual || 0
                                        };

                                        return (
                                            <tr key={item.id || index}>
                                                <td className="text-center">{startIndex + index + 1}</td>
                                                <td>{formatDate(item.date)}</td>
                                                <td>{item.shift}</td>
                                                <td>{item.name}</td>
                                                <td>{item.team}</td>
                                                <td>{item.product}</td>
                                                <td>{item.market}</td>
                                                <td>{formatNumber(item.mess_count)}</td>
                                                <td>{formatNumber(item.response_count)}</td>
                                                <td>{formatNumber(item.order_count)}</td>
                                                <td>{formatCurrency(item.revenue_mess)}</td>
                                                <td className="text-center">
                                                    <div className="flex gap-2 justify-center">
                                                        <button
                                                            className="px-2 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-xs transition"
                                                            onClick={() => handleEditClick(item)}
                                                        >
                                                            Sửa
                                                        </button>
                                                        {isAdmin && (
                                                            <button
                                                                className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition disabled:bg-gray-400"
                                                                onClick={() => handleDeleteReport(item.id)}
                                                                disabled={deletingId === item.id}
                                                            >
                                                                {deletingId === item.id ? 'Đang xóa...' : 'Xóa'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {allReports.length > 0 && (
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mt-4 flex justify-between items-center flex-wrap gap-4">
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-600">Số dòng/trang:</label>
                                <select
                                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                    value={itemsPerPage}
                                    onChange={(e) => {
                                        setItemsPerPage(Number(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                >
                                    <option value="25">25</option>
                                    <option value="50">50</option>
                                    <option value="100">100</option>
                                    <option value="200">200</option>
                                </select>
                                <span className="text-sm text-gray-600 ml-2">
                                    Hiển thị {startIndex + 1}-{Math.min(endIndex, allReports.length)} / {allReports.length} bản ghi
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                                >
                                    ⏮ Đầu
                                </button>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                                >
                                    ◀ Trước
                                </button>
                                <span className="text-sm text-gray-600 px-3">
                                    Trang {currentPage} / {totalPages || 1}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage >= totalPages}
                                    className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                                >
                                    Sau ▶
                                </button>
                                <button
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage >= totalPages}
                                    className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                                >
                                    Cuối ⏭
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            {editingReport && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-96 shadow-xl relative">
                        <h3 className="text-lg font-bold mb-4 text-blue-600 border-b pb-2">Sửa Báo Cáo CSKH</h3>

                        <div className="mb-4 text-sm text-gray-600">
                            <p><strong>Nhân viên:</strong> {editingReport.name}</p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium mb-1">Ngày <span className="text-red-500">*</span>:</label>
                                <input type="date" name="date" value={editForm.date} onChange={handleInputChange} className="w-full border rounded px-2 py-1" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Ca:</label>
                                <select name="shift" value={editForm.shift} onChange={handleInputChange} className="w-full border rounded px-2 py-1">
                                    <option value="">Chọn ca</option>
                                    {editOptions.shifts.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Sản phẩm:</label>
                                <select name="product" value={editForm.product} onChange={handleInputChange} className="w-full border rounded px-2 py-1">
                                    <option value="">Chọn sản phẩm</option>
                                    {editOptions.products.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Thị trường:</label>
                                <select name="market" value={editForm.market} onChange={handleInputChange} className="w-full border rounded px-2 py-1">
                                    <option value="">Chọn thị trường</option>
                                    {editOptions.markets.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Chi nhánh:</label>
                                <select name="branch" value={editForm.branch || ''} onChange={handleInputChange} className="w-full border rounded px-2 py-1">
                                    <option value="">Chọn chi nhánh</option>
                                    {editOptions.branches.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Số mess:</label>
                                <input type="number" name="mess_count" value={editForm.mess_count} onChange={handleInputChange} className="w-full border rounded px-2 py-1" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Phản hồi:</label>
                                <input type="number" name="response_count" value={editForm.response_count} onChange={handleInputChange} className="w-full border rounded px-2 py-1" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Số đơn:</label>
                                <input type="number" name="order_count" value={editForm.order_count} onChange={handleInputChange} className="w-full border rounded px-2 py-1" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Doanh số:</label>
                                <input type="number" name="revenue_mess" value={editForm.revenue_mess} onChange={handleInputChange} className="w-full border rounded px-2 py-1" />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={handleCloseModal} disabled={saving} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm text-gray-800">Hủy</button>
                            <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu Thay Đổi'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
