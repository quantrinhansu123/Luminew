import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Calculator, Database, Eye, RefreshCw, X } from 'lucide-react';
import { toast } from 'react-toastify';
import usePermissions from '../hooks/usePermissions';
import { recalcSaleOrderCountFromOrders } from '../services/saleRecalcOrderCountFromOrders';
import * as rbacService from '../services/rbacService';
import { supabase } from '../services/supabaseClient';
import { isSalesReportUserSuppliedRowId } from '../utils/salesReportRowId';
import './BaoCaoSale.css'; // Reusing styles for consistency

// Helpers
const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN');
const formatDate = (dateValue) => {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return dateValue;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

/** YYYY-MM-DD theo giờ địa phương — tránh lệch 1 ngày so với `toISOString().split('T')[0]` (UTC) ở múi giờ VN. */
function formatDateYmdLocal(d) {
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function cleanPersonName(value) {
    return String(value || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function canonicalPersonName(value) {
    return cleanPersonName(value)
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
}

function addDaysYmd(dateYmd, days = 1) {
    if (!dateYmd) return '';
    const date = new Date(`${dateYmd}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + days);
    return formatDateYmdLocal(date);
}

/**
 * Chuẩn YYYY-MM-DD: ưu tiên prefix từ ISO, với chuỗi có giờ dùng lịch local (tránh lệch ngày do toISOString UTC).
 * Khớp hướng xử lý với `normalizeDateStr` trong mktRecalcSoDonThucTeFromOrders.js.
 */
function normalizeDateYmd(dateVal) {
    if (dateVal == null || dateVal === '') return '';
    if (dateVal instanceof Date) {
        if (Number.isNaN(dateVal.getTime())) return '';
        const y = dateVal.getFullYear();
        const m = String(dateVal.getMonth() + 1).padStart(2, '0');
        const d = String(dateVal.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(dateVal).trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (s.includes('T')) {
        const parsed = new Date(s);
        if (!Number.isNaN(parsed.getTime())) {
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const d = String(parsed.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        return s.split('T')[0].slice(0, 10);
    }
    if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 3) {
            const [day, month, year] = parts;
            if (year && month && day) {
                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
        }
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return '';
}

function scalarLooselyEqual(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function normalizeOrderForCalc(order, index = 0) {
    const normalized = {
        ...order,
        order_date: order?.order_date || order?.ngaydonghang || order?.date || '',
        sale_staff:
            order?.sale_staff ||
            order?.nhanvien_sale ||
            order?.nhan_vien_sale ||
            order?.Nhan_vien_Sale ||
            order?.['Nhân viên Sale'] ||
            '',
        nhanvien_sale:
            order?.nhanvien_sale ||
            order?.sale_staff ||
            order?.nhan_vien_sale ||
            order?.Nhan_vien_Sale ||
            order?.['Nhân viên Sale'] ||
            '',
        product: String(
            order?.product ??
                order?.san_pham ??
                order?.mat_hang ??
                order?.San_pham ??
                order?.['mặt_hàng'] ??
                ''
        ).trim(),
        country: String(
            order?.country ??
                order?.thi_truong ??
                order?.khu_vuc ??
                order?.Khu_vuc ??
                order?.market ??
                ''
        ).trim(),
        check_result: order?.check_result || order?.delivery_status_nb || '',
        tracking_code:
            order?.tracking_code || order?.trackingCode || order?.tracking || order?.ma_tracking || order?.maTracking || '',
        total_amount_vnd:
            order?.total_amount_vnd ||
            order?.total_vnd ||
            order?.tongtien ||
            order?.revenue_vnd ||
            order?.total_amount ||
            order?.amount ||
            0,
    };
    normalized.__rowKey = normalized.id || normalized.order_code || `row_${index}`;
    return normalized;
}

function mergeOrdersByOrderCode(primary, secondary) {
    const out = [...(primary || [])];
    const codes = new Set(out.map((o) => String(o?.order_code ?? '').trim()).filter(Boolean));
    for (const o of secondary || []) {
        const c = String(o?.order_code ?? '').trim();
        if (c && !codes.has(c)) {
            codes.add(c);
            out.push(o);
        }
    }
    return out;
}

/** YYYY-MM-DD → DD/MM/YYYY cho lumidataapi (không dùng new Date(ymd) để tránh lệch múi giờ). */
function ymdToDdMmYyyyForApi(ymd) {
    const d = normalizeDateYmd(ymd);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return '';
    return `${m[3]}/${m[2]}/${m[1]}`;
}

async function fetchOrderCodeHcmOrdersForDate(reportDateYmd) {
    const PAGE_SIZE = 2000;
    const rows = [];
    let from = 0;
    for (let guard = 0; guard < 500; guard += 1) {
        const { data, error } = await supabase
            .from('order_code_hcm')
            .select('*')
            .gte('order_date', reportDateYmd)
            .lte('order_date', reportDateYmd)
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return rows;
}

/** Lọc đơn khớp một dòng báo cáo Sale (ngày + NV Sale + SP + TT). */
function filterOrdersMatchingSaleReport(matchingOrders, reportDateYmd, report, namesMatch) {
    let orders = matchingOrders || [];
    orders = orders.filter((order) => {
        const nd = normalizeDateYmd(order.order_date);
        return nd && nd === reportDateYmd;
    });
    if (report?.name && String(report.name).trim()) {
        orders = orders.filter((order) => {
            const orderSaleStaff = String(order.nhanvien_sale || order.sale_staff || '').trim();
            if (!orderSaleStaff) return false;
            return namesMatch(orderSaleStaff, report.name);
        });
    }
    if (report?.product && String(report.product).trim()) {
        orders = orders.filter((order) => {
            const orderProduct = String(order.product || '').trim();
            if (!orderProduct) return false;
            return scalarLooselyEqual(orderProduct, report.product);
        });
    }
    if (report?.market && String(report.market).trim()) {
        orders = orders.filter((order) => {
            const orderCountry = String(order.country || '').trim();
            if (!orderCountry) return false;
            return scalarLooselyEqual(orderCountry, report.market);
        });
    }
    return orders;
}

/**
 * Dedupe key: cùng ngày + người + SP + TT + team — KHÔNG tính cột Ca (shift).
 * Dùng chung với logic nút "Xóa bản ghi trùng" (giống trang CSKH).
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

/** Trang báo cáo tay HCM: hiển thị team + chi nhánh khi có dữ liệu. */
function formatHcmReportTeamCell(row) {
    const team = String(row?.team ?? '').trim();
    const branch = String(row?.branch ?? '').trim();
    if (team && branch && team !== branch) {
        return `${team} / ${branch}`;
    }
    if (team) return team;
    if (branch) return branch;
    return '';
}

/** Các giá trị team cũ cần gộp về CSKH-HN (đồng bộ với supabase/manual/update_sales_reports_team_cskh_ly_to_cskh_hn.sql). */
const CSKH_LY_TEAM_VARIANTS = ['CSKH- Lý', 'CSKH-Lý'];
const CSKH_HN_TEAM_CANONICAL = 'CSKH-HN';

/** Bảng sao lưu cấu trúc giống sales_reports (migration / manual SQL trong repo). */
const SALES_REPORTS_BACKUP_TABLE = 'sales_reports_backup';

export default function DanhSachBaoCaoTay({ dataSource = 'default' }) {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // 'RD' or null
    const isHcm = dataSource === 'hcm';
    const reportTable = isHcm ? 'sale_report_hcm' : 'sales_reports';
    const ordersApiEndpoint = isHcm ? '/order_hcm' : '/orders';
    /** Mã RBAC chính của route (HCM vẫn có thể vào bằng SALE_MANUAL — xem hasManualListAccess). */
    const permissionCode = isHcm ? 'SALE_MANUAL_HCM' : teamFilter === 'RD' ? 'RND_MANUAL' : 'SALE_MANUAL';

    const { canView, role, loading: permissionsLoading } = usePermissions();
    const hasManualListAccess = isHcm ? canView('SALE_MANUAL_HCM') : canView(permissionCode);
    const deniedPermissionLabel = isHcm ? 'SALE_MANUAL_HCM' : permissionCode;

    /** Nút chỉnh team / chuẩn hoá CSKH-Lý: chỉ role admin thật từ DB (không tin localStorage). */
    const showBaoCaoTayAdminToolbarButtons = useMemo(() => {
        if (permissionsLoading) return false;
        if (role == null || String(role).trim() === '') return false;
        const l = String(role).trim().toLowerCase();
        return l === 'admin' || l === 'super_admin' || l === 'administrator';
    }, [permissionsLoading, role]);

    // Kiểm tra xem user có phải Admin không (chỉ Admin mới thấy nút xóa)
    const roleFromHook = (role || '').toUpperCase();
    const roleFromStorage = (localStorage.getItem('userRole') || '').toLowerCase();
    const userJson = localStorage.getItem("user");
    const userObj = userJson ? JSON.parse(userJson) : null;
    const roleFromUserObj = (userObj?.role || '').toLowerCase();

    const roleFromHookLower = (roleFromHook || '').toLowerCase();
    // Chỉ admin/super_admin mới được bypass filter selected_personnel.
    const isAdmin = roleFromHookLower === 'admin' ||
        roleFromHookLower === 'super_admin' ||
        roleFromStorage === 'admin' ||
        roleFromStorage === 'super_admin' ||
        roleFromUserObj === 'admin' ||
        roleFromUserObj === 'super_admin';

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
    const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]);

    const [loading, setLoading] = useState(true);
    const [manualReports, setManualReports] = useState([]);
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        products: [],
        markets: [],
        personnel: []
    });
    const [personnelSearch, setPersonnelSearch] = useState('');
    /** Lọc bảng theo chuỗi tên (giống tìm nhanh báo cáo MKT). */
    const [staffTableSearch, setStaffTableSearch] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [sortColumn, setSortColumn] = useState(null);
    const [sortDirection, setSortDirection] = useState('asc');

    useEffect(() => {
        if (isHcm && (sortColumn === 'Số đơn go' || sortColumn === 'Doanh số go')) {
            setSortColumn(null);
        }
    }, [isHcm, sortColumn]);

    // Available options for filters
    const [availableOptions, setAvailableOptions] = useState({
        products: [],
        markets: []
    });

    // Edit State
    const [editingReport, setEditingReport] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    const [teamSyncing, setTeamSyncing] = useState(false);
    const [normalizingCskhLyTeam, setNormalizingCskhLyTeam] = useState(false);
    const [fixingUsMarket, setFixingUsMarket] = useState(false);
    const [removingDuplicates, setRemovingDuplicates] = useState(false);
    const [backingUp, setBackingUp] = useState(false);
    const [updatingOrders, setUpdatingOrders] = useState(false);
    const [updateProgress, setUpdateProgress] = useState({ current: 0, total: 0 });

    // View Orders Modal
    const [showViewOrdersModal, setShowViewOrdersModal] = useState(false);
    const [viewingReport, setViewingReport] = useState(null);
    const [viewingOrders, setViewingOrders] = useState([]);
    const [loadingOrders, setLoadingOrders] = useState(false);

    // Options for edit form
    const [editOptions, setEditOptions] = useState({
        products: [],
        markets: [],
        branches: [],
        shifts: ['Hết ca', 'Giữa ca']
    });

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
                let rawPersonnel = personnelMap[userEmailLower] || [];

                // Fallback: lấy trực tiếp theo email không phân biệt hoa/thường
                // để tránh miss khi email lưu trong DB khác casing.
                if (!rawPersonnel || rawPersonnel.length === 0) {
                    const { data: currentUser, error: currentUserError } = await supabase
                        .from('users')
                        .select('selected_personnel')
                        .ilike('email', userEmailLower)
                        .maybeSingle();

                    if (!currentUserError && currentUser?.selected_personnel) {
                        if (Array.isArray(currentUser.selected_personnel)) {
                            rawPersonnel = currentUser.selected_personnel;
                        } else if (typeof currentUser.selected_personnel === 'string') {
                            rawPersonnel = currentUser.selected_personnel
                                .split(',')
                                .map((item) => item.trim())
                                .filter(Boolean);
                        }
                    }
                }
                const normalizedPersonnel = rawPersonnel
                    .map((item) => cleanPersonName(item))
                    .filter(Boolean);

                const directNames = normalizedPersonnel.filter((value) => !value.includes('@'));
                const personnelEmails = normalizedPersonnel
                    .filter((value) => value.includes('@'))
                    .map((value) => value.toLowerCase());

                let resolvedNames = [];
                if (personnelEmails.length > 0) {
                    const { data: userRows } = await supabase
                        .from('users')
                        .select('email, name')
                        .in('email', personnelEmails);

                    const nameByEmailLower = {};
                    (userRows || []).forEach((row) => {
                        const key = String(row?.email || '').toLowerCase().trim();
                        if (key && row?.name) {
                            nameByEmailLower[key] = String(row.name).trim();
                        }
                    });

                    // Fallback từng email theo ilike để xử lý lệch casing trong DB.
                    const missingEmails = personnelEmails.filter((email) => !nameByEmailLower[email]);
                    if (missingEmails.length > 0) {
                        const missingResults = await Promise.all(
                            missingEmails.map(async (email) => {
                                const { data } = await supabase
                                    .from('users')
                                    .select('name')
                                    .ilike('email', email)
                                    .maybeSingle();
                                return { email, name: String(data?.name || '').trim() };
                            })
                        );
                        missingResults.forEach(({ email, name }) => {
                            if (name) nameByEmailLower[email] = name;
                        });
                    }

                    resolvedNames = personnelEmails
                        .map((email) => nameByEmailLower[email] || '')
                        .filter(Boolean);
                }

                const validNames = [...new Set([...directNames, ...resolvedNames])];

                console.log('📝 [DanhSachBaoCaoTay] Valid personnel names:', validNames);
                setSelectedPersonnelNames(validNames);
            } catch (error) {
                console.error('❌ [DanhSachBaoCaoTay] Error loading selected personnel:', error);
                setSelectedPersonnelNames([]);
            }
        };

        loadSelectedPersonnel();
    }, [userEmail]);

    // Initialize Dates
    useEffect(() => {
        const today = new Date();
        const d = new Date();
        d.setDate(d.getDate() - 3);

        setFilters(prev => ({
            ...prev,
            startDate: formatDateYmdLocal(d),
            endDate: formatDateYmdLocal(today)
        }));
    }, []);

    // Load available options for filters (chỉ lấy từ báo cáo của nhân sự được phép xem)
    useEffect(() => {
        const loadAvailableOptions = async () => {
            try {
                let productsSet = new Set();
                let marketsSet = new Set();
                const isHcmReportTable = reportTable === 'sale_report_hcm';

                // Bước 1: system_settings — trang HCM (sale_report_hcm) bỏ qua: danh sách SP master thường là toàn công ty,
                // gộp vào đây làm bộ lọc lệch dữ liệu HCM và dễ tạo .in() hàng nghìn phần tử khi «Tất cả».
                if (!isHcmReportTable) {
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
                        }
                    } catch (supabaseError) {
                        console.log('⚠️ Could not fetch products from system_settings:', supabaseError);
                    }
                }

                // Bước 2: Load sản phẩm và thị trường từ bảng báo cáo đang xem (sales_reports / sale_report_hcm)
                // Tối ưu: Chỉ load một số lượng giới hạn records để lấy unique values
                // Với 10000 records đã đủ để có được hầu hết các unique products và markets
                try {
                    const maxRecordsToLoad = 10000; // Giới hạn số lượng records load
                    let allData = [];
                    let page = 0;
                    const pageSize = 1000;
                    let hasMore = true;

                    while (hasMore && allData.length < maxRecordsToLoad) {
                        const from = page * pageSize;
                        const to = Math.min(from + pageSize - 1, maxRecordsToLoad - 1);

                        const { data, error } = await supabase
                            .from(reportTable)
                            .select('product, market')
                            .order('created_at', { ascending: false }) // Load từ mới nhất
                            .range(from, to);

                        if (error) throw error;

                        if (data && data.length > 0) {
                            allData = allData.concat(data);
                            hasMore = data.length === pageSize && allData.length < maxRecordsToLoad;
                            page++;

                            // Chỉ log mỗi 5 pages để giảm spam
                            if (page % 5 === 0 || !hasMore) {
                                console.log(
                                    `📄 Loaded ${allData.length} records từ ${reportTable} (để lấy unique products/markets)`
                                );
                            }
                        } else {
                            hasMore = false;
                        }
                    }

                    // Extract unique products and markets
                    const productsFromReports = [...new Set(allData.map(r => r.product).filter(Boolean))];
                    const marketsFromReports = [...new Set(allData.map(r => r.market).filter(Boolean))];

                    console.log(`📦 Extracted ${productsFromReports.length} unique products và ${marketsFromReports.length} unique markets từ ${allData.length} records`);

                    // Merge sản phẩm từ báo cáo vào set (để đảm bảo có cả sản phẩm cũ không có trong system_settings)
                    productsFromReports.forEach(p => productsSet.add(p));
                    marketsFromReports.forEach(m => marketsSet.add(m));

                    console.log(
                        `✅ Loaded ${productsFromReports.length} products and ${marketsFromReports.length} markets from ${reportTable}`
                    );
                } catch (dbError) {
                    console.error(`Error fetching from ${reportTable}:`, dbError);
                }

                const finalProducts = Array.from(productsSet).sort();
                const finalMarkets = Array.from(marketsSet).sort();

                setAvailableOptions({
                    products: finalProducts,
                    markets: finalMarkets
                });

                console.log(`📦 Total products available: ${productsSet.size}, Total markets: ${marketsSet.size}`);

                // Debug: Kiểm tra xem "Brusko coffe" có trong danh sách cuối cùng không
                const bruskoInFinal = finalProducts.filter(p =>
                    p && (p.toLowerCase().includes('brusko') || p.toLowerCase().includes('bruso'))
                );
                if (bruskoInFinal.length > 0) {
                    console.log(`✅ Tìm thấy "Brusko" trong danh sách cuối cùng:`, bruskoInFinal);
                } else {
                    console.log(`⚠️ "Brusko coffe" KHÔNG có trong danh sách cuối cùng (${finalProducts.length} sản phẩm)`);
                    console.log(`📋 Danh sách sản phẩm cuối cùng:`, finalProducts);
                }
            } catch (error) {
                console.error('Error loading available options:', error);
                setAvailableOptions({ products: [], markets: [] });
            }
        };

        // Chỉ load khi đã có selectedPersonnelNames (hoặc không có restriction)
        if (selectedPersonnelNames !== undefined) {
            loadAvailableOptions();
        }
    }, [selectedPersonnelNames, reportTable]); // Reload khi selectedPersonnelNames / bảng báo cáo thay đổi

    /** Chỉ gửi .in() khi thực sự thu hẹp: bỏ qua khi đã chọn đủ mọi mục trong danh sách (≈ không lọc), tránh URL/query .in quá dài. */
    const productFilterValues = useMemo(() => {
        const sel = filters.products || [];
        const all = availableOptions.products || [];
        if (sel.length === 0) return null;
        if (all.length > 0 && sel.length === all.length) return null;
        return sel;
    }, [filters.products, availableOptions.products]);

    const marketFilterValues = useMemo(() => {
        const sel = filters.markets || [];
        const all = availableOptions.markets || [];
        if (sel.length === 0) return null;
        if (all.length > 0 && sel.length === all.length) return null;
        return sel;
    }, [filters.markets, availableOptions.markets]);

    // Fetch Data
    const fetchData = useCallback(async () => {
        if (!filters.startDate || !filters.endDate) return;
        setLoading(true);
        try {
            const PAGE_SIZE = 1000;
            const allowedPersonnelCanonical = (selectedPersonnelNames || [])
                .map((name) => canonicalPersonName(name))
                .filter(Boolean);

            // PostgREST/Supabase mặc định giới hạn ~1000 dòng/request — gom đủ trang theo bộ lọc.
            const allRows = [];
            for (let page = 0; ; page += 1) {
                const from = page * PAGE_SIZE;
                const to = from + PAGE_SIZE - 1;

                let query = supabase
                    .from(reportTable)
                    .select('*')
                    .gte('date', filters.startDate)
                    .lte('date', filters.endDate)
                    .order('created_at', { ascending: false });

                if (productFilterValues && productFilterValues.length > 0) {
                    query = query.in('product', productFilterValues);
                }
                if (marketFilterValues && marketFilterValues.length > 0) {
                    query = query.in('market', marketFilterValues);
                }

                const { data, error } = await query.range(from, to);
                if (error) throw error;
                if (!data || data.length === 0) break;
                allRows.push(...data);
                if (data.length < PAGE_SIZE) break;
            }

            // Admin/super_admin: xem toàn bộ báo cáo (không giới hạn selected_personnel).
            const filteredByPermission = isAdmin
                ? (allRows || [])
                : allowedPersonnelCanonical.length === 0
                    ? []
                    : (allRows || []).filter((row) => {
                        const rowName = canonicalPersonName(row?.name || '');
                        if (!rowName) return false;
                        return allowedPersonnelCanonical.some((allowedName) =>
                            rowName === allowedName ||
                            rowName.includes(allowedName) ||
                            allowedName.includes(rowName)
                        );
                    });

            setManualReports(filteredByPermission);
        } catch (error) {
            console.error('Error fetching manual reports:', error);
        } finally {
            setLoading(false);
        }
    }, [
        filters.startDate,
        filters.endDate,
        productFilterValues,
        marketFilterValues,
        selectedPersonnelNames,
        isAdmin,
        reportTable,
    ]);

    const handleCalculateAndUpdateOrders = useCallback(async () => {
        if (!filters.startDate || !filters.endDate) {
            toast.error('Vui lòng chọn khoảng thời gian trước khi tính toán!');
            return;
        }
        const tableLabel = isHcm ? 'sale_report_hcm' : 'sales_reports';
        const ordersLabel = isHcm ? 'order_code_hcm' : 'orders';
        if (
            !window.confirm(
                `Tính lại ${tableLabel} từ ${ordersLabel} (Supabase) — cùng luồng Admin Tools:\n\n` +
                    '• Cập nhật số đơn, doanh số, đơn hủy, đơn go (có tracking, không hủy).\n' +
                    '• Tự thêm dòng «Hết ca» nếu thiếu key (ngày + nhân viên sale + SP + thị trường).\n\n' +
                    `Khoảng: ${filters.startDate} → ${filters.endDate}\n\nChạy?`
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
                reportsTable: isHcm ? 'sale_report_hcm' : 'sales_reports',
                ordersTable: isHcm ? 'order_code_hcm' : 'orders',
            });
            const n = result.upserted ?? 0;
            const created = result.createdMissing ?? 0;
            const updated = result.updatedExisting ?? 0;
            toast.success(
                `Hoàn tất: ${n} thao tác (cập nhật ${updated} dòng, tạo mới ${created} dòng).`
            );
            await fetchData();
        } catch (err) {
            console.error('handleCalculateAndUpdateOrders:', err);
            toast.error('Lỗi khi tính toán: ' + (err.message || String(err)));
        } finally {
            setUpdatingOrders(false);
            setUpdateProgress({ current: 0, total: 0 });
        }
    }, [fetchData, filters.startDate, filters.endDate, isHcm]);

    useEffect(() => {
        fetchData();
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
            startDate: formatDateYmdLocal(startDate),
            endDate: formatDateYmdLocal(endDate)
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
            [type]: checked ? (availableOptions[type] || []) : []
        }));
    };

    // Delete all data
    const handleDeleteAll = async () => {
        const confirm1 = window.confirm(
            "⚠️ CẢNH BÁO NGHIÊM TRỌNG!\n\n" +
            `Bạn có chắc chắn muốn XÓA TOÀN BỘ dữ liệu trong bảng ${reportTable}?\n\n` +
            "Hành động này KHÔNG THỂ HOÀN TÁC!\n\n" +
            "Nhấn OK để tiếp tục, hoặc Cancel để hủy."
        );

        if (!confirm1) return;

        const confirm2 = window.confirm(
            "⚠️ XÁC NHẬN LẦN CUỐI!\n\n" +
            "Bạn có THỰC SỰ muốn xóa TOÀN BỘ dữ liệu?\n\n" +
            "Tất cả báo cáo Sale sẽ bị mất vĩnh viễn!\n\n" +
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

            // Delete all records from reportTable
            const { error } = await supabase
                .from(reportTable)
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (hack for delete all)

            if (error) {
                // If the above doesn't work, try deleting by selecting all IDs first
                const { data: allRecords, error: fetchError } = await supabase
                    .from(reportTable)
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
                            .from(reportTable)
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
            fetchData(); // Refresh the table

        } catch (error) {
            console.error("Delete error:", error);
            alert("Lỗi khi xóa dữ liệu: " + (error.message || String(error)));
        } finally {
            setDeleting(false);
        }
    };

    /**
     * Xóa trùng:
     * - Xóa hết Ca = Giữa ca
     * - Với các bản không phải Giữa ca: gộp trùng theo (date + name + product + market + team).
     *   Nếu trong nhóm có ít nhất một dòng id do người dùng/ghi tay (số serial) → chỉ xóa các dòng id hệ thống (UUID…).
     *   Nếu cả nhóm đều id hệ thống → giữ bản mới nhất (created_at), xóa các bản còn lại.
     */
    const handleRemoveDuplicateReports = async () => {
        if (!reportsAfterPersonnelFilter.length) {
            toast.error('Không có dữ liệu trong danh sách hiện tại.');
            return;
        }

        const toDeleteSet = new Set();

        // 1) Luôn xóa toàn bộ dòng Giữa ca
        for (const r of reportsAfterPersonnelFilter) {
            if (!r?.id) continue;
            if (isGiuaCaShift(r.shift)) toDeleteSet.add(r.id);
        }

        // 2) Dedupe phần không phải Giữa ca
        const nonGiua = reportsAfterPersonnelFilter.filter((r) => r?.id && !isGiuaCaShift(r.shift));
        const byKey = new Map();
        for (const r of nonGiua) {
            const k = reportBusinessDedupeKey(r);
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push(r);
        }

        for (const [, rows] of byKey) {
            if (rows.length < 2) continue;
            const hasUserId = rows.some((r) => isSalesReportUserSuppliedRowId(r.id));
            if (hasUserId) {
                for (const r of rows) {
                    if (!isSalesReportUserSuppliedRowId(r.id)) toDeleteSet.add(r.id);
                }
                continue;
            }
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
            toast.info('Không có bản Giữa ca và không có cặp trùng trong các bản còn lại.');
            return;
        }

        if (
            !window.confirm(
                `Sẽ xóa ${toDelete.length} bản ghi (trong ${reportsAfterPersonnelFilter.length} dòng hiện tại).\n\n` +
                    '• Xóa toàn bộ dòng có Ca = Giữa ca.\n' +
                    '• Trong phần không phải Giữa ca: gộp trùng (cùng ngày, người, SP, TT, team). ' +
                    'Có dòng id số (ghi tay): chỉ xóa bản trùng có id hệ thống (UUID). ' +
                    'Không có id số: giữ bản mới nhất, xóa các bản còn lại.\n\n' +
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
                const { error } = await supabase.from(reportTable).delete().in('id', batch);
                if (error) throw error;
            }

            toast.success(`Đã xóa ${toDelete.length} bản ghi (Giữa ca + trùng).`);
            fetchData(); // Refresh after deleting duplicates
        } catch (e) {
            console.error('handleRemoveDuplicateReports:', e);
            toast.error('Lỗi khi xóa trùng: ' + (e.message || String(e)));
        } finally {
            setRemovingDuplicates(false);
        }
    };

    // Load options for edit form (phải đặt trước early return)
    useEffect(() => {
        const loadEditOptions = async () => {
            try {
                // Load products from system_settings
                const { data: productsData } = await supabase
                    .from('system_settings')
                    .select('name')
                    .neq('type', 'test')
                    .order('name');

                const products = productsData?.map(p => p.name) || [];

                // Load markets from sales_reports
                const { data: marketsData } = await supabase
                    .from(reportTable)
                    .select('market')
                    .not('market', 'is', null)
                    .limit(1000);

                const markets = [...new Set(marketsData?.map(m => m.market).filter(Boolean))].sort();

                // Load branches from users
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
    }, [reportTable]);

    // Delete single report
    const handleDeleteReport = async (reportId) => {
        if (!window.confirm('Bạn có chắc chắn muốn xóa báo cáo này?')) return;

        setDeletingId(reportId);
        try {
            const { error } = await supabase
                .from(reportTable)
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
            revenue_go_actual: report.revenue_go_actual || 0
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
                .from(reportTable)
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
                    revenue_go_actual: Number(editForm.revenue_go_actual) || 0
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

    // Handle sort
    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    // Normalize name for matching (remove extra spaces, lowercase)
    const normalizeNameForMatch = (str) => {
        if (!str) return '';
        return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
    };

    // Check if two names match (fuzzy matching)
    const namesMatch = (name1, name2) => {
        const n1 = normalizeNameForMatch(name1);
        const n2 = normalizeNameForMatch(name2);
        return n1 === n2 || n1.includes(n2) || n2.includes(n1);
    };

    const fetchOrdersByReportDate = useCallback(
        async (reportDate) => {
            const ymd = normalizeDateYmd(reportDate);
            if (!ymd) return [];
            const apiDate = ymdToDdMmYyyyForApi(ymd);
            if (!apiDate) return [];

            const fetchApiPaged = async () => {
                const all = [];
                let next_after_id;
                for (let guard = 0; guard < 600; guard += 1) {
                    const params = new URLSearchParams();
                    params.set('from_date', apiDate);
                    params.set('to_date', apiDate);
                    if (next_after_id) params.set('next_after_id', next_after_id);
                    const url = `https://lumidataapi.vercel.app${ordersApiEndpoint}?${params.toString()}`;
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const result = await response.json();
                    const chunk = result.data || [];
                    const base = all.length;
                    chunk.forEach((row, idx) => {
                        all.push(normalizeOrderForCalc(row, base + idx));
                    });
                    next_after_id = result.next_after_id;
                    if (!next_after_id) break;
                }
                return all;
            };

            if (isHcm) {
                try {
                    const fromDb = await fetchOrderCodeHcmOrdersForDate(ymd);
                    const dbNorm = fromDb.map((row, idx) => normalizeOrderForCalc(row, idx));
                    const fromApi = await fetchApiPaged();
                    return mergeOrdersByOrderCode(dbNorm, fromApi);
                } catch (e) {
                    console.warn('[DanhSachBaoCaoTay] order_code_hcm không đọc được, chỉ dùng API:', e?.message || e);
                    return fetchApiPaged();
                }
            }
            return fetchApiPaged();
        },
        [ordersApiEndpoint, isHcm]
    );

    // View orders for a specific report
    const handleViewOrders = async (report) => {
        setViewingReport(report);
        setShowViewOrdersModal(true);
        setViewingOrders([]);
        setLoadingOrders(true);

        try {
            const reportDate = normalizeDateYmd(report.date);
            if (!reportDate) {
                toast.error('Báo cáo không có ngày hợp lệ!');
                setLoadingOrders(false);
                return;
            }

            console.log('🔍 [DanhSachBaoCaoTay] Viewing orders for report:', {
                id: report.id,
                date: reportDate,
                shift: report.shift,
                name: report.name,
                product: report.product,
                market: report.market
            });

            let matchingOrders = await fetchOrdersByReportDate(reportDate);
            console.log(
                `✅ [DanhSachBaoCaoTay] Fetched ${matchingOrders.length} orders (API ${ordersApiEndpoint}${isHcm ? ' + order_code_hcm' : ''})`
            );
            console.log(`📅 [DanhSachBaoCaoTay] Report date (normalized): ${reportDate}`);

            matchingOrders = filterOrdersMatchingSaleReport(matchingOrders, reportDate, report, namesMatch);

            console.log(`✅ [DanhSachBaoCaoTay] Found ${matchingOrders.length} matching orders after filtering`);
            setViewingOrders(matchingOrders);
        } catch (error) {
            console.error('❌ [DanhSachBaoCaoTay] Error fetching orders:', error);
            toast.error('Lỗi khi lấy danh sách đơn: ' + error.message);
        } finally {
            setLoadingOrders(false);
        }
    };

    const availablePersonnelOptions = useMemo(
        () => [...new Set((manualReports || []).map((item) => String(item?.name || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' })),
        [manualReports]
    );

    const filteredPersonnelOptions = useMemo(() => {
        const keyword = personnelSearch.trim().toLowerCase();
        if (!keyword) return availablePersonnelOptions;
        return availablePersonnelOptions.filter((name) => name.toLowerCase().includes(keyword));
    }, [availablePersonnelOptions, personnelSearch]);

    const reportsAfterPersonnelFilter = useMemo(() => {
        let rows = manualReports || [];
        const selected = filters.personnel || [];
        if (selected.length > 0) {
            const selectedCanon = selected
                .map((name) => canonicalPersonName(name))
                .filter(Boolean);
            rows = rows.filter((item) => {
                const rowName = canonicalPersonName(item?.name || '');
                if (!rowName) return false;
                return selectedCanon.some(
                    (allowedName) =>
                        rowName === allowedName ||
                        rowName.includes(allowedName) ||
                        allowedName.includes(rowName)
                );
            });
        }
        const q = staffTableSearch.trim().toLowerCase();
        if (q) {
            rows = rows.filter((item) => String(item?.name || '').toLowerCase().includes(q));
        }
        return rows;
    }, [manualReports, filters.personnel, staffTableSearch]);

    /** Ghi các dòng đang hiển thị (sau bộ lọc ngày / SP / TT / nhân sự / ô tìm tên) vào sales_reports_backup. Trùng id → ghi đè bản trong backup. */
    const handleBackupFilteredToSalesReportsBackup = useCallback(async () => {
        const rows = reportsAfterPersonnelFilter;
        if (!rows.length) {
            toast.warn('Không có dòng nào sau bộ lọc để backup.');
            return;
        }
        const srcLabel = reportTable;
        if (
            !window.confirm(
                `Sao chép ${rows.length} dòng đang hiển thị vào bảng «${SALES_REPORTS_BACKUP_TABLE}»?\n\n` +
                    `Nguồn: ${srcLabel} (theo bộ lọc trên trang). ` +
                    `Nếu id đã có trong backup, bản ghi backup sẽ được cập nhật theo dữ liệu hiện tại.\n\n` +
                    'Tiếp tục?'
            )
        ) {
            return;
        }
        setBackingUp(true);
        const BATCH = 300;
        try {
            for (let i = 0; i < rows.length; i += BATCH) {
                const chunk = rows.slice(i, i + BATCH);
                const { error } = await supabase
                    .from(SALES_REPORTS_BACKUP_TABLE)
                    .upsert(chunk, { onConflict: 'id' });
                if (error) throw error;
            }
            toast.success(`Đã backup ${rows.length} dòng vào ${SALES_REPORTS_BACKUP_TABLE}.`);
        } catch (e) {
            console.error('handleBackupFilteredToSalesReportsBackup:', e);
            toast.error(
                'Lỗi khi backup: ' +
                    (e?.message || String(e)) +
                    ' — Kiểm tra đã tạo bảng backup và quyền RLS trên Supabase.'
            );
        } finally {
            setBackingUp(false);
        }
    }, [reportsAfterPersonnelFilter, reportTable]);

    const normalizeNameForUserTeamLookup = useCallback(
        (s) =>
            String(s || '')
                .trim()
                .replace(/\s+/g, ' ')
                .toLowerCase(),
        []
    );

    /** Khớp `sales_reports.name` với `users.name` / `username`, ghi `team` & `branch` từ users. */
    const handleSyncTeamFromUsers = useCallback(async () => {
        if (
            !window.confirm(
                'Đồng bộ cột Team và Chi nhánh (branch) từ bảng users?\n\n' +
                    'Áp dụng cho các dòng đang hiển thị (theo bộ lọc ngày / sản phẩm / thị trường / nhân sự).\n' +
                    'Khớp tên (name / username) không phân biệt hoa thường, sau khi chuẩn hóa khoảng trắng.'
            )
        ) {
            return;
        }
        const rows = reportsAfterPersonnelFilter;
        if (!rows.length) {
            toast.warn('Không có dữ liệu trong khoảng đã lọc.');
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
                const n = normalizeNameForUserTeamLookup(u.name);
                const un = normalizeNameForUserTeamLookup(u.username);
                const payload = { team: teamVal, branch: branchVal };
                if (n) nameToProfile.set(n, payload);
                if (un) nameToProfile.set(un, payload);
            });

            let updated = 0;
            let skippedNoMatch = 0;
            let skippedSame = 0;

            for (const r of rows) {
                const key = normalizeNameForUserTeamLookup(r.name);
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
                    .from(reportTable)
                    .update({
                        team: newTeam || null,
                        branch: newBranch || null,
                    })
                    .eq('id', r.id);
                if (upErr) throw upErr;
                updated += 1;
            }

            toast.success(
                `Đã cập nhật team & chi nhánh: ${updated} dòng. ` +
                    `Không khớp / thiếu team&branch trên user: ${skippedNoMatch}. ` +
                    `Đã khớp, không đổi: ${skippedSame}.`
            );
            fetchData();
        } catch (error) {
            console.error('handleSyncTeamFromUsers:', error);
            toast.error('Lỗi đồng bộ team & chi nhánh: ' + (error.message || String(error)));
        } finally {
            setTeamSyncing(false);
        }
    }, [reportsAfterPersonnelFilter, fetchData, normalizeNameForUserTeamLookup, reportTable]);

    /**
     * Gộp team «CSKH-Lý» / «CSKH- Lý» → CSKH-HN trên sales_reports, users
     * và (khi đang xem HCM) sale_report_hcm — khớp manual SQL trong repo.
     */
    const handleNormalizeCskhLyTeamToHn = useCallback(async () => {
        const variantList = CSKH_LY_TEAM_VARIANTS.join('», «');
        if (
            !window.confirm(
                `Cập nhật cột team: «${variantList}» → ${CSKH_HN_TEAM_CANONICAL}\n\n` +
                    `• Bảng sales_reports\n` +
                    `• Bảng users\n` +
                    (isHcm ? `• Bảng sale_report_hcm (trang HCM)\n` : '') +
                    `\nChỉ các dòng có team khớp chính xác một trong các biến thể trên. Tiếp tục?`
            )
        ) {
            return;
        }
        setNormalizingCskhLyTeam(true);
        try {
            const { data: sr, error: eSr } = await supabase
                .from('sales_reports')
                .update({ team: CSKH_HN_TEAM_CANONICAL })
                .in('team', CSKH_LY_TEAM_VARIANTS)
                .select('id');
            if (eSr) throw eSr;

            const { data: ur, error: eUr } = await supabase
                .from('users')
                .update({ team: CSKH_HN_TEAM_CANONICAL })
                .in('team', CSKH_LY_TEAM_VARIANTS)
                .select('id');
            if (eUr) throw eUr;

            let hcmN = 0;
            if (isHcm && reportTable === 'sale_report_hcm') {
                const { data: hr, error: eHr } = await supabase
                    .from('sale_report_hcm')
                    .update({ team: CSKH_HN_TEAM_CANONICAL })
                    .in('team', CSKH_LY_TEAM_VARIANTS)
                    .select('id');
                if (eHr) throw eHr;
                hcmN = Array.isArray(hr) ? hr.length : 0;
            }

            const nSr = Array.isArray(sr) ? sr.length : 0;
            const nUr = Array.isArray(ur) ? ur.length : 0;

            toast.success(
                `Đã chuẩn hoá team → ${CSKH_HN_TEAM_CANONICAL}: sales_reports ${nSr} dòng, users ${nUr} dòng` +
                    (isHcm && reportTable === 'sale_report_hcm' ? `, sale_report_hcm ${hcmN} dòng` : '') +
                    '.'
            );
            fetchData();
        } catch (error) {
            console.error('handleNormalizeCskhLyTeamToHn:', error);
            toast.error('Lỗi chuẩn hoá team CSKH-Lý: ' + (error.message || String(error)));
        } finally {
            setNormalizingCskhLyTeam(false);
        }
    }, [fetchData, isHcm, reportTable]);

    /** HCM: sửa thị trường gõ nhầm "Us" → "US" trong sale_report_hcm. */
    const handleFixUsMarketToUS = useCallback(async () => {
        if (!isHcm) return;
        if (
            !window.confirm(
                'Đổi cột Thị trường (market) từ "Us" sang "US" trong bảng sale_report_hcm?\n\n' +
                    'Chỉ các dòng có giá trị market chính xác "Us" (không đổi "us", "US", v.v.). Tiếp tục?'
            )
        ) {
            return;
        }
        setFixingUsMarket(true);
        try {
            const { data, error } = await supabase
                .from(reportTable)
                .update({ market: 'US' })
                .eq('market', 'Us')
                .select('id');
            if (error) throw error;
            const n = Array.isArray(data) ? data.length : 0;
            toast.success(`Đã cập nhật ${n} dòng: Us → US (thị trường).`);
            fetchData();
        } catch (error) {
            console.error('handleFixUsMarketToUS:', error);
            toast.error('Lỗi đổi Us → US: ' + (error.message || String(error)));
        } finally {
            setFixingUsMarket(false);
        }
    }, [fetchData, isHcm, reportTable]);

    // Hiển thị từng dòng báo cáo, không gộp theo ngày + tên (mỗi bản ghi một hàng, đủ thao tác).
    const reportsGroupedByDateAndName = useMemo(() => {
        return (reportsAfterPersonnelFilter || []).map((row) => ({
            ...row,
            _sourceCount: 1,
        }));
    }, [reportsAfterPersonnelFilter]);

    const reportTableTotals = useMemo(() => {
        const rows = reportsGroupedByDateAndName || [];
        return rows.reduce(
            (acc, item) => ({
                mess_count: acc.mess_count + Number(item.mess_count || 0),
                response_count: acc.response_count + Number(item.response_count || 0),
                order_count: acc.order_count + Number(item.order_count || 0),
                order_cancel_count: acc.order_cancel_count + Number(item.order_cancel_count || 0),
                revenue_actual: acc.revenue_actual + Number(item.revenue_actual || 0),
                revenue_cancel_actual: acc.revenue_cancel_actual + Number(item.revenue_cancel_actual || 0),
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
    }, [reportsGroupedByDateAndName]);

    // Sort data
    const sortedReports = [...reportsGroupedByDateAndName].sort((a, b) => {
        if (!sortColumn) return 0;

        let aVal, bVal;

        // Map column names to data fields
        const columnMap = {
            'Ngày': 'date',
            'Ca': 'shift',
            'Người báo cáo': 'name',
            'Team': 'team',
            'Sản phẩm': 'product',
            'Thị trường': 'market',
            'Số mess': 'mess_count',
            'Phản hồi': 'response_count',
            'Số đơn': 'order_count',
            'Số đơn hủy': 'order_cancel_count',
            'Doanh số': 'revenue_actual',
            'Doanh số hủy': 'revenue_cancel_actual',
            ...(!isHcm ? { 'Số đơn go': 'order_go', 'Doanh số go': 'revenue_go_actual' } : {}),
        };

        const field = columnMap[sortColumn];
        if (!field) return 0;

        aVal = a[field];
        bVal = b[field];

        // Handle date sorting
        if (field === 'date') {
            const dA = aVal ? new Date(aVal).getTime() : 0;
            const dB = bVal ? new Date(bVal).getTime() : 0;
            return sortDirection === 'asc' ? dA - dB : dB - dA;
        }

        // Handle number sorting
        const numericSortFields = [
            'mess_count',
            'response_count',
            'order_count',
            'order_cancel_count',
            'revenue_actual',
            'revenue_cancel_actual',
            ...(isHcm ? [] : ['order_go', 'revenue_go_actual']),
        ];
        if (numericSortFields.includes(field)) {
            const numA = Number(aVal) || 0;
            const numB = Number(bVal) || 0;
            return sortDirection === 'asc' ? numA - numB : numB - numA;
        }

        // Handle string sorting
        const strA = String(aVal || '').toLowerCase();
        const strB = String(bVal || '').toLowerCase();
        const comparison = strA.localeCompare(strB, 'vi', { numeric: true });
        return sortDirection === 'asc' ? comparison : -comparison;
    });

    if (!hasManualListAccess) {
        return (
            <div className="p-8 text-center text-red-600 font-bold">
                Bạn không có quyền truy cập trang này ({deniedPermissionLabel}).
            </div>
        );
    }

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
                            <button
                                onClick={() => handleQuickDateSelect('today')}
                                style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Hôm nay
                            </button>
                            <button
                                onClick={() => handleQuickDateSelect('yesterday')}
                                style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Hôm qua
                            </button>
                            <button
                                onClick={() => handleQuickDateSelect('thisWeek')}
                                style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Tuần này
                            </button>
                            <button
                                onClick={() => handleQuickDateSelect('lastWeek')}
                                style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Tuần trước
                            </button>
                            <button
                                onClick={() => handleQuickDateSelect('thisMonth')}
                                style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Tháng này
                            </button>
                            <button
                                onClick={() => handleQuickDateSelect('lastMonth')}
                                style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Tháng trước
                            </button>
                            <button
                                onClick={() => handleQuickDateSelect('last7Days')}
                                style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                7 ngày qua
                            </button>
                            <button
                                onClick={() => handleQuickDateSelect('last30Days')}
                                style={{ padding: '6px 10px', fontSize: '12px', background: '#4A6E23', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                30 ngày qua
                            </button>
                        </div>
                    </div>

                    {/* Date Range Filters */}
                    <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#333' }}>Khoảng thời gian:</h4>
                        <label style={{ display: 'block', marginBottom: '10px' }}>
                            <span style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Từ ngày:</span>
                            <input
                                type="date"
                                value={filters.startDate}
                                onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                                style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px' }}
                            />
                        </label>
                        <label style={{ display: 'block' }}>
                            <span style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Đến ngày:</span>
                            <input
                                type="date"
                                value={filters.endDate}
                                onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                                style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px' }}
                            />
                        </label>
                    </div>

                    {/* Tìm theo tên — lọc trực tiếp bảng (giống báo cáo MKT: gõ tên) */}
                    <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>Tìm theo nhân sự</h4>
                        <input
                            type="text"
                            value={staffTableSearch}
                            onChange={(e) => setStaffTableSearch(e.target.value)}
                            placeholder="Gõ để tìm tên (lọc bảng)..."
                            style={{ width: '100%', padding: '8px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px' }}
                        />
                        <p style={{ fontSize: '11px', color: '#666', marginTop: '6px', marginBottom: 0 }}>
                            Không phân biệt hoa thường; khớp một phần tên người báo cáo.
                        </p>
                    </div>

                    {/* Personnel Filter */}
                    <div style={{ marginBottom: '20px' }}>
                        <details>
                            <summary style={{ cursor: 'pointer', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '10px' }}>
                                Chọn nhân sự ({(filters.personnel || []).length}/{availablePersonnelOptions.length})
                            </summary>
                            <div style={{ marginTop: '10px' }}>
                                <input
                                    type="text"
                                    value={personnelSearch}
                                    onChange={(e) => setPersonnelSearch(e.target.value)}
                                    placeholder="Gõ để lọc danh sách checkbox..."
                                    style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px', marginBottom: '8px' }}
                                />
                                <label style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>
                                    <input
                                        type="checkbox"
                                        checked={(filters.personnel || []).length === availablePersonnelOptions.length && availablePersonnelOptions.length > 0}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setFilters((prev) => ({
                                                ...prev,
                                                personnel: checked ? [...availablePersonnelOptions] : []
                                            }));
                                        }}
                                        style={{ marginRight: '5px' }}
                                    />
                                    Tất cả
                                </label>
                                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '5px' }}>
                                    {filteredPersonnelOptions.length === 0 ? (
                                        <div style={{ fontSize: '11px', color: '#999', padding: '5px' }}>Không có nhân sự phù hợp</div>
                                    ) : (
                                        filteredPersonnelOptions.map((personName) => (
                                            <label key={personName} style={{ display: 'block', fontSize: '12px', marginBottom: '5px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={(filters.personnel || []).includes(personName)}
                                                    onChange={(e) => handleFilterChange('personnel', personName, e.target.checked)}
                                                    style={{ marginRight: '5px' }}
                                                />
                                                {personName}
                                            </label>
                                        ))
                                    )}
                                </div>
                                {!isAdmin && (
                                    <p style={{ fontSize: '11px', color: '#666', marginTop: '6px', marginBottom: 0 }}>
                                        Danh sách đang hiển thị theo `selected_personnel` của tài khoản.
                                    </p>
                                )}
                            </div>
                        </details>
                    </div>

                    {/* Product Filter */}
                    <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            Sản phẩm
                            <label style={{ fontSize: '11px', fontWeight: 'normal' }}>
                                <input
                                    type="checkbox"
                                    checked={(filters.products || []).length === availableOptions.products.length && availableOptions.products.length > 0}
                                    onChange={(e) => handleSelectAll('products', e.target.checked)}
                                    style={{ marginRight: '5px' }}
                                />
                                Tất cả
                            </label>
                        </h4>
                        <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '5px' }}>
                            {availableOptions.products.length === 0 ? (
                                <div style={{ fontSize: '11px', color: '#999', padding: '5px' }}>Đang tải...</div>
                            ) : (
                                availableOptions.products.map(product => (
                                    <label key={product} style={{ display: 'block', fontSize: '12px', marginBottom: '5px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={(filters.products || []).includes(product)}
                                            onChange={(e) => handleFilterChange('products', product, e.target.checked)}
                                            style={{ marginRight: '5px' }}
                                        />
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
                                <input
                                    type="checkbox"
                                    checked={(filters.markets || []).length === availableOptions.markets.length && availableOptions.markets.length > 0}
                                    onChange={(e) => handleSelectAll('markets', e.target.checked)}
                                    style={{ marginRight: '5px' }}
                                />
                                Tất cả
                            </label>
                        </h4>
                        <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '5px' }}>
                            {availableOptions.markets.length === 0 ? (
                                <div style={{ fontSize: '11px', color: '#999', padding: '5px' }}>Đang tải...</div>
                            ) : (
                                availableOptions.markets.map(market => (
                                    <label key={market} style={{ display: 'block', fontSize: '12px', marginBottom: '5px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={(filters.markets || []).includes(market)}
                                            onChange={(e) => handleFilterChange('markets', market, e.target.checked)}
                                            style={{ marginRight: '5px' }}
                                        />
                                        {market}
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="main-detailed">
                    <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <h2 style={{ margin: 0 }}>
                            {isHcm ? 'DANH SÁCH BÁO CÁO TAY SALE (HCM)' : 'DANH SÁCH BÁO CÁO TAY SALE'}
                        </h2>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {showBaoCaoTayAdminToolbarButtons && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleSyncTeamFromUsers}
                                        disabled={teamSyncing || loading || reportsAfterPersonnelFilter.length === 0}
                                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md text-sm font-bold transition shadow-sm"
                                        title="Cập nhật Team & Chi nhánh trên các dòng đang hiển thị theo bảng users (name / username)"
                                    >
                                        {teamSyncing ? (
                                            <>
                                                <span className="inline-block animate-spin mr-1">⏳</span>
                                                Đang chỉnh team & chi nhánh…
                                            </>
                                        ) : (
                                            'Chỉnh team & chi nhánh (theo users)'
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleNormalizeCskhLyTeamToHn}
                                        disabled={normalizingCskhLyTeam || loading}
                                        className="px-4 py-2.5 bg-slate-700 hover:bg-slate-800 disabled:bg-gray-400 text-white rounded-md text-sm font-semibold transition shadow-sm"
                                        title={`Tìm team CSKH-Lý / CSKH- Lý → đổi thành ${CSKH_HN_TEAM_CANONICAL} (sales_reports, users${isHcm ? ', sale_report_hcm' : ''})`}
                                    >
                                        {normalizingCskhLyTeam ? (
                                            <>
                                                <span className="inline-block animate-spin mr-1">⏳</span>
                                                Đang chuẩn hoá team…
                                            </>
                                        ) : (
                                            `Tìm CSKH-Lý → ${CSKH_HN_TEAM_CANONICAL}`
                                        )}
                                    </button>
                                    {isHcm && (
                                        <button
                                            type="button"
                                            onClick={handleFixUsMarketToUS}
                                            disabled={
                                                fixingUsMarket ||
                                                loading ||
                                                normalizingCskhLyTeam ||
                                                teamSyncing
                                            }
                                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded-md text-sm font-semibold transition shadow-sm"
                                            title="Cập nhật toàn bảng sale_report_hcm: market = Us → US"
                                        >
                                            {fixingUsMarket ? (
                                                <>
                                                    <span className="inline-block animate-spin mr-1">⏳</span>
                                                    Đang đổi Us → US…
                                                </>
                                            ) : (
                                                'Đổi Us → US (thị trường)'
                                            )}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {isAdminOnly && (
                                <button
                                    type="button"
                                    onClick={handleCalculateAndUpdateOrders}
                                    disabled={
                                        updatingOrders ||
                                        loading ||
                                        backingUp ||
                                        removingDuplicates ||
                                        teamSyncing ||
                                        normalizingCskhLyTeam ||
                                        fixingUsMarket
                                    }
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
                                    title="Tính từ Supabase đơn + cập nhật báo cáo tay — giống Admin Tools (cài đặt)"
                                >
                                    {updatingOrders ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            Đang tính... ({updateProgress.current}/{updateProgress.total})
                                        </>
                                    ) : (
                                        <>
                                            <Calculator className="w-4 h-4" />
                                            Tính toán dữ liệu
                                        </>
                                    )}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleBackupFilteredToSalesReportsBackup}
                                disabled={
                                    backingUp ||
                                    loading ||
                                    reportsAfterPersonnelFilter.length === 0 ||
                                    updatingOrders
                                }
                                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
                                title={`Ghi các dòng đang hiển thị (theo bộ lọc) vào ${SALES_REPORTS_BACKUP_TABLE}`}
                            >
                                {backingUp ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        Đang backup…
                                    </>
                                ) : (
                                    <>
                                        <Database className="w-4 h-4" />
                                        Backup dữ liệu
                                    </>
                                )}
                            </button>
                            {isAdminOnly && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleRemoveDuplicateReports}
                                        disabled={
                                            removingDuplicates ||
                                            loading ||
                                            reportsAfterPersonnelFilter.length === 0 ||
                                            updatingOrders
                                        }
                                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
                                        title="Xóa hết dòng Giữa ca; với phần còn lại gộp trùng (không tính Ca), giữ bản mới nhất"
                                    >
                                        {removingDuplicates ? (
                                            <>
                                                <span className="animate-spin">⏳</span>
                                                Đang xóa trùng...
                                            </>
                                        ) : (
                                            <>Xóa bản ghi trùng</>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="table-responsive-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>STT</th>
                                    <th
                                        className="cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('Ngày')}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Ngày
                                            {sortColumn === 'Ngày' && (
                                                <span className="text-[#F37021]">
                                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('Ca')}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Ca
                                            {sortColumn === 'Ca' && (
                                                <span className="text-[#F37021]">
                                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('Người báo cáo')}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Người báo cáo
                                            {sortColumn === 'Người báo cáo' && (
                                                <span className="text-[#F37021]">
                                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('Team')}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Team
                                            {sortColumn === 'Team' && (
                                                <span className="text-[#F37021]">
                                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('Sản phẩm')}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Sản phẩm
                                            {sortColumn === 'Sản phẩm' && (
                                                <span className="text-[#F37021]">
                                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('Thị trường')}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Thị trường
                                            {sortColumn === 'Thị trường' && (
                                                <span className="text-[#F37021]">
                                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('Số mess')}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Số mess
                                            {sortColumn === 'Số mess' && (
                                                <span className="text-[#F37021]">
                                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('Phản hồi')}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Phản hồi
                                            {sortColumn === 'Phản hồi' && (
                                                <span className="text-[#F37021]">
                                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('Số đơn')}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Số đơn
                                            {sortColumn === 'Số đơn' && (
                                                <span className="text-[#F37021]">
                                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('Số đơn hủy')}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Số đơn hủy
                                            {sortColumn === 'Số đơn hủy' && (
                                                <span className="text-[#F37021]">
                                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('Doanh số')}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Doanh số
                                            {sortColumn === 'Doanh số' && (
                                                <span className="text-[#F37021]">
                                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('Doanh số hủy')}
                                        style={{ userSelect: 'none' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Doanh số hủy
                                            {sortColumn === 'Doanh số hủy' && (
                                                <span className="text-[#F37021]">
                                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                    {!isHcm && (
                                        <>
                                            <th
                                                className="cursor-pointer hover:bg-gray-100 select-none"
                                                onClick={() => handleSort('Số đơn go')}
                                                style={{ userSelect: 'none' }}
                                            >
                                                <div className="flex items-center gap-1">
                                                    Số đơn go
                                                    {sortColumn === 'Số đơn go' && (
                                                        <span className="text-[#F37021]">
                                                            {sortDirection === 'asc' ? '↑' : '↓'}
                                                        </span>
                                                    )}
                                                </div>
                                            </th>
                                            <th
                                                className="cursor-pointer hover:bg-gray-100 select-none"
                                                onClick={() => handleSort('Doanh số go')}
                                                style={{ userSelect: 'none' }}
                                            >
                                                <div className="flex items-center gap-1">
                                                    Doanh số go
                                                    {sortColumn === 'Doanh số go' && (
                                                        <span className="text-[#F37021]">
                                                            {sortDirection === 'asc' ? '↑' : '↓'}
                                                        </span>
                                                    )}
                                                </div>
                                            </th>
                                        </>
                                    )}
                                    <th>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedReports.length > 0 && (
                                    <tr className="total-row">
                                        <td colSpan={7} className="total-label">
                                            TỔNG CỘNG ({sortedReports.length} dòng)
                                        </td>
                                        <td className="total-value">{formatNumber(reportTableTotals.mess_count)}</td>
                                        <td className="total-value">{formatNumber(reportTableTotals.response_count)}</td>
                                        <td className="total-value">{formatNumber(reportTableTotals.order_count)}</td>
                                        <td className="total-value">{formatNumber(reportTableTotals.order_cancel_count)}</td>
                                        <td className="total-value">{formatCurrency(reportTableTotals.revenue_actual)}</td>
                                        <td className="total-value">{formatCurrency(reportTableTotals.revenue_cancel_actual)}</td>
                                        {!isHcm && (
                                            <>
                                                <td className="total-value">{formatNumber(reportTableTotals.order_go)}</td>
                                                <td className="total-value">{formatCurrency(reportTableTotals.revenue_go_actual)}</td>
                                            </>
                                        )}
                                        <td className="text-center">—</td>
                                    </tr>
                                )}
                                {sortedReports.length === 0 ? (
                                    <tr>
                                        <td colSpan={isHcm ? 14 : 16} className="text-center">{loading ? 'Đang tải...' : 'Không có dữ liệu trong khoảng thời gian này.'}</td>
                                    </tr>
                                ) : (
                                    sortedReports.map((item, index) => (
                                        <tr key={item.id || index}>
                                            <td className="text-center">{index + 1}</td>
                                            <td>{formatDate(item.date)}</td>
                                            <td>{item.shift}</td>
                                            <td>{item.name}</td>
                                            <td>{isHcm ? formatHcmReportTeamCell(item) || '—' : item.team}</td>
                                            <td>{item.product}</td>
                                            <td>{item.market}</td>
                                            <td>{formatNumber(item.mess_count)}</td>
                                            <td>{formatNumber(item.response_count)}</td>
                                            <td>{formatNumber(item.order_count)}</td>
                                            <td>{formatNumber(item.order_cancel_count || 0)}</td>
                                            <td>{formatCurrency(item.revenue_actual || 0)}</td>
                                            <td>{formatCurrency(item.revenue_cancel_actual || 0)}</td>
                                            {!isHcm && (
                                                <>
                                                    <td>{formatNumber(item.order_go || 0)}</td>
                                                    <td>{formatCurrency(item.revenue_go_actual || 0)}</td>
                                                </>
                                            )}
                                            <td className="text-center">
                                                {item._sourceCount > 1 ? (
                                                    <span className="text-xs text-gray-500">
                                                        Đã gộp {item._sourceCount} dòng
                                                    </span>
                                                ) : (
                                                    <div className="flex gap-2 justify-center">
                                                        <button
                                                            className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs transition flex items-center gap-1"
                                                            onClick={() => handleViewOrders(item)}
                                                            title="Xem danh sách đơn hàng thỏa mãn điều kiện"
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
                                                                disabled={deletingId === item.id}
                                                            >
                                                                {deletingId === item.id ? 'Đang xóa...' : 'Xóa'}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {editingReport && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-6 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl relative">
                        <h3 className="text-lg font-bold mb-4 text-blue-600 border-b pb-2">Sửa Báo Cáo Sale</h3>

                        <div className="mb-4 text-sm text-gray-600">
                            <p><strong>Nhân viên:</strong> {editingReport.name}</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                            <div>
                                <label className="block text-sm font-medium mb-1">Ngày <span className="text-red-500">*</span>:</label>
                                <input
                                    type="date"
                                    name="date"
                                    value={editForm.date}
                                    onChange={handleInputChange}
                                    className="w-full border rounded px-2 py-1"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Ca:</label>
                                <select
                                    name="shift"
                                    value={editForm.shift}
                                    onChange={handleInputChange}
                                    className="w-full border rounded px-2 py-1"
                                >
                                    <option value="">Chọn ca</option>
                                    {editOptions.shifts.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Sản phẩm:</label>
                                <select
                                    name="product"
                                    value={editForm.product}
                                    onChange={handleInputChange}
                                    className="w-full border rounded px-2 py-1"
                                >
                                    <option value="">Chọn sản phẩm</option>
                                    {editOptions.products.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Thị trường:</label>
                                <select
                                    name="market"
                                    value={editForm.market}
                                    onChange={handleInputChange}
                                    className="w-full border rounded px-2 py-1"
                                >
                                    <option value="">Chọn thị trường</option>
                                    {editOptions.markets.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium mb-1">Chi nhánh:</label>
                                <select
                                    name="branch"
                                    value={editForm.branch || ''}
                                    onChange={handleInputChange}
                                    className="w-full border rounded px-2 py-1"
                                >
                                    <option value="">Chọn chi nhánh</option>
                                    {editOptions.branches.map(b => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Số mess:</label>
                                <input
                                    type="number"
                                    name="mess_count"
                                    value={editForm.mess_count}
                                    onChange={handleInputChange}
                                    className="w-full border rounded px-2 py-1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Phản hồi:</label>
                                <input
                                    type="number"
                                    name="response_count"
                                    value={editForm.response_count}
                                    onChange={handleInputChange}
                                    className="w-full border rounded px-2 py-1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Số đơn:</label>
                                <input
                                    type="number"
                                    name="order_count"
                                    value={editForm.order_count}
                                    onChange={handleInputChange}
                                    className="w-full border rounded px-2 py-1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Số đơn hủy:</label>
                                <input
                                    type="number"
                                    name="order_cancel_count"
                                    value={editForm.order_cancel_count || 0}
                                    onChange={handleInputChange}
                                    className="w-full border rounded px-2 py-1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Doanh số:</label>
                                <input
                                    type="number"
                                    name="revenue_actual"
                                    value={editForm.revenue_actual}
                                    onChange={handleInputChange}
                                    className="w-full border rounded px-2 py-1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Doanh số hủy:</label>
                                <input
                                    type="number"
                                    name="revenue_cancel_actual"
                                    value={editForm.revenue_cancel_actual || 0}
                                    onChange={handleInputChange}
                                    className="w-full border rounded px-2 py-1"
                                />
                            </div>
                            {!isHcm && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Số đơn go:</label>
                                        <input
                                            type="number"
                                            name="order_go"
                                            value={editForm.order_go || 0}
                                            onChange={handleInputChange}
                                            className="w-full border rounded px-2 py-1"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Doanh số go:</label>
                                        <input
                                            type="number"
                                            name="revenue_go_actual"
                                            value={editForm.revenue_go_actual || 0}
                                            onChange={handleInputChange}
                                            className="w-full border rounded px-2 py-1"
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={handleCloseModal}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm text-gray-800"
                                disabled={saving}
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold"
                                disabled={saving}
                            >
                                {saving ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Calculate Orders Modal */}

            {/* View Orders Modal */}
            {showViewOrdersModal && viewingReport && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">Danh sách đơn hàng</h2>
                                <p className="text-sm text-gray-600 mt-1">
                                    {viewingReport.name} - {formatDate(viewingReport.date)} - {viewingReport.shift || 'Không có ca'} -{' '}
                                    {isHcm && formatHcmReportTeamCell(viewingReport)
                                        ? `${formatHcmReportTeamCell(viewingReport)} · `
                                        : ''}
                                    {viewingReport.product || 'Tất cả SP'} - {viewingReport.market || 'Tất cả TT'}
                                </p>
                            </div>
                            <button
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
                                        <p className="text-2xl font-bold text-blue-600">
                                            {viewingOrders.length} đơn
                                        </p>
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
                                                    {isHcm && (
                                                        <th className="px-4 py-3 text-left border border-gray-200">Team</th>
                                                    )}
                                                    <th className="px-4 py-3 text-right border border-gray-200">Doanh thu (VNĐ)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {viewingOrders.map((order, index) => (
                                                    <tr key={order.__rowKey || order.id || index} className="hover:bg-gray-50">
                                                        <td className="px-4 py-2 border border-gray-200">{index + 1}</td>
                                                        <td className="px-4 py-2 border border-gray-200">
                                                            <div className="font-mono text-sm font-semibold text-blue-600">
                                                                {order.order_code || order.id || '-'}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2 border border-gray-200">
                                                            {order.customer_name || '-'}
                                                        </td>
                                                        <td className="px-4 py-2 border border-gray-200">
                                                            {formatDate(order.order_date)}
                                                        </td>
                                                        <td className="px-4 py-2 border border-gray-200">
                                                            {order.shift || '-'}
                                                        </td>
                                                        <td className="px-4 py-2 border border-gray-200">
                                                            <div className="font-medium text-gray-900">
                                                                {order.nhanvien_sale || order.sale_staff || '-'}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2 border border-gray-200">
                                                            {order.product || '-'}
                                                        </td>
                                                        <td className="px-4 py-2 border border-gray-200">
                                                            {order.country || '-'}
                                                        </td>
                                                        {isHcm && (
                                                            <td className="px-4 py-2 border border-gray-200">
                                                                {String(order.team ?? '').trim() || '—'}
                                                            </td>
                                                        )}
                                                        <td className="px-4 py-2 border border-gray-200 text-right">
                                                            {formatCurrency(order.total_amount_vnd || order.total_vnd || 0)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-gray-50 font-semibold">
                                                <tr>
                                                    <td
                                                        colSpan={isHcm ? 9 : 8}
                                                        className="px-4 py-3 text-right border border-gray-200"
                                                    >
                                                        Tổng doanh thu:
                                                    </td>
                                                    <td className="px-4 py-3 text-right border border-gray-200 text-blue-600">
                                                        {formatCurrency(
                                                            viewingOrders.reduce((sum, order) => 
                                                                sum + (parseFloat(order.total_amount_vnd || order.total_vnd) || 0), 0
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
