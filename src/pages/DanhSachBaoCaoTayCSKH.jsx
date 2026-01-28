import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions';
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

    const [loading, setLoading] = useState(true);
    const [manualReports, setManualReports] = useState([]);
    const [allReports, setAllReports] = useState([]); // Store all filtered reports for pagination
    const [realValuesMap, setRealValuesMap] = useState({}); // Map report ID to real values
    const [calculatingRealValues, setCalculatingRealValues] = useState(false);
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: ''
    });
    const [syncing, setSyncing] = useState(false);
    const [deleting, setDeleting] = useState(false);
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);

    // Edit State
    const [editingReport, setEditingReport] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);

    // Map tên nhân sự -> email (lấy từ bảng nhân sự)
    const [hrEmailMap, setHrEmailMap] = useState({});
    
    // Selected personnel names (từ cột selected_personnel trong users table)
    const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]);

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

    // Initialize Dates
    useEffect(() => {
        const today = new Date();
        const d = new Date();
        d.setDate(d.getDate() - 30); // Last 30 days
        const formatDateForInput = (date) => date.toISOString().split('T')[0];

        setFilters({
            startDate: formatDateForInput(d),
            endDate: formatDateForInput(today)
        });
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

            // Filter by market (country or area)
            if (reportMarket) {
                query = query.or(`country.ilike.%${reportMarket}%,area.ilike.%${reportMarket}%`);
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
    const fetchData = async () => {
        if (!filters.startDate || !filters.endDate) return;
        setLoading(true);
        try {
            console.log('🔍 Fetching data from sales_reports...', {
                startDate: filters.startDate,
                endDate: filters.endDate,
                teamFilter,
                role,
                userTeam,
                userName
            });

            // Lấy trực tiếp từ bảng sales_reports (giới hạn 50 records)
            let query = supabase
                .from('sales_reports')
                .select('*')
                .limit(50);

            // Filter theo ngày
            if (filters.startDate && filters.endDate) {
                query = query
                    .gte('date', filters.startDate)
                    .lte('date', filters.endDate);
            }

            // Bỏ qua permission filtering - hiển thị tất cả data
            console.log('👤 Showing all data (no permission filter)');

            // Filter theo selected_personnel nếu có
            if (selectedPersonnelNames && selectedPersonnelNames.length > 0) {
                console.log('📋 Filter: Tên trong selected_personnel:', selectedPersonnelNames);
                // Tạo OR conditions cho mỗi tên trong selectedPersonnelNames
                const orConditions = selectedPersonnelNames
                    .filter(name => name && name.trim().length > 0)
                    .map(name => `name.ilike.%${name.trim()}%`);
                
                if (orConditions.length > 0) {
                    query = query.or(orConditions.join(','));
                    console.log('✅ Applied filter for selected personnel:', orConditions.length, 'names');
                } else {
                    // Không có tên hợp lệ -> không trả về data nào
                    console.warn('⚠️ No valid names in selectedPersonnelNames, returning empty result');
                    query = query.eq('id', '00000000-0000-0000-0000-000000000000');
                }
            } else {
                console.log('ℹ️ No selectedPersonnelNames, showing all data');
            }

            console.log('🔍 Executing query...');
            const { data, error } = await query.order('date', { ascending: false });

            if (error) {
                console.error('❌ Query error:', error);
                throw error;
            }

            console.log(`✅ Fetched ${data?.length || 0} records from sales_reports`);
            
            // Debug: Log sample data if available
            if (data && data.length > 0) {
                console.log('📊 Sample record:', data[0]);
            } else {
                console.warn('⚠️ No data returned from query');
            }

            // Bổ sung Email nhân viên từ bảng nhân sự (human_resources) nếu thiếu
            const enrichedData = (data || []).map(item => {
                const currentEmail = (item.email || '').trim();
                const nameKey = (item.name || '').toLowerCase().trim();
                const hrEmail = hrEmailMap[nameKey];

                if (!currentEmail && hrEmail) {
                    return { ...item, email: hrEmail };
                }
                return item;
            });

            console.log(`📊 Total records: ${enrichedData.length} | role: ${role}, team: ${userTeam}`);

            setAllReports(enrichedData); // Store all data for pagination
            setCurrentPage(1); // Reset to first page when data changes
            
            // Calculate real values for all reports
            await calculateRealValuesForReports(enrichedData);
            
            if (enrichedData.length === 0) {
                console.warn('⚠️ No data found');
            }
        } catch (error) {
            console.error('❌ Error fetching CSKH reports:', {
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
    
    // Calculate pagination
    const totalPages = Math.ceil(allReports.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedReports = allReports.slice(startIndex, endIndex);

    // Update displayed reports when pagination changes
    useEffect(() => {
        setManualReports(paginatedReports);
    }, [currentPage, itemsPerPage, allReports]);

    // Delete all data
    const handleDeleteAll = async () => {
        const confirm1 = window.confirm(
            "⚠️ CẢNH BÁO NGHIÊM TRỌNG!\n\n" +
            "Bạn có chắc chắn muốn XÓA TOÀN BỘ dữ liệu trong bảng sales_reports?\n\n" +
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
            
            // Delete all records from sales_reports
            const { error } = await supabase
                .from('sales_reports')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (hack for delete all)

            if (error) {
                // If the above doesn't work, try deleting by selecting all IDs first
                const { data: allRecords, error: fetchError } = await supabase
                    .from('sales_reports')
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
                            .from('sales_reports')
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

    if (!canView(permissionCode)) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
    }

    // Kiểm tra xem user có phải Admin không (chỉ Admin mới thấy nút xóa)
    const roleFromHook = (role || '').toUpperCase();
    const roleFromStorage = (localStorage.getItem('userRole') || '').toLowerCase();
    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    const roleFromUser = (user?.role || user?.Role || '').toLowerCase();
    
    const isAdmin = roleFromHook === 'ADMIN' || 
                   roleFromHook === 'SUPER_ADMIN' ||
                   roleFromStorage === 'admin' ||
                   roleFromStorage === 'super_admin' ||
                   roleFromUser === 'admin' ||
                   roleFromUser === 'super_admin';

    // Edit Handlers
    const handleEditClick = (report) => {
        setEditingReport(report);
        setEditForm({
            // Basic info
            name: report.name || '',
            email: report.email || '',
            date: report.date || '',
            shift: report.shift || '',
            team: report.team || '',
            product: report.product || '',
            market: report.market || '',
            // Financial metrics
            mess_count: report.mess_count || 0,
            response_count: report.response_count || 0,
            order_count: report.order_count || 0,
            revenue_mess: report.revenue_mess || 0,
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
            // Calculate real values from orders table
            const realValues = await calculateRealValues({
                date: editForm.date || editingReport.date,
                name: editForm.name || editingReport.name,
                shift: editForm.shift || editingReport.shift,
                product: editForm.product || editingReport.product,
                market: editForm.market || editingReport.market
            });

            const updateData = {
                // Basic info
                name: editForm.name || null,
                email: editForm.email || null,
                date: editForm.date || null,
                shift: editForm.shift || null,
                team: editForm.team || null,
                product: editForm.product || null,
                market: editForm.market || null,
                // Financial metrics
                mess_count: editForm.mess_count ? Number(editForm.mess_count) : 0,
                response_count: editForm.response_count ? Number(editForm.response_count) : 0,
                order_count: editForm.order_count ? Number(editForm.order_count) : 0,
                revenue_mess: editForm.revenue_mess ? Number(editForm.revenue_mess) : 0,
                // Real values - calculated automatically from orders table
                order_count_actual: realValues.order_count_actual,
                revenue_actual: realValues.revenue_actual
            };

            const { error } = await supabase
                .from('sales_reports')
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
                </div>

                <div className="main-detailed">
                    <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <h2>DANH SÁCH BÁO CÁO TAY CSKH</h2>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {/* Chỉ Admin mới thấy nút xóa */}
                            {isAdmin && (
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
                                    <th>Số đơn TT</th>
                                    <th>Doanh số TT</th>
                                    <th>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {manualReports.length === 0 ? (
                                    <tr>
                                        <td colSpan="14" className="text-center">{loading || calculatingRealValues ? 'Đang tải...' : 'Không có dữ liệu trong khoảng thời gian này.'}</td>
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
                                                <td className="text-center font-semibold text-blue-600">{formatNumber(realValues.order_count_actual)}</td>
                                                <td className="text-right font-semibold text-green-600">{formatCurrency(realValues.revenue_actual)}</td>
                                                <td className="text-center">
                                                    <button
                                                        className="px-2 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-xs transition"
                                                        onClick={() => handleEditClick(item)}
                                                    >
                                                        Sửa
                                                    </button>
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto p-4">
                    <div className="bg-white p-6 rounded-lg w-full max-w-4xl max-h-[90vh] shadow-xl relative overflow-y-auto">
                        <h3 className="text-lg font-bold mb-4 text-blue-600 border-b pb-2">Sửa Báo Cáo CSKH</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Basic Info Section */}
                            <div className="space-y-3">
                                <h4 className="font-semibold text-gray-700 border-b pb-1">Thông tin cơ bản</h4>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Tên:</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={editForm.name}
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
                                        name="date"
                                        value={editForm.date}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Ca:</label>
                                    <input
                                        type="text"
                                        name="shift"
                                        value={editForm.shift}
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
                                        name="product"
                                        value={editForm.product}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Thị trường:</label>
                                    <input
                                        type="text"
                                        name="market"
                                        value={editForm.market}
                                        onChange={handleInputChange}
                                        className="w-full border rounded px-2 py-1"
                                    />
                                </div>
                            </div>

                            {/* Financial Metrics Section */}
                            <div className="space-y-3">
                                <h4 className="font-semibold text-gray-700 border-b pb-1">Chỉ số tài chính</h4>
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
                                    <label className="block text-sm font-medium mb-1">Doanh số:</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        name="revenue_mess"
                                        value={editForm.revenue_mess}
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
                                Các giá trị này được tính tự động từ bảng Orders dựa trên: Ngày, Tên Sale, Ca, Sản phẩm và Thị trường.
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
