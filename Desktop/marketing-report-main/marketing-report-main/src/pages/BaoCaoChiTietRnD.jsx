import { ChevronLeft, Download, RefreshCw, Search, Settings, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import { supabase } from '../supabase/config';
import { COLUMN_MAPPING, PRIMARY_KEY_COLUMN } from '../types';
import { isDateInRange, parseSmartDate } from '../utils/dateParsing';

function BaoCaoChiTietRnD() {
    const { isColumnAllowed } = usePermissions();
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

    // RD Specific: List of RD Page Names to filter orders
    const [rdPageNames, setRdPageNames] = useState(new Set());

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

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchText(searchText);
            setCurrentPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchText]);

    useEffect(() => {
        fetchRdPages();
    }, []);

    const fetchRdPages = async () => {
        try {
            const { data, error } = await supabase.from('rd_pages').select('page_name');
            if (error) throw error;
            const names = new Set(data.map(p => p.page_name?.toLowerCase().trim()).filter(Boolean));
            setRdPageNames(names);
        } catch (e) {
            console.error('Error fetching RD pages', e);
        }
    };

    const allAvailableColumns = useMemo(() => {
        if (allData.length === 0) return [];
        const allKeys = new Set();
        allData.forEach(row => {
            Object.keys(row).forEach(key => {
                if (key !== PRIMARY_KEY_COLUMN) {
                    allKeys.add(key);
                }
            });
        });
        const pinnedEndColumns = ['Trạng thái giao hàng', 'Tổng tiền VNĐ'];
        const startDefaults = defaultColumns.filter(col => !pinnedEndColumns.includes(col) && allKeys.has(col));
        const otherCols = Array.from(allKeys).filter(key => !defaultColumns.includes(key)).sort();
        const endCols = pinnedEndColumns.filter(col => allKeys.has(col));
        return [...startDefaults, ...otherCols, ...endCols].filter(col => isColumnAllowed('MODULE_RND', col));
    }, [allData, isColumnAllowed]);

    const [visibleColumns, setVisibleColumns] = useState(() => {
        const saved = localStorage.getItem('baoCaoChiTietRnD_visibleColumns');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) { console.error(e); }
        }
        const initial = {};
        defaultColumns.forEach(col => { initial[col] = true; });
        return initial;
    });

    const displayColumns = useMemo(() => {
        return allAvailableColumns.filter(col => visibleColumns[col] === true);
    }, [allAvailableColumns, visibleColumns]);

    useEffect(() => {
        if (Object.keys(visibleColumns).length > 0) {
            localStorage.setItem('baoCaoChiTietRnD_visibleColumns', JSON.stringify(visibleColumns));
        }
    }, [visibleColumns]);

    const mapSupabaseToUI = (item) => ({
        "Mã đơn hàng": item.order_code,
        "Ngày lên đơn": item.order_date || item.created_at?.split('T')[0],
        "Name*": item.customer_name,
        "Phone*": item.customer_phone,
        "Add": item.customer_address,
        "City": item.city,
        "State": item.state,
        "Khu vực": item.country || item.area,
        "Zipcode": item.zipcode,
        "Mặt hàng": item.product_main || item.product,
        "Tên mặt hàng 1": item.product_name_1 || item.product_main || item.product,
        "Tổng tiền VNĐ": item.total_amount_vnd,
        "Hình thức thanh toán": item.payment_method_text || item.payment_method,
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
        "Tiền Hàng": item.sale_price || item.goods_amount,
        "Tiền Việt đã đối soát": item.reconciled_vnd || item.reconciled_amount,
        "Phí Chung": item.general_fee,
        "Phí bay": item.flight_fee,
        "Thuê TK": item.account_rental_fee,
        "Phí xử lý đơn đóng hàng-Lưu kho(usd)": item.general_fee,
        "Thời gian cutoff": item.cutoff_time,
        "Đơn vị vận chuyển": item.shipping_unit || item.shipping_carrier,
        "Kế toán xác nhận thu tiền về": item.accountant_confirm,
        "Trạng thái thu tiền": item.payment_status_detail,
        "Lý do": item.reason,
        "Page": item.page_name,
        "_id": item.id,
        "_source": 'supabase'
    });

    const loadData = async () => {
        setLoading(true);
        try {
            let query = supabase.from('orders').select('*');
            if (startDate && endDate) {
                query = query.gte('order_date', startDate).lte('order_date', `${endDate}T23:59:59`);
            } else {
                query = query.limit(200);
            }
            const { data: supaData, error: supaError } = await query.order('order_date', { ascending: false });
            if (supaError) throw supaError;

            // Apply RD Page Name Filter if we have known RD pages
            let resultData = supaData || [];

            // Only filter if we actually have RD pages to filter by, otherwise assume empty or show all (safest is to show nothing if not matching to avoid data leak from MKT?)
            // But usually separating by Page Name is key.
            // If rdPageNames is empty, we show empty? Or show warning?
            // Let's filter strictly if we want "R&D Orders".

            // NOTE: To make it usable even if rd_pages is empty (e.g. strict matching fail), 
            // maybe we shouldn't filter strict yet unless user requests.
            // BUT the requirement is "RD Management". It implies separation.
            // I will filter by page_name in rdPageNames.

            if (rdPageNames.size > 0) {
                resultData = resultData.filter(item => {
                    const pName = item.page_name?.toLowerCase().trim();
                    // Include if Page is R&D OR if Team is R&D (manually tagged)
                    return (pName && rdPageNames.has(pName)) || item.team === 'RD' || item.team === 'R&D';
                });
            } else {
                // If no RD Pages defined, maybe show empty and alert?
                // Or maybe show nothing.
                resultData = [];
                // console.warn("No RD Pages defined to filter orders.");
            }

            const supaMapped = resultData.map(mapSupabaseToUI);
            setAllData(supaMapped);
        } catch (error) {
            console.error('Load data error:', error);
            alert(`❌ Lỗi tải dữ liệu: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (rdPageNames.size > 0 || loading) {
            loadData();
        } else {
            // Try load once if rdPageNames is empty but maybe fetch finished?
            // Actually if rdPageNames empty, data will be empty.
            loadData();
        }
    }, [startDate, endDate, rdPageNames]); // Reload when RD pages loaded

    const uniqueMarkets = useMemo(() => {
        const markets = new Set();
        allData.forEach(row => {
            const market = row["Khu vực"] || row["khu vực"];
            if (market) markets.add(String(market).trim());
        });
        return Array.from(markets).sort();
    }, [allData]);

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

    const filteredData = useMemo(() => {
        let data = [...allData];
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
        if (startDate || endDate) {
            data = data.filter(row => isDateInRange(row["Ngày lên đơn"], startDate, endDate));
        }
        if (filterMarket.length > 0) {
            data = data.filter(row => filterMarket.includes(String(row["Khu vực"] || row["khu vực"]).trim()));
        }
        if (filterProduct.length > 0) {
            data = data.filter(row => filterProduct.includes(String(row["Mặt hàng"]).trim()));
        }
        if (filterStatus.length > 0) {
            data = data.filter(row => filterStatus.includes(String(row["Trạng thái giao hàng"]).trim()));
        }
        if (sortColumn) {
            data.sort((a, b) => {
                const aVal = a[sortColumn];
                const bVal = b[sortColumn];
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
    }, [allData, debouncedSearchText, filterMarket, filterProduct, filterStatus, startDate, endDate, sortColumn, sortDirection]);

    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredData.slice(start, start + rowsPerPage);
    }, [filteredData, currentPage, rowsPerPage]);

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const d = parseSmartDate(dateString);
        if (!d) return dateString;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const handleExport = () => {
        const headers = displayColumns;
        const csvRows = [
            headers.join(','),
            ...filteredData.map(row => headers.map(header => {
                const val = row[header] || '';
                const str = String(val).replace(/"/g, '""');
                return `"${str}"`;
            }).join(','))
        ];
        const csv = '\uFEFF' + csvRows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bao-cao-chi-tiet-RND-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    };

    const toggleColumn = (column) => setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }));
    const selectAllColumns = () => { const all = {}; allAvailableColumns.forEach(col => all[col] = true); setVisibleColumns(all); };
    const deselectAllColumns = () => { const none = {}; allAvailableColumns.forEach(col => none[col] = false); setVisibleColumns(none); };
    const resetToDefault = () => { const defaultCols = {}; defaultColumns.forEach(col => defaultCols[col] = true); setVisibleColumns(defaultCols); };

    return (
        <div className="min-h-screen bg-pink-50">
            <div className="bg-white border-b border-pink-200 shadow-sm sticky top-0 z-50">
                <div className="max-w-full mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link to="/" className="text-gray-600 hover:text-pink-600">
                                <ChevronLeft className="w-5 h-5" />
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold text-pink-700">DANH SÁCH ĐƠN (R&D)</h1>
                                <p className="text-xs text-gray-500">Xem chi tiết đơn hàng cho R&D (Lọc theo Page)</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                                <span className={`h-2 w-2 rounded-full ${allData.length > 0 ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                <span className="text-sm text-gray-600">{filteredData.length} / {allData.length} đơn</span>
                            </div>
                            <button
                                onClick={loadData}
                                disabled={loading}
                                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                            >
                                {loading ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div> : <RefreshCw className="w-4 h-4" />}
                                {loading ? 'Đang tải...' : 'Tải lại'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-full mx-auto px-6 py-6">
                {rdPageNames.size === 0 && (
                    <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative mb-4" role="alert">
                        <span className="block sm:inline">⚠️ Chưa có dữ liệu Pages R&D. Danh sách đơn có thể trống. Vui lòng nhập danh sách Page trong mục "Danh sách Page" trước.</span>
                    </div>
                )}

                <div className="bg-white rounded-lg shadow-sm border border-pink-200 p-4 mb-6">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tìm kiếm</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input type="text" placeholder="Mã đơn, tên, SĐT, tracking..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">Từ ngày</label><input type="date" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
                            <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">Đến ngày</label><input type="date" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
                        </div>
                        <div className="min-w-[150px]">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Khu vực</label>
                            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white" value={filterMarket[0] || ''} onChange={(e) => setFilterMarket(e.target.value ? [e.target.value] : [])}>
                                <option value="">Tất cả</option>
                                {uniqueMarkets.map(market => <option key={market} value={market}>{market}</option>)}
                            </select>
                        </div>
                        <div className="min-w-[150px]">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Mặt hàng</label>
                            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white" value={filterProduct[0] || ''} onChange={(e) => setFilterProduct(e.target.value ? [e.target.value] : [])}>
                                <option value="">Tất cả</option>
                                {uniqueProducts.map(product => <option key={product} value={product}>{product}</option>)}
                            </select>
                        </div>
                        <div className="min-w-[150px]">
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Trạng thái</label>
                            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white" value={filterStatus[0] || ''} onChange={(e) => setFilterStatus(e.target.value ? [e.target.value] : [])}>
                                <option value="">Tất cả</option>
                                {uniqueStatuses.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                        </div>
                        <button onClick={() => setShowColumnSettings(true)} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"><Settings className="w-4 h-4" /> Cài đặt cột</button>
                        <button onClick={handleExport} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"><Download className="w-4 h-4" /> Excel</button>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-pink-100 border-b border-pink-200">
                                <tr>
                                    {displayColumns.map((col) => (
                                        <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-pink-800 uppercase tracking-wider cursor-pointer hover:bg-pink-200" onClick={() => handleSort(col)}>
                                            <div className="flex items-center gap-2">{col} {sortColumn === col && <span className="text-pink-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading ? (
                                    <tr><td colSpan={displayColumns.length} className="px-4 py-8 text-center text-gray-500"><div className="flex items-center justify-center gap-2"><div className="animate-spin h-5 w-5 border-2 border-pink-500 border-t-transparent rounded-full"></div>Đang tải dữ liệu...</div></td></tr>
                                ) : paginatedData.length === 0 ? (
                                    <tr><td colSpan={displayColumns.length} className="px-4 py-8 text-center text-gray-500">
                                        {rdPageNames.size === 0 ? "Chưa có Page R&D nào được cấu hình." : "Không có dữ liệu phù hợp"}
                                    </td></tr>
                                ) : (
                                    paginatedData.map((row, index) => (
                                        <tr key={row[PRIMARY_KEY_COLUMN] || index} className="hover:bg-pink-50 transition-colors">
                                            {displayColumns.map((col) => {
                                                const key = COLUMN_MAPPING[col] || col;
                                                let value = row[key] ?? row[col] ?? '';
                                                if (col.includes('Ngày')) value = formatDate(value);
                                                if (col === 'Tổng tiền VNĐ') {
                                                    const num = parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
                                                    value = num.toLocaleString('vi-VN') + ' ₫';
                                                }
                                                return <td key={col} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{value || '-'}</td>;
                                            })}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-6">
                    <div className="flex justify-between items-center flex-wrap gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-600">Số dòng/trang:</label>
                            <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white" value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                                <option value="200">200</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-700">Trang <span className="font-bold text-pink-600">{currentPage}</span> / {totalPages || 1}</span>
                            <div className="flex gap-2">
                                <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg disabled:bg-gray-300 text-sm font-medium transition-colors shadow-sm">← Trước</button>
                                <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg disabled:bg-gray-300 text-sm font-medium transition-colors shadow-sm">Sau →</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showColumnSettings && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowColumnSettings(false)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-gray-200">
                            <h2 className="text-xl font-bold text-gray-800">Cài đặt hiển thị cột</h2>
                            <button onClick={() => setShowColumnSettings(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="flex gap-2 mb-4 pb-4 border-b border-gray-200">
                                <button onClick={selectAllColumns} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors">Chọn tất cả</button>
                                <button onClick={deselectAllColumns} className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm font-medium transition-colors">Bỏ chọn tất cả</button>
                                <button onClick={resetToDefault} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition-colors">Mặc định</button>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm font-semibold text-gray-700 mb-3">Chọn các cột để hiển thị ({displayColumns.length} / {allAvailableColumns.length} đã chọn):</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {allAvailableColumns.map((column) => (
                                        <label key={column} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-200">
                                            <input type="checkbox" checked={visibleColumns[column] === true} onChange={() => toggleColumn(column)} className="w-4 h-4 text-pink-600 border-gray-300 rounded focus:ring-pink-500 focus:ring-2" />
                                            <span className="text-sm text-gray-700 flex-1">{column}</span>
                                            {defaultColumns.includes(column) && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Mặc định</span>}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
                            <button onClick={() => setShowColumnSettings(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors">Đóng</button>
                            <button onClick={() => setShowColumnSettings(false)} className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-medium transition-colors">Áp dụng</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BaoCaoChiTietRnD;
