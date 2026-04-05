/**
 * Phân biệt id do người dùng/ghi tay (import SQL, serial…) với id do hệ thống gán (UUID, tiền tố sale_ từ recalc).
 * Dùng cho nút xóa trùng: ưu tiên giữ dòng có id “tay”, chỉ gỡ dòng hệ thống khi trùng khóa nghiệp vụ.
 */
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_COMPACT_RE = /^[0-9a-f]{32}$/i;

export function isSalesReportUserSuppliedRowId(id) {
    if (id === null || id === undefined) return false;
    if (typeof id === 'bigint') return true;
    if (typeof id === 'number' && Number.isFinite(id) && Number.isInteger(id)) return true;
    const s = String(id).trim();
    if (!s) return false;
    if (/^sale_/i.test(s)) return false;
    if (UUID_RE.test(s) || UUID_COMPACT_RE.test(s)) return false;
    if (/^\d+$/.test(s)) return true;
    return false;
}
