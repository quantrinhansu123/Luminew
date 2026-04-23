import { COLUMN_MAPPING, DROPDOWN_OPTIONS, PRIMARY_KEY_COLUMN, SETTINGS_KEY } from '../types';
import { parseVietnameseMoneyToNumber } from '../utils/parseVietnameseMoney';
import { isVanDonSemanticEmpty } from '../utils/vanDonSemanticEmpty';
import {
    formatOrderLogJsonbForDisplay,
    labelForOrderLogDbKey,
    mergeOrderLogJsonb,
    ORDER_LOG_TAC_NHAN_HE_THONG,
    ORDER_LOG_TAC_NHAN_NGUOI_DUNG,
    ORDER_LOG_TRACKED_DB_KEYS,
    labelOrderLogTacNhan,
    normalizeOrderLogTacNhan,
    parseOrderLogJsonb,
} from '../utils/orderLogJsonb';
import {
    buildVanDonFlexibleIlikePattern,
    escapeIlikePattern,
    normalizeVanDonFilterWhitespace
} from '../utils/vanDonFilterNormalize';
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
    "page_name": "Page",
    "team": "Team",
    "shift": "Ca",
    "delivery_staff": "NV Vận đơn",
    "delivery_status": "Trạng thái giao hàng",
    "payment_status": "Trạng thái thu tiền",
    "note": "Ghi chú",
    "lydo": "Lý do",
    "order_date": "Ngày lên đơn",
    "sale_price": "Giá bán",
    "shipping_unit": "Đơn vị vận chuyển",
    "accountant_confirm": "Kế toán xác nhận thu tiền về",
    "created_at": "Ngày tạo (DB)",
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
    /* Khớp migration ngay_doi_soat_luu_kho_usd: luu_kho_usd = ngày (text), warehouse_fee = phí USD (numeric). */
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
    /** Nhật ký riêng trang FFM (jsonb) — không dùng chung cột `log` của Vận đơn. */
    "ffm_log": "Lịch sử FFM",
    "canh_bao": "Cảnh báo trùng",
    "thu_tu_chia": "Thứ tự chia",
    "ngay_chia_van_don": "Ngày chia vận đơn",
    "payment_method_text": "Hình thức thanh toán (text)",
    "reason": "Lý do (reason)",
    "estimated_delivery_date": "Thời gian giao dự kiến (cũ)"
};

/**
 * Khóa cột từ UI (nhãn tiếng Việt HOẶC snake_case từ COLUMN_MAPPING) → tên cột bảng orders.
 * Trước đây chỉ khớp nhãn Việt → các cột dùng colKey kiểu sale_staff bị bỏ qua khi batch save (dữ liệu không ghi / refetch lệch).
 */
/**
 * Chuẩn hoá text hiển thị «Ngày đối soát kế toán» (đọc từ luu_kho_usd; fallback warehouse_fee/shipping_fee nếu dữ liệu cũ).
 * Số 0 / rỗng → trống.
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

const resolveAppKeyToDbKey = (appKey) => {
    if (appKey == null || appKey === '') return null;
    const nfc = String(appKey).normalize('NFC');
    /** Nhãn «Trạng thái giao hàng» từ lưới Vận đơn → `delivery_status_nb`. Trang FFM dùng khóa `delivery_status` (xem resolve dòng `delivery_status`). */
    if (nfc === 'Trạng thái giao hàng'.normalize('NFC')) {
        return 'delivery_status_nb';
    }
    const byLabel = Object.keys(DB_TO_APP_MAPPING).find(
        (k) => String(DB_TO_APP_MAPPING[k]).normalize('NFC') === nfc
    );
    if (byLabel) return byLabel;
    if (Object.prototype.hasOwnProperty.call(DB_TO_APP_MAPPING, appKey)) return appKey;
    if (Object.prototype.hasOwnProperty.call(DB_TO_APP_MAPPING, nfc)) return nfc;

    if (appKey === 'Trạng thái giao hàng NB') return 'delivery_status_nb';
    /** Alias UI (types COLUMN_MAPPING) — khớp ghi log batch. */
    if (nfc === 'Kết quả check'.normalize('NFC')) return 'check_result';
    if (nfc === 'Nhân viên vận đơn'.normalize('NFC')) return 'delivery_staff';
    if (appKey === 'delivery_status') return 'delivery_status';
    if (appKey === 'Ghi chú vận đơn' || appKey === 'Ghi chú của VĐ') return 'vandon_note';
    if (appKey === 'Ngày đẩy đơn') return 'accounting_check_date';
    /** Cột Nhật ký: fallback nếu nhãn lệch Unicode / mapping */
    if (nfc === 'Nhật ký'.normalize('NFC') || nfc === 'log' || appKey === 'log') return 'log';
    if (appKey === 'ffm_log' || nfc === 'ffm_log'.normalize('NFC')) return 'ffm_log';
    if (nfc === 'Cảnh báo trùng'.normalize('NFC') || appKey === 'canh_bao') return 'canh_bao';
    /** Dữ liệu cũ / pending lưu tay vẫn có thể dùng khóa cột cũ */
    if (appKey === 'estimated_delivery_date' || nfc === 'estimated_delivery_date') return 'thoigiangiaohangffm';
    /** Dữ liệu cũ / pending lưu tay có thể còn khóa reason */
    if (appKey === 'reason' || nfc === 'reason') return 'lydo';
    if (nfc === 'Thứ tự chia'.normalize('NFC') || appKey === 'thu_tu_chia') return 'thu_tu_chia';
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

    // Lý do: ưu tiên cột lydo; nếu trống thì dùng reason (dữ liệu cũ).
    {
        const ly = appOrder['Lý do'];
        const lyEmpty = ly === undefined || ly === null || String(ly).trim() === '';
        if (lyEmpty && sOrder.reason !== undefined && sOrder.reason !== null && String(sOrder.reason).trim() !== '') {
            appOrder['Lý do'] = sOrder.reason;
        }
    }

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
    // Tách tuyệt đối 2 cột trạng thái: NB và FFM không fallback chéo.
    appOrder["Trạng thái giao hàng NB"] = sOrder.delivery_status_nb ?? '';
    appOrder["Trạng thái giao hàng"] =
        sOrder.delivery_status != null && String(sOrder.delivery_status).trim() !== ''
            ? String(sOrder.delivery_status).trim()
            : '';

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
    // Ngày đối soát kế toán: ưu tiên luu_kho_usd (text); fallback warehouse_fee/shipping_fee (schema cũ hoặc nhầm cột).
    const nsFromLuu = normalizeNgayDoiSoatKeToanText(sOrder.luu_kho_usd);
    const nsFromWh = nsFromLuu ? '' : normalizeNgayDoiSoatKeToanText(sOrder.warehouse_fee);
    const nsFromShip =
        nsFromLuu || nsFromWh ? '' : normalizeNgayDoiSoatKeToanText(sOrder.shipping_fee);
    const ns =
        nsFromLuu ||
        nsFromWh ||
        nsFromShip ||
        normalizeNgayDoiSoatKeToanText(appOrder['Ngày đối soát kế toán']);

    appOrder['Ngày đối soát kế toán'] = ns;
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

/**
 * Tiền một dòng DB cho tổng / lưới — khớp COALESCE(line, NULLIF(tong_tien_vnd,0), total, sale, goods).
 * Trang Vận đơn map «Tổng tiền VNĐ» → total_amount_vnd; SUM van_don_line_total_vnd toàn bảng dễ thấp hơn tổng cột đó.
 */
export function resolveVanDonMoneyVndFromDbRow(r) {
    if (!r || typeof r !== 'object') return 0;
    if (r.van_don_line_total_vnd != null && r.van_don_line_total_vnd !== '') {
        const v = Number(r.van_don_line_total_vnd);
        if (!Number.isNaN(v)) return v;
    }
    const rawTong = r.tong_tien_vnd ?? r.tong_tien_VND;
    if (rawTong != null && rawTong !== '' && !Number.isNaN(Number(rawTong))) {
        const tn = Number(rawTong);
        if (tn !== 0) return tn;
    }
    const candidates = [r.total_amount_vnd, r.sale_price, r.goods_amount];
    for (let i = 0; i < candidates.length; i++) {
        const raw = candidates[i];
        if (raw === undefined || raw === null) continue;
        if (typeof raw === 'string' && raw.trim() === '') continue;
        if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
        const n = parseVietnameseMoneyToNumber(raw);
        if (n != null && Number.isFinite(n)) return n;
    }
    return 0;
}

function pickVanDonMoneyFromDbRow(r) {
    return resolveVanDonMoneyVndFromDbRow(r);
}

function unwrapPostgrestAggregateRow(data) {
    if (data == null) return null;
    if (Array.isArray(data)) {
        if (data.length === 0) return null;
        return data[0];
    }
    return data;
}

