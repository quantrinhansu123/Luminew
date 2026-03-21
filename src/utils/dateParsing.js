export const parseSmartDate = (dateString) => {
    if (!dateString) return null;

    // Convert to string just in case
    const str = String(dateString).trim();
    if (!str) return null;

    // Check YYYY-MM-DD (ISO) - Parse as LOCAL time components to avoid UTC shifts
    // e.g. "2023-10-25" -> new Date(2023, 9, 25) -> Midnight Local
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
        const year = parseInt(isoMatch[1], 10);
        const month = parseInt(isoMatch[2], 10) - 1;
        const day = parseInt(isoMatch[3], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) return d;
    }

    // Check DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10) - 1;
        const year = parseInt(dmyMatch[3], 10);

        const temp = new Date(year, month, day);
        if (
            temp.getFullYear() === year &&
            temp.getMonth() === month &&
            temp.getDate() === day
        ) {
            return temp;
        }
    }

    // Fallback to normal Date parse (for other formats like ISO with time)
    const fallback = new Date(str);
    if (!isNaN(fallback.getTime())) return fallback;

    return null;
};

export const isDateInRange = (dateVal, startDateStr, endDateStr) => {
    const date = parseSmartDate(dateVal);
    if (!date) return false;

    // Use midnight comparison
    date.setHours(0, 0, 0, 0);

    if (startDateStr) {
        const start = parseSmartDate(startDateStr);
        if (start) {
            start.setHours(0, 0, 0, 0);
            if (date < start) return false;
        }
    }

    if (endDateStr) {
        const end = parseSmartDate(endDateStr);
        if (end) {
            end.setHours(0, 0, 0, 0);
            if (date > end) return false;
        }
    }

    return true;
};

/**
 * Biên đầu/cuối ngày (theo giờ trình duyệt) → ISO cho filter created_at (timestamptz).
 * Dùng khi order_date trống nhưng đơn vẫn thuộc khoảng ngày nhờ created_at — tránh tháng sau không có dữ liệu dù UI vẫn hiện ngày.
 */
export function orderRangeToCreatedAtIsoBounds(startDate, endDate) {
    if (!startDate || !endDate) return { start: null, end: null };
    const [ys, ms, ds] = startDate.split('-').map(Number);
    const [ye, me, de] = endDate.split('-').map(Number);
    const start = new Date(ys, ms - 1, ds, 0, 0, 0, 0);
    const end = new Date(ye, me - 1, de, 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
}

export function mergeUniqueRowsById(rowsA, rowsB) {
    const map = new Map();
    for (const row of [...(rowsA || []), ...(rowsB || [])]) {
        if (row && row.id != null) map.set(row.id, row);
    }
    return [...map.values()];
}

/** Giảm dần theo ngày “hiển thị”: order_date nếu có, không thì created_at */
export function sortOrdersByDisplayDateDesc(rows) {
    const key = (row) => {
        const od = row.order_date;
        if (od != null && String(od).trim() !== '') return String(od).slice(0, 10);
        return row.created_at ? String(row.created_at) : '';
    };
    return [...rows].sort((a, b) => key(b).localeCompare(key(a)));
}
