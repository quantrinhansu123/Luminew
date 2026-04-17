/**
 * Nhật ký đơn (cột orders.log) — JSONB mảng bản ghi thay đổi.
 * Mỗi phần tử: thoi_gian, nhan_vien, cot, cot_db?, gia_tri_cu, gia_tri_moi
 */

export const ORDER_LOG_TRACKED_DB_KEYS = [
    "check_result",
    "delivery_status_nb",
    "payment_status",
    "tracking_code",
    "delivery_staff",
];

const ORDER_LOG_LABELS = {
    check_result: "Kết quả Check",
    delivery_status_nb: "Trạng thái giao hàng NB",
    payment_status: "Trạng thái thu tiền",
    tracking_code: "Mã Tracking",
    delivery_staff: "Nhân viên vận đơn",
};

export function labelForOrderLogDbKey(dbKey) {
    return ORDER_LOG_LABELS[dbKey] || dbKey;
}

/** Các cột tiền/tổng: null, NaN, rỗng và 0 coi như một khi so sánh nhật ký (tránh spam NaN→0 lặp). */
const ORDER_LOG_MONEY_EMPTY_EQUIV_KEYS = new Set(["total_amount_vnd"]);
const SHIFT_GIUA_CA_HET_CA = "Giữa ca,Hết ca";

function moneyEmptyEquivalentToken(v) {
    if (v === undefined || v === null || v === "") return "_empty";
    if (typeof v === "number" && !Number.isFinite(v)) return "_empty";
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(n) || n === 0) return "_empty";
    return `_${n}`;
}

function trackedFieldEqualForLog(key, oldV, newV) {
    if (ORDER_LOG_MONEY_EMPTY_EQUIV_KEYS.has(key)) {
        return moneyEmptyEquivalentToken(oldV) === moneyEmptyEquivalentToken(newV);
    }
    return valuesEqualForOrderLog(oldV, newV);
}

/** Chỉ các cột đang theo dõi nhật ký từ một hàng orders (DB). */
export function pickTrackedFieldsFromOrderRow(row) {
    if (!row || typeof row !== "object") return {};
    const o = {};
    for (const k of ORDER_LOG_TRACKED_DB_KEYS) {
        if (k === "payment_currency") {
            const v = row.payment_currency ?? row.paymentCurrency ?? row.payment_type;
            if (v !== undefined) o[k] = v;
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(row, k)) o[k] = row[k];
    }
    return o;
}

/** Chỉ các key nhật ký có trong payload (sau strip). */
export function pickTrackedFieldsFromPayload(payload) {
    if (!payload || typeof payload !== "object") return {};
    const o = {};
    for (const k of ORDER_LOG_TRACKED_DB_KEYS) {
        if (Object.prototype.hasOwnProperty.call(payload, k)) o[k] = payload[k];
    }
    return o;
}

/**
 * Payload theo dõi nhật ký từ form Nhập đơn (khớp mapping khi Lưu).
 * `orderDateValue` + `calculatedShift` do caller tính (cùng logic parse ngày/ca).
 */
export function buildTrackedFieldsPayloadForLog({
    formData,
    selectedPage,
    selectedMkt,
    selectedSale,
    hasRndPermission,
    foundBranchCache,
    orderDateValue,
    calculatedShift,
    isEdit,
}) {
    const raw = {
        order_date: orderDateValue,
        tracking_code: formData.tracking_code,
        customer_name: formData["ten-kh"],
        customer_phone: formData["phone"],
        customer_address: formData["add"],
        city: formData.city,
        state: formData.state,
        zipcode: formData.zipcode,
        country: formData.country,
        product: formData.productMain,
        product_name_1: formData.mathang1,
        quantity_1: parseFloat(formData.sl1) || 0,
        product_name_2: formData.mathang2,
        quantity_2: parseFloat(formData.sl2) || 0,
        gift: formData.quatang,
        gift_quantity: parseFloat(formData.slq) || 0,
        sale_price: parseFloat(formData.sale_price) || 0,
        payment_currency: formData.paymentType,
        exchange_rate: parseFloat(formData.exchange_rate) || 1,
        total_amount_vnd: (() => {
            const n = parseFloat(formData["tong-tien"]);
            return Number.isFinite(n) ? n : 0;
        })(),
        payment_method_text: formData["hinh-thuc"],
        shipping_fee: formData.shipping_fee === "" ? null : parseFloat(formData.shipping_fee),
        shipping_cost: parseFloat(formData.shipping_cost) || 0,
        base_price: parseFloat(formData.base_price) || 0,
        reconciled_vnd: parseFloat(formData.reconciled_vnd) || 0,
        page_name: selectedPage,
        marketing_staff: selectedMkt,
        sale_staff: selectedSale,
        shift: calculatedShift || (isEdit ? undefined : SHIFT_GIUA_CA_HET_CA),
        team: hasRndPermission
            ? "RD"
            : foundBranchCache && String(foundBranchCache).trim()
              ? String(foundBranchCache).trim()
              : formData.team && String(formData.team).trim()
                ? String(formData.team).trim()
                : undefined,
        note: formData["note_sale"] || "",
    };
    const stripped = { ...raw };
    Object.keys(stripped).forEach((key) => {
        if (stripped[key] === undefined || stripped[key] === null) delete stripped[key];
    });
    return stripped;
}

/**
 * So sánh baseline → current (một lần thay đổi), dùng cho auto-log và phần cuối khi Lưu.
 */
