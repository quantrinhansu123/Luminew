import { PRIMARY_KEY_COLUMN, SETTINGS_KEY } from '../types';

const PROD_HOST = 'https://n-api-gamma.vercel.app';
// const LOCAL_HOST = 'http://localhost:8081'; 
const MAIN_HOST = PROD_HOST; // Defaulting to prod as per script
const SHEET_NAME = 'F3';

const BATCH_UPDATE_API_URL = `${MAIN_HOST}/sheet/${SHEET_NAME}/update?verbose=true`;
const SINGLE_UPDATE_API_URL = `${MAIN_HOST}/sheet/${SHEET_NAME}/update-single`;
const TRANSFER_API_URL = `${MAIN_HOST}/sheet/MGT nội bộ/rows/batch`;
const MGT_NOI_BO_ORDER_API_URL = `${MAIN_HOST}/sheet/MGT nội bộ/data`;
const DATA_API_URL = `${MAIN_HOST}/sheet/${SHEET_NAME}/data`;

const getDataSourceMode = () => {
    try {
        const s = localStorage.getItem(SETTINGS_KEY);
        if (s) {
            const parsed = JSON.parse(s);
            // Default to 'prod' if undefined
            return parsed.dataSource || 'prod';
        }
        return 'prod';
    } catch {
        return 'prod';
    }
};

