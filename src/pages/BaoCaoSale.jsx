import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';


import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';
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
    const [loading, setLoading] = useState(true);

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
    const [showTeamFilter, setShowTeamFilter] = useState(true);
    const [showMarketFilter, setShowMarketFilter] = useState(true);

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

    // Fetch số đơn hoàn hủy từ bảng orders theo filter:
    // 1. check_result = "Hủy" hoặc "Huỷ"
    // 2. sale_staff IN [danh sách tên Sale từ báo cáo] - theo bộ lọc
    // 3. product IN filters.products - theo bộ lọc
    // 4. country IN filters.markets - theo bộ lọc
    // 5. order_date BETWEEN startDate AND endDate - theo bộ lọc
    // Đếm trực tiếp khi match với từng record (không group trước)
    // Match rules (Tên Sale + Ngày của báo cáo):
    // - sale_staff (orders) = name (sales_reports)
    // - order_date (orders) = date (sales_reports) - ngày khớp với ngày của báo cáo
    // Lưu ý: Mỗi record trong báo cáo chỉ đếm đơn hủy của chính ngày đó
    const enrichWithCancelOrdersFromOrders = async (transformedData, startDate, endDate, productsFilter, marketsFilter) => {
        try {
            // Helper function để normalize date format - Database lưu ở định dạng YYYY-MM-DD
            // IMPORTANT: Sử dụng LOCAL date, KHÔNG dùng toISOString() vì nó chuyển sang UTC
            const normalizeDate = (date) => {
                if (!date) return '';
                if (date instanceof Date) {
                    // Sử dụng LOCAL date để tránh lỗi timezone
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
                    if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        return trimmed;
                    }
                    if (trimmed.includes('/')) {
                        const parts = trimmed.split('/');
                        if (parts.length === 3) {
                            const p1 = parseInt(parts[0]);
                            const p2 = parseInt(parts[1]);
                            const p3 = parseInt(parts[2]);
                            if (p2 > 12 && p1 <= 12) {
                                return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
                            } else if (p1 > 12 && p2 <= 12) {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            } else {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            }
                        }
                    }
                    const parsed = new Date(trimmed);
                    if (!isNaN(parsed.getTime())) {
                        // Sử dụng LOCAL date
                        const year = parsed.getFullYear();
                        const month = String(parsed.getMonth() + 1).padStart(2, '0');
                        const day = String(parsed.getDate()).padStart(2, '0');
                        return `${year}-${month}-${day}`;
                    }
                    return trimmed;
                }
                return String(date);
            };

            // Helper function để normalize string (trim và lowercase) - Định nghĩa trước khi sử dụng
            const normalizeStr = (str) => {
                if (!str) return '';
                // Normalize: trim, lowercase, và loại bỏ dấu cách thừa
                return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
            };

            // Normalize startDate và endDate để đảm bảo đúng định dạng YYYY-MM-DD (database format)
            const normalizedStartDate = normalizeDate(startDate);
            const normalizedEndDate = normalizeDate(endDate);

            console.log(`📅 Date filter: ${startDate} → ${normalizedStartDate}, ${endDate} → ${normalizedEndDate}`);

            // Lấy danh sách tên Sale từ báo cáo để filter ở query level
            const saleNamesFromReports = [...new Set(transformedData
                .map(item => item['Tên'])
                .filter(name => name && name.trim().length > 0)
            )];

            console.log(`👥 Lấy ${saleNamesFromReports.length} tên Sale từ báo cáo để filter`);

            // Log chi tiết các tên Sale trong báo cáo để debug
            const phamTuyetTrinhInReports = saleNamesFromReports.filter(name => {
                const normalized = normalizeStr(name);
                return normalized === 'phạm tuyết trinh' || normalized.includes('phạm tuyết trinh');
            });
            if (phamTuyetTrinhInReports.length > 0) {
                console.log(`🔍 Tên "Phạm Tuyết Trinh" trong báo cáo (${phamTuyetTrinhInReports.length} biến thể):`, phamTuyetTrinhInReports);
            }

            // Build query với filter theo check_result, tên Sale, Sản phẩm và Thị trường từ bộ lọc

            let query = supabase
                .from('orders')
                .select('order_date, sale_staff, check_result, product, country', { count: 'exact' }) // Thêm product và country để match với báo cáo
                .gte('order_date', normalizedStartDate)
                .lte('order_date', normalizedEndDate)
                .or('check_result.eq.Hủy,check_result.eq.Huỷ'); // Chỉ lấy chính xác "Hủy" hoặc "Huỷ"

            // Filter theo tên Sale từ báo cáo (theo bộ lọc)
            // Lưu ý: Cần match chính xác tên, không dùng ilike để tránh match sai
            if (saleNamesFromReports.length > 0) {
                // Sử dụng ilike với OR để match các tên Sale
                // Nhưng cần normalize để match chính xác hơn
                const saleConditions = saleNamesFromReports
                    .map(name => {
                        const trimmed = name.trim();
                        // Match chính xác hoặc partial match (để xử lý các biến thể tên)
                        return `sale_staff.ilike.%${trimmed}%`;
                    })
                    .join(',');
                query = query.or(saleConditions);

                console.log(`🔍 Filter theo ${saleNamesFromReports.length} tên Sale:`, saleNamesFromReports.slice(0, 5));
            }

            // KHÔNG filter theo Sản phẩm và Thị trường ở query level
            // Vì mỗi báo cáo có thể có sản phẩm/thị trường khác nhau
            // Sẽ match theo product và market ở client side khi group
            // if (productsFilter && productsFilter.length > 0) {
            //     query = query.in('product', productsFilter);
            // }
            // if (marketsFilter && marketsFilter.length > 0) {
            //     query = query.in('country', marketsFilter);
            // }

            // Thêm limit để tránh vượt quá giới hạn Supabase (mặc định 1000 records)
            // Vì chỉ cần đếm số đơn hủy, không cần tất cả dữ liệu chi tiết
            query = query.limit(10000); // Giới hạn 10,000 records (đủ cho hầu hết trường hợp)

            const { data: cancelOrders, error, count } = await query;

            if (error) {
                console.error('❌ Error fetching cancel orders:', error);
                return;
            }

            console.log(`📊 Tìm thấy ${cancelOrders?.length || 0} đơn hủy trong khoảng ${normalizedStartDate} - ${normalizedEndDate}`);

            // Cảnh báo nếu số lượng vượt quá limit
            if (count && count > 10000) {
                console.warn(`⚠️ Cảnh báo: Có ${count} đơn hủy nhưng chỉ fetch được ${cancelOrders?.length || 0} records (giới hạn 10,000). Có thể cần tăng limit hoặc filter chặt hơn.`);
            }

            // Validate và filter cancel orders
            const validCancelOrders = (cancelOrders || []).filter(order => {
                const checkResult = String(order.check_result || '').trim();
                return checkResult === 'Hủy' || checkResult === 'Huỷ';
            });

            console.log(`✅ Có ${validCancelOrders.length} đơn hủy hợp lệ sau khi filter`);

            // Log sample để debug matching
            if (validCancelOrders.length > 0) {
                const sampleOrder = validCancelOrders[0];
                console.log('🔍 Sample đơn hủy sau normalize:', {
                    original_order_date: sampleOrder.order_date,
                    normalized_order_date: normalizeDate(sampleOrder.order_date),
                    sale_staff: sampleOrder.sale_staff,
                    normalized_sale_staff: normalizeStr(sampleOrder.sale_staff)
                });

                // Log các đơn hủy của "Phạm Tuyết Trinh" để debug (chỉ log tên này)
                const phamTuyetTrinhOrders = validCancelOrders.filter(o => {
                    const name = normalizeStr(o.sale_staff || '');
                    return name === 'phạm tuyết trinh' || name.includes('phạm tuyết trinh');
                });
                if (phamTuyetTrinhOrders.length > 0) {
                    console.log(`🔍 Tìm thấy ${phamTuyetTrinhOrders.length} đơn hủy của "Phạm Tuyết Trinh":`, phamTuyetTrinhOrders.slice(0, 50).map(o => ({
                        sale_staff: o.sale_staff,
                        normalized: normalizeStr(o.sale_staff),
                        order_date: o.order_date,
                        normalized_date: normalizeDate(o.order_date),
                        check_result: o.check_result
                    })));

                    // Log unique dates và names để debug
                    const uniqueDates = [...new Set(phamTuyetTrinhOrders.map(o => normalizeDate(o.order_date)))];
                    const uniqueNames = [...new Set(phamTuyetTrinhOrders.map(o => normalizeStr(o.sale_staff)))];
                    console.log(`📅 Các ngày của Phạm Tuyết Trinh trong orders (${uniqueDates.length} ngày):`, uniqueDates.sort());
                    console.log(`👤 Tên đã normalize của Phạm Tuyết Trinh trong orders:`, uniqueNames);

                    // Kiểm tra các ngày có đơn hủy nhưng không có báo cáo
                    const reportDates = [...new Set(transformedData
                        .filter(item => {
                            const name = normalizeStr(item['Tên']);
                            return name === 'phạm tuyết trinh' || name.includes('phạm tuyết trinh');
                        })
                        .map(item => normalizeDate(item['Ngày']))
                    )];
                    const orderDatesOnly = uniqueDates.filter(d => !reportDates.includes(d));
                    if (orderDatesOnly.length > 0) {
                        console.warn(`⚠️ Các ngày có đơn hủy nhưng KHÔNG có báo cáo của "Phạm Tuyết Trinh":`, orderDatesOnly.sort());
                        console.warn(`   → Cần kiểm tra xem báo cáo đã được nhập vào sales_reports chưa`);
                    }
                } else {
                    console.log('⚠️ Không tìm thấy đơn hủy nào của "Phạm Tuyết Trinh" trong danh sách đã fetch');
                    console.log(`⚠️ Tổng số đơn hủy đã fetch: ${validCancelOrders.length}`);
                    // Log một vài tên khác để xem có gì
                    const sampleNames = [...new Set(validCancelOrders.slice(0, 10).map(o => normalizeStr(o.sale_staff)))];
                    console.log(`📋 Một vài tên trong đơn hủy đã fetch:`, sampleNames);
                }
            }

            // Log tất cả các tên Sale trong báo cáo để so sánh
            const uniqueReportNames = [...new Set(transformedData.map(item => ({
                original: item['Tên'],
                normalized: normalizeStr(item['Tên'])
            })))];
            const phamTuyetTrinhReports = uniqueReportNames.filter(n =>
                normalizeStr(n.original) === 'phạm tuyết trinh' ||
                normalizeStr(n.original).includes('phạm tuyết trinh')
            );
            if (phamTuyetTrinhReports.length > 0) {
                console.log(`📋 Tên "Phạm Tuyết Trinh" trong báo cáo:`, phamTuyetTrinhReports);

                // Log các ngày của Phạm Tuyết Trinh trong báo cáo
                const phamTuyetTrinhReportDates = transformedData
                    .filter(item => {
                        const name = normalizeStr(item['Tên']);
                        return name === 'phạm tuyết trinh' || name.includes('phạm tuyết trinh');
                    })
                    .map(item => ({
                        original_date: item['Ngày'],
                        normalized_date: normalizeDate(item['Ngày']),
                        name: item['Tên'],
                        normalized_name: normalizeStr(item['Tên'])
                    }));
                const uniqueReportDates = [...new Set(phamTuyetTrinhReportDates.map(d => d.normalized_date))];
                console.log(`📅 Các ngày của Phạm Tuyết Trinh trong báo cáo (${uniqueReportDates.length} ngày):`, uniqueReportDates.sort());
                console.log(`📊 Chi tiết các báo cáo của Phạm Tuyết Trinh (${phamTuyetTrinhReportDates.length} báo cáo):`, phamTuyetTrinhReportDates.slice(0, 30));
            } else {
                console.log('⚠️ Không tìm thấy báo cáo nào của "Phạm Tuyết Trinh" trong transformedData');
            }

            // Group đơn hủy theo Tên Sale + Ngày + Sản phẩm + Thị trường để match chính xác với từng báo cáo
            // Key: "saleName|date|product|market" -> orders[]
            const cancelOrdersBySaleDateProductMarket = new Map();

            validCancelOrders.forEach(order => {
                // Match theo:
                // - Tên Sale: sale_staff (orders) = name (sales_reports)
                // - Ngày: order_date (orders) = date (sales_reports)
                // - Sản phẩm: product (orders) = product (sales_reports)
                // - Thị trường: country (orders) = market (sales_reports)
                const orderSaleName = normalizeStr(order.sale_staff);
                const orderDateStr = normalizeDate(order.order_date);
                const orderProduct = normalizeStr(order.product || '');
                // Thị trường: chỉ lấy country
                const orderMarket = normalizeStr(order.country || '');
                const key = `${orderSaleName}|${orderDateStr}|${orderProduct}|${orderMarket}`;

                if (!cancelOrdersBySaleDateProductMarket.has(key)) {
                    cancelOrdersBySaleDateProductMarket.set(key, []);
                }
                cancelOrdersBySaleDateProductMarket.get(key).push(order);
            });

            // Log cho Phạm Tuyết Trinh
            const phamTuyetTrinhKeys = Array.from(cancelOrdersBySaleDateProductMarket.keys()).filter(key => {
                const saleName = key.split('|')[0];
                return saleName === 'phạm tuyết trinh' || saleName.includes('phạm tuyết trinh');
            });
            if (phamTuyetTrinhKeys.length > 0) {
                console.log(`📊 Đơn hủy của Phạm Tuyết Trinh (đã group theo Tên + Ngày + Sản phẩm + Thị trường):`);
                phamTuyetTrinhKeys.forEach(key => {
                    const [saleName, date, product, market] = key.split('|');
                    const orders = cancelOrdersBySaleDateProductMarket.get(key);
                    console.log(`  - ${saleName} | ${date} | ${product} | ${market}: ${orders.length} đơn hủy`);
                });
            }

            // Cập nhật transformedData với số đơn hoàn hủy từ orders (đã group theo Tên Sale + Ngày)
            let matchedCount = 0;
            const debugLogs = [];

            transformedData.forEach((item, idx) => {
                // Match với sales_reports (Tên Sale + Ngày của báo cáo):
                // - name (sales_reports) = sale_staff (orders)
                // - date (sales_reports) = order_date (orders) - ngày khớp với ngày của báo cáo
                // Lưu ý: 
                // - Sản phẩm và Thị trường đã được filter ở query, không cần match
                // - Mỗi record chỉ đếm đơn hủy của chính ngày đó
                const saleName = normalizeStr(item['Tên']); // name từ sales_reports
                const reportDateRaw = item['Ngày']; // date từ sales_reports - ngày của báo cáo
                const reportDate = normalizeDate(reportDateRaw);

                // Log cho "Phạm Tuyết Trinh" để debug (chỉ log tên này, không log các tên khác có chứa "trinh")
                const isPhamTuyetTrinh = saleName === 'phạm tuyết trinh' || saleName.includes('phạm tuyết trinh');
                if (isPhamTuyetTrinh) {
                    console.log(`🔍 Debug Phạm Tuyết Trinh [${idx}]:`, {
                        original_name: item['Tên'],
                        normalized_name: saleName,
                        original_date: reportDateRaw,
                        normalized_date: reportDate,
                        product: item['Sản phẩm'],
                        market: item['Thị trường']
                    });
                }

                if (!saleName || !reportDate) {
                    item['Số đơn hoàn hủy thực tế'] = 0;
                    item['Doanh số hoàn hủy thực tế'] = 0;
                    if (isPhamTuyetTrinh) {
                        debugLogs.push(`⚠️ Phạm Tuyết Trinh [${idx}]: Thiếu tên hoặc ngày - saleName: ${saleName}, reportDate: ${reportDate}`);
                    }
                    return;
                }

                // Lấy số đơn hủy từ Map (đã group theo Tên Sale + Ngày + Sản phẩm + Thị trường)
                // Match theo cùng rule như "Số đơn TT":
                // - Tên Sale: sale_staff (orders) = name (sales_reports) ✓
                // - Ngày: order_date (orders) = date (sales_reports) ✓
                // - Sản phẩm: product (orders) = product (sales_reports) ✓
                // - Thị trường: country (orders) = market (sales_reports) ✓
                const reportProduct = normalizeStr(item['Sản phẩm'] || '');
                const reportMarket = normalizeStr(item['Thị trường'] || '');
                const key = `${saleName}|${reportDate}|${reportProduct}|${reportMarket}`;
                let matchingOrders = cancelOrdersBySaleDateProductMarket.get(key) || [];

                // Nếu không match được với key đầy đủ, thử match với key không có product/market
                // (cho trường hợp đơn hàng có product/market empty) - cùng rule như Số đơn TT
                if (matchingOrders.length === 0) {
                    const keyWithoutProductMarket = `${saleName}|${reportDate}||`;
                    const ordersWithoutProductMarket = cancelOrdersBySaleDateProductMarket.get(keyWithoutProductMarket) || [];

                    // Chỉ lấy các đơn hàng có product hoặc market empty
                    const emptyProductMarketOrders = ordersWithoutProductMarket.filter(order => {
                        const orderProduct = normalizeStr(order.product || '');
                        const orderMarket = normalizeStr(order.country || '');
                        return orderProduct === '' || orderMarket === '';
                    });

                    if (emptyProductMarketOrders.length > 0) {
                        matchingOrders = emptyProductMarketOrders;
                        if (isPhamTuyetTrinh) {
                            console.log(`ℹ️ [enrichWithCancelOrdersFromOrders] Match với key không có product/market cho "${item['Tên']}" ngày ${reportDateRaw}: ${matchingOrders.length} đơn hủy`);
                        }
                    }
                }

                const count = matchingOrders.length;

                if (isPhamTuyetTrinh) {
                    console.log(`📊 Phạm Tuyết Trinh [${idx}]: Key "${key}" → ${count} đơn hủy`);
                    console.log(`   - Tên Sale: "${item['Tên']}" → normalized: "${saleName}"`);
                    console.log(`   - Ngày: "${item['Ngày']}" → normalized: "${reportDate}"`);
                    console.log(`   - Sản phẩm: "${item['Sản phẩm']}" → normalized: "${reportProduct}"`);
                    console.log(`   - Thị trường: "${item['Thị trường']}" → normalized: "${reportMarket}"`);

                    // Log các key có cùng Tên Sale + Ngày để debug
                    const sameSaleDateKeys = Array.from(cancelOrdersBySaleDateProductMarket.keys()).filter(k => {
                        const [kSaleName, kDate] = k.split('|');
                        return kSaleName === saleName && kDate === reportDate;
                    });
                    if (sameSaleDateKeys.length > 0) {
                        console.log(`   - Các key có cùng Tên Sale + Ngày (${sameSaleDateKeys.length} keys):`, sameSaleDateKeys);
                    }
                }

                if (count > 0) {
                    item['Số đơn hoàn hủy thực tế'] = count;
                    item['Doanh số hoàn hủy thực tế'] = 0;
                    matchedCount++;
                    if (isPhamTuyetTrinh) {
                        debugLogs.push(`✅ Phạm Tuyết Trinh [${idx}]: Match ${count} đơn hủy - ngày: ${reportDate}`);
                    }
                } else {
                    item['Số đơn hoàn hủy thực tế'] = 0;
                    item['Doanh số hoàn hủy thực tế'] = 0;
                    if (isPhamTuyetTrinh) {
                        debugLogs.push(`❌ Phạm Tuyết Trinh [${idx}]: Không match - ngày báo cáo: ${reportDate}, tên: ${saleName}`);
                    }
                }
            });

            console.log(`✅ Đã match ${matchedCount}/${transformedData.length} records với số đơn hủy từ orders`);

            // Log debug cho Phạm Tuyết Trinh
            if (debugLogs.length > 0) {
                console.log('🔍 Debug logs cho Phạm Tuyết Trinh:');
                debugLogs.forEach(log => console.log(log));
            }

            // Log sample đơn hủy để so sánh
            if (validCancelOrders.length > 0) {
                const sampleDates = validCancelOrders.slice(0, 5).map(o => ({
                    raw: o.order_date,
                    normalized: normalizeDate(o.order_date),
                    sale: o.sale_staff
                }));
                console.log('📊 Sample đơn hủy (5 đầu tiên):', sampleDates);
            }
        } catch (err) {
            console.error('❌ Error enriching with cancel orders:', err);
        }
    };

    // Fetch số đơn tổng (tất cả các đơn, không filter theo check_result) từ bảng orders
    const enrichWithTotalOrdersFromOrders = async (transformedData, startDate, endDate) => {
        try {
            // Helper function để normalize date format - Database lưu ở định dạng YYYY-MM-DD
            // IMPORTANT: Sử dụng LOCAL date, KHÔNG dùng toISOString() vì nó chuyển sang UTC
            const normalizeDate = (date) => {
                if (!date) return '';
                if (date instanceof Date) {
                    // Sử dụng LOCAL date để tránh lỗi timezone
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
                    if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        return trimmed;
                    }
                    if (trimmed.includes('/')) {
                        const parts = trimmed.split('/');
                        if (parts.length === 3) {
                            const p1 = parseInt(parts[0]);
                            const p2 = parseInt(parts[1]);
                            const p3 = parseInt(parts[2]);
                            if (p2 > 12 && p1 <= 12) {
                                return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
                            } else if (p1 > 12 && p2 <= 12) {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            } else {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            }
                        }
                    }
                    const parsed = new Date(trimmed);
                    if (!isNaN(parsed.getTime())) {
                        // Sử dụng LOCAL date
                        const year = parsed.getFullYear();
                        const month = String(parsed.getMonth() + 1).padStart(2, '0');
                        const day = String(parsed.getDate()).padStart(2, '0');
                        return `${year}-${month}-${day}`;
                    }
                    return trimmed;
                }
                return String(date);
            };

            // Helper function để normalize string (trim và lowercase)
            const normalizeStr = (str) => {
                if (!str) return '';
                return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
            };

            const normalizedStartDate = normalizeDate(startDate);
            const normalizedEndDate = normalizeDate(endDate);

            // Lấy danh sách tên Sale từ báo cáo để filter ở query level
            const saleNamesFromReports = [...new Set(transformedData
                .map(item => item['Tên'])
                .filter(name => name && name.trim().length > 0)
            )];

            // Build query - KHÔNG filter theo check_result (lấy tất cả các đơn)
            // Thêm order_code để tránh tính trùng trong fallback matching
            let query = supabase
                .from('orders')
                .select('order_code, order_date, sale_staff, product, country', { count: 'exact' })
                .gte('order_date', normalizedStartDate)
                .lte('order_date', normalizedEndDate);

            // Filter theo tên Sale từ báo cáo
            // Lưu ý: Nếu có quá nhiều tên, có thể vượt quá giới hạn của Supabase OR conditions
            // Nên ta sẽ lấy tất cả orders trong khoảng thời gian, sau đó filter ở client side
            // Hoặc nếu số lượng tên ít, vẫn dùng filter ở query level để tối ưu
            if (saleNamesFromReports.length > 0 && saleNamesFromReports.length <= 50) {
                const saleConditions = saleNamesFromReports
                    .map(name => `sale_staff.ilike.%${name.trim()}%`)
                    .join(',');
                query = query.or(saleConditions);
                console.log(`🔍 Filter orders theo ${saleNamesFromReports.length} tên Sale từ báo cáo`);
            } else if (saleNamesFromReports.length > 50) {
                console.warn(`⚠️ Có ${saleNamesFromReports.length} tên Sale, bỏ qua filter ở query level (sẽ filter ở client side)`);
            }

            query = query.limit(10000);

            const { data: allOrders, error, count } = await query;

            if (error) {
                console.error('❌ Error fetching total orders:', error);
                return;
            }

            console.log(`📊 Tìm thấy ${allOrders?.length || 0} đơn tổng trong khoảng ${normalizedStartDate} - ${normalizedEndDate}`);

            // Debug: Đếm đơn theo ngày
            const ordersByDate = {};
            (allOrders || []).forEach(order => {
                const dateStr = normalizeDate(order.order_date);
                ordersByDate[dateStr] = (ordersByDate[dateStr] || 0) + 1;
            });
            console.log(`📅 Phân bổ đơn theo ngày:`, ordersByDate);
            if (ordersByDate['2026-01-29']) {
                console.log(`✅ Tìm thấy ${ordersByDate['2026-01-29']} đơn ngày 29/01/2026`);

                // Kiểm tra đơn của Phạm Tuyết Trinh ngày 29
                const phamTuyetTrinhOrders29 = (allOrders || []).filter(order => {
                    const orderSaleName = normalizeStr(order.sale_staff);
                    const orderDateStr = normalizeDate(order.order_date);
                    return (orderSaleName === 'phạm tuyết trinh' || orderSaleName.includes('phạm tuyết trinh')) &&
                        orderDateStr === '2026-01-29';
                });

                if (phamTuyetTrinhOrders29.length > 0) {
                    console.log(`🔍 [DEBUG] Tìm thấy ${phamTuyetTrinhOrders29.length} đơn của Phạm Tuyết Trinh ngày 29/01/2026 trong database:`);
                    phamTuyetTrinhOrders29.forEach((order, idx) => {
                        console.log(`  [${idx + 1}] Order Code: ${order.order_code || 'N/A'}, Product: "${order.product || '(empty)'}", Market: "${order.country || '(empty)'}"`);
                    });

                    // Kiểm tra xem có record nào trong báo cáo (transformedData) cho Phạm Tuyết Trinh ngày 29 không
                    const reportsForPhamTuyetTrinh29 = transformedData.filter(item => {
                        const itemSaleName = normalizeStr(item['Tên']);
                        const itemDate = normalizeDate(item['Ngày']);
                        return (itemSaleName === 'phạm tuyết trinh' || itemSaleName.includes('phạm tuyết trinh')) &&
                            itemDate === '2026-01-29';
                    });

                    if (reportsForPhamTuyetTrinh29.length === 0) {
                        console.warn(`⚠️ [WARNING] Có ${phamTuyetTrinhOrders29.length} đơn của Phạm Tuyết Trinh ngày 29 trong database NHƯNG KHÔNG CÓ record nào trong báo cáo (sales_reports)!`);
                        console.warn(`   → Đây là lý do tại sao "Số đơn TT" = 0. Báo cáo cần có data cho Phạm Tuyết Trinh ngày 29.`);
                    } else {
                        console.log(`✅ Tìm thấy ${reportsForPhamTuyetTrinh29.length} record trong báo cáo cho Phạm Tuyết Trinh ngày 29`);
                    }
                } else {
                    console.log(`ℹ️ Không tìm thấy đơn nào của Phạm Tuyết Trinh ngày 29/01/2026 trong database`);
                }
            } else {
                console.log(`⚠️ Không tìm thấy đơn nào ngày 29/01/2026 trong query result`);
            }

            if (count && count > 10000) {
                console.warn(`⚠️ Cảnh báo: Có ${count} đơn tổng nhưng chỉ fetch được ${allOrders?.length || 0} records (giới hạn 10,000).`);
            }

            // Group đơn theo Tên Sale + Ngày + Sản phẩm + Thị trường
            const ordersBySaleDateProductMarket = new Map();

            (allOrders || []).forEach(order => {
                const orderSaleName = normalizeStr(order.sale_staff);
                const orderDateStr = normalizeDate(order.order_date);
                const orderProduct = normalizeStr(order.product || '');
                const orderMarket = normalizeStr(order.country || '');
                const key = `${orderSaleName}|${orderDateStr}|${orderProduct}|${orderMarket}`;

                if (!ordersBySaleDateProductMarket.has(key)) {
                    ordersBySaleDateProductMarket.set(key, []);
                }
                ordersBySaleDateProductMarket.get(key).push(order);
            });

            // Cập nhật transformedData với số đơn tổng từ orders
            let updatedCount = 0;
            let zeroCount = 0;

            // IMPORTANT: Track order_codes đã được đếm để TRÁNH ĐẾM TRÙNG
            // Mỗi order chỉ được đếm 1 lần duy nhất cho 1 record
            const countedOrderCodes = new Set();

            transformedData.forEach((item, index) => {
                const saleName = normalizeStr(item['Tên']);
                const reportDateRaw = item['Ngày'];
                const reportDate = normalizeDate(reportDateRaw);
                const reportProduct = normalizeStr(item['Sản phẩm'] || '');
                const reportMarket = normalizeStr(item['Thị trường'] || '');

                if (!saleName || !reportDate) {
                    item['Số đơn TT'] = 0;
                    zeroCount++;
                    if (!reportDate) {
                        console.warn(`⚠️ [enrichWithTotalOrdersFromOrders] Record không có ngày hợp lệ:`, {
                            ten: item['Tên'],
                            ngay: reportDateRaw,
                            normalized: reportDate
                        });
                    }
                    return;
                }

                const key = `${saleName}|${reportDate}|${reportProduct}|${reportMarket}`;
                let matchingOrders = ordersBySaleDateProductMarket.get(key) || [];

                // Nếu không match được với key đầy đủ, thử match với key chỉ có Tên + Ngày
                // (cho trường hợp đơn hàng có product/market empty hoặc không khớp)
                if (matchingOrders.length === 0) {
                    const keyWithoutProductMarket = `${saleName}|${reportDate}||`;
                    const ordersWithoutProductMarket = ordersBySaleDateProductMarket.get(keyWithoutProductMarket) || [];

                    // Chỉ lấy các đơn hàng có product hoặc market empty
                    const emptyProductMarketOrders = ordersWithoutProductMarket.filter(order => {
                        const orderProduct = normalizeStr(order.product || '');
                        const orderMarket = normalizeStr(order.country || '');
                        return orderProduct === '' || orderMarket === '';
                    });

                    if (emptyProductMarketOrders.length > 0) {
                        matchingOrders = emptyProductMarketOrders;
                        console.log(`ℹ️ [enrichWithTotalOrdersFromOrders] Match với key không có product/market cho "${item['Tên']}" ngày ${reportDateRaw}: ${matchingOrders.length} đơn`);
                    }
                }

                // FALLBACK: Nếu vẫn không match được, thử match theo Tên + Ngày (bỏ qua product/market)
                // Để lấy đủ đơn hơn (tránh thiếu đơn do product/market không khớp)
                // LƯU Ý: Chỉ dùng fallback này khi không có record nào khác cùng Sale + Ngày đã match được
                // để tránh tính trùng
                if (matchingOrders.length === 0) {
                    // Kiểm tra xem có record nào khác cùng Sale + Ngày đã match được chưa
                    const otherRecordsSameSaleDate = transformedData.filter((otherItem, otherIdx) => {
                        if (otherIdx === index) return false; // Bỏ qua chính record này
                        const otherSaleName = normalizeStr(otherItem['Tên']);
                        const otherReportDate = normalizeDate(otherItem['Ngày']);
                        return otherSaleName === saleName && otherReportDate === reportDate;
                    });

                    // Kiểm tra xem các records khác đã match được bao nhiêu đơn
                    let totalMatchedByOthers = 0;
                    otherRecordsSameSaleDate.forEach(otherItem => {
                        const otherKey = `${saleName}|${reportDate}|${normalizeStr(otherItem['Sản phẩm'] || '')}|${normalizeStr(otherItem['Thị trường'] || '')}`;
                        const otherMatching = ordersBySaleDateProductMarket.get(otherKey) || [];
                        totalMatchedByOthers += otherMatching.length;
                    });

                    // Tìm tất cả orders của Sale này ngày này
                    const allSaleOrdersOnDate = (allOrders || []).filter(order => {
                        const orderSaleName = normalizeStr(order.sale_staff);
                        const orderDateStr = normalizeDate(order.order_date);
                        return orderSaleName === saleName && orderDateStr === reportDate;
                    });

                    // Chỉ dùng fallback nếu:
                    // 1. Có orders của Sale này ngày này
                    // 2. Tổng số orders > số đơn đã match bởi các records khác (còn đơn chưa match)
                    if (allSaleOrdersOnDate.length > totalMatchedByOthers) {
                        // Lấy các đơn chưa được match bởi records khác
                        const unmatchedOrders = allSaleOrdersOnDate.filter(order => {
                            // Kiểm tra xem order này đã được match bởi record khác chưa
                            const orderKey = `${saleName}|${reportDate}|${normalizeStr(order.product || '')}|${normalizeStr(order.country || '')}`;
                            const orderKeyWithoutPM = `${saleName}|${reportDate}||`;

                            // Kiểm tra trong các records khác
                            for (const otherItem of otherRecordsSameSaleDate) {
                                const otherKey = `${saleName}|${reportDate}|${normalizeStr(otherItem['Sản phẩm'] || '')}|${normalizeStr(otherItem['Thị trường'] || '')}`;
                                const otherMatching = ordersBySaleDateProductMarket.get(otherKey) || [];
                                if (otherMatching.some(o => o.order_code === order.order_code)) {
                                    return false; // Đã được match
                                }

                                // Kiểm tra key không có product/market
                                const otherMatchingWithoutPM = ordersBySaleDateProductMarket.get(orderKeyWithoutPM) || [];
                                const emptyPMOrders = otherMatchingWithoutPM.filter(o => {
                                    const oProduct = normalizeStr(o.product || '');
                                    const oMarket = normalizeStr(o.country || '');
                                    return (oProduct === '' || oMarket === '') &&
                                        (normalizeStr(otherItem['Sản phẩm'] || '') === '' || normalizeStr(otherItem['Thị trường'] || '') === '');
                                });
                                if (emptyPMOrders.some(o => o.order_code === order.order_code)) {
                                    return false; // Đã được match
                                }
                            }
                            return true; // Chưa được match
                        });

                        if (unmatchedOrders.length > 0) {
                            matchingOrders = unmatchedOrders;
                            console.log(`ℹ️ [enrichWithTotalOrdersFromOrders] Fallback match theo Tên + Ngày cho "${item['Tên']}" ngày ${reportDateRaw}: ${matchingOrders.length} đơn chưa match (tổng ${allSaleOrdersOnDate.length} đơn, ${totalMatchedByOthers} đã match bởi records khác)`);
                        }
                    }
                }

                // IMPORTANT: Filter ra các orders đã được đếm trước đó
                // Điều này đảm bảo mỗi order chỉ được đếm 1 lần duy nhất
                const uncountedMatchingOrders = matchingOrders.filter(order => {
                    return order.order_code && !countedOrderCodes.has(order.order_code);
                });

                // Mark các orders mới được đếm
                uncountedMatchingOrders.forEach(order => {
                    if (order.order_code) {
                        countedOrderCodes.add(order.order_code);
                    }
                });

                const soDonTT = uncountedMatchingOrders.length;
                item['Số đơn TT'] = soDonTT;

                if (soDonTT > 0) {
                    updatedCount++;
                } else {
                    zeroCount++;
                }

                // Debug: Log nếu không match được để kiểm tra
                if (matchingOrders.length === 0) {
                    // Kiểm tra xem có đơn của Sale này ngày này không (để debug, không dùng để tính)
                    const saleOrdersOnDate = (allOrders || []).filter(order => {
                        const orderSaleName = normalizeStr(order.sale_staff);
                        const orderDateStr = normalizeDate(order.order_date);
                        return orderSaleName === saleName && orderDateStr === reportDate;
                    });

                    if (saleOrdersOnDate.length > 0) {
                        // Chỉ log để debug, không dùng để tính (tránh tính trùng)
                        console.warn(`⚠️ [enrichWithTotalOrdersFromOrders] Không match key nhưng có ${saleOrdersOnDate.length} đơn của "${item['Tên']}" ngày ${reportDateRaw}`, {
                            key_bao_cao: key,
                            sale_name_normalized: saleName,
                            report_date_normalized: reportDate,
                            report_product: reportProduct,
                            report_market: reportMarket,
                            sample_order_keys: saleOrdersOnDate.slice(0, 3).map(o => {
                                const oProduct = normalizeStr(o.product || '');
                                const oMarket = normalizeStr(o.country || '');
                                return `${normalizeStr(o.sale_staff)}|${normalizeDate(o.order_date)}|${oProduct}|${oMarket}`;
                            })
                        });
                    }
                }

                // Log chi tiết cho Phạm Tuyết Trinh ngày 29
                const isPhamTuyetTrinh = saleName === 'phạm tuyết trinh' || saleName.includes('phạm tuyết trinh');
                const isDate29 = reportDate === '2026-01-29' || reportDateRaw === '2026-01-29' ||
                    reportDateRaw === '29/01/2026' || reportDateRaw === '29/1/2026' ||
                    (String(reportDateRaw).includes('29') && String(reportDateRaw).includes('01') && String(reportDateRaw).includes('2026'));
                if (isPhamTuyetTrinh && isDate29) {
                    console.log(`🔍 [DEBUG] Phạm Tuyết Trinh ngày 29/01/2026:`);
                    console.log(`  - Tên báo cáo: "${item['Tên']}" → normalize: "${saleName}"`);
                    console.log(`  - Ngày báo cáo: "${reportDateRaw}" → normalize: "${reportDate}"`);
                    console.log(`  - Sản phẩm báo cáo: "${item['Sản phẩm']}" → normalize: "${reportProduct}"`);
                    console.log(`  - Thị trường báo cáo: "${item['Thị trường']}" → normalize: "${reportMarket}"`);
                    console.log(`  - Key để match: "${key}"`);
                    console.log(`  - Số đơn TT tìm thấy: ${matchingOrders.length}`);

                    // Tìm các đơn của Phạm Tuyết Trinh ngày 29
                    const phamTuyetTrinhOrders29 = (allOrders || []).filter(order => {
                        const orderSaleName = normalizeStr(order.sale_staff);
                        const orderDateStr = normalizeDate(order.order_date);
                        return (orderSaleName === 'phạm tuyết trinh' || orderSaleName.includes('phạm tuyết trinh')) &&
                            orderDateStr === '2026-01-29';
                    });

                    if (phamTuyetTrinhOrders29.length > 0) {
                        console.log(`  - ✅ Tìm thấy ${phamTuyetTrinhOrders29.length} đơn của Phạm Tuyết Trinh ngày 29:`);
                        phamTuyetTrinhOrders29.forEach((order, idx) => {
                            const orderProduct = normalizeStr(order.product || '');
                            const orderMarket = normalizeStr(order.country || '');
                            const orderKey = `${normalizeStr(order.sale_staff)}|${normalizeDate(order.order_date)}|${orderProduct}|${orderMarket}`;
                            console.log(`    [${idx + 1}] Key: "${orderKey}"`);
                            console.log(`        Sản phẩm: "${order.product || '(empty)'}" (normalize: "${orderProduct}")`);
                            console.log(`        Thị trường: "${order.country || '(empty)'}" (normalize: "${orderMarket}")`);
                            console.log(`        Match với key báo cáo "${key}"? ${orderKey === key}`);
                            if (orderKey !== key) {
                                console.log(`        ❌ KHÔNG MATCH!`);
                                console.log(`           - Sale name match? ${normalizeStr(order.sale_staff) === saleName}`);
                                console.log(`           - Date match? ${normalizeDate(order.order_date) === reportDate}`);
                                console.log(`           - Product match? "${orderProduct}" === "${reportProduct}"? ${orderProduct === reportProduct}`);
                                console.log(`           - Market match? "${orderMarket}" === "${reportMarket}"? ${orderMarket === reportMarket}`);
                            }
                        });

                        // Kiểm tra match
                        const matchingKeys = phamTuyetTrinhOrders29.map(order => {
                            const orderSaleName = normalizeStr(order.sale_staff);
                            const orderDateStr = normalizeDate(order.order_date);
                            const orderProduct = normalizeStr(order.product || '');
                            const orderMarket = normalizeStr(order.country || '');
                            return `${orderSaleName}|${orderDateStr}|${orderProduct}|${orderMarket}`;
                        });
                        console.log(`  - Các key của đơn hàng:`, matchingKeys);
                        console.log(`  - Key báo cáo: "${key}"`);
                        console.log(`  - Match? ${matchingKeys.includes(key)}`);
                    } else {
                        console.log(`  - ⚠️ Không tìm thấy đơn nào của Phạm Tuyết Trinh ngày 29 trong orders`);
                    }
                }

                // Log chi tiết cho Phạm Tuyết Trinh ngày 27
                const isDate27 = reportDate === '2026-01-27' || reportDateRaw === '2026-01-27';
                if (isPhamTuyetTrinh && isDate27) {
                    console.log(`🔍 Debug Phạm Tuyết Trinh ngày 27:`);
                    console.log(`  - Tên báo cáo: "${item['Tên']}" → normalize: "${saleName}"`);
                    console.log(`  - Ngày báo cáo: "${reportDateRaw}" → normalize: "${reportDate}"`);
                    console.log(`  - Sản phẩm báo cáo: "${item['Sản phẩm']}" → normalize: "${reportProduct}"`);
                    console.log(`  - Thị trường báo cáo: "${item['Thị trường']}" → normalize: "${reportMarket}"`);
                    console.log(`  - Key để match: "${key}"`);
                    console.log(`  - Số đơn TT tìm thấy: ${matchingOrders.length}`);

                    // Tìm các đơn của Phạm Tuyết Trinh ngày 27
                    const phamTuyetTrinhOrders = (allOrders || []).filter(order => {
                        const orderSaleName = normalizeStr(order.sale_staff);
                        const orderDateStr = normalizeDate(order.order_date);
                        return (orderSaleName === 'phạm tuyết trinh' || orderSaleName.includes('phạm tuyết trinh')) &&
                            orderDateStr === '2026-01-27';
                    });

                    if (phamTuyetTrinhOrders.length > 0) {
                        console.log(`  - Tìm thấy ${phamTuyetTrinhOrders.length} đơn của Phạm Tuyết Trinh ngày 27:`);
                        phamTuyetTrinhOrders.forEach((order, idx) => {
                            const orderProduct = normalizeStr(order.product || '');
                            const orderMarket = normalizeStr(order.country || '');
                            console.log(`    [${idx + 1}] Sản phẩm: "${order.product}" (normalize: "${orderProduct}"), Thị trường: "${order.country || '(empty)'}" (normalize: "${orderMarket}")`);
                        });

                        // Kiểm tra match
                        const matchingKeys = phamTuyetTrinhOrders.map(order => {
                            const orderSaleName = normalizeStr(order.sale_staff);
                            const orderDateStr = normalizeDate(order.order_date);
                            const orderProduct = normalizeStr(order.product || '');
                            const orderMarket = normalizeStr(order.country || '');
                            return `${orderSaleName}|${orderDateStr}|${orderProduct}|${orderMarket}`;
                        });
                        console.log(`  - Các key của đơn hàng:`, matchingKeys);
                        console.log(`  - Key báo cáo: "${key}"`);
                        console.log(`  - Match? ${matchingKeys.includes(key)}`);
                    } else {
                        console.log(`  - ⚠️ Không tìm thấy đơn nào của Phạm Tuyết Trinh ngày 27 trong orders`);
                    }
                }
            });

            console.log(`✅ [enrichWithTotalOrdersFromOrders] Đã cập nhật "Số đơn TT" cho ${transformedData.length} records:`);
            console.log(`   - Records có Số đơn TT > 0: ${updatedCount}`);
            console.log(`   - Records có Số đơn TT = 0: ${zeroCount}`);
            console.log(`   - Tổng số UNIQUE orders đã đếm: ${countedOrderCodes.size}`);
            console.log(`   - Tổng số keys trong ordersBySaleDateProductMarket: ${ordersBySaleDateProductMarket.size}`);

            // Log sample records có Số đơn TT > 0
            if (updatedCount > 0) {
                const sampleRecords = transformedData.filter(r => r['Số đơn TT'] > 0).slice(0, 5);
                console.log(`📊 [enrichWithTotalOrdersFromOrders] Sample records có Số đơn TT > 0:`, sampleRecords.map(r => ({
                    ten: r['Tên'],
                    ngay: r['Ngày'],
                    sanPham: r['Sản phẩm'],
                    thiTruong: r['Thị trường'],
                    soDonTT: r['Số đơn TT']
                })));
            }
        } catch (err) {
            console.error('❌ Error enriching with total orders:', err);
        }
    };

    // Hàm tính tổng doanh số (total_amount_vnd) từ bảng orders với cùng rule như Số đơn TT
    const enrichWithTotalRevenueFromOrders = async (transformedData, startDate, endDate) => {
        try {
            // Helper function để normalize date format - Database lưu ở định dạng YYYY-MM-DD
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
                    if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        return trimmed;
                    }
                    if (trimmed.includes('/')) {
                        const parts = trimmed.split('/');
                        if (parts.length === 3) {
                            const p1 = parseInt(parts[0]);
                            const p2 = parseInt(parts[1]);
                            const p3 = parseInt(parts[2]);
                            if (p2 > 12 && p1 <= 12) {
                                return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
                            } else if (p1 > 12 && p2 <= 12) {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            } else {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            }
                        }
                    }
                    const parsed = new Date(trimmed);
                    if (!isNaN(parsed.getTime())) {
                        return parsed.toISOString().split('T')[0];
                    }
                    return trimmed;
                }
                return String(date);
            };

            // Helper function để normalize string (trim và lowercase)
            const normalizeStr = (str) => {
                if (!str) return '';
                return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
            };

            const normalizedStartDate = normalizeDate(startDate);
            const normalizedEndDate = normalizeDate(endDate);

            // Lấy danh sách tên Sale từ báo cáo để filter ở query level
            const saleNamesFromReports = [...new Set(transformedData
                .map(item => item['Tên'])
                .filter(name => name && name.trim().length > 0)
            )];

            // Build query - KHÔNG filter theo check_result (lấy tất cả các đơn)
            let query = supabase
                .from('orders')
                .select('order_date, sale_staff, product, country, total_amount_vnd', { count: 'exact' })
                .gte('order_date', normalizedStartDate)
                .lte('order_date', normalizedEndDate);

            // Filter theo tên Sale từ báo cáo
            if (saleNamesFromReports.length > 0) {
                const saleConditions = saleNamesFromReports
                    .map(name => `sale_staff.ilike.%${name.trim()}%`)
                    .join(',');
                query = query.or(saleConditions);
            }

            query = query.limit(10000);

            const { data: allOrders, error, count } = await query;

            if (error) {
                console.error('❌ Error fetching total revenue:', error);
                return;
            }

            console.log(`📊 Tìm thấy ${allOrders?.length || 0} đơn để tính doanh số trong khoảng ${normalizedStartDate} - ${normalizedEndDate}`);

            if (count && count > 10000) {
                console.warn(`⚠️ Cảnh báo: Có ${count} đơn nhưng chỉ fetch được ${allOrders?.length || 0} records (giới hạn 10,000).`);
            }

            // Group đơn theo Tên Sale + Ngày + Sản phẩm + Thị trường (giống như Số đơn TT)
            const ordersBySaleDateProductMarket = new Map();

            (allOrders || []).forEach(order => {
                const orderSaleName = normalizeStr(order.sale_staff);
                const orderDateStr = normalizeDate(order.order_date);
                const orderProduct = normalizeStr(order.product || '');
                const orderMarket = normalizeStr(order.country || '');
                const key = `${orderSaleName}|${orderDateStr}|${orderProduct}|${orderMarket}`;

                if (!ordersBySaleDateProductMarket.has(key)) {
                    ordersBySaleDateProductMarket.set(key, []);
                }
                ordersBySaleDateProductMarket.get(key).push(order);
            });

            // Cập nhật transformedData với tổng doanh số từ orders (theo cùng rule như Số đơn TT)
            transformedData.forEach((item) => {
                const saleName = normalizeStr(item['Tên']);
                const reportDateRaw = item['Ngày'];
                const reportDate = normalizeDate(reportDateRaw);
                const reportProduct = normalizeStr(item['Sản phẩm'] || '');
                const reportMarket = normalizeStr(item['Thị trường'] || '');

                if (!saleName || !reportDate) {
                    item['Doanh số'] = 0;
                    return;
                }

                const key = `${saleName}|${reportDate}|${reportProduct}|${reportMarket}`;
                let matchingOrders = ordersBySaleDateProductMarket.get(key) || [];

                // Nếu không match được với key đầy đủ, thử match với key không có product/market
                // (cho trường hợp đơn hàng có product/market empty) - cùng rule như Số đơn TT
                if (matchingOrders.length === 0) {
                    const keyWithoutProductMarket = `${saleName}|${reportDate}||`;
                    const ordersWithoutProductMarket = ordersBySaleDateProductMarket.get(keyWithoutProductMarket) || [];

                    // Chỉ lấy các đơn hàng có product hoặc market empty
                    const emptyProductMarketOrders = ordersWithoutProductMarket.filter(order => {
                        const orderProduct = normalizeStr(order.product || '');
                        const orderMarket = normalizeStr(order.country || '');
                        return orderProduct === '' || orderMarket === '';
                    });

                    if (emptyProductMarketOrders.length > 0) {
                        matchingOrders = emptyProductMarketOrders;
                        console.log(`ℹ️ [enrichWithTotalRevenueFromOrders] Match với key không có product/market cho "${item['Tên']}" ngày ${reportDateRaw}: ${matchingOrders.length} đơn`);
                    }
                }

                // FALLBACK: Nếu vẫn không match được, thử match theo Tên + Ngày (bỏ qua product/market)
                // Để lấy đủ doanh số hơn (tránh thiếu doanh số do product/market không khớp)
                // LƯU Ý: Chỉ dùng fallback này khi không có record nào khác cùng Sale + Ngày đã match được
                // để tránh tính trùng
                if (matchingOrders.length === 0) {
                    // Kiểm tra xem có record nào khác cùng Sale + Ngày đã match được chưa
                    const otherRecordsSameSaleDate = transformedData.filter((otherItem, otherIdx) => {
                        if (otherIdx === index) return false; // Bỏ qua chính record này
                        const otherSaleName = normalizeStr(otherItem['Tên']);
                        const otherReportDate = normalizeDate(otherItem['Ngày']);
                        return otherSaleName === saleName && otherReportDate === reportDate;
                    });

                    // Kiểm tra xem các records khác đã match được bao nhiêu đơn
                    let totalMatchedByOthers = 0;
                    otherRecordsSameSaleDate.forEach(otherItem => {
                        const otherKey = `${saleName}|${reportDate}|${normalizeStr(otherItem['Sản phẩm'] || '')}|${normalizeStr(otherItem['Thị trường'] || '')}`;
                        const otherMatching = ordersBySaleDateProductMarket.get(otherKey) || [];
                        totalMatchedByOthers += otherMatching.length;
                    });

                    // Tìm tất cả orders của Sale này ngày này
                    const allSaleOrdersOnDate = (allOrders || []).filter(order => {
                        const orderSaleName = normalizeStr(order.sale_staff);
                        const orderDateStr = normalizeDate(order.order_date);
                        return orderSaleName === saleName && orderDateStr === reportDate;
                    });

                    // Chỉ dùng fallback nếu:
                    // 1. Có orders của Sale này ngày này
                    // 2. Tổng số orders > số đơn đã match bởi các records khác (còn đơn chưa match)
                    if (allSaleOrdersOnDate.length > totalMatchedByOthers) {
                        // Lấy các đơn chưa được match bởi records khác
                        const unmatchedOrders = allSaleOrdersOnDate.filter(order => {
                            // Kiểm tra xem order này đã được match bởi record khác chưa
                            const orderKey = `${saleName}|${reportDate}|${normalizeStr(order.product || '')}|${normalizeStr(order.country || '')}`;
                            const orderKeyWithoutPM = `${saleName}|${reportDate}||`;

                            // Kiểm tra trong các records khác
                            for (const otherItem of otherRecordsSameSaleDate) {
                                const otherKey = `${saleName}|${reportDate}|${normalizeStr(otherItem['Sản phẩm'] || '')}|${normalizeStr(otherItem['Thị trường'] || '')}`;
                                const otherMatching = ordersBySaleDateProductMarket.get(otherKey) || [];
                                if (otherMatching.some(o => o.order_code === order.order_code)) {
                                    return false; // Đã được match
                                }

                                // Kiểm tra key không có product/market
                                const otherMatchingWithoutPM = ordersBySaleDateProductMarket.get(orderKeyWithoutPM) || [];
                                const emptyPMOrders = otherMatchingWithoutPM.filter(o => {
                                    const oProduct = normalizeStr(o.product || '');
                                    const oMarket = normalizeStr(o.country || '');
                                    return (oProduct === '' || oMarket === '') &&
                                        (normalizeStr(otherItem['Sản phẩm'] || '') === '' || normalizeStr(otherItem['Thị trường'] || '') === '');
                                });
                                if (emptyPMOrders.some(o => o.order_code === order.order_code)) {
                                    return false; // Đã được match
                                }
                            }
                            return true; // Chưa được match
                        });

                        if (unmatchedOrders.length > 0) {
                            matchingOrders = unmatchedOrders;
                            console.log(`ℹ️ [enrichWithTotalRevenueFromOrders] Fallback match theo Tên + Ngày cho "${item['Tên']}" ngày ${reportDateRaw}: ${matchingOrders.length} đơn chưa match (tổng ${allSaleOrdersOnDate.length} đơn, ${totalMatchedByOthers} đã match bởi records khác)`);
                        }
                    }
                }

                // Tính tổng doanh số từ các đơn match được
                const revenue = matchingOrders.reduce((sum, order) => {
                    return sum + (Number(order.total_amount_vnd) || 0);
                }, 0);

                item['Doanh số'] = revenue;
            });

            console.log(`✅ Đã cập nhật doanh số cho ${transformedData.length} records`);
        } catch (err) {
            console.error('❌ Error enriching with total revenue:', err);
        }
    };

    // Hàm enrich Team từ bảng users (override Team trong báo cáo)
    const enrichTeamFromUsers = async (transformedData) => {
        try {
            // Lấy danh sách email từ báo cáo
            const emails = [...new Set(transformedData
                .map(item => item['Email'])
                .filter(e => e && e.trim().length > 0)
            )];

            if (emails.length === 0) return;

            // Fetch users từ supabase
            const { data: users, error } = await supabase
                .from('users')
                .select('email, team');

            if (error) {
                console.error('❌ Error fetching users for team enrichment:', error);
                return;
            }

            const teamMap = new Map();
            users.forEach(u => {
                if (u.email && u.team) {
                    teamMap.set(u.email.trim().toLowerCase(), u.team);
                }
            });

            let updatedCount = 0;
            transformedData.forEach(item => {
                const email = (item['Email'] || '').trim().toLowerCase();
                if (teamMap.has(email)) {
                    const foundTeam = teamMap.get(email);
                    if (item['Team'] !== foundTeam) {
                        item['Team'] = foundTeam;
                        updatedCount++;
                    }
                }
            });
            console.log(`✅ [enrichTeamFromUsers] Đã cập nhật Team cho ${updatedCount} records từ bảng users`);

        } catch (err) {
            console.error('❌ Error in enrichTeamFromUsers:', err);
        }
    };

    // Hàm enrich "Số Mess" và "Phản hồi" từ sales_reports cho tất cả nhân sự (độc lập)
    const enrichMessAndResponseFromSalesReports = async (transformedData, startDate, endDate) => {
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
                    if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        return trimmed;
                    }
                    if (trimmed.includes('/')) {
                        const parts = trimmed.split('/');
                        if (parts.length === 3) {
                            const p1 = parseInt(parts[0]);
                            const p2 = parseInt(parts[1]);
                            const p3 = parseInt(parts[2]);
                            if (p2 > 12 && p1 <= 12) {
                                return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
                            } else if (p1 > 12 && p2 <= 12) {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            } else {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            }
                        }
                    }
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

            // Lấy danh sách tên nhân sự từ transformedData
            const personnelNames = [...new Set(transformedData
                .map(item => item['Tên'])
                .filter(name => name && name.trim().length > 0)
            )];

            if (personnelNames.length === 0) {
                console.log('📊 [enrichMessAndResponseFromSalesReports] Không có tên nhân sự để fetch');
                return;
            }

            // Fetch từ sales_reports với filter theo tên và khoảng ngày
            let query = supabase
                .from('sales_reports')
                .select('name, mess_count, response_count, date')
                .gte('date', normalizedStartDate)
                .lte('date', normalizedEndDate);

            // Filter theo tên nhân sự (nếu có ít hơn 50 tên để tránh vượt quá giới hạn OR)
            if (personnelNames.length <= 50) {
                const nameConditions = personnelNames
                    .map(name => `name.ilike.%${name.trim()}%`)
                    .join(',');
                query = query.or(nameConditions);
            }

            query = query.limit(10000);

            const { data: salesReportsData, error: salesReportsError } = await query;

            if (salesReportsError) {
                console.error('❌ Error fetching mess_count and response_count:', salesReportsError);
                return;
            }

            console.log(`📊 [enrichMessAndResponseFromSalesReports] Fetch được ${salesReportsData?.length || 0} records từ sales_reports`);

            // Group theo Tên + Ngày để match chính xác với từng record trong transformedData
            // Key: "name|date" -> { mess_count, response_count }
            const messAndResponseByPersonnelDate = new Map();

            (salesReportsData || []).forEach(report => {
                const reportName = normalizeStr(report.name);
                const reportDate = normalizeDate(report.date);

                if (!reportName || !reportDate) return;

                // Tìm nhân sự trong personnelNames khớp với report
                const matchedPersonnel = personnelNames.find(name => {
                    const nameStr = normalizeStr(name);
                    return reportName === nameStr || reportName.includes(nameStr) || nameStr.includes(reportName);
                });

                if (matchedPersonnel) {
                    const key = `${normalizeStr(matchedPersonnel)}|${reportDate}`;

                    // Tính tổng Số Mess và Phản hồi cho từng cặp (nhân sự, ngày)
                    const current = messAndResponseByPersonnelDate.get(key) || { mess: 0, phanHoi: 0 };
                    current.mess += (Number(report.mess_count) || 0);
                    current.phanHoi += (Number(report.response_count) || 0);
                    messAndResponseByPersonnelDate.set(key, current);
                }
            });

            console.log(`📊 [enrichMessAndResponseFromSalesReports] Số keys (nhân sự + ngày): ${messAndResponseByPersonnelDate.size}`);

            // Cập nhật transformedData với "Số Mess" và "Phản hồi" từ sales_reports (match theo Tên + Ngày)
            let updatedCount = 0;
            transformedData.forEach(item => {
                const itemName = normalizeStr(item['Tên']);
                const itemDate = normalizeDate(item['Ngày']);

                if (!itemName || !itemDate) return;

                const key = `${itemName}|${itemDate}`;
                const data = messAndResponseByPersonnelDate.get(key);

                if (data) {
                    // Cập nhật "Số Mess" và "Phản hồi" từ sales_reports (ghi đè giá trị cũ)
                    item['Số Mess'] = data.mess;
                    item['Phản hồi'] = data.phanHoi;
                    updatedCount++;
                } else {
                    // Nếu không tìm thấy, giữ nguyên giá trị cũ hoặc set = 0
                    // Không cần làm gì vì giá trị đã có sẵn từ transformedData
                }
            });

            console.log(`✅ [enrichMessAndResponseFromSalesReports] Đã cập nhật "Số Mess" và "Phản hồi" cho ${transformedData.length} records`);
        } catch (err) {
            console.error('❌ Error enriching with mess_count and response_count:', err);
        }
    };

    // Hàm tính doanh số sau hủy (tổng VNĐ của các đơn không phải Hủy)
    // Match theo: Tên Sale, Ngày, Sản phẩm, Thị trường
    const enrichWithRevenueAfterCancelFromOrders = async (transformedData, startDate, endDate) => {
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
                    if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        return trimmed;
                    }
                    if (trimmed.includes('/')) {
                        const parts = trimmed.split('/');
                        if (parts.length === 3) {
                            const p1 = parseInt(parts[0]);
                            const p2 = parseInt(parts[1]);
                            const p3 = parseInt(parts[2]);
                            if (p2 > 12 && p1 <= 12) {
                                return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
                            } else if (p1 > 12 && p2 <= 12) {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            }
                        }
                    }
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

            // Lấy danh sách tên Sale từ báo cáo
            const saleNamesFromReports = [...new Set(transformedData
                .map(item => item['Tên'])
                .filter(name => name && name.trim().length > 0)
            )];

            // Build query - Lấy các đơn KHÔNG phải Hủy
            let query = supabase
                .from('orders')
                .select('order_date, sale_staff, product, country, total_amount_vnd, check_result', { count: 'exact' })
                .gte('order_date', normalizedStartDate)
                .lte('order_date', normalizedEndDate)
                .not('check_result', 'eq', 'Hủy')
                .not('check_result', 'eq', 'Huỷ');

            // Filter theo tên Sale từ báo cáo
            if (saleNamesFromReports.length > 0) {
                const saleConditions = saleNamesFromReports
                    .map(name => `sale_staff.ilike.%${name.trim()}%`)
                    .join(',');
                query = query.or(saleConditions);
            }

            query = query.limit(10000);

            const { data: nonCancelOrders, error, count } = await query;

            if (error) {
                console.error('❌ Error fetching revenue after cancel:', error);
                return;
            }

            console.log(`📊 Tìm thấy ${nonCancelOrders?.length || 0} đơn không hủy để tính doanh số sau hủy trong khoảng ${normalizedStartDate} - ${normalizedEndDate}`);

            // Validate và filter orders (đảm bảo không phải Hủy)
            const validNonCancelOrders = (nonCancelOrders || []).filter(order => {
                const checkResult = String(order.check_result || '').trim();
                return checkResult !== 'Hủy' && checkResult !== 'Huỷ';
            });

            console.log(`✅ Có ${validNonCancelOrders.length} đơn không hủy hợp lệ`);

            // Group và match với từng record trong transformedData
            transformedData.forEach((item) => {
                const reportSaleName = normalizeStr(item['Tên']);
                const reportDate = normalizeDate(item['Ngày']);
                const reportProduct = normalizeStr(item['Sản phẩm'] || '');
                const reportMarket = normalizeStr(item['Thị trường'] || '');

                // Tìm các đơn match với báo cáo này
                const matchingOrders = validNonCancelOrders.filter(order => {
                    const orderSaleName = normalizeStr(order.sale_staff);
                    const orderDateStr = normalizeDate(order.order_date);
                    const orderProduct = normalizeStr(order.product || '');
                    const orderMarket = normalizeStr(order.country || '');

                    // Match: Tên Sale + Ngày + Sản phẩm + Thị trường
                    return orderSaleName === reportSaleName &&
                        orderDateStr === reportDate &&
                        orderProduct === reportProduct &&
                        orderMarket === reportMarket;
                });

                // Tính tổng doanh số sau hủy
                const revenueAfterCancel = matchingOrders.reduce((sum, order) => {
                    return sum + (Number(order.total_amount_vnd) || 0);
                }, 0);

                // Cập nhật vào transformedData
                item['Doanh số sau hủy'] = revenueAfterCancel;
            });

            console.log(`✅ Đã cập nhật doanh số sau hủy cho ${transformedData.length} records`);
        } catch (err) {
            console.error('❌ Error enriching with revenue after cancel:', err);
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
                let productsSet = new Set();
                let marketsSet = new Set();
                let teamsSet = new Set();
                let shiftsSet = new Set();
                let productsFromSystemSettings = 0;

                // Bước 1: Load sản phẩm từ system_settings (type <> 'test')
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
                        productsFromSystemSettings = productsData.length;
                        console.log(`✅ Loaded ${productsData.length} products from system_settings (excluding test)`);
                    }
                } catch (supabaseError) {
                    console.log('⚠️ Could not fetch products from system_settings:', supabaseError);
                }

                // Bước 2: Load từ sales_reports với pagination để lấy hết
                let allData = [];
                let page = 0;
                const pageSize = 1000;
                let hasMore = true;
                let totalCount = null;

                while (hasMore) {
                    const from = page * pageSize;
                    const to = from + pageSize - 1;

                    const { data, error, count } = await supabase
                        .from('sales_reports')
                        .select('product, market, team, shift', { count: 'exact' })
                        .range(from, to);

                    if (error) throw error;

                    if (count !== null && totalCount === null) {
                        totalCount = count;
                        console.log(`📊 Tổng số records trong sales_reports: ${totalCount}`);
                    }

                    if (data && data.length > 0) {
                        allData = allData.concat(data);
                        hasMore = data.length === pageSize && (totalCount === null || allData.length < totalCount);
                        page++;
                        console.log(`📄 Loaded page ${page}: ${data.length} records (total: ${allData.length}/${totalCount || 'unknown'})`);
                    } else {
                        hasMore = false;
                    }
                }

                console.log(`✅ Đã load ${allData.length} records từ sales_reports`);

                // Extract unique values
                const unique = (key) => [...new Set(allData.map(d => d[key]).filter(Boolean))].sort();

                const globalProducts = unique('product');
                const globalMarkets = unique('market');
                const globalTeams = unique('team');
                const globalShifts = unique('shift');

                // Merge sản phẩm từ sales_reports vào set
                globalProducts.forEach(p => productsSet.add(p));

                const newOptions = {
                    products: Array.from(productsSet).sort(),
                    markets: globalMarkets,
                    teams: globalTeams,
                    shifts: globalShifts
                };

                console.log(`📦 Total products: ${productsSet.size} (${productsFromSystemSettings} from system_settings + ${globalProducts.length} from sales_reports)`);
                console.log(`📦 Total markets: ${globalMarkets.length}, teams: ${globalTeams.length}, shifts: ${globalShifts.length}`);

                setOptions(newOptions);

                // Initialize filters with all options selected by default
                setFilters(prev => ({
                    ...prev,
                    products: newOptions.products,
                    markets: newOptions.markets,
                    teams: newOptions.teams,
                    shifts: newOptions.shifts
                }));

            } catch (err) {
                console.warn('Could not fetch global options:', err);
            }
        };
        fetchGlobalOptions();
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

    // Load selected personnel names for current user
    useEffect(() => {
        const loadSelectedPersonnel = async () => {
            try {
                if (!userEmail || isAdmin) {
                    // Admin không cần filter, hoặc không có email thì không filter
                    setSelectedPersonnelNames([]); // Empty array = không filter
                    return;
                }

                const userEmailLower = userEmail.toLowerCase().trim();
                const personnelMap = await rbacService.getSelectedPersonnel([userEmailLower]);
                const personnelNames = personnelMap[userEmailLower] || [];

                const validNames = personnelNames.filter(name => {
                    const nameStr = String(name).trim();
                    return nameStr.length > 0 && !nameStr.includes('@');
                });

                console.log('📝 [BaoCaoSale] Valid personnel names:', validNames);
                setSelectedPersonnelNames(validNames.length > 0 ? validNames : []); // Empty array nếu không có
            } catch (error) {
                console.error('❌ [BaoCaoSale] Error loading selected personnel:', error);
                setSelectedPersonnelNames([]); // Empty array nếu có lỗi
            }
        };

        loadSelectedPersonnel();
    }, [userEmail, isAdmin]);

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
                                'Số đơn hoàn hủy thực tế': 2, 'Doanh số hoàn hủy thực tế': 3000000
                            },
                            {
                                'Chức vụ': 'Sale Member', 'Tên': 'Sale Member 1', 'Email': 'member1@test.com', 'Team': 'Team Test 1', 'Chi nhánh': 'Hà Nội',
                                'Ngày': filters.endDate, 'Ca': 'Chiều', 'Sản phẩm': 'Sản phẩm A', 'Thị trường': 'VN',
                                'Số Mess': 30, 'Đơn Mess': 5, 'Doanh số Mess': 5000000, 'Phản hồi': 25,
                                'Doanh số đi': 5000000, 'Số đơn Hoàn huỷ': 0, 'Doanh số hoàn huỷ': 0,
                                'Số đơn thành công': 5, 'Doanh số thành công': 5000000,
                                'Số đơn thực tế': 5, 'Doanh thu chốt thực tế': 5000000,
                                'Số đơn hoàn hủy thực tế': 0, 'Doanh số hoàn hủy thực tế': 0
                            },
                            {
                                'Chức vụ': 'Sale Member', 'Tên': 'Sale Member 2', 'Email': 'member2@test.com', 'Team': 'Team Test 2', 'Chi nhánh': 'Hồ Chí Minh',
                                'Ngày': filters.endDate, 'Ca': 'Tối', 'Sản phẩm': 'Sản phẩm B', 'Thị trường': 'VN',
                                'Số Mess': 40, 'Đơn Mess': 8, 'Doanh số Mess': 12000000, 'Phản hồi': 35,
                                'Doanh số đi': 12000000, 'Số đơn Hoàn huỷ': 1, 'Doanh số hoàn huỷ': 1500000,
                                'Số đơn thành công': 7, 'Doanh số thành công': 10500000,
                                'Số đơn thực tế': 8, 'Doanh thu chốt thực tế': 12000000,
                                'Số đơn hoàn hủy thực tế': 1, 'Doanh số hoàn hủy thực tế': 1500000
                            }
                        ];

                        // Fake employee data for permissions check
                        const mockEmployeeData = [
                            { 'id': 'TEST-USER-ID', 'Họ Và Tên': 'Admin Test', 'Chức vụ': 'Admin', 'Email': 'admin@test.com', 'Team': 'All', 'Chi nhánh': 'All' }
                        ];

                        await processFetchedData(mockData, mockEmployeeData);
                        setLoading(false);
                        return; // EXIT EARLY
                    }
                }
            } catch (e) {
                console.warn("Error checking test mode:", e);
            }
            // --------------------------

            try {
                // Validate dates trước khi fetch
                if (!filters.startDate || !filters.endDate) {
                    console.warn('⚠️ [BaoCaoSale] startDate hoặc endDate chưa được set, bỏ qua fetch');
                    setLoading(false);
                    return;
                }

                // Call Supabase RPC
                console.log(`📅 Fetching data from RPC: startDate=${filters.startDate}, endDate=${filters.endDate}`);

                // Đảm bảo startDate và endDate ở định dạng YYYY-MM-DD
                const normalizedStartDate = filters.startDate ? filters.startDate.split('T')[0] : filters.startDate;
                const normalizedEndDate = filters.endDate ? filters.endDate.split('T')[0] : filters.endDate;

                // Validate date format
                if (!normalizedStartDate || !normalizedEndDate) {
                    console.error('❌ [BaoCaoSale] Invalid date format:', { normalizedStartDate, normalizedEndDate });
                    setLoading(false);
                    return;
                }

                console.log(`📅 Normalized dates: startDate=${normalizedStartDate}, endDate=${normalizedEndDate}`);

                // Fetch tất cả dữ liệu từ RPC function (không có giới hạn)
                // Supabase RPC function không có limit mặc định, nhưng để đảm bảo fetch đủ, 
                // chúng ta sẽ fetch trực tiếp từ bảng nếu RPC có vấn đề
                let data, error;

                // Thử fetch từ RPC function trước, nếu không được thì fallback sang direct query
                try {
                    const result = await supabase.rpc('get_sales_analytics', {
                        p_start_date: normalizedStartDate,
                        p_end_date: normalizedEndDate
                    });
                    data = result.data;
                    error = result.error;

                    // Kiểm tra xem RPC có trả về đủ dữ liệu không
                    if (data && data.length > 0) {
                        const dates = [...new Set(data.map(item => {
                            const dateVal = item['Ngày'];
                            if (dateVal instanceof Date) {
                                // Sử dụng LOCAL date format yyyy-mm-dd
                                const year = dateVal.getFullYear();
                                const month = String(dateVal.getMonth() + 1).padStart(2, '0');
                                const day = String(dateVal.getDate()).padStart(2, '0');
                                return `${year}-${month}-${day}`;
                            }
                            return String(dateVal).split('T')[0];
                        }))].sort();

                        console.log(`📅 [BaoCaoSale] RPC returned dates: ${dates.join(', ')} (requested: ${normalizedStartDate} to ${normalizedEndDate})`);

                        // Kiểm tra xem có thiếu ngày nào trong range không
                        const missingDates = [];
                        const start = new Date(normalizedStartDate);
                        const end = new Date(normalizedEndDate);

                        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                            // Sử dụng LOCAL date format yyyy-mm-dd
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            const dateStr = `${year}-${month}-${day}`;

                            if (!dates.includes(dateStr)) {
                                missingDates.push(dateStr);
                            }
                        }

                        if (missingDates.length > 0) {
                            const today = new Date();
                            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                            // Nếu thiếu ngày hôm nay hoặc tương lai, chỉ warn nhẹ (chấp nhận được vì có thể chưa nhập báo cáo)
                            const isMissingOnlyTodayOrFuture = missingDates.every(d => d >= todayStr);

                            if (isMissingOnlyTodayOrFuture) {
                                console.log(`ℹ️ RPC function thiếu dữ liệu các ngày (hôm nay/tương lai): ${missingDates.join(', ')}. Chấp nhận kết quả.`);
                            } else {
                                console.warn(`⚠️ RPC function thiếu các ngày quá khứ: ${missingDates.join(', ')}. Sử dụng fallback direct query.`);
                                throw new Error(`RPC returned incomplete data: missing dates ${missingDates.join(', ')}`);
                            }
                        }
                    }
                } catch (rpcError) {
                    console.error('❌ [BaoCaoSale] RPC function error:', rpcError);
                    console.error('❌ [BaoCaoSale] Error details:', {
                        message: rpcError.message,
                        stack: rpcError.stack,
                        startDate: normalizedStartDate,
                        endDate: normalizedEndDate
                    });
                    console.warn('⚠️ RPC function error, trying direct query:', rpcError);
                    // Fallback: Fetch trực tiếp từ bảng nếu RPC có vấn đề
                    // Supabase client có giới hạn mặc định 1000 records, cần fetch tất cả bằng cách pagination
                    let allData = [];
                    let page = 0;
                    const pageSize = 1000;
                    let hasMore = true;

                    while (hasMore) {
                        const from = page * pageSize;
                        const to = from + pageSize - 1;

                        const directQuery = await supabase
                            .from('sales_reports')
                            .select('*', { count: 'exact' })
                            .gte('date', normalizedStartDate)
                            .lte('date', normalizedEndDate)
                            .order('date', { ascending: false })
                            .range(from, to);

                        console.log(`📊 [BaoCaoSale] Direct query page ${page}: date range ${normalizedStartDate} to ${normalizedEndDate}, fetched ${directQuery.data?.length || 0} records`);

                        if (directQuery.error) {
                            error = directQuery.error;
                            hasMore = false;
                        } else {
                            allData = allData.concat(directQuery.data || []);
                            hasMore = (directQuery.data?.length || 0) === pageSize;
                            page++;

                            if (directQuery.count && allData.length >= directQuery.count) {
                                hasMore = false;
                            }
                        }
                    }

                    console.log(`📊 Fallback: Fetched ${allData.length} records directly from sales_reports table (${page} pages)`);

                    // Kiểm tra xem có đủ ngày trong range không
                    if (allData.length > 0) {
                        const fetchedDates = [...new Set(allData.map(item => {
                            const dateVal = item.date;
                            if (dateVal instanceof Date) {
                                // Sử dụng LOCAL date format yyyy-mm-dd
                                const year = dateVal.getFullYear();
                                const month = String(dateVal.getMonth() + 1).padStart(2, '0');
                                const day = String(dateVal.getDate()).padStart(2, '0');
                                return `${year}-${month}-${day}`;
                            }
                            return String(dateVal).split('T')[0];
                        }))].sort();

                        console.log(`📅 [BaoCaoSale] Direct query returned dates: ${fetchedDates.join(', ')} (requested: ${normalizedStartDate} to ${normalizedEndDate})`);

                        // Kiểm tra xem có thiếu ngày nào trong range không
                        const missingDates = [];
                        const start = new Date(normalizedStartDate);
                        const end = new Date(normalizedEndDate);
                        const today = new Date();
                        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                            // Sử dụng LOCAL date format yyyy-mm-dd
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            const dateStr = `${year}-${month}-${day}`;

                            if (!fetchedDates.includes(dateStr)) {
                                missingDates.push(dateStr);
                            }
                        }

                        if (missingDates.length > 0) {
                            const isMissingOnlyTodayOrFuture = missingDates.every(d => d >= todayStr);
                            if (isMissingOnlyTodayOrFuture) {
                                console.log(`ℹ️ [BaoCaoSale] Query thiếu dữ liệu các ngày (hôm nay/tương lai): ${missingDates.join(', ')}. Chấp nhận kết quả.`);
                            } else {
                                console.warn(`⚠️ [BaoCaoSale] Direct query thiếu các ngày quá khứ: ${missingDates.join(', ')} (có thể không có dữ liệu cho các ngày này)`);
                            }
                        }
                    }

                    if (allData.length > 0) {
                        // Transform dữ liệu từ sales_reports sang format giống RPC function
                        data = allData.map(sr => ({
                            "Tên": sr.name,
                            "Email": sr.email,
                            "Team": sr.team || 'Unknown',
                            "Chi nhánh": sr.branch || 'Unknown',
                            "Ngày": sr.date,
                            "Ca": sr.shift || '',
                            "Sản phẩm": sr.product || '',
                            "Thị trường": sr.market || '',
                            "Chức vụ": sr.position || 'Sale Member',
                            "Số Mess": sr.mess_count || 0,
                            "Phản hồi": sr.response_count || 0,
                            "Đơn Mess": sr.order_count || 0,
                            "Doanh số Mess": sr.revenue_mess || 0,
                            "Số đơn thực tế": sr.order_count_actual || 0,
                            "Doanh thu chốt thực tế": sr.revenue_actual || 0,
                            "Số đơn Hoàn huỷ": sr.order_cancel_count || 0,
                            "Doanh số hoàn huỷ": sr.revenue_cancel || 0,
                            "Số đơn thành công": sr.order_success_count || 0,
                            "Doanh số thành công": sr.revenue_success || 0,
                            "Doanh số đi": sr.revenue_go || 0,
                            "Doanh số đi thực tế": sr.revenue_go_actual || 0,
                            "Số đơn hoàn hủy thực tế": sr.order_cancel_count_actual || 0,
                            "Doanh số hoàn hủy thực tế": sr.revenue_cancel_actual || 0
                        }));
                    } else {
                        data = null;
                    }
                }

                if (data && data.length > 0) {
                    const dates = [...new Set(data.map(item => {
                        const dateVal = item['Ngày'];
                        if (dateVal instanceof Date) {
                            return dateVal.toISOString().split('T')[0];
                        }
                        return String(dateVal).split('T')[0];
                    }))].sort();
                    console.log(`📊 Fetched ${data.length} records from RPC, date range: ${dates[0]} to ${dates[dates.length - 1]} (${dates.length} unique dates)`);
                    console.log(`📅 All dates in fetched data:`, dates);

                    // Kiểm tra xem có thiếu ngày nào không
                    if (dates.length > 0) {
                        const firstDate = new Date(dates[0]);
                        const lastDate = new Date(dates[dates.length - 1]);
                        const startDate = new Date(normalizedStartDate);
                        const endDate = new Date(normalizedEndDate);

                        if (firstDate > startDate) {
                            console.warn(`⚠️ First date in data (${dates[0]}) is after start date (${normalizedStartDate})`);
                            console.warn(`   → Database may not have data from ${normalizedStartDate} to ${dates[0]}`);
                        }
                        if (lastDate < endDate) {
                            console.warn(`⚠️ Last date in data (${dates[dates.length - 1]}) is before end date (${normalizedEndDate})`);
                            console.warn(`   → Database may not have data from ${dates[dates.length - 1]} to ${normalizedEndDate}`);
                        }
                    }
                } else {
                    console.warn(`⚠️ No data returned from RPC for date range ${normalizedStartDate} to ${normalizedEndDate}`);
                    console.warn(`   → Check if there is any data in sales_reports table for this date range`);
                }

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
                    'Doanh số hoàn hủy thực tế': item["Doanh số hoàn hủy thực tế"]
                    // Note: "Doanh số sau hoàn hủy thực tế" sẽ được tính toán từ orders table
                }));

                // Enrich Team from users BEFORE creating employee list to ensure permissions are correct
                await enrichTeamFromUsers(transformedData);

                // Fetch employee list for permissions - reusing same fetch logic or simple supabase fetch
                // Efficiently get employee list (distinct users)
                // For now, let's just list unique users from the report or fetching profiles if needed.
                // The original code expected `employeeData`.
                // Let's create a minimal employee list from the report data itself for now to resolve permission logic.
                const uniqueEmployees = Array.from(new Map(transformedData.map(item => [item['Email'], item])).values());
                const extractedEmployeeData = uniqueEmployees.map(u => ({
                    'id': u['Email'], // Mock ID using email
                    'Họ Và Tên': u['Tên'],
                    'Email': u['Email'],
                    'Chức vụ': u['Chức vụ'],
                    'Team': u['Team'],
                    'Chi nhánh': u['Chi nhánh'] || u['chi nhánh'],
                    'Vị trí': u['Chức vụ']
                }));

                setEmployeeData(extractedEmployeeData);

                // Fetch dữ liệu từ nhiều bảng SONG SONG để tránh xung đột và tăng tốc độ
                // Sử dụng Promise.all() để chạy các operations độc lập cùng lúc
                console.log(`🔄 [BaoCaoSale] Bắt đầu fetch dữ liệu từ nhiều bảng song song...`);
                console.log(`📅 [BaoCaoSale] Date range: ${filters.startDate} to ${filters.endDate}`);
                console.log(`📊 [BaoCaoSale] Số records trong transformedData: ${transformedData.length}`);

                // Debug: Đếm records ngày 29
                const records29 = transformedData.filter(item => {
                    const date = item['Ngày'];
                    return String(date).includes('29') && String(date).includes('01') && String(date).includes('2026');
                });
                console.log(`📅 [BaoCaoSale] Số records ngày 29 trong transformedData: ${records29.length}`);
                if (records29.length > 0) {
                    console.log(`📋 [BaoCaoSale] Sample records ngày 29:`, records29.slice(0, 3).map(r => ({
                        ten: r['Tên'],
                        ngay: r['Ngày'],
                        sanPham: r['Sản phẩm'],
                        thiTruong: r['Thị trường'],
                        soDonTT: r['Số đơn TT'] // Log để kiểm tra
                    })));
                }

                // Fetch dữ liệu từ nhiều bảng - ƯU TIÊN "Số đơn TT" trước để đảm bảo tính đúng
                // Sau đó chạy song song các operations khác
                try {
                    // BƯỚC 1: Tính "Số đơn TT" TRƯỚC (quan trọng nhất, cần đảm bảo tính đúng)
                    // console.log(`🔄 [BaoCaoSale] Bước 1: Tính "Số đơn TT" từ bảng orders...`);
                    // await enrichWithTotalOrdersFromOrders(transformedData, filters.startDate, filters.endDate);
                    // console.log(`✅ [BaoCaoSale] Hoàn thành enrichWithTotalOrdersFromOrders`);

                    // Log để kiểm tra sau khi enrich
                    // const recordsWithSoDonTT = transformedData.filter(r => r['Số đơn TT'] > 0);
                    // console.log(`📊 [BaoCaoSale] Sau enrichWithTotalOrdersFromOrders: ${recordsWithSoDonTT.length}/${transformedData.length} records có Số đơn TT > 0`);
                    // if (recordsWithSoDonTT.length > 0) {
                    //     console.log(`📊 [BaoCaoSale] Sample records có Số đơn TT:`, recordsWithSoDonTT.slice(0, 5).map(r => ({
                    //         ten: r['Tên'],
                    //         ngay: r['Ngày'],
                    //         sanPham: r['Sản phẩm'],
                    //         thiTruong: r['Thị trường'],
                    //         soDonTT: r['Số đơn TT']
                    //     })));
                    // } else {
                    //     console.warn(`⚠️ [BaoCaoSale] KHÔNG CÓ records nào có Số đơn TT > 0!`);
                    // }

                    // BƯỚC 2: Chạy SONG SONG các operations còn lại từ bảng orders và sales_reports
                    console.log(`🔄 [BaoCaoSale] Bước 2: Chạy song song các operations khác...`);
                    await Promise.all([
                        enrichWithCancelOrdersFromOrders(transformedData, filters.startDate, filters.endDate, filters.products, filters.markets)
                            .then(() => console.log(`✅ [BaoCaoSale] Hoàn thành enrichWithCancelOrdersFromOrders`))
                            .catch(err => console.error(`❌ [BaoCaoSale] Lỗi trong enrichWithCancelOrdersFromOrders:`, err)),

                        // enrichWithTotalRevenueFromOrders(transformedData, filters.startDate, filters.endDate)
                        //     .then(() => console.log(`✅ [BaoCaoSale] Hoàn thành enrichWithTotalRevenueFromOrders`))
                        //     .catch(err => console.error(`❌ [BaoCaoSale] Lỗi trong enrichWithTotalRevenueFromOrders:`, err)),

                        // enrichWithRevenueAfterCancelFromOrders(transformedData, filters.startDate, filters.endDate)
                        //     .then(() => console.log(`✅ [BaoCaoSale] Hoàn thành enrichWithRevenueAfterCancelFromOrders`))
                        //     .catch(err => console.error(`❌ [BaoCaoSale] Lỗi trong enrichWithRevenueAfterCancelFromOrders:`, err)),

                        // Từ bảng sales_reports (độc lập với orders)
                        enrichMessAndResponseFromSalesReports(transformedData, filters.startDate, filters.endDate)
                            .then(() => console.log(`✅ [BaoCaoSale] Hoàn thành enrichMessAndResponseFromSalesReports`))
                            .catch(err => console.error(`❌ [BaoCaoSale] Lỗi trong enrichMessAndResponseFromSalesReports:`, err))
                    ]);

                    console.log(`✅ [BaoCaoSale] Hoàn thành tất cả enrich operations`);

                    // Verify "Số đơn TT" sau khi enrich
                    // const finalRecordsWithSoDonTT = transformedData.filter(r => r['Số đơn TT'] > 0);
                    // console.log(`📊 [BaoCaoSale] FINAL VERIFY: ${finalRecordsWithSoDonTT.length}/${transformedData.length} records có Số đơn TT > 0`);
                    // if (finalRecordsWithSoDonTT.length === 0) {
                    //     console.error(`❌ [BaoCaoSale] CẢNH BÁO: Không có records nào có Số đơn TT > 0 sau khi enrich!`);
                    // }
                } catch (err) {
                    console.error(`❌ [BaoCaoSale] Lỗi trong enrich operations:`, err);
                }

                await processFetchedData(transformedData, extractedEmployeeData);

            } catch (err) {
                console.error('Fetch Error:', err);
                // alert(`Đã xảy ra lỗi khi tải dữ liệu: ${err.message}`);
                // Don't alert detailed error to user, maybe show empty state or log
                setRawData([]);
            } finally {
                setLoading(false);
            }
        };

        const processFetchedData = async (apiData, employeeData) => {
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
                // Admin luôn xem full danh sách, không bị giới hạn
                if (isAdmin) {
                    setIsRestrictedView(false);
                    newPermissions = {
                        allowedBranch: null,
                        allowedTeam: null,
                        allowedNames: [],
                        title: 'DỮ LIỆU TỔNG HỢP (ADMIN)'
                    };
                } else {
                    // Non-admin: Áp dụng restriction
                    const userJson = localStorage.getItem("user");
                    const user = userJson ? JSON.parse(userJson) : null;
                    const userName = localStorage.getItem("username") || user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || user?.username || user?.name || "";

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
                }
            }
            setPermissions(newPermissions);

            // --- Process Data ---
            const totalRecordsBeforeFilter = (apiData || []).length;
            const processed = (apiData || [])
                .filter(r => {
                    const hasName = r['Tên'] && String(r['Tên']).trim() !== '';
                    const hasTeam = r['Team'] && String(r['Team']).trim() !== '';
                    return hasName && hasTeam;
                })
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
                    // BỎ: soDonHuy từ sales_reports (nhập tay), chỉ dùng soDonHoanHuyThucTe từ orders (thực tế)

                    soDonThanhCong: Number(r['Số đơn thành công']) || 0,
                    doanhSoThanhCong: Number(r['Doanh số thành công']) || 0,
                    soDonThucTe: Number(r['Số đơn thực tế']) || 0,
                    doanhThuChotThucTe: Number(r['Doanh thu chốt thực tế']) || 0,
                    doanhSoDiThucTe: Number(r['Doanh số đi thực tế']) || 0,
                    soDonHoanHuyThucTe: Number(r['Số đơn hoàn hủy thực tế']) || 0,
                    doanhSoHoanHuyThucTe: Number(r['Doanh số hoàn hủy thực tế']) || 0,
                    // CHỈNH SỬA: Lấy dữ liệu TRỰC TIẾP từ sales_reports (Input Form)
                    // Thay vì lấy từ r['Số đơn TT'] (đã bị comment out ở trên)
                    soDonTT: Number(r['Đơn Mess']) || 0, // Lấy từ sales_reports.order_count
                    doanhSoTT: Number(r['Doanh số Mess']) || 0, // Lấy từ sales_reports.revenue_mess
                    doanhSoHuy: Number(r['Doanh số hoàn huỷ']) || 0, // Lấy từ sales_reports.revenue_cancel
                    // Số đơn hủy: sales_reports.order_cancel_count (thường là 0 vì form không có nhập)
                    soDonHuy: Number(r['Số đơn hoàn hủy thực tế']) || 0, // Lấy từ kết quả enrichWithCancelOrdersFromOrders

                    // Tính Doanh số sau hủy = Doanh số Mess - Doanh số hoàn hủy
                    doanhSoSauHuy: (Number(r['Doanh số Mess']) || 0) - (Number(r['Doanh số hoàn huỷ']) || 0),

                    originalRecord: r // Keep ref if needed
                }));

            const totalRecordsAfterFilter = processed.length;
            const filteredOutCount = totalRecordsBeforeFilter - totalRecordsAfterFilter;
            if (filteredOutCount > 0) {
                console.warn(`⚠️ Đã loại bỏ ${filteredOutCount} records không có Tên hoặc Team (tổng ${totalRecordsBeforeFilter} records)`);
            }

            // Log tổng số Mess trước khi filter
            const totalMessBeforeFilter = (apiData || []).reduce((sum, r) => sum + (Number(r['Số Mess']) || 0), 0);
            const totalMessAfterFilter = processed.reduce((sum, r) => sum + r.soMessCmt, 0);
            console.log(`📊 Tổng số Mess: Trước filter = ${totalMessBeforeFilter}, Sau filter = ${totalMessAfterFilter}, Bị loại = ${totalMessBeforeFilter - totalMessAfterFilter}`);

            let visibleData = processed;

            // Filter theo permissions hiện tại (nếu có restricted view)
            // Admin KHÔNG bị filter, luôn xem full danh sách
            if (!isAdmin && (isRestrictedView || idFromUrl)) {
                visibleData = processed.filter(r => {
                    if (newPermissions.allowedBranch && r.chiNhanh.toLowerCase() !== newPermissions.allowedBranch.toLowerCase()) return false;
                    if (newPermissions.allowedTeam && r.team !== newPermissions.allowedTeam) return false;
                    if (newPermissions.allowedNames.length > 0 && !newPermissions.allowedNames.includes(r.ten)) return false;
                    return true;
                });
            }

            // Filter và thêm nhân sự từ selected_personnel (nếu không phải Admin và có selectedPersonnelNames)
            // Admin KHÔNG bị filter bởi selected_personnel
            // Logic mới: Hiển thị TẤT CẢ nhân sự trong selectedPersonnelNames, kể cả khi không có dữ liệu
            console.log(`🔍 [BaoCaoSale] Checking selectedPersonnelNames filter:`, {
                isAdmin,
                selectedPersonnelNames,
                hasSelectedPersonnel: selectedPersonnelNames && selectedPersonnelNames.length > 0,
                selectedPersonnelLength: selectedPersonnelNames?.length || 0
            });

            if (!isAdmin && selectedPersonnelNames && selectedPersonnelNames.length > 0) {
                const beforeFilterCount = visibleData.length;
                const uniqueNamesBefore = [...new Set(visibleData.map(r => r.ten).filter(Boolean))];
                console.log(`📋 [BaoCaoSale] Trước khi filter selected_personnel:`);
                console.log(`  - Tổng records: ${beforeFilterCount}`);
                console.log(`  - Số nhân sự unique: ${uniqueNamesBefore.length}`);
                console.log(`  - Danh sách nhân sự:`, uniqueNamesBefore);
                console.log(`  - selectedPersonnelNames:`, selectedPersonnelNames);

                // 1. Filter để chỉ giữ lại nhân sự trong selectedPersonnelNames
                visibleData = visibleData.filter(r => {
                    const rName = String(r.ten || '').trim();
                    const rNameLower = rName.toLowerCase();

                    // Tìm match chính xác hoặc partial match
                    const matched = selectedPersonnelNames.some(name => {
                        const nameStr = String(name).trim();
                        const nameStrLower = nameStr.toLowerCase();

                        // Match chính xác (case-insensitive)
                        if (rNameLower === nameStrLower) {
                            return true;
                        }

                        // Partial match: tên trong data chứa tên trong selectedPersonnelNames hoặc ngược lại
                        if (rNameLower.includes(nameStrLower) || nameStrLower.includes(rNameLower)) {
                            // Kiểm tra thêm để tránh match sai (ví dụ: "Nguyễn" match với "Nguyễn Anh Điệp")
                            // Chỉ match nếu độ dài chênh lệch không quá lớn (tránh match quá rộng)
                            const lengthDiff = Math.abs(rNameLower.length - nameStrLower.length);
                            if (lengthDiff <= 10) { // Cho phép chênh lệch tối đa 10 ký tự
                                return true;
                            }
                        }

                        return false;
                    });

                    if (!matched) {
                        console.log(`  ⚠️ Loại bỏ: "${r.ten}" (không khớp với selectedPersonnelNames)`);
                    } else {
                        console.log(`  ✅ Giữ lại: "${r.ten}" (khớp với selectedPersonnelNames)`);
                    }
                    return matched;
                });

                // Helper function để normalize string (dùng lại từ enrichWithTotalOrdersFromOrders)
                const normalizeStr = (str) => {
                    if (!str) return '';
                    return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
                };

                // 2. Lấy danh sách nhân sự đã có trong visibleData (sau khi filter)
                const existingNames = new Set(visibleData.map(r => {
                    const rName = String(r.ten || '').trim().toLowerCase();
                    // Tìm tên chính xác từ selectedPersonnelNames
                    const matchedName = selectedPersonnelNames.find(name => {
                        const nameStr = String(name).trim().toLowerCase();
                        return rName === nameStr || rName.includes(nameStr) || nameStr.includes(rName);
                    });
                    return matchedName ? matchedName.toLowerCase() : rName;
                }));

                // 3. Thêm các nhân sự từ selectedPersonnelNames chưa có trong visibleData
                const missingPersonnel = selectedPersonnelNames.filter(name => {
                    const nameStr = String(name).trim().toLowerCase();
                    return !existingNames.has(nameStr) &&
                        !Array.from(existingNames).some(existing =>
                            existing === nameStr || existing.includes(nameStr) || nameStr.includes(existing)
                        );
                });

                console.log(`📋 [BaoCaoSale] Nhân sự chưa có dữ liệu:`, missingPersonnel);

                // 4. Tạo records với dữ liệu = 0 cho nhân sự chưa có
                // Tính "Số đơn TT" trực tiếp từ database (giống như enrichWithTotalOrdersFromOrders)
                if (missingPersonnel.length > 0) {
                    // Tìm thông tin team và chi nhánh từ employeeData
                    const defaultTeam = visibleData.length > 0 ? visibleData[0].team : '';
                    const defaultChiNhanh = visibleData.length > 0 ? visibleData[0].chiNhanh : 'Không xác định';

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
                            if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                return trimmed;
                            }
                            if (trimmed.includes('/')) {
                                const parts = trimmed.split('/');
                                if (parts.length === 3) {
                                    const p1 = parseInt(parts[0]);
                                    const p2 = parseInt(parts[1]);
                                    const p3 = parseInt(parts[2]);
                                    if (p2 > 12 && p1 <= 12) {
                                        return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
                                    } else if (p1 > 12 && p2 <= 12) {
                                        return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                                    } else {
                                        return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                                    }
                                }
                            }
                            const parsed = new Date(trimmed);
                            if (!isNaN(parsed.getTime())) {
                                return parsed.toISOString().split('T')[0];
                            }
                            return trimmed;
                        }
                        return String(date);
                    };

                    const normalizedStartDate = normalizeDate(filters.startDate);
                    const normalizedEndDate = normalizeDate(filters.endDate);

                    // Fetch orders từ database cho các nhân sự chưa có dữ liệu
                    // Tính: Số đơn TT, Doanh số TT, Số đơn Hủy TT
                    // Fetch "Số Mess" và "Phản hồi" độc lập từ sales_reports
                    try {
                        // 1. Fetch tất cả orders (để tính Số đơn TT và Doanh số TT)
                        const { data: allOrdersForMissingPersonnel, error: ordersError } = await supabase
                            .from('orders')
                            .select('order_date, sale_staff, total_amount_vnd')
                            .gte('order_date', normalizedStartDate)
                            .lte('order_date', normalizedEndDate)
                            .limit(10000);

                        // 2. Fetch đơn hủy (để tính Số đơn Hủy TT)
                        const { data: cancelOrdersForMissingPersonnel, error: cancelOrdersError } = await supabase
                            .from('orders')
                            .select('order_date, sale_staff, check_result')
                            .gte('order_date', normalizedStartDate)
                            .lte('order_date', normalizedEndDate)
                            .or('check_result.eq.Hủy,check_result.eq.Huỷ')
                            .limit(10000);

                        // 3. Fetch "Số Mess" và "Phản hồi" độc lập từ sales_reports cho các nhân sự chưa có dữ liệu
                        // Tạo danh sách tên nhân sự để filter
                        const personnelNamesForQuery = missingPersonnel.map(name => name.trim()).filter(Boolean);

                        let messAndResponseData = [];
                        if (personnelNamesForQuery.length > 0) {
                            // Fetch từ sales_reports với filter theo tên và khoảng ngày
                            let query = supabase
                                .from('sales_reports')
                                .select('name, mess_count, response_count, date')
                                .gte('date', normalizedStartDate)
                                .lte('date', normalizedEndDate);

                            // Filter theo tên nhân sự (nếu có ít hơn 50 tên để tránh vượt quá giới hạn OR)
                            if (personnelNamesForQuery.length <= 50) {
                                const nameConditions = personnelNamesForQuery
                                    .map(name => `name.ilike.%${name}%`)
                                    .join(',');
                                query = query.or(nameConditions);
                            }

                            query = query.limit(10000);

                            const { data: salesReportsData, error: salesReportsError } = await query;

                            if (salesReportsError) {
                                console.error('❌ Error fetching mess_count and response_count:', salesReportsError);
                            } else {
                                messAndResponseData = salesReportsData || [];
                                console.log(`📊 [BaoCaoSale] Fetch được ${messAndResponseData.length} records từ sales_reports cho mess_count và response_count`);
                            }
                        }

                        if (ordersError || cancelOrdersError) {
                            console.error('❌ Error fetching orders for missing personnel:', ordersError || cancelOrdersError);
                        } else {
                            console.log(`📊 [BaoCaoSale] Fetch được ${allOrdersForMissingPersonnel?.length || 0} đơn cho missing personnel trong khoảng ${normalizedStartDate} - ${normalizedEndDate}`);

                            // Validate và filter cancel orders
                            const validCancelOrders = (cancelOrdersForMissingPersonnel || []).filter(order => {
                                const checkResult = String(order.check_result || '').trim();
                                return checkResult === 'Hủy' || checkResult === 'Huỷ';
                            });
                            console.log(`📊 [BaoCaoSale] Fetch được ${validCancelOrders.length} đơn hủy cho missing personnel`);

                            // Tính Số đơn TT, Doanh số TT, và Số đơn Hủy TT cho từng nhân sự chưa có dữ liệu
                            const soDonTTByPersonnel = new Map(); // Số đơn TT
                            const doanhSoTTByPersonnel = new Map(); // Doanh số TT (tổng total_amount_vnd)
                            const soDonHuyTTByPersonnel = new Map(); // Số đơn Hủy TT
                            const messByPersonnel = new Map(); // Số Mess (từ sales_reports)
                            const phanHoiByPersonnel = new Map(); // Phản hồi (từ sales_reports)

                            // Tính Số đơn TT và Doanh số TT từ tất cả orders
                            // QUAN TRỌNG: Phải dùng cùng logic matching như enrichWithTotalOrdersFromOrders
                            // để đảm bảo tính nhất quán (tránh "đúng 1 nửa lại sai 1 nửa")
                            (allOrdersForMissingPersonnel || []).forEach(order => {
                                const orderSaleName = normalizeStr(order.sale_staff);

                                // Tìm nhân sự trong missingPersonnel khớp với order
                                // Dùng exact match hoặc partial match (giống logic trong enrichWithTotalOrdersFromOrders)
                                const matchedPersonnel = missingPersonnel.find(name => {
                                    const nameStr = normalizeStr(name);
                                    // Exact match (ưu tiên)
                                    if (orderSaleName === nameStr) {
                                        return true;
                                    }
                                    // Partial match: chỉ match nếu độ dài chênh lệch không quá lớn
                                    // (tránh match sai như "Nguyễn" với "Nguyễn Anh Điệp")
                                    const lengthDiff = Math.abs(orderSaleName.length - nameStr.length);
                                    if (lengthDiff <= 10 && (orderSaleName.includes(nameStr) || nameStr.includes(orderSaleName))) {
                                        return true;
                                    }
                                    return false;
                                });

                                if (matchedPersonnel) {
                                    // Dùng tên đã normalize từ missingPersonnel (không phải từ order)
                                    // để đảm bảo consistency với key trong enrichWithTotalOrdersFromOrders
                                    const key = normalizeStr(matchedPersonnel);

                                    // Tính Số đơn TT
                                    const currentSoDonTT = soDonTTByPersonnel.get(key) || 0;
                                    soDonTTByPersonnel.set(key, currentSoDonTT + 1);

                                    // Tính Doanh số TT
                                    const currentDoanhSoTT = doanhSoTTByPersonnel.get(key) || 0;
                                    const orderAmount = Number(order.total_amount_vnd) || 0;
                                    doanhSoTTByPersonnel.set(key, currentDoanhSoTT + orderAmount);
                                }
                            });

                            // Tính Số đơn Hủy TT từ đơn hủy
                            // QUAN TRỌNG: Dùng cùng logic matching như trên để đảm bảo consistency
                            validCancelOrders.forEach(order => {
                                const orderSaleName = normalizeStr(order.sale_staff);

                                // Tìm nhân sự trong missingPersonnel khớp với order
                                // Dùng exact match hoặc partial match (giống logic trên)
                                const matchedPersonnel = missingPersonnel.find(name => {
                                    const nameStr = normalizeStr(name);
                                    // Exact match (ưu tiên)
                                    if (orderSaleName === nameStr) {
                                        return true;
                                    }
                                    // Partial match: chỉ match nếu độ dài chênh lệch không quá lớn
                                    const lengthDiff = Math.abs(orderSaleName.length - nameStr.length);
                                    if (lengthDiff <= 10 && (orderSaleName.includes(nameStr) || nameStr.includes(orderSaleName))) {
                                        return true;
                                    }
                                    return false;
                                });

                                if (matchedPersonnel) {
                                    const key = normalizeStr(matchedPersonnel);
                                    const current = soDonHuyTTByPersonnel.get(key) || 0;
                                    soDonHuyTTByPersonnel.set(key, current + 1);
                                }
                            });

                            // Tính "Số Mess" và "Phản hồi" độc lập từ sales_reports
                            // QUAN TRỌNG: Dùng cùng logic matching như trên để đảm bảo consistency
                            messAndResponseData.forEach(report => {
                                const reportName = normalizeStr(report.name);

                                // Tìm nhân sự trong missingPersonnel khớp với report
                                // Dùng exact match hoặc partial match (giống logic trên)
                                const matchedPersonnel = missingPersonnel.find(name => {
                                    const nameStr = normalizeStr(name);
                                    // Exact match (ưu tiên)
                                    if (reportName === nameStr) {
                                        return true;
                                    }
                                    // Partial match: chỉ match nếu độ dài chênh lệch không quá lớn
                                    const lengthDiff = Math.abs(reportName.length - nameStr.length);
                                    if (lengthDiff <= 10 && (reportName.includes(nameStr) || nameStr.includes(reportName))) {
                                        return true;
                                    }
                                    return false;
                                });

                                if (matchedPersonnel) {
                                    const key = normalizeStr(matchedPersonnel);

                                    // Tính tổng Số Mess
                                    const currentMess = messByPersonnel.get(key) || 0;
                                    messByPersonnel.set(key, currentMess + (Number(report.mess_count) || 0));

                                    // Tính tổng Phản hồi
                                    const currentPhanHoi = phanHoiByPersonnel.get(key) || 0;
                                    phanHoiByPersonnel.set(key, currentPhanHoi + (Number(report.response_count) || 0));
                                }
                            });

                            console.log(`📊 [BaoCaoSale] Số đơn TT theo nhân sự (từ database):`,
                                Array.from(soDonTTByPersonnel.entries()).map(([name, count]) => ({ name, count }))
                            );
                            console.log(`📊 [BaoCaoSale] Doanh số TT theo nhân sự (từ database):`,
                                Array.from(doanhSoTTByPersonnel.entries()).map(([name, amount]) => ({ name, amount }))
                            );
                            console.log(`📊 [BaoCaoSale] Số đơn Hủy TT theo nhân sự (từ database):`,
                                Array.from(soDonHuyTTByPersonnel.entries()).map(([name, count]) => ({ name, count }))
                            );
                            console.log(`📊 [BaoCaoSale] Số Mess theo nhân sự (từ sales_reports):`,
                                Array.from(messByPersonnel.entries()).map(([name, count]) => ({ name, count }))
                            );
                            console.log(`📊 [BaoCaoSale] Phản hồi theo nhân sự (từ sales_reports):`,
                                Array.from(phanHoiByPersonnel.entries()).map(([name, count]) => ({ name, count }))
                            );

                            missingPersonnel.forEach(personnelName => {
                                // Tìm thông tin nhân sự từ employeeData
                                const employeeInfo = employeeData.find(e => {
                                    const eName = String(e['Họ Và Tên'] || '').trim().toLowerCase();
                                    const pName = String(personnelName).trim().toLowerCase();
                                    return eName === pName || eName.includes(pName) || pName.includes(eName);
                                });

                                // Lấy các giá trị từ maps
                                const personnelKey = normalizeStr(personnelName);
                                const soDonTT = soDonTTByPersonnel.get(personnelKey) || 0;
                                const doanhSoTT = doanhSoTTByPersonnel.get(personnelKey) || 0;
                                const soDonHuyTT = soDonHuyTTByPersonnel.get(personnelKey) || 0;
                                const mess = messByPersonnel.get(personnelKey) || 0; // Số Mess từ sales_reports
                                const phanHoi = phanHoiByPersonnel.get(personnelKey) || 0; // Phản hồi từ sales_reports

                                // Tạo record với dữ liệu = 0, nhưng giữ lại các giá trị từ database
                                const emptyRecord = {
                                    chucVu: employeeInfo?.['Chức vụ'] || employeeInfo?.['Vị trí'] || '',
                                    ten: personnelName.trim(),
                                    email: employeeInfo?.['Email'] || '',
                                    team: employeeInfo?.['Team'] || defaultTeam,
                                    chiNhanh: (employeeInfo?.['Chi nhánh'] || employeeInfo?.['chi nhánh'] || '').trim() || defaultChiNhanh,
                                    ngay: filters.startDate || new Date().toISOString().split('T')[0], // Dùng startDate làm ngày mặc định
                                    ca: 'Hết ca',
                                    sanPham: '',
                                    thiTruong: '',
                                    soMessCmt: mess, // Số Mess từ sales_reports (độc lập)
                                    soDon: 0,
                                    dsChot: 0,
                                    phanHoi: phanHoi, // Phản hồi từ sales_reports (độc lập)
                                    doanhSoDi: 0,
                                    soDonHuy: soDonHuyTT, // Lấy từ orders (thực tế) thay vì 0
                                    doanhSoHuy: 0,
                                    soDonThanhCong: 0,
                                    doanhSoThanhCong: 0,
                                    soDonThucTe: 0,
                                    doanhThuChotThucTe: 0,
                                    doanhSoDiThucTe: 0,
                                    soDonHoanHuyThucTe: soDonHuyTT, // Số đơn Hủy TT từ database
                                    doanhSoHoanHuyThucTe: 0,
                                    soDonTT: soDonTT, // Số đơn TT từ database
                                    doanhSoTT: doanhSoTT, // Doanh số TT từ database
                                    doanhSoSauHuy: 0,
                                    originalRecord: null
                                };

                                visibleData.push(emptyRecord);
                                console.log(`  ✅ Đã thêm nhân sự "${personnelName}" với Số Mess = ${mess}, Phản hồi = ${phanHoi}, Số đơn TT = ${soDonTT}, Doanh số TT = ${doanhSoTT}, Số đơn Hủy TT = ${soDonHuyTT} (từ database)`);
                            });
                        }
                    } catch (err) {
                        console.error('❌ Error calculating soDonTT, doanhSoTT, soDonHuyTT for missing personnel:', err);
                        // Nếu có lỗi, vẫn tạo records với các giá trị = 0
                        missingPersonnel.forEach(personnelName => {
                            const employeeInfo = employeeData.find(e => {
                                const eName = String(e['Họ Và Tên'] || '').trim().toLowerCase();
                                const pName = String(personnelName).trim().toLowerCase();
                                return eName === pName || eName.includes(pName) || pName.includes(eName);
                            });

                            const emptyRecord = {
                                chucVu: employeeInfo?.['Chức vụ'] || employeeInfo?.['Vị trí'] || '',
                                ten: personnelName.trim(),
                                email: employeeInfo?.['Email'] || '',
                                team: employeeInfo?.['Team'] || defaultTeam,
                                chiNhanh: (employeeInfo?.['Chi nhánh'] || employeeInfo?.['chi nhánh'] || '').trim() || defaultChiNhanh,
                                ngay: filters.startDate || new Date().toISOString().split('T')[0],
                                ca: 'Hết ca',
                                sanPham: '',
                                thiTruong: '',
                                soMessCmt: 0,
                                soDon: 0,
                                dsChot: 0,
                                phanHoi: 0,
                                doanhSoDi: 0,
                                soDonHuy: 0, // Fallback = 0 nếu có lỗi (sẽ được tính từ orders)
                                doanhSoHuy: 0,
                                soDonThanhCong: 0,
                                doanhSoThanhCong: 0,
                                soDonThucTe: 0,
                                doanhThuChotThucTe: 0,
                                doanhSoDiThucTe: 0,
                                soDonHoanHuyThucTe: 0, // Fallback = 0 nếu có lỗi
                                doanhSoHoanHuyThucTe: 0,
                                soDonTT: 0, // Fallback = 0 nếu có lỗi
                                doanhSoTT: 0, // Fallback = 0 nếu có lỗi
                                doanhSoSauHuy: 0,
                                originalRecord: null
                            };

                            visibleData.push(emptyRecord);
                        });
                    }
                }

                const uniqueNamesAfter = [...new Set(visibleData.map(r => r.ten).filter(Boolean))];
                console.log(`📋 [BaoCaoSale] Sau khi filter và thêm nhân sự:`);
                console.log(`  - Tổng records: ${visibleData.length}`);
                console.log(`  - Số nhân sự unique: ${uniqueNamesAfter.length}`);
                console.log(`  - Danh sách nhân sự:`, uniqueNamesAfter);
                console.log(`📋 [BaoCaoSale] Filtered by selected_personnel: ${beforeFilterCount} → ${visibleData.length} records`);
            } else if (!isAdmin) {
                console.log(`📋 [BaoCaoSale] Không filter selected_personnel vì:`, {
                    isAdmin,
                    selectedPersonnelNames,
                    hasSelectedPersonnel: selectedPersonnelNames && selectedPersonnelNames.length > 0
                });
            }

            console.log(`📊 [BaoCaoSale] Final visibleData trước khi setRawData:`, {
                totalRecords: visibleData.length,
                uniqueNames: [...new Set(visibleData.map(r => r.ten).filter(Boolean))].length,
                sampleRecords: visibleData.slice(0, 3).map(r => ({
                    ten: r.ten,
                    soMessCmt: r.soMessCmt,
                    team: r.team
                }))
            });

            setRawData(visibleData);
            setLoading(false);
        };

        // Chỉ fetch khi đã load xong selectedPersonnelNames (null = chưa load)
        // Lưu ý: selectedPersonnelNames không thay đổi khi filter thay đổi, nó chỉ được load một lần
        if (!isAdmin && selectedPersonnelNames === null) {
            console.log('⏳ [BaoCaoSale] Đợi selectedPersonnelNames được load...');
            return; // Đợi selectedPersonnelNames được load
        }

        console.log('✅ [BaoCaoSale] selectedPersonnelNames đã sẵn sàng, bắt đầu fetch data:', {
            isAdmin,
            selectedPersonnelNames,
            hasSelectedPersonnel: selectedPersonnelNames && selectedPersonnelNames.length > 0
        });

        fetchData();
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
            if (!isDateInRange(r.ngay, filters.startDate, filters.endDate)) {
                reasons.push('date out of range');
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
            if (!summary[r.ten]) {
                summary[r.ten] = {
                    name: r.ten, chiNhanh: r.chiNhanh, team: r.team, ...initial
                };
            }
            const s = summary[r.ten];

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

        const flatList = Object.values(summary).sort((a, b) => a.team.localeCompare(b.team) || b.chot - a.chot || a.name.localeCompare(b.name));

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

    // --- KPI Report Calculation ---
    const [kpiReportData, setKpiReportData] = useState({ kpiData: [], kpiTotal: null });
    const [kpiLoading, setKpiLoading] = useState(false);

    useEffect(() => {
        if (activeTab !== 'bao-cao-kpis' || !filters.startDate || !filters.endDate) {
            setKpiReportData({ kpiData: [], kpiTotal: null });
            return;
        }

        const calculateKPI = async () => {
            setKpiLoading(true);
            try {
                // Helper functions
                const normalizeDate = (date) => {
                    if (!date) return '';
                    if (date instanceof Date) {
                        return date.toISOString().split('T')[0];
                    }
                    const trimmed = String(date).trim();
                    if (trimmed.includes('T')) return trimmed.split('T')[0];
                    if (trimmed.includes(' ')) return trimmed.split(' ')[0];
                    if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) return trimmed;
                    if (trimmed.includes('/')) {
                        const parts = trimmed.split('/');
                        if (parts.length === 3) {
                            const p1 = parseInt(parts[0]);
                            const p2 = parseInt(parts[1]);
                            const p3 = parseInt(parts[2]);
                            if (p2 > 12 && p1 <= 12) {
                                return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
                            } else if (p1 > 12 && p2 <= 12) {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            } else {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            }
                        }
                    }
                    const parsed = new Date(trimmed);
                    if (!isNaN(parsed.getTime())) {
                        return parsed.toISOString().split('T')[0];
                    }
                    return trimmed;
                };

                const normalizeStr = (str) => {
                    if (!str) return '';
                    return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
                };

                const normalizedStartDate = normalizeDate(filters.startDate);
                const normalizedEndDate = normalizeDate(filters.endDate);

                // Fetch orders
                console.log(`🚀 [KPI] Bắt đầu tính KPI. Filter:`, { startDate: normalizedStartDate, endDate: normalizedEndDate, kpiFilters });

                // --- TEST MODE CHECK ---
                try {
                    const settings = localStorage.getItem('system_settings');
                    if (settings) {
                        const parsed = JSON.parse(settings);
                        if (parsed.dataSource === 'test') {
                            console.log("🔶 [KPI] Loading Mock Data for KPI Report");
                            const mockKpiData = [
                                {
                                    name: 'Sale Leader Test',
                                    team: 'Team Test 1',
                                    soDonChot: 10, dsChot: 15000000,
                                    soDonHuy: 2, dsHuy: 3000000,
                                    soDonSauHuy: 8, dsSauHuy: 12000000,
                                    soDonDi: 8, dsDi: 12000000,
                                    soDonTC: 6, dThuTC: 9000000,
                                    ship: 500000, dThuTinhKPI: 8500000,
                                    tyLeThuTien: 0.7083 // 8500000 / 12000000
                                },
                                {
                                    name: 'Sale Member 1',
                                    team: 'Team Test 1',
                                    soDonChot: 5, dsChot: 5000000,
                                    soDonHuy: 0, dsHuy: 0,
                                    soDonSauHuy: 5, dsSauHuy: 5000000,
                                    soDonDi: 5, dsDi: 5000000,
                                    soDonTC: 4, dThuTC: 4000000,
                                    ship: 200000, dThuTinhKPI: 3800000,
                                    tyLeThuTien: 0.76
                                },
                                {
                                    name: 'Sale Member 2',
                                    team: 'Team Test 2',
                                    soDonChot: 8, dsChot: 12000000,
                                    soDonHuy: 1, dsHuy: 1500000,
                                    soDonSauHuy: 7, dsSauHuy: 10500000,
                                    soDonDi: 6, dsDi: 9000000,
                                    soDonTC: 5, dThuTC: 7500000,
                                    ship: 300000, dThuTinhKPI: 7200000,
                                    tyLeThuTien: 0.6857
                                }
                            ];

                            let mockTotal = {
                                soDonChot: 23, dsChot: 32000000,
                                soDonHuy: 3, dsHuy: 4500000,
                                soDonSauHuy: 20, dsSauHuy: 27500000,
                                soDonDi: 19, dsDi: 26000000,
                                soDonTC: 15, dThuTC: 20500000,
                                ship: 1000000, dThuTinhKPI: 19500000,
                                tyLeThuTien: 0.709 // 19500000 / 27500000
                            };

                            setKpiReportData({ kpiData: mockKpiData, kpiTotal: mockTotal });
                            setKpiLoading(false);
                            return;
                        }
                    }
                } catch (e) {
                    console.warn("Error checking test mode in KPI:", e);
                }

                let query = supabase
                    .from('orders')
                    .select('order_code, order_date, sale_staff, product, country, total_amount_vnd, shipping_fee, check_result, delivery_status, team')
                    .gte('order_date', normalizedStartDate)
                    .lte('order_date', normalizedEndDate);

                // Apply filters
                if (kpiFilters.products.length > 0) {
                    const productConditions = kpiFilters.products.map(p => `product.ilike.%${p}%`).join(',');
                    query = query.or(productConditions);
                }
                if (kpiFilters.markets.length > 0) {
                    const marketConditions = kpiFilters.markets.map(m => `country.ilike.%${m}%`).join(',');
                    query = query.or(marketConditions);
                }
                if (kpiFilters.team.length > 0) {
                    const teamConditions = kpiFilters.team.map(t => `team.ilike.%${t}%`).join(',');
                    query = query.or(teamConditions);
                }

                const { data: allOrders, error } = await query.limit(50000);

                if (error) {
                    console.error('❌ Error fetching orders for KPI:', error);
                    setKpiReportData({ kpiData: [], kpiTotal: null });
                    return;
                }

                console.log(`📊 [KPI] Fetched ${allOrders?.length || 0} orders.`);

                // Filter orders
                let filteredOrders = (allOrders || []).filter(order => {
                    // Filter by personnel
                    if (kpiFilters.personnel.length > 0) {
                        const orderName = normalizeStr(order.sale_staff);
                        if (!kpiFilters.personnel.some(p => orderName.includes(normalizeStr(p)))) {
                            return false;
                        }
                    }

                    // Filter by ship = 0
                    if (!kpiFilters.includeShipZero && (Number(order.shipping_fee) || 0) === 0) {
                        return false;
                    }

                    return true;
                });

                // Group by personnel
                const kpiByPersonnel = {};
                filteredOrders.forEach(order => {
                    const personnelName = order.sale_staff || 'Không xác định';
                    if (!kpiByPersonnel[personnelName]) {
                        kpiByPersonnel[personnelName] = {
                            name: personnelName,
                            team: order.team || '',
                            soDonChot: 0,
                            dsChot: 0,
                            soDonHuy: 0,
                            dsHuy: 0,
                            soDonSauHuy: 0,
                            dsSauHuy: 0,
                            soDonDi: 0,
                            dsDi: 0,
                            soDonTC: 0,
                            dThuTC: 0,
                            ship: 0,
                            dThuTinhKPI: 0
                        };
                    }

                    const kpi = kpiByPersonnel[personnelName];
                    const amount = Number(order.total_amount_vnd) || 0;
                    const shipFee = Number(order.shipping_fee) || 0;
                    const checkResult = String(order.check_result || '').trim();
                    const isHuy = checkResult === 'Hủy' || checkResult === 'Huỷ';
                    const isThanhCong = checkResult === 'Thành công' || checkResult === 'OK';
                    const isDi = String(order.delivery_status || '').toLowerCase().includes('đi') ||
                        String(order.delivery_status || '').toLowerCase().includes('di');

                    // Số đơn và DS chốt (tất cả đơn)
                    kpi.soDonChot++;
                    kpi.dsChot += amount;

                    // Số đơn và DS hủy
                    if (isHuy) {
                        kpi.soDonHuy++;
                        kpi.dsHuy += amount;
                    }

                    // Số đơn và DS sau hủy (tất cả trừ hủy)
                    if (!isHuy) {
                        kpi.soDonSauHuy++;
                        kpi.dsSauHuy += amount;
                    }

                    // Số đơn và DS đi
                    if (isDi) {
                        kpi.soDonDi++;
                        kpi.dsDi += amount;
                    }

                    // Số đơn và DThu thành công
                    if (isThanhCong) {
                        kpi.soDonTC++;
                        kpi.dThuTC += amount;
                    }

                    // Ship
                    kpi.ship += shipFee;

                    // DThu tính KPI (total_amount_vnd - shipping_fee)
                    kpi.dThuTinhKPI += (amount - shipFee);
                });

                // Convert to array and calculate tỷ lệ thu tiền
                const kpiData = Object.values(kpiByPersonnel).map(kpi => {
                    const tyLeThuTien = kpi.dsChot > 0 ? kpi.dThuTinhKPI / kpi.dsChot : 0;
                    return { ...kpi, tyLeThuTien };
                }).sort((a, b) => a.team.localeCompare(b.team) || b.dsChot - a.dsChot || a.name.localeCompare(b.name));

                // Calculate total
                const kpiTotal = kpiData.reduce((acc, item) => {
                    acc.soDonChot += item.soDonChot;
                    acc.dsChot += item.dsChot;
                    acc.soDonHuy += item.soDonHuy;
                    acc.dsHuy += item.dsHuy;
                    acc.soDonSauHuy += item.soDonSauHuy;
                    acc.dsSauHuy += item.dsSauHuy;
                    acc.soDonDi += item.soDonDi;
                    acc.dsDi += item.dsDi;
                    acc.soDonTC += item.soDonTC;
                    acc.dThuTC += item.dThuTC;
                    acc.dThuTinhKPI += item.dThuTinhKPI;
                    return acc;
                }, {
                    soDonChot: 0, dsChot: 0,
                    soDonHuy: 0, dsHuy: 0,
                    soDonSauHuy: 0, dsSauHuy: 0,
                    soDonDi: 0, dsDi: 0,
                    soDonTC: 0, dThuTC: 0,
                    ship: 0, dThuTinhKPI: 0
                });

                kpiTotal.tyLeThuTien = kpiTotal.dsChot > 0 ? kpiTotal.dThuTinhKPI / kpiTotal.dsChot : 0;

                // --- NEW LOGIC: Fetch Manual Data from sales_reports for "Chốt" metrics ---
                // Fetch sales_reports
                let salesQuery = supabase
                    .from('sales_reports')
                    .select('name, order_count, revenue_mess, date')
                    .gte('date', normalizedStartDate)
                    .lte('date', normalizedEndDate);

                const { data: salesReportsData, error: salesError } = await salesQuery.limit(10000);

                if (salesError) {
                    console.error('❌ Error fetching sales_reports for KPI:', salesError);
                } else {
                    console.log(`📊 [KPI] Fetched ${salesReportsData.length} records from sales_reports to align with Tab 1`);

                    // Aggregate sales_reports by personnel
                    const manualDataByPersonnel = {};
                    (salesReportsData || []).forEach(r => {
                        const name = normalizeStr(r.name);
                        if (!manualDataByPersonnel[name]) {
                            manualDataByPersonnel[name] = { soDonChot: 0, dsChot: 0 };
                        }
                        manualDataByPersonnel[name].soDonChot += Number(r.order_count) || 0;
                        manualDataByPersonnel[name].dsChot += Number(r.revenue_mess) || 0;
                    });

                    // Merge Manual Data into kpiData and kpiTotal
                    // Strategy:
                    // 1. Update existing personnel in kpiData with Manual "Chốt" values.
                    // 2. Add personnel who exist in sales_reports but NOT in orders (kpiData).

                    // Helper to find KPI record for a name
                    const findKpiRecord = (name) => kpiData.find(item => normalizeStr(item.name) === name);

                    // Update existing
                    kpiData.forEach(item => {
                        const nameKey = normalizeStr(item.name);
                        const manual = manualDataByPersonnel[nameKey];
                        if (manual) {
                            // OVERWRITE "Chốt" with Manual Data
                            item.soDonChot = manual.soDonChot;
                            item.dsChot = manual.dsChot;

                            // Recalculate "Sau hủy" = Manual Chốt - Actual Hủy
                            item.soDonSauHuy = item.soDonChot - item.soDonHuy;
                            item.dsSauHuy = item.dsChot - item.dsHuy;

                            // Recalculate Rate
                            item.tyLeThuTien = item.dsChot > 0 ? item.dThuTinhKPI / item.dsChot : 0;
                        } else {
                            // If no manual data, set Chốt = 0 (or keep Actual? User implies alignment, so assume Manual is truth)
                            // Tab 1 sets 0 if no sales_report found. Let's set 0 to be safe and strictly aligned.
                            // BUT: If strict alignment, we should probably set 0.
                            // However, if we have orders but no sales_report, implying "Chốt" = 0 but "Hủy" > 0 is weird but possible.
                            item.soDonChot = 0;
                            item.dsChot = 0;
                            item.soDonSauHuy = 0 - item.soDonHuy;
                            item.dsSauHuy = 0 - item.dsHuy;
                            item.tyLeThuTien = 0;
                        }
                    });

                    // Add missing personnel from sales_reports
                    Object.keys(manualDataByPersonnel).forEach(nameKey => {
                        // Check if this name already exists in kpiData (normalized check)
                        const exists = kpiData.some(item => normalizeStr(item.name) === nameKey);
                        if (!exists) {
                            const manual = manualDataByPersonnel[nameKey];
                            // Find original name case if possible, else Title Case
                            const originalNameRecord = salesReportsData.find(r => normalizeStr(r.name) === nameKey);
                            const displayName = originalNameRecord ? originalNameRecord.name : nameKey;

                            // Need Team info? Tab 1 gets it from employeeData.
                            // Here we might lack it if not in orders.
                            // Try to find from employeeData (globally available?) - No, employeeData is in parent scope but not passed to calculateKPI directly?
                            // Wait, employeeData is available in component scope!
                            const employee = employeeData.find(e => normalizeStr(e['Họ Và Tên']) === nameKey);
                            const team = employee ? (employee['Team'] || '') : 'Unknown';

                            kpiData.push({
                                name: displayName,
                                team: team,
                                soDonChot: manual.soDonChot,
                                dsChot: manual.dsChot,
                                soDonHuy: 0,
                                dsHuy: 0,
                                soDonSauHuy: manual.soDonChot, // 0 Hủy
                                dsSauHuy: manual.dsChot,
                                soDonDi: 0,
                                dsDi: 0,
                                soDonTC: 0,
                                dThuTC: 0,
                                ship: 0,
                                dThuTinhKPI: 0,
                                tyLeThuTien: 0 // No revenue calculated
                            });
                        }
                    });

                    // Re-sort
                    kpiData.sort((a, b) => a.team.localeCompare(b.team) || b.dsChot - a.dsChot || a.name.localeCompare(b.name));

                    // Recalculate kpiTotal based on updated kpiData
                    // Reset total
                    Object.keys(kpiTotal).forEach(key => kpiTotal[key] = 0);

                    kpiData.forEach(item => {
                        kpiTotal.soDonChot += item.soDonChot;
                        kpiTotal.dsChot += item.dsChot;
                        kpiTotal.soDonHuy += item.soDonHuy;
                        kpiTotal.dsHuy += item.dsHuy;
                        kpiTotal.soDonSauHuy += item.soDonSauHuy;
                        kpiTotal.dsSauHuy += item.dsSauHuy;
                        kpiTotal.soDonDi += item.soDonDi;
                        kpiTotal.dsDi += item.dsDi;
                        kpiTotal.soDonTC += item.soDonTC;
                        kpiTotal.dThuTC += item.dThuTC;
                        kpiTotal.ship += item.ship;
                        kpiTotal.dThuTinhKPI += item.dThuTinhKPI;
                    });
                    kpiTotal.tyLeThuTien = kpiTotal.dsChot > 0 ? kpiTotal.dThuTinhKPI / kpiTotal.dsChot : 0;
                }

                setKpiReportData({ kpiData, kpiTotal });
            } catch (err) {
                console.error('❌ Error calculating KPI report:', err);
                setKpiReportData({ kpiData: [], kpiTotal: null });
            } finally {
                setKpiLoading(false);
            }
        };

        calculateKPI();
    }, [activeTab, filters.startDate, filters.endDate, kpiFilters, employeeData]);

    // --- Vận đơn Report Calculation ---
    const [vanDonReportData, setVanDonReportData] = useState({ vanDonData: [], vanDonTotal: null });
    const [vanDonLoading, setVanDonLoading] = useState(false);

    useEffect(() => {
        if (activeTab !== 'bao-cao-van-don' || !filters.startDate || !filters.endDate) {
            setVanDonReportData({ vanDonData: [], vanDonTotal: null });
            return;
        }

        const calculateVanDon = async () => {
            setVanDonLoading(true);
            try {
                // Helper functions
                const normalizeDate = (date) => {
                    if (!date) return '';
                    if (date instanceof Date) {
                        return date.toISOString().split('T')[0];
                    }
                    const trimmed = String(date).trim();
                    if (trimmed.includes('T')) return trimmed.split('T')[0];
                    if (trimmed.includes(' ')) return trimmed.split(' ')[0];
                    if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) return trimmed;
                    if (trimmed.includes('/')) {
                        const parts = trimmed.split('/');
                        if (parts.length === 3) {
                            const p1 = parseInt(parts[0]);
                            const p2 = parseInt(parts[1]);
                            const p3 = parseInt(parts[2]);
                            if (p2 > 12 && p1 <= 12) {
                                return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
                            } else if (p1 > 12 && p2 <= 12) {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            } else {
                                return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                            }
                        }
                    }
                    const parsed = new Date(trimmed);
                    if (!isNaN(parsed.getTime())) {
                        return parsed.toISOString().split('T')[0];
                    }
                    return trimmed;
                };

                const normalizeStr = (str) => {
                    if (!str) return '';
                    return String(str).trim().toLowerCase();
                };

                const normalizedStartDate = normalizeDate(filters.startDate);
                const normalizedEndDate = normalizeDate(filters.endDate);

                // Fetch orders với tất cả các trường cần thiết
                let query = supabase
                    .from('orders')
                    .select('order_code, order_date, sale_staff, product, country, total_amount_vnd, shipping_fee, check_result, delivery_status, payment_status, payment_status_detail, tracking_code, team')
                    .gte('order_date', normalizedStartDate)
                    .lte('order_date', normalizedEndDate);

                // Apply filters tương tự như KPI
                if (kpiFilters.products.length > 0) {
                    const productConditions = kpiFilters.products.map(p => `product.ilike.%${p}%`).join(',');
                    query = query.or(productConditions);
                }
                if (kpiFilters.markets.length > 0) {
                    const marketConditions = kpiFilters.markets.map(m => `country.ilike.%${m}%`).join(',');
                    query = query.or(marketConditions);
                }
                if (kpiFilters.teams.length > 0) {
                    const teamConditions = kpiFilters.teams.map(t => `team.ilike.%${t}%`).join(',');
                    query = query.or(teamConditions);
                }

                const { data: allOrders, error } = await query.limit(50000);

                if (error) {
                    console.error('❌ Error fetching orders for Vận đơn:', error);
                    setVanDonReportData({ vanDonData: [], vanDonTotal: null });
                    return;
                }

                // Filter orders
                let filteredOrders = (allOrders || []).filter(order => {
                    // Filter by personnel
                    if (kpiFilters.personnel.length > 0) {
                        const orderName = normalizeStr(order.sale_staff);
                        if (!kpiFilters.personnel.some(p => orderName.includes(normalizeStr(p)))) {
                            return false;
                        }
                    }

                    // Filter by ship = 0
                    if (!kpiFilters.includeShipZero && (Number(order.shipping_fee) || 0) === 0) {
                        return false;
                    }

                    return true;
                });

                // Group by personnel
                const vanDonByPersonnel = {};
                filteredOrders.forEach(order => {
                    const personnelName = order.sale_staff || 'Không xác định';
                    if (!vanDonByPersonnel[personnelName]) {
                        vanDonByPersonnel[personnelName] = {
                            name: personnelName,
                            team: order.team || '',
                            daThanhToanCoBill: { soDon: 0, thanhTien: 0 },
                            billMotPhan: { soDon: 0, thanhTien: 0 },
                            tongDonLenNoiBo: 0,
                            tongDonDuDkienDayVh: 0,
                            hoanVanHanh: { soDon: 0, thanhTien: 0 },
                            tongDonLenVanHanhChuaMa: 0,
                            donOKChuaDayDi: 0,
                            giaoThanhCong: { soDon: 0, thanhTien: 0 },
                            dangGiao: { soDon: 0, thanhTien: 0 },
                            chuaGiao: { soDon: 0, thanhTien: 0 },
                            choCheck: { soDon: 0, thanhTien: 0 },
                            trongTrangThai: { soDon: 0, thanhTien: 0 }
                        };
                    }

                    const vd = vanDonByPersonnel[personnelName];
                    const amount = Number(order.total_amount_vnd) || 0;
                    const paymentStatus = normalizeStr(order.payment_status || '');
                    const paymentStatusDetail = normalizeStr(order.payment_status_detail || '');
                    const deliveryStatus = normalizeStr(order.delivery_status || '');
                    const checkResult = normalizeStr(order.check_result || '');
                    const hasTrackingCode = order.tracking_code && order.tracking_code.trim() !== '';

                    // Đã Thanh Toán (có bill)
                    if (paymentStatus.includes('bill') || paymentStatusDetail.includes('bill') || paymentStatus.includes('có bill')) {
                        vd.daThanhToanCoBill.soDon++;
                        vd.daThanhToanCoBill.thanhTien += amount;
                    }

                    // Bill 1 phần
                    if (paymentStatus.includes('1 phần') || paymentStatusDetail.includes('1 phần') || paymentStatus.includes('mot phan')) {
                        vd.billMotPhan.soDon++;
                        vd.billMotPhan.thanhTien += amount;
                    }

                    // Tổng đơn lên nội bộ (đơn đã được check OK)
                    if (checkResult === 'ok' || checkResult === 'thành công') {
                        vd.tongDonLenNoiBo++;
                    }

                    // Tổng đơn đủ đkien đẩy vh (đơn OK và có tracking code hoặc đã lên vận hành)
                    if ((checkResult === 'ok' || checkResult === 'thành công') && (hasTrackingCode || deliveryStatus.includes('đi') || deliveryStatus.includes('giao'))) {
                        vd.tongDonDuDkienDayVh++;
                    }

                    // Hoàn vận hành
                    if (deliveryStatus.includes('hoàn') || deliveryStatus.includes('hoan')) {
                        vd.hoanVanHanh.soDon++;
                        vd.hoanVanHanh.thanhTien += amount;
                    }

                    // Tổng đơn lên vận hành chưa mã (đã có delivery_status nhưng chưa có tracking_code)
                    if ((deliveryStatus.includes('đi') || deliveryStatus.includes('giao') || deliveryStatus.includes('di')) && !hasTrackingCode) {
                        vd.tongDonLenVanHanhChuaMa++;
                    }

                    // Đơn OK chưa đẩy đi (check_result = OK nhưng chưa có delivery_status hoặc delivery_status rỗng/null)
                    if ((checkResult === 'ok' || checkResult === 'thành công') && (!deliveryStatus || deliveryStatus === '')) {
                        vd.donOKChuaDayDi++;
                    }

                    // Giao Thành Công
                    if (deliveryStatus.includes('thành công') || deliveryStatus.includes('thanh cong') || deliveryStatus.includes('đã giao') || deliveryStatus.includes('da giao')) {
                        vd.giaoThanhCong.soDon++;
                        vd.giaoThanhCong.thanhTien += amount;
                    }

                    // Đang Giao
                    if (deliveryStatus.includes('đang giao') || deliveryStatus.includes('dang giao') || deliveryStatus.includes('giao hàng')) {
                        vd.dangGiao.soDon++;
                        vd.dangGiao.thanhTien += amount;
                    }

                    // Chưa Giao
                    if (!deliveryStatus || deliveryStatus === '' || deliveryStatus === 'chưa giao' || deliveryStatus === 'chua giao') {
                        vd.chuaGiao.soDon++;
                        vd.chuaGiao.thanhTien += amount;
                    }

                    // chờ check (check_result null hoặc rỗng)
                    if (!checkResult || checkResult === '') {
                        vd.choCheck.soDon++;
                        vd.choCheck.thanhTien += amount;
                    }

                    // Trống trạng thái (delivery_status và payment_status đều null/rỗng)
                    if ((!deliveryStatus || deliveryStatus === '') && (!paymentStatus || paymentStatus === '')) {
                        vd.trongTrangThai.soDon++;
                        vd.trongTrangThai.thanhTien += amount;
                    }
                });

                // Convert to array and calculate tỷ lệ
                const vanDonData = Object.values(vanDonByPersonnel).map(vd => {
                    const tyLeDonLenVanHanh = vd.tongDonLenNoiBo > 0 ? (vd.tongDonDuDkienDayVh / vd.tongDonLenNoiBo) : 0;
                    const tyLeThuTienGiaoThanhCong = vd.giaoThanhCong.soDon > 0 ? (vd.daThanhToanCoBill.thanhTien / vd.giaoThanhCong.thanhTien) : 0;
                    const tyLeTTThanhCongDonTinhPhi = (vd.daThanhToanCoBill.soDon + vd.billMotPhan.soDon) > 0 ? (vd.daThanhToanCoBill.soDon / (vd.daThanhToanCoBill.soDon + vd.billMotPhan.soDon)) : 0;
                    return {
                        ...vd,
                        tyLeDonLenVanHanh,
                        tyLeThuTienGiaoThanhCong,
                        tyLeTTThanhCongDonTinhPhi
                    };
                }).sort((a, b) => a.team.localeCompare(b.team) || b.daThanhToanCoBill.soDon - a.daThanhToanCoBill.soDon || a.name.localeCompare(b.name));

                // Calculate total
                const vanDonTotal = vanDonData.reduce((acc, item) => {
                    acc.daThanhToanCoBill.soDon += item.daThanhToanCoBill.soDon;
                    acc.daThanhToanCoBill.thanhTien += item.daThanhToanCoBill.thanhTien;
                    acc.billMotPhan.soDon += item.billMotPhan.soDon;
                    acc.billMotPhan.thanhTien += item.billMotPhan.thanhTien;
                    acc.tongDonLenNoiBo += item.tongDonLenNoiBo;
                    acc.tongDonDuDkienDayVh += item.tongDonDuDkienDayVh;
                    acc.hoanVanHanh.soDon += item.hoanVanHanh.soDon;
                    acc.hoanVanHanh.thanhTien += item.hoanVanHanh.thanhTien;
                    acc.tongDonLenVanHanhChuaMa += item.tongDonLenVanHanhChuaMa;
                    acc.donOKChuaDayDi += item.donOKChuaDayDi;
                    acc.giaoThanhCong.soDon += item.giaoThanhCong.soDon;
                    acc.giaoThanhCong.thanhTien += item.giaoThanhCong.thanhTien;
                    acc.dangGiao.soDon += item.dangGiao.soDon;
                    acc.dangGiao.thanhTien += item.dangGiao.thanhTien;
                    acc.chuaGiao.soDon += item.chuaGiao.soDon;
                    acc.chuaGiao.thanhTien += item.chuaGiao.thanhTien;
                    acc.choCheck.soDon += item.choCheck.soDon;
                    acc.choCheck.thanhTien += item.choCheck.thanhTien;
                    acc.trongTrangThai.soDon += item.trongTrangThai.soDon;
                    acc.trongTrangThai.thanhTien += item.trongTrangThai.thanhTien;
                    return acc;
                }, {
                    daThanhToanCoBill: { soDon: 0, thanhTien: 0 },
                    billMotPhan: { soDon: 0, thanhTien: 0 },
                    tongDonLenNoiBo: 0,
                    tongDonDuDkienDayVh: 0,
                    hoanVanHanh: { soDon: 0, thanhTien: 0 },
                    tongDonLenVanHanhChuaMa: 0,
                    donOKChuaDayDi: 0,
                    giaoThanhCong: { soDon: 0, thanhTien: 0 },
                    dangGiao: { soDon: 0, thanhTien: 0 },
                    chuaGiao: { soDon: 0, thanhTien: 0 },
                    choCheck: { soDon: 0, thanhTien: 0 },
                    trongTrangThai: { soDon: 0, thanhTien: 0 }
                });

                vanDonTotal.tyLeDonLenVanHanh = vanDonTotal.tongDonLenNoiBo > 0 ? (vanDonTotal.tongDonDuDkienDayVh / vanDonTotal.tongDonLenNoiBo) : 0;
                vanDonTotal.tyLeThuTienGiaoThanhCong = vanDonTotal.giaoThanhCong.soDon > 0 ? (vanDonTotal.daThanhToanCoBill.thanhTien / vanDonTotal.giaoThanhCong.thanhTien) : 0;
                vanDonTotal.tyLeTTThanhCongDonTinhPhi = (vanDonTotal.daThanhToanCoBill.soDon + vanDonTotal.billMotPhan.soDon) > 0 ? (vanDonTotal.daThanhToanCoBill.soDon / (vanDonTotal.daThanhToanCoBill.soDon + vanDonTotal.billMotPhan.soDon)) : 0;

                setVanDonReportData({ vanDonData, vanDonTotal });
            } catch (err) {
                console.error('❌ Error calculating Vận đơn report:', err);
                setVanDonReportData({ vanDonData: [], vanDonTotal: null });
            } finally {
                setVanDonLoading(false);
            }
        };

        calculateVanDon();
    }, [activeTab, filters.startDate, filters.endDate, kpiFilters]);

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
                        <input type="date" value={filters.startDate} onChange={e => handleDateFilterChange('startDate', e.target.value)} />
                    </label>
                    <label>
                        Đến ngày:
                        <input type="date" value={filters.endDate} onChange={e => handleDateFilterChange('endDate', e.target.value)} />
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

                    {/* Shift Filter - Đã bỏ vì tất cả đều tự động là "Hết ca" */}

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
                            {/* Chỉ Admin mới thấy nút xóa (không bao gồm Finance) */}
                            {isAdminOnly && (
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
                            )}
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
                                                        <td className="total-label" colSpan={4}>TỔNG NGÀY {dayItem.date}</td>
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
                        {kpiLoading && <div className="loading-overlay">Đang tải dữ liệu KPIs...</div>}

                        {/* KPI Filters */}
                        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                            <h3 style={{ marginBottom: '15px', color: '#2d5016' }}>Chỉ số vận đơn của MKT</h3>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '15px' }}>
                                <div>
                                    <label>Bộ lọc nhanh:</label>
                                    <select style={{ width: '100%', padding: '5px' }}>
                                        <option>Tất cả</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Từ ngày:</label>
                                    <input
                                        type="date"
                                        value={filters.startDate}
                                        onChange={e => handleDateFilterChange('startDate', e.target.value)}
                                        style={{ width: '100%', padding: '5px' }}
                                    />
                                </div>
                                <div>
                                    <label>Đến ngày:</label>
                                    <input
                                        type="date"
                                        value={filters.endDate}
                                        onChange={e => handleDateFilterChange('endDate', e.target.value)}
                                        style={{ width: '100%', padding: '5px' }}
                                    />
                                </div>
                                <div>
                                    <label>Team:</label>
                                    <select
                                        style={{ width: '100%', padding: '5px' }}
                                        multiple
                                        value={kpiFilters.teams}
                                        onChange={e => {
                                            const selected = Array.from(e.target.selectedOptions, option => option.value);
                                            setKpiFilters({ ...kpiFilters, teams: selected });
                                        }}
                                    >
                                        <option value="">Tất cả</option>
                                        {options.teams.map(team => (
                                            <option key={team} value={team}>{team}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label>Tìm tên:</label>
                                    <select
                                        style={{ width: '100%', padding: '5px' }}
                                        multiple
                                        value={kpiFilters.personnel}
                                        onChange={e => {
                                            const selected = Array.from(e.target.selectedOptions, option => option.value);
                                            setKpiFilters({ ...kpiFilters, personnel: selected });
                                        }}
                                    >
                                        <option value="">Tất cả</option>
                                        {summaryList.map(item => (
                                            <option key={item.name} value={item.name}>{item.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label>Sản phẩm:</label>
                                    <select
                                        style={{ width: '100%', padding: '5px' }}
                                        multiple
                                        value={kpiFilters.products}
                                        onChange={e => {
                                            const selected = Array.from(e.target.selectedOptions, option => option.value);
                                            setKpiFilters({ ...kpiFilters, products: selected });
                                        }}
                                    >
                                        <option value="">Tất cả</option>
                                        {options.products.map(product => (
                                            <option key={product} value={product}>{product}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label>Thị trường:</label>
                                    <select
                                        style={{ width: '100%', padding: '5px' }}
                                        multiple
                                        value={kpiFilters.markets}
                                        onChange={e => {
                                            const selected = Array.from(e.target.selectedOptions, option => option.value);
                                            setKpiFilters({ ...kpiFilters, markets: selected });
                                        }}
                                    >
                                        <option value="">Tất cả</option>
                                        {options.markets.map(market => (
                                            <option key={market} value={market}>{market}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label>Chi nhánh:</label>
                                    <select
                                        style={{ width: '100%', padding: '5px' }}
                                        multiple
                                        value={kpiFilters.branches}
                                        onChange={e => {
                                            const selected = Array.from(e.target.selectedOptions, option => option.value);
                                            setKpiFilters({ ...kpiFilters, branches: selected });
                                        }}
                                    >
                                        <option value="">Tất cả</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <input
                                        type="checkbox"
                                        checked={kpiFilters.includeShipZero}
                                        onChange={e => setKpiFilters({ ...kpiFilters, includeShipZero: e.target.checked })}
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
                                    style={{ padding: '8px 15px', backgroundColor: '#2d5016', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    Hiện tất cả
                                </button>
                                <button
                                    onClick={() => {
                                        // Trigger recalculation
                                        setKpiFilters({ ...kpiFilters });
                                    }}
                                    style={{ padding: '8px 15px', backgroundColor: '#2d5016', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    Làm mới
                                </button>
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
                        {vanDonLoading && <div className="loading-overlay">Đang tải dữ liệu Vận đơn...</div>}

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
