import { COLUMN_MAPPING, DROPDOWN_OPTIONS, PRIMARY_KEY_COLUMN, SETTINGS_KEY } from '../types';
import { parseVietnameseMoneyToNumber } from '../utils/parseVietnameseMoney';
import { isVanDonSemanticEmpty } from '../utils/vanDonSemanticEmpty';
import { formatOrderLogJsonbForDisplay, mergeOrderLogJsonb, parseOrderLogJsonb } from '../utils/orderLogJsonb';
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
    "shipping_fee": "Phí ship",
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
    // Thời gian giao dự kiến → cột FFM (estimated_delivery_date chỉ fallback đọc dữ liệu cũ trong mapSupabaseOrderToApp)
    "thoigiangiaohangffm": "Thời gian giao dự kiến",
    "warehouse_fee": "Phí xử lý đơn đóng hàng-Lưu kho(usd)",
    "luu_kho_usd": "Ngày đối soát kế toán",
    "note_caps": "GHI CHÚ",
    "accounting_check_date": "Ngày Kế toán đối soát với FFM lần 2",
    "tracking_check_date": "Ngày có mã tracking",
    "reconciled_amount": "Số tiền của đơn hàng đã về TK Cty",
    "payment_bill": "Payment Bill",
    "payment_image": "Payment Image",
    "ngayupbill": "Ngày up bill",
    "reconciled_vnd": "Tiền đã thanh toán",
    "cskh_status": "Trạng thái cskh",
    "log": "Nhật ký",
    "canh_bao": "Cảnh báo trùng"
};

/**
 * Khóa cột từ UI (nhãn tiếng Việt HOẶC snake_case từ COLUMN_MAPPING) → tên cột bảng orders.
 * Trước đây chỉ khớp nhãn Việt → các cột dùng colKey kiểu sale_staff bị bỏ qua khi batch save (dữ liệu không ghi / refetch lệch).
 */
/**
 * Cột DB `warehouse_fee` (UI: Ngày đối soát kế toán) — text.
 * Dữ liệu cũ từ shipping_fee nhầm có thể là số 0 → không hiển thị "0" thay cho trống.
 */
export const normalizeNgayDoiSoatKeToanText = (v) => {
    if (v === undefined || v === null) return '';
    const s = String(v).trim();
    if (s === '') return '';
    if (s === '0' || s === '0.0' || s === '0,0') return '';
    // Ngày đối soát luôn coi là text dạng date (không coi số tiền là ngày).
    // - ISO: 2026-03-30...
    // - VN: 02/04/2026... (có thể có time phía sau)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
    // If DB đang bị kiểu numeric và đang lưu dạng YYYYMMDD (vd 20260402)
    if (/^\d{8}$/.test(s)) {
        const yyyy = s.slice(0, 4);
        const mm = s.slice(4, 6);
        const dd = s.slice(6, 8);
        return `${dd}/${mm}/${yyyy}`;
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return s;
    if (/^\d{1,2}-\d{1,2}-\d{2,4}/.test(s)) return s;
    return '';
};

const parseNgayDoiSoatKeToanToYmdNumber = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') {
        const s = String(value);
        // only treat 8-digit as YYYYMMDD
        if (/^\d{8}$/.test(s)) return value;
        return null;
    }

    const raw = String(value).trim();
    if (raw === '' || raw === '0' || raw === '0.0' || raw === '0,0') return null;

    // YYYYMMDD (numeric fallback)
    if (/^\d{8}$/.test(raw)) return Number(raw);

    // ISO: YYYY-MM-DD...
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        const yyyy = iso[1];
        const mm = iso[2];
        const dd = iso[3];
        return Number(`${yyyy}${mm}${dd}`);
    }

    // VN: dd/mm/yyyy (optionally has time phía sau)
    const vn = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (vn) {
        const dd = vn[1].padStart(2, '0');
        const mm = vn[2].padStart(2, '0');
        const yyOrYyyy = vn[3];
        const yyyy = yyOrYyyy.length === 2 ? `20${yyOrYyyy}` : yyOrYyyy;
        return Number(`${yyyy}${mm}${dd}`);
    }

    // dd-mm-yyyy also supported
    const vnDash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
    if (vnDash) {
        const dd = vnDash[1].padStart(2, '0');
        const mm = vnDash[2].padStart(2, '0');
        const yyOrYyyy = vnDash[3];
        const yyyy = yyOrYyyy.length === 2 ? `20${yyOrYyyy}` : yyOrYyyy;
        return Number(`${yyyy}${mm}${dd}`);
    }

    return null;
};

const resolveAppKeyToDbKey = (appKey) => {
    if (appKey == null || appKey === '') return null;
    const nfc = String(appKey).normalize('NFC');
    const byLabel = Object.keys(DB_TO_APP_MAPPING).find(
        (k) => String(DB_TO_APP_MAPPING[k]).normalize('NFC') === nfc
    );
    if (byLabel) return byLabel;
    if (Object.prototype.hasOwnProperty.call(DB_TO_APP_MAPPING, appKey)) return appKey;
    if (Object.prototype.hasOwnProperty.call(DB_TO_APP_MAPPING, nfc)) return nfc;

    if (appKey === 'Trạng thái giao hàng NB') return 'delivery_status_nb';
    if (appKey === 'delivery_status') return 'delivery_status';
    if (appKey === 'Ghi chú vận đơn' || appKey === 'Ghi chú của VĐ') return 'vandon_note';
    if (appKey === 'Ngày đẩy đơn') return 'accounting_check_date';
    /** Cột Nhật ký: fallback nếu nhãn lệch Unicode / mapping */
    if (nfc === 'Nhật ký'.normalize('NFC') || nfc === 'log' || appKey === 'log') return 'log';
    if (nfc === 'Cảnh báo trùng'.normalize('NFC') || appKey === 'canh_bao') return 'canh_bao';
    /** Dữ liệu cũ / pending lưu tay vẫn có thể dùng khóa cột cũ */
    if (appKey === 'estimated_delivery_date' || nfc === 'estimated_delivery_date') return 'thoigiangiaohangffm';
    return null;
};