/**
 * PostgREST / Supabase: kết quả aggregate có thể là `[{ sum: n }]`, `{ "col.sum": n }`, hoặc `{ sum: "..." }`.
 * maybeSingle() đôi khi làm mất / lệch dữ liệu — luôn unwrap mảng một dòng.
 */
function extractPostgrestAggregateNumeric(data) {
    const row = unwrapPostgrestAggregateRow(data);
    if (row == null || typeof row !== 'object') return null;
    const keys = Object.keys(row);
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k === 'sum' || k.endsWith('.sum')) {
            const v = row[k];
            if (v !== null && v !== undefined && v !== '') {
                const n = typeof v === 'number' ? v : Number(v);
                if (Number.isFinite(n)) return n;
            }
        }
    }
    for (let i = 0; i < keys.length; i++) {
        const v = row[keys[i]];
        if (v === null || v === undefined || v === '' || typeof v === 'object') continue;
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

/** Một response PostgREST với nhiều `.sum()` — ví dụ `total_amount_vnd.sum`, `van_don_line_total_vnd.sum`. */
function extractVanDonMoneyAggregateSums(data) {
    const row = unwrapPostgrestAggregateRow(data);
    if (row == null || typeof row !== 'object') {
        return { totalRaw: null, lineRaw: null, tongRaw: null };
    }
    const num = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : null;
    };
    return {
        totalRaw: num(row['total_amount_vnd.sum']),
        lineRaw: num(row['van_don_line_total_vnd.sum']),
        tongRaw: num(row['tong_tien_vnd.sum']),
    };
}

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
 * - Formats date fields using parseDateForDB (trừ thoigiangiaohangffm, ngaydonghang: giữ text như nhập).
 */
