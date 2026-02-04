import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../services/supabaseClient';
import * as rbacService from '../services/rbacService';
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

export default function DanhSachBaoCaoTay() {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // 'RD' or null

    // Permission Logic
    const { canView, role } = usePermissions();
    const permissionCode = teamFilter === 'RD' ? 'RND_MANUAL' : 'SALE_MANUAL';
    
    // Kiểm tra xem user có phải Admin không (chỉ Admin mới thấy nút xóa)
    const roleFromHook = (role || '').toUpperCase();
    const roleFromStorage = (localStorage.getItem('userRole') || '').toLowerCase();
    const userJson = localStorage.getItem("user");
    const userObj = userJson ? JSON.parse(userJson) : null;
    const roleFromUserObj = (userObj?.role || '').toLowerCase();

    const isAdmin = roleFromHook === 'ADMIN' ||
                   roleFromHook === 'SUPER_ADMIN' ||
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
        markets: []
    });
    const [deleting, setDeleting] = useState(false);
    
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
                const personnelNames = personnelMap[userEmailLower] || [];

                const validNames = personnelNames.filter(name => {
                    const nameStr = String(name).trim();
                    return nameStr.length > 0 && !nameStr.includes('@');
                });
                
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
        const formatDateForInput = (date) => date.toISOString().split('T')[0];

        setFilters({
            startDate: formatDateForInput(d),
            endDate: formatDateForInput(today)
        });
    }, []);

    // Load available options for filters (chỉ lấy từ báo cáo của nhân sự được phép xem)
    useEffect(() => {
        const loadAvailableOptions = async () => {
            try {
                let productsSet = new Set();
                let marketsSet = new Set();

                // Bước 1: Load tất cả sản phẩm từ system_settings (type <> 'test') để có danh sách đầy đủ
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

                // Bước 2: Load sản phẩm và thị trường từ sales_reports
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
                            .from('sales_reports')
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
                                console.log(`📄 Loaded ${allData.length} records từ sales_reports (để lấy unique products/markets)`);
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

                    console.log(`✅ Loaded ${productsFromReports.length} products and ${marketsFromReports.length} markets from sales_reports`);
                } catch (dbError) {
                    console.error('Error fetching from sales_reports:', dbError);
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
    }, [selectedPersonnelNames]); // Reload khi selectedPersonnelNames thay đổi

    // Fetch Data
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
                    console.log('📋 Filter by selected_personnel:', selectedPersonnelNames);
                } else {
                    // Nếu không có tên hợp lệ, không hiển thị gì cả
                    query = query.eq('id', '00000000-0000-0000-0000-000000000000');
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
            setManualReports(data || []);
        } catch (error) {
            console.error('Error fetching manual reports:', error);
        } finally {
            setLoading(false);
        }
    }, [filters.startDate, filters.endDate, filters.products, filters.markets, selectedPersonnelNames]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Quick date filter handlers
    const handleQuickDateSelect = (period) => {
        const today = new Date();
        const formatDateForInput = (date) => date.toISOString().split('T')[0];
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
            startDate: formatDateForInput(startDate),
            endDate: formatDateForInput(endDate)
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
                    .from('sales_reports')
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
    }, []);

    if (!canView(permissionCode)) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
    }

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
                        <h2>DANH SÁCH BÁO CÁO TAY SALE</h2>
                        {/* Chỉ Admin mới thấy nút xóa */}
                        {isAdmin && (
                            <button
                                onClick={handleDeleteAll}
                                disabled={deleting || loading}
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
                            </thead>
                            <tbody>
                                {manualReports.length === 0 ? (
                                    <tr>
                                        <td colSpan="12" className="text-center">{loading ? 'Đang tải...' : 'Không có dữ liệu trong khoảng thời gian này.'}</td>
                                    </tr>
                                ) : (
                                    manualReports.map((item, index) => (
                                        <tr key={item.id || index}>
                                            <td className="text-center">{index + 1}</td>
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
                                                    <button
                                                        className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition disabled:bg-gray-400"
                                                        onClick={() => handleDeleteReport(item.id)}
                                                        disabled={deletingId === item.id}
                                                    >
                                                        {deletingId === item.id ? 'Đang xóa...' : 'Xóa'}
                                                    </button>
                                                </div>
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-96 shadow-xl relative">
                        <h3 className="text-lg font-bold mb-4 text-blue-600 border-b pb-2">Sửa Báo Cáo Sale</h3>

                        <div className="mb-4 text-sm text-gray-600">
                            <p><strong>Nhân viên:</strong> {editingReport.name}</p>
                        </div>

                        <div className="space-y-3">
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
                            <div>
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
                                <label className="block text-sm font-medium mb-1">Doanh số:</label>
                                <input
                                    type="number"
                                    name="revenue_mess"
                                    value={editForm.revenue_mess}
                                    onChange={handleInputChange}
                                    className="w-full border rounded px-2 py-1"
                                />
                            </div>
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
        </div>
    );
}
