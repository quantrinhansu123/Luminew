import { DROPDOWN_OPTIONS } from '../types';

/**
 * Giá trị «Trạng thái giao hàng» (FFM order management) dùng cho lọc — khớp ô trên lưới.
 * mapSupabaseOrderToApp ghi cả `delivery_status` và «Trạng thái giao hàng»; một số dòng có thể chỉ đủ một khóa.
 */
export function getFfmOrderMgmtDeliveryStatusForRow(row) {
  if (!row || typeof row !== 'object') return '';
  const v = row.delivery_status ?? row['Trạng thái giao hàng'] ?? '';
  return String(v ?? '').trim();
}

/** So khớp lọc dropdown / MultiSelect (tránh lệch NHẬN vs Nhận, v.v.). */
export function ffmOrderMgmtDeliveryStatusesMatch(cellVal, filterVal) {
  const a = String(cellVal ?? '').trim();
  const b = String(filterVal ?? '').trim();
  if (a === b) return true;
  try {
    return (
      a.normalize('NFC').toLocaleLowerCase('vi') === b.normalize('NFC').toLocaleLowerCase('vi')
    );
  } catch {
    return a.toLowerCase() === b.toLowerCase();
  }
}

/**
 * Dropdown lọc tiêu đề cột: preset chuẩn + mọi giá trị đang có trong dữ liệu (đúng chuỗi, vd. NHẬN).
 * `rows` nên là `ffmEnrichedRowsForFilter` (đã trộn pending) để khớp ô trên lưới.
 */
export function getFfmDeliveryStatusFilterDropdownOptions(rows) {
  const preset = (DROPDOWN_OPTIONS['Trạng thái giao hàng'] || []).filter(
    (o) => o != null && String(o).trim() !== ''
  );
  const fromData = new Set();
  for (const row of rows || []) {
    const v = getFfmOrderMgmtDeliveryStatusForRow(row);
    if (v) fromData.add(v);
  }
  const ordered = [];
  const seen = new Set();
  for (const p of preset) {
    if (!seen.has(p)) {
      seen.add(p);
      ordered.push(p);
    }
  }
  const extras = [...fromData].filter((v) => !seen.has(v));
  extras.sort((a, b) => String(a).localeCompare(String(b), 'vi'));
  return [...ordered, ...extras];
}
