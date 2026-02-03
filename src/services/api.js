import { PRIMARY_KEY_COLUMN } from '../types';

const PROD_HOST = 'https://n-api-gamma.vercel.app';
// const LOCAL_HOST = 'http://localhost:8081'; 
const MAIN_HOST = PROD_HOST; // Defaulting to prod as per script
const SHEET_NAME = 'F3';

const BATCH_UPDATE_API_URL = `${MAIN_HOST}/sheet/${SHEET_NAME}/update?verbose=true`;
const SINGLE_UPDATE_API_URL = `${MAIN_HOST}/sheet/${SHEET_NAME}/update-single`;
const TRANSFER_API_URL = `${MAIN_HOST}/sheet/MGT nội bộ/rows/batch`;
const MGT_NOI_BO_ORDER_API_URL = `${MAIN_HOST}/sheet/MGT nội bộ/data`;
const DATA_API_URL = `${MAIN_HOST}/sheet/${SHEET_NAME}/data`;

export const fetchOrders = async () => {
    try {
        console.log('Fetching data from:', DATA_API_URL);

        const response = await fetch(DATA_API_URL, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error Response:', errorText);
            throw new Error(`API Error ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();
        console.log('API Response:', json);

        if (json.error) throw new Error(json.error);

        const data = json.rows || json.data || json;
        if (!Array.isArray(data)) {
            console.error('Invalid data format:', data);
            throw new Error('Dữ liệu trả về không đúng định dạng mảng');
        }

        console.log(`Loaded ${data.length} orders`);
        return data;

    } catch (error) {
        console.error('fetchOrders error:', error);

        // Fallback với dữ liệu demo nếu API lỗi
        console.log('Using fallback demo data...');
        return [
            {
                "Mã đơn hàng": "DEMO001",
                "Name*": "Nguyễn Văn A",
                "Phone*": "0123456789",
                "Add": "123 Đường ABC",
                "City": "Hà Nội",
                "State": "Hà Nội",
                "Khu vực": "Miền Bắc",
                "Mặt hàng": "Sản phẩm A",
                "Giá bán": "1000000",
                "Tổng tiền VNĐ": "1000000",
                "Ghi chú": "Đơn hàng demo",
                "Trạng thái giao hàng": "ĐANG GIAO",
                "Mã Tracking": "",
                "Ngày lên đơn": new Date().toISOString(),
                "Ngày đóng hàng": ""
            },
            {
                "Mã đơn hàng": "DEMO002",
                "Name*": "Trần Thị B",
                "Phone*": "0987654321",
                "Add": "456 Đường XYZ",
                "City": "TP.HCM",
                "State": "TP.HCM",
                "Khu vực": "Miền Nam",
                "Mặt hàng": "Sản phẩm B",
                "Giá bán": "2000000",
                "Tổng tiền VNĐ": "2000000",
                "Ghi chú": "Đơn hàng demo 2",
                "Trạng thái giao hàng": "ĐÃ GIAO",
                "Mã Tracking": "VN123456789",
                "Ngày lên đơn": new Date().toISOString(),
                "Ngày đóng hàng": new Date().toISOString()
            }
        ];
    }
};

import { logDataChange } from './logging';

export const updateSingleCell = async (orderId, columnKey, newValue) => {
    const payload = { [PRIMARY_KEY_COLUMN]: orderId, [columnKey]: newValue };

    // Log before or after? After success is better.
    const response = await fetch(SINGLE_UPDATE_API_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || `HTTP error! status: ${response.status}`);
    }

    // Log the change
    logDataChange({
        action: 'UPDATE',
        table_name: SHEET_NAME, // 'F3'
        record_id: orderId,
        field: columnKey,
        new_value: newValue,
        details: { method: 'updateSingleCell' }
    });

    return await response.json();
};

export const fetchMGTNoiBoOrders = async () => {
    try {
        const response = await fetch(MGT_NOI_BO_ORDER_API_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const json = await response.json();
        if (json.data && Array.isArray(json.data)) {
            return json.data.map((row) => row[PRIMARY_KEY_COLUMN]).filter(Boolean);
        }
        return [];
    } catch (error) {
        console.error('fetchMGTNoiBoOrders error:', error);
        return [];
    }
};

export const fetchFFMOrders = async () => {
    try {
        const FFM_DATA_API_URL = `${MAIN_HOST}/sheet/FFM/data`;
        console.log('Fetching FFM data from:', FFM_DATA_API_URL);

        const response = await fetch(FFM_DATA_API_URL, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        console.log('FFM Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('FFM API Error Response:', errorText);
            throw new Error(`API Error ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();
        console.log('FFM API Response:', json);

        if (json.error) throw new Error(json.error);

        const data = json.rows || json.data || json;
        if (!Array.isArray(data)) {
            console.error('Invalid FFM data format:', data);
            throw new Error('Dữ liệu FFM trả về không đúng định dạng mảng');
        }

        console.log(`Loaded ${data.length} FFM orders`);
        return data;

    } catch (error) {
        console.error('fetchFFMOrders error:', error);

        // Fallback với dữ liệu demo nếu API lỗi
        console.log('Using fallback demo data for FFM...');
        return [
            {
                "Mã đơn hàng": "FFM001",
                "Name*": "Nguyễn Văn C",
                "Phone*": "0912345678",
                "Add": "789 Đường FFM",
                "City": "Hà Nội",
                "State": "Hà Nội",
                "Khu vực": "Miền Bắc",
                "Mặt hàng": "Sản phẩm FFM",
                "Giá bán": "1500000",
                "Tổng tiền VNĐ": "1500000",
                "Ghi chú": "Đơn hàng FFM demo",
                "Trạng thái giao hàng": "ĐANG GIAO",
                "Mã Tracking": "",
                "Ngày lên đơn": new Date().toISOString(),
                "Ngày đóng hàng": ""
            }
        ];
    }
};

export const updateBatch = async (rows) => {
    const response = await fetch(BATCH_UPDATE_API_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows)
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || `HTTP error! status: ${response.status}`);
    }
    return await response.json();
};

