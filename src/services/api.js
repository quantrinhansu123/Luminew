import { PRIMARY_KEY_COLUMN, SETTINGS_KEY } from '../types';
import { supabase } from './supabaseClient';

export const DB_TO_APP_MAPPING = {
    "order_code": "Mã đơn hàng",
    "customer_name": "Name*",
    "customer_phone": "Phone*",
    "customer_address": "Add",
    "city": "City",
    "state": "State",
    "country": "Khu vực", 
    "zipcode": "Zipcode",
    "product": "Mặt hàng",
    "total_amount_vnd": "Tổng tiền VNĐ",
    "payment_method": "Hình thức thanh toán",
    "tracking_code": "Mã Tracking",
    "shipping_fee": "Phí ship nội địa Mỹ (usd)",
    "marketing_staff": "Nhân viên MKT",
    "sale_staff": "Nhân viên Sale",
    "team": "Team",
    "delivery_staff": "NV Vận đơn",
    "delivery_status": "Trạng thái giao hàng",
    "payment_status": "Trạng thái thu tiền",
    "note": "Ghi chú",
    "reason": "Lý do",
    "order_date": "Ngày lên đơn",
    "sale_price": "Giá bán",
    "shipping_unit": "Đơn vị vận chuyển",
    "accountant_confirm": "Kế toán xác nhận thu tiền về",
    "created_at": "created_at",
    "ngaydonghang": "Ngày đóng hàng",
    "check_result": "Kết quả Check",
    "vandon_note": "Ghi chú của VĐ",
    "product_name_1": "Tên mặt hàng 1",
    "quantity_1": "Số lượng mặt hàng 1",
    "product_name_2": "Tên mặt hàng 2",
    "quantity_2": "Số lượng mặt hàng 2",
    "gift": "Quà tặng",
    "gift_quantity": "Số lượng quà kèm",
    "delivery_status_nb": "Trạng thái giao hàng NB",
    "payment_currency": "Loại tiền thanh toán",
    "estimated_delivery_date": "Thời gian giao dự kiến",
    "warehouse_fee": "Phí xử lý đơn đóng hàng-Lưu kho(usd)",
    "note_caps": "GHI CHÚ",
    "accounting_check_date": "Ngày Kế toán đối soát với FFM lần 2",
    "reconciled_amount": "Số tiền của đơn hàng đã về TK Cty",
    "payment_bill": "Payment Bill",
    "payment_image": "Payment Image"
};

const mapSupabaseOrderToApp = (sOrder) => {
    const appOrder = {};
    Object.keys(sOrder).forEach(k => {
        appOrder[k] = sOrder[k];
    });

    Object.entries(DB_TO_APP_MAPPING).forEach(([dbKey, appKey]) => {
        if (sOrder[dbKey] !== undefined) {
            appOrder[appKey] = sOrder[dbKey];
        }
    });

    // Giá bán: ưu tiên sale_price; null/undefined thì dùng goods_amount (dữ liệu cũ)
    if (sOrder.sale_price !== undefined && sOrder.sale_price !== null) {
        appOrder["Giá bán"] = sOrder.sale_price;
    } else if (sOrder.goods_amount !== undefined) {
        appOrder["Giá bán"] = sOrder.goods_amount;
    }

    // Hình thức thanh toán: chỉ từ payment_method (Supabase), không gộp payment_method_text
    appOrder["Hình thức thanh toán"] =
        sOrder.payment_method === undefined || sOrder.payment_method === null ? '' : sOrder.payment_method;

    if (!appOrder["Ngày lên đơn"] && sOrder.order_date) appOrder["Ngày lên đơn"] = sOrder.order_date;
    if (!appOrder["Mã đơn hàng"]) appOrder["Mã đơn hàng"] = sOrder.order_code;
    appOrder["Trạng thái giao hàng NB"] = sOrder.delivery_status_nb || sOrder.delivery_status;

    if (sOrder.payment_bill) appOrder["Payment Bill"] = sOrder.payment_bill;
    if (sOrder.payment_image) appOrder["Payment Image"] = sOrder.payment_image;

    const itemName1 = sOrder.product_name_1 ?? sOrder.item_name_1 ?? sOrder.product ?? '';
    const itemQty1 = sOrder.quantity_1 ?? sOrder.item_qty_1 ?? '';
    const itemName2 = sOrder.product_name_2 ?? sOrder.item_name_2 ?? '';
    const itemQty2 = sOrder.quantity_2 ?? sOrder.item_qty_2 ?? '';
    const giftItem = sOrder.gift ?? sOrder.gift_item ?? '';
    const giftQty = sOrder.gift_quantity ?? sOrder.gift_qty ?? '';

    appOrder["Tên mặt hàng 1"] = itemName1;
    appOrder["Số lượng mặt hàng 1"] = itemQty1;
    appOrder["Tên mặt hàng 2"] = itemName2;
    appOrder["Số lượng mặt hàng 2"] = itemQty2;
    appOrder["Quà tặng"] = giftItem;
    appOrder["Số lượng quà kèm"] = giftQty;

    if (sOrder.ngayupbill !== undefined && sOrder.ngayupbill !== null) {
        appOrder["ngayupbill"] = sOrder.ngayupbill;
        appOrder["Ngày up bill"] = sOrder.ngayupbill;
    }
    if (sOrder.reconciled_vnd !== undefined && sOrder.reconciled_vnd !== null) {
        appOrder["reconciled_vnd"] = sOrder.reconciled_vnd;
        appOrder["Tiền đã thanh toán"] = sOrder.reconciled_vnd;
    }
    return appOrder;
};

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


