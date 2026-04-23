import { DROPDOWN_OPTIONS } from '../types';

/** Chuẩn hóa để so khớp nhãn (ẩn lựa chọn không phân biệt hoa/thường, dấu). */
function ffmGridDeliveryStatusNormKey(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  try {
    return t.normalize('NFC').toLocaleLowerCase('vi');
  } catch {
    return t.toLowerCase();
  }
}

/**
 * Các trạng thái không hiển thị trong `<select>` ô «Trạng thái giao hàng» trên lưới FFM
 * (vẫn xuất hiện nếu đúng là giá trị đang có của ô — xem `ffmGridDeliveryStatusSelectOptions`).
 */
const FFM_GRID_DELIVERY_STATUS_HIDDEN = new Set(
  [
    'Đang Giao',
    'Chưa Giao',
    'Hủy',
    'chờ check',
    'chở check',
    'Giao không thành công',
    'Bom_Thất Lạc',
    'Giao Thành Công',
    'Giao hàng thành công',
  ].map(ffmGridDeliveryStatusNormKey)
);

function isFfmGridDeliveryStatusHiddenOption(val) {
  const k = ffmGridDeliveryStatusNormKey(val);
  if (!k) return false;
  return FFM_GRID_DELIVERY_STATUS_HIDDEN.has(k);
}

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

/**
 * `<select>` trong ô lưới «Trạng thái giao hàng»: preset (có ô trống) + mọi giá trị trong tập đã tải + đảm bảo `currentVal`.
 */
export function ffmGridDeliveryStatusSelectOptions(enrichedRows, currentVal) {
  const preset = DROPDOWN_OPTIONS['Trạng thái giao hàng'] || [];
  const fromData = new Set();
  for (const row of enrichedRows || []) {
    const v = getFfmOrderMgmtDeliveryStatusForRow(row);
    if (v) fromData.add(v);
  }
  const ordered = [];
  const seen = new Set();
  const add = (p) => {
    if (p === undefined) return;
    const key = p === '' ? '__empty__' : String(p);
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(p);
  };
  for (const p of preset) {
    if (!isFfmGridDeliveryStatusHiddenOption(p)) add(p);
  }
  const extras = [...fromData].filter((v) => {
    const k = v === '' ? '__empty__' : String(v);
    return !seen.has(k) && !isFfmGridDeliveryStatusHiddenOption(v);
  });
  extras.sort((a, b) => String(a).localeCompare(String(b), 'vi'));
  for (const v of extras) add(v);
  add(currentVal == null ? '' : currentVal);
  return ordered;
}