// Fetch Van Don data với pagination và filters từ backend
export const fetchVanDon = async (options = {}) => {
    const {
        page = 1,
        limit = 50,
        team,
        status,
        market = [],
        product = [],
        dateFrom,
        dateTo
    } = options;

    try {
        const params = new URLSearchParams({
            page: page.toString(),
            limit: limit.toString()
        });

        if (team && team !== 'all') {
            params.append('team', team);
        }
        if (status) {
            params.append('status', status);
        }
        if (Array.isArray(market) && market.length > 0) {
            market.forEach(m => params.append('market', m));
        } else if (typeof market === 'string' && market) {
            params.append('market', market);
        }
        if (Array.isArray(product) && product.length > 0) {
            product.forEach(p => params.append('product', p));
        } else if (typeof product === 'string' && product) {
            params.append('product', product);
        }

        // Use backend API endpoint
        const API_URL = '/api/van-don';
        const url = `${API_URL}?${params.toString()}`;

        console.log('Fetching Van Don from backend:', url);

        // Add timeout and abort controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Van Don API Error:', errorText);
            throw new Error(`API Error ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();

        if (json.error) {
            throw new Error(json.error);
        }

        // Backend trả về: { success, data, total, page, limit, totalPages, rows }
        const data = json.data || json.rows || [];

        // Apply date filters on client side (nếu backend chưa support)
        let filteredData = data;
        if (dateFrom || dateTo) {
            filteredData = data.filter(item => {
                const orderDate = item['Ngày lên đơn'] || item['Ngày đóng hàng'] || '';
                if (!orderDate) return true;

                // Parse date (format: DD/MM/YYYY or YYYY-MM-DD)
                let dateValue;
                if (orderDate.includes('/')) {
                    const [d, m, y] = orderDate.split('/');
                    dateValue = new Date(`${y}-${m}-${d}`);
                } else {
                    dateValue = new Date(orderDate);
                }

                if (dateFrom) {
                    const fromDate = new Date(dateFrom);
                    if (dateValue < fromDate) return false;
                }
                if (dateTo) {
                    const toDate = new Date(dateTo);
                    toDate.setHours(23, 59, 59, 999);
                    if (dateValue > toDate) return false;
                }
                return true;
            });
        }

        return {
            data: filteredData,
            total: json.total || filteredData.length,
            page: json.page || page,
            limit: json.limit || limit,
            totalPages: json.totalPages || Math.ceil((json.total || filteredData.length) / limit)
        };

    } catch (error) {
        console.error('fetchVanDon error:', error);

        // Check if it's a timeout error
        if (error.name === 'AbortError') {
            console.error('⏱️ Request timeout - backend took too long');
            return {
                data: [],
                total: 0,
                page: page,
                limit: limit,
                totalPages: 0,
                error: 'Request timeout. Vui lòng thử lại.'
            };
        }

        // Fallback to old API if backend fails (only for non-timeout errors)
        console.log('Falling back to direct API...');
        try {
            const allData = await fetchOrders();
            // Apply basic filters on client side
            let filtered = allData;
            if (team && team !== 'all') {
                filtered = filtered.filter(item => item.Team === team);
            }
            if (status) {
                filtered = filtered.filter(item => item["Trạng thái giao hàng"] === status);
            }

            // Paginate
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const startIndex = (pageNum - 1) * limitNum;
            const endIndex = startIndex + limitNum;
            const paginated = filtered.slice(startIndex, endIndex);

            return {
                data: paginated,
                total: filtered.length,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(filtered.length / limitNum)
            };
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
            return {
                data: [],
                total: 0,
                page: page,
                limit: limit,
                totalPages: 0,
                error: 'Không thể tải dữ liệu. Vui lòng thử lại sau.'
            };
        }
    }
};
