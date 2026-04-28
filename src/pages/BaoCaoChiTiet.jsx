import { ChevronLeft, RefreshCw, Search, Settings } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import ColumnSettingsModal from '../components/ColumnSettingsModal';
import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';
import { COLUMN_MAPPING, PRIMARY_KEY_COLUMN } from '../types';
import { isDateInRange, parseSmartDate } from '../utils/dateParsing';

function isManagerRole(roleStr, legacyStr) {
    const r = (roleStr || '').toLowerCase();
    const l = (legacyStr || '').toLowerCase();
    const mgr = ['admin', 'director', 'manager', 'super_admin', 'finance', 'administrator'];
    return mgr.includes(r) || mgr.includes(l);
}

/** Cùng nguồn hiển thị với cột lưới — giống danh-sach-don */
function rowDisplaySaleStaff(row) {
    return String(row?.['Nhân viên Sale'] ?? row?.sale_staff ?? '').trim();
}
function rowDisplayMktStaff(row) {
    return String(row?.['Nhân viên Marketing'] ?? row?.marketing_staff ?? '').trim();
}

function uniqueColumnValuesWithTrong(rows, colKey) {
    const set = new Set();
    let hasEmpty = false;
    for (const row of rows || []) {
        const raw = row[colKey];
        const t = raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
        if (t) set.add(t);
        else hasEmpty = true;
    }
    const sorted = [...set].sort((a, b) => a.localeCompare(b, 'vi'));
    return hasEmpty ? ['(Trống)', ...sorted] : sorted;
}

function filterByMultiTrong(selected, cellRaw) {
    if (!selected || selected.length === 0) return true;
    const t = cellRaw != null && String(cellRaw).trim() !== '' ? String(cellRaw).trim() : '';
    if (selected.includes('(Trống)') && !t) return true;
    return selected.includes(t);
}

/** Dropdown đa chọn + checkbox — cùng mẫu danh-sach-don */
function MultiCheckboxFilter({
    label,
    open,
    onOpenChange,
    selected,
    onSelected,
    options,
    searchText,
    onSearchText,
    showSearch,
    enableSelectAllFiltered
}) {
    const summary =
        selected.length === 0 ? 'Tất cả' : selected.length === 1 ? selected[0] : `Đã chọn ${selected.length}`;

    const toggleOption = (opt, checked) => {
        if (checked) onSelected([...selected, opt]);
        else onSelected(selected.filter((x) => x !== opt));
    };

    return (
        <div className="min-w-[200px] relative">
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{label}</label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => onOpenChange(!open)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                >
                    <span className="truncate">{summary}</span>
                    <span className="ml-2 shrink-0">▼</span>
                </button>
                {open && (
                    <div className="absolute z-[50] mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        <div className="p-2">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                                <span className="text-xs font-semibold text-gray-700">Chọn:</span>
                                <div className="flex items-center gap-3">
                                    {enableSelectAllFiltered ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onSelected(Array.from(new Set([...(selected || []), ...options])))
                                            }
                                            className="text-xs text-blue-600 hover:text-blue-800"
                                        >
                                            Chọn tất cả
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSelected([]);
                                            onOpenChange(false);
                                        }}
                                        className="text-xs text-blue-600 hover:text-blue-800"
                                    >
                                        Bỏ chọn tất cả
                                    </button>
                                </div>
                            </div>
                            {showSearch ? (
                                <div className="mb-2">
                                    <input
                                        type="text"
                                        value={searchText}
                                        onChange={(e) => onSearchText(e.target.value)}
                                        placeholder="Gõ để tìm nhanh..."
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                                    />
                                </div>
                            ) : null}
                            {options.map((opt) => (
                                <label
                                    key={String(opt)}
                                    className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(opt)}
                                        onChange={(e) => toggleOption(opt, e.target.checked)}
                                        className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">{opt}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {open ? (
                <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} aria-hidden />
            ) : null}
        </div>
    );
}

