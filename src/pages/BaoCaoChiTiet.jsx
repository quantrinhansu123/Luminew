import { ChevronLeft, Download, RefreshCw, Search, Settings, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../supabase/config';
import { COLUMN_MAPPING, PRIMARY_KEY_COLUMN } from '../types';
import { isDateInRange, parseSmartDate } from '../utils/dateParsing';

function BaoCaoChiTiet() {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // 'RD' or null

    // Permission Logic
    const { canView, role } = usePermissions();
    const permissionCode = teamFilter === 'RD' ? 'RND_ORDERS' : 'MKT_ORDERS';

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
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 3);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });

    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const [sortColumn, setSortColumn] = useState(null);
    const [sortDirection, setSortDirection] = useState('asc');
    const [showColumnSettings, setShowColumnSettings] = useState(false);
    const [syncing, setSyncing] = useState(false); // State for sync process

    const defaultColumns = [
        'Mã đơn hàng',
        'Ngày lên đơn',
        'Name*',
        'Phone*',
        'Khu vực',
        'Mặt hàng',
        'Mã Tracking',
        'Trạng thái giao hàng',
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

    // Get all available columns from data
    const allAvailableColumns = useMemo(() => {
        if (allData.length === 0) return [];

        // Get all potential keys from data
        const allKeys = new Set();
        allData.forEach(row => {
            Object.keys(row).forEach(key => {
                if (key !== PRIMARY_KEY_COLUMN) {
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
        const saved = localStorage.getItem('baoCaoChiTiet_visibleColumns');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Error parsing saved columns:', e);
            }
        }
        // Initialize with default columns
        const initial = {};
        defaultColumns.forEach(col => {
            initial[col] = true;
        });
        return initial;
    });

    // Update displayColumns based on visibleColumns
    const displayColumns = useMemo(() => {
        return allAvailableColumns.filter(col => visibleColumns[col] === true);
    }, [allAvailableColumns, visibleColumns]);

    // Save to localStorage when visibleColumns changes
    useEffect(() => {
        if (Object.keys(visibleColumns).length > 0) {
            localStorage.setItem('baoCaoChiTiet_visibleColumns', JSON.stringify(visibleColumns));
        }
    }, [visibleColumns]);

    // Helper: Map Supabase DB row to UI format
    const mapSupabaseToUI = (item) => ({
        "Mã đơn hàng": item.order_code,
        "Ngày lên đơn": item.order_date || item.created_at?.split('T')[0],
        "Name*": item.customer_name,
        "Phone*": item.customer_phone,
        "Add": item.customer_address,
        "City": item.city,
        "State": item.state,
        "Khu vực": item.country || item.area, // Fallback to 'area' from new form
        "Zipcode": item.zipcode,
        "Mặt hàng": item.product_main || item.product,
        "Tên mặt hàng 1": item.product_name_1 || item.product_main || item.product,
        "Tổng tiền VNĐ": item.total_amount_vnd,
        "Hình thức thanh toán": item.payment_method_text || item.payment_method, // payment_method_text is new
        "Mã Tracking": item.tracking_code,
        "Phí ship": item.shipping_fee,
        "Nhân viên Marketing": item.marketing_staff,
        "Nhân viên Sale": item.sale_staff,
        "Team": item.team,
        "Trạng thái giao hàng": item.delivery_status,
        "Kết quả Check": item.payment_status,
        "Ghi chú": item.note,
        "CSKH": item.cskh,
        "NV Vận đơn": item.delivery_staff,
        "Tiền Hàng": item.sale_price || item.goods_amount, // Map sale_price (foreign) or goods_amount
        "Tiền Việt đã đối soát": item.reconciled_vnd || item.reconciled_amount, // reconciled_vnd new
        "Phí Chung": item.general_fee,
        "Phí bay": item.flight_fee,
        "Thuê TK": item.account_rental_fee,
        "Phí xử lý đơn đóng hàng-Lưu kho(usd)": item.general_fee,
        "Thời gian cutoff": item.cutoff_time,
        "Đơn vị vận chuyển": item.shipping_unit || item.shipping_carrier, // shipping_carrier might be new?
        "Kế toán xác nhận thu tiền về": item.accountant_confirm,
        "Trạng thái thu tiền": item.payment_status_detail,
        "Lý do": item.reason,
        "Page": item.page_name, // Map Page Name
        "_id": item.id,
        "_source": 'supabase'
    });

    // Load data from Supabase only
    const loadData = async () => {
        setLoading(true);
        try {
            console.log('Loading MKT Detail data from Supabase...');

            // 1. Fetch Supabase Data
            let query = supabase.from('orders').select('*');

            // --- USER FILTER (Re-applied) ---
            // Only Admin/Director/Manager sees all. Staff sees only their own.
            // checking role for 'admin', 'director', 'manager'
            const isManager = ['admin', 'director', 'manager', 'super_admin'].includes((role || '').toLowerCase());

            if (!isManager && userName) {
                // Filter by marketing_staff
                query = query.ilike('marketing_staff', userName);
            }



            if (startDate && endDate) {
                query = query
                    .gte('order_date', startDate)
                    .lte('order_date', `${endDate}T23:59:59`);
            } else {
                // Limit if no date, but we have default so this is fallback
                query = query.limit(100);
            }

            const { data: supaData, error: supaError } = await query.order('order_date', { ascending: false });

            if (supaError) throw supaError;

            // 2. Process Supabase Data
            const supaMapped = (supaData || []).map(mapSupabaseToUI);

            console.log(`Loaded: ${supaMapped.length} orders.`);
            setAllData(supaMapped);

        } catch (error) {
            console.error('Load data error:', error);
            alert(`❌ Lỗi tải dữ liệu: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [startDate, endDate, role, userName]);

    // Get unique values for filters
    const uniqueMarkets = useMemo(() => {
        const markets = new Set();
        allData.forEach(row => {
            const market = row["Khu vực"] || row["khu vực"];
            if (market) markets.add(String(market).trim());
        });
        return Array.from(markets).sort();
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
        allData.forEach(row => {
            const product = row["Mặt hàng"];
            if (product) products.add(String(product).trim());
        });
        return Array.from(products).sort();
    }, [allData]);

    const uniqueStatuses = useMemo(() => {
        const statuses = new Set();
        allData.forEach(row => {
            const status = row["Trạng thái giao hàng"];
            if (status) statuses.add(String(status).trim());
        });
        return Array.from(statuses).sort();
    }, [allData]);

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
                    area: getValue(item, ['Khu vực', 'Area', 'Khu vuc']) || undefined,
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
                .from('orders')
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

    // Filter and sort data
    const filteredData = useMemo(() => {
        let data = [...allData];

        // Search filter (using debounced value)
        if (debouncedSearchText) {
            const searchLower = debouncedSearchText.toLowerCase();
            data = data.filter(row => {
                return (
                    String(row["Mã đơn hàng"] || '').toLowerCase().includes(searchLower) ||
                    String(row["Name*"] || '').toLowerCase().includes(searchLower) ||
                    String(row["Phone*"] || '').toLowerCase().includes(searchLower) ||
                    String(row["Mã Tracking"] || '').toLowerCase().includes(searchLower)
                );
            });
        }

        // Date Range Filter
        if (startDate || endDate) {
            data = data.filter(row => isDateInRange(row["Ngày lên đơn"], startDate, endDate));
        }

        // Market filter
        if (filterMarket.length > 0) {
            data = data.filter(row => {
                const market = row["Khu vực"] || row["khu vực"];
                return filterMarket.includes(String(market).trim());
            });
        }

        // Product filter
        if (filterProduct.length > 0) {
            data = data.filter(row => {
                const product = row["Mặt hàng"];
                return filterProduct.includes(String(product).trim());
            });
        }

        // Status filter
        if (filterStatus.length > 0) {
            data = data.filter(row => {
                const status = row["Trạng thái giao hàng"];
                return filterStatus.includes(String(status).trim());
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
    }, [allData, debouncedSearchText, filterMarket, filterProduct, filterStatus, startDate, endDate, sortColumn, sortDirection]); // Added dependencies

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

    if (!canView(permissionCode)) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
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
                                <h1 className="text-xl font-bold text-gray-800">DANH SÁCH ĐƠN (MARKETING)</h1>
                                <p className="text-xs text-gray-500">Xem chi tiết đơn hàng cho Marketing</p>
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
                                    placeholder="Mã đơn, tên, SĐT, tracking..."
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

                        {/* Market Filter */}
                        <div className="min-w-[150px]">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Khu vực</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                                value={filterMarket[0] || ''}
                                onChange={(e) => setFilterMarket(e.target.value ? [e.target.value] : [])}
                            >
                                <option value="">Tất cả</option>
                                {uniqueMarkets.map(market => (
                                    <option key={market} value={market}>{market}</option>
                                ))}
                            </select>
                        </div>

                        {/* Product Filter */}
                        <div className="min-w-[150px]">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Mặt hàng</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                                value={filterProduct[0] || ''}
                                onChange={(e) => setFilterProduct(e.target.value ? [e.target.value] : [])}
                            >
                                <option value="">Tất cả</option>
                                {uniqueProducts.map(product => (
                                    <option key={product} value={product}>{product}</option>
                                ))}
                            </select>
                        </div>

                        {/* Status Filter */}
                        <div className="min-w-[150px]">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Trạng thái</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
                                value={filterStatus[0] || ''}
                                onChange={(e) => setFilterStatus(e.target.value ? [e.target.value] : [])}
                            >
                                <option value="">Tất cả</option>
                                {uniqueStatuses.map(status => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
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

                        {/* Export Button */}
                        <button
                            onClick={handleExportExcel}
                            style={{ background: '#20744a' }} // Excel Green
                            className="px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2 hover:opacity-90"
                        >
                            <Download className="w-4 h-4" />
                            Xuất Excel
                        </button>

                        <label
                            style={{ background: '#2b579a' }} // Import Blue
                            className="px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2 hover:opacity-90 cursor-pointer"
                        >
                            <Upload className="w-4 h-4" />
                            Nhập Excel
                            <input
                                type="file"
                                onChange={handleImportExcel}
                                accept=".xlsx, .xls"
                                style={{ display: 'none' }}
                            />
                        </label>
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
            {showColumnSettings && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowColumnSettings(false)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-200">
                            <h2 className="text-xl font-bold text-gray-800">Cài đặt hiển thị cột</h2>
                            <button
                                onClick={() => setShowColumnSettings(false)}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {/* Action Buttons */}
                            <div className="flex gap-2 mb-4 pb-4 border-b border-gray-200">
                                <button
                                    onClick={selectAllColumns}
                                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors"
                                >
                                    Chọn tất cả
                                </button>
                                <button
                                    onClick={deselectAllColumns}
                                    className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm font-medium transition-colors"
                                >
                                    Bỏ chọn tất cả
                                </button>
                                <button
                                    onClick={resetToDefault}
                                    className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition-colors"
                                >
                                    Mặc định
                                </button>
                            </div>

                            {/* Column List */}
                            <div className="space-y-2">
                                <p className="text-sm font-semibold text-gray-700 mb-3">
                                    Chọn các cột để hiển thị trong bảng ({displayColumns.length} / {allAvailableColumns.length} đã chọn):
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {allAvailableColumns.map((column) => (
                                        <label
                                            key={column}
                                            className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-200"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={visibleColumns[column] === true}
                                                onChange={() => toggleColumn(column)}
                                                className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021] focus:ring-2"
                                            />
                                            <span className="text-sm text-gray-700 flex-1">{column}</span>
                                            {defaultColumns.includes(column) && (
                                                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Mặc định</span>
                                            )}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
                            <button
                                onClick={() => setShowColumnSettings(false)}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                            >
                                Đóng
                            </button>
                            <button
                                onClick={() => setShowColumnSettings(false)}
                                className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg text-sm font-medium transition-colors"
                            >
                                Áp dụng
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BaoCaoChiTiet;
