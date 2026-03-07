/**
 * Service để fetch dữ liệu từ Orders API
 * API: https://lumidataapi.vercel.app/orders
 */

const ORDERS_API_BASE_URL = 'https://lumidataapi.vercel.app';

/**
 * Fetch orders từ API với các filter
 * @param {Object} filters - Các filter để lọc dữ liệu
 * @param {string} filters.from_date - Từ ngày (format: DD/MM/YYYY)
 * @param {string} filters.to_date - Đến ngày (format: DD/MM/YYYY)
 * @param {string} filters.team - Team filter (optional)
 * @param {string} filters.ca - Ca filter (optional)
 * @param {string} filters.san_pham - Sản phẩm filter (optional)
 * @param {string} filters.thi_truong - Thị trường filter (optional)
 * @returns {Promise<Object>} Dữ liệu orders và statistics
 */
export const fetchOrdersFromAPI = async (filters = {}) => {
    try {
        const params = new URLSearchParams();
        
        // Thêm các filter vào params
        if (filters.from_date) {
            params.append('from_date', filters.from_date);
        }
        if (filters.to_date) {
            params.append('to_date', filters.to_date);
        }
        if (filters.team) {
            params.append('team', filters.team);
        }
        if (filters.ca) {
            params.append('ca', filters.ca);
        }
        if (filters.san_pham) {
            params.append('san_pham', filters.san_pham);
        }
        if (filters.thi_truong) {
            params.append('thi_truong', filters.thi_truong);
        }

        const url = `${ORDERS_API_BASE_URL}/orders?${params.toString()}`;
        console.log('📡 Fetching orders from:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error Response:', errorText);
            throw new Error(`API Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Debug: Kiểm tra data có đúng filter không
        const sampleOrders = data.data?.slice(0, 3) || [];
        const countriesInData = [...new Set(data.data?.map(o => o.country).filter(Boolean) || [])];
        const teamsInData = [...new Set(data.data?.map(o => o.team).filter(Boolean) || [])];
        
        console.log('✅ Orders API Response:', {
            count: data.count,
            totalOrders: data.statistics?.total_orders,
            totalRevenue: data.statistics?.total_revenue_vnd,
            actualDataCount: data.data?.length || 0,
            countriesInData: countriesInData,
            teamsInData: teamsInData,
            sampleOrders: sampleOrders.map(o => ({
                country: o.country,
                team: o.team,
                product: o.product,
                shift: o.shift
            }))
        });

        return data;
    } catch (error) {
        console.error('❌ fetchOrdersFromAPI error:', error);
        throw error;
    }
};

/**
 * Convert date từ format YYYY-MM-DD sang DD/MM/YYYY
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @returns {string} Date string (DD/MM/YYYY)
 */
export const convertDateToAPIFormat = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
};

/**
 * Fetch detail_reports từ API với các filter
 * @param {Object} filters - Các filter để lọc dữ liệu
 * @param {string} filters.from_date - Từ ngày (format: DD/MM/YYYY)
 * @param {string} filters.to_date - Đến ngày (format: DD/MM/YYYY)
 * @param {string|Array} filters.nhan_su - Nhân sự filter (optional, có thể nhiều giá trị phân cách bởi dấu phẩy)
 * @param {string|Array} filters.team - Team filter (optional)
 * @param {string|Array} filters.ca - Ca filter (optional)
 * @param {string|Array} filters.san_pham - Sản phẩm filter (optional)
 * @param {string|Array} filters.thi_truong - Thị trường filter (optional)
 * @returns {Promise<Object>} Dữ liệu detail_reports
 */
export const fetchSalesReportsFromAPI = async (filters = {}) => {
    try {
        const params = new URLSearchParams();
        
        // Thêm các filter vào params
        if (filters.from_date) {
            params.append('from_date', filters.from_date);
        }
        if (filters.to_date) {
            params.append('to_date', filters.to_date);
        }
        
        // Handle nhan_su filter - join by comma
        if (filters.nhan_su) {
            const nhanSuValue = Array.isArray(filters.nhan_su) 
                ? filters.nhan_su.join(',') 
                : filters.nhan_su;
            if (nhanSuValue) {
                params.append('nhan_su', nhanSuValue);
            }
        }
        
        // Handle team filter
        if (filters.team) {
            const teamValue = Array.isArray(filters.team) 
                ? filters.team.join(',') 
                : filters.team;
            if (teamValue) {
                params.append('team', teamValue);
            }
        }
        
        // Handle ca filter
        if (filters.ca) {
            const caValue = Array.isArray(filters.ca) 
                ? filters.ca.join(',') 
                : filters.ca;
            if (caValue) {
                params.append('ca', caValue);
            }
        }
        
        // Handle san_pham filter
        if (filters.san_pham) {
            const sanPhamValue = Array.isArray(filters.san_pham) 
                ? filters.san_pham.join(',') 
                : filters.san_pham;
            if (sanPhamValue) {
                params.append('san_pham', sanPhamValue);
            }
        }
        
        // Handle thi_truong filter
        if (filters.thi_truong) {
            const thiTruongValue = Array.isArray(filters.thi_truong) 
                ? filters.thi_truong.join(',') 
                : filters.thi_truong;
            if (thiTruongValue) {
                params.append('thi_truong', thiTruongValue);
            }
        }

        // Đảm bảo URL không có khoảng trắng và đúng format
        const baseUrl = ORDERS_API_BASE_URL.replace(/\s+/g, '').replace(/\/+$/, '');
        const endpoint = '/detail_reports';
        const url = `${baseUrl}${endpoint}?${params.toString()}`;
        console.log('📡 Fetching detail_reports from:', url);
        console.log('📋 Request params:', Object.fromEntries(params));

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Error Response:', {
                status: response.status,
                statusText: response.statusText,
                url: url,
                errorText: errorText
            });
            
            // Thử với endpoint khác nếu 404
            if (response.status === 404) {
                console.warn('⚠️ Endpoint /detail_reports not found (404). This endpoint may not be implemented yet.');
                console.warn('📋 Please check if the endpoint exists at:', url);
                console.warn('💡 The endpoint might need to be created on the server.');
                
                // Không thử alternative endpoints vì có thể gây confusion
                // Thay vào đó, throw error với message rõ ràng
                throw new Error(`Endpoint /detail_reports không tồn tại (404). Vui lòng kiểm tra lại API server hoặc liên hệ admin để tạo endpoint này.\n\nURL đã thử: ${url}`);
            }
            
            throw new Error(`API Error ${response.status}: ${response.statusText}. URL: ${url}`);
        }

        const data = await response.json();
        
        // Debug: Log cấu trúc dữ liệu
        const sampleItem = data.data?.[0] || data[0] || null;
        console.log('✅ Detail Reports API Response:', {
            count: data.data?.length || data.length || 0,
            hasStatistics: !!data.statistics,
            dataKeys: sampleItem ? Object.keys(sampleItem) : [],
            sampleData: sampleItem,
            sampleFields: sampleItem ? {
                id: sampleItem.id || sampleItem.ID,
                ten: sampleItem['Tên'] || sampleItem.name,
                ngay: sampleItem['Ngày'] || sampleItem.date,
                team: sampleItem['Team'] || sampleItem.team,
                cpqc: sampleItem['CPQC'] || sampleItem.CPQC,
                phanHoi: sampleItem['Phản hồi'] || sampleItem['Phản_hồi'] || sampleItem.response_count || sampleItem.phan_hoi,
                soMess: sampleItem['Số_Mess_Cmt'] || sampleItem['Số Mess Cmt'],
                soDon: sampleItem['Số đơn'] || sampleItem['Số_đơn']
            } : null
        });

        // Xử lý cả 2 trường hợp: {data: [...]} hoặc trực tiếp là array
        const result = {
            data: data.data || data,
            statistics: data.statistics || null,
            count: data.count || (Array.isArray(data.data) ? data.data.length : (Array.isArray(data) ? data.length : 0))
        };

        return result;
    } catch (error) {
        console.error('❌ fetchSalesReportsFromAPI (detail_reports) error:', error);
        throw error;
    }
};

/**
 * Fetch sales_reports từ API với các filter
 * @param {Object} filters - Các filter để lọc dữ liệu
 * @param {string|Array} filters.nhan_su - Nhân sự filter (optional, có thể nhiều giá trị phân cách bởi dấu phẩy)
 * @param {string|Array} filters.product - Product filter (optional)
 * @param {string|Array} filters.market - Market filter (optional)
 * @param {string|Array} filters.team - Team filter (optional)
 * @returns {Promise<Object>} Dữ liệu sales_reports
 */
export const fetchSalesReportsTabFromAPI = async (filters = {}) => {
    try {
        const params = new URLSearchParams();
        
        // Handle nhan_su filter - join by comma
        if (filters.nhan_su) {
            const nhanSuValue = Array.isArray(filters.nhan_su) 
                ? filters.nhan_su.join(',') 
                : filters.nhan_su;
            if (nhanSuValue) {
                params.append('nhan_su', nhanSuValue);
            }
        }
        
        // Handle product filter
        if (filters.product) {
            const productValue = Array.isArray(filters.product) 
                ? filters.product.join(',') 
                : filters.product;
            if (productValue) {
                params.append('product', productValue);
            }
        }
        
        // Handle market filter
        if (filters.market) {
            const marketValue = Array.isArray(filters.market) 
                ? filters.market.join(',') 
                : filters.market;
            if (marketValue) {
                params.append('market', marketValue);
            }
        }
        
        // Handle team filter
        if (filters.team) {
            const teamValue = Array.isArray(filters.team) 
                ? filters.team.join(',') 
                : filters.team;
            if (teamValue) {
                params.append('team', teamValue);
            }
        }

        // Đảm bảo URL không có khoảng trắng và đúng format
        const baseUrl = ORDERS_API_BASE_URL.replace(/\s+/g, '').replace(/\/+$/, '');
        const endpoint = '/sales_reports';
        const url = `${baseUrl}${endpoint}?${params.toString()}`;
        console.log('📡 Fetching sales_reports from:', url);
        console.log('📋 Request params:', Object.fromEntries(params));

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Error Response:', {
                status: response.status,
                statusText: response.statusText,
                url: url,
                errorText: errorText
            });
            
            // Thử với endpoint khác nếu 404
            if (response.status === 404) {
                console.warn('⚠️ Endpoint /sales_reports not found (404). This endpoint may not be implemented yet.');
                console.warn('📋 Please check if the endpoint exists at:', url);
                console.warn('💡 The endpoint might need to be created on the server.');
                
                throw new Error(`Endpoint /sales_reports không tồn tại (404). Vui lòng kiểm tra lại API server hoặc liên hệ admin để tạo endpoint này.\n\nURL đã thử: ${url}`);
            }
            
            throw new Error(`API Error ${response.status}: ${response.statusText}. URL: ${url}`);
        }

        const data = await response.json();
        
        // Debug: Log cấu trúc dữ liệu
        const sampleItem = data.data?.[0] || data[0] || null;
        console.log('✅ Sales Reports API Response:', {
            count: data.data?.length || data.length || 0,
            hasStatistics: !!data.statistics,
            dataKeys: sampleItem ? Object.keys(sampleItem) : [],
            sampleData: sampleItem,
            sampleFields: sampleItem ? {
                id: sampleItem.id || sampleItem.ID,
                nhan_su: sampleItem.nhan_su || sampleItem.name || sampleItem['Tên'],
                product: sampleItem.product || sampleItem['Sản phẩm'],
                market: sampleItem.market || sampleItem['Thị trường'],
                team: sampleItem.team || sampleItem['Team']
            } : null
        });

        // Xử lý cả 2 trường hợp: {data: [...]} hoặc trực tiếp là array
        const result = {
            data: data.data || data,
            statistics: data.statistics || null,
            count: data.count || (Array.isArray(data.data) ? data.data.length : (Array.isArray(data) ? data.length : 0))
        };

        return result;
    } catch (error) {
        console.error('❌ fetchSalesReportsTabFromAPI error:', error);
        throw error;
    }
};