export const mapSupabaseOrderToApp = (sOrder) => {
    const appOrder = {};
    Object.keys(sOrder).forEach(k => {
        appOrder[k] = sOrder[k];
    });

    Object.entries(DB_TO_APP_MAPPING).forEach(([dbKey, appKey]) => {
        if (sOrder[dbKey] !== undefined) {
            appOrder[appKey] = sOrder[dbKey];
        }
    });

    // Thời gian giao dự kiến: ưu tiên thoigiangiaohangffm; estimated_delivery_date chỉ fallback (dữ liệu cũ)
    const estEd = sOrder.estimated_delivery_date;
    const ffmEd = sOrder.thoigiangiaohangffm;
    const isEmptyMergedDate = (v) =>
        v === undefined ||
        v === null ||
        (typeof v === 'string' && v.trim() === '');
    const hasFfm = !isEmptyMergedDate(ffmEd);
    const hasEst = !isEmptyMergedDate(estEd);
    if (hasFfm) {
        appOrder['Thời gian giao dự kiến'] = ffmEd;
    } else if (hasEst) {
        appOrder['Thời gian giao dự kiến'] = estEd;
    } else {
        appOrder['Thời gian giao dự kiến'] = null;
    }

    // Giá bán: ưu tiên sale_price; null/undefined thì dùng goods_amount (dữ liệu cũ)
    if (sOrder.sale_price !== undefined && sOrder.sale_price !== null) {
        appOrder["Giá bán"] = sOrder.sale_price;
    } else if (sOrder.goods_amount !== undefined) {
        appOrder["Giá bán"] = sOrder.goods_amount;
    }

    // Hình thức thanh toán: ưu tiên payment_method; nếu trống thì fallback payment_method_text
    const paymentMethod = sOrder.payment_method === undefined || sOrder.payment_method === null
        ? ''
        : String(sOrder.payment_method).trim();
    const paymentMethodText = sOrder.payment_method_text === undefined || sOrder.payment_method_text === null
        ? ''
        : String(sOrder.payment_method_text).trim();
    appOrder["Hình thức thanh toán"] = paymentMethod || paymentMethodText || '';

    if (!appOrder["Ngày lên đơn"] && sOrder.order_date) appOrder["Ngày lên đơn"] = sOrder.order_date;
    if (!appOrder["Mã đơn hàng"]) appOrder["Mã đơn hàng"] = sOrder.order_code;
    // Hai cột tách biệt: delivery_status ↔ Trạng thái giao hàng, delivery_status_nb ↔ Trạng thái giao hàng NB
    appOrder["Trạng thái giao hàng NB"] = sOrder.delivery_status_nb ?? '';

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
    // Tạm thời để lại "cột cũ" để lấy dữ liệu:
    // ưu tiên luu_kho_usd (đúng mapping mới), nhưng nếu trống/không phải dạng ngày
    // thì fallback sang warehouse_fee (dữ liệu ngày cũ).
    const nsFromLuu = normalizeNgayDoiSoatKeToanText(sOrder.luu_kho_usd);
    const nsFromWh = nsFromLuu
        ? ''
        : normalizeNgayDoiSoatKeToanText(sOrder.warehouse_fee);
    const nsFromShip = nsFromLuu || nsFromWh
        ? ''
        : normalizeNgayDoiSoatKeToanText(sOrder.shipping_fee);
    const ns = nsFromLuu || nsFromWh || nsFromShip || normalizeNgayDoiSoatKeToanText(appOrder['Ngày đối soát kế toán']);

    appOrder['Ngày đối soát kế toán'] = ns;
    // Đồng bộ key DB cho ô ngày (để filter/edit dùng luôn luu_kho_usd).
    appOrder.luu_kho_usd = ns;
    for (const k of ['shipping_unit', 'tracking_code', 'Đơn vị vận chuyển', 'Mã Tracking']) {
        const v = appOrder[k];
        if (typeof v === 'string') appOrder[k] = v.trim();
    }

    if (sOrder.log !== undefined && sOrder.log !== null) {
        appOrder['Nhật ký'] = formatOrderLogJsonbForDisplay(sOrder.log);
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

/** Cột bảng `orders` kiểu numeric — giá trị từ lưới có thể là "4.725.000". */
const ORDERS_NUMERIC_DB_KEYS = new Set([
    'total_amount_vnd',
    'sale_price',
    'goods_amount',
    'shipping_fee',
    'warehouse_fee',
    'reconciled_amount',
    'reconciled_vnd',
    'quantity_1',
    'quantity_2',
    'gift_quantity',
]);

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
 * - Formats date fields using parseDateForDB (trừ thoigiangiaohangffm: giữ nguyên text như người dùng nhập).
 */
const prepareValueForDB = (dbKey, value) => {
    // If value is explicitly an empty string, we want to save it as NULL in DB
    // to support clearing numeric/date/text fields correctly in PostgreSQL.
    if (value === '' || value === undefined) return null;

    if (dbKey === 'luu_kho_usd') {
        // Defensive: some DBs đang bị kiểu `numeric` dù UI là ngày dd/mm/yyyy.
        // Convert ngày -> YYYYMMDD number để tránh lỗi "invalid input syntax for type numeric".
        // Khi DB đúng kiểu text, việc lưu YYYYMMDD cũng không làm crash; UI sẽ hiển thị lại qua normalize().
        return parseNgayDoiSoatKeToanToYmdNumber(value);
    }

    // Thời gian giao dự kiến (cột FFM): giữ nguyên chuỗi; chỉ null nếu rỗng hoàn toàn.
    if (dbKey === 'thoigiangiaohangffm') {
        if (value === undefined || value === null) return null;
        const s = typeof value === 'string' ? value : String(value);
        return s.trim() === '' ? null : s;
    }

    if (['order_date', 'created_at', 'accounting_check_date', 'ngayupbill', 'ngaydonghang', 'tracking_check_date'].includes(dbKey)) {
        return parseDateForDB(value);
    }
    if (ORDERS_NUMERIC_DB_KEYS.has(dbKey)) {
        if (typeof value === 'string' && value.trim() === '') return null;
        return parseVietnameseMoneyToNumber(value);
    }
    return value;
};

/** Chuẩn hóa xuống dòng để so khớp ô textarea với chuỗi format từ DB. */
function normalizeVanDonLogDisplayText(s) {
    return String(s ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
}

/** Chuẩn hóa mảng log trước khi gửi Supabase (jsonb). */
function sanitizeLogJsonbForSupabase(arr) {
    if (!Array.isArray(arr)) return [];
    try {
        return JSON.parse(JSON.stringify(arr));
    } catch {
        return [];
    }
}

/**
 * Lưới vận đơn sửa "Nhật ký" dạng text (formatOrderLogJsonbForDisplay).
 * Luôn merge thêm bản ghi khi còn nội dung — tránh bỏ qua do lệch so khớp chuỗi với DB.
 */
async function resolveOrderLogJsonbAfterGridEdit(orderCode, newDisplayText, modifiedBy) {
    const oc = String(orderCode ?? '').trim();
    if (!oc) throw new Error('Thiếu mã đơn hàng khi lưu Nhật ký.');
    const newStr = normalizeVanDonLogDisplayText(newDisplayText);
    const { data: row, error } = await supabase.from('orders').select('log').eq('order_code', oc).maybeSingle();
    if (error) throw error;
    const prev = parseOrderLogJsonb(row?.log);
    const oldFmt = normalizeVanDonLogDisplayText(formatOrderLogJsonbForDisplay(row?.log));
    if (!newStr.trim()) {
        return sanitizeLogJsonbForSupabase([]);
    }
    const entry = {
        thoi_gian: new Date().toISOString(),
        nhan_vien: String(modifiedBy || '').trim() || 'hệ thống',
        cot: 'Nhật ký',
        cot_db: 'log',
        gia_tri_cu: oldFmt || null,
        gia_tri_moi: newStr,
    };
    return sanitizeLogJsonbForSupabase(mergeOrderLogJsonb(prev, [entry]));
}

export const updateSingleCell = async (orderId, columnKey, newValue, modifiedBy) => {
    try {
        const oid = String(orderId ?? '').trim();
        if (!oid) throw new Error('Thiếu mã đơn hàng.');

        const dbKey = resolveAppKeyToDbKey(columnKey);
        if (!dbKey) throw new Error(`Không tìm thấy cột tương ứng trong DB cho: ${columnKey}`);

        let formattedValue;
        if (dbKey === 'log') {
            formattedValue = await resolveOrderLogJsonbAfterGridEdit(oid, newValue, modifiedBy);
        } else {
            formattedValue = prepareValueForDB(dbKey, newValue);
        }

        const updatePayload = { [dbKey]: formattedValue };
        if (modifiedBy) {
            updatePayload.last_modified_by = modifiedBy;
        }

        /** Không dùng `.select()` sau update — nhiều project RLS cho phép UPDATE nhưng trả về 0 dòng khi RETURNING. */
        const { error } = await supabase.from('orders').update(updatePayload).eq('order_code', oid);

        if (error) throw error;

        console.log(`Updated ${oid}: ${dbKey} = ${newValue}`);
        return { success: true, daa: null };

    } catch (error) {
        console.error('updateSingleCell Supabase error:', error);
        throw error;
    }
};

const ffmOrderPassesFilter = (row) => {
    const tracking = String(row.tracking_code ?? '').trim();
    const hasTracking = tracking.length > 0;
    const shippingUnit = String(row.shipping_unit ?? '').trim().toLowerCase();
    const hasValidCarrier = shippingUnit.includes('mgt') || shippingUnit.includes('t&t');

    if (hasTracking) return true;
    return hasValidCarrier;
};

/**
 * Một lô FFM: song song MGT/T&T + có tracking, gộp theo order_code, lọc, map app.
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
              .or('shipping_unit.ilike.%MGT%,shipping_unit.ilike.%T&T%')
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

/**
 * @param {Array<Record<string, unknown>>} rows — mỗi phần tử có PRIMARY_KEY + các cột app đã đổi
 * @param {string} [modifiedBy]
 * @param {Array<{ orderId: string, colKey: string, originalValue?: string, newValue?: string }>} [changeLog] — trang /van-don: mỗi ô sửa → một dòng ghi vào orders.log (jsonb)
 */
export const updateBatch = async (rows, modifiedBy, changeLog = null) => {
    try {
        console.log(`Supabase Batch Update: ${rows.length} rows`);

        const useActivityLog = Array.isArray(changeLog) && changeLog.length > 0;

        const updates = rows.map(row => {
            const orderCode = String(row[PRIMARY_KEY_COLUMN] ?? '').trim();
            if (!orderCode) return null;

            const updatePayload = {};
            if (modifiedBy) {
                updatePayload.last_modified_by = modifiedBy;
            }

            Object.keys(row).forEach((appKey) => {
                if (appKey === PRIMARY_KEY_COLUMN) return;
                const dbKey = resolveAppKeyToDbKey(appKey);
                if (!dbKey) return;
                if (useActivityLog && dbKey === 'log') {
                    return;
                }
                if (dbKey === 'log') {
                    updatePayload[dbKey] = row[appKey];
                } else {
                    updatePayload[dbKey] = prepareValueForDB(dbKey, row[appKey]);
                }
            });

            return { order_code: orderCode, ...updatePayload };
        }).filter(Boolean);

        if (updates.length === 0) return { success: true, message: "Nothing to update" };

        let total = 0;
        let skippedNoPayload = 0;
        for (const u of updates) {
            const { order_code: ocRaw, ...payload } = u;
            const oc = String(ocRaw ?? '').trim();
            if (!oc) {
                skippedNoPayload += 1;
                continue;
            }

            if (useActivityLog) {
                const trail = changeLog.filter((c) => String(c.orderId ?? '').trim() === oc);
                if (trail.length > 0) {
                    const { data: logRow, error: logErr } = await supabase
                        .from('orders')
                        .select('log')
                        .eq('order_code', oc)
                        .maybeSingle();
                    if (logErr) throw logErr;
                    const prev = parseOrderLogJsonb(logRow?.log);
                    const ts = new Date().toISOString();
                    const nv = String(modifiedBy || '').trim() || 'hệ thống';
                    const entries = trail
                        .map((ch) => {
                            const dbK = resolveAppKeyToDbKey(ch.colKey);
                            if (!dbK) return null;
                            const cot = String(ch.colKey || '').trim() || dbK;
                            const cuRaw = ch.originalValue != null ? String(ch.originalValue) : '';
                            const moiRaw = ch.newValue != null ? String(ch.newValue) : '';
                            const cu = normalizeVanDonLogDisplayText(cuRaw);
                            const moi = normalizeVanDonLogDisplayText(moiRaw);
                            return {
                                thoi_gian: ts,
                                nhan_vien: nv,
                                cot,
                                cot_db: dbK,
                                gia_tri_cu: cu.trim() === '' ? null : cu,
                                gia_tri_moi: moi.trim() === '' ? null : moi,
                            };
                        })
                        .filter(Boolean);
                    if (entries.length > 0) {
                        payload.log = sanitizeLogJsonbForSupabase(mergeOrderLogJsonb(prev, entries));
                    }
                }
            } else if (Object.prototype.hasOwnProperty.call(payload, 'log')) {
                const rawLog = payload.log;
                payload.log = await resolveOrderLogJsonbAfterGridEdit(oc, rawLog, modifiedBy);
            }

            const keys = Object.keys(payload).filter((k) => k !== 'last_modified_by');
            if (keys.length === 0) {
                skippedNoPayload += 1;
                continue;
            }

            const { error } = await supabase.from('orders').update(payload).eq('order_code', oc);
            if (error) throw error;
            total += 1;
        }

        if (total === 0 && updates.length > 0 && skippedNoPayload === updates.length) {
            throw new Error(
                'Không có trường nào được gửi để cập nhật. Kiểm tra tên cột hoặc thử lại sau khi chỉnh ô.'
            );
        }

        return { success: true, count: total };

    } catch (error) {
        console.error('updateBatch Supabase error:', error);
        throw error;
    }
};



// End of module

/**
 * Cột orders cho trang /van-don — giữ khớp view SQL `public.van_don_page`
 * (supabase/migrations/van_don_page_view_and_distinct.sql).
 */
export const VAN_DON_PAGE_COLUMN_LIST = [
    'order_code', 'customer_name', 'customer_phone', 'customer_address', 'city', 'state', 'country', 'zipcode',
    'product', 'total_amount_vnd', 'payment_method', 'payment_method_text', 'tracking_code', 'shipping_fee',
    'marketing_staff', 'sale_staff', 'team', 'delivery_staff', 'delivery_status', 'payment_status', 'note', 'reason',
    'order_date', 'sale_price', 'goods_amount', 'shipping_unit', 'accountant_confirm', 'created_at', 'ngaydonghang',
    'check_result', 'vandon_note', 'product_name_1', 'quantity_1', 'product_name_2', 'quantity_2', 'gift', 'gift_item', 'gift_quantity', 'gift_qty',
    'delivery_status_nb', 'payment_currency', 'estimated_delivery_date', 'thoigiangiaohangffm', 'warehouse_fee', 'luu_kho_usd',
    'note_caps', 'accounting_check_date', 'tracking_check_date', 'reconciled_amount', 'payment_bill', 'payment_image',
    'ngayupbill', 'reconciled_vnd', 'cskh_status', 'log', 'canh_bao'
];

const VAN_DON_SELECT_QUERY = VAN_DON_PAGE_COLUMN_LIST.join(',');

/** Cột ngày lọc theo 1 ngày ở header (khớp logic VanDon.jsx). */
const VAN_DON_PER_COL_DATE_UI_KEYS = new Set([
    'Ngày lên đơn',
    'Ngày đóng hàng',
    'Ngày đẩy đơn',
    'Ngày có mã tracking',
    'Ngày Kế toán đối soát với FFM lần 2',
]);

/** Nhãn cột UI tính toán → cột DB (không có trong DB_TO_APP_MAPPING). */
const VAN_DON_UI_COL_DB_OVERRIDE = {
    'Ngày đẩy đơn': 'accounting_check_date',
    'Ngày có mã tracking': 'tracking_check_date',
};

function normalizeVanDonFilterDateToYmd(input) {
    if (input == null || input === '') return '';
    const str = String(input).trim();
    if (!str) return '';
    if (str.match(/^\d{4}-\d{2}-\d{2}/)) return str.split('T')[0].split(' ')[0];
    if (str.includes('/')) {
        const parts = str.split(' ')[0].split('/');
        if (parts.length === 3) {
            const [d, m, y] = parts.map(Number);
            const fullYear = y < 100 ? 2000 + y : y;
            return `${fullYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
    }
    return str.split('T')[0].split(' ')[0] || '';
}

function addOneCalendarDayYmd(ymd) {
    const d = new Date(`${ymd}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return ymd;
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

function escapeIlikePattern(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** @param {string} uiKey — khóa trong filterValues (tiêu đề cột). */
export function resolveVanDonFilterUiKeyToDb(uiKey) {
    if (!uiKey || typeof uiKey !== 'string') return null;
    const resolved = COLUMN_MAPPING[uiKey] || uiKey;
    const override = VAN_DON_UI_COL_DB_OVERRIDE[resolved] || VAN_DON_UI_COL_DB_OVERRIDE[uiKey];
    if (override) return override;
    for (const [dbCol, label] of Object.entries(DB_TO_APP_MAPPING)) {
        if (label === resolved) return dbCol;
    }
    return null;
}

function isVanDonDropdownColumnFilter(uiKey) {
    const dataKey = COLUMN_MAPPING[uiKey] || uiKey;
    return Boolean(
        DROPDOWN_OPTIONS[dataKey] ||
            DROPDOWN_OPTIONS[uiKey] ||
            ['Trạng thái giao hàng', 'Kết quả check', 'GHI CHÚ'].includes(dataKey)
    );
}

// Fetch Van Don data với pagination và filters từ backend (NOW SUPABASE)
export const fetchVanDon = async (options = {}) => {
    const {
        page = 1,
        limit = 50,
        sourceView = 'van_don_page',
        sourceTable = 'orders',
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
        /** Multi-select đơn vị vận chuyển (cột shipping_unit) */
        shipping_unit = [],
        dateFrom,
        dateTo,
        allowedStaff, // Array of names allowed to view
        /** Tab Đơn cá nhân /van-don: chỉ đơn có delivery_staff khớp tên (không dùng % — so khớp nguyên chuỗi, không phân biệt hoa thường). */
        deliveryStaffSelfFilter,
        /** Lọc theo ô header cột (toàn bộ CSDL, không chỉ trang hiện tại). */
        columnFilters = {},
        /** { status, include, exclude } — khớp bộ lọc Mã Tracking trên lưới. */
        trackingFilter = null,
    } = options;

    const mode = getDataSourceMode();
    if (mode === 'test') {
        console.log('🔶 [TEST MODE] Using Mock Data for fetchVanDon');
        // Return dummy response for Van Don
        const mockRows = [
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
        ];
        const mockSum = mockRows.reduce((s, r) => {
            const n = parseFloat(String(r['Tổng tiền VNĐ'] ?? 0).replace(/[^\d.-]/g, '')) || 0;
            return s + n;
        }, 0);
        return {
            data: mockRows,
            total: 2,
            totalAmountVndSum: mockSum,
            page: 1,
            limit: limit,
            totalPages: 1
        };
    }

    try {
        console.log('Fetching Van Don properties from Supabase...');

        const pageFrom = (page - 1) * limit;
        const pageTo = pageFrom + limit - 1;

        /** Escape giá trị trong PostgREST `in.(...)` khi ghép vào `.or(...)`. */
        const orEncodeInList = (vals) =>
            vals.map((v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');

        const applyVanDonFilters = (initialQuery) => {
            let query = initialQuery;

            if (team && team !== 'all') {
                query = query.eq('team', team);
            }

            if (status) {
                query = query.ilike('delivery_status', `%${status}%`);
            }

            const applyEmptyOrInFilter = (field, value) => {
                const hasEmpty = Array.isArray(value) ? value.includes('Trống') || value.includes('__EMPTY__') : value === 'Trống' || value === '__EMPTY__';
                const inValues = Array.isArray(value)
                    ? value.filter((x) => x && x !== 'Trống' && x !== '__EMPTY__')
                    : typeof value === 'string' && value && value !== 'Trống' && value !== '__EMPTY__'
                      ? [value]
                      : [];

                if (inValues.length > 0 && hasEmpty) {
                    const enc = orEncodeInList(inValues);
                    query = query.or(`${field}.in.(${enc}),${field}.is.null,${field}.eq.`);
                } else if (inValues.length > 0) {
                    query = query.in(field, inValues);
                } else if (hasEmpty) {
                    query = query.or(`${field}.is.null,${field}.eq.`);
                }
            };

            if (market !== undefined && market !== null) {
                if (Array.isArray(market) ? market.length > 0 : typeof market === 'string' && market) {
                    applyEmptyOrInFilter('country', market);
                }
            }

            if (product !== undefined && product !== null) {
                if (Array.isArray(product) ? product.length > 0 : typeof product === 'string' && product) {
                    applyEmptyOrInFilter('product', product);
                }
            }

            if (nv_sale !== undefined && nv_sale !== null && Array.isArray(nv_sale) && nv_sale.length > 0) {
                applyEmptyOrInFilter('sale_staff', nv_sale);
            }
            if (nv_mkt !== undefined && nv_mkt !== null && Array.isArray(nv_mkt) && nv_mkt.length > 0) {
                applyEmptyOrInFilter('marketing_staff', nv_mkt);
            }
            if (nv_van_don !== undefined && nv_van_don !== null && Array.isArray(nv_van_don) && nv_van_don.length > 0) {
                applyEmptyOrInFilter('delivery_staff', nv_van_don);
            }
            if (shipping_unit !== undefined && shipping_unit !== null && Array.isArray(shipping_unit) && shipping_unit.length > 0) {
                applyEmptyOrInFilter('shipping_unit', shipping_unit);
            }

            if (deliveryStaffSelfFilter !== undefined && deliveryStaffSelfFilter !== null && String(deliveryStaffSelfFilter).trim() !== '') {
                const raw = String(deliveryStaffSelfFilter).trim();
                const esc = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
                query = query.ilike('delivery_staff', `%${esc}%`);
            }

            const dateColumnMapping = {
                'Ngày lên đơn': 'order_date',
                'Ngày đóng hàng': 'ngaydonghang',
                'Ngày đẩy đơn': 'accounting_check_date',
                'Ngày có mã tracking': 'tracking_check_date',
            };
            const dateColumn = dateColumnMapping[options.dateType] || 'order_date';

            if (dateFrom) {
                query = query.gte(dateColumn, dateFrom);
            }
            if (dateTo) {
                query = query.lte(dateColumn, dateTo);
            }

            if (Array.isArray(allowedStaff) && allowedStaff.length > 0) {
                const conditions = [];
                allowedStaff.forEach((staffName) => {
                    if (!staffName) return;
                    const safeName = String(staffName).trim();
                    if (!safeName) return;
                    conditions.push(`sale_staff.ilike.%${safeName}%`);
                    conditions.push(`marketing_staff.ilike.%${safeName}%`);
                    conditions.push(`delivery_staff.ilike.%${safeName}%`);
                });

                if (conditions.length > 0) {
                    query = query.or(conditions.join(','));
                }
            }

            const cf = columnFilters && typeof columnFilters === 'object' ? columnFilters : {};
            for (const [uiKey, val] of Object.entries(cf)) {
                const dbCol = resolveVanDonFilterUiKeyToDb(uiKey);
                if (!dbCol || !VAN_DON_PAGE_COLUMN_LIST.includes(dbCol)) continue;

                if (val == null) continue;
                if (Array.isArray(val)) {
                    if (val.length === 0 || !isVanDonDropdownColumnFilter(uiKey)) continue;
                    applyEmptyOrInFilter(dbCol, val);
                    continue;
                }
                if (typeof val === 'string') {
                    const t = val.trim();
                    if (!t) continue;
                    if (VAN_DON_PER_COL_DATE_UI_KEYS.has(uiKey)) {
                        const day = normalizeVanDonFilterDateToYmd(t);
                        if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
                        const next = addOneCalendarDayYmd(day);
                        query = query.gte(dbCol, `${day}T00:00:00`).lt(dbCol, `${next}T00:00:00`);
                    } else if (isVanDonDropdownColumnFilter(uiKey)) {
                        query = query.eq(dbCol, t);
                    } else {
                        const esc = escapeIlikePattern(t);
                        query = query.filter(`${dbCol}::text`, 'ilike', `%${esc}%`);
                    }
                }
            }

            const tf = trackingFilter && typeof trackingFilter === 'object' ? trackingFilter : null;
            if (tf) {
                const statusTf = String(tf.status || 'Tình trạng mã').trim();
                const incRaw = String(tf.include || '');
                const excRaw = String(tf.exclude || '');
                const inc = incRaw.trim().toLowerCase();
                const exc = excRaw.trim().toLowerCase();

                if (statusTf === 'Tất cả có mã') {
                    query = query.not('tracking_code', 'is', null).neq('tracking_code', '');
                } else if (statusTf === 'Trống') {
                    query = query.or('tracking_code.is.null,tracking_code.eq.');
                } else if (statusTf === 'Toàn số') {
                    query = query
                        .not('tracking_code', 'is', null)
                        .neq('tracking_code', '')
                        .filter('tracking_code', 'match', '^[0-9]+$');
                }

                if (statusTf === 'Tình trạng mã' || !tf.status) {
                    if (exc) {
                        const escExc = escapeIlikePattern(excRaw.trim());
                        query = query.not('tracking_code', 'ilike', `%${escExc}%`);
                    }
                    if (incRaw.trim()) {
                        const incTrim = incRaw.trim();
                        if (incTrim.includes('\n')) {
                            const codes = incTrim
                                .split('\n')
                                .map((s) => s.trim())
                                .filter(Boolean);
                            if (codes.length > 0) {
                                query = query.in('tracking_code', codes);
                            }
                        } else {
                            const escInc = escapeIlikePattern(incTrim);
                            query = query.ilike('tracking_code', `%${escInc}%`);
                        }
                    }
                }
            }

            return query;
        };

        const loadVanDonFromTable = async (tableName) => {
            const baseData = applyVanDonFilters(supabase.from(tableName).select(VAN_DON_SELECT_QUERY, { count: 'exact' }));
            const baseSum = applyVanDonFilters(supabase.from(tableName).select('total_amount_vnd.sum()'));

            const [listRes, sumRes] = await Promise.all([
                baseData.range(pageFrom, pageTo).order('order_date', { ascending: false }),
                baseSum.maybeSingle(),
            ]);

            const rawSum = sumRes.data?.sum;
            const totalAmountVndSum =
                rawSum != null && rawSum !== '' && Number.isFinite(Number(rawSum)) ? Number(rawSum) : 0;

            return {
                data: listRes.data,
                error: listRes.error,
                count: listRes.count,
                sumError: sumRes.error,
                totalAmountVndSum,
            };
        };

        const isVanDonPageUnavailableError = (err) => {
            if (!err) return false;
            const code = String(err.code || '');
            const msg = String(err.message || '').toLowerCase();
            return (
                code === '42P01' ||
                code === 'PGRST205' ||
                (msg.includes('van_don_page') &&
                    (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')))
            );
        };

        try {
            const debugOrderCode = 'Kemb5a90cf6';
            const { data: debugCheck, error: debugError } = await supabase
                .from(sourceTable)
                .select('order_code, order_date, team, country, sale_staff, marketing_staff, delivery_staff')
                .eq('order_code', debugOrderCode)
                .maybeSingle();

            if (debugCheck && !debugError) {
                console.log('🔍 [API DEBUG] Tìm thấy đơn hàng', debugOrderCode, 'trong database:');
                console.log('  - Order date:', debugCheck.order_date);
                console.log('  - Team:', debugCheck.team);
                console.log('  - Country:', debugCheck.country);
                console.log('  - Sale staff:', debugCheck.sale_staff);
                console.log('  - Marketing staff:', debugCheck.marketing_staff);
                console.log('  - Delivery staff:', debugCheck.delivery_staff);

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

        let pack = sourceView
            ? await loadVanDonFromTable(sourceView)
            : await loadVanDonFromTable(sourceTable);

        if (sourceView && pack.error && isVanDonPageUnavailableError(pack.error)) {
            console.warn(`[fetchVanDon] ${sourceView} không dùng được, thử lại với bảng ${sourceTable}:`, pack.error.message);
            pack = await loadVanDonFromTable(sourceTable);
        }

        const { data, error, count, sumError, totalAmountVndSum } = pack;
        if (sumError) {
            console.warn('[fetchVanDon] total_amount_vnd.sum:', sumError.message);
        }

        if (error) {
            console.error('Supabase fetch error:', error);
            throw error;
        }

        const mappedData = (data || []).map(mapSupabaseOrderToApp);

        return {
            data: mappedData,
            total: count || 0,
            totalAmountVndSum: Number.isFinite(totalAmountVndSum) ? totalAmountVndSum : 0,
            page: page,
            limit: limit,
            totalPages: Math.ceil((count || 0) / limit)
        };

    } catch (error) {
        console.error('fetchVanDon Supabase error:', error);
        return {
            data: [],
            total: 0,
            totalAmountVndSum: 0,
            page: page,
            limit: limit,
            totalPages: 0,
            error: error.message
        };
    }
};

/** Một cột DB → các tiêu đề cột UI Van Đơn dùng chung danh sách distinct (một RPC / cột DB). */
const VAN_DON_DISTINCT_DB_TO_UI_KEYS = {
    country: ['Khu vực'],
    product: ['Mặt hàng'],
    sale_staff: ['Nhân viên Sale'],
    marketing_staff: ['Nhân viên MKT'],
    delivery_staff: ['NV Vận đơn'],
    shipping_unit: ['Đơn vị vận chuyển'],
    check_result: ['Kết quả Check', 'Kết quả check'],
    delivery_status_nb: ['Trạng thái giao hàng NB'],
    payment_status: ['Trạng thái thu tiền'],
    delivery_status: ['Trạng thái giao hàng'],
    note_caps: ['GHI CHÚ'],
    vandon_note: ['Ghi chú của VĐ'],
    payment_bill: ['Payment Bill'],
    cskh_status: ['Trạng thái cskh']
};

/**
 * Giá trị distinct trên view `van_don_page` (RPC `get_orders_distinct_values`) — cùng tập cột trang /van-don.
 * Chưa chạy migration SQL → RPC lỗi → trả {} (VanDon fallback unique trên trang hiện tại).
 */
export const fetchVanDonDistinctFilterOptions = async ({ sourceTable = 'orders' } = {}) => {
    if (getDataSourceMode() === 'test') {
        return {};
    }
    const out = {};
    const dbCols = Object.keys(VAN_DON_DISTINCT_DB_TO_UI_KEYS);
    await Promise.all(
        dbCols.map(async (dbCol) => {
            try {
                let vals = [];
                if (sourceTable === 'orders') {
                    const { data, error } = await supabase.rpc('get_orders_distinct_values', { p_column: dbCol });
                    if (error) {
                        console.warn('[fetchVanDonDistinctFilterOptions] RPC', dbCol, error.message);
                        return;
                    }
                    vals = (data || [])
                        .map((row) => (row && row.val != null ? String(row.val).trim() : ''))
                        .filter(Boolean)
                        .filter((v) => v !== '__EMPTY__' && !isVanDonSemanticEmpty(v));
                } else {
                    const { data, error } = await supabase
                        .from(sourceTable)
                        .select(dbCol)
                        .not(dbCol, 'is', null)
                        .neq(dbCol, '')
                        .limit(10000);
                    if (error) {
                        console.warn('[fetchVanDonDistinctFilterOptions] table', sourceTable, dbCol, error.message);
                        return;
                    }
                    vals = [...new Set((data || [])
                        .map((row) => (row && row[dbCol] != null ? String(row[dbCol]).trim() : ''))
                        .filter(Boolean)
                        .filter((v) => v !== '__EMPTY__' && !isVanDonSemanticEmpty(v)))];
                }
                const uiKeys = VAN_DON_DISTINCT_DB_TO_UI_KEYS[dbCol] || [];
                for (const k of uiKeys) {
                    out[k] = vals;
                }
            } catch (e) {
                console.warn('[fetchVanDonDistinctFilterOptions]', dbCol, e);
            }
        })
    );
    return out;
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
/**
 * Ghi log chuẩn bị đẩy FFM.
 * @param {Array<string | { orderId: string, product?: string | null, country?: string | null, chi_nhanh?: string | null, total_amount_vnd?: number | null }>} orderIdsOrEntries — mã đơn hoặc object có snapshot từ lưới vận đơn
 */
export const createFfmPushLogs = async (orderIdsOrEntries, carrier, pushedBy) => {
    try {
        const batchId = crypto.randomUUID();
        const rows = orderIdsOrEntries.map((item) => {
            const isObj = item !== null && typeof item === 'object' && !Array.isArray(item);
            const id = isObj ? String(item.orderId ?? item.order_code ?? '').trim() : String(item ?? '').trim();
            const ex = isObj ? item : {};
            const n = ex.total_amount_vnd;
            const totalNum = parseVietnameseMoneyToNumber(n);
            return {
                order_code: id,
                carrier,
                pushed_by: pushedBy,
                batch_id: batchId,
                status: 'pending',
                product: ex.product != null && String(ex.product).trim() !== '' ? String(ex.product).trim() : null,
                country: ex.country != null && String(ex.country).trim() !== '' ? String(ex.country).trim() : null,
                chi_nhanh: ex.chi_nhanh != null && String(ex.chi_nhanh).trim() !== '' ? String(ex.chi_nhanh).trim() : null,
                total_amount_vnd: totalNum,
            };
        });

        const { data, error } = await supabase
            .from('ffm_push_logs')
            .insert(rows)
            .select();

        if (error) throw error;
        return { batchId, logs: data };
    } catch (err) {
        console.error('Error creating FfmPushLogs:', err);
        throw err;
    }
};

/** Đọc view/bảng `ffm_push_logs` (đối soát đẩy FFM). Không dùng order DB để tương thích cột thời gian khác nhau. */
export const fetchFfmPushLogsForReconciliation = async ({ limit = 8000 } = {}) => {
    const { data, error } = await supabase
        .from('ffm_push_logs')
        .select('*')
        .limit(limit);
    if (error) {
        console.error('fetchFfmPushLogsForReconciliation:', error);
        throw error;
    }
    const rows = Array.isArray(data) ? data : [];
    const time = (r) => {
        const t = r?.pushed_at ?? r?.created_at ?? r?.inserted_at ?? r?.updated_at ?? null;
        if (t) return new Date(t).getTime();
        return 0;
    };
    rows.sort((a, b) => time(b) - time(a));
    return rows;
};

function isEmptyFfmSnapshotText(val) {
    if (val === null || val === undefined) return true;
    return String(val).trim() === '';
}

function needsFfmLogSnapshotFill(row) {
    const oc = row?.order_code == null ? '' : String(row.order_code).trim();
    if (!oc) return false;
    const ta = row?.total_amount_vnd;
    const taMissing = ta === null || ta === undefined;
    return (
        isEmptyFfmSnapshotText(row?.product) ||
        isEmptyFfmSnapshotText(row?.country) ||
        isEmptyFfmSnapshotText(row?.chi_nhanh) ||
        taMissing
    );
}

/**
 * Điền product, country, chi_nhanh, total_amount_vnd trên ffm_push_logs từ bảng orders (theo order_code).
 * Chỉ ghi các ô đang trống / total_amount_vnd null; không ghi đè dữ liệu đã có.
 */
export const syncFfmPushLogsFromOrders = async ({ scanLimit = 12000 } = {}) => {
    const { data: logs, error: logErr } = await supabase
        .from('ffm_push_logs')
        .select('id, order_code, product, country, chi_nhanh, total_amount_vnd')
        .not('order_code', 'is', null)
        .limit(scanLimit);
    if (logErr) throw logErr;

    const rows = Array.isArray(logs) ? logs : [];
    const needs = rows.filter(needsFfmLogSnapshotFill);
    if (needs.length === 0) {
        return {
            scanned: rows.length,
            needCount: 0,
            updated: 0,
            missingOrder: 0,
            skippedNoPatch: 0,
        };
    }

    const codes = [...new Set(needs.map((r) => String(r.order_code).trim()))];
    const orderMap = new Map();
    const chunkSize = 120;
    for (let i = 0; i < codes.length; i += chunkSize) {
        const part = codes.slice(i, i + chunkSize);
        const { data: orders, error: oErr } = await supabase
            .from('orders')
            .select('order_code, product, country, team, total_amount_vnd')
            .in('order_code', part);
        if (oErr) throw oErr;
        (orders || []).forEach((o) => {
            if (o?.order_code != null) orderMap.set(String(o.order_code).trim(), o);
        });
    }

    const updateTasks = [];
    let missingOrder = 0;
    let skippedNoPatch = 0;

    for (const log of needs) {
        const oc = String(log.order_code).trim();
        const o = orderMap.get(oc);
        if (!o) {
            missingOrder++;
            continue;
        }
        const patch = {};
        if (isEmptyFfmSnapshotText(log.product) && !isEmptyFfmSnapshotText(o.product)) {
            patch.product = String(o.product).trim();
        }
        if (isEmptyFfmSnapshotText(log.country) && !isEmptyFfmSnapshotText(o.country)) {
            patch.country = String(o.country).trim();
        }
        if (isEmptyFfmSnapshotText(log.chi_nhanh) && !isEmptyFfmSnapshotText(o.team)) {
            patch.chi_nhanh = String(o.team).trim();
        }
        if ((log.total_amount_vnd === null || log.total_amount_vnd === undefined) && o.total_amount_vnd != null) {
            const n = Number(o.total_amount_vnd);
            if (Number.isFinite(n)) patch.total_amount_vnd = n;
        }
        if (Object.keys(patch).length === 0) {
            skippedNoPatch++;
            continue;
        }
        updateTasks.push({ id: log.id, patch });
    }

    const batch = 20;
    let updated = 0;
    let failed = 0;
    for (let i = 0; i < updateTasks.length; i += batch) {
        const slice = updateTasks.slice(i, i + batch);
        const results = await Promise.all(
            slice.map(({ id, patch }) =>
                supabase.from('ffm_push_logs').update(patch).eq('id', id).then(({ error }) => ({ error }))
            )
        );
        results.forEach((r) => {
            if (r.error) {
                failed++;
                console.error('syncFfmPushLogsFromOrders update:', r.error);
            } else {
                updated++;
            }
        });
    }

    return {
        scanned: rows.length,
        needCount: needs.length,
        updated,
        failed,
        missingOrder,
        skippedNoPatch,
    };
};

/** Cập nhật trạng thái log sau xác nhận; khi confirmed ghi `pushed_at` cho đối soát */
export const updateFfmPushLogStatus = async (batchId, status) => {
    try {
        const payload = { status };
        if (status === 'confirmed') {
            payload.pushed_at = new Date().toISOString();
        }
        const { error } = await supabase
            .from('ffm_push_logs')
            .update(payload)
            .eq('batch_id', batchId);

        if (error) throw error;
    } catch (err) {
        console.error('Error updating FfmPushLogStatus:', err);
        throw err;
    }
};