export function buildOrderLogDiffEntries({ baseline, current, actor }) {
    const ts = new Date().toISOString();
    const nhan_vien = String(actor || "").trim() || "hệ thống";
    const snap = baseline && typeof baseline === "object" ? baseline : {};
    const cur = current && typeof current === "object" ? current : {};
    const entries = [];

    for (const key of ORDER_LOG_TRACKED_DB_KEYS) {
        const oldV = snap[key];
        const newV = Object.prototype.hasOwnProperty.call(cur, key) ? cur[key] : oldV;
        if (!trackedFieldEqualForLog(key, oldV, newV)) {
            entries.push({
                thoi_gian: ts,
                nhan_vien,
                cot: labelForOrderLogDbKey(key),
                cot_db: key,
                gia_tri_cu: isEmptyLogScalar(oldV) ? null : formatOrderLogValue(oldV),
                gia_tri_moi: isEmptyLogScalar(newV) ? null : formatOrderLogValue(newV),
            });
        }
    }
    return entries;
}

function isEmptyLogScalar(v) {
    if (v === undefined || v === null) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (typeof v === "number" && Number.isNaN(v)) return true;
    return false;
}

/** Chuỗi hiển thị một giá trị trong log (và so sánh ổn định). */
export function formatOrderLogValue(v) {
    if (v === undefined || v === null) return "";
    if (typeof v === "number") {
        if (!Number.isFinite(v)) return "";
        if (Number.isInteger(v)) return String(v);
        const t = String(v);
        return /e/i.test(t) ? t : String(Number(v.toFixed(6)).replace(/\.?0+$/, ""));
    }
    if (typeof v === "boolean") return v ? "true" : "false";
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object") {
        try {
            return JSON.stringify(v);
        } catch {
            return String(v);
        }
    }
    return String(v);
}

function normalizeLogCompare(v) {
    return formatOrderLogValue(v);
}

export function valuesEqualForOrderLog(a, b) {
    return normalizeLogCompare(a) === normalizeLogCompare(b);
}

/** Parse DB / API về mảng bản ghi (an toàn). */
export function parseOrderLogJsonb(raw) {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === "object");
    if (typeof raw === "string") {
        const t = raw.trim();
        if (!t) return [];
        try {
            const p = JSON.parse(t);
            return Array.isArray(p) ? p.filter((x) => x && typeof x === "object") : [];
        } catch {
            return [];
        }
    }
    if (typeof raw === "object") return [];
    return [];
}

/**
 * Ghép log cũ + bản ghi mới (mỗi lần lưu một loạt thay đổi cùng thời điểm).
 * Bỏ qua dòng mới nếu trùng hệt dòng cuối (cot_db + giá trị) — tránh lặp do race / lưu kép.
 */
export function mergeOrderLogJsonb(existingRaw, newEntries) {
    const prev = parseOrderLogJsonb(existingRaw);
    const next = Array.isArray(newEntries) ? newEntries.filter((x) => x && typeof x === "object") : [];
    const out = [...prev];
    for (const e of next) {
        const last = out[out.length - 1];
        if (
            last &&
            last.cot_db === e.cot_db &&
            last.gia_tri_cu === e.gia_tri_cu &&
            last.gia_tri_moi === e.gia_tri_moi
        ) {
            continue;
        }
        out.push(e);
    }
    return out;
}

/**
 * Sinh bản ghi cho một lần lưu (tạo mới hoặc sửa).
 * @param {object} opts
 * @param {boolean} opts.isEdit
 * @param {object|null} opts.snapshot — hàng orders trước khi sửa
 * @param {object} opts.strippedPayload — payload đã bỏ undefined/null (chỉ field thực sự ghi DB)
 * @param {string} opts.actor — tên/email nhân viên
 * @param {string} [opts.orderCode] — khi tạo mới, dùng nếu không có dòng thay đổi nào
 */
export function buildOrderLogEntriesForSave({ isEdit, snapshot, strippedPayload, actor, orderCode }) {
    if (isEdit && snapshot) {
        return buildOrderLogDiffEntries({ baseline: snapshot, current: strippedPayload, actor });
    }

    const ts = new Date().toISOString();
    const nhan_vien = String(actor || "").trim() || "hệ thống";
    const entries = [];

    for (const key of ORDER_LOG_TRACKED_DB_KEYS) {
        const cot = labelForOrderLogDbKey(key);
        if (!Object.prototype.hasOwnProperty.call(strippedPayload, key)) continue;
        const newV = strippedPayload[key];
        if (isEmptyLogScalar(newV)) continue;
        entries.push({
            thoi_gian: ts,
            nhan_vien,
            cot,
            cot_db: key,
            gia_tri_cu: null,
            gia_tri_moi: formatOrderLogValue(newV),
        });
    }

    if (!isEdit && entries.length === 0 && orderCode) {
        entries.push({
            thoi_gian: ts,
            nhan_vien,
            cot: "Tạo đơn",
            cot_db: "order_code",
            gia_tri_cu: null,
            gia_tri_moi: String(orderCode),
        });
    }

    return entries;
}

/** Hiển thị trong grid / textarea (đa dòng). */
export function formatOrderLogJsonbForDisplay(raw) {
    const arr = parseOrderLogJsonb(raw);
    if (arr.length === 0) return "";
    return arr
        .map((row) => {
            const t = row.thoi_gian != null ? String(row.thoi_gian) : "";
            const nv = row.nhan_vien != null ? String(row.nhan_vien) : "";
            const cot = row.cot != null ? String(row.cot) : row.cot_db || "";
            const cu = row.gia_tri_cu != null && row.gia_tri_cu !== "" ? String(row.gia_tri_cu) : "∅";
            const moi = row.gia_tri_moi != null && row.gia_tri_moi !== "" ? String(row.gia_tri_moi) : "∅";
            return `[${t}] ${nv} | ${cot}: "${cu}" → "${moi}"`;
        })
        .join("\n");
}