const prepareValueForDB = (dbKey, value) => {
    // If value is explicitly an empty string, we want to save it as NULL in DB
    // to support clearing numeric/date/text fields correctly in PostgreSQL.
    if (value === '' || value === undefined) return null;

    if (dbKey === 'luu_kho_usd') {
        // Cột ngày đối soát (text), vd. 02/04/2026 — không ghi vào warehouse_fee (numeric).
        const normalized = normalizeNgayDoiSoatKeToanText(value);
        return normalized === '' ? null : normalized;
    }

    // Thời gian giao dự kiến (cột FFM): giữ nguyên chuỗi; chỉ null nếu rỗng hoàn toàn.
    if (dbKey === 'thoigiangiaohangffm') {
        if (value === undefined || value === null) return null;
        const s = typeof value === 'string' ? value : String(value);
        return s.trim() === '' ? null : s;
    }

    // Ngày đóng hàng: lưu text như người dùng nhập (dd/mm/yyyy, có giờ…); DB cột text — không ép ISO.
    if (dbKey === 'ngaydonghang') {
        if (value === undefined || value === null) return null;
        const s = typeof value === 'string' ? value : String(value);
        return s.trim() === '' ? null : s;
    }

    if (['order_date', 'created_at', 'accounting_check_date', 'ngayupbill', 'tracking_check_date'].includes(dbKey)) {
        return parseDateForDB(value);
    }
    if (ORDERS_NUMERIC_DB_KEYS.has(dbKey)) {
        if (typeof value === 'string' && value.trim() === '') return null;
        return parseVietnameseMoneyToNumber(value);
    }
    if (dbKey === 'shift') {
        if (!value) return null;
        const s = String(value).trim().replace(/\s+/g, ' ');
        const n = s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
        if (n === 'giua ca') return 'Giữa ca,Hết ca';
        return s;
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
async function resolveOrderLogJsonbAfterGridEdit(orderCode, newDisplayText, modifiedBy, sourceTable = 'orders') {
    const oc = String(orderCode ?? '').trim();
    if (!oc) throw new Error('Thiếu mã đơn hàng khi lưu Nhật ký.');
    const table = String(sourceTable || 'orders').trim() || 'orders';
    const newStr = normalizeVanDonLogDisplayText(newDisplayText);
    const { data: row, error } = await supabase.from(table).select('log').eq('order_code', oc).maybeSingle();
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

export const updateSingleCell = async (orderId, columnKey, newValue, modifiedBy, options = {}) => {
    try {
        const oid = String(orderId ?? '').trim();
        if (!oid) throw new Error('Thiếu mã đơn hàng.');
        const sourceTable = String(options?.sourceTable || 'orders').trim() || 'orders';

        const dbKey = resolveAppKeyToDbKey(columnKey);
        if (!dbKey) throw new Error(`Không tìm thấy cột tương ứng trong DB cho: ${columnKey}`);

        let formattedValue;
        if (dbKey === 'log') {
            formattedValue = await resolveOrderLogJsonbAfterGridEdit(oid, newValue, modifiedBy, sourceTable);
        } else {
            formattedValue = prepareValueForDB(dbKey, newValue);
        }

        const updatePayload = { [dbKey]: formattedValue };
        if (modifiedBy) {
            updatePayload.last_modified_by = modifiedBy;
        }

        /** Không dùng `.select()` sau update — nhiều project RLS cho phép UPDATE nhưng trả về 0 dòng khi RETURNING. */
        const { error } = await supabase.from(sourceTable).update(updatePayload).eq('order_code', oid);

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
    trackedExhausted: trackedSkip = false,
    /** @type {string} Cùng schema `orders` (vd. `order_code_hcm` cho FFM MGT HCM). */
    ordersTable = 'orders'
} = {}) => {
    const table = String(ordersTable || 'orders').trim() || 'orders';
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
              .from(table)
              .select('*')
              .or('shipping_unit.ilike.%MGT%,shipping_unit.ilike.%T&T%')
              .order('order_date', { ascending: false })
              .range(mgtFrom, mgtFrom + pageSize - 1);

    const trackedPromise = trackedSkip
        ? Promise.resolve({ data: [], error: null })
        : supabase
              .from(table)
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
export const fetchFFMOrders = async ({ ordersTable = 'orders' } = {}) => {
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
                trackedExhausted: state.trackedExhausted,
                ordersTable
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
 * @param {{ sourceTable?: string, activityLogTarget?: 'log' | 'ffm_log', changeActorKind?: 'user' | 'system' }} [options]
 *        `activityLogTarget`: `'log'` (mặc định, Vận đơn) hoặc `'ffm_log'` (chỉ trang FFM).
 *        `changeActorKind`: với `ffm_log`, `'system'` → tac_nhan hệ thống; mặc định `'user'` (người thao tác).
 */
export const updateBatch = async (rows, modifiedBy, changeLog = null, options = {}) => {
    try {
        console.log(`Supabase Batch Update: ${rows.length} rows`);

        const sourceTable = String(options?.sourceTable || 'orders').trim() || 'orders';
        const activityLogTarget = options?.activityLogTarget === 'ffm_log' ? 'ffm_log' : 'log';
        const ffmTacNhan =
            options?.changeActorKind === 'system'
                ? ORDER_LOG_TAC_NHAN_HE_THONG
                : ORDER_LOG_TAC_NHAN_NGUOI_DUNG;
        /** `log`: Vận đơn / Nhập đơn. `ffm_log`: chỉ FFM — tách khỏi nhật ký vận đơn. */
        const supportsActivityLog = sourceTable === 'orders' || sourceTable === 'order_code_hcm';
        const useActivityLog = supportsActivityLog && Array.isArray(changeLog) && changeLog.length > 0;

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
                if (useActivityLog && (dbKey === 'log' || dbKey === 'ffm_log')) {
                    return;
                }
                if (!supportsActivityLog && (dbKey === 'log' || dbKey === 'ffm_log')) {
                    return;
                }
                if (dbKey === 'log' || dbKey === 'ffm_log') {
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

            const trail = Array.isArray(changeLog) ? changeLog.filter((c) => String(c.orderId ?? '').trim() === oc) : [];
            let dbRow = null;

            // Chỉ fetch DB nếu cần ghi log, KHÔNG kiểm tra xung đột
            if (useActivityLog && trail.length > 0) {
                const { data: logRow, error: logErr } = await supabase
                    .from(sourceTable)
                    .select(activityLogTarget)
                    .eq('order_code', oc)
                    .maybeSingle();
                    
                if (logErr) throw logErr;
                if (!logRow) throw new Error(`Đơn hàng ${oc} không tồn tại trên hệ thống!`);
                dbRow = logRow;
            }

            // Cập nhật Log nếu có hỗ trợ
            if (useActivityLog && trail.length > 0 && dbRow) {
                const prev = parseOrderLogJsonb(dbRow?.[activityLogTarget]);
                const ts = new Date().toISOString();
                const nv = String(modifiedBy || '').trim() || 'hệ thống';
                const LOG_TRACKED_DB_KEYS = new Set(ORDER_LOG_TRACKED_DB_KEYS);
                const entries = trail
                        .map((ch) => {
                            const dbK = resolveAppKeyToDbKey(ch.colKey);
                            if (!dbK || !LOG_TRACKED_DB_KEYS.has(dbK)) return null;
                            const cot = labelForOrderLogDbKey(dbK);
                            const cuRaw = ch.originalValue != null ? String(ch.originalValue) : '';
                            const moiRaw = ch.newValue != null ? String(ch.newValue) : '';
                            const cu = normalizeVanDonLogDisplayText(cuRaw);
                            const moi = normalizeVanDonLogDisplayText(moiRaw);
                            const base = {
                                thoi_gian: ts,
                                nhan_vien: nv,
                                cot,
                                cot_db: dbK,
                                gia_tri_cu: cu.trim() === '' ? null : cu,
                                gia_tri_moi: moi.trim() === '' ? null : moi,
                            };
                            if (activityLogTarget === 'ffm_log') {
                                base.tac_nhan = ffmTacNhan;
                            }
                            return base;
                        })
                        .filter(Boolean);
                if (entries.length > 0) {
                    payload[activityLogTarget] = sanitizeLogJsonbForSupabase(mergeOrderLogJsonb(prev, entries));
                }
            } else if (Object.prototype.hasOwnProperty.call(payload, 'log')) {
                const rawLog = payload.log;
                payload.log = await resolveOrderLogJsonbAfterGridEdit(oc, rawLog, modifiedBy, sourceTable);
            }

            const keys = Object.keys(payload).filter((k) => k !== 'last_modified_by');
            if (keys.length === 0) {
                skippedNoPayload += 1;
                continue;
            }

            const { error } = await supabase.from(sourceTable).update(payload).eq('order_code', oc);
            if (error) {
                const enriched = new Error(`[${sourceTable}] Cập nhật thất bại cho order_code=${oc}: ${error.message || 'Unknown error'}`);
                enriched.code = error.code;
                enriched.details = error.details;
                enriched.hint = error.hint;
                enriched.context = { order_code: oc, payloadKeys: Object.keys(payload) };
                throw enriched;
            }
            total += 1;
        }

        if (total === 0 && updates.length > 0 && skippedNoPayload === updates.length) {
            throw new Error(
                'Không có trường nào được gửi để cập nhật. Kiểm tra tên cột hoặc thử lại sau khi chỉnh ô.'
            );
        }

        return { success: true, count: total };

    } catch (error) {
        // Log chi tiết, tránh "Object" khó đọc
        console.error('updateBatch Supabase error:', {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
            context: error?.context,
            stack: error?.stack,
        });
        // Ném lại để UI hiển thị message cụ thể
        throw error instanceof Error ? error : new Error(String(error));
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
    'marketing_staff', 'sale_staff', 'page_name', 'team', 'delivery_staff', 'delivery_status', 'payment_status', 'note', 'lydo',
    'order_date', 'sale_price', 'goods_amount', 'shipping_unit', 'accountant_confirm', 'created_at', 'ngaydonghang',
    'check_result', 'vandon_note', 'product_name_1', 'quantity_1', 'product_name_2', 'quantity_2', 'gift', 'gift_item', 'gift_quantity', 'gift_qty',
    'delivery_status_nb', 'payment_currency', 'estimated_delivery_date', 'thoigiangiaohangffm', 'warehouse_fee', 'luu_kho_usd',
    'note_caps', 'accounting_check_date', 'tracking_check_date', 'reconciled_amount', 'payment_bill', 'payment_image',
    'ngayupbill', 'reconciled_vnd', 'cskh_status', 'log', 'canh_bao'
];

const VAN_DON_SELECT_QUERY = VAN_DON_PAGE_COLUMN_LIST.join(',');

/** `/van-don-hcm` (bảng `order_code_hcm`): thêm cột chia vận đơn — không gộp vào view `van_don_page` để tránh lệch schema. */
const VAN_DON_SELECT_QUERY_ORDER_CODE_HCM = `${VAN_DON_SELECT_QUERY},thu_tu_chia,ngay_chia_van_don`;

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
    'market': 'country',
    'product': 'product',
    'nv_sale': 'sale_staff',
    'nv_mkt': 'marketing_staff',
    'nv_van_don': 'delivery_staff',
    'shipping_unit': 'shipping_unit',
    'Trạng thái thu tiền': 'payment_status',
    'payment_status': 'payment_status'
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

/** Cột dropdown trên /van-don: `.in()` / `.eq()` phân biệt hoa thường → dùng ILIKE không `%` = khớp nguyên giá trị (vd. «Có bill» không gộp «Có bill một phần» / «Có bill 1 phần»). */
const VAN_DON_ILIKE_EXACT_DB_COLS = new Set([
    'check_result',
    'delivery_status',
    'delivery_status_nb',
    'payment_status',
    'cskh_status',
    'payment_bill',
    'note_caps',
    'vandon_note',
    'sale_staff',
    'marketing_staff',
    'delivery_staff',
    'country',
    'product',
    'page_name',
    'shipping_unit',
]);

/** Escape giá trị trong PostgREST `in.(...)` hoặc `ilike."..."` khi ghép vào `.or(...)`. */
const orEncodeQuoteValue = (v) => `"${String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Quote một ILIKE pattern (đã có % wildcard) để dùng an toàn trong `.or()` PostgREST. */
const quotePostgrestOrIlikePattern = (pat) => orEncodeQuoteValue(pat);

/** Ghép điều kiện `col.ilike.val` cho `.or()` (PostgREST). */
function buildVanDonOrIlikeExact(field, values) {
    const isFlexField = ['sale_staff', 'marketing_staff', 'delivery_staff', 'country', 'product', 'page_name', 'shipping_unit'].includes(field);

    if (field === 'tracking_code' || isFlexField) {
        return values
            .map((v) => {
                const norm = normalizeVanDonFilterWhitespace(String(v));
                if (!norm) return null;
                const flex = buildVanDonFlexibleIlikePattern(norm);
                return flex ? `${field}.ilike.${orEncodeQuoteValue(flex)}` : null;
            })
            .filter(Boolean)
            .join(',');
    }
    return values
        .map((v) => {
            const norm = normalizeVanDonFilterWhitespace(String(v));
            if (!norm) return null;
            return `${field}.ilike.${orEncodeQuoteValue(escapeIlikePattern(norm))}`;
        })
        .filter(Boolean)
        .join(',');
}

/** @param {string} uiKey — khóa trong filterValues (tiêu đề cột). */
export function resolveVanDonFilterUiKeyToDb(uiKey) {
    if (!uiKey || typeof uiKey !== 'string') return null;
    const uiNfc = String(uiKey).normalize('NFC');
    if (uiNfc === 'Trạng thái giao hàng'.normalize('NFC')) return 'delivery_status';
    if (uiNfc === 'Trạng thái giao hàng NB'.normalize('NFC')) return 'delivery_status_nb';
    const resolved = COLUMN_MAPPING[uiKey] || uiKey;
    const override = VAN_DON_UI_COL_DB_OVERRIDE[resolved] || VAN_DON_UI_COL_DB_OVERRIDE[uiKey];
    if (override) return override;
    /** Sau COLUMN_MAPPING, `resolved` có thể đã là tên cột DB (sale_staff, shipping_unit, …) — vòng for dưới chỉ khớp nhãn Việt nên trước đây bị bỏ qua → lọc SQL không chạy. */
    if (Object.prototype.hasOwnProperty.call(DB_TO_APP_MAPPING, resolved)) {
        return resolved;
    }
    for (const [dbCol, label] of Object.entries(DB_TO_APP_MAPPING)) {
        if (label === resolved) return dbCol;
    }
    return null;
}

/** Cột lọc kiểu chọn nhiều (toolbar hoặc header MultiSelect) — khớp `resolveVanDonFilterUiKeyToDb`. */
const VAN_DON_MULTISELECT_FILTER_DB_COLS = new Set([
    'sale_staff',
    'marketing_staff',
    'page_name',
    'delivery_staff',
    'shipping_unit',
    'country',
    'product',
]);

function isVanDonDropdownColumnFilter(uiKey) {
    const dataKey = COLUMN_MAPPING[uiKey] || uiKey;
    if (
        DROPDOWN_OPTIONS[dataKey] ||
        DROPDOWN_OPTIONS[uiKey] ||
        ['Trạng thái giao hàng', 'Kết quả check', 'GHI CHÚ', 'Trạng thái thu tiền'].includes(dataKey) ||
        ['Trạng thái giao hàng', 'Kết quả check', 'GHI CHÚ', 'Đơn vị vận chuyển', 'Trạng thái thu tiền'].includes(uiKey)
    ) {
        return true;
    }
    const dbCol = resolveVanDonFilterUiKeyToDb(uiKey);
    return Boolean(dbCol && VAN_DON_MULTISELECT_FILTER_DB_COLS.has(dbCol));
}

// Fetch Van Don data với pagination và filters từ backend (NOW SUPABASE)
export const fetchVanDon = async (options = {}) => {
    const {
        page = 1,
        limit = 50,
        sourceView = 'van_don_page',
        sourceTable = 'orders',
        team,
        /** When true, always exclude records where team = 'HCM' (but keep NULL/empty team). */
        excludeHcmTeam = false,
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
        /** Multi-select tên page (cột page_name) */
        page_name = [],
        delivery_status = [],
        delivery_status_nb = [],
        payment_status = [],
        dateFrom,
        dateTo,
        allowedStaff, // Array of names allowed to view
        /** Tab Đơn cá nhân /van-don: chỉ đơn có delivery_staff khớp tên (không dùng % — so khớp nguyên chuỗi, không phân biệt hoa thường). */
        deliveryStaffSelfFilter,
        /** Lọc theo ô header cột (toàn bộ CSDL, không chỉ trang hiện tại). */
        columnFilters = {},
        /** { status, include, exclude } — khớp bộ lọc Mã Tracking trên lưới. */
        trackingFilter = null,
        /** Danh sách mã đơn cần lọc khớp chính xác (mỗi phần tử là 1 mã). */
        bulkOrderCodes = [],
        /** Tra cứu nhanh khách: OR ilike trên tên / SĐT / địa chỉ (đồng bộ tổng đơn & tổng tiền với lưới). */
        customerQuickSearch = '',
        /** `co_trung` | `khong_trung` — lọc cột cảnh báo (mức SQL; gần với lưới). */
        canh_bao_filter = null,
        /**
         * Tab «Đẩy Đơn» (hanoi): lưới chỉ giữ đơn Check=OK, chưa có ĐVVC (và NV thường: chưa có mã tracking).
         * Không đẩy xuống SQL → phân trang + tổng tiền + count PostgREST lệch hoàn toàn với dữ liệu hiển thị (/van-don-hcm gồm).
         */
        hanoiTabSqlScope = null,
        /**
         * `rows` — chỉ trang dữ liệu + đếm chính xác (`count: exact`, cùng bộ lọc) để «Số lượng đơn» khớp DB.
         * `money` — chỉ tổng tiền (SUM + fallback); dùng song song với `rows` từ UI.
         * `null` / không truyền — một lần gọi đầy đủ (đếm chính xác + SUM), ví dụ xuất Excel.
         */
        vanDonFetchMode = null,
    } = options;

    const vanDonRowsOnly = vanDonFetchMode === 'rows';
    const vanDonMoneyOnly = vanDonFetchMode === 'money';

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
        const pageFrom = (page - 1) * limit;
        const pageTo = pageFrom + limit - 1;

        const orEncodeInList = (vals) =>
            vals.map((v) => orEncodeQuoteValue(v)).join(',');

        const applyVanDonFilters = (initialQuery) => {
            let query = initialQuery;

            if (team && team !== 'all') {
                query = query.eq('team', team);
            }

            if (Array.isArray(bulkOrderCodes) && bulkOrderCodes.length > 0) {
                const exactCodes = Array.from(
                    new Set(
                        bulkOrderCodes
                            .map((v) => normalizeVanDonFilterWhitespace(String(v)))
                            .filter(Boolean)
                    )
                );
                if (exactCodes.length > 0) {
                    const codeOrExpr = buildVanDonOrIlikeExact('order_code', exactCodes);
                    if (codeOrExpr) query = query.or(codeOrExpr);
                }
            }

            if (excludeHcmTeam) {
                // Keep NULL team, only exclude exact 'HCM'
                query = query.or('team.is.null,team.neq.HCM');
            }

            if (hanoiTabSqlScope === 'ffm_queue' || hanoiTabSqlScope === 'ffm_queue_admin') {
                query = query.ilike('check_result', 'ok');
                query = query.or('shipping_unit.is.null,shipping_unit.eq.');
            }
            if (hanoiTabSqlScope === 'ffm_queue') {
                query = query.or('tracking_code.is.null,tracking_code.eq.');
            }

            if (status) {
                query = query.ilike('delivery_status', `%${status}%`);
            }

            const applyEmptyOrInFilter = (field, value) => {
                const values = Array.isArray(value) ? value : [value];
                const hasEmpty = values.some(v => v === 'Trống' || v === '__EMPTY__' || v === '' || v === null);
                const inValues = values.filter((x) => x !== 'Trống' && x !== '__EMPTY__' && x !== '' && x !== null);

                const useIlikeExact = VAN_DON_ILIKE_EXACT_DB_COLS.has(field);
                
                // Mở rộng khái niệm 'is.null' cho khớp với isVanDonSemanticEmpty ở Client
                let emptyFragment = `${field}.is.null,${field}.eq.`;
                if (hasEmpty) {
                    const garbage = ['null', 'undefined', '-', '—', ' ', '  '];
                    emptyFragment += `,${field}.in.(${orEncodeInList(garbage)})`;
                }

                if (inValues.length > 0 && hasEmpty) {
                    if (useIlikeExact) {
                        query = query.or(`${buildVanDonOrIlikeExact(field, inValues)},${emptyFragment}`);
                    } else {
                        const enc = orEncodeInList(inValues);
                        query = query.or(`${field}.in.(${enc}),${emptyFragment}`);
                    }
                } else if (inValues.length > 0) {
                    if (useIlikeExact) {
                        query = query.or(buildVanDonOrIlikeExact(field, inValues));
                    } else {
                        query = query.in(field, inValues);
                    }
                } else if (hasEmpty) {
                    query = query.or(emptyFragment);
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
            if (page_name !== undefined && page_name !== null && Array.isArray(page_name) && page_name.length > 0) {
                applyEmptyOrInFilter('page_name', page_name);
            }
            if (delivery_status !== undefined && delivery_status !== null && Array.isArray(delivery_status) && delivery_status.length > 0) {
                applyEmptyOrInFilter('delivery_status', delivery_status);
            }
            if (delivery_status_nb !== undefined && delivery_status_nb !== null && Array.isArray(delivery_status_nb) && delivery_status_nb.length > 0) {
                applyEmptyOrInFilter('delivery_status_nb', delivery_status_nb);
            }
            if (payment_status !== undefined && payment_status !== null && Array.isArray(payment_status) && payment_status.length > 0) {
                applyEmptyOrInFilter('payment_status', payment_status);
            }

            if (deliveryStaffSelfFilter !== undefined && deliveryStaffSelfFilter !== null && String(deliveryStaffSelfFilter).trim() !== '') {
                const pat = buildVanDonFlexibleIlikePattern(deliveryStaffSelfFilter);
                if (pat) query = query.ilike('delivery_staff', pat);
            }

            const dateColumnMapping = {
                'Ngày lên đơn': 'order_date',
                'Ngày đóng hàng': 'ngaydonghang',
                'Ngày đẩy đơn': 'accounting_check_date',
                'Ngày có mã tracking': 'tracking_check_date',
            };
            const dateColumn = dateColumnMapping[options.dateType];

            if (dateColumn && dateFrom) {
                query = query.gte(dateColumn, dateFrom);
            }
            if (dateColumn && dateTo) {
                query = query.lte(dateColumn, dateTo);
            }

            if (Array.isArray(allowedStaff) && allowedStaff.length > 0) {
                const conditions = [];
                allowedStaff.forEach((staffName) => {
                    if (!staffName) return;
                    const pat = buildVanDonFlexibleIlikePattern(staffName);
                    if (!pat) return;
                    conditions.push(`sale_staff.ilike.${pat}`);
                    conditions.push(`marketing_staff.ilike.${pat}`);
                    conditions.push(`delivery_staff.ilike.${pat}`);
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
                    const t = normalizeVanDonFilterWhitespace(val);
                    if (!t) continue;

                    if (VAN_DON_PER_COL_DATE_UI_KEYS.has(uiKey)) {
                        const day = normalizeVanDonFilterDateToYmd(t);
                        if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
                        const next = addOneCalendarDayYmd(day);
                        query = query.gte(dbCol, `${day}T00:00:00`).lt(dbCol, `${next}T00:00:00`);
                    } else if (isVanDonDropdownColumnFilter(uiKey)) {
                        if (VAN_DON_ILIKE_EXACT_DB_COLS.has(dbCol)) {
                            query = query.ilike(dbCol, escapeIlikePattern(t));
                        } else {
                            query = query.eq(dbCol, t);
                        }
                    } else {
                        /** Hỗ trợ lọc số: loại bỏ dấu chấm/phẩy nếu là cột numeric. */
                        const isNumericCol = ORDERS_NUMERIC_DB_KEYS.has(dbCol);
                        const filterVal = isNumericCol ? t.replace(/[.,]/g, '') : t;

                        /** Cột "Giá bán": lọc đồng thời sale_price OR goods_amount để tránh sót dữ liệu cũ. */
                        if (uiKey === 'Giá bán') {
                            const flex = buildVanDonFlexibleIlikePattern(filterVal);
                            if (flex) {
                                query = query.or(`sale_price::text.ilike.${orEncodeQuoteValue(flex)},goods_amount::text.ilike.${orEncodeQuoteValue(flex)}`);
                            }
                        } else {
                            /** Hỗ trợ lọc nhiều giá trị (OR) cho ô text nếu phân tách bằng dấu phẩy hoặc xuống dòng. */
                            const tokens = filterVal.split(/[,\n]/).map(s => normalizeVanDonFilterWhitespace(s)).filter(Boolean);
                            if (tokens.length > 1) {
                                const segments = tokens.map(tk => {
                                    const pat = buildVanDonFlexibleIlikePattern(tk);
                                    return `${dbCol}::text.ilike."${String(pat).replace(/"/g, '\\"')}"`;
                                });
                                query = query.or(segments.join(','));
                            } else {
                                const flex = buildVanDonFlexibleIlikePattern(filterVal);
                                if (flex) query = query.filter(`${dbCol}::text`, 'ilike', flex);
                            }
                        }
                    }
                } else if (typeof val === 'number') {
                    // Xử lý filter số trực tiếp (cho cột tiền tệ)
                    if (uiKey === 'Giá bán') {
                        // Lọc đồng thời sale_price OR goods_amount
                        query = query.or(`sale_price.eq.${val},goods_amount.eq.${val}`);
                    } else if (ORDERS_NUMERIC_DB_KEYS.has(dbCol)) {
                        query = query.eq(dbCol, val);
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
                        const patExc = buildVanDonFlexibleIlikePattern(excRaw);
                        if (patExc) query = query.not('tracking_code', 'ilike', patExc);
                    }
                    if (incRaw.trim()) {
                        const incTrim = normalizeVanDonFilterWhitespace(incRaw);
                        if (incTrim.includes('\n')) {
                            const codes = incTrim
                                .split('\n')
                                .map((s) => normalizeVanDonFilterWhitespace(s))
                                .filter(Boolean);
                            if (codes.length > 0) {
                                query = query.or(buildVanDonOrIlikeExact('tracking_code', codes));
                            }
                        } else {
                            const patInc = buildVanDonFlexibleIlikePattern(incTrim);
                            if (patInc) query = query.ilike('tracking_code', patInc);
                        }
                    }
                }
            }

            const cq = normalizeVanDonFilterWhitespace(
                customerQuickSearch != null ? String(customerQuickSearch) : ''
            );
            if (cq) {
                const allColumns = [
                    'customer_name', 'customer_phone', 'customer_address', 'order_code',
                    'page_name', 'product', 'sale_staff', 'marketing_staff', 'delivery_staff',
                    'delivery_status', 'tracking_code', 'country', 'shipping_unit',
                    'payment_status', 'note', 'vandon_note', 'check_result'
                ];

                /** Một cụm từ (thứ tự giữ nguyên, khoảng trắng linh hoạt), OR giữa các cột — không AND từng từ. */
                const pat = buildVanDonFlexibleIlikePattern(cq);
                if (pat) {
                    const qv = quotePostgrestOrIlikePattern(pat);
                    const orParts = allColumns.map((col) => `${col}.ilike.${qv}`);
                    const digits = cq.replace(/\D/g, '');
                    if (digits.length >= 6) {
                        const flexPhonePat = `%${digits.split('').join('%')}%`;
                        orParts.push(`customer_phone.ilike.${quotePostgrestOrIlikePattern(flexPhonePat)}`);
                    }
                    query = query.or(orParts.join(','));
                }
            }

            if (canh_bao_filter === 'co_trung') {
                query = query.not('canh_bao', 'is', null).neq('canh_bao', '');
            } else if (canh_bao_filter === 'khong_trung') {
                query = query.or('canh_bao.is.null,canh_bao.eq.');
            }

            return query;
        };

        const loadVanDonFromTable = async (tableName) => {
            const selectCols =
                tableName === 'order_code_hcm' ? VAN_DON_SELECT_QUERY_ORDER_CODE_HCM : VAN_DON_SELECT_QUERY;
            /** SUM trên bảng vật lý: ưu tiên total_amount_vnd — khớp cột «Tổng tiền VNĐ» trên lưới (không dùng line total trước). */
            const sumFromTable = tableName === 'order_code_hcm' ? 'order_code_hcm' : 'orders';
            const sumMoneyCombinedQ = applyVanDonFilters(
                supabase
                    .from(sumFromTable)
                    .select('total_amount_vnd.sum(),van_don_line_total_vnd.sum(),tong_tien_vnd.sum()')
            );

            /**
             * @param {{ count?: number|null, data?: unknown[] }} listRes
             * @param {{ data: unknown, error: unknown }} sumCombinedRes
             */
            const computeMoneyTotals = async (listRes, sumCombinedRes) => {
                let totalMissing = false;
                let lineMissing = false;
                let tongMissing = false;
                let totalRaw = null;
                let lineRaw = null;
                let tongRaw = null;
                let sumError = null;

                if (sumCombinedRes.error) {
                    const [sumTotalRes, sumLineRes, sumTongTienRes] = await Promise.all([
                        applyVanDonFilters(supabase.from(sumFromTable).select('total_amount_vnd.sum()')),
                        applyVanDonFilters(supabase.from(sumFromTable).select('van_don_line_total_vnd.sum()')),
                        applyVanDonFilters(supabase.from(sumFromTable).select('tong_tien_vnd.sum()')),
                    ]);
                    const totalErr = sumTotalRes.error;
                    totalMissing = Boolean(
                        totalErr &&
                            (String(totalErr.message || '').toLowerCase().includes('total_amount_vnd') ||
                                String(totalErr.code || '') === '42703')
                    );
                    const lineErr = sumLineRes.error;
                    lineMissing = Boolean(
                        lineErr &&
                            (String(lineErr.message || '').toLowerCase().includes('van_don_line_total_vnd') ||
                                String(lineErr.code || '') === '42703')
                    );
                    const tongErr = sumTongTienRes.error;
                    tongMissing = Boolean(
                        tongErr &&
                            (String(tongErr.message || '').toLowerCase().includes('tong_tien_vnd') ||
                                String(tongErr.code || '') === '42703')
                    );
                    if (!totalMissing) totalRaw = extractPostgrestAggregateNumeric(sumTotalRes.data);
                    if (!lineMissing) lineRaw = extractPostgrestAggregateNumeric(sumLineRes.data);
                    if (!tongMissing) tongRaw = extractPostgrestAggregateNumeric(sumTongTienRes.data);
                    sumError = totalMissing ? lineErr : totalErr || lineErr || (tongMissing ? null : tongErr);
                } else {
                    const sums = extractVanDonMoneyAggregateSums(sumCombinedRes.data);
                    totalRaw = sums.totalRaw;
                    lineRaw = sums.lineRaw;
                    tongRaw = sums.tongRaw;
                }

                /**
                 * Gộp SUM khớp `resolveVanDonMoneyVndFromDbRow` / cột generated `van_don_line_total_vnd`:
                 * `SUM(total_amount_vnd)` có thể = 0 trong khi tiền nằm ở tong_tien / sale_price / goods / line.
                 * Trước đây nhánh `totalRaw != null` gán luôn cả 0 → bỏ qua line/tong → header «Tổng tiền» sai (vd. 43 đơn nhưng tổng 0).
                 */
                let totalAmountVndSum = null;
                const nz = (v) => {
                    if (v == null || v === '') return null;
                    const n = typeof v === 'number' ? v : Number(v);
                    return Number.isFinite(n) && n !== 0 ? n : null;
                };
                if (!totalMissing && nz(totalRaw) != null) {
                    totalAmountVndSum = nz(totalRaw);
                }
                if (totalAmountVndSum == null && !lineMissing && nz(lineRaw) != null) {
                    totalAmountVndSum = nz(lineRaw);
                }
                if (totalAmountVndSum == null && !tongMissing && nz(tongRaw) != null) {
                    totalAmountVndSum = nz(tongRaw);
                }
                if (totalAmountVndSum == null && !totalMissing && totalRaw != null) {
                    const n = typeof totalRaw === 'number' ? totalRaw : Number(totalRaw);
                    if (Number.isFinite(n)) totalAmountVndSum = n;
                }
                if (totalAmountVndSum == null && !lineMissing && lineRaw != null) {
                    const n = typeof lineRaw === 'number' ? lineRaw : Number(lineRaw);
                    if (Number.isFinite(n)) totalAmountVndSum = n;
                }
                if (totalAmountVndSum == null && !tongMissing && tongRaw != null) {
                    const n = typeof tongRaw === 'number' ? tongRaw : Number(tongRaw);
                    if (Number.isFinite(n)) totalAmountVndSum = n;
                }
                if (totalAmountVndSum == null) totalAmountVndSum = 0;

                const rowCount = listRes.count ?? 0;
                const pageRows = listRes.data || [];
                const pageHasPositiveMoney = pageRows.some((r) => pickVanDonMoneyFromDbRow(r) > 0);
                const needMoneyFallback = totalAmountVndSum === 0 && rowCount > 0;
                if (needMoneyFallback) {
                    const moneyCols = 'van_don_line_total_vnd,tong_tien_vnd,total_amount_vnd,sale_price,goods_amount';
                    const PROBE = 800;
                    const { data: probeRows, error: probeErr } = await applyVanDonFilters(
                        supabase.from(sumFromTable).select(moneyCols)
                    )
                        .order('order_date', { ascending: false })
                        .range(0, PROBE - 1);
                    if (probeErr) {
                        console.warn('[fetchVanDon] money probe:', probeErr.message);
                    } else {
                        const probeSum = (probeRows || []).reduce((s, r) => s + pickVanDonMoneyFromDbRow(r), 0);
                        const runFullScan = pageHasPositiveMoney || probeSum > 0;
                        if (runFullScan) {
                            /** PostgREST thường giới hạn ~1000 dòng/response; không được thoát sớm khi chunk < MONEY_BATCH. */
                            const MONEY_BATCH = 1000;
                            const maxBatches = Math.min(200000, Math.ceil(rowCount / MONEY_BATCH) + 50);
                            let scanned = 0;
                            let fallbackSum = 0;
                            for (let b = 0; b < maxBatches && scanned < rowCount; b++) {
                                const { data: chunk, error: chunkErr } = await applyVanDonFilters(
                                    supabase.from(sumFromTable).select(moneyCols)
                                )
                                    .order('order_date', { ascending: false })
                                    .range(scanned, scanned + MONEY_BATCH - 1);
                                if (chunkErr) {
                                    console.warn('[fetchVanDon] money scan batch:', chunkErr.message);
                                    break;
                                }
                                if (!chunk?.length) break;
                                for (let i = 0; i < chunk.length; i++) {
                                    fallbackSum += pickVanDonMoneyFromDbRow(chunk[i]);
                                }
                                scanned += chunk.length;
                                if (scanned >= rowCount) break;
                            }
                            if (fallbackSum > 0) {
                                totalAmountVndSum = fallbackSum;
                            }
                        }
                    }
                }

                return { sumError, totalAmountVndSum };
            };

            /** Chỉ lưới — không chạy SUM; đếm `exact` để tổng đơn trên UI khớp bộ lọc (tránh lệch do `estimated` của Postgres). */
            if (vanDonRowsOnly) {
                const baseData = applyVanDonFilters(
                    supabase.from(tableName).select(selectCols, { count: 'exact' })
                );
                const listRes = await baseData.range(pageFrom, pageTo).order('order_date', { ascending: false });
                return {
                    data: listRes.data,
                    error: listRes.error,
                    count: listRes.count,
                    sumError: null,
                    totalAmountVndSum: undefined,
                    rowsOnly: true,
                };
            }

            /** Chỉ tổng tiền — song song với request `rows` từ UI. */
            if (vanDonMoneyOnly) {
                const headQ = applyVanDonFilters(
                    supabase.from(tableName).select('order_code', { count: 'exact', head: true })
                );
                const [headRes, sumCombinedRes] = await Promise.all([headQ, sumMoneyCombinedQ]);
                const syntheticList = { count: headRes.count ?? 0, data: [] };
                const { sumError, totalAmountVndSum } = await computeMoneyTotals(syntheticList, sumCombinedRes);
                return {
                    data: [],
                    error: null,
                    count: 0,
                    sumError,
                    totalAmountVndSum,
                    rowsOnly: false,
                };
            }

            const baseData = applyVanDonFilters(
                supabase.from(tableName).select(selectCols, { count: 'exact' })
            );
            const [listRes, sumCombinedRes] = await Promise.all([
                baseData.range(pageFrom, pageTo).order('order_date', { ascending: false }),
                sumMoneyCombinedQ,
            ]);
            const { sumError, totalAmountVndSum } = await computeMoneyTotals(listRes, sumCombinedRes);
            return {
                data: listRes.data,
                error: listRes.error,
                count: listRes.count,
                sumError,
                totalAmountVndSum,
                rowsOnly: false,
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

        let pack = sourceView
            ? await loadVanDonFromTable(sourceView)
            : await loadVanDonFromTable(sourceTable);

        if (sourceView && pack.error && isVanDonPageUnavailableError(pack.error)) {
            console.warn(`[fetchVanDon] ${sourceView} không dùng được, thử lại với bảng ${sourceTable}:`, pack.error.message);
            pack = await loadVanDonFromTable(sourceTable);
        }

        const { data, error, count, sumError, totalAmountVndSum, rowsOnly } = pack;
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
            totalAmountVndSum:
                rowsOnly ? undefined : Number.isFinite(totalAmountVndSum) ? totalAmountVndSum : 0,
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

/**
 * Lịch sử thay đổi trên /van-don: đọc từ cột `log` (jsonb) trên `orders` / `order_code_hcm`
 * — cùng nguồn ghi khi sửa lưới / Nhập đơn (không dùng bảng order_change_audit).
 * Trả về danh sách mới nhất trước, khớp shape modal VanDon (changed_at / changed_by / changed_fields).
 */
export const fetchOrderChangeHistory = async ({ orderCode, sourceTable = 'orders' } = {}) => {
    const oc = String(orderCode || '').trim();
    if (!oc) return [];
    const st = String(sourceTable || 'orders').trim() || 'orders';
    const { data, error } = await supabase.from(st).select('log').eq('order_code', oc).maybeSingle();
    if (error) throw error;
    const entries = parseOrderLogJsonb(data?.log);
    const rows = entries.map((e, i) => {
        const label = String(e.cot || e.cot_db || 'Thay đổi').trim() || 'Thay đổi';
        return {
            id: `log-${i}-${String(e.thoi_gian ?? i)}`,
            changed_at: e.thoi_gian,
            changed_by: e.nhan_vien != null ? String(e.nhan_vien) : 'hệ thống',
            changed_fields: {
                [label]: {
                    old: e.gia_tri_cu !== undefined ? e.gia_tri_cu : null,
                    new: e.gia_tri_moi !== undefined ? e.gia_tri_moi : null,
                },
            },
        };
    });
    rows.sort((a, b) => {
        const ta = new Date(a.changed_at || 0).getTime();
        const tb = new Date(b.changed_at || 0).getTime();
        return tb - ta;
    });
    return rows;
};

/**
 * Một cột `ffm_log` (jsonb) → các dòng lịch sử (shape modal FFM). `orderId` luôn có để dùng tổng hợp nhiều đơn.
 */
export const mapFfmLogJsonbToHistoryRows = (orderCode, ffmLogRaw) => {
    const oc = String(orderCode || '').trim();
    const entries = parseOrderLogJsonb(ffmLogRaw);
    return entries.map((e, i) => {
        const label = String(e.cot || e.cot_db || 'Thay đổi').trim() || 'Thay đổi';
        const tacNhan = normalizeOrderLogTacNhan(e);
        return {
            id: `ffm-log-${oc}-${i}-${String(e.thoi_gian ?? i)}`,
            orderId: oc,
            changed_at: e.thoi_gian,
            changed_by: e.nhan_vien != null ? String(e.nhan_vien) : 'hệ thống',
            tac_nhan: tacNhan,
            tac_nhan_label: labelOrderLogTacNhan(tacNhan),
            changed_fields: {
                [label]: {
                    old: e.gia_tri_cu !== undefined ? e.gia_tri_cu : null,
                    new: e.gia_tri_moi !== undefined ? e.gia_tri_moi : null,
                },
            },
        };
    });
};

/**
 * Lịch sử chỉ cho FFM: đọc cột `ffm_log` (jsonb) trên `orders` / `order_code_hcm`.
 * Không dùng chung `log` (Vận đơn). Cùng shape trả về như `fetchOrderChangeHistory` để dùng chung modal.
 */
export const fetchFfmOrderChangeHistory = async ({ orderCode, sourceTable = 'orders' } = {}) => {
    const oc = String(orderCode || '').trim();
    if (!oc) return [];
    const st = String(sourceTable || 'orders').trim() || 'orders';
    const { data, error } = await supabase.from(st).select('ffm_log').eq('order_code', oc).maybeSingle();
    if (error) throw error;
    const rows = mapFfmLogJsonbToHistoryRows(oc, data?.ffm_log);
    rows.sort((a, b) => {
        const ta = new Date(a.changed_at || 0).getTime();
        const tb = new Date(b.changed_at || 0).getTime();
        return tb - ta;
    });
    return rows;
};

const FFM_LOG_BULK_CHUNK = 120;

/**
 * Gom `ffm_log` cho nhiều đơn (theo danh sách đã tải trên lưới). Mỗi phần tử: { orderCode, sourceTable: 'orders' | 'order_code_hcm' }.
 */
export const fetchFfmOrderChangeHistoryBulk = async ({ entries } = {}) => {
    const byTable = new Map();
    for (const e of entries || []) {
        const oc = String(e?.orderCode || '').trim();
        if (!oc) continue;
        const st = e?.sourceTable === 'order_code_hcm' ? 'order_code_hcm' : 'orders';
        if (!byTable.has(st)) byTable.set(st, new Set());
        byTable.get(st).add(oc);
    }
    const all = [];
    for (const [table, codeSet] of byTable) {
        const codes = [...codeSet];
        for (let i = 0; i < codes.length; i += FFM_LOG_BULK_CHUNK) {
            const chunk = codes.slice(i, i + FFM_LOG_BULK_CHUNK);
            const { data, error } = await supabase.from(table).select('order_code, ffm_log').in('order_code', chunk);
            if (error) throw error;
            for (const dr of data || []) {
                const oc = String(dr?.order_code || '').trim();
                if (!oc) continue;
                all.push(...mapFfmLogJsonbToHistoryRows(oc, dr?.ffm_log));
            }
        }
    }
    all.sort((a, b) => {
        const ta = new Date(a.changed_at || 0).getTime();
        const tb = new Date(b.changed_at || 0).getTime();
        return tb - ta;
    });
    return all;
};

/** Khớp `DanhSachVanDon.jsx` — chi nhánh HCM (users.branch / HR «chi nhánh»). */
function normalizeBranchForHcmVanDon(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.\-_/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isHcmBranchForVanDonFilter(value) {
    const branch = normalizeBranchForHcmVanDon(value);
    return (
        branch === 'hcm' ||
        branch === 'tp hcm' ||
        branch === 'tphcm' ||
        branch === 'ho chi minh' ||
        branch.includes('hcm') ||
        branch.includes('ho chi minh')
    );
}

/** Khớp `DanhSachVanDon.jsx` — `users.department` hoặc HR «Bộ phận». */
function isBoPhanVanDonDepartment(dept) {
    const raw = (dept ?? '').toString().trim();
    if (!raw) return false;
    const compact = raw.toLowerCase().replace(/\s+/g, ' ');
    if (compact.includes('vận đơn') || compact.includes('van đơn')) return true;
    const ascii = raw
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/\s+/g, ' ');
    if (ascii.includes('van don')) return true;
    if (ascii === 'logistics' || ascii.startsWith('logistics ')) return true;
    return false;
}

/**
 * Danh sách tên hiển thị cho bộ lọc «NV Vận đơn» trên /van-don-hcm: đủ nhân sự bộ phận vận đơn + chi nhánh HCM.
 * Nguồn: `human_resources` + `users` (không chỉ distinct trên `order_code_hcm`).
 */
async function fetchVanDonHcmNvVanDonFromDirectory() {
    const names = new Set();

    try {
        const { data: hrRows, error: hrError } = await supabase
            .from('human_resources')
            .select('"Họ Và Tên", "Bộ phận", "chi nhánh"');
        if (!hrError && hrRows) {
            for (const row of hrRows) {
                if (!isBoPhanVanDonDepartment(row?.['Bộ phận'])) continue;
                const chi = String(row?.['chi nhánh'] || '').trim();
                if (!isHcmBranchForVanDonFilter(chi)) continue;
                const n = String(row?.['Họ Và Tên'] || '').trim();
                if (n) names.add(n);
            }
        }
    } catch (e) {
        console.warn('[fetchVanDonHcmNvVanDonFromDirectory] human_resources:', e);
    }

    let usersRows = [];
    try {
        const { data: uData, error: uError } = await supabase
            .from('users')
            .select('name, department, branch, chi_nhanh')
            .not('name', 'is', null)
            .order('name', { ascending: true });
        if (uError) throw uError;
        usersRows = uData || [];
    } catch (e) {
        const message = String(e?.message || '').toLowerCase();
        const missingChiNhanh = message.includes('chi_nhanh') && message.includes('does not exist');
        const missingBranch = message.includes('branch') && message.includes('does not exist');
        try {
            if (!missingBranch) {
                const { data: uData, error: uError } = await supabase
                    .from('users')
                    .select('name, department, branch')
                    .not('name', 'is', null)
                    .order('name', { ascending: true });
                if (!uError) usersRows = uData || [];
            } else if (!missingChiNhanh) {
                const { data: uData, error: uError } = await supabase
                    .from('users')
                    .select('name, department, chi_nhanh')
                    .not('name', 'is', null)
                    .order('name', { ascending: true });
                if (!uError) usersRows = uData || [];
            } else {
                const { data: uData, error: uError } = await supabase
                    .from('users')
                    .select('name, department')
                    .not('name', 'is', null)
                    .order('name', { ascending: true });
                if (!uError) usersRows = uData || [];
            }
        } catch (e2) {
            console.warn('[fetchVanDonHcmNvVanDonFromDirectory] users fallback:', e2);
        }
    }

    for (const member of usersRows) {
        if (!isBoPhanVanDonDepartment(member?.department)) continue;
        const br = String(member?.branch || member?.chi_nhanh || '').trim();
        if (!isHcmBranchForVanDonFilter(br)) continue;
        const n = String(member?.name || '').trim();
        if (n) names.add(n);
    }

    return Array.from(names);
}

/** Một cột DB → các tiêu đề cột UI Van Đơn dùng chung danh sách distinct (một RPC / cột DB). */
const VAN_DON_DISTINCT_DB_TO_UI_KEYS = {
    country: ['Khu vực'],
    product: ['Mặt hàng'],
    sale_staff: ['Nhân viên Sale'],
    marketing_staff: ['Nhân viên MKT'],
    page_name: ['Page'],
    delivery_staff: ['NV Vận đơn'],
    shipping_unit: ['Đơn vị vận chuyển'],
    check_result: ['Kết quả Check', 'Kết quả check'],
    delivery_status: ['Trạng thái giao hàng'],
    delivery_status_nb: ['Trạng thái giao hàng NB'],
    payment_status: ['Trạng thái thu tiền'],
    note_caps: ['GHI CHÚ'],
    vandon_note: ['Ghi chú của VĐ'],
    payment_bill: ['Payment Bill'],
    cskh_status: ['Trạng thái cskh']
};

/**
 * Giá trị distinct: `/van-don` → RPC `get_orders_distinct_values` (view `van_don_page`);
 * `/van-don-hcm` → RPC `get_order_code_hcm_distinct_values` (bảng `order_code_hcm`), fallback quét tối đa 10k dòng nếu RPC lỗi.
 * VanDon vẫn gộp thêm unique trên dữ liệu đang hiển thị.
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
                    let usedHcmDistinctRpc = false;
                    if (sourceTable === 'order_code_hcm') {
                        const { data: rpcHcm, error: errHcm } = await supabase.rpc(
                            'get_order_code_hcm_distinct_values',
                            { p_column: dbCol }
                        );
                        if (!errHcm && rpcHcm != null) {
                            usedHcmDistinctRpc = true;
                            vals = (rpcHcm || [])
                                .map((row) => (row && row.val != null ? String(row.val).trim() : ''))
                                .filter(Boolean)
                                .filter((v) => v !== '__EMPTY__' && !isVanDonSemanticEmpty(v));
                        } else if (errHcm) {
                            console.warn(
                                '[fetchVanDonDistinctFilterOptions] get_order_code_hcm_distinct_values',
                                dbCol,
                                errHcm.message
                            );
                        }
                    }
                    if (!usedHcmDistinctRpc) {
                        const { data, error } = await supabase
                            .from(sourceTable)
                            .select(dbCol)
                            .not(dbCol, 'is', null)
                            .neq(dbCol, '')
                            .limit(10000);
                        if (error) {
                            console.warn(
                                '[fetchVanDonDistinctFilterOptions] table',
                                sourceTable,
                                dbCol,
                                error.message
                            );
                            return;
                        }
                        vals = [...new Set((data || [])
                            .map((row) => (row && row[dbCol] != null ? String(row[dbCol]).trim() : ''))
                            .filter(Boolean)
                            .filter((v) => v !== '__EMPTY__' && !isVanDonSemanticEmpty(v)))];
                    }

                    if (sourceTable === 'order_code_hcm' && dbCol === 'delivery_staff') {
                        try {
                            const fromDirectory = await fetchVanDonHcmNvVanDonFromDirectory();
                            vals = [...new Set([...(vals || []), ...fromDirectory])];
                        } catch (mergeErr) {
                            console.warn(
                                '[fetchVanDonDistinctFilterOptions] merge NV Vận đơn HCM from users/hr:',
                                mergeErr
                            );
                        }
                    }

                    // HCM: bổ sung danh mục thị trường từ bảng mặc định `orders` để không thiếu dropdown
                    // khi bảng HCM chưa đủ dữ liệu thị trường.
                    if (sourceTable !== 'orders' && dbCol === 'country') {
                        try {
                            const { data: dataOrders, error: errOrders } = await supabase
                                .rpc('get_orders_distinct_values', { p_column: 'country' });
                            if (!errOrders) {
                                const more = (dataOrders || [])
                                    .map((row) => (row && row.val != null ? String(row.val).trim() : ''))
                                    .filter(Boolean)
                                    .filter((v) => v !== '__EMPTY__' && !isVanDonSemanticEmpty(v));
                                vals = [...new Set([...(vals || []), ...more])];
                            } else {
                                // Fallback: đọc trực tiếp từ orders nếu RPC không khả dụng
                                const { data: dataOrdersTbl, error: errTbl } = await supabase
                                    .from('orders')
                                    .select('country')
                                    .not('country', 'is', null)
                                    .neq('country', '')
                                    .limit(10000);
                                if (!errTbl) {
                                    const moreTbl = (dataOrdersTbl || [])
                                        .map((row) => (row && row.country != null ? String(row.country).trim() : ''))
                                        .filter(Boolean)
                                        .filter((v) => v !== '__EMPTY__' && !isVanDonSemanticEmpty(v));
                                    vals = [...new Set([...(vals || []), ...moreTbl])];
                                }
                            }
                        } catch (mergeErr) {
                            console.warn('[fetchVanDonDistinctFilterOptions] merge country from orders failed:', mergeErr);
                        }
                    }

                    // HCM: bổ sung danh mục sản phẩm từ bảng báo cáo MKT `marketing_report_hcm` (cột 'Sản_phẩm')
                    if (sourceTable !== 'orders' && dbCol === 'product') {
                        try {
                            let mktData = [];
                            let from = 0;
                            const pageSize = 1000;
                            const limit = 20000;

                            while (mktData.length < limit) {
                                const to = Math.min(from + pageSize - 1, limit - 1);
                                const { data: batch, error: mktErr } = await supabase
                                    .from('marketing_report_hcm')
                                    .select('Sản_phẩm')
                                    .not('Sản_phẩm', 'is', null)
                                    .neq('Sản_phẩm', '')
                                    .range(from, to);
                                
                                if (mktErr) throw mktErr;
                                if (!batch || batch.length === 0) break;
                                
                                mktData = mktData.concat(batch);
                                if (batch.length < pageSize) break;
                                from += pageSize;
                            }

                            if (mktData.length > 0) {
                                const moreProducts = mktData
                                    .map((row) => (row && row['Sản_phẩm'] != null ? String(row['Sản_phẩm']).trim() : ''))
                                    .filter(Boolean)
                                    .filter((v) => v !== '__EMPTY__' && !isVanDonSemanticEmpty(v));
                                vals = [...new Set([...(vals || []), ...moreProducts])];
                            }
                        } catch (mergeErr) {
                            console.warn('[fetchVanDonDistinctFilterOptions] merge product from marketing_report_hcm failed:', mergeErr);
                        }
                    }
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
const FFM_PUSH_LOGS_TABLE_ALLOWLIST = new Set(['ffm_push_logs', 'ffm_push_logs_hcm']);

function resolveFfmPushLogsTable(logsTable) {
    const t = logsTable && String(logsTable).trim() !== '' ? String(logsTable).trim() : 'ffm_push_logs';
    if (!FFM_PUSH_LOGS_TABLE_ALLOWLIST.has(t)) {
        throw new Error(`Invalid ffm push logs table: ${t}`);
    }
    return t;
}

/**
 * Ghi log chuẩn bị đẩy FFM.
 * @param {Array<string | { orderId: string, product?: string | null, country?: string | null, chi_nhanh?: string | null, total_amount_vnd?: number | null }>} orderIdsOrEntries — mã đơn hoặc object có snapshot từ lưới vận đơn
 * @param {{ logsTable?: 'ffm_push_logs' | 'ffm_push_logs_hcm' }} [opts] — `/van-don-hcm` dùng `ffm_push_logs_hcm`
 */
export const createFfmPushLogs = async (orderIdsOrEntries, carrier, pushedBy, opts = {}) => {
    try {
        const table = resolveFfmPushLogsTable(opts.logsTable);
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

        const { data, error } = await supabase.from(table).insert(rows).select();

        if (error) throw error;
        return { batchId, logs: data };
    } catch (err) {
        console.error('Error creating FfmPushLogs:', err);
        throw err;
    }
};

const FFM_SYNC_ORDERS_TABLE_ALLOWLIST = new Set(['orders', 'order_code_hcm']);

function resolveFfmSyncOrdersTable(ordersTable) {
    const t = ordersTable && String(ordersTable).trim() !== '' ? String(ordersTable).trim() : 'orders';
    if (!FFM_SYNC_ORDERS_TABLE_ALLOWLIST.has(t)) {
        throw new Error(`Invalid ffm sync orders table: ${t}`);
    }
    return t;
}

/** Đọc toàn bộ `ffm_push_logs` hoặc `ffm_push_logs_hcm` (đối soát đẩy FFM). */
export const fetchFfmPushLogsForReconciliation = async ({ logsTable } = {}) => {
    const table = resolveFfmPushLogsTable(logsTable);
    
    let allRows = [];
    const pageSize = 1000;
    let from = 0;

    console.log(`[fetchFfmPushLogsForReconciliation] Fetching all logs from ${table}...`);

    try {
        while (true) {
            const to = from + pageSize - 1;
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .order('id', { ascending: false })
                .range(from, to);

            if (error) throw error;
            if (!data || data.length === 0) break;

            allRows = allRows.concat(data);
            if (data.length < pageSize) break;
            from += pageSize;
        }

        console.log(`[fetchFfmPushLogsForReconciliation] Loaded ${allRows.length} rows.`);

        const time = (r) => {
            const t = r?.pushed_at ?? r?.created_at ?? r?.inserted_at ?? r?.updated_at ?? null;
            if (t) return new Date(t).getTime();
            return 0;
        };
        // Re-sort client side just in case timestamps are cleaner than IDs for recent orders
        allRows.sort((a, b) => time(b) - time(a));
        return allRows;
    } catch (error) {
        console.error('fetchFfmPushLogsForReconciliation:', error);
        throw error;
    }
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
 * Điền product, country, chi_nhanh, total_amount_vnd trên ffm_push_logs (hoặc _hcm) từ orders / order_code_hcm.
 * Chỉ ghi các ô đang trống / total_amount_vnd null; không ghi đè dữ liệu đã có.
 * @param {{ scanLimit?: number, logsTable?: 'ffm_push_logs' | 'ffm_push_logs_hcm', ordersTable?: 'orders' | 'order_code_hcm' }} [opts]
 */
export const syncFfmPushLogsFromOrders = async ({
    scanLimit = 15000,
    logsTable,
    ordersTable,
} = {}) => {
    const logsTbl = resolveFfmPushLogsTable(logsTable);
    const ordersTbl = resolveFfmSyncOrdersTable(ordersTable);

    let allLogs = [];
    const pageSize = 1000;
    let from = 0;

    console.log(`[syncFfmPushLogsFromOrders] Scanning logs from ${logsTbl} (limit=${scanLimit})...`);

    while (allLogs.length < scanLimit) {
        const to = Math.min(from + pageSize - 1, scanLimit - 1);
        const { data: logs, error: logErr } = await supabase
            .from(logsTbl)
            .select('id, order_code, product, country, chi_nhanh, total_amount_vnd')
            .not('order_code', 'is', null)
            .order('id', { ascending: false })
            .range(from, to);

        if (logErr) throw logErr;
        if (!logs || logs.length === 0) break;

        allLogs = allLogs.concat(logs);
        if (logs.length < pageSize) break;
        from += pageSize;
    }

    const rows = allLogs;
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
            .from(ordersTbl)
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
                supabase.from(logsTbl).update(patch).eq('id', id).then(({ error }) => ({ error }))
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
export const updateFfmPushLogStatus = async (batchId, status, opts = {}) => {
    try {
        const table = resolveFfmPushLogsTable(opts.logsTable);
        const payload = { status };
        if (status === 'confirmed') {
            payload.pushed_at = new Date().toISOString();
        }
        const { error } = await supabase.from(table).update(payload).eq('batch_id', batchId);

        if (error) throw error;
    } catch (err) {
        console.error('Error updating FfmPushLogStatus:', err);
        throw err;
    }
};
