/**
 * Chuẩn hóa chuỗi lọc /van-don: NFC, NBSP & khoảng unicode → space, trim.
 * Tránh lệch với dữ liệu DB/UI có dấu cách đặc biệt.
 */
export function normalizeVanDonFilterWhitespace(s) {
    return String(s ?? '')
        .normalize('NFC')
        .replace(/\u00a0/g, ' ')
        .replace(/[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/g, ' ')
        .trim();
}

/** Escape ký tự đặc biệt của PostgreSQL ILIKE. */
export function escapeIlikePattern(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Pattern ILIKE kiểu «chứa», cho phép mọi lượng khoảng trắng giữa các từ
 * (user gõ 1 space, DB có NBSP hoặc 2 space vẫn khớp).
 */
export function buildVanDonFlexibleIlikePattern(raw) {
    const norm = normalizeVanDonFilterWhitespace(raw);
    if (!norm) return null;
    if (!/\s/.test(norm)) {
        return `%${escapeIlikePattern(norm)}%`;
    }
    const parts = norm.split(/\s+/).filter(Boolean).map((p) => escapeIlikePattern(p));
    return `%${parts.join('%')}%`;
}

/**
 * Lọc header cột (client-side): khớp chuỗi con, bỏ qua khác biệt NBSP / nhiều space giữa các từ.
 */
/**
 * Một nhánh `col.ilike...` cho `.or()` — dropdown: 1 từ khớp cả cột (không %),
 * nhiều từ dùng % giữa các từ để bỏ qua khoảng trắng lệch.
 */
export function buildVanDonDropdownIlikeOrSegment(field, raw) {
    const norm = normalizeVanDonFilterWhitespace(String(raw));
    if (!norm) return null;
    if (!/\s/.test(norm)) {
        return `${field}.ilike.${escapeIlikePattern(norm)}`;
    }
    const flex = buildVanDonFlexibleIlikePattern(norm);
    return flex ? `${field}.ilike.${flex}` : null;
}

export function matchesVanDonHeaderSearch(cellValue, searchRaw) {
    const q = normalizeVanDonFilterWhitespace(searchRaw).toLowerCase();
    if (!q) return true;
    const cell = normalizeVanDonFilterWhitespace(cellValue).toLowerCase();
    if (!cell) return false;
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) return cell.includes(q);
    let pos = 0;
    for (const t of tokens) {
        const idx = cell.indexOf(t, pos);
        if (idx < 0) return false;
        pos = idx + t.length;
    }
    return true;
}
