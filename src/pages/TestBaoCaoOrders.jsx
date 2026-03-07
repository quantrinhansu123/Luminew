import { useEffect, useState } from 'react';
import { fetchOrdersFromAPI, fetchSalesReportsFromAPI, fetchSalesReportsTabFromAPI, convertDateToAPIFormat } from '../services/ordersApiService';
import MultiSelect from '../components/MultiSelect';
import './BaoCaoSale.css';

const ORDERS_API_BASE_URL = 'https://lumidataapi.vercel.app';

const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN');
const formatPercent = (value) => {
    if (value === null || value === undefined || !Number.isFinite(+value)) return '0.00%';
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
};
const formatDate = (dateValue) => {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return dateValue;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

export default function TestBaoCaoOrders() {
    // Active Tab
    const [activeTab, setActiveTab] = useState('orders');
    
    console.log('🔵 TestBaoCaoOrders rendered, activeTab:', activeTab);
    
    // Sales Reports Tab State (sử dụng /sales_reports endpoint)
    const [loadingSalesTab, setLoadingSalesTab] = useState(false);
    const [salesTabData, setSalesTabData] = useState([]);
    const [salesTabStatistics, setSalesTabStatistics] = useState(null);
    const [salesTabFilters, setSalesTabFilters] = useState({
        nhan_su: [],
        product: [],
        market: [],
        team: []
    });
    
    // Extract unique values from sales_reports for filter options
    const [salesTabFilterOptions, setSalesTabFilterOptions] = useState({
        nhan_su: [],
        products: [],
        markets: [],
        teams: []
    });
    
    // Orders Tab State
    const [loading, setLoading] = useState(false);
    const [orders, setOrders] = useState([]);
    const [statistics, setStatistics] = useState(null);
    const [filters, setFilters] = useState({
        from_date: '',
        to_date: '',
        team: [],
        ca: [],
        san_pham: [],
        thi_truong: []
    });
    
    // Sales Reports Tab State (sử dụng detail_reports)
    const [loadingSalesReports, setLoadingSalesReports] = useState(false);
    const [salesReports, setSalesReports] = useState([]);
    const [salesReportsStatistics, setSalesReportsStatistics] = useState(null);
    const [salesReportsFilters, setSalesReportsFilters] = useState({
        from_date: '',
        to_date: '',
        nhan_su: [],
        team: [],
        ca: [],
        san_pham: [],
        thi_truong: []
    });

    // Extract unique values from orders for filter options
    const [filterOptions, setFilterOptions] = useState({
        teams: [],
        shifts: [],
        products: [],
        countries: []
    });
    
    // Extract unique values from detail_reports for filter options
    const [salesReportsFilterOptions, setSalesReportsFilterOptions] = useState({
        nhan_su: [],
        teams: [],
        shifts: [],
        products: [],
        markets: []
    });

    // Set default dates (last 30 days) và auto-load dữ liệu cho Orders tab
    useEffect(() => {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);

        const defaultFilters = {
            from_date: thirtyDaysAgo.toISOString().split('T')[0],
            to_date: today.toISOString().split('T')[0],
            team: [],
            ca: [],
            san_pham: [],
            thi_truong: []
        };

        setFilters(defaultFilters);
        
        // Auto-load dữ liệu sau khi set default dates
        const loadInitialData = async () => {
            try {
                const apiFilters = {
                    from_date: convertDateToAPIFormat(defaultFilters.from_date),
                    to_date: convertDateToAPIFormat(defaultFilters.to_date),
                    team: '',
                    ca: '',
                    san_pham: '',
                    thi_truong: ''
                };

                const data = await fetchOrdersFromAPI(apiFilters);
                
                setOrders(data.data || []);
                setStatistics(data.statistics || null);
            } catch (error) {
                console.error('Error loading initial data:', error);
                // Không hiện alert khi auto-load để tránh làm phiền user
            }
        };

        // Delay một chút để đảm bảo state đã được set
        setTimeout(() => {
            loadInitialData();
        }, 100);
    }, []);

    // Set default dates cho Sales Reports tab và auto-load dữ liệu
    useEffect(() => {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);

        const defaultSalesFilters = {
            from_date: thirtyDaysAgo.toISOString().split('T')[0],
            to_date: today.toISOString().split('T')[0],
            nhan_su: [],
            team: [],
            ca: [],
            san_pham: [],
            thi_truong: []
        };

        setSalesReportsFilters(defaultSalesFilters);
        
        // Auto-load dữ liệu sau khi set default dates
        const loadInitialSalesReportsData = async () => {
            try {
                const apiFilters = {
                    from_date: convertDateToAPIFormat(defaultSalesFilters.from_date),
                    to_date: convertDateToAPIFormat(defaultSalesFilters.to_date),
                    nhan_su: '',
                    team: '',
                    ca: '',
                    san_pham: '',
                    thi_truong: ''
                };

                const data = await fetchSalesReportsFromAPI(apiFilters);
                
                setSalesReports(data.data || []);
                setSalesReportsStatistics(data.statistics || null);
            } catch (error) {
                console.error('Error loading initial sales_reports data:', error);
            }
        };

        // Delay một chút để đảm bảo state đã được set
        setTimeout(() => {
            loadInitialSalesReportsData();
        }, 200);
    }, []);

    // Extract unique values from orders (merge với options hiện có để không mất options khi filter)
    useEffect(() => {
        if (orders.length > 0) {
            const newTeams = [...new Set(orders.map(o => o.team).filter(Boolean))];
            const newShifts = [...new Set(orders.map(o => o.shift).filter(Boolean))];
            const newProducts = [...new Set(orders.map(o => o.product).filter(Boolean))];
            // Extract countries - field name là "country" trong API response
            const newCountries = [...new Set(orders.map(o => o.country).filter(Boolean))];
            
            console.log('📊 Extracted filter options:', {
                teams: newTeams.length,
                shifts: newShifts.length,
                products: newProducts.length,
                countries: newCountries.length,
                countriesList: newCountries,
                teamsList: newTeams,
                shiftsList: newShifts,
                productsList: newProducts
            });
            
            setFilterOptions(prev => {
                const updated = {
                    teams: [...new Set([...prev.teams, ...newTeams])].sort(),
                    shifts: [...new Set([...prev.shifts, ...newShifts])].sort(),
                    products: [...new Set([...prev.products, ...newProducts])].sort(),
                    countries: [...new Set([...prev.countries, ...newCountries])].sort()
                };
                
                console.log('📋 Updated filter options:', {
                    teams: updated.teams.length,
                    shifts: updated.shifts.length,
                    products: updated.products.length,
                    countries: updated.countries.length
                });
                
                return updated;
            });
        }
    }, [orders]);

    // Extract unique values from detail_reports (nhan_su, team, ca, san_pham, thi_truong)
    useEffect(() => {
        if (salesReports.length > 0) {
            // Extract nhan_su từ các field có thể chứa tên nhân sự (detail_reports sử dụng "Tên")
            const possibleNameFields = ['Tên', 'tên', 'name', 'ten', 'nhan_su', 'Nhân sự', 'nhanvien', 'staff_name'];
            const allNames = new Set();
            const allTeams = new Set();
            const allShifts = new Set();
            const allProducts = new Set();
            const allMarkets = new Set();
            
            salesReports.forEach(report => {
                // Extract names
                possibleNameFields.forEach(field => {
                    const value = report[field];
                    if (value && typeof value === 'string' && value.trim()) {
                        allNames.add(value.trim());
                    }
                });
                
                // Extract teams (detail_reports sử dụng "Team")
                const teamValue = report['Team'] || report.team;
                if (teamValue && typeof teamValue === 'string' && teamValue.trim()) {
                    allTeams.add(teamValue.trim());
                }
                
                // Extract shifts (detail_reports sử dụng "ca")
                const shiftValue = report['ca'] || report.shift || report.ca;
                if (shiftValue && typeof shiftValue === 'string' && shiftValue.trim()) {
                    allShifts.add(shiftValue.trim());
                }
                
                // Extract products (detail_reports sử dụng "Sản_phẩm" hoặc "Sản phẩm")
                const productValue = report['Sản_phẩm'] || report['Sản phẩm'] || report.product || report.san_pham;
                if (productValue && typeof productValue === 'string' && productValue.trim()) {
                    allProducts.add(productValue.trim());
                }
                
                // Extract markets (detail_reports sử dụng "Thị_trường" hoặc "Thị trường")
                const marketValue = report['Thị_trường'] || report['Thị trường'] || report.market || report.thi_truong;
                if (marketValue && typeof marketValue === 'string' && marketValue.trim()) {
                    allMarkets.add(marketValue.trim());
                }
            });
            
            const newNhanSu = Array.from(allNames).filter(Boolean).sort();
            const newTeams = Array.from(allTeams).filter(Boolean).sort();
            const newShifts = Array.from(allShifts).filter(Boolean).sort();
            const newProducts = Array.from(allProducts).filter(Boolean).sort();
            const newMarkets = Array.from(allMarkets).filter(Boolean).sort();
            
            console.log('📊 Extracted filter options from detail_reports:', {
                totalReports: salesReports.length,
                nhan_su: newNhanSu.length,
                teams: newTeams.length,
                shifts: newShifts.length,
                products: newProducts.length,
                markets: newMarkets.length
            });
            
            setSalesReportsFilterOptions(prev => {
                const updated = {
                    nhan_su: [...new Set([...prev.nhan_su, ...newNhanSu])].sort(),
                    teams: [...new Set([...prev.teams, ...newTeams])].sort(),
                    shifts: [...new Set([...prev.shifts, ...newShifts])].sort(),
                    products: [...new Set([...prev.products, ...newProducts])].sort(),
                    markets: [...new Set([...prev.markets, ...newMarkets])].sort()
                };
                
                console.log('📋 Updated detail_reports filter options:', {
                    nhan_su: updated.nhan_su.length,
                    teams: updated.teams.length,
                    shifts: updated.shifts.length,
                    products: updated.products.length,
                    markets: updated.markets.length
                });
                
                return updated;
            });
        }
    }, [salesReports]);

    // Extract unique values from sales_reports tab data (nhan_su, product, market, team)
    useEffect(() => {
        if (salesTabData.length > 0) {
            const allNames = new Set();
            const allProducts = new Set();
            const allMarkets = new Set();
            const allTeams = new Set();
            
            salesTabData.forEach(report => {
                // Extract nhan_su
                const nameValue = report.nhan_su || report['Tên'] || report.name || report['Nhân sự'];
                if (nameValue && typeof nameValue === 'string' && nameValue.trim()) {
                    allNames.add(nameValue.trim());
                }
                
                // Extract product
                const productValue = report.product || report['Sản phẩm'] || report['Sản_phẩm'] || report.san_pham;
                if (productValue && typeof productValue === 'string' && productValue.trim()) {
                    allProducts.add(productValue.trim());
                }
                
                // Extract market
                const marketValue = report.market || report['Thị trường'] || report['Thị_trường'] || report.thi_truong;
                if (marketValue && typeof marketValue === 'string' && marketValue.trim()) {
                    allMarkets.add(marketValue.trim());
                }
                
                // Extract team
                const teamValue = report.team || report['Team'] || report['Nhóm'];
                if (teamValue && typeof teamValue === 'string' && teamValue.trim()) {
                    allTeams.add(teamValue.trim());
                }
            });
            
            const newNames = Array.from(allNames).sort();
            const newProducts = Array.from(allProducts).sort();
            const newMarkets = Array.from(allMarkets).sort();
            const newTeams = Array.from(allTeams).sort();
            
            setSalesTabFilterOptions({
                nhan_su: newNames,
                products: newProducts,
                markets: newMarkets,
                teams: newTeams
            });
            
            console.log('📊 Extracted Sales Tab filter options:', {
                nhan_su: newNames.length,
                products: newProducts.length,
                markets: newMarkets.length,
                teams: newTeams.length
            });
        }
    }, [salesTabData]);

    const loadData = async () => {
        if (!filters.from_date || !filters.to_date) {
            console.warn('⚠️ Cannot load data: missing date range');
            return;
        }

        setLoading(true);
        // Clear old data immediately để user thấy đang loading
        setOrders([]);
        setStatistics(null);
        
        try {
            // Convert array filters to comma-separated string for API
            const apiFilters = {
                from_date: convertDateToAPIFormat(filters.from_date),
                to_date: convertDateToAPIFormat(filters.to_date),
                team: Array.isArray(filters.team) ? filters.team.join(',') : (filters.team || ''),
                ca: Array.isArray(filters.ca) ? filters.ca.join(',') : (filters.ca || ''),
                san_pham: Array.isArray(filters.san_pham) ? filters.san_pham.join(',') : (filters.san_pham || ''),
                thi_truong: Array.isArray(filters.thi_truong) ? filters.thi_truong.join(',') : (filters.thi_truong || '')
            };

            console.log('📡 Loading data with filters:', apiFilters);
            const data = await fetchOrdersFromAPI(apiFilters);
            
            console.log('✅ Data loaded from API:', {
                ordersCount: data.data?.length || 0,
                totalOrders: data.statistics?.total_orders || 0,
                firstOrder: data.data?.[0] ? {
                    country: data.data[0].country,
                    team: data.data[0].team,
                    product: data.data[0].product,
                    shift: data.data[0].shift
                } : null
            });
            
            // Update state với data mới
            let newOrders = data.data || [];
            
            // CLIENT-SIDE FILTERING: Đảm bảo filter đúng nếu API không filter đúng
            // Filters giờ là arrays, không cần parse
            
            // Filter theo thi_truong (country) - hỗ trợ nhiều giá trị
            if (Array.isArray(filters.thi_truong) && filters.thi_truong.length > 0) {
                const beforeFilter = newOrders.length;
                newOrders = newOrders.filter(order => {
                    const orderCountry = String(order.country || '').trim();
                    return filters.thi_truong.includes(orderCountry);
                });
                console.log(`🔍 Client-side filter thi_truong (${filters.thi_truong.length} values): ${beforeFilter} → ${newOrders.length} orders`);
            }
            
            // Filter theo team - hỗ trợ nhiều giá trị
            if (Array.isArray(filters.team) && filters.team.length > 0) {
                const beforeFilter = newOrders.length;
                newOrders = newOrders.filter(order => {
                    const orderTeam = String(order.team || '').trim();
                    return filters.team.includes(orderTeam);
                });
                console.log(`🔍 Client-side filter team (${filters.team.length} values): ${beforeFilter} → ${newOrders.length} orders`);
            }
            
            // Filter theo ca (shift) - hỗ trợ nhiều giá trị
            if (Array.isArray(filters.ca) && filters.ca.length > 0) {
                const beforeFilter = newOrders.length;
                newOrders = newOrders.filter(order => {
                    const orderShift = String(order.shift || '').trim();
                    // Shift có thể chứa nhiều ca như "Giữa ca,Hết ca", nên check nếu có bất kỳ filter shift nào match
                    return filters.ca.some(filterShift => orderShift.includes(filterShift));
                });
                console.log(`🔍 Client-side filter ca (${filters.ca.length} values): ${beforeFilter} → ${newOrders.length} orders`);
            }
            
            // Filter theo san_pham (product) - hỗ trợ nhiều giá trị
            if (Array.isArray(filters.san_pham) && filters.san_pham.length > 0) {
                const beforeFilter = newOrders.length;
                newOrders = newOrders.filter(order => {
                    const orderProduct = String(order.product || '').trim();
                    return filters.san_pham.includes(orderProduct);
                });
                console.log(`🔍 Client-side filter san_pham (${filters.san_pham.length} values): ${beforeFilter} → ${newOrders.length} orders`);
            }
            
            const newStatistics = data.statistics || null;
            
            console.log('🔄 Updating state with:', {
                ordersCount: newOrders.length,
                hasStatistics: !!newStatistics,
                countriesInFilteredData: [...new Set(newOrders.map(o => o.country).filter(Boolean))]
            });
            
            setOrders(newOrders);
            setStatistics(newStatistics);
            
            // Verify state update
            setTimeout(() => {
                console.log('✅ State updated. Current orders count:', newOrders.length);
            }, 100);
            
        } catch (error) {
            console.error('❌ Error loading data:', error);
            alert('Lỗi khi tải dữ liệu: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (field, value) => {
        console.log(`🔄 Filter changed: ${field} =`, value);
        setFilters(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSearch = () => {
        if (!filters.from_date || !filters.to_date) {
            alert('Vui lòng chọn từ ngày và đến ngày');
            return;
        }
        
        console.log('🔍 Searching with filters:', filters);
        loadData();
    };

    const handleClearFilters = () => {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);

        setFilters({
            from_date: thirtyDaysAgo.toISOString().split('T')[0],
            to_date: today.toISOString().split('T')[0],
            team: [],
            ca: [],
            san_pham: [],
            thi_truong: []
        });
    };

    // Sales Reports Functions
    const loadSalesReportsData = async () => {
        if (!salesReportsFilters.from_date || !salesReportsFilters.to_date) {
            console.warn('⚠️ Cannot load sales_reports data: missing date range');
            return;
        }

        setLoadingSalesReports(true);
        setSalesReports([]);
        setSalesReportsStatistics(null);
        
        try {
            const apiFilters = {
                from_date: convertDateToAPIFormat(salesReportsFilters.from_date),
                to_date: convertDateToAPIFormat(salesReportsFilters.to_date),
                nhan_su: Array.isArray(salesReportsFilters.nhan_su) 
                    ? salesReportsFilters.nhan_su.join(',') 
                    : (salesReportsFilters.nhan_su || ''),
                team: Array.isArray(salesReportsFilters.team) 
                    ? salesReportsFilters.team.join(',') 
                    : (salesReportsFilters.team || ''),
                ca: Array.isArray(salesReportsFilters.ca) 
                    ? salesReportsFilters.ca.join(',') 
                    : (salesReportsFilters.ca || ''),
                san_pham: Array.isArray(salesReportsFilters.san_pham) 
                    ? salesReportsFilters.san_pham.join(',') 
                    : (salesReportsFilters.san_pham || ''),
                thi_truong: Array.isArray(salesReportsFilters.thi_truong) 
                    ? salesReportsFilters.thi_truong.join(',') 
                    : (salesReportsFilters.thi_truong || '')
            };

            console.log('📡 Loading detail_reports data with filters:', apiFilters);
            const data = await fetchSalesReportsFromAPI(apiFilters);
            
            console.log('✅ Detail Reports Data loaded from API:', {
                reportsCount: data.data?.length || data.length || 0,
                hasStatistics: !!data.statistics,
                dataStructure: data.data ? 'object with data property' : 'direct array'
            });
            
            // Xử lý cả 2 trường hợp: {data: [...]} hoặc trực tiếp là array
            let newReports = data.data || data || [];
            
            // Client-side filtering để đảm bảo filter đúng
            // Filter nhan_su
            if (Array.isArray(salesReportsFilters.nhan_su) && salesReportsFilters.nhan_su.length > 0) {
                const beforeFilter = newReports.length;
                const possibleNameFields = ['Tên', 'tên', 'name', 'ten', 'nhan_su', 'Nhân sự', 'nhanvien', 'staff_name'];
                newReports = newReports.filter(report => {
                    const reportName = possibleNameFields
                        .map(field => String(report[field] || '').trim())
                        .find(name => name) || '';
                    return salesReportsFilters.nhan_su.some(filterName => {
                        const filterNameLower = filterName.toLowerCase().trim();
                        const reportNameLower = reportName.toLowerCase().trim();
                        return reportNameLower === filterNameLower || 
                               reportNameLower.includes(filterNameLower) || 
                               filterNameLower.includes(reportNameLower);
                    });
                });
                console.log(`🔍 Client-side filter nhan_su (${salesReportsFilters.nhan_su.length} values): ${beforeFilter} → ${newReports.length} reports`);
            }
            
            // Filter team
            if (Array.isArray(salesReportsFilters.team) && salesReportsFilters.team.length > 0) {
                const beforeFilter = newReports.length;
                newReports = newReports.filter(report => {
                    const reportTeam = String(report['Team'] || report.team || '').trim();
                    return salesReportsFilters.team.includes(reportTeam);
                });
                console.log(`🔍 Client-side filter team (${salesReportsFilters.team.length} values): ${beforeFilter} → ${newReports.length} reports`);
            }
            
            // Filter ca (shift)
            if (Array.isArray(salesReportsFilters.ca) && salesReportsFilters.ca.length > 0) {
                const beforeFilter = newReports.length;
                newReports = newReports.filter(report => {
                    const reportShift = String(report['ca'] || report.shift || report.ca || '').trim();
                    return salesReportsFilters.ca.some(filterShift => reportShift.includes(filterShift));
                });
                console.log(`🔍 Client-side filter ca (${salesReportsFilters.ca.length} values): ${beforeFilter} → ${newReports.length} reports`);
            }
            
            // Filter san_pham (product)
            if (Array.isArray(salesReportsFilters.san_pham) && salesReportsFilters.san_pham.length > 0) {
                const beforeFilter = newReports.length;
                newReports = newReports.filter(report => {
                    const reportProduct = String(report['Sản_phẩm'] || report['Sản phẩm'] || report.product || report.san_pham || '').trim();
                    return salesReportsFilters.san_pham.includes(reportProduct);
                });
                console.log(`🔍 Client-side filter san_pham (${salesReportsFilters.san_pham.length} values): ${beforeFilter} → ${newReports.length} reports`);
            }
            
            // Filter thi_truong (market)
            if (Array.isArray(salesReportsFilters.thi_truong) && salesReportsFilters.thi_truong.length > 0) {
                const beforeFilter = newReports.length;
                newReports = newReports.filter(report => {
                    const reportMarket = String(report['Thị_trường'] || report['Thị trường'] || report.market || report.thi_truong || '').trim();
                    return salesReportsFilters.thi_truong.includes(reportMarket);
                });
                console.log(`🔍 Client-side filter thi_truong (${salesReportsFilters.thi_truong.length} values): ${beforeFilter} → ${newReports.length} reports`);
            }
            
            setSalesReports(newReports);
            setSalesReportsStatistics(data.statistics || null);
            
        } catch (error) {
            console.error('❌ Error loading sales_reports data:', error);
            const errorMessage = error.message || 'Unknown error';
            console.error('📋 Full error details:', {
                message: errorMessage,
                filters: apiFilters,
                stack: error.stack
            });
            
            // Hiển thị thông báo lỗi chi tiết hơn
            const userMessage = errorMessage.includes('404') 
                ? `Lỗi 404: Endpoint /detail_reports không tồn tại. Vui lòng kiểm tra lại API endpoint.\n\nURL đã thử: ${ORDERS_API_BASE_URL}/detail_reports`
                : `Lỗi khi tải dữ liệu detail_reports: ${errorMessage}`;
            
            alert(userMessage);
        } finally {
            setLoadingSalesReports(false);
        }
    };

    const handleSalesReportsFilterChange = (field, value) => {
        console.log(`🔄 Sales Reports Filter changed: ${field} =`, value);
        setSalesReportsFilters(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSalesReportsSearch = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        
        if (!salesReportsFilters.from_date || !salesReportsFilters.to_date) {
            alert('Vui lòng chọn từ ngày và đến ngày');
            return;
        }
        
        console.log('🔘 Sales Reports Search button clicked');
        console.log('🔍 Searching sales_reports with filters:', salesReportsFilters);
        loadSalesReportsData();
    };

    const handleClearSalesReportsFilters = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);

        setSalesReportsFilters({
            from_date: thirtyDaysAgo.toISOString().split('T')[0],
            to_date: today.toISOString().split('T')[0],
            nhan_su: [],
            team: [],
            ca: [],
            san_pham: [],
            thi_truong: []
        });
        
        console.log('🧹 Sales Reports Filters cleared.');
    };

    // ========== SALES REPORTS TAB FUNCTIONS (/sales_reports endpoint) ==========
    const loadSalesTabData = async () => {
        setLoadingSalesTab(true);
        setSalesTabData([]);
        setSalesTabStatistics(null);
        
        try {
            const apiFilters = {
                nhan_su: Array.isArray(salesTabFilters.nhan_su) ? salesTabFilters.nhan_su.join(',') : (salesTabFilters.nhan_su || ''),
                product: Array.isArray(salesTabFilters.product) ? salesTabFilters.product.join(',') : (salesTabFilters.product || ''),
                market: Array.isArray(salesTabFilters.market) ? salesTabFilters.market.join(',') : (salesTabFilters.market || ''),
                team: Array.isArray(salesTabFilters.team) ? salesTabFilters.team.join(',') : (salesTabFilters.team || '')
            };

            console.log('📡 Loading sales_reports data with filters:', apiFilters);
            const data = await fetchSalesReportsTabFromAPI(apiFilters);
            
            console.log('✅ Sales Tab Data loaded from API:', {
                reportsCount: data.data?.length || data.length || 0,
                hasStatistics: !!data.statistics,
                dataStructure: data.data ? 'object with data property' : 'direct array'
            });
            
            let newReports = data.data || data || [];
            
            // Client-side filtering
            if (Array.isArray(salesTabFilters.nhan_su) && salesTabFilters.nhan_su.length > 0) {
                const filterNames = salesTabFilters.nhan_su.map(n => String(n).trim());
                newReports = newReports.filter(report => {
                    const reportName = String(report.nhan_su || report['Tên'] || report.name || '').trim();
                    return filterNames.includes(reportName);
                });
                console.log(`🔍 Client-side filter nhan_su (${salesTabFilters.nhan_su.length} values): ${newReports.length} reports`);
            }
            if (Array.isArray(salesTabFilters.product) && salesTabFilters.product.length > 0) {
                const filterProducts = salesTabFilters.product.map(p => String(p).trim());
                newReports = newReports.filter(report => {
                    const reportProduct = String(report.product || report['Sản phẩm'] || report['Sản_phẩm'] || '').trim();
                    return filterProducts.includes(reportProduct);
                });
                console.log(`🔍 Client-side filter product (${salesTabFilters.product.length} values): ${newReports.length} reports`);
            }
            if (Array.isArray(salesTabFilters.market) && salesTabFilters.market.length > 0) {
                const filterMarkets = salesTabFilters.market.map(m => String(m).trim());
                newReports = newReports.filter(report => {
                    const reportMarket = String(report.market || report['Thị trường'] || report['Thị_trường'] || '').trim();
                    return filterMarkets.includes(reportMarket);
                });
                console.log(`🔍 Client-side filter market (${salesTabFilters.market.length} values): ${newReports.length} reports`);
            }
            if (Array.isArray(salesTabFilters.team) && salesTabFilters.team.length > 0) {
                const filterTeams = salesTabFilters.team.map(t => String(t).trim());
                newReports = newReports.filter(report => {
                    const reportTeam = String(report.team || report['Team'] || '').trim();
                    return filterTeams.includes(reportTeam);
                });
                console.log(`🔍 Client-side filter team (${salesTabFilters.team.length} values): ${newReports.length} reports`);
            }
            
            setSalesTabData(newReports);
            setSalesTabStatistics(data.statistics || null);
            
        } catch (error) {
            console.error('❌ Error loading sales_reports data:', error);
            const errorMessage = error.message || 'Unknown error';
            console.error('📋 Full error details:', {
                message: errorMessage,
                filters: salesTabFilters,
                stack: error.stack
            });
            
            const userMessage = errorMessage.includes('404') 
                ? `Lỗi 404: Endpoint /sales_reports không tồn tại. Vui lòng kiểm tra lại API endpoint.\n\nURL đã thử: ${ORDERS_API_BASE_URL}/sales_reports`
                : `Lỗi khi tải dữ liệu sales_reports: ${errorMessage}`;
            
            alert(userMessage);
        } finally {
            setLoadingSalesTab(false);
        }
    };

    const handleSalesTabFilterChange = (field, value) => {
        console.log(`🔄 Sales Tab Filter changed: ${field} =`, value);
        setSalesTabFilters(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSalesTabSearch = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        
        console.log('🔘 Sales Tab Search button clicked');
        console.log('🔍 Searching sales_reports with filters:', salesTabFilters);
        loadSalesTabData();
    };

    const handleClearSalesTabFilters = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        
        setSalesTabFilters({
            nhan_su: [],
            product: [],
            market: [],
            team: []
        });
        
        console.log('🧹 Sales Tab Filters cleared.');
    };

    return (
        <div className="bao-cao-sale-container">
            {(loading || loadingSalesReports || loadingSalesTab) && <div className="loading-overlay">Đang tải dữ liệu...</div>}

            {/* TABS */}
            <div className="tabs-container" style={{ 
                display: 'flex', 
                gap: '8px', 
                marginBottom: '20px',
                borderBottom: '2px solid var(--border-color)',
                paddingBottom: '0'
            }}>
                <button 
                    className={`tab-button ${activeTab === 'orders' ? 'active' : ''}`}
                    onClick={() => {
                        console.log('🔘 Orders tab clicked');
                        setActiveTab('orders');
                    }}
                    style={{
                        padding: '12px 20px',
                        fontSize: '1.1em',
                        fontWeight: '600',
                        cursor: 'pointer',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: activeTab === 'orders' ? 'var(--primary-color)' : 'var(--text-medium)',
                        borderBottom: activeTab === 'orders' ? '3px solid var(--primary-color)' : '3px solid transparent',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        top: '2px'
                    }}
                >
                    Báo cáo Orders
                </button>
                <button 
                    className={`tab-button ${activeTab === 'sales_reports' ? 'active' : ''}`}
                    onClick={() => {
                        console.log('🔘 Detail Reports tab clicked');
                        setActiveTab('sales_reports');
                    }}
                    style={{
                        padding: '12px 20px',
                        fontSize: '1.1em',
                        fontWeight: '600',
                        cursor: 'pointer',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: activeTab === 'sales_reports' ? 'var(--primary-color)' : 'var(--text-medium)',
                        borderBottom: activeTab === 'sales_reports' ? '3px solid var(--primary-color)' : '3px solid transparent',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        top: '2px'
                    }}
                >
                    Báo cáo Detail Reports
                </button>
                <button 
                    className={`tab-button ${activeTab === 'sales_tab' ? 'active' : ''}`}
                    onClick={() => {
                        console.log('🔘 Sales Reports Tab clicked');
                        setActiveTab('sales_tab');
                    }}
                    style={{
                        padding: '12px 20px',
                        fontSize: '1.1em',
                        fontWeight: '600',
                        cursor: 'pointer',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: activeTab === 'sales_tab' ? 'var(--primary-color)' : 'var(--text-medium)',
                        borderBottom: activeTab === 'sales_tab' ? '3px solid var(--primary-color)' : '3px solid transparent',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        top: '2px'
                    }}
                >
                    Báo cáo Sale
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* FILTERS SECTION - HORIZONTAL */}
                <div style={{
                    backgroundColor: 'white',
                    padding: '20px',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    marginBottom: '20px'
                }}>
                    <h3 style={{
                        marginBottom: '15px',
                        color: 'var(--primary-color)',
                        fontSize: '18px',
                        fontWeight: '600'
                    }}>
                        Bộ lọc
                    </h3>

                    {/* Orders Tab Filters */}
                    {activeTab === 'orders' && (
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '15px',
                            alignItems: 'flex-end'
                        }}>
                            <div style={{ 
                                display: 'flex', 
                                gap: '12px',
                                flex: '0 0 auto'
                            }}>
                                <label style={{ margin: 0 }}>
                                    <div style={{ 
                                        fontSize: '13px', 
                                        fontWeight: '600', 
                                        color: 'var(--text-dark)',
                                        marginBottom: '6px'
                                    }}>
                                        Từ ngày
                                    </div>
                                    <input
                                        type="date"
                                        value={filters.from_date}
                                        onChange={e => handleFilterChange('from_date', e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            fontWeight: '500',
                                            transition: 'all 0.2s ease',
                                            boxSizing: 'border-box'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = 'var(--primary-light)';
                                            e.target.style.boxShadow = '0 0 0 2px rgba(139, 195, 74, 0.2)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = 'var(--border-color)';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                </label>

                                <label style={{ margin: 0 }}>
                                    <div style={{ 
                                        fontSize: '13px', 
                                        fontWeight: '600', 
                                        color: 'var(--text-dark)',
                                        marginBottom: '6px'
                                    }}>
                                        Đến ngày
                                    </div>
                                    <input
                                        type="date"
                                        value={filters.to_date}
                                        onChange={e => handleFilterChange('to_date', e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            fontWeight: '500',
                                            transition: 'all 0.2s ease',
                                            boxSizing: 'border-box'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = 'var(--primary-light)';
                                            e.target.style.boxShadow = '0 0 0 2px rgba(139, 195, 74, 0.2)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = 'var(--border-color)';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                </label>
                            </div>

                            <label style={{ margin: 0, minWidth: '180px' }}>
                                <div style={{ 
                                    fontSize: '13px', 
                                    fontWeight: '600', 
                                    color: 'var(--text-dark)',
                                    marginBottom: '6px'
                                }}>
                                    Team
                                </div>
                                <MultiSelect
                                    label="Tất cả"
                                    options={filterOptions.teams || []}
                                    selected={Array.isArray(filters.team) ? filters.team : []}
                                    onChange={(values) => handleFilterChange('team', values)}
                                    placeholder="Chọn team..."
                                    mainFilter={true}
                                />
                            </label>

                            <label style={{ margin: 0, minWidth: '180px' }}>
                                <div style={{ 
                                    fontSize: '13px', 
                                    fontWeight: '600', 
                                    color: 'var(--text-dark)',
                                    marginBottom: '6px'
                                }}>
                                    Ca
                                </div>
                                <MultiSelect
                                    label="Tất cả"
                                    options={filterOptions.shifts || []}
                                    selected={Array.isArray(filters.ca) ? filters.ca : []}
                                    onChange={(values) => handleFilterChange('ca', values)}
                                    placeholder="Chọn ca..."
                                    mainFilter={true}
                                />
                            </label>

                            <label style={{ margin: 0, minWidth: '180px' }}>
                                <div style={{ 
                                    fontSize: '13px', 
                                    fontWeight: '600', 
                                    color: 'var(--text-dark)',
                                    marginBottom: '6px'
                                }}>
                                    Sản phẩm
                                </div>
                                <MultiSelect
                                    label="Tất cả"
                                    options={filterOptions.products || []}
                                    selected={Array.isArray(filters.san_pham) ? filters.san_pham : []}
                                    onChange={(values) => handleFilterChange('san_pham', values)}
                                    placeholder="Chọn sản phẩm..."
                                    mainFilter={true}
                                />
                            </label>

                            <label style={{ margin: 0, minWidth: '180px' }}>
                                <div style={{ 
                                    fontSize: '13px', 
                                    fontWeight: '600', 
                                    color: 'var(--text-dark)',
                                    marginBottom: '6px'
                                }}>
                                    Thị trường
                                </div>
                                <MultiSelect
                                    label="Tất cả"
                                    options={filterOptions.countries || []}
                                    selected={Array.isArray(filters.thi_truong) ? filters.thi_truong : []}
                                    onChange={(values) => handleFilterChange('thi_truong', values)}
                                    placeholder="Chọn thị trường..."
                                    mainFilter={true}
                                />
                            </label>

                            <div style={{ 
                                display: 'flex', 
                                gap: '10px',
                                marginLeft: 'auto',
                                alignItems: 'flex-end'
                            }}>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        console.log('🔘 Search button clicked');
                                        handleSearch();
                                    }}
                                    disabled={loading}
                                    style={{
                                        flex: 1,
                                        padding: '12px 20px',
                                        backgroundColor: loading ? '#ccc' : 'var(--primary-color)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        opacity: loading ? 0.6 : 1,
                                        transition: 'all 0.2s ease',
                                        boxShadow: loading ? 'none' : '0 2px 4px rgba(0,0,0,0.1)'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!loading) {
                                            e.target.style.backgroundColor = 'var(--primary-dark)';
                                            e.target.style.transform = 'translateY(-1px)';
                                            e.target.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!loading) {
                                            e.target.style.backgroundColor = 'var(--primary-color)';
                                            e.target.style.transform = 'translateY(0)';
                                            e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                        }
                                    }}
                                >
                                    {loading ? 'Đang tải...' : '🔍 Tìm kiếm'}
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        console.log('🔘 Clear button clicked');
                                        handleClearFilters();
                                    }}
                                    disabled={loading}
                                    style={{
                                        padding: '12px 20px',
                                        backgroundColor: loading ? '#ccc' : '#6c757d',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        opacity: loading ? 0.6 : 1,
                                        transition: 'all 0.2s ease',
                                        boxShadow: loading ? 'none' : '0 2px 4px rgba(0,0,0,0.1)'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!loading) {
                                            e.target.style.backgroundColor = '#5a6268';
                                            e.target.style.transform = 'translateY(-1px)';
                                            e.target.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!loading) {
                                            e.target.style.backgroundColor = '#6c757d';
                                            e.target.style.transform = 'translateY(0)';
                                            e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                        }
                                    }}
                                >
                                    🗑️ Xóa
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Sales Reports Tab Filters */}
                    {activeTab === 'sales_reports' && (
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '15px',
                            alignItems: 'flex-end'
                        }}>
                            <div style={{ 
                                display: 'flex', 
                                gap: '12px',
                                flex: '0 0 auto'
                            }}>
                                <label style={{ margin: 0 }}>
                                    <div style={{ 
                                        fontSize: '13px', 
                                        fontWeight: '600', 
                                        color: 'var(--text-dark)',
                                        marginBottom: '6px'
                                    }}>
                                        Từ ngày
                                    </div>
                                    <input
                                        type="date"
                                        value={salesReportsFilters.from_date}
                                        onChange={e => handleSalesReportsFilterChange('from_date', e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            fontWeight: '500',
                                            transition: 'all 0.2s ease',
                                            boxSizing: 'border-box'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = 'var(--primary-light)';
                                            e.target.style.boxShadow = '0 0 0 2px rgba(139, 195, 74, 0.2)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = 'var(--border-color)';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                </label>

                                <label style={{ margin: 0 }}>
                                    <div style={{ 
                                        fontSize: '13px', 
                                        fontWeight: '600', 
                                        color: 'var(--text-dark)',
                                        marginBottom: '6px'
                                    }}>
                                        Đến ngày
                                    </div>
                                    <input
                                        type="date"
                                        value={salesReportsFilters.to_date}
                                        onChange={e => handleSalesReportsFilterChange('to_date', e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            fontWeight: '500',
                                            transition: 'all 0.2s ease',
                                            boxSizing: 'border-box'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = 'var(--primary-light)';
                                            e.target.style.boxShadow = '0 0 0 2px rgba(139, 195, 74, 0.2)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = 'var(--border-color)';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                </label>
                            </div>

                            <label style={{ margin: 0, minWidth: '180px' }}>
                                <div style={{ 
                                    fontSize: '13px', 
                                    fontWeight: '600', 
                                    color: 'var(--text-dark)',
                                    marginBottom: '6px'
                                }}>
                                    Nhân sự
                                </div>
                                <MultiSelect
                                    label="Tất cả"
                                    options={salesReportsFilterOptions.nhan_su || []}
                                    selected={Array.isArray(salesReportsFilters.nhan_su) ? salesReportsFilters.nhan_su : []}
                                    onChange={(values) => handleSalesReportsFilterChange('nhan_su', values)}
                                    placeholder="Chọn nhân sự..."
                                    mainFilter={true}
                                />
                            </label>

                            <label style={{ margin: 0, minWidth: '180px' }}>
                                <div style={{ 
                                    fontSize: '13px', 
                                    fontWeight: '600', 
                                    color: 'var(--text-dark)',
                                    marginBottom: '6px'
                                }}>
                                    Team
                                </div>
                                <MultiSelect
                                    label="Tất cả"
                                    options={salesReportsFilterOptions.teams || []}
                                    selected={Array.isArray(salesReportsFilters.team) ? salesReportsFilters.team : []}
                                    onChange={(values) => handleSalesReportsFilterChange('team', values)}
                                    placeholder="Chọn team..."
                                    mainFilter={true}
                                />
                            </label>

                            <label style={{ margin: 0, minWidth: '180px' }}>
                                <div style={{ 
                                    fontSize: '13px', 
                                    fontWeight: '600', 
                                    color: 'var(--text-dark)',
                                    marginBottom: '6px'
                                }}>
                                    Ca
                                </div>
                                <MultiSelect
                                    label="Tất cả"
                                    options={salesReportsFilterOptions.shifts || []}
                                    selected={Array.isArray(salesReportsFilters.ca) ? salesReportsFilters.ca : []}
                                    onChange={(values) => handleSalesReportsFilterChange('ca', values)}
                                    placeholder="Chọn ca..."
                                    mainFilter={true}
                                />
                            </label>

                            <label style={{ margin: 0, minWidth: '180px' }}>
                                <div style={{ 
                                    fontSize: '13px', 
                                    fontWeight: '600', 
                                    color: 'var(--text-dark)',
                                    marginBottom: '6px'
                                }}>
                                    Sản phẩm
                                </div>
                                <MultiSelect
                                    label="Tất cả"
                                    options={salesReportsFilterOptions.products || []}
                                    selected={Array.isArray(salesReportsFilters.san_pham) ? salesReportsFilters.san_pham : []}
                                    onChange={(values) => handleSalesReportsFilterChange('san_pham', values)}
                                    placeholder="Chọn sản phẩm..."
                                    mainFilter={true}
                                />
                            </label>

                            <label style={{ margin: 0, minWidth: '180px' }}>
                                <div style={{ 
                                    fontSize: '13px', 
                                    fontWeight: '600', 
                                    color: 'var(--text-dark)',
                                    marginBottom: '6px'
                                }}>
                                    Thị trường
                                </div>
                                <MultiSelect
                                    label="Tất cả"
                                    options={salesReportsFilterOptions.markets || []}
                                    selected={Array.isArray(salesReportsFilters.thi_truong) ? salesReportsFilters.thi_truong : []}
                                    onChange={(values) => handleSalesReportsFilterChange('thi_truong', values)}
                                    placeholder="Chọn thị trường..."
                                    mainFilter={true}
                                />
                            </label>

                            <div style={{ 
                                display: 'flex', 
                                gap: '10px',
                                marginLeft: 'auto',
                                alignItems: 'flex-end'
                            }}>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={handleSalesReportsSearch}
                                    disabled={loadingSalesReports}
                                    style={{
                                        flex: 1,
                                        padding: '12px 20px',
                                        backgroundColor: loadingSalesReports ? '#ccc' : 'var(--primary-color)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: loadingSalesReports ? 'not-allowed' : 'pointer',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        opacity: loadingSalesReports ? 0.6 : 1,
                                        transition: 'all 0.2s ease',
                                        boxShadow: loadingSalesReports ? 'none' : '0 2px 4px rgba(0,0,0,0.1)'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!loadingSalesReports) {
                                            e.target.style.backgroundColor = 'var(--primary-dark)';
                                            e.target.style.transform = 'translateY(-1px)';
                                            e.target.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!loadingSalesReports) {
                                            e.target.style.backgroundColor = 'var(--primary-color)';
                                            e.target.style.transform = 'translateY(0)';
                                            e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                        }
                                    }}
                                >
                                    {loadingSalesReports ? 'Đang tải...' : '🔍 Tìm kiếm'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClearSalesReportsFilters}
                                    disabled={loadingSalesReports}
                                    style={{
                                        padding: '12px 20px',
                                        backgroundColor: loadingSalesReports ? '#ccc' : '#6c757d',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: loadingSalesReports ? 'not-allowed' : 'pointer',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        opacity: loadingSalesReports ? 0.6 : 1,
                                        transition: 'all 0.2s ease',
                                        boxShadow: loadingSalesReports ? 'none' : '0 2px 4px rgba(0,0,0,0.1)'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!loadingSalesReports) {
                                            e.target.style.backgroundColor = '#5a6268';
                                            e.target.style.transform = 'translateY(-1px)';
                                            e.target.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!loadingSalesReports) {
                                            e.target.style.backgroundColor = '#6c757d';
                                            e.target.style.transform = 'translateY(0)';
                                            e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                        }
                                    }}
                                >
                                    🗑️ Xóa
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* MAIN CONTENT */}
                <div className="main-content" style={{ width: '100%' }}>
                    {/* Orders Tab Content */}
                    {activeTab === 'orders' && (
                        <>
                            <h2 style={{ marginBottom: '20px', color: 'var(--primary-color)' }}>
                                Báo cáo Orders từ API
                            </h2>

                    {/* Statistics Summary */}
                    {statistics && (
                        <div className="statistics-summary" style={{
                            backgroundColor: 'white',
                            padding: '20px',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}>
                            <h3 style={{ marginBottom: '15px', color: 'var(--text-dark)' }}>Tổng quan</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                                <div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-medium)', marginBottom: '5px' }}>Tổng số đơn</div>
                                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                                        {formatNumber(statistics.total_orders || 0)}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-medium)', marginBottom: '5px' }}>Tổng doanh thu</div>
                                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--success-color)' }}>
                                        {formatCurrency(statistics.total_revenue_vnd || 0)}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-medium)', marginBottom: '5px' }}>Giá trị đơn TB</div>
                                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                                        {formatCurrency(statistics.average_order_value || 0)}
                                    </div>
                                </div>
                            </div>

                            {/* Statistics by Status */}
                            {statistics.by_delivery_status && (
                                <div style={{ marginTop: '20px' }}>
                                    <h4 style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--text-dark)' }}>
                                        Theo trạng thái giao hàng
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                                        {Object.entries(statistics.by_delivery_status.count || {}).map(([status, count]) => (
                                            <div key={status} style={{
                                                padding: '10px',
                                                backgroundColor: 'var(--bg-light)',
                                                borderRadius: '4px'
                                            }}>
                                                <div style={{ fontSize: '12px', color: 'var(--text-medium)' }}>{status}</div>
                                                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatNumber(count)}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                                                    {formatPercent(statistics.by_delivery_status.percentage?.[status] || 0)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Statistics by Team */}
                            {statistics.by_team && (
                                <div style={{ marginTop: '20px' }}>
                                    <h4 style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--text-dark)' }}>
                                        Theo Team
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                                        {Object.entries(statistics.by_team.count || {}).map(([team, count]) => (
                                            <div key={team} style={{
                                                padding: '10px',
                                                backgroundColor: 'var(--bg-light)',
                                                borderRadius: '4px'
                                            }}>
                                                <div style={{ fontSize: '12px', color: 'var(--text-medium)' }}>{team}</div>
                                                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatNumber(count)}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                                                    {formatCurrency(statistics.by_team.revenue?.[team] || 0)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Orders Table */}
                    <div className="table-responsive-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Ngày tạo</th>
                                    <th>Ngày đơn</th>
                                    <th>NV Marketing</th>
                                    <th>NV Sale</th>
                                    <th>Sản phẩm</th>
                                    <th>Quốc gia</th>
                                    <th>Team</th>
                                    <th>Tổng tiền</th>
                                    <th>Trạng thái giao</th>
                                    <th>Trạng thái thanh toán</th>
                                    <th>Ca</th>
                                    <th>Kết quả check</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="13" style={{ textAlign: 'center', padding: '20px' }}>
                                            Đang tải dữ liệu...
                                        </td>
                                    </tr>
                                ) : orders.length === 0 ? (
                                    <tr>
                                        <td colSpan="13" style={{ textAlign: 'center', padding: '20px' }}>
                                            Không có dữ liệu phù hợp với bộ lọc
                                        </td>
                                    </tr>
                                ) : (
                                    orders.map((order) => (
                                        <tr key={order.id}>
                                            <td style={{ fontSize: '11px' }}>{order.id?.substring(0, 8)}...</td>
                                            <td>{formatDate(order.ngaytao)}</td>
                                            <td>{formatDate(order.order_date)}</td>
                                            <td>{order.nhanvien_maketing || '-'}</td>
                                            <td>{order.nhanvien_sale || '-'}</td>
                                            <td>{order.product || '-'}</td>
                                            <td>{order.country || '-'}</td>
                                            <td>{order.team || '-'}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                {formatCurrency(order.tongtien || order.total_amount_vnd || 0)}
                                            </td>
                                            <td>{order.delivery_status || '-'}</td>
                                            <td>{order.payment_status || '-'}</td>
                                            <td>{order.shift || '-'}</td>
                                            <td>{order.check_result || '-'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: '15px', fontSize: '12px', color: 'var(--text-medium)' }}>
                        {loading ? (
                            'Đang tải...'
                        ) : orders.length > 0 ? (
                            `Hiển thị ${orders.length} đơn hàng${statistics?.total_orders ? ` / Tổng: ${formatNumber(statistics.total_orders)} đơn` : ''}`
                        ) : (
                            'Không có dữ liệu'
                        )}
                    </div>
                        </>
                    )}

                    {/* Sales Reports Tab Content (Detail Reports) */}
                    {activeTab === 'sales_reports' && (
                        <>
                            <h2 style={{ marginBottom: '20px', color: 'var(--primary-color)' }}>
                                Báo cáo Detail Reports từ API
                            </h2>

                            {/* Statistics Summary */}
                            {salesReportsStatistics && (
                                <div className="statistics-summary" style={{
                                    backgroundColor: 'white',
                                    padding: '20px',
                                    borderRadius: '8px',
                                    marginBottom: '20px',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                }}>
                                    <h3 style={{ marginBottom: '15px', color: 'var(--text-dark)' }}>Tổng quan</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                                        {salesReportsStatistics.total_reports && (
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-medium)', marginBottom: '5px' }}>Tổng số báo cáo</div>
                                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                                                    {formatNumber(salesReportsStatistics.total_reports || 0)}
                                                </div>
                                            </div>
                                        )}
                                        {salesReportsStatistics.total_revenue && (
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-medium)', marginBottom: '5px' }}>Tổng doanh thu</div>
                                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--success-color)' }}>
                                                    {formatCurrency(salesReportsStatistics.total_revenue || 0)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Sales Reports Table */}
                            <div className="table-responsive-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Ngày</th>
                                            <th>Tên</th>
                                            <th>Email</th>
                                            <th>Team</th>
                                            <th>Ca</th>
                                            <th>Sản phẩm</th>
                                            <th>Thị trường</th>
                                            <th>CPQC</th>
                                            <th>Số Mess</th>
                                            <th>Phản hồi</th>
                                            <th>Đơn Mess</th>
                                            <th>Doanh số Mess</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingSalesReports ? (
                                            <tr>
                                                <td colSpan="13" style={{ textAlign: 'center', padding: '20px' }}>
                                                    Đang tải dữ liệu...
                                                </td>
                                            </tr>
                                        ) : salesReports.length === 0 ? (
                                            <tr>
                                                <td colSpan="13" style={{ textAlign: 'center', padding: '20px' }}>
                                                    Không có dữ liệu phù hợp với bộ lọc
                                                </td>
                                            </tr>
                                        ) : (
                                            salesReports.map((report) => {
                                                // Map field names từ tiếng Việt sang tiếng Anh (detail_reports sử dụng tên cột tiếng Việt)
                                                const reportDate = report['Ngày'] || report.date || report.ngay;
                                                const reportName = report['Tên'] || report.name || report.ten;
                                                const reportEmail = report['Email'] || report.email;
                                                const reportTeam = report['Team'] || report.team;
                                                const reportShift = report['ca'] || report.shift || report.ca;
                                                const reportProduct = report['Sản_phẩm'] || report['Sản phẩm'] || report.product || report.san_pham;
                                                const reportMarket = report['Thị_trường'] || report['Thị trường'] || report.market || report.thi_truong;
                                                const cpqc = report['CPQC'] || report.CPQC || report.cpqc || 0;
                                                const messCount = report['Số_Mess_Cmt'] || report['Số Mess Cmt'] || report.mess_count || report.so_mess_cmt || 0;
                                                // Lấy Phản hồi từ nhiều field có thể có
                                                const responseCount = report['Phản hồi'] || 
                                                                      report['Phản_hồi'] || 
                                                                      report.response_count || 
                                                                      report.phan_hoi || 
                                                                      report['Số phản hồi'] ||
                                                                      report['Số_phản_hồi'] ||
                                                                      0;
                                                const orderCount = report['Số đơn'] || report.order_count || report.so_don || 0;
                                                const revenueMess = report['Doanh số'] || report.revenue_mess || report.doanh_so || 0;
                                                
                                                return (
                                                    <tr key={report.id || report.ID || Math.random()}>
                                                        <td style={{ fontSize: '11px' }}>{(report.id || report.ID || '').substring(0, 8)}...</td>
                                                        <td>{formatDate(reportDate)}</td>
                                                        <td>{reportName || '-'}</td>
                                                        <td>{reportEmail || '-'}</td>
                                                        <td>{reportTeam || '-'}</td>
                                                        <td>{reportShift || '-'}</td>
                                                        <td>{reportProduct || '-'}</td>
                                                        <td>{reportMarket || '-'}</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                            {formatCurrency(cpqc)}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>{formatNumber(messCount)}</td>
                                                        <td style={{ textAlign: 'right' }}>{formatNumber(responseCount)}</td>
                                                        <td style={{ textAlign: 'right' }}>{formatNumber(orderCount)}</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                            {formatCurrency(revenueMess)}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ marginTop: '15px', fontSize: '12px', color: 'var(--text-medium)' }}>
                                {loadingSalesReports ? (
                                    'Đang tải...'
                                ) : salesReports.length > 0 ? (
                                    `Hiển thị ${salesReports.length} báo cáo`
                                ) : (
                                    'Không có dữ liệu'
                                )}
                            </div>
                        </>
                    )}

                    {/* Sales Reports Tab Content (/sales_reports endpoint) */}
                    {activeTab === 'sales_tab' && (
                        <>
                            <h2 style={{ marginBottom: '20px', color: 'var(--primary-color)' }}>
                                Báo cáo Sale từ API
                            </h2>

                            {/* Statistics Summary */}
                            {salesTabStatistics && (
                                <div className="statistics-summary" style={{
                                    backgroundColor: 'white',
                                    padding: '20px',
                                    borderRadius: '8px',
                                    marginBottom: '20px',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                }}>
                                    <h3 style={{ marginBottom: '15px', color: 'var(--text-dark)' }}>Tổng quan</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                                        {salesTabStatistics.total_reports && (
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-medium)', marginBottom: '5px' }}>Tổng số báo cáo</div>
                                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                                                    {formatNumber(salesTabStatistics.total_reports || 0)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Filters Section */}
                            <div style={{
                                backgroundColor: 'white',
                                padding: '20px',
                                borderRadius: '8px',
                                marginBottom: '20px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '15px',
                                    alignItems: 'flex-end'
                                }}>
                                    <div style={{ flex: '1 1 200px', minWidth: '200px' }}>
                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>
                                            Nhân sự
                                        </label>
                                        <MultiSelect
                                            options={salesTabFilterOptions.nhan_su || []}
                                            selected={salesTabFilters.nhan_su || []}
                                            onChange={(value) => handleSalesTabFilterChange('nhan_su', value)}
                                            placeholder="Chọn nhân sự..."
                                        />
                                    </div>

                                    <div style={{ flex: '1 1 200px', minWidth: '200px' }}>
                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>
                                            Sản phẩm
                                        </label>
                                        <MultiSelect
                                            options={salesTabFilterOptions.products || []}
                                            selected={salesTabFilters.product || []}
                                            onChange={(value) => handleSalesTabFilterChange('product', value)}
                                            placeholder="Chọn sản phẩm..."
                                        />
                                    </div>

                                    <div style={{ flex: '1 1 200px', minWidth: '200px' }}>
                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>
                                            Thị trường
                                        </label>
                                        <MultiSelect
                                            options={salesTabFilterOptions.markets || []}
                                            selected={salesTabFilters.market || []}
                                            onChange={(value) => handleSalesTabFilterChange('market', value)}
                                            placeholder="Chọn thị trường..."
                                        />
                                    </div>

                                    <div style={{ flex: '1 1 200px', minWidth: '200px' }}>
                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>
                                            Team
                                        </label>
                                        <MultiSelect
                                            options={salesTabFilterOptions.teams || []}
                                            selected={salesTabFilters.team || []}
                                            onChange={(value) => handleSalesTabFilterChange('team', value)}
                                            placeholder="Chọn team..."
                                        />
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                                        <button
                                            type="button"
                                            onClick={handleSalesTabSearch}
                                            disabled={loadingSalesTab}
                                            style={{
                                                padding: '10px 20px',
                                                backgroundColor: 'var(--primary-color)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: loadingSalesTab ? 'not-allowed' : 'pointer',
                                                fontSize: '14px',
                                                fontWeight: '600',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                opacity: loadingSalesTab ? 0.6 : 1,
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            <span>🔍</span>
                                            Tìm kiếm
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleClearSalesTabFilters}
                                            disabled={loadingSalesTab}
                                            style={{
                                                padding: '10px 20px',
                                                backgroundColor: 'var(--text-medium)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: loadingSalesTab ? 'not-allowed' : 'pointer',
                                                fontSize: '14px',
                                                fontWeight: '600',
                                                opacity: loadingSalesTab ? 0.6 : 1,
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            Xóa bộ lọc
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Data Table */}
                            <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Nhân sự</th>
                                            <th>Sản phẩm</th>
                                            <th>Thị trường</th>
                                            <th>Team</th>
                                            <th>Ngày</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingSalesTab ? (
                                            <tr>
                                                <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>
                                                    Đang tải dữ liệu...
                                                </td>
                                            </tr>
                                        ) : salesTabData.length === 0 ? (
                                            <tr>
                                                <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>
                                                    Không có dữ liệu phù hợp với bộ lọc
                                                </td>
                                            </tr>
                                        ) : (
                                            salesTabData.map((report) => {
                                                const reportId = report.id || report.ID || Math.random();
                                                const reportName = report.nhan_su || report['Tên'] || report.name || report['Nhân sự'] || '-';
                                                const reportProduct = report.product || report['Sản phẩm'] || report['Sản_phẩm'] || report.san_pham || '-';
                                                const reportMarket = report.market || report['Thị trường'] || report['Thị_trường'] || report.thi_truong || '-';
                                                const reportTeam = report.team || report['Team'] || report['Nhóm'] || '-';
                                                const reportDate = report.ngay || report.date || report['Ngày'] || report.created_at || '-';
                                                
                                                return (
                                                    <tr key={reportId}>
                                                        <td style={{ fontSize: '11px' }}>{(String(reportId).substring(0, 8))}...</td>
                                                        <td>{reportName}</td>
                                                        <td>{reportProduct}</td>
                                                        <td>{reportMarket}</td>
                                                        <td>{reportTeam}</td>
                                                        <td>{formatDate(reportDate)}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ marginTop: '15px', fontSize: '12px', color: 'var(--text-medium)' }}>
                                {loadingSalesTab ? (
                                    'Đang tải...'
                                ) : salesTabData.length > 0 ? (
                                    `Hiển thị ${salesTabData.length} báo cáo`
                                ) : (
                                    'Không có dữ liệu'
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