const parseDateForDB = (val) => {
    if (!val || typeof val !== 'string') return val;
    const trimmed = val.trim();
    // Parse dd/mm/yyyy or d/m/yy
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) {
        const [day, month, year] = trimmed.split('/');
        const fullYear = year.length === 2 ? `20${year}` : year;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    // Parse dd/mm/yyyy HH:mm
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{1,2}/.test(trimmed)) {
        const [datePart, timePart] = trimmed.split(/\s+/);
        const [day, month, year] = datePart.split('/');
        const fullYear = year.length === 2 ? `20${year}` : year;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}:00`;
    }
    return val;
};

/**
 * Prepares a value for database storage.
 * - Converts empty strings to null (to allow clearing numeric/date fields).
 * - Formats date fields using parseDateForDB.
 */
const prepareValueForDB = (dbKey, value) => {
    // If value is explicitly an empty string, we want to save it as NULL in DB
    // to support clearing numeric/date/text fields correctly in PostgreSQL.
    if (value === '' || value === undefined) return null;

    if (['order_date', 'created_at', 'estimated_delivery_date', 'accounting_check_date', 'ngayupbill', 'ngaydonghang'].includes(dbKey)) {
        return parseDateForDB(value);
    }
    return value;
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

        const formattedValue = prepareValueForDB(dbKey, newValue);

        // Update Supabase
        // Key is order_code (unique) or id?
        // PRIMARY_KEY_COLUMN is "Mã đơn hàng" -> order_code
        // Supabase `orders` has `order_code` unique column.

        const updatePayload = { [dbKey]: formattedValue };
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

const ffmOrderPassesFilter = (row) => {
    const tracking = String(row.tracking_code ?? '').trim();
    const hasTracking = tracking.length > 0;
    const checkResult = String(row.check_result || '').trim();
    const isCheckOK = checkResult.toUpperCase() === 'OK';
    const hasMgt = String(row.shipping_unit || '').toLowerCase().includes('mgt');
    if (hasTracking) return true;
    return hasMgt && isCheckOK;
};

/**
 * Một lô FFM: song song MGT + có tracking, gộp theo order_code, lọc, map app.
 * Dùng incremental: gọi lần lượt với nextMgtFrom / nextTrackedFrom cho đến khi cả hai exhausted.
 */
export const fetchFFMOrdersBatch = async ({
    mgtFrom = 0,
    trackedFrom = 0,
    pageSize = 1000,
    mgtExhausted: mgtSkip = false,
    trackedExhausted: trackedSkip = false
} = {}) => {
    const mode = getDataSourceMode();
    if (mode === 'test') {
        const mock = [
            {
                'Mã đơn hàng': 'TEST-FFM-01',
                'Name*': 'Khách FFM Test',
                'Phone*': '0999888777',
                Add: 'Kho FFM Test',
                City: 'Hà Nội',
                team: 'Hà Nội',
                shipping_unit: 'MGT Express',
                'Đơn vị vận chuyển': 'MGT Express',
                'Trạng thái giao hàng': 'ĐANG GIAO',
                'Ngày lên đơn': new Date().toISOString()
            }
        ];
        return {
            rows: mock,
            nextMgtFrom: 0,
            nextTrackedFrom: 0,
            mgtExhausted: true,
            trackedExhausted: true
        };
    }

    const mgtPromise = mgtSkip
        ? Promise.resolve({ data: [], error: null })
        : supabase
              .from('orders')
              .select('*')
              .ilike('shipping_unit', '%MGT%')
              .order('order_date', { ascending: false })
              .range(mgtFrom, mgtFrom + pageSize - 1);

    const trackedPromise = trackedSkip
        ? Promise.resolve({ data: [], error: null })
        : supabase
              .from('orders')
              .select('*')
              .not('tracking_code', 'is', null)
              .neq('tracking_code', '')
              .order('order_date', { ascending: false })
              .range(trackedFrom, trackedFrom + pageSize - 1);

    const [mgtRes, trackedRes] = await Promise.all([mgtPromise, trackedPromise]);

    if (mgtRes.error) throw mgtRes.error;
    if (trackedRes.error) throw trackedRes.error;

    const mgtBatch = mgtRes.data || [];
    const trackedBatch = trackedRes.data || [];

    const merged = new Map();
    for (const row of mgtBatch) {
        if (row?.order_code) merged.set(row.order_code, row);
    }
    for (const row of trackedBatch) {
        if (row?.order_code) merged.set(row.order_code, row);
    }

    const filteredData = Array.from(merged.values())
        .filter(ffmOrderPassesFilter)
        .map(mapSupabaseOrderToApp);

    const newMgtExhausted = mgtSkip || mgtBatch.length < pageSize;
    const newTrackedExhausted = trackedSkip || trackedBatch.length < pageSize;
    const nextMgtFrom = mgtSkip ? mgtFrom : mgtFrom + mgtBatch.length;
    const nextTrackedFrom = trackedSkip ? trackedFrom : trackedFrom + trackedBatch.length;

    return {
        rows: filteredData,
        nextMgtFrom,
        nextTrackedFrom,
        mgtExhausted: newMgtExhausted,
        trackedExhausted: newTrackedExhausted
    };
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

/** Tải toàn bộ FFM (lặp batch) — ưu tiên dùng fetchFFMOrdersBatch + gộp phía UI để hiện từng lô. */
export const fetchFFMOrders = async () => {
    const merge = new Map();
    let state = {
        mgtFrom: 0,
        trackedFrom: 0,
        mgtExhausted: false,
        trackedExhausted: false
    };
    const pageSize = 1000;

    try {
        console.log('Fetching FFM orders from Supabase (full batch loop)...');
        while (!state.mgtExhausted || !state.trackedExhausted) {
            const b = await fetchFFMOrdersBatch({
                mgtFrom: state.mgtFrom,
                trackedFrom: state.trackedFrom,
                pageSize,
                mgtExhausted: state.mgtExhausted,
                trackedExhausted: state.trackedExhausted
            });
            for (const r of b.rows) {
                if (r?.[PRIMARY_KEY_COLUMN]) merge.set(r[PRIMARY_KEY_COLUMN], r);
            }
            state = {
                mgtFrom: b.nextMgtFrom,
                trackedFrom: b.nextTrackedFrom,
                mgtExhausted: b.mgtExhausted,
                trackedExhausted: b.trackedExhausted
            };
        }
        const list = Array.from(merge.values());
        console.log(`Loaded ${list.length} FFM orders (full)`);
        return list;
    } catch (error) {
        console.error('fetchFFMOrders error:', error);
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
                    updatePayload[dbKey] = prepareValueForDB(dbKey, row[appKey]);
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



// End of module



// Fetch Van Don data với pagination và filters từ backend (NOW SUPABASE)
export const fetchVanDon = async (options = {}) => {
    const {
        page = 1,
        limit = 50,
        team,
        status,
        market = [],
        product = [],
        /** Multi-select tên NV Sale (khớp cột sale_staff) */
        nv_sale = [],
        /** Multi-select tên NV MKT (khớp cột marketing_staff) */
        nv_mkt = [],
        /** Multi-select tên NV Vận đơn (khớp cột delivery_staff) */
        nv_van_don = [],
        dateFrom,
        dateTo,
        allowedStaff // Array of names allowed to view
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

        const saleStaffIn = Array.isArray(nv_sale)
            ? nv_sale.filter((x) => x && x !== '__EMPTY__')
            : [];
        const mktStaffIn = Array.isArray(nv_mkt)
            ? nv_mkt.filter((x) => x && x !== '__EMPTY__')
            : [];
        if (saleStaffIn.length > 0) {
            query = query.in('sale_staff', saleStaffIn);
        }
        if (mktStaffIn.length > 0) {
            query = query.in('marketing_staff', mktStaffIn);
        }

        const vanDonStaffIn = Array.isArray(nv_van_don)
            ? nv_van_don.filter((x) => x && x !== '__EMPTY__')
            : [];
        if (vanDonStaffIn.length > 0) {
            query = query.in('delivery_staff', vanDonStaffIn);
        }

        if (dateFrom) {
            query = query.gte('order_date', dateFrom);
        }
        if (dateTo) {
            query = query.lte('order_date', dateTo);
        }

        // --- PERSONNEL PERMISSION FILTER ---
        if (Array.isArray(allowedStaff) && allowedStaff.length > 0) {
            // Logic: Row is visible if sale_staff OR marketing_staff OR delivery_staff matches ANY of the allowed names.
            // Using ilike for case-insensitive matching.
            // match string: column.ilike.%value%

            const conditions = [];
            allowedStaff.forEach(staffName => {
                if (!staffName) return;
                const safeName = staffName.trim();
                conditions.push(`sale_staff.ilike.%${safeName}%`);
                conditions.push(`marketing_staff.ilike.%${safeName}%`);
                conditions.push(`delivery_staff.ilike.%${safeName}%`);
            });

            if (conditions.length > 0) {
                query = query.or(conditions.join(','));
            }
        }

        // --- PAGINATION ---
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // Debug: Kiểm tra đơn hàng trước khi pagination (không block query chính)
        try {
            const debugOrderCode = 'Kemb5a90cf6';
            const { data: debugCheck, error: debugError } = await supabase
                .from('orders')
                .select('order_code, order_date, team, country, sale_staff, marketing_staff, delivery_staff')
                .eq('order_code', debugOrderCode)
                .maybeSingle(); // Dùng maybeSingle thay vì single để không throw error nếu không tìm thấy
            
            if (debugCheck && !debugError) {
                console.log('🔍 [API DEBUG] Tìm thấy đơn hàng', debugOrderCode, 'trong database:');
                console.log('  - Order date:', debugCheck.order_date);
                console.log('  - Team:', debugCheck.team);
                console.log('  - Country:', debugCheck.country);
                console.log('  - Sale staff:', debugCheck.sale_staff);
                console.log('  - Marketing staff:', debugCheck.marketing_staff);
                console.log('  - Delivery staff:', debugCheck.delivery_staff);
                
                // Kiểm tra xem đơn hàng có pass các filter không
                if (team && team !== 'all' && debugCheck.team !== team) {
                    console.log('⚠️ [API DEBUG] Đơn hàng bị loại bỏ bởi team filter:', team);
                }
                if (Array.isArray(market) && market.length > 0 && !market.includes(debugCheck.country)) {
                    console.log('⚠️ [API DEBUG] Đơn hàng bị loại bỏ bởi market filter:', market);
                }
                if (dateFrom && debugCheck.order_date < dateFrom) {
                    console.log('⚠️ [API DEBUG] Đơn hàng bị loại bỏ bởi dateFrom filter:', dateFrom);
                }
                if (dateTo && debugCheck.order_date > dateTo) {
                    console.log('⚠️ [API DEBUG] Đơn hàng bị loại bỏ bởi dateTo filter:', dateTo);
                }
            } else if (debugError && debugError.code !== 'PGRST116') {
                console.log('⚠️ [API DEBUG] Lỗi khi tìm đơn hàng:', debugError);
            }
        } catch (debugErr) {
            console.warn('⚠️ [API DEBUG] Lỗi trong debug code (không ảnh hưởng query chính):', debugErr);
        }

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
