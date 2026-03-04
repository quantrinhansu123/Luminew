import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import './XemBaoCaoMKT.css';

export default function TestSaleData() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // API endpoint selection
    const [apiEndpoint, setApiEndpoint] = useState('');
    
    // API endpoint parameters
    const [filters, setFilters] = useState({
        team: 'HN-MKT',
        ca: 'Hết ca',
        san_pham: 'Bonavita Coffee',
        thi_truong: 'US',
        from_date: '23/01/2026',
        to_date: '23/01/2026'
    });

    // Format helper functions
    const fmtCurrency = (val) => {
        if (val === null || val === undefined) return '0đ';
        const num = Number(val);
        if (isNaN(num)) return '0đ';
        return num.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
    };

    const fmtNum = (val) => {
        if (val === null || val === undefined) return '0';
        const num = Number(val);
        if (isNaN(num)) return '0';
        return num.toLocaleString('vi-VN');
    };

    const fmtPct = (val) => {
        if (val === null || val === undefined) return '0.00%';
        const num = Number(val);
        if (isNaN(num)) return '0.00%';
        return num.toFixed(2) + '%';
    };

    const normalizeName = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const pickNameField = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        const keys = Object.keys(obj);
        const preferred = [
            'marketing',
            'sale_staff',
            'sale_name',
            'staff_name',
            'ten',
            'name'
        ];
        const exact = preferred.find((candidate) => keys.includes(candidate));
        if (exact) return exact;
        return keys.find((key) => {
            const k = key.toLowerCase();
            return k.includes('marketing') || k.includes('sale_staff') || k.includes('staff') || k.includes('ten') || k.includes('name');
        }) || null;
    };

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        
        try {
            const params = new URLSearchParams(filters);
            const endpoint = apiEndpoint ? `${apiEndpoint}` : '';
            const url = `https://lumidataapi.vercel.app/detail_reports${endpoint ? '/' + endpoint : ''}?${params.toString()}`;
            
            console.log('Fetching data from:', url);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('Data received:', result);
            
            // === FETCH ORDERS DATA ===
            let ordersData = null;
            try {
                const ordersUrl = `https://lumidataapi.vercel.app/orders?${params.toString()}`;
                console.log('Fetching orders from:', ordersUrl);
                
                const ordersResponse = await fetch(ordersUrl);
                if (ordersResponse.ok) {
                    ordersData = await ordersResponse.json();
                    console.log('Orders data received:', ordersData);
                } else {
                    console.warn('Could not fetch orders data:', ordersResponse.status);
                }
            } catch (ordersError) {
                console.warn('Error fetching orders:', ordersError);
            }
            
            // Tự động tìm array nhân sự trong response
            let personnelData = null;
            if (Array.isArray(result)) {
                personnelData = result;
            } else if (result && typeof result === 'object') {
                // Tìm array trong object
                for (const key of Object.keys(result)) {
                    if (Array.isArray(result[key]) && result[key].length > 0) {
                        console.log(`Found personnel array in key: ${key}`);
                        personnelData = result[key];
                        break;
                    }
                }
            }
            
            // === XỬ LÝ ORDERS DATA ===
            let ordersByPerson = {};
            if (ordersData) {
                let ordersList = [];
                
                // Tìm array orders trong response
                if (Array.isArray(ordersData)) {
                    ordersList = ordersData;
                } else if (ordersData.orders && Array.isArray(ordersData.orders)) {
                    ordersList = ordersData.orders;
                } else if (ordersData.data && Array.isArray(ordersData.data)) {
                    ordersList = ordersData.data;
                }
                
                console.log(`Found ${ordersList.length} orders`);
                
                // Group orders theo tên marketing
                ordersList.forEach(order => {
                    // Tìm field tên trong order
                    const nameField = pickNameField(order);
                    
                    // Tìm field doanh số
                    const revenueField = Object.keys(order).find(key =>
                        key.toLowerCase().includes('doanh_so') ||
                        key.toLowerCase().includes('revenue') ||
                        key.toLowerCase().includes('gia_tri') ||
                        key.toLowerCase().includes('total') ||
                        key.toLowerCase().includes('amount')
                    );
                    
                    if (nameField) {
                        const name = order[nameField];
                        if (name) {
                            const nameKey = normalizeName(name);
                            if (!ordersByPerson[nameKey]) {
                                ordersByPerson[nameKey] = {
                                    name,
                                    so_don: 0,
                                    doanh_so: 0
                                };
                            }
                            
                            ordersByPerson[nameKey].so_don += 1;
                            
                            if (revenueField && order[revenueField]) {
                                const revenue = Number(order[revenueField]);
                                if (!isNaN(revenue)) {
                                    ordersByPerson[nameKey].doanh_so += revenue;
                                }
                            }
                        }
                    }
                });
                
                console.log('Orders grouped by person:', ordersByPerson);
            }
            
            // Gộp dữ liệu theo tên và tính tổng
            if (personnelData && personnelData.length > 0) {
                const groupedData = {};
                
                personnelData.forEach(row => {
                    // Tìm field là tên (marketing, name, ten, etc.)
                    const nameField = pickNameField(row);
                    
                    const name = row[nameField] || 'Unknown';
                    const nameKey = normalizeName(name);
                    
                    if (!groupedData[nameKey]) {
                        // Khởi tạo object mới cho người này
                        groupedData[nameKey] = { ...row };
                        // Đánh dấu các field số để tính tổng
                        Object.keys(row).forEach(key => {
                            if (typeof row[key] === 'number') {
                                groupedData[nameKey][key] = row[key];
                            }
                        });
                    } else {
                        // Cộng dồn các giá trị số
                        Object.keys(row).forEach(key => {
                            if (typeof row[key] === 'number') {
                                groupedData[nameKey][key] = (groupedData[nameKey][key] || 0) + row[key];
                            }
                        });
                    }
                    
                    // === MERGE DỮ LIỆU ORDERS ===
                    if (ordersByPerson[nameKey]) {
                        // Thêm hoặc cập nhật số đơn từ orders
                        groupedData[nameKey]['so_don_orders'] = ordersByPerson[nameKey].so_don;
                        groupedData[nameKey]['doanh_so_orders'] = ordersByPerson[nameKey].doanh_so;
                        
                        console.log(`Merged orders for ${name}: ${ordersByPerson[nameKey].so_don} orders, ${ordersByPerson[nameKey].doanh_so} revenue`);
                    }
                });
                
                // Chuyển object thành array
                personnelData = Object.values(groupedData);
                console.log(`Grouped data by name: ${personnelData.length} unique persons`);
            }

            if ((!personnelData || personnelData.length === 0) && Object.keys(ordersByPerson).length > 0) {
                personnelData = Object.values(ordersByPerson).map((entry) => ({
                    marketing: entry.name,
                    so_don_orders: entry.so_don,
                    doanh_so_orders: entry.doanh_so
                }));
                console.log(`Using orders fallback table: ${personnelData.length} persons`);
            }
            
            // Gắn personnel data vào result để dễ dàng truy cập
            if (personnelData) {
                result._personnel = personnelData;
                result._hasOrdersData = Object.keys(ordersByPerson).length > 0;
            }
            
            setData(result);
        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleRefresh = () => {
        fetchData();
    };

    return (
        <div className="report-view-container">
            {/* Loading Overlay */}
            <div id="loading-overlay" className={loading ? 'visible' : ''}>
                Đang tải dữ liệu...
            </div>

            {/* Header Section */}
            <div className="report-header-section">
                <h2>Test Sale Data - API Statistics</h2>
            </div>

            <div className="report-container">
                {/* Sidebar Filters */}
                <div className="sidebar">
                    <h3>Bộ lọc</h3>
                    
                    <label>
                        API Endpoint:
                        <select
                            value={apiEndpoint}
                            onChange={(e) => setApiEndpoint(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                marginTop: '4px',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                fontSize: '14px'
                            }}
                        >
                            <option value="">/detail_reports (👥 danh sách nhân sự)</option>
                            <option value="statistics">statistics (📊 thống kê)</option>
                            <option value="by_marketing">by_marketing (theo MKT)</option>
                            <option value="by_team">by_team (theo team)</option>
                        </select>
                        <small style={{ fontSize: '11px', color: '#666', display: 'block', marginTop: '4px' }}>
                            Chọn endpoint để lấy dữ liệu khác nhau
                        </small>
                    </label>
                    
                    <label>
                        Team:
                        <input
                            type="text"
                            value={filters.team}
                            onChange={(e) => handleFilterChange('team', e.target.value)}
                        />
                    </label>

                    <label>
                        Ca:
                        <input
                            type="text"
                            value={filters.ca}
                            onChange={(e) => handleFilterChange('ca', e.target.value)}
                        />
                    </label>

                    <label>
                        Sản phẩm:
                        <input
                            type="text"
                            value={filters.san_pham}
                            onChange={(e) => handleFilterChange('san_pham', e.target.value)}
                        />
                    </label>

                    <label>
                        Thị trường:
                        <input
                            type="text"
                            value={filters.thi_truong}
                            onChange={(e) => handleFilterChange('thi_truong', e.target.value)}
                        />
                    </label>

                    <label>
                        Từ ngày (dd/mm/yyyy):
                        <input
                            type="text"
                            value={filters.from_date}
                            onChange={(e) => handleFilterChange('from_date', e.target.value)}
                            placeholder="23/01/2026"
                        />
                    </label>

                    <label>
                        Đến ngày (dd/mm/yyyy):
                        <input
                            type="text"
                            value={filters.to_date}
                            onChange={(e) => handleFilterChange('to_date', e.target.value)}
                            placeholder="23/01/2026"
                        />
                    </label>

                    <button
                        onClick={handleRefresh}
                        style={{
                            marginTop: '15px',
                            width: '100%',
                            padding: '10px',
                            backgroundColor: '#2d7c2d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            fontWeight: '500'
                        }}
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        {loading ? 'Đang tải...' : 'Áp dụng bộ lọc'}
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="main-content-area">
                    {/* Error State */}
                    {error && !loading && (
                        <div style={{
                            backgroundColor: '#ffebee',
                            border: '1px solid #ef5350',
                            borderRadius: '8px',
                            padding: '20px',
                            textAlign: 'center',
                            marginBottom: '20px'
                        }}>
                            <p style={{ color: '#c62828', fontWeight: 'bold', marginBottom: '8px' }}>
                                ⚠️ Lỗi khi tải dữ liệu
                            </p>
                            <p style={{ color: '#d32f2f' }}>{error}</p>
                        </div>
                    )}

                    {/* API URL Info */}
                    {!loading && (
                        <div style={{
                            backgroundColor: '#e3f2fd',
                            border: '1px solid #2196F3',
                            borderRadius: '8px',
                            padding: '15px',
                            marginBottom: '20px'
                        }}>
                            <p style={{ fontSize: '14px', color: '#424242', marginBottom: '5px' }}>
                                <strong>API Endpoint:</strong>
                            </p>
                            <p style={{
                                fontSize: '12px',
                                color: '#616161',
                                fontFamily: 'monospace',
                                wordBreak: 'break-all'
                            }}>
                                {`https://lumidataapi.vercel.app/detail_reports${apiEndpoint ? '/' + apiEndpoint : ''}?${new URLSearchParams(filters).toString()}`}
                            </p>
                        </div>
                    )}

                    {/* Data Display */}
                    {!loading && !error && data && (
                        <>
                            {/* Show data info boxes */}
                            {data.statistics && (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: '15px',
                                    marginBottom: '20px'
                                }}>
                                    <div style={{
                                        backgroundColor: '#e3f2fd',
                                        padding: '15px',
                                        borderRadius: '8px',
                                        border: '1px solid #2196F3'
                                    }}>
                                        <div style={{ fontSize: '12px', color: '#616161', marginBottom: '5px' }}>
                                            Total Count
                                        </div>
                                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2196F3' }}>
                                            {fmtNum(data.statistics.total_count || 0)}
                                        </div>
                                    </div>
                                    <div style={{
                                        backgroundColor: '#fff3e0',
                                        padding: '15px',
                                        borderRadius: '8px',
                                        border: '1px solid #FF9800'
                                    }}>
                                        <div style={{ fontSize: '12px', color: '#616161', marginBottom: '5px' }}>
                                            Total CPQC
                                        </div>
                                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#FF9800' }}>
                                            {fmtCurrency(data.statistics.total_cpqc || 0)}
                                        </div>
                                    </div>
                                    <div style={{
                                        backgroundColor: '#e8f5e9',
                                        padding: '15px',
                                        borderRadius: '8px',
                                        border: '1px solid #4CAF50'
                                    }}>
                                        <div style={{ fontSize: '12px', color: '#616161', marginBottom: '5px' }}>
                                            Total Mess
                                        </div>
                                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4CAF50' }}>
                                            {fmtNum(data.statistics.total_mess_cmt || 0)}
                                        </div>
                                    </div>
                                    <div style={{
                                        backgroundColor: '#f3e5f5',
                                        padding: '15px',
                                        borderRadius: '8px',
                                        border: '1px solid #9C27B0'
                                    }}>
                                        <div style={{ fontSize: '12px', color: '#616161', marginBottom: '5px' }}>
                                            Records Analyzed
                                        </div>
                                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#9C27B0' }}>
                                            {fmtNum(data.total_records_analyzed || 0)}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Check if we have detail data (array) or personnel data */}
                            {data._personnel && Array.isArray(data._personnel) && data._personnel.length > 0 && (
                                <div className="table-responsive-container">
                                    <h3 style={{ 
                                        color: '#fff',
                                        backgroundColor: '#2d7c2d',
                                        padding: '12px 15px',
                                        margin: '0 0 0 0',
                                        fontWeight: '700',
                                        fontSize: '18px',
                                        borderRadius: '8px 8px 0 0',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}>
                                        BÁO CÁO TỔNG HỢP
                                    </h3>
                                    <div style={{
                                        backgroundColor: '#fff3e0',
                                        padding: '10px 15px',
                                        borderLeft: '4px solid #FF9800',
                                        marginBottom: '10px',
                                        fontSize: '14px',
                                        color: '#e65100'
                                    }}>
                                        ℹ️ Dữ liệu đã được <strong>gộp và tổng hợp theo tên nhân sự</strong>. Mỗi dòng hiển thị tổng các chỉ số của từng người.
                                        {data._hasOrdersData && (
                                            <div style={{ marginTop: '5px', color: '#2e7d32' }}>
                                                ✅ Đã kết hợp dữ liệu từ <strong>orders</strong> (cột "Số Đơn Orders" và "Doanh Số Orders")
                                            </div>
                                        )}
                                    </div>
                                    <table className="report-table sortable-table" style={{ marginTop: 0 }}>
                                        <thead>
                                            <tr>
                                                <th className="green-header">STT</th>
                                                {Object.keys(data._personnel[0]).map((key) => {
                                                    let displayName = key
                                                        .replace(/_/g, ' ')
                                                        .replace(/\b\w/g, c => c.toUpperCase());
                                                    
                                                    const keyLower = key.toLowerCase();
                                                    if (keyLower.includes('marketing') || keyLower.includes('ten') || keyLower.includes('name')) {
                                                        displayName = 'Marketing';
                                                    } else if (keyLower.includes('so_mess') || keyLower.includes('mess')) {
                                                        displayName = 'Số Mess';
                                                    } else if (keyLower === 'cpqc' || keyLower === 'cp_qc') {
                                                        displayName = 'CPQC';
                                                    } else if (keyLower.includes('team')) {
                                                        displayName = 'Team';
                                                    } else if (keyLower === 'so_don_orders') {
                                                        displayName = '✅ Số Đơn (Orders)';
                                                    } else if (keyLower === 'doanh_so_orders') {
                                                        displayName = '✅ Doanh Số (Orders)';
                                                    }
                                                    
                                                    let headerClass = 'green-header';
                                                    
                                                    if (keyLower.includes('so_don') || 
                                                        keyLower.includes('so_mess') ||
                                                        keyLower.includes('mess') ||
                                                        keyLower.includes('count') ||
                                                        keyLower.includes('orders')) {
                                                        headerClass = 'blue-header';
                                                    } else if (keyLower.includes('doanh') || 
                                                               keyLower.includes('revenue') ||
                                                               keyLower.includes('cp') ||
                                                               keyLower.includes('cost')) {
                                                        headerClass = 'yellow-header';
                                                    }
                                                    
                                                    return (
                                                        <th key={key} className={headerClass}>
                                                            {displayName}
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* TỔNG CỘNG Row */}
                                            <tr className="total-row">
                                                <td colSpan={2} className="text-center" style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>
                                                    TỔNG CỘNG
                                                </td>
                                                {Object.entries(data._personnel[0]).slice(1).map(([key, _], colIdx) => {
                                                    const keyLower = key.toLowerCase();
                                                    const isNumber = data._personnel.every(row => 
                                                        typeof row[key] === 'number' || 
                                                        row[key] === null || 
                                                        row[key] === undefined
                                                    );
                                                    
                                                    if (isNumber) {
                                                        const sum = data._personnel.reduce((acc, row) => {
                                                            const val = Number(row[key]);
                                                            return acc + (isNaN(val) ? 0 : val);
                                                        }, 0);
                                                        
                                                        const isCurrency = keyLower.includes('doanh') ||
                                                                         keyLower.includes('revenue') ||
                                                                         keyLower.includes('gia') ||
                                                                         keyLower.includes('price') ||
                                                                         keyLower.includes('cp') ||
                                                                         keyLower.includes('cost') ||
                                                                         keyLower.includes('chi_phi');
                                                        
                                                        const isPercentage = keyLower.includes('rate') ||
                                                                           keyLower.includes('ti_le') ||
                                                                           keyLower.includes('ty_le') ||
                                                                           keyLower.includes('percent');
                                                        
                                                        let displayValue;
                                                        if (isCurrency) {
                                                            displayValue = fmtCurrency(sum);
                                                        } else if (isPercentage) {
                                                            const avg = sum / data._personnel.length;
                                                            displayValue = fmtPct(avg);
                                                        } else {
                                                            displayValue = fmtNum(sum);
                                                        }
                                                        
                                                        return <td key={colIdx}>{displayValue}</td>;
                                                    } else {
                                                        return <td key={colIdx}></td>;
                                                    }
                                                })}
                                            </tr>
                                            
                                            {/* Data Rows */}
                                            {data._personnel.map((row, idx) => (
                                                <tr key={idx}>
                                                    <td className="text-center">{idx + 1}</td>
                                                    {Object.entries(row).map(([key, value], vIdx) => {
                                                        const isNumber = typeof value === 'number' && !key.toLowerCase().includes('id');
                                                        const keyLower = key.toLowerCase();
                                                        
                                                        const isCurrency = isNumber && (
                                                            keyLower.includes('doanh') ||
                                                            keyLower.includes('revenue') ||
                                                            keyLower.includes('gia') ||
                                                            keyLower.includes('price') ||
                                                            keyLower.includes('cp') ||
                                                            keyLower.includes('cost') ||
                                                            keyLower.includes('chi_phi')
                                                        );
                                                        const isPercentage = isNumber && (
                                                            keyLower.includes('rate') ||
                                                            keyLower.includes('ti_le') ||
                                                            keyLower.includes('ty_le') ||
                                                            keyLower.includes('percent')
                                                        );

                                                        let displayValue;
                                                        if (value === null || value === undefined || value === '') {
                                                            displayValue = '-';
                                                        } else if (isCurrency) {
                                                            displayValue = fmtCurrency(value);
                                                        } else if (isPercentage) {
                                                            displayValue = fmtPct(value);
                                                        } else if (isNumber) {
                                                            displayValue = fmtNum(value);
                                                        } else if (typeof value === 'object') {
                                                            displayValue = JSON.stringify(value);
                                                        } else {
                                                            displayValue = String(value);
                                                        }

                                                        const isTextColumn = !isNumber || 
                                                                           keyLower.includes('name') || 
                                                                           keyLower.includes('ten') ||
                                                                           keyLower.includes('team') || 
                                                                           keyLower.includes('email') ||
                                                                           keyLower.includes('product') ||
                                                                           keyLower.includes('san_pham') ||
                                                                           keyLower.includes('market') ||
                                                                           keyLower.includes('thi_truong') ||
                                                                           keyLower.includes('ca') ||
                                                                           keyLower.includes('shift') ||
                                                                           keyLower.includes('ngay') ||
                                                                           keyLower.includes('date') ||
                                                                           keyLower.includes('marketing');

                                                        return (
                                                            <td
                                                                key={vIdx}
                                                                className={isTextColumn ? 'text-left' : ''}
                                                            >
                                                                {displayValue}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* If data is a simple array, show table */}
                            {Array.isArray(data) && data.length > 0 && (
                                <div className="table-responsive-container">
                                    <h3 style={{ 
                                        color: '#fff',
                                        backgroundColor: '#2d7c2d',
                                        padding: '12px 15px',
                                        margin: '0 0 0 0',
                                        fontWeight: '700',
                                        fontSize: '18px',
                                        borderRadius: '8px 8px 0 0',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}>
                                        BÁO CÁO TỔNG HỢP
                                    </h3>
                                    <div style={{
                                        backgroundColor: '#fff3e0',
                                        padding: '10px 15px',
                                        borderLeft: '4px solid #FF9800',
                                        marginBottom: '10px',
                                        fontSize: '14px',
                                        color: '#e65100'
                                    }}>
                                        ℹ️ Dữ liệu đã được <strong>gộp và tổng hợp theo tên nhân sự</strong>. Mỗi dòng hiển thị tổng các chỉ số của từng người.
                                    </div>
                                    <table className="report-table sortable-table" style={{ marginTop: 0 }}>
                                        <thead>
                                            <tr>
                                                <th className="green-header">STT</th>
                                                {Object.keys(data[0]).map((key) => {
                                                    // Tên cột dễ đọc hơn
                                                    let displayName = key
                                                        .replace(/_/g, ' ')
                                                        .replace(/\b\w/g, c => c.toUpperCase());
                                                    
                                                    // Custom names cho một số cột phổ biến
                                                    const keyLower = key.toLowerCase();
                                                    if (keyLower.includes('marketing') || keyLower.includes('ten') || keyLower.includes('name')) {
                                                        displayName = 'Marketing';
                                                    } else if (keyLower.includes('so_mess') || keyLower.includes('mess')) {
                                                        displayName = 'Số Mess';
                                                    } else if (keyLower === 'cpqc' || keyLower === 'cp_qc') {
                                                        displayName = 'CPQC';
                                                    } else if (keyLower.includes('team')) {
                                                        displayName = 'Team';
                                                    }
                                                    
                                                    // Phân loại color theo loại dữ liệu
                                                    let headerClass = 'green-header';
                                                    
                                                    if (keyLower.includes('so_don') || 
                                                        keyLower.includes('so_mess') ||
                                                        keyLower.includes('mess') ||
                                                        keyLower.includes('count') ||
                                                        keyLower.includes('orders')) {
                                                        headerClass = 'blue-header';
                                                    } else if (keyLower.includes('doanh') || 
                                                               keyLower.includes('revenue') ||
                                                               keyLower.includes('cp') ||
                                                               keyLower.includes('cost')) {
                                                        headerClass = 'yellow-header';
                                                    }
                                                    
                                                    return (
                                                        <th key={key} className={headerClass}>
                                                            {displayName}
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* TỔNG CỘNG Row */}
                                            <tr className="total-row">
                                                <td colSpan={2} className="text-center" style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>
                                                    TỔNG CỘNG
                                                </td>
                                                {Object.entries(data[0]).slice(1).map(([key, _], colIdx) => {
                                                    // Tính tổng cho cột này
                                                    const keyLower = key.toLowerCase();
                                                    const isNumber = data.every(row => 
                                                        typeof row[key] === 'number' || 
                                                        row[key] === null || 
                                                        row[key] === undefined
                                                    );
                                                    
                                                    if (isNumber) {
                                                        const sum = data.reduce((acc, row) => {
                                                            const val = Number(row[key]);
                                                            return acc + (isNaN(val) ? 0 : val);
                                                        }, 0);
                                                        
                                                        // Format giá trị tổng
                                                        const isCurrency = keyLower.includes('doanh') ||
                                                                         keyLower.includes('revenue') ||
                                                                         keyLower.includes('gia') ||
                                                                         keyLower.includes('price') ||
                                                                         keyLower.includes('cp') ||
                                                                         keyLower.includes('cost') ||
                                                                         keyLower.includes('chi_phi');
                                                        
                                                        const isPercentage = keyLower.includes('rate') ||
                                                                           keyLower.includes('ti_le') ||
                                                                           keyLower.includes('ty_le') ||
                                                                           keyLower.includes('percent');
                                                        
                                                        let displayValue;
                                                        if (isCurrency) {
                                                            displayValue = fmtCurrency(sum);
                                                        } else if (isPercentage) {
                                                            // Tính trung bình cho %
                                                            const avg = sum / data.length;
                                                            displayValue = fmtPct(avg);
                                                        } else {
                                                            displayValue = fmtNum(sum);
                                                        }
                                                        
                                                        return <td key={colIdx}>{displayValue}</td>;
                                                    } else {
                                                        return <td key={colIdx}></td>;
                                                    }
                                                })}
                                            </tr>
                                            
                                            {/* Data Rows */}
                                            {data.map((row, idx) => (
                                                <tr key={idx}>
                                                    <td className="text-center">{idx + 1}</td>
                                                    {Object.entries(row).map(([key, value], vIdx) => {
                                                        // Determine if value should be formatted
                                                        const isNumber = typeof value === 'number' && !key.toLowerCase().includes('id');
                                                        const keyLower = key.toLowerCase();
                                                        
                                                        const isCurrency = isNumber && (
                                                            keyLower.includes('doanh') ||
                                                            keyLower.includes('revenue') ||
                                                            keyLower.includes('gia') ||
                                                            keyLower.includes('price') ||
                                                            keyLower.includes('cp') ||
                                                            keyLower.includes('cost') ||
                                                            keyLower.includes('chi_phi')
                                                        );
                                                        const isPercentage = isNumber && (
                                                            keyLower.includes('rate') ||
                                                            keyLower.includes('ti_le') ||
                                                            keyLower.includes('ty_le') ||
                                                            keyLower.includes('percent')
                                                        );

                                                        let displayValue;
                                                        if (value === null || value === undefined || value === '') {
                                                            displayValue = '-';
                                                        } else if (isCurrency) {
                                                            displayValue = fmtCurrency(value);
                                                        } else if (isPercentage) {
                                                            displayValue = fmtPct(value);
                                                        } else if (isNumber) {
                                                            displayValue = fmtNum(value);
                                                        } else if (typeof value === 'object') {
                                                            displayValue = JSON.stringify(value);
                                                        } else {
                                                            displayValue = String(value);
                                                        }

                                                        // Xác định căn lề
                                                        const isTextColumn = !isNumber || 
                                                                           keyLower.includes('name') || 
                                                                           keyLower.includes('ten') ||
                                                                           keyLower.includes('team') || 
                                                                           keyLower.includes('email') ||
                                                                           keyLower.includes('product') ||
                                                                           keyLower.includes('san_pham') ||
                                                                           keyLower.includes('market') ||
                                                                           keyLower.includes('thi_truong') ||
                                                                           keyLower.includes('ca') ||
                                                                           keyLower.includes('shift') ||
                                                                           keyLower.includes('ngay') ||
                                                                           keyLower.includes('date') ||
                                                                           keyLower.includes('marketing');

                                                        return (
                                                            <td
                                                                key={vIdx}
                                                                className={isTextColumn ? 'text-left' : ''}
                                                            >
                                                                {displayValue}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* If no detail data available, show message */}
                            {!Array.isArray(data) && (!data._personnel || data._personnel.length === 0) && (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '40px',
                                    backgroundColor: '#fff',
                                    borderRadius: '8px',
                                    border: '1px solid #e0e0e0'
                                }}>
                                    <p style={{ color: '#ff9800', fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
                                        ℹ️ Dữ liệu trả về
                                    </p>
                                    <p style={{ color: '#616161' }}>
                                        API đã trả về thống kê tổng hợp nhưng không có dữ liệu chi tiết từng nhân sự.
                                    </p>
                                    {data.total_records_analyzed === 0 && (
                                        <p style={{ color: '#f44336', marginTop: '10px' }}>
                                            Không tìm thấy bản ghi nào với bộ lọc hiện tại.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* If data is an object but not the expected structure, show in table format */}
                            {!Array.isArray(data) && !data.statistics && typeof data === 'object' && Object.keys(data).length > 0 && (
                                <div className="table-responsive-container">
                                    <h3 style={{ color: '#2d7c2d', marginBottom: '10px' }}>
                                        Dữ liệu trả về
                                    </h3>
                                    <table className="report-table">
                                        <thead>
                                            <tr>
                                                <th className="green-header" style={{ width: '30%' }}>Trường</th>
                                                <th className="green-header">Giá trị</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(data).map(([key, value]) => (
                                                <tr key={key}>
                                                    <td className="text-left" style={{ fontWeight: '600' }}>
                                                        {key}
                                                    </td>
                                                    <td className="text-left">
                                                        {typeof value === 'object' && value !== null ? (
                                                            <pre style={{
                                                                fontSize: '12px',
                                                                backgroundColor: '#f5f5f5',
                                                                padding: '8px',
                                                                borderRadius: '4px',
                                                                overflowX: 'auto',
                                                                margin: 0
                                                            }}>
                                                                {JSON.stringify(value, null, 2)}
                                                            </pre>
                                                        ) : (
                                                            String(value ?? '')
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Show empty state */}
                            {Array.isArray(data) && data.length === 0 && (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '40px',
                                    backgroundColor: '#fff',
                                    borderRadius: '8px',
                                    color: '#757575'
                                }}>
                                    Không có dữ liệu
                                </div>
                            )}

                            {/* Raw JSON for debugging */}
                            <details style={{
                                backgroundColor: '#fff',
                                borderRadius: '8px',
                                marginTop: '20px',
                                border: '1px solid #e0e0e0'
                            }}>
                                <summary style={{
                                    cursor: 'pointer',
                                    padding: '15px',
                                    fontWeight: '600',
                                    color: '#424242',
                                    backgroundColor: '#f5f5f5',
                                    borderRadius: '8px 8px 0 0'
                                }}>
                                    📋 Raw JSON (Click để xem)
                                </summary>
                                <div style={{ padding: '15px' }}>
                                    <pre style={{
                                        backgroundColor: '#1e1e1e',
                                        color: '#4af626',
                                        padding: '15px',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        overflowX: 'auto'
                                    }}>
                                        {JSON.stringify(data, null, 2)}
                                    </pre>
                                </div>
                            </details>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
