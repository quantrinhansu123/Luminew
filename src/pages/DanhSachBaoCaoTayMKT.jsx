import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import usePermissions from '../hooks/usePermissions';
import {
    buildMktDetailReportRowKey,
    recalcMktSoDonThucTeFromOrders,
} from '../services/mktRecalcSoDonThucTeFromOrders';
import { supabase } from '../supabase/config';
import * as rbacService from '../services/rbacService';
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

const normalizePersonName = (s) =>
    String(s || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

/** Phạm vi `detail_reports` (HN): MKT/null/non-RD + team Test. Không dùng cho `marketing_report_hcm` — bảng HCM không cùng schema department / trang xem legacy chỉ lọc Team. */
const MKT_DETAIL_REPORTS_SCOPE_OR =
    'department.is.null,department.eq.MKT,department.neq.RD,Team.ilike.test';

export default function DanhSachBaoCaoTayMKT({
    reportTableName = 'detail_reports',
    pageTitleSuffix = '',
} = {}) {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // 'RD' or null

    // Permission Logic
    const { canView, canDelete, role, team: userTeam, permissions } = usePermissions();
    const isHcmMarketingReport = reportTableName === 'marketing_report_hcm';
    const permissionCode =
        teamFilter === 'RD' ? 'RND_MANUAL' : isHcmMarketingReport ? 'MKT_MANUAL_HCM' : 'MKT_MANUAL';
    
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
    
    // Chỉ Admin thực sự (không bao gồm Finance) mới có quyền đồng bộ và xóa toàn bộ
    const isAdminOnly = roleFromHookLower === 'admin' ||
                        roleFromHookLower === 'super_admin' ||
                        roleFromStorage === 'admin' ||
                        roleFromStorage === 'super_admin' ||
                        roleFromUserObj === 'admin' ||
                        roleFromUserObj === 'super_admin';
    
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

    const [loading, setLoading] = useState(true);
    const [manualReports, setManualReports] = useState([]);
    const [allReports, setAllReports] = useState([]); // Store all filtered reports for pagination
    const [realValuesMap, setRealValuesMap] = useState({}); // Map report ID to real values
    const [calculatingRealValues, setCalculatingRealValues] = useState(false);
    const [deletingId, setDeletingId] = useState(null); // Track which report is being deleted
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        personnelNames: [],
        shifts: [],
        teams: [],
        products: [],
        markets: []
    });
    const [personnelSearch, setPersonnelSearch] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [syncingTeamHanoi, setSyncingTeamHanoi] = useState(false);
    const [syncingTeamFromUsers, setSyncingTeamFromUsers] = useState(false);
    const [fixingUsThiTruong, setFixingUsThiTruong] = useState(false);
    const [mktRecalcLoading, setMktRecalcLoading] = useState(false);
    const [deletingDupKeys, setDeletingDupKeys] = useState(false);
    const [deleting, setDeleting] = useState(false);
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);

    // Sorting state for table headers
    // sortColumn uses keys that map to properties on report rows.
    const [sortColumn, setSortColumn] = useState('Ngày');
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'

    const handleSort = (columnKey) => {
        if (sortColumn === columnKey) {
            setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumn(columnKey);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    };

    // Edit State
    const [editingReport, setEditingReport] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);

    // Map tên nhân sự -> email (lấy từ bảng nhân sự)
    const [hrEmailMap, setHrEmailMap] = useState({});
    
    // Selected personnel names (từ cột selected_personnel trong users table)
    const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]);

    /** HCM: đơn từ Supabase `order_code_hcm` (khớp recalc Số đơn TT). */
    const ordersTableForMktTotals = isHcmMarketingReport ? 'order_code_hcm' : 'orders';

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
                
                console.log('📝 [DanhSachBaoCaoTayMKT] Valid personnel names:', validNames);
                setSelectedPersonnelNames(validNames);
            } catch (error) {
                console.error('❌ [DanhSachBaoCaoTayMKT] Error loading selected personnel:', error);
                setSelectedPersonnelNames([]);
            }
        };

        loadSelectedPersonnel();
    }, [userEmail]);

    // Initialize Dates
    useEffect(() => {
        const today = new Date();
        const d = new Date();
        d.setDate(d.getDate() - 30); // Last 30 days instead of 3
        const formatDateForInput = (date) => date.toISOString().split('T')[0];

        setFilters(prev => ({
            ...prev,
            startDate: formatDateForInput(d),
            endDate: formatDateForInput(today)
        }));
    }, []);

    // Calculate real values from orders table for a single report
    const calculateRealValues = async (report) => {
        try {
            const reportDate = report['Ngày'];
            const reportName = report['Tên'];
            const reportCa = report['ca'];
            const reportProduct = report['Sản_phẩm'];
            const reportMarket = report['Thị_trường'];

            if (!reportDate || !reportName) {
                return {
                    so_don_thuc_te: 0,
                    doanh_so_thuc_te: 0
                };
            }

            // Build query - chỉ select các cột cần thiết để tăng tốc
            let query = supabase
                .from(ordersTableForMktTotals)
                .select('total_amount_vnd, total_vnd') // Chỉ select cột cần thiết
                .eq('order_date', reportDate)
                .ilike('marketing_staff', `%${reportName}%`);

            // Filter by shift/ca
            const caValue = String(reportCa || '').trim();
            
            if (caValue === 'Hết ca' || caValue.toLowerCase() === 'hết ca') {
                query = query.ilike('shift', '%Hết ca%');
            } else if (caValue === 'Giữa ca' || caValue.toLowerCase() === 'giữa ca') {
                query = query.or('shift.ilike.%Giữa ca%,shift.ilike.%giữa ca%');
            } else if (caValue) {
                query = query.ilike('shift', `%${caValue}%`);
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
                    so_don_thuc_te: 0,
                    doanh_so_thuc_te: 0
                };
            }

            if (!orders || orders.length === 0) {
                return {
                    so_don_thuc_te: 0,
                    doanh_so_thuc_te: 0
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
                so_don_thuc_te: totalOrders,
                doanh_so_thuc_te: doanhSoThucTe
            };
        } catch (error) {
            console.error('Error calculating real values:', error);
            return {
                so_don_thuc_te: 0,
                doanh_so_thuc_te: 0
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
            
            // Merge để cho phép tính "giá trị thực tế" theo từng trang (lazy)
            // thay vì reset toàn bộ mỗi lần tính.
            setRealValuesMap(prev => ({ ...prev, ...valuesMap }));
            console.log(`✅ Calculated real values for ${reports.length} reports (parallel)`);
        } catch (error) {
            console.error('Error calculating real values for reports:', error);
        } finally {
            setCalculatingRealValues(false);
        }
    };

    // Fetch toàn bộ rows khớp bộ lọc bằng cách phân trang phía DB (range),
    // tránh việc query bị giới hạn cứng (ví dụ `limit(50)`) làm thiếu dòng khi user lọc.
    const fetchDetailReportsAllPages = async (startDate, endDate) => {
        const PAGE_SIZE = 500;
        let from = 0;
        const rows = [];

        const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

        while (true) {
            let query = supabase
                .from(reportTableName)
                .select('*');

            // Date filter (nếu có)
            if (startDate && endDate) {
                query = query
                    .gte('Ngày', startDate)
                    .lte('Ngày', endDate);
            }

            // Department filter — chỉ cho detail_reports (HN). marketing_report_hcm: không lọc department (khớp nguồn legacy / tránh cột không tồn tại).
            if (teamFilter === 'RD') {
                query = query.eq('department', 'RD');
            } else if (!isHcmMarketingReport) {
                query = query.or(MKT_DETAIL_REPORTS_SCOPE_OR);
            }

            // Personnel filter (non-admin chỉ xem theo selected_personnel)
            if (!isAdmin) {
                if (selectedPersonnelNames && selectedPersonnelNames.length > 0) {
                    const normalizeNameForQuery = (str) => {
                        if (!str) return '';
                        return String(str).trim().replace(/\s+/g, ' ');
                    };

                    const orConditions = selectedPersonnelNames
                        .filter(name => name && name.trim().length > 0)
                        .map(name => {
                            const normalizedName = normalizeNameForQuery(name);
                            return `Tên.ilike.%${normalizedName}%`;
                        });

                    if (orConditions.length > 0) {
                        query = query.or(orConditions.join(','));
                    } else {
                        // Không có tên hợp lệ -> không trả data nào
                        query = query.eq('id', EMPTY_GUID);
                    }
                } else {
                    query = query.eq('id', EMPTY_GUID);
                }
            }

            // Stable-ish ordering + pagination chunk
            query = query
                .order('Ngày', { ascending: false })
                // Tie-break để range() không bị "nhảy" khi nhiều dòng có cùng 'Ngày'
                .order('id', { ascending: false })
                .range(from, from + PAGE_SIZE - 1);

            const { data, error } = await query;
            if (error) throw error;

            const chunk = data || [];
            rows.push(...chunk);

            if (chunk.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
        }

        return rows;
    };

    // Fetch all data (no date filter) trực tiếp từ bảng
    const fetchAllData = async () => {
        setLoading(true);
        try {
            console.log('🔍 Fetching ALL data from detail_reports...');

            // Lấy trực tiếp từ bảng detail_reports (giới hạn 50 records)
            let query = supabase
                .from(reportTableName)
                .select('*')
                .limit(50);

            // Filter theo department — chỉ detail_reports (HN)
            if (teamFilter === 'RD') {
                query = query.eq('department', 'RD');
                console.log('📋 Filter: department = RD');
            } else if (!isHcmMarketingReport) {
                query = query.or(MKT_DETAIL_REPORTS_SCOPE_OR);
                console.log('📋 Filter: MKT scope (incl. Team=test)');
            } else {
                console.log('📋 HCM: không lọc department — toàn bộ marketing_report_hcm (theo RLS + lọc nhân sự)');
            }

            // Admin: xem tất cả data, không filter theo selected_personnel
            // Người khác: chỉ xem data của mình dựa trên selected_personnel
            if (!isAdmin) {
                // Filter theo selected_personnel nếu có
                if (selectedPersonnelNames && selectedPersonnelNames.length > 0) {
                    console.log('📋 Filter: Tên trong selected_personnel:', selectedPersonnelNames);
                    
                    // Helper function to normalize name (remove extra spaces)
                    const normalizeNameForQuery = (str) => {
                        if (!str) return '';
                        return String(str).trim().replace(/\s+/g, ' ');
                    };

                    // Tạo OR conditions cho mỗi tên trong selectedPersonnelNames
                    const orConditions = selectedPersonnelNames
                        .filter(name => name && name.trim().length > 0)
                        .map(name => {
                            const normalizedName = normalizeNameForQuery(name);
                            return `Tên.ilike.%${normalizedName}%`;
                        });
                    
                    if (orConditions.length > 0) {
                        query = query.or(orConditions.join(','));
                        console.log('✅ Applied filter for selected personnel:', orConditions.length, 'names');
                    } else {
                        // Không có tên hợp lệ -> không trả về data nào
                        console.warn('⚠️ No valid names in selectedPersonnelNames, returning empty result');
                        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
                    }
                } else {
                    console.log('ℹ️ No selectedPersonnelNames, returning empty result (non-admin)');
                    query = query.eq('id', '00000000-0000-0000-0000-000000000000');
                }
            } else if (isAdmin) {
                console.log('✅ Admin: Viewing all data (no selected_personnel filter applied)');
            }

            const { data, error } = await query.order('Ngày', { ascending: false });

            if (error) throw error;

            console.log(`✅ Fetched ${data?.length || 0} records (all data)`);
            
            // Bổ sung Email nhân viên từ bảng nhân sự nếu thiếu
            const enrichedData = (data || []).map(item => {
                const currentEmail = (item['Email'] || '').trim();
                const nameKey = (item['Tên'] || '').toLowerCase().trim();
                const hrEmail = hrEmailMap[nameKey];

                if (!currentEmail && hrEmail) {
                    return { ...item, 'Email': hrEmail };
                }
                return item;
            });
            
            setAllReports(enrichedData); // Store all filtered data
            setCurrentPage(1); // Reset to first page
            
            // Calculate real values for all reports
            await calculateRealValuesForReports(enrichedData);
            
            if (enrichedData.length === 0) {
                console.warn('⚠️ Không có dữ liệu nào trong bảng detail_reports');
                console.warn('⚠️ Có thể do: 1) Bảng trống, 2) RLS policy chặn, hoặc 3) Không có data trong khoảng thời gian này');
            } else {
                console.log(`✅ Đã tải ${enrichedData.length} bản ghi`);
            }
        } catch (error) {
            console.error('❌ Error fetching all data:', error);
            alert(`Lỗi khi tải dữ liệu: ${error.message || String(error)}`);
            setManualReports([]);
            setAllReports([]);
        } finally {
            setLoading(false);
        }
    };

    // Fetch Data trực tiếp từ bảng detail_reports
    const fetchData = async () => {
        if (!filters.startDate || !filters.endDate) return;
        setLoading(true);
        try {
            console.log('🔍 Fetching data from detail_reports...', {
                startDate: filters.startDate,
                endDate: filters.endDate,
                teamFilter,
                role,
                userTeam,
                userName
            });

            console.log('🔍 Fetching ALL pages (no hard limit) from detail_reports...');
            const data = await fetchDetailReportsAllPages(filters.startDate, filters.endDate);
            console.log(`✅ Fetched ${data?.length || 0} records from detail_reports`);
            
            // Debug: Log sample data if available
            if (data && data.length > 0) {
                console.log('📊 Sample record:', data[0]);
                console.log('📊 Department values:', [...new Set(data.map(d => d.department))]);
            } else {
                console.warn('⚠️ No data returned from query');
                
                // Try to fetch without filters to see if data exists
                const { data: allData, error: allError } = await supabase
                    .from(reportTableName)
                    .select('id, "Ngày", "Tên", department, "Team"')
                    .limit(5);
                
                if (!allError && allData) {
                    console.log('🔍 Sample data in table (first 5):', allData);
                    console.log('🔍 Department values in table:', [...new Set(allData.map(d => d.department))]);
                }
            }

            // Bổ sung Email nhân viên từ bảng nhân sự (human_resources) nếu thiếu
            const enrichedData = (data || []).map(item => {
                const currentEmail = (item['Email'] || '').trim();
                const nameKey = (item['Tên'] || '').toLowerCase().trim();
                const hrEmail = hrEmailMap[nameKey];

                if (!currentEmail && hrEmail) {
                    return { ...item, 'Email': hrEmail };
                }
                return item;
            });

            console.log(`📊 Total records: ${enrichedData.length} | role: ${role}, team: ${userTeam}`);

            setAllReports(enrichedData); // Store all data for pagination
            setCurrentPage(1); // Reset to first page when data changes

            // Reset map giá trị thực tế; sẽ được tính "lazy" theo đúng trang user đang xem.
            setRealValuesMap({});
            setCalculatingRealValues(false);
            
            if (enrichedData.length === 0) {
                console.warn('⚠️ No data found');
            }
        } catch (error) {
            console.error('❌ Error fetching MKT reports:', {
                error,
                message: error?.message,
                filters,
            });

            alert(`Lỗi khi tải dữ liệu: ${error?.message || String(error)}`);
            setManualReports([]);
            setAllReports([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Only fetch if we have date filters
        if (filters.startDate && filters.endDate) {
            fetchData();
        }
    }, [filters.startDate, filters.endDate, selectedPersonnelNames]);
    
    // Debug: Test if we can access the table at all
    useEffect(() => {
        const testAccess = async () => {
            try {
                // Try to get count without filters
                const { count, error } = await supabase
                    .from(reportTableName)
                    .select('*', { count: 'exact', head: true });
                
                console.log('🔍 Table access test:', { count, error: error?.message });
                
                if (error) {
                    console.error('❌ Cannot access detail_reports table:', error);
                    console.error('❌ Error details:', {
                        code: error.code,
                        message: error.message,
                        hint: error.hint
                    });
                }
            } catch (err) {
                console.error('❌ Test access error:', err);
            }
        };
        
        testAccess();
    }, []);

    const availablePersonnelOptions = useMemo(
        () => [...new Set((allReports || []).map((item) => String(item?.['Tên'] || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' })),
        [allReports]
    );

    const filteredPersonnelOptions = useMemo(() => {
        const keyword = personnelSearch.trim().toLowerCase();
        if (!keyword) return availablePersonnelOptions;
        return availablePersonnelOptions.filter((name) => name.toLowerCase().includes(keyword));
    }, [availablePersonnelOptions, personnelSearch]);

    const availableShiftOptions = useMemo(
        () => [...new Set((allReports || []).map((item) => String(item?.['ca'] || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' })),
        [allReports]
    );

    const availableTeamOptions = useMemo(
        () => [...new Set((allReports || []).map((item) => String(item?.['Team'] || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' })),
        [allReports]
    );

    const availableProductOptions = useMemo(
        () => [...new Set((allReports || []).map((item) => String(item?.['Sản_phẩm'] || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' })),
        [allReports]
    );

    const availableMarketOptions = useMemo(
        () => [...new Set((allReports || []).map((item) => String(item?.['Thị_trường'] || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' })),
        [allReports]
    );

    const reportsAfterFilters = useMemo(() => {
        const selectedPersonnel = new Set(filters.personnelNames || []);
        const selectedShifts = new Set(filters.shifts || []);
        const selectedTeams = new Set(filters.teams || []);
        const selectedProducts = new Set(filters.products || []);
        const selectedMarkets = new Set(filters.markets || []);

        return (allReports || []).filter((item) => {
            const name = String(item?.['Tên'] || '').trim();
            const shift = String(item?.['ca'] || '').trim();
            const team = String(item?.['Team'] || '').trim();
            const product = String(item?.['Sản_phẩm'] || '').trim();
            const market = String(item?.['Thị_trường'] || '').trim();

            if (selectedPersonnel.size > 0 && !selectedPersonnel.has(name)) return false;
            if (selectedShifts.size > 0 && !selectedShifts.has(shift)) return false;
            if (selectedTeams.size > 0 && !selectedTeams.has(team)) return false;
            if (selectedProducts.size > 0 && !selectedProducts.has(product)) return false;
            if (selectedMarkets.size > 0 && !selectedMarkets.has(market)) return false;
            return true;
        });
    }, [allReports, filters.personnelNames, filters.shifts, filters.teams, filters.products, filters.markets]);

    /** HCM marketing: khớp cột `Tên` với users.name / username → ghi users.team vào `Team` (theo bộ lọc danh sách). */
    const handleSyncTeamFromUsersForMarketing = async () => {
        if (!isAdminOnly || !isHcmMarketingReport) return;
        if (
            !window.confirm(
                'Đồng bộ cột Team từ bảng users?\n\n' +
                    'Áp dụng cho các dòng đang có trong danh sách (theo bộ lọc ngày / nhân sự).\n' +
                    'Khớp tên cột "Tên" với users.name / username (không phân biệt hoa thường, sau khi chuẩn hóa khoảng trắng).'
            )
        ) {
            return;
        }
        if (!reportsAfterFilters.length) {
            alert('Không có dữ liệu trong khoảng đã lọc.');
            return;
        }
        setSyncingTeamFromUsers(true);
        try {
            const { data: users, error: userErr } = await supabase
                .from('users')
                .select('name, username, team');
            if (userErr) throw userErr;

            const nameToTeam = new Map();
            (users || []).forEach((u) => {
                const teamVal = String(u.team ?? '').trim();
                if (!teamVal) return;
                const n = normalizePersonName(u.name);
                const un = normalizePersonName(u.username);
                if (n) nameToTeam.set(n, teamVal);
                if (un) nameToTeam.set(un, teamVal);
            });

            let updated = 0;
            let skippedNoMatch = 0;
            let skippedSame = 0;

            for (const r of reportsAfterFilters) {
                const key = normalizePersonName(r['Tên']);
                const newTeam = nameToTeam.get(key);
                if (!newTeam) {
                    skippedNoMatch += 1;
                    continue;
                }
                const curTeam = String(r['Team'] ?? '').trim();
                if (curTeam === newTeam) {
                    skippedSame += 1;
                    continue;
                }
                const { error: upErr } = await supabase
                    .from(reportTableName)
                    .update({ Team: newTeam })
                    .eq('id', r.id);
                if (upErr) throw upErr;
                updated += 1;
            }

            alert(
                `Đã cập nhật Team: ${updated} dòng.\n` +
                    `Không khớp tên với users (hoặc user không có team): ${skippedNoMatch} dòng.\n` +
                    `Đã khớp, không đổi: ${skippedSame} dòng.`
            );
            fetchData();
        } catch (error) {
            console.error('handleSyncTeamFromUsersForMarketing:', error);
            alert('Lỗi: ' + (error.message || String(error)));
        } finally {
            setSyncingTeamFromUsers(false);
        }
    };

    /** HCM MKT: sửa thị trường gõ nhầm "Us" → "US" trong marketing_report_hcm. */
    const handleFixUsThiTruongToUS = async () => {
        if (!isAdminOnly || !isHcmMarketingReport) return;
        if (
            !window.confirm(
                'Đổi cột Thị trường (Thị_trường) từ "Us" sang "US" trong bảng marketing_report_hcm?\n\n' +
                    'Chỉ các dòng có giá trị chính xác "Us". Tiếp tục?'
            )
        ) {
            return;
        }
        setFixingUsThiTruong(true);
        try {
            const { data, error } = await supabase
                .from(reportTableName)
                .update({ Thị_trường: 'US' })
                .eq('Thị_trường', 'Us')
                .select('id');
            if (error) throw error;
            const n = Array.isArray(data) ? data.length : 0;
            toast.success(`Đã cập nhật ${n} dòng: Us → US (thị trường).`);
            fetchData();
        } catch (error) {
            console.error('handleFixUsThiTruongToUS:', error);
            toast.error('Lỗi đổi Us → US: ' + (error.message || String(error)));
        } finally {
            setFixingUsThiTruong(false);
        }
    };

    /**
     * Xóa bản ghi trùng cùng key logic MKT (Ngày + Tên + Sản phẩm + Thị trường + ca — khớp buildMktDetailReportRowKey).
     * Giữ một dòng (id nhỏ nhất), gộp CPQC & Số_Mess_Cmt (cộng), Số đơn & Doanh số (max), rồi xóa các id còn lại.
     * Chỉ xử lý dữ liệu đang hiển thị sau bộ lọc danh sách.
     */
    const handleDeleteDuplicateMktKeys = async () => {
        if (!isAdminOnly || teamFilter === 'RD') return;
        if (deletingDupKeys) return;

        const rows = reportsAfterFilters || [];
        if (!rows.length) {
            alert('Không có dữ liệu trong khoảng đã lọc.');
            return;
        }

        const byKey = new Map();
        for (const r of rows) {
            const k = buildMktDetailReportRowKey(r);
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push(r);
        }

        const dupGroups = [...byKey.entries()].filter(([, list]) => list.length > 1);
        if (dupGroups.length === 0) {
            toast.info('Không có dòng trùng key trong danh sách đã lọc.');
            return;
        }

        let totalRemove = 0;
        for (const [, list] of dupGroups) {
            totalRemove += list.length - 1;
        }

        const ok = window.confirm(
            `Tìm thấy ${dupGroups.length} nhóm trùng key (${totalRemove} dòng sẽ xóa).\n\n` +
                'Key = Ngày + Tên + Sản phẩm + Thị trường + ca (chuẩn hóa giống tính Số đơn TT).\n' +
                'Giữ 1 dòng / nhóm (id nhỏ nhất), gộp CPQC & Số mess (cộng dồn), Số đơn & Doanh số (lấy max).\n\n' +
                'Chỉ áp dụng cho dữ liệu đang lọc trên màn hình. Tiếp tục?'
        );
        if (!ok) return;

        setDeletingDupKeys(true);
        try {
            let updatedRows = 0;
            let deletedRows = 0;

            const chunk = (arr, size) => {
                const out = [];
                for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
                return out;
            };

            for (const [, list] of dupGroups) {
                const withId = list.filter((r) => r && r.id);
                if (withId.length < 2) continue;

                withId.sort((a, b) => String(a.id).localeCompare(String(b.id)));
                const keeper = withId[0];
                const rest = withId.slice(1);

                let cpqc = 0;
                let mess = 0;
                let soDon = 0;
                let doanhSo = 0;
                for (const r of withId) {
                    cpqc += Number(r['CPQC'] || 0);
                    mess += Number(r['Số_Mess_Cmt'] || 0);
                    soDon = Math.max(soDon, Number(r['Số đơn'] || 0));
                    doanhSo = Math.max(doanhSo, Number(r['Doanh số'] || 0));
                }

                const { error: upErr } = await supabase
                    .from(reportTableName)
                    .update({
                        CPQC: cpqc,
                        Số_Mess_Cmt: mess,
                        'Số đơn': soDon,
                        'Doanh số': doanhSo,
                    })
                    .eq('id', keeper.id);

                if (upErr) throw upErr;
                updatedRows += 1;

                const idsToDelete = rest.map((r) => r.id);
                for (const part of chunk(idsToDelete, 80)) {
                    const { error: delErr } = await supabase.from(reportTableName).delete().in('id', part);
                    if (delErr) throw delErr;
                    deletedRows += part.length;
                }
            }

            toast.success(`Đã gộp & xóa trùng key: ${updatedRows} dòng giữ lại (đã cập nhật số liệu), ${deletedRows} dòng đã xóa.`);
            setRealValuesMap({});
            fetchData();
        } catch (error) {
            console.error('handleDeleteDuplicateMktKeys:', error);
            toast.error('Lỗi xóa trùng key: ' + (error.message || String(error)));
        } finally {
            setDeletingDupKeys(false);
        }
    };

    // Apply sorting (before pagination)
    const sortedReports = useMemo(() => {
        const rows = [...(reportsAfterFilters || [])];
        const dir = sortDirection === 'asc' ? 1 : -1;

        const getSortValue = (item) => {
            if (!item) return '';
            if (sortColumn === 'Ngày') {
                const t = new Date(item?.['Ngày']).getTime();
                return Number.isNaN(t) ? 0 : t;
            }

            if (sortColumn === 'Số đơn') {
                const id = item?.id;
                if (id && realValuesMap?.[id]) return Number(realValuesMap[id]?.so_don_thuc_te || 0);
                return Number(item?.['Số đơn'] || 0);
            }

            if (sortColumn === 'Doanh số') {
                const id = item?.id;
                if (id && realValuesMap?.[id]) return Number(realValuesMap[id]?.doanh_so_thuc_te || 0);
                return Number(item?.['Doanh số'] || 0);
            }

            // Numeric columns
            if (sortColumn === 'CPQC' || sortColumn === 'Số_Mess_Cmt') {
                return Number(item?.[sortColumn] || 0);
            }

            // Default: treat as text
            return String(item?.[sortColumn] ?? '').trim();
        };

        rows.sort((a, b) => {
            const va = getSortValue(a);
            const vb = getSortValue(b);

            let cmp = 0;
            if (typeof va === 'number' && typeof vb === 'number') {
                cmp = va - vb;
            } else {
                cmp = String(va).localeCompare(String(vb), 'vi', { sensitivity: 'base', numeric: true });
            }

            // Tie-break to keep ordering deterministic
            if (cmp === 0) {
                cmp = String(a?.id ?? '').localeCompare(String(b?.id ?? ''), 'vi', { sensitivity: 'base', numeric: true });
            }

            return cmp * dir;
        });

        return rows;
    }, [reportsAfterFilters, sortColumn, sortDirection, realValuesMap]);

    // Tổng kết theo toàn bộ dữ liệu đã lọc (không phụ thuộc phân trang)
    const totalsByFiltered = useMemo(() => {
        const rows = reportsAfterFilters || [];
        const cpqc = rows.reduce((s, r) => s + Number(r?.['CPQC'] || 0), 0);
        const mess = rows.reduce((s, r) => s + Number(r?.['Số_Mess_Cmt'] || 0), 0);

        // Cùng key (Ngày+Tên+SP+TT+ca) có thể có 2 dòng trùng trong DB — mỗi dòng đều query orders → cùng Số đơn.
        // Tổng cộng chỉ cộng Số đơn / Doanh số thực tế MỘT LẦN / key (lấy max nếu một dòng chưa kịp tính realValues).
        const byDetailKey = new Map();
        for (const r of rows) {
            const k = buildMktDetailReportRowKey(r);
            const realValues = r && r.id && realValuesMap[r.id] ? realValuesMap[r.id] : null;
            const sd = Number(realValues?.so_don_thuc_te || 0);
            const ds = Number(realValues?.doanh_so_thuc_te || 0);
            const prev = byDetailKey.get(k);
            if (!prev) {
                byDetailKey.set(k, { sd, ds });
            } else {
                byDetailKey.set(k, {
                    sd: Math.max(prev.sd, sd),
                    ds: Math.max(prev.ds, ds),
                });
            }
        }
        let soDon = 0;
        let doanhSo = 0;
        for (const { sd, ds } of byDetailKey.values()) {
            soDon += sd;
            doanhSo += ds;
        }

        return { cpqc, mess, soDon, doanhSo };
    }, [reportsAfterFilters, realValuesMap]);

    // If user sorts by derived real values, try to calculate missing realValues for all filtered rows.
    useEffect(() => {
        const shouldSortByReal = sortColumn === 'Số đơn' || sortColumn === 'Doanh số';
        if (!shouldSortByReal) return;
        if (!reportsAfterFilters || reportsAfterFilters.length === 0) return;

        const missingReports = reportsAfterFilters.filter(r => {
            const id = r?.id;
            if (!id) return false;
            return realValuesMap?.[id] == null;
        });

        if (missingReports.length === 0) return;
        if (calculatingRealValues) return;

        calculateRealValuesForReports(missingReports);
    }, [sortColumn, reportsAfterFilters, realValuesMap, calculatingRealValues]);

    // Calculate pagination
    const totalPages = Math.ceil(sortedReports.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedReports = sortedReports.slice(startIndex, endIndex);

    // Update displayed reports when pagination changes
    useEffect(() => {
        setManualReports(paginatedReports);
    }, [currentPage, itemsPerPage, sortedReports]);

    // Lazy tính giá trị thực tế cho các dòng đang hiển thị (tránh tính cho toàn bộ khi dữ liệu lớn).
    useEffect(() => {
        if (!paginatedReports || paginatedReports.length === 0) return;
        if (calculatingRealValues) return;

        const missingReports = paginatedReports.filter(r => {
            const id = r?.id;
            if (!id) return false;
            return realValuesMap[id] == null;
        });

        if (missingReports.length === 0) return;
        calculateRealValuesForReports(missingReports);
    }, [paginatedReports, realValuesMap, calculatingRealValues]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters.personnelNames, filters.shifts, filters.teams, filters.products, filters.markets, sortColumn, sortDirection]);

    // Sync data from Firebase Báo cáo MKT via backend API (bypasses RLS)
    const handleSyncMKT = async () => {
        if (!window.confirm("Bạn có chắc chắn muốn đồng bộ dữ liệu từ Firebase Báo cáo MKT về Supabase?\n\nLưu ý: Chỉ thêm dữ liệu MỚI (chưa có), KHÔNG ghi đè dữ liệu đã tồn tại.")) return;

        try {
            setSyncing(true);
            
            // Call backend API which uses service role key to bypass RLS
            const response = await fetch('/api/sync-mkt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Lỗi không xác định');
            }

            const message = `Đồng bộ hoàn tất!\nThành công: ${result.successCount} bản ghi\nLỗi: ${result.errorCount} bản ghi`;
            if (result.errorCount > 0 && result.error) {
                alert(message + `\n\nLỗi: ${result.error}`);
            } else {
                alert(message);
            }

            // Refresh data after sync
            fetchData();

        } catch (error) {
            console.error("Sync error:", error);
            const errorMsg = error.message || String(error);
            alert("Lỗi khi đồng bộ: " + errorMsg);
        } finally {
            setSyncing(false);
        }
    };

    /** Cập nhật Số đơn TT / Doanh số TT trên detail_reports từ orders (cùng logic Admin Tools). */
    const handleRecalcMktSoDonTT = async () => {
        if (mktRecalcLoading) return;
        if (teamFilter === 'RD') return;

        const orderSourceHint = isHcmMarketingReport
            ? 'Báo cáo: Supabase `marketing_report_hcm`. Nguồn đơn: Supabase `order_code_hcm` (không gọi API ngoài).\n\n'
            : 'Nguồn đơn: bảng Supabase `orders`.\n\n';
        const ok = window.confirm(
            'Tính lại cho Báo cáo MKT: Số đơn thực tế, Doanh số TT (đã trừ đơn/VND hủy), đơn/DS hoàn hủy thực tế — Key match đơn ↔ báo cáo.\n\n' +
                orderSourceHint +
                'Đơn hủy (đếm + DS hủy): Kết quả Check = Hủy (check_result).\n\n' +
                'Email/Team trên dòng đang trống sẽ tự điền từ users (theo tên+email), sau đó human_resources nếu cần.\n\n' +
                'Thao tác sẽ cập nhật các dòng hiện có; ca trống → ghi «Hết ca»; thiếu SP/thị trường mà đơn trong khoảng chỉ có một cặp SP+TT khớp ngày+tên thì tự điền; thiếu hẳn dòng (key + ca) sẽ tạo mới từ đơn.\n\n' +
                `Khoảng ngày: ${filters.startDate} → ${filters.endDate} (theo bộ lọc trái).\n\n` +
                'Bạn có chắc muốn chạy không?'
        );
        if (!ok) return;

        const normStart = String(filters.startDate || '').trim();
        const normEnd = String(filters.endDate || '').trim();
        if (!normStart || !normEnd) {
            alert('Vui lòng chọn đầy đủ Từ ngày và Đến ngày trong bộ lọc.');
            return;
        }
        if (normStart > normEnd) {
            alert('Từ ngày phải ≤ Đến ngày.');
            return;
        }

        try {
            setMktRecalcLoading(true);
            toast.info('Đang cập nhật Số đơn TT (Báo cáo MKT)...', { autoClose: false });

            const result = await recalcMktSoDonThucTeFromOrders({
                startDate: normStart,
                endDate: normEnd,
                createMissingRows: true,
                reportsTableName: reportTableName,
                ordersSupabaseTable: isHcmMarketingReport ? 'order_code_hcm' : null,
                ordersApiPath: null,
            });

            toast.dismiss();
            const nUpd = result.updatedExisting ?? 0;
            const nNew = result.createdMissing ?? 0;
            toast.success(
                `Hoàn tất: cập nhật ${nUpd} dòng, tạo mới ${nNew} dòng (tổng ${result.upserted || 0}).`
            );
            setRealValuesMap({});
            await fetchData();
        } catch (error) {
            console.error('Recalc MKT error:', error);
            toast.dismiss();
            const msg = error?.message || String(error);
            const fetchHint = /failed to fetch/i.test(msg)
                ? ' Kiểm tra mạng, .env Supabase, dự án không pause.'
                : '';
            toast.error('Lỗi cập nhật Số đơn TT: ' + msg + fetchHint, { autoClose: 12000 });
        } finally {
            setMktRecalcLoading(false);
        }
    };

    /** Chỉ đổi ô Team đúng bằng "Hà Nội" → "HN-MKT" (không xóa dòng). */
    const handleSyncTeamHanoiToHnMkt = async () => {
        if (!isAdminOnly) return;
        if (
            !window.confirm(
                'Đồng bộ Team: mọi bản ghi trong detail_reports có cột Team đúng bằng "Hà Nội" sẽ được đổi thành "HN-MKT".\n\nKhông xóa dữ liệu. Tiếp tục?'
            )
        ) {
            return;
        }
        try {
            setSyncingTeamHanoi(true);
            const { count: nBefore, error: countErr } = await supabase
                .from(reportTableName)
                .select('*', { count: 'exact', head: true })
                .eq('Team', 'Hà Nội');

            if (countErr) throw countErr;

            const { error } = await supabase
                .from(reportTableName)
                .update({ Team: 'HN-MKT' })
                .eq('Team', 'Hà Nội');

            if (error) throw error;
            alert(`Đã cập nhật ${nBefore ?? 0} dòng (Team: Hà Nội → HN-MKT).`);
            fetchData();
        } catch (err) {
            console.error('Sync Team Hà Nội error:', err);
            alert('Lỗi khi đồng bộ Team: ' + (err.message || String(err)));
        } finally {
            setSyncingTeamHanoi(false);
        }
    };

    // Delete all data
    const handleDeleteAll = async () => {
        const confirm1 = window.confirm(
            "⚠️ CẢNH BÁO NGHIÊM TRỌNG!\n\n" +
            "Bạn có chắc chắn muốn XÓA TOÀN BỘ dữ liệu trong bảng detail_reports?\n\n" +
            "Hành động này KHÔNG THỂ HOÀN TÁC!\n\n" +
            "Nhấn OK để tiếp tục, hoặc Cancel để hủy."
        );

        if (!confirm1) return;

        const confirm2 = window.confirm(
            "⚠️ XÁC NHẬN LẦN CUỐI!\n\n" +
            "Bạn có THỰC SỰ muốn xóa TOÀN BỘ dữ liệu?\n\n" +
            "Tất cả báo cáo sẽ bị mất vĩnh viễn!\n\n" +
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
            
            // Delete all records from detail_reports
            const { error } = await supabase
                .from(reportTableName)
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (hack for delete all)

            if (error) {
                // If the above doesn't work, try deleting by selecting all IDs first
                const { data: allRecords, error: fetchError } = await supabase
                    .from(reportTableName)
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
                            .from(reportTableName)
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

    // isAdmin đã được định nghĩa ở trên, không cần định nghĩa lại
    
    // Kiểm tra quyền xóa (Admin hoặc user có quyền delete cho permissionCode)
    const canDeleteAll = isAdmin || canDelete(permissionCode);
    const canDeleteSingle = isAdmin || canDelete(permissionCode); // Quyền xóa từng dòng

    // Edit Handlers
    const handleEditClick = (report) => {
        setEditingReport(report);
        setEditForm({
            // Basic info
            ten: report['Tên'] || '',
            email: report['Email'] || '',
            ngay: report['Ngày'] || '',
            ca: report['ca'] || '',
            team: report['Team'] || '',
            san_pham: report['Sản_phẩm'] || '',
            thi_truong: report['Thị_trường'] || '',
            // Financial metrics
            cpqc: report['CPQC'] || 0,
            mess_cmt: report['Số_Mess_Cmt'] || 0,
            orders: report['Số đơn'] || 0,
            revenue: report['Doanh số'] || 0,
            // Additional fields
            tkqc: report['TKQC'] || '',
            id_ns: report['id_NS'] || '',
            cpqc_theo_tkqc: report['CPQC theo TKQC'] || 0,
            bao_cao_theo_page: report['Báo cáo theo Page'] || '',
            trang_thai: report['Trạng thái'] || '',
            canh_bao: report['Cảnh báo'] || ''
            // Real values are calculated automatically, not editable
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

    // Delete single report
    const handleDeleteReport = async (reportId) => {
        if (!reportId) {
            alert('Không tìm thấy ID báo cáo để xóa!');
            console.error('Report ID is missing:', reportId);
            return;
        }
        
        if (!window.confirm('Bạn có chắc chắn muốn xóa báo cáo này?')) return;
        
        setDeletingId(reportId);
        try {
            console.log('🗑️ Attempting to delete report with ID:', reportId);
            console.log('🔍 Current user email:', userEmail);
            console.log('🔍 Current user role:', role);
            
            // First, try to get the report to check permissions
            const { data: reportData, error: fetchError } = await supabase
                .from(reportTableName)
                .select('id, "Tên", "Email", "Team", department')
                .eq('id', reportId)
                .single();
            
            if (fetchError) {
                console.error('❌ Error fetching report:', fetchError);
                throw new Error('Không tìm thấy báo cáo để xóa: ' + fetchError.message);
            }
            
            console.log('📋 Report to delete:', reportData);
            
            // Now try to delete
            const { data, error } = await supabase
                .from(reportTableName)
                .delete()
                .eq('id', reportId)
                .select();
            
            if (error) {
                console.error('❌ Delete error:', error);
                console.error('❌ Error code:', error.code);
                console.error('❌ Error details:', error.details);
                console.error('❌ Error hint:', error.hint);
                
                // Check if it's a permission error
                if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
                    throw new Error('Bạn không có quyền xóa báo cáo này. Vui lòng liên hệ Admin để được cấp quyền DELETE cho MKT_MANUAL.');
                }
                
                throw error;
            }
            
            console.log('✅ Delete successful:', data);
            alert('Đã xóa báo cáo thành công!');
            fetchData(); // Reload data after deletion
        } catch (error) {
            console.error('❌ Error deleting report:', error);
            const errorMessage = error?.message || error?.details || String(error);
            alert('Lỗi khi xóa báo cáo: ' + errorMessage + '\n\nVui lòng kiểm tra Console (F12) để xem chi tiết lỗi.');
        } finally {
            setDeletingId(null);
        }
    };

    const handleSaveEdit = async () => {
        if (!editingReport) return;
        setSaving(true);
        try {
            // Note: Real values ("Số đơn thực tế", "Doanh số thực tế") được tính tự động từ orders table
            // Không cần tính và update vào detail_reports vì các cột này không tồn tại trong schema

            const updateData = {
                // Basic info
                'Tên': editForm.ten || null,
                'Email': editForm.email || null,
                'Ngày': editForm.ngay || null,
                'ca': editForm.ca || null,
                'Team': editForm.team || null,
                'Sản_phẩm': editForm.san_pham || null,
                'Thị_trường': editForm.thi_truong || null,
                // Financial metrics
                'CPQC': editForm.cpqc ? Number(editForm.cpqc) : 0,
                'Số_Mess_Cmt': editForm.mess_cmt ? Number(editForm.mess_cmt) : 0,
                'Số đơn': editForm.orders ? Number(editForm.orders) : 0,
                'Doanh số': editForm.revenue ? Number(editForm.revenue) : 0,
                // Additional fields
                'TKQC': editForm.tkqc || null,
                'id_NS': editForm.id_ns || null,
                'CPQC theo TKQC': editForm.cpqc_theo_tkqc ? Number(editForm.cpqc_theo_tkqc) : 0,
                'Báo cáo theo Page': editForm.bao_cao_theo_page || null,
                'Trạng thái': editForm.trang_thai || null,
                'Cảnh báo': editForm.canh_bao || null
                // Note: "Số đơn thực tế" và "Doanh số thực tế" được tính tự động từ orders table sau khi update
                // Không cần truyền vào khi update
            };

            const { error } = await supabase
                .from(reportTableName)
                .update(updateData)
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
                {/* Simple Header/Filter Section */}
                <div className="sidebar" style={{ width: '250px', minWidth: '250px' }}>
                    <h3>Bộ lọc</h3>
                    <label>
                        Từ ngày:
                        <input type="date" value={filters.startDate} onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))} />
                    </label>
                    <label>
                        Đến ngày:
                        <input type="date" value={filters.endDate} onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))} />
                    </label>
                    <label>
                        Nhân sự:
                    </label>
                    <details>
                        <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                            Chọn nhân sự ({(filters.personnelNames || []).length}/{availablePersonnelOptions.length})
                        </summary>
                        <div style={{ marginTop: '8px' }}>
                            <input
                                type="text"
                                placeholder="Gõ để tìm tên..."
                                value={personnelSearch}
                                onChange={(e) => setPersonnelSearch(e.target.value)}
                                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', marginBottom: '8px' }}
                            />
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
                                <input
                                    type="checkbox"
                                    style={{ marginRight: '6px' }}
                                    checked={availablePersonnelOptions.length > 0 && (filters.personnelNames || []).length === availablePersonnelOptions.length}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setFilters(prev => ({ ...prev, personnelNames: checked ? [...availablePersonnelOptions] : [] }));
                                    }}
                                />
                                Tất cả
                            </label>
                            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '6px' }}>
                                {filteredPersonnelOptions.length === 0 ? (
                                    <div style={{ fontSize: '12px', color: '#999' }}>Không có nhân sự phù hợp</div>
                                ) : (
                                    filteredPersonnelOptions.map((name) => (
                                        <label key={name} style={{ display: 'block', marginBottom: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                style={{ marginRight: '6px' }}
                                                checked={(filters.personnelNames || []).includes(name)}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setFilters(prev => {
                                                        const list = prev.personnelNames || [];
                                                        return {
                                                            ...prev,
                                                            personnelNames: checked ? [...list, name] : list.filter((x) => x !== name)
                                                        };
                                                    });
                                                }}
                                            />
                                            {name}
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                    </details>
                    <div style={{ marginTop: '12px' }}>
                        <details>
                            <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                                Ca ({(filters.shifts || []).length}/{availableShiftOptions.length})
                            </summary>
                            <div style={{ marginTop: '8px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
                                    <input
                                        type="checkbox"
                                        style={{ marginRight: '6px' }}
                                        checked={availableShiftOptions.length > 0 && (filters.shifts || []).length === availableShiftOptions.length}
                                        onChange={(e) => setFilters(prev => ({ ...prev, shifts: e.target.checked ? [...availableShiftOptions] : [] }))}
                                    />
                                    Tất cả
                                </label>
                                <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '6px' }}>
                                    {availableShiftOptions.map((value) => (
                                        <label key={value} style={{ display: 'block', marginBottom: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                style={{ marginRight: '6px' }}
                                                checked={(filters.shifts || []).includes(value)}
                                                onChange={(e) => setFilters(prev => ({
                                                    ...prev,
                                                    shifts: e.target.checked ? [...(prev.shifts || []), value] : (prev.shifts || []).filter((x) => x !== value)
                                                }))}
                                            />
                                            {value}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </details>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <details>
                            <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                                Team ({(filters.teams || []).length}/{availableTeamOptions.length})
                            </summary>
                            <div style={{ marginTop: '8px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
                                    <input
                                        type="checkbox"
                                        style={{ marginRight: '6px' }}
                                        checked={availableTeamOptions.length > 0 && (filters.teams || []).length === availableTeamOptions.length}
                                        onChange={(e) => setFilters((prev) => ({ ...prev, teams: e.target.checked ? [...availableTeamOptions] : [] }))}
                                    />
                                    Tất cả
                                </label>
                                <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '6px' }}>
                                    {availableTeamOptions.length === 0 ? (
                                        <div style={{ fontSize: '12px', color: '#999' }}>Chưa có giá trị Team trong dữ liệu đã tải</div>
                                    ) : (
                                        availableTeamOptions.map((value) => (
                                            <label key={value} style={{ display: 'block', marginBottom: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    style={{ marginRight: '6px' }}
                                                    checked={(filters.teams || []).includes(value)}
                                                    onChange={(e) =>
                                                        setFilters((prev) => ({
                                                            ...prev,
                                                            teams: e.target.checked
                                                                ? [...(prev.teams || []), value]
                                                                : (prev.teams || []).filter((x) => x !== value)
                                                        }))
                                                    }
                                                />
                                                {value}
                                            </label>
                                        ))
                                    )}
                                </div>
                            </div>
                        </details>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <details>
                            <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                                Sản phẩm ({(filters.products || []).length}/{availableProductOptions.length})
                            </summary>
                            <div style={{ marginTop: '8px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
                                    <input
                                        type="checkbox"
                                        style={{ marginRight: '6px' }}
                                        checked={availableProductOptions.length > 0 && (filters.products || []).length === availableProductOptions.length}
                                        onChange={(e) => setFilters(prev => ({ ...prev, products: e.target.checked ? [...availableProductOptions] : [] }))}
                                    />
                                    Tất cả
                                </label>
                                <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '6px' }}>
                                    {availableProductOptions.map((value) => (
                                        <label key={value} style={{ display: 'block', marginBottom: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                style={{ marginRight: '6px' }}
                                                checked={(filters.products || []).includes(value)}
                                                onChange={(e) => setFilters(prev => ({
                                                    ...prev,
                                                    products: e.target.checked ? [...(prev.products || []), value] : (prev.products || []).filter((x) => x !== value)
                                                }))}
                                            />
                                            {value}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </details>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <details>
                            <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                                Thị trường ({(filters.markets || []).length}/{availableMarketOptions.length})
                            </summary>
                            <div style={{ marginTop: '8px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
                                    <input
                                        type="checkbox"
                                        style={{ marginRight: '6px' }}
                                        checked={availableMarketOptions.length > 0 && (filters.markets || []).length === availableMarketOptions.length}
                                        onChange={(e) => setFilters(prev => ({ ...prev, markets: e.target.checked ? [...availableMarketOptions] : [] }))}
                                    />
                                    Tất cả
                                </label>
                                <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '6px' }}>
                                    {availableMarketOptions.map((value) => (
                                        <label key={value} style={{ display: 'block', marginBottom: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                style={{ marginRight: '6px' }}
                                                checked={(filters.markets || []).includes(value)}
                                                onChange={(e) => setFilters(prev => ({
                                                    ...prev,
                                                    markets: e.target.checked ? [...(prev.markets || []), value] : (prev.markets || []).filter((x) => x !== value)
                                                }))}
                                            />
                                            {value}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </details>
                    </div>
                </div>

                <div className="main-detailed">
                    <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <h2>DANH SÁCH BÁO CÁO TAY MARKETING{pageTitleSuffix}</h2>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {isAdminOnly && teamFilter !== 'RD' && (
                                <button
                                    type="button"
                                    onClick={handleRecalcMktSoDonTT}
                                    disabled={
                                        mktRecalcLoading ||
                                        deletingDupKeys ||
                                        loading ||
                                        deleting ||
                                        syncing ||
                                        syncingTeamHanoi ||
                                        syncingTeamFromUsers ||
                                        fixingUsThiTruong ||
                                        !filters.startDate ||
                                        !filters.endDate
                                    }
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
                                    title="Tính lại Số đơn thực tế & Doanh số TT từ orders vào detail_reports theo khoảng ngày bộ lọc"
                                >
                                    {mktRecalcLoading ? (
                                        <>
                                            <span className="animate-spin">⏳</span>
                                            Đang cập nhật Số đơn TT…
                                        </>
                                    ) : (
                                        <>🔄 Cập nhật Số đơn TT</>
                                    )}
                                </button>
                            )}
                            {isAdminOnly && teamFilter !== 'RD' && (
                                <button
                                    type="button"
                                    onClick={handleDeleteDuplicateMktKeys}
                                    disabled={
                                        deletingDupKeys ||
                                        loading ||
                                        deleting ||
                                        syncing ||
                                        syncingTeamHanoi ||
                                        syncingTeamFromUsers ||
                                        fixingUsThiTruong ||
                                        mktRecalcLoading
                                    }
                                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
                                    title="Xóa dòng trùng cùng key (Ngày+Tên+SP+TT+ca) trong phạm vi danh sách đã lọc; gộp CPQC/mess vào dòng giữ lại"
                                >
                                    {deletingDupKeys ? (
                                        <>
                                            <span className="animate-spin">⏳</span>
                                            Đang xóa trùng…
                                        </>
                                    ) : (
                                        <>🧹 Xóa trùng key</>
                                    )}
                                </button>
                            )}
                            {isAdminOnly && !isHcmMarketingReport && (
                                <button
                                    type="button"
                                    onClick={handleSyncTeamHanoiToHnMkt}
                                    disabled={syncingTeamHanoi || loading || deleting || deletingDupKeys || syncing || mktRecalcLoading}
                                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
                                    title='Chỉ cập nhật các dòng có Team đúng bằng "Hà Nội"'
                                >
                                    {syncingTeamHanoi ? (
                                        <>
                                            <span className="animate-spin">⏳</span>
                                            Đang đồng bộ Team…
                                        </>
                                    ) : (
                                        <>🏷️ Đồng bộ Team: Hà Nội → HN-MKT</>
                                    )}
                                </button>
                            )}
                            {isAdminOnly && isHcmMarketingReport && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleSyncTeamFromUsersForMarketing}
                                        disabled={
                                            syncingTeamFromUsers ||
                                            loading ||
                                            deleting ||
                                            deletingDupKeys ||
                                            syncing ||
                                            mktRecalcLoading ||
                                            fixingUsThiTruong
                                        }
                                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
                                        title="Khớp cột Tên với users → cập nhật Team theo users.team (chỉ các dòng đang lọc trên danh sách)"
                                    >
                                        {syncingTeamFromUsers ? (
                                            <>
                                                <span className="animate-spin">⏳</span>
                                                Đang đồng bộ Team từ users…
                                            </>
                                        ) : (
                                            <>🏷️ Đồng bộ team từ users</>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleFixUsThiTruongToUS}
                                        disabled={
                                            fixingUsThiTruong ||
                                            loading ||
                                            deleting ||
                                            deletingDupKeys ||
                                            syncing ||
                                            syncingTeamFromUsers ||
                                            mktRecalcLoading
                                        }
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
                                        title="Cập nhật toàn bảng marketing_report_hcm: Thị_trường = Us → US"
                                    >
                                        {fixingUsThiTruong ? (
                                            <>
                                                <span className="animate-spin">⏳</span>
                                                Đang đổi Us → US…
                                            </>
                                        ) : (
                                            <>Đổi Us → US (thị trường)</>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                        <div style={{ display: 'none', gap: '10px', flexWrap: 'wrap' }}>
                            {/* Chỉ Admin mới thấy nút đồng bộ (không bao gồm Finance) */}
                            {isAdminOnly && (
                                <button
                                    onClick={handleSyncMKT}
                                    disabled={syncing || loading || deleting}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
                                >
                                    {syncing ? (
                                        <>
                                            <span className="animate-spin">⏳</span>
                                            Đang đồng bộ...
                                        </>
                                    ) : (
                                        <>
                                            🔄 Đồng bộ từ Firebase
                                        </>
                                    )}
                                </button>
                            )}
                            {/* Chỉ Admin mới thấy nút xóa toàn bộ (không bao gồm Finance) */}
                            {isAdminOnly && (
                                <button
                                    onClick={handleDeleteAll}
                                    disabled={syncing || loading || deleting}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
                                >
                                    {deleting ? (
                                        <>
                                            <span className="animate-spin">⏳</span>
                                            Đang xóa...
                                        </>
                                    ) : (
                                        <>
                                            🗑️ Xóa toàn bộ dữ liệu
                                        </>
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
                                    <th
                                        onClick={() => handleSort('Ngày')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Ngày {sortColumn === 'Ngày' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th
                                        onClick={() => handleSort('ca')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Ca {sortColumn === 'ca' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th
                                        onClick={() => handleSort('Tên')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Người báo cáo {sortColumn === 'Tên' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th
                                        onClick={() => handleSort('Team')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Team {sortColumn === 'Team' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th
                                        onClick={() => handleSort('Sản_phẩm')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Sản phẩm {sortColumn === 'Sản_phẩm' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th
                                        onClick={() => handleSort('Thị_trường')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Thị trường {sortColumn === 'Thị_trường' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th
                                        onClick={() => handleSort('CPQC')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        CPQC {sortColumn === 'CPQC' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th
                                        onClick={() => handleSort('Số_Mess_Cmt')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Số mess {sortColumn === 'Số_Mess_Cmt' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th
                                        onClick={() => handleSort('Số đơn')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Số đơn {sortColumn === 'Số đơn' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th
                                        onClick={() => handleSort('Doanh số')}
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Doanh số {sortColumn === 'Doanh số' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reportsAfterFilters.length === 0 ? (
                                    <tr>
                                        <td colSpan="12" className="text-center">{loading || calculatingRealValues ? 'Đang tải...' : 'Không có dữ liệu trong khoảng thời gian này.'}</td>
                                    </tr>
                                ) : (
                                    <>
                                        <tr className="total-row">
                                            <td className="total-label" colSpan="7">TỔNG CỘNG</td>
                                            <td className="total-value">{formatNumber(totalsByFiltered.cpqc)}</td>
                                            <td className="total-value">{formatNumber(totalsByFiltered.mess)}</td>
                                            <td className="total-value">{formatNumber(totalsByFiltered.soDon)}</td>
                                            <td className="total-value">{formatCurrency(totalsByFiltered.doanhSo)}</td>
                                            <td />
                                        </tr>
                                        {manualReports.map((item, index) => {
                                            const realValues = realValuesMap[item.id] || {
                                                so_don_thuc_te: item['Số đơn'] || 0,
                                                doanh_so_thuc_te: item['Doanh số'] || 0
                                            };
                                            return (
                                                <tr key={item.id || index}>
                                                    <td className="text-center">{startIndex + index + 1}</td>
                                                    <td>{formatDate(item['Ngày'])}</td>
                                                    <td>{item['ca']}</td>
                                                    <td>{item['Tên']}</td>
                                                    <td>{item['Team']}</td>
                                                    <td>{item['Sản_phẩm']}</td>
                                                    <td>{item['Thị_trường']}</td>
                                                    <td>{formatNumber(item['CPQC'])}</td>
                                                    <td>{formatNumber(item['Số_Mess_Cmt'])}</td>
                                                    <td>{formatNumber(realValues.so_don_thuc_te)}</td>
                                                    <td>{formatCurrency(realValues.doanh_so_thuc_te)}</td>
                                                    <td className="text-center">
                                                        <button
                                                            className="px-2 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-xs transition mr-2"
                                                            onClick={() => handleEditClick(item)}
                                                        >
                                                            Sửa
                                                        </button>
                                                        {canDeleteSingle && (
                                                            <button
                                                                onClick={() => {
                                                                    console.log('🔍 Delete button clicked, item:', item);
                                                                    console.log('🔍 Item ID:', item.id);
                                                                    handleDeleteReport(item.id);
                                                                }}
                                                                disabled={deletingId === item.id || !item.id}
                                                                className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                                title={!item.id ? 'Không có ID để xóa' : ''}
                                                            >
                                                                {deletingId === item.id ? 'Đang xóa...' : 'Xóa'}
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </>
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
                                    Hiển thị {startIndex + 1}-{Math.min(endIndex, reportsAfterFilters.length)} / {reportsAfterFilters.length} bản ghi
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto p-4">
                    <div className="bg-white p-6 rounded-lg w-full max-w-4xl max-h-[90vh] shadow-xl relative overflow-y-auto">
                        <h3 className="text-lg font-bold mb-4 text-blue-600 border-b pb-2">Sửa Báo Cáo MKT</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Basic Info Section */}
                            <div className="space-y-3">
                                <h4 className="font-semibold text-gray-700 border-b pb-1">Thông tin cơ bản</h4>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Tên:</label>
                                    <input
                                        type="text"
                                        name="ten"
                                        value={editForm.ten}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Email:</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={editForm.email}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Ngày:</label>
                                    <input
                                        type="date"
                                        name="ngay"
                                        value={editForm.ngay}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Ca:</label>
                                    <input
                                        type="text"
                                        name="ca"
                                        value={editForm.ca}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Team:</label>
                                    <input
                                        type="text"
                                        name="team"
                                        value={editForm.team}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Sản phẩm:</label>
                                    <input
                                        type="text"
                                        name="san_pham"
                                        value={editForm.san_pham}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Thị trường:</label>
                                    <input
                                        type="text"
                                        name="thi_truong"
                                        value={editForm.thi_truong}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                            </div>

                            {/* Financial Metrics Section */}
                            <div className="space-y-3">
                                <h4 className="font-semibold text-gray-700 border-b pb-1">Chỉ số tài chính</h4>
                                <div>
                                    <label className="block text-sm font-medium mb-1">CPQC:</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        name="cpqc"
                                        value={editForm.cpqc}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Số mess/Cmt:</label>
                                    <input
                                        type="number"
                                        name="mess_cmt"
                                        value={editForm.mess_cmt}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Số đơn:</label>
                                    <input
                                        type="number"
                                        name="orders"
                                        value={editForm.orders}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Doanh số:</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        name="revenue"
                                        value={editForm.revenue}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                            </div>

                            {/* Additional Fields Section */}
                            <div className="space-y-3">
                                <h4 className="font-semibold text-gray-700 border-b pb-1">Thông tin bổ sung</h4>
                                <div>
                                    <label className="block text-sm font-medium mb-1">TKQC:</label>
                                    <input
                                        type="text"
                                        name="tkqc"
                                        value={editForm.tkqc}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">ID NS:</label>
                                    <input
                                        type="text"
                                        name="id_ns"
                                        value={editForm.id_ns}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">CPQC theo TKQC:</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        name="cpqc_theo_tkqc"
                                        value={editForm.cpqc_theo_tkqc}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Báo cáo theo Page:</label>
                                    <input
                                        type="text"
                                        name="bao_cao_theo_page"
                                        value={editForm.bao_cao_theo_page}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Trạng thái:</label>
                                    <input
                                        type="text"
                                        name="trang_thai"
                                        value={editForm.trang_thai}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Cảnh báo:</label>
                                    <input
                                        type="text"
                                        name="canh_bao"
                                        value={editForm.canh_bao}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Real Values Info (Read-only, calculated from orders) */}
                        <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
                            <h4 className="font-semibold text-blue-700 mb-2">Giá trị thực tế (tự động tính từ bảng Orders)</h4>
                            <p className="text-sm text-gray-600">
                                Các giá trị này được tính tự động từ bảng Orders dựa trên: Ngày, Tên MKT, Ca, Sản phẩm và Thị trường.
                                Không thể chỉnh sửa thủ công.
                            </p>
                        </div>

                        <div className="flex gap-2 mt-6">
                            <button
                                onClick={handleSaveEdit}
                                disabled={saving}
                                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded font-semibold transition"
                            >
                                {saving ? 'Đang lưu...' : 'Lưu'}
                            </button>
                            <button
                                onClick={handleCloseModal}
                                disabled={saving}
                                className="flex-1 px-4 py-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white rounded font-semibold transition"
                            >
                                Hủy
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
