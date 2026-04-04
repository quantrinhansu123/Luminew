import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Calculator, Eye, RefreshCw, X } from 'lucide-react';
import { toast } from 'react-toastify';
import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';
import { fetchMatchingOrdersForReport } from '../utils/lumidataSalesReportSync';
import { recalcSaleOrderCountFromOrders } from '../services/saleRecalcOrderCountFromOrders';
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

/** HN: team trong `sales_reports` / `users` cho báo cáo tay CSKH Hà Nội (đồng bộ /xem-bao-cao-cskh). */
export const CSKH_MANUAL_REPORT_HN_TEAMS = ['CSKH-HN'];

/** HCM: chỉ các team này trong sales_reports (khớp cột `team`). */
export const CSKH_MANUAL_REPORT_HCM_TEAMS = ['HCM-Sale Đêm', 'CSKH-HCM', 'HCM'];

/**
 * Trùng: cùng ngày + người + SP + TT + team — KHÔNG tính cột Ca.
 * Nút xóa trùng: xóa HẾT bản Ca = Giữa ca; với bản không phải Giữa ca, gộp trùng (giữ mới nhất).
 */
function reportBusinessDedupeKey(r) {
    const d = r.date ? String(r.date).split('T')[0] : '';
    const name = String(r.name ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
    const product = String(r.product ?? '').trim().toLowerCase();
    const market = String(r.market ?? '').trim().toLowerCase();
    const team = String(r.team ?? '').trim();
    return `${d}|${name}|${product}|${market}|${team}`;
}

function isGiuaCaShift(shift) {
    const s = String(shift ?? '').trim().toLowerCase();
    const sn = s.normalize('NFD').replace(/\p{M}/gu, '');
    return (s.includes('giữa') && s.includes('ca')) || (sn.includes('giua') && sn.includes('ca'));
}

/** YYYY-MM-DD theo giờ local — tránh lệch 1 ngày so với `toISOString()` (UTC). */
const formatLocalDateYMD = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/**
 * @param {object} [props]
 * @param {string[] | null} [props.salesReportTeamIn] — nếu có: lọc sales_reports theo các team này (kể cả admin).
 * @param {string[] | null} [props.pageAccessCodes] — can_view một trong các mã; mặc định CSKH_VIEW | CSKH_MANUAL.
 * @param {string} [props.pageTitleSuffix] — ví dụ " (HCM)" cho tiêu đề trang.
 */
export default function DanhSachBaoCaoTayCSKH({
    salesReportTeamIn = null,
    pageAccessCodes = null,
    pageTitleSuffix = '',
} = {}) {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // 'RD' or null

    // Permission Logic
    const { canView, role, team: userTeam, permissions } = usePermissions();
    const accessCodes = pageAccessCodes ?? ['CSKH_VIEW', 'CSKH_MANUAL'];
    const hasPageAccess = accessCodes.some((c) => canView(c));

    const effectiveTeamFilter = useMemo(
        () =>
            Array.isArray(salesReportTeamIn) && salesReportTeamIn.length > 0
                ? salesReportTeamIn.map((t) => String(t).trim()).filter(Boolean)
                : CSKH_MANUAL_REPORT_HN_TEAMS,
        [salesReportTeamIn]
    );
    const teamFilterLabel = useMemo(() => effectiveTeamFilter.join(', '), [effectiveTeamFilter]);

    // Get user email and name for filtering
    const userEmail = localStorage.getItem('userEmail') || '';
    const userName = localStorage.getItem('username') || '';

    // Debug: Log permissions
    useEffect(() => {
        console.log('🔐 User Permissions:', {
            role,
            accessCodes,
            hasPermission: hasPageAccess,
            allPermissions: permissions,
            userEmail,
            userName,
            userTeam
        });
    }, [role, accessCodes, hasPageAccess, permissions, userEmail, userName, userTeam]);

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

    /** Luôn giới hạn theo effectiveTeamFilter (CSKH-HN hoặc danh sách HCM từ props). */
    const useTeamInQuery = true;

    const [loading, setLoading] = useState(true);
    const [manualReports, setManualReports] = useState([]);
    const [allReports, setAllReports] = useState([]); // Store all filtered reports for pagination
    const [showViewOrdersModal, setShowViewOrdersModal] = useState(false);
    const [viewingReport, setViewingReport] = useState(null);
    const [viewingOrders, setViewingOrders] = useState([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [updatingOrders, setUpdatingOrders] = useState(false);
    const [updateProgress, setUpdateProgress] = useState({ current: 0, total: 0 });
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
    /** Admin: chọn nhiều dòng để xóa (theo id bản ghi sales_reports) */
    const [selectedReportIds, setSelectedReportIds] = useState(() => new Set());
    const [deletingBulk, setDeletingBulk] = useState(false);
    const [removingDuplicates, setRemovingDuplicates] = useState(false);

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

    // Load selected personnel names for current user (CSKH nhân viên: giới hạn theo team; admin: xem toàn bộ, không áp scope)
    useEffect(() => {
        const loadSelectedPersonnel = async () => {
            try {
                if (isAdmin) {
                    setSelectedPersonnelNames([]);
                    return;
                }
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
    }, [userEmail, isAdmin]);

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

                if (!isAdmin) {
                    try {
                        const { data: teamUsers, error: teamUsersErr } = await supabase
                            .from('users')
                            .select('name, username')
                            .in('team', effectiveTeamFilter);
                        if (teamUsersErr) throw teamUsersErr;
                        (teamUsers || []).forEach((u) => {
                            const n = String(u.name || '').trim();
                            const un = String(u.username || '').trim();
                            if (n) personnelSet.add(n);
                            else if (un) personnelSet.add(un);
                        });
                    } catch (err) {
                        console.error('Error loading CSKH-HN personnel from users:', err);
                    }
                }

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

                        let reportsQuery = supabase
                            .from('sales_reports')
                            .select('product, market, name')
                            .order('created_at', { ascending: false })
                            .range(from, to);
                        if (useTeamInQuery) {
                            reportsQuery = reportsQuery.in('team', effectiveTeamFilter);
                        }
                        const { data, error } = await reportsQuery;

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

                    productsFromReports.forEach(p => productsSet.add(p));
                    marketsFromReports.forEach(m => marketsSet.add(m));
                    if (isAdmin) {
                        allData.forEach((r) => {
                            const nm = String(r.name || '').trim();
                            if (nm) personnelSet.add(nm);
                        });
                    }
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
    }, [selectedPersonnelNames, isAdmin, effectiveTeamFilter, useTeamInQuery]);

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

                let marketsQ = supabase
                    .from('sales_reports')
                    .select('market')
                    .not('market', 'is', null)
                    .limit(1000);
                if (useTeamInQuery) {
                    marketsQ = marketsQ.in('team', effectiveTeamFilter);
                }
                const { data: marketsData } = await marketsQ;

                const markets = [...new Set(marketsData?.map(m => m.market).filter(Boolean))].sort();

                let branchesQ = supabase
                    .from('users')
                    .select('branch')
                    .not('branch', 'is', null);
                if (useTeamInQuery) {
                    branchesQ = branchesQ.in('team', effectiveTeamFilter);
                }
                const { data: branchesData } = await branchesQ;

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
    }, [isAdmin, effectiveTeamFilter, useTeamInQuery]);

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
            if (useTeamInQuery) {
                query = query.in('team', effectiveTeamFilter);
            }

            // Helper function to normalize name (remove extra spaces)
            const normalizeNameForQuery = (str) => {
                if (!str) return '';
                return String(str).trim().replace(/\s+/g, ' ');
            };

            // Filter theo selected_personnel (leader CSKH) — admin không bị giới hạn
            if (!isAdmin && selectedPersonnelNames && selectedPersonnelNames.length > 0) {
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
        } catch (error) {
            console.error('❌ Error fetching CSKH reports:', error);
            alert(`Lỗi khi tải dữ liệu: ${error?.message || String(error)}`);
            setManualReports([]);
            setAllReports([]);
        } finally {
            setLoading(false);
        }
    }, [filters.startDate, filters.endDate, filters.products, filters.markets, filters.personnel, selectedPersonnelNames, hrEmailMap, useTeamInQuery, effectiveTeamFilter]);

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

    const handleViewOrders = async (report) => {
        setViewingReport(report);
        setShowViewOrdersModal(true);
        setViewingOrders([]);
        setLoadingOrders(true);
        try {
            const { error, orders } = await fetchMatchingOrdersForReport(
                report,
                '[DanhSachBaoCaoTayCSKH]'
            );
            if (error) {
                toast.error(error.message || 'Lỗi báo cáo');
                setLoadingOrders(false);
                return;
            }
            setViewingOrders(orders || []);
        } catch (err) {
            console.error('handleViewOrders:', err);
            toast.error('Lỗi khi lấy danh sách đơn: ' + (err.message || String(err)));
        } finally {
            setLoadingOrders(false);
        }
    };

    const handleCalculateAndUpdateOrders = async () => {
        if (!filters.startDate || !filters.endDate) {
            toast.error('Vui lòng chọn khoảng thời gian trước khi tính toán!');
            return;
        }
        const scopeLabel = `Team ∈ { ${teamFilterLabel} }`;
        if (
            !window.confirm(
                `Tính lại sales_reports (${scopeLabel}) từ bảng đơn Supabase — cùng luồng Admin Tools / cài đặt:\n\n` +
                    '• Cập nhật số đơn, doanh số, đơn hủy, đơn go (có tracking, không hủy).\n' +
                    '• Tự thêm dòng «Hết ca» nếu thiếu key (ngày + nhân viên sale + SP + thị trường).\n\n' +
                    `Khoảng ngày: ${filters.startDate} → ${filters.endDate}\n\nChạy?`
            )
        ) {
            return;
        }
        setUpdatingOrders(true);
        setUpdateProgress({ current: 0, total: 1 });
        try {
            const result = await recalcSaleOrderCountFromOrders({
                startDate: filters.startDate,
                endDate: filters.endDate,
                createMissingForHetCa: true,
                reportsTeamIn: effectiveTeamFilter,
                defaultTeamForNewRows: effectiveTeamFilter[0] ?? null,
            });
            const n = result.upserted ?? 0;
            const created = result.createdMissing ?? 0;
            const updated = result.updatedExisting ?? 0;
            toast.success(
                `Hoàn tất: ${n} thao tác (cập nhật ${updated} dòng, tạo mới ${created} dòng).`
            );
            fetchData();
        } catch (err) {
            console.error('handleCalculateAndUpdateOrders:', err);
            toast.error('Lỗi khi tính toán: ' + (err.message || String(err)));
        } finally {
            setUpdatingOrders(false);
            setUpdateProgress({ current: 0, total: 0 });
        }
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

            setSelectedReportIds((prev) => {
                if (!prev.has(reportId)) return prev;
                const next = new Set(prev);
                next.delete(reportId);
                return next;
            });
            alert('Đã xóa báo cáo thành công!');
            fetchData();
        } catch (error) {
            console.error('Error deleting report:', error);
            alert('Lỗi khi xóa báo cáo: ' + error.message);
        } finally {
            setDeletingId(null);
        }
    };

    const toggleReportSelected = (reportId) => {
        if (!reportId) return;
        setSelectedReportIds((prev) => {
            const next = new Set(prev);
            if (next.has(reportId)) next.delete(reportId);
            else next.add(reportId);
            return next;
        });
    };

    const handleBulkDeleteReports = async () => {
        const ids = [...selectedReportIds];
        if (ids.length === 0) return;
        if (
            !window.confirm(
                `Bạn có chắc muốn xóa ${ids.length} báo cáo đã chọn? Hành động này không thể hoàn tác.`
            )
        ) {
            return;
        }
        setDeletingBulk(true);
        try {
            const { error } = await supabase.from('sales_reports').delete().in('id', ids);
            if (error) throw error;
            setSelectedReportIds(new Set());
            alert(`Đã xóa ${ids.length} báo cáo.`);
            fetchData();
        } catch (error) {
            console.error('Error bulk deleting reports:', error);
            alert('Lỗi khi xóa hàng loạt: ' + error.message);
        } finally {
            setDeletingBulk(false);
        }
    };

    /** Xóa hết Ca = Giữa ca; trên bản còn lại, gộp trùng theo khóa (không tính Ca), giữ created_at mới nhất. */
    const handleRemoveDuplicateReports = async () => {
        if (!allReports.length) {
            toast.error('Không có dữ liệu trong danh sách hiện tại.');
            return;
        }
        const toDeleteSet = new Set();
        for (const r of allReports) {
            if (!r?.id) continue;
            if (isGiuaCaShift(r.shift)) toDeleteSet.add(r.id);
        }

        const nonGiua = allReports.filter((r) => r?.id && !isGiuaCaShift(r.shift));
        const byKey = new Map();
        for (const r of nonGiua) {
            const k = reportBusinessDedupeKey(r);
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push(r);
        }
        for (const [, rows] of byKey) {
            if (rows.length < 2) continue;
            const sorted = [...rows].sort((a, b) => {
                const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                if (tb !== ta) return tb - ta;
                return String(b.id).localeCompare(String(a.id));
            });
            sorted.slice(1).forEach((r) => toDeleteSet.add(r.id));
        }

        const toDelete = [...toDeleteSet];
        if (toDelete.length === 0) {
            toast.info(
                'Không có bản Giữa ca và không có cặp trùng trong các bản còn lại (cùng ngày + người + SP + TT + team).'
            );
            return;
        }
        if (
            !window.confirm(
                `Sẽ xóa ${toDelete.length} bản ghi (trong ${allReports.length} dòng hiện tại).\n\n` +
                    '• Xóa toàn bộ dòng có Ca = Giữa ca.\n' +
                    '• Trong phần không phải Giữa ca: gộp trùng (cùng ngày, người, SP, TT, team), giữ bản mới nhất.\n\n' +
                    'Tiếp tục?'
            )
        ) {
            return;
        }
        setRemovingDuplicates(true);
        try {
            const BATCH = 500;
            for (let i = 0; i < toDelete.length; i += BATCH) {
                const batch = toDelete.slice(i, i + BATCH);
                const { error } = await supabase.from('sales_reports').delete().in('id', batch);
                if (error) throw error;
            }
            setSelectedReportIds((prev) => {
                const drop = new Set(toDelete);
                const next = new Set();
                prev.forEach((id) => {
                    if (!drop.has(id)) next.add(id);
                });
                return next;
            });
            toast.success(`Đã xóa ${toDelete.length} bản ghi (Giữa ca + trùng).`);
            fetchData();
        } catch (e) {
            console.error('handleRemoveDuplicateReports:', e);
            toast.error('Lỗi khi xóa trùng: ' + (e.message || String(e)));
        } finally {
            setRemovingDuplicates(false);
        }
    };

    // Calculate pagination
    const totalPages = Math.ceil(allReports.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedReports = allReports.slice(startIndex, endIndex);

    const pageRowIds = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return allReports.slice(start, start + itemsPerPage).map((r) => r.id).filter(Boolean);
    }, [allReports, currentPage, itemsPerPage]);

    const allPageRowsSelected =
        pageRowIds.length > 0 && pageRowIds.every((id) => selectedReportIds.has(id));

    const toggleSelectAllOnPage = () => {
        setSelectedReportIds((prev) => {
            const next = new Set(prev);
            if (allPageRowsSelected) {
                pageRowIds.forEach((id) => next.delete(id));
            } else {
                pageRowIds.forEach((id) => next.add(id));
            }
            return next;
        });
    };

    // Update displayed reports when pagination changes
    useEffect(() => {
        setManualReports(paginatedReports);
    }, [currentPage, itemsPerPage, allReports]);

    // Bỏ khỏi lựa chọn những id không còn trong danh sách đã lọc (đổi filter / xóa)
    useEffect(() => {
        const valid = new Set((allReports || []).map((r) => r.id).filter(Boolean));
        setSelectedReportIds((prev) => {
            let removed = false;
            const next = new Set();
            prev.forEach((id) => {
                if (valid.has(id)) next.add(id);
                else removed = true;
            });
            if (!removed && next.size === prev.size) return prev;
            return next;
        });
    }, [allReports]);

    /** Tổng các cột — cùng cột / nguồn DB như DanhSachBaoCaoTay (Sale). */
    const reportColumnTotals = useMemo(() => {
        return allReports.reduce(
            (acc, item) => ({
                mess_count: acc.mess_count + Number(item.mess_count || 0),
                response_count: acc.response_count + Number(item.response_count || 0),
                order_count: acc.order_count + Number(item.order_count || 0),
                order_cancel_count: acc.order_cancel_count + Number(item.order_cancel_count || 0),
                revenue_actual: acc.revenue_actual + Number(item.revenue_actual || 0),
                revenue_cancel_actual:
                    acc.revenue_cancel_actual + Number(item.revenue_cancel_actual || 0),
                order_go: acc.order_go + Number(item.order_go || 0),
                revenue_go_actual: acc.revenue_go_actual + Number(item.revenue_go_actual || 0),
            }),
            {
                mess_count: 0,
                response_count: 0,
                order_count: 0,
                order_cancel_count: 0,
                revenue_actual: 0,
                revenue_cancel_actual: 0,
                order_go: 0,
                revenue_go_actual: 0,
            }
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

    if (!hasPageAccess) {
        return (
            <div className="p-8 text-center text-red-600 font-bold">
                Bạn không có quyền truy cập trang này. Cần một trong: {accessCodes.join(', ')}.
            </div>
        );
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
            order_cancel_count: report.order_cancel_count || 0,
            order_go: report.order_go || 0,
            revenue_actual: report.revenue_actual,
            revenue_cancel_actual: report.revenue_cancel_actual || 0,
            revenue_go_actual: report.revenue_go_actual || 0,
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
                    order_cancel_count: Number(editForm.order_cancel_count) || 0,
                    order_go: Number(editForm.order_go) || 0,
                    revenue_actual: Number(editForm.revenue_actual) || 0,
                    revenue_cancel_actual: Number(editForm.revenue_cancel_actual) || 0,
                    revenue_go_actual: Number(editForm.revenue_go_actual) || 0,
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
                        <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px 0' }}>
                            Chỉ hiển thị nhân sự team <strong>{teamFilterLabel}</strong> (bảng users).
                        </p>
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
                    <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h2 style={{ marginBottom: '4px' }}>DANH SÁCH BÁO CÁO TAY CSKH{pageTitleSuffix}</h2>
                            <p className="text-sm text-gray-600 m-0">
                                <>
                                    Chỉ dữ liệu <strong>sales_reports.team</strong> ∈ {teamFilterLabel}.
                                </>
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {isAdminOnly && (
                                <button
                                    type="button"
                                    onClick={handleCalculateAndUpdateOrders}
                                    disabled={updatingOrders || loading || removingDuplicates}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
                                    title="Tính từ Supabase orders + tự thêm dòng thiếu — giống Admin Tools (cài đặt)"
                                >
                                    {updatingOrders ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            Đang tính... ({updateProgress.current}/{updateProgress.total})
                                        </>
                                    ) : (
                                        <>
                                            <Calculator className="w-4 h-4" />
                                            Tính số đơn (như Sale)
                                        </>
                                    )}
                                </button>
                            )}
                            {isAdmin && selectedReportIds.size > 0 && (
                                <button
                                    type="button"
                                    onClick={handleBulkDeleteReports}
                                    disabled={deletingBulk || loading || updatingOrders || removingDuplicates}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition"
                                >
                                    {deletingBulk
                                        ? 'Đang xóa...'
                                        : `Xóa đã chọn (${selectedReportIds.size})`}
                                </button>
                            )}
                            {isAdminOnly && (
                                <button
                                    type="button"
                                    onClick={handleRemoveDuplicateReports}
                                    disabled={
                                        removingDuplicates ||
                                        loading ||
                                        updatingOrders ||
                                        !allReports.length
                                    }
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition"
                                    title="Xóa hết dòng Giữa ca; các dòng còn lại: gộp trùng (không tính Ca), giữ bản mới nhất"
                                >
                                    {removingDuplicates ? 'Đang xóa trùng...' : 'Xóa bản ghi trùng'}
                                </button>
                            )}
                            {isAdminOnly && (
                                <button
                                    type="button"
                                    onClick={handleSyncTeamFromUsers}
                                    disabled={teamSyncing || loading || updatingOrders || removingDuplicates}
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
                                    {isAdmin && (
                                        <th className="text-center w-10" title="Chọn dòng trên trang này">
                                            <input
                                                type="checkbox"
                                                checked={allPageRowsSelected}
                                                disabled={pageRowIds.length === 0 || deletingBulk || removingDuplicates}
                                                onChange={toggleSelectAllOnPage}
                                                aria-label="Chọn tất cả trang hiện tại"
                                            />
                                        </th>
                                    )}
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
                                    <th>Số đơn hủy</th>
                                    <th>Doanh số</th>
                                    <th>Doanh số hủy</th>
                                    <th>Số đơn go</th>
                                    <th>Doanh số go</th>
                                    <th>Thao tác</th>
                                </tr>
                                {allReports.length > 0 && (
                                    <tr className="total-row dsbcskh-thead-totals">
                                        <th
                                            colSpan={isAdmin ? 8 : 7}
                                            className="total-label"
                                        >
                                            Tổng cộng ({allReports.length} dòng)
                                        </th>
                                        <th className="total-value">{formatNumber(reportColumnTotals.mess_count)}</th>
                                        <th className="total-value">{formatNumber(reportColumnTotals.response_count)}</th>
                                        <th className="total-value">{formatNumber(reportColumnTotals.order_count)}</th>
                                        <th className="total-value">
                                            {formatNumber(reportColumnTotals.order_cancel_count)}
                                        </th>
                                        <th className="total-value">
                                            {formatCurrency(reportColumnTotals.revenue_actual)}
                                        </th>
                                        <th className="total-value">
                                            {formatCurrency(reportColumnTotals.revenue_cancel_actual)}
                                        </th>
                                        <th className="total-value">{formatNumber(reportColumnTotals.order_go)}</th>
                                        <th className="total-value">
                                            {formatCurrency(reportColumnTotals.revenue_go_actual)}
                                        </th>
                                        <th className="total-value" aria-hidden="true">—</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {manualReports.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={isAdmin ? 17 : 16}
                                            className="text-center"
                                        >
                                            {loading ? 'Đang tải...' : 'Không có dữ liệu trong khoảng thời gian này.'}
                                        </td>
                                    </tr>
                                ) : (
                                    manualReports.map((item, index) => {
                                        return (
                                            <tr key={item.id || index}>
                                                {isAdmin && (
                                                    <td className="text-center align-middle">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedReportIds.has(item.id)}
                                                            disabled={!item.id || deletingBulk || removingDuplicates}
                                                            onChange={() => toggleReportSelected(item.id)}
                                                            aria-label={`Chọn báo cáo ${startIndex + index + 1}`}
                                                        />
                                                    </td>
                                                )}
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
                                                <td>{formatNumber(item.order_cancel_count || 0)}</td>
                                                <td>{formatCurrency(item.revenue_actual || 0)}</td>
                                                <td>{formatCurrency(item.revenue_cancel_actual || 0)}</td>
                                                <td>{formatNumber(item.order_go || 0)}</td>
                                                <td>{formatCurrency(item.revenue_go_actual || 0)}</td>
                                                <td className="text-center">
                                                    <div className="flex gap-2 justify-center">
                                                        <button
                                                            className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs transition flex items-center gap-1"
                                                            onClick={() => handleViewOrders(item)}
                                                            title="Xem danh sách đơn (Lumidata — như Sale)"
                                                        >
                                                            <Eye className="w-3 h-3" />
                                                            Xem
                                                        </button>
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
                                                                disabled={deletingId === item.id || deletingBulk || removingDuplicates}
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-6 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl relative">
                        <h3 className="text-lg font-bold mb-4 text-blue-600 border-b pb-2">Sửa Báo Cáo CSKH</h3>

                        <div className="mb-4 text-sm text-gray-600">
                            <p><strong>Nhân viên:</strong> {editingReport.name}</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
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
                            <div className="sm:col-span-2">
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
                                <label className="block text-sm font-medium mb-1">Số đơn hủy:</label>
                                <input type="number" name="order_cancel_count" value={editForm.order_cancel_count || 0} onChange={handleInputChange} className="w-full border rounded px-2 py-1" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Doanh số:</label>
                                <input type="number" name="revenue_actual" value={editForm.revenue_actual} onChange={handleInputChange} className="w-full border rounded px-2 py-1" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Doanh số hủy:</label>
                                <input type="number" name="revenue_cancel_actual" value={editForm.revenue_cancel_actual || 0} onChange={handleInputChange} className="w-full border rounded px-2 py-1" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Số đơn go:</label>
                                <input type="number" name="order_go" value={editForm.order_go || 0} onChange={handleInputChange} className="w-full border rounded px-2 py-1" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Doanh số go:</label>
                                <input type="number" name="revenue_go_actual" value={editForm.revenue_go_actual || 0} onChange={handleInputChange} className="w-full border rounded px-2 py-1" />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={handleCloseModal} disabled={saving} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm text-gray-800">Hủy</button>
                            <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu Thay Đổi'}</button>
                        </div>
                    </div>
                </div>
            )}

            {showViewOrdersModal && viewingReport && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">Danh sách đơn hàng</h2>
                                <p className="text-sm text-gray-600 mt-1">
                                    {viewingReport.name} - {formatDate(viewingReport.date)} - {viewingReport.shift || 'Không có ca'} - {viewingReport.product || 'Tất cả SP'} - {viewingReport.market || 'Tất cả TT'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowViewOrdersModal(false);
                                    setViewingReport(null);
                                    setViewingOrders([]);
                                }}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6">
                            {loadingOrders ? (
                                <div className="flex items-center justify-center py-8">
                                    <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                                    <span className="ml-2 text-gray-600">Đang tải danh sách đơn...</span>
                                </div>
                            ) : viewingOrders.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    Không tìm thấy đơn hàng nào thỏa mãn điều kiện.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <p className="text-sm text-gray-600">Tổng số đơn:</p>
                                        <p className="text-2xl font-bold text-blue-600">{viewingOrders.length} đơn</p>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left border border-gray-200">STT</th>
                                                    <th className="px-4 py-3 text-left border border-gray-200">Mã đơn</th>
                                                    <th className="px-4 py-3 text-left border border-gray-200">Tên</th>
                                                    <th className="px-4 py-3 text-left border border-gray-200">Ngày</th>
                                                    <th className="px-4 py-3 text-left border border-gray-200">Ca</th>
                                                    <th className="px-4 py-3 text-left border border-gray-200">Sale</th>
                                                    <th className="px-4 py-3 text-left border border-gray-200">Sản phẩm</th>
                                                    <th className="px-4 py-3 text-left border border-gray-200">Thị trường</th>
                                                    <th className="px-4 py-3 text-right border border-gray-200">Doanh thu (VNĐ)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {viewingOrders.map((order, index) => (
                                                    <tr key={order.id || index} className="hover:bg-gray-50">
                                                        <td className="px-4 py-2 border border-gray-200">{index + 1}</td>
                                                        <td className="px-4 py-2 border border-gray-200">
                                                            <div className="font-mono text-sm font-semibold text-blue-600">
                                                                {order.order_code || order.id || '-'}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2 border border-gray-200">{order.customer_name || '-'}</td>
                                                        <td className="px-4 py-2 border border-gray-200">{formatDate(order.order_date)}</td>
                                                        <td className="px-4 py-2 border border-gray-200">{order.shift || '-'}</td>
                                                        <td className="px-4 py-2 border border-gray-200">
                                                            <div className="font-medium text-gray-900">
                                                                {order.nhanvien_sale || order.sale_staff || '-'}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2 border border-gray-200">{order.product || '-'}</td>
                                                        <td className="px-4 py-2 border border-gray-200">{order.country || '-'}</td>
                                                        <td className="px-4 py-2 border border-gray-200 text-right">
                                                            {formatCurrency(order.total_amount_vnd || order.total_vnd || 0)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-gray-50 font-semibold">
                                                <tr>
                                                    <td colSpan={8} className="px-4 py-3 text-right border border-gray-200">
                                                        Tổng doanh thu:
                                                    </td>
                                                    <td className="px-4 py-3 text-right border border-gray-200 text-blue-600">
                                                        {formatCurrency(
                                                            viewingOrders.reduce(
                                                                (sum, order) =>
                                                                    sum + (parseFloat(order.total_amount_vnd || order.total_vnd) || 0),
                                                                0
                                                            )
                                                        )}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowViewOrdersModal(false);
                                    setViewingReport(null);
                                    setViewingOrders([]);
                                }}
                                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