function BaoCaoChiTiet({ dataSource = 'default' }) {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // 'RD' or null
    const isHcm = dataSource === 'hcm';
    const ordersTableName = isHcm ? 'order_code_hcm' : 'orders';
    const visibleColumnsStorageKey = isHcm
        ? 'baoCaoChiTiet_visibleColumns_hcm'
        : 'baoCaoChiTiet_visibleColumns';

    // Permission Logic
    const { canView, role, loading: permissionsLoading } = usePermissions();
    const permissionCode = teamFilter === 'RD' ? 'RND_ORDERS' : 'MKT_ORDERS';
    const hasChiTietAccess = isHcm ? canView('MKT_ORDERS_HCM') : canView(permissionCode);
    const deniedPermissionLabel = isHcm ? 'MKT_ORDERS_HCM' : permissionCode;

    // Get User Name for filtering
    const userJson = localStorage.getItem("user");
    const user = userJson ? JSON.parse(userJson) : null;
    const userName = localStorage.getItem("username") || user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || user?.username || user?.name || "";



    const [allData, setAllData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [debouncedSearchText, setDebouncedSearchText] = useState('');
    const [filterMarket, setFilterMarket] = useState([]);
    const [filterProduct, setFilterProduct] = useState([]);
    const [filterStatus, setFilterStatus] = useState([]);
    const [filterCheckResult, setFilterCheckResult] = useState([]);
    const [showMarketFilter, setShowMarketFilter] = useState(false);
    const [showProductFilter, setShowProductFilter] = useState(false);
    const [showStatusFilter, setShowStatusFilter] = useState(false);
    const [showCheckResultFilter, setShowCheckResultFilter] = useState(false);
    const [checkResultFilterSearchText, setCheckResultFilterSearchText] = useState('');
    const [filterSaleStaff, setFilterSaleStaff] = useState([]);
    const [showSaleStaffFilter, setShowSaleStaffFilter] = useState(false);
    const [saleStaffFilterSearchText, setSaleStaffFilterSearchText] = useState('');
    const [filterMktStaff, setFilterMktStaff] = useState([]);
    const [showMktStaffFilter, setShowMktStaffFilter] = useState(false);
    const [mktStaffFilterSearchText, setMktStaffFilterSearchText] = useState('');
    const [filterDeliveryStaff, setFilterDeliveryStaff] = useState([]);
    const [showDeliveryStaffFilter, setShowDeliveryStaffFilter] = useState(false);
    const [deliveryStaffFilterSearchText, setDeliveryStaffFilterSearchText] = useState('');
    const [filterTeam, setFilterTeam] = useState([]);
    const [showTeamFilter, setShowTeamFilter] = useState(false);
    const [teamFilterSearchText, setTeamFilterSearchText] = useState('');
    const [filterPage, setFilterPage] = useState([]);
    const [showPageFilter, setShowPageFilter] = useState(false);
    const [pageFilterSearchText, setPageFilterSearchText] = useState('');
    const [filterPaymentDetail, setFilterPaymentDetail] = useState([]);
    const [showPaymentDetailFilter, setShowPaymentDetailFilter] = useState(false);
    const [paymentDetailFilterSearchText, setPaymentDetailFilterSearchText] = useState('');
    const [filterCskh, setFilterCskh] = useState([]);
    const [showCskhFilter, setShowCskhFilter] = useState(false);
    const [cskhFilterSearchText, setCskhFilterSearchText] = useState('');
    const [filterShippingUnit, setFilterShippingUnit] = useState([]);
    const [showShippingUnitFilter, setShowShippingUnitFilter] = useState(false);
    const [shippingUnitFilterSearchText, setShippingUnitFilterSearchText] = useState('');
    // User thường: mặc định 3 ngày. Admin/Manager: sau khi load quyền → để trống = xem full (lọc theo ngày tùy chọn).
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 3);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

    useEffect(() => {
        if (permissionsLoading) return;
        const legacy = localStorage.getItem('userRole') || '';
        if (isManagerRole(role, legacy)) {
            setStartDate('');
            setEndDate('');
        }
    }, [permissionsLoading, role]);

    const [filterBranch, setFilterBranch] = useState('');
    const [userBranchMap, setUserBranchMap] = useState({});
    const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]);
    const [selectedPersonnelReady, setSelectedPersonnelReady] = useState(false);
    const [rdProducts, setRdProducts] = useState([]);
    const [rdProductsReady, setRdProductsReady] = useState(teamFilter !== 'RD');

    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const [sortColumn, setSortColumn] = useState(null);
    const [sortDirection, setSortDirection] = useState('asc');
    const [showColumnSettings, setShowColumnSettings] = useState(false);
    const [syncing, setSyncing] = useState(false); // State for sync process

    // Danh sách nhân sự được phép xem theo users.selected_personnel của tài khoản hiện tại.
    useEffect(() => {
        const loadSelectedPersonnel = async () => {
            try {
                const userEmail = String(localStorage.getItem('userEmail') || user?.email || '').trim().toLowerCase();
                if (!userEmail) {
                    setSelectedPersonnelNames([]);
                    return;
                }
                const personnelMap = await rbacService.getSelectedPersonnel([userEmail]);
                const personnelNames = personnelMap[userEmail] || [];
                const validNames = [...new Set(
                    personnelNames
                        .map((name) => String(name || '').trim())
                        .filter((name) => name && !name.includes('@'))
                )];
                setSelectedPersonnelNames(validNames);
            } catch (error) {
                console.error('[BaoCaoChiTiet] load selected personnel:', error);
                setSelectedPersonnelNames([]);
            } finally {
                setSelectedPersonnelReady(true);
            }
        };
        loadSelectedPersonnel();
    }, [user?.email]);

    useEffect(() => {
        if (teamFilter !== 'RD') {
            setRdProducts([]);
            setRdProductsReady(true);
            return;
        }
        let cancelled = false;
        setRdProductsReady(false);
        (async () => {
            try {
                const { data, error } = await supabase
                    .from('system_settings')
                    .select('name')
                    .eq('type', 'test')
                    .order('name', { ascending: true });
                if (error) throw error;
                const names = (data || [])
                    .map((r) => String(r?.name || '').trim())
                    .filter(Boolean);
                if (!cancelled) setRdProducts(names);
            } catch (e) {
                console.error('[BaoCaoChiTiet] load RD products:', e);
                if (!cancelled) setRdProducts([]);
            } finally {
                if (!cancelled) setRdProductsReady(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [teamFilter]);

    // List of columns that should be hidden/removed (no longer in mapSupabaseToUI)
    const REMOVED_COLUMNS = [
        'Phí ship',
        'Tiền Hàng',
        'Phí Chung',
        'Phí bay',
        'Thuê TK',
        'Phí xử lý đơn đóng hàng-Lưu kho(usd)',
        'Thời gian cutoff',
        '_id',
        '_source'
    ];

    const defaultColumns = [
        'Mã đơn hàng',
        'Ngày lên đơn',
        'Name*',
        'Phone*',
        'Khu vực',
        'Mặt hàng',
        'Mã Tracking',
        'Trạng thái giao hàng',
        'Ngày đối soát bill',
        'Ngày đối soát cước',
        'Tổng tiền VNĐ',
        'Page'
    ];

    // Debounce search text for better performance
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchText(searchText);
            setCurrentPage(1); // Reset to first page when search changes
        }, 300);
        return () => clearTimeout(timer);
    }, [searchText]);

    // Get all available columns from data (excluding removed columns and technical columns)
    const allAvailableColumns = useMemo(() => {
        if (allData.length === 0) return [];

        // Get all potential keys from data
        const allKeys = new Set();
        allData.forEach(row => {
            Object.keys(row).forEach(key => {
                // Exclude PRIMARY_KEY_COLUMN, REMOVED_COLUMNS, and technical columns
                if (key !== PRIMARY_KEY_COLUMN &&
                    !REMOVED_COLUMNS.includes(key) &&
                    !key.startsWith('_')) {
                    allKeys.add(key);
                }
            });
        });

        const pinnedEndColumns = ['Trạng thái giao hàng', 'Tổng tiền VNĐ'];

        const startDefaults = defaultColumns
            .filter(col => !pinnedEndColumns.includes(col) && allKeys.has(col));

        const otherCols = Array.from(allKeys)
            .filter(key => !defaultColumns.includes(key))
            .sort();

        const endCols = pinnedEndColumns.filter(col => allKeys.has(col));

        return [...startDefaults, ...otherCols, ...endCols];
    }, [allData]);

    // Load column visibility from localStorage or use defaults
    const [visibleColumns, setVisibleColumns] = useState(() => {
        const saved = localStorage.getItem(visibleColumnsStorageKey);
        let initial = {};

        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Remove any columns that are no longer available
                Object.keys(parsed).forEach(col => {
                    // Only keep columns that are not in REMOVED_COLUMNS
                    if (!REMOVED_COLUMNS.includes(col)) {
                        initial[col] = parsed[col];
                    }
                });
            } catch (e) {
                console.error('Error parsing saved columns:', e);
            }
        }

        // Initialize with default columns if empty
        if (Object.keys(initial).length === 0) {
            defaultColumns.forEach(col => {
                initial[col] = true;
            });
        } else {
            // Ensure default columns are present
            defaultColumns.forEach(col => {
                if (initial[col] === undefined) {
                    initial[col] = true;
                }
            });
        }

        return initial;
    });

    // Clean up removed columns from visibleColumns on mount
    useEffect(() => {
        setVisibleColumns(prev => {
            let updated = { ...prev };
            let changed = false;

            // Remove any removed columns
            REMOVED_COLUMNS.forEach(col => {
                if (updated[col] !== undefined) {
                    delete updated[col];
                    changed = true;
                }
            });

            // Ensure default columns are present
            defaultColumns.forEach(col => {
                if (updated[col] === undefined) {
                    updated[col] = true;
                    changed = true;
                }
            });

            return changed ? updated : prev;
        });
    }, []); // Only run once on mount

    // Update displayColumns based on visibleColumns
    const displayColumns = useMemo(() => {
        return allAvailableColumns.filter(col => visibleColumns[col] === true);
    }, [allAvailableColumns, visibleColumns]);

    // Save to localStorage when visibleColumns changes (excluding removed columns)
    useEffect(() => {
        if (Object.keys(visibleColumns).length > 0) {
            // Clean up: remove any columns that are no longer available
            const cleaned = {};
            Object.keys(visibleColumns).forEach(col => {
                if (!REMOVED_COLUMNS.includes(col)) {
                    cleaned[col] = visibleColumns[col];
                }
            });
            localStorage.setItem(visibleColumnsStorageKey, JSON.stringify(cleaned));
        }
    }, [visibleColumns, visibleColumnsStorageKey]);

    // Helper: Map Supabase DB row to UI format
    const mapSupabaseToUI = (item) => ({
        "Mã đơn hàng": item.order_code,
        "Ngày lên đơn": item.order_date || item.created_at?.split('T')[0],
        "Name*": item.customer_name,
        "Phone*": item.customer_phone,
        "Add": item.customer_address,
        "City": item.city,
        "State": item.state,
        "Khu vực": item.country, // Lấy từ country
        "Zipcode": item.zipcode,
        "Mặt hàng": item.product,
        "Tên mặt hàng 1": item.product_name_1 || item.product,
        "Tổng tiền VNĐ": item.total_amount_vnd,
        "Hình thức thanh toán": item.payment_method_text || item.payment_method, // payment_method_text is new
        "Mã Tracking": item.tracking_code,
        "Nhân viên Marketing": item.marketing_staff,
        "Nhân viên Sale": item.sale_staff,
        "Team": item.team,
        "Trạng thái giao hàng": item.delivery_status,
        "Kết quả Check": item.payment_status,
        "Ghi chú": item.note,
        "CSKH": item.cskh,
        "NV Vận đơn": item.delivery_staff,
        "Tiền Việt đã đối soát": item.reconciled_vnd || item.reconciled_amount, // reconciled_vnd new
        "Đơn vị vận chuyển": item.shipping_unit || item.shipping_carrier, // shipping_carrier might be new?
        "Kế toán xác nhận thu tiền về": item.accountant_confirm,
        "Ngày đối soát bill": item.ngay_doi_soat_bill || '',
        "Ngày đối soát cước": item.ngay_doi_soat_cuoc || '',
        "Trạng thái thu tiền": item.payment_status_detail,
        "Lý do": item.reason,
        "Page": item.page_name // Map Page Name
        // Note: _id and _source are excluded from mapSupabaseToUI to prevent them from appearing in column settings
    });

    // Load data from Supabase only
    const loadData = async () => {
        if (!selectedPersonnelReady) return;
        if (teamFilter === 'RD' && !rdProductsReady) return;
        setLoading(true);
        try {
            console.log(`Loading MKT Detail data from Supabase (${ordersTableName})...`);

            // 1. Fetch Supabase Data
            let query = supabase.from(ordersTableName).select('*');

            // --- USER FILTER (Re-applied) ---
            // Admin/Director/Manager/Finance: không lọc NV (xem full). Staff: chỉ đơn MKT của mình.
            const legacyRole = localStorage.getItem('userRole') || '';
            const roleLower = (role || '').toLowerCase();
            const isManager = isManagerRole(role, legacyRole);

            // Admin/Manager luôn xem full; user thường lọc theo users.selected_personnel.
            if (!isManager && selectedPersonnelNames.length > 0) {
                query = query.in('marketing_staff', selectedPersonnelNames);
            } else if (!isManager && userName) {
                query = query.ilike('marketing_staff', `%${String(userName).trim()}%`);
            }

            query = query.order('order_date', { ascending: false });

            if (isManager) {
                // Full dữ liệu: không ép khoảng ngày khi UI để trống; có chọn ngày thì thu hẹp trên server.
                if (startDate && endDate) {
                    query = query
                        .gte('order_date', startDate)
                        .lte('order_date', `${endDate}T23:59:59`);
                }
                query = query.limit(40000);
            } else if (startDate && endDate) {
                query = query
                    .gte('order_date', startDate)
                    .lte('order_date', `${endDate}T23:59:59`)
                    .limit(20000);
            } else {
                query = query.limit(100);
            }

            const { data: supaData, error: supaError } = await query;

            if (supaError) throw supaError;

            // 2. Process Supabase Data
            let supaMapped = (supaData || []).map(mapSupabaseToUI);
            if (teamFilter === 'RD') {
                const rdSet = new Set(rdProducts.map((p) => p.toLowerCase()));
                supaMapped = supaMapped.filter((row) =>
                    rdSet.has(String(row['Mặt hàng'] || '').trim().toLowerCase())
                );
            }

            console.log(`Loaded: ${supaMapped.length} rows from ${ordersTableName}.`);
            setAllData(supaMapped);

        } catch (error) {
            console.error('Load data error:', error);
            alert(`❌ Lỗi tải dữ liệu: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (permissionsLoading || !selectedPersonnelReady) return;
        if (teamFilter === 'RD' && !rdProductsReady) return;
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startDate, endDate, role, userName, permissionsLoading, ordersTableName, selectedPersonnelReady, selectedPersonnelNames, teamFilter, rdProductsReady, rdProducts]);

    // Fetch user branch mapping
    useEffect(() => {
        const fetchUserBranches = async () => {
            try {
                const map = {};

                // 1. Fetch from users
                const { data: usersData, error: usersError } = await supabase
                    .from('users')
                    .select('name, branch')
                    .not('branch', 'is', null)
                    .neq('branch', '');

                if (!usersError && usersData) {
                    usersData.forEach(u => {
                        if (u.name) map[u.name.toLowerCase().trim()] = u.branch;
                    });
                }

                // 2. Fetch from human_resources
                const { data: hrData, error: hrError } = await supabase
                    .from('human_resources')
                    .select('"Họ Và Tên", "chi nhánh"')
                    .not('"chi nhánh"', 'is', null)
                    .neq('"chi nhánh"', '');

                if (!hrError && hrData) {
                    hrData.forEach(h => {
                        const name = h['Họ Và Tên'];
                        const branch = h['chi nhánh'];
                        if (name && branch) {
                            const normName = name.toLowerCase().trim();
                            // Only add if not already in map (prefer user table)
                            if (!map[normName]) map[normName] = branch;
                        }
                    });
                }

                setUserBranchMap(map);
            } catch (err) {
                console.error('Error fetching user branches:', err);
            }
        };
        fetchUserBranches();
    }, []);

    // Get unique values for filters
    const uniqueMarkets = useMemo(() => {
        const markets = new Set();
        let hasEmpty = false;
        allData.forEach((row) => {
            const market = row['Khu vực'] || row['khu vực'];
            if (market && String(market).trim()) markets.add(String(market).trim());
            else hasEmpty = true;
        });
        const sorted = Array.from(markets).sort((a, b) => a.localeCompare(b, 'vi'));
        return hasEmpty ? ['(Trống)', ...sorted] : sorted;
    }, [allData]);

    // Sync data from F3 Firebase (Optional here, but kept if user wants to sync from here too)
    const handleSyncF3 = async () => {
        if (!window.confirm("Bạn có chắc chắn muốn đồng bộ dữ liệu từ F3 (Firebase) về Supabase? Dữ liệu cũ trên Supabase có thể bị ghi đè hoặc trùng lặp.")) return;

        try {
            setSyncing(true);
            const F3_URL = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json";
            console.log("Fetching F3 data from:", F3_URL);

            const response = await fetch(F3_URL);
            const dataRaw = await response.json();

            let firebaseData = [];
            if (Array.isArray(dataRaw)) {
                firebaseData = dataRaw;
            } else if (dataRaw && typeof dataRaw === 'object') {
                firebaseData = Object.values(dataRaw);
            }

            if (firebaseData.length === 0) {
                alert("Không tìm thấy dữ liệu trên F3.");
                return;
            }

            // ... (Sync simplified for brevity, assume similar logic to DanhSachDon or reuse shared logic if extracted, but for now just basic confirm it functionality isn't main focus here, just viewing list)
            alert("Chức năng đồng bộ đầy đủ có trong phần Quản lý Sale. Vui lòng sử dụng bên đó để đảm bảo nhất quán.");
        } catch (error) {
            console.error("Sync error:", error);
            alert("Lỗi: " + error.message);
        } finally {
            setSyncing(false);
        }
    };

    const uniqueProducts = useMemo(() => {
        const products = new Set();
        let hasEmpty = false;
        allData.forEach((row) => {
            const product = row['Mặt hàng'];
            if (product && String(product).trim()) products.add(String(product).trim());
            else hasEmpty = true;
        });
        const sorted = Array.from(products).sort((a, b) => a.localeCompare(b, 'vi'));
        return hasEmpty ? ['(Trống)', ...sorted] : sorted;
    }, [allData]);

    const uniqueStatuses = useMemo(() => {
        const statuses = new Set();
        let hasEmpty = false;
        allData.forEach(row => {
            const status = row["Trạng thái giao hàng"];
            const t = status != null && String(status).trim() !== '' ? String(status).trim() : '';
            if (t) statuses.add(t);
            else hasEmpty = true;
        });
        const sorted = Array.from(statuses).sort((a, b) => a.localeCompare(b, 'vi'));
        return hasEmpty ? ['(Trống)', ...sorted] : sorted;
    }, [allData]);

    const uniqueCheckResults = useMemo(() => {
        const set = new Set();
        let hasEmpty = false;
        allData.forEach((row) => {
            const raw = row['Kết quả Check'];
            const t = raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
            if (t) set.add(t);
            else hasEmpty = true;
        });
        const sorted = [...set].sort((a, b) => a.localeCompare(b, 'vi'));
        return hasEmpty ? ['(Trống)', ...sorted] : sorted;
    }, [allData]);

    const filteredCheckResults = useMemo(() => {
        const kw = String(checkResultFilterSearchText || '').trim().toLowerCase();
        if (!kw) return uniqueCheckResults;
        return uniqueCheckResults.filter((v) => String(v || '').toLowerCase().includes(kw));
    }, [checkResultFilterSearchText, uniqueCheckResults]);

    const uniqueSaleStaff = useMemo(() => {
        const vals = new Set();
        let hasEmpty = false;
        allData.forEach((row) => {
            const v = rowDisplaySaleStaff(row);
            if (v) vals.add(v);
            else hasEmpty = true;
        });
        const sorted = [...vals].sort((a, b) => a.localeCompare(b, 'vi'));
        return hasEmpty ? ['(Trống)', ...sorted] : sorted;
    }, [allData]);

    const filteredSaleStaff = useMemo(() => {
        const kw = String(saleStaffFilterSearchText || '').trim().toLowerCase();
        if (!kw) return uniqueSaleStaff;
        return uniqueSaleStaff.filter((v) => String(v || '').toLowerCase().includes(kw));
    }, [saleStaffFilterSearchText, uniqueSaleStaff]);

    const uniqueMktStaff = useMemo(() => {
        const vals = new Set();
        let hasEmpty = false;
        allData.forEach((row) => {
            const v = rowDisplayMktStaff(row);
            if (v) vals.add(v);
            else hasEmpty = true;
        });
        const sorted = [...vals].sort((a, b) => a.localeCompare(b, 'vi'));
        return hasEmpty ? ['(Trống)', ...sorted] : sorted;
    }, [allData]);

    const filteredMktStaff = useMemo(() => {
        const kw = String(mktStaffFilterSearchText || '').trim().toLowerCase();
        if (!kw) return uniqueMktStaff;
        return uniqueMktStaff.filter((v) => String(v || '').toLowerCase().includes(kw));
    }, [mktStaffFilterSearchText, uniqueMktStaff]);

    const uniqueDeliveryStaff = useMemo(() => {
        const vals = new Set();
        let hasEmpty = false;
        allData.forEach((row) => {
            const v = row['NV Vận đơn'] ?? row.delivery_staff;
            const t = v != null && String(v).trim() !== '' ? String(v).trim() : '';
            if (t) vals.add(t);
            else hasEmpty = true;
        });
        const sorted = [...vals].sort((a, b) => a.localeCompare(b, 'vi'));
        return hasEmpty ? ['(Trống)', ...sorted] : sorted;
    }, [allData]);

    const filteredDeliveryStaff = useMemo(() => {
        const kw = String(deliveryStaffFilterSearchText || '').trim().toLowerCase();
        if (!kw) return uniqueDeliveryStaff;
        return uniqueDeliveryStaff.filter((v) => String(v || '').toLowerCase().includes(kw));
    }, [deliveryStaffFilterSearchText, uniqueDeliveryStaff]);

    const uniqueTeams = useMemo(() => uniqueColumnValuesWithTrong(allData, 'Team'), [allData]);
    const filteredTeams = useMemo(() => {
        const kw = String(teamFilterSearchText || '').trim().toLowerCase();
        if (!kw) return uniqueTeams;
        return uniqueTeams.filter((v) => String(v || '').toLowerCase().includes(kw));
    }, [teamFilterSearchText, uniqueTeams]);

    const uniquePages = useMemo(() => uniqueColumnValuesWithTrong(allData, 'Page'), [allData]);
    const filteredPages = useMemo(() => {
        const kw = String(pageFilterSearchText || '').trim().toLowerCase();
        if (!kw) return uniquePages;
        return uniquePages.filter((v) => String(v || '').toLowerCase().includes(kw));
    }, [pageFilterSearchText, uniquePages]);

    const uniquePaymentDetails = useMemo(
        () => uniqueColumnValuesWithTrong(allData, 'Trạng thái thu tiền'),
        [allData]
    );
    const filteredPaymentDetails = useMemo(() => {
        const kw = String(paymentDetailFilterSearchText || '').trim().toLowerCase();
        if (!kw) return uniquePaymentDetails;
        return uniquePaymentDetails.filter((v) => String(v || '').toLowerCase().includes(kw));
    }, [paymentDetailFilterSearchText, uniquePaymentDetails]);

    const uniqueCskh = useMemo(() => uniqueColumnValuesWithTrong(allData, 'CSKH'), [allData]);
    const filteredCskh = useMemo(() => {
        const kw = String(cskhFilterSearchText || '').trim().toLowerCase();
        if (!kw) return uniqueCskh;
        return uniqueCskh.filter((v) => String(v || '').toLowerCase().includes(kw));
    }, [cskhFilterSearchText, uniqueCskh]);

    const uniqueShippingUnits = useMemo(
        () => uniqueColumnValuesWithTrong(allData, 'Đơn vị vận chuyển'),
        [allData]
    );
    const filteredShippingUnits = useMemo(() => {
        const kw = String(shippingUnitFilterSearchText || '').trim().toLowerCase();
        if (!kw) return uniqueShippingUnits;
        return uniqueShippingUnits.filter((v) => String(v || '').toLowerCase().includes(kw));
    }, [shippingUnitFilterSearchText, uniqueShippingUnits]);

    // Helper: Parse Excel Date
    const parseExcelDate = (excelDate) => {
        if (!excelDate) return null;
        if (typeof excelDate === 'number') {
            const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
            return date.toISOString().split('T')[0];
        }
        return String(excelDate).split('T')[0];
    };

    // Import from Excel
    const handleImportExcel = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!window.confirm("Bạn có chắc chắn muốn nhập dữ liệu từ file Excel này? Dữ liệu sẽ được update dựa trên 'Mã đơn hàng'.")) return;

        setLoading(true);
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            console.log("Imported data:", jsonData);

            if (jsonData.length === 0) {
                alert("File Excel không có dữ liệu!");
                setLoading(false);
                return;
            }

            // Helper to get value case-insensitively
            const getValue = (item, keys) => {
                const itemKeys = Object.keys(item);
                for (const key of keys) {
                    const foundKey = itemKeys.find(k => k.trim().toLowerCase() === key.toLowerCase());
                    if (foundKey) return item[foundKey];
                }
                return undefined;
            };

            // Map Excel columns back to Supabase schema
            const validItems = jsonData.map((item, index) => {
                const orderCode = getValue(item, ['Mã đơn hàng', 'Order Code', 'ma don hang']);

                // If no order code found, skip generating one if possible to avoid duplicates, 
                // BUT if user really wants to create new, we fallback. 
                // Ideally, we shouldn't create "IMP-" unless we are sure it's NEW.
                // For now, let's keep logic but rely on better matching.
                const finalOrderCode = orderCode || `IMP-${Date.now()}-${index}`;

                // Validate essential fields
                const name = getValue(item, ['Name*', 'Tên khách hàng', 'Ten khach hang', 'Name']);
                const phone = getValue(item, ['Phone*', 'SĐT', 'SDT', 'Phone']);

                if (!finalOrderCode && !name && !phone) return null;

                // Helper for parsing integers but keeping undefined if missing
                const parseOrUndefined = (val) => {
                    if (val === undefined || val === null || String(val).trim() === '') return undefined;
                    const parsed = parseInt(String(val).replace(/\D/g, ''));
                    return isNaN(parsed) ? undefined : parsed;
                };

                return {
                    order_code: finalOrderCode,
                    order_date: getValue(item, ['Ngày lên đơn', 'Order Date', 'Ngay len don']) ? parseExcelDate(getValue(item, ['Ngày lên đơn', 'Order Date', 'Ngay len don'])) : (finalOrderCode.startsWith('IMP') ? new Date().toISOString() : undefined), // Only default date if new
                    customer_name: name || undefined,
                    customer_phone: phone || undefined,
                    customer_address: getValue(item, ['Add', 'Địa chỉ', 'Dia chi', 'Address']) || undefined,
                    city: getValue(item, ['City', 'Tỉnh/Thành']) || undefined,
                    state: getValue(item, ['State', 'Quận/Huyện']) || undefined,
                    country: getValue(item, ['Khu vực', 'Country', 'Khu vuc']) || undefined,
                    zipcode: getValue(item, ['Zipcode', 'Mã bưu điện']) || undefined,
                    product: getValue(item, ['Mặt hàng', 'Sản phẩm', 'Product', 'Mat hang']) || undefined,
                    total_amount_vnd: parseOrUndefined(getValue(item, ['Tổng tiền VNĐ', 'Tong tien VND', 'Total Amount'])),
                    tracking_code: getValue(item, ['Mã Tracking', 'Tracking Code', 'Ma Tracking']) || undefined,
                    payment_method: getValue(item, ['Hình thức thanh toán', 'Payment Method']) || undefined,
                    shipping_fee: parseOrUndefined(getValue(item, ['Phí ship', 'Shipping Fee', 'Phi ship'])),
                    marketing_staff: getValue(item, ['Nhân viên Marketing', 'MKT Staff', 'Nhan vien Marketing']) || undefined,
                    sale_staff: getValue(item, ['Nhân viên Sale', 'Sale Staff', 'Nhan vien Sale']) || undefined,
                    team: getValue(item, ['Team']) || undefined,
                    delivery_status: getValue(item, ['Trạng thái giao hàng', 'Delivery Status', 'Trang thai']) || undefined,
                    payment_status: getValue(item, ['Kết quả Check', 'Payment Status']) || undefined,
                    note: getValue(item, ['Ghi chú', 'Note', 'Ghi chu']) || undefined,
                    shipping_unit: getValue(item, ['Đơn vị vận chuyển', 'Shipping Unit', 'Don vi van chuyen']) || undefined,
                    page_name: getValue(item, ['Page', 'Page Name']) || undefined
                };
            }).filter(Boolean);

            if (validItems.length === 0) {
                alert("Không tìm thấy dữ liệu hợp lệ để nhập.");
                setLoading(false);
                return;
            }

            const { error } = await supabase
                .from(ordersTableName)
                .upsert(validItems, { onConflict: 'order_code' });

            if (error) throw error;

            alert(`✅ Đã nhập thành công ${validItems.length} dòng!`);
            loadData();
        } catch (error) {
            console.error("Import error:", error);
            alert("❌ Lỗi nhập file: " + error.message);
        } finally {
            e.target.value = '';
            setLoading(false);
        }
    };

    // Helper to normalize string for search (remove accents)
    const normalizeSearch = (str) => {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    };

    // Filter and sort data
    const filteredData = useMemo(() => {
        let data = [...allData];

        // Tìm kiếm — cùng phạm vi chính với danh-sach-don
        if (debouncedSearchText) {
            const searchNorm = normalizeSearch(debouncedSearchText);
            data = data.filter((row) => {
                return (
                    normalizeSearch(row['Mã đơn hàng']).includes(searchNorm) ||
                    normalizeSearch(row['Mã Tracking']).includes(searchNorm) ||
                    normalizeSearch(row['Name*']).includes(searchNorm) ||
                    normalizeSearch(row['Phone*']).includes(searchNorm) ||
                    normalizeSearch(row['Add']).includes(searchNorm) ||
                    normalizeSearch(row['City']).includes(searchNorm) ||
                    normalizeSearch(row['State']).includes(searchNorm) ||
                    normalizeSearch(row['Zipcode']).includes(searchNorm) ||
                    normalizeSearch(row['Khu vực']).includes(searchNorm) ||
                    normalizeSearch(rowDisplayMktStaff(row)).includes(searchNorm) ||
                    normalizeSearch(rowDisplaySaleStaff(row)).includes(searchNorm) ||
                    normalizeSearch(row['CSKH']).includes(searchNorm) ||
                    normalizeSearch(row['NV Vận đơn']).includes(searchNorm) ||
                    normalizeSearch(row['Team']).includes(searchNorm)
                );
            });
        }

        // Date Range Filter
        if (startDate || endDate) {
            data = data.filter(row => isDateInRange(row["Ngày lên đơn"], startDate, endDate));
        }

        // Market filter — đa chọn + «(Trống)» giống danh-sach-don
        if (filterMarket.length > 0) {
            data = data.filter((row) => {
                const market = row['Khu vực'] || row['khu vực'];
                const marketStr = market ? String(market).trim() : '';
                if (filterMarket.includes('(Trống)') && !marketStr) return true;
                return filterMarket.includes(marketStr);
            });
        }

        // Product filter
        if (filterProduct.length > 0) {
            data = data.filter((row) => {
                const product = row['Mặt hàng'];
                const productStr = product ? String(product).trim() : '';
                if (filterProduct.includes('(Trống)') && !productStr) return true;
                return filterProduct.includes(productStr);
            });
        }

        // Status filter — đa chọn + «(Trống)» giống danh-sach-don
        if (filterStatus.length > 0) {
            data = data.filter((row) => {
                const status = row['Trạng thái giao hàng'];
                const statusStr = status ? String(status).trim() : '';
                if (filterStatus.includes('(Trống)') && !statusStr) return true;
                return filterStatus.includes(statusStr);
            });
        }

        // Kết quả Check
        if (filterCheckResult.length > 0) {
            data = data.filter((row) => {
                const raw = row['Kết quả Check'];
                const crStr = raw ? String(raw).trim() : '';
                if (filterCheckResult.includes('(Trống)') && !crStr) return true;
                return filterCheckResult.includes(crStr);
            });
        }

        if (filterSaleStaff.length > 0) {
            data = data.filter((row) => filterByMultiTrong(filterSaleStaff, rowDisplaySaleStaff(row)));
        }
        if (filterMktStaff.length > 0) {
            data = data.filter((row) => filterByMultiTrong(filterMktStaff, rowDisplayMktStaff(row)));
        }
        if (filterDeliveryStaff.length > 0) {
            data = data.filter((row) =>
                filterByMultiTrong(filterDeliveryStaff, row['NV Vận đơn'] ?? row.delivery_staff)
            );
        }
        if (filterTeam.length > 0) {
            data = data.filter((row) => filterByMultiTrong(filterTeam, row['Team']));
        }
        if (filterPage.length > 0) {
            data = data.filter((row) => filterByMultiTrong(filterPage, row['Page']));
        }
        if (filterPaymentDetail.length > 0) {
            data = data.filter((row) =>
                filterByMultiTrong(filterPaymentDetail, row['Trạng thái thu tiền'])
            );
        }
        if (filterCskh.length > 0) {
            data = data.filter((row) => filterByMultiTrong(filterCskh, row['CSKH']));
        }
        if (filterShippingUnit.length > 0) {
            data = data.filter((row) =>
                filterByMultiTrong(filterShippingUnit, row['Đơn vị vận chuyển'])
            );
        }

        // Branch filter
        if (filterBranch) {
            data = data.filter(row => {
                const staffName = row["Nhân viên Marketing"];
                const branchFromMap = userBranchMap[staffName?.toLowerCase().trim()] || '';
                const branchFromTeam = row["Team"];

                return branchFromMap === filterBranch || branchFromTeam === filterBranch;
            });
        }

        // Sort
        if (sortColumn) {
            data.sort((a, b) => {
                const aVal = a[sortColumn];
                const bVal = b[sortColumn];

                // Specific handling for Date column sorting
                if (sortColumn === 'Ngày lên đơn') {
                    const dA = parseSmartDate(aVal);
                    const dB = parseSmartDate(bVal);
                    if (!dA) return 1;
                    if (!dB) return -1;
                    return sortDirection === 'asc' ? dA - dB : dB - dA;
                }

                const comparison = String(aVal || '').localeCompare(String(bVal || ''), 'vi', { numeric: true });
                return sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        return data;
    }, [
        allData,
        debouncedSearchText,
        filterMarket,
        filterProduct,
        filterStatus,
        filterCheckResult,
        filterSaleStaff,
        filterMktStaff,
        filterDeliveryStaff,
        filterTeam,
        filterPage,
        filterPaymentDetail,
        filterCskh,
        filterShippingUnit,
        filterBranch,
        userBranchMap,
        startDate,
        endDate,
        sortColumn,
        sortDirection
    ]);

    useEffect(() => {
        setCurrentPage(1);
    }, [
        filterMarket,
        filterProduct,
        filterStatus,
        filterCheckResult,
        filterSaleStaff,
        filterMktStaff,
        filterDeliveryStaff,
        filterTeam,
        filterPage,
        filterPaymentDetail,
        filterCskh,
        filterShippingUnit,
        filterBranch
    ]);

    // Pagination
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredData.slice(start, start + rowsPerPage);
    }, [filteredData, currentPage, rowsPerPage]);

    // Format date
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const d = parseSmartDate(dateString);
        if (!d) return dateString;

        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    // Handle sort
    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    // Export to CSV
    // Export to Excel
    // Export to Excel
    const handleExportExcel = () => {
        if (filteredData.length === 0) {
            alert("Không có dữ liệu để xuất Excel.");
            return;
        }

        const dataToExport = filteredData.map(row => {
            const newRow = {};
            // Export all available columns (from settings list) in defined order
            allAvailableColumns.forEach(col => {
                const key = COLUMN_MAPPING[col] || col;
                newRow[col] = row[key] ?? row[col] ?? '';
            });
            return newRow;
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(dataToExport);

        // Auto-width columns (approximate)
        const wscols = allAvailableColumns.map(() => ({ wch: 20 }));
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, "DanhSachDon");
        XLSX.writeFile(wb, `DanhSachDon_MKT_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // Handle column visibility toggle
    const toggleColumn = (column) => {
        setVisibleColumns(prev => ({
            ...prev,
            [column]: !prev[column]
        }));
    };

    // Select all columns
    const selectAllColumns = () => {
        const all = {};
        allAvailableColumns.forEach(col => {
            all[col] = true;
        });
        setVisibleColumns(all);
    };

    // Deselect all columns
    const deselectAllColumns = () => {
        const none = {};
        allAvailableColumns.forEach(col => {
            none[col] = false;
        });
        setVisibleColumns(none);
    };

    // Reset to default columns
    const resetToDefault = () => {
        const defaultCols = {};
        defaultColumns.forEach(col => {
            defaultCols[col] = true;
        });
        setVisibleColumns(defaultCols);
    };

    if (!hasChiTietAccess) {
        return (
            <div className="p-8 text-center text-red-600 font-bold">
                Bạn không có quyền truy cập trang này ({deniedPermissionLabel}).
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
                <div className="max-w-full mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link to="/" className="text-gray-600 hover:text-gray-900">
                                <ChevronLeft className="w-5 h-5" />
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold text-gray-800">
                                    {isHcm ? 'DANH SÁCH ĐƠN HCM (MARKETING)' : 'DANH SÁCH ĐƠN (MARKETING)'}
                                </h1>
                                <p className="text-xs text-gray-500">
                                    {isHcm
                                        ? 'Dữ liệu từ bảng order_code_hcm'
                                        : 'Xem chi tiết đơn hàng cho Marketing'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                                <span className={`h-2 w-2 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                <span className="text-sm text-gray-600">
                                    {filteredData.length} / {allData.length} đơn hàng
                                </span>
                            </div>
                            <button
                                onClick={loadData}
                                disabled={loading}
                                className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                            >
                                {loading ? (
                                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                                ) : (
                                    <RefreshCw className="w-4 h-4" />
                                )}
                                {loading ? 'Đang tải...' : 'Tải lại'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-full mx-auto px-6 py-6">
                {/* Filters */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
                    <div className="flex flex-wrap items-end gap-4">
                        {/* Search */}
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tìm kiếm</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Mã đơn, tracking, khách, địa chỉ, khu vực, NV Sale/MKT/Vận đơn, Team…"
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Date Range Filter */}
                        <div className="flex gap-2">
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Từ ngày</label>
                                <input
                                    type="date"
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Đến ngày</label>
                                <input
                                    type="date"
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Khu vực — đa chọn checkbox (giống danh-sach-don) */}
                        <div className="min-w-[200px] relative">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Khu vực</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowMarketFilter(!showMarketFilter)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                                >
                                    <span className="truncate">
                                        {filterMarket.length === 0
                                            ? 'Tất cả'
                                            : filterMarket.length === 1
                                              ? filterMarket[0]
                                              : `Đã chọn ${filterMarket.length}`}
                                    </span>
                                    <span className="ml-2 shrink-0">▼</span>
                                </button>
                                {showMarketFilter && (
                                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                        <div className="p-2">
                                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                                                <span className="text-xs font-semibold text-gray-700">Chọn khu vực:</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFilterMarket([]);
                                                        setShowMarketFilter(false);
                                                    }}
                                                    className="text-xs text-blue-600 hover:text-blue-800"
                                                >
                                                    Bỏ chọn tất cả
                                                </button>
                                            </div>
                                            {uniqueMarkets.map((market) => {
                                                const isChecked = filterMarket.includes(market);
                                                return (
                                                    <label
                                                        key={market}
                                                        className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setFilterMarket([...filterMarket, market]);
                                                                } else {
                                                                    setFilterMarket(filterMarket.filter((m) => m !== market));
                                                                }
                                                            }}
                                                            className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                                                        />
                                                        <span className="ml-2 text-sm text-gray-700">{market}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {showMarketFilter && (
                                <div className="fixed inset-0 z-40" onClick={() => setShowMarketFilter(false)} aria-hidden />
                            )}
                        </div>

                        {/* Mặt hàng — đa chọn */}
                        <div className="min-w-[200px] relative">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Mặt hàng</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowProductFilter(!showProductFilter)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                                >
                                    <span className="truncate">
                                        {filterProduct.length === 0
                                            ? 'Tất cả'
                                            : filterProduct.length === 1
                                              ? filterProduct[0]
                                              : `Đã chọn ${filterProduct.length}`}
                                    </span>
                                    <span className="ml-2 shrink-0">▼</span>
                                </button>
                                {showProductFilter && (
                                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                        <div className="p-2">
                                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                                                <span className="text-xs font-semibold text-gray-700">Chọn mặt hàng:</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFilterProduct([]);
                                                        setShowProductFilter(false);
                                                    }}
                                                    className="text-xs text-blue-600 hover:text-blue-800"
                                                >
                                                    Bỏ chọn tất cả
                                                </button>
                                            </div>
                                            {uniqueProducts.map((product) => {
                                                const isChecked = filterProduct.includes(product);
                                                return (
                                                    <label
                                                        key={product}
                                                        className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setFilterProduct([...filterProduct, product]);
                                                                } else {
                                                                    setFilterProduct(filterProduct.filter((p) => p !== product));
                                                                }
                                                            }}
                                                            className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                                                        />
                                                        <span className="ml-2 text-sm text-gray-700">{product}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {showProductFilter && (
                                <div className="fixed inset-0 z-40" onClick={() => setShowProductFilter(false)} aria-hidden />
                            )}
                        </div>

                        {/* Trạng thái giao hàng — đa chọn */}
                        <div className="min-w-[200px] relative">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Trạng thái</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowStatusFilter(!showStatusFilter)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                                >
                                    <span className="truncate">
                                        {filterStatus.length === 0
                                            ? 'Tất cả'
                                            : filterStatus.length === 1
                                              ? filterStatus[0]
                                              : `Đã chọn ${filterStatus.length}`}
                                    </span>
                                    <span className="ml-2 shrink-0">▼</span>
                                </button>
                                {showStatusFilter && (
                                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                        <div className="p-2">
                                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                                                <span className="text-xs font-semibold text-gray-700">Chọn trạng thái:</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFilterStatus([]);
                                                        setShowStatusFilter(false);
                                                    }}
                                                    className="text-xs text-blue-600 hover:text-blue-800"
                                                >
                                                    Bỏ chọn tất cả
                                                </button>
                                            </div>
                                            {uniqueStatuses.map((status) => {
                                                const isChecked = filterStatus.includes(status);
                                                return (
                                                    <label
                                                        key={status}
                                                        className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setFilterStatus([...filterStatus, status]);
                                                                } else {
                                                                    setFilterStatus(filterStatus.filter((s) => s !== status));
                                                                }
                                                            }}
                                                            className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                                                        />
                                                        <span className="ml-2 text-sm text-gray-700">{status}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {showStatusFilter && (
                                <div className="fixed inset-0 z-40" onClick={() => setShowStatusFilter(false)} aria-hidden />
                            )}
                        </div>

                        {/* Kết quả Check — đa chọn + ô tìm trong danh sách */}
                        <div className="min-w-[200px] relative">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Kết quả Check</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowCheckResultFilter(!showCheckResultFilter)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white text-left flex items-center justify-between"
                                >
                                    <span className="truncate">
                                        {filterCheckResult.length === 0
                                            ? 'Tất cả'
                                            : filterCheckResult.length === 1
                                              ? filterCheckResult[0]
                                              : `Đã chọn ${filterCheckResult.length}`}
                                    </span>
                                    <span className="ml-2 shrink-0">▼</span>
                                </button>
                                {showCheckResultFilter && (
                                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                        <div className="p-2">
                                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                                                <span className="text-xs font-semibold text-gray-700">Chọn kết quả:</span>
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const next = Array.from(
                                                                new Set([...(filterCheckResult || []), ...filteredCheckResults])
                                                            );
                                                            setFilterCheckResult(next);
                                                        }}
                                                        className="text-xs text-blue-600 hover:text-blue-800"
                                                    >
                                                        Chọn tất cả
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setFilterCheckResult([]);
                                                            setShowCheckResultFilter(false);
                                                        }}
                                                        className="text-xs text-blue-600 hover:text-blue-800"
                                                    >
                                                        Bỏ chọn tất cả
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="mb-2">
                                                <input
                                                    type="text"
                                                    value={checkResultFilterSearchText}
                                                    onChange={(e) => setCheckResultFilterSearchText(e.target.value)}
                                                    placeholder="Gõ để tìm nhanh..."
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                                                />
                                            </div>
                                            {filteredCheckResults.map((checkResult) => {
                                                const isChecked = filterCheckResult.includes(checkResult);
                                                return (
                                                    <label
                                                        key={checkResult}
                                                        className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setFilterCheckResult([...filterCheckResult, checkResult]);
                                                                } else {
                                                                    setFilterCheckResult(
                                                                        filterCheckResult.filter((c) => c !== checkResult)
                                                                    );
                                                                }
                                                            }}
                                                            className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                                                        />
                                                        <span className="ml-2 text-sm text-gray-700">{checkResult}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {showCheckResultFilter && (
                                <div className="fixed inset-0 z-40" onClick={() => setShowCheckResultFilter(false)} aria-hidden />
                            )}
                        </div>

                        <MultiCheckboxFilter
                            label="Nhân viên Sale"
                            open={showSaleStaffFilter}
                            onOpenChange={setShowSaleStaffFilter}
                            selected={filterSaleStaff}
                            onSelected={setFilterSaleStaff}
                            options={filteredSaleStaff}
                            searchText={saleStaffFilterSearchText}
                            onSearchText={setSaleStaffFilterSearchText}
                            showSearch
                            enableSelectAllFiltered
                        />
                        <MultiCheckboxFilter
                            label="Nhân viên MKT"
                            open={showMktStaffFilter}
                            onOpenChange={setShowMktStaffFilter}
                            selected={filterMktStaff}
                            onSelected={setFilterMktStaff}
                            options={filteredMktStaff}
                            searchText={mktStaffFilterSearchText}
                            onSearchText={setMktStaffFilterSearchText}
                            showSearch
                            enableSelectAllFiltered
                        />
                        <MultiCheckboxFilter
                            label="NV Vận đơn"
                            open={showDeliveryStaffFilter}
                            onOpenChange={setShowDeliveryStaffFilter}
                            selected={filterDeliveryStaff}
                            onSelected={setFilterDeliveryStaff}
                            options={filteredDeliveryStaff}
                            searchText={deliveryStaffFilterSearchText}
                            onSearchText={setDeliveryStaffFilterSearchText}
                            showSearch
                            enableSelectAllFiltered
                        />
                        <MultiCheckboxFilter
                            label="Team"
                            open={showTeamFilter}
                            onOpenChange={setShowTeamFilter}
                            selected={filterTeam}
                            onSelected={setFilterTeam}
                            options={filteredTeams}
                            searchText={teamFilterSearchText}
                            onSearchText={setTeamFilterSearchText}
                            showSearch
                            enableSelectAllFiltered
                        />
                        <MultiCheckboxFilter
                            label="Page"
                            open={showPageFilter}
                            onOpenChange={setShowPageFilter}
                            selected={filterPage}
                            onSelected={setFilterPage}
                            options={filteredPages}
                            searchText={pageFilterSearchText}
                            onSearchText={setPageFilterSearchText}
                            showSearch
                            enableSelectAllFiltered
                        />
                        <MultiCheckboxFilter
                            label="Trạng thái thu tiền"
                            open={showPaymentDetailFilter}
                            onOpenChange={setShowPaymentDetailFilter}
                            selected={filterPaymentDetail}
                            onSelected={setFilterPaymentDetail}
                            options={filteredPaymentDetails}
                            searchText={paymentDetailFilterSearchText}
                            onSearchText={setPaymentDetailFilterSearchText}
                            showSearch
                            enableSelectAllFiltered
                        />
                        <MultiCheckboxFilter
                            label="CSKH"
                            open={showCskhFilter}
                            onOpenChange={setShowCskhFilter}
                            selected={filterCskh}
                            onSelected={setFilterCskh}
                            options={filteredCskh}
                            searchText={cskhFilterSearchText}
                            onSearchText={setCskhFilterSearchText}
                            showSearch
                            enableSelectAllFiltered
                        />
                        <MultiCheckboxFilter
                            label="Đơn vị vận chuyển"
                            open={showShippingUnitFilter}
                            onOpenChange={setShowShippingUnitFilter}
                            selected={filterShippingUnit}
                            onSelected={setFilterShippingUnit}
                            options={filteredShippingUnits}
                            searchText={shippingUnitFilterSearchText}
                            onSearchText={setShippingUnitFilterSearchText}
                            showSearch
                            enableSelectAllFiltered
                        />

                        {/* Branch Filter */}
                        <div className="min-w-[150px]">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Chi nhánh</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                                value={filterBranch}
                                onChange={(e) => setFilterBranch(e.target.value)}
                            >
                                <option value="">Tất cả</option>
                                <option value="Hà Nội">Hà Nội</option>
                                <option value="HCM">HCM</option>
                            </select>
                        </div>

                        {/* Settings Button */}
                        <button
                            onClick={() => setShowColumnSettings(true)}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
                        >
                            <Settings className="w-4 h-4" />
                            Cài đặt cột
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    {displayColumns.map((col) => (
                                        <th
                                            key={col}
                                            className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                            onClick={() => handleSort(col)}
                                        >
                                            <div className="flex items-center gap-2">
                                                {col}
                                                {sortColumn === col && (
                                                    <span className="text-[#F37021]">
                                                        {sortDirection === 'asc' ? '↑' : '↓'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan={displayColumns.length} className="px-4 py-8 text-center text-gray-500">
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="animate-spin h-5 w-5 border-2 border-[#F37021] border-t-transparent rounded-full"></div>
                                                Đang tải dữ liệu...
                                            </div>
                                        </td>
                                    </tr>
                                ) : paginatedData.length === 0 ? (
                                    <tr>
                                        <td colSpan={displayColumns.length} className="px-4 py-8 text-center text-gray-500">
                                            Không có dữ liệu phù hợp
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedData.map((row, index) => (
                                        <tr key={row[PRIMARY_KEY_COLUMN] || index} className="hover:bg-gray-50 transition-colors">
                                            {displayColumns.map((col) => {
                                                const key = COLUMN_MAPPING[col] || col;
                                                let value = row[key] ?? row[col] ?? '';

                                                // Format date
                                                if (col.includes('Ngày')) {
                                                    value = formatDate(value);
                                                }

                                                // Format money
                                                if (col === 'Tổng tiền VNĐ') {
                                                    const num = parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
                                                    value = num.toLocaleString('vi-VN') + ' ₫';
                                                }

                                                return (
                                                    <td key={col} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                                                        {value || '-'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-6">
                    <div className="flex justify-between items-center flex-wrap gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-600">Số dòng/trang:</label>
                            <select
                                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                                value={rowsPerPage}
                                onChange={(e) => {
                                    setRowsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                            >
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                                <option value="200">200</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-700">
                                Trang <span className="font-bold text-[#F37021]">{currentPage}</span> / {totalPages || 1}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    disabled={currentPage <= 1}
                                    onClick={() => setCurrentPage(p => p - 1)}
                                    className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors shadow-sm"
                                >
                                    ← Trước
                                </button>
                                <button
                                    disabled={currentPage >= totalPages}
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors shadow-sm"
                                >
                                    Sau →
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Column Settings Modal */}
            <ColumnSettingsModal
                isOpen={showColumnSettings}
                onClose={() => setShowColumnSettings(false)}
                allColumns={allAvailableColumns}
                visibleColumns={visibleColumns}
                onToggleColumn={toggleColumn}
                onSelectAll={selectAllColumns}
                onDeselectAll={deselectAllColumns}
                onResetDefault={resetToDefault}
                defaultColumns={defaultColumns}
            />
        </div>
    );
}

export default BaoCaoChiTiet;