export const fetchOrders = async () => {
    // 1. Check Data Source Mode
    const mode = getDataSourceMode();
    if (mode === 'test') {
        console.log('🔶 [TEST MODE] Using Mock Data for fetchOrders');
        return [
            {
                "Mã đơn hàng": "TEST-001",
                "Name*": "Khách Hàng Test 1",
                "Phone*": "0900000001",
                "Add": "123 Đường Test, Quận 1",
                "City": "Hồ Chí Minh",
                "State": "HCM",
                "Khu vực": "Hồ Chí Minh",
                "Mặt hàng": "Glutathione Collagen",
                "Giá bán": "1500000",
                "Tổng tiền VNĐ": "1500000",
                "Ghi chú": "Đây là dữ liệu test không có thật",
                "Trạng thái giao hàng": "ĐANG GIAO",
                "Ngày lên đơn": new Date().toISOString()
            },
            {
                "Mã đơn hàng": "TEST-002",
                "Name*": "Khách Hàng Test 2",
                "Phone*": "0900000002",
                "Add": "456 Phố Test, Quận Ba Đình",
                "City": "Hà Nội",
                "State": "Hà Nội",
                "Khu vực": "Hà Nội",
                "Mặt hàng": "Kem Body",
                "Giá bán": "500000",
                "Tổng tiền VNĐ": "500000",
                "Ghi chú": "Đây cũng là dữ liệu test",
                "Trạng thái giao hàng": "HOÀN",
                "Ngày lên đơn": new Date(Date.now() - 86400000).toISOString()
            }
        ];
    }

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


export const updateSingleCell = async (orderId, columnKey, newValue, modifiedBy) => {
    try {
        // Map App Key to DB Key
        let dbKey = Object.keys(DB_TO_APP_MAPPING).find(key => DB_TO_APP_MAPPING[key] === columnKey);

        // Special reverse mapping or fallback
        if (!dbKey) {
            // Handle simple keys or direct matches
            if (columnKey === 'Trạng thái giao hàng NB') dbKey = 'delivery_status_nb';
            // Default attempt: lowercase if needed? No, strict mapping prefered.
            console.warn(`Could not map app key "${columnKey}" to DB key.`);
            // Attempt generic match if key exists in table? 
            // For now, if no mapping found, return error to avoid bad data
            // UNLESS it's a known direct key
            if (columnKey === 'delivery_status') dbKey = 'delivery_status';

            // FFM Specific Mappings
            if (columnKey === 'Ghi chú vận đơn') dbKey = 'vandon_note';
            if (columnKey === 'Ngày đẩy đơn') dbKey = 'accounting_check_date';
        }

        if (!dbKey) throw new Error(`Không tìm thấy cột tương ứng trong DB cho: ${columnKey}`);

        // Update Supabase
        // Key is order_code (unique) or id?
        // PRIMARY_KEY_COLUMN is "Mã đơn hàng" -> order_code
        // Supabase `orders` has `order_code` unique column.

        const updatePayload = { [dbKey]: newValue };
        if (modifiedBy) {
            updatePayload.last_modified_by = modifiedBy;
        }

        const { data, error } = await supabase
            .from('orders')
            .update(updatePayload)
            .eq('order_code', orderId)
            .select();

        if (error) throw error;

        console.log(`Updated ${orderId}: ${dbKey} = ${newValue}`);
        return { success: true, daa: data };

    } catch (error) {
        console.error('updateSingleCell Supabase error:', error);
        throw error;
    }
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
    const mode = getDataSourceMode();
    if (mode === 'test') {
        console.log('🔶 [TEST MODE] Using Mock Data for fetchFFMOrders');
        return [
            {
                "Mã đơn hàng": "TEST-FFM-01",
                "Name*": "Khách FFM Test",
                "Phone*": "0999888777",
                "Add": "Kho FFM Test",
                "City": "Hà Nội",
                "team": "Hà Nội",
                "shipping_unit": "MGT Express",
                "Đơn vị vận chuyển": "MGT Express",
                "Trạng thái giao hàng": "ĐANG GIAO",
                "Ngày lên đơn": new Date().toISOString()
            }
        ];
    }

    try {
        console.log('Fetching FFM orders from Supabase...');

        // Query: Shipping Unit contains MGT
        // Filter tracking_code và check_result ở client-side để tránh lỗi query phức tạp

        let query = supabase
            .from('orders')
            .select('*', { count: 'exact' })
            .ilike('shipping_unit', '%MGT%')
            .order('order_date', { ascending: false })
            .limit(1000); // Reasonable limit for checking

        const { data, error, count } = await query;

        if (error) {
            console.error('Supabase fetchFFMOrders error:', error);
            throw error;
        }

        // Filter ở client-side: Mã Tracking trống VÀ Kết quả Check="OK"
        const filteredData = data.filter(row => {
            const trackingCode = String(row.tracking_code || '').trim();
            const checkResult = String(row.check_result || '').trim();
            const isTrackingEmpty = !trackingCode || trackingCode === '';
            const isCheckOK = checkResult.toUpperCase() === 'OK';
            return isTrackingEmpty && isCheckOK;
        });

        console.log(`Loaded ${filteredData.length}/${data.length} FFM orders from Supabase (filtered: MGT, empty tracking, Check=OK)`);

        // Map to App Format
        return filteredData.map(mapSupabaseOrderToApp);

    } catch (error) {
        console.error('fetchFFMOrders error:', error);
        // Let the caller handle UI notifications
        throw error;
    }
};

export const updateBatch = async (rows, modifiedBy) => {
    try {
        console.log(`Supabase Batch Update: ${rows.length} rows`);

        // rows format: [{ "Mã đơn hàng": "...", "Kết quả Check": "..." }, ...]

        // Must transform to Supabase format
        const updates = rows.map(row => {
            const orderCode = row[PRIMARY_KEY_COLUMN];
            if (!orderCode) return null;

            const updatePayload = {};
            if (modifiedBy) {
                updatePayload.last_modified_by = modifiedBy;
            }

            Object.keys(row).forEach(appKey => {
                if (appKey === PRIMARY_KEY_COLUMN) return;

                // Map app key to db key
                let dbKey = Object.keys(DB_TO_APP_MAPPING).find(k => DB_TO_APP_MAPPING[k] === appKey);

                // Fallbacks
                if (!dbKey) {
                    if (appKey === 'Trạng thái giao hàng NB') dbKey = 'delivery_status_nb';
                    if (appKey === 'delivery_status') dbKey = 'delivery_status';

                    // FFM Specific Mappings
                    if (appKey === 'Ghi chú vận đơn') dbKey = 'vandon_note';
                    if (appKey === 'Ngày đẩy đơn') dbKey = 'accounting_check_date';
                }

                if (dbKey) {
                    updatePayload[dbKey] = row[appKey];
                }
            });

            return { order_code: orderCode, ...updatePayload };
        }).filter(Boolean);

        if (updates.length === 0) return { success: true, message: "Nothing to update" };

        // Supabase upsert is efficient for bulk updates if PK is present
        // 'order_code' is unique key.
        const { data, error } = await supabase
            .from('orders')
            .upsert(updates, { onConflict: 'order_code' })
            .select();

        if (error) throw error;

        return { success: true, count: data.length };

    } catch (error) {
        console.error('updateBatch Supabase error:', error);
        throw error;
    }
};



import { supabase } from './supabaseClient';

export const DB_TO_APP_MAPPING = {
    "order_code": "Mã đơn hàng",
    "customer_name": "Name*",
    "customer_phone": "Phone*",
    "customer_address": "Add",
    "city": "City",
    "state": "State",
    "country": "Khu vực", // Mapping 'country' col to 'Khu vực' (or check if 'region' exists)
    "zipcode": "Zipcode",
    "product": "Mặt hàng",
    "product_main": "Mặt hàng", // Added to support NhapDonMoi payload
    "total_amount_vnd": "Tổng tiền VNĐ",
    "payment_method": "Hình thức thanh toán",
    "tracking_code": "Mã Tracking",
    "shipping_fee": "Phí ship nội địa Mỹ (usd)", // Approx mapping
    "marketing_staff": "Nhân viên Sale", // Approx
    "sale_staff": "Nhân viên Sale",
    "team": "Team",
    "delivery_staff": "NV Vận đơn",
    "delivery_status": "Trạng thái giao hàng", // Or 'Trạng thái giao hàng NB' depending on context
    "payment_status": "Trạng thái thu tiền",
    "note": "Ghi chú",
    "reason": "Lý do",
    "order_date": "Ngày lên đơn",
    "goods_amount": "Giá bán", // Approx
    "shipping_unit": "Đơn vị vận chuyển",
    "accountant_confirm": "Kế toán xác nhận thu tiền về",
    "created_at": "Ngày đóng hàng", // Fallback

    // New Columns Mapping
    "check_result": "Kết quả Check",
    "vandon_note": "Ghi chú của VĐ",
    "item_name_1": "Tên mặt hàng 1",
    "item_qty_1": "Số lượng mặt hàng 1",
    "item_name_2": "Tên mặt hàng 2",
    "item_qty_2": "Số lượng mặt hàng 2",
    "gift_item": "Quà tặng",
    "gift_item": "Quà tặng",
    "gift_qty": "Số lượng quà kèm",

    // Full Mapping Round 2
    "delivery_status_nb": "Trạng thái giao hàng NB",
    "payment_currency": "Loại tiền thanh toán",
    "estimated_delivery_date": "Thời gian giao dự kiến",
    "warehouse_fee": "Phí xử lý đơn đóng hàng-Lưu kho(usd)",
    "note_caps": "GHI CHÚ",
    "accounting_check_date": "Ngày Kế toán đối soát với FFM lần 2",
    "reconciled_amount": "Số tiền của đơn hàng đã về TK Cty"
};

// Helper to map Supabase row to App Format
const mapSupabaseOrderToApp = (sOrder) => {
    const appOrder = {};
    // Default copy all
    Object.keys(sOrder).forEach(k => {
        appOrder[k] = sOrder[k];
    });

    // Apply explicit mappings
    Object.entries(DB_TO_APP_MAPPING).forEach(([dbKey, appKey]) => {
        if (sOrder[dbKey] !== undefined) {
            appOrder[appKey] = sOrder[dbKey];
        }
    });

    // Custom logic for critical fields if missing or needing format
    if (!appOrder["Ngày lên đơn"] && sOrder.order_date) appOrder["Ngày lên đơn"] = sOrder.order_date;
    if (!appOrder["Mã đơn hàng"]) appOrder["Mã đơn hàng"] = sOrder.order_code;

    // Status mapping if needed (Supabase might use English vs App Vietnamese)
    // For now assuming data was migrated with Vietnamese values or UI handles it.

    // Explicitly set these for VanDon.jsx logic
    // Nếu trong DB có delivery_status_nb thì dùng, nếu không thì fallback về delivery_status cũ (hoặc để trống)
    appOrder["Trạng thái giao hàng NB"] = sOrder.delivery_status_nb || sOrder.delivery_status;

    return appOrder;
};


// Fetch Van Don data với pagination và filters từ backend (NOW SUPABASE)
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

    const mode = getDataSourceMode();
    if (mode === 'test') {
        console.log('🔶 [TEST MODE] Using Mock Data for fetchVanDon');
        // Return dummy response for Van Don
        return {
            data: [
                {
                    "Mã đơn hàng": "TEST-VD-01",
                    "Name*": "Test Vận Đơn 1",
                    "Phone*": "0912345678",
                    "Add": "123 Đường Test",
                    "City": "Hà Nội",
                    "State": "HN",
                    "Khu vực": "Hà Nội",
                    "Mặt hàng": "Sản phẩm Test",
                    "Trạng thái giao hàng NB": "Đang Giao",
                    "Mã Tracking": "TEST-TRACK-123",
                    "Ngày lên đơn": new Date().toISOString()
                },
                {
                    "Mã đơn hàng": "TEST-VD-02",
                    "Name*": "Test Vận Đơn 2",
                    "Phone*": "0987654321",
                    "Add": "456 Đường Mẫu",
                    "City": "Đà Nẵng",
                    "State": "ĐN",
                    "Khu vực": "Miền Trung",
                    "Mặt hàng": "Sản phẩm Test 2",
                    "Trạng thái giao hàng NB": "Giao Thành Công",
                    "Mã Tracking": "TEST-TRACK-456",
                    "Ngày lên đơn": new Date(Date.now() - 172800000).toISOString()
                }
            ],
            total: 2,
            page: 1,
            limit: limit,
            totalPages: 1
        };
    }

    try {
        console.log('Fetching Van Don properties from Supabase...');

        let query = supabase
            .from('orders')
            .select('*', { count: 'exact' });

        // --- FILTERS ---
        if (team && team !== 'all') {
            query = query.eq('team', team);
        }

        // Status map: "Trạng thái giao hàng"
        if (status) {
            query = query.ilike('delivery_status', `%${status}%`);
        }

        if (Array.isArray(market) && market.length > 0) {
            query = query.in('country', market); // 'market' comes from 'Khu vực', which maps to 'country'
        } else if (typeof market === 'string' && market) {
            query = query.eq('country', market);
        }

        if (Array.isArray(product) && product.length > 0) {
            query = query.in('product', product);
        } else if (typeof product === 'string' && product) {
            query = query.eq('product', product);
        }

        if (dateFrom) {
            query = query.gte('order_date', dateFrom);
        }
        if (dateTo) {
            query = query.lte('order_date', dateTo);
        }

        // --- PAGINATION ---
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        query = query.range(from, to).order('order_date', { ascending: false });

        const { data, error, count } = await query;

        if (error) {
            console.error('Supabase fetch error:', error);
            throw error;
        }

        const mappedData = data.map(mapSupabaseOrderToApp);

        return {
            data: mappedData,
            total: count || 0,
            page: page,
            limit: limit,
            totalPages: Math.ceil((count || 0) / limit)
        };

    } catch (error) {
        console.error('fetchVanDon Supabase error:', error);
        return {
            data: [],
            total: 0,
            page: page,
            limit: limit,
            totalPages: 0,
            error: error.message
        };
    }
};

export const fetchGoogleSheetData = async () => {
    try {
        console.log('Fetching RAW Google Sheet data from:', DATA_API_URL);
        const response = await fetch(DATA_API_URL);
        if (!response.ok) throw new Error(`API Error ${response.status}`);
        const json = await response.json();
        const data = json.rows || json.data || json;
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('fetchGoogleSheetData error:', error);
        return [];
    }
};
